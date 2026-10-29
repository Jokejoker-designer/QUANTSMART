// customL2 — persistence for user-built L2 (Indicator/Context) modules. An L2 module = a Weighted Sum of
// chosen L1 features + an output kind (composite INDICATOR or a 3-state REGIME). Saved SHADOW; authority is
// L2-locked (context only, no order). Distinct from customL1 (L1 = measurement) and customModule (L4/L5 rules).
import type { FeatureUsageRole } from "./featureRoles.ts";
import type { OverlayLineSpec } from "./overlayGraph.ts";

export type L2Status = "SHADOW" | "PROMOTED";
export type L2Kind = "indicator" | "regime" | "bias" | "confidence" | "overlay";
export type WeightSrc = "USER_WEIGHTED" | "SELF_CALIBRATING";
export interface CustomL2Module {
  id: string;
  name: string;
  explain: string;
  kind: L2Kind;                       // INDICATOR / regime CONTEXT / BIAS_CONTEXT / CONFIDENCE / OVERLAY (lines on price)
  featureKeys: string[];              // L1 feature inputs (built-in keys or PROMOTED customL1 ids)
  weights: Record<string, number>;    // fusion weights
  weightSrc?: Record<string, WeightSrc>;  // per-feature: USER_WEIGHTED or SELF_CALIBRATING (→ SHADOW)
  primaryRole?: FeatureUsageRole;     // usage role (slot), NOT authority
  overlayKey?: string;                // kind="overlay" RECIPE: which price-overlay recipe (ema/bollinger/ichimoku/fib…)
  overlayParams?: Record<string, number>;  // overlay recipe params the user configured (period/mult/levels)
  overlayLines?: OverlayLineSpec[];   // kind="overlay" FROM-SCRATCH: raw L1 line specs (source→window→band)
  status: L2Status;
  createdAt: string;
}

const KEY = "mfe_custom_l2";
let _mem: CustomL2Module[] | null = null;
export function loadCustomL2(): CustomL2Module[] {
  if (_mem) return _mem;
  try { const raw = localStorage.getItem(KEY); _mem = raw ? (JSON.parse(raw) as CustomL2Module[]) : []; } catch { _mem = []; }
  return _mem!;
}
export function saveCustomL2(list: CustomL2Module[]): void { _mem = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* mem-only */ } }
export function setL2ModuleStatus(id: string, status: L2Status): CustomL2Module[] { const list = loadCustomL2().map((m) => (m.id === id ? { ...m, status } : m)); saveCustomL2(list); return list; }
export function deleteCustomL2(id: string): CustomL2Module[] { const list = loadCustomL2().filter((m) => m.id !== id); saveCustomL2(list); return list; }

// Refresh after an explicit portable-definition import.
export function reloadCustomL2() { _mem = null; return loadCustomL2(); }
