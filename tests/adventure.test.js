import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter,hydrate,serialize} from '../server/game.js';
import {CLASSES,ITEMS,ZONES,MONSTERS,RECIPES,getStats} from '../shared/content.js';
import {STORIES,SECRET_PATHS} from '../server/story-data.js';
import {STORY_POINTS,recordStory,chapterReady,storyBook,storyDetail,readSecret} from '../server/stories.js';
import {atlasDay,revealTerrain,recordAtlas} from '../server/atlas.js';
import {PROVINCES,EXPEDITION_ZONES,LANDMARKS,atlasTotals} from '../shared/expeditions.js';
import {VOCATION_SITES} from '../shared/vocation-sites.js';
import {createMap,findPath,dist,isBlocked,mapCacheInfo,PORTALS,BOSS_SPAWNS} from '../shared/world.js';
import {nearbyScenery} from '../shared/spatial.js';
import {evaluateJobs,readRelic} from '../server/progression.js';
import {RELICS} from '../shared/expansion.js';

const setup=(cls='novice')=>{
 const messages=[],g=new Game({random:()=>.5,send:(id,event,data)=>messages.push({id,event,data})});
 g.now=Date.parse('2026-10-23T03:11:00Z');
 const p=g.addPlayer(newCharacter('test-user','VocationHero',cls));p.level=30;p.gold=10000;
 p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
 return {g,p,messages};
};
function at(g,p,point){g.now+=1000;p.zone=point.zone;p.x=point.x;p.y=point.y;p.lastCombat=0;}
function begin(g,p,id){
 const s=STORIES[id];p.discovery.jobs=[...new Set([...p.discovery.jobs,...s.parents])];
 p.journey.signs[id]=s.secret.length;
 at(g,p,STORY_POINTS.get(s.site));
 return g.action(p,{type:'storyAccept',id});
}
function readyStage(g,p,id){
 const s=STORIES[id],q=p.journey.quests[id];
 for(const o of s.steps[q.chapter].objectives){
  if(o.kind==='deliver')p.inventory[o.target]=o.count;
  else for(let i=0;i<o.count;i++)recordStory(g,p,{kind:o.kind,target:o.target,skill:o.basic?'basic':'skill1',count:1});
 }
}
test('36 authored storylines have 240 chapters with unique chapter titles per path and six 1000-action trials',()=>{
 assert.equal(Object.keys(STORIES).length,36);
 assert.equal(Object.values(STORIES).reduce((n,s)=>n+s.steps.length,0),240);
 for(const s of Object.values(STORIES)){
  assert.equal(s.steps.length,{common:4,rare:6,epic:8,hidden:10}[s.tier]);
  assert.equal(new Set(s.steps.map(x=>x.title)).size,s.steps.length,s.id);
  assert.ok(s.intro.length>20&&s.ending.length>20,s.id);
  assert.equal(s.steps.filter(x=>x.final).length,1);
  if(s.tier==='hidden')assert.ok(s.steps.some(x=>x.objectives.some(o=>o.kind==='hit'&&o.count===1000)));
 }
});
test('every objective, mentor, equipment recipe and hidden trail resolves to an existing entity',()=>{
 for(const s of Object.values(STORIES)){
  assert.ok(CLASSES[s.id]&&STORY_POINTS.has(s.site)&&ZONES[s.zone]);
  for(const parent of s.parents)assert.ok(STORIES[parent]);
  for(const step of s.steps)for(const o of step.objectives){
   assert.ok(Number.isInteger(o.count)&&o.count>0);
   if(o.kind==='kill'&&o.target!=='any')assert.ok(MONSTERS[o.target],o.target);
   if(['deliver','gather'].includes(o.kind))assert.ok(ITEMS[o.target],o.target);
   if(['visit','trial'].includes(o.kind))assert.ok(ZONES[o.target],o.target);
   if(o.kind==='read')assert.ok(STORY_POINTS.has(o.target),o.target);
   if(o.kind==='relic')assert.ok(RELICS.some(r=>r.id===o.target),o.target);
  }
 }
 for(const r of RECIPES)for(const id of Object.keys(r.cost))assert.ok(ITEMS[id],id);
 for(const path of Object.values(SECRET_PATHS)){assert.equal(path.length,3);assert.equal(new Set(path).size,3);for(const id of path)assert.ok(STORY_POINTS.has(id));}
});
test('profession prerequisite graph has no cycles and common professions are available to novice training',()=>{
 const visited=new Set(),active=new Set();
 function visit(id){assert.ok(!active.has(id),'cycle '+id);if(visited.has(id))return;active.add(id);for(const p of STORIES[id].parents)visit(p);active.delete(id);visited.add(id);}
 Object.keys(STORIES).forEach(visit);assert.equal(visited.size,36);
 for(const s of Object.values(STORIES).filter(x=>x.tier==='common')){
  assert.equal(s.parents.length,0);
  assert.ok(s.steps.every(st=>st.objectives.every(o=>o.kind!=='hit'||o.target==='any')));
 }
});
test('v2 owned jobs, gear, stats and quest progress survive migration without fabricated training history',()=>{
 const {p}=setup('mage');p.discovery.jobs.push('priest');p.attributes.int=20;p.enhancements.ash_staff=7;
 const old=serialize(p);delete old.journey;delete old.atlas;old.schemaVersion=2;
 const h=hydrate(old);assert.equal(h.schemaVersion,3);assert.ok(h.discovery.jobs.includes('mage')&&h.discovery.jobs.includes('priest'));
 assert.equal(h.enhancements.ash_staff,7);assert.equal(h.attributes.int,20);assert.equal(Object.keys(h.journey.quests).length,0);
 assert.ok(h.journey.inherited.includes('mage'));assert.deepEqual(h.atlas.waypoints,[]);
});
test('legacy numeric requirements no longer bypass story completion',()=>{
 const {g,p}=setup();p.kills=99999;p.gathered=99999;p.discovery.crafted=5000;
 evaluateJobs(g,p);assert.deepEqual(p.discovery.jobs,['novice']);
 assert.equal(g.action(p,{type:'changeJob',id:'guardian'}).ok,false);
});
test('story start requires the actual mentor, level and parent profession; maximum three active paths',()=>{
 const {g,p}=setup();assert.equal(g.action(p,{type:'storyAccept',id:'guardian'}).ok,false);
 at(g,p,STORY_POINTS.get('mentor_berserker'));assert.equal(g.action(p,{type:'storyAccept',id:'berserker'}).ok,false);
 assert.equal(begin(g,p,'guardian').ok,true);assert.equal(begin(g,p,'ranger').ok,true);assert.equal(begin(g,p,'mage').ok,true);
 assert.equal(begin(g,p,'miner').ok,false);assert.equal(g.action(p,{type:'storyPause',id:'mage'}).ok,true);
 assert.equal(begin(g,p,'miner').ok,true);assert.equal(g.action(p,{type:'storyResume',id:'mage'}).ok,false);
});
test('pre-accept actions do not count and paused objectives do not advance',()=>{
 const {g,p}=setup();recordStory(g,p,{kind:'visit',target:'forest'});
 begin(g,p,'guardian');const q=p.journey.quests.guardian;assert.equal(q.progress[0],0);
 g.action(p,{type:'storyPause',id:'guardian'});recordStory(g,p,{kind:'visit',target:'forest'});assert.equal(q.progress[0],0);
 g.action(p,{type:'storyResume',id:'guardian'});recordStory(g,p,{kind:'visit',target:'forest'});assert.equal(q.progress[0],1);
});
test('actual accepted attack increments once; empty swings and wrong family do not satisfy sword practice',()=>{
 const {g,p}=setup('guardian');begin(g,p,'guardian');
 const q=p.journey.quests.guardian;q.chapter=1;q.progress=[0];q.notified=false;
 at(g,p,{zone:'forest',x:980,y:1120});
 const w=g.worlds.get('forest');w.mobs=[];
 assert.equal(g.action(p,{type:'attack',skill:'basic'}).ok,false);assert.equal(q.progress[0],0);
 const m=g.makeMob('training-real','golem',p.x+20,p.y);m.hp=m.maxHp=100000;w.mobs.push(m);
 assert.equal(g.action(p,{type:'attack',skill:'basic'}).ok,true);assert.equal(q.progress[0],1);
 assert.equal(g.action(p,{type:'attack',skill:'basic'}).ok,false);assert.equal(q.progress[0],1);
 // Exact-family hidden practice rejects a ranged hit even if the client asks for melee.
 p.journey.quests={nameless_king:{chapter:2,active:true,progress:[0]}};
 recordStory(g,p,{kind:'hit',target:'ranger',skill:'basic'});
 assert.equal(p.journey.quests.nameless_king.progress[0],0);
 recordStory(g,p,{kind:'hit',target:'guardian',skill:'basic'});
 assert.equal(p.journey.quests.nameless_king.progress[0],1);
});
test('real healing counts while full-health use and non-healing utility do not',()=>{
 const {g,p}=setup();begin(g,p,'priest');p.journey.quests.priest={chapter:1,progress:[0],active:true};
 const q=p.journey.quests.priest;
 p.hp=getStats(p).maxHp;assert.equal(g.action(p,{type:'use',id:'potion'}).ok,false);assert.equal(q.progress[0],0);
 p.hp-=50;assert.equal(g.action(p,{type:'use',id:'potion'}).ok,true);assert.equal(q.progress[0],1);
});
test('walking practice advances on actual motion, not teleportation',()=>{
 const {g,p}=setup();begin(g,p,'rogue');const q=p.journey.quests.rogue;q.chapter=1;q.progress=[0];
 at(g,p,{zone:'town',x:24*32+16,y:21*32+16});g.setInput(p,{x:1,y:0,seq:1});
 g.tick(.05,g.now+50);assert.ok(q.progress[0]>0);
 const n=q.progress[0];g.teleport(p,'meadow',ZONES.meadow.spawn[0]*32+16,ZONES.meadow.spawn[1]*32+16);
 assert.equal(q.progress[0],n);
});
test('reporting consumes donated materials once and rejects stale chapter index replay',()=>{
 const {g,p}=setup();begin(g,p,'guardian');const q=p.journey.quests.guardian;q.chapter=2;q.progress=[0];
 p.inventory.herb=4;assert.equal(g.action(p,{type:'storyClaim',id:'guardian',chapter:2}).ok,false);
 p.inventory.herb=7;const gold=p.gold;
 assert.equal(g.action(p,{type:'storyClaim',id:'guardian',chapter:2}).ok,true);assert.equal(p.inventory.herb,2);assert.equal(q.chapter,3);assert.ok(p.gold>gold);
 const after=p.gold;assert.equal(g.action(p,{type:'storyClaim',id:'guardian',chapter:2}).ok,false);assert.equal(p.gold,after);
});
test('all 240 server-validated stages can be completed in order with correct targets; no inaccessible final state',()=>{
 for(const s of Object.values(STORIES)){
  const {g,p}=setup();assert.equal(begin(g,p,s.id).ok,true,s.id);
  for(let chapter=0;chapter<s.steps.length;chapter++){
   readyStage(g,p,s.id);assert.ok(chapterReady(p,s.id),s.id+':'+chapter);
   at(g,p,STORY_POINTS.get(s.site));
   const result=g.action(p,{type:'storyClaim',id:s.id,chapter,vow:'remember'});assert.equal(result.ok,true,s.id+':'+chapter+JSON.stringify(result));
  }
  assert.ok(p.journey.completed.includes(s.id));assert.ok(p.discovery.jobs.includes(s.id));
  assert.equal(p.journey.quests[s.id],undefined);assert.ok(storyDetail(p,s.id).ending);
  assert.equal(g.action(p,{type:'storyClaim',id:s.id,chapter:s.steps.length-1,vow:'remember'}).ok,false);
 }
});
test('hidden names stay hidden until all ordered clues; out-of-order readings neither progress nor erase',()=>{
 const {g,p}=setup(),path=SECRET_PATHS.voidwalker;
 readSecret(g,p,STORY_POINTS.get(path[2]));assert.equal(p.journey.signs.voidwalker,undefined);
 readSecret(g,p,STORY_POINTS.get(path[0]));assert.equal(p.journey.signs.voidwalker,1);
 readSecret(g,p,STORY_POINTS.get(path[2]));assert.equal(p.journey.signs.voidwalker,1);
 assert.equal(storyDetail(p,'voidwalker').sealed,true);
 readSecret(g,p,STORY_POINTS.get(path[1]));readSecret(g,p,STORY_POINTS.get(path[2]));
 assert.equal(storyDetail(p,'voidwalker').sealed,undefined);assert.equal(p.discovery.jobs.includes('voidwalker'),false);
});
test('hidden final vow is required, and is stored rather than giving an invisible gameplay advantage',()=>{
 const {g,p}=setup();begin(g,p,'phoenix_heir');const q=p.journey.quests.phoenix_heir;
 q.chapter=9;q.progress=[0];readyStage(g,p,'phoenix_heir');
 assert.equal(g.action(p,{type:'storyClaim',id:'phoenix_heir',chapter:9}).ok,false);
 assert.equal(g.action(p,{type:'storyClaim',id:'phoenix_heir',chapter:9,vow:'protect'}).ok,true);
 assert.equal(hydrate(serialize(p)).journey.vows.phoenix_heir,'protect');
});
test('story objectives, paused state, ordered clues, atlas and fog persist across save hydration',()=>{
 const {g,p}=setup();begin(g,p,'guardian');p.journey.quests.guardian.progress[0]=1;p.journey.quests.guardian.active=false;
 p.journey.signs.voidwalker=2;p.atlas.waypoints.push('meadow_reach_0');p.atlas.pages.push('meadow_reach_0_tablet');p.atlas.fog.meadow_reach_0=[0,1,3];
 const q=hydrate(serialize(p));assert.deepEqual(q.journey,p.journey);assert.deepEqual(q.atlas,p.atlas);
});
test('164 public regions include 144 level-progressive sectors beyond the original mapped area',()=>{
 const totals=atlasTotals(ZONES);assert.equal(totals.regions,164);assert.equal(totals.expeditions,144);assert.equal(totals.landmarks,576);
 assert.ok(totals.tiles>1000000&&totals.areaRatio>35);
});
test('each of 144 sectors has four landmarks; all entrances, mentors, nodes, caches and bosses are reachable',()=>{
 for(const z of Object.values(ZONES)){
  const m=createMap(z.id),start={x:z.spawn[0]*32+16,y:z.spawn[1]*32+16};
  const targets=[...m.portals,...m.storyPoints||[]];
  if(z.expedition){assert.equal(LANDMARKS.filter(p=>p.zone===z.id).length,4);targets.push(...m.resources,...m.chests,BOSS_SPAWNS[z.id]);}
  // Flood fill is stronger and cheaper here than hundreds of separate A* routes.
  const queue=[Math.floor(start.y/32)*m.w+Math.floor(start.x/32)],seen=new Set(queue);
  for(let at=0;at<queue.length;at++){
   const i=queue[at],x=i%m.w,y=Math.floor(i/m.w);
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,yy=y+dy,n=yy*m.w+xx;
    if(xx>=0&&yy>=0&&xx<m.w&&yy<m.h&&!m.blocked[n]&&!seen.has(n)){seen.add(n);queue.push(n);}
   }
  }
  for(const point of targets)assert.ok(seen.has(Math.floor(point.y/32)*m.w+Math.floor(point.x/32)),z.id+':'+point.id);
 }
});
test('portal graph reaches all 164 public regions from town and every new region has a route back',()=>{
 const seen=new Set(['town']),q=['town'];
 for(let i=0;i<q.length;i++)for(const p of PORTALS[q[i]]||[])if(!seen.has(p.to)){seen.add(p.to);q.push(p.to);}
 assert.equal(seen.size,164);
 for(const z of EXPEDITION_ZONES)assert.ok(PORTALS[z.id].length>=2);
});
test('lazy worlds do not eagerly spawn all regions and preserve future cooldowns during unload/reload',()=>{
 const {g,p}=setup();assert.equal(g.worlds.size,1);
 const w=g.worlds.get('meadow_reach_0'),boss=w.mobs.find(m=>m.id.endsWith('_boss'));
 boss.alive=false;boss.hp=0;boss.respawnAt=g.now+120000;w.nodes[0].readyAt=g.now+180000;
 g.now+=95000;g.worlds.sweep(g.now,new Set(['town']));assert.equal(g.worlds.has(w.id),false);
 const reloaded=g.worlds.get(w.id);
 assert.equal(reloaded.mobs.find(m=>m.id===boss.id).alive,false);assert.equal(reloaded.nodes[0].readyAt,w.nodes[0].readyAt);
});
test('distant mobs sleep, occupied region runs, terrain metadata cache remains bounded',()=>{
 const {g,p}=setup();at(g,p,STORY_POINTS.get('meadow_reach_0_camp'));g.tick(.05,g.now+50);
 assert.ok(g.perf.sleepingMobs>20);assert.ok(g.perf.awakeMobs<30);
 for(const id of Object.keys(ZONES))createMap(id);
 assert.ok(mapCacheInfo().size<=10);
});
test('scenery bucket query returns a local subset rather than all decorative objects',()=>{
 const m=createMap('desert_reach_8'),x=m.camp.x,y=m.camp.y;
 const local=nearbyScenery(m,x-350,y-250,x+350,y+250);
 assert.ok(local.length<m.props.length/4);assert.equal(new Set(local).size,local.length);
});
test('camp attunement, discovered fog and hidden page rewards are one-time and survive revisits',()=>{
 const {g,p}=setup(),camp=STORY_POINTS.get('coast_reach_0_camp');at(g,p,camp);
 assert.equal(g.interact(p,camp.id).ok,true);assert.ok(p.atlas.waypoints.includes(camp.zone));
 const xp=p.xp;g.now+=1000;g.interact(p,camp.id);assert.equal(p.xp,xp);
 revealTerrain(g,p);assert.ok(p.atlas.fog[p.zone].length>0);
 const page=STORY_POINTS.get('coast_reach_0_tablet');at(g,p,page);g.interact(p,page.id);
 const n=p.inventory.wayfarer_seal;g.now+=1000;g.interact(p,page.id);assert.equal(p.inventory.wayfarer_seal,n);
});
test('waypoints require attunement, safe origin, level and cooldown; old travel cannot bypass',()=>{
 const {g,p}=setup();assert.equal(g.action(p,{type:'waypoint',id:'meadow_reach_0'}).ok,false);
 p.discovery.visited.push('meadow_reach_0');assert.equal(g.action(p,{type:'travel',id:'meadow_reach_0'}).ok,false);
 p.atlas.waypoints.push('meadow_reach_0');assert.equal(g.action(p,{type:'waypoint',id:'meadow_reach_0'}).ok,true);
 assert.equal(p.zone,'meadow_reach_0');assert.equal(g.action(p,{type:'waypoint',id:'town'}).ok,false);
 g.now+=22000;assert.equal(g.action(p,{type:'waypoint',id:'town'}).ok,true);
});
test('regional daily contracts count only the accepted region and matching targets, pay once, and reset at KST midnight',()=>{
 const {g,p}=setup(),camp=STORY_POINTS.get('meadow_reach_0_camp');at(g,p,camp);
 assert.equal(g.action(p,{type:'contractAccept'}).ok,true);const c=p.atlas.contracts[p.zone];
 recordAtlas(g,p,'kill','wrong');assert.equal(c.kills,0);
 p.zone='meadow_reach_1';recordAtlas(g,p,'kill',c.monster);assert.equal(c.kills,0);p.zone=camp.zone;
 for(let i=0;i<12;i++)recordAtlas(g,p,'kill',c.monster);
 for(let i=0;i<5;i++)recordAtlas(g,p,'gather',c.resource);
 assert.equal(g.action(p,{type:'contractClaim'}).ok,true);assert.equal(g.action(p,{type:'contractClaim'}).ok,false);
 g.now+=86400000;assert.equal(g.action(p,{type:'contractAccept'}).ok,true);
 assert.equal(p.atlas.contracts[p.zone].kills,0);
 assert.equal(atlasDay(Date.parse('2026-10-23T14:59:59Z')),'2026-10-23');
 assert.equal(atlasDay(Date.parse('2026-10-23T15:00:00Z')),'2026-10-24');
});
function solveRegionTrial(g,p,w){
 const t=w.fieldTrial;assert.ok(t?.ritual);
 const pads=[{x:w.map.trialArena.x-104,y:w.map.trialArena.y-55},
  {x:w.map.trialArena.x+104,y:w.map.trialArena.y-55},
  {x:w.map.trialArena.x,y:w.map.trialArena.y+110}];
 for(const glyph of [...t.ritual.seq]){
   const marker=g.snapshot(p).fieldTrial.markers.find(m=>m.id===`trial_glyph_${glyph}`);
   assert.ok(marker);p.x=pads[glyph].x;p.y=pads[glyph].y;g.now+=520;
   assert.equal(g.action(p,{type:'trialInteract',id:marker.id}).ok,true);
 }
}
function finishRegionTrial(g,p,w){
 for(const expected of [6,8,1]){
  const mobs=w.mobs.filter(m=>m.trialKey&&m.alive);assert.equal(mobs.length,expected);
  if(expected===1){
   for(const limit of [0.67,0.33]){
    assert.equal(mobs[0].trialShield,true);
    solveRegionTrial(g,p,w);
    mobs[0].hp=Math.ceil(mobs[0].maxHp*limit);
    g.tickFieldTrial(w);
   }
   solveRegionTrial(g,p,w);
  }
  for(const m of mobs){m.contributors.set(p.id,g.now);m.damageLog.set(p.id,100);g.killMob(w.id,m);}
  g.tickFieldTrial(w);
  if(expected!==1){solveRegionTrial(g,p,w);g.now+=2500;g.tickFieldTrial(w);}
 }
}
test('regional trials combine combat, timed runes, and 3-phase shield breaks with daily rewards',()=>{
 const {g,p}=setup();const point=STORY_POINTS.get('meadow_reach_2_trial');at(g,p,point);
 p.journey.quests.berserker={chapter:5,progress:[0],active:true};p.journey.tracked='berserker';
 for(let repeat=0;repeat<2;repeat++){
  g.now+=11000;assert.equal(g.action(p,{type:'trialStart'}).ok,true);
  assert.equal(g.action(p,{type:'trialStart'}).ok,false);
  const w=g.worlds.get(p.zone);
  finishRegionTrial(g,p,w);
  assert.equal(w.fieldTrial,null);assert.equal(p.inventory.wayfarer_seal,3);
 }
 assert.equal(p.journey.quests.berserker.progress[0],1);
});

test('empty or expired trials are cleaned up with no free loot and can be restarted',()=>{
 const {g,p}=setup(),point=STORY_POINTS.get('coast_reach_0_trial');at(g,p,point);
 g.action(p,{type:'trialStart'});const w=g.worlds.get(p.zone);g.now+=361000;g.tickFieldTrial(w);
 assert.equal(w.fieldTrial,null);assert.equal(w.mobs.some(m=>m.trialKey),false);assert.equal(p.inventory.wayfarer_seal,undefined);
 g.now+=11000;assert.equal(g.action(p,{type:'trialStart'}).ok,true);p.zone='town';g.tick(.05,g.now+50);
 assert.equal(w.fieldTrial,null);
});
test('province completion requires all nine camps and eighteen records, pays exactly once',()=>{
 const {g,p}=setup();assert.equal(g.action(p,{type:'surveyClaim',id:'meadow'}).ok,false);
 p.atlas.waypoints=EXPEDITION_ZONES.filter(z=>z.province==='meadow').map(z=>z.id);
 p.atlas.pages=LANDMARKS.filter(x=>x.zone.startsWith('meadow_')&&['tablet','watch'].includes(x.kind)).map(x=>x.id);
 assert.equal(g.action(p,{type:'surveyClaim',id:'meadow'}).ok,true);const gold=p.gold;
 assert.equal(g.action(p,{type:'surveyClaim',id:'meadow'}).ok,false);assert.equal(p.gold,gold);
});
test('profile sends only current fog and page IDs; full save preserves other-region exploration',()=>{
 const {g,p}=setup();p.atlas.fog.meadow_reach_0=[1,2,3];p.atlas.fog.coast_reach_0=[4,5];
 p.atlas.pages=['meadow_reach_0_tablet','coast_reach_0_tablet'];p.zone='meadow_reach_0';
 const profile=g.privatePlayer(p);assert.equal(profile.atlas.fog.coast_reach_0,undefined);assert.equal(profile.atlas.pages.length,1);
 assert.equal(profile.atlas.totalPages,2);assert.ok(serialize(p).atlas.fog.coast_reach_0);
});
test('unknown or forged story and atlas actions cannot grant jobs, gold or move to locked maps',()=>{
 const {g,p}=setup();const gold=p.gold;
 for(const a of [{type:'storyClaim',id:'guardian',chapter:3},{type:'storyAccept',id:'__proto__'},
  {type:'surveyClaim',id:'__proto__'},{type:'waypoint',id:'constructor'},{type:'trialStart'},
  {type:'contractClaim'},{type:'storyResume',id:'guardian'}]){
  const r=g.action(p,a);assert.equal(r.ok,false,JSON.stringify(a));
 }
 assert.equal(p.gold,gold);assert.deepEqual(p.discovery.jobs,['novice']);
});

test('coalesced training updates flush after stopping and hidden next-clue hints survive reopening',()=>{
 const {g,p}=setup();begin(g,p,'guardian');const q=p.journey.quests.guardian;q.chapter=1;q.progress=[0];
 recordStory(g,p,{kind:'hit',target:'guardian',skill:'basic'});const rev=p.revision;
 g.now+=50;recordStory(g,p,{kind:'hit',target:'guardian',skill:'basic'});
 assert.equal(p.revision,rev);assert.equal(p.storyPendingSync,true);assert.ok(p.storySaveStamp>=2);
 g.tick(0,g.now+850);assert.ok(p.revision>rev);assert.equal(p.storyPendingSync,false);
 readSecret(g,p,STORY_POINTS.get(SECRET_PATHS.voidwalker[0]));
 assert.ok(storyDetail(p,'voidwalker').hint.includes(ZONES[STORY_POINTS.get(SECRET_PATHS.voidwalker[1]).zone].name));
});
