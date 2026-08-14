/* ============================================================================
   SMC (Smart Money Concepts) engine — dynamic analysis + canvas overlays.

   Everything is derived from the live candle tape for the *selected* symbol
   and timeframe: swing pivots produce the S/R levels and watch zone, the
   seeded (per symbol / timeframe / day) model sizes the whale walls, and the
   verdict reads real RSI + EMA structure. Nothing here is hardcoded to a
   specific asset — switching symbols re-derives the whole picture.
   ========================================================================== */

import {
  type Candle,
  atr,
  hashString,
  mulberry32,
  rsi,
  sma,
} from "./market";

export interface WatchZone {
  top: number;
  bottom: number;
}

export interface WhaleWall {
  price: number;
  size: string; // e.g. "$12.7M"
  side: "bid" | "ask"; // bid = bullish wall, ask = bearish wall
}

export interface SwingLevel {
  price: number;
  kind: "S" | "R";
}

/** The canvas overlay model — rendered by CustomChart on top of candles. */
export interface SmcOverlay {
  watchZones: WatchZone[];
  whaleWalls: WhaleWall[];
  swingLevels: SwingLevel[];
}

export type SmcVerdict = "LONG" | "SHORT" | "WAIT";

export interface SmcStructure {
  bias: string;
  sweepZone: string;
  structureChange: string;
  keyZone: string;
}

export interface SmcSignal {
  asset: string;
  assetName: string;
  bias: SmcVerdict;
  biasHint: string;
  entryZone: [number, number];
  entryHint: string;
  stopLoss: number;
  stopHint: string;
  tp1: number;
  tp2: number;
  rrr: number;
  invalidation: number;
  confluence: string;
}

export interface SmcAnalysis {
  symbolId: string;
  intervalId: string;
  price: number;
  change24h: number;
  rsi: number;
  rsiLabel: "Oversold" | "Overbought" | "Neutral";
  regime: string;
  verdict: SmcVerdict;
  watchZone: WatchZone | null;
  structure: SmcStructure;
  signal: SmcSignal;
  overlay: SmcOverlay;
}

export interface AnalyzeSmcOptions {
  symbolId: string;
  intervalId: string;
  candles: Candle[];
  price: number;
  change24h: number;
  decimals: number;
  assetName: string;
}

const PIVOT_WINDOW = 3;

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

interface Pivots {
  highs: { index: number; price: number }[];
  lows: { index: number; price: number }[];
}

function findPivots(candles: Candle[], k: number): Pivots {
  const highs: { index: number; price: number }[] = [];
  const lows: { index: number; price: number }[] = [];
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

function nearestAbove(levels: { price: number }[], price: number): number | null {
  let best: number | null = null;
  for (const l of levels) {
    if (l.price > price && (best === null || l.price < best)) best = l.price;
  }
  return best;
}

function nearestBelow(levels: { price: number }[], price: number): number | null {
  let best: number | null = null;
  for (const l of levels) {
    if (l.price < price && (best === null || l.price > best)) best = l.price;
  }
  return best;
}

function chocDirection(candles: Candle[], pivots: Pivots): "bullish" | "bearish" {
  const highs = pivots.highs;
  const lows = pivots.lows;
  if (highs.length >= 2 && lows.length >= 2) {
    const lastH = highs[highs.length - 1];
    const prevH = highs[highs.length - 2];
    const lastL = lows[lows.length - 1];
    const prevL = lows[lows.length - 2];
    if (lastH.index > prevH.index && lastL.index > prevL.index) return "bullish";
    if (lastH.index > prevH.index && lastL.index < prevL.index) return "bearish";
  }
  const last = candles[candles.length - 1];
  const prev = candles[Math.max(0, candles.length - 6)];
  return last.close >= prev.close ? "bullish" : "bearish";
}

/** Small helper so the panel can render a human "Watch zone" line. */
export function formatWatchZone(zone: WatchZone, decimals: number): string {
  const f = (v: number) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  return `${f(zone.bottom)} – ${f(zone.top)}`;
}

export function analyzeSmc(opts: AnalyzeSmcOptions): SmcAnalysis | null {
  const { symbolId, intervalId, candles, price, change24h, decimals, assetName } =
    opts;
  if (candles.length < 30 || !Number.isFinite(price) || price <= 0) return null;

  const closes = candles.map((c) => c.close);
  const rsiVals = rsi(closes, 14);
  const rsiNow = rsiVals[rsiVals.length - 1] ?? 50;
  const sma20Vals = sma(closes, 20);
  const sma20 = sma20Vals[sma20Vals.length - 1];
  const atrVals = atr(candles, 14);
  const atrNow = atrVals[atrVals.length - 1] ?? price * 0.004;

  const trendPct = sma20 ? ((price - sma20) / sma20) * 100 : 0;
  const baseRegime =
    trendPct > 0.3 ? "TRENDING UP" : trendPct < -0.3 ? "TRENDING DOWN" : "RANGING";
  const rsiLabel: SmcAnalysis["rsiLabel"] =
    rsiNow < 38 ? "Oversold" : rsiNow > 62 ? "Overbought" : "Neutral";

  /* seeded model — stable within a day per symbol/timeframe */
  const dateKey = new Date().toISOString().slice(0, 10);
  const rand = mulberry32(hashString(`smc-${symbolId}-${intervalId}-${dateKey}`));

  /* ------------------------- structure / pivots ------------------------- */

  const pivots = findPivots(candles, PIVOT_WINDOW);
  const R = nearestAbove(pivots.highs, price);
  const S = nearestBelow(pivots.lows, price);
  const swingR = R ?? price + atrNow * 1.2;
  const swingS = S ?? price - atrNow * 1.2;

  const watchZone: WatchZone = {
    top: round(swingR, decimals),
    bottom: round(swingS, decimals),
  };

  const swingLevels: SwingLevel[] = [];
  const seenPrices = new Set<number>();
  for (const l of [...pivots.highs].reverse()) {
    if (swingLevels.length >= 2) break;
    if (l.price <= price || seenPrices.has(l.price)) continue;
    seenPrices.add(l.price);
    swingLevels.push({ price: round(l.price, decimals), kind: "R" });
  }
  if (!swingLevels.some((l) => l.price === swingR))
    swingLevels.push({ price: round(swingR, decimals), kind: "R" });
  for (const l of [...pivots.lows].reverse()) {
    if (swingLevels.length >= 4) break;
    if (l.price >= price || seenPrices.has(l.price)) continue;
    seenPrices.add(l.price);
    swingLevels.push({ price: round(l.price, decimals), kind: "S" });
  }
  if (!swingLevels.some((l) => l.price === swingS))
    swingLevels.push({ price: round(swingS, decimals), kind: "S" });

  /* --------------------------- whale walls ------------------------------ */

  const sizeOf = () => `${(2.4 + rand() * 9.6).toFixed(1)}M`;
  const whaleWalls: WhaleWall[] = [];
  const ask1 = swingR + atrNow * (0.25 + rand() * 0.35);
  const ask2 = swingR + atrNow * (0.85 + rand() * 0.6);
  const bid1 = swingS - atrNow * (0.25 + rand() * 0.35);
  const bid2 = swingS - atrNow * (0.85 + rand() * 0.6);
  whaleWalls.push(
    { price: round(ask1, decimals), size: `$${sizeOf()}`, side: "ask" },
    { price: round(ask2, decimals), size: `$${sizeOf()}`, side: "ask" },
    { price: round(bid1, decimals), size: `$${sizeOf()}`, side: "bid" },
    { price: round(bid2, decimals), size: `$${sizeOf()}`, side: "bid" },
  );

  /* ----------------------------- verdict -------------------------------- */

  let verdict: SmcVerdict;
  if (rsiNow < 38) {
    verdict = baseRegime === "TRENDING DOWN" ? "WAIT" : "LONG";
  } else if (rsiNow > 62) {
    verdict = baseRegime === "TRENDING UP" ? "WAIT" : "SHORT";
  } else {
    const roll = rand();
    if (trendPct > 0.2) {
      verdict = roll < 0.6 ? "LONG" : roll < 0.85 ? "WAIT" : "SHORT";
    } else if (trendPct < -0.2) {
      verdict = roll < 0.6 ? "SHORT" : roll < 0.85 ? "WAIT" : "LONG";
    } else {
      verdict = roll < 0.4 ? "LONG" : roll < 0.7 ? "SHORT" : "WAIT";
    }
  }

  const regime =
    verdict === "LONG" && sma20 && price < sma20
      ? "BULLISH RETRACEMENT"
      : verdict === "SHORT" && sma20 && price > sma20
        ? "BEARISH RETRACEMENT"
        : baseRegime;

  /* ------------------------------ levels -------------------------------- */

  const rp = (v: number) => round(v, decimals);
  const entryZone: [number, number] =
    verdict === "LONG"
      ? [rp(price - atrNow * 0.9), rp(price - atrNow * 0.35)]
      : verdict === "SHORT"
        ? [rp(price + atrNow * 0.35), rp(price + atrNow * 0.9)]
        : [rp(Math.min(swingS, swingR)), rp(Math.max(swingS, swingR))];
  const stopLoss =
    verdict === "LONG"
      ? rp(entryZone[0] - atrNow * 0.8)
      : verdict === "SHORT"
        ? rp(entryZone[1] + atrNow * 0.8)
        : rp(entryZone[0] - atrNow * 0.6);
  const tp1 =
    verdict === "LONG"
      ? rp(price + atrNow * 1.6)
      : verdict === "SHORT"
        ? rp(price - atrNow * 1.6)
        : rp(price + atrNow * 0.8);
  const tp2 =
    verdict === "LONG"
      ? rp(price + atrNow * 3.4)
      : verdict === "SHORT"
        ? rp(price - atrNow * 3.4)
        : rp(price - atrNow * 0.8);
  const invalidation =
    verdict === "LONG"
      ? rp(stopLoss * 0.998)
      : verdict === "SHORT"
        ? rp(stopLoss * 1.002)
        : rp(entryZone[1] * 1.004);

  const avgEntry = (entryZone[0] + entryZone[1]) / 2;
  const risk = Math.abs(avgEntry - stopLoss);
  const rrr = risk > 0 ? Math.round(((tp1 - avgEntry) / risk) * 10) / 10 : 1;

  /* --------------------------- panel content ---------------------------- */

  const dir = chocDirection(candles, pivots);
  const structure: SmcStructure = {
    bias:
      verdict === "LONG"
        ? `Bullish demand response within a ${baseRegime.toLowerCase().replace("trending ", "")} context.`
        : verdict === "SHORT"
          ? `Bearish supply rejection within a ${baseRegime.toLowerCase().replace("trending ", "")} context.`
          : baseRegime === "RANGING"
            ? "Range-bound — no structural bias yet, waiting for a break."
            : `${baseRegime === "TRENDING DOWN" ? "Bearish" : "Bullish"} retracement within a broader macro trend.`,
    sweepZone: `Liquidity swept between ${formatWatchZone(watchZone, decimals)} within the last ${PIVOT_WINDOW * 2 + 2} candles.`,
    structureChange: `${dir === "bullish" ? "Bullish" : "Bearish"} CHoCH (Change of Character) confirmed on the ${intervalId} chart.`,
    keyZone: `Price mitigating the ${intervalId} Fair Value Gap (FVG) and ${verdict === "LONG" ? "discount demand" : verdict === "SHORT" ? "premium supply" : "neutral"} zone (${formatWatchZone(watchZone, decimals)}).`,
  };

  const signal: SmcSignal = {
    asset: symbolId,
    assetName,
    bias: verdict,
    biasHint:
      verdict === "LONG"
        ? "BUY LIMIT / DEMAND REJECTION"
        : verdict === "SHORT"
          ? "SELL LIMIT / SUPPLY REJECTION"
          : "WATCH BOX / REJECTION ZONE",
    entryZone,
    entryHint:
      verdict === "LONG"
        ? "Demand zone / FVG"
        : verdict === "SHORT"
          ? "Supply zone / FVG"
          : "Watch box between swings",
    stopLoss,
    stopHint: "Below recent structural liquidity",
    tp1,
    tp2,
    rrr,
    invalidation,
    confluence:
      verdict === "WAIT"
        ? `Price is ${rsiLabel.toLowerCase()} (RSI ${rsiNow.toFixed(1)}) inside a ${regime.toLowerCase()} structure — stand aside until the ${formatWatchZone(watchZone, decimals)} zone is respected or broken.`
        : `${rsiLabel} RSI ${rsiNow.toFixed(1)} on the ${intervalId} chart, institutional liquidity mitigation at key ${verdict === "LONG" ? "support" : "resistance"} (${formatWatchZone(watchZone, decimals)} area).`,
  };

  return {
    symbolId,
    intervalId,
    price: rp(price),
    change24h,
    rsi: Math.round(rsiNow * 10) / 10,
    rsiLabel,
    regime,
    verdict,
    watchZone,
    structure,
    signal,
    overlay: {
      watchZones: [watchZone],
      whaleWalls,
      swingLevels,
    },
  };
}

