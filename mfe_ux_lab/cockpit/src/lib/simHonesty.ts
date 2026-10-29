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
      reasons: [`Tài-khoản về ≤ 0 tại ${a.funding.ruinAt || "lệnh #" + a.funding.ruinTradeIndex} (lệnh thứ ${a.funding.ruinTradeIndex}) → dừng giao-dịch`, "Rủi-ro/lệnh quá lớn cho số vốn này, hoặc edge âm"],
      warnings: ["FUNDING FAILED — vốn cấp không sống nổi qua backtest. Giảm rủi-ro/lệnh hoặc tăng vốn.", "Advisory/research only — không phải lời-khuyên đầu-tư."],
    };
  }
  const netEdge = a.netPF > 1 && a.netNetR > 0;
  const mcRisk = !!(a.monteCarlo && a.monteCarlo.probNegative > 0.35);
  const fragile = a.costFragile || a.pathFragilityStatus === "PATH_FRAGILE" || wf?.verdict === "OOS_FRAGILE" || mcRisk;

  let trust: TrustLevel;
  if (!netEdge) { trust = "NO_EDGE_AFTER_COST"; reasons.push(`NET PF ${a.netPF} ≤ 1 sau phí (net ${a.netNetR}R)`); }
  else if (fragile) {
    trust = "FRAGILE_EDGE";
    if (a.costFragile) reasons.push("COST_FRAGILE — chết khi phí base/stress");
    if (a.pathFragilityStatus === "PATH_FRAGILE") reasons.push("PATH_FRAGILE — phụ-thuộc thứ-tự SL/TP trong nến M1");
    if (wf?.verdict === "OOS_FRAGILE") reasons.push("OOS_FRAGILE — edge không bền qua các fold");
    if (mcRisk) reasons.push(`Monte-Carlo P(âm) ${(a.monteCarlo!.probNegative * 100).toFixed(0)}%`);
  } else if (wf?.verdict === "OOS_STABLE") {
    trust = "ROBUST_IN_SIM"; reasons.push("net edge + OOS_STABLE + không cost/path-fragile + Monte-Carlo ổn");
  } else {
    trust = "CONDITIONAL_EDGE"; reasons.push("net edge dương nhưng chưa đủ bằng-chứng OOS (walk-forward chưa STABLE)");
  }

  if (calLevel !== "FULLY_CALIBRATED") warnings.push("Số liệu MODELED — phí " + (calLevel === "FULLY_PROVISIONAL" ? "PROVISIONAL" : "calibrated một-phần") + ", M1 path APPROX. KHÔNG phải live-ready.");
  warnings.push("Advisory/research only — không phải lời-khuyên đầu-tư, không auto-promote.");

  const map: Record<TrustLevel, { label: string; tone: HonestyVerdict["tone"] }> = {
    NO_EDGE_AFTER_COST: { label: "No measured edge after costs", tone: "red" },
    FRAGILE_EDGE: { label: "Edge MONG-MANH", tone: "orange" },
    CONDITIONAL_EDGE: { label: "Conditional research evidence", tone: "yellow" },
    ROBUST_IN_SIM: { label: "Robust within the stated simulation", tone: "green" },
  };
  return { trust, label: map[trust].label, tone: map[trust].tone, calibrationLevel: calLevel, modeled: true, reasons, warnings };
}
