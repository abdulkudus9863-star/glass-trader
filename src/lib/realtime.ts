/* ============================================================================
   Realtime market feed — Binance combined WebSocket streams.

   One shared socket carries every subscribed stream (miniTicker for quotes,
   kline for live candles). The socket auto-connects when the first
   subscriber arrives, re-subscribes when symbols are added/removed, and
   reconnects with exponential backoff if the stream drops.

   Connection state is observable (idle / connecting / open / reconnecting)
   and a watchdog force-reconnects a socket that stops delivering frames, so
   callers can always answer honestly: LIVE vs STALE vs RECONNECTING vs
   CONNECTION ERROR. No fabricated ticks are ever injected here.
   ========================================================================== */

export type BinanceSocketStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting";

export interface BinanceMiniTicker {
  symbol: string; // e.g. "BTCUSDT"
  price: number; // last trade price
  open: number; // 24h open
  high: number; // 24h high
  low: number; // 24h low
  volume: number; // 24h base volume
  change24h: number; // percent, derived from open → price
  receivedAt: number; // epoch ms when this frame arrived
}

export interface BinanceKlineUpdate {
  symbol: string;
  time: number; // candle open time, epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  receivedAt: number;
}

/** Real Binance USDT-M futures positioning data (public REST, no key). */
export interface BinanceFuturesData {
  fundingRate: number | null; // per-8h rate, e.g. 0.0001
  openInterest: number | null; // contracts outstanding (base units)
  longShortRatio: number | null; // global long/short account ratio
  buySellRatio: number | null; // taker buy/sell volume ratio
  timestamp: number;
}

type TickerHandler = (ticker: BinanceMiniTicker) => void;
type KlineHandler = (kline: BinanceKlineUpdate) => void;
type StatusHandler = (status: BinanceSocketStatus) => void;

const WS_URL = "wss://stream.binance.com:9443/stream?streams=";

/* --------------------------- shared socket state -------------------------- */

const tickerHandlers = new Map<string, Set<TickerHandler>>();
const klineHandlers = new Map<string, Set<KlineHandler>>();
const statusHandlers = new Set<StatusHandler>();

let socket: WebSocket | null = null;
let socketStreams: string[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let intentionalClose = false;
let socketStatus: BinanceSocketStatus = "idle";
let lastFrameAt = 0;
let watchdog: ReturnType<typeof setInterval> | null = null;

function setStatus(status: BinanceSocketStatus): void {
  if (socketStatus === status) return;
  socketStatus = status;
  for (const cb of statusHandlers) {
    try {
      cb(status);
    } catch {
      // never let one subscriber break the shared socket
    }
  }
}

function streamNames(): string[] {
  const out: string[] = [];
  for (const s of tickerHandlers.keys()) out.push(`${s.toLowerCase()}@miniTicker`);
  for (const s of klineHandlers.keys()) out.push(`${s.toLowerCase()}@kline`);
  return out;
}

function connect(): void {
  if (reconnectTimer || (tickerHandlers.size === 0 && klineHandlers.size === 0)) return;
  const names = streamNames();

  if (
    socket &&
    socket.readyState === WebSocket.OPEN &&
    socketStreams.join("/") === names.join("/")
  ) {
    return;
  }

  if (socket) {
    intentionalClose = true;
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
    socketStreams = [];
  }

  intentionalClose = false;
  socketStreams = names;
  try {
    socket = new WebSocket(`${WS_URL}${names.join("/")}`);
  } catch {
    scheduleReconnect();
    return;
  }
  setStatus(socketStatus === "open" ? "reconnecting" : "connecting");

  socket.onopen = () => {
    reconnectDelay = 1000;
    lastFrameAt = Date.now();
    setStatus("open");
  };

  socket.onmessage = (event: MessageEvent) => {
    lastFrameAt = Date.now();
    try {
      const msg = JSON.parse(event.data as string) as {
        stream?: string;
        data?: {
          e?: string;
          s?: string;
          c?: string;
          o?: string;
          h?: string;
          l?: string;
          v?: string;
          k?: {
            t?: number;
            o?: string;
            h?: string;
            l?: string;
            c?: string;
            v?: string;
            x?: boolean;
          };
        };
      };
      const raw = msg.data;
      const stream = msg.stream ?? "";
      const symbol = raw?.s?.toUpperCase() ?? "";
      if (!raw || !symbol) return;

      if (stream.endsWith("@miniTicker") && raw.c != null) {
        const price = Number(raw.c);
        if (!Number.isFinite(price)) return;
        const open = Number(raw.o) || price;
        const ticker: BinanceMiniTicker = {
          symbol,
          price,
          open,
          high: Number(raw.h) || price,
          low: Number(raw.l) || price,
          volume: Number(raw.v) || 0,
          change24h: open > 0 ? ((price - open) / open) * 100 : 0,
          receivedAt: Date.now(),
        };
        const set = tickerHandlers.get(symbol);
        if (!set) return;
        for (const handler of set) {
          try {
            handler(ticker);
          } catch {
            // never let one subscriber break the shared socket
          }
        }
      } else if (stream.endsWith("@kline") && raw.k) {
        const k = raw.k;
        const open = Number(k.o);
        const close = Number(k.c);
        if (!Number.isFinite(open) || !Number.isFinite(close)) return;
        const kline: BinanceKlineUpdate = {
          symbol,
          time: Math.floor((k.t ?? 0) / 1000),
          open,
          high: Number(k.h) || Math.max(open, close),
          low: Number(k.l) || Math.min(open, close),
          close,
          volume: Number(k.v) || 0,
          isClosed: Boolean(k.x),
          receivedAt: Date.now(),
        };
        const set = klineHandlers.get(symbol);
        if (!set) return;
        for (const handler of set) {
          try {
            handler(kline);
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore malformed frames
    }
  };

  socket.onerror = () => {
    // onclose always follows; reconnect there
  };

  socket.onclose = () => {
    socket = null;
    socketStreams = [];
    if (intentionalClose || (tickerHandlers.size === 0 && klineHandlers.size === 0)) {
      setStatus("idle");
      return;
    }
    setStatus("reconnecting");
    scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    connect();
  }, reconnectDelay);
}

function tearDownSocket(): void {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
    socketStreams = [];
  }
  setStatus("idle");
}

/** Watchdog — if no frame arrives for 45s, force a reconnect. */
function ensureWatchdog(): void {
  if (watchdog) return;
  watchdog = setInterval(() => {
    if (
      socket &&
      socket.readyState === WebSocket.OPEN &&
      lastFrameAt > 0 &&
      Date.now() - lastFrameAt > 45_000
    ) {
      setStatus("reconnecting");
      intentionalClose = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      socket = null;
      socketStreams = [];
      intentionalClose = false;
      scheduleReconnect();
    }
  }, 10_000);
}

function stopWatchdogIfIdle(): void {
  if (tickerHandlers.size === 0 && klineHandlers.size === 0 && watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
}

/* ------------------------------ public API ------------------------------- */

/**
 * Subscribe to live miniTicker updates for one Binance symbol.
 * Returns an unsubscribe function.
 */
export function subscribeBinanceTicker(
  binanceSymbol: string,
  handler: TickerHandler,
): () => void {
  const symbol = binanceSymbol.toUpperCase();
  const set = tickerHandlers.get(symbol) ?? new Set<TickerHandler>();
  set.add(handler);
  tickerHandlers.set(symbol, set);
  ensureWatchdog();
  connect();

  return () => {
    const current = tickerHandlers.get(symbol);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) tickerHandlers.delete(symbol);
    if (tickerHandlers.size === 0 && klineHandlers.size === 0) tearDownSocket();
    stopWatchdogIfIdle();
  };
}

/**
 * Subscribe to the live kline stream for one Binance symbol. The handler
 * receives every update of the *current* candle (real OHLCV) plus the
 * closed-candle event (`isClosed === true`).
 */
export function subscribeBinanceKlines(
  binanceSymbol: string,
  handler: KlineHandler,
): () => void {
  const symbol = binanceSymbol.toUpperCase();
  const set = klineHandlers.get(symbol) ?? new Set<KlineHandler>();
  set.add(handler);
  klineHandlers.set(symbol, set);
  ensureWatchdog();
  connect();

  return () => {
    const current = klineHandlers.get(symbol);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) klineHandlers.delete(symbol);
    if (tickerHandlers.size === 0 && klineHandlers.size === 0) tearDownSocket();
    stopWatchdogIfIdle();
  };
}

/** Current socket-level status (shared across all subscribed symbols). */
export function getBinanceSocketStatus(): BinanceSocketStatus {
  return socketStatus;
}

/** Subscribe to socket-level status changes (open / reconnecting / ...). */
export function subscribeBinanceStatus(handler: StatusHandler): () => void {
  statusHandlers.add(handler);
  return () => {
    statusHandlers.delete(handler);
  };
}

/** Timestamp (ms) of the last frame received on the shared socket. */
export function getLastFrameAt(): number {
  return lastFrameAt;
}

/* --------------------------- futures REST helpers ------------------------- */

const FAPI = "https://fapi.binance.com";

interface FetchOpts {
  timeoutMs?: number;
}

async function fapiJson<T>(path: string, opts: FetchOpts = {}): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await fetch(`${FAPI}${path}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Real funding rate, open interest and long/short ratios for a USDT-M
 * futures symbol (e.g. "BTCUSDT"). Every field is independently nullable —
 * a failed sub-request must not fabricate a value.
 */
export async function fetchBinanceFutures(
  binanceSymbol: string,
): Promise<BinanceFuturesData> {
  const sym = binanceSymbol.toUpperCase();
  const [fundingRes, oiRes, lsRes, takerRes] = await Promise.all([
    fapiJson<{ fundingRate?: string }[]>(
      `/fapi/v1/fundingRate?symbol=${sym}&limit=1`,
    ),
    fapiJson<{ openInterest?: string }>(`/fapi/v1/openInterest?symbol=${sym}`),
    fapiJson<{ longShortRatio?: string }[]>(
      `/futures/data/globalLongShortAccountRatio?symbol=${sym}&period=1h&limit=1`,
    ),
    fapiJson<{ buySellRatio?: string }[]>(
      `/futures/data/takerlongshortRatio?symbol=${sym}&period=1h&limit=1`,
    ),
  ]);

  return {
    fundingRate: fundingRes?.[0]?.fundingRate != null
      ? Number(fundingRes[0].fundingRate) || null
      : null,
    openInterest: oiRes?.openInterest != null
      ? Number(oiRes.openInterest) || null
      : null,
    longShortRatio: lsRes?.[0]?.longShortRatio != null
      ? Number(lsRes[0].longShortRatio) || null
      : null,
    buySellRatio: takerRes?.[0]?.buySellRatio != null
      ? Number(takerRes[0].buySellRatio) || null
      : null,
    timestamp: Date.now(),
  };
}
