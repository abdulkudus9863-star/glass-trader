import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getBinanceSocketStatus,
  subscribeBinanceKlines,
  subscribeBinanceStatus,
  type BinanceKlineUpdate,
} from "@/lib/realtime";
import {
  type Candle,
  findSymbol,
  fetchKlines,
  getTimeframe,
  type TimeframeId,
} from "@/lib/market";

export type KlineStatus =
  | "CONNECTING"
  | "LIVE"
  | "STALE"
  | "RECONNECTING"
  | "RESYNCING"
  | "ERROR";

/** Spec-compliant freshness label — Trade AI must only run when LIVE. */
export type DataFreshness = "LIVE" | "DELAYED" | "STALE" | "OFFLINE";

export interface KlinesState {
  candles: Candle[];
  /** null = no real feed available right now. */
  source: "binance" | "twelvedata" | null;
  status: KlineStatus;
  error: string | null;
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
}

/** Drop malformed / inverted / out-of-order candles and dedupe by time. */
export function sanitizeCandles(rows: Candle[]): Candle[] {
  const seen = new Map<number, Candle>();
  for (const c of rows) {
    if (!Number.isFinite(c.time) || !Number.isFinite(c.open) || !Number.isFinite(c.close)) continue;
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) continue;
    if (c.high < c.low) continue;
    const now = Math.floor(Date.now() / 1000);
    if (c.time > now + 3600) continue; // reject future timestamps
    seen.set(c.time, c);
  }
  return [...seen.values()].sort((a, b) => a.time - b.time);
}

/**
 * Detect missing timeframe buckets between consecutive candles. A gap is a
 * time difference larger than the timeframe bucket size (allowing the very
 * first candle, which can legitimately start mid-period).
 */
export function detectGaps(candles: Candle[], tfMs: number): { gap: boolean; missing: number } {
  if (candles.length < 2) return { gap: false, missing: 0 };
  let missing = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = (candles[i].time - candles[i - 1].time) * 1000;
    if (diff <= tfMs) continue;
    if (i === 1 && diff <= tfMs * 2.5) continue; // first candle may start mid-period
    missing += Math.round(diff / tfMs) - 1;
  }
  return { gap: missing > 0, missing };
}

const POLL_MS = 45_000;

/**
 * Live kline stream for one symbol/timeframe.
 *
 * Honest by construction:
 *   - crypto  → real Binance REST history + real `@kline` WebSocket updates
 *   - others  → real Twelve Data candles via the backend (polled)
 *   - no provider data → `status: "ERROR"`, empty candles, human-readable
 *     error. NO synthetic candles are ever generated.
 *
 * Realtime hygiene: the current candle is updated in place (never appended
 * twice), late/out-of-order frames are ignored, reconnects trigger a
 * RESYNCING phase that refetches history, and `freshness` never claims LIVE
 * when the feed has gone silent.
 */
export function useKlines(symbolId: string, intervalId: TimeframeId): KlinesState {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<"binance" | "twelvedata" | null>(null);
  const [status, setStatus] = useState<KlineStatus>("CONNECTING");
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastKlineAtRef = useRef(0);
  const candlesRef = useRef<Candle[]>(candles);
  const erroredRef = useRef(false);
  const resyncingRef = useRef(false);
  const statusRef = useRef<KlineStatus>("CONNECTING");
  const klinesAction = useAction(api.market.klines);
  const sym = useMemo(() => findSymbol(symbolId), [symbolId]);
  const tf = useMemo(() => getTimeframe(intervalId), [intervalId]);
  candlesRef.current = candles;

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
     Twelve Data is polled every 45s. Adjusting to the provider is the honest
     reading of the spec, not a fake LIVE. */
  const freshness: DataFreshness = useMemo(() => {
    if (status === "ERROR") return "STALE";
    if (status === "RECONNECTING") return "STALE";
    if (status === "CONNECTING") return "DELAYED";
    if (updatedAt == null) return "DELAYED";
    const age = (now - updatedAt) / 1000;
    const liveMax = source === "binance" ? 30 : 120;
    const delayedMax = source === "binance" ? 120 : 300;
    if (status === "RESYNCING") return "DELAYED";
    if (age <= liveMax) return "LIVE";
    if (age <= delayedMax) return "DELAYED";
    return "STALE";
  }, [status, updatedAt, now, source]);

  useEffect(() => {
    if (!sym) {
      setCandles([]);
      setSource(null);
      setStatus("ERROR");
      setError(`Unknown symbol ${symbolId}.`);
      return;
    }

    let cancelled = false;
    lastKlineAtRef.current = 0;
    erroredRef.current = false;
    resyncingRef.current = false;
    statusRef.current = "CONNECTING";
    setCandles([]);
    setSource(null);
    setStatus("CONNECTING");
    setError(null);
    setLatencyMs(null);
    setUpdatedAt(null);

    let unsubKline: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;
    let staleTimer: ReturnType<typeof setInterval> | null = null;

    const setStatusSafe = (s: KlineStatus) => {
      statusRef.current = s;
      setStatus(s);
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

    if (sym.binance) {
      /* ---- crypto: Binance REST history + kline WebSocket ---- */
      const load = async () => {
        const real = await fetchKlines(sym.binance!, tf.ms, 300);
        if (cancelled) return;
        const clean = real ? sanitizeCandles(real) : [];
        if (clean.length > 0) {
          erroredRef.current = false;
          setCandles(clean);
          setSource("binance");
          setUpdatedAt(Date.now());
          if (resyncingRef.current) {
            resyncingRef.current = false;
            setStatusSafe("LIVE");
          } else if (lastKlineAtRef.current === 0) {
            setStatusSafe("CONNECTING");
          }
          setError(null);
        } else if (candlesRef.current.length === 0) {
          erroredRef.current = true;
          setSource("binance");
          setStatusSafe("ERROR");
          setError(
            "CONNECTION ERROR — historical candles unavailable from Binance. Retrying…",
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
      attachSocket(sym.binance);
      /* periodic REST refresh keeps history exact when the WS only carries
         the current candle */
      const refresh = setInterval(() => void load(), 4 * 60_000);

      return () => {
        cancelled = true;
        clearInterval(refresh);
        unsubKline?.();
        unsubStatus?.();
        if (staleTimer) clearInterval(staleTimer);
      };
    }

    /* ---- non-crypto: Twelve Data via the backend, polled ---- */
    const loadTd = async () => {
      try {
        const res = await klinesAction({
          symbolId: sym.id,
          timeframeId: intervalId,
          limit: 300,
        });
        if (cancelled) return;
        if (!res || res.candles.length === 0) {
          if (candlesRef.current.length === 0) {
            erroredRef.current = true;
            setSource(null);
            setStatusSafe("ERROR");
            setError(
              "DATA SOURCE UNAVAILABLE — no Twelve Data key configured or the provider returned no candles for this asset.",
            );
          }
          return;
        }
        const clean = sanitizeCandles(res.candles);
        if (clean.length > 0) {
          erroredRef.current = false;
          setCandles(clean);
          setSource("twelvedata");
          setUpdatedAt(Date.now());
          setStatusSafe("LIVE");
          setError(null);
        }
      } catch {
        if (cancelled) return;
        if (candlesRef.current.length === 0) {
          erroredRef.current = true;
          setSource(null);
          setStatusSafe("ERROR");
          setError("CONNECTION ERROR — the market-data proxy call failed.");
        }
      }
    };
    void loadTd();
    const poll = setInterval(() => void loadTd(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      unsubKline?.();
      unsubStatus?.();
      if (staleTimer) clearInterval(staleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, intervalId, tf.ms, klinesAction]);

  return { candles, source, status, error, latencyMs, updatedAt, ageSeconds, freshness, gap, missingCandles, candleCount: candles.length };
}

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
