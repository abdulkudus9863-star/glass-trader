import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import ChartCanvas, { type EngineMode } from "@/components/chart/ChartCanvas";
import { type ChartType, type ToolId } from "@/components/chart/CustomChart";
import DrawingToolbar from "@/components/chart/DrawingToolbar";
import IndicatorModal from "@/components/chart/IndicatorModal";
import TopBar, { type LayoutId } from "@/components/layout/TopBar";
import RightPanel from "@/components/workspace/RightPanel";
import { findSymbol, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";

interface PaneState {
  id: string;
  symbolId: string;
  intervalId: TimeframeId;
}

const DEFAULT_PANES: PaneState[] = [
  { id: "p1", symbolId: "BTCUSDT", intervalId: "1H" },
  { id: "p2", symbolId: "ETHUSDT", intervalId: "1H" },
  { id: "p3", symbolId: "EURUSD", intervalId: "15m" },
  { id: "p4", symbolId: "XAUUSD", intervalId: "15m" },
];

const GRID_CLASSES: Record<LayoutId, string> = {
  "1x1": "grid h-full grid-cols-1 grid-rows-1 gap-3",
  "2x1": "grid h-full grid-cols-1 grid-rows-2 gap-3",
  "2x2": "grid h-full grid-cols-1 grid-rows-4 gap-3 sm:grid-cols-2 sm:grid-rows-2",
};

const MARKET_CHIP: Record<string, string> = {
  crypto: "bg-amber-500/10 text-amber-700 border-amber-500/25",
  forex: "bg-sky-500/10 text-sky-700 border-sky-500/25",
  metals: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
  indices: "bg-violet-500/10 text-violet-700 border-violet-500/25",
  stocks: "bg-rose-500/10 text-rose-700 border-rose-500/25",
};

interface PaneCardProps {
  pane: PaneState;
  active: boolean;
  chartType: ChartType;
  indicatorList: string[];
  tool: ToolId;
  engineMode: EngineMode;
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
          ? "shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-400/70"
          : "hover:ring-1 hover:ring-indigo-300/60",
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
            <span className="hidden rounded-full bg-emerald-500/10 px-1.5 py-px font-semibold text-emerald-600 sm:inline">
              active
            </span>
          )}
          <span className="rounded bg-white/60 px-1.5 py-px font-semibold text-slate-600">
            {pane.intervalId}
          </span>
          {indicatorList.length > 0 && (
            <span className="rounded-full bg-indigo-500/10 px-1.5 py-px font-semibold text-indigo-600">
              {indicatorList.length}
            </span>
          )}
        </div>
      </div>
      <div
        className="min-h-0 flex-1"
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
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
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

  const toggleIndicator = (id: string) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        symbolId={activePane.symbolId}
        onSymbolSelect={(id) => updateActivePane({ symbolId: id })}
        intervalId={activePane.intervalId}
        onIntervalChange={(id) => updateActivePane({ intervalId: id })}
        chartType={chartType}
        onChartTypeChange={setChartType}
        indicatorCount={indicatorList.length}
        onOpenIndicators={() => setIndicatorModalOpen(true)}
        engineMode={engineMode}
        onEngineModeChange={setEngineMode}
        layout={layout}
        onLayoutChange={setLayout}
        rightOpen={rightOpen}
        onToggleRight={() => setRightOpen((o) => !o)}
      />

      <div className="flex min-h-0 flex-1 gap-2.5 p-2.5">
        <div className="hidden shrink-0 md:block">
          <DrawingToolbar tool={tool} onToolChange={setTool} />
        </div>

        <main className={cn("min-h-0 min-w-0 flex-1", GRID_CLASSES[layout])}>
          {visiblePanes.map((pane) => (
            <PaneCard
              key={pane.id}
              pane={pane}
              active={pane.id === activeId}
              chartType={chartType}
              indicatorList={indicatorList}
              tool={tool}
              engineMode={engineMode}
              onActivate={() => setActiveId(pane.id)}
              onToolConsumed={() => setTool(null)}
            />
          ))}
        </main>

        <AnimatePresence>
          {rightOpen && (
            <RightPanel
              activeSymbolId={activePane.symbolId}
              onSelectSymbol={(id) => updateActivePane({ symbolId: id })}
            />
          )}
        </AnimatePresence>
      </div>

      <IndicatorModal
        open={indicatorModalOpen}
        onOpenChange={setIndicatorModalOpen}
        indicators={indicators}
        onToggle={toggleIndicator}
      />
    </div>
  );
}
