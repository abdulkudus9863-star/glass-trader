import {
  Activity,
  BarChart3,
  BrainCircuit,
  CandlestickChart,
  Check,
  Cpu,
  Grid2x2,
  LineChart,
  PanelRightClose,
  PanelRightOpen,
  Radar,
  Rows2,
  SlidersHorizontal,
  Square,
} from "lucide-react";
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
import { TIMEFRAMES, type TimeframeId } from "@/lib/market";
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
  engineMode: EngineMode;
  onEngineModeChange: (m: EngineMode) => void;
  layout: LayoutId;
  onLayoutChange: (l: LayoutId) => void;
  rightOpen: boolean;
  onToggleRight: () => void;
  smcOpen: boolean;
  onToggleSmc: () => void;
  indicatorDrawerOpen: boolean;
  onToggleIndicatorDrawer: () => void;
  aiOpen: boolean;
  onToggleAi: () => void;
  strategyCount: number;
}

export default function TopBar({
  symbolId,
  onSymbolSelect,
  intervalId,
  onIntervalChange,
  chartType,
  onChartTypeChange,
  engineMode,
  onEngineModeChange,
  layout,
  onLayoutChange,
  rightOpen,
  onToggleRight,
  smcOpen,
  onToggleSmc,
  indicatorDrawerOpen,
  onToggleIndicatorDrawer,
  aiOpen,
  onToggleAi,
  strategyCount,
}: TopBarProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[#1B263B] bg-[#050811]/70 px-3 py-2">
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
                  ? "bg-[#F4C430] text-[#0a0e1a] shadow-sm shadow-[#F4C430]/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
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
              className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-300 transition-all hover:bg-white/5"
            >
              {(() => {
                const t = CHART_TYPES.find((c) => c.id === chartType);
                const Icon = t?.icon ?? CandlestickChart;
                return <Icon className="size-4 text-[#F4C430]" />;
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
                  <Icon className="size-4 text-slate-400" />
                  <span className="flex-1">{t.label}</span>
                  {chartType === t.id && <Check className="size-4 text-[#F4C430]" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-300 transition-all hover:bg-white/5"
            >
              <Cpu className="size-4 text-[#F4C430]" />
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
              <DropdownMenuRadioItem value="tv">
                TradingView widget
                <span className="ml-auto text-[10px] text-muted-foreground">
                  default
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="auto">
                Auto
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="custom">
                Custom canvas
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <p className="px-2 pb-1.5 text-[10px] leading-4 text-muted-foreground">
              The official TradingView engine is the default. Switch to the
              custom canvas for SMC overlays, drawing tools, and strategy
              injections.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Strategy overlays count */}
        {strategyCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-[#A855F7]/30 bg-[#A855F7]/10 px-2.5 text-xs font-semibold text-[#A855F7]"
              >
                <BrainCircuit className="size-4" />
                <span className="font-mono text-[11px] font-bold">{strategyCount}</span>
                <span className="hidden lg:inline">overlay</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {strategyCount} strategy overlay{strategyCount > 1 ? "s" : ""} on the canvas
            </TooltipContent>
          </Tooltip>
        )}

        {/* Indicator drawer */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleIndicatorDrawer}
              className={cn(
                "glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all hover:bg-white/5",
                indicatorDrawerOpen
                  ? "text-[#00F0FF] ring-1 ring-[#00F0FF]/40"
                  : "text-slate-300",
              )}
            >
              <SlidersHorizontal className="size-4 text-[#00F0FF]" />
              <span className="hidden md:inline">Indicators</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Quick-toggle indicator drawer</TooltipContent>
        </Tooltip>

        {/* AI analysis */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleAi}
              className={cn(
                "glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all hover:bg-white/5",
                aiOpen ? "text-[#A855F7] ring-1 ring-[#A855F7]/40" : "text-slate-300",
              )}
            >
              <BrainCircuit className="size-4 text-[#A855F7]" />
              <span className="hidden md:inline">AI Analysis</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">AI analysis bottom drawer</TooltipContent>
        </Tooltip>

        {/* SMC AI */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleSmc}
              className={cn(
                "glass-chip flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all hover:bg-white/5",
                smcOpen ? "text-[#F4C430] ring-1 ring-[#F4C430]/40" : "text-slate-300",
              )}
            >
              <Radar className="size-4 text-[#F4C430]" />
              <span className="hidden md:inline">SMC AI</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">SMC AI analysis</TooltipContent>
        </Tooltip>

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
                        ? "bg-[#F4C430] text-[#0a0e1a] shadow-sm shadow-[#F4C430]/30"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
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
              className="glass-chip h-9 w-9 rounded-lg text-slate-400 hover:bg-white/5 hover:text-[#F4C430]"
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
      </div>
    </header>
  );
}
