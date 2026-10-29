// realisticStrategySim — P0 realistic engine. SAME signal logic as legacy strategySim, but:
//  • signals run ONLY on design_tf bars (caller passes design_tf tape)        → no M1 spam
//  • decision at CLOSE of bar i, fill at OPEN of bar i+1 (next-open)           → no same-bar lookahead
//  • spread + commission + slippage applied per trade (GROSS vs NET)          → costs are first-class
//  • cooldown + max-trades/day + one-position                                 → realistic frequency
//  • event ledger + per-trade equity (FIXED_R / PERCENT_EQUITY)
// P0 resolves exits on design_tf OHLC (HTF heuristic). M1 intrabar path = DEFERRED_TO_P1.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { SimulatorRealismConfig, Timeframe, SizingMode } from "./simConfig.ts";
import type { SymbolSpec } from "./symbolSpec.ts";
import { getNextOpenFill, parseBarTime, newsWindow, classifySession, TF_MINUTES, type ParsedBarTime } from "./simTimeframe.ts";
import { makeRng, computeTradeCost, sessionSpread, type TradeCostBreakdown } from "./simCostModel.ts";
import { resolveIntrabarM1, type AmbiguityPolicy } from "./intrabarM1Resolver.ts";
import { evalEntryCustom, evalExitCustom, METRICS, type CustomModule, type Ctx } from "./customModule.ts";
import { resolveCustomMetrics } from "./customMetricBridge.ts";
import { resolveTriggerCoef, type TriggerCoefOverride } from "./coefficientCalibration.ts";
import { classicFlags, computeClassic, classicEntryVotes, classicGateBlocked, anyClassic, anyClassicTrigger, type ClassicSeries } from "./classicIndicators.ts";
import { computeSwingLevels, structureAt, percentile, type SwingLevel } from "./structureContext.ts";
import { pocDistAtrOf } from "./valueAreaProxy.ts";

export type Scenario = "LONG_SCENARIO" | "SHORT_SCENARIO";
export interface RealisticTradeResult {
  trade_id: string;
  card_id: string;
  design_tf: Timeframe;
  signal_time: string;
  fill_time: string;
  direction: Scenario;
  dir: "BUY" | "SELL";
  entry_mid: number;
  entry_effective: number;
  exit_mid?: number;
  exit_effective?: number;
  grossR: number;
  netR: number;
  costR: number;
  costBreakdown: TradeCostBreakdown;
  sizingMode: SizingMode;
  equityBefore: number;
  equityAfter: number;
  outcome: "TP" | "SL";
  entryI: number;
  exitI: number;
  hour: number; month: number; year: number;
  ambiguous: boolean;
  grossR_stopFirst: number;     // R if SL assumed first (conservative)  — P1 ambiguity scenarios
  grossR_tpFirst: number;       // R if TP assumed first (optimistic)
  m1Resolved: boolean;          // exit resolved by M1 intrabar path (P1) vs design-TF heuristic (P0)
  intrabarOutcome: string;
  blockedReason?: string;
  why?: string[];               // REAL entry rationale (triggers that fired + combine + gates passed + RR) — accurate, not a label
}
export type SimEventType =
  | "DATA_ACCEPTED" | "DATA_WARNING" | "SIGNAL_SEEN"
  | "SIGNAL_BLOCKED_COOLDOWN" | "SIGNAL_BLOCKED_DAILY_CAP" | "SIGNAL_BLOCKED_POSITION_OPEN"
  | "ORDER_INTENT_MODELED" | "FILL_MODELED" | "COST_APPLIED" | "POSITION_OPENED_MODELED"
  | "EXIT_TRIGGERED" | "TRADE_CLOSED" | "AMBIGUOUS_INTRABAR" | "RUN_COMPLETED";
export interface SimEvent { timestamp: string; bar_index: number; design_tf: Timeframe; symbol: string; card_id: string; event_type: SimEventType; reason: string }
export interface SimMarker { i: number; price: number; kind: "buy" | "sell" | "tp" | "sl" }

export interface RealisticSimResult {
  trades: RealisticTradeResult[];
  markers: SimMarker[];
  events: SimEvent[];
  signals_seen: number;
  signals_blocked_by_cooldown: number;
  signals_blocked_by_daily_cap: number;
  signals_blocked_by_existing_position: number;
  signals_blocked_by_drift_guard: number;     // drift_guard circuit-breaker halts (rolling own-PF < 0.6)
  actual_trades_taken: number;
  max_trades_per_day_breaches: number;
  ambiguous_intrabar_count: number;
  ambiguous_policy: AmbiguityPolicy;
  m1_resolution: boolean;       // true when exits resolved by M1 intrabar path (P1)
  m1_bars_scanned: number;
  final_equity: number;
  // Funding ruin: account blown mid-backtest (equity ≤ floor) → trading stops, run is a FAILURE
  ruined: boolean;
  ruin_time: string;
  ruin_trade_index: number;
  equity_at_ruin: number;
}

export interface RealisticSimOptions {
  cfg: SimulatorRealismConfig;
  spec: SymbolSpec;
  designTf: Timeframe;
  cardId: string;
  symbol: string;
  scenarioMult?: number;       // BASE=1 (analytics rescales LOW/STRESS without re-running)
  sizingModeOverride?: SizingMode;
  m1ByDesign?: OhlcBar[][];    // P1: M1 children per design bar → intrabar SL/TP resolution
  execByDesign?: OhlcBar[][];  // P1 (entry): execution_tf children per design bar → INTRABAR ENTRY (enter early inside the forming design bar, causal). Absent → entry stays on design_tf close (P0, unchanged).
  ambiguityPolicy?: AmbiguityPolicy;
  customModules?: CustomModule[];   // user-authored modules (template-constrained) executed by the interpreter
  coef?: TriggerCoefOverride;      // self-calibrated OR user-tuned trigger weights/reliabilities. ABSENT → DEFAULT_TRIGGER_COEF (historical values) → regression-identical.
}

function ema(vals: number[], p: number) { const k = 2 / (p + 1); const o: number[] = []; let prev = vals[0] ?? 0; vals.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); o.push(prev); }); return o; }
function rsiArr(c: number[], p = 14): number[] { const out = new Array(c.length).fill(50); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const ch = c[i] - c[i - 1], gg = ch > 0 ? ch : 0, ll = ch < 0 ? -ch : 0; if (i <= p) { g += gg; l += ll; if (i === p) { g /= p; l /= p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (p - 1) + gg) / p; l = (l * (p - 1) + ll) / p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return out; }
function atrArr(b: OhlcBar[], p = 14): number[] { const out = new Array(b.length).fill(0); let a = 0; for (let i = 1; i < b.length; i++) { const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); a = i <= p ? (a * (i - 1) + tr) / i : (a * (p - 1) + tr) / p; out[i] = a; } return out; }

// group execution_tf bars under each design bar (the bar whose [t, t+designMinutes) window contains them). Causal
// (time-window only). execByDesign[i] = the closed exec bars inside design bar i → fed to INTRABAR ENTRY.
const _ms = (t: string): number => Date.parse((t || "").replace(" ", "T") + (/(Z|[+-]\d\d:?\d\d)$/.test(t || "") ? "" : "Z"));
export function groupExecByDesign(designBars: OhlcBar[], execBars: OhlcBar[], designTf: Timeframe): OhlcBar[][] {
  const out: OhlcBar[][] = designBars.map(() => []);
  const span = (TF_MINUTES[designTf] || 60) * 60000;
  const dt = designBars.map((b) => _ms(b.t));
  let di = 0;
  for (const e of execBars) {
    const et = _ms(e.t);
    while (di + 1 < designBars.length && et >= dt[di + 1]) di++;
    if (di < designBars.length && et >= dt[di] && et < dt[di] + span) out[di].push(e);
  }
  return out;
}

// Previous-Session High/Low per bar — CAUSAL: level at bar i = the last COMPLETED session's extremes (assigned
// BEFORE folding bar i into the running session). Sessions by UTC hour: Asia 2-7 · London 7-12 · LN 12-16 ·
// NY 16-21 · Late 21-22 · Dead 22-2. Feeds the psl_sweep mean-reversion trigger.
function prevSessionLevels(bars: OhlcBar[]): { hi: number[]; lo: number[] } {
  const hi = new Array(bars.length).fill(NaN), lo = new Array(bars.length).fill(NaN);
  const sessKey = (h: number) => (h >= 22 || h < 2 ? "D" : h < 7 ? "A" : h < 12 ? "L" : h < 16 ? "O" : h < 21 ? "N" : "T");
  let curKey = ""; let curHi = -Infinity, curLo = Infinity; let pHi = NaN, pLo = NaN;
  for (let i = 0; i < bars.length; i++) {
    const h = +(bars[i].t.match(/T(\d{2}):/)?.[1] ?? 12);
    const key = sessKey(h) + "|" + bars[i].t.slice(0, 10);
    if (key !== curKey) { if (curHi > -Infinity) { pHi = curHi; pLo = curLo; } curKey = key; curHi = -Infinity; curLo = Infinity; }
    hi[i] = pHi; lo[i] = pLo;
    curHi = Math.max(curHi, bars[i].h); curLo = Math.min(curLo, bars[i].l);
  }
  return { hi, lo };
}

// HTF structure dirs from COMPLETED higher-TF buckets of the design bars (4× ≈ H1, 16× ≈ H4 khi design = M15).
// Causal: bucket đóng tại bar i thì hướng của nó dùng được từ close(i) — cùng chuẩn design-close của mọi trigger.
function htfStructureDirs(bars: OhlcBar[]): { d1: number[]; d4: number[] } {
  const mk = (group: number) => {
    const dirAt = new Array(bars.length).fill(0);
    const k10 = 2 / 11, k34 = 2 / 35; let e10 = 0, e34 = 0, count = 0;
    for (let i = 0; i < bars.length; i++) {
      if ((i + 1) % group === 0) {
        const c = bars[i].c; count++;
        e10 = count === 1 ? c : c * k10 + e10 * (1 - k10);
        e34 = count === 1 ? c : c * k34 + e34 * (1 - k34);
      }
      dirAt[i] = count >= 34 ? (e10 > e34 ? 1 : e10 < e34 ? -1 : 0) : 0;
    }
    return dirAt;
  };
  return { d1: mk(4), d4: mk(16) };
}

// Range PHIÊN Á (02-07 UTC) của CHÍNH ngày đó, chỉ hợp lệ SAU khi phiên Á đóng (causal): trước 7h → NaN;
// từ 7h → hi/lo phiên Á hôm nay. Feeds asia_range_fade (London/NY sweep phiên Á = stop-hunt playbook).
function asiaRangeLevels(bars: OhlcBar[]): { hi: number[]; lo: number[] } {
  const hi = new Array(bars.length).fill(NaN), lo = new Array(bars.length).fill(NaN);
  let day = ""; let aHi = -Infinity, aLo = Infinity; let fHi = NaN, fLo = NaN;
  for (let i = 0; i < bars.length; i++) {
    const d = bars[i].t.slice(0, 10); const h = +(bars[i].t.match(/T(\d{2}):/)?.[1] ?? 12);
    if (d !== day) { day = d; aHi = -Infinity; aLo = Infinity; fHi = NaN; fLo = NaN; }
    if (h >= 2 && h < 7) { aHi = Math.max(aHi, bars[i].h); aLo = Math.min(aLo, bars[i].l); }
    else if (h >= 7 && isNaN(fHi) && aHi > -Infinity) { fHi = aHi; fLo = aLo; }
    hi[i] = fHi; lo[i] = fLo;
  }
  return { hi, lo };
}

export function runRealisticSim(bars: OhlcBar[], modules: string[], autoRR: boolean, opts: RealisticSimOptions): RealisticSimResult {
  const { cfg, spec, designTf, cardId, symbol } = opts;
  const scenarioMult = opts.scenarioMult ?? 1;
  const sizingMode = opts.sizingModeOverride ?? cfg.risk.sizingMode;
  const m1ByDesign = opts.m1ByDesign;
  const execByDesign = opts.execByDesign;
  const intrabarEntry = !!execByDesign && (TF_MINUTES[cfg.executionTf] ?? 60) < (TF_MINUTES[designTf] ?? 60);   // P1 entry: ON only when an execution_tf finer than design_tf is provided → else design-close (P0) UNCHANGED
  const ambiguityPolicy: AmbiguityPolicy = opts.ambiguityPolicy ?? "MARK_AMBIGUOUS";
  const empty: RealisticSimResult = { trades: [], markers: [], events: [], signals_seen: 0, signals_blocked_by_cooldown: 0, signals_blocked_by_daily_cap: 0, signals_blocked_by_existing_position: 0, signals_blocked_by_drift_guard: 0, actual_trades_taken: 0, max_trades_per_day_breaches: 0, ambiguous_intrabar_count: 0, ambiguous_policy: ambiguityPolicy, m1_resolution: !!m1ByDesign, m1_bars_scanned: 0, final_equity: cfg.risk.initialEquity, ruined: false, ruin_time: "", ruin_trade_index: -1, equity_at_ruin: 0 };
  if (!bars || bars.length < 60) return empty;
  const equityFloor = 0;   // account blown when equity ≤ 0 (cannot cover the next loss)

  const mods = modules || []; const has = (id: string) => mods.includes(id);
  const closes = bars.map((b) => b.c);
  const e10 = ema(closes, 10), e34 = ema(closes, 34), rsi = rsiArr(closes), atr = atrArr(bars), atrSlow = ema(atr, 100);
  const cFlags = classicFlags(has);                                          // classic indicators (Ichimoku/MACD/Stoch/Bollinger/Fib/ADX)
  const cSeries: ClassicSeries | null = anyClassic(cFlags) ? computeClassic(bars, cFlags) : null;
  // advanced opt-in modules (all causal, only act when present)
  const hasSr = has("sr_zone_context"), hasLvlMem = has("level_memory"), hasDrift = has("drift_guard"), hasDistRR = has("distribution_rr");
  const swingLevels: SwingLevel[] | null = (hasSr || hasLvlMem) ? computeSwingLevels(bars) : null;
  const driftWin: number[] = []; const DRIFT_K = 15;                          // drift_guard: rolling own-PF circuit breaker
  const favHistATR: number[] = [], advHistATR: number[] = [];                 // distribution_rr: own past MFE/MAE (ATR units)
  const MAXHOLD = 28, MINRR = 1.3, TPCAP = 4;
  const useFusion = has("fusion"), useBayes = has("bayesian"), useEV = has("ev"), useAutoRR = autoRR || has("auto_rr");
  const hasTrend = has("trend_pullback") || has("ema_trend") || has("ema_slope");
  const hasRsi = has("rsi_reclaim") || has("rsi_value");
  const hasSweep = has("sweep_reclaim") || has("sweep_depth") || has("sweep_risk");
  const hasRange = has("range_fade");
  const hasMtfConfirm = has("mtf_confirm");   // F1 CONFIRMATION: scales EXISTING vote weights by MTF slope agreement — NEVER creates a vote (no candidate authority)
  const lnLR = (rel: number) => Math.log(rel / (1 - rel));
  const hasPslSweep = has("psl_sweep");   // NEW mean-reversion attacker: sweep Previous-Session High/Low + reclaim (additive)
  const psl = hasPslSweep ? prevSessionLevels(bars) : null;
  const hasVolContraction = has("vol_contraction");   // raw-alpha hunt: chỉ bắn khi biên độ NÉN cực đại rồi bung khỏi hộp
  const hasHtfAnchor = has("htf_anchor");             // raw-alpha hunt: M15 pullback CHỈ khi H1+H4 đồng pha cấu trúc
  const htf = hasHtfAnchor ? htfStructureDirs(bars) : null;
  const hasAsiaFade = has("asia_range_fade");         // hunt v2: London/NY quét range PHIÊN Á rồi đóng lại trong → fade
  const asia = hasAsiaFade ? asiaRangeLevels(bars) : null;
  const hasWickExtreme = has("wick_extreme");         // hunt v2: nến kiệt sức (range>2ATR, bấc ≥60%) → fade hướng bấc
  const hasGapFade = has("gap_fade");                 // hunt v2: gap mở nến >0.6 ATR → fade về close trước
  const hasRsiExtreme = has("rsi_extreme");           // hunt v2: RSI cực trị (22/78) quay đầu → mean-revert
  const hasFbRange = has("fb_range_fade");            // FALLBACK role (V2): range-fade dự phòng — CHỈ nói khi attacker im lặng
  const hasBreakRetest = has("break_retest");         // Break & Retest: phá mốc 20 nến → mức GIỮ → retest bật lại (owner 2026-07-03)
  const TC = resolveTriggerCoef(opts.coef);   // trigger weights/reliabilities — ABSENT → historical defaults (regression-identical)
  const cooldown = cfg.discipline.cooldownBars[designTf] ?? 0;
  const dayCap = cfg.discipline.maxTradesPerDay[designTf] ?? 9999;
  const rng = makeRng((cfg.seed ?? 42) ^ (designTf.length * 131));

  const res: RealisticSimResult = { ...empty, trades: [], markers: [], events: [] };
  let equity = cfg.risk.initialEquity;
  let regime = 0, persist = 0, belowRun = 0, armed = false, armedAge = 0;
  let evWins = 0, evLoss = 0, evSumWin = 0, evSumLoss = 0;
  // ev_rolling — bản sửa của `ev` (bẫy deadlock đo được 2026-07-02: ev CỘNG DỒN không decay → một lần EV≤0 là
  // khoá TỚI HẾT cửa sổ vì stats đóng băng → Y10 25 lệnh < M6 574 lệnh). ev_rolling: cửa sổ 20 lệnh gần nhất +
  // đang khoá quá 400 nến thì RESET stats (probation — cho chiến lược cơ hội chứng minh lại). Additive.
  const useEvRolling = has("ev_rolling");
  const evRoll: number[] = []; let evBlockedSince = -1;
  const convBuf: number[] = [];
  let pos: { dir: "BUY" | "SELL"; entry: number; sl: number; risk: number; tp: number | null; entryI: number; signalI: number; signalTime: string; fillTime: string; maxR: number; atrEntry: number; favExc: number; advExc: number; why: string[] } | null = null;
  let cooldownUntil = -1, curDay = "", tradesToday = 0, tid = 0;
  // BUGFIX (manager-approved): filter thiếu "CONFIRM" → mọi module CONFIRM bị loại khỏi engine HOÀN TOÀN (câm) dù
  // sandbox hiện nó bắn — phá nhất quán sandbox↔engine. CONFIRM = weight-authority (evalEntryCustom → confirmBoost
  // scale weight vote, KHÔNG tự tạo vote/lệnh). Card không có CONFIRM → customMods y hệt cũ → byte-identical.
  const customMods = (opts.customModules || []).filter((m) => ["SAFETY_VETO", "CONTEXT_GATE", "TRIGGER", "VETO", "CONFIRM", "EXIT"].includes(m.role));
  const hasCustomTrigger = customMods.some((m) => m.role === "TRIGGER");   // custom L5 TRIGGER = trigger THẬT của card → chặn EMA-default fallback (nếu không, engine chạy EMA-cross đè lên trigger của user)
  let peakEquity = equity, dayLossCount = 0, dayPnlR = 0, lastExitI = -999;
  const hi20 = (i: number) => { let h = -Infinity; for (let k = Math.max(0, i - 20); k < i; k++) if (bars[k].h > h) h = bars[k].h; return h; };
  const lo20 = (i: number) => { let l = Infinity; for (let k = Math.max(0, i - 20); k < i; k++) if (bars[k].l < l) l = bars[k].l; return l; };
  // F4 block imports (additive — chỉ tính khi card CÓ custom module; baseline byte-identical):
  // flowConsistency = độ nhất quán hướng thân nến 8 nến gần (QTQ CF-rhythm block) · htfAlign = tổng cấu trúc HTF
  // 4×+16× (QTQ mtf agreement block, tái dùng htfStructureDirs causal) · pocDistAtr = khoảng cách tới POC 96 nến
  // (mfe_observers/price_concentration block, histogram bin 0.25 ATR).
  const htfCustom = customMods.length ? htfStructureDirs(bars) : null;
  // [[block-is-fixed-foundation-doctrine]] CẦU EVIDENCE→DECISION: điều kiện L4/L5 trỏ id module L1/L2/L3 ĐÃ BUILD →
  // chuỗi block-computed (evalGraph/l2ModuleSeries/evaluateSeries) inject vào ctx như metric HẠNG NHẤT (đồng hạng 29
  // built-in). Additive + GATED: card không trỏ evidence (chỉ 29 catalog) → map RỖNG → entryCtx byte-identical với card cũ.
  const _catalog = new Set(METRICS.map((mt) => mt.key));
  const _cmRefs = customMods.flatMap((m) => (m.conditions || []).map((c) => c.metric));
  const customMetricMap = customMods.length ? resolveCustomMetrics(_cmRefs, _catalog, bars) : {};
  const _cmKeys = Object.keys(customMetricMap);
  const cmAt = (i: number): Record<string, number> => { if (!_cmKeys.length) return {}; const o: Record<string, number> = {}; for (const k of _cmKeys) o[k] = customMetricMap[k][i] ?? 0; return o; };
  const flowConsistencyAt = (i: number) => { let up = 0, n = 0; for (let k = Math.max(1, i - 7); k <= i; k++) { if (bars[k].c !== bars[k].o) { n++; if (bars[k].c > bars[k].o) up++; } } return n ? Math.max(up, n - up) / n : 0; };
  // WO VALUE_AREA_PROXY_V1: vòng lặp histogram cục bộ chuyển về valueAreaProxy.ts (NƠI DUY NHẤT dựng histogram);
  // số học GIỐNG HỆT — guard bởi valueAreaProxy.harness.ts (reference-impl verbatim, tolerance 0).
  const pocDistAtrAt = (i: number, a: number) => pocDistAtrOf(bars, i, a);
  // F5 blocks (owner 2026-07-03, Break&Retest family): candleDirAt = bộ nhận diện nến L1 (Nhấn chìm → Búa/Sao băng
  // → Pin bar; nến < 0.5 ATR = nhiễu, bỏ) trả +1/−1/0 · extAtr = giá đã chạy QUA mốc 20 nến bao xa (×ATR, 0 khi
  // còn trong biên) — nguyên liệu cho No-Chase guard chống mua/bán ngay đỉnh extension của breakout.
  const candleDirAt = (i: number, a: number): number => {
    if (i < 1 || !(a > 0)) return 0;
    const b2 = bars[i], p2 = bars[i - 1];
    const rng2 = b2.h - b2.l, body2 = Math.abs(b2.c - b2.o), bodyP = Math.abs(p2.c - p2.o);
    // Nhấn chìm (2 nến, mạnh nhất): thân ≥0.3 ATR, ngược màu, phủ trọn thân nến trước
    if (body2 >= 0.3 * a && bodyP > 0) {
      if (p2.c < p2.o && b2.c > b2.o && b2.c >= Math.max(p2.o, p2.c) && b2.o <= Math.min(p2.o, p2.c)) return 1;
      if (p2.c > p2.o && b2.c < b2.o && b2.c <= Math.min(p2.o, p2.c) && b2.o >= Math.max(p2.o, p2.c)) return -1;
    }
    if (rng2 < 0.5 * a || body2 <= 0) return 0;
    const upW = b2.h - Math.max(b2.o, b2.c), loW = Math.min(b2.o, b2.c) - b2.l;
    // Búa / Sao băng: bấc ≥2× thân, thân dồn về third đối diện
    if (loW >= 2 * body2 && upW <= body2 && Math.min(b2.o, b2.c) >= b2.h - rng2 / 3) return 1;
    if (upW >= 2 * body2 && loW <= body2 && Math.max(b2.o, b2.c) <= b2.l + rng2 / 3) return -1;
    // Pin bar: bấc một phía ≥ 2/3 nến, open+close cùng third đối diện
    if (loW / rng2 >= 2 / 3 && Math.min(b2.o, b2.c) >= b2.h - rng2 / 3) return 1;
    if (upW / rng2 >= 2 / 3 && Math.max(b2.o, b2.c) <= b2.l + rng2 / 3) return -1;
    return 0;
  };
  const entryCtx = (i: number, b: OhlcBar, hour: number, votesLen: number, votesDir: number): Ctx => {
    const a = atr[i] || 1; const sess = classifySession(hour, +(b.t.slice(14, 16)) || 0);
    const rng = b.h - b.l; const body = Math.abs(b.c - b.o);   // F3 blocks: wick/body ratios of the entry bar (additive keys)
    return { price: b.c, rsi: rsi[i], regime, hour, overlap: sess === "overlap" ? 1 : 0, spread: sessionSpread(sess, newsWindow(b.t), cfg.cost), atrPct: a / b.c * 100, atrRatio: a / (atrSlow[i] || a), emaGapAtr: (e10[i] - e34[i]) / a, priceEmaAtr: (b.c - e10[i]) / a, brokeHigh20: b.c > hi20(i) ? 1 : 0, brokeLow20: b.c < lo20(i) ? 1 : 0, wickRatio: rng > 0 ? +((rng - body) / rng).toFixed(3) : 0, bodyRatio: rng > 0 ? +(body / rng).toFixed(3) : 0, voteCount: votesLen, voteDir: votesDir, ddPct: peakEquity > 0 ? (equity - peakEquity) / peakEquity * 100 : 0, dayLosses: dayLossCount, dayPnlR: +dayPnlR.toFixed(2), barsSinceTrade: i - lastExitI, flowConsistency: +flowConsistencyAt(i).toFixed(3), htfAlign: htfCustom ? htfCustom.d1[i] + htfCustom.d4[i] : 0, pocDistAtr: +pocDistAtrAt(i, a).toFixed(3), extAtr: +(b.c > hi20(i) ? (b.c - hi20(i)) / a : b.c < lo20(i) ? (lo20(i) - b.c) / a : 0).toFixed(3), candleDir: candleDirAt(i, a), candleAlign: candleDirAt(i, a) * Math.sign(votesDir), ...cmAt(i) };   // ...cmAt = metric block-native (rỗng nếu card không trỏ evidence → byte-identical)
  };
  const ev = (bar_index: number, event_type: SimEventType, reason: string) => res.events.push({ timestamp: bars[Math.min(bar_index, bars.length - 1)]?.t || "", bar_index, design_tf: designTf, symbol, card_id: cardId, event_type, reason });

  // ── P1 INTRABAR ENTRY (execution_tf) ── try to open a position on a CLOSED exec bar INSIDE design bar i, using
  // context asOf the last CLOSED design bar (i-1) → enter EARLY without waiting for the design bar to close. Causal
  // (only closed exec bars + design levels ≤ i-1; never reads bar i's close). v1 covers the RECLAIM triggers
  // (trend pullback + sweep); classic/rsi/range keep design-close. Exits stay design-tf/M1 (entry is the v1 feature).
  // ONLY runs when execByDesign is provided + exec<design → existing cards are byte-identical (regression-safe).
  function tryIntrabarEntry(i: number, regP: number, pt: ParsedBarTime): void {
    const lvl = i - 1; if (lvl < 40) return;
    const exb = execByDesign![i]; if (!exb || !exb.length) return;
    const e10L = e10[lvl], e34L = e34[lvl], atrL = atr[lvl] || 1, atrSlowL = atrSlow[lvl] || atrL;
    const up = regP > 0, dn = regP < 0;
    const w20 = bars.slice(Math.max(0, i - 20), i); const lo20v = Math.min(...w20.map((x) => x.l)), hi20v = Math.max(...w20.map((x) => x.h));
    const useStruct = useAutoRR || hasDistRR;
    for (const eb of exb) {
      const votes: { dir: number; w: number; why: string }[] = [];
      if (hasTrend) {
        if (up && eb.l <= e10L && eb.c > e10L) votes.push({ dir: 1, w: TC.trend.w, why: "Trend Pullback intrabar (execution_tf): chạm EMA design rồi đóng lại TRÊN (↑)" });
        if (dn && eb.h >= e10L && eb.c < e10L) votes.push({ dir: -1, w: TC.trend.w, why: "Trend Pullback intrabar (execution_tf): chạm EMA design rồi đóng lại DƯỚI (↓)" });
      }
      if (hasSweep) {
        if (eb.l < lo20v && eb.c > lo20v) votes.push({ dir: 1, w: TC.sweep.w, why: `Sweep Reclaim intrabar (execution_tf): quét ĐÁY 20-cây design (${lo20v.toFixed(2)}) rồi đóng lại TRÊN (↑)` });
        if (eb.h > hi20v && eb.c < hi20v) votes.push({ dir: -1, w: TC.sweep.w, why: `Sweep Reclaim intrabar (execution_tf): quét ĐỈNH 20-cây design (${hi20v.toFixed(2)}) rồi đóng lại DƯỚI (↓)` });
      }
      if (!votes.length) continue;
      const score = votes.reduce((a, v) => a + v.dir * v.w, 0), sum = votes.reduce((a, v) => a + v.dir, 0);
      const dir: "BUY" | "SELL" | null = useFusion ? (Math.abs(score) >= TC.fusionThreshold ? (score > 0 ? "BUY" : "SELL") : null) : sum > 0 ? "BUY" : sum < 0 ? "SELL" : null;
      if (!dir) continue;
      const ds = dir === "BUY" ? 1 : -1;
      const ph = +(eb.t.slice(11, 13)) || pt.h;
      if (has("regime_ctx") && regP !== ds) continue;
      if (has("session_ctx") && (ph < 7 || ph >= 21)) continue;
      if (has("dead_hour") && (ph >= 22 || ph < 2)) continue;
      if (has("news_ctx") && newsWindow(eb.t)) continue;
      if (has("no_trade_chop") && Math.abs(e10L - e34L) < 0.15 * atrL) continue;
      if ((has("atr_vol") || has("atr_pct")) && atrL < 0.65 * atrSlowL) continue;
      if (i <= cooldownUntil) { res.signals_blocked_by_cooldown++; continue; }
      if (tradesToday >= dayCap) { res.signals_blocked_by_daily_cap++; res.max_trades_per_day_breaches++; continue; }
      const entry = eb.c, a = atrL;
      let sl: number, tp: number | null, risk: number;
      if (useStruct) {
        const w5 = bars.slice(Math.max(0, i - 5), i), ww20 = bars.slice(Math.max(0, i - 20), i);
        sl = dir === "BUY" ? Math.min(...w5.map((x) => x.l), entry) - 0.1 * a : Math.max(...w5.map((x) => x.h), entry) + 0.1 * a;
        tp = dir === "BUY" ? Math.max(...ww20.map((x) => x.h)) : Math.min(...ww20.map((x) => x.l));
        risk = Math.abs(entry - sl); const rew = Math.abs(tp - entry);
        if (risk <= 0 || rew / risk < MINRR) continue;
      } else { sl = dir === "BUY" ? entry - a : entry + a; tp = null; risk = a; }
      const floor = (cfg.minStopAtrK ?? 0) * a;
      if (floor > 0 && risk < floor) { risk = floor; sl = dir === "BUY" ? entry - floor : entry + floor; }
      res.signals_seen++;
      const why = [...votes.filter((v) => v.dir === ds).map((v) => "▸ " + v.why), `⚙ Intrabar entry (execution_tf ${cfg.executionTf} trong ${designTf}) → ${dir}`,
        ...(has("regime_ctx") ? [`✓ Regime khớp ${dir}`] : []), ...(has("session_ctx") ? [`✓ Session ${ph}h (7–21 UTC)`] : []),
        useStruct ? `🎯 ${hasDistRR ? "Distribution" : "Auto"} R:R intrabar — SL=${sl.toFixed(2)}, TP=${tp != null ? tp.toFixed(2) : "—"}` : "🎯 Fixed risk — SL=1·ATR, TP-cap +4R"];
      pos = { dir, entry, sl, risk, tp, entryI: i, signalI: i, signalTime: eb.t, fillTime: eb.t, maxR: 0, atrEntry: a, favExc: 0, advExc: 0, why };
      res.markers.push({ i, price: entry, kind: dir === "BUY" ? "buy" : "sell" });
      res.actual_trades_taken++; tradesToday++;
      ev(i, "POSITION_OPENED_MODELED", `intrabar ${dir} @ ${entry} (execution_tf ${cfg.executionTf})`);
      return;   // one position
    }
  }

  for (let i = 40; i < bars.length - 1; i++) {
    if (res.ruined) break;                       // account blown → stop trading
    const b = bars[i], pb = bars[i - 1];
    const regimePrev = regime;                   // regime asOf bar i-1 (BEFORE this bar's update) — for causal intrabar entry
    const r = e10[i] > e34[i] ? 1 : e10[i] < e34[i] ? -1 : 0;
    if (r === regime) persist++; else { regime = r; persist = 1; }
    if ((regime > 0 && b.c < e10[i]) || (regime < 0 && b.c > e10[i])) belowRun++; else belowRun = 0;
    if (belowRun >= 2) { armed = true; armedAge = 0; } else if (armed) { armedAge++; if (armedAge > 4) armed = false; }

    // ── exit: M1 intrabar path if provided (P1), else design_tf OHLC heuristic (P0) ──
    if (pos) {
      const held = i - pos.entryI; let exit: number | null = null, grossR = 0, isStop = false, ambiguous = false;
      let gStop = 0, gTp = 0, m1Resolved = false, intrabarOutcome = "";
      { const favR = (pos.dir === "BUY" ? b.h - pos.entry : pos.entry - b.l) / pos.risk; if (favR > pos.maxR) pos.maxR = favR; }
      if (hasDistRR) { const fav = pos.dir === "BUY" ? b.h - pos.entry : pos.entry - b.l; const adv = pos.dir === "BUY" ? pos.entry - b.l : b.h - pos.entry; if (fav > pos.favExc) pos.favExc = fav; if (adv > pos.advExc) pos.advExc = adv; }
      const rOf = (px: number) => (pos!.dir === "BUY" ? px - pos!.entry : pos!.entry - px) / pos!.risk;
      const effTp = pos.tp != null ? pos.tp : (pos.dir === "BUY" ? pos.entry + TPCAP * pos.risk : pos.entry - TPCAP * pos.risk);
      const m1kids = m1ByDesign ? (m1ByDesign[i] || null) : null;
      if (m1kids && m1kids.length) {
        const rr = resolveIntrabarM1(pos.dir, pos.sl, effTp, m1kids, ambiguityPolicy);
        res.m1_bars_scanned += rr.m1BarsScanned;
        if (rr.outcome !== "NO_TOUCH") {
          m1Resolved = true; intrabarOutcome = rr.outcome; isStop = rr.outcome === "SL_FIRST" || rr.outcome === "GAP_THROUGH_SL";
          if (rr.ambiguous) {
            ambiguous = true; res.ambiguous_intrabar_count++; ev(i, "AMBIGUOUS_INTRABAR", "SL&TP in one M1 candle — policy " + ambiguityPolicy);
            gStop = rOf(pos.sl); gTp = rOf(effTp);   // rOf(sl): SL nguyên gốc = −1 y hệt; SL đã DỜI (BE/LOCK_SL) = giá trị thật (fix accounting bug 2026-07-02)
            grossR = ambiguityPolicy === "OPTIMISTIC_TP_FIRST" ? gTp : gStop;
            exit = ambiguityPolicy === "OPTIMISTIC_TP_FIRST" ? effTp : pos.sl;
          } else { exit = rr.exitPrice!; grossR = rOf(exit); gStop = grossR; gTp = grossR; }
        }
      } else {
        const slHit = pos.dir === "BUY" ? b.l <= pos.sl : b.h >= pos.sl;
        const tpHit = pos.dir === "BUY" ? b.h >= effTp : b.l <= effTp;
        if (slHit && tpHit) { ambiguous = true; res.ambiguous_intrabar_count++; ev(i, "AMBIGUOUS_INTRABAR", "SL & TP both in one design bar → conservative stop-first (M1/tick for exact)"); }
        if (slHit) { exit = pos.sl; grossR = rOf(pos.sl); isStop = true; gStop = grossR; gTp = rOf(effTp); }   // rOf(sl): nguyên gốc = −1; SL đã dời (BE/LOCK) = giá trị thật
        else if (tpHit) { exit = effTp; grossR = rOf(effTp); gStop = grossR; gTp = grossR; }
      }
      if (exit == null) {
        // mr_exit — exit kiểu MEAN-REVERSION (owner: "TP về mid thay vì RR kiểu trend"): vào ở mép bị quét,
        // chốt khi giá HỒI VỀ TRUNG BÌNH (close chạm lại EMA10) và đang có lãi. Additive, opt-in.
        if (has("mr_exit") && held >= 1) {
          const backAtMean = pos.dir === "BUY" ? b.c >= e10[i] : b.c <= e10[i];
          if (backAtMean && rOf(b.c) > 0) { exit = b.c; grossR = rOf(b.c); gStop = grossR; gTp = grossR; }
        }
        const weak = exit == null && has("exit_weak") && (pos.dir === "BUY" ? (e10[i] < e34[i] || rsi[i] < 42) : (e10[i] > e34[i] || rsi[i] > 58));
        if (weak && held >= 2) { exit = b.c; grossR = rOf(b.c); gStop = grossR; gTp = grossR; }
        else if (held >= MAXHOLD) { exit = b.c; grossR = rOf(b.c); gStop = grossR; gTp = grossR; }
      }
      if (exit == null && customMods.length) {   // custom user EXIT modules (close / break-even / LOCK_SL protective)
        const a = atr[i] || 1; const curR = (pos.dir === "BUY" ? b.c - pos.entry : pos.entry - b.c) / pos.risk;
        const rngX = b.h - b.l; const bodyX = Math.abs(b.c - b.o);
        const ce = evalExitCustom({ heldBars: held, rMultiple: curR, maxR: pos.maxR, rsi: rsi[i], regime, priceEmaAtr: (b.c - e10[i]) / a, atrPct: a / b.c * 100, atrRatio: a / (atrSlow[i] || a), wickRatio: rngX > 0 ? (rngX - bodyX) / rngX : 0, bodyRatio: rngX > 0 ? bodyX / rngX : 0, price: b.c, ...cmAt(i) }, customMods);
        if (ce.breakeven) pos.sl = pos.entry;
        // LOCK_SL — PROTECTIVE-ONLY: SL chỉ được siết về phía lãi (BUY: nâng lên, SELL: hạ xuống), không bao giờ nới.
        if (ce.lockR != null) {
          const lockPx = pos.dir === "BUY" ? pos.entry + ce.lockR * pos.risk : pos.entry - ce.lockR * pos.risk;
          pos.sl = pos.dir === "BUY" ? Math.max(pos.sl, lockPx) : Math.min(pos.sl, lockPx);
        }
        if (ce.close) { exit = b.c; grossR = rOf(b.c); gStop = grossR; gTp = grossR; intrabarOutcome = "CUSTOM_EXIT"; }
      }
      if (exit != null) {
        grossR = +grossR.toFixed(4); gStop = +gStop.toFixed(4); gTp = +gTp.toFixed(4);
        if (grossR >= 0) { evWins++; evSumWin += grossR; } else { evLoss++; evSumLoss += Math.abs(grossR); }
        if (useEvRolling) { evRoll.push(grossR); if (evRoll.length > 20) evRoll.shift(); }
        const cost = computeTradeCost({ entryTime: pos.fillTime, exitTime: b.t, atr: atr[i] || atr[pos.entryI] || 1, riskPrice: pos.risk, isStopExit: isStop, dir: pos.dir, cost: cfg.cost, spec, rng, scenarioMult });
        const netR = +(grossR - cost.totalCostR).toFixed(4);
        const equityBefore = equity;
        const riskAmt = sizingMode === "PERCENT_EQUITY" ? equity * (cfg.risk.riskPctEquity / 100) : cfg.risk.fixedRValue;
        equity = +(equity + netR * riskAmt).toFixed(2);
        if (equity > peakEquity) peakEquity = equity;
        dayPnlR += netR; if (netR < 0) dayLossCount++; lastExitI = i;
        driftWin.push(netR); if (driftWin.length > DRIFT_K) driftWin.shift();
        if (hasDistRR) { favHistATR.push(pos.favExc / (pos.atrEntry || 1)); advHistATR.push(pos.advExc / (pos.atrEntry || 1)); }
        const pt = parseBarTime(pos.signalTime);
        const half = cost.spreadCostPrice / 2;
        ev(i, "EXIT_TRIGGERED", m1Resolved ? "M1:" + intrabarOutcome : isStop ? "SL" : grossR >= 0 ? "TP/target" : "time/weak exit");
        ev(i, "COST_APPLIED", `costR=${cost.totalCostR.toFixed(3)} (${cost.costStatus})`);
        res.trades.push({
          trade_id: `${cardId}#${++tid}`, card_id: cardId, design_tf: designTf,
          signal_time: pos.signalTime, fill_time: pos.fillTime,
          direction: pos.dir === "BUY" ? "LONG_SCENARIO" : "SHORT_SCENARIO", dir: pos.dir,
          entry_mid: pos.entry, entry_effective: +(pos.entry + (pos.dir === "BUY" ? half : -half)).toFixed(2),
          exit_mid: exit, exit_effective: +(exit + (pos.dir === "BUY" ? -half : half)).toFixed(2),
          grossR, netR, costR: +cost.totalCostR.toFixed(4), costBreakdown: cost, sizingMode,
          equityBefore, equityAfter: equity, outcome: grossR >= 0 ? "TP" : "SL",
          entryI: pos.entryI, exitI: i, hour: pt.h, month: pt.mo, year: pt.y, ambiguous,
          grossR_stopFirst: gStop, grossR_tpFirst: gTp, m1Resolved, intrabarOutcome, why: pos.why,
        });
        res.markers.push({ i, price: exit, kind: grossR >= 0 ? "tp" : "sl" });
        ev(i, "TRADE_CLOSED", `grossR=${grossR} netR=${netR}`);
        cooldownUntil = i + cooldown;
        pos = null;
        if (!res.ruined && equity <= equityFloor) { res.ruined = true; res.ruin_time = b.t; res.ruin_trade_index = res.trades.length; res.equity_at_ruin = equity; ev(i, "RUN_COMPLETED", "ACCOUNT_BLOWN — equity " + equity + " ≤ floor; trading stopped"); }
      }
    }

    // ── entry: decide at close i, fill at open i+1 ──
    if (!pos) {
      if (res.ruined) continue;                  // no capital left → no new trades
      const pt = parseBarTime(b.t);
      if (pt.dateKey !== curDay) { curDay = pt.dateKey; tradesToday = 0; dayLossCount = 0; dayPnlR = 0; }
      if (intrabarEntry) { tryIntrabarEntry(i, regimePrev, pt); if (pos) continue; }   // P1: try EARLY entry on an exec bar inside this design bar; else fall through to design-close
      const up = regime > 0, dn = regime < 0;
      // each vote carries WHY (which trigger fired) — so the entry rationale is the REAL vote source, not a guessed label.
      const votes: { dir: number; w: number; rel: number; why: string }[] = [];
      // EMA-cross default CHỈ khi card KHÔNG có trigger NÀO — built-in HAY custom. (BUG cũ: quên !hasCustomTrigger →
      // card có custom trigger vẫn bị EMA-default đè lên → trigger của user vô hiệu, ablation báo "no trigger" + NEUTRAL.)
      if (!hasTrend && !hasRsi && !hasSweep && !hasRange && !hasPslSweep && !hasVolContraction && !hasHtfAnchor && !hasAsiaFade && !hasWickExtreme && !hasGapFade && !hasRsiExtreme && !hasFbRange && !hasBreakRetest && !anyClassicTrigger(cFlags) && !hasCustomTrigger) {
        if (e10[i] > e34[i] && e10[i - 1] <= e34[i - 1]) votes.push({ dir: 1, w: TC.emaDefault.w, rel: TC.emaDefault.rel, why: "EMA10 cắt LÊN EMA34 (↑) — card KHÔNG có module trigger nên dùng cross mặc định" });
        if (e10[i] < e34[i] && e10[i - 1] >= e34[i - 1]) votes.push({ dir: -1, w: TC.emaDefault.w, rel: TC.emaDefault.rel, why: "EMA10 cắt XUỐNG EMA34 (↓) — card KHÔNG có module trigger nên dùng cross mặc định" });
      } else {
        if (hasTrend) { if (up && pb.l <= e10[i - 1] && b.c > e10[i]) votes.push({ dir: 1, w: TC.trend.w, rel: TC.trend.rel, why: "Trend Pullback: uptrend · giá hồi chạm EMA10 rồi đóng lại TRÊN (↑)" }); if (dn && pb.h >= e10[i - 1] && b.c < e10[i]) votes.push({ dir: -1, w: TC.trend.w, rel: TC.trend.rel, why: "Trend Pullback: downtrend · giá hồi chạm EMA10 rồi đóng lại DƯỚI (↓)" }); }
        if (hasRsi) { if (rsi[i - 1] < 35 && rsi[i] >= 35) votes.push({ dir: 1, w: TC.rsi.w, rel: TC.rsi.rel, why: `RSI Reclaim: RSI cắt LÊN 35 từ quá-bán (${rsi[i].toFixed(0)}) (↑)` }); if (rsi[i - 1] > 65 && rsi[i] <= 65) votes.push({ dir: -1, w: TC.rsi.w, rel: TC.rsi.rel, why: `RSI Reclaim: RSI cắt XUỐNG 65 từ quá-mua (${rsi[i].toFixed(0)}) (↓)` }); }
        if (hasSweep) { const w = bars.slice(Math.max(0, i - 20), i); const lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h)); if (b.l < lo && b.c > lo) votes.push({ dir: 1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Sweep Reclaim: quét ĐÁY 20-nến (${lo.toFixed(2)}) rồi đóng lại TRÊN (↑)` }); if (b.h > hi && b.c < hi) votes.push({ dir: -1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Sweep Reclaim: quét ĐỈNH 20-nến (${hi.toFixed(2)}) rồi đóng lại DƯỚI (↓)` }); }
        if (hasRange) { const w = bars.slice(Math.max(0, i - 20), i); const lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h)); if (b.h >= hi) votes.push({ dir: -1, w: TC.range.w, rel: TC.range.rel, why: `Range Fade: chạm BIÊN TRÊN range (${hi.toFixed(2)}) → fade (↓)` }); if (b.l <= lo) votes.push({ dir: 1, w: TC.range.w, rel: TC.range.rel, why: `Range Fade: chạm BIÊN DƯỚI range (${lo.toFixed(2)}) → fade (↑)` }); }
        // PSL Sweep — mean reversion theo mốc phiên: quét thủng High/Low PHIÊN TRƯỚC rồi đóng lại trong (đi cùng
        // nhịp stop-hunt của vàng M15). Causal: mốc là phiên đã ĐÓNG (prevSessionLevels gán trước khi cộng bar i).
        if (hasPslSweep && psl && !isNaN(psl.lo[i])) {
          if (b.l < psl.lo[i] && b.c > psl.lo[i]) votes.push({ dir: 1, w: TC.sweep.w, rel: TC.sweep.rel, why: `PSL Sweep: quét ĐÁY phiên trước (${psl.lo[i].toFixed(2)}) rồi đóng lại TRÊN (↑)` });
          if (b.h > psl.hi[i] && b.c < psl.hi[i]) votes.push({ dir: -1, w: TC.sweep.w, rel: TC.sweep.rel, why: `PSL Sweep: quét ĐỈNH phiên trước (${psl.hi[i].toFixed(2)}) rồi đóng lại DƯỚI (↓)` });
        }
        // Vol-Contraction — chỉ khi hộp 12 nến TRƯỚC nén cực đại (kép: box < 1.2 ATR và ATR < 0.8 ATR-chậm) rồi
        // close BUNG khỏi hộp. Hiếm khi bắn → ép số lệnh xuống. Causal: hộp kết thúc ở i−1.
        if (hasVolContraction && i > 14) {
          let bhi = -Infinity, blo = Infinity;
          for (let k = i - 12; k < i; k++) { if (bars[k].h > bhi) bhi = bars[k].h; if (bars[k].l < blo) blo = bars[k].l; }
          if (bhi - blo < 1.5 * (atrSlow[i] || atr[i])) {   // nén so với ATR NỀN (breakout bar tự đẩy ATR hiện tại lên → không dùng nó làm điều kiện)
            if (b.c > bhi) votes.push({ dir: 1, w: TC.trend.w, rel: TC.trend.rel, why: `Vol-Contraction: nén ${(bhi - blo).toFixed(2)} (<1.2 ATR) rồi BUNG LÊN khỏi hộp (↑)` });
            if (b.c < blo) votes.push({ dir: -1, w: TC.trend.w, rel: TC.trend.rel, why: `Vol-Contraction: nén ${(bhi - blo).toFixed(2)} rồi BUNG XUỐNG khỏi hộp (↓)` });
          }
        }
        // Asia-Range Fade — trong London/NY (7-21h): quét thủng range PHIÊN Á ĐÃ ĐÓNG của hôm nay rồi close lại trong → fade.
        if (hasAsiaFade && asia && !isNaN(asia.lo[i]) && pt.h >= 7 && pt.h < 21) {
          if (b.h > asia.hi[i] && b.c < asia.hi[i]) votes.push({ dir: -1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Asia-Range Fade: quét ĐỈNH range Á (${asia.hi[i].toFixed(2)}) rồi đóng lại DƯỚI (↓)` });
          if (b.l < asia.lo[i] && b.c > asia.lo[i]) votes.push({ dir: 1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Asia-Range Fade: quét ĐÁY range Á (${asia.lo[i].toFixed(2)}) rồi đóng lại TRÊN (↑)` });
        }
        // Wick-Extreme — nến kiệt sức: range > 2 ATR + bấc một phía ≥ 60% range + close ở third đối diện → fade hướng bấc.
        if (hasWickExtreme) {
          const rng = b.h - b.l;
          if (rng > 2 * atr[i]) {
            const upW = b.h - Math.max(b.o, b.c), loW = Math.min(b.o, b.c) - b.l;
            if (upW / rng >= 0.6 && b.c <= b.l + rng / 3) votes.push({ dir: -1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Wick-Extreme: bấc trên ${(upW / rng * 100).toFixed(0)}% của nến ${(rng / atr[i]).toFixed(1)} ATR → từ-chối đỉnh (↓)` });
            if (loW / rng >= 0.6 && b.c >= b.h - rng / 3) votes.push({ dir: 1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Wick-Extreme: bấc dưới ${(loW / rng * 100).toFixed(0)}% của nến ${(rng / atr[i]).toFixed(1)} ATR → từ-chối đáy (↑)` });
          }
        }
        // Gap-Fade — open nhảy khỏi close trước > 0.6 ATR → kỳ vọng lấp: fade về phía close cũ.
        if (hasGapFade) {
          const gap = b.o - pb.c;
          if (Math.abs(gap) > 0.6 * atr[i]) votes.push({ dir: gap > 0 ? -1 : 1, w: TC.sweep.w, rel: TC.sweep.rel, why: `Gap-Fade: gap ${(gap / atr[i]).toFixed(1)} ATR → fade lấp gap (${gap > 0 ? "↓" : "↑"})` });
        }
        // RSI-Extreme — cực trị sâu quay đầu (khác rsi_reclaim 35/65): <22 hếch lên → BUY · >78 gãy xuống → SELL.
        if (hasRsiExtreme) {
          if (rsi[i - 1] < 22 && rsi[i] > rsi[i - 1]) votes.push({ dir: 1, w: TC.rsi.w, rel: TC.rsi.rel, why: `RSI-Extreme: RSI ${rsi[i - 1].toFixed(0)} quá-bán SÂU quay đầu lên (↑)` });
          if (rsi[i - 1] > 78 && rsi[i] < rsi[i - 1]) votes.push({ dir: -1, w: TC.rsi.w, rel: TC.rsi.rel, why: `RSI-Extreme: RSI ${rsi[i - 1].toFixed(0)} quá-mua SÂU gãy xuống (↓)` });
        }
        // Break & Retest — 3 màn causal: (1) nến j (trong 12 nến trước) ĐÓNG vượt đỉnh/thủng đáy 20-nến-tính-đến-j;
        // (2) từ j tới i-1 mức GIỮ được trên cơ sở giá đóng (±0.25 ATR); (3) nến i quay về CHẠM mức rồi ĐÓNG bật lại
        // theo hướng phá vỡ (trần cũ thành sàn / sàn cũ thành trần). Bằng chứng "dứt khoát" của nến phá vỡ đo bằng
        // THÂN NẾN/ATR — tape cockpit chưa có volume, KHÔNG bịa; khi tape mang volume sẽ nâng cấp lên vol-evidence.
        if (hasBreakRetest && i > 40) {
          const tol = 0.25 * (atr[i] || 1);
          for (let j = i - 1; j >= i - 12 && j > 21; j--) {
            const hiJ = hi20(j), loJ = lo20(j);
            const upBreak = bars[j].c > hiJ, dnBreak = bars[j].c < loJ;
            if (!upBreak && !dnBreak) continue;
            const bodyJ = Math.abs(bars[j].c - bars[j].o) / (atr[j] || 1);
            const decis = bodyJ >= 0.9 ? `nến phá vỡ DỨT KHOÁT (thân ${bodyJ.toFixed(1)} ATR)` : `⚠ nến phá vỡ yếu (thân ${bodyJ.toFixed(1)} ATR — hồ sơ giống fakeout)`;
            if (upBreak) {
              let held = true; for (let k = j + 1; k < i; k++) if (bars[k].c < hiJ - tol) { held = false; break; }
              if (held && b.l <= hiJ + tol && b.c > hiJ && b.c > b.o)
                votes.push({ dir: 1, w: TC.trend.w, rel: TC.trend.rel, why: `Break & Retest: phá ${hiJ.toFixed(2)} rồi retest GIỮ mức — đóng bật lên (trần cũ thành sàn) · ${decis} (↑)` });
            } else {
              let held = true; for (let k = j + 1; k < i; k++) if (bars[k].c > loJ + tol) { held = false; break; }
              if (held && b.h >= loJ - tol && b.c < loJ && b.c < b.o)
                votes.push({ dir: -1, w: TC.trend.w, rel: TC.trend.rel, why: `Break & Retest: thủng ${loJ.toFixed(2)} rồi retest BỊ CHẶN — đóng bật xuống (sàn cũ thành trần) · ${decis} (↓)` });
            }
            break;   // chỉ xét cú phá vỡ GẦN NHẤT — cú cũ hơn đã hết vai
          }
        }
        // HTF-Anchor — M15 pullback-reclaim CHỈ khi cấu trúc H1 và H4 (bucket 4×/16× đã đóng, causal) đồng pha.
        if (hasHtfAnchor && htf) {
          const hd = htf.d1[i] !== 0 && htf.d1[i] === htf.d4[i] ? htf.d1[i] : 0;
          if (hd === 1 && pb.l <= e10[i - 1] && b.c > e10[i]) votes.push({ dir: 1, w: TC.trend.w, rel: TC.trend.rel, why: "HTF-Anchor: H1+H4 đồng pha TĂNG · pullback chạm EMA rồi đóng lại TRÊN (↑)" });
          if (hd === -1 && pb.h >= e10[i - 1] && b.c < e10[i]) votes.push({ dir: -1, w: TC.trend.w, rel: TC.trend.rel, why: "HTF-Anchor: H1+H4 đồng pha GIẢM · pullback chạm EMA rồi đóng lại DƯỚI (↓)" });
        }
      }
      // classic indicators (Ichimoku/MACD/Stoch/Bollinger/Fib) → vote into the SAME fusion/combine (src = which indicator)
      if (cSeries) for (const cv of classicEntryVotes(i, b, regime, atr[i], cSeries, cFlags)) votes.push({ dir: cv.dir, w: cv.w, rel: cv.rel, why: `Classic ${cv.src}: vote ${cv.dir > 0 ? "↑" : "↓"}` });
      // custom user modules (template-constrained): triggers add votes, gates/vetoes block
      let cBlocked = false; let customConfirmBoost = 1;
      if (customMods.length) { const vd = Math.sign(votes.reduce((a, v) => a + v.dir, 0)); const ce = evalEntryCustom(entryCtx(i, b, pt.h, votes.length, vd), customMods); cBlocked = ce.blocked; customConfirmBoost = ce.confirmBoost ?? 1; for (const cv of ce.votes) votes.push({ dir: cv.dir, w: cv.w, rel: cv.rel, why: `Custom module: vote ${cv.dir > 0 ? "↑" : "↓"}` }); }
      // FALLBACK role (V2, additive): fb_range_fade CHỈ lên tiếng khi MỌI attacker chính (engine + classic + custom
      // trigger) im lặng ở nến này — không bao giờ tranh tiếng. Yêu cầu card CÓ attacker chính (fb đứng một mình
      // → im lặng vĩnh viễn = NO_CANDIDATE ở tầng engine, đúng invariant "no fallback candidate"). Weight ×0.8.
      if (hasFbRange && votes.length === 0) {
        const hasPrimary = hasTrend || hasRsi || hasSweep || hasRange || hasPslSweep || hasVolContraction || hasHtfAnchor || hasAsiaFade || hasWickExtreme || hasGapFade || hasRsiExtreme || anyClassicTrigger(cFlags) || hasCustomTrigger;
        if (hasPrimary) {
          // weight = vừa đủ qua fusion khi đứng MỘT MÌNH (fusion tune cho attacker sẽ nuốt vote yếu vĩnh viễn —
          // bẫy FUSION-DEADLOCK đã đo); "không tranh tiếng" được bảo đảm bằng điều kiện votes.length===0, không bằng weight
          const fbW = Math.max(+(TC.range.w * 0.8).toFixed(3), TC.fusionThreshold);
          const w20 = bars.slice(Math.max(0, i - 20), i); const fLo = Math.min(...w20.map((x) => x.l)), fHi = Math.max(...w20.map((x) => x.h));
          if (b.h >= fHi) votes.push({ dir: -1, w: fbW, rel: TC.range.rel, why: `FALLBACK Range Fade: attacker im lặng · chạm BIÊN TRÊN range 20 nến (${fHi.toFixed(2)}) → fade (↓)` });
          if (b.l <= fLo) votes.push({ dir: 1, w: fbW, rel: TC.range.rel, why: `FALLBACK Range Fade: attacker im lặng · chạm BIÊN DƯỚI range 20 nến (${fLo.toFixed(2)}) → fade (↑)` });
        }
      }
      if (!votes.length) continue;
      // F3 custom CONFIRM — weight authority only (like mtf_confirm): scales EXISTING vote weights, never votes.
      if (customConfirmBoost !== 1) for (const v of votes) { v.w = +(v.w * customConfirmBoost).toFixed(4); v.why += " · Confirm ×" + customConfirmBoost; }
      // F1 mtf_confirm — CONFIRMATION authority only: boosts/attenuates EXISTING vote weights when the EMA10/34
      // slopes agree/disagree with each vote. It can never push a vote, so a card with only mtf_confirm stays
      // candidate-less. Weight-path only (fusion); absent → identical behavior (regression-safe additive).
      if (hasMtfConfirm) {
        const s10c = e10[i] - e10[Math.max(0, i - 5)], s34c = e34[i] - e34[Math.max(0, i - 10)];
        const mtfDir = s10c > 0 && s34c > 0 ? 1 : s10c < 0 && s34c < 0 ? -1 : 0;
        if (mtfDir !== 0) for (const v of votes) { v.w = +(v.w * (v.dir === mtfDir ? 1.25 : 0.75)).toFixed(4); v.why += v.dir === mtfDir ? " · MTF-Confirm ↑w" : " · MTF-Confirm ↓w"; }
      }
      let dir: "BUY" | "SELL" | null = null;
      if (useFusion) { const score = votes.reduce((a, v) => a + v.dir * v.w, 0); if (Math.abs(score) >= TC.fusionThreshold) dir = score > 0 ? "BUY" : "SELL"; }
      else if (useBayes) { const lo = votes.reduce((a, v) => a + v.dir * lnLR(v.rel), 0); const p = 1 / (1 + Math.exp(-lo)); if (p >= TC.bayesUp) dir = "BUY"; else if (p <= TC.bayesDown) dir = "SELL"; }
      else { const sum = votes.reduce((a, v) => a + v.dir, 0); dir = sum > 0 ? "BUY" : sum < 0 ? "SELL" : null; }
      if (!dir) continue;
      const ds = dir === "BUY" ? 1 : -1;
      const hour = pt.h;
      if (has("regime_ctx") && regime !== ds) continue;
      if (has("markov")) { if (hasRange) { if (persist > 5) continue; } else if (persist < 4) continue; }
      if (has("state_machine") && !armed) continue;
      if (has("session_ctx") && (hour < 7 || hour >= 21)) continue;
      if (has("dead_hour") && (hour >= 22 || hour < 2)) continue;
      if (has("news_ctx") && newsWindow(b.t)) continue;
      if (has("no_trade_chop") && Math.abs(e10[i] - e34[i]) < 0.15 * atr[i]) continue;
      if ((has("atr_vol") || has("atr_pct")) && atr[i] < 0.65 * (atrSlow[i] || atr[i])) continue;
      if (cSeries && classicGateBlocked(i, cSeries, cFlags)) continue;   // ADX gate: veto when no trend strength
      if (hasDrift && driftWin.length >= DRIFT_K) { const w = driftWin.filter((x) => x > 0).reduce((s2, x) => s2 + x, 0), l = -driftWin.filter((x) => x < 0).reduce((s2, x) => s2 + x, 0); if ((l ? w / l : (w > 0 ? 9 : 0)) < 0.6) { res.signals_blocked_by_drift_guard++; continue; } }   // drift_guard: stop a degrading card
      if ((hasSr || hasLvlMem) && swingLevels) { const si = structureAt(i, b.c, atr[i], swingLevels, bars);
        if (hasSr && ((dir === "BUY" && si.state === "AT_RESISTANCE") || (dir === "SELL" && si.state === "AT_SUPPORT"))) continue;   // veto counter-structure
        if (hasLvlMem && (dir === "BUY" ? si.supTouches : si.resTouches) >= 3) continue; }   // level weakening
      if (has("calib_trust") && votes.filter((v) => v.dir === ds).length < 2) continue;
      if (has("range_size")) { const rng2 = b.h - b.l; if (rng2 > 0) { const advc = dir === "BUY" ? b.h - Math.max(b.o, b.c) : Math.min(b.o, b.c) - b.l; if (advc / rng2 > 0.55) continue; if (rng2 > 3.0 * (atr[i] || rng2)) continue; } }
      if (has("topk_fit")) { const conv = Math.abs(votes.reduce((a, v) => a + v.dir * v.w, 0)); const recent = convBuf.slice(-50); convBuf.push(conv); if (recent.length >= 12) { const sorted = [...recent].sort((x, y) => x - y); if (conv < sorted[Math.floor(sorted.length * 0.6)]) continue; } }
      if (useEV && evWins + evLoss >= 10) { const p = evWins / (evWins + evLoss); const aw = evWins ? evSumWin / evWins : 1, al = evLoss ? evSumLoss / evLoss : 1; if (p * aw - (1 - p) * al <= 0) continue; }
      // ev_rolling — EV trên 20 lệnh GẦN NHẤT; khoá quá 400 nến → reset (thoát deadlock, thử lại từ đầu)
      if (useEvRolling && evRoll.length >= 10) {
        const mean = evRoll.reduce((s, x) => s + x, 0) / evRoll.length;
        if (mean <= 0) {
          if (evBlockedSince < 0) evBlockedSince = i;
          if (i - evBlockedSince < 400) continue;
          evRoll.length = 0; evBlockedSince = -1;   // probation reset — cho cơ hội chứng minh lại
        } else evBlockedSince = -1;
      }
      if (cBlocked) continue;                    // custom user gate/veto rejected this setup

      // a real signal exists → now apply DISCIPLINE before allowing an entry
      res.signals_seen++;
      ev(i, "SIGNAL_SEEN", `${dir} candidate`);
      if (cfg.discipline.onePositionAtATime && pos) { res.signals_blocked_by_existing_position++; ev(i, "SIGNAL_BLOCKED_POSITION_OPEN", "position already open"); continue; }
      if (i <= cooldownUntil) { res.signals_blocked_by_cooldown++; ev(i, "SIGNAL_BLOCKED_COOLDOWN", `cooldown until bar ${cooldownUntil}`); continue; }
      if (tradesToday >= dayCap) { res.signals_blocked_by_daily_cap++; res.max_trades_per_day_breaches++; ev(i, "SIGNAL_BLOCKED_DAILY_CAP", `daily cap ${dayCap} reached`); continue; }

      const fill = getNextOpenFill(i, bars);
      if (!fill) { ev(i, "DATA_WARNING", "no next bar for next-open fill — entry skipped"); continue; }
      const a = atr[fill.fillIndex] || atr[i] || 1; const entry = fill.fillOpen;
      let sl: number, tp: number | null, risk: number;
      if (hasDistRR && favHistATR.length >= 20) {   // SL≈p90 of own past MAE, TP≈p75 of own past MFE (ATR units, causal)
        const slATR = Math.max(0.5, percentile(advHistATR, 0.9)), tpATR = Math.max(slATR * MINRR, percentile(favHistATR, 0.75));
        sl = dir === "BUY" ? entry - slATR * a : entry + slATR * a;
        tp = dir === "BUY" ? entry + tpATR * a : entry - tpATR * a;
        risk = Math.abs(entry - sl); if (risk <= 0) continue;
      } else if (useAutoRR) {
        const w5 = bars.slice(Math.max(0, fill.fillIndex - 5), fill.fillIndex + 1), w20 = bars.slice(Math.max(0, fill.fillIndex - 20), fill.fillIndex + 1);
        sl = dir === "BUY" ? Math.min(...w5.map((x) => x.l)) - 0.1 * a : Math.max(...w5.map((x) => x.h)) + 0.1 * a;
        tp = dir === "BUY" ? Math.max(...w20.map((x) => x.h)) : Math.min(...w20.map((x) => x.l));
        risk = Math.abs(entry - sl); const reward = Math.abs(tp - entry);
        if (risk <= 0 || reward / risk < MINRR) continue;
      } else {
        sl = dir === "BUY" ? entry - a : entry + a; tp = null; risk = a;
      }
      // HARD-mode min-stop floor: a real broker won't honor a sub-floor stop, so widen it. R is then measured against
      // a REALISTIC stop → kills the "$1 structure-stop → +37R" artifact (affects GROSS R, not just cost/NET).
      const stopFloor = (cfg.minStopAtrK ?? 0) * a;
      if (stopFloor > 0 && risk < stopFloor) { risk = stopFloor; sl = dir === "BUY" ? entry - stopFloor : entry + stopFloor; }
      ev(i, "ORDER_INTENT_MODELED", `${dir} @ next-open ${entry}`);
      ev(fill.fillIndex, "FILL_MODELED", `${dir} filled ${entry} (open of bar i+1)`);
      ev(fill.fillIndex, "POSITION_OPENED_MODELED", `risk=${risk.toFixed(2)} sl=${sl.toFixed(2)} tp=${tp == null ? "cap" : tp.toFixed(2)}`);
      // ── REAL entry rationale: the votes that AGREED with the chosen direction (the triggers that actually fired) +
      // how they combined + every active gate that PASSED + the RR design. Derived from the engine, accurate, not a label.
      const sumV = votes.reduce((s2, v) => s2 + v.dir, 0), scoreV = votes.reduce((s2, v) => s2 + v.dir * v.w, 0);
      const combineStr = useFusion ? `Score Fusion: Σ(dir·w)=${scoreV.toFixed(2)} (≥0.8 ✓)` : useBayes ? `Bayesian: posterior ${(1 / (1 + Math.exp(-votes.reduce((s2, v) => s2 + v.dir * lnLR(v.rel), 0))) * 100).toFixed(0)}%` : `Majority: tổng vote=${sumV > 0 ? "+" : ""}${sumV}`;
      const gp: string[] = [];
      if (has("regime_ctx")) gp.push(`✓ Regime Context — regime khớp hướng ${dir}`);
      if (has("markov")) gp.push(hasRange ? "✓ Markov — regime chưa quá-bền" : `✓ Markov — regime đủ bền (persist=${persist})`);
      if (has("state_machine")) gp.push("✓ State-Machine — đã armed (pullback ≥2 nến → reclaim)");
      if (has("session_ctx")) gp.push(`✓ Session — giờ ${hour}h trong phiên (7–21 UTC)`);
      if (has("dead_hour")) gp.push(`✓ Dead-Hour — giờ ${hour}h không phải giờ chết`);
      if (has("news_ctx")) gp.push("✓ News — ngoài cửa-sổ tin (NFP/CPI)");
      if (has("no_trade_chop")) gp.push("✓ No-Trade Chop — EMA10/34 tách đủ rộng");
      if (has("atr_vol") || has("atr_pct")) gp.push("✓ ATR-Vol — biến-động đủ cao");
      if (cSeries && cFlags.adx) gp.push("✓ ADX — đủ sức trend (≥20)");
      if (hasDrift) gp.push("✓ Drift-Guard — PF cuộn còn ổn (≥0.6)");
      if (hasSr) gp.push("✓ S/R Zone — không vào ngược cấu-trúc");
      if (hasLvlMem) gp.push("✓ Level-Memory — level chưa yếu");
      if (has("calib_trust")) gp.push("✓ Calib-Trust — ≥2 vote đồng-thuận");
      if (has("range_size")) gp.push("✓ Range/Wick — nến vào sạch (không bấc lớn ngược)");
      if (has("topk_fit")) gp.push("✓ Top-K Fit — conviction trong top ~40%");
      if (useEV && evWins + evLoss >= 10) gp.push("✓ EV — kỳ-vọng EV(R) > 0");
      const triggers = votes.filter((v) => v.dir === ds).map((v) => "▸ " + v.why);
      const rrStr = (hasDistRR && favHistATR.length >= 20) ? "🎯 Distribution R:R — SL≈p90 MAE, TP≈p75 MFE (từ lệnh quá-khứ của card)"
        : useAutoRR ? `🎯 Auto R:R — SL=swing 5n (${sl.toFixed(2)}), TP=mức đối-diện 20n (${tp != null ? tp.toFixed(2) : "—"})`
        : "🎯 Fixed risk — SL=1 ATR, TP-cap +4R · time-stop 28 nến";
      const whyArr = [...triggers, "⚙ " + combineStr + " → " + dir, ...gp, rrStr];
      pos = { dir, entry, sl, risk, tp, entryI: fill.fillIndex, signalI: i, signalTime: b.t, fillTime: fill.fillTime, maxR: 0, atrEntry: a, favExc: 0, advExc: 0, why: whyArr };
      res.markers.push({ i: fill.fillIndex, price: entry, kind: dir === "BUY" ? "buy" : "sell" });
      res.actual_trades_taken++; tradesToday++;
    }
  }
  res.final_equity = equity;
  ev(bars.length - 1, "RUN_COMPLETED", `${res.actual_trades_taken} trades · ${res.signals_seen} signals seen`);
  return res;
}
