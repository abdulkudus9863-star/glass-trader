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
import { getIndicator } from "@/lib/indicators";
import {
  type Candle,
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
}

interface Readout {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
        { color: "#0d9488", lineWidth: 1, priceLineVisible: false },
        pane,
      ),
    );
    store.set(
      "macd-signal",
      chart.addSeries(
        LineSeries,
        { color: "#f59e0b", lineWidth: 1, priceLineVisible: false },
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
          c.close >= c.open ? "rgba(8,153,129,0.40)" : "rgba(242,54,69,0.40)",
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
            color: v >= 0 ? "rgba(13,148,136,0.5)" : "rgba(242,54,69,0.5)",
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
}: CustomChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const trendSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const previewSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

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

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [rects, setRects] = useState<RectBox[]>([]);
  const [readout, setReadout] = useState<Readout>(() =>
    fromCandle(candles[candles.length - 1] ?? emptyCandle()),
  );

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
      color: d.kind === "long" ? "#089981" : "#f23645",
      shape: d.kind === "long" ? "arrowUp" : "arrowDown",
      text: d.kind === "long" ? "LONG" : "SHORT",
    }));
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
            color: "rgba(41,98,255,0.85)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
          }),
        );
      } else if (d.kind === "trendline") {
        const s = chart.addSeries(LineSeries, {
          color: "rgba(41,98,255,0.9)",
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
                i === 3 ? "rgba(245,158,11,0.95)" : "rgba(41,98,255,0.55)",
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
      });
    };
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
    if (!hoverRef.current) setReadout(fromCandle(c[c.length - 1]));
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
    pendingRef.current = null;

    const c = candlesRef.current;
    const type = chartTypeRef.current;
    let main: ISeriesApi<any>;
    if (type === "line") {
      main = chart.addSeries(LineSeries, {
        color: "#4f46e5",
        lineWidth: 2,
        priceLineVisible: false,
      });
    } else if (type === "bar") {
      main = chart.addSeries(BarSeries, {
        upColor: "#089981",
        downColor: "#f23645",
        thinBars: false,
        priceLineVisible: false,
      });
    } else {
      main = chart.addSeries(CandlestickSeries, {
        upColor: "#089981",
        downColor: "#f23645",
        wickUpColor: "#089981",
        wickDownColor: "#f23645",
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
              color: "rgba(41,98,255,0.5)",
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
        if (c.length) setReadout(fromCandle(c[c.length - 1]));
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
          color: "rgba(41,98,255,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2962ff",
        },
        horzLine: {
          color: "rgba(41,98,255,0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2962ff",
        },
      },
      rightPriceScale: { borderColor: "rgba(120,123,134,0.25)" },
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
          text: "Abdul Kudus Trading Academy",
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

  /* ------------------------------- render -------------------------------- */

  const changePct =
    readout.open > 0 ? ((readout.close - readout.open) / readout.open) * 100 : 0;
  const up = readout.close >= readout.open;

  return (
    <div ref={containerRef} className={cn("relative h-full w-full min-h-0", className)}>
      {/* OHLC readout */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-medium tabular-nums">
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
        <span
          className={cn(
            "rounded px-1 py-px text-[10px] font-semibold",
            up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
          )}
        >
          {formatPercent(changePct)}
        </span>
      </div>

      {/* rectangle / FVG overlays */}
      {rects.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className={cn(
            "pointer-events-none absolute z-[5] rounded-sm border",
            r.bullish
              ? "border-emerald-400/50 bg-emerald-400/10"
              : "border-rose-400/50 bg-rose-400/10",
          )}
          style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
        >
          {r.label && (
            <span className="absolute -top-3.5 left-0 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              {r.label}
            </span>
          )}
        </div>
      ))}

      {/* active drawing tool hint */}
      {tool && tool !== "eraser" && tool !== "clear" && (
        <div className="glass-chip pointer-events-none absolute bottom-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-medium text-slate-300">
          {TOOL_HINTS[tool]} · <span className="text-slate-500">Esc to exit</span>
        </div>
      )}
    </div>
  );
}

function emptyCandle(): Candle {
  return { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 };
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
