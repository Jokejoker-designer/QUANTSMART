// Shared source/portable setup. No broker login; optional bridge failure degrades explicitly.
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,constants} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,bridgePythonPath,pythonUsable} from './bootstrap.mjs';
import {findPython,inspectPython,pythonModules,npmPath} from './environment.mjs';
export function installationFingerprint(root=ROOT){const hash=createHash('sha256');const app=join(root,'mfe_ux_lab/cockpit');const visit=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(dir,entry.name);if(entry.isDirectory())visit(p);else if(entry.isFile()){hash.update(relative(app,p));hash.update(readFileSync(p));}}};for(const dir of ['src','tools'])visit(join(app,dir));for(const file of ['package.json','package-lock.json','index.html','vite.config.ts'])hash.update(readFileSync(join(app,file)));return hash.digest('hex');}
export async function prepareInstallation({root=ROOT,config,settings,args=[],run}={}){
 const app=join(root,'mfe_ux_lab/cockpit');const portable=existsSync(join(root,'PORTABLE_MANIFEST.json'));const npm=npmPath();
 if(!existsSync(join(root,'.env')))copyFileSync(join(root,'.env.example'),join(root,'.env'),constants.COPYFILE_EXCL);
 const state=join(root,'.mfe-state');mkdirSync(state,{recursive:true});
 if(!portable){
  if(!npm)throw new Error('npm was not found. Reinstall Node.js LTS with npm, or download the Windows portable ZIP.');
  const lockHash=createHash('sha256').update(readFileSync(join(app,'package-lock.json'))).digest('hex');const stamp=join(state,'frontend-lock.sha256');
  if(!existsSync(join(app,'node_modules/typescript/bin/tsc'))||!existsSync(stamp)||readFileSync(stamp,'utf8')!==lockHash){console.log('Installing application dependencies from package-lock.json…');await run(process.execPath,[npm,'ci','--no-fund'],{cwd:app});writeFileSync(stamp,lockHash);}
  if(config.production||args.includes('--setup-only')){
   const fingerprint=installationFingerprint(root),marker=join(state,'build.sha256');
   if(!existsSync(join(app,'dist/index.html'))||!existsSync(join(app,'release_artifacts/research-runtime/worker.cjs'))||!existsSync(marker)||readFileSync(marker,'utf8')!==fingerprint){console.log('Building the local app once. Later starts reuse this build.');await run(process.execPath,[npm,'run','build'],{cwd:app});writeFileSync(marker,fingerprint);}
  }
 }else if(!existsSync(join(app,'dist/index.html'))||!existsSync(join(app,'release_artifacts/research-runtime/worker.cjs')))throw new Error('The portable ZIP is incomplete. Extract the entire archive again.');
 let bridgeEnabled=false,venvPython,disabledReason=config.platform!=='win32'?'NATIVE_MT5_REQUIRES_WINDOWS':'HISTORICAL_MODE';
 if(config.bridge||args.includes('--dev-deps')){
  try{
   const found=findPython(settings,config.platform).selected;if(!found)throw new Error('Python 3.11+ 64-bit was not found. Install Python 3.12 64-bit or set MFE_PYTHON.');
   venvPython=bridgePythonPath(root,config.platform);
   if(!existsSync(venvPython)){console.log('Creating the isolated .venv-mfe environment…');await run(found.command,[...found.args,'-m','venv',join(root,'.venv-mfe')]);}
   if(!pythonUsable(venvPython))throw new Error('The existing .venv-mfe cannot start. Repair its base Python or move that environment aside; it was not overwritten.');
   const dev=args.includes('--dev-deps'),requirement=dev?'requirements-dev.txt':'requirements-mfe.txt';const marker=join(root,'.venv-mfe',dev?'.quantsmart-dev-requirements':'.mfe-requirements');const content=readFileSync(join(root,'requirements-mfe.txt'),'utf8')+(dev?readFileSync(join(root,'requirements-dev.txt'),'utf8'):'');
   if(!existsSync(marker)||readFileSync(marker,'utf8')!==content||!pythonModules(inspectPython(venvPython),['fastapi','uvicorn',...(config.platform==='win32'?['MetaTrader5']:[]),...(dev?['httpx']:[])])){console.log('Installing optional Python connector dependencies…');await run(venvPython,['-m','pip','install','--disable-pip-version-check','-r',requirement],{cwd:root});writeFileSync(marker,content);}
   bridgeEnabled=config.bridge;
  }catch(error){disabledReason='BRIDGE_SETUP_FAILED';if(args.includes('--dev-deps'))throw error;console.warn(`MT5 connector unavailable: ${error.message}\nHistorical research is available. Run npm run mfe:doctor for help.`);}
 }
 return {portable,bridgeEnabled,venvPython,disabledReason};
}
