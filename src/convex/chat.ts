import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** The most recent chat messages, oldest first. Reactive. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const messages = await ctx.db
      .query("chatMessages")
      .order("desc")
      .take(Math.min(limit ?? 50, 100));
    return messages.reverse();
  },
});

/** Post a message to the community room. Requires a signed-in user. */
export const send = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to chat.");
    }

    const trimmed = text.trim().slice(0, 500);
    if (trimmed.length === 0) {
      throw new Error("Message cannot be empty.");
    }

    const user = await ctx.db.get(userId);
    const authorName =
      user?.name?.trim() ||
      (user?.email ? user.email.split("@")[0] : "Anonymous");

    await ctx.db.insert("chatMessages", {
      authorId: userId,
      authorName,
      text: trimmed,
    });
  },
});
