/* ============================================================================
   Realtime market feed — Binance combined WebSocket streams.

   One shared socket carries every subscribed symbol (`btcusdt@miniTicker`,
   `ethusdt@miniTicker`, ...). The socket auto-connects when the first
   subscriber arrives, re-subscribes when symbols are added/removed, and
   reconnects with exponential backoff if the stream drops. Crypto symbols
   get a true tick-level feed here; non-crypto symbols keep the backend
   poll + synthetic micro-tick chain in `useKlines` / `useMarketSnapshot`.
   ========================================================================== */

export interface BinanceMiniTicker {
  symbol: string; // e.g. "BTCUSDT"
  price: number; // last trade price
  open: number; // 24h open
  high: number; // 24h high
  low: number; // 24h low
  volume: number; // 24h base volume
  change24h: number; // percent, derived from open → price
}

type Handler = (ticker: BinanceMiniTicker) => void;

const WS_URL = "wss://stream.binance.com:9443/stream?streams=";

const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let socketStreams: string[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let intentionalClose = false;

function streamNames(): string[] {
  return [...handlers.keys()].map((s) => `${s.toLowerCase()}@miniTicker`);
}

function connect(): void {
  if (reconnectTimer || handlers.size === 0) return;
  const names = streamNames();

  /* already connected with exactly this stream set — nothing to do */
  if (
    socket &&
    socket.readyState === WebSocket.OPEN &&
    socketStreams.join("/") === names.join("/")
  ) {
    return;
  }

  /* stream set changed (new symbol subscribed) — rebuild the socket */
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

  socket.onopen = () => {
    reconnectDelay = 1000;
  };

  socket.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as {
        stream?: string;
        data?: {
          s?: string;
          c?: string;
          o?: string;
          h?: string;
          l?: string;
          v?: string;
        };
      };
      const raw = msg.data;
      if (!raw?.s || raw.c == null) return;
      const price = Number(raw.c);
      if (!Number.isFinite(price)) return;
      const open = Number(raw.o) || price;
      const ticker: BinanceMiniTicker = {
        symbol: raw.s.toUpperCase(),
        price,
        open,
        high: Number(raw.h) || price,
        low: Number(raw.l) || price,
        volume: Number(raw.v) || 0,
        change24h: open > 0 ? ((price - open) / open) * 100 : 0,
      };
      const set = handlers.get(ticker.symbol);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(ticker);
        } catch {
          // never let one subscriber break the shared socket
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
    if (intentionalClose || handlers.size === 0) return;
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
}

/**
 * Subscribe to live miniTicker updates for one Binance symbol.
 * Returns an unsubscribe function. The shared socket is torn down when the
 * last subscriber leaves.
 */
export function subscribeBinanceTicker(
  binanceSymbol: string,
  handler: Handler,
): () => void {
  const symbol = binanceSymbol.toUpperCase();
  const set = handlers.get(symbol) ?? new Set<Handler>();
  set.add(handler);
  handlers.set(symbol, set);
  connect();

  return () => {
    const current = handlers.get(symbol);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) handlers.delete(symbol);
    if (handlers.size === 0) tearDownSocket();
  };
}
