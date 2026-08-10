import {
  Calculator,
  CandlestickChart,
  MessagesSquare,
  NotebookPen,
} from "lucide-react";
import type { AppTab } from "./AppHeader";
import { cn } from "@/lib/utils";

interface MobileNavItem {
  id: Extract<AppTab, "chart" | "journal" | "calculator" | "chat">;
  label: string;
  icon: typeof CandlestickChart;
}

const ITEMS: MobileNavItem[] = [
  { id: "chart", label: "Chart", icon: CandlestickChart },
  { id: "journal", label: "Journal", icon: NotebookPen },
  { id: "calculator", label: "Calculator", icon: Calculator },
  { id: "chat", label: "Chat", icon: MessagesSquare },
];

interface MobileNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export default function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav className="flex h-14 shrink-0 items-stretch justify-around border-t border-white/5 bg-[#0b101b]/95 backdrop-blur-xl lg:hidden">
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
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
              active
                ? "text-amber-400"
                : "text-slate-500 hover:text-slate-300",
            )}
          >
            {active && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-400" />
            )}
            <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
