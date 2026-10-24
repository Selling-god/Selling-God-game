import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,newCharacter,hydrate,serialize} from '../server/game.js';
import {ZONES,MONSTERS,ITEMS,RECIPES,NPCS,getStats,weaponFor} from '../shared/content.js';
import {ENDGAME_REGIONS} from '../shared/expansion.js';
import {PROVINCES,EXPEDITION_ZONES,LANDMARKS,atlasTotals,expeditionRewards} from '../shared/expeditions.js';
import {PORTALS,createMap,isBlocked,dist} from '../shared/world.js';
import {recordAtlas,privateAtlas} from '../server/atlas.js';
import {STORY_POINTS} from '../server/stories.js';
import {xpRequired} from '../shared/rpg.js';
import {adventurePanel} from '../client/adventure-ui.js';

const late=EXPEDITION_ZONES.filter(z=>z.endgame),early=EXPEDITION_ZONES.filter(z=>!z.endgame);
const oldHubs=['town','forest','ruins','citadel','meadow','coast','desert','swamp','frost','sky','abyss','observatory',...ENDGAME_REGIONS.map(z=>z.id)];
const setup=(level=35)=>{
 const g=new Game({random:()=>.5});g.now=Date.parse('2026-10-24T03:00:00Z');
 const p=g.addPlayer(newCharacter('region-test','RegionExplorer','guardian'));
 p.level=level;p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;return {g,p};
};
const at=(g,p,zone,point)=>{g.now+=1500;g.teleport(p,zone,point.x,point.y);p.lastCombat=0;};
const visitPoint=(g,p,point)=>{at(g,p,point.zone,point);assert.equal(g.interact(p,point.id).ok,true,point.id);};
function reachable(level){
 const found=new Set(['town']),queue=['town'];
 for(let i=0;i<queue.length;i++)for(const door of PORTALS[queue[i]]||[]){
  if(door.level>level||found.has(door.to))continue;
  found.add(door.to);queue.push(door.to);
 }
 return found;
}

test('sixteen named provinces register 164 public regions while keeping all original 92 identities and gates',()=>{
 const totals=atlasTotals(ZONES);
 assert.deepEqual([totals.regions,totals.provinces,totals.expeditions,totals.landmarks,totals.pages],[164,16,144,576,288]);
 assert.equal(late.length,72);assert.equal(early.length,72);
 const expectedLow={meadow:2,coast:6,desert:9,swamp:10,frost:13,sky:16,abyss:21,observatory:25};
 for(const id of oldHubs)assert.ok(ZONES[id]&&!ZONES[id].expedition,id);
 for(const [id,level]of Object.entries(expectedLow))for(let i=0;i<9;i++){
  const z=ZONES[`${id}_reach_${i}`];assert.ok(z);
  assert.equal(z.minLevel,level+(i===8?3:i>=5?2:i>=2?1:0));
  assert.deepEqual(z.mobTypes,ZONES[id].mobTypes);assert.equal(z.boss,ZONES[id].boss);
 }
 assert.equal(new Set(late.map(z=>z.name)).size,72);
 for(const region of ENDGAME_REGIONS){
  const zones=late.filter(z=>z.province===region.id);
  assert.equal(zones.length,9);assert.equal(zones[0].minLevel,region.level);assert.equal(zones.at(-1).minLevel,region.maxLevel);
  assert.ok(zones.every((z,i)=>z.minLevel<=z.maxLevel&&z.maxLevel<=region.maxLevel&&(!i||z.minLevel>zones[i-1].minLevel)));
  assert.ok(LANDMARKS.filter(x=>zones.some(z=>z.id===x.zone)).every(x=>x.name&&x.text.length>20));
 }
 assert.equal(ZONES.dawnend_reach_8.minLevel,200);
});

test('each new sector has local-level enemies, real existing sprite frames, regional drops and craftable gear',()=>{
 const sprites=JSON.parse(readFileSync(new URL('../public/assets/atlas.json',import.meta.url),'utf8'));
 const ids=new Set();
 for(const z of late){
  const registered=ZONES[z.id];assert.equal(registered.mobTypes.length,3);
  for(const id of [...registered.mobTypes,registered.boss]){
   assert.ok(!ids.has(id));ids.add(id);const m=MONSTERS[id];
   assert.ok(m.level>=z.minLevel&&m.level<=z.maxLevel);
   assert.equal(m.material,z.material);assert.equal(m.gearTier,z.gearTier);assert.ok(ITEMS[m.material]);
   assert.ok(m.hp>0&&m.atk>0&&m.xp>0&&m.gold[0]>0);
   const prefix=['skeleton','ash_knight'].includes(m.skin)?'s_':'';
   for(let frame=0;frame<4;frame++)assert.ok(sprites[`${m.sprite}_${prefix}${frame}`],id);
   if(!m.boss)assert.ok(Math.abs(xpRequired(m.level)/m.xp-36)<.1);
  }
  assert.equal(MONSTERS[registered.mobTypes[0]].level,z.minLevel);
  assert.equal(MONSTERS[registered.boss].gearCharm,z.gearTier+'_charm');
  for(const family of ['guardian','ranger','mage'])assert.ok(ITEMS[weaponFor(z.gearTier,family)].level<=z.minLevel);
  for(const recipe of RECIPES.filter(r=>r.id.startsWith(z.gearTier)))for(const material of Object.keys(recipe.cost)){
   assert.ok(material==='ore'||material===z.material,'recipes must use local supplies');
  }
 }
 assert.equal(ids.size,288);
});

test('the complete portal graph reaches all 164 public maps and enforces every new gate without stranding return routes',()=>{
 assert.equal(reachable(200).size,164);
 for(const z of late){
  assert.ok(!reachable(z.minLevel-1).has(z.id),z.id+' below-level entry');
  assert.ok(reachable(z.minLevel).has(z.id),z.id+' unlock path');
  const doors=PORTALS[z.id];assert.ok(doors.length>=2);
  assert.equal(new Set(doors.map(p=>`${p.x},${p.y}`)).size,doors.length,z.id+' overlapping doors');
  for(const door of doors){
   assert.equal(door.level,ZONES[door.to].minLevel);
   assert.ok(PORTALS[door.to].some(back=>back.to===z.id&&back.x===door.tx&&back.y===door.ty));
   assert.equal(isBlocked(createMap(door.to),door.tx,door.ty,14),false,z.id+' arrival');
  }
 }
});

test('new sector worlds spawn huntable local monsters with reachable camp supplies and collision-free arrivals',()=>{
 const {g}=setup();
 for(const region of ENDGAME_REGIONS)for(const sector of [0,8]){
  const z=ZONES[`${region.id}_reach_${sector}`],w=g.worlds.get(z.id),map=w.map;
  assert.equal(w.mobs.length,57);assert.equal(w.mobs.filter(m=>MONSTERS[m.type].boss).length,1);
  assert.ok(w.mobs.every(m=>MONSTERS[m.type].level>=z.minLevel&&MONSTERS[m.type].level<=z.maxLevel));
  assert.ok(w.mobs.every(m=>!isBlocked(map,m.x,m.y,14)));
  assert.equal(map.resources.length,42);assert.equal(map.chests.length,6);
  assert.ok(['herb','wood','ore'].every(type=>map.resources.filter(r=>r.type===type).length>=5));
  assert.equal(map.storyPoints.filter(point=>['camp','tablet','watch','trial'].includes(point.kind)).length,4);
  assert.equal(isBlocked(map,z.spawn[0]*32+16,z.spawn[1]*32+16,14),false);
  assert.ok(w.mobs.every(m=>dist(m,map.camp)>180),'camp must not spawn inside a monster group');
 }
});

test('real portal interaction rejects under-level entry and allows the first and last sector at their published level',()=>{
 const {g,p}=setup();
 for(const region of ENDGAME_REGIONS)for(const sector of [0,8]){
  const target=ZONES[`${region.id}_reach_${sector}`];
  const from=sector?`${region.id}_reach_7`:region.id;
  const door=PORTALS[from].find(d=>d.to===target.id);assert.ok(door);
  p.level=target.minLevel-1;at(g,p,from,door);
  assert.equal(g.interact(p,door.id).ok,false);assert.equal(p.zone,from);
  p.level=target.minLevel;g.now+=1500;
  assert.equal(g.interact(p,door.id).ok,true);assert.equal(p.zone,target.id);
  const back=PORTALS[p.zone].find(d=>d.to===from);at(g,p,p.zone,back);
  assert.equal(g.interact(p,back.id).ok,true);assert.equal(p.zone,from);
 }
});

test('new camps and pages pay only on discovery, and attuned waypoints still enforce gates and safe departure',()=>{
 const {g,p}=setup(70),camp=STORY_POINTS.get('wildroot_reach_0_camp'),page=STORY_POINTS.get('wildroot_reach_0_tablet');
 assert.equal(g.action(p,{type:'waypoint',id:camp.zone}).ok,false);
 visitPoint(g,p,camp);visitPoint(g,p,page);
 assert.equal(p.xp,expeditionRewards(ZONES[camp.zone],'camp').xp+expeditionRewards(ZONES[camp.zone],'page').xp);
 const xp=p.xp,seals=p.inventory.wayfarer_seal;
 visitPoint(g,p,camp);visitPoint(g,p,page);assert.equal(p.xp,xp);assert.equal(p.inventory.wayfarer_seal,seals);
 at(g,p,'town',{x:784,y:688});p.level=69;assert.equal(g.action(p,{type:'waypoint',id:camp.zone}).ok,false);
 p.level=70;assert.equal(g.action(p,{type:'waypoint',id:camp.zone}).ok,true);assert.equal(p.zone,camp.zone);
 g.now+=22000;p.x+=400;assert.equal(g.action(p,{type:'waypoint',id:'town'}).ok,false);
 at(g,p,camp.zone,camp);assert.equal(g.action(p,{type:'waypoint',id:'town'}).ok,true);
});

test('high-region daily contracts use actual local kills and gathering, award local materials once, and support local crafting',()=>{
 const {g,p}=setup(135),zone='voidfront_reach_0',z=ZONES[zone],camp=STORY_POINTS.get(zone+'_camp');
 visitPoint(g,p,camp);assert.equal(g.action(p,{type:'contractAccept'}).ok,true);
 const c=p.atlas.contracts[zone],w=g.worlds.get(zone);
 recordAtlas(g,p,'kill',ZONES.voidfront.mobTypes[0]);assert.equal(c.kills,0);
 at(g,p,'voidfront_reach_1',STORY_POINTS.get('voidfront_reach_1_camp'));
 recordAtlas(g,p,'kill',c.monster);assert.equal(c.kills,0);
 for(const m of w.mobs.filter(m=>m.type===c.monster).slice(0,c.killGoal)){
  at(g,p,zone,m);m.contributors.set(p.id,g.now);m.damageLog.set(p.id,m.hp);g.killMob(zone,m);
 }
 assert.equal(c.kills,12);
 for(const node of w.nodes.filter(n=>n.type===c.resource).slice(0,c.gatherGoal)){
  at(g,p,zone,node);assert.equal(g.interact(p,node.id).ok,true);
 }
 assert.equal(c.gathered,5);at(g,p,zone,camp);
 const reward=expeditionRewards(z,'contract'),gold=p.gold,xp=p.xp,materials=p.inventory[z.material];
 assert.equal(g.action(p,{type:'contractClaim'}).ok,true);
 assert.equal(p.gold,gold+reward.gold);assert.equal(p.xp,xp+reward.xp);assert.equal(p.inventory[z.material],materials+2);
 const after=structuredClone(p.inventory);assert.equal(g.action(p,{type:'contractClaim'}).ok,false);assert.deepEqual(p.inventory,after);
 // Fill remaining local supplies through the actual gather/kill paths, then craft.
 const recipe=RECIPES.find(r=>r.id===z.gearTier+'_armor');
 for(const node of w.nodes.filter(n=>n.type==='ore').slice(0,recipe.cost.ore)){
  at(g,p,zone,node);assert.equal(g.interact(p,node.id).ok,true);
 }
 const smith=NPCS.find(n=>n.kind==='craft');at(g,p,smith.zone,smith);
 assert.equal(g.action(p,{type:'craft',id:recipe.id}).ok,true);assert.equal(p.inventory[recipe.output],1);
});

test('new field trials run all three local-level waves and never repeat the daily XP or material reward',()=>{
 const {g,p}=setup(50),point=STORY_POINTS.get('deepsea_reach_0_trial'),z=ZONES[point.zone];
 for(let repeat=0;repeat<2;repeat++){
  at(g,p,point.zone,point);g.now+=11000;assert.equal(g.action(p,{type:'trialStart'}).ok,true);
  const w=g.worlds.get(p.zone);
  for(const expected of [6,8,1]){
   const mobs=w.mobs.filter(m=>m.trialKey&&m.alive);assert.equal(mobs.length,expected);
   for(const m of mobs){
    assert.ok(MONSTERS[m.type].level>=z.minLevel&&MONSTERS[m.type].level<=z.maxLevel);
    m.contributors.set(p.id,g.now);m.damageLog.set(p.id,100);g.killMob(w.id,m);
   }
   g.tickFieldTrial(w);g.now+=2300;g.tickFieldTrial(w);
  }
  assert.equal(w.fieldTrial,null);assert.equal(p.inventory[z.material],4);assert.equal(p.inventory.wayfarer_seal,3);
  assert.equal(p.xp,expeditionRewards(z,'trial').xp);
 }
});

test('each named high-level province has independent survey completion and a once-only scaled reward',()=>{
 const {g,p}=setup(180),r=PROVINCES.find(r=>r.id==='astralforge');
 const zones=late.filter(z=>z.province===r.id),pages=LANDMARKS.filter(x=>x.zone.startsWith(r.id+'_reach_')&&['tablet','watch'].includes(x.kind));
 p.atlas.waypoints=zones.map(z=>z.id);p.atlas.pages=pages.slice(1).map(x=>x.id);
 assert.equal(g.action(p,{type:'surveyClaim',id:r.id}).ok,false);
 p.atlas.pages.push(pages[0].id);const reward=expeditionRewards(r,'survey'),gold=p.gold;
 assert.equal(g.action(p,{type:'surveyClaim',id:r.id}).ok,true);
 assert.equal(p.gold,gold+reward.gold);assert.equal(p.xp,reward.xp);assert.equal(p.inventory[r.material],8);
 assert.ok(p.titles.includes(r.name+'의 길잡이'));
 assert.equal(privateAtlas(p).provinces[r.id].claimed,true);
 assert.equal(g.action(p,{type:'surveyClaim',id:r.id}).ok,false);
 assert.equal(g.action(p,{type:'surveyClaim',id:'dawnend'}).ok,false);
});

test('old 92-region saves retain level, equipment, professions, discoveries, all original camps, pages and survey claims',()=>{
 const {p}=setup(188);p.zone='dawnend';[p.x,p.y]=ZONES.dawnend.spawn.map(n=>n*32+16);p.xp=12345;
 p.inventory.end_dawnend_sword=1;p.equipment.weapon='end_dawnend_sword';p.discovery.jobs.push('mage');
 p.discovery.visited=[...oldHubs,...early.map(z=>z.id)];
 p.atlas.waypoints=early.map(z=>z.id);p.atlas.pages=LANDMARKS.filter(x=>early.some(z=>z.id===x.zone)&&['tablet','watch'].includes(x.kind)).map(x=>x.id);
 p.atlas.surveyClaims=PROVINCES.filter(r=>!r.endgame).map(r=>r.id);p.atlas.fog={meadow_reach_0:[0,1,2]};
 p.atlas.contracts.meadow_reach_0={day:'2026-10-24',monster:'hare',resource:'herb',kills:3,killGoal:12,gathered:1,gatherGoal:5,claimed:false};
 const saved=serialize(p),restored=hydrate(saved);
 for(const key of ['level','xp','zone','inventory','equipment','atlas','journey','challenges'])assert.deepEqual(restored[key],saved[key],key);
 const {visited:oldVisits,issuedWeapons:oldWeapons,...oldProgress}=saved.discovery;
 const {visited:newVisits,issuedWeapons:newWeapons,...newProgress}=restored.discovery;
 assert.deepEqual(new Set(newVisits),new Set(oldVisits));assert.deepEqual(newProgress,oldProgress);
 assert.ok(oldWeapons.every(id=>newWeapons.includes(id))&&newWeapons.includes(saved.equipment.weapon));
 assert.equal(restored.discovery.visited.length,92);assert.equal(restored.atlas.waypoints.length,72);assert.equal(restored.atlas.pages.length,144);
});

test('new-sector camp, contract, fog, survey state and current location also survive a real save reload',()=>{
 const {g,p}=setup(160),camp=STORY_POINTS.get('astralforge_reach_0_camp');visitPoint(g,p,camp);
 assert.equal(g.action(p,{type:'contractAccept'}).ok,true);recordAtlas(g,p,'kill',p.atlas.contracts[p.zone].monster);
 visitPoint(g,p,STORY_POINTS.get('astralforge_reach_0_tablet'));
 p.atlas.surveyClaims.push('sunscar');p.atlas.reputation.sunscar=7;
 const saved=serialize(p),restored=hydrate(saved);
 assert.equal(restored.zone,camp.zone);assert.deepEqual(restored.atlas,saved.atlas);
 assert.ok(restored.atlas.fog[camp.zone].length>0);assert.equal(privateAtlas(restored).provinces.astralforge.camps,1);
 assert.equal(privateAtlas(restored).provinces.astralforge.pages,1);
});

test('the map presents all hubs in level order and all sixteen named region tabs with real sector names and a party-dungeon entrance',()=>{
 const {g,p}=setup(),profile=g.privatePlayer(p);
 const result=adventurePanel('map',{profile,tab:'core'}),html=result.html;
 assert.match(result.eyebrow,/164 REGIONS/);assert.ok(!html.includes('data-id="endgame"'));
 assert.ok(html.includes('data-act="openChallenges"')&&html.includes('data-act="openDungeons"'));
 const hubs=[...html.matchAll(/data-zone="([^"]+)"/g)].map(x=>ZONES[x[1]]);
 assert.equal(hubs.length,20);assert.equal(hubs[0].id,'town');
 assert.ok(hubs.every((z,i)=>!i||z.minLevel>=hubs[i-1].minLevel));
 for(const r of PROVINCES){
  assert.ok(html.includes(`data-id="${r.id}"`));assert.ok(html.includes(r.name));
  const selected=adventurePanel('map',{profile,tab:r.id}).html;
  assert.equal([...selected.matchAll(/data-zone="/g)].length,9);
  for(const z of EXPEDITION_ZONES.filter(z=>z.province===r.id))assert.ok(selected.includes(z.name));
  assert.ok(selected.includes(expeditionRewards(r,'survey').xp.toLocaleString('ko-KR')+' EXP'));
 }
 const privateIds=Object.values(ZONES).filter(z=>z.challenge||z.dungeon).map(z=>z.id);
 profile.discovery.visited.push(...privateIds);
 assert.match(adventurePanel('map',{profile,tab:'core'}).eyebrow,/1 DISCOVERED/);
 for(const id of privateIds)assert.ok(!html.includes(`data-zone="${id}"`));
});
