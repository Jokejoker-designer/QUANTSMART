// cardPassport — WO-1A. Derive a Card PASSPORT (evidence-derived metadata) from a REAL realistic
// backtest run. READ-ONLY, NO ENGINE CHANGE: it consumes a RealisticBacktest already produced by
// runRealisticBacktest(...) and NEVER the Canvas evaluate() modeled numbers. Every field carries a
// source_of_truth tag; a MetricValidityGate caps the claimable trust so a thin-sample / unbounded-PF /
// fragile card can never be dressed up. No real run yet → NEEDS_RUN (no fabricated tags).
// Advisory · modeled · ceiling ROBUST_IN_SIM is STILL modeled, never live-ready.
import type { RealisticBacktest } from "./realisticSimRun.ts";
import { classifyCard, type CardClassification } from "./cardTaxonomy.ts";
import { honestyVerdict, type TrustLevel } from "./simHonesty.ts";
import type { AblationResult } from "./simAblation.ts";
import { buildOperatingContext, operatingContextHash, type CardOperatingContext } from "./cardOperatingContext.ts";

// source_of_truth (manager guard #2) — fixed vocabulary; no source → not shown as evidence.
export type PassportSource =
  | "manifest" | "realistic_backtest" | "walk_forward" | "monte_carlo"
  | "ablation" | "taxonomy" | "heuristic" | "user_assigned" | "unknown";

export interface PassportField<T> { value: T; source: PassportSource; note?: string }

// MetricValidityGate (manager guard #1)
export type MetricValidityFlag =
  | "THIN_SAMPLE" | "UNBOUNDED_PF" | "NOT_VALID_FOR_PROMOTION"
  | "WALK_FORWARD_INSUFFICIENT" | "COST_PATH_FRAGILE";

export interface MetricValidityGate {
  status: "VALID" | "CAPPED" | "INVALID_FOR_PROMOTION";
  flags: MetricValidityFlag[];
  n: number;
  lossCount: number;
  netPF: number;
  pfUnbounded: boolean;          // loss_count === 0 (PF=999 sentinel) → no losses yet to bound PF
  walkForwardFolds: number;
  maxClaimableTrust: TrustLevel; // gate-capped ceiling the honesty verdict cannot exceed
  reasons: string[];
}

export interface PassportHonesty {
  value: TrustLevel;
  source: PassportSource;
  reasons: string[];
  cappedFrom?: TrustLevel;       // set when the gate lowered the raw honesty verdict
  note: string;
}

export interface CardPassport {
  card_id: string;
  card_name: string;
  generated_at: string;
  status: "PASSPORT_MODELED" | "NEEDS_RUN";
  modeled: true;
  needsRunReason?: string;
  run_id?: PassportField<string>;
  taxonomy?: PassportField<CardClassification>;
  metrics?: {
    n: PassportField<number>;
    lossCount: PassportField<number>;
    netPF: PassportField<number>;
    netNetR: PassportField<number>;
    netWinRate: PassportField<number>;
    maxDDNetR: PassportField<number>;
  };
  metricValidity?: MetricValidityGate;
  honesty?: PassportHonesty;
  operatingContext?: PassportField<CardOperatingContext>;   // WO-3: the environment this evidence is bound to
  contextHash?: PassportField<string>;                      // WO-3 guard #4: versioned env identity
  oos?: PassportField<string> & { positiveFraction?: number; folds?: number };
  truthLevel?: PassportField<string>;
  weaknesses?: string[];
  ablation?: { helps: string[]; hurts: string[]; neutral: string[]; source: "ablation" };
}

const RANK: Record<TrustLevel, number> = { NO_EDGE_AFTER_COST: 0, FRAGILE_EDGE: 1, CONDITIONAL_EDGE: 2, ROBUST_IN_SIM: 3 };
const BY_RANK: TrustLevel[] = ["NO_EDGE_AFTER_COST", "FRAGILE_EDGE", "CONDITIONAL_EDGE", "ROBUST_IN_SIM"];
const minTrust = (a: TrustLevel, b: TrustLevel): TrustLevel => BY_RANK[Math.min(RANK[a], RANK[b])];

export const PASSPORT_THIN_SAMPLE_N = 100;   // n < this → THIN_SAMPLE (guard #1)

export interface PassportCardInput { id?: string; name?: string; modules?: string[]; role?: string; design_tf?: string }
export interface DerivePassportInput {
  card: PassportCardInput;
  backtest?: RealisticBacktest | null;   // a REAL realistic run — NEVER Canvas evaluate()
  ablation?: AblationResult | null;      // optional (heavy); mapped only if provided
  period?: string;                       // WO-3: run-window label for the operating context (default "All")
  sessionScope?: string;                 // WO-3: session scope (default "ALL")
}

export function deriveCardPassport(inp: DerivePassportInput): CardPassport {
  const card = inp.card || {};
  const card_id = String(card.id || "card");
  const card_name = String(card.name || card_id);
  const generated_at = new Date().toISOString();
  const bt = inp.backtest;

  // Guard (acceptance #2): no Passport without a REAL run + manifest → NEEDS_RUN, no fabricated tags.
  if (!bt || !bt.manifest || !bt.manifest.run_id || !bt.analytics || bt.analytics.n == null) {
    return {
      card_id, card_name, generated_at, status: "NEEDS_RUN", modeled: true,
      needsRunReason: "Chưa có realistic backtest run (manifest/analytics). KHÔNG bịa tag — chạy runRealisticBacktest trước.",
    };
  }

  const a = bt.analytics;
  const lossCount = (bt.sim?.trades || []).filter((t) => t.netR < 0).length;
  const pfUnbounded = lossCount === 0 || a.netPF >= 999;
  const wf = bt.walkForward;
  const wfFolds = wf?.evaluatedFolds ?? 0;
  const wfInsufficient = !wf || wf.verdict === "OOS_INSUFFICIENT" || wfFolds < 3;
  const fragile = a.costFragile || a.pathFragilityStatus === "PATH_FRAGILE";

  // ── MetricValidityGate (guard #1) ──
  const flags: MetricValidityFlag[] = [];
  const gReasons: string[] = [];
  let cap: TrustLevel = "ROBUST_IN_SIM";
  if (a.n < PASSPORT_THIN_SAMPLE_N) { flags.push("THIN_SAMPLE"); gReasons.push(`n=${a.n} < ${PASSPORT_THIN_SAMPLE_N} → mẫu mỏng`); cap = minTrust(cap, "FRAGILE_EDGE"); }
  if (pfUnbounded) { flags.push("UNBOUNDED_PF"); gReasons.push(`loss_count=${lossCount} / netPF=${a.netPF} → PF chưa chặn (chưa có thua để đo)`); cap = minTrust(cap, "FRAGILE_EDGE"); }
  if (a.netPF >= 999) { flags.push("NOT_VALID_FOR_PROMOTION"); gReasons.push("netPF=999 sentinel → KHÔNG hợp-lệ để promote"); cap = minTrust(cap, "FRAGILE_EDGE"); }
  if (wfInsufficient) { flags.push("WALK_FORWARD_INSUFFICIENT"); gReasons.push(`walk-forward ${wf?.verdict || "NOT_RUN"} (folds ${wfFolds}) → tối đa CONDITIONAL_EDGE`); cap = minTrust(cap, "CONDITIONAL_EDGE"); }
  if (fragile) { flags.push("COST_PATH_FRAGILE"); gReasons.push("cost/path fragile → KHÔNG được ROBUST_IN_SIM"); cap = minTrust(cap, "FRAGILE_EDGE"); }

  const gateStatus: MetricValidityGate["status"] =
    (flags.includes("NOT_VALID_FOR_PROMOTION") || flags.includes("UNBOUNDED_PF")) ? "INVALID_FOR_PROMOTION"
      : flags.length ? "CAPPED" : "VALID";
  const metricValidity: MetricValidityGate = {
    status: gateStatus, flags, n: a.n, lossCount, netPF: a.netPF, pfUnbounded, walkForwardFolds: wfFolds, maxClaimableTrust: cap, reasons: gReasons,
  };

  // ── Honesty verdict (derived from the REAL run) capped by the gate — prevents "làm đẹp" thin cards ──
  const hv = honestyVerdict(a, wf, bt.calibration?.level ?? "FULLY_PROVISIONAL");
  const cappedTrust = minTrust(hv.trust, cap);
  const honesty: PassportHonesty = {
    value: cappedTrust, source: "realistic_backtest", reasons: hv.reasons,
    cappedFrom: cappedTrust !== hv.trust ? hv.trust : undefined,
    note: "Modeled research evidence; even the highest simulation classification is not live readiness.",
  };

  // ── Taxonomy (each dimension already carries its own source) ──
  const taxonomy = classifyCard(card, bt);

  // ── Operating Context (WO-3, guard #4) — the environment this evidence is bound to + versioned hash ──
  const opCtx = buildOperatingContext({
    card, manifest: bt.manifest, period: inp.period, sessionScope: inp.sessionScope,
    capital: bt.manifest.risk_model.initialEquity, riskPct: bt.manifest.risk_model.riskPctEquity, pathM1: bt.m1Master,
  });
  const ctxHash = operatingContextHash(opCtx);

  // ── Weaknesses (guard: costFragile/pathFragile must surface) ──
  const weaknesses: string[] = [];
  if (a.costFragile) weaknesses.push("COST_FRAGILE — edge chết khi phí base/stress");
  if (a.pathFragilityStatus === "PATH_FRAGILE") weaknesses.push("PATH_FRAGILE — phụ-thuộc thứ-tự SL/TP trong nến M1");
  if (wf?.verdict === "OOS_FRAGILE") weaknesses.push("OOS_FRAGILE — edge không bền qua các fold");
  if (wfInsufficient) weaknesses.push("OOS_INSUFFICIENT — chưa đủ fold walk-forward để tin");
  if (a.n < PASSPORT_THIN_SAMPLE_N) weaknesses.push(`THIN_SAMPLE — chỉ ${a.n} lệnh (< ${PASSPORT_THIN_SAMPLE_N})`);
  if (pfUnbounded) weaknesses.push("UNBOUNDED_PF — chưa có lệnh thua để đo PF thật");
  if (a.monteCarlo && a.monteCarlo.probNegative > 0.35) weaknesses.push(`MONTE_CARLO_RISK — P(âm) ${(a.monteCarlo.probNegative * 100).toFixed(0)}%`);

  const oos: CardPassport["oos"] = wf
    ? { value: wf.verdict, source: "walk_forward", positiveFraction: wf.positiveFraction, folds: wfFolds }
    : { value: "NOT_RUN", source: "walk_forward", note: "Walk-forward was not requested for this run." };

  const passport: CardPassport = {
    card_id, card_name, generated_at, status: "PASSPORT_MODELED", modeled: true,
    run_id: { value: bt.manifest.run_id, source: "manifest" },
    taxonomy: { value: taxonomy, source: "taxonomy", note: "Each dimension has its own provenance. Regime, volatility and liquidity heuristics remain labeled." },
    metrics: {
      n: { value: a.n, source: "realistic_backtest" },
      lossCount: { value: lossCount, source: "realistic_backtest" },
      netPF: { value: a.netPF, source: "realistic_backtest" },
      netNetR: { value: a.netNetR, source: "realistic_backtest" },
      netWinRate: { value: a.netWinRate, source: "realistic_backtest" },
      maxDDNetR: { value: a.maxDDNetR, source: "realistic_backtest" },
    },
    metricValidity,
    honesty,
    operatingContext: { value: opCtx, source: "manifest", note: `design_tf ${opCtx.design_tf} (${opCtx.design_tf_source}) · path ${opCtx.path_tf} · ${opCtx.period}` },
    contextHash: { value: ctxHash, source: "manifest", note: "Versioned context identity; evidence from different environments is kept separate." },
    oos,
    truthLevel: { value: `${bt.manifest.truth_contract.costTruth} · ${bt.manifest.truth_contract.pathTruth}`, source: "manifest" },
    weaknesses,
  };

  if (inp.ablation) {
    const ab = inp.ablation;
    passport.ablation = {
      helps: ab.rows.filter((r) => r.verdict === "HELPS").map((r) => r.id),
      hurts: ab.rows.filter((r) => r.verdict === "HURTS").map((r) => r.id),
      neutral: ab.rows.filter((r) => r.verdict === "NEUTRAL").map((r) => r.id),
      source: "ablation",
    };
  }

  return passport;
}
