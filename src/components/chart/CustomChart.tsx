/**
 * Chart type definitions — the CustomChart component has been removed.
 * All charts now render through the TradingView Advanced Widget.
 */

export type ChartType = "candles" | "line" | "bar" | "heikin";

export type ToolId =
  | "trendline"
  | "horizontal"
  | "fib"
  | "rect"
  | "long"
  | "short"
  | "eraser"
  | "clear"
  | null;
