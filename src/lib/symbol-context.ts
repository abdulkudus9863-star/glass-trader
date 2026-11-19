import { SYMBOLS } from "./market";

/**
 * Trading-symbol recognition for the Copilot (and anything else that has to
 * understand which instrument a user means).
 *
 * Rules:
 *   1. An explicitly mentioned symbol always wins over the selected chart.
 *   2. Aliases are matched longest-first on word boundaries, so "BTCUSDT" is
 *      never mistaken for "BTC", and "gold/USD" resolves to XAUUSD.
 *   3. A pair-shaped token that is not in the catalog (e.g. "DOGECOINUSDT")
 *      is reported as unsupported instead of silently analysing something else.
 *   4. No symbol mentioned → `explicit: false` so the caller can fall back to
 *      the currently selected chart pair.
 */

export interface SymbolDetection {
  /** Catalog symbol id ("XAUUSD") or null when the mention is unsupported. */
  symbolId: string | null;
  /** True when the user explicitly named an instrument. */
  explicit: boolean;
  /** The raw token that triggered the match, for honest messaging. */
  mentioned: string | null;
  /** True when a pair-like token was found that the catalog does not cover. */
  unsupported: boolean;
}

/** Extra human aliases on top of the catalog ids and names. */
const EXTRA_ALIASES: Record<string, string[]> = {
  BTCUSDT: ["BTC", "BITCOIN", "XBT"],
  BTCUSD: ["BTCUSD"],
  ETHUSDT: ["ETH", "ETHEREUM"],
  SOLUSDT: ["SOL", "SOLANA"],
  BNBUSDT: ["BNB"],
  XRPUSDT: ["XRP", "RIPPLE"],
  DOGEUSDT: ["DOGE", "DOGECOIN"],
  EURUSD: ["EURO", "EUR"],
  GBPUSD: ["CABLE"],
  USDJPY: ["JPY", "YEN"],
  XAUUSD: ["XAU", "GOLD"],
  XAGUSD: ["XAG", "SILVER"],
  SPX500: ["SPX", "SP500", "S&P", "SANDP500"],
  NAS100: ["NAS100", "NASDAQ", "US100", "NDX"],
  US30: ["US30", "DOW", "DOWJONES"],
  DXY: ["DXY", "DOLLARINDEX"],
  AAPL: ["AAPL", "APPLE"],
  TSLA: ["TSLA", "TESLA"],
  NVDA: ["NVDA", "NVIDIA"],
};

interface AliasEntry {
  alias: string; // normalized, no separators
  symbolId: string;
  rawAlias: string;
}

function normalizeToken(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const ALIASES: AliasEntry[] = (() => {
  const out: AliasEntry[] = [];
  for (const sym of SYMBOLS) {
    out.push({ alias: normalizeToken(sym.id), symbolId: sym.id, rawAlias: sym.id });
  }
  for (const [symbolId, list] of Object.entries(EXTRA_ALIASES)) {
    for (const alias of list) {
      out.push({ alias: normalizeToken(alias), symbolId, rawAlias: alias });
    }
  }
  /* Longest first: "BTCUSDT" before "BTC", "GOLD/USD" before "GOLD". */
  out.sort((a, b) => b.alias.length - a.alias.length);
  return out;
})();

const CATALOG_IDS = new Set(SYMBOLS.map((s) => s.id));

/**
 * Scan free text for an instrument mention.
 *
 * `text` is expected to be a user message; punctuation, slashes and hyphens
 * between letters/digits are ignored, so "xau/usd" → "XAUUSD".
 */
export function detectSymbolInText(text: string): SymbolDetection {
  const upper = text.toUpperCase();
  // Collapse separators INSIDE pair-like tokens: XAU/USD, BTC-USDT, GOLD/USD.
  const compact = upper.replace(/([A-Z0-9])\s*[/\-_]\s*(?=[A-Z0-9])/g, "$1");
  const tokens = new Set(
    compact
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^A-Z0-9]/g, "")),
  );
  // Also consider the full compact string for glued phrases like "goldusd".
  const joined = compact.replace(/[^A-Z0-9]+/g, "");

  for (const entry of ALIASES) {
    for (const token of tokens) {
      if (token === entry.alias) {
        return {
          symbolId: entry.symbolId,
          explicit: true,
          mentioned: entry.rawAlias,
          unsupported: false,
        };
      }
    }
    // Only allow substring matching for aliases of length >= 6 to avoid
    // "SPX" inside random words while still catching "BITCOINUSDT".
    if (entry.alias.length >= 6 && joined.includes(entry.alias)) {
      return {
        symbolId: entry.symbolId,
        explicit: true,
        mentioned: entry.rawAlias,
        unsupported: false,
      };
    }
  }

  // Unsupported pair-shaped mention, e.g. "DOGECOINUSDT", "NZDUSD".
  for (const token of tokens) {
    if (/^[A-Z]{2,10}(USDT|USD)$/.test(token) && !CATALOG_IDS.has(token)) {
      return {
        symbolId: null,
        explicit: true,
        mentioned: token,
        unsupported: true,
      };
    }
  }

  return { symbolId: null, explicit: false, mentioned: null, unsupported: false };
}

/**
 * Decide which instrument an analysis should run on.
 * Explicit mention wins; otherwise the selected chart symbol is used.
 */
export function resolveAnalysisSymbol(
  text: string,
  selectedSymbolId: string,
): SymbolDetection & { usedFallback: boolean } {
  const detected = detectSymbolInText(text);
  if (detected.explicit) return { ...detected, usedFallback: false };
  return {
    symbolId: selectedSymbolId,
    explicit: false,
    mentioned: null,
    unsupported: false,
    usedFallback: true,
  };
}
