/* ============================================================================
   Paper trading P&L (frontend side).

   UI-side mirror of the backend formula in src/convex/paper.ts — Convex
   modules cannot be imported by frontend code, so the same pure math lives
   on both sides of the boundary. Keep them in sync: signed P&L in INR =
   (exit − entry) × direction × size × usdInrRate.

   Simulation only. This never touches a broker.
   ========================================================================== */

export type PaperDirection = "long" | "short";

/** Signed P&L in INR for a simulated position at an exit/mark price. */
export function paperPnlInr(
  direction: PaperDirection,
  entry: number,
  exit: number,
  size: number,
  usdInrRate: number,
): number {
  const multiplier = direction === "long" ? 1 : -1;
  return (exit - entry) * multiplier * size * usdInrRate;
}
