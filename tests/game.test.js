import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Game,newCharacter,serialize,hydrate} from '../server/game.js';
import {CLASSES,ITEMS,QUESTS,RECIPES,ZONES,MONSTERS,NPCS,getStats,MAX_LEVEL} from '../shared/content.js';
import {createMap,findPath,isBlocked,moveEntity,dist,PORTALS,BOSS_SPAWNS} from '../shared/world.js';

function setup(cls='guardian'){
  const events=[];const g=new Game({random:()=>.5,send:(id,event,data)=>events.push({id,event,data})});
  const p=g.addPlayer(newCharacter(randomUUID(),'Tester',cls));return {g,p,events};
}
function near(p,kind){const n=NPCS.find(x=>x.kind===kind);Object.assign(p,{zone:n.zone,x:n.x,y:n.y});}
function encounter(g,p,type='slime'){
  p.zone='forest';p.x=30*32+16;p.y=33*32+16;
  const m=g.makeMob('testmob',type,p.x+32,p.y);
  g.worlds.get('forest').mobs=[m];return m;
}
function kill(g,p,type){const m=encounter(g,p,type);m.contributors.set(p.id,g.now);g.killMob(p.zone,m);return m;}

test('all professions have valid family equipment and full vital statistics',()=>{
  for(const cls of Object.keys(CLASSES)){const p=newCharacter(randomUUID(),'Test',cls),s=getStats(p);assert.equal(p.hp,s.maxHp);assert.equal(p.mp,s.maxMp);assert.equal(ITEMS[p.equipment.weapon].class,CLASSES[cls].family||cls);}
});
test('save serialization excludes tokens, movement input, party and action-cache runtime state',()=>{
  const {p}=setup();p.access_token='secret';p.actions.set('abc',{ok:true});const s=serialize(p);
  for(const key of ['access_token','input','partyId','actions','cooldowns'])assert.equal(s[key],undefined);
  s.inventory.potion=999;assert.equal(p.inventory.potion,8);
});
test('persisted dead or invalid-zone characters recover at safe coordinates',()=>{
  const s=newCharacter(randomUUID(),'Test','guardian');s.zone='citadel';s.hp=0;
  const p=hydrate(s);assert.equal(p.zone,'town');assert.ok(p.hp>0);assert.equal(isBlocked(createMap('town'),p.x,p.y),false);
  s.zone='bad';s.x=NaN;s.y=Infinity;assert.ok(Number.isFinite(hydrate(s).x));
});
test('all twelve maps have reachable portals, NPCs, boss arenas, resources and chests',()=>{
  for(const [id,z]of Object.entries(ZONES)){
    const map=createMap(id),from={x:z.spawn[0]*32+16,y:z.spawn[1]*32+16};
    assert.equal(isBlocked(map,from.x,from.y),false);
    const targets=[...map.portals,...map.npcs,...map.resources,...map.chests];
    if(BOSS_SPAWNS[id])targets.push(BOSS_SPAWNS[id]);
    for(const dest of targets){assert.equal(isBlocked(map,dest.x,dest.y,8),false,`${id}:${dest.id||'boss'} blocked`);assert.ok(findPath(map,from,dest).length>0,`${id}:${dest.id||'boss'} unreachable`);}
  }
});
test('shared collisions prevent fast movement tunneling across a wall',()=>{
  const map={w:8,h:8,blocked:new Uint8Array(64)};for(let y=0;y<8;y++)map.blocked[y*8+4]=1;
  const p={x:64,y:80};moveEntity(map,p,1000,0,10);assert.ok(p.x<128);assert.equal(isBlocked(map,p.x,p.y),false);
});
test('movement input normalizes speed and rejects NaN/Infinity',()=>{
  const {g,p}=setup();g.setInput(p,{x:9999,y:9999});assert.ok(Math.abs(Math.hypot(p.input.x,p.input.y)-1)<1e-8);
  const before={...p.input};g.setInput(p,{x:Infinity,y:NaN});assert.deepEqual(p.input,before);
  const x=p.x,y=p.y;g.tick(.05,g.now+50);assert.ok(dist(p,{x,y})<=getStats(p).speed*.051);
  g.tick(.05,g.now+1000);assert.equal(p.moving,false);
});
test('combat validates cooldowns, range, locked skills, MP and target health',()=>{
  const {g,p}=setup(),m=encounter(g,p);
  assert.equal(g.action(p,{type:'attack',skill:'ultimate'}).ok,false);
  assert.equal(g.attack(p,'basic').ok,true);const hp=m.hp;assert.ok(hp<m.maxHp);
  assert.equal(g.attack(p,'basic').ok,false);assert.equal(m.hp,hp);
  p.mp=0;assert.equal(g.attack(p,'skill1').ok,false);
  p.x-=600;g.now+=1000;assert.equal(g.attack(p,'basic').ok,false);assert.equal(m.hp,hp);
});
test('all classes can defeat an ordinary monster with authoritative attacks',()=>{
  for(const cls of Object.keys(CLASSES)){const {g,p}=setup(cls),m=encounter(g,p);
    for(let i=0;i<12&&m.alive;i++){g.attack(p,'basic');g.now+=1000;}
    assert.equal(m.alive,false);assert.equal(p.kills,1);assert.ok(p.inventory.gel>0);assert.ok(p.gold>100);
  }
});
test('kill rewards are once-only, shared with contributors, never granted to outsiders',()=>{
  const {g,p}=setup(),m=encounter(g,p);
  const b=g.addPlayer(newCharacter(randomUUID(),'Second','mage')),c=g.addPlayer(newCharacter(randomUUID(),'Third','ranger'));
  Object.assign(b,{zone:p.zone,x:p.x,y:p.y});Object.assign(c,{zone:p.zone,x:p.x,y:p.y});
  m.contributors.set(p.id,g.now);m.contributors.set(b.id,g.now);g.killMob(p.zone,m);
  assert.equal(p.kills,1);assert.equal(b.kills,1);assert.equal(c.kills,0);
  const gold=p.gold;g.killMob(p.zone,m);assert.equal(p.gold,gold);
});
test('quest objectives, prerequisite/level gates, once-only claims and repeatable quests',()=>{
  const {g,p}=setup();near(p,'quest');
  assert.equal(g.action(p,{type:'quest',id:'last_star',mode:'accept'}).ok,false);
  assert.equal(g.action(p,{type:'quest',id:'first_light',mode:'accept'}).ok,true);
  assert.equal(g.action(p,{type:'quest',id:'first_light',mode:'claim'}).ok,false);
  for(let i=0;i<5;i++)kill(g,p,'slime');near(p,'quest');
  assert.equal(g.questReady(p,'first_light'),true);
  assert.equal(g.action(p,{type:'quest',id:'first_light',mode:'claim'}).ok,true);
  assert.equal(g.action(p,{type:'quest',id:'first_light',mode:'claim'}).ok,false);
  assert.equal(g.action(p,{type:'quest',id:'first_light',mode:'accept'}).ok,false);
  assert.equal(g.action(p,{type:'quest',id:'bounty',mode:'accept'}).ok,true);
  g.progress(p,'kill','slime',12);
  assert.equal(g.action(p,{type:'quest',id:'bounty',mode:'claim'}).ok,true);
  assert.equal(g.action(p,{type:'quest',id:'bounty',mode:'accept'}).ok,true);
});
test('portals enforce level and arrival immunity',()=>{
  const {g,p}=setup(),portal=PORTALS.forest.find(x=>x.to==='ruins');
  Object.assign(p,{zone:'forest',x:portal.x,y:portal.y});
  assert.equal(g.interact(p,portal.id).ok,false);assert.equal(p.zone,'forest');
  p.level=5;g.now+=1000;assert.equal(g.interact(p,portal.id).ok,true);assert.equal(p.zone,'ruins');assert.ok(p.invulnerableUntil>g.now);
});
test('gathering node has a shared cooldown, chests have independent once-only rewards',()=>{
  const {g,p}=setup(),b=g.addPlayer(newCharacter(randomUUID(),'Second','mage')),w=g.worlds.get('forest'),n=w.nodes[0];
  for(const who of [p,b])Object.assign(who,{zone:'forest',x:n.x,y:n.y});
  assert.equal(g.interact(p,n.id).ok,true);assert.equal(g.interact(b,n.id).ok,false);
  g.now+=46000;assert.equal(g.interact(b,n.id).ok,true);
  const chest=w.map.chests[0];for(const who of [p,b]){g.now+=2000;Object.assign(who,{x:chest.x,y:chest.y});assert.equal(g.interact(who,chest.id).ok,true);}
  g.now+=2000;assert.equal(g.interact(p,chest.id).ok,false);
});
test('inventory rejects remote purchases, invalid quantities, foreign or unowned gear',()=>{
  const {g,p}=setup();Object.assign(p,{zone:'forest'});
  assert.equal(g.action(p,{type:'buy',id:'potion',count:1}).ok,false);near(p,'shop');
  for(const n of [-1,0,1.5,100,Infinity,NaN])assert.equal(g.action(p,{type:'buy',id:'potion',count:n}).ok,false);
  const gold=p.gold;assert.equal(g.action(p,{type:'buy',id:'potion',count:2}).ok,true);assert.equal(p.gold,gold-40);
  assert.equal(g.action(p,{type:'equip',id:'dawn_sword'}).ok,false);
  p.inventory.oak_bow=1;assert.equal(g.action(p,{type:'equip',id:'oak_bow'}).ok,false);
  assert.equal(g.action(p,{type:'sell',id:p.equipment.weapon,count:1}).ok,false);
});
test('crafting and the first three guaranteed enhancement levels consume materials',()=>{
  const {g,p}=setup();near(p,'craft');p.gold=5000;p.level=15;for(const id of Object.keys(ITEMS))if(ITEMS[id].type==='material')p.inventory[id]=50;
  assert.equal(g.action(p,{type:'craft',id:'moon_weapon'}).ok,true);assert.equal(p.inventory.moon_sword,1);assert.equal(p.inventory.wood,46);assert.equal(p.inventory.ore,47);
  assert.equal(g.action(p,{type:'equip',id:'moon_sword'}).ok,true);const atk=getStats(p).atk;
  for(let i=1;i<=3;i++){assert.equal(g.action(p,{type:'enhance',id:'moon_sword'}).ok,true);assert.equal(p.enhancements.moon_sword,i);}
  assert.equal(getStats(p).atk,atk+9);assert.equal(g.action(p,{type:'enhance',id:'moon_sword'}).ok,true);assert.equal(p.enhancements.moon_sword,4);
});
test('consumables do not waste items at full HP and enforce cooldowns',()=>{
  const {g,p}=setup();assert.equal(g.action(p,{type:'use',id:'potion'}).ok,false);assert.equal(p.inventory.potion,8);
  p.hp=10;assert.equal(g.action(p,{type:'use',id:'potion'}).ok,true);assert.equal(p.inventory.potion,7);assert.ok(p.hp>10);
  assert.equal(g.action(p,{type:'use',id:'potion'}).ok,false);
});
test('party is capped at four, members cannot invite, nearby party shares kill credit',()=>{
  const {g,p}=setup();const friends=Array.from({length:4},(_,i)=>g.addPlayer(newCharacter(randomUUID(),'Friend'+i,'ranger')));
  for(const b of friends.slice(0,3)){assert.equal(g.action(p,{type:'partyInvite',id:b.id}).ok,true);assert.equal(g.action(b,{type:'partyAccept'}).ok,true);}
  assert.equal(g.action(p,{type:'partyInvite',id:friends[3].id}).ok,false);
  assert.equal(g.action(friends[0],{type:'partyInvite',id:friends[3].id}).ok,false);
  const m=encounter(g,p);for(const b of friends.slice(0,3))Object.assign(b,{zone:p.zone,x:p.x,y:p.y});
  m.contributors.set(p.id,g.now);g.killMob(p.zone,m);assert.ok(friends.slice(0,3).every(b=>b.kills===1));assert.equal(friends[3].kills,0);
  g.leaveParty(p);assert.equal(g.parties.values().next().value.leader,friends[0].id);
});
test('beginner death returns to town without loss and invulnerable dash prevents damage',()=>{
  const {g,p}=setup();encounter(g,p);g.damagePlayer(p,9999);assert.equal(p.hp,0);
  const gold=p.gold;g.tick(.05,g.now+4000);assert.equal(p.zone,'town');assert.equal(p.gold,gold);assert.ok(p.hp>0);
  p.invulnerableUntil=0;g.action(p,{type:'dash'});const hp=p.hp;g.damagePlayer(p,99);assert.equal(p.hp,hp);
});
test('every boss generates telegraphed patterns before damage and respawns',()=>{
  const {g,p}=setup();
  for(const [zone,b]of Object.entries(BOSS_SPAWNS)){
    const w=g.worlds.get(zone),m=w.mobs.find(x=>MONSTERS[x.type].boss);
    Object.assign(p,{zone,x:b.x+20,y:b.y+20,level:15});p.hp=getStats(p).maxHp;p.invulnerableUntil=0;
    let wasHit=false;
    for(let i=0;i<3;i++){
      w.casts=[];p.hp=getStats(p).maxHp;const hp=p.hp;
      g.bossCast(w,m,p);assert.ok(w.casts.length>0);
      for(const c of w.casts)assert.ok(c.ends>g.now);
      g.tick(.05,g.now+1400);wasHit ||= p.hp<hp;g.now+=2500;
    }
    assert.ok(wasHit);p.hp=getStats(p).maxHp;
    m.contributors.set(p.id,g.now);g.killMob(zone,m);assert.equal(m.alive,false);
    p.active=false;g.tick(.05,g.now+121000);assert.equal(m.alive,true);p.active=true;
  }
});
test('private inventory is not present in remote-player snapshots',()=>{
  const {g,p}=setup(),b=g.addPlayer(newCharacter(randomUUID(),'Second','mage'));const s=g.snapshot(p,true);
  assert.ok(s.profile.inventory);assert.equal(s.players[0].id,b.id);assert.equal(s.players[0].inventory,undefined);
});
test('story and frontier quests grant the ending, legendary class weapon and title',()=>{
  for(const cls of Object.keys(CLASSES)){
    const {g,p,events}=setup(cls);
    for(const q of QUESTS.filter(x=>!x.repeatable)){
      p.level=Math.max(p.level,q.level);near(p,'quest');
      assert.equal(g.action(p,{type:'quest',id:q.id,mode:'accept'}).ok,true,q.id);
      q.objectives.forEach(o=>g.progress(p,o.kind,o.target,o.count));
      assert.equal(g.action(p,{type:'quest',id:q.id,mode:'claim'}).ok,true,q.id);
    }
    assert.equal(p.completed.length,QUESTS.filter(q=>!q.repeatable).length);assert.ok(p.titles.includes('새벽을 되찾은 자'));
    assert.ok(events.some(e=>e.event==='questComplete'&&e.data.final));
    assert.ok(Object.entries(p.inventory).some(([id,n])=>n>0&&ITEMS[id].rarity==='legendary'&&ITEMS[id].class===(CLASSES[cls].family||cls)));
    g.giveXP(p,1000000);assert.equal(p.level,MAX_LEVEL);
  }
});
