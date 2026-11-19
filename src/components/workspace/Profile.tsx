import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarDays,
  Camera,
  FlaskConical,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { paperPnlInr } from "@/lib/paper-pnl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);

const inrSigned = (v: number) => `${v >= 0 ? "+" : "−"}${inr(Math.abs(v))}`;

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "pos" | "neg" | "muted";
}) {
  return (
    <div className="rounded-xl border border-[#1B263B] bg-[#0D1424] px-3.5 py-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-base font-bold tabular-nums",
          tone === "pos"
            ? "text-[#00E676]"
            : tone === "neg"
              ? "text-[#FF1744]"
              : tone === "muted"
                ? "text-slate-300"
                : "text-[#F4C430]",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[9px] leading-3.5 text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export default function Profile({ onOpenPaper }: { onOpenPaper?: () => void }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const account = useQuery(api.paper.account);
  const summary = useQuery(api.paper.summary);
  const trades = useQuery(api.paper.listTrades);
  const prefs = useQuery(api.users.getPreferences);

  const updateProfile = useMutation(api.users.updateProfile);
  const updatePreferences = useMutation(api.users.updatePreferences);

  const openTrades = useMemo(
    () => (trades ?? []).filter((t) => t.status === "OPEN"),
    [trades],
  );
  const closedTrades = useMemo(
    () => (trades ?? []).filter((t) => t.status === "CLOSED"),
    [trades],
  );
  const openSymbols = useMemo(
    () => [...new Set(openTrades.map((t) => t.symbol))],
    [openTrades],
  );
  const marks = useMarketSnapshot(openSymbols);

  const rate = account?.usdInrRate ?? 83.5;
  const balance = account?.balance ?? 0;

  let unrealized = 0;
  let unpriced = 0;
  for (const t of openTrades) {
    const mark = marks[t.symbol]?.price ?? null;
    if (mark == null) {
      unpriced += 1;
      continue;
    }
    unrealized += paperPnlInr(t.direction, t.entry, mark, t.size, rate);
  }
  const equity = balance + unrealized;
  const realized = summary?.stats.totalPnlInr ?? 0;
  const winRate = summary?.stats.winRate;

  /* ------------------------------ profile form ---------------------------- */
  const [nameInput, setNameInput] = useState(user?.name ?? "");
  const [imageInput, setImageInput] = useState(user?.image ?? "");
  const [syncedKey, setSyncedKey] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const profileKey = `${user?._id ?? ""}:${user?.name ?? ""}:${user?.image ?? ""}`;
  if (profileKey !== syncedKey) {
    setSyncedKey(profileKey);
    setNameInput(user?.name ?? "");
    setImageInput(user?.image ?? "");
  }

  const initials = (user?.name?.trim() || user?.email || "T")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const saveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await updateProfile({ name: nameInput, image: imageInput });
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  /* --------------------------- preferences -------------------------------- */
  const [savingPref, setSavingPref] = useState<string | null>(null);
  const setPref = async (
    key: "notifySignals" | "notifyDaily" | "notifyProduct",
    value: boolean,
  ) => {
    setSavingPref(key);
    try {
      await updatePreferences({ [key]: value });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save preference.");
    } finally {
      setSavingPref(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const created = user?._creationTime
    ? new Date(user._creationTime).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  if (account === undefined || summary === undefined || trades === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-[#F4C430] border-t-transparent" />
          <p className="text-xs text-slate-400">Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
      {/* ---------------------------- identity ---------------------------- */}
      <section className="rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar className="size-16 shrink-0 ring-2 ring-[#F4C430]/30 sm:size-20">
            {user?.image ? <AvatarImage src={user.image} alt={user.name ?? "Avatar"} /> : null}
            <AvatarFallback className="bg-gradient-to-br from-[#F4C430] to-yellow-600 text-lg font-bold text-[#0a0e1a]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
              Profile
            </p>
            <h1 className="truncate font-display text-xl font-bold tracking-tight text-foreground">
              {user?.name?.trim() || "Trader"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Mail className="size-3" />
                <span className="truncate">{user?.email ?? "—"}</span>
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                Joined {created}
              </span>
              <span className="flex items-center gap-1 text-[#00F0FF]">
                <BadgeCheck className="size-3" />
                {user?.isFounder
                  ? "Founder"
                  : user?.role === "admin"
                    ? "Administrator"
                    : "Verified member"}
              </span>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="mt-4 grid gap-3 border-t border-[#1B263B] pt-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Display name
            </span>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={60}
              className="h-10 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#F4C430]/50 focus:outline-none"
              placeholder="Your display name"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Camera className="size-3" /> Avatar image URL (https)
            </span>
            <input
              value={imageInput}
              onChange={(e) => setImageInput(e.target.value)}
              className="h-10 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-[#F4C430]/50 focus:outline-none"
              placeholder="https://… (leave empty for initials)"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Email (managed by sign-in)
            </span>
            <input
              value={user?.email ?? ""}
              readOnly
              disabled
              className="h-10 cursor-not-allowed rounded-xl border border-[#1B263B] bg-white/[0.02] px-3 text-sm text-slate-400"
            />
          </label>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              onClick={() => void saveProfile()}
              disabled={savingProfile}
              className="h-10 flex-1 rounded-xl bg-[#F4C430] text-xs font-bold text-[#0a0e1a] hover:bg-[#F4C430]/85"
            >
              {savingProfile ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save changes"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={savingProfile}
              onClick={() => {
                setNameInput(user?.name ?? "");
                setImageInput(user?.image ?? "");
              }}
              className="h-10 rounded-xl border-[#1B263B] bg-white/[0.03] text-xs font-semibold text-slate-300"
            >
              Reset
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------- paper overview ------------------------- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00E676]">
              Paper trading
            </p>
            <h2 className="font-display text-base font-bold text-foreground">
              Virtual account overview
            </h2>
          </div>
          <button
            type="button"
            onClick={() => (onOpenPaper ? onOpenPaper() : navigate("/dashboard"))}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#1B263B] bg-white/[0.03] px-3 text-[11px] font-semibold text-slate-300 hover:text-[#00F0FF]"
          >
            <FlaskConical className="size-3.5" />
            Open Paper Trading
            <ArrowRight className="size-3" />
          </button>
        </div>

        {account === null ? (
          <div className="rounded-2xl border border-dashed border-[#1B263B] p-6 text-center">
            <Wallet className="mx-auto mb-2 size-7 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">
              No simulated account yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Open Paper Trading to create one with ₹1,00,000 virtual balance.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard
                label="Starting balance"
                value={inr(account.startingBalance)}
                tone="muted"
                hint="virtual"
              />
              <StatCard label="Current balance" value={inr(balance)} />
              <StatCard
                label="Portfolio equity"
                value={inr(equity)}
                hint={unpriced > 0 ? `${unpriced} open mark(s) unavailable` : "balance + unrealized"}
              />
              <StatCard
                label="Unrealized P/L"
                value={inrSigned(unrealized)}
                tone={unrealized >= 0 ? "pos" : "neg"}
                hint={`${openTrades.length} open position(s)`}
              />
              <StatCard
                label="Realized P/L"
                value={inrSigned(realized)}
                tone={realized >= 0 ? "pos" : "neg"}
                hint={`${closedTrades.length} completed`}
              />
              <StatCard
                label="Win rate"
                value={
                  winRate == null
                    ? "—"
                    : `${(winRate * 100).toFixed(1)}%`
                }
                tone="muted"
                hint={
                  summary?.stats.calibrated
                    ? `${summary.stats.wins}W / ${summary.stats.losses}L`
                    : "uncalibrated sample"
                }
              />
              <StatCard
                label="Open risk"
                value={inr(summary?.openRiskInr ?? 0)}
                tone="muted"
                hint="at stop-loss"
              />
              <StatCard
                label="Today's P/L"
                value={inrSigned(summary?.dailyPnlInr ?? 0)}
                tone={(summary?.dailyPnlInr ?? 0) >= 0 ? "pos" : "neg"}
                hint="realized, UTC day"
              />
            </div>
            <p className="mt-2 rounded-lg border border-[#1B263B] bg-white/[0.02] px-3 py-2 text-[10px] leading-4 text-muted-foreground">
              All balances and trades are <strong>virtual simulations</strong> — no
              real money, no broker orders. This build uses risk-based sizing rather
              than leveraged margin, so “futures margin in use” and spot-holdings
              value are not separately tracked; open risk at stop-loss is shown
              instead. Implied FX conversion uses your account&apos;s USD/INR
              assumption ({rate}).
            </p>
          </>
        )}
      </section>

      {/* --------------------------- activity ---------------------------- */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="size-3.5 text-[#00E676]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Open positions
            </h3>
            <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold text-slate-400">
              {openTrades.length}
            </span>
          </div>
          {openTrades.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              No open simulated positions.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {openTrades.slice(0, 4).map((t) => {
                const mark = marks[t.symbol]?.price ?? null;
                const pnl =
                  mark == null
                    ? null
                    : paperPnlInr(t.direction, t.entry, mark, t.size, rate);
                return (
                  <div
                    key={t._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#1B263B]/70 bg-white/[0.02] px-2.5 py-2 text-[11px]"
                  >
                    <span className="font-mono font-semibold text-slate-200">
                      {t.symbol}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold",
                        t.direction === "long"
                          ? "bg-[#00E676]/10 text-[#00E676]"
                          : "bg-[#FF1744]/10 text-[#FF1744]",
                      )}
                    >
                      {t.direction.toUpperCase()}
                    </span>
                    <span className="font-mono text-slate-400">{t.size}</span>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        pnl == null
                          ? "text-slate-500"
                          : pnl >= 0
                            ? "text-[#00E676]"
                            : "text-[#FF1744]",
                      )}
                    >
                      {pnl == null ? "no mark" : inrSigned(pnl)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="size-3.5 text-[#F4C430]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Recent completed trades
            </h3>
            <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold text-slate-400">
              {closedTrades.length}
            </span>
          </div>
          {closedTrades.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              No completed simulated trades yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {closedTrades.slice(0, 4).map((t) => (
                <div
                  key={t._id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#1B263B]/70 bg-white/[0.02] px-2.5 py-2 text-[11px]"
                >
                  <span className="font-mono font-semibold text-slate-200">
                    {t.symbol}
                  </span>
                  <span className="truncate text-[10px] text-slate-500">
                    {t.closeReason ?? "manual"}
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      (t.realizedPnlInr ?? 0) >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                    )}
                  >
                    {inrSigned(t.realizedPnlInr ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => (onOpenPaper ? onOpenPaper() : navigate("/dashboard"))}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1B263B] py-1.5 text-[10px] font-semibold text-slate-400 hover:text-[#00F0FF]"
          >
            View full paper-trading history <ArrowRight className="size-3" />
          </button>
        </div>
      </section>

      {/* ------------------------- settings ------------------------------ */}
      <section className="rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="size-3.5 text-[#A855F7]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Notification preferences
          </h3>
        </div>
        {[
          {
            key: "notifySignals" as const,
            label: "New strategy signals",
            hint: "In-app alerts when a new setup is generated.",
          },
          {
            key: "notifyDaily" as const,
            label: "Daily performance summary",
            hint: "A recap of your simulated trading day.",
          },
          {
            key: "notifyProduct" as const,
            label: "Product updates",
            hint: "New features and engine releases.",
          },
        ].map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3 border-b border-[#1B263B]/60 py-2.5 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200">{row.label}</p>
              <p className="text-[10px] text-muted-foreground">{row.hint}</p>
            </div>
            <Switch
              checked={prefs ? prefs[row.key] : row.key === "notifySignals"}
              disabled={!prefs || savingPref === row.key}
              onCheckedChange={(v) => void setPref(row.key, v)}
              aria-label={row.label}
            />
          </div>
        ))}
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          Theme: Dark (the only shipped terminal theme). Preferences are stored on
          the backend for your account.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#1B263B] pt-3">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3 text-[#00E676]" />
            Session secured by Convex Auth
          </span>
          <Button
            type="button"
            onClick={() => void handleSignOut()}
            variant="outline"
            className="ml-auto h-9 rounded-xl border-[#FF1744]/30 bg-[#FF1744]/10 text-xs font-bold text-[#FF1744] hover:bg-[#FF1744]/20"
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </section>

      <p className="flex items-center gap-1.5 pb-2 text-[10px] text-muted-foreground">
        <UserRound className="size-3" />
        Only you can see this profile and your paper-trading records — every query is
        scoped to your authenticated account on the server.
      </p>
    </div>
  );
}
