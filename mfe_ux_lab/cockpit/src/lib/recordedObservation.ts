import {useEffect,useState} from "react";
import {getActiveSymbol} from "./activeSymbolStore.ts";

interface QuoteFeatures {tick_rate_per_second:number;interarrival_p50_ms:number;interarrival_p95_ms:number;spread_p50:number;spread_p95:number;spread_max:number;mid_range:number;price_progress_ratio:number|null}
interface QuoteWindow {cutoff_ms:number;quality:string;quotes:number;features:QuoteFeatures|null}
interface Declaration {id:string;outcome:string;declaration:{cutoff_ms:number;horizon_ms:number;kind:string;flags:string[];baseline_windows:number;evaluation_mode:string;decision_time_ms:number};resolution:Record<string,unknown>|null}
interface DescriptiveModel {id:string;version:number;created_at:string;status:string;tier:string;cutoff_ms:number;baseline_windows:number;review_state:string}
interface RecordedComparison {
  query_cutoff_ms: number;
  eligible_windows: number;
  matches: {cutoff_ms: number; rank_distance: number}[];
  earlier_to_ms: number;
  recent_from_ms: number;
  windows_per_group: number;
  median_shifts: {feature: string; earlier_median: number; recent_median: number}[];
}
export interface RecordedObservation {ok:true;source_id:string|null;state:string;freshness:{state:string;age_ms:number|null;last_recorded_utc_ms:number|null};current:QuoteWindow|null;comparison:RecordedComparison|null;baseline_windows:number;historical_windows:number;declarations:Declaration[];outcome_counts:Record<string,number>;false_alarm_rate:number|null;resolved_warning_count:number;models:DescriptiveModel[];active_descriptive_version:string|null;certification:string;predictive_calibration:string;optional_module_inputs:string;pipeline:{stage:string;status:string}[];limitations:string[];live_apply_allowed:false;live_eligible:false}
type ReadState={kind:"loading"}|{kind:"unavailable";reason:string}|{kind:"ready";data:RecordedObservation};
type Slot={state:ReadState;listeners:Set<(state:ReadState)=>void>;controller:AbortController|null;timer?:ReturnType<typeof setTimeout>};
const slots=new Map<string,Slot>();
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const nullableNumber=(v:unknown)=>v===null||finite(v);
const nonnegative=(v:unknown)=>finite(v)&&v>=0;
function isRecordedObservation(v:unknown):v is RecordedObservation {
  if(!object(v)||v.ok!==true||(v.source_id!==null&&typeof v.source_id!=="string")||typeof v.state!=="string"||!Array.isArray(v.declarations)||!Array.isArray(v.models)||!Array.isArray(v.pipeline)||!Array.isArray(v.limitations)||v.live_apply_allowed!==false||v.live_eligible!==false||!object(v.outcome_counts)||!nonnegative(v.baseline_windows)||!nonnegative(v.historical_windows)||typeof v.certification!=="string"||typeof v.predictive_calibration!=="string"||typeof v.optional_module_inputs!=="string"||!nonnegative(v.resolved_warning_count)||(v.active_descriptive_version!==null&&typeof v.active_descriptive_version!=="string")||!nullableNumber(v.false_alarm_rate))return false;
  if(!object(v.freshness)||typeof v.freshness.state!=="string"||!nullableNumber(v.freshness.age_ms)||!nullableNumber(v.freshness.last_recorded_utc_ms))return false;
  if(v.current!==null){
    if(!object(v.current)||!finite(v.current.cutoff_ms)||typeof v.current.quality!=="string"||!nonnegative(v.current.quotes))return false;
    const f=v.current.features;
    if(f!==null&&(!object(f)||!["tick_rate_per_second","interarrival_p50_ms","interarrival_p95_ms","spread_p50","spread_p95","spread_max","mid_range"].every(k=>nonnegative(f[k]))||!nullableNumber(f.price_progress_ratio)))return false;
  }
  for(const r of v.declarations)if(!object(r)||typeof r.id!=="string"||typeof r.outcome!=="string"||!object(r.declaration)||!finite(r.declaration.cutoff_ms)||!finite(r.declaration.decision_time_ms)||!nonnegative(r.declaration.horizon_ms)||typeof r.declaration.kind!=="string"||typeof r.declaration.evaluation_mode!=="string"||!nonnegative(r.declaration.baseline_windows)||!Array.isArray(r.declaration.flags)||r.declaration.flags.some(x=>typeof x!=="string")||(r.resolution!==null&&!object(r.resolution)))return false;
  for(const r of v.models)if(!object(r)||typeof r.id!=="string"||!nonnegative(r.version)||typeof r.status!=="string"||typeof r.review_state!=="string"||typeof r.tier!=="string"||typeof r.created_at!=="string"||!finite(r.cutoff_ms)||!nonnegative(r.baseline_windows))return false;
  for(const r of v.pipeline)if(!object(r)||typeof r.stage!=="string"||typeof r.status!=="string")return false;
  const comparison = v.comparison;
  if (comparison !== null) {
    if (!object(comparison) || !finite(comparison.query_cutoff_ms) ||
      !nonnegative(comparison.eligible_windows) || !nonnegative(comparison.windows_per_group) ||
      !finite(comparison.earlier_to_ms) || !finite(comparison.recent_from_ms) ||
      !Array.isArray(comparison.matches) || !Array.isArray(comparison.median_shifts)) return false;
    if (!comparison.matches.every(row => object(row) && finite(row.cutoff_ms) && nonnegative(row.rank_distance))) return false;
    if (!comparison.median_shifts.every(row => object(row) && typeof row.feature === "string" &&
      finite(row.earlier_median) && finite(row.recent_median))) return false;
  }
  return Object.values(v.outcome_counts).every(nonnegative)&&v.limitations.every(x=>typeof x==="string");
}
function parse(v:unknown):RecordedObservation|null {return isRecordedObservation(v)?v:null;}
async function pull(query:string,slot:Slot){
  if(slot.controller)return;clearTimeout(slot.timer);const controller=new AbortController();slot.controller=controller;
  try{const response=await fetch('/api/mt5/evidence/observation?'+query,{signal:controller.signal});const raw:unknown=await response.json();const value=parse(raw);slot.state=response.ok&&value?{kind:"ready",data:value}:{kind:"unavailable",reason:"Recorded observer is unavailable or its payload failed validation."};}
  catch(error){if(!controller.signal.aborted)slot.state={kind:"unavailable",reason:error instanceof Error?error.message:String(error)};}
  finally{slot.controller=null;slot.listeners.forEach(fn=>fn(slot.state));if(slot.listeners.size)slot.timer=setTimeout(()=>void pull(query,slot),5000);}
}
export function useRecordedObservation(includeComparison = false){
  const query = new URLSearchParams({symbol: getActiveSymbol(), comparison: String(includeComparison)}).toString();
  let slot=slots.get(query);
  if(!slot){slot={state:{kind:"loading"},listeners:new Set(),controller:null};slots.set(query,slot);}
  const active=slot,[state,setState]=useState<ReadState>(active.state);
  useEffect(()=>{active.listeners.add(setState);setState(active.state);void pull(query,active);return()=>{active.listeners.delete(setState);if(!active.listeners.size){clearTimeout(active.timer);active.controller?.abort();}};},[query,active]);
  return {state,refresh:()=>void pull(query,active)};
}
export async function descriptiveModelAction(action:"propose"|"review",body:Record<string,string>){
  const response=await fetch('/api/mt5/evidence/model/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-MFE-Request':'1'},body:JSON.stringify(body)});
  const data:unknown=await response.json();if(!response.ok)throw new Error(object(data)&&typeof data.error==='string'?data.error:'Descriptive model request failed.');
}
