// l4BlockTypes — L4 Context-Block contract. Một context-block CHỈ GÓI + đặt tên + phân nhóm MỘT metric-context đã có
// (28 METRICS) hoặc một evidence-slot (L1/L2/L3 id) — KHÔNG metric/logic mới. Port-typed để Pha C siết wiring:
// CONTEXT/EVIDENCE chỉ feed GATE (context-block không bao giờ là số cho L3, không bao giờ tự phát lệnh). Compile
// XUỐNG conditions cũ của CONTEXT_GATE → byte-identical. Advisory · no order (vắng port order = enforcement).
import type { Op } from "../customModule.ts";
import { ACCENT } from "./palette.ts";

export type L4PortType = "CONTEXT" | "EVIDENCE" | "GATE";
export const L4_PORTS: L4PortType[] = ["CONTEXT", "EVIDENCE", "GATE"];

export type L4Group = "REGIME" | "SESSION" | "VOLATILITY" | "STRUCTURE" | "MOMENTUM" | "EVIDENCE_GATE";
export const L4_GROUPS: L4Group[] = ["REGIME", "SESSION", "VOLATILITY", "STRUCTURE", "MOMENTUM", "EVIDENCE_GATE"];
export const L4_GROUP_LABEL: Record<L4Group, string> = {
  REGIME: "Regime / Trend", SESSION: "Session / Time", VOLATILITY: "Volatility",
  STRUCTURE: "Structure / Breakout", MOMENTUM: "Momentum / Candle Flow", EVIDENCE_GATE: "Evidence / Account",
};
export const L4_GROUP_COLOR: Record<L4Group, string> = {
  REGIME: ACCENT.cyan, SESSION: ACCENT.teal, VOLATILITY: ACCENT.amber, STRUCTURE: ACCENT.purple, MOMENTUM: ACCENT.red, EVIDENCE_GATE: ACCENT.green,
};

// context-block = 1 metric-context (hoặc evidence-slot) + op mặc-định + ngưỡng gợi-ý + nhãn đời-thường + port.
export interface L4BlockSpec {
  blockId: string; group: L4Group; label: string; description: string;
  metric: string;            // key trong METRICS; với evidence-slot = "" (user chọn id L1/L2/L3)
  port: L4PortType;          // CONTEXT | EVIDENCE — cả hai chỉ feed GATE
  defaultOp: Op; defaultValue: number; value2?: number;
  unit?: string; isEvidenceSlot?: boolean; note?: string;
}

export const l4Authority = { layer: "L4" as const, advisoryOnly: true as const, emitsGate: true as const, additiveToEntry: true as const, noOrderSend: true as const, noAutoLot: true as const, noExactSlTp: true as const };
