import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SYMBOLS,
  findSymbol,
  type MarketType,
} from "@/lib/market";
import { cn } from "@/lib/utils";

const MARKET_ORDER: MarketType[] = ["crypto", "forex", "metals", "indices", "stocks"];
const MARKET_LABELS: Record<MarketType, string> = {
  crypto: "Crypto",
  forex: "Forex",
  metals: "Metals",
  indices: "Indices",
  stocks: "Stocks",
};

const MARKET_CHIP: Record<MarketType, string> = {
  crypto: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  forex: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  metals: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  indices: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  stocks: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

interface SymbolSearchProps {
  value: string;
  onSelect: (symbolId: string) => void;
}

export default function SymbolSearch({ value, onSelect }: SymbolSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const active = findSymbol(value);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = SYMBOLS.filter(
      (s) =>
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.market.includes(q),
    );
    return MARKET_ORDER.map((m) => ({
      market: m,
      symbols: filtered.filter((s) => s.market === m),
    })).filter((g) => g.symbols.length > 0);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "glass-chip flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-all",
            "hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#00F0FF]",
          )}
        >
          <span className="text-[#F4C430]">{active?.id ?? "—"}</span>
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
            {active?.name}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[340px] overflow-hidden p-0 glass-strong">
        <div className="flex items-center gap-2 border-b border-border/60 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets…  (BTC, EUR, Gold)"
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0"
          />
        </div>
        <ScrollArea className="h-[320px]">
          <div className="p-1.5">
            {grouped.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No markets match “{query}”
              </p>
            )}
            {grouped.map((group) => (
              <div key={group.market} className="mb-1">
                <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {MARKET_LABELS[group.market]}
                </p>
                {group.symbols.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelect(s.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors",
                      "hover:bg-accent",
                      s.id === value && "bg-blue-500/10",
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold text-foreground">
                        {s.id}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {s.name}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {s.exchange} · {s.decimals > 2 ? "5-digit quote" : "2-digit quote"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        MARKET_CHIP[s.market],
                      )}
                    >
                      {MARKET_LABELS[s.market]}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
