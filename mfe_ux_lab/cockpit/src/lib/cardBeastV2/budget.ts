// cardBeastV2/budget — F0 computation budget + multiple-testing control (locked BEFORE any sweep exists, so the
// synergy layer can never drift into p-hacking). Pairwise synergy is O(N²) backtests: it runs OFFLINE (node/CLI —
// invariant: NO browser pairwise sweep), capped per batch, cached by content_hash, and a discovery is only real
// after held-out confirmation + fresh shadow. INSUFFICIENT_EVIDENCE is a first-class, EXPECTED outcome.

export const SYNERGY_BUDGET = Object.freeze({
  MAX_PAIRS_PER_BATCH: 3,            // spike scale; scaling up needs a manager-approved batch plan
  MAX_ENGINE_RUNS_PER_BATCH: 12,     // hard cap — the spike must fit under this
  MIN_TRADES_PER_ARM: 30,            // below → INSUFFICIENT_EVIDENCE (never a verdict from thin arms)
  MIN_TRADES_PER_BUCKET: 30,         // hierarchical backoff floor (mirror strategyAtlas gates)
  PURGE_BARS: 8,                      // chronological purge between train / held-out (no horizon leakage)
  SPLIT: Object.freeze({ TRAIN: 0.6, HELD_OUT: 0.25, FRESH_SHADOW: 0.15 }),   // chronological, in this order
  EFFECT_THRESHOLD_R: 0.02,           // |Δexpectancy| below this = indistinguishable → REDUNDANT/INSUFFICIENT
  OVERLAP_REDUNDANT: 0.8,             // candidate-time overlap above this = same evidence, not two signals
} as const);

// multiple-testing control (transparent, no hidden alpha):
// 1) discovery on TRAIN only; 2) verdict requires the SAME SIGN on HELD-OUT (purged); 3) SHADOW_VALIDATED only
// after fresh shadow (future data — the tape tail is a labeled stand-in, never a final certificate);
// 4) every tested pair is LOGGED (tested_n) so the report always shows how many comparisons produced the finding;
// 5) INSUFFICIENT_EVIDENCE / "best Beast = attacker alone" are valid, publishable outcomes.
export const MULTIPLE_TESTING_POLICY = Object.freeze({
  DISCOVERY_SET: "TRAIN", CONFIRM_RULE: "SAME_SIGN_ON_HELD_OUT", FINAL_RULE: "FRESH_SHADOW_REQUIRED",
  LOG_ALL_COMPARISONS: true, ALLOW_NULL_RESULT: true,
} as const);
