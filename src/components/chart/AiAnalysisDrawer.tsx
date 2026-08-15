import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Flag,
  Gauge,
  MapPin,
  ShieldX,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { useKlines } from "@/hooks/use-klines";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import {
  findSymbol,
  formatPercent,
  formatPrice,
  type TimeframeId,
} from "@/lib/market";
import { analyzeSmc } from "@/lib/smc";
import { cn } from "@/lib/utils";

type Verdict = "LONG" | "SHORT" | "WAIT";

interface AiAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbolId: string;
  intervalId: TimeframeId;
}

export default function AiAnalysisDrawer({
  open,
  onOpenChange,
  symbolId,
  intervalId,
}: AiAnalysisDrawerProps) {
  const { candles } = useKlines(symbolId, intervalId);
  const tickers = useMarketSnapshot([symbolId]);
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;

  const ticker = tickers[symbolId];
  const lastClose = candles[candles.length - 1]?.close;
  const price = ticker?.price ?? lastClose ?? null;
  const change24h = ticker?.change24h ?? null;

  /* Deterministic SMC analysis over the live tape — the same engine that
     drives the SMC panel and the canvas overlays, so every number matches. */
  const analysis = useMemo(() => {
    if (candles.length < 30 || lastClose == null) return null;
    const smc = analyzeSmc({
      symbolId,
      intervalId,
      candles,
      price: lastClose,
      change24h: ticker?.change24h ?? 0,
      decimals: sym.decimals,
      assetName: sym.name,
    });
    if (!smc) return null;
    return {
      rsiNow: smc.rsi,
      regime: smc.regime,
      verdict: smc.verdict as Verdict,
      entry: smc.signal.entryZone,
      sl: smc.signal.stopLoss,
      tp1: smc.signal.tp1,
      tp2: smc.signal.tp2,
      invalid: smc.signal.invalidation,
    };
  }, [candles, lastClose, ticker?.change24h, symbolId, intervalId, sym.decimals, sym.name]);

  const verdictStyle: Record<Verdict, string> = {
    LONG: "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]",
    SHORT: "border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]",
    WAIT: "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]",
  };

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
            aria-label="AI analysis"
          >
            <div className="mx-auto flex max-h-[72vh] w-full max-w-4xl flex-col">
              {/* Header */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#1B263B] px-4 py-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#F4C430]/12 text-[#F4C430] ring-1 ring-[#F4C430]/25">
                  <BrainCircuit className="size-4" />
                </div>
                <p className="font-display text-sm font-bold tracking-tight text-foreground">
                  AI Analysis
                </p>
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>

                {/* Live stats */}
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
                  <span className="text-slate-400">
                    <span className="mr-1.5 text-slate-500">RSI</span>
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        (analysis?.rsiNow ?? 50) < 42
                          ? "text-[#00E676]"
                          : (analysis?.rsiNow ?? 50) > 62
                            ? "text-[#FF1744]"
                            : "text-foreground",
                      )}
                    >
                      {(analysis?.rsiNow ?? 0).toFixed(1)}
                    </span>
                  </span>
                  <span className="text-slate-400">
                    <span className="mr-1.5 text-slate-500">Regime</span>
                    <span
                      className={cn(
                        "rounded bg-white/5 px-1.5 py-0.5 font-semibold",
                        analysis?.regime === "RANGING"
                          ? "text-[#F4C430]"
                          : analysis?.regime.includes("UP")
                            ? "text-[#00E676]"
                            : "text-[#FF1744]",
                      )}
                    >
                      {analysis?.regime ?? "—"}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  aria-label="Close AI analysis"
                  onClick={() => onOpenChange(false)}
                  className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Verdict card */}
              {!analysis && (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="rounded-xl border border-dashed border-[#1B263B] px-4 py-8 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      DATA UNAVAILABLE
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      No candle feed for {symbolId} on the {intervalId} chart —
                      analysis cannot be derived without a live tape.
                    </p>
                  </div>
                </div>
              )}
              {analysis && (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div
                    className={cn(
                      "overflow-hidden rounded-2xl border",
                      verdictStyle[analysis.verdict],
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-[#F4C430]" />
                        <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                          Action Verdict
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-sm font-bold tracking-widest",
                          analysis.verdict === "LONG"
                            ? "bg-[#00E676]/15 text-[#00E676]"
                            : analysis.verdict === "SHORT"
                              ? "bg-[#FF1744]/15 text-[#FF1744]"
                              : "bg-[#F4C430]/15 text-[#F4C430]",
                        )}
                      >
                        {analysis.verdict === "LONG" ? (
                          <ArrowUpRight className="size-4" />
                        ) : analysis.verdict === "SHORT" ? (
                          <ArrowDownRight className="size-4" />
                        ) : (
                          <Activity className="size-4" />
                        )}
                        {analysis.verdict}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {sym.id} · {intervalId}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-3">
                      {[
                        {
                          icon: MapPin,
                          label: "Entry Range",
                          value: `${formatPrice(analysis.entry[0], sym.decimals)} – ${formatPrice(analysis.entry[1], sym.decimals)}`,
                          hint:
                            analysis.verdict === "LONG"
                              ? "Demand zone / FVG"
                              : analysis.verdict === "SHORT"
                                ? "Supply zone / FVG"
                                : "Watch box",
                        },
                        {
                          icon: ShieldX,
                          label: "Stop Loss",
                          value: formatPrice(analysis.sl, sym.decimals),
                          hint: "Below structural low" ,
                        },
                        {
                          icon: Flag,
                          label: "Take Profit 1",
                          value: formatPrice(analysis.tp1, sym.decimals),
                          hint: "Internal liquidity",
                        },
                        {
                          icon: Flag,
                          label: "Take Profit 2",
                          value: formatPrice(analysis.tp2, sym.decimals),
                          hint: "Sweep target",
                        },
                        {
                          icon: Target,
                          label: "Invalidation",
                          value: formatPrice(analysis.invalid, sym.decimals),
                          hint: "Verdict void above/below",
                        },
                        {
                          icon: Gauge,
                          label: "Confidence",
                          value:
                            analysis.verdict === "WAIT"
                              ? "LOW"
                              : (analysis.rsiNow < 42 || analysis.rsiNow > 62) &&
                                  analysis.regime === "RANGING"
                                ? "HIGH"
                                : "MID",
                          hint:
                            analysis.verdict === "WAIT"
                              ? "Await alignment"
                              : "Confluence checked",
                        },
                      ].map((cell) => {
                        const Icon = cell.icon;
                        return (
                          <div
                            key={cell.label}
                            className="rounded-xl bg-white/[0.03] px-3 py-2.5"
                          >
                            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              <Icon className="size-3 text-[#F4C430]" />
                              {cell.label}
                            </span>
                            <p className="mt-1 font-mono text-[13px] font-semibold text-foreground">
                              {cell.value}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{cell.hint}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                    Deterministic SMC analysis computed from the live candle
                    tape — educational only, not financial advice. Verify levels
                    on the chart before committing capital.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
