// valueAreaProxy — OHLCV_PROXY / TPO_PRICE_HISTOGRAM (WO: MFE_COCKPIT_VALUE_AREA_PROXY_WO_V1 · SHADOW_ONLY/DESCRIPTIVE_ONLY)
//
// NƠI DUY NHẤT của codebase chứa vòng lặp histogram giá (cửa sổ 96 nến lùi từ i, bin = max(ATR×0.25, 1e-9),
// đếm theo Math.round(close/bin)) — tham số TÁI DÙNG chính xác từ pocDistAtrAt đã proven của engine.
// ĐÂY KHÔNG PHẢI "volume profile" hay "order flow" thật: cột volume của CSV nguồn đã xác minh là số thập phân
// cực nhỏ không đáng tin (0.00851…) nên histogram chỉ ĐẾM GIÁ ĐÓNG NẾN (TPO-style, price-only proxy).
// Value Area (VAH/VAL @ 70%) là HÌNH HỌC MÔ TẢ — không phải bằng chứng dự đoán; mọi claim dự đoán phải qua
// signal_material_gate.py (track Python, NET ΔR≥0.03R/2-era/permutation) ở WO riêng do manager duyệt.
// Consumer hợp pháp: realisticStrategySim.pocDistAtrAt (refactor gọi chung) + cardZones.value_area_zone (vẽ mô tả).

export interface PriceHistogram {
  bin: number;                    // bề rộng bin theo giá (= max(a×0.25, 1e-9))
  counts: Map<number, number>;    // key = Math.round(close/bin) → số nến đóng trong bin
  total: number;                  // tổng count cửa sổ
  pocKey: number;                 // bin đông nhất (tie-break: giữ bin GẶP TRƯỚC theo thứ tự nến — giống engine cũ)
}

// ── PRIMITIVE binning (WO FOOTPRINT_PROXY_V1): NƠI DUY NHẤT định nghĩa công thức bin — dùng chung bởi
// buildPriceHistogram (P1 value-area) và footprintProxy (P3). Số học GIỐNG HỆT nguyên bản; tách để không chép lại. ──
/** Bề rộng bin theo giá = max(ATR×0.25, 1e-9) — sàn 1e-9 tránh chia 0 khi ATR≈0. */
export function binWidth(a: number): number { return Math.max(a * 0.25, 1e-9); }
/** Key bin của một mức giá (Math.round — GIỐNG HỆT engine cũ). */
export function binKeyOf(price: number, bin: number): number { return Math.round(price / bin); }

/** Histogram giá 96 nến — số học GIỐNG HỆT vòng lặp pocDistAtrAt nguyên bản của engine. */
export function buildPriceHistogram(bars: { c: number }[], i: number, a: number): PriceHistogram {
  const bin = binWidth(a); const counts = new Map<number, number>();
  for (let k = Math.max(0, i - 95); k <= i; k++) { const key = binKeyOf(bars[k].c, bin); counts.set(key, (counts.get(key) || 0) + 1); }
  let best = 0, bestK = binKeyOf(bars[i].c, bin), total = 0;
  for (const [k2, c2] of counts) { total += c2; if (c2 > best) { best = c2; bestK = k2; } }
  return { bin, counts, total, pocKey: bestK };
}

/** Khoảng cách close(i) → POC theo ATR — hàm thay thế 1-1 cho pocDistAtrAt cục bộ cũ (denominator a||1 giữ nguyên). */
export function pocDistAtrOf(bars: { c: number }[], i: number, a: number): number {
  const h = buildPriceHistogram(bars, i, a);
  return Math.abs(bars[i].c - h.pocKey * h.bin) / (a || 1);
}

/** Value Area chuẩn Market Profile trên histogram TPO: mở rộng LIÊN TỤC từ bin POC ra hai phía, mỗi bước lấy
 *  phía có count cao hơn (hòa → ưu tiên lên, tất định), tới khi tổng ≥ mass (70%). Trả GIÁ THẬT (không phải ×ATR). */
export function valueAreaOf(bars: { c: number }[], i: number, a: number, mass = 0.70): { poc: number; vah: number; val: number } {
  const h = buildPriceHistogram(bars, i, a);
  const keys = [...h.counts.keys()];
  const minK = Math.min(...keys), maxK = Math.max(...keys);
  const cnt = (k: number) => h.counts.get(k) || 0;
  let upK = h.pocKey, dnK = h.pocKey, acc = cnt(h.pocKey);
  const target = mass * h.total;
  while (acc < target && (upK < maxK || dnK > minK)) {
    const upNext = upK < maxK ? cnt(upK + 1) : -1;   // -1 = phía đó đã hết đường
    const dnNext = dnK > minK ? cnt(dnK - 1) : -1;
    if (upNext >= dnNext) { upK++; acc += Math.max(0, upNext); }
    else { dnK--; acc += Math.max(0, dnNext); }
  }
  return { poc: h.pocKey * h.bin, vah: upK * h.bin, val: dnK * h.bin };
}
