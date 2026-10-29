// Local research jobs for Vite dev/preview. Same TS engine, isolated workers, bounded queue.
import { Worker } from 'node:worker_threads';
import { createHash, randomUUID } from 'node:crypto';
import { statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspaceRepository } from './workspaceRepository.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataRoot = join(root, 'public', 'data', 'sim');
const STORAGE = new Set(['mfe_coef_profile', 'mfe_custom_modules', 'mfe_custom_l1', 'mfe_custom_l2', 'mfe_custom_l3', 'mfe_custom_l4_recipe', 'mfe_custom_l5_recipe', 'mfe_custom_l6']);
const authority = { authority: 'SHADOW_ONLY', decision: 'NO_DECISION', live_apply_allowed: false };

export async function createResearchBackend({ workspaceDirectory = join(root, 'artifacts', 'workspace'), runtime = 'source' } = {}) {
  let code,watchedFiles=[];
  if(runtime==='built'){
    const directory=join(root,'release_artifacts','research-runtime');
    code=readFileSync(join(directory,'worker.cjs'),'utf8');const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
    if(createHash('sha256').update(code).digest('hex')!==manifest.engine_hash)throw new Error('RESEARCH_RUNTIME_HASH_MISMATCH');
  }else{
    const {build}=await import('esbuild');
    const compiled=await build({absWorkingDir:root,entryPoints:[join(root,'tools/researchWorker.mjs')],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent',metafile:true});
    code=compiled.outputFiles[0].text;watchedFiles=Object.keys(compiled.metafile.inputs).map(file=>resolve(root,file));
  }
  const engineHash = createHash('sha256').update(code).digest('hex');
  const workspace = createWorkspaceRepository(workspaceDirectory);
  workspace.setEngineHash(engineHash);
  const jobs = new Map(); let active = null, totalBytes = 0, closed = false;
  const expires = 15 * 60 * 1000;
  const view = (job) => ({ id: job.id, status: job.status, error: job.error, engine_hash: engineHash, input_hash: job.key, created_at: job.createdAt, completed_at: job.completedAt, ...authority });
  const remove = (job) => { if (job.resultBytes) totalBytes -= job.resultBytes; jobs.delete(job.id); };
  const prune = () => { for (const job of jobs.values()) if (!['queued', 'running'].includes(job.status) && Date.now() - job.createdAt > expires) remove(job); };
  const pump = () => {
    if (active || closed) return;
    const job = [...jobs.values()].find((j) => j.status === 'queued'); if (!job) return;
    active = job; job.status = 'running';
    const worker = new Worker(code, { eval: true, workerData: { request: job.request, dataRoot }, resourceLimits: { maxOldGenerationSizeMb: 768 } });
    job.worker = worker;
    const finish = () => { clearTimeout(job.deadline); if (active === job) active = null; job.worker = null; job.request = null; job.completedAt = Date.now(); pump(); };
    job.deadline = setTimeout(() => { job.error = 'RESEARCH_JOB_TIMEOUT'; job.status = 'failed'; void worker.terminate(); }, 120000);
    worker.once('message', (message) => {
      if (closed || job.status === 'cancelled' || job.status === 'failed') return;
      if (message.error) { job.status = 'failed'; job.error = message.error; }
      else {
        const bytes = Buffer.byteLength(JSON.stringify(message.result));
        if (bytes > 40 * 1024 * 1024) { job.status = 'failed'; job.error = 'RESULT_TOO_LARGE'; }
        else { while (totalBytes + bytes > 96 * 1024 * 1024) { const victim = [...jobs.values()].find((j) => j.status === 'done' && j.id !== job.id); if (!victim) break; remove(victim); } job.result = message.result; job.provenance = message.provenance; job.resultBytes = bytes; totalBytes += bytes; try { workspace.recordJob(job); job.status = 'done'; } catch { job.status = 'failed'; job.error = 'RECEIPT_PERSISTENCE_FAILED'; } }
      }
    });
    worker.once('error', (error) => { if (job.status !== 'cancelled') { job.error = error.message; job.status = 'failed'; } });
    worker.once('exit', () => { if (job.status === 'running') { job.status = 'failed'; job.error = 'WORKER_EXITED'; } finish(); });
  };
  const send = (res, code, payload) => { if (res.destroyed) return; res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(payload)); };
  const middleware = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost'); if (!url.pathname.startsWith('/api/research/')) return next();
    let host; try { host = new URL(`http://${req.headers.host}`).hostname; } catch { return send(res, 403, { error: 'INVALID_HOST' }); }
    const remote = req.socket.remoteAddress;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return send(res, 403, { error: 'LOCAL_RESEARCH_ONLY' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'ORIGIN_MISMATCH' });
    prune();
    if(url.pathname==='/api/research/assets'&&req.method==='GET'){
      const assets=['XAUUSD','EURUSD','GBPUSD','USDJPY','BTCUSD'].map(symbol=>({symbol,files:['M1','M5','M15','M30','H1','H4','D1'].flatMap(tf=>{try{const file=statSync(join(dataRoot,`ohlc_${symbol}_${tf}.json`));return[{timeframe:tf,bytes:file.size,modified_at:file.mtime.toISOString()}];}catch{return[];}})}));
      return send(res,200,{assets,...authority});
    }
    if(url.pathname==='/api/research/calendar'&&req.method==='GET'){
      const stored=workspace.read().storage.mfe_calendar_events;
      return send(res,200,stored?{status:'CONFIGURED',...JSON.parse(stored)}:{status:'NOT_CONFIGURED',events:[]});
    }
    if (url.pathname === '/api/research/workspace') {
      if (req.method === 'GET') return send(res, 200, { ...workspace.read(), ...authority });
      if (req.method !== 'PUT') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      try {
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024)return send(res,413,{error:'WORKSPACE_TOO_LARGE'});chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return send(res,200,{...workspace.commit(input.storage,input.revision),...authority});
      }catch(error){return send(res,error.message==='WORKSPACE_CONFLICT'?409:400,{error:error.message||'WORKSPACE_SAVE_FAILED'});}
    }
    if (url.pathname === '/api/research/health') return send(res, 200, { ok: true, runtime, engine_hash: engineHash, running:active?1:0, queued: [...jobs.values()].filter((j) => j.status === 'queued').length, ...authority });
    if (req.method === 'POST' && url.pathname === '/api/research/jobs') {
      try {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024 * 1024) return send(res, 413, { error: 'INPUT_TOO_LARGE' }); chunks.push(chunk); }
        const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!['backtest', 'calibration', 'market','diagnostic'].includes(request.kind)) return send(res, 400, { error: 'INVALID_JOB_KIND' });
        if(request.kind==='diagnostic'&&!['ablation','funding','beast_roles'].includes(request.analysis))return send(res,400,{error:'INVALID_ANALYSIS'});
        if (request.kind === 'backtest' && (!request.card || !Array.isArray(request.card.modules))) return send(res, 400, { error: 'CARD_REQUIRED' });
        if (request.kind === 'backtest') {
          if (request.card.symbol && request.options?.symbol && request.card.symbol !== request.options.symbol) return send(res, 400, {error:'CARD_ASSET_MISMATCH'});
          request.card = {...request.card, symbol:request.options?.symbol || request.card.symbol || 'XAUUSD'};
        }
        if (Object.keys(request.storage || {}).some((key) => !STORAGE.has(key))) return send(res, 400, { error: 'INVALID_STORAGE_KEY' });
        let dataVersion = '';
        if (request.dataset) {
          const { symbol, tf, from, to } = request.dataset;
          if (!/^[A-Z0-9]{3,12}$/.test(symbol) || !['M1','M5','M15','M30','H1','H4','D1','W1'].includes(tf)) return send(res, 400, { error: 'INVALID_DATASET' });
          if ((from && !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(from)) || (to && !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(to))) return send(res, 400, { error: 'INVALID_DATA_WINDOW' });
          const years = tf === 'M1' && from && to ? Number(to.slice(0,4)) - Number(from.slice(0,4)) + 1 : 0;
          if (years < 0 || years > 20) return send(res, 400, { error: 'INVALID_DATA_WINDOW' });
          const files = years ? Array.from({ length: years }, (_, i) => `ohlc_${symbol}_M1_${Number(from.slice(0,4)) + i}.json`) : [`ohlc_${symbol}_${tf}.json`];
          dataVersion = files.map((file) => { const stat = statSync(join(dataRoot, file)); return `${file}:${stat.size}:${stat.mtimeMs}`; }).join('|');
        } else if (!Array.isArray(request.bars) || request.bars.length > 750000) return send(res, 400, { error: 'INVALID_BARS' });
        const key = createHash('sha256').update(engineHash + dataVersion + JSON.stringify(request)).digest('hex');
        const existing = [...jobs.values()].find((j) => j.key === key && ['queued','running','done'].includes(j.status));
        if (existing) return send(res, 200, view(existing));
        if ([...jobs.values()].filter((j) => ['queued','running'].includes(j.status)).length >= 4) return send(res, 429, { error: 'RESEARCH_QUEUE_FULL' });
        while (jobs.size >= 12) { const victim = [...jobs.values()].find((j) => !['queued','running'].includes(j.status)); if (!victim) break; remove(victim); }
        const job = { id: randomUUID(), key, status:'queued', request, engineHash, createdAt:Date.now() }; jobs.set(job.id, job); pump(); return send(res, 202, view(job));
      } catch (error) { return send(res, 400, { error: error.code === 'ENOENT' ? 'DATASET_NOT_FOUND' : 'INVALID_RESEARCH_REQUEST' }); }
    }
    const match = url.pathname.match(/^\/api\/research\/jobs\/([a-f0-9-]+)(\/result)?$/);
    if (!match) return send(res, 404, { error: 'NOT_FOUND' });
    const job = jobs.get(match[1]); if (!job) return send(res, 404, { error: 'JOB_EXPIRED_OR_NOT_FOUND' });
    if (req.method === 'DELETE') { if (job.status === 'queued' || job.status === 'running') { job.status = 'cancelled'; job.request = null; if (job.worker) void job.worker.terminate(); } return send(res, 200, view(job)); }
    if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    if (match[2]) return job.status === 'done' ? send(res, 200, { ...view(job), result: job.result, provenance: job.provenance }) : send(res, 409, view(job));
    return send(res, 200, view(job));
  };
  return { middleware, watchedFiles, close: () => { closed = true; for (const job of jobs.values()) { clearTimeout(job.deadline); if (job.worker) void job.worker.terminate(); } workspace.close(); } };
}
export function researchBackendPlugin() {
  let backend;
  const install = async (server) => {
    backend = await createResearchBackend();
    server.middlewares.use(backend.middleware); server.httpServer?.once('close', backend.close);
    if (server.watcher) {
      const files = new Set(backend.watchedFiles); server.watcher.add([...files]);
      server.watcher.on('change', (file) => { if (files.has(resolve(file))) void server.restart(); });
    }
  };
  return { name: 'mfe-local-research-jobs', configureServer: install, configurePreviewServer: install, closeBundle: () => backend?.close() };
}
