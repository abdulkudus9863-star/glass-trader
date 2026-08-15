/* ============================================================================
   RADAR — the 4-lane market pipeline.

   Four independent analysis lanes (Technical, Flow, Narrative, Macro) each
   produce a verdict without echo-chamber overlap; a weighted confluence
   model merges them into a single score (0..100) with a setup grade.

   NO random data. Every lane is a pure function of the real inputs passed
   in via LiveContext:
     - Technical ← deterministic indicators over the live candle tape
     - Flow      ← real derivatives data (Binance futures OI / funding / L/S)
     - Narrative ← real news items with keyword sentiment
     - Macro     ← real DXY / gold / SPX quotes

   When the required input for a lane is missing, the lane is marked
   `available: false` and consumers must render DATA UNAVAILABLE instead of
   inventing values.
   ========================================================================== */

import type { LatestIndicators } from "./indicators";

export type LaneId = "T" | "F" | "N" | "M";
export type Verdict = "BULL" | "BEAR" | "NEUTRAL";
export type Tier = "HIGH" | "MID" | "LOW";
export type Grade = "A+" | "A" | "B" | "C" | "NO TRADE";

export interface LaneMetric {
  label: string;
  value: string;
  tone: "pos" | "neg" | "neu";
}

export interface LaneResult {
  lane: LaneId;
  name: string;
  tagline: string;
  verdict: Verdict;
  tier: Tier;
  score: number; // 0..100 (0 when unavailable)
  available: boolean;
  metrics: LaneMetric[];
  narrative: string;
}

export interface RadarResult {
  lanes: LaneResult[];
  confluence: {
    aligned: number; // lanes agreeing with the majority bias
    total: number;
    available: number;
    bias: Verdict;
    tier: Tier;
    grade: Grade;
    score: number; // weighted 0..100 over available lanes
    summary: string;
  };
  generatedAt: number;
}

/* ------------------------------ real inputs ------------------------------ */

export interface FlowData {
  /** Total open interest in base/quote (USD notional). */
  openInterest: number;
  /** % change vs the previous snapshot (null on first read). */
  openInterestChangePct: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  markPrice: number | null;
  source: string;
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  sentiment: "pos" | "neg" | "neu";
}

export interface MacroQuote {
  price: number;
  change24h: number | null;
}

export interface MacroData {
  dxy: MacroQuote | null;
  gold: MacroQuote | null;
  spx: MacroQuote | null;
}

export interface LiveContext {
  price: number;
  change24h: number;
  indicators: LatestIndicators | null;
  flow: FlowData | null;
  news: NewsItem[] | null;
  macro: MacroData | null;
}

/* ------------------------------- helpers -------------------------------- */

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function verdictFromScore(score: number): { verdict: Verdict; tier: Tier } {
  if (score >= 58) return { verdict: "BULL", tier: score >= 76 ? "HIGH" : "MID" };
  if (score <= 42) return { verdict: "BEAR", tier: score <= 24 ? "HIGH" : "MID" };
  return { verdict: "NEUTRAL", tier: "LOW" };
}

/** Keyword-based sentiment — deterministic, not AI, never fabricated. */
export function sentimentOf(title: string): "pos" | "neg" | "neu" {
  const t = title.toLowerCase();
  const pos = [
    "surge", "rally", "gain", "rise", "rises", "record", "high", "bull",
    "inflow", "adoption", "approval", "breakout", "soar", "jump", "boost",
  ];
  const neg = [
    "slump", "fall", "falls", "drop", "plunge", "crash", "bear", "outflow",
    "ban", "lawsuit", "fraud", "hack", "loses", "loss", "dip", "fear",
  ];
  let p = 0;
  let n = 0;
  for (const w of pos) if (t.includes(w)) p++;
  for (const w of neg) if (t.includes(w)) n++;
  if (p > n) return "pos";
  if (n > p) return "neg";
  return "neu";
}

/* -------------------------------- lanes --------------------------------- */

function technicalLane(live: LiveContext): LaneResult {
  const ind = live.indicators;
  const noData: LaneResult = {
    lane: "T",
    name: "Technical",
    tagline: "Price action & momentum",
    verdict: "NEUTRAL",
    tier: "LOW",
    score: 0,
    available: false,
    metrics: [
      { label: "Tape", value: "DATA UNAVAILABLE", tone: "neu" },
      { label: "Indicators", value: "No candle feed", tone: "neu" },
    ],
    narrative:
      "No candle feed is available, so the technical lane cannot score the tape.",
  };
  if (!ind || !Number.isFinite(live.price)) return noData;

  const rsi = ind.rsi14;
  const macdHist = ind.macdHistogram;
  const sma20 = ind.sma20;
  const sma50 = ind.sma50;
  const atr = ind.atr14;

  let score = 50;
  const reasons: string[] = [];

  /* RSI momentum — weighted by distance from 50 */
  if (rsi != null) {
    score += (rsi - 50) * 0.9;
    if (rsi > 62) reasons.push("overbought momentum");
    else if (rsi < 38) reasons.push("oversold momentum");
    else if (rsi > 55) reasons.push("bullish momentum");
    else if (rsi < 45) reasons.push("bearish momentum");
  }

  /* EMA 200 trend filter */
  if (ind.ema200 != null) {
    score += live.price > ind.ema200 ? 14 : -14;
    reasons.push(live.price > ind.ema200 ? "above EMA 200" : "below EMA 200");
  }

  /* MACD histogram direction */
  if (macdHist != null) {
    score += macdHist > 0 ? 10 : -10;
    reasons.push(macdHist > 0 ? "MACD histogram positive" : "MACD histogram negative");
  }

  /* SMA 20/50 structure */
  if (sma20 != null && sma50 != null) {
    score += sma20 > sma50 ? 6 : -6;
  }

  const finalScore = clamp(score, 4, 96);
  const { verdict, tier } = verdictFromScore(finalScore);

  return {
    lane: "T",
    name: "Technical",
    tagline: "Price action & momentum",
    verdict,
    tier,
    score: finalScore,
    available: true,
    metrics: [
      {
        label: "RSI 14",
        value: rsi != null ? rsi.toFixed(1) : "—",
        tone: rsi == null ? "neu" : rsi > 62 ? "neg" : rsi < 38 ? "pos" : rsi >= 50 ? "pos" : "neg",
      },
      {
        label: "EMA 200",
        value: ind.ema200 != null ? (live.price > ind.ema200 ? "Above" : "Below") : "—",
        tone: ind.ema200 == null ? "neu" : live.price > ind.ema200 ? "pos" : "neg",
      },
      {
        label: "MACD",
        value: macdHist == null ? "—" : macdHist > 0 ? "Hist +" : "Hist −",
        tone: macdHist == null ? "neu" : macdHist > 0 ? "pos" : "neg",
      },
      {
        label: "ATR 14",
        value:
          atr != null
            ? `${atr.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${((atr / live.price) * 100).toFixed(2)}%)`
            : "—",
        tone: "neu",
      },
    ],
    narrative:
      reasons.length > 0
        ? `Read: ${reasons.join(", ")}.`
        : "Not enough history for the indicator suite yet.",
  };
}

function flowLane(live: LiveContext): LaneResult {
  const f = live.flow;
  const noData: LaneResult = {
    lane: "F",
    name: "Flow",
    tagline: "Order-flow & positioning",
    verdict: "NEUTRAL",
    tier: "LOW",
    score: 0,
    available: false,
    metrics: [
      { label: "Open Interest", value: "DATA SOURCE UNAVAILABLE", tone: "neu" },
      { label: "Funding", value: "—", tone: "neu" },
      { label: "Long / Short", value: "—", tone: "neu" },
    ],
    narrative:
      "Derivatives data is only available for crypto pairs with a public futures feed. No feed is configured for this asset.",
  };
  if (!f) return noData;

  let score = 50;
  const reasons: string[] = [];

  /* OI delta — rising OI confirms participation, direction from funding */
  if (f.openInterestChangePct != null) {
    if (f.openInterestChangePct > 1.5) {
      score += f.fundingRate != null && f.fundingRate < 0 ? 10 : 4;
      reasons.push("open interest building");
    } else if (f.openInterestChangePct < -1.5) {
      score -= 6;
      reasons.push("open interest shrinking");
    }
  }

  /* Funding — heavily positive funding = crowded longs (bearish risk) */
  if (f.fundingRate != null) {
    const fr = f.fundingRate * 100;
    if (fr > 0.02) {
      score -= 12;
      reasons.push("crowded long funding");
    } else if (fr < -0.01) {
      score += 12;
      reasons.push("negative funding (short crowding)");
    }
  }

  /* Long/short account ratio */
  if (f.longShortRatio != null) {
    if (f.longShortRatio > 1.15) {
      score -= 8;
      reasons.push("longs crowded");
    } else if (f.longShortRatio < 0.85) {
      score += 8;
      reasons.push("shorts dominant");
    }
  }

  const finalScore = clamp(score, 4, 96);
  const { verdict, tier } = verdictFromScore(finalScore);

  return {
    lane: "F",
    name: "Flow",
    tagline: "Order-flow & positioning",
    verdict,
    tier,
    score: finalScore,
    available: true,
    metrics: [
      {
        label: "Open Interest",
        value: `${f.openInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${f.openInterestChangePct != null ? `(${f.openInterestChangePct >= 0 ? "+" : ""}${f.openInterestChangePct.toFixed(2)}%)` : ""}`,
        tone: f.openInterestChangePct == null ? "neu" : f.openInterestChangePct > 1.5 ? "pos" : f.openInterestChangePct < -1.5 ? "neg" : "neu",
      },
      {
        label: "Funding",
        value: f.fundingRate != null ? `${(f.fundingRate * 100).toFixed(4)}%` : "—",
        tone: f.fundingRate == null ? "neu" : f.fundingRate > 0.02 ? "neg" : f.fundingRate < -0.01 ? "pos" : "neu",
      },
      {
        label: "Long / Short",
        value: f.longShortRatio != null ? `${f.longShortRatio.toFixed(2)} : 1` : "—",
        tone: f.longShortRatio == null ? "neu" : f.longShortRatio > 1.15 ? "neg" : f.longShortRatio < 0.85 ? "pos" : "neu",
      },
    ],
    narrative:
      reasons.length > 0
        ? `Read: ${reasons.join(", ")}. Source: ${f.source}.`
        : "Derivatives positioning is balanced — no crowd to fade yet.",
  };
}

function narrativeLane(live: LiveContext): LaneResult {
  const items = live.news;
  const noData: LaneResult = {
    lane: "N",
    name: "Narrative",
    tagline: "Headlines & sentiment",
    verdict: "NEUTRAL",
    tier: "LOW",
    score: 0,
    available: false,
    metrics: [
      { label: "Headlines", value: "Narrative data unavailable", tone: "neu" },
    ],
    narrative: "No news feed is currently returning articles for this market.",
  };
  if (!items || items.length === 0) return noData;

  let pos = 0;
  let neg = 0;
  for (const n of items) {
    if (n.sentiment === "pos") pos++;
    else if (n.sentiment === "neg") neg++;
  }
  const total = items.length;
  const score = clamp(50 + ((pos - neg) / total) * 42, 8, 92);
  const { verdict, tier } = verdictFromScore(score);

  return {
    lane: "N",
    name: "Narrative",
    tagline: "Headlines & sentiment",
    verdict,
    tier,
    score,
    available: true,
    metrics: [
      {
        label: "Headlines",
        value: `${total} articles · ${pos} pos / ${neg} neg`,
        tone: pos > neg ? "pos" : neg > pos ? "neg" : "neu",
      },
      {
        label: "Top Story",
        value: items[0]?.title.slice(0, 52) ?? "—",
        tone: items[0]?.sentiment ?? "neu",
      },
    ],
    narrative:
      verdict === "BULL"
        ? "Recent headlines skew constructive — institutional and macro flows are being framed positively."
        : verdict === "BEAR"
          ? "Recent headlines skew cautious — negative framing is dominating the tape."
          : "Headline sentiment is mixed; no single story is driving allocation.",
  };
}

function macroLane(live: LiveContext): LaneResult {
  const m = live.macro;
  const noData: LaneResult = {
    lane: "M",
    name: "Macro",
    tagline: "DXY, gold & risk appetite",
    verdict: "NEUTRAL",
    tier: "LOW",
    score: 0,
    available: false,
    metrics: [
      { label: "DXY", value: "DATA SOURCE UNAVAILABLE", tone: "neu" },
      { label: "Gold", value: "—", tone: "neu" },
      { label: "S&P 500", value: "—", tone: "neu" },
    ],
    narrative:
      "Macro quotes (DXY / gold / S&P 500) need a live provider for this region — none is configured.",
  };
  if (!m || (m.dxy == null && m.gold == null && m.spx == null)) return noData;

  let score = 50;
  const reasons: string[] = [];

  /* DXY — a falling dollar is a tailwind for risk & metals */
  if (m.dxy?.change24h != null) {
    score += m.dxy.change24h < -0.15 ? 14 : m.dxy.change24h > 0.15 ? -14 : 0;
    reasons.push(m.dxy.change24h < -0.15 ? "dollar soft" : m.dxy.change24h > 0.15 ? "dollar firm" : "dollar flat");
  } else if (m.dxy) {
    score += m.dxy.price > 0 ? 0 : 0; // price-only, no bias
  }

  /* Gold — haven strength often coincides with risk-off; treat as neutral
     macro signal with a small tilt */
  if (m.gold?.change24h != null) {
    score += m.gold.change24h > 0.5 ? 4 : m.gold.change24h < -0.5 ? -4 : 0;
    reasons.push(`gold ${m.gold.change24h >= 0 ? "up" : "down"} 24h`);
  }

  /* S&P 500 — broad risk appetite */
  if (m.spx?.change24h != null) {
    score += m.spx.change24h > 0.3 ? 12 : m.spx.change24h < -0.3 ? -12 : 0;
    reasons.push(m.spx.change24h > 0.3 ? "equities risk-on" : m.spx.change24h < -0.3 ? "equities risk-off" : "equities flat");
  }

  const finalScore = clamp(score, 4, 96);
  const { verdict, tier } = verdictFromScore(finalScore);

  const quote = (q: MacroQuote | null, decimals: number) =>
    q == null
      ? "—"
      : `${q.price.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${q.change24h != null ? ` (${q.change24h >= 0 ? "+" : ""}${q.change24h.toFixed(2)}%)` : ""}`;

  return {
    lane: "M",
    name: "Macro",
    tagline: "DXY, gold & risk appetite",
    verdict,
    tier,
    score: finalScore,
    available: true,
    metrics: [
      { label: "DXY", value: quote(m.dxy, 2), tone: m.dxy?.change24h == null ? "neu" : m.dxy.change24h < -0.15 ? "pos" : m.dxy.change24h > 0.15 ? "neg" : "neu" },
      { label: "Gold", value: quote(m.gold, 2), tone: m.gold?.change24h == null ? "neu" : m.gold.change24h < -0.5 ? "neg" : "pos" },
      { label: "S&P 500", value: quote(m.spx, 2), tone: m.spx?.change24h == null ? "neu" : m.spx.change24h < -0.3 ? "neg" : "pos" },
    ],
    narrative:
      reasons.length > 0
        ? `Read: ${reasons.join(", ")}.`
        : "Macro quotes are live but flat — no directional cross-current today.",
  };
}

/* ------------------------------ confluence ------------------------------ */

export function gradeFor(score: number): Grade {
  if (score >= 85) return "A+";
  if (score >= 72) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "NO TRADE";
}

const WEIGHTS: Record<LaneId, number> = { T: 0.32, F: 0.26, N: 0.16, M: 0.26 };

export function analyzeLanes(
  symbolId: string,
  timeframe: string,
  _seedOffset = 0,
  live: LiveContext | null = null,
): RadarResult {
  const ctx = live ?? {
    price: 0,
    change24h: 0,
    indicators: null,
    flow: null,
    news: null,
    macro: null,
  };

  const lanes: LaneResult[] = [
    technicalLane(ctx),
    flowLane(ctx),
    narrativeLane(ctx),
    macroLane(ctx),
  ];

  const available = lanes.filter((l) => l.available);
  const bullCount = lanes.filter((l) => l.verdict === "BULL").length;
  const bearCount = lanes.filter((l) => l.verdict === "BEAR").length;
  const bias: Verdict = bullCount >= bearCount ? "BULL" : "BEAR";
  const aligned = Math.max(bullCount, bearCount);
  const tier: Tier = aligned >= 3 ? "HIGH" : aligned === 2 ? "MID" : "LOW";

  /* Weighted confluence over available lanes — missing lanes don't drag the
     score, they just don't vote. */
  let weighted = 0;
  let weightSum = 0;
  for (const l of lanes) {
    if (!l.available) continue;
    weighted += WEIGHTS[l.lane] * l.score;
    weightSum += WEIGHTS[l.lane];
  }
  const score = weightSum > 0 ? Math.round(weighted / weightSum) : 0;
  const grade = gradeFor(score);

  const summary =
    available.length === 0
      ? "No data feeds are available — every lane is showing DATA UNAVAILABLE. Configure live providers to unlock the radar."
      : score >= 72
        ? `${available.length}/${lanes.length} lanes reporting, ${aligned} aligned ${bias} — weighted confluence ${score}/100 (${grade}).`
        : score >= 50
          ? `${available.length}/${lanes.length} lanes reporting, ${aligned} aligned ${bias} — confluence ${score}/100 (${grade}); confirm on the chart.`
          : `Confluence ${score}/100 (${grade}) — conflicting or weak signals across lanes. Stand aside.`;

  return {
    lanes,
    confluence: {
      aligned,
      total: lanes.length,
      available: available.length,
      bias,
      tier,
      grade,
      score,
      summary,
    },
    generatedAt: Date.now(),
  };
}
