import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/* ------------------------- strategy spec validator ------------------------- */

export const strategySpecValidator = v.object({
  id: v.string(),
  name: v.string(),
  prompt: v.string(),
  asset: v.string(),
  timeframe: v.string(),
  bias: v.union(v.literal("LONG"), v.literal("SHORT"), v.literal("WAIT")),
  entryZone: v.array(v.number()),
  stopLoss: v.number(),
  takeProfits: v.array(v.number()),
  invalidation: v.number(),
  riskReward: v.number(),
  conditions: v.array(v.string()),
  confluence: v.array(v.string()),
  tokenCost: v.number(),
  createdAt: v.number(),
  status: v.union(
    v.literal("ACTIVE"),
    v.literal("DRAFT"),
    v.literal("BACKTESTED"),
  ),
});

/* ----------------------------- signal validator ---------------------------- */

export const signalStatusValidator = v.union(
  v.literal("SENT"),
  v.literal("FAILED"),
  v.literal("SIMULATED"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // community chat room (v1 workspace feature)
    chatMessages: defineTable({
      authorId: v.id("users"),
      authorName: v.string(),
      text: v.string(),
    }),

    // per-user token wallet (real backend persistence — replaces localStorage)
    wallets: defineTable({
      userId: v.id("users"),
      balance: v.number(),
      /** One-time welcome bonus already granted on this wallet. */
      welcomeGranted: v.optional(v.boolean()),
      updatedAt: v.optional(v.number()),
    }).index("userId", ["userId"]),

    /* -----------------------------------------------------------------------
       TOKEN LEDGER — append-only audit trail for every balance change.
       Only server-side mutations may write here; users never touch it.
       ------------------------------------------------------------------------ */
    tokenTransactions: defineTable({
      userId: v.id("users"),
      userEmail: v.optional(v.string()),
      previousBalance: v.number(),
      delta: v.number(),
      newBalance: v.number(),
      kind: v.union(
        v.literal("grant"),
        v.literal("welcome"),
        v.literal("spend"),
        v.literal("credit"),
        v.literal("debit"),
      ),
      description: v.string(),
      /** Administrator who performed the change (absent for self-service rows). */
      adminId: v.optional(v.id("users")),
      adminEmail: v.optional(v.string()),
      /** Idempotency key — a repeated submission can never double-credit. */
      idemKey: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("userId", ["userId"])
      .index("idemKey", ["idemKey"])
      .index("createdAt", ["createdAt"]),

    // per-user strategy portfolio (real backend persistence)
    strategies: defineTable({
      userId: v.id("users"),
      spec: strategySpecValidator,
      createdAt: v.number(),
    }).index("userId", ["userId"]),

    // outgoing Telegram signal dispatch log (real backend persistence)
    signals: defineTable({
      userId: v.id("users"),
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
      createdAt: v.number(),
    }).index("userId", ["userId"]),

    // per-user copilot conversation history (real backend persistence)
    copilotMessages: defineTable({
      userId: v.id("users"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      text: v.string(),
      verdict: v.optional(
        v.union(v.literal("LONG"), v.literal("SHORT"), v.literal("WAIT")),
      ),
      bullets: v.optional(v.array(v.string())),
      rr: v.optional(v.string()),
      model: v.optional(v.string()),
      /** Instrument the answer was grounded on (never mixed across pairs). */
      symbol: v.optional(v.string()),
      /** Which engine answered: local, openai, gemini. */
      provider: v.optional(v.string()),
      createdAt: v.number(),
    }).index("userId", ["userId"]),

    // per-user trade journal (real backend persistence — only the trader's
    // own entries are ever stored; nothing is seeded or simulated)
    journalEntries: defineTable({
      userId: v.id("users"),
      symbol: v.string(),
      direction: v.union(v.literal("long"), v.literal("short")),
      entry: v.number(),
      exit: v.number(),
      size: v.number(),
      notes: v.string(),
      createdAt: v.number(),
    }).index("userId", ["userId"]),

    /* -----------------------------------------------------------------------
       PAPER TRADING — simulation only. Never sends orders to any broker.
       The account is denominated in INR; USD-quoted P&L is converted with the
       account's user-configurable `usdInrRate` assumption (clearly labelled
       in the UI — no live FX rate is invented).
       ------------------------------------------------------------------------ */
    paperAccounts: defineTable({
      userId: v.id("users"),
      balance: v.number(), // virtual balance in INR
      startingBalance: v.number(), // INR — for return calculations
      riskPercent: v.number(), // % of balance risked per trade
      maxDailyLoss: v.number(), // INR hard cap on realized losses per UTC day; 0 = no cap
      usdInrRate: v.number(), // user-set conversion assumption for USD-quoted P&L
      createdAt: v.number(),
    }).index("userId", ["userId"]),

    paperTrades: defineTable({
      userId: v.id("users"),
      symbol: v.string(),
      direction: v.union(v.literal("long"), v.literal("short")),
      entry: v.number(),
      size: v.number(), // units at the symbol's quote price
      stopLoss: v.number(),
      takeProfit: v.optional(v.number()),
      status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
      riskInr: v.number(), // INR at risk when the trade was opened
      exit: v.optional(v.number()),
      closeReason: v.optional(
        v.union(
          v.literal("manual"),
          v.literal("stop"),
          v.literal("target"),
        ),
      ),
      realizedPnlInr: v.optional(v.number()),
      openedAt: v.number(),
      closedAt: v.optional(v.number()),
      // idempotency key so a double-tap can never create two identical trades
      clientToken: v.optional(v.string()),
    })
      .index("userId", ["userId"])
      .index("userId_status", ["userId", "status"])
      .index("clientToken", ["clientToken"]),

    /* Audit trail for paper-account resets (never real user data). */
    paperResets: defineTable({
      userId: v.id("users"),
      archivedTrades: v.number(),
      previousBalance: v.number(),
      at: v.number(),
    }).index("userId", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
