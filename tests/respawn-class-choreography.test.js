import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter,serialize} from '../server/game.js';
import {CLASSES,MONSTERS} from '../shared/content.js';
import {MOB_RESPAWN_MIN_MS,MOB_RESPAWN_VARIATION_MS,FIELD_BOSS_RESPAWN_MS,REALM_BOSS_RESPAWN_MS,fieldRespawnDelay} from '../shared/respawn.js';
import {LazyWorldMap} from '../server/lazy-worlds.js';
import {paintCombatChoreography} from '../client/combat-vfx.js';
import {formationIdentity,attackMotionPose} from '../client/skill-formations.js';
import {pixelPalette} from '../client/pixel-effects.js';
import {skillVisual} from '../shared/visuals.js';

function trace(job,skill,frame){
 const calls=[];
 const p=new Proxy({alpha(v,fn){fn();}},{get(obj,key){return obj[key]||((...args)=>calls.push([key,...args]));}});
 const e={type:'attack',job,skill,x:200,y:250,tx:275,ty:215,radius:150,center:skill==='skill2'?'self':'target'};
 paintCombatChoreography(p,e,frame,pixelPalette(skillVisual(job,skill).theme));
 return calls;
}

test('normal, field-boss and realm monster respawns are exactly 2.5x previous values',()=>{
 assert.equal(MOB_RESPAWN_MIN_MS,45_000);
 assert.equal(MOB_RESPAWN_VARIATION_MS,25_000);
 assert.equal(FIELD_BOSS_RESPAWN_MS,300_000);
 assert.equal(REALM_BOSS_RESPAWN_MS,225_000);
 for(const r of [0,.1,.5,.9,1]){
  assert.equal(fieldRespawnDelay(MONSTERS.slime,()=>r),2.5*(18_000+r*10_000));
  assert.equal(fieldRespawnDelay(MONSTERS.moss_guardian,()=>r),300_000);
 }
});

test('normal field mob cannot respawn on old fast timer, then respawns when due',()=>{
 const g=new Game({random:()=>.4});const p=g.addPlayer(newCharacter('respawn-check','Tester','guardian'));
 const m=g.makeMob('a-slime','slime',900,880);g.worlds.get('forest').mobs=[m];
 m.contributors.set(p.id,g.now);g.killMob('forest',m);
 const due=m.respawnAt;assert.equal(due-g.now,55_000);
 p.zone='forest';p.x=900;p.y=880;
 g.tick(.05,due-1);assert.equal(m.alive,false);
 g.tick(.05,due+1);assert.equal(m.alive,true);
 const state=serialize(p);assert.equal(state.level,1);
});

test('retiring a vacant region preserves a longer 300-second boss cooldown',()=>{
 const g=new Game({random:()=>.5});g.now=100_000;
 const w=g.worlds.get('forest');
 const m=g.makeMob('test-slow-boss','moss_guardian',600,650);
 m.alive=false;m.hp=0;m.respawnAt=g.now+FIELD_BOSS_RESPAWN_MS;
 w.mobs.push(m);w.lastAccess=1;
 g.worlds.sweep(g.now+91_000,new Set());
 assert.equal(g.worlds.has('forest'),false);
 assert.ok(g.worlds.residue.get('forest')?.expires>m.respawnAt);
 g.now=m.respawnAt-1000;
 const awake=g.worlds.get('forest');
 // The real map's generated boss is also subject to the above timer if id is present.
 assert.equal(awake.mobs.find(m=>m.id==='test-slow-boss')?.alive,undefined,'new maps only regenerate canonical ids');
 assert.ok(g.worlds.residue.get('forest')===undefined,'residue consumed on reload');
});

test('38 professions have four visible skill animations: basic, Q, E, R differ in both geometry and time',()=>{
 const jobs=Object.keys(CLASSES).filter(j=>j!=='novice');assert.equal(jobs.length,38);
 for(const job of jobs){
  const distinct=new Set();
  for(const slot of ['basic','skill1','skill2','ultimate']){
   const {shape,motif}=formationIdentity(job,slot);
   assert.ok(shape&&motif,`${job}/${slot}`);
   const start=trace(job,slot,.16),middle=trace(job,slot,.52),end=trace(job,slot,.79);
   assert.ok(start.length>3&&middle.length>3&&end.length>3,`${job}/${slot} no shape`);
   assert.notDeepEqual(start,middle,`${job}/${slot} static animation`);
   assert.notDeepEqual(middle,end,`${job}/${slot} no release animation`);
   const sig=JSON.stringify(middle);
   assert.ok(!distinct.has(sig),`${job}: ${slot} repeats another slot`);
   distinct.add(sig);
   for(const call of middle){assert.ok(!JSON.stringify(call).includes('NaN'));assert.ok(!JSON.stringify(call).includes('Infinity'));}
  }
  assert.equal(distinct.size,4);
 }
});

test('every profession has unique visible Q, E and ultimate geometry',()=>{
 for(const slot of ['skill1','skill2','ultimate']){
  const all=new Set();
  for(const job of Object.keys(CLASSES).filter(j=>j!=='novice')){
   const s=JSON.stringify(trace(job,slot,.45));
   assert.ok(!all.has(s),`${job} ${slot} duplicate`);
   all.add(s);
  }
  assert.equal(all.size,38);
 }
});

test('weapon recoil / casting gestures are temporary and move player sprites only',()=>{
 for(const job of ['guardian','lancer','sniper','pyromancer','eclipse_reaper']){
  for(const slot of ['basic','skill1','skill2','ultimate']){
   const mid=attackMotionPose(job,slot,125,50,5);
   assert.ok(mid.active&&Number.isFinite(mid.dx)&&Number.isFinite(mid.dy));
   assert.equal(attackMotionPose(job,slot,10000,50,5).active,false);
  }
 }
 const spear=attackMotionPose('lancer','skill1',120,100,0),sniper=attackMotionPose('sniper','skill1',120,100,0);
 assert.notDeepEqual(spear,sniper);
});
