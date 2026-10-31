import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBinanceSocketStatus,
  subscribeBinanceKlines,
  subscribeBinanceStatus,
  type BinanceKlineUpdate,
} from "@/lib/realtime";
import {
  type Candle,
  type MarketError,
  detectGaps,
  findSymbol,
  fetchKlines,
  getTimeframe,
  normalizeSymbol,
  resolveProviderSymbol,
  sanitizeCandles,
  type TimeframeId,
} from "@/lib/market";
import { computeFreshness, type FeedFreshness } from "@/lib/feed-status";

export type KlineStatus =
  | "CONNECTING"
  | "LIVE"
  | "STALE"
  | "RECONNECTING"
  | "RESYNCING"
  | "ERROR";

/** Spec-compliant freshness label — Trade AI must only run when LIVE. */
export type DataFreshness = FeedFreshness;

export interface KlinesState {
  candles: Candle[];
  /** null = no real feed available right now. */
  source: "binance" | "twelvedata" | null;
  /** Exact provider symbol actually requested (e.g. "BTCUSDT" on Binance). */
  providerSymbol: string | null;
  status: KlineStatus;
  error: string | null;
  errorCode: MarketError["code"] | null;
  latencyMs: number | null;
  updatedAt: number | null;
  /** Age of the newest candle data in seconds (null while connecting). */
  ageSeconds: number | null;
  /** Honest freshness derived from provider update cadence. */
  freshness: DataFreshness;
  /** True when a timeframe bucket is missing from the tape. */
  gap: boolean;
  /** How many expected candle buckets are missing (gap detection). */
  missingCandles: number;
  candleCount: number;
  /** Re-request history + reconnect the stream (used by the RETRY button). */
  retry: () => void;
}

const POLL_MS = 45_000;
const REFRESH_MS = 4 * 60_000;

/* ---------------------------------------------------------------------------
   Structured pipeline logging (§1) — temporary developer diagnostics. Logs
   symbol / provider symbol / timeframe / status / counts / first-last candle
   / error code. Never logs API keys or tokens.
   ------------------------------------------------------------------------- */
function logPipeline(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  // eslint-disable-next-line no-console
  console.debug(`[market-data] ${event}`, fields);
}

/**
 * Live kline stream for one symbol/timeframe.
 *
 * Honest by construction:
 *   - crypto  → real Binance history (browser REST first, then the
 *     server-side Binance proxy when the sandbox blocks direct calls) +
 *     real `@kline` WebSocket updates
 *   - others  → real Twelve Data candles via the backend (polled)
 *   - no provider data → `status: "ERROR"`, empty candles, an error code +
 *     human-readable message. NO synthetic candles are ever generated.
 *
 * Realtime hygiene: the current candle is updated in place (never appended
 * twice), late/out-of-order frames are ignored, reconnects trigger a
 * RESYNCING phase that refetches history, and `freshness` never claims LIVE
 * when the feed has gone silent. RETRY re-runs the whole sequence with
 * exponential backoff on repeated failures.
 */
export function useKlines(symbolId: string, intervalId: TimeframeId): KlinesState {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<"binance" | "twelvedata" | null>(null);
  const [providerSymbol, setProviderSymbol] = useState<string | null>(null);
  const [status, setStatus] = useState<KlineStatus>("CONNECTING");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<MarketError["code"] | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [retryKey, setRetryKey] = useState(0);
  const lastKlineAtRef = useRef(0);
  const candlesRef = useRef<Candle[]>(candles);
  const erroredRef = useRef(false);
  const resyncingRef = useRef(false);
  const statusRef = useRef<KlineStatus>("CONNECTING");
  const attemptRef = useRef(0);
  const klinesAction = useAction(api.market.klines);
  const binanceAction = useAction(api.market.binanceKlines);
  const sym = useMemo(() => findSymbol(symbolId), [symbolId]);
  const tf = useMemo(() => getTimeframe(intervalId), [intervalId]);
  candlesRef.current = candles;

  const retry = useCallback(() => {
    attemptRef.current = 0;
    setRetryKey((k) => k + 1);
  }, []);

  /* ticking clock so age / freshness stay honest without new market data */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const { gap, missing: missingCandles } = useMemo(
    () => detectGaps(candles, tf.ms),
    [candles, tf.ms],
  );

  const ageSeconds =
    updatedAt == null ? null : Math.max(0, Math.round((now - updatedAt) / 1000));

  /* Provider-aware freshness thresholds — Binance WS updates on every trade,
     Twelve Data is polled every 45s. The mapping lives in lib/feed-status so
     it is unit-tested: STALE / ERROR / RECONNECTING can never read as LIVE. */
  const freshness: DataFreshness = useMemo(
    () => computeFreshness(status, updatedAt, now, source),
    [status, updatedAt, now, source],
  );

  useEffect(() => {
    const canonical = normalizeSymbol(symbolId);
    const resolved = findSymbol(canonical);
    if (!resolved || resolved.id !== canonical) {
      setCandles([]);
      setSource(null);
      setProviderSymbol(null);
      setStatus("ERROR");
      setErrorCode("SYMBOL_NOT_SUPPORTED");
      setError(`SYMBOL_NOT_SUPPORTED — "${symbolId}" is not in the market catalog.`);
      return;
    }

    let cancelled = false;
    lastKlineAtRef.current = 0;
    erroredRef.current = false;
    resyncingRef.current = false;
    statusRef.current = "CONNECTING";
    setCandles([]);
    setSource(null);
    setProviderSymbol(null);
    setStatus("CONNECTING");
    setError(null);
    setErrorCode(null);
    setLatencyMs(null);
    setUpdatedAt(null);

    let unsubKline: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;
    let staleTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const setStatusSafe = (s: KlineStatus) => {
      statusRef.current = s;
      setStatus(s);
    };

    const applyHistory = (clean: Candle[], src: "binance" | "twelvedata", provSymbol: string) => {
      if (cancelled || clean.length === 0) return;
      erroredRef.current = false;
      attemptRef.current = 0;
      setCandles(clean);
      setSource(src);
      setProviderSymbol(provSymbol);
      setUpdatedAt(Date.now());
      setError(null);
      setErrorCode(null);
      if (resyncingRef.current) {
        resyncingRef.current = false;
        setStatusSafe("LIVE");
      } else if (lastKlineAtRef.current === 0) {
        setStatusSafe("CONNECTING");
      } else {
        setStatusSafe("LIVE");
      }
      logPipeline("history.ok", {
        symbol: canonical,
        providerSymbol: provSymbol,
        source: src,
        timeframe: intervalId,
        candleCount: clean.length,
        firstTime: clean[0]?.time,
        lastTime: clean[clean.length - 1]?.time,
        lastClose: clean[clean.length - 1]?.close,
      });
    };

    const markError = (err: MarketError) => {
      if (cancelled) return;
      erroredRef.current = true;
      setSource(null);
      setProviderSymbol(null);
      setStatusSafe("ERROR");
      setErrorCode(err.code);
      setError(`${err.code} — ${err.message}`);
      logPipeline("history.error", {
        symbol: canonical,
        timeframe: intervalId,
        code: err.code,
        message: err.message,
      });
      /* automatic retry with exponential backoff — bounded, never infinite */
      attemptRef.current += 1;
      if (attemptRef.current <= 4) {
        const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);
        retryTimer = setTimeout(() => {
          if (!cancelled) setRetryKey((k) => k + 1);
        }, delay);
      }
    };

    const markStale = () => {
      if (cancelled || erroredRef.current) return;
      const threshold = Math.max(30_000, tf.ms * 3);
      const silent = Date.now() - lastKlineAtRef.current > threshold;
      if (silent) {
        setStatusSafe("STALE");
        setLatencyMs(threshold);
      }
    };

    const applyKline = (k: BinanceKlineUpdate) => {
      if (cancelled) return;
      lastKlineAtRef.current = Date.now();
      resyncingRef.current = false;
      setLatencyMs(Math.max(0, Date.now() - k.receivedAt));
      setUpdatedAt(Date.now());
      setStatusSafe("LIVE");
      setCandles((prev) => {
        if (prev.length === 0) {
          return sanitizeCandles([klineToCandle(k)]);
        }
        const last = prev[prev.length - 1];
        if (k.time === last.time) {
          /* same forming candle — update in place, never duplicate */
          const next = [...prev];
          next[next.length - 1] = klineToCandle(k);
          return next;
        }
        if (k.time > last.time) {
          /* a new candle began (previous one closed) */
          return sanitizeCandles([...prev, klineToCandle(k)]);
        }
        /* out-of-order / late frame — ignore, never move the tape backwards */
        return prev;
      });
    };

    if (resolved.binance) {
      /* ---- crypto: Binance history (browser REST → server proxy) + WS ---- */
      const load = async () => {
        /* 1. try the browser → Binance REST request */
        let result = await fetchKlines(resolved.binance!, tf.ms, 300);
        if (!result.ok) {
          /* 2. sandbox/CORS blocked — fall back to the server-side proxy
                (same provider, same exact symbol, server-side fetch) */
          const proxied = await binanceAction({
            symbolId: canonical,
            timeframeId: intervalId,
            limit: 300,
          });
          if (proxied?.ok && proxied.candles.length > 0) {
            result = {
              ok: true,
              symbol: canonical,
              providerSymbol: proxied.providerSymbol,
              timeframe: intervalId,
              source: "binance",
              serverTime: proxied.serverTime,
              candles: proxied.candles,
            };
          } else {
            result = (proxied ?? result) as typeof result;
          }
        }
        if (cancelled) return;
        const clean = result.ok ? sanitizeCandles(result.candles) : [];
        if (clean.length > 0) {
          applyHistory(clean, "binance", result.providerSymbol);
        } else if (candlesRef.current.length === 0) {
          markError(
            result.error ?? {
              code: "EMPTY_RESPONSE",
              message: "Historical candles unavailable from Binance (direct + proxy).",
            },
          );
        }
      };

      const attachSocket = (binanceSymbol: string) => {
        unsubKline = subscribeBinanceKlines(binanceSymbol, applyKline);
        unsubStatus = subscribeBinanceStatus((s) => {
          if (cancelled) return;
          if (s === "reconnecting") {
            setStatusSafe("RECONNECTING");
          } else if (s === "open") {
            if (statusRef.current === "RECONNECTING" || statusRef.current === "RESYNCING") {
              /* stream recovered — resync history before claiming LIVE again */
              setStatusSafe("RESYNCING");
              resyncingRef.current = true;
              void load();
            }
            lastKlineAtRef.current = Date.now();
          }
        });
        staleTimer = setInterval(markStale, 10_000);
      };

      void load();
      attachSocket(resolved.binance);
      /* periodic REST refresh keeps history exact when the WS only carries
         the current candle */
      const refresh = setInterval(() => void load(), REFRESH_MS);
      logPipeline("stream.attached", {
        symbol: canonical,
        providerSymbol: resolved.binance,
        timeframe: intervalId,
        wsStatus: getBinanceSocketStatus(),
      });

      return () => {
        cancelled = true;
        clearInterval(refresh);
        if (retryTimer) clearTimeout(retryTimer);
        unsubKline?.();
        unsubStatus?.();
        if (staleTimer) clearInterval(staleTimer);
      };
    }

    /* ---- non-crypto: Twelve Data via the backend, polled ---- */
    const loadTd = async () => {
      try {
        const res = await klinesAction({
          symbolId: canonical,
          timeframeId: intervalId,
          limit: 300,
        });
        if (cancelled) return;
        if (!res || res.candles.length === 0) {
          if (candlesRef.current.length === 0) {
            markError({
              code: "PROVIDER_ERROR",
              message:
                "DATA SOURCE UNAVAILABLE — no Twelve Data key configured or the provider returned no candles for this asset.",
            });
          }
          return;
        }
        const clean = sanitizeCandles(res.candles);
        if (clean.length > 0) {
          applyHistory(
            clean,
            "twelvedata",
            resolveProviderSymbol(resolved, "twelvedata") ?? resolved.id,
          );
        }
      } catch {
        if (cancelled) return;
        if (candlesRef.current.length === 0) {
          markError({
            code: "PROVIDER_ERROR",
            message: "CONNECTION ERROR — the market-data proxy call failed.",
          });
        }
      }
    };
    void loadTd();
    const poll = setInterval(() => void loadTd(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
      unsubKline?.();
      unsubStatus?.();
      if (staleTimer) clearInterval(staleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, intervalId, tf.ms, klinesAction, binanceAction, retryKey]);

  return {
    candles,
    source,
    providerSymbol,
    status,
    error,
    errorCode,
    latencyMs,
    updatedAt,
    ageSeconds,
    freshness,
    gap,
    missingCandles,
    candleCount: candles.length,
    retry,
  };
}

export { sanitizeCandles } from "@/lib/market";

function klineToCandle(k: BinanceKlineUpdate): Candle {
  return {
    time: k.time,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
  };
}
