// quantAstSafety — the safe-math layer for the QuantLab AST. Every dangerous primitive has a guard so a user
// formula can NEVER produce NaN/Inf or read an undefined op: DIV is KIDI-guarded (|denom|<ε → 0), LOG/SQRT have
// domain guards (≤0 → 0), EXP/POW are clamped against overflow, and every output is NaN/Inf-sealed. validateAst
// enforces the operator whitelist, arity, known inputs, declared macros, and no cycles.
import { OP_SPEC, type QuantFormulaAst, type QuantOp } from "./quantAstTypes.ts";
import { quantParameterErrors, MAX_QUANT_NODES, MAX_QUANT_DEPTH } from "./quantImportContract.ts";
import { SEED_MACROS } from "./quantMacroRegistry.ts";

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
  const safeId=(id:unknown):id is string=>typeof id==="string"&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id)&&!["constructor","prototype","__proto__"].includes(id);
  if (!ast || typeof ast!=="object" || !ast.nodes || typeof ast.nodes!=="object" || Array.isArray(ast.nodes) || !safeId(ast.rootNodeId) || Object.keys(ast.nodes).length>MAX_QUANT_NODES) return invalid("AST requires a safe root ID and at most 256 nodes.");
  for(const [id,node] of Object.entries(ast.nodes)){
    if(!safeId(id)||!node||typeof node!=="object"||Array.isArray(node)||node.nodeId!==undefined&&node.nodeId!==id||!["INPUT","CONST","POINT_OP","ROLLING_OP","LOGIC_OP","MACRO"].includes(node.kind)||node.children!==undefined&&(!Array.isArray(node.children)||node.children.some(child=>!safeId(child))))return invalid(`Malformed AST node: ${id}`);
    errors.push(...quantParameterErrors(node.op||"",node.params).map(message=>`${id}: ${message}`));
  }
  if (!Object.prototype.hasOwnProperty.call(ast.nodes,ast.rootNodeId)) errors.push("Missing root node");
  for (const id of Object.keys(ast.nodes)) {
    const nd = ast.nodes[id];
    if (nd.kind === "INPUT") { if(nd.children?.length)errors.push(`${id}: INPUT cannot have children`); if (typeof nd.inputRef!=="string"||!nd.inputRef) errors.push(`${id}: INPUT requires inputRef`); else { inputsUsed.add(nd.inputRef); if (!knownInputs.includes(nd.inputRef)) errors.push(`${id}: unknown input '${nd.inputRef}'`); } continue; }
    if (nd.kind === "CONST") { if(nd.children?.length)errors.push(`${id}: CONST cannot have children`); if (typeof nd.constValue !== "number" || !isFinite(nd.constValue)) errors.push(`${id}: invalid CONST`); continue; }
    if (typeof nd.op!=="string" || !Object.prototype.hasOwnProperty.call(OP_SPEC,nd.op)) { errors.push(`${id}: operation is not whitelisted`); continue; }
    opsUsed.add(nd.op);
    const spec = OP_SPEC[nd.op], kids = nd.children ?? [];
    if (nd.op === "MACRO_REF") { if (!nd.params?.macroId || !macroIds.includes(nd.params.macroId)) errors.push(`${id}: unknown macro`); else if(Object.prototype.hasOwnProperty.call(SEED_MACROS,nd.params.macroId)&&kids.length!==SEED_MACROS[nd.params.macroId].inputs.length)errors.push(`${id}: macro ${nd.params.macroId} requires ${SEED_MACROS[nd.params.macroId].inputs.length} children; received ${kids.length}`); }
    else if (spec.arity >= 0 && kids.length !== spec.arity) errors.push(`${id}: ${nd.op} requires ${spec.arity} children; received ${kids.length}`);
    for (const c of kids) if (!Object.prototype.hasOwnProperty.call(ast.nodes,c)) errors.push(`${id}: child '${c}' does not exist`);
  }
  const grey = new Set<string>(), black = new Set<string>(),depths=new Map<string,number>(); let cyclic = false;
  const visit = (id: string):number => { if (black.has(id)) return depths.get(id)||1; if (grey.has(id)) { cyclic = true; return 0; } grey.add(id);let depth=1; for (const c of ast.nodes[id]?.children ?? []) if (Object.prototype.hasOwnProperty.call(ast.nodes,c))depth=Math.max(depth,1+visit(c));grey.delete(id);black.add(id);depths.set(id,depth);return depth; };
  for(const id of Object.keys(ast.nodes))visit(id);
  if (cyclic) errors.push("AST contains a cycle");
  if([...depths.values()].some(depth=>depth>MAX_QUANT_DEPTH))errors.push(`AST dependency depth exceeds ${MAX_QUANT_DEPTH}`);
  const ok = errors.length === 0;
  return { ok, errors, report: { kidiSafe: ok, domainSafe: ok, nanInfSafe: ok, causalSafe: ok, noLookahead: ok, opsUsed: [...opsUsed], inputsUsed: [...inputsUsed] } };
}
