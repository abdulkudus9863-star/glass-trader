/* ============================================================================
   Indicator engine — the single deterministic source of truth for all
   technical calculations in the platform.

   Every consumer (chart, radar, SMC, AI snapshot, copilot) must import from
   here so the chart and the AI always see identical numbers. No randomness,
   no AI — plain math over the candle tape.

   The primitive series functions are re-exported from `./market` so existing
   callers keep working, but new code should use `latestIndicators` /
   `computeIndicatorSeries` below.
   ========================================================================== */

import {
  type Candle,
  atr,
  ema,
  macd,
  rsi,
  sma,
  stddev,
  vwap,
} from "./market";

export {
  atr,
  ema,
  macd,
  rsi,
  sma,
  stddev,
  vwap,
};

export interface IndicatorSeries {
  ema9: (number | null)[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema100: (number | null)[];
  ema200: (number | null)[];
  rsi14: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHistogram: (number | null)[];
  atr14: (number | null)[];
  vwap: (number | null)[];
  sma20: (number | null)[];
  sma50: (number | null)[];
}

/**
 * Compute every indicator series over the full candle set. Each value is
 * aligned to its candle's timestamp.
 */
export function computeIndicatorSeries(candles: Candle[]): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const m = macd(closes);
  return {
    ema9: ema(closes, 9),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema100: ema(closes, 100),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    macdLine: m.macd,
    macdSignal: m.signal,
    macdHistogram: m.histogram,
    atr14: atr(candles, 14),
    vwap: vwap(candles),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
  };
}

export interface LatestIndicators {
  /** Price and timestamp of the source candle the values were computed on. */
  price: number;
  timestamp: number;
  timeframe: string;
  sourceCandleCount: number;
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  vwap: number | null;
  sma20: number | null;
  sma50: number | null;
  volume: number | null;
}

/**
 * The latest value of every indicator, with provenance metadata
 * (timestamp, timeframe, period, source candle set) so callers can label
 * the data honestly.
 */
export function latestIndicators(
  candles: Candle[],
  timeframe: string,
): LatestIndicators | null {
  if (candles.length < 30) return null;
  const series = computeIndicatorSeries(candles);
  const last = candles[candles.length - 1];
  const lastOf = (arr: (number | null)[]): number | null => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null) return arr[i] as number;
    }
    return null;
  };
  return {
    price: last.close,
    timestamp: last.time,
    timeframe,
    sourceCandleCount: candles.length,
    ema9: lastOf(series.ema9),
    ema20: lastOf(series.ema20),
    ema50: lastOf(series.ema50),
    ema100: lastOf(series.ema100),
    ema200: lastOf(series.ema200),
    rsi14: lastOf(series.rsi14),
    macd: lastOf(series.macdLine),
    macdSignal: lastOf(series.macdSignal),
    macdHistogram: lastOf(series.macdHistogram),
    atr14: lastOf(series.atr14),
    vwap: lastOf(series.vwap),
    sma20: lastOf(series.sma20),
    sma50: lastOf(series.sma50),
    volume: last.volume,
  };
}

/* ============================================================================
   Indicator catalog — the marketplace/library definitions shown in the ƒx
   modal, the drawer, the library page and My Access. Series rendering ids
   must match the deterministic engine above and the custom canvas.
   ========================================================================== */

export type IndicatorCategory =
  | "Trend"
  | "Momentum"
  | "Volume"
  | "Volatility"
  | "SMC";

export interface IndicatorDefinition {
  id: string;
  name: string;
  description: string;
  category: IndicatorCategory;
  color: string;
  /** Custom-canvas pane index (0 = main pane). */
  pane?: number;
  /** TradingView basic-study id when the widget supports it. */
  tvStudy?: string;
  access: "public" | "invite-only";
}

export const INDICATOR_CATEGORIES: IndicatorCategory[] = [
  "Trend",
  "Momentum",
  "Volume",
  "Volatility",
  "SMC",
];

export const INDICATORS: IndicatorDefinition[] = [
  /* Trend */
  { id: "ema9", name: "EMA 9", description: "Short-term exponential moving average", category: "Trend", color: "#F4C430", pane: 0, tvStudy: "EMA@tv-basicstudies", access: "public" },
  { id: "ema21", name: "EMA 21", description: "Trend confirmation moving average", category: "Trend", color: "#00BFFF", pane: 0, tvStudy: "EMA@tv-basicstudies", access: "public" },
  { id: "ema50", name: "EMA 50", description: "Intermediate trend moving average", category: "Trend", color: "#A855F7", pane: 0, tvStudy: "EMA@tv-basicstudies", access: "public" },
  { id: "ema100", name: "EMA 100", description: "Macro trend moving average", category: "Trend", color: "#f97316", pane: 0, tvStudy: "EMA@tv-basicstudies", access: "public" },
  { id: "ema200", name: "EMA 200", description: "Long-term trend filter", category: "Trend", color: "#FF1744", pane: 0, tvStudy: "EMA@tv-basicstudies", access: "public" },
  { id: "sma20", name: "SMA 20", description: "Simple moving average (20)", category: "Trend", color: "#64748b", pane: 0, tvStudy: "MASimple@tv-basicstudies", access: "public" },
  { id: "sma50", name: "SMA 50", description: "Simple moving average (50)", category: "Trend", color: "#94a3b8", pane: 0, tvStudy: "MASimple@tv-basicstudies", access: "public" },
  { id: "vwap", name: "VWAP", description: "Volume-weighted average price", category: "Trend", color: "#F4C430", pane: 0, tvStudy: "VWAP@tv-basicstudies", access: "public" },
  /* Momentum */
  { id: "rsi14", name: "RSI 14", description: "Relative Strength Index (14)", category: "Momentum", color: "#00E676", pane: 0, tvStudy: "RSI@tv-basicstudies", access: "public" },
  { id: "macd", name: "MACD", description: "Moving average convergence divergence", category: "Momentum", color: "#00E676", pane: 0, tvStudy: "MACD@tv-basicstudies", access: "public" },
  /* Volume */
  { id: "volume", name: "Volume", description: "Bar volume histogram", category: "Volume", color: "#00E676", pane: 0, tvStudy: "Volume@tv-basicstudies", access: "public" },
  { id: "oi", name: "Open Interest", description: "Derivatives open interest proxy", category: "Volume", color: "#00F0FF", pane: 0, access: "public" },
  /* Volatility */
  { id: "atr", name: "ATR 14", description: "Average true range (14)", category: "Volatility", color: "#F4C430", pane: 0, tvStudy: "ATR@tv-basicstudies", access: "public" },
  { id: "bollinger", name: "Bollinger Bands", description: "Volatility bands around SMA 20", category: "Volatility", color: "#00F0FF", pane: 0, tvStudy: "BB@tv-basicstudies", access: "public" },
  /* SMC */
  { id: "fvg", name: "Fair Value Gap", description: "Three-candle imbalance zones", category: "SMC", color: "#00E676", pane: 0, access: "public" },
  { id: "orderblocks", name: "Order Blocks", description: "Institutional order-block zones", category: "SMC", color: "#F4C430", pane: 0, access: "public" },
  { id: "liquidity", name: "Liquidity Levels", description: "Equal highs/lows and sweep zones", category: "SMC", color: "#00F0FF", pane: 0, access: "public" },
];

export const LOCKED_INDICATORS: IndicatorDefinition[] = [
  { id: "smc-pro", name: "SMC Pro Suite", description: "Advanced order-flow & liquidity engine", category: "SMC", color: "#F4C430", access: "invite-only" },
  { id: "whale-flow", name: "Whale Flow Radar", description: "Real-time orderbook wall tracking", category: "Volume", color: "#00F0FF", access: "invite-only" },
  { id: "ai-verdict", name: "AI Verdict Engine", description: "Confluence-scored trade verdicts", category: "Momentum", color: "#A855F7", access: "invite-only" },
];

export function getIndicator(id: string): IndicatorDefinition | undefined {
  return (
    INDICATORS.find((i) => i.id === id) ??
    LOCKED_INDICATORS.find((i) => i.id === id)
  );
}
