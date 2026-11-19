import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  History,
  Search,
  ShieldCheck,
  ShieldX,
  Users,
  Wallet,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const FOUNDER_EMAIL = "abdulkudus9863@gmail.com";

type FilterStatus = "all" | "admin" | "user" | "member";

interface AdminUserRow {
  _id: string;
  name: string | null;
  email: string | null;
  role: string;
  isFounder: boolean;
  balance: number;
  createdAt: number;
  lastActivity: number | null;
  transactionCount: number;
  status: string;
}

interface TokenTxRow {
  _id: string;
  userId?: string;
  userEmail?: string | null;
  previousBalance: number;
  delta: number;
  newBalance: number;
  kind: string;
  description: string;
  adminEmail?: string | null;
  createdAt: number;
}

const nf = new Intl.NumberFormat("en-US");

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPortal() {
  const { user } = useAuth();
  const isAdmin =
    user?.isFounder === true ||
    user?.role === "admin" ||
    user?.email?.trim().toLowerCase() === FOUNDER_EMAIL;

  /* ---------------------------------------------------------------------
     All hooks are declared unconditionally, before ANY return statement.
     This is what removes the old React #310 crash: previously `useMemo`
     ran only after the loading/denied early returns, so the hook count
     changed the moment the users query resolved.
     --------------------------------------------------------------------- */
  const overview = useQuery(api.admin.overview, isAdmin ? {} : "skip");
  const users = useQuery(api.admin.listAllUsers, isAdmin ? {} : "skip");
  const ledger = useQuery(
    api.admin.listTransactions,
    isAdmin ? { limit: 40 } : "skip",
  );

  const adjustBalance = useMutation(api.admin.adjustBalance);
  const toggleUserRole = useMutation(api.admin.toggleUserRole);
  const claimFounderRole = useMutation(api.admin.claimFounderRole);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const founderClaimed = useRef(false);

  // Persist the founder's admin role in the database once per session.
  useEffect(() => {
    if (!isAdmin || !user?.isFounder || founderClaimed.current) return;
    founderClaimed.current = true;
    claimFounderRole({}).catch(() => {
      founderClaimed.current = false;
    });
  }, [isAdmin, user?.isFounder, claimFounderRole]);

  const allUsers = useMemo(
    () => (users ?? []) as unknown as AdminUserRow[],
    [users],
  );

  const selected = useMemo(
    () => allUsers.find((u) => u._id === selectedId) ?? null,
    [allUsers, selectedId],
  );

  const filtered = useMemo(() => {
    let list = allUsers;
    if (filter !== "all") list = list.filter((u) => u.role === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allUsers, filter, search]);

  const selectedHistory = useQuery(
    api.admin.userDetail,
    selectedId ? { userId: selectedId as Id<"users"> } : "skip",
  );
  const historyRows = (selectedHistory?.transactions ?? []) as unknown as TokenTxRow[];
  const globalRows = (ledger ?? []) as unknown as TokenTxRow[];

  /* ------------------------------ handlers ------------------------------ */

  const handleRefill = async (delta: number) => {
    if (!selected || busy) return;
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Enter a whole number of tokens.");
      return;
    }
    setBusy(true);
    try {
      // A fresh key per submission: repeat clicks cannot double-credit.
      const key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `refill-${selected._id}-${Date.now()}-${Math.random()}`;
      const res = await adjustBalance({
        userId: selected._id as Id<"users">,
        amount: delta,
        reason: reason.trim() || undefined,
        idempotencyKey: key,
      });
      toast.success(
        `${delta > 0 ? "Credited" : "Deducted"} ${nf.format(
          Math.abs(delta),
        )} tokens ${delta > 0 ? "to" : "from"} ${
          selected.name ?? selected.email ?? "user"
        } · new balance ${nf.format(res.balance)}`,
      );
      setAmount("");
      setReason("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to adjust tokens",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRoleToggle = async (target: NonNullable<typeof selected>) => {
    if (busy) return;
    const newRole = target.role === "admin" ? "user" : "admin";
    setBusy(true);
    try {
      await toggleUserRole({ userId: target._id as Id<"users">, newRole });
      toast.success(
        `Updated ${target.name ?? target.email ?? "user"}'s role to ${newRole}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------- access / loading -------------------------- */

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-[#FF1744]/10 ring-1 ring-[#FF1744]/25">
          <ShieldX className="size-8 text-[#FF1744]" />
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          Access Denied
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          Administrator credentials are required to access this portal. Every
          action in this panel is also re-verified on the server.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("admin-denied"))}
          className="mt-6 flex h-10 items-center gap-2 rounded-xl bg-[#F4C430] px-5 font-display text-sm font-bold text-[#0a0e1a] transition-all hover:bg-[#F4C430]/85"
        >
          <ArrowLeft className="size-4" />
          Return to Charts
        </button>
      </div>
    );
  }

  if (!overview || !users) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-[#F4C430] border-t-transparent" />
          <p className="text-xs text-slate-400">Loading user data…</p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Total Users", value: nf.format(overview.totalUsers), icon: Users, color: "text-[#00F0FF]" },
    { label: "Active (30d)", value: nf.format(overview.activeUsers), icon: Activity, color: "text-[#00E676]" },
    { label: "Tokens Issued", value: nf.format(overview.tokensIssued), icon: ArrowUpRight, color: "text-[#A855F7]" },
    { label: "Tokens Consumed", value: nf.format(overview.tokensConsumed), icon: ArrowDownRight, color: "text-[#FF1744]" },
    { label: "Tokens Remaining", value: nf.format(overview.tokensRemaining), icon: Wallet, color: "text-[#F4C430]" },
    { label: "Transactions", value: nf.format(overview.transactionCount), icon: History, color: "text-slate-300" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#F4C430]/10 text-[#F4C430] ring-1 ring-[#F4C430]/25">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
            Admin Dashboard
          </p>
          <h1 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
            User & Token Management
          </h1>
        </div>
        <span className="rounded-full border border-[#00E676]/30 bg-[#00E676]/10 px-2.5 py-1 text-[10px] font-bold text-[#00E676]">
          SERVER-VERIFIED
        </span>
      </div>

      {/* Overview */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-xl px-3.5 py-3">
            <div className="flex items-center gap-1.5">
              <s.icon className={cn("size-3.5", s.color)} />
              <span className="truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
            </div>
            <p className={cn("mt-1 font-mono text-lg font-bold", s.color)}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#1B263B] bg-[#050811]/70 px-3 focus-within:border-[#F4C430]/50 focus-within:ring-1 focus-within:ring-[#F4C430]/40">
          <Search className="size-4 shrink-0 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="h-9 w-full bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterStatus)}
          className="h-9 rounded-xl border border-[#1B263B] bg-[#0D1424] px-3 font-mono text-xs font-semibold text-foreground focus:border-[#F4C430]/50 focus:outline-none"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admins</option>
          <option value="user">Users</option>
          <option value="member">Members</option>
        </select>
        <span className="text-[10px] text-muted-foreground">
          {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-2xl border border-[#1B263B] bg-[#0D1424]">
        <div className="hidden grid-cols-[1.2fr_1.2fr_90px_80px_110px_90px] gap-3 border-b border-[#1B263B] bg-white/[0.02] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid">
          <span>User</span>
          <span>Email</span>
          <span>Joined</span>
          <span>Role</span>
          <span>Balance</span>
          <span>Status</span>
        </div>
        <div className="max-h-[440px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Users className="mx-auto mb-3 size-8 text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">
                No users found
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {search
                  ? "Try a different search term"
                  : "No users match the selected filter"}
              </p>
            </div>
          ) : (
            filtered.map((u) => (
              <button
                key={u._id}
                type="button"
                onClick={() => setSelectedId(u._id)}
                className={cn(
                  "grid w-full grid-cols-1 gap-2 border-b border-[#1B263B]/50 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[1.2fr_1.2fr_90px_80px_110px_90px] sm:items-center",
                  u.isFounder && "bg-[#F4C430]/[0.03]",
                  selectedId === u._id && "bg-[#F4C430]/[0.06]",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
                      u.isFounder
                        ? "bg-gradient-to-br from-[#F4C430] to-yellow-600 text-[#0a0e1a]"
                        : "bg-white/5 text-slate-400",
                    )}
                  >
                    {u.name
                      ? u.name
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()
                      : (u.email ?? "?")[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {u.name ?? "Unnamed"}
                  </span>
                </div>
                <span className="truncate font-mono text-[11px] text-slate-400">
                  {u.email ?? "—"}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatDate(u.createdAt)}
                </span>
                <span>
                  {u.isFounder ? (
                    <span className="rounded-full border border-[#F4C430]/40 bg-[#F4C430]/10 px-2 py-0.5 text-[9px] font-bold text-[#F4C430]">
                      FOUNDER
                    </span>
                  ) : u.role === "admin" ? (
                    <span className="rounded-full border border-[#A855F7]/40 bg-[#A855F7]/10 px-2 py-0.5 text-[9px] font-bold text-[#A855F7]">
                      ADMIN
                    </span>
                  ) : (
                    <span className="rounded-full border border-[#1B263B] bg-white/5 px-2 py-0.5 text-[9px] font-bold text-slate-400">
                      {u.role.toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="font-mono text-sm font-bold text-[#F4C430]">
                  {nf.format(u.balance)}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-bold tracking-wider",
                    u.status === "ACTIVE"
                      ? "text-[#00E676]"
                      : u.status === "EMPTY"
                        ? "text-amber-400"
                        : "text-slate-500",
                  )}
                >
                  {u.status}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Selected user detail + refill */}
      {selected && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430]">
                  User profile
                </p>
                <h3 className="truncate font-display text-base font-bold text-foreground">
                  {selected.name ?? "Unnamed"}
                </h3>
                <p className="truncate font-mono text-[11px] text-slate-400">
                  {selected.email ?? "no email"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg border border-[#1B263B] px-2 py-1 text-[10px] text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-mono text-sm font-bold text-[#F4C430]">
                  {nf.format(selected.balance)} tokens
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Joined</dt>
                <dd className="text-slate-300">{formatDate(selected.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="text-slate-300">{selected.role}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-slate-300">{selected.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Transactions</dt>
                <dd className="text-slate-300">{selected.transactionCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last activity</dt>
                <dd className="text-slate-300">
                  {formatDateTime(selected.lastActivity)}
                </dd>
              </div>
            </dl>

            {!selected.isFounder && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRoleToggle(selected)}
                className="mt-4 flex h-8 items-center gap-1.5 rounded-lg border border-[#1B263B] bg-white/[0.03] px-3 text-[11px] font-semibold text-slate-300 hover:text-[#A855F7] disabled:opacity-50"
              >
                <ShieldCheck className="size-3.5" />
                {selected.role === "admin" ? "Demote to user" : "Promote to admin"}
              </button>
            )}

            {/* Refill form */}
            <div className="mt-5 border-t border-[#1B263B] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430]">
                Token refill
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Tokens"
                  className="h-9 w-24 rounded-lg border border-[#1B263B] bg-[#050811]/70 px-2.5 font-mono text-xs text-foreground placeholder:text-slate-600 focus:border-[#F4C430]/50 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !amount}
                  onClick={() => void handleRefill(Number(amount))}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[#00E676]/15 px-3 text-xs font-bold text-[#00E676] transition-colors hover:bg-[#00E676]/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowUpRight className="size-3.5" />
                  Add tokens
                </button>
                <button
                  type="button"
                  disabled={busy || !amount}
                  onClick={() => void handleRefill(-Number(amount))}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[#FF1744]/10 px-3 text-xs font-bold text-[#FF1744] transition-colors hover:bg-[#FF1744]/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowDownRight className="size-3.5" />
                  Deduct
                </button>
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Description (e.g. monthly refill, support credit)"
                className="mt-2 h-9 w-full rounded-lg border border-[#1B263B] bg-[#050811]/70 px-2.5 text-xs text-foreground placeholder:text-slate-600 focus:border-[#F4C430]/50 focus:outline-none"
              />
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                Applied immediately and recorded in the token ledger. Balances
                can never go negative; duplicate submissions are rejected.
              </p>
            </div>
          </div>

          {/* Token history for the selected user */}
          <div className="rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4">
            <div className="mb-2 flex items-center gap-2">
              <History className="size-3.5 text-[#F4C430]" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430]">
                Token history
              </p>
            </div>
            {!selectedHistory ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Loading history…
              </p>
            ) : historyRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No token transactions yet.
              </p>
            ) : (
              <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
                {historyRows.map((t) => (
                  <div
                    key={t._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#1B263B]/70 bg-white/[0.02] px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-slate-200">
                        {t.description}
                      </p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {formatDateTime(t.createdAt)}
                        {t.adminEmail ? ` · by ${t.adminEmail}` : " · self-service"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "font-mono text-[11px] font-bold",
                          t.delta >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                        )}
                      >
                        {t.delta >= 0 ? "+" : ""}
                        {nf.format(t.delta)}
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground">
                        {nf.format(t.previousBalance)} → {nf.format(t.newBalance)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global audit feed */}
      <div className="mt-5 rounded-2xl border border-[#1B263B] bg-[#0D1424] p-4">
        <div className="mb-2 flex items-center gap-2">
          <CreditCard className="size-3.5 text-[#F4C430]" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#F4C430]">
            Latest token transactions
          </p>
        </div>
        {!ledger ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Loading ledger…
          </p>
        ) : globalRows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No token transactions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#1B263B] text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-bold">User</th>
                  <th className="py-2 pr-3 font-bold">Prev</th>
                  <th className="py-2 pr-3 font-bold">Change</th>
                  <th className="py-2 pr-3 font-bold">New</th>
                  <th className="py-2 pr-3 font-bold">Type</th>
                  <th className="py-2 pr-3 font-bold">Date</th>
                  <th className="py-2 font-bold">By</th>
                </tr>
              </thead>
              <tbody>
                {globalRows.map((t) => (
                  <tr key={t._id} className="border-b border-[#1B263B]/50">
                    <td className="max-w-[180px] truncate py-2 pr-3 font-mono text-slate-300">
                      {t.userEmail ?? String(t.userId)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-400">
                      {nf.format(t.previousBalance)}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 font-mono font-bold",
                        t.delta >= 0 ? "text-[#00E676]" : "text-[#FF1744]",
                      )}
                    >
                      {t.delta >= 0 ? "+" : ""}
                      {nf.format(t.delta)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-300">
                      {nf.format(t.newBalance)}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{t.kind}</td>
                    <td className="py-2 pr-3 text-slate-400">
                      {formatDateTime(t.createdAt)}
                    </td>
                    <td className="max-w-[160px] truncate py-2 text-slate-400">
                      {t.adminEmail ?? "system / user"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.03] p-3.5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#F4C430]" />
        <p className="text-[11px] leading-5 text-muted-foreground">
          Administrator access is verified on the backend for every query and
          mutation. Users cannot modify their own balance, and every change is
          written to an append-only token ledger. Founder: {FOUNDER_EMAIL}.
        </p>
      </div>
    </div>
  );
}
