import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

/* Shared script loader — only ever inject tv.js once, even across panes. */
export let tvState: "none" | "loading" | "loaded" | "failed" = "none";
const tvReadyListeners = new Set<() => void>();

export function ensureTvScript(onReady: () => void): () => void {
  if (tvState === "loaded") {
    onReady();
    return () => {};
  }
  if (tvState === "failed") return () => {};
  const ok = () => {
    tvState = "loaded";
    tvReadyListeners.forEach((l) => l());
  };
  tvReadyListeners.add(ok);
  if (tvState === "none") {
    tvState = "loading";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = ok;
    script.onerror = () => {
      tvState = "failed";
    };
    document.head.appendChild(script);
  }
  return () => {
    tvReadyListeners.delete(ok);
  };
}

interface TradingViewWidgetProps {
  paneId: string;
  tvSymbol: string;
  interval: string; // TV interval code, e.g. "60", "D"
  style: number; // 0 = bar, 1 = candles, 2 = line
  studies: string[];
}

export default function TradingViewWidget({
  paneId,
  tvSymbol,
  interval,
  style,
  studies,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.TradingView) return;
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    new window.TradingView.widget({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style,
      locale: "en",
      toolbar_bg: "#131722",
      enable_publishing: false,
      allow_symbol_change: true,
      container_id: el.id,
      studies,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: false,
      details: false,
      hotlist: false,
      calendar: false,
    });
  }, [paneId, tvSymbol, interval, style, studies]);

  return (
    <div
      id={`tv-widget-${paneId}`}
      ref={containerRef}
      className="h-full w-full min-h-0"
    />
  );
}
