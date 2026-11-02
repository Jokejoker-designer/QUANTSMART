import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import {findPython} from '../scripts/environment.mjs';
if(process.platform!=='win32')throw new Error('The portable entry test requires Windows.');
const info=JSON.parse(fs.readFileSync('.mfe-state/portable-build.json'));
const destination=fs.mkdtempSync(path.resolve('release_artifacts/portable QA có dấu and spaces '));
const python=findPython().selected;if(!python)throw new Error('ZIP extraction test requires Python 3.11+ on the build host.');
const code='import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])';execFileSync(python.command,[...python.args,'-c',code,info.archive,destination]);
const port=5090;const r=net.createServer();await new Promise((resolve,reject)=>{r.once('error',reject);r.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>r.close(resolve));
const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32'),MFE_MODE:'historical',MFE_OPEN_BROWSER:'false'};delete env.npm_execpath;delete env.MFE_PYTHON;delete env.MFE_BRIDGE_TOKEN;
delete env.MFE_PORT;delete env.MFE_BRIDGE_PORT;
let child,output='',error='',passed=false;
try{
 // Exercise the actual Windows entry point. The child cannot find host Node/npm/Python on PATH.
 child=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`""${path.join(destination,'start.bat')}" --historical --no-browser"`],{cwd:destination,env,windowsHide:true,windowsVerbatimArguments:true,stdio:['pipe','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
 let health;for(let n=0;n<160;n++){if(child.exitCode!==null)throw new Error(output+'\n'+error);try{const response=await fetch(`http://127.0.0.1:${port}/api/research/health`);if(response.ok){health=await response.json();break;}}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
 assert.equal(health?.runtime,'built',output+'\n'+error);assert.ok(!/Installing|Building/.test(output));assert.equal(fs.existsSync(path.join(destination,'node_modules')),false);assert.equal(fs.existsSync(path.join(destination,'.venv-mfe')),false);
 for(let n=0;n<80&&!output.includes('http://localhost:5090/');n++)await new Promise(r=>setTimeout(r,25));
 assert.ok(output.includes('http://localhost:5090/'),'launcher must report the documented browser URL');assert.equal(JSON.parse(fs.readFileSync(path.join(destination,'.mfe-state/launch.json'))).port,5090);
 assert.equal((await(await fetch('http://localhost:5090/api/research/health')).json()).engine_hash,health.engine_hash,'the documented hostname must reach this engine');
 const html=await(await fetch(`http://127.0.0.1:${port}/`)).text();assert.ok(html.includes('QUANTSMART'));assert.ok(!html.includes('/@vite/client'));
 passed=true;const report={status:'PORTABLE ENTRY POINT PASS',defaultPort:5090,noPortOverride:true,pathHasUnicodeAndSpaces:true,systemNodeNpmPythonAbsentFromPath:true,noInstallOrBuild:true,noVite:true,archive:info.archive,bytes:fs.statSync(info.archive).size};fs.writeFileSync('.mfe-state/portable-result.json',JSON.stringify(report,null,2));
}finally{
 const lock=path.join(destination,'.mfe-state/launch.json');if(fs.existsSync(lock)){const {pid}=JSON.parse(fs.readFileSync(lock));const ps=`$children=Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq ${pid}; foreach($child in $children){Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue}; Stop-Process -Id ${pid} -ErrorAction SilentlyContinue; for($attempt=0;$attempt -lt 50;$attempt++){if(-not(Get-Process -Id ${pid} -ErrorAction SilentlyContinue)){exit 0}; Start-Sleep -Milliseconds 100}; exit 1`;execFileSync('powershell.exe',['-NoProfile','-Command',ps],{windowsHide:true});}if(child?.exitCode===null)child.kill();
 let closed=false;for(let attempt=0;attempt<50;attempt++){try{await fetch(`http://127.0.0.1:${port}/api/research/health`,{signal:AbortSignal.timeout(250)});}catch{closed=true;break;}await new Promise(r=>setTimeout(r,50));}assert.ok(closed,'portable service must stop after cleanup');
 fs.writeFileSync('.mfe-state/portable-qa.json',JSON.stringify({directory:destination,entryPointVerified:passed,output,error},null,2));
}

if(passed)console.log(fs.readFileSync('.mfe-state/portable-result.json','utf8'));
