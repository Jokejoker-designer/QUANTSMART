// StochLens — Stochastic %K subpanel: %K = where Close sits inside the recent N-bar high/low range (0–100), %D =
// SMA(%K). Draws the 0–100 oscillator with overbought (80) / oversold (20) zones, %K + %D lines, playhead, and the
// current reading. Causal (windows end at the current bar). CONTEXT only — overbought ≠ sell, oversold ≠ buy.
import { useMemo } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { hiArr, loArr, smaArr } from "../lib/blocks/stdIndicators.ts";

export function StochLens({ bars, i, start, end, kPeriod, onK, W = 900 }: { bars: OhlcBar[]; i: number; start: number; end: number; kPeriod: number; onK: (k: number) => void; W?: number }) {
  const { k, d } = useMemo(() => {
    const hh = hiArr(bars.map((x) => x.h), kPeriod), ll = loArr(bars.map((x) => x.l), kPeriod), c = bars.map((x) => x.c);
    const raw = c.map((v, idx) => { const dn = hh[idx] - ll[idx]; return dn > 1e-9 ? (100 * (v - ll[idx])) / dn : 50; });
    const kk = smaArr(raw, 3); return { k: kk, d: smaArr(kk, 3) };
  }, [bars, kPeriod]);

  const H = 80, pad = 8, y = (v: number) => pad + ((100 - Math.max(0, Math.min(100, v))) / 100) * (H - 2 * pad);
  const slN = Math.max(1, end - start), cw = W / slN;
  const line = (s: number[]) => s.slice(start, end).map((v, idx) => `${((idx + 0.5) * cw).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const phx = (i - start + 0.5) * cw;
  const kNow = k[i] ?? 50, dNow = d[i] ?? 50;
  const zone = kNow >= 80 ? { t: "Overbought context", c: "#f7768e" } : kNow <= 20 ? { t: "Oversold context", c: "#21d07a" } : { t: "Neutral context", c: "var(--mfe-muted)" };

  return (
    <div className="pc" style={{ margin: "8px 0 0", background: "var(--mfe-s2)", border: "1px solid " + (zone.c) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12, color: "#9fd0ff" }}> Stochastic %K</b>
        <span style={{ fontFamily: "var(--mfe-mono)", fontSize: 11, color: "#37c0ff" }}>%K {kNow.toFixed(1)}</span>
        <span style={{ fontFamily: "var(--mfe-mono)", fontSize: 11, color: "#e3b341" }}>%D {dNow.toFixed(1)}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: zone.c }}>{zone.t}</span>
        <label className="pmut" style={{ fontSize: 9.5, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>%K period {kPeriod}
          <input type="range" min={3} max={50} value={kPeriod} onChange={(e) => onK(parseInt(e.target.value))} style={{ width: 90 }} />
        </label>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: 80, background: "#0b0f15", borderRadius: 4, marginTop: 6 }}>
        <rect x={0} y={y(100)} width={W} height={y(80) - y(100)} fill="#f7768e" opacity={0.07} />
        <rect x={0} y={y(20)} width={W} height={y(0) - y(20)} fill="#21d07a" opacity={0.07} />
        <line x1={0} y1={y(80)} x2={W} y2={y(80)} stroke="#f7768e" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.6} />
        <line x1={0} y1={y(50)} x2={W} y2={y(50)} stroke="#3a4452" strokeWidth={0.6} strokeDasharray="3 3" />
        <line x1={0} y1={y(20)} x2={W} y2={y(20)} stroke="#21d07a" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.6} />
        <polyline points={line(d)} fill="none" stroke="#e3b341" strokeWidth={1.1} opacity={0.9} />
        <polyline points={line(k)} fill="none" stroke="#37c0ff" strokeWidth={1.4} />
        <line x1={phx} y1={0} x2={phx} y2={H} stroke="#fff" strokeWidth={0.8} opacity={0.5} />
      </svg>
      <div className="pmut" style={{ fontSize: 9, marginTop: 5, fontStyle: "italic" }}>%K measures the close within the recent {kPeriod} bar high/low range. %D smooths %K. These states describe context, not buy or sell instructions.</div>
    </div>
  );
}
