// CalibrationPanel — the TRUST gate (P1). Runs the instrument-calibration harness: the simulator
// must DETECT injected edges and REJECT noise before any real card verdict is trustworthy.
import { useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { runCalibrationHarness, type CalibrationHarnessResult } from "../lib/simCalibrationHarness.ts";

export function CalibrationPanel() {
  const [res, setRes] = useState<CalibrationHarnessResult | null>(null);
  const [running, setRunning] = useState(false);
  function run() { setRunning(true); setTimeout(() => { try { setRes(runCalibrationHarness()); } finally { setRunning(false); } }, 30); }

  return (
    <div className="pc" style={{ borderColor: "#43306a" }}>
      <div className="pc-h violet"> Instrument Calibration <span className="mut">prove the simulator detects real edge & rejects noise — earn trust in NULL</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="ms-csv" style={{ background: running ? "#6e40c9" : "#1f6feb" }} disabled={running} onClick={run}>{running ? "⏳ Running 7 ground-truth scenarios…" : "▶ Run calibration"}</button>
        {res && <span className="pflag" style={{ margin: 0, background: res.allPass ? "rgba(33,208,122,.14)" : "rgba(255,77,77,.14)", color: res.allPass ? TK.green : TK.red, border: "1px solid " + (res.allPass ? TK.green : TK.red) }}>{res.status} · {res.passCount}/{res.total}</span>}
        <span className="pmut psm">Inject a known edge → must detect · pure noise → must report null.</span>
      </div>
      {res && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ color: "var(--mfe-muted)", fontSize: 9.5, textTransform: "uppercase" }}><th style={{ textAlign: "left", padding: "3px 6px" }}>Scenario</th><th style={{ textAlign: "left" }}>Expected</th><th style={{ textAlign: "left" }}>Actual</th><th>OK</th></tr></thead>
            <tbody>{res.reports.map((r) => (
              <tr key={r.scenario} style={{ borderTop: "1px solid #14202c" }}>
                <td style={{ padding: "3px 6px", fontWeight: 700, color: "var(--mfe-text2)" }}>{r.scenario}</td>
                <td className="pmut" style={{ fontSize: 10 }}>{r.expected_result}</td>
                <td className="pmono" style={{ fontSize: 10, color: "var(--mfe-muted)" }}>{r.actual_result}</td>
                <td style={{ textAlign: "center", color: r.pass ? TK.green : TK.red, fontWeight: 800 }}>{r.pass ? "✓" : "✗"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="pfoot" style={{ marginTop: 6 }}>If this fails, NO real card verdict (incl. NULL) is trustworthy. Synthetic · modeled · the measuring instrument's own calibration.</div>
    </div>
  );
}
