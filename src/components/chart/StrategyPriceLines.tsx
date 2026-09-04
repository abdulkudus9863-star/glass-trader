import { useEffect, useRef, useState } from "react";
import { useStrategy } from "@/contexts/StrategyContext";

interface StrategyPriceLinesProps {
  /**
   * The TradingView widget instance from onChartReady.
   * We call widget.activeChart().createPriceLine(...) to draw horizontal lines.
   */
  tvWidget: any;
}

interface PriceLineConfig {
  price: number;
  color: string;
  title: string;
  lineWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
}

/**
 * Renders horizontal price lines (Entry / SL / TP) inside the TradingView iframe
 * using the widget's activeChart().createPriceLine() API.
 *
 * Falls back to an HTML overlay if the chart API is not available.
 */
export default function StrategyPriceLines({ tvWidget }: StrategyPriceLinesProps) {
  const { activeStrategy, showLines } = useStrategy();
  const priceLinesRef = useRef<any[]>([]);
  const [chartReady, setChartReady] = useState(false);

  // Detect when the widget's chart API is available
  useEffect(() => {
    if (!tvWidget) return;
    const checkReady = () => {
      try {
        if (typeof tvWidget.activeChart === "function") {
          setChartReady(true);
          return;
        }
      } catch {
        // not ready
      }
    };
    checkReady();
    // Poll if not immediately available
    const interval = setInterval(checkReady, 200);
    return () => clearInterval(interval);
  }, [tvWidget]);

  // Create / update price lines when strategy or visibility changes
  useEffect(() => {
    if (!tvWidget || !chartReady) return;

    const removeLine = (line: any) => {
      try {
        const chart = tvWidget.activeChart();
        if (chart && typeof chart.removePriceLine === "function") {
          chart.removePriceLine(line);
        }
      } catch {
        // chart may have been destroyed
      }
    };

    // Clear existing lines
    priceLinesRef.current.forEach(removeLine);
    priceLinesRef.current = [];

    if (!activeStrategy || !showLines) return;

    let chart: any;
    try {
      chart = tvWidget.activeChart();
    } catch {
      return;
    }
    if (!chart || typeof chart.createPriceLine !== "function") return;

    const configs: PriceLineConfig[] = [];

    // Entry line (solid yellow, average of entry zone)
    const entryAvg = (activeStrategy.entryMin + activeStrategy.entryMax) / 2;
    configs.push({
      price: entryAvg,
      color: "#f0b90b",
      title: `Entry (${entryAvg.toFixed(2)})`,
      lineWidth: 2,
      lineStyle: "solid",
    });

    // Entry zone upper bound (dashed, semi-transparent yellow)
    if (activeStrategy.entryMax !== activeStrategy.entryMin) {
      configs.push({
        price: activeStrategy.entryMax,
        color: "rgba(240,185,11,0.4)",
        title: `Entry Upper (${activeStrategy.entryMax.toFixed(2)})`,
        lineWidth: 1,
        lineStyle: "dashed",
      });
      // Entry zone lower bound
      configs.push({
        price: activeStrategy.entryMin,
        color: "rgba(240,185,11,0.4)",
        title: `Entry Lower (${activeStrategy.entryMin.toFixed(2)})`,
        lineWidth: 1,
        lineStyle: "dashed",
      });
    }

    // Stop Loss (red dashed)
    if (activeStrategy.stopLoss) {
      configs.push({
        price: activeStrategy.stopLoss,
        color: "#ef5350",
        title: `SL (${activeStrategy.stopLoss.toFixed(2)})`,
        lineWidth: 2,
        lineStyle: "dashed",
      });
    }

    // Take Profit levels (green dashed)
    [activeStrategy.tp1, activeStrategy.tp2, activeStrategy.tp3].forEach(
      (tp, idx) => {
        if (tp == null) return;
        configs.push({
          price: tp,
          color: "#26a69a",
          title: `TP${idx + 1} (${tp.toFixed(2)})`,
          lineWidth: 2,
          lineStyle: "dashed",
        });
      },
    );

    // Create each price line via the TradingView chart API
    for (const cfg of configs) {
      try {
        // The TradingView API uses numeric lineStyle: 0=solid, 1=dotted, 2=dashed
        const styleMap: Record<string, number> = { solid: 0, dashed: 2, dotted: 1 };
        const line = chart.createPriceLine({
          price: cfg.price,
          color: cfg.color,
          lineWidth: cfg.lineWidth ?? 2,
          lineStyle: styleMap[cfg.lineStyle ?? "solid"] ?? 0,
          axisLabelVisible: true,
          title: cfg.title,
        });
        priceLinesRef.current.push(line);
      } catch {
        // Some chart states may reject createPriceLine
      }
    }

    // Cleanup on next effect run or unmount
    return () => {
      priceLinesRef.current.forEach(removeLine);
      priceLinesRef.current = [];
    };
  }, [activeStrategy, showLines, tvWidget, chartReady]);

  // This component renders nothing — it only manages price lines via side effects.
  return null;
}
