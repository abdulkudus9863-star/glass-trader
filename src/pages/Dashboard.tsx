import { AnimatePresence } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ChartCanvas from "@/components/chart/ChartCanvas";
import StrategyOverlay from "@/components/chart/StrategyOverlay";
import TradeIntelligence from "@/components/chart/TradeIntelligence";
import { useStrategy } from "@/contexts/StrategyContext";
import {
  loadChartMode,
  saveChartMode,
  type ChartMode,
  type ChartType,
} from "@/components/chart/CustomChart";
import IndicatorDrawer from "@/components/chart/IndicatorDrawer";
import IndicatorModal from "@/components/chart/IndicatorModal";
import AppHeader from "@/components/layout/AppHeader";
import MobileNav, { type AppTab } from "@/components/layout/MobileNav";
import TopBar, { type LayoutId } from "@/components/layout/TopBar";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useTokens } from "@/hooks/use-tokens";
import { useAuth } from "@/hooks/use-auth";
import { useRegistration } from "@/hooks/use-registration";
import RegistrationModal from "@/components/auth/RegistrationModal";
import { toast } from "sonner";
import { useKlines } from "@/hooks/use-klines";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useDeeepr } from "@/hooks/use-deeepr";
import { findSymbol, type TimeframeId } from "@/lib/market";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import RightPanel from "@/components/workspace/RightPanel";
import Copilot from "@/components/workspace/Copilot";
import MorePanel from "@/components/workspace/MorePanel";
import Radar from "@/components/workspace/Radar";
import SmcAnalysisDrawer from "@/components/workspace/SmcAnalysisDrawer";
import StrategyCompiler from "@/components/workspace/StrategyCompiler";
import Watchlist from "@/components/workspace/Watchlist";
import CommunityChat from "@/components/workspace/CommunityChat";
import MyAccess from "@/components/workspace/MyAccess";

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
  mode: ChartMode;
  indicatorList: string[];
  onActivate: () => void;
}

function PaneCard({
  pane,
  active,
  mode,
  indicatorList,
  onActivate,
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
        className="min-h-0 flex-1"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ChartCanvas
          symbolId={pane.symbolId}
          intervalId={pane.intervalId}
          mode={mode}
          indicators={indicatorList}
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
  const chartType: ChartType = "candles"; // Both chart engines render candlesticks
  const [chartMode, setChartMode] = useState<ChartMode>(() => loadChartMode());
  const handleChartModeChange = (m: ChartMode) => {
    setChartMode(m);
    saveChartMode(m);
  };
  const [indicatorModalOpen, setIndicatorModalOpen] = useState(false);
  const [indicators, setIndicators] = useState<Set<string>>(
    () => new Set(["volume", "sma20"]),
  );
  const { tokens, spend } = useTokens();
  const { isRegistered, register } = useRegistration();
  const [regModalOpen, setRegModalOpen] = useState(false);

  /**
   * AI Analysis costs 5 tokens. Deduct on open; prevent open if insufficient.
   * Closing the panel is always free.
   *
   * Side effects never run inside a state updater: React may invoke updaters
   * twice (StrictMode / concurrent rendering), which would double-spend.
   * A ref guard makes a rapid double-click idempotent as well.
   */
  const AI_COST = 5;
  const aiSpendPendingRef = useRef(false);
  const handleToggleAi = () => {
    if (aiOpen) {
      setAiOpen(false);
      return;
    }
    if (tokens < AI_COST) {
      toast.error("Insufficient tokens. 5 tokens required to run AI Analysis.");
      return;
    }
    if (aiSpendPendingRef.current) return;
    aiSpendPendingRef.current = true;
    setAiOpen(true);
    void spend(AI_COST)
      .then((ok) => {
        if (ok) {
          toast.success(`AI Analysis executed (-${AI_COST} tokens)`);
        } else {
          setAiOpen(false);
          toast.error(
            "Insufficient tokens. 5 tokens required to run AI Analysis.",
          );
        }
      })
      .finally(() => {
        aiSpendPendingRef.current = false;
      });
  };
  const { canInstall, install } = usePwaInstall();
  const isMobile = useIsMobile();
  const { activeStrategy, showLines, toggleLines, clearStrategy } = useStrategy();

  const indicatorList = useMemo(() => [...indicators], [indicators]);
  const effectiveLayout = isMobile ? "1x1" : layout;
  /* Stable identity — a new array every render made the effect below re-run
     on every keystroke/render and risked update loops. */
  const visiblePanes = useMemo(
    () =>
      effectiveLayout === "1x1"
        ? panes.slice(0, 1)
        : effectiveLayout === "2x1"
          ? panes.slice(0, 2)
          : panes,
    [effectiveLayout, panes],
  );
  /* Derived, not stored: if the layout shrinks below the selected pane, the
     first visible pane becomes active without a state-syncing effect (no
     cascading render, no update loop). */
  const activePaneId = visiblePanes.some((p) => p.id === activeId)
    ? activeId
    : (visiblePanes[0]?.id ?? activeId);
  const activePane =
    panes.find((p) => p.id === activePaneId) ?? panes[0] ?? DEFAULT_PANES[0];

  /* DEEEPR Trade Intelligence — feeds the panel and the bottom drawer. */
  const activeLive = useKlines(activePane.symbolId, activePane.intervalId);
  const activeTickers = useMarketSnapshot([activePane.symbolId]);
  const activeTicker = activeTickers[activePane.symbolId];
  const deeepr = useDeeepr(activePane.symbolId, activePane.intervalId, activeLive, {
    price: activeTicker?.price ?? null,
    change24h: activeTicker?.change24h ?? null,
  });

  const updateActivePane = (
    patch: Partial<Pick<PaneState, "symbolId" | "intervalId">>,
  ) => {
    setPanes((prev) =>
      prev.map((p) => (p.id === activePaneId ? { ...p, ...patch } : p)),
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
        isRegistered={isRegistered}
        onOpenRegistration={() => setRegModalOpen(true)}
      />

      {tab === "charts" && (
        <TopBar
          symbolId={activePane.symbolId}
          onSymbolSelect={(id) => updateActivePane({ symbolId: id })}
          intervalId={activePane.intervalId}
          onIntervalChange={(id) => updateActivePane({ intervalId: id })}
          chartType={chartType}
          chartMode={chartMode}
          onChartModeChange={handleChartModeChange}
          layout={layout}
          onLayoutChange={setLayout}
          rightOpen={rightOpen}
          onToggleRight={() => setRightOpen((o) => !o)}
          smcOpen={smcOpen}
          onToggleSmc={() => setSmcOpen((o) => !o)}
          indicatorDrawerOpen={indicatorDrawerOpen}
          onToggleIndicatorDrawer={() => setIndicatorDrawerOpen((o) => !o)}
          aiOpen={aiOpen}
          onToggleAi={handleToggleAi}
        />
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
        </div>        {/* CHARTS */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col gap-0 overflow-hidden",
            tab !== "charts" && "hidden",
          )}
        >
          {/* Active strategy status bar */}
          {activeStrategy && (
            <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-[#1e222d] px-4 py-1.5 text-xs font-mono text-gray-300">
              <div className="flex items-center space-x-2">
                <span className="inline-block size-2 animate-pulse rounded-full bg-yellow-500" />
                <span className="font-semibold text-yellow-400">
                  [Active: {activeStrategy.title}]
                </span>
                <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-bold text-red-400">
                  {activeStrategy.signalType}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={toggleLines}
                  className="text-gray-400 transition-colors hover:text-white"
                >
                  {showLines ? "\uD83D\uDC41\uFE0F Hide Lines" : "\uD83D\uDE48 Show Lines"}
                </button>
                <button
                  type="button"
                  onClick={clearStrategy}
                  className="px-1 text-xs font-bold text-gray-400 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 gap-2.5 p-2.5">
          <main
            className={cn(
              "min-h-0 min-w-0 flex-1 relative",
              GRID_CLASSES[effectiveLayout],
            )}
          >
            {visiblePanes.map((pane) => (
              <PaneCard
                key={pane.id}
                pane={pane}
                active={pane.id === activePaneId}
                mode={chartMode}
                indicatorList={indicatorList}
                onActivate={() => setActiveId(pane.id)}
              />
            ))}
            <StrategyOverlay />
          </main>
          </div>

          <AnimatePresence>
            {rightOpen && (
              <RightPanel
                activeSymbolId={activePane.symbolId}
                onSelectSymbol={handleSelectSymbol}
              />
            )}
          </AnimatePresence>

          <SmcAnalysisDrawer
            open={smcOpen}
            onOpenChange={setSmcOpen}
            symbolId={activePane.symbolId}
            intervalId={activePane.intervalId}
            isRegistered={isRegistered}
            onOpenRegistration={() => setRegModalOpen(true)}
          />
          <IndicatorDrawer
            open={indicatorDrawerOpen}
            onOpenChange={setIndicatorDrawerOpen}
            indicators={indicators}
            onToggle={toggleIndicator}
          />
          <TradeIntelligence
            open={aiOpen}
            onOpenChange={setAiOpen}
            symbolId={activePane.symbolId}
            intervalId={activePane.intervalId}
            live={activeLive}
            deeepr={deeepr}
            price={activeTicker?.price ?? null}
            change24h={activeTicker?.change24h ?? null}
            isRegistered={isRegistered}
            onOpenRegistration={() => setRegModalOpen(true)}
          />

          <RegistrationModal
            open={regModalOpen}
            onOpenChange={setRegModalOpen}
            onRegister={register}
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
            onApplyToChart={() => setTab("charts")}
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
          <MorePanel
            isAdmin={isAdmin}
            isFounder={isFounder}
            tokens={tokens}
            onReturnToCharts={() => setTab("charts")}
          />
        </div>
      </div>

      {/* Mobile right-panel sheet */}
      {isMobile && (
        <Sheet open={rightOpen} onOpenChange={setRightOpen}>
          <SheetContent
            side="right"
            className="w-[320px] border-l border-white/10 bg-[#0a0e1a] p-0"
          >
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle className="text-sm font-bold tracking-wide text-slate-200">
                Watchlist & Access
              </SheetTitle>
            </SheetHeader>
            <Tabs defaultValue="watchlist" className="flex h-full min-h-0 flex-col gap-0">
              <TabsList className="mx-2.5 h-9 w-auto justify-start gap-1 rounded-xl bg-white/5 p-1">
                <TabsTrigger value="watchlist" className="h-7 gap-1 rounded-lg text-xs">
                  Watchlist
                </TabsTrigger>
                <TabsTrigger value="chat" className="h-7 gap-1 rounded-lg text-xs">
                  Chat
                </TabsTrigger>
                <TabsTrigger value="access" className="h-7 gap-1 rounded-lg text-xs">
                  Access
                </TabsTrigger>
              </TabsList>
              <TabsContent value="watchlist" className="min-h-0 flex-1 overflow-y-auto">
                <Watchlist activeSymbolId={activePane.symbolId} onSelectSymbol={handleSelectSymbol} />
              </TabsContent>
              <TabsContent value="chat" className="min-h-0 flex-1 overflow-hidden">
                <CommunityChat />
              </TabsContent>
              <TabsContent value="access" className="min-h-0 flex-1 overflow-y-auto">
                <MyAccess />
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>
      )}

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
