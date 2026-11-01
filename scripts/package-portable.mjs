// Reproducible Windows portable layout. Only approved build/runtime files are copied.
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync} from 'node:fs';
import {join,resolve,relative,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {findPython} from './environment.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),app=join(root,'mfe_ux_lab/cockpit');
if(process.platform!=='win32'||process.arch!=='x64')throw new Error('This builder produces the Windows x64 portable release on a Windows x64 host. Other platforms use source setup.');
if(!existsSync(join(app,'dist/index.html')))throw new Error('Run npm run setup -- --historical before packaging.');
const python=findPython().selected;if(!python)throw new Error('Building ZIPs requires Python 3.11+; running the finished historical portable app does not.');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function official(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Official runtime metadata unavailable: HTTP ${r.status}`);return r.text();}
const version=process.version;const sums=await official(`https://nodejs.org/dist/${version}/SHASUMS256.txt`);
const dirty=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',windowsHide:true});if(dirty.status!==0||dirty.stdout.trim())throw new Error('Commit the reviewed sources before creating a portable release, so its sourceCommit is exact.');
const nodeHash=digest(readFileSync(process.execPath));const expected=sums.split(/\r?\n/).find(line=>/\swin-x64\/node\.exe$/.test(line))?.split(/\s+/)[0];
if(!expected||expected!==nodeHash)throw new Error('Installed Node binary does not match the official Windows x64 checksum.');
const license=await official(`https://raw.githubusercontent.com/nodejs/node/${version}/LICENSE`);
const destination=join(root,'release_artifacts',`QUANTSMART-windows-x64-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(existsSync(destination))throw new Error('Portable destination already exists.');mkdirSync(destination,{recursive:true});
const files=[];
function add(source,target=source){const absolute=resolve(root,source);if(!absolute.startsWith(root+sep)||!existsSync(absolute))throw new Error('Missing approved portable input: '+source);const out=join(destination,target);mkdirSync(dirname(out),{recursive:true});const bytes=readFileSync(absolute);writeFileSync(out,bytes);files.push({path:target.replaceAll('\\','/'),bytes:bytes.length,sha256:digest(bytes)});}
function tree(directory){for(const entry of readdirSync(join(root,directory),{withFileTypes:true})){const p=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Portable symlink refused');if(entry.isDirectory())tree(p);else if(entry.isFile())add(p);}}
for(const file of ['LICENSE','NOTICE','.env.example','start.bat','requirements-mfe.txt','requirements-dev.txt','bridge/mt5_bridge.py','bridge/demo_execution.py','scripts/bootstrap.mjs','scripts/environment.mjs','scripts/install.mjs','scripts/doctor.mjs','docs/INSTALLATION.md'])add(file);
for(const file of ['productServer.mjs','researchBackend.mjs','workspaceRepository.mjs','researchTrials.mjs','importRepository.mjs','mt5BridgeProxy.mjs'])add(`mfe_ux_lab/cockpit/tools/${file}`);
tree('mfe_ux_lab/cockpit/dist');tree('mfe_ux_lab/cockpit/release_artifacts/research-runtime');
const nodeTarget=join(destination,'runtime/node.exe');mkdirSync(dirname(nodeTarget),{recursive:true});copyFileSync(process.execPath,nodeTarget);files.push({path:'runtime/node.exe',bytes:readFileSync(nodeTarget).length,sha256:nodeHash});
writeFileSync(join(destination,'runtime/NODE_LICENSE.txt'),license);files.push({path:'runtime/NODE_LICENSE.txt',bytes:Buffer.byteLength(license),sha256:digest(Buffer.from(license))});
for(const packageName of ['react','react-dom','three']){const source=`mfe_ux_lab/cockpit/node_modules/${packageName}/LICENSE`;add(source,`runtime/licenses/${packageName}.txt`);}
const start='QUANTSMART for Windows x64\r\n\r\nExtract the entire ZIP into a writable folder. Double-click start.bat.\r\nHistorical research requires no installed Node/npm/Python and works offline.\r\nImport your authorized OHLC CSV in the first-run panel. No market history is bundled.\r\nMT5 mode requires your broker terminal and Python 3.11+ 64-bit.\r\nFor diagnostics: runtime\\node.exe scripts\\doctor.mjs --offline\r\nKeep the launcher window open; Ctrl+C stops its services.\r\nBefore removing this folder, export Cards and preserve .env, .venv-mfe and mfe_ux_lab\\cockpit\\artifacts\\workspace as needed.\r\nThis is a portable local app, not a signed native installer or a mobile app.\r\n';
const startHelp='Default local URL: http://localhost:5090/\r\nIf port 5090 is occupied, startup stops with an error; no automatic alternate port is selected.\r\n\r\n'+start;
writeFileSync(join(destination,'START_HERE.txt'),startHelp);files.push({path:'START_HERE.txt',bytes:Buffer.byteLength(startHelp),sha256:digest(Buffer.from(startHelp))});
writeFileSync(join(destination,'PORTABLE_MANIFEST.json'),JSON.stringify({schema:1,name:'QUANTSMART',platform:'win32',arch:'x64',node:version,nodeOfficialSha256:nodeHash,sourceCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim(),authority:'SHADOW_ONLY',containsMarketHistory:false,containsCredentials:false,files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2));
const archive=destination+'.zip';const zipped=spawnSync(python.command,[...python.args,'-c','import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"x",zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root)) for p in root.rglob("*") if p.is_file()]; z.close()',destination,archive],{encoding:'utf8',windowsHide:true});if(zipped.status!==0)throw new Error(zipped.stderr||'ZIP failed');
const sha=digest(readFileSync(archive));writeFileSync(archive+'.sha256',`${sha}  ${relative(dirname(archive),archive)}\n`);
const output={directory:destination,archive,sha256:sha,files:files.length+1,node:version};writeFileSync(join(root,'.mfe-state/portable-build.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
