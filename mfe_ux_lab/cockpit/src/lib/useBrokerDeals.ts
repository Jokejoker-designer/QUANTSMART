import { useEffect, useState } from "react";
import { terminalRequest, useTerminalGeneration } from "./mt5Connection.ts";
import type { BrokerDeal } from "./brokerDealMarkers.ts";
import {
  brokerPositionLines,
  type BrokerPosition,
} from "./brokerDealMarkers.ts";
import type { CChartLine } from "../components/CockpitChart.tsx";
export function useBrokerDeals(symbol: string, enabled: boolean) {
  const generation = useTerminalGeneration();
  const [state, setState] = useState<{
    key: string;
    deals: BrokerDeal[];
    lines: CChartLine[];
    error: string | null;
  }>({ key: "", deals: [], lines: [], error: null });
  const key = `${symbol}:${generation}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const [result, positions] = await Promise.all([
          terminalRequest<{
            ok: boolean;
            deals: BrokerDeal[];
            reason?: string;
            brokerSymbol: string;
            generation: number;
          }>(
            `/demo/deals?symbol=${encodeURIComponent(symbol)}&limit=500`,
            undefined,
            controller.signal,
          ),
          terminalRequest<{
            ok: boolean;
            generation: number;
            positions: BrokerPosition[];
          }>("/demo/positions", undefined, controller.signal),
        ]);
        if (active)
          setState({
            key,
            deals: result.ok ? result.deals : [],
            lines:
              result.ok &&
              positions.ok &&
              positions.generation === result.generation
                ? brokerPositionLines(positions.positions, result.brokerSymbol)
                : [],
            error: result.ok
              ? null
              : result.reason || "Broker fills unavailable",
          });
      } catch {
        if (active && !controller.signal.aborted)
          setState({
            key,
            deals: [],
            lines: [],
            error: "Broker fills unavailable",
          });
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    window.addEventListener("mfe-demo-execution-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("mfe-demo-execution-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, enabled, symbol]);
  return enabled && state.key === key
    ? state
    : { key, deals: [], lines: [], error: null };
}
