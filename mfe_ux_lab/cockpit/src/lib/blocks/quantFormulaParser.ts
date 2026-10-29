// quantFormulaParser — the Text → AST half of the bidirectional QuantLab DSL (the AST → Text half is astToText, and
// the Block view IS the AST nodes — so AST is the single source of truth). A safe recursive-descent parser for a
// math DSL: numbers, input identifiers, infix + − × ÷ ^ > < ==, and whitelisted function calls (sigmoid, log,
// mean, ema, zscore, gate, ifelse…). It is NOT code: no JS/Python, no calls outside the whitelist, and BUY/SELL/
// ORDER/ZONE/LOT/eval/fetch/loops are hard-blocked with a clear error. Output is always a number-producing AST.
import { mkInput, mkConst, mkOp, nid, QUANT_AUTHORITY, type QuantAstNode, type QuantFormulaAst, type QuantOp, type QuantOutputType } from "./quantAstTypes.ts";
import { SEED_MACROS } from "./quantMacroRegistry.ts";
import { validateAst } from "./quantAstSafety.ts";

const UNARY: Record<string, QuantOp> = { sigmoid: "SIGMOID", tanh: "TANH", log: "LOG", exp: "EXP", sqrt: "SQRT", abs: "ABS", neg: "NEG", sign: "SIGN", not: "NOT" };
const BINARY_FN: Record<string, QuantOp> = { min: "MIN", max: "MAX", and: "AND", or: "OR" };
const WINDOWED: Record<string, QuantOp> = { mean: "ROLL_MEAN", std: "ROLL_STD", sum: "ROLL_SUM", rollmax: "ROLL_MAX", rmax: "ROLL_MAX", rollmin: "ROLL_MIN", rmin: "ROLL_MIN", ema: "EMA", percentile: "PERCENTILE_RANK", pctrank: "PERCENTILE_RANK", median: "MEDIAN", mad: "MAD", iqr: "IQR", robustz: "ROBUSTZ", outlierscore: "OUTLIER" };
const LAGGED: Record<string, QuantOp> = { lag: "LAG", delta: "DELTA" };
const INFIX: Record<string, QuantOp> = { "+": "ADD", "-": "SUB", "*": "MUL", "/": "DIV", "^": "POW", ">": "GT", "<": "LT", "==": "EQ" };
const BLOCKED = new Set(["buy", "sell", "order", "order_send", "ordersend", "entry", "exit", "zone", "lot", "tp", "sl", "eval", "fetch", "import", "require", "for", "while", "function", "await", "async"]);
const WINDOWED_MACROS = new Set(["zscore", "minmax_norm"]);
const MACRO_BY_NAME: Record<string, string> = {};
for (const id of Object.keys(SEED_MACROS)) { MACRO_BY_NAME[id.toLowerCase()] = id; MACRO_BY_NAME[SEED_MACROS[id].name.toLowerCase()] = id; }

type Tok = { t: "NUM" | "ID" | "OP" | "LP" | "RP" | "COMMA"; v?: string };
function tokenize(s: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] ?? ""))) { let j = i + 1; while (j < s.length && /[0-9.]/.test(s[j])) j++; out.push({ t: "NUM", v: s.slice(i, j) }); i = j; continue; }
    if (/[A-Za-z_]/.test(ch)) { let j = i + 1; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; out.push({ t: "ID", v: s.slice(i, j) }); i = j; continue; }
    if (ch === "=" && s[i + 1] === "=") { out.push({ t: "OP", v: "==" }); i += 2; continue; }
    if ("+-*/^><".includes(ch)) { out.push({ t: "OP", v: ch }); i++; continue; }
    if (ch === "(") { out.push({ t: "LP" }); i++; continue; }
    if (ch === ")") { out.push({ t: "RP" }); i++; continue; }
    if (ch === ",") { out.push({ t: "COMMA" }); i++; continue; }
    throw new Error(`Ký tự lạ: '${ch}'`);
  }
  return out;
}

export interface ParseResult { ast: QuantFormulaAst | null; errors: string[] }

export function parseFormula(text: string, knownInputs?: string[]): ParseResult {
  const errors: string[] = [];
  let body = text.trim(), outputType: QuantOutputType = "SCORE", fname = "formula";
  const m = body.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/);
  if (m) { fname = m[1]; const n = m[1].toLowerCase(); body = m[2]; if (n === "p" || n === "prob" || n === "probability") outputType = "PROBABILITY_LIKE_SCORE"; else if (n === "ind" || n === "indicator") outputType = "INDICATOR"; else if (n === "ev") outputType = "EV_COMPONENT"; }

  try {
    const toks = tokenize(body);
    if (!toks.length) throw new Error("Công thức rỗng");
    const nodes: Record<string, QuantAstNode> = {}, inputs = new Set<string>();
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    const eat = (t: Tok["t"]) => { if (peek()?.t !== t) throw new Error(`Cần '${t}' tại vị trí ${pos}`); return next(); };
    const add = (n: QuantAstNode) => { nodes[n.nodeId] = n; return n.nodeId; };
    const litOf = (id: string) => { const n = nodes[id]; return n && n.kind === "CONST" ? (n.constValue ?? 0) : null; };
    const needWin = (name: string, args: string[]) => { const w = litOf(args[args.length - 1]); if (w == null) throw new Error(`${name}: cửa sổ phải là một số`); delete nodes[args[args.length - 1]]; return Math.max(1, Math.round(w)); };

    function parseExpr(): string { return parseCmp(); }
    function parseCmp(): string { let l = parseAdd(); while (peek()?.t === "OP" && [">", "<", "=="].includes(peek()!.v!)) { const op = next().v!; l = add(mkOp(INFIX[op], [l, parseAdd()])); } return l; }
    function parseAdd(): string { let l = parseMul(); while (peek()?.t === "OP" && (peek()!.v === "+" || peek()!.v === "-")) { const op = next().v!; l = add(mkOp(INFIX[op], [l, parseMul()])); } return l; }
    function parseMul(): string { let l = parsePow(); while (peek()?.t === "OP" && (peek()!.v === "*" || peek()!.v === "/")) { const op = next().v!; l = add(mkOp(INFIX[op], [l, parsePow()])); } return l; }
    function parsePow(): string { const l = parseUnary(); if (peek()?.t === "OP" && peek()!.v === "^") { next(); return add(mkOp("POW", [l, parsePow()])); } return l; }
    function parseUnary(): string { if (peek()?.t === "OP" && peek()!.v === "-") { next(); const id = parseUnary(); const nd = nodes[id]; if (nd && nd.kind === "CONST") { nd.constValue = -(nd.constValue ?? 0); return id; } return add(mkOp("NEG", [id])); } if (peek()?.t === "OP" && peek()!.v === "+") { next(); return parseUnary(); } return parsePrimary(); }
    function parsePrimary(): string {
      const tk = peek();
      if (!tk) throw new Error("Hết token bất ngờ");
      if (tk.t === "NUM") { next(); return add(mkConst(parseFloat(tk.v!), nid("c"))); }
      if (tk.t === "LP") { next(); const e = parseExpr(); eat("RP"); return e; }
      if (tk.t === "ID") {
        next();
        const name = tk.v!, lower = name.toLowerCase();
        if (peek()?.t === "LP") { next(); const args = parseArgs(); return buildCall(name, lower, args); }
        if (BLOCKED.has(lower)) throw new Error(`Bị chặn: '${name}' không được phép`);
        inputs.add(name); return add(mkInput(name, nid("in")));
      }
      throw new Error(`Token lạ '${tk.v ?? tk.t}'`);
    }
    function parseArgs(): string[] { const a: string[] = []; if (peek()?.t !== "RP") { a.push(parseExpr()); while (peek()?.t === "COMMA") { next(); a.push(parseExpr()); } } eat("RP"); return a; }

    function buildCall(name: string, lower: string, args: string[]): string {
      if (BLOCKED.has(lower)) throw new Error(`Bị chặn: '${name}()' không được tạo lệnh / vùng / order`);
      const need = (k: number) => { if (args.length !== k) throw new Error(`${name}() cần ${k} đối số, có ${args.length}`); };
      if (lower === "gate") { need(1); return args[0]; }
      if (lower === "clip") { if (args.length === 1) return add(mkOp("CLIP", [args[0]])); if (args.length === 3) { const lo = litOf(args[1]), hi = litOf(args[2]); if (lo == null || hi == null) throw new Error("clip(x, lo, hi): lo/hi phải là số"); delete nodes[args[1]]; delete nodes[args[2]]; return add(mkOp("CLIP", [args[0]], { min: lo, max: hi })); } throw new Error("clip cần 1 hoặc 3 đối số"); }
      if (lower === "ifelse") { need(3); return add(mkOp("IF_ELSE", [args[0], args[1], args[2]])); }
      if (UNARY[lower]) { need(1); return add(mkOp(UNARY[lower], [args[0]])); }
      if (BINARY_FN[lower]) { need(2); return add(mkOp(BINARY_FN[lower], [args[0], args[1]])); }
      if (lower === "quantile" || lower === "winsorize") { if (args.length !== 3) throw new Error(`${name}(x, q, W) cần 3 đối số`); const w = needWin(name, args); const q = litOf(args[1]); if (q == null) throw new Error(`${name}: q phải là một số`); delete nodes[args[1]]; return add(mkOp(lower === "quantile" ? "QUANTILE" : "WINSOR", [args[0]], { q, window: w })); }
      if (WINDOWED[lower]) { if (args.length !== 2) throw new Error(`${name}(x, W) cần 2 đối số`); const w = needWin(name, args); return add(mkOp(WINDOWED[lower], [args[0]], { window: w })); }
      if (LAGGED[lower]) { if (args.length !== 2) throw new Error(`${name}(x, k) cần 2 đối số`); const k = needWin(name, args); return add(mkOp(LAGGED[lower], [args[0]], { lag: k })); }
      if (MACRO_BY_NAME[lower]) {
        const macroId = MACRO_BY_NAME[lower], macro = SEED_MACROS[macroId];
        let win: number | undefined; let kids = args;
        if (WINDOWED_MACROS.has(macroId)) { win = needWin(name, args); kids = args.slice(0, -1); }
        if (kids.length !== macro.inputs.length) throw new Error(`${macro.name} cần ${macro.inputs.length} input`);
        return add(mkOp("MACRO_REF", kids, { macroId, window: win }));
      }
      throw new Error(`Hàm lạ: '${name}()' không có trong whitelist`);
    }

    const rootNodeId = parseExpr();
    if (pos < toks.length) throw new Error(`Thừa token sau công thức (vị trí ${pos})`);
    const ast: QuantFormulaAst = { formulaId: "f" + Date.now().toString(36), name: fname, version: "1", rootNodeId, nodes, inputs: [...inputs], outputType, authority: QUANT_AUTHORITY, status: "DRAFT" };
    if (knownInputs) { const v = validateAst(ast, knownInputs, Object.keys(SEED_MACROS)); if (!v.ok) errors.push(...v.errors); }
    return { ast, errors };
  } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); return { ast: null, errors }; }
}
