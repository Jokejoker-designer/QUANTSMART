// FeatureTestChart — Microscope-style replay bench in the sandbox: ~1200 real M1 candles as the tape; the
// feature output is drawn DIRECTLY OVER the candles (translucent area + line, mapped to the panel height) so
// you see it run together with price. Two views: "120 nến" (a window you ▶ Play across the tape) and "Tổng
// quát" (the whole 1200 at once). Feature computed once on the full tape, causal (no-lookahead). L1 = measure.
import { useEffect, useMemo, useRef, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { BLOCKS_BY_ID } from "../lib/blocks/blockLibrary.ts";
import { evalGraph, validateGraph, type FeatureGraph } from "../lib/blocks/featureGraph.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

const fmt = (v: number) => (!isFinite(v) ? "—" : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
const WIN = 120;
const btn: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "3px 9px", fontSize: 12, cursor: "pointer" };

export function FeatureTestChart({ graph, threshold = 0.7 }: { graph: FeatureGraph; threshold?: number }) {
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [pos, setPos] = useState(WIN);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [view, setView] = useState<"window" | "overview">("window");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { let live = true; loadSimOhlc("M1", false).then((d) => { if (live && d?.bars?.length) { const b = d.bars.slice(-1200); setBars(b); setPos(Math.min(WIN, b.length - 1)); } }); return () => { live = false; }; }, []);

  const valid = useMemo(() => validateGraph(graph), [graph]);
  const series = useMemo(() => (bars.length && valid.ok ? evalGraph(graph, bars) : []), [graph, bars, valid.ok]);
  const n = bars.length;
  // when the feature STRUCTURE changes (blocks added/removed/rewired/output), reset the playhead + stop, so the
  // user re-runs cleanly on the new feature. Pure param tweaks keep the playhead (the overlay just updates live).
  const structKey = useMemo(() => graph.nodes.map((nd) => `${nd.id}:${nd.blockId}:${nd.inputs.join(",")}`).join("|") + "#" + graph.output, [graph]);
  useEffect(() => { setPlaying(false); setPos((p) => (bars.length ? Math.min(WIN, bars.length - 1) : p)); }, [structKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const outBlock = BLOCKS_BY_ID[graph.nodes.find((nd) => nd.id === graph.output)?.blockId ?? ""];
  const ratio = outBlock?.outputs[0].range === "[0,1]";

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!playing || !n || view !== "window") return;
    timer.current = setInterval(() => setPos((p) => { const np = p + speed; if (np >= n - 1) { setPlaying(false); return n - 1; } return np; }), 45);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, n, speed, view]);

  if (!bars.length) return <div className="pmut psm" style={{ padding: 20 }}>Loading historical M1 observations…</div>;
  if (!valid.ok) return <div className="psm" style={{ color: TK.orange, padding: 12 }}> Feature validation failed ({valid.errors[0]}). Fix the graph before retrying.</div>;

  const isOv = view === "overview";
  const start = isOv ? 0 : Math.max(0, pos - WIN + 1);
  const vis = isOv ? bars : bars.slice(start, pos + 1), vn = vis.length;
  const W = 1080, H = 300, top = 16, bot = 18;
  const lo = Math.min(...vis.map((b) => b.l)), hi = Math.max(...vis.map((b) => b.h)), pspan = hi - lo || 1;
  const yP = (p: number) => top + ((hi - p) / pspan) * (H - top - bot);
  const fAll = series.filter(isFinite), fLo = ratio ? 0 : (fAll.length ? Math.min(...fAll) : 0), fHi = ratio ? 1 : (fAll.length ? Math.max(...fAll) : 1), fspan = fHi - fLo || 1;
  const yF = (v: number) => (H - bot) - ((v - fLo) / fspan) * (H - top - bot);   // feature mapped to the SAME panel as candles
  const cw = W / Math.max(1, vn), x = (i: number) => i * cw + cw / 2;
  const sv = (i: number) => series[start + i];

  const pts = vis.map((_, i) => { const v = sv(i); return isFinite(v) ? `${x(i).toFixed(1)},${yF(v).toFixed(1)}` : ""; }).filter(Boolean);
  const fline = pts.join(" ");
  const farea = pts.length ? `${x(0).toFixed(1)},${H - bot} ${fline} ${x(vn - 1).toFixed(1)},${H - bot}` : "";
  const cur = series[pos] ?? 0;
  const revealed = series.slice(0, (isOv ? n : pos + 1)).filter(isFinite);
  const activePct = revealed.length ? (revealed.filter((v) => v > threshold).length / revealed.length) * 100 : 0;
  const tlabel = (bars[pos] as { t?: string }).t ? String((bars[pos] as { t?: string }).t).slice(0, 16).replace("T", " ") : `#${pos}`;

  return (
    <div>
      {/* view toggle + controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--mfe-border)", borderRadius: 6, overflow: "hidden" }}>
          {([["window", "120 bars"], ["overview", "Overview"]] as const).map(([v, l]) => <button key={v} onClick={() => { setView(v); setPlaying(false); }} style={{ ...btn, border: "none", borderRadius: 0, fontWeight: 700, background: view === v ? "rgba(37,183,255,.18)" : "transparent", color: view === v ? TK.cyan : "var(--mfe-text2)" }}>{l}</button>)}
        </div>
        {!isOv && <>
          <button style={btn} title={"Reset to start"} onClick={() => { setPlaying(false); setPos(Math.min(WIN, n - 1)); }}>⏮</button>
          <button style={btn} onClick={() => setPos((p) => Math.max(WIN - 1, p - speed))}>◀</button>
          <button style={{ ...btn, background: playing ? "#5a3a18" : "#1f6feb", color: "#fff", border: "none", fontWeight: 800, minWidth: 76 }} onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "▶ Play"}</button>
          <button style={btn} onClick={() => setPos((p) => Math.min(n - 1, p + speed))}>▶</button>
          <div style={{ display: "inline-flex", border: "1px solid var(--mfe-border)", borderRadius: 6, overflow: "hidden" }}>{[1, 2, 4].map((s) => <button key={s} onClick={() => setSpeed(s)} style={{ ...btn, border: "none", borderRadius: 0, padding: "3px 8px", background: speed === s ? "rgba(37,183,255,.18)" : "transparent", color: speed === s ? TK.cyan : "var(--mfe-text2)" }}>{s}×</button>)}</div>
          <input type="range" min={Math.min(WIN, n - 1)} max={n - 1} value={pos} onChange={(e) => { setPlaying(false); setPos(parseInt(e.target.value)); }} style={{ flex: 1, minWidth: 140 }} />
          <span className="pmut psm" style={{ fontFamily: "var(--mfe-mono)" }}>{pos + 1}/{n} · {tlabel}</span>
        </>}
        {isOv && <span className="pmut psm">All {n}  M1 bars in one view</span>}
      </div>
      {/* stats */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, marginBottom: 4 }}>
        {!isOv && <span className="pmut">Value at playhead <b style={{ color: TK.cyan }}>{fmt(cur)}</b></span>}
        {ratio && <span className="pmut">Above threshold ({threshold}) <b style={{ color: TK.orange }}>{activePct.toFixed(1)}%</b> {isOv ? "full tape" : "evaluated"}</span>}
        <span className="pmut">Feature output overlaid on price</span>
      </div>
      <div style={{ background: "#0b0f15", borderRadius: 8, border: "1px solid var(--mfe-border)" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {/* active shading */}
          {ratio && vis.map((_, i) => (sv(i) > threshold ? <rect key={i} x={x(i) - cw / 2} y={top} width={cw} height={H - top - bot} fill={TK.cyan} opacity={0.06} /> : null))}
          {/* feature area (behind candles) */}
          {farea && <polygon points={farea} fill="#37c0ff" opacity={0.10} />}
          {/* candles */}
          {vis.map((b, i) => { const u = b.c >= b.o, cx = x(i), c = u ? "#2a9d6b" : "#e06c75", bt = yP(Math.max(b.o, b.c)), bb = yP(Math.min(b.o, b.c)); return (
            <g key={i}><line x1={cx} y1={yP(b.h)} x2={cx} y2={yP(b.l)} stroke={c} strokeWidth={Math.min(1.3, Math.max(0.3, cw * 0.16))} /><rect x={cx - cw * 0.3} y={bt} width={Math.max(0.5, cw * 0.6)} height={Math.max(0.6, bb - bt)} fill={c} /></g>
          ); })}
          {/* threshold + feature line (on top) */}
          {ratio && <line x1={0} y1={yF(threshold)} x2={W} y2={yF(threshold)} stroke={TK.orange} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />}
          {fline && <polyline points={fline} fill="none" stroke="#37c0ff" strokeWidth={1.5} opacity={0.9} />}
          {!isOv && isFinite(cur) && <><line x1={x(vn - 1)} y1={top} x2={x(vn - 1)} y2={H - bot} stroke={TK.cyan} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} /><circle cx={x(vn - 1)} cy={yF(cur)} r={3.4} fill="#37c0ff" /></>}
          {/* feature scale hints */}
          <text x={4} y={top + 8} fontSize={9} fill={TK.muted}>feature {ratio ? fHi.toFixed(1) : fHi.toFixed(2)}</text>
          <text x={4} y={H - bot - 2} fontSize={9} fill={TK.muted}>{ratio ? fLo.toFixed(1) : fLo.toFixed(2)}</text>
        </svg>
      </div>
      <div className="pmut" style={{ fontSize: 9.5, marginTop: 3, fontStyle: "italic" }}>{isOv ? `Overview${n} observations with the feature overlaid` : `Observe${WIN} bars. Play advances through${n} bars`} Cyan: feature output. Orange: configured threshold. {threshold} Causal evaluation of completed bars.</div>
    </div>
  );
}
