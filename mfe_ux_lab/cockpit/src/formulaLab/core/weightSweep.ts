/**
 * weightSweep.ts — per-weight contribution to the modeled output.
 * Contribution is a sensitivity diagnostic, NOT a trading attribution.
 */
import type { FormulaNode } from "./coordinateTypes";
import { evalFormula, type Env, type WeightEnv } from "./formulaSurfaceEvaluator";

export interface WeightContribution {
  id: string;
  value: number;
  impact: number; // mean |Δoutput| when this weight is zeroed
  sharePct: number;
}

function meanOutput(ast: FormulaNode, envs: Env[], weights: WeightEnv): number {
  let s = 0;
  let n = 0;
  for (const env of envs) {
    const r = evalFormula(ast, env, weights);
    if (Number.isFinite(r.value)) { s += r.value; n++; }
  }
  return n ? s / n : 0;
}

export function weightContributions(
  ast: FormulaNode,
  envs: Env[],
  weights: WeightEnv,
): WeightContribution[] {
  const base = meanOutput(ast, envs, weights);
  const ids = Object.keys(weights);
  const raw = ids.map((id) => {
    const zeroed = meanOutput(ast, envs, { ...weights, [id]: 0 });
    return { id, value: weights[id], impact: Math.abs(base - zeroed) };
  });
  const total = raw.reduce((a, b) => a + b.impact, 0) || 1;
  return raw
    .map((r) => ({ ...r, sharePct: (r.impact / total) * 100 }))
    .sort((a, b) => b.impact - a.impact);
}

// surface render mode — WebGL when available, canvas-projection fallback otherwise.
export type SurfaceRenderMode = "WEBGL" | "CANVAS_FALLBACK";
export function surfaceRenderMode(hasWebGL: boolean): SurfaceRenderMode {
  return hasWebGL ? "WEBGL" : "CANVAS_FALLBACK";
}
export function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}
