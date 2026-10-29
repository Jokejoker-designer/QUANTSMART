// MicroChart — TradingView-style INTERACTIVE chart for the Microscope page (navy theme, my colors).
// Left vertical tool rail (cursor/trend/h-line/rect/measure + magnet snap + clear), drag-to-PAN,
// mouse-wheel ZOOM (cursor-centered), crosshair with axis price/time boxes, current-price dotted line +
// label box, session background blocks, EMA10/34, labeled zone boxes. Diagnostic ONLY · no orders.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { ChartGlyph, type CChartZone, type CChartLine } from "./CockpitChart.tsx";
import { EPISODE_COLOR, type EpisodeBand } from "../lib/ch/chEpisodeSegments.ts";
import { arrangeZoneLabels } from "../lib/chartZoneLabels.ts";
import { useLiveTickFeed } from "../lib/liveTickFeed.ts";
import { withFormingBar } from "../lib/liveTickModel.ts";
import { useElementSize } from "../core/useElementSize.ts";

const ZONE_PAINT: Record<string, string> = {
  observation: "var(--accent-cyan)", confirmation: "var(--bull-green)",
  risk: "var(--bear-red)", invalidation: "var(--zone-purple)",
  target: "var(--bull-green)", avoid: "var(--warn-amber)",
};
const zonePaint = (zone: CChartZone) => ZONE_PAINT[zone.role] || zone.color;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
type Tool = "cursor" | "trend" | "hline" | "fib" | "rect" | "brush" | "text" | "measure";
interface Pt { i: number; p: number }
interface Draw { kind: "rect" | "hline" | "trend" | "measure" | "fib" | "brush" | "text"; a: Pt; b: Pt; color: string; pts?: Pt[]; text?: string }

function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = []; let prev = vals[0] ?? 0;
  vals.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); out.push(prev); }); return out;
}
const fp = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortTime = (t: string) => { const m = t.match(/(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${m[1]}-${m[2]} ${m[3]}` : t.slice(5, 16); };
const hhmm = (t: string) => { const m = t.match(/T(\d{2}:\d{2})/); return m ? m[1] : ""; };
// 3 main sessions (UTC): Asia · Europe (London) · US (New York). Overlap hours fold into Europe/US.
function sessionOf(iso: string) { const m = iso.match(/T(\d{2}):/); const h = m ? +m[1] : 0; if (h >= 21 || h < 7) return { k: "ASIA", c: "var(--accent-cyan)" }; if (h < 13) return { k: "EUROPE", c: "var(--bull-green)" }; return { k: "US", c: "var(--zone-purple)" }; }

function Ico({ n }: { n: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (n) {
    case "cursor": return <svg {...p}><line x1="10" y1="2" x2="10" y2="7" /><line x1="10" y1="13" x2="10" y2="18" /><line x1="2" y1="10" x2="7" y2="10" /><line x1="13" y1="10" x2="18" y2="10" /></svg>;
    case "trend": return <svg {...p}><line x1="4" y1="16" x2="16" y2="4" /><circle cx="4" cy="16" r="1.6" /><circle cx="16" cy="4" r="1.6" /></svg>;
    case "hline": return <svg {...p}><line x1="3" y1="10" x2="17" y2="10" /><circle cx="3" cy="10" r="1.6" /><circle cx="17" cy="10" r="1.6" /></svg>;
    case "fib": return <svg {...p}><line x1="3" y1="4" x2="17" y2="4" /><line x1="3" y1="8" x2="17" y2="8" /><line x1="3" y1="12" x2="17" y2="12" /><line x1="3" y1="16" x2="17" y2="16" /><line x1="3" y1="16" x2="17" y2="4" opacity="0.5" /></svg>;
    case "rect": return <svg {...p}><rect x="4" y="5" width="12" height="10" rx="1.5" /></svg>;
    case "brush": return <svg {...p}><path d="M4 16 C 7 9, 11 13, 16 5" /><circle cx="16" cy="5" r="1.3" /></svg>;
    case "text": return <svg {...p}><path d="M5 5 H15 M10 5 V16" /></svg>;
    case "measure": return <svg {...p}><rect x="3" y="7" width="14" height="6" rx="1" /><line x1="7" y1="7" x2="7" y2="10" /><line x1="11" y1="7" x2="11" y2="10" /><line x1="15" y1="7" x2="15" y2="10" /></svg>;
    case "magnet": return <svg {...p}><path d="M6 3 V10 a4 4 0 0 0 8 0 V3" /><line x1="4.5" y1="3" x2="7.5" y2="3" /><line x1="12.5" y1="3" x2="15.5" y2="3" /></svg>;
    case "lock": return <svg {...p}><rect x="5" y="9" width="10" height="7" rx="1.5" /><path d="M7.5 9 V6.5 a2.5 2.5 0 0 1 5 0 V9" /></svg>;
    case "eye": return <svg {...p}><path d="M2 10 C5 6,15 6,18 10 C15 14,5 14,2 10 Z" /><circle cx="10" cy="10" r="2" /></svg>;
    case "trash": return <svg {...p}><path d="M4 6 H16 M7 6 V4 H13 V6 M6 6 L7 17 H13 L14 6" /></svg>;
    default: return null;
  }
}

export interface SignalMarker {
  i: number; price: number; side: "low" | "high"; reads: string; label: string; measures: string;
  wick_atr: number; wick_threshold_atr: number | null; wick_unusual: boolean; close_pos: number | null;
  verdict: string | null; base_rate: number | null; conditional_rate: number | null; lift: number | null;
  sample_n: number | null; outcome: "correct" | "wrong" | "pending"; time: string; why_factors?: string[];
  projection?: { dir: "up" | "down"; target: number; lo: number; hi: number; tol_atr: number; bars: number; atr_used?: number; atr_raw?: number; mtf_factor?: number; tf_ladder?: string[]; target_atr?: number; calibrated?: boolean; calib_n?: number };
  context_assessment?: "STRONG" | "WEAK" | "MIXED" | "NEUTRAL";
  lessons_applied?: { factor: string; kind: "strong" | "weak"; hit_rate: number | null; oos_hit_rate: number | null; lift: number; oos_lift: number | null; n: number }[];
}

export interface TradeSeg { entryI: number; entry: number; exitI: number; exit: number; dir: "BUY" | "SELL"; outcome: "TP" | "SL"; R: number; why?: string[]; t?: string }

export function MicroChart({ bars: closedBars, zones = [], lines = [], symbol, tf, live = false, cursor = null, markers = [], signals = [], trades = [], episodes = [], formingEpisode = null, zoneLayout = "recent" }: {
  bars: OhlcBar[]; zones?: CChartZone[]; lines?: CChartLine[]; symbol: string; tf: string; live?: boolean;
  cursor?: number | null; markers?: { i: number; price: number; kind: string }[]; signals?: SignalMarker[]; trades?: TradeSeg[];
  episodes?: EpisodeBand[]; formingEpisode?: EpisodeBand | null;   // CH Episode Lens (observer) — coloured leg ribbon below the price plot
  zoneLayout?: "recent" | "wide";
}) {
  const tickFeed = useLiveTickFeed(symbol, tf, live);
  const frame = tickFeed.status === "live" || tickFeed.status === "stale" ? tickFeed.frame : null;
  const bars = useMemo(() => withFormingBar(closedBars, frame), [closedBars, frame]);
  const quote = frame?.ticks[frame.ticks.length - 1];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { ref: measureChart, size: chartSize } = useElementSize<HTMLDivElement>();
  const size = { w: chartSize.width, h: chartSize.height };
  const gRef = useRef({ start: 0, end: 1, n: 2, PX0: 8, slot: 1, live: false });
  const setViewRef = useRef<(v: [number, number]) => void>(() => {});
  const onWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const { start, end, n, PX0, slot, live } = gRef.current; const w = end - start; if (w < 1) return;
    const nw = Math.max(8, Math.min(2500, n - 1, Math.round(w * (e.deltaY < 0 ? 0.82 : 1.22)))); // cap zoom-out so we never render too many candles
    if (live) { const b = n - 1, a = Math.max(0, b - nw); setViewRef.current([a, b]); return; } // LIVE: keep the current candle pinned to the right edge
    const rect = wrapRef.current!.getBoundingClientRect();
    const center = Math.max(start, Math.min(end, start + Math.floor((e.clientX - rect.left - PX0) / slot)));
    let a = Math.round(center - (center - start) * (nw / w)); if (a < 0) a = 0;
    let b = a + nw; if (b > n - 1) { b = n - 1; a = Math.max(0, b - nw); }
    setViewRef.current([a, b]);
  }, []);
  const setWrap = useCallback((el: HTMLDivElement | null) => {
    if (wrapRef.current) wrapRef.current.removeEventListener("wheel", onWheelNative);
    wrapRef.current = el; measureChart(el); if (!el) return;
    el.addEventListener("wheel", onWheelNative, { passive: false });
  }, [onWheelNative, measureChart]);

  const n = bars.length;
  const [view, setView] = useState<[number, number]>([Math.max(0, n - 400), Math.max(1, n - 1)]); // recent window (perf w/ long history)
  const [sigHover, setSigHover] = useState<number | null>(null);   // which candle-pattern signal is hovered
  const [tradeHover, setTradeHover] = useState<number | null>(null);   // which trade entry (by entryI) is hovered → "why" popup
  setViewRef.current = setView;
  const [tool, setTool] = useState<Tool>("cursor");
  const [magnet, setMagnet] = useState(false);
  const [lock, setLock] = useState(false);
  const [hideDraws, setHideDraws] = useState(false);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [temp, setTemp] = useState<Draw | null>(null);
  const drag = useRef<{ x: number; a: Pt; view0: [number, number]; moved: boolean } | null>(null);
  useEffect(() => { setView([Math.max(0, n - 400), Math.max(1, n - 1)]); }, [n, tf]);
  useEffect(() => { if (cursor != null && cursor >= 1) setView([Math.max(0, cursor - 110), Math.max(1, cursor)]); }, [cursor]);

  const W = size.w, H = size.h, ML = 6, MR = 78, MT = 10, MB = 22;
  const PX0 = ML, PX1 = W - MR, PW = PX1 - PX0, PY0 = MT, PY1 = H - MB, PH = PY1 - PY0;
  const [start, end] = [Math.max(0, Math.min(view[0], n - 2)), Math.min(n - 1, Math.max(view[1], view[0] + 1))];
  const nView = end - start + 1;
  const vis = bars.slice(start, end + 1);
  const closes = useMemo(() => bars.map((b) => b.c), [bars]);
  const emaF = useMemo(() => ema(closes, 10), [closes]);
  const emaS = useMemo(() => ema(closes, 34), [closes]);
  const vwap = useMemo(() => { let cum = 0; return bars.map((b, i) => { cum += (b.h + b.l + b.c) / 3; return cum / (i + 1); }); }, [bars]);
  const pivots = useMemo(() => { const w = 3; const out: { i: number; price: number; dir: "high" | "low" }[] = []; for (let i = w; i < n - w; i++) { let hi = true, lo = true; for (let k = 1; k <= w; k++) { if (bars[i].h < bars[i - k].h || bars[i].h < bars[i + k].h) hi = false; if (bars[i].l > bars[i - k].l || bars[i].l > bars[i + k].l) lo = false; } if (hi) out.push({ i, price: bars[i].h, dir: "high" }); else if (lo) out.push({ i, price: bars[i].l, dir: "low" }); } return out; }, [bars, n]);
  if (n < 2) return <div ref={setWrap} style={{ flex: 1, minHeight: 0, display: "flex" }}><div className="mfe-empty" style={{ flex: 1 }}><div className="ic">◫</div><div className="msg">Loading candles…</div></div></div>;

  // Y-domain fits the visible candles AND any overlaid zones/lines, so wider zones (e.g. a higher-TF Setup
  // Fit) auto-zoom the chart out instead of clipping. Zone influence is capped to K× the candle range so the
  // candles never squish to nothing on an extreme TF mismatch.
  const lo0c = Math.min(...vis.map((b) => b.l)), hi0c = Math.max(...vis.map((b) => b.h));
  const rng0 = (hi0c - lo0c) || 1, K = 3;
  const zvals = [...zones.flatMap((z) => [z.lo, z.hi]), ...lines.map((l) => l.price)]
    .filter((v) => typeof v === "number" && isFinite(v))
    .map((v) => Math.max(lo0c - K * rng0, Math.min(hi0c + K * rng0, v)));
  const lo0 = Math.min(lo0c, ...(zvals.length ? zvals : [lo0c])), hi0 = Math.max(hi0c, ...(zvals.length ? zvals : [hi0c]));
  const pad = (hi0 - lo0) * 0.08 || 1; const lo = lo0 - pad, hi = hi0 + pad, span = hi - lo || 1;
  // right offset: leave a few empty bar-slots on the right (like TradingView) so the forming candle breathes
  const roff = Math.min(22, Math.max(4, Math.round(nView * 0.07)));
  const slot = PW / (nView + roff), bw = Math.max(slot * 0.64, 1);
  const xFor = (i: number) => PX0 + (i - start + 0.5) * slot;
  const yFor = (p: number) => PY0 + PH * (1 - (p - lo) / span);
  const barAt = (x: number) => Math.max(start, Math.min(end, start + Math.floor((x - PX0) / slot)));
  const barF = (x: number) => start + (x - PX0) / slot;
  const priceAt = (y: number) => lo + (1 - (y - PY0) / PH) * span;
  const xy = (e: React.PointerEvent) => { const r = wrapRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const snap = (i: number, p: number): number => { if (!magnet) return p; const b = bars[i]; if (!b) return p; return [b.o, b.h, b.l, b.c].reduce((a, v) => Math.abs(v - p) < Math.abs(a - p) ? v : a, b.c); };
  gRef.current = { start, end, n, PX0, slot, live };

  function onDown(e: React.PointerEvent) {
    const { x, y } = xy(e); (e.target as Element).setPointerCapture?.(e.pointerId);
    const i = barAt(x); const a: Pt = { i, p: snap(i, priceAt(y)) };
    drag.current = { x, a, view0: [start, end], moved: false };
    if (tool === "hline") { setDraws((d) => [...d, { kind: "hline", a, b: a, color: "var(--accent-cyan)" }]); drag.current = null; return; }
    if (tool === "text") { drag.current = null; const t = window.prompt("Text label:"); if (t) setDraws((d) => [...d, { kind: "text", a, b: a, color: "var(--warn-amber)", text: t }]); return; }
    if (tool === "brush") { const fp0 = { i: barF(x), p: priceAt(y) }; setTemp({ kind: "brush", a: fp0, b: fp0, pts: [fp0], color: "var(--accent-cyan)" }); }
  }
  function onMove(e: React.PointerEvent) {
    const { x, y } = xy(e); setHover({ x, y }); const d = drag.current; if (!d) return;
    if (Math.abs(x - d.x) > 2) d.moved = true;
    const i = barAt(x); const b: Pt = { i, p: snap(i, priceAt(y)) };
    if (tool === "cursor") { const delta = Math.round((d.x - x) / slot); let a0 = d.view0[0] + delta, b0 = d.view0[1] + delta; if (a0 < 0) { b0 -= a0; a0 = 0; } if (b0 > n - 1) { a0 -= b0 - (n - 1); b0 = n - 1; } setView([Math.max(0, a0), Math.min(n - 1, b0)]); }
    else if (tool === "brush") { const np = { i: barF(x), p: priceAt(y) }; setTemp((t) => (t ? { ...t, pts: [...(t.pts || []), np], b: np } : t)); }
    else setTemp({ kind: tool, a: d.a, b, color: tool === "measure" ? (b.p >= d.a.p ? "var(--bull-green)" : "var(--bear-red)") : "var(--accent-cyan)" });
  }
  function onUp() { const d = drag.current; drag.current = null; if (d && temp && tool !== "cursor") { if (tool === "measure") { setTemp(temp); setTimeout(() => setTemp(null), 2500); } else { setDraws((dr) => [...dr, temp]); setTemp(null); } } }
  const reset = () => setView([Math.max(0, n - 400), n - 1]);

  const blocks: { x0: number; x1: number; c: string; k: string }[] = [];
  for (let i = start; i <= end; i++) { const s = sessionOf(bars[i].t); const last = blocks[blocks.length - 1]; if (last && last.k === s.k) last.x1 = xFor(i) + slot / 2; else blocks.push({ x0: xFor(i) - slot / 2, x1: xFor(i) + slot / 2, c: s.c, k: s.k }); }
  const poly = (arr: number[]) => arr.slice(start, end + 1).map((v, j) => `${xFor(start + j).toFixed(1)},${Math.max(PY0, Math.min(PY1, yFor(v))).toFixed(1)}`).join(" ");
  const gy = Array.from({ length: 6 }, (_, k) => lo + (span * (k + 0.5)) / 6);
  const xstep = Math.max(1, Math.ceil(nView / 9)); const gx: number[] = []; for (let i = start; i <= end; i += xstep) gx.push(i);
  const hb = hover ? bars[barAt(hover.x)] : null;
  const last = bars[end], lp = last.c, ly = yFor(lp), upBar = last.c >= last.o;
  const prevC = (bars[end - 1] || last).c, chg = lp - prevC, chgPct = prevC ? (chg / prevC) * 100 : 0;
  // TV-behavior: OHLC legend theo nến ĐANG HOVER (không hover → nến cuối). Presentation-only — chỉ đổi nến nào
  // được ĐỌC ra legend, không đổi bất kỳ giá trị dữ liệu nào.
  const legendI = hover ? barAt(hover.x) : end;
  const lb = bars[legendI] || last, lbPrevC = (bars[legendI - 1] || lb).c;
  const lchg = lb.c - lbPrevC, lchgPct = lbPrevC ? (lchg / lbPrevC) * 100 : 0, lbUp = lb.c >= lb.o;
  // plan zones are "as of NOW" — anchor them to the recent/right area so they don't read like historical levels
  const xNow = xFor(end); const xAnchor = Math.max(PX0, xNow - Math.min(nView - 1, 20) * slot);
  const compactZoneLabels = zoneLayout === "wide" && PX1 - PX0 < 340;
  const zoneLabelY = arrangeZoneLabels(zones.map((z) => yFor((z.hi + z.lo) / 2)), PY0 + (compactZoneLabels ? 98 : 64), PY1 - 12, compactZoneLabels ? 32 : 18);

  const drawEl = (d: Draw, k: number, tmp = false) => {
    const op = tmp ? 0.85 : 1;
    if (d.kind === "brush") return <polyline key={k} points={(d.pts || []).map((pt) => `${xFor(pt.i).toFixed(1)},${yFor(pt.p).toFixed(1)}`).join(" ")} fill="none" stroke={d.color} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" opacity={op} />;
    if (d.kind === "text") return <text key={k} x={xFor(d.a.i)} y={yFor(d.a.p)} fill={d.color} fontSize="12" fontWeight="700" opacity={op}>{d.text}</text>;
    if (d.kind === "fib") { const lv = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]; const x1 = Math.min(xFor(d.a.i), xFor(d.b.i)), x2 = Math.max(xFor(d.a.i), xFor(d.b.i)); return <g key={k} opacity={op}>{lv.map((L, li) => { const p = d.a.p + (d.b.p - d.a.p) * L; const y = yFor(p); const col = L === 0 || L === 1 ? "var(--text-secondary)" : L === 0.618 ? "var(--warn-amber)" : "var(--text-secondary)"; return <g key={li}><line x1={x1} y1={y} x2={x2} y2={y} stroke={col} strokeWidth="1" strokeDasharray="4 3" /><text x={x1 + 3} y={y - 2} fill={col} fontSize="9" fontFamily={MONO}>{L} · {fp(p)}</text></g>; })}<line x1={xFor(d.a.i)} y1={yFor(d.a.p)} x2={xFor(d.b.i)} y2={yFor(d.b.p)} stroke="var(--text-secondary)" strokeWidth="0.8" opacity="0.4" /></g>; }
    if (d.kind === "hline") return <g key={k}><line x1={PX0} y1={yFor(d.a.p)} x2={PX1} y2={yFor(d.a.p)} stroke={d.color} strokeWidth="1.2" strokeDasharray="6 4" opacity={op} /><text x={PX0 + 4} y={yFor(d.a.p) - 3} fill={d.color} fontSize="10" fontFamily={MONO}>{fp(d.a.p)}</text></g>;
    if (d.kind === "trend") return <line key={k} x1={xFor(d.a.i)} y1={yFor(d.a.p)} x2={xFor(d.b.i)} y2={yFor(d.b.p)} stroke={d.color} strokeWidth="1.7" opacity={op} />;
    const x = Math.min(xFor(d.a.i), xFor(d.b.i)), x2 = Math.max(xFor(d.a.i), xFor(d.b.i)), y = Math.min(yFor(d.a.p), yFor(d.b.p)), y2 = Math.max(yFor(d.a.p), yFor(d.b.p));
    if (d.kind === "measure") {
      const dp = d.b.p - d.a.p, dpct = d.a.p ? (dp / d.a.p) * 100 : 0, dbars = Math.abs(d.b.i - d.a.i);
      return <g key={k}><rect x={x} y={y} width={Math.max(1, x2 - x)} height={Math.max(1, y2 - y)} fill={d.color} fillOpacity="0.12" stroke={d.color} strokeWidth="1.2" /><rect x={(x + x2) / 2 - 52} y={d.b.p >= d.a.p ? y - 26 : y2 + 4} width="104" height="22" rx="3" fill="var(--bg-panel)" stroke={d.color} /><text x={(x + x2) / 2} y={(d.b.p >= d.a.p ? y - 11 : y2 + 19)} fill={d.color} fontSize="10" fontWeight="700" textAnchor="middle" fontFamily={MONO}>{dp >= 0 ? "+" : ""}{fp(dp)} · {dpct >= 0 ? "+" : ""}{dpct.toFixed(2)}% · {dbars} bars</text></g>;
    }
    return <rect key={k} x={x} y={y} width={Math.max(1, x2 - x)} height={Math.max(1, y2 - y)} fill={d.color} fillOpacity="0.12" stroke={d.color} strokeWidth="1.2" opacity={op} />;
  };

  const TOOLS: { id: Tool; t: string }[] = [{ id: "cursor", t: "Cursor / drag-pan" }, { id: "trend", t: "Trend line" }, { id: "hline", t: "Horizontal line" }, { id: "fib", t: "Fib retracement" }, { id: "rect", t: "Rectangle box" }, { id: "brush", t: "Brush (freehand)" }, { id: "text", t: "Text label" }, { id: "measure", t: "Measure" }];
  const tbtn = (active: boolean): React.CSSProperties => ({ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, cursor: "pointer", border: "1px solid transparent", background: active ? "rgba(0,229,255,.16)" : "transparent", color: active ? "var(--accent-cyan)" : "var(--text-secondary)" });

  return (
    <div className="mfe-market-chart" style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, border: "1px solid var(--border-panel)", borderRadius: 6, overflow: "hidden", background: "var(--chart-canvas)" }}>
      {/* left tool rail */}
      <div style={{ width: 40, flexShrink: 0, borderRight: "1px solid var(--border-subtle)", background: "var(--bg-panel)", display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0", gap: 2, overflowY: "auto" }}>
        {TOOLS.map((t) => <button key={t.id} title={t.t} onClick={() => setTool(t.id)} style={tbtn(tool === t.id)}><Ico n={t.id} /></button>)}
        <div style={{ width: 22, height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
        <button title="Magnet (snap to OHLC)" onClick={() => setMagnet((m) => !m)} style={tbtn(magnet)}><Ico n="magnet" /></button>
        <button title="Lock drawings" onClick={() => setLock((l) => !l)} style={tbtn(lock)}><Ico n="lock" /></button>
        <button title={hideDraws ? "Show drawings" : "Hide drawings"} onClick={() => setHideDraws((h) => !h)} style={tbtn(hideDraws)}><Ico n="eye" /></button>
        <div style={{ flex: 1, minHeight: 6 }} />
        <button title="Clear drawings" disabled={lock} onClick={() => { if (!lock) setDraws([]); }} style={{ ...tbtn(false), color: lock ? "#3a4d61" : "#ff8c8c", cursor: lock ? "not-allowed" : "pointer" }}><Ico n="trash" /></button>
      </div>

      {/* chart + bottom bar */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {live && <div className="micro-live-quote" aria-label="Live tick feed" data-ticks={tickFeed.received} data-tick-time={quote?.time_msc} data-bid={quote?.bid} data-ask={quote?.ask} style={{ minHeight: 25, display: "flex", gap: 14, alignItems: "center", padding: "3px 8px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", font: `11px ${MONO}`, fontVariantNumeric: "tabular-nums" }}><span style={{ color: tickFeed.status === "live" ? "var(--bull-green)" : "var(--warn-amber)" }}>{tickFeed.status === "live" ? "Tick live" : tickFeed.status === "stale" ? "Waiting for tick" : "Connecting feed"}</span><span>BID <b>{quote ? quote.bid.toLocaleString("en-US", { maximumFractionDigits: 5 }) : "—"}</b></span><span>ASK <b>{quote ? quote.ask.toLocaleString("en-US", { maximumFractionDigits: 5 }) : "—"}</b></span><span>{frame ? `${frame.broker_symbol} · forming candle` : ""}</span></div>}
        <div className="mfe-chart-plot" ref={setWrap} style={{ flex: 1, minHeight: 0, display: "flex", position: "relative", background: "var(--chart-canvas)" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: "var(--chart-canvas)", cursor: tool === "cursor" ? (drag.current ? "grabbing" : "crosshair") : "cell", touchAction: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)}>
            {blocks.map((b, k) => <g key={`s${k}`}><rect x={Math.max(PX0, b.x0)} y={PY0} width={Math.max(0, Math.min(PX1, b.x1) - Math.max(PX0, b.x0))} height={PH} fill={b.c} opacity="0.045" />{b.x1 - b.x0 > 40 && <text x={(Math.max(PX0, b.x0) + Math.min(PX1, b.x1)) / 2} y={PY0 + 10} fill={b.c} fontSize="8.5" textAnchor="middle" opacity="0.55" fontWeight="700">{b.k}</text>}</g>)}
            {gy.map((p, k) => <g key={`gy${k}`}><line x1={PX0} y1={yFor(p)} x2={PX1} y2={yFor(p)} className="mfe-chart-grid" stroke="var(--chart-grid)" /><text x={W - 5} y={yFor(p) + 3} fill="var(--text-secondary)" fontSize="10" textAnchor="end" fontFamily={MONO}>{fp(p)}</text></g>)}
            {gx.map((i) => <g key={`gx${i}`}><line x1={xFor(i)} y1={PY0} x2={xFor(i)} y2={PY1} className="mfe-chart-grid" stroke="var(--chart-grid)" /><text x={xFor(i)} y={PY1 + 14} fill="var(--text-secondary)" fontSize="9.5" textAnchor="middle" fontFamily={MONO}>{shortTime(bars[i].t)}</text></g>)}
            {zones.map((z, k) => {
              const yT = Math.max(PY0, Math.min(PY1, yFor(z.hi))), yB = Math.max(PY0, Math.min(PY1, yFor(z.lo)));
              const left = zoneLayout === "wide" ? PX0 : xAnchor;
              if (z.hi === z.lo) return <line key={`z${k}`} x1={left} x2={PX1} y1={yT} y2={yT} stroke={zonePaint(z)} strokeDasharray="5 3" />;
              if (yB - yT < 0.5) return null;
              return <g key={`z${k}`}><rect x={left} y={yT} width={PX1 - left} height={yB - yT} fill={zonePaint(z)} opacity="0.13" stroke={zonePaint(z)} strokeOpacity="0.55" strokeDasharray="4 3" />{zoneLayout !== "wide" && <>{z.glyph && <ChartGlyph name={z.glyph} gx={xAnchor + 6} gy={zoneLabelY[k] - 9} gs={11} color={zonePaint(z)} />}<text x={xAnchor + 6 + (z.glyph ? 14 : 0)} y={zoneLabelY[k]} fill={zonePaint(z)} fontSize="9.5" fontWeight="800">{z.label}</text></>}</g>;
            })}
            {vis.map((b, j) => { const i = start + j; if (cursor != null && i > cursor) return null; const cx = xFor(i); const up = b.c >= b.o; const col = up ? "var(--bull-green)" : "var(--bear-red)"; const top = yFor(Math.max(b.o, b.c)), h = Math.max(Math.abs(yFor(b.o) - yFor(b.c)), 1); return <g key={i} data-candle-direction={up ? "up" : "down"}><line x1={cx} y1={yFor(b.h)} x2={cx} y2={yFor(b.l)} stroke={col} /><rect x={cx - bw / 2} y={top} width={bw} height={h} fill={col} /></g>; })}
            {/* CH Episode Lens (observer) — coloured leg ribbon just below the price plot: IMPULSE/CORRECTIVE/SWEEP/FAILED + forming (dashed) */}
            {(episodes.length > 0 || formingEpisode) && (() => {
              const yR = PY1 + 3, hR = 5, clampX = (x: number) => Math.max(PX0, Math.min(PX1, x));
              const seg = (b: EpisodeBand, key: string, forming: boolean) => {
                if (b.i1 < start || b.i0 > end) return null;                        // outside the zoom window
                const x0 = clampX(xFor(b.i0) - slot / 2), x1 = clampX(xFor(b.i1) + slot / 2);
                if (x1 - x0 < 0.6) return null;
                const c = EPISODE_COLOR[b.kind] || "#6e7681";
                return <rect key={key} x={x0} y={yR} width={x1 - x0} height={hR} rx={1.5} fill={c} opacity={forming ? 0.3 : 0.78} stroke={forming ? c : "none"} strokeWidth={forming ? 0.8 : 0} strokeDasharray={forming ? "3 2" : undefined}><title>{`${b.kind}${forming ? "· forming" : ""} · ${b.dir > 0 ? "▲" : b.dir < 0 ? "▼" : "•"}`}</title></rect>;
              };
              return <g>
                <text x={2} y={yR + 4.5} fill="var(--text-secondary)" fontSize="7.5" fontFamily={MONO}>ep</text>
                {episodes.map((b, k) => seg(b, "ep" + k, false))}
                {formingEpisode && seg(formingEpisode, "epF", true)}
              </g>;
            })()}
            {/* strategy trade markers — entry tagged BUY/SELL + timeframe; exit = TP/SL dot. Labels when zoomed in. */}
            {(markers || []).filter((m) => m.i >= start && m.i <= end && (cursor == null || m.i <= cursor) && m.price >= lo && m.price <= hi).map((m, k) => {
              const x = xFor(m.i), y = yFor(m.price), lab = nView < 360;
              const onMk = tradeHover === m.i;   // hover the entry triangle → same "why" popup (entry bar = trade.entryI)
              const mkHover = (m.kind === "buy" || m.kind === "sell") ? { style: { cursor: "help" as const }, onMouseEnter: () => setTradeHover(m.i), onMouseLeave: () => setTradeHover((h) => (h === m.i ? null : h)) } : {};
              if (m.kind === "buy") return (
                <g key={`mk${k}`} {...mkHover}>
                  <circle cx={x} cy={y + 8} r="12" fill="transparent" />
                  <path d={`M ${x} ${y + 12} l -5 -8 l 10 0 z`} fill="var(--bull-green)" stroke={onMk ? "#fff" : "var(--chart-canvas)"} strokeWidth={onMk ? 1.1 : 0.5} />
                  {lab && <g transform={`translate(${x},${y + 26})`}><rect x="-22" y="-7.5" width="44" height="14" rx="3" fill="#0c1f16" stroke="var(--bull-green)" strokeWidth="0.8" /><text x="0" y="2.6" fill="var(--bull-green)" fontSize="8.5" fontWeight="800" textAnchor="middle">▲ BUY {tf}</text></g>}
                </g>
              );
              if (m.kind === "sell") return (
                <g key={`mk${k}`} {...mkHover}>
                  <circle cx={x} cy={y - 8} r="12" fill="transparent" />
                  <path d={`M ${x} ${y - 12} l -5 8 l 10 0 z`} fill="var(--bear-red)" stroke={onMk ? "#fff" : "var(--chart-canvas)"} strokeWidth={onMk ? 1.1 : 0.5} />
                  {lab && <g transform={`translate(${x},${y - 26})`}><rect x="-22" y="-7.5" width="44" height="14" rx="3" fill="#1f0c0d" stroke="var(--bear-red)" strokeWidth="0.8" /><text x="0" y="2.6" fill="var(--bear-red)" fontSize="8.5" fontWeight="800" textAnchor="middle">▼ SELL {tf}</text></g>}
                </g>
              );
              const col = m.kind === "tp" ? "var(--bull-green)" : "var(--bear-red)";
              return <g key={`mk${k}`}><circle cx={x} cy={y} r="2.6" fill={col} stroke="var(--chart-canvas)" strokeWidth="0.8" />{lab && <text x={x + 5} y={y + 3} fill={col} fontSize="7.5" fontWeight="700" fontFamily={MONO}>{m.kind.toUpperCase()}</text>}</g>;
            })}
            {/* DECLARED projection zones — the up/down band the system states it expects, over the pending window */}
            {(signals || []).filter((s) => s.projection && s.i >= start && (s.outcome === "pending" || sigHover === s.i)).map((s, k) => {
              const pr = s.projection!;
              const x1 = xFor(s.i), x2 = xFor(s.i + pr.bars), yT = yFor(pr.hi), yB = yFor(pr.lo);
              const col = pr.dir === "up" ? "var(--bull-green)" : "var(--bear-red)";
              return (
                <g key={`proj${k}`}>
                  <rect x={x1} y={Math.min(yT, yB)} width={Math.max(2, x2 - x1)} height={Math.abs(yB - yT)} fill={col} opacity={s.outcome === "pending" ? 0.16 : 0.09} stroke={col} strokeOpacity="0.55" strokeDasharray="4 3" />
                  <line x1={x1} y1={yFor(pr.target)} x2={x2} y2={yFor(pr.target)} stroke={col} strokeWidth="1" strokeDasharray="2 2" opacity="0.75" />
                  {nView < 380 && <text x={x1 + 3} y={Math.min(yT, yB) - 2.5} fill={col} fontSize="8" fontWeight="700">{pr.dir === "up" ? "Upward observation" : "Downward observation"}</text>}
                </g>
              );
            })}
            {/* candle-pattern signals — hover any to see the system's DECLARATION (what it measures + odds + outcome) */}
            {(signals || []).filter((s) => s.i >= start && s.i <= end && (cursor == null || s.i <= cursor)).map((s, k) => {
              const x = xFor(s.i), yb = yFor(s.price), low = s.side === "low", y = low ? yb + 11 : yb - 11;
              const oc = s.outcome === "correct" ? "var(--bull-green)" : s.outcome === "wrong" ? "var(--bear-red)" : "var(--warn-amber)";
              const tri = low ? `M ${x} ${y - 5} l -4.5 7 l 9 0 z` : `M ${x} ${y + 5} l -4.5 -7 l 9 0 z`;
              const on = sigHover === s.i;
              return (
                <g key={`sig${k}`} style={{ cursor: "help" }} onMouseEnter={() => setSigHover(s.i)} onMouseLeave={() => setSigHover((h) => (h === s.i ? null : h))}>
                  <line x1={x} y1={yb} x2={x} y2={y} stroke={oc} strokeWidth="1" opacity="0.45" />
                  <circle cx={x} cy={y} r="9" fill="transparent" />
                  {(s.context_assessment === "WEAK" || s.context_assessment === "STRONG") && <circle cx={x} cy={y} r="6.5" fill="none" stroke={s.context_assessment === "STRONG" ? "var(--bull-green)" : "var(--warn-amber)"} strokeWidth="1.2" strokeDasharray="2 1.5" opacity="0.95" />}
                  <path d={tri} fill={oc} stroke={on ? "#fff" : "var(--chart-canvas)"} strokeWidth={on ? 1.1 : 0.6} opacity={on ? 1 : 0.9} />
                </g>
              );
            })}
            {/* strategy / shadow TRADES — entry dot → dashed line → ✕ CLOSE marker with R, so the exit shows on-chart */}
            {(trades || []).filter((t) => t.exitI >= start && t.entryI <= end && (cursor == null || t.exitI <= cursor)).map((t, k) => {
              const x1 = xFor(t.entryI), y1 = yFor(t.entry), x2 = xFor(t.exitI), y2 = yFor(t.exit), col = t.outcome === "TP" ? "var(--bull-green)" : "var(--bear-red)", lab = nView < 500;
              const onTr = tradeHover === t.entryI;
              return (
                <g key={`tr${k}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="1.1" strokeDasharray="3 2" opacity="0.65" />
                  <circle cx={x1} cy={y1} r="10" fill="transparent" style={{ cursor: "help" }} onMouseEnter={() => setTradeHover(t.entryI)} onMouseLeave={() => setTradeHover((h) => (h === t.entryI ? null : h))} />
                  <circle cx={x1} cy={y1} r={onTr ? 3.4 : 2.4} fill={t.dir === "BUY" ? "var(--bull-green)" : "var(--bear-red)"} stroke={onTr ? "#fff" : "var(--chart-canvas)"} strokeWidth={onTr ? 1.2 : 0.6} />
                  <g transform={`translate(${x2},${y2})`}>
                    <line x1="-4.5" y1="-4.5" x2="4.5" y2="4.5" stroke={col} strokeWidth="1.7" />
                    <line x1="-4.5" y1="4.5" x2="4.5" y2="-4.5" stroke={col} strokeWidth="1.7" />
                    {lab && <g transform="translate(0,-12)"><rect x="-24" y="-7" width="48" height="13" rx="3" fill="var(--bg-panel)" stroke={col} strokeWidth="0.8" /><text x="0" y="2.5" fill={col} fontSize="8" fontWeight="800" textAnchor="middle">✕ {t.outcome} {t.R >= 0 ? "+" : ""}{t.R}R</text></g>}
                  </g>
                </g>
              );
            })}
            <polyline points={poly(emaF)} fill="none" stroke="var(--accent-cyan)" strokeWidth="1.4" opacity="0.9" />
            <polyline points={poly(emaS)} fill="none" stroke="var(--warn-amber)" strokeWidth="1.4" opacity="0.9" />
            <polyline points={poly(vwap)} fill="none" stroke="var(--accent-cyan)" strokeWidth="1.1" strokeDasharray="5 4" opacity="0.7" />
            {pivots.filter((pv) => pv.i >= start && pv.i <= end).map((pv, k) => { const x = xFor(pv.i), y = yFor(pv.price) + (pv.dir === "high" ? -8 : 8), s = 3; const col = pv.dir === "high" ? "var(--zone-purple)" : "var(--bull-green)"; return <path key={`pv${k}`} d={`M ${x} ${y - s} L ${x + s} ${y} L ${x} ${y + s} L ${x - s} ${y} Z`} fill={col} opacity="0.85" />; })}
            <text x={PX0 + 5} y={PY1 - 5} fill="var(--accent-cyan)" fontSize="9.5" fontWeight="700" fontFamily={MONO}>VWAP · {fp(vwap[end])}</text>
            {lines.map((l, k) => { if (l.price < lo || l.price > hi) return null; const y = yFor(l.price); const gs = 11, tw = l.label.length * 5.6; return <g key={`l${k}`}><line x1={xAnchor} y1={y} x2={PX1} y2={y} stroke={l.color} strokeWidth="1.2" strokeDasharray={l.dash ? "5 3" : undefined} opacity="0.9" />{l.glyph && <ChartGlyph name={l.glyph} gx={PX1 - 5 - tw - gs - 2} gy={y - 12} gs={gs} color={l.color} />}<text x={PX1 - 5} y={y - 3} fill={l.color} fontSize="10" fontWeight="700" textAnchor="end">{l.label}</text></g>; })}
            {/* NOW marker — plan zones project from here */}
            <line x1={xNow} y1={PY0} x2={xNow} y2={PY1} stroke="var(--text-primary)" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
            <circle cx={xNow} cy={ly} r="3.5" fill={upBar ? "var(--bull-green)" : "var(--bear-red)"} stroke="var(--chart-canvas)" strokeWidth="1.5" />
            <rect x={xNow - 15} y={PY0 + 1} width="30" height="13" rx="3" fill="var(--bg-elevated)" stroke="var(--border-panel)" />
            <text x={xNow} y={PY0 + 10.5} fill="var(--text-primary)" fontSize="8.5" textAnchor="middle" fontWeight="700">NOW</text>
            {/* current-price dotted line + label box (TradingView style) */}
            <line x1={PX0} y1={ly} x2={PX1} y2={ly} stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="1 3" opacity="0.65" />
            <rect x={PX1} y={ly - 9} width={MR} height={18} fill={upBar ? "#074D36" : "#57152F"} stroke={upBar ? "var(--bull-green)" : "var(--bear-red)"} />
            <text x={PX1 + MR / 2} y={ly + 4} fill="#fff" fontSize="10.5" fontWeight="700" textAnchor="middle" fontFamily={MONO}>{fp(lp)}</text>
            {/* Wide current-context bands: full labels and price ranges, separated without moving prices. */}
            {zoneLayout === "wide" && zones.map((z, k) => {
              const prices = `${fp(z.lo)}${z.hi !== z.lo ? "–" + fp(z.hi) : ""}`;
              const text = `${z.label} · ${prices}`;
              const labelY = zoneLabelY[k], actualY = Math.max(PY0, Math.min(PY1, yFor((z.lo + z.hi) / 2)));
              return <g key={`wide-label-${k}`}><path d={`M${PX0 + 2},${actualY} L${PX0 + 7},${labelY - 4} L${PX0 + 12},${labelY - 4}`} stroke={zonePaint(z)} fill="none" /><rect x={PX0 + 12} y={labelY - (compactZoneLabels ? 24 : 13)} width={Math.min(PX1 - PX0 - 14, (compactZoneLabels ? Math.max(z.label.length, prices.length) : text.length) * 5.8 + 14)} height={compactZoneLabels ? 29 : 17} rx={2} fill="var(--bg-panel)" fillOpacity="0.94" /><text x={PX0 + 17} y={labelY - (compactZoneLabels ? 13 : 1)} fill={zonePaint(z)} fontSize="9.5" fontWeight="600" fontFamily={MONO}>{compactZoneLabels ? <><tspan>{z.label}</tspan><tspan x={PX0 + 17} dy={12}>{prices}</tspan></> : text}</text></g>;
            })}
            {/* The compact chart retains price-axis boundary tags. */}
            {zoneLayout !== "wide" && zones.flatMap((z) => [z.hi, z.lo]).filter((p) => p >= lo && p <= hi && Math.abs(yFor(p) - ly) > 11).map((p, k) => <g key={`zt${k}`}><rect x={PX1} y={yFor(p) - 8} width={MR} height={16} fill="var(--bg-panel)" stroke="var(--border-panel)" /><text x={PX1 + MR / 2} y={yFor(p) + 3} fill="var(--text-secondary)" fontSize="9.5" textAnchor="middle" fontFamily={MONO}>{fp(p)}</text></g>)}
            {/* OHLC + EMA legend overlay */}
            <text x={PX0 + 5} y={PY0 + 13} fill="var(--text-primary)" fontSize="12" fontWeight="800">{symbol} · {tf}{hover ? <tspan fill="var(--text-secondary)" fontSize="9" fontWeight="400" fontFamily={MONO}>  {shortTime(lb.t)}</tspan> : null}</text>
            {W < 480 ? <g fontSize="9" fontFamily={MONO} fill="var(--text-primary)">
              <text x={PX0 + 5} y={PY0 + 27}>O {fp(lb.o)} · H {fp(lb.h)}</text>
              <text x={PX0 + 5} y={PY0 + 39}>L {fp(lb.l)} · C {fp(lb.c)}</text>
              <text x={PX0 + 5} y={PY0 + 51} fill="var(--accent-cyan)">EMA10 {fp(emaF[end])}</text>
              <text x={PX0 + 5} y={PY0 + 63} fill="var(--warn-amber)">EMA34 {fp(emaS[end])}</text>
            </g> : <>
            <text x={PX0 + 5} y={PY0 + 28} fontSize="10" fontFamily={MONO}><tspan fill="var(--text-secondary)">O </tspan><tspan fill={lbUp ? "var(--bull-green)" : "var(--bear-red)"}>{fp(lb.o)}</tspan><tspan fill="var(--text-secondary)">  H </tspan><tspan fill={lbUp ? "var(--bull-green)" : "var(--bear-red)"}>{fp(lb.h)}</tspan><tspan fill="var(--text-secondary)">  L </tspan><tspan fill={lbUp ? "var(--bull-green)" : "var(--bear-red)"}>{fp(lb.l)}</tspan><tspan fill="var(--text-secondary)">  C </tspan><tspan fill={lbUp ? "var(--bull-green)" : "var(--bear-red)"}>{fp(lb.c)}</tspan><tspan fill={lchg >= 0 ? "var(--bull-green)" : "var(--bear-red)"} fontWeight="700">  {lchg >= 0 ? "+" : ""}{lchg.toFixed(2)} ({lchg >= 0 ? "+" : ""}{lchgPct.toFixed(2)}%)</tspan></text>
            <text x={PX0 + 5} y={PY0 + 42} fontSize="10" fontFamily={MONO}><tspan fill="var(--accent-cyan)" fontWeight="700">EMA 10 </tspan><tspan fill="#a9d8f0">{fp(emaF[end])}</tspan><tspan fill="var(--warn-amber)" fontWeight="700">   EMA 34 </tspan><tspan fill="#e7d59a">{fp(emaS[end])}</tspan></text>
            </>}
            {/* drawings */}
            {!hideDraws && draws.map((d, k) => drawEl(d, k))}
            {!hideDraws && temp && drawEl(temp, -1, true)}
            {/* crosshair + axis boxes */}
            {hover && (
              <g>
                <rect x={xFor(barAt(hover.x)) - slot / 2} y={PY0} width={slot} height={PH} fill="var(--accent-cyan)" opacity="0.05" />
                <line x1={hover.x} y1={PY0} x2={hover.x} y2={PY1} stroke="#3a4d61" strokeDasharray="2 3" />
                <line x1={PX0} y1={hover.y} x2={PX1} y2={hover.y} stroke="#3a4d61" strokeDasharray="2 3" />
                <rect x={PX1} y={hover.y - 9} width={MR} height={18} fill="var(--bg-elevated)" stroke="var(--border-panel)" /><text x={PX1 + MR / 2} y={hover.y + 4} fill="var(--text-primary)" fontSize="10" textAnchor="middle" fontFamily={MONO}>{fp(priceAt(hover.y))}</text>
                {hb && <><rect x={hover.x - 28} y={PY1} width="56" height="16" fill="var(--bg-elevated)" stroke="var(--border-panel)" /><text x={hover.x} y={PY1 + 12} fill="var(--text-primary)" fontSize="9" textAnchor="middle" fontFamily={MONO}>{hhmm(hb.t)}</text></>}
              </g>
            )}
          </svg>
          {/* candle-signal hover popup — the system DECLARES what it measures + its honest odds + outcome */}
          {(() => {
            if (sigHover == null) return null;
            const s = (signals || []).find((x) => x.i === sigHover);
            if (!s) return null;
            const x = xFor(s.i), y = yFor(s.price);
            const left = Math.max(6, Math.min(W - 236, x + 12));
            const top = Math.max(6, Math.min(H - 158, s.side === "low" ? y + 14 : y - 156));
            const oc = s.outcome === "correct" ? "var(--bull-green)" : s.outcome === "wrong" ? "var(--bear-red)" : "var(--warn-amber)";
            const isSig = (s.verdict || "").toUpperCase().startsWith("SIGNAL");
            const pc = (v: number | null) => (v == null ? "—" : Math.round(v * 100) + "%");
            return (
              <div style={{ position: "absolute", left, top, width: 224, background: "rgba(8,16,24,.97)", border: "1px solid " + oc, borderRadius: 8, padding: "9px 10px", fontSize: 11, color: "var(--text-primary)", boxShadow: "0 6px 20px rgba(0,0,0,.5)", pointerEvents: "none", zIndex: 20, lineHeight: 1.45 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <b style={{ color: oc, fontSize: 12 }}>{s.label}</b>
                  <span style={{ color: "var(--text-secondary)", fontSize: 9.5, fontFamily: MONO }}>{s.time.slice(5, 16)}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", marginBottom: 5 }}>{s.measures}</div>
                <div>Measured wick: <b style={{ color: "#dbe4ee" }}>{s.wick_atr} ATR</b> {s.wick_unusual ? <span style={{ color: oc }}>at or above threshold {s.wick_threshold_atr} unusually long within the reference distribution</span> : <span style={{ color: "var(--text-secondary)" }}>below threshold {s.wick_threshold_atr}</span>}</div>
                <div>Close location: <b>{s.close_pos != null ? Math.round(s.close_pos * 100) + "% of the bar" : "—"}</b> · directional shape <b style={{ color: s.reads === "bullish" ? "var(--bull-green)" : "var(--bear-red)" }}>{s.reads === "bullish" ? "UP" : "DOWN"}</b></div>
                <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "5px 0 4px", paddingTop: 4 }}>Source assessment: <b style={{ color: isSig ? "var(--bull-green)" : "var(--warn-amber)" }}>{isSig ? "observed association" : "near the null baseline"}</b></div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--text-secondary)" }}>Directional probability ={pc(s.conditional_rate)} versus baseline {pc(s.base_rate)} · lift {s.lift != null ? (s.lift >= 0 ? "+" : "") + (s.lift * 100).toFixed(1) + "%" : "—"} · n={s.sample_n ?? "—"}</div>
                {s.why_factors && s.why_factors.length > 0 && (
                  <div style={{ marginTop: 5, borderTop: "1px solid var(--border-subtle)", paddingTop: 4 }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: 9.5, marginBottom: 2 }}>Measured rationale:</div>
                    {s.why_factors.map((w, j) => <div key={j} style={{ color: "#cdd9e6", fontSize: 10 }}>· {w}</div>)}
                  </div>
                )}
                {s.projection && <div style={{ marginTop: 4, color: s.projection.dir === "up" ? "var(--bull-green)" : "var(--bear-red)", fontSize: 10 }}>Declared model band {s.projection.dir === "up" ? "UP" : "DOWN"}: <b>{s.projection.lo}–{s.projection.hi}</b> (target {s.projection.target} · {s.projection.bars} bars)<br /><span style={{ color: "var(--text-secondary)" }}>calib {s.projection.calibrated ? "✓" : "default"} target {s.projection.target_atr}±{s.projection.tol_atr}ATR (n={s.projection.calib_n ?? "—"}) · multi-timeframe volatility multiplier{s.projection.mtf_factor ?? 1} ({(s.projection.tf_ladder || []).join("/")})</span></div>}
                {s.lessons_applied && s.lessons_applied.length > 0 && (
                  <div style={{ marginTop: 5, borderTop: "1px solid var(--border-subtle)", paddingTop: 4 }}>
                    <div style={{ fontSize: 9.5, color: "var(--text-secondary)", marginBottom: 2 }}> Context lesson with held-out validation <b style={{ color: s.context_assessment === "STRONG" ? "var(--bull-green)" : s.context_assessment === "WEAK" ? "var(--bear-red)" : "var(--warn-amber)" }}>{s.context_assessment}</b></div>
                    {s.lessons_applied.map((a, j) => <div key={j} style={{ fontSize: 10, color: a.kind === "strong" ? "var(--bull-green)" : "var(--warn-amber)" }}>{a.kind === "strong" ? "strong" : "weak"}: {a.factor} — {a.hit_rate != null ? Math.round(a.hit_rate * 100) : "—"}% (OOS {a.oos_hit_rate != null ? Math.round(a.oos_hit_rate * 100) + "%" : "—"}, n={a.n})</div>)}
                  </div>
                )}
                <div style={{ marginTop: 4, color: oc, fontWeight: 700 }}>Next observation: {s.outcome === "correct" ? "matched measured direction" : s.outcome === "wrong" ? "did not match measured direction" : "unresolved; monitoring the declared band"}</div>
              </div>
            );
          })()}
          {/* TRADE entry hover — WHY the strategy entered this BUY/SELL (triggers → combine → gates passed → sizing) */}
          {(() => {
            if (tradeHover == null) return null;
            const t = (trades || []).find((x) => x.entryI === tradeHover);
            if (!t) return null;
            const x = xFor(t.entryI), y = yFor(t.entry), col = t.dir === "BUY" ? "var(--bull-green)" : "var(--bear-red)";
            const left = Math.max(6, Math.min(W - 266, x + 14));
            const top = Math.max(6, Math.min(H - 190, y - 70));
            return (
              <div style={{ position: "absolute", left, top, width: 254, background: "rgba(8,16,24,.97)", border: "1px solid " + col, borderRadius: 8, padding: "9px 11px", fontSize: 11, color: "var(--text-primary)", boxShadow: "0 6px 22px rgba(0,0,0,.55)", pointerEvents: "none", zIndex: 22, lineHeight: 1.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <b style={{ color: col, fontSize: 12.5 }}>{t.dir === "BUY" ? "▲ BUY" : "▼ SELL"} · {tf}</b>
                  <span style={{ color: "var(--text-secondary)", fontSize: 9.5, fontFamily: MONO }}>{(t.t || "").slice(5, 16)}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 9.5, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".3px" }}>Why the strategy produced this simulated entry</div>
                {(t.why || []).length ? (t.why || []).map((w, j) => <div key={j} style={{ fontSize: 10.5, color: w.startsWith("✓") ? "#7fd99a" : w.startsWith("🎯") ? "#f0d68a" : w.startsWith("⚙") ? "#9fd0ff" : "#cdd9e6", marginBottom: 1.5 }}>{w}</div>) : <div style={{ color: "var(--text-secondary)" }}>Default EMA crossover; no Card-specific module recorded.</div>}
                <div style={{ marginTop: 6, borderTop: "1px solid var(--border-subtle)", paddingTop: 4, color: t.outcome === "TP" ? "var(--bull-green)" : "var(--bear-red)", fontWeight: 700 }}>Simulated trade outcome: {t.outcome} · {t.R >= 0 ? "+" : ""}{t.R}R</div>
                <div style={{ marginTop: 2, fontSize: 9, color: "var(--text-secondary)", fontStyle: "italic" }}>Modeled execution using the canonical engine and selected Card filters. Research only.</div>
              </div>
            );
          })()}
        </div>
        {/* bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 10px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-panel)", fontSize: 10.5, color: "var(--text-secondary)", fontFamily: MONO }}>
          <button onClick={reset} style={{ background: "var(--mfe-s3)", border: "1px solid var(--border-panel)", color: "var(--text-secondary)", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 9px" }}>⤢ Reset</button>
          {magnet && <span style={{ color: "var(--accent-cyan)" }}> magnet on</span>}
          <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>{[["ASIA", "var(--accent-cyan)"], ["EUROPE", "var(--bull-green)"], ["US", "var(--zone-purple)"]].map(([k, c]) => <span key={k as string} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c as string, opacity: .7 }} />{k}</span>)}</span>
          <span>{hb ? `${shortTime(hb.t)} · O ${fp(hb.o)} H ${fp(hb.h)} L ${fp(hb.l)} C ${fp(hb.c)}` : "drag = pan · scroll = zoom · pick a tool to draw · diagnostic only"}</span>
        </div>
      </div>
    </div>
  );
}
