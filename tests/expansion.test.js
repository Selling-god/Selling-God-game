import {readSecret} from '../server/stories.js';
import {SECRET_PATHS} from '../server/story-data.js';
import {LANDMARKS} from '../shared/expeditions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {Game,newCharacter,serialize,hydrate} from '../server/game.js';
import {CLASSES,ITEMS,ZONES,MONSTERS,getStats,NPCS,xpRequired,RECIPES} from '../shared/content.js';
import {JOB_REQUIREMENTS,jobBook,evaluateJobs,readRelic,SEQUENCES} from '../server/progression.js';
import {RELICS,WORLD_BOSSES} from '../shared/expansion.js';
import {statBudget,freePoints,enhancementSpec,DEATH_RULES,ATTRIBUTE_KEYS} from '../shared/rpg.js';
import {skillVisual} from '../shared/visuals.js';
import {createMap,findPath,isBlocked} from '../shared/world.js';
import {bossWindow} from '../server/world-events.js';
import {LocalMotion,SnapshotTrack} from '../client/motion.js';
function setup(level=12,cls='novice'){
 const sent=[],g=new Game({random:()=>.5,send:(id,event,data)=>sent.push({id,event,data})});
 const state=newCharacter(randomUUID(),'Explorer',cls);state.level=level;state.gold=10000;state.xp=250;
 const p=g.addPlayer(state);p.hp=g.stats(p).maxHp;p.mp=g.stats(p).maxMp;return {g,p,sent};
}
function forge(p){const n=NPCS.find(n=>n.kind==='craft');Object.assign(p,{zone:'town',x:n.x,y:n.y});for(const[id,i]of Object.entries(ITEMS))if(i.type==='material')p.inventory[id]=500;}
test('38 discoverable professions plus novice with 9/12/9/8 tier distribution',()=>{
 const counts={};for(const c of Object.values(CLASSES))counts[c.tier]=(counts[c.tier]||0)+1;
 assert.deepEqual(counts,{common:9,novice:1,rare:12,epic:9,hidden:8});
 assert.equal(Object.keys(JOB_REQUIREMENTS).length,38);
 const p=newCharacter(randomUUID(),'Novice');assert.equal(p.classId,'novice');assert.deepEqual(p.discovery.jobs,['novice']);
});
test('legacy saves preserve class, equipment and grant retrospective level points',()=>{
 const old=newCharacter(randomUUID(),'Old','guardian');delete old.attributes;delete old.discovery;delete old.enhancePity;old.level=15;old.enhancements.iron_sword=3;
 const p=hydrate(old);assert.equal(p.classId,'guardian');assert.equal(p.enhancements.iron_sword,3);assert.equal(freePoints(p),56);
 assert.ok(p.discovery.jobs.includes('guardian'));assert.equal(p.gold,old.gold);
});
test('stat allocation is authoritative, budget limited, and changes actual combat values',()=>{
 const {g,p}=setup(10);const before=g.stats(p);p.hp=before.maxHp/2;p.mp=before.maxMp/2;
 assert.equal(g.action(p,{type:'allocateStats',points:{str:8,vit:5,int:4,dex:4,luk:3}}).ok,true);
 const after=g.stats(p);assert.ok(after.atk>before.atk);assert.equal(after.maxHp,before.maxHp+60);assert.equal(after.maxMp,before.maxMp+16);assert.ok(after.speed>before.speed);assert.ok(after.crit>before.crit);
 assert.ok(Math.abs(p.hp/after.maxHp-.5)<.01);assert.ok(Math.abs(p.mp/after.maxMp-.5)<.01);assert.equal(freePoints(p),12);
 assert.equal(g.action(p,{type:'allocateStats',points:{str:13}}).ok,false);
 for(const points of [{str:-1},{str:NaN},{str:1.5},{str:'3'},{evil:1},{str:Infinity}])assert.equal(g.action(p,{type:'allocateStats',points}).ok,false);
});
test('stat reset is first-free, later paid, town-only, and cannot grant extra points or healing',()=>{
 const {g,p}=setup(8);g.action(p,{type:'allocateStats',points:{vit:10,str:10}});p.hp=Math.floor(g.stats(p).maxHp*.4);const ratio=p.hp/g.stats(p).maxHp,gold=p.gold;
 p.zone='forest';assert.equal(g.action(p,{type:'resetStats'}).ok,false);p.zone='town';
 assert.equal(g.action(p,{type:'resetStats'}).ok,true);assert.equal(p.gold,gold);assert.equal(freePoints(p),28);assert.ok(p.hp/g.stats(p).maxHp<=ratio+.001);
 g.action(p,{type:'allocateStats',points:{str:2}});assert.equal(g.action(p,{type:'resetStats'}).ok,true);assert.equal(p.gold,gold-500);
 assert.equal(g.action(p,{type:'resetStats'}).ok,false);
});
test('growth fields, enhancement pity and soul recovery are serialized but runtime tokens are not',()=>{
 const {g,p}=setup();p.enhancePity.iron_sword=2;g.action(p,{type:'allocateStats',points:{dex:3}});
 g.damagePlayer(p,999999);const saved=serialize(p),restored=hydrate(saved);
 assert.equal(restored.attributes.dex,3);assert.equal(restored.enhancePity.iron_sword,2);assert.equal(restored.deaths,1);assert.ok(restored.soul);assert.equal(restored.zone,'town');
});
test('death cost has beginner protection, cap, no level loss and no duplicate charge',()=>{
 const {g,p}=setup(12);p.gold=100000;p.xp=3;p.zone='forest';const gear=JSON.stringify(p.equipment);
 g.damagePlayer(p,999999);assert.equal(p.gold,99500);assert.equal(p.xp,0);assert.equal(p.level,12);assert.equal(JSON.stringify(p.equipment),gear);
 const gold=p.gold;g.damagePlayer(p,999999);assert.equal(p.gold,gold);assert.equal(p.deaths,1);
 const early=setup(4);early.g.damagePlayer(early.p,999999);assert.equal(early.p.gold,10000);assert.equal(early.p.xp,250);assert.equal(early.p.soul,null);
});
test('soul recovery is location bound, one-time, restores only recorded loss and removes weakness',()=>{
 const {g,p}=setup(12);p.zone='forest';const oldXP=p.xp,oldGold=p.gold;g.damagePlayer(p,999999);
 const soul={...p.soul};assert.ok(g.stats(p).weakened);
 g.tick(.05,g.now+4000);assert.equal(p.zone,'town');assert.equal(g.action(p,{type:'recoverSoul',id:soul.id}).ok,false);
 Object.assign(p,{zone:soul.zone,x:soul.x,y:soul.y});p.invulnerableUntil=0;
 assert.equal(g.action(p,{type:'recoverSoul',id:soul.id}).ok,true);assert.equal(p.xp,oldXP);assert.equal(p.gold,oldGold-Math.floor(oldGold*.03)+soul.gold);
 assert.equal(p.soul,null);assert.equal(g.stats(p).weakened,false);assert.equal(g.action(p,{type:'recoverSoul',id:soul.id}).ok,false);
});
test('expired soul cannot be collected and weakness is time-limited',()=>{
 const {g,p}=setup();p.zone='forest';g.damagePlayer(p,999999);const id=p.soul.id;
 p.hp=1;g.now+=DEATH_RULES.graveMs+1;assert.equal(g.action(p,{type:'recoverSoul',id}).ok,false);assert.equal(g.stats(p).weakened,false);
});
test('enhancement failures preserve equipment, consume resources, accumulate and reset pity',()=>{
 const {g,p}=setup();forge(p);p.enhancements.iron_sword=3;g.random=()=>.95;
 const gold=p.gold,n=p.inventory.ore;
 let r=g.action(p,{type:'enhance',id:'iron_sword'});assert.equal(r.success,false);assert.equal(p.enhancements.iron_sword,3);assert.equal(p.inventory.iron_sword,1);assert.ok(p.gold<gold&&p.inventory.ore<n);
 r=g.action(p,{type:'enhance',id:'iron_sword'});assert.equal(r.success,false);
 r=g.action(p,{type:'enhance',id:'iron_sword'});assert.equal(r.success,true);assert.equal(p.enhancements.iron_sword,4);assert.equal(p.enhancePity.iron_sword,0);
});
test('all ten enhancement levels work and +10 is final; invalid/remote requests reject',()=>{
 const {g,p}=setup(30);forge(p);p.gold=100000;g.random=()=>0;
 for(let i=1;i<=10;i++){assert.equal(g.action(p,{type:'enhance',id:'iron_sword'}).success,true);assert.equal(p.enhancements.iron_sword,i);}
 assert.equal(g.action(p,{type:'enhance',id:'iron_sword'}).ok,false);assert.equal(g.action(p,{type:'enhance',id:'gel'}).ok,false);
 p.zone='forest';assert.equal(g.action(p,{type:'enhance',id:'tunic'}).ok,false);
 assert.equal(enhancementSpec(9,8).rate,1);
});
test('hidden identities require the complete new sequence; legacy relic records remain intact',()=>{
 const {g,p}=setup(30);let book=jobBook(p);
 assert.ok(book.filter(j=>j.tier==='hidden').every(j=>!j.discovered&&!j.requirements.length));
 const r=RELICS.find(r=>r.id===SEQUENCES.voidwalker[0]);readRelic(g,p,r);
 assert.equal(jobBook(p).find(j=>j.id==='voidwalker').discovered,false);
 const n=p.discovery.relics.length;readRelic(g,p,r);
 assert.equal(p.discovery.relics.length,n);assert.equal(p.discovery.sequences.voidwalker,1);
 for(const [i,id]of SECRET_PATHS.voidwalker.entries()){
  readSecret(g,p,LANDMARKS.find(x=>x.id===id));
  assert.equal(jobBook(p).find(j=>j.id==='voidwalker').discovered,i===2);
 }
});
test('job changes require unlock, town and cooldown; weapon family changes without generating duplicate starters',()=>{
 const {g,p}=setup(12);assert.equal(g.action(p,{type:'changeJob',id:'mage'}).ok,false);p.discovery.jobs.push('mage','ranger');
 assert.equal(g.action(p,{type:'changeJob',id:'mage'}).ok,true);assert.equal(ITEMS[p.equipment.weapon].class,'mage');
 assert.equal(g.action(p,{type:'changeJob',id:'ranger'}).ok,false);g.now+=16000;
 g.action(p,{type:'changeJob',id:'ranger'});g.now+=16000;g.action(p,{type:'changeJob',id:'mage'});
 assert.equal(p.inventory.ash_staff,1);
});
test('all 20 relics and all portal routes are traversable on shared collision maps',()=>{
 assert.equal(RELICS.length,20);
 for(const [id,z]of Object.entries(ZONES)){
  const m=createMap(id),from={x:z.spawn[0]*32+16,y:z.spawn[1]*32+16};
  for(const to of [...m.portals,...m.relics]){
   assert.equal(isBlocked(m,to.x,to.y),false,id+':'+to.id);
   assert.ok(findPath(m,from,to).length||Math.hypot(from.x-to.x,from.y-to.y)<32,id+':'+to.id);
  }
 }
});
test('world bosses use fixed quarter-hour boundaries and a ten-minute window',()=>{
 const hour=Date.parse('2026-10-23T03:00:00Z');
 for(const d of WORLD_BOSSES){const w=bossWindow(d,hour+d.minute*60000+5000);assert.equal(w.start,hour+d.minute*60000);assert.equal(w.end-w.start,600000);assert.equal(w.next-w.start,3600000);}
});
test('world boss rewards need minimum contribution and cannot be repeated in one window',()=>{
 const {g,p}=setup(30);g.now=Date.parse('2026-10-23T03:01:00Z');g.events.tick(g.now);
 const def=WORLD_BOSSES[0],entry=[...g.events.windows.values()].find(x=>x.def.id===def.id),m=entry.mob;
 Object.assign(p,{zone:def.zone,x:m.x,y:m.y,hp:500});m.contributors.set(p.id,g.now);m.damageLog.set(p.id,1);
 g.killMob(def.zone,m);assert.equal(p.discovery.worldKills[def.id]||0,0);
 // Independent next hourly window with enough actual damage contribution.
 g.now+=3600000;g.events.tick(g.now);const e=[...g.events.windows.values()].find(x=>x.def.id===def.id&&x.status==='active'),b=e.mob;
 b.contributors.set(p.id,g.now);b.damageLog.set(p.id,1000);
 g.killMob(def.zone,b);assert.equal(p.discovery.worldKills[def.id],1);const token=p.inventory.world_token;
 b.alive=true;b.contributors.set(p.id,g.now);g.killMob(def.zone,b);assert.equal(p.inventory.world_token,token);
 assert.ok(p.inventory.tempest_core>0);
});
test('boss equipment recipes have distinct art themes and real material requirements',()=>{
 const gear=Object.entries(ITEMS).filter(([id])=>id.startsWith('boss_'));assert.equal(gear.length,16);
 for(const [id,i]of gear){assert.ok(i.visualTheme);assert.ok(RECIPES.some(r=>r.output===id));}
});
test('every job has four visual descriptors and all equipped gear has sixteen sprite layers',()=>{
 const atlas=JSON.parse(fs.readFileSync('public/assets/atlas.json','utf8'));
 for(const id of Object.keys(CLASSES))for(const skill of CLASSES[id].skills){
  assert.ok(skillVisual(id,skill.id).primary);
  assert.ok(fs.existsSync(`public/assets/skill_${id}_${skill.id}.png`));
 }
 for(const [id,item]of Object.entries(ITEMS))if(item.type==='gear')for(const dir of 'snew')for(let f=0;f<4;f++)assert.ok(atlas[`gear_${item.visualBase||id}_${dir}_${f}`],id);
 assert.notEqual(skillVisual('pyromancer','ultimate').shape,skillVisual('cryomancer','ultimate').shape);
});
test('snapshot interpolation bridges 6Hz packets with bounded extrapolation and teleport reset',()=>{
 const tr=new SnapshotTrack();tr.push(0,{x:0,y:20});tr.push(166,{x:28.22,y:20});tr.push(332,{x:56.44,y:20});
 assert.ok(Math.abs(tr.sample(83).x-14.11)<.01);assert.ok(tr.sample(10000).x<68);
 tr.push(500,{x:900,y:900});assert.equal(tr.samples.length,1);assert.equal(tr.sample(400).x,900);
});
test('local movement renders between packets and freezes when authoritative state goes stale',()=>{
 const map={w:200,h:200,blocked:new Uint8Array(40000)},motion=new LocalMotion(),s={x:500,y:500,hp:100,speed:170,motionId:1};
 motion.reset(s,'test',0);motion.step(map,{x:1,y:0},s,1/60,16.67,16.67);assert.ok(motion.position.x>500);
 for(let i=2;i<40;i++)motion.step(map,{x:1,y:0},s,1/60,i*16.67,i*16.67);
 const before=motion.position.x;motion.step(map,{x:1,y:0},s,1/60,1000,1000);assert.equal(motion.position.x,before);
 motion.accept({...s,x:700,motionId:2},'test',1020,map);assert.equal(motion.position.x,700);
});
test('stat fields are not leaked on remote snapshots but equipped appearance is visible',()=>{
 const {g,p}=setup(),q=g.addPlayer(newCharacter(randomUUID(),'Peer'));
 g.action(p,{type:'allocateStats',points:{str:3}});const remote=g.snapshot(q).players.find(x=>x.id===p.id);
 assert.equal(remote.attributes,undefined);assert.deepEqual(remote.equipment,p.equipment);assert.ok(remote.gearEnhance);assert.equal(remote.inventory,undefined);
});
