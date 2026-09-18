'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const catalog=require(path.join(root,'data','catalog.json'));
const pkg=require(path.join(root,'package.json'));
const assert=(x,m)=>{if(!x)throw Error(m)};
assert(pkg.version==='7.4.0','package version');
assert(server.includes("const VERSION = '7.4.0';"),'server version');
assert(server.includes("FUSEWILD-V740-QA-REFRESH-20260918"),'deploy id');
assert(html.includes('FUSEWILD-V740-QA-REFRESH-20260918'),'cache bust deploy id');
assert(app.includes('battle-v74'),'battle v74 class');
assert(app.includes('reward-v74')&&app.includes('afterbattle-v74'),'reward v74 classes');
assert(css.includes('FUSEWILD v7.4 QA REFRESH'),'v74 css layer');
assert(css.includes('body.visual-run-v31:has(.battle-v74) .screen'),'mobile screen unclamp');
assert(css.includes('.battle-v74 .move-grid-v52')&&css.includes('grid-template-columns:1fr!important'),'mobile move stack');
assert(css.includes('.battle-v74 .move-btn-v52')&&css.includes('min-height:92px!important'),'mobile readable move height');
assert(css.includes('.afterbattle-v74 .afterbattle-stage-v64')&&css.includes('overflow-y:auto!important'),'desktop reward middle scroll');
assert(css.includes('.reward-v74{position:relative!important;height:auto!important;min-height:100svh!important'),'mobile reward grows');
assert(app.includes("if(name!=='battle'){clearTimeout(state.battleExitTimer)"),'stale exit timer guard');
assert(app.includes("if(mode==='cure'){existing?.remove();if(layer&&!layer.children.length)layer.remove();return;}"),'empty status layer cleanup');
assert(app.includes('beginLocalMoveFeedbackV73'),'immediate move feedback');
assert(app.includes("finisher-target-v73"),'lethal finisher target hold');
assert(app.includes('replacement-required')&&server.includes('replacement-required'),'manual replacement phase');

const refs=[];
for(const c of catalog.cards||[]) if(c.art) refs.push(c.art);
for(const i of catalog.items||[]) if(i.art) refs.push(i.art);
for(const r of catalog.relics||[]) if(r.art) refs.push(r.art);
for(const b of catalog.biomes||[]){if(b.background)refs.push(b.background);for(const s of b.scenes||[])if(s.background)refs.push(s.background);}
for(const m of [...(catalog.enemies||[]),...(catalog.bosses||[])]) for(const k of ['sprite','evolutionSprite','resonanceSprite','riftSprite']) if(m[k]) refs.push(m[k]);
const missing=[...new Set(refs)].filter(x=>!fs.existsSync(path.join(root,String(x).replace(/^\//,''))));
assert(!missing.length,`missing assets ${missing.slice(0,5).join(',')}`);

function walk(dir,out=[]){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p,out);else if(/\.png$/i.test(ent.name))out.push(p);}return out;}
const pngs=walk(path.join(root,'assets'));
let bad=[];
for(const p of pngs){const b=fs.readFileSync(p);if(b.length<40||b.slice(1,4).toString()!=='PNG')bad.push(path.relative(root,p));}
assert(!bad.length,`corrupt png ${bad.slice(0,4).join(',')}`);
console.log(`V74_RELEASE_OK mobileContainment=yes rewardContainment=yes timerGuard=yes statusCleanup=yes assets=${new Set(refs).size} pngs=${pngs.length}`);
