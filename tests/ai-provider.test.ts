import { describe, expect, test } from "bun:test";
import * as ai from "../src/convex/ai";
import { strategyMatchesChart, type AISignals } from "../src/contexts/StrategyContext";
import { AI_PROVIDER_LABELS, isAiProvider, loadAiProvider } from "../src/lib/ai-provider";

const call = (fn: any, args: any) => fn._handler({}, args);

const baseArgs = {
  symbolId: "XAUUSD",
  timeframe: "15m",
  price: 2400,
  change24h: 0.4,
  prompt: "Should I long XAUUSD?",
  history: [],
};

describe("AI provider backend", () => {
  test("local provider never performs a network call and says so plainly", async () => {
    const res: any = await call(ai.copilotReply, { ...baseArgs, provider: "local" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("NOT_CONFIGURED");
    expect(res.error).toContain("local engine");
  });

  test.skipIf(Boolean(process.env.OPENAI_API_KEY))(
    "openai without a server key returns an explicit configuration error",
    async () => {
      const res: any = await call(ai.copilotReply, {
        ...baseArgs,
        provider: "openai",
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe("NOT_CONFIGURED");
      expect(res.error).toContain("OPENAI_API_KEY");
    },
  );

  test.skipIf(Boolean(process.env.GEMINI_API_KEY))(
    "gemini without a server key returns an explicit configuration error",
    async () => {
      const res: any = await call(ai.copilotReply, {
        ...baseArgs,
        provider: "gemini",
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe("NOT_CONFIGURED");
      expect(res.error).toContain("GEMINI_API_KEY");
    },
  );
});

describe("provider preference", () => {
  test("defaults to the local engine and validates values", () => {
    expect(loadAiProvider()).toBe("local");
    expect(isAiProvider("openai")).toBe(true);
    expect(isAiProvider("gemini")).toBe(true);
    expect(isAiProvider("skynet")).toBe(false);
    expect(AI_PROVIDER_LABELS.local).toContain("Local");
  });
});

describe("strategy provenance", () => {
  const signal: AISignals = {
    title: "XAUUSD 15m",
    signalType: "LONG",
    entryMin: 2400,
    entryMax: 2402,
    stopLoss: 2390,
    tp1: 2415,
    asset: "XAUUSD",
    timeframe: "15m",
  };

  test("signal only matches its own pair and timeframe", () => {
    expect(strategyMatchesChart(signal, "XAUUSD", "15m")).toBe(true);
    expect(strategyMatchesChart(signal, "BTCUSDT", "15m")).toBe(false);
    expect(strategyMatchesChart(signal, "XAUUSD", "1H")).toBe(false);
    expect(strategyMatchesChart(null, "XAUUSD", "15m")).toBe(false);
  });

  test("legacy signals without provenance still match (no false removal)", () => {
    const legacy: AISignals = { ...signal, asset: undefined, timeframe: undefined };
    expect(strategyMatchesChart(legacy, "BTCUSDT", "1H")).toBe(true);
  });
});
