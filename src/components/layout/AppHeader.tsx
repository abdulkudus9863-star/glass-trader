import {
  ChevronDown,
  CircleDollarSign,
  Crown,
  Download,
  FunctionSquare,
  KeyRound,
  LogOut,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

/** Assets offered by the quick-selector dropdown in the top bar. */
const QUICK_ASSETS = ["XAUUSD", "BTCUSDT", "EURUSD", "ETHUSDT"] as const;

const MARKET_CHIP: Record<MarketType, string> = {
  crypto: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  forex: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  metals: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  indices: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  stocks: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

interface AppHeaderProps {
  symbolId: string;
  onSymbolSelect: (id: string) => void;
  indicatorCount: number;
  onOpenIndicators: () => void;
  tokens: number;
  isFounder: boolean;
  canInstall: boolean;
  onInstall: () => void;
  isRegistered?: boolean;
  onOpenRegistration?: () => void;
}

export default function AppHeader({
  symbolId,
  onSymbolSelect,
  indicatorCount,
  onOpenIndicators,
  tokens,
  isFounder,
  canInstall,
  onInstall,
  isRegistered = true,
  onOpenRegistration,
}: AppHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const activeSymbol = findSymbol(symbolId);

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
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#1B263B] bg-[#050811]/95 px-3 backdrop-blur-xl sm:px-4">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a] shadow-md shadow-[#F4C430]/20">
          <CandlestickMark />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight text-[#F4C430]">
            Ak Analyser
            <span className="rounded bg-[#F4C430]/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-widest text-[#F4C430] ring-1 ring-[#F4C430]/30">
              Beta
            </span>
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
            DEEEPR AI 2.0 Engine
          </p>
        </div>
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* Token wallet */}
        <div className={cn(
          "glass-chip hidden h-9 items-center gap-1.5 rounded-lg px-2.5 md:flex",
          tokens < 5 && "border-[#FF1744]/40",
        )}>
          <CircleDollarSign className={cn("size-4", tokens < 5 ? "text-[#FF1744]" : "text-[#F4C430]")} />
          <span className={cn("font-mono text-xs font-bold", tokens < 5 ? "text-[#FF1744]" : "text-foreground")}>{tokens}</span>
          <span className="hidden text-[10px] font-medium text-muted-foreground xl:inline">
            {tokens < 5 ? "Low Credits" : "Trial Tokens"}
          </span>
        </div>

        {/* Account status */}
        <div
          className={cn(
            "glass-chip hidden h-9 items-center gap-1.5 rounded-lg px-2.5 sm:flex",
          )}
        >
          {isFounder ? (
            <Crown className="size-3.5 text-[#F4C430]" />
          ) : (
            <span className="size-2 rounded-full bg-[#00F0FF]" />
          )}
          <span
            className={cn(
              "font-display text-[10px] font-bold tracking-[0.18em]",
              isFounder ? "text-[#F4C430]" : "text-[#00F0FF]",
            )}
          >
            {isFounder ? "FOUNDER" : "PRO"}
          </span>
        </div>

        {/* Install PWA */}
        {canInstall && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Install app"
                className="glass-chip h-9 w-9 rounded-lg text-slate-400 hover:bg-white/5 hover:text-[#F4C430]"
                onClick={onInstall}
              >
                <Download className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Install the app</TooltipContent>
          </Tooltip>
        )}

        {/* Asset quick-selector */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="glass-chip flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition-all hover:bg-white/5"
            >
              <span className="text-[#F4C430]">{activeSymbol?.id ?? "—"}</span>
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
                    active && "bg-[#F4C430]/10",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-sm font-semibold text-foreground">
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
          <FunctionSquare className="size-4 text-[#F4C430]" />
          <span className="hidden sm:inline">ƒx Indicators</span>
          {indicatorCount > 0 && (
            <span className="rounded-full bg-[#F4C430] px-1.5 py-px text-[10px] font-bold text-[#0a0e1a]">
              {indicatorCount}
            </span>
          )}
        </button>

        {/* Profile button → opens the Profile section in the More panel */}
        {isRegistered ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-profile"))}
            aria-label="Open profile"
            className="glass-chip hidden h-9 items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-left transition-colors hover:bg-white/5 lg:flex"
          >
            <Avatar className="size-7">
              {user?.image ? (
                <AvatarImage src={user.image} alt={user.name ?? "Avatar"} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[11px] font-bold text-[#0a0e1a]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left leading-tight xl:block">
              <p className="max-w-[110px] truncate text-xs font-semibold text-foreground">
                {user?.name?.trim() || (user?.email ?? "Trader")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isFounder ? "Founder / Super Admin" : isAdmin ? "Administrator" : "Verified Member"}
              </p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenRegistration}
            className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[#F4C430] transition-all hover:bg-[#F4C430]/10 hover:shadow-sm hover:shadow-[#F4C430]/10 lg:flex"
          >
            <KeyRound className="size-3.5" />
            <span className="hidden xl:inline">Access / Register</span>
          </button>
        )}

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

function CandlestickMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 3v3M8 18v3M16 3v3M16 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="5.5" y="6" width="5" height="12" rx="1" fill="currentColor" />
      <rect x="13.5" y="6" width="5" height="8" rx="1" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
