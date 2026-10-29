// HonestyDashboard — P3. ONE consolidated honesty verdict per card: net edge after cost +
// cost/path fragility + Monte-Carlo downside + walk-forward OOS + calibration level. Ceiling is
// "ROBUST_IN_SIM (still modeled)" — never "live-ready". Sits on top of the RealismPanel detail.
import { TK } from "./ui/Ui.tsx";
import type { RealisticBacktest } from "../lib/realisticSimRun.ts";
import { honestyVerdict } from "../lib/simHonesty.ts";

const f = (v: number | undefined, d = 2) => (v == null || isNaN(v) ? "—" : v.toFixed(d));

export function HonestyDashboard({ bt }: { bt: RealisticBacktest }) {
  const a = bt.analytics;
  const cal = bt.calibration?.level ?? "FULLY_PROVISIONAL";
  const v = honestyVerdict(a, bt.walkForward, cal);
  const tone = { red: TK.red, orange: TK.orange, yellow: TK.yellow, green: TK.green }[v.tone];
  const calColor = cal === "FULLY_CALIBRATED" ? TK.green : cal === "PARTIALLY_CALIBRATED" ? TK.yellow : TK.orange;

  const Stat = ({ k, val, c }: { k: string; val: string; c?: string }) => (
    <div style={{ flex: 1, minWidth: 96, background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderRadius: 8, padding: "7px 9px" }}>
      <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}>{k}</div>
      <div className="pmono" style={{ fontSize: 13, fontWeight: 800, color: c || "var(--mfe-text)", marginTop: 2 }}>{val}</div>
    </div>
  );

  return (
    <div className="pc" style={{ borderColor: tone, background: `linear-gradient(180deg, ${tone}14, var(--mfe-s1))` }}>
      <div className="pc-h" style={{ color: tone }}> Honesty Dashboard <span className="mut">Consolidated research assessment {bt.designTf} · modeled</span></div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ padding: "8px 16px", borderRadius: 10, background: tone + "22", border: "1.5px solid " + tone }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: tone, letterSpacing: ".3px" }}>{v.label}</div>
          <div className="pmono" style={{ fontSize: 10, color: "var(--mfe-muted)" }}>{v.trust}</div>
        </div>
        <span className="pflag" style={{ margin: 0, background: calColor + "1e", color: calColor, border: "1px solid " + calColor }}>CALIBRATION: {cal}</span>
        <span className="pflag a" style={{ margin: 0 }}>Modeled execution; not live readiness</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <Stat k="Net PF" val={f(a.netPF)} c={a.netPF >= 1 ? TK.green : TK.red} />
        <Stat k="Net R" val={(a.netNetR >= 0 ? "+" : "") + f(a.netNetR)} c={a.netNetR >= 0 ? TK.green : TK.red} />
        <Stat k="Cost" val={a.costFragile ? "FRAGILE" : "ok"} c={a.costFragile ? TK.red : TK.green} />
        <Stat k="Path" val={a.pathFragilityStatus === "PATH_FRAGILE" ? "FRAGILE" : "stable"} c={a.pathFragilityStatus === "PATH_FRAGILE" ? TK.red : TK.green} />
        <Stat k="Walk-forward" val={bt.walkForward ? bt.walkForward.verdict.replace("OOS_", "") : "—"} c={bt.walkForward?.verdict === "OOS_STABLE" ? TK.green : bt.walkForward?.verdict === "OOS_FRAGILE" ? TK.red : TK.yellow} />
        <Stat k="MC P(neg)" val={a.monteCarlo ? (a.monteCarlo.probNegative * 100).toFixed(0) + "%" : "—"} c={a.monteCarlo && a.monteCarlo.probNegative > 0.35 ? TK.red : TK.text} />
      </div>

      <div className="pkv" style={{ alignItems: "flex-start" }}><span style={{ minWidth: 70 }}>Rationale</span><b style={{ fontWeight: 500, color: "var(--mfe-text)", textAlign: "left" }}>{v.reasons.join(" · ")}</b></div>
      {v.warnings.map((w, i) => <div key={i} className="pfoot" style={{ color: TK.orange, marginTop: i === 0 ? 6 : 2 }}>⚠ {w}</div>)}
      {bt.calibration && bt.calibration.notes.length > 0 && <div className="pfoot" style={{ marginTop: 4 }}>Calibration: {bt.calibration.notes.join(" · ")}</div>}
    </div>
  );
}
