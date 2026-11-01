// Owner-local append-only observations, not a claim of complete lifetime search history.
import {appendFileSync,existsSync,readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function canonicalHash(value){const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
// A library edit can change a referenced measurement without changing a Card ID.
// Include the frozen custom-library context; counts are contexts, not independent hypotheses.
export function simulationTrialSnapshot(definition,storage){
 const library=Object.fromEntries(Object.entries(storage).map(([key,value])=>{try{return[key,JSON.parse(value)];}catch{return[key,value];}}));
 const context=canonicalHash(library);
 return {variant:canonicalHash({definition,context}),modules:[...new Set(definition.modules)].map(id=>({id,definition:canonicalHash({id,custom:(definition.customModules||[]).find(m=>m.id===id)||null,coefficients:definition.coefficients,context})}))};
}
export function createResearchTrials(file){
 const variants=new Set(),requests=new Set(),modules=new Map();let requestAttempts=0,simulationCalls=0,startedAt=null;
 function validate(event){if(!event||event.schema!==1||!['request','simulation'].includes(event.type)||typeof event.at!=='string'||typeof event.variant!=='string'||event.type==='simulation'&&(!Array.isArray(event.modules)||!event.modules.every(m=>m&&typeof m.id==='string'&&typeof m.definition==='string')))throw new Error('TRIAL_LEDGER_CORRUPT');}
 function ingest(event){
  validate(event);
  startedAt??=event.at;
  if(event.type==='request'){requestAttempts++;requests.add(event.variant);}
  else{simulationCalls++;variants.add(event.variant);if(!Array.isArray(event.modules))throw new Error('TRIAL_LEDGER_CORRUPT');for(const m of event.modules){if(typeof m.id!=='string'||typeof m.definition!=='string')throw new Error('TRIAL_LEDGER_CORRUPT');let row=modules.get(m.id);if(!row){row={calls:0,definitions:new Set(),configurations:new Set()};modules.set(m.id,row);}row.calls++;row.definitions.add(m.definition);row.configurations.add(event.variant);}}
 }
 if(existsSync(file)){if(statSync(file).size>100*1024*1024)throw new Error('TRIAL_LEDGER_TOO_LARGE: archive it explicitly; counts were not reset');const raw=readFileSync(file,'utf8');try{for(const line of raw.split('\n').filter(Boolean))ingest(JSON.parse(line));}catch{throw new Error('TRIAL_LEDGER_CORRUPT');}}
 function record(event){if(existsSync(file)&&statSync(file).size>100*1024*1024)throw new Error('TRIAL_LEDGER_TOO_LARGE');const complete={schema:1,at:new Date().toISOString(),...event};validate(complete);appendFileSync(file,JSON.stringify(complete)+'\n',{encoding:'utf8',flush:true});ingest(complete);}
 return {
  request(job,reused=false){record({type:'request',jobId:job.id,variant:job.key,kind:job.request?.kind||job.kind,reused});},
  simulation(job,trial){if(!trial||typeof trial.variant!=='string'||!Array.isArray(trial.modules)||!trial.modules.every(m=>m&&typeof m.id==='string'&&typeof m.definition==='string'))throw new Error('INVALID_SIMULATION_TRIAL');record({type:'simulation',jobId:job.id,engine:job.engineHash,variant:canonicalHash({engine:job.engineHash,variant:trial.variant}),modules:trial.modules.map(m=>({id:m.id,definition:canonicalHash({engine:job.engineHash,definition:m.definition})}))});},
  summary(){return {schema:1,coverage:'OBSERVED_BACKEND_REQUESTS_AND_CANONICAL_SIMULATOR_CALLS_ONLY',historyComplete:false,lifetimeTrialCount:null,multipleTestingAdjustment:'NOT_COMPUTED_INCOMPLETE_SEARCH_HISTORY',startedAt,requestAttempts,uniqueRequestVariants:requests.size,simulationCalls,uniqueSimulationConfigurations:variants.size,modules:[...modules].sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>({id,simulationCalls:r.calls,uniqueObservedDefinitionContexts:r.definitions.size,uniqueConfigurationsContainingModule:r.configurations.size})),limitations:['Pre-ledger trials, unsubmitted browser edits and external runs are unknown. Abrupt termination can lose unobserved calls.','Definition contexts include the frozen custom library; unrelated library edits can increase context counts.','Chronological folds are simulator calls, not automatically independent hypotheses.','Configuration counts are not an effective independent trial count or a selection-adjusted significance test.']};}
 };
}
