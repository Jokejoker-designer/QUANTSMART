/**
 * curveGeometry.ts — finite-difference geometry on the 2D curve.
 * Approximate; never returns NaN to the UI.
 */
import type { CurvePoint, CurveSamplePoint, ZeroCrossing, CurveGeometrySummary } from "./curveTypes";

const fin = (x: number) => (Number.isFinite(x) ? x : 0);

export function findZeroCrossings(curve: CurvePoint[]): ZeroCrossing[] {
  const out: ZeroCrossing[] = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y)) continue;
    if (a.y === 0) { out.push({ x: a.x, y: 0, crossType: "TOUCH" }); continue; }
    if (a.y * b.y < 0) {
      const t = Math.abs(a.y) / (Math.abs(a.y) + Math.abs(b.y));
      out.push({ x: a.x + (b.x - a.x) * t, y: 0, crossType: b.y > a.y ? "UPWARD" : "DOWNWARD" });
    }
  }
  return out;
}

export function slopeAt(curve: CurvePoint[], index: number): number {
  const i = Math.max(0, Math.min(curve.length - 1, index));
  const prev = curve[Math.max(0, i - 1)];
  const next = curve[Math.min(curve.length - 1, i + 1)];
  const dx = next.x - prev.x;
  if (dx === 0 || !Number.isFinite(prev.y) || !Number.isFinite(next.y)) return 0;
  return fin((next.y - prev.y) / dx);
}

export function curvatureAt(curve: CurvePoint[], index: number): number {
  const i = Math.max(1, Math.min(curve.length - 2, index));
  const a = curve[i - 1], b = curve[i], c = curve[i + 1];
  const dx1 = b.x - a.x, dx2 = c.x - b.x;
  if (dx1 === 0 || dx2 === 0 || ![a.y, b.y, c.y].every(Number.isFinite)) return 0;
  const s1 = (b.y - a.y) / dx1, s2 = (c.y - b.y) / dx2;
  return fin((s2 - s1) / ((dx1 + dx2) / 2));
}

export function nearestCurveIndex(curve: CurvePoint[], x: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const d = Math.abs(curve[i].x - x);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function nearestSampleIndex(points: CurveSamplePoint[], x: number, y: number, sx: number, sy: number): number {
  let best = -1, bd = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = ((points[i].x - x) * sx) ** 2 + ((points[i].y - y) * sy) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function rSquared(points: CurveSamplePoint[], curve: CurvePoint[]): number | null {
  const fp = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (fp.length < 3 || curve.length < 2) return null;
  const mean = fp.reduce((a, p) => a + p.y, 0) / fp.length;
  let ssRes = 0, ssTot = 0;
  for (const p of fp) {
    const pred = curve[nearestCurveIndex(curve, p.x)].y;
    if (!Number.isFinite(pred)) continue;
    ssRes += (p.y - pred) ** 2;
    ssTot += (p.y - mean) ** 2;
  }
  if (ssTot < 1e-12) return null;
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}

function risk(ratio: number): "LOW" | "MEDIUM" | "HIGH" {
  if (ratio > 0.2) return "HIGH";
  if (ratio > 0.06) return "MEDIUM";
  return "LOW";
}

export function computeCurveGeometry(
  curve: CurvePoint[],
  samplePoints: CurveSamplePoint[],
  isEmpirical: boolean,
): CurveGeometrySummary {
  const ys = curve.map((p) => p.y).filter(Number.isFinite);
  const maxY = ys.length ? Math.max(...ys) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const amplitude = maxY - minY;
  const maxMag = Math.max(Math.abs(maxY), Math.abs(minY), 1e-9);

  let slopeSum = 0, curvSum = 0, flat = 0, sat = 0, nonFinite = 0, jumps = 0, count = 0;
  let prevY = NaN;
  for (let i = 0; i < curve.length; i++) {
    const y = curve[i].y;
    if (!Number.isFinite(y)) { nonFinite++; prevY = NaN; continue; }
    const s = Math.abs(slopeAt(curve, i));
    slopeSum += s; curvSum += curvatureAt(curve, i);
    if (s < 0.1) flat++;
    if (Math.abs(y) >= 0.98 * maxMag) sat++;
    if (Number.isFinite(prevY) && Math.abs(y - prevY) > 0.5 * (amplitude || 1)) jumps++;
    prevY = y; count++;
  }
  const denom = count || 1;

  // symmetry about the X-domain midpoint
  let symNum = 0, symDen = 0;
  for (let i = 0; i < curve.length; i++) {
    const j = curve.length - 1 - i;
    if (!Number.isFinite(curve[i].y) || !Number.isFinite(curve[j].y)) continue;
    symNum += Math.abs(curve[i].y - curve[j].y); symDen++;
  }
  const symmetry = symDen ? Math.max(0, 1 - symNum / symDen / (amplitude || 1)) : 0;
  const smoothness = Math.max(0, Math.min(1, 1 - jumps / denom));

  return {
    outputRange: [minY, maxY],
    zeroCrossings: findZeroCrossings(curve),
    maxY: fin(maxY),
    minY: fin(minY),
    amplitude: fin(amplitude),
    avgSlope: fin(slopeSum / denom),
    curvatureAvg: fin(curvSum / denom),
    smoothness: fin(smoothness),
    symmetry: fin(symmetry),
    rSquared: isEmpirical ? rSquared(samplePoints, curve) : null,
    flatZoneCoverage: flat / denom,
    saturationCoverage: sat / denom,
    singularityRisk: risk(nonFinite / (curve.length || 1)),
    discontinuityRisk: risk(jumps / denom),
  };
}
