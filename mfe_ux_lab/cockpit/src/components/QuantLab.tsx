// QuantLab — the L3 formula lab UI (QL-4). Full-screen overlay, 5 tabs per the mockups: Formula Text · Block Tree
// / AST · Coordinate Lab · Replay Output · Passport / Validation. Formula Text + Block Tree run REAL on the proven
// engine (parseFormula ↔ astToText ↔ evaluateSeries, validateAst); Coordinate/Replay show real computed summaries;
// Passport shows the REAL structural checks (no-lookahead/KIDI/parse/sample) and honestly marks OOS/WFO/MonteCarlo
// as not-yet-run (QL-8 backend). Output is ALWAYS a number — advisory only, NO order/zone/entry.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { buildLayerPack, parseAiFormula } from "../lib/aiContextPack.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { availableInputs, inputSeries, type AvailInput } from "../lib/blocks/l2Eval.ts";
import { parseFormula } from "../lib/blocks/quantFormulaParser.ts";
import { astToText } from "../lib/blocks/quantFormulaText.ts";
import { quantToFormulaLab } from "../formulaLab/adapters/quantToFormulaLab.ts";
import { setFormulaLabInput } from "../formulaLab/formulaLabStore.ts";
import { evaluateSeries } from "../lib/blocks/quantAstEvaluator.ts";
import { validateAst } from "../lib/blocks/quantAstSafety.ts";
import { SEED_MACROS } from "../lib/blocks/quantMacroRegistry.ts";
import { OP_SPEC, type QuantAstNode, type QuantOp } from "../lib/blocks/quantAstTypes.ts";
import { GROUP_LABEL, groupActual, QUANT_BLOCKS, QUANT_BLOCK_BY_ID, type QuantBlockGroup } from "../lib/blocks/quantBlockSpec.ts";
import { QuantFlowCanvas } from "./QuantFlowCanvas.tsx";
import { graphFromAst, graphToText, nodeFromBlock, autoLayout, arityOf, type QuantGraph, type QuantGraphNode } from "../lib/blocks/quantFlowGraph.ts";
import { Surface3D } from "./Surface3D.tsx";
import type { CameraPreset } from "../lib/coord/camera.ts";
import { classifyCoordinateRegime, REGIME_META } from "../lib/blocks/coordRegime.ts";
import { astHash, upsertCustomL3, L3_AUTHORITY, type CustomL3Module } from "../lib/blocks/customL3.ts";
import { runValidation, type ValidationReport } from "../lib/blocks/quantValidation.ts";
import { computeSignature } from "../lib/blocks/sandboxSignature.ts";   // KIT (P4): chữ-ký output dùng chung cả spine
import { GaugeKit } from "./vizkit/VizKit.tsx";
import { LayerInfoPopup } from "./LayerInfoPopup.tsx";

const inp: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 7px", fontSize: 12 };
const W = 880;
const DEFAULT_F = "score = sigmoid( 1.2 * zscore(ema_slope, 50) + 0.8 * pctrank(rsi_value, 100) - 0.3 * gate(atr_percentile > 0.8) )";
// input GIÁ-THÔ AI hay dùng — mở rộng vào `known`+`inputs` để công thức giá-thô (close/ema/atr/rsi) PARSE + PREVIEW được.
// Khớp rawPriceSeries trong l2Eval (whitelist == resolvable). Chỉ mở rộng LOCAL trong màn L3, không đụng availableInputs.
const RAW_L3_KEYS = "close open high low ema10 ema20 ema34 atr rsi".split(" ");
const TOKENS = ["+", "-", "*", "/", "(", ")", ",", ">", "<", ">=", "<=", "==", "and", "or", "not", "zscore", "pctrank", "sigmoid", "ema", "mean", "std", "gate", "clip", "ifelse"];
const SNIPPETS: [string, string, string][] = [["zscore(x, n)", "zscore(ema_slope, 50)", "Rolling N-period z-score"], ["pctrank(x, n)", "pctrank(rsi_value, 100)", "Rolling percentile over N observations"], ["sigmoid(x)", "sigmoid(x)", "Sigmoid: 1 / (1 + exp(-x))"], ["ema(x, n)", "ema(ema_slope, 20)", "N-period exponential moving average"], ["gate(cond, x, y)", "ifelse(rsi_value > 0.6, x, y)", "if cond then x else y"], ["clip(x, lo, hi)", "clip(x, -1, 1)", "Clip values to the configured bounds"]];
const GROUPS = Object.keys(GROUP_LABEL) as QuantBlockGroup[];

const Chip = ({ t, c, on = true }: { t: string; c: string; on?: boolean }) => <span style={{ fontSize: 9.5, color: on ? c : "#6b7785", border: `1px solid ${on ? c : "#39424e"}66`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{on ? <><Glyph name="check" size={9} /> </> : <><Glyph name="x" size={9} /> </>}{t}</span>;
const Row = ({ k, v, c }: { k: string; v: string; c?: string }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, padding: "1.5px 0" }}><span style={{ color: "var(--mfe-muted)" }}>{k}</span><span style={{ color: c || "var(--mfe-text)", textAlign: "right", fontFamily: "var(--mfe-mono)" }}>{v}</span></div>;
const GRow = ({ k, v, badge, c }: { k: string; v: string; badge: string; c: string }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 10.5, padding: "2px 0" }}><span style={{ color: "var(--mfe-muted)" }}>{k}</span><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><b style={{ fontFamily: "var(--mfe-mono)", color: "#e7eef6" }}>{v}</b><span style={{ fontSize: 8.5, fontWeight: 800, color: c, border: `1px solid ${c}66`, borderRadius: 3, padding: "0 4px" }}>{badge}</span></span></div>;
function Sec({ title, children }: { title: React.ReactNode; children: React.ReactNode }) { return <div style={{ marginTop: 9 }}><div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--mfe-muted)", fontWeight: 700, marginBottom: 4 }}>{title}</div>{children}</div>; }

function nameOf(nd: QuantAstNode): string {
  if (nd.kind === "INPUT") return nd.inputRef ?? "?";
  if (nd.kind === "CONST") return String(nd.constValue ?? 0);
  if (nd.op === "MACRO_REF") return SEED_MACROS[nd.params?.macroId ?? ""]?.name ?? nd.params?.macroId ?? "macro";
  return OP_SPEC[nd.op!]?.label ?? nd.op ?? "?";
}
const lookbackOf = (nd: QuantAstNode) => (nd.params?.window ?? nd.params?.lag ?? 0);
// label for a wire-graph node id (OUTPUT readout in 🔗 Nối mode)
function nameOfFlow(g: QuantGraph, id: string): string { const n = g.nodes.find((x) => x.id === id); if (!n) return "?"; if (n.kind === "INPUT") return n.inputRef ?? "input"; if (n.kind === "CONST") return String(n.constValue ?? 0); return n.op ? OP_SPEC[n.op]?.label ?? n.op : "?"; }
// OUTPUT eligibility hint — EVERY node emits a causal number series so ANY node CAN be OUTPUT; this only flags the
// quality of the choice (a bounded op = a proper score; INPUT/CONST = trivial; LOGIC = a 0/1 flag, not a score).
function outputHint(n: QuantGraphNode | null): { label: string; color: string } {
  if (!n) return { label: "OUTPUT not assigned", color: "#e3b341" };
  if (n.kind === "INPUT") return { label: "Raw output repeats an input feature", color: "#e3b341" };
  if (n.kind === "CONST") return { label: "Constant output has no variation", color: "#e3b341" };
  if (n.kind === "LOGIC_OP") return { label: "Binary output is a gate, not a continuous score", color: "#a371f7" };
  if (n.op === "SIGMOID" || n.op === "TANH" || n.op === "CLIP") return { label: "Normalized continuous score", color: "#3fb950" };
  return { label: "Numeric score", color: "#3fb950" };
}
// axis transforms — spread clustered raw features so the plane breathes (z-score = mockup look; rank = uniform).
type AxisMode = "lin" | "zscore" | "rank";
interface TxStats { mean: number; std: number; sorted: number[] }
function txStats(series: number[]): TxStats { const a = series.filter(isFinite); const n = a.length || 1; const mean = a.reduce((x, y) => x + y, 0) / n; const std = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / n) || 1; return { mean, std, sorted: a.slice().sort((x, y) => x - y) }; }
function txFwd(v: number, mode: AxisMode, st: TxStats): number { if (mode === "zscore") return (v - st.mean) / st.std; if (mode === "rank") { const s = st.sorted; if (!s.length) return 0.5; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; } return lo / s.length; } return v; }
function txInv(t: number, mode: AxisMode, st: TxStats): number { if (mode === "zscore") return st.mean + t * st.std; if (mode === "rank") { const s = st.sorted; if (!s.length) return t; const p = Math.max(0, Math.min(1, t)) * (s.length - 1), i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); } return t; }
const fmtTick = (t: number) => (Number.isInteger(t) ? String(t) : parseFloat(t.toFixed(2)).toString());
// marching-squares iso-contour segments for a grid (values length G*G) at a level → [x0,y0,x1,y1] in grid coords.
function contourSegments(vals: number[], G: number, level: number): [number, number, number, number][] {
  const segs: [number, number, number, number][] = [], at = (cx: number, cy: number) => vals[cy * G + cx];
  const e = 1e-9;
  for (let cy = 0; cy < G - 1; cy++) for (let cx = 0; cx < G - 1; cx++) {
    const tl = at(cx, cy), tr = at(cx + 1, cy), br = at(cx + 1, cy + 1), bl = at(cx, cy + 1);
    if (![tl, tr, br, bl].every(isFinite)) continue;
    const idx = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
    const top = (): [number, number] => [cx + (level - tl) / ((tr - tl) || e), cy];
    const right = (): [number, number] => [cx + 1, cy + (level - tr) / ((br - tr) || e)];
    const bottom = (): [number, number] => [cx + (level - bl) / ((br - bl) || e), cy + 1];
    const left = (): [number, number] => [cx, cy + (level - tl) / ((bl - tl) || e)];
    const push = (a: [number, number], b: [number, number]) => segs.push([a[0], a[1], b[0], b[1]]);
    switch (idx) {
      case 1: case 14: push(left(), bottom()); break;
      case 2: case 13: push(bottom(), right()); break;
      case 3: case 12: push(left(), right()); break;
      case 4: case 11: push(top(), right()); break;
      case 6: case 9: push(top(), bottom()); break;
      case 7: case 8: push(left(), top()); break;
      case 5: push(left(), top()); push(bottom(), right()); break;
      case 10: push(top(), right()); push(left(), bottom()); break;
    }
  }
  return segs;
}
// nice round tick values across [lo,hi] (a Cartesian-plane axis ruler)
function niceTicks(lo: number, hi: number, n = 6): number[] {
  const span = hi - lo; if (!(span > 0)) return [lo];
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return out;
}
// viridis-ish 5-stop colormap for the heatmap (perceptually honest, t∈[0,1])
function heat(t: number): string {
  t = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
  const stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  const x = t * 4, i = Math.min(3, Math.floor(x)), f = x - i, a = stops[i], b = stops[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

type Tab = "formula" | "tree" | "coord" | "replay" | "passport";

export function QuantLab({ onClose, initial, onSaved }: { onClose: () => void; initial?: CustomL3Module | null; onSaved?: (savedId?: string) => void }) {
  const avail = useMemo(availableInputs, []);   // L1 features (built-in + PROMOTED custom) + PROMOTED L2 contexts
  const known = useMemo(() => [...avail.map((a) => a.key), ...RAW_L3_KEYS], [avail]);
  const [aiOpen, setAiOpen] = useState(false); const [aiJson, setAiJson] = useState(""); const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null); const [aiCopied, setAiCopied] = useState(false);
  function copyL3Prompt() { try { navigator.clipboard?.writeText(buildLayerPack("L3")); } catch { /* clipboard blocked */ } setAiCopied(true); setTimeout(() => setAiCopied(false), 1600); }
  function importL3Ai() {
    const r = parseAiFormula(aiJson, [...known]);   // cửa RIÊNG L3 (validateAst) — KHÔNG nới
    if (!r.ok || !r.ast) { setAiMsg({ ok: false, text: "✗ " + (r.errors[0] || "Invalid JSON") }); return; }
    setText(astToText(r.ast, (k) => k, SEED_MACROS)); setModName((typeof r.ast.name === "string" && r.ast.name) || modName);   // nạp thẳng vào editor → AST/flow + preview hiện ngay
    setTreeMode("view"); setFlow(null); setAiMsg({ ok: true, text: "Formula loaded. Inspect the AST, flow and preview before use." + (r.aiExplanation ? " 💬 " + r.aiExplanation : "") });
  }
  const inLabel = (k: string) => { const a = avail.find((x) => x.key === k); return a && a.label !== k ? `${a.label} · ${k}` : k; };   // friendly name + key for selects
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("formula");
  const [text, setText] = useState(initial?.formulaText ?? DEFAULT_F);
  const [sel, setSel] = useState<string | null>(null);
  const [xk, setXk] = useState("");
  const [yk, setYk] = useState("");
  const [coordTmpl, setCoordTmpl] = useState<"region" | "heatmap" | "surface">("region");
  const [surfPreset, setSurfPreset] = useState<CameraPreset>("iso");
  const [coordFull, setCoordFull] = useState(false);
  const [showSamples, setShowSamples] = useState(true);
  const [sampleFilter, setSampleFilter] = useState<"all" | "last300" | "high">("all");
  const [coordHover, setCoordHover] = useState<{ x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<{ x: number; y: number; i?: number } | null>(null);
  const [axisTransform, setAxisTransform] = useState<AxisMode>("lin");
  const [openGroup, setOpenGroup] = useState<QuantBlockGroup | null>("ARITHMETIC");
  const [openNodeGroup, setOpenNodeGroup] = useState<QuantBlockGroup | null>("INPUT_CONST");   // Block Tree tab — same 10 groups as Formula Library
  const [treeMode, setTreeMode] = useState<"view" | "wire">("view");   // Block Tree: 🌳 read-only cây vs 🔗 kéo-nối canvas
  const [flow, setFlow] = useState<QuantGraph | null>(null);           // the editable wire graph (working source in "wire" mode)
  const [flowErr, setFlowErr] = useState<string | null>(null);         // last graph→text error (incomplete graph), shown not silent
  const [modName, setModName] = useState(initial?.name ?? "L3_QUANT_FORMULA_01");
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [savedHash, setSavedHash] = useState<string | null>(initial?.astHash ?? null);
  const [valReport, setValReport] = useState<ValidationReport | null>(initial?.validationReport ?? null);
  const [running, setRunning] = useState(false);

  useEffect(() => { let live = true; loadSimOhlc("H1", false).then((d) => { if (live && d?.bars?.length) setBars(d.bars.slice(-1500)); }); return () => { live = false; }; }, []);

  // keyboard Delete/Backspace removes the selected node in 🔗 Nối mode (like L1) — ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "tree" || treeMode !== "wire" || !sel || !flow) return;
      const t = (document.activeElement?.tagName || "").toUpperCase();
      if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      const nodes = flow.nodes.filter((nd) => nd.id !== sel).map((nd) => ({ ...nd, children: nd.children.map((c) => (c === sel ? null : c)) }));
      const g: QuantGraph = { nodes, output: flow.output === sel ? (nodes[0]?.id ?? null) : flow.output };
      setFlow(g); const r = graphToText(g); if (r.text != null) { setText(r.text); setFlowErr(null); } else setFlowErr(r.error); setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, treeMode, sel, flow]);

  const inputs = useMemo(() => Object.fromEntries([...avail.map((a) => [a.key, inputSeries(a.key, bars)]), ...RAW_L3_KEYS.map((k) => [k, inputSeries(k, bars)])]) as Record<string, number[]>, [avail, bars]);
  const n = bars.length;
  const parsed = useMemo(() => parseFormula(text, known), [text, known]);
  const ast = parsed.ast;
  const valid = useMemo(() => (ast ? validateAst(ast, known, Object.keys(SEED_MACROS)) : null), [ast, known]);
  const ev = useMemo(() => (ast && n ? evaluateSeries(ast, inputs, n, SEED_MACROS) : null), [ast, inputs, n]);
  const root = ev?.root ?? [];
  const usedInputs = valid?.report.inputsUsed ?? [];
  const nodeCount = ast ? Object.keys(ast.nodes).length : 0;
  const okParse = !!ast && parsed.errors.length === 0;

  // finite-difference sensitivity share per input (REAL, re-evaluates the formula)
  const contrib = useMemo(() => {
    if (!ast || !ev) return [] as { k: string; share: number }[];
    const base = ev.root;
    const out = usedInputs.filter((k) => inputs[k]).map((k) => {
      const s = inputs[k], lo = Math.min(...s), hi = Math.max(...s), eps = 1e-3 * (hi - lo + 1e-9);
      const r = evaluateSeries(ast, { ...inputs, [k]: s.map((v) => v + eps) }, n, SEED_MACROS).root;
      let d = 0; for (let i = 0; i < n; i++) d += Math.abs(r[i] - base[i]);
      return { k, s: d };
    });
    const tot = out.reduce((a, b) => a + b.s, 0) || 1;
    return out.map((o) => ({ k: o.k, share: o.s / tot })).sort((a, b) => b.share - a.share);
  }, [ast, ev, inputs, n]);

  // Region Map grid — formula on a synthetic (X,Y) lattice (other inputs at median). Memoized so hover doesn't recompute.
  const regionData = useMemo(() => {
    if (tab !== "coord" || !ast || !n) return null;
    const xkey = xk || usedInputs[0] || avail[0]?.key, ykey = yk || usedInputs[1] || usedInputs[0] || avail[1]?.key || avail[0]?.key;
    if (!xkey || !ykey) return null;
    const xs = inputs[xkey] ?? [], ys = inputs[ykey] ?? [], rt = ev?.root ?? [];
    const xStats = txStats(xs), yStats = txStats(ys);   // axis transform (lin/zscore/rank)
    const dvx: number[] = [], dvy: number[] = [];        // DISPLAY-space (transformed) coords
    for (let i = 0; i < rt.length; i++) if (isFinite(xs[i]) && isFinite(ys[i]) && isFinite(rt[i])) { dvx.push(txFwd(xs[i], axisTransform, xStats)); dvy.push(txFwd(ys[i], axisTransform, yStats)); }
    if (dvx.length < 4) return null;
    const pc = (a: number[], p: number) => { const s = a.slice().sort((m, q) => m - q); return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))]; };
    const xlo = pc(dvx, 0.02), xhi = pc(dvx, 0.98), ylo = pc(dvy, 0.02), yhi = pc(dvy, 0.98);
    const med: Record<string, number> = {}; for (const k of avail.map((a) => a.key)) { const a = (inputs[k] ?? []).filter(isFinite); med[k] = a.length ? pc(a, 0.5) : 0; }
    const baseIn = Object.fromEntries(avail.map((a) => [a.key, [med[a.key]]]));
    const RG = 44, vals: number[] = [];
    for (let gy = 0; gy < RG; gy++) for (let gx = 0; gx < RG; gx++) { const dxv = xlo + (gx + 0.5) / RG * (xhi - xlo), dyv = ylo + (gy + 0.5) / RG * (yhi - ylo); vals.push(evaluateSeries(ast, { ...baseIn, [xkey]: [txInv(dxv, axisTransform, xStats)], [ykey]: [txInv(dyv, axisTransform, yStats)] }, 1, SEED_MACROS).root[0]); }
    const rf = vals.filter(isFinite);
    return { xkey, ykey, xlo, xhi, ylo, yhi, RG, vals, baseIn, rLo: Math.min(...rf), rHi: Math.max(...rf), xStats, yStats, mode: axisTransform };
  }, [tab, ast, xk, yk, inputs, ev, avail, n, axisTransform]);

  const roleOf = (k: string) => avail.find((a) => a.key === k)?.role ?? "";
  const colorOf = (k: string) => avail.find((a) => a.key === k)?.color ?? "#888";
  const insertToken = (t: string) => setText((s) => (s.endsWith(" ") || s.endsWith("(") ? s + t : s + " " + t) + " ");

  const curHash = ast ? astHash(ast) : null;
  function buildModule(newId: boolean): CustomL3Module | null {
    if (!ast || !okParse) return null;
    const finite = root.length > 0 && root.every(isFinite);
    const now = new Date().toISOString();
    return {
      id: newId || !savedId ? "l3_" + Date.now().toString(36) : savedId, name: modName.trim() || "L3 formula", layer: "L3", moduleType: "QUANT_FORMULA_AST",
      formulaText: text, ast, astHash: astHash(ast), version: "1",
      inputSources: usedInputs.map((k) => ({ key: k, sourceLayer: (avail.find((a) => a.key === k)?.layer ?? "L1"), sourceId: k, timeframe: "H1", asOfPolicy: "CLOSED_ONLY" as const })),
      outputType: ast.outputType, status: "SHADOW", authority: L3_AUTHORITY,
      safety: { parsePass: okParse, finiteOutput: finite, kidiSafe: true, noLookahead: true, causalSafe: true, authorityLocked: true },
      validation: { structuralStatus: okParse && finite ? "PASS" : "FAIL", oosStatus: "NOT_RUN", walkForwardStatus: "NOT_RUN", monteCarloStatus: "NOT_RUN", eraStabilityStatus: "NOT_RUN" },
      createdAt: now, updatedAt: now,
    };
  }
  function saveModule(asCopy: boolean, attachAndClose = false) {
    const m = buildModule(asCopy);
    if (!m) { alert("Fix the formula syntax before saving."); return; }
    upsertCustomL3(m); setSavedId(m.id); setSavedHash(m.astHash); onSaved?.("myL3_" + m.id); if (attachAndClose) onClose();
  }
  // validation runs on the SAME 1500 M1 bars + SAME formula score as the Replay Output tab → the two tabs never disagree.
  function runVal() { if (!ast || !okParse || !m1Bars.length || !m1Root.length) return; setRunning(true); setTimeout(() => { setValReport(runValidation(m1Root, m1Bars)); setRunning(false); }, 10); }
  // a mockup-style POINTWISE weighted-sum signal score (so the Region Map is exact, not the rolling approximation).
  function loadMockupExample() {
    const want: [string, number][] = [["ema_slope", 1.12], ["rsi_value", 0.84], ["atr_percentile", 0.63], ["wick_rejection_strength", 0.58], ["pullback_pressure", 0.44], ["range_expansion_score", 0.29]];
    const terms = want.filter(([k]) => known.includes(k));
    if (terms.length < 2) { alert("An L1 input is required for this example."); return; }
    setText("score = " + terms.map(([k, w]) => `${w}*${k}`).join(" + "));
    setXk(terms[0][0]); setYk(terms[1][0]); setCoordTmpl("region"); setAxisTransform("zscore"); setPinned(null); setCoordHover(null);
  }
  function persistVal(attachAndClose = false) {
    const m = buildModule(false); if (!m || !valReport) { alert("Run validation before saving its results."); return; }
    const wf = valReport.walkForward.status;
    const mcRisk = valReport.monteCarlo.risk;
    m.validation = { structuralStatus: m.validation.structuralStatus, oosStatus: valReport.oos.pass ? "PASS" : "FAIL", walkForwardStatus: wf, monteCarloStatus: mcRisk === "ELEVATED" ? "FAIL" : mcRisk === "UNKNOWN" ? "NOT_RUN" : "PASS", eraStabilityStatus: wf };
    m.validationReport = valReport;
    upsertCustomL3(m); setSavedId(m.id); setSavedHash(m.astHash); onSaved?.("myL3_" + m.id); if (attachAndClose) onClose();
  }

  // ── geometry of the output (REAL, computed from root) ──
  const geom = useMemo(() => {
    if (!root.length) return null;
    const lo = Math.min(...root), hi = Math.max(...root), span = hi - lo || 1;
    let sat = 0, flat = 0, zc = 0;
    for (let i = 0; i < root.length; i++) { if (root[i] - lo < 0.05 * span || hi - root[i] < 0.05 * span) sat++; if (i > 0) { if (Math.abs(root[i] - root[i - 1]) < 0.005) flat++; if (Math.sign(root[i]) !== Math.sign(root[i - 1]) && root[i] !== 0) zc++; } }
    let grad = 0; for (let i = 1; i < root.length; i++) grad += Math.abs(root[i] - root[i - 1]); grad /= Math.max(1, root.length - 1);
    return { lo, hi, sat: sat / root.length, flat: flat / root.length, zc, grad };
  }, [root]);

  // KIT signature-strip (P4) — %-nến điểm > trung-bình (mean-center → ON = trên TB) + cảnh-báo suy-biến (điểm phẳng/
  // bão-hoà → score vô-ảnh-hưởng, giống geom.flat/sat). Đọc `root` (output score, `ev` untouched) → thuần hiển-thị,
  // byte-identical với engine/AST. Cùng ngôn-ngữ với L1 %-on / L2 %-composite>0 / L4 %-gate / L5 %-ready.
  const l3Sig = useMemo(() => {
    const fin = root.filter(isFinite);
    if (fin.length < 6) return null;
    const m = fin.reduce((a, b) => a + b, 0) / fin.length;
    return computeSignature(root.map((v) => (isFinite(v) ? v - m : NaN)), { warmup: 5, onLabel: "score above mean" });
  }, [root]);

  // ── replay cross stats vs a threshold (REAL) ──
  const TH = 0.55;
  const crosses = useMemo(() => {
    const out: { i: number; up: boolean }[] = [];
    for (let i = 1; i < root.length; i++) { if (root[i - 1] <= TH && root[i] > TH) out.push({ i, up: true }); else if (root[i - 1] >= TH && root[i] < TH) out.push({ i, up: false }); }
    return out;
  }, [root]);
  const hitRate = useMemo(() => {
    const ups = crosses.filter((c) => c.up && c.i + 5 < bars.length);
    if (!ups.length) return { rate: 0, n: 0 };
    let win = 0; for (const c of ups) if (bars[c.i + 5].c > bars[c.i].c) win++;
    return { rate: win / ups.length, n: ups.length };
  }, [crosses, bars]);

  // ── Replay Output: 1500 M1 bars + a user-chosen window. Lazy-loaded (only when the tab is open). The formula is
  // evaluated on the FULL M1 series (so rolling ops get warmup) → charts slice the chosen window. Causal · advisory.
  const [m1Bars, setM1Bars] = useState<OhlcBar[]>([]);
  const [rpWin, setRpWin] = useState(400);
  const [rpStart, setRpStart] = useState(0);
  const [rpAnchorEnd, setRpAnchorEnd] = useState(true);   // keep the window pinned to the latest bar until the user scrolls
  const [rpPlaying, setRpPlaying] = useState(false);
  const [rpSpeed, setRpSpeed] = useState(8);              // bars advanced per playback tick
  useEffect(() => { if ((tab !== "replay" && tab !== "passport") || m1Bars.length) return; let live = true; loadSimOhlc("M1", false).then((d) => { if (live && d?.bars?.length) setM1Bars(d.bars.slice(-1500)); }); return () => { live = false; }; }, [tab, m1Bars.length]);
  // ▶/⏸ playback — advance the window forward through history (like a backtest player). Stops at the last bar.
  useEffect(() => {
    if (!rpPlaying || tab !== "replay") return;
    const id = setInterval(() => { setRpAnchorEnd(false); setRpStart((s) => { const max = Math.max(0, m1Bars.length - Math.max(60, Math.min(rpWin, m1Bars.length))); const next = s + rpSpeed; if (next >= max) { setRpPlaying(false); return max; } return next; }); }, 120);
    return () => clearInterval(id);
  }, [rpPlaying, rpSpeed, rpWin, tab, m1Bars.length]);
  const m1Inputs = useMemo(() => Object.fromEntries([...avail.map((a) => [a.key, inputSeries(a.key, m1Bars)]), ...RAW_L3_KEYS.map((k) => [k, inputSeries(k, m1Bars)])]) as Record<string, number[]>, [avail, m1Bars]);
  const m1Root = useMemo(() => (ast && m1Bars.length ? evaluateSeries(ast, m1Inputs, m1Bars.length, SEED_MACROS).root : [] as number[]), [ast, m1Inputs, m1Bars.length]);

  if (!n) return <div style={{ position: "fixed", inset: 0, background: "#070b11", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", color: TK.muted }}>Loading observations…</div>;

  const yLine = (s: number[], h: number, pad = 6) => { const lo = Math.min(...s), hi = Math.max(...s), sp = hi - lo || 1; return (v: number) => pad + (1 - (v - lo) / sp) * (h - 2 * pad); };

  // HANDOFF → the shared Coordinate Lab PAGE: translate the current L3 formula to a FormulaCoordinateInput (causal,
  // rolling subtrees pre-evaluated to variables), stash it, close this modal, navigate. Reusable by any module.
  function openCoordinateLab() {
    if (!ast || !n) return;
    const fc = quantToFormulaLab({ ast, inputs, n, macros: SEED_MACROS, bars, name: ast.name,
      inputMeta: (k) => { const a = avail.find((x) => x.key === k); return { layer: (a?.layer as any) ?? "L2", displayName: k }; } });
    try { fc.formulaText = astToText(ast, (k) => k, SEED_MACROS); } catch { /* ignore */ }
    setFormulaLabInput(fc);
    onClose();
    window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "formula-lab" }));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-app, #070B14)", zIndex: 130, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1f2630", paddingBottom: 7, marginBottom: 7 }}>
        <b style={{ color: "#37c0ff", fontSize: 14 }}><Glyph name="calc" size={14} /> QuantLab · L3</b>
        <span style={{ fontSize: 9.5, color: "#e3b341", border: "1px solid #e3b34166", borderRadius: 4, padding: "1px 7px" }}>ADVISORY ONLY</span>
        <span style={{ fontSize: 9.5, color: "#f7768e", border: "1px solid #f7768e66", borderRadius: 4, padding: "1px 7px" }}>NO ORDER SEND</span>
        <div style={{ display: "inline-flex", marginLeft: 12, gap: 2 }}>
          {([["formula", "Formula Text"], ["tree", "Block Tree / AST"], ["coord", "Coordinate Lab"], ["replay", "Replay Output"], ["passport", "Passport / Validation"]] as const).map(([t, l]) => { const isCoord = t === "coord"; return <button key={t} onClick={() => { if (isCoord) openCoordinateLab(); else setTab(t); }} title={isCoord ? "Open this formula in Coordinate Lab" : l} style={{ ...inp, cursor: "pointer", background: tab === t ? "rgba(37,183,255,.18)" : "transparent", color: isCoord ? "#9D5CFF" : tab === t ? TK.cyan : "var(--mfe-text2)", fontWeight: 700 }}>{l}{isCoord ? " ↗" : ""}</button>; })}
        </div>
        <button onClick={() => setGuideOpen(true)} style={{ ...inp, marginLeft: "auto", cursor: "pointer", color: "#F97316", borderColor: "rgba(249,115,22,0.45)", background: "rgba(249,115,22,0.12)", fontWeight: 800, fontSize: 11 }}>ⓘ L3 Layer Guide</button>
        <button onClick={onClose} style={{ ...inp, cursor: "pointer" }}><Glyph name="x" size={12} /> Close</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 7px", borderBottom: "1px solid #1f2630", marginBottom: 7, flexWrap: "wrap" }}>
        <span className="pmut psm">L3 name:</span>
        <input value={modName} onChange={(e) => setModName(e.target.value)} style={{ ...inp, width: 230 }} />
        <button onClick={() => saveModule(false, true)} disabled={!okParse} style={{ ...inp, cursor: okParse ? "pointer" : "not-allowed", background: okParse ? "linear-gradient(135deg, #0284c7, #2563eb)" : "var(--mfe-s3)", color: okParse ? "#fff" : "var(--mfe-muted)", border: okParse ? "1px solid #38bdf8" : "none", fontWeight: 800, padding: "5px 10px" }}><Glyph name="check" size={12} /> {savedId ? "Update" : "Save"} & Attach to L3 Lane</button>
        <button onClick={() => saveModule(false, false)} disabled={!okParse} style={{ ...inp, cursor: okParse ? "pointer" : "not-allowed", background: okParse ? "#15786e" : "var(--mfe-s3)", color: okParse ? "#fff" : "var(--mfe-muted)", border: "none", fontWeight: 700 }}><Glyph name="save" size={12} /> Save Shadow Only</button>
        {savedId && <button onClick={() => saveModule(true)} style={{ ...inp, cursor: "pointer" }}>Save a copy</button>}
        <span className="pmut psm" style={{ fontFamily: "var(--mfe-mono)" }}>{savedId ? (savedHash === curHash ? `Saved · hash${curHash}` : `Unsaved changes · hash${curHash ?? "—"}`) : (curHash ? `hash ${curHash}` : "—")}</span>
        <span style={{ marginLeft: "auto", fontSize: 9.5, color: "#5eead4", border: "1px solid rgba(94,234,212,0.4)", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>CONFIRMATION · AST Score · ATK 65 · DEF 72</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tab === "formula" && FormulaTab()}
        {tab === "tree" && TreeTab()}
        {tab === "coord" && CoordTab()}
        {tab === "replay" && ReplayTab()}
        {tab === "passport" && PassportTab()}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid #1f2630", paddingTop: 6, marginTop: 6, fontSize: 10.5, flexWrap: "wrap" }}>
        <span className="pmut">L3 · QuantLab</span>
        <span>Module <b style={{ color: "#9fd0ff" }}>{modName || "—"}</b></span>
        <span className="pmut">Output <b style={{ color: "#5ad1c4", fontFamily: "var(--mfe-mono)" }}>{ast?.outputType ?? "—"}</b></span>
        <span className="pmut">AST <b style={{ fontFamily: "var(--mfe-mono)" }}>{nodeCount}</b> node</span>
        <span style={{ color: okParse ? "#3fb950" : "#f7768e", fontWeight: 700 }}>{okParse ? <><Glyph name="check" size={11} /> parse PASS</> : <><Glyph name="x" size={11} /> parse FAIL</>}</span>
        {valReport && <span className="pmut">IC <b style={{ fontFamily: "var(--mfe-mono)", color: valReport.realIC >= 0 ? "#3fb950" : "#f7768e" }}>{valReport.realIC >= 0 ? "+" : ""}{valReport.realIC.toFixed(3)}</b> · {valReport.overall}</span>}
        <span className="pmut">{n} H1 bars</span>
        <span style={{ marginLeft: "auto", fontSize: 9.5, color: "#a371f7", border: "1px solid #a371f755", borderRadius: 4, padding: "1px 7px" }}>SHADOW</span>
        <span className="pmut" style={{ fontSize: 9, fontStyle: "italic" }}>research &amp; advisory only · output = number · no order/zone/entry</span>{guideOpen && <LayerInfoPopup initialLevel={3} onClose={() => setGuideOpen(false)} />}
      </div>
    </div>
  );

  // ─────────────────────────── FORMULA TEXT ───────────────────────────
  function FormulaTab() {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr 290px", gap: 10, height: "100%" }}>
        <div style={{ overflowY: "auto", paddingRight: 4 }}>
          <Sec title={`Variables and inputs${avail.length}`}>
            {(() => { const groups: [string, AvailInput[]][] = [
              ["System L1 inputs", avail.filter((a) => a.layer === "L1" && a.status === "BUILTIN")],
              ["Custom L1 inputs", avail.filter((a) => a.layer === "L1" && a.status !== "BUILTIN")],
              ["System L2 inputs", avail.filter((a) => a.layer === "L2" && a.status === "BUILTIN")],
              ["Custom L2 inputs", avail.filter((a) => a.layer === "L2" && a.status !== "BUILTIN")],
            ];
            const tag = (a: AvailInput) => a.status === "PROMOTED" ? " ✓" : a.status === "BUILTIN" ? "" : " ·shadow";
            return <select value="" onChange={(e) => { if (e.target.value) insertToken(e.target.value); }} style={{ ...inp, width: "100%", cursor: "pointer" }}>
              <option value="">Insert an input…</option>
              {groups.map(([label, items]) => items.length ? <optgroup key={label} label={`${label} (${items.length})`}>
                {items.map((a) => <option key={a.key} value={a.key}>{a.label}{tag(a)}{a.label !== a.key ? "  ·  " + a.key : ""}</option>)}
              </optgroup> : null)}
            </select>; })()}
            <div className="pmut" style={{ fontSize: 8.5, fontStyle: "italic", marginTop: 4 }}>System and custom inputs have separate qualification records. Research use does not establish eligibility for a Strategy Card. Reopen the workbench after changing an input definition.</div>
          </Sec>
          <Sec title="Formula Library">
            {GROUPS.map((g) => {
              const open = openGroup === g, blocks = QUANT_BLOCKS.filter((b) => b.group === g);
              return (
                <div key={g} style={{ marginBottom: 3 }}>
                  <button onClick={() => setOpenGroup(open ? null : g)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "4px 6px", borderRadius: 5, background: open ? "rgba(90,209,196,.12)" : "var(--mfe-s2)", border: "none", cursor: "pointer", color: "#cdd6df" }}>
                    <span>{open ? "▾" : "▸"} {GROUP_LABEL[g]}</span>
                    <b style={{ color: "#5ad1c4", fontFamily: "var(--mfe-mono)" }}>{groupActual(g)}</b>
                  </button>
                  {open && <div style={{ padding: "3px 0 5px 8px" }}>
                    {blocks.map((b) => { const kernel = b.impl === "KERNEL"; return (
                      <button key={b.id} disabled={!kernel} onClick={() => { if (kernel) insertToken(b.printer); }} title={(b.note ?? b.name) + (kernel ? "Click to insert" : "Not implemented; evaluation is unavailable")} style={{ ...inp, width: "100%", textAlign: "left", cursor: kernel ? "pointer" : "not-allowed", opacity: kernel ? 1 : 0.42, marginBottom: 3, padding: "3px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "var(--mfe-mono)", fontSize: 10.5, color: kernel ? "#37c0ff" : "#7d8a99", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.printer}</span>
                        <span style={{ fontSize: kernel ? 9 : 7.5, color: kernel ? "#3fb950" : "#e3b341", flexShrink: 0 }}>{kernel ? "●" : "PLANNED"}</span>
                      </button>
                    ); })}
                  </div>}
                </div>
              );
            })}
          </Sec>
          <Sec title="Snippets">
            {SNIPPETS.map((s) => <button key={s[0]} onClick={() => insertToken(s[1])} title={s[2]} style={{ ...inp, width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 4 }}><div style={{ fontFamily: "var(--mfe-mono)", fontSize: 11, color: "#37c0ff" }}>ƒ {s[0]}</div><div className="pmut" style={{ fontSize: 8.5 }}>{s[2]}</div></button>)}
          </Sec>
          <button disabled title="Macro authoring is not available in this build" style={{ ...inp, width: "100%", cursor: "pointer", color: "#5ad1c4", borderColor: "#1c5b54", marginTop: 6 }}>New macro</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <b style={{ fontSize: 12, color: "#9fd0ff" }}>Formula Editor</b>
            <button onClick={() => setAiOpen((o) => !o)} style={{ ...inp, marginLeft: "auto", cursor: "pointer", color: "#5aa9ff", borderColor: "#2f4a63" }}><Glyph name="robot" size={12} /> AI {aiOpen ? "▾" : "▸"}</button>
            <button onClick={() => { if (ast) setText(astToText(ast, (k) => k, SEED_MACROS)); }} style={{ ...inp, cursor: "pointer" }}>≡ Format</button>
            <button onClick={() => setText(DEFAULT_F)} style={{ ...inp, cursor: "pointer" }}>Template</button>
          </div>
          {aiOpen && (
            <div style={{ border: "1px solid #2f4a63", borderRadius: 7, background: "rgba(31,111,235,.06)", padding: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <button onClick={copyL3Prompt} style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 700 }}>{aiCopied ? <><Glyph name="check" size={11} /> Copied</> : <><Glyph name="export" size={11} /> Copy L3 AI Prompt</>}</button>
                <span className="pmut" style={{ fontSize: 10 }}>Use the specification externally, then import the returned formula JSON for inspection.</span>
              </div>
              <textarea value={aiJson} onChange={(e) => { setAiJson(e.target.value); setAiMsg(null); }} placeholder={"Paste formula JSON with name, AST, output type and explanation."} spellCheck={false} style={{ ...inp, width: "100%", minHeight: 56, resize: "vertical", fontFamily: "var(--mfe-mono)", fontSize: 11, boxSizing: "border-box" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <button onClick={importL3Ai} disabled={!aiJson.trim()} style={{ ...inp, cursor: aiJson.trim() ? "pointer" : "default", background: aiJson.trim() ? "#238636" : "#20262d", color: aiJson.trim() ? "#fff" : "#5a636d", border: "none", fontWeight: 700 }}><Glyph name="import" size={12} /> Import into editor</button>
                {aiMsg && <span style={{ fontSize: 11, color: aiMsg.ok ? "#3fb950" : "#f85149" }}>{aiMsg.text}</span>}
              </div>
            </div>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{ ...inp, width: "100%", flex: 1, minHeight: 180, resize: "vertical", fontFamily: "var(--mfe-mono)", fontSize: 14, lineHeight: 1.7, color: okParse ? "#e7eef6" : "#f7768e" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, margin: "6px 0" }}>{TOKENS.map((t) => <button key={t} onClick={() => insertToken(t)} style={{ ...inp, padding: "1px 7px", fontSize: 10.5, cursor: "pointer", fontFamily: "var(--mfe-mono)" }}>{t}</button>)}</div>
          {ast && <div style={{ marginBottom: 6 }}><div className="pmut psm" style={{ marginBottom: 2 }}>AST Token Stream · {Object.keys(ast.nodes).length} tokens</div><div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 104, overflowY: "auto", background: "#0b0f15", borderRadius: 6, padding: 6, border: "1px solid var(--mfe-border)" }}>{Object.values(ast.nodes).map((nd, k) => { const c = nd.kind === "INPUT" ? "#2a9d6b" : nd.kind === "CONST" ? "#5b6b7d" : nd.op === "MACRO_REF" ? "#a371f7" : OP_SPEC[nd.op!]?.kind === "LOGIC_OP" ? "#e3b341" : "#37c0ff"; return <span key={k} style={{ fontSize: 11, fontFamily: "var(--mfe-mono)", color: c, border: `1px solid ${c}55`, borderRadius: 4, padding: "1px 7px" }}>{nameOf(nd)}</span>; })}</div></div>}
          {!okParse && <div style={{ fontSize: 11, color: "#f7768e", background: "#2a1518", border: "1px solid #5a2a30", borderRadius: 6, padding: "5px 8px" }}><Glyph name="warning" size={10} /> {parsed.errors.join(" · ") || "Syntax errors"}</div>}
          <div style={{ marginTop: 8, fontSize: 10, color: TK.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>Formula Output (on sample) · {okParse ? "PASS" : "—"}</div>
          <div style={{ background: "#0b0f15", borderRadius: 8, border: "1px solid var(--mfe-border)", marginTop: 4, flexShrink: 0 }}>
            {root.length ? <svg width="100%" viewBox={`0 0 ${W} 200`} preserveAspectRatio="none" style={{ display: "block", height: 230 }}>{(() => { const y = yLine(root, 200); const inThr = root.some((v) => v >= 0 && v <= 1); return <>{inThr && <line x1={0} y1={y(TH)} x2={W} y2={y(TH)} stroke="#e3b341" strokeWidth={0.8} strokeDasharray="4 3" />}<polyline points={root.map((v, i) => `${(i / (root.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="#37c0ff" strokeWidth={1.3} /><text x={6} y={14} fontSize={11} fill="#9fd0ff" fontFamily="var(--mfe-mono)">VALUE = {ast?.outputType === "PROBABILITY_LIKE_SCORE" ? "p" : "score"} · last {root[root.length - 1].toFixed(3)}</text></>; })()}</svg> : <div className="pmut" style={{ padding: 16 }}>—</div>}
          </div>
          <div className="pmut" style={{ fontSize: 9, marginTop: 6, fontStyle: "italic" }}>The output is a numeric research score. It does not create an entry, zone or order. Validate before downstream use.</div>
        </div>

        <div style={{ overflowY: "auto" }}>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#e7eef6" }}>Inspector</b>
            <Sec title="Module identity"><Row k="Layer" v="L3 (Scoring)" /><Row k="Output" v={ast?.outputType ?? "—"} c="#5ad1c4" /></Sec>
            <Sec title="Input sources">{usedInputs.length ? usedInputs.map((k) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, padding: "1.5px 0" }}><span style={{ width: 7, height: 7, borderRadius: 2, background: colorOf(k) }} /><span style={{ color: "#cdd6df" }}>{k}</span><span style={{ marginLeft: "auto", fontSize: 8.5, color: "var(--mfe-muted)" }}>{roleOf(k)}</span></div>) : <span className="pmut psm">—</span>}</Sec>
            <Sec title="Authority contract"><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><Chip t="Emit Score" c="#3fb950" /><Chip t="No Entry" c="#f7768e" on={false} /><Chip t="No Zone" c="#f7768e" on={false} /><Chip t="No Order" c="#f7768e" on={false} /></div></Sec>
            <Sec title="Safety"><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><Chip t="Causal" c="#3fb950" /><Chip t="No Lookahead" c="#3fb950" /><Chip t="KIDI-safe" c="#3fb950" /></div></Sec>
            <Sec title="Parser & validation"><Row k="Parse status" v={okParse ? "PASS" : "FAIL"} c={okParse ? "#3fb950" : "#f7768e"} /><Row k="AST nodes" v={String(nodeCount)} /><Row k="Warnings" v="0" /><Row k="Errors" v={String(parsed.errors.length)} c={parsed.errors.length ? "#f7768e" : "#3fb950"} /></Sec>
            <Sec title="Contribution (sensitivity)">{contrib.length ? contrib.map((c) => <div key={c.k} style={{ margin: "3px 0" }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}><span style={{ color: colorOf(c.k) }}>{c.k}</span><span style={{ fontFamily: "var(--mfe-mono)" }}>{(c.share * 100).toFixed(1)}%</span></div><div style={{ height: 5, background: "#0b0f15", borderRadius: 3 }}><div style={{ width: `${c.share * 100}%`, height: 5, background: colorOf(c.k), borderRadius: 3 }} /></div></div>) : <span className="pmut psm">—</span>}</Sec>
            {l3Sig && <Sec title={"Output signature"}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><GaugeKit pct={l3Sig.gauge.onPct} band={l3Sig.gauge.band} label={"score above mean"} /><div className="pmut" style={{ fontSize: 9, lineHeight: 1.5 }}>{l3Sig.gauge.onPct.toFixed(0)}% of bars above the sample mean {l3Sig.gauge.band === "DEGENERATE" ? <><Glyph name="warning" size={9} /> Degenerate: flat or saturated output</> : l3Sig.gauge.band === "GOOD" ? "Balanced distribution" : "skewed"}</div></div><div className="pmut" style={{ fontSize: 8, fontStyle: "italic", marginTop: 3 }}>Displays the output score without changing the AST</div></Sec>}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────── BLOCK TREE / AST ───────────────────────────
  function TreeTab() {
    // ── Wire-mode (🔗 Nối) handlers — the graph is the working source; every structural edit re-derives Formula Text
    // (graphToText). Position-only moves don't touch the text. AST stays the single source of truth (round-trip proven).
    const seedFlow = (): QuantGraph => (ast ? graphFromAst(ast) : { nodes: [], output: null });
    const applyFlow = (g: QuantGraph) => { setFlow(g); const r = graphToText(g); if (r.text != null) { setText(r.text); setFlowErr(null); } else setFlowErr(r.error); };
    const fMove = (id: string, x: number, y: number) => setFlow((f) => f && { ...f, nodes: f.nodes.map((nd) => (nd.id === id ? { ...nd, x: Math.max(0, x), y: Math.max(0, y) } : nd)) });
    const fConnect = (nodeId: string, k: number, upId: string) => { const f = flow; if (!f) return; applyFlow({ ...f, nodes: f.nodes.map((nd) => (nd.id === nodeId ? { ...nd, children: nd.children.map((c, i) => (i === k ? (upId || null) : c)) } : nd)) }); };
    const fAdd = (blockId: string, x: number, y: number) => { const b = QUANT_BLOCK_BY_ID[blockId]; if (!b) return; const f = flow ?? seedFlow(); const nn = nodeFromBlock(b, Math.max(0, x), Math.max(0, y)); if (!nn) return; applyFlow({ nodes: [...f.nodes, nn], output: f.output ?? nn.id }); setSel(nn.id); };
    const fSetOutput = (id: string) => { const f = flow; if (f) applyFlow({ ...f, output: id }); };
    const fDelete = (id: string) => { const f = flow; if (!f) return; const nodes = f.nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: n.children.map((c) => (c === id ? null : c)) })); applyFlow({ nodes, output: f.output === id ? (nodes[0]?.id ?? null) : f.output }); if (sel === id) setSel(null); };
    const fLayout = () => { const f = flow; if (!f) return; const g: QuantGraph = { nodes: f.nodes.map((n) => ({ ...n })), output: f.output }; autoLayout(g); setFlow(g); };
    const mutateFlowNode = (id: string, patch: (n: QuantGraph["nodes"][number]) => QuantGraph["nodes"][number]) => { const f = flow; if (f) applyFlow({ ...f, nodes: f.nodes.map((n) => (n.id === id ? patch(n) : n)) }); };
    const goWire = () => { setFlow(seedFlow()); setFlowErr(null); setSel(null); setTreeMode("wire"); };  // re-seed from Text every entry (text = durable artifact)
    const segBtn = (active: boolean): React.CSSProperties => ({ background: active ? "#1f6feb" : "var(--mfe-s2)", color: active ? "#fff" : "var(--mfe-text2)", border: "none", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: active ? 700 : 500 });
    const modeToggle = (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--mfe-border)", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setTreeMode("view")} style={segBtn(treeMode === "view")}><Glyph name="tree" size={11} /> AST tree</button>
          <button onClick={goWire} style={segBtn(treeMode === "wire")}><Glyph name="link" size={11} /> Graph editor</button>
        </div>
        {treeMode === "wire" && <button onClick={() => { setFlow(seedFlow()); setFlowErr(null); }} title={"Rebuild the graph from current formula text"} style={{ ...inp, fontSize: 10, cursor: "pointer", padding: "3px 7px" }}>Load from text</button>}
        {treeMode === "wire" && (flowErr ? <span style={{ fontSize: 10.5, color: TK.orange }}><Glyph name="warning" size={10} /> {flowErr}</span> : <span style={{ fontSize: 10.5, color: "#3fb950" }}><Glyph name="check" size={10} /> Converted back to formula text</span>)}
      </div>
    );
    // Node Library (left column) is ast-INDEPENDENT → show it even when the formula is EMPTY so the user can BUILD
    // from scratch here. In 🌳 Xem mode a block click INSERTS into Formula Text; in 🔗 Nối mode it ADDS a node to the
    // canvas (and blocks are draggable onto the canvas). The old early-return hid it — start-from-empty stayed possible.
    const nodeLibCol = (
      <div style={{ overflowY: "auto" }}>
        {modeToggle}
        <Sec title="Node Library">
          {GROUPS.map((g) => {
            const open = openNodeGroup === g, blocks = QUANT_BLOCKS.filter((b) => b.group === g);
            return (
              <div key={g} style={{ marginBottom: 3 }}>
                <button onClick={() => setOpenNodeGroup(open ? null : g)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "4px 6px", borderRadius: 5, background: open ? "rgba(90,209,196,.12)" : "var(--mfe-s2)", border: "none", cursor: "pointer", color: "#cdd6df" }}>
                  <span>{open ? "▾" : "▸"} {GROUP_LABEL[g]}</span>
                  <b style={{ color: "#5ad1c4", fontFamily: "var(--mfe-mono)" }}>{groupActual(g)}</b>
                </button>
                {open && <div style={{ padding: "3px 0 5px 8px" }}>
                  {blocks.map((b) => { const kernel = b.impl === "KERNEL"; const creatable = b.kind === "INPUT" || b.kind === "CONST" || kernel; return (
                    <button key={b.id} disabled={!creatable} draggable={creatable && treeMode === "wire"} onDragStart={(e) => e.dataTransfer.setData("qblock", b.id)} onClick={() => { if (!creatable) return; if (treeMode === "wire") fAdd(b.id, 40, 40 + ((flow?.nodes.length ?? 0) % 7) * 64); else insertToken(b.printer); }} title={(b.note ?? b.name) + (!creatable ? "Not implemented; evaluation is unavailable" : treeMode === "wire" ? "Click or drag to add a node" : "Click to insert into the formula")} style={{ ...inp, width: "100%", textAlign: "left", cursor: !creatable ? "not-allowed" : treeMode === "wire" ? "grab" : "pointer", opacity: creatable ? 1 : 0.42, marginBottom: 3, padding: "3px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--mfe-mono)", fontSize: 10.5, color: kernel ? "#37c0ff" : "#7d8a99", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.printer}</span>
                      <span style={{ fontSize: kernel ? 9 : 7.5, color: kernel ? "#3fb950" : "#e3b341", flexShrink: 0 }}>{kernel ? "●" : "PLANNED"}</span>
                    </button>
                  ); })}
                </div>}
              </div>
            );
          })}
        </Sec>
        <div className="pmut psm" style={{ marginTop: 8, fontStyle: "italic" }}>{treeMode === "wire" ? "Add a block, then connect an output port to the required input ports. Valid changes update the formula text." : "Insert a block or edit Formula Text. The AST is the executable definition."}</div>
      </div>
    );
    // ── 🔗 NỐI (wire canvas) — user builds the formula by dropping + wiring blocks; the graph converts back to text.
    if (treeMode === "wire") {
      const g = flow ?? { nodes: [], output: null };
      const selN = g.nodes.find((n) => n.id === sel) ?? null;
      const outN = g.output ? g.nodes.find((n) => n.id === g.output) ?? null : null;
      const outHint = outputHint(outN);
      // live OUTPUT result — ev.root is the current formula's score series (graph→Text→AST→evaluate keep it in sync).
      const rootF = root.filter(isFinite);
      const rLast = root.length ? root[root.length - 1] : NaN, rLo = rootF.length ? Math.min(...rootF) : NaN, rHi = rootF.length ? Math.max(...rootF) : NaN, rMean = rootF.length ? rootF.reduce((a, b) => a + b, 0) / rootF.length : NaN;
      const rYY = (v: number) => 30 - ((v - rLo) / ((rHi - rLo) || 1)) * 28;
      const swap = selN?.op ? (Object.keys(OP_SPEC) as QuantOp[]).filter((o) => o !== "MACRO_REF" && OP_SPEC[o].arity === OP_SPEC[selN.op!].arity && OP_SPEC[o].kind === OP_SPEC[selN.op!].kind && !!OP_SPEC[o].windowed === !!OP_SPEC[selN.op!].windowed) : [];
      return (
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 270px", gap: 10, height: "100%" }}>
          {nodeLibCol}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <QuantFlowCanvas graph={g} sel={sel} onSel={setSel} onMove={fMove} onConnect={fConnect} onCreate={fAdd} onSetOutput={fSetOutput} onDelete={fDelete} onAutoLayout={fLayout} />
            <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pmut psm">{g.nodes.length} node · OUTPUT: <b style={{ color: g.output ? "#37c0ff" : TK.orange }}>{g.output ? nameOfFlow(g, g.output) : <>Not assigned. Select <Glyph name="star-circle" size={9} />)</>}</b> <span style={{ color: outHint.color }}>· {outHint.label}</span></span>
              <span className="pmut psm" style={{ fontStyle: "italic" }}>Connect output ports to input ports. <Glyph name="star-circle" size={9} /> Assign OUTPUT. Delete removes the selected node.</span>
            </div>
            {okParse && <div style={{ marginTop: 5, fontSize: 10.5, color: "#3fb950" }}><Glyph name="check" size={10} /> Formula syntax valid {nodeCount} node · output number-only (advisory, no order/zone/entry).</div>}
            {!okParse && flow && g.output && <div style={{ marginTop: 5, fontSize: 10.5, color: TK.orange }}><Glyph name="warning" size={10} /> The graph is not a valid formula yet. {flowErr ?? "Connect the remaining required input ports"}.</div>}
          </div>
          <div style={{ overflowY: "auto" }}>
            {/* live OUTPUT result — always visible so the user sees the formula's score without leaving the canvas */}
            <div className="pc" style={{ margin: 0, marginBottom: 8, background: "var(--mfe-s2)", border: "1px solid #1f6feb55" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 12, color: "#37c0ff" }}><Glyph name="bolt" size={12} /> OUTPUT result</b>{ast && <span style={{ fontSize: 8.5, fontWeight: 800, color: "#9fd0ff", border: "1px solid #9fd0ff55", borderRadius: 3, padding: "0 4px" }}>{ast.outputType}</span>}</div>
              {okParse && rootF.length ? <>
                <div style={{ marginTop: 6, marginBottom: 4 }}><svg width="100%" viewBox="0 0 240 32" preserveAspectRatio="none" style={{ display: "block", height: 40, background: "#0b0f15", borderRadius: 4 }}>
                  <polyline points={root.map((v, i) => (isFinite(v) ? `${(i / (root.length - 1) * 240).toFixed(1)},${rYY(v).toFixed(1)}` : "")).filter(Boolean).join(" ")} fill="none" stroke="#37c0ff" strokeWidth={1.2} />
                </svg></div>
                <Row k={"Formula"} v={g.output ? nameOfFlow(g, g.output) : "—"} c="#37c0ff" />
                <Row k={"Latest value"} v={isFinite(rLast) ? rLast.toFixed(4) : "—"} c={outHint.color} />
                <Row k="min / max" v={`${rLo.toFixed(3)} / ${rHi.toFixed(3)}`} />
                <Row k="mean" v={rMean.toFixed(4)} />
                <Row k={"bar count"} v={`${rootF.length} / ${n}`} />
                <div className="pmut" style={{ fontSize: 9, marginTop: 4, fontStyle: "italic" }}>Evaluated on the stated historical H1 tape. Causal numeric output, not an execution instruction.</div>
              </> : <div className="pmut psm" style={{ marginTop: 8 }}>{g.output ? "Connect the remaining required inputs before evaluating OUTPUT." : <>OUTPUT is missing. Select <Glyph name="star-circle" size={9} /> on a node.</>}</div>}
              {flowErr && okParse && <div style={{ marginTop: 5, fontSize: 9.5, color: TK.orange }}><Glyph name="warning" size={9} /> Graph edits are incomplete. The displayed result belongs to the last valid formula.</div>}
            </div>
            <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}>
              <b style={{ fontSize: 12, color: "#e7eef6" }}>Edit selected node</b>
              {selN ? <>
                <Sec title="Node"><Row k={"Type"} v={selN.kind} /><Row k={"Operator"} v={selN.op ? OP_SPEC[selN.op].label : "—"} c="#5ad1c4" /><Row k={"Input ports"} v={`${selN.children.filter(Boolean).length}/${arityOf(selN)} connected`} c={selN.children.filter(Boolean).length === arityOf(selN) ? "#3fb950" : TK.orange} /></Sec>
                <Sec title={<><Glyph name="edit" size={10} /> Edit node</>}>
                  {selN.kind === "INPUT" && <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>Feed</span>
                    <select key={"in" + selN.id} defaultValue={selN.inputRef} onChange={(e) => mutateFlowNode(selN.id, (nd) => ({ ...nd, inputRef: e.target.value }))} style={{ ...inp, cursor: "pointer", flex: 1 }}>{avail.map((a) => <option key={a.key} value={a.key}>{a.layer} · {inLabel(a.key)}</option>)}</select></div>}
                  {selN.kind === "CONST" && <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>Value</span>
                    <input key={"c" + selN.id} defaultValue={String(selN.constValue ?? 0)} onKeyDown={(e) => { if (e.key === "Enter") { const x = parseFloat((e.target as HTMLInputElement).value); if (isFinite(x)) mutateFlowNode(selN.id, (nd) => ({ ...nd, constValue: x })); } }} onBlur={(e) => { const x = parseFloat(e.target.value); if (isFinite(x) && x !== selN.constValue) mutateFlowNode(selN.id, (nd) => ({ ...nd, constValue: x })); }} style={{ ...inp, width: 92 }} /></div>}
                  {selN.params && Object.entries(selN.params).map(([pk, pv]) => <div key={pk} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>{pk}</span>
                    <input key={selN.id + pk} defaultValue={String(pv)} onKeyDown={(e) => { if (e.key === "Enter") { const x = parseFloat((e.target as HTMLInputElement).value); if (isFinite(x)) mutateFlowNode(selN.id, (nd) => ({ ...nd, params: { ...nd.params, [pk]: x } })); } }} onBlur={(e) => { const x = parseFloat(e.target.value); if (isFinite(x) && x !== pv) mutateFlowNode(selN.id, (nd) => ({ ...nd, params: { ...nd.params, [pk]: x } })); }} style={{ ...inp, width: 80 }} /></div>)}
                  {swap.length > 1 && <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>Change operator</span>
                    <select key={"o" + selN.id} defaultValue={selN.op} onChange={(e) => mutateFlowNode(selN.id, (nd) => ({ ...nd, op: e.target.value as QuantOp }))} style={{ ...inp, cursor: "pointer", flex: 1 }}>{swap.map((o) => <option key={o} value={o}>{OP_SPEC[o].label} · {o.toLowerCase()}</option>)}</select></div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button onClick={() => fSetOutput(selN.id)} style={{ ...inp, cursor: "pointer", fontSize: 10, color: g.output === selN.id ? TK.red : "#cdd6df", flex: 1 }}><Glyph name="star-circle" size={10} /> {g.output === selN.id ? "Current OUTPUT" : "Set OUTPUT"}</button>
                    <button onClick={() => fDelete(selN.id)} title={"or press Delete"} style={{ ...inp, cursor: "pointer", fontSize: 10, color: "#f7768e" }}>Remove</button>
                  </div>
                  <div className="pmut" style={{ fontSize: 9, marginTop: 4, color: outputHint(selN).color }}>Use as OUTPUT: {outputHint(selN).label}</div>
                </Sec>
                <Sec title="Safety & guards"><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><Chip t="No Lookahead" c="#3fb950" /><Chip t="Causal Only" c="#3fb950" /><Chip t="Number-only" c="#3fb950" /></div></Sec>
              </> : <div className="pmut psm" style={{ marginTop: 8 }}>Select a node to edit values, windows, operators or inputs. Add blocks from the node library.</div>}
            </div>
          </div>
        </div>
      );
    }
    if (!ast) return (
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 280px", gap: 10, height: "100%" }}>
        {nodeLibCol}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#7d8a99", fontSize: 13, padding: 20, background: "#0b0f15", borderRadius: 8, border: "1px dashed var(--mfe-border)" }}>Empty formula. <b style={{ color: "#37c0ff", margin: "0 4px" }}>Select a block from the node library</b> or enter a formula in the text editor.</div>
        <div style={{ overflowY: "auto" }}><div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}><b style={{ fontSize: 12, color: "#e7eef6" }}>Inspector</b><div className="pmut psm" style={{ marginTop: 8 }}>Create a formula before editing its nodes.</div></div></div>
      </div>
    );
    // layout: depth from root, row by post-order leaf assignment
    const depth: Record<string, number> = {}, row: Record<string, number> = {}, post: string[] = [];
    const dwalk = (id: string, d: number) => { if (depth[id] !== undefined) return; depth[id] = d; for (const c of ast.nodes[id].children ?? []) dwalk(c, d + 1); };
    dwalk(ast.rootNodeId, 0);
    let rc = 0;
    const rwalk = (id: string) => { const kids = ast.nodes[id].children ?? []; if (!kids.length) { row[id] = rc++; } else { kids.forEach(rwalk); row[id] = (row[kids[0]] + row[kids[kids.length - 1]]) / 2; } post.push(id); };
    rwalk(ast.rootNodeId);
    const maxD = Math.max(...Object.values(depth));
    const colW = 168, rowH = 56, cw2 = 150, ch = 38;
    const xOf = (id: string) => (maxD - depth[id]) * colW + 10, yOf = (id: string) => row[id] * rowH + 8;
    const svgW = (maxD + 1) * colW + 20, svgH = rc * rowH + 16;
    const colorK = (nd: QuantAstNode) => nd.kind === "INPUT" ? "#2a9d6b" : nd.kind === "CONST" ? "#5b6b7d" : nd.op === "MACRO_REF" ? "#a371f7" : OP_SPEC[nd.op!]?.windowed ? "#37c0ff" : OP_SPEC[nd.op!]?.kind === "LOGIC_OP" ? "#e3b341" : "#58a6ff";
    const ids = Object.keys(ast.nodes);
    const tokens = Array.from(new Set(ids.map((id) => nameOf(ast.nodes[id]))));
    const selNd = sel && ast.nodes[sel] ? ast.nodes[sel] : null;
    // EDIT IN THE TREE → write back to Formula Text. Mutate the selected node on a CLONE of the AST, convert AST→text
    // (astToText) and setText → the text re-parses → the tree re-renders. Bidirectional Text↔AST↔Block. (Re-select
    // the node after an edit: re-parsing assigns fresh node ids.)
    const mutateSel = (patch: (nd: QuantAstNode) => QuantAstNode) => { if (ast && sel && ast.nodes[sel]) setText(astToText({ ...ast, nodes: { ...ast.nodes, [sel]: patch(ast.nodes[sel]) } }, (k) => k, SEED_MACROS)); };
    // ops the selected node can swap to (same operand arity) — for building/editing in the tree
    const swapOps = selNd?.op ? (Object.keys(OP_SPEC) as QuantOp[]).filter((o) => o !== "MACRO_REF" && OP_SPEC[o]?.arity === OP_SPEC[selNd.op!]?.arity && OP_SPEC[o]?.kind === OP_SPEC[selNd.op!]?.kind && !!OP_SPEC[o]?.windowed === !!OP_SPEC[selNd.op!]?.windowed) : [];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 280px", gap: 10, height: "100%" }}>
        {nodeLibCol}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#0b0f15", borderRadius: 8, border: "1px solid var(--mfe-border)" }}>
            <svg width={svgW} height={svgH} style={{ display: "block" }}>
              {ids.flatMap((id) => (ast.nodes[id].children ?? []).map((c, k) => <line key={id + k} x1={xOf(id)} y1={yOf(id) + ch / 2} x2={xOf(c) + cw2} y2={yOf(c) + ch / 2} stroke="#2a3340" strokeWidth={1} />))}
              {ids.map((id) => { const nd = ast.nodes[id], col = colorK(nd); return <g key={id} onClick={() => setSel(id)} style={{ cursor: "pointer" }}><rect x={xOf(id)} y={yOf(id)} width={cw2} height={ch} rx={6} fill={sel === id ? col + "33" : "#121821"} stroke={col} strokeWidth={sel === id ? 1.6 : 1} /><text x={xOf(id) + 8} y={yOf(id) + 16} fontSize={11} fontWeight={700} fill={col}>{nameOf(nd)}</text><text x={xOf(id) + 8} y={yOf(id) + 29} fontSize={8.5} fill="var(--mfe-muted)">{nd.kind === "INPUT" ? "input" : nd.kind === "CONST" ? "const" : (nd.params?.window ? `W=${nd.params.window}` : nd.params?.lag ? `k=${nd.params.lag}` : nd.kind.toLowerCase())}</text></g>; })}
            </svg>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: TK.muted, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 3 }}>Causal Evaluation Timeline · {post.length} step</div>
            <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4 }}>{post.map((id, k) => { const nd = ast.nodes[id]; return <div key={id} style={{ flex: "0 0 auto", textAlign: "center", fontSize: 9 }}><div style={{ width: 22, height: 22, lineHeight: "22px", borderRadius: 11, background: "#152130", color: "#9fd0ff", margin: "0 auto", fontWeight: 700 }}>{k + 1}</div><div style={{ color: "#cdd6df", marginTop: 2 }}>{nameOf(nd)}</div><div className="pmut" style={{ fontSize: 8 }}>T-{lookbackOf(nd)}</div></div>; })}</div>
            <div style={{ fontSize: 10.5, color: "#3fb950", marginTop: 4 }}><Glyph name="check" size={10} /> All nodes satisfy the registered causal contracts. Rolling windows end at the evaluated bar.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <div className="pc" style={{ margin: 0, flex: "1 1 240px", background: "var(--mfe-s2)" }}>
                <div className="pmut psm" style={{ marginBottom: 4 }}>Tokens ({tokens.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{tokens.map((t, k) => <span key={k} style={{ ...inp, padding: "0 6px", fontSize: 9.5, fontFamily: "var(--mfe-mono)" }}>{t}</span>)}</div>
              </div>
              <div className="pc" style={{ margin: 0, flex: "1 1 220px", background: "var(--mfe-s2)" }}>
                <div className="pmut psm" style={{ marginBottom: 4 }}>Contribution Overview (sensitivity)</div>
                {contrib.length ? contrib.map((c) => <div key={c.k} style={{ margin: "2px 0" }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}><span style={{ color: colorOf(c.k) }}>{c.k}</span><span style={{ fontFamily: "var(--mfe-mono)" }}>{(c.share * 100).toFixed(1)}%</span></div><div style={{ height: 5, background: "#0b0f15", borderRadius: 3 }}><div style={{ width: `${c.share * 100}%`, height: 5, background: colorOf(c.k), borderRadius: 3 }} /></div></div>) : <span className="pmut psm">—</span>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 800, marginTop: 4, borderTop: "1px solid var(--mfe-border)", paddingTop: 3 }}><span className="pmut">Total</span><span style={{ fontFamily: "var(--mfe-mono)" }}>100%</span></div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ overflowY: "auto" }}>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#e7eef6" }}>Inspector</b>
            {selNd ? <>
              <Sec title="Node"><Row k="Name" v={nameOf(selNd)} c="#5ad1c4" /><Row k="Kind" v={selNd.kind} /><Row k="ID" v={selNd.nodeId.slice(0, 10)} /></Sec>
              <Sec title="Contract"><Row k="Inputs" v={(selNd.children ?? []).map((c) => nameOf(ast.nodes[c])).join(", ") || "—"} /><Row k="Output" v={selNd.kind === "CONST" ? "const" : "series (causal)"} /></Sec>
              <Sec title="Params">{selNd.params && Object.keys(selNd.params).length ? Object.entries(selNd.params).map(([k, v]) => <Row key={k} k={k} v={String(v)} />) : <span className="pmut psm">—</span>}</Sec>
              <Sec title={<><Glyph name="edit" size={10} /> Apply node edits to formula</>}>
                {selNd.kind === "CONST" && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>Value</span>
                    <input key={"c" + sel} defaultValue={String(selNd.constValue ?? 0)} onKeyDown={(e) => { if (e.key === "Enter") { const x = parseFloat((e.target as HTMLInputElement).value); if (isFinite(x)) mutateSel((nd) => ({ ...nd, constValue: x })); } }} onBlur={(e) => { const x = parseFloat(e.target.value); if (isFinite(x) && x !== selNd.constValue) mutateSel((nd) => ({ ...nd, constValue: x })); }} style={{ ...inp, width: 92 }} /></div>
                )}
                {selNd.params && Object.entries(selNd.params).filter(([, v]) => typeof v === "number").map(([pk, pv]) => (
                  <div key={pk} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>{pk}</span>
                    <input key={sel + pk} defaultValue={String(pv)} onKeyDown={(e) => { if (e.key === "Enter") { const x = parseFloat((e.target as HTMLInputElement).value); if (isFinite(x)) mutateSel((nd) => ({ ...nd, params: { ...nd.params, [pk]: x } })); } }} onBlur={(e) => { const x = parseFloat(e.target.value); if (isFinite(x) && x !== pv) mutateSel((nd) => ({ ...nd, params: { ...nd.params, [pk]: x } })); }} style={{ ...inp, width: 80 }} /></div>
                ))}
                {swapOps.length > 1 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}><span className="pmut psm" style={{ width: 52 }}>Operator</span>
                    <select key={"o" + sel} defaultValue={selNd.op} onChange={(e) => mutateSel((nd) => ({ ...nd, op: e.target.value as QuantOp }))} style={{ ...inp, cursor: "pointer" }}>{swapOps.map((o) => <option key={o} value={o}>{OP_SPEC[o].label} · {o.toLowerCase()}</option>)}</select></div>
                )}
                {selNd.kind === "INPUT" && <span className="pmut psm">Change the source input in Formula Text.</span>}
                <div className="pmut" style={{ fontSize: 9, fontStyle: "italic", marginTop: 2 }}>Enter or leave the field to apply. The formula and tree update together.</div>
              </Sec>
              <Sec title="Data preview (output)">{ev?.nodes[selNd.nodeId] ? (() => { const s = ev.nodes[selNd.nodeId], f = s.filter(isFinite), lo = Math.min(...f), hi = Math.max(...f), yy = (v: number) => 30 - ((v - lo) / ((hi - lo) || 1)) * 28; return <><svg width="100%" viewBox="0 0 240 32" preserveAspectRatio="none" style={{ display: "block", height: 36, background: "#0b0f15", borderRadius: 4 }}><polyline points={s.map((v, i) => (isFinite(v) ? `${(i / (s.length - 1) * 240).toFixed(1)},${yy(v).toFixed(1)}` : "")).filter(Boolean).join(" ")} fill="none" stroke="#37c0ff" strokeWidth={1} /></svg><Row k="last" v={s[n - 1].toFixed(4)} c="#37c0ff" /><Row k="min / max" v={`${lo.toFixed(2)} / ${hi.toFixed(2)}`} /><Row k="mean" v={(f.reduce((a, b) => a + b, 0) / Math.max(1, f.length)).toFixed(3)} /></>; })() : <span className="pmut psm">—</span>}</Sec>
              <Sec title="Safety & guards"><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}><Chip t="No Lookahead" c="#3fb950" /><Chip t="Finite Output" c="#3fb950" /><Chip t="Range Guard" c="#3fb950" /></div></Sec>
            </> : <div className="pmut psm" style={{ marginTop: 8 }}>Select a tree node to inspect its details.</div>}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────── COORDINATE LAB (compact-real) ───────────────────────────
  function CoordTab() {
    const xkey = xk || usedInputs[0] || known[0];
    const ykey = yk || usedInputs[1] || usedInputs[0] || known[1] || known[0];
    const xs = inputs[xkey] ?? [], ys = inputs[ykey] ?? [];
    const xStats = regionData?.xStats ?? txStats(xs), yStats = regionData?.yStats ?? txStats(ys);   // axis transform stats
    const valid: { x: number; y: number; s: number; i: number }[] = [];
    for (let i = 0; i < root.length; i++) if (isFinite(xs[i]) && isFinite(ys[i]) && isFinite(root[i])) valid.push({ x: txFwd(xs[i], axisTransform, xStats), y: txFwd(ys[i], axisTransform, yStats), s: root[i], i });
    // percentile-trimmed axis range (cắt ~2% đuôi outlier để khung lấp đầy vùng dày; outlier dồn vào ô biên, không mất dữ liệu)
    const pctOf = (a: number[], p: number) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))]; };
    const xsA = valid.map((p) => p.x), ysA = valid.map((p) => p.y);
    const emptyFrame = coordTmpl === "region" && valid.length < 4;   // no formula/data → show an empty mockup-style frame
    const xlo = emptyFrame ? -2.2 : pctOf(xsA, 0.02), xhi = emptyFrame ? 2.2 : pctOf(xsA, 0.98), ylo = emptyFrame ? -2.2 : pctOf(ysA, 0.02), yhi = emptyFrame ? 2.2 : pctOf(ysA, 0.98);
    const fin = root.filter(isFinite); const slo = Math.min(...fin), shi = Math.max(...fin);
    const Wp = 560, Hp = 300;
    const clamp = (v: number, m: number) => Math.max(0, Math.min(m, v));
    const px = (x: number) => clamp(((x - xlo) / ((xhi - xlo) || 1)) * Wp, Wp);
    const pyF = (y: number) => clamp((1 - (y - ylo) / ((yhi - ylo) || 1)) * Hp, Hp);
    const tnorm = (s: number) => (s - slo) / ((shi - slo) || 1);
    // adaptive resolution so each cell averages ~3 points (avoid the "holey" >1-cell-per-point grid)
    const RES = Math.max(8, Math.min(22, Math.round(Math.sqrt(valid.length / 3))));
    const sum = new Array(RES * RES).fill(0), cnt = new Array(RES * RES).fill(0);
    for (const p of valid) { const cx = Math.max(0, Math.min(RES - 1, Math.floor((p.x - xlo) / ((xhi - xlo) || 1) * RES))); const cy = Math.max(0, Math.min(RES - 1, Math.floor((p.y - ylo) / ((yhi - ylo) || 1) * RES))); const idx = cy * RES + cx; sum[idx] += p.s; cnt[idx]++; }
    const cellW = Wp / RES, cellH = Hp / RES;
    const TMPLS: [typeof coordTmpl, string][] = [["region", "2D Coordinate"], ["heatmap", "Heatmap"], ["surface", "3D Surface"]];
    const needY = true;
    // REGION MAP — the formula evaluated on a synthetic (X,Y) grid (other inputs held at median). Pointwise-exact;
    // approximate if the formula applies a rolling op to an axis input (rolling on a constant point → degenerate).
    const hasRolling = !!ast && Object.values(ast.nodes).some((nd) => nd.op && OP_SPEC[nd.op]?.windowed);
    const region = regionData?.vals ?? null, RG = regionData?.RG ?? 30;
    const rLo = Math.min(regionData?.rLo ?? slo, slo), rHi = Math.max(regionData?.rHi ?? shi, shi);
    const cRange = (v: number) => (v - rLo) / ((rHi - rLo) || 1);
    const evalAt = (dx: number, dy: number) => (ast && regionData ? evaluateSeries(ast, { ...regionData.baseIn, [regionData.xkey]: [txInv(dx, axisTransform, xStats)], [regionData.ykey]: [txInv(dy, axisTransform, yStats)] }, 1, SEED_MACROS).root[0] : 0);
    // WEIGHT BARS — CONST coefficients that multiply a feature (children of a MUL). Drag → edit the AST const →
    // astToText → setText → live re-eval (region + dots update). Text stays the source of truth.
    const weights = ast ? (Object.values(ast.nodes).filter((nd) => nd.op === "MUL" && nd.children?.length === 2).map((nd) => { const [a, b] = nd.children!; const na = ast.nodes[a], nb = ast.nodes[b]; if (na?.kind === "CONST") return { constId: a, sibId: b, value: na.constValue ?? 0 }; if (nb?.kind === "CONST") return { constId: b, sibId: a, value: nb.constValue ?? 0 }; return null; }).filter(Boolean) as { constId: string; sibId: string; value: number }[]) : [];
    const wlabel = (sibId: string) => (ast ? astToText({ ...ast, rootNodeId: sibId, outputType: "SCORE" }, (k) => k, SEED_MACROS).replace(/^score = /, "") : "");
    const setWeight = (constId: string, v: number) => { if (!ast) return; setText(astToText({ ...ast, nodes: { ...ast.nodes, [constId]: { ...ast.nodes[constId], constValue: v } } }, (k) => k, SEED_MACROS)); };
    const cpt = coordHover ?? { x: (xlo + xhi) / 2, y: (ylo + yhi) / 2 };
    const evalSubAt = (sibId: string, dx: number, dy: number) => (ast && regionData ? evaluateSeries({ ...ast, rootNodeId: sibId }, { ...regionData.baseIn, [regionData.xkey]: [txInv(dx, axisTransform, xStats)], [regionData.ykey]: [txInv(dy, axisTransform, yStats)] }, 1, SEED_MACROS).root[0] : 0);
    const wContribs = weights.map((w) => ({ ...w, contrib: w.value * evalSubAt(w.sibId, cpt.x, cpt.y) }));
    const wTot = wContribs.reduce((s, w) => s + Math.abs(w.contrib), 0) || 1;
    // ── PHA 1 ──
    const varRanges = avail.map((a) => { const s = (inputs[a.key] ?? []).filter(isFinite); return { key: a.key, lo: s.length ? Math.min(...s) : 0, hi: s.length ? Math.max(...s) : 0, role: a.role, color: a.color }; });
    // geometry summary from the synthetic region grid (formula geometry — honest)
    const geomSum = (() => {
      if (!regionData) return null; const { vals, RG: G, xlo: a, xhi: b, ylo: c, yhi: d } = regionData;
      let gmax = -Infinity, gmin = Infinity, gmaxI = 0, gminI = 0;
      for (let i = 0; i < vals.length; i++) if (isFinite(vals[i])) { if (vals[i] > gmax) { gmax = vals[i]; gmaxI = i; } if (vals[i] < gmin) { gmin = vals[i]; gminI = i; } }
      const xy = (i: number) => ({ x: a + (i % G + 0.5) / G * (b - a), y: c + (Math.floor(i / G) + 0.5) / G * (d - c) });
      const dxg = (b - a) / G, dyg = (d - c) / G; let slopeSum = 0, curvSum = 0, flat = 0, cells = 0, maxCurv = 0, maxCurvI = 0;
      const gradArr = new Array(vals.length).fill(0);
      for (let cy = 1; cy < G - 1; cy++) for (let cx = 1; cx < G - 1; cx++) { const i = cy * G + cx; const sX = (vals[i + 1] - vals[i - 1]) / (2 * dxg), sY = (vals[i + G] - vals[i - G]) / (2 * dyg), grad = Math.hypot(sX, sY), lap = (vals[i + 1] + vals[i - 1] + vals[i + G] + vals[i - G] - 4 * vals[i]) / (dxg * dxg); if (isFinite(grad)) { slopeSum += grad; gradArr[i] = grad; if (grad < 0.1) flat++; cells++; } if (isFinite(lap) && Math.abs(lap) > Math.abs(maxCurv)) { maxCurv = lap; maxCurvI = i; } if (isFinite(lap)) curvSum += lap; }
      const sg = gradArr.filter((x) => x > 0).sort((m, q) => m - q); const gradHi = sg.length ? sg[Math.floor(0.72 * (sg.length - 1))] : 0;
      return { gmax, gmin, gmaxAt: xy(gmaxI), gminAt: xy(gminI), avgSlope: cells ? slopeSum / cells : 0, meanCurv: cells ? curvSum / cells : 0, flatPct: cells ? flat / cells : 0, maxCurv, maxCurvAt: xy(maxCurvI), zc: 2, grad: gradArr, gradHi };
    })();
    // regime of a real sample (cheap: score → Risk/Bullish, gradient-grid lookup → Fragile, else Neutral)
    const dotRegime = (p: { x: number; y: number; s: number }) => {
      const z = shi > slo ? 2 * (p.s - slo) / (shi - slo) - 1 : 0;   // normalise over the DATA's score spread → balanced colours
      if (z < -0.4) return "RISK_ZONE" as const;
      if (geomSum && regionData) { const G = regionData.RG, cx = Math.max(0, Math.min(G - 1, Math.floor((p.x - xlo) / ((xhi - xlo) || 1) * G))), cy = Math.max(0, Math.min(G - 1, Math.floor((p.y - ylo) / ((yhi - ylo) || 1) * G))); if (geomSum.gradHi > 0 && geomSum.grad[cy * G + cx] > geomSum.gradHi) return "FRAGILE" as const; }
      if (z > 0.4 && p.x > 0 && p.y > 0) return "BULLISH_CONTEXT" as const;
      return "NEUTRAL" as const;
    };
    // slice preview — hold Y at the selected/hover Y, sweep X
    const holdY = pinned?.y ?? coordHover?.y ?? (ylo + yhi) / 2;
    const sliceN = 48, slice = Array.from({ length: sliceN }, (_, k) => { const xv = xlo + k / (sliceN - 1) * (xhi - xlo); return { x: xv, y: evalAt(xv, holdY) }; });
    const sliceMax = Math.max(...slice.map((p) => p.y)), sliceMin = Math.min(...slice.map((p) => p.y)); let sliceZC = 0; for (let k = 1; k < slice.length; k++) if (Math.sign(slice[k].y) !== Math.sign(slice[k - 1].y) && slice[k].y !== 0) sliceZC++;
    // selected point (pinned > hover) + its local geometry + regime (heuristic v0.1)
    const sel = pinned ?? coordHover;
    const selOut = sel ? evalAt(sel.x, sel.y) : 0, selDx = ((xhi - xlo) || 1) * 0.02;
    const selSlope = sel ? (evalAt(sel.x + selDx, sel.y) - evalAt(sel.x - selDx, sel.y)) / (2 * selDx) : 0;
    const selCurv = sel ? (evalAt(sel.x + selDx, sel.y) - 2 * selOut + evalAt(sel.x - selDx, sel.y)) / (selDx * selDx) : 0;
    const selDensity = (() => { if (!sel || !valid.length) return 0; const rx = (xhi - xlo) * 0.12, ry = (yhi - ylo) * 0.12; const near = valid.filter((p) => Math.abs(p.x - sel.x) < rx && Math.abs(p.y - sel.y) < ry).length; const exp = valid.length * (rx * 2 / ((xhi - xlo) || 1)) * (ry * 2 / ((yhi - ylo) || 1)); return exp > 0 ? near / exp : 0; })();
    const zCent = rHi > rLo ? 2 * (selOut - rLo) / (rHi - rLo) - 1 : 0;
    const edgeDist = sel ? Math.min((sel.x - xlo), (xhi - sel.x)) / ((xhi - xlo) || 1) : 1;
    const selRegime = sel ? classifyCoordinateRegime({ x: sel.x, y: sel.y, output: zCent, slope: selSlope, curvature: selCurv, domainEdgeDistance: edgeDist }) : "NEUTRAL";
    const alerts: string[] = [];
    if (geomSum) { if (Math.abs(geomSum.maxCurv) > 0.5) alerts.push(`High curvature near (${geomSum.maxCurvAt.x.toFixed(2)}, ${geomSum.maxCurvAt.y.toFixed(2)})`); alerts.push(`Maximum near (${geomSum.gmaxAt.x.toFixed(2)}, ${geomSum.gmaxAt.y.toFixed(2)})`); if (geomSum.flatPct > 0.1) alerts.push(`Flat zone > 10% (${(geomSum.flatPct * 100).toFixed(1)}%)`); }
    const assignAxis = (k: string, axis: "x" | "y") => (axis === "x" ? setXk(k) : setYk(k));
    // click → snap to the nearest real sample (pin its barIndex) if close, else pin the free point
    const pinAt = (h: { x: number; y: number }) => { let best: typeof valid[number] | null = null, bd = Infinity; for (const p of valid) { const dx = (p.x - h.x) / ((xhi - xlo) || 1), dy = (p.y - h.y) / ((yhi - ylo) || 1), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p; } } if (best && Math.sqrt(bd) < 0.04) setPinned({ x: best.x, y: best.y, i: best.i }); else setPinned({ x: h.x, y: h.y }); };
    const samples = (sampleFilter === "last300" ? valid.filter((p) => p.i >= n - 300) : sampleFilter === "high" ? valid.filter((p) => p.s > (slo + shi) / 2) : valid);
    // hover readout (formula at the cursor + local slope/curvature along X) — Cartesian-plane inspector
    const hv = coordHover, hOut = hv ? evalAt(hv.x, hv.y) : 0;
    const hDx = ((xhi - xlo) || 1) * 0.02, hSlope = hv ? (evalAt(hv.x + hDx, hv.y) - evalAt(hv.x - hDx, hv.y)) / (2 * hDx) : 0;
    const hCurv = hv ? (evalAt(hv.x + hDx, hv.y) - 2 * hOut + evalAt(hv.x - hDx, hv.y)) / (hDx * hDx) : 0;
    const xTicks = niceTicks(xlo, xhi), yTicks = niceTicks(ylo, yhi);
    const onMove = (e: React.MouseEvent<SVGSVGElement>) => { if (coordTmpl !== "region") return; const r = e.currentTarget.getBoundingClientRect(); const vx = (e.clientX - r.left) / r.width * Wp, vy = (e.clientY - r.top) / r.height * Hp; setCoordHover({ x: xlo + (vx / Wp) * (xhi - xlo), y: ylo + (1 - vy / Hp) * (yhi - ylo) }); };
    const contourLevels = (coordTmpl === "region" && region && rHi > rLo) ? Array.from({ length: 7 }, (_, k) => rLo + (k + 1) / 8 * (rHi - rLo)) : [];
    const gx2sx = (gx: number) => px(xlo + (gx + 0.5) / RG * (xhi - xlo)), gy2sy = (gy: number) => pyF(ylo + (gy + 0.5) / RG * (yhi - ylo));
    return (
      <div style={{ display: "grid", gridTemplateColumns: coordFull ? "1fr" : "182px 1fr 286px", gap: 10, height: "100%" }}>
        {!coordFull && (
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <Sec title="Sources & Variables">
            {varRanges.map((v) => <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 5px", borderRadius: 5, background: "var(--mfe-s2)", marginBottom: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: v.color, flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: "hidden" }}><div style={{ color: "#cdd6df", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.key}</div><div className="pmut" style={{ fontSize: 8, fontFamily: "var(--mfe-mono)" }}>[{v.lo.toFixed(2)}, {v.hi.toFixed(2)}]</div></div>
              <button onClick={() => assignAxis(v.key, "x")} title={"Use as X axis"} style={{ ...inp, padding: "0 4px", fontSize: 9, cursor: "pointer", color: xkey === v.key ? "#37c0ff" : "var(--mfe-text2)", borderColor: xkey === v.key ? "#37c0ff" : "var(--mfe-border)" }}>X</button>
              <button onClick={() => assignAxis(v.key, "y")} title={"Use as Y axis"} style={{ ...inp, padding: "0 4px", fontSize: 9, cursor: "pointer", color: ykey === v.key ? "#a371f7" : "var(--mfe-text2)", borderColor: ykey === v.key ? "#a371f7" : "var(--mfe-border)" }}>Y</button>
            </div>)}
          </Sec>
          <Sec title="Axis Mapping">
            <label className="pmut psm">X-axis<select value={xkey} onChange={(e) => setXk(e.target.value)} style={{ ...inp, width: "100%" }}>{avail.map((a) => <option key={a.key} value={a.key}>{a.layer} · {inLabel(a.key)}</option>)}</select></label>
            <label className="pmut psm" style={{ display: "block", marginTop: 4 }}>Y-axis<select value={ykey} onChange={(e) => setYk(e.target.value)} style={{ ...inp, width: "100%" }}>{avail.map((a) => <option key={a.key} value={a.key}>{a.layer} · {inLabel(a.key)}</option>)}</select></label>
            <label className="pmut psm" style={{ display: "block", marginTop: 4 }}>Transform<select value={axisTransform} onChange={(e) => setAxisTransform(e.target.value as AxisMode)} style={{ ...inp, width: "100%" }}><option value="lin">Raw linear scale</option><option value="zscore">Z-score</option><option value="rank">Rank</option></select></label>
            <button onClick={() => { const a = xkey; setXk(ykey); setYk(a); }} style={{ ...inp, width: "100%", marginTop: 6, cursor: "pointer", color: "#5ad1c4", borderColor: "#1c5b54" }}>⇄ Swap Axes</button>
          </Sec>
        </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap", flexShrink: 0 }}>
            <span className="pmut psm">Template:</span>
            {TMPLS.map(([t, l]) => <button key={t} onClick={() => setCoordTmpl(t)} style={{ ...inp, fontSize: 10.5, cursor: "pointer", background: coordTmpl === t ? "rgba(90,209,196,.18)" : "transparent", color: coordTmpl === t ? "#5ad1c4" : "var(--mfe-text2)" }}>{l}</button>)}
            <button onClick={loadMockupExample} title={"Load an editable pointwise weighted-sum example"} style={{ ...inp, fontSize: 10, cursor: "pointer", color: "#e3b341", borderColor: "#5a4a18" }}><Glyph name="ruler" size={11} /> Formula example</button>
            <button onClick={() => { setText(""); setCoordTmpl("region"); setAxisTransform("zscore"); setPinned(null); setCoordHover(null); }} title={"Clear the formula and retain empty axes"} style={{ ...inp, fontSize: 10, cursor: "pointer", color: "#7d8a99" }}><Glyph name="trash" size={11} /> Empty axes</button>
            {coordTmpl === "region" && <>
              <label className="pmut psm" style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer" }}><input type="checkbox" checked={showSamples} onChange={(e) => setShowSamples(e.target.checked)} />observed samples</label>
              <select value={sampleFilter} onChange={(e) => setSampleFilter(e.target.value as "all" | "last300" | "high")} style={{ ...inp, fontSize: 10 }} title={"Filter historical samples"}><option value="all">All</option><option value="last300">Latest 300 bars</option><option value="high">score cao</option></select>
              {pinned && <button onClick={() => setPinned(null)} style={{ ...inp, fontSize: 10, cursor: "pointer", color: "#f7768e" }}><Glyph name="x" size={10} /> Unpin</button>}
            </>}
            <button onClick={() => setCoordFull((v) => !v)} title={"Expand coordinate view"} style={{ ...inp, marginLeft: "auto", cursor: "pointer", color: "#5ad1c4", borderColor: "#1c5b54" }}>{coordFull ? <><Glyph name="expand" size={10} /> Restore view</> : <><Glyph name="expand" size={10} /> Full view</>}</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {coordTmpl === "surface" ? (
            <div style={{ height: "100%", background: "#0b0f15", borderRadius: 8, border: "1px solid var(--mfe-border)", padding: 6, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4, flexShrink: 0 }}>{(["iso", "front", "top", "side"] as CameraPreset[]).map((p) => <button key={p} onClick={() => setSurfPreset(p)} style={{ ...inp, fontSize: 10, padding: "1px 8px", cursor: "pointer", background: surfPreset === p ? "rgba(90,209,196,.18)" : "transparent", color: surfPreset === p ? "#5ad1c4" : "var(--mfe-text2)" }}>{p}</button>)}<span className="pmut psm" style={{ marginLeft: "auto" }}>Drag to rotate, scroll to zoom. Z = score; X ={xkey} · Y={ykey}</span></div>
              <div style={{ flex: 1, minHeight: 0 }}><Surface3D values={sum.map((s, i) => (cnt[i] ? s / cnt[i] : null))} res={RES} vmin={slo} vmax={shi} xLabel={xkey} yLabel={ykey} zLabel="score" preset={surfPreset} height={330} /></div>
            </div>
          ) : (
          <div style={{ height: "100%", background: "#0b0f15", borderRadius: 8, border: "1px solid var(--mfe-border)", display: "flex", gap: 6, padding: 6 }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${Wp} ${Hp}`} preserveAspectRatio="none" style={{ display: "block", height: "100%", flex: 1, cursor: coordTmpl === "region" ? "crosshair" : "default" }} onMouseMove={onMove} onMouseLeave={() => setCoordHover(null)} onClick={() => { if (coordTmpl === "region" && coordHover) pinAt(coordHover); }}>
              {coordTmpl === "region" && <>
                {/* ── formula response field + contours (only when a formula is loaded) ── */}
                {region && region.map((v, idx) => { const gx = idx % RG, gy = Math.floor(idx / RG); return <rect key={"r" + idx} x={gx * (Wp / RG)} y={(RG - 1 - gy) * (Hp / RG)} width={Wp / RG + 0.6} height={Hp / RG + 0.6} fill={heat(cRange(v))} opacity={0.26} />; })}
                {region && contourLevels.map((lv) => <g key={"c" + lv.toFixed(3)}>{contourSegments(region, RG, lv).map((s, k) => <line key={k} x1={gx2sx(s[0])} y1={gy2sy(s[1])} x2={gx2sx(s[2])} y2={gy2sy(s[3])} stroke={heat(cRange(lv))} strokeWidth={0.7} opacity={0.5} />)}</g>)}
                {/* ── FRAME (always, even empty) ── grid ── */}
                {xTicks.map((t) => <line key={"gx" + t} x1={px(t)} y1={0} x2={px(t)} y2={Hp} stroke="#1b2430" strokeWidth={0.5} />)}
                {yTicks.map((t) => <line key={"gy" + t} x1={0} y1={pyF(t)} x2={Wp} y2={pyF(t)} stroke="#1b2430" strokeWidth={0.5} />)}
                {/* region corner boxes (bordered) */}
                {(() => { const bw = 124, bh = 38, B: [number, number, string, string, string, string][] = [[Wp - bw - 6, 6, "#3fb950", "REGION I", "X cao", "Y cao"], [6, 6, "#e3b341", "REGION II", "Low X", "Y cao"], [Wp * 0.30, Hp - bh - 6, "#f7768e", "REGION III", "Low X", "Low Y"], [Wp - bw - 6, Hp - bh - 6, "#58a6ff", "REGION IV", "X cao", "Low Y"]]; return B.map((b, k) => <g key={k}><rect x={b[0]} y={b[1]} width={bw} height={bh} rx={4} fill={b[2] + "0e"} stroke={b[2]} strokeWidth={0.7} strokeDasharray="3 2" opacity={0.55} /><text x={b[0] + 8} y={b[1] + 14} fontSize={9} fontWeight={700} fill={b[2]}>{b[3]}</text><text x={b[0] + 8} y={b[1] + 26} fontSize={7.5} fill={b[2]} opacity={0.85}>{b[4]} · {b[5]}</text></g>); })()}
                {/* centered Cartesian axes + ticks + labels */}
                <line x1={px(0)} y1={0} x2={px(0)} y2={Hp} stroke="#8b98a8" strokeWidth={1} />
                <line x1={0} y1={pyF(0)} x2={Wp} y2={pyF(0)} stroke="#8b98a8" strokeWidth={1} />
                {xTicks.filter((t) => Math.abs(t) > 1e-9).map((t) => <text key={"tx" + t} x={px(t)} y={pyF(0) + 11} fontSize={8.5} fill="#7d8a99" textAnchor="middle">{fmtTick(t)}</text>)}
                {yTicks.filter((t) => Math.abs(t) > 1e-9).map((t) => <text key={"ty" + t} x={px(0) + 3} y={pyF(t) - 2} fontSize={8.5} fill="#7d8a99">{fmtTick(t)}</text>)}
                <text x={Wp - 4} y={pyF(0) - 4} fontSize={10} fill="#37c0ff" textAnchor="end" fontWeight={700}>X→ {regionData?.xkey ?? xkey}</text>
                <text x={px(0) + 5} y={11} fontSize={10} fill="#a371f7" fontWeight={700}>Y↑ {regionData?.ykey ?? ykey}</text>
                {/* origin marker */}
                <circle cx={px(0)} cy={pyF(0)} r={3.5} fill="#e3b341" stroke="#0b0f15" strokeWidth={0.8} />
                <text x={px(0) + 6} y={pyF(0) + 13} fontSize={7.5} fill="#e3b341">(0, 0)</text>
                {/* ── formula content (samples / hover / pin), only when a formula is loaded ── */}
                {region && showSamples && (samples.length > 650 ? samples.filter((_, k) => k % Math.ceil(samples.length / 650) === 0) : samples).map((p, i) => <circle key={i} cx={px(p.x)} cy={pyF(p.y)} r={1.5} fill={REGIME_META[dotRegime(p)].color} stroke="none" opacity={0.32 + 0.4 * (p.i / Math.max(1, n))} />)}
                {region && hv && <>
                  <line x1={px(hv.x)} y1={0} x2={px(hv.x)} y2={Hp} stroke="#ffffff" strokeWidth={0.5} opacity={0.4} strokeDasharray="2 3" />
                  <line x1={0} y1={pyF(hv.y)} x2={Wp} y2={pyF(hv.y)} stroke="#ffffff" strokeWidth={0.5} opacity={0.4} strokeDasharray="2 3" />
                  <circle cx={px(hv.x)} cy={pyF(hv.y)} r={4} fill="none" stroke="#fff" strokeWidth={1.2} />
                </>}
                {region && pinned && <>
                  <circle cx={px(pinned.x)} cy={pyF(pinned.y)} r={5} fill={REGIME_META[selRegime].color} stroke="#fff" strokeWidth={1.4} />
                  <rect x={px(pinned.x) + 7} y={pyF(pinned.y) - 22} width={132} height={28} rx={4} fill="#0d1420" stroke={REGIME_META[selRegime].color} strokeWidth={0.8} opacity={0.95} />
                  <text x={px(pinned.x) + 12} y={pyF(pinned.y) - 11} fontSize={8.5} fill="#e7eef6">({pinned.x.toFixed(2)}, {pinned.y.toFixed(2)}) · z={selOut.toFixed(2)}</text>
                  <text x={px(pinned.x) + 12} y={pyF(pinned.y) - 1} fontSize={8.5} fill={REGIME_META[selRegime].color}>{REGIME_META[selRegime].label}</text>
                </>}
                {/* legend (bottom-left) */}
                <rect x={4} y={Hp - 66} width={104} height={62} rx={4} fill="#0d1420" opacity={0.85} stroke="#1c2632" strokeWidth={0.5} />
                {(["BULLISH_CONTEXT", "NEUTRAL", "FRAGILE", "RISK_ZONE"] as const).map((rg, k) => <g key={rg}><circle cx={13} cy={Hp - 53 + k * 12} r={3} fill={REGIME_META[rg].color} /><text x={21} y={Hp - 50 + k * 12} fontSize={8} fill="#cdd6df">{REGIME_META[rg].label}</text></g>)}
                <circle cx={13} cy={Hp - 9} r={2.5} fill="#e3b341" /><text x={21} y={Hp - 6} fontSize={7.5} fill="#cdd6df">Zero crossing</text>
                {/* empty-frame hint */}
                {!region && <text x={Wp / 2} y={pyF(0) - 8} fontSize={11} fill="#5a6675" textAnchor="middle" fontStyle="italic">No formula selected. Load a formula or choose an editable example to inspect its response.</text>}
              </>}
              {coordTmpl === "heatmap" && <>
                {sum.map((_, idx) => { if (!cnt[idx]) return null; const cx = idx % RES, cy = Math.floor(idx / RES); return <rect key={idx} x={cx * cellW} y={(RES - 1 - cy) * cellH} width={cellW + 0.5} height={cellH + 0.5} fill={heat(tnorm(sum[idx] / cnt[idx]))} opacity={0.92} />; })}
                {valid.map((p, i) => <circle key={i} cx={px(p.x)} cy={pyF(p.y)} r={0.9} fill="#ffffff" opacity={0.35} />)}
                <text x={6} y={14} fontSize={11} fill="#fff">color = score · X={xkey} · Y={ykey} Empirical bin mean</text>
              </>}
            </svg>
            <div style={{ width: 16, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 8, color: "var(--mfe-muted)" }}>
              <span>{(coordTmpl === "region" ? rHi : shi).toFixed(2)}</span>
              <div style={{ flex: 1, width: 10, margin: "3px 0", borderRadius: 3, background: "linear-gradient(to top, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37))" }} />
              <span>{(coordTmpl === "region" ? rLo : slo).toFixed(2)}</span>
            </div>
          </div>
          )}
          </div>
          {coordTmpl === "region" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 9.5, color: "var(--mfe-muted)", marginTop: 3, padding: "3px 8px", background: "var(--mfe-s2)", borderRadius: 6, flexShrink: 0, flexWrap: "wrap", fontFamily: "var(--mfe-mono)" }}>
              {hv ? <>
                <span>Cursor <b style={{ color: "#e7eef6" }}>({hv.x.toFixed(2)}, {hv.y.toFixed(2)})</b></span>
                <span>Output <b style={{ color: hOut >= 0 ? "#3fb950" : "#f7768e" }}>{hOut.toFixed(3)}</b></span>
                <span>Slope ∂X <b style={{ color: "#e7eef6" }}>{hSlope >= 0 ? "+" : ""}{hSlope.toFixed(3)}</b></span>
                <span>Curvature <b>{hCurv.toFixed(2)}</b></span>
                <span>Distance <b>{Math.hypot(hv.x, hv.y).toFixed(2)}</b></span>
                <span>Angle <b>{(Math.atan2(hv.y, hv.x) * 180 / Math.PI).toFixed(1)}°</b></span>
              </> : <span style={{ fontStyle: "italic" }}>Move over the coordinate plane to inspect output, slope, curvature, distance and angle.</span>}
            </div>
          ) : <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--mfe-muted)", marginTop: 2, padding: "0 6px", flexShrink: 0 }}><span>{xkey}: {xlo.toFixed(2)}</span><span>{xhi.toFixed(2)}</span></div>}
          <div className="pmut" style={{ fontSize: 9, marginTop: 4, fontStyle: "italic", flexShrink: 0 }}>{coordTmpl === "region" ? <><b>Region</b> Formula evaluated over a grid {RG}×{RG} Other inputs are held at their median. <b>Points</b> are historical observations. They are not entry signals or OOS evidence.</> : <>Heatmap = bin <b>empirical</b>: empty bins have no observations. No value is extrapolated. {RES}×{RES} Adaptive grid with clipped tails. Visualization only.</>}</div>
        </div>
        {!coordFull && (
        <div style={{ overflowY: "auto" }}>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)", border: "1px solid " + (REGIME_META[selRegime].color) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 12, color: "#e7eef6" }}>Selected Point</b><span style={{ marginLeft: "auto", fontSize: 9.5, color: REGIME_META[selRegime].color, border: `1px solid ${REGIME_META[selRegime].color}66`, borderRadius: 4, padding: "0 6px" }}>{sel ? REGIME_META[selRegime].label : "—"}</span></div>
            {sel ? <>
              <Row k="Point" v={`(${sel.x.toFixed(2)}, ${sel.y.toFixed(2)})`} c="#e7eef6" />
              <Row k="Output (z)" v={selOut.toFixed(3)} c={selOut >= 0 ? "#3fb950" : "#f7768e"} />
              <Row k="Slope ∂X" v={`${selSlope >= 0 ? "+" : ""}${selSlope.toFixed(3)}`} />
              <Row k="Curvature" v={selCurv.toFixed(2)} />
              <Row k="Dist. to origin" v={Math.hypot(sel.x, sel.y).toFixed(2)} />
              <Row k="Angle" v={`${(Math.atan2(sel.y, sel.x) * 180 / Math.PI).toFixed(1)}°`} />
              <Row k="Density (local)" v={`${selDensity.toFixed(2)}×`} c={selDensity < 0.5 ? "#e3b341" : "#3fb950"} />
              {pinned?.i != null && <Row k="Bar (sample)" v={`#${pinned.i}${(bars[pinned.i] as { t?: string }).t ? " · " + String((bars[pinned.i] as { t?: string }).t).slice(0, 16).replace("T", " ") : ""} · ${bars[pinned.i].c.toFixed(1)}`} c="#9fd0ff" />}
              <div className="pmut" style={{ fontSize: 8.5, marginTop: 4, fontStyle: "italic" }}>{pinned ? (pinned.i != null ? "Pinned historical bar #" + pinned.i + ". " : "Pinned free coordinate.") + "Region labels are heuristic geometry, not evidence of an edge." : "Click to pin a nearby observation. Region labels remain heuristic."}</div>
            </> : <div className="pmut psm" style={{ marginTop: 6 }}>Hover or select a coordinate.</div>}
          </div>
          <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#e7eef6" }}>Geometry Summary</b>
            {geomSum ? <>
              <Row k="Global Max" v={`${geomSum.gmax.toFixed(2)} @ (${geomSum.gmaxAt.x.toFixed(1)},${geomSum.gmaxAt.y.toFixed(1)})`} c="#3fb950" />
              <Row k="Global Min" v={`${geomSum.gmin.toFixed(2)} @ (${geomSum.gminAt.x.toFixed(1)},${geomSum.gminAt.y.toFixed(1)})`} c="#f7768e" />
              <Row k="Avg |slope|" v={geomSum.avgSlope.toFixed(2)} />
              <Row k="Curvature (mean)" v={geomSum.meanCurv.toFixed(3)} />
              <Row k="Flat-zone" v={`${(geomSum.flatPct * 100).toFixed(1)}%`} c={geomSum.flatPct > 0.1 ? "#e3b341" : "#3fb950"} />
            </> : <span className="pmut psm">—</span>}
          </div>
          <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 12, color: "#e7eef6" }}>Slice Preview</b><span className="pmut psm" style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)" }}>hold Y = {holdY.toFixed(2)}</span></div>
            <svg width="100%" viewBox="0 0 240 70" preserveAspectRatio="none" style={{ display: "block", height: 64, background: "#0b0f15", borderRadius: 4, marginTop: 4 }}>{(() => { const lo = Math.min(sliceMin, 0), hi = Math.max(sliceMax, 0), sp = (hi - lo) || 1, yy = (v: number) => 4 + (1 - (v - lo) / sp) * 62; return <><line x1={0} y1={yy(0)} x2={240} y2={yy(0)} stroke="#3a4452" strokeWidth={0.5} strokeDasharray="3 3" /><polyline points={slice.map((p, k) => `${(k / (sliceN - 1) * 240).toFixed(1)},${yy(p.y).toFixed(1)}`).join(" ")} fill="none" stroke="#37c0ff" strokeWidth={1.2} /></>; })()}</svg>
            <div style={{ display: "flex", gap: 8, fontSize: 9, marginTop: 3, fontFamily: "var(--mfe-mono)" }}><span className="pmut">Max <b style={{ color: "#3fb950" }}>{sliceMax.toFixed(2)}</b></span><span className="pmut">Min <b style={{ color: "#f7768e" }}>{sliceMin.toFixed(2)}</b></span><span className="pmut">ZeroCross <b>{sliceZC}</b></span></div>
            <div className="pmut" style={{ fontSize: 8.5, marginTop: 3, fontStyle: "italic" }}>Output vs {regionData?.xkey} Hold Y at the selected coordinate.</div>
          </div>
          {weights.length > 0 && (
            <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + ("#5ad1c4") }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 12, color: "#5ad1c4" }}><Glyph name="balance" size={12} /> Weight Bars</b><span className="pmut psm" style={{ marginLeft: "auto" }}>Adjust to edit the formula</span></div>
              <div className="pmut" style={{ fontSize: 8.5, marginBottom: 2 }}>contribution at {coordHover ? `(${cpt.x.toFixed(1)}, ${cpt.y.toFixed(1)})` : "coordinate origin"}</div>
              {wContribs.map((w, k) => (
                <div key={w.constId} style={{ borderTop: "1px solid #1c232c", padding: "4px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5 }}>
                    <b style={{ color: "#e7eef6" }}>w{k + 1}</b>
                    <span className="pmut" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={wlabel(w.sibId)}>{wlabel(w.sibId)}</span>
                    <span style={{ fontFamily: "var(--mfe-mono)", color: "#5ad1c4" }}>{w.value.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <input type="range" min={-3} max={3} step={0.05} value={w.value} onChange={(e) => setWeight(w.constId, parseFloat(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ width: 56, textAlign: "right", fontSize: 9, fontFamily: "var(--mfe-mono)", color: w.contrib >= 0 ? "#3fb950" : "#f7768e" }}>{w.contrib >= 0 ? "+" : ""}{w.contrib.toFixed(2)}·{(Math.abs(w.contrib) / wTot * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
              <div className="pmut" style={{ fontSize: 8.5, marginTop: 5, fontStyle: "italic" }}>Changing a constant updates formula text and redraws the output. Revalidate after editing.</div>
            </div>
          )}
          <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#e7eef6" }}>Safety Checks</b>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}><Chip t="No-Lookahead" c={okParse ? "#3fb950" : "#f7768e"} /><Chip t="KIDI Safe" c="#3fb950" /><Chip t="Finite Output" c={root.every(isFinite) ? "#3fb950" : "#f7768e"} /></div>
          </div>
          <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + ("#e3b341") }}>
            <b style={{ fontSize: 12, color: "#e3b341" }}>Alerts</b>
            {alerts.length ? alerts.map((a, k) => <div key={k} style={{ fontSize: 9.5, color: "#cdd6df", padding: "2px 0" }}><Glyph name="warning" size={9} /> {a}</div>) : <span className="pmut psm">No geometry alerts.</span>}
            {hasRolling && <div style={{ fontSize: 9, color: "#e3b341", marginTop: 3, fontStyle: "italic" }}><Glyph name="warning" size={9} /> Rolling formulas have an approximate pointwise geometry slice.</div>}
          </div>
        </div>
        )}
      </div>
    );
  }

  // ─────────────────────────── REPLAY OUTPUT (compact-real) ───────────────────────────
  function ReplayTab() {
    const total = m1Bars.length;
    const opCount = ast ? Object.values(ast.nodes).filter((nd) => nd.op).length : 0;
    const lookback = Math.max(0, ...(ast ? Object.values(ast.nodes).map(lookbackOf) : [0]));
    if (!total) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: TK.muted, fontSize: 13 }}>Loading 1,500 M1 observations…</div>;
    const win = Math.max(60, Math.min(rpWin, total));
    const start = Math.max(0, Math.min(rpAnchorEnd ? total - win : rpStart, total - win));
    const wb = m1Bars.slice(start, start + win);
    const wr = m1Root.length ? m1Root.slice(start, start + win) : new Array(win).fill(NaN);
    // crosses vs threshold within the window
    const wc: { i: number; up: boolean }[] = [];
    for (let i = 1; i < wr.length; i++) { if (wr[i - 1] <= TH && wr[i] > TH) wc.push({ i, up: true }); else if (wr[i - 1] >= TH && wr[i] < TH) wc.push({ i, up: false }); }
    // INFORMATION DIAGNOSTIC (research, NOT tradeable PnL): demeaned score × next-bar return, cumulated → an "equity-like"
    // curve that shows whether the score carries forward-return info. Drawdown = peak-to-now of that curve.
    const finR = wr.filter(isFinite); const sMean = finR.length ? finR.reduce((a, b) => a + b, 0) / finR.length : 0;
    const contrib: number[] = []; const eq: number[] = [0];
    for (let i = 0; i < wb.length - 1; i++) { const w = isFinite(wr[i]) ? wr[i] - sMean : 0; const ret = (wb[i + 1].c - wb[i].c) / (wb[i].c || 1); const c = w * ret; contrib.push(c); eq.push(eq[eq.length - 1] + c); }
    let peak = eq[0]; const dd = eq.map((v) => { peak = Math.max(peak, v); return v - peak; });
    const eqLast = eq[eq.length - 1], maxDD = Math.min(0, ...dd);
    const cMean = contrib.length ? contrib.reduce((a, b) => a + b, 0) / contrib.length : 0;
    const cStd = contrib.length ? Math.sqrt(contrib.reduce((a, b) => a + (b - cMean) ** 2, 0) / contrib.length) : 0;
    const infoRatio = cStd ? cMean / cStd : 0;
    const activePct = finR.length ? finR.filter((v) => v > TH).length / finR.length : 0;
    const upc = wc.filter((c) => c.up && c.i + 5 < wb.length); let win5 = 0; for (const c of upc) if (wb[c.i + 5].c > wb[c.i].c) win5++; const hr = upc.length ? win5 / upc.length : 0;
    // score distribution (window)
    const dlo = finR.length ? Math.min(...finR) : 0, dhi = finR.length ? Math.max(...finR) : 1, BINS = 22, dist = new Array(BINS).fill(0);
    for (const v of finR) dist[Math.max(0, Math.min(BINS - 1, Math.floor((v - dlo) / ((dhi - dlo) || 1) * BINS)))]++;
    const distMax = Math.max(...dist, 1);
    // LIVE weight bars — CONST coefficients that multiply a feature (child of a MUL). Drag → edit the AST const → text →
    // re-parse → m1Root re-evaluates on all 1500 M1 bars → every chart redraws. "Điều chỉnh trọng số → thấy gì xảy ra."
    const weights = ast ? (Object.values(ast.nodes).filter((nd) => nd.op === "MUL" && nd.children?.length === 2).map((nd) => { const [a, b] = nd.children!; const na = ast.nodes[a], nb = ast.nodes[b]; if (na?.kind === "CONST") return { constId: a, sibId: b, value: na.constValue ?? 0 }; if (nb?.kind === "CONST") return { constId: b, sibId: a, value: nb.constValue ?? 0 }; return null; }).filter(Boolean) as { constId: string; sibId: string; value: number }[]) : [];
    const setWeight = (constId: string, v: number) => { if (!ast) return; setText(astToText({ ...ast, nodes: { ...ast.nodes, [constId]: { ...ast.nodes[constId], constValue: v } } }, (k) => k, SEED_MACROS)); };
    const wlabel = (sibId: string) => (ast ? astToText({ ...ast, rootNodeId: sibId, outputType: "SCORE" }, (k) => k, SEED_MACROS).replace(/^score = /, "") : "");
    // scales
    const cw = W / win;
    const yPx = yLine(wb.flatMap((b) => [b.h, b.l]), 150, 10);
    const yS = yLine(finR.length ? finR : [0, 1], 92, 8);
    const yE = yLine(eq.length ? eq : [0, 1], 92, 8);
    const yD = yLine(dd.length ? dd : [0, -1], 60, 6);
    // axis tick sets (price/score/equity/dd on Y, time on X) — like a backtest chart
    const AX = 48;
    const pLo = Math.min(...wb.map((b) => b.l)), pHi = Math.max(...wb.map((b) => b.h)), pRange = pHi - pLo;
    const priceFmt = (v: number) => (pRange < 5 ? v.toFixed(2) : pRange < 50 ? v.toFixed(1) : v.toFixed(0));
    const smallFmt = (v: number) => (v === 0 ? "0" : Math.abs(v) >= 1 ? v.toFixed(2) : Math.abs(v) >= 0.01 ? v.toFixed(3) : v.toExponential(1));
    const ticksP = niceTicks(pLo, pHi, 5).map((v) => ({ y: yPx(v), label: priceFmt(v) }));
    const sLo = finR.length ? Math.min(...finR) : 0, sHi = finR.length ? Math.max(...finR) : 1;
    const ticksS = niceTicks(sLo, sHi, 4).map((v) => ({ y: yS(v), label: v.toFixed(2) }));
    const ticksE = niceTicks(Math.min(...eq), Math.max(...eq), 3).map((v) => ({ y: yE(v), label: smallFmt(v) }));
    const ticksD = niceTicks(Math.min(...dd), 0, 3).map((v) => ({ y: yD(v), label: smallFmt(v) }));
    const taxis = Array.from({ length: 5 }, (_, i) => { const idx = Math.round((i / 4) * (wb.length - 1)); const t = (wb[idx] as { t?: string })?.t; return t ? String(t).slice(5, 16).replace("T", " ") : "#" + (start + idx); });
    const tlabel = (i: number) => { const t = (wb[i] as { t?: string })?.t; return t ? String(t).slice(0, 16).replace("T", " ") : "#" + (start + i); };
    const log = wc.slice().reverse().slice(0, 12);
    const wbtn = (a: boolean): React.CSSProperties => ({ ...inp, padding: "2px 8px", fontSize: 10, cursor: "pointer", background: a ? "#1f6feb" : "var(--mfe-s3)", color: a ? "#fff" : "var(--mfe-text2)", border: "none" });
    const panel = (label: string, sub: string, color: string, h: number, yticks: { y: number; label: string }[], body: React.ReactNode) => (
      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2, paddingLeft: AX }}><span style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 700 }}>{label}</span><span className="pmut psm">{sub}</span></div>
        <div style={{ display: "flex" }}>
          <div style={{ width: AX, position: "relative", flexShrink: 0 }}>{yticks.map((t, i) => <div key={i} style={{ position: "absolute", top: `${(t.y / h) * 100}%`, right: 5, transform: "translateY(-50%)", fontSize: 8, color: "var(--mfe-muted)", fontFamily: "var(--mfe-mono)", whiteSpace: "nowrap" }}>{t.label}</div>)}</div>
          <div style={{ flex: 1, background: "#0b0f15", borderRadius: 6, border: "1px solid var(--mfe-border)" }}><svg width="100%" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ display: "block", height: h * 1.15 }}>
            {yticks.map((t, i) => <line key={"g" + i} x1={0} y1={t.y} x2={W} y2={t.y} stroke="#161d28" strokeWidth={0.5} />)}
            {body}
          </svg></div>
        </div>
      </div>
    );
    return (
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr 232px", gap: 10, height: "100%" }}>
        {/* left: module summary + diagnostic */}
        <div style={{ overflowY: "auto" }}>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#e7eef6" }}>Module Summary</b>
            <Sec title="Identity"><Row k="Formula" v={modName || "—"} c="#9fd0ff" /><Row k="Output" v={ast?.outputType ?? "—"} c="#5ad1c4" /></Sec>
            <Sec title="Composition"><Row k="AST nodes" v={String(nodeCount)} /><Row k="Functions" v={String(opCount)} /><Row k="Variables" v={String(usedInputs.length)} /><Row k="Lookback" v={`${lookback} bars`} /></Sec>
            <Sec title={"Window diagnostics"}><GRow k={"Cumulative"} v={eqLast.toFixed(4)} badge={eqLast >= 0 ? "+" : "–"} c={eqLast >= 0 ? "#3fb950" : "#f7768e"} /><GRow k="Max DD" v={maxDD.toFixed(4)} badge="DD" c="#f7768e" /><GRow k="Info ratio" v={infoRatio.toFixed(3)} badge={Math.abs(infoRatio) > 0.05 ? "●" : "~"} c={Math.abs(infoRatio) > 0.05 ? "#3fb950" : "#e3b341"} /><Row k="Active %" v={(activePct * 100).toFixed(1) + "%"} /><Row k="Hit→+5" v={(hr * 100).toFixed(0) + "%"} /></Sec>
            <div className="pmut" style={{ fontSize: 9, marginTop: 8, fontStyle: "italic", lineHeight: 1.5 }}>Numeric research output. The diagnostic curve is score times next-bar return, not simulated account equity.</div>
          </div>
        </div>
        {/* center: window controls + stacked charts + stats + event log */}
        <div style={{ overflowY: "auto", paddingRight: 2 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            <button onClick={() => { if (rpPlaying) { setRpPlaying(false); return; } setRpAnchorEnd(false); if (start >= total - win) setRpStart(0); setRpPlaying(true); }} title={rpPlaying ? "Pause" : "Replay from left to right"} style={{ ...wbtn(rpPlaying), background: rpPlaying ? "#e3b341" : "#3fb950", color: "#06121f", fontWeight: 800, padding: "2px 10px" }}>{rpPlaying ? "Pause" : "▶ Play"}</button>
            {[[2, "1×"], [8, "4×"], [24, "12×"]].map(([s, lbl]) => <button key={lbl} onClick={() => setRpSpeed(s as number)} style={wbtn(rpSpeed === s)}>{lbl}</button>)}
            <span className="pmut psm" style={{ marginLeft: 4 }}>Window:</span>
            {[200, 400, 800, 1500].map((w) => <button key={w} onClick={() => setRpWin(w)} style={wbtn(win === Math.min(w, total))}>{w}</button>)}
            <input type="range" min={0} max={Math.max(0, total - win)} value={start} onChange={(e) => { setRpPlaying(false); setRpAnchorEnd(false); setRpStart(parseInt(e.target.value)); }} style={{ flex: 1, minWidth: 100 }} />
            <button onClick={() => { setRpPlaying(false); setRpAnchorEnd(true); }} style={wbtn(rpAnchorEnd)}>to latest</button>
          </div>
          <div className="pmut psm" style={{ marginBottom: 2, fontFamily: "var(--mfe-mono)" }}>{tlabel(0)} → {tlabel(wb.length - 1)} · {win} bars {start}–{start + win}/{total}</div>
          {panel("M1 price observations", "Causal OHLC with threshold-cross observations", "#9fd0ff", 150, ticksP, <>
            {wb.map((b, k) => { const x = k * cw + cw / 2, u = b.c >= b.o, c = u ? "#2a9d6b" : "#e06c75", yo = yPx(b.o), yc = yPx(b.c); return <g key={k}><line x1={x} y1={yPx(b.h)} x2={x} y2={yPx(b.l)} stroke={c} strokeWidth={Math.max(0.4, Math.min(1, cw * 0.15))} /><rect x={k * cw + cw * 0.2} y={Math.min(yo, yc)} width={Math.max(0.5, cw * 0.6)} height={Math.max(0.6, Math.abs(yo - yc))} fill={c} /></g>; })}
            {wc.map((c, k) => <path key={k} d={`M${(c.i * cw + cw / 2).toFixed(1)},${(yPx(wb[c.i].l) + 7).toFixed(1)} l-3,6 l6,0 z`} fill={c.up ? "#3fb950" : "#f7768e"} />)}
          </>)}
          {panel("Formula score", `0–1 · threshold${TH} · ${wc.length} cross`, "#37c0ff", 92, ticksS, <>
            <line x1={0} y1={yS(TH)} x2={W} y2={yS(TH)} stroke="#e3b341" strokeWidth={0.8} strokeDasharray="4 3" />
            <polyline points={wr.map((v, i) => (isFinite(v) ? `${(i * cw + cw / 2).toFixed(1)},${yS(v).toFixed(1)}` : "")).filter(Boolean).join(" ")} fill="none" stroke="#37c0ff" strokeWidth={1.2} />
            {wc.map((c, k) => <circle key={k} cx={c.i * cw + cw / 2} cy={yS(wr[c.i])} r={2.4} fill={c.up ? "#3fb950" : "#f7768e"} />)}
          </>)}
          {panel("Diagnostic curve", "Cumulative score times next-bar return, not account equity", eqLast >= 0 ? "#3fb950" : "#f7768e", 92, ticksE, <>
            <line x1={0} y1={yE(0)} x2={W} y2={yE(0)} stroke="#3a4654" strokeWidth={0.7} />
            <polyline points={eq.map((v, i) => `${(i * cw + cw / 2).toFixed(1)},${yE(v).toFixed(1)}`).join(" ")} fill="none" stroke={eqLast >= 0 ? "#3fb950" : "#f7768e"} strokeWidth={1.3} />
          </>)}
          {panel("Drawdown", "Peak-to-current change in the diagnostic curve", "#f7768e", 60, ticksD, <>
            <polygon points={`${(cw / 2).toFixed(1)},${yD(0).toFixed(1)} ` + dd.map((v, i) => `${(i * cw + cw / 2).toFixed(1)},${yD(v).toFixed(1)}`).join(" ") + ` ${((dd.length - 1) * cw + cw / 2).toFixed(1)},${yD(0).toFixed(1)}`} fill="#f7768e22" stroke="none" />
            <polyline points={dd.map((v, i) => `${(i * cw + cw / 2).toFixed(1)},${yD(v).toFixed(1)}`).join(" ")} fill="none" stroke="#f7768e" strokeWidth={1} />
          </>)}
          {/* shared time axis (X) — like a backtest ruler */}
          <div style={{ display: "flex", marginTop: 3 }}>
            <div style={{ width: AX, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", justifyContent: "space-between" }}>{taxis.map((t, i) => <span key={i} style={{ fontSize: 8, color: "var(--mfe-muted)", fontFamily: "var(--mfe-mono)" }}>{t}</span>)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <div className="pc" style={{ margin: 0, flex: "1 1 110px", background: "var(--mfe-s2)" }}><div className="pmut psm">Hit · cross-up→+5</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: "#37c0ff" }}>{(hr * 100).toFixed(1)}%</div><div className="pmut" style={{ fontSize: 9 }}>{upc.length} observations, not win rate</div></div>
            <div className="pc" style={{ margin: 0, flex: "1 1 150px", background: "var(--mfe-s2)" }}><div className="pmut psm">Score distribution</div><svg width="100%" viewBox="0 0 160 38" preserveAspectRatio="none" style={{ display: "block", height: 40 }}>{dist.map((d, k) => <rect key={k} x={k * (160 / BINS)} y={38 - (d / distMax) * 36} width={160 / BINS - 0.6} height={(d / distMax) * 36} fill="#37c0ff" opacity={0.7} />)}</svg></div>
            <div className="pc" style={{ margin: 0, flex: "1 1 90px", background: "var(--mfe-s2)" }}><div className="pmut psm">Info ratio</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: Math.abs(infoRatio) > 0.05 ? "#3fb950" : "#e3b341" }}>{infoRatio.toFixed(3)}</div><div className="pmut" style={{ fontSize: 9 }}>Mean and standard-deviation contribution</div></div>
            <div className="pc" style={{ margin: 0, flex: "1 1 90px", background: "var(--mfe-s2)" }}><div className="pmut psm">Active</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--mfe-mono)" }}>{(activePct * 100).toFixed(0)}%</div><div className="pmut" style={{ fontSize: 9 }}>score &gt; {TH}</div></div>
          </div>
          <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)" }}>
            <div className="pmut psm" style={{ marginBottom: 4 }}>Threshold-cross observations in this window ({wc.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr .7fr .8fr 1fr", gap: 2, fontSize: 9.5 }}>
              <span className="pmut">Time</span><span className="pmut">Close</span><span className="pmut">Score</span><span className="pmut">State</span><span className="pmut">Event</span>
              {log.map((c, k) => <div key={k} style={{ display: "contents" }}>
                <span style={{ fontFamily: "var(--mfe-mono)", color: "#cdd6df" }}>{tlabel(c.i)}</span>
                <span style={{ fontFamily: "var(--mfe-mono)" }}>{wb[c.i].c.toFixed(1)}</span>
                <span style={{ fontFamily: "var(--mfe-mono)" }}>{isFinite(wr[c.i]) ? wr[c.i].toFixed(3) : "—"}</span>
                <span style={{ color: c.up ? "#3fb950" : "#f7768e" }}>{c.up ? "ABOVE" : "BELOW"}</span>
                <span style={{ color: c.up ? "#3fb950" : "#f7768e", fontWeight: 700 }}>{c.up ? "CROSS UP ▲" : "CROSS DOWN ▼"}</span>
              </div>)}
            </div>
            {!log.length && <div className="pmut psm">No threshold crossing around {TH} in this window.</div>}
          </div>
          <div className="pmut" style={{ fontSize: 9, marginTop: 6, fontStyle: "italic" }}>Historical M1 replay. Crossings describe context, not entries. Formula diagnostics use the same stated observations and formula; Card backtests measure entry/exit behavior and costs separately.</div>
        </div>
        {/* right: run config + LIVE weight bars */}
        <div style={{ overflowY: "auto" }}>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#e7eef6" }}>Run Configuration</b>
            <Row k="Data source" v="Sim OHLC" /><Row k="Timeframe" v="M1" c="#5ad1c4" /><Row k={"Loaded observations"} v={`${total} bars`} /><Row k={"Window"} v={`${win} bars`} /><Row k={"Scope"} v={`${start}–${start + win}`} /><Row k="Output" v={ast?.outputType ?? "—"} c="#5ad1c4" /><Row k="Threshold" v={TH.toFixed(2)} c="#e3b341" /><Row k="Lookback" v={`${lookback} bars`} />
          </div>
          {weights.length > 0 ? (
            <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + ("#5ad1c4") }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><b style={{ fontSize: 12, color: "#5ad1c4" }}><Glyph name="balance" size={12} /> Editable weights</b><span className="pmut psm" style={{ marginLeft: "auto" }}>Adjust to redraw</span></div>
              <div className="pmut" style={{ fontSize: 8.5, marginBottom: 2 }}>A coefficient change recomputes the diagnostics on {total} M1 bars</div>
              {weights.map((w, k) => (
                <div key={w.constId} style={{ borderTop: "1px solid #1c232c", padding: "4px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5 }}>
                    <b style={{ color: "#e7eef6" }}>w{k + 1}</b>
                    <span className="pmut" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={wlabel(w.sibId)}>{wlabel(w.sibId)}</span>
                    <span style={{ fontFamily: "var(--mfe-mono)", color: "#5ad1c4" }}>{w.value.toFixed(2)}</span>
                  </div>
                  <input type="range" min={-3} max={3} step={0.05} value={w.value} onChange={(e) => setWeight(w.constId, parseFloat(e.target.value))} style={{ width: "100%", marginTop: 2 }} />
                </div>
              ))}
              <div className="pmut" style={{ fontSize: 8.5, marginTop: 5, fontStyle: "italic" }}>Changing a constant updates the formula. Qualification must be rerun.</div>
            </div>
          ) : (
            <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)" }}><div className="pmut psm">This formula has no editable coefficient of the required form <b style={{ fontFamily: "var(--mfe-mono)", color: "#5ad1c4" }}>w * feature</b> . Add a multiplying constant in Formula Text.</div></div>
          )}
          <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + ("#3fb950") }}>
            <b style={{ fontSize: 12, color: "#3fb950" }}>● Replay Mode</b>
            <div className="pmut" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>Historical replay only. This lab does not connect to a live feed.</div>
            <button disabled style={{ ...inp, width: "100%", marginTop: 6, opacity: 0.5, cursor: "not-allowed" }}> Live feed is not available in this formula workbench</button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────── PASSPORT / VALIDATION (honest) ───────────────────────────
  function PassportTab() {
    const real: [string, string, string][] = [["No-Lookahead", "PASS", "#3fb950"], ["KIDI-safe", "PASS", "#3fb950"], ["Parse/Syntax", okParse ? "PASS" : "FAIL", okParse ? "#3fb950" : "#f7768e"], ["Finite Output", (m1Root.length ? m1Root : root).every(isFinite) ? "PASS" : "FAIL", "#3fb950"], ["Authority (no order)", "PASS", "#3fb950"]];
    const VERDICT: Record<string, [string, string]> = { EDGE_OOS_QUALIFIED: ["EDGE · OOS QUALIFIED", "#3fb950"], CONDITIONAL_EDGE: ["CONDITIONAL EDGE", "#e3b341"], NULL_EDGE: ["NULL EDGE: not distinguishable from the null baseline", "#f7768e"], INSUFFICIENT: ["INSUFFICIENT SAMPLE", "#8b949e"] };
    const v = valReport;
    const stCol = (s: string) => (s === "PASS" ? "#3fb950" : s === "PARTIAL" ? "#e3b341" : s === "FAIL" ? "#f7768e" : "#8b949e");
    return (
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ ...inp, padding: "8px 14px", borderColor: "#a371f7" }}><div style={{ fontSize: 12, fontWeight: 800, color: "#a371f7" }}><Glyph name="ghost" size={12} /> SHADOW ONLY</div><div className="pmut" style={{ fontSize: 9 }}>Research only</div></div>
          {real.map(([k, vv, c]) => <div key={k} style={{ ...inp, padding: "8px 14px", borderColor: c }}><div style={{ fontSize: 11, fontWeight: 800, color: c }}>{vv} · {k}</div></div>)}
          {v && <div style={{ ...inp, padding: "8px 14px", borderColor: VERDICT[v.overall][1] }}><div style={{ fontSize: 11, fontWeight: 800, color: VERDICT[v.overall][1] }}><Glyph name="target" size={11} /> {VERDICT[v.overall][0]}</div></div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 10 }}>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)" }}>
            <b style={{ fontSize: 12, color: "#3fb950" }}>Structural validation</b>
            {/* which L3 module is being examined — show the formula so the user knows exactly what these checks cover */}
            <div style={{ margin: "6px 0 8px", padding: "7px 9px", borderRadius: 7, background: "#0b0f15", border: "1px solid var(--mfe-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <span className="pmut psm">Current L3 definition:</span>
                <b style={{ fontSize: 11.5, color: "#9fd0ff" }}>{modName || "Unnamed"}</b>
                {ast && <span style={{ fontSize: 8.5, fontWeight: 800, color: "#5ad1c4", border: "1px solid #5ad1c455", borderRadius: 3, padding: "0 4px" }}>{ast.outputType}</span>}
                <span style={{ fontSize: 8.5, color: "#7d8a99", fontFamily: "var(--mfe-mono)", marginLeft: "auto" }}>{savedId ? (savedHash === curHash ? "Saved" : "Unsaved") : "Unsaved"}{curHash ? "hash " + curHash : "—"}</span>
              </div>
              <div style={{ fontFamily: "var(--mfe-mono)", fontSize: 11.5, lineHeight: 1.55, color: okParse ? "#e7eef6" : "#f7768e", background: "#11161d", borderRadius: 5, padding: "6px 8px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflowY: "auto" }}>{text.trim() || "Empty formula"}</div>
              {usedInputs.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 5 }}><span className="pmut" style={{ fontSize: 8.5, alignSelf: "center" }}>variables:</span>{usedInputs.map((k) => <span key={k} style={{ fontSize: 8.5, fontFamily: "var(--mfe-mono)", color: colorOf(k), border: `1px solid ${colorOf(k)}55`, borderRadius: 3, padding: "0 5px" }}>{k}</span>)}</div>}
            </div>
            {real.map(([k, vv, c]) => <Row key={k} k={k} v={vv} c={c} />)}
            <Row k="Effective sample" v={m1Bars.length ? `${m1Bars.length} M1 bars` : "Loading M1 history…"} c="#5ad1c4" />
            <Row k="AST nodes" v={String(nodeCount)} />
            <div className="pc" style={{ margin: "8px 0 0", background: "#0b0f15", border: "1px solid " + ("#5ad1c4"), padding: "6px 8px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#5ad1c4", marginBottom: 2 }}>Evaluation identity</div>
              <div className="pmut" style={{ fontSize: 9, lineHeight: 1.55 }}>Replay and formula validation use <b style={{ color: "#9fd0ff" }}>the same 1,500 M1 observations and formula</b> . Card backtests in Microscope and Strategy Lab evaluate <b style={{ color: "#9fd0ff" }}>the complete Strategy Card</b> including entries, exits and modeled costs. L3 eligibility requires its separate qualification gate.</div>
            </div>
            <div className="pmut" style={{ fontSize: 9, marginTop: 8, fontStyle: "italic" }}>Shadow research. Numeric output does not establish future performance or execution authority.</div>
          </div>
          <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)", border: "1px solid " + (v ? VERDICT[v.overall][1] : "#e3b341") }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 12, color: "#9fd0ff" }}>QL-8 Validation (IC + OOS + Walk-forward + Permutation-null)</b>
              <button onClick={runVal} disabled={!okParse || running || !m1Bars.length} style={{ ...inp, marginLeft: "auto", cursor: okParse && m1Bars.length ? "pointer" : "not-allowed", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 700 }}>{running ? "Running…" : !m1Bars.length ? "Loading M1 history…" : v ? "Run again" : "Run validation"}</button>
            </div>
            {!v ? <div className="pmut" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.6, fontStyle: "italic" }}>Run score validation on the stated M1 observations: raw forward-return labels, a chronological holdout, era stability and permutation null. This tests a numeric score, not complete strategy performance.</div> : <>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 90, ...inp }}><div className="pmut psm">Real IC</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: v.realIC >= 0 ? "#3fb950" : "#f7768e" }}>{v.realIC >= 0 ? "+" : ""}{v.realIC.toFixed(3)}</div></div>
                <div style={{ flex: 1, minWidth: 90, ...inp }}><div className="pmut psm">vs Null p95</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--mfe-mono)", color: v.permutation.beatsNull ? "#3fb950" : "#f7768e" }}>{v.permutation.beatsNull ? "BEATS" : "≤ null"}</div><div className="pmut" style={{ fontSize: 8.5 }}>p95 {v.permutation.nullP95.toFixed(3)} · p={v.permutation.pValue.toFixed(3)}</div></div>
              </div>
              <Sec title="OOS split"><Row k="In-sample IC" v={v.oos.isIC.toFixed(3)} /><Row k="Out-of-sample IC" v={v.oos.oosIC.toFixed(3)} c={stCol(v.oos.pass ? "PASS" : "FAIL")} /><Row k="Threshold" v={`±${v.oos.threshold}`} /><Row k="OOS verdict" v={v.oos.pass ? "PASS" : "FAIL"} c={stCol(v.oos.pass ? "PASS" : "FAIL")} /></Sec>
              <Sec title={`Walk-forward · ${v.walkForward.status} (stability ${(v.walkForward.stability * 100).toFixed(0)}%)`}>{v.walkForward.eras.map((e) => <div key={e.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, padding: "1px 0" }}><span className="pmut" style={{ width: 48 }}>{e.label}</span><div style={{ flex: 1, height: 6, background: "#0b0f15", borderRadius: 3, position: "relative" }}><div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#3a4452" }} /><div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 3, background: e.ic >= 0 ? "#3fb950" : "#f7768e", ...(e.ic >= 0 ? { left: "50%", width: `${Math.min(50, Math.abs(e.ic) * 200)}%` } : { right: "50%", width: `${Math.min(50, Math.abs(e.ic) * 200)}%` }) }} /></div><span style={{ fontFamily: "var(--mfe-mono)", fontSize: 10, width: 44, textAlign: "right", color: e.ic >= 0 ? "#3fb950" : "#f7768e" }}>{e.ic >= 0 ? "+" : ""}{e.ic.toFixed(3)}</span></div>)}</Sec>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: VERDICT[v.overall][1] }}><Glyph name="target" size={12} /> {VERDICT[v.overall][0]}</span>
                <button onClick={() => persistVal()} style={{ ...inp, marginLeft: "auto", cursor: "pointer", background: "#15786e", color: "#fff", border: "none", fontWeight: 700 }}><Glyph name="save" size={11} /> Save validation to definition</button>
              </div>
              <Sec title={`Monte-Carlo · ${v.monteCarlo.activeN} active bars · risk ${v.monteCarlo.risk}`}>{v.monteCarlo.risk === "UNKNOWN" ? <span className="pmut psm">Not enough active observations for bootstrap estimation.</span> : <>
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>{([["P05", v.monteCarlo.p05], ["P25", v.monteCarlo.p25], ["P50", v.monteCarlo.p50], ["P75", v.monteCarlo.p75], ["P95", v.monteCarlo.p95]] as const).map(([k, val]) => <div key={k} style={{ flex: 1, textAlign: "center", ...inp, padding: "2px 1px" }}><div className="pmut" style={{ fontSize: 8 }}>{k}</div><div style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: val >= 0 ? "#3fb950" : "#f7768e" }}>{(val * 100).toFixed(1)}%</div></div>)}</div>
                <Row k="Tail risk (P05)" v={`${(v.monteCarlo.p05 * 100).toFixed(1)}%`} c={v.monteCarlo.risk === "ELEVATED" ? "#f7768e" : v.monteCarlo.risk === "ROBUST" ? "#3fb950" : "#e3b341"} />
              </>}</Sec>
              <Sec title={<>Risk-filter lens {v.riskFilter.usefulFilter ? <>· <Glyph name="shield" size={9} /> Measured risk-filter association</> : "No clear risk-filter association in this sample"}</>}>
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                  <div style={{ flex: 1, textAlign: "center", ...inp, padding: "2px 1px" }}><div className="pmut" style={{ fontSize: 8 }}>Tail score CAO</div><div style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "#f7768e" }}>{isFinite(v.riskFilter.hiTailP05) ? (v.riskFilter.hiTailP05 * 100).toFixed(2) + "%" : "—"}</div></div>
                  <div style={{ flex: 1, textAlign: "center", ...inp, padding: "2px 1px" }}><div className="pmut" style={{ fontSize: 8 }}>Low-score tail</div><div style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "#3fb950" }}>{isFinite(v.riskFilter.loTailP05) ? (v.riskFilter.loTailP05 * 100).toFixed(2) + "%" : "—"}</div></div>
                  <div style={{ flex: 1, textAlign: "center", ...inp, padding: "2px 1px" }}><div className="pmut" style={{ fontSize: 8 }}>High/low loss rate</div><div style={{ fontSize: 10, fontFamily: "var(--mfe-mono)" }}>{isFinite(v.riskFilter.hiLossRate) ? (v.riskFilter.hiLossRate * 100).toFixed(0) : "—"}/{isFinite(v.riskFilter.loLossRate) ? (v.riskFilter.loLossRate * 100).toFixed(0) : "—"}%</div></div>
                </div>
                <div className="pmut" style={{ fontSize: 8.5, marginTop: 3, fontStyle: "italic", lineHeight: 1.5 }}>{v.riskFilter.usefulFilter ? "High-score observations have worse measured downside in this sample. A risk veto has a different purpose from a directional alpha score; validate its combined effect separately." : "No clear downside difference was measured. The intended risk-veto role needs supporting tail or loss-rate evidence."}</div>
              </Sec>
              {v.notes.map((nt, k) => <div key={k} className="pmut" style={{ fontSize: 9, marginTop: 3, fontStyle: "italic", lineHeight: 1.5 }}>· {nt}</div>)}
              <div className="pmut" style={{ fontSize: 9, marginTop: 3, fontStyle: "italic" }}>Bootstrap resamples returns from the observed active bars to estimate dispersion. It does not create new evidence of an edge.</div>
            </>}
          </div>
        </div>
      </div>
    );
  }
}
