// aiContextPack — WO INTENT_SANDBOX. Context Pack cho AI của USER — **PER-TẦNG**, không phải một pack khổng lồ.
//
// VÌ SAO per-tầng (cứng trong code, không phải sở thích):
//   (1) mỗi tầng có bộ NGUYÊN LIỆU riêng: L1=85 feature block/9 nhóm · L2=56 indicator block · L3=AST safe-math ·
//       L4=context module · L5=56 decision block · Conditions=29 metric (điều kiện L4/L5).
//   (2) mỗi tầng có AUTHORITY khác nhau ĐÓNG TRONG TYPE (L2Authority: advisoryOnly·noEntry·noExit·noZone ·
//       L5Authority: zoneOnly·noAutoLot·noExactSlTp·humanDecides). Gộp một prompt → AI không biết block thuộc
//       tầng nào, được phép gì → dễ xây module VƯỢT QUYỀN. Pack per-tầng = một "skill" mang đúng luật của tầng đó
//       (progressive disclosure / Agent Skills — chống context-rot).
//
// Mỗi pack có ĐỦ 5 phần: (1) block/metric của RIÊNG tầng · (2) authority/luật tầng · (3) output type · (4) JSON
// schema + ví dụ · (5) cách nối tầng. Module IMPORT-được + preview-được là condition-module (L4/L5 + L0) → chạy
// qua parseAiModule → validateModule (cửa chặn đã có, KHÔNG nới) → Intent Sandbox. Hợp-lệ ≠ edge — phải Microscope.
import { METRICS, LEVEL_TEMPLATES, validateModule, type CustomModule, type Level, type Role, type Op } from "./customModule.ts";
import { BLOCKS as L1_BLOCKS } from "./blocks/blockLibrary.ts";
import { L1_GROUPS } from "./blocks/blockTypes.ts";
import { L2_BLOCKS } from "./blocks/l2BlockLibrary.ts";
import { L2_GROUPS } from "./blocks/l2BlockTypes.ts";
import { L5_BLOCKS } from "./blocks/l5BlockLibrary.ts";
import { L5_GROUPS } from "./blocks/l5BlockTypes.ts";
import { OP_SPEC, QUANT_AUTHORITY, mkInput, mkConst, mkOp, nid, type QuantOp, type QuantFormulaAst, type QuantAstNode, type QuantOutputType } from "./blocks/quantAstTypes.ts";
import { validateAst } from "./blocks/quantAstSafety.ts";
import { SEED_MACROS } from "./blocks/quantMacroRegistry.ts";
// ── import-ngược stores: mỗi tầng lưu về ĐÚNG kho của nó (L1 graph / L2 weighted-sum / L3 AST / L4·L5 rule) ──
import { validateL1Draft, saveCustomL1, loadCustomL1, type CustomL1Module } from "./blocks/customL1.ts";
import { type FeatureGraph } from "./blocks/featureGraph.ts";
import { saveCustomL2, loadCustomL2, type CustomL2Module, type L2Kind } from "./blocks/customL2.ts";
import { saveCustomL6, loadCustomL6, validateL6Zone, ZONE_ROLES, ZONE_ANCHORS, type CustomL6Zone, type ZoneRole, type ZoneAnchor } from "./blocks/customL6.ts";
import { upsertCustomL3, astHash, L3_AUTHORITY, type CustomL3Module } from "./blocks/customL3.ts";
import { L1_PICKABLE } from "./blocks/l2Eval.ts";
import { loadCustomModules, saveCustomModules } from "./customModule.ts";
import { astToText } from "./blocks/quantFormulaText.ts";
import { customMetricKeys, listCustomMetrics } from "./customMetricBridge.ts";

export type PackLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "CONDITIONS";
export const PACK_LAYERS: PackLayer[] = ["L1", "L2", "L3", "L4", "L5", "L6", "CONDITIONS"];

// authority/output/chaining — hard-coded khớp type từng tầng (xem L2Authority/L5Authority trong *BlockTypes.ts)
const LAYER_META: Record<PackLayer, { title: string; authority: string; output: string; place: string }> = {
  L1: { title: "L1 · Feature", authority: "canEmitFeature — CHỈ ĐO. KHÔNG order · KHÔNG zone · KHÔNG signal/vào-lệnh.", output: "number / measurement (một con số causal từ OHLC)", place: "gốc dây chuyền — L2 sẽ đọc feature của bạn" },
  L2: { title: "L2 · Indicator", authority: "advisoryOnly · noEntry · noExit · noZone · noOrderSend · notLiveReady — chỉ TƯ VẤN trạng-thái.", output: "context / indicator state (cao/thường/thấp, regime…)", place: "đọc feature L1 → xuất state; L5 sẽ đọc state của bạn" },
  L3: { title: "L3 · QuantLab formula", authority: "number-only · no order — AST safe-math (whitelist), xuất SỐ, không lệnh, không zone.", output: "number (score/tín-hiệu số, đã qua permutation-null trước khi tin)", place: "ghép nhiều feature/indicator → một số; feed L4/L5 làm evidence" },
  L4: { title: "L4 · Context", authority: "market-context — bật/tắt GATE theo regime/state. KHÔNG order/lot/SL-TP.", output: "gate state (cho phép / cấm vào lệnh)", place: "đọc L1/L2/L3 → quyết môi-trường có phù hợp không (gate cho L5)" },
  L5: { title: "L5 · Decision", authority: "advisoryOnly · zoneOnly · noOrderSend · noAutoLot · noExactSlTp · humanDecides — ra QUYẾT-ĐỊNH-TRẠNG-THÁI, NGƯỜI quyết, hệ KHÔNG tự đặt lệnh/lot/SL-TP chính xác.", output: "decision-state (setup → confirm → ready → veto → exit-hint · zone-only)", place: "đọc context L4 + indicator L2 → trạng-thái quyết-định; người bấm nút cuối" },
  L6: { title: "L6 · Zone", authority: "zone-only · advisory — xuất VÙNG để vẽ (quan-sát/rủi-ro/cầu/huỷ). KHÔNG vào lệnh.", output: "zone (dải giá để vẽ trên chart)", place: "cuối dây chuyền — hiển-thị vùng, không ra lệnh" },
  CONDITIONS: { title: "Executable conditions within the declared role", authority: "advisory-only · no-order · no-lookahead — module ĐỌC 29 metric cố-định, chạy mỗi nến, KHÔNG lệnh thật.", output: "vote / gate / veto / confirm-weight / exit — chạy trong engine + xem live trong Intent Sandbox", place: "đây là module IMPORT-được + PREVIEW-được (round-trip): AI trả JSON → hệ validate → bạn thấy nó bắn trên nến" },
};

// ví-dụ IMPORT-được (đã kiểm PASS bởi validateGraph/parseAiIndicator/parseAiFormula — dùng trong pack + harness)
export const L1_EXAMPLE = {
  name: "Body Ratio Feature", explain: "Measures candle body relative to its high/low range", why: "A geometry measurement; directional interpretation needs context",
  graph: { nodes: [{ id: "f", blockId: "body_ratio", inputs: [] }, { id: "out", blockId: "emit_feature", inputs: ["f"] }], output: "out" },
  explanation: "Feature đo body/range mỗi nến — số càng gần 1 nến càng đặc thân.",
};
export const L2_EXAMPLE = {
  name: "Trend-Vol Context", explain: "Combines EMA slope and ATR percentile as a trend-context input", kind: "indicator",
  featureKeys: ["ema_slope", "atr_percentile", "rsi_value"], weights: { ema_slope: 1.0, atr_percentile: 0.6, rsi_value: 0.4 },
  explanation: "Weighted-sum: EMA slope dẫn, ATR percentile lọc vol, RSI phụ.",
};
export const L3_EXAMPLE = {
  name: "Close-EMA over ATR", ast: { op: "DIV", args: [{ op: "SUB", args: ["close", "ema20"] }, "atr"] }, outputType: "SCORE",
  explanation: "(close − ema20) / atr — độ lệch giá so với EMA20 theo đơn vị ATR (scale-free).",
};
export const L6_EXAMPLE = {
  name: "Swing-low demand zone", explain: "A reference band around a recent swing low",
  anchor: "swing_low", role: "DEMAND", offsetAtr: 0, widthAtr: 0.5,
  explanation: "Zone cầu neo vào swing-low; chỉ để vẽ + quan sát, không sinh lệnh.",
};

const OPS: Op[] = [">", "<", ">=", "<=", "==", "between", "outside"];
const CHAIN = "Dây chuyền: **L1 feature (đo)** → **L2 indicator (state)** → **L3 score** → **L4 context-gate** → **L5 decision (zone-only, người quyết)** → **L6 zone (vẽ)**. Conditions (29 metric) là ngôn ngữ điều-kiện cho L0/L4/L5 executable.";

// liệt kê block theo nhóm (chỉ tầng đó — KHÔNG lẫn tầng khác)
function blockTable<T extends { blockId: string; group: string; label: string; description: string }>(blocks: T[], groups: readonly string[]): string {
  return groups.map((g) => {
    const rows = blocks.filter((b) => b.group === g);
    if (!rows.length) return "";
    return `**${g}** (${rows.length})\n` + rows.map((b) => `- \`${b.blockId}\` — ${b.label}: ${b.description}`).join("\n");
  }).filter(Boolean).join("\n\n");
}

// ── L3 NGOẠI LỆ: không phải block list — là KHUÔN CÔNG THỨC (AST). Từ vựng đọc từ OP_SPEC + SEED_MACROS thật. ──
// volume CỐ Ý KHÔNG có trong input mặc định: vàng (XAUUSD) volume là tick-vol RÁC (đã xác minh) → nếu cho AI
// dùng volume trong công thức là mời nó xây trên dữ liệu rác. validateAst sẽ REJECT "volume" như input-ma → fail-safe.
export const KNOWN_L3_INPUTS = ["close", "open", "high", "low", "ema10", "ema20", "ema34", "atr", "rsi"];
// danh sách feature L1 CÓ THẬT để L2/L3 tham chiếu (built-in + custom đã build) — chống AI bịa key không tồn tại.
// Dùng đúng `key` này làm featureKeys/input; custom L1 tham chiếu bằng ID (l1Series resolve theo id, mọi status).
function availableL1ForPrompt(): string {
  const builtin = L1_PICKABLE.map((t) => `\`${t.key}\``).join(" · ");
  const custom = loadCustomL1();
  let s = `- **Feature L1 CÓ SẴN để nối vào \`featureKeys\`** — CHỈ chọn từ đây, **ĐỪNG bịa key mới**:\n  · built-in (luôn có): ${builtin}`;
  if (custom.length) s += `\n  · của bạn (đã build ở L1 — dùng ĐÚNG id này): ${custom.map((m) => `\`${m.id}\` (${m.name} · ${m.status})`).join(" · ")}`;
  else s += `\n  · (bạn CHƯA build feature L1 riêng nào). Nếu cần một feature MỚI (vd hình-học đảo-chiều nến), **XÂY nó ở tầng L1 trước**, rồi quay lại L2 tham chiếu bằng id của nó. ĐỪNG bịa tên feature chưa tồn tại.`;
  return s;
}

function l3FormulaVocab(): string {
  const ops = (Object.keys(OP_SPEC) as QuantOp[]).map((o) => `\`${o}\`(${OP_SPEC[o].label})`).join(" · ");
  const macros = Object.values(SEED_MACROS).map((m) => `\`${m.macroId}\``).join(" · ");
  return `L3 KHÔNG chọn-ghép block rời — bạn **viết MỘT công thức** (cây biểu thức AST) trên chuỗi evidence L1/L2 + hằng số. Output LUÔN là **number** (score/xác-suất/chỉ-báo), không bao giờ order/zone/entry.

**Toán tử whitelist** (chỉ được dùng các op này): ${ops}
**Macros có sẵn** (dựng lại được như subtree): ${macros}
**⚠ SỐ CON (arity) + THAM SỐ — sai chỗ hay gặp nhất:** đa số op ăn ĐÚNG số con cố định; op có tham số KHÔNG để tham số thành \`args\` mà để riêng ở \`params\`:
  · 2 con: \`POW\`/\`GT\`/\`LT\`/\`EQ\` — vd \`{"op":"POW","args":["atr",2]}\`
  · **≥2 con (kết-hợp, hệ tự gộp trái)**: \`ADD\`/\`SUB\`/\`MUL\`/\`DIV\`/\`MIN\`/\`MAX\`/\`AND\`/\`OR\` — viết \`MUL(a,b,c)\` cũng được (thành \`MUL(MUL(a,b),c)\`); vd \`{"op":"MUL","args":[1.4,"ema_slope"]}\` hay \`{"op":"MAX","args":[0,"x","y"]}\`
  · 1 con: \`ABS\`/\`NEG\`/\`SIGN\`/\`LOG\`/\`EXP\`/\`SQRT\`/\`SIGMOID\`/\`TANH\`/\`NOT\`
  · 3 con: \`IF_ELSE\` (cond, khi-đúng, khi-sai)
  · **\`CLIP\` = 1 CON + params {min,max}** (KHÔNG phải clip(x,0,1) 3 args!): \`{"op":"CLIP","args":[<biểu-thức>],"params":{"min":0,"max":1}}\`
  · **cửa-sổ** (\`ROLL_MEAN\`/\`ROLL_STD\`/\`ROLL_SUM\`/\`ROLL_MAX\`/\`ROLL_MIN\`/\`PERCENTILE_RANK\`/\`EMA\`/\`MEDIAN\`/\`MAD\`/\`IQR\`/\`ROBUSTZ\`/\`OUTLIER\`) = 1 con + \`params:{"window":N}\`: \`{"op":"ROLL_MEAN","args":[<bt>],"params":{"window":20}}\`
  · **\`LAG\`/\`DELTA\`** = 1 con + \`params:{"lag":k}\` · **\`QUANTILE\`/\`WINSOR\`** = 1 con + \`params:{"q":0.9,"window":N}\`
  · **\`MACRO_REF\`**: \`{"op":"MACRO_REF","args":["zscore",<bt>],"params":{"window":50}}\` (macroId ở args[0]; các con còn lại là biểu-thức)
  (Hệ CŨNG chấp nhận dạng hằng-số-đuôi kiểu hàm — clip(x,0,1)·mean(x,20)·lag(x,1) — tự chuyển sang params; nhưng khai \`params\` là chắc nhất.)
**Input hợp lệ**: tham chiếu series ${KNOWN_L3_INPUTS.map((i) => `\`${i}\``).join(" · ")} + feature L1/L2 đã build (dùng ĐÚNG id) + hằng số (CONST). **KHÔNG dùng \`volume\`** — vàng có volume tick RÁC, hệ sẽ REJECT như input-ma. ⛔ ĐỪNG bịa tên input chưa tồn tại — input không resolve → công thức ra 0 (phẳng).
${availableL1ForPrompt().replace("`featureKeys`", "input L3")}
**Guardrails**: causalOnly (chỉ đọc quá-khứ) · **number-only** · advisoryOnly · noEntry · noZone · **noOrderSend** · noAutoLot. Mọi safe-math (safeDiv/safeLog/safeSqrt/safePow) tự seal NaN/∞.
**Ví dụ** — zscore của độ lệch giá so EMA20 theo ATR: \`zscore((close − ema20) / atr)\` (macro zscore là subtree; DIV an toàn qua safeDiv).
**Cửa chặn riêng**: import L3 dùng \`validateAst\` (KHÔNG phải validateModule của L4/L5) — enforce whitelist op, arity, input hợp lệ, macro đã khai, không cycle. Op ngoài whitelist / input ma → REJECT.`;
}

// ── layerSection: nội-dung "③ Nguyên-liệu" của MỘT tầng — dùng CHUNG bởi buildLayerPack + buildMasterPrompt.
// Vì master ghép NGUYÊN các section này, per-tầng luôn là TẬP CON LITERAL của master (kiểm được bằng includes). ──
export function layerSection(layer: PackLayer): string {
  const m = LAYER_META[layer];
  const auth = `### ${m.title}\n- **Authority**: ${m.authority}\n- **Output type**: ${m.output}\n- **Vị trí**: ${m.place}`;
  if (layer === "L1") return `${auth}\n- **Nguyên-liệu** — ${L1_BLOCKS.length} feature block / ${L1_GROUPS.length} nhóm (chọn & ghép):\n${blockTable(L1_BLOCKS, L1_GROUPS)}`;
  if (layer === "L2") return `${auth}\n${availableL1ForPrompt()}\n- **Nguyên-liệu** — ${L2_BLOCKS.length} indicator block / ${L2_GROUPS.length} nhóm (chọn & ghép):\n${blockTable(L2_BLOCKS, L2_GROUPS)}`;
  if (layer === "L5") return `${auth}\n- **Nguyên-liệu** — ${L5_BLOCKS.length} decision block / ${L5_GROUPS.length} nhóm (chọn & ghép); L5 executable dùng điều-kiện 29 metric:\n${blockTable(L5_BLOCKS, L5_GROUPS)}`;
  if (layer === "L3") return `${auth}\n- **Nguyên-liệu** (KHUÔN CÔNG THỨC):\n${l3FormulaVocab()}`;
  if (layer === "L4" || layer === "CONDITIONS") return `${auth}\n- **Nguyên-liệu** — điều-kiện 29 metric:\n${metricList()}`;
  // L6
  return `${auth}\n- **Nguyên-liệu** — xuất một VÙNG (dải giá) để vẽ; không điều-kiện vào lệnh.`;
}

export const FEW_SHOT_PRESETS: { name: string; module: Partial<CustomModule> }[] = [
  { name: "Trend-strength gate", module: { level: 4, role: "CONTEXT_GATE", name: "Trend-strength gate", explain: "Allows a candidate only when the configured EMA gap is sufficient", why: "A context hypothesis requiring measurement", conditions: [{ metric: "emaGapAtr", op: ">", value: 0.5 }], logic: "ALL" } },
  { name: "Extension veto", module: { level: 5, role: "VETO", name: "Breakout-extension veto", explain: "Excludes a candidate extended too far beyond its 20-bar reference", why: "A location constraint; it does not predict whether a retest will occur", conditions: [{ metric: "extAtr", op: ">", value: 0.8 }], logic: "ALL" } },
  { name: "RSI reclaim trigger", module: { level: 5, role: "TRIGGER", name: "RSI oversold reclaim", explain: "Contributes a long candidate after the configured RSI reclaim", why: "A mean-reversion hypothesis requiring held-out confirmation", conditions: [{ metric: "rsi", op: "between", value: 30, value2: 45 }], logic: "ALL", direction: "LONG", weight: 0.8, reliability: 0.53 } },
];

const RULES = `## LUẬT BẤT DI của tầng này (vi phạm = hệ TỪ CHỐI)
1. **advisory-only** — module KHÔNG đặt lệnh thật, không lot/risk/SL-TP số.
2. **no-order** — cấm order_send/lot/risk_pct/buy/sell; hệ sẽ BỎ chúng, đừng thêm.
3. **no-lookahead** — chỉ đọc dữ liệu tại/trước nến hiện tại.
4. **đúng authority của tầng** (xem mục Authority) — không xây vượt quyền, không lẫn tầng.
5. Chỉ dùng nguyên-liệu (block/metric) của CHÍNH tầng này liệt kê bên dưới; metric/op ngoài danh mục → hệ REJECT.

> ⛔ **VÍ DỤ SAI** (đừng làm): \`{ "order_send": true, "lot": 0.1, "risk_pct": 2 }\` → hệ BỎ 3 field này (module vẫn nhận nhưng advisory). \`{ "metric": "order_book_delta" }\` → REJECT (metric không có trong danh mục). Bịa metric/op = module bị từ chối.`;

// Ví dụ HỎI-ĐÁP (làm rõ ý mơ hồ) + luật output "chỉ JSON" + cấu trúc explanation — chỉ vào MASTER (user mơ hồ).
const ASK_AND_OUTPUT = `## CÁCH LÀM VIỆC — HỎI TRƯỚC, XÂY SAU (quan trọng nhất)
Ý tưởng user thường mơ hồ. **ĐỪNG xây ngay với giả định** — hỏi 2-4 câu làm rõ trước. Ví dụ mẫu:
> **User**: "Tôi muốn bắt sóng hồi sau khi giá phá đỉnh."
> **AI**: Để xây đúng ý, cho tôi hỏi: (1) phá đỉnh bao nhiêu nến gần nhất (vd 20)? (2) vào ngay khi phá, hay chờ giá HỒI về test lại rồi mới vào? (3) có tránh lúc thị trường đi ngang (chop) không?
> **User**: "Phá đỉnh 20 nến, chờ hồi test, tránh chop."
> **AI**: (giờ mới xây) → trả JSON + explanation.

## OUTPUT — trả về ĐÚNG MỘT khối \`\`\`json … \`\`\`, KHÔNG văn bản ngoài khối
Mọi lời giải thích đặt vào trường \`explanation\` BÊN TRONG JSON. \`explanation\` nên trả lời 3 ý đời thường: (a) module BẮT khoảnh-khắc gì · (b) bằng BẰNG-CHỨNG nào (metric nào vượt ngưỡng nào) · (c) khi nào nó KHÔNG bắn.`;

const METRIC_HINTS = `## GỢI Ý chọn metric theo ý tưởng (tham khảo — vẫn phải dùng key CÓ trong danh mục 29)
- Thuận **trend** → \`emaGapAtr\` · \`htfAlign\` · \`priceEmaAtr\`   |   Tránh **chop** → \`atrRatio\` · \`flowConsistency\` · \`regime\`
- Chống **đuổi đỉnh** → \`extAtr\` · \`rsi\`   |   Bắt **phá vỡ** → \`brokeHigh20\`/\`brokeLow20\` · \`wickRatio\` · \`bodyRatio\`
- Quản **phiên/chi phí** → \`overlap\` · \`spread\` · \`hour\``;

// SCHEMA JSON — level/role ĐÚNG THEO TẦNG (không cứng level:4). Master (mọi tầng) dùng bản neutral; pack L4/L5 dùng
// bản cố-định level của tầng đó (chống lỗi doc-conflict "pack L5 mà schema ghi level:4/CONTEXT_GATE").
function conditionSchema(layer?: "L4" | "L5"): string {
  const levelLine = layer === "L5" ? `"level": 5` : layer === "L4" ? `"level": 4` : `"level": <4 hoặc 5>`;
  const roleLine = layer === "L5" ? `"role": "<TRIGGER | VETO | CONFIRM | EXIT>"` : layer === "L4" ? `"role": "CONTEXT_GATE"` : `"role": "<CONTEXT_GATE (L4) | TRIGGER/VETO/CONFIRM/EXIT (L5)>"`;
  const l5note = layer === "L5" ? `\n- **L5**: mọi \`conditions\` được nạp thẳng vào SETUP của builder; role TRIGGER mà \`conditions\` RỖNG → hệ TỪ CHỐI (không nạp module rỗng).` : "";
  return `## SCHEMA JSON (trả ĐÚNG một object — module điều-kiện chạy được)
\`\`\`json
{ ${levelLine}, ${roleLine}, "name": "tên ≥3 ký tự",
  "explain": "làm gì (≥12 ký tự)", "why": "vì sao hợp lý (≥12 ký tự)",
  "conditions": [ { "metric": "<key trong 29 metric HOẶC id evidence L1/L2/L3>", "op": "<toán tử>", "value": 0, "value2": 0 } ],
  "logic": "ALL", "direction": "LONG", "exitAction": "CLOSE", "lockR": 0.5 }
\`\`\`
- \`direction\` chỉ role TRIGGER (LONG/SHORT/REGIME) · \`exitAction\`/\`lockR\` chỉ role EXIT · \`between\`/\`outside\` cần \`value2\`.${l5note}`;
}
const CONDITION_SCHEMA = conditionSchema();

// ── OUTPUT-LOCK: khóa ĐẦU RA của MỘT tầng ngay đầu pack. Chống lỗi "chọn L1 nhưng AI trả L5": mỗi tầng có
// format riêng, cấm trả format tầng khác. L1/L2/L6 KHÔNG import-JSON (visual-authored) → AI phải MÔ TẢ block. ──
function outputLock(layer: PackLayer): string {
  const L = `> ⚡ **BẠN LÀ trợ-lý xây tầng ${layer} — KHÔNG phải review tài-liệu.** Đây là pack của RIÊNG tầng ${layer}.`;
  if (layer === "L4") return `${L}\n> **OUTPUT tầng L4 = MỘT khối \`\`\`json\`\`\` với \`level:4, role:"CONTEXT_GATE"\`.** TUYỆT ĐỐI KHÔNG trả level khác (không level:5). Chỉ hỏi làm rõ HOẶC trả đúng JSON L4.`;
  if (layer === "L5") return `${L}\n> **OUTPUT tầng L5 = MỘT khối \`\`\`json\`\`\` với \`level:5, role\` ∈ {TRIGGER,VETO,CONFIRM,EXIT}.** TUYỆT ĐỐI KHÔNG trả level:4. Chỉ hỏi làm rõ HOẶC trả đúng JSON L5.`;
  if (layer === "CONDITIONS") return `${L}\n> **OUTPUT = MỘT khối \`\`\`json\`\`\` condition-module (level 0/4/5).** Chỉ hỏi làm rõ HOẶC trả đúng JSON.`;
  if (layer === "L3") return `${L}\n> **OUTPUT tầng L3 = MỘT khối \`\`\`json\`\`\` CÔNG THỨC AST: \`{ "name":"…", "ast": {…}, "outputType": "SCORE", "explanation": "…" }\`.** \`ast\` được phép là cây LỒNG NHAU \`{ "op":"…", "args":[…] }\` (hệ tự chuyển sang dạng phẳng khi import). TUYỆT ĐỐI KHÔNG trả condition-module (level/role/conditions) — đó là L4/L5.`;
  if (layer === "L1") return `${L}\n> **OUTPUT tầng L1 = MỘT khối \`\`\`json\`\`\` FeatureGraph: \`{ "name","explain","why","graph": { "nodes":[{"id","blockId","params?","inputs":[…]}], "output":"<id node emit>" }, "explanation" }\`.** Chỉ dùng \`blockId\` trong 85 block dưới; \`inputs\` nối \`id\` node khác (port STREAM_OHLC KHÔNG tính — để \`inputs:[]\`); node \`output\` PHẢI là \`emit_feature\`. Hệ có nút **Import JSON** → \`validateGraph\`. ⛔ KHÔNG trả level:4/level:5.`;
  if (layer === "L2") return `${L}\n> **OUTPUT tầng L2 = MỘT khối \`\`\`json\`\`\` weighted-sum: \`{ "name","explain","kind":"indicator|regime|bias|confidence","featureKeys":[…],"weights":{"<key>":<số>},"explanation" }\`.** ⛔ \`featureKeys\` **PHẢI** chọn từ danh sách "Feature L1 CÓ SẴN" ở §③ — **ĐỪNG bịa key mới** (bịa key không tồn tại → L2 đọc RỖNG, không đóng góp gì). Cần feature chưa có → build ở L1 trước. Hệ có nút **Import JSON**. ⛔ KHÔNG trả JSON module L4/L5.`;
  return `${L}\n> **OUTPUT tầng L6 = MỘT khối \`\`\`json\`\`\` ZONE: \`{ "name","explain","anchor","anchorRef?","role","offsetAtr","widthAtr","explanation" }\`.** \`anchor\` ∈ {swing_high/swing_low/poc/evidence/l5_state/price}; \`role\` ∈ {OBSERVE/RISK/DEMAND/INVALIDATE}; \`anchorRef\` = id evidence/L5 khi anchor=evidence/l5_state. Hệ có nút **Import JSON**. ⛔ KHÔNG vào lệnh, KHÔNG trả JSON module L4/L5.`;
}

/** Pack cho MỘT tầng — OUTPUT-LOCK trước + section của tầng (chuỗi con literal của master) + schema nếu executable. */
export function buildLayerPack(layer: PackLayer): string {
  const m = LAYER_META[layer];
  const head = `# MFE Context Pack — ${m.title}\n\n${outputLock(layer)}\n\nBạn (AI) giúp một trader biến MỘT ý tưởng ở **${m.title}** thành module hệ MFE. Chỉ dùng nguyên-liệu của tầng này.\n${CHAIN}\n\n${RULES}\n\n## ③ Nguyên-liệu tầng này\n${layerSection(layer)}`;
  if (layer === "L5" || layer === "L4" || layer === "CONDITIONS") {
    const shots = FEW_SHOT_PRESETS.filter((p) => (layer === "L4" ? p.module.level === 4 : layer === "L5" ? p.module.level === 5 : true)).map((p) => `\`\`\`json\n${JSON.stringify(p.module, null, 2)}\n\`\`\``).join("\n\n");
    return `${head}\n\n## ④ ${conditionSchema(layer === "L4" ? "L4" : layer === "L5" ? "L5" : undefined)}\n\n### Ví dụ hợp lệ\n${shots}`;
  }
  if (layer === "L3") return `${head}\n\n## ④ Import (dán JSON vào nút Import)\nHệ dùng \`validateAst\` (KHÔNG validateModule): whitelist op · arity · input hợp lệ · macro đã khai · không cycle. \`ast\` được LỒNG NHAU \`{op,args}\` — hệ tự làm phẳng.\n\n### Ví dụ hợp lệ\n\`\`\`json\n${JSON.stringify(L3_EXAMPLE, null, 2)}\n\`\`\``;
  if (layer === "L1") return `${head}\n\n## ④ Import (dán JSON vào nút Import)\nHệ dùng \`validateGraph\`: đúng \`blockId\` · đúng kiểu port · node \`output\` phải \`emit_feature\`. Port STREAM_OHLC KHÔNG tính vào \`inputs\`.\n\n### Ví dụ hợp lệ\n\`\`\`json\n${JSON.stringify(L1_EXAMPLE, null, 2)}\n\`\`\``;
  if (layer === "L2") return `${head}\n\n## ④ Import (dán JSON vào nút Import)\nHệ kiểm \`kind\` hợp lệ · \`featureKeys\` ≥1 · mỗi key có \`weights\`. Key lạ → cảnh báo (L2 đọc rỗng tới khi bạn build/promote feature đó).\n\n### Ví dụ hợp lệ\n\`\`\`json\n${JSON.stringify(L2_EXAMPLE, null, 2)}\n\`\`\``;
  return `${head}\n\n## ④ Import (dán JSON vào nút Import)\nHệ kiểm anchor/role hợp-lệ + widthAtr>0; anchor evidence/l5_state cần anchorRef đã build. Zone chỉ VẼ, không vào lệnh.\n\n### Ví dụ hợp lệ\n\`\`\`json\n${JSON.stringify(L6_EXAMPLE, null, 2)}\n\`\`\``;
}

function metricList(): string {
  const base = "| key | nhãn | scope | ý nghĩa |\n|---|---|---|---|\n" + METRICS.map((x) => `| \`${x.key}\` | ${x.label} | ${x.scope} | ${x.hint} |`).join("\n") + `\n\nToán tử: \`${OPS.join("` `")}\`.`;
  const ev = listCustomMetrics();
  // [[block-is-fixed-foundation-doctrine]] metric BLOCK-NATIVE: dùng id module L1/L2/L3 đã build làm metric → decision đọc bằng chứng riêng
  const evBlock = ev.length
    ? `\n\n**Metric BLOCK-NATIVE — module evidence BẠN ĐÃ BUILD** (dùng \`id\` này làm \`metric\` để TRIGGER/GATE/VETO đọc bằng chứng L1/L2/L3, đồng hạng 29 metric trên):\n` + ev.map((m) => `- \`${m.key}\` — ${m.label} (${m.layer})`).join("\n")
    : `\n\n(Chưa có module evidence L1/L2/L3 nào được build → chỉ có 29 metric built-in. Muốn quyết định đọc bằng-chứng RIÊNG của bạn, build L1/L2/L3 trước rồi tham chiếu bằng id của nó.)`;
  const triggerRule = `\n\n⚠ **BẮT BUỘC để evidence có tác dụng**: L1/L2/L3 CHỈ là bằng chứng — **chúng KHÔNG tự vào lệnh**. Một chiến-lược hoàn-chỉnh PHẢI có **≥1 module role=\`TRIGGER\`** đọc bằng chứng (qua \`metric = id\` của L1/L2/L3, hoặc metric built-in). Chỉ có GATE/CONFIRM mà KHÔNG có TRIGGER → engine dùng trigger mặc định, module của bạn **đóng góp 0** (đây là lỗi hay gặp).`;
  return base + evBlock + triggerRule;
}

// ── MASTER prompt (mặc định, TỰ CHỨA mọi tầng): user tả ý tưởng TỔNG QUÁT (mơ hồ được). AI hỏi-đáp làm rõ, tự
// phân rã setup/confirm/veto/exit qua các tầng (mỗi tầng authority riêng — nhúng NGUYÊN section bên dưới), rồi trả
// MỘT module chạy được + explanation nguyên-văn. per-tầng = layerSection(L) ⊂ master (kiểm bằng includes). ──
export function buildMasterPrompt(userIdea = ""): string {
  const idea = userIdea.trim() ? `\n## Ý TƯỞNG CỦA NGƯỜI DÙNG (tổng quát — có thể mơ hồ, bạn phải hiểu và làm rõ)\n> ${userIdea.trim().replace(/\n/g, "\n> ")}\n` : "";
  const sections = (["L1", "L2", "L3", "L4", "L5", "L6"] as PackLayer[]).map((L) => layerSection(L)).join("\n\n");
  return `# MFE — Biến ý tưởng của trader thành MỘT module chạy được

> ⚡ **BẠN LÀ trợ-lý XÂY MODULE của hệ MFE — KHÔNG phải người review tài-liệu.** Văn-bản này KHÔNG phải "một file" để bạn hỏi "muốn xử-lý theo hướng nào / rà lỗi / viết lại prompt". Nhiệm-vụ DUY NHẤT của bạn: biến **ý-tưởng của người dùng** (ngay dưới) thành MỘT module. Bạn CHỈ được làm 1 trong 2 việc:
> **(a)** nếu ý-tưởng chưa đủ rõ → **HỎI 2-4 câu** làm rõ (khung TF? vào khi nào? thoát? tránh gì?), rồi chờ trả lời;
> **(b)** nếu đã đủ rõ → trả về **ĐÚNG MỘT khối \`\`\`json … \`\`\`** theo schema cuối (không văn-bản ngoài khối).
> TUYỆT ĐỐI KHÔNG: tóm-tắt/đánh-giá tài-liệu · hỏi "bạn muốn tôi làm gì với file này" · trả nhiều phương-án.
${idea}
Người dùng mô tả một ý tưởng giao dịch **tổng quát** và thường KHÔNG quan tâm hệ chia tầng thế nào. Việc của **BẠN (AI)**:
1. **Hiểu** ý tưởng; nếu **mơ hồ**, HỎI-ĐÁP làm rõ (khung thời gian? vào khi nào? thoát khi nào? tránh gì?) trước khi xây.
2. **Tự phân rã** ý tưởng thành các mảnh **setup → confirm → veto → exit** rồi map vào tầng đúng (mỗi tầng có AUTHORITY riêng — mọi section nhúng bên dưới).
3. Trả về **MỘT** module điều-kiện chạy được (JSON schema cuối), dùng CHỈ 29 metric; hoặc công thức L3 (AST) nếu ý tưởng là một chỉ-số.
4. Kèm trường **\`explanation\`**: giải thích tiếng Việt ĐỜI THƯỜNG — module LÀM GÌ, khi nào bật, vì sao hợp ý người dùng. Hệ hiển thị NGUYÊN VĂN lời bạn (không sửa) + tự thêm disclaimer riêng.

🔗 **Dây chuyền tầng** (để map ý tưởng vào đúng tầng) — ${CHAIN}

${ASK_AND_OUTPUT}

${RULES}

## Catalog mọi tầng (tự chứa — bạn không cần hỏi thêm tài liệu)
${sections}

${METRIC_HINTS}

${CONDITION_SCHEMA.replace('## SCHEMA JSON', '## SCHEMA JSON (module L4/L5 — thêm trường "explanation")').replace('"lockR": 0.5 }', '"lockR": 0.5, "explanation": "giải thích đời thường module này làm gì" }')}

## Ví dụ module
${FEW_SHOT_PRESETS.map((p) => `\`\`\`json\n${JSON.stringify({ ...p.module, explanation: "…(một câu đời thường)" }, null, 2)}\n\`\`\``).join("\n")}

## GHI NHỚ
Module hợp-lệ + bắn đúng ý ≠ có lời. Người dùng tự chạy Microscope full-decade để biết số thật.`;
}
/** alias giữ tương thích — buildIdeaPack === buildMasterPrompt (master tự chứa). */
export const buildIdeaPack = buildMasterPrompt;

// ── ORCHESTRATOR (điều phối): master GỌN — user tả chiến lược, AI phân rã rồi TỰ XIN prompt từng tầng để hoàn
// thiện sản phẩm nhiều tầng. Khác master tự-chứa (một phát): đây tiết-kiệm context, AI làm từng tầng một. ──
export function buildOrchestratorPrompt(userIdea = ""): string {
  const idea = userIdea.trim() ? `\n## Ý TƯỞNG CHIẾN-LƯỢC CỦA NGƯỜI DÙNG\n> ${userIdea.trim().replace(/\n/g, "\n> ")}\n` : "";
  const authRows = (["L1", "L2", "L3", "L4", "L5", "L6"] as PackLayer[]).map((L) => `| ${L} | ${LAYER_META[L].output} | ${LAYER_META[L].authority.split("—")[0].trim()} |`).join("\n");
  return `# MFE — Điều-phối xây chiến-lược nhiều tầng

> ⚡ **BẠN LÀ trợ-lý xây chiến-lược MFE — KHÔNG review tài-liệu, KHÔNG hỏi "làm gì với file này".** Nhiệm-vụ: biến ý-tưởng dưới thành sản-phẩm, LÀM TỪNG TẦNG MỘT.
${idea}
Một chiến-lược hoàn-chỉnh thường cần NHIỀU tầng. Việc của bạn — theo THỨ TỰ:
1. **Hiểu** ý-tưởng; nếu mơ-hồ → **HỎI 2-4 câu** làm rõ (TF? vào? thoát? tránh gì?), chờ trả lời.
2. **Phân rã** thành setup → confirm → veto → exit; xác-định CẦN những tầng nào (không phải ý-tưởng nào cũng cần đủ 6 tầng — nhiều ý-tưởng chỉ cần MỘT module L5 hoặc L4).
3. Với **MỖI tầng cần**, viết đúng một dòng: **"▶ Cho tôi PROMPT tầng L\<n\>"** rồi DỪNG chờ — người dùng sẽ dán pack tầng đó (kèm block + authority + OUTPUT format của tầng). Xây phần tầng đó ĐÚNG format tầng, rồi mới xin tầng kế.
4. **Nhắc người dùng**: phần **L3/L4/L5** dán JSON vào hệ là chạy được; phần **L1/L2/L6** ráp trong màn Sandbox trực-quan (không import JSON).

## Bản đồ tầng (tóm tắt — chi-tiết bạn XIN từng pack ở bước 3)
| tầng | output | quyền |
|---|---|---|
${authRows}

## ${CHAIN}

## LƯU Ý
- Mỗi pack tầng khi nhận có OUTPUT-LOCK riêng — trả đúng format tầng đó, KHÔNG lẫn (vd pack L1 → liệt-kê block, KHÔNG trả JSON L5).
- Module hợp-lệ + bắn đúng ý ≠ có lời. Người dùng tự chạy Microscope để biết số thật.`;
}

const LAYER_OF = (lvl: Level): PackLayer => (lvl === 0 ? "CONDITIONS" : (["L1", "L2", "L3", "L4", "L5", "L6"][lvl - 1] as PackLayer));

// 5 mục popup (đúng format hệ đã dùng). AUTHORITY + VỊ-TRÍ derive từ level/role của TA (không tin AI tự khai);
// LÀM-GÌ + CƠ-CHẾ lấy lời AI (nếu có) hoặc module.explain. Đây là nội dung "popup" user thấy ngay sau import.
export interface ExplainSections { whatItDoes: string; mechanism: string; position: string; authority: string; limits: string }
export function explainSections(m: Partial<CustomModule>, aiExplanation?: string): ExplainSections {
  const lvl = (m.level ?? 5) as Level; const meta = LAYER_META[LAYER_OF(lvl)];
  const roleAct = m.role === "TRIGGER" ? `vote ${m.direction || "?"}` : m.role === "VETO" || m.role === "SAFETY_VETO" ? "BỎ lệnh" : m.role === "CONTEXT_GATE" ? "CHỈ cho vào lệnh" : m.role === "CONFIRM" ? "tăng trọng-số vote (không tự tạo tín-hiệu)" : m.role === "EXIT" ? (m.exitAction || "đóng lệnh") : "advisory";
  return {
    whatItDoes: aiExplanation || m.explain || "—",
    mechanism: `Nhận: 29 metric tại nến hiện-tại → kiểm điều-kiện (${describeModuleAsBlocks(m).replace(/^Ghép từ block: /, "").replace(/ \(Bạn đã sửa.*$/, "")}) → xuất: ${roleAct}.`,
    position: `${meta.title} — ${meta.place}. Kết-quả chảy theo dây-chuyền L1→L2→L3→L4→L5→L6.`,
    authority: meta.authority,   // ← từ type-system của HỆ, không phải AI khai (chống vượt quyền)
    limits: `${m.why || "—"} · trạng-thái SHADOW (chưa tin cho tới khi qua calibration + walk-forward). Hợp-lệ ≠ có lời — chạy Microscope mới có số thật.`,
  };
}

const mLabelPack = (k: string) => METRICS.find((x) => x.key === k)?.label || k;
/** Giải thích module theo kiểu GHÉP BLOCK (khi user tự sửa — không có lời AI). Đọc được cho người mới. */
export function describeModuleAsBlocks(m: Partial<CustomModule>): string {
  const conds = (m.conditions || []).map((c) => {
    const rhs = c.op === "between" || c.op === "outside" ? `${c.value}…${c.value2 ?? "?"}` : String(c.value);
    return `【${mLabelPack(c.metric)}】 ${c.op} 【${rhs}】`;
  });
  if (!conds.length) return "Chưa có block điều-kiện nào.";
  const glue = m.logic === "ANY" ? " HOẶC " : " VÀ ";
  const roleAct = m.role === "TRIGGER" ? `→ vote ${m.direction || "?"}` : m.role === "VETO" || m.role === "SAFETY_VETO" ? "→ BỎ lệnh" : m.role === "CONTEXT_GATE" ? "→ CHỈ cho vào lệnh" : m.role === "CONFIRM" ? "→ tăng trọng-số vote" : m.role === "EXIT" ? `→ ${m.exitAction || "đóng lệnh"}` : "→ (advisory)";
  return `Ghép từ block: ${conds.join(glue)} ${roleAct}. (Bạn đã sửa tay — giải thích theo block, không phải lời AI.)`;
}

/** Pack "toàn cảnh" điều-kiện chạy được (L0/L4/L5) — module IMPORT + PREVIEW round-trip. */
export function buildContextPack(): string {
  const levelRows = Object.values(LEVEL_TEMPLATES).map((t) => `| ${t.level} | ${t.roles.join(", ")} | ${t.title} | ${t.executable ? "chạy thật" : "advisory"} |`).join("\n");
  const shots = FEW_SHOT_PRESETS.map((p) => `#### ${p.name}\n\`\`\`json\n${JSON.stringify(p.module, null, 2)}\n\`\`\``).join("\n\n");
  const cm = LAYER_META.CONDITIONS;
  return `# MFE Module Context Pack — Điều-kiện chạy được (L0/L4/L5)

Bạn (AI) giúp trader biến ý tưởng thành **module điều-kiện** hệ chạy được. KHÔNG code tự do — điền spec đọc từ
danh mục metric CỐ ĐỊNH. Trả **đúng một JSON** theo schema cuối.

## ① Authority
${cm.authority}
## ② Output type
${cm.output}
## ⑤ Vị trí & dây chuyền
${cm.place}
${CHAIN}

${RULES}

## Metric catalog (${METRICS.length} metric — chỉ dùng các key này)
${metricList()}

## Level & Role
| level | roles | vai | |
|---|---|---|---|
${levelRows}

## Ví dụ (few-shot)
${shots}

${CONDITION_SCHEMA}

## GHI NHỚ CUỐI
**Module hợp-lệ ≠ có edge.** Hệ chỉ kiểm module đúng khuôn + bắn đúng ý trên nến thật (Intent Sandbox). Muốn biết
có LỜI không, trader phải tự chạy backtest full-decade trong **Microscope** — không AI nào hứa thay được.`;
}

const ALLOWED_TOP = new Set(["level", "role", "name", "explain", "why", "conditions", "logic", "direction", "weight", "reliability", "exitAction", "lockR", "zoneRole", "zoneOffsetAtr"]);
const ALLOWED_COND = new Set(["metric", "op", "value", "value2"]);

export interface ParseResult { ok: boolean; module?: CustomModule; errors: string[]; strippedFields: string[]; aiExplanation?: string }

/** Parse JSON AI trả về → module đã validate. CHỈ nhận field trong schema (order/lot/risk bị BỎ, không leak). */
export function parseAiModule(json: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["JSON sai cú pháp: " + (e as Error).message], strippedFields: [] }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Phải là một object JSON."], strippedFields: [] };
  const src = raw as Record<string, unknown>;
  // trích lời GIẢI THÍCH của AI (đời thường) — hiển thị cho user hiểu ngay module làm gì; không phải field module
  const aiExplanation = typeof src.explanation === "string" ? src.explanation.trim() : typeof src.ai_explanation === "string" ? (src.ai_explanation as string).trim() : undefined;
  const stripped = Object.keys(src).filter((k) => !ALLOWED_TOP.has(k) && k !== "explanation" && k !== "ai_explanation");   // order_send/lot/risk_pct… → bỏ, ghi lại
  const clean: Record<string, unknown> = {};
  for (const k of ALLOWED_TOP) if (k in src) clean[k] = src[k];
  if (Array.isArray(clean.conditions)) clean.conditions = (clean.conditions as Record<string, unknown>[]).map((c) => {
    const cc: Record<string, unknown> = {}; if (c && typeof c === "object") for (const k of ALLOWED_COND) if (k in c) cc[k] = c[k]; return cc;
  });
  const draft: Partial<CustomModule> = {
    level: clean.level as Level, role: clean.role as Role, name: clean.name as string,
    explain: clean.explain as string, why: clean.why as string,
    conditions: (clean.conditions as CustomModule["conditions"]) || [], logic: (clean.logic as "ALL" | "ANY") || "ALL",
    direction: clean.direction as CustomModule["direction"], weight: clean.weight as number, reliability: clean.reliability as number,
    exitAction: clean.exitAction as CustomModule["exitAction"], lockR: clean.lockR as number,
    zoneRole: clean.zoneRole as CustomModule["zoneRole"], zoneOffsetAtr: clean.zoneOffsetAtr as number,
  };
  const v = validateModule(draft, customMetricKeys());   // CỬA CHẶN đã có — cho phép thêm metric = id module evidence đã build (block-native)
  if (!v.ok) return { ok: false, errors: v.errors, strippedFields: stripped, aiExplanation };
  const module: CustomModule = { ...(draft as CustomModule), id: "cm_ai_" + Date.now(), status: "SHADOW", createdAt: new Date().toISOString() };
  return { ok: true, module, errors: [], strippedFields: stripped, aiExplanation };
}

// ── L3 NGOẠI LỆ: parse công thức (AST) → validateAst (KHÔNG validateModule). Op ngoài whitelist / input ma → reject.
export interface FormulaParseResult { ok: boolean; ast?: QuantFormulaAst; outputType?: string; errors: string[]; aiExplanation?: string; opsUsed?: string[] }
export function parseAiFormula(json: string, extraInputs: string[] = []): FormulaParseResult {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["JSON sai cú pháp: " + (e as Error).message] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Phải là object JSON."] };
  const src = raw as Record<string, unknown>;
  const aiExplanation = typeof src.explanation === "string" ? src.explanation.trim() : undefined;
  const ast = src.ast as QuantFormulaAst | undefined;
  if (!ast || typeof ast !== "object") return { ok: false, errors: ["Thiếu 'ast' (cần cây { op, args } hoặc { rootNodeId, nodes })."], aiExplanation };
  // AI thường trả cây LỒNG NHAU { op, args } — hệ cần dạng PHẲNG { rootNodeId, nodes }. Tự chuyển nếu là nested.
  const flat = (ast as { nodes?: unknown }).nodes ? (ast as QuantFormulaAst) : nestedAstToFlat(ast as unknown as NestedAstNode, typeof src.name === "string" ? src.name : "AI L3");
  if (!flat || !flat.nodes || !flat.rootNodeId) return { ok: false, errors: ["Thiếu 'ast' (cần cây { op, args } hoặc { rootNodeId, nodes })."], aiExplanation };
  const macroIds = Object.keys(SEED_MACROS);
  const val = validateAst(flat, [...KNOWN_L3_INPUTS, ...extraInputs], macroIds);   // ← cửa chặn RIÊNG của L3 (+ feature L1/L2 đã build)
  if (!val.ok) return { ok: false, ast: flat, errors: val.errors, aiExplanation, opsUsed: val.report.opsUsed };
  return { ok: true, ast: flat, outputType: typeof src.outputType === "string" ? src.outputType : "SCORE", errors: [], aiExplanation, opsUsed: val.report.opsUsed };
}

// ── converter cây LỒNG NHAU (AI trả) → AST PHẲNG ĐẦY-ĐỦ (validateAst + kho L3 cần). Dùng mk* nên node có `safety`
// đúng. CONST/INPUT/MACRO_REF xử lý riêng; MACRO_REF trỏ tên feature L1/L2 (KHÔNG phải seed-macro) → coi là INPUT
// (tham chiếu evidence-series). Op ngoài whitelist → giữ nguyên op để validateAst báo lỗi tử tế (không throw). ──
interface NestedAstNode { op?: string; args?: (NestedAstNode | number | string)[]; params?: QuantAstNode["params"]; value?: number; inputRef?: string }
const WINDOWED_MACROS = new Set(["zscore", "minmax_norm"]);   // khớp quantFormulaParser: macro có tham số cửa-sổ ở đuôi
const FOLD_OPS = new Set(["ADD", "SUB", "MUL", "DIV", "MIN", "MAX", "AND", "OR"]);   // op kết-hợp: AI viết n-ary → gộp trái về nhị-phân
// AI hay viết theo QUY ƯỚC PHỔ QUÁT: op ăn tham số bằng HẰNG-SỐ ĐUÔI — clip(x,lo,hi) · mean(x,W) · lag(x,k) ·
// quantile(x,q,W). Nhưng hệ để lo/hi/W là PARAMS (arity 1), không phải con. Chuyển đúng như parser văn-bản làm →
// import không còn "CLIP cần 1 con, có 3". (Nguồn quy ước: quantFormulaParser.ts)
function nestedAstToFlat(root: NestedAstNode, name = "AI L3"): QuantFormulaAst | null {
  if (!root || typeof root !== "object" || !root.op) return null;
  const nodes: Record<string, QuantAstNode> = {}; const macroSet = new Set(Object.keys(SEED_MACROS));
  const put = (nd: QuantAstNode): string => { nodes[nd.nodeId] = nd; return nd.nodeId; };
  const lit = (a: NestedAstNode | number | string | undefined): number | null => {   // hằng-số (raw number hoặc node CONST) → số
    if (typeof a === "number") return a;
    if (a && typeof a === "object" && a.op === "CONST") { const v = Number(a.args?.[0] ?? a.value); return Number.isFinite(v) ? v : null; }
    return null;
  };
  const windowed1 = (op: string) => !!(OP_SPEC as Record<string, { windowed?: boolean }>)[op]?.windowed && op !== "QUANTILE" && op !== "WINSOR";
  const walk = (n: NestedAstNode | number | string): string => {
    if (typeof n === "number") return put(mkConst(n));
    if (typeof n === "string") return put(mkInput(n));
    const op = n.op || ""; const a = n.args ?? [];
    if (op === "CONST") return put(mkConst(Number(a[0] ?? n.value ?? 0)));
    if (op === "INPUT") return put(mkInput(String(a[0] ?? n.inputRef ?? "")));
    if (op === "MACRO_REF") {
      const macroName = String(a[0] ?? "");
      if (!macroSet.has(macroName)) return put(mkInput(macroName));   // tên KHÔNG phải macro → coi là INPUT (feature L1/L2 ref) — giữ hành vi cũ
      let rest = a.slice(1); let window: number | undefined;
      if (WINDOWED_MACROS.has(macroName) && rest.length) { const w = lit(rest[rest.length - 1]); if (w != null) { window = w; rest = rest.slice(0, -1); } }
      return put(mkOp("MACRO_REF", rest.map(walk), window != null ? { macroId: macroName, window } : { macroId: macroName }));
    }
    // hằng-số đuôi → params (mirror parser): CLIP(x,lo,hi) · QUANTILE/WINSOR(x,q,W) · <windowed>(x,W) · LAG/DELTA(x,k)
    if (op === "CLIP" && a.length === 3) { const lo = lit(a[1]), hi = lit(a[2]); if (lo != null && hi != null) return put(mkOp("CLIP", [walk(a[0])], { min: lo, max: hi })); }
    if ((op === "QUANTILE" || op === "WINSOR") && a.length === 3) { const q = lit(a[1]), w = lit(a[2]); if (q != null && w != null) return put(mkOp(op, [walk(a[0])], { q, window: w })); }
    if ((op === "LAG" || op === "DELTA") && a.length === 2) { const k = lit(a[1]); if (k != null) return put(mkOp(op, [walk(a[0])], { lag: k })); }
    if (windowed1(op) && a.length === 2) { const w = lit(a[1]); if (w != null) return put(mkOp(op as QuantOp, [walk(a[0])], { window: w })); }
    // op KẾT-HỢP viết n-ary (AI hay làm: MUL(a,b,c)·ADD(a,b,c,d)·MAX(a,b,c)) → GỘP TRÁI về nhị-phân (arity 2). Fix "MUL cần 2 con, có 3".
    if (FOLD_OPS.has(op) && a.length > 2) { let acc = walk(a[0]); for (let k = 1; k < a.length; k++) acc = put(mkOp(op as QuantOp, [acc, walk(a[k])])); return acc; }
    const children = a.map((x) => walk(x));
    if (!(op in OP_SPEC)) { const id = nid("op"); return put({ nodeId: id, kind: "POINT_OP", op: op as QuantOp, children, params: n.params, safety: { causalOnly: true } }); }
    return put(mkOp(op as QuantOp, children, n.params));
  };
  const rootId = walk(root);
  return { formulaId: "f" + Date.now().toString(36), name, version: "1", rootNodeId: rootId, nodes, inputs: [], outputType: "SCORE", authority: QUANT_AUTHORITY, status: "DRAFT" };
}

// ═══════════════════ IMPORT-NGƯỢC ĐA-TẦNG: parse → validate (cửa RIÊNG tầng) → LƯU về đúng kho ═══════════════════
// Vòng khép ĐẦY-ĐỦ cho MỌI tầng (không chỉ L4/L5). "Ra module" = validate PASS + LƯU (SHADOW) vào store của tầng.
// KHÔNG nới quyền: L1→validateGraph · L2→featureKeys/weights · L3→validateAst · L4/L5→validateModule. Hợp-lệ ≠ edge.

export interface ImportResult { ok: boolean; layer?: PackLayer; id?: string; name?: string; errors: string[]; warnings?: string[]; aiExplanation?: string; strippedFields?: string[] }
const L2_KINDS = new Set<L2Kind>(["indicator", "regime", "bias", "confidence", "overlay"]);

// tập KEY feature L1 hợp lệ để L2 tham chiếu = built-in pool + MỌI customL1 theo ID (l1Series resolve theo id, mọi
// status). KHÔNG nhận theo TÊN — l1Series chỉ resolve theo id/built-in-key, nhận tên sẽ đọc-rỗng-thầm-lặng (tệ hơn cảnh báo).
function knownFeatureKeys(): Set<string> {
  const s = new Set<string>(L1_PICKABLE.map((f) => f.key));
  for (const m of loadCustomL1()) s.add(m.id);
  return s;
}
// input hợp lệ cho L3 = KNOWN_L3_INPUTS + mọi feature L1/L2 đã build (theo id VÀ tên, vì AI hay gọi theo tên người).
function knownL3Inputs(): string[] {
  const extra = [...L1_PICKABLE.map((f) => f.key)];
  for (const m of loadCustomL1()) { extra.push(m.id); extra.push(m.name); }
  for (const m of loadCustomL2()) { extra.push(m.id); extra.push(m.name); }
  return extra;
}

// L1 — FeatureGraph. AI trả { name, explain, why, graph:{ nodes:[{id,blockId,params?,inputs}], output }, explanation }.
export function parseAiFeature(json: string): { ok: boolean; module?: CustomL1Module; errors: string[]; warnings: string[]; aiExplanation?: string } {
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["JSON sai cú pháp: " + (e as Error).message], warnings: [] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Phải là object JSON."], warnings: [] };
  const s = raw as Record<string, unknown>;
  const aiExplanation = typeof s.explanation === "string" ? s.explanation.trim() : undefined;
  const g = s.graph as Partial<FeatureGraph> | undefined;
  if (!g || !Array.isArray(g.nodes) || typeof g.output !== "string") return { ok: false, errors: ["Thiếu 'graph' (cần { nodes:[…], output })."], warnings: [], aiExplanation };
  const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : "AI L1 feature";
  const explain = typeof s.explain === "string" ? s.explain : "";
  const why = typeof s.why === "string" ? s.why : "";
  const graph: FeatureGraph = { id: "l1g_" + Date.now().toString(36), name, description: explain || undefined, nodes: g.nodes as FeatureGraph["nodes"], output: g.output };
  const v = validateL1Draft({ name, explain, why, graph });   // ← cửa RIÊNG L1: type-check port + emit-feature + explainability
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, aiExplanation };
  const module: CustomL1Module = { id: "l1_" + Date.now().toString(36), name, explain, why, graph, status: "SHADOW", createdAt: new Date().toISOString() };
  return { ok: true, module, errors: [], warnings: v.warnings, aiExplanation };
}

// L2 — weighted-sum indicator. AI trả { name, explain, kind, featureKeys:[…], weights:{key:w}, explanation }.
export function parseAiIndicator(json: string): { ok: boolean; module?: CustomL2Module; errors: string[]; warnings: string[]; aiExplanation?: string } {
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["JSON sai cú pháp: " + (e as Error).message], warnings: [] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Phải là object JSON."], warnings: [] };
  const s = raw as Record<string, unknown>;
  const aiExplanation = typeof s.explanation === "string" ? s.explanation.trim() : undefined;
  const errors: string[] = []; const warnings: string[] = [];
  const kind = (typeof s.kind === "string" ? s.kind : "indicator") as L2Kind;
  if (!L2_KINDS.has(kind)) errors.push("kind lạ '" + kind + "' — chỉ: indicator/regime/bias/confidence/overlay");
  const featureKeys = Array.isArray(s.featureKeys) ? s.featureKeys.filter((k): k is string => typeof k === "string") : [];
  if (featureKeys.length < 1) errors.push("featureKeys phải là mảng ≥1 key feature L1");
  const weightsRaw = (s.weights && typeof s.weights === "object") ? s.weights as Record<string, unknown> : {};
  const weights: Record<string, number> = {};
  for (const k of featureKeys) { const w = Number(weightsRaw[k]); if (!isFinite(w)) errors.push("thiếu weights['" + k + "'] (số)"); else weights[k] = w; }
  const pool = knownFeatureKeys();
  for (const k of featureKeys) if (!pool.has(k)) warnings.push("feature '" + k + "' chưa có trong pool L1 (built-in / customL1 đã promote) — L2 sẽ đọc rỗng cho tới khi bạn build/promote nó");
  const explain = typeof s.explain === "string" ? s.explain : "";
  if (explain.trim().length < 8) errors.push("explain cần ≥8 ký tự (cổng kiểm soát)");
  if (errors.length) return { ok: false, errors, warnings, aiExplanation };
  const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : "AI L2 indicator";
  const module: CustomL2Module = { id: "l2_" + Date.now().toString(36), name, explain, kind, featureKeys, weights, status: "SHADOW", createdAt: new Date().toISOString() };
  return { ok: true, module, errors: [], warnings, aiExplanation };
}

// L6 — ZONE. AI trả { name, explain, anchor, anchorRef?, role, offsetAtr, widthAtr, explanation }.
export function parseAiZone(json: string): { ok: boolean; zone?: CustomL6Zone; errors: string[]; warnings: string[]; aiExplanation?: string } {
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["JSON sai cú pháp: " + (e as Error).message], warnings: [] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Phải là object JSON."], warnings: [] };
  const s = raw as Record<string, unknown>;
  const aiExplanation = typeof s.explanation === "string" ? s.explanation.trim() : undefined;
  const draft: Partial<CustomL6Zone> = {
    name: typeof s.name === "string" ? s.name : "", explain: typeof s.explain === "string" ? s.explain : (aiExplanation ?? ""),
    anchor: (typeof s.anchor === "string" && ZONE_ANCHORS.includes(s.anchor as ZoneAnchor) ? s.anchor : undefined) as ZoneAnchor | undefined,
    anchorRef: typeof s.anchorRef === "string" ? s.anchorRef : undefined,
    role: (typeof s.role === "string" && ZONE_ROLES.includes(s.role as ZoneRole) ? s.role : undefined) as ZoneRole | undefined,
    offsetAtr: typeof s.offsetAtr === "number" ? s.offsetAtr : 0,
    widthAtr: typeof s.widthAtr === "number" ? s.widthAtr : NaN,
  };
  const v = validateL6Zone(draft);   // cửa RIÊNG L6
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings, aiExplanation };
  const zone: CustomL6Zone = { id: "l6_" + Date.now().toString(36), name: draft.name!.trim(), explain: draft.explain!.trim(), anchor: draft.anchor!, anchorRef: draft.anchorRef, role: draft.role!, offsetAtr: draft.offsetAtr!, widthAtr: draft.widthAtr!, status: "SHADOW", createdAt: new Date().toISOString() };
  return { ok: true, zone, errors: [], warnings: v.warnings, aiExplanation };
}

// build CustomL3Module ĐẦY-ĐỦ từ AST đã validate (dùng cho import + cho importAnyLayer).
function buildL3Module(ast: QuantFormulaAst, name: string, outputType: QuantOutputType, providedText?: string): CustomL3Module {
  let formulaText = providedText || "";
  if (!formulaText) { try { formulaText = astToText(ast, (k) => k, SEED_MACROS as never); } catch { formulaText = ""; } }
  const now = new Date().toISOString();
  const inputRefs = Object.values(ast.nodes).filter((n) => n.kind === "INPUT" && n.inputRef).map((n) => n.inputRef!) as string[];
  return {
    id: "l3_" + Date.now().toString(36), name, layer: "L3", moduleType: "QUANT_FORMULA_AST", formulaText, ast, astHash: astHash(ast), version: "1",
    inputSources: [...new Set(inputRefs)].map((k) => ({ key: k, sourceLayer: "L1" as const, sourceId: k, timeframe: "H1", asOfPolicy: "CLOSED_ONLY" as const })),
    outputType, status: "SHADOW", authority: L3_AUTHORITY,
    safety: { parsePass: true, finiteOutput: true, kidiSafe: true, noLookahead: true, causalSafe: true, authorityLocked: true },
    validation: { structuralStatus: "PASS", oosStatus: "NOT_RUN", walkForwardStatus: "NOT_RUN", monteCarloStatus: "NOT_RUN", eraStabilityStatus: "NOT_RUN" },
    createdAt: now, updatedAt: now,
  };
}

// ── DISPATCHER: tự nhận tầng theo HÌNH DẠNG JSON → parser đúng → nếu PASS thì LƯU vào store của tầng (SHADOW). ──
// Ưu tiên nhận: ast→L3 · graph→L1 · featureKeys→L2 · còn lại (conditions/level/role)→L4·L5. Không đoán được → lỗi rõ.
export function importAnyLayer(json: string): ImportResult {
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["JSON sai cú pháp: " + (e as Error).message] }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Phải là một object JSON của MỘT module."] };
  const s = raw as Record<string, unknown>;

  if ("ast" in s) {   // L3 — công thức
    const r = parseAiFormula(json, knownL3Inputs());
    if (!r.ok || !r.ast) return { ok: false, layer: "L3", errors: r.errors, aiExplanation: r.aiExplanation };
    const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : "AI L3 formula";
    const m = buildL3Module(r.ast, name, (r.outputType as QuantOutputType) || "SCORE", typeof s.formula === "string" ? s.formula : undefined);
    upsertCustomL3(m);
    return { ok: true, layer: "L3", id: m.id, name, errors: [], aiExplanation: r.aiExplanation };
  }
  if ("graph" in s) {   // L1 — FeatureGraph
    const r = parseAiFeature(json);
    if (!r.ok || !r.module) return { ok: false, layer: "L1", errors: r.errors, warnings: r.warnings, aiExplanation: r.aiExplanation };
    saveCustomL1([r.module, ...loadCustomL1()]);
    return { ok: true, layer: "L1", id: r.module.id, name: r.module.name, errors: [], warnings: r.warnings, aiExplanation: r.aiExplanation };
  }
  if ("featureKeys" in s || "weights" in s) {   // L2 — weighted-sum indicator
    const r = parseAiIndicator(json);
    if (!r.ok || !r.module) return { ok: false, layer: "L2", errors: r.errors, warnings: r.warnings, aiExplanation: r.aiExplanation };
    saveCustomL2([r.module, ...loadCustomL2()]);
    return { ok: true, layer: "L2", id: r.module.id, name: r.module.name, errors: [], warnings: r.warnings, aiExplanation: r.aiExplanation };
  }
  if ("anchor" in s) {   // L6 — ZONE (kiểm TRƯỚC 'role' vì zone cũng có role=ZONE)
    const r = parseAiZone(json);
    if (!r.ok || !r.zone) return { ok: false, layer: "L6", errors: r.errors, warnings: r.warnings, aiExplanation: r.aiExplanation };
    saveCustomL6([r.zone, ...loadCustomL6()]);
    return { ok: true, layer: "L6", id: r.zone.id, name: r.zone.name, errors: [], warnings: r.warnings, aiExplanation: r.aiExplanation };
  }
  if ("conditions" in s || "level" in s || "role" in s) {   // L4/L5 — rule module
    const r = parseAiModule(json);
    if (!r.ok || !r.module) return { ok: false, layer: r.module?.level === 4 ? "L4" : "L5", errors: r.errors, strippedFields: r.strippedFields, aiExplanation: r.aiExplanation };
    saveCustomModules([r.module, ...loadCustomModules()]);
    return { ok: true, layer: r.module.level === 4 ? "L4" : "L5", id: r.module.id, name: r.module.name, errors: [], strippedFields: r.strippedFields, aiExplanation: r.aiExplanation };
  }
  return { ok: false, errors: ["Không nhận ra tầng: JSON cần có 'ast' (L3) · 'graph' (L1) · 'featureKeys' (L2) · 'anchor' (L6) · hoặc 'conditions'+'level' (L4/L5)."] };
}
