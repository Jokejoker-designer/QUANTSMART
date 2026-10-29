// One measured publication path. No structural estimate becomes a performance result.
import { getActiveSymbol } from "./activeSymbolStore.ts";
import { getCardRuntimeConfig, TF_MINUTES } from "./simTimeframe.ts";
import { runResearchJob, researchStorage, type ResearchBacktest, type ResearchJobLifecycle } from "./researchJobs.ts";
import { loadM1Years } from "../adapters/loadSimOhlc.ts";
import type { CustomModule } from "./customModule.ts";
export async function validateCardForPublication(card:{id:string;name:string;modules:string[];design_tf:string;execution_tf:string;symbol:string},customModules:CustomModule[], lifecycle?:ResearchJobLifecycle & {signal?:AbortSignal}):Promise<ResearchBacktest>{
  const config=getCardRuntimeConfig(card),symbol=getActiveSymbol();
  if(card.symbol!==symbol)throw new Error("CARD_ASSET_MISMATCH");
  const intrabar=TF_MINUTES[config.allowed_execution_tf]<TF_MINUTES[config.design_tf];
  let dataset:{symbol:string;tf:string;from?:string;to?:string}={symbol,tf:config.design_tf};
  if(intrabar){const years=await loadM1Years();const latest=years[years.length-1];if(!latest)throw new Error("M1_HISTORY_REQUIRED");dataset={symbol,tf:"M1",from:latest.first,to:latest.last};}
  return runResearchJob<ResearchBacktest>({kind:"backtest",purpose:"publication",mode:intrabar?"m1":"design",source:"Replay",dataset,card,storage:researchStorage(),options:{symbol,chartTf:config.design_tf,customModules,hard:true,withWalkForward:true,walkForwardFolds:5}},lifecycle?.signal,lifecycle);
}
