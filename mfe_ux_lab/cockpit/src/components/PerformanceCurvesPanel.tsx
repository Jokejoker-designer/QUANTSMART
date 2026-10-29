// PerformanceCurvesPanel (P3b) — hai đường cong 2D rủi ro (owner spec):
// 1) CALIBRATION CURVE: X = độ tin hệ-thống TỰ NHẬN (claimed reliability của từng trigger family), Y = tỷ-lệ
//    thắng THỰC-TẾ. Điểm rơi DƯỚI đường chéo = OVERCONFIDENT (ảo tưởng sức mạnh) → ứng-viên giáng-cấp coef.
// 2) PARAMETER CURVE: X = dải giá-trị tham-số (BlackSwan atrRatio 1.0→2.0), Y = expectancy → tìm PLATEAU
//    (vùng mặt bằng sống ổn-định) vs SHARP_PEAK (bẫy overfit đỉnh nhọn) vs FLAT_NULL.
// Chạy bằng ONE engine trên tape thật khi bấm nút. advisory · SHADOW · không hứa edge.
import { useState } from "react";
import { getActiveSymbol } from "../lib/activeSymbolStore.ts";
import { TK } from "./ui/Ui.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { runDetachedBacktest } from "../lib/researchJobs.ts";
import { Glyph } from "./ui/Glyph.tsx";
import { calibrationCurve, plateauVerdict, type CalibrationPoint, type ParamPoint, type PlateauVerdict } from "../lib/cardBeastV2/curveAdapters.ts";
import type { CustomModule } from "../lib/customModule.ts";

const W = 320, H = 200, PAD = 34;

export function PerformanceCurvesPanel({ collapsible = false }: { collapsible?: boolean } = {}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(!collapsible);
  const [cal, setCal] = useState<CalibrationPoint[] | null>(null);
  const [par, setPar] = useState<{ points: ParamPoint[]; v: PlateauVerdict } | null>(null);

  async function runCalibration() {
    setBusy("cal"); setError("");
    try {
    const d = await loadSimOhlc("M15"); const bars = (d?.bars || []).slice(-24000);
    const bt = await runDetachedBacktest(bars, { id: "cal", name: "cal", modules: ["trend_pullback", "macd", "fusion", "auto_rr"], design_tf: "M15" }, { symbol: getActiveSymbol(), chartTf: "M15" });
    setCal(calibrationCurve(bt.sim.trades || []));
    } catch (e) { setError(String((e as Error).message || e)); } finally { setBusy(""); }
  }
  async function runSweep() {
    setBusy("par"); setError("");
    try {
    const d = await loadSimOhlc("M15"); const bars = (d?.bars || []).slice(-12000);
    const pts: ParamPoint[] = [];
    for (let v = 1.0; v <= 2.01; v += 0.125) {
      const swan: CustomModule = { id: "sw_" + v, level: 5, role: "VETO", name: "swan", explain: "sweep test veto shock..", why: "param sweep atrRatio..", conditions: [{ metric: "atrRatio", op: ">", value: +v.toFixed(3) }], logic: "ALL", status: "SHADOW", createdAt: "t" };
      const bt = await runDetachedBacktest(bars, { id: "sw", name: "sw", modules: ["trend_pullback", "fusion", "auto_rr", swan.id], design_tf: "M15" }, { symbol: getActiveSymbol(), chartTf: "M15", customModules: [swan] });
      const t = bt.sim.trades || [];
      pts.push({ value: +v.toFixed(3), expectancy: t.length ? +(t.reduce((s, x) => s + x.netR, 0) / t.length).toFixed(4) : null, n: t.length });
    }
    setPar({ points: pts, v: plateauVerdict(pts) });
    } catch (e) { setError(String((e as Error).message || e)); } finally { setBusy(""); }
  }

  const sx = (x: number, lo: number, hi: number) => PAD + (x - lo) / (hi - lo || 1) * (W - PAD - 8);
  const sy = (y: number, lo: number, hi: number) => H - PAD + (y - lo) / (hi - lo || 1) * (PAD + 8 - H);

  return (
    <div className="pc" style={{ marginBottom: 14 }}>
      <div className="pc-h" onClick={() => collapsible && setOpen((v) => !v)} style={collapsible ? { cursor: "pointer", userSelect: "none" } : undefined}>
        {collapsible ? (open ? "▾ " : "▸ ") : ""}<Glyph name="bar-chart" size={14} /> Performance Curves <span className="mut">Calibration and parameter stability. Shadow research.</span>
      </div>
      {error && <p role="alert" style={{ padding: 12, color: TK.orange, fontSize: 12 }}>Research job failed: {error}</p>}
      {!open ? null : <>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "6px 2px" }}>

        {/* Calibration */}
        <div>
          <button onClick={runCalibration} disabled={!!busy} style={{ background: TK.yellow, color: "#06101a", border: "none", borderRadius: 6, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginBottom: 6 }}>{busy === "cal" ? "…" : "Calibration Curve"}</button>
          {cal && (
            <svg width={W} height={H} style={{ background: "#0b141e", borderRadius: 8, border: "1px solid var(--mfe-border)" }}>
              <line x1={sx(0.25, 0.25, 0.65)} y1={sy(0.25, 0.25, 0.65)} x2={sx(0.65, 0.25, 0.65)} y2={sy(0.65, 0.25, 0.65)} stroke="#33414f" strokeDasharray="4 3" />
              <text x={W - 10} y={H - 8} fill="#8295aa" fontSize="9" textAnchor="end">claimed rel →</text>
              <text x={10} y={16} fill="#8295aa" fontSize="9">actual hit ↑</text>
              {cal.map((p) => p.actual != null && (
                <g key={p.family}>
                  <circle cx={sx(p.claimed, 0.25, 0.65)} cy={sy(p.actual, 0.25, 0.65)} r={5} fill={p.verdict === "OVERCONFIDENT" ? TK.red : p.verdict === "OK" ? TK.green : p.verdict === "UNDERCONFIDENT" ? TK.cyan : "#5d6f82"} />
                  <text x={sx(p.claimed, 0.25, 0.65) + 7} y={sy(p.actual, 0.25, 0.65) + 3} fill={TK.text2} fontSize="9">{p.family} n={p.n}</text>
                </g>
              ))}
            </svg>
          )}
          {cal && <div style={{ fontSize: 10.5, maxWidth: W, marginTop: 4 }}>
            {cal.map((p) => <div key={p.family} style={{ color: p.verdict === "OVERCONFIDENT" ? TK.red : p.verdict === "OK" ? TK.green : TK.muted }}>▪ {p.family}: claim {(p.claimed * 100).toFixed(0)}% → observed {p.actual != null ? (p.actual * 100).toFixed(1) : "—"}% (n={p.n}) <b>{p.verdict}</b>{p.verdict === "OVERCONFIDENT" ? "Review reliability in Hidden Coefficients" : ""}</div>)}
            <div style={{ color: TK.muted, marginTop: 2 }}>Points below the diagonal are overconfident. Hit rate is not PnL; interpret it with sample count and payoff size.</div>
          </div>}
        </div>

        {/* Parameter sweep */}
        <div>
          <button onClick={runSweep} disabled={!!busy} style={{ background: TK.cyan, color: "#06101a", border: "none", borderRadius: 6, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginBottom: 6 }}>{busy === "par" ? "… (9 runs)" : "Param Curve: BlackSwan atrRatio 1.0→2.0"}</button>
          {par && (() => {
            const es = par.points.filter((p) => p.expectancy != null).map((p) => p.expectancy as number);
            const lo = Math.min(...es, 0) - 0.02, hi = Math.max(...es, 0) + 0.02;
            return (
              <svg width={W} height={H} style={{ background: "#0b141e", borderRadius: 8, border: "1px solid var(--mfe-border)" }}>
                <line x1={PAD} y1={sy(0, lo, hi)} x2={W - 8} y2={sy(0, lo, hi)} stroke="#33414f" strokeDasharray="4 3" />
                {par.v.plateau.length > 0 && <rect x={sx(Math.min(...par.v.plateau), 1, 2)} y={PAD - 20} width={sx(Math.max(...par.v.plateau), 1, 2) - sx(Math.min(...par.v.plateau), 1, 2)} height={H - PAD - 12} fill={TK.green + "18"} />}
                <polyline fill="none" stroke={TK.cyan} strokeWidth={2}
                  points={par.points.filter((p) => p.expectancy != null).map((p) => `${sx(p.value, 1, 2)},${sy(p.expectancy as number, lo, hi)}`).join(" ")} />
                {par.points.map((p) => p.expectancy != null && <circle key={p.value} cx={sx(p.value, 1, 2)} cy={sy(p.expectancy, lo, hi)} r={3} fill={TK.cyan} />)}
                <text x={W - 10} y={H - 8} fill="#8295aa" fontSize="9" textAnchor="end">atrRatio threshold →</text>
                <text x={10} y={16} fill="#8295aa" fontSize="9">expectancy R ↑</text>
              </svg>
            );
          })()}
          {par && <div style={{ fontSize: 10.5, maxWidth: W, marginTop: 4, color: par.v.verdict === "PLATEAU_FOUND" ? TK.green : par.v.verdict === "SHARP_PEAK" ? TK.orange : TK.muted }}>
            <b>{par.v.verdict}</b> — {par.v.note}{par.v.verdict === "SHARP_PEAK" ? "Do not select a parameter from a sharp in-sample peak" : ""}
          </div>}
        </div>
      </div>
      <div style={{ fontSize: 10, color: TK.muted }}>In-sample measurements on the stated tape. Calibration or a plateau still needs held-out confirmation.</div>
      </>}
    </div>
  );
}
