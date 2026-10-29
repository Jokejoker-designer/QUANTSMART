// quantBlockSpec — the OFFICIAL L3 QuantLab block registry (88 blocks / 10 groups). These are the hardblocks the
// user assembles from (like L1=85, L2=56 → total v1 = 229). A block is a TYPE; dragging it / typing it creates a
// node INSTANCE in the AST. `impl` is honest: "KERNEL" = the quantAstEvaluator already evaluates it now; "PLANNED"
// = catalogued for QL-5+ (Robust/Event/Vector/Fuzzy packs) — registered but not yet evaluable, so we never fake it.
// Every block is advisory-only / no-order, NaN-Inf sealed, causal, no-lookahead. User macros are NOT new primitives.
import { OP_SPEC, QUANT_AUTHORITY, type QuantOp, type QuantAuthority, type QuantNodeKind } from "./quantAstTypes.ts";

export type QuantBlockGroup = "INPUT_CONST" | "ARITHMETIC" | "NONLINEAR" | "COMPARE_LOGIC" | "ROLLING" | "ROBUST_STATS" | "EVENT_PATH" | "VECTOR" | "FUZZY_CALIB" | "SAFETY_OUTPUT";
export type BlockImpl = "KERNEL" | "PLANNED";
export type BlockKind = QuantNodeKind | "SAFETY" | "OUTPUT";

export interface QuantBlockSafety { kidiGuard?: boolean; domainGuard?: boolean; clampGuard?: boolean; nanInfSeal: true; causalOnly: true; noLookahead: true }
export interface QuantBlockSpec {
  id: string; name: string; group: QuantBlockGroup; kind: BlockKind;
  op?: QuantOp;                 // the kernel op it compiles to (KERNEL blocks only)
  inputs: number | "n";        // operand arity (−series); INPUT/CONST = 0
  params: string[];            // param names (window/lag/min/max/macroId…)
  printer: string;             // DSL token shown in Formula Text
  impl: BlockImpl;             // evaluable now (KERNEL) vs registered for QL-5+ (PLANNED)
  research: boolean;           // RESEARCH/SHADOW-leaning pack (e.g. vector/similarity)
  safety: QuantBlockSafety;
  authority: QuantAuthority;
  note?: string;
}

// NOTE: these are ESTIMATES / targets, NOT a hard cap. The real L3 count is whatever QUANT_BLOCKS actually holds
// (it grows as we add/audit blocks). The registry array — not this number — is the source of truth.
export const GROUP_TARGET: Record<QuantBlockGroup, number> = { INPUT_CONST: 6, ARITHMETIC: 8, NONLINEAR: 9, COMPARE_LOGIC: 10, ROLLING: 12, ROBUST_STATS: 7, EVENT_PATH: 12, VECTOR: 7, FUZZY_CALIB: 10, SAFETY_OUTPUT: 7 };
export const TARGET_TOTAL = Object.values(GROUP_TARGET).reduce((a, b) => a + b, 0);  // ≈88, an estimate
export const GROUP_LABEL: Record<QuantBlockGroup, string> = { INPUT_CONST: "Input / Constant", ARITHMETIC: "Arithmetic", NONLINEAR: "Nonlinear / Domain Math", COMPARE_LOGIC: "Compare / Logic / Gate", ROLLING: "Causal Window / Rolling", ROBUST_STATS: "Robust Statistics", EVENT_PATH: "Event / Path / Risk", VECTOR: "Vector / Similarity", FUZZY_CALIB: "Fuzzy / Calibration", SAFETY_OUTPUT: "Safety / Output / Debug" };

const S = (g?: { kidi?: boolean; domain?: boolean; clamp?: boolean }): QuantBlockSafety => ({ nanInfSeal: true, causalOnly: true, noLookahead: true, kidiGuard: g?.kidi, domainGuard: g?.domain, clampGuard: g?.clamp });
type Opt = { op?: QuantOp; inputs?: number | "n"; params?: string[]; research?: boolean; guard?: { kidi?: boolean; domain?: boolean; clamp?: boolean }; note?: string };
const B = (id: string, name: string, group: QuantBlockGroup, kind: BlockKind, impl: BlockImpl, printer: string, o: Opt = {}): QuantBlockSpec =>
  ({ id, name, group, kind, op: o.op, inputs: o.inputs ?? 0, params: o.params ?? [], printer, impl, research: o.research ?? false, safety: S(o.guard), authority: QUANT_AUTHORITY, note: o.note });

export const QUANT_BLOCKS: QuantBlockSpec[] = [
  // ── INPUT_CONST (6) ──
  B("in_l1", "L1 Input", "INPUT_CONST", "INPUT", "KERNEL", "<L1 feature>", { note: "promoted L1 feature series" }),
  B("in_l2", "L2 Input", "INPUT_CONST", "INPUT", "KERNEL", "<L2 context>", { note: "L2 indicator/context series" }),
  B("const", "Const", "INPUT_CONST", "CONST", "KERNEL", "3.14"),
  B("param", "Parameter", "INPUT_CONST", "CONST", "KERNEL", "<param>", { note: "named tunable constant" }),
  B("series_ref", "Series Ref", "INPUT_CONST", "INPUT", "KERNEL", "<ref>", { note: "reference another node output" }),
  B("macro_input", "Macro Input", "INPUT_CONST", "INPUT", "KERNEL", "<slot>", { note: "input slot inside a macro" }),
  // ── ARITHMETIC (8) ──
  B("add", "Add", "ARITHMETIC", "POINT_OP", "KERNEL", "a + b", { op: "ADD", inputs: 2 }),
  B("sub", "Sub", "ARITHMETIC", "POINT_OP", "KERNEL", "a - b", { op: "SUB", inputs: 2 }),
  B("mul", "Mul", "ARITHMETIC", "POINT_OP", "KERNEL", "a * b", { op: "MUL", inputs: 2 }),
  B("safediv", "SafeDiv", "ARITHMETIC", "POINT_OP", "KERNEL", "a / b", { op: "DIV", inputs: 2, guard: { kidi: true } }),
  B("pow", "Pow", "ARITHMETIC", "POINT_OP", "KERNEL", "a ^ b", { op: "POW", inputs: 2, guard: { clamp: true } }),
  B("abs", "Abs", "ARITHMETIC", "POINT_OP", "KERNEL", "abs(x)", { op: "ABS", inputs: 1 }),
  B("neg", "Neg", "ARITHMETIC", "POINT_OP", "KERNEL", "neg(x)", { op: "NEG", inputs: 1 }),
  B("sign", "Sign", "ARITHMETIC", "POINT_OP", "KERNEL", "sign(x)", { op: "SIGN", inputs: 1 }),
  // ── NONLINEAR (9) ──
  B("log", "Log", "NONLINEAR", "POINT_OP", "KERNEL", "log(x)", { op: "LOG", inputs: 1, guard: { domain: true } }),
  B("sqrt", "Sqrt", "NONLINEAR", "POINT_OP", "KERNEL", "sqrt(x)", { op: "SQRT", inputs: 1, guard: { domain: true } }),
  B("exp", "Exp", "NONLINEAR", "POINT_OP", "KERNEL", "exp(x)", { op: "EXP", inputs: 1, guard: { clamp: true } }),
  B("sigmoid", "Sigmoid", "NONLINEAR", "POINT_OP", "KERNEL", "sigmoid(x)", { op: "SIGMOID", inputs: 1, guard: { clamp: true } }),
  B("tanh", "Tanh", "NONLINEAR", "POINT_OP", "KERNEL", "tanh(x)", { op: "TANH", inputs: 1 }),
  B("min", "Min", "NONLINEAR", "POINT_OP", "KERNEL", "min(a, b)", { op: "MIN", inputs: 2 }),
  B("max", "Max", "NONLINEAR", "POINT_OP", "KERNEL", "max(a, b)", { op: "MAX", inputs: 2 }),
  B("clip", "Clip", "NONLINEAR", "POINT_OP", "KERNEL", "clip(x, lo, hi)", { op: "CLIP", inputs: 1, params: ["min", "max"], guard: { clamp: true } }),
  B("clamp01", "Clamp01", "NONLINEAR", "POINT_OP", "KERNEL", "clip(x, 0, 1)", { op: "CLIP", inputs: 1, params: ["min", "max"], guard: { clamp: true }, note: "clip to [0,1]" }),
  // ── COMPARE_LOGIC (10) ──
  B("gt", "Greater", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "a > b", { op: "GT", inputs: 2 }),
  B("lt", "Less", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "a < b", { op: "LT", inputs: 2 }),
  B("gte", "GreaterEqual", "COMPARE_LOGIC", "LOGIC_OP", "PLANNED", "a >= b", { inputs: 2, note: "= not(a<b)" }),
  B("lte", "LessEqual", "COMPARE_LOGIC", "LOGIC_OP", "PLANNED", "a <= b", { inputs: 2, note: "= not(a>b)" }),
  B("eq", "Equal", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "a == b", { op: "EQ", inputs: 2 }),
  B("neq", "NotEqual", "COMPARE_LOGIC", "LOGIC_OP", "PLANNED", "a != b", { inputs: 2, note: "= not(a==b)" }),
  B("and", "AND", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "and(a, b)", { op: "AND", inputs: 2 }),
  B("or", "OR", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "or(a, b)", { op: "OR", inputs: 2 }),
  B("not", "NOT", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "not(x)", { op: "NOT", inputs: 1 }),
  B("ifelse", "IfElse / Gate", "COMPARE_LOGIC", "LOGIC_OP", "KERNEL", "ifelse(c, a, b)", { op: "IF_ELSE", inputs: 3 }),
  // ── ROLLING (12) ──
  B("lag", "Lag", "ROLLING", "ROLLING_OP", "KERNEL", "lag(x, k)", { op: "LAG", inputs: 1, params: ["lag"] }),
  B("delta", "Delta", "ROLLING", "ROLLING_OP", "KERNEL", "delta(x, k)", { op: "DELTA", inputs: 1, params: ["lag"] }),
  B("mean", "RollingMean", "ROLLING", "ROLLING_OP", "KERNEL", "mean(x, W)", { op: "ROLL_MEAN", inputs: 1, params: ["window"] }),
  B("std", "RollingStd", "ROLLING", "ROLLING_OP", "KERNEL", "std(x, W)", { op: "ROLL_STD", inputs: 1, params: ["window"], guard: { kidi: true } }),
  B("sum", "RollingSum", "ROLLING", "ROLLING_OP", "KERNEL", "sum(x, W)", { op: "ROLL_SUM", inputs: 1, params: ["window"] }),
  B("rmax", "RollingMax", "ROLLING", "ROLLING_OP", "KERNEL", "rmax(x, W)", { op: "ROLL_MAX", inputs: 1, params: ["window"] }),
  B("rmin", "RollingMin", "ROLLING", "ROLLING_OP", "KERNEL", "rmin(x, W)", { op: "ROLL_MIN", inputs: 1, params: ["window"] }),
  B("ema", "EMA", "ROLLING", "ROLLING_OP", "KERNEL", "ema(x, W)", { op: "EMA", inputs: 1, params: ["window"] }),
  B("pctrank", "PercentileRank", "ROLLING", "ROLLING_OP", "KERNEL", "pctrank(x, W)", { op: "PERCENTILE_RANK", inputs: 1, params: ["window"] }),
  B("rank", "Rank", "ROLLING", "ROLLING_OP", "PLANNED", "rank(x, W)", { inputs: 1, params: ["window"] }),
  B("rslope", "RollingSlope", "ROLLING", "ROLLING_OP", "PLANNED", "rslope(x, W)", { inputs: 1, params: ["window"] }),
  B("rcorr", "RollingCorrelation", "ROLLING", "ROLLING_OP", "PLANNED", "rcorr(a, b, W)", { inputs: 2, params: ["window"] }),
  // ── ROBUST_STATS (7) — KERNEL (activated) ──
  B("median", "Median", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "median(x, W)", { op: "MEDIAN", inputs: 1, params: ["window"] }),
  B("mad", "MAD", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "mad(x, W)", { op: "MAD", inputs: 1, params: ["window"] }),
  B("quantile", "Quantile", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "quantile(x, q, W)", { op: "QUANTILE", inputs: 1, params: ["q", "window"] }),
  B("iqr", "IQR", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "iqr(x, W)", { op: "IQR", inputs: 1, params: ["window"] }),
  B("winsorize", "Winsorize", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "winsorize(x, q, W)", { op: "WINSOR", inputs: 1, params: ["q", "window"], guard: { clamp: true } }),
  B("robustz", "RobustZ", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "robustz(x, W)", { op: "ROBUSTZ", inputs: 1, params: ["window"], guard: { kidi: true } }),
  B("outlierscore", "OutlierScore", "ROBUST_STATS", "ROLLING_OP", "KERNEL", "outlierscore(x, W)", { op: "OUTLIER", inputs: 1, params: ["window"], guard: { kidi: true } }),
  // ── EVENT_PATH (12) — PLANNED ──
  B("bars_since", "BarsSince", "EVENT_PATH", "ROLLING_OP", "PLANNED", "bars_since(e)", { inputs: 1 }),
  B("count_since", "CountSince", "EVENT_PATH", "ROLLING_OP", "PLANNED", "count_since(e, W)", { inputs: 1, params: ["window"] }),
  B("max_since", "MaxSince", "EVENT_PATH", "ROLLING_OP", "PLANNED", "max_since(x, e)", { inputs: 2 }),
  B("min_since", "MinSince", "EVENT_PATH", "ROLLING_OP", "PLANNED", "min_since(x, e)", { inputs: 2 }),
  B("decay_since", "DecaySince", "EVENT_PATH", "ROLLING_OP", "PLANNED", "decay_since(e, hl)", { inputs: 1, params: ["halfLife"] }),
  B("running_max", "RunningMax", "EVENT_PATH", "ROLLING_OP", "PLANNED", "running_max(x)", { inputs: 1 }),
  B("running_min", "RunningMin", "EVENT_PATH", "ROLLING_OP", "PLANNED", "running_min(x)", { inputs: 1 }),
  B("drawdown", "Drawdown", "EVENT_PATH", "ROLLING_OP", "PLANNED", "drawdown(x)", { inputs: 1 }),
  B("max_dd", "MaxDrawdown", "EVENT_PATH", "ROLLING_OP", "PLANNED", "max_dd(x, W)", { inputs: 1, params: ["window"] }),
  B("path_eff", "PathEfficiency", "EVENT_PATH", "ROLLING_OP", "PLANNED", "path_eff(x, W)", { inputs: 1, params: ["window"] }),
  B("mae_proxy", "MAEProxy", "EVENT_PATH", "ROLLING_OP", "PLANNED", "mae_proxy(x, W)", { inputs: 1, params: ["window"] }),
  B("mfe_proxy", "MFEProxy", "EVENT_PATH", "ROLLING_OP", "PLANNED", "mfe_proxy(x, W)", { inputs: 1, params: ["window"] }),
  // ── VECTOR (7) — PLANNED, research ──
  B("dot", "DotProduct", "VECTOR", "POINT_OP", "PLANNED", "dot(a, b)", { inputs: 2, research: true }),
  B("norm", "Norm", "VECTOR", "POINT_OP", "PLANNED", "norm(v)", { inputs: 1, research: true }),
  B("cosine", "CosineSimilarity", "VECTOR", "POINT_OP", "PLANNED", "cosine(a, b)", { inputs: 2, research: true, guard: { kidi: true } }),
  B("euclidean", "EuclideanDistance", "VECTOR", "POINT_OP", "PLANNED", "euclidean(a, b)", { inputs: 2, research: true }),
  B("manhattan", "ManhattanDistance", "VECTOR", "POINT_OP", "PLANNED", "manhattan(a, b)", { inputs: 2, research: true }),
  B("weighted_dist", "WeightedDistance", "VECTOR", "POINT_OP", "PLANNED", "weighted_dist(a, b, w)", { inputs: 3, research: true }),
  B("projection", "Projection", "VECTOR", "POINT_OP", "PLANNED", "projection(a, b)", { inputs: 2, research: true }),
  // ── FUZZY_CALIB (10) — PLANNED ──
  B("fuzzy_low", "FuzzyLow", "FUZZY_CALIB", "POINT_OP", "PLANNED", "fuzzy_low(x)", { inputs: 1 }),
  B("fuzzy_mid", "FuzzyMid", "FUZZY_CALIB", "POINT_OP", "PLANNED", "fuzzy_mid(x)", { inputs: 1 }),
  B("fuzzy_high", "FuzzyHigh", "FUZZY_CALIB", "POINT_OP", "PLANNED", "fuzzy_high(x)", { inputs: 1 }),
  B("fuzzy_and", "FuzzyAND", "FUZZY_CALIB", "POINT_OP", "PLANNED", "fuzzy_and(a, b)", { inputs: 2 }),
  B("fuzzy_or", "FuzzyOR", "FUZZY_CALIB", "POINT_OP", "PLANNED", "fuzzy_or(a, b)", { inputs: 2 }),
  B("fuzzy_not", "FuzzyNOT", "FUZZY_CALIB", "POINT_OP", "PLANNED", "fuzzy_not(x)", { inputs: 1 }),
  B("sample_count", "SampleCount", "FUZZY_CALIB", "ROLLING_OP", "PLANNED", "sample_count(e, W)", { inputs: 1, params: ["window"] }),
  B("cap_low_if_thin", "CapLowIfThin", "FUZZY_CALIB", "POINT_OP", "PLANNED", "cap_low_if_thin(score, n)", { inputs: 2 }),
  B("eff_sample", "EffectiveSampleSize", "FUZZY_CALIB", "ROLLING_OP", "PLANNED", "eff_sample(w, W)", { inputs: 1, params: ["window"] }),
  B("reliability_bucket", "ReliabilityBucket", "FUZZY_CALIB", "POINT_OP", "PLANNED", "reliability_bucket(p)", { inputs: 1 }),
  // ── SAFETY_OUTPUT (7) ──
  B("emit_score", "EmitScore", "SAFETY_OUTPUT", "OUTPUT", "KERNEL", "score = …", { inputs: 1, note: "root, outputType SCORE" }),
  B("emit_prob", "EmitProbabilityLike", "SAFETY_OUTPUT", "OUTPUT", "KERNEL", "p = …", { inputs: 1, note: "root, outputType PROBABILITY_LIKE (sigmoid sealed)" }),
  B("emit_ev", "EmitEVComponent", "SAFETY_OUTPUT", "OUTPUT", "KERNEL", "ev = …", { inputs: 1, note: "root, outputType EV_COMPONENT" }),
  B("kidi_guard", "KIDI Guard", "SAFETY_OUTPUT", "SAFETY", "KERNEL", "/* kidi */", { inputs: 1, guard: { kidi: true }, note: "always-on in evaluator" }),
  B("naninf_seal", "NaN/Inf Seal", "SAFETY_OUTPUT", "SAFETY", "KERNEL", "/* seal */", { inputs: 1, note: "always-on in evaluator" }),
  B("nolook_seal", "No-Lookahead Seal", "SAFETY_OUTPUT", "SAFETY", "KERNEL", "/* causal */", { inputs: 1, note: "structural: rolling ends at i" }),
  B("debug_trace", "DebugTrace", "SAFETY_OUTPUT", "SAFETY", "KERNEL", "/* trace */", { inputs: 1, note: "per-node series exposed by evaluator" }),
];

export const QUANT_BLOCK_BY_ID: Record<string, QuantBlockSpec> = Object.fromEntries(QUANT_BLOCKS.map((b) => [b.id, b]));
// ACTUAL counts derived from the registry (source of truth) — not the estimate above.
export const groupActual = (g: QuantBlockGroup) => QUANT_BLOCKS.filter((b) => b.group === g).length;
export const L3_BLOCK_COUNT = QUANT_BLOCKS.length;
export const KERNEL_COUNT = QUANT_BLOCKS.filter((b) => b.impl === "KERNEL").length;
export const PLANNED_COUNT = QUANT_BLOCKS.filter((b) => b.impl === "PLANNED").length;
export const LAYER_BLOCK_COUNT = { L1: 85, L2: 56, L3: L3_BLOCK_COUNT, TOTAL: 85 + 56 + L3_BLOCK_COUNT };
// every KERNEL op a block references must exist in the evaluator's OP_SPEC.
export const KERNEL_OPS_OK = QUANT_BLOCKS.filter((b) => b.impl === "KERNEL" && b.op).every((b) => b.op! in OP_SPEC);
