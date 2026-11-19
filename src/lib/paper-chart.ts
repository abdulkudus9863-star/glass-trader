/* ============================================================================
   Paper-trade chart overlays — pure mapping from simulated trade records (or
   the "new position" form preview) to chart price lines and a risk/reward box.

   No prices are invented here: every level comes from the stored trade or the
   user's typed preview, and invalid/zero values are dropped rather than drawn.

   Simulation only — nothing in this module can place a real order.
   ========================================================================== */

export type OverlayDirection = "long" | "short";

export interface PaperTradeLike {
  _id: string;
  symbol: string;
  direction: OverlayDirection;
  entry: number;
  stopLoss: number;
  takeProfit?: number;
  exit?: number;
  status: "OPEN" | "CLOSED";
  size: number;
  realizedPnlInr?: number;
  /** Epoch ms when the simulated position was closed. */
  closedAt?: number;
}

export interface OverlayToggles {
  entry: boolean;
  stop: boolean;
  targets: boolean;
  exit: boolean;
  box: boolean;
}

export const DEFAULT_OVERLAY_TOGGLES: OverlayToggles = {
  entry: true,
  stop: true,
  targets: true,
  exit: true,
  box: true,
};

export interface PriceLineSpec {
  id: string;
  price: number;
  color: string;
  title: string;
  /** Dashed lines for levels, solid for the confirmed exit marker. */
  dashed: boolean;
}

export interface RRBoxSpec {
  entry: number;
  stop: number;
  target: number;
}

export const OVERLAY_COLORS = {
  entry: "#F4C430",
  stop: "#FF1744",
  target: "#00E676",
  exit: "#00F0FF",
} as const;

function valid(price: number | undefined | null): price is number {
  return price != null && Number.isFinite(price) && price > 0;
}

export function formatOverlayPrice(price: number, decimals: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Levels for a saved simulated trade.
 * Closed trades keep their entry, stop, target AND the actual exit marker, so
 * history stays reproducible on the chart.
 */
export function buildTradeOverlays(
  trade: PaperTradeLike,
  toggles: OverlayToggles = DEFAULT_OVERLAY_TOGGLES,
  decimals = 2,
): { lines: PriceLineSpec[]; box: RRBoxSpec | null; label: string } {
  const lines: PriceLineSpec[] = [];
  const prefix = trade.direction === "long" ? "LONG" : "SHORT";

  if (toggles.entry && valid(trade.entry)) {
    lines.push({
      id: `${trade._id}:entry`,
      price: trade.entry,
      color: OVERLAY_COLORS.entry,
      title: `ENTRY · ${prefix} ${trade.symbol}`,
      dashed: true,
    });
  }
  if (toggles.stop && valid(trade.stopLoss)) {
    lines.push({
      id: `${trade._id}:sl`,
      price: trade.stopLoss,
      color: OVERLAY_COLORS.stop,
      title: `SL ${formatOverlayPrice(trade.stopLoss, decimals)}`,
      dashed: true,
    });
  }
  if (toggles.targets && valid(trade.takeProfit)) {
    lines.push({
      id: `${trade._id}:tp1`,
      price: trade.takeProfit,
      color: OVERLAY_COLORS.target,
      title: `TP1 ${formatOverlayPrice(trade.takeProfit, decimals)}`,
      dashed: true,
    });
  }
  if (toggles.exit && trade.status === "CLOSED" && valid(trade.exit)) {
    const pnl = trade.realizedPnlInr;
    lines.push({
      id: `${trade._id}:exit`,
      price: trade.exit,
      color: OVERLAY_COLORS.exit,
      title:
        pnl == null
          ? "EXIT"
          : `EXIT · ${pnl >= 0 ? "+" : "−"}₹${Math.abs(Math.round(pnl)).toLocaleString("en-IN")}`,
      dashed: false,
    });
  }

  let box: RRBoxSpec | null = null;
  if (toggles.box && valid(trade.entry) && valid(trade.stopLoss)) {
    const target = valid(trade.takeProfit)
      ? trade.takeProfit
      : valid(trade.exit)
        ? trade.exit
        : null;
    if (target != null && target !== trade.entry) {
      box = { entry: trade.entry, stop: trade.stopLoss, target };
    }
  }

  return {
    lines,
    box,
    label: `${prefix} ${trade.symbol}`,
  };
}

export interface PreviewInput {
  direction: OverlayDirection;
  entry: number;
  stop: number;
  target?: number;
}

/** Overlays for the unsaved form preview. Same rules, "PREVIEW" wording. */
export function buildPreviewOverlays(
  preview: PreviewInput,
  toggles: OverlayToggles = DEFAULT_OVERLAY_TOGGLES,
  decimals = 2,
  symbol = "",
): { lines: PriceLineSpec[]; box: RRBoxSpec | null; label: string } {
  const spec = buildTradeOverlays(
    {
      _id: "preview",
      symbol,
      direction: preview.direction,
      entry: preview.entry,
      stopLoss: preview.stop,
      takeProfit: preview.target,
      status: "OPEN",
      size: 0,
    },
    { ...toggles, exit: false },
    decimals,
  );
  return {
    ...spec,
    lines: spec.lines.map((l) => ({ ...l, title: `${l.title} · PREVIEW` })),
    label: `${preview.direction === "long" ? "LONG" : "SHORT"} preview`,
  };
}

/** Risk/reward implied by the form (reward ÷ risk). Null when undefined. */
export function previewRiskReward(
  entry: number,
  stop: number,
  target?: number,
): number | null {
  if (!valid(entry) || !valid(stop) || stop === entry) return null;
  if (target == null || !valid(target)) return null;
  return Math.abs(target - entry) / Math.abs(entry - stop);
}
