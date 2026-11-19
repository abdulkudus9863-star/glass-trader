import { describe, expect, test } from "bun:test";
import { FakeDb, makeCtx } from "./helpers/convexFake";
import * as paper from "../src/convex/paper";

const call = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);

function seedAccount(db: FakeDb, userId: string, balance = 100_000) {
  return db.seed("paperAccounts", {
    userId,
    balance,
    startingBalance: 100_000,
    riskPercent: 1,
    maxDailyLoss: 5_000,
    usdInrRate: 83.5,
    createdAt: 1_700_000_000_000,
  });
}

function seedTrade(db: FakeDb, userId: string, status: "OPEN" | "CLOSED" = "OPEN") {
  return db.seed("paperTrades", {
    userId,
    symbol: "BTCUSDT",
    direction: "long",
    entry: 60_000,
    size: 0.1,
    stopLoss: 59_000,
    status,
    riskInr: 1_000,
    openedAt: 1_700_000_000_000,
    ...(status === "CLOSED"
      ? { exit: 61_000, realizedPnlInr: 920, closedAt: 1_700_000_100_000 }
      : {}),
  });
}

describe("paper account reset", () => {
  test("requires the explicit RESET confirmation", async () => {
    const db = new FakeDb();
    seedAccount(db, "userA");
    await expect(
      call(paper.resetAccount, makeCtx(db, "userA"), { confirm: "yes" }),
    ).rejects.toThrow(/confirmation required/i);
    expect(db.count("paperAccounts")).toBe(1);
  });

  test("removes only the caller's account and trades, and writes an audit row", async () => {
    const db = new FakeDb();
    seedAccount(db, "userA", 88_000);
    seedTrade(db, "userA", "OPEN");
    seedTrade(db, "userA", "CLOSED");
    seedAccount(db, "userB", 120_000);
    seedTrade(db, "userB", "OPEN");

    const res = await call(paper.resetAccount, makeCtx(db, "userA"), {
      confirm: "RESET",
    });
    expect(res.reset).toBe(true);
    expect(res.removedTrades).toBe(2);

    const trades = await db.query("paperTrades").collect();
    expect(trades).toHaveLength(1);
    expect(trades[0].userId).toBe("userB");

    const accounts = await db.query("paperAccounts").collect();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].userId).toBe("userB");

    const audit = await db.query("paperResets").collect();
    expect(audit).toHaveLength(1);
    expect(audit[0].userId).toBe("userA");
    expect(audit[0].archivedTrades).toBe(2);
    expect(audit[0].previousBalance).toBe(88_000);
    expect(typeof audit[0].at).toBe("number");
  });

  test("rejects anonymous callers", async () => {
    const db = new FakeDb();
    await expect(
      call(paper.resetAccount, makeCtx(db, null), { confirm: "RESET" }),
    ).rejects.toThrow(/not signed in/i);
  });

  test("a reset account can be recreated with the default ₹1,00,000 balance", async () => {
    const db = new FakeDb();
    seedAccount(db, "userA", 5_000);
    await call(paper.resetAccount, makeCtx(db, "userA"), { confirm: "RESET" });
    const ctx = makeCtx(db, "userA");
    const created = await call(paper.ensureAccount, ctx);
    expect(created.balance).toBe(100_000);
    expect(created.startingBalance).toBe(100_000);
  });
});
