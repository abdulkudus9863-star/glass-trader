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
  /** Epoch ms when the simulated position was opened (anchors the box). */
  openedAt?: number;
}

export interface OverlayToggles {
  entry: boolean;
  stop: boolean;
  targets: boolean;
  exit: boolean;
  box: boolean;
  /** DEEEPR setup pushed onto the chart from the AI panel. */
  ai: boolean;
  /** Latest market price — always distinct from a real exit. */
  market: boolean;
}

export const DEFAULT_OVERLAY_TOGGLES: OverlayToggles = {
  entry: true,
  stop: true,
  targets: true,
  exit: true,
  box: true,
  ai: true,
  market: true,
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
  /** Neutral, subtle — never confused with a stored exit price. */
  market: "#94a3b8",
  /** AI-generated annotations are violet so they are never mistaken for trades. */
  ai: "#A855F7",
} as const;

/** Default horizontal extension of the compact R:R box, in bars. */
export const RR_BOX_BARS = 15;

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
): { lines: PriceLineSpec[]; box: RRBoxSpec | null; label: string } {
  const lines: PriceLineSpec[] = [];
  const prefix = trade.direction === "long" ? "LONG" : "SHORT";

  /* Compact titles: the price is already drawn on the price axis by the
     library, so repeating it in the line label only adds clutter. */
  if (toggles.entry && valid(trade.entry)) {
    lines.push({
      id: `${trade._id}:entry`,
      price: trade.entry,
      color: OVERLAY_COLORS.entry,
      title: `ENTRY · ${prefix}`,
      dashed: true,
    });
  }
  if (toggles.stop && valid(trade.stopLoss)) {
    lines.push({
      id: `${trade._id}:sl`,
      price: trade.stopLoss,
      color: OVERLAY_COLORS.stop,
      title: "SL",
      dashed: true,
    });
  }
  if (toggles.targets && valid(trade.takeProfit)) {
    lines.push({
      id: `${trade._id}:tp1`,
      price: trade.takeProfit,
      color: OVERLAY_COLORS.target,
      title: "TP1",
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
      /** Solid so it can never be mistaken for the dashed market price. */
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
  );
  return {
    ...spec,
    lines: spec.lines.map((l) => ({ ...l, title: `${l.title} · PREVIEW` })),
    label: `${preview.direction === "long" ? "LONG" : "SHORT"} preview`,
  };
}

/** Latest market price line — neutrally styled, always dashed. */
export function buildMarketPriceLine(
  price: number | null | undefined,
): PriceLineSpec | null {
  if (!valid(price)) return null;
  return {
    id: "market",
    price,
    color: OVERLAY_COLORS.market,
    title: "MARKET",
    dashed: true,
  };
}

export interface ZoneSpan {
  /** Epoch ms when the trade started (stored record only). */
  from: number;
  /** Epoch ms when the trade ended, or the latest bar for open trades. */
  to: number;
}

/**
 * The exact lifetime a trade's R:R zone may cover.
 *
 * Closed trades stop at their recorded `closedAt` (never into future candles),
 * open trades stop at the latest chart bar, and a closed trade without a valid
 * close timestamp gets no zone at all instead of a guessed one.
 */
export function tradeZoneSpan(
  trade: PaperTradeLike,
  latestBarMs: number | null,
): ZoneSpan | null {
  if (!valid(trade.entry) || trade.openedAt == null) return null;
  if (!Number.isFinite(trade.openedAt) || trade.openedAt <= 0) return null;

  if (trade.status === "CLOSED") {
    const closedAt = trade.closedAt;
    if (closedAt == null || !Number.isFinite(closedAt) || closedAt < trade.openedAt) {
      return null;
    }
    return { from: trade.openedAt, to: closedAt };
  }

  if (latestBarMs == null || latestBarMs <= trade.openedAt) return null;
  return { from: trade.openedAt, to: latestBarMs };
}

/**
 * DEEEPR setup levels pushed onto the chart.
 *
 * These are annotations only: violet entry zone and AI-tagged lines, kept
 * visually distinct from real candles and from stored/simulated trades.
 */
export interface AiSetupLevels {
  analysisId: string;
  decision: string;
  confidence: string;
  direction: OverlayDirection;
  entryZone: [number, number];
  stopLoss: number;
  takeProfits: number[];
  /** Epoch ms of the analysis — anchors the compact R:R box to that bar. */
  timestamp: number;
}

export interface AiOverlaySpec {
  lines: PriceLineSpec[];
  box: RRBoxSpec | null;
  label: string;
}

export function buildAiSetupOverlays(
  setup: AiSetupLevels,
  toggles: OverlayToggles = DEFAULT_OVERLAY_TOGGLES,
): AiOverlaySpec {
  const lines: PriceLineSpec[] = [];
  const prefix = setup.direction === "long" ? "LONG" : "SHORT";
  const [zoneLow, zoneHigh] = setup.entryZone;

  if (toggles.ai) {
    if (valid(zoneLow) && valid(zoneHigh)) {
      lines.push({
        id: `${setup.analysisId}:zone-low`,
        price: Math.min(zoneLow, zoneHigh),
        color: OVERLAY_COLORS.ai,
        title: `AI ZONE · ${prefix}`,
        dashed: true,
      });
      lines.push({
        id: `${setup.analysisId}:zone-high`,
        price: Math.max(zoneLow, zoneHigh),
        color: OVERLAY_COLORS.ai,
        title: "AI ZONE",
        dashed: true,
      });
    }
  }
  if (toggles.stop && valid(setup.stopLoss)) {
          lines.push({
        id: `${setup.analysisId}:sl`,
        price: setup.stopLoss,
        color: OVERLAY_COLORS.stop,
        title: "AI SL",
        dashed: true,
      });
  }
  if (toggles.targets) {
    setup.takeProfits.slice(0, 3).forEach((tp, i) => {
      if (!valid(tp)) return;
              lines.push({
          id: `${setup.analysisId}:tp${i + 1}`,
          price: tp,
          color: OVERLAY_COLORS.target,
          title: `AI TP${i + 1}`,
          dashed: true,
        });
    });
  }

  const entryMid =
    valid(zoneLow) && valid(zoneHigh) ? (zoneLow + zoneHigh) / 2 : null;
  const farthestTp = setup.takeProfits.filter(valid).slice(-1)[0] ?? null;
  const box =
    toggles.box && entryMid != null && valid(setup.stopLoss) && farthestTp != null && farthestTp !== entryMid
      ? { entry: entryMid, stop: setup.stopLoss, target: farthestTp }
      : null;

  return {
    lines,
    box,
    label: `AI ${prefix} · ${setup.confidence} CONF · ${setup.decision}`,
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
