/* ============================================================================
   Paper position exit monitor.

   One instance per symbol that currently has open paper positions. It reads
   the SAME live kline feed used by the charts (no extra AI, no synthetic
   prices) and evaluates every open position on that symbol with the pure
   `evaluatePaperExit` engine:

     - live mark ticks (instant, gap-aware),
     - candle high/low since the position opened (intrabar crossings),
     - the forming bar is handled by the mark, never by pre-entry extremes.

   Closes go through the existing `paper.closeTrade` mutation, which updates
   balance/history and is idempotent. An in-flight set plus a retry throttle
   make duplicate SL/TP execution impossible from this component.
   ========================================================================== */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { useKlines } from "@/hooks/use-klines";
import { evaluatePaperExit, closeReasonLabel } from "@/lib/paper-engine";

export interface MonitoredTrade {
  _id: Id<"paperTrades">;
  direction: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit?: number | null;
  openedAt: number;
}

export interface CloseTradeResult {
  alreadyClosed: boolean;
  trade: {
    exit?: number | null;
    closeReason?: string | null;
    realizedPnlInr?: number | null;
  };
}

export interface PaperExitMonitorProps {
  symbol: string;
  trades: readonly MonitoredTrade[];
  mark: number | null;
  closeTrade: (args: {
    tradeId: Id<"paperTrades">;
    exit: number;
    reason: "manual" | "stop" | "target";
  }) => Promise<CloseTradeResult>;
}

/** Retry a failed close no more than once every 8 seconds. */
const RETRY_MS = 8_000;

const inr = (n: number) =>
  n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

export default function PaperExitMonitor({
  symbol,
  trades,
  mark,
  closeTrade,
}: PaperExitMonitorProps) {
  // 5m candles give ~25h of history per fetch and update intrabar on every
  // trade for crypto; the chart's own subscription is unaffected.
  const { candles } = useKlines(symbol, "5m");
  const inFlight = useRef<Set<string>>(new Set());
  const lastAttempt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (trades.length === 0) return;
    const now = Date.now();

    for (const trade of trades) {
      const id = trade._id;
      if (inFlight.current.has(id)) continue;
      if (now - (lastAttempt.current.get(id) ?? 0) < RETRY_MS) continue;

      const trigger = evaluatePaperExit({
        direction: trade.direction,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        openedAt: trade.openedAt,
        mark,
        candles,
      });
      if (!trigger) continue;

      inFlight.current.add(id);
      lastAttempt.current.set(id, now);

      void (async () => {
        try {
          const res = await closeTrade({
            tradeId: trade._id,
            exit: trigger.price,
            reason: trigger.reason,
          });
          if (res.alreadyClosed) {
            // A retried close never double-counts P&L; nothing else to do.
            return;
          }
          const pnl = res.trade.realizedPnlInr ?? 0;
          console.info("[paper-engine] position closed", {
            tradeId: trade._id,
            symbol,
            direction: trade.direction,
            reason: trigger.reason,
            exit: trigger.price,
            via: trigger.via,
            candleTime: trigger.candleTime,
            pnlInr: pnl,
          });
          toast.success(
            `${closeReasonLabel(trigger.reason)} hit · closed ${trade.direction.toUpperCase()} ${symbol} @ ${trigger.price} · ${pnl >= 0 ? "+" : ""}${inr(pnl)} (simulation)`,
          );
        } catch (err) {
          // Allow a later retry — the position MUST NOT stay open silently.
          inFlight.current.delete(id);
          console.warn("[paper-engine] auto-close failed", {
            tradeId: trade._id,
            symbol,
            reason: trigger.reason,
            error: err instanceof Error ? err.message : String(err),
          });
          toast.error(
            err instanceof Error
              ? `Auto-close failed: ${err.message}`
              : "Auto-close failed — retrying while the position stays open.",
          );
        }
      })();
    }
  }, [trades, mark, candles, closeTrade, symbol]);

  return null;
}
