// tierToFormulaLab — Pha V: đẩy đầu-ra MỖI tầng (L1 feature · L2 indicator · L4/L5 satisfaction-margin · L6 zone-center)
// vào Formula Coordinate Lab (2D/heatmap/3D tự có bên trong). Đẩy TÍN-HIỆU LIÊN TỤC PRE-THRESHOLD (margin/center),
// KHÔNG phải nhị-phân → heatmap có nghĩa, nhãn "what-if · KHÔNG backtest". Adapter chỉ ĐỌC (engine byte-identical).
// Faithful: series đẩy vào Lab == series sandbox tự tính (dùng CHUNG hàm compute → maxErr 0). L3 đã có quantToFormulaLab.
import type { FormulaCoordinateInput, VariableSpec, FormulaNode, VariableLayer } from "../core/coordinateTypes";
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { evalGraph } from "../../lib/blocks/featureGraph.ts";
import { l2ModuleSeries, l1Series } from "../../lib/blocks/l2Eval.ts";
import { previewMarginSeries, buildPreviewCtx, PREVIEWABLE_METRICS } from "../../lib/moduleIntentPreview.ts";
import { customMetricSeries } from "../../lib/customMetricBridge.ts";
import { zoneCenterSeries } from "../../lib/blocks/l6Eval.ts";
import type { CustomL1Module } from "../../lib/blocks/customL1.ts";
import type { CustomL2Module } from "../../lib/blocks/customL2.ts";
import type { CustomModule } from "../../lib/customModule.ts";
import type { CustomL6Zone } from "../../lib/blocks/customL6.ts";

const SAFE = { noLookahead: true, finite: true, causalSafe: true };
const rangeOf = (s: number[]): [number, number] => { const f = s.filter(Number.isFinite); return f.length ? [Math.min(...f), Math.max(...f)] : [0, 1]; };
const mkVar = (id: string, name: string, series: number[], layer: VariableLayer, semantic: VariableSpec["semantic"]): VariableSpec => ({ id, displayName: name, layer, series, defaultRange: rangeOf(series), defaultTransform: "RAW", semantic, safety: SAFE });

// builder chung: OUTPUT = tín-hiệu pre-threshold (FORMULA_OUTPUT) + input vars để chọn trục · formula = identity var(out).
function build(idBase: string, name: string, text: string, outSeries: number[], inputs: VariableSpec[]): FormulaCoordinateInput {
  const outId = idBase + "_out";
  const out = mkVar(outId, name + " · signal (what-if)", outSeries, "L3_AST_NODE", "FORMULA_OUTPUT");
  const ast: FormulaNode = { kind: "var", id: outId };
  return {
    formulaId: idBase, formulaName: name + " · What-if preview; not a backtest", formulaAst: ast, formulaText: text,
    variables: [out, ...inputs], rollingVarIds: [outId, ...inputs.map((v) => v.id)],
    safety: { kidiSafe: true, noLookahead: true, finiteOutput: outSeries.every((v) => !Number.isFinite(v) || Number.isFinite(v)) },
  };
}

export function l1ToFormulaLab(m: Pick<CustomL1Module, "id" | "name" | "graph">, bars: OhlcBar[]): FormulaCoordinateInput {
  const s = evalGraph(m.graph, bars);
  return build("l1_" + m.id, m.name + " (L1 feature)", "L1 measurement «" + m.name + "»", s, []);
}
export function l2ToFormulaLab(m: CustomL2Module, bars: OhlcBar[]): FormulaCoordinateInput {
  const s = l2ModuleSeries(m, bars);
  const inputs = m.featureKeys.map((k) => mkVar("in_" + k, k, l1Series(k, bars), "L1", "CONTEXT"));
  return build("l2_" + m.id, m.name + " (L2 indicator)", "Weighted indicator sum of " + m.featureKeys.length + " feature", s, inputs);
}
// L4/L5: SATISFACTION-MARGIN (dương=thoả, âm=chưa) — tín-hiệu liên tục TRƯỚC ngưỡng gate/trigger.
export function moduleToFormulaLab(m: CustomModule, bars: OhlcBar[]): FormulaCoordinateInput {
  const r = previewMarginSeries(bars, m, customMetricSeries);
  const used = [...new Set((m.conditions || []).map((c) => c.metric))];
  const inputs: VariableSpec[] = used.map((k) => {
    if (PREVIEWABLE_METRICS.has(k)) { const s = bars.map((_, i) => (i >= 40 ? buildPreviewCtx(bars, i).ctx[k] ?? NaN : NaN)); return mkVar("in_" + k, k, s, "L2", "CONTEXT"); }
    const ev = customMetricSeries(k, bars); return mkVar("in_" + k, k, ev ?? bars.map(() => NaN), "L1", "CONTEXT");
  });
  const lvl = m.level === 4 ? "L4 gate" : "L5 " + (m.role || "decision");
  return build("cm_" + m.id, m.name + " (" + lvl + ")", "Margin to threshold (positive means the condition is open/active) · " + (m.logic === "ANY" ? "max" : "min") + " conditions", r.series, inputs);
}
export function l6ToFormulaLab(z: CustomL6Zone, bars: OhlcBar[]): FormulaCoordinateInput {
  const s = zoneCenterSeries(z, bars);
  return build("l6_" + z.id, z.name + " (L6 zone)", "Center: anchor «" + z.anchor + "» + offset × ATR (half-width ±" + z.widthAtr + " ATR)", s, []);
}
