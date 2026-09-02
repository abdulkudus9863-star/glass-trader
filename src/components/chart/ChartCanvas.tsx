import { Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { useKlines } from "@/hooks/use-klines";
import { findSymbol, getTimeframe, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";
import TradingViewWidget, {
  ensureTvScript,
  tvState,
} from "./TradingViewWidget";

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
  paneId: string;
  symbolId: string;
  intervalId: TimeframeId;
  /** Chart style: 0 = bar, 1 = candles, 2 = line */
  style?: number;
}

export default function ChartCanvas({
  paneId,
  symbolId,
  intervalId,
  style = 1,
}: ChartCanvasProps) {
  const klines = useKlines(symbolId, intervalId);
  const { status, error, source } = klines;
  const [tvReady, setTvReady] = useState(tvState === "loaded");
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const tf = getTimeframe(intervalId);

  /* Bootstrap the shared TradingView script once when the widget may be used.
     Until it loads (or if it fails), show a loading spinner. */
  useEffect(() => {
    if (tvState === "loaded") {
      setTvReady(true);
      return;
    }
    if (tvState === "failed") {
      setTvReady(false);
      return;
    }
    let cancelled = false;
    const unsubscribe = ensureTvScript(() => {
      if (!cancelled) setTvReady(true);
    });
    const timer = setTimeout(() => {
      if (!cancelled && tvState !== "loaded") setTvReady(false);
    }, 8000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden">
      {tvReady ? (
        <TradingViewWidget
          paneId={paneId}
          tvSymbol={tvSymbolFor(symbolId)}
          interval={tf.tv}
          style={style}
          minHeight={0}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050811]/60">
          <div className="size-6 animate-spin rounded-full border-2 border-[#F4C430] border-t-transparent" />
          <p className="font-display text-xs font-bold tracking-tight text-slate-300">
            LOADING TRADINGVIEW…
          </p>
          {tvState === "failed" && (
            <p className="text-[10px] uppercase tracking-wider text-[#FF1744]">
              Widget script failed to load
            </p>
          )}
        </div>
      )}

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
