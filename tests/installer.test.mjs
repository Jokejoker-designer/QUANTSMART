import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {supportedNode,nodeHelp,pythonCommands,inspectPython,portAvailable} from '../scripts/environment.mjs';
import {installationFingerprint,prepareInstallation} from '../scripts/install.mjs';
import {plan} from '../scripts/bootstrap.mjs';
import {diagnose} from '../scripts/doctor.mjs';
for(const v of ['18.17.0','20.19.0','22.11.0'])assert.equal(supportedNode(v),false);
for(const v of ['22.12.0','24.17.0','26.0.0'])assert.equal(supportedNode(v),true);
assert.match(nodeHelp('18.17.0'),/Detected: Node.js 18.17.0/);
assert.equal(plan().production,true);assert.equal(plan({args:['--dev']}).production,false);
assert.equal(plan({args:['--mt5'],platform:'win32'}).bridge,true);
assert.equal(plan({args:['--mt5'],platform:'linux'}).bridge,false);
assert.throws(()=>plan({args:['--historical','--mt5']}));
assert.equal(pythonCommands({MFE_PYTHON:'C:/my python/python.exe'},'win32')[0][0],'C:/my python/python.exe');
assert.equal(inspectPython(process.execPath,['-e','process.exit(1)','--']).usable,false);
const temporary=mkdtempSync(join(tmpdir(),'QUANTSMART test space á '));
try{
 const app=join(temporary,'mfe_ux_lab/cockpit');for(const dir of ['src','tools','dist','release_artifacts/research-runtime'])mkdirSync(join(app,dir),{recursive:true});
 for(const f of ['package.json','package-lock.json','index.html','vite.config.ts'])writeFileSync(join(app,f),'{}');
 writeFileSync(join(app,'src/example.ts'),'export const x=1;');writeFileSync(join(app,'tools/example.mjs'),'export const x=1;');
 const a=installationFingerprint(temporary);writeFileSync(join(app,'src/example.ts'),'export const x=2;');assert.notEqual(installationFingerprint(temporary),a);
 writeFileSync(join(temporary,'.env.example'),'MFE_PORT=5190\nMFE_BRIDGE_PORT=8791\n');
 writeFileSync(join(temporary,'PORTABLE_MANIFEST.json'),'{}');writeFileSync(join(app,'dist/index.html'),'<html/>');writeFileSync(join(app,'release_artifacts/research-runtime/worker.cjs'),'// bundled');
 const commands=[];const config=plan({platform:'linux',args:['--historical']});
 const prepared=await prepareInstallation({root:temporary,config,settings:{},run:async(...args)=>commands.push(args)});assert.equal(prepared.portable,true);assert.equal(prepared.bridgeEnabled,false);assert.deepEqual(commands,[]);
 writeFileSync(join(temporary,'.env'),'MFE_PORT=5190\nPRIVATE_CANARY=never_print_this_value\n');
 const before=readFileSync(join(temporary,'.env'),'utf8');const report=await diagnose({root:temporary,platform:'linux',args:['--offline'],env:{}});assert.equal(report.portable,true);assert.ok(!JSON.stringify(report).includes('never_print_this_value'));assert.equal(readFileSync(join(temporary,'.env'),'utf8'),before);
 assert.ok(!report.checks.some(r=>r.name==='Historical data'&&r.status==='FAIL'));
 assert.equal(existsSync(join(temporary,'.venv')),false);
 console.log('INSTALLER PASS: Node ranges, mode conflicts, Unicode/spaced path, portable no-install path, build invalidation and read-only redacted doctor.');
}finally{assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+requireSeparator()));rmSync(temporary,{recursive:true,force:true});}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
