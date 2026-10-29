// Research identity includes executable context, never a display name or a performance claim.
import { getCardRuntimeConfig } from "./simTimeframe.ts";
import { contentHash } from "./cardBeastV2/schemas.ts";
export interface RuntimeCard { modules?: string[]; design_tf?: string; execution_tf?: string; symbol?: string; archetype?: string }
export function runtimeCardIdentity(card: RuntimeCard) {
  const tf=getCardRuntimeConfig(card);
  return {symbol:card.symbol||"XAUUSD",design_tf:tf.design_tf,execution_tf:tf.allowed_execution_tf,archetype:card.archetype||"",modules:[...(card.modules||[])].sort()};
}
export function strategyDefinitionHash(card: RuntimeCard) {
  const definitions:Record<string,string|null>={};for(const key of ["mfe_custom_modules","mfe_custom_l1","mfe_custom_l2","mfe_custom_l3","mfe_custom_l4_recipe","mfe_custom_l5_recipe","mfe_custom_l6"]){try{definitions[key]=localStorage.getItem(key);}catch{definitions[key]=null;}}
  return contentHash({modules:card.modules||[],extra:{runtime:runtimeCardIdentity(card),definitions}});
}
export function researchContextHash(card: RuntimeCard) {
  const definitions:Record<string,string|null>={};
  for(const key of ["mfe_coef_profile","mfe_custom_modules","mfe_custom_l1","mfe_custom_l2","mfe_custom_l3","mfe_custom_l4_recipe","mfe_custom_l5_recipe","mfe_custom_l6"]){try{definitions[key]=localStorage.getItem(key);}catch{definitions[key]=null;}}
  let engine:string|null=null;try{engine=localStorage.getItem("mfe_research_engine_hash");}catch{}
  return contentHash({modules:card.modules||[],extra:{schema:2,card:runtimeCardIdentity(card),definitions,engine}});
}
