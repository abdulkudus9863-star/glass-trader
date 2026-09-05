import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  CandlestickChart,
  ChevronRight,
  FlaskConical,
  KeyRound,
  Radar,
  SendHorizonal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import TradingViewWidget from "@/components/chart/TradingViewWidget";
import AccessTerminalModal from "@/components/auth/AccessTerminalModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WATCHLIST_IDS, useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useKlines } from "@/hooks/use-klines";
import { formatPercent, formatPrice } from "@/lib/market";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function TickerTape() {
  const tickers = useMarketSnapshot(WATCHLIST_IDS);
  const items = WATCHLIST_IDS.map((id) => tickers[id]).filter(Boolean);
  const doubled = [...items, ...items];
  return (
    <div className="relative z-10 overflow-hidden border-b border-white/5 bg-white/[0.03] backdrop-blur-md">
      <div className="ticker-track flex w-max items-center gap-8 px-4 py-1.5">
        {doubled.map((t, i) => {
          const up = (t.change24h ?? 0) >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <div
              key={`${t.symbol.id}-${i}`}
              className="flex shrink-0 items-center gap-1.5 text-xs"
            >
              <span className="font-bold text-slate-300">{t.symbol.id}</span>
              <span className="font-medium tabular-nums text-slate-400">
                {t.price == null
                  ? "DATA UNAVAILABLE"
                  : formatPrice(t.price, t.symbol.decimals)}
              </span>
              <span
                className={cn(
                  "flex items-center gap-0.5 font-semibold tabular-nums",
                  t.change24h == null
                    ? "text-slate-500"
                    : up
                      ? "text-emerald-400"
                      : "text-rose-400",
                )}
              >
                <Icon className="size-3" />
                {t.change24h == null ? "—" : formatPercent(t.change24h)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string; tint: string }[] = [
  {
    icon: Radar,
    title: "Four-lane radar pipeline",
    body: "Technical, Flow, Narrative and Macro lanes are computed independently and merged into a single confluence verdict — no echo-chamber bias.",
    tint: "from-cyan-500/15 to-sky-500/10 text-[#00F0FF]",
  },
  {
    icon: CandlestickChart,
    title: "SMC charting canvas",
    body: "Whale walls, watch zones, liquidity S/R tags and an AI position-analysis drawer layered directly onto live TradingView candles.",
    tint: "from-emerald-500/15 to-teal-500/10 text-emerald-400",
  },
  {
    icon: FlaskConical,
    title: "Strategy compiler",
    body: "Describe a setup in plain English and the engine prices entry, stop and targets off the live tape — then inject it onto the chart as an indicator.",
    tint: "from-purple-500/15 to-fuchsia-500/10 text-[#A855F7]",
  },
  {
    icon: Bot,
    title: "AI copilot",
    body: "A chat assistant anchored to real-time pricing, not stale levels — structured verdicts with defined risk/reward on every answer.",
    tint: "from-amber-500/15 to-orange-500/10 text-[#F4C430]",
  },
  {
    icon: SendHorizonal,
    title: "Telegram signal dispatch",
    body: "Every executed alert is broadcast to the founder channel with delivery tracking — entry, stop, targets and confluence in one line.",
    tint: "from-sky-500/15 to-cyan-500/10 text-[#00F0FF]",
  },
  {
    icon: KeyRound,
    title: "Founder-gated tools",
    body: "Proprietary indicators and the admin panel are invitation-only, unlocked per trader and revocable at any time.",
    tint: "from-rose-500/15 to-pink-500/10 text-rose-400",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Sign in",
    body: "A one-time code by email — no passwords to remember, no account setup.",
  },
  {
    n: "02",
    title: "Run the engine",
    body: "The radar scores four independent lanes while the copilot answers from live tape.",
  },
  {
    n: "03",
    title: "Trade the charts",
    body: "Compile a strategy, inject it onto the canvas and follow every signal on Telegram.",
  },
];

function HeroChartCard() {
  const { candles, status } = useKlines("BTCUSDT", "15m");
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, rotateX: 6 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong relative overflow-hidden rounded-2xl p-3"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a] shadow-md shadow-[#F4C430]/30">
            <CandlestickChart className="size-3.5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-foreground">BTCUSDT · 15m</p>
            <p className="text-[10px] text-muted-foreground">
              {candles.length > 0
                ? formatPrice(candles[candles.length - 1].close, 2)
                : "…"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold",
            status === "LIVE"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400",
          )}
        >
          <span className="relative flex size-1.5">
            {status === "LIVE" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex size-1.5 rounded-full",
                status === "LIVE" ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
          </span>
          {status === "LIVE" ? "LIVE" : status}
        </span>
      </div>
      <div className="h-[300px] overflow-hidden rounded-xl bg-[#050811]/90 p-1 ring-1 ring-white/5">
        <TradingViewWidget
          symbol="BINANCE:BTCUSDT"
          timeframe="15"
        />
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
        <span>TradingView widget · live Binance feed</span>
        <span>
          {candles.length > 0 ? `${candles.length} bars` : "loading…"}
        </span>
      </div>
    </motion.div>
  );
}

function useIsAuthenticated() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    try {
      setAuthed(localStorage.getItem("auth_session_active") === "1");
    } catch {
      setAuthed(false);
    }
  }, []);
  return authed;
}

export default function Landing() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [modalOpen, setModalOpen] = useState(false);

  const tickers = useMarketSnapshot(WATCHLIST_IDS);
  const movers = WATCHLIST_IDS.map((id) => tickers[id])
    .filter((t): t is NonNullable<typeof t> => Boolean(t && t.price != null))
    .sort((a, b) => Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0))
    .slice(0, 6);

  const handleOpenTerminal = () => {
    if (isAuthenticated) {
      navigate("/charts");
    } else {
      setModalOpen(true);
    }
  };

  const handleSignIn = () => {
    if (isAuthenticated) {
      navigate("/charts");
    } else {
      setModalOpen(true);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-aurora" />
      <div className="grid-overlay pointer-events-none absolute inset-0 z-0" />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-[#1B263B]/60 bg-[#050811]/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a] shadow-md shadow-[#F4C430]/25">
              <CandlestickChart className="size-4" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-[#F4C430]">
                Ak Analyser
              </p>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                DEEEPR AI 2.0 Engine
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-400 md:flex">
            <a href="#markets" className="transition-colors hover:text-[#00F0FF]">
              Markets
            </a>
            <a href="#features" className="transition-colors hover:text-[#00F0FF]">
              Engine
            </a>
            <a href="#access" className="transition-colors hover:text-[#00F0FF]">
              Access
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg text-slate-300 hover:bg-white/5 hover:text-[#F4C430]"
              onClick={handleSignIn}
            >
              Sign in
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-lg bg-[#F4C430] text-[#0a0e1a] shadow-md shadow-[#F4C430]/30 hover:bg-[#F4C430]/85"
              onClick={handleOpenTerminal}
            >
              Open terminal
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </nav>
      </header>

      <TickerTape />

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:pb-24 lg:pt-20">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#F4C430]/25 bg-[#F4C430]/10 px-3 py-1.5 text-xs font-semibold text-[#F4C430]"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F4C430] opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#F4C430]" />
            </span>
            DEEEPR AI 2.0 Engine
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08 }}
            className="text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Every market. Four lanes.{" "}
            <span className="bg-gradient-to-r from-[#F4C430] via-yellow-300 to-[#00F0FF] bg-clip-text text-transparent">
              One clear read.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.16 }}
            className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:text-lg"
          >
            The radar scores Technical, Flow, Narrative and Macro bias into a
            single confluence call. Chart with SMC overlays, compile strategies
            from plain English, and get AI-grounded answers anchored to live
            tape — all inside one dark terminal.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button
              type="button"
              size="lg"
              className="h-11 rounded-xl bg-[#F4C430] px-6 text-sm font-bold text-[#0a0e1a] shadow-lg shadow-[#F4C430]/30 hover:bg-[#F4C430]/85"
              onClick={handleOpenTerminal}
            >
              Open the terminal
              <ArrowRight className="size-4" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 rounded-xl border-white/10 bg-white/[0.03] px-6 text-sm text-slate-300 shadow-sm backdrop-blur-md hover:bg-white/5 hover:text-[#00F0FF]"
            >
              <a href="#features">
                Explore the engine
                <ChevronRight className="size-4" />
              </a>
            </Button>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-10 grid max-w-md grid-cols-4 gap-4"
          >
            {[
              ["4", "lanes"],
              ["7", "timeframes"],
              ["12", "indicators"],
              ["1", "engine"],
            ].map(([v, l]) => (
              <div key={l} className="glass-chip rounded-xl px-3 py-2.5 text-center">
                <dt className="text-lg font-extrabold tracking-tight text-[#F4C430]">
                  {v}
                </dt>
                <dd className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {l}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-[#F4C430]/15 via-[#00F0FF]/10 to-emerald-500/15 blur-2xl" />
          <HeroChartCard />
          <div className="animate-float-slow pointer-events-none absolute -left-4 -top-5 hidden rounded-xl glass-chip px-3 py-2 text-xs font-semibold text-slate-300 sm:block">
            <span className="text-[#00E676]">●</span> Live Binance tape
          </div>
          <div className="animate-float-slower pointer-events-none absolute -bottom-4 -right-2 hidden rounded-xl glass-chip px-3 py-2 text-xs font-semibold text-slate-300 sm:block">
            <span className="text-[#F4C430]">Deterministic</span> SMC engine
          </div>
        </div>
      </section>

      {/* Markets */}
      <section id="markets" className="relative z-10 mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="glass rounded-2xl p-5 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#00F0FF]">
                Live markets
              </p>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight text-foreground">
                Top movers right now
              </h2>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500" />
              streaming
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {movers.map((t) => {
              const up = (t.change24h ?? 0) >= 0;
              return (
                <button
                  key={t.symbol.id}
                  type="button"
                  onClick={handleOpenTerminal}
                  className="glass-chip group flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all hover:bg-white/5"
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {t.symbol.id}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.symbol.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {t.price == null
                        ? "DATA UNAVAILABLE"
                        : formatPrice(t.price, t.symbol.decimals)}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-bold tabular-nums",
                        t.change24h == null
                          ? "text-slate-500"
                          : up
                            ? "text-emerald-400"
                            : "text-rose-400",
                      )}
                    >
                      {t.change24h == null
                        ? "—"
                        : `${up ? "▲" : "▼"} ${formatPercent(t.change24h)}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto mb-10 max-w-2xl text-center"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-[#F4C430]">
            The engine
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            A pipeline built for conviction, not noise.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Independent analysis lanes, a strategy compiler and an AI copilot
            work the same tape so every call is data-backed and clearly
            invalidation-defined.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.06 }}
                className="glass group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#F4C430]/10"
              >
                <div
                  className={cn(
                    "mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/10",
                    f.tint,
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <h3 className="text-sm font-bold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
                  {f.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Access steps */}
      <section id="access" className="relative z-10 mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-10"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-[#F4C430]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-[#00F0FF]/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1.6fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#F4C430]">
                Getting access
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                From sign-in to a full signal in three steps
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Every signed-in trader gets the radar, the charts and the
                copilot. Proprietary indicators and the admin panel arrive by
                invitation and unlock instantly.
              </p>
              <Button
                type="button"
                className="mt-6 h-10 rounded-xl bg-[#F4C430] text-[#0a0e1a] shadow-md shadow-[#F4C430]/30 hover:bg-[#F4C430]/85"
                onClick={handleOpenTerminal}
              >
                Get started
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="glass rounded-2xl p-4">
                  <p className="text-2xl font-extrabold tracking-tight text-[#F4C430]/50">
                    {s.n}
                  </p>
                  <h3 className="mt-1.5 text-sm font-bold text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#1B263B]/60 bg-[#050811]/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a]">
              <CandlestickChart className="size-3.5" strokeWidth={2.4} />
            </div>
            <p className="text-sm font-bold text-[#F4C430]">Ak Analyser</p>
            <span className="text-xs text-muted-foreground">
              · DEEEPR AI 2.0 Engine — professional terminal
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built for serious traders · Charts aren&apos;t financial advice.
          </p>
        </div>
      </footer>

      <AccessTerminalModal
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
