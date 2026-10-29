// quantFlowGraph — the data model + conversions for the L3 Block-Tree "Nối" (wire) canvas. NATIVE to QuantAST
// (NOT a copy of L1's FeatureGraph — that has a different node/port model and copying it verbatim is bug-prone).
// A graph is QuantAST nodes + xy positions + a designated OUTPUT (root). It converts BOTH ways:
//   graphFromAst(ast)  → seed an editable graph (auto-layout)           [Text → Block Tree wire view]
//   graphToText(graph) → AST (reusing mkOp/mkInput/mkConst) → astToText [Block Tree → Formula Text]
// Reuses the AST mk* helpers so safety/authority are always correct. Advisory · no order · numbers only.
import { OP_SPEC, mkInput, mkConst, mkOp, nid, QUANT_AUTHORITY, type QuantAstNode, type QuantFormulaAst, type QuantOp, type QuantNodeKind } from "./quantAstTypes.ts";
import { astToText } from "./quantFormulaText.ts";
import { QUANT_BLOCK_BY_ID, type QuantBlockSpec } from "./quantBlockSpec.ts";

export interface QuantGraphNode {
  id: string;
  kind: QuantNodeKind;
  op?: QuantOp;
  inputRef?: string;                 // INPUT: evidence series key
  constValue?: number;               // CONST
  macroId?: string;                  // MACRO_REF: which saved macro (preserved so round-trip doesn't drop it)
  params?: Record<string, number>;   // window / lag / q / min / max
  children: (string | null)[];       // wired operand ids per port (null = unwired); length === arity
  x: number; y: number;
}
export interface QuantGraph { nodes: QuantGraphNode[]; output: string | null }

// operand-input count for a node (= the number of wireable ports). INPUT/CONST = 0 (sources). Window/lag are PARAMS,
// not wired inputs. MACRO = its current child count (macros aren't created on the canvas in v1).
export function arityOf(n: { kind: QuantNodeKind; op?: QuantOp; children: (string | null)[] }): number {
  if (n.kind === "INPUT" || n.kind === "CONST") return 0;
  if (!n.op) return 0;
  if (n.op === "MACRO_REF") return n.children.length;
  return Math.max(0, OP_SPEC[n.op]?.arity ?? 0);
}

const PAD = 30, COLW = 190, ROWH = 84, NODEW = 146, NODEH = 46;
export const NODE_W = NODEW, NODE_H = NODEH;

// auto-layout LEFT→RIGHT (data-flow reading order): leaf INPUT/CONST on the left, OUTPUT on the far right. depth = max
// children-distance from this node (leaf = 0, OUTPUT = deepest). x grows WITH depth so wires never sweep backwards.
export function autoLayout(g: QuantGraph): void {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const calc = (id: string, stack: Set<string>): number => {
    const c = depth.get(id); if (c !== undefined) return c;
    const n = byId.get(id); if (!n || stack.has(id)) return 0;
    stack.add(id); let d = 0; for (const ch of n.children) if (ch) d = Math.max(d, calc(ch, stack) + 1);
    stack.delete(id); depth.set(id, d); return d;
  };
  g.nodes.forEach((n) => calc(n.id, new Set()));
  const cols = new Map<number, QuantGraphNode[]>();
  g.nodes.forEach((n) => { const d = depth.get(n.id) ?? 0; (cols.get(d) ?? cols.set(d, []).get(d)!).push(n); });
  for (const [d, list] of cols) list.forEach((n, i) => { n.x = PAD + d * COLW; n.y = PAD + i * ROWH; });   // depth 0 (leaves) → left · OUTPUT (deepest) → right
}

// seed an editable graph from a parsed AST (Text → wire view)
export function graphFromAst(ast: QuantFormulaAst): QuantGraph {
  const nodes: QuantGraphNode[] = Object.values(ast.nodes).map((nd) => {
    const n: QuantGraphNode = { id: nd.nodeId, kind: nd.kind, op: nd.op, inputRef: nd.inputRef, constValue: nd.constValue, macroId: nd.params?.macroId,
      params: nd.params ? Object.fromEntries(Object.entries(nd.params).filter(([k, v]) => k !== "macroId" && typeof v === "number")) as Record<string, number> : undefined,
      children: (nd.children ?? []).slice(), x: 0, y: 0 };
    const a = arityOf(n); while (n.children.length < a) n.children.push(null);   // pad to arity
    return n;
  });
  const g: QuantGraph = { nodes, output: ast.rootNodeId };
  autoLayout(g);
  return g;
}

const DEFAULT_PARAM: Record<string, number> = { window: 20, lag: 1, q: 0.9, min: 0, max: 1 };
// create a graph node from a Node-Library block (drop on canvas). Only KERNEL ops / input / const are creatable.
export function nodeFromBlock(block: QuantBlockSpec, x: number, y: number): QuantGraphNode | null {
  const id = nid("g");
  if (block.kind === "INPUT") return { id, kind: "INPUT", inputRef: "ema_slope", children: [], x, y };
  if (block.kind === "CONST") return { id, kind: "CONST", constValue: 1, children: [], x, y };
  if (!block.op || block.impl !== "KERNEL") return null;
  const op = block.op;
  const params: Record<string, number> = {};
  for (const p of block.params) params[p] = DEFAULT_PARAM[p] ?? 14;
  return { id, kind: OP_SPEC[op].kind, op, params: Object.keys(params).length ? params : undefined, children: Array(Math.max(0, OP_SPEC[op].arity)).fill(null), x, y };
}

// convert the graph → AST (only nodes reachable from OUTPUT, all required ports wired, no cycles). Reuses mk* helpers.
export function graphToAst(g: QuantGraph): { ast: QuantFormulaAst | null; error: string | null } {
  if (!g.output) return { ast: null, error: "Chưa chọn node OUTPUT — bấm ✪ trên 1 node để đặt ngõ ra." };
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const built: Record<string, QuantAstNode> = {};
  let err: string | null = null;
  const build = (id: string, stack: Set<string>): boolean => {
    if (built[id]) return true;
    const n = byId.get(id); if (!n) { err = "Node mất tham-chiếu."; return false; }
    if (stack.has(id)) { err = "Có chu-trình trong graph."; return false; }
    stack.add(id);
    if (n.kind === "INPUT") built[id] = mkInput(n.inputRef ?? "ema_slope", id);
    else if (n.kind === "CONST") built[id] = mkConst(n.constValue ?? 0, id);
    else if (n.op) {
      const a = arityOf(n); const kids: string[] = [];
      for (let k = 0; k < a; k++) { const c = n.children[k]; if (!c) { err = `Node "${OP_SPEC[n.op]?.label ?? n.op}" còn cổng vào chưa nối.`; stack.delete(id); return false; } if (!build(c, stack)) { stack.delete(id); return false; } kids.push(c); }
      built[id] = mkOp(n.op, kids, n.op === "MACRO_REF" ? { ...n.params, macroId: n.macroId } : n.params, id);   // restore macroId so macros round-trip
    } else { err = "Node không hợp-lệ."; stack.delete(id); return false; }
    stack.delete(id); return true;
  };
  if (!build(g.output, new Set())) return { ast: null, error: err };
  return { ast: { formulaId: "fg" + Date.now().toString(36), name: "graph", version: "1", rootNodeId: g.output, nodes: built, inputs: [], outputType: "SCORE", authority: QUANT_AUTHORITY, status: "DRAFT" }, error: null };
}

// Block Tree → Formula Text. Returns the parseable text, or an error if the graph is incomplete.
export function graphToText(g: QuantGraph): { text: string | null; error: string | null } {
  const r = graphToAst(g);
  if (!r.ast) return { text: null, error: r.error };
  return { text: astToText(r.ast, (k) => k, {}), error: null };
}
