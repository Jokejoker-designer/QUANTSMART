// customMetricBridge — cầu EVIDENCE→DECISION theo doctrine BLOCK-FIRST ([[block-is-fixed-foundation-doctrine]]).
// Mọi module L1/L2/L3 = phép ghép BLOCK → luôn quy về MỘT chuỗi số causal xác định (block là bất biến). Cầu này
// biến chuỗi đó thành một METRIC hạng nhất mà điều kiện quyết định L4/L5 đọc được — ĐỒNG HẠNG với 29 metric built-in.
// KHÔNG "đăng ký từng module vào catalog" (tư duy module, brittle); mà "mọi id resolve về block-series nên luôn tính được".
// Presentation/decision-input · causal · no-lookahead · KHÔNG order. Đọc được ≠ có edge — phải Microscope.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { evalGraph } from "./blocks/featureGraph.ts";
import { l2ModuleSeries, inputSeries } from "./blocks/l2Eval.ts";
import { evaluateSeries } from "./blocks/quantAstEvaluator.ts";
import { SEED_MACROS } from "./blocks/quantMacroRegistry.ts";
import { loadCustomL1 } from "./blocks/customL1.ts";
import { loadCustomL2 } from "./blocks/customL2.ts";
import { loadCustomL3 } from "./blocks/customL3.ts";
import type { QuantFormulaAst } from "./blocks/quantAstTypes.ts";

export interface CustomMetricDef { key: string; label: string; layer: "L1" | "L2" | "L3" }

// mọi module evidence ĐÃ BUILD, dùng được làm metric quyết định (theo id). Dùng cho UI dropdown + allow-set validate.
export function listCustomMetrics(): CustomMetricDef[] {
  return [
    ...loadCustomL1().map((m) => ({ key: m.id, label: m.name, layer: "L1" as const })),
    ...loadCustomL2().map((m) => ({ key: m.id, label: m.name, layer: "L2" as const })),
    ...loadCustomL3().map((m) => ({ key: m.id, label: m.name, layer: "L3" as const })),
  ];
}
export function customMetricKeys(): Set<string> { return new Set(listCustomMetrics().map((x) => x.key)); }

function astInputs(ast: QuantFormulaAst, bars: OhlcBar[]): Record<string, number[]> {
  const refs = new Set<string>();
  for (const nd of Object.values(ast.nodes)) if (nd.kind === "INPUT" && nd.inputRef) refs.add(nd.inputRef);
  const out: Record<string, number[]> = {};
  for (const k of refs) out[k] = inputSeries(k, bars);
  return out;
}

// key (id module) → chuỗi block-computed causal (aligned với `bars`); null nếu key KHÔNG phải module evidence đã build.
export function customMetricSeries(key: string, bars: OhlcBar[]): number[] | null {
  const l1 = loadCustomL1().find((m) => m.id === key); if (l1) return evalGraph(l1.graph, bars);
  const l2 = loadCustomL2().find((m) => m.id === key); if (l2) return l2ModuleSeries(l2, bars);
  const l3 = loadCustomL3().find((m) => m.id === key); if (l3) { const ev = evaluateSeries(l3.ast, astInputs(l3.ast, bars), bars.length, SEED_MACROS); return ev.root ?? null; }
  return null;
}

// cache theo REF `bars` → (tập key đã sort) → map. Y10 chạy sim 6 lần (1 run + 5 walk-forward fold) trên các SLICE
// KHÁC nhau (mỗi fold ref bars riêng) → cache theo-fold, mỗi fold tính 1 lần thay vì recompute mỗi lần gọi trong fold.
const _rcmCache = new WeakMap<OhlcBar[], Map<string, Record<string, number[]>>>();
// từ tập metric-key một card tham chiếu → map { customKey: series }. BỎ QUA key trong `catalog` (29 built-in — engine
// tự có) và key ma (không resolve). Gated: nếu không có custom key nào → trả {} (engine byte-identical với card cũ).
export function resolveCustomMetrics(metricKeys: Iterable<string>, catalog: Set<string>, bars: OhlcBar[]): Record<string, number[]> {
  const keys = [...new Set(metricKeys)].filter((k) => !catalog.has(k));
  if (!keys.length) return {};   // gated: card chỉ dùng metric built-in → {} (không đụng cache/store)
  const sig = keys.slice().sort().join("");
  let byKey = _rcmCache.get(bars); if (!byKey) { byKey = new Map(); _rcmCache.set(bars, byKey); }
  const hit = byKey.get(sig); if (hit) return hit;
  const out: Record<string, number[]> = {};
  for (const k of keys) { const s = customMetricSeries(k, bars); if (s) out[k] = s; }
  byKey.set(sig, out); return out;
}
