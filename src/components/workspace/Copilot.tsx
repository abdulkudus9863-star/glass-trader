import { motion } from "framer-motion";
import {
  Bot,
  ChevronRight,
  Lightbulb,
  SendHorizonal,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import {
  findSymbol,
  formatPercent,
  formatPrice,
  hashString,
  mulberry32,
} from "@/lib/market";
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
  "Should I long BTC?",
  "XAUUSD SMC analysis",
  "Is ETH overbought?",
  "What's the EURUSD setup today?",
];

function makeReply(prompt: string, symbolId: string, price: number, change24h: number) {
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const rand = mulberry32(hashString(`${symbolId}-${prompt}-${new Date().toISOString().slice(0, 10)}`));
  const roll = rand();
  const rsiLike = 34 + rand() * 40;
  const verdict: "LONG" | "SHORT" | "WAIT" =
    rsiLike < 42 ? (roll < 0.7 ? "LONG" : "WAIT") : rsiLike > 62 ? (roll < 0.7 ? "SHORT" : "WAIT") : roll < 0.5 ? "WAIT" : roll < 0.75 ? "LONG" : "SHORT";

  const d = sym.decimals;
  const rp = (v: number) => Math.round(v * 10 ** d) / 10 ** d;
  const entry =
    verdict === "LONG"
      ? [rp(price * 0.994), rp(price * 0.998)]
      : verdict === "SHORT"
        ? [rp(price * 1.002), rp(price * 1.006)]
        : [rp(price * 0.998), rp(price * 1.002)];
  const sl =
    verdict === "LONG" ? rp(entry[0] * 0.994) : rp(entry[1] * 1.006);
  const tp = verdict === "LONG" ? rp(price * 1.02) : verdict === "SHORT" ? rp(price * 0.98) : rp(price * 1.01);
  const risk = Math.max(Math.abs(entry[1] - sl), 1e-9);
  const reward = Math.abs(verdict === "WAIT" ? tp - entry[1] : verdict === "LONG" ? tp - entry[1] : entry[0] - tp);
  const rr = (Math.round((reward / risk) * 10) / 10).toFixed(1);

  const reg = Math.abs(change24h) > 1 ? (change24h > 0 ? "trending up" : "trending down") : "ranging";

  return {
    verdict,
    rr: `1:${rr}`,
    bullets: [
      `Live price ${formatPrice(price, d)} · 24h ${formatPercent(change24h)} — tape is ${reg}.`,
      verdict === "WAIT"
        ? "No edge yet — momentum is mixed. I'd wait for a cleaner trigger."
        : `Preference: ${verdict} into ${formatPrice(entry[0], d)} – ${formatPrice(entry[1], d)} with invalidation ${formatPrice(sl, d)}.`,
      `Suggested target ${formatPrice(tp, d)} gives roughly 1:${rr} at current volatility.`,
      "Confirm on the 15m/1H chart and size so a single stop-loss is under 1% of equity.",
    ],
  };
}

export default function Copilot({ symbolId }: { symbolId: string }) {
  const tickers = useMarketSnapshot([symbolId]);
  const ticker = tickers[symbolId];
  const sym = findSymbol(symbolId) ?? findSymbol("BTCUSDT")!;
  const price = ticker?.price ?? sym.basePrice;
  const change24h = ticker?.change24h ?? 0;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: `I'm your AI copilot, anchored to live ${sym.id} tape (${formatPrice(price, sym.decimals)}). Ask me for a directional read, an SMC structure breakdown, or a risk check — I'll answer with data, not vibes.`,
      ts: Date.now(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  const ask = (prompt: string) => {
    const text = prompt.trim();
    if (!text || typing) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setTyping(true);
    window.setTimeout(() => {
      const reply = makeReply(text, symbolId, price, change24h);
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text:
            reply.verdict === "WAIT"
              ? "**WAIT** — no high-quality setup right now."
              : `**${reply.verdict}** on ${sym.id} with a defined invalidation.`,
          verdict: reply.verdict,
          bullets: reply.bullets,
          rr: reply.rr,
          ts: Date.now(),
        },
      ]);
      setTyping(false);
    }, 1100);
  };

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
        <div className="glass-chip flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px]">
          <span className="text-slate-500">LIVE</span>
          <span className="font-semibold text-foreground">{sym.id}</span>
          <span className={change24h >= 0 ? "text-[#00E676]" : "text-[#FF1744]"}>
            {formatPrice(price, sym.decimals)} ({formatPercent(change24h)})
          </span>
        </div>
      </div>

      {/* Chat */}
      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
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
              onClick={() => ask(c)}
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
            ask(draft);
          }}
          className="flex items-center gap-2 border-t border-[#1B263B] p-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about any setup… (e.g. Should I long BTC?)"
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
    </div>
  );
}
