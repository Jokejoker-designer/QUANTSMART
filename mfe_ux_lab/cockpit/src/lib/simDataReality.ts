// simDataReality — classify a dataset BEFORE simulating (P-1 Truth Foundation).
// Never let unknown data masquerade as exact truth.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { TF_MINUTES, parseBarTime, isTimeframe } from "./simTimeframe.ts";
import type { DataTruthLevel } from "./simTruthContract.ts";

export interface DataRealityReport {
  symbol: string;
  sourceTimeframe: string;
  bars: number;
  start: string;
  end: string;
  duplicateCount: number;
  missingBarEstimate: number;
  largeGapCount: number;
  frozenBarCount: number;
  invalidOhlcCount: number;
  spreadAvailable: boolean;
  volumeAvailable: boolean;
  volumeKind: "REAL" | "TICK" | "SYNTHETIC" | "MISSING" | "UNKNOWN";
  priceBasis: "BID" | "ASK" | "MID" | "UNKNOWN";
  timezoneStatus: "VERIFIED" | "PROVISIONAL" | "UNKNOWN";
  dataTruth: DataTruthLevel;
  warnings: string[];
}

export interface DataRealityInput {
  symbol: string;
  timeframe: string;
  priceBasis?: "BID" | "ASK" | "MID" | "UNKNOWN";
  timezoneStatus?: "VERIFIED" | "PROVISIONAL" | "UNKNOWN";
  spreadAvailable?: boolean;
  volumeKind?: DataRealityReport["volumeKind"];
}

function epochMin(iso: string): number {
  const p = parseBarTime(iso); if (!p.ok) return NaN;
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 60000;
}

export function analyzeDataReality(bars: OhlcBar[], inp: DataRealityInput): DataRealityReport {
  const warnings: string[] = [];
  const n = bars?.length || 0;
  const tf = inp.timeframe;
  const tfMin = isTimeframe(tf) ? TF_MINUTES[tf] : NaN;
  const priceBasis = inp.priceBasis ?? "UNKNOWN";
  const timezoneStatus = inp.timezoneStatus ?? "PROVISIONAL";
  const volumeKind = inp.volumeKind ?? "MISSING";

  let duplicateCount = 0, largeGapCount = 0, frozenBarCount = 0, invalidOhlcCount = 0;
  let missingBarEstimate = 0, nonMonotonic = 0;
  let prevMin = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (b.h < b.l || b.h < Math.max(b.o, b.c) - 1e-9 || b.l > Math.min(b.o, b.c) + 1e-9) invalidOhlcCount++;
    if (b.h === b.l && b.o === b.c && b.h === b.o) frozenBarCount++;
    const m = epochMin(b.t);
    if (!isNaN(m) && !isNaN(prevMin)) {
      const d = m - prevMin;
      if (d <= 0) { if (d === 0) duplicateCount++; else nonMonotonic++; }
      else if (!isNaN(tfMin)) {
        const steps = d / tfMin;
        if (steps > 1.5) {
          // weekend gap (Fri→Mon ≈ 2 days) is expected; only count non-weekend gaps as "missing"
          const gapMin = d - tfMin;
          const isWeekendish = gapMin >= 2 * 1440 - tfMin && gapMin <= 3 * 1440;
          if (steps > 6 && !isWeekendish) largeGapCount++;
          if (!isWeekendish) missingBarEstimate += Math.round(steps - 1);
        }
      }
    }
    if (!isNaN(m)) prevMin = m;
  }

  // data truth level from source TF + price basis
  let dataTruth: DataTruthLevel;
  if (isTimeframe(tf) && tf === "M1") {
    dataTruth = priceBasis === "MID" ? "M1_MID_OHLC" : priceBasis === "BID" || priceBasis === "ASK" ? "M1_BID_ASK" : "M1_UNKNOWN_PRICE_BASIS";
  } else {
    dataTruth = "HTF_OHLC_ONLY";
  }

  if (n === 0) warnings.push("No bars — NO_DATA honesty.");
  if (duplicateCount) warnings.push(duplicateCount + " duplicate timestamps.");
  if (nonMonotonic) warnings.push(nonMonotonic + " non-monotonic timestamps.");
  if (invalidOhlcCount) warnings.push(invalidOhlcCount + " invalid OHLC bars (h<l or wick logic).");
  if (largeGapCount) warnings.push(largeGapCount + " large non-weekend gaps.");
  if (priceBasis === "UNKNOWN") warnings.push("Price basis is unknown. Fill and cost are modeled.");
  if (!inp.spreadAvailable) warnings.push("No bid/ask spread in data — spread is modeled.");
  if (volumeKind === "MISSING" || volumeKind === "SYNTHETIC") warnings.push("Volume is " + volumeKind + " — NOT EVIDENCE.");
  if (timezoneStatus !== "VERIFIED") warnings.push("Timezone is " + timezoneStatus + " (sessions assume UTC0 tape, broker GMT+3 rollover).");

  return {
    symbol: inp.symbol, sourceTimeframe: tf, bars: n,
    start: n ? bars[0].t : "", end: n ? bars[n - 1].t : "",
    duplicateCount, missingBarEstimate, largeGapCount, frozenBarCount, invalidOhlcCount,
    spreadAvailable: !!inp.spreadAvailable, volumeAvailable: volumeKind !== "MISSING", volumeKind,
    priceBasis, timezoneStatus, dataTruth, warnings,
  };
}
