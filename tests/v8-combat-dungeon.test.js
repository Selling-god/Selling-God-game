import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter,serialize,hydrate} from '../server/game.js';
import {CLASSES,MONSTERS,ITEMS,getStats,ZONES} from '../shared/content.js';
import {DUNGEONS,DUNGEON_BY_ID} from '../shared/dungeons.js';
import {createMap,isBlocked} from '../shared/world.js';
import {HIDDEN_VOCATION_RELICS} from '../shared/vocation-sites.js';
import {STORIES,SECRET_PATHS} from '../server/story-data.js';
import {STORY_POINTS,storyDetail} from '../server/stories.js';
import {skillGuide} from '../shared/skill-guides.js';
import {JOB_WEAPONS,weaponVisualForJob} from '../client/held-weapons.js';
const setup=(job='berserker')=>{
 const g=new Game({random:()=>.5});g.now=Date.now();
 const p=g.addPlayer(newCharacter('v8-user','V8Tester',job));p.level=70;p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
 return {g,p};
};
test('all 39 classes carry recognizable physical weapon types with distinct visual groups',()=>{
 assert.equal(Object.keys(JOB_WEAPONS).length,Object.keys(CLASSES).length);
 assert.ok(new Set(Object.values(JOB_WEAPONS)).size>=12);
 for(const job of Object.keys(CLASSES))assert.ok(weaponVisualForJob(job),job);
 for(const [job,kind] of [['sniper','rifle'],['engineer','gun'],['ranger','bow'],['mage','staff'],['berserker','hammer'],['eclipse_reaper','scythe'],['monk','gauntlets']])assert.equal(weaponVisualForJob(job),kind);
});
test('skill guides disclose true costs, status ailments and berserker safety floor',()=>{
 for(const [job,action,expect] of [['berserker','skill2','30%'],['pyromancer','skill1','화상'],['herbalist','skill1','독'],['stormcaller','skill1','마비']]){
  const s=CLASSES[job].skills.find(s=>s.id===action),guide=skillGuide(s,job);
  assert.ok((guide.summary+' '+guide.tags.join(' ')).includes(expect),`${job} ${expect}`);
  assert.equal(guide.mp,s.mp);assert.equal(guide.cd,s.cd);
 }
});
test('rage does not charge upon casting, spends HP per successful attack, clamps at 30% without protecting against monsters',()=>{
 const {g,p}=setup();const max=g.stats(p).maxHp;
 p.zone='town';const target=g.worlds.get('town').mobs.find(m=>m.trainingDummy);
 assert.ok(target);p.x=target.x-45;p.y=target.y;
 assert.equal(g.attack(p,'skill2').ok,true);assert.equal(p.hp,max,'pressing E must not drain HP');
 assert.equal(g.attack(p,'basic').ok,true);assert.ok(p.hp<max);
 p.cooldowns.basic=0;p.hp=Math.ceil(max*.30)+1;
 assert.equal(g.attack(p,'basic').ok,true);assert.ok(p.hp>=Math.ceil(max*.30));
 const old=p.hp;p.cooldowns.basic=0;p.hp=Math.ceil(max*.30)-20;
 assert.equal(g.attack(p,'basic').ok,true);assert.ok(p.hp<=old,'attack must not heal monster-inflicted damage below 30%');
 // This is not an invulnerability buff.
 p.zone='forest';p.x=800;p.y=700;p.invulnerableUntil=0;p.shieldUntil=0;g.damagePlayer(p,max*10,{monster:true});assert.equal(p.hp,0);
});
test('practice dummies remain nonhostile and drop no XP or loot despite real attacks',()=>{
 const {g,p}=setup('mage');const w=g.worlds.get('town');
 assert.equal(w.mobs.filter(m=>m.trainingDummy).length,2);
 const target=w.mobs.find(m=>m.trainingDummy);p.zone='town';p.x=target.x+35;p.y=target.y;
 const xp=p.xp,inv=JSON.stringify(p.inventory),kills=p.kills;
 assert.equal(g.attack(p,'basic').ok,true);
 assert.ok(target.hp<target.maxHp);assert.equal(p.xp,xp);assert.equal(JSON.stringify(p.inventory),inv);
 g.tick(.05,g.now+5200);
 assert.equal(target.hp,target.maxHp);assert.equal(p.kills,kills);assert.equal(target.target,null);
});
test('poison, burn, paralysis and stun apply in authoritative mob state',()=>{
 for(const [job,skill,status] of [['herbalist','skill1','poison'],['pyromancer','skill1','burn'],['stormcaller','skill1','paralyzedUntil'],['sentinel','skill1','stunUntil']]){
  const {g,p}=setup(job);p.zone='forest';p.x=890;p.y=700;const w=g.worlds.get('forest');
  const m=g.makeMob('test-v8','slime',p.x+45,p.y);m.maxHp=m.hp=100000;w.mobs=[m];
  assert.equal(g.attack(p,skill).ok,true,job);
  if(status.endsWith('Until'))assert.ok(m[status]>g.now,job);
  else assert.ok(m.dots.some(d=>d.kind===status),job);
 }
});
test('eight hidden shrines are reachable and allow starting an eligible hidden vocation without its mentor',()=>{
 for(const relic of HIDDEN_VOCATION_RELICS){const map=createMap(relic.zone);assert.equal(isBlocked(map,relic.x,relic.y,10),false,relic.job);}
 const {g,p}=setup('mage'),relic=HIDDEN_VOCATION_RELICS.find(s=>s.job==='eclipse_reaper'),story=STORIES[relic.job];
 p.level=200;p.zone=relic.zone;p.x=relic.x;p.y=relic.y;
 p.journey.signs[relic.job]=story.secret.length;
 p.journey.discovered.push(relic.job);p.discovery.jobs.push(...story.parents);
 p.atlas.pages.push(...story.lore);
 const detail=storyDetail(p,relic.job);
 assert.equal(detail.artifactSite.id,relic.id);
 assert.equal(detail.lorePages.length,story.lore.length);
 assert.ok(detail.lorePages.every(x=>x.done));
 const resp=g.action(p,{type:'interact',id:relic.id});assert.equal(resp.ok,true,JSON.stringify(resp));
 const began=g.action(p,{type:'storyAccept',id:relic.job});assert.equal(began.ok,true,JSON.stringify(began));
 assert.ok(p.journey.quests[relic.job]);
 assert.ok(!p.discovery.jobs.includes(relic.job));
});
test('level 25 echo mine has a real entrance and balanced early game rewards',()=>{
 const d=DUNGEON_BY_ID.moon_quarry;assert.ok(d);
 assert.equal(d.level,25);assert.equal(DUNGEONS.length,4);
 assert.equal(ZONES[d.zone].dungeon,true);
 const map=createMap(d.entryZone),inside=createMap(d.zone);
 assert.equal(map.dungeonEntrance?.dungeon,d.id);
 assert.equal(isBlocked(map,map.dungeonEntrance.x,map.dungeonEntrance.y,10),false);
 assert.equal(inside.dungeonId,d.id);
 assert.equal(ITEMS[d.reward].rarity,'epic');
 const {g,p}=setup('mage');p.level=25;p.zone=d.entryZone;p.x=map.dungeonEntrance.x;p.y=map.dungeonEntrance.y;
 assert.equal(g.action(p,{type:'dungeonLobby',id:d.id}).ok,false,'two player minimum must still apply');
});
test('character save format unchanged, skills transient and character items preserved',()=>{
 const {g,p}=setup('berserker');p.zone='town';p.hp=getStats(p).maxHp;
 g.attack(p,'skill2');
 const saved=serialize(p);assert.equal(saved.signature,undefined);assert.equal(saved.combatBuffs,undefined);
 assert.ok(hydrate(saved).level===70);assert.ok(Array.isArray(saved.titles));
});
