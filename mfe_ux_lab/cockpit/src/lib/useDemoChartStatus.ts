import { useEffect, useState } from "react";
import { useTerminalGeneration } from "./mt5Connection.ts";

export interface DemoChartStatus {
  state: "STOPPED" | "RUNNING" | "STARTING";
  cardId: string | null;
  cardName: string | null;
  symbol: string | null;
  timeframe: string | null;
  lastClosedBar: string | null;
  reason: string | null;
  decision: { kind: string; reason: string; time: string | null } | null;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function parse(value: unknown): DemoChartStatus | null {
  if (!object(value) || !["STOPPED", "RUNNING", "STARTING"].includes(String(value.state))) return null;
  if (value.state !== "STOPPED" && value.state !== "RUNNING" && value.state !== "STARTING") return null;
  const { cardId, cardName, symbol, timeframe, lastClosedBar, reason } = value;
  if (!nullableString(cardId) || !nullableString(cardName) || !nullableString(symbol) ||
    !nullableString(timeframe) || !nullableString(lastClosedBar) || !nullableString(reason)) return null;
  let decision: DemoChartStatus["decision"] = null;
  if (value.lastDecision !== null) {
    const row = value.lastDecision;
    if (!object(row) || typeof row.kind !== "string" ||
      (row.reason !== undefined && typeof row.reason !== "string") ||
      (row.signalTime !== undefined && typeof row.signalTime !== "string")) return null;
    const reasons = Array.isArray(row.why) && row.why.every(reason => typeof reason === "string") ? row.why.join(" · ") : "";
    decision = { kind: row.kind, reason: typeof row.reason === "string" ? row.reason : reasons || "Card evaluated",
      time: typeof row.signalTime === "string" ? row.signalTime : null };
  }
  return { state: value.state, cardId, cardName, symbol, timeframe, lastClosedBar, reason, decision };
}

export function useDemoChartStatus(enabled: boolean, cardId?: string) {
  const generation = useTerminalGeneration();
  const [support, setSupport] = useState<{ cardId: string; ok: boolean; reason: string; generation: number } | null>(null);
  useEffect(() => {
    const received = (event: Event) => {
      const data: unknown = event instanceof CustomEvent ? event.detail : null;
      if (object(data) && typeof data.cardId === "string" && typeof data.ok === "boolean" && typeof data.reason === "string")
        setSupport({ cardId: data.cardId, ok: data.ok, reason: data.reason, generation });
    };
    const clear = () => setSupport(null);
    window.addEventListener("mfe-card-demo-support", received);
    window.addEventListener("mfe-card-demo-support-clear", clear);
    return () => {
      window.removeEventListener("mfe-card-demo-support", received);
      window.removeEventListener("mfe-card-demo-support-clear", clear);
    };
  }, [generation]);
  const [value, setValue] = useState<{generation: number; status: DemoChartStatus | null; error: boolean}>(
    { generation, status: null, error: false });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true, timer: ReturnType<typeof setTimeout>;
    async function pull() {
      if (!active) return;
      if (!document.hidden) {
        try {
          const response = await fetch("/api/demo-runner/status", { signal: controller.signal });
          const payload: unknown = await response.json();
          const status = response.ok ? parse(payload) : null;
          if (active) setValue({ generation, status, error: status === null });
        } catch {
          if (active) setValue({ generation, status: null, error: true });
        }
      }
      if (active) timer = setTimeout(() => void pull(), 2000);
    }
    void pull();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [enabled, generation]);
  return enabled && value.generation === generation ? { ...value, support: support && support.cardId === cardId && support.generation === generation ? support : null } : null;
}
