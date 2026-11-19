import type {
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
}

const RISK_FILL = "rgba(255, 23, 68, 0.16)";
const PROFIT_FILL = "rgba(0, 230, 118, 0.15)";
const RISK_EDGE = "rgba(255, 23, 68, 0.45)";
const PROFIT_EDGE = "rgba(0, 230, 118, 0.45)";
const ENTRY_EDGE = "rgba(244, 196, 48, 0.55)";

/**
 * TradingView-style position box drawn on lightweight-charts' own canvas.
 *
 * It is a series primitive, NOT an HTML overlay: the renderer converts prices
 * with the series `priceToCoordinate` API on every frame, so the box stays
 * glued to the correct levels while zooming, scrolling and resizing. Fills are
 * translucent so candlesticks remain visible underneath.
 */
class PositionBoxView implements IPrimitivePaneView {
  private readonly paint: IPrimitivePaneRenderer;

  constructor(
    series: ISeriesApi<"Candlestick">,
    opts: RiskRewardBoxOptions,
  ) {
    this.paint = {
      draw(target) {
        target.useBitmapCoordinateSpace((scope) => {
          const yEntry = series.priceToCoordinate(opts.entry);
          const yStop = series.priceToCoordinate(opts.stop);
          const yTarget = series.priceToCoordinate(opts.target);
          if (yEntry == null || yStop == null || yTarget == null) return;

          const vr = scope.verticalPixelRatio;
          const width = scope.bitmapSize.width;
          const ctx = scope.context;

          const riskY = Math.min(yEntry, yStop) * vr;
          const riskH = Math.abs(yEntry - yStop) * vr;
          const profitY = Math.min(yEntry, yTarget) * vr;
          const profitH = Math.abs(yEntry - yTarget) * vr;

          ctx.save();
          if (riskH > 0.5) {
            ctx.fillStyle = RISK_FILL;
            ctx.fillRect(0, riskY, width, riskH);
            ctx.strokeStyle = RISK_EDGE;
            ctx.lineWidth = Math.max(1, vr);
            ctx.strokeRect(0, riskY, width, riskH);
          }
          if (profitH > 0.5) {
            ctx.fillStyle = PROFIT_FILL;
            ctx.fillRect(0, profitY, width, profitH);
            ctx.strokeStyle = PROFIT_EDGE;
            ctx.lineWidth = Math.max(1, vr);
            ctx.strokeRect(0, profitY, width, profitH);
          }
          // entry divider
          ctx.strokeStyle = ENTRY_EDGE;
          ctx.lineWidth = Math.max(1, vr);
          ctx.beginPath();
          ctx.moveTo(0, yEntry * vr);
          ctx.lineTo(width, yEntry * vr);
          ctx.stroke();
          ctx.restore();
        });
      },
    };
  }

  renderer(): IPrimitivePaneRenderer {
    return this.paint;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }
}

export class RiskRewardBoxPrimitive implements ISeriesPrimitive<Time> {
  private readonly view: IPrimitivePaneView;

  constructor(
    series: ISeriesApi<"Candlestick">,
    opts: RiskRewardBoxOptions,
  ) {
    this.view = new PositionBoxView(series, opts);
  }

  attached(_params: SeriesAttachedParameter<Time>): void {
    void _params;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }
}
