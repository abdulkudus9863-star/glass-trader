import { Crown } from "lucide-react";
import { useKlines } from "@/hooks/use-klines";
import { getTimeframe, type TimeframeId } from "@/lib/market";
import { feedBadge } from "@/lib/feed-status";
import { cn } from "@/lib/utils";
import TradingViewWidget from "./TradingViewWidget";
import LightweightChart from "./LightweightChart";
import type { ChartMode } from "./CustomChart";
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
  /** Which chart engine renders here — both share the pipeline below. */
  mode: ChartMode;
  /** Indicator ids from the terminal drawer (consumed by Lightweight mode). */
  indicators: readonly string[];
}

export default function ChartCanvas({
  symbolId,
  intervalId,
  mode,
  indicators,
}: ChartCanvasProps) {
  const klines = useKlines(symbolId, intervalId);
  const { status, error, source, freshness, ageSeconds, providerSymbol } = klines;
  const tf = getTimeframe(intervalId);

  /* Honest badge: the label comes from (status, freshness) — a delayed or
     reconnecting feed is never labeled LIVE. */
  const badge = feedBadge(status, freshness, source);
  const badgeDetail =
    error ??
    (ageSeconds !== null
      ? `Pipeline ${status} · last update ${ageSeconds}s ago${providerSymbol ? ` · ${providerSymbol}` : ""}`
      : `Pipeline ${status}`);

  const toneClass =
    badge.tone === "live"
      ? "border-[#00E676]/30 bg-[#0b101b]/75 text-[#00E676]"
      : badge.tone === "error"
        ? "border-[#FF1744]/40 bg-[#0b101b]/75 text-[#FF1744]"
        : badge.tone === "delayed" || badge.tone === "stale"
          ? "border-[#F4C430]/30 bg-[#0b101b]/75 text-[#F4C430]"
          : "border-slate-400/30 bg-[#0b101b]/75 text-slate-300";
  const dotClass =
    badge.tone === "live"
      ? "bg-[#00E676]"
      : badge.tone === "error"
        ? "bg-[#FF1744]"
        : badge.tone === "neutral"
          ? "bg-slate-400"
          : "bg-[#F4C430]";

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden">
      {mode === "lightweight" ? (
        <LightweightChart
          klines={klines}
          symbolId={symbolId}
          intervalId={intervalId}
          indicators={indicators}
        />
      ) : (
        <TradingViewWidget
          symbol={tvSymbolFor(symbolId)}
          timeframe={tf.tv}
        />
      )}

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
          toneClass,
        )}
        title={badgeDetail}
      >
        <span className={cn("size-1.5 rounded-full", dotClass)} />
        {badge.label}
      </div>
    </div>
  );
}
