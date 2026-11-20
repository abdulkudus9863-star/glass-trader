import { describe, expect, test } from "bun:test";
import {
  confirmedTargetHits,
  createPendingSetup,
  evaluateTrigger,
  isActive,
  setupExpiry,
  setupIdFor,
  type PendingAiSetup,
  type SetupCandidate,
} from "@/lib/paper-ai-order";
import type { AiSetupLevels } from "@/lib/paper-chart";

const shortLevels: AiSetupLevels = {
  analysisId: "da-1",
  decision: "SELL",
  confidence: "MEDIUM",
  direction: "short",
  entryZone: [58_853, 58_767],
  stopLoss: 59_380,
  takeProfits: [57_670, 57_100, 56_530],
  timestamp: 1_700_000_000_000,
};

const longLevels: AiSetupLevels = {
  ...shortLevels,
  analysisId: "da-2",
  decision: "BUY",
  direction: "long",
  entryZone: [114_800, 115_200],
  stopLoss: 114_000,
  takeProfits: [118_000, 120_000, 123_000],
};

const shortCandidate: SetupCandidate = {
  symbol: "BTCUSDT",
  timeframe: "15m",
  decision: "SELL",
  confidence: "MEDIUM",
  score: 78,
  riskReward: 2.4,
  levels: shortLevels,
};

const NOW = 1_700_000_000_000;

function pending(overrides: Partial<PendingAiSetup> = {}): PendingAiSetup {
  const built = createPendingSetup(shortCandidate, NOW);
  return { ...built.setup!, ...overrides };
}

describe("pending setup validation", () => {
  test("a valid SHORT analysis becomes a pending order with normalised zone", () => {
    const { ok, setup } = createPendingSetup(shortCandidate, NOW);
    expect(ok).toBe(true);
    expect(setup!.status).toBe("PENDING ENTRY");
    expect(setup!.entryLow).toBe(58_767);
    expect(setup!.entryHigh).toBe(58_853);
    expect(setup!.direction).toBe("short");
    expect(setup!.takeProfits).toEqual([57_670, 57_100, 56_530]);
    expect(setup!.symbol).toBe("BTCUSDT");
    expect(isActive(setup)).toBe(true);
  });

  test("a valid LONG analysis becomes a pending order too", () => {
    const { ok, setup } = createPendingSetup(
      { ...shortCandidate, decision: "BUY", confidence: "HIGH", levels: longLevels },
      NOW,
    );
    expect(ok).toBe(true);
    expect(setup!.direction).toBe("long");
    expect(setup!.stopLoss).toBe(114_000);
  });

  test("NO TRADE, WAIT and LOW confidence never become orders", () => {
    for (const decision of ["NO TRADE", "WAIT FOR SELL", "INVALIDATED", "INSUFFICIENT DATA"]) {
      const res = createPendingSetup({ ...shortCandidate, decision }, NOW);
      expect(res.ok).toBe(false);
      expect(res.setup).toBeNull();
      expect(res.reason).toBeTruthy();
    }
    const low = createPendingSetup({ ...shortCandidate, confidence: "LOW" }, NOW);
    expect(low.ok).toBe(false);
    expect(low.reason).toMatch(/LOW/);
  });

  test("invalid stop / target placement and weak R:R are rejected", () => {
    expect(
      createPendingSetup(
        { ...shortCandidate, levels: { ...shortLevels, stopLoss: 58_000 } },
        NOW,
      ).ok,
    ).toBe(false);
    expect(
      createPendingSetup(
        { ...shortCandidate, riskReward: 1 },
        NOW,
      ).reason,
    ).toMatch(/Risk\/reward/);
    expect(
      createPendingSetup(
        { ...shortCandidate, levels: { ...shortLevels, takeProfits: [59_000] } },
        NOW,
      ).ok,
    ).toBe(false);
    expect(
      createPendingSetup(
        { ...shortCandidate, levels: { ...shortLevels, takeProfits: [] } },
        NOW,
      ),
    ).toMatchObject({ ok: false });
  });

  test("setup ids are deterministic so duplicates cannot execute twice", () => {
    expect(setupIdFor(shortLevels)).toBe(setupIdFor({ ...shortLevels }));
    expect(setupIdFor(shortLevels)).not.toBe(setupIdFor(longLevels));
  });

  test("expiry is timeframe-bound and bounded", () => {
    expect(setupExpiry("15m", NOW)).toBe(NOW + 900_000 * 20);
    expect(setupExpiry("1m", NOW)).toBe(NOW + 2 * 3_600_000);
    expect(setupExpiry("1D", NOW)).toBe(NOW + 24 * 3_600_000);
  });
});

describe("trigger evaluation", () => {
  test("price inside the SHORT zone executes at the observed market price", () => {
    const result = evaluateTrigger(pending(), 58_800, NOW + 1_000, "BTCUSDT");
    expect(result).toEqual({ action: "execute", price: 58_800 });
  });

  test("price inside the LONG zone executes", () => {
    const setup = createPendingSetup(
      { ...shortCandidate, decision: "BUY", levels: longLevels },
      NOW,
    ).setup!;
    expect(evaluateTrigger(setup, 115_000, NOW + 1_000, "BTCUSDT")).toEqual({
      action: "execute",
      price: 115_000,
    });
  });

  test("price outside the zone waits; wrong symbol never triggers", () => {
    expect(evaluateTrigger(pending(), 57_000, NOW, "BTCUSDT").action).toBe("none");
    expect(evaluateTrigger(pending(), 58_800, NOW, "ETHUSDT").action).toBe("none");
  });

  test("expired setups can never execute", () => {
    const setup = pending();
    expect(evaluateTrigger(setup, 58_800, setup.expiresAt, "BTCUSDT")).toMatchObject({
      action: "expire",
    });
  });

  test("price that already blew through the stop is rejected, not filled", () => {
    expect(evaluateTrigger(pending(), 59_500, NOW, "BTCUSDT")).toMatchObject({
      action: "reject",
    });
    const long = createPendingSetup(
      { ...shortCandidate, decision: "BUY", levels: longLevels },
      NOW,
    ).setup!;
    expect(evaluateTrigger(long, 113_000, NOW, "BTCUSDT")).toMatchObject({
      action: "reject",
    });
  });

  test("cancelled, filled, rejected and expired setups are inert", () => {
    for (const status of ["CANCELLED", "FILLED", "REJECTED", "EXPIRED"] as const) {
      expect(evaluateTrigger(pending({ status }), 58_800, NOW, "BTCUSDT").action).toBe(
        "none",
      );
    }
  });

  test("no price means no action", () => {
    expect(evaluateTrigger(pending(), null, NOW, "BTCUSDT").action).toBe("none");
    expect(evaluateTrigger(null, 58_800, NOW, "BTCUSDT").action).toBe("none");
  });
});

describe("confirmed target hits", () => {
  test("targets are hit only when the recorded exit reached them", () => {
    expect(confirmedTargetHits("long", 118_500, [118_000, 120_000])).toEqual([118_000]);
    expect(confirmedTargetHits("short", 57_000, [57_670, 57_100, 56_530])).toEqual([
      57_670,
      57_100,
    ]);
    expect(confirmedTargetHits("long", null, [118_000])).toEqual([]);
    expect(confirmedTargetHits("long", 110_000, [118_000])).toEqual([]);
  });
});
