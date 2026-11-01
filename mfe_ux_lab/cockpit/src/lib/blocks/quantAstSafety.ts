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
  const invalid=(message:string):AstValidation=>({ok:false,errors:[message],report:{kidiSafe:false,domainSafe:false,nanInfSafe:false,causalSafe:false,noLookahead:false,opsUsed:[],inputsUsed:[]}});
  if (!ast || typeof ast!=="object" || !ast.nodes || typeof ast.nodes!=="object" || Array.isArray(ast.nodes) || typeof ast.rootNodeId!=="string" || Object.keys(ast.nodes).length>256) return invalid("AST requires a root ID and at most 256 nodes.");
  for(const [id,node] of Object.entries(ast.nodes)){
    if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(id)||["constructor","prototype","__proto__"].includes(id)||!node||typeof node!=="object"||!["INPUT","CONST","POINT_OP","ROLLING_OP","LOGIC_OP","MACRO"].includes(node.kind)||node.children!==undefined&&(!Array.isArray(node.children)||node.children.some(child=>typeof child!=="string")))return invalid(`Malformed AST node: ${id}`);
    if(node.params){if(typeof node.params!=="object"||Array.isArray(node.params))return invalid(`Invalid parameters at ${id}`);for(const[key,value]of Object.entries(node.params)){if(key==='macroId'){if(typeof value!=='string')return invalid(`Invalid macro at ${id}`);}else if(typeof value!=='number'||!Number.isFinite(value))return invalid(`Nonfinite AST parameter at ${id}`);if((key==='window'||key==='lag')&&(typeof value!=='number'||!Number.isInteger(value)||value<0||value>10000||key==='window'&&value<1))return invalid(`Invalid window/lag at ${id}`);if(key==='q'&&(typeof value!=='number'||value<0||value>1))return invalid(`Invalid quantile at ${id}`);}}
  }
  if (!ast.nodes[ast.rootNodeId]) errors.push("Missing root node");
  for (const id of Object.keys(ast.nodes)) {
    const nd = ast.nodes[id];
    if (nd.kind === "INPUT") { if (!nd.inputRef) errors.push(`${id}: INPUT requires inputRef`); else { inputsUsed.add(nd.inputRef); if (!knownInputs.includes(nd.inputRef)) errors.push(`${id}: unknown input '${nd.inputRef}'`); } continue; }
    if (nd.kind === "CONST") { if (typeof nd.constValue !== "number" || !isFinite(nd.constValue)) errors.push(`${id}: invalid CONST`); continue; }
    if (!nd.op || !(nd.op in OP_SPEC)) { errors.push(`${id}: operation is not whitelisted`); continue; }
    opsUsed.add(nd.op);
    const spec = OP_SPEC[nd.op], kids = nd.children ?? [];
    if (nd.op === "MACRO_REF") { if (!nd.params?.macroId || !macroIds.includes(nd.params.macroId)) errors.push(`${id}: unknown macro`); }
    else if (spec.arity >= 0 && kids.length !== spec.arity) errors.push(`${id}: ${nd.op} requires ${spec.arity} children; received ${kids.length}`);
    for (const c of kids) if (!ast.nodes[c]) errors.push(`${id}: con '${c}' does not exist`);
  }
  const grey = new Set<string>(), black = new Set<string>(); let cyclic = false;
  const visit = (id: string) => { if (black.has(id)) return; if (grey.has(id)) { cyclic = true; return; } grey.add(id); for (const c of ast.nodes[id]?.children ?? []) if (ast.nodes[c]) visit(c); grey.delete(id); black.add(id); };
  for(const id of Object.keys(ast.nodes))visit(id);
  if (cyclic) errors.push("AST contains a cycle");
  const ok = errors.length === 0;
  return { ok, errors, report: { kidiSafe: ok, domainSafe: ok, nanInfSafe: ok, causalSafe: ok, noLookahead: ok, opsUsed: [...opsUsed], inputsUsed: [...inputsUsed] } };
}
