import { describe, expect, test } from "bun:test";
import { FakeDb, makeCtx } from "./helpers/convexFake";

import * as wallet from "../src/convex/wallet";
import * as admin from "../src/convex/admin";

const FOUNDER = "abdulkudus9863@gmail.com";
const call = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);

function seedUser(
  db: FakeDb,
  id: string,
  email: string,
  role?: "admin" | "user" | "member",
) {
  db.seed("users", {
    _id: id,
    email,
    name: id.replace("users:", "User "),
    ...(role ? { role } : {}),
  });
  return id;
}

function seedWallet(db: FakeDb, userId: string, balance: number) {
  return db.seed("wallets", { userId, balance });
}

const asFounder = (db: FakeDb) => {
  seedUser(db, "users:founder", FOUNDER);
  return makeCtx(db, "users:founder");
};

const asAdmin = (db: FakeDb) => {
  seedUser(db, "users:admin", "admin@example.com", "admin");
  return makeCtx(db, "users:admin");
};

describe("wallet — trial and welcome grants", () => {
  test("claimTrial creates the wallet (trial + welcome) with a full ledger trail", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    const ctx = makeCtx(db, uid);

    const res = await call(wallet.claimTrial, ctx);
    expect(res.balance).toBe(45); // 20 trial + 25 welcome
    expect(db.count("wallets")).toBe(1);

    // idempotent: a second call never creates a second wallet or grant
    const again = await call(wallet.claimTrial, ctx);
    expect(again.balance).toBe(45);
    expect(db.count("wallets")).toBe(1);

    const rows = await db.query("tokenTransactions").collect();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      delta: 20,
      previousBalance: 0,
      newBalance: 20,
      kind: "grant",
      userEmail: "a@example.com",
    });
    expect(rows[1]).toMatchObject({
      delta: 25,
      previousBalance: 20,
      newBalance: 45,
      kind: "welcome",
    });
  });

  test("existing wallets are never topped up again by visiting the app", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    db.seed("wallets", { userId: uid, balance: 7 }); // legacy wallet, no flag
    const ctx = makeCtx(db, uid);

    const res = await call(wallet.claimTrial, ctx);
    expect(res.balance).toBe(7);
    expect(db.count("tokenTransactions")).toBe(0);
  });

  test("there are no user-callable top-up or bonus mutations", () => {
    expect((wallet as any).topUp).toBeUndefined();
    expect((wallet as any).claimWelcomeBonus).toBeUndefined();
  });
});

describe("wallet — spending", () => {
  test("spend deducts and records an audited ledger row", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, uid, 50);
    const ctx = makeCtx(db, uid);

    const res = await call(wallet.spend, ctx, { amount: 5 });
    expect(res.balance).toBe(45);

    const rows = await db.query("tokenTransactions").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(-5);
    expect(rows[0].previousBalance).toBe(50);
    expect(rows[0].newBalance).toBe(45);
    expect(rows[0].kind).toBe("spend");
  });

  test("spend can never make the balance negative", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, uid, 10);
    const ctx = makeCtx(db, uid);

    await expect(call(wallet.spend, ctx, { amount: 11 })).rejects.toThrow(
      /insufficient/i,
    );
    // exact-balance spend is allowed and lands on zero
    const res = await call(wallet.spend, ctx, { amount: 10 });
    expect(res.balance).toBe(0);
  });

  test("spend rejects zero, negative, NaN and Infinity amounts", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, uid, 100);
    const ctx = makeCtx(db, uid);

    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(call(wallet.spend, ctx, { amount })).rejects.toThrow(
        /invalid token amount/i,
      );
    }
    expect(db.count("tokenTransactions")).toBe(0);
  });

  test("spend requires a signed-in user", async () => {
    const db = new FakeDb();
    await expect(
      call(wallet.spend, makeCtx(db, null), { amount: 5 }),
    ).rejects.toThrow(/not signed in/i);
  });
});

describe("admin — access control", () => {
  test("regular users cannot read any admin query", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, uid, 20);
    const ctx = makeCtx(db, uid);

    await expect(call(admin.overview, ctx)).rejects.toThrow(/access denied/i);
    await expect(call(admin.listAllUsers, ctx)).rejects.toThrow(
      /access denied/i,
    );
    await expect(call(admin.listTransactions, ctx)).rejects.toThrow(
      /access denied/i,
    );
    await expect(
      call(admin.userDetail, ctx, { userId: uid }),
    ).rejects.toThrow(/access denied/i);
  });

  test("regular users cannot adjust balances or promote themselves", async () => {
    const db = new FakeDb();
    const uid = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, uid, 20);
    const ctx = makeCtx(db, uid);

    await expect(
      call(admin.adjustBalance, ctx, { userId: uid, amount: 500 }),
    ).rejects.toThrow(/access denied/i);
    await expect(
      call(admin.toggleUserRole, ctx, { userId: uid, newRole: "admin" }),
    ).rejects.toThrow(/access denied/i);

    // nothing changed
    const w = await db.query("wallets").first();
    expect(w?.balance).toBe(20);
    const me = await db.get(uid);
    expect(me?.role).toBeUndefined();
  });

  test("anonymous callers are rejected", async () => {
    const db = new FakeDb();
    await expect(call(admin.overview, makeCtx(db, null))).rejects.toThrow(
      /not signed in/i,
    );
  });

  test("the founder email grants access even before the role flag is stored", async () => {
    const db = new FakeDb();
    seedUser(db, "users:founder", FOUNDER); // no role
    const ctx = await asFounder(db);
    const ov = await call(admin.overview, ctx);
    expect(ov.totalUsers).toBeGreaterThan(0);
  });

  test("claimFounderRole promotes only the founder account", async () => {
    const db = new FakeDb();
    seedUser(db, "users:founder", FOUNDER);
    seedUser(db, "users:a", "a@example.com");

    await expect(
      call(admin.claimFounderRole, makeCtx(db, "users:a")),
    ).rejects.toThrow(/access denied/i);

    const res = await call(admin.claimFounderRole, makeCtx(db, "users:founder"));
    expect(res.role).toBe("admin");
    const founder = await db.get("users:founder");
    expect(founder?.role).toBe("admin");
  });
});

describe("admin — token refills and the audit trail", () => {
  test("admin credit updates the balance and records who did it", async () => {
    const db = new FakeDb();
    const target = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, target, 10);
    const ctx = await asAdmin(db);

    const res = await call(admin.adjustBalance, ctx, {
      userId: target,
      amount: 40,
      reason: "Monthly refill",
    });
    expect(res.balance).toBe(50);

    const walletRow = await db.query("wallets").first();
    expect(walletRow?.balance).toBe(50);

    const rows = await db.query("tokenTransactions").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: target,
      userEmail: "a@example.com",
      previousBalance: 10,
      delta: 40,
      newBalance: 50,
      kind: "credit",
      description: "Monthly refill",
      adminEmail: "admin@example.com",
    });
  });

  test("admin deduction works but can never go negative", async () => {
    const db = new FakeDb();
    const target = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, target, 10);
    const ctx = await asAdmin(db);

    await expect(
      call(admin.adjustBalance, ctx, { userId: target, amount: -11 }),
    ).rejects.toThrow(/insufficient/i);
    const walletRow = await db.query("wallets").first();
    expect(walletRow?.balance).toBe(10);

    const res = await call(admin.adjustBalance, ctx, {
      userId: target,
      amount: -4,
    });
    expect(res.balance).toBe(6);
    const rows = await db.query("tokenTransactions").collect();
    expect(rows[0].kind).toBe("debit");
    expect(rows[0].delta).toBe(-4);
  });

  test("duplicate refills are blocked by the idempotency key", async () => {
    const db = new FakeDb();
    const target = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, target, 0);
    const ctx = await asAdmin(db);

    const args = {
      userId: target,
      amount: 100,
      idempotencyKey: "refill-abc",
    };
    const first = await call(admin.adjustBalance, ctx, args);
    expect(first.balance).toBe(100);

    await expect(call(admin.adjustBalance, ctx, args)).rejects.toThrow(
      /duplicate_transaction/i,
    );
    const walletRow = await db.query("wallets").first();
    expect(walletRow?.balance).toBe(100);
    expect(db.count("tokenTransactions")).toBe(1);
  });

  test("invalid and self-directed adjustments are refused", async () => {
    const db = new FakeDb();
    const target = seedUser(db, "users:a", "a@example.com");
    seedWallet(db, target, 10);
    const ctx = await asAdmin(db);

    for (const amount of [0, Number.NaN, 0.4]) {
      await expect(
        call(admin.adjustBalance, ctx, { userId: target, amount }),
      ).rejects.toThrow(/amount/i);
    }
    await expect(
      call(admin.adjustBalance, ctx, { userId: target, amount: 2_000_000 }),
    ).rejects.toThrow(/limit/i);
    await expect(
      call(admin.adjustBalance, ctx, {
        userId: "users:admin",
        amount: 5,
      }),
    ).rejects.toThrow(/own balance/i);
  });

  test("crediting a user with no wallet creates one and records previous 0", async () => {
    const db = new FakeDb();
    const target = seedUser(db, "users:a", "a@example.com");
    const ctx = await asAdmin(db);

    const res = await call(admin.adjustBalance, ctx, {
      userId: target,
      amount: 30,
    });
    expect(res.balance).toBe(30);
    const rows = await db.query("tokenTransactions").collect();
    expect(rows[0].previousBalance).toBe(0);
    expect(rows[0].newBalance).toBe(30);

    // debiting a user with no wallet is refused
    const other = seedUser(db, "users:b", "b@example.com");
    await expect(
      call(admin.adjustBalance, ctx, { userId: other, amount: -5 }),
    ).rejects.toThrow(/no wallet/i);
  });

  test("deleting/unknown users are rejected", async () => {
    const db = new FakeDb();
    const ctx = await asAdmin(db);
    await expect(
      call(admin.adjustBalance, ctx, { userId: "users:ghost", amount: 5 }),
    ).rejects.toThrow(/user not found/i);
  });
});

describe("admin — dashboard aggregates and history", () => {
  async function seeded() {
    const db = new FakeDb();
    const founder = seedUser(db, "users:founder", FOUNDER);
    const alice = seedUser(db, "users:alice", "alice@example.com");
    const bob = seedUser(db, "users:bob", "bob@example.com");
    seedWallet(db, founder, 20);
    seedWallet(db, alice, 40);
    seedWallet(db, bob, 0);
    db.seed("tokenTransactions", {
      userId: alice,
      userEmail: "alice@example.com",
      previousBalance: 0,
      delta: 100,
      newBalance: 100,
      kind: "credit",
      description: "Seed",
      adminEmail: FOUNDER,
      createdAt: Date.now(),
    });
    db.seed("tokenTransactions", {
      userId: alice,
      userEmail: "alice@example.com",
      previousBalance: 100,
      delta: -60,
      newBalance: 40,
      kind: "spend",
      description: "Spend",
      createdAt: Date.now(),
    });
    return { db, founder, alice, bob };
  }

  test("overview totals are exact", async () => {
    const { db, founder } = await seeded();
    const ov = await call(admin.overview, makeCtx(db, founder));
    expect(ov.totalUsers).toBe(3);
    expect(ov.tokensIssued).toBe(100);
    expect(ov.tokensConsumed).toBe(60);
    expect(ov.tokensRemaining).toBe(60); // 20 + 40 + 0
    expect(ov.transactionCount).toBe(2);
    expect(ov.activeUsers).toBe(1); // only alice has recent transactions
  });

  test("listAllUsers exposes balance, status and join date without leaking more", async () => {
    const { db, alice } = await seeded();
    const list = await call(admin.listAllUsers, await asFounder(db));
    const a = list.find((u: any) => u._id === alice);
    expect(a.balance).toBe(40);
    expect(a.status).toBe("ACTIVE");
    expect(a.transactionCount).toBe(2);
    expect(typeof a.createdAt).toBe("number");
    const b = list.find((u: any) => u.email === "bob@example.com");
    expect(b.status).toBe("EMPTY");
    expect(b.balance).toBe(0);
  });

  test("per-user history returns newest first with full audit fields", async () => {
    const { db, alice } = await seeded();
    const detail = await call(admin.userDetail, await asFounder(db), {
      userId: alice,
    });
    expect(detail.balance).toBe(40);
    expect(detail.transactions).toHaveLength(2);
    expect(detail.transactions[0].delta).toBe(-60); // newest first
    expect(detail.transactions[0].newBalance).toBe(40);
    expect(detail.user.email).toBe("alice@example.com");
  });

  test("global ledger respects the limit", async () => {
    const { db } = await seeded();
    const rows = await call(admin.listTransactions, await asFounder(db), {
      limit: 1,
    });
    expect(rows).toHaveLength(1);
  });
});

describe("admin — role management", () => {
  test("admin can promote and demote ordinary users", async () => {
    const db = new FakeDb();
    const target = seedUser(db, "users:a", "a@example.com");
    const ctx = await asAdmin(db);

    let res = await call(admin.toggleUserRole, ctx, {
      userId: target,
      newRole: "admin",
    });
    expect(res.role).toBe("admin");
    res = await call(admin.toggleUserRole, ctx, {
      userId: target,
      newRole: "user",
    });
    expect(res.role).toBe("user");
    // unknown role strings are clamped to "user"
    res = await call(admin.toggleUserRole, ctx, {
      userId: target,
      newRole: "superuser",
    });
    expect(res.role).toBe("user");
  });

  test("the founder role can never be modified or self-changed", async () => {
    const db = new FakeDb();
    seedUser(db, "users:founder", FOUNDER);
    seedUser(db, "users:admin", "admin@example.com", "admin");
    const ctx = await asAdmin(db);

    await expect(
      call(admin.toggleUserRole, ctx, {
        userId: "users:founder",
        newRole: "user",
      }),
    ).rejects.toThrow(/founder/i);
    await expect(
      call(admin.toggleUserRole, ctx, {
        userId: "users:admin",
        newRole: "user",
      }),
    ).rejects.toThrow(/own role/i);
  });
});
