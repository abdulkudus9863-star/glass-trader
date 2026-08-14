import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Globe2,
  Radar as RadarIcon,
  RefreshCw,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useKlines } from "@/hooks/use-klines";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { ema, findSymbol, formatPercent, formatPrice, rsi, type TimeframeId } from "@/lib/market";
import {
  analyzeLanes,
  headlines,
  laneScoreCurve,
  type LaneResult,
  type LiveContext,
  type Verdict,
} from "@/lib/radar";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<Verdict, { chip: string; text: string }> = {
  BULL: {
    chip: "bg-[#00E676]/15 text-[#00E676] border-[#00E676]/30",
    text: "text-[#00E676]",
  },
  BEAR: {
    chip: "bg-[#FF1744]/15 text-[#FF1744] border-[#FF1744]/30",
    text: "text-[#FF1744]",
  },
  NEUTRAL: {
    chip: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    text: "text-slate-300",
  },
};

const TIER_STYLE: Record<string, string> = {
  HIGH: "text-[#F4C430] bg-[#F4C430]/10 border-[#F4C430]/30",
  MID: "text-[#00F0FF] bg-cyan-400/10 border-cyan-400/30",
  LOW: "text-slate-400 bg-white/5 border-white/10",
};

function ToneDot({ tone }: { tone: "pos" | "neg" | "neu" }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "pos"
          ? "bg-[#00E676]"
          : tone === "neg"
            ? "bg-[#FF1744]"
            : "bg-slate-600",
      )}
    />
  );
}

function LaneCard({ lane, index }: { lane: LaneResult; index: number }) {
  const vs = VERDICT_STYLE[lane.verdict];
  const curve = useMemo(() => laneScoreCurve(lane.lane, index), [lane.lane, index]);
  const path = useMemo(() => {
    if (curve.length < 2) return "";
    const min = Math.min(...curve);
    const max = Math.max(...curve);
    const span = max - min || 1;
    return curve
      .map((v, i) => {
        const x = (i / (curve.length - 1)) * 100;
        const y = 26 - ((v - min) / span) * 22 - 2;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [curve]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="glass flex flex-col overflow-hidden rounded-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[#1B263B] px-4 py-3">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg font-display text-sm font-bold",
            lane.lane === "T" && "bg-[#00F0FF]/10 text-[#00F0FF] ring-1 ring-[#00F0FF]/25",
            lane.lane === "F" && "bg-[#A855F7]/10 text-[#A855F7] ring-1 ring-[#A855F7]/25",
            lane.lane === "N" && "bg-[#00E676]/10 text-[#00E676] ring-1 ring-[#00E676]/25",
            lane.lane === "M" && "bg-[#F4C430]/10 text-[#F4C430] ring-1 ring-[#F4C430]/25",
          )}
        >
          {lane.lane}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-display text-sm font-bold tracking-tight text-foreground">
            {lane.name}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{lane.tagline}</p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[11px] font-bold tracking-widest",
            vs.chip,
          )}
        >
          {lane.verdict === "BULL" ? (
            <ArrowUpRight className="size-3" />
          ) : lane.verdict === "BEAR" ? (
            <ArrowDownRight className="size-3" />
          ) : (
            <Activity className="size-3" />
          )}
          {lane.verdict}
        </div>
      </div>

      {/* Score + tier */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <div className="relative h-10 w-10 shrink-0">
          <svg viewBox="0 0 40 40" className="size-10 -rotate-90">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#1B263B" strokeWidth="3.5" />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke={
                lane.verdict === "BULL"
                  ? "#00E676"
                  : lane.verdict === "BEAR"
                    ? "#FF1744"
                    : "#94a3b8"
              }
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={`${(lane.score / 100) * 100.5} 100.5`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-foreground">
            {lane.score}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Signal tier
            </span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-px text-[9px] font-bold",
                TIER_STYLE[lane.tier],
              )}
            >
              {lane.tier}
            </span>
          </div>
          {/* Mini score curve */}
          <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="mt-1 h-6 w-full">
            <path
              d={path}
              fill="none"
              stroke={
                lane.verdict === "BULL"
                  ? "rgba(0,230,118,0.6)"
                  : lane.verdict === "BEAR"
                    ? "rgba(255,23,68,0.6)"
                    : "rgba(148,163,184,0.5)"
              }
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-1 p-4 pt-2.5">
        {lane.metrics.map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5"
          >
            <ToneDot tone={m.tone} />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {m.label}
            </span>
            <span className="ml-auto truncate font-mono text-[11px] font-medium text-foreground">
              {m.value}
            </span>
          </div>
        ))}
        <p className="mt-1.5 text-[11px] leading-5 text-slate-400">{lane.narrative}</p>
      </div>
    </motion.section>
  );
}

interface RadarProps {
  symbolId: string;
  timeframe: TimeframeId;
}

export default function Radar({ symbolId, timeframe }: RadarProps) {
  const [seed, setSeed] = useState(0);
  const [auto, setAuto] = useState(true);

  /* live tape — the Technical lane reads real candles, not the seeded model */
  const { candles } = useKlines(symbolId, timeframe);
  const tickers = useMarketSnapshot([symbolId]);
  const ticker = tickers[symbolId];
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;

  const live: LiveContext = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const rsiVals = closes.length >= 20 ? rsi(closes, 14) : null;
    const emaVals = closes.length >= 200 ? ema(closes, 200) : null;
    return {
      price: ticker?.price ?? closes[closes.length - 1] ?? sym.basePrice,
      change24h: ticker?.change24h ?? 0,
      rsi: rsiVals?.[rsiVals.length - 1] ?? null,
      ema200: emaVals?.[emaVals.length - 1] ?? null,
    };
  }, [candles, ticker, sym.basePrice]);

  const result = useMemo(
    () => analyzeLanes(symbolId, timeframe, seed, live),
    [symbolId, timeframe, seed, live],
  );
  const news = useMemo(() => headlines(seed), [seed]);

  const refresh = useCallback(() => setSeed((s) => s + 1), []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setSeed((s) => s + 1), 45_000);
    return () => clearInterval(id);
  }, [auto]);

  const { confluence } = result;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] ring-1 ring-[#00F0FF]/25">
          <RadarIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
            Market Radar
          </p>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Four-lane pipeline · {symbolId} · {timeframe}
          </h1>
        </div>
        <div className="glass-chip hidden items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px] sm:flex">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00E676] opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#00E676]" />
          </span>
          <span className="text-slate-500">LIVE</span>
          <span className="font-semibold text-foreground">
            {formatPrice(live.price, sym.decimals)}
          </span>
          <span
            className={cn(
              "font-semibold",
              live.change24h >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
            )}
          >
            {formatPercent(live.change24h)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAuto((a) => !a)}
            className={cn(
              "glass-chip flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
              auto ? "text-[#00E676]" : "text-slate-400",
            )}
          >
            <span
              className={cn(
                "relative flex size-1.5",
                auto && "before:absolute before:inline-flex before:h-full before:w-full before:animate-ping before:rounded-full before:bg-[#00E676] before:opacity-60",
              )}
            >
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  auto ? "bg-[#00E676]" : "bg-slate-500",
                )}
              />
            </span>
            AUTO
          </button>
          <button
            type="button"
            onClick={refresh}
            className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-[#00F0FF]"
          >
            <RefreshCw className="size-3.5" />
            Re-run
          </button>
        </div>
      </div>

      {/* Confluence banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "mb-5 overflow-hidden rounded-2xl border bg-gradient-to-r",
          confluence.bias === "BULL"
            ? "border-[#00E676]/30 from-[#00E676]/[0.08] to-transparent"
            : "border-[#FF1744]/30 from-[#FF1744]/[0.08] to-transparent",
        )}
      >
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl border font-display text-lg font-bold",
              confluence.bias === "BULL"
                ? "border-[#00E676]/40 bg-[#00E676]/15 text-[#00E676]"
                : "border-[#FF1744]/40 bg-[#FF1744]/15 text-[#FF1744]",
            )}
          >
            {confluence.aligned}/{confluence.total}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                Lanes aligned · {confluence.bias}
              </p>
              <span
                className={cn(
                  "rounded-full border px-2 py-px text-[10px] font-bold",
                  TIER_STYLE[confluence.tier],
                )}
              >
                {confluence.tier} TIER
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">{confluence.summary}</p>
          </div>
          <div className="hidden gap-1.5 sm:flex">
            {result.lanes.map((l) => (
              <span
                key={l.lane}
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg font-display text-xs font-bold",
                  l.verdict === confluence.bias
                    ? "bg-[#F4C430]/15 text-[#F4C430] ring-1 ring-[#F4C430]/30"
                    : "bg-white/5 text-slate-500",
                )}
                title={`${l.name}: ${l.verdict}`}
              >
                {l.lane}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Lanes grid */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {result.lanes.map((lane, i) => (
          <LaneCard key={lane.lane} lane={lane} index={i} />
        ))}
      </div>

      {/* Headline tape */}
      <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#1B263B] bg-white/[0.02] px-4 py-3">
        <Globe2 className="mt-0.5 size-3.5 shrink-0 text-[#F4C430]" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <FileText className="size-3" /> Macro narrative tape
          </p>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {news.map((n) => (
              <span key={n} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <Waves className="size-2.5 text-[#00F0FF]" />
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
        Lanes are computed independently to avoid echo-chamber overlap. Radar
        output is a decision aid, not financial advice.
      </p>
    </div>
  );
}
