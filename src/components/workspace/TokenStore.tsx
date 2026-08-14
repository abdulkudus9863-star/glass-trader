import { Check, CircleDollarSign, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Pack {
  id: string;
  tokens: number;
  price: string;
  perToken: string;
  tag?: string;
}

const PACKS: Pack[] = [
  { id: "starter", tokens: 50, price: "$9", perToken: "$0.18/token" },
  {
    id: "pro",
    tokens: 150,
    price: "$24",
    perToken: "$0.16/token",
    tag: "POPULAR",
  },
  {
    id: "founder",
    tokens: 500,
    price: "$69",
    perToken: "$0.14/token",
    tag: "BEST VALUE",
  },
];

interface TokenStoreProps {
  tokens: number;
  onTopUp: (amount: number) => void | Promise<void>;
}

export default function TokenStore({ tokens, onTopUp }: TokenStoreProps) {
  const [purchased, setPurchased] = useState<string | null>(null);

  const buy = (p: Pack) => {
    void onTopUp(p.tokens);
    setPurchased(p.id);
    window.setTimeout(() => setPurchased(null), 2500);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#F4C430]/10 text-[#F4C430] ring-1 ring-[#F4C430]/25">
          <CircleDollarSign className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
            Token Store
          </p>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Refill your engine credits
          </h2>
        </div>
        <div className="glass-chip flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[11px]">
          <Wallet className="size-3.5 text-[#F4C430]" />
          <span className="text-slate-500">Balance</span>
          <span className="font-bold text-[#F4C430]">{tokens}</span>
          <span className="text-slate-500">tokens</span>
        </div>
      </div>

      {/* Packs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PACKS.map((p) => {
          const active = purchased === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-[#0D1424] p-4 transition-all",
                p.tag === "POPULAR"
                  ? "border-[#F4C430]/40 shadow-lg shadow-[#F4C430]/10"
                  : "border-[#1B263B]",
              )}
            >
              {p.tag && (
                <span className="absolute -top-2 right-3 rounded-full bg-[#F4C430] px-2 py-px text-[8px] font-bold tracking-widest text-[#0a0e1a]">
                  {p.tag}
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#F4C430]/10 text-[#F4C430]">
                  <Sparkles className="size-4" />
                </span>
                <span className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {p.tokens}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  tokens
                </span>
              </div>
              <p className="mt-2 font-mono text-sm font-semibold text-[#F4C430]">
                {p.price}
              </p>
              <p className="text-[10px] text-muted-foreground">{p.perToken}</p>
              <button
                type="button"
                onClick={() => buy(p)}
                className={cn(
                  "mt-4 flex h-9 items-center justify-center gap-1.5 rounded-lg font-display text-xs font-bold transition-all",
                  active
                    ? "bg-[#00E676] text-[#05120a]"
                    : "bg-[#F4C430] text-[#0a0e1a] hover:bg-[#F4C430]/85",
                )}
              >
                {active ? (
                  <>
                    <Check className="size-4" />
                    Added to wallet
                  </>
                ) : (
                  `Add ${p.tokens} tokens`
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.03] p-3.5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#F4C430]" />
        <p className="text-xs leading-5 text-muted-foreground">
          Purchases are simulated in this trial build — credits are applied to
          your wallet instantly so you can test the strategy compiler end to
          end. Real payment processing can be wired to any provider on demand.
        </p>
      </div>
    </div>
  );
}
