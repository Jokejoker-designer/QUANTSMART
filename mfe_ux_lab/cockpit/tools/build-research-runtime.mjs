import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const result=await build({absWorkingDir:process.cwd(),entryPoints:['tools/researchWorker.mjs'],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});
const code=result.outputFiles[0].text,engineHash=createHash('sha256').update(code).digest('hex');
const directory=resolve('release_artifacts/research-runtime');mkdirSync(directory,{recursive:true});
writeFileSync(resolve(directory,'worker.cjs'),code);writeFileSync(resolve(directory,'manifest.json'),JSON.stringify({schema:1,engine_hash:engineHash,built_at:new Date().toISOString()},null,2));
console.log(`Research runtime built: ${engineHash}`);
