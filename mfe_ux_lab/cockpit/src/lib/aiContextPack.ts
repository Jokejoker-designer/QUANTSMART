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
  L1: { title: "L1 · Feature", authority: "canEmitFeature: numeric measurement only; no broker orders, zones or entry instructions.", output: "number / causal OHLC measurement", place: "Start of the chain; L2 consumes the feature" },
  L2: { title: "L2 · Indicator", authority: "advisoryOnly · noEntry · noExit · noZone · noOrderSend · notLiveReady; descriptive state only.", output: "Context or indicator state: high, normal, low or regime", place: "Read L1 features and emit a state for downstream logic" },
  L3: { title: "L3 · QuantLab formula", authority: "Whitelisted safe-math AST; numeric output only, without orders or price zones.", output: "Numeric score; validate against the permutation null before interpreting it", place: "Combine features/indicators into numeric evidence for L4/L5" },
  L4: { title: "L4 · Context", authority: "Context gate based on regime/state; no broker orders, volume or exact stops/targets.", output: "Context gate state for simulated entry eligibility", place: "Read L1/L2/L3 evidence and evaluate context for L5" },
  L5: { title: "L5 · Decision", authority: "advisoryOnly · zoneOnly · noOrderSend · noAutoLot · noExactSlTp · humanDecides. Produces research states, not automatic broker instructions.", output: "decision-state (setup → confirm → ready → veto → exit-hint · zone-only)", place: "Read L4 context and L2 indicators to form a research state" },
  L6: { title: "L6 · Zone", authority: "Advisory reference zones: observation, risk, demand or invalidation; no orders.", output: "Reference price band for chart display", place: "End of the chain: display a reference zone without placing orders" },
  CONDITIONS: { title: "Executable conditions within the declared role", authority: "Advisory, no-order, no-lookahead conditions evaluated on the declared per-bar metric catalog.", output: "Simulated vote / gate / veto / confirmation weight / exit, with Intent Sandbox preview", place: "Import and preview workflow: generate JSON, validate it and inspect its per-bar behavior" },
};

// ví-dụ IMPORT-được (đã kiểm PASS bởi validateGraph/parseAiIndicator/parseAiFormula — dùng trong pack + harness)
export const L1_EXAMPLE = {
  name: "Body Ratio Feature", explain: "Measures candle body relative to its high/low range", why: "A geometry measurement; directional interpretation needs context",
  graph: { nodes: [{ id: "f", blockId: "body_ratio", inputs: [] }, { id: "out", blockId: "emit_feature", inputs: ["f"] }], output: "out" },
  explanation: "Measure candle body divided by range; values near one indicate a larger body fraction.",
};
export const L2_EXAMPLE = {
  name: "Trend-Vol Context", explain: "Combines EMA slope and ATR percentile as a trend-context input", kind: "indicator",
  featureKeys: ["ema_slope", "atr_percentile", "rsi_value"], weights: { ema_slope: 1.0, atr_percentile: 0.6, rsi_value: 0.4 },
  explanation: "Weighted sum led by EMA slope, with ATR percentile and RSI context.",
};
export const L3_EXAMPLE = {
  name: "Close-EMA over ATR", ast: { op: "DIV", args: [{ op: "SUB", args: ["close", "ema20"] }, "atr"] }, outputType: "SCORE",
  explanation: "(close − ema20) / atr: price deviation from EMA20 in ATR units.",
};
export const L6_EXAMPLE = {
  name: "Swing-low demand zone", explain: "A reference band around a recent swing low",
  anchor: "swing_low", role: "DEMAND", offsetAtr: 0, widthAtr: 0.5,
  explanation: "Demand reference band anchored to a swing low; visualization only.",
};

const OPS: Op[] = [">", "<", ">=", "<=", "==", "between", "outside"];
const CHAIN = "Chain: **L1 feature (measurement)** → **L2 indicator (state)** → **L3 score** → **L4 context gate** → **L5 research state** → **L6 reference zone**. Conditions use the declared metric catalog for engine-evaluated L0/L4/L5 rules.";

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
  let s = `- **Available L1 features for \`featureKeys\`**: use these exact keys; do not invent inputs.
  Built-in: ${builtin}`;
  if (custom.length) s += `
  User-defined L1 features; use their exact IDs: ${custom.map((m) => `\`${m.id}\` (${m.name} · ${m.status})`).join(" · ")}`;
  else s += `
  No custom L1 features exist yet. Build any new measurement in L1 first, then reference its ID from L2.`;
  return s;
}

function l3FormulaVocab(): string {
  const ops = (Object.keys(OP_SPEC) as QuantOp[]).map((o) => `\`${o}\`(${OP_SPEC[o].label})`).join(" · ");
  const macros = Object.values(SEED_MACROS).map((m) => `\`${m.macroId}\``).join(" · ");
  return `L3 uses **one formula AST** over L1/L2 evidence and constants. Output is always numeric; it cannot be an order, zone or entry instruction.

**Whitelisted operations**: ${ops}
**Available macros**, expandable as expression subtrees: ${macros}
**Arity and parameters**
- Two children: \`POW\`, \`GT\`, \`LT\`, \`EQ\`; example: \`{"op":"POW","args":["atr",2]}\`.
- Two or more children, left-associated: \`ADD\`, \`SUB\`, \`MUL\`, \`DIV\`, \`MIN\`, \`MAX\`, \`AND\`, \`OR\`. For example, \`MUL(a,b,c)\` becomes \`MUL(MUL(a,b),c)\`.
- One child: \`ABS\`, \`NEG\`, \`SIGN\`, \`LOG\`, \`EXP\`, \`SQRT\`, \`SIGMOID\`, \`TANH\`, \`NOT\`.
- Three children: \`IF_ELSE\` (condition, true result, false result).
- \`CLIP\`: one expression plus \`params:{"min":0,"max":1}\`.
- Window operations (\`ROLL_MEAN\`, \`ROLL_STD\`, \`ROLL_SUM\`, \`ROLL_MAX\`, \`ROLL_MIN\`, \`PERCENTILE_RANK\`, \`EMA\`, \`MEDIAN\`, \`MAD\`, \`IQR\`, \`ROBUSTZ\`, \`OUTLIER\`): one expression plus \`params:{"window":N}\`.
- \`LAG\`/\`DELTA\`: one expression plus \`params:{"lag":k}\`.
- \`QUANTILE\`/\`WINSOR\`: one expression plus \`params:{"q":0.9,"window":N}\`.
- \`MACRO_REF\`: \`{"op":"MACRO_REF","args":["zscore",<expression>],"params":{"window":50}}\`. The first argument is the macro ID.
Trailing constant arguments in function syntax are also normalized to parameters, but explicit \`params\` is preferred.
**Valid input series**: ${KNOWN_L3_INPUTS.map((i) => `\`${i}\``).join(" · ")} plus existing L1/L2 feature IDs and constants. \`volume\` is not in the default input set because the source may not provide suitable measured volume. Never invent an unresolved input.
${availableL1ForPrompt().replace("`featureKeys`", "input L3")}
**Guardrails**: causalOnly, numeric output, advisoryOnly, noEntry, noZone, noOrderSend, noAutoLot. Safe-math operations guard NaN and infinity.
**Example**: \`zscore((close − ema20) / atr)\`.
L3 import uses \`validateAst\`, not the L4/L5 module validator. It checks operation whitelist, arity, input references, declared macros and cycles.`;
}

// ── layerSection: nội-dung "③ Nguyên-liệu" của MỘT tầng — dùng CHUNG bởi buildLayerPack + buildMasterPrompt.
// Vì master ghép NGUYÊN các section này, per-tầng luôn là TẬP CON LITERAL của master (kiểm được bằng includes). ──
export function layerSection(layer: PackLayer): string {
  const m = LAYER_META[layer];
  const auth = `### ${m.title}\n- **Authority**: ${m.authority}\n- **Output type**: ${m.output}
- **Position in the chain**: ${m.place}`;
  if (layer === "L1") return `${auth}
- **Available components**: ${L1_BLOCKS.length} feature block / ${L1_GROUPS.length} groups:
${blockTable(L1_BLOCKS, L1_GROUPS)}`;
  if (layer === "L2") return `${auth}\n${availableL1ForPrompt()}
- **Available components**: ${L2_BLOCKS.length} indicator block / ${L2_GROUPS.length} groups:
${blockTable(L2_BLOCKS, L2_GROUPS)}`;
  if (layer === "L5") return `${auth}
- **Available components**: ${L5_BLOCKS.length} decision block / ${L5_GROUPS.length} groups; executable L5 conditions use the declared metric catalog:
${blockTable(L5_BLOCKS, L5_GROUPS)}`;
  if (layer === "L3") return `${auth}
- **Formula vocabulary**:
${l3FormulaVocab()}`;
  if (layer === "L4" || layer === "CONDITIONS") return `${auth}
- **Condition metric catalog**:
${metricList()}`;
  // L6
  return `${auth}
- **Output**: one reference price band for chart display; not an entry instruction.`;
}

export const FEW_SHOT_PRESETS: { name: string; module: Partial<CustomModule> }[] = [
  { name: "Trend-strength gate", module: { level: 4, role: "CONTEXT_GATE", name: "Trend-strength gate", explain: "Allows a candidate only when the configured EMA gap is sufficient", why: "A context hypothesis requiring measurement", conditions: [{ metric: "emaGapAtr", op: ">", value: 0.5 }], logic: "ALL" } },
  { name: "Extension veto", module: { level: 5, role: "VETO", name: "Breakout-extension veto", explain: "Excludes a candidate extended too far beyond its 20-bar reference", why: "A location constraint; it does not predict whether a retest will occur", conditions: [{ metric: "extAtr", op: ">", value: 0.8 }], logic: "ALL" } },
  { name: "RSI reclaim trigger", module: { level: 5, role: "TRIGGER", name: "RSI oversold reclaim", explain: "Contributes a long candidate after the configured RSI reclaim", why: "A mean-reversion hypothesis requiring held-out confirmation", conditions: [{ metric: "rsi", op: "between", value: 30, value2: 45 }], logic: "ALL", direction: "LONG", weight: 0.8, reliability: 0.53 } },
];

const RULES = `## Layer rules
1. Research/advisory only; do not create broker-order, volume or exact-stop instructions.
2. Unsupported execution fields such as \`order_send\`, \`lot\` and \`risk_pct\` are discarded; do not include them.
3. No lookahead: read only observations available at or before the current completed candle.
4. Respect the selected layer's authority and output type.
5. Use only the listed blocks, metrics and operations. Unknown inputs are rejected.
For example, \`order_book_delta\` is invalid unless it exists in the supplied metric catalog.`;

// Ví dụ HỎI-ĐÁP (làm rõ ý mơ hồ) + luật output "chỉ JSON" + cấu trúc explanation — chỉ vào MASTER (user mơ hồ).
const ASK_AND_OUTPUT = `## Clarify the idea before building
When the idea is ambiguous, ask a few specific questions about timeframe, setup, confirmation and exclusions. For example, a breakout-retest hypothesis needs a reference lookback, a retest definition and a choice of context filters.

## Output
Once requirements are clear, return one JSON object in a fenced JSON block. Put the explanation inside \`explanation\`: describe what the module measures or detects, which observations satisfy it, and when it remains inactive.`;

const METRIC_HINTS = `## Metric suggestions
Use only keys present in the catalog.
- Trend: \`emaGapAtr\`, \`htfAlign\`, \`priceEmaAtr\`.
- Chop context: \`atrRatio\`, \`flowConsistency\`, \`regime\`.
- Extension: \`extAtr\`, \`rsi\`.
- Breakouts: \`brokeHigh20\`, \`brokeLow20\`, \`wickRatio\`, \`bodyRatio\`.
- Session/cost context: \`overlap\`, \`spread\`, \`hour\`.`;

// SCHEMA JSON — level/role ĐÚNG THEO TẦNG (không cứng level:4). Master (mọi tầng) dùng bản neutral; pack L4/L5 dùng
// bản cố-định level của tầng đó (chống lỗi doc-conflict "pack L5 mà schema ghi level:4/CONTEXT_GATE").
function conditionSchema(layer?: "L4" | "L5"): string {
  const levelLine = layer === "L5" ? `"level": 5` : layer === "L4" ? `"level": 4` : `"level": <4 or 5>`;
  const roleLine = layer === "L5" ? `"role": "<TRIGGER | VETO | CONFIRM | EXIT>"` : layer === "L4" ? `"role": "CONTEXT_GATE"` : `"role": "<CONTEXT_GATE (L4) | TRIGGER/VETO/CONFIRM/EXIT (L5)>"`;
  const l5note = layer === "L5" ? `
- **L5**: conditions feed the builder setup. A TRIGGER with no conditions is rejected.` : "";
  return `## JSON condition-module schema
\`\`\`json
{ ${levelLine}, ${roleLine}, "name": "Name with at least 3 characters",
  "explain": "What it does; at least 12 characters", "why": "Rationale; at least 12 characters",
  "conditions": [{"metric":"<catalog key or existing L1/L2/L3 evidence ID>","op":"<operator>","value":0,"value2":0}],
  "logic":"ALL","direction":"LONG","exitAction":"CLOSE","lockR":0.5 }
\`\`\`
\`direction\` applies to TRIGGER only (LONG/SHORT/REGIME); \`exitAction\` and \`lockR\` apply to EXIT only; \`between\` and \`outside\` require \`value2\`.${l5note}`;
}
const CONDITION_SCHEMA = conditionSchema();

// ── OUTPUT-LOCK: khóa ĐẦU RA của MỘT tầng ngay đầu pack. Chống lỗi "chọn L1 nhưng AI trả L5": mỗi tầng có
// format riêng, cấm trả format tầng khác. L1/L2/L6 KHÔNG import-JSON (visual-authored) → AI phải MÔ TẢ block. ──
function outputLock(layer: PackLayer): string {
  const L = `> You are helping build layer ${layer}. Use the schema and components for layer ${layer}.`;
  if (layer === "L4") return `${L}
> L4 output: one JSON object with \`level:4, role:"CONTEXT_GATE"\`. Do not return a different layer.`;
  if (layer === "L5") return `${L}
> L5 output: one JSON object with \`level:5\` and role TRIGGER, VETO, CONFIRM or EXIT. Do not return level 4.`;
  if (layer === "CONDITIONS") return `${L}
> Output one condition-module JSON object for level 0, 4 or 5, or ask for missing requirements.`;
  if (layer === "L3") return `${L}
> L3 output: one formula AST JSON object with \`name\`, \`ast\`, \`outputType:"SCORE"\` and \`explanation\`. Nested \`{op,args}\` expressions are normalized on import. Do not return an L4/L5 condition module.`;
  if (layer === "L1") return `${L}
> L1 output: a FeatureGraph JSON object with \`name\`, \`explain\`, \`why\`, \`graph:{nodes:[{id,blockId,params?,inputs}],output:<emit-node ID>}\` and \`explanation\`. Use the listed block IDs. Inputs reference node IDs; STREAM_OHLC ports do not count toward the inputs array. Output must be \`emit_feature\`. Import JSON runs graph validation.`;
  if (layer === "L2") return `${L}
> L2 output: weighted-sum JSON with \`name\`, \`explain\`, \`kind\` (indicator/regime/bias/confidence), \`featureKeys\`, numeric \`weights\` and \`explanation\`. Feature keys must already exist in the supplied L1 list. Build missing L1 features first. Do not return L4/L5 module JSON.`;
  return `${L}
> L6 output: reference-zone JSON with \`name\`, \`explain\`, \`anchor\`, optional \`anchorRef\`, \`role\`, \`offsetAtr\`, \`widthAtr\` and \`explanation\`. Anchors: swing_high/swing_low/poc/evidence/l5_state/price. Roles: OBSERVE/RISK/DEMAND/INVALIDATE. Evidence/l5_state anchors require an existing module ID. Do not create order instructions.`;
}

/** Pack cho MỘT tầng — OUTPUT-LOCK trước + section của tầng (chuỗi con literal của master) + schema nếu executable. */
export function buildLayerPack(layer: PackLayer): string {
  const m = LAYER_META[layer];
  const head = `# MFE Context Pack — ${m.title}\n\n${outputLock(layer)}

Help the user turn one idea for **${m.title}** into a QUANTSMART module using this layer's components.
${CHAIN}\n\n${RULES}

## Available layer components
${layerSection(layer)}`;
  if (layer === "L5" || layer === "L4" || layer === "CONDITIONS") {
    const shots = FEW_SHOT_PRESETS.filter((p) => (layer === "L4" ? p.module.level === 4 : layer === "L5" ? p.module.level === 5 : true)).map((p) => `\`\`\`json\n${JSON.stringify(p.module, null, 2)}\n\`\`\``).join("\n\n");
    return `${head}\n\n## ④ ${conditionSchema(layer === "L4" ? "L4" : layer === "L5" ? "L5" : undefined)}

### Valid example
${shots}`;
  }
  if (layer === "L3") return `${head}

## Import JSON
\`validateAst\` checks operation whitelist, arity, inputs, macros and cycles. Nested \`{op,args}\` expressions are flattened on import.

### Valid example
\`\`\`json
${JSON.stringify(L3_EXAMPLE, null, 2)}\n\`\`\``;
  if (layer === "L1") return `${head}

## Import JSON
\`validateGraph\` checks block IDs, port types and an \`emit_feature\` output. STREAM_OHLC ports are excluded from \`inputs\`.

### Valid example
\`\`\`json
${JSON.stringify(L1_EXAMPLE, null, 2)}\n\`\`\``;
  if (layer === "L2") return `${head}

## Import JSON
Checks include valid kind, at least one feature key and numeric weights for each key. Unknown keys are reported and remain unavailable until the referenced feature exists.

### Valid example
\`\`\`json
${JSON.stringify(L2_EXAMPLE, null, 2)}\n\`\`\``;
  return `${head}

## Import JSON
Checks include supported anchor/role, positive widthAtr and an existing anchorRef for evidence/l5_state. Zones are visual references only.

### Valid example
\`\`\`json
${JSON.stringify(L6_EXAMPLE, null, 2)}\n\`\`\``;
}

function metricList(): string {
  const base = "| key | label | scope | meaning |\n|---|---|---|---|\n" + METRICS.map((x) => `| \`${x.key}\` | ${x.label} | ${x.scope} | ${x.hint} |`).join("\n") + `

Operators: \`${OPS.join("` `")}\`.`;
  const ev = listCustomMetrics();
  // [[block-is-fixed-foundation-doctrine]] metric BLOCK-NATIVE: dùng id module L1/L2/L3 đã build làm metric → decision đọc bằng chứng riêng
  const evBlock = ev.length
    ? `

**Existing block-native evidence metrics**: use these exact IDs in TRIGGER/GATE/VETO conditions to read L1/L2/L3 evidence alongside the built-in metric catalog.
` + ev.map((m) => `- \`${m.key}\` — ${m.label} (${m.layer})`).join("\n")
    : `

No custom L1/L2/L3 evidence exists yet. Build the measurement first, then reference its ID from a condition.`;
  const triggerRule = `

L1/L2/L3 are evidence sources, not entry triggers. A complete custom entry hypothesis needs a directional TRIGGER referencing that evidence or a built-in metric. Gates and confirmations alone leave the simulator using its fallback trigger.`;
  return base + evBlock + triggerRule;
}

// ── MASTER prompt (mặc định, TỰ CHỨA mọi tầng): user tả ý tưởng TỔNG QUÁT (mơ hồ được). AI hỏi-đáp làm rõ, tự
// phân rã setup/confirm/veto/exit qua các tầng (mỗi tầng authority riêng — nhúng NGUYÊN section bên dưới), rồi trả
// MỘT module chạy được + explanation nguyên-văn. per-tầng = layerSection(L) ⊂ master (kiểm bằng includes). ──
export function buildMasterPrompt(userIdea = ""): string {
  const idea = userIdea.trim() ? `
## User idea
> ${userIdea.trim().replace(/\n/g, "\n> ")}\n` : "";
  const sections = (["L1", "L2", "L3", "L4", "L5", "L6"] as PackLayer[]).map((L) => layerSection(L)).join("\n\n");
  return `# QUANTSMART — turn an idea into a testable module

Help build one module. If requirements are unclear, ask specific questions about timeframe, setup, confirmation, exits and exclusions. Once clear, return one schema-compliant JSON object, with the rationale in its \`explanation\` field.
${idea}
The user may describe a strategy without knowing the layer model. Clarify the idea, separate setup, confirmation, veto and exit behavior, then choose the appropriate layer. Use only the supplied component and metric catalogs. Return an L4/L5 condition module, or an L3 numeric AST when the idea is a measurement. Write the explanation in plain English: what it does, what activates it, and why it matches the stated hypothesis.

Layer chain: ${CHAIN}

${ASK_AND_OUTPUT}

${RULES}

## Layer catalogs
${sections}

${METRIC_HINTS}

${CONDITION_SCHEMA.replace('## SCHEMA JSON', "## L4/L5 module JSON schema with explanation").replace('"lockR": 0.5 }', "\"lockR\":0.5,\"explanation\":\"Explain the module in plain English\" }")}

## Example module
${FEW_SHOT_PRESETS.map((p) => `\`\`\`json\n${JSON.stringify({ ...p.module, explanation: "…(one plain-English sentence)" }, null, 2)}\n\`\`\``).join("\n")}

## Research limits
Valid wiring and expected activation do not establish profitability. Run measured historical validation in Microscope and inspect its assumptions.`;
}
/** alias giữ tương thích — buildIdeaPack === buildMasterPrompt (master tự chứa). */
export const buildIdeaPack = buildMasterPrompt;

// ── ORCHESTRATOR (điều phối): master GỌN — user tả chiến lược, AI phân rã rồi TỰ XIN prompt từng tầng để hoàn
// thiện sản phẩm nhiều tầng. Khác master tự-chứa (một phát): đây tiết-kiệm context, AI làm từng tầng một. ──
export function buildOrchestratorPrompt(userIdea = ""): string {
  const idea = userIdea.trim() ? `
## User strategy idea
> ${userIdea.trim().replace(/\n/g, "\n> ")}\n` : "";
  const authRows = (["L1", "L2", "L3", "L4", "L5", "L6"] as PackLayer[]).map((L) => `| ${L} | ${LAYER_META[L].output} | ${LAYER_META[L].authority.split("—")[0].trim()} |`).join("\n");
  return `# QUANTSMART — build a strategy one layer at a time

Turn the supplied hypothesis into the required components while respecting each layer's schema and authority.
${idea}
1. Clarify missing timeframe, setup, confirmation, exit and exclusion requirements.
2. Identify only the layers the hypothesis actually needs; a single L4 or L5 module may suffice.
3. For each required layer, request its context pack using the layer-specific prompt button. Build that component in the supplied format before moving on.
4. Use the studio's Import JSON workflow where available, inspect the result, and validate dependencies before attaching it to a Card.

## Layer map
| layer | output | authority |
|---|---|---|
${authRows}

## ${CHAIN}

## Limits
Respect each pack's output type; do not substitute L5 JSON for an L1 graph. A valid component is a hypothesis, not a profitable strategy. Test it in Microscope.`;
}

const LAYER_OF = (lvl: Level): PackLayer => (lvl === 0 ? "CONDITIONS" : (["L1", "L2", "L3", "L4", "L5", "L6"][lvl - 1] as PackLayer));

// 5 mục popup (đúng format hệ đã dùng). AUTHORITY + VỊ-TRÍ derive từ level/role của TA (không tin AI tự khai);
// LÀM-GÌ + CƠ-CHẾ lấy lời AI (nếu có) hoặc module.explain. Đây là nội dung "popup" user thấy ngay sau import.
export interface ExplainSections { whatItDoes: string; mechanism: string; position: string; authority: string; limits: string }
export function explainSections(m: Partial<CustomModule>, aiExplanation?: string): ExplainSections {
  const lvl = (m.level ?? 5) as Level; const meta = LAYER_META[LAYER_OF(lvl)];
  const roleAct = m.role === "TRIGGER" ? `vote ${m.direction || "?"}` : m.role === "VETO" || m.role === "SAFETY_VETO" ? "Veto simulated entry" : m.role === "CONTEXT_GATE" ? "Permit simulated entry only when conditions match" : m.role === "CONFIRM" ? "Scale an existing vote; do not create a signal" : m.role === "EXIT" ? (m.exitAction || "Close simulated position") : "advisory";
  return {
    whatItDoes: aiExplanation || m.explain || "—",
    mechanism: `Read current-bar metrics, evaluate conditions (${describeModuleAsBlocks(m).replace(/^Ghép từ block: /, "").replace(/ \(Bạn đã sửa.*$/, "")}) and emit: ${roleAct}.`,
    position: `${meta.title} — ${meta.place}. Output follows the declared L1 → L2 → L3 → L4 → L5 → L6 dependencies.`,
    authority: meta.authority,   // ← từ type-system của HỆ, không phải AI khai (chống vượt quyền)
    limits: `${m.why || "—"} · Shadow status until calibration and walk-forward checks. Validity does not establish an edge; run a measured test.`,
  };
}

const mLabelPack = (k: string) => METRICS.find((x) => x.key === k)?.label || k;
/** Giải thích module theo kiểu GHÉP BLOCK (khi user tự sửa — không có lời AI). Đọc được cho người mới. */
export function describeModuleAsBlocks(m: Partial<CustomModule>): string {
  const conds = (m.conditions || []).map((c) => {
    const rhs = c.op === "between" || c.op === "outside" ? `${c.value}…${c.value2 ?? "?"}` : String(c.value);
    return `【${mLabelPack(c.metric)}】 ${c.op} 【${rhs}】`;
  });
  if (!conds.length) return "No condition block selected.";
  const glue = m.logic === "ANY" ? " OR " : " AND ";
  const roleAct = m.role === "TRIGGER" ? `→ vote ${m.direction || "?"}` : m.role === "VETO" || m.role === "SAFETY_VETO" ? "→ Veto simulated entry" : m.role === "CONTEXT_GATE" ? "→ Permit simulated entry" : m.role === "CONFIRM" ? "→ Scale existing vote" : m.role === "EXIT" ? `→ ${m.exitAction || "Close simulated position"}` : "→ (advisory)";
  return `Composed from blocks: ${conds.join(glue)} ${roleAct}. This explanation follows the edited blocks rather than an earlier generated description.`;
}

/** Pack "toàn cảnh" điều-kiện chạy được (L0/L4/L5) — module IMPORT + PREVIEW round-trip. */
export function buildContextPack(): string {
  const levelRows = Object.values(LEVEL_TEMPLATES).map((t) => `| ${t.level} | ${t.roles.join(", ")} | ${t.title} | ${t.executable ? "engine evaluated" : "advisory"} |`).join("\n");
  const shots = FEW_SHOT_PRESETS.map((p) => `#### ${p.name}\n\`\`\`json\n${JSON.stringify(p.module, null, 2)}\n\`\`\``).join("\n\n");
  const cm = LAYER_META.CONDITIONS;
  return `# QUANTSMART Module Context Pack — engine-evaluated L0/L4/L5 conditions

Translate the stated hypothesis into a condition module using the declared metric catalog, rather than unrestricted code. Return one JSON object in the schema below.

## Authority
${cm.authority}
## ② Output type
${cm.output}
## Position and dependencies
${cm.place}
${CHAIN}

${RULES}

## Metric catalog (${METRICS.length} metrics; use only these keys)
${metricList()}

## Level & Role
| level | roles | vai | |
|---|---|---|---|
${levelRows}

## Examples
${shots}

${CONDITION_SCHEMA}

## Final research limit
A valid module is not evidence of an edge. Intent Sandbox checks per-bar behavior; measured backtests in Microscope evaluate the declared historical experiment. No generated explanation can establish future profitability.`;
}

const ALLOWED_TOP = new Set(["level", "role", "name", "explain", "why", "conditions", "logic", "direction", "weight", "reliability", "exitAction", "lockR", "zoneRole", "zoneOffsetAtr"]);
const ALLOWED_COND = new Set(["metric", "op", "value", "value2"]);

export interface ParseResult { ok: boolean; module?: CustomModule; errors: string[]; strippedFields: string[]; aiExplanation?: string }

/** Parse JSON AI trả về → module đã validate. CHỈ nhận field trong schema (order/lot/risk bị BỎ, không leak). */
export function parseAiModule(json: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["Invalid JSON syntax: " + (e as Error).message], strippedFields: [] }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Expected one JSON object."], strippedFields: [] };
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
  try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["Invalid JSON syntax: " + (e as Error).message] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Expected a JSON object."] };
  const src = raw as Record<string, unknown>;
  const aiExplanation = typeof src.explanation === "string" ? src.explanation.trim() : undefined;
  const ast = src.ast as QuantFormulaAst | undefined;
  if (!ast || typeof ast !== "object") return { ok: false, errors: ["Missing 'ast'; supply nested {op,args} or flat {rootNodeId,nodes}."], aiExplanation };
  // AI thường trả cây LỒNG NHAU { op, args } — hệ cần dạng PHẲNG { rootNodeId, nodes }. Tự chuyển nếu là nested.
  const flat = (ast as { nodes?: unknown }).nodes ? (ast as QuantFormulaAst) : nestedAstToFlat(ast as unknown as NestedAstNode, typeof src.name === "string" ? src.name : "AI L3");
  if (!flat || !flat.nodes || !flat.rootNodeId) return { ok: false, errors: ["Missing 'ast'; supply nested {op,args} or flat {rootNodeId,nodes}."], aiExplanation };
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
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["Invalid JSON syntax: " + (e as Error).message], warnings: [] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Expected a JSON object."], warnings: [] };
  const s = raw as Record<string, unknown>;
  const aiExplanation = typeof s.explanation === "string" ? s.explanation.trim() : undefined;
  const g = s.graph as Partial<FeatureGraph> | undefined;
  if (!g || !Array.isArray(g.nodes) || typeof g.output !== "string") return { ok: false, errors: ["Missing 'graph'; supply {nodes:[…],output}."], warnings: [], aiExplanation };
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
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["Invalid JSON syntax: " + (e as Error).message], warnings: [] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Expected a JSON object."], warnings: [] };
  const s = raw as Record<string, unknown>;
  const aiExplanation = typeof s.explanation === "string" ? s.explanation.trim() : undefined;
  const errors: string[] = []; const warnings: string[] = [];
  const kind = (typeof s.kind === "string" ? s.kind : "indicator") as L2Kind;
  if (!L2_KINDS.has(kind)) errors.push("Unknown kind '" + kind + "'; supported kinds: indicator/regime/bias/confidence/overlay");
  const featureKeys = Array.isArray(s.featureKeys) ? s.featureKeys.filter((k): k is string => typeof k === "string") : [];
  if (featureKeys.length < 1) errors.push("featureKeys must contain at least one L1 feature key");
  const weightsRaw = (s.weights && typeof s.weights === "object") ? s.weights as Record<string, unknown> : {};
  const weights: Record<string, number> = {};
  for (const k of featureKeys) { const w = Number(weightsRaw[k]); if (!isFinite(w)) errors.push("Missing numeric weights['" + k + "']"); else weights[k] = w; }
  const pool = knownFeatureKeys();
  for (const k of featureKeys) if (!pool.has(k)) warnings.push("feature '" + k + "' is not in the built-in/promoted custom L1 pool; its L2 input remains unavailable until it exists");
  const explain = typeof s.explain === "string" ? s.explain : "";
  if (explain.trim().length < 8) errors.push("explain must contain at least 8 characters");
  if (errors.length) return { ok: false, errors, warnings, aiExplanation };
  const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : "AI L2 indicator";
  const module: CustomL2Module = { id: "l2_" + Date.now().toString(36), name, explain, kind, featureKeys, weights, status: "SHADOW", createdAt: new Date().toISOString() };
  return { ok: true, module, errors: [], warnings, aiExplanation };
}

// L6 — ZONE. AI trả { name, explain, anchor, anchorRef?, role, offsetAtr, widthAtr, explanation }.
export function parseAiZone(json: string): { ok: boolean; zone?: CustomL6Zone; errors: string[]; warnings: string[]; aiExplanation?: string } {
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["Invalid JSON syntax: " + (e as Error).message], warnings: [] }; }
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["Expected a JSON object."], warnings: [] };
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
  let raw: unknown; try { raw = JSON.parse(json); } catch (e) { return { ok: false, errors: ["Invalid JSON syntax: " + (e as Error).message] }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Expected one module as a JSON object."] };
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
  return { ok: false, errors: ["Cannot identify the layer. Supply ast (L3), graph (L1), featureKeys (L2), anchor (L6), or conditions with level (L4/L5)."] };
}
