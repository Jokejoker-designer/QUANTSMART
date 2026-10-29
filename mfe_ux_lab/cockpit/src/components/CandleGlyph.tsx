// CandleGlyph — draws ONE candle and HIGHLIGHTS the exact part an anatomy block measures (body / upper wick /
// lower wick / range / close-location / typical / gap / direction). Far more intuitive than a sparkline for
// CANDLE_ANATOMY blocks: the user sees the candle and the lit region the number comes from. Read-only.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type AnatomyPart = "body" | "upper" | "lower" | "range" | "close" | "typical" | "gap" | "direction";
export const ANATOMY_PART: Record<string, AnatomyPart> = {
  body: "body", body_ratio: "body", upper_wick: "upper", upper_wick_ratio: "upper",
  lower_wick: "lower", lower_wick_ratio: "lower", range: "range", true_range: "range",
  clv: "close", typical_price: "typical", gap: "gap", direction: "direction",
};
const HI = "#5ad1c4", DIM = "#46566a";

export function CandleGlyph({ bar, prev, part, value, W = 168, H = 60 }: { bar: OhlcBar; prev?: OhlcBar; part: AnatomyPart; value?: number; W?: number; H?: number }) {
  const padT = 8, padB = 8, cx = 34, bw = 22;
  const lo = part === "gap" && prev ? Math.min(bar.l, prev.c) : bar.l;
  const hi = part === "gap" && prev ? Math.max(bar.h, prev.c) : bar.h;
  const span = hi - lo || 1;
  const y = (p: number) => padT + ((hi - p) / span) * (H - padT - padB);
  const up = bar.c >= bar.o;
  const bodyTop = y(Math.max(bar.o, bar.c)), bodyBot = y(Math.min(bar.o, bar.c));
  const dirCol = up ? "#21d07a" : "#f7768e";
  const baseCol = part === "direction" ? dirCol : DIM;

  const overlay: React.ReactNode[] = [];
  if (part === "body") overlay.push(<rect key="o" x={cx - bw / 2} y={bodyTop} width={bw} height={Math.max(2, bodyBot - bodyTop)} fill={HI + "55"} stroke={HI} strokeWidth={2} rx={1.5} />);
  else if (part === "upper") overlay.push(<line key="o" x1={cx} y1={y(bar.h)} x2={cx} y2={bodyTop} stroke={HI} strokeWidth={3.5} />, <text key="t" x={cx + bw} y={(y(bar.h) + bodyTop) / 2 + 3} fontSize={9} fill={HI}>upper</text>);
  else if (part === "lower") overlay.push(<line key="o" x1={cx} y1={bodyBot} x2={cx} y2={y(bar.l)} stroke={HI} strokeWidth={3.5} />, <text key="t" x={cx + bw} y={(bodyBot + y(bar.l)) / 2 + 3} fontSize={9} fill={HI}>lower</text>);
  else if (part === "range") overlay.push(<line key="o" x1={cx + bw} y1={y(bar.h)} x2={cx + bw} y2={y(bar.l)} stroke={HI} strokeWidth={2} />, <line key="t" x1={cx + bw - 3} y1={y(bar.h)} x2={cx + bw + 3} y2={y(bar.h)} stroke={HI} strokeWidth={2} />, <line key="b" x1={cx + bw - 3} y1={y(bar.l)} x2={cx + bw + 3} y2={y(bar.l)} stroke={HI} strokeWidth={2} />, <text key="x" x={cx + bw + 6} y={(y(bar.h) + y(bar.l)) / 2 + 3} fontSize={9} fill={HI}>range</text>);
  else if (part === "close") overlay.push(<circle key="o" cx={cx} cy={y(bar.c)} r={4} fill={HI} />, <line key="l" x1={cx + bw / 2} y1={y(bar.c)} x2={W - 36} y2={y(bar.c)} stroke={HI} strokeDasharray="2 2" strokeWidth={1} />, <text key="t" x={W - 33} y={y(bar.c) + 3} fontSize={9} fill={HI}>close</text>);
  else if (part === "typical") { const tp = (bar.h + bar.l + bar.c) / 3; overlay.push(<line key="o" x1={cx - bw} y1={y(tp)} x2={cx + bw + 16} y2={y(tp)} stroke={HI} strokeWidth={2} />, <text key="t" x={cx + bw + 18} y={y(tp) + 3} fontSize={9} fill={HI}>typ</text>); }
  else if (part === "gap" && prev) overlay.push(<line key="o" x1={cx - bw} y1={y(prev.c)} x2={cx + bw} y2={y(prev.c)} stroke="#ffb454" strokeDasharray="3 2" strokeWidth={1.5} />, <text key="t" x={cx + bw + 4} y={y(prev.c) + 3} fontSize={8.5} fill="#ffb454">prev close</text>);
  else if (part === "direction") overlay.push(<text key="o" x={cx + bw + 8} y={H / 2 + 4} fontSize={16} fill={dirCol}>{up ? "▲" : "▼"}</text>);

  return (
    <svg width={W} height={H} style={{ display: "block", background: "var(--mfe-s2)", borderRadius: 6 }}>
      <line x1={cx} y1={y(bar.h)} x2={cx} y2={y(bar.l)} stroke={baseCol} strokeWidth={1.5} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={Math.max(2, bodyBot - bodyTop)} fill={baseCol + "44"} stroke={baseCol} strokeWidth={1.3} rx={1.5} />
      {overlay}
      {value !== undefined && <text x={4} y={H - 5} fontSize={10} fill={HI} fontFamily="var(--mfe-mono)" fontWeight={700}>{Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3)}</text>}
    </svg>
  );
}

// is a block's output on the SAME scale as price? (close/high/roll_max/ema/sma/lag/swing → yes; ratios/std/
// z-score/slope → no). Auto-detected so ANY price-scale block can render on a candle chart, not just SOURCE.
const median = (a: number[]) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
export function isPriceScale(series: number[], bars: OhlcBar[]): boolean {
  const f = series.filter(isFinite); if (!f.length || bars.length < 2) return false;
  const lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h)), pad = (hi - lo) || 1;
  const med = median(f);
  return hi > lo && med >= lo - pad && med <= hi + pad;
}

// MiniCandleChart — last ~44 candles + an optional price-series overlay (the block's output, when price-scale).
export function MiniCandleChart({ bars, line, color = "#37c0ff", W = 186, H = 48 }: { bars: OhlcBar[]; line?: number[]; color?: string; W?: number; H?: number }) {
  const K = Math.min(bars.length, 44);
  const b = bars.slice(-K), L = line ? line.slice(-K) : null;
  let lo = Math.min(...b.map((x) => x.l)), hi = Math.max(...b.map((x) => x.h));
  if (L) { const lf = L.filter(isFinite); if (lf.length) { lo = Math.min(lo, ...lf); hi = Math.max(hi, ...lf); } }
  const span = hi - lo || 1, cw = W / K, y = (p: number) => 3 + ((hi - p) / span) * (H - 6);
  const pts = L ? L.map((v, i) => (isFinite(v) ? `${i * cw + cw / 2},${y(v)}` : "")).filter(Boolean).join(" ") : "";
  return (
    <svg width={W} height={H} style={{ display: "block", background: "var(--mfe-s2)", borderRadius: 6 }}>
      {b.map((x, i) => { const up = x.c >= x.o, cx = i * cw + cw / 2, c = up ? "#2a6b4d" : "#7a3a44", bt = y(Math.max(x.o, x.c)), bb = y(Math.min(x.o, x.c)); return (
        <g key={i}><line x1={cx} y1={y(x.h)} x2={cx} y2={y(x.l)} stroke={c} strokeWidth={0.8} /><rect x={cx - cw * 0.32} y={bt} width={Math.max(1, cw * 0.64)} height={Math.max(0.8, bb - bt)} fill={c} /></g>
      ); })}
      {pts && <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} />}
    </svg>
  );
}
