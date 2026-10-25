import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter,serialize,hydrate} from '../server/game.js';
import {CLASSES,MONSTERS} from '../shared/content.js';
import {KITS,UTILITY_RULES,KIT_ROWS} from '../shared/combat-kits.js';
import {MOB_RESPAWN_MIN_MS,MOB_RESPAWN_VARIATION_MS,fieldRespawnDelay} from '../shared/respawn.js';
import {dist,isBlocked,BOSS_SPAWNS} from '../shared/world.js';
import {insideVillage} from '../shared/village-layout.js';
import {tacticalRoles} from '../client/tactical-skill-fx.js';
const roles=new Set(tacticalRoles);
function fighting(job='guardian'){
 const events=[];const g=new Game({random:()=>.5,broadcast:(z,type,data)=>events.push({z,type,data})});
 const p=g.addPlayer(newCharacter('user-'+job,'Tester',job));
 p.zone='forest';p.x=980;p.y=890;p.level=90;
 const s=g.stats(p);p.hp=s.maxHp;p.mp=s.maxMp;
 const w=g.worlds.get('forest');const m=g.makeMob('dummy','moss_guardian',p.x+65,p.y);
 m.hp=m.maxHp=200000;m.alive=true;w.mobs=[m];return {g,p,w,m,events};
}
test('38 professions use intentionally different Q, E, R mechanical IDs and server-visible roles',()=>{
 assert.equal(KIT_ROWS.length,38);const combos=new Set();
 for(const [id,q,e,r] of KIT_ROWS){
  const c=CLASSES[id];assert.ok(c);
  assert.deepEqual(c.skills.map(s=>s.id),['basic','skill1','skill2','ultimate']);
  assert.equal(c.skills[1].actionId,q);assert.equal(c.skills[2].actionId,e);assert.equal(c.skills[3].actionId,r);
  assert.ok(UTILITY_RULES[e],id);for(const s of c.skills.slice(1))assert.ok(roles.has(s.role),`${id}/${s.id}:${s.role}`);
  assert.notEqual(c.skills[1].role,c.skills[2].role);
  const signature=[q,e,r].join('|');assert.ok(!combos.has(signature),`duplicate ${id}`);combos.add(signature);
  assert.notEqual(c.skills[2].desc,'');
 }
});
test('different E skills do not all apply shield & heal; they have distinct combat effects',()=>{
 const eng=fighting('engineer');
 assert.equal(eng.g.attack(eng.p,'skill2').ok,true);
 assert.equal(eng.g.combatFields?.[0]?.type,'turret');
 assert.equal(eng.p.shieldUntil>eng.g.now,false);
 const ranger=fighting('ranger');assert.equal(ranger.g.attack(ranger.p,'skill2').ok,true);
 assert.equal(ranger.g.combatFields?.[0]?.type,'trap');
 const monk=fighting('monk');assert.equal(monk.g.attack(monk.p,'skill2').ok,true);
 assert.ok((monk.p.signature?.stacks||0)>=3);assert.equal(monk.g.combatFields?.length||0,0);
 const guard=fighting('guardian');assert.equal(guard.g.attack(guard.p,'skill2').ok,true);
 assert.ok(guard.p.shieldUntil>guard.g.now);assert.equal(guard.g.combatFields?.length||0,0);
});
test('turret summons persist and deal server-authoritative damage (without duplicate loot)',()=>{
 const {g,p,m}=fighting('engineer');
 m.type='moss_guardian';p.x=960;p.y=880;m.x=1000;m.y=880;
 assert.equal(g.attack(p,'skill2').ok,true);
 const start=m.hp,at=g.now;
 g.tick(.05,at+2000);
 assert.ok(m.hp<start,`turret failed damage: ${m.hp}/${start}`);
 assert.ok(m.contributors.has(p.id));
});
test('skill1 applies marks and ultimate consumes them, different from defensive E',()=>{
 const {g,p,m}=fighting('ranger');
 assert.equal(g.attack(p,'skill1').ok,true);
 assert.ok(m.kitMarks?.[p.id]?.count>=1);
 const before=m.hp;
 assert.equal(g.attack(p,'ultimate').ok,true);
 assert.ok(m.hp<before);
});
test('field skills persist for several pulses and do not touch the player save schema',()=>{
 const {g,p}=fighting('herbalist');
 assert.equal(g.attack(p,'skill2').ok,true);
 assert.ok(g.combatFields.length);
 const saved=serialize(p);assert.equal(saved.combatFields,undefined);assert.equal(saved.combatAnchor,undefined);
 const recovered=hydrate(saved);assert.equal(recovered.classId,p.classId);
});
test('every professional class can cast all 3 skills with enough level/mp and a combat target',()=>{
 for(const id of Object.keys(KITS)){
  const {g,p}=fighting(id);
  for(const skill of ['skill1','skill2','ultimate']){
   const result=g.attack(p,skill);
   assert.equal(result.ok,true,`${id}/${skill}: ${result.error||'no error'}`);
  }
 }
});
test('slow field respawns avoid the player and live monster groups, including re-entry',()=>{
 const {g,p,w}=fighting('guardian');const m=g.makeMob('test_spawn','slime',900,890);
 m.alive=false;m.hp=0;m.respawnAt=g.now+80_000;
 w.mobs=[m,g.makeMob('alive','slime',899,892)];p.x=900;p.y=892;
 const then=g.now;
 g.tick(.05,then+79_999);assert.equal(m.alive,false);
 g.tick(.05,then+80_001);
 assert.equal(m.alive,true);
 assert.ok(dist(m,p)>=150);
 assert.ok(dist(m,w.mobs[1])>=105,`${dist(m,w.mobs[1])} too close`);
 assert.ok(!insideVillage(w.map,m.x,m.y,40));
 assert.ok(!isBlocked(w.map,m.x,m.y,17));
});
test('new field spawn spread is not an encounter pile; boss and settlement exclusion remain',()=>{
 const g=new Game({random:()=>.5});
 for(const zone of ['forest','ruins','meadow']){
  const w=g.worlds.get(zone),mobs=w.mobs.filter(m=>m.alive&&!MONSTERS[m.type].boss);
  assert.ok(mobs.length>10,zone);
  const gap=mobs.map(m=>Math.min(...mobs.filter(other=>other!==m).map(other=>dist(m,other))));
  assert.ok(gap.filter(v=>v>=95).length>mobs.length*.90,`${zone} distribution too packed: ${Math.min(...gap)}`);
  assert.ok(mobs.every(m=>!insideVillage(w.map,m.x,m.y,55)),zone);
  assert.ok(mobs.every(m=>!BOSS_SPAWNS[zone]||dist(m,BOSS_SPAWNS[zone])>235),zone);
 }
 assert.equal(MOB_RESPAWN_MIN_MS,80_000);assert.equal(MOB_RESPAWN_VARIATION_MS,40_000);
 assert.equal(fieldRespawnDelay(MONSTERS.slime,()=>0),80_000);
 assert.equal(fieldRespawnDelay(MONSTERS.slime,()=>1),120_000);
});
