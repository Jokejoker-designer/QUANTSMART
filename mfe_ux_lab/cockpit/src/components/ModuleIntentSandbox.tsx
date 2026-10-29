// ModuleIntentSandbox — WO INTENT_SANDBOX. Chart nến THẬT + đánh dấu các nến module BẮN (condsMet=true) →
// click marker → xem nến đó + câu lý do ("bắn vì Giá=151 > 150"). "Show don't tell": user thấy module của
// mình (hoặc AI ghép) chạy live. Fail-closed: điều kiện dùng metric NO_DATA → báo rõ, KHÔNG bịa điểm bắn.
// Presentation-only · advisory · KHÔNG order. Preview KHÔNG phải backtest — hợp-lệ/bắn-đúng ≠ có edge.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { Glyph } from "./ui/Glyph.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { previewModule, type FirePoint } from "../lib/moduleIntentPreview.ts";
import type { CustomModule } from "../lib/customModule.ts";

const MONO = "var(--mfe-mono, monospace)";
const WINDOW = 400;   // số nến hiển thị (gần nhất) — đủ thấy pattern, nhẹ

export function ModuleIntentSandbox({ draft, valid }: { draft: CustomModule; valid: boolean }) {
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  const [tf] = useState("M15");
  const [sel, setSel] = useState<FirePoint | null>(null);
  useEffect(() => { loadSimOhlc(tf).then((d) => setBars((d?.bars || null))); }, [tf]);

  const full = useMemo(() => (bars || []).slice(-8000), [bars]);   // cap preview ~8000 nến gần nhất (snappy; hiển thị chỉ 400) — số thật full-decade ở Microscope
  const view = useMemo(() => full.slice(-WINDOW), [full]);
  const offset = full.length - view.length;
  // preview chạy trên TOÀN tape (causal) rồi lọc marker về cửa sổ hiển thị
  const res = useMemo(() => (valid && full.length > 60 ? previewModule(full, draft) : null), [full, draft, valid]);
  const viewFires = useMemo(() => (res ? res.fires.filter((f) => f.i >= offset) : []), [res, offset]);

  if (!bars) return <div className="pmut psm" style={{ padding: 8 }}>Loading bars {tf}…</div>;
  if (!valid) return <div className="pmut psm" style={{ padding: 8, color: TK.orange }}>Fix the module conditions before opening its preview.</div>;
  if (res && !res.previewable) return (
    <div className="pmut psm" style={{ padding: 8, color: TK.orange }}>
      Unavailable: the condition requires position-state metrics ({res.naMetrics.join(", ")}), which do not exist on a standalone OHLC tape. Run the strategy to evaluate them.
    </div>
  );

  const W = 560, H = 200, ML = 4, MR = 46, MT = 8, MB = 16;
  const PX0 = ML, PX1 = W - MR, PW = PX1 - PX0, PY0 = MT, PY1 = H - MB, PH = PY1 - PY0;
  const lo = Math.min(...view.map((b) => b.l)), hi = Math.max(...view.map((b) => b.h)); const span = (hi - lo) || 1;
  const slot = PW / view.length, bw = Math.max(slot * 0.6, 1);
  const xFor = (iView: number) => PX0 + (iView + 0.5) * slot;
  const yFor = (p: number) => PY0 + PH * (1 - (p - lo) / span);
  const fp = (v: number) => v.toFixed(2);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: 11.5, color: TK.cyan }}><Glyph name="target" size={11} /> Intent Sandbox</b>
        <span className="pmut" style={{ fontSize: 10 }}>eligible on <b style={{ color: TK.green }}>{viewFires.length}</b> observations within {view.length} recent bars; full tape {res?.fires.length ?? 0}). Select a marker for its explanation.</span>
      </div>
      <div style={{ border: "1px solid #1b2a39", borderRadius: 8, background: "#070D14", overflow: "hidden" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {view.map((b, j) => { const up = b.c >= b.o; const col = up ? "#2BB673" : "#F0524A"; const cx = xFor(j); const top = yFor(Math.max(b.o, b.c)); const hgt = Math.max(Math.abs(yFor(b.o) - yFor(b.c)), 0.7);
            return <g key={j}><line x1={cx} y1={yFor(b.h)} x2={cx} y2={yFor(b.l)} stroke={col} strokeWidth="0.6" /><rect x={cx - bw / 2} y={top} width={bw} height={hgt} fill={col} /></g>; })}
          {/* fire markers */}
          {viewFires.map((f) => { const j = f.i - offset; const cx = xFor(j), cy = yFor(view[j].l) + 6; const on = sel?.i === f.i;
            return <g key={f.i} style={{ cursor: "pointer" }} onClick={() => setSel(f)}>
              <circle cx={cx} cy={cy + 8} r="7" fill="transparent" />
              <path d={`M ${cx} ${cy} l -3.5 5 l 7 0 z`} fill="#F4C542" stroke={on ? "#fff" : "#070D14"} strokeWidth={on ? 1 : 0.5} />
            </g>; })}
          {/* price axis */}
          {[lo + span * 0.15, lo + span * 0.5, lo + span * 0.85].map((p, k) => <text key={k} x={W - 3} y={yFor(p) + 3} fill="#5b6b7d" fontSize="8.5" textAnchor="end" fontFamily={MONO}>{fp(p)}</text>)}
        </svg>
      </div>
      {sel ? (
        <div style={{ marginTop: 6, background: "var(--mfe-s2)", border: "1px solid #43306a", borderRadius: 7, padding: "7px 10px" }}>
          <div style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: MONO, flexWrap: "wrap" }}>
            <span className="pmut">{sel.time.slice(0, 16).replace("T", " ")}</span>
            <span>close <b style={{ color: TK.text }}>{fp(sel.price)}</b></span>
            <span className="pmut" style={{ marginLeft: "auto" }}>bar #{sel.i}</span>
          </div>
          <div style={{ fontSize: 11.5, color: TK.green, marginTop: 4 }}><Glyph name="check" size={10} /> {sel.reason}</div>
        </div>
      ) : viewFires.length === 0 ? (
        <div className="pmut psm" style={{ marginTop: 6, color: TK.orange }}>No observation met the conditions in this window. Inspect thresholds and intended coverage.</div>
      ) : <div className="pmut psm" style={{ marginTop: 6 }}>Select an event marker to inspect the bar and rule explanation.</div>}
      <div className="pmut" style={{ fontSize: 9, marginTop: 5, fontStyle: "italic" }}>The preview checks the module's intended causal behavior. <b>Matching intent is not measured profitability</b> . Validate the combined strategy in Microscope.</div>
    </div>
  );
}
