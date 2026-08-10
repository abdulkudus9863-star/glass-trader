import { FunctionSquare, Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  INDICATORS,
  LOCKED_INDICATORS,
  type IndicatorCategory,
} from "@/lib/indicators";
import { cn } from "@/lib/utils";

const CATEGORY_STYLE: Record<IndicatorCategory, string> = {
  Trend: "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25",
  Momentum: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/25",
  Volume: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  Volatility: "bg-[#F4C430]/10 text-[#F4C430] border-[#F4C430]/25",
  SMC: "bg-[#00E676]/10 text-[#00E676] border-[#00E676]/25",
};

export default function IndicatorLibrary() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...INDICATORS, ...LOCKED_INDICATORS];
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.id.includes(q) ||
        i.description.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-1">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#F4C430]/10 text-[#F4C430] ring-1 ring-[#F4C430]/25">
          <FunctionSquare className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
            Indicator Library
          </p>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Every study in the academy
          </h2>
        </div>
        <div className="flex h-9 w-56 items-center gap-2 rounded-lg border border-[#1B263B] bg-[#0D1424] px-2.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicators…"
            className="h-full w-full bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ind) => {
            const locked = ind.access === "invite-only";
            return (
              <div
                key={ind.id}
                className={cn(
                  "rounded-xl border bg-[#0D1424] p-4 transition-colors",
                  locked ? "border-dashed border-[#1B263B]" : "border-[#1B263B] hover:border-[#F4C430]/30",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ind.color }}
                  />
                  <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-foreground">
                    {ind.name}
                  </p>
                  {locked ? (
                    <span className="flex items-center gap-1 rounded-full border border-[#F4C430]/30 bg-[#F4C430]/10 px-2 py-px text-[9px] font-bold text-[#F4C430]">
                      <Lock className="size-2.5" />
                      INVITE-ONLY
                    </span>
                  ) : (
                    <span className="rounded-full border border-[#00E676]/30 bg-[#00E676]/10 px-2 py-px text-[9px] font-bold text-[#00E676]">
                      PUBLIC
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{ind.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-px text-[9px] font-semibold",
                      CATEGORY_STYLE[ind.category],
                    )}
                  >
                    {ind.category}
                  </span>
                  {ind.pane != null && (
                    <span className="rounded bg-white/5 px-1.5 py-px font-mono text-[9px] text-slate-500">
                      pane {ind.pane}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[9px] text-slate-600">
                    {ind.id}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No indicators match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
