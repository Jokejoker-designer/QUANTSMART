// ChartPane — P1 viz-kit: chart nến CHUNG cho mọi sandbox (L1..L6) + Native Explainer (một nguồn, hai mặt).
// Vẽ: nến + overlay lines/bands (price-space, TradingView-like) + markers (fire/decision) + LANE dao-động dưới
// (signal series, baseline 0, tô theo ribbon state) + ribbon strip. Presentation-only · causal · KHÔNG order.
// replay (tùy chọn): chế độ 120-nến / Toàn-bộ + Play/Pause/tua/tốc-độ — forward-only playhead (no-lookahead).
import { useEffect, useMemo, useState } from "react";
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { RibbonState } from "../../lib/blocks/sandboxSignature.ts";

export interface ChartOverlay { id: string; points: (number | null)[]; color: string; label?: string; band?: { lo: (number | null)[]; hi: (number | null)[] } }
export interface ChartMarker { i: number; kind: "fire" | "buy" | "sell" | "tick"; color?: string; label?: string }
export interface ChartOscillator { series: number[]; states?: RibbonState[]; color?: string; label?: string; signed?: boolean }
export interface ChartPaneProps { bars: OhlcBar[]; window?: number; overlays?: ChartOverlay[]; markers?: ChartMarker[]; oscillator?: ChartOscillator; height?: number; replay?: boolean; replayWindow?: number }

const ST_COL: Record<RibbonState, string> = { ON: "#2BB673", OFF: "#F0524A", NEUTRAL: "#3a4656" };
const btn: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid #22303f", color: "var(--mfe-text2)", borderRadius: 6, padding: "2px 7px", fontSize: 10.5, cursor: "pointer" };

export function ChartPane({ bars, window = 400, overlays = [], markers = [], oscillator, height = 240, replay = false, replayWindow = 120 }: ChartPaneProps) {
  const full = bars || [];
  const n = full.length;
  const [viewMode, setViewMode] = useState<"window" | "full">("window");
  const [playhead, setPlayhead] = useState(-1);   // -1 = nến mới nhất
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => { setPlayhead(n - 1); setPlaying(false); }, [n]);   // tape đổi → về mới nhất, dừng
  useEffect(() => {
    if (!replay || !playing) return;
    const id = setInterval(() => setPlayhead((p) => { const cur = p < 0 ? n - 1 : p; const np = cur + speed; if (np >= n - 1) { setPlaying(false); return n - 1; } return np; }), 130);
    return () => clearInterval(id);
  }, [replay, playing, speed, n]);

  const end = replay ? (playhead < 0 ? n - 1 : Math.min(playhead, n - 1)) : n - 1;
  const win = replay ? (viewMode === "full" ? n : replayWindow) : window;
  const start = Math.max(0, end - win + 1);
  const view = useMemo(() => full.slice(start, end + 1), [full, start, end]);
  const offset = start;
  if (view.length < 2) return <div className="pmut psm" style={{ padding: 8 }}>Loading bars…</div>;

  const W = 600, MR = 46, MT = 6, MB = 14;
  const hasOsc = !!oscillator && oscillator.series.length > 0;
  const H = height, ribH = hasOsc ? 10 : 0, oscH = hasOsc ? Math.round((H - MT - MB) * 0.26) : 0;
  const CY0 = MT, CY1 = MT + (H - MT - MB) - oscH - ribH - (hasOsc ? 6 : 0), CH = CY1 - CY0;
  const lo = Math.min(...view.map((b) => b.l)), hi = Math.max(...view.map((b) => b.h)); const span = (hi - lo) || 1;
  const slot = (W - MR) / view.length, bw = Math.max(slot * 0.6, 1);
  const xFor = (j: number) => (j + 0.5) * slot;
  const yP = (p: number) => CY0 + CH * (1 - (p - lo) / span);
  const line = (pts: (number | null)[]) => view.map((_, j) => { const v = pts[j + offset]; return v == null || !Number.isFinite(v) ? "" : `${j === 0 || pts[j - 1 + offset] == null ? "M" : "L"} ${xFor(j).toFixed(1)} ${yP(v).toFixed(1)}`; }).join(" ");

  // oscillator lane geometry
  const OY0 = CY1 + (hasOsc ? 6 : 0), OY1 = OY0 + oscH; const ov = oscillator?.series ?? [];
  const ofin = view.map((_, j) => ov[j + offset]).filter(Number.isFinite);
  const amp = ofin.length ? Math.max(Math.abs(Math.min(...ofin)), Math.abs(Math.max(...ofin)), 1e-9) : 1;
  const oyZero = OY0 + oscH / 2;
  const yO = (v: number) => oyZero - (v / amp) * (oscH / 2);
  const oscPath = view.map((_, j) => { const v = ov[j + offset]; return v == null || !Number.isFinite(v) ? "" : `${j === 0 || !Number.isFinite(ov[j - 1 + offset]) ? "M" : "L"} ${xFor(j).toFixed(1)} ${yO(v).toFixed(1)}`; }).join(" ");
  const step = Math.max(1, speed * 5);
  const setPh = (v: number) => { setPlaying(false); setPlayhead(Math.max(0, Math.min(n - 1, v))); };

  return (
    <div style={{ border: "1px solid #1b2a39", borderRadius: 8, background: "#070D14", overflow: "hidden" }}>
      {replay && n > 2 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderBottom: "1px solid #152230", flexWrap: "wrap", background: "#0a1119" }}>
          <div style={{ display: "inline-flex", border: "1px solid #22303f", borderRadius: 6, overflow: "hidden" }}>
            {([["window", `${replayWindow} bars`], ["full", "All"]] as const).map(([m, l]) => <button key={m} onClick={() => setViewMode(m)} style={{ ...btn, border: "none", borderRadius: 0, fontWeight: 700, background: viewMode === m ? "rgba(37,183,255,.18)" : "transparent", color: viewMode === m ? "#37c0ff" : "#8a97a6" }}>{l}</button>)}
          </div>
          <button style={btn} title={"Reset to start"} onClick={() => setPh(Math.min(replayWindow, n - 1))}>⏮</button>
          <button style={btn} title={"Previous"} onClick={() => setPh((playhead < 0 ? n - 1 : playhead) - step)}>◀</button>
          <button style={{ ...btn, background: playing ? "#5a3a18" : "#1f6feb", color: "#fff", border: "none", fontWeight: 800, minWidth: 62 }} onClick={() => { if (!playing && end >= n - 1) setPlayhead(Math.min(replayWindow, n - 1)); setPlaying((p) => !p); }}>{playing ? "Pause" : "▶ Play"}</button>
          <button style={btn} title={"Next"} onClick={() => setPh((playhead < 0 ? n - 1 : playhead) + step)}>▶</button>
          <div style={{ display: "inline-flex", border: "1px solid #22303f", borderRadius: 6, overflow: "hidden" }}>{[1, 2, 4].map((s) => <button key={s} onClick={() => setSpeed(s)} style={{ ...btn, border: "none", borderRadius: 0, background: speed === s ? "rgba(37,183,255,.18)" : "transparent", color: speed === s ? "#37c0ff" : "#8a97a6" }}>{s}×</button>)}</div>
          <input type="range" min={Math.min(replayWindow, n - 1)} max={n - 1} value={end} onChange={(e) => setPh(parseInt(e.target.value))} style={{ flex: 1, minWidth: 100 }} />
          <span className="pmut" style={{ fontSize: 9, fontFamily: "var(--mfe-mono)" }}>{end + 1}/{n}</span>
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* overlay bands (fill) */}
        {overlays.filter((o) => o.band).map((o) => { const pts = view.map((_, j) => { const hiV = o.band!.hi[j + offset], loV = o.band!.lo[j + offset]; return hiV != null && loV != null ? { x: xFor(j), yh: yP(hiV), yl: yP(loV) } : null; }).filter(Boolean) as { x: number; yh: number; yl: number }[]; if (pts.length < 2) return null; const d = "M " + pts.map((p) => `${p.x.toFixed(1)} ${p.yh.toFixed(1)}`).join(" L ") + " L " + pts.slice().reverse().map((p) => `${p.x.toFixed(1)} ${p.yl.toFixed(1)}`).join(" L ") + " Z"; return <path key={o.id + "_b"} d={d} fill={o.color} opacity={0.1} />; })}
        {/* candles */}
        {view.map((b, j) => { const up = b.c >= b.o; const col = up ? "#2BB673" : "#F0524A"; const cx = xFor(j); const top = yP(Math.max(b.o, b.c)); const hgt = Math.max(Math.abs(yP(b.o) - yP(b.c)), 0.7); return <g key={j}><line x1={cx} y1={yP(b.h)} x2={cx} y2={yP(b.l)} stroke={col} strokeWidth="0.6" /><rect x={cx - bw / 2} y={top} width={bw} height={hgt} fill={col} /></g>; })}
        {/* overlay lines */}
        {overlays.map((o) => <path key={o.id} d={line(o.points)} fill="none" stroke={o.color} strokeWidth="1" opacity={0.9} />)}
        {/* markers */}
        {markers.filter((m) => m.i >= offset && m.i <= end).map((m, k) => { const j = m.i - offset; const cx = xFor(j), cy = yP(view[j].l) + 6; const col = m.color ?? (m.kind === "sell" ? "#F0524A" : m.kind === "buy" ? "#2BB673" : "#F4C542"); return <path key={k} d={`M ${cx} ${cy} l -3.5 5 l 7 0 z`} fill={col} stroke="#070D14" strokeWidth="0.5" />; })}
        {/* price axis */}
        {[lo + span * 0.5, lo + span * 0.9].map((p, k) => <text key={k} x={W - 3} y={yP(p) + 3} fill="#5b6b7d" fontSize="8" textAnchor="end">{p.toFixed(2)}</text>)}
        {/* oscillator lane */}
        {hasOsc && <>
          <line x1={0} y1={CY1 + 3} x2={W - MR} y2={CY1 + 3} stroke="#152230" strokeWidth="0.5" />
          <line x1={0} y1={oyZero} x2={W - MR} y2={oyZero} stroke="#38506a" strokeWidth="0.6" strokeDasharray="2 2" />
          <path d={oscPath} fill="none" stroke={oscillator!.color ?? "#79c0ff"} strokeWidth="1.1" />
          <text x={W - 3} y={OY0 + 8} fill="#5b6b7d" fontSize="8" textAnchor="end">{oscillator!.label ?? "signal"}</text>
          {/* ribbon strip */}
          {oscillator!.states && (() => { const st = oscillator!.states!; const segs: { x0: number; x1: number; s: RibbonState }[] = []; for (let j = 0; j < view.length; j++) { const s = st[j + offset] ?? "NEUTRAL"; const last = segs[segs.length - 1]; if (last && last.s === s) last.x1 = xFor(j) + slot / 2; else segs.push({ x0: xFor(j) - slot / 2, x1: xFor(j) + slot / 2, s }); } return segs.map((sg, k) => <rect key={k} x={Math.max(0, sg.x0)} y={OY1 + 2} width={Math.max(0.5, sg.x1 - sg.x0)} height={ribH - 2} fill={ST_COL[sg.s]} opacity={0.85} />); })()}
        </>}
      </svg>
    </div>
  );
}
