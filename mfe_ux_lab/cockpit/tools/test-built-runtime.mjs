// HTTP acceptance of the actual built frontend + bundled worker, isolated from the user's workspace.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const workspace=mkdtempSync(join(tmpdir(),'mfe-built-runtime-')),base=`http://127.0.0.1:${port}`;
let child,stderr='';
async function boot(){child=spawn(process.execPath,['tools/productServer.mjs','--port',String(port),'--workspace',workspace],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.on('data',bytes=>stderr+=bytes);for(let n=0;n<80;n++){if(child.exitCode!==null)throw new Error(stderr||'Product runtime exited');try{const r=await fetch(base+'/api/research/health');if(r.ok)return await r.json();}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Product runtime did not start');}
async function stop(){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await stopped;}
try{
 const health=await boot();assert.equal(health.runtime,'built');assert.equal(health.engine_hash,JSON.parse(readFileSync('release_artifacts/research-runtime/manifest.json')).engine_hash);
 const page=await fetch(base+'/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/<title>QUANTSMART<\/title>/);assert.ok(!html.includes('/@vite/client'));
 const asset=html.match(/src="([^"]+\.js)"/)[1];assert.equal((await fetch(new URL(asset,base))).status,200);
 assert.equal((await fetch(base+'/tools/researchWorker.mjs')).status,404);assert.equal((await fetch(base+'/SECRET/config.json')).status,404);
 let state=await(await fetch(base+'/api/research/workspace')).json();
 const saved=await fetch(base+'/api/research/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision,storage:{mfe_strategy_cards:JSON.stringify([{id:'built-qa-card',name:'Built runtime Card',symbol:'XAUUSD',design_tf:'H1',modules:['trend_pullback','auto_rr']}])}})});assert.equal(saved.status,200);
 const job=await(await fetch(base+'/api/research/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'market',dataset:{symbol:'XAUUSD',tf:'H1'},count:100,storage:{}})})).json();
 let result;for(let n=0;n<100;n++){const status=await(await fetch(base+'/api/research/jobs/'+job.id)).json();if(status.status==='failed')throw new Error(status.error);if(status.status==='done'){result=await(await fetch(base+'/api/research/jobs/'+job.id+'/result')).json();break;}await new Promise(resolve=>setTimeout(resolve,40));}assert.equal(result.result.bars.length,100);
 await stop();await boot();state=await(await fetch(base+'/api/research/workspace')).json();assert.equal(JSON.parse(state.storage.mfe_strategy_cards)[0].name,'Built runtime Card');
 console.log('BUILT RUNTIME PASS: static frontend, no Vite client, bundled worker identity, real OHLC job, persistent restart, source/private paths denied.');
}finally{if(child&&child.exitCode===null)await stop();}
