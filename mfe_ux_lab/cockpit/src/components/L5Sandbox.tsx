// L5Sandbox — Streamlined, step-by-step L5 Strategy Logic Studio.
// Preserves 100% of L5 capabilities (TRIGGER / VETO / EXIT roles, LONG / SHORT / REGIME directions,
// setup + confirmation condition chains, smart block-to-metric auto-defaults, compileL5 graph + CustomModule,
// causal ChartPane + RibbonLane preview, decision coverage funnel, binding condition breakdown, recipes,
// AI JSON import, and Coordinate Lab handoff) with a clean, low-density tactical UI.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { ModuleIntentSandbox } from "./ModuleIntentSandbox.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { moduleToFormulaLab } from "../formulaLab/adapters/tierToFormulaLab.ts";
import { setFormulaLabInput } from "../formulaLab/formulaLabStore.ts";
import { compileL5, type L5Recipe, type L5Cond } from "../lib/blocks/l5Compile.ts";
import { L5_BLOCKS } from "../lib/blocks/l5BlockLibrary.ts";
import { metricsForScope, validateModule, loadCustomModules, saveCustomModules, type Op } from "../lib/customModule.ts";
import { listCustomMetrics, customMetricKeys, customMetricSeries } from "../lib/customMetricBridge.ts";
import { buildLayerPack, parseAiModule } from "../lib/aiContextPack.ts";
import { previewMarginSeries, previewCondMarginSeries } from "../lib/moduleIntentPreview.ts";
import { ChartPane } from "./vizkit/ChartPane.tsx";
import { ContribBarsKit, InspPass, RibbonLane } from "./vizkit/VizKit.tsx";
import { computeSignature } from "../lib/blocks/sandboxSignature.ts";
import { loadCustomL5, saveCustomL5, deleteCustomL5, type CustomL5Recipe } from "../lib/blocks/customL5.ts";
import { ACCENT } from "../lib/blocks/palette.ts";
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
  background: "rgba(244,114,182,0.2)",
  border: "1px solid rgba(244,114,182,0.55)",
  color: "#f472b6",
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
const SETUP_BLOCKS = L5_BLOCKS.filter((b) => b.group === "ENTRY_PATTERN");
const CONFIRM_BLOCKS = L5_BLOCKS.filter((b) => b.group === "CONFIRMATION");
const VETO_BLOCKS = L5_BLOCKS.filter((b) => b.group === "VETO_STANDASIDE");
const EXIT_BLOCKS = L5_BLOCKS.filter((b) => b.group === "EXIT_LOGIC");
const WIN5 = 400;

// Smart default metric/op/value when user selects a pattern block so they never face an unconfigured metric
const DEFAULT_BY_BLOCK: Record<string, { metric: string; op: Op; value: number; value2?: number }> = {
  trend_pullback: { metric: "emaGapAtr", op: ">", value: 0.3 },
  sweep_reclaim: { metric: "wickRatio", op: ">", value: 0.45 },
  range_fade: { metric: "rsi", op: "outside", value: 30, value2: 70 },
  breakout_retest: { metric: "brokeHigh20", op: "==", value: 1 },
  failed_break_fade: { metric: "wickRatio", op: ">", value: 0.5 },
  mean_reversion: { metric: "extAtr", op: ">", value: 1.1 },
  momentum_continuation: { metric: "bodyRatio", op: ">", value: 0.55 },
  double_tap: { metric: "pocDistAtr", op: "<", value: 0.6 },
  sr_bounce: { metric: "priceEmaAtr", op: "between", value: -0.4, value2: 0.4 },
  mtf_align_gate: { metric: "htfAlign", op: ">=", value: 1 },
  momentum_confirm: { metric: "rsi", op: "between", value: 45, value2: 68 },
  structure_confirm: { metric: "flowConsistency", op: ">", value: 0.55 },
  close_confirm: { metric: "bodyRatio", op: ">", value: 0.4 },
  persist_confirm: { metric: "emaGapAtr", op: ">", value: 0.25 },
  retest_confirm: { metric: "priceEmaAtr", op: "<", value: 0.5 },
  confidence_confirm: { metric: "atrRatio", op: "between", value: 0.85, value2: 1.8 },
  no_trade_chop: { metric: "emaGapAtr", op: "between", value: -0.25, value2: 0.25 },
  overextended_veto: { metric: "extAtr", op: ">", value: 1.6 },
  against_htf_veto: { metric: "htfAlign", op: "<", value: 0 },
  news_avoid_veto: { metric: "atrRatio", op: ">", value: 2.2 },
  low_confidence_veto: { metric: "atrPct", op: "<", value: 0.25 },
  conflict_veto: { metric: "flowConsistency", op: "<", value: 0.35 },
  dead_hour_veto: { metric: "hour", op: "outside", value: 6, value2: 21 },
  danger_spread_veto: { metric: "spread", op: ">", value: 0.35 },
  thesis_weakening: { metric: "wickRatio", op: ">", value: 0.48 },
  target_reached_hint: { metric: "extAtr", op: ">", value: 1.4 },
  time_stop_hint: { metric: "barsSinceTrade", op: ">=", value: 24 },
  trailing_hint: { metric: "emaGapAtr", op: "<", value: 0.15 },
  structure_break_exit: { metric: "brokeLow20", op: "==", value: 1 },
  regime_flip_exit: { metric: "regime", op: "<", value: 0 },
  breakeven_hint: { metric: "priceEmaAtr", op: ">", value: 0.8 },
  partial_scale_hint: { metric: "rsi", op: ">", value: 72 },
};

type DState = "WATCH" | "SETUP" | "READY" | "VETO" | "EXIT";
const DS_COL: Record<DState, string> = { WATCH: ACCENT.grey, SETUP: ACCENT.amber, READY: ACCENT.greenBar, VETO: ACCENT.red, EXIT: ACCENT.purple };
const DS_LABEL: Record<DState, string> = { WATCH: "Observe", SETUP: "Setup", READY: "READY", VETO: "VETO", EXIT: "EXIT" };
const DS_ORDER: DState[] = ["WATCH", "SETUP", "READY", "VETO", "EXIT"];

const TACTICAL_L5_PRESETS: {
  label: string;
  sub: string;
  terminal: "TRIGGER" | "VETO" | "EXIT";
  direction?: "LONG" | "SHORT" | "REGIME";
  name: string;
  explain: string;
  why: string;
  setup: L5Cond[];
  confirm: L5Cond[];
}[] = [
  {
    label: "Trend Pullback (ATK)",
    sub: "EMA trend + RSI confirmation",
    terminal: "TRIGGER",
    direction: "REGIME",
    name: "L5_ATK_PULLBACK_01",
    explain: "Trigger in regime direction when trend pullback aligns with momentum confirmation",
    why: "Capture continuation waves after controlled retracements",
    setup: [{ blockId: "trend_pullback", metric: "emaGapAtr", op: ">", value: 0.3 }],
    confirm: [{ blockId: "momentum_confirm", metric: "rsi", op: "between", value: 42, value2: 68 }],
  },
  {
    label: "Breakout Strike (ATK)",
    sub: "Impulse body + ATR expansion",
    terminal: "TRIGGER",
    direction: "LONG",
    name: "L5_ATK_BREAKOUT_01",
    explain: "Trigger long setup on strong body impulse and expanding range",
    why: "Enter on high-conviction displacement out of consolidation",
    setup: [{ blockId: "momentum_continuation", metric: "bodyRatio", op: ">", value: 0.55 }],
    confirm: [{ blockId: "confidence_confirm", metric: "atrRatio", op: ">", value: 1.05 }],
  },
  {
    label: "ATR Shock Veto (GUARD)",
    sub: "Blocks extreme volatility spikes",
    terminal: "VETO",
    name: "L5_VETO_ATR_SHOCK",
    explain: "Veto any setup when volatility spikes into extreme exhaustion",
    why: "Protect capital during news spikes and disorderly liquidation bars",
    setup: [{ blockId: "overextended_veto", metric: "atrRatio", op: ">", value: 2.2 }],
    confirm: [],
  },
  {
    label: "Climax Wick Exit (EXIT)",
    sub: "Locks profit on rejection wick",
    terminal: "EXIT",
    name: "L5_EXIT_CLIMAX_WICK",
    explain: "Close active position when rejection wick signals exhaustion",
    why: "Lock in unrealized gains before sharp mean-reversion snapback",
    setup: [{ blockId: "thesis_weakening", metric: "wickRatio", op: ">", value: 0.48 }],
    confirm: [],
  },
];

export function L5Sandbox({ onClose, onSaved }: { onClose: () => void; onSaved?: (savedId?: string) => void }) {
  const evMetrics = useMemo(() => listCustomMetrics(), []);
  const metricOpts = useMemo(() => metricsForScope("entry"), []);
  const [terminal, setTerminal] = useState<"TRIGGER" | "VETO" | "EXIT">("TRIGGER");
  const [direction, setDirection] = useState<"LONG" | "SHORT" | "REGIME">("REGIME");
  const [name, setName] = useState("L5_ATK_PULLBACK_01");
  const [explain, setExplain] = useState("Trigger in regime direction when trend pullback aligns with momentum confirmation");
  const [why, setWhy] = useState("Capture continuation waves after controlled retracements");
  const [setup, setSetup] = useState<L5Cond[]>([{ blockId: "trend_pullback", metric: "emaGapAtr", op: ">", value: 0.3 }]);
  const [confirm, setConfirm] = useState<L5Cond[]>([{ blockId: "momentum_confirm", metric: "rsi", op: "between", value: 42, value2: 68 }]);
  const [advOpen, setAdvOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiJson, setAiJson] = useState("");
  const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiCopied, setAiCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [intentOn, setIntentOn] = useState(false);
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [recipes, setRecipes] = useState<CustomL5Recipe[]>(() => loadCustomL5());

  useEffect(() => {
    loadSimOhlc("M15").then((d) => setBars(d?.bars || null));
  }, []);

  function saveRecipe() {
    const r: CustomL5Recipe = {
      id: "l5r_" + Date.now().toString(36),
      name: name.trim() || "L5",
      explain,
      why,
      terminal,
      direction: terminal === "TRIGGER" ? direction : undefined,
      setup,
      confirm,
      status: "SHADOW",
      createdAt: new Date().toISOString(),
    };
    saveCustomL5([r, ...loadCustomL5()]);
    setRecipes(loadCustomL5());
  }
  function loadRecipe(id: string) {
    const r = loadCustomL5().find((x) => x.id === id);
    if (!r) return;
    setName(r.name);
    setExplain(r.explain);
    setWhy(r.why);
    setTerminal(r.terminal);
    if (r.direction) setDirection(r.direction);
    setSetup(r.setup);
    setConfirm(r.confirm);
    setSaved(false);
  }
  function delRecipe(id: string) {
    deleteCustomL5(id);
    setRecipes(loadCustomL5());
  }

  const recipe: L5Recipe = useMemo(
    () => ({
      name,
      explain,
      why,
      terminal,
      direction: terminal === "TRIGGER" ? direction : undefined,
      setup: terminal === "TRIGGER" ? setup : [],
      confirm: terminal === "TRIGGER" ? confirm : undefined,
      veto: terminal === "VETO" ? setup : undefined,
      exit: terminal === "EXIT" ? setup : undefined,
      exitAction: terminal === "EXIT" ? "CLOSE" : undefined,
    }),
    [name, explain, why, terminal, direction, setup, confirm]
  );
  const compiled = useMemo(() => compileL5(recipe), [recipe]);
  const valid = useMemo(() => validateModule(compiled.module, customMetricKeys()), [compiled]);

  const l5Env = useMemo(() => {
    if (!bars || !valid.ok || bars.length < 60) return null;
    const pv = bars.slice(-8000);
    const marginRes = previewMarginSeries(pv, compiled.module, customMetricSeries);
    if (!marginRes.previewable) return { previewable: false as const, naMetrics: marginRes.naMetrics };
    const condRes = previewCondMarginSeries(pv, compiled.module, customMetricSeries);
    const sig = computeSignature(marginRes.series, {
      warmup: 40,
      onLabel: "READY",
      components: condRes.perCond.map((c) => ({ id: c.metric, label: c.label, series: c.series })),
    });
    const term = compiled.role;
    const setupN = terminal === "TRIGGER" ? setup.length : 0;
    const per = condRes.perCond;
    const states: DState[] = new Array(pv.length).fill("WATCH");
    for (let i = 40; i < pv.length; i++) {
      if (per.some((c) => !Number.isFinite(c.series[i]))) continue;
      if (term === "VETO") {
        states[i] = marginRes.series[i] >= 0 ? "VETO" : "WATCH";
        continue;
      }
      if (term === "EXIT") {
        states[i] = marginRes.series[i] >= 0 ? "EXIT" : "WATCH";
        continue;
      }
      const setupM = setupN ? Math.min(...per.slice(0, setupN).map((c) => c.series[i])) : Infinity;
      const confirmM = per.length > setupN ? Math.min(...per.slice(setupN).map((c) => c.series[i])) : Infinity;
      states[i] = setupM < 0 ? "WATCH" : confirmM < 0 ? "SETUP" : "READY";
    }
    const trans: number[] = [];
    for (let i = 1; i < states.length; i++) if (states[i] === "READY" && states[i - 1] !== "READY") trans.push(i);
    const dist: Record<DState, number> = { WATCH: 0, SETUP: 0, READY: 0, VETO: 0, EXIT: 0 };
    for (const s of states) dist[s]++;
    return { previewable: true as const, series: marginRes.series, sig, states, trans, dist, prevBars: pv, evalN: pv.length - 40 };
  }, [bars, valid.ok, compiled, terminal, setup.length]);

  const renderRuleCard = (list: L5Cond[], set: (l: L5Cond[]) => void, blocks: typeof SETUP_BLOCKS, i: number, accentColor: string) => {
    const c = list[i];
    const upd = (p: Partial<L5Cond>) => {
      set(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
      setSaved(false);
    };
    const onBlockChange = (newBlockId: string) => {
      const def = DEFAULT_BY_BLOCK[newBlockId];
      if (def) upd({ blockId: newBlockId, metric: def.metric, op: def.op, value: def.value, value2: def.value2 });
      else upd({ blockId: newBlockId });
    };
    return (
      <div key={i} style={{ background: "rgba(19,30,54,0.92)", border: `1px solid ${accentColor}55`, borderLeft: `3px solid ${accentColor}`, borderRadius: 6, padding: "8px 9px", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: accentColor, textTransform: "uppercase" }}>Archetype:</span>
            <select style={{ ...inp, flex: 1, fontWeight: 800, color: "#f8fafc" }} value={c.blockId} onChange={(e) => onBlockChange(e.target.value)}>
              {blocks.map((b) => (
                <option key={b.blockId} value={b.blockId}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <button
            title="Remove condition"
            style={{ ...inp, padding: "2px 6px", cursor: "pointer", color: "#f87171", borderColor: "rgba(248,113,113,0.35)" }}
            onClick={() => {
              set(list.filter((_, j) => j !== i));
              setSaved(false);
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <select style={{ ...inp, flex: "1 1 135px", fontSize: 11 }} value={c.metric} onChange={(e) => upd({ metric: e.target.value })}>
            <optgroup label="Built-in Market Metrics">
              {metricOpts.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </optgroup>
            {evMetrics.length > 0 && (
              <optgroup label="Custom L1/L2/L3 Evidence">
                {evMetrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} · {m.layer}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select style={{ ...inp, fontSize: 11 }} value={c.op} onChange={(e) => upd({ op: e.target.value as Op })}>
            {OPS.map((o) => (
              <option key={o} value={o}>
                {OP_FRIENDLY[o]}
              </option>
            ))}
          </select>
          <input style={{ ...inp, width: 62, fontFamily: "var(--mfe-mono)", fontWeight: 700 }} type="number" step="0.05" value={c.value} onChange={(e) => upd({ value: +e.target.value })} />
          {(c.op === "between" || c.op === "outside") && (
            <>
              <span style={{ fontSize: 10.5, color: "#94a3b8" }}>to</span>
              <input style={{ ...inp, width: 62, fontFamily: "var(--mfe-mono)", fontWeight: 700 }} type="number" step="0.05" value={c.value2 ?? 0} onChange={(e) => upd({ value2: +e.target.value })} />
            </>
          )}
        </div>
      </div>
    );
  };

  function save(attachAndClose = false) {
    if (!valid.ok) return;
    saveCustomModules([compiled.module, ...loadCustomModules()]);
    setSaved(true);
    onSaved?.(compiled.module.id);
    if (attachAndClose) onClose();
  }
  function copyPrompt() {
    try {
      navigator.clipboard?.writeText(buildLayerPack("L5"));
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
    const term = m.role === "VETO" ? "VETO" : m.role === "EXIT" ? "EXIT" : "TRIGGER";
    const blocks = term === "VETO" ? VETO_BLOCKS : term === "EXIT" ? EXIT_BLOCKS : SETUP_BLOCKS;
    const mapped: L5Cond[] = (m.conditions || []).map((c) => ({
      blockId: blocks[0].blockId,
      metric: c.metric,
      op: c.op,
      value: c.value,
      ...(c.value2 != null ? { value2: c.value2 } : {}),
    }));
    if (term === "TRIGGER" && mapped.length === 0) {
      setAiMsg({ ok: false, text: "A trigger needs at least one condition." });
      return;
    }
    setTerminal(term);
    if (m.direction) setDirection(m.direction);
    setName(m.name);
    setExplain(m.explain);
    setWhy(m.why);
    setSetup(mapped);
    setConfirm([]);
    setSaved(false);
    setAiJson("");
    setAiOpen(false);
    setAiMsg({ ok: true, text: `Loaded ${m.role} «${m.name}» (${mapped.length} rules).` });
  }

  const readyPct = l5Env?.previewable ? l5Env.sig.gauge.onPct : 0;
  const bindTop = l5Env?.previewable ? l5Env.sig.contributions[0] : null;
  const tcgRoleBadge = terminal === "TRIGGER" ? "ATTACKER STRIKE · ATK 88" : terminal === "VETO" ? "GUARD SHIELD · DEF 90" : "EXIT SENTINEL · DEF 88";
  const primaryBlocks = terminal === "VETO" ? VETO_BLOCKS : terminal === "EXIT" ? EXIT_BLOCKS : SETUP_BLOCKS;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-app, #070B14)", zIndex: 130, display: "flex", flexDirection: "column", padding: 14, boxSizing: "border-box", overflow: "hidden" }}>
      {/* ── TOP HEADER BAR ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border-panel, rgba(56,189,248,0.22))", paddingBottom: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: "#070B14", background: "#f472b6", borderRadius: 5, padding: "3px 8px", letterSpacing: ".06em" }}>L5 STUDIO</span>
        <div>
          <b style={{ color: "#f8fafc", fontSize: 15 }}>Strategy Decision &amp; Trigger Sandbox</b>
          <span style={{ color: "#94a3b8", fontSize: 11.5, marginLeft: 10 }}>Build explicit Attacker Triggers, Veto Shields, or Exit Sentinels</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          {([
            [tcgRoleBadge, "#f472b6"],
            ["ZONE-ONLY · NO ORDER", "#38bdf8"],
            ["NO-LOOKAHEAD", "#34d399"],
          ] as const).map(([t, c]) => (
            <span key={t} style={{ fontSize: 10, color: c, border: `1px solid ${c}55`, background: `${c}14`, borderRadius: 4, padding: "2px 7px", fontWeight: 800 }}>
              {t}
            </span>
          ))}
        </div>
        <button
          onClick={() => setGuideOpen(true)}
          style={{ ...inp, marginLeft: "auto", cursor: "pointer", color: "#f472b6", borderColor: "rgba(244,114,182,0.45)", background: "rgba(244,114,182,0.12)", fontWeight: 800, fontSize: 11 }}
        >
          ⓘ L5 Layer Guide
        </button>
        <button
          onClick={() => {
            if (!bars || !valid.ok) return;
            setFormulaLabInput(moduleToFormulaLab(compiled.module, bars));
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
      <div style={{ display: "grid", gridTemplateColumns: "335px 1fr 330px", gap: 14, flex: 1, minHeight: 0 }}>
        {/* ══ LEFT COLUMN: 3-STEP BUILDER ══ */}
        <div style={{ overflowY: "auto", paddingRight: 4 }}>
          {/* STEP 1: COMBAT ROLE & 1-CLICK TACTICAL PRESETS */}
          <div style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={stepBadge}>1</span>
              <b style={{ fontSize: 12, color: "#f8fafc" }}>Choose Role &amp; Tactical Preset</b>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 8 }}>
              {([
                ["TRIGGER", "⚔ Attacker", "#f97316"],
                ["VETO", "🛡 Veto Guard", "#38bdf8"],
                ["EXIT", "🎯 Exit Sentinel", "#34d399"],
              ] as const).map(([t, lbl, col]) => {
                const on = terminal === t;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setTerminal(t);
                      const defBlock = (t === "VETO" ? VETO_BLOCKS : t === "EXIT" ? EXIT_BLOCKS : SETUP_BLOCKS)[0].blockId;
                      const def = DEFAULT_BY_BLOCK[defBlock] ?? { metric: "emaGapAtr", op: ">" as Op, value: 0.3 };
                      setSetup([{ blockId: defBlock, ...def }]);
                      setSaved(false);
                    }}
                    style={{
                      ...inp,
                      padding: "6px 4px",
                      textAlign: "center",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 11,
                      background: on ? `${col}24` : "var(--bg-card-inner, #131E36)",
                      color: on ? col : "#94a3b8",
                      borderColor: on ? col : "rgba(148,163,184,0.2)",
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>

            {terminal === "TRIGGER" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(7,11,20,0.55)", padding: "5px 8px", borderRadius: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700 }}>Strike Direction:</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["LONG", "SHORT", "REGIME"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setDirection(d);
                        setSaved(false);
                      }}
                      style={{
                        ...inp,
                        padding: "2px 8px",
                        fontSize: 10.5,
                        fontWeight: 800,
                        cursor: "pointer",
                        background: d === direction ? "rgba(56,189,248,0.22)" : "transparent",
                        color: d === direction ? "#38bdf8" : "#94a3b8",
                        borderColor: d === direction ? "#38bdf8" : "rgba(148,163,184,0.2)",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 5 }}>Or load a 1-click tactical preset:</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {TACTICAL_L5_PRESETS.map((pr) => {
                const active = name === pr.name;
                return (
                  <button
                    key={pr.name}
                    onClick={() => {
                      setTerminal(pr.terminal);
                      if (pr.direction) setDirection(pr.direction);
                      setName(pr.name);
                      setExplain(pr.explain);
                      setWhy(pr.why);
                      setSetup(pr.setup);
                      setConfirm(pr.confirm);
                      setSaved(false);
                    }}
                    style={{
                      ...inp,
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "6px 8px",
                      background: active ? "rgba(244,114,182,0.16)" : "var(--bg-card-inner, #131E36)",
                      borderColor: active ? "#f472b6" : "rgba(244,114,182,0.28)",
                    }}
                  >
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "#f472b6" }}>{pr.label}</div>
                    <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>{pr.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: SETUP & CONFIRMATION CONDITIONS */}
          <div style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={stepBadge}>2</span>
                <b style={{ fontSize: 12, color: "#f8fafc" }}>
                  {terminal === "TRIGGER" ? `Primary Setup Rules (${setup.length})` : terminal === "VETO" ? `Veto Rules (${setup.length})` : `Exit Rules (${setup.length})`}
                </b>
              </div>
              <button
                style={{ ...inp, padding: "3px 8px", fontSize: 10.5, fontWeight: 800, cursor: "pointer", color: "#38bdf8", borderColor: "rgba(56,189,248,0.4)" }}
                onClick={() => {
                  const blk = primaryBlocks[0].blockId;
                  const def = DEFAULT_BY_BLOCK[blk] ?? { metric: metricOpts[0].key, op: ">" as Op, value: 0 };
                  setSetup([...setup, { blockId: blk, ...def }]);
                  setSaved(false);
                }}
              >
                + Add Rule
              </button>
            </div>

            {setup.map((_, i) => renderRuleCard(setup, setSetup, primaryBlocks, i, terminal === "TRIGGER" ? "#f97316" : terminal === "VETO" ? "#38bdf8" : "#34d399"))}

            {terminal === "TRIGGER" && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-panel)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#a78bfa" }}>Optional Confirmation Rules ({confirm.length})</span>
                  <button
                    style={{ ...inp, padding: "2px 8px", fontSize: 10, fontWeight: 800, cursor: "pointer", color: "#a78bfa", borderColor: "rgba(167,139,250,0.4)" }}
                    onClick={() => {
                      const blk = CONFIRM_BLOCKS[0].blockId;
                      const def = DEFAULT_BY_BLOCK[blk] ?? { metric: "rsi", op: "between" as Op, value: 45, value2: 68 };
                      setConfirm([...confirm, { blockId: blk, ...def }]);
                      setSaved(false);
                    }}
                  >
                    + Add Confirmation
                  </button>
                </div>
                {confirm.length === 0 ? (
                  <div style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic" }}>No confirmation filter added — setup triggers directly into READY.</div>
                ) : (
                  confirm.map((_, i) => renderRuleCard(confirm, setConfirm, CONFIRM_BLOCKS, i, "#a78bfa"))
                )}
              </div>
            )}

            {compiled.warnings.length > 0 && (
              <div style={{ marginTop: 8, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 6, padding: "5px 8px" }}>
                {compiled.warnings.map((w, k) => (
                  <div key={k} style={{ fontSize: 10.5, color: "#fbbf24" }}>
                    <Glyph name="warning" size={10} /> {w}
                  </div>
                ))}
              </div>
            )}
            {!valid.ok && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f87171", background: "rgba(239,68,68,0.12)", padding: "5px 8px", borderRadius: 5 }}>
                <Glyph name="warning" size={10} /> {valid.errors.join(" · ")}
              </div>
            )}
          </div>

          {/* STEP 3: MODULE IDENTITY & COLLAPSIBLE RECIPES / AI IMPORT */}
          <div style={cardBox}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={stepBadge}>3</span>
              <b style={{ fontSize: 12, color: "#f8fafc" }}>Module Name &amp; Notes</b>
            </div>
            <label className="pmut psm" style={{ display: "block" }}>
              Module Identifier
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
                  <button onClick={saveRecipe} disabled={!setup.length} style={{ ...inp, cursor: setup.length ? "pointer" : "default", color: "#5ad1c4", borderColor: "#1c5b54", fontWeight: 700 }}>
                    <Glyph name="save" size={11} /> Save Recipe
                  </button>
                  <select value="" onChange={(e) => { if (e.target.value) loadRecipe(e.target.value); }} style={{ ...inp, flex: 1 }}>
                    <option value="">Load recipe… ({recipes.length})</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.terminal}
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
                    {aiCopied ? <><Glyph name="check" size={11} /> Copied</> : <><Glyph name="export" size={11} /> Copy L5 AI Prompt</>}
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
                      placeholder="Paste L5 JSON with role, direction and conditions."
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

        {/* ══ CENTER COLUMN: VISUAL PIPELINE STEPPER + CHART + 2 CLEAN TELEMETRY CARDS ══ */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          {/* Visual Pipeline Stepper */}
          <div style={{ background: "rgba(244,114,182,0.08)", border: "1px solid rgba(244,114,182,0.35)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "#f472b6", textTransform: "uppercase", letterSpacing: ".05em" }}>Decision Flow:</span>
            {compiled.graph.nodes.map((n, k) => {
              const isEmit = n.id === "emit";
              return (
                <span key={n.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {k > 0 && <span style={{ color: "#64748b", fontWeight: 900 }}>➔</span>}
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mfe-mono)",
                      fontWeight: isEmit ? 900 : 700,
                      color: isEmit ? "#34d399" : "#e2e8f0",
                      background: isEmit ? "rgba(52,211,153,0.16)" : "rgba(15,23,42,0.85)",
                      border: `1px solid ${isEmit ? "rgba(52,211,153,0.5)" : "rgba(56,189,248,0.3)"}`,
                      borderRadius: 5,
                      padding: "3px 8px",
                    }}
                  >
                    {n.label}
                    {n.cond ? ` (${n.cond.metric} ${n.cond.op} ${n.cond.value}${n.cond.value2 != null ? ".." + n.cond.value2 : ""})` : ""}
                  </span>
                </span>
              );
            })}
          </div>

          {!l5Env ? (
            <div style={{ ...cardBox, padding: 20, textAlign: "center", color: "#94a3b8" }}>Enter valid conditions on the left to inspect the live decision chart.</div>
          ) : !l5Env.previewable ? (
            <div style={{ ...cardBox, padding: 16, color: TK.orange }}>
              Unavailable in static preview: this condition uses live position-state metrics ({l5Env.naMetrics.join(", ")}), which are evaluated during a full strategy simulation.
            </div>
          ) : (
            <>
              <div style={{ background: "#0b0f15", border: "1px solid var(--border-panel)", borderRadius: 8, padding: 8, marginBottom: 10 }}>
                <ChartPane
                  bars={l5Env.prevBars}
                  window={WIN5}
                  replay
                  markers={l5Env.trans.map((i) => ({ i, kind: "buy" as const }))}
                  oscillator={{ series: l5Env.series, states: l5Env.sig.states, color: "#79c0ff", label: "Trigger margin (>0 = ELIGIBLE)", signed: true }}
                  height={330}
                />
                <div style={{ marginTop: 6 }}>
                  <RibbonLane states={l5Env.states.slice(-WIN5)} label="Decision State" colorOf={(s: DState) => DS_COL[s]} labelOf={(s: DState) => DS_LABEL[s]} />
                </div>
              </div>

              {/* 2 Clean Telemetry Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 12 }}>
                <div style={{ ...cardBox, marginBottom: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em" }}>Signal Frequency</span>
                    <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "var(--mfe-mono)", color: readyPct > 1 && readyPct < 65 ? "#34d399" : "#fbbf24" }}>
                      {readyPct.toFixed(1)}% <span style={{ fontSize: 11, fontWeight: 700 }}>READY</span>
                    </span>
                  </div>
                  {DS_ORDER.filter((s) => l5Env.dist[s] > 0).map((s) => {
                    const pct = (l5Env.dist[s] / Math.max(1, l5Env.evalN)) * 100;
                    return (
                      <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 10.5, minWidth: 62, fontWeight: 700, color: DS_COL[s] }}>{DS_LABEL[s]}</span>
                        <div style={{ flex: 1, height: 8, background: "#161d27", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: DS_COL[s] }} />
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", color: "#cbd5e1", minWidth: 34, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                  {bindTop && (
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                      Tightest filter: <b style={{ color: "#e2e8f0" }}>{bindTop.label}</b>
                    </div>
                  )}
                </div>

                <div style={{ ...cardBox, marginBottom: 0 }}>
                  <ContribBarsKit rows={l5Env.sig.contributions} title="Condition Selectivity (Which rule filters the most bars)" />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Transition triangles on the chart mark bars entering READY state.</span>
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
                  <ModuleIntentSandbox draft={compiled.module} valid={valid.ok} />
                </div>
              )}
            </>
          )}
        </div>

        {/* ══ RIGHT COLUMN: TCG L5 CARD PREVIEW + SAVE & ATTACH CTA + COMPACT CHECKLIST ══ */}
        <div style={{ overflowY: "auto" }}>
          <div style={{ ...cardBox, border: "1px solid rgba(244,114,182,0.45)", borderTop: "3px solid #f472b6", background: "linear-gradient(180deg, rgba(244,114,182,0.08) 0%, rgba(15,23,42,0.95) 100%)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#f472b6", letterSpacing: ".06em" }}>STRATEGY LOGIC · L5</span>
              <span style={{ fontSize: 10, fontFamily: "var(--mfe-mono)", fontWeight: 800, color: "#f472b6", background: "rgba(244,114,182,0.12)", border: "1px solid rgba(244,114,182,0.35)", borderRadius: 4, padding: "1px 6px" }}>
                {tcgRoleBadge}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#f8fafc", marginBottom: 4 }}>{name || "Unnamed L5 Module"}</div>
            <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.45, marginBottom: 10 }}>{explain || "Evaluates setup and confirmation conditions."}</div>

            <div style={{ background: "rgba(7,11,20,0.65)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 6, padding: "7px 9px", marginBottom: 10, fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ color: "#94a3b8" }}>Combat Role</span>
                <b style={{ color: "#f472b6", fontFamily: "var(--mfe-mono)" }}>
                  {compiled.role}
                  {compiled.module.direction ? ` · ${compiled.module.direction}` : ""}
                </b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ color: "#94a3b8" }}>Rule Chain</span>
                <b style={{ color: "#38bdf8", fontFamily: "var(--mfe-mono)" }}>
                  {setup.length} Setup + {confirm.length} Confirm
                </b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ color: "#94a3b8" }}>Eligible Bars</span>
                <b style={{ color: "#34d399", fontFamily: "var(--mfe-mono)" }}>{l5Env?.previewable ? `${readyPct.toFixed(1)}% (${l5Env.trans.length} fires)` : "—"}</b>
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
              <Glyph name="check" size={12} /> Save &amp; Attach to L5 Lane
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
              {saved ? <><Glyph name="check" size={12} /> Saved to L5 Library</> : <><Glyph name="save" size={12} /> Save to Library Only</>}
            </button>
          </div>

          <div style={cardBox}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              L5 Readiness Checks
            </div>
            <InspPass k="Conditions valid & complete" ok={valid.ok} />
            <InspPass k="No compiler warnings" ok={compiled.warnings.length === 0} />
            <InspPass k="Causal preview available" ok={!!l5Env?.previewable} />

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
                <InspPass k="Closed-Bar Only" />
                <InspPass k="Zone-Only · No Order Send" />
              </div>
            )}
          </div>
        </div>
      </div>
      {guideOpen && <LayerInfoPopup initialLevel={5} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
