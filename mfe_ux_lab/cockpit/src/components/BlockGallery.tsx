// BlockGallery — proves "every block is simulatable": ALL 83 L1 blocks grouped by the 9 groups, each with a
// LIVE preview on real recent closed bars (via the shared BlockViz). Blocks WITH parameters get a "⚙ chỉnh
// tham số" toggle → an inline BlockPlayground (drag the knobs, watch the preview reshape). Read-only catalog.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { BLOCKS } from "../lib/blocks/blockLibrary.ts";
import { L1_GROUPS, type L1Group, type L1PrimitiveBlockSpec } from "../lib/blocks/blockTypes.ts";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { BlockViz, GROUP_COLOR } from "./BlockViz.tsx";
import { BlockPlayground } from "./BlockPlayground.tsx";
import { baseSeriesFrom, computeBlockSeries, defaultParams } from "../lib/blocks/blockDemo.ts";
import { BlockGroupsExplainer } from "./BlockGroupsExplainer.tsx";

const GLABEL: Record<L1Group, string> = {
  SOURCE: "Source", CANDLE_ANATOMY: "Candle anatomy", ROLLING_WINDOW: "Rolling window", NORMALIZE: "Normalization",
  SMOOTH_LAG_MOMENTUM: "Smoothing, lag and momentum", MATH: "Math", LOGIC_CONNECTOR: "Logic", FSM_STATE: "State machine", SAFETY_OUTPUT: "Safety and outputs",
};
const fmt = (v: number) => (!isFinite(v) ? "—" : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
const inpBtn: React.CSSProperties = { background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text2)", borderRadius: 5, padding: "2px 7px", fontSize: 10, cursor: "pointer", marginTop: 5 };

export function BlockGallery({ onClose }: { onClose: () => void }) {
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("");
  const [showExplain, setShowExplain] = useState(false);
  useEffect(() => { let live = true; loadSimOhlc("M15", false).then((d) => { if (live && d?.bars?.length) setBars(d.bars.slice(-120)); }); return () => { live = false; }; }, []);

  const base = useMemo(() => baseSeriesFrom(bars), [bars]);
  const demos = useMemo(() => { const o: Record<string, number[] | null> = {}; if (!bars.length) return o; for (const b of BLOCKS) o[b.blockId] = computeBlockSeries(b, bars, base, defaultParams(b)); return o; }, [bars, base]);
  const match = (b: L1PrimitiveBlockSpec) => !q || b.label.toLowerCase().includes(q.toLowerCase()) || b.blockId.includes(q.toLowerCase());

  return (
    <div style={{ position: "fixed", inset: 0, background: "#070b11", zIndex: 130, display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box" }}>
      <div className="pc-h" style={{ color: "#9fd0ff", borderColor: "#1f5b8c", display: "flex", alignItems: "center", gap: 10 }}>
        <Glyph name="books" size={14} /> Block library · evaluated previews {BLOCKS.length} block <span className="mut">on {bars.length || "…"} completed historical M15 bars</span>
        <button onClick={() => setShowExplain((s) => !s)} style={{ marginLeft: "auto", background: showExplain ? TK.cyan : "var(--mfe-s3)", border: "1px solid " + TK.cyan, color: showExplain ? "#06101a" : TK.cyan, borderRadius: 6, padding: "4px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Glyph name="book" size={12} /> Group reference</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={"Find a block…"} style={{ background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 9px", fontSize: 12, width: 200 }} />
        <button onClick={onClose} style={{ background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text)", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}><Glyph name="x" size={11} /> Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {showExplain && <BlockGroupsExplainer onClose={() => setShowExplain(false)} />}
        {L1_GROUPS.map((g) => {
          const list = BLOCKS.filter((b) => b.group === g && match(b)); if (!list.length) return null;
          return (
            <div key={g} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: GROUP_COLOR[g] }} />
                <span style={{ fontWeight: 800, color: GROUP_COLOR[g], fontSize: 13 }}>{GLABEL[g]}</span>
                <span className="pmut psm">{list.length} block</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(216px, 1fr))", gap: 8, alignItems: "start" }}>
                {list.map((b) => {
                  const sig = `${b.inputs.map((p) => (p.type === "STREAM_OHLC" ? "bars" : p.type)).join("·") || "—"} → ${b.outputs[0].type}`;
                  const last = demos[b.blockId]?.length ? demos[b.blockId]![demos[b.blockId]!.length - 1] : undefined;
                  const hasParams = b.parameters.length > 0, open = openId === b.blockId;
                  return (
                    <div key={b.blockId} style={{ background: "var(--mfe-s2)", border: "1px solid var(--mfe-border)", borderColor: GROUP_COLOR[g], borderRadius: 4, padding: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <b style={{ fontSize: 12.5, color: "#e7eef6" }}>{b.label}</b>
                        {b.outputs[0].scaleFree && <span title={"scale-free"} style={{ fontSize: 8.5, color: TK.green, border: "1px solid #1c5b3c", borderRadius: 4, padding: "0 3px" }}>SF</span>}
                        {b.provisional && <span title="provisional" style={{ fontSize: 8.5, color: TK.orange }}><Glyph name="warning" size={9} /></span>}
                        {last !== undefined && <span style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)", fontSize: 11, color: GROUP_COLOR[g] }}>{fmt(last)}</span>}
                      </div>
                      <div className="pmut" style={{ fontSize: 9, fontFamily: "var(--mfe-mono)", margin: "2px 0 5px" }}>{sig}</div>
                      {open && hasParams
                        ? <BlockPlayground block={b} bars={bars} W={196} H={46} />
                        : <BlockViz block={b} series={demos[b.blockId] ?? null} bars={bars} W={196} H={46} />}
                      {!open && <div className="pmut" style={{ fontSize: 9.5, marginTop: 5, lineHeight: 1.35 }}>{b.description.length > 84 ? b.description.slice(0, 82) + "…" : b.description}</div>}
                      {hasParams && <button onClick={() => setOpenId(open ? "" : b.blockId)} style={inpBtn}>{open ? "Close" : <><Glyph name="gear" size={10} /> Parameters ({b.parameters.length})</>}</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ flexShrink: 0, paddingTop: 6, fontSize: 10.5, color: TK.muted, textAlign: "center" }}>
        Previews evaluate selected inputs on historical bars. Candle measurements, price overlays, boolean ribbons and numeric series describe the transformation; they are not trading performance.
      </div>
    </div>
  );
}
