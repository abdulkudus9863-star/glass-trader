import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { sanitizeCandles, type KlinesState } from "@/hooks/use-klines";
import {
  type Candle,
  findSymbol,
  fetchKlines,
  getTimeframe,
  type TimeframeId,
} from "@/lib/market";
import {
  analyzeDeeepr,
  type DataStatus,
  type DeeeprTradeAnalysis,
} from "@/lib/deeepr";

/* ============================================================================
   DEEEPR data assembly hook.

   Single source of truth: the primary-timeframe candles come from the same
   `useKlines` stream the chart renders, and the higher-timeframe history is
   fetched from the same providers (Binance REST for crypto, Twelve Data via
   the backend for everything else) and cached for the refresh window. The
   deterministic engine then runs over that tape — it never sees fabricated
   data, and it returns INSUFFICIENT DATA when the feed is stale or gapped.
   ========================================================================== */

const MTF_PRIORITY = ["1D", "4H", "1H", "15M", "5M", "1M"];
const CACHE_TTL_MS = 90_000;
const REFRESH_MS = 90_000;

/** Map an app timeframe id ("5m", "1H") to the canonical MTF key ("5M"). */
function canonicalTf(tf: string): string {
  return tf.replace(/m$/, "M");
}

/** Map a canonical MTF key back to an app timeframe id. */
function appTf(canonical: string): TimeframeId {
  return (canonical === "1M" || canonical === "5M" || canonical === "15M"
    ? canonical.toLowerCase()
    : canonical) as TimeframeId;
}

/** Higher timeframes strictly above the primary, in priority order. */
function higherTfs(timeframe: string): TimeframeId[] {
  const primary = canonicalTf(timeframe);
  const idx = MTF_PRIORITY.indexOf(primary);
  if (idx < 0) return [];
  return MTF_PRIORITY.slice(0, idx).map(appTf);
}

const cache = new Map<string, { at: number; candles: Candle[] }>();

export interface UseDeeeprResult {
  analysis: DeeeprTradeAnalysis | null;
  loading: boolean;
  error: string | null;
  /** Honest spec data status for the primary feed. */
  dataStatus: DataStatus;
  ageSeconds: number | null;
  gap: boolean;
  candleCount: number;
}

export function useDeeepr(
  symbolId: string,
  timeframe: TimeframeId,
  live: KlinesState,
  opts?: { price?: number | null; change24h?: number | null },
): UseDeeeprResult {
  const sym = useMemo(() => findSymbol(symbolId), [symbolId]);
  const klinesAction = useAction(api.market.klines);
  const [mtfCandles, setMtfCandles] = useState<Record<string, Candle[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const targetTfs = useMemo(() => higherTfs(timeframe), [timeframe]);
  const targetKey = targetTfs.join(",");

  useEffect(() => {
    if (!sym || targetTfs.length === 0) {
      setMtfCandles({});
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      const results: Record<string, Candle[]> = {};
      for (const tf of targetTfs) {
        const cacheKey = `${symbolId}:${tf}`;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
          results[tf] = cached.candles;
          continue;
        }
        let raw: Candle[] | null = null;
        try {
          if (sym.binance) {
            raw = await fetchKlines(sym.binance, getTimeframe(tf).ms, 300);
          } else {
            const res = await klinesAction({
              symbolId: sym.id,
              timeframeId: tf,
              limit: 300,
            });
            raw = res?.candles ?? null;
          }
        } catch {
          raw = null;
        }
        const clean = raw ? sanitizeCandles(raw) : [];
        if (clean.length >= 30) {
          cache.set(cacheKey, { at: Date.now(), candles: clean });
          results[tf] = clean;
        }
      }
      if (cancelled) return;
      setMtfCandles(results);
      setFetchError(null);
      setLoading(false);
    };

    void loadAll();
    const iv = setInterval(() => void loadAll(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolId, sym?.binance, sym?.id, klinesAction, targetKey]);

  const dataStatus: DataStatus =
    live.status === "ERROR"
      ? "UNAVAILABLE"
      : live.freshness === "LIVE"
        ? "LIVE"
        : live.freshness === "DELAYED"
          ? "DELAYED"
          : "STALE";

  const analysis = useMemo(() => {
    const primary = live.candles;
    if (primary.length < 30) return null;
    const lastClose = primary[primary.length - 1]?.close;
    const price =
      opts?.price != null && Number.isFinite(opts.price)
        ? opts.price
        : lastClose;
    if (price == null || !Number.isFinite(price) || price <= 0) return null;
    if (!sym) return null;
    return analyzeDeeepr({
      symbolId,
      timeframe,
      decimals: sym.decimals,
      assetName: sym.name,
      candlesByTf: mtfCandles,
      primaryCandles: primary,
      price,
      change24h: opts?.change24h ?? null,
      dataStatus,
      ageSeconds: live.ageSeconds,
      gap: live.gap,
      missingCandles: live.missingCandles,
      candleCount: primary.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    live.candles,
    live.freshness,
    live.ageSeconds,
    live.gap,
    live.missingCandles,
    mtfCandles,
    symbolId,
    timeframe,
    sym?.decimals,
    sym?.name,
    opts?.price,
    opts?.change24h,
  ]);

  return {
    analysis,
    loading,
    error: fetchError,
    dataStatus,
    ageSeconds: live.ageSeconds,
    gap: live.gap,
    candleCount: live.candles.length,
  };
}
