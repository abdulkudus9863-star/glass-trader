import { useEffect, useRef } from "react";
import {
  LineStyle,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";
import { useStrategy } from "@/contexts/StrategyContext";

interface StrategyPriceLinesProps {
  /** The candlestick series to attach price lines to. */
  series: ISeriesApi<"Candlestick"> | null;
}

/**
 * Renders AI strategy price lines (Entry / SL / TP) on a lightweight-charts
 * candlestick series.  Driven entirely by the StrategyContext — when
 * `activeStrategy` changes or `showLines` toggles, lines update instantly.
 *
 * This component does NOT create its own chart — it piggybacks on the
 * candlestickSeriesRef from the parent chart.
 */
export default function StrategyPriceLines({ series }: StrategyPriceLinesProps) {
  const { activeStrategy, showLines } = useStrategy();
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!series) return;

    // ── clear existing AI indicator lines safely ──
    priceLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line);
      } catch {
        // series may have been removed during unmount
      }
    });
    priceLinesRef.current = [];

    if (!activeStrategy || !showLines) return;

    // ── 1. Entry Line (Yellow solid) ──
    const entryAvg =
      (activeStrategy.entryMin + activeStrategy.entryMax) / 2;
    const entryLine = series.createPriceLine({
      price: entryAvg,
      color: "#f0b90b",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Entry (${entryAvg.toFixed(2)})`,
    });
    priceLinesRef.current.push(entryLine);

    // Entry zone band (upper + lower)
    const entryUpper = series.createPriceLine({
      price: activeStrategy.entryMax,
      color: "rgba(240,185,11,0.35)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });
    const entryLower = series.createPriceLine({
      price: activeStrategy.entryMin,
      color: "rgba(240,185,11,0.35)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });
    priceLinesRef.current.push(entryUpper, entryLower);

    // ── 2. Stop Loss (Red dashed) ──
    if (activeStrategy.stopLoss) {
      const slLine = series.createPriceLine({
        price: activeStrategy.stopLoss,
        color: "#ef5350",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SL (${activeStrategy.stopLoss})`,
      });
      priceLinesRef.current.push(slLine);
    }

    // ── 3. Take Profit Levels (Green dashed) ──
    [activeStrategy.tp1, activeStrategy.tp2, activeStrategy.tp3].forEach(
      (tp, idx) => {
        if (!tp) return;
        const tpLine = series.createPriceLine({
          price: tp,
          color: "#26a69a",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP${idx + 1} (${tp})`,
        });
        priceLinesRef.current.push(tpLine);
      },
    );

    // ── cleanup on next effect run ──
    return () => {
      priceLinesRef.current.forEach((line) => {
        try {
          series.removePriceLine(line);
        } catch {
          // ignore
        }
      });
      priceLinesRef.current = [];
    };
  }, [activeStrategy, showLines, series]);

  // This component renders nothing — it only manages price lines via side effects.
  return null;
}


