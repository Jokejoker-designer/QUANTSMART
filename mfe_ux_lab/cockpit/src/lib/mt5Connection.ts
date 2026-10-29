// Same-origin, read-only terminal connector. Secrets stay in the request and are never persisted.
import { useSyncExternalStore } from "react";
export const MT5_API = "/api/mt5";
export const MT5_CONNECTED_EVENT = "mfe-mt5-connected";
export const MT5_OPEN_DIALOG_EVENT = "mfe-mt5-open-dialog";
export interface TerminalAccount {
  connected: boolean; supported?: boolean; reason?: string; error?: string;
  account_id?: string; account_kind: "DEMO" | "REAL" | "UNKNOWN";
  server?: string; broker?: string; balance?: number | null; equity?: number | null;
  currency?: string; trade_allowed: false; generation?: number; read_only?: boolean;
}
export interface TerminalSettings { terminal_path?: string; login?: string; password?: string; server?: string }
export interface SymbolResolution { ok: boolean; canonical_symbol?: string; broker_symbol?: string; reason?: string; candidates: { name: string; description: string; base?: string; quote?: string }[] }
let generation = 0;
let attached = false;
let accountKey = "";
export const isTerminalAttached = () => attached;
export function observeTerminalAccount(account: TerminalAccount) {
  const becameConnected = !attached && account.connected;
  const nextKey = account.connected ? `${account.account_id}|${account.server}|${account.generation}` : "";
  if (nextKey !== accountKey) { accountKey = nextKey; invalidateTerminalData(); }
  attached = account.connected;
  if (becameConnected) window.dispatchEvent(new CustomEvent(MT5_CONNECTED_EVENT));
}
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function invalidateTerminalData() { generation++; listeners.forEach((listener) => listener()); }
export function useTerminalGeneration() { return useSyncExternalStore(subscribe, () => generation, () => 0); }
export async function terminalRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController(); const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetch(`${MT5_API}${path}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json", "X-MFE-Request": "1" }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: "same-origin" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "LOCAL_BRIDGE_UNAVAILABLE"); return data as T;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
export async function attachTerminal(settings: TerminalSettings = {}) {
  invalidateTerminalData();
  try {
    const account = await terminalRequest<TerminalAccount & { ok: boolean }>("/connect", settings);
    observeTerminalAccount(account);
    return account;
  } finally { invalidateTerminalData(); }
}
export async function detachTerminal() {
  attached = false;
  invalidateTerminalData();
  try { return await terminalRequest<TerminalAccount>("/disconnect", {}); }
  finally { invalidateTerminalData(); }
}
