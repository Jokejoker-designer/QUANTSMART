// formulaLabStore — the HANDOFF so ANY module can "open in Coordinate Lab". A module builds a
// FormulaCoordinateInput (via an adapter, e.g. quantToFormulaLab) → setFormulaLabInput → navigates to the Formula
// Lab page, which reads it. In-memory (survives in-app nav) + localStorage best-effort (survives a reload).
import type { FormulaCoordinateInput } from "./core/coordinateTypes";

const LS_KEY = "mfe_formula_lab_input";
export const FORMULA_LAB_EVENT = "mfe-formula-lab-input";
let _current: FormulaCoordinateInput | null = null;

export function setFormulaLabInput(input: FormulaCoordinateInput): void {
  _current = input;
  try { localStorage.setItem(LS_KEY, JSON.stringify(input)); } catch { /* too big / unavailable → in-memory only */ }
  try { window.dispatchEvent(new CustomEvent(FORMULA_LAB_EVENT)); } catch { /* ignore */ }
}
export function getFormulaLabInput(): FormulaCoordinateInput | null {
  if (_current) return _current;
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { _current = JSON.parse(raw) as FormulaCoordinateInput; return _current; } } catch { /* ignore */ }
  return null;
}
export function clearFormulaLabInput(): void {
  _current = null;
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(FORMULA_LAB_EVENT)); } catch { /* ignore */ }
}
