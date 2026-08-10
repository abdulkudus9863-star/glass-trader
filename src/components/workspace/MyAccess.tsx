import { CheckCircle2, KeyRound, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { INDICATORS, LOCKED_INDICATORS } from "@/lib/indicators";

export default function MyAccess() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/60 px-3 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          My Access
        </p>
        <p className="text-[10px] text-muted-foreground">
          Tools unlocked for your account
        </p>
      </div>

      <div className="flex flex-col p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
          Free library · {INDICATORS.length} available
        </p>
        <div className="flex flex-col gap-1">
          {INDICATORS.map((ind) => (
            <div
              key={ind.id}
              className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: ind.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {ind.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {ind.category}
                </span>
              </span>
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            </div>
          ))}
        </div>

        <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Invite-only · locked
        </p>
        <div className="flex flex-col gap-1">
          {LOCKED_INDICATORS.map((ind) => (
            <div
              key={ind.id}
              className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/80 px-2.5 py-2 opacity-80"
            >
              <Lock className="size-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-500">
                  {ind.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {ind.category}
                </span>
              </span>
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700"
              >
                Invite
              </Badge>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-indigo-500/5 p-2.5">
          <KeyRound className="mt-0.5 size-3.5 shrink-0 text-indigo-500" />
          <p className="text-[10px] leading-4 text-muted-foreground">
            Proprietary indicators are granted by admins through the invitation
            system — you&apos;ll see unlocked tools here instantly when they
            arrive.
          </p>
        </div>
      </div>
    </div>
  );
}
