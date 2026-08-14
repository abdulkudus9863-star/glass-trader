"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Real multi-asset live market data.
 *
 * These actions proxy the Twelve Data REST API from the Convex backend
 * (which hides the API key and avoids browser CORS). Configure
 * `TWELVEDATA_API_KEY` in the deployment environment. When the key is
 * missing or a call fails they return null and the client falls back to
 * Binance (crypto) and then the synthetic generator, so the terminal never
 * goes blank.
 */

const TD_BASE = "https://api.twelvedata.com";

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
};

const TD_INTERVAL: Record<string, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1H": "1h",
  "4H": "4h",
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
  change24h: number;
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
        return {
          price,
          change24h: Number(r.percent_change) || 0,
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
