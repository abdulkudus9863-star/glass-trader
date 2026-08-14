import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** The signed-in user's copilot history, oldest first. */
export const listMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const docs = await ctx.db
      .query("copilotMessages")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
    return docs.reverse();
  },
});

/** Persist one copilot message. */
export const saveMessage = mutation({
  args: {
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    verdict: v.optional(
      v.union(v.literal("LONG"), v.literal("SHORT"), v.literal("WAIT")),
    ),
    bullets: v.optional(v.array(v.string())),
    rr: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    await ctx.db.insert("copilotMessages", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});
