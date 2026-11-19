import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OVERLAY_TOGGLES,
  OVERLAY_COLORS,
  buildPreviewOverlays,
  buildTradeOverlays,
  formatOverlayPrice,
  previewRiskReward,
  type PaperTradeLike,
} from "../src/lib/paper-chart";

const openLong: PaperTradeLike = {
  _id: "t1",
  symbol: "BTCUSDT",
  direction: "long",
  entry: 60_000,
  stopLoss: 59_000,
  takeProfit: 62_500,
  status: "OPEN",
  size: 0.05,
};

const closedShort: PaperTradeLike = {
  _id: "t2",
  symbol: "XAUUSD",
  direction: "short",
  entry: 2_400,
  stopLoss: 2_420,
  takeProfit: 2_360,
  exit: 2_370,
  status: "CLOSED",
  size: 1.5,
  realizedPnlInr: 3_750,
};

describe("trade overlays", () => {
  test("long trade draws entry, SL and TP1 with the right colours", () => {
    const { lines, label } = buildTradeOverlays(openLong);
    expect(label).toBe("LONG BTCUSDT");
    expect(lines.map((l) => l.id)).toEqual([
      "t1:entry",
      "t1:sl",
      "t1:tp1",
    ]);
    expect(lines[0].price).toBe(60_000);
    expect(lines[0].color).toBe(OVERLAY_COLORS.entry);
    expect(lines[0].title).toContain("LONG BTCUSDT");
    expect(lines[1].price).toBe(59_000);
    expect(lines[1].color).toBe(OVERLAY_COLORS.stop);
    expect(lines[2].price).toBe(62_500);
    expect(lines[2].color).toBe(OVERLAY_COLORS.target);
    // no exit marker before the position is closed
    expect(lines.some((l) => l.id.endsWith("exit"))).toBe(false);
  });

  test("closed trade keeps entry + actual exit marker", () => {
    const { lines, label } = buildTradeOverlays(closedShort, DEFAULT_OVERLAY_TOGGLES, 2);
    expect(label).toBe("SHORT XAUUSD");
    const exit = lines.find((l) => l.id === "t2:exit");
    expect(exit).toBeDefined();
    expect(exit!.price).toBe(2_370);
    expect(exit!.color).toBe(OVERLAY_COLORS.exit);
    expect(exit!.dashed).toBe(false);
    expect(exit!.title).toContain("+₹3,750");
    // stored levels are unchanged by closing
    expect(lines.find((l) => l.id === "t2:entry")!.price).toBe(2_400);
    expect(lines.find((l) => l.id === "t2:sl")!.price).toBe(2_420);
  });

  test("risk/reward box uses entry, stop and the target (or exit)", () => {
    expect(buildTradeOverlays(openLong).box).toEqual({
      entry: 60_000,
      stop: 59_000,
      target: 62_500,
    });
    expect(buildTradeOverlays(closedShort).box).toEqual({
      entry: 2_400,
      stop: 2_420,
      target: 2_360,
    });
    const noTarget: PaperTradeLike = { ...openLong, takeProfit: undefined };
    expect(buildTradeOverlays(noTarget).box).toBeNull();
  });

  test("toggles hide individual levels without inventing others", () => {
    const onlyEntry = buildTradeOverlays(openLong, {
      entry: true,
      stop: false,
      targets: false,
      exit: false,
      box: false,
    });
    expect(onlyEntry.lines).toHaveLength(1);
    expect(onlyEntry.lines[0].id).toBe("t1:entry");
    expect(onlyEntry.box).toBeNull();
  });

  test("invalid levels are dropped instead of drawn at zero", () => {
    const bad: PaperTradeLike = {
      ...openLong,
      entry: Number.NaN,
      stopLoss: 0,
      takeProfit: -5,
    };
    const { lines, box } = buildTradeOverlays(bad);
    expect(lines).toHaveLength(0);
    expect(box).toBeNull();
  });
});

describe("form preview overlays", () => {
  test("long preview labels ENTRY/SL/TP as PREVIEW", () => {
    const { lines, box, label } = buildPreviewOverlays(
      { direction: "long", entry: 60_000, stop: 59_000, target: 62_000 },
      DEFAULT_OVERLAY_TOGGLES,
      2,
      "BTCUSDT",
    );
    expect(label).toBe("LONG preview");
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l.title).toContain("PREVIEW");
    expect(box).toEqual({ entry: 60_000, stop: 59_000, target: 62_000 });
  });

  test("short preview with no target shows entry and stop only", () => {
    const { lines, box } = buildPreviewOverlays(
      { direction: "short", entry: 2_400, stop: 2_420 },
      DEFAULT_OVERLAY_TOGGLES,
      2,
      "XAUUSD",
    );
    expect(lines.map((l) => l.id)).toEqual(["preview:entry", "preview:sl"]);
    expect(box).toBeNull();
  });

  test("risk/reward maths matches the form", () => {
    expect(previewRiskReward(60_000, 59_000, 62_000)).toBe(2);
    expect(previewRiskReward(2_400, 2_420, 2_360)).toBe(2);
    expect(previewRiskReward(100, 100, 110)).toBeNull();
    expect(previewRiskReward(100, 90)).toBeNull();
  });

  test("price formatting respects symbol decimals", () => {
    expect(formatOverlayPrice(2_400, 2)).toBe("2,400.00");
    expect(formatOverlayPrice(0.12345, 5)).toBe("0.12345");
  });
});
