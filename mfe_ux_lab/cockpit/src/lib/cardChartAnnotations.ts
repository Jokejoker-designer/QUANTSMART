import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { CockpitActivity } from "./cockpitActivity.ts";
import type { DemoChartStatus } from "./useDemoChartStatus.ts";
import { TF_MINUTES, isTimeframe } from "./simTimeframe.ts";

export interface CardChartAnnotation {
  id: string;
  i: number;
  price: number;
  label: string;
  reason: string;
  time: string;
  evaluatedAt: string;
  votes: string[];
  tone: "vote" | "veto" | "modeled" | "wait" | "demo";
}

const instant = (stamp: string) => Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(stamp) ? stamp : stamp + "Z");

export function cardChartAnnotations(
  bars: OhlcBar[], activity: CockpitActivity | null | undefined, symbol: string, tf: string,
): CardChartAnnotation[] {
  if (!activity || activity.symbol !== symbol || activity.timeframe !== tf || !isTimeframe(tf)) return [];
  const indices = new Map<number, number>();
  for (let i = 0; i < bars.length; i++) {
    const at = instant(bars[i].t);
    if (!Number.isFinite(at) || indices.has(at)) return [];
    indices.set(at, i);
  }
  const latest = activity.evaluations[activity.evaluations.length - 1];
  const selected = activity.evaluations.filter(row => row.outcome === "VETO" ||
    row.outcome === "MODELED_ENTRY" || row.votes?.length).slice(-40);
  if (latest && !selected.includes(latest)) selected.push(latest);
  return selected.flatMap(row => {
    const at = instant(row.barTime);
    const i = indices.get(at);
    if (i === undefined || bars[i].c !== row.close || instant(row.at) !== at + TF_MINUTES[tf] * 60000) return [];
    const veto = row.outcome === "VETO" || row.outcome === "POLICY_BLOCKED" || row.outcome === "PLAN_REJECTED";
    const modeled = row.outcome === "MODELED_ENTRY";
    const tone = veto ? "veto" : modeled ? "modeled" : row.votes?.length ? "vote" : "wait";
    return [{
      id: activity.artifactHash + ":" + row.barTime + ":" + row.code,
      i, price: bars[i].c, time: row.barTime, evaluatedAt: row.at,
      label: veto ? "CARD VETO" : modeled ? "REPLAY ENTRY" : tone === "vote" ? "CARD VOTE" : "CARD WAIT",
      reason: row.reason,
      votes: row.votes?.map(vote => vote.reason + " · weight " + vote.weight) ?? [],
      tone,
    }];
  });
}


export function demoDecisionAnnotation(
  bars: OhlcBar[], runner: DemoChartStatus | null, cardId: string | undefined, symbol: string, tf: string,
): CardChartAnnotation | null {
  if (!runner?.lastClosedBar || !runner.decision || !cardId || runner.cardId !== cardId ||
      runner.symbol !== symbol || runner.timeframe !== tf || !isTimeframe(tf)) return null;
  const barTime = instant(runner.lastClosedBar);
  const indices = bars.map((bar, i) => instant(bar.t) === barTime ? i : -1).filter(i => i >= 0);
  if (indices.length !== 1) return null;
  const i = indices[0], close = barTime + TF_MINUTES[tf] * 60000;
  const at = runner.decision.time ? instant(runner.decision.time) : close;
  if (!Number.isFinite(at) || at !== close) return null;
  return {
    id: "demo:" + cardId + ":" + barTime + ":" + runner.decision.kind,
    i, price: bars[i].c, time: runner.lastClosedBar, evaluatedAt: new Date(at).toISOString(),
    label: "DEMO CARD " + runner.decision.kind, reason: runner.decision.reason,
    votes: [], tone: "demo",
  };
}
