import { Eye, EyeOff, X, Zap } from "lucide-react";
import { useStrategy, type AISignals } from "@/contexts/StrategyContext";
import { cn } from "@/lib/utils";

const SIGNAL_COLORS: Record<AISignals["signalType"], { badge: string; ring: string; text: string }> = {
  BUY:   { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", ring: "ring-emerald-500/40", text: "text-emerald-400" },
  LONG:  { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", ring: "ring-emerald-500/40", text: "text-emerald-400" },
  SELL:  { badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",         ring: "ring-rose-500/40",   text: "text-rose-400" },
  SHORT: { badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",         ring: "ring-rose-500/40",   text: "text-rose-400" },
  WAIT:  { badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",      ring: "ring-amber-500/40",  text: "text-amber-400" },
};

function PriceRow({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={cn("font-mono text-[12px] font-bold tabular-nums", tone ?? "text-slate-200")}>
        {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

export default function StrategyOverlay() {
  const { activeStrategy, showLines, toggleLines, clearStrategy } = useStrategy();

  if (!activeStrategy) return null;

  const colors = SIGNAL_COLORS[activeStrategy.signalType];

  return (
    <div
      className={cn(
        "absolute bottom-4 left-4 z-30 w-[260px] rounded-xl border border-white/10 bg-[#0b101b]/95 p-3.5 backdrop-blur-xl",
        "shadow-lg shadow-black/50 ring-1",
        colors.ring,
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="size-3.5 text-[#F4C430]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430]">
            Strategy
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={showLines ? "Hide levels" : "Show levels"}
            onClick={toggleLines}
            className="flex size-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
          >
            {showLines ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          </button>
          <button
            type="button"
            aria-label="Clear strategy"
            onClick={clearStrategy}
            className="flex size-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-rose-400"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Signal badge */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider",
            colors.badge,
          )}
        >
          {activeStrategy.signalType}
        </span>
        <span className="truncate text-[12px] font-bold text-slate-200">
          {activeStrategy.title}
        </span>
      </div>

      {/* Levels */}
      {showLines && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <PriceRow
            label="Entry"
            value={activeStrategy.entryMin}
            tone="text-[#F4C430]"
          />
          {activeStrategy.entryMax !== activeStrategy.entryMin && (
            <PriceRow
              label="Entry max"
              value={activeStrategy.entryMax}
              tone="text-[#F4C430]"
            />
          )}
          <PriceRow
            label="Stop Loss"
            value={activeStrategy.stopLoss}
            tone="text-rose-400"
          />
          {activeStrategy.tp1 != null && (
            <PriceRow label="TP 1" value={activeStrategy.tp1} tone="text-emerald-400" />
          )}
          {activeStrategy.tp2 != null && (
            <PriceRow label="TP 2" value={activeStrategy.tp2} tone="text-emerald-400" />
          )}
          {activeStrategy.tp3 != null && (
            <PriceRow label="TP 3" value={activeStrategy.tp3} tone="text-emerald-400" />
          )}
        </div>
      )}
    </div>
  );
}
