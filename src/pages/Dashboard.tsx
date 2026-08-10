import { AnimatePresence } from "framer-motion";
import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AiAnalysisDrawer from "@/components/chart/AiAnalysisDrawer";
import ChartCanvas, { type EngineMode } from "@/components/chart/ChartCanvas";
import { type ChartType, type ToolId } from "@/components/chart/CustomChart";
import DrawingToolbar from "@/components/chart/DrawingToolbar";
import IndicatorDrawer from "@/components/chart/IndicatorDrawer";
import IndicatorModal from "@/components/chart/IndicatorModal";
import AppHeader from "@/components/layout/AppHeader";
import MobileNav, { type AppTab } from "@/components/layout/MobileNav";
import TopBar, { type LayoutId } from "@/components/layout/TopBar";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useTokens } from "@/hooks/use-tokens";
import { useAuth } from "@/hooks/use-auth";
import { findSymbol, type TimeframeId } from "@/lib/market";
import {
  overlayFromSpec,
  type StrategyOverlay,
  type StrategySpec,
} from "@/lib/strategy";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import RightPanel from "@/components/workspace/RightPanel";
import Copilot from "@/components/workspace/Copilot";
import MorePanel from "@/components/workspace/MorePanel";
import Radar from "@/components/workspace/Radar";
import SmcAnalysisDrawer from "@/components/workspace/SmcAnalysisDrawer";
import StrategyCompiler from "@/components/workspace/StrategyCompiler";

interface PaneState {
  id: string;
  symbolId: string;
  intervalId: TimeframeId;
}

const DEFAULT_PANES: PaneState[] = [
  { id: "p1", symbolId: "XAUUSD", intervalId: "1H" },
  { id: "p2", symbolId: "BTCUSDT", intervalId: "1H" },
  { id: "p3", symbolId: "EURUSD", intervalId: "15m" },
  { id: "p4", symbolId: "GBPUSD", intervalId: "15m" },
];

const GRID_CLASSES: Record<LayoutId, string> = {
  "1x1": "grid h-full grid-cols-1 grid-rows-1 gap-3",
  "2x1": "grid h-full grid-cols-1 grid-rows-2 gap-3",
  "2x2": "grid h-full grid-cols-1 grid-rows-4 gap-3 sm:grid-cols-2 sm:grid-rows-2",
};

const MARKET_CHIP: Record<string, string> = {
  crypto: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  forex: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  metals: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  indices: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  stocks: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

interface PaneCardProps {
  pane: PaneState;
  active: boolean;
  chartType: ChartType;
  indicatorList: string[];
  tool: ToolId;
  engineMode: EngineMode;
  chartMinHeight?: number;
  founderBadge?: boolean;
  strategies: StrategyOverlay[];
  onActivate: () => void;
  onToolConsumed: () => void;
}

function PaneCard({
  pane,
  active,
  chartType,
  indicatorList,
  tool,
  engineMode,
  chartMinHeight = 0,
  founderBadge = false,
  strategies,
  onActivate,
  onToolConsumed,
}: PaneCardProps) {
  const sym = findSymbol(pane.symbolId) ?? findSymbol("BTCUSDT")!;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter") onActivate();
      }}
      className={cn(
        "group relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl glass transition-all",
        active
          ? "shadow-lg shadow-black/40 ring-2 ring-[#F4C430]/70"
          : "hover:ring-1 hover:ring-[#F4C430]/40",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[13px] font-bold tracking-tight text-foreground">
            {sym.id}
          </span>
          <span className="hidden truncate text-[11px] text-muted-foreground md:inline">
            {sym.name}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "hidden border px-1.5 py-px text-[9px] font-semibold sm:inline-flex",
              MARKET_CHIP[sym.market],
            )}
          >
            {sym.market}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          {active && (
            <span className="hidden rounded-full bg-emerald-500/10 px-1.5 py-px font-semibold text-emerald-400 sm:inline">
              active
            </span>
          )}
          <span className="rounded bg-white/5 px-1.5 py-px font-semibold text-slate-300">
            {pane.intervalId}
          </span>
          {indicatorList.length > 0 && (
            <span className="rounded-full bg-[#F4C430]/15 px-1.5 py-px font-semibold text-[#F4C430]">
              {indicatorList.length}
            </span>
          )}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 max-sm:min-h-[550px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ChartCanvas
          paneId={pane.id}
          symbolId={pane.symbolId}
          intervalId={pane.intervalId}
          chartType={chartType}
          indicators={indicatorList}
          tool={active ? tool : null}
          onToolConsumed={onToolConsumed}
          engineMode={engineMode}
          minHeight={chartMinHeight}
          founderBadge={founderBadge}
          strategies={strategies}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isFounder = user?.isFounder === true;
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<AppTab>("radar");
  const [smcOpen, setSmcOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [indicatorDrawerOpen, setIndicatorDrawerOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutId>("1x1");
  const [panes, setPanes] = useState<PaneState[]>(DEFAULT_PANES);
  const [activeId, setActiveId] = useState("p1");
  const [rightOpen, setRightOpen] = useState(true);
  const [engineMode, setEngineMode] = useState<EngineMode>("auto");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [tool, setTool] = useState<ToolId>(null);
  const [indicatorModalOpen, setIndicatorModalOpen] = useState(false);
  const [indicators, setIndicators] = useState<Set<string>>(
    () => new Set(["volume", "sma20"]),
  );
  const [strategies, setStrategies] = useState<StrategyOverlay[]>([]);

  const { tokens, spend } = useTokens();
  const { canInstall, install } = usePwaInstall();

  const indicatorList = useMemo(() => [...indicators], [indicators]);
  const visiblePanes =
    layout === "1x1" ? panes.slice(0, 1) : layout === "2x1" ? panes.slice(0, 2) : panes;
  const activePane = panes.find((p) => p.id === activeId) ?? panes[0];

  /* keep the active pane within the visible layout */
  useEffect(() => {
    if (!visiblePanes.some((p) => p.id === activeId)) {
      setActiveId(visiblePanes[0].id);
    }
  }, [layout, activeId, visiblePanes]);

  const updateActivePane = (
    patch: Partial<Pick<PaneState, "symbolId" | "intervalId">>,
  ) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === activeId ? { ...p, ...patch } : p)),
    );
  };

  const handleSelectSymbol = (id: string) => {
    updateActivePane({ symbolId: id });
  };

  const toggleIndicator = (id: string) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* Strategy compiler → chart injection */
  const applyStrategyToChart = (spec: StrategySpec) => {
    setStrategies((prev) => [
      ...prev.filter((s) => s.id !== spec.id),
      overlayFromSpec(spec),
    ]);
    if (spec.asset !== activePane.symbolId) {
      updateActivePane({ symbolId: spec.asset });
    }
    setEngineMode("custom"); // overlays render on the custom canvas
    setTab("charts");
  };

  const toggleStrategyVisible = (id: string) => {
    setStrategies((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    );
  };

  const removeStrategy = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#050811] text-foreground">
      <AppHeader
        symbolId={activePane.symbolId}
        onSymbolSelect={handleSelectSymbol}
        indicatorCount={indicatorList.length}
        onOpenIndicators={() => setIndicatorModalOpen(true)}
        tokens={tokens}
        isFounder={isFounder}
        canInstall={canInstall}
        onInstall={install}
      />

      {tab === "charts" && (
        <TopBar
          symbolId={activePane.symbolId}
          onSymbolSelect={(id) => updateActivePane({ symbolId: id })}
          intervalId={activePane.intervalId}
          onIntervalChange={(id) => updateActivePane({ intervalId: id })}
          chartType={chartType}
          onChartTypeChange={setChartType}
          engineMode={engineMode}
          onEngineModeChange={setEngineMode}
          layout={layout}
          onLayoutChange={setLayout}
          rightOpen={rightOpen}
          onToggleRight={() => setRightOpen((o) => !o)}
          smcOpen={smcOpen}
          onToggleSmc={() => setSmcOpen((o) => !o)}
          indicatorDrawerOpen={indicatorDrawerOpen}
          onToggleIndicatorDrawer={() => setIndicatorDrawerOpen((o) => !o)}
          aiOpen={aiOpen}
          onToggleAi={() => setAiOpen((o) => !o)}
          strategyCount={strategies.length}
        />
      )}

      {/* Active strategy overlays strip (charts tab) */}
      {tab === "charts" && strategies.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#1B263B] bg-[#0D1424]/60 px-3 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Active indicators
          </span>
          {strategies.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border border-[#A855F7]/30 bg-[#A855F7]/10 py-0.5 pl-2.5 pr-1 text-[10px] font-semibold text-[#A855F7]"
            >
              <span className="size-1.5 rounded-full bg-[#A855F7]" />
              {s.name}
              <span className="rounded bg-white/10 px-1 font-mono text-[9px] text-slate-300">
                {s.asset}
              </span>
              <button
                type="button"
                aria-label={s.visible ? "Hide overlay" : "Show overlay"}
                onClick={() => toggleStrategyVisible(s.id)}
                className="flex size-5 items-center justify-center rounded-full text-[#A855F7]/70 transition-colors hover:bg-white/10 hover:text-[#A855F7]"
              >
                {s.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
              </button>
              <button
                type="button"
                aria-label="Remove overlay"
                onClick={() => removeStrategy(s.id)}
                className="flex size-5 items-center justify-center rounded-full text-[#A855F7]/70 transition-colors hover:bg-white/10 hover:text-rose-400"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Content — every tab stays mounted so the chart never loses state */}
      <div className="relative min-h-0 flex-1">
        {/* RADAR */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "radar" && "hidden",
          )}
        >
          <Radar symbolId={activePane.symbolId} timeframe={activePane.intervalId} />
        </div>

        {/* CHARTS */}
        <div
          className={cn(
            "absolute inset-0 flex gap-2.5 p-2.5 max-sm:overflow-y-auto",
            tab !== "charts" && "hidden",
          )}
        >
          <div className="hidden shrink-0 md:block">
            <DrawingToolbar tool={tool} onToolChange={setTool} />
          </div>

          <main
            className={cn(
              "min-h-0 min-w-0 flex-1 max-sm:h-auto max-sm:min-h-full",
              GRID_CLASSES[layout],
            )}
          >
            {visiblePanes.map((pane) => (
              <PaneCard
                key={pane.id}
                pane={pane}
                active={pane.id === activeId}
                chartType={chartType}
                indicatorList={indicatorList}
                tool={tool}
                engineMode={engineMode}
                chartMinHeight={layout === "1x1" ? 550 : 0}
                founderBadge={pane.id === activeId && isFounder}
                strategies={strategies}
                onActivate={() => setActiveId(pane.id)}
                onToolConsumed={() => setTool(null)}
              />
            ))}
          </main>

          <AnimatePresence>
            {rightOpen && (
              <RightPanel
                activeSymbolId={activePane.symbolId}
                onSelectSymbol={handleSelectSymbol}
              />
            )}
          </AnimatePresence>

          <SmcAnalysisDrawer open={smcOpen} onOpenChange={setSmcOpen} />
          <IndicatorDrawer
            open={indicatorDrawerOpen}
            onOpenChange={setIndicatorDrawerOpen}
            indicators={indicators}
            onToggle={toggleIndicator}
          />
          <AiAnalysisDrawer
            open={aiOpen}
            onOpenChange={setAiOpen}
            symbolId={activePane.symbolId}
            intervalId={activePane.intervalId}
          />
        </div>

        {/* STRATEGY */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "strategy" && "hidden",
          )}
        >
          <StrategyCompiler
            tokens={tokens}
            onSpend={spend}
            activeAsset={activePane.symbolId}
            activeTimeframe={activePane.intervalId}
            onApplyToChart={applyStrategyToChart}
          />
        </div>

        {/* COPILOT */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "copilot" && "hidden",
          )}
        >
          <Copilot symbolId={activePane.symbolId} />
        </div>

        {/* MORE */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "more" && "hidden",
          )}
        >
          <MorePanel isAdmin={isAdmin} isFounder={isFounder} />
        </div>
      </div>

      <IndicatorModal
        open={indicatorModalOpen}
        onOpenChange={setIndicatorModalOpen}
        indicators={indicators}
        onToggle={toggleIndicator}
      />

      <MobileNav activeTab={tab} onTabChange={setTab} />
    </div>
  );
}
