import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter} from '../server/game.js';
import {MONSTERS,ZONES,QUESTS} from '../shared/content.js';
import {REGION_ECOLOGY,BOSS_BEHAVIORS,ORDINARY_BEHAVIORS} from '../shared/encounters.js';
import {dist,isBlocked} from '../shared/world.js';

function arena(type='wolf',{px=340,py=240,mx=160,my=240}={}){
 const effects=[],g=new Game({random:()=>.51,broadcast:(zone,event,data)=>{if(event==='fx')effects.push(data);}});
 g.now=Date.UTC(2026,0,1,0,12,0);
 const p=g.addPlayer(newCharacter('encounter-player','Encounter tester','guardian'));
 Object.assign(p,{level:200,zone:'forest',x:px,y:py,input:{x:0,y:0},lastInput:0,lastRegen:Number.MAX_SAFE_INTEGER,lastCombat:g.now,invulnerableUntil:0});p.hp=g.stats(p).maxHp;p.mp=g.stats(p).maxMp;
 const w=g.worlds.get('forest'),map={...w.map,id:'forest',w:32,h:24,blocked:new Uint8Array(32*24),terrain:null};
 for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(!x||!y||x===map.w-1||y===map.h-1)map.blocked[y*map.w+x]=1;
 w.map=map;w.casts=[];w.mobs=[];w.encounterProjectiles=[];w.encounterHazards=[];
 const m=g.makeMob('encounter-monster',type,mx,my);w.mobs.push(m);m.target=p.id;
 return {g,p,w,m,effects};
}
function run(g,ms,step=50){for(let left=ms;left>0;left-=step){const amount=Math.min(step,left);g.tick(amount/1000,g.now+amount);}}
function wall(w,x,y0,y1){for(let y=y0;y<=y1;y++)w.map.blocked[y*w.map.w+x]=1;}

test('sixteen provinces have forty-eight species with anatomy, tactics and stable quest/drop IDs',()=>{
 assert.equal(Object.keys(REGION_ECOLOGY).length,16);
 const roster=Object.values(REGION_ECOLOGY).flat();assert.equal(roster.length,48);
 assert.equal(new Set(roster.map(x=>x.id)).size,48);
 assert.ok(new Set(roster.map(x=>x.form)).size>=35,'regional anatomy is not a palette-only reskin');
 assert.equal(new Set(roster.map(x=>x.behavior)).size,9);
 for(const [region,species]of Object.entries(REGION_ECOLOGY)){
  assert.equal(new Set(species.map(x=>x.form)).size,3,region);
  for(const entry of species){
   const m=MONSTERS[entry.id];assert.ok(m,entry.id);assert.equal(m.creature.form,entry.form);
   assert.equal(m.behavior,entry.behavior);assert.ok(m.material);assert.ok(m.hp>0&&m.xp>=0&&m.level>0);
   assert.equal(m.creature.palette.length,5);assert.ok(m.encounterInfo.hint.length>5);
  }
 }
 for(const z of Object.values(ZONES).filter(z=>z.endgame&&z.expedition)){
  z.mobTypes.forEach((type,i)=>assert.equal(MONSTERS[type].ecology.species,REGION_ECOLOGY[z.province][i].id));
  assert.ok(BOSS_BEHAVIORS[MONSTERS[z.boss].encounter]);
 }
 for(const q of QUESTS)for(const objective of q.objectives||[])if(objective.kind==='kill'&&objective.target!=='any')assert.ok(MONSTERS[objective.target],q.id);
});

test('ordinary AI commits to nine genuinely different windup and action families through Game.tick',()=>{
 const cases={wolf:'melee',crab:'charge',shell_guard:'ranged',hare:'leap',sand_guard:'burrow',siren:'fan',scarab:'poison',sprout:'summon',ice_guard:'guard'},seen=new Set();
 for(const [type,kind]of Object.entries(cases)){
  const {g,p,w,m}=arena(type,{px:200}),hp=p.hp;run(g,50);
  const pose=g.snapshot(p).mobs.find(x=>x.id===m.id).encounterPose;
  assert.equal(pose.kind,kind,type);assert.equal(pose.stage,'windup',type);seen.add(pose.kind);
  assert.ok(w.casts.length>0);assert.ok(w.casts.every(c=>c.ends>g.now));
  assert.equal(p.hp,hp,'windup cannot damage');
 }
 assert.equal(seen.size,Object.keys(ORDINARY_BEHAVIORS).length);
});

test('charge locks its direction, moves a real body, can be sidestepped and never tunnels through a wall',()=>{
 const {g,p,w,m,effects}=arena('crab',{px:250});wall(w,9,2,20);run(g,50);
 const warning=w.casts[0];assert.equal(warning.op,'charge');assert.ok(warning.length<210,'wall truncates the published lane');
 const locked=warning.angle,hp=p.hp;p.y=360;run(g,1600);
 assert.equal(warning.angle,locked);assert.equal(p.hp,hp,'sidestepping avoids the moving hitbox');
 assert.ok(m.x>200,'charge changes authoritative position');assert.ok(m.x<9*32-11);assert.equal(isBlocked(w.map,m.x,m.y,12),false);
 assert.equal(g.encounters.viewMob(m).stage,'recover');
 assert.ok(g.encounters.viewMob(m).ends-g.encounters.viewMob(m).starts>=1500,'hitting a wall adds a real counterattack window');
 assert.ok(effects.some(e=>String(e.castId).endsWith(':launch')));assert.ok(effects.some(e=>String(e.castId).endsWith(':finish')));
});

test('projectiles have flight time, can hit a stationary target, and are stopped by actual cover',()=>{
 for(const cover of [false,true]){
  const {g,p,w}=arena('shell_guard'),hp=p.hp;run(g,50);run(g,950);
  assert.ok(w.encounterProjectiles.length>0);assert.equal(p.hp,hp,'a warning line is not instant beam damage');
  if(cover)wall(w,8,2,20);
  run(g,1100);
  assert.equal(w.encounterProjectiles.length,0);
  if(cover)assert.equal(p.hp,hp,'wall must intercept a flying shot');else assert.ok(p.hp<hp,'an unobstructed shot really deals server damage');
 }
});

test('a poison field remains dangerous after its windup, but death removes it immediately',()=>{
 const {g,p,w,m}=arena('scarab');run(g,50);const told=point(w.casts[0]);p.y+=130;run(g,1200);
 const hazard=w.encounterHazards[0];assert.ok(hazard);assert.ok(hazard.ends>g.now);assert.equal(hazard.x,told.x);
 const hp=p.hp;p.x=hazard.x;p.y=hazard.y;run(g,950);assert.ok(p.hp<hp,'entering the active field causes damage');
 g.killMob(w.id,m);assert.equal(w.encounterHazards.length,0);assert.equal(w.encounterProjectiles.length,0);
});

test('burrow and leap publish fixed landing locations and have different visible body poses',()=>{
 for(const [type,kind]of [['sand_guard','burrow'],['hare','leap']]){
  const {g,p,w,m}=arena(type,{px:300});run(g,50);
  const landing=w.casts.find(c=>c.op==='burrow'||c.op==='leapImpact'),destination={x:landing.x,y:landing.y};
  p.y=390;run(g,800);
  const pose=g.encounters.viewMob(m);assert.equal(pose.kind,kind);
  if(kind==='burrow')assert.equal(pose.burrowed,true);else assert.equal(pose.stage,'strike');
  run(g,600);assert.ok(dist(m,destination)<2);assert.equal(g.encounters.viewMob(m).stage,'recover');
 }
});

test('summoned guards are capped, expire, grant no repeatable rewards and disappear with their owner',()=>{
 const {g,p,w,m}=arena('sprout');run(g,50);run(g,1400);
 let children=w.mobs.filter(x=>x.encounterSummon);assert.equal(children.length,1);
 const rewards={xp:p.xp,gold:p.gold,kills:p.kills};children[0].contributors.set(p.id,g.now);g.killMob(w.id,children[0]);
 assert.deepEqual({xp:p.xp,gold:p.gold,kills:p.kills},rewards,'adds do not count as farmable kills');
 for(let i=0;i<8;i++)g.encounters.spawnAdds(w,m,{adds:['sprout'],count:3,theme:'nature'});
 children=w.mobs.filter(x=>x.encounterSummon&&x.alive);assert.equal(children.length,2);
 assert.ok(children.every(x=>x.encounterBehavior!=='summon'),'summons cannot recursively multiply');
 children[0].encounterSummon.expires=g.now;g.encounters.tickWorld(w,[p],.05);
 assert.equal(w.mobs.filter(x=>x.encounterSummon&&x.alive).length,1);
 g.killMob(w.id,m);assert.equal(w.mobs.filter(x=>x.encounterSummon&&x.alive).length,0);
});

test('pursuit takes a navigable route around a wall rather than standing against it',()=>{
 const {g,p,w,m}=arena('wolf',{px:370});wall(w,8,4,12);m.nextAttack=Infinity;
 let wasAbove=false;for(let i=0;i<180;i++){run(g,50);wasAbove||=m.y<4*32;assert.equal(isBlocked(w.map,m.x,m.y,12),false);}
 assert.ok(wasAbove,'the monster used the upper opening');assert.ok(m.x>9*32);assert.ok(dist(m,p)<80);
});

test('stunning a windup cancels its hit and the monster resumes after recovery',()=>{
 const {g,p,w,m}=arena('wolf',{px:200});run(g,50);assert.ok(w.casts.length);
 m.stunUntil=g.now+1400;const hp=p.hp;run(g,700);assert.equal(w.casts.length,0);assert.equal(p.hp,hp);
 run(g,1350);assert.ok(w.casts.length||m.encounterState?.action,'stun cannot leave a permanent orphaned windup');
});

test('boss signatures combine movement, summons, delayed memories and persistent danger',()=>{
 assert.ok(Object.keys(BOSS_BEHAVIORS).length>=26);
 const signatures=new Set();
 for(const [type,profile]of Object.entries(BOSS_BEHAVIORS)){
  assert.ok(profile.sequences.length>=2,type);assert.ok(profile.sequences.every(s=>s.length>=2),type);
  assert.ok(new Set(profile.sequences.flat().map(x=>x.kind)).size>=3,type);
  signatures.add(profile.sequences.map(s=>s.map(x=>x.kind).join('/')).join('|'));
  const {g,p,w,m}=arena(type,{px:230});g.bossCast(w,m,p);
  assert.ok(w.casts.length,type);assert.ok(m.encounterState.queue.length,type);
  const initial=m.encounterState.action.kind;p.invulnerableUntil=g.now+30000;
  run(g,4500);assert.ok(m.encounterState.sequence>=1);
  assert.ok(m.encounterState.action||m.nextAttack>g.now,type+' has a finite recovery/cooldown');
  assert.notEqual(initial,undefined);
 }
 assert.ok(signatures.size>=23,'bosses do not share one renamed shape cycle');
});

test('70/35 transformations cap burst damage, clear danger and protect the player before changed phases',()=>{
 const {g,p,w,m}=arena('thorn_stag',{px:200});
 const initialMax=m.maxHp,first=g.encounters.damageAmount(m,999999);assert.equal(first,initialMax-Math.ceil(initialMax*.7));m.hp-=first;
 g.encounters.hazard(w,m,{x:p.x,y:p.y,radius:100,damage:9999,theme:'nature',group:'old'});run(g,50);
 assert.equal(m.encounterPhase,2);assert.ok(m.encounterTransition.ends>g.now);assert.equal(w.encounterHazards.length,0);
 const snapshot=g.snapshot(p);assert.equal(snapshot.encounter.phaseTransition.phase,2);assert.equal(snapshot.mobs.find(x=>x.id===m.id).encounterPose.phase,2);
 const hp=p.hp;g.damagePlayer(p,999999);assert.equal(p.hp,hp);assert.equal(g.encounters.damageAmount(m,100),0);assert.equal(g.canDamage(p,m),false);
 run(g,1850);assert.equal(g.canDamage(p,m),true);
 g.bossCast(w,m,p);assert.ok(m.encounterState.queue.some(x=>x.phaseMove),'phase 2 changes the combo');
 m.hp-=g.encounters.damageAmount(m,999999);assert.equal(m.hp,Math.ceil(initialMax*.35));run(g,50);assert.equal(m.encounterPhase,3);
 assert.ok(m.encounterTransition.ends>g.now);run(g,1850);g.bossCast(w,m,p);assert.ok(m.encounterState.queue.some(x=>x.phaseMove));
 assert.equal(g.encounters.damageAmount(m,999999),999999,'final phase permits defeat');
});

test('world boss transformation finishes before the existing objective mechanic begins',()=>{
 const {g,p,w,m}=arena('world_glacier',{px:200});m.worldKey='test-live';m.expiresAt=g.now+60000;
 m.hp=Math.ceil(m.maxHp*.7);run(g,50);
 assert.equal(m.encounterPhase,2);assert.ok(!m.bossMechanic?.active);
 run(g,1950);assert.equal(m.bossMechanic?.active,true);assert.equal(m.bossMechanic.kind,'glacier');
 assert.ok(w.mobs.some(x=>x.mechanicObjective));assert.equal(w.casts.some(c=>c.encounter&&c.owner===m.id),false);
});

test('a delayed frame resolves an old multi-mark volley once and still leaves a full recovery window',()=>{
 const {g,p,w,m}=arena('moon_witch',{px:205});
 let hits=0;const damage=g.damagePlayer.bind(g);g.damagePlayer=(player,amount)=>{hits++;damage(player,amount);};
 g.bossCast(w,m,p);assert.equal(w.casts.length,3);
 g.tick(.05,g.now+5500);
 assert.equal(hits,1,'expired overlapping marks cannot deal an accumulated burst after a stalled frame');
 const pose=g.encounters.viewMob(m);assert.equal(pose.stage,'recover');assert.ok(pose.ends-g.now>=650);
 assert.equal(w.casts.filter(c=>c.encounter&&c.owner===m.id).length,0);
});

test('transformation calls cannot fall back to legacy attacks, and cancelled tells recover safely',()=>{
 const {g,p,w,m}=arena('thorn_stag',{px:200});
 m.hp=Math.ceil(m.maxHp*.7);assert.equal(g.canDamage(p,m),false,'pending health gates cannot grant zero-damage participation');
 run(g,50);g.bossCast(w,m,p);assert.equal(w.casts.length,0,'a cutscene refusal is handled by the encounter manager');
 run(g,1850);g.bossCast(w,m,p);assert.ok(w.casts.length);w.casts=[];
 run(g,2000);assert.equal(g.encounters.viewMob(m).stage,'recover','external tell cancellation cannot freeze AI forever');
});

test('empty regions clear transient dangers and private encounters are left to their own managers',()=>{
 const {g,p,w,m}=arena('scarab');run(g,50);run(g,1200);assert.ok(w.encounterHazards.length);
 g.encounters.spawnAdds(w,m,{adds:['wolf'],count:1,theme:'nature'});assert.ok(w.mobs.some(x=>x.encounterSummon));
 p.zone='town';run(g,50);assert.equal(w.encounterHazards.length,0);assert.equal(w.encounterProjectiles.length,0);assert.equal(w.mobs.some(x=>x.encounterSummon),false);
 const dungeon=g.makeMob('private','dungeon_arke',160,240);dungeon.dungeonRun='private-run';
 assert.equal(g.encounters.tickMob(w,dungeon,[p],.05),false);assert.equal(g.encounters.startBoss(w,dungeon,p),false);
 assert.equal(g.encounters.resolveCast(w,{dungeonRun:'private-run',owner:dungeon.id},[p]),false);
});

function point(p){return {x:p.x,y:p.y};}
