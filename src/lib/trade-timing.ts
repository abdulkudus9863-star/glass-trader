/* ============================================================================
   Trade timing intelligence — pure, deterministic, no new AI model.

   Reuses the EXISTING analysis levels and asks one extra question:
   "Is this still executable at the current market price?"

   Every decision is explained. Candles are only used to inspect what has
   already happened since the analysis timestamp; a historical touch is never
   treated as an executable fill.
   ========================================================================== */

import type { AiSetupLevels } from "./paper-chart";
import { setupExpiry } from "./paper-ai-order";

export type TimingStatus =
  | "VALID ENTRY"
  | "WAITING FOR ENTRY"
  | "LATE ENTRY"
  | "MISSED TRADE"
  | "WAIT FOR RETEST"
  | "INVALID SETUP"
  | "EXPIRED"
  | "DATA UNAVAILABLE";

export interface TimingCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TimingInput {
  setup: AiSetupLevels;
  timeframe: string;
  /** Current executable mark (no bid/ask feed exists in this app). */
  price: number | null | undefined;
  /** Candles for the setup's own symbol/timeframe, when available. */
  candles?: TimingCandle[];
  now: number;
  /** Minimum remaining reward-to-risk at the executable price. */
  minRiskReward?: number;
}

export interface TimingVerdict {
  status: TimingStatus;
  /** Short, plain-language reason shown in the UI. */
  explanation: string;
  /** A user may arm this opportunity for automatic paper execution. */
  canArm: boolean;
  /** The current price itself satisfies a validated entry. */
  canAutoExecute: boolean;
  /** Remaining R:R measured from the executable price (or zone mid when waiting). */
  remainingRR: number | null;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit: number | null;
  /** How many of the stored targets have already been reached since setup. */
  targetsReached: number;
  ageMs: number;
  checkedAt: number;
}

const valid = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;

export function remainingRiskReward(
  direction: "long" | "short",
  price: number,
  stop: number,
  target: number,
): { risk: number; reward: number; rr: number } | null {
  if (!valid(price) || !valid(stop) || !valid(target)) return null;
  const risk = direction === "long" ? price - stop : stop - price;
  if (risk <= 0) return null;
  const reward = direction === "long" ? target - price : price - target;
  if (reward <= 0) return { risk, reward: 0, rr: 0 };
  return { risk, reward, rr: reward / risk };
}

const fmt = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

function candlesSince(setup: AiSetupLevels, candles: TimingCandle[] | undefined) {
  if (!candles || candles.length === 0) return [];
  const from = setup.timestamp;
  return candles.filter((c) => c.time * 1000 >= from);
}

/**
 * Evaluate whether the ORIGINAL setup is still executable right now.
 *
 * Priority order matters: unavailable data → invalidated → expired →
 * target already reached (missed / retest) → in-zone → late → waiting.
 */
export function evaluateTradeTiming(input: TimingInput): TimingVerdict {
  const { setup, timeframe, price, candles, now } = input;
  const minRR = input.minRiskReward ?? 1.5;
  const [rawLow, rawHigh] = setup.entryZone;
  const entryLow = Math.min(rawLow, rawHigh);
  const entryHigh = Math.max(rawLow, rawHigh);
  const stop = setup.stopLoss;
  const targets = setup.takeProfits.filter(valid);
  const takeProfit = targets[0] ?? null;
  const ageMs = Math.max(0, now - setup.timestamp);

  const base: TimingVerdict = {
    status: "DATA UNAVAILABLE",
    explanation: "DATA UNAVAILABLE — no reliable current price. Automatic execution is blocked.",
    canArm: false,
    canAutoExecute: false,
    remainingRR: null,
    entryLow,
    entryHigh,
    stopLoss: stop,
    takeProfit,
    targetsReached: 0,
    ageMs,
    checkedAt: now,
  };

  if (!valid(entryLow) || !valid(entryHigh) || !valid(stop) || !takeProfit) {
    return {
      ...base,
      status: "INVALID SETUP",
      explanation:
        "INVALID SETUP — entry, stop-loss or targets are incomplete. Nothing can be armed.",
    };
  }
  if (!valid(price)) return base;

  const dir = setup.direction;
  const since = candlesSince(setup, candles);

  // Worst excursion since the analysis was produced.
  let worstPrice = price;
  let bestPrice = price;
  for (const c of since) {
    worstPrice = dir === "long" ? Math.min(worstPrice, c.low) : Math.max(worstPrice, c.high);
    bestPrice = dir === "long" ? Math.max(bestPrice, c.high) : Math.min(bestPrice, c.low);
  }

  const targetsReached = targets.filter((tp) =>
    dir === "long" ? bestPrice >= tp : bestPrice <= tp,
  ).length;

  const priceRR = remainingRiskReward(dir, price, stop, takeProfit);
  const atTarget = dir === "long" ? price >= takeProfit : price <= takeProfit;
  const stopHit = dir === "long" ? worstPrice <= stop : worstPrice >= stop;
  const priceBeyondStop = dir === "long" ? price <= stop : price >= stop;

  const expired = ageMs > setupExpiry(timeframe, 0);

  if (stopHit || priceBeyondStop) {
    return {
      ...base,
      status: "INVALID SETUP",
      remainingRR: priceRR?.rr ?? null,
      targetsReached,
      explanation: `INVALID SETUP — ${fmt(price)} has crossed the invalidation level ${fmt(
        stop,
      )}. The original thesis is no longer valid; no execution is allowed.`,
    };
  }

  if (expired) {
    return {
      ...base,
      status: "EXPIRED",
      remainingRR: priceRR?.rr ?? null,
      targetsReached,
      explanation: `EXPIRED — this ${timeframe} setup is older than its ${Math.round(
        setupExpiry(timeframe, 0) / 3_600_000,
      )}h window. Execution is disabled; wait for a fresh analysis.`,
    };
  }

  const inZone = price >= entryLow && price <= entryHigh;
  const last = since.length ? since[since.length - 1] : undefined;
  const confirmation =
    !!last &&
    (dir === "long" ? last.close > last.open : last.close < last.open);
  const beyondZoneTowardTarget =
    dir === "long" ? price > entryHigh : price < entryLow;

  if (targetsReached > 0 || atTarget) {
    const count = Math.max(targetsReached, atTarget ? 1 : 0);
    const reachedText =
      count >= targets.length
        ? "TP1, TP2 and TP3"
        : count === 2
          ? "TP1 and TP2"
          : "TP1";
    const retestOK =
      inZone && confirmation && (priceRR?.rr ?? 0) >= minRR && !atTarget;

    if (retestOK) {
      return {
        ...base,
        status: "WAIT FOR RETEST",
        canArm: true,
        canAutoExecute: true,
        remainingRR: priceRR?.rr ?? null,
        targetsReached: count,
        explanation: `WAIT FOR RETEST — ${reachedText} was already reached, but price is back in the valid ${fmt(
          entryLow,
        )}–${fmt(entryHigh)} zone with a fresh confirmation candle and R:R ${fmt(
          priceRR?.rr ?? 0,
          1,
        )}. Only this validated retest may be armed — not a chase.`,
      };
    }

    return {
      ...base,
      status: "MISSED TRADE",
      remainingRR: priceRR?.rr ?? null,
      targetsReached: count,
      explanation: atTarget
        ? `${dir === "short" ? "SELL" : "BUY"} opportunity missed — price has already reached ${reachedText}. Do not chase. Wait for a fresh setup or a confirmed retest.`
        : `${dir === "short" ? "SELL" : "BUY"} opportunity missed — price has already reached ${reachedText} since the signal. Do not chase. Wait for a fresh setup.`,
    };
  }

  if (inZone) {
    if (!priceRR || priceRR.rr < minRR) {
      return {
        ...base,
        status: "LATE ENTRY",
        remainingRR: priceRR?.rr ?? null,
        targetsReached,
        explanation: `LATE ENTRY — price is in the zone, but remaining R:R at ${fmt(
          price,
        )} is only ${fmt(priceRR?.rr ?? 0, 1)} (minimum ${fmt(
          minRR,
          1,
        )}). The remaining reward no longer justifies the risk; do not execute.`,
      };
    }
    return {
      ...base,
      status: "VALID ENTRY",
      canArm: true,
      canAutoExecute: true,
      remainingRR: priceRR.rr,
      targetsReached,
      explanation: `VALID ENTRY — ${fmt(price)} is inside the ${dir.toUpperCase()} zone ${fmt(
        entryLow,
      )}–${fmt(entryHigh)} with R:R ${fmt(priceRR.rr, 1)} at the executable price.`,
    };
  }

  if (beyondZoneTowardTarget) {
    return {
      ...base,
      status: "LATE ENTRY",
      remainingRR: priceRR?.rr ?? null,
      targetsReached,
      explanation: `LATE ENTRY — price ${fmt(price)} has moved past the ideal ${fmt(
        entryLow,
      )}–${fmt(entryHigh)} zone toward the target${priceRR ? `; remaining R:R is ${fmt(priceRR.rr, 1)}` : ""}. Do not chase — automatic execution is blocked.`,
    };
  }

  const mid = (entryLow + entryHigh) / 2;
  const midRR = remainingRiskReward(dir, mid, stop, takeProfit);
  return {
    ...base,
    status: "WAITING FOR ENTRY",
    canArm: true,
    canAutoExecute: false,
    remainingRR: midRR?.rr ?? null,
    targetsReached,
    explanation: `WAITING FOR ENTRY — price ${fmt(price)} has not reached the ${fmt(
      entryLow,
    )}–${fmt(entryHigh)} zone yet. At the zone the potential R:R is ${fmt(
      midRR?.rr ?? 0,
      1,
    )}; arming monitors only this entry condition.`,
  };
}
