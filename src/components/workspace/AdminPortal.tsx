import { Activity, FunctionSquare, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AdminTool {
  icon: typeof FunctionSquare;
  title: string;
  body: string;
}

const TOOLS: AdminTool[] = [
  {
    icon: FunctionSquare,
    title: "Indicator Studio",
    body: "Author Pine-style studies, package custom canvas indicators and publish them to the ƒx library.",
  },
  {
    icon: KeyRound,
    title: "User Access & Invitations",
    body: "Grant, revoke and time-box proprietary indicator access for every academy member.",
  },
  {
    icon: Activity,
    title: "Market Data Operations",
    body: "Manage symbols, exchanges and data sources that feed the charting terminal.",
  },
];

export default function AdminPortal() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
            Admin Portal
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Run the academy
          </h1>
        </div>
        <Badge
          variant="outline"
          className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
        >
          Administrator access
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.title}
              className="glass rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/15 to-yellow-600/10 text-amber-400 ring-1 ring-amber-400/20">
                  <Icon className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                >
                  Planned · v2
                </Badge>
              </div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">
                {tool.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
                {tool.body}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.03] p-3.5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
        <p className="text-xs leading-5 text-muted-foreground">
          The portal is visible only to administrator accounts. Indicator
          publishing, member invitations and access controls land in the next
          release — role-based visibility is already enforced today.
        </p>
      </div>
    </div>
  );
}
