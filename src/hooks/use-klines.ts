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
  | "ERROR";

export interface KlinesState {
  candles: Candle[];
  /** null = no real feed available right now. */
  source: "binance" | "twelvedata" | null;
  status: KlineStatus;
  error: string | null;
  latencyMs: number | null;
  updatedAt: number | null;
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

const POLL_MS = 45_000;

/**
 * Live kline stream for one symbol/timeframe.
 *
 * Honest by construction:
 *   - crypto  → real Binance REST history + real `@kline` WebSocket updates
 *   - others  → real Twelve Data candles via the backend (polled)
 *   - no provider data → `status: "ERROR"`, empty candles, human-readable
 *     error. NO synthetic candles are ever generated.
 */
export function useKlines(symbolId: string, intervalId: TimeframeId): KlinesState {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<"binance" | "twelvedata" | null>(null);
  const [status, setStatus] = useState<KlineStatus>("CONNECTING");
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const lastKlineAtRef = useRef(0);
  const candlesRef = useRef<Candle[]>(candles);
  const erroredRef = useRef(false);
  const klinesAction = useAction(api.market.klines);
  const sym = useMemo(() => findSymbol(symbolId), [symbolId]);
  const tf = useMemo(() => getTimeframe(intervalId), [intervalId]);
  candlesRef.current = candles;

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
    setCandles([]);
    setSource(null);
    setStatus("CONNECTING");
    setError(null);
    setLatencyMs(null);
    setUpdatedAt(null);

    let unsubKline: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;
    let staleTimer: ReturnType<typeof setInterval> | null = null;

    const markStale = () => {
      if (cancelled || erroredRef.current) return;
      const threshold = Math.max(30_000, tf.ms * 3);
      const silent = Date.now() - lastKlineAtRef.current > threshold;
      if (silent) {
        setStatus("STALE");
        setLatencyMs(threshold);
      }
    };

    const applyKline = (k: BinanceKlineUpdate) => {
      lastKlineAtRef.current = Date.now();
      setLatencyMs(Math.max(0, Date.now() - k.receivedAt));
      setUpdatedAt(Date.now());
      setStatus("LIVE");
      setCandles((prev) => {
        if (prev.length === 0) {
          return sanitizeCandles([klineToCandle(k)]);
        }
        const last = prev[prev.length - 1];
        if (k.time === last.time) {
          const next = [...prev];
          next[next.length - 1] = klineToCandle(k);
          return next;
        }
        if (k.time > last.time) {
          return sanitizeCandles([...prev, klineToCandle(k)]);
        }
        return prev;
      });
    };

    const attachSocket = (binanceSymbol: string) => {
      unsubKline = subscribeBinanceKlines(binanceSymbol, applyKline);
      unsubStatus = subscribeBinanceStatus((s) => {
        if (cancelled) return;
        if (s === "reconnecting") setStatus("RECONNECTING");
        else if (s === "open") {
          lastKlineAtRef.current = Date.now();
          setStatus("LIVE");
        }
      });
      staleTimer = setInterval(markStale, 10_000);
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
          setStatus(lastKlineAtRef.current > 0 ? "LIVE" : "CONNECTING");
          setError(null);
        } else if (candlesRef.current.length === 0) {
          erroredRef.current = true;
          setSource("binance");
          setStatus("ERROR");
          setError(
            "CONNECTION ERROR — historical candles unavailable from Binance. Retrying…",
          );
        }
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
            setStatus("ERROR");
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
          setStatus("LIVE");
          setError(null);
        }
      } catch {
        if (cancelled) return;
        if (candlesRef.current.length === 0) {
          erroredRef.current = true;
          setSource(null);
          setStatus("ERROR");
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

  return { candles, source, status, error, latencyMs, updatedAt };
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
