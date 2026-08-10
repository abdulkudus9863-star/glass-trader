import { useEffect, useMemo, useState } from "react";
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
 * Live-ish snapshot of a set of markets. Uses real Binance 24h tickers for
 * crypto when the network allows (polled), and a deterministic random walk
 * for every other market so the tape always moves.
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

  useEffect(() => {
    const init: Record<string, TickerState> = {};
    for (const s of symbols) init[s.id] = seedTicker(s);
    setTickers(init);

    const binanceSymbols = symbols
      .map((s) => s.binance)
      .filter((b): b is string => Boolean(b));

    const refresh = async () => {
      if (binanceSymbols.length === 0) return;
      const map = await fetchTicker24h(binanceSymbols);
      if (!map) return;
      setTickers((prev) => {
        const next = { ...prev };
        for (const s of symbols) {
          const t = s.binance ? map.get(s.binance) : undefined;
          if (!t) continue;
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

    refresh();
    const poll = setInterval(refresh, 15_000);

    const tick = setInterval(() => {
      setTickers((prev) => {
        const next: Record<string, TickerState> = {};
        for (const [id, t] of Object.entries(prev)) {
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
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [symbols]);

  return tickers;
}
