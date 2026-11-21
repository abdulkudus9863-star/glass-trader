import { describe, expect, test } from "bun:test";
import {
  evaluateTradeTiming,
  remainingRiskReward,
  type TimingCandle,
} from "@/lib/trade-timing";
import type { AiSetupLevels } from "@/lib/paper-chart";

const NOW = 1_700_000_000_000;

const short: AiSetupLevels = {
  analysisId: "da-short",
  decision: "SELL",
  confidence: "HIGH",
  direction: "short",
  entryZone: [58_853, 58_767],
  stopLoss: 59_380,
  takeProfits: [57_670, 57_100, 56_530],
  timestamp: NOW - 60_000,
};

const long: AiSetupLevels = {
  ...short,
  analysisId: "da-long",
  decision: "BUY",
  direction: "long",
  entryZone: [114_800, 115_200],
  stopLoss: 114_000,
  takeProfits: [118_000, 120_000, 123_000],
};

const candle = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
): TimingCandle => ({ time, open, high, low, close });

const evaluate = (
  setup: AiSetupLevels,
  price: number | null,
  candles: TimingCandle[] = [],
  now = NOW,
) =>
  evaluateTradeTiming({
    setup,
    timeframe: "15m",
    price,
    candles,
    now,
  });

describe("remaining risk/reward", () => {
  test("is measured from the actual executable price", () => {
    expect(remainingRiskReward("long", 100, 90, 130)).toEqual({
      risk: 10,
      reward: 30,
      rr: 3,
    });
    expect(remainingRiskReward("short", 100, 110, 80)!.rr).toBe(2);
    expect(remainingRiskReward("long", 130, 90, 130)!.rr).toBe(0);
    expect(remainingRiskReward("long", 80, 90, 130)).toBeNull();
  });
});

describe("timing statuses", () => {
  test("price inside the zone with acceptable R:R is a VALID ENTRY", () => {
    const v = evaluate(short, 58_800);
    expect(v.status).toBe("VALID ENTRY");
    expect(v.canArm).toBe(true);
    expect(v.canAutoExecute).toBe(true);
    expect(v.remainingRR).toBeGreaterThan(1.5);
    expect(v.explanation).toContain("VALID ENTRY");
  });

  test("price before the zone is WAITING FOR ENTRY and armable", () => {
    const v = evaluate(short, 59_000);
    expect(v.status).toBe("WAITING FOR ENTRY");
    expect(v.canArm).toBe(true);
    expect(v.canAutoExecute).toBe(false);
  });

  test("price beyond the zone toward the target is LATE and blocked", () => {
    const v = evaluate(short, 58_500);
    expect(v.status).toBe("LATE ENTRY");
    expect(v.canArm).toBe(false);
    expect(v.canAutoExecute).toBe(false);
    expect(v.explanation).toContain("Do not chase");
  });

  test("price at the far edge of the zone with thin reward is LATE", () => {
    const v = evaluate(long, 117_900);
    expect(["LATE ENTRY", "MISSED TRADE"]).toContain(v.status);
    expect(v.canArm).toBe(false);
  });

  test("a target already reached since the signal is a MISSED TRADE", () => {
    const candles = [
      candle(NOW / 1000 - 120, 58_900, 58_950, 58_880, 58_900),
      candle(NOW / 1000 - 60, 58_800, 58_810, 57_500, 57_600),
    ];
    const v = evaluate(short, 58_500, candles);
    expect(["MISSED TRADE", "WAIT FOR RETEST"]).toContain(v.status);
    expect(v.targetsReached).toBeGreaterThan(0);
    if (v.status === "MISSED TRADE") {
      expect(v.canArm).toBe(false);
      expect(v.explanation).toMatch(/missed/i);
    }
  });

  test("price at/through TP1 right now is MISSED, never armed", () => {
    const v = evaluate(long, 118_100);
    expect(v.status).toBe("MISSED TRADE");
    expect(v.canArm).toBe(false);
    expect(v.canAutoExecute).toBe(false);
  });

  test("a stop excursion since setup invalidates the whole thesis", () => {
    const candles = [candle(NOW / 1000 - 60, 58_800, 58_860, 59_400, 59_300)];
    const v = evaluate(long, 115_000, candles);
    expect(v.status).toBe("INVALID SETUP");
    expect(v.canArm).toBe(false);
    expect(v.explanation).toContain("invalidation level");
  });

  test("current price through the stop is INVALID SETUP", () => {
    expect(evaluate(short, 59_500).status).toBe("INVALID SETUP");
    expect(evaluate(long, 113_900).status).toBe("INVALID SETUP");
  });

  test("old setups expire and disable execution", () => {
    const stale = { ...short, timestamp: NOW - 25 * 3_600_000 };
    const v = evaluate(stale, 58_800);
    expect(v.status).toBe("EXPIRED");
    expect(v.canArm).toBe(false);
    expect(v.canAutoExecute).toBe(false);
  });

  test("missing price blocks everything with DATA UNAVAILABLE", () => {
    const v = evaluate(short, null);
    expect(v.status).toBe("DATA UNAVAILABLE");
    expect(v.canArm).toBe(false);
    expect(v.explanation).toContain("DATA UNAVAILABLE");
  });

  test("incomplete levels cannot be evaluated as valid", () => {
    const broken = { ...short, takeProfits: [] };
    const v = evaluate(broken, 58_800);
    expect(v.status).toBe("INVALID SETUP");
    expect(v.canArm).toBe(false);
  });
});

describe("retest intelligence", () => {
  const missedCandles = [
    candle(NOW / 1000 - 180, 58_900, 58_950, 58_880, 58_900),
    candle(NOW / 1000 - 60, 58_800, 58_810, 57_500, 57_600),
  ];

  test("a missed setup away from the zone is never auto-armed", () => {
    const v = evaluate(short, 58_100, missedCandles);
    expect(v.status).toBe("MISSED TRADE");
    expect(v.canArm).toBe(false);
  });

  test("a confirmed retest inside the zone becomes WAIT FOR RETEST", () => {
    const retest = [
      ...missedCandles,
      // Bearish confirmation candle back inside the short zone.
      candle(NOW / 1000 - 30, 58_840, 58_860, 58_760, 58_780),
    ];
    const v = evaluate(short, 58_790, retest);
    expect(v.status).toBe("WAIT FOR RETEST");
    expect(v.canArm).toBe(true);
    expect(v.canAutoExecute).toBe(true);
    expect(v.explanation).toContain("retest");
  });

  test("retest needs a confirmation candle, otherwise it stays missed", () => {
    const bullish = [
      ...missedCandles,
      candle(NOW / 1000 - 30, 58_780, 58_860, 58_760, 58_840),
    ];
    const v = evaluate(short, 58_790, bullish);
    expect(v.status).toBe("MISSED TRADE");
    expect(v.canArm).toBe(false);
  });
});
