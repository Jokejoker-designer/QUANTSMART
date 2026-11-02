import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { CChartLine } from "../components/CockpitChart.tsx";
export interface BrokerPosition {
  symbol: string;
  side: "BUY" | "SELL";
  open_price: number;
  sl: number;
  tp: number;
}
export function brokerPositionLines(
  positions: BrokerPosition[],
  brokerSymbol: string,
): CChartLine[] {
  return positions
    .filter(
      (p) =>
        p.symbol === brokerSymbol &&
        Number.isFinite(p.open_price) &&
        p.open_price > 0,
    )
    .flatMap((p) => [
      {
        price: p.open_price,
        label: `DEMO ${p.side} entry`,
        color: p.side === "BUY" ? "var(--bull-green)" : "var(--bear-red)",
        dash: true,
      },
      ...(Number.isFinite(p.sl) && p.sl > 0
        ? [
            {
              price: p.sl,
              label: "DEMO broker SL",
              color: "var(--bear-red)",
              dash: true,
            },
          ]
        : []),
      ...(Number.isFinite(p.tp) && p.tp > 0
        ? [
            {
              price: p.tp,
              label: "DEMO broker TP",
              color: "var(--bull-green)",
              dash: true,
            },
          ]
        : []),
    ]);
}
export interface BrokerDeal {
  id: string;
  positionId: string;
  symbol: string;
  brokerSymbol: string;
  time: string;
  timeMs: number;
  side: "BUY" | "SELL";
  entryKind: "ENTRY" | "EXIT" | "REVERSAL" | "EXIT_BY" | "UNKNOWN";
  price: number;
  volume: number;
  positionSide: "BUY" | "SELL" | null;
  source: "MT5_DEMO_DEAL_HISTORY";
}
export interface BrokerChartMarker {
  id: string;
  i: number;
  price: number;
  label: string;
  detail: string;
  color: string;
}
export function brokerDealMarkers(
  bars: OhlcBar[],
  deals: BrokerDeal[],
  symbol: string,
  minutes: number,
): BrokerChartMarker[] {
  if (!(minutes > 0) || !bars.length) return [];
  const times = bars.map((b) =>
    Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(b.t) ? b.t : b.t + "Z"),
  );
  return deals
    .filter(
      (d) => d.symbol === symbol && Number.isFinite(d.price) && d.price > 0,
    )
    .flatMap((deal) => {
      let lo = 0,
        hi = times.length - 1,
        found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (times[mid] <= deal.timeMs) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (found < 0 || deal.timeMs >= times[found] + minutes * 60000) return [];
      const kind =
        deal.entryKind === "ENTRY"
          ? deal.side
          : deal.entryKind === "EXIT" || deal.entryKind === "EXIT_BY"
            ? "CLOSE"
            : deal.entryKind;
      return [
        {
          id: deal.id,
          i: found,
          price: deal.price,
          label: `DEMO ${kind}`,
          detail: `${deal.entryKind} · ${deal.side} execution · ${deal.volume} lots · ${deal.price} · ${deal.time} · position ${deal.positionId} · broker deal ${deal.id}`,
          color:
            kind === "CLOSE"
              ? "var(--accent-cyan)"
              : deal.side === "BUY"
                ? "var(--bull-green)"
                : "var(--bear-red)",
        },
      ];
    });
}
