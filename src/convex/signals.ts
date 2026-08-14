import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { signalStatusValidator } from "./schema";

const signalArgs = {
  bias: v.union(v.literal("LONG"), v.literal("SHORT")),
  asset: v.string(),
  tf: v.string(),
  entry: v.string(),
  sl: v.string(),
  tp1: v.string(),
  tp2: v.string(),
  confluence: v.string(),
  tier: v.string(),
  rr: v.string(),
  message: v.string(),
  status: signalStatusValidator,
  dispatchMode: v.union(v.literal("telegram"), v.literal("simulated")),
  telegramMessageId: v.optional(v.number()),
};

/** The signed-in user's outgoing signal feed, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("signals")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

/** Log a signal row directly (used for seeds and manual logging). */
export const createSignal = mutation({
  args: signalArgs,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    return await ctx.db.insert("signals", { ...args, userId, createdAt: Date.now() });
  },
});

/** Internal insert used by the telegram dispatch action. */
export const insert = internalMutation({
  args: {
    ...signalArgs,
    userId: v.id("users"),
  },
  handler: async (ctx, { userId, ...args }) => {
    return await ctx.db.insert("signals", { ...args, userId, createdAt: Date.now() });
  },
});
