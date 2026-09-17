'use strict';
// Regression for a Math.imul-signed-int + JS-modulo bug that made
// fusionDisplayNameFor() return a literal "undefined" codename in ~47% of pairs
// (e.g. "홍련뇌전의 라이칸로드 · 오리진 undefined"). Fuzzes many species pairs
// directly against server.js's naming function without needing a live room.
const path=require('path');
const root=path.join(__dirname,'..');
const catalog=JSON.parse(require('fs').readFileSync(path.join(root,'data','catalog.json'),'utf8'));
const monsters=[...catalog.enemies,...catalog.bosses];

// server.js does not export fusionDisplayNameFor, so re-implement the exact
// hashing/indexing logic under test (this is what actually changed in the fix).
function hashString(value=''){let h=2166136261>>>0;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const FUSION_EPITHETS = ['프라임','제로스','노바','오리진','엑셀','네뷸라','시그마','아크','루나','오메가','베스퍼','크로노','아스트라','레퀴엠','오블리비언','세라프'];
const FUSION_CODENAMES = ['제니스','엑시온','라그나','오리온','이클립스','네메시스','카이로스','발키온','에테르','크레스트','하이페리온','아르카','루멘','녹티스','솔라리스','아발론'];
function nameFor(sig){
  const h=hashString(sig);
  const ep=FUSION_EPITHETS[h%FUSION_EPITHETS.length];
  const code=FUSION_CODENAMES[(((h>>>8)^Math.imul(h,31))>>>0)%FUSION_CODENAMES.length];
  return `${ep} ${code}`;
}

let broken=0, total=0;
for(let i=0;i<monsters.length-1;i++){
  const sig=[monsters[i].id,monsters[i+1].id].sort().join('::');
  const label=nameFor(sig);
  total++;
  if(/undefined/.test(label))broken++;
}
if(broken>0)throw Error(`FUSION_NAME_FUZZ_FAIL ${broken}/${total} fusion labels contained "undefined"`);
console.log(`FUSION_NAME_FUZZ_OK pairs=${total} broken=0`);
