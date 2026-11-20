import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { findSymbol, TIMEFRAMES, type TimeframeId } from "@/lib/market";
import type { KlinesState } from "@/hooks/use-klines";
import {
  DEFAULT_OVERLAY_TOGGLES,
  OVERLAY_COLORS,
  RR_BOX_BARS,
  buildAiSetupOverlays,
  buildPreviewOverlays,
  buildTradeOverlays,
  type AiSetupLevels,
  type OverlayToggles,
  type PaperTradeLike,
  type PreviewInput,
  type PriceLineSpec,
} from "@/lib/paper-chart";
import { RiskRewardBoxPrimitive } from "@/components/chart/risk-reward-primitive";
import { cn } from "@/lib/utils";

/** Timeframes offered on the paper-trading chart (spec §1). */
const CHART_TIMEFRAMES: TimeframeId[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

const inr = (n: number) =>
  `${n >= 0 ? "+" : "−"}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

const timeLabel = (ms: number | null) =>
  ms == null
    ? "—"
    : new Date(ms).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

interface PaperTradeChartProps {
  symbolId: string;
  intervalId: TimeframeId;
  onIntervalChange: (tf: TimeframeId) => void;
  klines: KlinesState;
  /** All of the caller's simulated trades (server-scoped). */
  trades: PaperTradeLike[];
  selectedTradeId: string | null;
  onSelectTrade: (id: string | null) => void;
  /** Live unrealized P&L for the selected open trade. */
  selectedPnlInr: number | null;
  /** Unsaved form preview — updates as the user types. */
  preview: PreviewInput | null;
  /** DEEEPR setup pushed from the AI panel (annotations only). */
  aiSetup?: AiSetupLevels | null;
  /** Drop the pushed DEEEPR annotations. */
  onClearAiSetup?: () => void;
}

const TOGGLES_KEY = "akverse:paper-chart-toggles:v1";

function loadToggles(): OverlayToggles {
  try {
    const raw = localStorage.getItem(TOGGLES_KEY);
    if (!raw) return DEFAULT_OVERLAY_TOGGLES;
    const parsed = JSON.parse(raw) as Partial<OverlayToggles>;
    return { ...DEFAULT_OVERLAY_TOGGLES, ...parsed };
  } catch {
    return DEFAULT_OVERLAY_TOGGLES;
  }
}

export default function PaperTradeChart({
  symbolId,
  intervalId,
  onIntervalChange,
  klines,
  trades,
  selectedTradeId,
  onSelectTrade,
  selectedPnlInr,
  preview,
  aiSetup = null,
  onClearAiSetup,
}: PaperTradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const boxesRef = useRef<RiskRewardBoxPrimitive[]>([]);
  /** Only auto-fit when the view changes, so live ticks never reset zoom/pan. */
  const fitKeyRef = useRef("");
  const [toggles, setToggles] = useState<OverlayToggles>(loadToggles);
  const [expanded, setExpanded] = useState(false);
  /** Set when the chart engine itself cannot initialise in this browser. */
  const [chartError, setChartError] = useState<string | null>(null);

  /* Persist overlay choices so a reload restores the chart setup. */
  useEffect(() => {
    try {
      localStorage.setItem(TOGGLES_KEY, JSON.stringify(toggles));
    } catch {
      /* storage disabled — defaults still apply */
    }
  }, [toggles]);

  const sym = useMemo(() => findSymbol(symbolId), [symbolId]);
  const decimals = sym?.decimals ?? 2;
  const { candles, status, updatedAt, freshness, error } = klines;

  const lastCandle = candles.length ? candles[candles.length - 1] : null;
  const selectedTrade = useMemo(
    () => trades.find((t) => t._id === selectedTradeId) ?? null,
    [trades, selectedTradeId],
  );
  const previewActive = preview !== null && preview.entry > 0 && preview.stop > 0;

  /* ------------------------- chart lifecycle ------------------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let chart: IChartApi;
    try {
      chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b101b" },
        textColor: "#94a3b8",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.07)" },
        horzLines: { color: "rgba(148, 163, 184, 0.07)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(244, 196, 48, 0.5)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#F4C430",
        },
        horzLine: {
          color: "rgba(244, 196, 48, 0.5)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#F4C430",
        },
      },
        rightPriceScale: {
          borderColor: "#1B263B",
          scaleMargins: { top: 0.1, bottom: 0.22 },
        },
        timeScale: {
          borderColor: "#1B263B",
          timeVisible: true,
          secondsVisible: false,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Chart engine failed to start in this browser.";
      // Deferred so the failure surfaces without a synchronous state update
      // inside the effect body.
      window.setTimeout(() => setChartError(message), 0);
      return;
    }
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00E676",
      downColor: "#FF1744",
      borderVisible: false,
      wickUpColor: "rgba(0, 230, 118, 0.85)",
      wickDownColor: "rgba(255, 23, 68, 0.85)",
    });
    seriesRef.current = series;

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeRef.current = volume;
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
    });
    markersRef.current = createSeriesMarkers(series, []);

    return () => {
      linesRef.current = [];
      boxesRef.current = [];
      markersRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  /* ----------------------------- candles ----------------------------- */
  useEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    if (!series || !volume) return;

    series.applyOptions({
      priceFormat: {
        type: "price",
        precision: decimals,
        minMove: 10 ** -decimals,
      },
    });
    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    volume.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(0, 230, 118, 0.28)"
            : "rgba(255, 23, 68, 0.28)",
      })),
    );
    const fitKey = `${symbolId}:${intervalId}`;
    if (candles.length && fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, decimals, symbolId, intervalId]);

  /* ------------------- overlays: lines, box, markers ------------------ */
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    try {
      for (const line of linesRef.current) series.removePriceLine(line);
      linesRef.current = [];

      for (const box of boxesRef.current) {
        try {
          series.detachPrimitive(box);
        } catch {
          /* already detached */
        }
      }
      boxesRef.current = [];
    } catch {
      // A stale chart instance (e.g. after a hot remount) — nothing to clear.
      linesRef.current = [];
      boxesRef.current = [];
    }

    const spec =
      previewActive && preview
        ? buildPreviewOverlays(preview, toggles, decimals, sym?.id ?? symbolId)
        : selectedTrade && selectedTrade.symbol === symbolId
          ? buildTradeOverlays(selectedTrade, toggles, decimals)
          : null;

    const aiSpec = aiSetup ? buildAiSetupOverlays(aiSetup, toggles, decimals) : null;
    const specs = [spec, aiSpec].filter(
      (s): s is NonNullable<typeof s> => s !== null,
    );

    if (specs.length === 0) {
      markersRef.current?.setMarkers([]);
      return;
    }

    const lastBar = candles.length
      ? (candles[candles.length - 1].time as number)
      : null;
    const tradeAnchor: number | null =
      selectedTrade?.openedAt != null
        ? Math.floor(selectedTrade.openedAt / 1000)
        : null;
    const aiAnchor: number | null = aiSetup ? Math.floor(aiSetup.timestamp / 1000) : null;

    const draw = (
      lines: PriceLineSpec[],
      box: { entry: number; stop: number; target: number } | null,
      anchor: number | null,
      tone: "trade" | "ai",
      label: string,
    ) => {
      for (const l of lines) {
        linesRef.current.push(
          series.createPriceLine({
            price: l.price,
            color: l.color,
            lineWidth: 1,
            lineStyle: l.dashed ? 2 : 0,
            axisLabelVisible: true,
            title: l.title,
          }),
        );
      }
      if (box && anchor != null) {
        const primitive = new RiskRewardBoxPrimitive(series, {
          ...box,
          anchorTime: anchor as UTCTimestamp,
          bars: RR_BOX_BARS,
          label,
          tone,
        });
        series.attachPrimitive(primitive);
        boxesRef.current.push(primitive);
      }
    };

    try {
      if (spec) {
        const anchor =
          previewActive ? lastBar : (tradeAnchor ?? lastBar);
        draw(
          spec.lines,
          spec.box,
          anchor,
          "trade",
          spec.box
            ? `R:R 1:${(Math.abs(spec.box.target - spec.box.entry) / Math.abs(spec.box.entry - spec.box.stop)).toFixed(1)}`
            : spec.label,
        );
      }
      if (aiSpec && aiSetup) {
        draw(
          aiSpec.lines,
          aiSpec.box,
          aiAnchor ?? lastBar,
          "ai",
          aiSpec.box
            ? `AI R:R 1:${(Math.abs(aiSpec.box.target - aiSpec.box.entry) / Math.abs(aiSpec.box.entry - aiSpec.box.stop)).toFixed(1)}`
            : aiSpec.label,
        );
      }
    } catch {
      // Drawing failure must never blank the page — lines are optional overlays.
    }

    /* Exit marker on the actual bar where the position was closed. */
    const markers: SeriesMarker<Time>[] = [];
    const trade = selectedTrade;
    if (
      toggles.exit &&
      trade &&
      trade.symbol === symbolId &&
      trade.status === "CLOSED" &&
      trade.exit != null &&
      trade.closedAt != null &&
      candles.length
    ) {
      const first = candles[0].time;
      const last = candles[candles.length - 1].time;
      const at = Math.floor(trade.closedAt / 1000);
      // Only mark the bar when the real close time is on screen; otherwise the
      // exit price line still shows and no marker is placed at a wrong time.
      if (at >= first && at <= last) {
        markers.push({
          time: at as UTCTimestamp,
          position: trade.direction === "long" ? "aboveBar" : "belowBar",
          color: OVERLAY_COLORS.exit,
          shape: trade.direction === "long" ? "arrowDown" : "arrowUp",
          text: `EXIT ${trade.exit.toFixed(decimals)}${
            trade.realizedPnlInr != null ? ` · ${inr(trade.realizedPnlInr)}` : ""
          }`,
        });
      }
    }
    markersRef.current?.setMarkers(markers);
  }, [
    toggles,
    decimals,
    preview,
    previewActive,
    selectedTrade,
    symbolId,
    sym?.id,
    candles,
    aiSetup,
  ]);

  /* ------------------------------- render ---------------------------- */
  const statusBadge =
    status === "LIVE" && freshness === "LIVE"
      ? { text: "LIVE", cls: "bg-[#00E676]/15 text-[#00E676]" }
      : status === "ERROR"
        ? { text: "UNAVAILABLE", cls: "bg-[#FF1744]/15 text-[#FF1744]" }
        : { text: freshness ?? status, cls: "bg-[#F4C430]/15 text-[#F4C430]" };

  const toggleRows = [
    { key: "entry" as const, label: "Entry", dot: OVERLAY_COLORS.entry },
    { key: "stop" as const, label: "Stop", dot: OVERLAY_COLORS.stop },
    { key: "targets" as const, label: "Targets", dot: OVERLAY_COLORS.target },
    { key: "exit" as const, label: "Exit", dot: OVERLAY_COLORS.exit },
    { key: "box" as const, label: "R:R zone", dot: "#94a3b8" },
    { key: "ai" as const, label: "AI setup", dot: OVERLAY_COLORS.ai },
  ];

  return (
    <section
      className={cn(
        "overflow-hidden border border-[#1B263B] bg-[#0b101b]",
        expanded
          ? "fixed inset-0 z-[60] flex flex-col rounded-none"
          : "rounded-2xl",
      )}
    >
      {/* header: instrument + price + feed honesty */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#1B263B] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-foreground">
            {sym?.name ?? symbolId}
            <span className="ml-1.5 font-mono text-[11px] font-semibold text-muted-foreground">
              {symbolId}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            Simulated chart · no orders are sent anywhere
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide",
              statusBadge.cls,
            )}
          >
            {statusBadge.text}
          </span>
          <span className="font-mono text-lg font-bold tabular-nums text-foreground">
            {lastCandle ? lastCandle.close.toFixed(decimals) : "—"}
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>
            {timeLabel(updatedAt)}
            {klines.ageSeconds != null && klines.ageSeconds > 60
              ? ` · delayed ${Math.round(klines.ageSeconds / 60)}m`
              : ""}
          </span>
          {error && (
            <span className="truncate text-[#FF1744]">
              {error} — no prices are fabricated
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onIntervalChange(tf)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  tf === intervalId
                    ? "bg-[#F4C430] text-[#0a0e1a]"
                    : "text-slate-400 hover:bg-white/5 hover:text-foreground",
                )}
              >
                {TIMEFRAMES.find((t) => t.id === tf)?.label ?? tf}
              </button>
            ))}
            <button
              type="button"
              onClick={() => chartRef.current?.timeScale().fitContent()}
              aria-label="Fit chart"
              className="rounded p-1 text-slate-400 hover:text-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Exit fullscreen chart" : "Fullscreen chart"}
              className="rounded p-1 text-slate-400 hover:text-foreground"
            >
              {expanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5 rotate-45" />
              )}
            </button>
            <button
              type="button"
              onClick={klines.retry}
              aria-label="Reload chart data"
              className="rounded p-1 text-slate-400 hover:text-foreground"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* trade selector + overlay toggles */}
      <div className="border-b border-[#1B263B] px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Trades
          </span>
          {trades.length === 0 && (
            <span className="text-[10px] text-slate-500">
              none yet — open a simulated position below
            </span>
          )}
          {trades.slice(0, 12).map((t) => (
            <button
              key={t._id}
              type="button"
              onClick={() => onSelectTrade(t._id)}
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                t._id === selectedTradeId
                  ? "border-[#F4C430]/60 bg-[#F4C430]/15 text-[#F4C430]"
                  : "border-[#1B263B] text-slate-400 hover:text-foreground",
              )}
            >
              {t.symbol}
              <span
                className={cn(
                  "ml-1 text-[9px]",
                  t.direction === "long" ? "text-[#00E676]" : "text-[#FF1744]",
                )}
              >
                {t.direction === "long" ? "L" : "S"}
              </span>
              {t.status === "CLOSED" && (
                <span className="ml-1 text-[9px] text-[#00F0FF]">×</span>
              )}
            </button>
          ))}
          {selectedTradeId && (
            <button
              type="button"
              onClick={() => onSelectTrade(null)}
              className="shrink-0 rounded border border-[#1B263B] px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {toggleRows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() =>
                setToggles((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
              }
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                toggles[row.key]
                  ? "bg-white/5 text-slate-200"
                  : "text-slate-600 line-through",
              )}
            >
              {toggles[row.key] ? (
                <Eye className="size-3" />
              ) : (
                <EyeOff className="size-3" />
              )}
              <span
                className="size-1.5 rounded-full"
                style={{ background: row.dot }}
              />
              {row.label}
            </button>
          ))}
          {selectedTrade && (
            <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-slate-300">
              <TrendingUp className="size-3 text-[#F4C430]" />
              {selectedTrade.direction.toUpperCase()} {selectedTrade.size}
              {selectedPnlInr != null && selectedTrade.status === "OPEN" && (
                <span
                  className={cn(
                    "font-bold",
                    selectedPnlInr >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                  )}
                >
                  {inr(selectedPnlInr)}
                </span>
              )}
              {selectedTrade.status === "CLOSED" &&
                selectedTrade.realizedPnlInr != null && (
                  <span
                    className={cn(
                      "font-bold",
                      selectedTrade.realizedPnlInr >= 0
                        ? "text-[#00E676]"
                        : "text-[#FF1744]",
                    )}
                  >
                    {inr(selectedTrade.realizedPnlInr)}
                  </span>
                )}
            </span>
          )}
        </div>
      </div>

      {aiSetup && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1B263B] bg-[#A855F7]/[0.06] px-3 py-1.5">
          <Sparkles className="size-3.5 shrink-0 text-[#A855F7]" />
          <p className="min-w-0 flex-1 truncate text-[10px] text-purple-200">
            DEEEPR setup on chart · {aiSetup.decision} · {aiSetup.confidence} confidence · analysis{" "}
            {new Date(aiSetup.timestamp).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            <span className="ml-1 text-purple-300/70">(annotations only — not an order)</span>
          </p>
          {onClearAiSetup && (
            <button
              type="button"
              onClick={onClearAiSetup}
              className="shrink-0 rounded border border-[#A855F7]/40 px-1.5 py-0.5 text-[10px] font-semibold text-purple-200 hover:bg-[#A855F7]/15"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* the chart itself */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className={cn(
            "w-full",
            expanded ? "h-[calc(100dvh-200px)]" : "h-[340px] sm:h-[440px]",
          )}
        />
        {chartError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b101b]/80 px-4">
            <p className="rounded-lg border border-[#FF1744]/40 bg-[#FF1744]/10 px-3 py-2 text-center text-[11px] text-[#FF1744]">
              Chart unavailable: {chartError}
            </p>
          </div>
        )}
        {candles.length === 0 && !chartError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0b101b]/60">
            <p className="rounded-lg border border-[#1B263B] bg-[#0D1424] px-3 py-2 text-[11px] text-slate-400">
              {status === "ERROR"
                ? "No market data available for this instrument."
                : "Waiting for market data…"}
            </p>
          </div>
        )}
      </div>

      <p className="border-t border-[#1B263B] px-3 py-1.5 text-[10px] text-muted-foreground">
        {previewActive
          ? "Previewing unsaved levels — confirm the position to store them."
          : selectedTrade
            ? selectedTrade.status === "CLOSED"
              ? "Closed trade — stored entry and actual exit are preserved."
              : "Open simulated position — levels are the stored record, not draggable."
            : "Select a trade or type levels in the form to see overlays."}
      </p>
    </section>
  );
}
