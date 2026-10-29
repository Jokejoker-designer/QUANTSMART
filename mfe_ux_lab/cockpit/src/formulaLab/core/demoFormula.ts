/**
 * demoFormula.ts — a self-contained demo FormulaCoordinateInput so the lab
 * renders without a live QuantLab connection. The lab does NOT invent data in
 * production; this is a deterministic stand-in for the L3 input contract.
 *
 * Z = tanh( wMom*X + wRev*(Y/50 - 1) + wVol*sin(pi*X) - wLiq*|X - (Y/50 - 1)| - 0.30*ATR )
 * Z is a MODELED FORMULA OUTPUT — never an entry signal.
 */
import type { FormulaCoordinateInput, FormulaNode } from "./coordinateTypes";

// --- tiny AST builders ------------------------------------------------------
const num = (value: number): FormulaNode => ({ kind: "num", value });
const v = (id: string): FormulaNode => ({ kind: "var", id });
const w = (id: string, value: number): FormulaNode => ({ kind: "weight", id, value });
const pi: FormulaNode = { kind: "const", name: "pi" };
const add = (a: FormulaNode, b: FormulaNode): FormulaNode => ({ kind: "binary", op: "+", a, b });
const sub = (a: FormulaNode, b: FormulaNode): FormulaNode => ({ kind: "binary", op: "-", a, b });
const mul = (a: FormulaNode, b: FormulaNode): FormulaNode => ({ kind: "binary", op: "*", a, b });
const call = (fn: any, ...args: FormulaNode[]): FormulaNode => ({ kind: "call", fn, args });

// Y mapped from [0,100] to [-1,1]: Y/50 - 1
const yCentered = sub(mul(v("rsi"), num(1 / 50)), num(1));

export const DEMO_FORMULA_AST: FormulaNode = call(
  "tanh",
  sub(
    sub(
      add(
        add(mul(w("w_momentum", 0.85), v("ema_slope")), mul(w("w_meanrev", 0.55), yCentered)),
        mul(w("w_volatility", 0.2), call("sin", mul(pi, v("ema_slope")))),
      ),
      mul(w("w_liquidity", 0.15), call("abs", sub(v("ema_slope"), yCentered))),
    ),
    mul(num(0.3), v("atr")),
  ),
);

export const DEMO_FORMULA_TEXT =
  "tanh( w_momentum*EMA_Slope_z + w_meanrev*(RSI_pct/50-1) + w_volatility*sin(pi*EMA_Slope_z) - w_liquidity*|EMA_Slope_z-(RSI_pct/50-1)| - 0.30*ATR_pct )";

// Deterministic synthetic series (seeded; no randomness, no future leakage).
function synth<T>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

const N = 256;
const emaSlope = synth(N, (i) => 1.6 * Math.sin(i * 0.07) + 0.5 * Math.sin(i * 0.013));
const rsi = synth(N, (i) => 50 + 30 * Math.sin(i * 0.05 + 1) + 8 * Math.sin(i * 0.11));
const atr = synth(N, (i) => 0.4 + 0.15 * Math.sin(i * 0.03));

export function makeDemoInput(): FormulaCoordinateInput {
  return {
    formulaId: "demo-alpha-score-signal",
    formulaName: "alpha_score_signal (demo)",
    formulaAst: DEMO_FORMULA_AST,
    formulaText: DEMO_FORMULA_TEXT,
    rollingVarIds: ["ema_slope", "rsi"], // zscore/percentile are rolling ⇒ approx surface
    variables: [
      {
        id: "ema_slope",
        displayName: "EMA Slope (20) · z",
        layer: "L2",
        series: emaSlope,
        defaultRange: [-3, 3],
        defaultTransform: "ZSCORE",
        semantic: "TREND",
        safety: { noLookahead: true, finite: true, causalSafe: true },
      },
      {
        id: "rsi",
        displayName: "RSI (14) · pct",
        layer: "L2",
        series: rsi,
        defaultRange: [0, 100],
        defaultTransform: "PERCENTILE",
        semantic: "MOMENTUM",
        safety: { noLookahead: true, finite: true, causalSafe: true },
      },
      {
        id: "atr",
        displayName: "ATR Percentile (20)",
        layer: "L2",
        series: atr,
        defaultRange: [0, 1],
        defaultTransform: "RAW",
        semantic: "VOLATILITY",
        safety: { noLookahead: true, finite: true, causalSafe: true },
      },
    ],
    replayBars: synth(N, (i) => ({ timestamp: `2025-05-30T${String(i % 24).padStart(2, "0")}:00:00Z` })),
    selectedBarIndex: N - 1,
    safety: { kidiSafe: true, noLookahead: true, finiteOutput: true },
  };
}
