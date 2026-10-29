// customL5 — persistence cho L5 Decision RECIPE (tổ-hợp block: terminal + setup + confirm), soi đúng customL6/L2/L3.
// Lưu RECIPE (nạp lại + sửa tổ-hợp block), KHÔNG chỉ compile-output. compileL5(recipe) vẫn ra CustomModule byte-
// identical → recipe-store KHÔNG đổi compile. SHADOW · advisory · zone-only · no order.
import type { L5Cond } from "./l5Compile.ts";

export interface CustomL5Recipe {
  id: string; name: string; explain: string; why: string;
  terminal: "TRIGGER" | "VETO" | "EXIT"; direction?: "LONG" | "SHORT" | "REGIME";
  setup: L5Cond[]; confirm: L5Cond[];
  status: "SHADOW"; createdAt: string;
}

const KEY = "mfe_custom_l5_recipe";
let _mem: CustomL5Recipe[] | null = null;
export function loadCustomL5(): CustomL5Recipe[] {
  if (_mem) return _mem;
  try { const raw = localStorage.getItem(KEY); _mem = raw ? (JSON.parse(raw) as CustomL5Recipe[]) : []; } catch { _mem = []; }
  return _mem!;
}
export function saveCustomL5(list: CustomL5Recipe[]): void { _mem = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* mem-only */ } }
export function deleteCustomL5(id: string): CustomL5Recipe[] { const list = loadCustomL5().filter((r) => r.id !== id); saveCustomL5(list); return list; }

export function reloadCustomL5() { _mem = null; return loadCustomL5(); }
