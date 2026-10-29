// palette — NGUỒN MÀU ACCENT DUY NHẤT cho sandbox/kit (chuẩn-hoá token). Giữ đúng giá-trị đang dùng = ĐỒNG BỘ với L2
// (cùng #37c0ff… family), KHÔNG đổi palette tổng, byte-identical thị-giác. alpha() thay pattern hex+"55" rải rác →
// append độ mờ sạch. Mọi block-kit tham chiếu ở đây thay vì hardcode → đổi màu 1 chỗ là cả sandbox theo.
// (Ghi chú: tokens.css/TK dùng palette "chính thức" #25B7FF — khác de-facto này; hợp nhất TK↔de-facto là việc
//  theme toàn hệ thống / brand-redesign, ngoài scope sandbox.)
export const ACCENT = {
  cyan: "#37c0ff", blue: "#58a6ff", blue2: "#79c0ff",
  green: "#21d07a", greenBar: "#2BB673",
  red: "#f7768e", redBar: "#F0524A",
  amber: "#e3b341", orange: "#d29922",
  purple: "#a371f7", violet: "#9d8bff",
  teal: "#5ad1c4",
  grey: "#3a4656", muted: "#5b6b7d",
} as const;

// append độ mờ vào một hex accent (pct 0..1) → #rrggbbaa. Thay cho `HEX + "55"` (chỉ đúng với hex, vỡ với var()).
export function alpha(hex: string, pct: number): string {
  const a = Math.round(Math.max(0, Math.min(1, pct)) * 255).toString(16).padStart(2, "0");
  return hex + a;
}
