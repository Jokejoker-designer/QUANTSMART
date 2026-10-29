// marketDataSync — auto-feed (backfill) the OHLC gap from MT5 after the system was offline. When the user
// connects MT5 (DEMO), we pull the missing bars [lastBarInOurData → now] via the REAL copy_rates_range
// bridge and merge them into the tape. Persisted to localStorage so the extension survives reload.
// FAIL-CLOSED: if MT5 is not connected, nothing is fetched and NO bar is fabricated. DEMO-only · read-only.
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import { mt5History, liveSymbol, isOffline } from "./mt5DemoAdapter.ts";

const TF_MIN: Record<string, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080 };
const lsKey = (sym: string, tf: string) => `mfe_live_ext_${sym}_${tf}`;
const MAX_EXT = 6000;   // cap the live extension per tf → bounded localStorage (auto-poll can't grow it forever)

// normalize a bar timestamp to "YYYY-MM-DDTHH:MM:SS" (strip Z, unify separator) for ordering/dedup.
export const normT = (t: string): string => (t || "").replace("Z", "").replace(" ", "T").slice(0, 19);

// union + dedup by timestamp (b overrides a on collision) + chronological + re-index.
export function mergeBars(a: OhlcBar[], b: OhlcBar[]): OhlcBar[] {
  const m = new Map<string, OhlcBar>();
  for (const x of a) m.set(normT(x.t), x);
  for (const x of b) m.set(normT(x.t), { ...x, t: normT(x.t) });
  const out = [...m.values()].sort((x, y) => (normT(x.t) < normT(y.t) ? -1 : normT(x.t) > normT(y.t) ? 1 : 0));
  return out.map((bar, i) => ({ ...bar, i }));
}

export function getLiveExt(sym: string, tf: string): OhlcBar[] {
  try { const a = JSON.parse(localStorage.getItem(lsKey(sym, tf)) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function saveLiveExt(sym: string, tf: string, bars: OhlcBar[]) { try { localStorage.setItem(lsKey(sym, tf), JSON.stringify(bars)); } catch { /* quota */ } }
export function clearLiveExt(sym = "XAUUSD", tf?: string) {
  if (tf) localStorage.removeItem(lsKey(sym, tf));
  else for (const t of Object.keys(TF_MIN)) localStorage.removeItem(lsKey(sym, t));
}

export interface GapInfo { lastBarT: string; nowIso: string; missingMs: number; missingDays: number; missingBarsApprox: number; hasGap: boolean }
export function detectGap(lastBarT: string | null, tf: string): GapInfo | null {
  if (!lastBarT) return null;
  const tfMin = TF_MIN[tf] || 60;
  const lastMs = Date.parse(normT(lastBarT) + "Z");
  const now = new Date(); const nowMs = now.getTime();
  const missingMs = Math.max(0, nowMs - lastMs);
  return {
    lastBarT: normT(lastBarT), nowIso: now.toISOString().slice(0, 19),
    missingMs, missingDays: +(missingMs / 86400000).toFixed(1),
    missingBarsApprox: Math.round((missingMs / (tfMin * 60000)) * (5 / 7)),   // ~exclude weekends
    hasGap: missingMs > tfMin * 60000 * 2,
  };
}

export interface BackfillResult { ok: boolean; tf: string; added: number; totalExt: number; firstNew?: string; lastNew?: string; reason?: string }
// Pull [lastBarT → now] from MT5 for ONE tf, merge into the persisted extension. Fail-closed.
export async function backfillFromMt5(sym: string, tf: string, lastBarT: string): Promise<BackfillResult> {
  const r = await mt5History(liveSymbol(sym), tf, normT(lastBarT), new Date().toISOString().slice(0, 19));
  if (isOffline(r) || !(r as { ok?: boolean }).ok) return { ok: false, tf, added: 0, totalExt: getLiveExt(sym, tf).length, reason: isOffline(r) ? "SERVER_OFFLINE" : ((r as { reason?: string }).reason || "BROKER_NOT_CONNECTED") };
  const raw = ((r as { bars?: OhlcBar[] }).bars || []).filter((b) => normT(b.t) > normT(lastBarT));
  let ext = mergeBars(getLiveExt(sym, tf), raw);                      // dedup by timestamp (idempotent — repeat-safe)
  if (ext.length > MAX_EXT) ext = ext.slice(-MAX_EXT).map((b, i) => ({ ...b, i }));   // cap → quota-safe
  saveLiveExt(sym, tf, ext);
  return { ok: true, tf, added: raw.length, totalExt: ext.length, firstNew: raw[0]?.t, lastNew: raw[raw.length - 1]?.t };
}

// ── AUTO-SYNC (Tier 2) — periodic backfill with anti-duplicate + re-entrancy + throttle + backoff. The dedup itself is
// mergeBars (timestamp Map) so a poll can NEVER create duplicate bars; these guards stop overlapping/too-frequent runs
// (e.g. user toggling on/off, a slow poll still running when the next fires) and back off when MT5 is offline.
let _syncing = false;        // in-flight lock — only one sync at a time
let _lastSyncMs = 0;         // throttle anchor
let _failStreak = 0;         // consecutive offline failures → exponential backoff
const MIN_SYNC_MS = 20000;   // never sync more than once per 20s, no matter how fast the caller fires
export interface AutoSyncResult { ran: boolean; skipped?: "IN_FLIGHT" | "THROTTLED" | "BACKOFF"; status?: "OK" | "OFFLINE" | "NO_TAPE"; added: number; perTf: BackfillResult[]; at: string }
const stamp = () => new Date().toISOString().slice(0, 19);

// loadLastBar(tf) is injected by the caller (avoids a marketDataSync→loadSimOhlc import cycle: loadSimOhlc reads ext).
export async function autoSyncOnce(sym: string, tfs: string[], loadLastBar: (tf: string) => Promise<string | null>): Promise<AutoSyncResult> {
  const now = Date.now();
  if (_syncing) return { ran: false, skipped: "IN_FLIGHT", added: 0, perTf: [], at: stamp() };                 // don't run concurrently
  if (now - _lastSyncMs < MIN_SYNC_MS) return { ran: false, skipped: "THROTTLED", added: 0, perTf: [], at: stamp() };
  if (_failStreak >= 3 && now - _lastSyncMs < MIN_SYNC_MS * Math.min(_failStreak, 8)) return { ran: false, skipped: "BACKOFF", added: 0, perTf: [], at: stamp() };
  _syncing = true; _lastSyncMs = now;
  try {
    const perTf: BackfillResult[] = [];
    for (const tf of tfs) {
      const lt = await loadLastBar(tf);
      if (!lt) { perTf.push({ ok: false, tf, added: 0, totalExt: getLiveExt(sym, tf).length, reason: "NO_TAPE" }); continue; }
      const g = detectGap(lt, tf);
      if (!g?.hasGap) { perTf.push({ ok: true, tf, added: 0, totalExt: getLiveExt(sym, tf).length }); continue; }   // already current → no fetch
      perTf.push(await backfillFromMt5(sym, tf, lt));
    }
    const added = perTf.reduce((s, r) => s + r.added, 0);
    const offline = perTf.some((r) => r.reason === "SERVER_OFFLINE" || r.reason === "BROKER_NOT_CONNECTED");
    _failStreak = offline && added === 0 ? _failStreak + 1 : 0;       // back off only when truly offline, reset on any success
    return { ran: true, status: offline && added === 0 ? "OFFLINE" : "OK", added, perTf, at: stamp() };
  } finally { _syncing = false; }
}
