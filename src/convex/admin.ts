import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { FOUNDER_EMAIL } from "./users";

type ReadWriteCtx = QueryCtx | MutationCtx;

/**
 * Server-side administrator gate.
 *
 * The role stored in the database is the single source of truth. The founder
 * account (verified by email against the constant compiled into the backend)
 * is always treated as an administrator, so the owner can never lock
 * themselves out. Frontend role flags are never trusted.
 *
 * There is deliberately no mutation that lets a caller elevate themselves:
 * `toggleUserRole` is admin-only, and `claimFounderRole` only succeeds for the
 * exact founder email.
 */
async function requireAdmin(ctx: ReadWriteCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found.");
  const founder = isFounderEmail(user.email);
  if (user.role !== "admin" && !founder) {
    throw new Error("Access denied — administrator role required.");
  }
  return user;
}

function isFounderEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === FOUNDER_EMAIL;
}

async function walletFor(ctx: ReadWriteCtx, userId: Id<"users">) {
  return (
    (await ctx.db
      .query("wallets")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first()) ?? null
  );
}

/** Append one audited ledger row (never called from the frontend). */
async function recordLedger(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    userEmail?: string | null;
    previousBalance: number;
    delta: number;
    newBalance: number;
    kind: "grant" | "welcome" | "spend" | "credit" | "debit";
    description: string;
    admin: Doc<"users">;
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
    adminId: args.admin._id,
    adminEmail: args.admin.email ?? undefined,
    idemKey: args.idemKey,
    createdAt: Date.now(),
  });
}

/**
 * Promote the signed-in founder account to the stored `admin` role.
 * Idempotent and self-verifying: it only succeeds when the caller's own
 * email matches the founder address compiled into the backend.
 */
export const claimFounderRole = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    if (!isFounderEmail(user.email)) {
      throw new Error("Access denied — founder credentials required.");
    }
    if (user.role !== "admin") {
      await ctx.db.patch(userId, { role: "admin" });
    }
    return { role: "admin" as const };
  },
});

/** Aggregate numbers for the admin dashboard overview cards. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const wallets = await ctx.db.query("wallets").collect();
    const txs = await ctx.db.query("tokenTransactions").collect();

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeIds = new Set<string>();
    let tokensIssued = 0;
    let tokensConsumed = 0;
    for (const t of txs) {
      if (t.createdAt >= cutoff) activeIds.add(String(t.userId));
      if (t.delta > 0) tokensIssued += t.delta;
      else tokensConsumed += Math.abs(t.delta);
    }
    const realUsers = users.filter((u) => !u.isAnonymous);
    return {
      totalUsers: realUsers.length,
      activeUsers: realUsers.filter((u) => activeIds.has(String(u._id)))
        .length,
      admins: users.filter(
        (u) => u.role === "admin" || isFounderEmail(u.email),
      ).length,
      tokensIssued,
      tokensConsumed,
      tokensRemaining: wallets.reduce((s, w) => s + (w.balance ?? 0), 0),
      transactionCount: txs.length,
    };
  },
});

/** List every registered user with balance, status and last activity. */
export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").collect();
    const txs = await ctx.db.query("tokenTransactions").collect();

    const lastActivity = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const t of txs) {
      const id = String(t.userId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if ((lastActivity.get(id) ?? 0) < t.createdAt) {
        lastActivity.set(id, t.createdAt);
      }
    }

    const results = await Promise.all(
      users
        .filter((u) => !u.isAnonymous)
        .map(async (u) => {
          const wallet = await walletFor(ctx, u._id);
          const seen = Math.max(
            lastActivity.get(String(u._id)) ?? 0,
            u.emailVerificationTime ?? 0,
          );
          return {
            _id: u._id,
            name: u.name ?? null,
            email: u.email ?? null,
            role: u.role ?? "user",
            isFounder: isFounderEmail(u.email),
            balance: wallet?.balance ?? 0,
            createdAt: u._creationTime,
            lastActivity: seen || null,
            transactionCount: counts.get(String(u._id)) ?? 0,
            status:
              wallet == null
                ? "NO WALLET"
                : (wallet.balance <= 0
                  ? "EMPTY"
                  : "ACTIVE"),
          };
        }),
    );

    results.sort((a, b) => {
      if (a.isFounder) return -1;
      if (b.isFounder) return 1;
      return b.createdAt - a.createdAt;
    });

    return results;
  },
});

/** Full profile for one user: identity, wallet and token history. */
export const userDetail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    const wallet = await walletFor(ctx, userId);
    const transactions = await ctx.db
      .query("tokenTransactions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    return {
      user: {
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        role: user.role ?? "user",
        isFounder: isFounderEmail(user.email),
        createdAt: user._creationTime,
        emailVerificationTime: user.emailVerificationTime ?? null,
      },
      balance: wallet?.balance ?? 0,
      transactions,
    };
  },
});

/** Latest ledger rows across all users (audit feed). */
export const listTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const cap = Math.min(Math.max(Math.floor(limit ?? 50), 1), 200);
    return await ctx.db
      .query("tokenTransactions")
      .withIndex("createdAt")
      .order("desc")
      .take(cap);
  },
});

/**
 * Administrator-only balance change.
 *
 *  - role verified on the server for every call
 *  - never allows a negative resulting balance
 *  - rejects non-finite / zero amounts and absurd values
 *  - `idempotencyKey` makes a duplicated submission a no-op
 *  - writes an audited ledger row in the same transaction as the patch
 */
export const adjustBalance = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, { userId, amount, reason, idempotencyKey }) => {
    const admin = await requireAdmin(ctx);

    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error("Amount must be a non-zero number of tokens.");
    }
    const delta = Math.trunc(amount);
    if (delta === 0) throw new Error("Amount must be a whole number of tokens.");
    if (Math.abs(delta) > 1_000_000) {
      throw new Error("Amount exceeds the per-transaction limit of 1,000,000.");
    }

    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found.");
    if (String(target._id) === String(admin._id)) {
      throw new Error("Administrators cannot adjust their own balance.");
    }

    if (idempotencyKey) {
      const duplicate = await ctx.db
        .query("tokenTransactions")
        .withIndex("idemKey", (q) => q.eq("idemKey", idempotencyKey))
        .first();
      if (duplicate) {
        throw new Error(
          "DUPLICATE_TRANSACTION — this refill has already been applied.",
        );
      }
    }

    const wallet = await walletFor(ctx, userId);
    const previous = wallet?.balance ?? 0;

    if (!wallet) {
      if (delta < 0) {
        throw new Error("User has no wallet to deduct from.");
      }
      await ctx.db.insert("wallets", {
        userId,
        balance: delta,
        welcomeGranted: false,
        updatedAt: Date.now(),
      });
    } else {
      const next = previous + delta;
      if (next < 0) {
        throw new Error(
          `Insufficient balance. Current: ${previous}, tried to deduct: ${Math.abs(delta)}`,
        );
      }
      await ctx.db.patch(wallet._id, { balance: next, updatedAt: Date.now() });
    }

    const newBalance = previous + delta;
    await recordLedger(ctx, {
      userId,
      userEmail: target.email ?? null,
      previousBalance: previous,
      delta,
      newBalance,
      kind: delta > 0 ? "credit" : "debit",
      description: reason?.trim() || (delta > 0 ? "Admin refill" : "Admin deduction"),
      admin,
      idemKey: idempotencyKey,
    });

    return { balance: newBalance, delta };
  },
});

/** Toggle a user's role between 'admin' and 'user'. Admin-only. */
export const toggleUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.string(),
  },
  handler: async (ctx, { userId, newRole }) => {
    const admin = await requireAdmin(ctx);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found.");
    if (isFounderEmail(user.email)) {
      throw new Error("Cannot modify the founder's role.");
    }
    if (String(user._id) === String(admin._id)) {
      throw new Error("Cannot change your own role.");
    }

    const validRole =
      newRole === "admin" || newRole === "user" || newRole === "member"
        ? newRole
        : "user";

    await ctx.db.patch(userId, { role: validRole });
    return { success: true, role: validRole };
  },
});
