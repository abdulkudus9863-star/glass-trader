import { Crown } from "lucide-react";
import { useKlines } from "@/hooks/use-klines";
import { findSymbol, getTimeframe, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";
import TradingViewWidget from "./TradingViewWidget";
import StrategyPriceLines from "./StrategyPriceLines";

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
      return "OANDA:XAUUSD";
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
  symbolId: string;
  intervalId: TimeframeId;
}

export default function ChartCanvas({
  symbolId,
  intervalId,
}: ChartCanvasProps) {
  const klines = useKlines(symbolId, intervalId);
  const { status, error, source } = klines;
  const tf = getTimeframe(intervalId);

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden">
      <TradingViewWidget
        symbol={tvSymbolFor(symbolId)}
        timeframe={tf.tv}
      />

      {/* Visual Levels HUD — glowing price tags on the right side of the chart */}
      <StrategyPriceLines />

      {/* Founder Portal watermark badge (top-left of the chart area) */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-[#F4C430]/35 bg-[#0b101b]/75 px-2.5 py-1 backdrop-blur-sm">
        <Crown className="size-3 shrink-0 text-[#F4C430]" />
        <span className="truncate text-[10px] font-bold tracking-wide text-[#F4C430]">
          Abdul Kudus Trading Academy · Founder Portal
        </span>
      </div>

      {/* Feed status badge (top-right) — honest about the actual stream state */}
      <div
        className={cn(
          "pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold tracking-wider backdrop-blur-sm",
          status === "LIVE"
            ? "border-[#00E676]/30 bg-[#0b101b]/75 text-[#00E676]"
            : status === "ERROR"
              ? "border-[#FF1744]/40 bg-[#0b101b]/75 text-[#FF1744]"
              : "border-[#F4C430]/30 bg-[#0b101b]/75 text-[#F4C430]",
        )}
        title={
          error ??
          (source === "binance"
            ? "Real Binance candles"
            : source === "twelvedata"
              ? "Real Twelve Data candles via the backend proxy"
              : status)
        }
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "LIVE"
              ? "bg-[#00E676]"
              : status === "ERROR"
                ? "bg-[#FF1744]"
                : "bg-[#F4C430]",
          )}
        />
        {status === "LIVE"
          ? source === "binance"
            ? "LIVE · BINANCE"
            : source === "twelvedata"
              ? "LIVE · TWELVEDATA"
              : "LIVE"
          : status === "ERROR"
            ? error ?? "ERROR"
            : status}
      </div>
    </div>
  );
}
