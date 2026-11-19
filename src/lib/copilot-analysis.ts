import type { Candle, TimeframeId } from "./market";
import { formatPercent, formatPrice } from "./market";
import { analyzeSmc } from "./smc";

/**
 * Deterministic Copilot analysis for ONE explicit symbol.
 *
 * This is the Local Engine: it never invents prices, levels or a verdict —
 * every number comes from the supplied candle tape and the SMC engine. The
 * same function powers the "data unavailable" path when the tape is missing,
 * so the Copilot can never mix one symbol's prices into another's analysis.
 */

export type CopilotVerdict = "LONG" | "SHORT" | "WAIT";

export interface CopilotDataStatus {
  /** Feed freshness for the analysed symbol. */
  freshness?: "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
  /** Age of the newest candle in seconds, when known. */
  ageSeconds?: number | null;
}

export interface CopilotAnalysisInput {
  symbolId: string;
  assetName: string;
  timeframe: TimeframeId;
  decimals: number;
  candles: Candle[];
  /** Latest traded price; falls back to the newest candle close. */
  price: number | null;
  change24h?: number | null;
  /** Timestamp (ms) of the newest candle or tick. */
  updatedAt?: number | null;
  now?: number;
  data?: CopilotDataStatus;
  /** Why the tape is missing, when known (e.g. "TWELVEDATA key not set"). */
  unavailableReason?: string | null;
}

export interface CopilotAnalysisResult {
  ok: boolean;
  symbol: string;
  timeframe: TimeframeId;
  verdict: CopilotVerdict;
  rr: string | null;
  /** One-line headline. */
  text: string;
  /** Structured points: symbol/time, trend, indicators, scenarios, risk. */
  bullets: string[];
  /** Timestamp of the data the answer is grounded on (ms), null if none. */
  dataTime: number | null;
  /** Price used, null when unavailable. */
  price: number | null;
}

function unavailable(
  input: CopilotAnalysisInput,
  reason: string,
): CopilotAnalysisResult {
  return {
    ok: false,
    symbol: input.symbolId,
    timeframe: input.timeframe,
    verdict: "WAIT",
    rr: null,
    text: `**DATA UNAVAILABLE** for ${input.symbolId} — I will not analyse or signal without a live tape.`,
    bullets: [
      `Analysed symbol: ${input.symbolId} · ${input.timeframe} · ${input.assetName}.`,
      reason,
      "No price, indicator or signal has been inferred. Retry once the feed is live.",
    ],
    dataTime: null,
    price: null,
  };
}

export function buildCopilotAnalysis(
  input: CopilotAnalysisInput,
): CopilotAnalysisResult {
  const {
    symbolId,
    assetName,
    timeframe,
    decimals,
    candles,
    price,
    change24h,
    updatedAt,
    data,
  } = input;
  const last = candles[candles.length - 1];
  const effectivePrice = price ?? last?.close ?? null;

  if (data?.freshness === "UNAVAILABLE") {
    return unavailable(
      input,
      input.unavailableReason ??
        "The market-data provider returned no candles for this instrument.",
    );
  }
  if (effectivePrice == null || Number.isFinite(effectivePrice) === false) {
    return unavailable(input, "No current price is available for this instrument.");
  }
  if (candles.length < 30) {
    return unavailable(
      input,
      `Only ${candles.length} candles are available on ${timeframe}; at least 30 are required for structure, RSI and levels.`,
    );
  }

  const smc = analyzeSmc({
    symbolId,
    intervalId: timeframe,
    candles,
    price: effectivePrice,
    change24h: change24h ?? 0,
    decimals,
    assetName,
  });

  if (!smc) {
    return unavailable(input, "The SMC engine could not derive structure from this tape.");
  }

  const s = smc.signal;
  const f = (v: number) => formatPrice(v, decimals);
  const dataTime = updatedAt ?? last?.time ?? null;
  const stamp =
    dataTime != null
      ? new Date(dataTime).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "time unknown";
  const age =
    data?.ageSeconds != null ? ` · ${Math.round(data.ageSeconds)}s old` : "";
  const staleNote =
    data?.freshness === "STALE" || data?.freshness === "DELAYED"
      ? ` Feed is ${data.freshness}${age} — treat levels as indicative until it refreshes.`
      : "";

  const verdict: CopilotVerdict = smc.verdict;
  const bullish =
    verdict === "LONG"
      ? `Bullish: continuation from the ${smc.regime.toLowerCase()} structure through ${f(s.entryZone[0])} – ${f(s.entryZone[1])} toward ${f(s.tp1)} then ${f(s.tp2)}.`
      : `Bullish alternative: a close back above ${f(s.entryZone[1])} with rising volume would reopen the ${f(s.tp1)} objective.`;
  const bearish =
    verdict === "SHORT"
      ? `Bearish: rejection from ${f(s.entryZone[0])} – ${f(s.entryZone[1])} targets ${f(s.tp1)} then ${f(s.tp2)}, invalidated above ${f(s.invalidation)}.`
      : `Bearish alternative: losing ${f(s.stopLoss)} invalidates the read and exposes the next lower liquidity pocket.`;

  const risk = `Risk: stop ${f(s.stopLoss)} (invalidation ${f(s.invalidation)}), R:R ≈ 1:${s.rrr.toFixed(1)}. Keep a single loss under 1% of equity.`;

  const bullets = [
    `Analysed symbol: ${symbolId} (${assetName}) · ${timeframe} · price ${f(effectivePrice)} · 24h ${
      change24h != null ? formatPercent(change24h) : "—"
    } · data as of ${stamp}${age}.`,
    `Market trend / regime: ${smc.regime}. ${smc.structure.structureChange}`,
    `Indicators: RSI ${smc.rsi.toFixed(1)} (${smc.rsiLabel.toLowerCase()}) · structure bias ${smc.structure.bias ?? "neutral"} · sweep: ${smc.structure.sweepZone}.`,
    verdict === "WAIT"
      ? `No confirmed setup on ${symbolId} — ${s.biasHint}`
      : `Setup: ${verdict} on ${symbolId} into ${f(s.entryZone[0])} – ${f(s.entryZone[1])}.`,
    bullish,
    bearish,
    verdict === "WAIT"
      ? `Levels if a trigger appears: stop ${f(s.stopLoss)}, TP1 ${f(s.tp1)}, TP2 ${f(s.tp2)}.`
      : `Take-profit scenarios: TP1 ${f(s.tp1)}, TP2 ${f(s.tp2)}.`,
    risk,
  ];
  if (staleNote) bullets.push(staleNote.trim());

  return {
    ok: true,
    symbol: symbolId,
    timeframe,
    verdict,
    rr: `1:${s.rrr.toFixed(1)}`,
    text:
      verdict === "WAIT"
        ? `**WAIT** on ${symbolId} — no confirmed edge (${smc.regime.toLowerCase()}, RSI ${smc.rsi.toFixed(1)}).`
        : `**${verdict}** on ${symbolId} — ${smc.regime.toLowerCase()}, RSI ${smc.rsi.toFixed(1)}.`,
    bullets,
    dataTime,
    price: effectivePrice,
  };
}

export { detectSymbolInText, resolveAnalysisSymbol } from "./symbol-context";
