import assert from 'node:assert/strict';
import http from 'node:http';
import {createMt5BridgeProxy} from '../mfe_ux_lab/cockpit/tools/mt5BridgeProxy.mjs';
const observed=[];
const bridge=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;observed.push({url:req.url,headers:req.headers,body});if(req.url.includes('redirect=1')){res.writeHead(302,{Location:'http://external.invalid/never-follow'});res.end();return;}if(req.url.startsWith('/mt5/stream')){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('id: 1:1000:1\nevent: tick\ndata: {"ok":true}\n\n');setTimeout(()=>res.end(),30);return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({connected:false,supported:true,account_kind:'UNKNOWN',trade_allowed:false,reason:'NOT_ATTACHED'}));});
await new Promise(r=>bridge.listen(0,'127.0.0.1',r));
const proxy=createMt5BridgeProxy({port:bridge.address().port,token:'internal-test-session',enabled:true});
const server=http.createServer((req,res)=>proxy(req,res,()=>{res.statusCode=404;res.end('{}');}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const close=async(s)=>{s.closeAllConnections();await new Promise(r=>s.close(r));};
try{
 assert.equal((await fetch(base+'/api/mt5/status')).status,200);assert.equal(observed[0].headers['x-mfe-bridge-token'],'internal-test-session');
 assert.equal((await fetch(base+'/api/mt5/status',{headers:{Origin:'https://external.invalid'}})).status,403);
 const hostStatus=await new Promise((resolve,reject)=>{const request=http.get({host:'127.0.0.1',port:server.address().port,path:'/api/mt5/status',headers:{Host:'external.invalid'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});assert.equal(hostStatus,403);
 assert.equal((await fetch(base+'/api/mt5/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 const password='TEST_PASSWORD_ONLY';const response=await fetch(base+'/api/mt5/connect',{method:'POST',headers:{'Content-Type':'application/json','X-MFE-Request':'1',Authorization:'do-not-forward',Cookie:'do-not-forward'},body:JSON.stringify({login:'123',password,server:'Fixture'})});
 assert.equal(response.status,200);assert.ok(!JSON.stringify(await response.json()).includes(password));assert.ok(observed.at(-1).body.includes(password));assert.equal(observed.at(-1).headers.authorization,undefined);assert.equal(observed.at(-1).headers.cookie,undefined);
 assert.equal((await fetch(base+'/api/mt5/account?password=forbidden-in-url')).status,400);
 assert.equal((await fetch(base+'/api/mt5/demo_order',{method:'POST',headers:{'Content-Type':'application/json','X-MFE-Request':'1'},body:'{}'})).status,404);
 assert.equal((await fetch(base+'/api/mt5/status?redirect=1')).status,503);
 const stream=await fetch(base+'/api/mt5/stream?symbol=XAUUSD&tf=M1',{headers:{'Last-Event-ID':'1:1000:1'}});assert.equal(stream.status,200);assert.ok(stream.headers.get('content-type').startsWith('text/event-stream'));assert.ok((await stream.text()).includes('event: tick'));assert.equal(observed.at(-1).headers['last-event-id'],'1:1000:1');
 assert.equal((await fetch(base+'/api/mt5/stream',{headers:{Origin:'https://external.invalid'}})).status,403);
 assert.equal((await fetch(base+'/api/mt5/connect',{method:'POST',headers:{'Content-Type':'application/json','X-MFE-Request':'1'},body:'x'.repeat(9000)})).status,413);
 console.log('MT5 PROXY PASS: same-origin/host restrictions, per-process internal token, bounded bodies, no credential URLs, no browser auth forwarding, redirect refusal and no execution routes.');
}finally{await close(server);await close(bridge);}
