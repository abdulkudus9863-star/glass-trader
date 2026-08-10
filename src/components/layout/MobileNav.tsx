import {
  Bot,
  CandlestickChart,
  FlaskConical,
  MoreHorizontal,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTab = "radar" | "charts" | "strategy" | "copilot" | "more";

interface MobileNavItem {
  id: AppTab;
  label: string;
  icon: typeof Radar;
}

const ITEMS: MobileNavItem[] = [
  { id: "radar", label: "Radar", icon: Radar },
  { id: "charts", label: "Charts", icon: CandlestickChart },
  { id: "strategy", label: "Strategy", icon: FlaskConical },
  { id: "copilot", label: "Copilot", icon: Bot },
  { id: "more", label: "More", icon: MoreHorizontal },
];

interface MobileNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export default function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav className="flex h-16 shrink-0 items-stretch justify-around border-t border-[#1B263B] bg-[#050811]/95 backdrop-blur-xl">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] transition-colors",
              active ? "text-[#F4C430]" : "text-slate-500 hover:text-slate-300",
            )}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-10 rounded-full bg-[#F4C430] shadow-[0_0_10px_rgba(244,196,48,0.6)]" />
            )}
            <Icon
              className="size-[19px]"
              strokeWidth={active ? 2.4 : 2}
              style={active ? { filter: "drop-shadow(0 0 6px rgba(244,196,48,0.45))" } : undefined}
            />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
