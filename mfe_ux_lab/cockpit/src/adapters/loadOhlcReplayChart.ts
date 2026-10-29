// MORPHEUS · MFE X-Ray Lab — C13 OHLC replay adapter (sharded, full 581).
// Loads a small _index.json once, then lazily fetches one per-anchor shard
// (public/data/c13/<anchor>.json) on demand. Read-only. No KIDI/QTQ import, no CREM, no runtime.

export type Timeframe = "M1" | "M5" | "M15" | "H1" | "H4" | "D1";
export const TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15", "H1", "H4", "D1"];

export interface OhlcBar { i: number; o: number; h: number; l: number; c: number; r: "P" | "A" | "N"; t: string }

export interface C13Window {
  available: true;
  anchorId: string;
  timeframe: Timeframe;
  bars: OhlcBar[];
  windowStatus: "FULL" | "PARTIAL" | "INSUFFICIENT";
  preAvail: number | null;
  postAvail: number | null;
  shortWindow: boolean;
  anchorTs: string | null;
  sourcePolicy: string;
  status: "REAL_OHLC_REPLAY_CHART_BOUND";
}
export interface C13Missing { available: false; anchorId: string; timeframe: Timeframe; status: "OHLC_REPLAY_NOT_AVAILABLE" }
export type C13Result = C13Window | C13Missing;

interface IndexMeta { source_policy: string; source_hash: string; anchors_bound: number; windows_bound: number; short_window_count: number; window: { pre_bars: number; anchor_bar: number; post_bars: number } }
interface C13Index { _meta: IndexMeta; anchors: Record<string, { tfs: Timeframe[] }> }
interface ShardWindow { status: C13Window["windowStatus"]; pre: number | null; post: number | null; short: boolean; bars: OhlcBar[] }
interface Shard { anchor: string; tfs: Partial<Record<Timeframe, ShardWindow>> }

let _index: Promise<C13Index | null> | null = null;
const _shards = new Map<string, Promise<Shard | null>>();

function loadIndex(): Promise<C13Index | null> {
  if (_index) return _index;
  _index = fetch("data/c13/_index.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return _index;
}

function loadShard(anchorId: string): Promise<Shard | null> {
  let p = _shards.get(anchorId);
  if (!p) {
    p = fetch(`data/c13/${anchorId}.json`, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    _shards.set(anchorId, p);
  }
  return p;
}

export async function getC13(anchorId: string, timeframe: Timeframe): Promise<C13Result> {
  const [idx, shard] = await Promise.all([loadIndex(), loadShard(anchorId)]);
  const w = shard?.tfs?.[timeframe];
  if (!idx || !w || !w.bars || w.bars.length === 0) {
    return { available: false, anchorId, timeframe, status: "OHLC_REPLAY_NOT_AVAILABLE" };
  }
  const anchorBar = w.bars.find((b) => b.r === "A");
  return {
    available: true, anchorId, timeframe, bars: w.bars,
    windowStatus: w.status, preAvail: w.pre, postAvail: w.post, shortWindow: w.short,
    anchorTs: anchorBar?.t ?? null, sourcePolicy: idx._meta.source_policy,
    status: "REAL_OHLC_REPLAY_CHART_BOUND",
  };
}

// Set of anchor_ids that have any C13 OHLC window (for the "has C13" filter).
export async function c13AnchorSet(): Promise<Set<string>> {
  const idx = await loadIndex();
  return new Set(idx ? Object.keys(idx.anchors) : []);
}

export async function c13Meta() {
  const idx = await loadIndex();
  return idx?._meta ?? null;
}
