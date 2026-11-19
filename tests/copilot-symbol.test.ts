import { describe, expect, test } from "bun:test";
import {
  detectSymbolInText,
  resolveAnalysisSymbol,
} from "../src/lib/symbol-context";
import { buildCopilotAnalysis } from "../src/lib/copilot-analysis";
import { findSymbol, type Candle, type TimeframeId } from "../src/lib/market";

/* ----------------------------- fixtures ----------------------------- */

function series(n: number, start = 100, step = 0.4, vol = 1000): Candle[] {
  const out: Candle[] = [];
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < n; i++) {
    const open = start + i * step;
    const close = open + (i % 2 === 0 ? step * 0.8 : -step * 0.35);
    out.push({
      time: t0 + i * 900_000,
      open,
      high: Math.max(open, close) + step * 0.6,
      low: Math.min(open, close) - step * 0.6,
      close,
      volume: vol + i,
    });
  }
  return out;
}

const BTC = findSymbol("BTCUSDT")!;
const XAU = findSymbol("XAUUSD")!;

describe("symbol recognition", () => {
  test("Test A — explicit XAUUSD beats the BTC chart", () => {
    const res = resolveAnalysisSymbol("Should I long XAUUSD?", "BTCUSDT");
    expect(res.symbolId).toBe("XAUUSD");
    expect(res.explicit).toBe(true);
    expect(res.usedFallback).toBe(false);
  });

  test("Test B — BTC mentioned while XAUUSD is the chart", () => {
    const res = resolveAnalysisSymbol("What is BTC doing right now?", "XAUUSD");
    expect(res.symbolId).toBe("BTCUSDT");
    expect(res.explicit).toBe(true);
  });

  test("Test C — 'this pair' falls back to the selected chart symbol", () => {
    const res = resolveAnalysisSymbol("Should I long this pair?", "XAUUSD");
    expect(res.symbolId).toBe("XAUUSD");
    expect(res.explicit).toBe(false);
    expect(res.usedFallback).toBe(true);
  });

  test("aliases: gold, XAU/USD, bitcoin, ETH, silver", () => {
    expect(detectSymbolInText("is gold ready to break out?").symbolId).toBe(
      "XAUUSD",
    );
    expect(detectSymbolInText("XAU/USD outlook").symbolId).toBe("XAUUSD");
    expect(detectSymbolInText("bitcoin next move").symbolId).toBe("BTCUSDT");
    expect(detectSymbolInText("should I buy ETH here").symbolId).toBe("ETHUSDT");
    expect(detectSymbolInText("silver vs gold").symbolId).toBe("XAGUSD");
  });

  test("longest alias wins: a full pair name is never truncated to BTC", () => {
    // Both pair tokens are 6 chars; the first catalog match wins and it must
    // be a complete pair id, never the bare "BTC" alias mapped to BTCUSDT.
    expect(detectSymbolInText("BTCUSD vs BTCUSDT").symbolId).toBe("BTCUSDT");
    expect(detectSymbolInText("just BTC please").symbolId).toBe("BTCUSDT");
  });

  test("unsupported pair-shaped mentions are reported, not substituted", () => {
    const res = resolveAnalysisSymbol("analyse NZDUSD please", "BTCUSDT");
    expect(res.symbolId).toBeNull();
    expect(res.unsupported).toBe(true);
    expect(res.mentioned).toBe("NZDUSD");
  });

  test("random words do not produce false positives", () => {
    const res = resolveAnalysisSymbol("what is the trend?", "BTCUSDT");
    expect(res.explicit).toBe(false);
    expect(res.symbolId).toBe("BTCUSDT");
  });
});

describe("copilot analysis is bound to one symbol", () => {
  test("Test A — XAUUSD analysis never contains BTC prices", () => {
    const xauCandles = series(120, 2_400, 0.8);
    const res = buildCopilotAnalysis({
      symbolId: "XAUUSD",
      assetName: XAU.name,
      timeframe: "15m",
      decimals: XAU.decimals,
      candles: xauCandles,
      price: xauCandles[xauCandles.length - 1].close,
      change24h: 0.4,
      updatedAt: xauCandles[xauCandles.length - 1].time,
      data: { freshness: "LIVE", ageSeconds: 5 },
    });
    expect(res.symbol).toBe("XAUUSD");
    expect(res.text).toContain("XAUUSD");
    expect(res.bullets.join(" ")).toContain("XAUUSD");
    expect(res.bullets.join(" ")).not.toContain("BTCUSDT");
    expect(res.price).toBeGreaterThan(2_000);
  });

  test("Test B — BTC analysis while XAU is selected contains no gold levels", () => {
    const btcCandles = series(120, 60_000, 40);
    const res = buildCopilotAnalysis({
      symbolId: "BTCUSDT",
      assetName: BTC.name,
      timeframe: "15m",
      decimals: BTC.decimals,
      candles: btcCandles,
      price: btcCandles[btcCandles.length - 1].close,
      change24h: 1.1,
      data: { freshness: "LIVE" },
    });
    expect(res.symbol).toBe("BTCUSDT");
    expect(res.bullets.join(" ")).not.toContain("XAUUSD");
    expect(res.price).toBeGreaterThan(50_000);
  });

  test("Test E — no data yields an explicit unavailable answer, never a fake signal", () => {
    const res = buildCopilotAnalysis({
      symbolId: "XAUUSD",
      assetName: XAU.name,
      timeframe: "15m",
      decimals: XAU.decimals,
      candles: [],
      price: null,
      data: { freshness: "UNAVAILABLE" },
      unavailableReason: "TWELVEDATA_API_KEY not configured.",
    });
    expect(res.ok).toBe(false);
    expect(res.verdict).toBe("WAIT");
    expect(res.text).toContain("DATA UNAVAILABLE");
    expect(res.bullets.join(" ")).toContain("TWELVEDATA_API_KEY");
    expect(res.price).toBeNull();
  });

  test("stale feed is labelled as stale, not live", () => {
    const candles = series(120);
    const res = buildCopilotAnalysis({
      symbolId: "BTCUSDT",
      assetName: BTC.name,
      timeframe: "15m",
      decimals: BTC.decimals,
      candles,
      price: candles[candles.length - 1].close,
      data: { freshness: "STALE", ageSeconds: 900 },
    });
    expect(res.bullets.join(" ")).toContain("STALE");
  });

  test("response carries every required section", () => {
    const candles = series(120);
    const res = buildCopilotAnalysis({
      symbolId: "BTCUSDT",
      assetName: BTC.name,
      timeframe: "15m" as TimeframeId,
      decimals: BTC.decimals,
      candles,
      price: candles[candles.length - 1].close,
      change24h: 0.5,
      data: { freshness: "LIVE" },
    });
    const joined = [res.text, ...res.bullets].join("\n");
    expect(joined).toContain("Analysed symbol");
    expect(joined).toContain("price");
    expect(joined.toLowerCase()).toContain("trend");
    expect(joined).toContain("RSI");
    expect(joined.toLowerCase()).toContain("bullish");
    expect(joined.toLowerCase()).toContain("bearish");
    expect(joined.toLowerCase()).toContain("risk");
    expect(res.rr).toMatch(/^1:\d/);
  });
});
