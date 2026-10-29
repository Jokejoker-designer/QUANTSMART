// RESEARCH / SHADOW_ONLY / NO_DECISION. Same-origin local compute, never broker execution.
import { useEffect, useMemo, useState } from "react";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { RealisticBacktest, RealisticBacktestOptions } from "./realisticSimRun.ts";
import type { CalibrationReport } from "./coefficientCalibration.ts";
import { getCardRuntimeConfig } from "./simTimeframe.ts";
export const RESEARCH_STORAGE_KEYS = ["mfe_coef_profile", "mfe_custom_modules", "mfe_custom_l1", "mfe_custom_l2", "mfe_custom_l3", "mfe_custom_l4_recipe", "mfe_custom_l5_recipe", "mfe_custom_l6"];
export function researchStorage() { const result: Record<string, string> = {}; for (const key of RESEARCH_STORAGE_KEYS) { try { const value = localStorage.getItem(key); if (value !== null) result[key] = value; } catch { /* read-only context */ } } return result; }
interface ResearchRequest { purpose?: "publication"; source?: "Replay"|"Live"|"CSV"; stage?: "Y10"|"M6"|"M1"; kind: "calibration" | "backtest" | "market" | "diagnostic"; analysis?: "ablation"|"funding"|"beast_roles"; parameters?: unknown; count?: number; mode?: "m1" | "design"; dataset?: { symbol: string; tf: string; from?: string; to?: string; expectedCount?: number; expectedHash?: string; first?: string; last?: string }; bars?: OhlcBar[]; card?: unknown; options?: RealisticBacktestOptions; storage?: Record<string, string> }
interface Job { id: string; status: "queued" | "running" | "done" | "failed" | "cancelled"; error?: string }
export interface ResearchJobLifecycle { cancelOnAbort?: boolean; onProgress?: (status: Job["status"]) => void }
export interface ResearchReceipt { job_id:string; input_hash:string; engine_hash:string; source_hash?:string; verified:true }
export type ResearchBacktest = RealisticBacktest & { researchReceipt: ResearchReceipt };
async function jsonRequest<T>(url: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const timeout = new AbortController();
  const abort = () => timeout.abort(); signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) timeout.abort(); const deadline = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: timeout.signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`); return data as T;
  } finally { clearTimeout(deadline); signal?.removeEventListener("abort", abort); }
}
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
});
export async function runResearchJob<T>(request: ResearchRequest, signal?: AbortSignal, lifecycle?: ResearchJobLifecycle): Promise<T> {
  if(signal?.aborted)throw new DOMException("Cancelled", "AbortError");
  let job: Job | undefined;
  try {
  // Manual cancellable runs get their own identity; cancelling cannot kill a shared cached job.
  job = await jsonRequest<Job>("/api/research/jobs", lifecycle?.cancelOnAbort ? undefined : signal, lifecycle?.cancelOnAbort ? { ...request, manual_run_id: crypto.randomUUID() } : request);
  if(signal?.aborted)throw new DOMException("Cancelled", "AbortError");
  lifecycle?.onProgress?.(job.status); const start = Date.now();
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() - start > 150000) throw new Error("RESEARCH_JOB_TIMEOUT");
    await pause(document.hidden ? 2500 : 500, signal);
    job = await jsonRequest<Job>(`/api/research/jobs/${job.id}`, signal);
    lifecycle?.onProgress?.(job.status);
  }
  if (job.status !== "done") throw new Error(job.error || "RESEARCH_JOB_CANCELLED");
  const completed = await jsonRequest<{ result: T; input_hash:string; engine_hash:string; provenance?:{dataHash:string} }>(`/api/research/jobs/${job.id}/result`, signal);
  return request.kind === "backtest" ? { ...completed.result, researchReceipt: {job_id:job.id,input_hash:completed.input_hash,engine_hash:completed.engine_hash,source_hash:completed.provenance?.dataHash,verified:true} } : completed.result;
  } catch (error) {
    if(signal?.aborted && lifecycle?.cancelOnAbort && !job)throw new Error("CANCELLATION_NOT_CONFIRMED");
    if (signal?.aborted && lifecycle?.cancelOnAbort && job && (job.status === "queued" || job.status === "running")) {
      const cancelled = await fetch(`/api/research/jobs/${job.id}`, { method: "DELETE", signal: AbortSignal.timeout(5000) });
      if (!cancelled.ok) throw new Error("CANCELLATION_NOT_CONFIRMED");
    }
    throw error;
  }
}
export function runCalibrationJob(symbol: string, signal?: AbortSignal) { return runResearchJob<CalibrationReport>({ kind: "calibration", dataset: { symbol, tf: "H1" }, storage: {} }, signal); }
export function runDetachedBacktest(bars: OhlcBar[], card: unknown, options: RealisticBacktestOptions, mode:"design"|"m1"="design") { return runResearchJob<ResearchBacktest>({ kind: "backtest", mode, bars, card, options, storage: researchStorage() }); }

// No synchronous simulator call in React render. Any previous result is hidden as soon as inputs change.
export function useResearchBacktest(bars: OhlcBar[] | null | undefined, card: unknown, options: RealisticBacktestOptions, mode: "m1" | "design" = "design", historical = false, source?: "Replay"|"Live"|"CSV", stage?: "Y10"|"M6"|"M1") {
  const settings = JSON.stringify({ card, options, storage: researchStorage() });
  const request = useMemo<ResearchRequest | null>(() => {
    if (!card || !bars || bars.length <= 60) return null;
    const { card: frozenCard, options: frozenOptions, storage } = JSON.parse(settings);
    const dataset = historical ? { symbol: frozenOptions.symbol || "XAUUSD", tf: mode === "m1" ? "M1" : getCardRuntimeConfig(frozenCard).design_tf, from: bars[0].t, to: bars[bars.length - 1].t, expectedCount: bars.length, first: JSON.stringify(bars[0]), last: JSON.stringify(bars[bars.length - 1]) } : undefined;
    return { kind: "backtest", mode, source: source || (historical ? "Replay" : undefined), stage, card: frozenCard, options: frozenOptions, storage, ...(dataset ? { dataset } : { bars }) };
  }, [bars, settings, mode, historical, source, stage]);
  const [state, setState] = useState<{ request: ResearchRequest | null; result: ResearchBacktest | null; error: string | null }>({ request: null, result: null, error: null });
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const execute = async () => {
        let input = request;
        if (request.dataset && bars) {
          const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(bars)));
          const expectedHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
          input = { ...request, dataset: { ...request.dataset, expectedHash } };
        }
        if (controller.signal.aborted) return;
        const result = await runResearchJob<ResearchBacktest>(input, controller.signal);
        if (!controller.signal.aborted) setState({ request, result: request.mode === "design" ? { ...result, designBars: bars || [] } : result, error: null });
      };
      execute().catch((error) => { if (!controller.signal.aborted) setState({ request, result: null, error: String(error.message || error) }); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [request]);
  const current = state.request === request;
  return { result: current ? state.result : null, error: current ? state.error : null, pending: !!request && !current };
}

export function runResearchAnalysis<T>(analysis:"ablation"|"funding"|"beast_roles",bars:OhlcBar[],card:unknown,parameters:unknown):Promise<T>{return runResearchJob<T>({kind:"diagnostic",analysis,bars,card,parameters,storage:researchStorage()});}
