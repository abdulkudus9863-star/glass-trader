import { useMemo, useState } from "react";
import { FunctionSquare, Lock, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  INDICATORS,
  INDICATOR_CATEGORIES,
  LOCKED_INDICATORS,
  type IndicatorCategory,
} from "@/lib/indicators";
import { cn } from "@/lib/utils";

const CATEGORY_STYLE: Record<IndicatorCategory, string> = {
  Trend: "bg-[#00F0FF]/10 text-[#00F0FF] border-[#00F0FF]/25",
  Momentum: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  Volume: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  Volatility: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  SMC: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
};

interface IndicatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicators: Set<string>;
  onToggle: (id: string) => void;
}

export default function IndicatorModal({
  open,
  onOpenChange,
  indicators,
  onToggle,
}: IndicatorModalProps) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDICATOR_CATEGORIES.map((cat) => ({
      category: cat,
      items: INDICATORS.filter(
        (i) =>
          i.category === cat &&
          (!q ||
            i.name.toLowerCase().includes(q) ||
            i.id.includes(q) ||
            i.description.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-md gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#00F0FF]/10 text-[#00F0FF]">
              <FunctionSquare className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Indicators</DialogTitle>
              <DialogDescription className="mt-0.5">
                Attach studies to the active chart
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicators…"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <Badge variant="secondary" className="shrink-0">
            {indicators.size} active
          </Badge>
        </div>

        <ScrollArea className="max-h-[46vh]">
          <div className="p-3">
            {groups.map((g) => (
              <div key={g.category} className="mb-2">
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.category}
                </p>
                {g.items.map((ind) => {
                  const on = indicators.has(ind.id);
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => onToggle(ind.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-accent/70",
                        on && "bg-blue-500/10",
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: ind.color }}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-semibold text-foreground">
                          {ind.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {ind.description}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("hidden border sm:inline-flex", CATEGORY_STYLE[ind.category])}
                      >
                        {ind.category}
                      </Badge>
                      <Switch checked={on} onCheckedChange={() => onToggle(ind.id)} />
                    </button>
                  );
                })}
              </div>
            ))}

            <div className="mt-3 rounded-lg border border-dashed border-border/80 p-3">
              <div className="flex items-center gap-2">
                <Lock className="size-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground">
                  Invite-only tools
                </p>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground/80">
                {LOCKED_INDICATORS.map((l) => l.name).join(" · ")} are proprietary
                and unlock via the admin invitation system (v2).
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/60 px-5 py-3.5 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Indicators apply to all open panes
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-lg"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
