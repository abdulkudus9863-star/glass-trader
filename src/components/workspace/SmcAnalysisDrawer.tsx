import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  Compass,
  Crosshair,
  Flag,
  Layers,
  Lightbulb,
  MapPin,
  Newspaper,
  Radio,
  Scale,
  ShieldX,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStrategy } from "@/contexts/StrategyContext";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useKlines } from "@/hooks/use-klines";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { Badge } from "@/components/ui/badge";
import { findSymbol, formatPercent, formatPrice, type TimeframeId } from "@/lib/market";
import { analyzeSmc, formatWatchZone } from "@/lib/smc";
import { cn } from "@/lib/utils";

interface StructureRow {
  icon: LucideIcon;
  label: string;
  value: string;
  tint: string;
}

interface SignalRow {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
}

interface SmcAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbolId: string;
  intervalId: TimeframeId;
}

export default function SmcAnalysisDrawer({
  open,
  onOpenChange,
  symbolId,
  intervalId,
}: SmcAnalysisDrawerProps) {
  const { candles } = useKlines(symbolId, intervalId);
  const tickers = useMarketSnapshot([symbolId]);
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const { setStrategy } = useStrategy();

  const ticker = tickers[symbolId];
  const lastClose = candles[candles.length - 1]?.close;
  const price = ticker?.price ?? lastClose ?? null;
  const change24h = ticker?.change24h ?? null;

  const analysis = useMemo(() => {
    if (price == null) return null;
    return analyzeSmc({
      symbolId,
      intervalId,
      candles,
      price,
      change24h: change24h ?? 0,
      decimals: sym.decimals,
      assetName: sym.name,
    });
  }, [symbolId, intervalId, candles, price, change24h, sym.decimals, sym.name]);

  /* Real news for the macro ticker — never fabricated headlines. */
  const newsAction = useAction(api.market.news);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsStatus, setNewsStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setNewsStatus("loading");
      try {
        const res = await newsAction({ limit: 8 });
        if (cancelled) return;
        if (!res || res.length === 0) {
          setNews(null);
          setNewsStatus("error");
          return;
        }
        setNews(res);
        setNewsStatus("ok");
      } catch {
        if (!cancelled) {
          setNews(null);
          setNewsStatus("error");
        }
      }
    };
    void load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [newsAction]);

  const verdict = analysis?.verdict ?? "WAIT";
  const verdictStyle: Record<string, string> = {
    LONG: "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]",
    SHORT: "border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]",
    WAIT: "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]",
  };

  const structure: StructureRow[] = useMemo(() => {
    if (!analysis) return [];
    return [
      {
        icon: Compass,
        label: "Bias",
        value: analysis.structure.bias,
        tint: "text-sky-400 bg-sky-500/10",
      },
      {
        icon: Crosshair,
        label: "Sweep Zone",
        value: analysis.structure.sweepZone,
        tint: "text-violet-400 bg-violet-500/10",
      },
      {
        icon: ArrowDownRight,
        label: "Structure Change",
        value: analysis.structure.structureChange,
        tint: "text-rose-400 bg-rose-500/10",
      },
      {
        icon: Layers,
        label: "Key Zone",
        value: analysis.structure.keyZone,
        tint: "text-amber-400 bg-amber-500/10",
      },
    ];
  }, [analysis]);

  const signal: SignalRow[] = useMemo(() => {
    if (!analysis) return [];
    const s = analysis.signal;
    const fp = (v: number) => formatPrice(v, sym.decimals);
    return [
      { icon: Target, label: "Asset", value: `${s.asset} (${s.assetName})` },
      {
        icon: TrendingUp,
        label: "Bias",
        value: s.bias,
        hint: s.biasHint,
        accent:
          s.bias === "LONG"
            ? "text-emerald-400"
            : s.bias === "SHORT"
              ? "text-rose-400"
              : "text-amber-400",
      },
      {
        icon: MapPin,
        label: "Entry Zone",
        value: `${fp(s.entryZone[0])} – ${fp(s.entryZone[1])}`,
        hint: s.entryHint,
        accent: "text-amber-400",
      },
      {
        icon: ShieldX,
        label: "Stop Loss",
        value: fp(s.stopLoss),
        hint: s.stopHint,
        accent: "text-rose-400",
      },
      {
        icon: Flag,
        label: "Take Profit 1",
        value: fp(s.tp1),
        hint: "Internal liquidity target",
        accent: "text-emerald-400",
      },
      {
        icon: Flag,
        label: "Take Profit 2",
        value: fp(s.tp2),
        hint: "Sweep target",
        accent: "text-emerald-400",
      },
      {
        icon: Scale,
        label: "Risk / Reward",
        value: `1 : ${s.rrr.toFixed(1)}`,
        accent: "text-amber-400",
      },
    ];
  }, [analysis, sym.decimals]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="absolute inset-y-0 right-0 z-30 w-[min(400px,100%)] overflow-hidden border-l border-[#F4C430]/20 bg-[#0b101b]/95 backdrop-blur-xl"
          role="dialog"
          aria-label="SMC AI analysis"
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#F4C430]/12 text-[#F4C430] ring-1 ring-[#F4C430]/25">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-bold tracking-tight text-foreground">
                  SMC AI Analysis
                </p>
                <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Deterministic SMC · live tape · {intervalId}
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400"
              >
                {symbolId}
              </Badge>
              <button
                type="button"
                aria-label="Close SMC AI analysis"
                onClick={() => onOpenChange(false)}
                className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {/* Verdict strip — always reads the selected asset */}
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-xs font-bold tracking-widest",
                    verdict === "LONG"
                      ? "bg-[#00E676]/15 text-[#00E676]"
                      : verdict === "SHORT"
                        ? "bg-[#FF1744]/15 text-[#FF1744]"
                        : "bg-[#F4C430]/15 text-[#F4C430]",
                  )}
                >
                  {verdict === "LONG" ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : verdict === "SHORT" ? (
                    <ArrowDownRight className="size-3.5" />
                  ) : (
                    <Activity className="size-3.5" />
                  )}
                  {verdict}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {analysis?.signal.biasHint ?? "Analyzing tape…"}
                </span>
                <span className="ml-auto flex items-center gap-3 text-[10px] tabular-nums">
                  <span className="text-slate-500">
                    RSI{" "}
                    <span
                      className={cn(
                        "font-mono font-bold",
                        (analysis?.rsi ?? 50) < 38
                          ? "text-[#00E676]"
                          : (analysis?.rsi ?? 50) > 62
                            ? "text-[#FF1744]"
                            : "text-foreground",
                      )}
                    >
                      {analysis?.rsi.toFixed(1) ?? "—"}
                    </span>{" "}
                    <span className="text-slate-500">
                      ({analysis?.rsiLabel ?? "—"})
                    </span>
                  </span>
                  <span className="text-slate-500">
                    Regime{" "}
                    <span
                      className={cn(
                        "rounded bg-white/5 px-1.5 py-0.5 font-semibold",
                        analysis?.regime.includes("DOWN")
                          ? "text-[#FF1744]"
                          : analysis?.regime.includes("UP") ||
                              analysis?.regime.includes("BULLISH")
                            ? "text-[#00E676]"
                            : "text-[#F4C430]",
                      )}
                    >
                      {analysis?.regime ?? "—"}
                    </span>
                  </span>
                </span>
              </div>

              {!analysis && (
                <div className="rounded-xl border border-dashed border-[#1B263B] px-4 py-8 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    DATA UNAVAILABLE
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    No live candle tape for {symbolId} on the {intervalId} chart
                    — structure cannot be derived without real price data.
                  </p>
                </div>
              )}

              {analysis && (
                <>
                  {/* Market structure breakdown */}
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Market structure breakdown
                  </p>
                  <div className="mb-4 flex flex-col gap-1.5">
                    {structure.map((row) => {
                      const Icon = row.icon;
                      return (
                        <div
                          key={row.label}
                          className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5"
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                              row.tint,
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {row.label}
                            </span>
                            <span className="block text-xs leading-5 text-foreground">
                              {row.value}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Automated AI signal card */}
                  <div className="mb-4 overflow-hidden rounded-2xl border border-[#F4C430]/25 bg-gradient-to-b from-[#F4C430]/[0.07] to-transparent">
                    <div className="flex items-center justify-between border-b border-[#F4C430]/20 px-3.5 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#F4C430]">
                        Automated AI Signal
                      </p>
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                        <span className="relative flex size-1">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex size-1 rounded-full bg-emerald-500" />
                        </span>
                        LIVE
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 p-3">
                      {signal.map((row) => {
                        const Icon = row.icon;
                        return (
                          <div
                            key={row.label}
                            className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2"
                          >
                            <Icon
                              className={cn(
                                "mt-0.5 size-3.5 shrink-0",
                                row.accent ?? "text-slate-400",
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                {row.label}
                              </span>
                              <span
                                className={cn(
                                  "block text-xs font-semibold leading-5",
                                  row.accent ?? "text-foreground",
                                )}
                              >
                                {row.value}
                              </span>
                              {row.hint && (
                                <span className="block text-[10px] leading-4 text-muted-foreground">
                                  {row.hint}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}

                      {/* Watch zone — the rejection box rendered on the canvas */}
                      {analysis.watchZone && (
                        <div className="flex items-start gap-2.5 rounded-lg bg-[#00F0FF]/[0.06] px-2.5 py-2 ring-1 ring-[#00F0FF]/20">
                          <Crosshair className="mt-0.5 size-3.5 shrink-0 text-[#00F0FF]" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Watch Zone
                            </span>
                            <span className="block font-mono text-xs font-semibold text-[#00F0FF]">
                              {formatWatchZone(analysis.watchZone, sym.decimals)}
                            </span>
                            <span className="block text-[10px] leading-4 text-muted-foreground">
                              Cyan rejection band drawn on the chart · ↑ / ↓
                            </span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2">
                        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            Confluence
                          </span>
                          <span className="block text-xs leading-5 text-foreground">
                            {analysis.signal.confluence}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Push to Chart */}
                  {analysis.signal.bias !== "WAIT" && (
                    <button
                      type="button"
                      onClick={() =>
                        setStrategy({
                          title: `${symbolId} ${intervalId}`,
                          signalType: analysis.signal.bias === "LONG" ? "LONG" : "SHORT",
                          entryMin: analysis.signal.entryZone[0],
                          entryMax: analysis.signal.entryZone[1],
                          stopLoss: analysis.signal.stopLoss,
                          tp1: analysis.signal.tp1,
                          tp2: analysis.signal.tp2,
                        })
                      }
                      className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#F4C430]/40 bg-[#F4C430]/10 px-4 py-2.5 text-xs font-bold text-[#F4C430] transition-all hover:bg-[#F4C430]/20 hover:shadow-md hover:shadow-[#F4C430]/10"
                    >
                      <BarChart3 className="size-4" />
                      Push Strategy to Chart
                    </button>
                  )}

                  {/* Live asset stats */}
                  <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[11px] tabular-nums">
                    <span className="text-slate-400">
                      <span className="mr-1.5 text-slate-500">Price</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatPrice(analysis.price, sym.decimals)}
                      </span>
                    </span>
                    <span className="text-slate-400">
                      <span className="mr-1.5 text-slate-500">24h</span>
                      <span
                        className={cn(
                          "font-mono font-semibold",
                          analysis.change24h >= 0
                            ? "text-[#00E676]"
                            : "text-[#FF1744]",
                        )}
                      >
                        {formatPercent(analysis.change24h)}
                      </span>
                    </span>
                    <span className="text-slate-400">
                      <span className="mr-1.5 text-slate-500">Invalidation</span>
                      <span className="font-mono font-semibold text-rose-400">
                        {formatPrice(analysis.signal.invalidation, sym.decimals)}
                      </span>
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Live macro news ticker */}
            <div className="shrink-0 border-t border-white/5">
              <div className="flex items-center gap-2 px-3.5 pt-2.5">
                <Newspaper className="size-3.5 text-[#F4C430]" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Live Macro News
                </p>
                <Radio className="ml-auto size-3 text-emerald-400" />
              </div>
              <div className="overflow-hidden py-2">
                {newsStatus === "ok" && news && news.length > 0 ? (
                  <div className="ticker-track flex w-max items-center gap-8 px-2">
                    {[...news, ...news].map((item, i) => (
                      <a
                        key={`${item.title}-${i}`}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-2 text-[11px] text-slate-300 transition-colors hover:text-[#00F0FF]"
                      >
                        <span className="size-1 rounded-full bg-[#F4C430]" />
                        <span className="max-w-[280px] truncate">{item.title}</span>
                        <span className="text-[9px] text-slate-600">{item.source}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="px-3.5 text-[11px] text-slate-500">
                    {newsStatus === "loading"
                      ? "Loading headlines…"
                      : "Narrative data unavailable — no news provider returned articles."}
                  </p>
                )}
              </div>
              <p className="border-t border-white/5 px-3.5 py-2 text-[9px] text-muted-foreground">
                AI signals are auto-generated from live tape and educational —
                not financial advice.
              </p>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
