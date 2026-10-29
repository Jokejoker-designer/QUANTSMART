// cardBeastV2/vocabulary — the LOCKED vocabulary of Card/Beast V2 (F0). Roles are AUTHORITY (what a component
// may do); Tribes are AFFINITY (who it synergizes with) and never grant authority. Structural role comes from
// the graph/output contract and is IMMUTABLE; empirical role is what backtests CONFIRM — it may never escalate
// authority (a losing attacker does not become a guard; it emits INVERSE_HYPOTHESIS_RESEARCH_REQUIRED).
// Everything here is frozen. advisory · zone-only · manager owns promotion.

export const ROLES = Object.freeze(["SCOUT", "ATTACKER", "GUARD", "CONFIRMATION", "EXIT_SENTINEL", "FALLBACK", "SAFETY"] as const);
export type Role = typeof ROLES[number];

export const TRIBES = Object.freeze([
  "TREND", "BREAKOUT", "RETEST", "LIQUIDITY", "SWEEP", "FAKEOUT", "RANGE", "REVERSAL",
  "MOMENTUM", "VOLATILITY", "MTF", "SESSION", "RISK", "EXIT",
] as const);
export type Tribe = typeof TRIBES[number];

// block-output kind → the ONLY roles that output may compile into (authority narrows going up, never widens).
export const BLOCK_OUTPUT_ALLOWED_ROLES: Readonly<Record<string, readonly Role[]>> = Object.freeze({
  MEASUREMENT: ["SCOUT"], CONTEXT: ["SCOUT"], FEATURE: ["SCOUT"],
  SETUP: ["ATTACKER", "FALLBACK"], TRIGGER: ["ATTACKER", "FALLBACK"], CANDIDATE: ["ATTACKER", "FALLBACK"],
  VETO: ["GUARD"], ADVERSE: ["GUARD"], DANGER: ["GUARD"],
  SUPPORT: ["CONFIRMATION"], QUALITY: ["CONFIRMATION"], CONFIDENCE: ["CONFIRMATION"],
  EXIT_HINT: ["EXIT_SENTINEL"],
  SAFETY_SEAL: ["SAFETY"],
});

// what each ROLE may output as a capability (a Card exposes exactly ONE primary capability).
export const CAPABILITIES = Object.freeze(["SETUP_CANDIDATE", "ADVERSE_VETO", "SUPPORT_SCORE", "CONTEXT_STATE", "EXIT_HINT"] as const);
export type Capability = typeof CAPABILITIES[number];
export const ROLE_CAPABILITY: Readonly<Record<Role, Capability | null>> = Object.freeze({
  SCOUT: "CONTEXT_STATE", ATTACKER: "SETUP_CANDIDATE", FALLBACK: "SETUP_CANDIDATE",
  GUARD: "ADVERSE_VETO", CONFIRMATION: "SUPPORT_SCORE", EXIT_SENTINEL: "EXIT_HINT", SAFETY: null,
});

// empirical usage role — what backtests CONFIRM. NEVER changes structural authority.
export const EMPIRICAL_ROLE_STATUSES = Object.freeze([
  "ROLE_CONFIRMED", "ROLE_CONDITIONAL", "ROLE_HOSTILE", "ROLE_REDUNDANT", "INSUFFICIENT_SAMPLE",
  "INVERSE_HYPOTHESIS_RESEARCH_REQUIRED",   // attacker loses + inverse looks good → research flag, NOT a role flip
] as const);
export type EmpiricalRoleStatus = typeof EMPIRICAL_ROLE_STATUSES[number];

// pairwise synergy — evidence-only states (no hardcoded set bonus; gray/UNTESTED is the default).
export const SYNERGY_STATES = Object.freeze([
  "UNTESTED", "STRUCTURALLY_VALID", "SHADOW_TESTING", "COMPLEMENTARY", "REDUNDANT",
  "CONFLICTED", "HARMFUL", "INSUFFICIENT_EVIDENCE", "SHADOW_VALIDATED",
] as const);
export type SynergyState = typeof SYNERGY_STATES[number];
export const SYNERGY_COLOR: Readonly<Record<string, string>> = Object.freeze({
  UNTESTED: "gray", STRUCTURALLY_VALID: "blue", SHADOW_TESTING: "yellow",
  SHADOW_VALIDATED: "green", COMPLEMENTARY: "green", REDUNDANT: "yellow", CONFLICTED: "red", HARMFUL: "red",
  INSUFFICIENT_EVIDENCE: "gray",
});

// tribe affinity bands (−100..+100) — describes fit, never strength.
export const AFFINITY_BANDS = Object.freeze([
  { min: 60, band: "SUPPORTIVE" }, { min: 20, band: "CONDITIONAL" }, { min: -19, band: "NEUTRAL_NO_CONCLUSION" },
  { min: -59, band: "HOSTILE" }, { min: -100, band: "DESTRUCTIVE" },
] as const);
export function affinityBand(v: number): string {
  if (v >= 60) return "SUPPORTIVE"; if (v >= 20) return "CONDITIONAL"; if (v >= -19) return "NEUTRAL_NO_CONCLUSION";
  if (v >= -59) return "HOSTILE"; return "DESTRUCTIVE";
}

// causal context taxonomy (attached at candidate time from data ≤ t ONLY).
export const REGIME_TREND = Object.freeze(["UP", "DOWN", "RANGE", "TRANSITION"] as const);
export const REGIME_VOL = Object.freeze(["LOW", "NORMAL", "HIGH", "EXTREME"] as const);
export const REGIME_STRUCTURE = Object.freeze(["TREND", "BREAKOUT", "COMPRESSION", "REVERSAL", "CHOP"] as const);
export const REGIME_LIQUIDITY = Object.freeze(["CLEAN", "THIN", "SWEEP_ACTIVE", "DISLOCATED"] as const);
export const SESSIONS = Object.freeze(["ASIA", "LONDON", "NEW_YORK", "LONDON_NY_OVERLAP", "ROLLOVER", "OFF_HOURS", "CRYPTO_24H", "SESSION_UNVERIFIED"] as const);
export type Session = typeof SESSIONS[number];
export const MARKET_CLASSES = Object.freeze(["FX", "METAL", "INDEX", "CRYPTO", "FUTURES", "EQUITY", "MARKET_COMPATIBILITY_UNVERIFIED"] as const);
export const CARD_TIMEFRAMES = Object.freeze(["M1", "M5", "M15", "H1", "H4", "D1"] as const);

// certification flow (research track — MANAGER_APPROVED_RESEARCH ≠ live execution).
export const CERTIFICATION_FLOW = Object.freeze([
  "DRAFT", "STRUCTURE_VALID", "ROLE_AUTHORITY_VALID", "BACKTESTED", "ABLATION_PASSED",
  "ERA_STABLE", "SHADOW_QUALIFIED", "MANAGER_APPROVED_RESEARCH",
] as const);
export type CertificationStage = typeof CERTIFICATION_FLOW[number];

// Beast formation policy (structural preflight).
export const BEAST_FORMATION = Object.freeze({
  PRIMARY_ATTACKER: { min: 1, max: 1 }, FALLBACK: { min: 0, max: 1 }, SCOUT: { min: 0, max: 2 },
  GUARD: { min: 1, max: 3 }, CONFIRMATION: { min: 0, max: 3 }, EXIT_SENTINEL: { min: 0, max: 2 },
  SAFETY: { min: 1, max: 1 },
} as const);

// hierarchical backoff order for bucket evaluation (never fabricate a thin-cell score).
export const BUCKET_BACKOFF_ORDER = Object.freeze([
  ["regime"], ["regime", "volatility"], ["regime", "session"], ["regime", "session", "timeframe"],
  ["regime", "volatility", "session", "timeframe"],
] as const);
