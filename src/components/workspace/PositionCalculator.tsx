import { Calculator, Info } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

interface RowProps {
  label: string;
  value: string;
  accent?: string;
}

function ResultRow({ label, value, accent }: RowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

export default function PositionCalculator() {
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("2412.00");
  const [stop, setStop] = useState("2392.00");
  const [target, setTarget] = useState("2462.00");

  const b = parseFloat(balance);
  const r = parseFloat(riskPct);
  const e = parseFloat(entry);
  const s = parseFloat(stop);
  const t = parseFloat(target);

  const valid = b > 0 && r > 0 && e > 0 && s > 0 && e !== s;
  const riskAmount = valid ? b * (r / 100) : 0;
  const riskPerUnit = valid ? Math.abs(e - s) : 0;
  const size = valid && riskPerUnit > 0 ? riskAmount / riskPerUnit : 0;
  const value = valid ? size * e : 0;
  const lots100k = size / 100_000;
  const rr = valid && t > 0 ? Math.abs(t - e) / riskPerUnit : null;

  const numProps = (set: (v: string) => void) => ({
    type: "number" as const,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => set(ev.target.value),
    className: "h-9 bg-white/[0.03] tabular-nums",
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          Position Calculator
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Size the trade before you take it
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Work out how much risk a trade carries and the exact position size
          that keeps it inside your plan.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Inputs */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
              <Calculator className="size-4" />
            </div>
            <p className="text-sm font-bold text-foreground">Trade inputs</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-balance" className="text-xs text-muted-foreground">
                Account balance (USD)
              </Label>
              <Input id="pc-balance" value={balance} {...numProps(setBalance)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-risk" className="text-xs text-muted-foreground">
                Risk per trade (%)
              </Label>
              <Input id="pc-risk" value={riskPct} {...numProps(setRiskPct)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-entry" className="text-xs text-muted-foreground">
                Entry price
              </Label>
              <Input id="pc-entry" value={entry} {...numProps(setEntry)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-stop" className="text-xs text-muted-foreground">
                Stop loss
              </Label>
              <Input id="pc-stop" value={stop} {...numProps(setStop)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pc-target" className="text-xs text-muted-foreground">
                Take profit (optional)
              </Label>
              <Input id="pc-target" value={target} {...numProps(setTarget)} />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="glass-strong rounded-2xl p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Results
          </p>
          {!valid ? (
            <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-3">
              <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
              <p className="text-xs leading-5 text-muted-foreground">
                Enter a balance, risk percentage and entry/stop prices to
                calculate your position size.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <ResultRow
                label="Risk amount"
                value={`$${fmt(riskAmount)}`}
                accent="text-rose-400"
              />
              <ResultRow
                label="Position size"
                value={`${fmt(size, 4)} units`}
                accent="text-amber-400"
              />
              <ResultRow
                label="Position value"
                value={`$${fmt(value)}`}
              />
              <ResultRow
                label="Approx. lots (100k)"
                value={fmt(lots100k)}
              />
              {rr !== null && (
                <ResultRow
                  label="Reward : risk"
                  value={`1 : ${fmt(rr)}`}
                  accent="text-emerald-400"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
