/* ============================================================================
   DEEEPR IQ — Liquidity & Order Flow engine (deterministic, data-first).

   Everything here is a pure function of REAL observed order-book depth and
   real trade prints (Binance @depth / @aggTrade streams). No mock data, no
   Math.random, no fabricated whale orders. When depth/trade data is missing
   the engines return `available: false` and callers must render
   "LIQUIDITY DATA UNAVAILABLE" instead of inventing values.

   Engines in this file:

     LiquidityEngine   — best bid/ask, spread, depth imbalance, liquidity
                         walls (local-distribution-relative strength with
                         persistence/status tracking + conservative
                         spoof-like behavior detection), liquidity magnet,
                         liquidity pools.
     OrderFlowEngine   — buy/sell volume split, delta, cumulative delta
                         trend, large-trade activity, volume anomaly vs the
                         candle baseline.
     VolumeProfileEngine — POC / VAH / VAL / HVN / LVN from real candle
                         volume (never confused with order-book depth).
     DataQuality       — 0–100 score from feed health + tick freshness +
                         candle continuity + order-book freshness.
   ========================================================================== */

import type { Candle } from "./market";

/* ------------------------------- book types ------------------------------ */

export interface BookLevel {
  price: number;
  size: number; // base units at this price
}

export interface OrderBookSnapshot {
  bids: BookLevel[]; // sorted desc by price
  asks: BookLevel[]; // sorted asc by price
  receivedAt: number; // epoch ms when the frame arrived
}

/* ----------------------------- liquidity walls --------------------------- */

export type WallStatus = "NEW" | "ACTIVE" | "REDUCING" | "REMOVED" | "REAPPEARED";
export type WallClass = "NORMAL" | "HIGH" | "VERY HIGH" | "EXTREME";

export interface LiquidityWall {
  price: number;
  side: "bid" | "ask"; // bid = bullish wall, ask = bearish wall
  size: number; // current resting size (base units)
  maxSize: number;
  /** 0–100 relative strength against the local order-book distribution. */
  strength: number;
  class: WallClass;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  persistenceMs: number;
  status: WallStatus;
  /** Possible spoof-like behavior: wall repeatedly appeared/disappeared
      before price reached it. Conservative language only — we can never
      prove intent from cancellations alone. */
  unstable: boolean;
  /** Notional (price × size) so USD depth is comparable across assets. */
  notional: number;
}

/** A cluster of resting liquidity in one direction, with a magnet score. */
export interface LiquidityMagnet {
  price: number;
  side: "bid" | "ask";
  distancePct: number; // signed distance from current price (+ above, − below)
  score: number; // 0–100
  reasons: string[];
}

export interface LiquidityPools {
  /** Aggregate notional of buy-side (bid) walls below price. */
  buySideNotional: number;
  /** Aggregate notional of sell-side (ask) walls above price. */
  sellSideNotional: number;
  buyWallCount: number;
  sellWallCount: number;
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export interface LiquidityAnalysis {
  available: boolean;
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
  spreadPct: number | null;
  bidDepth: number; // total notional on the bid side of the book
  askDepth: number; // total notional on the ask side of the book
  /** (bidDepth − askDepth) / (bidDepth + askDepth), clamped to [−1, 1].
      Positive = bid dominance, negative = ask dominance. */
  depthImbalance: number;
  walls: LiquidityWall[];
  magnet: LiquidityMagnet | null;
  pools: LiquidityPools;
  freshnessMs: number | null; // age of the last depth frame
  snapshotCount: number;
}

export interface LiquidityContext {
  /** Real swing levels from the candle tape (deeepr primary analysis). */
  swingHigh: number | null;
  swingLow: number | null;
  /** Session high/low from the recent candle tape (real). */
  sessionHigh: number | null;
  sessionLow: number | null;
}

/* ------------------------------- order flow ------------------------------ */

export interface Trade {
  price: number;
  qty: number; // base units
  /** true = buyer is maker (aggressive seller), false = aggressive buyer. */
  isBuyerMaker: boolean;
  time: number; // epoch ms
}

export type Dominance = "BUYER" | "SELLER" | "BALANCED";
export type CvdTrend = "RISING" | "FALLING" | "FLAT";
export type VolumeAnomalyLabel = "LOW" | "NORMAL" | "HIGH" | "EXTREME";

export interface OrderFlowAnalysis {
  available: boolean;
  windowMs: number;
  buyVolume: number; // base units bought aggressively
  sellVolume: number; // base units sold aggressively
  delta: number; // buy − sell
  deltaPct: number | null; // delta / total × 100
  tradeCount: number;
  avgTradeSize: number;
  largeTradeCount: number; // trades ≥ 3× the window average size
  largeTradeNotional: number;
  aggressiveBuying: boolean;
  aggressiveSelling: boolean;
  dominance: Dominance;
  cvd: number; // cumulative delta since the stream attached
  cvdTrend: CvdTrend;
  volumeAnomaly: { label: VolumeAnomalyLabel; ratio: number } | null;
}

export interface CvdBucket {
  time: number; // bucket start, epoch ms
  cvd: number; // cumulative signed volume at end of bucket
}

/* ----------------------------- volume profile ---------------------------- */

export interface VolumeProfile {
  available: boolean;
  poc: number | null; // price of maximum volume node
  vah: number | null; // value area high (70% of volume)
  val: number | null; // value area low
  highVolumeNodes: number[]; // prices ≥ 80% of POC volume
  lowVolumeNodes: number[]; // prices ≤ 20% of POC volume
}

/* ------------------------------ data quality ----------------------------- */

export interface DataQualityScore {
  score: number; // 0–100
  factors: { label: string; ok: boolean; note: string }[];
}

export interface DataQualityInput {
  liveStatus: string; // KlineStatus
  freshness: string; // DataFreshness
  ageSeconds: number | null;
  gap: boolean;
  candleCount: number;
  lastCandleAgeSeconds: number | null; // age of the forming candle
  orderBookFreshnessMs: number | null; // null when depth unavailable
  volumeAvailable: boolean;
}

/* ------------------------------ wall tracking ---------------------------- */

const WALL_MIN_RATIO = 2.5; // vs local median — below this is NORMAL, not a wall
const WALL_REMOVED_GRACE_MS = 120_000; // keep REMOVED walls visible briefly
const UNSTABLE_TOGGLES = 2; // appearance/disappearance count that flags instability

/** Median of an array (used as the local size baseline). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function wallClassFor(ratio: number): WallClass {
  if (ratio >= 8) return "EXTREME";
  if (ratio >= 4.5) return "VERY HIGH";
  if (ratio >= WALL_MIN_RATIO) return "HIGH";
  return "NORMAL";
}

function strengthFor(ratio: number): number {
  return Math.round(Math.min(100, Math.max(5, (ratio / 8) * 100)));
}

/** Internal wall shape — carries the instability toggle counter that is
    stripped before results are exposed. */
type TrackedWall = LiquidityWall & { _toggles: number };

/**
 * Diff the previous wall set against the current book and produce the new
 * wall set with honest status transitions:
 *
 *   NEW        — level crossed the local threshold for the first time
 *   ACTIVE     — still present near its peak size
 *   REDUCING   — present but shrunk below 70% of its max
 *   REAPPEARED — returned after being removed
 *   REMOVED    — gone from the book (kept for a short grace window)
 *
 * Persistence is tracked across snapshots: a wall seen once is a weak
 * observation; walls that persist accrue confidence. Repeated
 * appear/disappear cycles before price reaches the level flag the wall as
 * UNSTABLE (possible spoof-like behavior — never asserted as confirmed).
 */
function trackWalls(
  prev: LiquidityWall[],
  bids: BookLevel[],
  asks: BookLevel[],
  now: number,
): LiquidityWall[] {
  const prevTracked = prev as TrackedWall[];
  const current = new Map<string, BookLevel>();
  for (const l of bids) current.set(`bid:${l.price}`, l);
  for (const l of asks) current.set(`ask:${l.price}`, l);

  const out: TrackedWall[] = [];
  const toggleCount = new Map<string, number>();

  for (const w of prevTracked) {
    const key = `${w.side}:${w.price}`;
    const level = current.get(key);
    if (level) {
      const size = level.size;
      const maxSize = Math.max(w.maxSize, size);
      const status: WallStatus =
        size < w.maxSize * 0.7 ? "REDUCING" : "ACTIVE";
      /* a reappearance after removal is one instability cycle */
      const toggles = (toggleCount.get(key) ?? 0) + (w.status === "REMOVED" ? 1 : 0);
      out.push({
        ...w,
        size,
        maxSize,
        notional: size * w.price,
        lastSeen: now,
        persistenceMs: now - w.firstSeen,
        status: w.status === "REMOVED" ? "REAPPEARED" : status,
        unstable: w.unstable,
        _toggles: toggles,
      });
      toggleCount.set(key, toggles);
    } else if (now - w.lastSeen <= WALL_REMOVED_GRACE_MS) {
      /* keep it visible briefly as REMOVED so disappearance is observable */
      out.push({ ...w, status: "REMOVED", _toggles: w._toggles });
      toggleCount.set(key, w._toggles);
    }
  }

  /* detect genuinely new walls (nothing in prev, nothing in current pass) */
  const fresh = detectWalls(bids, asks, now);
  for (const w of fresh) {
    const key = `${w.side}:${w.price}`;
    const existing = out.find((o) => o.side === w.side && o.price === w.price);
    if (existing) continue;
    /* a level returning after it expired from the grace window restarts
       with a 1-cycle history so repeated toggling still accumulates */
    const prevToggles = prevTracked.find((p) => p.side === w.side && p.price === w.price)
      ? (toggleCount.get(key) ?? 0) + 1
      : 0;
    out.push({ ...w, _toggles: prevToggles });
    toggleCount.set(key, prevToggles);
  }

  /* instability: any wall that was REMOVED at least once and came back
     (or disappeared/reappeared) without price reaching it is flagged */
  return out.map((w) => {
    const toggles = toggleCount.get(`${w.side}:${w.price}`) ?? 0;
    return {
      price: w.price,
      side: w.side,
      size: w.size,
      maxSize: w.maxSize,
      strength: w.strength,
      class: w.class,
      firstSeen: w.firstSeen,
      lastSeen: w.lastSeen,
      persistenceMs: w.persistenceMs,
      status: w.status,
      unstable: toggles >= UNSTABLE_TOGGLES,
      notional: w.notional,
    };
  });
}

/* --------------------------------------------------------------------------
   Wall detection. For each level we compute its size relative to the LOCAL
   median of nearby levels (±2 levels each side, minimum 5 levels). Levels
   ≥ WALL_MIN_RATIO × the local median are liquidity walls. Calling a level
   a "whale" purely because it is big is explicitly avoided — classification
   is distribution-relative by design.
   ------------------------------------------------------------------------ */
function detectWalls(bids: BookLevel[], asks: BookLevel[], now: number): LiquidityWall[] {
  const walls: LiquidityWall[] = [];

  const analyzeSide = (levels: BookLevel[], side: "bid" | "ask") => {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level.size <= 0) continue;
      const lo = Math.max(0, i - 2);
      const hi = Math.min(levels.length, i + 3);
      const local = levels.slice(lo, hi).map((l) => l.size);
      if (local.length < 3) continue;
      const localMed = median(local);
      if (localMed <= 0) continue;
      const ratio = level.size / localMed;
      if (ratio < WALL_MIN_RATIO) continue;
      const cls = wallClassFor(ratio);
      walls.push({
        price: level.price,
        side,
        size: level.size,
        maxSize: level.size,
        strength: strengthFor(ratio),
        class: cls,
        firstSeen: now,
        lastSeen: now,
        persistenceMs: 0,
        status: "NEW",
        unstable: false,
        notional: level.size * level.price,
      });
    }
  };

  analyzeSide(bids, "bid");
  analyzeSide(asks, "ask");
  return walls;
}

/* ---------------------------- magnet scoring ----------------------------- */

function magnetReasons(
  wall: LiquidityWall,
  price: number,
  ctx: LiquidityContext,
): string[] {
  const reasons: string[] = [];
  const sizeLabel =
    wall.notional >= 1_000_000
      ? `$${(wall.notional / 1_000_000).toFixed(1)}M`
      : `$${Math.round(wall.notional / 1000)}K`;
  reasons.push(`Strong ${wall.side === "ask" ? "sell-side" : "buy-side"} resting liquidity (${sizeLabel})`);
  const atrApprox = Math.max(price * 0.004, 1e-9);
  if (wall.side === "ask" && ctx.swingHigh != null && Math.abs(wall.price - ctx.swingHigh) <= atrApprox * 0.8) {
    reasons.push("Near the real swing high — structural supply overlap");
  }
  if (wall.side === "bid" && ctx.swingLow != null && Math.abs(wall.price - ctx.swingLow) <= atrApprox * 0.8) {
    reasons.push("Near the real swing low — structural demand overlap");
  }
  if (wall.persistenceMs >= 5 * 60_000) {
    reasons.push(`Persistent — resting for ${Math.round(wall.persistenceMs / 60_000)}m`);
  }
  if (reasons.length === 0) reasons.push("Concentrated order-book liquidity");
  return reasons;
}

/**
 * Pick the primary liquidity magnet — the most significant resting-liquidity
 * cluster with the strongest combination of size, proximity, persistence and
 * structural overlap. Score 0–100 (intensity, not probability).
 */
function pickMagnet(
  walls: LiquidityWall[],
  price: number,
  ctx: LiquidityContext,
): LiquidityMagnet | null {
  const present = walls.filter(
    (w) => w.status !== "REMOVED" && !w.unstable && w.price !== price,
  );
  if (present.length === 0) return null;

  let best: LiquidityMagnet | null = null;
  for (const w of present) {
    const distancePct = ((w.price - price) / price) * 100;
    const proximity = Math.max(0, 1 - Math.abs(distancePct) / 3); // closer = better
    const persistence = Math.min(1, w.persistenceMs / (15 * 60_000));
    const stability = w.status === "REAPPEARED" ? 0.6 : 1;
    const structural =
      (w.side === "ask" && ctx.swingHigh != null && Math.abs(w.price - ctx.swingHigh) <= price * 0.004 * 0.8) ||
      (w.side === "bid" && ctx.swingLow != null && Math.abs(w.price - ctx.swingLow) <= price * 0.004 * 0.8)
        ? 1
        : 0.5;
    const score = Math.round(
      Math.min(
        100,
        w.strength * 0.45 +
          proximity * 18 +
          persistence * 14 +
          stability * 8 +
          structural * 15,
      ),
    );
    if (best === null || score > best.score) {
      best = {
        price: w.price,
        side: w.side,
        distancePct: Math.round(distancePct * 100) / 100,
        score,
        reasons: magnetReasons(w, price, ctx),
      };
    }
  }
  return best;
}

/* ---------------------------- liquidity pools ---------------------------- */

function computePools(
  walls: LiquidityWall[],
  price: number,
  ctx: LiquidityContext,
): LiquidityPools {
  const buy = walls.filter((w) => w.side === "bid" && w.status !== "REMOVED" && w.price <= price);
  const sell = walls.filter((w) => w.side === "ask" && w.status !== "REMOVED" && w.price >= price);
  return {
    buySideNotional: buy.reduce((s, w) => s + w.notional, 0),
    sellSideNotional: sell.reduce((s, w) => s + w.notional, 0),
    buyWallCount: buy.length,
    sellWallCount: sell.length,
    nearestSupport: ctx.swingLow,
    nearestResistance: ctx.swingHigh,
  };
}

/* -------------------------- main liquidity engine ------------------------ */

export interface AnalyzeLiquidityOptions {
  /** Previous wall set to diff against (for persistence/status tracking). */
  prevWalls?: LiquidityWall[];
  price: number;
  context?: LiquidityContext;
  now?: number;
}

export function analyzeLiquidity(
  snapshot: OrderBookSnapshot | null,
  opts: AnalyzeLiquidityOptions,
): LiquidityAnalysis {
  const now = opts.now ?? Date.now();
  const ctx: LiquidityContext = {
    swingHigh: opts.context?.swingHigh ?? null,
    swingLow: opts.context?.swingLow ?? null,
    sessionHigh: opts.context?.sessionHigh ?? null,
    sessionLow: opts.context?.sessionLow ?? null,
  };

  if (!snapshot || snapshot.bids.length === 0 || snapshot.asks.length === 0) {
    return {
      available: false,
      bestBid: null,
      bestAsk: null,
      midPrice: null,
      spread: null,
      spreadPct: null,
      bidDepth: 0,
      askDepth: 0,
      depthImbalance: 0,
      walls: [],
      magnet: null,
      pools: {
        buySideNotional: 0,
        sellSideNotional: 0,
        buyWallCount: 0,
        sellWallCount: 0,
        nearestSupport: ctx.swingLow,
        nearestResistance: ctx.swingHigh,
      },
      freshnessMs: null,
      snapshotCount: 0,
    };
  }

  const bids = [...snapshot.bids].sort((a, b) => b.price - a.price);
  const asks = [...snapshot.asks].sort((a, b) => a.price - b.price);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const midPrice = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const spread =
    bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const spreadPct =
    spread != null && midPrice != null && midPrice > 0
      ? (spread / midPrice) * 100
      : null;

  const bidDepth = bids.reduce((s, l) => s + l.size * l.price, 0);
  const askDepth = asks.reduce((s, l) => s + l.size * l.price, 0);
  const total = bidDepth + askDepth;
  const depthImbalance =
    total > 0 ? Math.max(-1, Math.min(1, (bidDepth - askDepth) / total)) : 0;

  const walls = trackWalls(opts.prevWalls ?? [], bids, asks, now);
  const magnet = pickMagnet(walls, opts.price, ctx);
  const pools = computePools(walls, opts.price, ctx);

  return {
    available: true,
    bestBid,
    bestAsk,
    midPrice,
    spread,
    spreadPct,
    bidDepth,
    askDepth,
    depthImbalance: Math.round(depthImbalance * 1000) / 1000,
    walls,
    magnet,
    pools,
    freshnessMs: now - snapshot.receivedAt,
    snapshotCount: snapshot.bids.length + snapshot.asks.length,
  };
}

/* ----------------------------- order flow engine ------------------------- */

/** Split real trade prints into aggressive buy/sell volume over a window. */
export function analyzeOrderFlow(
  trades: Trade[],
  price: number,
  opts: { baselineVolumes?: number[]; cvdHistory?: CvdBucket[]; windowMs?: number },
): OrderFlowAnalysis {
  const windowMs = opts.windowMs ?? 300_000;
  const cutoff = Date.now() - windowMs;
  const window = trades.filter((t) => t.time >= cutoff);
  if (window.length === 0) {
    return {
      available: false,
      windowMs,
      buyVolume: 0,
      sellVolume: 0,
      delta: 0,
      deltaPct: null,
      tradeCount: 0,
      avgTradeSize: 0,
      largeTradeCount: 0,
      largeTradeNotional: 0,
      aggressiveBuying: false,
      aggressiveSelling: false,
      dominance: "BALANCED",
      cvd: 0,
      cvdTrend: "FLAT",
      volumeAnomaly: null,
    };
  }

  let buyVolume = 0;
  let sellVolume = 0;
  let largeCount = 0;
  let largeNotional = 0;
  const sizes: number[] = [];
  for (const t of window) {
    if (t.isBuyerMaker) sellVolume += t.qty;
    else buyVolume += t.qty;
    sizes.push(t.qty);
  }
  const avgSize =
    sizes.reduce((s, v) => s + v, 0) / Math.max(sizes.length, 1);
  for (const t of window) {
    if (t.qty >= avgSize * 3) {
      largeCount++;
      largeNotional += t.qty * t.price;
    }
  }

  const delta = buyVolume - sellVolume;
  const totalVol = buyVolume + sellVolume;
  const deltaPct = totalVol > 0 ? (delta / totalVol) * 100 : null;
  const dominance: Dominance =
    deltaPct == null || Math.abs(deltaPct) < 5
      ? "BALANCED"
      : deltaPct > 0
        ? "BUYER"
        : "SELLER";

  /* cumulative delta trend from per-minute buckets */
  let cvdTrend: CvdTrend = "FLAT";
  const hist = opts.cvdHistory ?? [];
  if (hist.length >= 3) {
    const recent = hist.slice(-3);
    const first = recent[0].cvd;
    const lastC = recent[recent.length - 1].cvd;
    const threshold = Math.max(Math.abs(first) * 0.02, 1e-9);
    cvdTrend =
      lastC - first > threshold
        ? "RISING"
        : first - lastC > threshold
          ? "FALLING"
          : "FLAT";
  }

  /* volume anomaly vs the candle baseline (SMA of recent candle volumes) */
  let volumeAnomaly: OrderFlowAnalysis["volumeAnomaly"] = null;
  const baseline = opts.baselineVolumes ?? [];
  const base = baseline.length > 0
    ? baseline.reduce((s, v) => s + v, 0) / baseline.length
    : 0;
  if (base > 0) {
    const ratio = totalVol / base;
    const label: VolumeAnomalyLabel =
      ratio >= 3 ? "EXTREME" : ratio >= 1.5 ? "HIGH" : ratio >= 0.7 ? "NORMAL" : "LOW";
    volumeAnomaly = { label, ratio: Math.round(ratio * 10) / 10 };
  }

  return {
    available: true,
    windowMs,
    buyVolume,
    sellVolume,
    delta,
    deltaPct: deltaPct == null ? null : Math.round(deltaPct * 100) / 100,
    tradeCount: window.length,
    avgTradeSize: Math.round(avgSize * 1e6) / 1e6,
    largeTradeCount: largeCount,
    largeTradeNotional: largeNotional,
    aggressiveBuying: buyVolume > sellVolume * 1.1,
    aggressiveSelling: sellVolume > buyVolume * 1.1,
    dominance,
    cvd: hist.length > 0 ? hist[hist.length - 1].cvd : delta,
    cvdTrend,
    volumeAnomaly,
  };
}

/* --------------------------- volume profile engine ----------------------- */

/**
 * Volume profile from real candle volume over the visible tape. Buckets the
 * price range into bins and finds POC / value area / HVN / LVN. This is
 * HISTORICAL volume — it is deliberately kept separate from order-book
 * depth so the two data types are never conflated.
 */
export function computeVolumeProfile(
  candles: Candle[],
  bins = 22,
): VolumeProfile {
  if (candles.length < 5) return { available: false, poc: null, vah: null, val: null, highVolumeNodes: [], lowVolumeNodes: [] };
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const range = hi - lo;
  if (range <= 0) return { available: false, poc: null, vah: null, val: null, highVolumeNodes: [], lowVolumeNodes: [] };

  const binSize = range / bins;
  const volByBin = new Array<number>(bins).fill(0);
  for (const c of candles) {
    /* distribute candle volume across the bins it spans (real volume) */
    const top = Math.min(bins - 1, Math.floor((c.high - lo) / binSize));
    const bottom = Math.max(0, Math.floor((c.low - lo) / binSize));
    const count = Math.max(1, top - bottom + 1);
    const per = c.volume / count;
    for (let b = bottom; b <= top; b++) volByBin[b] += per;
  }

  const midPrice = (price: number) => lo + (price + 0.5) * binSize;
  const pocBin = volByBin.indexOf(Math.max(...volByBin));
  const poc = midPrice(pocBin);
  const totalVol = volByBin.reduce((s, v) => s + v, 0);

  /* value area: expand from POC until 70% of volume is enclosed */
  let loBin = pocBin;
  let hiBin = pocBin;
  let enclosed = volByBin[pocBin];
  while (loBin > 0 || hiBin < bins - 1) {
    if (enclosed / Math.max(totalVol, 1e-9) >= 0.7) break;
    const below = loBin > 0 ? volByBin[loBin - 1] : 0;
    const above = hiBin < bins - 1 ? volByBin[hiBin + 1] : 0;
    if (above >= below) {
      hiBin++;
      enclosed += above;
    } else {
      loBin--;
      enclosed += below;
    }
  }

  const peak = volByBin[pocBin] || 1;
  const highVolumeNodes: number[] = [];
  const lowVolumeNodes: number[] = [];
  for (let b = 0; b < bins; b++) {
    const price = midPrice(b);
    if (volByBin[b] >= peak * 0.8) highVolumeNodes.push(price);
    else if (volByBin[b] <= peak * 0.2 && volByBin[b] > 0) lowVolumeNodes.push(price);
  }

  return {
    available: true,
    poc,
    vah: midPrice(hiBin),
    val: midPrice(loBin),
    highVolumeNodes,
    lowVolumeNodes,
  };
}

/* ------------------------------ data quality ----------------------------- */

export function computeDataQuality(input: DataQualityInput): DataQualityScore {
  const factors: { label: string; ok: boolean; note: string }[] = [];
  let score = 0;

  const feedLive = input.liveStatus === "LIVE" && input.freshness === "LIVE";
  factors.push({
    label: "WebSocket feed",
    ok: feedLive,
    note: feedLive ? "connected" : input.liveStatus.toLowerCase(),
  });
  if (feedLive) score += 25;

  const fresh = input.ageSeconds != null && input.ageSeconds <= 60;
  factors.push({
    label: "Tick freshness",
    ok: fresh,
    note: input.ageSeconds == null ? "no updates" : `${input.ageSeconds}s`,
  });
  if (fresh) score += 20;

  factors.push({
    label: "Candle continuity",
    ok: !input.gap,
    note: input.gap ? "gapped history" : "continuous",
  });
  if (!input.gap) score += 20;

  const historyOk = input.candleCount >= 60;
  factors.push({
    label: "Historical candles",
    ok: historyOk,
    note: `${input.candleCount} loaded`,
  });
  if (historyOk) score += 15;

  const lastOk = input.lastCandleAgeSeconds != null && input.lastCandleAgeSeconds <= 300;
  factors.push({
    label: "Candle freshness",
    ok: lastOk,
    note: input.lastCandleAgeSeconds == null ? "—" : `${input.lastCandleAgeSeconds}s`,
  });
  if (lastOk) score += 10;

  if (input.orderBookFreshnessMs != null) {
    const bookFresh = input.orderBookFreshnessMs <= 15_000;
    factors.push({
      label: "Order book",
      ok: bookFresh,
      note: bookFresh ? "live" : `${Math.round(input.orderBookFreshnessMs / 1000)}s old`,
    });
    if (bookFresh) score += 10;
  } else {
    factors.push({
      label: "Order book",
      ok: false,
      note: "depth feed unavailable",
    });
  }

  factors.push({
    label: "Volume data",
    ok: input.volumeAvailable,
    note: input.volumeAvailable ? "available" : "missing",
  });
  if (input.volumeAvailable) score += 0;

  return { score: Math.round(Math.min(100, score)), factors };
}
