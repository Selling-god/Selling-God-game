import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ZONES} from '../shared/content.js';
import {PROVINCES} from '../shared/expeditions.js';
import {buildExpedition} from '../shared/expedition-world.js';
import {decorateDungeonEntrance} from '../shared/dungeon-world.js';
import {decorateRealmEntrance} from '../shared/realm-world.js';
import {applyTerrainLayout,SURFACES,TERRAIN_ARCHETYPES} from '../shared/terrain-layouts.js';
import {createMap,PORTALS,BOSS_SPAWNS,isBlocked,lineOfSight,findPath,moveEntity,findSafePosition} from '../shared/world.js';
import {Game,newCharacter,hydrate,serialize} from '../server/game.js';

const fields=Object.values(ZONES).filter(z=>z.id!=='town'&&!z.dungeon&&!z.challenge);
const center=(m,i)=>({x:(i%m.w)*32+16,y:Math.floor(i/m.w)*32+16});
const checksum=m=>createHash('sha256').update(m.blocked).digest('hex');
function flood(map,start){
 const seen=new Uint8Array(map.w*map.h),q=[start];seen[start]=1;
 for(let at=0;at<q.length;at++){
  const i=q[at],x=i%map.w,y=Math.floor(i/map.w);
  for(const n of [x?i-1:-1,x<map.w-1?i+1:-1,y?i-map.w:-1,y<map.h-1?i+map.w:-1])if(n>=0&&!map.blocked[n]&&!seen[n]){seen[n]=1;q.push(n);}
 }
 return seen;
}
function essential(map){return [...map.portals,...map.storyPoints||[],...map.relics||[],...map.npcs||[],BOSS_SPAWNS[map.id]].filter(Boolean);}
function rawExpedition(id){const zone=ZONES[id],map=buildExpedition(id,zone,PORTALS[id]);decorateDungeonEntrance(map,zone);decorateRealmEntrance(map,zone);return map;}

test('169 rebuilt fields and hidden maps have one connected walkable component and preserve all fixed access points',()=>{
 assert.equal(fields.length,169);
 for(const z of fields){
  const m=createMap(z.id),t=m.terrain;
  assert.ok(t&&t.surface instanceof Uint8Array&&t.elevation instanceof Uint8Array,z.id+' terrain must be installed by createMap');
  assert.equal(t.surface.length,m.w*m.h);assert.equal(t.elevation.length,m.w*m.h);
  const start=z.spawn[1]*m.w+z.spawn[0],seen=flood(m,start);
  assert.equal(isBlocked(m,z.spawn[0]*32+16,z.spawn[1]*32+16,14),false,z.id+' spawn');
  for(let i=0;i<m.blocked.length;i++){
   if(!m.blocked[i])assert.equal(seen[i],1,z.id+' isolated floor '+i);
   const solid=[SURFACES.WATER,SURFACES.WALL,SURFACES.LAVA,SURFACES.VOID].includes(t.surface[i]);
   assert.equal(Boolean(m.blocked[i]),solid,z.id+' rendered surface disagrees with collision '+i);
  }
  for(const p of [...essential(m),...m.resources,...m.chests]){
   assert.equal(isBlocked(m,p.x,p.y,14),false,z.id+':'+p.id+' body clearance');
   assert.equal(seen[Math.floor(p.y/32)*m.w+Math.floor(p.x/32)],1,z.id+':'+p.id+' disconnected marker');
  }
  assert.ok(t.repairCount<=2,z.id+' must not flatten its design with global straight-line repairs');
 }
});

test('sixteen provinces and their nine sectors differ in collision geometry, including regions sharing an art theme',()=>{
 assert.ok(Object.keys(TERRAIN_ARCHETYPES).length>=20);
 const hubs=PROVINCES.map(p=>createMap(p.id));
 assert.equal(new Set(hubs.map(m=>m.terrain.id)).size,16);
 assert.equal(new Set(hubs.map(checksum)).size,16);
 for(const p of PROVINCES){
  const layouts=Array.from({length:9},(_,sector)=>checksum(createMap(`${p.id}_reach_${sector}`)));
  assert.equal(new Set(layouts).size,9,p.id+' sectors must change routes, not only color');
 }
 for(const [a,b]of [['desert','sunscar'],['coast','deepsea'],['swamp','wildroot'],['frost','clockwork'],['sky','stormcrown'],['abyss','voidfront'],['observatory','astralforge']]){
  const ma=createMap(a),mb=createMap(b);let changed=0;
  for(let i=0;i<ma.blocked.length;i++)changed+=ma.blocked[i]!==mb.blocked[i];
  assert.ok(changed/ma.blocked.length>.15,`${a}/${b} must change traversable space`);
 }
 for(const realm of ['heaven','inferno','mirror'])assert.notEqual(checksum(createMap(realm+'_garden')),checksum(createMap(realm+'_sanctum')));
});

test('walls occlude attacks; cliffs, canals and voids block movement while pathfinding takes a usable detour',()=>{
 for(const id of ['desert_reach_0','frost_reach_0','deepsea_reach_0','clockwork_reach_0','sky_reach_0','astralforge_reach_0']){
  const m=createMap(id);let pair=null;
  for(let y=4;y<m.h-4&&!pair;y++)for(let x=4;x<m.w-12&&!pair;x++){
   const a={x:x*32+16,y:y*32+16};if(isBlocked(m,a.x,a.y,14))continue;
   for(let gap=4;gap<=12;gap++){
    const b={x:(x+gap)*32+16,y:a.y};if(isBlocked(m,b.x,b.y,14))continue;
    if(!Array.from({length:gap-1},(_,i)=>isBlocked(m,a.x+(i+1)*32,a.y,2)).some(Boolean))continue;
    const path=findPath(m,a,b);if(path.length>gap+2){pair={a,b,path};break;}
   }
  }
  assert.ok(pair,id+' must contain a real obstacle that requires a detour');
  if(['desert_reach_0','frost_reach_0','clockwork_reach_0'].includes(id))assert.equal(lineOfSight(m,pair.a,pair.b),false,id+' cliff wall must occlude attacks');
  const p={...pair.a};moveEntity(m,p,pair.b.x-p.x,0,10);
  assert.ok(p.x<pair.b.x-10,id+' dash must not pass through the obstacle');
  for(const step of pair.path){
   const d=Math.hypot(step.x-pair.a.x,step.y-pair.a.y);assert.ok(Number.isFinite(d));
   assert.equal(isBlocked(m,step.x,step.y,14),false,id+' path tile clearance');
  }
 }
});

test('topology changes preserve optional-object IDs and exact story, portal and hidden-entrance coordinates',()=>{
 for(const id of ['coast_reach_0','deepsea_reach_4','clockwork_reach_8','voidfront_reach_8']){
  const m=rawExpedition(id),z=ZONES[id],fixed=essential(m).map(p=>[p.id,p.x,p.y]),ids=m.resources.map(p=>[p.id,p.type]),chests=m.chests.map(p=>p.id);
  applyTerrainLayout(m,z,{boss:BOSS_SPAWNS[id]});
  assert.deepEqual(essential(m).map(p=>[p.id,p.x,p.y]),fixed);
  assert.deepEqual(m.resources.map(p=>[p.id,p.type]),ids);assert.deepEqual(m.chests.map(p=>p.id),chests);
  assert.equal(m.resources.length,42);assert.equal(m.chests.length,6);
  const copy=rawExpedition(id);applyTerrainLayout(copy,z,{boss:BOSS_SPAWNS[id]});
  assert.deepEqual(m.blocked,copy.blocked);assert.deepEqual(m.resources,copy.resources);assert.deepEqual(m.chests,copy.chests);
 }
});

test('every actual world mob and every field-trial wave starts on safe floor outside the expedition camp',()=>{
 const game=new Game({random:()=>.5});
 for(const z of fields){
  const world=game.createWorld(z.id),m=world.map;
  for(const mob of world.mobs){
   assert.equal(isBlocked(m,mob.x,mob.y,14),false,z.id+':'+mob.id+' spawned in terrain');
   if(z.expedition)assert.ok(Math.hypot(mob.x-m.camp.x,mob.y-m.camp.y)>180,z.id+' camp separation');
  }
  if(!m.trialArena)continue;
  for(const count of [6,8,1])for(let i=0;i<count;i++){
   const angle=i*Math.PI*2/count,r=count===1?75:105+(i%2)*40;
   assert.equal(isBlocked(m,m.trialArena.x+Math.cos(angle)*r,m.trialArena.y+Math.sin(angle)*r,14),false,z.id+' trial wave');
  }
 }
});

test('an old saved location now covered by terrain is safely relocated without losing character progress',()=>{
 const g=new Game({random:()=>.5}),state=newCharacter('terrain-save','OldExplorer','guardian');
 state.zone='deepsea_reach_4';state.level=76;state.xp=123;state.gold=456;
 const m=createMap(state.zone),solid=m.blocked.findIndex((b,i)=>b&&i%m.w>10&&Math.floor(i/m.w)>10),old=center(m,solid);
 Object.assign(state,old);const before=serialize(state),restored=hydrate(before),safe=findSafePosition(m,restored,10);
 assert.equal(isBlocked(m,restored.x,restored.y,10),false,'ordinary login hydration relocates the old blocked position');
 assert.ok(safe);assert.equal(isBlocked(m,safe.x,safe.y,14),false);
 for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const p={...safe};moveEntity(m,p,dx*16,dy*16,10);assert.ok(Math.hypot(p.x-safe.x,p.y-safe.y)>8);
 }
 const p=g.addPlayer(restored),inventory=structuredClone(p.inventory),journey=structuredClone(p.journey);
 g.teleport(p,state.zone,p.x,p.y);
 assert.equal(isBlocked(m,p.x,p.y,10),false);assert.equal(p.level,76);assert.equal(p.xp,123);assert.equal(p.gold,456);
 assert.deepEqual(p.inventory,inventory);assert.deepEqual(p.journey,journey);
});
