import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CircleCheck,
  CircleX,
  Clock,
  Flag,
  Gauge,
  Loader2,
  MapPin,
  ShieldX,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { useStrategy } from "@/contexts/StrategyContext";
import type { UseDeeeprResult } from "@/hooks/use-deeepr";
import type { KlinesState } from "@/hooks/use-klines";
import {
  type DeeeprDecision,
  type DeeeprTradeAnalysis,
} from "@/lib/deeepr";
import { findSymbol, formatPercent, formatPrice, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";

interface TradeIntelligenceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbolId: string;
  intervalId: TimeframeId;
  live: KlinesState;
  deeepr: UseDeeeprResult;
  price?: number | null;
  change24h?: number | null;
}

const MTF_ROWS: { key: string; label: string }[] = [
  { key: "1D", label: "1D" },
  { key: "4H", label: "4H" },
  { key: "1H", label: "1H" },
  { key: "15M", label: "15M" },
  { key: "5M", label: "5M" },
  { key: "1M", label: "1m" },
];

function mtfDot(value: string | undefined): { color: string; label: string } {
  if (!value || value === "N/A") return { color: "bg-slate-600", label: "N/A" };
  if (value === "BULLISH") return { color: "bg-[#00E676]", label: "BULLISH" };
  if (value === "BEARISH") return { color: "bg-[#FF1744]", label: "BEARISH" };
  return { color: "bg-slate-400", label: "NEUTRAL" };
}

function decisionStyle(decision: DeeeprDecision): string {
  if (decision.includes("BUY")) return "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]";
  if (decision.includes("SELL")) return "border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]";
  if (decision.startsWith("WAIT")) return "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]";
  if (decision === "NO TRADE") return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  if (decision === "INVALIDATED") return "border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744]";
  return "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]";
}

function gradeColor(grade: string): string {
  if (grade.startsWith("S")) return "text-[#00E676]";
  if (grade.startsWith("A")) return "text-emerald-300";
  if (grade.startsWith("B")) return "text-[#F4C430]";
  if (grade.startsWith("C")) return "text-amber-400";
  return "text-slate-500";
}

function confluenceRow(
  label: string,
  value: boolean | string | undefined,
): { tone: "ok" | "warn" | "bad"; display: string } {
  if (value === true) return { tone: "ok", display: label };
  if (typeof value === "string" && value !== "NONE") return { tone: "warn", display: label };
  return { tone: "bad", display: label };
}

function VerdictPanel({ analysis, symbolId, intervalId, decimals }: { analysis: DeeeprTradeAnalysis; symbolId: string; intervalId: TimeframeId; decimals: number }) {
  const f = (v: number) => formatPrice(v, decimals);
  const { setStrategy } = useStrategy();
  const buy = analysis.direction === "LONG";
  const DirIcon = buy ? ArrowUpRight : ArrowDownRight;
  const dirColor = buy ? "text-[#00E676]" : "text-[#FF1744]";

  const confluenceRows = useMemo(
    () => [
      { key: "HTF alignment", label: "HTF", value: analysis.confluence.htf },
      { key: "Structure", label: "Structure", value: analysis.confluence.structure },
      { key: "Liquidity", label: "Liquidity", value: analysis.confluence.liquidity },
      { key: "Displacement", label: "Displacement", value: analysis.confluence.displacement },
      { key: "FVG", label: "FVG", value: analysis.confluence.fvg },
      { key: "Order block", label: "Order Block", value: analysis.confluence.order_block },
      { key: "Momentum", label: "Momentum", value: analysis.confluence.momentum },
      { key: "Volume", label: "Volume", value: analysis.confluence.volume },
      { key: "Entry", label: "Entry Location", value: analysis.confluence.entry },
      { key: "RR", label: "Risk / Reward", value: analysis.confluence.rr },
    ],
    [analysis],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* decision banner */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border",
          decisionStyle(analysis.decision),
        )}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#F4C430]" />
            <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              {analysis.decision}
            </p>
          </div>
          {analysis.direction !== "NEUTRAL" && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest",
                dirColor,
              )}
            >
              <DirIcon className="size-3.5" />
              {analysis.direction}
            </span>
          )}
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {analysis.symbol} · {analysis.timeframe}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-4">
          {[
            {
              icon: Gauge,
              label: "Setup Score",
              value: `${analysis.score}/100`,
              sub: <span className={cn("font-bold", gradeColor(analysis.grade))}>{analysis.grade}</span>,
            },
            {
              icon: ShieldX,
              label: "Confidence",
              value: analysis.confidence,
              sub: `${analysis.setup_state.replace(/_/g, " ")}`,
            },
            {
              icon: Activity,
              label: "Market Regime",
              value: analysis.market_regime,
              sub: `${analysis.primary?.structure ?? "—"} structure`,
            },
            {
              icon: BrainCircuit,
              label: "Data",
              value: analysis.data_status,
              sub:
                analysis.age_seconds == null
                  ? "—"
                  : `updated ${analysis.age_seconds}s ago`,
            },
          ].map((cell) => {
            const Icon = cell.icon;
            return (
              <div key={cell.label} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Icon className="size-3 text-[#F4C430]" />
                  {cell.label}
                </span>
                <p className="mt-1 font-mono text-[13px] font-semibold text-foreground">
                  {cell.value}
                </p>
                <p className="text-[10px] text-muted-foreground">{cell.sub}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* entry / risk / targets */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {[
          {
            icon: MapPin,
            label: "Entry Zone",
            value: `${f(analysis.entry.zone_low)} – ${f(analysis.entry.zone_high)}`,
            hint: `quality: ${analysis.entry.quality}`,
            tone: analysis.entry.quality === "OPTIMAL" || analysis.entry.quality === "GOOD" ? "text-[#00E676]" : "text-[#F4C430]",
          },
          {
            icon: Activity,
            label: "Current Price",
            value: f(analysis.entry.current_price),
            hint: `distance from zone`,
            tone: "text-foreground",
          },
          {
            icon: ShieldX,
            label: "Stop Loss",
            value: f(analysis.risk.stop_loss),
            hint: `risk ${f(analysis.risk.risk_points)} pts`,
            tone: "text-[#FF1744]",
          },
          {
            icon: Flag,
            label: "TP1",
            value: f(analysis.targets.tp1),
            hint: `RR 1:${analysis.risk.actual_rr.toFixed(1)}`,
            tone: "text-[#00E676]",
          },
          {
            icon: Flag,
            label: "TP2",
            value: f(analysis.targets.tp2),
            hint: `min RR 1:${analysis.risk.minimum_rr.toFixed(1)}`,
            tone: "text-[#00E676]",
          },
          {
            icon: Flag,
            label: "TP3",
            value: f(analysis.targets.tp3),
            hint: analysis.entry.confirmation_required,
            tone: "text-[#00E676]",
          },
        ].map((cell) => {
          const Icon = cell.icon;
          return (
            <div key={cell.label} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                <Icon className="size-3 text-[#F4C430]" />
                {cell.label}
              </span>
              <p className={cn("mt-1 font-mono text-[13px] font-semibold", cell.tone)}>
                {cell.value}
              </p>
              <p className="text-[10px] text-muted-foreground">{cell.hint}</p>
            </div>
          );
        })}
      </div>

      {/* Push to Chart button */}
      {analysis.direction !== "NEUTRAL" && (
        <button
          type="button"
          onClick={() =>
            setStrategy({
              title: `${symbolId} ${intervalId}`,
              signalType: analysis.direction === "LONG" ? "LONG" : "SHORT",
              entryMin: analysis.entry.zone_low,
              entryMax: analysis.entry.zone_high,
              stopLoss: analysis.risk.stop_loss,
              tp1: analysis.targets.tp1,
              tp2: analysis.targets.tp2,
              tp3: analysis.targets.tp3,
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#F4C430]/40 bg-[#F4C430]/10 px-4 py-2.5 text-xs font-bold text-[#F4C430] transition-all hover:bg-[#F4C430]/20 hover:shadow-md hover:shadow-[#F4C430]/10"
        >
          <BarChart3 className="size-4" />
          Push Strategy to Chart
        </button>
      )}

      {/* MTF consensus */}
      <div className="rounded-xl bg-white/[0.03] px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          MTF Consensus
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {MTF_ROWS.map((row) => {
            const { color, label } = mtfDot(analysis.mtf[row.key]);
            return (
              <span key={row.key} className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className={cn("size-1.5 rounded-full", color)} />
                <span className="text-slate-400">{row.label}</span>
                <span className="font-semibold text-slate-200">{label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* confluence checklist */}
      <div className="rounded-xl bg-white/[0.03] px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Confluence
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {confluenceRows.map((row) => {
            const { tone } = confluenceRow(row.label, row.value);
            return (
              <span key={row.key} className="flex items-center gap-1.5 text-[11px]">
                {tone === "ok" ? (
                  <CircleCheck className="size-3.5 shrink-0 text-[#00E676]" />
                ) : tone === "warn" ? (
                  <TriangleAlert className="size-3.5 shrink-0 text-[#F4C430]" />
                ) : (
                  <CircleX className="size-3.5 shrink-0 text-rose-500" />
                )}
                <span className="text-slate-300">{row.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* why */}
      {analysis.reasons.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Why
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                <span className="mt-px shrink-0 font-mono text-[10px] text-[#F4C430]">
                  {i + 1}.
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* invalidation */}
      {analysis.invalidation.length > 0 && (
        <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-rose-400">
            Invalidation
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.invalidation.map((inv, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                <CircleX className="mt-0.5 size-3 shrink-0 text-rose-500" />
                {inv}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* hard gates */}
      {analysis.hard_gates.length > 0 && (
        <div className="rounded-xl border border-[#FF1744]/20 bg-[#FF1744]/[0.04] px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#FF1744]">
            Hard gates
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.hard_gates.map((g, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                <ShieldX className="mt-0.5 size-3 shrink-0 text-[#FF1744]" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* warnings */}
      {analysis.warnings.length > 0 && (
        <div className="rounded-xl border border-[#F4C430]/20 bg-[#F4C430]/[0.04] px-4 py-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#F4C430]">
            Warnings
          </p>
          <ul className="mt-2 space-y-1.5">
            {analysis.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                <TriangleAlert className="mt-0.5 size-3 shrink-0 text-[#F4C430]" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] leading-4 text-muted-foreground">
        Deterministic decision-support computed from the live {symbolId} candle
        tape — a score is setup quality, not a probability of winning. Educational
        only, never financial advice.
      </p>
    </div>
  );
}

export default function TradeIntelligence({
  open,
  onOpenChange,
  symbolId,
  intervalId,
  live,
  deeepr,
  price,
  change24h,
}: TradeIntelligenceProps) {
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const { analysis, dataStatus } = deeepr;
  const { setStrategy } = useStrategy();

  const statusChip = useMemo(() => {
    if (dataStatus === "LIVE")
      return { dot: "bg-[#00E676]", text: "text-[#00E676]", label: "LIVE" };
    if (dataStatus === "DELAYED")
      return { dot: "bg-[#F4C430]", text: "text-[#F4C430]", label: "DELAYED" };
    return { dot: "bg-[#FF1744]", text: "text-[#FF1744]", label: dataStatus };
  }, [dataStatus]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[2px]"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ y: 320, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="absolute inset-x-0 bottom-0 z-30 border-t border-[#1B263B] bg-[#0D1424]/95 backdrop-blur-xl"
            role="dialog"
            aria-label="DEEEPR trade intelligence"
          >
            <div className="mx-auto flex max-h-[74vh] w-full max-w-4xl flex-col">
              {/* Header */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#1B263B] px-4 py-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#F4C430]/12 text-[#F4C430] ring-1 ring-[#F4C430]/25">
                  <BrainCircuit className="size-4" />
                </div>
                <p className="font-display text-sm font-bold tracking-tight text-foreground">
                  DEEEPR Trade Intelligence
                </p>
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider",
                    statusChip.text,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", statusChip.dot)} />
                  {statusChip.label}
                </span>
                <span className="hidden items-center gap-1 text-[10px] text-slate-500 sm:flex">
                  <Clock className="size-3" />
                  {deeepr.ageSeconds == null ? "—" : `${deeepr.ageSeconds}s ago`}
                </span>
                <span className="hidden text-[10px] text-slate-500 md:inline">
                  {live.candleCount} candles{deeepr.gap ? " · GAP" : ""}
                </span>

                <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums">
                  <span className="text-slate-400">
                    <span className="mr-1.5 text-slate-500">TF</span>
                    <span className="font-semibold text-foreground">{intervalId}</span>
                  </span>
                  <span className="text-slate-400">
                    <span className="mr-1.5 text-slate-500">Price</span>
                    <span className="font-mono font-semibold text-foreground">
                      {price == null ? "—" : formatPrice(price, sym.decimals)}
                    </span>
                  </span>
                  <span className="text-slate-400">
                    <span className="mr-1.5 text-slate-500">24h</span>
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        change24h == null
                          ? "text-slate-500"
                          : change24h >= 0
                            ? "text-[#00E676]"
                            : "text-[#FF1744]",
                      )}
                    >
                      {change24h == null ? "—" : formatPercent(change24h)}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  aria-label="Close trade intelligence"
                  onClick={() => onOpenChange(false)}
                  className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!analysis && deeepr.loading && (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#1B263B] px-4 py-12">
                    <Loader2 className="size-5 animate-spin text-[#F4C430]" />
                    <p className="text-[11px] text-muted-foreground">
                      Analyzing {symbolId} · {intervalId} across timeframes…
                    </p>
                  </div>
                )}

                {!analysis && !deeepr.loading && (
                  <div className="rounded-xl border border-dashed border-[#1B263B] px-4 py-8 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      {deeepr.gap
                        ? "DATA GAP — ANALYSIS DISABLED"
                        : dataStatus === "UNAVAILABLE" || dataStatus === "STALE"
                          ? "TRADE AI DISABLED — " + dataStatus
                          : "INSUFFICIENT DATA"}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                      {deeepr.gap
                        ? `The ${intervalId} tape has missing candle buckets. History must resynchronize before any analysis can be issued.`
                        : dataStatus === "UNAVAILABLE"
                          ? `No live market feed for ${symbolId} on ${intervalId} — the engine refuses to analyze without real data.`
                          : dataStatus === "STALE" || dataStatus === "DELAYED"
                            ? `Market data is ${dataStatus.toLowerCase()} — Trade AI is disabled until the feed is fresh.`
                            : `Not enough candle history loaded (${live.candleCount} candles). Warm-up required.`}
                    </p>
                  </div>
                )}

                {analysis && (
                  <VerdictPanel
                    analysis={analysis}
                    symbolId={symbolId}
                    intervalId={intervalId}
                    decimals={sym.decimals}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
