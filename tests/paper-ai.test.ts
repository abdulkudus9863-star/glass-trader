import { describe, expect, test } from "bun:test";
import {
  computeBoxSpan,
  computeTimeSpan,
} from "@/components/chart/risk-reward-primitive";
import {
  aiSetupFromAnalysis,
  aiTradeAction,
  aiTradeDraft,
  savedSetupFromAnalysis,
  upsertSavedSetup,
} from "@/lib/paper-ai";
import { buildAiSetupOverlays, DEFAULT_OVERLAY_TOGGLES } from "@/lib/paper-chart";
import type { DeeeprTradeAnalysis } from "@/lib/deeepr";

function analysis(overrides: Partial<DeeeprTradeAnalysis> = {}): DeeeprTradeAnalysis {
  const base = {
    engine: "DEEEPR_TRADE_AI",
    version: "2.0",
    analysis_id: "da-test",
    symbol: "BTCUSDT",
    timeframe: "15m",
    timestamp: 1_700_000_000_000,
    data_status: "LIVE",
    age_seconds: 4,
    change24h: 1.2,
    decision: "BUY",
    direction: "LONG",
    setup_state: "ENTRY_CONFIRMED",
    score: 78,
    grade: "A",
    confidence: "MEDIUM",
    market_regime: "TRENDING",
    mtf: { "1H": "BULLISH", "4H": "BULLISH" },
    entry: {
      zone_low: 114_800,
      zone_high: 115_200,
      current_price: 115_000,
      quality: "GOOD",
      confirmation_required: "close above zone",
    },
    risk: {
      stop_loss: 114_000,
      risk_points: 1_000,
      minimum_rr: 2,
      actual_rr: 3,
    },
    targets: { tp1: 118_000, tp2: 120_000, tp3: 123_000 },
    confluence: {},
    hard_gates: [],
    reasons: ["1H bullish", "sweep reclaimed"],
    invalidation: ["lose 114,000"],
    warnings: [],
    primary: null,
  };
  return { ...base, ...overrides } as unknown as DeeeprTradeAnalysis;
}

describe("compact R:R box span", () => {
  test("spans exactly the configured number of bars from the anchor", () => {
    const span = computeBoxSpan(120, 8, 900, 15);
    expect(span).toEqual({ x0: 120, x1: 240 });
  });

  test("never leaves the plot area when the anchor is near the right edge", () => {
    const span = computeBoxSpan(880, 8, 900, 15);
    expect(span).not.toBeNull();
    expect(span!.x1).toBeLessThanOrEqual(900);
    expect(span!.x0).toBeGreaterThanOrEqual(0);
    expect(span!.x1 - span!.x0).toBe(120);
  });

  test("an off-screen anchor still yields a compact box at the right edge", () => {
    const span = computeBoxSpan(null, 6, 600);
    expect(span!.x1).toBe(598);
    expect(span!.x1 - span!.x0).toBe(90);
  });

  test("a left-off-screen anchor is clipped to the plot", () => {
    const span = computeBoxSpan(-40, 6, 600, 15);
    expect(span!.x0).toBe(0);
    expect(span!.x1).toBe(90);
  });

  test("invalid plot width or spacing cannot produce a giant box", () => {
    expect(computeBoxSpan(10, 8, 0)).toBeNull();
    const fallback = computeBoxSpan(10, 0, 600, 15);
    expect(fallback!.x1 - fallback!.x0).toBe(90);
  });

  test("time span follows the trade lifetime in bars", () => {
    // 8px bars: entry at x=100, exit 40 bars later at x=420
    const span = computeTimeSpan(100, 420, 8, 900, 15);
    expect(span).toEqual({ x0: 100, x1: 420 });
  });

  test("a closed trade that ended in the past stops at its exit, not today", () => {
    const span = computeTimeSpan(20, 140, 8, 900, 15);
    expect(span!.x1).toBe(140);
    expect(span!.x1).toBeLessThan(900);
  });

  test("a trade whose whole lifetime is off-screen draws no zone", () => {
    expect(computeTimeSpan(-300, -100, 8, 900, 15)).toBeNull();
  });

  test("a missing end falls back to the compact bar extent", () => {
    const span = computeTimeSpan(100, null, 8, 900, 15);
    expect(span!.x1 - span!.x0).toBe(120);
  });

  test("an inverted pair is normalised and clamped to the pane", () => {
    const span = computeTimeSpan(500, 300, 8, 900, 15);
    expect(span!.x0).toBe(300);
    expect(span!.x1).toBe(500);
  });
});

describe("DEEEPR decision gating", () => {
  test("only confirmed BUY/SELL with medium+ confidence is actionable", () => {
    expect(aiTradeAction("BUY", "MEDIUM")).toBe("take");
    expect(aiTradeAction("STRONG SELL", "HIGH")).toBe("take");
    expect(aiTradeAction("BUY", "LOW")).toBe("wait");
    expect(aiTradeAction("WAIT FOR BUY", "HIGH")).toBe("wait");
    expect(aiTradeAction("NO TRADE", "HIGH")).toBe("blocked");
    expect(aiTradeAction("INVALIDATED", "HIGH")).toBe("blocked");
    expect(aiTradeAction("INSUFFICIENT DATA", "LOW")).toBe("blocked");
  });
});

describe("analysis → paper trading bridge", () => {
  test("long setup maps to chart levels and a form draft", () => {
    const levels = aiSetupFromAnalysis(analysis());
    expect(levels).not.toBeNull();
    expect(levels!.direction).toBe("long");
    expect(levels!.entryZone).toEqual([114_800, 115_200]);
    expect(levels!.stopLoss).toBe(114_000);
    expect(levels!.takeProfits).toEqual([118_000, 120_000, 123_000]);

    const draft = aiTradeDraft(analysis());
    expect(draft!.entry).toBe(115_000);
    expect(draft!.stop).toBe(114_000);
    expect(draft!.target).toBe(118_000);
    expect(draft!.riskReward).toBe(3);
  });

  test("short setup maps with stops above the zone", () => {
    const a = analysis({
      direction: "SHORT",
      decision: "SELL",
      entry: { zone_low: 114_800, zone_high: 115_200, current_price: 115_000, quality: "GOOD", confirmation_required: "" },
      risk: { stop_loss: 116_000, risk_points: 1_000, minimum_rr: 2, actual_rr: 3 },
      targets: { tp1: 112_000, tp2: 110_000, tp3: 108_000 },
    });
    const levels = aiSetupFromAnalysis(a);
    expect(levels!.direction).toBe("short");
    const draft = aiTradeDraft(a);
    expect(draft!.target).toBe(112_000);
    expect(draft!.riskReward).toBe(3);
  });

  test("invalid or missing levels are refused, never invented", () => {
    expect(aiSetupFromAnalysis(analysis({ direction: "NEUTRAL" }))).toBeNull();
    expect(
      aiSetupFromAnalysis(
        analysis({
          risk: { stop_loss: 116_000, risk_points: 1_000, minimum_rr: 2, actual_rr: 3 },
        }),
      ),
    ).toBeNull();
    expect(
      aiSetupFromAnalysis(
        analysis({
          entry: { zone_low: Number.NaN, zone_high: 115_200, current_price: 115_000, quality: "GOOD", confirmation_required: "" },
        }),
      ),
    ).toBeNull();
  });

  test("a target on the wrong side is dropped while levels remain drawable", () => {
    const a = analysis({ targets: { tp1: 113_000, tp2: 112_000, tp3: 111_000 } });
    expect(aiSetupFromAnalysis(a)).not.toBeNull();
    expect(aiTradeDraft(a)!.target).toBeNull();
  });

  test("chart overlays use violet AI zone lines and TP lines", () => {
    const spec = buildAiSetupOverlays(aiSetupFromAnalysis(analysis())!);
    expect(spec.lines.length).toBe(6); // zone low/high, SL, TP1-3
    expect(spec.lines.filter((l) => l.title.includes("AI ZONE")).length).toBe(2);
    expect(spec.lines.find((l) => l.title.includes("SL"))!.color).toBe("#FF1744");
    expect(spec.box!.target).toBe(123_000);

    const noAi = buildAiSetupOverlays(aiSetupFromAnalysis(analysis())!, {
      ...DEFAULT_OVERLAY_TOGGLES,
      ai: false,
    });
    expect(noAi.lines.some((l) => l.title.includes("AI ZONE"))).toBe(false);
  });

  test("saved setups dedupe identical analyses", () => {
    const a = analysis();
    const snap = savedSetupFromAnalysis(a)!;
    const first = upsertSavedSetup([], snap);
    expect(first.added).toBe(true);
    expect(first.list.length).toBe(1);
    const second = upsertSavedSetup(first.list, snap);
    expect(second.added).toBe(false);
    expect(second.list.length).toBe(1);
  });
});
