import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  Layers,
  Loader2,
  Magnet,
  MapPin,
  ShieldX,
  Sparkles,
  TriangleAlert,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import type { UseDeeeprIqResult } from "@/hooks/use-deeepr-iq";
import type { UseDeeeprResult } from "@/hooks/use-deeepr";
import type { KlinesState } from "@/hooks/use-klines";
import type { IqGrade, IqVerdict } from "@/lib/deeepr-iq";
import { findSymbol, formatPercent, formatPrice, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";

/* ------------------------------ overlay prefs ---------------------------- */

export interface IqOverlayPrefs {
  heatmap: boolean;
  liquidity: boolean;
  volumeProfile: boolean;
  smc: boolean;
  tradeLevels: boolean;
}

export const DEFAULT_IQ_OVERLAYS: IqOverlayPrefs = {
  heatmap: true,
  liquidity: true,
  volumeProfile: false,
  smc: true,
  tradeLevels: true,
};

interface DeeeprIqPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbolId: string;
  intervalId: TimeframeId;
  live: KlinesState;
  deeepr: UseDeeeprResult;
  iqHook: UseDeeeprIqResult;
  price?: number | null;
  change24h?: number | null;
  overlays: IqOverlayPrefs;
  onOverlaysChange: (p: IqOverlayPrefs) => void;
}

/* ------------------------------- helpers --------------------------------- */

function verdictStyle(verdict: IqVerdict): string {
  if (verdict === "TRADE") return "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]";
  if (verdict === "WAIT") return "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]";
  if (verdict === "NO TRADE") return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  return "border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF1744]";
}

function gradeTone(grade: IqGrade): string {
  if (grade === "ELITE" || grade === "A+") return "text-[#F4C430]";
  if (grade === "A SETUP") return "text-emerald-300";
  if (grade === "B SETUP") return "text-[#F4C430]";
  if (grade === "DEVELOPING" || grade === "WEAK") return "text-amber-400";
  return "text-slate-500";
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtDur(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

function ScoreDial({ score, grade, verdict }: { score: number; grade: IqGrade; verdict: IqVerdict }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, score) / 100;
  const color =
    verdict === "TRADE" ? "#00E676" : verdict === "WAIT" ? "#F4C430" : "#64748b";
  return (
    <div className="relative flex size-[76px] shrink-0 items-center justify-center">
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: "stroke-dasharray 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-bold leading-none text-foreground">{score}</span>
        <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">/100</span>
      </div>
    </div>
  );
}

function WallCard({
  side,
  wall,
  decimals,
}: {
  side: "bid" | "ask";
  wall: { price: number; strength: number; persistenceMs: number } | null;
  decimals: number;
}) {
  const bullish = side === "bid";
  const label = bullish ? "BUY WALL" : "SELL WALL";
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        bullish ? "border-[#00E676]/20 bg-[#00E676]/[0.04]" : "border-[#FF1744]/20 bg-[#FF1744]/[0.04]",
      )}
    >
      <p
        className={cn(
          "text-[9px] font-bold uppercase tracking-wider",
          bullish ? "text-[#00E676]" : "text-[#FF1744]",
        )}
      >
        {wall ? "🐋 " : ""}{label}
      </p>
      {wall ? (
        <>
          <p className="mt-1 font-mono text-sm font-bold text-foreground">
            {formatPrice(wall.price, decimals)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Strength <span className="font-mono font-semibold text-slate-200">{wall.strength}/100</span>
            <span className="mx-1 text-slate-600">·</span>
            Persistent {fmtDur(wall.persistenceMs)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">None detected near price</p>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  icon: Icon,
  on,
  onToggle,
}: {
  label: string;
  icon: typeof Layers;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
    >
      <Icon className={cn("size-3.5", on ? "text-[#F4C430]" : "text-slate-500")} />
      <span className={cn("flex-1 text-[11px] font-semibold", on ? "text-slate-200" : "text-slate-500")}>
        {label}
      </span>
      <span
        className={cn(
          "flex h-4 w-7 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-[#F4C430]/80" : "bg-white/10",
        )}
      >
        <span
          className={cn(
            "size-3 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-3" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

/* -------------------------------- panel ---------------------------------- */

export default function DeeeprIqPanel({
  open,
  onOpenChange,
  symbolId,
  intervalId,
  live,
  deeepr,
  iqHook,
  price,
  change24h,
  overlays,
  onOverlaysChange,
}: DeeeprIqPanelProps) {
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const { iq, liquidity, orderFlow, volumeProfile, dataQuality, liquidityStatus, orderFlowStatus } = iqHook;
  const analysis = deeepr.analysis;

  const statusChip = useMemo(() => {
    if (deeepr.dataStatus === "LIVE")
      return { dot: "bg-[#00E676]", text: "text-[#00E676]", label: "LIVE" };
    if (deeepr.dataStatus === "DELAYED")
      return { dot: "bg-[#F4C430]", text: "text-[#F4C430]", label: "DELAYED" };
    return { dot: "bg-[#FF1744]", text: "text-[#FF1744]", label: deeepr.dataStatus };
  }, [deeepr.dataStatus]);

  const f = (v: number) => formatPrice(v, sym.decimals);
  const toggle = (key: keyof IqOverlayPrefs) =>
    onOverlaysChange({ ...overlays, [key]: !overlays[key] });

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
            aria-label="DEEEPR IQ — institutional liquidity intelligence"
          >
            <div className="mx-auto flex max-h-[78vh] w-full max-w-4xl flex-col">
              {/* Header */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#1B263B] px-4 py-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#F4C430]/12 text-[#F4C430] ring-1 ring-[#F4C430]/25">
                  <Zap className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold tracking-tight text-foreground">
                    DEEEPR IQ
                  </p>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#F4C430]/80">
                    Institutional Liquidity Intelligence
                  </p>
                </div>
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
                  aria-label="Close DEEEPR IQ"
                  onClick={() => onOpenChange(false)}
                  className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!iq && deeepr.loading && (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#1B263B] px-4 py-12">
                    <Loader2 className="size-5 animate-spin text-[#F4C430]" />
                    <p className="text-[11px] text-muted-foreground">
                      Assembling liquidity + order flow for {symbolId} · {intervalId}…
                    </p>
                  </div>
                )}

                {!iq && !deeepr.loading && (
                  <div className="rounded-xl border border-dashed border-[#1B263B] px-4 py-8 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      {deeepr.gap
                        ? "DATA GAP — IQ DISABLED"
                        : deeepr.dataStatus === "UNAVAILABLE" || deeepr.dataStatus === "STALE"
                          ? "IQ DISABLED — " + deeepr.dataStatus
                          : "INSUFFICIENT DATA"}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                      {deeepr.gap
                        ? "The tape has missing candle buckets. DEEEPR IQ refuses to score over gapped data."
                        : "Not enough candle history or the feed is not live. The engine never invents a verdict."}
                    </p>
                  </div>
                )}

                {iq && (
                  <div className="flex flex-col gap-3">
                    {/* Verdict banner + score */}
                    <div
                      className={cn(
                        "overflow-hidden rounded-2xl border",
                        verdictStyle(iq.verdict),
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3">
                        <ScoreDial score={iq.score} grade={iq.grade} verdict={iq.verdict} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display text-base font-bold uppercase tracking-wide text-foreground">
                              {iq.verdict}
                            </p>
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest",
                                gradeTone(iq.grade),
                              )}
                            >
                              {iq.grade}
                            </span>
                            {iq.topTier && (
                              <span className="flex items-center gap-1 rounded-full border border-[#F4C430]/40 bg-[#F4C430]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#F4C430]">
                                <Flame className="size-3" /> Top-tier filter passed
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-300">Lifecycle:</span>{" "}
                            {iq.lifecycle.replace(/_/g, " ")}
                            <span className="mx-1.5 text-slate-600">·</span>
                            <span className="font-semibold text-slate-300">Regime:</span>{" "}
                            {iq.regime}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            A score is confluence quality — never a probability of winning.
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            <Gauge className="size-3 text-[#F4C430]" /> Data quality
                          </span>
                          <span className="font-mono text-lg font-bold text-foreground">
                            {dataQuality.score}
                            <span className="text-[10px] text-slate-500">/100</span>
                          </span>
                        </div>
                      </div>

                      {/* factor breakdown */}
                      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 p-3.5 sm:grid-cols-3">
                        {iq.factors.map((ft) => (
                          <div key={ft.key} className="flex items-center gap-1.5">
                            <span className="text-slate-400">{ft.label}</span>
                            <span className="ml-auto font-mono text-[11px] font-semibold text-slate-200">
                              {ft.earned}/{ft.weight}
                            </span>
                            <span className="hidden w-16 truncate text-right text-[9px] text-slate-600 md:inline">
                              {ft.detail}
                            </span>
                          </div>
                        ))}
                        {iq.penalties.map((p) => (
                          <div key={p.label} className="flex items-center gap-1.5">
                            <TriangleAlert className="size-3 text-amber-500" />
                            <span className="text-[10px] text-amber-400">{p.label}</span>
                            <span className="ml-auto font-mono text-[11px] font-bold text-amber-500">
                              −{p.amount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Liquidity */}
                    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Waves className="size-3.5 text-[#00F0FF]" />
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Liquidity
                        </p>
                        <span
                          className={cn(
                            "ml-auto rounded-full border px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-wider",
                            liquidityStatus === "LIVE"
                              ? "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]"
                              : "border-[#F4C430]/30 bg-[#F4C430]/10 text-[#F4C430]",
                          )}
                        >
                          {liquidityStatus}
                        </span>
                      </div>
                      {liquidityStatus !== "LIVE" ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          LIQUIDITY DATA UNAVAILABLE — no real order-book stream for this asset.
                          No liquidity is invented.
                        </p>
                      ) : (
                        <>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <WallCard side="bid" wall={iq.liquidity.bidWall} decimals={sym.decimals} />
                            <WallCard side="ask" wall={iq.liquidity.askWall} decimals={sym.decimals} />
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[10px]">
                            <span className="text-slate-400">Depth imbalance</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                              <div
                                className="h-full bg-gradient-to-r from-[#FF1744] via-slate-500 to-[#00E676]"
                                style={{
                                  width: "100%",
                                  background: `linear-gradient(to right, rgba(255,23,68,0.5), rgba(100,116,139,0.4), rgba(0,230,118,0.5))`,
                                }}
                              />
                            </div>
                            <span
                              className={cn(
                                "font-mono font-semibold",
                                iq.liquidity.depthImbalance >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                              )}
                            >
                              {(iq.liquidity.depthImbalance * 100).toFixed(0)}%
                            </span>
                          </div>
                          {iq.liquidity.unstableWalls > 0 && (
                            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
                              <TriangleAlert className="size-3" />
                              ⚠️ UNSTABLE LIQUIDITY — {iq.liquidity.unstableWalls} wall
                              {iq.liquidity.unstableWalls > 1 ? "s" : ""} repeatedly
                              appeared/disappeared before price reached it. Possible
                              spoof-like behavior (not confirmed manipulation).
                            </p>
                          )}
                          {iq.liquidity.removedWalls > 0 && (
                            <p className="mt-1.5 text-[10px] text-slate-500">
                              {iq.liquidity.removedWalls} wall{iq.liquidity.removedWalls > 1 ? "s" : ""}{" "}
                              removed from the book in the last 2m.
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Magnet */}
                    {iq.liquidity.magnet && (
                      <div className="rounded-xl border border-[#00F0FF]/15 bg-[#00F0FF]/[0.03] px-4 py-3">
                        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#00F0FF]">
                          <Magnet className="size-3.5" /> Primary liquidity magnet
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {f(iq.liquidity.magnet.price)}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold",
                              iq.liquidity.magnet.side === "ask"
                                ? "bg-[#FF1744]/10 text-[#FF1744]"
                                : "bg-[#00E676]/10 text-[#00E676]",
                            )}
                          >
                            {iq.liquidity.magnet.side === "ask" ? "SELL-SIDE" : "BUY-SIDE"}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Distance{" "}
                            <span className="font-mono font-semibold text-slate-200">
                              {pct(iq.liquidity.magnet.distancePct)}
                            </span>
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Magnet score{" "}
                            <span className="font-mono font-semibold text-[#F4C430]">
                              {iq.liquidity.magnet.score}/100
                            </span>
                          </span>
                        </div>
                        <ul className="mt-2 space-y-0.5">
                          {iq.liquidity.magnet.reasons.map((r, i) => (
                            <li key={i} className="flex gap-1.5 text-[10px] text-slate-400">
                              <CircleCheck className="mt-px size-3 shrink-0 text-[#00E676]" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Order flow */}
                    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Activity className="size-3.5 text-[#00E676]" />
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Order flow
                        </p>
                        <span
                          className={cn(
                            "ml-auto rounded-full border px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-wider",
                            orderFlowStatus === "LIVE"
                              ? "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]"
                              : "border-[#F4C430]/30 bg-[#F4C430]/10 text-[#F4C430]",
                          )}
                        >
                          {orderFlowStatus}
                        </span>
                      </div>
                      {orderFlowStatus !== "LIVE" || !orderFlow ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          ORDER FLOW DATA UNAVAILABLE — no real trade stream for this asset.
                        </p>
                      ) : (
                        <>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-[#00E676]/[0.06] px-2 py-2">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-[#00E676]">
                                Buy
                              </p>
                              <p className="mt-0.5 font-mono text-sm font-bold text-[#00E676]">
                                {fmtCompact(orderFlow.buyVolume)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[#FF1744]/[0.06] px-2 py-2">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-[#FF1744]">
                                Sell
                              </p>
                              <p className="mt-0.5 font-mono text-sm font-bold text-[#FF1744]">
                                {fmtCompact(orderFlow.sellVolume)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                                Delta
                              </p>
                              <p
                                className={cn(
                                  "mt-0.5 font-mono text-sm font-bold",
                                  orderFlow.delta >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                                )}
                              >
                                {orderFlow.delta >= 0 ? "+" : ""}
                                {fmtCompact(orderFlow.delta)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
                            <span>
                              Delta{" "}
                              <span
                                className={cn(
                                  "font-mono font-semibold",
                                  (orderFlow.deltaPct ?? 0) >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                                )}
                              >
                                {pct(orderFlow.deltaPct ?? 0)}
                              </span>
                            </span>
                            <span>
                              CVD{" "}
                              <span className="font-mono font-semibold text-slate-200">
                                {fmtCompact(orderFlow.cvd)}
                              </span>{" "}
                              <span
                                className={cn(
                                  "font-semibold",
                                  orderFlow.cvdTrend === "RISING"
                                    ? "text-[#00E676]"
                                    : orderFlow.cvdTrend === "FALLING"
                                      ? "text-[#FF1744]"
                                      : "text-slate-400",
                                )}
                              >
                                {orderFlow.cvdTrend}
                              </span>
                            </span>
                            <span>
                              Trades{" "}
                              <span className="font-mono font-semibold text-slate-200">
                                {orderFlow.tradeCount}
                              </span>{" "}
                              ({orderFlow.largeTradeCount} large)
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 font-semibold",
                                orderFlow.dominance === "BUYER"
                                  ? "bg-[#00E676]/10 text-[#00E676]"
                                  : orderFlow.dominance === "SELLER"
                                    ? "bg-[#FF1744]/10 text-[#FF1744]"
                                    : "bg-white/5 text-slate-300",
                              )}
                            >
                              {orderFlow.dominance === "BUYER"
                                ? "BUYER DOMINANCE"
                                : orderFlow.dominance === "SELLER"
                                  ? "SELLER DOMINANCE"
                                  : "BALANCED"}
                            </span>
                            {orderFlow.volumeAnomaly && (
                              <span
                                className={cn(
                                  "flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                                  orderFlow.volumeAnomaly.label === "HIGH" ||
                                    orderFlow.volumeAnomaly.label === "EXTREME"
                                    ? "bg-[#F4C430]/10 text-[#F4C430]"
                                    : "bg-white/5 text-slate-400",
                                )}
                              >
                                <Flame className="size-3" />
                                {orderFlow.volumeAnomaly.ratio.toFixed(1)}× avg ·{" "}
                                {orderFlow.volumeAnomaly.label === "HIGH" ||
                                orderFlow.volumeAnomaly.label === "EXTREME"
                                  ? "VOLUME EXPANSION"
                                  : orderFlow.volumeAnomaly.label}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-[9px] text-slate-600">
                            Rolling {Math.round(orderFlow.windowMs / 60_000)}m window of real
                            Binance trade prints. CVD is confirmation only — never an entry trigger.
                          </p>
                        </>
                      )}
                    </div>

                    {/* MTF + volume profile + structure checklist */}
                    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Confluence checklist
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <span className="text-slate-400">MTF alignment</span>
                          <span
                            className={cn(
                              "font-mono font-semibold",
                              iq.mtf.total > 0 && iq.mtf.aligned / Math.max(iq.mtf.total, 1) >= 0.6
                                ? "text-[#00E676]"
                                : "text-[#F4C430]",
                            )}
                          >
                            {iq.mtf.aligned}/{iq.mtf.total} aligned
                          </span>
                        </span>
                        {iq.volumeProfile.available && (
                          <span className="flex items-center gap-1.5">
                            <span className="text-slate-400">Volume profile</span>
                            <span className="font-mono font-semibold text-slate-200">
                              POC {f(iq.volumeProfile.poc!)}
                            </span>
                            <span className="text-slate-600">VA</span>
                            <span className="font-mono text-slate-400">
                              {f(iq.volumeProfile.val!)}–{f(iq.volumeProfile.vah!)}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                        {[
                          { label: "Structure", v: iq.structure },
                          { label: "Liquidity sweep", v: iq.sweep },
                          { label: "FVG", v: iq.fvg },
                          { label: "Order block", v: iq.orderBlock },
                          { label: "Entry location", v: iq.entry },
                        ].map((row) => (
                          <span key={row.label} className="flex items-center gap-1.5 text-[11px]">
                            {row.v.ok ? (
                              <CircleCheck className="size-3.5 shrink-0 text-[#00E676]" />
                            ) : (
                              <CircleX className="size-3.5 shrink-0 text-rose-500" />
                            )}
                            <span className="text-slate-300">{row.label}</span>
                            <span className="truncate text-[10px] text-slate-500">{row.v.label}</span>
                          </span>
                        ))}
                        <span className="flex items-center gap-1.5 text-[11px]">
                          {iq.rr.ok ? (
                            <CircleCheck className="size-3.5 shrink-0 text-[#00E676]" />
                          ) : (
                            <CircleX className="size-3.5 shrink-0 text-rose-500" />
                          )}
                          <span className="text-slate-300">RR</span>
                          <span className="font-mono text-[10px] text-slate-400">1:{iq.rr.value.toFixed(1)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Entry / SL / TP */}
                    {analysis && iq.bias !== "NEUTRAL" && (
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {[
                          {
                            icon: MapPin,
                            label: "Entry zone",
                            value: `${f(analysis.entry.zone_low)}–${f(analysis.entry.zone_high)}`,
                            tone: "text-[#F4C430]",
                          },
                          {
                            icon: ShieldX,
                            label: "Stop loss",
                            value: f(analysis.risk.stop_loss),
                            tone: "text-[#FF1744]",
                          },
                          {
                            icon: ArrowUpRight,
                            label: "TP1 / TP2",
                            value: `${f(analysis.targets.tp1)} / ${f(analysis.targets.tp2)}`,
                            tone: "text-[#00E676]",
                          },
                          {
                            icon: ArrowDownRight,
                            label: "TP3",
                            value: f(analysis.targets.tp3),
                            tone: "text-[#00E676]",
                          },
                        ].map((cell) => {
                          const Icon = cell.icon;
                          return (
                            <div key={cell.label} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                <Icon className="size-3 text-[#F4C430]" /> {cell.label}
                              </span>
                              <p className={cn("mt-1 font-mono text-[13px] font-semibold", cell.tone)}>
                                {cell.value}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Setup DNA */}
                    {iq.setupDna.length > 0 && (
                      <div className="rounded-xl bg-white/[0.03] px-4 py-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Setup DNA
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
                          {iq.setupDna.map((row) => (
                            <span key={row.label} className="flex items-center gap-1.5 text-[10px]">
                              {row.ok ? (
                                <CircleCheck className="size-3 shrink-0 text-[#00E676]" />
                              ) : (
                                <span className="size-3 shrink-0 rounded-full border border-slate-600" />
                              )}
                              <span className="text-slate-400">{row.label}</span>
                              <span
                                className={cn(
                                  "truncate font-mono font-semibold",
                                  row.ok ? "text-slate-200" : "text-slate-500",
                                )}
                              >
                                {row.value}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* WAIT intelligence */}
                    {iq.verdict !== "TRADE" && iq.waitingFor.length > 0 && (
                      <div className="rounded-xl border border-[#F4C430]/20 bg-[#F4C430]/[0.04] px-4 py-3">
                        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#F4C430]">
                          <Sparkles className="size-3.5" /> WAIT intelligence — waiting for
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {iq.waitingFor.map((w) => (
                            <span
                              key={w}
                              className="rounded-md border border-[#F4C430]/25 bg-[#F4C430]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#F4C430]"
                            >
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Invalidation */}
                    {iq.invalidation.length > 0 && (
                      <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-4 py-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-rose-400">
                          Invalidation
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {iq.invalidation.map((inv, i) => (
                            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                              <CircleX className="mt-0.5 size-3 shrink-0 text-rose-500" />
                              {inv}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Warnings */}
                    {iq.warnings.length > 0 && (
                      <div className="rounded-xl border border-[#F4C430]/20 bg-[#F4C430]/[0.04] px-4 py-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[#F4C430]">
                          Warnings
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {iq.warnings.map((w, i) => (
                            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
                              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-[#F4C430]" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Overlay controls */}
                    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        <Eye className="size-3.5" /> Chart overlays
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 sm:grid-cols-3">
                        <ToggleRow
                          label="Liquidity heatmap"
                          icon={Layers}
                          on={overlays.heatmap}
                          onToggle={() => toggle("heatmap")}
                        />
                        <ToggleRow
                          label="Liquidity walls"
                          icon={Waves}
                          on={overlays.liquidity}
                          onToggle={() => toggle("liquidity")}
                        />
                        <ToggleRow
                          label="Volume profile"
                          icon={Activity}
                          on={overlays.volumeProfile}
                          onToggle={() => toggle("volumeProfile")}
                        />
                        <ToggleRow
                          label="SMC overlays"
                          icon={BrainCircuit}
                          on={overlays.smc}
                          onToggle={() => toggle("smc")}
                        />
                        <ToggleRow
                          label="Trade levels"
                          icon={MapPin}
                          on={overlays.tradeLevels}
                          onToggle={() => toggle("tradeLevels")}
                        />
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <EyeOff className="size-3.5 text-slate-500" />
                          <span className="text-[11px] text-slate-500">Candles always on</span>
                        </div>
                      </div>
                    </div>

                    {/* Data quality breakdown */}
                    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Data quality — {dataQuality.score}/100
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
                        {dataQuality.factors.map((ft) => (
                          <span key={ft.label} className="flex items-center gap-1.5 text-[10px]">
                            {ft.ok ? (
                              <CircleCheck className="size-3 shrink-0 text-[#00E676]" />
                            ) : (
                              <CircleX className="size-3 shrink-0 text-rose-500" />
                            )}
                            <span className="text-slate-400">{ft.label}</span>
                            <span className="ml-auto font-mono text-[9px] text-slate-500">{ft.note}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] leading-4 text-muted-foreground">
                      DEEEPR IQ is deterministic decision-support computed from real Binance
                      order-book depth, trade prints and the live {symbolId} candle tape. A
                      score measures confluence quality, not win probability. Educational only —
                      never financial advice.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
