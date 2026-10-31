/**
 * Part B — Binance WebSocket reconnection.
 *
 * The sandbox blocks outbound WSS handshakes (verified: even the known-valid
 * btcusdt@miniTicker stream fails with "Expected 101 status code"), so live
 * server behavior cannot be probed from here. What CAN be tested — and is
 * tested — is the application's own socket logic: stream URL construction,
 * status transitions, frame dispatch/validation, automatic reconnect with
 * backoff after an unexpected drop, re-subscription on stream change, and
 * teardown.
 */
import { afterAll, describe, expect, test } from "bun:test";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    // The browser fires onclose asynchronously; the module nulls its own
    // reference when it initiates the close, so a no-op is faithful here.
    this.readyState = 3;
  }

  /* ---- test drivers ---- */
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  serverClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const RealWebSocket = (globalThis as any).WebSocket;
(globalThis as any).WebSocket = MockWebSocket;

const rt = await import("../src/lib/realtime");

afterAll(() => {
  (globalThis as any).WebSocket = RealWebSocket;
});

async function waitFor(cond: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return cond();
}

const statuses: string[] = [];
const unsubscribeStatus = rt.subscribeBinanceStatus((s) => statuses.push(s));

const received: any[] = [];
const onKline = (k: any) => received.push(k);
let unsubKlines: (() => void) | null = null;

describe("Binance kline socket", () => {
  test("subscribes with the documented <symbol>@kline_<interval> stream", () => {
    unsubKlines = rt.subscribeBinanceKlines("BTCUSDT", onKline, "1h");
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@kline_1h",
    );
    expect(rt.getBinanceSocketStatus()).toBe("connecting");
  });

  test("open → status open; valid frames dispatch, invalid frames drop", () => {
    const ws = MockWebSocket.instances[0];
    ws.open();
    expect(rt.getBinanceSocketStatus()).toBe("open");

    // valid combined-stream kline frame
    ws.message({
      stream: "btcusdt@kline_1h",
      data: {
        e: "kline",
        s: "BTCUSDT",
        k: {
          t: 1_700_000_000_000, // ms → seconds after conversion
          o: "100.5",
          h: "102.0",
          l: "99.9",
          c: "101.25",
          v: "12.5",
          x: false,
        },
      },
    });
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe("BTCUSDT");
    expect(received[0].time).toBe(1_700_000_000); // epoch seconds
    expect(received[0].open).toBe(100.5);
    expect(received[0].close).toBe(101.25);
    expect(received[0].isClosed).toBe(false);

    // inverted OHLC is mathematically impossible — dropped, never delivered
    ws.message({
      stream: "btcusdt@kline_1h",
      data: {
        s: "BTCUSDT",
        k: { t: 1_700_003_600_000, o: "100", h: "99", l: "101", c: "100", v: "1" },
      },
    });
    // non-finite values — dropped
    ws.message({
      stream: "btcusdt@kline_1h",
      data: {
        s: "BTCUSDT",
        k: { t: 1_700_007_200_000, o: "NaN", h: "1", l: "1", c: "abc", v: "1" },
      },
    });
    // frame for a different interval bucket — routed to that bucket only
    ws.message({
      stream: "btcusdt@kline_15m",
      data: {
        s: "BTCUSDT",
        k: { t: 1_700_010_800_000, o: "100", h: "101", l: "99", c: "100.5", v: "3" },
      },
    });
    expect(received).toHaveLength(1); // only the valid 1h frame was delivered
  });

  test("unexpected drop → 'reconnecting' → automatic reconnect with backoff → open", async () => {
    statuses.length = 0;
    MockWebSocket.instances[0].serverClose();
    expect(rt.getBinanceSocketStatus()).toBe("reconnecting");

    const before = MockWebSocket.instances.length;
    const spawned = await waitFor(() => MockWebSocket.instances.length > before);
    expect(spawned).toBe(true); // reconnect timer fired without any manual help

    const reconnected = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(reconnected.url).toBe(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@kline_1h",
    );
    reconnected.open();
    expect(rt.getBinanceSocketStatus()).toBe("open");
    expect(statuses).toContain("reconnecting");
    expect(statuses).toContain("open");

    // and data flows again after the reconnect
    const count = received.length;
    reconnected.message({
      stream: "btcusdt@kline_1h",
      data: {
        s: "BTCUSDT",
        k: { t: 1_700_014_400_000, o: "101", h: "103", l: "100", c: "102", v: "9" },
      },
    });
    expect(received.length).toBe(count + 1);
  });

  test("adding another stream re-subscribes with the combined stream list", () => {
    const unsubTicker = rt.subscribeBinanceTicker("BTCUSDT", () => undefined);
    const latest = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(latest.url).toBe(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker/btcusdt@kline_1h",
    );
    latest.open();
    expect(rt.getBinanceSocketStatus()).toBe("open");
    unsubTicker();
  });

  test("unsubscribing everything tears the socket down to 'idle'", () => {
    expect(unsubKlines).not.toBeNull();
    unsubKlines!();
    unsubKlines = null;
    expect(rt.getBinanceSocketStatus()).toBe("idle");
    unsubscribeStatus();
  });
});
