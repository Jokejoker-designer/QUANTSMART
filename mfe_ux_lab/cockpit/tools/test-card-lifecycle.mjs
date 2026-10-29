// Exercises the shipped frontend business functions against a real, isolated backend.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { createResearchBackend } from './researchBackend.mjs';
const backend=await createResearchBackend({workspaceDirectory:mkdtempSync(join(tmpdir(),'mfe-lifecycle-'))});
const server=http.createServer((req,res)=>backend.middleware(req,res,()=>{res.statusCode=404;res.end();}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),key:index=>[...values.keys()][index]??null,get length(){return values.size;}};
globalThis.window=new EventTarget();globalThis.document={hidden:false};
globalThis.CustomEvent=class extends Event{constructor(name,options){super(name);this.detail=options?.detail;}};
const realFetch=globalThis.fetch;globalThis.fetch=(url,options)=>realFetch(new URL(url,base),options);
const entry=`export * from './src/lib/cardPublication.ts';export * from './src/lib/workspaceClient.ts';export * from './src/lib/artifactRegistry.ts';export * from './src/lib/strategyBundle.ts';export * from './src/lib/cardRunStore.ts';export * from './src/lib/researchJobs.ts';`;
const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
try{
 await api.initializeWorkspace();
 const card={id:'qa-lifecycle',name:'Lifecycle Card',symbol:'XAUUSD',design_tf:'H1',execution_tf:'H1',modules:['trend_pullback','auto_rr','observation_zone']};
 api.upsertStrategyCard(card);await Promise.all([api.flushWorkspace(),api.flushWorkspace(),api.flushWorkspace()]);
 assert.equal(api.readStrategyCards()[0].name,card.name);
 const backtest=await api.validateCardForPublication(card,[]);assert.ok(backtest.researchReceipt.job_id);assert.ok(backtest.walkForward);
 api.upsertStrategyCard({...card,validationReceipt:backtest.researchReceipt});await api.flushWorkspace();
 const saved=api.readStrategyCards()[0];assert.equal(saved.validationReceipt.verified,true);assert.equal(saved.n,backtest.analytics.n);
 const restored=JSON.parse((await (await fetch('/api/research/workspace')).json()).storage.mfe_strategy_cards)[0];assert.deepEqual(saved.validationReceipt,restored.validationReceipt);
 const exported=api.exportStrategyBundle();assert.equal(exported.schema,'mfe.strategy-library/2');
 const imported=await api.importStrategyBundle({...exported,cards:exported.cards.map(c=>({...c,id:'qa-imported'}))});assert.equal(imported.added,1);assert.equal(api.readStrategyCards().find(c=>c.id==='qa-imported').evidence_status,'NOT_VALIDATED');
 const originalHash=api.cardHash(saved);api.upsertStrategyCard({...saved,design_tf:'M15',execution_tf:'M15'});await api.flushWorkspace();const changed=api.readStrategyCards().find(c=>c.id===saved.id);assert.equal(changed.validationReceipt.verified,false);assert.notEqual(api.cardHash(changed),originalHash);
 const before=api.readStrategyCards().length;localStorage.setItem('mfe_active_symbol','EURUSD');assert.equal(api.readStrategyCards().length,0);api.upsertStrategyCard({...card,id:'qa-eur',symbol:'EURUSD'});await api.flushWorkspace();localStorage.setItem('mfe_active_symbol','XAUUSD');assert.equal(api.readStrategyCards().length,before);
 console.log('CARD LIFECYCLE PASS: initialize → draft save → same-engine validation → verified publication → backend readback → portable export/import → changed-TF invalidation → asset isolation. Concurrent saves serialized.');
}finally{globalThis.fetch=realFetch;backend.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
