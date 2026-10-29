// cardBeastV2/validators — F0 structural validators: role inheritance (authority narrows, never escalates),
// Beast formation preflight, MULTI_ATTACKER split rule, evidence-source overlap, and the Compatibility formula
// (Effect × Confidence × Stability; INSUFFICIENT_SAMPLE is a status, never a fabricated neutral 50).
// Pure functions; empirical results can NEVER mutate structural authority (they only annotate).
import { BEAST_FORMATION, BLOCK_OUTPUT_ALLOWED_ROLES, type Role } from "./vocabulary.ts";
import { diagnoseCardTriggers } from "../cardTriggerDiagnosis.ts";

// ── role inheritance: block output → allowed roles; any attempt outside the table is an escalation ──
export function allowedRolesForOutput(outputKind: string): readonly Role[] {
  return BLOCK_OUTPUT_ALLOWED_ROLES[outputKind.toUpperCase()] || [];
}
export function assertNoEscalation(outputKind: string, targetRole: Role): void {
  const allowed = allowedRolesForOutput(outputKind);
  if (!allowed.includes(targetRole)) {
    throw new Error(`ROLE_ESCALATION_BLOCKED: output ${outputKind} may only become [${allowed.join(", ")}] — not ${targetRole}.`);
  }
}
/** Empirical results ANNOTATE; they never rewrite authority. A losing attacker stays an attacker structurally. */
export function applyEmpiricalResult(structuralRole: Role, empiricalStatus: string): { structural: Role; note: string } {
  if (empiricalStatus === "ROLE_HOSTILE") return { structural: structuralRole, note: "INVERSE_HYPOTHESIS_RESEARCH_REQUIRED — no auto role flip" };
  return { structural: structuralRole, note: empiricalStatus };
}

// ── Card-level: setup roots + attacker capability (module-list cards: fused voting = ONE root) ──
export interface CardStructure { attackerCapable: boolean; setupRoots: number; splitRequired: boolean; note: string }
export function classifyCardStructure(modules: string[], graphSetupRoots?: number): CardStructure {
  const d = diagnoseCardTriggers(modules || []);
  // today's module-list cards fuse all trigger votes into ONE candidate lifecycle → one root when ≥1 trigger.
  // graph cards (later) may declare independent roots explicitly; ≥2 roots → SPLIT_REQUIRED (a Beast, not a Card).
  const roots = graphSetupRoots != null ? graphSetupRoots : (d.count > 0 ? 1 : 0);
  const split = roots >= 2;
  return {
    attackerCapable: d.count > 0,
    setupRoots: roots,
    splitRequired: split,
    note: split ? "MULTI_ATTACKER_CARD → SPLIT_REQUIRED: independent setup roots must be composed as a Beast"
      : d.count > 0 ? `1 setup root (${d.count} trigger fused)` : d.verdict === "CUSTOM_UNCERTAIN" ? "Custom modules require compiler role classification" : "No setup root; cannot create a candidate",
  };
}

// ── Beast formation preflight (structural only in F0; behavioral preflight = synergy phase) ──
export interface BeastPreflight { ok: boolean; errors: string[]; warnings: string[] }
export function beastPreflight(members: { card_id: string; role: Role; modules?: string[] }[], opts?: { sharedEvidenceRoots?: Record<string, string[]> }): BeastPreflight {
  const errors: string[] = []; const warnings: string[] = [];
  const count = (r: Role) => members.filter((m) => m.role === r).length;
  const rules: [Role, { min: number; max: number }][] = [
    ["ATTACKER", BEAST_FORMATION.PRIMARY_ATTACKER], ["FALLBACK", BEAST_FORMATION.FALLBACK],
    ["SCOUT", BEAST_FORMATION.SCOUT], ["GUARD", BEAST_FORMATION.GUARD],
    ["CONFIRMATION", BEAST_FORMATION.CONFIRMATION], ["EXIT_SENTINEL", BEAST_FORMATION.EXIT_SENTINEL],
    ["SAFETY", BEAST_FORMATION.SAFETY],
  ];
  for (const [role, lim] of rules) {
    const n = count(role);
    if (n < lim.min) errors.push(`Missing ${role}: requires at least ${lim.min}; received ${n}`);
    if (n > lim.max) errors.push(`Too many ${role}: maximum ${lim.max}; received ${n}`);
  }
  // every ATTACKER must actually be attacker-capable; FALLBACK carries fb_* modules (attacker-silent semantics,
  // V2 2026-07-03) — nó KHÔNG cần trigger thường (đứng một mình là im lặng vĩnh viễn, đúng invariant)
  for (const m of members) {
    if (m.role === "ATTACKER" && m.modules && !classifyCardStructure(m.modules).attackerCapable) {
      errors.push(`${m.card_id} assigned ${m.role} but has no trigger to create a candidate`);
    }
    if (m.role === "FALLBACK" && m.modules && !m.modules.some((id) => id.startsWith("fb_"))) {
      errors.push(`${m.card_id} assigned FALLBACK without a fallback module (such as fb_range_fade)`);
    }
    if (m.role === "ATTACKER" && m.modules && classifyCardStructure(m.modules).splitRequired) {
      errors.push(`${m.card_id}: MULTI_ATTACKER_CARD → SPLIT_REQUIRED before Beast composition`);
    }
  }
  // evidence-source overlap: confirmation sharing the attacker's roots is redundancy, not independent evidence
  const roots = opts?.sharedEvidenceRoots || {};
  const atk = members.find((m) => m.role === "ATTACKER");
  if (atk && roots[atk.card_id]) {
    const aRoots = new Set(roots[atk.card_id]);
    for (const m of members) {
      if (m.role === "CONFIRMATION" && roots[m.card_id]?.every((r) => aRoots.has(r))) {
        warnings.push(`${m.card_id} (CONFIRMATION) shares every evidence source with the attacker: REDUNDANT, not independent evidence`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ── Compatibility = Effect × Confidence × Stability (0–100). No neutral-50 fabrication. ──
export interface CompatibilityInput { effect: number; sampleN: number; minN: number; stability: number }
export function compatibilityScore(inp: CompatibilityInput): { compatibility: number | null; confidence: number; status: "COMPATIBLE" | "CONDITIONAL" | "HOSTILE" | "INSUFFICIENT_SAMPLE"; reason: string } {
  if (inp.sampleN < inp.minN) {
    return { compatibility: null, confidence: 0, status: "INSUFFICIENT_SAMPLE", reason: `n=${inp.sampleN} < ${inp.minN} — no neutral score is substituted` };
  }
  const confidence = Math.min(1, inp.sampleN / (inp.sampleN + inp.minN));      // saturating, transparent
  const stability = Math.max(0, Math.min(1, inp.stability));
  const eff01 = Math.max(-1, Math.min(1, inp.effect));                          // effect normalized −1..+1 by caller
  const signed = eff01 * confidence * stability;                                // −1..+1
  const compatibility = Math.round((signed + 1) * 50);                          // 0..100 display
  const status = signed >= 0.2 ? "COMPATIBLE" : signed >= 0.02 ? "CONDITIONAL" : signed <= -0.1 ? "HOSTILE" : "CONDITIONAL";
  return { compatibility, confidence: +confidence.toFixed(3), status, reason: `effect=${eff01.toFixed(2)} × conf=${confidence.toFixed(2)} × stab=${stability.toFixed(2)}` };
}
