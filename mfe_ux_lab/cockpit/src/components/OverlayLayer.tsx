// OverlayLayer — draws a standard indicator's price-panel overlay (Ichimoku cloud + lines · Bollinger/Donchian
// bands · SuperTrend line · Fib levels) as an SVG <g>, so the L2 builder chart can show the loaded preset's REAL
// picture over the candles (clear cloud/lines/levels), not just bare candles. Price-scale only (sub-panels skipped).
import type { IndicatorOverlay } from "../lib/blocks/stdIndicators.ts";

export function OverlayLayer({ ov, cw, yP, W }: { ov: IndicatorOverlay; cw: number; yP: (p: number) => number; W: number }) {
  const xk = (k: number) => k * cw + cw / 2;
  const pts = (s: number[]) => s.map((v, i) => (isFinite(v) ? `${xk(i).toFixed(1)},${yP(v).toFixed(1)}` : "")).filter(Boolean).join(" ");
  const area = (top: number[], bot: number[]) => { const idx = top.map((_, i) => i).filter((i) => isFinite(top[i]) && isFinite(bot[i])); if (!idx.length) return ""; const t = idx.map((i) => `${xk(i).toFixed(1)},${yP(top[i]).toFixed(1)}`).join(" L"); const b = idx.slice().reverse().map((i) => `${xk(i).toFixed(1)},${yP(bot[i]).toFixed(1)}`).join(" L"); return `M${t} L${b} Z`; };
  const cloudUp = ov.cloud ? (ov.cloud.a[ov.cloud.a.length - 1] >= ov.cloud.b[ov.cloud.b.length - 1] ? ov.cloud.up : ov.cloud.down) : "";
  return (
    <g>
      {ov.cloud && <path d={area(ov.cloud.a, ov.cloud.b)} fill={cloudUp} opacity={0.16} />}
      {ov.cloud && <><polyline points={pts(ov.cloud.a)} fill="none" stroke={ov.cloud.up} strokeWidth={0.9} opacity={0.65} /><polyline points={pts(ov.cloud.b)} fill="none" stroke={ov.cloud.down} strokeWidth={0.9} opacity={0.65} /></>}
      {[...(ov.bands ? [ov.bands] : []), ...(ov.bandList ?? [])].map((bd, bi) => <g key={"bd" + bi}><path d={area(bd.upper, bd.lower)} fill={bd.color} opacity={0.1} /><polyline points={pts(bd.upper)} fill="none" stroke={bd.color} strokeWidth={1} />{bd.mid && <polyline points={pts(bd.mid)} fill="none" stroke={bd.color} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.7} />}<polyline points={pts(bd.lower)} fill="none" stroke={bd.color} strokeWidth={1} /></g>)}
      {ov.lines?.map((l) => <polyline key={l.name} points={pts(l.series)} fill="none" stroke={l.color} strokeWidth={1.4} />)}
      {ov.levels?.map((lv) => <g key={lv.label}><line x1={0} y1={yP(lv.price)} x2={W} y2={yP(lv.price)} stroke={lv.color} strokeWidth={0.8} strokeDasharray="4 3" opacity={0.85} /><text x={W - 30} y={yP(lv.price) - 1.5} fontSize={8} fill={lv.color}>{lv.label}</text></g>)}
    </g>
  );
}
