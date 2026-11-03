import {useEffect,useState} from "react";

export interface RecordedSource {
  id:string;canonical_symbol:string;broker_symbol:string;broker:string;
  server_timezone:string;timestamp_contract:string;rows:number;from_ms:number|null;to_ms:number|null;cursor:[number,number];
}
export interface TickEvidenceStatus {
  ok:true;enabled:boolean;state:string;symbol:string;source_id:string|null;rows:number;max_rows:number;max_bytes:number;
  sources:RecordedSource[];quality:{id:number;at:string;source_id:string|null;state:string;detail:string}[];
  storage:string;market_closure:"NOT_VERIFIED";qualification:"UNCERTIFIED";
  last_poll:string|null;last_commit:string|null;trade_authority:"NONE";live_apply_allowed:false;
}
type StatusResult={kind:"loading"}|{kind:"unavailable";reason:string}|{kind:"ready";status:TickEvidenceStatus};
let cached:StatusResult={kind:"loading"};
const subscribers=new Set<(value:StatusResult)=>void>();
let timer:ReturnType<typeof setTimeout>|undefined;
let controller:AbortController|null=null;
const publish=(value:StatusResult)=>{cached=value;subscribers.forEach(notify=>notify(value));};
function parseStatus(value:unknown):TickEvidenceStatus|null {
  if(!value||typeof value!=="object"||!("ok"in value)||value.ok!==true||!("sources"in value)||!Array.isArray(value.sources)||!("state"in value)||typeof value.state!=="string"||!("rows"in value)||typeof value.rows!=="number"||!("enabled"in value)||typeof value.enabled!=="boolean"||!("quality"in value)||!Array.isArray(value.quality)||!("live_apply_allowed"in value)||value.live_apply_allowed!==false)return null;
  // The bridge owns the output schema; only narrow after all UI-consumed arrays are checked.
  for(const source of value.sources)if(!source||typeof source!=="object"||typeof source.id!=="string"||typeof source.canonical_symbol!=="string"||typeof source.broker_symbol!=="string"||typeof source.rows!=="number"||!Array.isArray(source.cursor))return null;
  return value as TickEvidenceStatus;
}
async function refresh(){
  if(controller)return;
  controller=new AbortController();const active=controller;
  try{const response=await fetch("/api/mt5/evidence/status",{signal:active.signal});const raw:unknown=await response.json();const status=parseStatus(raw);if(!response.ok||!status){const reason=raw&&typeof raw==="object"&&"reason"in raw?String(raw.reason):"RECORDER_UNAVAILABLE";publish({kind:"unavailable",reason});}else publish({kind:"ready",status});}
  catch(error){if(!active.signal.aborted)publish({kind:"unavailable",reason:error instanceof Error?error.message:String(error)});}
  finally{controller=null;if(subscribers.size)timer=setTimeout(()=>void refresh(),2000);}
}
export function useTickEvidence(){
  const [result,setResult]=useState<StatusResult>(cached);
  useEffect(()=>{subscribers.add(setResult);setResult(cached);void refresh();return()=>{subscribers.delete(setResult);if(!subscribers.size){clearTimeout(timer);controller?.abort();}};},[]);
  return {result,refresh:()=>void refresh()};
}
export async function recorderAction(action:"start"|"stop",symbol:string){
  const response=await fetch("/api/mt5/evidence/"+action,{method:"POST",headers:{"Content-Type":"application/json","X-MFE-Request":"1"},body:JSON.stringify(action==="start"?{symbol}:{})});
  const data:unknown=await response.json();
  if(!response.ok)throw new Error(data&&typeof data==="object"&&"error"in data?String(data.error):"RECORDER_REQUEST_FAILED");
  clearTimeout(timer);void refresh();
}
