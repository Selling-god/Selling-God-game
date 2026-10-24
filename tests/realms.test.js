import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,newCharacter,hydrate,serialize} from '../server/game.js';
import {CLASSES,ZONES,MONSTERS,ITEMS,getStats,xpRequired} from '../shared/content.js';
import {REALMS,REALM_ZONES,prepareRealms,realmWeapon,realmPart} from '../shared/realms.js';
import {createMap,isBlocked} from '../shared/world.js';
import {STORY_POINTS} from '../server/stories.js';
import {atlasTotals} from '../shared/expeditions.js';
import {adventurePanel} from '../client/adventure-ui.js';
import {realmsPanel,realmHUD,drawRealmOverlay} from '../client/realms-ui.js';

const setup=(level=160,cls='guardian')=>{
 const messages=[],g=new Game({random:()=>.5,send:(id,event,data)=>messages.push({id,event,data})});
 g.now=Date.parse('2026-10-24T06:00:00Z');
 const p=g.addPlayer(newCharacter('realm-owner','RealmSeeker',cls));p.level=level;p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
 return {g,p,messages};
};
const at=(g,p,zone,point)=>{g.now+=1500;assert.equal(g.teleport(p,zone,point.x,point.y),true,zone);p.lastCombat=0;};
const points=(g,p)=>g.worlds.get(p.zone).map.realmMarkers;
const touch=(g,p,m)=>{at(g,p,p.zone,m);return g.action(p,{type:'realmDevice',id:m.id});};
function readClues(g,p,r){
 for(const id of r.clues){const point=STORY_POINTS.get(id);at(g,p,point.zone,point);assert.equal(g.interact(p,id).ok,true);}
}
function unlock(g,p,r){
 readClues(g,p,r);const marker=createMap(r.entryZone).realmMarkers.find(m=>m.realmKind==='trace');at(g,p,r.entryZone,marker);
 assert.equal(g.interact(p,marker.id).ok,true);
 const devices=points(g,p).filter(m=>m.realmKind==='puzzle');
 for(const index of r.entryOrder)assert.equal(touch(g,p,devices.find(m=>m.index===index)).ok,true);
 const gate=points(g,p).find(m=>m.realmKind==='gate');at(g,p,r.entryZone,gate);
 assert.equal(g.action(p,{type:'realmEnter',id:r.id}).ok,true);assert.equal(p.zone,r.garden);
}
function attest(g,p,r){
 const devices=points(g,p).filter(m=>m.realmKind==='trial');
 for(const index of r.trialOrder)assert.equal(touch(g,p,devices.find(m=>m.index===index)).ok,true);
 const gate=points(g,p).find(m=>m.realmKind==='gate');assert.equal(touch(g,p,gate).ok,true);assert.equal(p.zone,r.sanctum);
}
function defeat(g,p,r){
 const boss=g.worlds.get(r.sanctum).mobs.find(m=>m.type===r.boss);at(g,p,r.sanctum,boss);
 boss.alive=true;boss.hp=boss.maxHp;boss.contributors.set(p.id,g.now);boss.damageLog.set(p.id,boss.maxHp*.1);
 g.killMob(r.sanctum,boss);return boss;
}

test('three hidden themes install six traversable real maps with local enemies, readable devices and existing sprite assets',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../public/assets/atlas.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(REALM_ZONES).length,6);assert.equal(atlasTotals(ZONES).regions,164);
 for(const r of REALMS)for(const id of [r.entryZone,r.garden,r.sanctum]){
  const z=ZONES[id],map=createMap(id),start=z.spawn[1]*map.w+z.spawn[0],seen=new Set([start]),queue=[start];
  for(let i=0;i<queue.length;i++){
   const n=queue[i],x=n%map.w,y=Math.floor(n/map.w);
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,yy=y+dy,next=yy*map.w+xx;
    if(xx>=0&&yy>=0&&xx<map.w&&yy<map.h&&!map.blocked[next]&&!seen.has(next)){seen.add(next);queue.push(next);}
   }
  }
  for(const point of map.realmMarkers){assert.equal(isBlocked(map,point.x,point.y,14),false);assert.ok(seen.has(Math.floor(point.y/32)*map.w+Math.floor(point.x/32)),point.id);}
  if(z.secretRealm){
   assert.ok(z.minLevel>=60);assert.equal(z.dungeon,undefined);assert.equal(z.challenge,undefined);
   for(const type of [...z.mobTypes,...(id===r.sanctum?[r.boss]:[])]){
    const m=MONSTERS[type],humanoid=m.skin==='ash_knight';assert.equal(m.level,r.level);
    for(let f=0;f<4;f++)assert.ok(atlas[`${m.sprite}_${humanoid?'s_':''}${f}`]);
   }
  }
 }
});

test('ordinary maps hide the six worlds, while reading a real prerequisite page reveals a journal clue across regions',()=>{
 const {g,p}=setup(),r=REALMS[0];
 let profile=g.privatePlayer(p);const before=realmsPanel({profile}).html;
 assert.ok(!before.includes(r.name));
 const clue=STORY_POINTS.get(r.clues[0]);at(g,p,clue.zone,clue);assert.equal(g.interact(p,clue.id).ok,true);
 at(g,p,'town',{x:784,y:688});profile=g.privatePlayer(p);
 assert.ok(profile.realms.known.includes(r.id));assert.equal(profile.atlas.pages.length,0);
 assert.equal(profile.realms.requirements[r.id][clue.id],true);assert.equal(profile.realms.requirements[r.id][r.clues[1]],false);
 assert.ok(realmsPanel({profile}).html.includes(r.name));
 profile.discovery.visited.push(r.garden,r.sanctum);
 const ordinary=adventurePanel('map',{profile,tab:'core'});
 assert.match(ordinary.eyebrow,/164 REGIONS/);
 for(const id of Object.keys(REALM_ZONES))assert.ok(!ordinary.html.includes(`data-zone="${id}"`));
 assert.equal(g.action(p,{type:'travel',id:r.garden}).ok,false);
 assert.equal(g.teleport(p,r.garden,912,1136),false);
});

test('every entrance checks both genuine records, character level, physical position and exact device order',()=>{
 for(const r of REALMS){
  const {g,p}=setup(r.level),map=createMap(r.entryZone),trace=map.realmMarkers.find(m=>m.realmKind==='trace'),devices=map.realmMarkers.filter(m=>m.realmKind==='puzzle');
  at(g,p,r.entryZone,trace);assert.equal(g.interact(p,trace.id).ok,true);
  assert.equal(touch(g,p,devices[r.entryOrder[0]]).ok,false);
  readClues(g,p,r);at(g,p,r.entryZone,trace);p.level=r.level-1;
  assert.equal(touch(g,p,devices[r.entryOrder[0]]).ok,false);p.level=r.level;
  p.x+=500;assert.equal(g.action(p,{type:'realmDevice',id:devices[r.entryOrder[0]].id}).ok,false);
  const wrong=devices.find(m=>m.index!==r.entryOrder[0]);assert.equal(touch(g,p,wrong).ok,false);
  assert.ok(!p.realms.unlocked.includes(r.id));
  assert.equal(touch(g,p,devices[r.entryOrder[0]]).ok,true);g.now+=91000;
  assert.equal(touch(g,p,devices[r.entryOrder[1]]).ok,false,'stale progress must restart');
  for(const index of r.entryOrder)assert.equal(touch(g,p,devices[index]).ok,true);
  assert.ok(p.realms.unlocked.includes(r.id));assert.equal(p.realms.cleared.length,0);
 }
});

test('mirror entrance and garden require the reflected coordinates rather than following the visible coordinates',()=>{
 const r=REALMS[2],{g,p}=setup(r.level);readClues(g,p,r);
 const map=createMap(r.entryZone),devices=map.realmMarkers.filter(m=>m.realmKind==='puzzle');
 at(g,p,r.entryZone,devices[0]);assert.equal(g.action(p,{type:'realmDevice',id:devices[0].id}).ok,false);
 for(const index of [1,2,3])assert.equal(touch(g,p,devices[index]).ok,true);
 const gate=points(g,p).find(m=>m.realmKind==='gate');assert.equal(touch(g,p,gate).ok,true);
 const trial=points(g,p).filter(m=>m.realmKind==='trial');
 assert.equal(touch(g,p,trial[0]).ok,false);
 for(const index of [2,0,1])assert.equal(touch(g,p,trial[index]).ok,true);
 assert.ok(p.realms.trials.includes('mirror'));
});

test('garden rites are personal and block sanctuary entry and boss damage until the player has solved their own sequence',()=>{
 const r=REALMS[0],{g,p}=setup(r.level);unlock(g,p,r);
 const other=g.addPlayer(newCharacter('other','OtherSeeker','guardian'));other.level=r.level;other.hp=1000;other.realms.unlocked.push(r.id);
 const z=ZONES[r.garden];at(g,other,r.garden,{x:z.spawn[0]*32+16,y:z.spawn[1]*32+16});
 assert.equal(g.teleport(p,r.sanctum,912,1136),false);
 const gate=points(g,p).find(m=>m.realmKind==='gate');assert.equal(touch(g,p,gate).ok,false);
 attest(g,p,r);assert.ok(!other.realms.trials.includes(r.id));
 const boss=g.worlds.get(r.sanctum).mobs.find(m=>m.type===r.boss);
 other.zone=r.sanctum;other.x=boss.x;other.y=boss.y;
 assert.equal(g.canDamage(other,boss),false);assert.equal(g.canDamage(p,boss),true);
});

test('first boss clears require personal eligibility and real contribution, advance hidden profession clues, and never repeat XP or cores',()=>{
 for(const r of REALMS){
  const {g,p}=setup(r.level);unlock(g,p,r);attest(g,p,r);
  const outsider=g.addPlayer(newCharacter('outsider','Unsworn','guardian'));outsider.level=r.level;outsider.hp=1000;outsider.zone=r.sanctum;
  const boss=g.worlds.get(r.sanctum).mobs.find(m=>m.type===r.boss);outsider.x=boss.x;outsider.y=boss.y;
  boss.contributors.set(outsider.id,g.now);boss.damageLog.set(outsider.id,boss.maxHp);
  const xp=p.xp,gold=p.gold,signs=r.jobs.map(id=>p.journey.signs[id]||0);defeat(g,p,r);
  assert.ok(p.realms.cleared.includes(r.id));assert.ok(!outsider.realms.cleared.includes(r.id));
  assert.equal(p.xp,xp+Math.round(xpRequired(r.level)*.2));assert.equal(p.gold,gold+r.level*40);
  assert.equal(p.inventory[`realm_${r.id}_core`],1);
  r.jobs.forEach((id,i)=>assert.equal(p.journey.signs[id],signs[i]+1));
  assert.ok(r.jobs.every(id=>!p.discovery.jobs.includes(id)),'a trace must not bypass the full profession story');
  const after=serialize(p);defeat(g,p,r);
  for(const key of ['xp','gold','inventory','journey'])assert.deepEqual(serialize(p)[key],after[key]);
 }
});

test('a negligible tag or a remote/dead participant cannot claim a realm first clear',()=>{
 const r=REALMS[0],{g,p}=setup(r.level);unlock(g,p,r);attest(g,p,r);
 const boss=g.worlds.get(r.sanctum).mobs.find(m=>m.type===r.boss);at(g,p,r.sanctum,boss);
 for(const mode of ['tag','remote','dead']){
  boss.alive=true;boss.hp=boss.maxHp;p.x=boss.x;p.y=boss.y;p.hp=1000;
  boss.contributors.set(p.id,g.now);boss.damageLog.set(p.id,mode==='tag'?1:boss.maxHp);
  if(mode==='remote')p.x+=1000;if(mode==='dead')p.hp=0;
  g.killMob(r.sanctum,boss);assert.ok(!p.realms.cleared.includes(r.id));assert.equal(p.inventory.realm_heaven_core,undefined);
 }
});

test('each theme grants the current class family a single weapon and tuning preserves enhancements while consuming real costs',()=>{
 for(const r of REALMS)for(const cls of ['guardian','ranger','mage']){
  const {g,p}=setup(r.level,cls);unlock(g,p,r);attest(g,p,r);defeat(g,p,r);
  assert.equal(g.action(p,{type:'realmClaim',id:r.id}).ok,false,'must stand at altar');
  const altar=points(g,p).find(m=>m.realmKind==='altar');at(g,p,r.sanctum,altar);
  assert.equal(g.action(p,{type:'realmClaim',id:r.id}).ok,true);
  const part=realmPart(cls),old=realmWeapon(r.id,part),next=realmWeapon(r.id,part,true);
  assert.equal(p.inventory[old],1);assert.equal(ITEMS[old].class,cls);assert.equal(p.inventory[`realm_${r.id}_core`],0);
  assert.equal(g.action(p,{type:'realmClaim',id:r.id}).ok,false);
  p.equipment.weapon=old;p.enhancements[old]=7;p.enhancePity[old]=2;
  const xp=p.xp,gold=p.gold,material=p.inventory[r.material];
  assert.equal(g.action(p,{type:'realmTune',id:r.id,stable:true}).ok,true);
  assert.equal(p.gold,gold-r.level*5);assert.equal(p.inventory[r.material],material-3);assert.equal(p.xp,xp);
  assert.equal(p.inventory[old],0);assert.equal(p.inventory[next],1);assert.equal(p.equipment.weapon,next);
  assert.equal(p.enhancements[next],7);assert.equal(p.enhancePity[next],2);assert.equal(p.enhancements[old],undefined);
  assert.equal(g.action(p,{type:'realmTune',id:r.id,stable:true}).ok,false);
  assert.equal(g.action(p,{type:'realmTune',id:r.id,stable:false}).ok,true);assert.equal(p.enhancements[old],7);
  assert.equal(p.inventory[r.material],material-6);assert.equal(g.action(p,{type:'realmTune',id:r.id,stable:true}).ok,false);
 }
});

test('holy, cursed and mirror weapon costs affect actual stats and remain below the next regional weapon tier',()=>{
 for(const r of REALMS){
  const {p}=setup(r.level),normal=realmWeapon(r.id,'sword'),stable=realmWeapon(r.id,'sword',true);
  p.equipment.weapon=stable;const safe=getStats(p);p.equipment.weapon=normal;const risky=getStats(p);
  if(r.id==='heaven'){assert.equal(risky.maxHp-safe.maxHp,180);assert.equal(risky.maxMp-safe.maxMp,-60);}
  if(r.id==='inferno'){assert.equal(risky.maxHp-safe.maxHp,-360);assert.ok(risky.atk>safe.atk);}
  if(r.id==='mirror'){assert.equal(risky.def-safe.def,-22);assert.equal(risky.crit-safe.crit,6);}
  assert.ok(risky.maxHp>0&&risky.maxMp>0&&risky.def>0);
  const next={heaven:'end_wildroot_sword',inferno:'end_voidfront_sword',mirror:'end_dawnend_sword'}[r.id];
  assert.ok(ITEMS[normal].atk<ITEMS[next].atk);
 }
});

test('opened worlds allow safe town re-entry while combat, unlearned worlds, remote claims and forged device IDs remain blocked',()=>{
 const r=REALMS[1],{g,p}=setup(r.level);unlock(g,p,r);
 assert.equal(g.action(p,{type:'realmEnter',id:r.id}).ok,false,'remote re-entry from a garden must fail');
 assert.equal(g.action(p,{type:'realmExit'}).ok,true);assert.equal(p.zone,r.entryZone);
 at(g,p,'town',{x:784,y:688});g.now+=21000;p.lastCombat=g.now;
 assert.equal(g.action(p,{type:'realmEnter',id:r.id}).ok,false);g.now+=9000;
 assert.equal(g.action(p,{type:'realmEnter',id:r.id}).ok,true);
 for(const action of [{type:'realmClaim',id:r.id},{type:'realmTune',id:r.id,stable:true},{type:'realmDevice',id:'realm_mirror_entry_puzzle_1'},{type:'realmEnter',id:'__proto__'}])assert.equal(g.action(p,action).ok,false);
});

test('old saves gain empty realm records; real unlocked progress, weapon state and allowed realm positions survive reload',()=>{
 const {g,p}=setup(),r=REALMS[2],old=serialize(p);delete old.realms;
 const migrated=hydrate(old);assert.deepEqual(migrated.realms.unlocked,[]);assert.deepEqual(migrated.inventory,old.inventory);
 unlock(g,p,r);attest(g,p,r);defeat(g,p,r);
 const altar=points(g,p).find(m=>m.realmKind==='altar');at(g,p,r.sanctum,altar);g.action(p,{type:'realmClaim',id:r.id});
 const saved=serialize(p),loaded=hydrate(saved);assert.equal(loaded.zone,r.sanctum);assert.deepEqual(loaded.realms,saved.realms);assert.deepEqual(loaded.journey,saved.journey);
 const bad={...saved,realms:{...saved.realms,unlocked:[]}};assert.equal(hydrate(bad).zone,'town');
 const unready={...saved,realms:{...saved.realms,trials:[]}};assert.equal(hydrate(unready).zone,r.garden);
 const unknown={...saved,realms:{known:['__proto__','mirror'],unlocked:['missing'],weapons:{mirror:{part:'fake'}}}};
 prepareRealms(unknown);assert.deepEqual(unknown.realms.known,['mirror']);assert.deepEqual(unknown.realms.weapons,{});
});

test('realm journal and HUD expose actual nearby actions, signed costs and controls while mandatory pixel cues work with effects disabled',()=>{
 const {g,p}=setup(110),r=REALMS[1];unlock(g,p,r);attest(g,p,r);defeat(g,p,r);
 const altar=points(g,p).find(m=>m.realmKind==='altar');at(g,p,r.sanctum,altar);
 const state=g.snapshot(p,true),profile=g.privatePlayer(p),panel=realmsPanel({profile,state,data:{id:r.id}});
 assert.ok(panel.html.includes('data-act="realmClaim"'));assert.ok(panel.html.includes('최대 체력 -360'));assert.ok(!panel.html.includes('+-360'));
 assert.ok(realmHUD(state.realm,g.now,{keyLabel:()=> 'G'}).includes(' · G'));
 const calls=[],ctx=new Proxy({},{get:(_,key)=>key==='save'||key==='restore'||key==='fillRect'? (...args)=>calls.push([key,...args]):undefined,set:()=>true});
 const renderer={ctx,showEffects:false,label:(...args)=>calls.push(['label',...args])};
 drawRealmOverlay(renderer,state.realm,g.now,'ground');drawRealmOverlay(renderer,state.realm,g.now,'foreground');
 assert.ok(calls.some(([key])=>key==='fillRect'));assert.ok(calls.some(([key])=>key==='label'));
});
