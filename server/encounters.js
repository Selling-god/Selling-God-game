import {MONSTERS,ZONES} from '../shared/content.js';
import {ORDINARY_BEHAVIORS,BOSS_BEHAVIORS} from '../shared/encounters.js';
import {dist,isBlocked,lineOfSight,moveEntity,findPath} from '../shared/world.js';

const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const point=p=>({x:p.x,y:p.y});
const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const PRIVATE=m=>!!(m.challengeRun||m.dungeonRun||m.mechanicObjective);
const phaseOf=m=>m.encounterPhase||1;
const bodyRadius=m=>MONSTERS[m.type]?.boss?16:12;
const directions=[['e',0],['s',Math.PI/2],['w',Math.PI],['n',-Math.PI/2]];
const facing=(m,a)=>{m.dir=directions.reduce((best,item)=>Math.cos(a-item[1])>Math.cos(a-best[1])?item:best,directions[0])[0];};
const PHASE_NAMES=['','잠들어 있던 형상','깨어난 본성','마지막 변이'];

// Authored additions make later phases change tactics, rather than only HP/speed.
const LATE_MOVES={
 moss_guardian:['summon','burrow'],moon_witch:['retreat','echo'],eclipse_dragon:['poison','charge'],thorn_stag:['leap','charge'],
 coral_queen:['pull','poison'],sand_pharaoh:['summon','burrow'],spore_matron:['summon','poison'],snow_sentinel:['wave','charge'],
 sky_seraph:['retreat','leap'],abyss_keeper:['echo','pull'],orion:['summon','fan'],
 sunscar_warden:['poison','charge'],deepsea_warden:['wave','pull'],wildroot_warden:['summon','burrow'],clockwork_warden:['echo','guard'],
 stormcrown_warden:['leap','fan'],voidfront_warden:['burrow','summon'],astralforge_warden:['fan','poison'],dawnend_warden:['echo','leap'],
 world_tempest:['echo','charge'],world_leviathan:['wave','pull'],world_glacier:['poison','leap'],world_eclipse:['summon','burrow'],
 realm_heaven_warden:['fan','echo'],realm_inferno_warden:['charge','poison'],realm_mirror_warden:['retreat','echo']
};
const moveLabels={summon:'변이 · 호위 증원',burrow:'변이 · 지면 추격',retreat:'변이 · 사선 재배치',echo:'변이 · 기억 잔상',poison:'변이 · 잔류 지대',charge:'변이 · 연속 질주',leap:'변이 · 재도약',pull:'변이 · 중심 흡입',wave:'변이 · 전파 파동',fan:'변이 · 다중 사선',guard:'변이 · 반격 내려찍기'};

/** World enemies own their action state; casts are only their readable schedule.
 * Private solo/party encounters and world-boss objective mechanics retain their
 * existing managers. Every damaging action uses the same geometry as its tell.
 */
export class EncounterManager{
 constructor(game){this.game=game;this.sequence=0;}
 state(m){return m.encounterState||(m.encounterState={action:null,queue:[],sequence:0,path:[],pathAt:0,pathGoal:null,history:[],historyAt:0});}
 profile(m){const spec=MONSTERS[m.type];return BOSS_BEHAVIORS[spec?.encounter||m.type];}
 ordinary(m){return ORDINARY_BEHAVIORS[m.encounterBehavior||MONSTERS[m.type]?.behavior||'pursue'];}
 theme(m){return MONSTERS[m.type]?.creature?.theme||'nature';}
 owns(m){return !!MONSTERS[m.type]&&!PRIVATE(m);}
 isTransition(m){return (m.encounterTransition?.ends||0)>this.game.now;}
 canDamage(m){
  if(this.isTransition(m))return false;
  if(!PRIVATE(m)&&this.profile(m)){
   const phase=phaseOf(m),threshold=phase===1?.7:phase===2?.35:0;
   // A hit that reaches a health gate cannot be followed by a zero-damage hit
   // awarding contribution credit in the small interval before the next tick.
   if(threshold&&m.hp<=Math.ceil(m.maxHp*threshold))return false;
  }
  return true;
 }
 damageAmount(m,raw){
  if(!(raw>0)||this.isTransition(m))return 0;
  if(PRIVATE(m)||!this.profile(m))return raw;
  const phase=phaseOf(m),threshold=phase===1?.7:phase===2?.35:0;
  if(!threshold)return raw;
  return Math.max(0,Math.min(raw,m.hp-Math.ceil(m.maxHp*threshold)));
 }
 protects(p){
  const w=this.game.worlds.get(p.zone);
  return !!w?.mobs.some(m=>m.alive&&this.isTransition(m)&&dist(p,m)<520);
 }
 clearOwner(w,m,{adds=false}={}){
  w.casts=w.casts.filter(c=>!(c.encounter&&c.owner===m.id));
  w.encounterProjectiles=(w.encounterProjectiles||[]).filter(c=>c.owner!==m.id);
  w.encounterHazards=(w.encounterHazards||[]).filter(c=>c.owner!==m.id);
  if(adds)for(const child of w.mobs)if(child.encounterSummon?.owner===m.id){
   child.alive=false;child.hp=0;child.respawnAt=Infinity;
   w.casts=w.casts.filter(c=>!(c.encounter&&c.owner===child.id));
   w.encounterProjectiles=w.encounterProjectiles.filter(c=>c.owner!==child.id);
   w.encounterHazards=w.encounterHazards.filter(c=>c.owner!==child.id);
  }
 }
 resetWorld(w){
  w.encounterProjectiles=[];w.encounterHazards=[];w.encounterHitAt=new Map();
  w.casts=w.casts.filter(c=>!c.encounter);
  for(const m of w.mobs){
   if(m.encounterSummon){m.alive=false;m.hp=0;m.respawnAt=Infinity;continue;}
   if(!this.owns(m))continue;
   m.encounterState=null;m.encounterTransition=null;m.target=null;m.castUntil=0;
   m.encounterAttackScale=m.hp/m.maxHp<=.35?1.31:m.hp/m.maxHp<=.7?1.14:1;
   m.encounterPhase=m.hp<=m.maxHp*.35?3:m.hp<=m.maxHp*.7?2:1;
  }
  w.mobs=w.mobs.filter(m=>!m.encounterSummon);
 }
 mobKilled(w,m){
  this.clearOwner(w,m,{adds:true});m.encounterState=null;m.encounterTransition=null;
  if(!m.encounterSummon)return false;
  m.alive=false;m.hp=0;m.respawnAt=Infinity;m.target=null;return true;
 }
 tickWorld(w,players,dt){
  const now=this.game.now;
  w.encounterProjectiles||=[];w.encounterHazards||=[];w.encounterHitAt||=new Map();
  if(!players.length){this.resetWorld(w);return;}
  for(const m of w.mobs){
   if(m.alive&&!PRIVATE(m)&&m.stunUntil>now&&m.encounterState?.interruptedUntil!==m.stunUntil){
    const interrupted=this.state(m);this.clearOwner(w,m);interrupted.action=null;interrupted.queue=[];interrupted.interruptedUntil=m.stunUntil;
    m.castUntil=0;m.nextAttack=Math.max(m.nextAttack,m.stunUntil+400);
   }
   if(m.encounterSummon){
    const owner=w.mobs.find(x=>x.id===m.encounterSummon.owner);
    if(!owner?.alive||m.encounterSummon.expires<=now){this.clearOwner(w,m);m.alive=false;m.hp=0;m.respawnAt=Infinity;}
   }
   if(!m.alive||PRIVATE(m)||!this.profile(m))continue;
   const s=this.state(m),target=players.find(p=>p.id===m.target);
   if(m.bossMechanic?.active&&s.action){this.clearOwner(w,m);s.action=null;s.queue=[];m.castUntil=0;}
   if(target&&now-s.historyAt>=350){s.history.push({...point(target),t:now});s.history=s.history.slice(-6);s.historyAt=now;}
   const desired=m.hp<=Math.ceil(m.maxHp*.35)?3:m.hp<=Math.ceil(m.maxHp*.7)?2:1;
   if(desired>phaseOf(m)&&!this.isTransition(m)&&!m.bossMechanic?.active){
    m.encounterPhase=phaseOf(m)+1;
    this.clearOwner(w,m,{adds:true});s.action=null;s.queue=[];s.path=[];
    const p=this.profile(m),phase=phaseOf(m),extra=LATE_MOVES[MONSTERS[m.type].encounter||m.type]?.[phase-2];
    // The boss cannot be damaged throughout the transformation. Phase 2 and 3
    // increase pressure and unlock distinctly identifiable attacks.
    m.encounterAttackScale=phase===2?1.14:1.31;
    const cutTime=1850;
    m.encounterTransition={id:`phase_${m.id}_${phase}_${now}`,bossId:m.id,name:MONSTERS[m.type].name,title:p.phaseNames?.[phase-1]||PHASE_NAMES[phase],phase,
     starts:now,ends:now+cutTime,theme:this.theme(m),description:`${moveLabels[extra]||'새 연속기'} 등장 · ${phase===3?'폭주 패턴과 연속 공격에 주의하세요.':'공격 리듬이 바뀝니다.'}`};
    m.castUntil=now+cutTime;m.nextAttack=now+cutTime+450;m.moving=false;
    this.game.fx(w.id,{type:'armorBreak',id:m.id,x:m.x,y:m.y,theme:this.theme(m),phase:phase-1});
   }
  }
  // Never let a disappearing owner, objective phase, or occupied cutscene leave
  // invisible damage behind. The reset is scoped to that owner's effects.
  const ownerAlive=id=>{const m=w.mobs.find(x=>x.id===id);return m?.alive&&!this.isTransition(m)&&!m.bossMechanic?.active;};
  w.encounterProjectiles=w.encounterProjectiles.filter(c=>ownerAlive(c.owner)&&c.ends>now);
  w.encounterHazards=w.encounterHazards.filter(c=>ownerAlive(c.owner)&&c.ends>now);
  w.casts=w.casts.filter(c=>!c.encounter||ownerAlive(c.owner));
  for(const projectile of w.encounterProjectiles)this.tickProjectile(w,projectile,players,dt);
  w.encounterProjectiles=w.encounterProjectiles.filter(c=>!c.dead&&c.ends>now);
  for(const hazard of w.encounterHazards){
   if(now<hazard.activeAt||now<hazard.nextTick)continue;
   hazard.nextTick=now+900;
   for(const p of players)if(p.hp>0&&p.zone===w.id&&dist(p,hazard)<hazard.radius+8&&lineOfSight(w.map,hazard,p)&&this.groupHit(w,hazard.group,p.id,800))this.game.damagePlayer(p,hazard.damage);
  }
  for(const [key,expires]of w.encounterHitAt)if(expires<now)w.encounterHitAt.delete(key);
  w.mobs=w.mobs.filter(m=>!(m.encounterSummon&&!m.alive));
 }
 groupHit(w,group,player,duration=400){
  w.encounterHitAt||=new Map();const key=group+':'+player;
  if((w.encounterHitAt.get(key)||0)>this.game.now)return false;
  w.encounterHitAt.set(key,this.game.now+duration);return true;
 }
 shotBlocked(map,x,y){
  const tx=Math.floor(x/32),ty=Math.floor(y/32);
  if(tx<0||ty<0||tx>=map.w||ty>=map.h)return true;
  const i=ty*map.w+tx;
  return map.terrain?.surface?map.terrain.surface[i]===3:!!map.blocked[i];
 }
 tickProjectile(w,c,players,dt){
  const distance=Math.min(.1,Math.max(0,dt))*c.speed,steps=Math.max(1,Math.ceil(distance/7));
  for(let i=0;i<steps&&!c.dead;i++){
   const x=c.x+Math.cos(c.angle)*distance/steps,y=c.y+Math.sin(c.angle)*distance/steps;
   if(this.shotBlocked(w.map,x,y)){
    c.dead=true;this.game.fx(w.id,{type:'impact',castId:c.castId+':wall',owner:c.owner,x:c.x,y:c.y,shape:'circle',radius:18,theme:c.theme,monster:c.monster,boss:c.boss});break;
   }
   c.x=x;c.y=y;
   for(const p of players)if(p.hp>0&&p.zone===w.id&&dist(p,c)<=c.radius+10){
    if(this.groupHit(w,c.group,p.id,650))this.game.damagePlayer(p,c.damage);
    c.dead=true;
    this.game.fx(w.id,{type:'impact',castId:c.castId+':hit',owner:c.owner,x:c.x,y:c.y,shape:'circle',radius:20,theme:c.theme,monster:c.monster,boss:c.boss});break;
   }
  }
 }
 walkableLine(map,from,to,r=12){
  const n=Math.max(1,Math.ceil(dist(from,to)/10));
  for(let i=1;i<=n;i++)if(isBlocked(map,from.x+(to.x-from.x)*i/n,from.y+(to.y-from.y)*i/n,r))return false;
  return true;
 }
 clipDestination(map,m,to,max=300){
  const d=dist(m,to),steps=Math.max(1,Math.ceil(Math.min(d,max)/7)),a=angle(m,to);let result=point(m);
  for(let i=1;i<=steps;i++){
   const length=Math.min(d,max)*i/steps,next={x:m.x+Math.cos(a)*length,y:m.y+Math.sin(a)*length};
   if(isBlocked(map,next.x,next.y,bodyRadius(m)))break;result=next;
  }
  return result;
 }
 moveToward(w,m,to,dt,speed){
  const state=this.state(m),now=this.game.now,old=point(m),d=dist(m,to);
  if(d<2)return;
  const cached=state.path.length&&state.pathGoal&&dist(state.pathGoal,to)<75&&now-state.pathAt<1300;
  if(!cached&&this.walkableLine(w.map,m,to,bodyRadius(m))){
   state.path=[];const step=Math.min(d,speed*dt);moveEntity(w.map,m,(to.x-m.x)/d*step,(to.y-m.y)/d*step,bodyRadius(m));
  }else{
   if(!cached&&now-state.pathAt>350){state.path=findPath(w.map,m,to);state.pathGoal=point(to);state.pathAt=now;}
   while(state.path.length&&dist(m,state.path[0])<7)state.path.shift();
   const next=state.path[0];if(next){const len=dist(m,next),step=Math.min(speed*dt,len);moveEntity(w.map,m,(next.x-m.x)/Math.max(1,len)*step,(next.y-m.y)/Math.max(1,len)*step,bodyRadius(m));}
  }
  m.moving=dist(old,m)>.1;if(m.moving)facing(m,angle(old,m));
 }
 tickMob(w,m,players,dt){
  if(!this.owns(m))return false;
  if(!m.alive)return true;
  const now=this.game.now,spec=MONSTERS[m.type],s=this.state(m);
  if(this.isTransition(m)||m.bossMechanic?.active){m.moving=false;return true;}
  if(m.stunUntil>now){this.clearOwner(w,m);s.action=null;s.queue=[];m.castUntil=now;return true;}
  if(s.action){this.advanceAction(w,m,players,dt);return true;}
  let target=players.find(p=>p.hp>0&&p.zone===w.id&&p.id===m.target&&dist(p,m)<650);
  if(dist(m,{x:m.homeX,y:m.homeY})>(spec.boss?580:490))target=null;
  if(!target&&dist(m,{x:m.homeX,y:m.homeY})<(spec.boss?520:440)){
   const aggro=Math.max(spec.aggro||160,spec.boss?285:Math.min(220,this.ordinary(m).range));
   target=players.filter(p=>p.hp>0&&p.zone===w.id&&dist(p,m)<aggro&&lineOfSight(w.map,m,p)).sort((a,b)=>dist(a,m)-dist(b,m))[0];
  }
  if(!target){
   if(m.target||s.queue.length){this.clearOwner(w,m,{adds:true});s.queue=[];}m.target=null;
   const home={x:m.homeX,y:m.homeY};
   if(dist(m,home)>20){this.moveToward(w,m,home,dt,(spec.speed||70)*1.1);m.hp=Math.min(m.maxHp,m.hp+m.maxHp*.04*dt);}
   else if(!spec.boss){
    if((m.wanderAt||0)<now){const a=this.game.random()*TAU;m.walkDir=this.game.random()>.48?{x:Math.cos(a),y:Math.sin(a)}:{x:0,y:0};m.wanderAt=now+2400+this.game.random()*1700;}
    const old=point(m);moveEntity(w.map,m,(m.walkDir?.x||0)*(spec.speed||70)*.18*dt,(m.walkDir?.y||0)*(spec.speed||70)*.18*dt,bodyRadius(m));m.moving=dist(m,old)>.1;
   }
   return true;
  }
  m.target=target.id;facing(m,angle(m,target));
  if(s.queue.length&&m.nextAttack<=now){this.beginMove(w,m,target,s.queue.shift());return true;}
  const d=dist(m,target),behavior=m.encounterBehavior||spec.behavior||'pursue',range=spec.boss?320:this.ordinary(m).range;
  if(m.nextAttack<=now&&d<=range&&lineOfSight(w.map,m,target)){
   if(spec.boss&&this.profile(m))this.startBoss(w,m,target);
   else this.beginMove(w,m,target,{kind:behavior,name:this.ordinary(m).name});return true;
  }
  const speed=(spec.speed||75)*(m.slowUntil>now?.5:1);
  if(['ranged','fan','poison','summon'].includes(behavior)&&!spec.boss){
   if(d<125){
    const a=angle(target,m),back={x:m.x+Math.cos(a)*65,y:m.y+Math.sin(a)*65};
    if(this.walkableLine(w.map,m,back,12))this.moveToward(w,m,back,dt,speed*.9);
    else {const side={x:m.x+Math.cos(a+Math.PI/2)*55,y:m.y+Math.sin(a+Math.PI/2)*55};if(this.walkableLine(w.map,m,side,12))this.moveToward(w,m,side,dt,speed*.8);}
   }else if(d>range*.82||!lineOfSight(w.map,m,target))this.moveToward(w,m,target,dt,speed*.85);
  }else if(d>(spec.boss?115:behavior==='guard'?70:42))this.moveToward(w,m,target,dt,speed);
  return true;
 }
 startBoss(w,m,target){
  const profile=this.profile(m);if(!profile||PRIVATE(m))return false;
  // True means this manager handled the request, including a safe refusal.
  // Returning false here would let Game.bossCast fall through to legacy casts.
  if(!m.alive||this.isTransition(m)||m.bossMechanic?.active)return true;
  const state=this.state(m),phase=phaseOf(m),key=MONSTERS[m.type].encounter||m.type;
  // Explicit API callers can replace a pending combo; remove its tells with it.
  if(state.action){this.clearOwner(w,m);state.action=null;}
  const chosen=profile.sequences[(state.sequence+++(phase-1))%profile.sequences.length].map(x=>({...x}));
  if(phase>1){
   // Show a *new* named mechanic immediately on transformation; don't bury it
   // after the old attacks where phase 2 looked identical to phase 1.
   const kinds=LATE_MOVES[key]||['echo','fan'];
   const build=(kind,final=false)=>{
    const reference=profile.sequences.flat().find(x=>x.kind===kind)||{};
    return {...reference,kind,name:`${phase===3?'최종 각성':'각성'} · ${moveLabels[kind]||'변이 공격'}`,
     phaseMove:true,windup:phase===3?1080:1280,
     ...(kind==='charge'?{trail:phase===3,length:phase===3?345:280}:{}),
     ...(kind==='fan'?{count:phase===3?8:6}:{}),
     ...(kind==='poison'?{count:phase===3?4:3}:{}),
     ...(kind==='summon'?{count:phase===3?3:2}:{}),
     ...(kind==='echo'?{count:phase===3?5:3}:{}),
     ...(kind==='wave'?{count:phase===3?5:3}:{}),
     ...(final?{recover:700}:{})};
   };
   const awaken=build(kinds[phase-2]||'echo');
   chosen.unshift(awaken);
   // Phase 3 retains the second-phase mechanic and adds a faster finishing
   // signature. Phase 2 repeats its first signature at the end of each combo.
   if(phase===3)chosen.push(build(kinds[0]||'echo'),build(kinds[1]||'fan',true));
   else chosen.push(build(kinds[0]||'echo',true));
  }
  state.queue=chosen.slice(1);m.target=target.id;m.phase=(m.phase||0)+1;
  this.beginMove(w,m,target,chosen[0]);return true;
 }
 beginMove(w,m,target,move){
  const now=this.game.now,spec=MONSTERS[m.type],boss=!!spec.boss,phase=phaseOf(m),s=this.state(m),kind=move.kind==='pursue'?'melee':move.kind;
  const defaults=ORDINARY_BEHAVIORS[move.kind]||{},windup=Math.max(boss?950:540,(move.windup||defaults.windup||(boss?1150:900))-(boss?(phase-1)*80:0));
  const recover=Math.max(650,move.recover||defaults.recover||(boss?1000:700));
  const attack=Math.max(1,spec.atk*(m.attackScale||1)*(m.encounterAttackScale||1)*(boss?1+(phase-1)*.07:1));
  const theme=move.theme||this.theme(m),a=angle(m,target),token=++this.sequence;
  const action={kind,stage:'windup',starts:now,ends:now+windup,angle:a,tx:target.x,ty:target.y,from:point(m),recover,token,move,theme,boss,attack,targetId:target.id};
  s.action=action;m.castUntil=action.ends;m.moving=false;facing(m,a);
  const base={owner:m.id,encounter:true,action:token,starts:now,ends:action.ends,damage:attack,boss,theme,monster:m.type,name:move.name||defaults.name||'공격',originX:m.x,originY:m.y,phase,group:`e_${m.id}_${token}`};
  const cast=(fields,last=false)=>{
   const c={...base,id:++this.game.castSeq,shape:'circle',x:target.x,y:target.y,radius:55,inner:0,...fields,last};w.casts.push(c);return c;
  };
  if(kind==='charge'){
   const length=move.length||(boss?280:210),to=this.clipDestination(w.map,m,{x:m.x+Math.cos(a)*length,y:m.y+Math.sin(a)*length},length);
   action.to=to;action.length=dist(m,to);action.wallStop=action.length+8<length;
   cast({op:'charge',shape:'beam',x:m.x,y:m.y,angle:a,length:action.length,width:boss?65:42,radius:action.length,damage:attack*.95},true);
  }else if(kind==='leap'){
   const intended=move.mirror?{x:m.x*2-target.x,y:target.y}:target,to=this.clipDestination(w.map,m,intended,boss?260:190);
   action.to=to;action.launchAt=now+Math.max(400,windup-500);action.ends=now+windup;
   cast({op:'leapStart',x:m.x,y:m.y,radius:boss?42:26,damage:0,ends:action.launchAt});
   cast({op:'leapImpact',x:to.x,y:to.y,radius:move.radius||(boss?95:50),damage:attack*1.1},true);
  }else if(kind==='burrow'){
   action.to=this.clipDestination(w.map,m,target,boss?250:210);
   cast({op:'burrow',x:action.to.x,y:action.to.y,radius:move.radius||(boss?95:48),damage:attack*1.05},true);
  }else if(kind==='ranged'||kind==='fan'){
   const count=(move.count||(kind==='fan'?(boss?5:3):1))+(boss&&phase===3?2:0),spread=move.spread||(kind==='fan'?1.45:count>1?.28:0),group=base.group;
   for(let i=0;i<count;i++){
    const direction=a+(count===1?0:(i/(count-1)-.5)*spread);
    cast({op:'projectile',shape:'beam',x:m.x,y:m.y,angle:direction,length:move.length||330,width:kind==='fan'?9:13,radius:330,
     projectileSpeed:move.projectileSpeed||(boss?195:175),projectileRadius:boss?9:6,damage:attack*(kind==='fan'?.78:.92),group},i===count-1);
   }
  }else if(kind==='poison'){
   const count=move.count||1,radius=move.radius||(boss?90:46);
   for(let i=0;i<count;i++){
    const offset=count>1?(i-(count-1)/2)*radius*1.4:0,pt={x:target.x+Math.cos(a+Math.PI/2)*offset,y:target.y+Math.sin(a+Math.PI/2)*offset};
    // Unwalkable edge pools remain outside combat, rather than snapping onto a
    // different safe player and violating the locked windup marker.
    if(isBlocked(w.map,pt.x,pt.y,3)&&i>0)continue;
    cast({op:'poison',x:pt.x,y:pt.y,radius,damage:attack*.5,hazardDamage:attack*.35,hazardDuration:boss?5200:4000},false);
   }
   const last=w.casts.findLast(c=>c.action===token&&c.owner===m.id);if(last)last.last=true;
  }else if(kind==='summon'){
   cast({op:'summon',x:m.x,y:m.y,radius:boss?90:50,damage:0,adds:move.adds||[],count:boss?Math.min(3,phase+1):1},true);
  }else if(kind==='guard'){
   cast({op:'hit',shape:'beam',x:m.x,y:m.y,angle:a,length:move.length||(boss?150:95),width:move.width||(boss?90:62),radius:180,damage:attack*1.1},true);
  }else if(kind==='pull'){
   cast({op:'pull',x:m.x,y:m.y,radius:move.radius||200,damage:attack*.32},true);
  }else if(kind==='echo'){
   const count=move.count||3,history=s.history.slice().reverse(),ends=action.ends;
   for(let i=0;i<count;i++){
    let pos=i===0?point(target):history[Math.min(history.length-1,i*2)]||{x:target.x+Math.cos(a+Math.PI/2)*i*65,y:target.y+Math.sin(a+Math.PI/2)*i*65};
    if(move.mirror&&i>0)pos={x:m.x*2-pos.x,y:pos.y};
    const destination=isBlocked(w.map,pos.x,pos.y,4)?point(target):pos;
    cast({op:'hit',...destination,radius:move.radius||65,ends:ends+i*420,damage:attack*.68,name:base.name+` ${i+1}`},i===count-1);
   }
   action.ends=ends+(count-1)*420;
  }else if(kind==='wave'){
   const count=move.count||3,ends=action.ends;
   for(let i=0;i<count;i++){const radius=85+i*65;cast({op:'hit',shape:'ring',x:m.x,y:m.y,radius,inner:Math.max(22,radius-46),ends:ends+i*430,damage:attack*.7},i===count-1);}
   action.ends=ends+(count-1)*430;
  }else if(kind==='retreat'){
   const to=this.clipDestination(w.map,m,{x:m.x-Math.cos(a)*150,y:m.y-Math.sin(a)*150},150);action.to=to;
   cast({op:'retreat',x:m.x,y:m.y,radius:65,damage:attack*.35},true);
  }else if(kind==='slam'){
   cast({op:'hit',x:m.x,y:m.y,radius:move.radius||110,damage:attack*1.1},true);
  }else{
   // Short directional swipe. It commits to a direction instead of creating a
   // remote circle under the player, and cannot hit through its owner's back.
   cast({op:'hit',shape:'beam',x:m.x,y:m.y,angle:a,length:64,width:52,radius:70,damage:attack},true);
  }
  m.castUntil=action.ends;m.nextAttack=action.ends+recover+(boss?500:Math.max(200,(defaults.cooldown||1800)-windup-recover));
 }
 recover(m,extra=0){
  const s=this.state(m),a=s.action;if(!a)return;
  a.stage='recover';a.starts=this.game.now;a.ends=this.game.now+a.recover+extra;m.castUntil=0;m.nextAttack=Math.max(m.nextAttack,a.ends+100);
 }
 advanceAction(w,m,players,dt){
  const now=this.game.now,s=this.state(m),a=s.action;if(!a)return;
  if(!players.some(p=>p.id===m.target&&p.hp>0&&p.zone===w.id)||dist(m,{x:m.homeX,y:m.homeY})>640){
   this.clearOwner(w,m,{adds:true});s.action=null;s.queue=[];m.castUntil=0;return;
  }
  if(a.stage==='recover'){
   if(now>=a.ends){s.action=null;if(!s.queue.length)m.nextAttack=Math.max(m.nextAttack,now+(MONSTERS[m.type].boss?1000:200));}
   return;
  }
  if(a.stage==='windup'&&now>a.ends+250&&!w.casts.some(c=>c.encounter&&c.owner===m.id&&c.action===a.token)){
   // Other objective/event managers may cancel a tell. A cancelled tell must
   // neither hit nor leave its owner permanently frozen in a windup pose.
   this.recover(m);return;
  }
  if(a.kind==='burrow'&&a.stage==='windup'){
   const progress=clamp((now-a.starts)/(a.ends-a.starts),0,1);
   if(progress>.35){const t=clamp((progress-.35)/.5,0,1),dest={x:a.from.x+(a.to.x-a.from.x)*t,y:a.from.y+(a.to.y-a.from.y)*t};moveEntity(w.map,m,dest.x-m.x,dest.y-m.y,bodyRadius(m));}
  }
  if(a.stage!=='strike')return;
  if(a.kind==='leap'){
   const t=clamp((now-a.launchAt)/(a.ends-a.launchAt),0,1),to={x:a.from.x+(a.to.x-a.from.x)*t,y:a.from.y+(a.to.y-a.from.y)*t};
   moveEntity(w.map,m,to.x-m.x,to.y-m.y,bodyRadius(m));m.moving=true;return;
  }
  if(a.kind==='charge'){
   const old=point(m),left=dist(m,a.to),step=Math.min(left,(a.boss?440:340)*dt);
   if(left>1)moveEntity(w.map,m,(a.to.x-m.x)/left*step,(a.to.y-m.y)/left*step,bodyRadius(m));m.moving=dist(m,old)>.1;
   this.chargeHits(w,m,a,players,old);
   if(a.move.trail&&dist(m,a.lastTrail||a.from)>=65){
    this.hazard(w,m,{x:old.x,y:old.y,radius:32,damage:a.attack*.3,theme:a.theme,name:'질주가 남긴 잔류 지대',activeAt:now+650,ends:now+3900,group:`trail_${m.id}_${a.token}`});a.lastTrail=point(m);
   }
   if(left<4||now>=a.ends||dist(m,old)<step*.25){
    this.game.fx(w.id,{type:'impact',castId:a.castId+':finish',owner:m.id,x:m.x,y:m.y,shape:'circle',radius:a.boss?48:30,theme:a.theme,boss:a.boss,monster:m.type});
    this.recover(m,a.wallStop||left>4?550:0);
   }
  }
 }
 chargeHits(w,m,a,players,old=point(m)){
  a.hit||=new Set();const dx=m.x-old.x,dy=m.y-old.y,l2=dx*dx+dy*dy;
  for(const p of players){
   if(p.hp<=0||p.zone!==w.id||a.hit.has(p.id))continue;
   const t=l2?clamp(((p.x-old.x)*dx+(p.y-old.y)*dy)/l2,0,1):0,near={x:old.x+dx*t,y:old.y+dy*t};
   if(dist(p,near)<(a.boss?41:29)&&lineOfSight(w.map,near,p)){
    this.game.damagePlayer(p,a.attack*.95);a.hit.add(p.id);
    this.game.fx(w.id,{type:'impact',castId:a.castId+':hit:'+p.id,owner:m.id,x:p.x,y:p.y,shape:'circle',radius:24,theme:a.theme,boss:a.boss,monster:m.type});
   }
  }
 }
 hitArea(c,p){
  const dx=p.x-c.x,dy=p.y-c.y,d=Math.hypot(dx,dy);
  if(c.shape==='beam'){const along=dx*Math.cos(c.angle)+dy*Math.sin(c.angle),across=-dx*Math.sin(c.angle)+dy*Math.cos(c.angle);return along>=-10&&along<=c.length+8&&Math.abs(across)<=c.width/2+8;}
  return c.shape==='ring'?d<=c.radius+8&&d>=c.inner-8:d<=c.radius+8;
 }
 damageCast(w,c,players){
  for(const p of players)if(p.hp>0&&p.zone===w.id&&this.hitArea(c,p)&&lineOfSight(w.map,c,p)&&this.groupHit(w,c.group,p.id,220))this.game.damagePlayer(p,c.damage);
 }
 hazard(w,m,data){
  w.encounterHazards||=[];
  const id='hazard_'+(++this.sequence),now=this.game.now;
  w.encounterHazards.push({id,owner:m.id,monster:m.type,activeAt:now,ends:now+4500,nextTick:now+900,...data});
  const owned=w.encounterHazards.filter(h=>h.owner===m.id);
  if(owned.length>9){const expired=new Set(owned.slice(0,owned.length-9).map(h=>h.id));w.encounterHazards=w.encounterHazards.filter(h=>!expired.has(h.id));}
  if(w.encounterHazards.length>70)w.encounterHazards.splice(0,w.encounterHazards.length-70);
 }
 spawnAdds(w,m,c){
  const alive=w.mobs.filter(x=>x.alive&&x.encounterSummon?.owner===m.id),limit=MONSTERS[m.type].boss?3:2;
  const z=ZONES[w.id],fallback=z?.mobTypes?.[0]||'slime',types=c.adds?.length?c.adds:[fallback];
  for(let i=0;i<Math.min(c.count||1,limit-alive.length);i++){
   let pos=null;
   for(let attempt=0;attempt<12;attempt++){
    const direction=(i/Math.max(1,c.count)+attempt/12)*TAU,d=48+Math.floor(attempt/4)*20,p={x:m.x+Math.cos(direction)*d,y:m.y+Math.sin(direction)*d};
    if(!isBlocked(w.map,p.x,p.y,14)&&this.walkableLine(w.map,m,p,12)){pos=p;break;}
   }
   if(!pos)continue;
   const type=MONSTERS[types[i%types.length]]?types[i%types.length]:fallback;if(!MONSTERS[type])continue;
   const child=this.game.makeMob(`encounter_add_${++this.sequence}`,type,pos.x,pos.y);
   child.encounterSummon={owner:m.id,expires:this.game.now+24000};child.encounterAttackScale=.55;
   child.maxHp=child.hp=Math.max(20,Math.min(child.maxHp,Math.round(m.maxHp*(MONSTERS[m.type].boss?.075:.35))));
   child.name='부름받은 '+MONSTERS[type].name;child.target=m.target;child.nextAttack=this.game.now+1200;
   child.encounterBehavior=MONSTERS[type].behavior==='summon'?'pursue':MONSTERS[type].behavior||'pursue';
   w.mobs.push(child);
   this.game.fx(w.id,{type:'impact',castId:c.id+':summon:'+child.id,owner:m.id,x:pos.x,y:pos.y,radius:35,shape:'circle',theme:c.theme,boss:c.boss,monster:m.type});
  }
 }
 resolveCast(w,c,players){
  if(!c.encounter)return false;
  const m=w.mobs.find(x=>x.id===c.owner),now=this.game.now;
  if(!m?.alive||this.isTransition(m)||m.bossMechanic?.active||m.stunUntil>now)return true;
  const s=this.state(m),a=s.action;
  if(!a||a.token!==c.action)return true;
  if(c.op==='projectile'){
   w.encounterProjectiles||=[];
   w.encounterProjectiles.push({id:'shot_'+(++this.sequence),castId:c.id,owner:m.id,monster:m.type,x:c.x,y:c.y,angle:c.angle,radius:c.projectileRadius,boss:c.boss,
    speed:c.projectileSpeed,damage:c.damage,theme:c.theme,group:c.group,starts:now,ends:now+Math.ceil(c.length/c.projectileSpeed*1000),kind:a.kind});
   this.game.fx(w.id,{type:'impact',castId:c.id+':launch',owner:m.id,x:c.x,y:c.y,shape:'circle',radius:20,theme:c.theme,boss:c.boss,monster:m.type});
  }else if(c.op==='charge'){
   a.castId=c.id;a.stage='strike';a.starts=now;a.ends=now+Math.max(450,a.length/(a.boss?440:340)*1000);m.castUntil=a.ends;
   this.game.fx(w.id,{type:'impact',castId:c.id+':launch',owner:m.id,x:m.x,y:m.y,shape:'circle',radius:a.boss?42:25,theme:a.theme,boss:a.boss,monster:m.type});
   this.chargeHits(w,m,a,players);return true;
  }else if(c.op==='leapStart'){
   a.stage='strike';return true;
  }else if(c.op==='leapImpact'||c.op==='burrow'){
   // The endpoint was swept against collision before the tell was published.
   moveEntity(w.map,m,a.to.x-m.x,a.to.y-m.y,bodyRadius(m));
   this.damageCast(w,c,players);
  }else if(c.op==='poison'){
   this.damageCast(w,c,players);this.hazard(w,m,{x:c.x,y:c.y,radius:c.radius,theme:c.theme,name:c.name,damage:c.hazardDamage,ends:now+c.hazardDuration,group:c.group});
  }else if(c.op==='summon'){
   this.spawnAdds(w,m,c);
   this.game.fx(w.id,{type:'impact',castId:c.id+':ritual',owner:m.id,x:m.x,y:m.y,shape:'circle',radius:c.radius,theme:c.theme,boss:c.boss,monster:m.type});
  }
  else if(c.op==='pull'){
   this.damageCast(w,c,players);
   for(const p of players)if(p.hp>0&&p.zone===w.id&&this.hitArea(c,p)&&lineOfSight(w.map,m,p)&&!this.protects(p)){
    const d=dist(p,m),step=Math.min(85,Math.max(0,d-52)),a=angle(p,m);
    moveEntity(w.map,p,Math.cos(a)*step,Math.sin(a)*step,10);
    p.motionId=(p.motionId||0)+1;p.path=[];p.dirty=true;
   }
  }else if(c.op==='retreat'){
   this.damageCast(w,c,players);moveEntity(w.map,m,a.to.x-m.x,a.to.y-m.y,bodyRadius(m));
  }else this.damageCast(w,c,players);
  if(c.op!=='projectile'&&c.op!=='summon')this.game.fx(w.id,{type:'impact',castId:c.id,owner:m.id,x:c.x,y:c.y,radius:c.radius,shape:c.shape,inner:c.inner,angle:c.angle,length:c.length,width:c.width,boss:c.boss,theme:c.theme,monster:m.type});
  if(c.last)this.recover(m);
  return true;
 }
 viewMob(m){
  if(m.encounterPose)return {...m.encounterPose,phase:m.encounterPose.phase||phaseOf(m)};
  const now=this.game.now,phase=phaseOf(m);
  if(this.isTransition(m))return {kind:'transform',stage:'transform',starts:m.encounterTransition.starts,ends:m.encounterTransition.ends,phase,angle:m.dir==='e'?0:m.dir==='w'?Math.PI:m.dir==='n'?-Math.PI/2:Math.PI/2};
  const a=m.encounterState?.action;
  if(!a)return {kind:'idle',stage:m.moving?'move':'idle',phase,starts:now,ends:now+1000};
  const progress=clamp((now-(a.kind==='leap'&&a.stage==='strike'?a.launchAt:a.starts))/Math.max(1,a.ends-(a.kind==='leap'&&a.stage==='strike'?a.launchAt:a.starts)),0,1);
  return {kind:a.kind,stage:a.stage,starts:a.starts,ends:a.ends,angle:a.angle,tx:a.to?.x??a.tx,ty:a.to?.y??a.ty,phase,progress,
   jump:a.kind==='leap'&&a.stage==='strike'?Math.sin(progress*Math.PI):0,burrowed:a.kind==='burrow'&&a.stage==='windup'&&progress>.35&&progress<.92};
 }
 view(p){
  const w=this.game.worlds.get(p.zone),now=this.game.now;if(!w)return null;
  const near=c=>dist(p,c)<1120;
  const transitions=w.mobs.filter(m=>m.alive&&this.isTransition(m)&&dist(p,m)<520).sort((a,b)=>dist(p,a)-dist(p,b));
  return {
   projectiles:(w.encounterProjectiles||[]).filter(near).map(({damage,speed,group,dead,...c})=>c),
   hazards:(w.encounterHazards||[]).filter(near).map(({damage,nextTick,group,...c})=>c),
   phaseTransition:transitions[0]?.encounterTransition||null,
   bosses:w.mobs.filter(m=>m.alive&&this.profile(m)&&dist(p,m)<650).map(m=>({id:m.id,phase:phaseOf(m),name:this.profile(m).name,hint:this.profile(m).hint,transition:(m.encounterTransition?.ends||0)>now}))
  };
 }
}
