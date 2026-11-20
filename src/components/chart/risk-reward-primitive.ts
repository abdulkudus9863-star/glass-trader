import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";

export interface RiskRewardBoxOptions {
  entry: number;
  stop: number;
  /** Farthest take-profit shown — defines the profit zone height. */
  target: number;
  /** Bar where the trade / setup starts. The box begins at this bar. */
  anchorTime: Time;
  /** Horizontal extension in bars (default 15). */
  bars?: number;
  /** Short label drawn inside the box, e.g. "R:R 1:2.4". */
  label?: string;
  /** Colour family — trades use the terminal palette, AI uses violet. */
  tone?: "trade" | "ai";
}

export const DEFAULT_BOX_BARS = 15;

const RISK_FILL = "rgba(255, 23, 68, 0.16)";
const PROFIT_FILL = "rgba(0, 230, 118, 0.15)";
const RISK_EDGE = "rgba(255, 23, 68, 0.45)";
const PROFIT_EDGE = "rgba(0, 230, 118, 0.45)";
const ENTRY_EDGE = "rgba(244, 196, 48, 0.55)";
const AI_EDGE = "rgba(168, 85, 247, 0.55)";

/**
 * Clamp a bar-anchored span to the plotting area.
 *
 * Pure so it can be tested: `anchorX` is the x coordinate of the anchor bar in
 * CSS pixels, `barSpacing` the chart's current bar width, `plotWidth` the pane
 * width excluding the price scale. The returned span never leaves the plot.
 */
export function computeBoxSpan(
  anchorX: number | null,
  barSpacing: number,
  plotWidth: number,
  bars: number = DEFAULT_BOX_BARS,
): { x0: number; x1: number } | null {
  if (!Number.isFinite(plotWidth) || plotWidth <= 1) return null;
  const spacing = Number.isFinite(barSpacing) && barSpacing > 0 ? barSpacing : 6;
  const width = Math.max(spacing, Math.min(bars, 500) * spacing);

  if (anchorX == null || !Number.isFinite(anchorX)) {
    // Off-screen anchor: keep the box at the right edge, still compact.
    const x1 = plotWidth - 2;
    return { x0: Math.max(0, x1 - width), x1 };
  }

  let x0 = anchorX;
  let x1 = anchorX + width;
  if (x0 < 0) {
    x0 = 0;
    x1 = Math.min(plotWidth, width);
  }
  if (x1 > plotWidth) {
    const shift = x1 - plotWidth;
    x0 = Math.max(0, x0 - shift);
    x1 = plotWidth;
  }
  if (x1 - x0 < 2) return null;
  return { x0, x1 };
}

/**
 * TradingView-style position box drawn on lightweight-charts' own canvas.
 *
 * It is a series primitive, NOT an HTML overlay: prices and the anchor time are
 * converted with the chart's own coordinate APIs on every frame, so the box
 * stays glued to its levels and its bar while zooming, panning and resizing.
 * The horizontal extent is measured in bars (default 15) and clamped to the
 * pane, so it can never stretch across the whole chart.
 */
class PositionBoxView implements IPrimitivePaneView {
  private readonly getSeries: () => ISeriesApi<"Candlestick"> | null;
  private readonly getChart: () => IChartApi | null;
  private readonly opts: RiskRewardBoxOptions;

  constructor(
    getSeries: () => ISeriesApi<"Candlestick"> | null,
    getChart: () => IChartApi | null,
    opts: RiskRewardBoxOptions,
  ) {
    this.getSeries = getSeries;
    this.getChart = getChart;
    this.opts = opts;
  }

  renderer(): IPrimitivePaneRenderer {
    const opts = this.opts;
    const getSeries = this.getSeries;
    const getChart = this.getChart;

    return {
      draw(target) {
        const series = getSeries();
        const chart = getChart();
        if (!series || !chart) return;

        target.useBitmapCoordinateSpace((scope) => {
          const yEntry = series.priceToCoordinate(opts.entry);
          const yStop = series.priceToCoordinate(opts.stop);
          const yTarget = series.priceToCoordinate(opts.target);
          if (yEntry == null || yStop == null || yTarget == null) return;

          const vr = scope.verticalPixelRatio;
          const hr = scope.horizontalPixelRatio;
          const bitmapWidth = scope.bitmapSize.width;
          const priceScaleWidth =
            (chart.priceScale("right").width() || 0) * hr;
          const plotWidth = Math.max(0, bitmapWidth - priceScaleWidth) / hr;

          const timeScale = chart.timeScale();
          let barSpacing = timeScale.options().barSpacing;
          if (!Number.isFinite(barSpacing) || barSpacing <= 0) barSpacing = 6;
          let anchorX: number | null = null;
          try {
            anchorX = timeScale.timeToCoordinate(opts.anchorTime);
          } catch {
            anchorX = null;
          }

          const span = computeBoxSpan(anchorX, barSpacing, plotWidth, opts.bars);
          if (!span) return;

          const x0 = span.x0 * hr;
          const x1 = span.x1 * hr;
          const w = x1 - x0;

          const ctx = scope.context;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, 0, w, scope.bitmapSize.height);
          ctx.clip();

          const riskY = Math.min(yEntry, yStop) * vr;
          const riskH = Math.abs(yEntry - yStop) * vr;
          const profitY = Math.min(yEntry, yTarget) * vr;
          const profitH = Math.abs(yEntry - yTarget) * vr;

          if (riskH > 0.5) {
            ctx.fillStyle = RISK_FILL;
            ctx.fillRect(x0, riskY, w, riskH);
            ctx.strokeStyle = RISK_EDGE;
            ctx.lineWidth = Math.max(1, vr);
            ctx.strokeRect(x0, riskY, w, riskH);
          }
          if (profitH > 0.5) {
            ctx.fillStyle = PROFIT_FILL;
            ctx.fillRect(x0, profitY, w, profitH);
            ctx.strokeStyle = PROFIT_EDGE;
            ctx.lineWidth = Math.max(1, vr);
            ctx.strokeRect(x0, profitY, w, profitH);
          }

          // entry divider
          ctx.strokeStyle = opts.tone === "ai" ? AI_EDGE : ENTRY_EDGE;
          ctx.lineWidth = Math.max(1, vr);
          ctx.beginPath();
          ctx.moveTo(x0, yEntry * vr);
          ctx.lineTo(x1, yEntry * vr);
          ctx.stroke();

          if (opts.label) {
            const fontPx = 9 * vr;
            ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
            ctx.textBaseline = "top";
            const padX = 4 * hr;
            const textW = ctx.measureText(opts.label).width;
            const boxW = Math.min(w - padX * 2, textW + padX * 2);
            if (boxW > 10) {
              const top = (riskY < profitY ? riskY : profitY) + 2 * vr;
              ctx.fillStyle = "rgba(5, 8, 17, 0.72)";
              ctx.fillRect(x0 + padX, top, boxW, fontPx + 4 * vr);
              ctx.fillStyle = opts.tone === "ai" ? "#c4a2ff" : "#e8d9a3";
              ctx.fillText(opts.label, x0 + padX * 2, top + 2 * vr);
            }
          }

          ctx.restore();
        });
      },
    };
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }
}

export class RiskRewardBoxPrimitive implements ISeriesPrimitive<Time> {
  private readonly opts: RiskRewardBoxOptions;
  private readonly view: PositionBoxView;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private chart: IChartApi | null = null;

  constructor(
    series: ISeriesApi<"Candlestick">,
    opts: RiskRewardBoxOptions,
  ) {
    this.series = series;
    this.opts = opts;
    this.view = new PositionBoxView(
      () => this.series,
      () => this.chart,
      this.opts,
    );
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this.chart = params.chart;
    this.series = params.series as ISeriesApi<"Candlestick">;
  }

  detached(): void {
    this.chart = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }
}
