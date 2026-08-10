import { Crown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useKlines } from "@/hooks/use-klines";
import { getIndicator } from "@/lib/indicators";
import { findSymbol, getTimeframe, type TimeframeId } from "@/lib/market";
import type { StrategyOverlay } from "@/lib/strategy";
import CustomChart, { type ChartType, type ToolId } from "./CustomChart";
import TradingViewWidget, { ensureTvScript, tvState } from "./TradingViewWidget";

export type EngineMode = "auto" | "custom" | "tv";

function tvSymbolFor(id: string): string {
  const crypto = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
  ];
  if (crypto.includes(id)) return `BINANCE:${id}`;
  switch (id) {
    case "EURUSD":
      return "OANDA:EURUSD";
    case "GBPUSD":
      return "OANDA:GBPUSD";
    case "USDJPY":
      return "OANDA:USDJPY";
    case "XAUUSD":
      return "FOREXCOM:XAUUSD";
    case "XAGUSD":
      return "FOREXCOM:XAGUSD";
    case "SPX500":
      return "SP:SPX";
    case "NAS100":
      return "CFD:US100";
    case "US30":
      return "CFD:US30";
    case "DXY":
      return "TVC:DXY";
    case "AAPL":
      return "NASDAQ:AAPL";
    case "TSLA":
      return "NASDAQ:TSLA";
    case "NVDA":
      return "NASDAQ:NVDA";
    default:
      return `BINANCE:${id}`;
  }
}

interface ChartCanvasProps {
  paneId: string;
  symbolId: string;
  intervalId: TimeframeId;
  chartType: ChartType;
  indicators: string[];
  tool: ToolId;
  onToolConsumed: () => void;
  engineMode: EngineMode;
  /** Minimum pixel height for the widget (0 = no floor). */
  minHeight?: number;
  /** Show the Founder Portal gold watermark on this pane. */
  founderBadge?: boolean;
  /** Compiled strategy overlays to inject onto the canvas. */
  strategies?: StrategyOverlay[];
}

export default function ChartCanvas({
  paneId,
  symbolId,
  intervalId,
  chartType,
  indicators,
  tool,
  onToolConsumed,
  engineMode,
  minHeight = 0,
  founderBadge = false,
  strategies = [],
}: ChartCanvasProps) {
  const { candles } = useKlines(symbolId, intervalId);
  const [tvReady, setTvReady] = useState(false);
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const tf = getTimeframe(intervalId);

  /* Bootstrap the shared TradingView script once when the widget may be used. */
  useEffect(() => {
    if (engineMode === "custom") return;
    let cancelled = false;
    if (tvState === "failed") {
      setTvReady(false);
      return;
    }
    const unsubscribe = ensureTvScript(() => {
      if (!cancelled) setTvReady(true);
    });
    const timer = setTimeout(() => {
      if (!cancelled && tvState !== "loaded") setTvReady(false);
    }, 6000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [engineMode]);

  const showWidget = tvReady;
  const studies = useMemo(() => {
    const list = indicators
      .map((id) => getIndicator(id)?.tvStudy)
      .filter((s): s is string => Boolean(s));
    if (chartType === "heikin") list.push("HeikenAshi@tv-basicstudies");
    return list;
  }, [indicators, chartType]);

  return (
    <div
      className="relative h-full w-full min-h-0 overflow-hidden"
      style={{ height: "100%", width: "100%", overflow: "hidden" }}
    >
      {!showWidget && (
        <CustomChart
          candles={candles}
          symbolId={symbolId}
          decimals={sym.decimals}
          intraday={tf.ms < 86_400_000}
          chartType={chartType}
          indicatorIds={indicators}
          tool={tool}
          onToolConsumed={onToolConsumed}
          resetKey={`${symbolId}-${intervalId}`}
          readoutOffset={founderBadge}
          strategies={strategies}
        />
      )}
      {showWidget && (
        <TradingViewWidget
          paneId={paneId}
          tvSymbol={tvSymbolFor(symbolId)}
          interval={tf.tv}
          style={chartType === "line" ? 2 : chartType === "bar" ? 0 : 1}
          studies={studies}
          minHeight={minHeight}
        />
      )}

      {/* Founder Portal watermark badge (top-left of the chart area) */}
      {founderBadge && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-[#F4C430]/35 bg-[#0b101b]/75 px-2.5 py-1 backdrop-blur-sm">
          <Crown className="size-3 shrink-0 text-[#F4C430]" />
          <span className="truncate text-[10px] font-bold tracking-wide text-[#F4C430]">
            Abdul Kudus Trading Academy · Founder Portal
          </span>
        </div>
      )}
    </div>
  );
}
