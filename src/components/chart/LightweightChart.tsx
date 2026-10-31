import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { KlinesState } from "@/hooks/use-klines";
import { ema, getIndicator, sma, vwap } from "@/lib/indicators";
import { findSymbol, type Candle, type TimeframeId } from "@/lib/market";

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
    </div>
  );
}
