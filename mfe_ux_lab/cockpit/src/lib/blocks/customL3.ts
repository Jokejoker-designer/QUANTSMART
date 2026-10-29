// customL3 — persistence for QuantLab formulas saved as L3 Scoring modules (WO-QL7). A formula only becomes a real
// artifact once it's an object with id/version/astHash/authority/passport — that's the bridge from the lab to the
// Strategy Canvas. Saved SHADOW only (no promote-to-active), advisory, number-output, never order/zone/entry. The
// astHash is id-INDEPENDENT (canonical traversal) so the same formula → same hash, and editing it changes the hash.
import type { QuantFormulaAst, QuantOutputType } from "./quantAstTypes.ts";
import type { ValidationReport } from "./quantValidation.ts";

export type CheckStatus = "NOT_RUN" | "PASS" | "FAIL" | "PARTIAL";

export interface L3InputSource { key: string; sourceLayer: "L1" | "L2"; sourceId: string; timeframe?: string; asOfPolicy: "CLOSED_ONLY" }
export interface CustomL3Module {
  id: string;
  name: string;
  layer: "L3";
  moduleType: "QUANT_FORMULA_AST";
  formulaText: string;
  ast: QuantFormulaAst;
  astHash: string;
  version: string;
  inputSources: L3InputSource[];
  outputType: QuantOutputType;
  status: "SHADOW";
  authority: { advisoryOnly: true; noEntry: true; noExit: true; noZone: true; noOrderSend: true; noAutoLot: true; notLiveReady: true };
  safety: { parsePass: boolean; finiteOutput: boolean; kidiSafe: boolean; noLookahead: boolean; causalSafe: boolean; authorityLocked: boolean };
  validation: { structuralStatus: "PASS" | "FAIL"; oosStatus: CheckStatus; walkForwardStatus: CheckStatus; monteCarloStatus: CheckStatus; eraStabilityStatus: CheckStatus };
  validationReport?: ValidationReport;   // QL-8 result if validation has been run (real numbers, never fabricated)
  createdAt: string;
  updatedAt: string;
}

export const L3_AUTHORITY = { advisoryOnly: true, noEntry: true, noExit: true, noZone: true, noOrderSend: true, noAutoLot: true, notLiveReady: true } as const;

// id-independent canonical form of the AST → stable hash (same formula ⇒ same hash; edit ⇒ different hash).
function canon(ast: QuantFormulaAst, id: string): string {
  const nd = ast.nodes[id];
  if (!nd) return "?";
  if (nd.kind === "INPUT") return "IN:" + nd.inputRef;
  if (nd.kind === "CONST") return "C:" + nd.constValue;
  const p = nd.params ? JSON.stringify(Object.keys(nd.params).sort().reduce((o: Record<string, unknown>, k) => { o[k] = (nd.params as Record<string, unknown>)[k]; return o; }, {})) : "";
  const head = nd.op === "MACRO_REF" ? "M:" + nd.params?.macroId : nd.op;
  return head + p + "(" + (nd.children ?? []).map((c) => canon(ast, c)).join(",") + ")";
}
export function astHash(ast: QuantFormulaAst): string {
  const s = ast.outputType + "|" + canon(ast, ast.rootNodeId);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

const KEY = "mfe_custom_l3";
let _mem: CustomL3Module[] | null = null;
export function loadCustomL3(): CustomL3Module[] {
  if (_mem) return _mem;
  try { const raw = localStorage.getItem(KEY); _mem = raw ? (JSON.parse(raw) as CustomL3Module[]) : []; } catch { _mem = []; }
  return _mem!;
}
function persist(list: CustomL3Module[]) { _mem = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* mem-only */ } }

// create a new module or update an existing one (by id). On update, version bumps ONLY if the astHash changed.
export function upsertCustomL3(m: CustomL3Module): CustomL3Module[] {
  const list = loadCustomL3();
  const idx = list.findIndex((x) => x.id === m.id);
  if (idx >= 0) { const prev = list[idx]; const bumped = prev.astHash !== m.astHash ? String(parseInt(prev.version || "1", 10) + 1) : prev.version; const next = { ...m, version: bumped, createdAt: prev.createdAt, updatedAt: new Date().toISOString() }; const out = list.slice(); out[idx] = next; persist(out); return out; }
  persist([m, ...list]); return loadCustomL3();
}
export function deleteCustomL3(id: string): CustomL3Module[] { persist(loadCustomL3().filter((m) => m.id !== id)); return loadCustomL3(); }
export function duplicateCustomL3(id: string): CustomL3Module[] { const m = loadCustomL3().find((x) => x.id === id); if (m) { const copy: CustomL3Module = { ...m, id: "l3_" + Date.now().toString(36), name: m.name + " (copy)", version: "1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; persist([copy, ...loadCustomL3()]); } return loadCustomL3(); }
export function renameCustomL3(id: string, name: string): CustomL3Module[] { persist(loadCustomL3().map((m) => (m.id === id ? { ...m, name, updatedAt: new Date().toISOString() } : m))); return loadCustomL3(); }

// Refresh after an explicit portable-definition import.
export function reloadCustomL3() { _mem = null; return loadCustomL3(); }
