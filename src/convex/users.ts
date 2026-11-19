import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

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

/**
 * Update the signed-in user's own profile.
 *
 * Security: the target is ALWAYS `getAuthUserId(ctx)` — a user id from the
 * frontend is never accepted. Only display fields are writable; balances,
 * trades, roles and auth records are untouched.
 */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, { name, image }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");

    const patch: { name?: string; image?: string } = {};

    if (name !== undefined) {
      const clean = name.trim().replace(/\s+/g, " ");
      if (clean.length < 2) throw new Error("Display name must be at least 2 characters.");
      if (clean.length > 60) throw new Error("Display name must be 60 characters or fewer.");
      if (!/^[\p{L}\p{N} .,'’-]+$/u.test(clean)) {
        throw new Error("Display name contains unsupported characters.");
      }
      patch.name = clean;
    }

    if (image !== undefined) {
      const clean = image.trim();
      if (clean.length > 0) {
        if (!/^https:\/\/\S+$/i.test(clean)) {
          throw new Error("Avatar must be an https image URL.");
        }
        if (clean.length > 500) throw new Error("Avatar URL is too long.");
        patch.image = clean;
      } else {
        patch.image = "";
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("Nothing to update.");
    }

    await ctx.db.patch(userId, patch);
    const updated = await ctx.db.get(userId);
    return {
      name: updated?.name ?? null,
      image: updated?.image ?? null,
    };
  },
});

/** The signed-in user's notification/theme preferences. */
export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (prefs) return prefs;
    return {
      notifySignals: true,
      notifyDaily: false,
      notifyProduct: false,
      theme: "dark" as const,
      updatedAt: 0,
    };
  },
});

/** Save notification/theme preferences for the signed-in user only. */
export const updatePreferences = mutation({
  args: {
    notifySignals: v.optional(v.boolean()),
    notifyDaily: v.optional(v.boolean()),
    notifyProduct: v.optional(v.boolean()),
    theme: v.optional(v.union(v.literal("dark"), v.literal("soft"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();

    if (!existing) {
      const id = await ctx.db.insert("userPreferences", {
        userId,
        notifySignals: args.notifySignals ?? true,
        notifyDaily: args.notifyDaily ?? false,
        notifyProduct: args.notifyProduct ?? false,
        theme: args.theme ?? "dark",
        updatedAt: Date.now(),
      });
      return (await ctx.db.get(id))!;
    }

    await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
    return (await ctx.db.get(existing._id))!;
  },
});
