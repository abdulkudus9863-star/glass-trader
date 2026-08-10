import { getAuthUserId } from "@convex-dev/auth/server";
import { query, QueryCtx } from "./_generated/server";

/**
 * The owner / founder of the platform. This account is automatically
 * promoted to the admin role wherever the app reads the current user.
 */
export const FOUNDER_EMAIL = "abdulkudus9863@gmail.com";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/**
 * The current user enriched with platform identity. The founder account is
 * always treated as a super admin (role "admin") and flagged with
 * `isFounder`, which powers the Founder Portal badge in the terminal.
 */
export const sessionUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return null;
    }
    const isFounder =
      user.email?.trim().toLowerCase() === FOUNDER_EMAIL;
    if (!isFounder) {
      return {
        ...user,
        isFounder: false as const,
      };
    }
    return {
      ...user,
      role: "admin" as const,
      isFounder: true as const,
    };
  },
});
