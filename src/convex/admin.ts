import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { FOUNDER_EMAIL } from "./users";

/** Verify the caller is the founder / owner. */
async function requireFounder(ctx: { db: any; auth: any }) {
  const userId = await getAuthUserId(ctx as any);
  if (userId === null) throw new Error("Not signed in.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found.");
  if (user.email?.trim().toLowerCase() !== FOUNDER_EMAIL) {
    throw new Error("Access denied — founder credentials required.");
  }
  return user;
}

/** List every registered user with their wallet balance and role. */
export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireFounder(ctx);

    const users = await ctx.db.query("users").collect();
    const results = await Promise.all(
      users.map(async (u) => {
        const wallet = await ctx.db
          .query("wallets")
          .withIndex("userId", (q) => q.eq("userId", u._id))
          .first();
        return {
          _id: u._id,
          name: u.name ?? null,
          email: u.email ?? null,
          role: u.role ?? "user",
          isFounder:
            u.email?.trim().toLowerCase() === FOUNDER_EMAIL,
          balance: wallet?.balance ?? 0,
          createdAt: u._creationTime,
        };
      }),
    );

    // Sort: founder first, then by creation time descending
    results.sort((a, b) => {
      if (a.isFounder) return -1;
      if (b.isFounder) return 1;
      return b.createdAt - a.createdAt;
    });

    return results;
  },
});

/** Adjust any user's token balance (credit or debit). */
export const adjustBalance = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { userId, amount, reason }) => {
    await requireFounder(ctx);

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!wallet) {
      // Create wallet if it doesn't exist
      if (amount > 0) {
        await ctx.db.insert("wallets", { userId, balance: amount });
        return { balance: amount };
      }
      throw new Error("User has no wallet to deduct from.");
    }

    const newBalance = wallet.balance + amount;
    if (newBalance < 0) {
      throw new Error(
        `Insufficient balance. Current: ${wallet.balance}, tried to deduct: ${Math.abs(amount)}`,
      );
    }

    await ctx.db.patch(wallet._id, { balance: newBalance });
    return {
      balance: newBalance,
      reason: reason ?? (amount > 0 ? "Credit" : "Debit"),
    };
  },
});

/** Toggle a user's role between 'admin' and 'user'. */
export const toggleUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.string(),
  },
  handler: async (ctx, { userId, newRole }) => {
    await requireFounder(ctx);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    if (user.email?.trim().toLowerCase() === FOUNDER_EMAIL) {
      throw new Error("Cannot modify the founder's role.");
    }

    const validRole =
      newRole === "admin" || newRole === "user" || newRole === "member"
        ? newRole
        : "user";

    await ctx.db.patch(userId, { role: validRole });
    return { success: true, role: validRole };
  },
});
