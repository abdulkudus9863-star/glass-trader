/* ============================================================================
   Paper-trade form validation — pure, unit-tested helpers.

   The UI must never silently disable "Open simulated position". Every reason a
   trade cannot be submitted is returned as a readable message, and any numeric
   value a trader can plausibly type ("115,000", "1 150.50", "0,5", "115000.00")
   parses instead of collapsing to NaN/empty.
   ========================================================================== */

export type PaperDirection = "long" | "short";

export interface PaperFormInput {
  direction: PaperDirection;
  /** Raw strings straight from the inputs. */
  entry: string;
  stop: string;
  target?: string;
  size?: string;
}

export interface PaperRiskSettings {
  balanceInr: number;
  riskPercent: number;
  usdInrRate: number;
}

export interface PaperFormPreview {
  direction: PaperDirection;
  entry: number;
  stop: number;
  target?: number;
}

export interface PaperFormResult {
  /** True only when every value is present, finite and on the correct side. */
  ok: boolean;
  /** Human-readable reasons the trade is blocked (empty when `ok`). */
  errors: string[];
  entry: number | null;
  stop: number | null;
  target: number | null;
  /** Units of risk per and reward per unit, in quote currency. */
  riskPerUnit: number | null;
  /** INR budget risked on this trade. */
  riskInr: number;
  /** Size derived from the risk budget (null when the maths is undefined). */
  autoSize: number | null;
  /** Size actually submitted (manual override, else auto). */
  size: number | null;
  manualSize: boolean;
  /** Reward-to-risk ratio when a target is set. */
  riskReward: number | null;
  /** Overlay preview for the chart (null until entry + stop are valid). */
  preview: PaperFormPreview | null;
}

const CURRENCY_SYMBOLS = /[₹$€£¥]/g;
const SEPARATORS = /[\s\u00a0\u202f_]/g;

/**
 * Parse a typed decimal number.
 *
 * Handles thousands separators and decimal commas:
 *   115000, 115,000, 115 000.50, 1.150,25, 0,5, 1,5, ₹2,400
 * Returns null for anything that is not a finite number (empty, "—", "abc").
 */
export function parseDecimal(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).replace(CURRENCY_SYMBOLS, "").replace(SEPARATORS, "").trim();
  if (!text) return null;

  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasComma && hasDot) {
    // European style when the comma comes last: 1.150,25 → 1150.25
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    const groups = text.split(",");
    const isDecimalComma =
      groups.length === 2 &&
      (groups[1].length !== 3 || groups[0] === "0" || groups[0] === "");
    text = isDecimalComma ? groups.join(".") : groups.join("");
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Positive-number parse: null unless the value is a finite number > 0. */
export function parsePositive(raw: string | null | undefined): number | null {
  const value = parseDecimal(raw);
  return value !== null && value > 0 ? value : null;
}

/* --------------------------- position sizing ---------------------------- */

export function riskBudgetInr(balanceInr: number, riskPercent: number): number {
  if (!Number.isFinite(balanceInr) || !Number.isFinite(riskPercent)) return 0;
  return Math.max(0, (balanceInr * riskPercent) / 100);
}

/** Units that risk exactly `budgetInr` between `entry` and `stop`. */
export function autoPositionSize(
  budgetInr: number,
  usdInrRate: number,
  entry: number,
  stop: number,
  maxSize = 1_000_000,
): number | null {
  const riskPerUnit = Math.abs(entry - stop);
  if (!(riskPerUnit > 0)) return null;
  if (!(usdInrRate > 0) || !Number.isFinite(budgetInr) || budgetInr <= 0) return null;
  const size = budgetInr / usdInrRate / riskPerUnit;
  if (!Number.isFinite(size) || size <= 0) return null;
  const rounded = Number(size.toFixed(6));
  return rounded > maxSize ? null : rounded;
}

/* ------------------------------ validation ------------------------------- */

const LABEL: Record<PaperDirection, string> = { long: "LONG", short: "SHORT" };

export function validatePaperTrade(
  form: PaperFormInput,
  settings: PaperRiskSettings,
): PaperFormResult {
  const errors: string[] = [];

  const entry = parsePositive(form.entry);
  const stop = parsePositive(form.stop);
  const targetRaw = (form.target ?? "").trim();
  const target = targetRaw ? parsePositive(targetRaw) : null;

  if (!form.entry.trim()) errors.push("Entry price is required.");
  else if (entry === null) errors.push("Enter a valid entry price.");

  if (!form.stop.trim()) errors.push("Stop loss is required and must be above zero.");
  else if (stop === null) errors.push("Enter a valid stop-loss price.");

  if (targetRaw && target === null) errors.push("Enter a valid target price, or leave it blank.");

  if (entry !== null && stop !== null) {
    if (entry === stop) {
      errors.push("Stop loss cannot equal the entry price.");
    } else if (form.direction === "long" && stop > entry) {
      errors.push(`Stop loss must be below the entry price for a ${LABEL.long} trade.`);
    } else if (form.direction === "short" && stop < entry) {
      errors.push(`Stop loss must be above the entry price for a ${LABEL.short} trade.`);
    }
  }

  if (entry !== null && target !== null) {
    if (form.direction === "long" && target <= entry) {
      errors.push("Take profit must be above the entry price for a LONG trade.");
    } else if (form.direction === "short" && target >= entry) {
      errors.push("Take profit must be below the entry price for a SHORT trade.");
    }
  }

  const riskPerUnit =
    entry !== null && stop !== null && entry !== stop ? Math.abs(entry - stop) : null;
  const riskInr = riskBudgetInr(settings.balanceInr, settings.riskPercent);
  const autoSize =
    entry !== null && stop !== null
      ? autoPositionSize(riskInr, settings.usdInrRate, entry, stop)
      : null;

  const sizeRaw = (form.size ?? "").trim();
  const manualSize = sizeRaw.length > 0;
  let size: number | null = autoSize;
  if (manualSize) {
    size = parsePositive(sizeRaw);
    if (size === null) errors.push("Manual position size must be a positive number.");
  } else if (entry !== null && stop !== null && entry !== stop && autoSize === null) {
    errors.push(
      "Could not size the position from your risk settings — check the balance, USD/INR rate and prices.",
    );
  }

  const riskReward =
    entry !== null && target !== null && riskPerUnit !== null && riskPerUnit > 0
      ? Math.abs(target - entry) / riskPerUnit
      : null;

  const sameSideStop =
    entry !== null &&
    stop !== null &&
    ((form.direction === "long" && stop < entry) ||
      (form.direction === "short" && stop > entry));
  const targetOk =
    target === null ||
    (entry !== null &&
      ((form.direction === "long" && target > entry) ||
        (form.direction === "short" && target < entry)));

  const preview: PaperFormPreview | null =
    entry !== null && stop !== null && entry !== stop && sameSideStop
      ? {
          direction: form.direction,
          entry,
          stop,
          target: target !== null && targetOk ? target : undefined,
        }
      : null;

  const ok =
    entry !== null &&
    stop !== null &&
    sameSideStop &&
    targetOk &&
    size !== null &&
    Number.isFinite(size) &&
    size > 0 &&
    errors.length === 0;

  return {
    ok,
    errors: Array.from(new Set(errors)),
    entry,
    stop,
    target,
    riskPerUnit,
    riskInr,
    autoSize,
    size,
    manualSize,
    riskReward,
    preview,
  };
}
