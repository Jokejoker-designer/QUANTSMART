// conductorMode — Nhạc-trưởng thử nghiệm (WO owner 2026-07-04) · SHADOW_ONLY / ADVISORY_ONLY / MEASUREMENT_ONLY.
//
// DOCTRINE (owner, BINDING): KHÔNG tìm alpha vĩnh viễn. Xây các specialist biết khi nào mình có lợi thế và khi
// nào phải IM LẶNG. Router chọn beast theo VÙNG NĂNG LỰC (Compatibility Passport per-regime, OOS-validate),
// dựa context PAST-ONLY (causal, no-lookahead ≤ nến vào lệnh) — CẤM chạy theo beast vừa thắng gần đây
// (recency/hindsight = curve-fit = mirage). ABSTAIN / NO_ACTION là kết quả HỢP LỆ. Nếu routed PF vẫn ≤ 1 →
// GHI THẬT (NO_EDGE_EVEN_ROUTED), không xoay tham số tới khi đẹp (p-hacking). Zero authority: không lệnh/khối-lượng/rủi-ro.
//
// Cơ chế (tái dùng nền có sẵn, KHÔNG engine mới):
//   1) Chạy realisticStrategySim MỘT LẦN mỗi beast trên TRAIN → buildCardAtlas = passport per-regime (30/100 gate)
//   2) Chạy MỘT LẦN mỗi beast trên TEST → thu trades có entry-time
//   3) Với mỗi nến test t: fingerprintAt(t) causal → regime → router chọn beast có atlas-TRAIN verdict FITS ở
//      regime đó (evidence USABLE ưu tiên; nhiều beast FITS → điểm regime-edge cao hơn; không beast FITS → NO_ACTION)
//   4) Portfolio = gộp trade của beast ĐƯỢC CHỌN tại từng nến (một beast cầm lái mỗi thời điểm) → PF/coverage/gap/overlap
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import { runRealisticBacktest } from "../realisticSimRun.ts";
import { buildCardAtlas, type CardAtlas } from "../strategyAtlas.ts";
import { fingerprintAt, environmentFingerprint, type EnvironmentFingerprint } from "../environmentFingerprint.ts";
import { composeBeast } from "./beastCompose.ts";
import { beastMembers, trendRetestMembers } from "./breakoutLiquidityBeast.ts";

export const CONDUCTOR_CAN_EMIT_ORDER = false as const;

const BEASTS = [
  { beast: "FULL breakout-liquidity", members: beastMembers },
  { beast: "TREND_RETEST_V1", members: trendRetestMembers },
];

export interface RegimePassport { regime: string; verdict: string; evidence: string; trades: number; netR: number; edgePerTrade: number }
export interface BeastPassport { beast: string; regimes: RegimePassport[] }
interface CompiledBeast { beast: string; modules: string[]; customs: import("../customModule.ts").CustomModule[]; atlasTrain: CardAtlas }

function compile(memberFn: () => import("./beastCompose.ts").BeastMember[]): { modules: string[]; customs: import("../customModule.ts").CustomModule[] } {
  const c = composeBeast(memberFn());
  return { modules: c.modules, customs: c.customModules };
}
function regimeCells(atlas: CardAtlas): RegimePassport[] {
  const dim = atlas.dimensions.find((d) => d.dimension === "regime");
  return (dim?.cells || []).map((c) => ({ regime: c.key, verdict: c.verdict, evidence: c.evidence, trades: c.trades, netR: c.netR, edgePerTrade: c.trades > 0 ? +(c.netR / c.trades).toFixed(4) : 0 }));
}

// pick beast từ một fingerprint đã tính (dùng chung cho router per-bar batch + routePickAt public)
function pickFromFp(fp: EnvironmentFingerprint | null, passports: BeastPassport[]): string {
  if (!fp) return "NO_ACTION";
  let best: { beast: string; edge: number } | null = null;
  for (const p of passports) {
    const cell = p.regimes.find((r) => r.regime === fp.regime);
    if (!cell || cell.verdict !== "FITS") continue;               // chỉ beast CÓ NĂNG LỰC ở regime này mới được lái
    if (cell.evidence === "INSUFFICIENT_SAMPLE") continue;         // thiếu mẫu → không claim fit (passport gate)
    if (!best || cell.edgePerTrade > best.edge) best = { beast: p.beast, edge: cell.edgePerTrade };
  }
  return best ? best.beast : "NO_ACTION";                          // không beast nào đủ năng lực → IM LẶNG (hợp lệ)
}
// ── ROUTER causal: tại nến t, đọc regime từ fingerprint ≤ t, chọn beast có passport-TRAIN FITS ở regime đó ──
// Chữ ký CỐ Ý chỉ (bars, t, passports) — KHÔNG có kết quả tương lai, KHÔNG có PF/thắng-thua gần đây (no recency).
export function routePickAt(bars: OhlcBar[], t: number, passports: BeastPassport[]): string {
  return pickFromFp(fingerprintAt(bars, t), passports);
}

export interface Solo { beast: string; n: number; netR: number; pf: number }
export interface Portfolio {
  n: number; netR: number; pf: number; win: number; maxDD: number;
  coveragePct: number;   // % nến test có ÍT NHẤT 1 beast FITS (thị trường có beast phù hợp)
  gapPct: number;        // % nến test KHÔNG beast nào phù hợp (khoảng trống — NO_ACTION)
  overlapPct: number;    // % nến test có ≥2 beast cùng FITS (chồng lấn năng lực)
  noActionBars: number;
}
export interface ConductorResult {
  trainRange: string; testRange: string; testStartIndex: number;
  passports: BeastPassport[];
  solos: Solo[];
  portfolio: Portfolio;
  verdict: "ROUTED_EDGE_SHADOW" | "NO_EDGE_EVEN_ROUTED" | "INSUFFICIENT_COVERAGE";
}

function pf(trades: { netR: number }[]): number {
  let up = 0, dn = 0; for (const t of trades) { if (t.netR >= 0) up += t.netR; else dn -= t.netR; }
  return dn > 0 ? +(up / dn).toFixed(3) : up > 0 ? Infinity : 0;
}

export function runConductor(bars: OhlcBar[]): ConductorResult {
  const cut = Math.floor(bars.length * 0.6);
  const train = bars.slice(0, cut), test = bars.slice(cut);
  const compiled: CompiledBeast[] = BEASTS.map((b) => {
    const { modules, customs } = compile(b.members);
    const bt = runRealisticBacktest(train, { id: b.beast, name: b.beast, modules, design_tf: "M15" }, { symbol: "XAUUSD", chartTf: "M15", customModules: customs });
    return { beast: b.beast, modules, customs, atlasTrain: buildCardAtlas(train, bt, { cardId: b.beast }) };
  });
  const passports: BeastPassport[] = compiled.map((c) => ({ beast: c.beast, regimes: regimeCells(c.atlasTrain) }));

  // chạy mỗi beast trên TEST một lần; index trade theo entryI để router "lấy trade của beast được chọn tại nến"
  const testRuns = compiled.map((c) => {
    const bt = runRealisticBacktest(test, { id: c.beast, name: c.beast, modules: c.modules, design_tf: "M15" }, { symbol: "XAUUSD", chartTf: "M15", customModules: c.customs });
    const byEntry = new Map<number, { netR: number }>();
    for (const tr of bt.sim.trades || []) byEntry.set(tr.entryI, { netR: tr.netR });
    return { beast: c.beast, trades: bt.sim.trades || [], byEntry };
  });
  const solos: Solo[] = testRuns.map((r) => ({ beast: r.beast, n: r.trades.length, netR: +r.trades.reduce((s, t) => s + t.netR, 0).toFixed(1), pf: pf(r.trades) }));

  // ROUTING trên TEST: mỗi nến → beast cầm lái (causal) → nếu beast đó CÓ trade entry tại nến này thì nhận.
  // fingerprint tính MỘT LẦN (batch O(n) — CAUSAL by construction) thay vì per-bar O(n²).
  const fps = environmentFingerprint(test);
  const routed: { netR: number }[] = [];
  let coverBars = 0, gapBars = 0, overlapBars = 0, noAction = 0;
  for (let t = 0; t < test.length; t++) {
    const fp = fps[t];
    const fits = fp ? passports.filter((p) => { const c = p.regimes.find((r) => r.regime === fp.regime); return c && c.verdict === "FITS" && c.evidence !== "INSUFFICIENT_SAMPLE"; }) : [];
    if (fits.length >= 1) coverBars++; else { gapBars++; noAction++; }
    if (fits.length >= 2) overlapBars++;
    const pick = pickFromFp(fp, passports);
    if (pick === "NO_ACTION") continue;
    const run = testRuns.find((r) => r.beast === pick)!;
    const tr = run.byEntry.get(t);       // beast được chọn có VÀO LỆNH tại nến này không
    if (tr) routed.push(tr);
  }
  let peak = 0, dd = 0, cum = 0, wins = 0;
  for (const x of routed) { cum += x.netR; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); if (x.netR > 0) wins++; }
  const portfolio: Portfolio = {
    n: routed.length, netR: +cum.toFixed(1), pf: pf(routed), win: routed.length ? +(wins / routed.length * 100).toFixed(1) : 0, maxDD: +dd.toFixed(1),
    coveragePct: +(coverBars / test.length * 100).toFixed(1), gapPct: +(gapBars / test.length * 100).toFixed(1),
    overlapPct: +(overlapBars / test.length * 100).toFixed(1), noActionBars: noAction,
  };
  const verdict = portfolio.coveragePct < 5 ? "INSUFFICIENT_COVERAGE" : portfolio.pf > 1 ? "ROUTED_EDGE_SHADOW" : "NO_EDGE_EVEN_ROUTED";
  const rng = (a: OhlcBar[]) => `${a[0]?.t.slice(0, 10)}→${a[a.length - 1]?.t.slice(0, 10)}`;
  return { trainRange: rng(train), testRange: rng(test), testStartIndex: cut, passports, solos, portfolio, verdict };
}
