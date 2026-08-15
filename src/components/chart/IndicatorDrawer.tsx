import { AnimatePresence, motion } from "framer-motion";
import { LineChart, X } from "lucide-react";
import { getIndicator } from "@/lib/indicators";
import { cn } from "@/lib/utils";

/** Quick-access studies per the platform spec (EMA suite, BB, Volume, RSI).
 *  Open Interest is intentionally absent — no public provider supplies a
 *  historical per-candle OI series, so a chart plot would be fabricated.
 *  Live OI is available on the Radar Flow lane from the real futures feed. */
const QUICK_IDS = ["ema9", "ema21", "ema50", "ema200", "bollinger", "volume", "rsi14"] as const;

interface IndicatorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicators: Set<string>;
  onToggle: (id: string) => void;
}

export default function IndicatorDrawer({
  open,
  onOpenChange,
  indicators,
  onToggle,
}: IndicatorDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="absolute inset-y-0 right-0 z-30 w-[min(320px,100%)] overflow-hidden border-l border-[#1B263B] bg-[#0D1424]/95 backdrop-blur-xl"
          role="dialog"
          aria-label="Indicator drawer"
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[#1B263B] px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400 ring-1 ring-cyan-400/25">
                <LineChart className="size-4" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-display text-sm font-bold tracking-tight text-foreground">
                  Indicator Drawer
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Quick-toggle studies on the canvas
                </p>
              </div>
              <button
                type="button"
                aria-label="Close indicator drawer"
                onClick={() => onOpenChange(false)}
                className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Toggle list */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-1">
                {QUICK_IDS.map((id) => {
                  const def = getIndicator(id);
                  if (!def) return null;
                  const on = indicators.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onToggle(id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                        on
                          ? "border-cyan-400/40 bg-cyan-400/[0.08]"
                          : "border-[#1B263B] bg-white/[0.02] hover:border-cyan-400/25 hover:bg-white/[0.04]",
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: def.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[13px] font-semibold text-foreground">
                          {def.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {def.description}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                          on
                            ? "border-cyan-400/60 bg-cyan-400/30"
                            : "border-[#1B263B] bg-white/5",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-4 rounded-full transition-all",
                            on ? "left-[18px] bg-cyan-400" : "left-0.5 bg-slate-500",
                          )}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 rounded-lg border border-dashed border-[#1B263B] p-3 text-[11px] leading-5 text-muted-foreground">
                Indicators apply to every open pane. Head to{" "}
                <span className="font-semibold text-cyan-400">ƒx Indicators</span>{" "}
                for the full library including MACD, VWAP, ATR and SMC studies.
              </p>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
