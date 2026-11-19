import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Bot, CheckCircle2, Cpu, KeyRound, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AI_PROVIDER_LABELS,
  loadAiProvider,
  saveAiProvider,
  type AiProvider,
} from "@/lib/ai-provider";
import { cn } from "@/lib/utils";

const ORDER: AiProvider[] = ["local", "openai", "gemini"];

const DESCRIPTIONS: Record<AiProvider, string> = {
  local: "Deterministic SMC engine over the live tape. Runs on the device, no API key, never presented as a hosted model.",
  openai: "Official OpenAI Responses API (gpt-4o-mini). Multi-turn, server-side key, strict JSON analysis.",
  gemini: "Google Gemini 2.0 Flash via the Generative Language API. Same server-side key policy.",
};

/**
 * AI Engine settings — provider selection + configuration status.
 * Keys are NEVER entered or displayed here; only a boolean "configured" flag
 * comes from the server.
 */
export default function AiEngineSettings() {
  const status = useQuery(api.copilot.aiStatus);
  const [active, setActive] = useState<AiProvider>(() => loadAiProvider());

  const configured = (p: AiProvider): boolean | null => {
    if (p === "local") return true;
    if (!status) return null;
    return p === "openai" ? status.openai : status.gemini;
  };

  const select = (p: AiProvider) => {
    setActive(p);
    saveAiProvider(p);
    toast.success(`Default AI engine: ${AI_PROVIDER_LABELS[p]}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#A855F7]/10 text-[#A855F7] ring-1 ring-[#A855F7]/25">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A855F7]">
            AI Engine
          </p>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Copilot provider settings
          </h2>
        </div>
        <span className="rounded-full border border-[#00E676]/30 bg-[#00E676]/10 px-2.5 py-1 text-[10px] font-bold text-[#00E676]">
          ACTIVE · {AI_PROVIDER_LABELS[active]}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {ORDER.map((p) => {
          const isActive = p === active;
          const ok = configured(p);
          return (
            <div
              key={p}
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                isActive
                  ? "border-[#A855F7]/40 bg-[#A855F7]/[0.06]"
                  : "border-[#1B263B] bg-[#0D1424]",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-[#A855F7]">
                  {p === "local" ? <Cpu className="size-4" /> : <Sparkles className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {AI_PROVIDER_LABELS[p]}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {p === "local" ? "on-device deterministic" : "hosted API · server-side key"}
                  </p>
                </div>
                {p !== "local" && (
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold",
                      ok === null
                        ? "border-slate-500/30 text-slate-400"
                        : ok
                          ? "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400",
                    )}
                  >
                    <KeyRound className="size-2.5" />
                    {ok === null ? "CHECKING" : ok ? "KEY CONFIGURED" : "KEY MISSING"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => select(p)}
                  disabled={isActive}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors",
                    isActive
                      ? "bg-[#A855F7]/20 text-[#A855F7]"
                      : "border border-[#1B263B] bg-white/[0.03] text-slate-300 hover:text-white",
                  )}
                >
                  {isActive && <CheckCircle2 className="size-3.5" />}
                  {isActive ? "Default engine" : "Set as default"}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">{DESCRIPTIONS[p]}</p>
              {p !== "local" && ok === false && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-4 text-amber-300/90">
                  <ShieldAlert className="mt-0.5 size-3 shrink-0" />
                  Add {p === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} in the project
                  Keys tab. Until then this engine returns an explicit configuration
                  error — no silent fallback.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.03] p-3.5">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[#F4C430]" />
        <p className="text-[11px] leading-5 text-muted-foreground">
          API keys are read only from server-side environment variables inside Convex
          actions and are never sent to the browser. Switching engines does not clear
          chat history.
        </p>
      </div>
    </div>
  );
}
