import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter} from '../server/game.js';
import {CLASSES,ZONES} from '../shared/content.js';
import {createMap,isBlocked} from '../shared/world.js';
import {insideVillage,villageLayout,SETTLEMENT_IDS} from '../shared/village-layout.js';
import {JOB_ART_PROFILES,paintJobSignature} from '../client/job-signatures.js';
import {pixelPalette} from '../client/pixel-effects.js';
import {skillVisual} from '../shared/visuals.js';

const hubs=Object.entries(ZONES).filter(([id])=>SETTLEMENT_IDS.includes(id));

test('hubs have a separate obelisk, four spread services, readable nameplate distances and unobstructed tiles',()=>{
 assert.equal(hubs.length,6);
 for(const [id,z]of hubs){
  const map=createMap(id),stone=map.villageStone;
  assert.ok(stone,`${id} must have a teleport obelisk`);
  assert.equal(stone.sprite,'relic_stone',`${id} cannot reuse world boss summoning gate`);
  assert.ok(map.storyPoints.some(p=>p.kind==='warpstone'&&p.id===stone.id));
  assert.ok(!map.props.some(p=>p.id?.startsWith('village_arch_')),`${id}: remove duplicate world-boss portal prop`);
  assert.ok(!isBlocked(map,stone.x,stone.y,14));
  assert.ok(insideVillage(map,stone.x,stone.y));
  if(id==='town')continue;
  const npcs=['shop','craft','heal','jobs'].map(kind=>map.npcs.find(n=>n.kind===kind));
  assert.ok(npcs.every(Boolean),`${id}: four NPC service types`);
  for(const n of npcs){
   assert.ok(!isBlocked(map,n.x,n.y,14),`${id}: ${n.kind} accessible`);
   assert.ok(insideVillage(map,n.x,n.y),`${id}: ${n.kind} inside safe town`);
   assert.ok(Math.hypot(n.x-stone.x,n.y-stone.y)>180,`${id}: ${n.kind} too close to stone`);
  }
  for(let a=0;a<npcs.length;a++)for(let b=a+1;b<npcs.length;b++){
   assert.ok(Math.hypot(npcs[a].x-npcs[b].x,npcs[a].y-npcs[b].y)>230,`${id}: npc labels overlapping`);
  }
  assert.ok(Math.hypot(stone.x-z.spawn[0]*32-16,stone.y-z.spawn[1]*32-16)>240,`${id}: settlement must not attach to region portal/spawn`);
 }
});

test('safe hub does not overlap dragon/boss arena and its geography is deterministic',()=>{
 const {x,y}=createMap('frost').villageStone;
 assert.equal(insideVillage(createMap('frost'),42*32+16,12*32+16,28),false);
 assert.ok(Math.hypot(x-42*32-16,y-12*32-16)>300);
 for(const [id,z]of hubs)assert.deepEqual(villageLayout({...z,id}),villageLayout({...z,id}));
});

test('every regional settlement lets you switch already unlocked jobs; wilderness still rejects it',()=>{
 const game=new Game({random:()=>.5});
 const p=game.addPlayer(newCharacter('safe-class-switch','Switcher','novice'));
 p.discovery.jobs.push('guardian','ranger');
 for(const [i,[id]]of hubs.entries()){
  const stone=game.worlds.get(id).map.villageStone;
  p.zone=id;p.x=stone.x;p.y=stone.y;p.cooldowns.job=0;p.lastCombat=0;
  const target=i%2?'guardian':'ranger';
  const result=game.action(p,{type:'changeJob',id:target});
  assert.ok(result.ok,`${id}: ${result.error}`);
  assert.equal(p.classId,target);
 }
 p.zone='forest';p.x=28*32+16;p.y=37*32+16;p.cooldowns.job=0;p.lastCombat=0;
 assert.equal(insideVillage(game.worlds.get('forest').map,p.x,p.y),false);
 assert.equal(game.action(p,{type:'changeJob',id:p.classId==='guardian'?'ranger':'guardian'}).ok,false);
});

test('server damage guard blocks ordinary and encounter monster hits inside towns but not outside',()=>{
 const g=new Game({random:()=>.5});const p=g.addPlayer(newCharacter('safe-dmg','Protected','guardian'));
 const stone=g.worlds.get('frost').map.villageStone;
 p.zone='frost';p.x=stone.x;p.y=stone.y;p.invulnerableUntil=0;
 const initial=p.hp;
 assert.equal(g.damagePlayer(p,80,{monster:true}),0);
 assert.equal(p.hp,initial);
 p.x=28*32+16;p.y=37*32+16;
 const damage=g.damagePlayer(p,80,{monster:true});
 assert.ok(damage>0);assert.ok(p.hp<initial);
});

test('ordinary monsters spawn and recover outside village borders, including live corrupted positions',()=>{
 const g=new Game({random:()=>.5});const p=g.addPlayer(newCharacter('safe-mob','Visitor','guardian'));
 for(const [id]of hubs.filter(([id])=>id!=='town')){
  const w=g.worlds.get(id);
  for(const m of w.mobs.filter(m=>!m.bossMechanic&&!m.type.includes('warden'))){
   assert.equal(insideVillage(w.map,m.x,m.y,18),false,`${id}: ${m.type} born inside settlement`);
  }
 }
 const w=g.worlds.get('frost'),stone=w.map.villageStone;
 p.zone='frost';p.x=stone.x;p.y=stone.y;
 const m=g.makeMob('stray-village-entrant','slime',stone.x,stone.y);
 w.mobs.push(m);g.tick(.05,g.now+1000);
 assert.ok(!m.alive||!insideVillage(w.map,m.x,m.y,18),'stray mob safely relocated');
});

test('every profession has a different weapon/motif, and its basic skill has a specific name',()=>{
 const jobs=Object.keys(CLASSES).filter(j=>j!=='novice');
 assert.equal(jobs.length,38);
 assert.equal(new Set(jobs.map(j=>JOB_ART_PROFILES[j]?.motif)).size,38);
 assert.equal(new Set(jobs.map(j=>CLASSES[j].skills[0].name)).size,38);
 assert.ok(jobs.every(j=>JOB_ART_PROFILES[j]?.weapon&&JOB_ART_PROFILES[j]?.tier));
 assert.equal(jobs.filter(j=>JOB_ART_PROFILES[j].tier==='hidden').length,8);
});

test('all 38 profession-specific glyphs produce unique concrete draw geometry',()=>{
 const signatures=[];
 for(const job of Object.keys(CLASSES).filter(j=>j!=='novice')){
  const calls=[];
  const draw=new Proxy({alpha(_,f){f();}}, {get(target,k){return target[k]||((...args)=>{calls.push([k,...args]);});}});
  const e={job,skill:'skill1',x:160,y:250,tx:250,ty:270,center:'target'};
  const v=pixelPalette(skillVisual(job,'skill1').theme);
  assert.doesNotThrow(()=>paintJobSignature(draw,e,.38,v),job);
  assert.ok(calls.length>=2,`${job} must make actual VFX marks`);
  signatures.push(JSON.stringify(calls.slice(0,90)));
 }
 assert.equal(new Set(signatures).size,38,'not a recolored duplicate across different jobs');
});
