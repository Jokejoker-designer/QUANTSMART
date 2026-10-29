/**
 * colorScales.ts — diverging color scale for formula output (NOT profit/loss).
 *
 *   negative / risk  : red → purple
 *   neutral          : dark blue / gray
 *   positive / strong: cyan → green → yellow
 *
 * Color means numerical output magnitude only. Clamps safely when the value
 * range is zero or non-finite (no divide-by-zero, no NaN colors).
 */
export interface RGB { r: number; g: number; b: number; }

const STOPS: { t: number; c: RGB }[] = [
  { t: 0.0, c: { r: 198, g: 60, b: 110 } }, // risk: red-purple
  { t: 0.25, c: { r: 120, g: 60, b: 150 } }, // purple
  { t: 0.5, c: { r: 26, g: 38, b: 56 } }, // neutral dark
  { t: 0.7, c: { r: 58, g: 170, b: 196 } }, // cyan
  { t: 0.85, c: { r: 86, g: 210, b: 130 } }, // green
  { t: 1.0, c: { r: 232, g: 210, b: 96 } }, // yellow
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Map a normalized t∈[0,1] to an RGB along the diverging scale. */
export function colorAt(t: number): RGB {
  const tc = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5;
  for (let i = 1; i < STOPS.length; i++) {
    if (tc <= STOPS[i].t) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const span = b.t - a.t || 1;
      const local = (tc - a.t) / span;
      return {
        r: lerp(a.c.r, b.c.r, local),
        g: lerp(a.c.g, b.c.g, local),
        b: lerp(a.c.b, b.c.b, local),
      };
    }
  }
  return STOPS[STOPS.length - 1].c;
}

/** Normalize a z value into [0,1] given a range. Safe when range is zero. */
export function normalizeZ(z: number, zMin: number, zMax: number): number {
  if (!Number.isFinite(z)) return 0.5;
  const span = zMax - zMin;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-12) return 0.5;
  return Math.max(0, Math.min(1, (z - zMin) / span));
}

export function rgbCss(c: RGB, alpha = 1): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** Convenience: z → css color string, range-clamped. */
export function colorForZ(z: number, zMin: number, zMax: number, alpha = 1): string {
  // sealed / non-finite cells render as a neutral quarantine gray.
  if (!Number.isFinite(z)) return `rgba(40, 46, 58, ${alpha})`;
  return rgbCss(colorAt(normalizeZ(z, zMin, zMax)), alpha);
}
