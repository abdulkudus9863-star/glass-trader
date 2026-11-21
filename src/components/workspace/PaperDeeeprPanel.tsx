import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Loader2,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseDeeeprResult } from "@/hooks/use-deeepr";
import type { TimeframeId } from "@/lib/market";
import type { AiSetupLevels } from "@/lib/paper-chart";
import {
  aiSetupFromAnalysis,
  aiTradeAction,
  type SavedAiSetup,
} from "@/lib/paper-ai";
import { isActive, type PendingAiSetup } from "@/lib/paper-ai-order";
import type { TimingStatus, TimingVerdict } from "@/lib/trade-timing";

const price = (n: number, decimals: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const DECISION_STYLE: Record<string, string> = {
  "STRONG BUY": "border-[#00E676]/50 bg-[#00E676]/15 text-[#00E676]",
  BUY: "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]",
  "STRONG SELL": "border-[#FF1744]/50 bg-[#FF1744]/15 text-[#FF1744]",
  SELL: "border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]",
  "WAIT FOR BUY": "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]",
  "WAIT FOR SELL": "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]",
  "NO TRADE": "border-slate-500/40 bg-white/5 text-slate-300",
  INVALIDATED: "border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]",
  "INSUFFICIENT DATA": "border-slate-500/40 bg-white/5 text-slate-400",
};

export interface PaperDeeeprPanelProps {
  symbolId: string;
  intervalId: TimeframeId;
  decimals: number;
  deeepr: UseDeeeprResult;
  pushedId: string | null;
  pending: PendingAiSetup | null;
  /** Live executability verdict from the trade-timing evaluator. */
  timing: TimingVerdict | null;
  onRemove: () => void;
  saved: SavedAiSetup[];
  onPush: (levels: AiSetupLevels) => void;
  onClearPush: () => void;
  /** Arm the setup — creates a pending paper order that auto-executes. */
  onArm: (levels: AiSetupLevels) => void;
  onSave: (levels: AiSetupLevels) => void;
  onLoadSaved: (levels: AiSetupLevels) => void;
  onTakeSaved: (levels: AiSetupLevels) => void;
  onDeleteSaved: (id: string) => void;
}

/**
 * DEEEPR Trade Intelligence inside Paper Trading.
 *
 * It renders the output of the SAME deterministic engine the Charts section
 * uses (`useDeeepr` → `analyzeDeeepr`). Nothing is re-analysed or re-scored
 * here; the panel only presents the existing verdict and offers the two
 * paper-trading actions (push annotations / pre-fill the order form).
 */
export default function PaperDeeeprPanel({
  symbolId,
  intervalId,
  decimals,
  deeepr,
  pushedId,
  pending,
  timing,
  onRemove,
  saved,
  onPush,
  onClearPush,
  onArm,
  onSave,
  onLoadSaved,
  onTakeSaved,
  onDeleteSaved,
}: PaperDeeeprPanelProps) {
  const { analysis, loading, dataStatus, gap, ageSeconds, candleCount } = deeepr;
  const levels = analysis ? aiSetupFromAnalysis(analysis) : null;
  const action = analysis
    ? aiTradeAction(analysis.decision, analysis.confidence)
    : "blocked";

  const unavailable = !analysis
    ? gap
      ? "The primary tape has missing candles — DEEEPR refuses to analyse over a gap."
      : dataStatus === "UNAVAILABLE"
        ? "No live feed for this instrument — the engine will not invent prices."
        : dataStatus === "STALE" || dataStatus === "DELAYED"
          ? `Market data is ${dataStatus.toLowerCase()} — DEEEPR is paused until the feed is fresh.`
          : `Warming up: ${candleCount}/60 candles available.`
    : null;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[#1B263B] bg-[#0D1424]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#1B263B] px-3 py-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-[#F4C430]/12 text-[#F4C430] ring-1 ring-[#F4C430]/25">
          <BrainCircuit className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[13px] font-bold tracking-tight text-foreground">
            DEEEPR Trade Intelligence
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            Same engine as Charts AI · {symbolId} · {intervalId}
            {analysis ? ` · ${analysis.analysis_id}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px]">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-bold tracking-wide",
              dataStatus === "LIVE"
                ? "bg-[#00E676]/15 text-[#00E676]"
                : dataStatus === "UNAVAILABLE"
                  ? "bg-[#FF1744]/15 text-[#FF1744]"
                  : "bg-[#F4C430]/15 text-[#F4C430]",
            )}
          >
            {gap ? "GAP" : dataStatus}
          </span>
          <span className="font-mono text-muted-foreground">
            {ageSeconds == null ? "—" : `${ageSeconds}s ago`}
          </span>
        </div>
      </div>

      {loading && !analysis && (
        <div className="flex items-center gap-2 px-3 py-6 text-[11px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-[#F4C430]" />
          Reading {intervalId} structure and higher-timeframe bias…
        </div>
      )}

      {!loading && !analysis && (
        <p className="px-3 py-4 text-[11px] leading-5 text-amber-300/90">
          {unavailable}
        </p>
      )}

      {analysis && (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide",
                DECISION_STYLE[analysis.decision] ?? DECISION_STYLE["NO TRADE"],
              )}
            >
              {analysis.direction === "LONG" ? (
                <ArrowUpRight className="size-3.5" />
              ) : analysis.direction === "SHORT" ? (
                <ArrowDownRight className="size-3.5" />
              ) : (
                <Target className="size-3.5" />
              )}
              {analysis.decision}
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              score {analysis.score} · {analysis.grade}
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {analysis.confidence} confidence
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {analysis.market_regime}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {analysis.setup_state.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
            <Field
              label="Entry zone"
              value={
                levels
                  ? `${price(levels.entryZone[0], decimals)} – ${price(levels.entryZone[1], decimals)}`
                  : "—"
              }
              tone="text-[#A855F7]"
            />
            <Field
              label="Stop loss"
              value={
                levels ? price(levels.stopLoss, decimals) : "—"
              }
              tone="text-[#FF1744]"
            />
            <Field
              label="TP1 / TP2 / TP3"
              value={
                levels && levels.takeProfits.length
                  ? levels.takeProfits
                      .slice(0, 3)
                      .map((tp) => price(tp, decimals))
                      .join(" / ")
                  : "—"
              }
              tone="text-[#00E676]"
            />
            <Field
              label="R:R"
              value={`1:${analysis.risk.actual_rr.toFixed(1)}`}
              tone="text-[#F4C430]"
            />
            <Field
              label="Risk (stop)"
              value={
                levels
                  ? price(Math.abs((levels.entryZone[0] + levels.entryZone[1]) / 2 - levels.stopLoss), decimals)
                  : "—"
              }
            />
            <Field
              label="Higher TF bias"
              value={analysis.mtf && Object.keys(analysis.mtf).length
                ? Object.entries(analysis.mtf)
                    .slice(0, 2)
                    .map(([tf, bias]) => `${tf} ${bias}`)
                    .join(" · ")
                : "—"}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <List
              title="Supporting evidence"
              items={analysis.reasons.slice(0, 4)}
              tone="text-slate-300"
            />
            <List
              title="Invalidation / missing information"
              items={[...analysis.invalidation, ...analysis.warnings, ...analysis.hard_gates].slice(
                0,
                4,
              )}
              tone="text-amber-300/90"
            />
          </div>

          {timing && (
            <div
              className={cn(
                "flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5",
                TIMING_STYLE[timing.status],
              )}
            >
              <span className="rounded bg-black/25 px-1.5 py-px font-mono text-[9px] font-bold tracking-wide">
                {timing.status}
              </span>
              <p className="min-w-0 flex-1 text-[10px] leading-4">
                {timing.explanation}
              </p>
              {timing.remainingRR != null && (
                <span className="shrink-0 font-mono text-[9px] opacity-80">
                  R:R 1:{timing.remainingRR.toFixed(1)}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!levels}
              onClick={() => {
                if (!levels) return;
                if (pushedId === levels.analysisId) onClearPush();
                else onPush(levels);
              }}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                levels && pushedId === levels.analysisId
                  ? "border-[#A855F7]/60 bg-[#A855F7]/20 text-purple-100"
                  : "border-[#A855F7]/40 bg-[#A855F7]/10 text-purple-200 hover:bg-[#A855F7]/20",
              )}
            >
              <Sparkles className="size-3.5" />
              {levels && pushedId === levels.analysisId
                ? "HIDE FROM CHART"
                : "PUSH ON CHART"}
            </button>

            <button
              type="button"
              disabled={
                action !== "take" || !levels || isActive(pending) || !timing?.canArm
              }
              onClick={() => {
                if (action === "take" && levels) onArm(levels);
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-2.5 text-[11px] font-bold text-[#00E676] transition-colors hover:bg-[#00E676]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-3.5" />
              TAKE THIS TRADE
            </button>

            <button
              type="button"
              disabled={!levels}
              onClick={() => {
                if (levels) onSave(levels);
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#1B263B] bg-white/[0.03] px-2.5 text-[11px] font-bold text-slate-300 transition-colors hover:border-[#F4C430]/40 hover:text-[#F4C430] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="size-3.5" />
              Save setup
            </button>

            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ShieldAlert className="size-3 text-[#F4C430]" />
              {timing
                ? timing.canArm
                  ? "Current market conditions allow arming — one paper trade only."
                  : "Current market conditions block arming — see the verdict above."
                : "Waiting for a live quote before deciding executability."}
            </span>
          </div>

          <p className="text-[10px] leading-4 text-muted-foreground">
            <span className="font-bold text-purple-200">PUSH ON CHART</span> only
            draws the levels — no order.{" "}
            <span className="font-bold text-[#00E676]">TAKE THIS TRADE</span> arms one
            simulated order that fills when price reaches the zone, via the existing
            paper engine. No broker order is ever sent.
          </p>
        </div>
      )}

      {pending && (
        <div className="border-t border-[#1B263B] px-3 py-2">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            AI setup status
          </p>
          <PendingOrderRow pending={pending} onRemove={onRemove} />
        </div>
      )}

      {saved.length > 0 && (
        <div className="border-t border-[#1B263B] px-3 py-2">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Saved setups · this device ({saved.length})
          </p>
          <div className="flex flex-col gap-1">
            {saved.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#1B263B] bg-white/[0.02] px-2 py-1.5"
              >
                <span className="font-mono text-[10px] font-bold text-slate-200">
                  {s.symbol} · {s.timeframe}
                </span>
                <span
                  className={cn(
                    "rounded border px-1 py-px text-[9px] font-bold",
                    DECISION_STYLE[s.decision] ?? DECISION_STYLE["NO TRADE"],
                  )}
                >
                  {s.decision}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {s.confidence} · {new Date(s.savedAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onLoadSaved(s.levels)}
                    className="rounded border border-[#A855F7]/40 px-1.5 py-0.5 text-[9px] font-bold text-purple-200 hover:bg-[#A855F7]/15"
                  >
                    Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => onTakeSaved(s.levels)}
                    className="rounded border border-[#00E676]/40 px-1.5 py-0.5 text-[9px] font-bold text-[#00E676] hover:bg-[#00E676]/15"
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSaved(s.id)}
                    aria-label="Delete saved setup"
                    className="rounded p-0.5 text-slate-500 hover:text-[#FF1744]"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const TIMING_STYLE: Record<TimingStatus, string> = {
  "VALID ENTRY": "border-[#00E676]/50 bg-[#00E676]/10 text-[#00E676]",
  "WAITING FOR ENTRY": "border-[#A855F7]/50 bg-[#A855F7]/10 text-purple-200",
  "WAIT FOR RETEST": "border-[#00F0FF]/50 bg-[#00F0FF]/10 text-[#00F0FF]",
  "LATE ENTRY": "border-[#F4C430]/50 bg-[#F4C430]/10 text-[#F4C430]",
  "MISSED TRADE": "border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744]",
  "INVALID SETUP": "border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744]",
  EXPIRED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "DATA UNAVAILABLE": "border-slate-500/40 bg-white/5 text-slate-300",
};

const ACTIVE_STATUS: Record<string, string> = {
  ANALYSING: "border-slate-500/40 bg-white/5 text-slate-300",
  READY: "border-[#A855F7]/50 bg-[#A855F7]/15 text-purple-100",
  ARMED: "border-[#A855F7]/50 bg-[#A855F7]/15 text-purple-100",
  EXECUTED: "border-[#00E676]/50 bg-[#00E676]/15 text-[#00E676]",
  CLOSED: "border-slate-500/40 bg-white/5 text-slate-300",
  CANCELLED: "border-slate-500/40 bg-white/5 text-slate-300",
  EXPIRED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  REJECTED: "border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744]",
};

function PendingOrderRow({
  pending,
  onRemove,
}: {
  pending: PendingAiSetup | null;
  onRemove: () => void;
}) {
  if (!pending) return null;
  const executed = pending.status === "EXECUTED";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5",
        ACTIVE_STATUS[pending.status] ?? ACTIVE_STATUS.CANCELLED,
      )}
    >
      <span className="rounded bg-black/25 px-1.5 py-px font-mono text-[9px] font-bold tracking-wide">
        {pending.status}
      </span>
      <span className="font-mono text-[10px] font-semibold">
        {pending.direction === "long" ? "LONG" : "SHORT"} {pending.symbol} ·{" "}
        {pending.timeframe}
      </span>
      <span className="font-mono text-[10px] opacity-80">
        zone {pending.entryLow.toFixed(2)}–{pending.entryHigh.toFixed(2)} · SL{" "}
        {pending.stopLoss.toFixed(2)}
      </span>
      {!executed &&
        pending.status !== "CANCELLED" &&
        pending.status !== "EXPIRED" &&
        pending.status !== "CLOSED" && (
        <span className="font-mono text-[9px] opacity-70">
          expires {new Date(pending.expiresAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
      {pending.message && (
        <span className="w-full text-[10px] leading-4 opacity-90">{pending.message}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto flex h-6 items-center gap-1 rounded border border-current/40 px-1.5 text-[9px] font-bold tracking-wide hover:bg-black/20"
      >
        <X className="size-3" />
        REMOVE AI ANALYSIS
      </button>
      {executed && (
        <span className="w-full text-[10px] leading-4 opacity-90">
          This AI setup has already been executed. Removing its analysis will not
          close the open position — use the position controls under Open positions.
        </span>
      )}
      {pending.status === "CLOSED" && (
        <span className="w-full text-[10px] leading-4 opacity-90">
          This AI trade is closed. Its record, realized P&amp;L and history remain
          untouched; the box is available in historical view.
        </span>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "truncate font-mono text-[11px] font-semibold tabular-nums",
          tone ?? "text-foreground",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function List({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#1B263B] bg-white/[0.02] px-2.5 py-2">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li
            key={item}
            className={cn("flex gap-1.5 text-[10px] leading-4", tone)}
          >
            <span className="mt-1 inline-block size-1 shrink-0 rounded-full bg-current opacity-60" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
