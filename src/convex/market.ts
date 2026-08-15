"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

/* ---------------------------------------------------------------------------
   Self-contained market types + helpers for the server proxy.
   The Convex bundler resolves imports relative to src/convex only, so the
   tiny helpers used here are duplicated from src/lib/market.ts rather than
   imported — keep the shapes identical to the frontend contract.
   ------------------------------------------------------------------------- */

export interface Candle {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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

export interface KlinesResult {
  ok: boolean;
  symbol: string;
  providerSymbol: string;
  timeframe: string;
  source: "binance" | "twelvedata";
  serverTime: number | null;
  candles: Candle[];
  error?: MarketError;
}

const TF_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "12H": 43_200_000,
  "1D": 86_400_000,
  "1W": 604_800_000,
};

/** Map timeframe ms to the exact Binance interval string. */
function resolveBinanceInterval(tfMs: number): string | null {
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

/** Strict validation + dedupe + sort — mirrors src/lib/market.ts sanitizeCandles. */
function sanitizeCandles(rows: Candle[]): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const seen = new Map<number, Candle>();
  for (const c of rows) {
    const t = Number(c.time);
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const v = Number(c.volume);
    if (![t, o, h, l, cl].every((n) => Number.isFinite(n))) continue;
    if (!Number.isFinite(v)) continue;
    if (t <= 0) continue;
    if (t > now + 3600) continue;
    if (h < Math.max(o, cl)) continue;
    if (l > Math.min(o, cl)) continue;
    if (h < l) continue;
    seen.set(t, { time: t, open: o, high: h, low: l, close: cl, volume: v });
  }
  return [...seen.values()].sort((a, b) => a.time - b.time);
}

/**
 * Real multi-asset live market data.
 *
 * These actions proxy market-data providers from the Convex backend (which
 * avoids browser CORS / sandbox network blocks and hides API keys). The
 * Binance action needs no key; the Twelve Data action requires
 * `TWELVEDATA_API_KEY` in the deployment environment. When a call fails the
 * action returns a structured `{ ok: false, error: { code, message } }`
 * result — the client shows honest DATA UNAVAILABLE / CONNECTION ERROR
 * states, nothing is fabricated.
 */

const TD_BASE = "https://api.twelvedata.com";
const BINANCE_KLINE_URL = "https://api.binance.com/api/v3/klines";

/* ------------------------- server-side Binance proxy ------------------------ */

/** Map our canonical symbol ids to the exact Binance futures/spot symbols. */
const BINANCE_SYMBOL: Record<string, string> = {
  BTCUSDT: "BTCUSDT",
  BTCUSD: "BTCUSDT",
  ETHUSDT: "ETHUSDT",
  SOLUSDT: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSDT: "XRPUSDT",
  DOGEUSDT: "DOGEUSDT",
};

function parseBinanceRow(row: unknown): Candle | null {
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
    time: Math.floor(rawTime / 1000),
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Real historical Binance klines fetched server-side (no API key). This is
 * the fallback the browser uses when the sandbox blocks direct Binance
 * requests — same provider, same exact symbol (BTCUSDT), same validation.
 */
export const binanceKlines = action({
  args: {
    symbolId: v.string(),
    timeframeId: v.string(),
    limit: v.number(),
  },
  handler: async (_ctx, { symbolId, timeframeId, limit }): Promise<KlinesResult> => {
    const binanceSymbol = BINANCE_SYMBOL[symbolId];
    if (!binanceSymbol) {
      return {
        ok: false,
        symbol: symbolId,
        providerSymbol: symbolId,
        timeframe: timeframeId,
        source: "binance",
        serverTime: null,
        candles: [],
        error: { code: "SYMBOL_NOT_SUPPORTED", message: `${symbolId} is not tradable on Binance.` },
      };
    }
    const interval = resolveBinanceInterval(TF_MS[timeframeId] ?? 3_600_000);
    if (!interval) {
      return {
        ok: false,
        symbol: symbolId,
        providerSymbol: binanceSymbol,
        timeframe: timeframeId,
        source: "binance",
        serverTime: null,
        candles: [],
        error: { code: "TIMEFRAME_NOT_SUPPORTED", message: `Timeframe ${timeframeId} is not supported by Binance.` },
      };
    }
    try {
      const url = `${BINANCE_KLINE_URL}?symbol=${binanceSymbol}&interval=${interval}&limit=${Math.min(Math.max(limit, 50), 1000)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        return {
          ok: false,
          symbol: symbolId,
          providerSymbol: binanceSymbol,
          timeframe: timeframeId,
          source: "binance",
          serverTime: null,
          candles: [],
          error: { code: "HTTP_ERROR", message: `Binance proxy returned HTTP ${res.status} for ${binanceSymbol} ${interval}.` },
        };
      }
      const rows = (await res.json()) as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) {
        return {
          ok: false,
          symbol: symbolId,
          providerSymbol: binanceSymbol,
          timeframe: timeframeId,
          source: "binance",
          serverTime: null,
          candles: [],
          error: { code: "EMPTY_RESPONSE", message: `Binance proxy returned no candles for ${binanceSymbol} ${interval}.` },
        };
      }
      const parsed: Candle[] = [];
      for (const row of rows) {
        const c = parseBinanceRow(row);
        if (c) parsed.push(c);
      }
      const candles = sanitizeCandles(parsed);
      if (candles.length === 0) {
        return {
          ok: false,
          symbol: symbolId,
          providerSymbol: binanceSymbol,
          timeframe: timeframeId,
          source: "binance",
          serverTime: null,
          candles: [],
          error: { code: "INVALID_CANDLE", message: `Binance proxy returned rows that failed OHLCV validation for ${binanceSymbol}.` },
        };
      }
      return {
        ok: true,
        symbol: symbolId,
        providerSymbol: binanceSymbol,
        timeframe: timeframeId,
        source: "binance",
        serverTime: null,
        candles,
      };
    } catch {
      return {
        ok: false,
        symbol: symbolId,
        providerSymbol: binanceSymbol,
        timeframe: timeframeId,
        source: "binance",
        serverTime: null,
        candles: [],
        error: { code: "PROVIDER_ERROR", message: `Binance proxy request for ${binanceSymbol} failed.` },
      };
    }
  },
});

/** Map our symbol ids to Twelve Data instrument codes. */
const TD_SYMBOL: Record<string, string> = {
  XAUUSD: "XAU/USD",
  XAGUSD: "XAG/USD",
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
  BTCUSDT: "BTC/USD",
  ETHUSDT: "ETH/USD",
  SOLUSDT: "SOL/USD",
  DXY: "DXY",
  SPX500: "S&P 500",
  NAS100: "NDX",
  US30: "DJI",
  AAPL: "AAPL",
  TSLA: "TSLA",
  NVDA: "NVDA",
};

const TD_INTERVAL: Record<string, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1H": "1h",
  "4H": "4h",
  "12H": "12h",
  "1D": "1day",
};

export interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface QuoteRow {
  price: number;
  /** null when the provider omitted it — never coerced to a fake 0. */
  change24h: number | null;
  high: number;
  low: number;
}

/** Real OHLC klines for one symbol/timeframe (oldest first). */
export const klines = action({
  args: {
    symbolId: v.string(),
    timeframeId: v.string(),
    limit: v.number(),
  },
  handler: async (_ctx, { symbolId, timeframeId, limit }) => {
    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) return null;
    const symbol = TD_SYMBOL[symbolId];
    const interval = TD_INTERVAL[timeframeId];
    if (!symbol || !interval) return null;
    try {
      const url = `${TD_BASE}/time_series?symbol=${encodeURIComponent(
        symbol,
      )}&interval=${interval}&outputsize=${Math.min(Math.max(limit, 50), 500)}&apikey=${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        status?: string;
        values?: { datetime: string; open: string; high: string; low: string; close: string; volume: string }[];
      };
      if (json.status !== "ok" || !Array.isArray(json.values)) return null;
      const candles: LiveCandle[] = json.values
        .map((row) => {
          const time = Math.floor(new Date(row.datetime).getTime() / 1000);
          return {
            time,
            open: Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            volume: Number(row.volume),
          };
        })
        .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close));
      if (candles.length === 0) return null;
      candles.reverse(); // Twelve Data returns newest first
      return { provider: "twelvedata" as const, candles };
    } catch {
      return null;
    }
  },
});

/** Real 24h quotes for a set of non-crypto symbols, keyed by our symbol id. */
export const ticker = action({
  args: { symbolIds: v.array(v.string()) },
  handler: async (_ctx, { symbolIds }) => {
    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) return null;
    const symbols = symbolIds
      .map((id) => TD_SYMBOL[id])
      .filter((s): s is string => Boolean(s));
    if (symbols.length === 0) return null;
    try {
      const url = `${TD_BASE}/quote?symbol=${encodeURIComponent(
        symbols.join(","),
      )}&apikey=${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        status?: string;
        data?: Record<string, unknown>;
        close?: string;
        percent_change?: string;
        high?: string;
        low?: string;
      };
      if (json.status !== "ok") return null;
      const out: Record<string, QuoteRow> = {};
      const extract = (row: unknown): QuoteRow | null => {
        const r = row as { close?: string; percent_change?: string; high?: string; low?: string };
        const price = Number(r.close);
        if (!Number.isFinite(price)) return null;
        const pct = Number(r.percent_change);
        return {
          price,
          change24h: Number.isFinite(pct) ? pct : null,
          high: Number(r.high) || price,
          low: Number(r.low) || price,
        };
      };
      if (json.data && typeof json.data === "object") {
        for (const [id, sym] of Object.entries(TD_SYMBOL)) {
          const row = extract((json.data as Record<string, unknown>)[sym]);
          if (row) out[id] = row;
        }
      } else {
        const row = extract(json);
        if (row) {
          for (const [id, sym] of Object.entries(TD_SYMBOL)) {
            if (symbols.includes(sym)) out[id] = row;
          }
        }
      }
      return Object.keys(out).length > 0 ? out : null;
    } catch {
      return null;
    }
  },
});

/* ============================ real news feed ============================ */

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
}

const NEWS_SOURCES = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "CoinTelegraph", url: "https://cointelegraph.com/rss" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
];

/** Strip CDATA / tags / entities from an RSS title. */
function cleanTitle(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function parseRss(xml: string): NewsArticle[] {
  const out: NewsArticle[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!title || !link) continue;
    const clean = cleanTitle(title);
    if (clean.length < 12) continue;
    out.push({
      title: clean,
      url: link.trim(),
      source: "rss",
      publishedAt:
        extractTag(block, "pubDate") ?? extractTag(block, "dc:date") ?? null,
    });
  }
  return out;
}

/**
 * Real macro / crypto headlines fetched server-side from public RSS feeds.
 * No API key required, nothing is ever fabricated: if the feeds fail, an
 * empty array is returned and the UI shows "Narrative data unavailable".
 * Deduped by title and filtered to the last 48h where a timestamp exists.
 */
export const news = action({
  args: { limit: v.number() },
  handler: async (_ctx, { limit }) => {
    const collected: (NewsArticle & { source: string })[] = [];
    await Promise.all(
      NEWS_SOURCES.map(async (src) => {
        try {
          const res = await fetch(src.url, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AkAnalyser/1.0)" },
          });
          if (!res.ok) return;
          const xml = await res.text();
          for (const a of parseRss(xml).slice(0, 12)) {
            collected.push({ ...a, source: src.name });
          }
        } catch {
          /* skip this source */
        }
      }),
    );

    const seen = new Set<string>();
    const out: NewsArticle[] = [];
    for (const a of collected) {
      const key = a.title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title: a.title, source: a.source, url: a.url, publishedAt: a.publishedAt });
    }

    const cutoff = Date.now() - 48 * 3600 * 1000;
    const fresh = out.filter((a) => {
      if (!a.publishedAt) return true;
      const t = new Date(a.publishedAt).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });

    return fresh.slice(0, Math.min(Math.max(limit, 5), 25));
  },
});
