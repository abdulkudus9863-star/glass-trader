import { motion } from "framer-motion";
import { Check, Radio, SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SignalStatus = "SENT" | "DELIVERED" | "CLICKED";

interface Signal {
  id: string;
  bias: "LONG" | "SHORT";
  asset: string;
  tf: string;
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
  confluence: string;
  tier: string;
  rr: string;
  status: SignalStatus;
  ts: number;
}

const SIGNAL_TEMPLATES: Omit<Signal, "id" | "status" | "ts">[] = [
  {
    bias: "LONG",
    asset: "XAUUSD",
    tf: "15m",
    entry: "$2,232.50 – $2,236.00",
    sl: "$2,224.00",
    tp1: "$2,260.00",
    tp2: "$2,300.00",
    confluence: "4/4 Lanes Aligned",
    tier: "HIGH",
    rr: "3.2",
  },
  {
    bias: "LONG",
    asset: "BTCUSDT",
    tf: "1H",
    entry: "$66,900 – $67,450",
    sl: "$66,200",
    tp1: "$69,000",
    tp2: "$71,200",
    confluence: "3/4 Lanes Aligned",
    tier: "MID",
    rr: "2.6",
  },
  {
    bias: "SHORT",
    asset: "EURUSD",
    tf: "4H",
    entry: "1.0842 – 1.0858",
    sl: "1.0881",
    tp1: "1.0796",
    tp2: "1.0752",
    confluence: "2/4 Lanes Aligned",
    tier: "LOW",
    rr: "2.1",
  },
  {
    bias: "LONG",
    asset: "ETHUSDT",
    tf: "15m",
    entry: "$3,480 – $3,512",
    sl: "$3,448",
    tp1: "$3,560",
    tp2: "$3,640",
    confluence: "3/4 Lanes Aligned",
    tier: "MID",
    rr: "2.9",
  },
];

const STATUS_STYLE: Record<SignalStatus, string> = {
  SENT: "text-slate-400 border-slate-500/30",
  DELIVERED: "text-[#00F0FF] border-[#00F0FF]/30",
  CLICKED: "text-[#00E676] border-[#00E676]/30",
};

const TIER_STYLE: Record<string, string> = {
  HIGH: "text-[#F4C430] border-[#F4C430]/30 bg-[#F4C430]/10",
  MID: "text-[#00F0FF] border-cyan-400/30 bg-cyan-400/10",
  LOW: "text-slate-400 border-white/10 bg-white/5",
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function TelegramSignals() {
  const [signals, setSignals] = useState<Signal[]>(() =>
    SIGNAL_TEMPLATES.slice(0, 3).map((t, i) => ({
      ...t,
      id: `seed-${i}`,
      status: i === 0 ? "DELIVERED" : "SENT",
      ts: Date.now() - (i + 1) * 100_000,
    })),
  );
  const [nextIdx, setNextIdx] = useState(3);
  const feedRef = useRef<HTMLDivElement>(null);

  /* dispatch a fresh signal every 14s to keep the feed "live" */
  useEffect(() => {
    const id = setInterval(() => {
      const t = SIGNAL_TEMPLATES[nextIdx % SIGNAL_TEMPLATES.length];
      setNextIdx((n) => n + 1);
      setSignals((prev) => [
        {
          ...t,
          id: `sig-${Date.now()}`,
          status: "SENT" as const,
          ts: Date.now(),
        },
        ...prev,
      ].slice(0, 14));
    }, 14_000);
    return () => clearInterval(id);
  }, [nextIdx]);

  /* statuses progress SENT → DELIVERED → CLICKED */
  useEffect(() => {
    const id = setInterval(() => {
      setSignals((prev) =>
        prev.map((s) =>
          s.status === "SENT"
            ? { ...s, status: "DELIVERED" as const }
            : s.status === "DELIVERED"
              ? { ...s, status: "CLICKED" as const }
              : s,
        ),
      );
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-1">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] ring-1 ring-[#00F0FF]/25">
          <SendHorizonal className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
            Telegram Bot Dispatcher
          </p>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Outgoing alert feed
          </h2>
        </div>
        <span className="glass-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-[#00E676]">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00E676] opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[#00E676]" />
          </span>
          BROADCASTING
        </span>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pb-5">
        {signals.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-[#1B263B] bg-[#0D1424] p-3.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-px font-display text-[10px] font-bold tracking-widest",
                  s.bias === "LONG"
                    ? "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]"
                    : "border-[#FF1744]/30 bg-[#FF1744]/10 text-[#FF1744]",
                )}
              >
                <Radio className="size-3" />
                {s.bias}
              </span>
              <span className="font-mono text-xs font-bold text-foreground">
                {s.asset}
              </span>
              <span className="rounded bg-white/5 px-1.5 py-px font-mono text-[10px] text-slate-400">
                {s.tf}
              </span>
              <span
                className={cn(
                  "ml-auto rounded-full border px-2 py-px text-[9px] font-bold",
                  STATUS_STYLE[s.status],
                )}
              >
                {s.status}
              </span>
            </div>

            {/* Dispatch line — the exact format sent to the channel */}
            <p className="mt-2.5 rounded-lg border border-[#1B263B] bg-[#050811]/70 px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">
              <span className={s.bias === "LONG" ? "text-[#00E676]" : "text-[#FF1744]"}>
                {s.bias === "LONG" ? "🟢" : "🔴"} {s.bias}
              </span>
              <span className="text-slate-500"> · </span>
              <span className="font-semibold text-foreground">{s.asset}</span>
              <span className="text-slate-500"> · </span>
              {s.tf}
              <span className="text-slate-500"> | Entry: </span>
              <span className="font-semibold text-[#F4C430]">{s.entry}</span>
              <span className="text-slate-500"> | SL: </span>
              <span className="font-semibold text-[#FF1744]">{s.sl}</span>
              <span className="text-slate-500"> | TP1: </span>
              <span className="font-semibold text-[#00E676]">{s.tp1}</span>
              <span className="text-slate-500"> | TP2: </span>
              <span className="font-semibold text-[#00E676]">{s.tp2}</span>
              <span className="text-slate-500"> | </span>
              <span className="font-semibold text-foreground">{s.confluence}</span>
              <span className="text-slate-500"> | </span>
              <span className="font-semibold text-[#F4C430]">{s.tier} Tier</span>
              <span className="text-slate-500"> | R:R </span>
              <span className="font-semibold text-foreground">1:{s.rr}</span>
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-px text-[9px] font-bold",
                  TIER_STYLE[s.tier],
                )}
              >
                {s.confluence} · {s.tier} TIER
              </span>
              <span className="ml-auto flex items-center gap-1 font-mono text-slate-500">
                <Check className="size-3 text-[#00E676]" />
                {fmt(s.ts)}
              </span>
            </div>
          </motion.div>
        ))}
        <p className="pt-1 text-center text-[10px] text-muted-foreground">
          Signals are dispatched to the founder Telegram channel in real time.
        </p>
      </div>
    </div>
  );
}
