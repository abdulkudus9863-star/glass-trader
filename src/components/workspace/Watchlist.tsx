import { WATCHLIST_IDS, useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { formatPercent, formatPrice } from "@/lib/market";
import { cn } from "@/lib/utils";

interface WatchlistProps {
  activeSymbolId: string;
  onSelectSymbol: (id: string) => void;
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 64;
  const h = 22;
  if (points.length < 2) return <div className="h-[22px] w-16" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
  const color = up ? "#089981" : "#f23645";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

export default function Watchlist({
  activeSymbolId,
  onSelectSymbol,
}: WatchlistProps) {
  const tickers = useMarketSnapshot(WATCHLIST_IDS);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Watchlist
          </p>
          <p className="text-[10px] text-muted-foreground">
            Live · 24h change
          </p>
        </div>
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
      </div>

      <div className="flex flex-col divide-y divide-border/50">
        {WATCHLIST_IDS.map((id) => {
          const t = tickers[id];
          if (!t) return null;
          const up = t.change24h >= 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectSymbol(id)}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
                activeSymbolId === id && "bg-blue-500/10",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {t.symbol.id}
                  </span>
                  <span className="hidden truncate text-[11px] text-muted-foreground group-hover:inline">
                    {t.symbol.name}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {formatPrice(t.price, t.symbol.decimals)}
                </span>
              </div>
              <Sparkline points={t.spark} up={up} />
              <span
                className={cn(
                  "w-[74px] shrink-0 rounded-md px-1.5 py-1 text-center text-[11px] font-bold tabular-nums",
                  up
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-rose-500/10 text-rose-600",
                )}
              >
                {formatPercent(t.change24h)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
