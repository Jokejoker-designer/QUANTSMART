// assetLearning/contracts — the single source of truth for the PER‑ASSET self‑learning spine.
// Faithful to the owner's spec: per‑asset isolation, fail‑closed spec, tiered certification, versioned models
// with rollback, and a gated learning pipeline. Types only + a few const tables; NO learning logic here.
// Authority: advisory · zone‑only · manager owns live promotion. See docs/SELF_LEARNING_PER_ASSET_ARCHITECTURE.md

export type AssetClass = "FX" | "METAL" | "INDEX" | "CRYPTO" | "CFD" | "COMMODITY" | "UNKNOWN";
export type VolumeType = "REAL_VOLUME" | "TICK_VOLUME" | "MISSING";

// ── The data package the user loads for ONE symbol (see doc §3). ──
export interface BrokerSpec {
  digits?: number;
  point?: number;
  tick_size?: number;
  tick_value?: number;       // account‑currency value of one tick per lot
  contract_size?: number;
  min_lot?: number;
  max_lot?: number;
  lot_step?: number;
  commission_rt_per_lot?: number;   // round‑turn commission, account ccy
  swap_long?: number;
  swap_short?: number;
  source: "BROKER_SPEC" | "MANUAL_PROVISIONAL" | "MISSING";
}
export interface CoverageStats {
  years: number;                 // span of OHLC actually present (not just requested)
  distinct_regimes: number;      // how many distinct regime buckets appear
  distinct_eras: number;         // independent multi‑year eras (per price-era-shift-guard)
  has_stress_periods: boolean;   // crash / spike / gap‑storm periods present
  bars_by_tf?: Record<string, number>;
  has_fresh_shadow: boolean;     // out-of-train recent data reserved for shadow
}
export interface DataManifest {
  symbol: string;
  broker_symbol?: string;
  asset_class: AssetClass;
  timezone?: string;
  broker_utc_offset?: number;
  spread_history_available: boolean;
  volume_type: VolumeType;
  spec: BrokerSpec;
  coverage: CoverageStats;
  ohlc_years?: number[];         // e.g. [2015..2026] - from year-split M1 files
}

// ── Certification (doc §2). Years guide; regime/coverage decide. ──
export type CertificationTier = "UNCERTIFIED" | "RESEARCH_PROVISIONAL" | "SHADOW_QUALIFIED" | "FULL_CERTIFIED" | "LIVE_ELIGIBLE";
export interface CertificationResult {
  tier: CertificationTier;
  reasons: string[];
  spec_sufficient_for_sizing: boolean;   // orthogonal: may we conclude sizing/P&L at all?
  can_research: boolean;
  can_shadow: boolean;
  can_certify_full: boolean;
  can_propose_live_promotion: boolean;    // still needs a MANAGER to actually promote
}

// ── Pipeline spine (doc §4). Ordered; an upstream block blocks downstream. ──
export const PIPELINE_STAGES = [
  "csv_ingest", "quality_era_leakage_gate", "normalized_features", "role_evidence_validation",
  "forecast_map", "outcome_join", "calibration", "walk_forward_oos", "memory_write",
  "shadow_observation", "manager_promotion_review",
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
export type StageStatus = "OK" | "INSUFFICIENT_SAMPLE" | "LEAKAGE_BLOCKED" | "QUARANTINE" | "NEEDS_MANAGER" | "NOT_IMPLEMENTED" | "BLOCKED_UPSTREAM";
export interface StageResult { stage: PipelineStage; status: StageStatus; note?: string; metrics?: Record<string, number> }
export interface PipelineResult { asset_key: string; stages: StageResult[]; blocked_at?: PipelineStage; ok: boolean }

// ── Versioned models with rollback (doc §1.7 + §5). ──
export type ModelStatus = "SHADOW" | "QUARANTINE" | "PROPOSED" | "PROMOTED" | "ROLLED_BACK";
export interface ModelVersion {
  version: number;
  created_at: string;
  tier: CertificationTier;
  status: ModelStatus;
  metrics?: Record<string, number>;
  note?: string;
}

// ── The per‑asset memory (doc §1.1). Keyed <SYMBOL>/<TF>; never shared across assets. ──
export interface AssetMemory {
  key: string;                 // `${symbol}/${tf}`
  symbol: string;
  tf: string;
  asset_class: AssetClass;
  manifest?: DataManifest;
  certification?: CertificationResult;
  // learned artifacts (all optional until a stage produces them; each stays inside this asset)
  atr_profile?: Record<string, number>;
  regime_profile?: Record<string, number>;
  session_profile?: Record<string, number>;
  spread_model?: Record<string, number>;
  thresholds?: Record<string, number>;
  calibration_ref?: string;
  signature_ref?: string;
  passport?: Record<string, unknown>;
  models: ModelVersion[];
  active_version?: number;     // the currently‑active model version (rollback target lives in models[])
  updated_at: string;
  last_daily?: string;
  last_weekly?: string;
  last_monthly?: string;
}

// cadence jobs (doc §5)
export type CadenceJob = "daily" | "weekly" | "monthly";
