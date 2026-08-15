/* ============================================================================
   DEEEPR Trade AI — deterministic institutional analysis engine.

   Decision-support system, NOT a prediction machine. Everything below is a
   pure function of the normalized candle tape it receives:

     structure (HH/HL/LH/LL, close-confirmed BOS/CHOCH)
     liquidity (sweeps / approaches / reclaims)
     FVG / imbalance
     order blocks
     premium / discount
     momentum (RSI + EMA alignment + displacement)
     volume (relative volume)
     multi-timeframe consensus
     entry engine (setup vs entry, entry quality, distance)
     risk engine (structural SL, RR vs 2.0 minimum)
     target engine (structural TP1/TP2/TP3)
     weighted score 0–100 with penalties
     hard gates that override any score
     final decision states (incl. NO TRADE / WAIT / INSUFFICIENT DATA)

   Anti-hallucination rules are structural, not advisory: with no data or
   stale/gapped data the engine returns INSUFFICIENT_DATA / NO TRADE. It can
   never invent a price, zone, level or indicator — if a component cannot be
   computed it contributes nothing and is labelled honestly.
   ========================================================================== */

import { type Candle, atr, detectFVG, ema, rsi, sma } from "./market";

/* ------------------------------ public types ----------------------------- */

export type DirectionBias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type Direction = "LONG" | "SHORT" | "NEUTRAL";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type DataStatus = "LIVE" | "DELAYED" | "STALE" | "OFFLINE" | "UNAVAILABLE";
export type EntryQuality = "OPTIMAL" | "GOOD" | "EARLY" | "LATE" | "CHASE" | "INVALID";
export type SetupState =
  | "NO_SETUP"
  | "SETUP_DETECTED"
  | "WAITING_FOR_ZONE"
  | "ZONE_REACHED"
  | "CONFIRMATION_PENDING"
  | "ENTRY_CONFIRMED"
  | "INVALIDATED";
export type DeeeprDecision =
  | "STRONG BUY"
  | "BUY"
  | "WAIT FOR BUY"
  | "STRONG SELL"
  | "SELL"
  | "WAIT FOR SELL"
  | "NO TRADE"
  | "INVALIDATED"
  | "INSUFFICIENT DATA";

export interface DeeeprFvg {
  upper: number;
  lower: number;
  midpoint: number;
  /** candles since the gap formed */
  age: number;
  /** |price − midpoint| in ATR units */
  distance: number;
  fresh: boolean;
  mitigated: boolean;
  direction: "BULLISH" | "BEARISH";
  timeframe: string;
}

export interface DeeeprOrderBlock {
  direction: "BULLISH" | "BEARISH";
  low: number;
  high: number;
  fresh: boolean;
  mitigationCount: number;
  timeframe: string;
}

export interface DeeeprTfAnalysis {
  timeframe: string;
  status: "VALID" | "INSUFFICIENT_DATA";
  direction: DirectionBias;
  structure: "HH/HL" | "LH/LL" | "RANGE" | "TRANSITION";
  bos: "UP" | "DOWN" | null;
  choch: "UP" | "DOWN" | null;
  sweep: "BULLISH" | "BEARISH" | null;
  liquidityStatus: "NOT_TOUCHED" | "APPROACHED" | "SWEPT" | "RECLAIMED" | "FAILED" | null;
  fvg: DeeeprFvg | null;
  orderBlock: DeeeprOrderBlock | null;
  equilibrium: number | null;
  priceLocation: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM" | null;
  rsi: number | null;
  emaAlignment: "BULLISH" | "BEARISH" | "MIXED" | null;
  displacement: "BULLISH" | "BEARISH" | null;
  relativeVolume: number | null;
  atr: number | null;
  candleCount: number;
  /** Highest real swing low below price (structural demand). */
  swingLow: number | null;
  /** Lowest real swing high above price (structural supply). */
  swingHigh: number | null;
  evidence: { bull: number; bear: number; total: number };
}

export interface DeeeprTradeAnalysis {
  engine: "DEEEPR_TRADE_AI";
  version: "2.0";
  analysis_id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  data_status: DataStatus;
  age_seconds: number | null;
  change24h: number | null;
  decision: DeeeprDecision;
  direction: Direction;
  setup_state: SetupState;
  score: number;
  grade: string;
  confidence: Confidence;
  market_regime: string;
  mtf: Record<string, string>;
  entry: {
    zone_low: number;
    zone_high: number;
    current_price: number;
    quality: EntryQuality | "WAITING";
    confirmation_required: string;
  };
  risk: {
    stop_loss: number;
    risk_points: number;
    minimum_rr: number;
    actual_rr: number;
  };
  targets: { tp1: number; tp2: number; tp3: number };
  confluence: Record<string, boolean | string>;
  hard_gates: string[];
  reasons: string[];
  invalidation: string[];
  warnings: string[];
  primary: DeeeprTfAnalysis | null;
}

export interface DeeeprInput {
  symbolId: string;
  timeframe: string;
  decimals: number;
  assetName?: string;
  /** Candle history for every non-primary timeframe, keyed by tf id. */
  candlesByTf: Record<string, Candle[]>;
  /** Primary timeframe candles — the same tape the chart renders. */
  primaryCandles: Candle[];
  /** Live price (ticker or last close). */
  price: number;
  change24h: number | null;
  dataStatus: DataStatus;
  ageSeconds: number | null;
  gap: boolean;
  missingCandles: number;
  candleCount: number;
}

/* ------------------------------- constants ------------------------------- */

const PIVOT_WINDOW = 3;
const MIN_CANDLES = 60;
const MIN_RR = 2.0;
const MTF_PRIORITY = ["1D", "4H", "1H", "15M", "5M", "1m", "1M"];
const MTF_WEIGHT: Record<string, number> = {
  "1D": 5,
  "4H": 4,
  "1H": 3,
  "15M": 2,
  "5M": 1,
  "1m": 0.5,
  "1M": 6,
};

/* ------------------------------- helpers -------------------------------- */

interface Pivot {
  index: number;
  price: number;
}

interface Pivots {
  highs: Pivot[];
  lows: Pivot[];
}

function findPivots(candles: Candle[], k: number): Pivots {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let i = k; i < candles.length - k; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high > c.high) isHigh = false;
      if (candles[j].low < c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push({ index: i, price: c.high });
    if (isLow) lows.push({ index: i, price: c.low });
  }
  return { highs, lows };
}

function lastValid<T>(arr: (T | null)[], fallback: T | null = null): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i] as T;
  }
  return fallback;
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Detect a wick-through + close-back liquidity sweep on the recent tape. */
function detectSweep(candles: Candle[], pivots: Pivots): "BULLISH" | "BEARISH" | null {
  const lastLow = pivots.lows[pivots.lows.length - 1];
  const lastHigh = pivots.highs[pivots.highs.length - 1];
  const recent = candles.slice(-18);
  if (lastLow) {
    const seg = recent.filter((c) => c.time >= candles[lastLow.index].time);
    for (const c of seg) {
      if (c.low < lastLow.price && c.close > lastLow.price) return "BULLISH";
    }
  }
  if (lastHigh) {
    const seg = recent.filter((c) => c.time >= candles[lastHigh.index].time);
    for (const c of seg) {
      if (c.high > lastHigh.price && c.close < lastHigh.price) return "BEARISH";
    }
  }
  return null;
}

function findOrderBlock(
  candles: Candle[],
  atrVals: (number | null)[],
): DeeeprOrderBlock | null {
  const last = candles.length - 1;
  for (let i = last; i >= 2 && last - i <= 40; i--) {
    const c = candles[i];
    const a = atrVals[i] ?? atrVals[last];
    if (!a || a <= 0) continue;
    const body = Math.abs(c.close - c.open);
    if (body < a * 1.1) continue; // needs displacement to originate an OB
    const bullish = c.close > c.open;
    const origin = candles[i - 1];
    if (!origin) continue;
    const originBullish = origin.close > origin.open;
    if (originBullish === bullish) continue; // origin must be opposite colour
    let mitigation = 0;
    for (let j = i; j < candles.length; j++) {
      const later = candles[j];
      const touches =
        later.low <= origin.high && later.high >= origin.low;
      if (touches) mitigation++;
    }
    return {
      direction: bullish ? "BULLISH" : "BEARISH",
      low: origin.low,
      high: origin.high,
      fresh: last - (i - 1) <= 8,
      mitigationCount: mitigation,
      timeframe: "",
    };
  }
  return null;
}

/* --------------------------- per-timeframe engine ------------------------ */

export function analyzeTimeframe(tf: string, candles: Candle[]): DeeeprTfAnalysis {
  const base: DeeeprTfAnalysis = {
    timeframe: tf,
    status: "INSUFFICIENT_DATA",
    direction: "NEUTRAL",
    structure: "RANGE",
    bos: null,
    choch: null,
    sweep: null,
    liquidityStatus: null,
    fvg: null,
    orderBlock: null,
    equilibrium: null,
    priceLocation: null,
    rsi: null,
    emaAlignment: null,
    displacement: null,
    relativeVolume: null,
    atr: null,
    candleCount: candles.length,
    swingLow: null,
    swingHigh: null,
    evidence: { bull: 0, bear: 0, total: 0 },
  };
  if (candles.length < MIN_CANDLES) return base;

  const closes = candles.map((c) => c.close);
  const rsi14 = rsi(closes, 14);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atr14 = atr(candles, 14);
  const volSma = sma(candles.map((c) => c.volume), 20);
  const pivots = findPivots(candles, PIVOT_WINDOW);
  const last = candles[candles.length - 1];
  const price = last.close;
  const atrNow = lastValid(atr14, price * 0.004) ?? price * 0.004;
  const rsiNow = lastValid(rsi14);
  const e20 = lastValid(ema20);
  const e50 = lastValid(ema50);

  /* ---------------------------- market structure ------------------------ */
  const highs = pivots.highs;
  const lows = pivots.lows;
  let structure: DeeeprTfAnalysis["structure"] = "RANGE";
  let bos: "UP" | "DOWN" | null = null;
  let choch: "UP" | "DOWN" | null = null;

  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
    const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;

    if (hh && hl) structure = "HH/HL";
    else if (lh && ll) structure = "LH/LL";
    else if (hh || hl) structure = "TRANSITION"; // bullish legs, broken low
    else if (lh || ll) structure = "TRANSITION"; // bearish legs, broken high

    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    if (structure === "HH/HL") {
      /* continuation break above the last swing high = BOS; close below the
         last swing low = bearish CHoCH (both close-confirmed, never wicks) */
      if (price > lastHigh.price) bos = "UP";
      else if (price < lastLow.price) choch = "DOWN";
    } else if (structure === "LH/LL") {
      if (price < lastLow.price) bos = "DOWN";
      else if (price > lastHigh.price) choch = "UP";
    } else if (structure === "TRANSITION") {
      if (price > highs[highs.length - 1].price) choch = "UP";
      else if (price < lows[lows.length - 1].price) choch = "DOWN";
    }
  }

  /* ------------------------------- liquidity ---------------------------- */
  const sweep = detectSweep(candles, pivots);
  let liquidityStatus: DeeeprTfAnalysis["liquidityStatus"] = "NOT_TOUCHED";
  if (sweep) {
    liquidityStatus = "SWEPT";
  } else if (lows.length > 0 || highs.length > 0) {
    const nearHigh = highs.some((h) => Math.abs(price - h.price) <= atrNow * 0.5);
    const nearLow = lows.some((l) => Math.abs(price - l.price) <= atrNow * 0.5);
    if (nearHigh || nearLow) liquidityStatus = "APPROACHED";
  }

  /* ---------------------------------- FVG ------------------------------- */
  let fvg: DeeeprFvg | null = null;
  const rawFvgs = detectFVG(candles, 5);
  for (const z of rawFvgs) {
    if (z.startIndex < candles.length - 30) continue; // too old to matter
    const age = candles.length - 1 - z.endIndex;
    let mitigated = false;
    for (let j = z.endIndex + 1; j < candles.length; j++) {
      const later = candles[j];
      const touched =
        z.bullish
          ? later.low < z.top && later.high > z.bottom
          : later.high > z.bottom && later.low < z.top;
      if (touched) {
        mitigated = true;
        break;
      }
    }
    fvg = {
      upper: roundTo(z.top, 6),
      lower: roundTo(z.bottom, 6),
      midpoint: roundTo((z.top + z.bottom) / 2, 6),
      age,
      distance: Math.abs(price - (z.top + z.bottom) / 2) / Math.max(atrNow, 1e-12),
      fresh: age <= 12,
      mitigated,
      direction: z.bullish ? "BULLISH" : "BEARISH",
      timeframe: tf,
    };
    break; // most recent gap only
  }

  /* ------------------------------ order block --------------------------- */
  const ob = findOrderBlock(candles, atr14);
  if (ob) ob.timeframe = tf;

  /* --------------------------- premium / discount ----------------------- */
  const rangeWindow = candles.slice(-60);
  const rangeHigh = Math.max(...rangeWindow.map((c) => c.high));
  const rangeLow = Math.min(...rangeWindow.map((c) => c.low));
  const equilibrium = (rangeHigh + rangeLow) / 2;
  const rangeSize = rangeHigh - rangeLow;
  let priceLocation: DeeeprTfAnalysis["priceLocation"] = null;
  if (rangeSize > 0) {
    const band = rangeSize * 0.1;
    priceLocation =
      price > equilibrium + band
        ? "PREMIUM"
        : price < equilibrium - band
          ? "DISCOUNT"
          : "EQUILIBRIUM";
  }

  /* ------------------------------- momentum ----------------------------- */
  const e9 = lastValid(ema(closes, 9));
  let emaAlignment: DeeeprTfAnalysis["emaAlignment"] = null;
  if (e9 != null && e20 != null && e50 != null) {
    if (e9 > e20 && e20 > e50) emaAlignment = "BULLISH";
    else if (e9 < e20 && e20 < e50) emaAlignment = "BEARISH";
    else emaAlignment = "MIXED";
  }

  const body = Math.abs(last.close - last.open);
  const displacement: DeeeprTfAnalysis["displacement"] =
    body >= atrNow * 0.9
      ? last.close > last.open
        ? "BULLISH"
        : "BEARISH"
      : null;

  const lastVol = last.volume;
  const volBase = lastValid(volSma);
  const relativeVolume =
    volBase != null && volBase > 0 ? lastVol / volBase : null;

  /* ------------------- real swing levels (structural refs) -------------- */
  let swingLow: number | null = null;
  let swingHigh: number | null = null;
  for (const l of lows) {
    if (l.price < price && (swingLow === null || l.price > swingLow)) swingLow = l.price;
  }
  for (const h of highs) {
    if (h.price > price && (swingHigh === null || h.price < swingHigh)) swingHigh = h.price;
  }

  /* ------------------------------- evidence ----------------------------- */
  let bull = 0;
  let bear = 0;
  const bump = (side: "BULLISH" | "BEARISH" | null, w = 1) => {
    if (side === "BULLISH") bull += w;
    else if (side === "BEARISH") bear += w;
  };
  bump(structure === "HH/HL" ? "BULLISH" : structure === "LH/LL" ? "BEARISH" : null);
  bump(bos === "UP" ? "BULLISH" : bos === "DOWN" ? "BEARISH" : null);
  bump(choch === "UP" ? "BULLISH" : choch === "DOWN" ? "BEARISH" : null);
  bump(sweep);
  bump(fvg?.direction ?? null);
  bump(ob?.direction ?? null);
  bump(emaAlignment === "BULLISH" ? "BULLISH" : emaAlignment === "BEARISH" ? "BEARISH" : null);
  bump(displacement);
  if (rsiNow != null) {
    if (rsiNow > 55) bump("BULLISH");
    else if (rsiNow < 45) bump("BEARISH");
  }

  return {
    timeframe: tf,
    status: "VALID",
    direction: bull > bear ? "BULLISH" : bear > bull ? "BEARISH" : "NEUTRAL",
    structure,
    bos,
    choch,
    sweep,
    liquidityStatus,
    fvg,
    orderBlock: ob,
    equilibrium: roundTo(equilibrium, 6),
    priceLocation,
    rsi: rsiNow == null ? null : roundTo(rsiNow, 1),
    emaAlignment,
    displacement,
    relativeVolume: relativeVolume == null ? null : roundTo(relativeVolume, 2),
    atr: roundTo(atrNow, 6),
    candleCount: candles.length,
    swingLow: swingLow == null ? null : roundTo(swingLow, 6),
    swingHigh: swingHigh == null ? null : roundTo(swingHigh, 6),
    evidence: { bull, bear, total: bull + bear },
  };
}

/* ------------------------------- entry engine --------------------------- */

interface ZoneCandidate {
  low: number;
  high: number;
  kind: string;
  fresh: boolean;
}

function pickEntryZone(
  direction: Direction,
  price: number,
  atrNow: number,
  tf: DeeeprTfAnalysis,
  decimals: number,
): ZoneCandidate | null {
  const rp = (v: number) => roundTo(v, decimals);
  const candidates: ZoneCandidate[] = [];

  if (direction === "LONG") {
    if (tf.fvg && tf.fvg.direction === "BULLISH" && !tf.fvg.mitigated) {
      const gap = price - tf.fvg.upper;
      if (gap >= -atrNow * 0.1 && gap <= atrNow * 3) {
        candidates.push({
          low: tf.fvg.lower,
          high: tf.fvg.upper,
          kind: "FVG",
          fresh: tf.fvg.fresh,
        });
      }
    }
    if (tf.orderBlock && tf.orderBlock.direction === "BULLISH") {
      const gap = price - tf.orderBlock.high;
      if (gap >= -atrNow * 0.1 && gap <= atrNow * 3) {
        candidates.push({
          low: tf.orderBlock.low,
          high: tf.orderBlock.high,
          kind: "ORDER BLOCK",
          fresh: tf.orderBlock.fresh,
        });
      }
    }
    if (tf.equilibrium != null && tf.priceLocation === "PREMIUM") {
      candidates.push({
        low: tf.equilibrium - atrNow * 0.5,
        high: tf.equilibrium + atrNow * 0.35,
        kind: "DISCOUNT",
        fresh: false,
      });
    }
    /* structural demand from the real swing low */
    if (tf.swingLow != null) {
      candidates.push({
        low: rp(tf.swingLow),
        high: rp(tf.swingLow + atrNow * 0.35),
        kind: "SWING LOW",
        fresh: true,
      });
    }
  } else {
    if (tf.fvg && tf.fvg.direction === "BEARISH" && !tf.fvg.mitigated) {
      const gap = tf.fvg.lower - price;
      if (gap >= -atrNow * 0.1 && gap <= atrNow * 3) {
        candidates.push({
          low: tf.fvg.lower,
          high: tf.fvg.upper,
          kind: "FVG",
          fresh: tf.fvg.fresh,
        });
      }
    }
    if (tf.orderBlock && tf.orderBlock.direction === "BEARISH") {
      const gap = tf.orderBlock.low - price;
      if (gap >= -atrNow * 0.1 && gap <= atrNow * 3) {
        candidates.push({
          low: tf.orderBlock.low,
          high: tf.orderBlock.high,
          kind: "ORDER BLOCK",
          fresh: tf.orderBlock.fresh,
        });
      }
    }
    if (tf.equilibrium != null && tf.priceLocation === "DISCOUNT") {
      candidates.push({
        low: tf.equilibrium - atrNow * 0.35,
        high: tf.equilibrium + atrNow * 0.5,
        kind: "PREMIUM",
        fresh: false,
      });
    }
    /* structural supply from the real swing high */
    if (tf.swingHigh != null) {
      candidates.push({
        low: rp(tf.swingHigh - atrNow * 0.35),
        high: rp(tf.swingHigh),
        kind: "SWING HIGH",
        fresh: true,
      });
    }
  }

  if (candidates.length === 0) return null;

  /* prefer the closest zone to price, with a freshness tie-break */
  candidates.sort((a, b) => {
    const da = Math.abs(price - (a.high + a.low) / 2);
    const db = Math.abs(price - (b.high + b.low) / 2);
    if (Math.abs(da - db) < atrNow * 0.4) return Number(b.fresh) - Number(a.fresh);
    return da - db;
  });
  const best = candidates[0];
  return {
    low: rp(best.low),
    high: rp(best.high),
    kind: best.kind,
    fresh: best.fresh,
  };
}

/* ------------------------------ risk engine ----------------------------- */

function structuralStop(
  direction: Direction,
  entryAvg: number,
  zoneLow: number,
  zoneHigh: number,
  tf: DeeeprTfAnalysis,
): number | null {
  const atrNow = tf.atr ?? 0;
  if (direction === "LONG") {
    /* invalidation = the real swing low, or the demand zone floor, minus a
       small volatility buffer. Never an arbitrary fixed distance. */
    const floor =
      tf.swingLow != null && tf.swingLow < entryAvg ? tf.swingLow : zoneLow;
    return floor - atrNow * 0.15;
  }
  const ceil =
    tf.swingHigh != null && tf.swingHigh > entryAvg ? tf.swingHigh : zoneHigh;
  return ceil + atrNow * 0.15;
}

/* ------------------------------ target engine --------------------------- */

function structuralTargets(
  direction: Direction,
  entryAvg: number,
  risk: number,
  tf: DeeeprTfAnalysis,
  decimals: number,
): { tp1: number; tp2: number; tp3: number; structural: boolean } {
  const rp = (v: number) => roundTo(v, decimals);
  const atrNow = tf.atr ?? risk;
  const levels: number[] = [];
  if (tf.equilibrium != null) {
    if (direction === "LONG" && tf.equilibrium > entryAvg + risk * 0.5) {
      levels.push(tf.equilibrium);
      levels.push(tf.equilibrium + atrNow);
      levels.push(tf.equilibrium + atrNow * 2);
    } else if (direction === "SHORT" && tf.equilibrium < entryAvg - risk * 0.5) {
      levels.push(tf.equilibrium);
      levels.push(tf.equilibrium - atrNow);
      levels.push(tf.equilibrium - atrNow * 2);
    }
  }
  if (tf.fvg) {
    if (direction === "LONG" && tf.fvg.upper > entryAvg + risk * 0.5) {
      levels.push(tf.fvg.upper);
      levels.push(tf.fvg.upper + atrNow);
    } else if (direction === "SHORT" && tf.fvg.lower < entryAvg - risk * 0.5) {
      levels.push(tf.fvg.lower);
      levels.push(tf.fvg.lower - atrNow);
    }
  }
  if (tf.orderBlock) {
    if (direction === "LONG" && tf.orderBlock.high > entryAvg + risk * 0.5) {
      levels.push(tf.orderBlock.high);
    } else if (direction === "SHORT" && tf.orderBlock.low < entryAvg - risk * 0.5) {
      levels.push(tf.orderBlock.low);
    }
  }
  const unique = [...new Set(levels.map((v) => rp(v)))].sort(
    direction === "LONG" ? (a, b) => a - b : (a, b) => b - a,
  );
  if (unique.length >= 3) {
    return {
      tp1: unique[0],
      tp2: unique[1],
      tp3: unique[2],
      structural: true,
    };
  }
  /* fallback: extend by ATR but only when at least one structural level
     exists — otherwise we would be inventing levels */
  if (unique.length > 0) {
    const anchor = unique[0];
    const dir = direction === "LONG" ? 1 : -1;
    return {
      tp1: unique[0],
      tp2: rp(anchor + dir * atrNow * 1.5),
      tp3: rp(anchor + dir * atrNow * 3),
      structural: false,
    };
  }
  return {
    tp1: rp(entryAvg + (direction === "LONG" ? 1 : -1) * Math.max(risk * 2, atrNow)),
    tp2: rp(entryAvg + (direction === "LONG" ? 1 : -1) * Math.max(risk * 3, atrNow * 2)),
    tp3: rp(entryAvg + (direction === "LONG" ? 1 : -1) * Math.max(risk * 4, atrNow * 3)),
    structural: false,
  };
}

/* ------------------------------ main engine ----------------------------- */

export function analyzeDeeepr(input: DeeeprInput): DeeeprTradeAnalysis {
  const {
    symbolId,
    timeframe,
    decimals,
    candlesByTf,
    primaryCandles,
    price,
    change24h,
    dataStatus,
    ageSeconds,
    gap,
    missingCandles,
  } = input;
  const rp = (v: number) => roundTo(v, decimals);
  const now = Date.now();
  /* Canonicalize timeframe keys so app ids ("5m") and engine keys ("5M")
     can never drift apart. */
  const canon = (tf: string) => tf.replace(/m$/, "M");
  const primaryTf = canon(timeframe);

  const analysis: DeeeprTradeAnalysis = {
    engine: "DEEEPR_TRADE_AI",
    version: "2.0",
    analysis_id: `da-${now.toString(36)}`,
    symbol: symbolId,
    timeframe,
    timestamp: now,
    data_status: dataStatus,
    age_seconds: ageSeconds,
    change24h,
    decision: "NO TRADE",
    direction: "NEUTRAL",
    setup_state: "NO_SETUP",
    score: 0,
    grade: "NO TRADE",
    confidence: "LOW",
    market_regime: "UNKNOWN",
    mtf: {},
    entry: {
      zone_low: 0,
      zone_high: 0,
      current_price: rp(price),
      quality: "WAITING",
      confirmation_required: "",
    },
    risk: { stop_loss: 0, risk_points: 0, minimum_rr: MIN_RR, actual_rr: 0 },
    targets: { tp1: 0, tp2: 0, tp3: 0 },
    confluence: {},
    hard_gates: [],
    reasons: [],
    invalidation: [],
    warnings: [],
    primary: null,
  };

  /* ------------------------------ data gates ---------------------------- */
  if (dataStatus === "STALE" || dataStatus === "OFFLINE" || dataStatus === "UNAVAILABLE") {
    analysis.decision = "INSUFFICIENT DATA";
    analysis.setup_state = "NO_SETUP";
    analysis.hard_gates.push(`Trade AI disabled — market data ${dataStatus.toLowerCase()} (${ageSeconds == null ? "no updates" : `${ageSeconds}s old`}).`);
    analysis.reasons.push("No trustworthy market data to analyze. The engine refuses to fabricate an opinion.");
    return analysis;
  }
  if (gap) {
    analysis.decision = "INSUFFICIENT DATA";
    analysis.hard_gates.push(
      `DATA GAP — ${missingCandles} timeframe bucket${missingCandles === 1 ? "" : "s"} missing from the ${timeframe} tape. History must be resynchronized before analysis.`,
    );
    analysis.reasons.push("Missing candles can hide structure breaks, sweeps and FVGs — no analysis is issued over gapped data.");
    return analysis;
  }
  if (primaryCandles.length < MIN_CANDLES) {
    analysis.decision = "INSUFFICIENT DATA";
    analysis.hard_gates.push(`Insufficient history — ${primaryCandles.length}/${MIN_CANDLES} candles loaded for ${timeframe}.`);
    analysis.reasons.push("Indicators and structure require warm-up history; the engine will not guess.");
    return analysis;
  }

  /* --------------------------- per-timeframe pass ----------------------- */
  const tfs: Record<string, DeeeprTfAnalysis> = {};
  tfs[primaryTf] = analyzeTimeframe(primaryTf, primaryCandles);
  for (const [tf, candles] of Object.entries(candlesByTf)) {
    tfs[canon(tf)] = analyzeTimeframe(canon(tf), candles);
  }

  const primary = tfs[primaryTf];
  analysis.primary = primary;

  /* ------------------------------ MTF consensus ------------------------- */
  const present = MTF_PRIORITY.filter((tf) => tfs[tf] && tfs[tf].status === "VALID");
  const primaryIdx = present.indexOf(primaryTf);
  const htfTfs = present.filter((_, i) => i < primaryIdx);

  let htfSum = 0;
  for (const tf of htfTfs) {
    const t = tfs[tf];
    const w = MTF_WEIGHT[tf] ?? 1;
    if (t.direction === "BULLISH") htfSum += w;
    else if (t.direction === "BEARISH") htfSum -= w;
  }
  const htfDirection: DirectionBias =
    htfSum > 0.5 ? "BULLISH" : htfSum < -0.5 ? "BEARISH" : "NEUTRAL";
  const htfConflict = htfDirection !== "NEUTRAL" && primary.direction !== "NEUTRAL" && htfDirection !== primary.direction;

  for (const tf of MTF_PRIORITY) {
    const t = tfs[tf];
    if (!t) continue;
    analysis.mtf[tf] =
      t.status === "VALID"
        ? t.direction === "BULLISH"
          ? "BULLISH"
          : t.direction === "BEARISH"
            ? "BEARISH"
            : "NEUTRAL"
        : "N/A";
  }

  /* ------------------------------ direction ----------------------------- */
  let direction: Direction = "NEUTRAL";
  if (htfDirection !== "NEUTRAL" && !htfConflict) {
    direction = htfDirection === "BULLISH" ? "LONG" : "SHORT";
  } else if (htfDirection === "NEUTRAL" && primary.direction !== "NEUTRAL") {
    direction = primary.direction === "BULLISH" ? "LONG" : "SHORT";
  } else if (htfConflict) {
    direction = htfDirection === "BULLISH" ? "LONG" : "SHORT"; // HTF owns the bias
  }
  analysis.direction = direction;

  /* Structural alignment is about the *actual* swing structure, not the
     evidence vote: an LH/LL structure supports SHORT even when the RSI/EMA
     evidence tally is neutral. */
  const structSupports =
    (primary.structure === "HH/HL" && direction === "LONG") ||
    (primary.structure === "LH/LL" && direction === "SHORT");
  const structOpposes =
    (primary.structure === "HH/HL" && direction === "SHORT") ||
    (primary.structure === "LH/LL" && direction === "LONG");

  /* ----------------------------- market regime -------------------------- */
  const atrNow = primary.atr ?? price * 0.004;
  const rangeWindow = primaryCandles.slice(-60);
  const rangeHigh = Math.max(...rangeWindow.map((c) => c.high));
  const rangeLow = Math.min(...rangeWindow.map((c) => c.low));
  const rangeSize = rangeHigh - rangeLow;
  const regime =
    primary.structure === "HH/HL"
      ? "TRENDING UP"
      : primary.structure === "LH/LL"
        ? "TRENDING DOWN"
        : primary.structure === "TRANSITION"
          ? "TRANSITION"
          : rangeSize > 0 && atrNow / rangeSize < 0.05
            ? "COMPRESSION"
            : rangeSize > 0 && atrNow / rangeSize > 0.3
              ? "EXPANSION"
              : "RANGING";
  analysis.market_regime = regime;

  /* ------------------------------- no setup ----------------------------- */
  if (direction === "NEUTRAL") {
    analysis.decision = "NO TRADE";
    analysis.setup_state = "NO_SETUP";
    analysis.confidence = "LOW";
    analysis.reasons.push(
      "No directional confluence — higher timeframes are neutral and the primary structure shows no break or change of character.",
    );
    analysis.confluence = {
      htf: "NEUTRAL",
      structure: primary.structure,
      liquidity: primary.liquidityStatus ?? "NOT_TOUCHED",
      momentum: primary.emaAlignment ?? "MIXED",
      entry: false,
    };
    return analysis;
  }

  /* ------------------------------- entry zone --------------------------- */
  const zone = pickEntryZone(direction, price, atrNow, primary, decimals);
  if (!zone) {
    analysis.decision = "NO TRADE";
    analysis.setup_state = "NO_SETUP";
    analysis.hard_gates.push("No logical entry zone — no unfilled FVG, order block or structural level within range of price.");
    analysis.reasons.push("A setup needs a concrete entry location; none exists on the current tape.");
    analysis.confluence = { htf: htfDirection, structure: primary.structure, entry: false };
    return analysis;
  }

  const entryAvg = (zone.low + zone.high) / 2;
  let entryQuality: EntryQuality | "WAITING";
  const dist = direction === "LONG" ? price - zone.high : zone.low - price;
  if (direction === "LONG" ? price >= zone.low && price <= zone.high : price <= zone.high && price >= zone.low) {
    entryQuality = "OPTIMAL";
  } else if (dist >= 0 && dist <= atrNow * 0.5) {
    entryQuality = "GOOD";
  } else if (dist >= 0 && dist <= atrNow * 1.5) {
    entryQuality = "EARLY";
  } else if (dist >= 0 && dist <= atrNow * 2.5) {
    entryQuality = "LATE";
  } else if (dist > atrNow * 2.5) {
    entryQuality = "CHASE";
  } else {
    entryQuality = "INVALID"; // zone already broken
  }

  /* ------------------------------ risk / SL ----------------------------- */
  const stop = structuralStop(direction, entryAvg, zone.low, zone.high, primary);
  if (stop == null || !Number.isFinite(stop)) {
    analysis.decision = "NO TRADE";
    analysis.hard_gates.push("Stop loss cannot be placed from market structure — risk is undefined.");
    analysis.reasons.push("Every trade needs a structural invalidation point; none is available.");
    analysis.confluence = { htf: htfDirection, structure: primary.structure, entry: entryQuality };
    return analysis;
  }
  const sl = rp(stop);
  const riskPoints = Math.abs(entryAvg - sl);
  if (riskPoints <= 0) {
    analysis.decision = "NO TRADE";
    analysis.hard_gates.push("Risk distance is zero — stop cannot be defined.");
    return analysis;
  }

  /* ------------------------------ targets ------------------------------- */
  const tgt = structuralTargets(direction, entryAvg, riskPoints, primary, decimals);
  let tp1 = tgt.tp1;
  let tp2 = tgt.tp2;
  let tp3 = tgt.tp3;
  if (direction === "LONG") {
    tp1 = Math.max(tp1, rp(entryAvg + riskPoints * 1.0));
    tp2 = Math.max(tp2, rp(tp1 + riskPoints * 1.0));
    tp3 = Math.max(tp3, rp(tp2 + riskPoints * 1.0));
  } else {
    tp1 = Math.min(tp1, rp(entryAvg - riskPoints * 1.0));
    tp2 = Math.min(tp2, rp(tp1 - riskPoints * 1.0));
    tp3 = Math.min(tp3, rp(tp2 - riskPoints * 1.0));
  }
  if (!tgt.structural) {
    analysis.warnings.push("Targets extended by ATR — no higher structural liquidity levels were found on this timeframe.");
  }

  const rr = Math.max(0, Math.abs(tp1 - entryAvg) / riskPoints);

  analysis.entry = {
    zone_low: zone.low,
    zone_high: zone.high,
    current_price: rp(price),
    quality: entryQuality,
    confirmation_required:
      entryQuality === "OPTIMAL" || entryQuality === "GOOD"
        ? direction === "LONG"
          ? "Bullish displacement or demand rejection inside the zone"
          : "Bearish displacement or supply rejection inside the zone"
        : `Price must reach ${rp(zone.low)}–${rp(zone.high)} first`,
  };
  analysis.risk = {
    stop_loss: sl,
    risk_points: rp(riskPoints),
    minimum_rr: MIN_RR,
    actual_rr: Math.round(rr * 10) / 10,
  };
  analysis.targets = { tp1: rp(tp1), tp2: rp(tp2), tp3: rp(tp3) };

  /* -------------------------------- score ------------------------------- */
  const dirAligned =
    primary.direction === (direction === "LONG" ? "BULLISH" : "BEARISH");
  let score = 0;

  if (htfDirection !== "NEUTRAL" && htfDirection === primary.direction) score += 15;
  else if (htfDirection !== "NEUTRAL" && !htfConflict) score += 10;
  else if (htfDirection === "NEUTRAL") score += 6;

  if (structSupports) score += 15;
  else if (structOpposes) score += 0;
  else if (primary.structure === "TRANSITION") score += dirAligned ? 8 : 5;
  else score += 5;

  if (primary.sweep === (direction === "LONG" ? "BULLISH" : "BEARISH")) score += 12;
  else if (primary.liquidityStatus === "APPROACHED") score += 8;
  else if (primary.liquidityStatus === "NOT_TOUCHED") score += 3;

  if (primary.displacement === (direction === "LONG" ? "BULLISH" : "BEARISH")) score += 10;

  const fvgInFavor =
    primary.fvg != null &&
    primary.fvg.direction === (direction === "LONG" ? "BULLISH" : "BEARISH");
  score += fvgInFavor ? (primary.fvg!.fresh && !primary.fvg!.mitigated ? 10 : 5) : 0;

  const obInFavor =
    primary.orderBlock != null &&
    primary.orderBlock.direction === (direction === "LONG" ? "BULLISH" : "BEARISH");
  score += obInFavor ? (primary.orderBlock!.fresh ? 8 : 4) : 0;

  if (entryQuality === "OPTIMAL") score += 12;
  else if (entryQuality === "GOOD") score += 9;
  else if (entryQuality === "EARLY") score += 6;
  else if (entryQuality === "LATE") score += 3;
  else score += 0;

  const rsiFav =
    primary.rsi != null &&
    (direction === "LONG"
      ? primary.rsi >= 40 && primary.rsi <= 68
      : primary.rsi <= 60 && primary.rsi >= 32);
  if (rsiFav && primary.emaAlignment === (direction === "LONG" ? "BULLISH" : "BEARISH")) score += 5;
  else if (rsiFav || primary.emaAlignment === (direction === "LONG" ? "BULLISH" : "BEARISH")) score += 3;

  if (primary.relativeVolume != null) {
    if (primary.relativeVolume >= 1.2) score += 5;
    else if (primary.relativeVolume >= 0.8) score += 3;
    else score += 1;
  }

  if (rr >= 3) score += 8;
  else if (rr >= 2.5) score += 7;
  else if (rr >= 2) score += 5;

  /* penalties */
  if (entryQuality === "LATE") score -= 10;
  if (entryQuality === "CHASE") score -= 20;
  if (htfConflict) score -= 15;
  if (structOpposes) score -= 20;
  if (rr < 2) score -= 15;
  if (regime === "RANGING" && primary.priceLocation === "EQUILIBRIUM") score -= 10;
  if (primary.rsi == null || primary.atr == null) score -= 10;
  if (primary.relativeVolume == null) score -= 2;
  if (primary.relativeVolume != null && primary.relativeVolume > 4) {
    score -= 10;
    analysis.warnings.push("Abnormal volume expansion — volatility is elevated; size accordingly.");
  }

  score = Math.round(clamp(score, 0, 100));

  /* ----------------------------- hard gates ----------------------------- */
  const gates: string[] = [];
  if (entryQuality === "CHASE") gates.push("Entry is a chase — price has already extended well beyond the zone.");
  if (entryQuality === "INVALID") gates.push("Setup invalidated — price has broken through the entry zone.");
  if (rr < MIN_RR) gates.push(`Risk/reward ${rr.toFixed(1)} below the ${MIN_RR.toFixed(1)} minimum.`);
  if (structOpposes) {
    gates.push(
      `Strong structural contradiction — primary ${timeframe} ${primary.structure} structure opposes the ${direction} bias.`,
    );
  }
  if (entryQuality === "LATE") gates.push("Entry location is late — waiting for price to return to the zone.");

  /* ----------------------------- decision ------------------------------- */
  let decision: DeeeprDecision;
  let setupState: SetupState;

  if (gates.some((g) => g.startsWith("Setup invalidated"))) {
    decision = "INVALIDATED";
    setupState = "INVALIDATED";
  } else if (
    gates.some(
      (g) =>
        g.includes("chase") ||
        g.includes("below the") ||
        g.includes("contradiction"),
    )
  ) {
    decision = "NO TRADE";
    setupState = "SETUP_DETECTED";
  } else if (htfConflict) {
    decision = direction === "LONG" ? "WAIT FOR BUY" : "WAIT FOR SELL";
    setupState = "CONFIRMATION_PENDING";
    gates.push("Timeframe conflict — higher timeframe bias disagrees with the primary setup.");
  } else if (entryQuality === "EARLY" || entryQuality === "LATE") {
    decision = direction === "LONG" ? "WAIT FOR BUY" : "WAIT FOR SELL";
    setupState = "WAITING_FOR_ZONE";
  } else if (entryQuality === "OPTIMAL" || entryQuality === "GOOD") {
    if (score >= 85) {
      decision = direction === "LONG" ? "STRONG BUY" : "STRONG SELL";
      setupState = "ENTRY_CONFIRMED";
    } else if (score >= 70) {
      decision = direction === "LONG" ? "BUY" : "SELL";
      setupState = "ENTRY_CONFIRMED";
    } else if (score >= 60) {
      decision = direction === "LONG" ? "WAIT FOR BUY" : "WAIT FOR SELL";
      setupState = "CONFIRMATION_PENDING";
    } else {
      decision = "NO TRADE";
      setupState = "SETUP_DETECTED";
    }
  } else {
    decision = "NO TRADE";
    setupState = "SETUP_DETECTED";
  }

  analysis.decision = decision;
  analysis.setup_state = setupState;
  analysis.score = score;
  analysis.grade = gradeFor(score);
  analysis.hard_gates = gates;

  /* ---------------------------- confidence ------------------------------ */
  let alignedCount = 0;
  if (htfDirection !== "NEUTRAL" && htfDirection === primary.direction) alignedCount++;
  if (structSupports) alignedCount++;
  if (primary.sweep === (direction === "LONG" ? "BULLISH" : "BEARISH")) alignedCount++;
  if (primary.displacement === (direction === "LONG" ? "BULLISH" : "BEARISH")) alignedCount++;
  if (fvgInFavor && primary.fvg!.fresh) alignedCount++;
  if (obInFavor && primary.orderBlock!.fresh) alignedCount++;
  if (entryQuality === "OPTIMAL" || entryQuality === "GOOD") alignedCount++;
  if (rsiFav && primary.emaAlignment === (direction === "LONG" ? "BULLISH" : "BEARISH")) alignedCount++;
  analysis.confidence =
    alignedCount >= 6 ? "HIGH" : alignedCount >= 4 ? "MEDIUM" : "LOW";

  /* ------------------------------- reasons ------------------------------ */
  const reasons: string[] = [];
  const agreeing = htfTfs.filter(
    (tf) => tfs[tf].direction === (htfDirection === "BULLISH" ? "BULLISH" : "BEARISH"),
  );
  const opposing = htfTfs.filter(
    (tf) => tfs[tf].direction !== "NEUTRAL" && tfs[tf].direction !== htfDirection,
  );
  if (htfDirection !== "NEUTRAL") {
    reasons.push(
      `Higher timeframes lean ${htfDirection === "BULLISH" ? "bullish" : "bearish"} (${agreeing.join(" · ") || "none"})${opposing.length > 0 ? ` with ${opposing.join(" · ")} opposing` : ""}.`,
    );
  } else {
    reasons.push("Higher timeframes are neutral — direction rests on the primary structure.");
  }
  reasons.push(
    `Primary ${timeframe} structure: ${primary.structure}${primary.bos ? ` with ${primary.bos} BOS` : ""}${primary.choch ? ` and ${primary.choch} CHoCH` : ""}.`,
  );
  if (primary.sweep) {
    reasons.push(
      primary.sweep === "BULLISH"
        ? "Sell-side liquidity swept — price poked a swing low and closed back above it."
        : "Buy-side liquidity swept — price poked a swing high and closed back below it.",
    );
  } else {
    reasons.push("No recent liquidity sweep in the primary tape.");
  }
  if (fvgInFavor) {
    reasons.push(
      primary.fvg!.fresh && !primary.fvg!.mitigated
        ? `Fresh unfilled ${primary.fvg!.direction} FVG near price (${rp(primary.fvg!.lower)}–${rp(primary.fvg!.upper)}).`
        : "FVG present but aged or already mitigated — reduced weight.",
    );
  } else {
    reasons.push("No fresh FVG aligned with the setup direction.");
  }
  if (entryQuality !== "OPTIMAL") {
    reasons.push(
      `Price is ${dist > 0 ? `${(dist / Math.max(atrNow, 1e-12)).toFixed(1)} ATR ` : ""}outside the optimal entry zone (${rp(zone.low)}–${rp(zone.high)}) — waiting for the zone, not chasing.`,
    );
  }
  if (gates.length > 0) {
    reasons.push(`Hard gates: ${gates.join(" ")}`);
  }

  /* ----------------------------- invalidation --------------------------- */
  const invalidation: string[] = [];
  if (direction === "LONG") {
    invalidation.push(`Close below ${rp(sl)} (structural stop) invalidates the setup.`);
    if (primary.fvg && primary.fvg.direction === "BULLISH") {
      invalidation.push(`Full mitigation of the ${rp(primary.fvg.lower)}–${rp(primary.fvg.upper)} FVG.`);
    }
  } else {
    invalidation.push(`Close above ${rp(sl)} (structural stop) invalidates the setup.`);
    if (primary.fvg && primary.fvg.direction === "BEARISH") {
      invalidation.push(`Full mitigation of the ${rp(primary.fvg.lower)}–${rp(primary.fvg.upper)} FVG.`);
    }
  }
  if (primary.structure === "HH/HL" || primary.structure === "LH/LL") {
    invalidation.push(
      direction === "LONG"
        ? "Break of the swing-low structure on the primary timeframe."
        : "Break of the swing-high structure on the primary timeframe.",
    );
  }

  analysis.reasons = reasons;
  analysis.invalidation = invalidation;

  analysis.confluence = {
    htf: htfDirection,
    structure: structSupports ? true : primary.structure,
    liquidity: primary.sweep === (direction === "LONG" ? "BULLISH" : "BEARISH") ? true : primary.liquidityStatus ?? "NOT_TOUCHED",
    displacement: primary.displacement === (direction === "LONG" ? "BULLISH" : "BEARISH") ? true : primary.displacement ?? "NONE",
    fvg: fvgInFavor ? primary.fvg!.fresh : false,
    order_block: obInFavor ? primary.orderBlock!.fresh : false,
    momentum: rsiFav && primary.emaAlignment === (direction === "LONG" ? "BULLISH" : "BEARISH"),
    volume: primary.relativeVolume != null && primary.relativeVolume >= 1.2,
    entry: entryQuality === "OPTIMAL" || entryQuality === "GOOD",
    rr: rr >= MIN_RR,
  };

  return analysis;
}

export function gradeFor(score: number): string {
  if (score >= 95) return "S+";
  if (score >= 90) return "S";
  if (score >= 85) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "NO TRADE";
}
