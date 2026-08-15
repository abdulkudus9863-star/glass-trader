import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Bot,
  ChevronRight,
  Cpu,
  SendHorizonal,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKlines } from "@/hooks/use-klines";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import {
  findSymbol,
  formatPercent,
  formatPrice,
  type TimeframeId,
} from "@/lib/market";
import { analyzeSmc, type SmcSignal } from "@/lib/smc";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  verdict?: "LONG" | "SHORT" | "WAIT";
  bullets?: string[];
  rr?: string;
  ts: number;
}

const CHIPS = [
  "Should I long XAUUSD?",
  "What is BTC doing right now?",
  "ETH or SOL today?",
  "XAUUSD SMC analysis",
];

const COPILOT_TF: TimeframeId = "15m";

/** Build an honest local analysis from the deterministic SMC engine over the
 *  real candle tape. Never fabricates a price or a verdict. */
function buildLocalAnalysis(
  symbolId: string,
  candles: ReturnType<typeof useKlines>["candles"],
  price: number | null,
  change24h: number | null,
  timeframe: TimeframeId,
): ChatMessage {
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const lastClose = candles[candles.length - 1]?.close;

  if (price == null || lastClose == null || candles.length < 30) {
    return {
      id: `a-${Date.now()}`,
      role: "assistant",
      text: "**DATA UNAVAILABLE** — I can't derive a read without a live candle tape for this asset.",
      bullets: [
        "No real candles are streaming for this symbol right now.",
        "Once the feed is live, ask me again and I'll ground the answer in actual price action.",
      ],
      ts: Date.now(),
    };
  }

  const smc = analyzeSmc({
    symbolId,
    intervalId: timeframe,
    candles,
    price: lastClose,
    change24h: change24h ?? 0,
    decimals: sym.decimals,
    assetName: sym.name,
  });

  if (!smc) {
    return {
      id: `a-${Date.now()}`,
      role: "assistant",
      text: "**DATA UNAVAILABLE** — not enough candle history for a structure read yet.",
      bullets: ["Indicators need roughly 30+ bars on the selected timeframe."],
      ts: Date.now(),
    };
  }

  const s: SmcSignal = smc.signal;
  const d = sym.decimals;
  const f = (v: number) => formatPrice(v, d);
  const verdict = smc.verdict;
  return {
    id: `a-${Date.now()}`,
    role: "assistant",
    text:
      verdict === "WAIT"
        ? `**WAIT** on ${symbolId} — ${smc.regime.toLowerCase()}, RSI ${smc.rsi.toFixed(1)}.`
        : `**${verdict}** on ${symbolId} with a defined invalidation.`,
    verdict,
    rr: `1:${s.rrr.toFixed(1)}`,
    bullets: [
      `Live ${formatPrice(price, d)} · 24h ${change24h != null ? formatPercent(change24h) : "—"} · RSI ${smc.rsi.toFixed(1)} (${smc.rsiLabel.toLowerCase()}).`,
      `Regime: ${smc.regime}. ${smc.structure.structureChange}`,
      verdict === "WAIT"
        ? `No edge yet — ${smc.structure.sweepZone.toLowerCase()} Watch the ${smc.watchZone ? `${f(smc.watchZone.bottom)} – ${f(smc.watchZone.top)}` : "swing"} zone for a trigger.`
        : `Preference: ${verdict} into ${f(s.entryZone[0])} – ${f(s.entryZone[1])} with invalidation ${f(s.invalidation)}.`,
      `Stop ${f(s.stopLoss)} · TP1 ${f(s.tp1)} · TP2 ${f(s.tp2)} — roughly 1:${s.rrr.toFixed(1)} at current ATR.`,
      "Confirm on the 15m/1H chart and size so a single stop-loss is under 1% of equity.",
    ],
    ts: Date.now(),
  };
}

export default function Copilot({ symbolId }: { symbolId: string }) {
  const tickers = useMarketSnapshot([symbolId]);
  const ticker = tickers[symbolId];
  const { candles } = useKlines(symbolId, COPILOT_TF);
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const price = ticker?.price ?? candles[candles.length - 1]?.close ?? null;
  const change24h = ticker?.change24h ?? null;

  const history = useQuery(api.copilot.listMessages);
  const saveMessage = useMutation(api.copilot.saveMessage);
  const copilotAction = useAction(api.ai.copilotReply);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* hydrate persisted history once */
  useEffect(() => {
    if (history === undefined || hydrated) return;
    setMessages(
      history.map((m) => ({
        id: m._id,
        role: m.role,
        text: m.text,
        verdict: m.verdict ?? undefined,
        bullets: m.bullets ?? undefined,
        rr: m.rr ?? undefined,
        ts: m.createdAt,
      })),
    );
    setHydrated(true);
  }, [history, hydrated]);

  const intro: ChatMessage = {
    id: "intro",
    role: "assistant",
    text:
      price == null
        ? `I'm your AI copilot, anchored to live ${sym.id} tape. Ask me for a directional read, an SMC structure breakdown, or a risk check — I'll answer with data, not vibes.`
        : `I'm your AI copilot, anchored to live ${sym.id} tape (${formatPrice(price, sym.decimals)}). Ask me for a directional read, an SMC structure breakdown, or a risk check — I'll answer with data, not vibes.`,
    ts: Date.now(),
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const ask = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || typing) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    void saveMessage({ role: "user", text });
    setDraft("");
    setTyping(true);

    let reply: ChatMessage;

    if (price == null) {
      /* No live tape — the AI gets nothing to anchor on, so answer honestly. */
      reply = buildLocalAnalysis(symbolId, candles, null, change24h, COPILOT_TF);
      setEngine("local");
      void saveMessage({
        role: "assistant",
        text: reply.text,
        verdict: reply.verdict,
        bullets: reply.bullets,
        rr: reply.rr,
        model: "local",
      });
    } else {
      /* Structured deterministic snapshot — the AI interprets it, never
         invents numbers. */
      const smc = analyzeSmc({
        symbolId,
        intervalId: COPILOT_TF,
        candles,
        price: price ?? candles[candles.length - 1]?.close ?? 0,
        change24h: change24h ?? 0,
        decimals: sym.decimals,
        assetName: sym.name,
      });
      const snapshot = smc
        ? {
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
        : null;

      try {
        const res = await copilotAction({
          symbolId,
          price,
          change24h: change24h ?? 0,
          prompt: text,
          snapshot: snapshot ?? undefined,
          history: messages
            .filter((m) => m.id !== "intro")
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.text })),
        });
        if (res?.ok) {
          const verdict: "LONG" | "SHORT" | "WAIT" =
            res.verdict === "LONG" || res.verdict === "SHORT" || res.verdict === "WAIT"
              ? res.verdict
              : "WAIT";
          reply = {
            id: `a-${Date.now()}`,
            role: "assistant",
            text:
              verdict === "WAIT"
                ? "**WAIT** — no high-quality setup right now."
                : `**${verdict}** on ${sym.id} with a defined invalidation.`,
            verdict,
            bullets: res.bullets,
            rr: res.rr,
            ts: Date.now(),
          };
          setEngine(res.model);
          void saveMessage({
            role: "assistant",
            text: reply.text,
            verdict: reply.verdict,
            bullets: reply.bullets,
            rr: reply.rr,
            model: res.model,
          });
        } else {
          reply = buildLocalAnalysis(symbolId, candles, price, change24h, COPILOT_TF);
          setEngine("local");
          void saveMessage({
            role: "assistant",
            text: reply.text,
            verdict: reply.verdict,
            bullets: reply.bullets,
            rr: reply.rr,
            model: "local",
          });
        }
      } catch {
        reply = buildLocalAnalysis(symbolId, candles, price, change24h, COPILOT_TF);
        setEngine("local");
        void saveMessage({
          role: "assistant",
          text: reply.text,
          verdict: reply.verdict,
          bullets: reply.bullets,
          rr: reply.rr,
          model: "local",
        });
      }
    }

    setMessages((m) => [...m, reply]);
    setTyping(false);
  };

  const displayMessages = messages.length === 0 ? [intro] : messages;
  const engineLabel = engine === null ? "connecting" : engine === "local" ? "LOCAL ENGINE" : engine.toUpperCase();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-4 sm:px-6">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#A855F7]/10 text-[#A855F7] ring-1 ring-[#A855F7]/25">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A855F7]">
            Copilot
          </p>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            AI trading assistant
          </h1>
        </div>
        <div
          className={cn(
            "glass-chip flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px]",
            engine === "local"
              ? "text-[#F4C430]"
              : engine === null
                ? "text-slate-500"
                : "text-[#00E676]",
          )}
        >
          <Cpu className="size-3.5" />
          <span className="text-slate-500">ENGINE</span>
          <span className="font-bold">{engineLabel}</span>
        </div>
        <div className="glass-chip flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px]">
          <span className="text-slate-500">TAPE</span>
          <span className="font-semibold text-foreground">{sym.id}</span>
          {price != null ? (
            <span className={cn(change24h != null && change24h >= 0 ? "text-[#00E676]" : "text-[#FF1744]")}>
              {formatPrice(price, sym.decimals)}
              {change24h != null && ` (${formatPercent(change24h)})`}
            </span>
          ) : (
            <span className="text-amber-400">DATA UNAVAILABLE</span>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {displayMessages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex items-start gap-2", m.role === "user" && "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                    m.role === "user"
                      ? "bg-[#F4C430]/15 text-[#F4C430]"
                      : "bg-[#A855F7]/15 text-[#A855F7]",
                  )}
                >
                  {m.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>
                <div
                  className={cn(
                    "max-w-[86%] rounded-2xl border px-3.5 py-2.5",
                    m.role === "user"
                      ? "rounded-tr-sm border-[#F4C430]/25 bg-[#F4C430]/[0.07]"
                      : "rounded-tl-sm border-[#1B263B] bg-white/[0.03]",
                  )}
                >
                  {m.role === "assistant" && (
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-px font-display text-[10px] font-bold tracking-widest",
                          m.verdict === "LONG" &&
                            "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]",
                          m.verdict === "SHORT" &&
                            "border-[#FF1744]/30 bg-[#FF1744]/10 text-[#FF1744]",
                          m.verdict === "WAIT" &&
                            "border-[#F4C430]/30 bg-[#F4C430]/10 text-[#F4C430]",
                          !m.verdict &&
                            "border-[#A855F7]/30 bg-[#A855F7]/10 text-[#A855F7]",
                        )}
                      >
                        {m.verdict ?? "ANALYSIS"}
                      </span>
                      {m.rr && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          R:R {m.rr}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-200">
                    {m.text}
                  </p>
                  {m.bullets && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {m.bullets.map((b, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-xs leading-5 text-slate-300"
                        >
                          <ChevronRight className="mt-0.5 size-3 shrink-0 text-[#00F0FF]" />
                          {b}
                        </li>
                      ))}
                    </ul>
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
                Analyzing the tape…
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
          className="flex items-center gap-2 border-t border-[#1B263B] p-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about any setup… (e.g. Should I long XAUUSD?)"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#1B263B] bg-white/[0.03] px-3.5 font-mono text-[13px] text-foreground placeholder:text-muted-foreground focus:border-[#A855F7]/50 focus:outline-none focus:ring-1 focus:ring-[#A855F7]/40"
            maxLength={240}
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

      <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldAlert className="size-3 text-[#F4C430]" />
        Copilot reads live tape but is a model, not a licensed advisor — every
        call deserves a chart check before you act on it.
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Sparkles className="size-3 text-[#A855F7]" />
        {engine === "local"
          ? "OpenAI key not set — running the built-in deterministic engine over the live tape. Add OPENAI_API_KEY in the project keys to go live."
          : "Conversation history is persisted to your account on the backend."}
      </p>
    </div>
  );
}
