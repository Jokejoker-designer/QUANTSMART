// ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
// ║ ⛔ QUARANTINED REFERENCE — trap-control only (LOOKAHEAD_TRAP calibration).                      ║
// ║ FORBIDDEN as engine of record: engine của hồ sơ là realisticStrategySim (next-open fill,      ║
// ║ cost model, GROSS-vs-NET). File này chỉ còn MỘT vai: đối chứng bẫy lookahead trong            ║
// ║ simCalibrationHarness.ts. Mọi import/call ngoài whitelist (strategySim.ts · simCalibration-   ║
// ║ Harness.ts · __tests__/**) bị chặn tất định bởi oneEngineGuard.harness.ts — thêm consumer     ║
// ║ mới = harness ĐỎ. KHÔNG xóa file (trap control phải sống); KHÔNG sửa logic khi chưa có WO.    ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
// strategySim — deterministic mini-backtest of a Strategy Card over an OHLC tape.
// COMPOSABLE + each algorithm/module runs its OWN real mechanism (no fake/decorative):
//   triggers   : EMA pullback · RSI reclaim · sweep+reclaim · range fade (each a directional vote w/ weight+reliability)
//   combine    : Score Fusion = weighted Σ(dir·w) · Bayesian = log-odds posterior · EV = majority + online EV(R) gate · else majority
//   gates      : Regime Markov (regime persistence) · State Machine (pullback→reclaim sequence) · Regime/Session/Dead-Hour/
//                News(recurring NFP/CPI)/Chop/ATR-vol/Calibration  →  veto
//   exit       : SL −1R · TP-cap +4R · time-stop 28 · Exit-Weakening (early exit when thesis flips) · Auto R:R (structure SL/TP)
// All decisions at bar i use only data ≤ i (no-lookahead); outcome realized forward. Modeled · advisory · zone-only · no orders.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export interface SimTrade { dir: "BUY" | "SELL"; entryI: number; exitI: number; entry: number; exit: number; outcome: "TP" | "SL"; R: number; hour: number; month: number; year: number; t: string; why?: string[] }
export interface SimMarker { i: number; price: number; kind: "buy" | "sell" | "tp" | "sl" }
export interface SimResult { trades: SimTrade[]; markers: SimMarker[] }

function ema(vals: number[], p: number) { const k = 2 / (p + 1); const o: number[] = []; let prev = vals[0] ?? 0; vals.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); o.push(prev); }); return o; }
function rsiArr(closes: number[], p = 14): number[] {
  const out = new Array(closes.length).fill(50); let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1], g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    if (i <= p) { gain += g; loss += l; if (i === p) { gain /= p; loss /= p; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); } }
    else { gain = (gain * (p - 1) + g) / p; loss = (loss * (p - 1) + l) / p; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); }
  }
  return out;
}
function atrArr(bars: OhlcBar[], p = 14): number[] {
  const out = new Array(bars.length).fill(0); let a = 0;
  for (let i = 1; i < bars.length; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = i <= p ? (a * (i - 1) + tr) / i : (a * (p - 1) + tr) / p; out[i] = a; }
  return out;
}
// recurring economic-calendar proxy (structural, not a live feed): NFP = first Friday 12:00–15:00 UTC · CPI = 10th–15th weekday 12:00–14:00
function newsWindow(iso: string): boolean {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})/); if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const firstFri = 1 + ((5 - firstDow + 7) % 7);
  const isNFP = d === firstFri && h >= 12 && h < 15;
  const isCPI = d >= 10 && d <= 15 && dow >= 1 && dow <= 5 && h >= 12 && h < 14;
  return isNFP || isCPI;
}

export function simulateCard(bars: OhlcBar[], modules: string[], autoRR = false): SimResult {
  const trades: SimTrade[] = []; const markers: SimMarker[] = [];
  if (!bars || bars.length < 60) return { trades, markers };
  const mods = modules || []; const has = (id: string) => mods.includes(id);
  const closes = bars.map((b) => b.c);
  const e10 = ema(closes, 10), e34 = ema(closes, 34), rsi = rsiArr(closes), atr = atrArr(bars), atrSlow = ema(atr, 100);
  const MAXHOLD = 28, MINRR = 1.3, TPCAP = 4;
  const useFusion = has("fusion"), useBayes = has("bayesian"), useEV = has("ev"), useAutoRR = autoRR || has("auto_rr");
  const hasTrend = has("trend_pullback") || has("ema_trend") || has("ema_slope");
  const hasRsi = has("rsi_reclaim") || has("rsi_value");
  const hasSweep = has("sweep_reclaim") || has("sweep_depth") || has("sweep_risk");
  const hasRange = has("range_fade");
  const lnLR = (rel: number) => Math.log(rel / (1 - rel));
  let regime = 0, persist = 0;                                   // Markov regime tracker
  let belowRun = 0, armed = false, armedAge = 0;                 // State-Machine: a sustained pullback (≥2 bars) ARMS the setup; reclaim within 4 bars fires
  let evWins = 0, evLoss = 0, evSumWin = 0, evSumLoss = 0;       // EV online stats (no-lookahead)
  const convBuf: number[] = [];                                  // Top-K Fit: rolling conviction of recent candidate setups
  let pos: { dir: "BUY" | "SELL"; entry: number; sl: number; risk: number; tp: number | null; entryI: number; why: string[] } | null = null;

  for (let i = 40; i < bars.length - 1; i++) {
    const b = bars[i], pb = bars[i - 1];
    const r = e10[i] > e34[i] ? 1 : e10[i] < e34[i] ? -1 : 0;
    if (r === regime) persist++; else { regime = r; persist = 1; }
    // State-Machine: count consecutive bars CLOSING on the pullback side of EMA10; ≥2 → armed (a real retest, not a 1-bar wick)
    if ((regime > 0 && b.c < e10[i]) || (regime < 0 && b.c > e10[i])) belowRun++; else belowRun = 0;
    if (belowRun >= 2) { armed = true; armedAge = 0; } else if (armed) { armedAge++; if (armedAge > 4) armed = false; }

    if (pos) {
      const held = i - pos.entryI; let exit: number | null = null, R = 0;
      const slHit = pos.dir === "BUY" ? b.l <= pos.sl : b.h >= pos.sl;
      const tpHit = pos.tp != null && (pos.dir === "BUY" ? b.h >= pos.tp : b.l <= pos.tp);
      const weak = has("exit_weak") && (pos.dir === "BUY" ? (e10[i] < e34[i] || rsi[i] < 42) : (e10[i] > e34[i] || rsi[i] > 58));
      if (slHit) { exit = pos.sl; R = -1; }
      else if (tpHit) { exit = pos.tp!; R = (pos.dir === "BUY" ? pos.tp! - pos.entry : pos.entry - pos.tp!) / pos.risk; }
      else if (pos.tp == null && (pos.dir === "BUY" ? b.h >= pos.entry + TPCAP * pos.risk : b.l <= pos.entry - TPCAP * pos.risk)) { exit = pos.dir === "BUY" ? pos.entry + TPCAP * pos.risk : pos.entry - TPCAP * pos.risk; R = TPCAP; }
      else if (weak && held >= 2) { exit = b.c; R = (pos.dir === "BUY" ? b.c - pos.entry : pos.entry - b.c) / pos.risk; }
      else if (held >= MAXHOLD) { exit = b.c; R = (pos.dir === "BUY" ? b.c - pos.entry : pos.entry - b.c) / pos.risk; }
      if (exit != null) {
        R = +R.toFixed(2); const outcome: "TP" | "SL" = R >= 0 ? "TP" : "SL";
        if (R >= 0) { evWins++; evSumWin += R; } else { evLoss++; evSumLoss += Math.abs(R); }
        const eb = bars[pos.entryI]; const hm = eb.t.match(/T(\d{2}):/); const ym = eb.t.match(/(\d{4})-(\d{2})/);
        trades.push({ dir: pos.dir, entryI: pos.entryI, exitI: i, entry: pos.entry, exit, outcome, R, hour: hm ? +hm[1] : 0, month: ym ? +ym[2] : 0, year: ym ? +ym[1] : 0, t: eb.t, why: pos.why });
        markers.push({ i, price: exit, kind: R >= 0 ? "tp" : "sl" });
        pos = null;
      }
    }
    if (!pos) {
      const up = regime > 0, dn = regime < 0;
      const votes: { dir: number; w: number; rel: number; why: string }[] = [];
      if (!hasTrend && !hasRsi && !hasSweep && !hasRange) {
        if (e10[i] > e34[i] && e10[i - 1] <= e34[i - 1]) votes.push({ dir: 1, w: 1, rel: 0.52, why: "EMA10 vừa cắt LÊN EMA34 (↑)" });
        if (e10[i] < e34[i] && e10[i - 1] >= e34[i - 1]) votes.push({ dir: -1, w: 1, rel: 0.52, why: "EMA10 vừa cắt XUỐNG EMA34 (↓)" });
      } else {
        if (hasTrend) { if (up && pb.l <= e10[i - 1] && b.c > e10[i]) votes.push({ dir: 1, w: 1, rel: 0.55, why: "Trend Pullback: uptrend · giá hồi chạm EMA10 rồi đóng lại TRÊN (↑)" }); if (dn && pb.h >= e10[i - 1] && b.c < e10[i]) votes.push({ dir: -1, w: 1, rel: 0.55, why: "Trend Pullback: downtrend · giá hồi chạm EMA10 rồi đóng lại DƯỚI (↓)" }); }
        if (hasRsi) { if (rsi[i - 1] < 35 && rsi[i] >= 35) votes.push({ dir: 1, w: 0.8, rel: 0.53, why: `RSI Reclaim: RSI cắt LÊN 35 từ quá-bán (${rsi[i].toFixed(0)}) (↑)` }); if (rsi[i - 1] > 65 && rsi[i] <= 65) votes.push({ dir: -1, w: 0.8, rel: 0.53, why: `RSI Reclaim: RSI cắt XUỐNG 65 từ quá-mua (${rsi[i].toFixed(0)}) (↓)` }); }
        if (hasSweep) { const w = bars.slice(Math.max(0, i - 20), i); const lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h)); if (b.l < lo && b.c > lo) votes.push({ dir: 1, w: 0.9, rel: 0.54, why: `Sweep Reclaim: quét ĐÁY 20-nến (${lo.toFixed(2)}) rồi đóng lại TRÊN (↑)` }); if (b.h > hi && b.c < hi) votes.push({ dir: -1, w: 0.9, rel: 0.54, why: `Sweep Reclaim: quét ĐỈNH 20-nến (${hi.toFixed(2)}) rồi đóng lại DƯỚI (↓)` }); }
        if (hasRange) { const w = bars.slice(Math.max(0, i - 20), i); const lo = Math.min(...w.map((x) => x.l)), hi = Math.max(...w.map((x) => x.h)); if (b.h >= hi) votes.push({ dir: -1, w: 0.7, rel: 0.52, why: `Range Fade: chạm BIÊN TRÊN range (${hi.toFixed(2)}) → fade (↓)` }); if (b.l <= lo) votes.push({ dir: 1, w: 0.7, rel: 0.52, why: `Range Fade: chạm BIÊN DƯỚI range (${lo.toFixed(2)}) → fade (↑)` }); }
      }
      if (!votes.length) continue;
      // ── combine (the algorithm module decides HOW) ──
      let dir: "BUY" | "SELL" | null = null; let combineStr = "Majority vote";
      if (useFusion) { const score = votes.reduce((a, v) => a + v.dir * v.w, 0); combineStr = `Score Fusion: Σ(dir·w)=${score.toFixed(2)} ${Math.abs(score) >= 0.8 ? "≥0.8 ✓" : "<0.8"}`; if (Math.abs(score) >= 0.8) dir = score > 0 ? "BUY" : "SELL"; }
      else if (useBayes) { const lo = votes.reduce((a, v) => a + v.dir * lnLR(v.rel), 0); const p = 1 / (1 + Math.exp(-lo)); combineStr = `Bayesian: posterior p=${(p * 100).toFixed(0)}%`; if (p >= 0.52) dir = "BUY"; else if (p <= 0.48) dir = "SELL"; }
      else { const sum = votes.reduce((a, v) => a + v.dir, 0); combineStr = `Majority: tổng vote=${sum > 0 ? "+" : ""}${sum}`; dir = sum > 0 ? "BUY" : sum < 0 ? "SELL" : null; }
      if (!dir) continue;
      const ds = dir === "BUY" ? 1 : -1;
      // ── gates (each module = a real veto) ──
      const hm = b.t.match(/T(\d{2}):/); const hour = hm ? +hm[1] : 12;
      if (has("regime_ctx") && regime !== ds) continue;
      if (has("markov")) { if (hasRange) { if (persist > 5) continue; } else if (persist < 4) continue; }
      if (has("state_machine") && !armed) continue;
      if (has("session_ctx") && (hour < 7 || hour >= 21)) continue;
      if (has("dead_hour") && (hour >= 22 || hour < 2)) continue;
      if (has("news_ctx") && newsWindow(b.t)) continue;
      if (has("no_trade_chop") && Math.abs(e10[i] - e34[i]) < 0.15 * atr[i]) continue;
      if ((has("atr_vol") || has("atr_pct")) && atr[i] < 0.65 * (atrSlow[i] || atr[i])) continue;
      if (has("calib_trust") && votes.filter((v) => v.dir === ds).length < 2) continue;
      // Range / Wick: reject low-quality entry candles — big rejection wick against us, or a climactic outlier range
      if (has("range_size")) { const rng = b.h - b.l; if (rng > 0) { const adv = dir === "BUY" ? b.h - Math.max(b.o, b.c) : Math.min(b.o, b.c) - b.l; if (adv / rng > 0.55) continue; if (rng > 3.0 * (atr[i] || rng)) continue; } }
      // Top-K Fit: only act when THIS setup's conviction is in the top ~40% of recent candidates (selectivity, not win-rate)
      if (has("topk_fit")) { const conv = Math.abs(votes.reduce((a, v) => a + v.dir * v.w, 0)); const recent = convBuf.slice(-50); convBuf.push(conv); if (recent.length >= 12) { const sorted = [...recent].sort((x, y) => x - y); if (conv < sorted[Math.floor(sorted.length * 0.6)]) continue; } }
      if (useEV && evWins + evLoss >= 10) { const p = evWins / (evWins + evLoss); const aw = evWins ? evSumWin / evWins : 1, al = evLoss ? evSumLoss / evLoss : 1; if (p * aw - (1 - p) * al <= 0) continue; }
      // ── build the entry RATIONALE: triggers (for this dir) + combine + every active gate that PASSED + sizing ──
      const gatesPassed: string[] = [];
      if (has("regime_ctx")) gatesPassed.push(`✓ Regime Context — regime khớp hướng ${dir}`);
      if (has("markov")) gatesPassed.push(hasRange ? "✓ Markov — regime chưa quá-bền (persist≤5)" : `✓ Markov — regime đủ bền (persist=${persist}≥4)`);
      if (has("state_machine")) gatesPassed.push("✓ State-Machine — đã armed (pullback ≥2 nến → reclaim)");
      if (has("session_ctx")) gatesPassed.push(`✓ Session — giờ ${hour}h trong phiên (7–21 UTC)`);
      if (has("dead_hour")) gatesPassed.push(`✓ Dead-Hour — giờ ${hour}h không phải giờ chết`);
      if (has("news_ctx")) gatesPassed.push("✓ News — ngoài cửa-sổ tin (NFP/CPI)");
      if (has("no_trade_chop")) gatesPassed.push("✓ No-Trade Chop — EMA10/34 tách đủ rộng (không chop)");
      if (has("atr_vol") || has("atr_pct")) gatesPassed.push("✓ ATR-Vol — biến-động đủ cao");
      if (has("calib_trust")) gatesPassed.push("✓ Calib-Trust — ≥2 vote đồng-thuận");
      if (has("range_size")) gatesPassed.push("✓ Range/Wick — nến vào sạch (không bấc lớn ngược)");
      if (has("topk_fit")) gatesPassed.push("✓ Top-K Fit — conviction trong top ~40%");
      if (useEV && evWins + evLoss >= 10) gatesPassed.push("✓ EV — kỳ-vọng EV(R) > 0");
      const triggers = votes.filter((v) => v.dir === ds).map((v) => "▸ " + v.why);
      // ── enter ──
      const a = atr[i] || 1; const entry = b.c;
      if (useAutoRR) {
        const w5 = bars.slice(Math.max(0, i - 5), i + 1), w20 = bars.slice(Math.max(0, i - 20), i + 1);
        const sl = dir === "BUY" ? Math.min(...w5.map((x) => x.l)) - 0.1 * a : Math.max(...w5.map((x) => x.h)) + 0.1 * a;
        const tp = dir === "BUY" ? Math.max(...w20.map((x) => x.h)) : Math.min(...w20.map((x) => x.l));
        const risk = Math.abs(entry - sl), reward = Math.abs(tp - entry);
        if (risk <= 0 || reward / risk < MINRR) continue;
        const why = [...triggers, "⚙ " + combineStr + " → " + dir, ...gatesPassed, `🎯 Auto R:R — SL=swing 5n (${sl.toFixed(2)}), TP=mức đối-diện 20n (${tp.toFixed(2)}), RR=${(reward / risk).toFixed(2)} ≥1.3 ✓`];
        pos = { dir, entry, sl, risk, tp, entryI: i, why };
      } else {
        const why = [...triggers, "⚙ " + combineStr + " → " + dir, ...gatesPassed, `🎯 Fixed risk — SL = 1 ATR (${a.toFixed(2)}), TP-cap +4R · time-stop 28 nến`];
        pos = { dir, entry, sl: dir === "BUY" ? entry - a : entry + a, risk: a, tp: null, entryI: i, why };
      }
      markers.push({ i, price: entry, kind: dir === "BUY" ? "buy" : "sell" });
    }
  }
  return { trades, markers };
}

export interface Bucket { n: number; wins: number; netR: number }
function bucket(trades: SimTrade[], key: (t: SimTrade) => string | number) {
  const m: Record<string, Bucket> = {};
  trades.forEach((t) => { const k = String(key(t)); (m[k] ||= { n: 0, wins: 0, netR: 0 }); m[k].n++; if (t.outcome === "TP") m[k].wins++; m[k].netR += t.R; });
  return m;
}

export function analyze(trades: SimTrade[]) {
  const n = trades.length, wins = trades.filter((t) => t.outcome === "TP").length;
  const winRate = n ? (wins / n) * 100 : 0;
  const netR = trades.reduce((s, t) => s + t.R, 0);
  const grossWin = trades.filter((t) => t.R > 0).reduce((s, t) => s + t.R, 0);
  const grossLoss = -trades.filter((t) => t.R < 0).reduce((s, t) => s + t.R, 0);
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin;
  let cum = 0, peak = 0, maxDD = 0; const equity = trades.map((t) => { cum += t.R; peak = Math.max(peak, cum); maxDD = Math.min(maxDD, cum - peak); return +cum.toFixed(2); });
  const byHour = bucket(trades, (t) => t.hour), byMonth = bucket(trades, (t) => t.month), byYear = bucket(trades, (t) => t.year), byDir = bucket(trades, (t) => t.dir);
  const best = (m: Record<string, Bucket>) => Object.entries(m).filter(([, v]) => v.n >= 3).sort((a, b) => b[1].netR - a[1].netR)[0];
  return { n, wins, winRate: +winRate.toFixed(1), netR: +netR.toFixed(2), profitFactor: +profitFactor.toFixed(2), maxDD: +maxDD.toFixed(2), equity, byHour, byMonth, byYear, byDir, bestHour: best(byHour), bestMonth: best(byMonth), bestYear: best(byYear) };
}
