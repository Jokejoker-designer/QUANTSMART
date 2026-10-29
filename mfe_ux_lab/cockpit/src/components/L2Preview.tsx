// L2Preview — the L2 Fusion-Context Builder (form-first, graph-backed). 3 columns: the weighted-fusion FORM,
// the chart + signature viz (Composite Oscillator · Regime Ribbons · Contribution Bars · TF Heatmap · Context
// Confidence gauge), and the Inspector & Contract (input/output contract · safety/compliance · validation).
// Tabs: Simple (form) · Compiled Graph (read-only DSL from the form) · Advanced (locked). CONTEXT only · no order.
import { useEffect, useMemo, useRef, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { availableL1, l1Series, weightedCompositeSigned, trendRegime, volRegime, biasContext, confidenceSeries, rollingZLast, percentileLast } from "../lib/blocks/l2Eval.ts";
import { ROLE_META, USAGE_ROLES, type FeatureUsageRole } from "../lib/blocks/featureRoles.ts";
import { loadCustomL2, saveCustomL2, type CustomL2Module, type L2Kind, type WeightSrc } from "../lib/blocks/customL2.ts";
import { compileL2, type L2OutputMode } from "../lib/blocks/l2Compile.ts";
import { RegimeRibbon } from "./RegimeRibbon.tsx";
import { ContributionBars } from "./ContributionBars.tsx";
import { STD_PRESET, STD_BY_KEY, OVERLAY_INDICATORS, OVERLAY_KEYS } from "../lib/blocks/stdIndicators.ts";
import { OverlayLayer } from "./OverlayLayer.tsx";
import { computeOverlay, newLine, lineRecipe, BASES, OPS, BANDS, BASE_LABEL, OP_LABEL, BAND_LABEL, type OverlayLineSpec, type LineBase, type LineOp, type BandRef } from "../lib/blocks/overlayGraph.ts";
import { EpisodeLens } from "./EpisodeLens.tsx";
import { StochLens } from "./StochLens.tsx";
import { TimeframeLens } from "./TimeframeLens.tsx";
import { computeEpisodes, EPISODE_META } from "../lib/blocks/chEpisode.ts";
import { buildLayerPack, parseAiIndicator } from "../lib/aiContextPack.ts";
import { l2ToFormulaLab } from "../formulaLab/adapters/tierToFormulaLab.ts";
import { setFormulaLabInput } from "../formulaLab/formulaLabStore.ts";
import { computeSignature } from "../lib/blocks/sandboxSignature.ts";
import { GaugeKit } from "./vizkit/VizKit.tsx";
import { LayerInfoPopup } from "./LayerInfoPopup.tsx";

const inp: React.CSSProperties = { background: "var(--bg-card-inner, #131E36)", border: "1px solid var(--border-panel, rgba(56,189,248,0.22))", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 7px", fontSize: 12 };
const W = 900, WIN = 120;
const TFS = ["M5", "M15", "H1", "H4", "D1"] as const;
const GROUP_OF: Record<FeatureUsageRole, string> = { BIAS_TREND: "Trend", REGIME_VOL: "Volatility", TIMING_TRIGGER: "Timing", CONFIRMATION_QUALITY: "Quality", RISK_DANGER: "Risk", FILTER_CONTEXT: "Context" };
const SELF_CAL_DEFAULT = new Set(["atr_percentile", "range_expansion_score"]);
const MODE_LABEL: Record<L2OutputMode, string> = { indicator: "Composite Indicator", regime: "Regime Context", bias: "Bias Context", confidence: "Context Confidence" };

function Gauge({ v, label }: { v: number; label: string }) {
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
const Pass = ({ k }: { k: string }) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, padding: "1px 0" }}><span style={{ color: "var(--mfe-text2)" }}><Glyph name="check" size={10} /> {k}</span><b style={{ color: "#3fb950" }}>PASS</b></div>;
const Row = ({ k, v, c }: { k: string; v: string; c?: string }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, padding: "1.5px 0" }}><span style={{ color: "var(--mfe-muted)" }}>· {k}</span><span style={{ color: c || "var(--mfe-text)", textAlign: "right" }}>{v}</span></div>;

export function L2Preview({ onClose, onSaved }: { onClose: () => void; onSaved?: (savedId?: string) => void }) {
  const avail = useMemo(availableL1, []);
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [tfBars, setTfBars] = useState<Record<string, OhlcBar[]>>({});
  const [tab, setTab] = useState<"simple" | "graph" | "advanced">("simple");
  const [presetNote, setPresetNote] = useState("");
  const [overlayKey, setOverlayKey] = useState("");
  const [stdParams, setStdParams] = useState<Record<string, number>>(() => Object.fromEntries((STD_BY_KEY["bollinger"].params || []).map((p) => [p.name, p.def])));
  const [ovName, setOvName] = useState("");
  const [savedOv, setSavedOv] = useState(false);
  const [ovSource, setOvSource] = useState<"recipe" | "scratch">("recipe");
  const [ovLines, setOvLines] = useState<OverlayLineSpec[]>([]);
  const [, setScratchOpen] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  const [lensWin, setLensWin] = useState(20);
  const [stochOn, setStochOn] = useState(false);
  const [stochK, setStochK] = useState(14);
  const [tfLensOn, setTfLensOn] = useState(false);
  const [name, setName] = useState("L2_CTX_REGVOL_01");
  const [desc, setDesc] = useState("Regime and volatility context from qualified L1 inputs.");
  const [mode, setMode] = useState<L2OutputMode>("regime");
  const [role, setRole] = useState<FeatureUsageRole>("REGIME_VOL");
  const [selected, setSelected] = useState<string[]>(() => avail.map((a) => a.key));
  const [weights, setWeights] = useState<Record<string, number>>(() => Object.fromEntries(avail.map((a) => [a.key, 1])));
  const [wsrc, setWsrc] = useState<Record<string, WeightSrc>>(() => Object.fromEntries(avail.map((a) => [a.key, SELF_CAL_DEFAULT.has(a.key) ? "SELF_CALIBRATING" : "USER_WEIGHTED"])));
  const [atIndex, setAtIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [view, setView] = useState<"window" | "overview">("window");
  const [pos, setPos] = useState(WIN);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { let live = true; loadSimOhlc("H1", false).then((d) => { if (live && d?.bars?.length) { const b = d.bars.slice(-1200); setBars(b); setPos(Math.min(WIN, b.length - 1)); } }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!playing || view !== "window" || !bars.length) return;
    timer.current = setInterval(() => setPos((p) => { const np = p + speed; if (np >= bars.length - 1) { setPlaying(false); return bars.length - 1; } return np; }), 55);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, view, speed, bars.length]);
  useEffect(() => { let live = true; (async () => { const r: Record<string, OhlcBar[]> = {}; for (const tf of TFS) { const d = await loadSimOhlc(tf, false); r[tf] = d?.bars?.slice(-300) ?? []; } if (live) setTfBars(r); })(); return () => { live = false; }; }, []);

  const featList = useMemo(() => avail.filter((a) => selected.includes(a.key)), [avail, selected]);
  const feats = useMemo(() => featList.map((a) => ({ key: a.key, label: a.label, color: a.color, series: l1Series(a.key, bars) })), [featList, bars]);
  const fused = useMemo(() => weightedCompositeSigned(feats, weights), [feats, weights]);
  const atrSeries = useMemo(() => l1Series("atr_percentile", bars), [bars]);
  const trend = useMemo(() => trendRegime(fused.composite), [fused]);
  const vol = useMemo(() => volRegime(atrSeries), [atrSeries]);
  const bias = useMemo(() => biasContext(fused.composite, -0.2, 0.2), [fused]);
  const conf = useMemo(() => confidenceSeries(fused.composite.map((v) => (v + 1) / 2)), [fused]);
  const compiled = useMemo(() => compileL2({ featureKeys: selected, featureLabels: Object.fromEntries(avail.map((a) => [a.key, a.label])), weights, mode }), [selected, weights, mode, avail]);
  const tfSeries = useMemo(() => TFS.map((tf) => { const b = tfBars[tf]; if (!b || b.length < 30) return { tf, fs: null as null | { key: string; label: string; color: string; series: number[] }[] }; return { tf, fs: selected.map((k) => ({ key: k, label: "", color: "", series: l1Series(k, b) })) }; }), [tfBars, selected]);
  const tfHeat = useMemo(() => tfSeries.map(({ tf, fs }) => { if (!fs) return { tf, val: NaN }; const c = weightedCompositeSigned(fs, weights).composite; return { tf, val: c.length ? c[c.length - 1] : NaN }; }), [tfSeries, weights]);
  const episodes = useMemo(() => computeEpisodes(bars, lensWin), [bars, lensWin]);

  const n = bars.length;
  const i = Math.max(0, Math.min(n - 1, view === "overview" ? (atIndex ?? n - 1) : pos));
  const totalW = selected.reduce((s, k) => s + (weights[k] ?? 0), 0);
  const compNow = fused.composite.length ? fused.composite[i] : 0;
  const l2Sig = useMemo(() => (fused.composite.length > 10 ? computeSignature(fused.composite, { warmup: 5, onLabel: "bullish" }) : null), [fused]);
  const confNow = conf.length ? conf[i] : 0;
  const zLast = rollingZLast(fused.composite), pctLast = percentileLast(fused.composite);

  const toggle = (k: string) => { setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k])); setSaved(false); };
  const setW = (k: string, w: number) => { setWeights((p) => ({ ...p, [k]: w })); setSaved(false); };
  function loadPreset(key: string) { const pr = STD_PRESET[key]; if (!pr) return; setName(pr.name); setMode(pr.mode); setRole(pr.role); setSelected(pr.featureKeys.filter((k) => avail.some((a) => a.key === k))); setWeights((w) => ({ ...w, ...pr.weights })); setPresetNote(pr.note); setSaved(false); if (OVERLAY_KEYS.includes(key)) pickOverlay(key); if (key === "ch_episode") setLensOn(true); if (key === "stoch_k") setStochOn(true); }
  function newModule() { setName(""); setDesc(""); setMode("regime"); setRole("REGIME_VOL"); setSelected(avail.map((a) => a.key)); setWeights(Object.fromEntries(avail.map((a) => [a.key, 1]))); setOverlayKey(""); setOvName(""); setOvLines([]); setOvSource("recipe"); setPresetNote(""); setSaved(false); setSavedOv(false); setTab("simple"); }
  const [aiOpen, setAiOpen] = useState(false); const [aiJson, setAiJson] = useState(""); const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null); const [aiCopied, setAiCopied] = useState(false);
  function copyL2Prompt() { try { navigator.clipboard?.writeText(buildLayerPack("L2")); } catch { /* clipboard blocked */ } setAiCopied(true); setTimeout(() => setAiCopied(false), 1600); }
  function importL2Ai() {
    const r = parseAiIndicator(aiJson);
    if (!r.ok || !r.module) { setAiMsg({ ok: false, text: "✗ " + (r.errors[0] || "Invalid JSON") }); return; }
    const m = r.module; const mode: L2OutputMode = (["indicator", "regime", "bias", "confidence"] as string[]).includes(m.kind) ? (m.kind as L2OutputMode) : "indicator";
    setName(m.name); setDesc(m.explain); setMode(mode); setSelected(m.featureKeys); setWeights((w) => ({ ...w, ...m.weights })); setTab("simple"); setSaved(false);
    setAiMsg({ ok: true, text: `Loaded ${m.featureKeys.length} features and weights. Inspect the preview.` + (r.warnings.length ? " ⚠ " + r.warnings.join("; ") : "") });
  }
  function pickOverlay(key: string) { const ind = STD_BY_KEY[key]; if (!ind) return; setOverlayKey(key); setStdParams(Object.fromEntries((ind.params || []).map((p) => [p.name, p.def]))); setOvName(ind.name); setOvSource("recipe"); setSavedOv(false); }
  function addLine() { setOvLines((ls) => [...ls, newLine(ls.length)]); setOvSource("scratch"); setScratchOpen(true); setSavedOv(false); }
  function patchLine(id: string, patch: Partial<OverlayLineSpec>) { setOvLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))); setOvSource("scratch"); setSavedOv(false); }
  function delLine(id: string) { setOvLines((ls) => ls.filter((l) => l.id !== id)); setSavedOv(false); }
  function saveOverlay(promoteAndClose = false) {
    if (ovName.trim().length < 2) return;
    let m: CustomL2Module;
    if (ovSource === "scratch") {
      if (!ovLines.length) return;
      const recipe = ovLines.map((l) => lineRecipe(l)).join(" · ");
      m = { id: "l2_" + Date.now().toString(36), name: ovName.trim(), explain: `L1 overlay (${ovLines.length} lines): ${recipe}`, kind: "overlay", featureKeys: [], weights: {}, primaryRole: role, overlayLines: ovLines, status: promoteAndClose ? "PROMOTED" : "SHADOW", createdAt: new Date().toISOString() };
    } else {
      const ind = STD_BY_KEY[overlayKey]; if (!ind) return;
      const cfg = (ind.params || []).map((p) => `${p.label}=${stdParams[p.name] ?? p.def}`).join(" · ");
      m = { id: "l2_" + Date.now().toString(36), name: ovName.trim(), explain: `${ind.name} — ${cfg}`, kind: "overlay", featureKeys: [], weights: {}, primaryRole: ind.role, overlayKey, overlayParams: { ...stdParams }, status: promoteAndClose ? "PROMOTED" : "SHADOW", createdAt: new Date().toISOString() };
    }
    saveCustomL2([m, ...loadCustomL2()]);
    setSavedOv(true);
    onSaved?.("myL2_" + m.id);
    if (promoteAndClose) onClose();
  }
  function save(promoteAndClose = false) {
    if (name.trim().length < 2 || !selected.length) return;
    const m: CustomL2Module = {
      id: "l2_" + Date.now().toString(36),
      name: name.trim(),
      explain: desc.trim() || `Weighted sum of ${selected.length} features → ${MODE_LABEL[mode]}`,
      kind: mode as L2Kind,
      featureKeys: selected,
      weights,
      weightSrc: wsrc,
      primaryRole: role,
      status: promoteAndClose ? "PROMOTED" : "SHADOW",
      createdAt: new Date().toISOString(),
    };
    saveCustomL2([m, ...loadCustomL2()]);
    setSaved(true);
    onSaved?.("myL2_" + m.id);
    if (promoteAndClose) onClose();
  }

  if (!bars.length) return <div style={{ position: "fixed", inset: 0, background: "var(--bg-app, #070B14)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", color: TK.muted }}>Loading bars…</div>;
  const start = view === "overview" ? 0 : Math.max(0, pos - WIN + 1), end = view === "overview" ? n : Math.min(n, pos + 1);
  const vis = bars.slice(start, end), visN = Math.max(1, vis.length), cw = W / visN, phk = i - start;
  const lo = Math.min(...vis.map((b) => b.l)), hi = Math.max(...vis.map((b) => b.h)), span = hi - lo || 1;
  const CH = 380, oscTop = CH - 72, oscBot = CH - 8;
  const yP = (p: number) => 8 + ((hi - p) / span) * (oscTop - 24);
  const yO = (v: number) => oscBot - ((Math.max(-1, Math.min(1, v)) + 1) / 2) * (oscBot - oscTop);
  const oline = fused.composite.slice(start, end).map((v, k) => `${(k * cw + cw / 2).toFixed(1)},${yO(v).toFixed(1)}`).join(" ");
  const sliceV = (rv: { code: number[]; bands: Record<number, { label: string; color: string }> }) => ({ code: rv.code.slice(start, end), bands: rv.bands });
  const tlabel = (bars[i] as { t?: string }).t ? String((bars[i] as { t?: string }).t).slice(0, 16).replace("T", " ") : `#${i}`;
  const canSave = name.trim().length >= 2 && selected.length > 0;
  const btn: React.CSSProperties = { ...inp, padding: "3px 9px", cursor: "pointer" };
  const recipeOv = overlayKey ? STD_BY_KEY[overlayKey]?.compute(vis, stdParams) : null;
  const scratchOv = ovLines.length ? computeOverlay(vis, ovLines) : null;
  const stdOv = ovSource === "scratch" ? scratchOv : recipeOv;
  const ovLabel = ovSource === "scratch" ? (ovLines.length ? `${ovLines.length} L1 lines` : "") : (overlayKey ? STD_BY_KEY[overlayKey]?.name ?? "" : "");

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-app, #070B14)", zIndex: 130, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", overflow: "hidden" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--border-panel, rgba(56,189,248,0.22))", paddingBottom: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: "#070B14", background: "#a78bfa", borderRadius: 4, padding: "2px 7px", letterSpacing: ".06em" }}>L2 STUDIO</span>
        <b style={{ color: "#e2e8f0", fontSize: 14 }}>L2 Fusion-Context & Indicator Builder</b>
        {[["SCOUT · INDICATOR", "#a78bfa"], ["CONTEXT ONLY", "#37c0ff"], ["NO-LOOKAHEAD", "#21d07a"]].map(([t, c]) => <span key={t as string} style={{ fontSize: 9.5, color: c as string, border: `1px solid ${c}66`, borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{t as string}</span>)}
        <div style={{ display: "inline-flex", marginLeft: 12, gap: 2 }}>
          {([["simple", "Simple Builder"], ["graph", "Compiled Graph"], ["advanced", "Advanced 🔒"]] as const).map(([t, l]) => <button key={t} onClick={() => t !== "advanced" && setTab(t)} style={{ ...inp, cursor: t === "advanced" ? "not-allowed" : "pointer", background: tab === t ? "rgba(37,183,255,.18)" : "transparent", color: tab === t ? TK.cyan : "var(--mfe-text2)", fontWeight: 700, opacity: t === "advanced" ? 0.5 : 1 }}>{l}</button>)}
        </div>
        <span className="pmut psm" style={{ marginLeft: "auto" }}>As-of (Closed) {tlabel}</span>
        <button onClick={() => setGuideOpen(true)} style={{ ...inp, cursor: "pointer", color: "#a78bfa", borderColor: "rgba(167,139,250,0.45)", background: "rgba(167,139,250,0.12)", fontWeight: 800, fontSize: 11 }}>ⓘ L2 Layer Guide</button>
        <button onClick={() => { if (!bars.length || selected.length < 1) return; const m = { id: "preview", name: name || "L2 indicator", explain: desc, kind: (["indicator", "regime", "bias", "confidence"].includes(mode) ? mode : "indicator") as CustomL2Module["kind"], featureKeys: selected, weights, status: "SHADOW" as const, createdAt: "" }; setFormulaLabInput(l2ToFormulaLab(m, bars)); onClose(); window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "formula-lab" })); }} disabled={!bars.length || !selected.length} style={{ ...inp, cursor: bars.length && selected.length ? "pointer" : "default", color: "#c792ea", borderColor: "#43306a" }}><Glyph name="ruler" size={12} /> Coordinate Lab </button>
        <button onClick={onClose} style={{ ...inp, cursor: "pointer" }}><Glyph name="x" size={12} /> Close</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "310px 1fr 330px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* ── LEFT: form ── */}
        <div style={{ overflowY: "auto", paddingRight: 4 }}>
          {tab === "simple" ? <>
            <Sec title={<><Glyph name="bar-chart" size={12} /> Load an editable reference configuration</>}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{Object.entries(STD_PRESET).map(([k, pr]) => <button key={k} onClick={() => loadPreset(k)} title={pr.note} style={{ ...inp, padding: "2px 8px", fontSize: 10.5, cursor: "pointer", color: "#5ad1c4", borderColor: "#1c5b54" }}>{pr.name.split(/[-(]/)[0].trim()}</button>)}</div>
              {presetNote && <div className="pmut" style={{ fontSize: 9.5, marginTop: 4, fontStyle: "italic", color: "#9fd0ff" }}><Glyph name="books" size={10} /> {presetNote} Adjust the weights before saving your definition.</div>}
            </Sec>
            <Sec title={<><Glyph name="robot" size={12} /> External specification export and JSON import</>}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <button onClick={copyL2Prompt} style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 700 }}>{aiCopied ? <><Glyph name="check" size={11} /> Copied</> : <><Glyph name="export" size={11} /> Copy L2 AI Prompt</>}</button>
                <button onClick={() => setAiOpen((o) => !o)} style={{ ...inp, cursor: "pointer", color: "#5aa9ff", borderColor: "#2f4a63" }}><Glyph name="import" size={12} /> Import AI {aiOpen ? "▾" : "▸"}</button>
              </div>
              {aiOpen && <>
                <textarea value={aiJson} onChange={(e) => { setAiJson(e.target.value); setAiMsg(null); }} placeholder={"Paste L2 JSON with name, explain, kind, featureKeys and weights."} spellCheck={false} style={{ ...inp, width: "100%", minHeight: 52, resize: "vertical", fontFamily: "var(--mfe-mono)", fontSize: 10.5, boxSizing: "border-box" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                  <button onClick={importL2Ai} disabled={!aiJson.trim()} style={{ ...inp, cursor: aiJson.trim() ? "pointer" : "default", background: aiJson.trim() ? "#238636" : "#20262d", color: aiJson.trim() ? "#fff" : "#5a636d", border: "none", fontWeight: 700 }}><Glyph name="import" size={12} /> Import definition</button>
                  {aiMsg && <span style={{ fontSize: 10.5, color: aiMsg.ok ? "#3fb950" : "#f85149" }}>{aiMsg.text}</span>}
                </div>
              </>}
            </Sec>
            <Sec title={"1. Module details"}>
              <label className="pmut psm">L2 module name<input style={{ ...inp, width: "100%" }} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></label>
              <label className="pmut psm" style={{ display: "block", marginTop: 5 }}>Output Mode<select style={{ ...inp, width: "100%" }} value={mode} onChange={(e) => { setMode(e.target.value as L2OutputMode); setSaved(false); }}>{(["indicator", "regime", "bias", "confidence"] as L2OutputMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select></label>
              <label className="pmut psm" style={{ display: "block", marginTop: 5 }}>Description<textarea style={{ ...inp, width: "100%", height: 38, resize: "vertical" }} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            </Sec>
            <Sec title="2. Role & output">
              <div style={{ display: "flex", gap: 6 }}>
                <label className="pmut psm" style={{ flex: 1 }}>Role (Primary)<select style={{ ...inp, width: "100%" }} value={role} onChange={(e) => setRole(e.target.value as FeatureUsageRole)}>{USAGE_ROLES.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}</select></label>
                <label className="pmut psm" style={{ flex: 1 }}>Output Type<input style={{ ...inp, width: "100%" }} value={MODE_LABEL[mode]} readOnly /></label>
              </div>
              <div className="pmut" style={{ fontSize: 9, marginTop: 4, fontStyle: "italic" }}>Weighted sum. Inputs are normalized before aggregation.</div>
            </Sec>
            <Sec title={`3. L1 features (${avail.length} available)`}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {avail.map((a) => { const on = selected.includes(a.key); return <button key={a.key} onClick={() => toggle(a.key)} style={{ ...inp, textAlign: "left", cursor: "pointer", borderColor: on ? a.color : "var(--border-panel)", opacity: on ? 1 : 0.55 }}><div style={{ fontSize: 11, fontWeight: 700, color: on ? a.color : "var(--mfe-text2)" }}>{on ? <><Glyph name="check" size={10} /> </> : "+ "}{a.label}</div><div className="pmut" style={{ fontSize: 8.5 }}>{a.role ? GROUP_OF[a.role] : "—"}</div></button>; })}
              </div>
            </Sec>
            <Sec title="4. Weighted-fusion builder">
              {featList.map((a) => { const c = fused.contributions.find((x) => x.key === a.key); const val = c && c.contrib.length ? c.contrib[i] : 0; const sc = wsrc[a.key] === "SELF_CALIBRATING"; return (
                <div key={a.key} style={{ borderTop: "1px solid #1c232c", padding: "4px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} /><b style={{ color: "#e7eef6" }}>{a.label}</b>
                    <span className="pmut" style={{ fontSize: 8.5 }}>{a.role ? GROUP_OF[a.role] : ""}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)", fontSize: 10.5, color: val >= 0 ? a.color : "#f7768e" }}>{val >= 0 ? "+" : ""}{val.toFixed(3)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <input type="range" min={0} max={2} step={0.05} value={weights[a.key] ?? 1} onChange={(e) => setW(a.key, parseFloat(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ fontFamily: "var(--mfe-mono)", fontSize: 10, width: 30 }}>{(weights[a.key] ?? 1).toFixed(2)}</span>
                    <button onClick={() => setWsrc((p) => ({ ...p, [a.key]: sc ? "USER_WEIGHTED" : "SELF_CALIBRATING" }))} title={"Change weight source"} style={{ fontSize: 8, color: sc ? "#a371f7" : "#58a6ff", border: `1px solid ${sc ? "#a371f7" : "#58a6ff"}55`, borderRadius: 3, padding: "0 3px", background: "transparent", cursor: "pointer" }}>{sc ? "SELF_CAL" : "USER_W"}</button>
                  </div>
                </div>
              ); })}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, marginTop: 5, paddingTop: 4, borderTop: "1px solid var(--border-panel)" }}><span className="pmut">Total weight</span><span style={{ fontFamily: "var(--mfe-mono)" }}>{totalW.toFixed(2)}</span></div>
            </Sec>
          </> : tab === "graph" ? <CompiledGraphView compiled={compiled} /> : <div className="pmut psm" style={{ padding: 12 }}><Glyph name="lock" size={11} /> Compiled graph is a read-only view of the current form.</div>}
        </div>

        {/* ── CENTER: chart + viz ── */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--border-panel)", borderRadius: 6, overflow: "hidden" }}>{([["window", "120 bars"], ["overview", "1,200 bars"]] as const).map(([v, l]) => <button key={v} onClick={() => { setView(v); setPlaying(false); }} style={{ ...btn, border: "none", borderRadius: 0, fontWeight: 700, background: view === v ? "rgba(37,183,255,.18)" : "transparent", color: view === v ? TK.cyan : "var(--mfe-text2)" }}>{l}</button>)}</div>
            {view === "window" ? <>
              <button style={btn} title={"Reset to start"} onClick={() => { setPlaying(false); setPos(Math.min(WIN, n - 1)); }}>⏮</button>
              <button style={btn} onClick={() => setPos((p) => Math.max(WIN - 1, p - speed))}>◀</button>
              <button style={{ ...btn, background: playing ? "#5a3a18" : "#1f6feb", color: "#fff", border: "none", fontWeight: 800, minWidth: 72 }} onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "▶ Play"}</button>
              <button style={btn} onClick={() => setPos((p) => Math.min(n - 1, p + speed))}>▶</button>
              <div style={{ display: "inline-flex", border: "1px solid var(--border-panel)", borderRadius: 6, overflow: "hidden" }}>{[1, 2, 4].map((s) => <button key={s} onClick={() => setSpeed(s)} style={{ ...btn, border: "none", borderRadius: 0, padding: "3px 7px", background: speed === s ? "rgba(37,183,255,.18)" : "transparent", color: speed === s ? TK.cyan : "var(--mfe-text2)" }}>{s}×</button>)}</div>
              <input type="range" min={Math.min(WIN, n - 1)} max={n - 1} value={pos} onChange={(e) => { setPlaying(false); setPos(parseInt(e.target.value)); }} style={{ flex: 1, minWidth: 120 }} />
            </> : <input type="range" min={0} max={n - 1} value={i} onChange={(e) => setAtIndex(parseInt(e.target.value))} style={{ flex: 1 }} />}
            <span className="pmut psm" style={{ fontFamily: "var(--mfe-mono)" }}>{i + 1}/{n} · {tlabel}</span>
          </div>
          <div style={{ background: "#0b0f15", borderRadius: 8, border: "1px solid var(--border-panel)", flexShrink: 0 }}>
            <svg width="100%" viewBox={`0 0 ${W} ${CH}`} preserveAspectRatio="none" style={{ display: "block", height: 460 }}>
              {lensOn
                ? vis.map((_, k) => { const st = episodes.state[start + k]; const c = st ? EPISODE_META[st].color : null; return c ? <rect key={"e" + k} x={k * cw - cw / 2} y={8} width={cw} height={oscTop - 30} fill={c} opacity={0.12} /> : null; })
                : view === "window" ? vis.map((_, k) => (fused.composite[start + k] > 0.2 ? <rect key={"s" + k} x={k * cw - cw / 2} y={8} width={cw} height={oscTop - 30} fill="#21d07a" opacity={0.05} /> : fused.composite[start + k] < -0.2 ? <rect key={"s" + k} x={k * cw - cw / 2} y={8} width={cw} height={oscTop - 30} fill="#f7768e" opacity={0.05} /> : null)) : null}
              {vis.map((b, k) => { const u = b.c >= b.o, cx = k * cw + cw / 2, c = u ? "#2a9d6b" : "#e06c75"; return <g key={k}><line x1={cx} y1={yP(b.h)} x2={cx} y2={yP(b.l)} stroke={c} strokeWidth={Math.min(1.2, Math.max(0.4, cw * 0.14))} /><rect x={cx - cw * 0.32} y={yP(Math.max(b.o, b.c))} width={Math.max(0.6, cw * 0.64)} height={Math.max(0.5, yP(Math.min(b.o, b.c)) - yP(Math.max(b.o, b.c)))} fill={c} /></g>; })}
              {stdOv && <OverlayLayer ov={stdOv} cw={cw} yP={yP} W={W} />}
              <line x1={0} y1={oscTop - 6} x2={W} y2={oscTop - 6} stroke="#1c2632" strokeWidth={1} />
              <text x={4} y={oscTop + 6} fontSize={9} fill={TK.muted}>composite oscillator (L2)  {compNow >= 0 ? "+" : ""}{compNow.toFixed(3)}{ovLabel ? ` · overlay: ${ovLabel}` : ""}</text>
              <line x1={0} y1={yO(0)} x2={W} y2={yO(0)} stroke="#3a4452" strokeWidth={0.7} strokeDasharray="3 3" />
              <polyline points={oline} fill="none" stroke="#37c0ff" strokeWidth={1.4} />
              <line x1={phk * cw + cw / 2} y1={8} x2={phk * cw + cw / 2} y2={CH - 4} stroke="#fff" strokeWidth={0.8} opacity={0.5} />
            </svg>
          </div>
          <div style={{ margin: "6px 0 2px", fontSize: 9.5, color: TK.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>Regime Ribbon (L2 Context) · {view === "window" ? `window ${visN} bars` : `${n} bars`}</div>
          <RegimeRibbon view={sliceV(trend)} label="Trend Regime" atIndex={phk} W={W} />
          <RegimeRibbon view={sliceV(vol)} label="Vol Regime" atIndex={phk} W={W} />
          <RegimeRibbon view={sliceV(bias)} label="Bias Context" atIndex={phk} W={W} />
          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <div className="pc" style={{ margin: 0, flex: "1 1 300px", background: "var(--bg-panel, #0F172A)" }}><ContributionBars contributions={fused.contributions} composite={fused.composite} atIndex={i} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "0 0 200px" }}>
              <div className="pc" style={{ margin: 0, background: "var(--bg-panel, #0F172A)" }}><div className="pmut psm" style={{ marginBottom: 3 }}>TF Agreement</div><div style={{ display: "flex", gap: 3 }}>{tfHeat.map((t) => { const ok = isFinite(t.val), c = !ok ? "#2a2f38" : t.val >= 0 ? "#1f6f4a" : "#7a3a44"; return <div key={t.tf} style={{ flex: 1, textAlign: "center", background: c, borderRadius: 4, padding: "4px 1px" }}><div style={{ fontSize: 8.5, color: "var(--mfe-muted)" }}>{t.tf}</div><div style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "#e7eef6" }}>{ok ? (t.val >= 0 ? "+" : "") + t.val.toFixed(2) : "—"}</div></div>; })}</div></div>
              <div className="pc" style={{ margin: 0, background: "var(--bg-panel, #0F172A)", display: "flex", alignItems: "center", gap: 6 }}><Gauge v={confNow} label={confNow >= 0.66 ? "High" : confNow >= 0.33 ? "Medium" : "Low"} /><div><div className="pmut psm">Context Confidence</div><div className="pmut" style={{ fontSize: 8.5 }}>≠ win probability</div></div></div>
              <div className="pc" style={{ margin: 0, background: "var(--bg-panel, #0F172A)" }}><div className="pmut psm">Composite Score</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: compNow >= 0 ? "#37c0ff" : "#f7768e" }}>{compNow >= 0 ? "+" : ""}{compNow.toFixed(3)}</div><div className="pmut" style={{ fontSize: 9.5 }}>Z (roll 250) {zLast >= 0 ? "+" : ""}{zLast.toFixed(2)} · Pct {Math.round(pctLast * 100)}%</div></div>
              {l2Sig && <div className="pc" style={{ margin: 0, background: "var(--bg-panel, #0F172A)", display: "flex", alignItems: "center", gap: 6 }}><GaugeKit pct={l2Sig.gauge.onPct} band={l2Sig.gauge.band} label="bullish" /><div><div className="pmut psm">Signature (kit)</div><div className="pmut" style={{ fontSize: 8.5 }}>% of bars with composite above zero <Glyph name="warning" size={9} /> degenerate near 100% or 0%</div></div></div>}
            </div>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setLensOn((v) => !v)} style={{ ...btn, fontWeight: 700, color: lensOn ? "#9fd0ff" : "var(--mfe-text2)", borderColor: lensOn ? "#37c0ff" : "var(--border-panel)" }}><Glyph name="microscope" size={12} /> CH Episode Lens {lensOn ? "Hide" : "Show"}</button>
            <button onClick={() => setStochOn((v) => !v)} style={{ ...btn, fontWeight: 700, color: stochOn ? "#9fd0ff" : "var(--mfe-text2)", borderColor: stochOn ? "#37c0ff" : "var(--border-panel)" }}><Glyph name="trend-up" size={12} /> Stochastic %K {stochOn ? "Hide" : "Show"}</button>
            <button onClick={() => setTfLensOn((v) => !v)} style={{ ...btn, fontWeight: 700, color: tfLensOn ? "#9fd0ff" : "var(--mfe-text2)", borderColor: tfLensOn ? "#37c0ff" : "var(--border-panel)" }}><Glyph name="compass" size={12} /> Timeframe Lens {tfLensOn ? "Hide" : "Show"}</button>
          </div>
          {lensOn && <EpisodeLens ep={episodes} i={i} start={start} end={end} window={lensWin} onWindow={setLensWin} W={W} />}
          {stochOn && <StochLens bars={bars} i={i} start={start} end={end} kPeriod={stochK} onK={setStochK} W={W} />}
          {tfLensOn && <TimeframeLens tf={tfHeat} W={W} />}
          <div className="pmut" style={{ fontSize: 9, marginTop: 6, fontStyle: "italic" }}>{view === "window" ? `Observe ${WIN} bars. Play advances through ${n} H1 bars; the background shows configured context bands.` : `All ${n} H1 bars in the same view.`} Causal calculations; no future observations.</div>
        </div>

        {/* ── RIGHT: inspector & contract ── */}
        <div style={{ overflowY: "auto" }}>
          <div className="pc" style={{ margin: "0 0 8px", background: "var(--bg-panel, #0F172A)", border: "1px solid rgba(167,139,250,0.4)", borderLeft: "3px solid #a78bfa" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <b style={{ fontSize: 12, color: "#a78bfa" }}>Save & Wire L2 Indicator</b>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "#38bdf8", border: "1px solid rgba(56,189,248,0.35)", borderRadius: 4, padding: "1px 6px" }}>SCOUT · ATK 50 · DEF 60</span>
            </div>
            <button
              disabled={!canSave}
              onClick={() => save(true)}
              style={{
                ...inp,
                width: "100%",
                cursor: canSave ? "pointer" : "not-allowed",
                background: canSave ? "linear-gradient(135deg, #0284c7, #2563eb)" : "var(--mfe-s3)",
                color: canSave ? "#fff" : "var(--mfe-muted)",
                border: canSave ? "1px solid #38bdf8" : "none",
                fontWeight: 800,
                padding: "8px 10px",
              }}
            >
              <Glyph name="check" size={12} /> Save, Qualify for L3/L4/L5 & Attach to L2
            </button>
            <button
              disabled={!canSave}
              onClick={() => save(false)}
              style={{
                ...inp,
                width: "100%",
                marginTop: 5,
                cursor: canSave ? "pointer" : "not-allowed",
                background: saved ? "#1c5b3c" : "rgba(30,41,59,0.8)",
                color: canSave || saved ? "#cbd5e1" : "var(--mfe-muted)",
                border: "1px solid var(--border-panel)",
                fontWeight: 700,
                padding: "6px 10px",
              }}
            >
              {saved ? <><Glyph name="check" size={12} /> L2 Saved as Shadow</> : <><Glyph name="save" size={12} /> Save Shadow & Stay in Builder</>}
            </button>
            <button onClick={newModule} title={"Create another L2 definition"} style={{ ...inp, width: "100%", marginTop: 5, cursor: "pointer", color: "#5ad1c4", borderColor: "#1c5b54" }}>+ Reset / New L2 Module</button>
          </div>

          <div className="pc" style={{ margin: 0, background: "var(--bg-panel, #0F172A)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 13, color: "#e7eef6" }}>{name}</b><span style={{ marginLeft: "auto", fontSize: 9, color: "#a371f7", border: "1px solid #a371f755", borderRadius: 4, padding: "0 5px" }}>L2 CONTEXT</span></div>
            <Row k="Layer" v="L2 (Indicator / Context)" />
            <Row k="Role" v={ROLE_META[role].label} c="#e7eef6" />
            <Row k="Authority" v={"Context output only"} c={TK.orange} />
            <Sec title="Input contract"><Row k={"Primary input"} v="Promoted L1 Features" /><Row k="Higher TF Feature" v="As-of (Closed)" /><Row k="Raw Ref" v={"Minimum requirement"} /><Row k="Lookahead" v={"Not permitted"} c="#f7768e" /></Sec>
            <Sec title="Output contract"><Row k="Output Type" v={MODE_LABEL[mode]} /><Row k={"Scope"} v="[-1,+1] normalized" /><Row k="Consumer" v="L3+ Decision/Gating/Sizing" /><Row k={"Not intended for"} v="Entry / Zone / Order" c="#f7768e" /></Sec>
            <Sec title="Safety & compliance"><Pass k="KIDI Safe" /><Pass k="NaN / Inf Guard" /><Pass k="No-Lookahead Seal" /><Pass k="AsOf Valid (Closed Only)" /><Pass k="Closed-Bar Only" /></Sec>
            <Sec title="Validation & integrity"><Pass k="Input Contract Check" /><Pass k="Feature Integrity" /><Pass k="Weight Schema Check" /><Pass k="Output Range & Stability" /><Pass k="Backtest Leakage Scan" /></Sec>
            <div className="pmut" style={{ fontSize: 9, marginTop: 6, fontStyle: "italic" }}>L2 emits context. Downstream use and combined performance require separate validation.</div>
          </div>

          {tab === "simple" && (
            <div className="pc" style={{ margin: "8px 0 0", background: "var(--bg-panel, #0F172A)", borderTop: "2px solid #15786e" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <b style={{ fontSize: 12, color: "#5ad1c4" }}><Glyph name="ruler" size={12} /> Price overlay</b>
                {(overlayKey || ovLines.length > 0) && <button onClick={() => { setOverlayKey(""); setOvLines([]); setSavedOv(false); }} title={"Hide chart overlay"} style={{ marginLeft: "auto", ...inp, padding: "1px 6px", fontSize: 9.5, cursor: "pointer", color: "#f7768e", borderColor: "#7a3a44" }}><Glyph name="x" size={10} /> off</button>}
              </div>
              <div style={{ display: "inline-flex", marginTop: 6, border: "1px solid var(--border-panel)", borderRadius: 6, overflow: "hidden" }}>
                {([["recipe", "Configuration preset"], ["scratch", "Build from L1 inputs"]] as const).map(([s, l]) => <button key={s} onClick={() => setOvSource(s)} style={{ ...inp, border: "none", borderRadius: 0, fontSize: 10, fontWeight: 700, cursor: "pointer", background: ovSource === s ? "rgba(90,209,196,.18)" : "transparent", color: ovSource === s ? "#5ad1c4" : "var(--mfe-text2)" }}>{l}</button>)}
              </div>

              {ovSource === "recipe" ? <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{OVERLAY_INDICATORS.map((x) => <button key={x.key} onClick={() => pickOverlay(x.key)} title={x.context} style={{ ...inp, padding: "2px 7px", fontSize: 10, cursor: "pointer", background: overlayKey === x.key ? "rgba(90,209,196,.18)" : "transparent", color: "#5ad1c4", borderColor: overlayKey === x.key ? "#5ad1c4" : "#1c5b54" }}>{x.name.split(" ")[0]}</button>)}</div>
                {overlayKey ? <div style={{ marginTop: 6 }}>
                  {(STD_BY_KEY[overlayKey]?.params || []).map((p) => (
                    <div key={p.name} style={{ padding: "3px 0", borderTop: "1px solid #1c232c" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}><span style={{ color: "#e7eef6" }}>{p.label}</span><span style={{ fontFamily: "var(--mfe-mono)", fontSize: 10, color: "#5ad1c4" }}>{stdParams[p.name] ?? p.def}</span></div>
                      <input type="range" min={p.min} max={p.max} step={p.step ?? 1} value={stdParams[p.name] ?? p.def} onChange={(e) => { setStdParams((s) => ({ ...s, [p.name]: parseFloat(e.target.value) })); setSavedOv(false); }} style={{ width: "100%" }} />
                    </div>
                  ))}
                  <div className="pmut" style={{ fontSize: 9, marginTop: 3, lineHeight: 1.5 }}><Glyph name="wall" size={9} /> {STD_BY_KEY[overlayKey]?.buildFrom}</div>
                </div> : <div className="pmut psm" style={{ marginTop: 6, fontStyle: "italic" }}>Choose a preset, inspect its parameters and chart output, then save.</div>}
              </> : <>
                <div className="pmut psm" style={{ marginTop: 6, fontStyle: "italic" }}>Each line combines a source, window transform and optional standard-deviation or ATR bands.</div>
                {ovLines.map((l) => (
                  <div key={l.id} style={{ border: "1px solid #1c232c", borderRadius: 6, padding: 6, marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <input type="color" value={l.color} onChange={(e) => patchLine(l.id, { color: e.target.value })} style={{ width: 20, height: 20, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                      <input value={l.name} onChange={(e) => patchLine(l.id, { name: e.target.value })} style={{ ...inp, flex: 1, padding: "2px 5px", fontSize: 10.5 }} />
                      <button onClick={() => delLine(l.id)} style={{ ...inp, padding: "1px 6px", fontSize: 10, cursor: "pointer", color: "#f7768e", borderColor: "#7a3a44" }}><Glyph name="x" size={10} /></button>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      <select value={l.base} onChange={(e) => patchLine(l.id, { base: e.target.value as LineBase })} style={{ ...inp, flex: 1, padding: "2px 4px", fontSize: 10 }}>{BASES.map((b) => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}</select>
                      <select value={l.op} onChange={(e) => patchLine(l.id, { op: e.target.value as LineOp })} style={{ ...inp, flex: 1, padding: "2px 4px", fontSize: 10 }}>{OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select>
                      <input type="number" min={1} max={300} value={l.period} disabled={l.op === "raw"} onChange={(e) => patchLine(l.id, { period: parseInt(e.target.value) || 1 })} style={{ ...inp, width: 46, padding: "2px 4px", fontSize: 10, opacity: l.op === "raw" ? 0.4 : 1 }} />
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
                      <select value={l.band} onChange={(e) => patchLine(l.id, { band: e.target.value as BandRef })} style={{ ...inp, flex: 1, padding: "2px 4px", fontSize: 10 }}>{BANDS.map((b) => <option key={b} value={b}>{BAND_LABEL[b]}</option>)}</select>
                      {l.band !== "none" && <><input type="number" min={1} max={200} value={l.bandN} onChange={(e) => patchLine(l.id, { bandN: parseInt(e.target.value) || 1 })} title={"Std/ATR period"} style={{ ...inp, width: 42, padding: "2px 4px", fontSize: 10 }} /><span className="pmut" style={{ fontSize: 9 }}>×</span><input type="number" min={0.5} max={5} step={0.1} value={l.bandMult} onChange={(e) => patchLine(l.id, { bandMult: parseFloat(e.target.value) || 1 })} title={"coefficient"} style={{ ...inp, width: 42, padding: "2px 4px", fontSize: 10 }} /></>}
                    </div>
                    <div className="pmut" style={{ fontSize: 9, marginTop: 4, fontFamily: "var(--mfe-mono)", color: l.color }}><Glyph name="wall" size={9} /> {lineRecipe(l)}</div>
                  </div>
                ))}
                <button onClick={addLine} style={{ ...inp, width: "100%", marginTop: 6, cursor: "pointer", color: "#5ad1c4", borderColor: "#1c5b54", fontWeight: 700 }}>Add L1 line</button>
              </>}

              <label className="pmut psm" style={{ display: "block", marginTop: 8 }}>Overlay name<input style={{ ...inp, width: "100%" }} value={ovName} onChange={(e) => { setOvName(e.target.value); setSavedOv(false); }} /></label>
              {(() => { const blocked = ovName.trim().length < 2 || (ovSource === "scratch" && !ovLines.length) || (ovSource === "recipe" && !overlayKey); return (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button onClick={() => saveOverlay(true)} disabled={blocked} style={{ ...inp, flex: 1, cursor: blocked ? "not-allowed" : "pointer", background: "#15786e", color: "#fff", border: "none", fontWeight: 800, padding: 7, opacity: blocked ? 0.5 : 1 }}><Glyph name="check" size={12} /> Save Overlay & Attach to L2</button>
                  <button onClick={() => saveOverlay(false)} disabled={blocked} style={{ ...inp, cursor: blocked ? "not-allowed" : "pointer", background: savedOv ? "#1c5b3c" : "rgba(30,41,59,0.8)", color: "#fff", border: "1px solid var(--border-panel)", fontWeight: 700, padding: "7px 10px", opacity: blocked ? 0.5 : 1 }}>{savedOv ? "Saved" : "Save Only"}</button>
                </div>
              ); })()}
              <div className="pmut" style={{ fontSize: 9, marginTop: 5, fontStyle: "italic" }}>Overlays draw reference lines and bands, not entries or orders.</div>
            </div>
          )}
        </div>
      </div>
      {guideOpen && <LayerInfoPopup initialLevel={2} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function Sec({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return <div style={{ marginTop: 8 }}><div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--mfe-muted)", fontWeight: 700, marginBottom: 3 }}>{title}</div>{children}</div>;
}

function CompiledGraphView({ compiled }: { compiled: ReturnType<typeof compileL2> }) {
  return (
    <div>
      <div className="pmut psm" style={{ marginBottom: 6 }}>The compiled graph represents the current L2 definition.</div>
      {compiled.nodes.map((nd) => (
        <div key={nd.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 7px", margin: "3px 0", background: "var(--bg-card-inner, #131E36)", border: "1px solid #a371f7", borderRadius: 4 }}>
          <b style={{ fontSize: 11, color: "#e7eef6" }}>{nd.label}</b>
          <span className="pmut" style={{ fontSize: 9 }}>{nd.blockId}</span>
          {nd.inputs.length > 0 && <span className="pmut" style={{ fontSize: 8.5, marginLeft: "auto" }}>← {nd.inputs.join(", ")}</span>}
        </div>
      ))}
      <div style={{ marginTop: 8, fontSize: 10, color: "var(--mfe-text2)" }}>
        <div>Output: <b>{compiled.outputType}</b> ({compiled.outBlockId})</div>
        <div className="pmut" style={{ marginTop: 3 }}>authority: advisory · no entry/zone/order · safety: closed-bar · no-lookahead · KIDI</div>
      </div>
    </div>
  );
}
