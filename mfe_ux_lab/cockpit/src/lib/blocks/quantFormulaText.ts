// quantFormulaText — render a QuantLab AST as a PARSE-ABLE formula string (ASCII operators + whitelist function
// names), so Text → AST → Text → AST round-trips. This is both the Formula Text view and the canonical stringify
// that quantFormulaParser can read back. Pure presentation; no evaluation.
import { OP_SPEC, type QuantFormulaAst, type QuantOp } from "./quantAstTypes.ts";
import type { QuantMacro } from "./quantMacroRegistry.ts";

const SYM: Partial<Record<QuantOp, string>> = { ADD: "+", SUB: "-", MUL: "*", DIV: "/", POW: "^", GT: ">", LT: "<", EQ: "==" };
const FN: Partial<Record<QuantOp, string>> = { NEG: "neg", ABS: "abs", SIGN: "sign", LOG: "log", EXP: "exp", SQRT: "sqrt", SIGMOID: "sigmoid", TANH: "tanh", MIN: "min", MAX: "max", CLIP: "clip", ROLL_MEAN: "mean", ROLL_STD: "std", ROLL_SUM: "sum", ROLL_MAX: "rmax", ROLL_MIN: "rmin", PERCENTILE_RANK: "pctrank", LAG: "lag", DELTA: "delta", EMA: "ema", AND: "and", OR: "or", NOT: "not", MEDIAN: "median", MAD: "mad", IQR: "iqr", ROBUSTZ: "robustz", OUTLIER: "outlierscore" };

export function astToText(ast: QuantFormulaAst, label: (k: string) => string, macros: Record<string, QuantMacro> = {}): string {
  const txt = (id: string): string => {
    const nd = ast.nodes[id];
    if (!nd) return "?";
    if (nd.kind === "INPUT") return label(nd.inputRef ?? "?");
    if (nd.kind === "CONST") return String(nd.constValue ?? 0);
    const kids = (nd.children ?? []).map(txt), op = nd.op!;
    if (op === "MACRO_REF") { const m = macros[nd.params?.macroId ?? ""]; const w = nd.params?.window != null ? `, ${nd.params.window}` : ""; return `${m ? m.name : nd.params?.macroId}(${kids.join(", ")}${w})`; }
    if (SYM[op]) return `(${kids[0]} ${SYM[op]} ${kids[1]})`;
    if (op === "IF_ELSE") return `ifelse(${kids[0]}, ${kids[1]}, ${kids[2]})`;
    if (op === "CLIP") return nd.params && (nd.params.min != null || nd.params.max != null) ? `clip(${kids[0]}, ${nd.params.min ?? -1}, ${nd.params.max ?? 1})` : `clip(${kids[0]})`;
    if (op === "QUANTILE" || op === "WINSOR") return `${op === "QUANTILE" ? "quantile" : "winsorize"}(${kids[0]}, ${nd.params?.q ?? 0.5}, ${nd.params?.window ?? 20})`;
    if (OP_SPEC[op]?.windowed) return `${FN[op]}(${kids[0]}, ${nd.params?.window ?? 20})`;
    if (op === "LAG" || op === "DELTA") return `${FN[op]}(${kids[0]}, ${nd.params?.lag ?? 1})`;
    return `${FN[op] ?? op.toLowerCase()}(${kids.join(", ")})`;
  };
  const head = ast.outputType === "PROBABILITY_LIKE_SCORE" ? "p = " : ast.outputType === "INDICATOR" ? "ind = " : ast.outputType === "EV_COMPONENT" ? "ev = " : "score = ";
  return head + txt(ast.rootNodeId);
}
