// CandleExplainer — the "see the candle" panel: a normal MULTI-candle chart with the CURRENT candle boxed +
// leader-line labels (Upper Wick · Close · Body · Lower Wick · Low + value & %), a MEASUREMENTS list, AND an
// adjustable mode — drag Range/ATR · Upper Wick% · Lower Wick% · direction and the candle (and every metric)
// reshape live, scaling with size. All causal/real by default; adjust = a synthetic what-if for learning.
import { useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { AnatomyPart } from "./CandleGlyph.tsx";
import { evalGraph, type FeatureGraph } from "../lib/blocks/featureGraph.ts";

// which measurement row a selected anatomy block maps to (so selecting "Upper Wick" lights its row).
const PART_ROW: Record<string, string> = { upper: "Upper Wick Ratio", lower: "Lower Wick Ratio", body: "Body Ratio", close: "Close Location", range: "Range / ATR" };
// which control a selected anatomy block may adjust — RESTRICTED so the user can only drag the part that block
// measures (Upper Wick → only the upper wick), the most intuitive. "all" = generic explainer (no block).
const CONTROL: Record<AnatomyPart, "upper" | "lower" | "body" | "range" | "all"> = { upper: "upper", lower: "lower", body: "body", close: "all", range: "range", typical: "range", gap: "range", direction: "range" };
const PART_VN: Record<string, string> = { upper: "upper wick", lower: "lower wick", body: "bar body", close: "close location", range: "bar range", typical: "typical price", gap: "opening gap", direction: "bar direction" };

function atr(bars: OhlcBar[], p = 14): number {
  if (bars.length < 2) return bars[0] ? bars[0].h - bars[0].l || 1 : 1;
  let a = bars[0].h - bars[0].l;
  for (let j = 1; j < bars.length; j++) { const tr = Math.max(bars[j].h - bars[j].l, Math.abs(bars[j].h - bars[j - 1].c), Math.abs(bars[j].l - bars[j - 1].c)); a = (a * (p - 1) + tr) / p; }
  return a || 1;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const inp: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "3px 7px", fontSize: 11 };

function Bar({ label, fill, disp, color, hi }: { label: string; fill: number; disp: string; color: string; hi?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, padding: "2.5px 4px", borderRadius: 5, background: hi ? color + "1f" : "transparent", boxShadow: hi ? `inset 0 0 0 1px ${color}88` : "none" }}>
      <span style={{ width: 96, color: hi ? color : "var(--mfe-text2)", fontWeight: hi ? 800 : 400 }}>{hi ? "◉ " : ""}{label}</span>
      <div style={{ flex: 1, height: 7, background: "var(--mfe-s3)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%", background: color }} /></div>
      <span style={{ width: 58, textAlign: "right", fontFamily: "var(--mfe-mono)", color }}>{disp}</span>
    </div>
  );
}

export function CandleExplainer({ bars, composite, compositeLabel = "Composite", highlightPart, editablePart, graph }: { bars: OhlcBar[]; composite?: number; compositeLabel?: string; highlightPart?: AnatomyPart; editablePart?: AnatomyPart; graph?: FeatureGraph }) {
  const hiRow = highlightPart ? PART_ROW[highlightPart] : "";
  const control = editablePart ? (CONTROL[editablePart] ?? "all") : "all";
  const atrv = useMemo(() => atr(bars), [bars]);
  const real = bars[bars.length - 1];
  // 3 states: real (the actual latest candle) → adjust (sliders + synthetic) → saved (synthetic shown, NO sliders).
  const [mode, setMode] = useState<"real" | "adjust" | "saved">("real");
  const [rangeAtr, setRangeAtr] = useState(1.4);
  const [uwPct, setUwPct] = useState(12);
  const [lwPct, setLwPct] = useState(40);
  const [up, setUp] = useState(true);
  const PRESET_KEY = "mfe_candle_preset";
  const adjusting = mode === "adjust", synthetic = mode !== "real";

  function startAdjust() {
    let pre: { rangeAtr: number; uwPct: number; lwPct: number; up: boolean } | null = null;
    try { const r = localStorage.getItem(PRESET_KEY); if (r) pre = JSON.parse(r); } catch { /* ignore */ }
    if (pre) { setRangeAtr(pre.rangeAtr); setUwPct(pre.uwPct); setLwPct(pre.lwPct); setUp(pre.up); }
    else if (real) { const r = real.h - real.l || 1; setRangeAtr(+(r / atrv).toFixed(2)); setUwPct(Math.round(((real.h - Math.max(real.o, real.c)) / r) * 100)); setLwPct(Math.round(((Math.min(real.o, real.c) - real.l) / r) * 100)); setUp(real.c >= real.o); }
    setMode("adjust");
  }
  // Save = persist the shape AND exit the slider mode, but KEEP showing the adjusted candle (mode "saved").
  function savePreset() { try { localStorage.setItem(PRESET_KEY, JSON.stringify({ rangeAtr, uwPct, lwPct, up })); } catch { /* ignore */ } setMode("saved"); }
  function setBody(bodyPct: number) { const other = Math.max(0, 100 - bodyPct), tot = uwPct + lwPct || 1; setUwPct(Math.round((other * uwPct) / tot)); setLwPct(Math.round((other * lwPct) / tot)); }
  const bodyPctCur = Math.max(0, 100 - Math.min(uwPct, 96) - Math.min(lwPct, 96));

  // the FOCUS candle: the real latest, or synthesized from the sliders (consistent geometry).
  const focus = useMemo<OhlcBar | null>(() => {
    if (!real) return null;
    if (!synthetic) return real;
    const R = rangeAtr * atrv, low = real.l, high = low + R;
    const uwE = Math.min(uwPct, 96), lwE = Math.min(lwPct, 96 - uwE);
    const top = high - (uwE / 100) * R, bot = low + (lwE / 100) * R;
    return { i: real.i, t: real.t, r: real.r, h: high, l: low, o: up ? bot : top, c: up ? top : bot };
  }, [real, synthetic, rangeAtr, uwPct, lwPct, up, atrv]);
  if (!focus) return <div className="pmut psm">Loading bars…</div>;

  const rng = focus.h - focus.l || 1e-9, body = Math.abs(focus.c - focus.o), uw = focus.h - Math.max(focus.o, focus.c), lw = Math.min(focus.o, focus.c) - focus.l;
  const m = { body, uw, lw, rng, bodyR: body / rng, uwR: uw / rng, lwR: lw / rng, clv: (focus.c - focus.l) / rng, rangeAtrV: rng / atrv };
  // run the ACTUAL feature on the focus candle (real history + this candle as the last bar) so adjusting the
  // candle moves the Feature output live. Falls back to the passed composite if no graph.
  const liveComposite = (() => { if (!graph || !bars.length) return composite; try { const s = evalGraph(graph, [...bars.slice(0, -1), focus]); return s.length ? s[s.length - 1] : composite; } catch { return composite; } })();

  // multi-candle display: last ~12 (the focus replaces the last when adjusting)
  const tail = bars.slice(-12);
  const disp = synthetic ? [...tail.slice(0, -1), focus] : tail;
  const W = 340, H = 176, padT = 14, padB = 16, cxL = 12, cxR = 196;
  const lo = Math.min(...disp.map((b) => b.l)), hi = Math.max(...disp.map((b) => b.h)), span = hi - lo || 1;
  const y = (p: number) => padT + ((hi - p) / span) * (H - padT - padB);
  const n = disp.length, cw = (cxR - cxL) / n, fx = cxL + (n - 1) * cw + cw / 2;
  const fbTop = y(Math.max(focus.o, focus.c)), fbBot = y(Math.min(focus.o, focus.c)), fUp = focus.c >= focus.o;
  const lead = (yy: number, text: string, c: string) => (<g><line x1={fx + cw / 2} y1={yy} x2={cxR + 16} y2={yy} stroke="#2c3a4a" strokeWidth={1} strokeDasharray="2 2" /><text x={cxR + 19} y={yy + 3} fontSize={9.5} fill={c}>{text}</text></g>);

  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* candle chart */}
      <div style={{ flex: "0 0 340px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}>Candle Explainer <span style={{ color: "var(--mfe-muted)" }}>({mode === "adjust" ? "editing" : mode === "saved" ? "edited" : "latest observed bar"})</span></span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
            {mode === "real" && <button onClick={startAdjust} style={{ ...inp, cursor: "pointer", color: "var(--mfe-text2)" }}><Glyph name="edit" size={11} /> Customize</button>}
            {mode === "adjust" && <button onClick={() => setMode("real")} style={{ ...inp, cursor: "pointer", color: TK.cyan, borderColor: "#1f5b8c" }}>Editing. Discard to restore the observed bar.</button>}
            {mode === "saved" && <>
              <span style={{ ...inp, color: TK.green, borderColor: "#1c5b3c" }}><Glyph name="check" size={10} /> edited illustration</span>
              <button onClick={() => setMode("adjust")} style={{ ...inp, cursor: "pointer", color: TK.cyan }}><Glyph name="edit" size={11} /> Continue editing</button>
              <button onClick={() => setMode("real")} style={{ ...inp, cursor: "pointer", color: "var(--mfe-text2)" }}>Restore observed bar</button>
            </>}
          </div>
        </div>
        <svg width={W} height={H} style={{ background: "var(--mfe-s2)", borderRadius: 8 }}>
          {disp.map((b, i) => { const u = b.c >= b.o, cx = cxL + i * cw + cw / 2, c = u ? "#2a6b4d" : "#7a3a44", bt = y(Math.max(b.o, b.c)), bb = y(Math.min(b.o, b.c)); return (
            <g key={i}><line x1={cx} y1={y(b.h)} x2={cx} y2={y(b.l)} stroke={i === n - 1 ? (fUp ? "#21d07a" : "#f7768e") : c} strokeWidth={i === n - 1 ? 1.4 : 0.9} /><rect x={cx - cw * 0.33} y={bt} width={Math.max(1.5, cw * 0.66)} height={Math.max(1, bb - bt)} fill={i === n - 1 ? (fUp ? "#21d07a55" : "#f7768e55") : c} stroke={i === n - 1 ? (fUp ? "#21d07a" : "#f7768e") : "none"} strokeWidth={1} /></g>
          ); })}
          {/* focus box */}
          <rect x={fx - cw / 2 - 2} y={y(focus.h) - 3} width={cw + 4} height={y(focus.l) - y(focus.h) + 6} fill="none" stroke={TK.cyan} strokeWidth={1.2} rx={3} />
          {/* leader labels */}
          {lead(y(focus.h), `High ${focus.h.toFixed(3)}`, "#cdd9e5")}
          {uw > 1e-6 && lead((y(focus.h) + fbTop) / 2, `Upper Wick ${uw.toFixed(3)} (${pct(m.uwR)})`, "#7aa2ff")}
          {lead(y(focus.c), `Close ${focus.c.toFixed(3)}`, fUp ? "#21d07a" : "#f7768e")}
          {lead((fbTop + fbBot) / 2 + 8, `Body ${body.toFixed(3)} (${pct(m.bodyR)})`, "#e3b341")}
          {lw > 1e-6 && lead((fbBot + y(focus.l)) / 2, `Lower Wick ${lw.toFixed(3)} (${pct(m.lwR)})`, "#c792ea")}
          {lead(y(focus.l), `Low ${focus.l.toFixed(3)}`, "#cdd9e5")}
        </svg>
        <div className="pmut psm" style={{ marginTop: 2 }}>Range <b style={{ color: "var(--mfe-text)" }}>{rng.toFixed(3)}</b> · Range/ATR <b style={{ color: m.rangeAtrV >= 1 ? TK.orange : "var(--mfe-text2)" }}>{m.rangeAtrV.toFixed(2)}</b></div>

        {/* adjust sliders */}
        {adjusting && (
          <div style={{ marginTop: 6, padding: "7px 9px", background: "var(--mfe-s2)", border: "1px solid #1f5b8c66", borderRadius: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 10, color: TK.cyan, fontWeight: 700 }}>{control === "all" ? "Drag to change the illustration. Its measurements update with the geometry." : `Edit only${PART_VN[editablePart!] ?? "this component"}measured by the selected block`}</div>
            <label style={{ fontSize: 10.5, color: "var(--mfe-text2)" }}>Range / ATR: <b style={{ color: TK.orange }}>{rangeAtr.toFixed(2)}</b><input type="range" min={0.2} max={3} step={0.05} value={rangeAtr} onChange={(e) => setRangeAtr(parseFloat(e.target.value))} style={{ width: "100%" }} /></label>
            {(control === "all" || control === "upper") && <label style={{ fontSize: 10.5, color: "var(--mfe-text2)" }}>Upper wick: <b style={{ color: "#7aa2ff" }}>{Math.min(uwPct, 96)}%</b><input type="range" min={0} max={90} step={1} value={uwPct} onChange={(e) => setUwPct(parseInt(e.target.value))} style={{ width: "100%" }} /></label>}
            {(control === "all" || control === "lower") && <label style={{ fontSize: 10.5, color: "var(--mfe-text2)" }}>Lower wick: <b style={{ color: "#c792ea" }}>{Math.min(lwPct, 96 - Math.min(uwPct, 96))}%</b><input type="range" min={0} max={90} step={1} value={lwPct} onChange={(e) => setLwPct(parseInt(e.target.value))} style={{ width: "100%" }} /></label>}
            {control === "body" && <label style={{ fontSize: 10.5, color: "var(--mfe-text2)" }}>Body: <b style={{ color: "#e3b341" }}>{bodyPctCur}%</b><input type="range" min={4} max={96} step={1} value={bodyPctCur} onChange={(e) => setBody(parseInt(e.target.value))} style={{ width: "100%" }} /></label>}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5 }}>
              <span style={{ color: "var(--mfe-text2)", marginRight: "auto" }}>Body: <b style={{ color: "#e3b341" }}>{pct(m.bodyR)}</b></span>
              <button onClick={() => setUp((u) => !u)} style={{ ...inp, cursor: "pointer", color: up ? "#21d07a" : "#f7768e" }}>{up ? "Up bar" : "Down bar"}</button>
              <button onClick={savePreset} style={{ ...inp, cursor: "pointer", color: "#fff", background: "#1f6feb", border: "none", fontWeight: 800 }}><Glyph name="save" size={11} /> Save</button>
            </div>
            <div className="pmut" style={{ fontSize: 9, fontStyle: "italic", marginTop: 2 }}><Glyph name="save" size={9} /> Save retains the edited illustration; it does not change source market data.{control === "all" ? "" : `(component${PART_VN[editablePart!] ?? ""})`}.</div>
          </div>
        )}
      </div>

      {/* measurements */}
      <div style={{ flex: "1 1 240px", minWidth: 232 }}>
        <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>Measurements <span style={{ color: "var(--mfe-muted)" }}>({mode === "adjust" ? "editing" : mode === "saved" ? "edited" : "latest observed bar"})</span></div>
        <Bar label="Body Ratio" fill={m.bodyR} disp={`${pct(m.bodyR)}  ${m.bodyR.toFixed(2)}`} color="#e3b341" hi={hiRow === "Body Ratio"} />
        <Bar label="Upper Wick Ratio" fill={m.uwR} disp={`${pct(m.uwR)}  ${m.uwR.toFixed(2)}`} color="#7aa2ff" hi={hiRow === "Upper Wick Ratio"} />
        <Bar label="Lower Wick Ratio" fill={m.lwR} disp={`${pct(m.lwR)}  ${m.lwR.toFixed(2)}`} color="#c792ea" hi={hiRow === "Lower Wick Ratio"} />
        <Bar label="Close Location" fill={m.clv} disp={`${pct(m.clv)}  ${m.clv.toFixed(2)}`} color="#5ad1c4" hi={hiRow === "Close Location"} />
        <Bar label="Range / ATR" fill={m.rangeAtrV / 3} disp={m.rangeAtrV.toFixed(2)} color="#ffb454" hi={hiRow === "Range / ATR"} />
        {liveComposite !== undefined && (
          <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid var(--mfe-border)" }}><Bar label={compositeLabel + (synthetic ? ", edited illustration" : "")} fill={liveComposite} disp={liveComposite.toFixed(2) + " / 1.00"} color="#37c0ff" hi={synthetic} /></div>
        )}
        {synthetic && <div className="pmut" style={{ fontSize: 9.5, marginTop: 6, fontStyle: "italic" }}>{mode === "saved" ? <><Glyph name="check" size={9} /> Showing a saved illustration. Continue editing or restore the observed bar.</> : "Synthetic geometry for learning candle measurements. It is not observed market data."}</div>}
      </div>
    </div>
  );
}
