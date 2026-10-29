// CockpitChart — the rich Home/Command-Center price chart, 1:1 with the approved mockup.
// Renders inside the SVG: OHLC + change header, EMA10/EMA34 legend + curves, VWAP, zone bands with
// colored labels, invalidation line, swing-pivot diamonds, right-axis price tags (incl. the live red
// price tag with bar-close countdown), grid + time axis. Self-sufficient: computes EMA/VWAP/pivots.
// It MEASURES its own box (ResizeObserver) and draws 1:1 in pixels so it FILLS the column with NO
// distortion of text/candles. ADVISORY ONLY · ZONE-ONLY · not a BUY/SELL signal. Read-only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { glyphInner, type GlyphName } from "./ui/Glyph.tsx";

export interface CChartZone { role: string; lo: number; hi: number; label: string; color: string; glyph?: GlyphName }
export interface CChartLine { price: number; label: string; color: string; dash?: boolean; glyph?: GlyphName }

// draw a house glyph inside the chart SVG as a positioned <g> (top-left at gx,gy, rendered at `gs` px).
// strokeWidth is pre-divided by the scale so it renders at the same ~1.75px weight as the <Glyph> component.
export function ChartGlyph({ name, gx, gy, gs, color }: { name: GlyphName; gx: number; gy: number; gs: number; color: string }) {
  const sc = gs / 24;
  return <g transform={`translate(${gx},${gy}) scale(${sc})`} fill="none" stroke={color} color={color}
    strokeWidth={1.75 / sc} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: glyphInner(name) }} />;
}

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const PERIOD: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 };

function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1); const out: number[] = []; let prev = vals[0] ?? 0;
  vals.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); out.push(prev); });
  return out;
}
function fp(v: number): string { return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function shortTime(t: string): string { const m = t.match(/(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${m[1]}-${m[2]} ${m[3]}` : t.slice(5, 16); }

export function CockpitChart(props: { bars: OhlcBar[]; zones?: CChartZone[]; lines?: CChartLine[]; symbol: string; tf: string }) {
  const [size, setSize] = useState({ w: 1000, h: 440 });
  const roRef = useRef<ResizeObserver | null>(null);
  const setWrap = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (el) {
      const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
      ro.observe(el); roRef.current = ro; setSize({ w: el.clientWidth, h: el.clientHeight });
    }
  }, []);

  // live bar-close countdown
  const [cd, setCd] = useState(PERIOD[props.tf] ?? 900);
  useEffect(() => {
    setCd(PERIOD[props.tf] ?? 900);
    const id = setInterval(() => setCd((s) => (s <= 1 ? (PERIOD[props.tf] ?? 900) : s - 1)), 1000);
    return () => clearInterval(id);
  }, [props.tf]);
  const mmss = `${String(Math.floor(cd / 60)).padStart(2, "0")}:${String(cd % 60).padStart(2, "0")}`;

  return (
    <div ref={setWrap} style={{ flex: 1, minHeight: 0, display: "flex" }}>
      {props.bars.length < 2
        ? <div className="mfe-empty" style={{ flex: 1 }}><div className="ic">◫</div><div className="msg">Loading candles…</div></div>
        : <ChartSvg {...props} W={size.w} H={size.h} mmss={mmss} />}
    </div>
  );
}

function ChartSvg({ bars, zones = [], lines = [], symbol, tf, W, H, mmss }: {
  bars: OhlcBar[]; zones?: CChartZone[]; lines?: CChartLine[]; symbol: string; tf: string; W: number; H: number; mmss: string;
}) {
  const ML = 10, MR = 90, MT = 16, MB = 30;
  const PX0 = ML, PX1 = W - MR, PW = PX1 - PX0;
  const PY0 = MT, PY1 = H - MB, PH = PY1 - PY0;
  const n = bars.length;

  const closes = useMemo(() => bars.map((b) => b.c), [bars]);
  const emaF = useMemo(() => ema(closes, 10), [closes]);
  const emaS = useMemo(() => ema(closes, 34), [closes]);
  const vwap = useMemo(() => { let cum = 0; return bars.map((b, i) => { cum += (b.h + b.l + b.c) / 3; return cum / (i + 1); }); }, [bars]);
  const pivots = useMemo(() => {
    const w = 3; const out: { i: number; price: number; dir: "high" | "low" }[] = [];
    for (let i = w; i < n - w; i++) {
      let hi = true, lo = true;
      for (let k = 1; k <= w; k++) { if (bars[i].h < bars[i - k].h || bars[i].h < bars[i + k].h) hi = false; if (bars[i].l > bars[i - k].l || bars[i].l > bars[i + k].l) lo = false; }
      if (hi) out.push({ i, price: bars[i].h, dir: "high" }); else if (lo) out.push({ i, price: bars[i].l, dir: "low" });
    }
    return out;
  }, [bars, n]);

  const lo0 = Math.min(...bars.map((b) => b.l)), hi0 = Math.max(...bars.map((b) => b.h));
  const pad = (hi0 - lo0) * 0.08 || 1; const lo = lo0 - pad, hi = hi0 + pad, span = hi - lo || 1;
  const roff = Math.min(22, Math.max(4, Math.round(n * 0.07))); // right offset — breathing room for the forming candle
  const slot = PW / (n + roff), bw = Math.max(slot * 0.62, 1);
  const xFor = (j: number) => PX0 + (j + 0.5) * slot;
  const yFor = (p: number) => PY0 + PH * (1 - (p - lo) / span);
  const last = bars[n - 1], prev = bars[n - 2] || last;
  const chg = last.c - prev.c, chgPct = prev.c ? (chg / prev.c) * 100 : 0; const up = chg >= 0;
  // plan zones are "as of NOW" — anchor to the recent/right area (not across the whole history)
  const xNow = xFor(n - 1); const xAnchor = Math.max(PX0, xNow - Math.min(n - 1, 20) * slot);

  const raw = span / 8, pw10 = Math.pow(10, Math.floor(Math.log10(raw))), ff = raw / pw10;
  const step = (ff < 1.5 ? 1 : ff < 3 ? 2 : ff < 7 ? 5 : 10) * pw10;
  const gticks: number[] = []; for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) gticks.push(p);
  const xStep = Math.max(1, Math.ceil(n / 8)); const xticks: number[] = []; for (let j = 0; j < n; j += xStep) xticks.push(j);

  const tags: { price: number; color: string; strong?: boolean; sub?: string }[] = [];
  zones.forEach((z) => { tags.push({ price: z.hi, color: z.color }); tags.push({ price: z.lo, color: z.color }); });
  lines.forEach((l) => tags.push({ price: l.price, color: l.color }));
  tags.push({ price: last.c, color: "#B5403A", strong: true, sub: mmss });
  const cy = yFor(last.c);
  const tagsF = tags.filter((t) => t.strong || Math.abs(yFor(t.price) - cy) > 11);
  const poly = (arr: number[]) => arr.map((v, i) => `${xFor(i).toFixed(1)},${Math.max(PY0, Math.min(PY1, yFor(v))).toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", background: "#070D14", border: "1px solid #26384A", borderRadius: 10 }}
      aria-label="Co-Trade live price chart (advisory, zone-only)">

      {gticks.map((p, k) => (
        <g key={`g${k}`}>
          <line x1={PX0} y1={yFor(p)} x2={PX1} y2={yFor(p)} stroke="#101c28" strokeWidth="1" />
          <text x={W - 6} y={yFor(p) + 4} fill="#6b7d90" fontSize="11" textAnchor="end" fontFamily={MONO}>{fp(p)}</text>
        </g>
      ))}
      {xticks.map((j) => (
        <g key={`x${j}`}>
          <line x1={xFor(j)} y1={PY0} x2={xFor(j)} y2={PY1} stroke="#0c1620" strokeWidth="1" />
          <text x={xFor(j)} y={PY1 + 16} fill="#7d8ea0" fontSize="10.5" textAnchor="middle" fontFamily={MONO}>{shortTime(bars[j].t)}</text>
        </g>
      ))}

      {zones.map((z, k) => {
        const yT = Math.max(PY0, Math.min(PY1, yFor(z.hi))), yB = Math.max(PY0, Math.min(PY1, yFor(z.lo)));
        if (yB - yT < 0.5) return null;
        return (
          <g key={`z${k}`}>
            <rect x={xAnchor} y={yT} width={PX1 - xAnchor} height={yB - yT} fill={z.color} opacity="0.11" stroke={z.color} strokeOpacity="0.5" strokeDasharray="4 3" />
            {z.glyph && <ChartGlyph name={z.glyph} gx={xAnchor + 6} gy={yT + 3.5} gs={12} color={z.color} />}
            <text x={xAnchor + 6 + (z.glyph ? 15 : 0)} y={yT + 13} fill={z.color} fontSize="11.5" fontWeight="700" letterSpacing="0.5">{z.label}</text>
          </g>
        );
      })}

      {bars.map((b, j) => {
        const cx = xFor(j); const isUp = b.c >= b.o; const col = isUp ? "#2BB673" : "#F0524A";
        const top = yFor(Math.max(b.o, b.c)), h = Math.max(Math.abs(yFor(b.o) - yFor(b.c)), 1);
        return (
          <g key={j}>
            <line x1={cx} y1={yFor(b.h)} x2={cx} y2={yFor(b.l)} stroke={col} strokeWidth="1" />
            <rect x={cx - bw / 2} y={top} width={bw} height={h} fill={col} />
          </g>
        );
      })}

      <polyline points={poly(emaF)} fill="none" stroke="#25B7FF" strokeWidth="1.5" opacity="0.95" />
      <polyline points={poly(emaS)} fill="none" stroke="#F4C542" strokeWidth="1.5" opacity="0.95" />
      <polyline points={poly(vwap)} fill="none" stroke="#1BE2C1" strokeWidth="1.2" strokeDasharray="5 4" opacity="0.8" />

      {lines.map((l, k) => {
        if (l.price < lo || l.price > hi) return null; const y = yFor(l.price);
        const gs = 13, tw = l.label.length * 6.2;
        return (
          <g key={`l${k}`}>
            <line x1={xAnchor} y1={y} x2={PX1} y2={y} stroke={l.color} strokeWidth="1.2" strokeDasharray={l.dash ? "5 3" : undefined} opacity="0.9" />
            {l.glyph && <ChartGlyph name={l.glyph} gx={PX1 - 6 - tw - gs - 2} gy={y - 13.5} gs={gs} color={l.color} />}
            <text x={PX1 - 6} y={y - 4} fill={l.color} fontSize="11.5" fontWeight="700" textAnchor="end">{l.label}</text>
          </g>
        );
      })}

      {/* NOW marker — plan zones project from here */}
      <line x1={xNow} y1={PY0} x2={xNow} y2={PY1} stroke="#cfd9e4" strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
      <circle cx={xNow} cy={yFor(last.c)} r="3.5" fill={last.c >= last.o ? "#2BB673" : "#F0524A"} stroke="#070D14" strokeWidth="1.5" />
      <rect x={xNow - 15} y={PY0 + 1} width="30" height="13" rx="3" fill="#172433" stroke="#26384A" />
      <text x={xNow} y={PY0 + 10.5} fill="#cfd9e4" fontSize="8.5" textAnchor="middle" fontWeight="700">NOW</text>

      {pivots.map((pv, k) => {
        const x = xFor(pv.i), y = yFor(pv.price) + (pv.dir === "high" ? -8 : 8), s = 3.2;
        const col = pv.dir === "high" ? "#9D5CFF" : "#21D07A";
        return <path key={`pv${k}`} d={`M ${x} ${y - s} L ${x + s} ${y} L ${x} ${y + s} L ${x - s} ${y} Z`} fill={col} opacity="0.9" />;
      })}

      {tagsF.map((t, k) => {
        if (t.price < lo || t.price > hi) return null; const y = yFor(t.price); const h = t.sub ? 29 : 19;
        return (
          <g key={`t${k}`}>
            <rect x={PX1 + 3} y={y - h / 2} width={MR - 6} height={h} rx="3" fill={t.strong ? t.color : "#0c1722"} stroke={t.color} strokeWidth="1" />
            <text x={PX1 + MR / 2} y={y + (t.sub ? -3 : 4)} fill={t.strong ? "#ffffff" : t.color} fontSize="11.5" fontWeight="700" textAnchor="middle" fontFamily={MONO}>{fp(t.price)}</text>
            {t.sub && <text x={PX1 + MR / 2} y={y + 11} fill="#ffd9d6" fontSize="9.5" textAnchor="middle" fontFamily={MONO}>{t.sub}</text>}
          </g>
        );
      })}

      {/* top-left OHLC header + EMA legend */}
      <text x={PX0 + 5} y={PY0 + 14} fill="#E7F0FA" fontSize="15" fontWeight="800">{symbol} · {tf}</text>
      <text x={PX0 + 5} y={PY0 + 33} fontSize="12.5" fontFamily={MONO}>
        <tspan fill="#8295aa">O </tspan><tspan fill="#dbe4ee">{fp(last.o)}</tspan>
        <tspan fill="#8295aa">  H </tspan><tspan fill="#dbe4ee">{fp(last.h)}</tspan>
        <tspan fill="#8295aa">  L </tspan><tspan fill="#dbe4ee">{fp(last.l)}</tspan>
        <tspan fill="#8295aa">  C </tspan><tspan fill="#dbe4ee">{fp(last.c)}</tspan>
        <tspan fill={up ? "#21D07A" : "#FF6A60"} fontWeight="700">  {up ? "+" : ""}{chg.toFixed(2)} ({up ? "+" : ""}{chgPct.toFixed(2)}%)</tspan>
      </text>
      <text x={PX0 + 5} y={PY0 + 50} fontSize="12.5" fontFamily={MONO}>
        <tspan fill="#25B7FF" fontWeight="700">EMA 10 </tspan><tspan fill="#a9d8f0">{fp(emaF[n - 1])}</tspan>
        <tspan fill="#F4C542" fontWeight="700">   EMA 34 </tspan><tspan fill="#e7d59a">{fp(emaS[n - 1])}</tspan>
      </text>

      {/* top-right zone-only note */}
      <rect x={PX1 - 268} y={PY0 + 1} width={260} height={21} rx="5" fill="#0c1722" stroke="#26384A" strokeWidth="1" />
      <text x={PX1 - 138} y={PY0 + 15} fill="#9FB2C8" fontSize="11" textAnchor="middle">Zone-only output · not an exact entry signal ⓘ</text>

      <text x={PX0 + 5} y={PY1 - 6} fill="#1BE2C1" fontSize="11.5" fontWeight="700" fontFamily={MONO}>VWAP D · {fp(vwap[n - 1])}</text>
    </svg>
  );
}
