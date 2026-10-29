// cardBeastV2/schemas — canonical contracts for Block / Module / Card / Beast + the Compatibility Passport (F0).
// ONE contract lineage for every level; parameters by ParameterRef (no anonymous magic numbers); content_hash
// INCLUDES the coefficient profile (invariant: a backtest is only comparable if we know which coefs it ran with).
// Types + pure helpers only — no engine calls here. advisory · zone-only.
import type { Capability, CertificationStage, EmpiricalRoleStatus, Role, Session, SynergyState, Tribe } from "./vocabulary.ts";

export const CBV2_SCHEMA_VERSION = 1;

export interface ParameterRef { name: string; value: number; source: "DEFAULT" | "USER" | "SELF_CALIB_SHADOW"; ref?: string }

// ── the shared contract lineage (every level carries the same spine) ──
export interface CanonicalContract {
  id: string;
  schema_version: number;
  version: number;
  content_hash: string;
  input_types: string[];
  output_types: string[];
  primary_role: Role | "UNCLASSIFIED";
  allowed_roles: Role[];
  forbidden_actions: string[];          // ORDER_SEND / AUTO_LOT / EXACT_SLTP / … always present
  tribes: Tribe[];
  timeframes: string[];
  supported_assets: string[];           // certification is PER asset — never cross-asset
  parameter_refs: ParameterRef[];
  dependency_ids: string[];
  evidence_lineage: string[];           // L1 primitive roots — used for evidence-source overlap detection
  validation_status: CertificationStage | "UNCLASSIFIED_REVIEW_REQUIRED";
}

export const FORBIDDEN_ALWAYS = Object.freeze(["ORDER_SEND", "AUTO_LOT", "EXACT_ENTRY_SL_TP", "LIVE_PROMOTION", "RUNTIME_GATE_CHANGE"] as const);

export interface BlockContract extends CanonicalContract { level: "BLOCK"; output_kind: string }
export interface ModuleContract extends CanonicalContract {
  level: "MODULE";
  graph_hash: string;
  primary_tribe?: Tribe;
  secondary_tribes: Tribe[];
  authority_ceiling: Role | "SHADOW_ONLY";
  classification_confidence: number;    // 0..1; low → UNCLASSIFIED_REVIEW_REQUIRED + SHADOW_ONLY
}
export interface CardContract extends CanonicalContract {
  level: "CARD";
  capability: Capability;               // exactly ONE primary capability
  setup_roots: number;                  // >1 independent setup roots → MULTI_ATTACKER_CARD / SPLIT_REQUIRED
  layers_present: string[];             // L0..L6
  modules: string[];                    // today's module-id list (graph cards come later)
}
export interface BeastContract extends CanonicalContract {
  level: "BEAST";
  members: { card_id: string; role: Role }[];
  formation_valid: boolean;
  synergy_state: SynergyState;
}

// ── empirical layers (NEVER mutate the structural contract) ──
export interface EmpiricalRoleResult { role: Role; regime: string; status: EmpiricalRoleStatus; n: number }
export interface TribeAffinityObservation { tribe: Tribe | string; affinity: number; n: number; band: string }

// ── per-TF metrics + Compatibility Passport (the output artifact) ──
export interface TfMetrics {
  tf: string; sample_n: number; expectancy: number | null; pf: number | null; dd: number | null;
  loss_streak: number | null; coverage: number | null; stability: number | null; cost_survivability: number | null;
  status: "PREFERRED" | "COMPATIBLE" | "CONDITIONAL" | "HOSTILE" | "INSUFFICIENT_SAMPLE";
}
export interface CompatibilityCell {
  bucket: Record<string, string>;       // e.g. {regime:"TREND_UP", session:"LONDON"}
  effect: number | null; confidence: number | null; stability: number | null;
  compatibility: number | null;         // 0..100 = effect × confidence × stability (null when insufficient)
  hit_rate?: number | null;             // wins/n of the cell (for the calibration curve)
  sample_n: number;
  status: "COMPATIBLE" | "CONDITIONAL" | "HOSTILE" | "INSUFFICIENT_SAMPLE";
  reason: string;
  backoff_level: number;                // which backoff tier produced this (0 = widest)
  // OOS check (P-OOS): cell learned on TRAIN (first 70%) re-measured on HELD-OUT (last 30%). verdict compares
  // the SIGN of (cellExp − baseExp) across windows. Absent = split not run or cell untestable (thin held sample).
  oos?: { n: number; effect: number | null; verdict: "OOS_CONFIRMED" | "OOS_FLIPPED" | "OOS_INSUFFICIENT" };
}
export interface CompatibilityPassport {
  card_id: string;
  schema_version: number;
  content_hash: string;
  structural_role: string;              // e.g. ATTACKER_CAPABLE
  tribes: (Tribe | string)[];
  preferred_regimes: string[]; hostile_regimes: string[];
  preferred_sessions: string[]; preferred_timeframes: string[];
  compatible_markets: string[];
  per_tf: TfMetrics[];
  cells: CompatibilityCell[];
  evidence_status: "IN_SAMPLE_ONLY" | "OOS_CONDITIONAL" | "OOS_CONFIRMED" | "INSUFFICIENT";
  era_stability: "STABLE" | "PARTIAL" | "UNSTABLE" | "UNTESTED";
  shadow_required: boolean;
  session_verified: boolean;            // false → session cells are SESSION_UNVERIFIED, not evidence
  market_verified: boolean;             // false → MARKET_COMPATIBILITY_UNVERIFIED
}

// ── content hash — INCLUDES the coefficient profile (locked invariant) ──
// djb2-xor over a canonical JSON; stable to module order. Not crypto — a comparability key, not a security seal.
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function contentHash(parts: {
  modules?: string[]; graph?: unknown; coefProfile?: unknown; parameterRefs?: ParameterRef[];
  tapeId?: string; window?: string; extra?: unknown;
}): string {
  const canon = JSON.stringify({
    m: [...(parts.modules || [])].sort(),
    g: parts.graph ?? null,
    c: parts.coefProfile ?? {},                    // coefficient profile IS part of identity
    p: (parts.parameterRefs || []).map((p) => p.name + "=" + p.value + "@" + p.source).sort(),
    t: parts.tapeId || "", w: parts.window || "", x: parts.extra ?? null, v: CBV2_SCHEMA_VERSION,
  });
  return djb2(canon) + djb2(canon.split("").reverse().join(""));
}

// module passport for user-created modules — compiler classifies; user never self-grants authority.
export interface ModulePassport {
  module_id: string; graph_hash: string;
  primary_role: Role | "UNCLASSIFIED"; allowed_roles: Role[];
  primary_tribe?: Tribe; secondary_tribes: Tribe[];
  input_contract: string[]; output_contract: string[];
  parameter_refs: ParameterRef[]; evidence_sources: string[];
  authority_ceiling: Role | "SHADOW_ONLY";
  classification_confidence: number;
  validation_status: "REVIEW_REQUIRED" | "CLASSIFIED" | "SHADOW_ONLY";
}
