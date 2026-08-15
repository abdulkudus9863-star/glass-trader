/* ============================================================================
   DEEEPR IQ — Institutional Liquidity Intelligence.

   A deterministic confluence layer that sits on top of the Trade AI engine.
   It re-weights every validated signal (HTF bias, MTF alignment, structure,
   liquidity, sweep, order flow, volume, FVG, order block, entry location,
   regime, risk/reward) into one normalized 0–100 score with conflict
   penalties, then produces:

     - an IQ grade (NO SETUP … ELITE — confluence quality, NOT win odds)
     - a TRADE / WAIT / NO TRADE / INSUFFICIENT DATA verdict
     - a top-tier filter (A+ requires score ≥ 90, RR ≥ 1:2.5, live data,
       no gaps, fresh candle, confirmed structure AND liquidity context)
     - setup DNA and WAIT intelligence ("waiting for …")

   Deterministic by construction: the same inputs always produce the same
   output, so historical candles can be replayed through it (backtest
   compatibility). It can never invent liquidity, volume, structure or
   prices — when the deterministic engine says WAIT, the verdict is WAIT.
   ========================================================================== */

import type { DeeeprTradeAnalysis } from "./deeepr";
import type { OrderFlowAnalysis, LiquidityAnalysis, VolumeProfile, DataQualityScore } from "./orderbook";
import { formatPrice } from "./market";

/* ------------------------------- public types ---------------------------- */

export type IqGrade =
  | "NO SETUP"
  | "WEAK"
  | "DEVELOPING"
  | "B SETUP"
  | "A SETUP"
  | "A+"
  | "ELITE";

export type IqVerdict =
  | "TRADE"
  | "WAIT"
  | "NO TRADE"
  | "INSUFFICIENT DATA";

export interface IqFactor {
  key: string;
  label: string;
  weight: number; // max points for this factor
  earned: number; // points actually earned
  detail: string;
}

export interface IqPenalty {
  label: string;
  amount: number;
}

export interface SetupDnaRow {
  label: string;
  value: string;
  ok: boolean;
}

export interface IqLiquiditySummary {
  available: boolean;
  depthImbalance: number;
  bidWall: { price: number; strength: number; persistenceMs: number } | null;
  askWall: { price: number; strength: number; persistenceMs: number } | null;
  magnet: {
    price: number;
    side: "bid" | "ask";
    distancePct: number;
    score: number;
    reasons: string[];
  } | null;
  unstableWalls: number;
  removedWalls: number;
}

export interface IqOrderFlowSummary {
  available: boolean;
  dominance: "BUYER" | "SELLER" | "BALANCED";
  buyVolume: number;
  sellVolume: number;
  delta: number;
  deltaPct: number | null;
  cvd: number;
  cvdTrend: "RISING" | "FALLING" | "FLAT";
  largeTradeCount: number;
  volumeAnomaly: { label: string; ratio: number } | null;
}

export interface IqVolumeProfileSummary {
  available: boolean;
  poc: number | null;
  vah: number | null;
  val: number | null;
}

export interface DeeeprIqResult {
  symbolId: string;
  timeframe: string;
  timestamp: number;
  /** True when the raw data gates passed (feed live, no gaps, enough data). */
  gate_ok: boolean;
  score: number;
  grade: IqGrade;
  verdict: IqVerdict;
  lifecycle: string;
  factors: IqFactor[];
  penalties: IqPenalty[];
  /** Directional bias the IQ believes in (LONG / SHORT / NEUTRAL). */
  bias: "LONG" | "SHORT" | "NEUTRAL";
  regime: string;
  mtf: { aligned: number; total: number };
  structure: { label: string; ok: boolean };
  sweep: { label: string; ok: boolean };
  fvg: { label: string; ok: boolean };
  orderBlock: { label: string; ok: boolean };
  entry: { label: string; ok: boolean };
  rr: { value: number; ok: boolean };
  dataQuality: number;
  liquidity: IqLiquiditySummary;
  orderFlow: IqOrderFlowSummary;
  volumeProfile: IqVolumeProfileSummary;
  setupDna: SetupDnaRow[];
  waitingFor: string[];
  invalidation: string[];
  warnings: string[];
  topTier: boolean;
}

export interface DeeeprIqInput {
  symbolId: string;
  timeframe: string;
  decimals: number;
  analysis: DeeeprTradeAnalysis;
  liquidity: LiquidityAnalysis | null;
  orderFlow: OrderFlowAnalysis | null;
  volumeProfile: VolumeProfile | null;
  dataQuality: DataQualityScore;
  lastCandleAgeSeconds: number | null;
  gap: boolean;
}

/* ------------------------------- constants ------------------------------- */

/** Spec §26 weights — normalized to sum 100. */
export const IQ_WEIGHTS = {
  htf: 12,
  mtf: 10,
  structure: 15,
  liquidity: 15,
  sweep: 10,
  orderFlow: 8,
  volume: 7,
  fvg: 5,
  orderBlock: 5,
  entry: 5,
  regime: 4,
  rr: 4,
} as const;

const MIN_A_SCORE = 85;
const MIN_A_PLUS_SCORE = 90;
const MIN_ELITE_SCORE = 95;
const MIN_RR_A_PLUS = 2.5;

function gradeForScore(score: number): IqGrade {
  if (score >= MIN_ELITE_SCORE) return "ELITE";
  if (score >= MIN_A_PLUS_SCORE) return "A+";
  if (score >= MIN_A_SCORE) return "A SETUP";
  if (score >= 75) return "B SETUP";
  if (score >= 65) return "DEVELOPING";
  if (score >= 50) return "WEAK";
  return "NO SETUP";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pctLabel(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

/* ------------------------------ main engine ------------------------------ */

export function computeDeeeprIq(input: DeeeprIqInput): DeeeprIqResult {
  const { symbolId, timeframe, decimals, analysis, liquidity, orderFlow, volumeProfile, dataQuality, lastCandleAgeSeconds, gap } = input;
  const rp = (v: number) => formatPrice(v, decimals);
  const now = Date.now();

  const base: DeeeprIqResult = {
    symbolId,
    timeframe,
    timestamp: now,
    gate_ok: false,
    score: 0,
    grade: "NO SETUP",
    verdict: "INSUFFICIENT DATA",
    lifecycle: "WATCH",
    factors: [],
    penalties: [],
    bias: "NEUTRAL",
    regime: analysis.market_regime,
    mtf: { aligned: 0, total: 0 },
    structure: { label: analysis.primary?.structure ?? "—", ok: false },
    sweep: { label: "NONE", ok: false },
    fvg: { label: "NONE", ok: false },
    orderBlock: { label: "NONE", ok: false },
    entry: { label: analysis.entry.quality, ok: false },
    rr: { value: analysis.risk.actual_rr, ok: analysis.risk.actual_rr >= analysis.risk.minimum_rr },
    dataQuality: dataQuality.score,
    liquidity: {
      available: liquidity?.available ?? false,
      depthImbalance: liquidity?.depthImbalance ?? 0,
      bidWall: null,
      askWall: null,
      magnet: null,
      unstableWalls: 0,
      removedWalls: 0,
    },
    orderFlow: {
      available: orderFlow?.available ?? false,
      dominance: orderFlow?.dominance ?? "BALANCED",
      buyVolume: orderFlow?.buyVolume ?? 0,
      sellVolume: orderFlow?.sellVolume ?? 0,
      delta: orderFlow?.delta ?? 0,
      deltaPct: orderFlow?.deltaPct ?? null,
      cvd: orderFlow?.cvd ?? 0,
      cvdTrend: orderFlow?.cvdTrend ?? "FLAT",
      largeTradeCount: orderFlow?.largeTradeCount ?? 0,
      volumeAnomaly: orderFlow?.volumeAnomaly ?? null,
    },
    volumeProfile: {
      available: volumeProfile?.available ?? false,
      poc: volumeProfile?.poc ?? null,
      vah: volumeProfile?.vah ?? null,
      val: volumeProfile?.val ?? null,
    },
    setupDna: [],
    waitingFor: [],
    invalidation: analysis.invalidation,
    warnings: [...analysis.warnings],
    topTier: false,
  };

  /* ------------------------------ data gates ---------------------------- */
  if (analysis.decision === "INSUFFICIENT DATA") {
    base.gate_ok = false;
    base.verdict = "INSUFFICIENT DATA";
    base.lifecycle = "WATCH";
    base.waitingFor = analysis.hard_gates.length > 0 ? analysis.hard_gates : ["Live data with no gaps"];
    return base;
  }

  /* data quality must be trustworthy or the IQ refuses to trade */
  const dataOk =
    analysis.data_status === "LIVE" &&
    dataQuality.score >= 50 &&
    lastCandleAgeSeconds != null &&
    lastCandleAgeSeconds <= 600;
  if (!dataOk) {
    base.gate_ok = false;
    base.verdict = "INSUFFICIENT DATA";
    base.lifecycle = "WATCH";
    base.waitingFor = [
      dataQuality.score < 50
        ? "DATA QUALITY RESTORED (currently " + dataQuality.score + "/100)"
        : "LIVE DATA (currently " + (analysis.data_status || "unknown") + ")",
      lastCandleAgeSeconds != null && lastCandleAgeSeconds > 600
        ? `FRESH CANDLE (last update ${lastCandleAgeSeconds}s ago)`
        : "FRESH CANDLE",
    ];
    return base;
  }
  base.gate_ok = true;

  /* ------------------------------- bias --------------------------------- */
  const direction = analysis.direction;
  const bias: "LONG" | "SHORT" | "NEUTRAL" =
    direction === "LONG" ? "LONG" : direction === "SHORT" ? "SHORT" : "NEUTRAL";
  base.bias = bias;
  const wantsBullish = bias === "LONG";
  const wantsBearish = bias === "SHORT";
  const dirMatches = (side: string | boolean | null | undefined, inverse = false): boolean => {
    if (bias === "NEUTRAL") return false;
    const wantBull = wantsBullish !== inverse;
    if (side === "BULLISH") return wantBull;
    if (side === "BEARISH") return !wantBull;
    return false;
  };

  /* ------------------------------- factors ------------------------------ */
  const factors: IqFactor[] = [];
  const penalties: IqPenalty[] = [];
  const f = (key: string, label: string, weight: number, earned: number, detail: string) =>
    factors.push({ key, label, weight, earned: Math.round(earned), detail });

  /* HTF bias (12) */
  const htf = analysis.confluence.htf;
  const htfOk = dirMatches(htf);
  const htfConflict = typeof htf === "string" && ["BULLISH", "BEARISH"].includes(htf) && !htfOk;
  f("htf", "HTF bias", IQ_WEIGHTS.htf, htfOk ? IQ_WEIGHTS.htf : htfConflict ? 0 : 6,
    htfOk ? `HTF ${htf} aligns with ${bias}` : htfConflict ? `HTF ${htf} opposes ${bias}` : "HTF neutral");
  if (htfConflict) penalties.push({ label: "HTF conflict", amount: 10 });

  /* MTF alignment (10) — aligned timeframes / valid timeframes */
  const mtfValues = Object.values(analysis.mtf).filter((v) => v !== "N/A");
  const mtfAligned = mtfValues.filter((v) => dirMatches(v)).length;
  const mtfTotal = mtfValues.length;
  base.mtf = { aligned: mtfAligned, total: mtfTotal };
  const mtfEarned = mtfTotal > 0 ? (mtfAligned / mtfTotal) * IQ_WEIGHTS.mtf : 0;
  f("mtf", "MTF alignment", IQ_WEIGHTS.mtf, mtfEarned,
    `${mtfAligned}/${mtfTotal} timeframes aligned`);

  /* Market structure (15) */
  const structValue = analysis.confluence.structure;
  const structOk = structValue === true;
  const structTransition = analysis.primary?.structure === "TRANSITION";
  const structOpposes = bias !== "NEUTRAL" && structValue !== true && analysis.primary?.structure === (wantsBullish ? "LH/LL" : "HH/HL");
  f("structure", "Market structure", IQ_WEIGHTS.structure,
    structOk ? IQ_WEIGHTS.structure : structTransition ? 8 : structOpposes ? 0 : 5,
    structOk ? `${analysis.primary?.structure} supports ${bias}`
      : structOpposes ? `${analysis.primary?.structure} opposes ${bias}`
      : analysis.primary?.structure ?? "RANGE");
  if (structOpposes) penalties.push({ label: "Structural contradiction", amount: 10 });

  /* Liquidity (15) — real order-book depth + walls + magnet */
  const wallDir = (side: "bid" | "ask"): boolean =>
    (side === "bid" && wantsBullish) || (side === "ask" && wantsBearish);
  let liquidityEarned = 0;
  let liquidityDetail = "LIQUIDITY DATA UNAVAILABLE";
  let liquidityWeak = false;
  if (liquidity?.available) {
    const presentWalls = liquidity.walls.filter((w) => w.status !== "REMOVED");
    const supporting = presentWalls.filter((w) => wallDir(w.side));
    const opposing = presentWalls.filter((w) => !wallDir(w.side));
    const imbalance = liquidity.depthImbalance;
    const imbalanceSupports = bias === "NEUTRAL" ? false : wantsBullish ? imbalance > 0.05 : imbalance < -0.05;
    if (supporting.length > 0) liquidityEarned += 9;
    if (imbalanceSupports) liquidityEarned += 4;
    if (liquidity.magnet && wallDir(liquidity.magnet.side)) liquidityEarned += 2;
    liquidityDetail =
      supporting.length > 0
        ? `${supporting.length} ${wantsBullish ? "bid" : "ask"} wall${supporting.length > 1 ? "s" : ""} · imbalance ${(imbalance * 100).toFixed(0)}%`
        : opposing.length > 0
          ? `Liquidity stacks against the ${bias} bias`
          : `No significant walls near price · imbalance ${(imbalance * 100).toFixed(0)}%`;
    liquidityWeak = supporting.length === 0;
  } else {
    liquidityWeak = true;
  }
  /* depth unavailable → factor earns 0 and the panel shows
     LIQUIDITY DATA UNAVAILABLE — no penalty, no invention */
  f("liquidity", "Liquidity", IQ_WEIGHTS.liquidity, liquidityEarned, liquidityDetail);
  if (liquidityWeak && liquidity?.available) penalties.push({ label: "Weak liquidity support", amount: 5 });

  /* Sweep (10) */
  const sweep = analysis.primary?.sweep ?? null;
  const sweepOk = sweep !== null && (wantsBullish ? sweep === "BULLISH" : sweep === "BEARISH");
  const sweepApproach = analysis.primary?.liquidityStatus === "APPROACHED";
  f("sweep", "Liquidity sweep", IQ_WEIGHTS.sweep,
    sweepOk ? IQ_WEIGHTS.sweep : sweepApproach ? 6 : sweep !== null ? 2 : 0,
    sweepOk ? `${sweep === "BULLISH" ? "Sell-side" : "Buy-side"} swept`
      : sweepApproach ? "Liquidity approached, not swept"
      : sweep !== null ? `${sweep === "BULLISH" ? "Buy-side" : "Sell-side"} swept (opposes bias)`
      : "No sweep detected");

  /* Order flow (8) */
  const flowSupports =
    orderFlow?.available === true &&
    (orderFlow.dominance === "BUYER" ? wantsBullish : orderFlow.dominance === "SELLER" ? wantsBearish : false);
  const flowOpposes =
    orderFlow?.available === true &&
    (orderFlow.dominance === "BUYER" ? wantsBearish : orderFlow.dominance === "SELLER" ? wantsBullish : false);
  f("orderFlow", "Order flow", IQ_WEIGHTS.orderFlow,
    flowSupports ? IQ_WEIGHTS.orderFlow : flowOpposes ? 0 : orderFlow?.available ? 3 : 0,
    orderFlow?.available
      ? `${orderFlow.dominance} dominance · delta ${pctLabel(orderFlow.deltaPct ?? 0)}`
      : "ORDER FLOW DATA UNAVAILABLE");
  if (flowOpposes) penalties.push({ label: "Liquidity/flow conflict", amount: 8 });

  /* Volume (7) */
  const relVol = analysis.primary?.relativeVolume ?? null;
  const volEarned =
    relVol == null ? 0 : relVol >= 1.2 ? IQ_WEIGHTS.volume : relVol >= 0.8 ? 4 : 1;
  f("volume", "Volume", IQ_WEIGHTS.volume, volEarned,
    relVol == null ? "no volume baseline" : `${relVol.toFixed(2)}× average`);
  const anomaly = orderFlow?.volumeAnomaly;
  if (anomaly && (anomaly.label === "EXTREME" || anomaly.ratio >= 3)) {
    penalties.push({ label: "Abnormal volume expansion — risk adjustment", amount: 5 });
    base.warnings.push("Volume expansion " + anomaly.ratio.toFixed(1) + "× baseline — volatility is elevated.");
  }

  /* FVG (5) */
  const fvg = analysis.primary?.fvg ?? null;
  const fvgOk = fvg != null && dirMatches(fvg.direction) && fvg.fresh && !fvg.mitigated;
  f("fvg", "FVG", IQ_WEIGHTS.fvg, fvgOk ? IQ_WEIGHTS.fvg : fvg != null && dirMatches(fvg.direction) ? 2 : 0,
    fvgOk
      ? `Fresh ${fvg.direction} FVG ${rp(fvg.lower)}–${rp(fvg.upper)}`
      : fvg != null
        ? `${fvg.direction} FVG ${fvg.mitigated ? "mitigated" : "aged"}`
        : "NONE");

  /* Order block (5) */
  const ob = analysis.primary?.orderBlock ?? null;
  const obOk = ob != null && dirMatches(ob.direction) && ob.fresh;
  f("orderBlock", "Order block", IQ_WEIGHTS.orderBlock, obOk ? IQ_WEIGHTS.orderBlock : ob != null && dirMatches(ob.direction) ? 2 : 0,
    obOk ? `Fresh ${ob.direction} OB ${rp(ob.low)}–${rp(ob.high)}` : ob != null ? `${ob.direction} OB (aged)` : "NONE");

  /* Entry location (5) */
  const quality = analysis.entry.quality;
  const entryEarned =
    quality === "OPTIMAL" ? 5 : quality === "GOOD" ? 4 : quality === "EARLY" ? 3 : quality === "LATE" ? 1 : 0;
  f("entry", "Entry location", IQ_WEIGHTS.entry, entryEarned, `quality: ${quality}`);
  if (quality === "CHASE" || quality === "INVALID") penalties.push({ label: "Poor entry location", amount: 10 });

  /* Market regime (4) */
  const regime = analysis.market_regime;
  const regimeOk =
    (wantsBullish && (regime.includes("UP") || regime === "BULLISH RETRACEMENT")) ||
    (wantsBearish && (regime.includes("DOWN") || regime === "BEARISH RETRACEMENT"));
  f("regime", "Market regime", IQ_WEIGHTS.regime, regimeOk ? IQ_WEIGHTS.regime : regime.includes("RANGE") ? 1 : 2, regime);
  if (regime === "EXPANSION" || regime === "TRANSITION") {
    base.warnings.push(`High-volatility regime (${regime}) — size risk accordingly.`);
  }

  /* Risk / reward (4) */
  const rr = analysis.risk.actual_rr;
  const rrOk = rr >= analysis.risk.minimum_rr;
  const rrEarned = rr >= 3 ? 4 : rr >= 2.5 ? 3 : rr >= 2 ? 2 : 0;
  f("rr", "Risk / reward", IQ_WEIGHTS.rr, rrEarned, `1:${rr.toFixed(1)}`);
  base.rr = { value: rr, ok: rrOk };
  if (!rrOk) penalties.push({ label: "Poor RR", amount: 10 });

  /* ------------------------------- score -------------------------------- */
  let score = factors.reduce((s, x) => s + x.earned, 0);
  score -= penalties.reduce((s, p) => s + p.amount, 0);
  score = Math.round(clamp(score, 0, 100));
  base.factors = factors;
  base.penalties = penalties;
  base.score = score;
  base.grade = gradeForScore(score);

  /* --------------------------- setup DNA rows --------------------------- */
  const dna: SetupDnaRow[] = [];
  if (bias !== "NEUTRAL") {
    dna.push({ label: "HTF", value: typeof htf === "string" ? htf : "NEUTRAL", ok: htfOk });
    dna.push({
      label: sweepOk ? "Liquidity swept" : "Liquidity",
      value: sweepOk
        ? `${sweep === "BULLISH" ? "Sell-side" : "Buy-side"} swept ✓`
        : liquidityDetail,
      ok: sweepOk,
    });
    dna.push({
      label: "Structure",
      value: structOk ? `${analysis.primary?.structure} ✓` : analysis.primary?.structure ?? "RANGE",
      ok: structOk,
    });
    dna.push({ label: "FVG", value: fvgOk ? `${fvg?.direction} ✓` : fvg != null ? fvg.direction : "NONE", ok: fvgOk });
    dna.push({ label: "Order block", value: obOk ? `${ob?.direction} ✓` : ob != null ? ob.direction : "NONE", ok: obOk });
    dna.push({
      label: "Volume",
      value: relVol == null ? "—" : relVol >= 1.2 ? `Expansion ${relVol.toFixed(2)}× ✓` : `${relVol.toFixed(2)}×`,
      ok: relVol != null && relVol >= 1.2,
    });
    dna.push({
      label: "Order flow",
      value: orderFlow?.available ? `${orderFlow.dominance} ✓` : "UNAVAILABLE",
      ok: flowSupports === true,
    });
    dna.push({ label: "RR", value: `1:${rr.toFixed(1)}`, ok: rrOk });
    dna.push({ label: "Score", value: `${score}/100`, ok: score >= MIN_A_SCORE });
    dna.push({ label: "Grade", value: base.grade, ok: score >= MIN_A_SCORE });
  }
  base.setupDna = dna;

  /* --------------------------- lifecycle state -------------------------- */
  base.lifecycle = lifecycleFor(analysis, score, sweepOk, liquidity?.available === true, base.gate_ok);

  /* ------------------------------- verdict ------------------------------ */
  const entryOk = quality === "OPTIMAL" || quality === "GOOD";
  const liquidityContextConfirmed =
    !liquidity?.available || // honest: cannot confirm without depth
    (liquidity.available && (liquidity.walls.some((w) => wallDir(w.side) && w.status !== "REMOVED") || (liquidity.magnet != null && wallDir(liquidity.magnet.side))));

  let verdict: IqVerdict;
  if (!base.gate_ok) {
    verdict = "INSUFFICIENT DATA";
  } else if (analysis.decision === "INVALIDATED") {
    verdict = "NO TRADE";
    base.lifecycle = "INVALIDATED";
  } else if (analysis.decision === "NO TRADE") {
    verdict = "WAIT";
  } else if (!entryOk) {
    verdict = "WAIT";
  } else if (score < MIN_A_SCORE) {
    verdict = "WAIT";
  } else if (!rrOk) {
    verdict = "WAIT";
  } else if (!structOk) {
    verdict = "WAIT";
  } else {
    verdict = "TRADE";
  }
  base.verdict = verdict;

  /* --------------------------- top-tier filter -------------------------- */
  const topTier =
    verdict === "TRADE" &&
    score >= MIN_A_PLUS_SCORE &&
    rr >= MIN_RR_A_PLUS &&
    dataQuality.score >= 80 &&
    !gap &&
    lastCandleAgeSeconds != null &&
    lastCandleAgeSeconds <= 300 &&
    structOk &&
    liquidityContextConfirmed;
  if (topTier && score >= MIN_ELITE_SCORE) base.grade = "ELITE";
  else if (topTier) base.grade = "A+";
  else if (score >= MIN_A_PLUS_SCORE && !topTier) {
    /* A-level but top-tier confirmation incomplete — honest downgrade */
    base.grade = "A SETUP";
    base.warnings.push(
      "Score qualifies for A+ but the top-tier filter is not satisfied (liquidity context, RR ≥ 1:2.5, fresh live data all required) — capped at A.",
    );
  }
  base.topTier = topTier;

  /* --------------------------- WAIT intelligence ------------------------ */
  const waiting: string[] = [];
  if (verdict !== "TRADE" && bias !== "NEUTRAL") {
    if (!sweepOk) {
      waiting.push(wantsBullish ? "SELL-SIDE SWEEP" : "BUY-SIDE SWEEP");
    }
    if (!structOk) waiting.push(wantsBullish ? "BULLISH CHOCH / BOS" : "BEARISH CHOCH / BOS");
    if (!fvgOk && fvg != null) waiting.push("FVG RECLAIM");
    if (!entryOk) waiting.push(`PRICE INTO ENTRY ZONE ${rp(analysis.entry.zone_low)}–${rp(analysis.entry.zone_high)}`);
    if (!rrOk) waiting.push("RR ≥ 1:2.0");
    if (!htfOk && htfConflict) waiting.push("HTF ALIGNMENT");
    if (liquidity?.available && !liquidityContextConfirmed) waiting.push("DIRECTION-SUPPORTING LIQUIDITY");
    if (waiting.length === 0) waiting.push("ADDITIONAL CONFIRMATION");
  } else if (verdict === "TRADE") {
    /* nothing — a live setup needs no waiting list */
  } else if (bias === "NEUTRAL") {
    waiting.push("DIRECTIONAL CONFLUENCE");
    waiting.push("STRUCTURE BREAK OR CHOCH");
  } else {
    waiting.push("LIVE DATA WITH NO GAPS");
  }
  base.waitingFor = waiting;

  /* --------------------------- summary objects -------------------------- */
  if (liquidity) {
    const present = liquidity.walls.filter((w) => w.status !== "REMOVED");
    base.liquidity = {
      available: liquidity.available,
      depthImbalance: liquidity.depthImbalance,
      bidWall:
        present.find((w) => w.side === "bid") ??
        null,
      askWall:
        present.find((w) => w.side === "ask") ?? null,
      magnet: liquidity.magnet
        ? {
            price: liquidity.magnet.price,
            side: liquidity.magnet.side,
            distancePct: liquidity.magnet.distancePct,
            score: liquidity.magnet.score,
            reasons: liquidity.magnet.reasons,
          }
        : null,
      unstableWalls: present.filter((w) => w.unstable).length,
      removedWalls: liquidity.walls.filter((w) => w.status === "REMOVED").length,
    };
  }
  if (orderFlow?.available) {
    base.orderFlow = {
      available: true,
      dominance: orderFlow.dominance,
      buyVolume: orderFlow.buyVolume,
      sellVolume: orderFlow.sellVolume,
      delta: orderFlow.delta,
      deltaPct: orderFlow.deltaPct,
      cvd: orderFlow.cvd,
      cvdTrend: orderFlow.cvdTrend,
      largeTradeCount: orderFlow.largeTradeCount,
      volumeAnomaly: orderFlow.volumeAnomaly,
    };
  }
  if (volumeProfile?.available) {
    base.volumeProfile = {
      available: true,
      poc: volumeProfile.poc,
      vah: volumeProfile.vah,
      val: volumeProfile.val,
    };
  }

  /* structure / sweep / fvg / ob / entry summary rows for the panel */
  base.structure = {
    label: structOk ? `${analysis.primary?.structure} ✓` : analysis.primary?.structure ?? "RANGE",
    ok: structOk,
  };
  base.sweep = {
    label: sweepOk
      ? `${sweep === "BULLISH" ? "Sell-side" : "Buy-side"} ✓`
      : sweep != null
        ? `${sweep === "BULLISH" ? "Buy-side" : "Sell-side"} swept`
        : "NONE",
    ok: sweepOk,
  };
  base.fvg = {
    label: fvgOk ? `${fvg?.direction} ✓` : fvg != null ? `${fvg.direction} ${fvg.mitigated ? "(mitigated)" : "(aged)"}` : "NONE",
    ok: fvgOk,
  };
  base.orderBlock = {
    label: obOk ? `${ob?.direction} ✓` : ob != null ? ob.direction : "NONE",
    ok: obOk,
  };
  base.entry = { label: quality, ok: entryOk };

  return base;
}

/* ------------------------------- lifecycle ------------------------------ */

function lifecycleFor(
  analysis: DeeeprTradeAnalysis,
  score: number,
  sweepOk: boolean,
  liquidityAvailable: boolean,
  gateOk: boolean,
): string {
  if (!gateOk) return "WATCH";
  if (analysis.decision === "INVALIDATED") return "INVALIDATED";
  if (analysis.decision === "NO TRADE") return "WATCH";
  if (score >= 85 && analysis.entry.quality === "OPTIMAL") return "ENTRY";
  if (score >= 85) return "A+";
  if (score >= 75) return "CONFLUENCE";
  if (sweepOk || (liquidityAvailable && analysis.primary?.liquidityStatus === "SWEPT")) return "SWEEP";
  if (analysis.primary?.liquidityStatus === "APPROACHED" || analysis.primary?.liquidityStatus === "SWEPT") return "LIQUIDITY DETECTED";
  if (score >= 50) return "SETUP FORMING";
  return "WATCH";
}

/* --------------------------- chart overlay shape ------------------------- */

export interface IqChartWall {
  price: number;
  side: "bid" | "ask";
  notional: number;
  strength: number;
  status: string;
  unstable: boolean;
}

export interface IqHeatLevel {
  price: number;
  side: "bid" | "ask";
  /** 0–1 normalized liquidity intensity at this level. */
  intensity: number;
}

export interface IqVolumeProfileLevel {
  price: number;
  kind: "POC" | "VAH" | "VAL" | "HVN" | "LVN";
  intensity: number;
}

export interface DeeeprIqChartOverlay {
  walls: IqChartWall[];
  heatmap: IqHeatLevel[];
  volumeProfile: IqVolumeProfileLevel[];
  pools: { support: number | null; resistance: number | null };
}

/**
 * Build the chart overlay from the raw engines. Every level is a REAL
 * observed price (order-book wall / POC / value area / swing level) — the
 * canvas renders exactly these, nothing else.
 */
export function toChartOverlay(
  liquidity: LiquidityAnalysis | null,
  volumeProfile: VolumeProfile | null,
): DeeeprIqChartOverlay {
  const walls: IqChartWall[] = [];
  const heatmap: IqHeatLevel[] = [];
  if (liquidity?.available) {
    for (const w of liquidity.walls) {
      if (w.status === "REMOVED" && Date.now() - w.lastSeen > 60_000) continue;
      walls.push({
        price: w.price,
        side: w.side,
        notional: w.notional,
        strength: w.strength,
        status: w.status,
        unstable: w.unstable,
      });
    }
    /* heatmap: every book level, normalized per side */
    const maxBid = Math.max(1e-9, ...liquidity.walls.map((w) => (w.side === "bid" ? w.size : 0)));
    const maxAsk = Math.max(1e-9, ...liquidity.walls.map((w) => (w.side === "ask" ? w.size : 0)));
    for (const w of liquidity.walls) {
      if (w.status === "REMOVED") continue;
      heatmap.push({
        price: w.price,
        side: w.side,
        intensity: Math.round(Math.min(1, w.size / (w.side === "bid" ? maxBid : maxAsk)) * 100) / 100,
      });
    }
  }

  const vp: IqVolumeProfileLevel[] = [];
  if (volumeProfile?.available) {
    const push = (price: number | null, kind: IqVolumeProfileLevel["kind"], intensity: number) => {
      if (price != null && Number.isFinite(price)) vp.push({ price, kind, intensity });
    };
    push(volumeProfile.poc, "POC", 1);
    push(volumeProfile.vah, "VAH", 0.85);
    push(volumeProfile.val, "VAL", 0.85);
    for (const p of volumeProfile.highVolumeNodes) push(p, "HVN", 0.5);
    for (const p of volumeProfile.lowVolumeNodes) push(p, "LVN", 0.25);
  }

  return {
    walls,
    heatmap,
    volumeProfile: vp,
    pools: {
      support: liquidity?.pools.nearestSupport ?? null,
      resistance: liquidity?.pools.nearestResistance ?? null,
    },
  };
}

export { fmtCompact as iqFmtCompact };
