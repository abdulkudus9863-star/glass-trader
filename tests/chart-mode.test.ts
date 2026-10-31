/**
 * Part A — chart-mode persistence.
 *
 * loadChartMode/saveChartMode must round-trip the user's choice, default to
 * the TradingView widget, survive garbage values, and never throw when
 * storage is unavailable (private mode).
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { loadChartMode, saveChartMode } from "../src/components/chart/CustomChart";

/** Minimal localStorage polyfill for the bun test environment. */
function installStorage() {
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return map;
}

beforeEach(() => {
  installStorage();
});

describe("chart mode persistence", () => {
  test("defaults to the TradingView widget when nothing is stored", () => {
    expect(loadChartMode()).toBe("tradingview");
  });

  test("round-trips the lightweight selection", () => {
    saveChartMode("lightweight");
    expect(loadChartMode()).toBe("lightweight");
    saveChartMode("tradingview");
    expect(loadChartMode()).toBe("tradingview");
  });

  test("garbage stored values fall back to the default", () => {
    (globalThis as any).localStorage.setItem("gt.chartMode", "banana");
    expect(loadChartMode()).toBe("tradingview");
  });

  test("never throws when storage is unavailable", () => {
    (globalThis as any).localStorage = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
    };
    expect(() => saveChartMode("lightweight")).not.toThrow();
    expect(loadChartMode()).toBe("tradingview");
  });

  test("works when localStorage does not exist at all", () => {
    delete (globalThis as any).localStorage;
    expect(() => saveChartMode("lightweight")).not.toThrow();
    expect(loadChartMode()).toBe("tradingview");
  });
});
