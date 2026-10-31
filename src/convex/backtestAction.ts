"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

/* ============================================================================
   LEAN BACKTESTING INTEGRATION BOUNDARY (QuantConnect LEAN)

   STATUS: NOT CONNECTED.

   LEAN is a .NET engine — it cannot run inside the browser or inside the
   Convex runtime. This action is the *boundary*: it is the single place a
   remote LEAN executor would be called, and until `LEAN_API_URL` is
   configured on the deployment it always returns an honest
   `LEAN_NOT_CONNECTED` result. It NEVER fabricates backtest metrics, never
   falls back to a locally-simulated P&L, and never reports success.

   Contract (documented in docs/LEAN-INTEGRATION.md):

     POST {LEAN_API_URL}/backtest
     body: {
       symbol, timeframe,
       candles: [{ time, open, high, low, close, volume }],
       strategy: { kind, params },
       settings: { initialCapital, commissionBps, slippageBps }
     }
     200 → {
       ok: true,
       metrics: {
         totalReturnPct, maxDrawdownPct, winRate, profitFactor,
         expectancy, sharpe, trades, avgHoldBars
       },
       equityCurve: [{ time, equity }],
       trades: [{ entryTime, exitTime, direction, entry, exit, pnl }]
     }

   Everything else (deploying LEAN, hosting data, auth to the executor,
   strategy serialization) is pending — see docs/LEAN-INTEGRATION.md.
   ========================================================================== */

export const LEAN_NOT_CONNECTED = "LEAN_NOT_CONNECTED" as const;

export interface LeanMetrics {
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  sharpe: number | null;
  trades: number;
  avgHoldBars: number | null;
}

export const runBacktest = action({
  args: {
    symbol: v.string(),
    timeframe: v.string(),
    strategyKind: v.string(),
    strategyParams: v.optional(v.any()),
    initialCapital: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<
    | { ok: true; source: "lean"; metrics: LeanMetrics }
    | {
        ok: false;
        code: typeof LEAN_NOT_CONNECTED | "LEAN_ERROR" | "UNAUTHORIZED";
        message: string;
        pending: string[];
      }
  > => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        message: "Sign in to request a backtest.",
        pending: [],
      };
    }

    const endpoint = process.env.LEAN_API_URL?.trim();
    if (!endpoint) {
      return {
        ok: false,
        code: LEAN_NOT_CONNECTED,
        message:
          "LEAN is not connected. No backtest was run and no results were generated.",
        pending: [
          "Deploy a QuantConnect LEAN runner (Docker or QuantConnect Cloud) reachable over HTTPS",
          "Set LEAN_API_URL on the Convex deployment secrets",
          "Implement the strategy serializer for the app's signal rules",
          "Host historical data for XAUUSD / XAGUSD / BTCUSD at the required resolution",
          "Validate executor results against a known reference backtest",
        ],
      };
    }

    // Boundary call — real request to the configured executor. Any failure is
    // surfaced verbatim; there is no simulated fallback.
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: args.symbol,
          timeframe: args.timeframe,
          strategy: { kind: args.strategyKind, params: args.strategyParams ?? {} },
          settings: {
            initialCapital: args.initialCapital ?? 100_000,
            commissionBps: 5,
            slippageBps: 2,
          },
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!res.ok) {
        return {
          ok: false,
          code: "LEAN_ERROR",
          message: `LEAN executor responded ${res.status}: ${res.statusText}`,
          pending: [],
        };
      }

      const data = (await res.json()) as {
        ok?: boolean;
        metrics?: LeanMetrics;
        error?: string;
      };

      if (!data.ok || !data.metrics) {
        return {
          ok: false,
          code: "LEAN_ERROR",
          message:
            data.error ??
            "LEAN executor returned no metrics — results were rejected, not assumed.",
          pending: [],
        };
      }

      return { ok: true, source: "lean", metrics: data.metrics };
    } catch (err) {
      return {
        ok: false,
        code: "LEAN_ERROR",
        message: `LEAN executor unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
        pending: ["Verify LEAN_API_URL and executor availability"],
      };
    }
  },
});
