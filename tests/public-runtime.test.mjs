// A clean public checkout needs no broker data or Python to test the built runtime.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import net from 'node:net';
const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'));
// URL paths may contain escaped spaces or Unicode on Windows.
const {fileURLToPath}=await import('node:url');const project=fileURLToPath(new URL('..',import.meta.url));
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const workspace=mkdtempSync(join(tmpdir(),'quantsmart-public-'));const base=`http://127.0.0.1:${port}`;
let child,stderr='';
async function boot(){child=spawn(process.execPath,['mfe_ux_lab/cockpit/tools/productServer.mjs','--port',String(port),'--workspace',workspace],{cwd:project,stdio:['ignore','pipe','pipe'],windowsHide:true,env:{...process.env,MFE_BRIDGE_TOKEN:''}});child.stderr.on('data',b=>stderr+=b);for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(stderr);try{const r=await fetch(base+'/api/research/health');if(r.ok)return r.json();}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('Public runtime did not become ready');}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}}
const json=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
try{
 const h=await boot();assert.equal(h.runtime,'built');assert.equal(h.authority,'SHADOW_ONLY');
 const html=await(await fetch(base+'/')).text();assert.match(html,/<title>QUANTSMART<\/title>/);assert.ok(!html.includes('/@vite/client'));
 assert.equal((await fetch(base+'/tools/researchWorker.mjs')).status,404);
 const account=await json('/api/mt5/account');assert.equal(account.data.connected,false);
 const absent=await json('/api/research/jobs',{kind:'market',dataset:{symbol:'ZZZTEST',tf:'H1'},storage:{}});assert.equal(absent.status,400);assert.match(absent.data.error,/DATASET_NOT_FOUND/);assert.ok(!absent.data.error.includes(project));
 let state=(await json('/api/research/workspace')).data;
 assert.equal((await json('/api/research/workspace',{revision:state.revision,storage:{mfe_strategy_cards:'[]'}},'PUT')).status,200);
 // Deterministic synthetic fixture is confined to this test request. It is never
 // installed as market history or shipped to the application's public/data path.
 const bars=Array.from({length:240},(_,i)=>{const o=100+Math.sin(i/9)*2+i*.01,c=100+Math.sin((i+1)/9)*2+(i+1)*.01;return {i,t:new Date(Date.UTC(2020,0,1)+i*3600000).toISOString(),o,h:Math.max(o,c)+.2,l:Math.min(o,c)-.2,c,r:'N'};});
 const request={kind:'backtest',bars,card:{id:'TEST_FIXTURE_ONLY',design_tf:'H1',modules:['trend_pullback','auto_rr']},options:{symbol:'XAUUSD',chartTf:'H1',withWalkForward:false,calibration:{source:'MT5_SYMBOL_INFO',symbol:'XAUUSD',hasTickBidAsk:true}},storage:{}};const job=await json('/api/research/jobs',request);assert.equal(job.status,202);
 let result;for(let i=0;i<150;i++){const s=(await json('/api/research/jobs/'+job.data.id)).data;if(s.status==='failed')throw new Error(s.error);if(s.status==='done'){result=(await json('/api/research/jobs/'+s.id+'/result')).data;break;}await new Promise(r=>setTimeout(r,30));}assert.ok(result?.result);assert.equal(result.authority,'SHADOW_ONLY');assert.equal(result.result.pathExact,false);assert.equal(result.result.calibration.pathExact,false);assert.equal(result.result.manifest.truth_contract.pathTruth,'HTF_HEURISTIC');
 const initialTrials=(await json('/api/research/trials')).data;assert.equal(initialTrials.requestAttempts,1);assert.ok(initialTrials.simulationCalls>=1);assert.equal(initialTrials.historyComplete,false);assert.equal(initialTrials.lifetimeTrialCount,null);
 const reused=await json('/api/research/jobs',request);assert.equal(reused.status,200);assert.equal(reused.data.id,job.data.id);assert.equal((await json('/api/research/trials')).data.simulationCalls,initialTrials.simulationCalls);
 const diagnostic=await json('/api/research/jobs',{kind:'diagnostic',analysis:'ablation',bars,card:{id:'ABLATION_FIXTURE_ONLY',design_tf:'H1',modules:['psl_sweep']},parameters:{folds:3},storage:{}});assert.equal(diagnostic.status,202);
 let diagnosticDone=false;for(let i=0;i<150;i++){const s=(await json('/api/research/jobs/'+diagnostic.data.id)).data;if(s.status==='failed')throw new Error(s.error);if(s.status==='done'){diagnosticDone=true;break;}await new Promise(r=>setTimeout(r,30));}assert.ok(diagnosticDone);
 const beforeRestart=(await json('/api/research/trials')).data;assert.equal(beforeRestart.requestAttempts,3);assert.equal(beforeRestart.simulationCalls,initialTrials.simulationCalls+6,'each of three folds observes baseline and single intervention');assert.ok(beforeRestart.modules.some(m=>m.id==='psl_sweep'));
 assert.ok(!readFileSync(join(workspace,'search-trials.jsonl'),'utf8').includes('"bars"'),'journal contains hashes and counts, not raw history');
 const m1Bars=bars.flatMap(b=>Array.from({length:60},(_,minute)=>({...b,t:new Date(Date.parse(b.t)+minute*60000).toISOString()})));
 const m1Job=await json('/api/research/jobs',{...request,bars:m1Bars,mode:'m1'});assert.equal(m1Job.status,202);
 let m1Result;for(let i=0;i<150;i++){const state=(await json('/api/research/jobs/'+m1Job.data.id)).data;if(state.status==='failed')throw new Error(state.error);if(state.status==='done'){m1Result=(await json('/api/research/jobs/'+state.id+'/result')).data.result;break;}await new Promise(r=>setTimeout(r,30));}assert.ok(m1Result);assert.equal(m1Result.pathExact,false);assert.equal(m1Result.calibration.pathExact,false);assert.equal(m1Result.manifest.truth_contract.pathTruth,'M1_PATH_APPROX');
 const durableTrials=(await json('/api/research/trials')).data;
 assert.equal((await json('/api/research/jobs',{kind:'order'})).status,400);
 await stop();await boot();state=(await json('/api/research/workspace')).data;assert.equal(state.storage.mfe_strategy_cards,'[]');assert.deepEqual((await json('/api/research/trials')).data,durableTrials);
 console.log('PUBLIC RUNTIME PASS: built worker, durable trial ledger, cache requests, ablation fold instrumentation, restart, offline MT5 and forbidden order refusal; fixture-only history.');
}finally{await stop();assert.ok(resolve(workspace).startsWith(resolve(tmpdir())+sep));rmSync(workspace,{recursive:true,force:true});}
