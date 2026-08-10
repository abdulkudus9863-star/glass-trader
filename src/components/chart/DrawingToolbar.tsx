import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  Eraser,
  Minus,
  Percent,
  Square,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ToolId } from "./CustomChart";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: LucideIcon;
}

const DRAW_TOOLS: ToolDef[] = [
  { id: "trendline", label: "Trendline", icon: TrendingUp },
  { id: "horizontal", label: "Horizontal line", icon: Minus },
  { id: "fib", label: "Fibonacci retracement", icon: Percent },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "long", label: "Long position", icon: ArrowUp },
  { id: "short", label: "Short position", icon: ArrowDown },
];

const ACTION_TOOLS: ToolDef[] = [
  { id: "eraser", label: "Erase drawing", icon: Eraser },
  { id: "clear", label: "Clear all drawings", icon: Trash2 },
];

interface DrawingToolbarProps {
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
}

export default function DrawingToolbar({
  tool,
  onToolChange,
}: DrawingToolbarProps) {
  const renderButton = (def: ToolDef) => {
    const Icon = def.icon;
    const active = tool === def.id;
    return (
      <Tooltip key={def.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={def.label}
            title={def.label}
            onClick={() => onToolChange(active ? null : def.id)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-slate-500 transition-all",
              "hover:bg-white/80 hover:text-indigo-600 hover:shadow-sm",
              active &&
                "bg-indigo-500/12 text-indigo-600 shadow-sm ring-1 ring-indigo-400/40",
            )}
          >
            <Icon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{def.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex shrink-0 flex-col gap-0.5 self-start rounded-xl glass p-1.5">
      {DRAW_TOOLS.map(renderButton)}
      <div className="mx-1 my-1 h-px bg-border/70" />
      {ACTION_TOOLS.map(renderButton)}
      {tool && (
        <div className="mt-1 flex h-7 items-center justify-center rounded-md bg-indigo-500/10 px-1 text-center text-[9px] font-semibold leading-tight text-indigo-600">
          Esc to exit
        </div>
      )}
    </div>
  );
}
