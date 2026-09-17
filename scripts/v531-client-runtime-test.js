'use strict';
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
for(const rel of ['public/app.js']){
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  if(!/function\s+runMod\s*\(run,key\)/.test(src)) throw new Error(`${rel}: runMod helper missing`);
  const def=src.indexOf('function runMod(run,key)');
  const use=src.indexOf("runMod(run,'captureBonus')");
  if(def<0||use<0) throw new Error(`${rel}: capture runMod wiring missing`);
}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
const sampleItem=(catalog.items||[]).find(x=>x.mod&&Object.prototype.hasOwnProperty.call(x.mod,'captureBonus'));
const sampleRelic=(catalog.relics||[]).find(x=>x.mod&&Object.prototype.hasOwnProperty.call(x.mod,'captureBonus'));
function byId(arr,id){return arr?.find(x=>x.id===id);}
function runMod(run,key){
  let n=Number(run?.mods?.[key]||0);
  for(const [id,count] of Object.entries(run?.items||{})){
    const it=byId(catalog.items,id);
    n+=Number(it?.mod?.[key]||0)*Number(count||0);
  }
  for(const id of (run?.relics||[])){
    const r=byId(catalog.relics,id);
    n+=Number(r?.mod?.[key]||0);
  }
  return n;
}
const run={mods:{captureBonus:.03},items:{},relics:[]};
let expected=.03;
if(sampleItem){run.items[sampleItem.id]=2;expected+=Number(sampleItem.mod.captureBonus||0)*2;}
if(sampleRelic){run.relics.push(sampleRelic.id);expected+=Number(sampleRelic.mod.captureBonus||0);}
const got=runMod(run,'captureBonus');
if(Math.abs(got-expected)>1e-9) throw new Error(`runMod mismatch ${got} != ${expected}`);
console.log('V531_CLIENT_RUNTIME_OK', {sampleItem:sampleItem?.id||null,sampleRelic:sampleRelic?.id||null,captureBonus:got});
