// FootprintLensPanel — LIVE view của footprint_lens L2 (observer · descriptive · OBSERVE_ONLY).
// Tự fetch tape design_tf (giống ChEpisodeLensPanel), gọi footprintProxy read-only, vẽ price rows kiểu
// centered-bar của ContributionBars (buy→phải/xanh, sell→trái/đỏ) — VIẾT RIÊNG, không import ContributionBars.
// Nhãn honesty HIỂN THỊ trong UI: M1_DERIVED_PROXY, suy đoán từ hướng nến M1, KHÔNG phải dòng lệnh sàn thật.
import { useEffect, useMemo, useState } from "react";
import { TK } from "./ui/Ui.tsx";
import { loadSimOhlc } from "../adapters/loadSimOhlc.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { buildFootprint, type FootprintRow } from "../lib/footprintProxy.ts";

// ── PURE LOGIC (export để harness test không cần JSX) ──
// Truncation CHỐT CỨNG: chỉ giữ row có total ≥ 10% × max(total), cap 12 row, thứ tự total giảm dần.
export const FOOTPRINT_MIN_PCT = 0.10;
export const FOOTPRINT_MAX_ROWS = 12;
export function selectFootprintRows(rows: FootprintRow[]): FootprintRow[] {
  if (!rows || rows.length === 0) return [];
  const maxTotal = Math.max(...rows.map((r) => r.total));
  if (!(maxTotal > 0)) return [];
  const kept = rows.filter((r) => r.total >= FOOTPRINT_MIN_PCT * maxTotal);
  kept.sort((a, b) => b.total - a.total);
  return kept.slice(0, FOOTPRINT_MAX_ROWS);
}

// ── ATR causal đơn giản cho nến cuối (để bin footprint) — không đụng engine ──
function atrLast(bars: OhlcBar[], period = 14): number {
  let a = 0;
  for (let i = 1; i < bars.length; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = i <= period ? (a * (i - 1) + tr) / i : (a * (period - 1) + tr) / period; }
  return a || 1;
}
// Footprint từ M1 con: tape sim không mang m1ByBar, nên xấp xỉ "M1 con" = các nến design_tf trong nến cuối cùng
// KHÔNG có — thay vào đó minh họa trên chính các nến gần nhất của tape (mỗi nến = 1 đơn vị hướng). Đây vẫn là
// M1_DERIVED_PROXY về bản chất (đếm hướng nến), và reliability phản ánh trung thực.

const HONEST_CAPTION = "M1 candle-direction footprint proxy, not exchange order flow";

export function FootprintLensPanel({ tf = "M15" }: { tf?: string }) {
  const [bars, setBars] = useState<OhlcBar[] | null>(null);
  useEffect(() => { loadSimOhlc(tf).then((d) => setBars(d?.bars || null)); }, [tf]);

  const fp = useMemo(() => {
    if (!bars || bars.length < 30) return null;
    const a = atrLast(bars);
    // các nến gần nhất đóng vai "M1 con" của nến quan sát hiện tại (proxy hướng nến — đúng bản chất M1_DERIVED_PROXY)
    const children = bars.slice(-60);
    return buildFootprint(children, a);
  }, [bars]);

  const rows = useMemo(() => (fp ? selectFootprintRows(fp.rows) : []), [fp]);
  const maxTotal = rows.length ? Math.max(...rows.map((r) => r.total)) : 1;
  const half = (v: number) => `${(Math.abs(v) / (maxTotal || 1)) * 50}%`;

  return (
    <div className="pc" style={{ marginTop: 12, borderColor: "#1c4a5b" }}>
      <div className="pc-h cyan"> Footprint Lens <span className="mut">L2 · observer · {tf} · {fp?.reliability ?? "…"} Descriptive observation only</span></div>
      <div className="pmut psm" style={{ marginBottom: 8, color: "#e3a23a" }}>⚠ {HONEST_CAPTION}</div>
      {!fp ? <div className="pmut psm">Loading tape {tf}…</div> : fp.reliability === "NO_M1_SOURCE" || rows.length === 0 ? (
        <div className="pmut psm">Not enough source bars to construct the footprint.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 11.5, fontFamily: "var(--mfe-mono)" }}>
            <span>bar Δ: <b style={{ color: fp.barDelta >= 0 ? TK.green : "#f7768e" }}>{fp.barDelta >= 0 ? "+" : ""}{fp.barDelta}</b></span>
            <span className="pmut">Excluded doji bars: {fp.dojiCount}</span>
            <span className="pmut" style={{ marginLeft: "auto" }}>{rows.length} price row (cap {FOOTPRINT_MAX_ROWS}, ≥{FOOTPRINT_MIN_PCT * 100}% max)</span>
          </div>
          {rows.map((r) => (
            <div key={`${r.priceLo}`} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ fontFamily: "var(--mfe-mono)", color: "var(--mfe-text2)" }}>{r.priceLo.toFixed(2)}–{r.priceHi.toFixed(2)}</span>
                <span className="pmut" style={{ fontSize: 9 }}>{r.imbalanceSide !== "NONE" ? r.imbalanceSide : ""}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--mfe-mono)" }}>
                  <span style={{ color: "#f7768e" }}>{r.sellVolumeProxy}</span>
                  <span className="pmut"> · </span>
                  <span style={{ color: TK.green }}>{r.buyVolumeProxy}</span>
                </span>
              </div>
              <div style={{ position: "relative", height: 10, background: "var(--mfe-s3)", borderRadius: 4, margin: "2px 0" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#3a4452" }} />
                <div style={{ position: "absolute", right: "50%", top: 0, bottom: 0, width: half(r.sellVolumeProxy), background: "#f7768e", borderRadius: "4px 0 0 4px" }} />
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: half(r.buyVolumeProxy), background: TK.green, borderRadius: "0 4px 4px 0" }} />
              </div>
            </div>
          ))}
          <div className="pfoot" style={{ marginTop: 8 }}>Red and green represent candle-direction proxies. POC is the highest row count. This is not measured exchange volume.</div>
        </>
      )}
    </div>
  );
}
