import { useEffect, useMemo, useRef, useState } from "react";
import type { KlinesState } from "@/hooks/use-klines";
import { findSymbol } from "@/lib/market";
import {
  subscribeBinanceAggTrades,
  subscribeBinanceDepth,
  type BinanceAggTrade,
  type BinanceDepthUpdate,
} from "@/lib/realtime";
import {
  analyzeLiquidity,
  analyzeOrderFlow,
  computeDataQuality,
  computeVolumeProfile,
  type CvdBucket,
  type DataQualityScore,
  type LiquidityAnalysis,
  type LiquidityWall,
  type OrderBookSnapshot,
  type OrderFlowAnalysis,
  type Trade,
  type VolumeProfile,
} from "@/lib/orderbook";
import {
  computeDeeeprIq,
  type DeeeprIqResult,
} from "@/lib/deeepr-iq";
import type { DeeeprTradeAnalysis } from "@/lib/deeepr";

/* ============================================================================
   DEEEPR IQ data assembly hook.

   Real depth (`@depth20@100ms`) + real trade prints (`@aggTrade`) stream in
   from Binance for crypto symbols and are fed — together with the same
   candle tape the chart renders and the deterministic Trade AI analysis —
   into the DEEEPR IQ confluence engine. For non-crypto symbols the depth /
   trade streams simply don't exist, so liquidity + order flow report
   honestly as UNAVAILABLE and the IQ scores without them (and the UI must
   show "LIQUIDITY DATA UNAVAILABLE", never an invented book).
   ========================================================================== */

export type FeedStatus = "LIVE" | "CONNECTING" | "UNAVAILABLE";

export interface UseDeeeprIqResult {
  /** Deterministic IQ result — null only while analysis is unavailable. */
  iq: DeeeprIqResult | null;
  liquidity: LiquidityAnalysis | null;
  orderFlow: OrderFlowAnalysis | null;
  volumeProfile: VolumeProfile | null;
  dataQuality: DataQualityScore;
  liquidityStatus: FeedStatus;
  orderFlowStatus: FeedStatus;
}

const TRADE_WINDOW_MS = 300_000; // order flow window (5 min)
const MAX_TRADES = 2000;
const MAX_CVD_BUCKETS = 120;

export function useDeeeprIq(
  symbolId: string,
  intervalId: string,
  live: KlinesState,
  analysis: DeeeprTradeAnalysis | null,
  opts?: { price?: number | null },
): UseDeeeprIqResult {
  const sym = useMemo(() => findSymbol(symbolId), [symbolId]);
  const [liquidityAnalysis, setLiquidityAnalysis] = useState<LiquidityAnalysis | null>(null);
  const [tradeVersion, setTradeVersion] = useState(0);
  const [liquidityStatus, setLiquidityStatus] = useState<FeedStatus>("CONNECTING");
  const [orderFlowStatus, setOrderFlowStatus] = useState<FeedStatus>("CONNECTING");
  const [now, setNow] = useState(() => Date.now());

  /* refs mutated by the socket handlers (hot path — never setState per tick) */
  const wallsRef = useRef<LiquidityWall[]>([]);
  const tradesRef = useRef<Trade[]>([]);
  const cvdRef = useRef(0);
  const cvdBucketsRef = useRef<CvdBucket[]>([]);
  const lastDepthEmitRef = useRef(0);
  const lastTradeEmitRef = useRef(0);
  const priceRef = useRef<number | null>(null);
  const contextRef = useRef<{ swingHigh: number | null; swingLow: number | null; sessionHigh: number | null; sessionLow: number | null }>({
    swingHigh: null,
    swingLow: null,
    sessionHigh: null,
    sessionLow: null,
  });

  /* keep the latest price + structural context fresh for the handlers */
  const lastClose = live.candles[live.candles.length - 1]?.close ?? null;
  priceRef.current = opts?.price != null && Number.isFinite(opts.price) ? opts.price : lastClose;
  contextRef.current = {
    swingHigh: analysis?.primary?.swingHigh ?? null,
    swingLow: analysis?.primary?.swingLow ?? null,
    sessionHigh: analysis?.primary?.swingHigh ?? null,
    sessionLow: analysis?.primary?.swingLow ?? null,
  };

  /* ticking clock so freshness ages honestly without new market data */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* depth + trade stream subscriptions (crypto only) */
  useEffect(() => {
    if (!sym?.binance) {
      setLiquidityAnalysis(null);
      setLiquidityStatus("UNAVAILABLE");
      setOrderFlowStatus("UNAVAILABLE");
      return;
    }
    wallsRef.current = [];
    tradesRef.current = [];
    cvdRef.current = 0;
    cvdBucketsRef.current = [];
    setLiquidityAnalysis(null);
    setLiquidityStatus("CONNECTING");
    setOrderFlowStatus("CONNECTING");

    let disposed = false;
    const unsubDepth = subscribeBinanceDepth(sym.binance, (d: BinanceDepthUpdate) => {
      if (disposed) return;
      const snapshot: OrderBookSnapshot = {
        bids: d.bids,
        asks: d.asks,
        receivedAt: d.receivedAt,
      };
      const price = priceRef.current ?? d.asks[0]?.price ?? d.bids[0]?.price;
      if (price == null || !Number.isFinite(price) || price <= 0) return;
      const result = analyzeLiquidity(snapshot, {
        prevWalls: wallsRef.current,
        price,
        context: contextRef.current,
        now: Date.now(),
      });
      wallsRef.current = result.walls; /* every frame — persistence tracking */
      /* throttle UI emissions to ~1.3 Hz — the panel/overlay don't need 10 Hz */
      const nowMs = Date.now();
      if (nowMs - lastDepthEmitRef.current >= 750) {
        lastDepthEmitRef.current = nowMs;
        setLiquidityAnalysis(result);
        setLiquidityStatus("LIVE");
      }
    });

    const unsubTrades = subscribeBinanceAggTrades(sym.binance, (t: BinanceAggTrade) => {
      if (disposed) return;
      tradesRef.current.push({
        price: t.price,
        qty: t.qty,
        isBuyerMaker: t.isBuyerMaker,
        time: t.receivedAt,
      });
      if (tradesRef.current.length > MAX_TRADES) {
        tradesRef.current = tradesRef.current.slice(-MAX_TRADES);
      }
      cvdRef.current += t.isBuyerMaker ? -t.qty : t.qty;
      const bucketStart = Math.floor(t.receivedAt / 60_000) * 60_000;
      const buckets = cvdBucketsRef.current;
      const last = buckets[buckets.length - 1];
      if (!last || last.time !== bucketStart) {
        buckets.push({ time: bucketStart, cvd: cvdRef.current });
      } else {
        last.cvd = cvdRef.current;
      }
      if (buckets.length > MAX_CVD_BUCKETS) {
        cvdBucketsRef.current = buckets.slice(-MAX_CVD_BUCKETS);
      }
      /* throttle UI emissions to ~2 Hz — order flow is a rolling window */
      const nowMs = Date.now();
      if (nowMs - lastTradeEmitRef.current >= 500) {
        lastTradeEmitRef.current = nowMs;
        setOrderFlowStatus("LIVE");
        setTradeVersion((v) => v + 1);
      }
    });

    return () => {
      disposed = true;
      unsubDepth();
      unsubTrades();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym?.binance, symbolId]);

  /* order flow — recomputed from the refs whenever trades arrive or candles change */
  const orderFlow = useMemo<OrderFlowAnalysis>(() => {
    if (!sym?.binance) {
      return {
        available: false,
        windowMs: TRADE_WINDOW_MS,
        buyVolume: 0,
        sellVolume: 0,
        delta: 0,
        deltaPct: null,
        tradeCount: 0,
        avgTradeSize: 0,
        largeTradeCount: 0,
        largeTradeNotional: 0,
        aggressiveBuying: false,
        aggressiveSelling: false,
        dominance: "BALANCED",
        cvd: 0,
        cvdTrend: "FLAT",
        volumeAnomaly: null,
      };
    }
    const price = priceRef.current ?? lastClose ?? 0;
    const baselineVolumes = live.candles.slice(-20).map((c) => c.volume);
    return analyzeOrderFlow(tradesRef.current, price, {
      baselineVolumes,
      cvdHistory: cvdBucketsRef.current,
      windowMs: TRADE_WINDOW_MS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeVersion, sym?.binance, lastClose, live.candles]);

  /* volume profile — from the same candle tape the chart renders */
  const volumeProfile = useMemo<VolumeProfile>(
    () => computeVolumeProfile(live.candles),
    [live.candles],
  );

  /* data quality — honest 0–100 from feed health + tick freshness +
     candle continuity + order-book freshness */
  const dataQuality = useMemo<DataQualityScore>(() => {
    const lastTime = live.candles[live.candles.length - 1]?.time;
    const lastCandleAgeSeconds =
      lastTime == null ? null : Math.max(0, Math.round(now / 1000 - lastTime));
    return computeDataQuality({
      liveStatus: live.status,
      freshness: live.freshness,
      ageSeconds: live.ageSeconds,
      gap: live.gap,
      candleCount: live.candleCount,
      lastCandleAgeSeconds,
      orderBookFreshnessMs: liquidityAnalysis?.freshnessMs ?? null,
      volumeAvailable: live.candles.every((c) => Number.isFinite(c.volume)),
    });
  }, [live.status, live.freshness, live.ageSeconds, live.gap, live.candleCount, live.candles, liquidityAnalysis?.freshnessMs, now]);

  /* the IQ confluence engine */
  const iq = useMemo<DeeeprIqResult | null>(() => {
    if (!analysis) return null;
    const lastTime = live.candles[live.candles.length - 1]?.time;
    const lastCandleAgeSeconds =
      lastTime == null ? null : Math.max(0, Math.round(now / 1000 - lastTime));
    return computeDeeeprIq({
      symbolId,
      timeframe: intervalId,
      decimals: sym?.decimals ?? 2,
      analysis,
      liquidity: liquidityAnalysis,
      orderFlow,
      volumeProfile,
      dataQuality,
      lastCandleAgeSeconds,
      gap: live.gap,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, liquidityAnalysis, orderFlow, volumeProfile, dataQuality, live.candles, live.gap, now, symbolId, intervalId, sym?.decimals]);

  return {
    iq,
    liquidity: liquidityAnalysis,
    orderFlow,
    volumeProfile,
    dataQuality,
    liquidityStatus,
    orderFlowStatus,
  };
}
