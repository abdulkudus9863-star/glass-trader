import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { strategySpecValidator } from "./schema";

/** The signed-in user's strategy portfolio, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("strategies")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

/** Upsert a strategy by its spec id. */
export const save = mutation({
  args: { spec: strategySpecValidator },
  handler: async (ctx, { spec }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const existing = (await ctx.db
      .query("strategies")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()).find((s) => s.spec.id === spec.id);
    if (existing) {
      await ctx.db.patch(existing._id, { spec, createdAt: Date.now() });
    } else {
      await ctx.db.insert("strategies", { userId, spec, createdAt: Date.now() });
    }
  },
});

/** Delete a strategy by its spec id. */
export const remove = mutation({
  args: { specId: v.string() },
  handler: async (ctx, { specId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const existing = (await ctx.db
      .query("strategies")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()).find((s) => s.spec.id === specId);
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Cycle the status tag of a saved strategy. */
export const setStatus = mutation({
  args: { specId: v.string(), status: v.string() },
  handler: async (ctx, { specId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const existing = (await ctx.db
      .query("strategies")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()).find((s) => s.spec.id === specId);
    if (!existing) return;
    const current = existing.spec;
    await ctx.db.patch(existing._id, {
      spec: {
        ...current,
        status:
          status === "ACTIVE" || status === "BACKTESTED" || status === "DRAFT"
            ? status
            : current.status,
      },
    });
  },
});
