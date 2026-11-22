/**
 * Paper-trading exit engine — LONG/SHORT stop-loss & take-profit execution.
 *
 * These tests exercise the pure evaluator used by `PaperExitMonitor` for every
 * open position (manual and AI alike): live-mark crossings, intrabar candle
 * high/low crossings, gaps, entry-bar exclusion and duplicate-safe behaviour.
 */
import { describe, expect, test } from "bun:test";
import type { Candle } from "../src/lib/market";
import {
  closeReasonLabel,
  evaluatePaperExit,
  type PaperExitInput,
} from "../src/lib/paper-engine";

const OPEN_AT = 1_700_000_000_000; // epoch ms
const T0 = Math.floor(OPEN_AT / 1000); // first candle that starts at/after entry

const candle = (
  offset: number,
  o: number,
  h: number,
  l: number,
  c: number,
): Candle => ({ time: T0 + offset * 300, open: o, high: h, low: l, close: c, volume: 1 });

const shortTrade = (overrides: Partial<PaperExitInput> = {}): PaperExitInput => ({
  direction: "short",
  stopLoss: 61_000,
  takeProfit: 57_000,
  openedAt: OPEN_AT,
  mark: 60_000,
  candles: [],
  ...overrides,
});

const longTrade = (overrides: Partial<PaperExitInput> = {}): PaperExitInput => ({
  direction: "long",
  stopLoss: 2_400,
  takeProfit: 2_450,
  openedAt: OPEN_AT,
  mark: 2_420,
  candles: [],
  ...overrides,
});

describe("mark-price triggers (both directions, equality included)", () => {
  test("SHORT stop triggers at/above the stop and fills at the available mark", () => {
    expect(evaluatePaperExit(shortTrade({ mark: 60_999 }))).toBeNull();
    expect(evaluatePaperExit(shortTrade({ mark: 61_000 }))).toEqual({
      reason: "stop",
      price: 61_000,
      via: "mark",
      candleTime: null,
    });
    // Screenshot case: BTCUSD SHORT has crossed the stop — must close.
    expect(evaluatePaperExit(shortTrade({ mark: 61_850 }))?.reason).toBe("stop");
  });

  test("LONG stop triggers at/below the stop", () => {
    expect(evaluatePaperExit(longTrade({ mark: 2_401 }))).toBeNull();
    expect(evaluatePaperExit(longTrade({ mark: 2_400 }))?.reason).toBe("stop");
    expect(evaluatePaperExit(longTrade({ mark: 2_350 }))?.price).toBe(2_350);
  });

  test("SHORT take-profit triggers at/below the target", () => {
    expect(evaluatePaperExit(shortTrade({ mark: 57_001 }))).toBeNull();
    expect(evaluatePaperExit(shortTrade({ mark: 57_000 }))).toEqual({
      reason: "target",
      price: 57_000,
      via: "mark",
      candleTime: null,
    });
    // Filled beyond the target → actual available price, not the level.
    expect(evaluatePaperExit(shortTrade({ mark: 56_400 }))?.price).toBe(56_400);
  });

  test("LONG take-profit triggers at/above the target", () => {
    expect(evaluatePaperExit(longTrade({ mark: 2_449 }))).toBeNull();
    expect(evaluatePaperExit(longTrade({ mark: 2_450 }))?.reason).toBe("target");
  });

  test("no quote and no candles → no fabricated exit", () => {
    expect(evaluatePaperExit(shortTrade({ mark: null }))).toBeNull();
    expect(evaluatePaperExit(longTrade({ mark: null, candles: [] }))).toBeNull();
  });

  test("missing/invalid levels never trigger", () => {
    expect(evaluatePaperExit(shortTrade({ stopLoss: Number.NaN }))).toBeNull();
    expect(evaluatePaperExit(shortTrade({ stopLoss: 0 }))).toBeNull();
    // Target on the wrong side cannot describe a short position.
    expect(
      evaluatePaperExit(shortTrade({ takeProfit: 62_000, mark: 62_500 })),
    ).toBeNull();
  });
});

describe("intrabar candle high/low detection", () => {
  test("SHORT stop is detected from the candle HIGH while the mark is back inside", () => {
    const res = evaluatePaperExit(
      shortTrade({
        mark: 60_000, // recovered — closing price alone would miss it
        candles: [candle(0, 60_200, 61_120, 59_900, 60_000)],
      }),
    );
    expect(res).toEqual({
      reason: "stop",
      price: 61_000,
      via: "candle",
      candleTime: T0 * 1000,
    });
  });

  test("LONG stop is detected from the candle LOW while the mark is back inside", () => {
    const res = evaluatePaperExit(
      longTrade({
        mark: 2_420,
        candles: [candle(0, 2_418, 2_430, 2_392, 2_420)],
      }),
    );
    expect(res?.reason).toBe("stop");
    expect(res?.price).toBe(2_400);
  });

  test("SHORT TP is detected from the candle LOW without waiting for a close", () => {
    const res = evaluatePaperExit(
      shortTrade({
        mark: 60_000,
        candles: [candle(0, 60_100, 60_200, 56_900, 60_000)],
      }),
    );
    expect(res?.reason).toBe("target");
    expect(res?.price).toBe(57_000);
  });

  test("LONG TP is detected from the candle HIGH", () => {
    const res = evaluatePaperExit(
      longTrade({
        mark: 2_420,
        candles: [candle(0, 2_425, 2_465, 2_415, 2_420)],
      }),
    );
    expect(res?.reason).toBe("target");
    expect(res?.price).toBe(2_450);
  });

  test("earliest candle hit wins (target before a later stop)", () => {
    const res = evaluatePaperExit(
      shortTrade({
        mark: 60_000,
        candles: [
          candle(0, 60_500, 60_600, 56_800, 60_000), // TP first
          candle(1, 60_000, 61_500, 59_800, 61_200), // stop later
        ],
      }),
    );
    expect(res?.reason).toBe("target");
    expect(res?.candleTime).toBe(T0 * 1000);
  });

  test("one candle spanning both levels resolves to the stop (conservative)", () => {
    const res = evaluatePaperExit(
      shortTrade({
        mark: 60_000,
        candles: [candle(0, 59_000, 61_400, 56_500, 60_000)],
      }),
    );
    expect(res?.reason).toBe("stop");
  });

  test("the bar already forming at entry is excluded (pre-entry wick)", () => {
    const preEntry: Candle = {
      time: T0 - 300,
      open: 60_100,
      high: 61_500,
      low: 56_000,
      close: 60_000,
      volume: 1,
    };
    expect(
      evaluatePaperExit(shortTrade({ mark: 60_000, candles: [preEntry] })),
    ).toBeNull();
  });
});

describe("price gaps", () => {
  test("SHORT stop gapped above the level fills at the candle OPEN", () => {
    const res = evaluatePaperExit(
      shortTrade({
        mark: 61_600,
        candles: [candle(0, 61_600, 61_800, 61_500, 61_700)],
      }),
    );
    expect(res).toEqual({
      reason: "stop",
      price: 61_600,
      via: "candle",
      candleTime: T0 * 1000,
    });
  });

  test("LONG stop gapped below the level fills at the candle OPEN", () => {
    const res = evaluatePaperExit(
      longTrade({
        mark: 2_310,
        candles: [candle(0, 2_320, 2_330, 2_300, 2_310)],
      }),
    );
    expect(res?.reason).toBe("stop");
    expect(res?.price).toBe(2_320);
  });

  test("favorable gap through a target fills at the better available price", () => {
    const short = evaluatePaperExit(
      shortTrade({
        mark: 56_000,
        candles: [candle(0, 56_000, 56_200, 55_800, 56_100)],
      }),
    );
    expect(short?.reason).toBe("target");
    expect(short?.price).toBe(56_000);

    const long = evaluatePaperExit(
      longTrade({
        mark: 2_500,
        candles: [candle(0, 2_500, 2_510, 2_495, 2_505)],
      }),
    );
    expect(long?.reason).toBe("target");
    expect(long?.price).toBe(2_500);
  });

  test("a mark that jumps straight through the stop uses the actual mark", () => {
    expect(evaluatePaperExit(shortTrade({ mark: 62_400 }))?.price).toBe(62_400);
    expect(evaluatePaperExit(longTrade({ mark: 2_250 }))?.price).toBe(2_250);
  });
});

describe("duplicate-safety & labels", () => {
  test("evaluation is pure — identical calls return identical triggers", () => {
    const input = shortTrade({ mark: 61_200 });
    expect(evaluatePaperExit(input)).toEqual(evaluatePaperExit(input));
  });

  test("a closed/opening position with no crossing stays open", () => {
    expect(
      evaluatePaperExit(
        shortTrade({
          mark: 59_000,
          candles: [
            candle(0, 60_000, 60_400, 58_900, 59_000),
            candle(1, 59_000, 59_300, 58_800, 59_100),
          ],
        }),
      ),
    ).toBeNull();
  });

  test("close reasons render as audit labels", () => {
    expect(closeReasonLabel("stop")).toBe("STOP LOSS");
    expect(closeReasonLabel("target")).toBe("TAKE PROFIT");
    expect(closeReasonLabel("manual")).toBe("MANUAL");
    expect(closeReasonLabel(undefined)).toBe("—");
  });
});
