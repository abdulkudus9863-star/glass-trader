import { Crown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useKlines } from "@/hooks/use-klines";
import type { DeeeprIqChartOverlay } from "@/lib/deeepr-iq";
import { getIndicator } from "@/lib/indicators";
import { findSymbol, getTimeframe, type TimeframeId } from "@/lib/market";
import { analyzeSmc } from "@/lib/smc";
import type { StrategyOverlay } from "@/lib/strategy";
import { cn } from "@/lib/utils";
import CustomChart, { type ChartType, type ToolId } from "./CustomChart";
import { DEFAULT_IQ_OVERLAYS, type IqOverlayPrefs } from "./DeeeprIqPanel";
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
  /** Live DEEEPR IQ overlay (real liquidity walls / heatmap / volume profile). */
  iq?: DeeeprIqChartOverlay | null;
  /** Per-layer overlay toggles driven by the IQ panel. */
  overlayPrefs?: IqOverlayPrefs;
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
  iq = null,
  overlayPrefs = DEFAULT_IQ_OVERLAYS,
}: ChartCanvasProps) {
  const klines = useKlines(symbolId, intervalId);
  const { candles, source, status, error, errorCode, providerSymbol, ageSeconds, gap, missingCandles, retry, latencyMs, updatedAt, freshness } = klines;
  const [tvReady, setTvReady] = useState(false);
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const tf = getTimeframe(intervalId);

  /* Live SMC overlay — derived from the same candles the canvas renders, so
     the watch zone / whale walls / swing levels always track the selected
     symbol and timeframe. */
  const smc = useMemo(() => {
    const lastClose = candles[candles.length - 1]?.close;
    if (lastClose == null) return null;
    return analyzeSmc({
      symbolId,
      intervalId,
      candles,
      price: lastClose,
      change24h: 0,
      decimals: sym.decimals,
      assetName: sym.name,
    });
  }, [candles, symbolId, intervalId, sym.decimals, sym.name]);

  /* Bootstrap the shared TradingView script once when the widget may be used.
     Until it loads (or if it fails), the custom canvas keeps the pane from
     ever going blank — the official widget takes over as soon as it's ready. */
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
  /* Default widget studies (SMA + RSI always on) plus any indicator the user
     toggles that maps to a TradingView basic study. */
  const studies = useMemo(() => {
    const list = ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"];
    for (const id of indicators) {
      const s = getIndicator(id)?.tvStudy;
      if (s && !list.includes(s)) list.push(s);
    }
    if (chartType === "heikin" && !list.includes("HeikenAshi@tv-basicstudies"))
      list.push("HeikenAshi@tv-basicstudies");
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
          smc={smc ? smc.overlay : null}
          iq={iq}
          overlayPrefs={overlayPrefs}
          feed={{
            status,
            error,
            errorCode,
            source,
            providerSymbol,
            ageSeconds,
            latencyMs,
            updatedAt,
            freshness,
            gap,
            missingCandles,
            candleCount: candles.length,
            retry,
          }}
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

      {/* Feed status badge (top-right, custom engine only) — honest about the
          actual stream state; never claims LIVE while disconnected. */}
      {!showWidget && (
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
              ? errorCode ?? "ERROR"
              : status}
        </div>
      )}
    </div>
  );
}
