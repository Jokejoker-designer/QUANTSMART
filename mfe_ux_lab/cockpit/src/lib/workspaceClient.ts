// Durable owner-local research workspace. Browser storage is a cache, not a save receipt.
import { useSyncExternalStore } from "react";
import { mergeWorkspace } from "./workspaceMerge.ts";
export const WORKSPACE_KEYS = ["mfe_strategy_cards","mfe_beasts","mfe_compatibility_passports","mfe_card_runs","mfe_coef_profile","mfe_custom_modules","mfe_custom_l1","mfe_custom_l2","mfe_custom_l3","mfe_custom_l4_recipe","mfe_custom_l5_recipe","mfe_custom_l6","mfe_calendar_events"];
export const WORKSPACE_CHANGED = "mfe-workspace-changed";
type State = { phase: "loading" | "ready" | "saving" | "error"; error: string | null; savedAt: string | null };
let state: State = { phase: "loading", error: null, savedAt: null }, revision = 0;
let acknowledged: Record<string,string> = {}, boot: Promise<void> | null = null, saving: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (patch: Partial<State>) => { state={...state,...patch};listeners.forEach(fn=>fn()); };
const empty = (key: string) => key === "mfe_coef_profile" ? "null" : key === "mfe_card_runs" ? "{}" : "[]";
function snapshot() { const result:Record<string,string>={};for(const key of WORKSPACE_KEYS)result[key]=localStorage.getItem(key) ?? empty(key);return result; }
const changes = () => Object.fromEntries(Object.entries(snapshot()).filter(([key,value])=>value!==(acknowledged[key]??empty(key))));
async function request(method: string, input?: unknown) {
  const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
  try { const response=await fetch("/api/research/workspace",{method,headers:{"Content-Type":"application/json"},body:input?JSON.stringify(input):undefined,signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||"WORKSPACE_REQUEST_FAILED");if(data.engine_hash)localStorage.setItem("mfe_research_engine_hash",data.engine_hash);return data as {revision:number;storage:Record<string,string>}; }
  finally {clearTimeout(timer);}
}
export function notifyWorkspaceChange() { if(typeof window!=="undefined")window.dispatchEvent(new Event(WORKSPACE_CHANGED)); }
export function initializeWorkspace(): Promise<void> {
  if(boot)return boot;
  boot=(async()=>{
    const local=snapshot(),remote=await request("GET");revision=remote.revision;acknowledged=remote.storage;
    for(const [key,value] of Object.entries(remote.storage))if(WORKSPACE_KEYS.includes(key))localStorage.setItem(key,value);
    // Migrate only keys absent from the durable workspace; never replace an existing server library.
    const migration=Object.fromEntries(Object.entries(local).filter(([key,value])=>!(key in remote.storage)&&value!==empty(key)));
    if(Object.keys(migration).length){const merged=await request("PUT",{revision,storage:migration});revision=merged.revision;acknowledged=merged.storage;for(const [key,value] of Object.entries(merged.storage))localStorage.setItem(key,value);}
    publish({phase:"ready",error:null,savedAt:new Date().toISOString()});
  })().catch(error=>{boot=null;publish({phase:"error",error:error.message||"Workspace service unavailable"});throw error;});
  return boot;
}
export function flushWorkspace(): Promise<void> {
  if(saving)return saving;
  saving=(async()=>{
    if(state.phase==="loading")await initializeWorkspace();
    let conflicts=0;
    while(Object.keys(changes()).length){
      const pending=changes();publish({phase:"saving",error:null});
      const previous=acknowledged;
      let remote;
      try { remote=await request("PUT",{revision,storage:pending}); }
      catch(error){
        if(!(error instanceof Error)||error.message!=="WORKSPACE_CONFLICT"||conflicts++>=3)throw error;
        const latest=await request("GET"),merged=mergeWorkspace(acknowledged,snapshot(),latest.storage);
        revision=latest.revision;acknowledged=latest.storage;
        for(const key of WORKSPACE_KEYS)localStorage.setItem(key,merged[key]??empty(key));
        window.dispatchEvent(new Event("mfe-artifacts-changed"));
        continue;
      }
      revision=remote.revision;acknowledged=remote.storage;
      for(const [key,value] of Object.entries(remote.storage))if(WORKSPACE_KEYS.includes(key)&&(localStorage.getItem(key)===pending[key]||(!(key in pending)&&localStorage.getItem(key)===previous[key])))localStorage.setItem(key,value);
      publish({phase:"ready",error:null,savedAt:new Date().toISOString()});
      window.dispatchEvent(new Event("mfe-workspace-persisted"));window.dispatchEvent(new Event("mfe-artifacts-changed"));
    }
    publish({phase:"ready",error:null});
  })().catch(error=>{publish({phase:"error",error:error.message||"WORKSPACE_SAVE_FAILED"});throw error;}).finally(()=>{saving=null;});
  return saving;
}
export function installWorkspaceSync() {
  const sync=()=>{if(state.phase!=="loading"&&state.phase!=="error"&&Object.keys(changes()).length)void flushWorkspace().catch(()=>{});};
  const afterAction=()=>queueMicrotask(sync);
  const unload=(event:BeforeUnloadEvent)=>{if(Object.keys(changes()).length){event.preventDefault();event.returnValue="";}};
  for(const event of [WORKSPACE_CHANGED,"mfe-artifacts-changed","mfe-coef-changed","storage"])window.addEventListener(event,afterAction);
  document.addEventListener("click",afterAction);window.addEventListener("beforeunload",unload);
  return ()=>{for(const event of [WORKSPACE_CHANGED,"mfe-artifacts-changed","mfe-coef-changed","storage"])window.removeEventListener(event,afterAction);document.removeEventListener("click",afterAction);window.removeEventListener("beforeunload",unload);};
}
export function useWorkspaceStatus(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>state,()=>state);}
