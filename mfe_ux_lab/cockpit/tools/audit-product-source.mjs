// Inspect runtime copy in the shipped import graph, including catalog and helper .ts files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {build} from 'esbuild';
const vietnamese=/[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const untranslatedWords=/\b(?:trong|nguong|truoc|khong|chua|thieu|duoc|lenh|Khe EMA|mang role|GOLD-TUNED · sai cho)\b/i;
export function auditRuntimeCopy(file,raw){
 const source=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const hits=[];
 function visit(node){
  const isText=ts.isStringLiteral(node)||ts.isJsxText(node)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail,ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(node.kind);
  // Legacy-input keys are deliberately retained to read existing artifacts. Their
  // English display values are still audited; this is not a whole-file exemption.
  const legacyInput=file.replace(/\\/g,'/').endsWith('/legacyDisplayCopy.ts')&&ts.isStringLiteral(node)&&ts.isArrayLiteralExpression(node.parent)&&node.parent.elements.length===2&&node.parent.elements[0]===node;
  if(isText&&!legacyInput){const text=ts.isJsxText(node)?node.text.replace(/\s+/g,' ').trim():node.text;if(text&&(vietnamese.test(text)||untranslatedWords.test(text)))hits.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,text});}
  ts.forEachChild(node,visit);
 }
 visit(source);return hits;
}
export async function auditProductSource(){
 const compiled=await build({entryPoints:['src/main.tsx'],bundle:true,format:'esm',platform:'browser',write:false,metafile:true,outdir:'artifacts/source-audit-build',logLevel:'silent'});
 const files=Object.keys(compiled.metafile.inputs).filter(file=>file.startsWith('src/')&&/\.(?:tsx?|[cm]?js)$/.test(file)&&!file.endsWith('/AdminPage.tsx'));
 const hits=files.flatMap(file=>auditRuntimeCopy(file,fs.readFileSync(file,'utf8')));
 const report={scanned_shipped_files:files.length,remaining_non_english_copy:hits.length,scope:'Runtime literals in shipped TS/TSX/JS sources. Comments and legacy-input translation keys are excluded; English display values remain checked. Imported user data and external archives retain their provenance.',hits};
 fs.mkdirSync('artifacts/english_publication_20261029',{recursive:true});fs.writeFileSync('artifacts/english_publication_20261029/language-audit.json',JSON.stringify(report,null,2));
 const counts={};for(const hit of hits)counts[hit.file]=(counts[hit.file]||0)+1;
 console.log(JSON.stringify({files:files.length,remaining:hits.length,byFile:counts},null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await auditProductSource();if(process.argv.includes('--strict')&&result.remaining_non_english_copy)process.exitCode=1;
}
