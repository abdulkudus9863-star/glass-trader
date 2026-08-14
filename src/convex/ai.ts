"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Real AI engine for the academy.
 *
 * Both actions call the OpenAI Chat Completions API from a Convex node
 * action, reading the API key from the deployment environment
 * (`OPENAI_API_KEY`). When the key is missing or the call fails, the
 * actions return `{ ok: false }` and the client falls back to the built-in
 * deterministic engine, so the app always works.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function complete(
  messages: ChatMessage[],
  json: boolean,
  maxTokens = 800,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
      response_format: json ? { type: "json_object" } : undefined,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty completion");
  return content;
}

/* ------------------------------ copilot ------------------------------ */

export const copilotReply = action({
  args: {
    symbolId: v.string(),
    price: v.number(),
    change24h: v.number(),
    prompt: v.string(),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (_ctx, { symbolId, price, change24h, prompt, history }) => {
    const system = [
      `You are the Ak Analyser trading copilot inside the Abdul Kudus Trading Academy terminal.`,
      `You are anchored to the LIVE tape: ${symbolId} at ${price.toLocaleString(
        "en-US",
      )} with a 24h change of ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%.`,
      `Never quote stale or invented levels. Evaluate the question using the live price, volatility implied by the 24h move, and sound SMC / price-action reasoning.`,
      `Reply in strict JSON with exactly this shape:`,
      `{"verdict":"LONG","rr":"1:2.4","summary":"one or two sentences","bullets":["3 to 5 short data-backed points"]}`,
      `verdict must be one of LONG, SHORT, WAIT. rr is a risk/reward string. summary is a single concise verdict statement. Every bullet must reference the live price data.`,
    ].join(" ");

    const userMessage = `Live ${symbolId} tape: price ${price.toLocaleString(
      "en-US",
    )}, 24h ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%. Question: ${prompt}`;

    try {
      const content = await complete(
        [
          { role: "system", content: system },
          ...history.slice(-8).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: userMessage },
        ],
        true,
      );
      const parsed = JSON.parse(content) as {
        verdict?: string;
        rr?: string;
        summary?: string;
        bullets?: unknown;
      };
      const verdict =
        parsed.verdict === "LONG" || parsed.verdict === "SHORT" || parsed.verdict === "WAIT"
          ? parsed.verdict
          : "WAIT";
      return {
        ok: true as const,
        model: MODEL,
        verdict,
        rr: typeof parsed.rr === "string" ? parsed.rr : "1:1",
        summary:
          typeof parsed.summary === "string"
            ? parsed.summary
            : `${verdict} read on ${symbolId} at ${price.toLocaleString("en-US")}.`,
        bullets: Array.isArray(parsed.bullets)
          ? parsed.bullets.filter((b): b is string => typeof b === "string").slice(0, 6)
          : [],
      };
    } catch {
      return { ok: false as const };
    }
  },
});

/* --------------------------- strategy compiler --------------------------- */

export const compileStrategySpec = action({
  args: {
    prompt: v.string(),
    asset: v.string(),
    timeframe: v.string(),
    price: v.number(),
  },
  handler: async (_ctx, { prompt, asset, timeframe, price }) => {
    const system = [
      `You are the strategy compiler for a professional trading terminal.`,
      `Convert the user's natural-language trading strategy into strict JSON with exactly this shape:`,
      `{"name":"...","timeframe":"15m","bias":"LONG","entryZone":[low,high],"stopLoss":0,"takeProfits":[tp1,tp2],"invalidation":0,"riskReward":2.4,"conditions":["..."],"confluence":["..."]}`,
      `Anchor every level around the live price: ${asset} at ${price.toLocaleString(
        "en-US",
      )}.`,
      `bias is LONG, SHORT or WAIT. entryZone brackets a plausible entry near price, stopLoss sits beyond the entry away from the bias direction, takeProfits sit in the bias direction, invalidation just beyond the stop, riskReward is reward/risk computed from those levels. conditions are the parsed trigger rules (e.g. "RSI < 30", "5m FVG demand"). confluence lists supporting context.`,
      `The requested timeframe is ${timeframe} — respect it unless the prompt states another.`,
    ].join(" ");

    try {
      const content = await complete(
        [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        true,
        900,
      );
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return { ok: true as const, model: MODEL, parsed };
    } catch {
      return { ok: false as const };
    }
  },
});
