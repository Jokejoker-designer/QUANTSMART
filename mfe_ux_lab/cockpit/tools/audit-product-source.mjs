// Repeatable source audit of the actual shipped import graph, not backups or legacy pages.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/main.tsx'],bundle:true,format:'esm',platform:'browser',write:false,metafile:true,outdir:'artifacts/source-audit-build',logLevel:'silent'});
const vietnamese=/[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const hits=[];
for(const file of Object.keys(compiled.metafile.inputs).filter(file=>file.startsWith('src/')&&file.endsWith('.tsx')&&!file.endsWith('/AdminPage.tsx'))){
 const raw=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function walk(node){
  if(ts.isStringLiteral(node)||ts.isJsxText(node)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail,ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(node.kind)){
   const text=ts.isJsxText(node)?node.text.replace(/\s+/g,' ').trim():node.text;
   if(text&&vietnamese.test(text))hits.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,text});
  }ts.forEachChild(node,walk);
 }walk(source);
}
const report={scanned_shipped_tsx_files:Object.keys(compiled.metafile.inputs).filter(file=>file.startsWith('src/')&&file.endsWith('.tsx')).length,remaining_non_english_copy:hits.length,scope:'Shipped TSX source copy, excluding private administrator page. User content and external artifact data are not translated.',hits};
fs.mkdirSync('artifacts/product_hardening_20261027',{recursive:true});fs.writeFileSync('artifacts/product_hardening_20261027/language-audit.json',JSON.stringify(report,null,2));
const counts={};for(const hit of hits)counts[hit.file]=(counts[hit.file]||0)+1;
console.log(JSON.stringify({files:report.scanned_shipped_tsx_files,remaining:hits.length,byFile:counts},null,2));
if(process.argv.includes('--strict')&&hits.length)process.exitCode=1;
