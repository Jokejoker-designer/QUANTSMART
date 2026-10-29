// marketSnapshotStore — canonical as-of identity shared by Compatibility, Anchor and Conductor.
// A different source/tape is a different snapshot; consumers must display it instead of silently comparing labels.
import type { SnapshotShape } from "./signatureBuild.ts";

export type MarketSnapshotSource = "HISTORICAL_SIM" | "MT5_LIVE" | "UNKNOWN";
export interface MarketSnapshotEnvelope {
  snapshot: SnapshotShape;
  source: MarketSnapshotSource;
  as_of: string;
  symbol: string;
  timeframe: string;
  identity: string;
}

const LS_KEY = "mfe_market_snapshot";
export const MARKET_SNAPSHOT_EVENT = "mfe-market-snapshot";

export function marketSnapshotIdentity(snapshot: SnapshotShape, source: MarketSnapshotSource): string {
  return `${source}:${snapshot.symbol}:${snapshot.timeframe}:${snapshot.timestamp}:${snapshot.snapshot_id}`;
}

export function createMarketSnapshotEnvelope(snapshot: SnapshotShape, source: MarketSnapshotSource): MarketSnapshotEnvelope {
  return {
    snapshot, source, as_of: snapshot.timestamp, symbol: snapshot.symbol, timeframe: snapshot.timeframe,
    identity: marketSnapshotIdentity(snapshot, source),
  };
}

export function validateMarketSnapshotEnvelope(value: unknown): value is MarketSnapshotEnvelope {
  if (!value || typeof value !== "object") return false;
  const env = value as MarketSnapshotEnvelope;
  const snap = env.snapshot;
  if (!snap || typeof snap !== "object" || typeof snap.snapshot_id !== "string" || !snap.snapshot_id) return false;
  if (!Object.keys({ HISTORICAL_SIM: 1, MT5_LIVE: 1, UNKNOWN: 1 }).includes(env.source)) return false;
  if (env.as_of !== snap.timestamp || env.symbol !== snap.symbol || env.timeframe !== snap.timeframe) return false;
  if (!snap.timestamp || Number.isNaN(Date.parse(snap.timestamp)) || !snap.measurements || typeof snap.measurements !== "object") return false;
  return env.identity === marketSnapshotIdentity(snap, env.source);
}

export interface SnapshotCoherence {
  status: "MATCH" | "MISMATCH" | "INVALID";
  identity: string | null;
  reason: string;
}

/** Machine gate used before combining Compatibility/Anchor/Conductor output. */
export function assessSnapshotCoherence(envelopes: unknown[]): SnapshotCoherence {
  if (!envelopes.length || envelopes.some((x) => !validateMarketSnapshotEnvelope(x))) {
    return { status: "INVALID", identity: null, reason: "One or more consumers have no valid Market Snapshot envelope." };
  }
  const ids = [...new Set((envelopes as MarketSnapshotEnvelope[]).map((x) => x.identity))];
  return ids.length === 1
    ? { status: "MATCH", identity: ids[0], reason: "All consumers use the same source/symbol/timeframe/as-of/snapshot id." }
    : { status: "MISMATCH", identity: null, reason: `Consumers reference ${ids.length} different Market Snapshot identities.` };
}

export function publishMarketSnapshot(snapshot: SnapshotShape, source: MarketSnapshotSource): MarketSnapshotEnvelope {
  const env = createMarketSnapshotEnvelope(snapshot, source);
  try { localStorage.setItem(LS_KEY, JSON.stringify(env)); } catch { /* storage optional */ }
  try { window.dispatchEvent(new CustomEvent(MARKET_SNAPSHOT_EVENT, { detail: env })); } catch { /* non-browser */ }
  return env;
}

export function readMarketSnapshot(): MarketSnapshotEnvelope | null {
  try { const x = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return validateMarketSnapshotEnvelope(x) ? x : null; }
  catch { return null; }
}
