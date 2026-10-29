// l4Compile — L4 Context-Block recipe → CustomModule CONTEXT_GATE. Một block chỉ MANG metric+op+value (đã có), nên
// condition sinh ra GIỐNG HỆT khi nhập-tay metric đó → byte-identical (guard: l4Compile.harness). KHÔNG logic mới.
import type { CustomModule, Condition, Op } from "../customModule.ts";
import { L4_BLOCK_BY_ID, L4_BLOCK_BY_METRIC } from "./l4BlockLibrary.ts";

// SNAP hiển-thị: một condition (metric+op+value) thuộc context-block nào? — CHỈ để tô-sáng palette / hiện tên block.
// metric ∈ 24 metric built-in có block → blockId; evidence L1/L2/L3 (id động) hoặc metric lạ → null (giữ đường evidence,
// KHÔNG ép vào block cố-định). KHÔNG đổi condition → compile-output GIỐNG HỆT dù có snap hay không.
export function blockIdForMetric(metric: string): string | null {
  return L4_BLOCK_BY_METRIC[metric]?.blockId ?? null;
}
export function activeBlockIds(conds: { metric: string }[]): Set<string> {
  const s = new Set<string>();
  for (const c of conds) { const id = blockIdForMetric(c.metric); if (id) s.add(id); }
  return s;
}

export interface L4Pick { blockId: string; op: Op; value: number; value2?: number; evidenceKey?: string }
export interface L4Recipe { name: string; explain: string; why: string; logic: "ALL" | "ANY"; picks: L4Pick[] }
export interface L4Compiled { module: CustomModule; conditions: Condition[]; warnings: string[] }

// một pick → condition; metric lấy từ block (evidence-slot → id user chọn). value2 CHỈ khi op dải (khớp nhập-tay).
export function pickToCondition(p: L4Pick): Condition {
  const spec = L4_BLOCK_BY_ID[p.blockId];
  const metric = spec?.isEvidenceSlot ? (p.evidenceKey || "") : (spec?.metric || "");
  const c: Condition = { metric, op: p.op, value: p.value };
  if (p.op === "between" || p.op === "outside") c.value2 = p.value2 ?? 0;
  return c;
}

export function compileL4(r: L4Recipe): L4Compiled {
  const warnings: string[] = [];
  const conditions: Condition[] = (r.picks || []).map(pickToCondition);
  if (!conditions.length) warnings.push("No context block selected; the gate applies no filter.");
  if (conditions.some((c) => !c.metric)) warnings.push("Select an evidence ID; the condition is empty.");
  const module: CustomModule = {
    id: "l4_" + Date.now().toString(36), level: 4, role: "CONTEXT_GATE",
    name: r.name.trim() || "L4 gate", explain: r.explain.trim(), why: r.why.trim(),
    conditions, logic: r.logic, status: "SHADOW", createdAt: new Date().toISOString(),
  };
  return { module, conditions, warnings };
}

// seed một condition nhập-tay từ block (dùng cho palette trong L4GateBuilder) — op/value/value2 mặc-định của block.
export function blockSeedCondition(blockId: string, evidenceKey?: string): Condition | null {
  const spec = L4_BLOCK_BY_ID[blockId]; if (!spec) return null;
  return pickToCondition({ blockId, op: spec.defaultOp, value: spec.defaultValue, value2: spec.value2, evidenceKey });
}
