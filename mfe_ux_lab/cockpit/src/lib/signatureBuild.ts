// signatureBuild — turn a card's backtest entries into server-shaped entry records, and read the
// current-market snapshot. Pure (no I/O). The OWNER posts these records to /owner/build; the public
// posts the current snapshot to /qualify. Same MeasurementEngine builds both → self-consistent matching.
// F2 ONE-ENGINE FIX: records now come from the realistic engine of record (runRealisticBacktest) — the
// signature backend no longer learns from the legacy gross sim. Owner should REBUILD existing signatures.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { runRealisticBacktest } from "./realisticSimRun.ts";
import { MeasurementEngine } from "./measurements.ts";

export interface SnapshotShape { snapshot_id: string; symbol: string; timeframe: string; timestamp: string; measurements: Record<string, number> }
export interface EntryRecord {
  card_id: string; entry_id: string; entry_time: string; snapshot: SnapshotShape;
  outcome: { net_R: number; mfe_R: number; mae_R: number; result_label: "GOOD" | "BAD" };
  metadata: Record<string, unknown>;
}

/** Run one card on the ONE engine and return (designBars, realistic trades) — shared by signature + adaptive. */
export function realisticCardTrades(cardId: string, bars: OhlcBar[], modules: string[], autoRR: boolean, symbol: string, tf: string) {
  const mods = autoRR && !modules.includes("auto_rr") ? [...modules, "auto_rr"] : modules;
  const bt = runRealisticBacktest(bars, { id: cardId, name: cardId, modules: mods, design_tf: tf }, { symbol, chartTf: tf });
  return { db: bt.designBars ?? bars, trades: bt.sim.trades || [] };
}

/** Records for one card over a tape — snapshot at each entry bar (no-lookahead) + the realized outcome. */
export function cardEntryRecords(cardId: string, bars: OhlcBar[], modules: string[], autoRR = false, symbol = "XAUUSD", tf = "M15"): EntryRecord[] {
  if (!bars || bars.length < 120) return [];
  const { db, trades } = realisticCardTrades(cardId, bars, modules, autoRR, symbol, tf);
  const eng = new MeasurementEngine(db);
  return trades.map((t, k) => ({
    card_id: cardId,
    entry_id: "e_" + t.entryI + "_" + k,
    entry_time: db[t.entryI]?.t ?? t.signal_time,
    snapshot: eng.snapshotAt(Math.min(t.entryI, db.length - 1), symbol, tf),
    outcome: { net_R: t.netR, mfe_R: Math.max(0, t.netR), mae_R: t.netR < 0 ? Math.abs(t.netR) : 0, result_label: t.netR > 0 ? "GOOD" : "BAD" },
    metadata: { dir: t.dir, hour: t.hour },
  }));
}

/** The as-of-now market snapshot (last bar; uses only data ≤ last). */
export function currentSnapshot(bars: OhlcBar[], symbol = "XAUUSD", tf = "M15"): SnapshotShape | null {
  if (!bars || !bars.length) return null;
  return new MeasurementEngine(bars).snapshotAt(bars.length - 1, symbol, tf);
}
