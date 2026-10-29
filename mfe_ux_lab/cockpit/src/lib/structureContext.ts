// structureContext — causal S/R spatial context for sr_zone_context + level_memory (L2).
// Levels = swing pivots confirmed by PAST bars only (a pivot at k is known at k+W). ATR-relative
// (era-safe, not absolute price). DESCRIPTIVE only — where is price vs structure — never predictive.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface SwingLevel { price: number; kind: "high" | "low"; confirmIndex: number }
// a pivot is a local extreme over [k-W, k+W]; only KNOWN at bar k+W (no lookahead). Detection uses the
// CLOSE series (continuous-market open carries the prior close → adjacent HIGHS tie at a peak and break
// strict pivots); the recorded level price is the bar's high/low.
export function computeSwingLevels(bars: OhlcBar[], W = 5): SwingLevel[] {
  const out: SwingLevel[] = []; const n = bars.length; const c = bars.map((b) => b.c);
  for (let k = W; k < n - W; k++) {
    let isHigh = true, isLow = true;
    for (let j = k - W; j <= k + W; j++) { if (j === k) continue; if (c[j] >= c[k]) isHigh = false; if (c[j] <= c[k]) isLow = false; }
    if (isHigh) out.push({ price: bars[k].h, kind: "high", confirmIndex: k + W });
    if (isLow) out.push({ price: bars[k].l, kind: "low", confirmIndex: k + W });
  }
  return out;
}

export type StructState = "AT_SUPPORT" | "AT_RESISTANCE" | "APPROACHING_SUPPORT" | "APPROACHING_RESISTANCE" | "IN_NO_MANS_LAND" | "COMPRESSION_ZONE";
export interface StructInfo { state: StructState; nearestSupport: number | null; nearestResistance: number | null; supTouches: number; resTouches: number }

// active levels at bar i = confirmed (confirmIndex ≤ i) within a recent window. Distances in ATR.
export function structureAt(i: number, price: number, atr: number, levels: SwingLevel[], bars: OhlcBar[], windowBars = 250): StructInfo {
  const lo = i - windowBars; const a = atr || 1;
  let ns: number | null = null, nr: number | null = null;
  for (const L of levels) {
    if (L.confirmIndex > i || L.confirmIndex < lo) continue;
    if (L.price <= price) { if (ns === null || L.price > ns) ns = L.price; }
    else { if (nr === null || L.price < nr) nr = L.price; }
  }
  const dS = ns !== null ? (price - ns) / a : Infinity;
  const dR = nr !== null ? (nr - price) / a : Infinity;
  let state: StructState;
  if (dS <= 0.3 && dR <= 0.3) state = "COMPRESSION_ZONE";
  else if (dS <= 0.3) state = "AT_SUPPORT";
  else if (dR <= 0.3) state = "AT_RESISTANCE";
  else if (dS <= 1.0 && dS < dR) state = "APPROACHING_SUPPORT";
  else if (dR <= 1.0) state = "APPROACHING_RESISTANCE";
  else state = "IN_NO_MANS_LAND";
  // count DISTINCT touch events (price enters the ±0.3 ATR zone then leaves), not every bar in it.
  const touches = (lvl: number | null) => { if (lvl === null) return 0; let c = 0, inside = false; for (let k = Math.max(0, lo); k < i; k++) { const near = Math.abs(bars[k].l - lvl) < 0.3 * a || Math.abs(bars[k].h - lvl) < 0.3 * a; if (near && !inside) { c++; inside = true; } else if (!near) inside = false; } return c; };
  return { state, nearestSupport: ns, nearestResistance: nr, supTouches: touches(ns), resTouches: touches(nr) };
}

export function percentile(arr: number[], p: number): number { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; }
