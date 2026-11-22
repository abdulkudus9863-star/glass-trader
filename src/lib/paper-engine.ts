/* ============================================================================
   Paper-trading exit engine (pure).

   The simulator only ever holds ONE stop-loss and ONE take-profit per
   position, so exit detection is a pure function of:
     - the trade's direction and levels,
     - the latest mark price,
     - candles printed since the position opened.

   Rules:
     LONG  → stop when price <= stop-loss, target when price >= take-profit
     SHORT → stop when price >= stop-loss, target when price <= take-profit

   Detection order:
     1. Candle high/low crossing (intrabar — never waits for a close).
     2. Latest mark (covers the forming bar, which may contain pre-entry
        prints, and feeds that have no candles for the symbol).

   A gap through the level fills at the actual open/mark price that is
   available, not at the level that was jumped over. When a single candle
   spans both levels the stop wins: the intra-candle sequence is unknowable,
   so the simulator takes the conservative outcome.

   Nothing here mutates state. `closeTrade` on the server is idempotent; the
   caller is responsible for not firing duplicate closes.
   ========================================================================== */

import type { Candle } from "./market";

export type PaperExitReason = "stop" | "target";

export interface PaperExitInput {
  direction: "long" | "short";
  stopLoss: number;
  takeProfit?: number | null;
  /** Position open time, epoch ms. */
  openedAt: number;
  /** Latest mark price; null when the feed has no real quote. */
  mark: number | null;
  /** Candles for the position's symbol (any timeframe, chronological). */
  candles?: readonly Candle[] | null;
}

export interface PaperExitTrigger {
  reason: PaperExitReason;
  /** Price the simulated fill is recorded at (actual available price). */
  price: number;
  via: "candle" | "mark";
  /** Candle open time in epoch ms when `via === "candle"`. */
  candleTime: number | null;
}

const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

function barTrigger(
  direction: "long" | "short",
  candle: Candle,
  stop: number,
  target: number | null,
): { reason: PaperExitReason; price: number } | null {
  const hitStop =
    direction === "long" ? candle.low <= stop : candle.high >= stop;
  const hitTarget =
    target != null &&
    (direction === "long" ? candle.high >= target : candle.low <= target);

  // Ambiguous candle: stop first, never report an optimistic target.
  if (hitStop) {
    const gapped =
      direction === "long" ? candle.open <= stop : candle.open >= stop;
    return { reason: "stop", price: gapped ? candle.open : stop };
  }
  if (hitTarget) {
    const gapped =
      direction === "long" ? candle.open >= target : candle.open <= target;
    return { reason: "target", price: gapped ? candle.open : target! };
  }
  return null;
}

/**
 * Evaluate whether an open paper position must be closed.
 *
 * Only candles that STARTED at/after the position's open time are used for
 * high/low detection. The bar that was already forming when the position was
 * opened can contain prints from before entry, so its extremes are not used;
 * the live mark covers that bar honestly.
 */
export function evaluatePaperExit(
  input: PaperExitInput,
): PaperExitTrigger | null {
  const { direction, stopLoss, takeProfit, openedAt, mark } = input;
  if (direction !== "long" && direction !== "short") return null;
  if (!valid(stopLoss)) return null;
  if (!Number.isFinite(openedAt)) return null;

  const stop = stopLoss;
  const target = valid(takeProfit) ? takeProfit : null;
  // Wrong-side levels cannot represent a real position; never fabricate a hit.
  if (target != null && direction === "long" && target <= stop) return null;
  if (target != null && direction === "short" && target >= stop) return null;

  const candles = Array.isArray(input.candles) ? input.candles : [];

  /* 1 — intrabar candle scan, oldest first (earliest hit wins). */
  for (const candle of candles) {
    if (
      !candle ||
      !Number.isFinite(candle.time) ||
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close)
    ) {
      continue;
    }
    const startedAt = candle.time * 1000;
    if (startedAt < openedAt) continue;
    if (candle.high < candle.low) continue;
    const hit = barTrigger(direction, candle, stop, target);
    if (hit) {
      return {
        reason: hit.reason,
        price: hit.price,
        via: "candle",
        candleTime: startedAt,
      };
    }
  }

  /* 2 — latest mark. A gap through the level fills at the mark. */
  if (!valid(mark)) return null;
  const hitStop = direction === "long" ? mark <= stop : mark >= stop;
  if (hitStop) {
    return { reason: "stop", price: mark, via: "mark", candleTime: null };
  }
  if (target != null) {
    const hitTarget = direction === "long" ? mark >= target : mark <= target;
    if (hitTarget) {
      return { reason: "target", price: mark, via: "mark", candleTime: null };
    }
  }
  return null;
}

/** Consistent audit label for a stored `closeReason`. */
export function closeReasonLabel(
  reason: string | null | undefined,
): string {
  switch (reason) {
    case "stop":
      return "STOP LOSS";
    case "target":
      return "TAKE PROFIT";
    case "manual":
      return "MANUAL";
    default:
      return "—";
  }
}
