// affinityObserved — sinh ma trận Tribe Affinity từ SỐ ĐO thật (leave-base-in pair runs trên ONE engine),
// KHÔNG BAO GIỜ từ giả định. Mặc định của mọi cặp tribe là UNTESTED (xám) — một ô chỉ đổi trạng thái khi
// có ≥1 cặp module ĐO ĐƯỢC thoả gate: cùng dấu train/held + |dExp| ≥ floor + đủ mẫu cả hai cửa sổ.
// Band (−100..+100) mô tả FIT không phải strength; INSUFFICIENT_EVIDENCE là kết quả hợp lệ (doctrine F0).
import type { OhlcBar } from "../../adapters/loadOhlcReplayChart.ts";
import type { Tribe } from "./vocabulary.ts";
import { affinityBand } from "./vocabulary.ts";
import type { SynergyState } from "./vocabulary.ts";
import { runBeastArm } from "./beastCompose.ts";
import { censusOf } from "./moduleRoleCensus.ts";
import { SYNERGY_BUDGET } from "./budget.ts";

export interface PairEvidence {
  base: string[];           // attacker modules (arm A)
  add: string;              // module thêm vào (arm A+B) — tribes đọc từ census
  dExpTrain: number; dExpHeld: number;
  nTrain: number; nHeld: number;
}
export interface AffinityCell {
  tribes: [string, string];
  state: SynergyState;
  band: string;             // AFFINITY_BANDS label
  score: number;            // −100..100 (mean của các cặp qualifying)
  evidence: PairEvidence[];
  note: string;
}

const EXP_FLOOR = 0.02;     // |dExp| tối thiểu để tính là tín hiệu (dưới = nhiễu)

/** Đo N cặp (base attacker + 1 module thêm) trên train/held — TÁI DÙNG arm base (budget: 2 + 2·pairs runs ≤ 12). */
export function measurePairs(bars: OhlcBar[], base: string[], adds: string[], hard = false): PairEvidence[] {
  const cut = Math.floor(bars.length * 0.7);
  const train = bars.slice(0, cut), held = bars.slice(cut);
  const budgetPairs = Math.min(adds.length, SYNERGY_BUDGET.MAX_PAIRS_PER_BATCH);
  const bTr = runBeastArm(train, base, [], hard), bHo = runBeastArm(held, base, [], hard);
  const out: PairEvidence[] = [];
  for (const add of adds.slice(0, budgetPairs)) {
    const tr = runBeastArm(train, [...base, add], [], hard);
    const ho = runBeastArm(held, [...base, add], [], hard);
    out.push({
      base, add,
      dExpTrain: +(((tr.exp ?? 0) - (bTr.exp ?? 0))).toFixed(4), dExpHeld: +(((ho.exp ?? 0) - (bHo.exp ?? 0))).toFixed(4),
      nTrain: tr.n, nHeld: ho.n,
    });
  }
  return out;
}

/** Tổng hợp evidence → ô affinity theo cặp tribe (tribe của base attacker × tribe của module thêm). */
export function observeAffinity(pairs: PairEvidence[]): AffinityCell[] {
  const cells = new Map<string, AffinityCell>();
  for (const p of pairs) {
    const aTribes = [...new Set(p.base.flatMap((m) => censusOf(m)?.tribes || []))] as Tribe[];
    const bTribes = (censusOf(p.add)?.tribes || []) as Tribe[];
    const sameSign = Math.sign(p.dExpTrain) === Math.sign(p.dExpHeld) && p.dExpTrain !== 0;
    const material = Math.min(Math.abs(p.dExpTrain), Math.abs(p.dExpHeld)) >= EXP_FLOOR;
    const enoughN = p.nTrain >= SYNERGY_BUDGET.MIN_TRADES_PER_BUCKET && p.nHeld >= 10;
    const qualifies = sameSign && material && enoughN;
    for (const ta of aTribes) for (const tb of bTribes) {
      if (ta === tb) continue;
      const key = [ta, tb].sort().join("|");
      const cell = cells.get(key) || { tribes: [ta, tb].sort() as [string, string], state: "UNTESTED" as SynergyState, band: "NEUTRAL_NO_CONCLUSION", score: 0, evidence: [], note: "" };
      cell.evidence.push(p);
      if (qualifies) {
        // score từ dExp trung bình 2 cửa sổ, scale 0.1R → 100 (cùng chuẩn Effect của passport)
        const s = Math.max(-100, Math.min(100, ((p.dExpTrain + p.dExpHeld) / 2 / 0.1) * 100));
        const prevQ = cell.state === "COMPLEMENTARY" || cell.state === "CONFLICTED" ? 1 : 0;
        cell.score = +((cell.score * prevQ + s) / (prevQ + 1)).toFixed(1);
        cell.state = cell.score > 0 ? "COMPLEMENTARY" : "CONFLICTED";
        cell.band = affinityBand(cell.score);
        cell.note = `ĐO: dExp ${p.dExpTrain}/${p.dExpHeld} cùng dấu, n=${p.nTrain}/${p.nHeld}`;
      } else if (cell.state === "UNTESTED") {
        cell.state = "INSUFFICIENT_EVIDENCE";
        cell.note = !enoughN ? `mẫu mỏng (n=${p.nTrain}/${p.nHeld})` : !sameSign ? `đảo dấu train/held (${p.dExpTrain}/${p.dExpHeld})` : `dưới floor ${EXP_FLOOR}R (${p.dExpTrain}/${p.dExpHeld})`;
      }
      cells.set(key, cell);
    }
  }
  return [...cells.values()];
}

// ── store (localStorage) — BeastBuilder đọc để tô màu formation; mọi ô không có trong store = UNTESTED ──
const LS_KEY = "mfe_affinity_observed";
export function saveAffinity(cells: AffinityCell[]) { try { localStorage.setItem(LS_KEY, JSON.stringify(cells)); } catch { /* ignore */ } }
export function loadAffinity(): AffinityCell[] { try { const a = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
export function affinityOf(tribeA: string, tribeB: string): AffinityCell | null {
  const key = [tribeA, tribeB].sort().join("|");
  return loadAffinity().find((c) => c.tribes.join("|") === key) || null;
}
