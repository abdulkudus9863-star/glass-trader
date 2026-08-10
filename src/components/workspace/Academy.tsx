import {
  CandlestickChart,
  Coins,
  Lock,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Course {
  icon: typeof CandlestickChart;
  title: string;
  body: string;
  lessons: number;
  level: string;
  status: "live" | "soon";
}

const COURSES: Course[] = [
  {
    icon: CandlestickChart,
    title: "Gold Trading Masterclass",
    body: "Support and resistance on XAUUSD, session timing, and the A+ setups that separate professional entries from guesses.",
    lessons: 12,
    level: "Advanced",
    status: "soon",
  },
  {
    icon: TrendingUp,
    title: "Price Action Fundamentals",
    body: "Candles, market structure and the story the chart tells before any indicator does.",
    lessons: 9,
    level: "Beginner",
    status: "soon",
  },
  {
    icon: ShieldCheck,
    title: "Risk & Money Management",
    body: "Position sizing, risk per trade, and the habits that keep a trading account alive through drawdown.",
    lessons: 6,
    level: "Core",
    status: "soon",
  },
  {
    icon: Coins,
    title: "Forex Foundations",
    body: "Pairs, pips, sessions and the mechanics of the foreign exchange market — the base every FX trader needs.",
    lessons: 8,
    level: "Beginner",
    status: "soon",
  },
];

export default function Academy() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          Academy
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Master the markets, step by step
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Structured lessons from Abdul Kudus — from market mechanics to
          advanced gold and price-action strategy. Courses open for enrolment
          shortly; the chart, calculator and journal are live today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COURSES.map((course) => {
          const Icon = course.icon;
          return (
            <div
              key={course.title}
              className="glass group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/15 to-yellow-600/10 text-amber-400 ring-1 ring-amber-400/20">
                  <Icon className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    course.status === "live"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-400",
                  )}
                >
                  {course.status === "live" ? "Open now" : "In development"}
                </Badge>
              </div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">
                {course.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
                {course.body}
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-white/5 px-2 py-1 font-semibold">
                  {course.lessons} lessons
                </span>
                <span className="rounded-md bg-white/5 px-2 py-1 font-semibold">
                  {course.level}
                </span>
                <span className="ml-auto flex items-center gap-1 text-slate-500">
                  <Lock className="size-3" />
                  Invite access
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
