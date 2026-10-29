// customL4 — persistence cho L4 Context-Gate RECIPE (tổ-hợp block: điều-kiện + logic), soi đúng customL6/customL2/L3.
// Lưu RECIPE (nạp lại + sửa tổ-hợp block), KHÔNG chỉ compile-output. compileL4(recipe) vẫn ra conditions byte-identical
// → recipe-store KHÔNG đổi compile. Zone-analog: distinct với customModule (compile-output). SHADOW · advisory · no order.
import type { Condition } from "../customModule.ts";

export interface CustomL4Recipe {
  id: string; name: string; explain: string; why: string;
  logic: "ALL" | "ANY"; conditions: Condition[];   // tổ-hợp block đã seed thành điều-kiện (metric+op+value)
  status: "SHADOW"; createdAt: string;
}

const KEY = "mfe_custom_l4_recipe";
let _mem: CustomL4Recipe[] | null = null;
export function loadCustomL4(): CustomL4Recipe[] {
  if (_mem) return _mem;
  try { const raw = localStorage.getItem(KEY); _mem = raw ? (JSON.parse(raw) as CustomL4Recipe[]) : []; } catch { _mem = []; }
  return _mem!;
}
export function saveCustomL4(list: CustomL4Recipe[]): void { _mem = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* mem-only */ } }
export function deleteCustomL4(id: string): CustomL4Recipe[] { const list = loadCustomL4().filter((r) => r.id !== id); saveCustomL4(list); return list; }

export function reloadCustomL4() { _mem = null; return loadCustomL4(); }
