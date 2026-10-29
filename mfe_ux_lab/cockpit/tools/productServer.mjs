// Standalone local product runtime: built frontend, research jobs and durable workspace on one origin.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResearchBackend } from './researchBackend.mjs';
import { createMt5BridgeProxy } from './mt5BridgeProxy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const port=Number(option('--port','5190')),workspaceDirectory=resolve(option('--workspace',resolve(root,'artifacts/workspace')));
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port');
if(!existsSync(resolve(root,'dist/index.html')))throw new Error('Build the frontend first: npm run build');
const backend=await createResearchBackend({workspaceDirectory,runtime:'built'});
const mt5Proxy=createMt5BridgeProxy();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 mt5Proxy(req,res,()=>backend.middleware(req,res,()=>{
  try{
   if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const base=pathname.startsWith('/data/')?resolve(root,'public'):resolve(root,'dist');
   const target=resolve(base,pathname==='/'?'index.html':'.'+pathname);
   if(!target.startsWith(base+sep)||!existsSync(target)||!statSync(target).isFile()||!types[extname(target)]){res.statusCode=404;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'RESOURCE_NOT_FOUND'}));return;}
   const info=statSync(target);res.setHeader('Content-Type',types[extname(target)]);res.setHeader('Content-Length',info.size);res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache');
   if(req.method==='HEAD')res.end();else createReadStream(target).on('error',()=>res.destroy()).pipe(res);
  }catch{res.statusCode=400;res.end('Invalid resource path');}
 }));
});
server.on('error',error=>{backend.close();console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Stop the existing QUANTSMART runtime or choose --port.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`QUANTSMART ready at http://127.0.0.1:${port} · workspace ${workspaceDirectory}`));
const close=()=>{backend.close();server.closeAllConnections();server.close(()=>process.exit(0));};
process.on('SIGINT',close);process.on('SIGTERM',close);
