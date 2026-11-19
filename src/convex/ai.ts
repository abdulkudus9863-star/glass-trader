"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * AI providers for the academy copilot.
 *
 *   openai  → official Responses API, key read from OPENAI_API_KEY
 *   gemini  → Google Generative Language API, key read from GEMINI_API_KEY
 *   local   → deterministic SMC engine (handled client-side, no API call)
 *
 * Keys live only in the deployment environment. Every failure is returned as
 * `{ ok: false, error, code }` — the app never silently substitutes another
 * provider, and never pretends the local engine is a hosted model.
 */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiFailureCode =
  | "NOT_CONFIGURED"
  | "AUTH"
  | "RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "EMPTY_RESPONSE"
  | "PARSE_ERROR";

interface Failure {
  ok: false;
  error: string;
  code: AiFailureCode;
}

function fail(code: AiFailureCode, error: string): Failure {
  return { ok: false, code, error };
}

function httpFailure(status: number, provider: string): Failure {
  if (status === 401 || status === 403) {
    return fail("AUTH", `${provider} rejected the API key (HTTP ${status}).`);
  }
  if (status === 429) {
    return fail(
      "RATE_LIMIT",
      `${provider} rate limit reached (HTTP 429). Wait a moment and retry.`,
    );
  }
  return fail("PROVIDER_ERROR", `${provider} returned HTTP ${status}.`);
}

/* ------------------------------ OpenAI ------------------------------ */

async function callOpenAI(
  messages: ChatMessage[],
  json: boolean,
  maxTokens = 900,
): Promise<{ ok: true; text: string; model: string } | Failure> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return fail(
      "NOT_CONFIGURED",
      "OPENAI_API_KEY is not configured on the server. Add it in the project keys, or switch the engine to Local.",
    );
  }

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  try {
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: system.map((m) => m.content).join("\n\n"),
        input: rest.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: maxTokens,
        temperature: 0.3,
        ...(json ? { text: { format: { type: "json_object" } } } : {}),
      }),
    });

    if (!res.ok) return httpFailure(res.status, "OpenAI");

    const body = (await res.json()) as {
      output_text?: string;
      output?: {
        content?: { type?: string; text?: string }[];
      }[];
    };

    /* Responses API: prefer output_text, otherwise walk the output items. */
    let text = typeof body.output_text === "string" ? body.output_text : "";
    if (!text && Array.isArray(body.output)) {
      text = body.output
        .flatMap((item) => item.content ?? [])
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("");
    }
    if (!text.trim()) {
      return fail("EMPTY_RESPONSE", "OpenAI returned an empty response.");
    }
    return { ok: true, text, model: OPENAI_MODEL };
  } catch (err) {
    return fail(
      "PROVIDER_ERROR",
      `OpenAI request failed: ${err instanceof Error ? err.message : "network error"}.`,
    );
  }
}

/* ------------------------------ Gemini ------------------------------ */

async function callGemini(
  messages: ChatMessage[],
  json: boolean,
): Promise<{ ok: true; text: string; model: string } | Failure> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return fail(
      "NOT_CONFIGURED",
      "GEMINI_API_KEY is not configured on the server. Add it in the project keys, or switch the engine to Local.",
    );
  }
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const model = "gemini-2.0-flash";

  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: {
          temperature: 0.3,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) return httpFailure(res.status, "Gemini");
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      body.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    if (!text.trim()) {
      return fail("EMPTY_RESPONSE", "Gemini returned an empty response.");
    }
    return { ok: true, text, model };
  } catch (err) {
    return fail(
      "PROVIDER_ERROR",
      `Gemini request failed: ${err instanceof Error ? err.message : "network error"}.`,
    );
  }
}

/* ------------------------- strategy compiler ------------------------ */

async function completeChat(
  messages: ChatMessage[],
  json: boolean,
  maxTokens = 800,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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

function parseJsonLoose(text: string): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/* ------------------------------ copilot ------------------------------ */

export const copilotReply = action({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("gemini"),
      v.literal("local"),
    ),
    symbolId: v.string(),
    timeframe: v.optional(v.string()),
    /** Timestamp (ms) of the newest data point used. */
    dataTime: v.optional(v.number()),
    price: v.number(),
    change24h: v.number(),
    prompt: v.string(),
    snapshot: v.optional(
      v.object({
        symbol: v.optional(v.string()),
        rsi: v.optional(v.number()),
        regime: v.optional(v.string()),
        verdict: v.optional(
          v.union(v.literal("LONG"), v.literal("SHORT"), v.literal("WAIT")),
        ),
        entry: v.optional(v.array(v.number())),
        stopLoss: v.optional(v.number()),
        tp1: v.optional(v.number()),
        tp2: v.optional(v.number()),
        invalidation: v.optional(v.number()),
        rrr: v.optional(v.number()),
      }),
    ),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (
    _ctx,
    {
      provider,
      symbolId,
      timeframe,
      dataTime,
      price,
      change24h,
      prompt,
      snapshot,
      history,
    },
  ) => {
    if (provider === "local") {
      return fail(
        "NOT_CONFIGURED",
        "The local engine runs on the client and needs no API call.",
      );
    }

    const tf = timeframe ?? "15m";
    const stamp =
      dataTime != null ? new Date(dataTime).toISOString() : "timestamp unknown";
    const snapshotBlock = snapshot
      ? `Deterministic SMC snapshot for ${symbolId} ${tf} (ground truth, do not change): ${JSON.stringify(
          snapshot,
        )}. Stay on ${symbolId}; never analyse or quote another instrument's levels.`
      : `No deterministic snapshot is available for ${symbolId}. Do NOT invent RSI, support/resistance, entry, stop or targets. Say the data is unavailable and default to WAIT.`;

    const system = [
      `You are the Ak Analyser copilot for the Abdul Kudus Trading Academy.`,
      `The instrument for THIS answer is fixed: ${symbolId} on the ${tf} timeframe, last price ${price} with 24h change ${change24h.toFixed(2)}% (data timestamp ${stamp}).`,
      `If the user's message names a different instrument, the client has already re-routed the request — never switch instrument yourself and never mix levels from another market.`,
      snapshotBlock,
      `Respond in strict JSON only: {"verdict":"LONG|SHORT|WAIT","rr":"1:2.4","summary":"one or two sentences naming the symbol","bullets":["3-6 short data-backed points"]}.`,
      `Cover: data timestamp, trend, indicators, bullish and bearish scenarios, entry zone if supported, stop-loss, take-profit, risk/reward. Use WAIT when confirmation is missing. Never claim certainty or fabricate prices.`,
    ].join(" ");

    const userMessage = `Question: ${prompt}`;
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...history.slice(-8).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    const result =
      provider === "openai"
        ? await callOpenAI(messages, true)
        : await callGemini(messages, true);

    if (!result.ok) return result;

    const parsed = parseJsonLoose(result.text);
    if (!parsed) {
      return fail(
        "PARSE_ERROR",
        `${provider === "openai" ? "OpenAI" : "Gemini"} returned a response that was not valid JSON. Retry, or switch engine in AI settings.`,
      );
    }

    const rawVerdict = parsed.verdict;
    const verdict =
      rawVerdict === "LONG" || rawVerdict === "SHORT" || rawVerdict === "WAIT"
        ? rawVerdict
        : "WAIT";
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets
          .filter((b): b is string => typeof b === "string")
          .slice(0, 6)
      : [];

    return {
      ok: true as const,
      provider,
      model: result.model,
      symbol: symbolId,
      verdict,
      rr:
        typeof parsed.rr === "string" ? parsed.rr : snapshot?.rrr != null ? `1:${snapshot.rrr}` : "—",
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary
          : `${verdict} read on ${symbolId}.`,
      bullets,
    };
  },
});

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
      const content = await completeChat(
        [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        true,
        900,
      );
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return { ok: true as const, model: OPENAI_MODEL, parsed };
    } catch {
      return { ok: false as const };
    }
  },
});
