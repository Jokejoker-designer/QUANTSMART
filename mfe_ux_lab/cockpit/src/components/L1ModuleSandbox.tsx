// L1ModuleSandbox — the visual L1 FEATURE builder. Start from a template (or blank), drop primitive blocks,
// wire them (type-checked — bad connections are blocked), watch a LIVE preview on real recent bars, and save
// SHADOW. L1 emits a MEASUREMENT only (number/[0,1]); no order path. Opens when a user creates a module at L1.
import { useEffect, useMemo, useRef, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { FeatureFlowCanvas } from "./FeatureFlowCanvas.tsx";
import { CandleExplainer } from "./CandleExplainer.tsx";
import { BlockGallery } from "./BlockGallery.tsx";
import { ANATOMY_PART } from "./CandleGlyph.tsx";
import { BlockPlayground } from "./BlockPlayground.tsx";
import { BlockInspector } from "./BlockInspector.tsx";
import { FeatureTestChart } from "./FeatureTestChart.tsx";
import { explainFeature } from "../lib/blocks/featureExplain.ts";
import { BLOCKS_BY_ID, blocksByGroup } from "../lib/blocks/blockLibrary.ts";
import { L1_GROUPS, canConnect, numericArity, type L1Group, type L1PrimitiveBlockSpec } from "../lib/blocks/blockTypes.ts";
import { validateGraph, evalGraphAll, type FeatureGraph, type FeatureNode } from "../lib/blocks/featureGraph.ts";
import { FEATURE_TEMPLATES, BASE_FEATURES, vizLayer, type FeatureTemplate } from "../lib/blocks/featureTemplates.ts";
import { loadCustomL1, saveCustomL1, setL1Status, updateCustomL1, validateL1Draft, type CustomL1Module } from "../lib/blocks/customL1.ts";
import { buildLayerPack, parseAiFeature } from "../lib/aiContextPack.ts";
import { l1ToFormulaLab } from "../formulaLab/adapters/tierToFormulaLab.ts";
import { setFormulaLabInput } from "../formulaLab/formulaLabStore.ts";
import { computeSignature } from "../lib/blocks/sandboxSignature.ts";
import { GaugeKit } from "./vizkit/VizKit.tsx";
import { ROLE_META, ROLE_STATUS_META, USAGE_ROLES, suggestRoles, bumpRoleStatus, roleStatusOf, type FeatureUsageRole, type FeatureRoleProfile } from "../lib/blocks/featureRoles.ts";
import { runRoleGate, type RoleGateResult } from "../lib/blocks/roleGate.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { LayerInfoPopup } from "./LayerInfoPopup.tsx";

const GROUP_META: Record<L1Group, { label: string; color: string }> = {
  SOURCE: { label: "Source", color: "#7aa2ff" },
  CANDLE_ANATOMY: { label: "Candle anatomy", color: "#5ad1c4" },
  ROLLING_WINDOW: { label: "Rolling window", color: "#9d8bff" },
  NORMALIZE: { label: "Normalization", color: "#ffb454" },
  SMOOTH_LAG_MOMENTUM: { label: "Smoothing, lag and momentum", color: "#6fb3ff" },
  MATH: { label: "Math", color: "#8b98a8" },
  LOGIC_CONNECTOR: { label: "Logic", color: "#f78c6c" },
  FSM_STATE: { label: "State machine", color: "#c792ea" },
  SAFETY_OUTPUT: { label: "Safety and outputs", color: "#21d07a" },
};
const inp: React.CSSProperties = { background: "var(--bg-card-inner)", border: "1px solid var(--border-panel)", color: "#F8FAFC", borderRadius: 6, padding: "4px 7px", fontSize: 12 };
const clone = (g: FeatureGraph): FeatureGraph => JSON.parse(JSON.stringify(g));
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toFixed(4));

function nextId(blockId: string, nodes: FeatureNode[]): string {
  let k = 1; while (nodes.some((n) => n.id === `${blockId}_${k}`)) k++;
  return `${blockId}_${k}`;
}

// SVG sparkline — normalizes to the series' own range (or [0,1] for ratio/bool) so any block draws sensibly.
function Spark({ series, color = TK.cyan, ratio }: { series: number[]; color?: string; ratio?: boolean }) {
  const s = series.filter(isFinite);
  if (!s.length) return <div className="pmut psm">—</div>;
  const lo = ratio ? 0 : Math.min(...s), hi = ratio ? 1 : Math.max(...s), span = hi - lo || 1;
  const W = 280, H = 46, n = s.length;
  const pts = s.map((v, i) => `${(i / (n - 1 || 1)) * W},${H - ((v - lo) / span) * H}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", background: "var(--bg-app)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

export function L1ModuleSandbox({ onClose, onSaved }: { onClose: () => void; onSaved?: (m: CustomL1Module) => void }) {
  const [graph, setGraph] = useState<FeatureGraph>(() => clone(FEATURE_TEMPLATES[0].graph));
  const [sel, setSel] = useState<string>(FEATURE_TEMPLATES[0].graph.output);
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [name, setName] = useState(FEATURE_TEMPLATES[0].title);
  const [explain, setExplain] = useState(FEATURE_TEMPLATES[0].graph.description || "Causal block-composed candle measurement");
  const [why, setWhy] = useState(FEATURE_TEMPLATES[0].subtitle || "Provides a normalized causal measurement for downstream L2/L3/L4/L5 layers.");
  const [layerTab, setLayerTab] = useState<"RAW" | "NORMALIZED" | "FSM">("RAW");
  const [paletteGroup, setPaletteGroup] = useState<L1Group>("CANDLE_ANATOMY");
  const [view, setView] = useState<"flow" | "list">("flow");
  const [showGallery, setShowGallery] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [savedId, setSavedId] = useState("");
  const [qualified, setQualified] = useState(false);
  const [roleProfile, setRoleProfile] = useState<FeatureRoleProfile>(() => suggestRoles(FEATURE_TEMPLATES[0].graph));
  const [gateBusy, setGateBusy] = useState(false);
  const [gateResults, setGateResults] = useState<RoleGateResult[]>([]);
  const family = useRef<string>("SINGLE_CANDLE");
  const [aiOpen, setAiOpen] = useState(false); const [aiJson, setAiJson] = useState(""); const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null); const [aiCopied, setAiCopied] = useState(false);

  useEffect(() => { let live = true; loadSimOhlc("M15", false).then((d) => { if (live && d?.bars?.length) setBars(d.bars.slice(-160)); }); return () => { live = false; }; }, []);

  // keyboard: select a node + press Delete/Backspace to remove it (ignored while typing in a field or gallery open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showGallery) return;
      const t = (document.activeElement?.tagName || "").toUpperCase();
      if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); removeNode(sel); setSel(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, showGallery]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = useMemo(() => validateGraph(graph), [graph]);
  const allSeries = useMemo(() => (bars.length ? evalGraphAll(graph, bars) : {}), [graph, bars]);
  const outSeries = allSeries[graph.output] ?? [];
  const outVal = outSeries.length ? outSeries[outSeries.length - 1] : 0;
  const kitSig = useMemo(() => { const fin = outSeries.filter(isFinite); if (fin.length < 6) return null; const m = fin.reduce((a, b) => a + b, 0) / fin.length; return computeSignature(outSeries.map((v) => (isFinite(v) ? v - m : NaN)), { warmup: 5, onLabel: "above mean" }); }, [outSeries]);
  const latest = useMemo(() => { const o: Record<string, number> = {}; for (const id in allSeries) { const s = allSeries[id]; o[id] = s.length ? s[s.length - 1] : 0; } return o; }, [allSeries]);
  const draft = useMemo(() => validateL1Draft({ name, explain, why, graph }), [name, explain, why, graph]);
  const layers = useMemo(() => vizLayer(graph), [graph]);
  const mechanism = useMemo(() => explainFeature(graph), [graph]);

  function patch(mut: (g: FeatureGraph) => void) { setGraph((g0) => { const g = clone(g0); mut(g); return g; }); }
  function startFrom(t: FeatureTemplate) {
    setGraph(clone(t.graph));
    setSel(t.graph.output);
    setName(t.title);
    setExplain(t.graph.description || t.subtitle || "Causal block-composed candle measurement");
    setWhy(t.subtitle && t.subtitle.length >= 12 ? t.subtitle : "Provides a normalized causal measurement for downstream L2/L3/L4/L5 layers.");
    family.current = t.family;
    setRoleProfile(suggestRoles(t.graph));
    setSavedId("");
    setQualified(false);
  }
  function startBlank() {
    const g: FeatureGraph = { id: "custom_" + Date.now().toString(36), name: "New module", nodes: [{ id: "out_1", blockId: "emit_feature", inputs: [null] }], output: "out_1" };
    setGraph(g); setSel("out_1"); setName(""); setExplain(""); setWhy(""); family.current = "CUSTOM"; setRoleProfile(suggestRoles(g)); setSavedId(""); setQualified(false);
  }
  function copyL1Prompt() { try { navigator.clipboard?.writeText(buildLayerPack("L1")); } catch { /* clipboard blocked */ } setAiCopied(true); setTimeout(() => setAiCopied(false), 1600); }
  function importL1Ai() {
    const r = parseAiFeature(aiJson);
    if (!r.ok || !r.module) { setAiMsg({ ok: false, text: "✗ " + (r.errors[0] || "Invalid JSON") }); return; }
    const g = r.module.graph;
    setGraph(g); setSel(g.output); setName(r.module.name); setExplain(r.module.explain); setWhy(r.module.why); family.current = "CUSTOM"; setRoleProfile(suggestRoles(g)); setSavedId(""); setQualified(false);
    setAiMsg({ ok: true, text: `Built ${g.nodes.length} blocks in sandbox — inspect graph and preview.` + (r.warnings.length ? " ⚠ " + r.warnings.join("; ") : "") });
  }
  function addBlock(b: L1PrimitiveBlockSpec) { patch((g) => { const id = nextId(b.blockId, g.nodes); g.nodes.push({ id, blockId: b.blockId, inputs: Array(numericArity(b)).fill(null), params: Object.fromEntries(b.parameters.map((p) => [p.name, p.defaultValue])) }); setSel(id); }); }
  function removeNode(id: string) { patch((g) => { g.nodes = g.nodes.filter((n) => n.id !== id).map((n) => ({ ...n, inputs: n.inputs.map((u) => (u === id ? null : u)) })); if (g.output === id) g.output = g.nodes.find((n) => BLOCKS_BY_ID[n.blockId]?.authority.canEmitFeature)?.id || g.nodes[g.nodes.length - 1]?.id || ""; }); }
  const setWire = (nid: string, k: number, up: string) => patch((g) => { const n = g.nodes.find((x) => x.id === nid); if (n) n.inputs[k] = up || null; });
  const setParam = (nid: string, key: string, val: number) => patch((g) => { const n = g.nodes.find((x) => x.id === nid); if (n) n.params = { ...n.params, [key]: val }; });
  const setParams = (nid: string, params: Record<string, number>) => patch((g) => { const n = g.nodes.find((x) => x.id === nid); if (n) n.params = params; });
  const moveNode = (id: string, x: number, y: number) => patch((g) => { const n = g.nodes.find((nn) => nn.id === id); if (n) { n.x = Math.max(0, Math.round(x)); n.y = Math.max(0, Math.round(y)); } });
  const createAt = (blockId: string, x: number, y: number) => { const b = BLOCKS_BY_ID[blockId]; if (!b) return; patch((g) => { const id = nextId(blockId, g.nodes); g.nodes.push({ id, blockId, inputs: Array(numericArity(b)).fill(null), params: Object.fromEntries(b.parameters.map((p) => [p.name, p.defaultValue])), x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) }); setSel(id); }); };
  const autoLayoutNow = () => patch((g) => { for (const n of g.nodes) { delete n.x; delete n.y; } });

  function save(promoteImmediate = false, closeAfter = false) {
    if (!draft.ok) return;
    const id = "l1_" + Date.now().toString(36);
    const bumped = promoteImmediate ? bumpRoleStatus(roleProfile, "SHADOW_QUALIFIED", "Qualified in L1 Sandbox for downstream L2/L3/L4/L5 consumption.") : roleProfile;
    const m: CustomL1Module = {
      id,
      name: name.trim(),
      explain: explain.trim(),
      why: why.trim(),
      graph: { ...graph, name: name.trim() },
      status: promoteImmediate ? "PROMOTED" : "SHADOW",
      createdAt: new Date().toISOString(),
      family: family.current,
      roles: bumped,
    };
    saveCustomL1([m, ...loadCustomL1()]);
    setSavedId(id);
    setQualified(promoteImmediate);
    if (promoteImmediate) setRoleProfile(bumped);
    onSaved?.(m);
    if (closeAfter) onClose();
  }

  function qualify() {
    if (!savedId) return;
    const bumped = bumpRoleStatus(roleProfile, "SHADOW_QUALIFIED", "Passed sandbox checks. Role-specific OOS qualification is separate.");
    setL1Status(savedId, "PROMOTED");
    updateCustomL1(savedId, { roles: bumped });
    setRoleProfile(bumped);
    setQualified(true);
    const updated = loadCustomL1().find((x) => x.id === savedId);
    if (updated) onSaved?.(updated);
  }

  async function runGate() {
    if (!savedId) return; setGateBusy(true); setGateResults([]);
    try {
      const d = await loadSimOhlc("M1", false); const b = d?.bars?.slice(-1100) ?? [];
      if (b.length < 200) { setGateResults([]); return; }
      const roles = [roleProfile.primaryRole, ...roleProfile.secondaryRoles];
      const results = roles.map((r) => runRoleGate(graph, r, b));
      setGateResults(results);
      const evidence = roleProfile.evidence.map((e) => { const res = results.find((r) => r.role === e.role); return res ? { ...e, status: res.verdict, gateName: res.metricName, sampleSize: res.sampleSize, oosStatus: res.verdict, notes: [...e.notes, ...res.notes] } : e; });
      const np = { ...roleProfile, evidence }; setRoleProfile(np); updateCustomL1(savedId, { roles: np });
    } finally { setGateBusy(false); }
  }
  const setPrimary = (r: FeatureUsageRole) => setRoleProfile((p) => ({ primaryRole: r, secondaryRoles: p.secondaryRoles.filter((s) => s !== r), evidence: [r, ...p.secondaryRoles.filter((s) => s !== r)].map((role) => p.evidence.find((e) => e.role === role) ?? { role, status: "DECLARED" as const, notes: ["user-declared"] }) }));
  const toggleSecondary = (r: FeatureUsageRole) => setRoleProfile((p) => { if (r === p.primaryRole) return p; const has = p.secondaryRoles.includes(r); const secondaryRoles = has ? p.secondaryRoles.filter((s) => s !== r) : [...p.secondaryRoles, r]; return { ...p, secondaryRoles, evidence: [p.primaryRole, ...secondaryRoles].map((role) => p.evidence.find((e) => e.role === role) ?? { role, status: "DECLARED" as const, notes: ["user-declared"] }) }; });

  const selNode = graph.nodes.find((n) => n.id === sel);
  const selBlock = selNode ? BLOCKS_BY_ID[selNode.blockId] : undefined;
  const isRatio = (b?: L1PrimitiveBlockSpec) => b?.outputs[0].range === "[0,1]";

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-app)", zIndex: 120, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflowY: "auto" }}>
        <div className="pc-h" style={{ color: "#79c0ff", borderColor: "var(--border-panel)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-panel)", padding: "8px 12px", borderRadius: 8, marginBottom: 8 }}>
          <span style={{ background: "rgba(121,192,255,.18)", border: "1px solid #79c0ff", color: "#79c0ff", fontWeight: 900, fontSize: 11, padding: "2px 7px", borderRadius: 4 }}>L1 STUDIO</span>
          <b style={{ fontSize: 14, color: "#F8FAFC" }}><Glyph name="puzzle" size={13} /> L1 Feature Block Sandbox</b>
          <span className="mut">Compose a causal measurement from primitive blocks · Feeds L2 Indicators, L3 Quant AST, and L4/L5 Rules</span>
          <span className="co-tag" style={{ marginLeft: 8, border: "1px solid " + TK.orange, color: TK.orange }}>SCOUT / MEASUREMENT · NO ORDER</span>
          <button onClick={() => setGuideOpen(true)} style={{ ...inp, marginLeft: "auto", cursor: "pointer", color: "#38BDF8", borderColor: "rgba(56,189,248,0.45)", background: "rgba(56,189,248,0.12)", fontWeight: 800, fontSize: 11 }}>ⓘ L1 Layer Guide</button>
          <button onClick={() => { if (!bars.length) return; setFormulaLabInput(l1ToFormulaLab({ id: "preview", name: name || "L1 feature", graph }, bars)); onClose(); window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "formula-lab" })); }} disabled={!bars.length} style={{ ...inp, cursor: bars.length ? "pointer" : "default", color: "#c792ea", borderColor: "#43306a", fontWeight: 700 }}><Glyph name="ruler" size={12} /> Coordinate Lab</button>
          <button onClick={onClose} style={{ ...inp, cursor: "pointer", fontWeight: 800, borderColor: "rgba(248,113,113,.45)", color: "#FCA5A5" }}><Glyph name="x" size={12} /> Close</button>
        </div>

        {/* templates + customise built-in */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "0 0 5px", background: "var(--bg-panel)", padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-panel)" }}>
          <span className="pmut psm" style={{ fontWeight: 800, color: "#79c0ff" }}>Templates:</span>
          {FEATURE_TEMPLATES.map((t) => <button key={t.key} onClick={() => startFrom(t)} style={{ ...inp, cursor: "pointer", fontWeight: 700, borderColor: name === t.title ? "#79c0ff" : "var(--border-panel)" }} title={t.subtitle}>{t.family === "FSM" ? "◆" : t.family === "ROLLING_WINDOW" ? "▦" : "▮"} {t.title}</button>)}
          <button onClick={startBlank} style={{ ...inp, cursor: "pointer", color: TK.muted }}>+ Blank Graph</button>
          <span style={{ width: 1, height: 18, background: "var(--border-subtle)", margin: "0 4px" }} />
          <span className="pmut psm" style={{ fontWeight: 800, color: "#bcacff" }}>Built-in L1:</span>
          {BASE_FEATURES.map((t) => <button key={t.key} onClick={() => startFrom(t)} style={{ ...inp, cursor: "pointer", fontWeight: 700, borderColor: "#9d8bff66", color: "#bcacff" }} title={t.subtitle}><Glyph name="edit" size={11} /> {t.title}</button>)}
          <button onClick={() => setAiOpen((o) => !o)} style={{ ...inp, cursor: "pointer", color: "#5aa9ff", borderColor: "#2f4a63", marginLeft: "auto", fontWeight: 700 }}><Glyph name="robot" size={12} /> AI JSON {aiOpen ? "▾" : "▸"}</button>
        </div>

        {aiOpen && (
          <div style={{ border: "1px solid #2f4a63", borderRadius: 7, background: "rgba(31,111,235,.08)", padding: 8, margin: "0 0 8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <button onClick={copyL1Prompt} style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 700 }}>{aiCopied ? <><Glyph name="check" size={11} /> Copied</> : <><Glyph name="export" size={11} /> Copy L1 AI Prompt</>}</button>
              <span className="pmut psm">Use the specification with your external assistant, then import the returned FeatureGraph for inspection.</span>
            </div>
            <textarea value={aiJson} onChange={(e) => { setAiJson(e.target.value); setAiMsg(null); }} placeholder={"Paste FeatureGraph JSON with name, explain, why, nodes and output."} spellCheck={false} style={{ ...inp, width: "100%", minHeight: 56, resize: "vertical", fontFamily: "var(--mfe-mono)", fontSize: 11, boxSizing: "border-box" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <button onClick={importL1Ai} disabled={!aiJson.trim()} style={{ ...inp, cursor: aiJson.trim() ? "pointer" : "default", background: aiJson.trim() ? "#238636" : "#20262d", color: aiJson.trim() ? "#fff" : "#5a636d", border: "none", fontWeight: 700 }}><Glyph name="import" size={12} /> Import graph</button>
              {aiMsg && <span style={{ fontSize: 11, color: aiMsg.ok ? "#3fb950" : "#f85149" }}>{aiMsg.text}</span>}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "250px 1fr 350px", gridTemplateRows: "minmax(0,1fr)", gap: 10, height: "62vh", minHeight: 420, flexShrink: 0 }}>
          {/* ── palette ── */}
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 8, minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".4px", color: "#38BDF8" }}>Primitive Block Palette</div>
              <button onClick={() => setShowGallery(true)} title={"Open evaluated block previews"} style={{ ...inp, marginLeft: "auto", padding: "2px 7px", fontSize: 10, cursor: "pointer", color: "#9fd0ff", borderColor: "#1f5b8c" }}><Glyph name="books" size={12} /> Gallery</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 7 }}>
              {L1_GROUPS.map((g) => <button key={g} onClick={() => setPaletteGroup(g)} title={GROUP_META[g].label} style={{ ...inp, padding: "2px 6px", fontSize: 10, cursor: "pointer", borderColor: paletteGroup === g ? GROUP_META[g].color : "var(--border-subtle)", color: paletteGroup === g ? GROUP_META[g].color : "#94A3B8", fontWeight: paletteGroup === g ? 800 : 500 }}>{GROUP_META[g].label}</button>)}
            </div>
            <div className="pmut" style={{ fontSize: 9.5, marginBottom: 5 }}>Click to add, or <b>drag onto the graph</b></div>
            {blocksByGroup(paletteGroup).map((b) => (
              <button key={b.blockId} draggable onDragStart={(e) => e.dataTransfer.setData("l1block", b.blockId)} onClick={() => addBlock(b)} title={b.description} style={{ ...inp, display: "block", width: "100%", textAlign: "left", marginBottom: 4, cursor: "grab", border: "1px solid " + GROUP_META[b.group].color + "88" }}>
                <span style={{ fontWeight: 700, color: "#F8FAFC" }}>+ {b.label}</span>
                {b.provisional && <span style={{ color: TK.orange, fontSize: 9, marginLeft: 5 }}><Glyph name="warning" size={9} /> provisional</span>}
                <span className="pmut" style={{ display: "block", fontSize: 9.5 }}>{b.inputs.filter((p) => p.type !== "STREAM_OHLC").length || 0} input → {b.outputs[0].type}{b.outputs[0].scaleFree ? " · scale-free" : ""}</span>
              </button>
            ))}
          </div>

          {/* ── graph (flow canvas + node list with type-checked wiring) ── */}
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 8, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexShrink: 0 }}>
              <div style={{ display: "inline-flex", border: "1px solid var(--border-panel)", borderRadius: 6, overflow: "hidden" }}>
                {(["flow", "list"] as const).map((vw) => <button key={vw} onClick={() => setView(vw)} style={{ ...inp, border: "none", borderRadius: 0, cursor: "pointer", background: view === vw ? "rgba(37,183,255,.18)" : "transparent", color: view === vw ? TK.cyan : "#94A3B8", fontWeight: 700 }}>{vw === "flow" ? "Graph Flow" : "Node List"}</button>)}
              </div>
              <div className="pmut psm">{graph.nodes.length} nodes · {view === "flow" ? "Select a node to inspect; Delete removes it." : "Edit port connections directly."}</div>
              <span className="pmut psm" style={{ marginLeft: "auto" }}>Output:</span>
              <select style={{ ...inp }} value={graph.output} onChange={(e) => patch((g) => { g.output = e.target.value; })}>
                {graph.nodes.filter((n) => BLOCKS_BY_ID[n.blockId]?.authority.canEmitFeature).map((n) => <option key={n.id} value={n.id}>{BLOCKS_BY_ID[n.blockId]?.label} ({n.id})</option>)}
              </select>
            </div>
            {view === "flow" ? <FeatureFlowCanvas graph={graph} sel={sel} onSel={setSel} latest={latest} onMove={moveNode} onConnect={setWire} onCreate={createAt} onAutoLayout={autoLayoutNow} /> : (
            <div style={{ minHeight: 0, overflowY: "auto" }}>
            {graph.nodes.map((n) => {
              const b = BLOCKS_BY_ID[n.blockId]; if (!b) return null;
              const ports = b.inputs.filter((p) => p.type !== "STREAM_OHLC");
              const v = allSeries[n.id]?.length ? allSeries[n.id][allSeries[n.id].length - 1] : undefined;
              const isOut = graph.output === n.id;
              return (
                <div key={n.id} onClick={() => setSel(n.id)} style={{ border: `1px solid ${sel === n.id ? GROUP_META[b.group].color : "var(--border-panel)"}`, borderRadius: 5, padding: "6px 8px", marginBottom: 6, background: sel === n.id ? "rgba(31,91,140,.18)" : "var(--bg-card-inner)", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 12.5 }}>{b.label}</span>
                    <span className="pmut" style={{ fontSize: 9.5 }}>{n.id} · {b.outputs[0].type}</span>
                    {isOut && <span style={{ fontSize: 9.5, color: TK.green, fontWeight: 800 }}> OUTPUT</span>}
                    {v !== undefined && <span style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)", fontSize: 11, color: TK.cyan }}>{fmt(v)}</span>}
                    <button onClick={(e) => { e.stopPropagation(); removeNode(n.id); }} style={{ ...inp, padding: "1px 6px", color: TK.red, cursor: "pointer" }}><Glyph name="x" size={11} /></button>
                  </div>
                  {ports.map((port, k) => {
                    const opts = graph.nodes.filter((o) => o.id !== n.id && BLOCKS_BY_ID[o.blockId] && canConnect(BLOCKS_BY_ID[o.blockId].outputs[0].type, port));
                    const bad = n.inputs[k] && !opts.some((o) => o.id === n.inputs[k]);
                    return (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                        <span className="pmut psm" style={{ minWidth: 64 }}>{port.name} <span style={{ fontSize: 8.5 }}>({port.type})</span></span>
                        <select style={{ ...inp, flex: 1, borderColor: bad ? TK.red : !n.inputs[k] && port.required ? TK.orange : "var(--border-panel)" }} value={n.inputs[k] ?? ""} onChange={(e) => setWire(n.id, k, e.target.value)} onClick={(e) => e.stopPropagation()}>
                          <option value="">Not connected</option>
                          {opts.map((o) => <option key={o.id} value={o.id}>{BLOCKS_BY_ID[o.blockId]?.label} ({o.id})</option>)}
                        </select>
                      </div>
                    );
                  })}
                  {b.inputs.some((p) => p.type === "STREAM_OHLC") && <div className="pmut" style={{ fontSize: 9, marginTop: 3 }}>Reads completed OHLC bars directly</div>}
                  {b.parameters.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }} onClick={(e) => e.stopPropagation()}>{b.parameters.map((p) => <label key={p.name} style={{ fontSize: 10, color: "#CBD5E1" }}>{p.label || p.name} <input type="number" step={p.step} min={p.min} max={p.max} value={n.params?.[p.name] ?? p.defaultValue} onChange={(e) => setParam(n.id, p.name, parseFloat(e.target.value))} style={{ ...inp, width: 62, padding: "2px 5px" }} /></label>)}</div>}
                  {b.provisional && <div style={{ fontSize: 9, color: TK.orange, marginTop: 3 }}><Glyph name="warning" size={9} /> {b.note}</div>}
                </div>
              );
            })}
            </div>)}
          </div>

          {/* ── preview + validation + save ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflowY: "auto" }}>
            {/* Save & Attach Form Placed at Top of Inspector for Instant Workflow */}
            <div className="pc" style={{ margin: 0, background: "var(--bg-panel)", borderColor: draft.ok ? "rgba(52,211,153,.45)" : "var(--border-panel)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#79c0ff", letterSpacing: ".4px" }}>SAVE &amp; WIRE L1 FEATURE</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#22D3EE", background: "rgba(34,211,238,.14)", border: "1px solid rgba(34,211,238,.4)", borderRadius: 4, padding: "1px 6px" }}>SCOUT · ATK 52 / DEF 56</span>
              </div>
              <label style={{ display: "block", marginBottom: 5 }}><div className="pmut psm">Feature name</div><input style={{ ...inp, width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. wick_rejection_strength" /></label>
              <label style={{ display: "block", marginBottom: 5 }}><div className="pmut psm">What it measures (≥12 chars)</div><input style={{ ...inp, width: "100%" }} value={explain} onChange={(e) => setExplain(e.target.value)} /></label>
              <label style={{ display: "block", marginBottom: 6 }}><div className="pmut psm">Rationale (≥12 chars)</div><input style={{ ...inp, width: "100%" }} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
              {!draft.ok && draft.errors.slice(0, 3).map((e, i) => <div key={i} className="psm" style={{ color: TK.orange }}><Glyph name="warning" size={10} /> {e}</div>)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                <button
                  disabled={!draft.ok}
                  onClick={() => save(true, true)}
                  style={{ ...inp, width: "100%", cursor: draft.ok ? "pointer" : "not-allowed", background: draft.ok ? "linear-gradient(90deg, #0284C7 0%, #22D3EE 100%)" : "var(--bg-card-inner)", color: draft.ok ? "#040D1A" : "#64748B", border: draft.ok ? "1px solid #38BDF8" : "1px solid var(--border-subtle)", fontWeight: 900, padding: "8px 10px" }}
                ><Glyph name="check" size={12} /> Save, Qualify for L2/L3 &amp; Attach to L1</button>
                <button
                  disabled={!draft.ok}
                  onClick={() => save(false, false)}
                  style={{ ...inp, width: "100%", cursor: draft.ok ? "pointer" : "not-allowed", background: draft.ok ? "rgba(56,189,248,.14)" : "var(--bg-card-inner)", color: draft.ok ? "#79c0ff" : "#64748B", borderColor: draft.ok ? "rgba(56,189,248,.45)" : "var(--border-subtle)", fontWeight: 800, padding: "6px 10px" }}
                >Save Shadow &amp; Stay to Test (1,200 M1 Bars)</button>
              </div>
              {savedId && (
                <div style={{ marginTop: 6, padding: "5px 8px", borderRadius: 5, background: "rgba(16,185,129,.14)", border: "1px solid rgba(16,185,129,.4)", color: "#34D399", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>✓ Attached to Lane L1 ({qualified ? "PROMOTED for L2/L3" : "SHADOW"})</span>
                  {!qualified && <button onClick={qualify} style={{ background: "#10B981", color: "#04130D", border: "none", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Promote for L2 ✓</button>}
                </div>
              )}
            </div>

            {/* output */}
            <div className="pc" style={{ margin: 0, background: "var(--bg-panel)", borderColor: "var(--border-panel)" }}>
              <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase" }}>Feature output at latest bar</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: TK.cyan, lineHeight: 1.1 }}>{fmt(outVal)}</div>
              <Spark series={outSeries} color="#37c0ff" ratio={isRatio(BLOCKS_BY_ID[graph.nodes.find((n) => n.id === graph.output)?.blockId ?? ""])} />
              <div className="pmut psm" style={{ marginTop: 2 }}>{bars.length ? `${bars.length} recent completed M15 bars` : "Loading bars…"}</div>
              {kitSig && kitSig.stats.finiteN > 5 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 6, flexWrap: "wrap" }}>
                  <GaugeKit pct={kitSig.gauge.onPct} band={kitSig.gauge.band} label={"above mean"} />
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div className="pmut psm" style={{ marginBottom: 3 }}><Glyph name="sliders" size={11} /> Feature signature relative to mean</div>
                    <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", border: "1px solid #1b2a39" }}>{kitSig.ribbon.slice(-120).map((sg, k) => <div key={k} style={{ flex: sg.i1 - sg.i0 + 1, background: sg.state === "ON" ? "#2BB673" : sg.state === "OFF" ? "#F0524A" : "#3a4656" }} />)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* validation */}
            <div className="pc" style={{ margin: 0, background: "var(--bg-panel)", borderColor: valid.ok ? "#1c5b3c" : "#5a3a1a" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: valid.ok ? TK.green : TK.orange }}>{valid.ok ? <><Glyph name="check" size={11} /> Valid causal DAG with compatible port types</> : <><Glyph name="x" size={11} /> {valid.errors.length} wiring errors</>}</div>
              {valid.errors.slice(0, 5).map((e, i) => <div key={i} className="psm" style={{ color: TK.orange }}><Glyph name="warning" size={10} /> {e}</div>)}
              {valid.warnings.slice(0, 3).map((w, i) => <div key={i} className="psm" style={{ color: TK.muted }}>• {w}</div>)}
            </div>

            {/* Feature Usage Role */}
            <div className="pc" style={{ margin: 0, background: "var(--bg-panel)", borderColor: ROLE_META[roleProfile.primaryRole].color + "66" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}>Intended usage role</span>
                <button onClick={() => setRoleProfile(suggestRoles(graph))} title={"Suggest roles from the selected blocks"} style={{ ...inp, marginLeft: "auto", padding: "2px 7px", fontSize: 10, cursor: "pointer" }}>Auto-suggest</button>
              </div>
              <div className="pmut psm" style={{ marginBottom: 3 }}>Primary role:</div>
              <select style={{ ...inp, width: "100%", marginBottom: 6 }} value={roleProfile.primaryRole} onChange={(e) => setPrimary(e.target.value as FeatureUsageRole)}>
                {USAGE_ROLES.map((r) => <option key={r} value={r}>{ROLE_META[r].label} → {ROLE_META[r].slot}</option>)}
              </select>
              <div className="pmut psm" style={{ marginBottom: 3 }}>Secondary roles:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>
                {USAGE_ROLES.filter((r) => r !== roleProfile.primaryRole).map((r) => { const on = roleProfile.secondaryRoles.includes(r); return <button key={r} onClick={() => toggleSecondary(r)} style={{ ...inp, padding: "2px 7px", fontSize: 10, cursor: "pointer", borderColor: on ? ROLE_META[r].color : "var(--border-subtle)", color: on ? ROLE_META[r].color : "#94A3B8", fontWeight: on ? 800 : 500 }}>{ROLE_META[r].label}</button>; })}
              </div>
              {(() => { const st = roleStatusOf(roleProfile, roleProfile.primaryRole), sm = ROLE_STATUS_META[st]; return <div style={{ fontSize: 10, color: sm.color, fontWeight: 700 }}>● {sm.label} <span className="pmut" style={{ fontWeight: 400 }}>· gate: {ROLE_META[roleProfile.primaryRole].gate}</span></div>; })()}
            </div>

            {selBlock && selNode ? <BlockInspector block={selBlock} node={selNode} graph={graph} /> : null}
          </div>
        </div>

        {/* bottom: BLOCK VISUALIZER */}
        <div style={{ flexShrink: 0, marginTop: 8, background: "var(--bg-panel)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}><Glyph name="search" size={11} /> Block preview</span>
            {selBlock ? <span style={{ fontWeight: 800, color: GROUP_META[selBlock.group].color, fontSize: 12 }}>{selBlock.label} <span className="pmut" style={{ fontWeight: 400 }}>· {selNode?.id} · {selBlock.viz}</span></span> : <span className="pmut psm">Select a block to inspect its measured output</span>}
            {selBlock?.group === "CANDLE_ANATOMY" && <span className="pmut psm" style={{ marginLeft: 6 }}>Fixed measurement; no adjustable parameter</span>}
          </div>
          {selBlock && selBlock.group !== "CANDLE_ANATOMY" && selNode ? (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 360px" }}><BlockPlayground block={selBlock} bars={bars} params={selNode.params ?? {}} onParams={(np) => setParams(selNode.id, np)} W={360} H={94} /></div>
              <div style={{ flex: "1 1 240px", minWidth: 230 }}>
                <div style={{ fontSize: 12, color: "var(--mfe-text)", marginBottom: 4 }}>{selBlock.description}</div>
                <div className="pmut psm">Input: {selBlock.inputs.map((p) => (p.type === "STREAM_OHLC" ? "bars" : p.type)).join(" · ") || "—"} → Output: {selBlock.outputs[0].type}{selBlock.outputs[0].scaleFree ? " · scale-free" : ""}</div>
                {selBlock.provisional && <div style={{ fontSize: 10, color: TK.orange, marginTop: 3 }}><Glyph name="warning" size={9} /> {selBlock.note}</div>}
                <div className="pmut psm" style={{ marginTop: 4, fontStyle: "italic" }}>Changing a parameter updates the preview and this graph node.</div>
              </div>
            </div>
          ) : (
            <CandleExplainer bars={bars} graph={graph} composite={outVal} compositeLabel={name || "Feature output"} highlightPart={selBlock ? ANATOMY_PART[selBlock.blockId] : undefined} editablePart={selBlock ? ANATOMY_PART[selBlock.blockId] : undefined} />
          )}
        </div>

        {/* TEST: the feature on ~1200 real M1 bars */}
        <div style={{ flexShrink: 0, marginTop: 8, background: "var(--bg-panel)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}><Glyph name="flask" size={11} /> Evaluate on 1,200 M1 bars</span>
            {savedId ? (qualified
              ? <span className="co-tag" style={{ border: "1px solid " + TK.green, color: TK.green, fontWeight: 800 }}><Glyph name="check-circle" size={11} /> Qualified for L1 &amp; L2/L3 use</span>
              : <><span className="co-tag" style={{ border: "1px solid " + TK.orange, color: TK.orange }}>Saved as Shadow</span><button onClick={qualify} style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 800 }}><Glyph name="check-circle" size={11} /> Qualify Module → L1</button></>)
              : <span className="pmut psm">Save, inspect the measurements, then run the required qualification.</span>}
          </div>
          <FeatureTestChart graph={graph} />
          {savedId && (
            <div style={{ marginTop: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px" }}><Glyph name="microscope" size={11} /> Role-specific OOS gate <span style={{ color: "var(--mfe-muted)" }}>(null-relative + era-stability)</span></span>
                <button disabled={gateBusy} onClick={runGate} style={{ ...inp, cursor: gateBusy ? "wait" : "pointer", background: gateBusy ? "var(--bg-card-inner)" : "#1f6feb", color: gateBusy ? "var(--mfe-muted)" : "#fff", border: "none", fontWeight: 800 }}>{gateBusy ? "Evaluating observations…" : "Run role validation"}</button>
              </div>
              {gateResults.map((r) => { const vm = r.verdict === "OOS_QUALIFIED" ? TK.green : r.verdict === "SHADOW_QUALIFIED" ? TK.orange : TK.red; return (
                <div key={r.role} style={{ marginTop: 5, fontSize: 11 }}>
                  <b style={{ color: ROLE_META[r.role].color }}>{ROLE_META[r.role].label}</b> → <b style={{ color: vm }}>{r.verdict}</b> <span className="pmut" style={{ fontSize: 9.5 }}>· n={r.sampleSize}</span>
                  <div className="pmut" style={{ fontSize: 9.5, lineHeight: 1.45 }}>{r.notes.join(" · ")}</div>
                </div>
              ); })}
              {!gateResults.length && !gateBusy && <div className="pmut psm" style={{ marginTop: 3 }}>Compares forward outcomes with a permutation null across chronological eras. Passing is not assumed.</div>}
            </div>
          )}
        </div>

        {/* MECHANISM */}
        <div style={{ flexShrink: 0, margin: "8px 0", background: "var(--bg-panel)", border: "1px solid var(--border-panel)", borderRadius: 8, padding: "8px 10px" }}>
          <div className="pmut" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 5 }}><Glyph name="book" size={11} /> Module mechanism: {name || "Unnamed"}</div>
          <div style={{ fontFamily: "var(--mfe-mono)", fontSize: 12, color: TK.cyan, marginBottom: 6, wordBreak: "break-word" }}>{mechanism.formula} <span className="pmut" style={{ fontSize: 10 }}>→ {mechanism.outType}{mechanism.outRange ? " " + mechanism.outRange : ""}</span></div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6 }}>
            {mechanism.steps.map((s) => <li key={s.id}><b style={{ color: "var(--mfe-text)" }}>{s.label}</b> <span className="pmut" style={{ fontSize: 9.5 }}>({s.id})</span>: {s.text}</li>)}
          </ol>
          <div className="pmut psm" style={{ marginTop: 5, fontStyle: "italic" }}>Derived from the graph and its parameters. A measurement is not a trading signal.</div>
        </div>
      </div>
      {showGallery && <BlockGallery onClose={() => setShowGallery(false)} />}
      {guideOpen && <LayerInfoPopup initialLevel={1} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
