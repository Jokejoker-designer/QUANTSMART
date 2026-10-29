// cardRunStore — THE single source of truth for a card's cascade run, shared between Microscope (writes) and
// Strategy Lab (reads). When the user clears Y10 → M6 → M1 in Microscope, each window's realistic result is
// recorded here keyed by the card + a CARD HASH. Strategy Lab reads it back so both pages show the SAME
// numbers (no duplicate engines, no fake Canvas numbers). Editing the card changes its hash → the old run is
// STALE → the card must be re-run. Persisted in localStorage (in-memory fallback for node/SSR).
import type { Stage } from "./stageWindow.ts";
import { researchContextHash, type RuntimeCard } from "./strategyIdentity.ts";
import { notifyWorkspaceChange } from "./workspaceClient.ts";

const ORDER: Stage[] = ["Y10", "M6", "M1"];

export interface RunWindow {
  stage: Stage;
  source: "Replay" | "Live" | "CSV" | "Input";
  from: string; to: string; n: number;        // exact date range used + bar count
  trades: number; netR: number; netPF: number; winRate: number; maxDD: number;
  verdict: string;                             // honesty trust (Y10) or "—"
  driftBlocked?: number;                       // entries the drift_guard circuit-breaker halted (card degrading)
  ruined?: boolean;                            // 💀 ACCOUNT_BLOWN trong cửa sổ này → engine NGỪNG giao dịch từ đó (đây là lý do Y10 có thể ÍT lệnh hơn M6)
  ruinTime?: string;                           // bar time lúc cháy vốn
  verified?: boolean;
  config_hash?: string;
  execution_mode?: string;
  receipt?: { job_id: string; input_hash: string; engine_hash: string; source_hash?: string };
  asOf: string;                                // ISO time this window was recorded (esp. for live M1)
  hard?: boolean;                              // recorded under HARD broker mode (×cost + min-stop floor) vs Normal
}
export interface CardRunRecord {
  card_id: string; card_hash: string; run_id: string; design_tf: string; ts: string;
  windows: Partial<Record<Stage, RunWindow>>;
}

// Versioned runtime/context hash: changing TF, asset, profile or module definitions invalidates old results.
export function cardHash(card: RuntimeCard): string { return researchContextHash(card); }

const LS_KEY = "mfe_card_runs";
const mem: Record<string, string> = {};
if(typeof window!=="undefined")window.addEventListener("mfe-workspace-persisted",()=>{delete mem[LS_KEY];});
// mem-FIRST. Every write ALSO lands in mem and reads PREFER mem. So a cascade recorded this session is always
// readable by Strategy Lab EVEN IF localStorage.setItem threw (quota — localStorage filled by cached OHLC / live
// backfill bars). The old code wrote the failed record only to mem but READ from localStorage (the stale copy
// without the new card) → Microscope showed results yet the Lab said "Chưa chạy". localStorage stays the
// best-effort cross-reload persistence layer.
const lsGet = (k: string): string | null => { if (mem[k] != null) return mem[k]; try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; } catch { return null; } };
const lsSet = (k: string, v: string): void => {
  mem[k] = v;
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(k, v); }
  catch {
    // quota full → evict the large, regenerable live-backfill bar caches (mfe_live_ext_*) then retry once, so the
    // small but critical cascade record actually PERSISTS across reloads instead of silently living only in mem.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key && key.startsWith("mfe_live_ext_")) localStorage.removeItem(key); }
      localStorage.setItem(k, v);
    } catch { /* still over quota: mem holds it for this session */ }
  }
};

export function loadCardRuns(): Record<string, CardRunRecord> { try { return JSON.parse(lsGet(LS_KEY) || "{}"); } catch { return {}; } }
export function getCardRun(cardId: string): CardRunRecord | null { return loadCardRuns()[cardId] ?? null; }

// upsert ONE window's result. If the card hash changed (card edited), start a FRESH record (drop stale windows).
export function recordWindow(card: RuntimeCard & { id: string }, win: RunWindow): CardRunRecord {
  const all = loadCardRuns(); const h = cardHash(card); let rec = all[card.id];
  if (!rec || rec.card_hash !== h) rec = { card_id: card.id, card_hash: h, run_id: "run_" + Date.now(), design_tf: card.design_tf ?? "", ts: "", windows: {} };
  if(Object.values(rec.windows).some(previous=>previous&&((previous.hard??false)!==(win.hard??false)||previous.config_hash!==win.config_hash||previous.receipt?.engine_hash!==win.receipt?.engine_hash)))rec={...rec,windows:{},run_id:"run_"+Date.now()};
  rec.windows[win.stage] = win; rec.ts = new Date().toISOString();
  all[card.id] = rec; lsSet(LS_KEY, JSON.stringify(all)); notifyWorkspaceChange();
  return rec;
}

export type RunState = "FRESH" | "PARTIAL" | "STALE" | "NONE";
export interface RunStatus { state: RunState; record: CardRunRecord | null; have: Stage[]; missing: Stage[] }
// FRESH = hash matches AND all 3 windows present. PARTIAL = hash matches, some windows. STALE = card edited
// since the run. NONE = never run.
export function runStatus(card: RuntimeCard & { id: string }): RunStatus {
  const rec = getCardRun(card.id);
  if (!rec) return { state: "NONE", record: null, have: [], missing: ORDER };
  if (rec.card_hash !== cardHash(card)) return { state: "STALE", record: rec, have: [], missing: ORDER };
  const measured=(stage:Stage)=>rec.windows[stage]?.verified===true&&!!rec.windows[stage]?.receipt;
  const have = ORDER.filter(measured); const missing = ORDER.filter((s) => !measured(s));
  return { state: missing.length === 0 ? "FRESH" : "PARTIAL", record: rec, have, missing };
}

// the next window the user still needs to run (in order), or null when complete.
export function nextNeeded(card: RuntimeCard & { id: string }): Stage | null {
  const st = runStatus(card); return st.missing.length ? st.missing[0] : null;
}
