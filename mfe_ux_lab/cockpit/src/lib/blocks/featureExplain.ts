// featureExplain — Vietnamese plain-language for blocks + whole features. `explainBlock` gives ONE clear
// param-aware sentence for ANY block (used in the Inspector); `explainFeature` aggregates those per-block
// sentences (in topo order, with the wired input labels) + a compact formula — so the module's mechanism is
// just the sum of its blocks' explanations + the tuned params. Pure description; no numbers fabricated.
import { BLOCKS_BY_ID } from "./blockLibrary.ts";
import type { FeatureGraph, FeatureNode } from "./featureGraph.ts";

const pnum = (params: Record<string, number> | undefined, key: string, def: number) => { const v = params?.[key]; return typeof v === "number" ? v : def; };

// ONE Vietnamese explanation for a block, given its params + (optional) the labels of what feeds it. Falls back
// to the block's own description so EVERY block always has a clean explanation.
export function explainBlock(blockId: string, params?: Record<string, number>, ins: string[] = ["đầu vào", "đầu vào B", "đầu vào C"]): string {
  const b = BLOCKS_BY_ID[blockId]; if (!b) return blockId;
  const [a = "?", c = "?", d = "?"] = ins;
  const P = (k: string, def: number) => pnum(params, k, def);
  switch (blockId) {
    case "div_atr": return `${a} ÷ ATR(${P("p", 14)}) — chuẩn hóa theo biến động để so sánh được giữa các thị trường`;
    case "div_price": return `${a} ÷ giá × 10000 — đổi sang điểm cơ bản`;
    case "ratio": return `${a} ÷ ${c} (chia an toàn, mẫu ≈ 0 → 0)`;
    case "diff": case "sub": return `${a} − ${c}`;
    case "add": return `${a} + ${c}`;
    case "mul": return `${a} × ${c}`;
    case "ema": return `EMA của ${a} — trung bình mũ chu kỳ ${P("p", 10)} (lớn hơn ⇒ mượt + trễ hơn)`;
    case "sma": return `trung bình ${P("p", 10)} nến của ${a}`;
    case "roll_max": return `đỉnh ${P("N", 20)} nến gần nhất của ${a}`;
    case "roll_min": return `đáy ${P("N", 20)} nến gần nhất của ${a}`;
    case "roll_mean": return `trung bình ${P("N", 20)} nến của ${a}`;
    case "roll_median": return `trung vị ${P("N", 20)} nến của ${a}`;
    case "roll_std": return `độ lệch chuẩn ${P("N", 20)} nến của ${a} (thước đo biến động)`;
    case "roll_range": return `biên độ (max − min) ${P("N", 20)} nến của ${a}`;
    case "roll_sum": return `tổng ${P("N", 20)} nến của ${a}`;
    case "percent_rank": return `phân vị của ${a} trong ${P("N", 50)} nến — đang cao/thấp cỡ nào so lịch sử (0–1)`;
    case "zscore": return `z-score của ${a} trên ${P("N", 50)} nến`;
    case "minmax": return `co ${a} về [0,1] trong cửa sổ ${P("N", 50)} nến`;
    case "count_above": return `đếm số nến có ${a} > ${P("t", 0)} trong ${P("N", 20)} nến`;
    case "reg_slope": return `độ dốc hồi quy ${P("N", 20)} nến của ${a}`;
    case "path_length": return `tổng |thay đổi| ${P("N", 20)} nến của ${a} (độ ngoằn ngoèo)`;
    case "lag": return `${a} của ${P("k", 1)} nến trước`;
    case "delta": return `${a} − giá trị ${P("k", 1)} nến trước`;
    case "roc": return `% thay đổi ${a} sau ${P("k", 1)} nến`;
    case "slope": return `độ dốc của ${a} (so với nến liền trước)`;
    case "neg": return `đảo dấu ${a}`;
    case "abs": return `giá trị tuyệt đối |${a}|`;
    case "sign": return `dấu của ${a} (−1/0/1)`;
    case "sqrt": return `căn bậc hai √|${a}|`;
    case "pow": return `${a} mũ ${P("e", 2)}`;
    case "clamp": return `kẹp ${a} vào khoảng [${P("lo", 0)}, ${P("hi", 1)}]`;
    case "clamp_out": return `kẹp ${a} về [0,1] làm output sạch`;
    case "scale": return `${a} × ${P("k", 1)}`;
    case "offset": return `${a} + ${P("c", 0)}`;
    case "min2": return `nhỏ hơn giữa ${a} và ${c}`;
    case "max2": return `lớn hơn giữa ${a} và ${c}`;
    case "threshold": return `bằng 1 nếu ${a} > ${P("t", 0)}, ngược lại 0`;
    case "between": return `bằng 1 nếu ${P("lo", 0)} ≤ ${a} ≤ ${P("hi", 1)}, ngược lại 0`;
    case "gt": return `${a} > ${c} (đúng/sai)`;
    case "lt": return `${a} < ${c} (đúng/sai)`;
    case "and": return `${a} VÀ ${c} (cả hai đúng)`;
    case "or": return `${a} HOẶC ${c} (một trong hai đúng)`;
    case "not": return `phủ định ${a}`;
    case "xor": return `${a} khác ${c}`;
    case "if_else": return `nếu ${a} đúng thì lấy ${c}, ngược lại lấy ${d}`;
    case "cross_above": return `bằng 1 đúng nến ${a} cắt LÊN ${c}`;
    case "cross_below": return `bằng 1 đúng nến ${a} cắt XUỐNG ${c}`;
    case "hysteresis": return `bật khi ${a} > ${P("on", 0.7)}, tắt khi < ${P("off", 0.3)} (ngưỡng dính, chống flip-flop)`;
    case "since_event": return `số nến kể từ lần ${a} gần nhất`;
    case "emit_feature": return `XUẤT ${a} làm giá trị feature cuối cùng`;
    case "map_label": return `gắn nhãn mô tả cho ${a} (chỉ hiển thị)`;
    case "nan_guard": return `chặn giá trị hỏng của ${a} (NaN/Inf → 0)`;
    case "kidi_guard": return `KIDI guard cho ${a} (mẫu ≈ 0 → SINGULAR)`;
    case "nolookahead_seal": return `niêm phong no-lookahead cho ${a}`;
    case "swing_high": return `đỉnh pivot xác nhận ${P("W", 3)} nến (không nhìn tương lai)`;
    case "const_value": return `hằng số ${P("v", 1)}`;
    default: return b.inputs.some((p) => p.type === "STREAM_OHLC") ? `lấy ${b.label} của nến` : b.description;
  }
}

function topo(g: FeatureGraph): FeatureNode[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out: FeatureNode[] = [], seen = new Set<string>();
  const visit = (id: string, stack: Set<string>) => {
    if (seen.has(id) || stack.has(id)) return; stack.add(id);
    const n = byId.get(id); if (!n) return;
    for (const up of n.inputs) if (up) visit(up, stack);
    stack.delete(id); seen.add(id); out.push(n);
  };
  for (const n of g.nodes) visit(n.id, new Set());
  return out;
}

// compact formula expression for the output node (recursive, parenthesised).
function exprOf(id: string, byId: Map<string, FeatureNode>, stack = new Set<string>()): string {
  const n = byId.get(id); if (!n || stack.has(id)) return "?";
  const b = BLOCKS_BY_ID[n.blockId]; if (!b) return id;
  stack.add(id);
  const e = n.inputs.map((up) => (up ? exprOf(up, byId, stack) : "?"));
  stack.delete(id);
  const [a = "?", c = "?", d = "?"] = e, P = (k: string, def: number) => pnum(n.params, k, def);
  switch (n.blockId) {
    case "emit_feature": case "nolookahead_seal": case "nan_guard": case "map_label": return a;
    case "div_atr": return `${a}÷ATR`;
    case "ratio": case "div": return `${a}÷${c}`;
    case "mul": return `${a}×${c}`;
    case "sub": case "diff": return `(${a}−${c})`;
    case "add": return `(${a}+${c})`;
    case "clamp_out": return `clamp01(${a})`;
    case "clamp": return `clamp(${a})`;
    case "neg": return `−${a}`;
    case "scale": return `${a}×${P("k", 1)}`;
    case "offset": return `(${a}+${P("c", 0)})`;
    case "percent_rank": return `pct(${a})`;
    case "ema": return `EMA(${a})`;
    case "if_else": return `(${a}?${c}:${d})`;
    case "threshold": return `(${a}>${P("t", 0)})`;
    case "const_value": return `${P("v", 1)}`;
    default: return b.inputs.some((p) => p.type === "STREAM_OHLC") || b.inputs.length === 0 ? b.label : `${b.label}(${e.join(",")})`;
  }
}

export interface FeatureExplanation { steps: { id: string; label: string; text: string }[]; formula: string; outType: string; outRange?: string; blockCount: number }

export function explainFeature(g: FeatureGraph): FeatureExplanation {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const steps = topo(g).map((n) => {
    const ins = n.inputs.map((up) => (up ? (BLOCKS_BY_ID[byId.get(up)?.blockId ?? ""]?.label ?? up) : "?"));
    return { id: n.id, label: BLOCKS_BY_ID[n.blockId]?.label ?? n.blockId, text: explainBlock(n.blockId, n.params, ins) };
  });
  const outBlock = BLOCKS_BY_ID[byId.get(g.output)?.blockId ?? ""];
  return { steps, formula: exprOf(g.output, byId), outType: outBlock?.outputs[0].type ?? "—", outRange: outBlock?.outputs[0].range, blockCount: g.nodes.length };
}
