/**
 * Part B — market feed validation.
 *
 * Unit tests cover symbol/interval support, candle validation (timestamps,
 * duplicates, invalid rows) and gap detection. The "live provider" tests hit
 * the real Binance API — if the environment blocks the network these fail
 * honestly rather than being skipped.
 */
import { describe, expect, test } from "bun:test";
import {
  SYMBOLS,
  detectGaps,
  fetchKlines,
  fetchTicker24h,
  findSymbol,
  getTimeframe,
  normalizeSymbol,
  resolveBinanceInterval,
  resolveProviderSymbol,
  sanitizeCandles,
  type Candle,
  TIMEFRAMES,
} from "../src/lib/market";

const HOUR = 3600; // seconds
const HOUR_MS = 3_600_000; // milliseconds (detectGaps takes tfMs)

function candles(times: number[], base = 100): Candle[] {
  return times.map((t, i) => ({
    time: t,
    open: base + i * 0.1,
    high: base + i * 0.1 + 0.5,
    low: base + i * 0.1 - 0.5,
    close: base + i * 0.1 + 0.2,
    volume: 10,
  }));
}

/* ===================== symbols & provider mapping ======================== */

describe("supported symbols & provider mapping (BTCUSD, XAUUSD, XAGUSD)", () => {
  test("all three symbols resolve in the catalog", () => {
    for (const id of ["BTCUSD", "XAUUSD", "XAGUSD"]) {
      const sym = findSymbol(id);
      expect(sym?.id).toBe(id);
      expect(sym && sym.decimals > 0).toBe(true);
    }
    // unknown ids fall back to the first catalog entry (documented behavior)
    expect(findSymbol("NOPE")!.id).toBe("BTCUSDT");
  });

  test("provider symbols are exact", () => {
    expect(resolveProviderSymbol(findSymbol("BTCUSD")!, "binance")).toBe("BTCUSDT");
    expect(resolveProviderSymbol(findSymbol("XAUUSD")!, "twelvedata")).toBe("XAU/USD");
    expect(resolveProviderSymbol(findSymbol("XAGUSD")!, "twelvedata")).toBe("XAG/USD");
  });

  test("every app timeframe maps to an exact Binance interval", () => {
    const expected: Record<string, string> = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1H": "1h",
      "4H": "4h",
      "12H": "12h",
      "1D": "1d",
      "1W": "1w",
    };
    for (const tf of TIMEFRAMES) {
      expect(resolveBinanceInterval(tf.ms)).toBe(expected[tf.id]);
    }
    expect(resolveBinanceInterval(7 * 60_000)).toBeNull(); // unsupported → no guess
  });

  test("symbol normalization is canonical", () => {
    expect(normalizeSymbol("xau-usd")).toBe("XAUUSD");
    expect(normalizeSymbol(" btc/usdt ")).toBe("BTCUSDT");
  });

  test("timeframe lookup falls back deterministically for unknown ids", () => {
    expect(getTimeframe("1H").ms).toBe(3_600_000);
    // getTimeframe is typed; unknown runtime values land on the documented default
    expect(getTimeframe("bogus" as never).ms).toBe(1_800_000); // 30m
  });
});

/* ========================= candle validation ============================= */

describe("candle validation (timestamps, duplicates, invalid rows)", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  test("duplicate timestamps collapse to one candle (sorted ascending)", () => {
    const input = [
      ...candles([1000, 2000, 3000]),
      // same timestamp, newer valid OHLC (high/low widened for the new close)
      { ...candles([2000])[0], close: 123.45, high: 124, low: 99.5, volume: 99 },
    ];
    const out = sanitizeCandles(input);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.time)).toEqual([1000, 2000, 3000]);
    expect(out[1].close).toBe(123.45); // newest valid version wins
    expect(out[1].volume).toBe(99);
  });

  test("out-of-order input is sorted ascending", () => {
    const out = sanitizeCandles(candles([3000, 1000, 2000]));
    expect(out.map((c) => c.time)).toEqual([1000, 2000, 3000]);
  });

  test("NaN/missing fields are rejected, never zero-filled", () => {
    const good = candles([1000])[0];
    const out = sanitizeCandles([
      good,
      { ...good, time: 2000, close: Number.NaN },
      { ...good, time: 3000, open: Number.NaN },
      { ...good, time: 4000, volume: Number.NaN },
      { ...good, time: 5000, volume: undefined as unknown as number },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(1000);
  });

  test("inverted OHLC and impossible rows are rejected", () => {
    const good = candles([1000])[0];
    const out = sanitizeCandles([
      good,
      { ...good, time: 2000, high: 90, low: 110 }, // high < low
      { ...good, time: 3000, high: 100.1, open: 105, close: 104 }, // high < open
      { ...good, time: 4000, low: 100.1, open: 95, close: 96 }, // low > open
    ]);
    expect(out).toHaveLength(1);
  });

  test("future and non-positive timestamps are rejected", () => {
    const good = candles([1000])[0];
    const out = sanitizeCandles([
      good,
      { ...good, time: nowSec + 7200 }, // > now + 1h
      { ...good, time: 0 },
      { ...good, time: -5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(1000);
  });
});

/* ============================ gap detection ============================== */

describe("missing candles / gap detection", () => {
  test("contiguous 1H tape has no gaps", () => {
    const tape = candles([0, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR]);
    const g = detectGaps(tape, HOUR_MS);
    expect(g.gap).toBe(false);
    expect(g.missing).toBe(0);
  });

  test("one dropped bucket is reported as exactly one missing candle", () => {
    const tape = candles([0, HOUR, 3 * HOUR, 4 * HOUR]); // 2*HOUR missing
    const g = detectGaps(tape, HOUR_MS);
    expect(g.gap).toBe(true);
    expect(g.missing).toBe(1);
  });

  test("multiple consecutive drops counted", () => {
    const tape = candles([0, 5 * HOUR, 6 * HOUR]); // hours 1-4 missing
    const g = detectGaps(tape, HOUR_MS);
    expect(g.gap).toBe(true);
    expect(g.missing).toBe(4);
  });

  test("short tapes never report false gaps", () => {
    expect(detectGaps([], HOUR_MS)).toEqual({ gap: false, missing: 0 });
    expect(detectGaps(candles([0]), HOUR_MS)).toEqual({ gap: false, missing: 0 });
    // first candle may start mid-period
    expect(detectGaps(candles([HOUR, 2 * HOUR]), HOUR_MS).gap).toBe(false);
  });
});

/* ======================= live provider: Binance ========================== */

describe("live Binance feed (BTCUSD → BTCUSDT)", () => {
  test("1H klines: real, validated, deduped, gap-free history", async () => {
    const res = await fetchKlines("BTCUSDT", 3_600_000, 300);
    expect(res.ok).toBe(true);
    expect(res.providerSymbol).toBe("BTCUSDT");
    expect(res.candles.length).toBeGreaterThanOrEqual(100);

    const tape = res.candles;
    // timestamps strictly ascending & unique
    for (let i = 1; i < tape.length; i++) {
      expect(tape[i].time).toBeGreaterThan(tape[i - 1].time);
    }
    // open times align to the hour bucket
    for (const c of tape) expect(c.time % HOUR).toBe(0);
    // OHLC sanity on every candle
    for (const c of tape) {
      expect(Number.isFinite(c.open)).toBe(true);
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.volume).toBeGreaterThanOrEqual(0);
    }
    // not stale: newest candle open within now-2h .. now+1h
    const last = tape[tape.length - 1].time;
    const now = Math.floor(Date.now() / 1000);
    expect(last).toBeLessThanOrEqual(now + 3600);
    expect(last).toBeGreaterThanOrEqual(now - 2 * HOUR);
    // no missing buckets in the returned window
    const g = detectGaps(tape, HOUR_MS);
    expect(g.gap).toBe(false);
    // sanitized output is a fixed point — nothing invalid reached us
    expect(sanitizeCandles(tape)).toHaveLength(tape.length);
  });

  test("1m klines: freshness within provider cadence", async () => {
    const res = await fetchKlines("BTCUSDT", 60_000, 120);
    expect(res.ok).toBe(true);
    const last = res.candles[res.candles.length - 1].time;
    const now = Math.floor(Date.now() / 1000);
    expect(now - last).toBeLessThanOrEqual(150);
    expect(detectGaps(res.candles, 60_000).gap).toBe(false);
  });

  test("unsupported interval returns a structured error (no fake candles)", async () => {
    const res = await fetchKlines("BTCUSDT", 7 * 60_000, 10);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("TIMEFRAME_NOT_SUPPORTED");
    expect(res.candles).toHaveLength(0);
  });

  test("unknown symbol returns an error, never synthetic candles", async () => {
    const res = await fetchKlines("NOTAREALPAIR", 3_600_000, 10);
    expect(res.ok).toBe(false);
    expect(res.candles).toHaveLength(0);
    expect(res.error).toBeDefined();
  });

  test("24h ticker resolves through the base chain (watchlist prices)", async () => {
    const map = await fetchTicker24h(["BTCUSDT"]);
    expect(map).not.toBeNull();
    const t = map!.get("BTCUSDT");
    expect(t).toBeDefined();
    expect(Number.isFinite(t!.price)).toBe(true);
    expect(t!.price).toBeGreaterThan(0);
    expect(Number.isFinite(t!.change24h)).toBe(true);
  });
});
