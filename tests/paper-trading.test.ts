/**
 * Part C — paper trading validation.
 *
 * Runs the REAL Convex handlers from src/convex/paper.ts against an
 * in-memory database. Convex executes mutations serially (one at a time,
 * serializable), so the "concurrent" tests serialize handler execution the
 * same way before firing overlapping calls.
 */
import { describe, expect, test } from "bun:test";
import { FakeDb, makeCtx } from "./helpers/convexFake";
import * as paper from "../src/convex/paper";
import { paperPnlInr } from "../src/lib/paper-pnl";
import { validatePaperTrade } from "../src/lib/paper-form";

const call = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);

/** Serialize calls like Convex does for mutations (serializable execution). */
function serialRunner() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
}

function utcDayStart(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function seedClosed(
  db: FakeDb,
  userId: string,
  pnl: number,
  opts: { riskInr?: number; closedAt?: number } = {},
) {
  const now = Date.now();
  db.seed("paperTrades", {
    userId,
    symbol: "XAUUSD",
    direction: "long",
    entry: 2400,
    size: 1,
    stopLoss: 2390,
    status: "CLOSED",
    riskInr: opts.riskInr ?? 1000,
    exit: 2401,
    closeReason: "manual",
    realizedPnlInr: pnl,
    openedAt: (opts.closedAt ?? now) - 3_600_000,
    closedAt: opts.closedAt ?? now,
  });
}

async function newAccount(db: FakeDb, userId = "userA") {
  const ctx = makeCtx(db, userId);
  await call(paper.ensureAccount, ctx, {});
  return ctx;
}

/* ============================ account + settings ========================= */

describe("account & settings", () => {
  test("ensureAccount is idempotent with documented defaults", async () => {
    const db = new FakeDb();
    const ctx = makeCtx(db, "userA");
    const a1 = await call(paper.ensureAccount, ctx, {});
    const a2 = await call(paper.ensureAccount, ctx, {});
    expect(a1._id).toBe(a2._id);
    expect(db.count("paperAccounts")).toBe(1);
    expect(a1.balance).toBe(paper.DEFAULT_BALANCE_INR);
    expect(a1.startingBalance).toBe(paper.DEFAULT_BALANCE_INR);
    expect(a1.riskPercent).toBe(paper.DEFAULT_RISK_PERCENT);
    expect(a1.maxDailyLoss).toBe(paper.DEFAULT_MAX_DAILY_LOSS_INR);
    expect(a1.usdInrRate).toBe(paper.DEFAULT_USD_INR_RATE);
  });

  test("settings reject out-of-range and non-finite values", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    await expect(call(paper.updateSettings, ctx, { riskPercent: 6 })).rejects.toThrow(
      /Risk per trade must be between/,
    );
    await expect(call(paper.updateSettings, ctx, { riskPercent: 0 })).rejects.toThrow(
      /Risk per trade must be between/,
    );
    await expect(call(paper.updateSettings, ctx, { balance: 500 })).rejects.toThrow(
      /Balance must be between/,
    );
    await expect(
      call(paper.updateSettings, ctx, { balance: Number.NaN }),
    ).rejects.toThrow(/Invalid balance/);
    await expect(
      call(paper.updateSettings, ctx, { maxDailyLoss: -1 }),
    ).rejects.toThrow(/cannot be negative/);
    await expect(call(paper.updateSettings, ctx, { usdInrRate: 1000 })).rejects.toThrow(
      /USD\/INR conversion assumption/,
    );
    await expect(
      call(paper.updateSettings, ctx, { usdInrRate: Number.NaN }),
    ).rejects.toThrow(/USD\/INR conversion assumption/);
  });

  test("settings apply valid values with rounding", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const acc = await call(paper.updateSettings, ctx, {
      riskPercent: 2.5,
      usdInrRate: 84.129,
      balance: 250_000,
      maxDailyLoss: 7_500,
    });
    expect(acc.riskPercent).toBe(2.5);
    expect(acc.usdInrRate).toBe(84.13);
    expect(acc.balance).toBe(250_000);
    expect(acc.startingBalance).toBe(250_000);
    expect(acc.maxDailyLoss).toBe(7_500);
  });

  test("unauthenticated callers are rejected / see nothing", async () => {
    const db = new FakeDb();
    const anon = makeCtx(db, null);
    await expect(call(paper.ensureAccount, anon, {})).rejects.toThrow(/Not signed in/);
    await expect(
      call(paper.openTrade, anon, {
        symbol: "XAUUSD",
        direction: "long",
        entry: 2400,
        stopLoss: 2390,
      }),
    ).rejects.toThrow(/Not signed in/);
    expect(await call(paper.account, anon, {})).toBeNull();
    expect(await call(paper.listTrades, anon, {})).toEqual([]);
    expect(await call(paper.summary, anon, {})).toBeNull();
  });
});

/* ============================== entries ================================== */

describe("long & short entries, sizing, INR risk", () => {
  test("long entry auto-sizes from risk % and records INR risk", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const res = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    expect(res.duplicate).toBe(false);
    const t = res.trade;
    // risk budget = 1% of ₹100,000 = ₹1000 → USD 1000/83.5 over a $10 stop
    const expectedSize = 1000 / 83.5 / 10;
    expect(t.size).toBeCloseTo(Number(expectedSize.toFixed(6)), 6);
    expect(t.riskInr).toBe(1000);
    expect(t.status).toBe("OPEN");
    expect(t.symbol).toBe("XAUUSD");
    expect(db.count("paperTrades")).toBe(1);
  });

  test("short entry with explicit size is stored as given", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const res = await call(paper.openTrade, ctx, {
      symbol: "BTCUSD",
      direction: "short",
      entry: 60_000,
      stopLoss: 61_000,
      takeProfit: 57_000,
      size: 0.25,
    });
    expect(res.trade.size).toBe(0.25);
    expect(res.trade.direction).toBe("short");
    expect(res.trade.takeProfit).toBe(57_000);
  });

  test("XAGUSD and EURUSD are accepted; unknown symbols rejected", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    await call(paper.openTrade, ctx, {
      symbol: "XAGUSD",
      direction: "long",
      entry: 30,
      stopLoss: 29.5,
    });
    await call(paper.openTrade, ctx, {
      symbol: "EURUSD",
      direction: "long",
      entry: 1.08,
      stopLoss: 1.075,
    });
    await expect(
      call(paper.openTrade, ctx, {
        symbol: "XPTUSD",
        direction: "long",
        entry: 100,
        stopLoss: 99,
      }),
    ).rejects.toThrow(/not supported for paper trading/);
    expect(db.count("paperTrades")).toBe(2);
  });

  test("size validation: non-positive, non-finite and oversized rejected", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    await expect(
      call(paper.openTrade, ctx, {
        symbol: "XAUUSD",
        direction: "long",
        entry: 2400,
        stopLoss: 2390,
        size: 0,
      }),
    ).rejects.toThrow(/positive number/);
    await expect(
      call(paper.openTrade, ctx, {
        symbol: "XAUUSD",
        direction: "long",
        entry: 2400,
        stopLoss: 2390,
        size: -1,
      }),
    ).rejects.toThrow(/positive number/);
    await expect(
      call(paper.openTrade, ctx, {
        symbol: "XAUUSD",
        direction: "long",
        entry: 2400,
        stopLoss: 2390,
        size: 10_000_000,
      }),
    ).rejects.toThrow(/too large/);
    await expect(
      call(paper.openTrade, ctx, {
        symbol: "XAUUSD",
        direction: "long",
        entry: Number.NaN,
        stopLoss: 2390,
      }),
    ).rejects.toThrow(/Entry price must be a positive number/);
  });
});

/* =========================== stop / take-profit ========================== */

describe("stop-loss & take-profit validation", () => {
  const base = { symbol: "XAUUSD", entry: 2400 };

  test("long stop must be below entry; short stop above entry", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    await expect(
      call(paper.openTrade, ctx, { ...base, direction: "long", stopLoss: 2410 }),
    ).rejects.toThrow(/stop must be below entry/);
    await expect(
      call(paper.openTrade, ctx, { ...base, direction: "short", stopLoss: 2390 }),
    ).rejects.toThrow(/stop must be above entry/);
    await expect(
      call(paper.openTrade, ctx, { ...base, direction: "long", stopLoss: 2400 }),
    ).rejects.toThrow(/cannot equal the entry price/);
    expect(db.count("paperTrades")).toBe(0);
  });

  test("take profit must sit on the profitable side of entry", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    await expect(
      call(paper.openTrade, ctx, {
        ...base,
        direction: "long",
        stopLoss: 2390,
        takeProfit: 2395,
      }),
    ).rejects.toThrow(/wrong side of the entry/);
    await expect(
      call(paper.openTrade, ctx, {
        ...base,
        direction: "short",
        stopLoss: 2410,
        takeProfit: 2405,
      }),
    ).rejects.toThrow(/wrong side of the entry/);
    expect(db.count("paperTrades")).toBe(0);
  });
});

/* ========================= daily loss protection ========================= */

describe("daily loss protection (UTC day)", () => {
  test("openTrade is blocked once today's realized losses hit the cap", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const first = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    const closed = await call(paper.closeTrade, ctx, {
      tradeId: first.trade._id,
      exit: 2300, // −$100 × 1.1976 units × 83.5 ≈ −₹10,000
      reason: "manual",
    });
    expect(closed.trade.realizedPnlInr).toBeLessThanOrEqual(-5000);

    await expect(
      call(paper.openTrade, ctx, {
        symbol: "XAGUSD",
        direction: "long",
        entry: 30,
        stopLoss: 29.5,
      }),
    ).rejects.toThrow(/Daily loss limit reached/);
    expect(db.count("paperTrades")).toBe(1); // no new row slipped in
  });

  test("losses from a previous UTC day do not count toward today's cap", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    seedClosed(db, "userA", -999_999, { closedAt: utcDayStart() - 1000 });
    const res = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    expect(res.duplicate).toBe(false);
    expect(res.trade.status).toBe("OPEN");
    // 1 seeded closed trade from yesterday + the new open trade
    expect(db.count("paperTrades")).toBe(2);
  });
});

/* ===================== duplicates, idempotency, concurrency ============== */

describe("duplicate submission protection & idempotency", () => {
  test("same clientToken twice creates exactly one trade", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const args = {
      symbol: "XAUUSD",
      direction: "long" as const,
      entry: 2400,
      stopLoss: 2390,
      clientToken: "tok-1",
    };
    const a = await call(paper.openTrade, ctx, args);
    const b = await call(paper.openTrade, ctx, args);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.trade._id).toBe(a.trade._id);
    expect(db.count("paperTrades")).toBe(1);
  });

  test("overlapping (serialized) submissions with one token → one row", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const run = serialRunner();
    const args = {
      symbol: "BTCUSD",
      direction: "short" as const,
      entry: 60_000,
      stopLoss: 61_000,
      clientToken: "tok-race",
    };
    const [r1, r2] = await Promise.all([
      run(() => call(paper.openTrade, ctx, args)),
      run(() => call(paper.openTrade, ctx, args)),
    ]);
    const dupes = [r1, r2].filter((r) => r.duplicate).length;
    expect(dupes).toBe(1);
    expect(db.count("paperTrades")).toBe(1);
  });

  test("distinct clientTokens create distinct trades", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
      clientToken: "a",
    });
    await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
      clientToken: "b",
    });
    expect(db.count("paperTrades")).toBe(2);
  });

  test("another user cannot replay someone else's clientToken", async () => {
    const db = new FakeDb();
    const ctxA = await newAccount(db, "userA");
    await call(paper.openTrade, ctxA, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
      clientToken: "A-token",
    });
    const ctxB = await newAccount(db, "userB");
    await expect(
      call(paper.openTrade, ctxB, {
        symbol: "XAUUSD",
        direction: "long",
        entry: 2400,
        stopLoss: 2390,
        clientToken: "A-token",
      }),
    ).rejects.toThrow(/Invalid request/);
  });
});

/* ============================ closing & P&L ============================== */

describe("closing trades, realized & unrealized P&L", () => {
  test("long win: realized INR P&L and balance update are exact", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const opened = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    const res = await call(paper.closeTrade, ctx, {
      tradeId: opened.trade._id,
      exit: 2410,
      reason: "target",
    });
    const expected = Math.round(
      paperPnlInr("long", 2400, 2410, opened.trade.size, paper.DEFAULT_USD_INR_RATE),
    );
    expect(res.trade.realizedPnlInr).toBe(expected);
    expect(res.trade.status).toBe("CLOSED");
    expect(res.trade.closeReason).toBe("target");
    expect(res.balance).toBe(paper.DEFAULT_BALANCE_INR + expected);
    expect(res.alreadyClosed).toBe(false);
  });

  test("short win is positive; short loss is negative", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const win = await call(paper.openTrade, ctx, {
      symbol: "EURUSD",
      direction: "short",
      entry: 1.10,
      stopLoss: 1.11,
      size: 10_000,
    });
    const winRes = await call(paper.closeTrade, ctx, {
      tradeId: win.trade._id,
      exit: 1.09,
      reason: "target",
    });
    expect(winRes.trade.realizedPnlInr).toBe(
      Math.round(paperPnlInr("short", 1.1, 1.09, 10_000, paper.DEFAULT_USD_INR_RATE)),
    );
    expect(winRes.trade.realizedPnlInr).toBeGreaterThan(0);

    const loss = await call(paper.openTrade, ctx, {
      symbol: "EURUSD",
      direction: "short",
      entry: 1.10,
      stopLoss: 1.11,
      size: 10_000,
    });
    const lossRes = await call(paper.closeTrade, ctx, {
      tradeId: loss.trade._id,
      exit: 1.12,
      reason: "stop",
    });
    expect(lossRes.trade.realizedPnlInr).toBeLessThan(0);
  });

  test("double-close is idempotent: no double-counted P&L or balance", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const opened = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    const first = await call(paper.closeTrade, ctx, {
      tradeId: opened.trade._id,
      exit: 2450,
      reason: "manual",
    });
    const second = await call(paper.closeTrade, ctx, {
      tradeId: opened.trade._id,
      exit: 2450,
      reason: "manual",
    });
    expect(first.alreadyClosed).toBe(false);
    expect(second.alreadyClosed).toBe(true);
    expect(second.balance).toBe(first.balance);
    expect(second.trade.realizedPnlInr).toBe(first.trade.realizedPnlInr);
    const acc = await call(paper.account, ctx, {});
    expect(acc.balance).toBe(first.balance);
  });

  test("invalid exit price rejected; cross-user close rejected", async () => {
    const db = new FakeDb();
    const ctxA = await newAccount(db, "userA");
    const opened = await call(paper.openTrade, ctxA, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    await expect(
      call(paper.closeTrade, ctxA, {
        tradeId: opened.trade._id,
        exit: Number.NaN,
        reason: "manual",
      }),
    ).rejects.toThrow(/Exit price must be a positive number/);

    const ctxB = await newAccount(db, "userB");
    await expect(
      call(paper.closeTrade, ctxB, {
        tradeId: opened.trade._id,
        exit: 2410,
        reason: "manual",
      }),
    ).rejects.toThrow(/Trade not found/);
    await expect(
      call(paper.deleteTrade, ctxB, { tradeId: opened.trade._id }),
    ).rejects.toThrow(/Trade not found/);
  });

  test("deleteTrade removes open rows only", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const opened = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    await call(paper.deleteTrade, ctx, { tradeId: opened.trade._id });
    expect(db.count("paperTrades")).toBe(0);

    const second = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    await call(paper.closeTrade, ctx, {
      tradeId: second.trade._id,
      exit: 2410,
      reason: "manual",
    });
    await expect(
      call(paper.deleteTrade, ctx, { tradeId: second.trade._id }),
    ).rejects.toThrow(/kept for performance history/);
    expect(db.count("paperTrades")).toBe(1);
  });

  test("unrealized P&L (UI formula) matches the backend realized formula", async () => {
    // frontend paperPnlInr at an exit price === backend realized P&L at that price
    const size = 1.197605;
    const rate = 83.5;
    expect(paperPnlInr("long", 2400, 2410, size, rate)).toBeCloseTo(
      10 * size * rate,
      6,
    );
    expect(paperPnlInr("short", 100, 95, 2, rate)).toBeCloseTo(5 * 2 * rate, 6);
    expect(paperPnlInr("long", 2400, 2400, size, rate)).toBe(0);
    expect(paperPnlInr("long", 2400, 2390, size, rate)).toBeLessThan(0);
  });
});

/* =============================== analytics =============================== */

describe("analytics with insufficient data", () => {
  test("zero closed trades → every stat null, never invented", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const s = await call(paper.summary, ctx, {});
    expect(s.closedCount).toBe(0);
    expect(s.openCount).toBe(0);
    expect(s.openRiskInr).toBe(0);
    expect(s.stats.sampleSize).toBe(0);
    expect(s.stats.calibrated).toBe(false);
    expect(s.stats.winRate).toBeNull();
    expect(s.stats.profitFactor).toBeNull();
    expect(s.stats.expectancyInr).toBeNull();
    expect(s.stats.expectedValueInr).toBeNull();
    expect(s.stats.avgWinInr).toBeNull();
    expect(s.stats.avgLossInr).toBeNull();
    expect(s.stats.totalPnlInr).toBe(0);
    expect(s.dailyLossHit).toBe(false);
  });

  test("sample < 10 → expected value withheld; win rate flagged uncalibrated", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    seedClosed(db, "userA", 500);
    seedClosed(db, "userA", -300);
    seedClosed(db, "userA", 200);
    const s = await call(paper.summary, ctx, {});
    expect(s.stats.sampleSize).toBe(3);
    expect(s.stats.wins).toBe(2);
    expect(s.stats.losses).toBe(1);
    expect(s.stats.winRate).toBeCloseTo(2 / 3, 6);
    expect(s.stats.profitFactor).toBeCloseTo(700 / 300, 6);
    expect(s.stats.expectancyInr).toBeCloseTo(400 / 3, 6);
    expect(s.stats.expectedValueInr).toBeNull(); // < 10 trades
    expect(s.stats.calibrated).toBe(false);
    expect(s.stats.avgR).toBeCloseTo((500 - 300 + 200) / 3 / 1000, 6);
    expect(s.stats.totalPnlInr).toBe(400);
    expect(s.stats.bestInr).toBe(500);
    expect(s.stats.worstInr).toBe(-300);
  });

  test("sample ≥ 10 → expected value computed; ≥ 20 → calibrated", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    for (let i = 0; i < 6; i++) seedClosed(db, "userA", 500);
    for (let i = 0; i < 4; i++) seedClosed(db, "userA", -300);
    let s = await call(paper.summary, ctx, {});
    expect(s.stats.sampleSize).toBe(10);
    expect(s.stats.calibrated).toBe(false);
    // EV = 0.6 × 500 − 0.4 × 300 = 180
    expect(s.stats.expectedValueInr).toBeCloseTo(180, 6);

    for (let i = 0; i < 10; i++) seedClosed(db, "userA", 500);
    s = await call(paper.summary, ctx, {});
    expect(s.stats.sampleSize).toBe(20);
    expect(s.stats.calibrated).toBe(true);
  });

  test("all-win sample → PF and EV stay null (no loss observations)", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    for (let i = 0; i < 12; i++) seedClosed(db, "userA", 100);
    const s = await call(paper.summary, ctx, {});
    // profit factor: never shown as ∞ when there are no losses
    expect(s.stats.profitFactor).toBeNull();
    expect(s.stats.winRate).toBe(1);
    // expected value: the loss side of the formula has no observations, so
    // the engine withholds it rather than reporting an optimistic number
    expect(s.stats.expectedValueInr).toBeNull();
    expect(s.stats.avgLossInr).toBeNull();
    expect(s.stats.avgWinInr).toBe(100);
  });

  test("daily loss hit flag + open risk reflect recorded trades only", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const open1 = await call(paper.openTrade, ctx, {
      symbol: "XAUUSD",
      direction: "long",
      entry: 2400,
      stopLoss: 2390,
    });
    expect(open1.trade.riskInr).toBe(1000);
    let s = await call(paper.summary, ctx, {});
    expect(s.openCount).toBe(1);
    expect(s.openRiskInr).toBe(1000);
    expect(s.dailyLossHit).toBe(false);

    await call(paper.closeTrade, ctx, {
      tradeId: open1.trade._id,
      exit: 2300,
      reason: "stop",
    });
    s = await call(paper.summary, ctx, {});
    expect(s.openCount).toBe(0);
    expect(s.dailyPnlInr).toBeLessThan(0);
    expect(s.dailyLossHit).toBe(true); // loss ≥ ₹5,000 cap today (UTC)
  });

  test("other users' trades never leak into a summary", async () => {
    const db = new FakeDb();
    await newAccount(db, "userA");
    await newAccount(db, "userB");
    seedClosed(db, "userA", 500);
    seedClosed(db, "userB", -50_000);
    const ctxB = makeCtx(db, "userB");
    const s = await call(paper.summary, ctxB, {});
    expect(s.closedCount).toBe(1);
    expect(s.stats.totalPnlInr).toBe(-50_000);
    const list = await call(paper.listTrades, ctxB, {});
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe("userB");
  });
});

/* ==================== end to end: form → recorded trade ================== */

describe("form validation feeds the real openTrade handler", () => {
  const settings = { balanceInr: 100_000, riskPercent: 1, usdInrRate: 83.5 };

  test("BTC/USDT LONG typed with commas opens, stores and appears in history", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const form = validatePaperTrade(
      { direction: "long", entry: "115,000", stop: "114,000", target: "118,000" },
      settings,
    );
    expect(form.ok).toBe(true);

    const res = await call(paper.openTrade, ctx, {
      symbol: "BTCUSDT",
      direction: form.preview!.direction,
      entry: form.entry,
      stopLoss: form.stop,
      takeProfit: form.target ?? undefined,
    });
    expect(res.duplicate).toBe(false);
    expect(res.trade.status).toBe("OPEN");
    expect(res.trade.entry).toBe(115_000);
    expect(res.trade.stopLoss).toBe(114_000);
    expect(res.trade.takeProfit).toBe(118_000);
    expect(res.trade.size).toBeCloseTo(form.size!, 6);
    expect(res.trade.riskInr).toBe(1_000);

    // Opening never moves the virtual balance — only a close realizes P&L.
    const accAfterOpen = await call(paper.account, ctx, {});
    expect(accAfterOpen.balance).toBe(100_000);

    const list = await call(paper.listTrades, ctx, {});
    expect(list).toHaveLength(1);
    expect(list[0]._id).toBe(res.trade._id);
    const summary = await call(paper.summary, ctx, {});
    expect(summary.openCount).toBe(1);
    expect(summary.openRiskInr).toBe(1_000);

    // Closing at the target realizes the reward and updates the balance.
    await call(paper.closeTrade, ctx, {
      tradeId: res.trade._id,
      exit: 118_000,
      reason: "target",
    });
    const accAfterClose = await call(paper.account, ctx, {});
    expect(accAfterClose.balance).toBeGreaterThan(100_000);
    expect(accAfterClose.balance).toBeCloseTo(103_000, 0);
    const history = await call(paper.listTrades, ctx, {});
    expect(history[0].status).toBe("CLOSED");
    expect(history[0].closeReason).toBe("target");
  });

  test("BTC/USDT SHORT with manual size stores the manual size", async () => {
    const db = new FakeDb();
    const ctx = await newAccount(db);
    const form = validatePaperTrade(
      { direction: "short", entry: "115000", stop: "116000", target: "112000", size: "0.25" },
      settings,
    );
    expect(form.ok).toBe(true);
    expect(form.manualSize).toBe(true);

    const res = await call(paper.openTrade, ctx, {
      symbol: "BTCUSDT",
      direction: form.preview!.direction,
      entry: form.entry,
      stopLoss: form.stop,
      takeProfit: form.target ?? undefined,
      size: form.size,
    });
    expect(res.trade.size).toBe(0.25);
    expect(res.trade.direction).toBe("short");
    expect(res.trade.takeProfit).toBe(112_000);
    expect(form.riskReward).toBe(3);
  });

  test("invalid direction/stop combinations never reach the database", async () => {
    const db = new FakeDb();
    await newAccount(db);
    const longWrongSide = validatePaperTrade(
      { direction: "long", entry: "115000", stop: "116000" },
      settings,
    );
    const shortWrongSide = validatePaperTrade(
      { direction: "short", entry: "115000", stop: "114000" },
      settings,
    );
    expect(longWrongSide.ok).toBe(false);
    expect(shortWrongSide.ok).toBe(false);
    expect(db.count("paperTrades")).toBe(0);
  });
});
