import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Trial balance granted to every new account. */
export const TRIAL_BALANCE = 20;

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
    await ctx.db.insert("wallets", { userId, balance: TRIAL_BALANCE });
    return { balance: TRIAL_BALANCE };
  },
});

/** Atomically spend tokens. Throws when the balance is insufficient. */
export const spend = mutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    if (amount <= 0) throw new Error("Invalid amount.");
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!wallet) throw new Error("No wallet yet — claim your trial first.");
    if (wallet.balance < amount) {
      throw new Error("Insufficient tokens.");
    }
    await ctx.db.patch(wallet._id, { balance: wallet.balance - amount });
    return { balance: wallet.balance - amount };
  },
});

/** Credit tokens to the wallet (used by the Token Store). */
export const topUp = mutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    if (amount <= 0) throw new Error("Invalid amount.");
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!wallet) {
      await ctx.db.insert("wallets", { userId, balance: amount });
      return { balance: amount };
    }
    await ctx.db.patch(wallet._id, { balance: wallet.balance + amount });
    return { balance: wallet.balance + amount };
  },
});
