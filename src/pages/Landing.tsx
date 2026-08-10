import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  CandlestickChart,
  ChevronRight,
  FunctionSquare,
  KeyRound,
  MessagesSquare,
  PencilRuler,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router";
import CustomChart from "@/components/chart/CustomChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WATCHLIST_IDS, useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useKlines } from "@/hooks/use-klines";
import { formatPercent, formatPrice } from "@/lib/market";
import { cn } from "@/lib/utils";

const NO_INDICATORS: string[] = [];

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
          const up = t.change24h >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <div
              key={`${t.symbol.id}-${i}`}
              className="flex shrink-0 items-center gap-1.5 text-xs"
            >
              <span className="font-bold text-slate-300">{t.symbol.id}</span>
              <span className="font-medium tabular-nums text-slate-400">
                {formatPrice(t.price, t.symbol.decimals)}
              </span>
              <span
                className={cn(
                  "flex items-center gap-0.5 font-semibold tabular-nums",
                  up ? "text-emerald-400" : "text-rose-400",
                )}
              >
                <Icon className="size-3" />
                {formatPercent(t.change24h)}
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
    icon: CandlestickChart,
    title: "Multi-asset live charts",
    body: "Real-time candles for crypto, forex, metals, indices and equities on one canvas — with instant symbol switching and split-view layouts.",
    tint: "from-blue-500/15 to-sky-500/10 text-blue-400",
  },
  {
    icon: FunctionSquare,
    title: "Indicator library",
    body: "SMA, EMA, VWAP, Bollinger Bands, RSI, MACD, ATR and Fair Value Gap detection — attach any study to the active chart in one click.",
    tint: "from-violet-500/15 to-fuchsia-500/10 text-violet-400",
  },
  {
    icon: PencilRuler,
    title: "Precision drawing tools",
    body: "Trendlines, Fibonacci retracements, rectangles and long/short entry markers, drawn directly on the price canvas.",
    tint: "from-sky-500/15 to-cyan-500/10 text-sky-400",
  },
  {
    icon: Star,
    title: "Real-time watchlists",
    body: "Live prices, 24-hour moves and sparklines for every market class — click any ticker to pull it onto the chart.",
    tint: "from-amber-500/15 to-orange-500/10 text-amber-400",
  },
  {
    icon: MessagesSquare,
    title: "Private trading room",
    body: "A real-time room docked beside your charts for sharing setups and discussing the markets with invited traders.",
    tint: "from-emerald-500/15 to-teal-500/10 text-emerald-400",
  },
  {
    icon: KeyRound,
    title: "Invitation-gated tools",
    body: "Proprietary indicators are granted per trader, time-boxed and revocable — unlocked tools appear instantly in My Access.",
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
    title: "Open the charts",
    body: "Pick any market, dial in a timeframe, attach studies and mark your levels.",
  },
  {
    n: "03",
    title: "Unlock pro tools",
    body: "Invitation-only indicators appear in My Access the moment they are granted.",
  },
];

function HeroChartCard() {
  const { candles } = useKlines("BTCUSDT", "15m");
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, rotateX: 6 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong relative overflow-hidden rounded-2xl p-3"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-md shadow-blue-600/30">
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
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          LIVE
        </span>
      </div>
      <div className="h-[300px] overflow-hidden rounded-xl bg-[#0d1017]/90 p-1 ring-1 ring-white/5">
        <CustomChart
          candles={candles}
          symbolId="BTCUSDT"
          decimals={2}
          intraday
          chartType="candles"
          indicatorIds={NO_INDICATORS}
          tool={null}
          onToolConsumed={() => {}}
          resetKey="BTCUSDT-15m"
        />
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
        <span>Custom canvas engine · offline-safe</span>
        <span>300 bars · auto-fits</span>
      </div>
    </motion.div>
  );
}

export default function Landing() {
  const tickers = useMarketSnapshot(WATCHLIST_IDS);
  const movers = WATCHLIST_IDS.map((id) => tickers[id])
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 6);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-aurora" />
      <div className="grid-overlay pointer-events-none absolute inset-0 z-0" />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0d1017]/75 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-md shadow-blue-600/30">
              <CandlestickChart className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-foreground">
                Vantage
              </p>
              <p className="text-[10px] text-muted-foreground">
                Professional trading terminal
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-400 md:flex">
            <a href="#markets" className="transition-colors hover:text-blue-400">
              Markets
            </a>
            <a href="#features" className="transition-colors hover:text-blue-400">
              Features
            </a>
            <a href="#access" className="transition-colors hover:text-blue-400">
              Access
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-lg text-slate-300 hover:bg-white/5 hover:text-blue-300"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-lg bg-blue-600 shadow-md shadow-blue-600/30 hover:bg-blue-500"
            >
              <Link to="/auth?returnTo=/dashboard">
                Open terminal
                <ArrowRight className="size-3.5" />
              </Link>
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
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
            </span>
            Professional trading terminal
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08 }}
            className="text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            The professional terminal for{" "}
            <span className="bg-gradient-to-r from-blue-500 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
              every market
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.16 }}
            className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:text-lg"
          >
            Real-time charts across crypto, forex, metals, indices and
            equities — with a complete indicator library, precision drawing
            tools and a live watchlist. Proprietary indicators are unlocked by
            invitation only.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button
              asChild
              size="lg"
              className="h-11 rounded-xl bg-blue-600 px-6 text-sm shadow-lg shadow-blue-600/30 hover:bg-blue-500"
            >
              <Link to="/auth?returnTo=/dashboard">
                Open the terminal
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 rounded-xl border-white/10 bg-white/[0.03] px-6 text-sm text-slate-300 shadow-sm backdrop-blur-md hover:bg-white/5 hover:text-blue-300"
            >
              <a href="#features">
                Explore features
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
              ["18", "markets"],
              ["7", "timeframes"],
              ["11", "indicators"],
              ["1", "terminal"],
            ].map(([v, l]) => (
              <div key={l} className="glass-chip rounded-xl px-3 py-2.5 text-center">
                <dt className="text-lg font-extrabold tracking-tight text-foreground">
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
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-blue-600/15 via-sky-500/10 to-emerald-500/15 blur-2xl" />
          <HeroChartCard />
          <div className="animate-float-slow pointer-events-none absolute -left-4 -top-5 hidden rounded-xl glass-chip px-3 py-2 text-xs font-semibold text-slate-300 sm:block">
            <span className="text-emerald-400">▲ +2.4%</span> 24h
          </div>
          <div className="animate-float-slower pointer-events-none absolute -bottom-4 -right-2 hidden rounded-xl glass-chip px-3 py-2 text-xs font-semibold text-slate-300 sm:block">
            ƒx <span className="text-blue-400">11 indicators</span> ready
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
              <p className="text-xs font-bold uppercase tracking-wider text-blue-400">
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
              const up = t.change24h >= 0;
              return (
                <Link
                  key={t.symbol.id}
                  to="/auth?returnTo=/dashboard"
                  className="glass-chip group flex items-center justify-between rounded-xl px-3.5 py-3 transition-all hover:bg-white/5"
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
                      {formatPrice(t.price, t.symbol.decimals)}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-bold tabular-nums",
                        up ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {up ? "▲" : "▼"} {formatPercent(t.change24h)}
                    </p>
                  </div>
                </Link>
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
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400">
            The terminal
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Everything a chart needs. Nothing it doesn&apos;t.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Vantage focuses on the fundamentals: a fast, always-on charting
            surface with the tools traders reach for daily.
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
                className="glass group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-600/10"
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
          <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1.6fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400">
                Getting access
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                From sign-in to proprietary tools in three steps
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The free library is open to every signed-in trader. Proprietary
                tools arrive by invitation and unlock instantly in your My
                Access panel.
              </p>
              <Button
                asChild
                className="mt-6 h-10 rounded-xl bg-blue-600 shadow-md shadow-blue-600/30 hover:bg-blue-500"
              >
                <Link to="/auth?returnTo=/dashboard">
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="glass rounded-2xl p-4">
                  <p className="text-2xl font-extrabold tracking-tight text-blue-500/50">
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
      <footer className="relative z-10 border-t border-white/5 bg-[#0d1017]/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-sky-400 text-white">
              <CandlestickChart className="size-3.5" />
            </div>
            <p className="text-sm font-bold text-foreground">Vantage</p>
            <span className="text-xs text-muted-foreground">
              · professional trading terminal
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built for serious traders · Charts aren&apos;t financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
