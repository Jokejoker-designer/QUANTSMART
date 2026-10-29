// Decimal input validation for research profiles; no engine thresholds are changed here.
export function parseNumericDraft(text: string, min: number, max: number, step: number): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-7 ? value : null;
}
export const numericPrecision = (step: number) => (String(step).split(".")[1] || "").length;
export function stepNumeric(value: number, direction: number, min: number, max: number, step: number): number {
  return Number(Math.max(min, Math.min(max, value + direction * step)).toFixed(numericPrecision(step)));
}
