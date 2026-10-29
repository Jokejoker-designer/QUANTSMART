// Presentation only: separate crowded zone labels without moving their price bands.
export function arrangeZoneLabels(positions: number[], top: number, bottom: number, spacing = 18): number[] {
  if (!positions.length) return [];
  const ordered = positions.map((y, i) => ({ y: Math.max(top, Math.min(bottom, y)), i })).sort((a, b) => a.y - b.y);
  const gap = Math.min(spacing, (bottom - top) / Math.max(1, ordered.length - 1));
  for (let i = 1; i < ordered.length; i++) ordered[i].y = Math.max(ordered[i].y, ordered[i - 1].y + gap);
  if (ordered[ordered.length - 1].y > bottom) {
    ordered[ordered.length - 1].y = bottom;
    for (let i = ordered.length - 2; i >= 0; i--) ordered[i].y = Math.min(ordered[i].y, ordered[i + 1].y - gap);
  }
  const result: number[] = []; ordered.forEach(({ y, i }) => { result[i] = y; }); return result;
}
