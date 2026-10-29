// One SSE subscription per asset/timeframe/account. No history or strategy recompute per tick.
import { useCallback, useSyncExternalStore } from "react";
import { MT5_API, invalidateTerminalData, useTerminalGeneration } from "./mt5Connection.ts";
import { parseLiveTickFrame, type LiveTickFrame } from "./liveTickModel.ts";
type State = { frame: LiveTickFrame | null; status: "connecting" | "live" | "reconnecting" | "paused" | "stale"; received: number; checkedAt: number };
const EMPTY: State = { frame: null, status: "connecting", received: 0, checkedAt: 0 };
type Slot = { state: State; listeners: Set<() => void>; source?: EventSource; stop?: () => void };
const slots = new Map<string, Slot>();
export function useLiveTickFeed(symbol: string, tf: string, enabled: boolean) {
  const generation = useTerminalGeneration();
  const key = `${generation}|${symbol}|${tf}`;
  const subscribe = useCallback((notify: () => void) => {
    if (!enabled) return () => {};
    let slot = slots.get(key);
    if (!slot) { for (const [oldKey, old] of slots) if (!old.listeners.size) slots.delete(oldKey); slot = { state: EMPTY, listeners: new Set() }; slots.set(key, slot); }
    const entry = slot; entry.listeners.add(notify);
    const publish = (state: State) => { entry.state = state; entry.listeners.forEach(listener => listener()); };
    if (entry.listeners.size === 1) {
      const connect = () => {
        entry.source?.close();
        if (document.hidden) { publish({ ...entry.state, status: "paused" }); return; }
        const params = new URLSearchParams({ symbol, tf, ...(entry.state.frame ? { cursor: entry.state.frame.cursor } : {}) });
        const source = new EventSource(`${MT5_API}/stream?${params}`); entry.source = source;
        source.addEventListener("tick", event => {
          if (!(event instanceof MessageEvent) || typeof event.data !== "string") return;
          let value: unknown; try { value = JSON.parse(event.data); } catch { return; }
          const frame = parseLiveTickFrame(value); if (!frame) { publish({ ...entry.state, frame: null, status: "stale" }); return; }
          const latest = frame.ticks[frame.ticks.length - 1];
          const age = latest ? Date.now() - latest.time_msc : Infinity;
          publish({ frame, status: age >= -60000 && age < 180000 ? "live" : "stale", received: entry.state.received + frame.ticks.length, checkedAt: Date.now() });
        });
        source.addEventListener("status", () => publish({ ...entry.state, frame: null, status: "reconnecting" }));
        source.addEventListener("reset", () => { source.close(); publish(EMPTY); invalidateTerminalData(); });
        source.onerror = () => publish({ ...entry.state, frame: null, status: "reconnecting" });
      };
      const freshness = setInterval(() => { if (entry.state.status === "live" && Date.now() - entry.state.checkedAt > 5000) publish({ ...entry.state, status: "stale" }); }, 1000);
      document.addEventListener("visibilitychange", connect); connect();
      entry.stop = () => { clearInterval(freshness); entry.source?.close(); document.removeEventListener("visibilitychange", connect); };
    }
    return () => { entry.listeners.delete(notify); if (!entry.listeners.size) { entry.stop?.(); entry.state = EMPTY; } };
  }, [key, symbol, tf, enabled]);
  const read = useCallback(() => enabled ? slots.get(key)?.state || EMPTY : EMPTY, [key, enabled]);
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
