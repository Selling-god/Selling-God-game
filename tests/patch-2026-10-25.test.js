import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Game,newCharacter,hydrate,serialize} from '../server/game.js';
import {CharacterStore} from '../server/store.js';
import {CLASSES,ZONES,NPCS,ITEMS,RECIPES,QUESTS,getStats} from '../shared/content.js';
import {createMap,isBlocked,dist} from '../shared/world.js';
import {SETTLEMENT_IDS} from '../shared/village-layout.js';
import {STORY_POINTS,canBeginStory} from '../server/stories.js';
import {STORIES} from '../server/story-data.js';
import {VOCATION_SITES} from '../shared/vocation-sites.js';
import {HIDDEN_TITLES} from '../shared/title-catalog.js';
import {onSupport,beforeStrike,survive,mechanicInfo} from '../server/class-combat.js';

const create=(cls='novice')=>{
 const sent=[],g=new Game({random:()=>.5,send:(id,event,data)=>sent.push({id,event,data})});
 g.now=Date.parse('2026-10-25T10:00:00Z');
 const p=g.addPlayer(newCharacter('regression','QuestTester',cls));
 p.level=43;p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;p.gold=999999;
 return {g,p,sent};
};
const mainRegions=()=>Object.values(ZONES).filter(z=>!z.expedition&&!z.dungeon&&!z.challenge&&!z.secretRealm);

test('distant fast-travel hubs offer service while intervening adventure regions have no town',()=>{
 assert.ok(mainRegions().length>=20);
 assert.equal(SETTLEMENT_IDS.length,6);
 for(const [id,z]of Object.entries(ZONES)){
  if(z.expedition||z.dungeon||z.challenge||z.secretRealm)continue;
  const m=createMap(id),hub=SETTLEMENT_IDS.includes(id);
  assert.equal(!!m.villageStone,hub,`${z.name}: unexpected settlement`);
  if(!hub){assert.ok(!m.npcs.some(n=>n.id.startsWith(id+'_village')));continue;}
  assert.ok(!isBlocked(m,m.villageStone.x,m.villageStone.y,9),z.name+' stone collision');
  assert.ok(m.storyPoints.some(s=>s.id===m.villageStone.id),z.name);
  if(id==='town')continue;
  for(const kind of ['shop','craft','heal','jobs']){
   const npc=m.npcs.find(n=>n.kind===kind);
   assert.ok(npc,`${z.name}: ${kind} NPC missing`);
   assert.ok(!isBlocked(m,npc.x,npc.y,9),`${z.name}: ${kind} NPC obstructed`);
  }
 }
});

test('first village is bigger and nine common trainers are walkable and share server interaction radius',()=>{
 assert.ok(ZONES.town.width>=60&&ZONES.town.height>=54);
 const map=createMap('town'),mentors=VOCATION_SITES.filter(s=>s.zone==='town');
 assert.equal(mentors.length,9);
 for(const mentor of mentors)assert.ok(!isBlocked(map,mentor.x,mentor.y,10),mentor.id);
 const {g,p,sent}=create();
 const m=mentors.at(-1);p.zone='town';p.x=m.x+110;p.y=m.y;
 assert.equal(g.action(p,{type:'interact',id:m.id}).ok,true);
 assert.ok(sent.some(s=>s.event==='storyView'&&s.data.id===m.job));
});

test('story records alone never unlock a job; actual mentor accepts multi-stage quest only after lore',()=>{
 const {g,p}=create(),s=STORIES.guardian,m=STORY_POINTS.get(s.site);
 p.zone=m.zone;p.x=m.x;p.y=m.y;
 assert.equal(canBeginStory(p,s.id),false);
 assert.equal(g.action(p,{type:'storyAccept',id:s.id}).ok,false);
 for(const lore of s.lore)p.atlas.pages.push(lore);
 assert.equal(canBeginStory(p,s.id),true);
 assert.equal(g.action(p,{type:'storyAccept',id:s.id}).ok,true);
 assert.ok(p.journey.quests[s.id]);
 assert.equal(p.discovery.jobs.includes(s.id),false);
 assert.ok(s.steps.length>=4);
 assert.equal(g.action(p,{type:'changeJob',id:s.id}).ok,false);
});

test('attuned village stones move players between main areas and reject unknown destinations',()=>{
 const {g,p,sent}=create();
 const forest=g.worlds.get('frost').map.villageStone;
 assert.equal(g.teleport(p,'frost',forest.x,forest.y+20),true);
 assert.equal(g.action(p,{type:'interact',id:forest.id}).ok,true);
 assert.ok(p.atlas.townStones.includes('frost'));
 assert.ok(sent.some(x=>x.event==='warpstoneView'&&x.data.destinations.some(v=>v.id==='frost')));
 assert.equal(g.action(p,{type:'villageWarp',id:'forest'}).ok,false);
 const back=g.action(p,{type:'villageWarp',id:'town'});
 assert.equal(back.ok,true,JSON.stringify(back));assert.equal(p.zone,'town');
 assert.equal(g.action(p,{type:'villageWarp',id:'frost'}).ok,false,'reuse cooldown');
});

test('all 38 specialized classes have different authoritative mechanic labels and new hidden careers',()=>{
 assert.equal(Object.keys(CLASSES).length,39);
 const all=Object.keys(CLASSES).filter(k=>k!=='novice');
 assert.equal(new Set(all.map(id=>CLASSES[id].mechanic)).size,38);
 for(const id of all)assert.ok(CLASSES[id].mechanicDesc?.length>4,`${id}: no mechanic description`);
 for(const id of ['dawn_architect','abyss_shepherd']){
  assert.equal(CLASSES[id].tier,'hidden');assert.ok(STORIES[id]);assert.ok(VOCATION_SITES.some(v=>v.job===id));
 }
 assert.equal(HIDDEN_TITLES.length,12);
});

test('class-specific combat genuinely differs: berserker low HP, sniper aiming, engineer turret, phoenix survival',()=>{
 const target={hp:100,maxHp:100},o=create('berserker'),p=o.p,g=o.g;
 p.hp=getStats(p).maxHp;
 const healthy=beforeStrike(g,p,'basic',target).scale;
 p.hp=1;
 const hurt=beforeStrike(g,p,'basic',target).scale;
 assert.ok(hurt>healthy+.5);
 p.classId='sniper';p.signature={stacks:0};onSupport(g,p);
 const sniper=beforeStrike(g,p,'skill1',target);
 assert.ok(sniper.crit>=45&&sniper.scale>=1.8);
 p.classId='engineer';p.signature={stacks:0};onSupport(g,p);
 assert.ok(beforeStrike(g,p,'basic',target).chain>=1);
 p.classId='phoenix_heir';p.signature={stacks:0};onSupport(g,p);
 p.hp=1;
 assert.equal(survive(g,p),true);assert.ok(p.hp>1);
 assert.equal(survive(g,p),false,'rebirth cannot trigger twice');
 assert.ok(mechanicInfo(p)?.name);
});

test('rare forge collection has 24 craft-only mythic/ancient level-gated weapons',()=>{
 const forged=Object.entries(ITEMS).filter(([id])=>id.startsWith('master_'));
 assert.equal(forged.length,24);
 const ids=new Set(forged.map(([id])=>id));
 for(const [id,item]of forged){
  assert.ok(['mythic','ancient'].includes(item.rarity));
  assert.ok(item.level>=20&&item.atk>50);
  const recipe=RECIPES.find(r=>r.id===id);
  assert.ok(recipe,`missing recipe for ${id}`);
  assert.ok(recipe.cost.world_token>=3&&recipe.cost.wayfarer_seal>=3);
  assert.ok(recipe.cost.ore>=14);
 }
 const quests=QUESTS.find(q=>q.id==='last_star');
 assert.equal(quests.weaponTier,'star');assert.equal(quests.items.dawn_charm,undefined);
});

test('43-level character with accumulated atlas, quests, exploration saves and restores without reverting',async()=>{
 const {p}=create('guardian');p.level=43;p.x=920;p.y=940;p.zone='meadow';p.revision=2078;
 p.atlas.fog.meadow_reach_0=Array.from({length:130},(_,i)=>i);
 p.atlas.pages=[...new Set([...p.atlas.pages,...Object.keys(ZONES).filter(k=>k.includes('_reach_')).slice(0,5).map(k=>k+'_tablet')])];
 p.journey.signs.ranger=2;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'starfall-level43-'));
 try{
  const store=new CharacterStore({local:true,dir});
  const first=serialize(p);
  await store.save(first);
  p.level=44;p.revision=2081;p.x=1020;p.gold+=321;
  const latest=serialize(p);
  await store.save(latest);
  // A delayed stale save must never overwrite a newer revision.
  await store.save(first);
  const raw=await new CharacterStore({local:true,dir}).load(p.id);
  assert.equal(raw.level,44);assert.equal(raw.revision,2081);
  const restored=hydrate(raw);
  assert.equal(restored.level,44);assert.equal(restored.gold,p.gold);
  assert.equal(restored.atlas.fog.meadow_reach_0.length,130);
  assert.equal(restored.journey.signs.ranger,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
