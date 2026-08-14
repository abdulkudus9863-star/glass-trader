import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Check,
  CircleDollarSign,
  FlaskConical,
  Flag,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldX,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useStrategies } from "@/hooks/use-strategies";
import { findSymbol, formatPrice } from "@/lib/market";
import {
  COMPILE_COST,
  compileStrategy,
  fmtLevel,
  normalizeSpec,
  type StrategyBias,
  type StrategySpec,
  type StrategyStatus,
} from "@/lib/strategy";
import { cn } from "@/lib/utils";

const STRATEGY_ASSETS = ["XAUUSD", "BTCUSDT", "EURUSD", "ETHUSDT"];
const STRATEGY_TFS = ["1m", "5m", "15m", "1H", "4H", "1D"];
const EXAMPLE_PROMPTS = [
  "Buy XAUUSD on 15m when RSI < 30 and price hits 5m FVG demand zone",
  "Short BTCUSDT on 1H when RSI > 70 and EMA death cross forms",
  "Long EURUSD on 4H on breakout above resistance with volume confirmation",
  "Wait for ETHUSDT order block reaction on 15m before entering long",
];

const BIAS_STYLE: Record<StrategyBias, string> = {
  LONG: "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]",
  SHORT: "border-[#FF1744]/40 bg-[#FF1744]/10 text-[#FF1744]",
  WAIT: "border-[#F4C430]/40 bg-[#F4C430]/10 text-[#F4C430]",
};

const STATUS_STYLE: Record<StrategyStatus, string> = {
  ACTIVE: "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]",
  DRAFT: "border-slate-500/30 bg-white/5 text-slate-300",
  BACKTESTED: "border-[#00F0FF]/30 bg-cyan-400/10 text-[#00F0FF]",
};

function SpecCard({
  spec,
  priceLabel,
  onApply,
  onSave,
  saved,
  compact = false,
  onEdit,
}: {
  spec: StrategySpec;
  priceLabel?: string;
  onApply: () => void;
  onSave?: () => void;
  saved?: boolean;
  compact?: boolean;
  onEdit?: () => void;
}) {
  const d = findSymbol(spec.asset)?.decimals ?? 2;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-[#1B263B] bg-[#0D1424]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1B263B] px-4 py-3">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-xs font-bold tracking-widest",
            BIAS_STYLE[spec.bias],
          )}
        >
          {spec.bias === "LONG" ? (
            <ArrowUpRight className="size-3.5" />
          ) : spec.bias === "SHORT" ? (
            <ArrowDownRight className="size-3.5" />
          ) : (
            <Activity className="size-3.5" />
          )}
          {spec.bias}
        </div>
        <p className="font-display text-sm font-bold tracking-tight text-foreground">
          {spec.name}
        </p>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span className="rounded bg-white/5 px-1.5 py-px font-semibold text-slate-300">
            {spec.asset}
          </span>
          <span className="rounded bg-white/5 px-1.5 py-px font-semibold text-slate-300">
            {spec.timeframe}
          </span>
          {priceLabel && <span className="text-[#F4C430]">{priceLabel}</span>}
        </span>
      </div>

      {/* Conditions */}
      <div className="px-4 pt-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Trigger conditions
        </p>
        <div className="flex flex-wrap gap-1.5">
          {spec.conditions.map((c) => (
            <span
              key={c}
              className="rounded-full border border-[#00F0FF]/25 bg-[#00F0FF]/[0.06] px-2 py-0.5 text-[10px] font-medium text-cyan-200"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Levels */}
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        {[
          {
            icon: Sparkles,
            label: "Entry Zone",
            value: `${fmtLevel(spec.asset, spec.entryZone[0])} – ${fmtLevel(spec.asset, spec.entryZone[1])}`,
            tone: "text-[#F4C430]",
          },
          {
            icon: ShieldX,
            label: "Stop Loss",
            value: fmtLevel(spec.asset, spec.stopLoss),
            tone: "text-[#FF1744]",
          },
          {
            icon: Flag,
            label: "TP1 / TP2",
            value: `${fmtLevel(spec.asset, spec.takeProfits[0])} / ${fmtLevel(spec.asset, spec.takeProfits[1])}`,
            tone: "text-[#00E676]",
          },
          {
            icon: CircleDollarSign,
            label: "Risk / Reward",
            value: `1 : ${spec.riskReward}`,
            tone: "text-foreground",
          },
        ].map((cell) => {
          const Icon = cell.icon;
          return (
            <div key={cell.label} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                <Icon className="size-3" />
                {cell.label}
              </span>
              <p className={cn("mt-1 font-mono text-xs font-semibold", cell.tone)}>
                {cell.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#1B263B] bg-white/[0.02] px-4 py-3">
        <button
          type="button"
          onClick={onApply}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-[#F4C430] px-3.5 font-display text-xs font-bold text-[#0a0e1a] transition-all hover:bg-[#F4C430]/85 hover:shadow-md hover:shadow-[#F4C430]/20"
        >
          <Plus className="size-4" />
          Add to Chart as Indicator
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg border px-3.5 font-display text-xs font-bold transition-colors",
              saved
                ? "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]"
                : "border-[#1B263B] bg-white/[0.03] text-slate-300 hover:border-[#00E676]/40 hover:text-[#00E676]",
            )}
          >
            {saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saved ? "Saved" : "Save to My Strategies"}
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#1B263B] bg-white/[0.03] px-3.5 font-display text-xs font-bold text-slate-300 transition-colors hover:border-[#00F0FF]/40 hover:text-[#00F0FF]"
          >
            <Pencil className="size-3.5" />
            Edit in Compiler
          </button>
        )}
        {!compact && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {spec.conditions.length} triggers · {spec.tokenCost} tokens
          </span>
        )}
      </div>
    </motion.div>
  );
}

interface StrategyCompilerProps {
  tokens: number;
  onSpend: (amount: number) => Promise<boolean>;
  activeAsset: string;
  activeTimeframe: string;
  onApplyToChart: (spec: StrategySpec) => void;
}

export default function StrategyCompiler({
  tokens,
  onSpend,
  activeAsset,
  activeTimeframe,
  onApplyToChart,
}: StrategyCompilerProps) {
  const [mode, setMode] = useState<"compiler" | "strategies">("compiler");
  const [prompt, setPrompt] = useState("");
  const [asset, setAsset] = useState(activeAsset);
  const [tf, setTf] = useState(activeTimeframe);
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const { saved, save, remove, setStatus } = useStrategies();
  const compileAction = useAction(api.ai.compileStrategySpec);

  const tickers = useMarketSnapshot([asset]);
  const price = tickers[asset]?.price ?? findSymbol(asset)?.basePrice ?? 0;

  const canAfford = tokens >= COMPILE_COST;
  const priceLabel = price ? formatPrice(price, findSymbol(asset)?.decimals ?? 2) : "…";

  const compile = async () => {
    if (!prompt.trim()) {
      setError("Describe a strategy first — e.g. 'Buy XAUUSD on 15m when RSI < 30…'");
      return;
    }
    if (!canAfford) {
      setError(`Compiling costs ${COMPILE_COST} tokens — your trial wallet is empty.`);
      return;
    }
    const spent = await onSpend(COMPILE_COST);
    if (!spent) {
      setError(`Compiling costs ${COMPILE_COST} tokens — your trial wallet is empty.`);
      return;
    }
    setCompiling(true);
    setError(null);
    let compiled: StrategySpec;
    try {
      const res = await compileAction({
        prompt,
        asset,
        timeframe: tf,
        price: price || 1,
      });
      if (res?.ok) {
        compiled = normalizeSpec(res.parsed, prompt, asset, tf, price || 1);
        setEngine(res.model);
      } else {
        compiled = compileStrategy(prompt, asset, tf, price || 1);
        setEngine("local");
      }
    } catch {
      compiled = compileStrategy(prompt, asset, tf, price || 1);
      setEngine("local");
    }
    setCompiling(false);
    setSpec(compiled);
    setSavedIds((prev) => new Set(prev).add(compiled.id));
    save(compiled);
  };

  const handleSave = (s: StrategySpec) => {
    save(s);
    setSavedIds((prev) => new Set(prev).add(s.id));
  };

  const handleEdit = (s: StrategySpec) => {
    setMode("compiler");
    setPrompt(s.prompt);
    setAsset(s.asset);
    setTf(s.timeframe);
    setSpec(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cycleStatus = (s: StrategySpec) => {
    const next: Record<StrategyStatus, StrategyStatus> = {
      ACTIVE: "DRAFT",
      DRAFT: "BACKTESTED",
      BACKTESTED: "ACTIVE",
    };
    setStatus(s.id, next[s.status]);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#A855F7]/10 text-[#A855F7] ring-1 ring-[#A855F7]/25">
          <Wand2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A855F7]">
            Strategy Compiler
          </p>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Natural language → executable strategy
          </h1>
        </div>
        <div className="glass-chip flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px]">
          <CircleDollarSign className="size-3.5 text-[#F4C430]" />
          <span className="text-slate-500">Wallet</span>
          <span className={cn("font-bold", canAfford ? "text-[#F4C430]" : "text-[#FF1744]")}>
            {tokens}
          </span>
          <span className="text-slate-500">tokens</span>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-4 flex w-fit items-center gap-1 rounded-xl border border-[#1B263B] bg-[#0D1424] p-1">
        {(
          [
            { id: "compiler", label: "Compiler", icon: Wand2 },
            { id: "strategies", label: "My Strategies", icon: FlaskConical },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-display text-xs font-bold transition-all",
                active
                  ? "bg-[#A855F7] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
              {t.id === "strategies" && saved.length > 0 && (
                <span className="rounded-full bg-white/15 px-1.5 text-[9px] font-bold">
                  {saved.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {mode === "compiler" ? (
          <motion.div
            key="compiler"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-4"
          >
            {/* Input panel */}
            <div className="glass rounded-2xl p-4">
              <label className="mb-2 block text-xs font-semibold text-slate-300">
                Describe your strategy below — AI will compile it into an
                executable spec
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your strategy below — AI will compile it into an executable spec (e.g. 'Buy XAUUSD on 15m when RSI < 30 and price hits 5m FVG demand zone')"
                className="min-h-[96px] w-full resize-none rounded-xl border border-[#1B263B] bg-[#050811]/70 p-3 font-mono text-[13px] leading-6 text-foreground placeholder:text-muted-foreground focus:border-[#A855F7]/50 focus:outline-none focus:ring-1 focus:ring-[#A855F7]/40"
                maxLength={400}
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Try:
                </span>
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="rounded-full border border-[#1B263B] px-2.5 py-1 text-[10px] text-slate-400 transition-colors hover:border-[#A855F7]/40 hover:text-[#A855F7]"
                  >
                    {p.length > 42 ? `${p.slice(0, 42)}…` : p}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Asset
                  </p>
                  <select
                    value={asset}
                    onChange={(e) => setAsset(e.target.value)}
                    className="h-9 rounded-lg border border-[#1B263B] bg-[#0D1424] px-2.5 font-mono text-xs font-semibold text-foreground focus:border-[#A855F7]/50 focus:outline-none"
                  >
                    {STRATEGY_ASSETS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Timeframe
                  </p>
                  <select
                    value={tf}
                    onChange={(e) => setTf(e.target.value)}
                    className="h-9 rounded-lg border border-[#1B263B] bg-[#0D1424] px-2.5 font-mono text-xs font-semibold text-foreground focus:border-[#A855F7]/50 focus:outline-none"
                  >
                    {STRATEGY_TFS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={() => void compile()}
                    disabled={!prompt.trim() || compiling}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-lg px-4 font-display text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40",
                      canAfford
                        ? "bg-[#A855F7] text-white shadow-md shadow-[#A855F7]/20 hover:bg-[#A855F7]/85"
                        : "bg-slate-700 text-slate-300",
                    )}
                  >
                    {compiling ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Bot className="size-4" />
                    )}
                    {compiling
                      ? "Compiling with AI…"
                      : `Compile Strategy · −${COMPILE_COST} tokens`}
                  </button>
                </div>
              </div>
              {error && (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-[#FF1744]">
                  <ShieldX className="size-3.5" />
                  {error}
                </p>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">
                Live anchor: {asset} at{" "}
                <span className="font-mono text-[#F4C430]">{priceLabel}</span>. The
                compiler prices entry / stop / targets off the live tape and
                parses your triggers into an executable overlay.
                {engine && (
                  <span className="ml-1.5 text-[#00E676]">
                    · last compile via {engine === "local" ? "built-in engine" : engine}
                  </span>
                )}
              </p>
            </div>

            {/* Compiled spec */}
            {spec && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-3.5 text-[#A855F7]" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Compiled spec — ready for the chart
                  </p>
                </div>
                <SpecCard
                  spec={spec}
                  priceLabel={priceLabel}
                  saved={savedIds.has(spec.id)}
                  onApply={() => onApplyToChart(spec)}
                  onSave={() => handleSave(spec)}
                />
              </div>
            )}

            {/* Saved strategies feed */}
            {saved.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Save className="size-3.5 text-[#00F0FF]" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Recently saved
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {saved.slice(0, 2).map((s) => (
                    <SpecCard
                      key={s.id}
                      spec={s}
                      compact
                      saved
                      onApply={() => onApplyToChart(s)}
                      onEdit={() => handleEdit(s)}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="strategies"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-3"
          >
            {saved.length === 0 ? (
              <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
                <FlaskConical className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-semibold text-foreground">
                  No saved strategies yet
                </p>
                <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                  Compile a strategy and it lands here with an ACTIVE / DRAFT /
                  BACKTESTED status, ready to apply straight onto the chart.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("compiler")}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[#A855F7] px-4 font-display text-xs font-bold text-white hover:bg-[#A855F7]/85"
                >
                  <Wand2 className="size-4" />
                  Open the compiler
                </button>
              </div>
            ) : (
              saved.map((s) => (
                <div key={s.id} className="relative">
                  <div className="absolute right-4 top-3 z-10 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => cycleStatus(s)}
                      title="Cycle status"
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-transform hover:scale-105",
                        STATUS_STYLE[s.status],
                      )}
                    >
                      <Send className="size-2.5" />
                      {s.status}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete strategy"
                      onClick={() => remove(s.id)}
                      className="flex size-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-[#FF1744]/10 hover:text-[#FF1744]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <SpecCard
                    spec={s}
                    compact
                    saved
                    onApply={() => onApplyToChart(s)}
                    onEdit={() => handleEdit(s)}
                  />
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldX className="size-3 text-[#F4C430]" />
        Compiled specs are deterministic previews of a live engine — validate any
        level on the chart before risking capital.
      </p>
    </div>
  );
}
