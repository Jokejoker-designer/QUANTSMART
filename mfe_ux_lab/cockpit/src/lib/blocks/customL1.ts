// customL1 — persistence for user-authored L1 FEATURE modules. An L1 module is a validated FeatureGraph (a
// wiring of primitive blocks) + an explainability gate, saved SHADOW (never trusted until it passes the
// null-gate + OOS walk-forward, like every self-calibrated thing here). Distinct from customModule.ts (those
// are L4/L5 parameterized rules); L1 outputs a MEASUREMENT only — no order path, ever.
import type { FeatureGraph } from "./featureGraph.ts";
import { validateGraph } from "./featureGraph.ts";
import type { FeatureRoleProfile } from "./featureRoles.ts";

export type L1Status = "SHADOW" | "VALIDATING" | "PROMOTED";
export interface CustomL1Module {
  id: string;
  name: string;
  explain: string;          // what it measures (≥12 chars — explainability gate)
  why: string;              // why it's a sound measurement (≥12 chars)
  graph: FeatureGraph;
  status: L1Status;         // SHADOW until null-gate + walk-forward pass
  createdAt: string;
  family?: string;          // SINGLE_CANDLE | ROLLING_WINDOW | FSM | CUSTOM
  roles?: FeatureRoleProfile;   // Feature Usage Role (intended slot) — NOT authority; L1 stays measurement-only
}

const KEY = "mfe_custom_l1";
let _mem: CustomL1Module[] | null = null;   // in-memory fallback when localStorage is unavailable

export function loadCustomL1(): CustomL1Module[] {
  if (_mem) return _mem;
  try { const raw = localStorage.getItem(KEY); _mem = raw ? (JSON.parse(raw) as CustomL1Module[]) : []; }
  catch { _mem = []; }
  return _mem!;
}
export function saveCustomL1(list: CustomL1Module[]): void {
  _mem = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* mem-only */ }
}

// promote/demote a saved L1 module (SHADOW → PROMOTED makes it usable at L1; reversible).
export function setL1Status(id: string, status: L1Status): CustomL1Module[] {
  const list = loadCustomL1().map((m) => (m.id === id ? { ...m, status } : m));
  saveCustomL1(list);
  return list;
}
// delete a saved L1 module.
export function deleteCustomL1(id: string): CustomL1Module[] { const list = loadCustomL1().filter((m) => m.id !== id); saveCustomL1(list); return list; }
// patch a saved module (e.g. its role profile after Qualify).
export function updateCustomL1(id: string, patch: Partial<CustomL1Module>): CustomL1Module[] {
  const list = loadCustomL1().map((m) => (m.id === id ? { ...m, ...patch } : m));
  saveCustomL1(list);
  return list;
}

export interface L1Validation { ok: boolean; errors: string[]; warnings: string[] }
// gate a draft before save: graph must type-check + emit a feature, name + explainability filled.
export function validateL1Draft(d: { name: string; explain: string; why: string; graph: FeatureGraph }): L1Validation {
  const g = validateGraph(d.graph);
  const errors = [...g.errors];
  if (d.name.trim().length < 2) errors.push("Tên module cần ≥2 ký tự");
  if (d.explain.trim().length < 12) errors.push("Giải nghĩa LÀM GÌ cần ≥12 ký tự (cổng kiểm soát)");
  if (d.why.trim().length < 12) errors.push("VÌ SAO hợp lý cần ≥12 ký tự (cổng kiểm soát)");
  return { ok: errors.length === 0, errors, warnings: g.warnings };
}

// Refresh after an explicit portable-definition import.
export function reloadCustomL1() { _mem = null; return loadCustomL1(); }
