/**
 * Part B — feed status labels.
 *
 * The core honesty rule: delayed/stale/disconnected data is never labeled
 * LIVE. Every mapping is a pure function in src/lib/feed-status.ts.
 */
import { describe, expect, test } from "bun:test";
import { computeFreshness, feedBadge } from "../src/lib/feed-status";

const NOW = 1_700_000_000_000;

describe("computeFreshness — provider-aware age thresholds", () => {
  test("Binance: 10s old → LIVE, 60s → DELAYED, 200s → STALE", () => {
    expect(computeFreshness("LIVE", NOW - 10_000, NOW, "binance")).toBe("LIVE");
    expect(computeFreshness("LIVE", NOW - 60_000, NOW, "binance")).toBe("DELAYED");
    expect(computeFreshness("LIVE", NOW - 200_000, NOW, "binance")).toBe("STALE");
  });

  test("Twelve Data (polled): 60s → LIVE, 200s → DELAYED, 400s → STALE", () => {
    expect(computeFreshness("LIVE", NOW - 60_000, NOW, "twelvedata")).toBe("LIVE");
    expect(computeFreshness("LIVE", NOW - 200_000, NOW, "twelvedata")).toBe("DELAYED");
    expect(computeFreshness("LIVE", NOW - 400_000, NOW, "twelvedata")).toBe("STALE");
  });

  test("ERROR / RECONNECTING / STALE never read as LIVE or DELAYED", () => {
    const fresh = NOW - 1000; // even with a just-updated timestamp
    expect(computeFreshness("ERROR", fresh, NOW, "binance")).toBe("STALE");
    expect(computeFreshness("RECONNECTING", fresh, NOW, "binance")).toBe("STALE");
    expect(computeFreshness("STALE", fresh, NOW, "twelvedata")).toBe("STALE");
  });

  test("CONNECTING / RESYNCING are at best DELAYED", () => {
    expect(computeFreshness("CONNECTING", null, NOW, "binance")).toBe("DELAYED");
    expect(computeFreshness("RESYNCING", NOW - 1000, NOW, "binance")).toBe("DELAYED");
  });

  test("no update timestamp → never LIVE", () => {
    expect(computeFreshness("LIVE", null, NOW, "binance")).toBe("DELAYED");
    expect(computeFreshness("LIVE", null, NOW, "twelvedata")).toBe("DELAYED");
  });

  test("freshness decays to STALE as time passes with no updates", () => {
    let t = NOW;
    expect(computeFreshness("LIVE", t, t, "binance")).toBe("LIVE");
    t += 31_000;
    expect(computeFreshness("LIVE", t - 31_000, t, "binance")).toBe("DELAYED");
    t += 90_000; // 121s total
    expect(computeFreshness("LIVE", t - 121_000, t, "binance")).toBe("STALE");
  });
});

describe("feedBadge — what the chart shows", () => {
  test("labels carry the five required states", () => {
    expect(feedBadge("LIVE", "LIVE", "binance").label).toBe("LIVE · BINANCE");
    expect(feedBadge("LIVE", "DELAYED", "twelvedata").label).toBe(
      "DELAYED · TWELVEDATA",
    );
    expect(feedBadge("LIVE", "STALE", "binance").label).toBe("STALE · BINANCE");
    expect(feedBadge("ERROR", "STALE", null).label).toBe("ERROR");
    expect(feedBadge("RECONNECTING", "STALE", "binance").label).toBe("DISCONNECTED");
    expect(feedBadge("CONNECTING", "DELAYED", null).label).toBe("CONNECTING");
  });

  test("a badge only ever says LIVE when freshness is LIVE", () => {
    const statuses = [
      "CONNECTING",
      "LIVE",
      "STALE",
      "RECONNECTING",
      "RESYNCING",
      "ERROR",
    ] as const;
    const freshnesses = ["LIVE", "DELAYED", "STALE", "OFFLINE"] as const;
    for (const s of statuses) {
      for (const f of freshnesses) {
        for (const src of ["binance", "twelvedata", null] as const) {
          const b = feedBadge(s, f, src);
          if (b.label.startsWith("LIVE")) {
            expect(s).toBe("LIVE");
            expect(f).toBe("LIVE");
          }
          // DELAYED / STALE feeds are never dressed up as live
          if (f === "DELAYED" || f === "STALE") {
            expect(b.label.startsWith("LIVE")).toBe(false);
          }
        }
      }
    }
  });

  test("tone mapping for color coding", () => {
    expect(feedBadge("LIVE", "LIVE", "binance").tone).toBe("live");
    expect(feedBadge("LIVE", "DELAYED", null).tone).toBe("delayed");
    expect(feedBadge("LIVE", "STALE", null).tone).toBe("stale");
    expect(feedBadge("ERROR", "STALE", null).tone).toBe("error");
    expect(feedBadge("RECONNECTING", "STALE", null).tone).toBe("error");
    expect(feedBadge("CONNECTING", "DELAYED", null).tone).toBe("neutral");
  });
});
