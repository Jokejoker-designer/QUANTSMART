// coefficientCalibration — turns the ex-"ĐÁNG NGỜ" (suspect guessed) trigger weights/reliabilities into HONEST
// coefficients: either (1) SELF-CALIBRATED from data + era-stability-gated (SHADOW until proven), or (2) USER-TUNABLE
// (transparent, their choice). Never a hidden guess. Doctrine: SELF_CALIBRATING > user-weighted > fixed.
//
// The engine (realisticStrategySim) reads a Partial<TriggerCoef>; ABSENT → DEFAULT_TRIGGER_COEF (the historical
// values) → identical behavior (regression-safe). resolveTriggerCoef merges a partial onto the defaults.
//
// Self-calibration = per-trigger FORWARD directional hit-rate on the tape (a property of trigger×market, NOT the
// engine's own PnL → not outcome-circular), conservatively clamped, and only trusted when it is ERA-STABLE across
// the first vs second half of history (else it's a single-era mirage → falls back to user-tunable).
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type TriggerKey = "trend" | "rsi" | "sweep" | "range" | "emaDefault";
export interface WRel { w: number; rel: number }
export interface TriggerCoef {
  trend: WRel; rsi: WRel; sweep: WRel; range: WRel; emaDefault: WRel;
  fusionThreshold: number; bayesUp: number; bayesDown: number;
}

// the historical hand-picked values — now the transparent DEFAULT (user-tunable), not a hidden guess.
export const DEFAULT_TRIGGER_COEF: TriggerCoef = {
  trend: { w: 1, rel: 0.55 }, rsi: { w: 0.8, rel: 0.53 }, sweep: { w: 0.9, rel: 0.54 },
  range: { w: 0.7, rel: 0.52 }, emaDefault: { w: 1, rel: 0.52 },
  fusionThreshold: 0.8, bayesUp: 0.52, bayesDown: 0.48,
};

// an override may set only SOME fields (per-trigger partial w/rel + any of the thresholds).
export interface TriggerCoefOverride {
  trend?: Partial<WRel>; rsi?: Partial<WRel>; sweep?: Partial<WRel>; range?: Partial<WRel>; emaDefault?: Partial<WRel>;
  fusionThreshold?: number; bayesUp?: number; bayesDown?: number;
}
export function resolveTriggerCoef(partial?: TriggerCoefOverride | null): TriggerCoef {
  if (!partial) return DEFAULT_TRIGGER_COEF;
  const wr = (k: TriggerKey) => ({ ...DEFAULT_TRIGGER_COEF[k], ...(partial[k] as Partial<WRel> | undefined) });
  return {
    trend: wr("trend"), rsi: wr("rsi"), sweep: wr("sweep"), range: wr("range"), emaDefault: wr("emaDefault"),
    fusionThreshold: partial.fusionThreshold ?? DEFAULT_TRIGGER_COEF.fusionThreshold,
    bayesUp: partial.bayesUp ?? DEFAULT_TRIGGER_COEF.bayesUp,
    bayesDown: partial.bayesDown ?? DEFAULT_TRIGGER_COEF.bayesDown,
  };
}

// ── indicators (mirror the engine: EMA10/34, RSI14) ──
function ema(vals: number[], p: number): number[] { const k = 2 / (p + 1); const out: number[] = []; let e = vals[0] ?? 0; for (let i = 0; i < vals.length; i++) { e = i === 0 ? (vals[0] ?? 0) : vals[i] * k + e * (1 - k); out.push(e); } return out; }
function rsi14(bars: OhlcBar[], p = 14): number[] {
  const out: number[] = new Array(bars.length).fill(50); let ag = 0, al = 0;
  for (let i = 1; i < bars.length; i++) { const d = bars[i].c - bars[i - 1].c; const g = Math.max(0, d), l = Math.max(0, -d); if (i <= p) { ag += g; al += l; if (i === p) { ag /= p; al /= p; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } } else { ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } }
  return out;
}

export type CoefVerdict = "PROVEN_SHADOW" | "INSUFFICIENT" | "ERA_UNSTABLE" | "NO_EDGE";
export interface TriggerCalib {
  key: TriggerKey; samples: number; hitRate: number; relCalibrated: number;
  eraHit1: number; eraHit2: number; eraStable: boolean; verdict: CoefVerdict;
}
export interface CalibrationReport { fwd: number; triggers: Record<TriggerKey, TriggerCalib>; note: string }

// firing events per trigger (i = event bar). Returns the signed directions the trigger fired at each bar.
function fireEvents(bars: OhlcBar[], key: TriggerKey): { i: number; dir: number }[] {
  const closes = bars.map((b) => b.c); const e10 = ema(closes, 10), e34 = ema(closes, 34), rsi = rsi14(bars);
  const ev: { i: number; dir: number }[] = [];
  for (let i = 34; i < bars.length; i++) {
    const b = bars[i], pb = bars[i - 1]; const up = e10[i] > e34[i], dn = e10[i] < e34[i];
    if (key === "emaDefault") { if (e10[i] > e34[i] && e10[i - 1] <= e34[i - 1]) ev.push({ i, dir: 1 }); if (e10[i] < e34[i] && e10[i - 1] >= e34[i - 1]) ev.push({ i, dir: -1 }); }
    else if (key === "trend") { if (up && pb.l <= e10[i - 1] && b.c > e10[i]) ev.push({ i, dir: 1 }); if (dn && pb.h >= e10[i - 1] && b.c < e10[i]) ev.push({ i, dir: -1 }); }
    else if (key === "rsi") { if (rsi[i - 1] < 35 && rsi[i] >= 35) ev.push({ i, dir: 1 }); if (rsi[i - 1] > 65 && rsi[i] <= 65) ev.push({ i, dir: -1 }); }
    else if (key === "sweep") { const w = bars.slice(Math.max(0, i - 20), i); const lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h)); if (b.l < lo && b.c > lo) ev.push({ i, dir: 1 }); if (b.h > hi && b.c < hi) ev.push({ i, dir: -1 }); }
    else if (key === "range") { const w = bars.slice(Math.max(0, i - 20), i); const lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h)); if (b.h >= hi) ev.push({ i, dir: -1 }); if (b.l <= lo) ev.push({ i, dir: 1 }); }
  }
  return ev;
}

// forward hit = did price move the trigger's direction over the next `fwd` bars (net close change)?
function calibKey(bars: OhlcBar[], key: TriggerKey, fwd: number): TriggerCalib {
  const ev = fireEvents(bars, key).filter((e) => e.i + fwd < bars.length);
  const mid = Math.floor(bars.length / 2);
  const hit = (e: { i: number; dir: number }) => (bars[e.i + fwd].c - bars[e.i].c) * e.dir > 0;
  const all = ev.length ? ev.filter(hit).length / ev.length : 0.5;
  const e1 = ev.filter((e) => e.i < mid), e2 = ev.filter((e) => e.i >= mid);
  const h1 = e1.length ? e1.filter(hit).length / e1.length : 0.5, h2 = e2.length ? e2.filter(hit).length / e2.length : 0.5;
  const eraStable = e1.length >= 15 && e2.length >= 15 && Math.abs(h1 - h2) <= 0.08 && h1 > 0.5 && h2 > 0.5;
  // conservative: reliability capped at 0.72; only "proven" when era-stable AND overall edge > coin-flip
  const relCalibrated = Math.max(0.5, Math.min(0.72, all));
  const verdict: CoefVerdict = ev.length < 30 ? "INSUFFICIENT" : all <= 0.5 ? "NO_EDGE" : !eraStable ? "ERA_UNSTABLE" : "PROVEN_SHADOW";
  return { key, samples: ev.length, hitRate: +all.toFixed(3), relCalibrated: +relCalibrated.toFixed(3), eraHit1: +h1.toFixed(3), eraHit2: +h2.toFixed(3), eraStable, verdict };
}

export function calibrateTriggerReliabilities(bars: OhlcBar[], fwd = 10): CalibrationReport {
  const keys: TriggerKey[] = ["trend", "rsi", "sweep", "range", "emaDefault"];
  const triggers = {} as Record<TriggerKey, TriggerCalib>;
  for (const k of keys) triggers[k] = calibKey(bars, k, fwd);
  return { fwd, triggers, note: "Forward directional hit-rate per trigger (causal per-event; not engine PnL). PROVEN only when era-stable across history halves — else user-tunable. SHADOW until fully validated." };
}

// resolve one coefficient's SOURCE for display + engine use: proven-self-calib > user-set > transparent default.
export type CoefSource = "SELF_CALIB_SHADOW" | "USER" | "DEFAULT";
export function resolveRel(calib: TriggerCalib | undefined, userRel: number | undefined, applyShadow: boolean): { rel: number; source: CoefSource } {
  if (applyShadow && calib && calib.verdict === "PROVEN_SHADOW") return { rel: calib.relCalibrated, source: "SELF_CALIB_SHADOW" };
  if (userRel != null && Number.isFinite(userRel)) return { rel: userRel, source: "USER" };
  return { rel: DEFAULT_TRIGGER_COEF[calib?.key ?? "trend"].rel, source: "DEFAULT" };
}
