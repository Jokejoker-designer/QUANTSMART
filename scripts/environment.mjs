import {spawnSync} from 'node:child_process';
import {existsSync,accessSync,constants} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import net from 'node:net';

export function supportedNode(version=process.versions.node){const [major,minor]=version.split('.').map(Number);return major>=22&&(major!==22||minor>=12);}
export function nodeHelp(version=process.versions.node){return `QUANTSMART needs Node.js 22.12 or newer (an LTS release is recommended).\nDetected: Node.js ${version}.\nDownload: https://nodejs.org/en/download\nWindows: the portable ZIP includes Node.js and does not require npm.`;}
export function npmPath(){const paths=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js'),'/usr/share/nodejs/npm/bin/npm-cli.js'];return paths.find(p=>p&&existsSync(p))||null;}
export function pythonCommands(env=process.env,platform=process.platform){return [...(env.MFE_PYTHON?[[env.MFE_PYTHON,[]]]:[]),...(platform==='win32'?[['py',['-3.12']],['py',['-3.13']],['py',['-3.11']],['py',['-3']]]:[]),['python',[]],['python3',[]]];}
export function inspectPython(command,args=[]){
 const r=spawnSync(command,[...args,'-c','import sys,struct,json; print(json.dumps({"version":sys.version.split()[0],"bits":struct.calcsize("P")*8,"executable":sys.executable,"usable":sys.version_info >= (3,11) and struct.calcsize("P")==8}))'],{encoding:'utf8',windowsHide:true,timeout:5000});
 try{const d=JSON.parse(r.stdout.trim());return {command,args,...d};}catch{return {command,args,usable:false,reason:r.error?.code||'INTERPRETER_COULD_NOT_START'};}
}
export function findPython(env=process.env,platform=process.platform){const probes=pythonCommands(env,platform).map(([c,a])=>inspectPython(c,a));return {selected:probes.find(p=>p.usable)||null,probes};}
export function pythonModules(python,names){if(!python)return false;const code='import importlib.util,sys; sys.exit(0 if all(importlib.util.find_spec(n) for n in sys.argv[1:]) else 1)';return spawnSync(python.command,[...python.args,'-c',code,...names],{stdio:'ignore',windowsHide:true,timeout:10000}).status===0;}
export function isWritable(directory){try{accessSync(directory,constants.W_OK);return true;}catch{return false;}}
export async function portAvailable(port){return new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
export function terminalPaths(platform=process.platform){
 if(platform!=='win32')return [];
 const code="$paths=@(Get-Process terminal64,terminal -ErrorAction SilentlyContinue | ForEach-Object {$_.Path}); foreach($root in @($env:ProgramFiles,${env:ProgramFiles(x86)})){if($root){Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'MT5|MetaTrader'} | ForEach-Object {$p=Join-Path $_.FullName 'terminal64.exe';if(Test-Path -LiteralPath $p){$paths+=$p}}}}; ConvertTo-Json -InputObject @($paths | Where-Object {$_} | Select-Object -Unique) -Compress";
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:10000});try{return JSON.parse(r.stdout.trim());}catch{return [];}
}
