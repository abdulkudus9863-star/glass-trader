import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  FlaskConical,
  History,
  LineChart,
  Loader2,
  Plus,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { paperPnlInr } from "@/lib/paper-pnl";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useKlines } from "@/hooks/use-klines";
import type { TimeframeId } from "@/lib/market";
import type { PaperTradeLike } from "@/lib/paper-chart";
import PaperTradeChart from "./PaperTradeChart";

/* ============================================================================
   PAPER TRADING — simulation panel.

   Every position here is a record in Convex, not an order. There is no broker
   integration anywhere in this codebase and live trading stays disabled.
   Prices come from the app's real market feed (Binance / Twelve Data); when a
   mark price is unavailable the panel shows "no quote" instead of inventing
   one. INR values use the account's user-set USD/INR conversion assumption,
   which is labelled as an assumption.
   ========================================================================== */

const FORM_SYMBOLS = [
  "XAUUSD",
  "XAGUSD",
  "BTCUSDT",
  "BTCUSD",
  "ETHUSDT",
  "EURUSD",
  "GBPUSD",
] as const;

const isFormSymbol = (id: string): boolean =>
  (FORM_SYMBOLS as readonly string[]).includes(id);

const SYMBOL_LABELS: Record<string, string> = {
  XAUUSD: "Gold · XAU/USD",
  XAGUSD: "Silver · XAG/USD",
  BTCUSDT: "Bitcoin · BTC/USDT",
  BTCUSD: "Bitcoin · BTC/USD",
  ETHUSDT: "Ethereum · ETH/USDT",
  EURUSD: "Euro · EUR/USD",
  GBPUSD: "Pound · GBP/USD",
};

const inr = (n: number, digits = 0) =>
  n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const num = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#1B263B] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface PaperTradingProps {
  /** Instrument/timeframe from the top chart selector — kept in sync. */
  activeSymbolId?: string;
  activeIntervalId?: TimeframeId;
  onSymbolChange?: (symbolId: string) => void;
  onIntervalChange?: (intervalId: TimeframeId) => void;
}

export default function PaperTrading({
  activeSymbolId,
  activeIntervalId,
  onSymbolChange,
  onIntervalChange,
}: PaperTradingProps = {}) {
  /* ------------------------------- data -------------------------------- */
  const account = useQuery(api.paper.account);
  const trades = useQuery(api.paper.listTrades);
  const summary = useQuery(api.paper.summary);
  const leanStatus = useQuery(api.backtest.status);

  const ensureAccount = useMutation(api.paper.ensureAccount);
  const updateSettings = useMutation(api.paper.updateSettings);
  const openTrade = useMutation(api.paper.openTrade);
  const closeTrade = useMutation(api.paper.closeTrade);
  const deleteTrade = useMutation(api.paper.deleteTrade);
  const resetAccount = useMutation(api.paper.resetAccount);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const marks = useMarketSnapshot(FORM_SYMBOLS as unknown as string[]);

  useEffect(() => {
    if (account === null) {
      ensureAccount({}).catch(() => {
        /* handled by the error toast below */
      });
    }
  }, [account, ensureAccount]);

  /* ------------------------------ settings ------------------------------ */
  const [balanceInput, setBalanceInput] = useState("");
  const [riskInput, setRiskInput] = useState("");
  const [dailyInput, setDailyInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  /* Sync the settings fields when server values change — done during render
     (React's documented pattern) rather than in an effect, so typing is never
     clobbered mid-edit and there is no cascading effect render. */
  const settingsKey = account
    ? `${account.balance}:${account.riskPercent}:${account.maxDailyLoss}:${account.usdInrRate}`
    : "";
  const [prevSettingsKey, setPrevSettingsKey] = useState("");
  if (settingsKey && settingsKey !== prevSettingsKey) {
    setPrevSettingsKey(settingsKey);
    setBalanceInput(String(account!.balance));
    setRiskInput(String(account!.riskPercent));
    setDailyInput(String(account!.maxDailyLoss));
    setRateInput(String(account!.usdInrRate));
  }

  const saveSettings = async () => {
    if (!account) return;
    setSavingSettings(true);
    try {
      await updateSettings({
        balance: Number(balanceInput),
        riskPercent: Number(riskInput),
        maxDailyLoss: Number(dailyInput),
        usdInrRate: Number(rateInput),
      });
      toast.success("Risk settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  /* ---------------------------- open a trade ---------------------------- */
  const [symbol, setSymbol] = useState<string>(
    activeSymbolId && isFormSymbol(activeSymbolId) ? activeSymbolId : "XAUUSD",
  );
  const [intervalId, setIntervalId] = useState<TimeframeId>(
    activeIntervalId ?? "15m",
  );

  // Follow the top selector when the user changes the pane instrument/timeframe
  // (render-time sync keeps the form, chart and header in lockstep).
  const [syncedSymbol, setSyncedSymbol] = useState<string | undefined>(activeSymbolId);
  if (activeSymbolId !== syncedSymbol) {
    setSyncedSymbol(activeSymbolId);
    if (activeSymbolId && isFormSymbol(activeSymbolId)) setSymbol(activeSymbolId);
  }
  const [syncedInterval, setSyncedInterval] = useState<TimeframeId | undefined>(
    activeIntervalId,
  );
  if (activeIntervalId !== syncedInterval) {
    setSyncedInterval(activeIntervalId);
    if (activeIntervalId) setIntervalId(activeIntervalId);
  }
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [sizeOverride, setSizeOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const resetToken = () => {
    tokenRef.current = null;
  };

  /* Symbol/timeframe changes propagate to the dashboard's top selector, so the
     form, chart and header can never show different instruments. */
  const changeSymbol = (next: string) => {
    setSymbol(next);
    resetToken();
    onSymbolChange?.(next);
  };

  const changeInterval = (next: TimeframeId) => {
    setIntervalId(next);
    onIntervalChange?.(next);
  };


  // If the top selector points at an instrument paper trading cannot store,
  // pull the selector onto this page's instrument instead of disagreeing.
  useEffect(() => {
    if (!activeSymbolId || isFormSymbol(activeSymbolId)) return;
    onSymbolChange?.(symbol);
  }, [activeSymbolId, symbol, onSymbolChange]);

  const e = parseFloat(entry);
  const s = parseFloat(stop);
  const t = parseFloat(target);
  const balance = account?.balance ?? 0;
  const riskPercent = account?.riskPercent ?? 1;
  const rate = account?.usdInrRate ?? 83.5;
  const riskInr = (balance * riskPercent) / 100;
  const validPrices = Number.isFinite(e) && e > 0 && Number.isFinite(s) && s > 0 && s !== e;
  const stopWrongSide =
    validPrices &&
    ((direction === "long" && s >= e) || (direction === "short" && s <= e));
  const riskPerUnit = validPrices ? Math.abs(e - s) : 0;
  const autoSize =
    validPrices && riskPerUnit > 0 && rate > 0 ? riskInr / rate / riskPerUnit : null;
  const chosenSize = sizeOverride.trim() ? parseFloat(sizeOverride) : autoSize;
  const rr =
    validPrices && Number.isFinite(t) && t > 0 && riskPerUnit > 0
      ? Math.abs(t - e) / riskPerUnit
      : null;

  /* Live preview of the unsaved form on the chart (direction/target update
     immediately as the user types or flips LONG/SHORT). */
  const chartPreview = useMemo(
    () =>
      validPrices && s !== e
        ? {
            direction,
            entry: e,
            stop: s,
            target: Number.isFinite(t) && t > 0 ? t : undefined,
          }
        : null,
    [validPrices, s, e, direction, t],
  );

  const canSubmit =
    !!account &&
    validPrices &&
    !stopWrongSide &&
    !!chosenSize &&
    Number.isFinite(chosenSize) &&
    chosenSize > 0 &&
    !submitting;

  const submitTrade = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      tokenRef.current ??= (crypto.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const res = await openTrade({
        symbol,
        direction,
        entry: e,
        stopLoss: s,
        takeProfit: Number.isFinite(t) && t > 0 ? t : undefined,
        size: sizeOverride.trim() ? chosenSize : undefined,
        clientToken: tokenRef.current,
      });
      if (res.duplicate) {
        toast.info("That trade was already recorded — no duplicate created.");
      } else {
        toast.success(
          `${direction === "long" ? "LONG" : "SHORT"} ${symbol} recorded (simulation).`,
        );
        setSelectedTradeId(res.trade._id);
        setEntry("");
        setStop("");
        setTarget("");
        setSizeOverride("");
        resetToken();
      }
    } catch (err) {
      resetToken();
      toast.error(err instanceof Error ? err.message : "Could not open the position.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------ positions ----------------------------- */
  const openTrades = useMemo(
    () => (trades ?? []).filter((t) => t.status === "OPEN"),
    [trades],
  );
  const closedTrades = useMemo(
    () => (trades ?? []).filter((t) => t.status === "CLOSED"),
    [trades],
  );

  const markFor = (sym: string): number | null => marks[sym]?.price ?? null;

  /* ------------------------------ chart data ---------------------------- */
  const chartTrades: PaperTradeLike[] = useMemo(
    () =>
      (trades ?? []).map((t) => ({
        _id: t._id,
        symbol: t.symbol,
        direction: t.direction,
        entry: t.entry,
        stopLoss: t.stopLoss,
        takeProfit: t.takeProfit,
        exit: t.exit,
        status: t.status,
        size: t.size,
        realizedPnlInr: t.realizedPnlInr,
        closedAt: t.closedAt,
      })),
    [trades],
  );

  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  /** Selected trade, defaulting to the newest record for the current symbol. */
  const selectedTrade = useMemo(() => {
    const chosen = chartTrades.find((t) => t._id === selectedTradeId);
    if (chosen && chosen.symbol === symbol) return chosen;
    return chartTrades.find((t) => t.symbol === symbol) ?? null;
  }, [chartTrades, selectedTradeId, symbol]);

  const klines = useKlines(symbol, intervalId);

  const selectChartTrade = (id: string | null) => {
    setSelectedTradeId(id);
    if (!id) return;
    const target = chartTrades.find((t) => t._id === id);
    if (target && target.symbol !== symbol) changeSymbol(target.symbol);
  };

  const selectedMark = selectedTrade ? markFor(selectedTrade.symbol) : null;
  const selectedPnlInr =
    selectedTrade && selectedTrade.status === "OPEN" && selectedMark != null
      ? paperPnlInr(
          selectedTrade.direction,
          selectedTrade.entry,
          selectedMark,
          selectedTrade.size,
          rate,
        )
      : null;

  const [exitInputs, setExitInputs] = useState<Record<string, string>>({});
  const [closingId, setClosingId] = useState<string | null>(null);

  const closePosition = async (tradeId: Id<"paperTrades">) => {
    const trade = openTrades.find((t) => t._id === tradeId);
    if (!trade) return;
    const typed = exitInputs[tradeId]?.trim();
    const fallback = markFor(trade.symbol);
    const exitPrice = typed ? parseFloat(typed) : fallback;
    if (!exitPrice || !Number.isFinite(exitPrice) || exitPrice <= 0) {
      toast.error("Enter an exit price — no live quote is available for this symbol.");
      return;
    }
    const reason =
      exitPrice === trade.stopLoss
        ? "stop"
        : trade.takeProfit !== undefined && exitPrice === trade.takeProfit
          ? "target"
          : "manual";
    setClosingId(tradeId);
    try {
      const res = await closeTrade({ tradeId: trade._id, exit: exitPrice, reason });
      if (res.alreadyClosed) {
        toast.info("That position was already closed.");
      } else {
        const pnl = res.trade.realizedPnlInr ?? 0;
        toast.success(
          `Position closed · ${pnl >= 0 ? "+" : ""}${inr(pnl)} (simulation)`,
        );
      }
      setExitInputs((prev) => {
        const next = { ...prev };
        delete next[tradeId];
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close the position.");
    } finally {
      setClosingId(null);
    }
  };

  const discardOpen = async (tradeId: Id<"paperTrades">) => {
    try {
      await deleteTrade({ tradeId });
      toast.info("Open record discarded (no balance change).");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not discard.");
    }
  };

  /* ------------------------------ analytics ----------------------------- */
  const stats = summary?.stats;

  /* ------------------------------- render ------------------------------- */
  if (account === undefined || summary === undefined) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-[#F4C430]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-[#00F0FF]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#00F0FF]">
              Paper Trading
            </p>
          </div>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            Simulated account · INR
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Practice with live market prices and your own risk rules. No real
            orders are ever sent — live trading is disabled by design.
          </p>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
          Simulation only
        </span>
      </div>

      {/* Account summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Virtual balance"
          value={inr(account?.balance ?? 0)}
          hint={`Started ${inr(account?.startingBalance ?? 0)}`}
        />
        <Stat
          label="Today's realized P&L"
          value={`${(summary?.dailyPnlInr ?? 0) >= 0 ? "+" : ""}${inr(summary?.dailyPnlInr ?? 0)}`}
          accent={
            (summary?.dailyPnlInr ?? 0) > 0
              ? "text-emerald-400"
              : (summary?.dailyPnlInr ?? 0) < 0
                ? "text-rose-400"
                : "text-foreground"
          }
          hint="UTC day"
        />
        <Stat
          label="Open positions"
          value={String(summary?.openCount ?? 0)}
          hint={`At risk: ${inr(summary?.openRiskInr ?? 0)}`}
        />
        <Stat
          label="Closed trades"
          value={String(summary?.closedCount ?? 0)}
          hint={`Net ${inr(stats?.totalPnlInr ?? 0)}`}
        />
      </div>

      {summary?.dailyLossHit && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-400" />
          <p className="text-xs leading-5 text-rose-300">
            Daily loss limit reached for this UTC day — new positions are
            blocked until tomorrow or until you raise the limit in risk settings.
          </p>
        </div>
      )}

      {/* Integrated chart — the central visual of the page, above the form */}
      <div id="paper-chart" className="mb-4 scroll-mt-4">
        <PaperTradeChart
          symbolId={symbol}
          intervalId={intervalId}
          onIntervalChange={changeInterval}
          klines={klines}
          trades={chartTrades}
          selectedTradeId={selectedTrade?._id ?? null}
          onSelectTrade={selectChartTrade}
          selectedPnlInr={selectedPnlInr}
          preview={chartPreview}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Risk settings */}
        <section className="rounded-2xl border border-[#1B263B] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="size-4 text-[#F4C430]" />
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Risk settings
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pt-balance" className="text-[11px] text-muted-foreground">
                Account balance (₹)
              </Label>
              <Input
                id="pt-balance"
                type="number"
                value={balanceInput}
                onChange={(ev) => setBalanceInput(ev.target.value)}
                className="h-9 bg-white/[0.03] tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pt-risk" className="text-[11px] text-muted-foreground">
                Risk per trade (%)
              </Label>
              <Input
                id="pt-risk"
                type="number"
                step="0.1"
                value={riskInput}
                onChange={(ev) => setRiskInput(ev.target.value)}
                className="h-9 bg-white/[0.03] tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pt-daily" className="text-[11px] text-muted-foreground">
                Max daily loss (₹, 0 = off)
              </Label>
              <Input
                id="pt-daily"
                type="number"
                value={dailyInput}
                onChange={(ev) => setDailyInput(ev.target.value)}
                className="h-9 bg-white/[0.03] tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pt-rate" className="text-[11px] text-muted-foreground">
                USD/INR assumption
              </Label>
              <Input
                id="pt-rate"
                type="number"
                step="0.01"
                value={rateInput}
                onChange={(ev) => setRateInput(ev.target.value)}
                className="h-9 bg-white/[0.03] tabular-nums"
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            INR values convert USD-quoted P&L with the rate above — set it to
            your broker's rate. It is an assumption, not a live FX quote.
          </p>
          <Button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="mt-3 h-9 w-full cursor-pointer rounded-xl bg-[#F4C430] text-[11px] font-bold text-[#0a0e1a] hover:bg-[#F4C430]/85"
          >
            {savingSettings ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              "Save risk settings"
            )}
          </Button>

          {/* Reset — destructive, explicitly confirmed, audited server-side */}
          <div className="mt-4 border-t border-[#1B263B] pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF1744]">
              Reset paper account
            </p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Deletes this account&apos;s simulated trades and restores the
              starting balance. Your login, token wallet and real data are never
              touched, and the reset is recorded in an audit log.
            </p>
            {!resetConfirmOpen ? (
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="mt-2 h-8 w-full rounded-lg border border-[#FF1744]/30 bg-[#FF1744]/10 text-[11px] font-bold text-[#FF1744] hover:bg-[#FF1744]/20"
              >
                Reset simulated account…
              </button>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => setResetConfirmOpen(false)}
                  className="h-8 flex-1 rounded-lg border border-[#1B263B] text-[11px] font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={async () => {
                    setResetting(true);
                    try {
                      const res = await resetAccount({ confirm: "RESET" });
                      toast.success(
                        `Paper account reset — ${res.removedTrades} trade${res.removedTrades === 1 ? "" : "s"} removed.`,
                      );
                      setResetConfirmOpen(false);
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Reset failed.",
                      );
                    } finally {
                      setResetting(false);
                    }
                  }}
                  className="h-8 flex-1 rounded-lg bg-[#FF1744] text-[11px] font-bold text-white disabled:opacity-50"
                >
                  {resetting ? "Resetting…" : "Confirm reset"}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* New position */}
        <section className="rounded-2xl border border-[#1B263B] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="size-4 text-[#00E676]" />
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              New simulated position
            </h3>
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pt-symbol" className="text-[11px] text-muted-foreground">
                  Instrument
                </Label>
                <select
                  id="pt-symbol"
                  value={symbol}
                  onChange={(ev) => changeSymbol(ev.target.value)}
                  className="h-9 rounded-md border border-input bg-white/[0.03] px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {FORM_SYMBOLS.map((s) => (
                    <option key={s} value={s} className="bg-[#0b101b] text-foreground">
                      {SYMBOL_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Direction</Label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("long");
                      resetToken();
                    }}
                    className={cn(
                      "h-9 flex-1 cursor-pointer rounded-md text-xs font-bold transition-colors",
                      direction === "long"
                        ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                        : "bg-white/[0.03] text-slate-400 hover:text-emerald-400",
                    )}
                  >
                    LONG
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection("short");
                      resetToken();
                    }}
                    className={cn(
                      "h-9 flex-1 cursor-pointer rounded-md text-xs font-bold transition-colors",
                      direction === "short"
                        ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40"
                        : "bg-white/[0.03] text-slate-400 hover:text-rose-400",
                    )}
                  >
                    SHORT
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pt-entry" className="text-[11px] text-muted-foreground">
                  Entry
                </Label>
                <Input
                  id="pt-entry"
                  type="number"
                  placeholder={num(markFor(symbol) ?? 0, 2)}
                  value={entry}
                  onChange={(ev) => {
                    setEntry(ev.target.value);
                    resetToken();
                  }}
                  className="h-9 bg-white/[0.03] tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pt-stop" className="text-[11px] text-muted-foreground">
                  Stop loss
                </Label>
                <Input
                  id="pt-stop"
                  type="number"
                  value={stop}
                  onChange={(ev) => {
                    setStop(ev.target.value);
                    resetToken();
                  }}
                  className="h-9 bg-white/[0.03] tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pt-target" className="text-[11px] text-muted-foreground">
                  Target (opt.)
                </Label>
                <Input
                  id="pt-target"
                  type="number"
                  value={target}
                  onChange={(ev) => {
                    setTarget(ev.target.value);
                    resetToken();
                  }}
                  className="h-9 bg-white/[0.03] tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pt-size" className="text-[11px] text-muted-foreground">
                  Size (blank = auto)
                </Label>
                <Input
                  id="pt-size"
                  type="number"
                  step="any"
                  value={sizeOverride}
                  onChange={(ev) => {
                    setSizeOverride(ev.target.value);
                    resetToken();
                  }}
                  className="h-9 bg-white/[0.03] tabular-nums"
                />
              </div>
              <div className="col-span-2 flex items-end">
                <div className="grid w-full grid-cols-3 gap-2 rounded-lg border border-[#1B263B] bg-white/[0.03] px-3 py-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Risk
                    </p>
                    <p className="text-xs font-bold tabular-nums text-rose-400">
                      {inr(riskInr)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Size
                    </p>
                    <p className="text-xs font-bold tabular-nums text-foreground">
                      {chosenSize && Number.isFinite(chosenSize)
                        ? num(chosenSize, 4)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      R:R
                    </p>
                    <p className="text-xs font-bold tabular-nums text-[#F4C430]">
                      {rr !== null ? `1:${num(rr, 2)}` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {stopWrongSide && (
              <p className="flex items-center gap-1.5 text-xs text-rose-400">
                <AlertTriangle className="size-3.5" />
                {direction === "long"
                  ? "Stop must be below entry for a long."
                  : "Stop must be above entry for a short."}
              </p>
            )}

            <Button
              type="button"
              onClick={submitTrade}
              disabled={!canSubmit}
              className={cn(
                "h-10 w-full cursor-pointer rounded-xl text-xs font-bold",
                canSubmit
                  ? "bg-[#00E676]/15 text-[#00E676] ring-1 ring-[#00E676]/40 hover:bg-[#00E676]/25"
                  : "cursor-not-allowed bg-white/[0.03] text-slate-500",
              )}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Open simulated position"
              )}
            </Button>
          </div>
        </section>
      </div>

      {/* Open positions */}
      <section className="mt-4 rounded-2xl border border-[#1B263B] bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LineChart className="size-4 text-[#F4C430]" />
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Open positions
            </h3>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {openTrades.length} open · unrealized P&L uses live marks · one exit per
            position (partial exits are not modelled)
          </span>
        </div>

        {openTrades.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#1B263B] px-3 py-6 text-center text-xs text-muted-foreground">
            No open positions. Record a simulated trade above — entries are only
            kept after you confirm them here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {openTrades.map((t) => {
              const mark = markFor(t.symbol);
              const unreal =
                mark !== null
                  ? paperPnlInr(t.direction, t.entry, mark, t.size, rate)
                  : null;
              const exitValue = exitInputs[t._id] ?? (mark !== null ? String(mark) : "");
              return (
                <div
                  key={t._id}
                  className="grid grid-cols-2 items-end gap-3 rounded-xl border border-[#1B263B] bg-white/[0.03] p-3 sm:grid-cols-4 lg:grid-cols-6"
                >
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {t.symbol}
                      <span
                        className={cn(
                          "ml-1.5 rounded px-1 py-px text-[9px] font-bold",
                          t.direction === "long"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400",
                        )}
                      >
                        {t.direction.toUpperCase()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          selectChartTrade(t._id);
                          document
                            .getElementById("paper-chart")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="ml-1.5 rounded border border-[#1B263B] px-1 py-px text-[9px] font-semibold text-slate-400 hover:text-[#F4C430]"
                      >
                        On chart
                      </button>
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {num(t.entry, 2)} → SL {num(t.stopLoss, 2)}
                      {t.takeProfit !== undefined ? ` · TP ${num(t.takeProfit, 2)}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Size
                    </p>
                    <p className="text-xs font-bold tabular-nums text-foreground">
                      {num(t.size, 4)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Mark
                    </p>
                    <p className="text-xs font-bold tabular-nums text-foreground">
                      {mark !== null ? num(mark, 2) : "no quote"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Unrealized
                    </p>
                    <p
                      className={cn(
                        "text-xs font-bold tabular-nums",
                        unreal === null
                          ? "text-muted-foreground"
                          : unreal >= 0
                            ? "text-emerald-400"
                            : "text-rose-400",
                      )}
                    >
                      {unreal === null
                        ? "—"
                        : `${unreal >= 0 ? "+" : ""}${inr(unreal)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Exit price
                    </p>
                    <Input
                      type="number"
                      value={exitValue}
                      onChange={(ev) =>
                        setExitInputs((prev) => ({ ...prev, [t._id]: ev.target.value }))
                      }
                      className="h-8 bg-white/[0.03] text-xs tabular-nums"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      onClick={() => closePosition(t._id)}
                      disabled={closingId === t._id}
                      className="h-8 flex-1 cursor-pointer rounded-lg bg-[#F4C430]/15 text-[10px] font-bold text-[#F4C430] ring-1 ring-[#F4C430]/40 hover:bg-[#F4C430]/25"
                    >
                      {closingId === t._id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Close"
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={() => discardOpen(t._id)}
                      title="Discard record without changing the balance"
                      className="h-8 w-8 cursor-pointer rounded-lg border border-[#1B263B] text-slate-500 transition-colors hover:text-rose-400"
                    >
                      <X className="mx-auto size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* History */}
      <section className="mt-4 rounded-2xl border border-[#1B263B] bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="size-4 text-[#00F0FF]" />
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            Trade history
          </h3>
        </div>
        {closedTrades.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#1B263B] px-3 py-6 text-center text-xs text-muted-foreground">
            No closed trades yet — realized P&L and performance stats appear
            after your first position is closed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 font-semibold">Closed</th>
                  <th className="pb-2 font-semibold">Symbol</th>
                  <th className="pb-2 font-semibold">Side</th>
                  <th className="pb-2 text-right font-semibold">Entry → Exit</th>
                  <th className="pb-2 text-right font-semibold">Reason</th>
                  <th className="pb-2 text-right font-semibold">Realized P&L</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.slice(0, 50).map((t) => (
                  <tr key={t._id} className="border-t border-[#1B263B]/70">
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {new Date(t.closedAt ?? t._creationTime).toLocaleString()}
                    </td>
                    <td className="py-2 font-semibold text-foreground">
                      <button
                        type="button"
                        onClick={() => {
                          selectChartTrade(t._id);
                          document
                            .getElementById("paper-chart")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="hover:text-[#F4C430]"
                        title="Show entry and exit markers on the chart"
                      >
                        {t.symbol}
                      </button>
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-px text-[9px] font-bold",
                          t.direction === "long"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400",
                        )}
                      >
                        {t.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      {num(t.entry, 2)} → {t.exit !== undefined ? num(t.exit, 2) : "—"}
                    </td>
                    <td className="py-2 text-right text-[10px] uppercase text-muted-foreground">
                      {t.closeReason ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right font-bold tabular-nums",
                        (t.realizedPnlInr ?? 0) >= 0
                          ? "text-emerald-400"
                          : "text-rose-400",
                      )}
                    >
                      {(t.realizedPnlInr ?? 0) >= 0 ? "+" : ""}
                      {inr(t.realizedPnlInr ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Analytics */}
      <section className="mt-4 rounded-2xl border border-[#1B263B] bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            Performance analytics
          </h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
              (stats?.sampleSize ?? 0) >= 20
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/15 text-amber-400",
            )}
          >
            {(stats?.sampleSize ?? 0) >= 20
              ? `${stats?.sampleSize} trades recorded`
              : `uncalibrated · ${stats?.sampleSize ?? 0}/20 trades`}
          </span>
        </div>

        {(stats?.sampleSize ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed border-[#1B263B] px-3 py-6 text-center text-xs text-muted-foreground">
            No closed trades yet. Win rate, expectancy and expected value are
            deliberately hidden until real records exist — nothing here is
            simulated or estimated.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="Win rate"
                value={
                  (stats?.sampleSize ?? 0) >= 5 && stats?.winRate != null
                    ? `${num(stats.winRate * 100, 1)}%`
                    : "insufficient data"
                }
                hint={`${stats?.wins ?? 0}W / ${stats?.losses ?? 0}L`}
              />
              <Stat
                label="Profit factor"
                value={
                  stats?.profitFactor != null ? num(stats.profitFactor, 2) : "—"
                }
                hint={
                  stats?.profitFactor == null
                    ? "no losing trades yet"
                    : "gross profit ÷ gross loss"
                }
              />
              <Stat
                label="Expectancy / trade"
                value={
                  (stats?.sampleSize ?? 0) >= 5 && stats?.expectancyInr != null
                    ? inr(stats.expectancyInr)
                    : "insufficient data"
                }
                accent={
                  (stats?.expectancyInr ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }
                hint="avg realized P&L per closed trade"
              />
              <Stat
                label="Avg R multiple"
                value={
                  stats?.avgR != null && (stats?.sampleSize ?? 0) >= 5
                    ? `${stats.avgR >= 0 ? "+" : ""}${num(stats.avgR, 2)}R`
                    : "insufficient data"
                }
                hint="relative to risked capital"
              />
              <Stat
                label="Expected value"
                value={
                  stats?.expectedValueInr != null
                    ? inr(stats.expectedValueInr)
                    : "needs ≥10 trades"
                }
                hint="historical EV per trade — not a forecast"
              />
              <Stat
                label="Total P&L"
                value={inr(stats?.totalPnlInr ?? 0)}
                accent={(stats?.totalPnlInr ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}
                hint={`${stats?.wins ?? 0}W · ${stats?.losses ?? 0}L`}
              />
              <Stat
                label="Best / worst"
                value={
                  stats?.bestInr != null && stats?.worstInr != null
                    ? `${inr(stats.bestInr)} / ${inr(stats.worstInr)}`
                    : "—"
                }
              />
              <Stat
                label="Calibration"
                value={`${stats?.sampleSize ?? 0}/20`}
                hint={
                  (stats?.sampleSize ?? 0) >= 20
                    ? "sample sufficient for reporting"
                    : "win rate is not a predicted probability until 20+"
                }
              />
            </div>
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              These figures describe already-closed simulated trades. They are
              observations of history, not statistically validated win
              probabilities, and they do not predict future results. No profit
              is promised or implied.
            </p>
          </>
        )}
      </section>

      {/* LEAN status */}
      <section className="mt-4 rounded-2xl border border-[#1B263B] bg-white/[0.02] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            Backtesting · QuantConnect LEAN
          </h3>
          <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-rose-400">
            {leanStatus?.connected ? "connected" : "not connected"}
          </span>
        </div>
        <p className="text-xs leading-5 text-slate-400">
          {leanStatus?.note ??
            "LEAN runs as an external .NET service — it is not executed in the browser or in this backend."}
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {(leanStatus?.pending ?? []).map((p) => (
            <li key={p} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <span className="mt-1 size-1 shrink-0 rounded-full bg-amber-400" />
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Design and contract: {leanStatus?.docs ?? "docs/LEAN-INTEGRATION.md"} — no
          backtest results are shown because no backtest has actually run.
        </p>
      </section>

      {/* Risk warnings */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <p className="text-[11px] leading-5 text-amber-200/80">
          Simulation only — no real broker orders are ever sent and live trading
          stays disabled. Simulated results do not include real slippage,
          financing or execution risk and are not indicative of future
          performance. Nothing here is financial advice or a promise of profit.
        </p>
      </div>
    </div>
  );
}
