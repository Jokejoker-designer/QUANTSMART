// microscopeComputed — cụm aggregate HONESTY-CRITICAL của Microscope, tách khỏi JSX (WO UX2 Phase A).
// Công thức COPY NGUYÊN VĂN từ hàm `side()` inline cũ (Microscope.tsx dòng 481-485 + verdict edge dòng 494)
// — kể cả thứ tự toFixed (netR round TRƯỚC khi chia exp). KHÔNG "sửa cho hợp lý hơn": snapshot harness chốt
// từng giá trị; đổi công thức = test đỏ = vi phạm presentation-only.
// PURE — không side-effect, không JSX. Guard: microscopeComputed.harness.ts.

export interface CompareCardSummary {
  n: number;
  netR: number;
  exp: number | null;
  pf: number;
  grossPf: number;
  dd: number;
  win: number;
  edge: boolean;   // verdict "CÓ edge sau phí (cửa sổ này)" = pf > 1 && netR > 0
}

interface BtLike {
  sim: { trades: { netR: number }[] };
  analytics: { netPF: number; grossPF: number; maxDDNetR: number };
}

export function compareCardSummary(bt2: BtLike): CompareCardSummary {
  const t = bt2.sim.trades || [];
  const netR = +t.reduce((s: number, x: { netR: number }) => s + x.netR, 0).toFixed(1);
  const n = t.length;
  const exp = n ? +(netR / n).toFixed(4) : null;
  const pf = bt2.analytics.netPF, grossPf = bt2.analytics.grossPF, dd = bt2.analytics.maxDDNetR;
  const win = n ? +(t.filter((x: { netR: number }) => x.netR > 0).length / n * 100).toFixed(1) : 0;
  return { n, netR, exp, pf, grossPf, dd, win, edge: pf > 1 && netR > 0 };
}
