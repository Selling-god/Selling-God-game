import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_LEVEL,xpRequired,ITEMS,MONSTERS,ZONES,RECIPES,QUESTS,NPCS,getStats,weaponFor} from '../shared/content.js';
import {MAX_ATTRIBUTE,statBudget,freePoints,cleanAttributes,combatExperience} from '../shared/rpg.js';
import {ENDGAME_REGIONS,DAILY_TASKS} from '../shared/expansion.js';
import {EXPEDITION_ZONES,atlasTotals} from '../shared/expeditions.js';
import {PORTALS,createMap,isBlocked} from '../shared/world.js';

const reachableAt=level=>{
 const seen=new Set(['town']),queue=['town'];
 while(queue.length){
  for(const portal of PORTALS[queue.shift()]||[])if(portal.level<=level&&!seen.has(portal.to)){
   seen.add(portal.to);queue.push(portal.to);
  }
 }
 return seen;
};
const setup=async(level=35,cls='guardian')=>{
 const {Game,newCharacter}=await import('../server/game.js'),messages=[];
 const game=new Game({random:()=>0,send:(id,event,data)=>messages.push({id,event,data})});
 game.now=Date.parse('2026-10-23T03:11:00Z');
 const p=game.addPlayer(newCharacter('balance-user','성장 테스트',cls));
 p.level=level;p.xp=0;p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
 return {game,p,messages};
};

test('growth extends to 200 with a monotonic, slower early XP curve',()=>{
 assert.equal(MAX_LEVEL,200);
 assert.deepEqual([1,5,10,25,30,100,200].map(xpRequired),[189,651,1665,7948,11235,141120,732120]);
 let previous=0;
 for(let level=1;level<=MAX_LEVEL;level++){
  const required=xpRequired(level);
  assert.ok(Number.isSafeInteger(required)&&required>previous);
  if(level<=30)assert.ok(required>(55+level*35+level*level*5)*1.7);
  previous=required;
 }
});

test('same-level fights pay normally, old enemies fade, and one party tag cannot award several levels',()=>{
 const same=MONSTERS[ENDGAME_REGIONS[0].mobs[0]];
 assert.equal(combatExperience(same.xp,35,35),same.xp);
 assert.equal(combatExperience(same.xp,35,35,{party:true}),Math.round(same.xp*1.1));
 assert.equal(combatExperience(same.xp,40,35),same.xp);
 assert.ok(combatExperience(same.xp,41,35)<same.xp);
 assert.equal(combatExperience(same.xp,100,35),Math.round(same.xp*.05));
 assert.ok(combatExperience(10000000,1,200)<=Math.floor(xpRequired(1)*.12));
 assert.ok(combatExperience(10000000,1,200,{boss:true,party:true})<=Math.floor(xpRequired(1)*.35));
 for(const invalid of [0,-1,NaN,Infinity])assert.equal(combatExperience(invalid,10,10),0);
});

test('new gates are reachable from town at their level, without moving existing profession routes',()=>{
 assert.deepEqual(ENDGAME_REGIONS.map(z=>z.level),[35,50,70,90,110,135,160,180]);
 for(const [id,level]of Object.entries({town:1,forest:1,ruins:5,citadel:9,meadow:2,coast:6,desert:9,swamp:10,frost:13,sky:16,abyss:21,observatory:25})){
  assert.equal(ZONES[id].minLevel,level,id);
 }
 assert.ok(EXPEDITION_ZONES.filter(z=>!z.endgame).every(z=>z.minLevel<=28));
 for(const z of ENDGAME_REGIONS){
  assert.equal(reachableAt(z.level-1).has(z.id),false,z.id+' must remain gated');
  assert.equal(reachableAt(z.level).has(z.id),true,z.id+' has an accessible incoming road');
  assert.ok(PORTALS[z.id].some(p=>p.to===z.parent&&p.level===ZONES[z.parent].minLevel));
 }
 assert.equal(atlasTotals(ZONES).regions,164);
});

test('late zones contain progressively stronger, correctly rendered enemies and a level 200 final boss',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../public/assets/atlas.json',import.meta.url),'utf8'));
 let oldHp=0,oldAtk=0;
 for(const z of ENDGAME_REGIONS){
  const zone=ZONES[z.id],map=createMap(z.id);
  assert.equal(isBlocked(map,zone.spawn[0]*32+16,zone.spawn[1]*32+16,14),false,z.id);
  assert.deepEqual(zone.mobTypes,z.mobs);
  assert.equal(MONSTERS[z.mobs[0]].level,z.level);
  assert.equal(MONSTERS[z.mobs[2]].level,z.maxLevel);
  for(const id of [...z.mobs,z.boss]){
   const m=MONSTERS[id],humanoid=['skeleton','ash_knight'].includes(m.skin);
   for(let frame=0;frame<4;frame++)assert.ok(atlas[`${m.sprite}_${humanoid?'s_':''}${frame}`],id+' sprite frame');
   assert.ok(ITEMS[m.material]);
   assert.ok(m.level>=z.level&&m.level<=MAX_LEVEL);
   assert.ok(m.hp>0&&m.atk>0&&m.xp>0);
  }
  const first=MONSTERS[z.mobs[0]];
  assert.ok(first.hp>oldHp&&first.atk>oldAtk);oldHp=first.hp;oldAtk=first.atk;
  assert.ok(Math.abs(xpRequired(first.level)/first.xp-36)<.05,z.id+' has bounded kill-only progression');
 }
 assert.equal(MONSTERS[ENDGAME_REGIONS.at(-1).boss].level,200);
});

test('every field supplies affordable gear for all families using materials available in that field',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../public/assets/atlas.json',import.meta.url),'utf8'));
 let oldWeapon=ITEMS.astral_sword.atk,oldArmor=ITEMS.astral_armor.def;
 for(const z of ENDGAME_REGIONS){
  const fieldMaterials=new Set(z.mobs.map(id=>MONSTERS[id].material));
  for(const r of RECIPES.filter(r=>r.id.startsWith(z.gearTier))){
   assert.equal(r.level,z.level);
   for(const [id,n]of Object.entries(r.cost)){
    assert.ok(id==='ore'||fieldMaterials.has(id),r.id+' does not require a later field or world boss');
    assert.ok(n<=22);
   }
   assert.ok(r.gold<=MONSTERS[z.mobs[0]].gold[0]*12,'entry set must be affordable');
  }
  for(const family of ['guardian','ranger','mage']){
   const weapon=ITEMS[weaponFor(z.gearTier,family)];
   assert.equal(weapon.class,family);assert.equal(weapon.level,z.level);
   assert.ok(atlas[`gear_${weapon.visualBase}_s_0`]);
  }
  const weapon=ITEMS[weaponFor(z.gearTier,'guardian')],armor=ITEMS[z.gearTier+'_armor'];
  assert.ok(weapon.atk>oldWeapon&&armor.def>oldArmor);oldWeapon=weapon.atk;oldArmor=armor.def;
  for(const id of [z.gearTier+'_armor',z.gearTier+'_charm'])assert.ok(atlas[`gear_${ITEMS[id].visualBase}_s_0`]);
  assert.equal(MONSTERS[z.boss].gearCharm,z.gearTier+'_charm');
  const quest=QUESTS.find(q=>q.id==='frontier_'+z.id);
  assert.equal(quest.repeatable,undefined);
  assert.equal(quest.weaponTier,z.gearTier);
 }
});

test('previous-tier gear and balanced allocations can enter each next field without ordinary one-shots',()=>{
 for(const [index,z]of ENDGAME_REGIONS.entries())for(const family of ['guardian','ranger','mage']){
  const primary={guardian:'str',ranger:'dex',mage:'int'}[family],budget=statBudget(z.level);
  const offense=Math.min(MAX_ATTRIBUTE,Math.floor(budget*.6)),health=Math.min(MAX_ATTRIBUTE,budget-offense);
  const prev=ENDGAME_REGIONS[index-1],equipment=prev?
   {weapon:weaponFor(prev.gearTier,family),armor:prev.gearTier+'_armor',charm:prev.gearTier+'_charm'}:
   {weapon:weaponFor('astral',family),armor:'astral_armor',charm:'memory_crown'};
  const stats=getStats({classId:family,level:z.level,attributes:{[primary]:offense,vit:health},
   equipment});
  const enemy=MONSTERS[z.mobs[0]],outgoing=Math.max(1,stats.atk-enemy.def*.65),incoming=Math.max(1,enemy.atk-stats.def*.65);
  assert.ok(enemy.hp/outgoing<20,`${z.id}/${family}: ordinary enemies are not damage sponges`);
  assert.ok(stats.maxHp/incoming>5,`${z.id}/${family}: a single ordinary enemy cannot immediately kill an equipped entrant`);
  const boss=MONSTERS[z.boss],enragedHit=boss.atk*1.15-stats.def*.65;
  assert.ok(enragedHit<stats.maxHp*.2,`${z.id}/${family}: one boss mistake leaves recovery time`);
 }
});

test('level bands supply appropriate enemies all the way to the next gate without an XP dead zone',()=>{
 for(const z of ENDGAME_REGIONS)for(let level=z.level;level<Math.min(MAX_LEVEL,z.maxLevel+1);level++){
  const reward=Math.max(...z.mobs.map(id=>combatExperience(MONSTERS[id].xp,level,MONSTERS[id].level)));
  assert.ok(Math.ceil(xpRequired(level)/reward)<=37,`${z.id} Lv.${level} has an appropriate enemy`);
 }
 for(let level=25;level<35;level++){
  const m=MONSTERS.clock_golem,reward=combatExperience(m.xp,level,m.level);
  assert.ok(Math.ceil(xpRequired(level)/reward)<=36,'existing observatory bridges to first late field');
 }
});

test('old level/XP/items/allocations survive loading; level 200 allocations retain all 796 points',async()=>{
 const {newCharacter,hydrate,serialize}=await import('../server/game.js');
 const old=newCharacter('legacy-balance','기존 모험가','mage');
 old.level=30;old.xp=5605;old.inventory.astral_staff=1;old.equipment.weapon='astral_staff';
 old.attributes={str:0,dex:0,int:100,vit:16,luk:0};old.enhancements.astral_staff=7;
 const restored=hydrate(serialize(old));
 assert.equal(restored.level,30);assert.equal(restored.xp,5605);
 assert.deepEqual(restored.inventory,old.inventory);assert.deepEqual(restored.equipment,old.equipment);
 assert.deepEqual(restored.attributes,old.attributes);assert.equal(restored.enhancements.astral_staff,7);
 const attrs={str:400,dex:0,int:96,vit:300,luk:0};
 assert.equal(statBudget(200),796);assert.equal(statBudget(300),796);
 assert.deepEqual(cleanAttributes(attrs,200),attrs);assert.equal(freePoints({level:200,attributes:attrs}),0);
 restored.level=200;restored.attributes=attrs;
 assert.deepEqual(hydrate(serialize(restored)).attributes,attrs);
});

test('the last level threshold is enforced and level/XP never roll past the cap',async()=>{
 const {game,p}=await setup(199);
 p.xp=xpRequired(199)-10;game.giveXP(p,9);
 assert.equal(p.level,199);game.giveXP(p,1);assert.equal(p.level,200);assert.equal(p.xp,0);
 game.giveXP(p,xpRequired(200)*3);
 assert.equal(p.level,200);assert.equal(p.xp,xpRequired(200));
});

test('server loot awards the new field material/weapon/charm and reports the actual earned XP once',async()=>{
 const {game,p,messages}=await setup(35),z=ENDGAME_REGIONS[0];
 p.zone=z.id;p.x=ZONES[z.id].spawn[0]*32+16;p.y=ZONES[z.id].spawn[1]*32+16;
 const ordinary=game.makeMob('late-test-normal',z.mobs[0],p.x+20,p.y);
 ordinary.contributors.set(p.id,game.now);game.killMob(z.id,ordinary);
 assert.equal(p.inventory[z.material],1);
 assert.equal(p.inventory[weaponFor(z.gearTier,p.classId)],1);
 assert.equal(p.xp,MONSTERS[z.mobs[0]].xp);
 const boss=game.makeMob('late-test-boss',z.boss,p.x+20,p.y),before=p.xp;
 boss.contributors.set(p.id,game.now);game.killMob(z.id,boss);
 const paid=combatExperience(MONSTERS[z.boss].xp,35,MONSTERS[z.boss].level,{boss:true});
 assert.equal(p.xp-before,paid);assert.equal(p.inventory[z.gearTier+'_charm'],1);
 const loot=messages.filter(m=>m.event==='loot').at(-1);
 assert.equal(loot.data.xp,paid);
 const after=p.xp;game.killMob(z.id,boss);assert.equal(p.xp,after);
});

test('late crafting works through the existing smith and rejects a player below the equipment level',async()=>{
 const {game,p}=await setup(180,'mage'),z=ENDGAME_REGIONS.at(-1),smith=NPCS.find(n=>n.kind==='craft');
 Object.assign(p,{zone:smith.zone,x:smith.x,y:smith.y});
 const recipe=RECIPES.find(r=>r.id===z.gearTier+'_weapon');
 p.gold=recipe.gold;for(const [id,n]of Object.entries(recipe.cost))p.inventory[id]=n;
 p.level=179;assert.equal(game.action(p,{type:'craft',id:recipe.id}).ok,false);
 p.level=180;assert.equal(game.action(p,{type:'craft',id:recipe.id}).ok,true);
 assert.equal(p.inventory[weaponFor(z.gearTier,'mage')],1);assert.equal(p.gold,0);
 for(const id of Object.keys(recipe.cost))assert.equal(p.inventory[id],0);
});

test('daily XP remains fixed rather than scaling free low-level tasks to a level 200 payout',()=>{
 assert.deepEqual(DAILY_TASKS.map(t=>t.xp),[300,160,400]);
 assert.ok(DAILY_TASKS.every(t=>t.xp<xpRequired(100)*.01));
});
