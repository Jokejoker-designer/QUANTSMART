// measurements — compute a MeasurementSnapshot (0–100) from an OHLC tape, no-lookahead (only bars ≤ i).
// This is the TS twin of the Python market_measurements engine; the SAME function builds entry signatures
// AND scores the current bar, so matching is self-consistent. Real OHLC-derived measures + honest neutral
// placeholders for data we don't yet feed (spread / live news). Authority: advisory · zone-only · no orders.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50);

function ema(vals: number[], p: number) { const k = 2 / (p + 1); const o: number[] = []; let prev = vals[0] ?? 0; vals.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); o.push(prev); }); return o; }
function atrArr(bars: OhlcBar[], p = 14): number[] { const o = new Array(bars.length).fill(0); let a = 0; for (let i = 1; i < bars.length; i++) { const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)); a = i <= p ? (a * (i - 1) + tr) / i : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
function ms(iso: string): number { const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); if (!m) return 0; return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); }
function hourOf(iso: string): number { const m = iso.match(/T(\d{2}):/); return m ? +m[1] : 12; }
function newsWindow(iso: string): boolean { const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})/); if (!m) return false; const y = +m[1], mo = +m[2], d = +m[3], h = +m[4]; const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); const fd = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); const firstFri = 1 + ((5 - fd + 7) % 7); return (d === firstFri && h >= 12 && h < 15) || (d >= 10 && d <= 15 && dow >= 1 && dow <= 5 && h >= 12 && h < 14); }

// the stable measurement key set (kept identical between build + qualify)
export const MEASUREMENT_KEYS = [
  "trend_persistence", "regime_stability", "noise_chop", "volatility_stress",
  "expansion_readiness", "compression_level", "micro_momentum", "candle_body_quality",
  "wick_pressure", "session_efficiency", "mtf_alignment", "trap_risk", "hour_quality",
  "data_quality", "kidi_cleanliness", "spread_health", "news_distance_health",
] as const;

export class MeasurementEngine {
  bars: OhlcBar[];
  private e10: number[]; private e34: number[]; private e100: number[];
  private atr: number[]; private atrSlow: number[];
  constructor(bars: OhlcBar[]) {
    this.bars = bars; const c = bars.map((b) => b.c);
    this.e10 = ema(c, 10); this.e34 = ema(c, 34); this.e100 = ema(c, 100);
    this.atr = atrArr(bars); this.atrSlow = ema(this.atr, 100);
  }
  /** Measurements at bar i (uses only data ≤ i). Always returns every MEASUREMENT_KEYS value in [0,100]. */
  at(i: number): Record<string, number> {
    const b = this.bars; const lo1 = (k: number) => Math.max(1, k);
    // trend_persistence — one-sidedness of closes vs EMA34 over 20
    let up = 0, dn = 0; for (let k = i - 19; k <= i; k++) { if (k < 1) continue; if (b[k].c > this.e34[k]) up++; else dn++; }
    const trend_persistence = clamp((Math.abs(up - dn) / 20) * 100);
    // regime_stability — few EMA10/EMA34 crosses over 30
    let crosses = 0; for (let k = lo1(i - 29); k <= i; k++) { const a = this.e10[k] - this.e34[k], p = this.e10[k - 1] - this.e34[k - 1]; if (a !== 0 && (a > 0) !== (p > 0)) crosses++; }
    const regime_stability = clamp(100 - crosses * 16);
    // noise_chop — close-direction flip rate over 20
    let flips = 0, fpairs = 0; for (let k = Math.max(2, i - 19); k <= i; k++) { const d1 = b[k].c - b[k - 1].c, d2 = b[k - 1].c - b[k - 2].c; if (d1 !== 0 && d2 !== 0) { fpairs++; if ((d1 > 0) !== (d2 > 0)) flips++; } }
    const noise_chop = clamp(fpairs ? (flips / fpairs) * 100 : 50);
    // volatility_stress — ATR vs its long norm
    const ratio = this.atrSlow[i] > 0 ? this.atr[i] / this.atrSlow[i] : 1;
    const volatility_stress = clamp(((ratio - 0.6) / (1.6 - 0.6)) * 100);
    // expansion / compression — current range vs avg range(20)
    let sumR = 0, cnt = 0; for (let k = Math.max(0, i - 19); k <= i; k++) { sumR += b[k].h - b[k].l; cnt++; }
    const avgR = cnt ? sumR / cnt : 1; const curR = b[i].h - b[i].l; const rr = avgR > 0 ? curR / avgR : 1;
    const expansion_readiness = clamp(((rr - 0.5) / (2.0 - 0.5)) * 100);
    const compression_level = clamp(100 - (rr / 1.5) * 100);
    // micro_momentum — |5-bar move| / ATR
    const mv = i >= 5 ? Math.abs(b[i].c - b[i - 5].c) : 0; const micro_momentum = clamp(this.atr[i] > 0 ? (mv / (this.atr[i] * 2.5)) * 100 : 0);
    // candle_body_quality — body / range of the current bar
    const candle_body_quality = clamp(curR > 0 ? (Math.abs(b[i].c - b[i].o) / curR) * 100 : 50);
    // wick_pressure — total wick / total range over 5
    let wick = 0, rs = 0; for (let k = Math.max(0, i - 4); k <= i; k++) { const r = b[k].h - b[k].l; wick += Math.max(0, r - Math.abs(b[k].c - b[k].o)); rs += r; }
    const wick_pressure = clamp(rs > 0 ? (wick / rs) * 100 : 50);
    // session_efficiency — |net move| / Σrange over 10
    const net = Math.abs(b[i].c - b[Math.max(0, i - 9)].c); let tot = 0; for (let k = Math.max(0, i - 9); k <= i; k++) tot += b[k].h - b[k].l;
    const session_efficiency = clamp(tot > 0 ? (net / tot) * 200 : 50);
    // mtf_alignment — agreement of EMA slopes (10/34/100)
    const s10 = this.e10[i] - this.e10[Math.max(0, i - 5)], s34 = this.e34[i] - this.e34[Math.max(0, i - 10)], s100 = this.e100[i] - this.e100[Math.max(0, i - 20)];
    const agree = Math.abs([s10, s34, s100].map((x) => (x > 0 ? 1 : x < 0 ? -1 : 0)).reduce<number>((a, x) => a + x, 0));
    const mtf_alignment = clamp(agree === 3 ? 100 : agree === 1 ? 60 : 40);
    // trap_risk — recent sweeps that reversed (wick beyond prior 20-extreme then closed back)
    let traps = 0, twin = 0; for (let k = Math.max(21, i - 19); k <= i; k++) { twin++; const w = b.slice(k - 20, k); const hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l)); if ((b[k].h > hi && b[k].c < hi) || (b[k].l < lo && b[k].c > lo)) traps++; }
    const trap_risk = clamp(twin ? (traps / twin) * 100 * 3 : 0);
    // hour_quality — London/NY active high, dead hours low
    const hr = hourOf(b[i].t); const hour_quality = clamp(hr >= 7 && hr < 21 ? 85 : hr >= 22 || hr < 2 ? 25 : 55);
    // ── honest placeholders for data we don't yet feed ──
    // data_quality — timestamp-gap witness
    let gap = false; if (i >= 2) { const d0 = ms(b[i].t) - ms(b[i - 1].t), d1 = ms(b[i - 1].t) - ms(b[i - 2].t); if (d1 > 0 && d0 > d1 * 2.5) gap = true; }
    const data_quality = gap ? 40 : 100;
    // kidi_cleanliness — frozen-feed witness (range≈0 or identical closes over 5)
    let frozen = true; for (let k = Math.max(1, i - 4); k <= i; k++) { if (b[k].h - b[k].l > 1e-9 || b[k].c !== b[k - 1].c) { frozen = false; break; } }
    const kidi_cleanliness = frozen ? 20 : 100;
    const spread_health = 75;                                  // no spread feed yet → neutral
    const news_distance_health = newsWindow(b[i].t) ? 30 : 100; // recurring NFP/CPI proxy
    return {
      trend_persistence, regime_stability, noise_chop, volatility_stress, expansion_readiness, compression_level,
      micro_momentum, candle_body_quality, wick_pressure, session_efficiency, mtf_alignment, trap_risk, hour_quality,
      data_quality, kidi_cleanliness, spread_health, news_distance_health,
    };
  }
  /** Full server-shaped snapshot at bar i. */
  snapshotAt(i: number, symbol = "XAUUSD", timeframe = "M15"): { snapshot_id: string; symbol: string; timeframe: string; timestamp: string; measurements: Record<string, number> } {
    return { snapshot_id: "snap_" + i, symbol, timeframe, timestamp: this.bars[i].t, measurements: this.at(i) };
  }
}
