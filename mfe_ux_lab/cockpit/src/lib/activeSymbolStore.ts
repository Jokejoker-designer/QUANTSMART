// activeSymbolStore — the ONE global "which asset are we on" for the header symbol dropdown. Switching here
// changes the whole cockpit's asset context (spec + readiness). Default XAUUSD, so every existing page that
// doesn't read this store behaves EXACTLY as before (regression-safe). Event-driven, localStorage-persisted.
import type { AssetClass } from "./assetLearning/contracts.ts";

export interface SymbolInfo {
  symbol: string;
  label: string;
  brokerSymbol: string;      // MT5 alias (e.g. XM spot gold = GOLD.i#)
  assetClass: AssetClass;
  hasLocalData: boolean;     // do we ship 11y M1 tapes for this asset? (only gold today)
}

// The registry is deliberately small + honest: gold has data; the others are SELECTABLE but data-gated — the
// Asset Readiness view will say "chưa đủ dữ liệu để học" until their history is ingested (F1).
export const SYMBOL_REGISTRY: SymbolInfo[] = [
  { symbol: "XAUUSD", label: "XAUUSD / GOLD", brokerSymbol: "GOLD.i#", assetClass: "METAL", hasLocalData: true },
  { symbol: "EURUSD", label: "EURUSD", brokerSymbol: "EURUSD", assetClass: "FX", hasLocalData: false },
  { symbol: "GBPUSD", label: "GBPUSD", brokerSymbol: "GBPUSD", assetClass: "FX", hasLocalData: false },
  { symbol: "USDJPY", label: "USDJPY", brokerSymbol: "USDJPY", assetClass: "FX", hasLocalData: false },
  { symbol: "BTCUSD", label: "BTCUSD", brokerSymbol: "BTCUSD", assetClass: "CRYPTO", hasLocalData: false },
];

const LS_KEY = "mfe_active_symbol";
export const SYMBOL_CHANGED_EVENT = "mfe-symbol-changed";

export function symbolInfo(symbol: string): SymbolInfo {
  return SYMBOL_REGISTRY.find((s) => s.symbol === symbol.toUpperCase()) ||
    { symbol: symbol.toUpperCase(), label: symbol.toUpperCase(), brokerSymbol: symbol.toUpperCase(), assetClass: "UNKNOWN", hasLocalData: false };
}

export function getActiveSymbol(): string {
  try { return (localStorage.getItem(LS_KEY) || "XAUUSD").toUpperCase(); } catch { return "XAUUSD"; }
}

export function setActiveSymbol(symbol: string): void {
  const s = symbol.toUpperCase();
  try { localStorage.setItem(LS_KEY, s); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SYMBOL_CHANGED_EVENT, { detail: s }));
}
