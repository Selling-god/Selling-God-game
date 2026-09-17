'use strict';
// Runs every live test in scripts/ sequentially and prints a summary.
const cp=require('child_process'), fs=require('fs'), path=require('path');
const dir=__dirname;
const files=fs.readdirSync(dir).filter(f=>f.endsWith('-test.js')).sort();
let pass=0; const failed=[];
for(const f of files){
  cp.spawnSync(process.execPath,['-e','setTimeout(()=>{},600)']); // 이전 서버가 포트를 반납할 여유
  const r=cp.spawnSync(process.execPath,[path.join(dir,f)],{encoding:'utf8',timeout:150000});
  const out=`${r.stdout||''}${r.stderr||''}`;
  const ok=/_OK\b/.test(out) && !/FAIL/i.test(out);
  if(ok){pass++;console.log(`  PASS  ${f.replace('.js','')}`);}
  else{failed.push(f);console.log(`  FAIL  ${f.replace('.js','')}`);
       console.log(out.split('\n').filter(l=>!/^\s+at /.test(l)).filter(Boolean).slice(-3).map(l=>`        ${l}`).join('\n'));}
}
console.log(`\nTESTS ${pass}/${files.length} passed`);
if(failed.length){console.error(`FAILED: ${failed.join(', ')}`);process.exit(1);}
