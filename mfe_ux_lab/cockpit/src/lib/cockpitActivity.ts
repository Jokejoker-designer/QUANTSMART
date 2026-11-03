import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";
import type { StrategyCardArtifactRecord } from "./artifactRegistry.ts";
import { assessBeastLineage, type SavedBeast } from "./cardBeastV2/beastStore.ts";
import { composeBeast, type BeastMember } from "./cardBeastV2/beastCompose.ts";
import { ROLES } from "./cardBeastV2/vocabulary.ts";
import { diagnoseCardTriggers } from "./cardTriggerDiagnosis.ts";
import { loadCustomModules } from "./customModule.ts";
import { runRealisticBacktest } from "./realisticSimRun.ts";
import { getCardRuntimeConfig, isTimeframe, TF_MINUTES } from "./simTimeframe.ts";

export type ActivityArtifact =
  | { kind: "CARD"; value: StrategyCardArtifactRecord }
  | { kind: "BEAST"; value: SavedBeast; cards: StrategyCardArtifactRecord[] };

const memberOnly = new Set(["GUARD", "SCOUT", "CONFIRMATION", "EXIT_SENTINEL", "FALLBACK", "SAFETY"]);
const instant = (stamp: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(stamp) ? stamp : stamp + "Z");

export function measureCockpitActivity(bars: OhlcBar[], artifact: ActivityArtifact, symbol: string, tf: string) {
  if (!isTimeframe(tf) || bars.length < 120 || bars.length > 600) throw Error("ACTIVITY_REQUIRES_120_TO_600_CLOSED_BARS");
  let previous = -Infinity;
  for (const bar of bars) {
    const time = instant(bar.t);
    if (!Number.isFinite(time) || time <= previous || ![bar.o, bar.h, bar.l, bar.c].every(Number.isFinite) ||
      bar.l <= 0 || bar.l > Math.min(bar.o, bar.c) || bar.h < Math.max(bar.o, bar.c))
      throw Error("ACTIVITY_INVALID_CLOSED_TAPE");
    previous = time;
  }

  const customModules = loadCustomModules();
  let modules: string[];
  let members: BeastMember[] = [];
  let contributions: ReturnType<typeof composeBeast>["contributions"] = [];
  if (artifact.kind === "BEAST") {
    const beast = artifact.value;
    const lineage = assessBeastLineage(beast, artifact.cards);
    if (lineage.status !== "FRESH" || lineage.legacy_module_matches > 0)
      throw Error("ACTIVITY_BEAST_LINEAGE: " + lineage.issues.join(" · "));
    // Old starter Beasts were saved before an operating context was required.
    // Infer it only when every non-safety member has a matching saved Card.
    const memberCards = beast.members.filter(member => member.role !== "SAFETY")
      .map(member => artifact.cards.find(card => card.id === member.card_id));
    const saved = beast.context;
    const context = saved ?? memberCards[0];
    if (!context || context.symbol !== symbol || context.design_tf !== tf ||
        (context.execution_tf ?? context.design_tf) !== tf ||
        (!saved && memberCards.some(card => !card || card.symbol !== symbol || card.design_tf !== tf || (card.execution_tf ?? tf) !== tf)))
      throw Error("ACTIVITY_BEAST_CONTEXT_MISMATCH");
    if (beast.members.length > 12) throw Error("ACTIVITY_BEAST_MEMBER_LIMIT");
    members = beast.members.map(member => {
      const role = ROLES.find(value => value === member.role);
      if (!role) throw Error("ACTIVITY_INVALID_BEAST_ROLE");
      return { ...member, role, customs: customModules.filter(custom => member.modules.includes(custom.id)) };
    });
    const composed = composeBeast(members);
    if (!composed.ok) throw Error("ACTIVITY_BEAST_COMPOSITION: " + composed.errors.join(" · "));
    if (JSON.stringify([...composed.modules].sort()) !== JSON.stringify([...beast.modules].sort()))
      throw Error("ACTIVITY_BEAST_DEFINITION_CHANGED");
    modules = composed.modules;
    contributions = composed.contributions;
  } else {
    const card = artifact.value;
    const runtime = getCardRuntimeConfig(card);
    if ((card.symbol || "XAUUSD") !== symbol || runtime.design_tf !== tf || runtime.allowed_execution_tf !== tf)
      throw Error("ACTIVITY_DESIGN_CLOSE_ONLY");
    if (typeof card.role === "string" && memberOnly.has(card.role))
      throw Error("ACTIVITY_MEMBER_REQUIRES_BEAST");
    modules = card.modules;
  }
  const hasTrigger = (ids: string[]) => diagnoseCardTriggers(ids).count > 0 ||
    customModules.some(custom => ids.includes(custom.id) && custom.role === "TRIGGER");
  if (!hasTrigger(modules)) throw Error("ACTIVITY_EXPLICIT_TRIGGER_REQUIRED");

  const measure = (ids: string[]) => {
    const { sim } = runRealisticBacktest(bars, { id: artifact.value.id, modules: ids, design_tf: tf },
      { symbol, chartTf: tf, hard: true, customModules, captureEntryTrace: true });
    const trace = sim.entryTrace ?? [];
    return {
      trace,
      counts: {
        evaluated: new Set(trace.map(row => row.barIndex)).size,
        withVotes: trace.filter(row => row.votes?.length).length,
        vetoed: trace.filter(row => row.outcome === "VETO").length,
        modeledEntries: trace.filter(row => row.outcome === "MODELED_ENTRY").length,
        closedTrades: sim.trades.length,
      },
    };
  };
  const full = measure(modules);
  const comparisons = new Map<string, typeof full.counts>();
  function compareWithout(excluded: typeof contributions) {
    const retained = new Set(contributions.filter(row => !excluded.includes(row)).flatMap(row => row.used));
    const removed = [...new Set(excluded.flatMap(row => row.used))].filter(id => !retained.has(id));
    const reduced = modules.filter(id => !removed.includes(id));
    if (excluded.some(row => row.role === "ATTACKER") || !removed.length || !hasTrigger(reduced))
      return { removed, without: null };
    const key = JSON.stringify(reduced);
    const without = comparisons.get(key) ?? measure(reduced).counts;
    comparisons.set(key, without);
    return { removed, without };
  }
  const roles = [...new Set(contributions.map(row => row.role))].map(role => {
    const rows = contributions.filter(row => row.role === role);
    return {
      role, ...compareWithout(rows),
      members: rows.map(row => ({ ...row, name: artifact.kind === "BEAST"
        ? artifact.cards.find(card => card.id === row.card_id)?.name ?? row.card_id : row.card_id,
        ...(rows.length > 1 ? compareWithout([row]) : { removed: [], without: null }),
      })),
    };
  });
  return {
    artifactId: artifact.value.id, name: artifact.value.name, kind: artifact.kind,
    symbol, timeframe: tf, bars: bars.length, firstBar: bars[0].t, lastBar: bars[bars.length - 1].t,
    lastClose: new Date(previous + TF_MINUTES[tf] * 60000).toISOString(),
    counts: full.counts, latest: full.trace[full.trace.length - 1] ?? null,
    recentActions: full.trace.filter(row => row.outcome === "VETO" || row.votes?.length).slice(-5).reverse(),
    roles,
  };
}

export type CockpitActivity = ReturnType<typeof measureCockpitActivity> & { sourceHash: string; artifactHash: string; engineHash: string };
