// Use the same isolated Python environment as the launcher; never install into global Python.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bridgePythonPath,pythonUsable} from './bootstrap.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});if(result.error){console.error(result.error.message);process.exit(1);}if(result.status!==0)process.exit(result.status||1);}
run(process.execPath,['tests/bootstrap.test.mjs']);run(process.execPath,['tests/mt5-proxy.test.mjs']);
run(process.execPath,['tests/live-ticks.test.mjs']);
run(process.execPath,['tests/display-clock.test.mjs']);
run(process.execPath,['tests/research-operations.test.mjs']);
run(process.execPath,['tests/workspace-merge.test.mjs']);
run(process.execPath,['tests/element-size.test.mjs']);
run(process.execPath,['tests/language-audit.test.mjs']);
const isolated=bridgePythonPath(root);
const legacy=join(root,'.venv',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');
const python=existsSync(isolated)?isolated:existsSync(legacy)&&pythonUsable(legacy)?legacy:process.env.MFE_PYTHON||(process.platform==='win32'?'python':'python3');
const probe=spawnSync(python,['-c','import fastapi,httpx'],{cwd:root,stdio:'ignore',windowsHide:true});
if(probe.status!==0){console.error('Python API test dependencies are missing. Install requirements-dev.txt in your virtual environment, then run npm run test:mfe again.');process.exit(1);}
run(python,['-m','unittest','discover','-s','bridge/tests','-p','test_*.py','-v']);
