import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/** Trial balance granted to every new account. */
export const TRIAL_BALANCE = 20;
/** One-time welcome bonus (fixed amount — the user can never choose it). */
export const WELCOME_BONUS = 25;

/**
 * A token amount must be a positive, finite number. The backend — not the
 * UI — is the only place that enforces this, so a hand-crafted request can
 * never spend or credit a negative, NaN or infinite amount.
 */
function assertPositiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid token amount.");
  }
  return Math.floor(amount);
}

/**
 * Append one row to the token ledger. Every balance change in this app goes
 * through here, so the admin dashboard can always reconstruct history.
 */
async function recordTransaction(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    userEmail?: string | null;
    previousBalance: number;
    delta: number;
    newBalance: number;
    kind: "grant" | "welcome" | "spend" | "credit" | "debit";
    description: string;
    idemKey?: string;
  },
) {
  await ctx.db.insert("tokenTransactions", {
    userId: args.userId,
    userEmail: args.userEmail ?? undefined,
    previousBalance: args.previousBalance,
    delta: args.delta,
    newBalance: args.newBalance,
    kind: args.kind,
    description: args.description,
    idemKey: args.idemKey,
    createdAt: Date.now(),
  });
}

/**
 * Current token wallet. Returns null until a wallet row exists — call
 * `claimTrial` once to create it with the trial balance.
 */
export const getWallet = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return (
      (await ctx.db
        .query("wallets")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .first()) ?? null
    );
  },
});

/** Create the wallet with the trial balance if it does not exist yet. */
export const claimTrial = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const existing = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) return { balance: existing.balance };
    const user = await ctx.db.get(userId);
    await ctx.db.insert("wallets", {
      userId,
      balance: TRIAL_BALANCE + WELCOME_BONUS,
      welcomeGranted: true,
      updatedAt: Date.now(),
    });
    await recordTransaction(ctx, {
      userId,
      userEmail: user?.email ?? null,
      previousBalance: 0,
      delta: TRIAL_BALANCE,
      newBalance: TRIAL_BALANCE,
      kind: "grant",
      description: "Trial balance granted",
      idemKey: `trial:${userId}`,
    });
    await recordTransaction(ctx, {
      userId,
      userEmail: user?.email ?? null,
      previousBalance: TRIAL_BALANCE,
      delta: WELCOME_BONUS,
      newBalance: TRIAL_BALANCE + WELCOME_BONUS,
      kind: "welcome",
      description: "Welcome bonus",
      idemKey: `welcome:${userId}`,
    });
    return { balance: TRIAL_BALANCE + WELCOME_BONUS };
  },
});

/**
 * Atomically spend tokens. Throws when the balance is insufficient; the
 * ledger row is written in the same transaction as the balance patch.
 */
export const spend = mutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const cost = assertPositiveAmount(amount);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!wallet) throw new Error("No wallet yet — claim your trial first.");
    if (wallet.balance < cost) {
      throw new Error("Insufficient tokens.");
    }
    const previous = wallet.balance;
    const next = previous - cost;
    if (next < 0) throw new Error("Insufficient tokens."); // defensive guard
    await ctx.db.patch(wallet._id, { balance: next, updatedAt: Date.now() });
    const user = await ctx.db.get(userId);
    await recordTransaction(ctx, {
      userId,
      userEmail: user?.email ?? null,
      previousBalance: previous,
      delta: -cost,
      newBalance: next,
      kind: "spend",
      description: "Token spend",
    });
    return { balance: next };
  },
});

/* ---------------------------------------------------------------------------
   There is deliberately NO user-callable top-up: a signed-in user must never
   be able to mint tokens for their own wallet. Refills happen exclusively
   through the administrator-only `admin.adjustBalance`, which enforces the
   role check on the server and writes an audited ledger row.
   ------------------------------------------------------------------------- */
