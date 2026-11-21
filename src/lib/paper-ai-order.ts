/* ============================================================================
   Pending AI paper orders — pure lifecycle logic.

   Validation/trigger rules only. Execution still goes through the existing
   `paper.openTrade` mutation (clientToken = setup id makes it idempotent), so
   there is exactly one execution path and no second trading engine.
   ========================================================================== */

import type { AiSetupLevels } from "./paper-chart";

export type AiSetupStatus =
  | "ANALYSING"
  | "READY"
  | "ARMED"
  | "EXECUTED"
  | "CLOSED"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED";

/** Only ARMED setups may ever execute. */
export const ACTIVE_AI_STATUSES: AiSetupStatus[] = ["ARMED"];

const KNOWN_STATUSES = new Set<string>([
  "ANALYSING",
  "ANALYZING",
  "READY",
  "ARMED",
  "EXECUTED",
  "CLOSED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
]);

/**
 * Normalise persisted/legacy statuses onto the current lifecycle.
 * READY is display-only; old PENDING/ENTRY TRIGGERED/FILLED records are
 * migrated so a refresh can never resurrect a cancelled order or skip one.
 */
export function normaliseStatus(status: string | null | undefined): AiSetupStatus | null {
  if (!status) return null;
  if (status === "PENDING ENTRY" || status === "ENTRY TRIGGERED") return "ARMED";
  if (status === "FILLED") return "EXECUTED";
  if (status === "ANALYZING") return "ANALYSING";
  return KNOWN_STATUSES.has(status) ? (status as AiSetupStatus) : null;
}

export interface PendingAiSetup {
  /** Deterministic id — also used as the execution clientToken. */
  id: string;
  analysisId: string;
  symbol: string;
  timeframe: string;
  direction: "long" | "short";
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfits: number[];
  decision: string;
  confidence: string;
  score: number;
  createdAt: number;
  expiresAt: number;
  status: AiSetupStatus;
  tradeId?: string | null;
  filledAt?: number;
  filledEntry?: number;
  message?: string;
}

const TF_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

/** Setups live for 20 bars of their own timeframe (min 2h, max 24h). */
export function setupExpiry(timeframe: string, now: number): number {
  const tf = TF_MS[timeframe] ?? 900_000;
  return now + Math.min(24 * 3_600_000, Math.max(2 * 3_600_000, tf * 20));
}

export function setupIdFor(levels: AiSetupLevels): string {
  return [
    "ai",
    levels.analysisId,
    levels.direction,
    levels.entryZone[0],
    levels.entryZone[1],
    levels.stopLoss,
    levels.takeProfits.join(","),
  ].join("-");
}

const valid = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;

export interface SetupCandidate {
  symbol: string;
  timeframe: string;
  decision: string;
  confidence: string;
  score: number;
  riskReward: number | null;
  levels: AiSetupLevels;
}

export interface SetupValidation {
  ok: boolean;
  setup: PendingAiSetup | null;
  reason: string | null;
}

const TRADEABLE = new Set(["STRONG BUY", "BUY", "STRONG SELL", "SELL"]);

/**
 * Validate an AI analysis before it can become an executable pending order.
 * NO TRADE / WAIT / INVALIDATED / LOW confidence never create an order.
 */
export function createPendingSetup(
  candidate: SetupCandidate,
  now: number,
  minRiskReward = 1.5,
): SetupValidation {
  const { levels } = candidate;
  const [low, high] = levels.entryZone;
  const entryLow = Math.min(low, high);
  const entryHigh = Math.max(low, high);

  if (!TRADEABLE.has(candidate.decision)) {
    return { ok: false, setup: null, reason: `DEEEPR decision is ${candidate.decision} — no order created.` };
  }
  if (candidate.confidence === "LOW") {
    return { ok: false, setup: null, reason: "Confidence is LOW — wait for a stronger setup." };
  }
  if (!valid(entryLow) || !valid(entryHigh) || !valid(levels.stopLoss)) {
    return { ok: false, setup: null, reason: "Entry zone or stop-loss is missing." };
  }
  const stopWrongSide =
    levels.direction === "long"
      ? levels.stopLoss >= entryLow
      : levels.stopLoss <= entryHigh;
  if (stopWrongSide) {
    return { ok: false, setup: null, reason: "Stop-loss is on the wrong side of the entry zone." };
  }
  if (candidate.riskReward != null && candidate.riskReward < minRiskReward) {
    return {
      ok: false,
      setup: null,
      reason: `Risk/reward ${candidate.riskReward.toFixed(1)} is below the ${minRiskReward.toFixed(1)} minimum.`,
    };
  }
  if (levels.takeProfits.length === 0) {
    return { ok: false, setup: null, reason: "No take-profit level was provided." };
  }
  const entryMid = (entryLow + entryHigh) / 2;
  const targetsWrongSide = levels.takeProfits.some((tp) =>
    levels.direction === "long" ? tp <= entryMid : tp >= entryMid,
  );
  if (targetsWrongSide) {
    return { ok: false, setup: null, reason: "A take-profit level is on the wrong side of entry." };
  }

  const id = setupIdFor(levels);
  return {
    ok: true,
    reason: null,
    setup: {
      id,
      analysisId: levels.analysisId,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      direction: levels.direction,
      entryLow,
      entryHigh,
      stopLoss: levels.stopLoss,
      takeProfits: levels.takeProfits.slice(0, 3),
      decision: candidate.decision,
      confidence: candidate.confidence,
      score: candidate.score,
      createdAt: now,
      expiresAt: setupExpiry(candidate.timeframe, now),
      status: "ARMED",
    },
  };
}

export function isActive(setup: PendingAiSetup | null | undefined): boolean {
  return !!setup && ACTIVE_AI_STATUSES.includes(setup.status);
}

export function isExecuted(setup: PendingAiSetup | null | undefined): boolean {
  return setup?.status === "EXECUTED";
}

export function isClosed(setup: PendingAiSetup | null | undefined): boolean {
  return setup?.status === "CLOSED";
}

export type TriggerResult =
  | { action: "none"; reason: string }
  | { action: "execute"; price: number }
  | { action: "expire"; reason: string }
  | { action: "reject"; reason: string };

/**
 * Decide what to do with a pending setup given the latest real market price.
 *
 * - Only an active, unexpired setup on its own symbol can trigger.
 * - A price that has already blown through the stop is rejected, never filled.
 * - The fill price is the observed market price inside the zone, not the
 *   midpoint, so slippage through the zone is respected.
 */
export function evaluateTrigger(
  setup: PendingAiSetup | null | undefined,
  price: number | null,
  now: number,
  symbol: string,
): TriggerResult {
  if (!setup) return { action: "none", reason: "No setup." };
  if (!isActive(setup)) return { action: "none", reason: `Setup is ${setup.status}.` };
  if (setup.symbol !== symbol) return { action: "none", reason: "Setup belongs to another symbol." };
  if (now >= setup.expiresAt) return { action: "expire", reason: "Setup expired before entry." };
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { action: "none", reason: "No market price." };
  }

  const beyondStop =
    setup.direction === "long" ? price <= setup.stopLoss : price >= setup.stopLoss;
  if (beyondStop) {
    return { action: "reject", reason: "Price passed the stop-loss before entry." };
  }

  const inZone = price >= setup.entryLow && price <= setup.entryHigh;
  if (!inZone) return { action: "none", reason: "Waiting for price to reach the entry zone." };

  return { action: "execute", price };
}

/** TP lines confirmed hit by a recorded exit — never from a live touch. */
export function confirmedTargetHits(
  direction: "long" | "short",
  exit: number | null | undefined,
  targets: number[],
): number[] {
  if (exit == null || !Number.isFinite(exit) || exit <= 0) return [];
  return targets.filter((tp) =>
    valid(tp) && (direction === "long" ? exit >= tp : exit <= tp),
  );
}

export function activeStatusLabel(status: AiSetupStatus): string {
  return status;
}
