import { describe, expect, test } from "bun:test";
import {
  autoPositionSize,
  parseDecimal,
  parsePositive,
  riskBudgetInr,
  validatePaperTrade,
} from "@/lib/paper-form";

const SETTINGS = { balanceInr: 100_000, riskPercent: 1, usdInrRate: 83.5 };

describe("numeric parsing", () => {
  test("plain, spaced and thousands-separated prices all parse", () => {
    expect(parseDecimal("115000")).toBe(115_000);
    expect(parseDecimal("115,000")).toBe(115_000);
    expect(parseDecimal("115,000.50")).toBe(115_000.5);
    expect(parseDecimal("115 000.50")).toBe(115_000.5);
    expect(parseDecimal(" 2,400 ")).toBe(2_400);
    expect(parseDecimal("₹2,400")).toBe(2_400);
    expect(parseDecimal("$1,234.56")).toBe(1_234.56);
    expect(parseDecimal(".5")).toBe(0.5);
    expect(parseDecimal("-50")).toBe(-50);
  });

  test("decimal commas parse instead of collapsing", () => {
    expect(parseDecimal("0,5")).toBe(0.5);
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal("1.150,25")).toBe(1_150.25);
  });

  test("garbage and empties are rejected, never treated as zero", () => {
    for (const raw of ["", "   ", "abc", "—", "1.2.3", "12abc", null, undefined]) {
      expect(parseDecimal(raw)).toBeNull();
    }
  });

  test("parsePositive rejects zero and negatives", () => {
    expect(parsePositive("0")).toBeNull();
    expect(parsePositive("-2400")).toBeNull();
    expect(parsePositive("2400")).toBe(2_400);
    expect(parsePositive("0,0")).toBeNull();
  });
});

describe("position sizing", () => {
  test("risk budget is balance × risk %", () => {
    expect(riskBudgetInr(100_000, 1)).toBe(1_000);
    expect(riskBudgetInr(250_000, 2.5)).toBe(6_250);
    expect(riskBudgetInr(0, 1)).toBe(0);
  });

  test("auto size for BTC long and short use the same risk maths", () => {
    const expected = Number((1_000 / 83.5 / 1_000).toFixed(6));
    expect(autoPositionSize(1_000, 83.5, 115_000, 114_000)).toBe(expected);
    expect(autoPositionSize(1_000, 83.5, 115_000, 116_000)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  test("undefined maths returns null instead of NaN/Infinity", () => {
    expect(autoPositionSize(1_000, 83.5, 115_000, 115_000)).toBeNull();
    expect(autoPositionSize(1_000, 0, 115_000, 114_000)).toBeNull();
    expect(autoPositionSize(0, 83.5, 115_000, 114_000)).toBeNull();
  });
});

describe("form validation: BTC/USDT", () => {
  const btcLong = { direction: "long" as const, entry: "115000", stop: "114000" };
  const btcShort = { direction: "short" as const, entry: "115000", stop: "116000" };

  test("LONG with stop below entry is submittable with auto size", () => {
    const result = validatePaperTrade(btcLong, SETTINGS);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.entry).toBe(115_000);
    expect(result.stop).toBe(114_000);
    expect(result.manualSize).toBe(false);
    expect(result.size).toBeCloseTo(0.011976, 6);
    expect(result.riskInr).toBe(1_000);
    expect(result.preview).toEqual({ direction: "long", entry: 115_000, stop: 114_000, target: undefined });
  });

  test("SHORT with stop above entry is submittable with auto size", () => {
    const result = validatePaperTrade(btcShort, SETTINGS);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.size).toBeCloseTo(0.011976, 6);
    expect(result.preview?.direction).toBe("short");
  });

  test("wrong-side stops block both directions with an explanation", () => {
    const longBad = validatePaperTrade({ ...btcLong, stop: "116000" }, SETTINGS);
    expect(longBad.ok).toBe(false);
    expect(longBad.errors.join(" ")).toMatch(/below the entry price for a LONG/);

    const shortBad = validatePaperTrade({ ...btcShort, stop: "114000" }, SETTINGS);
    expect(shortBad.ok).toBe(false);
    expect(shortBad.errors.join(" ")).toMatch(/above the entry price for a SHORT/);
  });

  test("equal entry and stop is rejected", () => {
    const result = validatePaperTrade({ ...btcLong, stop: "115000" }, SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/cannot equal/);
  });

  test("take profit must sit on the profitable side", () => {
    const longTp = validatePaperTrade({ ...btcLong, target: "118000" }, SETTINGS);
    expect(longTp.ok).toBe(true);
    expect(longTp.riskReward).toBe(3);

    const longBadTp = validatePaperTrade({ ...btcLong, target: "114500" }, SETTINGS);
    expect(longBadTp.ok).toBe(false);
    expect(longBadTp.errors.join(" ")).toMatch(/above the entry price for a LONG/);

    const shortTp = validatePaperTrade({ ...btcShort, target: "112000" }, SETTINGS);
    expect(shortTp.ok).toBe(true);
    expect(shortTp.riskReward).toBe(3);

    const shortBadTp = validatePaperTrade({ ...btcShort, target: "116500" }, SETTINGS);
    expect(shortBadTp.ok).toBe(false);
    expect(shortBadTp.errors.join(" ")).toMatch(/below the entry price for a SHORT/);
  });

  test("target is optional", () => {
    const result = validatePaperTrade(btcLong, SETTINGS);
    expect(result.ok).toBe(true);
    expect(result.target).toBeNull();
    expect(result.riskReward).toBeNull();
  });

  test("manual size overrides auto sizing and must be positive", () => {
    const manual = validatePaperTrade({ ...btcLong, size: "0,5" }, SETTINGS);
    expect(manual.ok).toBe(true);
    expect(manual.manualSize).toBe(true);
    expect(manual.size).toBe(0.5);

    const zero = validatePaperTrade({ ...btcLong, size: "0" }, SETTINGS);
    expect(zero.ok).toBe(false);
    expect(zero.errors.join(" ")).toMatch(/positive number/);
  });

  test("comma-separated prices typed into the form stay valid", () => {
    const result = validatePaperTrade(
      { direction: "long", entry: "115,000", stop: "114,000", target: "118,000" },
      SETTINGS,
    );
    expect(result.ok).toBe(true);
    expect(result.entry).toBe(115_000);
    expect(result.stop).toBe(114_000);
    expect(result.target).toBe(118_000);
    expect(result.riskReward).toBe(3);
  });

  test("missing entry or stop explains what is missing", () => {
    const result = validatePaperTrade({ direction: "long", entry: "", stop: "" }, SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Entry price is required.");
    expect(result.errors).toContain("Stop loss is required and must be above zero.");
    expect(result.preview).toBeNull();
  });

  test("a broken risk setup surfaces a sizing error instead of a dead button", () => {
    const result = validatePaperTrade(btcLong, { ...SETTINGS, usdInrRate: 0 });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Could not size the position/);
  });

  test("preview drops a wrong-side target but keeps entry and stop", () => {
    const result = validatePaperTrade({ ...btcLong, target: "110000" }, SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.preview).toEqual({
      direction: "long",
      entry: 115_000,
      stop: 114_000,
      target: undefined,
    });
  });
});
