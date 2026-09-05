import { useState, useMemo } from "react";
import {
  ArrowLeft,
  CreditCard,
  KeyRound,
  Search,
  ShieldCheck,
  ShieldX,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const FOUNDER_EMAIL = "abdulkudus9863@gmail.com";

interface AdminUser {
  _id: string;
  name: string | null;
  email: string | null;
  role: string;
  isFounder: boolean;
  balance: number;
  createdAt: number;
}

type FilterStatus = "all" | "admin" | "user" | "member";

export default function AdminPortal() {
  const { user } = useAuth();
  const isOwner =
    user?.isFounder === true ||
    user?.email?.trim().toLowerCase() === FOUNDER_EMAIL;

  // --- Backend data ---
  const allUsers = useQuery(api.admin.listAllUsers);
  const adjustBalance = useMutation(api.admin.adjustBalance);
  const toggleUserRole = useMutation(api.admin.toggleUserRole);

  // --- Local state ---
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});

  // --- Access Denied screen ---
  if (!isOwner) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-[#FF1744]/10 ring-1 ring-[#FF1744]/25">
          <ShieldX className="size-8 text-[#FF1744]" />
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          Access Denied
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          Founder credentials are required to access this portal. This area is
          restricted to the platform owner only.
        </p>
        <button
          type="button"
          onClick={() => {
            // Navigate back by dispatching a custom event the parent can handle
            window.dispatchEvent(new CustomEvent("admin-denied"));
          }}
          className="mt-6 flex h-10 items-center gap-2 rounded-xl bg-[#F4C430] px-5 font-display text-sm font-bold text-[#0a0e1a] transition-all hover:bg-[#F4C430]/85"
        >
          <ArrowLeft className="size-4" />
          Return to Charts
        </button>
      </div>
    );
  }

  // --- Loading state ---
  if (!allUsers) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-[#F4C430] border-t-transparent" />
          <p className="text-xs text-slate-400">Loading user data…</p>
        </div>
      </div>
    );
  }

  // --- Filtering ---
  const filtered = useMemo(() => {
    let list = allUsers;
    if (filter !== "all") {
      list = list.filter((u) => u.role === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allUsers, filter, search]);

  // --- Token adjustment ---
  const handleAdjust = async (userId: string, userName: string, amount: number) => {
    try {
      await adjustBalance({ userId: userId as any, amount });
      const action = amount > 0 ? "Credited" : "Debited";
      toast.success(`${action} ${Math.abs(amount)} tokens for ${userName}`);
      setAdjustAmounts((prev) => ({ ...prev, [userId]: "" }));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to adjust tokens");
    }
  };

  // --- Role toggle ---
  const handleRoleToggle = async (userId: string, currentRole: string, userName: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    try {
      await toggleUserRole({ userId: userId as any, newRole });
      toast.success(`Updated ${userName}'s role to ${newRole}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update role");
    }
  };

  // --- Helpers ---
  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const roleBadge = (role: string, isFounder: boolean) => {
    if (isFounder)
      return (
        <span className="rounded-full border border-[#F4C430]/40 bg-[#F4C430]/10 px-2 py-0.5 text-[10px] font-bold text-[#F4C430]">
          FOUNDER
        </span>
      );
    if (role === "admin")
      return (
        <span className="rounded-full border border-[#A855F7]/40 bg-[#A855F7]/10 px-2 py-0.5 text-[10px] font-bold text-[#A855F7]">
          ADMIN
        </span>
      );
    return (
      <span className="rounded-full border border-[#1B263B] bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">
        {role.toUpperCase()}
      </span>
    );
  };

  const stats = useMemo(() => ({
    total: allUsers.length,
    admins: allUsers.filter((u) => u.role === "admin" || u.isFounder).length,
    totalTokens: allUsers.reduce((s, u) => s + u.balance, 0),
  }), [allUsers]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#F4C430]/10 text-[#F4C430] ring-1 ring-[#F4C430]/25">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
            Founder Admin Panel
          </p>
          <h1 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
            User & Token Management
          </h1>
        </div>
        <span className="rounded-full border border-[#00E676]/30 bg-[#00E676]/10 px-2.5 py-1 text-[10px] font-bold text-[#00E676]">
          OWNER ACCESS
        </span>
      </div>

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Total Users", value: stats.total, icon: Users, color: "text-[#00F0FF]" },
          { label: "Admins", value: stats.admins, icon: ShieldCheck, color: "text-[#A855F7]" },
          { label: "Total Tokens", value: stats.totalTokens.toLocaleString(), icon: CreditCard, color: "text-[#F4C430]" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <s.icon className={cn("size-3.5", s.color)} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
            </div>
            <p className={cn("mt-1 font-mono text-lg font-bold", s.color)}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
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

      {/* User Table */}
      <div className="overflow-hidden rounded-2xl border border-[#1B263B] bg-[#0D1424]">
        {/* Table header */}
        <div className="hidden grid-cols-[1fr_180px_100px_80px_180px_120px] gap-3 border-b border-[#1B263B] bg-white/[0.02] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid">
          <span>User</span>
          <span>Email</span>
          <span>Joined</span>
          <span>Role</span>
          <span>Token Balance</span>
          <span>Actions</span>
        </div>

        {/* Rows */}
        <div className="max-h-[500px] overflow-y-auto">
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
              <div
                key={u._id}
                className={cn(
                  "grid grid-cols-1 gap-3 border-b border-[#1B263B]/50 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:grid-cols-[1fr_180px_100px_80px_180px_120px] sm:items-center",
                  u.isFounder && "bg-[#F4C430]/[0.03]",
                )}
              >
                {/* Name */}
                <div className="flex items-center gap-2">
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
                      : (u.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {u.name ?? "Unnamed"}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground sm:hidden">
                      {u.email ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Email */}
                <span className="hidden truncate font-mono text-xs text-slate-400 sm:block">
                  {u.email ?? "—"}
                </span>

                {/* Joined */}
                <span className="hidden text-xs text-slate-400 sm:block">
                  {formatDate(u.createdAt)}
                </span>

                {/* Role */}
                <div className="hidden sm:block">
                  {roleBadge(u.role, u.isFounder)}
                </div>

                {/* Token Balance */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#F4C430]">
                    {u.balance.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">tokens</span>
                </div>

                {/* Actions: token adjust + role toggle */}
                <div className="flex items-center gap-1.5">
                  {!u.isFounder && (
                    <>
                      {/* Token adjust input */}
                      <input
                        type="number"
                        value={adjustAmounts[u._id] ?? ""}
                        onChange={(e) =>
                          setAdjustAmounts((prev) => ({
                            ...prev,
                            [u._id]: e.target.value,
                          }))
                        }
                        placeholder="Amt"
                        className="h-7 w-16 rounded-lg border border-[#1B263B] bg-[#050811]/70 px-2 font-mono text-[10px] text-foreground placeholder:text-slate-600 focus:border-[#F4C430]/50 focus:outline-none"
                      />
                      {/* Credit button */}
                      <button
                        type="button"
                        onClick={() => {
                          const amt = Number(adjustAmounts[u._id]);
                          if (!amt || amt <= 0) return;
                          handleAdjust(u._id, u.name ?? u.email ?? "User", amt);
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#00E676]/10 text-[#00E676] transition-colors hover:bg-[#00E676]/20"
                        title="Add tokens"
                      >
                        <TrendingUp className="size-3" />
                      </button>
                      {/* Debit button */}
                      <button
                        type="button"
                        onClick={() => {
                          const amt = Number(adjustAmounts[u._id]);
                          if (!amt || amt <= 0) return;
                          handleAdjust(u._id, u.name ?? u.email ?? "User", -amt);
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#FF1744]/10 text-[#FF1744] transition-colors hover:bg-[#FF1744]/20"
                        title="Deduct tokens"
                      >
                        <TrendingDown className="size-3" />
                      </button>
                      {/* Role toggle */}
                      <button
                        type="button"
                        onClick={() =>
                          handleRoleToggle(u._id, u.role, u.name ?? u.email ?? "User")
                        }
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition-colors hover:bg-[#A855F7]/10 hover:text-[#A855F7]"
                        title={`Toggle role (current: ${u.role})`}
                      >
                        <ShieldCheck className="size-3" />
                      </button>
                    </>
                  )}
                  {u.isFounder && (
                    <span className="text-[10px] font-bold text-[#F4C430]">
                      Owner
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.03] p-3.5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#F4C430]" />
        <p className="text-[11px] leading-5 text-muted-foreground">
          Only the platform founder ({FOUNDER_EMAIL}) can access this panel.
          Token adjustments are applied immediately to the Convex backend and
          persist across all devices. Role changes take effect on the user's
          next page load.
        </p>
      </div>
    </div>
  );
}
