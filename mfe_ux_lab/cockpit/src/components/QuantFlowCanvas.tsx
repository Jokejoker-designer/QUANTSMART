// QuantFlowCanvas — INTERACTIVE wire editor for the L3 Block-Tree/AST (mirrors L1's FeatureFlowCanvas WORKFLOW but
// is NATIVE to the QuantGraph model — different node/port shape, so no shared code). You can: drag nodes, draw wires
// by dragging a node's OUTPUT port onto another node's INPUT port (arity-checked, cycle-rejected — every L3 output is
// a causal series so there is no type matrix, only operand count), drop Node-Library blocks onto the canvas, set the
// OUTPUT (✪) and delete (×). Selecting a node bubbles up so the side editor can tune its const/param/input.
// Graph is the working source of truth in "Nối" mode; the parent re-derives Formula Text on every edit. Advisory only.
import { useRef, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { OP_SPEC } from "../lib/blocks/quantAstTypes.ts";
import { NODE_W, NODE_H, arityOf, type QuantGraph, type QuantGraphNode } from "../lib/blocks/quantFlowGraph.ts";

const KIND_COLOR: Record<string, string> = {
  INPUT: "#7aa2ff", CONST: "#8b98a8", POINT_OP: "#6fb3ff", ROLLING_OP: "#9d8bff", LOGIC_OP: "#c792ea", MACRO: "#ffb454",
};
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));

function nodeTitle(n: QuantGraphNode): string {
  if (n.kind === "INPUT") return n.inputRef ?? "input";
  if (n.kind === "CONST") return fmt(n.constValue ?? 0);
  return n.op ? OP_SPEC[n.op]?.label ?? n.op : "?";
}
function nodeBadge(n: QuantGraphNode): string {
  if (!n.op) return n.kind === "INPUT" ? "L1/L2" : n.kind === "CONST" ? "number" : "";
  const s = OP_SPEC[n.op];
  if (s?.windowed && n.params?.window) return "w" + n.params.window;
  if ((n.op === "LAG" || n.op === "DELTA") && n.params?.lag) return "k" + n.params.lag;
  if (n.op === "QUANTILE" && n.params?.q != null) return "q" + n.params.q;
  return s?.kind?.replace("_OP", "").toLowerCase() ?? "";
}
// does srcId reach dstId following children? (used to reject a wire that would create a cycle)
function reaches(g: QuantGraph, srcId: string, dstId: string): boolean {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const dfs = (id: string): boolean => { if (id === dstId) return true; if (seen.has(id)) return false; seen.add(id); const n = byId.get(id); return !!n && n.children.some((c) => !!c && dfs(c)); };
  return dfs(srcId);
}

interface Props {
  graph: QuantGraph; sel: string | null; onSel: (id: string | null) => void; latest?: Record<string, number>;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (nodeId: string, portIdx: number, upId: string) => void; // upId="" → disconnect that port
  onCreate: (blockId: string, x: number, y: number) => void;
  onSetOutput: (id: string) => void;
  onDelete: (id: string) => void;
  onAutoLayout: () => void;
}

export function QuantFlowCanvas({ graph, sel, onSel, latest, onMove, onConnect, onCreate, onSetOutput, onDelete, onAutoLayout }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const byId = (id: string) => graph.nodes.find((n) => n.id === id);
  const [drag, setDrag] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null);
  const [badFlash, setBadFlash] = useState(0);

  const toSvg = (e: { clientX: number; clientY: number }) => { const r = svgRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const portY = (n: QuantGraphNode, k: number, K: number) => n.y + (NODE_H * (k + 1)) / (K + 1);
  const rightC = (n: QuantGraphNode) => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 });
  const flashBad = () => { setBadFlash(Date.now()); setTimeout(() => setBadFlash(0), 350); };

  function onPointerMove(e: React.PointerEvent) { const p = toSvg(e); if (drag) onMove(drag.id, p.x - drag.ox, p.y - drag.oy); else if (wire) setWire({ ...wire, x: p.x, y: p.y }); }
  function onPointerUp() { setDrag(null); setWire(null); }

  function tryConnect(targetId: string, k: number) {
    if (!wire) return;
    const ok = wire.from !== targetId && !reaches(graph, wire.from, targetId); // self + cycle guard
    if (ok) onConnect(targetId, k, wire.from); else flashBad();
    setWire(null);
  }

  const maxX = Math.max(620, ...graph.nodes.map((n) => n.x + NODE_W + 70));
  const maxY = Math.max(340, ...graph.nodes.map((n) => n.y + NODE_H + 60));

  return (
    <div style={{ position: "relative", overflow: "auto", flex: 1, minHeight: 320, background: "#0b0f15", borderRadius: 8, border: badFlash ? "1px solid " + TK.red : "1px solid var(--mfe-border)" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("qblock"); if (id) { const p = toSvg(e); onCreate(id, p.x - NODE_W / 2, p.y - NODE_H / 2); } }}>
      <div style={{ position: "absolute", top: 6, right: 8, zIndex: 2, display: "flex", gap: 6 }}>
        <button onClick={onAutoLayout} style={{ background: "var(--mfe-s3)", border: "1px solid var(--mfe-border)", color: "var(--mfe-text2)", borderRadius: 6, padding: "3px 9px", fontSize: 11, cursor: "pointer" }}>Arrange graph</button>
      </div>
      {graph.nodes.length === 0 && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mfe-text3)", fontSize: 12, pointerEvents: "none", textAlign: "center" }}>Add blocks from the node library<br />and connect output ports to required inputs</div>}
      <svg ref={svgRef} width={maxX} height={maxY} style={{ display: "block", touchAction: "none" }} onPointerDown={() => onSel(null)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <defs><marker id="qfc-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3 L0,6 Z" fill="#5b6b7d" /></marker></defs>

        {/* edges (child k of n ← up). click to disconnect */}
        {graph.nodes.map((n) => { const K = arityOf(n); return n.children.map((up, k) => {
          const u = up ? byId(up) : null; if (!u) return null;
          const s = rightC(u), ey = portY(n, k, K), ex = n.x, mx = (s.x + ex) / 2;
          return (
            <g key={n.id + "<" + k} onClick={() => onConnect(n.id, k, "")} style={{ cursor: "pointer" }}>
              <path d={`M${s.x},${s.y} C${mx},${s.y} ${mx},${ey} ${ex},${ey}`} fill="none" stroke="#3d4a5a" strokeWidth={1.5} markerEnd="url(#qfc-arrow)" />
            </g>
          );
        }); })}
        {/* pending wire */}
        {wire && (() => { const f = byId(wire.from); if (!f) return null; const s = rightC(f); return <path d={`M${s.x},${s.y} L${wire.x},${wire.y}`} stroke={TK.cyan} strokeWidth={1.6} strokeDasharray="4 3" fill="none" />; })()}

        {/* nodes */}
        {graph.nodes.map((n) => {
          const col = KIND_COLOR[n.kind] ?? "#8b98a8", isOut = graph.output === n.id, on = sel === n.id;
          const cx = n.x + NODE_W / 2, cy = n.y + NODE_H / 2, K = arityOf(n), v = latest?.[n.id];
          const diamond = n.kind === "LOGIC_OP";
          return (
            <g key={n.id}>
              {isOut && <rect x={n.x - 4} y={n.y - 4} width={NODE_W + 8} height={NODE_H + 8} rx={10} fill="none" stroke={TK.red} strokeWidth={1.3} strokeDasharray="3 3" />}
              <g onPointerDown={(e) => { e.stopPropagation(); onSel(n.id); const sp = toSvg(e); setDrag({ id: n.id, ox: sp.x - n.x, oy: sp.y - n.y }); }} style={{ cursor: "grab" }}>
                {diamond
                  ? <polygon points={`${cx},${n.y} ${n.x + NODE_W},${cy} ${cx},${n.y + NODE_H} ${n.x},${cy}`} fill={col + "1f"} stroke={on ? col : col + "99"} strokeWidth={on ? 2.4 : 1.5} />
                  : <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={n.kind === "INPUT" || n.kind === "CONST" ? NODE_H / 2 : 7} fill={col + "1a"} stroke={on ? col : col + "88"} strokeWidth={on ? 2.4 : 1.5} />}
                <text x={cx} y={cy - 2} fill="#e7eef6" fontSize={11} fontWeight={700} textAnchor="middle" style={{ pointerEvents: "none" }}>{(() => { const t = nodeTitle(n); return t.length > 16 ? t.slice(0, 15) + "…" : t; })()}</text>
                <text x={cx} y={cy + 10} fill={col} fontSize={8.5} textAnchor="middle" fontFamily="var(--mfe-mono)" style={{ pointerEvents: "none" }}>{v !== undefined ? fmt(v) : nodeBadge(n)}</text>
              </g>
              {isOut && <text x={cx} y={n.y - 8} fill={TK.red} fontSize={8.5} fontWeight={800} textAnchor="middle" style={{ pointerEvents: "none" }}>OUTPUT</text>}
              {/* set-output ✪ (top-left) + delete × (top-right) */}
              <text x={n.x + 3} y={n.y + 11} fill={isOut ? TK.red : "#5b6b7d"} fontSize={12} style={{ cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); onSetOutput(n.id); }}><title>Use as OUTPUT</title>✪</text>
              <text x={n.x + NODE_W - 11} y={n.y + 11} fill="#5b6b7d" fontSize={12} style={{ cursor: "pointer" }} onPointerDown={(e) => { e.stopPropagation(); onDelete(n.id); }}><title>Remove node</title>×</text>
              {/* input ports (left) */}
              {Array.from({ length: K }).map((_, k) => { const yy = portY(n, k, K), wired = !!n.children[k]; return (
                <circle key={"i" + k} cx={n.x} cy={yy} r={5} fill={wired ? col : "#0b0f15"} stroke={wired ? col : TK.orange} strokeWidth={1.5}
                  onPointerUp={(e) => { e.stopPropagation(); tryConnect(n.id, k); }}
                  onPointerDown={(e) => { e.stopPropagation(); if (!wire && wired) onConnect(n.id, k, ""); }} style={{ cursor: "pointer" }}><title>input ports {k + 1}/{K}{wired ? "Click to disconnect" : "Not connected"}</title></circle>
              ); })}
              {/* output port (right) — every node can feed another */}
              <circle cx={n.x + NODE_W} cy={cy} r={5} fill="#0b0f15" stroke={col} strokeWidth={1.6}
                onPointerDown={(e) => { e.stopPropagation(); const sp = toSvg(e); setWire({ from: n.id, x: sp.x, y: sp.y }); }} style={{ cursor: "crosshair" }}><title>Drag to connect an output</title></circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
