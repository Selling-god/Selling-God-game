import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_BOSSES} from '../shared/expansion.js';
import {createMap,isBlocked} from '../shared/world.js';
import {tickBossMechanics,bossDamageMultiplier,bossMechanicKilled,bossMechanicView} from '../server/boss-mechanics.js';
import {Game,newCharacter} from '../server/game.js';
import {bossWindow} from '../server/world-events.js';

function setup(kind){
 const def=WORLD_BOSSES.find(d=>d.id===kind),map=createMap(def.zone),center=map.eventArena;
 const makeMob=(id,type,x,y)=>({id,type,x,y,homeX:x,homeY:y,hp:10000,maxHp:10000,alive:true,moving:false,castUntil:0,nextAttack:0,dots:[],contributors:new Map(),damageLog:new Map(),supportLog:new Map()});
 const boss=makeMob('boss',def.type,center.x,center.y);boss.worldKey='test-window';boss.hp=7000;boss.expiresAt=999999;
 const world={id:def.zone,map,mobs:[boss],casts:[{owner:boss.id,id:1},{owner:'another-monster',id:2}]};
 const p={id:'safe',zone:def.zone,active:true,hp:10000,x:center.x-128,y:center.y+64};
 const damage=[],notices=[];
 const game={now:10000,players:new Map([[p.id,p]]),makeMob,stats:()=>({atk:100,maxHp:10000,def:0}),
  damagePlayer:(player,amount)=>{damage.push({id:player.id,amount});player.hp=Math.max(0,player.hp-amount);},
  broadcast:(zone,event,data)=>notices.push({zone,event,data}),fx:()=>{}};
 const tick=time=>{game.now=time;tickBossMechanics(game,world,time);};
 return {game,world,boss,p,damage,notices,tick};
}

test('all four world bosses start their distinct objective at 70%, then only again at 35%',()=>{
 for(const kind of ['tempest','leviathan','glacier','eclipse']){
  const {boss,game,world,tick}=setup(kind);
  boss.hp=7001;tick(10000);assert.equal(boss.bossMechanic,undefined);
  boss.hp=7000;tick(10050);
  assert.equal(boss.bossMechanic.kind,kind);assert.equal(boss.bossMechanic.phase,1);
  assert.ok(boss.bossMechanic.ends-game.now>=6000);
  assert.deepEqual(world.casts.map(c=>c.owner),['another-monster']);
  // Finishing the first objective permits only the lower threshold, regardless of healing.
  bossMechanicKilled(game,world,boss);boss.mechanicPhase=1;boss.hp=3501;
  tick(10100);assert.equal(boss.bossMechanic,null);
  boss.hp=3500;tick(10150);assert.equal(boss.bossMechanic.phase,2);
 }
});

test('lightning requires sustained grounding; leaving the rune removes protection',()=>{
 const {game,world,boss,p,damage,tick}=setup('tempest');tick(10000);
 const mechanic=boss.bossMechanic,spot=mechanic.markers[0];Object.assign(p,{x:spot.x,y:spot.y});
 const q={...p,id:'leaves'},r={...p,id:'outside',x:mechanic.x,y:mechanic.y};
 game.players.set(q.id,q);game.players.set(r.id,r);
 tick(10050);tick(11300);
 const view=bossMechanicView(game,world)[0];assert.equal(view.charges.find(c=>c.id===p.id).progress,1);
 q.x=mechanic.x;q.y=mechanic.y;
 tick(mechanic.ends);
 assert.deepEqual(damage.map(d=>d.id).sort(),['leaves','outside']);
 assert.equal(boss.mechanicPhase,1);assert.equal(boss.bossMechanic.active,false);
 assert.equal(p.hp,10000);
});

test('a completed health threshold cannot be farmed by repeatedly crossing it',()=>{
 const {boss,p,tick}=setup('tempest');tick(10000);
 Object.assign(p,boss.bossMechanic.markers[0]);tick(10050);tick(16500);
 boss.hp=6500;tick(20000);assert.equal(boss.bossMechanic?.active||false,false);
 boss.hp=9000;tick(21000);boss.hp=6500;tick(22000);
 assert.equal(boss.mechanicPhase,1);assert.equal(boss.bossMechanic?.active||false,false);
 boss.hp=3500;tick(23000);assert.equal(boss.bossMechanic.phase,2);
});

test('tides alternate inner and outer safety, with a full warning after a delayed frame',()=>{
 const {game,boss,p,damage,tick}=setup('leviathan');tick(10000);
 const q={...p,id:'wrong'};game.players.set(q.id,q);
 const expected=['inner','outer','inner'];
 for(const mode of expected){
  const m=boss.bossMechanic;assert.equal(m.sequence[m.step],mode);
  p.x=m.x+(mode==='inner'?40:155);p.y=m.y;
  q.x=m.x+(mode==='inner'?155:40);q.y=m.y;
  const deadline=m.nextPulse;tick(deadline+500);
  if(m.active)assert.ok(m.nextPulse-game.now>=2500);
 }
 assert.equal(damage.filter(d=>d.id===p.id).length,0);
 assert.equal(damage.filter(d=>d.id===q.id).length,3);
 assert.equal(boss.bossMechanic.active,false);
});

test('destroying all real, reachable ice crystals removes the shield without normal kill rewards',()=>{
 const {game,world,boss,p,damage,tick}=setup('glacier');tick(10000);
 const crystals=world.mobs.filter(m=>m.mechanicObjective);
 assert.equal(crystals.length,2);assert.equal(bossDamageMultiplier(boss),.15);
 for(const crystal of crystals){
  assert.equal(isBlocked(world.map,crystal.x,crystal.y,10),false);
  crystal.damageLog.set(p.id,crystal.maxHp);crystal.contributors.set(p.id,game.now);
  assert.equal(bossMechanicKilled(game,world,crystal),true,'normal XP, loot and kill quests must be skipped');
 }
 assert.equal(world.mobs.some(m=>m.mechanicObjective),false);
 assert.equal(bossDamageMultiplier(boss),1);assert.equal(boss.bossMechanic.result,'success');
 assert.ok(boss.damageLog.get(p.id)>0,'supporting the objective counts toward boss contribution');
 assert.equal(damage.length,0);
});

test('an unbroken ice shield times out once, deals survivable damage and removes all crystals',()=>{
 const {boss,world,p,damage,tick}=setup('glacier');tick(10000);
 const ends=boss.bossMechanic.ends;tick(ends);
 assert.equal(damage.length,1);assert.ok(p.hp>0&&p.hp<10000);
 assert.equal(world.mobs.length,1);assert.equal(bossDamageMultiplier(boss),1);
 assert.equal(boss.bossMechanic.result,'failed');tick(ends+50);assert.equal(damage.length,1);
});

test('the second glacier phase requires three crystals',()=>{
 const {boss,world,tick}=setup('glacier');boss.mechanicPhase=1;boss.hp=3500;tick(10000);
 assert.equal(world.mobs.filter(m=>m.mechanicObjective).length,3);
 assert.equal(boss.bossMechanic.phase,2);
});

test('eclipse safe quarters rotate; standing at the center is never safe',()=>{
 const {game,world,boss,p,damage,tick}=setup('eclipse');tick(10000);
 const q={...p,id:'center',x:boss.homeX,y:boss.homeY};game.players.set(q.id,q);
 const order=[];
 for(let i=0;i<4;i++){
  const view=bossMechanicView(game,world)[0];order.push(view.quadrant.index);
  p.x=view.x+view.quadrant.x*95;p.y=view.y+view.quadrant.y*95;
  tick(boss.bossMechanic.nextPulse);
 }
 assert.deepEqual(order,[0,1,2,3]);
 assert.equal(damage.filter(d=>d.id===p.id).length,0);
 assert.equal(damage.filter(d=>d.id===q.id).length,4);
 assert.equal(boss.bossMechanic.active,false);
});

test('boss death, event expiry and an empty arena clean up objectives and allow cancellation retry',()=>{
 for(const cause of ['death','expiry','empty']){
  const {game,world,boss,p,tick}=setup('glacier');tick(10000);
  if(cause==='death'){assert.equal(bossMechanicKilled(game,world,boss),false);boss.alive=false;}
  if(cause==='expiry')boss.expiresAt=10001;
  if(cause==='empty')p.active=false;
  tick(10100);
  assert.equal(world.mobs.some(m=>m.mechanicObjective),false,cause);
  assert.equal(boss.bossMechanic,null,cause);
  assert.equal(bossDamageMultiplier(boss),1,cause);
  if(cause==='empty'){
   p.active=true;tick(11000);assert.equal(boss.bossMechanic.phase,1,'abandonment does not complete a threshold');
   assert.equal(world.mobs.filter(m=>m.mechanicObjective).length,2);
  }
 }
});

test('Game integrates shields for hits and DoTs, targetable crystals, snapshots and reward bypass',()=>{
 const def=WORLD_BOSSES.find(d=>d.id==='glacier'),g=new Game({random:()=>.5});
 g.now=3600000*500+def.minute*60000+1000;
 const p=g.addPlayer(newCharacter('mechanic-player','Mechanics','guardian'));p.level=def.level;
 p.hp=g.stats(p).maxHp;p.mp=g.stats(p).maxMp;
 g.events.spawn(def,bossWindow(def,g.now),{status:'active'});
 const world=g.worlds.get(def.zone),boss=world.mobs.find(m=>m.worldEventId===def.id);
 assert.equal(g.events.join(p,def.id).ok,true);
 boss.hp=Math.floor(boss.maxHp*.69);g.tick(.05,g.now+50);
 assert.equal(boss.bossMechanic?.active,true);
 assert.equal(world.casts.some(c=>c.owner===boss.id),false);
 const snapshot=g.snapshot(p);
 assert.equal(snapshot.bossMechanics[0].kind,'glacier');
 assert.equal(snapshot.mobs.filter(m=>m.mechanicObjective).length,2);
 assert.doesNotThrow(()=>JSON.stringify(snapshot));
 p.x=boss.x-30;p.y=boss.y;p.target=boss.id;
 let before=boss.hp;assert.equal(g.attack(p,'basic').ok,true);
 const protectedHit=before-boss.hp;assert.ok(protectedHit>0);
 boss.dots=[{by:p.id,kind:'burn',left:1,next:g.now,damage:100}];
 before=boss.hp;g.tick(.05,g.now+50);assert.equal(before-boss.hp,15);
 const economy={gold:p.gold,xp:p.xp,kills:p.kills};
 for(const crystal of [...world.mobs.filter(m=>m.mechanicObjective)]){
  crystal.hp=1;p.target=crystal.id;p.x=crystal.x-20;p.y=crystal.y;g.now+=1000;
  assert.equal(g.attack(p,'basic').ok,true);assert.equal(crystal.alive,false);
 }
 assert.deepEqual({gold:p.gold,xp:p.xp,kills:p.kills},economy);
 assert.equal(world.mobs.some(m=>m.mechanicObjective),false);assert.equal(bossDamageMultiplier(boss),1);
 p.target=boss.id;p.x=boss.x-30;p.y=boss.y;g.now+=1000;
 before=boss.hp;assert.equal(g.attack(p,'basic').ok,true);
 assert.ok(before-boss.hp>protectedHit*5,'breaking the objective restores ordinary boss damage');
});
