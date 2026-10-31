/* ============================================================================
   Feed status — the single source of truth for how the terminal labels its
   market-data pipeline.

   Honesty rules (spec B):
   - LIVE is only ever derived from real update age (provider-aware).
   - DELAYED / STALE are explicit and never collapsed into "LIVE".
   - ERROR and DISCONNECTED (socket reconnecting) are distinct states.
   - Every mapping here is a pure function so it can be unit tested.
   ========================================================================== */

/** Raw pipeline status reported by the kline stream. */
export type FeedStatus =
  | "CONNECTING"
  | "LIVE"
  | "STALE"
  | "RECONNECTING"
  | "RESYNCING"
  | "ERROR";

/** Spec-facing freshness label. OFFLINE is reserved (never claimed lightly). */
export type FeedFreshness = "LIVE" | "DELAYED" | "STALE" | "OFFLINE";

export type FeedSource = "binance" | "twelvedata" | null;

/**
 * Provider-aware freshness from the raw status + age of the last update.
 *
 * - ERROR / RECONNECTING / STALE never read as anything but STALE.
 * - CONNECTING / RESYNCING are at best DELAYED (we have history, no stream).
 * - Otherwise age thresholds: Binance streams every few seconds (30s LIVE,
 *   120s DELAYED); Twelve Data is polled (120s LIVE, 300s DELAYED).
 */
export function computeFreshness(
  status: FeedStatus,
  updatedAtMs: number | null,
  nowMs: number,
  source: FeedSource,
): FeedFreshness {
  if (status === "ERROR" || status === "RECONNECTING" || status === "STALE") {
    return "STALE";
  }
  if (status === "CONNECTING" || status === "RESYNCING") return "DELAYED";
  if (updatedAtMs === null) return "DELAYED";
  const ageSeconds = (nowMs - updatedAtMs) / 1000;
  const liveMax = source === "binance" ? 30 : 120;
  const delayedMax = source === "binance" ? 120 : 300;
  if (ageSeconds <= liveMax) return "LIVE";
  if (ageSeconds <= delayedMax) return "DELAYED";
  return "STALE";
}

export type FeedTone = "live" | "delayed" | "stale" | "error" | "neutral";

export interface FeedBadge {
  /** Short label shown on the chart: LIVE · BINANCE, DELAYED, STALE, ERROR, DISCONNECTED… */
  label: string;
  tone: FeedTone;
}

/**
 * Map (status, freshness, source) → the badge shown over the chart.
 * DISCONNECTED is what the user sees while the socket is reconnecting;
 * a delayed feed is never labeled LIVE.
 */
export function feedBadge(
  status: FeedStatus,
  freshness: FeedFreshness,
  source: FeedSource,
): FeedBadge {
  if (status === "ERROR") return { label: "ERROR", tone: "error" };
  if (status === "RECONNECTING") return { label: "DISCONNECTED", tone: "error" };
  if (status === "CONNECTING") return { label: "CONNECTING", tone: "neutral" };
  const suffix =
    source === "binance"
      ? " · BINANCE"
      : source === "twelvedata"
        ? " · TWELVEDATA"
        : "";
  /* A STALE pipeline status can never be dressed up as LIVE, whatever the
     freshness argument says — the stricter of the two always wins. */
  if (status === "STALE" || freshness === "STALE") {
    return { label: `STALE${suffix}`, tone: "stale" };
  }
  /* A resyncing stream is history-only until the socket catches up — at best
     DELAYED, never LIVE, regardless of the freshness argument. */
  if (status === "RESYNCING" || freshness === "DELAYED") {
    return { label: `DELAYED${suffix}`, tone: "delayed" };
  }
  if (freshness === "LIVE") return { label: `LIVE${suffix}`, tone: "live" };
  return { label: "OFFLINE", tone: "error" };
}
