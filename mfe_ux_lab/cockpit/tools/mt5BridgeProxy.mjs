// Local same-origin gateway. Market reads and explicitly gated manual Demo routes.
// No arbitrary forwarding, credentials in URLs, or legacy/Real execution routes.
const GET_PATHS = new Set(['status','account','symbols','bars','bar','live_bundle','stream','symbol_spec','history','advice','week_history','candle_markers','candle_lessons','vote_ledger','demo/status','demo/positions','demo/receipt']);
const POST_PATHS = new Set(['connect','disconnect','resolve','demo/preview','demo/submit']);
const AUTHORITY = {authority:'SHADOW_ONLY',decision:'NO_DECISION',live_apply_allowed:false,read_only:true};
export function createMt5BridgeProxy({port=Number(process.env.MFE_BRIDGE_PORT||8791),token=process.env.MFE_BRIDGE_TOKEN||'',enabled=!!process.env.MFE_BRIDGE_TOKEN}={}) {
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_BRIDGE_PORT');
 const send=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
 return async(req,res,next)=>{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/mt5/'))return next();
  let hostname;try{hostname=new URL(`http://${req.headers.host}`).hostname;}catch{return send(res,403,{error:'INVALID_HOST'});}
  if(!['localhost','127.0.0.1','[::1]'].includes(hostname)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(res,403,{error:'LOCAL_BRIDGE_ONLY'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{error:'ORIGIN_MISMATCH'});
  const route=url.pathname.slice('/api/mt5/'.length);
  if(!(req.method==='GET'&&GET_PATHS.has(route)||req.method==='POST'&&POST_PATHS.has(route)))return send(res,404,{error:'READ_ONLY_ENDPOINT_NOT_FOUND'});
  if(['password','login','server','token','terminal_path'].some(key=>url.searchParams.has(key)))return send(res,400,{error:'CREDENTIALS_NOT_ALLOWED_IN_URL'});
  if(req.method==='POST'&&(req.headers['x-mfe-request']!=='1'||!String(req.headers['content-type']||'').startsWith('application/json')))return send(res,403,{error:'SAME_ORIGIN_JSON_REQUIRED'});
  if(!enabled||!token){return send(res,200,{ok:false,connected:false,supported:false,account_kind:'UNKNOWN',trade_allowed:false,reason:process.env.MFE_BRIDGE_DISABLED_REASON||(process.platform==='win32'?'LOCAL_BRIDGE_NOT_STARTED':'NATIVE_MT5_REQUIRES_WINDOWS'),...AUTHORITY});}
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),15000);
  const disconnected=()=>abort.abort();res.once('close',disconnected);
  try{
   let body;if(req.method==='POST'){let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>8192)return send(res,413,{error:'CONNECTION_REQUEST_TOO_LARGE'});chunks.push(chunk);}body=Buffer.concat(chunks);}
   const eventId=String(req.headers['last-event-id']||'');
   if(route==='stream'&&eventId&&!/^\d{1,12}:\d{1,16}:\d{1,8}$/.test(eventId))return send(res,400,{error:'INVALID_TICK_CURSOR'});
   const response=await fetch(`http://127.0.0.1:${port}/mt5/${route}${url.search}`,{method:req.method,headers:{'X-MFE-Bridge-Token':token,...(route==='stream'&&eventId?{'Last-Event-ID':eventId}:{}),...(body?{'Content-Type':'application/json'}:{})},body,redirect:'error',signal:abort.signal});
   if(route==='stream'&&response.ok&&response.headers.get('content-type')?.startsWith('text/event-stream')&&response.body){
    clearTimeout(timer);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
    const reader=response.body.getReader();
    try{while(!abort.signal.aborted){const chunk=await reader.read();if(chunk.done)break;if(chunk.value.byteLength>8*1024*1024)throw new Error('TICK_PACKET_TOO_LARGE');if(!res.write(chunk.value))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});}}
    finally{await reader.cancel().catch(()=>{});if(!res.destroyed)res.end();}return;
   }
   const content=await response.text();if(content.length>8*1024*1024)return send(res,502,{error:'BRIDGE_RESPONSE_TOO_LARGE'});
   const data=JSON.parse(content);return send(res,response.status,data);
  }catch{if(res.headersSent||res.destroyed){if(!res.destroyed)res.end();return;}return send(res,503,{ok:false,connected:false,account_kind:'UNKNOWN',trade_allowed:false,error:'LOCAL_BRIDGE_UNAVAILABLE',reason:'LOCAL_BRIDGE_UNAVAILABLE',...AUTHORITY});}
  finally{clearTimeout(timer);res.off('close',disconnected);}
 };
}
export function mt5BridgePlugin(){const middleware=createMt5BridgeProxy();return {name:'mfe-mt5-readonly-proxy',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);}};}
