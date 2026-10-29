// l5Compile — doctrine "form-first UI, graph-backed" (soi l2Compile): một RECIPE quyết-định L5 (setup → confirm →
// terminal state) compile thành (1) GRAPH block L5 đọc-được để vẽ + (2) một CustomModule engine chạy được. Role suy
// TỪ terminal state: READY/TRIGGER → role=TRIGGER (+direction) · VETO → role=VETO · EXIT_HINT → role=EXIT.
// HARD: KHÔNG bao giờ sinh order/lot/SL-TP số (CustomModule không có field đó — vắng field = enforcement). SHADOW.
import { L5_BLOCKS } from "./l5BlockLibrary.ts";
import type { L5PortType } from "./l5BlockTypes.ts";
import type { CustomModule, Role, Op } from "../customModule.ts";

const L5_BY_ID = Object.fromEntries(L5_BLOCKS.map((b) => [b.blockId, b]));

// một block L5 trong recipe được RÀNG với một điều-kiện cụ-thể (metric/evidence + op + ngưỡng) — đó là cách graph
// trừu-tượng (trend_pullback…) trở thành điều-kiện engine chạy được. metric = 29 built-in HOẶC id evidence L1/L2/L3.
export interface L5Cond { blockId: string; metric: string; op: Op; value: number; value2?: number }
export type L5Terminal = "TRIGGER" | "VETO" | "EXIT";

export interface L5Recipe {
  name: string; explain: string; why: string;
  terminal: L5Terminal;
  direction?: "LONG" | "SHORT" | "REGIME";   // chỉ TRIGGER
  setup?: L5Cond[];     // ENTRY_PATTERN (bắt buộc ≥1 nếu TRIGGER)
  confirm?: L5Cond[];   // CONFIRMATION (ALL cùng setup)
  veto?: L5Cond[];      // VETO_STANDASIDE (khi terminal=VETO)
  exit?: L5Cond[];      // EXIT_LOGIC (khi terminal=EXIT)
  weight?: number; reliability?: number;
  exitAction?: CustomModule["exitAction"]; lockR?: number;
}

export interface L5GraphNode { id: string; blockId: string; label: string; state: L5PortType; inputs: string[]; cond?: L5Cond }
export interface L5Compiled {
  module: CustomModule;
  graph: { nodes: L5GraphNode[]; edges: { from: string; to: string }[]; output: string };
  role: Role; warnings: string[];
}

const TERMINAL_ROLE: Record<L5Terminal, Role> = { TRIGGER: "TRIGGER", VETO: "VETO", EXIT: "EXIT" };

// build the read-only decision-state graph (setup nodes → confirm nodes → terminal emit) mirroring the recipe.
function buildGraph(r: L5Recipe): { nodes: L5GraphNode[]; edges: { from: string; to: string }[]; output: string } {
  const nodes: L5GraphNode[] = []; const edges: { from: string; to: string }[] = [];
  const conds = r.terminal === "TRIGGER" ? [...(r.setup ?? []), ...(r.confirm ?? [])] : r.terminal === "VETO" ? (r.veto ?? []) : (r.exit ?? []);
  const leafIds: string[] = [];
  conds.forEach((c, i) => { const id = "n" + i; const b = L5_BY_ID[c.blockId]; nodes.push({ id, blockId: c.blockId, label: b?.label ?? c.blockId, state: (b?.outputs[0].type ?? "SETUP") as L5PortType, inputs: [], cond: c }); leafIds.push(id); });
  // terminal emit node (READY for TRIGGER, VETO, EXIT_HINT) — the decision-state the module emits
  const termState: L5PortType = r.terminal === "TRIGGER" ? "READY" : r.terminal === "VETO" ? "VETO" : "EXIT_HINT";
  const emitId = "emit"; nodes.push({ id: emitId, blockId: "emit_decision_state", label: r.terminal === "TRIGGER" ? "READY → " + (r.direction ?? "?") : r.terminal, state: termState, inputs: leafIds });
  for (const l of leafIds) edges.push({ from: l, to: emitId });
  return { nodes, edges, output: emitId };
}

export function compileL5(r: L5Recipe): L5Compiled {
  const warnings: string[] = [];
  const role = TERMINAL_ROLE[r.terminal];
  const setupConds = r.setup ?? [];
  const conditions = (r.terminal === "TRIGGER" ? [...setupConds, ...(r.confirm ?? [])] : r.terminal === "VETO" ? (r.veto ?? []) : (r.exit ?? []))
    .map((c) => ({ metric: c.metric, op: c.op, value: c.value, ...(c.value2 != null ? { value2: c.value2 } : {}) }));
  if (role === "TRIGGER" && !setupConds.length) warnings.push("TRIGGER has no setup condition — add at least one setup rule.");
  if (role === "TRIGGER" && !r.direction) warnings.push("TRIGGER requires a direction (LONG, SHORT, or REGIME).");
  if (!conditions.length) warnings.push("No conditions defined — this module will never fire.");
  const graph = buildGraph(r);
  // CustomModule — chỉ field advisory/điều-kiện; TUYỆT ĐỐI không set order/lot/risk/SL-TP (field không tồn tại).
  const module: CustomModule = {
    id: "l5_" + Date.now().toString(36), level: 5, role, name: r.name.trim() || "L5 decision",
    explain: r.explain.trim(), why: r.why.trim(), conditions, logic: "ALL",
    direction: role === "TRIGGER" ? r.direction : undefined,
    weight: role === "TRIGGER" || role === "CONFIRM" ? (r.weight ?? 0.9) : undefined,
    reliability: role === "TRIGGER" ? (r.reliability ?? 0.53) : undefined,
    exitAction: role === "EXIT" ? (r.exitAction ?? "CLOSE") : undefined,
    lockR: role === "EXIT" && r.exitAction === "LOCK_SL" ? (r.lockR ?? 0.5) : undefined,
    status: "SHADOW", createdAt: new Date().toISOString(),
  };
  return { module, graph, role, warnings };
}
