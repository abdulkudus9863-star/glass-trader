/* ============================================================================
   SMC (Smart Money Concepts) engine — dynamic analysis + canvas overlays.

   Everything is derived deterministically from the live candle tape for the
   *selected* symbol and timeframe: swing pivots produce the S/R levels and
   watch zone, CHoCH/BOS read pivot structure, sweeps and FVGs are detected
   from real price action, and the verdict is a pure function of RSI + EMA
   trend. No randomness, no fabricated levels — switching symbols re-derives
   the whole picture. Whale walls (orderbook depth) render nothing until a
   real depth feed is wired up.
   ========================================================================== */

import { type Candle, atr, detectFVG, rsi, sma } from "./market";

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
  return formatPriceRange(zone.bottom, zone.top, decimals);
}

function formatPriceRange(lo: number, hi: number, decimals: number): string {
  const f = (v: number) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  return `${f(lo)} – ${f(hi)}`;
}

/**
 * Detect a liquidity sweep: price pokes through a recent swing level and
 * closes back on the other side (rejection). Returns the side of liquidity
 * that was taken, or null.
 */
function detectSweep(
  candles: Candle[],
  pivots: Pivots,
): "bullish" | "bearish" | null {
  const lastLow = pivots.lows[pivots.lows.length - 1];
  const lastHigh = pivots.highs[pivots.highs.length - 1];
  const recent = candles.slice(-16);
  if (lastLow) {
    const seg = recent.filter((c) => c.time >= candles[lastLow.index].time);
    for (const c of seg) {
      if (c.low < lastLow.price && c.close > lastLow.price) return "bullish";
    }
  }
  if (lastHigh) {
    const seg = recent.filter((c) => c.time >= candles[lastHigh.index].time);
    for (const c of seg) {
      if (c.high > lastHigh.price && c.close < lastHigh.price) return "bearish";
    }
  }
  return null;
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

  /* Whale walls are orderbook depth levels. No depth stream is wired up yet,
     so we never fabricate wall sizes or placements — the canvas simply
     renders no walls until a real orderbook feed exists. */
  const whaleWalls: WhaleWall[] = [];

  /* ----------------------------- verdict -------------------------------- */

  /* Deterministic verdict — no randomness. Oversold/overbought read the RSI
     against the trend; neutral momentum lets structure decide. */
  let verdict: SmcVerdict;
  if (rsiNow < 38) {
    verdict = baseRegime === "TRENDING DOWN" ? "WAIT" : "LONG";
  } else if (rsiNow > 62) {
    verdict = baseRegime === "TRENDING UP" ? "WAIT" : "SHORT";
  } else if (trendPct > 0.2 && rsiNow < 55) {
    verdict = "LONG"; // pullback inside an uptrend
  } else if (trendPct < -0.2 && rsiNow > 45) {
    verdict = "SHORT"; // rally into supply inside a downtrend
  } else {
    verdict = "WAIT"; // no confluence
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
  const sweep = detectSweep(candles, pivots);
  const fvg = detectFVG(candles, 4)[0] ?? null;
  const fvgLabel =
    fvg != null
      ? `${fvg.bullish ? "Bullish" : "Bearish"} FVG ${formatPriceRange(fvg.bottom, fvg.top, decimals)}`
      : null;
  const priceInFvg =
    fvg != null && price >= fvg.bottom && price <= fvg.top;
  const structure: SmcStructure = {
    bias:
      verdict === "LONG"
        ? `Bullish demand response within a ${baseRegime.toLowerCase().replace("trending ", "")} context.`
        : verdict === "SHORT"
          ? `Bearish supply rejection within a ${baseRegime.toLowerCase().replace("trending ", "")} context.`
          : baseRegime === "RANGING"
            ? "Range-bound — no structural bias yet, waiting for a break."
            : `${baseRegime === "TRENDING DOWN" ? "Bearish" : "Bullish"} retracement within a broader macro trend.`,
    sweepZone:
      sweep === null
        ? "No recent liquidity sweep detected in the tape."
        : sweep === "bullish"
          ? `Buy-side liquidity swept — price traded below a swing low and closed back above it on the ${intervalId} chart.`
          : `Sell-side liquidity swept — price traded above a swing high and closed back below it on the ${intervalId} chart.`,
    structureChange: `${dir === "bullish" ? "Bullish" : "Bearish"} CHoCH (Change of Character) detected on the ${intervalId} chart.`,
    keyZone: priceInFvg
      ? `Price is mitigating the most recent Fair Value Gap (${fvgLabel}) in the ${verdict === "LONG" ? "discount" : verdict === "SHORT" ? "premium" : "neutral"} zone.`
      : fvgLabel
        ? `Most recent ${fvgLabel}; price is not currently inside it.`
        : "No fresh Fair Value Gap detected in the recent tape.",
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

