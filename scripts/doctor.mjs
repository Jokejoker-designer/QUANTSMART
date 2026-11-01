// Read-only diagnostics. Does not initialize MT5, install packages, or expose env values.
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ROOT,plan,parseEnv,bridgePythonPath} from './bootstrap.mjs';
import {supportedNode,nodeHelp,npmPath,findPython,inspectPython,pythonModules,portAvailable,isWritable,terminalPaths} from './environment.mjs';
export async function diagnose({root=ROOT,args=[],platform=process.platform,env=process.env}={}){
 const rows=[];const add=(name,status,detail,action='')=>rows.push({name,status,detail,action});
 const portable=existsSync(join(root,'PORTABLE_MANIFEST.json'));
 const settings={...parseEnv(readFileSync(join(root,existsSync(join(root,'.env'))?'.env':'.env.example'),'utf8')),...env};
 let config;try{config=plan({platform,env:settings,args});}catch(error){add('Configuration','FAIL',error.message,'Review .env ports/mode. No values have been printed.');return {ok:false,checks:rows};}
 add('Platform','PASS',`${platform} / ${process.arch}`);
 add('Node.js',supportedNode()?'PASS':'FAIL',process.versions.node,supportedNode()?'':nodeHelp());
 const npm=npmPath();const npmVersion=npm?spawnSync(process.execPath,[npm,'--version'],{encoding:'utf8',windowsHide:true,timeout:5000}):null;
 add('npm',portable?'PASS':npmVersion?.status===0?'PASS':'FAIL',portable?'Not needed by the portable app':npmVersion?.stdout?.trim()||'Not found','Source installation: reinstall Node.js LTS with npm.');
 add('Project directory',isWritable(root)?'PASS':'FAIL',isWritable(root)?'Writable':'Not writable','Extract the ZIP into a user-owned folder, outside Program Files.');
 for(const [name,port] of [['App port',config.port],['Bridge port',config.bridgePort]])add(name,await portAvailable(port)?'PASS':'WARN',`127.0.0.1:${port}`,`If occupied, use --${name==='App port'?'port':'bridge-port'} with an available port. Existing services are never killed.`);
 const py=findPython(settings,platform);const p=py.selected;
 add('Python',p?'PASS':'WARN',p?`${p.version}, ${p.bits}-bit, ${p.executable}`:'No usable Python 3.11+ 64-bit interpreter',`Optional for historical research. For Windows MT5 install Python 3.12 64-bit from https://www.python.org/downloads/; enable Add Python to PATH or set MFE_PYTHON. Detected candidates: ${py.probes.map(x=>x.version?`${x.command}: ${x.version}/${x.bits}-bit`:`${x.command}: unavailable`).join('; ')}`);
 const terminals=terminalPaths(platform);add('MT5 terminal',terminals.length?'PASS':'WARN',platform!=='win32'?'Native MT5 requires Windows':terminals.length?terminals.join('; '):'Not found in running processes or common installation locations','Optional. Install/open your broker terminal, sign in there, then choose Auto-Attach. Advanced connection accepts other terminal paths.');
 const app=join(root,'mfe_ux_lab/cockpit');const frontend=existsSync(join(app,portable?'dist/index.html':'node_modules/typescript/bin/tsc'));
 add('Frontend',frontend?'PASS':'WARN',frontend?portable?'Bundled build':'Dependencies installed':'Not installed','Run npm run setup.');
 const venv=bridgePythonPath(root,platform);const vp=existsSync(venv)?inspectPython(venv):null;
 add('Bridge dependencies',pythonModules(vp,['fastapi','uvicorn',...(platform==='win32'?['MetaTrader5']:[])])?'PASS':'WARN',vp?.usable?'Isolated interpreter available':'Not installed or interpreter cannot start','Historical mode does not need Python. For MT5 run npm run setup -- --mt5. A broken .venv-mfe is preserved; repair its base Python or move it aside yourself.');
 add('.env',existsSync(join(root,'.env'))?'PASS':'WARN',existsSync(join(root,'.env'))?'Present; values are private':'Will be created from .env.example','Run setup. Do not add broker passwords to .env.');
 add('Workspace',isWritable(existsSync(join(app,'artifacts/workspace'))?join(app,'artifacts/workspace'):app)?'PASS':'FAIL','Saved locally under the application artifacts/workspace directory','Use a writable extraction location.');
 const data=['M1','M5','M15','M30','H1','H4','D1'].filter(tf=>existsSync(join(app,`public/data/sim/ohlc_XAUUSD_${tf}.json`)));
 add('Historical data',data.length?'PASS':'WARN',data.length?`Local XAUUSD files: ${data.join(', ')}`:'No history bundled; this is expected','Use the first-run CSV importer or Microscope CSV. An empty dataset is not an installation failure.');
 if(args.includes('--offline'))add('Network','WARN','Not checked (--offline)','First source dependency install requires npm/Python registry access. Portable historical mode works offline.');
 else {try{const r=await fetch('https://registry.npmjs.org/',{signal:AbortSignal.timeout(5000)});add('npm registry',r.ok?'PASS':'WARN',`HTTP ${r.status}`,'Check proxy/network access before source setup.');}catch{add('npm registry','WARN','Not reachable','Check network/proxy. Installed or portable historical mode can still run offline.');}}
 return {ok:!rows.some(r=>r.status==='FAIL'),mode:config.bridge?'MT5 connector requested':'Historical research',portable,checks:rows};
}
export function printDiagnosis(report){console.log(`QUANTSMART installation doctor\n${report.mode||''}`);for(const r of report.checks){console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(20)} ${r.detail}`);if(r.status!=='PASS'&&r.action)console.log(`      Fix: ${r.action}`);}console.log('WARN = an optional capability or unchecked condition. No account login or orders were performed.');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);diagnose({args}).then(r=>{if(args.includes('--json'))console.log(JSON.stringify(r,null,2));else printDiagnosis(r);if(!r.ok)process.exitCode=1;}).catch(e=>{console.error(`Doctor: ${e.message}`);process.exitCode=1;});}
