import { query } from "./_generated/server";

/* ============================================================================
   LEAN backtesting — connection status (design boundary).

   This query reports the *integration design* and its honest state. It never
   claims LEAN is running: the executor is a separate .NET service that must
   be deployed and configured (LEAN_API_URL secret) before any backtest can
   execute. The actual call lives in backtestAction.ts.
   ========================================================================== */

export const LEAN_DOCS = "docs/LEAN-INTEGRATION.md";

export const status = query({
  args: {},
  handler: async () => {
    return {
      engine: "QuantConnect LEAN",
      connected: false,
      executionLocation: "external .NET service (never in-browser, never in Convex)",
      docs: LEAN_DOCS,
      pending: [
        "Deploy a LEAN runner reachable over HTTPS",
        "Configure the LEAN_API_URL deployment secret",
        "Strategy serializer for the app's SMC/signal rules",
        "Historical data hosting for XAUUSD / XAGUSD / BTCUSD",
        "Reference-validation of executor metrics",
      ],
      availableMetrics: [
        "Drawdown",
        "Win rate",
        "Profit factor",
        "Expectancy",
        "Risk-adjusted performance (Sharpe)",
      ],
      note: "No backtest results are shown because no backtest has actually run.",
    };
  },
});
