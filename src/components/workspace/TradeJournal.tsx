import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Loader2, NotebookPen, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface JournalEntry {
  id: Id<"journalEntries">;
  symbol: string;
  direction: "long" | "short";
  entry: number;
  exit: number;
  size: number;
  notes: string;
  time: number;
}

const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSD"];

const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export default function TradeJournal() {
  const { user } = useAuth();
  const authed = user != null;

  /* Real backend persistence — the journal starts empty and only ever
     contains entries the trader actually submits. No seeds, no samples. */
  const docs = useQuery(api.journal.list, authed ? {} : "skip");
  const addEntry = useMutation(api.journal.add);
  const removeEntry = useMutation(api.journal.remove);

  const [symbol, setSymbol] = useState("XAUUSD");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const entries: JournalEntry[] = (docs ?? []).map((d) => ({
    id: d._id,
    symbol: d.symbol,
    direction: d.direction,
    entry: d.entry,
    exit: d.exit,
    size: d.size,
    notes: d.notes,
    time: d.createdAt,
  }));

  const pnlOf = (e: JournalEntry) =>
    (e.direction === "long" ? e.exit - e.entry : e.entry - e.exit) * e.size;

  const totals = entries.reduce(
    (acc, e) => {
      const pnl = pnlOf(e);
      return {
        count: acc.count + 1,
        wins: acc.wins + (pnl > 0 ? 1 : 0),
        net: acc.net + pnl,
      };
    },
    { count: 0, wins: 0, net: 0 },
  );

  const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const entryN = parseFloat(entry);
    const exitN = parseFloat(exit);
    const sizeN = parseFloat(size);
    if (
      !isFinite(entryN) ||
      !isFinite(exitN) ||
      entryN <= 0 ||
      !isFinite(sizeN) ||
      sizeN <= 0 ||
      saving
    ) {
      return;
    }
    setSaving(true);
    try {
      await addEntry({
        symbol,
        direction,
        entry: entryN,
        exit: exitN,
        size: sizeN,
        notes: notes.trim(),
      });
      setEntry("");
      setExit("");
      setSize("");
      setNotes("");
    } catch {
      /* keep the draft so nothing is lost */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: Id<"journalEntries">) => {
    void removeEntry({ id });
  };

  const winRate = totals.count > 0 ? (totals.wins / totals.count) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          Trade Journal
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Review every trade you take
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Log entries and exits as you trade, then revisit the numbers — the
          journal is where consistency is built. Entries persist to your
          account on the backend.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Entry form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
              <NotebookPen className="size-4" />
            </div>
            <p className="text-sm font-bold text-foreground">Log a trade</p>
          </div>

          <div className="grid gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Instrument</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSymbol(s)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
                      symbol === s
                        ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/30"
                        : "bg-white/5 text-slate-400 hover:text-slate-200",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDirection("long")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all",
                    direction === "long"
                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "bg-white/5 text-slate-400 hover:text-slate-200",
                  )}
                >
                  <ArrowUp className="size-3.5" /> Long
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("short")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all",
                    direction === "short"
                      ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
                      : "bg-white/5 text-slate-400 hover:text-slate-200",
                  )}
                >
                  <ArrowDown className="size-3.5" /> Short
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Entry</Label>
                <Input
                  type="number"
                  step="any"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  className="h-9 bg-white/[0.03] tabular-nums"
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Exit</Label>
                <Input
                  type="number"
                  step="any"
                  value={exit}
                  onChange={(e) => setExit(e.target.value)}
                  className="h-9 bg-white/[0.03] tabular-nums"
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Size</Label>
                <Input
                  type="number"
                  step="any"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="h-9 bg-white/[0.03] tabular-nums"
                  placeholder="Units"
                  required
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="bg-white/[0.03]"
                placeholder="Setup, thesis, emotions, mistakes…"
                rows={2}
                maxLength={300}
              />
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="h-9 rounded-lg bg-amber-400 text-[#0b101b] hover:bg-amber-300"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add to journal"
              )}
            </Button>
          </div>
        </form>

        {/* History */}
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Trades
                </p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
                  {totals.count}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Win rate
                </p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
                  {totals.count > 0 ? `${fmt(winRate, 0)}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Net P&amp;L
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-lg font-extrabold tabular-nums",
                    totals.net >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {totals.net >= 0 ? "+" : ""}
                  {fmt(totals.net)}
                </p>
              </div>
            </div>
          </div>

          <div className="glass min-h-[220px] flex-1 rounded-2xl p-4">
            {docs === undefined ? (
              <div className="flex h-full min-h-[180px] items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading journal…
              </div>
            ) : entries.length === 0 ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center">
                <NotebookPen className="size-6 text-slate-600" />
                <p className="text-xs text-muted-foreground">
                  No trades logged yet.
                  <br />
                  Your first entry will appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {entries.map((e) => {
                  const pnl = pnlOf(e);
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5"
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md",
                          e.direction === "long"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400",
                        )}
                      >
                        {e.direction === "long" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground">
                          {e.symbol}{" "}
                          <span className="font-medium text-muted-foreground">
                            {e.direction}
                          </span>
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {fmt(e.entry)} → {fmt(e.exit)} · {fmt(e.size, 0)} units
                          {e.notes ? ` · ${e.notes}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-bold tabular-nums",
                          pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {fmt(pnl)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete entry"
                        onClick={() => handleDelete(e.id)}
                        className="size-7 shrink-0 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
