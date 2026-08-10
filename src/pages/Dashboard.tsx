import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import ChartCanvas, { type EngineMode } from "@/components/chart/ChartCanvas";
import { type ChartType, type ToolId } from "@/components/chart/CustomChart";
import DrawingToolbar from "@/components/chart/DrawingToolbar";
import IndicatorModal from "@/components/chart/IndicatorModal";
import AppHeader, { type AppTab } from "@/components/layout/AppHeader";
import MobileNav from "@/components/layout/MobileNav";
import TopBar, { type LayoutId } from "@/components/layout/TopBar";
import RightPanel from "@/components/workspace/RightPanel";
import CommunityChat from "@/components/workspace/CommunityChat";
import Academy from "@/components/workspace/Academy";
import AdminPortal from "@/components/workspace/AdminPortal";
import PositionCalculator from "@/components/workspace/PositionCalculator";
import TradeJournal from "@/components/workspace/TradeJournal";
import SmcAnalysisDrawer from "@/components/workspace/SmcAnalysisDrawer";
import { useAuth } from "@/hooks/use-auth";
import { findSymbol, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";

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
          ? "shadow-lg shadow-black/40 ring-2 ring-amber-400/70"
          : "hover:ring-1 hover:ring-amber-300/40",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[13px] font-bold tracking-tight text-foreground">
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
            <span className="rounded-full bg-amber-400/15 px-1.5 py-px font-semibold text-amber-400">
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
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isFounder = user?.isFounder === true;
  const [tab, setTab] = useState<AppTab>("chart");
  const [smcOpen, setSmcOpen] = useState(false);
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

  const updateActivePane = (patch: Partial<Pick<PaneState, "symbolId" | "intervalId">>) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === activeId ? { ...p, ...patch } : p)),
    );
  };

  const handleSelectSymbol = (id: string) => {
    updateActivePane({ symbolId: id });
    setTab("chart");
  };

  const toggleIndicator = (id: string) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#070B14] text-foreground">
      <AppHeader
        activeTab={tab}
        onTabChange={setTab}
        symbolId={activePane.symbolId}
        onSymbolSelect={handleSelectSymbol}
        indicatorCount={indicatorList.length}
        onOpenIndicators={() => setIndicatorModalOpen(true)}
      />

      {tab === "chart" && (
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
        />
      )}

      {/* Content — every tab stays mounted so the chart never loses state */}
      <div className="relative min-h-0 flex-1">
        {/* Chart */}
        <div
          className={cn(
            "absolute inset-0 flex gap-2.5 p-2.5 max-sm:overflow-y-auto",
            tab !== "chart" && "hidden",
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
        </div>

        {/* Academy */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "academy" && "hidden",
          )}
        >
          <Academy />
        </div>

        {/* Position calculator */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "calculator" && "hidden",
          )}
        >
          <PositionCalculator />
        </div>

        {/* Trade journal */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "journal" && "hidden",
          )}
        >
          <TradeJournal />
        </div>

        {/* Community chat */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "chat" && "hidden",
          )}
        >
          <div className="flex h-full flex-col p-4">
            <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
              <CommunityChat />
            </div>
          </div>
        </div>

        {/* Admin portal */}
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto",
            tab !== "admin" && "hidden",
          )}
        >
          <AdminPortal />
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
