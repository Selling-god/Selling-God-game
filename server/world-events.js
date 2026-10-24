import {MONSTERS,ZONES} from '../shared/content.js';
import {WORLD_BOSSES,EVENT_DURATION_MS} from '../shared/expansion.js';
import {findSafePosition} from '../shared/world.js';
const HOUR=3600000;
export function bossWindow(def,now){
 let start=Math.floor(now/HOUR)*HOUR+def.minute*60000;
 if(start>now)start-=HOUR;
 return {key:def.id+':'+start,start,end:start+EVENT_DURATION_MS,next:start+HOUR};
}
/** Server-clock schedule. No browser timers decide boss spawns or grant rewards. */
export class WorldEvents {
 constructor(game,store=null){this.game=game;this.store=store;this.windows=new Map();this.pending=new Set();this.lastPersist=0;this.error=null;this.retryAt=0;}
 tick(now){
  for(const def of WORLD_BOSSES){
   const win=bossWindow(def,now);
   if(now>=this.retryAt&&now>=win.start&&now<win.end&&!this.windows.has(win.key)&&!this.pending.has(win.key)){
    this.pending.add(win.key);
    if(this.store){
     const initial={status:'active',start:win.start,end:win.end,type:def.type,hp:MONSTERS[def.type].hp};
     this.store.beginWorldEvent(win.key,initial).then(record=>{
      if(this.game.now>=win.end)return;
      this.spawn(def,win,record);
      this.error=null;
     }).catch(e=>{this.retryAt=this.game.now+30000;this.error='월드 이벤트 저장 테이블을 확인하세요.';console.error('World-event storage:',e.message);})
      .finally(()=>{this.pending.delete(win.key);});
    }else{this.spawn(def,win,{status:'active'});this.pending.delete(win.key);}
   }
  }
  for(const [key,entry]of this.windows){
   if(entry.status==='active'&&now>=entry.end){
    entry.status='expired';entry.mob.alive=false;entry.mob.respawnAt=Infinity;
    const world=this.game.worlds.get(entry.def.zone);world.casts=world.casts.filter(c=>c.owner!==entry.mob.id);
    this.persist(entry);this.game.broadcast(null,'worldNotice',{message:entry.def.name+'의 기운이 사라졌습니다. 다음 정시를 기다려 주세요.'});
   }
   if(now-entry.end>HOUR){this.windows.delete(key);const w=this.game.worlds.get(entry.def.zone);w.mobs=w.mobs.filter(m=>m.worldKey!==key);}
  }
  if(now-this.lastPersist>15000){this.lastPersist=now;for(const entry of this.windows.values())if(entry.status==='active')this.persist(entry);}
 }
 spawn(def,win,record){
  if(this.windows.has(win.key))return;
  const world=this.game.worlds.get(def.zone),point=world.map.eventArena;
  const entry={...win,def,status:record?.status||'active',mob:null};
  this.windows.set(win.key,entry);
  if(entry.status!=='active')return;
  const participants=[...this.game.players.values()].filter(p=>p.active&&p.zone===def.zone&&p.level>=def.level).length;
  const scale=record?.maxHp?1:1+Math.min(7,Math.max(0,participants-1))*.35;
  const m=this.game.makeMob('event_'+win.key,def.type,point.x,point.y);
  m.maxHp=record?.maxHp||Math.round(MONSTERS[def.type].hp*scale);m.hp=Math.min(m.maxHp,record?.maxHp?Math.max(1,record.hp):m.maxHp);
  m.worldKey=win.key;m.worldEventId=def.id;m.expiresAt=win.end;
  m.damageLog=new Map(record?.damage||[]);m.supportLog=new Map(record?.support||[]);m.contributors=new Map(record?.contributors||[]);
  entry.mob=m;world.mobs.push(m);
  this.game.broadcast(null,'worldNotice',{message:`월드 보스 출현! ${ZONES[def.zone].name}에 ${def.name}이 나타났습니다. B에서 남은 시간과 참가 조건을 확인하세요.`,id:def.id});
  this.persist(entry);
 }
 persist(entry){
  if(!this.store)return;
  const m=entry.mob;
  this.store.saveWorldEvent(entry.key,{status:entry.status,start:entry.start,end:entry.end,type:entry.def.type,
   hp:m?.hp||0,maxHp:m?.maxHp||MONSTERS[entry.def.type].hp,
   damage:[...(m?.damageLog||[])],support:[...(m?.supportLog||[])],contributors:[...(m?.contributors||[])]})
   .catch(e=>{this.error='이벤트 기록 저장 재시도 중';console.error('World-event save:',e.message);});
 }
 defeated(m){
  const e=this.windows.get(m.worldKey);if(!e)return;
  e.status='defeated';m.respawnAt=Infinity;this.persist(e);
 }
 view(now){
  return WORLD_BOSSES.map(def=>{
   const w=bossWindow(def,now),entry=this.windows.get(w.key),inside=now<w.end;
   const status=inside?(entry?.status|| (this.error?'unavailable':'preparing')):'upcoming';
   return {...def,status,start:inside?w.start:w.next,end:inside?w.end:w.next+EVENT_DURATION_MS,
    next:w.next,hp:entry?.mob?.hp||0,maxHp:entry?.mob?.maxHp||0};
  }).sort((a,b)=>a.start-b.start);
 }
 join(p,id){
  const def=WORLD_BOSSES.find(d=>d.id===id);
  if(!def)return {ok:false,error:'알 수 없는 월드 보스입니다.'};
  const win=bossWindow(def,this.game.now),e=this.windows.get(win.key);
  if(!e||e.status!=='active'||!e.mob?.alive||this.game.now>=win.end)return {ok:false,error:'아직 출현하지 않았거나 이번 전투가 종료되었습니다.'};
  if(p.level<def.level)return {ok:false,error:`참가하려면 레벨 ${def.level}이 필요합니다.`};
  if(this.game.now-p.lastCombat<8000)return {ok:false,error:'전투 종료 8초 후 이동할 수 있습니다.'};
  if(p.discovery.rewardedWindows.includes(win.key))return {ok:false,error:'이번 출현의 보상은 이미 받았습니다.'};
  // The former (-210,+110) offset landed outside the clearing, inside a tree on meadow.
  // Stay inside the arena and validate the whole player footprint before transport.
  const map=this.game.worlds.get(def.zone).map;
  const arrival=findSafePosition(map,{x:e.mob.homeX-128,y:e.mob.homeY+64},10);
  if(!arrival||this.game.teleport(p,def.zone,arrival.x,arrival.y)===false)return {ok:false,error:'안전한 도착 지점을 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.'};
  return {ok:true,message:'보스에게 직접 피해를 주거나 전투 중인 파티원을 치유하면 참여 기록이 남습니다.'};
 }
}
