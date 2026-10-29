// VizKit — P1 primitives dùng chung mọi sandbox: GaugeKit (%-ON + band suy-biến) · ContribBarsKit (component nào bó/
// đóng-góp) · InspectorContract (authority + safety) · SandboxShell (layout 3 cột). Presentation-only.
import type { ReactNode } from "react";
import { TK } from "../ui/Ui.tsx";
import { Glyph } from "../ui/Glyph.tsx";
import type { SigContribRow, SigBand } from "../../lib/blocks/sandboxSignature.ts";

const BAND_COL: Record<SigBand, string> = { GOOD: "#3fb950", MID: "#e3b341", DEGENERATE: "#f7768e" };

// gauge nửa-vòng: %-ON, màu theo band (DEGENERATE = đỏ: gate mở/đóng ~100% vô-ảnh-hưởng).
export function GaugeKit({ pct, band, label }: { pct: number; band: SigBand; label: string }) {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, pct / 100))), cx = 60, cy = 52, r = 44;
  const nx = cx + r * Math.cos(a), ny = cy - r * Math.sin(a); const col = BAND_COL[band];
  return (
    <svg width={124} height={68} style={{ display: "block" }}>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="#222a35" strokeWidth={8} />
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${nx},${ny}`} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round" />
      <text x={cx} y={cy - 8} fontSize={15} fontWeight={800} textAnchor="middle" fill={col} fontFamily="var(--mfe-mono)">{pct.toFixed(0)}%</text>
      <text x={cx} y={cy + 9} fontSize={8.5} textAnchor="middle" fill="var(--mfe-muted)">{label}</text>
      {band === "DEGENERATE" && <text x={cx} y={cy + 19} fontSize={7.5} textAnchor="middle" fill="#f7768e"> degenerate</text>}
    </svg>
  );
}

// thanh đóng-góp: bindRate (component nào ĐANG BÓ / chặn nhiều nhất). Đã sort desc ở computeSignature.
export function ContribBarsKit({ rows, title = "Binding conditions" }: { rows: SigContribRow[]; title?: string }) {
  if (!rows.length) return null;
  const mx = Math.max(...rows.map((r) => r.bindRate), 0.001);
  return (
    <div>
      <div className="pmut" style={{ fontSize: 10, marginBottom: 3 }}>{title} <span style={{ opacity: 0.6 }}>Binding frequency; higher means more restrictive</span></div>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 10, minWidth: 96, color: "var(--mfe-text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}</span>
          <div style={{ flex: 1, height: 9, background: "#161d27", borderRadius: 3, overflow: "hidden" }}><div style={{ width: (r.bindRate / mx * 100) + "%", height: "100%", background: r.bindRate > 0.5 ? "#f7768e" : "#5aa9ff" }} /></div>
          <span style={{ fontSize: 9.5, fontFamily: "var(--mfe-mono)", color: "var(--mfe-muted)", minWidth: 34, textAlign: "right" }}>{(r.bindRate * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

// hợp-đồng authority + safety — dòng cố-định của HỆ (không tin AI khai). Mọi sandbox hiện cùng khung.
export function InspectorContract({ layer, rows }: { layer: string; rows: { k: string; v: string; ok?: boolean }[] }) {
  return (
    <div style={{ border: "1px solid #22303f", borderRadius: 7, background: "var(--mfe-s2)", padding: "7px 9px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TK.cyan, marginBottom: 4 }}><Glyph name="id" size={11} /> Contract {layer} <span className="pmut" style={{ fontWeight: 400, fontSize: 9.5 }}>advisory · SHADOW · no-order</span></div>
      {rows.map((r) => <div key={r.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, padding: "1px 0" }}><span className="pmut">{r.k}</span><span style={{ color: r.ok === false ? "#f7768e" : r.ok ? "#3fb950" : "var(--mfe-text)" }}>{r.v}</span></div>)}
    </div>
  );
}

// RibbonLane — lane trạng-thái có NHÃN (parity RegimeRibbon của L2): [nhãn trái][ribbon run-length][nhãn state hiện-tại phải].
// Generic cho mọi bảng trạng-thái (L4 MỞ/ĐÓNG · L5 WATCH/SETUP/READY/VETO/EXIT). Presentation-only.
export function RibbonLane<T extends string>({ states, label, colorOf, labelOf, height = 16 }: { states: T[]; label: string; colorOf: (s: T) => string; labelOf: (s: T) => string; height?: number }) {
  const n = Math.max(1, states.length);
  const segs: { x0: number; x1: number; s: T }[] = [];
  for (let j = 0; j < states.length; j++) { const s = states[j]; const last = segs[segs.length - 1]; if (last && last.s === s) last.x1 = j + 1; else segs.push({ x0: j, x1: j + 1, s }); }
  const cur = states.length ? states[states.length - 1] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0" }}>
      <span style={{ width: 110, fontSize: 10, color: "var(--mfe-muted)", flexShrink: 0 }}>{label}</span>
      <svg width="100%" viewBox={`0 0 ${n} ${height}`} preserveAspectRatio="none" style={{ display: "block", flex: 1, borderRadius: 4, height }}>
        {segs.map((sg, k) => <rect key={k} x={sg.x0} y={0} width={Math.max(0.5, sg.x1 - sg.x0)} height={height} fill={colorOf(sg.s)} opacity={0.85} />)}
      </svg>
      <span style={{ width: 84, textAlign: "right", fontSize: 10.5, fontWeight: 800, color: cur ? colorOf(cur) : "#888", flexShrink: 0 }}>{cur ? labelOf(cur) : "—"}</span>
    </div>
  );
}

// ── Inspector primitives (parity với L2 flagship) — Sec/Row/Pass/ConfidenceGauge dùng chung mọi sandbox ──
export function InspSec({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <div style={{ marginTop: 8 }}><div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--mfe-muted)", fontWeight: 700, marginBottom: 3 }}>{title}</div>{children}</div>;
}
export const InspRow = ({ k, v, c }: { k: string; v: string; c?: string }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, padding: "1.5px 0" }}><span style={{ color: "var(--mfe-muted)" }}>· {k}</span><span style={{ color: c || "var(--mfe-text)", textAlign: "right" }}>{v}</span></div>;
export const InspPass = ({ k, ok = true }: { k: string; ok?: boolean }) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, padding: "1px 0" }}><span style={{ color: "var(--mfe-text2)" }}>{ok ? <Glyph name="check" size={10} /> : <Glyph name="x" size={10} />} {k}</span><b style={{ color: ok ? "#3fb950" : "#f7768e" }}>{ok ? "PASS" : "—"}</b></div>;
// gauge tròn 0..1 (parity Gauge của L2) — cho confidence / độ cân bằng. col theo ngưỡng.
export function ConfidenceGauge({ v, label }: { v: number; label: string }) {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, v))), cx = 60, cy = 52, r = 44;
  const nx = cx + r * Math.cos(a), ny = cy - r * Math.sin(a);
  const col = v >= 0.66 ? "#21d07a" : v >= 0.33 ? "#c8a13a" : "#f7768e";
  return (
    <svg width={124} height={66} style={{ display: "block" }}>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="#222a35" strokeWidth={8} />
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${nx},${ny}`} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round" />
      <text x={cx} y={cy - 8} fontSize={15} fontWeight={800} textAnchor="middle" fill={col} fontFamily="var(--mfe-mono)">{v.toFixed(2)}</text>
      <text x={cx} y={cy + 8} fontSize={9} textAnchor="middle" fill="var(--mfe-muted)">{label}</text>
    </svg>
  );
}

// shell 3 cột chung: form (trái) · chart+viz (giữa) · inspector (phải).
export function SandboxShell({ title, badge, onClose, left, center, right, extraHeader }: { title: ReactNode; badge?: ReactNode; onClose: () => void; left: ReactNode; center: ReactNode; right?: ReactNode; extraHeader?: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#070b11", zIndex: 130, display: "flex", flexDirection: "column", padding: 10, boxSizing: "border-box", overflowY: "auto" }}>
      <div className="pc-h" style={{ color: "#9fd0ff", borderColor: "#1f5b8c", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{title}{badge}{extraHeader}<button onClick={onClose} style={{ marginLeft: "auto", background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 7px", fontSize: 12, cursor: "pointer" }}><Glyph name="x" size={11} /> Close</button></div>
      <div style={{ display: "grid", gridTemplateColumns: right ? "minmax(300px,1fr) minmax(360px,1.15fr) minmax(200px,0.6fr)" : "minmax(320px,1fr) minmax(360px,1.15fr)", gap: 12, marginTop: 8 }}>
        <div style={{ minWidth: 0 }}>{left}</div>
        <div style={{ minWidth: 0 }}>{center}</div>
        {right && <div style={{ minWidth: 0 }}>{right}</div>}
      </div>
    </div>
  );
}
