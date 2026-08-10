import { useNavigate } from "react-router";
import {
  Activity,
  BarChart3,
  CandlestickChart,
  Check,
  Cpu,
  FunctionSquare,
  Grid2x2,
  LineChart,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Rows2,
  Square,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { TIMEFRAMES, findSymbol, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";
import type { EngineMode } from "@/components/chart/ChartCanvas";
import type { ChartType } from "@/components/chart/CustomChart";
import SymbolSearch from "@/components/chart/SymbolSearch";

export type LayoutId = "1x1" | "2x1" | "2x2";

const CHART_TYPES: { id: ChartType; label: string; icon: typeof LineChart }[] = [
  { id: "candles", label: "Candles", icon: CandlestickChart },
  { id: "line", label: "Line", icon: LineChart },
  { id: "bar", label: "Bars", icon: BarChart3 },
  { id: "heikin", label: "Heikin Ashi", icon: Activity },
];

const LAYOUTS: { id: LayoutId; icon: typeof Square; label: string }[] = [
  { id: "1x1", icon: Square, label: "Single chart" },
  { id: "2x1", icon: Rows2, label: "Two stacked charts" },
  { id: "2x2", icon: Grid2x2, label: "Four-chart grid" },
];

interface TopBarProps {
  symbolId: string;
  onSymbolSelect: (id: string) => void;
  intervalId: TimeframeId;
  onIntervalChange: (id: TimeframeId) => void;
  chartType: ChartType;
  onChartTypeChange: (t: ChartType) => void;
  indicatorCount: number;
  onOpenIndicators: () => void;
  engineMode: EngineMode;
  onEngineModeChange: (m: EngineMode) => void;
  layout: LayoutId;
  onLayoutChange: (l: LayoutId) => void;
  rightOpen: boolean;
  onToggleRight: () => void;
}

export default function TopBar({
  symbolId,
  onSymbolSelect,
  intervalId,
  onIntervalChange,
  chartType,
  onChartTypeChange,
  indicatorCount,
  onOpenIndicators,
  engineMode,
  onEngineModeChange,
  layout,
  onLayoutChange,
  rightOpen,
  onToggleRight,
}: TopBarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const activeSymbol = findSymbol(symbolId);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials =
    user?.name?.trim()
      ? user.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : (user?.email ?? "T")[0].toUpperCase();

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border/60 px-3 py-2">
      <div className="glass-chip flex items-center gap-2.5 rounded-xl px-2.5 py-1.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-md shadow-indigo-500/30">
          <CandlestickChart className="size-4" />
        </div>
        <div className="hidden leading-tight lg:block">
          <p className="text-[13px] font-bold tracking-tight text-foreground">
            TradeDeck
          </p>
          <p className="text-[10px] text-muted-foreground">Trading terminal</p>
        </div>
        {user?.role === "admin" && (
          <Badge className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700">
            Admin
          </Badge>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SymbolSearch value={symbolId} onSelect={onSymbolSelect} />

        <div className="glass-chip flex h-9 shrink-0 items-center gap-0.5 rounded-lg p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => onIntervalChange(tf.id)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-semibold transition-all",
                tf.id === intervalId
                  ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/40"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-800",
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-white/80"
            >
              {(() => {
                const t = CHART_TYPES.find((c) => c.id === chartType);
                const Icon = t?.icon ?? CandlestickChart;
                return <Icon className="size-4 text-indigo-600" />;
              })()}
              <span className="hidden sm:inline">
                {CHART_TYPES.find((c) => c.id === chartType)?.label}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="glass-strong w-44">
            <DropdownMenuLabel>Chart type</DropdownMenuLabel>
            {CHART_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => onChartTypeChange(t.id)}
                  className="gap-2.5"
                >
                  <Icon className="size-4 text-slate-500" />
                  <span className="flex-1">{t.label}</span>
                  {chartType === t.id && <Check className="size-4 text-indigo-600" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={onOpenIndicators}
          className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-white/80"
        >
          <FunctionSquare className="size-4 text-indigo-600" />
          <span className="hidden sm:inline">Indicators</span>
          {indicatorCount > 0 && (
            <span className="rounded-full bg-indigo-500 px-1.5 py-px text-[10px] font-bold text-white">
              {indicatorCount}
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-white/80"
            >
              <Cpu className="size-4 text-indigo-600" />
              <span className="hidden md:inline">Engine</span>
              <span className="text-[10px] font-bold uppercase text-slate-400">
                {engineMode}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="glass-strong w-56">
            <DropdownMenuLabel>Chart engine</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={engineMode}
              onValueChange={(v) => onEngineModeChange(v as EngineMode)}
            >
              <DropdownMenuRadioItem value="auto">
                Auto
                <span className="ml-auto text-[10px] text-muted-foreground">
                  recommended
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="custom">
                Custom canvas
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="tv">
                TradingView widget
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <p className="px-2 pb-1.5 text-[10px] leading-4 text-muted-foreground">
              Auto uses the TradingView widget when available, with the custom
              canvas as an offline-safe fallback.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="glass-chip hidden items-center gap-0.5 rounded-lg p-1 md:flex">
          {LAYOUTS.map((l) => {
            const Icon = l.icon;
            return (
              <Tooltip key={l.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={l.label}
                    onClick={() => onLayoutChange(l.id)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md transition-all",
                      layout === l.id
                        ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/40"
                        : "text-slate-500 hover:bg-white/70 hover:text-slate-800",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{l.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="glass-chip rounded-lg text-slate-600 hover:bg-white/80 hover:text-indigo-600"
              onClick={onToggleRight}
            >
              {rightOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {rightOpen ? "Hide right panel" : "Show right panel"}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="glass-chip flex items-center gap-2 rounded-lg py-1 pl-1 pr-2.5 transition-all hover:bg-white/80"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-sky-400 text-[11px] font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight sm:block">
                <p className="max-w-[110px] truncate text-xs font-semibold text-foreground">
                  {user?.name?.trim() || (user?.email ?? "Trader")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {user?.role === "admin" ? "Administrator" : "Trader"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {user?.name?.trim() || "Trader"}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {user?.email ?? "Guest session"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} className="text-rose-600 focus:text-rose-600">
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="sr-only">
        {activeSymbol ? `${activeSymbol.id} — ${activeSymbol.name}` : "No symbol"}
      </span>
    </header>
  );
}
