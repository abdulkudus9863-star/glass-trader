import { useStrategy } from "@/contexts/StrategyContext";
import { cn } from "@/lib/utils";

interface PriceTagProps {
  label: string;
  price: number;
  color: string;
  glowColor: string;
  /** Vertical position as a percentage (0 = top, 100 = bottom). */
  top: string;
}

/**
 * A single glowing price tag on the right-side HUD.
 * Renders as a horizontal bar with a label badge and a pointer line.
 */
function PriceTag({ label, price, color, glowColor, top }: PriceTagProps) {
  return (
    <div
      className="pointer-events-auto absolute right-0 flex items-center gap-0 transition-all duration-300 ease-out"
      style={{ top }}
    >
      {/* Horizontal pointer line from badge to the left */}
      <div
        className="h-[1.5px] w-6 shrink-0"
        style={{
          background: `linear-gradient(to left, ${color}, transparent)`,
        }}
      />
      {/* Badge */}
      <div
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider backdrop-blur-sm",
          "border shadow-lg",
        )}
        style={{
          backgroundColor: `${color}18`,
          borderColor: `${color}40`,
          color: color,
          boxShadow: `0 0 8px ${glowColor}, 0 0 2px ${glowColor}`,
        }}
      >
        <span className="mr-1 text-[8px] uppercase opacity-70">{label}</span>
        <span className="tabular-nums">
          {price.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );
}

/**
 * Visual Levels HUD — a sleek floating overlay on the right side of the chart
 * that shows glowing horizontal price tags for the active strategy levels.
 *
 * Does NOT touch the TradingView iframe — renders entirely as an HTML overlay
 * on top of it, with pointer-events-none so chart interaction is unaffected.
 */
export default function StrategyPriceLines() {
  const { activeStrategy, showLines } = useStrategy();

  if (!activeStrategy) return null;

  // Collect all levels to render, sorted by price descending (top = highest)
  const levels: {
    label: string;
    price: number;
    color: string;
    glowColor: string;
  }[] = [];

  // TP levels (highest to lowest) — green
  if (activeStrategy.tp3 != null) {
    levels.push({
      label: "TP3",
      price: activeStrategy.tp3,
      color: "#26a69a",
      glowColor: "rgba(38,166,154,0.4)",
    });
  }
  if (activeStrategy.tp2 != null) {
    levels.push({
      label: "TP2",
      price: activeStrategy.tp2,
      color: "#26a69a",
      glowColor: "rgba(38,166,154,0.35)",
    });
  }
  if (activeStrategy.tp1 != null) {
    levels.push({
      label: "TP1",
      price: activeStrategy.tp1,
      color: "#26a69a",
      glowColor: "rgba(38,166,154,0.3)",
    });
  }

  // Entry (yellow) — both min and max if they differ
  levels.push({
    label: "ENTRY",
    price: activeStrategy.entryMax,
    color: "#f0b90b",
    glowColor: "rgba(240,185,11,0.4)",
  });
  if (activeStrategy.entryMax !== activeStrategy.entryMin) {
    levels.push({
      label: "ENTRY",
      price: activeStrategy.entryMin,
      color: "#f0b90b",
      glowColor: "rgba(240,185,11,0.3)",
    });
  }

  // Stop Loss (red)
  levels.push({
    label: "SL",
    price: activeStrategy.stopLoss,
    color: "#ef5350",
    glowColor: "rgba(239,83,80,0.4)",
  });

  // Sort by price descending (highest price at top)
  levels.sort((a, b) => b.price - a.price);

  // Compute evenly-spaced vertical positions across the overlay height.
  // We use percentage positions so the tags spread evenly regardless of
  // how many levels exist, avoiding overlap.
  const tagSpacing = levels.length <= 1 ? 0 : 100 / (levels.length + 1);

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-2 top-8 bottom-8 z-20 w-40 transition-all duration-300 ease-out",
        showLines
          ? "translate-x-0 opacity-100"
          : "translate-x-4 opacity-0",
      )}
    >
      {levels.map((level, idx) => (
        <PriceTag
          key={`${level.label}-${level.price}`}
          label={level.label}
          price={level.price}
          color={level.color}
          glowColor={level.glowColor}
          top={`${tagSpacing * (idx + 1)}%`}
        />
      ))}
    </div>
  );
}
