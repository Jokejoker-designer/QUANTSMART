// Export only a complete application source graph, never the private research workspace.
// Apache-2.0. The generated manifest is the authority for files eligible for publication.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const executingRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceIndex=process.argv.indexOf('--source');
const root=sourceIndex<0?executingRoot:path.resolve(process.argv[sourceIndex+1]||'');
if(!fs.existsSync(path.join(root,'package.json')))throw new Error('A source release root is required.');
const app=path.join(root,'mfe_ux_lab/cockpit');
const require=createRequire(path.join(app,'package.json'));const ts=require('typescript');
const destination=path.join(executingRoot,'release_artifacts',`quantsmart-${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(fs.existsSync(destination))throw new Error('Release destination already exists.');
const preflight=spawnSync(process.execPath,[path.join(app,'node_modules/typescript/bin/tsc'),'--noEmit'],{cwd:app,encoding:'utf8',windowsHide:true});
if(preflight.status!==0){process.stderr.write(preflight.stdout||'');process.stderr.write(preflight.stderr||'');throw new Error('Release source failed TypeScript preflight. Use a stable --source snapshot.');}
const files=new Set();
function add(relative){const absolute=path.resolve(root,relative);if(!absolute.startsWith(root+path.sep))throw new Error('Source dependency escaped the workspace');const normalized=path.relative(root,absolute).split(path.sep).join('/');if(files.has(normalized))return;
 if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())throw new Error('Required release file is missing: '+normalized);
 if(fs.lstatSync(absolute).isSymbolicLink())throw new Error('Release symlinks are not permitted: '+normalized);
 files.add(normalized);
 if(!/\.(?:[cm]?js|tsx?|css)$/.test(normalized))return;
 const raw=fs.readFileSync(absolute,'utf8');
 const dependencies=[];
 if(normalized.endsWith('.css')){for(const match of raw.matchAll(/(?:@import\s+|url\(\s*)["'](\.[^"']+)["']/g))dependencies.push(match[1]);}
 else {
  const ast=ts.createSourceFile(absolute,raw,ts.ScriptTarget.Latest,true,normalized.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(node){
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))dependencies.push(node.moduleSpecifier.text);
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))dependencies.push(node.arguments[0].text);
   if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))dependencies.push(node.argument.literal.text);
   if(ts.isNewExpression(node)&&node.expression.getText(ast)==='URL'&&node.arguments?.[0]&&ts.isStringLiteral(node.arguments[0]))dependencies.push(node.arguments[0].text);
   ts.forEachChild(node,visit);
  }visit(ast);
 }
 for(const imported of dependencies.filter(value=>value.startsWith('.'))){let found=path.resolve(path.dirname(absolute),imported.split('?')[0]);if(!fs.existsSync(found))found=ts.resolveModuleName(imported,absolute,{moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,resolveJsonModule:true},ts.sys).resolvedModule?.resolvedFileName;if(!found||!fs.existsSync(found))throw new Error(`Unresolved release dependency: ${normalized} -> ${imported}`);add(path.relative(root,found));}
}
const top=['package.json','README.md','LICENSE','NOTICE','SECURITY.md','.env.example','.gitignore','start.bat','requirements.txt','requirements-mfe.txt','requirements-dev.txt','scripts/bootstrap.mjs','scripts/package-release.mjs','scripts/test.mjs','tests/bootstrap.test.mjs','tests/mt5-proxy.test.mjs','tests/live-ticks.test.mjs','tests/display-clock.test.mjs','tests/research-operations.test.mjs','tests/workspace-merge.test.mjs','tests/element-size.test.mjs','bridge/mt5_bridge.py','bridge/demo_execution.py','bridge/tests/test_mt5_bridge.py','bridge/tests/test_demo_execution.py'];
top.push('docs/PRODUCT_TOUR.md','docs/VERIFICATION.md','docs/CUSTOM_MODULES.md','docs/screenshots/custom-l1-feature-graph.png');
// Only reviewed public screenshots are eligible; never enumerate the private artifact tree.
for(const page of ['home','entry-danger','microscope','kidi-events','playbook','strategy-lab','strategy-canvas','blocks-modules','beast-lab','formula-lab','weekly-audit','strategy-ranking','assets','hidden-coefficients','analysis','debugger','help'])top.push(`docs/screenshots/${page}.jpg`);
for(const file of top)add(file);
for(const file of ['package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','src/main.tsx','src/three-global.d.ts','tools/researchBackend.mjs','tools/workspaceRepository.mjs','tools/researchWorker.mjs','tools/productServer.mjs','tools/mt5BridgeProxy.mjs','tools/build-research-runtime.mjs','tools/audit-product-source.mjs','tools/test-cockpit-instruments.mjs','tools/test-built-runtime.mjs','tools/test-research-backend.mjs','tools/test-workspace-product.mjs','tools/test-card-lifecycle.mjs'])add('mfe_ux_lab/cockpit/'+file);
for(const relative of files){if(/(?:^|\/)(?:private|_backups|node_modules|artifacts|\.venv(?:-mfe)?|\.agents|\.claude)(?:\/|$)/.test(relative)||relative.endsWith('/AdminPage.tsx'))throw new Error('Private path entered the source graph: '+relative);}
fs.mkdirSync(destination,{recursive:true});
const manifest=[];
for(const relative of [...files].sort()){
 const content=fs.readFileSync(path.join(root,relative));
 if(/\.(?:ts|tsx|mjs|json|py|md|txt)$/.test(relative)){
  const raw=content.toString('utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:https?:\/\/)[^\s/@:]+:[^\s/@]+@|(?:sk-proj-|ghp_)[A-Za-z0-9_-]{20,}/.test(raw))throw new Error('Credential-like material refused in '+relative);
 }
 const target=path.join(destination,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);manifest.push({path:relative,sha256:createHash('sha256').update(content).digest('hex'),bytes:content.length});
}
fs.writeFileSync(path.join(destination,'RELEASE_MANIFEST.json'),JSON.stringify({schema:1,name:'QUANTSMART',license:'Apache-2.0',authority:'SHADOW_ONLY',live_apply_allowed:false,containsCredentials:false,containsMarketHistory:false,files:manifest},null,2));
// Standard-library ZIP; no dependency download or arbitrary filesystem enumeration.
const zip=destination+'.zip';let archived=false;
for(const command of [process.env.MFE_PYTHON,'python','python3'].filter(Boolean)){
 const result=spawnSync(command,['-c','import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"x",zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root)) for p in root.rglob("*") if p.is_file()]; z.close()',destination,zip],{encoding:'utf8',windowsHide:true});if(result.status===0){archived=true;break;}
}
console.log(JSON.stringify({directory:destination,archive:archived?zip:null,files:manifest.length,marketDataBundled:false,credentialsBundled:false},null,2));
if(!archived)console.log('Source directory is ready. Install Python 3 to create the optional ZIP archive.');
