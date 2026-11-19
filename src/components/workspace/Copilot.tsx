import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Cpu,
  RotateCw,
  SendHorizonal,
  ShieldAlert,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKlines } from "@/hooks/use-klines";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import {
  findSymbol,
  formatPrice,
  getTimeframe,
  sanitizeCandles,
  type Candle,
  type TimeframeId,
} from "@/lib/market";
import { analyzeSmc } from "@/lib/smc";
import { buildCopilotAnalysis } from "@/lib/copilot-analysis";
import { resolveAnalysisSymbol } from "@/lib/symbol-context";
import {
  AI_PROVIDER_LABELS,
  engineLabel,
  isAiProvider,
  loadAiProvider,
  saveAiProvider,
  type AiProvider,
} from "@/lib/ai-provider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  verdict?: "LONG" | "SHORT" | "WAIT";
  bullets?: string[];
  rr?: string;
  /** Instrument this answer is grounded on — rendered prominently. */
  symbol?: string;
  provider?: string;
  /** Structured failure (shown as an error card, never as analysis). */
  error?: string;
  retryPrompt?: string;
  ts: number;
}

const COPILOT_TF: TimeframeId = "15m";

/** Timestamp helper kept outside the component so render analysis stays pure. */
const stampNow = () => Date.now();

const CHIPS = [
  "Should I long XAUUSD?",
  "What is BTC doing right now?",
  "What is the current market trend?",
  "Where are support and resistance?",
];

export default function Copilot({
  symbolId,
  intervalId = COPILOT_TF,
}: {
  symbolId: string;
  intervalId?: TimeframeId;
}) {
  const tickers = useMarketSnapshot([symbolId]);
  const ticker = tickers[symbolId];
  const live = useKlines(symbolId, intervalId);
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const price = ticker?.price ?? live.candles[live.candles.length - 1]?.close ?? null;
  const change24h = ticker?.change24h ?? null;

  const history = useQuery(api.copilot.listMessages);
  const saveMessage = useMutation(api.copilot.saveMessage);
  const copilotAction = useAction(api.ai.copilotReply);
  const aiStatus = useQuery(api.copilot.aiStatus);
  const binanceAction = useAction(api.market.binanceKlines);
  const tdAction = useAction(api.market.klines);

  const [provider, setProvider] = useState<AiProvider>(() => loadAiProvider());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [engine, setEngine] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [sessionStart] = useState(() => stampNow());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const chooseProvider = (next: AiProvider) => {
    setProvider(next);
    saveAiProvider(next);
    toast.success(`AI engine set to ${AI_PROVIDER_LABELS[next]}`);
  };

  /* Persisted history is derived, never copied into state via an effect:
     no cascading render, and switching engines cannot lose the thread. */
  const persistedMessages: ChatMessage[] = useMemo(
    () =>
      (history ?? []).map((m) => ({
        id: m._id,
        role: m.role,
        text: m.text,
        verdict: m.verdict ?? undefined,
        bullets: m.bullets ?? undefined,
        rr: m.rr ?? undefined,
        symbol: m.symbol ?? undefined,
        provider: m.provider ?? undefined,
        ts: m.createdAt,
      })),
    [history],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const intro: ChatMessage = useMemo(
    () => ({
      id: "intro",
      role: "assistant",
      symbol: symbolId,
      text:
        price == null
          ? `I'm your copilot. Ask about any supported pair — for example “Should I long XAUUSD?” — and I'll answer on that instrument only. ${symbolId} data is unavailable right now.`
          : `I'm your copilot. Selected chart: ${symbolId} at ${formatPrice(price, sym.decimals)}. Ask about this pair, or name another (e.g. “Should I long XAUUSD?”) and I'll analyse that one instead.`,
      ts: sessionStart,
    }),
    [symbolId, price, sym.decimals, sessionStart],
  );

  /** Fetch candles for an arbitrary symbol using the validated pipeline. */
  const fetchCandlesFor = async (
    target: string,
  ): Promise<{ candles: Candle[]; error: string | null }> => {
    const targetSym = findSymbol(target);
    if (!targetSym) {
      return { candles: [], error: `${target} is not in the supported instrument catalog.` };
    }
    try {
      if (targetSym.binance) {
        const res = await binanceAction({
          symbolId: target,
          timeframeId: intervalId,
          limit: 300,
        });
        if (res?.ok && res.candles.length > 0) {
          return { candles: sanitizeCandles(res.candles), error: null };
        }
        return {
          candles: [],
          error:
            res?.error?.message ??
            `Binance returned no candles for ${target} on ${intervalId}.`,
        };
      }
      const res = await tdAction({
        symbolId: target,
        timeframeId: intervalId,
        limit: 300,
      });
      if (res && res.candles.length > 0) {
        return { candles: sanitizeCandles(res.candles), error: null };
      }
      return {
        candles: [],
        error:
          res?.error?.message ??
          `The market-data proxy returned no candles for ${target} on ${intervalId}.`,
      };
    } catch (err) {
      return {
        candles: [],
        error: `Market-data request failed: ${err instanceof Error ? err.message : "network error"}.`,
      };
    }
  };

  const ask = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || typing || inFlight.current) return;
    inFlight.current = true;

    const userMsg: ChatMessage = {
      id: `u-${stampNow()}`,
      role: "user",
      text,
      ts: stampNow(),
    };
    setMessages((prev) =>
      prev.length === 0 ? [...persistedMessages, userMsg] : [...prev, userMsg],
    );
    void saveMessage({ role: "user", text });
    setDraft("");
    setTyping(true);

    const pushReply = (reply: ChatMessage) => {
      setMessages((m) => [...m, reply]);
      if (!reply.error) {
        void saveMessage({
          role: "assistant",
          text: reply.text,
          verdict: reply.verdict,
          bullets: reply.bullets,
          rr: reply.rr,
          model: reply.provider,
          symbol: reply.symbol,
          provider: reply.provider,
        });
      }
    };

    try {
      /* ---------------- 1. resolve the instrument ---------------- */
      const detection = resolveAnalysisSymbol(text, symbolId);

      if (detection.unsupported) {
        const reply: ChatMessage = {
          id: `a-${stampNow()}`,
          role: "assistant",
          symbol: detection.mentioned ?? undefined,
          text: `**UNSUPPORTED SYMBOL** — ${detection.mentioned} is not in this terminal's catalog, so I won't analyse it.`,
          bullets: [
            `You asked about ${detection.mentioned}.`,
            "Supported instruments include BTCUSDT, ETHUSDT, XAUUSD, XAGUSD, EURUSD and the rest of the Radar list.",
            "Ask again with a supported pair and I'll ground the answer in its live tape.",
          ],
          ts: stampNow(),
        };
        pushReply(reply);
        return;
      }

      const target = detection.symbolId ?? symbolId; // Test C fallback
      const targetSym = findSymbol(target);
      if (!targetSym) {
        pushReply({
          id: `a-${stampNow()}`,
          role: "assistant",
          text: `**DATA UNAVAILABLE** — ${target} is not in the catalog.`,
          ts: stampNow(),
        });
        return;
      }

      /* ---------------- 2. gather THIS symbol's tape ---------------- */
      const isSelected = target === symbolId;
      let candles: Candle[];
      let fetchError: string | null = null;
      if (isSelected) {
        candles = live.candles;
        fetchError = live.error;
      } else {
        const fetched = await fetchCandlesFor(target);
        candles = fetched.candles;
        fetchError = fetched.error;
      }
      const lastCandle = candles[candles.length - 1];
      const targetPrice = isSelected
        ? (price ?? lastCandle?.close ?? null)
        : (lastCandle?.close ?? null);
      const targetChange = isSelected ? change24h : null;
      const updatedAt = lastCandle?.time ?? null;
      const ageSeconds =
        updatedAt != null ? Math.max(0, Math.round((stampNow() - updatedAt) / 1000)) : null;
      const staleAfter = (getTimeframe(intervalId).ms / 1000) * 3;
      const freshness =
        candles.length === 0
          ? "UNAVAILABLE"
          : ageSeconds != null && ageSeconds > staleAfter
            ? "STALE"
            : "LIVE";

      /* ---------------- 3. deterministic analysis ---------------- */
      const local = buildCopilotAnalysis({
        symbolId: target,
        assetName: targetSym.name,
        timeframe: intervalId,
        decimals: targetSym.decimals,
        candles,
        price: targetPrice,
        change24h: targetChange,
        updatedAt,
        data: { freshness, ageSeconds },
        unavailableReason: fetchError,
      });

      /* ------------- 4. engine selection (no silent switch) ------------- */
      if (provider === "local") {
        setEngine("local");
        pushReply({
          id: `a-${stampNow()}`,
          role: "assistant",
          text: local.text,
          verdict: local.verdict,
          bullets: local.bullets,
          rr: local.rr ?? undefined,
          symbol: target,
          provider: "local",
          ts: stampNow(),
        });
        return;
      }

      if (!local.ok) {
        /* No tape: do not call a model, answer honestly with the reason. */
        setEngine(provider);
        pushReply({
          id: `a-${stampNow()}`,
          role: "assistant",
          text: local.text,
          verdict: "WAIT",
          bullets: local.bullets,
          symbol: target,
          provider,
          ts: stampNow(),
        });
        return;
      }

      const smc = analyzeSmc({
        symbolId: target,
        intervalId: intervalId,
        candles,
        price: targetPrice ?? lastCandle.close,
        change24h: targetChange ?? 0,
        decimals: targetSym.decimals,
        assetName: targetSym.name,
      });
      const snapshot = smc
        ? {
            symbol: target,
            rsi: smc.rsi,
            regime: smc.regime,
            verdict: smc.verdict,
            entry: smc.signal.entryZone,
            stopLoss: smc.signal.stopLoss,
            tp1: smc.signal.tp1,
            tp2: smc.signal.tp2,
            invalidation: smc.signal.invalidation,
            rrr: smc.signal.rrr,
          }
        : undefined;

      const res = await copilotAction({
        provider,
        symbolId: target,
        timeframe: intervalId,
        dataTime: updatedAt ?? undefined,
        price: targetPrice ?? lastCandle.close,
        change24h: targetChange ?? 0,
        prompt: text,
        snapshot,
        history: messages
          .filter((m) => m.id !== "intro" && !m.error)
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.text })),
      });

      if (res?.ok) {
        setEngine(res.model);
        pushReply({
          id: `a-${stampNow()}`,
          role: "assistant",
          text: res.summary,
          verdict: res.verdict as "LONG" | "SHORT" | "WAIT",
          bullets: res.bullets,
          rr: res.rr,
          symbol: target,
          provider: res.provider,
          ts: stampNow(),
        });
        return;
      }

      /* Explicit failure — never fall back silently. */
      pushReply({
        id: `a-${stampNow()}`,
        role: "assistant",
        symbol: target,
        provider,
        error: res?.error ?? "The AI provider did not respond.",
        retryPrompt: text,
        text: `**${AI_PROVIDER_LABELS[provider]} error** — ${res?.error ?? "no response"}`,
        bullets: [
          "No analysis was substituted and no fallback engine ran.",
          provider === "openai"
            ? "Add OPENAI_API_KEY in the project keys, or switch the engine to Local/Gemini."
            : provider === "gemini"
              ? "Add GEMINI_API_KEY in the project keys, or switch the engine to Local/OpenAI."
              : "Switch provider in AI settings.",
        ],
        ts: stampNow(),
      });
    } finally {
      inFlight.current = false;
      setTyping(false);
    }
  };

  const displayMessages =
    messages.length === 0
      ? persistedMessages.length > 0
        ? persistedMessages
        : [intro]
      : messages;
  const keyMissing =
    provider !== "local" &&
    aiStatus !== undefined &&
    (provider === "openai" ? aiStatus.openai : aiStatus.gemini) === false;
  const activeLabel =
    engine === null
      ? AI_PROVIDER_LABELS[provider]
      : provider === "local"
        ? "LOCAL ENGINE"
        : engineLabel(provider, engine);

  return (
    <div className="mx-auto flex h-full min-w-0 max-w-3xl flex-col overflow-hidden px-3 py-3 sm:px-6 sm:py-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#A855F7]/10 text-[#A855F7] ring-1 ring-[#A855F7]/25 sm:size-10">
          <Bot className="size-4 sm:size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A855F7]">
            Copilot
          </p>
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
            AI trading assistant
          </h1>
        </div>
        <div className="glass-chip flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[10px]">
          <Cpu className="size-3.5 text-[#A855F7]" />
          <select
            value={provider}
            onChange={(e) => {
              if (isAiProvider(e.target.value)) chooseProvider(e.target.value);
            }}
            className="max-w-[130px] bg-transparent font-mono text-[10px] font-bold text-foreground focus:outline-none"
            aria-label="AI engine"
          >
            <option value="local">Local Engine</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <div className="glass-chip flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[10px]">
          <span className="text-slate-500">TAPE</span>
          <span className="font-semibold text-foreground">{sym.id}</span>
          {price != null ? (
            <span
              className={cn(
                "truncate",
                change24h != null && change24h >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
              )}
            >
              {formatPrice(price, sym.decimals)}
            </span>
          ) : (
            <span className="text-amber-400">UNAVAILABLE</span>
          )}
        </div>
      </div>

      {/* Provider / data warnings */}
      {keyMissing && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {AI_PROVIDER_LABELS[provider]} key is not configured on the server.
            Requests will fail with an explicit error — switch to Local Engine in
            AI settings if you want an offline analysis.
          </span>
        </div>
      )}
      {live.error && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-[#FF1744]/30 bg-[#FF1744]/10 px-3 py-2 text-[11px] leading-5 text-[#FF8A9B]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Market data: {live.error}</span>
        </div>
      )}

      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:p-4">
          <div className="flex flex-col gap-3">
            {displayMessages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex min-w-0 items-start gap-2",
                  m.role === "user" && "flex-row-reverse",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                    m.role === "user"
                      ? "bg-[#F4C430]/15 text-[#F4C430]"
                      : "bg-[#A855F7]/15 text-[#A855F7]",
                  )}
                >
                  {m.role === "user" ? (
                    <User className="size-3.5" />
                  ) : (
                    <Bot className="size-3.5" />
                  )}
                </div>
                <div
                  className={cn(
                    "min-w-0 max-w-[88%] rounded-2xl border px-3 py-2.5 sm:max-w-[82%] sm:px-3.5",
                    m.role === "user"
                      ? "rounded-tr-sm border-[#F4C430]/25 bg-[#F4C430]/[0.07]"
                      : m.error
                        ? "rounded-tl-sm border-[#FF1744]/30 bg-[#FF1744]/[0.06]"
                        : "rounded-tl-sm border-[#1B263B] bg-white/[0.03]",
                  )}
                >
                  {m.role === "assistant" && (
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {m.symbol && (
                        <span className="rounded-full border border-[#00F0FF]/30 bg-[#00F0FF]/10 px-2 py-px font-mono text-[10px] font-bold text-[#00F0FF]">
                          {m.symbol}
                        </span>
                      )}
                      {m.verdict && (
                        <span
                          className={cn(
                            "rounded-full border px-2 py-px font-display text-[10px] font-bold tracking-widest",
                            m.verdict === "LONG" &&
                              "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]",
                            m.verdict === "SHORT" &&
                              "border-[#FF1744]/30 bg-[#FF1744]/10 text-[#FF1744]",
                            m.verdict === "WAIT" &&
                              "border-[#F4C430]/30 bg-[#F4C430]/10 text-[#F4C430]",
                          )}
                        >
                          {m.verdict}
                        </span>
                      )}
                      {m.rr && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          R:R {m.rr}
                        </span>
                      )}
                      {m.provider && (
                        <span className="ml-auto truncate font-mono text-[9px] uppercase text-muted-foreground">
                          {m.provider === "local" ? "local" : m.provider}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-200">
                    {m.text}
                  </p>
                  {m.bullets && m.bullets.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {m.bullets.map((b, i) => (
                        <li
                          key={i}
                          className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-slate-300"
                        >
                          <ChevronRight className="mt-0.5 size-3 shrink-0 text-[#00F0FF]" />
                          <span className="min-w-0 break-words">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.error && m.retryPrompt && (
                    <button
                      type="button"
                      onClick={() => void ask(m.retryPrompt ?? "")}
                      className="mt-2 flex h-7 items-center gap-1.5 rounded-lg border border-[#1B263B] bg-white/[0.04] px-2.5 text-[10px] font-semibold text-slate-200 hover:border-[#A855F7]/40"
                    >
                      <RotateCw className="size-3" />
                      Retry
                    </button>
                  )}
                  <p className="mt-1.5 text-right text-[9px] text-muted-foreground">
                    {new Date(m.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </motion.div>
            ))}
            {typing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex size-7 items-center justify-center rounded-lg bg-[#A855F7]/15">
                  <Bot className="size-3.5 text-[#A855F7]" />
                </span>
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-500" />
                </span>
                Reading the tape…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Chips */}
        <div className="flex gap-1.5 overflow-x-auto border-t border-[#1B263B] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void ask(c)}
              className="glass-chip shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:text-[#00F0FF]"
            >
              {c}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="sticky bottom-0 flex items-center gap-2 border-t border-[#1B263B] bg-[#0a0e1a]/90 p-2.5 backdrop-blur sm:p-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about any pair… (e.g. Should I long XAUUSD?)"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#1B263B] bg-white/[0.03] px-3 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-[#A855F7]/50 focus:outline-none focus:ring-1 focus:ring-[#A855F7]/40"
            maxLength={280}
            enterKeyHint="send"
          />
          <button
            type="submit"
            disabled={!draft.trim() || typing}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#A855F7] text-white transition-all hover:bg-[#A855F7]/85 disabled:opacity-40"
            aria-label="Send"
          >
            <SendHorizonal className="size-4" />
          </button>
        </form>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldAlert className="size-3 shrink-0 text-[#F4C430]" />
        Educational analysis only — no certainty about future prices, no financial
        advice. Active engine: {activeLabel}.
      </p>
    </div>
  );
}
