// Compatibility types for the local read-only MT5 data bridge.
// Demo and Real accounts may provide data; legacy mutation requests are rejected locally.
import { isOffline, type Offline } from "./signatureClient.ts";
import { MT5_API } from "./mt5Connection.ts";

export interface Mt5DemoAccountInfo {
  connected: boolean; account_id?: string; account_kind: "DEMO" | "REAL" | "UNKNOWN";
  server?: string; broker?: string; trade_allowed: boolean; reason?: string;
  balance?: number | null; equity?: number | null; currency?: string;
}
export interface Mt5LiveBar {
  symbol: string; timeframe: string; time: string;
  open: number; high: number; low: number; close: number;
  tick_volume?: number; spread?: number | null; real_volume?: number;
}
export interface Mt5DemoOrderRequest {
  symbol: string; side: "LONG_SCENARIO" | "SHORT_SCENARIO"; lot: number; comment: string; magic?: number;
  sl?: number; tp?: number;   // optional USER-set protective stop / target, sent to the broker with the order
}
export interface Mt5DemoOrderResult {
  accepted: boolean; demo_only: true; broker_order_id?: string | null; reason?: string; raw_status?: string;
}
export interface Mt5Position { broker_order_id: string; symbol: string; side: "LONG_SCENARIO" | "SHORT_SCENARIO"; lot: number; open_price: number; current_price: number; floating_pnl: number; sl?: number; tp?: number }

// cockpit symbol → live MT5 broker symbol. Alias mặc-định (XM spot gold thường là GOLD.i#) NHƯNG tên vàng khác nhau
// theo sàn/loại tài-khoản → cho OVERRIDE qua localStorage `mfe_live_symbol` (user nhập đúng tên trong Market Watch của mình).
const SYMBOL_ALIAS: Record<string, string> = {};
export const liveSymbol = (cockpitSymbol: string): string => {
  try { const o = localStorage.getItem("mfe_live_symbol"); if (o && o.trim()) return o.trim(); } catch { /* localStorage blocked */ }
  return SYMBOL_ALIAS[cockpitSymbol] || cockpitSymbol;
};
export function setLiveSymbolOverride(sym: string): void { try { if (sym.trim()) localStorage.setItem("mfe_live_symbol", sym.trim()); else localStorage.removeItem("mfe_live_symbol"); } catch { /* */ } }
export function getLiveSymbolOverride(): string { try { return localStorage.getItem("mfe_live_symbol") || ""; } catch { return ""; } }

const jh = (): Record<string, string> => ({ "Content-Type": "application/json" });   // /mt5/* needs no token (demo-only, real blocked)
async function req<T>(path: string, opts: RequestInit = {}): Promise<T | Offline> {
  // Only read requests are supported through this compatibility adapter. Account changes
  // use the separate typed connector; old execution/admin POST calls cannot reach a broker.
  if (opts.method && opts.method !== "GET") return { offline: true, error: "READ_ONLY_CONNECTOR" };
  if (!path.startsWith("/mt5/")) return { offline: true, error: "LOCAL_SOURCE_UNAVAILABLE" };
  try { const r = await fetch(MT5_API + path.slice(4), opts); return (await r.json()) as T; }
  catch (e) { return { offline: true, error: String((e as Error)?.message || e) }; }
}
export { isOffline };

export const mt5Account = () => req<Mt5DemoAccountInfo>("/mt5/account", { headers: jh() });
// P4: real broker contract spec (digits/tick value/contract size) → lifts cost/spec calibration when MT5 is connected
export interface Mt5SymbolSpec { ok: boolean; symbol?: string; digits?: number; point?: number; trade_tick_size?: number; trade_tick_value?: number; trade_contract_size?: number; volume_min?: number; volume_step?: number; volume_max?: number; swap_long?: number; swap_short?: number; utc_offset_hours?: number; reason?: string }
export const mt5SymbolSpec = (symbol = "XAUUSD") => req<Mt5SymbolSpec>("/mt5/symbol_spec?symbol=" + encodeURIComponent(symbol), { headers: jh() });
export const mt5Bar = (symbol = "XAUUSD", tf = "M15") => req<Mt5LiveBar | { bar: null; reason: string }>("/mt5/bar?symbol=" + encodeURIComponent(symbol) + "&tf=" + tf, { headers: jh() });
export const mt5Positions = (symbol = "") => req<{ positions: Mt5Position[] }>("/mt5/positions?symbol=" + encodeURIComponent(symbol), { headers: jh() });
export interface Mt5ChartBar { i: number; o: number; h: number; l: number; c: number; r: "N"; t: string }
export const mt5Bars = (symbol = "XAUUSD", tf = "M15", n = 300) => req<{ bars: Mt5ChartBar[] }>("/mt5/bars?symbol=" + encodeURIComponent(symbol) + "&tf=" + tf + "&n=" + n, { headers: jh() });
// backfill OHLC over a date RANGE [from, to] — auto-feed the gap after the system was offline. Fail-closed.
export interface Mt5History { ok: boolean; bars?: Mt5ChartBar[]; n?: number; reason?: string; detail?: string; from?: string; to?: string }
export const mt5History = (symbol = "XAUUSD", tf = "H1", from = "", to = "") =>
  req<Mt5History>("/mt5/history?symbol=" + encodeURIComponent(symbol) + "&tf=" + tf + "&from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to), { headers: jh() });
// LIVE advisory — the REAL Co-Trade Advisor run on live MT5 bars (read-only). `advice` is a TradeAdvice dict.
export interface Mt5AdviceResult { ok: boolean; reason?: string; detail?: string; advice?: Record<string, unknown> }
export const mt5Advice = (symbol = "XAUUSD", tradeTf = "H1", dir = "") => req<Mt5AdviceResult>("/mt5/advice?symbol=" + encodeURIComponent(symbol) + "&trade_tf=" + tradeTf + "&dir=" + encodeURIComponent(dir), { headers: jh() });
// candle radar — per-bar pattern markers (full declaration of what the detector measures + honest odds)
export interface CandleMarker {
  from_end: number; time: string; pattern: string; label: string; measures: string; reads: string;
  side: "low" | "high"; price: number; wick_atr: number; wick_threshold_atr: number | null;
  wick_unusual: boolean; close_pos: number | null; verdict: string | null; base_rate: number | null;
  conditional_rate: number | null; lift: number | null; sample_n: number | null; outcome: "correct" | "wrong" | "pending";
  why_factors?: string[]; context?: Record<string, unknown>;
  projection?: { dir: "up" | "down"; target: number; lo: number; hi: number; tol_atr: number; bars: number; atr_used?: number; atr_raw?: number; mtf_factor?: number; tf_ladder?: string[]; target_atr?: number; calibrated?: boolean; calib_n?: number };
  context_assessment?: "STRONG" | "WEAK" | "MIXED" | "NEUTRAL";
  lessons_applied?: { factor: string; kind: "strong" | "weak"; hit_rate: number | null; oos_hit_rate: number | null; lift: number; oos_lift: number | null; n: number }[];
}
export const mt5CandleMarkers = (symbol = "XAUUSD", tf = "M15", n = 200) =>
  req<{ ok: boolean; markers?: CandleMarker[]; reason?: string }>("/mt5/candle_markers?symbol=" + encodeURIComponent(symbol) + "&tf=" + tf + "&n=" + n, { headers: jh() });
export interface CandleLesson { factor: string; n: number; hit_rate: number | null; lift_vs_base: number | null; enough: boolean }
export const mt5CandleLessons = () =>
  req<{ ok: boolean; base_rate?: number | null; n?: number; rows?: CandleLesson[]; note?: string }>("/mt5/candle_lessons", { headers: jh() });
export const mt5Teach = (signalId: string, reason: string, factors: string[] = []) =>
  req<{ ok: boolean; total_annotations?: number }>("/mt5/teach", { method: "POST", headers: jh(), body: JSON.stringify({ signal_id: signalId, reason, factors }) });
export interface Mt5WeekHistory { ok: boolean; trades?: number; wins?: number; win_rate?: number | null; net_profit?: number; best?: number; worst?: number; currency?: string; reason?: string }
export const mt5WeekHistory = (symbol = "XAUUSD") => req<Mt5WeekHistory>("/mt5/week_history?symbol=" + encodeURIComponent(symbol), { headers: jh() });
export const mt5VoteLedger = (symbol = "XAUUSD") =>
  req<{ ok: boolean; total_votes?: number; up_votes?: number; down_votes?: number; measured_hit_rate_overall?: number }>("/mt5/vote_ledger?symbol=" + encodeURIComponent(symbol), { headers: jh() });
// secret admin (password-gated full inventory)
export const adminLogin = (user: string, pass: string) =>
  req<{ ok: boolean; token?: string; default_creds?: boolean; reason?: string }>("/admin/login", { method: "POST", headers: jh(), body: JSON.stringify({ user, pass }) });
export const adminInventory = (token: string, symbol = "XAUUSD", tradeTf = "H1") =>
  req<Record<string, unknown>>("/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ symbol, trade_tf: tradeTf }) });
export const mt5DemoOrder = (r: Mt5DemoOrderRequest) => req<Mt5DemoOrderResult>("/mt5/demo_order", { method: "POST", headers: jh(), body: JSON.stringify(r) });
export const mt5ClosePosition = (ticket: string | number) => req<Mt5DemoOrderResult>("/mt5/close_position", { method: "POST", headers: jh(), body: JSON.stringify({ ticket }) });
export const mt5ModifyPosition = (ticket: string | number, sl: number, tp: number) => req<Mt5DemoOrderResult>("/mt5/modify_position", { method: "POST", headers: jh(), body: JSON.stringify({ ticket, sl, tp }) });
export const mt5OrderAudit = (limit = 50) => req<{ ok: boolean; events?: Record<string, unknown>[] }>("/mt5/order_audit?limit=" + limit, { headers: jh() });

export interface Mt5LiveBundle {
  ok: boolean;
  account?: Mt5DemoAccountInfo;
  positions?: Mt5Position[];
  live_bar?: Mt5LiveBar | { bar: null; reason: string };
  bars?: Mt5ChartBar[];
  advice?: Mt5AdviceResult;
  candle_markers?: { ok: boolean; markers?: CandleMarker[]; reason?: string };
  week_history?: Mt5WeekHistory;
  observations?: { as_of: string; indicators: { ema10: number; ema34: number; atr14: number }; indicator_lookback: number };
  observations_by_tf?: Record<string, { as_of: string; indicators: { ema10: number; ema34: number; atr14: number }; indicator_lookback: number }>;
}
export const mt5LiveBundle = (symbol = "XAUUSD", tf = "M15", tradeTf = "H1", dir = "", n = 200) =>
  req<Mt5LiveBundle>(`/mt5/live_bundle?symbol=${encodeURIComponent(symbol)}&tf=${tf}&trade_tf=${tradeTf}&dir=${encodeURIComponent(dir)}&n=${n}`, { headers: jh() });

export interface SimTailResult {
  ok: boolean;
  symbol: string;
  timeframe: string;
  source?: string;
  n: number;
  total_n?: number;
  bars: Mt5ChartBar[];
}
export const simTailOhlc = async (symbol = "XAUUSD", tf = "M15", n = 700): Promise<SimTailResult | Offline> => {
  try {
    const { runResearchJob } = await import("./researchJobs.ts");
    const result = await runResearchJob<{ bars: Mt5ChartBar[]; total_bars: number }>({ kind: "market", dataset: { symbol, tf }, count: n, storage: {} });
    return { ok: true, symbol, timeframe: tf, source: "HISTORICAL_OHLC", n: result.bars.length, total_n: result.total_bars, bars: result.bars };
  } catch { return { offline: true, error: "HISTORICAL_DATA_UNAVAILABLE" }; }
};
