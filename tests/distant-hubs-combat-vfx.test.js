import test from 'node:test';
import assert from 'node:assert/strict';
import {SETTLEMENT_IDS,hasVillage,villageLayout} from '../shared/village-layout.js';
import {ZONES,CLASSES} from '../shared/content.js';
import {PORTALS,createMap,isBlocked} from '../shared/world.js';
import {prepareAtlas} from '../server/atlas.js';
import {skillEffectBounds,paintCombatChoreography,jobEffectIdentity} from '../client/combat-vfx.js';
import {skillVisual} from '../shared/visuals.js';
import {pixelPalette} from '../client/pixel-effects.js';

function hops(from,to){
 const q=[[from,0]],seen=new Set([from]);
 for(let i=0;i<q.length;i++){
  const [id,depth]=q[i];if(id===to)return depth;
  for(const portal of PORTALS[id]||[])if(!seen.has(portal.to)){
   seen.add(portal.to);q.push([portal.to,depth+1]);
  }
 }
 return Infinity;
}

test('six settlements are three or more WORLD portals apart (not just tiles)',()=>{
 assert.equal(SETTLEMENT_IDS.length,6);
 for(let i=0;i<SETTLEMENT_IDS.length;i++)for(let j=i+1;j<SETTLEMENT_IDS.length;j++){
  const a=SETTLEMENT_IDS[i],b=SETTLEMENT_IDS[j];
  assert.ok(hops(a,b)>=3,`${a} -> ${b} crossed only ${hops(a,b)} portals`);
 }
});

test('a stone stands far inland from all its local region exits, while intervening zones stay open',()=>{
 for(const [id,zone]of Object.entries(ZONES)){
  if(zone.expedition||zone.challenge||zone.dungeon||zone.secretRealm)continue;
  const map=createMap(id),hub=SETTLEMENT_IDS.includes(id);
  assert.equal(hasVillage(zone),hub,id);
  assert.equal(!!villageLayout(zone),hub,id);
  assert.equal(!!map.villageStone,hub,id);
  if(!hub){assert.equal(map.villageSafe,undefined,id);continue;}
  const stone=map.villageStone;
  assert.ok(!isBlocked(map,stone.x,stone.y,14),id);
  assert.ok(PORTALS[id].every(portal=>Math.hypot(stone.x-portal.x,stone.y-portal.y)>=16*32),`${id}: near portal`);
  for(const portal of PORTALS[id])assert.ok(!isBlocked(map,portal.x,portal.y,12),id+' entrance blocked');
 }
});

test('legacy save retains obsolete village discoveries but cannot warp to decommissioned hubs',()=>{
 const p={atlas:{townStones:['forest','deepsea','meadow','sky','town'],fog:{},pages:[],contracts:{}}};
 prepareAtlas(p);
 assert.ok(p.atlas.townStones.includes('forest'),'old discovery should survive a save/load round trip');
 assert.ok(p.atlas.townStones.includes('deepsea'));
 assert.equal(hasVillage('forest'),false);
});

function painterTrace(){
 const calls=[],direct=new Proxy({alpha(alpha,callback){callback();}},
  {get(target,key){return target[key]||((...args)=>{calls.push([key,...args]);});}});
 return {p:direct,calls};
}
test('all 38 professions have distinctive actual geometry for basic, skill, defense and ultimate',()=>{
 const ids=Object.keys(CLASSES).filter(k=>k!=='novice');
 assert.equal(ids.length,38);
 for(const skill of ['basic','skill1','skill2','ultimate']){
  const signatures=new Set();
  for(const id of ids){
   const {p,calls}=painterTrace(),v=pixelPalette(skillVisual(id,skill).theme);
   const e={type:skill==='skill2'?'skill':'attack',x:200,y:280,tx:275,ty:265,center:'target',job:id,skill};
   assert.doesNotThrow(()=>paintCombatChoreography(p,e,.44,v),`${id}/${skill}`);
   assert.ok(calls.length>4,`${id}/${skill} must have actual visual strokes`);
   assert.ok(calls.every(call=>JSON.stringify(call).indexOf('NaN')===-1));
   const signature=JSON.stringify(calls.slice(0,150));
   assert.ok(!signatures.has(signature),`${skill} silhouette repeats: ${id}`);
   signatures.add(signature);
   const b=skillEffectBounds(e);
   assert.ok(b.width<520&&b.height<520,`${id}/${skill} has giant bitmap bounds`);
   for(const call of calls)if(call[0]==='rect'){
    assert.ok(call[3]*call[4]<5000,`${id}/${skill} oversized opaque rectangle`);
   }
  }
 }
});
