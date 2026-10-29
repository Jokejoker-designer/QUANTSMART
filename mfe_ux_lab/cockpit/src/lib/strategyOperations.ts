// SHADOW_ONLY / NO_DECISION. Frozen research runs; no broker execution dependency.
import { getActiveSymbol } from "./activeSymbolStore.ts";
import { readStrategyCards, upsertStrategyCard, type StrategyCardArtifactRecord } from "./artifactRegistry.ts";
import { getCardRuntimeConfig, TF_MINUTES } from "./simTimeframe.ts";
import { researchContextHash } from "./strategyIdentity.ts";
import { validateCardForPublication } from "./cardPublication.ts";
import { loadCustomModules } from "./customModule.ts";
import { researchStorage, runResearchJob, type ResearchBacktest } from "./researchJobs.ts";
import { terminalRequest } from "./mt5Connection.ts";
import { flushWorkspace } from "./workspaceClient.ts";
import type { OhlcBar } from "../adapters/loadOhlcReplayChart.ts";

export type StrategyTestSource = "history" | "mt5";
export async function runStrategyTest(card: StrategyCardArtifactRecord, source: StrategyTestSource, signal: AbortSignal, progress: (message: string) => void) {
  const frozen = structuredClone(card), config = getCardRuntimeConfig(frozen);
  const symbol = frozen.symbol || getActiveSymbol(), context = researchContextHash(frozen);
  if (symbol !== getActiveSymbol()) throw new Error("CARD_ASSET_MISMATCH");
  const definition = { ...frozen, symbol, design_tf: config.design_tf, execution_tf: config.allowed_execution_tf };
  const lifecycle = { cancelOnAbort: true, onProgress: (state: string) => progress(state === "queued" ? "Waiting for research service…" : state === "running" ? "Running backtest…" : "Preparing result…") };
  progress(source === "history" ? "Reading historical dataset…" : "Freezing closed MT5 candles…");
  let result: ResearchBacktest;
  if (source === "history") result = await validateCardForPublication(definition, loadCustomModules(), { ...lifecycle, signal });
  else {
    const intrabar = TF_MINUTES[config.allowed_execution_tf] < TF_MINUTES[config.design_tf];
    const tf = intrabar ? "M1" : config.design_tf;
    const tape = await terminalRequest<{ ok: boolean; reason?: string; bars?: OhlcBar[] }>(`/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}&n=${intrabar ? 5000 : 2000}`, undefined, signal);
    if (!tape.ok || !tape.bars || tape.bars.length <= 65) throw new Error(tape.reason || "MORE_CLOSED_HISTORY_REQUIRED");
    if (intrabar && tape.bars.length / TF_MINUTES[config.design_tf] < 65) throw new Error("INTRABAR_HISTORY_REQUIRED_USE_LOCAL_HISTORY");
    result = await runResearchJob<ResearchBacktest>({kind:"backtest",purpose:"publication",source:"Live",mode:intrabar?"m1":"design",bars:tape.bars,card:definition,storage:researchStorage(),options:{symbol,chartTf:config.design_tf,customModules:loadCustomModules(),hard:true,withWalkForward:true,walkForwardFolds:3}}, signal, lifecycle);
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const current = readStrategyCards().find(item => item.id === frozen.id);
  if (!current || context !== researchContextHash(current) || symbol !== getActiveSymbol()) throw new Error("CARD_CHANGED_RUN_AGAIN");
  progress("Saving verified result…");
  const a = result.analytics;
  upsertStrategyCard({ ...current, n:a.n, netR:a.netNetR, winRate:a.netWinRate, maxDD:Math.abs(a.maxDDNetR), bt_window:source === "mt5" ? "REAL_MT5_CLOSED_SAMPLE" : `REAL_OOS_${config.design_tf}`, validationReceipt:{...result.researchReceipt,manifest:result.manifest,analytics:result.analytics,walk_forward:result.walkForward} });
  await flushWorkspace();
  const saved=readStrategyCards().find(item=>item.id===frozen.id)?.validationReceipt;
  if(!saved||typeof saved!=="object"||!("verified" in saved)||saved.verified!==true||!("job_id" in saved)||saved.job_id!==result.researchReceipt.job_id)throw new Error("CARD_CHANGED_RUN_AGAIN");
  return result;
}
export function watchStrategyCard(card: StrategyCardArtifactRecord) {
  localStorage.setItem("mfe_home_card", card.id);
  window.dispatchEvent(new CustomEvent("mfe-nav", { detail: "home" }));
}
