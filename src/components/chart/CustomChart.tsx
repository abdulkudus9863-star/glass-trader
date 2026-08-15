import { Bug, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { KlineStatus, DataFreshness } from "@/hooks/use-klines";
import { getIndicator } from "@/lib/indicators";
import { type SmcOverlay } from "@/lib/smc";
import type { StrategyOverlay } from "@/lib/strategy";
import {
  type Candle,
  type MarketError,
  atr,
  detectFVG,
  ema,
  formatCompact,
  formatPercent,
  formatPrice,
  formatTime,
  heikinAshi,
  macd,
  rsi,
  sma,
  stddev,
  vwap,
} from "@/lib/market";
import { cn } from "@/lib/utils";

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

interface Pt {
  time: number;
  price: number;
}

type Drawing =
  | { id: string; kind: "horizontal"; time: number; price: number }
  | { id: string; kind: "trendline"; p1: Pt; p2: Pt }
  | { id: string; kind: "fib"; p1: Pt; p2: Pt }
  | { id: string; kind: "rect"; p1: Pt; p2: Pt }
  | { id: string; kind: "long" | "short"; time: number; price: number };

interface RectBox {
  left: number;
  top: number;
  width: number;
  height: number;
  bullish: boolean;
  label?: string;
  bottomLabel?: string;
  tone?: "cyan";
}

interface Readout {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Honest feed state surfaced by the chart (never fabricates values). */
export interface ChartFeed {
  status: KlineStatus;
  error: string | null;
  errorCode: MarketError["code"] | null;
  source: "binance" | "twelvedata" | null;
  providerSymbol: string | null;
  ageSeconds: number | null;
  latencyMs: number | null;
  updatedAt: number | null;
  freshness: DataFreshness;
  gap: boolean;
  missingCandles: number;
  candleCount: number;
  retry: () => void;
}

interface CustomChartProps {
  candles: Candle[];
  symbolId: string;
  decimals: number;
  intraday: boolean;
  chartType: ChartType;
  indicatorIds: string[];
  tool: ToolId;
  onToolConsumed: () => void;
  resetKey: string;
  className?: string;
  /** Push the OHLC readout down so a top-left badge can sit above it. */
  readoutOffset?: boolean;
  /** Compiled strategy overlays to render (signal, zones, SL/TP lines). */
  strategies?: StrategyOverlay[];
  /** Live SMC overlays (watch zones, whale walls, swing S/R) for this symbol. */
  smc?: SmcOverlay | null;
  /** Live feed state — drives LOADING / ERROR / STALE / LIVE overlays. */
  feed?: ChartFeed | null;
}

/* ------------------------- series data helpers -------------------------- */

type MainData = { time: UTCTimestamp } & Record<string, number>;

function toMainData(candles: Candle[], type: ChartType): MainData[] {
  const src = type === "heikin" ? heikinAshi(candles) : candles;
  if (type === "line") {
    return src.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }));
  }
  return src.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

function createIndicatorSeries(
  chart: IChartApi,
  id: string,
  store: Map<string, ISeriesApi<any>>,
) {
  const def = getIndicator(id);
  if (!def) return;
  const pane = def.pane;

  if (id === "volume") {
    const s = chart.addSeries(
      HistogramSeries,
      { priceScaleId: "", priceLineVisible: false, lastValueVisible: false },
      pane,
    );
    s.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    store.set("volume", s);
  } else if (id === "macd") {
    store.set(
      "macd-hist",
      chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        pane,
      ),
    );
    store.set(
      "macd-macd",
      chart.addSeries(
        LineSeries,
        { color: "#00e676", lineWidth: 1, priceLineVisible: false },
        pane,
      ),
    );
    store.set(
      "macd-signal",
      chart.addSeries(
        LineSeries,
        { color: "#f4c430", lineWidth: 1, priceLineVisible: false },
        pane,
      ),
    );
  } else if (id === "bollinger") {
    store.set(
      "bollinger-mid",
      chart.addSeries(LineSeries, {
        color: "#64748b",
        lineWidth: 1,
        priceLineVisible: false,
      }),
    );
    store.set(
      "bollinger-up",
      chart.addSeries(LineSeries, {
        color: "rgba(100,116,139,0.45)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      }),
    );
    store.set(
      "bollinger-low",
      chart.addSeries(LineSeries, {
        color: "rgba(100,116,139,0.45)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      }),
    );
  } else {
    store.set(
      id,
      chart.addSeries(
        LineSeries,
        { color: def.color, lineWidth: 1, priceLineVisible: false },
        pane,
      ),
    );
  }
}

function updateIndicatorSeries(
  id: string,
  series: ISeriesApi<any>,
  candles: Candle[],
) {
  const closes = candles.map((c) => c.close);
  const t = (i: number) => candles[i].time as UTCTimestamp;
  const toLine = (values: (number | null)[]): LineData[] => {
    const out: LineData[] = [];
    values.forEach((v, i) => {
      if (v != null) out.push({ time: t(i), value: v });
    });
    return out;
  };

  if (id === "volume") {
    series.setData(
      candles.map((c, i) => ({
        time: t(i),
        value: c.volume,
        color:
          c.close >= c.open ? "rgba(0,230,118,0.40)" : "rgba(255,23,68,0.40)",
      })),
    );
  } else if (id === "macd-macd" || id === "macd-signal" || id === "macd-hist") {
    const m = macd(closes);
    if (id === "macd-hist") {
      const data: { time: UTCTimestamp; value: number; color: string }[] = [];
      m.histogram.forEach((v, i) => {
        if (v != null)
          data.push({
            time: t(i),
            value: v,
            color: v >= 0 ? "rgba(0,230,118,0.5)" : "rgba(255,23,68,0.5)",
          });
      });
      series.setData(data);
    } else {
      series.setData(toLine(id === "macd-macd" ? m.macd : m.signal));
    }
  } else if (
    id === "bollinger-mid" ||
    id === "bollinger-up" ||
    id === "bollinger-low"
  ) {
    const mid = sma(closes, 20);
    const sd = stddev(closes, 20);
    const data: LineData[] = [];
    candles.forEach((c, i) => {
      if (mid[i] == null || sd[i] == null) return;
      const m = mid[i] as number;
      const s = sd[i] as number;
      const v =
        id === "bollinger-up" ? m + 2 * s : id === "bollinger-low" ? m - 2 * s : m;
      data.push({ time: t(i), value: v });
    });
    series.setData(data);
  } else if (id === "rsi14") series.setData(toLine(rsi(closes, 14)));
  else if (id === "atr") series.setData(toLine(atr(candles, 14)));
  else if (id === "sma20") series.setData(toLine(sma(closes, 20)));
  else if (id === "sma50") series.setData(toLine(sma(closes, 50)));
  else if (id === "ema9") series.setData(toLine(ema(closes, 9)));
  else if (id === "ema21") series.setData(toLine(ema(closes, 21)));
  else if (id === "ema50") series.setData(toLine(ema(closes, 50)));
  else if (id === "ema200") series.setData(toLine(ema(closes, 200)));
  else if (id === "vwap") series.setData(toLine(vwap(candles)));
}

function pointSegDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const TOOL_HINTS: Record<string, string> = {
  trendline: "Click two points to draw a trendline",
  horizontal: "Click anywhere to place a horizontal line",
  fib: "Click two points to draw Fibonacci retracement",
  rect: "Click two points to draw a rectangle",
  long: "Click to mark a long entry",
  short: "Click to mark a short entry",
  eraser: "Click a drawing to erase it",
};

/* ------------------------------ component ------------------------------- */

export default function CustomChart({
  candles,
  symbolId,
  decimals,
  intraday,
  chartType,
  indicatorIds,
  tool,
  onToolConsumed,
  resetKey,
  className,
  readoutOffset = false,
  strategies = [],
  smc = null,
  feed = null,
}: CustomChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const trendSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const previewSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const strategiesRef = useRef<StrategyOverlay[]>([]);
  const strategyLinesRef = useRef<Map<string, IPriceLine[]>>(new Map());
  const smcRef = useRef<SmcOverlay | null>(null);
  const smcPriceLinesRef = useRef<IPriceLine[]>([]);
  const symbolIdRef = useRef(symbolId);

  const candlesRef = useRef<Candle[]>(candles);
  const drawingsRef = useRef<Drawing[]>([]);
  const toolRef = useRef<ToolId>(tool);
  const pendingRef = useRef<Pt | null>(null);
  const hoverRef = useRef(false);
  const chartTypeRef = useRef(chartType);
  const indicatorIdsRef = useRef(indicatorIds);
  const decimalsRef = useRef(decimals);
  const intradayRef = useRef(intraday);
  const onToolConsumedRef = useRef(onToolConsumed);
  const lastFirstTimeRef = useRef<number | null>(null);

  candlesRef.current = candles;
  toolRef.current = tool;
  chartTypeRef.current = chartType;
  indicatorIdsRef.current = indicatorIds;
  decimalsRef.current = decimals;
  intradayRef.current = intraday;
  onToolConsumedRef.current = onToolConsumed;
  strategiesRef.current = strategies;
  smcRef.current = smc;
  symbolIdRef.current = symbolId;

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [rects, setRects] = useState<RectBox[]>([]);
  /* CRITICAL FIX — the readout must never be seeded from a zero candle.
     When the feed is empty it stays null and the chart shows the honest
     LOADING / ERROR / STALE overlay instead of O 0.00 H 0.00 L 0.00 C 0.00. */
  const [readout, setReadout] = useState<Readout | null>(() => {
    const last = candles[candles.length - 1];
    return last ? fromCandle(last) : null;
  });
  /* debug diagnostics panel toggle (§25) */
  const [debugOpen, setDebugOpen] = useState(false);

  drawingsRef.current = drawings;

  /* ---------------------------- core callbacks --------------------------- */

  const syncMarkers = useCallback(() => {
    const plugin = markersPluginRef.current;
    if (!plugin) return;
    const markerDrawings = drawingsRef.current.filter(
      (d): d is Extract<Drawing, { kind: "long" | "short" }> =>
        d.kind === "long" || d.kind === "short",
    );
    const markers: SeriesMarker<Time>[] = markerDrawings.map((d) => ({
      time: d.time as UTCTimestamp,
      position: d.kind === "long" ? "belowBar" : "aboveBar",
      color: d.kind === "long" ? "#00e676" : "#ff1744",
      shape: d.kind === "long" ? "arrowUp" : "arrowDown",
      text: d.kind === "long" ? "LONG" : "SHORT",
    }));
    const last = candlesRef.current[candlesRef.current.length - 1];
    for (const st of strategiesRef.current) {
      if (!st.visible || st.bias === "WAIT") continue;
      if (st.asset !== symbolIdRef.current) continue;
      if (!last) continue;
      markers.push({
        time: last.time as UTCTimestamp,
        position: st.bias === "LONG" ? "belowBar" : "aboveBar",
        color: st.bias === "LONG" ? "#00e676" : "#ff1744",
        shape: st.bias === "LONG" ? "arrowUp" : "arrowDown",
        text: st.bias,
      });
    }
    plugin.setMarkers(markers);
  }, []);

  const syncDrawingVisuals = useCallback(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main) return;
    for (const pl of priceLinesRef.current.values()) main.removePriceLine(pl);
    priceLinesRef.current.clear();
    for (const s of trendSeriesRef.current.values()) chart.removeSeries(s);
    trendSeriesRef.current.clear();

    for (const d of drawingsRef.current) {
      if (d.kind === "horizontal") {
        priceLinesRef.current.set(
          d.id,
          main.createPriceLine({
            price: d.price,
            color: "rgba(0,240,255,0.85)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
          }),
        );
      } else if (d.kind === "trendline") {
        const s = chart.addSeries(LineSeries, {
          color: "rgba(0,240,255,0.9)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData([
          { time: d.p1.time as UTCTimestamp, value: d.p1.price },
          { time: d.p2.time as UTCTimestamp, value: d.p2.price },
        ]);
        trendSeriesRef.current.set(d.id, s);
      } else if (d.kind === "fib") {
        const lo = Math.min(d.p1.price, d.p2.price);
        const hi = Math.max(d.p1.price, d.p2.price);
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        levels.forEach((lv, i) => {
          priceLinesRef.current.set(
            `${d.id}-${i}`,
            main.createPriceLine({
              price: lo + (hi - lo) * lv,
              color:
                i === 3 ? "rgba(244,196,48,0.95)" : "rgba(0,240,255,0.55)",
              lineWidth: i === 3 ? 2 : 1,
              lineStyle: i === 3 ? LineStyle.Solid : LineStyle.Dotted,
              axisLabelVisible: i === 3,
            }),
          );
        });
        const s = chart.addSeries(LineSeries, {
          color: "rgba(245,158,11,0.9)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData([
          { time: d.p1.time as UTCTimestamp, value: d.p1.price },
          { time: d.p2.time as UTCTimestamp, value: d.p2.price },
        ]);
        trendSeriesRef.current.set(d.id, s);
      }
    }
  }, []);

  const syncStrategyVisuals = useCallback(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main) return;
    for (const lines of strategyLinesRef.current.values()) {
      for (const pl of lines) main.removePriceLine(pl);
    }
    strategyLinesRef.current.clear();

    for (const st of strategiesRef.current) {
      if (!st.visible || st.bias === "WAIT") continue;
      if (st.asset !== symbolIdRef.current) continue;
      const lines: IPriceLine[] = [];
      const add = (
        price: number,
        color: string,
        title: string,
        style: LineStyle,
      ) => {
        lines.push(
          main.createPriceLine({
            price,
            color,
            title,
            lineWidth: 1,
            lineStyle: style,
            axisLabelVisible: true,
          }),
        );
      };
      add(st.stopLoss, "#ff1744", "SL", LineStyle.Solid);
      add(st.takeProfits[0], "#00e676", "TP1", LineStyle.Solid);
      add(st.takeProfits[1], "#00e676", "TP2", LineStyle.Solid);
      add(st.entryZone[0], "#f4c430", st.bias, LineStyle.Dashed);
      add(st.entryZone[1], "#f4c430", "", LineStyle.Dashed);
      strategyLinesRef.current.set(st.id, lines);
    }
  }, []);

  const syncSmcVisuals = useCallback(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main) return;
    for (const pl of smcPriceLinesRef.current) main.removePriceLine(pl);
    smcPriceLinesRef.current = [];

    const overlay = smcRef.current;
    if (!overlay) return;

    /* swing S/R — dashed, color-coded support/resistance tags */
    for (const lvl of overlay.swingLevels) {
      smcPriceLinesRef.current.push(
        main.createPriceLine({
          price: lvl.price,
          color: lvl.kind === "R" ? "rgba(255,23,68,0.9)" : "rgba(0,230,118,0.9)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: lvl.kind,
          axisLabelVisible: true,
        }),
      );
    }

    /* whale walls — solid orderbook walls on the right price scale */
    for (const wall of overlay.whaleWalls) {
      smcPriceLinesRef.current.push(
        main.createPriceLine({
          price: wall.price,
          color: wall.side === "ask" ? "rgba(255,23,68,0.75)" : "rgba(0,230,118,0.75)",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          title: wall.size,
          axisLabelVisible: true,
        }),
      );
    }

    /* watch zones — cyan band edges */
    for (const zone of overlay.watchZones) {
      smcPriceLinesRef.current.push(
        main.createPriceLine({
          price: zone.top,
          color: "rgba(0,240,255,0.65)",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
        }),
        main.createPriceLine({
          price: zone.bottom,
          color: "rgba(0,240,255,0.65)",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
        }),
      );
    }

    /* EMA tip badges on active moving averages */
    const closes = candlesRef.current.map((c) => c.close);
    const active = indicatorIdsRef.current;
    const badge = (id: "ema9" | "ema21", title: string, color: string) => {
      if (!active.includes(id)) return;
      const vals = ema(closes, id === "ema9" ? 9 : 21);
      const tip = vals[vals.length - 1];
      if (tip == null) return;
      smcPriceLinesRef.current.push(
        main.createPriceLine({
          price: tip,
          color: "rgba(255,255,255,0.06)",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          title,
          axisLabelVisible: true,
          axisLabelColor: color,
          axisLabelTextColor: "#0a0e1a",
        }),
      );
    };
    badge("ema9", "EMA 9", "#F4C430");
    badge("ema21", "EMA 21", "#3b82f6");
  }, []);

  const computeRects = useCallback(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    const c = candlesRef.current;
    if (!chart || !main) {
      setRects([]);
      return;
    }
    const boxes: RectBox[] = [];
    const push = (
      t1: number,
      t2: number,
      pTop: number,
      pBot: number,
      bullish: boolean,
      label?: string,
      bottomLabel?: string,
      tone?: "cyan",
    ) => {
      const x1 = chart.timeScale().timeToCoordinate(t1 as Time);
      const x2 = chart.timeScale().timeToCoordinate(t2 as Time);
      const y1 = main.priceToCoordinate(pTop);
      const y2 = main.priceToCoordinate(pBot);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return;
      boxes.push({
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        bullish,
        label,
        bottomLabel,
        tone,
      });
    };

    /* SMC watch zones — full-width cyan rejection bands around current price */
    for (const zone of smcRef.current?.watchZones ?? []) {
      const ts = chart.timeScale();
      const vr = ts.getVisibleRange();
      let t1: number;
      let t2: number;
      if (vr && vr.from != null && vr.to != null) {
        t1 = vr.from as number;
        t2 = vr.to as number;
      } else {
        const first = c[0];
        const lastC = c[c.length - 1];
        if (!first || !lastC) continue;
        t1 = first.time;
        t2 = lastC.time;
      }
      push(t1, t2, zone.top, zone.bottom, false, "WATCH ZONE ↑", "WATCH ZONE ↓", "cyan");
    }

    for (const d of drawingsRef.current) {
      if (d.kind === "rect")
        push(d.p1.time, d.p2.time, d.p1.price, d.p2.price, d.p1.price <= d.p2.price, "Rect");
    }
    if (indicatorIdsRef.current.includes("fvg")) {
      for (const zone of detectFVG(c)) {
        const c1 = c[zone.startIndex];
        const c2 = c[zone.endIndex];
        if (c1 && c2) push(c1.time, c2.time, zone.top, zone.bottom, zone.bullish, "FVG");
      }
    }
    for (const st of strategiesRef.current) {
      if (!st.visible || st.asset !== symbolIdRef.current) continue;
      if (c.length < 2) continue;
      const start = c[Math.max(0, c.length - 8)];
      const end = c[c.length - 1];
      push(
        start.time,
        end.time,
        Math.max(st.entryZone[0], st.entryZone[1]),
        Math.min(st.entryZone[0], st.entryZone[1]),
        st.bias === "LONG",
        st.bias === "LONG" ? "BUY ZONE" : "SELL ZONE",
      );
    }
    setRects(boxes);
  }, []);

  const syncData = useCallback(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    const c = candlesRef.current;
    if (!chart || !main || c.length === 0) return;
    main.setData(toMainData(c, chartTypeRef.current));
    for (const [id, series] of seriesRefs.current) {
      updateIndicatorSeries(id, series, c);
    }
    syncMarkers();
    computeRects();
    if (!hoverRef.current) {
      setReadout(c.length > 0 ? fromCandle(c[c.length - 1]) : null);
    }
  }, [computeRects, syncMarkers]);

  const rebuildSeriesStructure = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of seriesRefs.current.values()) chart.removeSeries(s);
    seriesRefs.current.clear();
    for (const s of trendSeriesRef.current.values()) chart.removeSeries(s);
    trendSeriesRef.current.clear();
    for (const pl of priceLinesRef.current.values()) {
      mainSeriesRef.current?.removePriceLine(pl);
    }
    priceLinesRef.current.clear();
    if (previewSeriesRef.current) {
      chart.removeSeries(previewSeriesRef.current);
      previewSeriesRef.current = null;
    }
    for (const pl of smcPriceLinesRef.current) {
      mainSeriesRef.current?.removePriceLine(pl);
    }
    smcPriceLinesRef.current = [];
    pendingRef.current = null;

    const c = candlesRef.current;
    const type = chartTypeRef.current;
    let main: ISeriesApi<any>;
    if (type === "line") {
      main = chart.addSeries(LineSeries, {
        color: "#00f0ff",
        lineWidth: 2,
        priceLineVisible: false,
      });
    } else if (type === "bar") {
      main = chart.addSeries(BarSeries, {
        upColor: "#00e676",
        downColor: "#ff1744",
        thinBars: false,
        priceLineVisible: false,
      });
    } else {
      main = chart.addSeries(CandlestickSeries, {
        upColor: "#00e676",
        downColor: "#ff1744",
        wickUpColor: "#00e676",
        wickDownColor: "#ff1744",
        borderVisible: false,
        priceLineVisible: false,
      });
    }
    main.setData(toMainData(c, type));
    mainSeriesRef.current = main;
    markersPluginRef.current = createSeriesMarkers(main as ISeriesApi<any, Time>, []);

    for (const id of indicatorIdsRef.current) {
      createIndicatorSeries(chart, id, seriesRefs.current);
    }
    syncData();
    syncDrawingVisuals();
  }, [syncData, syncDrawingVisuals]);

  /* ------------------------- interaction handlers ------------------------ */

  const removePreview = useCallback(() => {
    const chart = chartRef.current;
    if (previewSeriesRef.current && chart) {
      chart.removeSeries(previewSeriesRef.current);
      previewSeriesRef.current = null;
    }
  }, []);

  const handleCrosshairMove = useCallback(
    (param: MouseEventParams) => {
      const chart = chartRef.current;
      const main = mainSeriesRef.current;
      if (!chart || !main) return;

      const pending = pendingRef.current;
      const activeTool = toolRef.current;
      if (
        pending &&
        (activeTool === "trendline" || activeTool === "fib" || activeTool === "rect") &&
        param.time &&
        param.point
      ) {
        const price = main.coordinateToPrice(param.point.y);
        if (price != null) {
          if (!previewSeriesRef.current) {
            previewSeriesRef.current = chart.addSeries(LineSeries, {
              color: "rgba(0,240,255,0.5)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
          }
          previewSeriesRef.current.setData([
            { time: pending.time as UTCTimestamp, value: pending.price },
            { time: param.time as UTCTimestamp, value: price },
          ]);
        }
      }

      const c = candlesRef.current;
      const hovered = c.find((x) => x.time === (param.time as number));
      if (hovered) {
        hoverRef.current = true;
        setReadout(fromCandle(hovered));
      } else {
        hoverRef.current = false;
        setReadout(c.length > 0 ? fromCandle(c[c.length - 1]) : null);
      }
    },
    [],
  );

  const eraseAt = useCallback((x: number, y: number) => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main) return;
    const ts = chart.timeScale();
    let best: { id: string; dist: number } | null = null;
    for (const d of drawingsRef.current) {
      let dist = Infinity;
      if (d.kind === "horizontal") {
        const py = main.priceToCoordinate(d.price);
        if (py != null) dist = Math.abs(py - y);
      } else if (d.kind === "trendline" || d.kind === "fib" || d.kind === "rect") {
        const x1 = ts.timeToCoordinate(d.p1.time as Time);
        const y1 = main.priceToCoordinate(d.p1.price);
        const x2 = ts.timeToCoordinate(d.p2.time as Time);
        const y2 = main.priceToCoordinate(d.p2.price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        dist = Math.min(
          pointSegDist(x, y, x1, y1, x2, y2),
          pointSegDist(x, y, x2, y2, x1, y1),
        );
      } else {
        const x1 = ts.timeToCoordinate(d.time as Time);
        const y1 = main.priceToCoordinate(d.price);
        if (x1 != null && y1 != null) dist = Math.hypot(x - x1, y - y1);
      }
      if (dist < 10 && (best == null || dist < best.dist)) best = { id: d.id, dist };
    }
    if (best) setDrawings((prev) => prev.filter((d) => d.id !== best!.id));
  }, []);

  const handleChartClick = useCallback(
    (param: MouseEventParams) => {
      const chart = chartRef.current;
      const main = mainSeriesRef.current;
      const activeTool = toolRef.current;
      if (!chart || !main || !param.time || !param.point) return;
      const price = main.coordinateToPrice(param.point.y);
      if (price == null) return;

      const pt: Pt = { time: param.time as number, price };
      const id = Math.random().toString(36).slice(2, 10);

      if (activeTool === "horizontal") {
        setDrawings((prev) => [...prev, { id, kind: "horizontal", time: pt.time, price }]);
      } else if (activeTool === "long" || activeTool === "short") {
        setDrawings((prev) => [...prev, { id, kind: activeTool, time: pt.time, price }]);
      } else if (
        activeTool === "trendline" ||
        activeTool === "fib" ||
        activeTool === "rect"
      ) {
        const p = pendingRef.current;
        if (!p) {
          pendingRef.current = pt;
        } else {
          setDrawings((prev) => [...prev, { id, kind: activeTool, p1: p, p2: pt }]);
          pendingRef.current = null;
          removePreview();
        }
      } else if (activeTool === "eraser") {
        eraseAt(param.point.x, param.point.y);
      }
    },
    [eraseAt, removePreview],
  );

  /* ------------------------------ chart lifecycle ------------------------ */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#787b86",
        fontSize: 11,
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(120,123,134,0.12)" },
        horzLines: { color: "rgba(120,123,134,0.12)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(0,240,255,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#00f0ff",
        },
        horzLine: {
          color: "rgba(0,240,255,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#00f0ff",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(120,123,134,0.25)",
        autoScale: true,
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor: "rgba(120,123,134,0.25)",
        timeVisible: intradayRef.current,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 7,
      },
      localization: {
        priceFormatter: (price: number) =>
          price.toLocaleString("en-US", {
            minimumFractionDigits: decimalsRef.current,
            maximumFractionDigits: decimalsRef.current,
          }),
      },
    });
    chartRef.current = chart;
    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: "Abdul Kudus Trading Academy · Founder Portal",
          color: "rgba(212,175,55,0.07)",
          fontSize: 30,
          fontFamily: "system-ui",
        },
      ],
    });
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleChartClick);
    rebuildSeriesStructure();
    chart.timeScale().fitContent();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToolConsumedRef.current?.();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      seriesRefs.current.clear();
      trendSeriesRef.current.clear();
      priceLinesRef.current.clear();
      strategyLinesRef.current.clear();
      smcPriceLinesRef.current = [];
      previewSeriesRef.current = null;
      markersPluginRef.current = null;
      pendingRef.current = null;
      hoverRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* rebuild when chart style / indicator set / symbol / interval changes */
  useEffect(() => {
    rebuildSeriesStructure();
    chartRef.current?.timeScale().fitContent();
  }, [chartType, indicatorIds, resetKey, rebuildSeriesStructure]);

  /* stream new candles into the live series */
  useEffect(() => {
    syncData();
    const first = candles[0]?.time;
    if (first !== undefined && first !== lastFirstTimeRef.current) {
      chartRef.current?.timeScale().fitContent();
      lastFirstTimeRef.current = first;
    }
  }, [candles, syncData]);

  /* drawings + active tool */
  useEffect(() => {
    if (tool === "clear") {
      setDrawings([]);
      pendingRef.current = null;
      removePreview();
      onToolConsumedRef.current?.();
      return;
    }
    if (!tool) {
      pendingRef.current = null;
      removePreview();
    }
    syncDrawingVisuals();
    syncMarkers();
    computeRects();
  }, [drawings, tool, syncDrawingVisuals, syncMarkers, computeRects, removePreview]);

  /* compiled strategy overlays */
  useEffect(() => {
    syncStrategyVisuals();
    syncMarkers();
    computeRects();
  }, [strategies, syncStrategyVisuals, syncMarkers, computeRects]);

  /* live SMC overlays (watch zones / whale walls / swing S/R / EMA badges) */
  useEffect(() => {
    syncSmcVisuals();
    computeRects();
  }, [smc, indicatorIds, candles, syncSmcVisuals, computeRects]);

  /* ------------------------------- render -------------------------------- */

  const hasCandles = candles.length > 0;
  const changePct =
    readout != null && readout.open > 0
      ? ((readout.close - readout.open) / readout.open) * 100
      : null;
  const up = readout != null && readout.close >= readout.open;
  const feedStatus = feed?.status ?? (hasCandles ? "LIVE" : "CONNECTING");
  const chip = feedStatusChip(feedStatus);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full min-h-0", className)}
      style={{ height: "100%", width: "100%", overflow: "hidden" }}
    >
      {/* ------- feed state overlays (LOADING / ERROR / STALE) ------- */}
      {!hasCandles && feedStatus !== "ERROR" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050811]/60 backdrop-blur-[1px]">
          <Loader2 className="size-6 animate-spin text-[#F4C430]" />
          <p className="font-display text-sm font-bold tracking-tight text-slate-200">
            LOADING MARKET DATA…
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {symbolId} · {feed?.providerSymbol ?? symbolId} · {feedStatus}
          </p>
        </div>
      )}

      {!hasCandles && feedStatus === "ERROR" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex items-center gap-2 rounded-full border border-[#FF1744]/40 bg-[#FF1744]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#FF1744]">
            <WifiOff className="size-3.5" />
            MARKET DATA ERROR
          </span>
          <p className="max-w-md text-xs leading-5 text-slate-400">
            {feed?.error ?? "MARKET DATA UNAVAILABLE — no live provider responded."}
          </p>
          <button
            type="button"
            onClick={() => feed?.retry()}
            className="flex items-center gap-2 rounded-lg border border-[#F4C430]/40 bg-[#F4C430]/10 px-4 py-2 text-xs font-bold text-[#F4C430] transition-colors hover:bg-[#F4C430]/20"
          >
            <RefreshCw className="size-3.5" />
            RETRY DATA
          </button>
        </div>
      )}

      {/* ------- top status chip: BTCUSDT · 1H 🟢 LIVE ------- */}
      {hasCandles && (
        <div className="pointer-events-none absolute inset-x-3 top-2 z-10 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0b101b]/80 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-slate-200 backdrop-blur-sm">
            <span className={cn("size-1.5 rounded-full", chip.dot)} />
            {symbolId} · {chip.label}
            {feedStatus === "LIVE" && feed?.source === "binance" && (
              <span className="text-[8px] font-semibold text-slate-500">BINANCE</span>
            )}
          </span>
          {feedStatus !== "LIVE" && feed?.ageSeconds != null && (
            <span className="rounded-full border border-white/10 bg-[#0b101b]/80 px-2 py-0.5 font-mono text-[9px] text-slate-400 backdrop-blur-sm">
              {feed.ageSeconds}s ago
            </span>
          )}
        </div>
      )}

      {/* ------- debug diagnostics panel (§25) ------- */}
      {debugOpen && (
        <div className="absolute right-2 top-10 z-30 w-[240px] rounded-xl border border-[#1B263B] bg-[#0b101b]/95 p-3 backdrop-blur-xl">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#00F0FF]">
            MARKET DATA · DIAGNOSTICS
          </p>
          <DebugRow
            label="Provider"
            value={
              feed?.source === "binance"
                ? "Binance"
                : feed?.source === "twelvedata"
                  ? "Twelve Data"
                  : "—"
            }
          />
          <DebugRow
            label="Provider status"
            value={feedStatus === "LIVE" ? "CONNECTED" : feedStatus}
            tone={feedStatus === "LIVE" ? "ok" : feedStatus === "ERROR" ? "bad" : "warn"}
          />
          <DebugRow label="Symbol" value={symbolId} />
          <DebugRow label="Provider symbol" value={feed?.providerSymbol ?? "—"} />
          <DebugRow label="Historical candles" value={String(candles.length)} />
          <DebugRow
            label="Last candle"
            value={readout ? formatTime(readout.time, intraday) : "—"}
          />
          <DebugRow
            label="Current price"
            value={readout ? formatPrice(readout.close, decimals) : "—"}
          />
          <DebugRow
            label="Last tick"
            value={feed?.ageSeconds == null ? "—" : `${feed.ageSeconds}s ago`}
          />
          <DebugRow label="WebSocket" value={feedStatus} />
          <DebugRow
            label="Data gap"
            value={feed?.gap ? `${feed.missingCandles} bucket(s) missing` : "NONE"}
            tone={feed?.gap ? "bad" : "ok"}
          />
          <DebugRow
            label="Chart"
            value={hasCandles ? "READY" : "LOADING"}
            tone={hasCandles ? "ok" : "warn"}
          />
          <DebugRow
            label="Indicators"
            value={candles.length >= 30 ? "READY" : "INSUFFICIENT"}
            tone={candles.length >= 30 ? "ok" : "warn"}
          />
          <DebugRow
            label="Trade AI"
            value={
              feedStatus === "LIVE" && !feed?.gap && candles.length >= 60
                ? "READY"
                : "DISABLED"
            }
            tone={
              feedStatus === "LIVE" && !feed?.gap && candles.length >= 60
                ? "ok"
                : "warn"
            }
          />
        </div>
      )}

      {/* ------- OHLC readout + overlay legend (only with real candles) ------- */}
      {readout && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-3 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-1 pr-24 text-[11px] font-medium tabular-nums sm:pr-28",
            readoutOffset ? "top-9" : "top-2",
          )}
          style={hasCandles ? { top: 44 } : undefined}
        >
          <span className="font-semibold text-slate-200">
            {symbolId}
            <span className="ml-1.5 font-normal text-slate-500">
              {formatTime(readout.time, intraday)}
            </span>
          </span>
          <span className="text-slate-400">
            O <span className="text-slate-200">{formatPrice(readout.open, decimals)}</span>
          </span>
          <span className="text-slate-400">
            H <span className="text-emerald-400">{formatPrice(readout.high, decimals)}</span>
          </span>
          <span className="text-slate-400">
            L <span className="text-rose-400">{formatPrice(readout.low, decimals)}</span>
          </span>
          <span className="text-slate-400">
            C <span className={up ? "text-emerald-400" : "text-rose-400"}>{formatPrice(readout.close, decimals)}</span>
          </span>
          <span className="text-slate-500">Vol {formatCompact(readout.volume)}</span>
          {changePct != null && (
            <span
              className={cn(
                "rounded px-1 py-px text-[10px] font-semibold",
                up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
              )}
            >
              {formatPercent(changePct)}
            </span>
          )}

          {/* Overlay legend — wraps below the readout on narrow screens */}
          <span className="ml-auto flex flex-wrap items-center gap-x-2.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-1">🟡 Whale wall</span>
            <span className="flex items-center gap-1">➖ Swing S/R</span>
            <span className="flex items-center gap-1">🟢 Liquidity zone</span>
            <span className="flex items-center gap-1">🔵 Watch zone</span>
          </span>
        </div>
      )}

      {/* rectangle / FVG / watch-zone overlays */}
      {rects.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className={cn(
            "pointer-events-none absolute z-[5] rounded-sm border",
            r.tone === "cyan"
              ? "border-[#00F0FF]/55 bg-[#00F0FF]/[0.07]"
              : r.bullish
                ? "border-emerald-400/50 bg-emerald-400/10"
                : "border-rose-400/50 bg-rose-400/10",
          )}
          style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
        >
          {r.label && (
            <span
              className={cn(
                "absolute -top-3.5 left-0 text-[9px] font-bold uppercase tracking-wider",
                r.tone === "cyan" ? "text-[#00F0FF]" : "text-slate-400",
              )}
            >
              {r.label}
            </span>
          )}
          {r.bottomLabel && (
            <span
              className={cn(
                "absolute -bottom-3.5 left-0 text-[9px] font-bold uppercase tracking-wider",
                r.tone === "cyan" ? "text-[#00F0FF]" : "text-slate-400",
              )}
            >
              {r.bottomLabel}
            </span>
          )}
        </div>
      ))}

      {/* debug toggle (bottom-right) */}
      <button
        type="button"
        aria-label="Toggle market data diagnostics"
        onClick={() => setDebugOpen((o) => !o)}
        className={cn(
          "absolute bottom-2.5 right-2 z-30 flex size-7 items-center justify-center rounded-md border backdrop-blur-sm transition-colors",
          debugOpen
            ? "border-[#00F0FF]/50 bg-[#00F0FF]/10 text-[#00F0FF]"
            : "border-white/10 bg-[#0b101b]/70 text-slate-500 hover:text-slate-300",
        )}
      >
        <Bug className="size-3.5" />
      </button>

      {/* active drawing tool hint */}
      {tool && tool !== "eraser" && tool !== "clear" && (
        <div className="glass-chip pointer-events-none absolute bottom-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-medium text-slate-300">
          {TOOL_HINTS[tool]} · <span className="text-slate-500">Esc to exit</span>
        </div>
      )}
    </div>
  );
}

function feedStatusChip(status: KlineStatus): { dot: string; label: string; text: string } {
  switch (status) {
    case "LIVE":
      return { dot: "bg-[#00E676]", label: "LIVE", text: "text-[#00E676]" };
    case "STALE":
      return { dot: "bg-[#F4C430]", label: "STALE", text: "text-[#F4C430]" };
    case "RESYNCING":
      return { dot: "bg-[#F4C430]", label: "RESYNCING", text: "text-[#F4C430]" };
    case "RECONNECTING":
      return { dot: "bg-[#F4C430]", label: "RECONNECTING", text: "text-[#F4C430]" };
    case "ERROR":
      return { dot: "bg-[#FF1744]", label: "ERROR", text: "text-[#FF1744]" };
    default:
      return { dot: "bg-slate-400", label: "CONNECTING", text: "text-slate-300" };
  }
}

function DebugRow({
  label,
  value,
  tone = "neu",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad" | "neu";
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1 last:border-0">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[10px] font-semibold",
          tone === "ok"
            ? "text-[#00E676]"
            : tone === "bad"
              ? "text-[#FF1744]"
              : tone === "warn"
                ? "text-[#F4C430]"
                : "text-slate-300",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function fromCandle(c: Candle): Readout {
  return {
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}
