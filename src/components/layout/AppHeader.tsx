import {
  Calculator,
  CandlestickChart,
  ChevronDown,
  FunctionSquare,
  GraduationCap,
  LogOut,
  MessagesSquare,
  NotebookPen,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { findSymbol, type MarketType } from "@/lib/market";
import { cn } from "@/lib/utils";

export type AppTab =
  | "chart"
  | "academy"
  | "calculator"
  | "journal"
  | "chat"
  | "admin";

interface NavItem {
  id: AppTab;
  label: string;
  icon: typeof CandlestickChart;
}

const NAV_ITEMS: NavItem[] = [
  { id: "chart", label: "Chart", icon: CandlestickChart },
  { id: "academy", label: "Academy", icon: GraduationCap },
  { id: "calculator", label: "Position Calculator", icon: Calculator },
  { id: "journal", label: "Trade Journal", icon: NotebookPen },
  { id: "chat", label: "Community Chat", icon: MessagesSquare },
];

/** Assets offered by the quick-selector dropdown in the top bar. */
const QUICK_ASSETS = ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSD"] as const;

const MARKET_CHIP: Record<MarketType, string> = {
  crypto: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  forex: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  metals: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  indices: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  stocks: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

interface AppHeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  symbolId: string;
  onSymbolSelect: (id: string) => void;
  indicatorCount: number;
  onOpenIndicators: () => void;
}

export default function AppHeader({
  activeTab,
  onTabChange,
  symbolId,
  onSymbolSelect,
  indicatorCount,
  onOpenIndicators,
}: AppHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const activeSymbol = findSymbol(symbolId);

  const navItems: NavItem[] = isAdmin
    ? [...NAV_ITEMS, { id: "admin", label: "Admin Portal", icon: ShieldCheck }]
    : NAV_ITEMS;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = user?.name?.trim()
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : (user?.email ?? "T")[0].toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/5 bg-[#0b101b]/95 px-3 backdrop-blur-xl sm:px-4">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-yellow-600 text-[#0b101b] shadow-md shadow-amber-500/20">
          <CandlestickChart className="size-4" strokeWidth={2.4} />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-[13px] font-bold tracking-tight text-amber-400">
            Abdul Kudus
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
            Trading Academy
          </p>
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="mx-auto hidden items-center gap-1 lg:flex">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all",
                active
                  ? "bg-amber-400/10 text-amber-400 shadow-sm shadow-amber-500/10 ring-1 ring-amber-400/25"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
              {item.id === "admin" && (
                <span className="rounded bg-amber-400/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-400">
                  Admin
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right cluster */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* Asset quick-selector */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="glass-chip flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition-all hover:bg-white/5"
            >
              <span className="text-amber-400">{activeSymbol?.id ?? "—"}</span>
              <span className="hidden text-xs font-medium text-muted-foreground md:inline">
                {activeSymbol?.name}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="glass-strong w-[240px] overflow-hidden p-1.5"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick select
            </p>
            {QUICK_ASSETS.map((id) => {
              const s = findSymbol(id);
              if (!s) return null;
              const active = symbolId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSymbolSelect(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/5",
                    active && "bg-amber-400/10",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-foreground">
                      {s.id}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {s.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      MARKET_CHIP[s.market],
                    )}
                  >
                    {s.market}
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Indicators trigger */}
        <button
          type="button"
          onClick={onOpenIndicators}
          className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-300 transition-all hover:bg-white/5"
        >
          <FunctionSquare className="size-4 text-amber-400" />
          <span className="hidden sm:inline">ƒx Indicators</span>
          {indicatorCount > 0 && (
            <span className="rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-bold text-[#0b101b]">
              {indicatorCount}
            </span>
          )}
        </button>

        {/* Profile badge */}
        <div className="glass-chip flex h-9 items-center gap-2 rounded-lg py-1 pl-1 pr-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-gradient-to-br from-amber-400 to-yellow-600 text-[11px] font-bold text-[#0b101b]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left leading-tight xl:block">
            <p className="max-w-[110px] truncate text-xs font-semibold text-foreground">
              {user?.name?.trim() || (user?.email ?? "Trader")}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isAdmin ? "Administrator" : "Academy member"}
            </p>
          </div>
        </div>

        {/* Logout */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              className="glass-chip h-9 w-9 rounded-lg text-slate-400 hover:bg-white/5 hover:text-rose-400"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
