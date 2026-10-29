/**
 * marginalHistogram.ts — 1D marginal density of replay samples projected onto the X (or Y) axis of the 2D Curve
 * Map. Answers "where do the samples concentrate?" / "is this pretty curve region actually observed?". This is a
 * DENSITY overlay only — never a signal, entry, or zone. Counts replay samples per bin; density = count/maxCount.
 */
export interface MarginalBin {
  binIndex: number;
  min: number;
  max: number;
  center: number;
  count: number;
  density: number; // count / maxCount ∈ [0,1]
}

export function buildMarginalHistogram(values: number[], range: [number, number], binCount: number): MarginalBin[] {
  const n = Math.max(1, Math.floor(binCount));
  const [min, max] = range;
  const span = max - min || 1;
  const bins: MarginalBin[] = Array.from({ length: n }, (_, i) => {
    const lo = min + (i / n) * span, hi = min + ((i + 1) / n) * span;
    return { binIndex: i, min: lo, max: hi, center: (lo + hi) / 2, count: 0, density: 0 };
  });
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor(((v - min) / span) * n);
    idx = Math.max(0, Math.min(n - 1, idx));
    bins[idx].count += 1;
  }
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  for (const b of bins) b.density = b.count / maxCount;
  return bins;
}

// the bin a value falls into (for the inspector's local X-bin / Y-bin readout)
export function binAt(bins: MarginalBin[], v: number): MarginalBin | null {
  if (!Number.isFinite(v) || bins.length === 0) return null;
  for (const b of bins) if (v >= b.min && v < b.max) return b;
  const last = bins[bins.length - 1];
  return v >= last.max ? last : (v < bins[0].min ? bins[0] : null);
}

export function totalCount(bins: MarginalBin[]): number {
  return bins.reduce((a, b) => a + b.count, 0);
}
