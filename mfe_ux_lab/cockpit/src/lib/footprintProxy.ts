// footprintProxy — M1_DERIVED_PROXY (WO: MFE_COCKPIT_FOOTPRINT_PROXY_WO_V1 · P3 · SHADOW_ONLY/DESCRIPTIVE_ONLY/DATA_LAYER_ONLY)
//
// Dựng footprint (price rows + delta + CVD) cho mỗi nến HTF TỪ M1 con của resampleM1 (m1ByBar) — chỉ ĐỌC, không
// tự group lại M1. Đây KHÔNG phải order-flow/volume thật: OhlcBar không mang volume tin cậy; attribution buy/sell
// là SUY ĐOÁN nhị phân từ hình nến M1 (manager-locked): close>open→buy, close<open→sell, doji→neutral (không tính,
// không vào total). Tuyệt đối KHÔNG mô tả layer này như dữ liệu dòng-lệnh hay khối-lượng có thật. Value = DATA + hình học mô tả —
// KHÔNG phải bằng chứng dự đoán (họ hàng eign_energy đã đo NO_MATERIAL, net −0.05); mọi claim dự đoán phải qua
// signal_material_gate.py (track Python). imbalanceSide là NHÃN MÔ TẢ mỗi row, KHÔNG phải tín hiệu vào lệnh —
// không code path trigger/entry/exit nào được đọc footprint (guard bởi footprintProxy.harness.ts).
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { binWidth, binKeyOf } from "./valueAreaProxy.ts";

export type FootprintReliability = "M1_DERIVED_PROXY" | "NO_M1_SOURCE";
export type ImbalanceSide = "BUY" | "SELL" | "NONE";

export interface FootprintRow {
  priceLo: number;            // biên dưới bin (giá thật)
  priceHi: number;            // biên trên bin
  buyVolumeProxy: number;     // số nến M1 close>open đóng trong bin (đơn vị đếm, KHÔNG phải volume thật)
  sellVolumeProxy: number;    // số nến M1 close<open
  deltaProxy: number;         // buy − sell
  total: number;              // buy + sell (doji KHÔNG vào total)
  imbalanceSide: ImbalanceSide;
}
export interface BarFootprint {
  rows: FootprintRow[];       // sắp theo giá tăng dần
  barDelta: number;           // Σ deltaProxy toàn bar
  cvd: number;                // Σ barDelta tích lũy qua các bar (đặt ở buildFootprintSeries)
  reliability: FootprintReliability;
  sourceM1Count: number;      // số M1 con của bar (gồm cả doji)
  dojiCount: number;
}

/** Ngưỡng imbalance mặc định: một phía ≥ IMBALANCE_RATIO lần phía kia thì gán nhãn phía đó (kiểu TradingView 3:1).
 *  LÀ THAM SỐ, không hard-code câm — truyền ratio khác để đổi độ nhạy nhãn mô tả. */
export const DEFAULT_IMBALANCE_RATIO = 3;

function sideOf(buy: number, sell: number, ratio: number): ImbalanceSide {
  if (buy === 0 && sell === 0) return "NONE";
  if (sell === 0) return buy > 0 ? "BUY" : "NONE";
  if (buy === 0) return sell > 0 ? "SELL" : "NONE";
  if (buy / sell >= ratio) return "BUY";
  if (sell / buy >= ratio) return "SELL";
  return "NONE";
}

/** Footprint của MỘT nến HTF từ M1 con. atr = ATR tại nến đó (đơn vị bin). Fail-closed khi không có M1. */
export function buildFootprint(m1Children: OhlcBar[], atr: number, ratio = DEFAULT_IMBALANCE_RATIO): BarFootprint {
  if (!m1Children || m1Children.length === 0) {
    return { rows: [], barDelta: 0, cvd: 0, reliability: "NO_M1_SOURCE", sourceM1Count: 0, dojiCount: 0 };
  }
  const bin = binWidth(atr);
  const agg = new Map<number, { buy: number; sell: number }>();   // key bin → đếm buy/sell
  let dojiCount = 0;
  for (const m of m1Children) {
    if (m.c === m.o) { dojiCount++; continue; }                   // doji: không tính buy/sell, không vào total
    const key = binKeyOf(m.c, bin);                               // bin theo close của chính nến M1
    const cell = agg.get(key) || { buy: 0, sell: 0 };
    if (m.c > m.o) cell.buy++; else cell.sell++;
    agg.set(key, cell);
  }
  const rows: FootprintRow[] = [...agg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, v]) => {
      const total = v.buy + v.sell;
      return { priceLo: +((key - 0.5) * bin).toFixed(5), priceHi: +((key + 0.5) * bin).toFixed(5), buyVolumeProxy: v.buy, sellVolumeProxy: v.sell, deltaProxy: v.buy - v.sell, total, imbalanceSide: sideOf(v.buy, v.sell, ratio) };
    });
  const barDelta = rows.reduce((s, r) => s + r.deltaProxy, 0);
  return { rows, barDelta, cvd: 0, reliability: "M1_DERIVED_PROXY", sourceM1Count: m1Children.length, dojiCount };
}

/** Chuỗi footprint qua các nến HTF + CVD tích lũy. atrByBar phải cùng độ dài m1ByBar (ATR mỗi nến).
 *  Bar không M1 → barDelta 0 (fail-closed) nên CVD giữ nguyên qua nó, không nhảy giả. */
export function buildFootprintSeries(m1ByBar: OhlcBar[][], atrByBar: number[], ratio = DEFAULT_IMBALANCE_RATIO): BarFootprint[] {
  const out: BarFootprint[] = [];
  let cvd = 0;
  for (let i = 0; i < m1ByBar.length; i++) {
    const fp = buildFootprint(m1ByBar[i], atrByBar[i] ?? 0, ratio);
    cvd += fp.barDelta;
    out.push({ ...fp, cvd });
  }
  return out;
}
