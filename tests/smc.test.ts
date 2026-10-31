/**
 * Part D — SMC/ICT validation (BOS, CHoCH, liquidity sweep, FVG, order
 * block, premium/discount, multi-timeframe) against hand-built fixtures with
 * known geometry AND real historical Binance candles.
 *
 * No engine logic is rewritten here — fixtures are constructed so expected
 * values are known independently, plus invariant checks on real data.
 */
import { describe, expect, test } from "bun:test";
import { analyzeTimeframe, analyzeDeeepr } from "../src/lib/deeepr";
import { detectFVG, fetchKlines, sanitizeCandles, type Candle } from "../src/lib/market";
import { analyzeSmc } from "../src/lib/smc";

const HOUR = 3600;
const T0 = 1_700_000_000;

/**
 * Zigzag tape: anchors alternate direction every `legLen` candles. Turn
 * points are strict local extremes → pivot k=3 lands exactly on them.
 * OHLC is derived with tiny open gaps so highs/lows are strictly ordered.
 */
function zigzag(points: number[], legLen: number): Candle[] {
  const closes: number[] = [];
  for (let a = 0; a < points.length - 1; a++) {
    const from = points[a];
    const to = points[a + 1];
    for (let j = 0; j < legLen; j++) {
      closes.push(from + ((to - from) * j) / legLen);
    }
  }
  closes.push(points[points.length - 1]);
  return closes.map((c, i) => {
    const prev = i === 0 ? c - 0.05 : closes[i - 1];
    const o = i === 0 ? prev : prev + (c >= prev ? 0.001 : -0.001);
    return {
      time: T0 + i * HOUR,
      open: o,
      high: Math.max(o, c) + 0.1,
      low: Math.min(o, c) - 0.1,
      close: c,
      volume: 100,
    };
  });
}

function flat(n: number, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: T0 + i * HOUR,
    open: price,
    high: price + 0.05,
    low: price - 0.05,
    close: price,
    volume: 100,
  }));
}

/* ============================ market structure =========================== */

describe("structure: BOS / CHoCH on known geometry", () => {
  // 7 legs × 9 candles + 1 = 64 candles (≥ MIN_CANDLES=60).
  // Anchors: 100 →105→ 95→108→ 100→112→ 104→116
  // pivots:  H@105.1 (i=9), L@94.9 (i=18), H@108.1 (i=27),
  //          L@99.9 (i=36), H@112.1 (i=45), L@103.9 (i=54)
  const uptrend = zigzag([100, 105, 95, 108, 100, 112, 104, 116], 9);

  test("HH/HL structure with close above last swing high → BOS UP", () => {
    const a = analyzeTimeframe("1H", uptrend);
    expect(a.status).toBe("VALID");
    expect(a.candleCount).toBe(64);
    expect(a.structure).toBe("HH/HL");
    expect(a.bos).toBe("UP");
    expect(a.choch).toBeNull();
    // never both at once
    expect(a.bos === null || a.choch === null).toBe(true);
    // structural reference levels come from the pivots
    expect(a.swingLow).toBeCloseTo(103.9, 6); // highest swing low below price
    expect(a.swingHigh).toBeNull(); // no swing high above 116 on this tape
    expect(a.direction).toBe("BULLISH");
  });

  test("liquidity sweep: wick below swing low + close back above → BULLISH", () => {
    const swept = uptrend.map((c) => ({ ...c }));
    // final candle sweeps 103.9 with its wick but closes way above it
    const last = swept[swept.length - 1];
    last.low = 103.0;
    const a = analyzeTimeframe("1H", swept);
    expect(a.sweep).toBe("BULLISH");
    expect(a.liquidityStatus).toBe("SWEPT");
    expect(a.bos).toBe("UP"); // sweep did not disturb the structure read
  });

  test("HH/HL structure with close below last swing low → CHoCH DOWN", () => {
    // anchors end in a decline 104 → 99; last swing low is L@99.9 (i=36)
    const toDown = zigzag([100, 105, 95, 108, 100, 112, 104, 99], 9);
    const a = analyzeTimeframe("1H", toDown);
    expect(a.status).toBe("VALID");
    expect(a.structure).toBe("HH/HL");
    expect(a.choch).toBe("DOWN");
    expect(a.bos).toBeNull();
  });

  test("flat tape → RANGE with no BOS/CHoCH and no fabrication", () => {
    const a = analyzeTimeframe("1H", flat(80));
    expect(a.status).toBe("VALID");
    expect(a.structure).toBe("RANGE");
    expect(a.bos).toBeNull();
    expect(a.choch).toBeNull();
    expect(a.sweep).toBeNull();
    expect(a.displacement).toBeNull();
    expect(a.orderBlock).toBeNull(); // no displacement candle → no OB
    expect(a.priceLocation).toBe("EQUILIBRIUM");
  });

  test("insufficient history → INSUFFICIENT_DATA, every field null", () => {
    const a = analyzeTimeframe("1H", flat(40));
    expect(a.status).toBe("INSUFFICIENT_DATA");
    expect(a.rsi).toBeNull();
    expect(a.equilibrium).toBeNull();
    expect(a.priceLocation).toBeNull();
    expect(a.emaAlignment).toBeNull();
    expect(a.swingLow).toBeNull();
    expect(a.fvg).toBeNull();
    expect(a.orderBlock).toBeNull();
  });
});

/* ========================== premium / discount =========================== */

describe("premium / discount equilibrium", () => {
  test("close at the top of the range → PREMIUM; bottom → DISCOUNT", () => {
    const up = zigzag([100, 105, 95, 108, 100, 112, 104, 116], 9);
    const a = analyzeTimeframe("1H", up);
    const window = up.slice(-60);
    const eq = (Math.max(...window.map((c) => c.high)) + Math.min(...window.map((c) => c.low))) / 2;
    expect(a.equilibrium).toBeCloseTo(eq, 5);
    expect(a.priceLocation).toBe("PREMIUM");

    const down = zigzag([100, 105, 95, 108, 100, 112, 104, 99], 9);
    const b = analyzeTimeframe("1H", down);
    expect(b.priceLocation).toBe("DISCOUNT");
  });
});

/* ================================= FVG =================================== */

describe("fair value gaps (3-candle imbalance)", () => {
  test("bullish gap: exact top/bottom from candles 1 and 3", () => {
    const tape: Candle[] = [
      { time: T0, open: 99, high: 100, low: 98, close: 99.5, volume: 10 },
      { time: T0 + HOUR, open: 100.2, high: 101.5, low: 99.8, close: 101, volume: 10 },
      { time: T0 + 2 * HOUR, open: 103, high: 104, low: 102, close: 103.5, volume: 10 },
      { time: T0 + 3 * HOUR, open: 103.6, high: 104.2, low: 102.5, close: 104, volume: 10 },
    ];
    const zones = detectFVG(tape, 4);
    expect(zones.length).toBeGreaterThanOrEqual(1);
    const z = zones[zones.length - 1];
    expect(z.bullish).toBe(true);
    expect(z.top).toBe(102); // candle 3 low
    expect(z.bottom).toBe(100); // candle 1 high
    expect(z.startIndex).toBe(0);
    expect(z.endIndex).toBe(2);
  });

  test("bearish gap detected symmetrically", () => {
    const tape: Candle[] = [
      { time: T0, open: 101, high: 102, low: 100, close: 100.5, volume: 10 },
      { time: T0 + HOUR, open: 100, high: 100.2, low: 99, close: 99.2, volume: 10 },
      { time: T0 + 2 * HOUR, open: 98.5, high: 99, low: 97, close: 97.5, volume: 10 },
      { time: T0 + 3 * HOUR, open: 97.4, high: 98, low: 96.8, close: 97, volume: 10 },
    ];
    const zones = detectFVG(tape, 4);
    expect(zones.length).toBeGreaterThanOrEqual(1);
    expect(zones[0].bullish).toBe(false);
    expect(zones[0].top).toBe(100); // candle 1 low
    expect(zones[0].bottom).toBe(99); // candle 3 high
  });

  test("engine reports FVG metadata (direction, zone ordering, timeframe)", () => {
    const up = zigzag([100, 105, 95, 108, 100, 112, 104, 116], 9);
    const a = analyzeTimeframe("1H", up);
    expect(a.fvg).not.toBeNull();
    expect(a.fvg!.upper).toBeGreaterThan(a.fvg!.lower);
    expect(a.fvg!.midpoint).toBeCloseTo((a.fvg!.upper + a.fvg!.lower) / 2, 6);
    expect(a.fvg!.direction).toBe("BULLISH");
    expect(a.fvg!.timeframe).toBe("1H");
    expect(a.fvg!.age).toBeGreaterThanOrEqual(0);
    expect(a.fvg!.distance).toBeGreaterThanOrEqual(0);
  });
});

/* ============================== order block ============================== */

describe("order block + displacement", () => {
  test("displacement candle with opposite-coloured origin → OB zone", () => {
    const tape = zigzag([100, 105, 95, 108, 100, 112, 104, 116], 9);
    const n = tape.length;
    // origin: bearish candle (red) …
    tape[n - 2] = {
      time: T0 + (n - 2) * HOUR,
      open: 110,
      high: 110.5,
      low: 105.5,
      close: 106,
      volume: 100,
    };
    // … followed by a huge bullish displacement candle
    tape[n - 1] = {
      time: T0 + (n - 1) * HOUR,
      open: 106,
      high: 118.5,
      low: 105.8,
      close: 118,
      volume: 1000,
    };
    const a = analyzeTimeframe("1H", tape);
    expect(a.orderBlock).not.toBeNull();
    expect(a.orderBlock!.direction).toBe("BULLISH");
    expect(a.orderBlock!.high).toBeCloseTo(110.5, 6); // origin candle bounds
    expect(a.orderBlock!.low).toBeCloseTo(105.5, 6);
    expect(a.orderBlock!.fresh).toBe(true);
    expect(a.orderBlock!.timeframe).toBe("1H");
    expect(a.orderBlock!.mitigationCount).toBeGreaterThanOrEqual(1);
    expect(a.displacement).toBe("BULLISH");
  });

  test("no displacement candle → no order block, displacement null", () => {
    const a = analyzeTimeframe("1H", flat(80));
    expect(a.orderBlock).toBeNull();
    expect(a.displacement).toBeNull();
  });
});

/* ============================ real candles =============================== */

describe("invariants on real historical candles (Binance BTCUSDT 1H)", () => {
  let tape: Candle[] = [];

  test("fetch + validate", async () => {
    const res = await fetchKlines("BTCUSDT", HOUR * 1000, 300); // tfMs, not seconds
    expect(res.ok).toBe(true);
    tape = sanitizeCandles(res.candles);
    expect(tape.length).toBeGreaterThanOrEqual(100);
  });

  test("analyzeTimeframe holds every structural invariant", () => {
    const a = analyzeTimeframe("1H", tape);
    expect(a.status).toBe("VALID");
    expect(["HH/HL", "LH/LL", "RANGE", "TRANSITION"]).toContain(a.structure);
    expect(a.bos === null || a.choch === null).toBe(true); // never both
    if (a.bos !== null) expect(["UP", "DOWN"]).toContain(a.bos);
    if (a.choch !== null) expect(["UP", "DOWN"]).toContain(a.choch);
    expect(a.rsi === null || (a.rsi >= 0 && a.rsi <= 100)).toBe(true);
    expect(a.atr === null || a.atr > 0).toBe(true);
    expect(a.evidence.bull).toBeGreaterThanOrEqual(0);
    expect(a.evidence.bear).toBeGreaterThanOrEqual(0);

    const last = tape[tape.length - 1].close;
    if (a.swingLow !== null) expect(a.swingLow).toBeLessThan(last);
    if (a.swingHigh !== null) expect(a.swingHigh).toBeGreaterThan(last);

    const window = tape.slice(-60);
    const lo = Math.min(...window.map((c) => c.low));
    const hi = Math.max(...window.map((c) => c.high));
    expect(a.equilibrium).not.toBeNull();
    expect(a.equilibrium!).toBeGreaterThanOrEqual(lo);
    expect(a.equilibrium!).toBeLessThanOrEqual(hi);
    if (a.priceLocation !== null) {
      expect(["PREMIUM", "DISCOUNT", "EQUILIBRIUM"]).toContain(a.priceLocation);
    }

    if (a.fvg !== null) {
      expect(a.fvg.upper).toBeGreaterThan(a.fvg.lower);
      expect(["BULLISH", "BEARISH"]).toContain(a.fvg.direction);
    }
    if (a.orderBlock !== null) {
      expect(a.orderBlock.high).toBeGreaterThanOrEqual(a.orderBlock.low);
      expect(["BULLISH", "BEARISH"]).toContain(a.orderBlock.direction);
    }
    if (a.sweep !== null) {
      // a sweep implies a real pivot was violated by a wick + close-back
      expect(["BULLISH", "BEARISH"]).toContain(a.sweep);
      expect(a.liquidityStatus).toBe("SWEPT");
    }

    // raw FVG detector agrees on zone ordering for the whole tape
    for (const z of detectFVG(tape, 10)) {
      expect(z.top).toBeGreaterThan(z.bottom);
      expect(z.endIndex).toBeGreaterThan(z.startIndex);
    }
  });

  test("short history is refused, not guessed", () => {
    const a = analyzeTimeframe("1H", tape.slice(0, 30));
    expect(a.status).toBe("INSUFFICIENT_DATA");
  });

  test("analyzeSmc returns null on insufficient data and sane levels otherwise", () => {
    expect(
      analyzeSmc({
        symbolId: "BTCUSD",
        intervalId: "1H",
        candles: tape.slice(0, 10),
        price: 60_000,
        change24h: 0,
        decimals: 2,
        assetName: "Bitcoin",
      }),
    ).toBeNull();

    const price = tape[tape.length - 1].close;
    const s = analyzeSmc({
      symbolId: "BTCUSD",
      intervalId: "1H",
      candles: tape,
      price,
      change24h: 1.5,
      decimals: 2,
      assetName: "Bitcoin",
    });
    expect(s).not.toBeNull();
    expect(["LONG", "SHORT", "WAIT"]).toContain(s!.verdict);
    expect(s!.rsi).toBeGreaterThanOrEqual(0);
    expect(s!.rsi).toBeLessThanOrEqual(100);
    expect(s!.watchZone.top).toBeGreaterThan(s!.watchZone.bottom);
    expect(s!.signal.entryZone[0]).toBeLessThanOrEqual(s!.signal.entryZone[1]);
    // resistance levels sit above price, support below
    for (const l of s!.overlay.swingLevels) {
      if (l.kind === "R") expect(l.price).toBeGreaterThan(price);
      if (l.kind === "S") expect(l.price).toBeLessThan(price);
    }
    expect(s!.signal.rrr).toBeGreaterThan(0);
  });
});

/* ========================== multi-timeframe ============================== */

describe("multi-timeframe consensus (analyzeDeeepr)", () => {
  let t1H: Candle[] = [];
  let t15m: Candle[] = [];
  let t5m: Candle[] = [];

  test("fetch 1H + 15m + 5m history", async () => {
    const [h, m15, m5] = await Promise.all([
      fetchKlines("BTCUSDT", HOUR * 1000, 300),
      fetchKlines("BTCUSDT", 15 * 60_000, 300),
      fetchKlines("BTCUSDT", 5 * 60_000, 300),
    ]);
    expect(h.ok).toBe(true);
    expect(m15.ok).toBe(true);
    expect(m5.ok).toBe(true);
    t1H = sanitizeCandles(h.candles);
    t15m = sanitizeCandles(m15.candles);
    t5m = sanitizeCandles(m5.candles);
    expect(t1H.length).toBeGreaterThanOrEqual(60);
    expect(t15m.length).toBeGreaterThanOrEqual(60);
    expect(t5m.length).toBeGreaterThanOrEqual(60);
  });

  test("healthy inputs → MTF record populated, primary validated", () => {
    const price = t1H[t1H.length - 1].close;
    const out = analyzeDeeepr({
      symbolId: "BTCUSD",
      timeframe: "1H",
      decimals: 2,
      candlesByTf: { "15m": t15m, "5m": t5m },
      primaryCandles: t1H,
      price,
      change24h: 1.2,
      dataStatus: "LIVE",
      ageSeconds: 5,
      gap: false,
      missingCandles: 0,
      candleCount: t1H.length,
    });
    expect(out.engine).toBe("DEEEPR_TRADE_AI");
    expect(out.data_status).toBe("LIVE");
    expect(out.primary).not.toBeNull();
    expect(out.primary!.status).toBe("VALID");
    expect(out.primary!.timeframe).toBe("1H");

    // canonical MTF keys (app "15m"/"5m" → engine "15M"/"5M")
    expect(Object.keys(out.mtf)).toEqual(expect.arrayContaining(["1H", "15M", "5M"]));
    for (const [tf, v] of Object.entries(out.mtf)) {
      expect(["BULLISH", "BEARISH", "NEUTRAL", "N/A"]).toContain(v);
      void tf;
    }
    expect(["LONG", "SHORT", "NEUTRAL"]).toContain(out.direction);
    expect([
      "STRONG BUY",
      "BUY",
      "WAIT FOR BUY",
      "STRONG SELL",
      "SELL",
      "WAIT FOR SELL",
      "NO TRADE",
      "INVALIDATED",
      "INSUFFICIENT DATA",
    ]).toContain(out.decision);
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    expect(out.risk.minimum_rr).toBe(2);
  });

  test("STALE data → engine refuses to opine", () => {
    const out = analyzeDeeepr({
      symbolId: "BTCUSD",
      timeframe: "1H",
      decimals: 2,
      candlesByTf: {},
      primaryCandles: t1H,
      price: t1H[t1H.length - 1].close,
      change24h: null,
      dataStatus: "STALE",
      ageSeconds: 900,
      gap: false,
      missingCandles: 0,
      candleCount: t1H.length,
    });
    expect(out.decision).toBe("INSUFFICIENT DATA");
    expect(out.hard_gates.length).toBeGreaterThan(0);
    expect(out.reasons.length).toBeGreaterThan(0);
  });

  test("gapped tape → engine refuses to opine", () => {
    const out = analyzeDeeepr({
      symbolId: "BTCUSD",
      timeframe: "1H",
      decimals: 2,
      candlesByTf: {},
      primaryCandles: t1H,
      price: t1H[t1H.length - 1].close,
      change24h: null,
      dataStatus: "LIVE",
      ageSeconds: 5,
      gap: true,
      missingCandles: 7,
      candleCount: t1H.length,
    });
    expect(out.decision).toBe("INSUFFICIENT DATA");
    expect(out.hard_gates.join(" ")).toContain("DATA GAP");
  });

  test("insufficient history → explicit insufficient data", () => {
    const out = analyzeDeeepr({
      symbolId: "BTCUSD",
      timeframe: "1H",
      decimals: 2,
      candlesByTf: {},
      primaryCandles: t1H.slice(0, 40),
      price: t1H[40].close,
      change24h: null,
      dataStatus: "LIVE",
      ageSeconds: 5,
      gap: false,
      missingCandles: 0,
      candleCount: 40,
    });
    expect(out.decision).toBe("INSUFFICIENT DATA");
    expect(out.hard_gates.join(" ")).toContain("Insufficient history");
  });
});
