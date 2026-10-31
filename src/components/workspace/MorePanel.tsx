import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Calculator,
  CircleDollarSign,
  FlaskConical,
  FunctionSquare,
  GraduationCap,
  KeyRound,
  MessagesSquare,
  MoreHorizontal,
  NotebookPen,
  SendHorizonal,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Academy from "./Academy";
import AdminPortal from "./AdminPortal";
import CommunityChat from "./CommunityChat";
import IndicatorLibrary from "./IndicatorLibrary";
import PaperTrading from "./PaperTrading";
import PositionCalculator from "./PositionCalculator";
import TelegramSignals from "./TelegramSignals";
import TokenStore from "./TokenStore";
import TradeJournal from "./TradeJournal";

type SectionId =
  | "overview"
  | "paper"
  | "admin"
  | "telegram"
  | "store"
  | "library"
  | "academy"
  | "calculator"
  | "journal"
  | "chat";

interface Section {
  id: SectionId;
  label: string;
  body: string;
  icon: typeof ShieldCheck;
  accent: string;
  badge?: string;
}

interface MorePanelProps {
  isAdmin: boolean;
  isFounder: boolean;
  tokens: number;
  onTopUp: (amount: number) => void;
  onReturnToCharts?: () => void;
}

export default function MorePanel({
  isFounder,
  tokens,
  onTopUp,
  onReturnToCharts,
}: MorePanelProps) {
  // Listen for Access Denied → return to charts
  useEffect(() => {
    const handler = () => onReturnToCharts?.();
    window.addEventListener("admin-denied", handler);
    return () => window.removeEventListener("admin-denied", handler);
  }, [onReturnToCharts]);
  const [section, setSection] = useState<SectionId>("overview");

  const allSections: Section[] = [
    {
      id: "paper",
      label: "Paper Trading",
      body: "Simulated INR account with live prices, risk limits and performance stats.",
      icon: FlaskConical,
      accent: "text-[#00F0FF] bg-[#00F0FF]/10 ring-[#00F0FF]/25",
      badge: "SIM",
    },
    {
      id: "admin",
      label: "Founder Admin Panel",
      body: "Run the academy — indicator studio, member access and signal controls.",
      icon: ShieldCheck,
      accent: "text-[#F4C430] bg-[#F4C430]/10 ring-[#F4C430]/25",
      badge: isFounder ? "FOUNDER" : "ADMIN",
    },
    {
      id: "telegram",
      label: "Telegram Bot Dispatcher",
      body: "Live dispatch feed of every outgoing trade alert.",
      icon: SendHorizonal,
      accent: "text-[#00F0FF] bg-[#00F0FF]/10 ring-[#00F0FF]/25",
      badge: "LIVE",
    },
    {
      id: "store",
      label: "Token Store",
      body: "Refill engine credits to keep the compiler and copilot running.",
      icon: CircleDollarSign,
      accent: "text-[#F4C430] bg-[#F4C430]/10 ring-[#F4C430]/25",
      badge: "WALLET",
    },
    {
      id: "library",
      label: "Indicator Studio",
      body: "Every public and invite-only study in the academy.",
      icon: FunctionSquare,
      accent: "text-[#F4C430] bg-[#F4C430]/10 ring-[#F4C430]/25",
    },
    {
      id: "academy",
      label: "Academy Courses",
      body: "Foundations, SMC and risk courseware for members.",
      icon: GraduationCap,
      accent: "text-[#00E676] bg-[#00E676]/10 ring-[#00E676]/25",
    },
    {
      id: "calculator",
      label: "Position Calculator",
      body: "Sizing, risk and R:R math for every setup.",
      icon: Calculator,
      accent: "text-[#A855F7] bg-[#A855F7]/10 ring-[#A855F7]/25",
    },
    {
      id: "journal",
      label: "Trade Journal",
      body: "Log every trade, track win rate and net P&L.",
      icon: NotebookPen,
      accent: "text-[#00F0FF] bg-[#00F0FF]/10 ring-[#00F0FF]/25",
    },
    {
      id: "chat",
      label: "Community Chat",
      body: "The live academy trading room.",
      icon: MessagesSquare,
      accent: "text-[#00E676] bg-[#00E676]/10 ring-[#00E676]/25",
      badge: "LIVE",
    },
  ];
  // Only the founder (owner) sees the admin panel — even other admins don't
  const sections = allSections.filter((s) => s.id !== "admin" || isFounder);

  const active = sections.find((s) => s.id === section);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-[#F4C430] ring-1 ring-[#1B263B]">
          <MoreHorizontal className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F4C430]">
            More
          </p>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            {section === "overview" ? "Everything else" : active?.label ?? "More"}
          </h1>
        </div>
        {section !== "overview" && (
          <button
            type="button"
            onClick={() => setSection("overview")}
            className="glass-chip flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-300 transition-colors hover:text-[#F4C430]"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {section === "overview" ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid grid-cols-1 gap-3 px-5 pb-6 sm:grid-cols-2 xl:grid-cols-3"
            >
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    className={cn(
                      "glass group rounded-2xl p-4 text-left transition-all duration-300 hover:-translate-y-0.5",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl ring-1",
                          s.accent,
                        )}
                      >
                        <Icon className="size-5" />
                      </div>
                      {s.badge && (
                        <span className="rounded-full border border-[#1B263B] bg-white/[0.03] px-2 py-0.5 text-[9px] font-bold tracking-wider text-slate-400">
                          {s.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 font-display text-sm font-bold text-foreground">
                      {s.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{s.body}</p>
                  </button>
                );
              })}
              {!isFounder && (
                <div className="flex items-start gap-2 rounded-2xl border border-dashed border-[#1B263B] p-4">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-[#F4C430]" />
                  <p className="text-xs leading-5 text-muted-foreground">
                    The Founder Admin Portal is restricted to the platform owner
                    only. Contact the founder for access.
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="h-full"
            >
              {section === "paper" && <PaperTrading />}
              {section === "admin" && <AdminPortal />}
              {section === "telegram" && <TelegramSignals />}
              {section === "store" && <TokenStore tokens={tokens} onTopUp={onTopUp} />}
              {section === "library" && <IndicatorLibrary />}
              {section === "academy" && <Academy />}
              {section === "calculator" && <PositionCalculator />}
              {section === "journal" && <TradeJournal />}
              {section === "chat" && (
                <div className="flex h-full flex-col p-5">
                  <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
                    <CommunityChat />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
