# LEAN Backtesting Integration — Design & Status

**Project:** Glass Trader (AKVERSE Technologies)
**Engine:** [QuantConnect LEAN](https://github.com/QuantConnect/Lean)
**Status:** 🔴 **NOT CONNECTED — design boundary only, no backtest has ever run.**

---

## 1. Why LEAN cannot run inside this app

LEAN is a .NET algorithm engine with its own data downloader, scheduling and
brokerage simulation. This application is:

- a **browser** (React/Vite) — cannot host .NET, and
- a **Convex** backend (TypeScript isolates) — cannot host .NET either.

Therefore LEAN must run **out-of-process**. The app only ever talks to it over
HTTP through a single boundary action.

## 2. The integration boundary

```
 ┌─────────────────────────────── app (browser) ─────────────────────────────┐
 │  PaperTrading panel → "Backtest with LEAN" (reads status only)           │
 └──────────────────────────────────┬───────────────────────────────────────┘
                                    │ Convex action (authenticated)
 ┌──────────────────────────────────▼───────────────────────────────────────┐
 │  src/convex/backtestAction.ts  →  POST {LEAN_API_URL}/backtest           │
 │  src/convex/backtest.ts        →  status query (connected: false)        │
 └──────────────────────────────────┬───────────────────────────────────────┘
                                    │ HTTPS (only when LEAN_API_URL is set)
 ┌──────────────────────────────────▼───────────────────────────────────────┐
 │  External LEAN runner (Docker / QuantConnect Cloud) — NOT YET DEPLOYED   │
 │  .NET process: data feed → algorithm → metrics                           │
 └──────────────────────────────────────────────────────────────────────────┘
```

### Request contract

```
POST {LEAN_API_URL}/backtest
Content-Type: application/json

{
  "symbol": "XAUUSD",
  "timeframe": "15m",
  "strategy": { "kind": "smc-sweep-reversal", "params": { ... } },
  "settings": { "initialCapital": 100000, "commissionBps": 5, "slippageBps": 2 }
}
```

### Response contract

```
200 OK
{
  "ok": true,
  "metrics": {
    "totalReturnPct": 0,
    "maxDrawdownPct": 0,
    "winRate": 0,
    "profitFactor": 0,
    "expectancy": 0,
    "sharpe": 0,
    "trades": 0,
    "avgHoldBars": 0
  },
  "equityCurve": [{ "time": 0, "equity": 0 }],
  "trades": [{ "entryTime": 0, "exitTime": 0, "direction": "long",
               "entry": 0, "exit": 0, "pnl": 0 }]
}
```

Anything other than a well-formed `ok: true` response is **rejected and
surfaced as an error**. The client never substitutes locally simulated
results.

## 3. Behaviour today

| Condition | Result returned to the UI |
|---|---|
| `LEAN_API_URL` not configured (current state) | `LEAN_NOT_CONNECTED` + pending-work list |
| Not signed in | `UNAUTHORIZED` |
| Executor HTTP error / timeout / malformed payload | `LEAN_ERROR` with the verbatim message |
| Well-formed metrics | `ok: true, source: "lean"` (has never occurred) |

## 4. Pending work (honest checklist)

1. **Deploy a LEAN runner** — QuantConnect Cloud project or a Docker container
   running `QuantConnect.Lean.Launcher`, exposed over HTTPS with auth.
2. **Set the `LEAN_API_URL` secret** on the Convex deployment (never in
   client code, never in the repo).
3. **Strategy serializer** — translate the app's deterministic SMC/signal rules
   (BOS/CHoCH, FVG, sweeps, entry/SL/TP) into a LEAN `QCAlgorithm`.
4. **Historical data** — place XAUUSD / XAGUSD / BTCUSD candles in LEAN's
   data format at 1H / 15m / 5m resolution (or wire a LEAN data provider).
   The app's own candle history (`src/lib/market.ts` providers) is live-only
   and is not a substitute for a certified history feed.
5. **Reference validation** — replay a known-good backtest and verify the
   returned metrics match before surfacing any LEAN number in the UI.
6. **UI surfacing** — show drawdown / win rate / profit factor / expectancy /
   Sharpe in a Backtests section once step 5 passes.

## 5. Rules that must not be relaxed

- No LEAN metric is displayed unless it came from a real executor response.
- No local stand-in backtest is labelled "LEAN".
- Commission and slippage are always part of the request settings.
- Backtest results are labelled as historical simulation, never as a forecast.
