/**
 * curveRegionRules.ts — semantic quadrant regions (I–IV).
 * Context Region · Not Entry Zone. Region labels are geometry, not trading edge.
 */
import type { CurveRegion } from "./curveTypes";

export const CURVE_REGIONS: CurveRegion[] = [
  { id: "I", label: "REGION I", description: "Strong Momentum · High Signal", condition: "X > 0, Y > 0", style: "SAFE" },
  { id: "II", label: "REGION II", description: "Weak Momentum · High Signal", condition: "X < 0, Y > 0", style: "CAUTION" },
  { id: "III", label: "REGION III", description: "Weak Momentum · Low Signal", condition: "X < 0, Y < 0", style: "RISK" },
  { id: "IV", label: "REGION IV", description: "Strong Momentum · Low Signal", condition: "X > 0, Y < 0", style: "CAUTION" },
];

export const REGION_STYLE_COLOR: Record<CurveRegion["style"], string> = {
  SAFE: "#3fb6a8",
  CAUTION: "#e0ad4e",
  RISK: "#e0556a",
  INFO: "#34d3e0",
};

export function regionForPoint(x: number, y: number): CurveRegion["id"] {
  if (x >= 0 && y >= 0) return "I";
  if (x < 0 && y >= 0) return "II";
  if (x < 0 && y < 0) return "III";
  return "IV";
}
