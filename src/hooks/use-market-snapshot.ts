import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type MarketSymbol,
  fetchTicker24h,
  findSymbol,
  gaussian,
  hashString,
  mulberry32,
} from "@/lib/market";

export interface TickerState {
  symbol: MarketSymbol;
  price: number;
  open: number; // session open, used to derive 24h change
  change24h: number;
  high: number;
  low: number;
  spark: number[]; // trailing closes for the mini sparkline
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

function seedTicker(s: MarketSymbol): TickerState {
  const rand = mulberry32(hashString(s.id));
  const price = s.basePrice * (0.985 + rand() * 0.03);
  const spark: number[] = [];
  let p = price * 0.98;
  for (let i = 0; i < 26; i++) {
    p = p * (1 + gaussian(rand) * (s.vol24h / 100) * 0.22);
    spark.push(p);
  }
  return {
    symbol: s,
    price,
    open: s.basePrice,
    change24h: ((price - s.basePrice) / s.basePrice) * 100,
    high: Math.max(price, ...spark) * 1.004,
    low: Math.min(price, ...spark) * 0.996,
    spark,
  };
}

/**
 * Live-ish snapshot of a set of markets.
 *
 * Feed chain per symbol:
 *   - crypto  → real Binance 24h tickers (polled every 15s)
 *   - others  → real Twelve Data quotes via the backend (polled every 60s)
 *   - fallback → deterministic random walk so the tape always moves
 */
export function useMarketSnapshot(symbolIds: string[]) {
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
  const tickerAction = useAction(api.market.ticker);

  /* symbols currently backed by a real feed (Binance / Twelve Data) — the
     synthetic tick loop must never walk a real quote away from the market */
  const realFeedsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const init: Record<string, TickerState> = {};
    for (const s of symbols) init[s.id] = seedTicker(s);
    setTickers(init);

    const binanceSymbols = symbols
      .map((s) => s.binance)
      .filter((b): b is string => Boolean(b));
    const liveSymbols = symbols.filter((s) => !s.binance);

    const refreshBinance = async () => {
      if (binanceSymbols.length === 0) return;
      const map = await fetchTicker24h(binanceSymbols);
      if (!map) return;
      setTickers((prev) => {
        const next = { ...prev };
        for (const s of symbols) {
          const t = s.binance ? map.get(s.binance) : undefined;
          if (!t) continue;
          realFeedsRef.current.add(s.id);
          const prevT = next[s.id];
          next[s.id] = {
            symbol: s,
            price: t.price,
            open: prevT?.open ?? t.price / (1 + t.change24h / 100),
            change24h: t.change24h,
            high: t.high,
            low: t.low,
            spark: prevT ? [...prevT.spark.slice(-25), t.price] : [t.price],
          };
        }
        return next;
      });
    };

    const refreshLive = async () => {
      if (liveSymbols.length === 0) return;
      const map = await tickerAction({
        symbolIds: liveSymbols.map((s) => s.id),
      });
      if (!map) return;
      setTickers((prev) => {
        const next = { ...prev };
        for (const [id, t] of Object.entries(map)) {
          const sym = findSymbol(id);
          if (!sym) continue;
          realFeedsRef.current.add(id);
          const prevT = next[id];
          next[id] = {
            symbol: sym,
            price: t.price,
            open: prevT?.open ?? t.price / (1 + t.change24h / 100),
            change24h: t.change24h,
            high: t.high,
            low: t.low,
            spark: prevT ? [...prevT.spark.slice(-25), t.price] : [t.price],
          };
        }
        return next;
      });
    };

    refreshBinance();
    refreshLive();
    const binancePoll = setInterval(refreshBinance, 15_000);
    const livePoll = setInterval(refreshLive, 60_000);

    /* keep the tape moving between polls — but only for symbols without a
       real feed; real quotes stay pinned to the market value */
    const tick = setInterval(() => {
      setTickers((prev) => {
        const next: Record<string, TickerState> = {};
        for (const [id, t] of Object.entries(prev)) {
          if (realFeedsRef.current.has(id)) {
            next[id] = t;
            continue;
          }
          const price = Math.max(
            1,
            t.price * (1 + gaussian() * (t.symbol.vol24h / 100) * 0.32),
          );
          next[id] = {
            ...t,
            price,
            change24h: ((price - t.open) / t.open) * 100,
            high: Math.max(t.high, price),
            low: Math.min(t.low, price),
            spark: [...t.spark.slice(-25), price],
          };
        }
        return next;
      });
    }, 1600);

    return () => {
      clearInterval(binancePoll);
      clearInterval(livePoll);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols]);

  return tickers;
}
