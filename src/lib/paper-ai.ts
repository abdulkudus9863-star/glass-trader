/* ============================================================================
   DEEEPR → Paper Trading bridge.

   This module does NOT analyse anything. It maps the output of the existing
   DEEEPR Trade Intelligence engine (`src/lib/deeepr.ts`, the same engine used
   by the Charts section) into (a) chart annotation levels and (b) a draft that
   pre-fills the existing paper order form. No price is invented: every level
   comes from the analysis, and a level that fails validation is dropped.
   ========================================================================== */

import type { DeeeprTradeAnalysis } from "./deeepr";
import type { AiSetupLevels } from "./paper-chart";

export type AiTradeAction = "take" | "wait" | "blocked";

const TRADEABLE = new Set(["STRONG BUY", "BUY", "STRONG SELL", "SELL"]);
const WAITING = new Set(["WAIT FOR BUY", "WAIT FOR SELL"]);

/**
 * Whether a DEEEPR decision may be pre-filled into the order form.
 * NO TRADE / INVALIDATED / INSUFFICIENT DATA are never actionable, and LOW
 * confidence setups are held back until the next chart update.
 */
export function aiTradeAction(
  decision: string,
  confidence: string,
): AiTradeAction {
  if (!TRADEABLE.has(decision)) {
    return WAITING.has(decision) ? "wait" : "blocked";
  }
  if (confidence === "LOW") return "wait";
  return "take";
}

export function actionHint(action: AiTradeAction): string {
  if (action === "take") return "Levels are valid — review them in the form before confirming.";
  if (action === "wait")
    return "DEEEPR is waiting (or confidence is low) — no trade is pre-filled yet.";
  return "DEEEPR says no trade for this setup — nothing is pre-filled.";
}

const valid = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;

export function directionOf(analysis: DeeeprTradeAnalysis): "long" | "short" | null {
  if (analysis.direction === "LONG") return "long";
  if (analysis.direction === "SHORT") return "short";
  return null;
}

/** Chart annotation levels for the existing paper chart. Null when invalid. */
export function aiSetupFromAnalysis(
  analysis: DeeeprTradeAnalysis,
): AiSetupLevels | null {
  const direction = directionOf(analysis);
  if (!direction) return null;

  const low = analysis.entry?.zone_low;
  const high = analysis.entry?.zone_high;
  const stop = analysis.risk?.stop_loss;
  if (!valid(low) || !valid(high) || !valid(stop)) return null;

  const targets = [analysis.targets?.tp1, analysis.targets?.tp2, analysis.targets?.tp3].filter(
    valid,
  );
  // A stop on the wrong side of the zone cannot be drawn truthfully.
  const zoneLow = Math.min(low, high);
  const zoneHigh = Math.max(low, high);
  if (direction === "long" && stop >= zoneLow) return null;
  if (direction === "short" && stop <= zoneHigh) return null;

  return {
    analysisId: analysis.analysis_id,
    decision: analysis.decision,
    confidence: analysis.confidence,
    direction,
    entryZone: [zoneLow, zoneHigh],
    stopLoss: stop,
    takeProfits: targets,
    timestamp: analysis.timestamp,
  };
}

export interface AiTradeDraft {
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number | null;
  riskReward: number | null;
}

/**
 * Draft for the paper order form: entry at the zone midpoint, stop from the
 * engine, target at TP1 when it is on the profitable side.
 */
export function aiTradeDraft(analysis: DeeeprTradeAnalysis): AiTradeDraft | null {
  const setup = aiSetupFromAnalysis(analysis);
  if (!setup) return null;
  const [low, high] = setup.entryZone;
  const entry = Number(((low + high) / 2).toFixed(8));
  if (!valid(entry)) return null;

  const tp1 = setup.takeProfits[0];
  const targetOk =
    tp1 != null &&
    ((setup.direction === "long" && tp1 > entry) ||
      (setup.direction === "short" && tp1 < entry));
  const target = targetOk ? tp1! : null;
  const risk = Math.abs(entry - setup.stopLoss);
  const riskReward =
    target != null && risk > 0 ? Math.abs(target - entry) / risk : null;

  return {
    direction: setup.direction,
    entry,
    stop: setup.stopLoss,
    target,
    riskReward,
  };
}

export interface SavedAiSetup {
  id: string;
  symbol: string;
  timeframe: string;
  decision: string;
  confidence: string;
  score: number;
  grade: string;
  savedAt: number;
  levels: AiSetupLevels;
  reasons: string[];
  invalidation: string[];
  warnings: string[];
}

/** Copy of an analysis worth reviewing later (device-local, no new tables). */
export function savedSetupFromAnalysis(
  analysis: DeeeprTradeAnalysis,
): SavedAiSetup | null {
  const levels = aiSetupFromAnalysis(analysis);
  if (!levels) return null;
  const signature = [
    analysis.symbol,
    analysis.timeframe,
    analysis.decision,
    levels.direction,
    levels.entryZone[0],
    levels.entryZone[1],
    levels.stopLoss,
    levels.takeProfits.join(","),
  ].join("|");
  return {
    id: signature,
    symbol: analysis.symbol,
    timeframe: analysis.timeframe,
    decision: analysis.decision,
    confidence: analysis.confidence,
    score: analysis.score,
    grade: analysis.grade,
    savedAt: Date.now(),
    levels,
    reasons: analysis.reasons.slice(0, 4),
    invalidation: analysis.invalidation.slice(0, 3),
    warnings: analysis.warnings.slice(0, 3),
  };
}

/** Insert without duplicating an identical setup. */
export function upsertSavedSetup(
  list: SavedAiSetup[],
  setup: SavedAiSetup,
  max = 20,
): { list: SavedAiSetup[]; added: boolean } {
  if (list.some((s) => s.id === setup.id)) {
    return { list, added: false };
  }
  return { list: [setup, ...list].slice(0, max), added: true };
}
