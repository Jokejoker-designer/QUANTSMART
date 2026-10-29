// FeatureFlowCanvas — INTERACTIVE flowchart editor (like the FSM mockup). Nodes are shaped by role (SOURCE/FSM
// rounded · transforms rect · LOGIC diamond · Emit triangle · output ringed like END). You can: drag nodes,
// draw wires by dragging an OUTPUT port handle onto an INPUT port (type-checked — invalid drops are rejected),
// drop palette blocks onto the canvas, and click a node to inspect. Auto-layout seeds positions. L1 = measurement.
import { useMemo, useRef, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { BLOCKS_BY_ID } from "../lib/blocks/blockLibrary.ts";
import { canConnect, type L1Group } from "../lib/blocks/blockTypes.ts";
import type { FeatureGraph, FeatureNode } from "../lib/blocks/featureGraph.ts";

const GROUP_COLOR: Record<L1Group, string> = {
  SOURCE: "#7aa2ff", CANDLE_ANATOMY: "#5ad1c4", ROLLING_WINDOW: "#9d8bff", NORMALIZE: "#ffb454",
  SMOOTH_LAG_MOMENTUM: "#6fb3ff", MATH: "#8b98a8", LOGIC_CONNECTOR: "#c792ea", FSM_STATE: "#c792ea", SAFETY_OUTPUT: "#21d07a",
};
const PORT_LABEL: Record<string, string> = { cond: "?", a: "then", b: "else", on: "on", enter: "khi", event: "events", reset: "reset" };
const NODEW = 138, NODEH = 48, COLW = 200, ROWH = 92, PAD = 30;
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
type Shape = "diamond" | "triangle" | "round" | "rect";
function shapeOf(blockId: string, group: L1Group): Shape {
  if (group === "LOGIC_CONNECTOR") return "diamond";
  if (blockId === "emit_feature" || blockId === "map_label") return "triangle";
  if (group === "SOURCE" || group === "FSM_STATE") return "round";
  return "rect";
}

// auto-layout (topo depth → columns) used to SEED positions for nodes that have no explicit x/y yet.
function autoLayout(g: FeatureGraph) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const calc = (id: string, stack: Set<string>): number => {
    const c = depth.get(id); if (c !== undefined) return c;
    const n = byId.get(id); if (!n || stack.has(id)) return 0;
    stack.add(id); let d = 0; for (const up of n.inputs) if (up) d = Math.max(d, calc(up, stack) + 1);
    stack.delete(id); depth.set(id, d); return d;
  };
  g.nodes.forEach((n) => calc(n.id, new Set()));
  const cols = new Map<number, FeatureNode[]>();
  g.nodes.forEach((n) => { const d = depth.get(n.id) ?? 0; (cols.get(d) ?? cols.set(d, []).get(d)!).push(n); });
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, list] of cols) list.forEach((n, i) => pos.set(n.id, { x: PAD + d * COLW, y: PAD + i * ROWH }));
  return pos;
}

interface Props {
  graph: FeatureGraph; sel: string; onSel: (id: string) => void; latest: Record<string, number>;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (nodeId: string, portIdx: number, upId: string) => void;
  onCreate: (blockId: string, x: number, y: number) => void;
  onAutoLayout: () => void;
}

export function FeatureFlowCanvas({ graph, sel, onSel, latest, onMove, onConnect, onCreate, onAutoLayout }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const auto = useMemo(() => autoLayout(graph), [graph]);
  const pos = (n: FeatureNode) => ({ x: n.x ?? auto.get(n.id)?.x ?? 40, y: n.y ?? auto.get(n.id)?.y ?? 40 });
  const byId = (id: string) => graph.nodes.find((n) => n.id === id);
  const [drag, setDrag] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null);
  const [badFlash, setBadFlash] = useState(0);

  const toSvg = (e: { clientX: number; clientY: number }) => { const r = svgRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const numPorts = (n: FeatureNode) => (BLOCKS_BY_ID[n.blockId]?.inputs.filter((p) => p.type !== "STREAM_OHLC") ?? []);
  const portY = (n: FeatureNode, k: number, K: number) => pos(n).y + (NODEH * (k + 1)) / (K + 1);
  const centerR = (n: FeatureNode) => ({ x: pos(n).x + NODEW, y: pos(n).y + NODEH / 2 });

  function onPointerMove(e: React.PointerEvent) {
    const p = toSvg(e);
    if (drag) onMove(drag.id, p.x - drag.ox, p.y - drag.oy);
    else if (wire) setWire({ ...wire, x: p.x, y: p.y });
  }
  function onPointerUp() { setDrag(null); setWire(null); }

  function tryConnect(targetId: string, k: number) {
    if (!wire) return;
    const from = byId(wire.from), tgt = byId(targetId); if (!from || !tgt) { setWire(null); return; }
    const fb = BLOCKS_BY_ID[from.blockId], port = numPorts(tgt)[k];
    if (fb && port && wire.from !== targetId && canConnect(fb.outputs[0].type, port)) onConnect(targetId, k, wire.from);
    else { setBadFlash(Date.now()); setTimeout(() => setBadFlash(0), 350); }
    setWire(null);
  }

  // canvas size grows with node positions
  const maxX = Math.max(600, ...graph.nodes.map((n) => pos(n).x + NODEW + 60));
  const maxY = Math.max(360, ...graph.nodes.map((n) => pos(n).y + NODEH + 60));

  return (
    <div style={{ position: "relative", overflow: "auto", flex: 1, minHeight: 0, background: "#0b0f15", borderRadius: 8, border: badFlash ? "1px solid " + TK.red : "1px solid var(--mfe-border)" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("l1block"); if (id && BLOCKS_BY_ID[id]) { const p = toSvg(e); onCreate(id, p.x - NODEW / 2, p.y - NODEH / 2); } }}>
      <div style={{ position: "absolute", top: 6, right: 8, zIndex: 2 }}>
        <button onClick={onAutoLayout} style={{ background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text2)", borderRadius: 6, padding: "3px 9px", fontSize: 11, cursor: "pointer" }}>⤢ Auto Layout</button>
      </div>
      <svg ref={svgRef} width={maxX} height={maxY} style={{ display: "block", touchAction: "none" }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <defs><marker id="ffc-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3 L0,6 Z" fill="#5b6b7d" /></marker></defs>

        {/* edges */}
        {graph.nodes.map((n) => {
          const b = BLOCKS_BY_ID[n.blockId]; if (!b) return null;
          const ports = numPorts(n), K = ports.length;
          return n.inputs.map((up, k) => {
            const u = up ? byId(up) : null; if (!u) return null;
            const s = centerR(u), ey = portY(n, k, K), ex = pos(n).x, mx = (s.x + ex) / 2;
            const lbl = PORT_LABEL[ports[k]?.name] ?? "";
            return (
              <g key={n.id + "<" + k} onClick={() => onConnect(n.id, k, "")} style={{ cursor: "pointer" }}>
                <path d={`M${s.x},${s.y} C${mx},${s.y} ${mx},${ey} ${ex},${ey}`} fill="none" stroke="#3d4a5a" strokeWidth={1.5} markerEnd="url(#ffc-arrow)" />
                {lbl && <text x={mx} y={(s.y + ey) / 2 - 3} fill="#7d8da0" fontSize={9} textAnchor="middle">{lbl}</text>}
              </g>
            );
          });
        })}
        {/* pending wire */}
        {wire && (() => { const f = byId(wire.from); if (!f) return null; const s = centerR(f); return <path d={`M${s.x},${s.y} L${wire.x},${wire.y}`} stroke={TK.cyan} strokeWidth={1.6} strokeDasharray="4 3" fill="none" />; })()}

        {/* nodes */}
        {graph.nodes.map((n) => {
          const b = BLOCKS_BY_ID[n.blockId]; if (!b) return null;
          const p = pos(n), col = GROUP_COLOR[b.group], sh = shapeOf(b.blockId, b.group), isOut = graph.output === n.id, on = sel === n.id;
          const cx = p.x + NODEW / 2, cy = p.y + NODEH / 2, v = latest[n.id], ports = numPorts(n), K = ports.length;
          let shapeEl: React.ReactNode;
          if (sh === "diamond") shapeEl = <polygon points={`${cx},${cy - NODEH / 2} ${cx + NODEW / 2},${cy} ${cx},${cy + NODEH / 2} ${cx - NODEW / 2},${cy}`} fill={col + "1f"} stroke={on ? col : col + "99"} strokeWidth={on ? 2.4 : 1.5} />;
          else if (sh === "triangle") shapeEl = <polygon points={`${p.x},${p.y} ${p.x + NODEW},${p.y} ${cx},${p.y + NODEH}`} fill={col + "22"} stroke={on ? col : col + "99"} strokeWidth={on ? 2.4 : 1.5} />;
          else shapeEl = <rect x={p.x} y={p.y} width={NODEW} height={NODEH} rx={sh === "round" ? NODEH / 2 : 7} fill={col + "1a"} stroke={on ? col : col + "88"} strokeWidth={on ? 2.4 : 1.5} />;
          return (
            <g key={n.id}>
              {isOut && <rect x={p.x - 4} y={p.y - 4} width={NODEW + 8} height={NODEH + 8} rx={10} fill="none" stroke={TK.red} strokeWidth={1.3} strokeDasharray="3 3" />}
              <g onPointerDown={(e) => { e.stopPropagation(); onSel(n.id); const sp = toSvg(e); setDrag({ id: n.id, ox: sp.x - p.x, oy: sp.y - p.y }); }} style={{ cursor: "grab" }}>
                {shapeEl}
                <text x={cx} y={cy - 3} fill="#e7eef6" fontSize={10.5} fontWeight={700} textAnchor="middle" style={{ pointerEvents: "none" }}>{b.label.length > 18 ? b.label.slice(0, 17) + "…" : b.label}</text>
                <text x={cx} y={cy + 9} fill={col} fontSize={9} textAnchor="middle" fontFamily="var(--mfe-mono)" style={{ pointerEvents: "none" }}>{v === undefined ? b.outputs[0].type : fmt(v)}</text>
                {isOut && <text x={cx} y={p.y - 8} fill={TK.red} fontSize={8.5} fontWeight={800} textAnchor="middle" style={{ pointerEvents: "none" }}>OUTPUT</text>}
              </g>
              {/* input ports (left) */}
              {ports.map((port, k) => { const yy = portY(n, k, K), wired = !!n.inputs[k]; return (
                <circle key={"i" + k} cx={p.x} cy={yy} r={5} fill={wired ? col : "#0b0f15"} stroke={!wired && port.required ? TK.orange : col} strokeWidth={1.5}
                  onPointerUp={(e) => { e.stopPropagation(); tryConnect(n.id, k); }}
                  onPointerDown={(e) => { e.stopPropagation(); if (!wire && wired) onConnect(n.id, k, ""); }} style={{ cursor: "pointer" }}><title>{port.name} ({port.type}){wired ? "Click to disconnect" : ""}</title></circle>
              ); })}
              {/* output port (right) */}
              {b.outputs[0].type !== "FEATURE_OUTPUT" && <circle cx={p.x + NODEW} cy={cy} r={5} fill="#0b0f15" stroke={col} strokeWidth={1.6}
                onPointerDown={(e) => { e.stopPropagation(); const sp = toSvg(e); setWire({ from: n.id, x: sp.x, y: sp.y }); }} style={{ cursor: "crosshair" }}><title>Drag to connect an output</title></circle>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
