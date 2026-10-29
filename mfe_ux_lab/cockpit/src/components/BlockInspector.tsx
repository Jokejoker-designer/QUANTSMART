// BlockInspector — the formal "what is this block" panel (like the mockup INSPECTOR): selected node → Module
// Identity · Input Contract · Output Contract · Authority Contract (the L1 locks) · Safety · Parameters (read-
// only here; tuned live in the bottom visualiser) · Strengths/Weaknesses. Pure contract/explainability, no
// numbers fabricated. L1 authority is hard: emit a measurement only — never pattern/zone/entry/order.
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { BLOCKS_BY_ID } from "../lib/blocks/blockLibrary.ts";
import type { L1Group, L1PrimitiveBlockSpec } from "../lib/blocks/blockTypes.ts";
import type { FeatureGraph, FeatureNode } from "../lib/blocks/featureGraph.ts";
import { GROUP_COLOR } from "./BlockViz.tsx";
import { explainBlock } from "../lib/blocks/featureExplain.ts";

const ROLE: Record<L1Group, string> = {
  SOURCE: "Data source", CANDLE_ANATOMY: "Candle anatomy", ROLLING_WINDOW: "Rolling aggregation", NORMALIZE: "Scale-free normalization",
  SMOOTH_LAG_MOMENTUM: "Smoothing, lag and momentum", MATH: "Numeric safety", LOGIC_CONNECTOR: "Logic", FSM_STATE: "State machine", SAFETY_OUTPUT: "Safety and outputs",
};

function strengthsWeaknesses(b: L1PrimitiveBlockSpec): { S: string[]; W: string[] } {
  const S: string[] = [], W: string[] = [];
  if (b.outputs[0].scaleFree) S.push("Scale-free measurement; test applicability to each asset");
  if (b.safety.kidiGuardRequired) S.push("Division has a numeric guard; check its fallback behavior");
  if (b.group === "CANDLE_ANATOMY") { S.push("Measured on a single bar"); if (!b.parameters.length) S.push("No tunable parameter"); }
  if (b.group === "NORMALIZE") S.push("Normalized by volatility or ATR");
  if (b.group === "ROLLING_WINDOW") { S.push("Aggregates an N-bar context"); W.push("Requires sufficient history and is sensitive to N"); }
  if (b.group === "SMOOTH_LAG_MOMENTUM") W.push("Period-dependent lag");
  if (b.outputs[0].type === "BOOL") W.push("Binary output discards magnitude information");
  if (b.parameters.length && b.group !== "CANDLE_ANATOMY") W.push("Parameter-dependent; requires OOS evaluation");
  if (b.provisional) W.push("Data may be unavailable (" + (b.note || "provisional") + "); do not treat it as measured evidence");
  if (!S.length) S.push("Deterministic transform");
  if (!W.length) W.push("An L1 measurement acquires strategy meaning only through its downstream use");
  return { S, W };
}

function Row({ k, v, c }: { k: React.ReactNode; v: React.ReactNode; c?: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "2px 0" }}><span style={{ color: "var(--mfe-muted)" }}>{k}</span><span style={{ color: c || "var(--mfe-text)", fontFamily: "var(--mfe-mono)", textAlign: "right" }}>{v}</span></div>;
}
function Sec({ title, color, children }: { title: string; color?: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 8 }}><div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".4px", color: color || "var(--mfe-muted)", fontWeight: 700, marginBottom: 3 }}>{title}</div>{children}</div>;
}

export function BlockInspector({ block, node, graph }: { block: L1PrimitiveBlockSpec; node: FeatureNode; graph: FeatureGraph }) {
  const col = GROUP_COLOR[block.group];
  const ports = block.inputs.filter((p) => p.type !== "STREAM_OHLC");
  const wiredLabel = (k: number) => { const up = node.inputs[k]; if (!up) return ""; const u = graph.nodes.find((n) => n.id === up); return u ? `← ${BLOCKS_BY_ID[u.blockId]?.label ?? up}` : `← ${up}`; };
  const sw = strengthsWeaknesses(block);
  const auth = block.authority;
  const out = block.outputs[0];

  return (
    <div className="pc" style={{ margin: 0, background: "var(--mfe-s2)", borderColor: col + "66" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: col }} />
        <b style={{ fontSize: 13, color: "#e7eef6" }}>{block.label}</b>
        <span className="pmut" style={{ fontSize: 9.5, marginLeft: "auto" }}>{node.id}</span>
      </div>
      <div style={{ margin: "3px 0 2px", fontSize: 11.5, color: "var(--mfe-text)", lineHeight: 1.45 }}><span style={{ color: TK.cyan }}><Glyph name="gear" size={11} /> </span>{explainBlock(block.blockId, node.params)}</div>

      <Sec title="Module Identity">
        <Row k="Layer" v="L1 · Feature" c={TK.cyan} />
        <Row k="Role" v={ROLE[block.group]} />
        <Row k="Block" v={block.blockId} />
        <Row k="Scale-free" v={out.scaleFree ? <>yes <Glyph name="check" size={9} /></> : "no"} c={out.scaleFree ? TK.green : "var(--mfe-muted)"} />
      </Sec>

      <Sec title="Input Contract" color="#7aa2ff">
        {block.inputs.length === 0 && <div className="pmut psm">— no inputs —</div>}
        {block.inputs.map((p, i) => p.type === "STREAM_OHLC"
          ? <Row key={i} k={"OHLC bars"} v="STREAM_OHLC" c="#7aa2ff" />
          : <Row key={i} k={`${p.name}${p.required ? "*" : ""} ${wiredLabel(ports.indexOf(p))}`} v={p.type} c="#7aa2ff" />)}
      </Sec>

      <Sec title="Output Contract" color="#21d07a">
        <Row k={out.name} v={`${out.type}${out.range ? " " + out.range : ""}`} c="#21d07a" />
      </Sec>

      <Sec title="Authority Contract" color={TK.orange}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 9.5 }}>
          <span style={{ color: TK.green, border: "1px solid #1c5b3c", borderRadius: 4, padding: "1px 5px" }}><Glyph name="check" size={9} /> Emit Feature</span>
          {[["No Pattern", auth.canEmitPattern], ["No Zone", auth.canEmitZone], ["No Entry/Signal", auth.canEmitSignal], ["No Order", auth.canOrderSend]].map(([l]) => (
            <span key={l as string} style={{ color: "#f0a0a0", border: "1px solid #5a2a2a", borderRadius: 4, padding: "1px 5px" }}><Glyph name="x" size={9} /> {l as string}</span>
          ))}
        </div>
      </Sec>

      <Sec title="Safety">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 9.5 }}>
          <span style={{ color: TK.green }}><Glyph name="check" size={9} /> Causal</span><span style={{ color: TK.green }}><Glyph name="check" size={9} /> Closed-bar only</span><span style={{ color: TK.green }}><Glyph name="check" size={9} /> No-lookahead</span>
          {block.safety.kidiGuardRequired && <span style={{ color: TK.green }}><Glyph name="check" size={9} /> KIDI guard</span>}
        </div>
      </Sec>

      <Sec title={`Parameters (${block.parameters.length})`} color={TK.cyan}>
        {block.parameters.length === 0 && <div className="pmut psm">— no adjustable parameters —</div>}
        {block.parameters.map((p) => { const val = node.params?.[p.name] ?? p.defaultValue; const adj = val !== p.defaultValue; return <Row key={p.name} k={<>{adj ? <><Glyph name="edit" size={9} /> </> : ""}{p.label || p.name}</>} v={<>{val}{adj ? <span style={{ color: TK.muted }}> (default {p.defaultValue})</span> : ""} <span style={{ color: "var(--mfe-muted)" }}>[{p.min ?? "—"}..{p.max ?? "—"}]</span></>} c={adj ? TK.orange : TK.cyan} />; })}
        {block.parameters.length > 0 && <div className="pmut" style={{ fontSize: 9, fontStyle: "italic", marginTop: 2 }}>Adjust the block preview parameters below · <span style={{ color: TK.orange }}><Glyph name="edit" size={9} /> = changed from the default</span> This value is used by both the calculation and its explanation.</div>}
      </Sec>

      <Sec title={`Strengths (${sw.S.length})`} color={TK.green}>
        {sw.S.map((s, i) => <div key={i} style={{ fontSize: 10.5, color: "#a9d8b8", padding: "1px 0" }}>+ {s}</div>)}
      </Sec>
      <Sec title={`Weaknesses (${sw.W.length})`} color={TK.orange}>
        {sw.W.map((w, i) => <div key={i} style={{ fontSize: 10.5, color: "#e6c79a", padding: "1px 0" }}>− {w}</div>)}
      </Sec>
    </div>
  );
}
