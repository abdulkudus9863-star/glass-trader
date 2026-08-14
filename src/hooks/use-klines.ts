import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import {
  type Candle,
  type DataSource,
  findSymbol,
  generateCandles,
  gaussian,
  getTimeframe,
  makeNextCandle,
  fetchKlines,
  type TimeframeId,
} from "@/lib/market";

/**
 * Live kline stream for one symbol/timeframe.
 *
 * Render chain (first success wins):
 *   1. Twelve Data via Convex action — real gold / forex / metals / indices
 *   2. Binance REST — real crypto
 *   3. Synthetic generator — always renders, never a blank canvas
 *
 * A lightweight tick loop keeps the last candle moving between refreshes.
 */
export function useKlines(symbolId: string, intervalId: TimeframeId) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<DataSource>("synthetic");
  const [loading, setLoading] = useState(true);
  const sym = findSymbol(symbolId);
  const klinesAction = useAction(api.market.klines);

  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    const tf = getTimeframe(intervalId);

    setCandles(generateCandles(sym, tf.ms, 300));
    setSource("synthetic");
    setLoading(false);

    if (sym.binance) {
      /* crypto — Binance REST (free, no key needed) */
      fetchKlines(sym.binance, tf.ms, 300).then((real) => {
        if (cancelled || !real || real.length === 0) return;
        setCandles(real);
        setSource("binance");
      });
    } else {
      /* forex / metals / indices — Twelve Data via the backend */
      klinesAction({
        symbolId: sym.id,
        timeframeId: intervalId,
        limit: 300,
      }).then((res) => {
        if (cancelled || !res || res.candles.length === 0) return;
        setCandles(res.candles);
        setSource("live");
      });
    }

    const live = setInterval(() => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        const nowMs = Date.now();
        if (nowMs - last.time * 1000 >= tf.ms) {
          next.push(makeNextCandle(sym, last, tf.ms, nowMs));
          if (next.length > 420) next.shift();
        } else {
          const vol = (sym.vol24h / 100) * Math.sqrt(tf.ms / 86_400_000);
          const close = Math.max(1, last.close * (1 + gaussian() * vol * 1.2));
          next[next.length - 1] = {
            ...last,
            close,
            high: Math.max(last.high, close),
            low: Math.min(last.low, close),
            volume: last.volume + Math.abs(gaussian() * last.volume * 0.15),
          };
        }
        return next;
      });
    }, 1600);

    return () => {
      cancelled = true;
      clearInterval(live);
    };
  }, [sym, intervalId, klinesAction]);

  return { candles, source, loading };
}
