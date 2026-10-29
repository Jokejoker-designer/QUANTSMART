// featureRoles — the 3-layer role/authority separation (manager verdict APPROVED_WITH_ROLE_AUTHORITY_SEPARATION):
//   1) Block Capability Tag — a primitive block's technical family (trend/vol/wick/…). NOT a strategic role, NO authority.
//   2) Feature Usage Role — what slot a user-built feature is MEANT for (Bias/Regime/Timing/…). NOT authority.
//   3) Module/Core Authority Role — Scope/Attacker/Guard/Governance (lives on Card/Beast, owns the authority matrix).
// HARD doctrine: a role tag NEVER grants authority. L1 stays measurement-only. Auto-route = recommendation only.
import { BLOCKS_BY_ID } from "./blockLibrary.ts";
import type { L1Group } from "./blockTypes.ts";
import type { FeatureGraph } from "./featureGraph.ts";

// ── (2) Feature Usage Role ──
export type FeatureUsageRole = "BIAS_TREND" | "REGIME_VOL" | "TIMING_TRIGGER" | "CONFIRMATION_QUALITY" | "RISK_DANGER" | "FILTER_CONTEXT";
export const USAGE_ROLES: FeatureUsageRole[] = ["BIAS_TREND", "REGIME_VOL", "TIMING_TRIGGER", "CONFIRMATION_QUALITY", "RISK_DANGER", "FILTER_CONTEXT"];
export const ROLE_META: Record<FeatureUsageRole, { label: string; color: string; slot: string; core: string; gate: string }> = {
  BIAS_TREND: { label: "Bias / Trend", color: "#79c0ff", slot: "Bias frame", core: "Scope/Attacker", gate: "Forward directional association and OOS consistency" },
  REGIME_VOL: { label: "Regime / Volatility", color: "#a371f7", slot: "Context gate", core: "Scope", gate: "era-stability · regime persistence" },
  TIMING_TRIGGER: { label: "Timing / Trigger", color: "#db6d28", slot: "Trigger slot", core: "Attacker", gate: "Timing association, excursion ordering and lead/lag" },
  CONFIRMATION_QUALITY: { label: "Confirmation / Quality", color: "#3fb950", slot: "Confirmation gate", core: "Soft context adjustment", gate: "confirmation lift · ablation · false-confirm rate" },
  RISK_DANGER: { label: "Risk / Danger", color: "#f85149", slot: "Guard / veto / reduce", core: "Guard/Governance-Risk", gate: "MAE/tail corr · drawdown warning lead · guardSavedR" },
  FILTER_CONTEXT: { label: "Filter / Context", color: "#e3b341", slot: "Entry gate", core: "Scope/Guard", gate: "excluded bad trades · coverage retention · over-filter rate" },
};

export type RoleStatus = "DECLARED" | "AUTO_SUGGESTED" | "SHADOW_QUALIFIED" | "OOS_QUALIFIED" | "REJECTED";
export const ROLE_STATUS_META: Record<RoleStatus, { label: string; color: string }> = {
  DECLARED: { label: "Declared", color: "#8b949e" },
  AUTO_SUGGESTED: { label: "Suggested", color: "#e3b341" },
  SHADOW_QUALIFIED: { label: "SHADOW-qualified", color: "#db6d28" },
  OOS_QUALIFIED: { label: "OOS-qualified", color: "#3fb950" },
  REJECTED: { label: "Rejected", color: "#f85149" },
};
export interface RoleEvidence { role: FeatureUsageRole; status: RoleStatus; gateName?: string; sampleSize?: number; oosStatus?: string; notes: string[] }
export interface FeatureRoleProfile { primaryRole: FeatureUsageRole; secondaryRoles: FeatureUsageRole[]; evidence: RoleEvidence[] }

// ── (1) Block Capability Tag ──
export type BlockCapability = "TREND_MEASURE" | "MOMENTUM_MEASURE" | "VOL_MEASURE" | "WICK_BODY_MEASURE" | "LEVEL_MEASURE" | "NORMALIZE" | "MATH" | "LOGIC" | "STATE" | "SAFETY" | "SOURCE";
const CAP_BY_GROUP: Record<L1Group, BlockCapability> = {
  SOURCE: "SOURCE", CANDLE_ANATOMY: "WICK_BODY_MEASURE", ROLLING_WINDOW: "LEVEL_MEASURE", NORMALIZE: "NORMALIZE",
  SMOOTH_LAG_MOMENTUM: "TREND_MEASURE", MATH: "MATH", LOGIC_CONNECTOR: "LOGIC", FSM_STATE: "STATE", SAFETY_OUTPUT: "SAFETY",
};
const CAP_OVERRIDE: Record<string, BlockCapability> = {
  range: "VOL_MEASURE", true_range: "VOL_MEASURE", roll_std: "VOL_MEASURE", roll_range: "VOL_MEASURE", path_length: "VOL_MEASURE",
  reg_slope: "TREND_MEASURE", ema: "TREND_MEASURE", sma: "TREND_MEASURE",
  slope: "MOMENTUM_MEASURE", delta: "MOMENTUM_MEASURE", roc: "MOMENTUM_MEASURE", direction: "MOMENTUM_MEASURE",
  percent_rank: "NORMALIZE", zscore: "NORMALIZE", minmax: "NORMALIZE", div_atr: "NORMALIZE", div_price: "NORMALIZE",
  swing_high: "LEVEL_MEASURE", swing_low: "LEVEL_MEASURE", roll_max: "LEVEL_MEASURE", roll_min: "LEVEL_MEASURE", typical_price: "LEVEL_MEASURE", gap: "LEVEL_MEASURE", atr: "VOL_MEASURE",
  body_ratio: "WICK_BODY_MEASURE", upper_wick_ratio: "WICK_BODY_MEASURE", lower_wick_ratio: "WICK_BODY_MEASURE", clv: "WICK_BODY_MEASURE",
};
export function capabilityOf(blockId: string): BlockCapability {
  if (CAP_OVERRIDE[blockId]) return CAP_OVERRIDE[blockId];
  const b = BLOCKS_BY_ID[blockId]; return b ? CAP_BY_GROUP[b.group] : "MATH";
}

// capability → which usage role(s) it leans toward (first = strongest). This is a HINT only.
const CAP_ROLE: Record<BlockCapability, FeatureUsageRole[]> = {
  TREND_MEASURE: ["BIAS_TREND", "FILTER_CONTEXT"],
  MOMENTUM_MEASURE: ["TIMING_TRIGGER", "BIAS_TREND"],
  VOL_MEASURE: ["REGIME_VOL", "RISK_DANGER"],
  WICK_BODY_MEASURE: ["TIMING_TRIGGER", "CONFIRMATION_QUALITY"],
  LEVEL_MEASURE: ["FILTER_CONTEXT", "TIMING_TRIGGER"],
  NORMALIZE: ["REGIME_VOL", "CONFIRMATION_QUALITY"],
  LOGIC: ["CONFIRMATION_QUALITY"], STATE: ["TIMING_TRIGGER"], MATH: [], SAFETY: [], SOURCE: [],
};

// auto-suggest a role profile from the blocks a feature uses (status AUTO_SUGGESTED — NOT proven).
export function suggestRoles(graph: FeatureGraph): FeatureRoleProfile {
  const score = { BIAS_TREND: 0, REGIME_VOL: 0, TIMING_TRIGGER: 0, CONFIRMATION_QUALITY: 0, RISK_DANGER: 0, FILTER_CONTEXT: 0 } as Record<FeatureUsageRole, number>;
  for (const n of graph.nodes) { const caps = CAP_ROLE[capabilityOf(n.blockId)] ?? []; caps.forEach((r, i) => { score[r] += i === 0 ? 2 : 1; }); }
  const ranked = USAGE_ROLES.slice().sort((a, b) => score[b] - score[a]);
  const primary = score[ranked[0]] > 0 ? ranked[0] : "FILTER_CONTEXT";
  const secondaryRoles = ranked.filter((r) => r !== primary && score[r] > 0).slice(0, 2);
  const evidence: RoleEvidence[] = [primary, ...secondaryRoles].map((role) => ({ role, status: "AUTO_SUGGESTED", notes: ["Suggested from the capabilities of the selected blocks"] }));
  return { primaryRole: primary, secondaryRoles, evidence };
}

// move evidence forward (e.g. Qualify in sandbox → SHADOW_QUALIFIED). OOS_QUALIFIED needs the role-specific gate.
export function bumpRoleStatus(profile: FeatureRoleProfile, status: RoleStatus, note: string): FeatureRoleProfile {
  const roles = [profile.primaryRole, ...profile.secondaryRoles];
  return { ...profile, evidence: roles.map((role) => { const ev = profile.evidence.find((e) => e.role === role); return { role, status, notes: [...(ev?.notes ?? []), note], gateName: ev?.gateName, sampleSize: ev?.sampleSize, oosStatus: ev?.oosStatus }; }) };
}
export const roleStatusOf = (profile: FeatureRoleProfile | undefined, role: FeatureUsageRole): RoleStatus => profile?.evidence.find((e) => e.role === role)?.status ?? "DECLARED";
