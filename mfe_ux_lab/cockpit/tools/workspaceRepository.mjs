// Owner-local research workspace. Never writes PatternStore, CREM, or broker state.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,openSync,closeSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const WORKSPACE_KEYS = new Set(['mfe_strategy_cards','mfe_beasts','mfe_compatibility_passports','mfe_card_runs','mfe_coef_profile','mfe_custom_modules','mfe_custom_l1','mfe_custom_l2','mfe_custom_l3','mfe_custom_l4_recipe','mfe_custom_l5_recipe','mfe_custom_l6','mfe_calendar_events']);
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const runtime = (card) => ({symbol:card.symbol || 'XAUUSD',design_tf:card.design_tf || 'H1',execution_tf:card.execution_tf || card.design_tf || 'H1',modules:[...(card.modules || [])].sort()});
const context=(storage)=>Object.fromEntries(['mfe_coef_profile','mfe_custom_modules','mfe_custom_l1','mfe_custom_l2','mfe_custom_l3','mfe_custom_l4_recipe','mfe_custom_l5_recipe','mfe_custom_l6'].map(key=>[key,JSON.parse(storage[key]||(key==='mfe_coef_profile'?'null':'[]'))]));
export function createWorkspaceRepository(directory) {
  mkdirSync(directory,{recursive:true}); const file=join(directory,'workspace.json');
  if(existsSync(file))JSON.parse(readFileSync(file,'utf8'));
  const lockFile=join(directory,'workspace.lock');
  if(existsSync(lockFile)){
    const owner=JSON.parse(readFileSync(lockFile,'utf8'));let alive=true;
    try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
    if(alive)throw new Error('WORKSPACE_ALREADY_OPEN_BY_ANOTHER_PROCESS');
    unlinkSync(lockFile);
  }
  const lockToken=randomUUID();const descriptor=openSync(lockFile,'wx');writeFileSync(descriptor,JSON.stringify({pid:process.pid,token:lockToken}));closeSync(descriptor);
  let state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{schema:1,revision:0,storage:{},receipts:{}};
  let currentEngineHash=null;
  const persist=(next)=>{const temp=join(directory,`workspace.${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(next),'utf8');renameSync(temp,file);state=next;};
  const sanitizeCards=(text,receipts,storage)=>JSON.stringify(JSON.parse(text).map(card=>{
    if(!card || typeof card.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,150}$/.test(card.id)||['constructor','prototype','__proto__'].includes(card.id)||typeof card.name!=='string'||!card.name.trim()||!Array.isArray(card.modules)||!card.modules.every(x=>typeof x==='string'))throw new Error('INVALID_STRATEGY_CARD');
    const periods={M1:1,M5:5,M15:15,H1:60,H4:240,D1:1440};
    if(card.symbol&&!/^[A-Z0-9]{3,12}$/.test(card.symbol)||card.design_tf&&!periods[card.design_tf]||card.execution_tf&&!periods[card.execution_tf]||card.execution_tf&&card.design_tf&&periods[card.execution_tf]>periods[card.design_tf])throw new Error('INVALID_CARD_OPERATING_CONTEXT');
    const receipt=receipts[card.validationReceipt?.job_id];
    const verified=!!receipt && receipt.public.purpose==='publication' && receipt.public.path_matches_declared_execution && digest(runtime(card))===receipt.card_runtime_hash && digest(context(storage))===receipt.context_hash && (!currentEngineHash||receipt.public.engine_hash===currentEngineHash);
    const a=receipt?.public.analytics;
    const wf=receipt?.public.walk_forward;
    const oos=verified&&wf?{method:'CHRONOLOGICAL_WALK_FORWARD',cost_mode:receipt.public.cost_mode,verdict:wf.verdict,evaluated_folds:wf.evaluatedFolds,positive_fraction:wf.positiveFraction,median_net_pf:wf.medianNetPF,folds:wf.folds}:undefined;
    return {...card,symbol:card.symbol||'XAUUSD',authority:'SHADOW_ONLY',decision:'NO_DECISION',status:'SHADOW',verdict:'RESEARCH_ONLY',gate:verified?(wf?.verdict||'MEASURED_NO_OOS'):'NOT_VALIDATED',bt_window:verified?`${wf?'REAL_OOS':'REAL'}_${receipt.public.cost_mode}_${receipt.public.manifest.design_tf}`:'NO_DATA',oos,n:verified?a.n:0,netR:verified?a.netNetR:0,winRate:verified?a.netWinRate:0,costEv:verified&&a.n?a.netNetR/a.n:0,maxDD:verified?Math.abs(a.maxDDNetR):0,validationReceipt:receipt?{...receipt.public,verified,reason:verified?undefined:'EXECUTABLE_CONTEXT_CHANGED'}:undefined,evidence_status:verified?'VERIFIED_RESEARCH':'NOT_VALIDATED'};
  }));
  return {
    close(){try{if(JSON.parse(readFileSync(lockFile,'utf8')).token===lockToken)unlinkSync(lockFile);}catch{}},
    setEngineHash(hash){currentEngineHash=hash;},
    read:()=>({schema:state.schema,revision:state.revision,engine_hash:currentEngineHash,storage:{...state.storage,...(state.storage.mfe_strategy_cards?{mfe_strategy_cards:sanitizeCards(state.storage.mfe_strategy_cards,state.receipts,state.storage)}:{})}}),
    commit(storage,revision){
      if(revision!==state.revision)throw new Error('WORKSPACE_CONFLICT');
      if(!storage||typeof storage!=='object'||Array.isArray(storage))throw new Error('INVALID_WORKSPACE_REQUEST');
      const next={...state,storage:{...state.storage},revision:state.revision+1};
      for(const [key,value] of Object.entries(storage)){
        if(!WORKSPACE_KEYS.has(key)||typeof value!=='string'||Buffer.byteLength(value)>8*1024*1024)throw new Error('INVALID_WORKSPACE_ENTRY');
        const parsed=JSON.parse(value);
        if(key==='mfe_calendar_events'&&(!parsed||typeof parsed.source!=='string'||!Array.isArray(parsed.events)||parsed.events.some(event=>typeof event.title!=='string'||!Number.isFinite(Date.parse(event.at_utc))||!/[zZ]|[+-]\d\d:\d\d$/.test(event.at_utc))))throw new Error('INVALID_CALENDAR_SOURCE');
        if(key==='mfe_strategy_cards'&&!Array.isArray(parsed))throw new Error('INVALID_STRATEGY_CARDS');
        if(key==='mfe_strategy_cards'&&new Set(parsed.map(card=>card?.id)).size!==parsed.length)throw new Error('DUPLICATE_CARD_ID');
        next.storage[key]=value;
      }
      if(next.storage.mfe_strategy_cards)next.storage.mfe_strategy_cards=sanitizeCards(next.storage.mfe_strategy_cards,next.receipts,next.storage);
      if ('mfe_card_runs' in storage) {
        const cards=JSON.parse(next.storage.mfe_strategy_cards||'[]'), records=JSON.parse(next.storage.mfe_card_runs);
        for(const record of Object.values(records)){
          const card=cards.find(c=>c.id===record.card_id);
          for(const [stage,window] of Object.entries(record.windows||{})){
            const receipt=next.receipts[window.receipt?.job_id];
            if(!receipt){window.verified=false;continue;}
            if(!card||receipt.card_runtime_hash!==digest(runtime(card)))throw new Error('RUN_CARD_MISMATCH');
            if(receipt.context_hash!==digest(context(next.storage))||currentEngineHash&&receipt.public.engine_hash!==currentEngineHash)throw new Error('RUN_CONTEXT_CHANGED');
            if(receipt.public.stage&&receipt.public.stage!==stage)throw new Error('RUN_STAGE_MISMATCH');
            const a=receipt.public.analytics,range=receipt.public.manifest.data_range;
            Object.assign(window,{verified:true,trades:a.n,netR:a.netNetR,netPF:a.netPF,winRate:a.netWinRate,maxDD:a.maxDDNetR,from:range.start,to:range.end,n:range.bars,source:receipt.public.source});
          }
        }
        next.storage.mfe_card_runs=JSON.stringify(records);
      }
      persist(next);return this.read();
    },
    recordJob(job){
      if(job.request?.kind!=='backtest'||!job.result?.manifest)return;
      const r=job.result,request=job.request;
      const {grossEquity,netEquity,...summary}=r.analytics;
      const declared=runtime(request.card),matches=request.mode==='m1'||declared.design_tf===declared.execution_tf;
      const receipt={card_runtime_hash:digest(declared),context_hash:digest(context(request.storage||{})),public:{job_id:job.id,input_hash:job.key,engine_hash:job.engineHash,source_hash:job.provenance?.dataHash,manifest:r.manifest,analytics:summary,walk_forward:r.walkForward,purpose:request.purpose||'diagnostic',path_matches_declared_execution:matches,cost_mode:request.options?.hard?'HARD':'NORMAL',stage:request.stage,source:request.source||(request.dataset?'Replay':'Input'),mode:request.mode||'design',created_at:new Date().toISOString()}};
      const receipts={...state.receipts,[job.id]:receipt};
      // Keep recent receipts plus every receipt still referenced by a saved card/run.
      const referenced=new Set();
      try{for(const c of JSON.parse(state.storage.mfe_strategy_cards||'[]'))if(c.validationReceipt?.job_id)referenced.add(c.validationReceipt.job_id);for(const rec of Object.values(JSON.parse(state.storage.mfe_card_runs||'{}')))for(const win of Object.values(rec.windows||{}))if(win.receipt?.job_id)referenced.add(win.receipt.job_id);}catch{}
      const ids=Object.keys(receipts);for(const id of ids.slice(0,Math.max(0,ids.length-80)))if(!referenced.has(id))delete receipts[id];
      // Receipt writes do not change the user-edit revision, so a finished job cannot cause a save conflict.
      persist({...state,receipts});
    },
    verifyWindow(receipt,card){const stored=state.receipts[receipt?.job_id];return !!stored&&stored.card_runtime_hash===digest(runtime(card));},
  };
}
