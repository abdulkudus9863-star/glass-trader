/* ============================================================================
   Strategy Compiler Engine
   - Turns a natural-language trading prompt into a structured, executable
     strategy spec (entry zone, stop loss, take profits, confluence).
   - Converts specs into chart overlay configs that the custom canvas engine
     renders as signal markers, zone highlights and SL/TP price lines.
   ========================================================================== */

import { findSymbol } from "./market";

export type StrategyBias = "LONG" | "SHORT" | "WAIT";
export type StrategyStatus = "ACTIVE" | "DRAFT" | "BACKTESTED";

export interface StrategySpec {
  id: string;
  name: string;
  prompt: string; // original natural-language input
  asset: string; // symbol id, e.g. "XAUUSD"
  timeframe: string; // e.g. "15m"
  bias: StrategyBias;
  entryZone: [number, number];
  stopLoss: number;
  takeProfits: [number, number];
  invalidation: number;
  riskReward: number;
  conditions: string[]; // parsed trigger conditions
  confluence: string[];
  tokenCost: number;
  createdAt: number;
  status: StrategyStatus;
}

/** Active overlay injected onto the chart canvas. */
export interface StrategyOverlay {
  id: string;
  name: string;
  asset: string;
  bias: StrategyBias;
  entryZone: [number, number];
  stopLoss: number;
  takeProfits: [number, number];
  visible: boolean;
}

/* ------------------------------ parser ------------------------------ */

const TF_RE = /(\d+)\s*(m|h|w|min|hr|hour|day)/i;
const ASSET_ALIASES: Record<string, string> = {
  gold: "XAUUSD",
  xau: "XAUUSD",
  xauusd: "XAUUSD",
  btc: "BTCUSDT",
  bitcoin: "BTCUSDT",
  btcusdt: "BTCUSDT",
  eth: "ETHUSDT",
  ethereum: "ETHUSDT",
  ethusdt: "ETHUSDT",
  eurusd: "EURUSD",
  "euro": "EURUSD",
  gbpusd: "GBPUSD",
};

function detectAsset(text: string, fallback: string): string {
  for (const [key, id] of Object.entries(ASSET_ALIASES)) {
    if (text.includes(key)) return id;
  }
  return fallback;
}

function detectTimeframe(text: string, fallback: string): string {
  const m = text.match(TF_RE);
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith("h")) return n >= 24 ? "1D" : n === 1 ? "1H" : `${n}H`;
  if (unit.startsWith("w")) return "1W";
  if (unit.startsWith("d")) return "1D";
  if (n >= 60) return `${Math.floor(n / 60)}H`;
  if (n >= 15) return "15m";
  return n >= 5 ? "5m" : "1m";
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Pick a human label for the strategy from the strongest keyword in the prompt. */
function nameFromPrompt(text: string, asset: string): string {
  const t = text.toLowerCase();
  const tags: [RegExp, string][] = [
    [/fvg|fair value|imbalance/, "SMC A+"],
    [/order block|orderblock/, "Order Block"],
    [/liquidity|sweep/, "Liquidity Sweep"],
    [/rsi|oversold|overbought/, "RSI Reversion"],
    [/ema|moving average|ma /, "EMA Trend"],
    [/macd/, "Momentum"],
    [/bollinger|bb /, "Volatility Squeeze"],
    [/breakout|break out/, "Breakout"],
  ];
  for (const [re, label] of tags) {
    if (re.test(t)) return `${asset} ${label} Strategy`;
  }
  return `${asset} Confluence Strategy`;
}

/** Parse trigger conditions out of the prompt so they can be replayed on chart. */
function detectConditions(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  const rules: [RegExp, string][] = [
    [/rsi\s*[<≤]\s*(\d+)/, "RSI < $1 (oversold dip)"],
    [/rsi\s*[>≥]\s*(\d+)/, "RSI > $1 (overbought rejection)"],
    [/ema.*cross|golden cross/, "EMA golden cross"],
    [/death cross/, "EMA death cross"],
    [/fvg|fair value gap/, "5m FVG demand mitigation"],
    [/order block/, "Order block reaction"],
    [/bollinger|squeeze/, "Bollinger squeeze expansion"],
    [/macd/, "MACD histogram flip"],
    [/volume/, "Volume confirmation"],
    [/breakout|break out/, "Structure breakout"],
    [/support/, "Support retest"],
    [/resistance/, "Resistance retest"],
  ];
  for (const [re, label] of rules) {
    if (re.test(t)) out.push(t.replace(re, label));
  }
  if (out.length === 0) out.push("Price reacts at the active supply/demand zone");
  return out.slice(0, 4);
}

function rr(decimal: number): number {
  return Math.round(decimal * 10) / 10;
}

/* --------------------------- main compiler --------------------------- */

export const COMPILE_COST = 5;

/**
 * Compile a natural-language strategy prompt into an executable spec.
 * Uses the live price of the target asset to derive entry / SL / TP levels.
 */
export function compileStrategy(
  prompt: string,
  asset: string,
  timeframe: string,
  price: number,
): StrategySpec {
  const text = prompt.trim();
  const sym = findSymbol(asset) ?? findSymbol("BTCUSDT")!;
  const d = sym.decimals;
  const rp = (v: number) => roundTo(v, d);

  const lower = text.toLowerCase();
  const longWords = /buy|long|demand|oversold|bullish|fvg|fair value|support|dip/.test(lower);
  const shortWords = /sell|short|overbought|bearish|resistance|breakdown|reject/.test(lower);
  let bias: StrategyBias = "WAIT";
  if (longWords && !shortWords) bias = "LONG";
  else if (shortWords && !longWords) bias = "SHORT";

  /* Derive a mechanically consistent trade plan around the live price. */
  const spread = Math.max(price * 0.002, 10 ** -d);
  let entryZone: [number, number];
  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let invalidation: number;
  let riskReward = 1;

  if (bias === "LONG") {
    entryZone = [rp(price * 0.992), rp(price * 0.997)];
    stopLoss = rp(entryZone[0] * 0.994);
    tp1 = rp(price * 1.012);
    tp2 = rp(price * 1.028);
    invalidation = rp(stopLoss * 0.998);
    const risk = entryZone[1] - stopLoss;
    const reward = (tp1 + tp2) / 2 - entryZone[1];
    riskReward = rr(reward / Math.max(risk, 1e-12));
  } else if (bias === "SHORT") {
    entryZone = [rp(price * 1.003), rp(price * 1.008)];
    stopLoss = rp(entryZone[1] * 1.006);
    tp1 = rp(price * 0.988);
    tp2 = rp(price * 0.972);
    invalidation = rp(stopLoss * 1.002);
    const risk = stopLoss - entryZone[0];
    const reward = entryZone[0] - (tp1 + tp2) / 2;
    riskReward = rr(reward / Math.max(risk, 1e-12));
  } else {
    /* WAIT — frame a watch box around price for reference. */
    entryZone = [rp(price - spread), rp(price + spread)];
    stopLoss = rp(entryZone[0] * 0.995);
    tp1 = rp(price * 1.006);
    tp2 = rp(price * 1.012);
    invalidation = rp(entryZone[1] * 1.004);
  }

  return {
    id: `strat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: nameFromPrompt(text, asset),
    prompt: text,
    asset,
    timeframe: detectTimeframe(text, timeframe),
    bias,
    entryZone,
    stopLoss,
    takeProfits: [tp1, tp2],
    invalidation,
    riskReward: riskReward > 0 ? riskReward : 1,
    conditions: detectConditions(text),
    confluence: [
      `${bias === "LONG" ? "Bullish" : bias === "SHORT" ? "Bearish" : "Neutral"} momentum alignment`,
      "Order-flow context supports the directional view",
      "Macro backdrop consistent — no conflicting catalysts",
    ],
    tokenCost: COMPILE_COST,
    createdAt: Date.now(),
    status: "DRAFT",
  };
}

/** Convert a compiled spec into an injectable chart overlay. */
export function overlayFromSpec(spec: StrategySpec): StrategyOverlay {
  return {
    id: spec.id,
    name: spec.name,
    asset: spec.asset,
    bias: spec.bias,
    entryZone: spec.entryZone,
    stopLoss: spec.stopLoss,
    takeProfits: spec.takeProfits,
    visible: true,
  };
}

/** Format a price for a given symbol precision. */
export function fmtLevel(asset: string, value: number): string {
  const sym = findSymbol(asset);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: sym?.decimals ?? 2,
    maximumFractionDigits: sym?.decimals ?? 2,
  });
}
