// signatureClient — typed browser/node client for the owner-private signature server.
// Public calls (qualify) need NO token. Owner calls (build/signature/live) send Bearer <owner token>.
// The cockpit NEVER stores raw bands — owner endpoints are only used in explicit owner mode.
// Graceful: any network failure returns { offline:true } so the UI degrades instead of crashing.
import type { MarketSnapshotEnvelope } from "./marketSnapshotStore.ts";

export type UiStatus = "GOOD_FIT" | "CONDITIONAL_FIT" | "WATCH_ONLY" | "AVOID" | "BLOCKED";
export interface Verdict { card_id: string; ui_status: UiStatus }
export interface Board { good_fit: Verdict[]; watch: Verdict[]; avoid: Verdict[]; blocked: Verdict[]; story: string; authority: string; market_snapshot?: MarketSnapshotEnvelope }
export interface Health { ok: boolean; owner_configured: boolean; authority: string }
export interface LiveStatus { layer: string; status: "LIVE" | "LOCKED"; enabled: boolean; continuous: number; needs_continuous: number; fresh: boolean; reason: string }
export interface Offline { offline: true; error: string }
export const isOffline = (x: unknown): x is Offline => !!x && (x as Offline).offline === true;

const DEFAULT_BASE = "http://127.0.0.1:8787";
let memBase = DEFAULT_BASE, memToken = "";
const ls = (fn: () => string | null): string | null => { try { return fn(); } catch { return null; } };

export function sigBase(): string { return ls(() => localStorage.getItem("mfe_sig_base")) || memBase; }
export function setSigBase(b: string) { memBase = b; try { localStorage.setItem("mfe_sig_base", b); } catch { /* node */ } }
export function ownerToken(): string { return ls(() => localStorage.getItem("mfe_owner_token")) || memToken; }
export function setOwnerToken(t: string) { memToken = t; try { localStorage.setItem("mfe_owner_token", t); } catch { /* node */ } }
export function hasOwnerToken(): boolean { return !!ownerToken(); }

async function req<T>(path: string, opts: RequestInit = {}): Promise<T | Offline> {
  try {
    const r = await fetch(sigBase() + path, opts);
    return (await r.json()) as T;
  } catch (e) {
    return { offline: true, error: String((e as Error)?.message || e) };
  }
}
const ownerHeaders = (): Record<string, string> => ({ "Content-Type": "application/json", Authorization: "Bearer " + ownerToken() });
const jsonHeaders: Record<string, string> = { "Content-Type": "application/json" };

// ── public (no token) ──
export const health = () => req<Health>("/health");
export const qualifyPublic = (snapshot: unknown, safety_blocked = false, market_snapshot?: MarketSnapshotEnvelope) => req<Board>("/qualify", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ snapshot, safety_blocked, market_snapshot }) });
export const qualifyCard = (card_id: string, snapshot: unknown) => req<Verdict>("/qualify_card", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ card_id, snapshot }) });

// ── Phase D: Multi-Layer Adaptive Backtest ──
export interface MLCard { card_id: string; layer1_status: string; layer2_status: string; layer3_status: string; final_permission: string; best_sessions: string[]; best_hours_utc: string[]; avoid_sessions: string[]; avoid_hours_utc: string[]; why: string[] }
export interface MLBoard { cards: MLCard[]; authority: string }
export interface MLWindows { long: unknown[]; recent6m: unknown[]; current1m: unknown[] }
export const multiLayerPublic = () => req<MLBoard>("/multilayer");
export const ownerBuildMultiLayer = (card_id: string, windows: MLWindows, symbol = "XAUUSD", timeframe = "M15") => req<{ ok: boolean; card_id: string; layer1: string; layer2: string; layer3: string; final_permission: string; long_n: number; recent_n: number; current_n: number }>("/owner/multilayer/build", { method: "POST", headers: ownerHeaders(), body: JSON.stringify({ card_id, symbol, timeframe, windows }) });
export const ownerMultiLayerResult = (card_id: string) => req<Record<string, unknown>>("/owner/multilayer/result?card_id=" + encodeURIComponent(card_id), { headers: ownerHeaders() });

// ── Phase E: Market Anchor + Conductor + Explainability ──
export interface AnchorOut { anchor_state: string; market_pattern: { primary: string; secondary: string[]; confidence: number }; indicator_context: { ema_stack: string; rsi_state: string; atr_state: string; bollinger_state: string }; session_context: { session: string; hour_quality: string; broker_time_verified: boolean }; regime_context: { regime_state: string; transition_risk: string; mtf_alignment: string }; market_permissions: Record<string, string>; recommended_strategy_cards: { card_id: string; fit: string; reason: string }[]; blocked_cards: { card_id: string; fit: string; reason: string }[]; warnings: string[]; market_snapshot?: MarketSnapshotEnvelope }
export interface ConductCard { card_id: string; status: string; reason: string[] }
export interface ConductOut { best_fit_cards: ConductCard[]; watch_cards: ConductCard[]; avoid_cards: ConductCard[]; blocked_cards: ConductCard[]; conflict_report: { conflict_level: string; conflicts: unknown[]; resolution: string }; explanation: string; zone_only_overlays_enabled: boolean; market_snapshot?: MarketSnapshotEnvelope }
export interface GateOut { module_id: string; status: string; reasons: string[] }
export const anchorPublic = (features: unknown, cards: unknown[], symbol = "XAUUSD", timeframe = "M15", market_snapshot?: MarketSnapshotEnvelope) => req<AnchorOut>("/anchor", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ symbol, timeframe, features, cards, market_snapshot }) });
export const conductPublic = (features: unknown, cards: unknown[], safety_flags?: Record<string, boolean>, market_snapshot?: MarketSnapshotEnvelope) => req<ConductOut>("/conduct", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ symbol: market_snapshot?.symbol || "XAUUSD", timeframe: market_snapshot?.timeframe || "M15", features, cards, safety_flags, market_snapshot }) });
export const explainValidate = (explanation: unknown) => req<GateOut>("/explain/validate", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ explanation }) });

// ── owner (Bearer token) ──
export const ownerBuild = (card_id: string, records: unknown[]) => req<{ ok: boolean; card_id: string; successful_n: number; failed_n: number; stability: number }>("/owner/build", { method: "POST", headers: ownerHeaders(), body: JSON.stringify({ card_id, records }) });
export const ownerSignature = (card_id: string) => req<Record<string, unknown>>("/owner/signature?card_id=" + encodeURIComponent(card_id), { headers: ownerHeaders() });
export const ownerCards = () => req<{ cards: string[] }>("/owner/cards", { headers: ownerHeaders() });
export const liveStatus = () => req<LiveStatus>("/owner/live/status", { headers: ownerHeaders() });
export const liveHeartbeat = (score?: number) => req<LiveStatus>("/owner/live/heartbeat", { method: "POST", headers: ownerHeaders(), body: JSON.stringify({ score }) });

// ── per-asset self-learning governance (read-only) ──
export interface AssetGovernance {
  asset_key: string;
  manifest: { coverage?: { years?: number }; spec?: { source?: string }; volume_type?: string } | null;
  certification: { tier?: string; stage_ingest?: string; stage_gate?: string } | null;
  proposals: { status?: string; verdict?: string; model_hash?: string; gate_reason?: string; created_ts?: string }[];
  audits: { reviewer?: string; timestamp?: string; decision?: string; model_hash?: string }[];
  canonical: { active_version?: number | null; versions?: { version: number; status: string; verdict: string; created_ts?: string }[] } | null;
  cadence_runs: { job?: string; status?: string; ts?: string; attempts?: number; note?: string }[];
  cadence_state: Record<string, string>;
  drift: { verdict?: string; severity?: string; recommendation?: string; created_ts?: string; note?: string }[];
}
export const assetGovernance = (symbol: string, tf: string) =>
  req<AssetGovernance>("/owner/asset/governance?symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf), { headers: ownerHeaders() });
