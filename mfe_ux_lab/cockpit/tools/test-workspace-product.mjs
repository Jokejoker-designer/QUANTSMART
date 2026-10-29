import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResearchBackend } from './researchBackend.mjs';
const directory=mkdtempSync(join(tmpdir(),'mfe-workspace-product-'));
let server,backend,base;
async function start(){backend=await createResearchBackend({workspaceDirectory:directory});server=http.createServer((req,res)=>backend.middleware(req,res,()=>{res.statusCode=404;res.end();}));await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
async function stop(){backend.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
async function call(path,body,method=body?'POST':'GET'){const r=await fetch(base+'/api/research/'+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};}
async function done(id){for(let i=0;i<400;i++){const {data}=await call('jobs/'+id);if(!['queued','running'].includes(data.status))return data;await new Promise(r=>setTimeout(r,30));}throw new Error('timeout');}
try{
 await start();let workspace=(await call('workspace')).data;
 await assert.rejects(createResearchBackend({workspaceDirectory:directory}),/WORKSPACE_ALREADY_OPEN_BY_ANOTHER_PROCESS/);
 const card={id:'qa-card',name:'Receipt integration test',symbol:'XAUUSD',design_tf:'H1',execution_tf:'H1',modules:['trend_pullback','auto_rr'],n:99999,netR:99999,verdict:'LIVE_READY'};
 const save=await call('workspace',{revision:workspace.revision,storage:{mfe_strategy_cards:JSON.stringify([card])}},'PUT');assert.equal(save.status,200);workspace=save.data;
 const draft=JSON.parse(workspace.storage.mfe_strategy_cards)[0];assert.equal(draft.evidence_status,'NOT_VALIDATED');assert.equal(draft.n,0);assert.notEqual(draft.verdict,'LIVE_READY');
 const job=await call('jobs',{kind:'backtest',purpose:'publication',card,dataset:{symbol:'XAUUSD',tf:'H1'},storage:{},options:{symbol:'XAUUSD',hard:true,withWalkForward:true,walkForwardFolds:5}});assert.equal(job.status,202);assert.equal((await done(job.data.id)).status,'done');
 const result=(await call(`jobs/${job.data.id}/result`)).data;
 const publish=await call('workspace',{revision:workspace.revision,storage:{mfe_strategy_cards:JSON.stringify([{...card,validationReceipt:{job_id:job.data.id},n:99999,netR:99999}])}},'PUT');assert.equal(publish.status,200);workspace=publish.data;
 const measured=JSON.parse(workspace.storage.mfe_strategy_cards)[0];assert.equal(measured.validationReceipt.verified,true);assert.equal(measured.n,result.result.analytics.n);assert.equal(measured.netR,result.result.analytics.netNetR);assert.equal(measured.oos.verdict,result.result.walkForward.verdict);
 const conflict=await call('workspace',{revision:0,storage:{mfe_strategy_cards:'[]'}},'PUT');assert.equal(conflict.status,409);
 const bad=await call('workspace',{revision:workspace.revision,storage:{mfe_owner_token:'"forbidden"'}},'PUT');assert.equal(bad.status,400);
 await stop();await start();workspace=(await call('workspace')).data;assert.equal(JSON.parse(workspace.storage.mfe_strategy_cards)[0].validationReceipt.verified,true);
 const changed=await call('workspace',{revision:workspace.revision,storage:{mfe_coef_profile:JSON.stringify({trend:{w:1.1,rel:.54}})}},'PUT');assert.equal(changed.status,200);workspace=changed.data;assert.equal(JSON.parse(workspace.storage.mfe_strategy_cards)[0].validationReceipt.verified,false);
 const calendar=await call('calendar');assert.equal(calendar.data.status,'NOT_CONFIGURED');
 const invalidCalendar=await call('workspace',{revision:workspace.revision,storage:{mfe_calendar_events:JSON.stringify({source:'test',events:[{title:'bad',at_utc:'not-a-date'}]})}},'PUT');assert.equal(invalidCalendar.status,400);
 const market=await call('jobs',{kind:'market',dataset:{symbol:'XAUUSD',tf:'H1'},count:200,storage:{}});assert.equal((await done(market.data.id)).status,'done');const marketResult=(await call(`jobs/${market.data.id}/result`)).data.result;assert.equal(marketResult.bars.length,200);assert.equal(marketResult.price,marketResult.bars.at(-1).c);assert.equal(marketResult.source,'HISTORICAL_OHLC');
 const unresolved=await call('jobs',{kind:'backtest',purpose:'publication',card:{...card,modules:['imaginary_trigger']},dataset:{symbol:'XAUUSD',tf:'H1'},storage:{},options:{symbol:'XAUUSD'}});assert.match((await done(unresolved.data.id)).error,/UNRESOLVED_MODULE_DEPENDENCY/);
 console.log('WORKSPACE PRODUCT PASS: durable restart, draft/receipt separation, canonical metrics, optimistic conflict, forbidden-key refusal, context invalidation, truthful market snapshot, calendar refusal, missing-dependency refusal.');
}finally{if(server?.listening)await stop();}
