// Shared read-only bundle polling. One in-flight request per key; no outcome/order operations.
import { useCallback, useSyncExternalStore } from "react";
import { MT5_API, useTerminalGeneration } from "./mt5Connection.ts";
import type { Mt5LiveBundle, Mt5ChartBar } from "./mt5DemoAdapter.ts";
type Snapshot = { data: Mt5LiveBundle | null; error: string | null; checkedAt: number };
const EMPTY: Snapshot = { data: null, error: null, checkedAt: 0 };
type Entry = { snapshot: Snapshot; listeners: Set<() => void>; controller?: AbortController; timer?: ReturnType<typeof setTimeout>; refresh?: () => void; bundleAt?: number };
const cache = new Map<string, Entry>();
export function freshWorkspaceBars(bars: Mt5ChartBar[] | undefined, tf: string, now = Date.now()) {
  if (!bars || bars.length < 2) return false;
  const time = bars[bars.length - 1].t;
  const age = now - Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(time) ? time : `${time.replace(" ", "T")}Z`);
  const minutes: Record<string, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080 };
  return Number.isFinite(age) && age >= -60000 && age <= ((minutes[tf] || 1) * 2 + 3) * 60000;
}
export function useLiveWorkspaceQuery(symbol: string, tf: string, tradeTf: string, direction: string, count: number, enabled: boolean) {
  const generation = useTerminalGeneration();
  const key = `${MT5_API}|${generation}|${symbol}|${tf}|${tradeTf}|${direction}|${count}`;
  const subscribe = useCallback((notify: () => void) => {
    if (!enabled) return () => {};
    let entry = cache.get(key);
    if (!entry) { if (cache.size > 12) for (const [oldKey, old] of cache) if (!old.listeners.size) cache.delete(oldKey); entry = { snapshot: EMPTY, listeners: new Set() }; cache.set(key, entry); }
    const slot = entry; slot.listeners.add(notify);
    if (slot.listeners.size === 1) {
      const pull = async () => {
        clearTimeout(slot.timer); if (document.hidden || !slot.listeners.size || slot.controller) return;
        const controller = new AbortController(); slot.controller = controller;
        const deadline = setTimeout(() => controller.abort(), 10000);
        try {
          // Preserve the chart's 5s bar cadence; heavier advisory/diagnostic bundle refreshes at 15s.
          const bundleDue = !slot.snapshot.data || Date.now() - (slot.bundleAt || 0) >= 15000;
          const params = new URLSearchParams({ symbol, tf, trade_tf: tradeTf, dir: direction, n: String(count) });
          const response = await fetch(`${MT5_API}/${bundleDue ? "live_bundle" : "bars"}?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP_${response.status}`);
          const payload = await response.json();
          const data: Mt5LiveBundle = bundleDue ? payload : { ...slot.snapshot.data, bars: payload.bars };
          if (bundleDue) slot.bundleAt = Date.now();
          if (slot.listeners.size && !controller.signal.aborted) { slot.snapshot = { data, error: null, checkedAt: Date.now() }; slot.listeners.forEach((listener) => listener()); }
        } catch (error) {
          if (slot.listeners.size && !document.hidden) { slot.snapshot = { data: null, error: String((error as Error).message || error), checkedAt: Date.now() }; slot.listeners.forEach((listener) => listener()); }
        } finally { clearTimeout(deadline); slot.controller = undefined; if (slot.listeners.size && !document.hidden) slot.timer = setTimeout(pull, slot.snapshot.error ? 30000 : 5000); }
      };
      slot.refresh = () => { if (document.hidden) { clearTimeout(slot.timer); slot.controller?.abort(); } else void pull(); };
      document.addEventListener("visibilitychange", slot.refresh); void pull();
    }
    return () => { slot.listeners.delete(notify); if (!slot.listeners.size) { clearTimeout(slot.timer); slot.controller?.abort(); if (slot.refresh) document.removeEventListener("visibilitychange", slot.refresh); } };
  }, [key, enabled]);
  const read = useCallback(() => enabled ? cache.get(key)?.snapshot || EMPTY : EMPTY, [key, enabled]);
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
