// BlockViz — the single source of truth for "how a block draws its live preview": CANDLE_ANATOMY → a real
// candle with the measured part lit; any price-scale output → a candle chart with the output overlaid; BOOL →
// ribbon; [0,1] → gauge; else → sparkline; pure control nodes → a runtime badge. Reused by Gallery + Playground.
import { TK } from "./ui/Ui.tsx";
import type { L1Group, L1PrimitiveBlockSpec } from "../lib/blocks/blockTypes.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { CandleGlyph, ANATOMY_PART, MiniCandleChart, isPriceScale } from "./CandleGlyph.tsx";

export const GROUP_COLOR: Record<L1Group, string> = {
  SOURCE: "#7aa2ff", CANDLE_ANATOMY: "#5ad1c4", ROLLING_WINDOW: "#9d8bff", NORMALIZE: "#ffb454",
  SMOOTH_LAG_MOMENTUM: "#6fb3ff", MATH: "#8b98a8", LOGIC_CONNECTOR: "#c792ea", FSM_STATE: "#c792ea", SAFETY_OUTPUT: "#21d07a",
};
const fmt = (v: number) => (!isFinite(v) ? "—" : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));

function Sparkline({ s, color, ratio, W, H }: { s: number[]; color: string; ratio?: boolean; W: number; H: number }) {
  const f = s.filter(isFinite); if (!f.length) return <div className="pmut psm">—</div>;
  const lo = ratio ? 0 : Math.min(...f), hi = ratio ? 1 : Math.max(...f), span = hi - lo || 1;
  const pts = s.map((v, i) => `${(i / (s.length - 1 || 1)) * W},${H - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * H}`).join(" ");
  return <svg width={W} height={H} style={{ display: "block", background: "var(--mfe-s2)", borderRadius: 6 }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} /></svg>;
}
function Ribbon({ s, color, W, H }: { s: number[]; color: string; W: number; H: number }) {
  const n = s.length || 1, bw = W / n;
  return <svg width={W} height={H} style={{ display: "block", background: "var(--mfe-s2)", borderRadius: 6 }}>{s.map((v, i) => <rect key={i} x={i * bw} y={0} width={bw + 0.6} height={H} fill={v > 0.5 ? color : "#1a2230"} opacity={v > 0.5 ? 0.85 : 0.5} />)}</svg>;
}
function Gauge({ v, color, W, H }: { v: number; color: string; W: number; H: number }) {
  const fill = Math.min(1, Math.max(0, v));
  return <svg width={W} height={H} style={{ display: "block", background: "var(--mfe-s2)", borderRadius: 6 }}><rect x={6} y={H / 2 - 7} width={W - 12} height={14} rx={7} fill="#1a2230" /><rect x={6} y={H / 2 - 7} width={(W - 12) * fill} height={14} rx={7} fill={color} /><text x={W / 2} y={H / 2 + 4} fontSize={11} textAnchor="middle" fill="#e7eef6" fontFamily="var(--mfe-mono)">{fmt(v)}</text></svg>;
}

export function BlockViz({ block, series, bars, W = 186, H = 46 }: { block: L1PrimitiveBlockSpec; series: number[] | null; bars: OhlcBar[]; W?: number; H?: number }) {
  if (!series) return <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: TK.muted, fontSize: 10, background: "var(--mfe-s3)", borderRadius: 6 }}> Control node evaluated by the state machine</div>;
  const last = series.length ? series[series.length - 1] : 0;
  const ratio = block.outputs[0].range === "[0,1]";
  const col = GROUP_COLOR[block.group];
  if (block.group === "CANDLE_ANATOMY" && bars.length) { const part = ANATOMY_PART[block.blockId]; if (part) return <CandleGlyph bar={bars[bars.length - 1]} prev={bars[bars.length - 2]} part={part} value={last} W={W} H={H} />; }
  if (bars.length && isPriceScale(series, bars)) return <MiniCandleChart bars={bars} line={series} color={col} W={W} H={H} />;
  if (block.outputs[0].type === "BOOL") return <Ribbon s={series} color={col} W={W} H={H} />;
  if (block.viz === "gauge" || ratio) return <Gauge v={last} color={col} W={W} H={H} />;
  return <Sparkline s={series} color={col} ratio={ratio} W={W} H={H} />;
}
