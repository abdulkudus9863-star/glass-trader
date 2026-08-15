import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getBinanceSocketStatus,
  subscribeBinanceStatus,
  subscribeBinanceTicker,
} from "@/lib/realtime";
import {
  type MarketSymbol,
  fetchTicker24h,
  findSymbol,
} from "@/lib/market";

export type TickerStatus =
  | "CONNECTING"
  | "LIVE"
  | "STALE"
  | "RECONNECTING"
  | "ERROR";

export interface TickerState {
  symbol: MarketSymbol;
  /** null = this feed has no real quote right now. Never a fabricated price. */
  price: number | null;
  change24h: number | null;
  high: number | null;
  low: number | null;
  spark: number[]; // trailing real closes (may be empty)
  status: TickerStatus;
  source: "binance" | "twelvedata" | null;
  updatedAt: number | null;
  latencyMs: number | null;
}

export const WATCHLIST_IDS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "SPX500",
  "NAS100",
  "AAPL",
  "NVDA",
  "DXY",
];

const TD_POLL_MS = 30_000;
const WS_STALE_MS = 15_000;

function emptyTicker(s: MarketSymbol): TickerState {
  return {
    symbol: s,
    price: null,
    change24h: null,
    high: null,
    low: null,
    spark: [],
    status: "CONNECTING",
    source: null,
    updatedAt: null,
    latencyMs: null,
  };
}

/**
 * Live snapshot of a set of markets.
 *
 *   - crypto  → real Binance WebSocket ticks + 24h REST tickers
 *   - others  → real Twelve Data quotes via the backend (polled)
 *   - no real feed → `status: "ERROR"`, `price: null` — consumers must show
 *     DATA SOURCE UNAVAILABLE. No seeded prices, no random walks.
 */
export function useMarketSnapshot(symbolIds: string[]): Record<string, TickerState> {
  const key = symbolIds.join(",");
  const symbols = useMemo(
    () =>
      symbolIds
        .map((id) => findSymbol(id))
        .filter((s): s is MarketSymbol => Boolean(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const [tickers, setTickers] = useState<Record<string, TickerState>>({});
  const lastWsAtRef = useRef<Record<string, number>>({});
  const tickerAction = useAction(api.market.ticker);

  useEffect(() => {
    const init: Record<string, TickerState> = {};
    for (const s of symbols) init[s.id] = emptyTicker(s);
    setTickers(init);

    const binanceSymbols = symbols
      .map((s) => s.binance)
      .filter((b): b is string => Boolean(b));
    const liveSymbols = symbols.filter((s) => !s.binance);

    /* ---- crypto: WS ticks + 24h REST refresh ---- */
    const wsUnsubs: (() => void)[] = [];
    for (const s of symbols) {
      if (!s.binance) continue;
      lastWsAtRef.current[s.id] = Date.now();
      wsUnsubs.push(
        subscribeBinanceTicker(s.binance, (t) => {
          lastWsAtRef.current[s.id] = Date.now();
          setTickers((prev) => {
            const cur = prev[s.id];
            const spark = cur
              ? [...cur.spark.slice(-39), t.price]
              : [t.price];
            return {
              ...prev,
              [s.id]: {
                symbol: s,
                price: t.price,
                change24h: t.change24h,
                high: cur && cur.high != null ? Math.max(cur.high, t.high) : t.high,
                low: cur && cur.low != null ? Math.min(cur.low, t.low) : t.low,
                spark,
                status: "LIVE",
                source: "binance",
                updatedAt: t.receivedAt,
                latencyMs: Math.max(0, Date.now() - t.receivedAt),
              },
            };
          });
        }),
      );
    }

    const refreshBinance24h = async () => {
      if (binanceSymbols.length === 0) return;
      const map = await fetchTicker24h(binanceSymbols);
      if (!map) return;
      setTickers((prev) => {
        const next = { ...prev };
        for (const s of symbols) {
          if (!s.binance) continue;
          const t = map.get(s.binance);
          if (!t) continue;
          const cur = next[s.id] ?? emptyTicker(s);
          next[s.id] = {
            ...cur,
            price: cur.price ?? t.price,
            change24h: t.change24h,
            high: cur.high != null ? Math.max(cur.high, t.high) : t.high,
            low: cur.low != null ? Math.min(cur.low, t.low) : t.low,
            source: "binance",
            updatedAt: Date.now(),
            status: cur.status === "ERROR" ? "CONNECTING" : cur.status,
          };
        }
        return next;
      });
    };
    void refreshBinance24h();
    const binancePoll = setInterval(() => void refreshBinance24h(), 60_000);

    /* ---- non-crypto: Twelve Data via the backend ---- */
    const refreshLive = async () => {
      if (liveSymbols.length === 0) return;
      try {
        const map = await tickerAction({
          symbolIds: liveSymbols.map((s) => s.id),
        });
        if (!map) {
          setTickers((prev) => {
            const next = { ...prev };
            for (const s of liveSymbols) {
              const cur = next[s.id];
              if (cur && cur.price == null) {
                next[s.id] = {
                  ...cur,
                  status: "ERROR",
                  source: "twelvedata",
                };
              }
            }
            return next;
          });
          return;
        }
        setTickers((prev) => {
          const next = { ...prev };
          for (const [id, t] of Object.entries(map)) {
            const sym = findSymbol(id);
            const cur = next[id];
            if (!sym) continue;
            const spark = cur
              ? [...cur.spark.slice(-39), t.price]
              : [t.price];
            next[id] = {
              symbol: sym,
              price: t.price,
              change24h: t.change24h,
              high: t.high,
              low: t.low,
              spark,
              status: "LIVE",
              source: "twelvedata",
              updatedAt: Date.now(),
              latencyMs: null,
            };
          }
          return next;
        });
      } catch {
        setTickers((prev) => {
          const next = { ...prev };
          for (const s of liveSymbols) {
            const cur = next[s.id];
            if (cur && cur.price == null) {
              next[s.id] = { ...cur, status: "ERROR" };
            }
          }
          return next;
        });
      }
    };
    void refreshLive();
    const livePoll = setInterval(() => void refreshLive(), TD_POLL_MS);

    /* ---- socket-level status → RECONNECTING; per-symbol staleness ---- */
    const unsubStatus = subscribeBinanceStatus((s) => {
      if (s !== "reconnecting") return;
      setTickers((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (next[id].source === "binance") next[id] = { ...next[id], status: "RECONNECTING" };
        }
        return next;
      });
    });
    const wsPoll = setInterval(() => {
      const now = Date.now();
      setTickers((prev) => {
        const next = { ...prev };
        for (const s of symbols) {
          if (!s.binance) continue;
          const cur = next[s.id];
          if (!cur || cur.source !== "binance") continue;
          if (cur.price == null) continue;
          const last = lastWsAtRef.current[s.id] ?? 0;
          if (now - last > WS_STALE_MS) {
            next[s.id] = { ...cur, status: "STALE", latencyMs: now - last };
          }
        }
        return next;
      });
    }, 5000);

    /* expose initial socket state */
    if (getBinanceSocketStatus() === "open" || getBinanceSocketStatus() === "reconnecting") {
      /* the tick handlers will flip symbols to LIVE on the first frame */
    }

    return () => {
      for (const unsub of wsUnsubs) unsub();
      unsubStatus();
      clearInterval(binancePoll);
      clearInterval(livePoll);
      clearInterval(wsPoll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols]);

  return tickers;
}
