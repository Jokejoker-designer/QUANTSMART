// microscopeComputed — cụm aggregate HONESTY-CRITICAL của Microscope, tách khỏi JSX (WO UX2 Phase A).
// Công thức COPY NGUYÊN VĂN từ hàm `side()` inline cũ (Microscope.tsx dòng 481-485 + verdict edge dòng 494)
// — kể cả thứ tự toFixed (netR round TRƯỚC khi chia exp). KHÔNG "sửa cho hợp lý hơn": snapshot harness chốt
// từng giá trị; đổi công thức = test đỏ = vi phạm presentation-only.
// PURE — không side-effect, không JSX. Guard: microscopeComputed.harness.ts.

export interface CompareCardSummary {
  n: number;
  netR: number;
  exp: number | null;
  pf: number;
  grossPf: number;
  dd: number;
  win: number;
  edge: boolean;   // verdict "CÓ edge sau phí (cửa sổ này)" = pf > 1 && netR > 0
}

interface BtLike {
  sim: { trades: { netR: number }[] };
  analytics: { netPF: number; grossPF: number; maxDDNetR: number };
}

export function compareCardSummary(bt2: BtLike): CompareCardSummary {
  const t = bt2.sim.trades || [];
  const netR = +t.reduce((s: number, x: { netR: number }) => s + x.netR, 0).toFixed(1);
  const n = t.length;
  const exp = n ? +(netR / n).toFixed(4) : null;
  const pf = bt2.analytics.netPF, grossPf = bt2.analytics.grossPF, dd = bt2.analytics.maxDDNetR;
  const win = n ? +(t.filter((x: { netR: number }) => x.netR > 0).length / n * 100).toFixed(1) : 0;
  return { n, netR, exp, pf, grossPf, dd, win, edge: pf > 1 && netR > 0 };
}

export function replayLastIndex(count:number, source:string):number { return Math.max(0,count-(source==="Live"?2:1)); }


import { CSV_MINUTES } from "./csvOhlc.ts";
import { diagnoseCardTriggers } from "./cardTriggerDiagnosis.ts";
import { getCardRuntimeConfig, TF_MINUTES } from "./simTimeframe.ts";
import type { StrategyCardArtifactRecord } from "./artifactRegistry.ts";

export function microscopeCsvSupports(sourceTf: string, targetTf: string): boolean {
  const source = CSV_MINUTES[sourceTf], target = CSV_MINUTES[targetTf];
  return Boolean(source && target && target >= source && target % source === 0);
}

export function microscopeCardIssue(card: StrategyCardArtifactRecord | null, options: {
  source: "CSV" | "Replay" | "Live";
  csvTf?: string;
  liveReady?: boolean;
  customTriggerIds: readonly string[];
  primaryTf?: string;
  primaryIntrabar?: boolean;
}): string | null {
  if (!card) return null;
  const runtime = getCardRuntimeConfig(card);
  const { design_tf: design, allowed_execution_tf: execution } = runtime;
  if (["GUARD", "CONFIRMATION", "EXIT_SENTINEL", "SCOUT", "FALLBACK", "SAFETY"].includes(String(card.role)))
    return `${String(card.role).replace(/_/g, " ")} is a supporting role. Inspect its modules below or evaluate it inside a Beast with an Attacker.`;
  if (!diagnoseCardTriggers(card.modules).count && !card.modules.some(id => options.customTriggerIds.includes(id)))
    return "No explicit entry trigger. Review the Card modules or add a trigger in Strategy Canvas.";
  if (options.source === "CSV") {
    if (!options.csvTf) return "Select or import a CSV for this Card.";
    if (!microscopeCsvSupports(options.csvTf, design))
      return `The selected CSV is ${options.csvTf}; this Card needs ${design}. Choose a compatible CSV, another Card, or Replay.`;
    if (TF_MINUTES[execution] < TF_MINUTES[design] && options.csvTf !== "M1")
      return `This Card needs ${execution} intrabar history. Select an M1 CSV for the execution path.`;
  }
  if (options.source === "Live" && options.liveReady === false)
    return "Closed MT5 candles are unavailable. Connect MT5 or explicitly choose Replay or CSV.";
  if (options.primaryTf && design !== options.primaryTf)
    return `Comparison requires the same design timeframe. This Card uses ${design}; the primary Card uses ${options.primaryTf}.`;
  if (options.primaryTf && (options.primaryIntrabar || execution !== design))
    return "Side-by-side comparison requires both Cards to use design-close execution.";
  return null;
}
