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
    }).index("userId", ["userId"]),

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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
