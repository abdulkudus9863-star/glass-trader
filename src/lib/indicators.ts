/* Indicator catalog used by the ƒx modal, the custom canvas engine and the
   TradingView widget engine (via tv-basicstudies ids). */

export type IndicatorCategory =
  | "Trend"
  | "Momentum"
  | "Volume"
  | "Volatility"
  | "SMC";

export interface IndicatorDef {
  id: string;
  name: string;
  category: IndicatorCategory;
  description: string;
  color: string;
  tvStudy?: string; // TradingView basic study id (TV widget engine)
  pane?: number; // custom engine pane index (undefined = main pane overlay)
  access: "public" | "invite-only";
}

export const INDICATORS: IndicatorDef[] = [
  {
    id: "sma20",
    name: "Simple MA 20",
    category: "Trend",
    description: "20-period simple moving average.",
    color: "#6366f1",
    tvStudy: "MASimple@tv-basicstudies",
    access: "public",
  },
  {
    id: "sma50",
    name: "Simple MA 50",
    category: "Trend",
    description: "50-period simple moving average.",
    color: "#f59e0b",
    tvStudy: "MASimple@tv-basicstudies",
    access: "public",
  },
  {
    id: "ema9",
    name: "EMA 9",
    category: "Trend",
    description: "9-period exponential moving average, fast trend follower.",
    color: "#0ea5e9",
    tvStudy: "MAExp@tv-basicstudies",
    access: "public",
  },
  {
    id: "ema21",
    name: "EMA 21",
    category: "Trend",
    description: "21-period exponential moving average.",
    color: "#a855f7",
    tvStudy: "MAExp@tv-basicstudies",
    access: "public",
  },
  {
    id: "ema50",
    name: "EMA 50",
    category: "Trend",
    description: "50-period exponential moving average, intermediate trend.",
    color: "#22d3ee",
    tvStudy: "MAExp@tv-basicstudies",
    access: "public",
  },
  {
    id: "ema200",
    name: "EMA 200",
    category: "Trend",
    description: "200-period exponential moving average, the institutional trend line.",
    color: "#f4c430",
    tvStudy: "MAExp@tv-basicstudies",
    access: "public",
  },
  {
    id: "oi",
    name: "Open Interest",
    category: "Volume",
    description: "Estimated open interest flow, derived from volume momentum.",
    color: "#00f0ff",
    pane: 1,
    access: "public",
  },
  {
    id: "vwap",
    name: "VWAP",
    category: "Trend",
    description: "Volume-weighted average price, session anchored.",
    color: "#f97316",
    tvStudy: "VWAP@tv-basicstudies",
    access: "public",
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    category: "Volatility",
    description: "20-period SMA with ±2σ volatility channels.",
    color: "#64748b",
    tvStudy: "BB@tv-basicstudies",
    access: "public",
  },
  {
    id: "atr",
    name: "ATR",
    category: "Volatility",
    description: "Average true range — volatility in raw price terms.",
    color: "#94a3b8",
    pane: 4,
    tvStudy: "ATR@tv-basicstudies",
    access: "public",
  },
  {
    id: "rsi14",
    name: "RSI 14",
    category: "Momentum",
    description: "Relative strength index, overbought / oversold.",
    color: "#a855f7",
    pane: 2,
    tvStudy: "RSI@tv-basicstudies",
    access: "public",
  },
  {
    id: "macd",
    name: "MACD",
    category: "Momentum",
    description: "Moving average convergence divergence (12, 26, 9).",
    color: "#0d9488",
    pane: 3,
    tvStudy: "MACD@tv-basicstudies",
    access: "public",
  },
  {
    id: "volume",
    name: "Volume",
    category: "Volume",
    description: "Traded volume histogram per candle.",
    color: "#60a5fa",
    pane: 1,
    tvStudy: "Volume@tv-basicstudies",
    access: "public",
  },
  {
    id: "fvg",
    name: "Fair Value Gap",
    category: "SMC",
    description: "Highlights recent 3-candle imbalances (Smart Money Concept).",
    color: "#10b981",
    access: "public",
  },
];

/** Invite-only tools — shown as locked until the v2 access system unlocks them. */
export const LOCKED_INDICATORS: IndicatorDef[] = [
  {
    id: "liquidity-sweep",
    name: "Liquidity Sweep Pro",
    category: "SMC",
    description: "Flags equal-highs/lows liquidity sweeps in real time.",
    color: "#e11d48",
    access: "invite-only",
  },
  {
    id: "order-block",
    name: "Order Block Hunter",
    category: "SMC",
    description: "Auto-detects institutional order blocks on higher timeframes.",
    color: "#f59e0b",
    access: "invite-only",
  },
  {
    id: "smart-money",
    name: "Smart Money Flow",
    category: "Momentum",
    description: "Composite delta & CVD divergence scanner.",
    color: "#0ea5e9",
    access: "invite-only",
  },
];

export function getIndicator(id: string): IndicatorDef | undefined {
  return INDICATORS.find((i) => i.id === id);
}

export const INDICATOR_CATEGORIES: IndicatorCategory[] = [
  "Trend",
  "Momentum",
  "Volume",
  "Volatility",
  "SMC",
];
