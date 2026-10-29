// One-command local setup. Node built-ins only: no root npm install is needed.
// Copyright 2026 MFE Workspace contributors. Apache-2.0. No broker login at startup.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,unlinkSync,constants} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import net from 'node:net';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const APP=join(ROOT,'mfe_ux_lab','cockpit');
export function parseEnv(text){const result={};for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(m)result[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}return result;}
export function plan({platform=process.platform,env={},args=[]}={}){
 const option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
 const port=Number(option('--port',env.MFE_PORT||5190)),bridgePort=Number(option('--bridge-port',env.MFE_BRIDGE_PORT||8791));
 if(![port,bridgePort].every(n=>Number.isInteger(n)&&n>=1024&&n<=65535)||port===bridgePort)throw new Error('MFE ports must be distinct integers between 1024 and 65535.');
 const mode=args.includes('--historical')?'historical':env.MFE_MODE||'auto';if(!['auto','historical'].includes(mode))throw new Error('MFE_MODE must be auto or historical.');
 return {port,bridgePort,production:args.includes('--production'),bridge:platform==='win32'&&mode!=='historical',openBrowser:!args.includes('--no-browser')&&env.MFE_OPEN_BROWSER!=='false',platform};
}
export function pythonCandidates(env=process.env){return [...(env.MFE_PYTHON?[[env.MFE_PYTHON,[]]]:[]),...(process.platform==='win32'?[['py',['-3']]]:[]),['python',[]],['python3',[]]];}
export function pythonUsable(command,args=[]){const probe=spawnSync(command,[...args,'-c','import sys,struct; print("MFE_PYTHON_OK" if sys.version_info >= (3,11) and struct.calcsize("P")==8 else "UNSUPPORTED")'],{encoding:'utf8',windowsHide:true,timeout:10000});return probe.status===0&&probe.stdout?.trim()==='MFE_PYTHON_OK';}
function pythonInstalled(env){for(const [command,args] of pythonCandidates(env)){if(pythonUsable(command,args))return {command,args};}return null;}
// The research checkout can have a separate .venv tied to a removed vendor Python.
// Never install bridge dependencies into that environment or replace its files.
export function bridgePythonPath(root=ROOT,platform=process.platform){return join(root,'.venv-mfe',platform==='win32'?'Scripts':'bin',platform==='win32'?'python.exe':'python');}
function npmCli(){const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js'),'/usr/share/nodejs/npm/bin/npm-cli.js'];const found=candidates.find(file=>file&&existsSync(file));if(!found)throw new Error('npm could not be located. Start with npm run mfe.');return found;}
export async function listening(port){return new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(800);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});}
async function ready(url,identity,child){for(let i=0;i<120;i++){if(child?.exitCode!==null&&child?.exitCode!==undefined)throw new Error('A local service exited before becoming ready.');try{const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if(response.ok){const data=await response.json();if(identity(data))return data;}}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Local service startup timed out.');}
function openBrowser(url){const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];const child=spawn(command,args,{stdio:'ignore',detached:true,windowsHide:true});child.on('error',()=>console.log(`Open ${url} in your browser.`));child.unref();}

export async function bootstrap(args=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<20 || Number(process.versions.node.split('.')[0])===20 && Number(process.versions.node.split('.')[1])<19)throw new Error('Install Node.js 20.19 or newer.');
 const envFile=join(ROOT,'.env');const settings={...parseEnv(readFileSync(existsSync(envFile)?envFile:join(ROOT,'.env.example'),'utf8')),...process.env};const config=plan({env:settings,args});
 if(args.includes('--check')){console.log(JSON.stringify({...config,node:process.versions.node,frontendDependencies:existsSync(join(APP,'node_modules','vite')),pythonAvailable:!!pythonInstalled(settings)},null,2));return;}
 if(!existsSync(envFile))copyFileSync(join(ROOT,'.env.example'),envFile,constants.COPYFILE_EXCL);
 const stateDir=join(ROOT,'.mfe-state');mkdirSync(stateDir,{recursive:true});const lock=join(stateDir,'launch.json');
 if(existsSync(lock)){
  const previous=JSON.parse(readFileSync(lock,'utf8'));let alive=false;try{process.kill(previous.pid,0);alive=true;}catch{}
  if(alive){if(previous.port===config.port&&await listening(config.port)){const status=await fetch(`http://127.0.0.1:${config.port}/api/research/health`).then(r=>r.json()).catch(()=>null);if(status?.authority==='SHADOW_ONLY'){console.log(`QUANTSMART is already running at http://localhost:${config.port}/`);if(config.openBrowser)openBrowser(`http://localhost:${config.port}/`);return;}}throw new Error('QUANTSMART setup is already running. Use its terminal or wait for setup to finish.');}
  unlinkSync(lock);
 }
 if(await listening(config.port))throw new Error(`Port ${config.port} is in use. Existing processes were left untouched. Stop the previous QUANTSMART launcher or choose --port.`);
 writeFileSync(lock,JSON.stringify({pid:process.pid,port:config.port}),{flag:'wx'});
 const children=new Set();let shuttingDown=false;let resolveStop;const stopped=new Promise(r=>resolveStop=r);
 const stop=()=>{if(shuttingDown)return;shuttingDown=true;for(const child of children)child.kill('SIGTERM');resolveStop();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const run=(command,argv,{cwd=ROOT,env=process.env,long=false}={})=>{
  if(shuttingDown)throw new Error('Setup cancelled.');
  const child=spawn(command,argv,{cwd,env,stdio:'inherit',windowsHide:true});children.add(child);
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{children.delete(child);if(code===0||shuttingDown)resolve();else reject(new Error(`A setup process exited (${code}).`));});});
  if(long){done.then(()=>{if(!shuttingDown){console.error('A local service stopped.');process.exitCode=1;stop();}},error=>{if(!shuttingDown){console.error(error.message);process.exitCode=1;stop();}});return child;}return done;
 };
 try{
  if(!existsSync(join(APP,'node_modules','vite'))){console.log('Installing frontend dependencies…');await run(process.execPath,[npmCli(),existsSync(join(APP,'package-lock.json'))?'ci':'install','--no-audit','--no-fund'],{cwd:APP});}
  let bridgeEnabled=false;let venvPython;let disabledReason=config.platform!=="win32"?"NATIVE_MT5_REQUIRES_WINDOWS":"HISTORICAL_MODE";
  if(config.bridge){
   const python=pythonInstalled(settings);
   if(!python){disabledReason='PYTHON_311_REQUIRED';console.log('Python 3.11+ (64-bit) was not found. Continuing in historical mode.');}
   else try{
    if(await listening(config.bridgePort))throw new Error(`Bridge port ${config.bridgePort} is in use; it was left untouched.`);
    venvPython=bridgePythonPath();
    if(!existsSync(venvPython)){console.log('Creating isolated Python environment (.venv-mfe)…');await run(python.command,[...python.args,'-m','venv',join(ROOT,'.venv-mfe')]);}
    if(!pythonUsable(venvPython))throw new Error('The isolated .venv-mfe interpreter cannot start. Its base Python must be installed. The research .venv was left untouched.');
    const requirements=readFileSync(join(ROOT,'requirements-mfe.txt'),'utf8');const marker=join(ROOT,'.venv-mfe','.mfe-requirements');
    if(!existsSync(marker)||readFileSync(marker,'utf8')!==requirements){console.log('Installing the optional read-only MT5 bridge…');await run(venvPython,['-m','pip','install','--disable-pip-version-check','-r','requirements-mfe.txt']);writeFileSync(marker,requirements);}
    bridgeEnabled=true;
   }catch(error){if(shuttingDown)throw error;disabledReason='BRIDGE_SETUP_FAILED';console.warn(`MT5 bridge unavailable: ${error.message} Continuing in historical mode.`);}
  }else console.log('Historical mode: native MT5 is optional and only supported on Windows.');
  const runtimeEnv={...process.env,MFE_ENABLE_MANUAL_DEMO:settings.MFE_ENABLE_MANUAL_DEMO||'false',MFE_MT5_SERVER_TIMEZONE:settings.MFE_MT5_SERVER_TIMEZONE||'UTC',MFE_BRIDGE_PORT:String(config.bridgePort),MFE_BRIDGE_DISABLED_REASON:disabledReason,MFE_BRIDGE_TOKEN:bridgeEnabled?randomBytes(32).toString('hex'):''};
  if(bridgeEnabled){const bridge=run(venvPython,[join(ROOT,'bridge','mt5_bridge.py')],{env:runtimeEnv,long:true});await ready(`http://127.0.0.1:${config.bridgePort}/health`,d=>d.service==='mfe-mt5-readonly',bridge);console.log('Read-only MT5 bridge ready. Open MT5, then choose Auto-Attach in QUANTSMART.');}
  let frontend;
  if(config.production){console.log('Building the workspace…');await run(process.execPath,[npmCli(),'run','build'],{cwd:APP,env:runtimeEnv});frontend=run(process.execPath,[join(APP,'tools','productServer.mjs'),'--port',String(config.port)],{cwd:APP,env:runtimeEnv,long:true});}
  else frontend=run(process.execPath,[join(APP,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1','--port',String(config.port),'--strictPort'],{cwd:APP,env:runtimeEnv,long:true});
  await ready(`http://127.0.0.1:${config.port}/api/research/health`,d=>d.ok&&d.authority==='SHADOW_ONLY',frontend);
  console.log(`QUANTSMART ready: http://localhost:${config.port}/ · ${bridgeEnabled?'MT5 connector available':'historical mode'} · Ctrl+C stops services started here.`);
  if(config.openBrowser)openBrowser(`http://localhost:${config.port}/`);
  await stopped;
 }finally{
  stop();await Promise.all([...children].map(child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000).unref();})));
  if(existsSync(lock)&&JSON.parse(readFileSync(lock,'utf8')).pid===process.pid)unlinkSync(lock);
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))bootstrap().catch(error=>{console.error(`QUANTSMART setup: ${error.message}`);process.exitCode=1;});
