/* ============================================================================
   RADAR — the 4-lane market pipeline.
   Four independent analysis lanes (Technical, Flow, Narrative, Macro) each
   produce a verdict without echo-chamber overlap; a confluence summary scores
   how many lanes agree. Deterministic per symbol/timeframe/seed so the output
   is stable but re-runnable.
   ========================================================================== */

import { gaussian, hashString, mulberry32 } from "./market";

export type LaneId = "T" | "F" | "N" | "M";
export type Verdict = "BULL" | "BEAR" | "NEUTRAL";
export type Tier = "HIGH" | "MID" | "LOW";

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
  score: number; // 0..100
  metrics: LaneMetric[];
  narrative: string;
}

export interface RadarResult {
  lanes: LaneResult[];
  confluence: {
    aligned: number; // lanes agreeing with the majority bias
    total: number;
    bias: Verdict;
    tier: Tier;
    summary: string;
  };
  generatedAt: number;
}

/** Optional live tape context — when present, the Technical lane reads real
 *  price action instead of the seeded model. */
export interface LiveContext {
  price: number;
  change24h: number;
  rsi: number | null;
  ema200: number | null;
}

const pick = <T,>(rand: () => number, arr: T[]): T =>
  arr[Math.floor(rand() * arr.length)];

function verdictFromScore(score: number): { verdict: Verdict; tier: Tier } {
  if (score >= 62) return { verdict: "BULL", tier: score >= 78 ? "HIGH" : "MID" };
  if (score <= 38) return { verdict: "BEAR", tier: score <= 22 ? "HIGH" : "MID" };
  return { verdict: "NEUTRAL", tier: "LOW" };
}

/* ------------------------------ lanes ------------------------------ */

function technicalLane(rand: () => number, live: LiveContext | null = null): LaneResult {
  const rsiVal = live?.rsi != null ? Math.max(1, Math.min(99, live.rsi)) : 28 + rand() * 46; // 28..74
  const emaBull =
    live?.ema200 != null ? live.price > live.ema200 : rand() > 0.5;
  const macdPos = rand() > 0.45;
  const score = Math.round(
    (rsiVal < 40 ? 78 : rsiVal > 62 ? 22 : 50) + (emaBull ? 8 : -8) + (macdPos ? 6 : -6),
  );
  const { verdict, tier } = verdictFromScore(score);
  return {
    lane: "T",
    name: "Technical",
    tagline: "Price action & momentum",
    verdict,
    tier,
    score: Math.max(4, Math.min(96, score)),
    metrics: [
      {
        label: "EMA 200",
        value: live?.ema200 != null
          ? `${emaBull ? "Above" : "Below"} EMA200 ${live.ema200.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
          : emaBull ? "Above EMA200" : "Below EMA200",
        tone: emaBull ? "pos" : "neg",
      },
      { label: "RSI 14", value: rsiVal.toFixed(1), tone: rsiVal < 40 ? "pos" : rsiVal > 62 ? "neg" : "neu" },
      { label: "MACD", value: macdPos ? "Histogram > 0" : "Histogram < 0", tone: macdPos ? "pos" : "neg" },
    ],
    narrative:
      verdict === "BULL"
        ? "Momentum is aligned — pullbacks into the fast EMAs are being bought."
        : verdict === "BEAR"
          ? "Structure is rolling over — rallies into resistance are being sold."
          : "Range-bound tape; momentum is not yet committed to a direction.",
  };
}

function flowLane(rand: () => number): LaneResult {
  const oi = (rand() - 0.5) * 12; // OI % change
  const funding = (rand() - 0.42) * 0.06; // funding rate
  const longRatio = 0.4 + rand() * 0.32;
  const score = Math.round(
    (oi > 1.5 ? 72 : oi < -1.5 ? 30 : 50) + (funding < 0 ? 10 : funding > 0.02 ? -10 : 0),
  );
  const { verdict, tier } = verdictFromScore(score);
  return {
    lane: "F",
    name: "Flow",
    tagline: "Order-flow & positioning",
    verdict,
    tier,
    score: Math.max(4, Math.min(96, score)),
    metrics: [
      { label: "Open Interest", value: `${oi >= 0 ? "+" : ""}${oi.toFixed(2)}%`, tone: oi > 1.5 ? "pos" : oi < -1.5 ? "neg" : "neu" },
      { label: "Funding", value: `${(funding * 100).toFixed(3)}%`, tone: funding < 0 ? "pos" : "neu" },
      { label: "Long / Short", value: `${(longRatio * 100).toFixed(0)} / ${(100 - longRatio * 100).toFixed(0)}`, tone: "neu" },
    ],
    narrative:
      verdict === "BULL"
        ? "Positioning is building long-side — OI rising with price confirms participation."
        : verdict === "BEAR"
          ? "Leveraged longs are crowding — funding is elevated and vulnerable to squeezes."
          : "Flow is balanced; neither side is pressing into size yet.",
  };
}

function narrativeLane(rand: () => number): LaneResult {
  const etf = pick(rand, ["Net inflow +$184M", "Net inflow +$92M", "Net outflow −$57M", "Flat"]);
  const fed = pick(rand, ["Dovish cut signals", "Hawkish hold", "Data-dependent stance"]);
  const headlines = pick(rand, [
    "ETF accumulation accelerating",
    "Macro headlines supportive for risk",
    "Cautious tone across the tape",
    "Bid-side news flow dominant",
  ]);
  const score = Math.round(
    (etf.startsWith("Net inflow") ? 20 : etf.startsWith("Net outflow") ? -16 : 0) +
      (fed.startsWith("Dovish") ? 12 : fed.startsWith("Hawkish") ? -12 : 0) +
      rand() * 12,
  );
  const { verdict, tier } = verdictFromScore(score + 50);
  return {
    lane: "N",
    name: "Narrative",
    tagline: "ETF flows & headlines",
    verdict,
    tier,
    score: Math.max(4, Math.min(96, Math.round(50 + score))),
    metrics: [
      { label: "ETF Net Flows", value: etf, tone: etf.startsWith("Net inflow") ? "pos" : etf.startsWith("Net outflow") ? "neg" : "neu" },
      { label: "Fed Signals", value: fed, tone: fed.startsWith("Dovish") ? "pos" : fed.startsWith("Hawkish") ? "neg" : "neu" },
      { label: "Headline Tone", value: headlines, tone: "neu" },
    ],
    narrative:
      verdict === "BULL"
        ? "Institutional money is rotating in — flows and headlines are compounding demand."
        : verdict === "BEAR"
          ? "The narrative is turning defensive — flows are retreating, not accumulating."
          : "News flow is mixed; no single story is driving allocation yet.",
  };
}

function macroLane(rand: () => number): LaneResult {
  const dxy = (rand() - 0.52) * 2.2; // DXY % move
  const gold = 0.4 + rand() * 1.6; // gold strength
  const risk = rand();
  const score = Math.round(
    (dxy < -0.3 ? 18 : dxy > 0.3 ? -14 : 2) + (gold > 1.2 ? 12 : 0) + (risk > 0.6 ? 12 : 0),
  );
  const { verdict, tier } = verdictFromScore(score + 50);
  return {
    lane: "M",
    name: "Macro",
    tagline: "DXY, gold & risk appetite",
    verdict,
    tier,
    score: Math.max(4, Math.min(96, Math.round(50 + score))),
    metrics: [
      { label: "DXY", value: `${dxy >= 0 ? "+" : ""}${dxy.toFixed(2)}%`, tone: dxy < -0.3 ? "pos" : dxy > 0.3 ? "neg" : "neu" },
      { label: "Gold Trend", value: `+${gold.toFixed(2)}%`, tone: gold > 1.2 ? "pos" : "neu" },
      { label: "Risk Sentiment", value: risk > 0.6 ? "Risk-on" : risk < 0.35 ? "Risk-off" : "Mixed", tone: risk > 0.6 ? "pos" : risk < 0.35 ? "neg" : "neu" },
    ],
    narrative:
      verdict === "BULL"
        ? "Dollar softness plus haven demand is a tailwind — risk appetite is broadening."
        : verdict === "BEAR"
          ? "The dollar is firm and risk appetite is contracting — headwinds for upside."
          : "Macro cross-currents are balanced; the dollar is not yet a trend factor.",
  };
}

/* --------------------------- entry point --------------------------- */

const GLOBAL_HEADLINES = [
  "US NFP data cooling down interest rate expectations",
  "Middle East geopolitics maintaining long-term haven demand for Gold",
  "Central bank rhetoric leaning accommodative this week",
  "Institutional desks rotating from cash into crypto ETPs",
];

export function analyzeLanes(
  symbolId: string,
  timeframe: string,
  seedOffset = 0,
  live: LiveContext | null = null,
): RadarResult {
  const rand = mulberry32(hashString(`radar-${symbolId}-${timeframe}-${seedOffset}`));
  const lanes = [
    technicalLane(rand, live),
    flowLane(rand),
    narrativeLane(rand),
    macroLane(rand),
  ];

  /* Confluence: count lanes agreeing with the majority verdict. */
  const bullCount = lanes.filter((l) => l.verdict === "BULL").length;
  const bearCount = lanes.filter((l) => l.verdict === "BEAR").length;
  const bias: Verdict = bullCount >= bearCount ? "BULL" : "BEAR";
  const aligned = Math.max(bullCount, bearCount);
  const tier: Tier = aligned >= 3 ? "HIGH" : aligned === 2 ? "MID" : "LOW";

  const summary =
    aligned >= 3
      ? `${aligned}/${lanes.length} lanes aligned ${bias} — a high-conviction setup across independent lenses.`
      : aligned === 2
        ? `${aligned}/${lanes.length} lanes aligned ${bias} — a tradable lean, but confirm on the chart first.`
        : `Mixed tape — ${lanes.length - aligned}/${lanes.length} lanes disagree. Stand aside or wait for alignment.`;

  return {
    lanes,
    confluence: { aligned, total: lanes.length, bias, tier, summary },
    generatedAt: Date.now(),
  };
}

export function headlines(seedOffset = 0): string[] {
  const rand = mulberry32(hashString(`news-${seedOffset}`));
  const shuffled = [...GLOBAL_HEADLINES].sort(() => rand() - 0.5);
  return shuffled.slice(0, 3);
}

/** Tiny helper so Radar UI can display a stable seeded spark of lane scores. */
export function laneScoreCurve(symbolId: string, seedOffset = 0): number[] {
  const rand = mulberry32(hashString(`curve-${symbolId}-${seedOffset}`));
  const out: number[] = [];
  let v = 50;
  for (let i = 0; i < 22; i++) {
    v = Math.max(8, Math.min(92, v + gaussian(rand) * 12));
    out.push(Math.round(v));
  }
  return out;
}
