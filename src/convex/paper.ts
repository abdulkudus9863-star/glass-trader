import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/* ============================================================================
   PAPER TRADING ENGINE — simulation only.

   Hard rules:
   - No real orders are ever sent anywhere. There is no broker integration.
   - Every number here is derived from user-entered or feed-observed prices.
     Nothing is fabricated: if a mark price is unknown the caller must not
     invent one — it simply cannot compute unrealized P&L and must say so.
   - INR display: USD-quoted P&L is converted with the account's
     `usdInrRate`, a user-configurable assumption stored on the account and
     labelled as an assumption in the UI (not a live FX quote).
   - Every mutation authenticates, validates inputs and only touches the
     caller's own rows.
   ========================================================================== */

/** Instruments the simulator accepts. USD-quoted only, so INR conversion is well defined. */
const SUPPORTED_SYMBOLS = [
  "XAUUSD",
  "XAGUSD",
  "BTCUSD",
  "BTCUSDT",
  "ETHUSDT",
  "EURUSD",
  "GBPUSD",
] as const;

export const DEFAULT_BALANCE_INR = 100_000;
export const DEFAULT_RISK_PERCENT = 1;
export const DEFAULT_MAX_DAILY_LOSS_INR = 5_000;
/** Default conversion *assumption* — the UI makes clear the user can and should set their own. */
export const DEFAULT_USD_INR_RATE = 83.5;

const MIN_BALANCE = 1_000;
const MAX_BALANCE = 100_000_000;
const MIN_RISK_PERCENT = 0.1;
const MAX_RISK_PERCENT = 5;
const MAX_DAILY_LOSS_CAP = 10_000_000;
const MIN_RATE = 1;
const MAX_RATE = 500;
/** Absolute sanity cap on trade size in units (guards against a fat-fingered price). */
const MAX_SIZE = 1_000_000;

type Account = Doc<"paperAccounts">;
type Trade = Doc<"paperTrades">;

/* ------------------------------ helpers ---------------------------------- */

async function requireUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in.");
  return userId;
}

async function getAccount(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Account | null> {
  return (
    (await ctx.db
      .query("paperAccounts")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first()) ?? null
  );
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
}

/** UTC day start — the daily-loss window is explicitly documented as UTC. */
function utcDayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Position size in units for a given risk budget.
 * Risk budget is INR; the instrument risks quote-currency (USD) per unit,
 * so convert the budget first. Returns null when the maths is undefined.
 */
function autoSize(
  riskInr: number,
  usdInrRate: number,
  entry: number,
  stop: number,
): number | null {
  const riskPerUnitUsd = Math.abs(entry - stop);
  if (riskPerUnitUsd <= 0) return null;
  const budgetUsd = riskInr / usdInrRate;
  const size = budgetUsd / riskPerUnitUsd;
  if (!Number.isFinite(size) || size <= 0) return null;
  return Number(size.toFixed(6));
}

/** Realized P&L in INR for a completed trade. Pure function of stored values. */
function realizedPnlInr(
  direction: "long" | "short",
  entry: number,
  exit: number,
  size: number,
  rate: number,
): number {
  const multiplier = direction === "long" ? 1 : -1;
  return (exit - entry) * multiplier * size * rate;
}

/* ------------------------------ account ---------------------------------- */

/** The caller's paper account (null until created). */
export const account = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await getAccount(ctx, userId);
  },
});

/** Create the paper account with defaults on first visit. Idempotent. */
export const ensureAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await getAccount(ctx, userId);
    if (existing) return existing;
    const now = Date.now();
    const id = await ctx.db.insert("paperAccounts", {
      userId,
      balance: DEFAULT_BALANCE_INR,
      startingBalance: DEFAULT_BALANCE_INR,
      riskPercent: DEFAULT_RISK_PERCENT,
      maxDailyLoss: DEFAULT_MAX_DAILY_LOSS_INR,
      usdInrRate: DEFAULT_USD_INR_RATE,
      createdAt: now,
    });
    return (await ctx.db.get(id))!;
  },
});

/** Update risk settings. Every field is range-checked server-side. */
export const updateSettings = mutation({
  args: {
    balance: v.optional(v.number()),
    riskPercent: v.optional(v.number()),
    maxDailyLoss: v.optional(v.number()),
    usdInrRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const account = await getAccount(ctx, userId);
    if (!account) throw new Error("No paper account yet.");

    const patch: Partial<Account> = {};

    if (args.balance !== undefined) {
      if (!Number.isFinite(args.balance)) throw new Error("Invalid balance.");
      const rounded = Math.round(args.balance);
      if (rounded < MIN_BALANCE || rounded > MAX_BALANCE) {
        throw new Error(
          `Balance must be between ₹${MIN_BALANCE.toLocaleString("en-IN")} and ₹${MAX_BALANCE.toLocaleString("en-IN")}.`,
        );
      }
      patch.balance = rounded;
      patch.startingBalance = rounded;
    }

    if (args.riskPercent !== undefined) {
      if (
        !Number.isFinite(args.riskPercent) ||
        args.riskPercent < MIN_RISK_PERCENT ||
        args.riskPercent > MAX_RISK_PERCENT
      ) {
        throw new Error(
          `Risk per trade must be between ${MIN_RISK_PERCENT}% and ${MAX_RISK_PERCENT}%.`,
        );
      }
      patch.riskPercent = Number(args.riskPercent.toFixed(2));
    }

    if (args.maxDailyLoss !== undefined) {
      if (!Number.isFinite(args.maxDailyLoss) || args.maxDailyLoss < 0) {
        throw new Error("Maximum daily loss cannot be negative.");
      }
      if (args.maxDailyLoss > MAX_DAILY_LOSS_CAP) {
        throw new Error("Maximum daily loss is too large.");
      }
      patch.maxDailyLoss = Math.round(args.maxDailyLoss);
    }

    if (args.usdInrRate !== undefined) {
      if (
        !Number.isFinite(args.usdInrRate) ||
        args.usdInrRate < MIN_RATE ||
        args.usdInrRate > MAX_RATE
      ) {
        throw new Error(
          `USD/INR conversion assumption must be between ${MIN_RATE} and ${MAX_RATE}.`,
        );
      }
      patch.usdInrRate = Number(args.usdInrRate.toFixed(2));
    }

    if (Object.keys(patch).length === 0) return account;
    await ctx.db.patch(account._id, patch);
    return (await ctx.db.get(account._id))!;
  },
});

/* ------------------------------ trading ---------------------------------- */

/**
 * Open a simulated position.
 *
 * - `size` omitted → derived from the account's risk % (risk-based sizing).
 * - `clientToken` makes the call idempotent: a retried/double-tapped submit
 *   returns the original trade instead of creating a duplicate.
 * - Rejects when the UTC-day realized loss has already hit `maxDailyLoss`.
 * - Live trading is impossible from here: there is no broker code path.
 */
export const openTrade = mutation({
  args: {
    symbol: v.string(),
    direction: v.union(v.literal("long"), v.literal("short")),
    entry: v.number(),
    stopLoss: v.number(),
    takeProfit: v.optional(v.number()),
    size: v.optional(v.number()),
    clientToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const account = await getAccount(ctx, userId);
    if (!account) throw new Error("No paper account yet — initialize it first.");

    // Idempotency: identical submission already recorded.
    if (args.clientToken) {
      const existing = await ctx.db
        .query("paperTrades")
        .withIndex("clientToken", (q) => q.eq("clientToken", args.clientToken!))
        .first();
      if (existing) {
        if (existing.userId !== userId) throw new Error("Invalid request.");
        return { trade: existing, duplicate: true };
      }
    }

    if (!(SUPPORTED_SYMBOLS as readonly string[]).includes(args.symbol)) {
      throw new Error(
        `Symbol ${args.symbol} is not supported for paper trading (USD-quoted instruments only).`,
      );
    }
    assertFinitePositive("Entry price", args.entry);
    assertFinitePositive("Stop loss", args.stopLoss);
    if (args.takeProfit !== undefined) {
      assertFinitePositive("Take profit", args.takeProfit);
    }
    if (args.entry === args.stopLoss) {
      throw new Error("Stop loss cannot equal the entry price.");
    }
    if (args.direction === "long" && args.stopLoss >= args.entry) {
      throw new Error("For a long position the stop must be below entry.");
    }
    if (args.direction === "short" && args.stopLoss <= args.entry) {
      throw new Error("For a short position the stop must be above entry.");
    }
    if (
      args.takeProfit !== undefined &&
      ((args.direction === "long" && args.takeProfit <= args.entry) ||
        (args.direction === "short" && args.takeProfit >= args.entry))
    ) {
      throw new Error("Take profit is on the wrong side of the entry.");
    }

    // Daily loss guard (UTC window, documented in the UI).
    const now = Date.now();
    const dayStart = utcDayStart(now);
    if (account.maxDailyLoss > 0) {
      const closedToday = await ctx.db
        .query("paperTrades")
        .withIndex("userId_status", (q) =>
          q.eq("userId", userId).eq("status", "CLOSED"),
        )
        .order("desc")
        .take(500);
      let dailyLoss = 0;
      for (const t of closedToday) {
        if ((t.closedAt ?? 0) < dayStart) continue;
        const pnl = t.realizedPnlInr ?? 0;
        if (pnl < 0) dailyLoss += -pnl;
      }
      if (dailyLoss >= account.maxDailyLoss) {
        throw new Error(
          `Daily loss limit reached (₹${dailyLoss.toLocaleString("en-IN")} of ₹${account.maxDailyLoss.toLocaleString("en-IN")} — UTC day). Trading resumes tomorrow or after you raise the limit in risk settings.`,
        );
      }
    }

    const riskInr = (account.balance * account.riskPercent) / 100;

    let size: number;
    if (args.size !== undefined) {
      if (!Number.isFinite(args.size) || args.size <= 0) {
        throw new Error("Position size must be a positive number.");
      }
      if (args.size > MAX_SIZE) throw new Error("Position size is too large.");
      size = Number(args.size.toFixed(6));
    } else {
      const derived = autoSize(
        riskInr,
        account.usdInrRate,
        args.entry,
        args.stopLoss,
      );
      if (derived === null) {
        throw new Error(
          "Could not derive a position size from your risk settings — check entry and stop prices.",
        );
      }
      if (derived > MAX_SIZE) {
        throw new Error(
          "Derived position size exceeds the simulator cap — tighten your stop or lower risk.",
        );
      }
      size = derived;
    }

    const trade: Omit<Trade, "_id" | "_creationTime"> = {
      userId,
      symbol: args.symbol,
      direction: args.direction,
      entry: args.entry,
      size,
      stopLoss: args.stopLoss,
      takeProfit: args.takeProfit,
      status: "OPEN",
      riskInr: Math.round(riskInr),
      openedAt: now,
      clientToken: args.clientToken,
    };
    const id = await ctx.db.insert("paperTrades", trade);
    return { trade: (await ctx.db.get(id))!, duplicate: false };
  },
});

/** Close an open simulated position at a given price and realize P&L in INR. */
export const closeTrade = mutation({
  args: {
    tradeId: v.id("paperTrades"),
    exit: v.number(),
    reason: v.union(
      v.literal("manual"),
      v.literal("stop"),
      v.literal("target"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const account = await getAccount(ctx, userId);
    if (!account) throw new Error("No paper account yet.");

    const trade = await ctx.db.get(args.tradeId);
    if (!trade || trade.userId !== userId) throw new Error("Trade not found.");
    if (trade.status === "CLOSED") {
      // Idempotent no-op: a retried close never double-counts P&L.
      return { trade, balance: account.balance, alreadyClosed: true };
    }

    assertFinitePositive("Exit price", args.exit);

    const pnl = realizedPnlInr(
      trade.direction,
      trade.entry,
      args.exit,
      trade.size,
      account.usdInrRate,
    );

    const newBalance = account.balance + pnl;
    await ctx.db.patch(trade._id, {
      status: "CLOSED",
      exit: args.exit,
      closeReason: args.reason,
      realizedPnlInr: Math.round(pnl),
      closedAt: Date.now(),
    });
    await ctx.db.patch(account._id, { balance: Math.round(newBalance) });

    return {
      trade: (await ctx.db.get(trade._id))!,
      balance: Math.round(newBalance),
      alreadyClosed: false,
    };
  },
});

/**
 * Reset the caller's paper account.
 *
 * Scope guarantees:
 *  - only rows whose `userId` is the authenticated caller are touched
 *  - the token wallet, user record and every other feature are untouched
 *  - an audit row is written to `paperResets` (who/when/how much/was removed)
 *  - an explicit `confirm: "RESET"` argument is required server-side
 */
export const resetAccount = mutation({
  args: { confirm: v.literal("RESET") },
  handler: async (ctx, { confirm }) => {
    const userId = await requireUserId(ctx);
    if (confirm !== "RESET") {
      throw new Error('Confirmation required: pass confirm: "RESET".');
    }
    const account = await getAccount(ctx, userId);
    const trades = await ctx.db
      .query("paperTrades")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(1000);
    for (const t of trades) {
      await ctx.db.delete(t._id);
    }
    if (account) {
      await ctx.db.delete(account._id);
    }
    await ctx.db.insert("paperResets", {
      userId,
      archivedTrades: trades.length,
      previousBalance: account?.balance ?? 0,
      at: Date.now(),
    });
    return { reset: true, removedTrades: trades.length };
  },
});

/** Discard an open (or closed) trade without affecting the balance. */
export const deleteTrade = mutation({
  args: { tradeId: v.id("paperTrades") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trade = await ctx.db.get(args.tradeId);
    if (!trade || trade.userId !== userId) throw new Error("Trade not found.");
    if (trade.status === "OPEN") {
      await ctx.db.delete(trade._id);
      return { removed: true };
    }
    throw new Error("Closed trades are kept for performance history.");
  },
});

/* ------------------------------ queries ---------------------------------- */

/** The caller's trades, newest first (open + closed). */
export const listTrades = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const trades = await ctx.db
      .query("paperTrades")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    return trades;
  },
});

/**
 * Performance analytics over *actual recorded closed trades*.
 *
 * Honesty rules baked into the response:
 * - `sampleSize` is always returned.
 * - `calibrated` is false until ≥20 closed trades exist; win rate / expectancy
 *   are then flagged as uncalibrated observations, never as win probability.
 * - `expectedValue` is null below 10 closed trades rather than being shown.
 * - Profit factor is null when there are no losses (never displayed as ∞).
 */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const account = await getAccount(ctx, userId);

    const trades = await ctx.db
      .query("paperTrades")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(500);

    const open = trades.filter((t) => t.status === "OPEN");
    const closed = trades.filter((t) => t.status === "CLOSED");

    const pnls = closed.map((t) => t.realizedPnlInr ?? 0);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const sampleSize = closed.length;

    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLoss = -losses.reduce((a, b) => a + b, 0);
    const totalPnl = pnls.reduce((a, b) => a + b, 0);

    const winRate = sampleSize > 0 ? wins.length / sampleSize : null;
    const avgWin = wins.length > 0 ? grossProfit / wins.length : null;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : null;
    const expectancy = sampleSize > 0 ? totalPnl / sampleSize : null;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

    // Average R multiple — uses each trade's stored INR risk as 1R.
    const rMultiples = closed
      .filter((t) => t.riskInr > 0)
      .map((t) => (t.realizedPnlInr ?? 0) / t.riskInr);
    const avgR =
      rMultiples.length > 0
        ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length
        : null;

    // Expected value per trade in INR — only once there is a usable sample.
    const expectedValue =
      sampleSize >= 10 && winRate !== null && avgWin !== null && avgLoss !== null
        ? winRate * avgWin - (1 - winRate) * avgLoss
        : null;

    const startOfDay = utcDayStart(Date.now());
    const closedToday = closed.filter((t) => (t.closedAt ?? 0) >= startOfDay);
    const dailyPnl = closedToday.reduce((a, t) => a + (t.realizedPnlInr ?? 0), 0);
    const dailyLoss = closedToday.reduce(
      (a, t) => a + Math.min(0, t.realizedPnlInr ?? 0),
      0,
    );

    const openRisk = open.reduce((a, t) => a + t.riskInr, 0);

    return {
      account,
      openCount: open.length,
      closedCount: closed.length,
      openRiskInr: openRisk,
      dailyPnlInr: dailyPnl,
      dailyLossInr: dailyLoss,
      dailyLossHit:
        account !== null &&
        account.maxDailyLoss > 0 &&
        -dailyLoss >= account.maxDailyLoss,
      stats: {
        sampleSize,
        calibrated: sampleSize >= 20,
        wins: wins.length,
        losses: losses.length,
        winRate,
        avgWinInr: avgWin,
        avgLossInr: avgLoss,
        grossProfitInr: grossProfit,
        grossLossInr: grossLoss,
        profitFactor,
        expectancyInr: expectancy,
        expectedValueInr: expectedValue,
        avgR,
        totalPnlInr: totalPnl,
        bestInr: sampleSize > 0 ? Math.max(...pnls) : null,
        worstInr: sampleSize > 0 ? Math.min(...pnls) : null,
      },
    };
  },
});
