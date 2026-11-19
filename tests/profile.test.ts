import { describe, expect, test } from "bun:test";
import { FakeDb, makeCtx } from "./helpers/convexFake";
import * as users from "../src/convex/users";

const call = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);

function seedUser(db: FakeDb, id: string, email: string, name?: string) {
  db.seed("users", { _id: id, email, ...(name ? { name } : {}) });
  return id;
}

describe("profile — updateProfile", () => {
  test("requires an authenticated session", async () => {
    const db = new FakeDb();
    await expect(
      call(users.updateProfile, makeCtx(db, null), { name: "Hacker" }),
    ).rejects.toThrow(/not signed in/i);
  });

  test("saves a trimmed display name for the caller only", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com", "Old Name");
    seedUser(db, "userB", "b@example.com", "Other");

    const res = await call(users.updateProfile, makeCtx(db, "userA"), {
      name: "  Abdul   Kudus  ",
    });
    expect(res.name).toBe("Abdul Kudus");

    const a = await db.get("userA");
    const b = await db.get("userB");
    expect(a?.name).toBe("Abdul Kudus");
    expect(b?.name).toBe("Other"); // untouched
  });

  test("validates name length and characters", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com");
    const ctx = makeCtx(db, "userA");

    await expect(call(users.updateProfile, ctx, { name: "A" })).rejects.toThrow(
      /at least 2/i,
    );
    await expect(
      call(users.updateProfile, ctx, { name: "x".repeat(61) }),
    ).rejects.toThrow(/60 characters/i);
    await expect(
      call(users.updateProfile, ctx, { name: "bad<script>" }),
    ).rejects.toThrow(/unsupported characters/i);
    const still = await db.get("userA");
    expect(still?.name).toBeUndefined();
  });

  test("accepts only https avatar URLs, and empty clears the avatar", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com");
    const ctx = makeCtx(db, "userA");

    await expect(
      call(users.updateProfile, ctx, { image: "javascript:alert(1)" }),
    ).rejects.toThrow(/https/i);
    await expect(
      call(users.updateProfile, ctx, { image: "http://insecure.example/x.png" }),
    ).rejects.toThrow(/https/i);

    const ok = await call(users.updateProfile, ctx, {
      image: "https://cdn.example.com/avatar.png",
    });
    expect(ok.image).toBe("https://cdn.example.com/avatar.png");

    const cleared = await call(users.updateProfile, ctx, { image: "" });
    expect(cleared.image).toBe("");
  });

  test("profile edits never touch wallet, trades or role", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com", "Old");
    db.seed("wallets", { userId: "userA", balance: 45 });
    db.seed("paperTrades", {
      userId: "userA",
      symbol: "BTCUSDT",
      direction: "long",
      entry: 60_000,
      size: 0.1,
      stopLoss: 59_000,
      status: "OPEN",
      riskInr: 1_000,
      openedAt: 1_700_000_000_000,
    });

    await call(users.updateProfile, makeCtx(db, "userA"), {
      name: "New Name",
      image: "https://cdn.example.com/a.png",
    });

    const wallet = await db.query("wallets").first();
    expect(wallet?.balance).toBe(45);
    expect(db.count("paperTrades")).toBe(1);
    const u = await db.get("userA");
    expect(u?.role).toBeUndefined();
  });

  test("an empty patch is rejected rather than writing nothing silently", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com");
    await expect(call(users.updateProfile, makeCtx(db, "userA"), {})).rejects.toThrow(
      /nothing to update/i,
    );
  });

  test("cannot target another user — no user id argument exists", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com", "A");
    seedUser(db, "userB", "b@example.com", "B");
    // A malicious payload including userId must be ignored by the validator/
    // handler: only the caller is ever patched.
    await call(users.updateProfile, makeCtx(db, "userA"), {
      name: "Renamed A",
      userId: "userB",
    });
    const a = await db.get("userA");
    const b = await db.get("userB");
    expect(a?.name).toBe("Renamed A");
    expect(b?.name).toBe("B");
  });
});

describe("profile — preferences", () => {
  test("defaults are returned before anything is saved", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com");
    const prefs = await call(users.getPreferences, makeCtx(db, "userA"));
    expect(prefs).toMatchObject({
      notifySignals: true,
      notifyDaily: false,
      notifyProduct: false,
      theme: "dark",
    });
  });

  test("saving updates only the caller's preferences and persists", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com");
    seedUser(db, "userB", "b@example.com");

    await call(users.updatePreferences, makeCtx(db, "userA"), {
      notifyDaily: true,
    });
    await call(users.updatePreferences, makeCtx(db, "userB"), {
      notifyProduct: true,
    });

    const a = await call(users.getPreferences, makeCtx(db, "userA"));
    const b = await call(users.getPreferences, makeCtx(db, "userB"));
    expect(a.notifyDaily).toBe(true);
    expect(a.notifyProduct).toBe(false);
    expect(b.notifyProduct).toBe(true);
    expect(b.notifyDaily).toBe(false);
  });

  test("partial updates keep existing values", async () => {
    const db = new FakeDb();
    seedUser(db, "userA", "a@example.com");
    const ctx = makeCtx(db, "userA");
    await call(users.updatePreferences, ctx, { notifyDaily: true });
    await call(users.updatePreferences, ctx, { notifySignals: false });
    const prefs = await call(users.getPreferences, ctx);
    expect(prefs.notifyDaily).toBe(true);
    expect(prefs.notifySignals).toBe(false);
  });

  test("anonymous callers cannot read or write preferences", async () => {
    const db = new FakeDb();
    expect(await call(users.getPreferences, makeCtx(db, null))).toBeNull();
    await expect(
      call(users.updatePreferences, makeCtx(db, null), { notifyDaily: true }),
    ).rejects.toThrow(/not signed in/i);
  });
});
