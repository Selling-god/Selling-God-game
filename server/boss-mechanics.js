import {MONSTERS} from '../shared/content.js';
import {dist,findSafePosition} from '../shared/world.js';

const THRESHOLDS=[.70,.35];
const QUADRANTS=[{x:-1,y:-1,name:'북서 ↖'},{x:1,y:-1,name:'북동 ↗'},{x:1,y:1,name:'남동 ↘'},{x:-1,y:1,name:'남서 ↙'}];
const TITLES={tempest:'천둥 접지',leviathan:'세 겹의 해일',glacier:'빙벽의 핵',eclipse:'회전하는 월식'};
const playersNear=(game,world,center)=>[...game.players.values()].filter(p=>p.active&&p.hp>0&&p.zone===world.id&&dist(p,center)<=620);
const objectives=(world,boss)=>world.mobs.filter(m=>m.mechanicOwner===boss.id&&m.alive);
const announce=(game,world,message)=>game.broadcast(world.id,'worldNotice',{message});

function removeObjectives(game,world,boss){
 const removed=new Set();
 for(const m of world.mobs)if(m.mechanicOwner===boss.id){m.alive=false;m.hp=0;m.respawnAt=Infinity;removed.add(m.id);}
 if(removed.size){
  world.mobs=world.mobs.filter(m=>!removed.has(m.id));
  for(const p of game.players.values())if(removed.has(p.target))p.target=null;
 }
}
function cancel(game,world,boss){
 removeObjectives(game,world,boss);
 world.casts=world.casts.filter(c=>c.owner!==boss.id);
 boss.bossMechanic=null;boss.castUntil=0;boss.nextAttack=game.now+1500;
}
function finish(game,world,boss,result){
 const mechanic=boss.bossMechanic;if(!mechanic?.active)return;
 removeObjectives(game,world,boss);
 mechanic.active=false;mechanic.result=result;mechanic.ends=game.now;mechanic.expires=game.now+2200;
 mechanic.charges?.clear();
 boss.mechanicPhase=mechanic.phase;boss.mechanicCooldown=game.now+2500;
 boss.castUntil=game.now+800;boss.nextAttack=game.now+1600;
 announce(game,world,result==='success'?`${TITLES[mechanic.kind]} 돌파! 보스의 빈틈을 노리세요.`:`${TITLES[mechanic.kind]} 종료. 다음 패턴에 대비하세요.`);
}
function punish(game,players,safe,fraction){
 let missed=0;
 for(const p of players){
  if(safe(p))continue;
  // A failed objective is survivable at full HP; ordinary defense, guard and immunity still apply.
  const stats=game.stats(p);game.damagePlayer(p,stats.maxHp*fraction+stats.def*.65);missed++;
 }
 return missed;
}
function marker(map,center,dx,dy,radius=42){
 const point=findSafePosition(map,{x:center.x+dx,y:center.y+dy},10);
 return point?{...point,radius}:null;
}
function start(game,world,boss,phase,players){
 const kind=MONSTERS[boss.type]?.pattern;if(!TITLES[kind])return;
 const center={x:boss.homeX,y:boss.homeY},now=game.now;
 const mechanic={active:true,kind,phase,x:center.x,y:center.y,starts:now,stepStarts:now,step:0,missed:0,markers:[]};
 boss.x=center.x;boss.y=center.y;boss.moving=false;
 world.casts=world.casts.filter(c=>c.owner!==boss.id);
 if(kind==='tempest'){
  const offsets=phase===1?[[-112,0],[112,0],[0,-112],[0,112]]:[[-96,-64],[96,64]];
  mechanic.markers=offsets.map(([x,y])=>marker(world.map,center,x,y)).filter(Boolean);
  mechanic.charges=new Map();mechanic.ends=now+(phase===1?6500:6000);
  mechanic.instruction='빛나는 접지 룬 안에서 1.2초 동안 머무르세요.';
 }else if(kind==='leviathan'){
  mechanic.sequence=phase===1?['inner','outer','inner']:['outer','inner','outer'];
  mechanic.interval=phase===1?2800:2500;mechanic.nextPulse=now+3800;
  mechanic.ends=mechanic.nextPulse+mechanic.interval*2;
  mechanic.instruction='초록색 안전 구역이 안쪽과 바깥쪽으로 번갈아 바뀝니다.';
 }else if(kind==='glacier'){
  mechanic.ends=now+(phase===1?12500:14500);
  mechanic.instruction='빙벽의 핵을 모두 공격해 파괴하세요. 보스는 피해를 85% 덜 받습니다.';
  const offsets=phase===1?[[-112,48],[112,48]]:[[-112,48],[112,48],[0,-112]];
  const averageAttack=players.reduce((sum,p)=>sum+game.stats(p).atk,0)/Math.max(1,players.length);
  const hp=Math.max(80,Math.round(averageAttack*3.5*Math.max(1,players.length*.6)));
  for(const [i,[dx,dy]] of offsets.entries()){
   const point=marker(world.map,center,dx,dy,24);if(!point)continue;
   const crystal=game.makeMob(`${boss.id}_crystal_${phase}_${i}`,'frost_wisp',point.x,point.y);
   crystal.hp=crystal.maxHp=hp;crystal.mechanicObjective='ice_crystal';crystal.mechanicOwner=boss.id;
   crystal.respawnAt=Infinity;world.mobs.push(crystal);
  }
 }else{
  mechanic.sequence=phase===1?[0,1,2,3]:[2,1,0,3];
  mechanic.interval=phase===1?3000:2700;mechanic.nextPulse=now+4000;
  mechanic.ends=mechanic.nextPulse+mechanic.interval*3;
  mechanic.instruction='초록색 구역으로 순서대로 이동하세요. 중앙 십자선은 위험합니다.';
 }
 boss.bossMechanic=mechanic;boss.castUntil=mechanic.ends+1;boss.nextAttack=mechanic.ends+1600;
 announce(game,world,`${MONSTERS[boss.type].name} · ${phase}단계 — ${mechanic.instruction}`);
}

/** Called before ordinary mob AI, including for empty worlds so abandoned objectives disappear. */
export function tickBossMechanics(game,world,now=game.now){
 const bosses=world.mobs.filter(m=>m.worldKey&&MONSTERS[m.type]?.worldBoss);
 const present=new Set(bosses.filter(m=>m.alive&&m.hp>0&&(!m.expiresAt||m.expiresAt>now)).map(m=>m.id));
 const orphans=new Set();
 for(const m of world.mobs)if(m.mechanicObjective&&!present.has(m.mechanicOwner)){m.alive=false;m.hp=0;m.respawnAt=Infinity;orphans.add(m.id);}
 if(orphans.size){world.mobs=world.mobs.filter(m=>!orphans.has(m.id));for(const p of game.players.values())if(orphans.has(p.target))p.target=null;}
 for(const boss of bosses){
  const mechanic=boss.bossMechanic;
  if(!present.has(boss.id)){if(mechanic||objectives(world,boss).length)cancel(game,world,boss);continue;}
  const center=mechanic||{x:boss.homeX,y:boss.homeY},players=playersNear(game,world,center);
  if(!players.length){if(mechanic?.active)cancel(game,world,boss);continue;}
  if(!mechanic?.active){
   if(mechanic&&mechanic.expires<=now)boss.bossMechanic=null;
   const phase=boss.mechanicPhase||0;
   if(phase<THRESHOLDS.length&&boss.hp/boss.maxHp<=THRESHOLDS[phase]&&now>=(boss.mechanicCooldown||0))start(game,world,boss,phase+1,players);
   continue;
  }
  boss.castUntil=mechanic.ends+1;boss.nextAttack=mechanic.ends+1600;boss.moving=false;
  if(mechanic.kind==='tempest'){
   const inside=p=>mechanic.markers.some(mark=>dist(p,mark)<=mark.radius);
   const ids=new Set(players.map(p=>p.id));
   for(const id of mechanic.charges.keys())if(!ids.has(id))mechanic.charges.delete(id);
   for(const p of players){if(inside(p)){if(!mechanic.charges.has(p.id))mechanic.charges.set(p.id,now);}else mechanic.charges.delete(p.id);}
   if(now>=mechanic.ends){
    const missed=punish(game,players,p=>inside(p)&&now-(mechanic.charges.get(p.id)??Infinity)>=1200,mechanic.phase===1?.40:.50);
    game.fx(world.id,{type:'impact',x:mechanic.x,y:mechanic.y,radius:240,shape:'circle',boss:true,theme:'thunder'});
    finish(game,world,boss,missed?'failed':'success');
   }
  }else if(mechanic.kind==='glacier'){
   if(!objectives(world,boss).length){finish(game,world,boss,'success');continue;}
   if(now>=mechanic.ends){
    punish(game,players,()=>false,mechanic.phase===1?.45:.55);
    game.fx(world.id,{type:'impact',x:mechanic.x,y:mechanic.y,radius:240,shape:'circle',boss:true,theme:'ice'});
    finish(game,world,boss,'failed');
   }
  }else if(now>=mechanic.nextPulse){
   const step=mechanic.sequence[mechanic.step];
   if(mechanic.kind==='leviathan'){
    const safe=p=>step==='inner'?dist(p,mechanic)<=82:dist(p,mechanic)>=128;
    mechanic.missed+=punish(game,players,safe,mechanic.phase===1?.28:.34);
    game.fx(world.id,{type:'impact',x:mechanic.x,y:mechanic.y,radius:step==='inner'?280:128,inner:step==='inner'?82:0,shape:step==='inner'?'ring':'circle',boss:true,theme:'water'});
   }else{
    const quadrant=QUADRANTS[step];
    mechanic.missed+=punish(game,players,p=>(p.x-mechanic.x)*quadrant.x>=12&&(p.y-mechanic.y)*quadrant.y>=12&&dist(p,mechanic)<=210,mechanic.phase===1?.25:.30);
    game.fx(world.id,{type:'impact',owner:boss.id,castId:`${boss.id}:eclipse:${mechanic.phase}:${mechanic.step}:${mechanic.nextPulse}`,x:mechanic.x,y:mechanic.y,radius:210,shape:'quadrant',quadrant:step,safeQuadrant:step,boss:true,theme:'void',monster:boss.type});
   }
   mechanic.step++;
   if(mechanic.step>=mechanic.sequence.length){finish(game,world,boss,mechanic.missed?'failed':'success');continue;}
   // After a delayed server frame, give a full warning for the next wave instead of stacking hits.
   mechanic.stepStarts=now;mechanic.nextPulse=now+mechanic.interval;
   mechanic.ends=mechanic.nextPulse+(mechanic.sequence.length-mechanic.step-1)*mechanic.interval;
   boss.castUntil=mechanic.ends+1;boss.nextAttack=mechanic.ends+1600;
  }
 }
}

export function bossDamageMultiplier(m){return m.bossMechanic?.active&&m.bossMechanic.kind==='glacier' ? .15 : 1;}

/** Return true for crystals: ordinary loot, XP, kill quests and respawn must not run. */
export function bossMechanicKilled(game,world,m){
 if(m.mechanicObjective){
  m.alive=false;m.hp=0;m.respawnAt=Infinity;
  const boss=world.mobs.find(b=>b.id===m.mechanicOwner&&b.alive);
  if(boss){
   for(const [id,damage] of m.damageLog||[]){
    boss.contributors.set(id,game.now);boss.damageLog.set(id,(boss.damageLog.get(id)||0)+Math.min(m.maxHp,damage)*.5);
   }
  }
  game.fx(world.id,{type:'death',id:m.id,monster:m.type,x:m.x,y:m.y,boss:false});
  world.mobs=world.mobs.filter(other=>other.id!==m.id);
  for(const p of game.players.values())if(p.target===m.id)p.target=null;
  if(boss?.bossMechanic?.active&&!objectives(world,boss).length)finish(game,world,boss,'success');
  return true;
 }
 if(m.bossMechanic||objectives(world,m).length)cancel(game,world,m);
 return false;
}

export function bossMechanicView(game,world){
 return world.mobs.filter(m=>m.alive&&m.bossMechanic&&(m.bossMechanic.active||m.bossMechanic.expires>game.now)).map(boss=>{
  const m=boss.bossMechanic,step=m.sequence?.[m.step];
  return {bossId:boss.id,type:boss.type,kind:m.kind,phase:m.phase,title:TITLES[m.kind],active:m.active,result:m.result,
   x:m.x,y:m.y,starts:m.stepStarts,ends:m.nextPulse||m.ends,expires:m.expires,instruction:m.instruction,
   step:m.step,total:m.sequence?.length||1,safe:m.kind==='leviathan'?step:undefined,
   quadrant:m.kind==='eclipse'&&step!==undefined?{...QUADRANTS[step],index:step}:undefined,
   markers:m.markers,charges:m.charges?[...m.charges].map(([id,since])=>({id,progress:Math.min(1,(game.now-since)/1200)})):[],
   crystals:objectives(world,boss).map(c=>({id:c.id,x:c.x,y:c.y,hp:c.hp,maxHp:c.maxHp}))};
 });
}
