import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StructureRow {
  icon: LucideIcon;
  label: string;
  value: string;
  tint: string;
}

const STRUCTURE: StructureRow[] = [
  {
    icon: Compass,
    label: "Bias",
    value: "Bearish Retracement within a Macro Bullish Trend.",
    tint: "text-sky-400 bg-sky-500/10",
  },
  {
    icon: Crosshair,
    label: "Sweep Zone",
    value: "Highs swept between $2,369.00 – $2,380.00.",
    tint: "text-violet-400 bg-violet-500/10",
  },
  {
    icon: ArrowDownRight,
    label: "Structure Change",
    value: "5M / 15M Bearish CHoCH (Change of Character) confirmed.",
    tint: "text-rose-400 bg-rose-500/10",
  },
  {
    icon: Layers,
    label: "Key Zone",
    value:
      "Price mitigating the 5M Fair Value Gap (FVG) and Discount Demand Zone ($2,230.00 – $2,236.85).",
    tint: "text-amber-400 bg-amber-500/10",
  },
];

interface SignalRow {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

const SIGNAL: SignalRow[] = [
  { icon: Target, label: "Asset", value: "XAUUSD (Gold Spot)" },
  {
    icon: TrendingUp,
    label: "Bias",
    value: "LONG",
    hint: "BUY LIMIT / DEMAND REJECTION",
    accent: "text-emerald-400",
  },
  {
    icon: MapPin,
    label: "Entry Zone",
    value: "$2,232.50 – $2,236.00",
    hint: "Unfilled 5M FVG / Order Block",
    accent: "text-amber-400",
  },
  {
    icon: ShieldX,
    label: "Stop Loss",
    value: "$2,224.00",
    hint: "Below recent structural liquidity low",
    accent: "text-rose-400",
  },
  {
    icon: Flag,
    label: "Take Profit 1",
    value: "$2,260.00",
    hint: "Internal Liquidity Target",
    accent: "text-emerald-400",
  },
  {
    icon: Flag,
    label: "Take Profit 2",
    value: "$2,300.00",
    hint: "Equal Highs Sweep Target",
    accent: "text-emerald-400",
  },
  {
    icon: Scale,
    label: "Risk / Reward",
    value: "1 : 3.2",
    accent: "text-amber-400",
  },
];

const NEWS_ITEMS = [
  "US NFP data cooling down interest rate expectations.",
  "Middle East geopolitics maintaining long-term haven demand for Gold.",
];

interface SmcAnalysisDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SmcAnalysisDrawer({
  open,
  onOpenChange,
}: SmcAnalysisDrawerProps) {
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
                  AI generated · updated 2m ago
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400"
              >
                XAUUSD
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
              {/* Market structure breakdown */}
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Market structure breakdown
              </p>
              <div className="mb-4 flex flex-col gap-1.5">
                {STRUCTURE.map((row) => {
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
                  {SIGNAL.map((row) => {
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
                  <div className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        Confluence
                      </span>
                      <span className="block text-xs leading-5 text-foreground">
                        Oversold bounce on 5M timeframe, institutional
                        liquidity mitigation at key support ($2,236 area).
                      </span>
                    </span>
                  </div>
                </div>
              </div>
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
                <div className="ticker-track flex w-max items-center gap-8 px-2">
                  {[...NEWS_ITEMS, ...NEWS_ITEMS].map((item, i) => (
                    <span
                      key={`${item}-${i}`}
                      className="flex shrink-0 items-center gap-2 text-[11px] text-slate-300"
                    >
                      <span className="size-1 rounded-full bg-[#F4C430]" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <p className="border-t border-white/5 px-3.5 py-2 text-[9px] text-muted-foreground">
                AI signals are educational and not financial advice.
              </p>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
