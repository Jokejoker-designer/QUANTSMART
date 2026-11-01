// Deterministic test lanes with actionable preflight, no automatic network install.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmPath} from './environment.mjs';
import {bridgePythonPath,pythonUsable} from './bootstrap.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),app=join(root,'mfe_ux_lab/cockpit'),args=process.argv.slice(2);
function fail(message){console.error(message);process.exit(2);}
function run(argv,cwd=root,command=process.execPath){const r=spawnSync(command,argv,{cwd,stdio:'inherit',windowsHide:true});if(r.error)fail(r.error.message);if(r.status!==0)process.exit(r.status||1);}
const bridgeOnly=args.includes('--bridge'),withData=args.includes('--with-data');
if(!bridgeOnly&&!existsSync(join(app,'node_modules/typescript/bin/tsc')))fail('Test dependencies are not installed. Run npm run setup -- --historical, then npm run test:public.');
if(withData){const missing=['H1','M15'].filter(tf=>!existsSync(join(app,`public/data/sim/ohlc_XAUUSD_${tf}.json`)));if(missing.length)fail(`Product tests need authorized XAUUSD ${missing.join('/')} history under mfe_ux_lab/cockpit/public/data/sim/. No files were invented. Run npm run test:public for dataset-free checks.`);for(const file of ['test-research-backend.mjs','test-workspace-product.mjs','test-card-lifecycle.mjs'])run(['tools/'+file],app);process.exit(0);}
if(!bridgeOnly){for(const file of ['bootstrap','installer','mt5-proxy','live-ticks','display-clock','research-operations','workspace-merge','element-size','language-audit','first-run','quant-methodology','research-trials','quant-chronology'])run(['tests/'+file+'.test.mjs']);run([npmPath(),'run','typecheck'],app);if(args.includes('--public')){if(!existsSync(join(app,'dist/index.html')))fail('Production build is missing. Run npm run setup -- --historical, then npm run test:public.');run(['tests/public-runtime.test.mjs']);process.exit(0);}if(args.includes('--unit'))process.exit(0);}
const isolated=bridgePythonPath(root);const python=existsSync(isolated)?isolated:process.env.MFE_PYTHON||(process.platform==='win32'?'python':'python3');
if(!pythonUsable(python)||spawnSync(python,['-c','import fastapi,httpx'],{stdio:'ignore',windowsHide:true}).status!==0)fail('Python test dependencies are missing. Run npm run setup -- --historical --dev-deps, then npm run test:bridge.');
run(['-m','unittest','discover','-s','bridge/tests','-p','test_*.py','-v'],root,python);
