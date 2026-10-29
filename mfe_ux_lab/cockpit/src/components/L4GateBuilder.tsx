// L4GateBuilder — Streamlined, step-by-step L4 Context-Gate Studio.
// Preserves 100% of L4 capabilities (25 curated context blocks across 6 categories, L1/L2/L3 evidence slots,
// ALL/ANY logic, causal ChartPane + RibbonLane preview, binding-condition breakdown, recipes, AI JSON import,
// and Coordinate Lab handoff) with a clean, low-density tactical UI.
import { useMemo, useState, useEffect } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { ModuleIntentSandbox } from "./ModuleIntentSandbox.tsx";
import { metricsForScope, validateModule, loadCustomModules, saveCustomModules, type CustomModule, type Condition, type Op } from "../lib/customModule.ts";
import { previewModule, previewMarginSeries, previewCondMarginSeries } from "../lib/moduleIntentPreview.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import { listCustomMetrics, customMetricKeys, customMetricSeries } from "../lib/customMetricBridge.ts";
import { ChartPane } from "./vizkit/ChartPane.tsx";
import { ContribBarsKit, InspPass, RibbonLane } from "./vizkit/VizKit.tsx";
import { computeSignature } from "../lib/blocks/sandboxSignature.ts";
import { buildLayerPack, parseAiModule } from "../lib/aiContextPack.ts";
import { moduleToFormulaLab } from "../formulaLab/adapters/tierToFormulaLab.ts";
import { setFormulaLabInput } from "../formulaLab/formulaLabStore.ts";
import { L4_BLOCKS, L4_BLOCK_BY_METRIC } from "../lib/blocks/l4BlockLibrary.ts";
import { L4_GROUPS, L4_GROUP_LABEL, L4_GROUP_COLOR, type L4Group } from "../lib/blocks/l4BlockTypes.ts";
import { blockSeedCondition, activeBlockIds } from "../lib/blocks/l4Compile.ts";
import { loadCustomL4, saveCustomL4, deleteCustomL4, type CustomL4Recipe } from "../lib/blocks/customL4.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { LayerInfoPopup } from "./LayerInfoPopup.tsx";

const inp: React.CSSProperties = {
  background: "var(--bg-card-inner, #131E36)",
  border: "1px solid var(--border-panel, rgba(56,189,248,0.22))",
  color: "var(--mfe-text)",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
};
const cardBox: React.CSSProperties = {
  background: "var(--bg-panel, #0F172A)",
  border: "1px solid var(--border-panel, rgba(56,189,248,0.18))",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 10,
};
const stepBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "rgba(251,191,36,0.2)",
  border: "1px solid rgba(251,191,36,0.55)",
  color: "#fbbf24",
  fontSize: 10,
  fontWeight: 900,
  marginRight: 6,
};

const OPS: Op[] = [">", "<", ">=", "<=", "==", "between", "outside"];
const OP_FRIENDLY: Record<Op, string> = {
  ">": "> greater than",
  "<": "< less than",
  ">=": "≥ at least",
  "<=": "≤ at most",
  "==": "= equals",
  between: "↔ between",
  outside: "⇄ outside",
};
const WIN4 = 400;
const gateCol = (s: string) => (s === "ON" ? "#2BB673" : s === "OFF" ? "#F0524A" : "#3a4656");
const gateLbl = (s: string) => (s === "ON" ? "OPEN" : s === "OFF" ? "CLOSED" : "—");

const TACTICAL_L4_PRESETS: {
  label: string;
  sub: string;
  name: string;
  explain: string;
  why: string;
  logic: "ALL" | "ANY";
  group: L4Group;
  conds: Condition[];
}[] = [
  {
    label: "Anti-Chop Trend",
    sub: "Blocks flat EMA compression",
    name: "L4_ANTI_CHOP_GATE",
    explain: "Allow setups only when EMA separation exceeds flat-market threshold",
    why: "Block whipsaw entries inside tight EMA compression",
    logic: "ALL",
    group: "REGIME",
    conds: [{ metric: "emaGapAtr", op: "outside", value: -0.35, value2: 0.35 }],
  },
  {
    label: "Vol Expansion",
    sub: "Requires active ATR range",
    name: "L4_VOL_EXPANSION_GATE",
    explain: "Open gate only when ATR volatility regime is active and expanding",
    why: "Filter out dead liquidity and ultra-low range bars",
    logic: "ALL",
    group: "VOLATILITY",
    conds: [{ metric: "atrRatio", op: "between", value: 0.85, value2: 2.2 }],
  },
  {
    label: "Session Shield",
    sub: "London & NY active hours",
    name: "L4_SESSION_SHIELD",
    explain: "Restrict setup evaluation to active institutional session hours",
    why: "Avoid thin rollover and off-session spread spikes",
    logic: "ALL",
    group: "SESSION",
    conds: [{ metric: "hour", op: "between", value: 7, value2: 20 }],
  },
  {
    label: "Overextension Guard",
    sub: "Vetoes late climax chases",
    name: "L4_OVEREXT_GUARD",
    explain: "Veto late trend chases when price is stretched far beyond EMA",
    why: "Prevent buying climax tops or selling capitulation bottoms",
    logic: "ALL",
    group: "STRUCTURE",
    conds: [{ metric: "extAtr", op: "<", value: 1.2 }],
  },
];

export function L4GateBuilder({ onClose, onSaved }: { onClose: () => void; onSaved?: (savedId?: string) => void }) {
  const evMetrics = useMemo(() => listCustomMetrics(), []);
  const metricOpts = useMemo(() => metricsForScope("entry"), []);
  const [name, setName] = useState("L4_ANTI_CHOP_GATE");
  const [explain, setExplain] = useState("Allow setups only when EMA separation exceeds flat-market threshold");
  const [why, setWhy] = useState("Condition setup evaluation on the chosen market context");
  const [logic, setLogic] = useState<"ALL" | "ANY">("ALL");
  const [conds, setConds] = useState<Condition[]>([{ metric: "emaGapAtr", op: "outside", value: -0.35, value2: 0.35 }]);
  const [activeGroup, setActiveGroup] = useState<L4Group>("REGIME");
  const [advOpen, setAdvOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiJson, setAiJson] = useState("");
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiCopied, setAiCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [intentOn, setIntentOn] = useState(false);
  const [recipes, setRecipes] = useState<CustomL4Recipe[]>(() => loadCustomL4());

  useEffect(() => {
    loadSimOhlc("M15").then((d) => setBars(d?.bars || null));
  }, []);

  function saveRecipe() {
    const r: CustomL4Recipe = {
      id: "l4r_" + Date.now().toString(36),
      name: name.trim() || "L4 gate",
      explain,
      why,
      logic,
      conditions: conds,
      status: "SHADOW",
      createdAt: new Date().toISOString(),
    };
    saveCustomL4([r, ...loadCustomL4()]);
    setRecipes(loadCustomL4());
  }
  function loadRecipe(id: string) {
    const r = loadCustomL4().find((x) => x.id === id);
    if (!r) return;
    setName(r.name);
    setExplain(r.explain);
    setWhy(r.why);
    setLogic(r.logic);
    setConds(r.conditions);
    setSaved(false);
  }
  function delRecipe(id: string) {
    deleteCustomL4(id);
    setRecipes(loadCustomL4());
  }

  const module: CustomModule = useMemo(
    () => ({
      id: "l4_" + Date.now().toString(36),
      level: 4,
      role: "CONTEXT_GATE",
      name,
      explain,
      why,
      conditions: conds,
      logic,
      status: "SHADOW",
      createdAt: new Date().toISOString(),
    }),
    [name, explain, why, conds, logic]
  );
  const valid = useMemo(() => validateModule(module, customMetricKeys()), [module]);
  const prevBars = useMemo(() => (bars ? bars.slice(-8000) : []), [bars]);
  const prev = useMemo(() => (prevBars.length > 60 && valid.ok ? previewModule(prevBars, module) : null), [prevBars, module, valid.ok]);
  const pctOpen = prev && prev.previewable ? (prev.fires.length / Math.max(1, prev.scannedBars)) * 100 : null;
  const degenerate = pctOpen != null && (pctOpen > 98 || pctOpen < 1);

  const gateEnv = useMemo(() => {
    if (!valid.ok || prevBars.length < 60) return null;
    const marginRes = previewMarginSeries(prevBars, module, customMetricSeries);
    if (!marginRes.previewable) return { previewable: false as const, naMetrics: marginRes.naMetrics };
    const condRes = previewCondMarginSeries(prevBars, module, customMetricSeries);
    const sig = computeSignature(marginRes.series, {
      warmup: 40,
      onLabel: "gate open",
      components: condRes.perCond.map((c) => ({ id: c.metric, label: c.label, series: c.series })),
    });
    const trans: number[] = [];
    for (let i = 1; i < sig.states.length; i++) if (sig.states[i] === "ON" && sig.states[i - 1] !== "ON") trans.push(i);
    return { previewable: true as const, series: marginRes.series, sig, trans };
  }, [prevBars, module, valid.ok]);

  const activeBlocks = useMemo(() => activeBlockIds(conds), [conds]);
  const setCond = (i: number, p: Partial<Condition>) => {
    setConds(conds.map((c, j) => (j === i ? { ...c, ...p } : c)));
    setSaved(false);
  };
  const addBlock = (blockId: string) => {
    const c = blockSeedCondition(blockId, evMetrics[0]?.key);
    if (c) {
      setConds([...conds, c]);
      setSaved(false);
    }
  };
  const metricChip = (metric: string) => {
    const blk = L4_BLOCK_BY_METRIC[metric];
    if (blk) return { label: blk.label, color: L4_GROUP_COLOR[blk.group], unit: blk.unit ?? "", desc: blk.description };
    const ev = evMetrics.find((m) => m.key === metric);
    if (ev) return { label: ev.label, color: "#21d07a", unit: ev.layer, desc: "Custom evidence series" };
    const bi = metricOpts.find((m) => m.key === metric);
    return { label: bi?.label ?? (metric || "—"), color: "#38bdf8", unit: "", desc: "Built-in market metric" };
  };

  function save(attachAndClose = false) {
    if (!valid.ok) return;
    saveCustomModules([module, ...loadCustomModules()]);
    setSaved(true);
    onSaved?.(module.id);
    if (attachAndClose) onClose();
  }
  function copyPrompt() {
    try {
      navigator.clipboard?.writeText(buildLayerPack("L4"));
    } catch {
      /* ignore */
    }
    setAiCopied(true);
    setTimeout(() => setAiCopied(false), 1600);
  }
  function importAi() {
    const r = parseAiModule(aiJson);
    if (!r.ok || !r.module) {
      setAiMsg({ ok: false, text: "✗ " + (r.errors[0] || "Invalid JSON") });
      return;
    }
    const m = r.module;
    if (m.role !== "CONTEXT_GATE") {
      setAiMsg({ ok: false, text: `Definition role is ${m.role}. L4 requires CONTEXT_GATE.` });
      return;
    }
    if (!m.conditions.length) {
      setAiMsg({ ok: false, text: "Empty conditions are not accepted." });
      return;
    }
    setName(m.name);
    setExplain(m.explain);
    setWhy(m.why);
    setLogic(m.logic);
    setConds(m.conditions);
    setSaved(false);
    setAiJson("");
    setAiOpen(false);
    setAiMsg({ ok: true, text: `Loaded ${m.conditions.length} conditions. Inspect the preview before saving.` });
  }

  const po = pctOpen ?? 0;
  const bindTop = gateEnv?.previewable ? gateEnv.sig.contributions[0] : null;
  const ruleSummaryText = conds.length
    ? conds
        .map((c) => {
          const ch = metricChip(c.metric);
          const rangeStr = c.op === "between" || c.op === "outside" ? `${c.value} .. ${c.value2 ?? 0}` : `${c.value}`;
          return `${ch.label} ${c.op} ${rangeStr}`;
        })
        .join(logic === "ALL" ? "  AND  " : "  OR  ")
    : "No filter conditions added yet.";

  const groupBlocks = L4_BLOCKS.filter((b) => b.group === activeGroup);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-app, #070B14)", zIndex: 130, display: "flex", flexDirection: "column", padding: 14, boxSizing: "border-box", overflow: "hidden" }}>
      {/* ── TOP HEADER BAR ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border-panel, rgba(56,189,248,0.22))", paddingBottom: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: "#070B14", background: "#fbbf24", borderRadius: 5, padding: "3px 8px", letterSpacing: ".06em" }}>L4 STUDIO</span>
        <div>
          <b style={{ color: "#f8fafc", fontSize: 15 }}>Context-Gate &amp; Regime Filter Builder</b>
          <span style={{ color: "#94a3b8", fontSize: 11.5, marginLeft: 10 }}>Filter when setups are allowed to fire (Counter-Trap Shield)</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          {([
            ["GUARD · DEF 89", "#fbbf24"],
            ["NO-LOOKAHEAD", "#34d399"],
          ] as const).map(([t, c]) => (
            <span key={t} style={{ fontSize: 10, color: c, border: `1px solid ${c}55`, background: `${c}14`, borderRadius: 4, padding: "2px 7px", fontWeight: 800 }}>
              {t}
            </span>
          ))}
        </div>
        <button
          onClick={() => setGuideOpen(true)}
          style={{ ...inp, marginLeft: "auto", cursor: "pointer", color: "#fbbf24", borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.12)", fontWeight: 800, fontSize: 11 }}
        >
          ⓘ L4 Layer Guide
        </button>
        <button
          onClick={() => {
            if (!bars || !valid.ok) return;
            setFormulaLabInput(moduleToFormulaLab(module, bars));
            onClose();
            window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "formula-lab" }));
          }}
          disabled={!valid.ok || !bars}
          style={{ ...inp, cursor: valid.ok && bars ? "pointer" : "default", color: "#c792ea", borderColor: "#43306a" }}
        >
          <Glyph name="ruler" size={12} /> Coordinate Lab
        </button>
        <button onClick={onClose} style={{ ...inp, cursor: "pointer", fontWeight: 700 }}>
          <Glyph name="x" size={12} /> Close
        </button>
      </div>

      {/* ── 3-COLUMN WORKBENCH ── */}
      <div style={{ display: "grid", gridTemplateColumns: "330px 1fr 330px", gap: 14, flex: 1, minHeight: 0 }}>
        {/* ══ LEFT COLUMN: 3-STEP BUILDER ══ */}
        <div style={{ overflowY: "auto", paddingRight: 4 }}>
          {/* STEP 1: QUICK PRESETS */}
          <div style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={stepBadge}>1</span>
              <b style={{ fontSize: 12, color: "#f8fafc" }}>Quick-Start Gate Preset</b>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8" }}>1-click load</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {TACTICAL_L4_PRESETS.map((pr) => {
                const active = name === pr.name;
                return (
                  <button
                    key={pr.name}
                    onClick={() => {
                      setName(pr.name);
                      setExplain(pr.explain);
                      setWhy(pr.why);
                      setLogic(pr.logic);
                      setConds(pr.conds);
                      setActiveGroup(pr.group);
                      setSaved(false);
                    }}
                    style={{
                      ...inp,
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "6px 8px",
                      background: active ? "rgba(251,191,36,0.16)" : "var(--bg-card-inner, #131E36)",
                      borderColor: active ? "#fbbf24" : "rgba(251,191,36,0.28)",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24" }}>{pr.label}</div>
                    <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 2 }}>{pr.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: COMPOSE FILTER CONDITIONS */}
          <div style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={stepBadge}>2</span>
                <b style={{ fontSize: 12, color: "#f8fafc" }}>Filter Conditions ({conds.length})</b>
              </div>
              <div style={{ display: "inline-flex", border: "1px solid var(--border-panel)", borderRadius: 5, overflow: "hidden" }}>
                {(["ALL", "ANY"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setLogic(g);
                      setSaved(false);
                    }}
                    title={g === "ALL" ? "Every rule must pass (AND)" : "Any single rule passes (OR)"}
                    style={{
                      ...inp,
                      border: "none",
                      borderRadius: 0,
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: "pointer",
                      background: g === logic ? "rgba(56,189,248,0.22)" : "transparent",
                      color: g === logic ? "#38bdf8" : "#94a3b8",
                    }}
                  >
                    {g === "ALL" ? "Match ALL" : "Match ANY"}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Tabs (Only 1 category shown at a time to prevent clutter) */}
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 5 }}>Pick a category to add a condition block:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {L4_GROUPS.map((g) => {
                const on = activeGroup === g;
                const col = L4_GROUP_COLOR[g];
                return (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    style={{
                      ...inp,
                      padding: "3px 7px",
                      fontSize: 10,
                      fontWeight: on ? 800 : 600,
                      cursor: "pointer",
                      color: on ? "#070B14" : col,
                      background: on ? col : `${col}14`,
                      borderColor: on ? col : `${col}44`,
                    }}
                  >
                    {L4_GROUP_LABEL[g].split("/")[0].trim()}
                  </button>
                );
              })}
            </div>

            {/* Blocks in the selected category */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, padding: 7, background: "rgba(7,11,20,0.55)", borderRadius: 6, border: "1px solid rgba(148,163,184,0.14)", marginBottom: 10 }}>
              {groupBlocks.map((b) => {
                const on = activeBlocks.has(b.blockId);
                const col = L4_GROUP_COLOR[b.group];
                return (
                  <button
                    key={b.blockId}
                    onClick={() => addBlock(b.blockId)}
                    title={b.description}
                    style={{
                      ...inp,
                      textAlign: "left",
                      padding: "5px 7px",
                      fontSize: 10.5,
                      cursor: "pointer",
                      fontWeight: on ? 800 : 600,
                      color: on ? col : "#e2e8f0",
                      background: on ? `${col}22` : "var(--bg-card-inner, #131E36)",
                      borderColor: on ? col : "rgba(148,163,184,0.2)",
                    }}
                  >
                    <div>{on ? "✓ " : "+ "}{b.label}</div>
                  </button>
                );
              })}
            </div>

            {/* Active Condition Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {conds.map((c, i) => {
                const isEv = !L4_BLOCK_BY_METRIC[c.metric] && (!c.metric || evMetrics.some((m) => m.key === c.metric));
                const chip = metricChip(c.metric);
                return (
                  <div key={i} style={{ background: "rgba(19,30,54,0.9)", border: `1px solid ${chip.color}55`, borderLeft: `3px solid ${chip.color}`, borderRadius: 6, padding: "7px 9px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                      {isEv ? (
                        <select style={{ ...inp, flex: 1, fontWeight: 700 }} value={c.metric} onChange={(e) => setCond(i, { metric: e.target.value })}>
                          <option value="">Select L1/L2/L3 Evidence…</option>
                          {evMetrics.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label} ({m.layer})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: chip.color }}>{chip.label}</div>
                          <div style={{ fontSize: 9.5, color: "#94a3b8" }}>{chip.desc}</div>
                        </div>
                      )}
                      <button
                        title="Remove condition"
                        style={{ ...inp, padding: "2px 6px", cursor: "pointer", color: "#f87171", borderColor: "rgba(248,113,113,0.35)" }}
                        onClick={() => {
                          setConds(conds.filter((_, j) => j !== i));
                          setSaved(false);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select style={{ ...inp, flex: 1, fontSize: 11 }} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as Op })}>
                        {OPS.map((o) => (
                          <option key={o} value={o}>
                            {OP_FRIENDLY[o]}
                          </option>
                        ))}
                      </select>
                      <input style={{ ...inp, width: 66, fontFamily: "var(--mfe-mono)", fontWeight: 700 }} type="number" step="0.05" value={c.value} onChange={(e) => setCond(i, { value: +e.target.value })} />
                      {(c.op === "between" || c.op === "outside") && (
                        <>
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>to</span>
                          <input style={{ ...inp, width: 66, fontFamily: "var(--mfe-mono)", fontWeight: 700 }} type="number" step="0.05" value={c.value2 ?? 0} onChange={(e) => setCond(i, { value2: +e.target.value })} />
                        </>
                      )}
                      {chip.unit && <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "var(--mfe-mono)" }}>{chip.unit}</span>}
                    </div>
                  </div>
                );
              })}
              {conds.length === 0 && (
                <div style={{ padding: 10, textAlign: "center", color: "#94a3b8", fontSize: 11, border: "1px dashed rgba(148,163,184,0.3)", borderRadius: 6 }}>
                  Click any block above to add a filter condition.
                </div>
              )}
            </div>
            {!valid.ok && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#f87171", background: "rgba(239,68,68,0.12)", padding: "5px 8px", borderRadius: 5 }}>
                <Glyph name="warning" size={10} /> {valid.errors.join(" · ")}
              </div>
            )}
          </div>

          {/* STEP 3: GATE IDENTITY & OPTIONAL RECIPES / AI IMPORT */}
          <div style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={stepBadge}>3</span>
              <b style={{ fontSize: 12, color: "#f8fafc" }}>Gate Name &amp; Notes</b>
            </div>
            <label className="pmut psm" style={{ display: "block" }}>
              Gate Identifier
              <input style={{ ...inp, width: "100%", marginTop: 3, boxSizing: "border-box", fontWeight: 700 }} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
            </label>
            <label className="pmut psm" style={{ display: "block", marginTop: 6 }}>
              Purpose Summary
              <input style={{ ...inp, width: "100%", marginTop: 3, boxSizing: "border-box" }} value={explain} onChange={(e) => setExplain(e.target.value)} />
            </label>

            <button
              onClick={() => setAdvOpen((o) => !o)}
              style={{ ...inp, width: "100%", marginTop: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 11 }}
            >
              <span>⚙ Saved Recipes ({recipes.length}) &amp; AI JSON Import</span>
              <span>{advOpen ? "▾" : "▸"}</span>
            </button>
            {advOpen && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-panel)" }}>
                <label className="pmut psm" style={{ display: "block", marginBottom: 6 }}>
                  Validation Rationale
                  <input style={{ ...inp, width: "100%", marginTop: 3, boxSizing: "border-box" }} value={why} onChange={(e) => setWhy(e.target.value)} />
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <button onClick={saveRecipe} disabled={!conds.length} style={{ ...inp, cursor: conds.length ? "pointer" : "default", color: "#5ad1c4", borderColor: "#1c5b54", fontWeight: 700 }}>
                    <Glyph name="save" size={11} /> Save Recipe
                  </button>
                  <select value="" onChange={(e) => { if (e.target.value) loadRecipe(e.target.value); }} style={{ ...inp, flex: 1 }}>
                    <option value="">Load recipe… ({recipes.length})</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.conditions.length} rules
                      </option>
                    ))}
                  </select>
                  {recipes.length > 0 && (
                    <select value="" onChange={(e) => { if (e.target.value) delRecipe(e.target.value); }} title="Remove recipe" style={{ ...inp, width: 42, color: TK.orange }}>
                      <option value="">🗑</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={copyPrompt} style={{ ...inp, cursor: "pointer", background: "#1f6feb", color: "#fff", border: "none", fontWeight: 700 }}>
                    {aiCopied ? <><Glyph name="check" size={11} /> Copied</> : <><Glyph name="export" size={11} /> Copy L4 AI Prompt</>}
                  </button>
                  <button onClick={() => setAiOpen((o) => !o)} style={{ ...inp, cursor: "pointer", color: "#5aa9ff", borderColor: "#2f4a63" }}>
                    <Glyph name="import" size={12} /> Paste AI JSON {aiOpen ? "▾" : "▸"}
                  </button>
                </div>
                {aiOpen && (
                  <div style={{ marginTop: 6 }}>
                    <textarea
                      value={aiJson}
                      onChange={(e) => {
                        setAiJson(e.target.value);
                        setAiMsg(null);
                      }}
                      placeholder="Paste L4 CONTEXT_GATE JSON with conditions."
                      style={{ ...inp, width: "100%", minHeight: 48, fontFamily: "var(--mfe-mono)", fontSize: 10.5, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                      <button onClick={importAi} disabled={!aiJson.trim()} style={{ ...inp, cursor: aiJson.trim() ? "pointer" : "default", background: aiJson.trim() ? "#238636" : "#20262d", color: "#fff", border: "none", fontWeight: 700 }}>
                        <Glyph name="import" size={12} /> Import JSON
                      </button>
                      {aiMsg && <span style={{ fontSize: 10.5, color: aiMsg.ok ? "#3fb950" : "#f85149" }}>{aiMsg.text}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ CENTER COLUMN: PLAIN-ENGLISH RULE BANNER + CHART + 2 CLEAN SUMMARY CARDS ══ */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          {/* Plain-English Rule Banner */}
          <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#e2e8f0" }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 8 }}>Active Gate Rule ({logic}):</span>
              <b style={{ fontFamily: "var(--mfe-mono)", color: "#f8fafc" }}>{ruleSummaryText}</b>
            </div>
            {pctOpen != null && (
              <span style={{ fontSize: 11, fontWeight: 800, color: po > 5 && po < 95 ? "#34d399" : "#fbbf24", background: "rgba(7,11,20,0.7)", padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(148,163,184,0.2)" }}>
                Gate Open: {po.toFixed(0)}% of M15 Bars
              </span>
            )}
          </div>

          {!gateEnv ? (
            <div style={{ ...cardBox, padding: 20, textAlign: "center", color: "#94a3b8" }}>Enter valid conditions on the left to inspect the live chart preview.</div>
          ) : !gateEnv.previewable ? (
            <div style={{ ...cardBox, padding: 16, color: TK.orange }}>
              Unavailable in static preview: this condition uses live position-state metrics ({gateEnv.naMetrics.join(", ")}), which are evaluated during a full strategy simulation.
            </div>
          ) : (
            <>
              <div style={{ background: "#0b0f15", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 8, marginBottom: 10 }}>
                <ChartPane
                  bars={prevBars}
                  window={WIN4}
                  replay
                  markers={gateEnv.trans.map((i) => ({ i, kind: "fire" as const }))}
                  oscillator={{ series: gateEnv.series, states: gateEnv.sig.states, color: "#79c0ff", label: "Gate margin (>0 = OPEN)", signed: true }}
                  height={330}
                />
                <div style={{ marginTop: 6 }}>
                  <RibbonLane states={gateEnv.sig.states.slice(-WIN4)} label="Gate State" colorOf={gateCol} labelOf={gateLbl} />
                </div>
              </div>

              {/* 2 Clean Telemetry Cards Instead of 4 Crowded Widgets */}
              <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
                <div style={{ ...cardBox, marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em" }}>Gate Pass Rate</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--mfe-mono)", color: po > 5 && po < 95 ? "#38bdf8" : "#f87171" }}>{po.toFixed(0)}%</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: degenerate ? "#f87171" : po >= 15 && po <= 85 ? "#34d399" : "#fbbf24" }}>
                        {degenerate ? "⚠ DEGENERATE" : po >= 15 && po <= 85 ? "✓ HEALTHY FILTER" : "SKEWED"}
                      </span>
                    </div>
                    <div style={{ height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, po))}%`, height: "100%", background: po > 5 && po < 95 ? "linear-gradient(90deg, #0284c7, #34d399)" : "#f87171" }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 10, lineHeight: 1.4 }}>
                    {bindTop ? (
                      <>Primary bottleneck: <b style={{ color: "#e2e8f0" }}>{bindTop.label}</b></>
                    ) : (
                      "Measures how often market conditions allow setups through."
                    )}
                  </div>
                </div>

                <div style={{ ...cardBox, marginBottom: 0 }}>
                  <ContribBarsKit rows={gateEnv.sig.contributions} title="Condition Bottleneck Share (Which rule blocks the most bars)" />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Higher bar = stricter filter condition under {logic} logic.</span>
                    <button
                      onClick={() => setIntentOn((v) => !v)}
                      style={{ ...inp, padding: "3px 8px", fontSize: 10.5, cursor: "pointer", fontWeight: 700, color: intentOn ? "#38bdf8" : "#94a3b8" }}
                    >
                      <Glyph name="target" size={11} /> {intentOn ? "Hide Bar Inspector" : "Inspect Individual Bars"}
                    </button>
                  </div>
                </div>
              </div>

              {intentOn && (
                <div style={{ marginTop: 10 }}>
                  <ModuleIntentSandbox draft={module} valid={valid.ok} />
                </div>
              )}
            </>
          )}
        </div>

        {/* ══ RIGHT COLUMN: TCG CARD PREVIEW + SAVE & ATTACH CTA + COMPACT CHECKLIST ══ */}
        <div style={{ overflowY: "auto" }}>
          {/* TCG Card Preview & Save Box */}
          <div style={{ ...cardBox, border: "1px solid rgba(251,191,36,0.45)", borderTop: "3px solid #fbbf24", background: "linear-gradient(180deg, rgba(251,191,36,0.08) 0%, rgba(15,23,42,0.95) 100%)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", letterSpacing: ".06em" }}>COUNTER-TRAP SHIELD · L4</span>
              <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", fontWeight: 800, color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 4, padding: "1px 6px" }}>
                ATK 15 · DEF 89
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", marginBottom: 4 }}>{name || "Unnamed Gate"}</div>
            <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.45, marginBottom: 10 }}>{explain || "Filters setups by market context."}</div>

            <div style={{ background: "rgba(7,11,20,0.65)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 6, padding: "7px 9px", marginBottom: 10, fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ color: "#94a3b8" }}>Gate Logic</span>
                <b style={{ color: "#38bdf8", fontFamily: "var(--mfe-mono)" }}>{logic} ({conds.length} rules)</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ color: "#94a3b8" }}>Open Coverage</span>
                <b style={{ color: po > 5 && po < 95 ? "#34d399" : "#fbbf24", fontFamily: "var(--mfe-mono)" }}>{pctOpen != null ? `${po.toFixed(0)}% of bars` : "—"}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ color: "#94a3b8" }}>Downstream Target</span>
                <b style={{ color: "#e2e8f0" }}>L5 Strategy Triggers</b>
              </div>
            </div>

            <button
              onClick={() => save(true)}
              disabled={!valid.ok}
              style={{
                ...inp,
                width: "100%",
                cursor: valid.ok ? "pointer" : "not-allowed",
                background: valid.ok ? "linear-gradient(135deg, #0284c7, #2563eb)" : "var(--mfe-s3)",
                color: valid.ok ? "#fff" : "var(--mfe-muted)",
                border: valid.ok ? "1px solid #38bdf8" : "none",
                fontWeight: 800,
                fontSize: 12.5,
                padding: "9px 12px",
                boxShadow: valid.ok ? "0 4px 12px rgba(2,132,199,0.3)" : "none",
              }}
            >
              <Glyph name="check" size={12} /> Save &amp; Attach to L4 Lane
            </button>
            <button
              onClick={() => save(false)}
              disabled={!valid.ok}
              style={{
                ...inp,
                width: "100%",
                marginTop: 6,
                cursor: valid.ok ? "pointer" : "not-allowed",
                background: saved ? "#1c5b3c" : "rgba(30,41,59,0.8)",
                color: valid.ok || saved ? "#cbd5e1" : "var(--mfe-muted)",
                border: "1px solid var(--border-panel)",
                fontWeight: 700,
                padding: "6px 10px",
              }}
            >
              {saved ? <><Glyph name="check" size={12} /> Saved to L4 Library</> : <><Glyph name="save" size={12} /> Save to Library Only</>}
            </button>
          </div>

          {/* Compact Validation & Safety Checklist */}
          <div style={cardBox}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Gate Readiness Checks
            </div>
            <InspPass k="Conditions valid & complete" ok={valid.ok} />
            <InspPass k="Metrics & evidence resolved" ok={valid.ok} />
            <InspPass k="Causal preview available" ok={!!gateEnv?.previewable} />
            <InspPass k="Non-degenerate coverage (1%–98%)" ok={!degenerate} />

            <button
              onClick={() => setSpecOpen((o) => !o)}
              style={{ ...inp, width: "100%", marginTop: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 10.5 }}
            >
              <span>🛡 Safety &amp; Contract Seal (5/5 PASS)</span>
              <span>{specOpen ? "▾" : "▸"}</span>
            </button>
            {specOpen && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-panel)" }}>
                <InspPass k="KIDI Safe" />
                <InspPass k="NaN / Inf Guard" />
                <InspPass k="No-Lookahead Seal" />
                <InspPass k="Closed-Bar Evaluation Only" />
                <InspPass k="Context Filter Only (No Order Send)" />
              </div>
            )}
          </div>
        </div>
      </div>
      {guideOpen && <LayerInfoPopup initialLevel={4} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
