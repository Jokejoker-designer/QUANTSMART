// Portable strategy definitions. Imported performance claims are not trusted receipts.
import { readStrategyCards, writeStrategyCards, type StrategyCardArtifactRecord } from "./artifactRegistry.ts";
import { flushWorkspace, notifyWorkspaceChange } from "./workspaceClient.ts";
const KEYS=["mfe_custom_modules","mfe_custom_l1","mfe_custom_l2","mfe_custom_l3","mfe_custom_l4_recipe","mfe_custom_l5_recipe","mfe_custom_l6"];
const baseId=(id:string)=>id.replace(/^myL[123456]_/,"");
export function exportStrategyBundle(cards:StrategyCardArtifactRecord[]=readStrategyCards()){
  const available=Object.fromEntries(KEYS.map(key=>[key,JSON.parse(localStorage.getItem(key)||"[]") as {id:string}[]]));
  const needed=new Set(cards.flatMap(card=>card.modules).map(baseId));const included:Record<string,unknown[]>={};let changed=true;
  while(changed){changed=false;for(const [key,items] of Object.entries(available))for(const item of items)if(needed.has(item.id)&&!(included[key]||[]).some((x:any)=>x.id===item.id)){
    (included[key]||=[]).push(item);const strings:string[]=[];const walk=(value:unknown)=>{if(typeof value==="string")strings.push(baseId(value));else if(value&&typeof value==="object")Object.values(value).forEach(walk);};walk(item);
    for(const value of strings)if(Object.values(available).some(list=>list.some(row=>row.id===value))&&!needed.has(value)){needed.add(value);changed=true;}
  }}
  return {schema:"mfe.strategy-library/2",exported_at:new Date().toISOString(),cards,definitions:included,receipt_policy:"Definitions only; validate in the receiving workspace."};
}
export async function importStrategyBundle(input:unknown){
 const bundle=input as {cards?:unknown;definitions?:Record<string,unknown>};const incoming=Array.isArray(input)?input:bundle?.cards;
 if(!Array.isArray(incoming)||!incoming.length)throw new Error("The file contains no Strategy Cards.");
 const cards=incoming.map((value:any)=>{if(!value||typeof value.id!=="string"||typeof value.name!=="string"||!value.name.trim()||!Array.isArray(value.modules)||!value.modules.every((id:unknown)=>typeof id==="string"))throw new Error("Invalid Card definition.");return {...value,validationReceipt:undefined,oos:undefined,evidence_status:"NOT_VALIDATED",bt_window:"NO_DATA",status:"DRAFT"} as StrategyCardArtifactRecord;});
 const updates:Record<string,string>={};
 for(const [key,value] of Object.entries(bundle?.definitions||{})){
  if(!KEYS.includes(key)||!Array.isArray(value)||value.some(row=>!row||typeof row.id!=="string"))throw new Error("Invalid module dependency collection.");
  const current=JSON.parse(localStorage.getItem(key)||"[]") as {id:string}[];const merged=new Map(current.map(row=>[row.id,row]));
  for(const row of value){const existing=merged.get(row.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(row))throw new Error(`Module ID conflict: ${row.id}. Rename the imported definition before retrying.`);merged.set(row.id,row);}
  updates[key]=JSON.stringify([...merged.values()]);
 }
 const current=readStrategyCards();const existing=new Set(current.map(card=>card.id));const added=cards.filter(card=>!existing.has(card.id));
 const before=Object.fromEntries([...Object.keys(updates),"mfe_strategy_cards"].map(key=>[key,localStorage.getItem(key)]));
 try{for(const [key,value] of Object.entries(updates))localStorage.setItem(key,value);writeStrategyCards([...added,...current]);notifyWorkspaceChange();await flushWorkspace();}
 catch(error){for(const [key,value] of Object.entries(before))if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);throw error;}
 return {added:added.length,skipped:cards.length-added.length};
}
