/**
 * Chart type definitions + chart-mode persistence.
 *
 * The TradingView Advanced Widget remains the default chart. Lightweight
 * Charts is an additional mode — both render inside ChartCanvas and share
 * the same validated market-data pipeline. The selected mode is persisted
 * in localStorage so the terminal opens with the user's last choice.
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

/** Which engine renders the chart: the TradingView widget or our own
 *  lightweight-charts canvas. */
export type ChartMode = "tradingview" | "lightweight";

const CHART_MODE_KEY = "gt.chartMode";

/** Read the persisted mode (defaults to the TradingView widget). */
export function loadChartMode(): ChartMode {
  try {
    if (globalThis.localStorage?.getItem(CHART_MODE_KEY) === "lightweight") {
      return "lightweight";
    }
  } catch {
    /* storage unavailable (private mode) — fall back to the default */
  }
  return "tradingview";
}

/** Persist the selected mode. Never throws (private mode / quota). */
export function saveChartMode(mode: ChartMode): void {
  try {
    globalThis.localStorage?.setItem(CHART_MODE_KEY, mode);
  } catch {
    /* storage unavailable — the mode still applies for this session */
  }
}
