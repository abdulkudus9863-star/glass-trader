import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Loader2,
  Radio,
  SendHorizonal,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type SignalStatus = "SENT" | "FAILED" | "SIMULATED";
type DispatchMode = "telegram" | "simulated";
type Bias = "LONG" | "SHORT";

interface FeedSignal {
  id: string;
  bias: Bias;
  asset: string;
  tf: string;
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
  confluence: string;
  tier: string;
  rr: string;
  message: string;
  status: SignalStatus;
  dispatchMode: DispatchMode;
  telegramMessageId?: number;
  ts: number;
}

const ASSETS = ["XAUUSD", "BTCUSDT", "EURUSD", "ETHUSDT"];
const TFS = ["1m", "5m", "15m", "1H", "4H", "1D"];
const TIERS = ["HIGH", "MID", "LOW"];

const STATUS_STYLE: Record<SignalStatus, string> = {
  SENT: "text-[#00E676] border-[#00E676]/30 bg-[#00E676]/10",
  SIMULATED: "text-[#F4C430] border-[#F4C430]/30 bg-[#F4C430]/10",
  FAILED: "text-[#FF1744] border-[#FF1744]/30 bg-[#FF1744]/10",
};

const TIER_STYLE: Record<string, string> = {
  HIGH: "text-[#F4C430] border-[#F4C430]/30 bg-[#F4C430]/10",
  MID: "text-[#00F0FF] border-cyan-400/30 bg-cyan-400/10",
  LOW: "text-slate-400 border-white/10 bg-white/5",
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* default compose values — mirrors the spec dispatch example */
const DEFAULT_FORM = {
  bias: "LONG" as Bias,
  asset: "XAUUSD",
  tf: "15m",
  entry: "$2,232.50 – $2,236.00",
  sl: "$2,224.00",
  tp1: "$2,260.00",
  tp2: "$2,300.00",
  confluence: "4/4 Lanes Aligned",
  tier: "HIGH",
  rr: "3.2",
};

export default function TelegramSignals() {
  const { user, isLoading: authLoading } = useAuth();
  const isFounder = user?.isFounder === true;
  const authed = user != null;

  const docs = useQuery(api.signals.list, authed ? {} : "skip");
  const createSignal = useMutation(api.signals.createSignal);
  const dispatchAction = useAction(api.telegram.dispatchSignal);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [dispatching, setDispatching] = useState(false);
  const [lastResult, setLastResult] = useState<{
    status: SignalStatus;
    message: string;
  } | null>(null);

  /* seed a couple of example dispatches so the founder's feed is alive on first open */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!authed || docs === undefined || seededRef.current) return;
    if (!isFounder || docs.length > 0) return;
    seededRef.current = true;
    const samples = [
      { ...DEFAULT_FORM, ts: Date.now() - 2 * 60_000 },
      {
        bias: "SHORT" as Bias,
        asset: "EURUSD",
        tf: "4H",
        entry: "1.0842 – 1.0858",
        sl: "1.0881",
        tp1: "1.0796",
        tp2: "1.0752",
        confluence: "2/4 Lanes Aligned",
        tier: "LOW",
        rr: "2.1",
        ts: Date.now() - 45 * 60_000,
      },
    ];
    for (const s of samples) {
      void createSignal({
        bias: s.bias,
        asset: s.asset,
        tf: s.tf,
        entry: s.entry,
        sl: s.sl,
        tp1: s.tp1,
        tp2: s.tp2,
        confluence: s.confluence,
        tier: s.tier,
        rr: s.rr,
        message: buildMessage(s),
        status: "SIMULATED",
        dispatchMode: "simulated",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, docs, isFounder, createSignal]);

  const signals: FeedSignal[] = (docs ?? []).map((d) => ({
    id: d._id,
    bias: d.bias,
    asset: d.asset,
    tf: d.tf,
    entry: d.entry,
    sl: d.sl,
    tp1: d.tp1,
    tp2: d.tp2,
    confluence: d.confluence,
    tier: d.tier,
    rr: d.rr,
    message: d.message,
    status: d.status,
    dispatchMode: d.dispatchMode,
    telegramMessageId: d.telegramMessageId,
    ts: d.createdAt,
  }));

  const dispatch = async () => {
    setDispatching(true);
    setLastResult(null);
    try {
      const res = await dispatchAction(form);
      setLastResult(
        res.status === "SENT"
          ? {
              status: "SENT",
              message: `Delivered to Telegram${res.telegramMessageId ? ` (msg ${res.telegramMessageId})` : ""}.`,
            }
          : res.status === "FAILED"
            ? { status: "FAILED", message: "Telegram rejected the message — check the bot token / chat id." }
            : {
                status: "SIMULATED",
                message: "Logged locally — add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to dispatch for real.",
              },
      );
    } catch {
      setLastResult({ status: "FAILED", message: "Dispatch failed — are you signed in?" });
    }
    setDispatching(false);
  };

  const set = <K extends keyof typeof DEFAULT_FORM>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const loading = authLoading || docs === undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] ring-1 ring-[#00F0FF]/25">
          <SendHorizonal className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
            Telegram Bot Dispatcher
          </p>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Outgoing alert console
          </h2>
        </div>
        <span className="glass-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-[#00E676]">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00E676] opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#00E676]" />
          </span>
          LIVE FEED
        </span>
      </div>

      {/* Compose + dispatch (founder only) */}
      {isFounder && (
        <div className="mb-4 rounded-2xl border border-[#F4C430]/25 bg-[#0D1424] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Terminal className="size-4 text-[#F4C430]" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430]">
              Compose &amp; dispatch a signal
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Bias
              </span>
              <select
                value={form.bias}
                onChange={(e) => set("bias", e.target.value)}
                className="h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
              >
                <option value="LONG">🟢 LONG</option>
                <option value="SHORT">🔴 SHORT</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Asset
              </span>
              <select
                value={form.asset}
                onChange={(e) => set("asset", e.target.value)}
                className="h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
              >
                {ASSETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Timeframe
              </span>
              <select
                value={form.tf}
                onChange={(e) => set("tf", e.target.value)}
                className="h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
              >
                {TFS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Tier
              </span>
              <select
                value={form.tier}
                onChange={(e) => set("tier", e.target.value)}
                className="h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                { k: "entry", label: "Entry zone", tone: "text-[#F4C430]" },
                { k: "sl", label: "Stop loss", tone: "text-[#FF1744]" },
                { k: "tp1", label: "Take profit 1", tone: "text-[#00E676]" },
                { k: "tp2", label: "Take profit 2", tone: "text-[#00E676]" },
              ] as const
            ).map((f) => (
              <label key={f.k} className="block">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </span>
                <input
                  value={form[f.k]}
                  onChange={(e) => set(f.k, e.target.value)}
                  className={cn(
                    "h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold focus:border-[#F4C430]/50 focus:outline-none",
                    f.tone,
                  )}
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Confluence
              </span>
              <input
                value={form.confluence}
                onChange={(e) => set("confluence", e.target.value)}
                className="h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                R:R
              </span>
              <input
                value={form.rr}
                onChange={(e) => set("rr", e.target.value)}
                className="h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811] px-2 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
              />
            </label>
          </div>

          {/* Preview of the exact dispatch line */}
          <p className="mt-3 rounded-lg border border-[#1B263B] bg-[#050811]/70 px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">
            <span className={form.bias === "LONG" ? "text-[#00E676]" : "text-[#FF1744]"}>
              {form.bias === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
            </span>
            <span className="text-slate-500"> · </span>
            <span className="font-semibold text-foreground">{form.asset}</span>
            <span className="text-slate-500"> · </span>
            {form.tf}
            <span className="text-slate-500"> | Entry: </span>
            <span className="font-semibold text-[#F4C430]">{form.entry}</span>
            <span className="text-slate-500"> | SL: </span>
            <span className="font-semibold text-[#FF1744]">{form.sl}</span>
            <span className="text-slate-500"> | TP1: </span>
            <span className="font-semibold text-[#00E676]">{form.tp1}</span>
            <span className="text-slate-500"> | TP2: </span>
            <span className="font-semibold text-[#00E676]">{form.tp2}</span>
            <span className="text-slate-500"> | </span>
            <span className="font-semibold text-foreground">{form.confluence}</span>
            <span className="text-slate-500"> | </span>
            <span className="font-semibold text-[#F4C430]">{form.tier} Tier</span>
            <span className="text-slate-500"> | R:R </span>
            <span className="font-semibold text-foreground">{form.rr}</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void dispatch()}
              disabled={dispatching || !form.entry || !form.sl}
              className="flex h-9 items-center gap-2 rounded-lg bg-[#00F0FF] px-4 font-display text-xs font-bold text-[#04121a] transition-all hover:bg-[#00F0FF]/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {dispatching ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
              {dispatching ? "Dispatching…" : "Dispatch via Telegram"}
            </button>
            {lastResult && (
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-semibold",
                  lastResult.status === "SENT" && "text-[#00E676]",
                  lastResult.status === "FAILED" && "text-[#FF1744]",
                  lastResult.status === "SIMULATED" && "text-[#F4C430]",
                )}
              >
                <Radio className="size-3.5" />
                {lastResult.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-5">
        {loading && (
          <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading dispatch log…
          </div>
        )}
        {!loading && signals.length === 0 && (
          <div className="glass flex flex-col items-center gap-2 rounded-2xl px-6 py-12 text-center">
            <SendHorizonal className="size-7 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">No signals dispatched yet</p>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              {isFounder
                ? "Compose a signal above and dispatch it to the academy Telegram channel — it will land in this log."
                : "The founder dispatches trade alerts to the academy channel from here."}
            </p>
          </div>
        )}
        {signals.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-[#1B263B] bg-[#0D1424] p-3.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-px font-display text-[10px] font-bold tracking-widest",
                  s.bias === "LONG"
                    ? "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]"
                    : "border-[#FF1744]/30 bg-[#FF1744]/10 text-[#FF1744]",
                )}
              >
                <Radio className="size-3" />
                {s.bias}
              </span>
              <span className="font-mono text-xs font-bold text-foreground">
                {s.asset}
              </span>
              <span className="rounded bg-white/5 px-1.5 py-px font-mono text-[10px] text-slate-400">
                {s.tf}
              </span>
              <span
                className={cn(
                  "ml-auto rounded-full border px-2 py-px text-[9px] font-bold",
                  STATUS_STYLE[s.status],
                )}
                title={
                  s.dispatchMode === "telegram"
                    ? `Delivered via Telegram${s.telegramMessageId ? ` (msg ${s.telegramMessageId})` : ""}`
                    : "Logged locally — no bot token configured"
                }
              >
                {s.status}
                {s.dispatchMode === "telegram" && s.telegramMessageId
                  ? ` · #${s.telegramMessageId}`
                  : ""}
              </span>
            </div>

            {/* The exact dispatch line */}
            <p className="mt-2.5 rounded-lg border border-[#1B263B] bg-[#050811]/70 px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">
              <span className={s.bias === "LONG" ? "text-[#00E676]" : "text-[#FF1744]"}>
                {s.bias === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
              </span>
              <span className="text-slate-500"> · </span>
              <span className="font-semibold text-foreground">{s.asset}</span>
              <span className="text-slate-500"> · </span>
              {s.tf}
              <span className="text-slate-500"> | Entry: </span>
              <span className="font-semibold text-[#F4C430]">{s.entry}</span>
              <span className="text-slate-500"> | SL: </span>
              <span className="font-semibold text-[#FF1744]">{s.sl}</span>
              <span className="text-slate-500"> | TP1: </span>
              <span className="font-semibold text-[#00E676]">{s.tp1}</span>
              <span className="text-slate-500"> | TP2: </span>
              <span className="font-semibold text-[#00E676]">{s.tp2}</span>
              <span className="text-slate-500"> | </span>
              <span className="font-semibold text-foreground">{s.confluence}</span>
              <span className="text-slate-500"> | </span>
              <span className="font-semibold text-[#F4C430]">{s.tier} Tier</span>
              <span className="text-slate-500"> | R:R </span>
              <span className="font-semibold text-foreground">{s.rr}</span>
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-px text-[9px] font-bold",
                  TIER_STYLE[s.tier],
                )}
              >
                {s.confluence} · {s.tier} TIER
              </span>
              <span className="ml-auto font-mono text-slate-500">{fmt(s.ts)}</span>
            </div>
          </motion.div>
        ))}
        {!loading && signals.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[10px] text-muted-foreground">
            <ShieldAlert className="size-3 text-[#F4C430]" />
            Signals are dispatched to the academy Telegram channel; the log is
            persisted to your account on the backend.
          </p>
        )}
      </div>
    </div>
  );
}

function buildMessage(s: {
  bias: Bias;
  asset: string;
  tf: string;
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
  confluence: string;
  tier: string;
  rr: string;
}): string {
  return [
    `${s.bias === "LONG" ? "🟢 LONG" : "🔴 SHORT"} · ${s.asset} · ${s.tf}`,
    `Entry: ${s.entry}`,
    `SL: ${s.sl}`,
    `TP1: ${s.tp1}`,
    `TP2: ${s.tp2}`,
    `${s.confluence}`,
    `${s.tier} Tier`,
    `R:R ${s.rr}`,
  ].join(" | ");
}
