// simHonesty — P3. Consolidate the whole realism stack into ONE honest verdict per card:
// net edge (after cost) + cost/path fragility + Monte-Carlo downside + walk-forward OOS + calibration.
// Never upgrades to "live-ready"; the ceiling is "ROBUST_IN_SIM (still modeled)".
import type { RealisticAnalytics } from "./realisticSimAnalytics.ts";
import type { WalkForwardResult } from "./simWalkForward.ts";
import type { CalibrationLevel } from "./simCalibration.ts";

export type TrustLevel = "NO_EDGE_AFTER_COST" | "FRAGILE_EDGE" | "CONDITIONAL_EDGE" | "ROBUST_IN_SIM";
export interface HonestyVerdict {
  trust: TrustLevel;
  label: string;
  tone: "red" | "orange" | "yellow" | "green";
  calibrationLevel: CalibrationLevel;
  modeled: true;
  reasons: string[];
  warnings: string[];
}

export function honestyVerdict(a: RealisticAnalytics, wf: WalkForwardResult | undefined, calLevel: CalibrationLevel): HonestyVerdict {
  const reasons: string[] = []; const warnings: string[] = [];
  // Funding ruin dominates everything: if the account blew up mid-backtest, the run FAILED.
  if (a.funding && a.funding.ruined) {
    return {
      trust: "NO_EDGE_AFTER_COST", label: "Modeled capital depleted", tone: "red", calibrationLevel: calLevel, modeled: true,
      reasons: [`Simulated account reached zero or below at ${a.funding.ruinAt || "trade #" + a.funding.ruinTradeIndex} (trade number ${a.funding.ruinTradeIndex}); simulation stops`, "Per-trade research risk is too large for this capital, or the measured edge is negative"],
      warnings: ["FUNDING FAILED: the simulated capital did not survive this backtest. Review risk assumptions and starting capital.", "Research only; not investment advice."],
    };
  }
  const netEdge = a.netPF > 1 && a.netNetR > 0;
  const mcRisk = !!(a.monteCarlo && a.monteCarlo.probNegative > 0.35);
  const fragile = a.costFragile || a.pathFragilityStatus === "PATH_FRAGILE" || wf?.verdict === "OOS_FRAGILE" || mcRisk;

  let trust: TrustLevel;
  if (!netEdge) { trust = "NO_EDGE_AFTER_COST"; reasons.push(`NET PF ${a.netPF} is at most 1 after costs (net ${a.netNetR}R)`); }
  else if (fragile) {
    trust = "FRAGILE_EDGE";
    if (a.costFragile) reasons.push("COST_FRAGILE — does not survive base/stress costs");
    if (a.pathFragilityStatus === "PATH_FRAGILE") reasons.push("PATH_FRAGILE — depends on intrabar M1 stop/target ordering");
    if (wf?.verdict === "OOS_FRAGILE") reasons.push("OOS_FRAGILE — the measured edge is unstable across folds");
    if (mcRisk) reasons.push(`Monte Carlo probability of a negative result ${(a.monteCarlo!.probNegative * 100).toFixed(0)}%`);
  } else if (wf?.verdict === "OOS_STABLE") {
    trust = "ROBUST_IN_SIM"; reasons.push("Positive net edge, stable OOS, no cost/path fragility and acceptable Monte Carlo diagnostics");
  } else {
    trust = "CONDITIONAL_EDGE"; reasons.push("Positive net result with insufficient stable walk-forward evidence");
  }

  if (calLevel !== "FULLY_CALIBRATED") warnings.push("Modeled measurements; costs " + (calLevel === "FULLY_PROVISIONAL" ? "PROVISIONAL" : "partially calibrated") + ", approximate M1 path. Does not establish live readiness.");
  warnings.push("Research only; no automatic promotion or investment recommendation.");

  const map: Record<TrustLevel, { label: string; tone: HonestyVerdict["tone"] }> = {
    NO_EDGE_AFTER_COST: { label: "No measured edge after costs", tone: "red" },
    FRAGILE_EDGE: { label: "Edge MONG-MANH", tone: "orange" },
    CONDITIONAL_EDGE: { label: "Conditional research evidence", tone: "yellow" },
    ROBUST_IN_SIM: { label: "Robust within the stated simulation", tone: "green" },
  };
  return { trust, label: map[trust].label, tone: map[trust].tone, calibrationLevel: calLevel, modeled: true, reasons, warnings };
}
