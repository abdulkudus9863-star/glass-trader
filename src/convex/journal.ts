import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Trade journal — real backend persistence per user.
 *
 * Entries are created only from the trader's own form submissions (never
 * seeded, never simulated). Win rate and net P&L are computed client-side
 * from these stored rows, so results survive reloads and follow the user
 * across devices.
 */

/** The signed-in user's journal entries, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("journalEntries")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(500);
  },
});

/** Log one completed trade. Validates the numbers before storing. */
export const add = mutation({
  args: {
    symbol: v.string(),
    direction: v.union(v.literal("long"), v.literal("short")),
    entry: v.number(),
    exit: v.number(),
    size: v.number(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    if (
      !Number.isFinite(args.entry) ||
      !Number.isFinite(args.exit) ||
      args.entry <= 0 ||
      args.size <= 0
    ) {
      throw new Error("Invalid trade values.");
    }
    return await ctx.db.insert("journalEntries", {
      ...args,
      notes: args.notes.trim().slice(0, 300),
      userId,
      createdAt: Date.now(),
    });
  },
});

/** Delete one journal entry. Only the owner can delete it. */
export const remove = mutation({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) throw new Error("Not found.");
    await ctx.db.delete(id);
  },
});
