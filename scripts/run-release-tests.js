'use strict';
// Current release gate only. Historical version-contract tests remain in scripts/ for archaeology,
// but they intentionally assert old UI/version strings and must not block a modern release.
const cp=require('child_process'),path=require('path');
const tests=[
  'catalog-test.js','smoke-test.js','auth-test.js','cloud-room-test.js','multiplayer-test.js',
  'combat-depth-test.js','fifty-floor-test.js','expedition-hunt-test.js','shop-cadence-test.js',
  'fusion-name-fuzz-test.js','game-feel-test.js','v40-monster-evolution-test.js','v42-rift-rewrite-test.js',
  'v47-premium-loop-test.js','v51-combat-ux-test.js','v52-classic-battle-test.js','v53-held-item-test.js',
  'v531-client-runtime-test.js','v532-battleflow-resume-test.js','v55-status-command-resume-test.js',
  'v56-fusion-pp-battle-test.js','v63-trainer-heal-test.js','v74-release-test.js','v74-runtime-test.js','v8-element-relay-test.js','v8-runtime-relay-test.js'
];
let pass=0;const failed=[];
for(const f of tests){
  cp.spawnSync(process.execPath,['-e','setTimeout(()=>{},250)']);
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,f)],{encoding:'utf8',timeout:180000});
  const out=`${r.stdout||''}${r.stderr||''}`;
  const ok=r.status===0&&/_OK\b/.test(out)&&!/FAIL/i.test(out);
  if(ok){pass++;console.log(`  PASS  ${f.replace('.js','')}`);}else{failed.push(f);console.log(`  FAIL  ${f.replace('.js','')}`);console.log(out.split('\n').filter(Boolean).slice(-5).map(x=>`        ${x}`).join('\n'));}
}
console.log(`\nRELEASE TESTS ${pass}/${tests.length} passed`);
if(failed.length){console.error(`FAILED: ${failed.join(', ')}`);process.exit(1)}
console.log('RELEASE_GATE_OK');
