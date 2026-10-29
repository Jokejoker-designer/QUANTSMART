import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../mfe_ux_lab/cockpit/package.json',import.meta.url));
const {build}=require('esbuild');
const bundled=await build({entryPoints:[fileURLToPath(new URL('../mfe_ux_lab/cockpit/src/lib/researchJobs.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {runResearchJob}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
globalThis.document={hidden:false};
const calls=[];const realFetch=globalThis.fetch;
try{
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),...options});return new Response(JSON.stringify({id:'owned-job',status:options.method==='DELETE'?'cancelled':'queued'}),{status:options.method==='POST'?202:200,headers:{'Content-Type':'application/json'}});};
 const controller=new AbortController();
 await assert.rejects(()=>runResearchJob({kind:'backtest',bars:[],storage:{}},controller.signal,{cancelOnAbort:true,onProgress:()=>controller.abort()}),error=>error.name==='AbortError');
 assert.ok(JSON.parse(calls[0].body).manual_run_id,'manual runs must not share cancellation ownership with cached jobs');
 assert.equal(calls.at(-1).method,'DELETE');assert.equal(calls.at(-1).url,'/api/research/jobs/owned-job');
 assert.ok(calls.every(call=>call.url.startsWith('/api/research/')),'research cancellation never calls broker execution');
 console.log('RESEARCH OPERATIONS PASS: owned manual run, actual cancellation request and no broker execution.');
}finally{globalThis.fetch=realFetch;delete globalThis.document;}
