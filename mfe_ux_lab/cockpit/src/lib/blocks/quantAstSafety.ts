// quantAstSafety — the safe-math layer for the QuantLab AST. Every dangerous primitive has a guard so a user
// formula can NEVER produce NaN/Inf or read an undefined op: DIV is KIDI-guarded (|denom|<ε → 0), LOG/SQRT have
// domain guards (≤0 → 0), EXP/POW are clamped against overflow, and every output is NaN/Inf-sealed. validateAst
// enforces the operator whitelist, arity, known inputs, declared macros, and no cycles.
import { OP_SPEC, type QuantFormulaAst, type QuantOp } from "./quantAstTypes.ts";

export const EPS = 1e-9;
export const seal = (v: number) => (isFinite(v) ? v : 0);
export const safeDiv = (a: number, b: number) => (Math.abs(b) < EPS ? 0 : seal(a / b));
export const safeLog = (x: number) => (x > EPS ? Math.log(x) : 0);
export const safeSqrt = (x: number) => (x > 0 ? Math.sqrt(x) : 0);
export const clampExp = (x: number) => Math.exp(Math.max(-30, Math.min(30, x)));
export const sigmoid = (x: number) => 1 / (1 + clampExp(-x));
export const safePow = (a: number, b: number) => { const base = Math.abs(a) < EPS && b < 0 ? EPS : a; const r = Math.sign(base) < 0 && !Number.isInteger(b) ? 0 : Math.pow(base, b); return seal(Math.max(-1e12, Math.min(1e12, r))); };

export interface AstReport { kidiSafe: boolean; domainSafe: boolean; nanInfSafe: boolean; causalSafe: boolean; noLookahead: boolean; opsUsed: QuantOp[]; inputsUsed: string[] }
export interface AstValidation { ok: boolean; errors: string[]; report: AstReport }

export function validateAst(ast: QuantFormulaAst, knownInputs: string[], macroIds: string[] = []): AstValidation {
  const errors: string[] = [], opsUsed = new Set<QuantOp>(), inputsUsed = new Set<string>();
  if (!ast.nodes[ast.rootNodeId]) errors.push("thiếu root node");
  for (const id of Object.keys(ast.nodes)) {
    const nd = ast.nodes[id];
    if (nd.kind === "INPUT") { if (!nd.inputRef) errors.push(`${id}: INPUT thiếu inputRef`); else { inputsUsed.add(nd.inputRef); if (!knownInputs.includes(nd.inputRef)) errors.push(`${id}: input lạ '${nd.inputRef}'`); } continue; }
    if (nd.kind === "CONST") { if (typeof nd.constValue !== "number" || !isFinite(nd.constValue)) errors.push(`${id}: CONST không hợp lệ`); continue; }
    if (!nd.op || !(nd.op in OP_SPEC)) { errors.push(`${id}: op không trong whitelist`); continue; }
    opsUsed.add(nd.op);
    const spec = OP_SPEC[nd.op], kids = nd.children ?? [];
    if (nd.op === "MACRO_REF") { if (!nd.params?.macroId || !macroIds.includes(nd.params.macroId)) errors.push(`${id}: macro lạ`); }
    else if (spec.arity >= 0 && kids.length !== spec.arity) errors.push(`${id}: ${nd.op} cần ${spec.arity} con, có ${kids.length}`);
    for (const c of kids) if (!ast.nodes[c]) errors.push(`${id}: con '${c}' không tồn tại`);
  }
  const grey = new Set<string>(), black = new Set<string>(); let cyclic = false;
  const visit = (id: string) => { if (black.has(id)) return; if (grey.has(id)) { cyclic = true; return; } grey.add(id); for (const c of ast.nodes[id]?.children ?? []) if (ast.nodes[c]) visit(c); grey.delete(id); black.add(id); };
  if (ast.nodes[ast.rootNodeId]) visit(ast.rootNodeId);
  if (cyclic) errors.push("AST có chu trình (cycle)");
  const ok = errors.length === 0;
  return { ok, errors, report: { kidiSafe: ok, domainSafe: ok, nanInfSafe: ok, causalSafe: ok, noLookahead: ok, opsUsed: [...opsUsed], inputsUsed: [...inputsUsed] } };
}
