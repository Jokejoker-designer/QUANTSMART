// quantMacroRegistry — a MACRO is a reusable named subtree (a QuantFormulaAst with declared input slots). MACRO_REF
// nodes bind their children positionally to the macro's inputs and may pass a window that the macro's rolling nodes
// inherit. Macros build the ecosystem primitive → formula → macro → module. User-created macros default SHADOW.
import { mkInput, mkConst, mkOp, type QuantFormulaAst, type QuantAstNode, QUANT_AUTHORITY } from "./quantAstTypes.ts";

export interface QuantMacro { macroId: string; name: string; inputs: string[]; ast: QuantFormulaAst; description: string; status: "SEED" | "SHADOW" }

function astFrom(name: string, nodes: QuantAstNode[], rootId: string, inputs: string[]): QuantFormulaAst {
  return { formulaId: "m_" + name, name, version: "1", rootNodeId: rootId, nodes: Object.fromEntries(nodes.map((n) => [n.nodeId, n])), inputs, outputType: "INDICATOR", authority: QUANT_AUTHORITY, status: "SHADOW" };
}

// zscore(x, W) = (x − mean(x,W)) / std(x,W) — rolling windows inherit the MACRO_REF window.
function zscoreMacro(): QuantMacro {
  const x = mkInput("x", "x"), mean = mkOp("ROLL_MEAN", ["x"], undefined, "mean"), sub = mkOp("SUB", ["x", "mean"], undefined, "sub"), std = mkOp("ROLL_STD", ["x"], undefined, "std"), div = mkOp("DIV", ["sub", "std"], undefined, "div");
  return { macroId: "zscore", name: "ZScore", inputs: ["x"], description: "Rolling z-score over window W.", status: "SEED", ast: astFrom("ZScore", [x, mean, sub, std, div], "div", ["x"]) };
}
// safe_ratio(a, b) = a / b (KIDI guarded).
function safeRatioMacro(): QuantMacro {
  const a = mkInput("a", "a"), b = mkInput("b", "b"), div = mkOp("DIV", ["a", "b"], undefined, "div");
  return { macroId: "safe_ratio", name: "SafeRatio", inputs: ["a", "b"], description: "Numerically guarded ratio; near-zero denominator returns the configured fallback.", status: "SEED", ast: astFrom("SafeRatio", [a, b, div], "div", ["a", "b"]) };
}
// minmax_norm(x, W) = (x − min(x,W)) / (max(x,W) − min(x,W)) → [0,1].
function minmaxMacro(): QuantMacro {
  const x = mkInput("x", "x"), mn = mkOp("ROLL_MIN", ["x"], undefined, "mn"), mx = mkOp("ROLL_MAX", ["x"], undefined, "mx"), num = mkOp("SUB", ["x", "mn"], undefined, "num"), den = mkOp("SUB", ["mx", "mn"], undefined, "den"), div = mkOp("DIV", ["num", "den"], undefined, "div");
  return { macroId: "minmax_norm", name: "MinMaxNorm", inputs: ["x"], description: "Rolling min/max normalization over W, bounded to 0–1.", status: "SEED", ast: astFrom("MinMaxNorm", [x, mn, mx, num, den, div], "div", ["x"]) };
}

export const SEED_MACROS: Record<string, QuantMacro> = Object.fromEntries([zscoreMacro(), safeRatioMacro(), minmaxMacro()].map((m) => [m.macroId, m]));
