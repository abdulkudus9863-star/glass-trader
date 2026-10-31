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

/* ============================================================================
   Symbol & timeframe normalization.

   The frontend always speaks ONE canonical symbol id (e.g. "BTCUSDT") and one
   canonical timeframe id (e.g. "1H"). Every provider adapter converts to its
   own exact supported format — never the reverse. If a provider doesn't
   support a symbol/timeframe the adapter must return null so the caller can
   surface SYMBOL_NOT_SUPPORTED / TIMEFRAME_NOT_SUPPORTED instead of sending
   a broken request.
   ========================================================================== */

/** Canonicalize a user-entered symbol into our internal id ("btc-usdt" → "BTCUSDT"). */
export function normalizeSymbol(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Resolve the provider-specific symbol for a market. Our canonical id is
 * always used at the app layer; this returns the exact string the provider
 * accepts (e.g. "BTCUSDT" on Binance, "XAU/USD" on Twelve Data).
 */
export function resolveProviderSymbol(
  sym: MarketSymbol,
  provider: "binance" | "twelvedata",
): string | null {
  if (provider === "binance") return sym.binance ?? null;
  switch (sym.id) {
    case "XAUUSD": return "XAU/USD";
    case "XAGUSD": return "XAG/USD";
    case "EURUSD": return "EUR/USD";
    case "GBPUSD": return "GBP/USD";
    case "USDJPY": return "USD/JPY";
    case "BTCUSDT": return "BTC/USD";
    case "ETHUSDT": return "ETH/USD";
    case "SOLUSDT": return "SOL/USD";
    case "DXY": return "DXY";
    case "SPX500": return "S&P 500";
    case "NAS100": return "NDX";
    case "US30": return "DJI";
    case "AAPL": return "AAPL";
    case "TSLA": return "TSLA";
    case "NVDA": return "NVDA";
    default: return null;
  }
}

/** Map a timeframe id to the Binance kline interval string (exact, never guessed). */
export function resolveBinanceInterval(tfMs: number): string | null {
  switch (tfMs) {
    case 60_000: return "1m";
    case 180_000: return "3m";
    case 300_000: return "5m";
    case 900_000: return "15m";
    case 1_800_000: return "30m";
    case 3_600_000: return "1h";
    case 14_400_000: return "4h";
    case 43_200_000: return "12h";
    case 86_400_000: return "1d";
    case 604_800_000: return "1w";
    default: return null;
  }
}

/* ------------------------- strict market error codes ------------------------ */

export type MarketErrorCode =
  | "SYMBOL_NOT_SUPPORTED"
  | "TIMEFRAME_NOT_SUPPORTED"
  | "PROVIDER_ERROR"
  | "API_ERROR"
  | "HTTP_ERROR"
  | "EMPTY_RESPONSE"
  | "INVALID_RESPONSE"
  | "INVALID_CANDLE"
  | "TIMESTAMP_ERROR"
  | "DATA_GAP"
  | "WEBSOCKET_ERROR"
  | "STALE_DATA"
  | "INSUFFICIENT_DATA"
  | "CHART_ERROR";

export interface MarketError {
  code: MarketErrorCode;
  message: string;
}

/**
 * Normalized market-data contract. Every field is real or explicitly null
 * — nothing is ever coerced to a fake 0.
 */
export interface MarketCandle extends Candle {
  /** FORMING = the live bucket being built by the stream; CLOSED = immutable history. */
  status: "FORMING" | "CLOSED";
}

export interface KlinesResult {
  ok: boolean;
  /** Canonical app symbol id (e.g. "BTCUSDT"). */
  symbol: string;
  /** Exact provider symbol actually requested (e.g. "BTCUSDT" on Binance). */
  providerSymbol: string;
  /** Canonical timeframe id (e.g. "1H"). */
  timeframe: string;
  source: "binance" | "twelvedata";
  serverTime: number | null;
  candles: Candle[];
  error?: MarketError;
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
  { id: "30m", label: "30m", ms: 1_800_000, tv: "30" },
  { id: "1H", label: "1H", ms: 3_600_000, tv: "60" },
  { id: "4H", label: "4H", ms: 14_400_000, tv: "240" },
  { id: "12H", label: "12H", ms: 43_200_000, tv: "180" },
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

/* ============================================================================
   Strict candle validation (spec §6–§9).

   A candle is rejected when any required field is missing, NaN, Infinity,
   or when the OHLC relationship is inverted. Timestamps are normalized to
   epoch seconds, future timestamps are rejected, candles are deduped by
   (symbol, timeframe, timestamp) keeping the newest valid version, and the
   result is sorted ascending. Nothing invalid ever reaches the chart.
   ========================================================================== */

export function sanitizeCandles(rows: Candle[]): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const seen = new Map<number, Candle>();
  for (const c of rows) {
    const t = Number(c.time);
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const v = Number(c.volume);
    /* §7 — Number(undefined) is NaN; reject instead of defaulting to 0 */
    if (![t, o, h, l, cl].every((n) => Number.isFinite(n))) continue;
    if (!Number.isFinite(v)) continue;
    if (t <= 0) continue; // §8 timestamp must exist
    if (t > now + 3600) continue; // §8 future timestamps are impossible for real data
    /* §6 — inverted OHLC is mathematically impossible for a real market */
    if (h < Math.max(o, cl)) continue;
    if (l > Math.min(o, cl)) continue;
    if (h < l) continue;
    /* §9 — dedupe by timestamp, keep the newest valid version */
    seen.set(t, { time: t, open: o, high: h, low: l, close: cl, volume: v });
  }
  return [...seen.values()].sort((a, b) => a.time - b.time);
}

/**
 * Detect missing timeframe buckets between consecutive candles. A gap is a
 * time difference larger than the timeframe bucket size (allowing the very
 * first candle, which can legitimately start mid-period).
 */
export function detectGaps(candles: Candle[], tfMs: number): { gap: boolean; missing: number } {
  if (candles.length < 2) return { gap: false, missing: 0 };
  let missing = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = (candles[i].time - candles[i - 1].time) * 1000;
    if (diff <= tfMs) continue;
    if (i === 1 && diff <= tfMs * 2.5) continue; // first candle may start mid-period
    missing += Math.round(diff / tfMs) - 1;
  }
  return { gap: missing > 0, missing };
}

/* --------------------------- Binance klines ---------------------------- */

/* Binance documents data-api.binance.vision as the base endpoint for public
   market data; api.binance.com is geo-blocked (HTTP 451) in some regions.
   fetchKlines tries both, in order, before reporting an error. */
const BINANCE_KLINE_BASES = [
  "https://api.binance.com",
  "https://data-api.binance.vision",
];

/**
 * Strictly parse one raw Binance kline row. Every field is converted with
 * Number() and rejected when the conversion yields NaN/Infinity — a failed
 * parse must never become a 0 candle.
 */
function parseBinanceRow(row: unknown, timeframe: string): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const rawTime = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);
  /* §7 — every field incl. volume must be finite; a NaN volume rejects the
     whole row instead of silently becoming a fake 0. */
  if (![rawTime, open, high, low, close, volume].every((v) => Number.isFinite(v))) return null;
  if (rawTime <= 0) return null;
  return {
    time: Math.floor(rawTime / 1000) as UTCTimestamp,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Fetch and validate historical klines from the Binance REST API. Returns a
 * structured `KlinesResult` (never null, never a bare array) so callers can
 * surface exact error codes instead of rendering zeros.
 */
export async function fetchKlines(
  binanceSymbol: string,
  tfMs: number,
  limit: number,
): Promise<KlinesResult> {
  const binanceInterval = resolveBinanceInterval(tfMs);
  if (!binanceInterval) {
    return {
      ok: false,
      symbol: binanceSymbol,
      providerSymbol: binanceSymbol,
      timeframe: `${tfMs / 60_000}m`,
      source: "binance",
      serverTime: null,
      candles: [],
      error: {
        code: "TIMEFRAME_NOT_SUPPORTED",
        message: `Timeframe ${tfMs / 60_000}m is not supported by Binance.`,
      },
    };
  }
  const query = `symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`;
  let lastError: MarketError = {
    code: "PROVIDER_ERROR",
    message: `Binance request for ${binanceSymbol} ${binanceInterval} failed (network/CORS).`,
  };
  for (const base of BINANCE_KLINE_BASES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${base}/api/v3/klines?${query}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastError = {
          code: "HTTP_ERROR",
          message: `Binance returned HTTP ${res.status} for ${binanceSymbol} ${binanceInterval} (${base}).`,
        };
        continue;
      }
      const rows = (await res.json()) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) {
        lastError = {
          code: "EMPTY_RESPONSE",
          message: `Binance returned no candles for ${binanceSymbol} ${binanceInterval} (${base}).`,
        };
        continue;
      }
      const parsed: Candle[] = [];
      for (const row of rows) {
        const c = parseBinanceRow(row, binanceInterval);
        if (c) parsed.push(c);
      }
      const candles = sanitizeCandles(parsed);
      if (candles.length === 0) {
        lastError = {
          code: "INVALID_CANDLE",
          message: `Binance returned ${rows.length} rows for ${binanceSymbol} but none passed OHLCV validation.`,
        };
        continue;
      }
      return {
        ok: true,
        symbol: binanceSymbol,
        providerSymbol: binanceSymbol,
        timeframe: binanceInterval,
        source: "binance",
        serverTime: null,
        candles,
      };
    } catch {
      lastError = {
        code: "PROVIDER_ERROR",
        message: `Binance request for ${binanceSymbol} ${binanceInterval} failed (network/CORS).`,
      };
    }
  }
  return {
    ok: false,
    symbol: binanceSymbol,
    providerSymbol: binanceSymbol,
    timeframe: binanceInterval,
    source: "binance",
    serverTime: null,
    candles: [],
    error: lastError,
  };
}

export async function fetchTicker24h(
  binanceSymbols: string[],
): Promise<Map<string, { price: number; change24h: number; high: number; low: number }> | null> {
  const query = `symbols=${encodeURIComponent(JSON.stringify(binanceSymbols))}`;
  for (const base of BINANCE_KLINE_BASES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${base}/api/v3/ticker/24hr?${query}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
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
      /* try the next base */
    }
  }
  return null;
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
      /* The zone is the UNFILLED GAP between candles 1 and 3: for a bearish
         imbalance that is [candle3.high, candle1.low] — using the outer
         edges (prev.high/next.low) would span the formative candles
         themselves. Verified against fixtures in tests/smc.test.ts. */
      zones.push({
        startIndex: i - 1,
        endIndex: i + 1,
        top: bullish ? next.low : prev.low,
        bottom: bullish ? prev.high : next.high,
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
