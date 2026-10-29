// m1MasterData — M1 is the canonical master clock; all higher TF are resampled from the SAME M1
// stream (P1). Direct H1/M15 files are comparison-only. Carries data-reality + truth contract.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { loadSimM1Year } from "../adapters/loadSimOhlc.ts";
import { getActiveSymbol } from "./activeSymbolStore.ts";
import { analyzeDataReality, type DataRealityReport } from "./simDataReality.ts";
import { buildTruthContract, type SimulatorTruthContract } from "./simTruthContract.ts";
import { resampleM1, type ResampleTf, type ResampleResult } from "./resampleM1.ts";

export interface M1MasterDataset {
  symbol: string;
  source_tf: "M1";
  bars: OhlcBar[];
  start: string;
  end: string;
  timezoneStatus: "VERIFIED" | "PROVISIONAL" | "UNKNOWN";
  brokerTimeOffset?: string;
  dataReality: DataRealityReport;
  truthContract: SimulatorTruthContract;
}

export function buildM1Master(symbol: string, m1Bars: OhlcBar[], opts: { priceBasis?: "BID" | "ASK" | "MID" | "UNKNOWN"; timezoneStatus?: "VERIFIED" | "PROVISIONAL" | "UNKNOWN" } = {}): M1MasterDataset {
  const priceBasis = opts.priceBasis ?? "UNKNOWN";
  const timezoneStatus = opts.timezoneStatus ?? "PROVISIONAL";
  const dataReality = analyzeDataReality(m1Bars, { symbol, timeframe: "M1", priceBasis, timezoneStatus, spreadAvailable: false, volumeKind: "MISSING" });
  const truthContract = buildTruthContract({
    dataTruth: dataReality.dataTruth, priceBasis: dataReality.priceBasis, timezoneStatus: dataReality.timezoneStatus,
    costStatus: "PROVISIONAL", pathTruth: "M1_PATH_APPROX", executionTruth: "MODELED_NEXT_OPEN", brokerTimeOffset: "+03:00 (broker GMT+3 rollover)",
  });
  return {
    symbol, source_tf: "M1", bars: m1Bars,
    start: m1Bars.length ? m1Bars[0].t : "", end: m1Bars.length ? m1Bars[m1Bars.length - 1].t : "",
    timezoneStatus, brokerTimeOffset: "+03:00 (broker GMT+3 rollover)", dataReality, truthContract,
  };
}

export const SIX_TFS: ("M1" | ResampleTf)[] = ["M1", "M5", "M15", "H1", "H4", "D1"];

export interface YearAllTf {
  year: string;
  master: M1MasterDataset;
  resamples: Record<ResampleTf, ResampleResult>;
  tfBars: Record<string, OhlcBar[]>;     // all 6 TF bars (M1 + resampled), from the SAME M1 slice
}

// load M1 for a year and resample ALL 6 TF from that single M1 slice
export async function loadYearAllTfFromM1(year: string): Promise<YearAllTf | null> {
  const d = await loadSimM1Year(year);
  if (!d?.bars?.length) return null;
  const master = buildM1Master(getActiveSymbol(), d.bars);
  const tfs: ResampleTf[] = ["M5", "M15", "H1", "H4", "D1"];
  const resamples = {} as Record<ResampleTf, ResampleResult>;
  const tfBars: Record<string, OhlcBar[]> = { M1: d.bars };
  for (const tf of tfs) { const r = resampleM1(d.bars, tf); resamples[tf] = r; tfBars[tf] = r.bars; }
  return { year, master, resamples, tfBars };
}
