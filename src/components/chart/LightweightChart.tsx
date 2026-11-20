import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Eye, EyeOff, SlidersHorizontal, X } from "lucide-react";
import type { KlinesState } from "@/hooks/use-klines";
import { ema, getIndicator, sma, vwap } from "@/lib/indicators";
import { findSymbol, type Candle, type TimeframeId } from "@/lib/market";
import {
  strategyMatchesChart,
  useStrategy,
} from "@/contexts/StrategyContext";
import { RiskRewardBoxPrimitive } from "./risk-reward-primitive";
import { cn } from "@/lib/utils";

/* ============================================================================
   Lightweight Charts mode — the app's OWN chart, fed by the same validated
   kline pipeline (useKlines) that drives the radar, watchlist and signals.

   Supports: candlesticks, volume histogram, crosshair, timeframe changes
   (driven by the terminal's timeframe buttons), EMA/SMA/VWAP overlays from
   the indicator drawer, and responsive resizing (autoSize → ResizeObserver).
   ========================================================================== */

type OverlayId =
  | "ema9"
  | "ema21"
  | "ema50"
  | "ema100"
  | "ema200"
  | "sma20"
  | "sma50"
  | "vwap";

const OVERLAY_IDS: OverlayId[] = [
  "ema9",
  "ema21",
  "ema50",
  "ema100",
  "ema200",
  "sma20",
  "sma50",
  "vwap",
];

const OVERLAY_SPEC: Record<OverlayId, { kind: "ema" | "sma" | "vwap"; period?: number }> = {
  ema9: { kind: "ema", period: 9 },
  ema21: { kind: "ema", period: 21 },
  ema50: { kind: "ema", period: 50 },
  ema100: { kind: "ema", period: 100 },
  ema200: { kind: "ema", period: 200 },
  sma20: { kind: "sma", period: 20 },
  sma50: { kind: "sma", period: 50 },
  vwap: { kind: "vwap" },
};

function overlayData(
  id: OverlayId,
  candles: Candle[],
): { time: UTCTimestamp; value: number }[] {
  const closes = candles.map((c) => c.close);
  const spec = OVERLAY_SPEC[id];
  const vals =
    spec.kind === "ema"
      ? ema(closes, spec.period as number)
      : spec.kind === "sma"
        ? sma(closes, spec.period as number)
        : vwap(candles);
  const pts: { time: UTCTimestamp; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = vals[i];
    if (v !== null && Number.isFinite(v)) {
      pts.push({ time: candles[i].time as UTCTimestamp, value: v });
    }
  }
  return pts;
}

interface LightweightChartProps {
  /** The validated kline state from the parent (same pipeline as everywhere). */
  klines: KlinesState;
  symbolId: string;
  intervalId: TimeframeId;
  /** Indicator ids from the terminal's indicator drawer (e.g. "ema200", "volume"). */
  indicators: readonly string[];
}

export default function LightweightChart({
  klines,
  symbolId,
  intervalId,
  indicators,
}: LightweightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<Map<OverlayId, ISeriesApi<"Line">>>(new Map());
  const viewKeyRef = useRef<string>("");
  const pendingFitRef = useRef(true);

  const { candles, status, error, freshness, source } = klines;
  const showVolume = indicators.includes("volume");
  const indicatorKey = indicators.join(",");

  /* ---- strategy signal overlay (chart-native, never a floating card) ---- */
  const { activeStrategy, clearStrategy } = useStrategy();
  const signal = strategyMatchesChart(activeStrategy, symbolId, intervalId)
    ? activeStrategy
    : null;
  const [showSignal, setShowSignal] = useState(true);
  const [showEntry, setShowEntry] = useState(true);
  const [showSl, setShowSl] = useState(true);
  const [showTps, setShowTps] = useState(true);
  const [showBox, setShowBox] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const boxRef = useRef<RiskRewardBoxPrimitive | null>(null);

  /* ---- create / destroy the chart instance ---- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
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
      rightPriceScale: { borderColor: "#1B263B" },
      timeScale: {
        borderColor: "#1B263B",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;
    const overlays = overlaySeriesRef.current;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#00E676",
      downColor: "#FF1744",
      borderVisible: false,
      wickUpColor: "rgba(0, 230, 118, 0.85)",
      wickDownColor: "rgba(255, 23, 68, 0.85)",
    });
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    return () => {
      overlays.clear();
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  /* ---- push data + sync overlays whenever candles/indicators change ---- */
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const sym = findSymbol(symbolId);
    const decimals = sym?.decimals ?? 2;
    candleSeries.applyOptions({
      priceFormat: {
        type: "price",
        precision: decimals,
        minMove: 10 ** -decimals,
      },
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    volumeSeries.setData(
      showVolume
        ? candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color:
              c.close >= c.open
                ? "rgba(0, 230, 118, 0.35)"
                : "rgba(255, 23, 68, 0.35)",
          }))
        : [],
    );

    /* overlay series — add/remove with the indicator drawer, refresh values */
    const requested = new Set(indicatorKey.split(","));
    const activeIds = new Set(
      OVERLAY_IDS.filter((id) => requested.has(id)),
    );
    for (const [id, series] of overlaySeriesRef.current) {
      if (!activeIds.has(id)) {
        chart.removeSeries(series);
        overlaySeriesRef.current.delete(id);
      }
    }
    for (const id of activeIds) {
      let series = overlaySeriesRef.current.get(id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: getIndicator(id)?.color ?? "#F4C430",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        overlaySeriesRef.current.set(id, series);
      }
      series.setData(overlayData(id, candles));
    }

    /* recenter only on symbol/timeframe change or first data — never on ticks */
    const viewKey = `${symbolId}|${intervalId}`;
    if (viewKey !== viewKeyRef.current) {
      viewKeyRef.current = viewKey;
      pendingFitRef.current = true;
    }
    if (pendingFitRef.current && candles.length > 0) {
      chart.timeScale().fitContent();
      pendingFitRef.current = false;
    }
  }, [candles, indicatorKey, symbolId, intervalId, showVolume]);

  /* ------------------------------------------------------------------
     Strategy signal drawing — chart-native price lines (entry / SL / TPs)
     plus a translucent risk/reward box primitive. Everything is expressed
     in price coordinates, so it tracks zoom, scroll and resize. Nothing is
     rendered as a DOM layer over the candles.
     ------------------------------------------------------------------ */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (boxRef.current) {
      series.detachPrimitive(boxRef.current);
      boxRef.current = null;
    }

    if (!signal || !showSignal) return;
    const isLong = signal.signalType === "LONG" || signal.signalType === "BUY";
    const addLine = (
      price: number | undefined,
      color: string,
      title: string,
    ) => {
      if (price == null || !Number.isFinite(price)) return;
      priceLinesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        }),
      );
    };

    if (showEntry) {
      const pair = signal.asset ?? symbolId;
      addLine(
        signal.entryMin,
        "#F4C430",
        `${signal.signalType} ${pair} ${signal.timeframe ?? intervalId}`,
      );
      if (signal.entryMax !== signal.entryMin) {
        addLine(signal.entryMax, "rgba(244,196,48,0.75)", "ENTRY");
      }
    }
    if (showSl) addLine(signal.stopLoss, "#FF1744", "SL");
    if (showTps) {
      [signal.tp1, signal.tp2, signal.tp3, signal.tp4].forEach((tp, i) =>
        addLine(tp, "#00E676", `TP${i + 1}`),
      );
    }
    if (showBox) {
      const targets = [signal.tp1, signal.tp2, signal.tp3, signal.tp4].filter(
        (v): v is number => v != null && Number.isFinite(v),
      );
      const entry = (signal.entryMin + signal.entryMax) / 2;
      const target = targets.length
        ? isLong
          ? Math.max(...targets)
          : Math.min(...targets)
        : null;
      if (
        target != null &&
        Number.isFinite(signal.stopLoss) &&
        Math.abs(target - entry) > 0
      ) {
        const lastBar = candles.length
          ? (candles[candles.length - 1].time as UTCTimestamp)
          : (0 as UTCTimestamp);
        boxRef.current = new RiskRewardBoxPrimitive(series, {
          entry,
          stop: signal.stopLoss,
          target,
          anchorTime: lastBar,
          bars: 15,
          label: `R:R 1:${(
            Math.abs(target - entry) / Math.abs(entry - signal.stopLoss)
          ).toFixed(1)}`,
        });
        series.attachPrimitive(boxRef.current);
      }
    }
  }, [
    signal,
    showSignal,
    showEntry,
    showSl,
    showTps,
    showBox,
    symbolId,
    intervalId,
    candles.length,
  ]);

  const emptyTitle =
    status === "ERROR"
      ? "Feed error"
      : status === "CONNECTING" || status === "RECONNECTING"
        ? "Connecting to feed…"
        : "No candles";
  const emptyDetail =
    status === "ERROR"
      ? (error ?? "The validated feed returned no data for this symbol.")
      : `${symbolId} · ${intervalId} — synthetic candles are never drawn.`;

  return (
    <div className="relative h-full w-full bg-[#0b101b]">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      {candles.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
          <div className="rounded-lg border border-[#1B263B] bg-[#0b101b]/90 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-xs font-semibold text-slate-200">{emptyTitle}</p>
            <p className="mt-1 max-w-[280px] text-[10px] leading-4 text-muted-foreground">
              {emptyDetail}
            </p>
          </div>
        </div>
      )}
      {candles.length > 0 && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-[#1B263B] bg-[#0b101b]/75 px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-slate-400 backdrop-blur-sm">
          {symbolId} · {intervalId} · lightweight-charts
          <span
            className={
              freshness === "LIVE"
                ? "text-[#00E676]"
                : freshness === "DELAYED"
                  ? "text-[#F4C430]"
                  : "text-[#FF1744]"
            }
          >
            {source === "binance" ? "BINANCE" : source === "twelvedata" ? "TWELVEDATA" : ""}
          </span>
        </div>
      )}

      {/* Compact signal chip — small, never a large card over candles */}
      {signal && showSignal && candles.length > 0 && (
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="absolute left-2 top-9 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-[#F4C430]/40 bg-[#0b101b]/85 px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-[#F4C430] backdrop-blur-sm"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              signal.signalType === "LONG" || signal.signalType === "BUY"
                ? "bg-[#00E676]"
                : "bg-[#FF1744]",
            )}
          />
          <span className="truncate">
            {signal.signalType} · {signal.asset ?? symbolId} · {signal.timeframe ?? intervalId}
            {signal.rr != null ? ` · R:R 1:${signal.rr.toFixed(1)}` : ""}
          </span>
        </button>
      )}

      {/* Tap-to-view details — small panel, dismissible */}
      {signal && showSignal && detailsOpen && candles.length > 0 && (
        <div className="absolute left-2 top-[68px] z-20 w-[240px] max-w-[calc(100%-1rem)] rounded-xl border border-[#1B263B] bg-[#0b101b]/95 p-2.5 font-mono text-[10px] shadow-lg backdrop-blur-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-bold tracking-wider text-[#F4C430]">
              {signal.signalType} {signal.asset ?? symbolId} · {signal.timeframe ?? intervalId}
            </span>
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              aria-label="Close signal details"
              className="text-slate-500 hover:text-slate-200"
            >
              <X className="size-3" />
            </button>
          </div>
          {[
            ["ENTRY", signal.entryMin],
            ...(signal.entryMax !== signal.entryMin
              ? ([["ENTRY MAX", signal.entryMax]] as [string, number][])
              : []),
            ["STOP", signal.stopLoss],
            ...([
              ["TP1", signal.tp1],
              ["TP2", signal.tp2],
              ["TP3", signal.tp3],
              ["TP4", signal.tp4],
            ].filter(([, v]) => v != null) as [string, number][]),
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 py-px">
              <span className="text-slate-500">{label}</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  label === "ENTRY" || label === "ENTRY MAX"
                    ? "text-[#F4C430]"
                    : label === "STOP"
                      ? "text-[#FF1744]"
                      : "text-[#00E676]",
                )}
              >
                {value.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          ))}
          {signal.rr != null && (
            <p className="mt-1 text-[9px] text-muted-foreground">
              Risk/Reward 1:{signal.rr.toFixed(1)}
            </p>
          )}
        </div>
      )}

      {/* Signal controls — compact, scrollable on phones */}
      {signal && candles.length > 0 && (
        <div className="absolute bottom-2 left-2 z-20 flex max-w-[calc(100%-1rem)] flex-col gap-1">
          <button
            type="button"
            onClick={() => setControlsOpen((v) => !v)}
            className="flex size-6 items-center justify-center rounded-md border border-[#1B263B] bg-[#0b101b]/85 text-slate-400 backdrop-blur-sm hover:text-[#F4C430]"
            aria-label="Signal overlay controls"
          >
            <SlidersHorizontal className="size-3" />
          </button>
          {controlsOpen && (
            <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-[#1B263B] bg-[#0b101b]/90 p-1 backdrop-blur-sm">
              <ToggleChip active={showSignal} onClick={() => setShowSignal((v) => !v)} label="Lines" />
              <ToggleChip active={showEntry} onClick={() => setShowEntry((v) => !v)} label="Entry" />
              <ToggleChip active={showSl} onClick={() => setShowSl((v) => !v)} label="SL" />
              <ToggleChip active={showTps} onClick={() => setShowTps((v) => !v)} label="TPs" />
              <ToggleChip active={showBox} onClick={() => setShowBox((v) => !v)} label="Box" />
              <button
                type="button"
                onClick={() => {
                  clearStrategy();
                  setDetailsOpen(false);
                }}
                className="rounded px-1.5 py-0.5 text-[9px] font-bold text-[#FF1744] hover:bg-[#FF1744]/10"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold transition-colors",
        active
          ? "bg-[#F4C430]/15 text-[#F4C430]"
          : "text-slate-500 hover:text-slate-300",
      )}
      aria-pressed={active}
    >
      {active ? <Eye className="size-2.5" /> : <EyeOff className="size-2.5" />}
      {label}
    </button>
  );
}
