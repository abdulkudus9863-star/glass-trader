import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView?: any;
  }
}

interface TradingViewWidgetProps {
  /** TradingView symbol, e.g. "BTCUSDT" or "BINANCE:BTCUSDT" */
  symbol?: string;
  /** TradingView interval code, e.g. "1", "5", "15", "60", "D", "W" */
  timeframe?: string;
}

/**
 * Official TradingView Advanced Charting Widget.
 * Self-contained: loads tv.js once, cleans up on unmount, re-inits on prop change.
 * Drawing toolbar and side indicators are visible by default.
 */
export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  symbol = 'BTCUSDT',
  timeframe = '15',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous iframe elements to avoid duplicate/freezing charts
    container.innerHTML = '';

    // Create unique ID for the chart container div
    const chartId = `tv_chart_${Math.random().toString(36).substring(7)}`;
    const widgetDiv = document.createElement('div');
    widgetDiv.id = chartId;
    widgetDiv.style.width = '100%';
    widgetDiv.style.height = '100%';
    container.appendChild(widgetDiv);

    // Format symbol (defaults to Binance feed if prefix is missing)
    const formattedSymbol = symbol.includes(':') ? symbol : `BINANCE:${symbol}`;

    // Initialize the TradingView Widget instance
    const initWidget = () => {
      if (window.TradingView && widgetDiv) {
        new window.TradingView.widget({
          autosize: true,
          symbol: formattedSymbol,
          interval: timeframe,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1', // 1 = Candlestick chart
          locale: 'en',
          toolbar_bg: '#131722',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false, // Keeps drawing tools visible on the left
          container_id: chartId,
        });
      }
    };

    // Load TradingView script if not already present on window
    if (window.TradingView) {
      initWidget();
    } else {
      const existingScript = document.getElementById('tradingview-tv-js');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'tradingview-tv-js';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = initWidget;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initWidget);
      }
    }

    // Cleanup on component unmount or prop change
    return () => {
      container.innerHTML = '';
    };
  }, [symbol, timeframe]);

  return (
    <div className="relative h-full w-full bg-[#131722]">
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden"
      />
    </div>
  );
};

export default TradingViewWidget;
