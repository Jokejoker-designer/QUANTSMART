// coordRegime — Coordinate-Map regime LABELS (manager heuristic v0.1). This is a READING aid for the 2D map, NOT a
// trade edge: "Bullish Context" ≠ buy, "Risk Zone" ≠ sell. It only labels the FORMULA GEOMETRY at a point so the
// map is easier to read. SHADOW / advisory only; never an entry/zone/order. Risk is prioritised over Bullish — a
// bad output is never called bullish even if both axes are positive. (Pha-3 may add an L2-market-context layer.)
export type CoordinateRegime = "BULLISH_CONTEXT" | "NEUTRAL" | "FRAGILE" | "RISK_ZONE";

export const REGIME_META: Record<CoordinateRegime, { label: string; color: string }> = {
  BULLISH_CONTEXT: { label: "Bullish Context", color: "#3fb950" },
  NEUTRAL: { label: "Neutral", color: "#8b949e" },
  FRAGILE: { label: "Fragile", color: "#e3b341" },
  RISK_ZONE: { label: "Risk Zone", color: "#f7768e" },
};

export interface CoordPoint { x: number; y: number; output: number; slope: number; curvature: number; domainEdgeDistance?: number }

// output is expected CENTERED in [-1,1]; the caller normalises a [0,1] output via z = 2*v-1 before passing it in.
export function classifyCoordinateRegime(p: CoordPoint): CoordinateRegime {
  const z = p.output, slopeHigh = 0.85, curvatureHigh = 0.75, nearEdge = (p.domainEdgeDistance ?? 1) < 0.08;
  if (z < -0.40) return "RISK_ZONE";                                   // risk wins over bullish
  if (Math.abs(p.slope) > slopeHigh || Math.abs(p.curvature) > curvatureHigh || nearEdge) return "FRAGILE";
  if (z > 0.40 && p.x > 0 && p.y > 0) return "BULLISH_CONTEXT";
  return "NEUTRAL";
}
