import type { UTCTimestamp } from "lightweight-charts";

/* ============================================================================
   Market data layer for the terminal.
   - Multi-asset symbol catalog (crypto / forex / metals / indices / stocks)
   - Binance REST klines for crypto; Twelve Data via the backend for others.
   - Deterministic indicator math shared by the chart, radar and SMC engines.
   No synthetic candles are ever generated — when a feed is unavailable the
   hooks surface honest CONNECTING / STALE / ERROR states instead.
   ========================================================================== */

export type MarketType =
  | "crypto"
  | "forex"
  | "metals"
  | "indices"
  | "stocks";

export interface Candle {
  time: number; // epoch seconds (UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSymbol {
  id: string; // display symbol, e.g. "BTCUSDT"
  name: string; // human readable base name
  market: MarketType;
  exchange: string;
  binance?: string; // symbol on Binance when the market is tradable there
  decimals: number; // price precision
}

export const SYMBOLS: MarketSymbol[] = [
  { id: "BTCUSDT", name: "Bitcoin", market: "crypto", exchange: "Binance", binance: "BTCUSDT", decimals: 2 },
  { id: "BTCUSD", name: "Bitcoin / US Dollar", market: "crypto", exchange: "Binance", binance: "BTCUSDT", decimals: 2 },
  { id: "ETHUSDT", name: "Ethereum", market: "crypto", exchange: "Binance", binance: "ETHUSDT", decimals: 2 },
  { id: "SOLUSDT", name: "Solana", market: "crypto", exchange: "Binance", binance: "SOLUSDT", decimals: 2 },
  { id: "BNBUSDT", name: "BNB", market: "crypto", exchange: "Binance", binance: "BNBUSDT", decimals: 2 },
  { id: "XRPUSDT", name: "XRP", market: "crypto", exchange: "Binance", binance: "XRPUSDT", decimals: 4 },
  { id: "DOGEUSDT", name: "Dogecoin", market: "crypto", exchange: "Binance", binance: "DOGEUSDT", decimals: 5 },
  { id: "EURUSD", name: "Euro / US Dollar", market: "forex", exchange: "OANDA", decimals: 5 },
  { id: "GBPUSD", name: "British Pound / USD", market: "forex", exchange: "OANDA", decimals: 5 },
  { id: "USDJPY", name: "US Dollar / Yen", market: "forex", exchange: "OANDA", decimals: 3 },
  { id: "XAUUSD", name: "Gold", market: "metals", exchange: "OANDA", decimals: 2 },
  { id: "XAGUSD", name: "Silver", market: "metals", exchange: "OANDA", decimals: 3 },
  { id: "SPX500", name: "S&P 500", market: "indices", exchange: "S&P", decimals: 2 },
  { id: "NAS100", name: "Nasdaq 100", market: "indices", exchange: "NASDAQ", decimals: 1 },
  { id: "US30", name: "Dow Jones 30", market: "indices", exchange: "DJIA", decimals: 1 },
  { id: "DXY", name: "US Dollar Index", market: "indices", exchange: "ICE", decimals: 2 },
  { id: "AAPL", name: "Apple Inc.", market: "stocks", exchange: "NASDAQ", decimals: 2 },
  { id: "TSLA", name: "Tesla Inc.", market: "stocks", exchange: "NASDAQ", decimals: 2 },
  { id: "NVDA", name: "NVIDIA Corp.", market: "stocks", exchange: "NASDAQ", decimals: 2 },
];

export function findSymbol(id: string): MarketSymbol | undefined {
  return SYMBOLS.find((s) => s.id === id) ?? SYMBOLS[0];
}

export const TIMEFRAMES = [
  { id: "1m", label: "1m", ms: 60_000, tv: "1" },
  { id: "5m", label: "5m", ms: 300_000, tv: "5" },
  { id: "15m", label: "15m", ms: 900_000, tv: "15" },
  { id: "1H", label: "1H", ms: 3_600_000, tv: "60" },
  { id: "4H", label: "4H", ms: 14_400_000, tv: "240" },
  { id: "1D", label: "1D", ms: 86_400_000, tv: "D" },
  { id: "1W", label: "1W", ms: 604_800_000, tv: "W" },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

export function getTimeframe(id: TimeframeId) {
  return TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES[3];
}

/* ----------------------------- formatting ------------------------------ */

export function formatPrice(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatTime(epochSeconds: number, intraday: boolean): string {
  const d = new Date(epochSeconds * 1000);
  return intraday
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* --------------------------- Binance klines ---------------------------- */

const BINANCE_KLINE_URL = "https://api.binance.com/api/v3/klines";

export async function fetchKlines(
  binanceSymbol: string,
  tfMs: number,
  limit: number,
): Promise<Candle[] | null> {
  const binanceInterval =
    tfMs >= 604_800_000 ? "1w" : tfMs >= 86_400_000 ? "1d" : `${tfMs / 60_000}m`;
  const url = `${BINANCE_KLINE_URL}?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[][];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000) as UTCTimestamp,
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
  } catch {
    return null;
  }
}

export async function fetchTicker24h(
  binanceSymbols: string[],
): Promise<Map<string, { price: number; change24h: number; high: number; low: number }> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
        JSON.stringify(binanceSymbols),
      )}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const rows = (await res.json()) as {
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
    }[];
    const map = new Map();
    for (const row of rows) {
      map.set(row.symbol, {
        price: Number(row.lastPrice),
        change24h: Number(row.priceChangePercent),
        high: Number(row.highPrice),
        low: Number(row.lowPrice),
      });
    }
    return map;
  } catch {
    return null;
  }
}

/* ------------------------ Binance futures (flow) ------------------------ */

export interface BinanceFuturesData {
  /** Open interest in USD notional (base qty × mark price). */
  openInterest: number;
  fundingRate: number | null;
  longShortRatio: number | null;
  markPrice: number | null;
}

/**
 * Public Binance USD-M futures endpoints: open interest, funding rate and
 * the top-trader long/short account ratio. No API key required.
 */
export async function fetchBinanceFutures(
  binanceSymbol: string,
): Promise<BinanceFuturesData | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const base = "https://fapi.binance.com";
    const [oiRes, idxRes, ratioRes] = await Promise.all([
      fetch(`${base}/fapi/v1/openInterest?symbol=${binanceSymbol}`, {
        signal: controller.signal,
      }),
      fetch(`${base}/fapi/v1/premiumIndex?symbol=${binanceSymbol}`, {
        signal: controller.signal,
      }),
      fetch(
        `${base}/futures/data/topLongShortAccountRatio?symbol=${binanceSymbol}&period=5m&limit=1`,
        { signal: controller.signal },
      ),
    ]);
    clearTimeout(timer);
    if (!oiRes.ok) return null;
    const oi = (await oiRes.json()) as { openInterest: string };
    let fundingRate: number | null = null;
    let markPrice: number | null = null;
    if (idxRes.ok) {
      const idx = (await idxRes.json()) as {
        lastFundingRate: string;
        markPrice: string;
      };
      fundingRate = Number(idx.lastFundingRate);
      markPrice = Number(idx.markPrice);
    }
    let longShortRatio: number | null = null;
    if (ratioRes.ok) {
      const rows = (await ratioRes.json()) as { longShortRatio: string }[];
      longShortRatio =
        rows.length > 0 ? Number(rows[rows.length - 1].longShortRatio) : null;
    }
    const oiUsd =
      markPrice != null && Number.isFinite(markPrice)
        ? Number(oi.openInterest) * markPrice
        : Number(oi.openInterest);
    return {
      openInterest: Number.isFinite(oiUsd) ? oiUsd : 0,
      fundingRate: Number.isFinite(fundingRate) ? fundingRate : null,
      markPrice: Number.isFinite(markPrice) ? markPrice : null,
      longShortRatio: Number.isFinite(longShortRatio) ? longShortRatio : null,
    };
  } catch {
    return null;
  }
}

/* ============================================================================
   Indicator math (all operate on close arrays; volume/typical for VWAP)
   ========================================================================== */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    prev = prev === null ? values[i] : values[i] * k + prev * (1 - k);
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

export function stddev(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    const mean = sum / period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / period);
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null,
  );
  const valid = macdLine.filter((v): v is number => v !== null);
  const signalLineRaw = ema(valid, signalPeriod);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  const histogram: (number | null)[] = new Array(values.length).fill(null);
  let vi = 0;
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] !== null) {
      signal[i] = signalLineRaw[vi] ?? null;
      if (signal[i] !== null)
        histogram[i] = (macdLine[i] as number) - (signal[i] as number);
      vi++;
    }
  }
  return { macd: macdLine, signal, histogram };
}

export function vwap(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += tp * candles[i].volume;
    cumV += candles[i].volume;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevClose = candles[0] ? (candles[0].open + candles[0].close) / 2 : 0;
  for (const c of candles) {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = out.length === 0 ? (c.open + c.close) / 2 : (out[out.length - 1].open + out[out.length - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({ ...c, open: haOpen, high: haHigh, low: haLow, close: haClose });
    prevClose = haClose;
  }
  return out;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let prevClose = candles[0]?.close ?? 0;
  let prevAtr = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
    prevClose = c.close;
    if (i < period) {
      prevAtr += tr / period;
      if (i === period - 1) out[i] = prevAtr;
    } else {
      prevAtr = (prevAtr * (period - 1) + tr) / period;
      out[i] = prevAtr;
    }
  }
  return out;
}

export interface FvgZone {
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  bullish: boolean;
}

/** Detect the most recent fair value gaps (3-candle imbalances). */
export function detectFVG(candles: Candle[], maxZones = 4): FvgZone[] {
  const zones: FvgZone[] = [];
  for (let i = candles.length - 3; i >= 1; i--) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    if (!prev || !next) continue;
    const bullish = next.low > prev.high;
    const bearish = next.high < prev.low;
    if (bullish || bearish) {
      zones.push({
        startIndex: i - 1,
        endIndex: i + 1,
        top: bullish ? next.low : prev.high,
        bottom: bullish ? prev.high : next.low,
        bullish,
      });
      if (zones.length >= maxZones) break;
    }
  }
  return zones;
}

/** Convert an array of candles into sparkline points for SVG rendering. */
export function sparkPoints(candles: Candle[], width = 100, height = 32): string {
  if (candles.length === 0) return "";
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const span = max - min || 1;
  return candles
    .map((c, i) => {
      const x = (i / (candles.length - 1)) * width;
      const y = height - ((c.close - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
