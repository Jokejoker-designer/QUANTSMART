// One honest visual language for Block -> Module -> Strategy Card.
// Pure projection only: no runtime authority and no fabricated per-bar traces.
import type { L1PrimitiveBlockSpec } from "./blocks/blockTypes.ts";
import type { CustomModule } from "./customModule.ts";
import type { ModuleCensusEntry, Mechanism } from "./cardBeastV2/moduleRoleCensus.ts";
import type { StrategyCardArtifactRecord } from "./artifactRegistry.ts";

export type SemanticStage = "INPUT" | "MEASURE" | "CONTEXT" | "CANDIDATE" | "GATE" | "WEIGHT" | "FUSION" | "EXIT" | "OUTPUT" | "UNKNOWN";
export type SemanticTraceStatus = "LIVE_SERIES" | "PREVIEWABLE" | "ARTIFACT_METRICS" | "TRACE_UNAVAILABLE";
export interface SemanticNode { id: string; label: string; stage: SemanticStage; detail: string; source: "BLOCK" | "MODULE" | "CARD" | "SYSTEM"; warning?: string }
export interface SemanticLink { from: string; to: string; label: string }
export interface SemanticMetric { label: string; value: string; provenance: "CONTRACT" | "ENGINE" | "ARTIFACT" }
export interface SemanticProjection {
  id: string; kind: "BLOCK" | "MODULE" | "STRATEGY_CARD"; name: string; layer: string; role: string; mechanism: string;
  summary: string; inputs: string[]; outputs: string[]; authority: string[]; nodes: SemanticNode[]; links: SemanticLink[];
  metrics: SemanticMetric[]; warnings: string[]; traceStatus: SemanticTraceStatus; lineage: string[];
}

export const STAGE_META: Record<SemanticStage, { label: string; color: string; meaning: string }> = {
  INPUT: { label: "Source input", color: "#7aa2ff", meaning: "Dữ liệu thành phần được phép đọc" },
  MEASURE: { label: "Measurement", color: "#5ad1c4", meaning: "Biến đổi causal thành feature/số đo" },
  CONTEXT: { label: "Context", color: "#37c0ff", meaning: "Mô tả trạng thái, không tạo candidate" },
  CANDIDATE: { label: "Candidate creation", color: "#ff6a3d", meaning: "Có quyền tạo vote/setup ứng viên" },
  GATE: { label: "Veto / gate", color: "#f7768e", meaning: "Có quyền veto/quality-gate candidate" },
  WEIGHT: { label: "Weight adjustment", color: "#e3b341", meaning: "Chỉ scale vote đã tồn tại" },
  FUSION: { label: "Combination", color: "#a371f7", meaning: "Gộp evidence/vote, không tự tạo nguồn mới" },
  EXIT: { label: "Exit / R:R", color: "#c792ea", meaning: "Quản lý kết thúc hoặc hình dạng RR" },
  OUTPUT: { label: "Output", color: "#21d07a", meaning: "Đầu ra typed; authority do layer/contract quyết định" },
  UNKNOWN: { label: "Unclassified", color: "#8295aa", meaning: "Contract chưa đủ để biểu diễn" },
};

export function mechanismStage(mechanism: Mechanism | string): SemanticStage {
  if (mechanism === "TRIGGER_VOTE" || mechanism === "FALLBACK_VOTE") return "CANDIDATE";
  if (mechanism === "HARD_GATE" || mechanism === "QUALITY_GATE_ON_VOTES") return "GATE";
  if (mechanism === "WEIGHT_SCALER") return "WEIGHT";
  if (mechanism === "CONTEXT_STATE") return "CONTEXT";
  if (mechanism === "EXIT_RULE" || mechanism === "RR_SHAPER") return "EXIT";
  if (mechanism === "COMBINER") return "FUSION";
  return "UNKNOWN";
}

export function mechanismMeaning(mechanism: Mechanism | string): string {
  const base = STAGE_META[mechanismStage(mechanism)].meaning;
  if (mechanism === "FALLBACK_VOTE") return base + "; chỉ chạy khi attacker chính im lặng";
  if (mechanism === "QUALITY_GATE_ON_VOTES") return base + "; không được tự tạo vote";
  if (mechanism === "CONTEXT_STATE") return base + "; observer/advisory";
  return base;
}

export function projectBlock(block: L1PrimitiveBlockSpec): SemanticProjection {
  const ins: SemanticNode[] = block.inputs.map((x, i) => ({ id: "in_" + i, label: x.name, stage: "INPUT", detail: x.type + (x.type === "STREAM_OHLC" ? " · runtime cấp ngầm" : x.required ? " · bắt buộc" : " · tùy chọn"), source: "BLOCK" }));
  const outs: SemanticNode[] = block.outputs.map((x, i) => ({ id: "out_" + i, label: x.name, stage: "OUTPUT", detail: x.type + (x.range ? " · " + x.range : "") + (x.scaleFree ? " · scale-free" : ""), source: "BLOCK" }));
  const op: SemanticNode = { id: "transform", label: block.label, stage: "MEASURE", detail: block.description, source: "BLOCK", warning: block.provisional ? block.note || "PROVISIONAL" : undefined };
  const warnings = [block.provisional ? block.note || "Nguồn provisional, không dùng như measured evidence." : "", !block.compute ? "Runtime compute chưa có; chỉ biểu diễn contract/control node." : ""].filter(Boolean);
  return {
    id: block.blockId, kind: "BLOCK", name: block.label, layer: "L1", role: "FEATURE_MEASUREMENT", mechanism: block.group + " · " + block.viz,
    summary: block.description, inputs: block.inputs.map((x) => x.name + ": " + x.type), outputs: block.outputs.map((x) => x.name + ": " + x.type),
    authority: ["causal", "closed-bar only", "canReadFuture=false", "feature measurement only", "cannot emit signal/order"],
    nodes: [...ins, op, ...outs],
    links: [...ins.map((n) => ({ from: n.id, to: op.id, label: "reads" })), ...outs.map((n) => ({ from: op.id, to: n.id, label: "emit" }))],
    metrics: [
      { label: "Viz", value: block.viz + "/" + block.vizMode, provenance: "CONTRACT" },
      { label: "Parameters", value: String(block.parameters.length), provenance: "CONTRACT" },
      { label: "KIDI guard", value: block.safety.kidiGuardRequired ? "REQUIRED" : "N/A", provenance: "CONTRACT" },
    ],
    warnings, traceStatus: block.compute ? "LIVE_SERIES" : "TRACE_UNAVAILABLE", lineage: [block.blockId],
  };
}

export function projectEngineModule(module: ModuleCensusEntry): SemanticProjection {
  const stage = mechanismStage(module.mechanism);
  const source: SemanticNode = { id: "source", label: "OHLC + engine context", stage: "INPUT", detail: "Nguồn do one-engine cấp", source: "SYSTEM" };
  const op: SemanticNode = { id: module.id, label: module.id, stage, detail: module.note, source: "MODULE" };
  const out: SemanticNode = { id: "effect", label: STAGE_META[stage].label, stage: "OUTPUT", detail: mechanismMeaning(module.mechanism), source: "MODULE" };
  const deadlock = module.note.includes("DEADLOCK") || module.note.includes("BẪY");
  return {
    id: module.id, kind: "MODULE", name: module.id, layer: "ENGINE", role: module.role, mechanism: module.mechanism, summary: module.note,
    inputs: ["one-engine context"], outputs: [STAGE_META[stage].label],
    authority: [module.role === "SCOUT" ? "observer only" : "role=" + module.role, "SHADOW_ONLY", "NO_DECISION", "no order authority"],
    nodes: [source, op, out], links: [{ from: source.id, to: op.id, label: "evaluate" }, { from: op.id, to: out.id, label: module.mechanism }],
    metrics: [{ label: "Role", value: module.role, provenance: "ENGINE" }, { label: "Mechanism", value: module.mechanism, provenance: "ENGINE" }, { label: "Tribes", value: module.tribes.join(" · ") || "NONE", provenance: "ENGINE" }],
    warnings: [deadlock ? module.note : "Per-bar internal trace chưa được engine export; không dựng marker giả."],
    traceStatus: "TRACE_UNAVAILABLE", lineage: [module.id],
  };
}

function customStage(module: CustomModule): SemanticStage {
  if (module.role === "FEATURE" || module.role === "INDICATOR" || module.role === "ALGORITHM") return "MEASURE";
  if (module.role === "CONTEXT_GATE" || module.role === "VETO" || module.role === "SAFETY_VETO") return "GATE";
  if (module.role === "TRIGGER") return "CANDIDATE";
  if (module.role === "CONFIRM") return "WEIGHT";
  if (module.role === "EXIT") return "EXIT";
  if (module.role === "ZONE") return "OUTPUT";
  return "UNKNOWN";
}

export function projectCustomModule(module: CustomModule): SemanticProjection {
  const conditions: SemanticNode[] = module.conditions.map((c, i) => ({ id: "cond_" + i, label: c.metric, stage: "INPUT", detail: c.metric + " " + c.op + " " + c.value + (c.value2 == null ? "" : "…" + c.value2), source: "BLOCK" }));
  const stage = customStage(module);
  const logic: SemanticNode = { id: module.id, label: module.logic + " · " + module.role, stage, detail: module.explain, source: "MODULE" };
  const out: SemanticNode = { id: "effect", label: module.role, stage: "OUTPUT", detail: module.why, source: "MODULE" };
  return {
    id: module.id, kind: "MODULE", name: module.name, layer: "L" + module.level, role: module.role, mechanism: module.logic + " conditions", summary: module.explain,
    inputs: module.conditions.map((c) => c.metric), outputs: [module.role], authority: ["SHADOW", "NO_DECISION", "closed-bar preview", "no order authority"],
    nodes: [...conditions, logic, out], links: [...conditions.map((n) => ({ from: n.id, to: logic.id, label: module.logic })), { from: logic.id, to: out.id, label: "effect" }],
    metrics: [{ label: "Conditions", value: String(module.conditions.length), provenance: "CONTRACT" }, { label: "Logic", value: module.logic, provenance: "CONTRACT" }, { label: "Status", value: module.status, provenance: "CONTRACT" }],
    warnings: [], traceStatus: "PREVIEWABLE", lineage: [module.id],
  };
}

function cardMetric(card: StrategyCardArtifactRecord, key: string, label: string, suffix = ""): SemanticMetric | null {
  const value = card[key];
  return typeof value === "number" && Number.isFinite(value) ? { label, value: String(value) + suffix, provenance: "ARTIFACT" } : null;
}

export function projectStrategyCard(card: StrategyCardArtifactRecord, census: ModuleCensusEntry[], customs: CustomModule[] = []): SemanticProjection {
  const censusById = new Map(census.map((x) => [x.id, x]));
  const customById = new Map(customs.map((x) => [x.id, x]));
  const nodes: SemanticNode[] = [{ id: "source", label: (card.design_tf || "M15") + " closed bars", stage: "INPUT", detail: "Canonical tape phải có source/as-of", source: "SYSTEM" }];
  const warnings: string[] = [];
  for (const id of card.modules || []) {
    const custom = customById.get(id), c = censusById.get(id);
    const stage = custom ? customStage(custom) : c ? mechanismStage(c.mechanism) : "UNKNOWN";
    nodes.push({ id, label: custom?.name || id, stage, detail: custom?.explain || c?.note || "Chưa có semantic census", source: "MODULE", warning: stage === "UNKNOWN" ? "UNRESOLVED" : undefined });
  }
  const output: SemanticNode = { id: "review_output", label: "Strategy Card artifact", stage: "OUTPUT", detail: "Review-only artifact · không phải lệnh", source: "CARD" };
  nodes.push(output);
  const links = nodes.filter((n) => n.source === "MODULE").flatMap((n) => [{ from: "source", to: n.id, label: "evaluate" }, { from: n.id, to: output.id, label: "contribute" }]);
  if (!card.modules?.length) warnings.push("Card không khai báo module list.");
  const unresolved = nodes.filter((n) => n.source === "MODULE" && n.stage === "UNKNOWN").map((n) => n.id);
  if (unresolved.length) warnings.push("Chưa có semantic census: " + unresolved.join(", "));
  if (!nodes.some((n) => n.stage === "CANDIDATE")) warnings.push("Không thấy module tạo candidate trong census/card contract.");
  const metrics = [cardMetric(card, "n", "Trades"), cardMetric(card, "winRate", "Win rate", "%"), cardMetric(card, "netR", "Net R", "R"), cardMetric(card, "costEv", "Cost EV", "R"), cardMetric(card, "maxDD", "Max DD", "R")].filter((x): x is SemanticMetric => !!x);
  return {
    id: card.id, kind: "STRATEGY_CARD", name: card.name, layer: "L0→L6", role: "COMPOSITE", mechanism: "ONE_ENGINE_PIPELINE",
    summary: String(card.modules?.length || 0) + " module trong một artifact có identity", inputs: [(card.design_tf || "M15") + " bars", "module contracts"],
    outputs: ["Strategy Card artifact", "review metrics"], authority: [card.artifact?.authority || "SHADOW_ONLY", card.artifact?.decision || "NO_DECISION", "no live apply"],
    nodes, links, metrics, warnings, traceStatus: metrics.length ? "ARTIFACT_METRICS" : "TRACE_UNAVAILABLE",
    lineage: [card.artifact?.parent_ids?.join(" + ") || "ROOT", card.artifact?.artifact_id || card.id],
  };
}
