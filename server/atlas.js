import {ZONES,MONSTERS} from '../shared/content.js';
import {PROVINCES,LANDMARKS,expeditionRewards} from '../shared/expeditions.js';
import {dist} from '../shared/world.js';
import {STORY_POINTS,openMentor,readSecret,recordStory} from './stories.js';

export const atlasDay=now=>new Date(now+9*3600000).toISOString().slice(0,10);
const validZone=id=>Object.prototype.hasOwnProperty.call(ZONES,id)&&ZONES[id].expedition;
function grantReward(game,p,zone,kind){
 const reward=expeditionRewards(zone,kind);
 p.gold+=reward.gold||0;
 if(reward.xp)game.giveXP(p,reward.xp);
 if(reward.seals)game.addItem(p,'wayfarer_seal',reward.seals);
 if(reward.material&&reward.materials)game.addItem(p,reward.material,reward.materials);
 return reward;
}
export function prepareAtlas(p){
 const a=p.atlas||{};
 p.atlas={version:1,waypoints:[...new Set(a.waypoints||[])].filter(validZone),
  pages:[...new Set(a.pages||[])].filter(id=>STORY_POINTS.has(id)),
  fog:structuredClone(a.fog||{}),contracts:structuredClone(a.contracts||{}),
  reputation:{...(a.reputation||{})},trialClaims:{...(a.trialClaims||{})},
  surveyClaims:[...new Set(a.surveyClaims||[])].filter(id=>PROVINCES.some(r=>r.id===id))};
 for(const [id,seen]of Object.entries(p.atlas.fog)){
  if(!validZone(id)||!Array.isArray(seen)){delete p.atlas.fog[id];continue;}
  const z=ZONES[id],limit=Math.ceil(z.width/8)*Math.ceil(z.height/8);
  p.atlas.fog[id]=[...new Set(seen)].filter(n=>Number.isInteger(n)&&n>=0&&n<limit);
 }
 for(const [id,c]of Object.entries(p.atlas.contracts))if(!validZone(id)||!c||typeof c.day!=='string')delete p.atlas.contracts[id];
}
export function privateAtlas(p){
 const a=p.atlas;
 return {...a,fog:{[p.zone]:a.fog[p.zone]||[]},pages:a.pages.filter(id=>STORY_POINTS.get(id)?.zone===p.zone),
  totalPages:a.pages.length,provinces:Object.fromEntries(PROVINCES.map(r=>[r.id,{
   camps:a.waypoints.filter(id=>ZONES[id].province===r.id).length,
   pages:a.pages.filter(id=>STORY_POINTS.get(id)?.zone?.startsWith(r.id+'_reach_')).length,
   rep:a.reputation[r.id]||0,claimed:a.surveyClaims.includes(r.id)
  }]))};
}
export function revealTerrain(game,p){
 const z=ZONES[p.zone];if(!z?.expedition||game.now<(p.nextSurveyAt||0))return;
 p.nextSurveyAt=game.now+650;
 const cols=Math.ceil(z.width/8),rows=Math.ceil(z.height/8),cx=Math.floor(p.x/256),cy=Math.floor(p.y/256);
 const list=p.atlas.fog[p.zone]||(p.atlas.fog[p.zone]=[]),seen=new Set(list);
 let changed=false;
 for(let y=Math.max(0,cy-1);y<=Math.min(rows-1,cy+1);y++)for(let x=Math.max(0,cx-1);x<=Math.min(cols-1,cx+1);x++){
  const i=y*cols+x;if(!seen.has(i)){list.push(i);seen.add(i);changed=true;}
 }
 if(changed)game.mark(p);
}
export function recordAtlas(game,p,kind,target){
 const c=p.atlas?.contracts[p.zone];if(!c||c.day!==atlasDay(game.now)||c.claimed)return;
 if(kind==='kill'&&target===c.monster)c.kills=Math.min(c.killGoal,c.kills+1);
 if(kind==='gather'&&target===c.resource)c.gathered=Math.min(c.gatherGoal,c.gathered+1);
 if(c.kills>=c.killGoal&&c.gathered>=c.gatherGoal&&!c.notified){
  c.notified=true;game.toast(p,'야영지 의뢰를 마쳤습니다. 해당 지역 야영지에서 보고하세요.','success');
 }
}
export function atlasScene(game,p,point,signals=[]){
 const z=ZONES[p.zone],contract=p.atlas.contracts[p.zone];
 return {id:point.id,kind:point.kind,name:point.name,text:point.text,zone:p.zone,province:z.province,
  attuned:p.atlas.waypoints.includes(p.zone),signals,
  contract:contract?.day===atlasDay(game.now)?contract:null,
  trial:trialView(game.worlds.get(p.zone),game.now),trialRewarded:p.atlas.trialClaims[p.zone]===atlasDay(game.now),
  pageCount:p.atlas.pages.length};
}
export function interactPoint(game,p,point){
 if(point.kind==='mentor')return openMentor(game,p,point);
 let signals=[];
 if(point.kind==='camp'){
  if(!p.atlas.waypoints.includes(p.zone)){
   p.atlas.waypoints.push(p.zone);grantReward(game,p,ZONES[p.zone],'camp');
   game.toast(p,'귀환석을 깨웠습니다. 마을과 다른 야영지에서 이곳으로 이동할 수 있습니다.','success');
  }
 }else if(point.kind==='tablet'||point.kind==='watch'){
  if(!p.atlas.pages.includes(point.id)){
   p.atlas.pages.push(point.id);grantReward(game,p,ZONES[p.zone],'page');
  }
  signals=readSecret(game,p,point);recordStory(game,p,{kind:'read',target:point.id});
 }
 game.mark(p);game.send(p.id,'atlasScene',atlasScene(game,p,point,signals));return {ok:true};
}
// The 144 expedition altars share 3 genuine cooperative stages. Progress, timers,
// boss shields and damage caps live on the server; clients receive display markers.
const TRIAL_SIGNS=['해','달','뿌리'];
const TRIAL_COLORS=['#f1cb83','#bdacf2','#98d9a5'];
function trialPads(w){
 const p=w.map.trialArena;
 return [{x:p.x-104,y:p.y-55},{x:p.x+104,y:p.y-55},{x:p.x,y:p.y+110}];
}
function trialSequence(zone,wave,gate=0){
 const seed=(zone.sector||0)+(zone.province?.length||0)+gate;
 if(wave===0)return [seed%3,(seed+2)%3];
 if(wave===1)return [seed%3,(seed+1)%3,(seed+2)%3];
 return [(seed+1)%3,(seed+2)%3];
}
function startTrialRitual(game,w,kind){
 const t=w.fieldTrial;if(!t)return;
 const seq=trialSequence(ZONES[w.id],t.wave,t.bossGate);
 const seconds=kind==='boss'?24:kind==='alignment'?31:27;
 t.ritual={kind,seq,step:0,expires:game.now+seconds*1000};
 t.phase='ritual';t.nextAt=0;
 const explanation=kind==='boss'?'보스의 성문을 잠근 두 빛':kind==='alignment'?'교차하는 세 별의 문':'쌍둥이 등불';
 t.hint=`${explanation} · ${seq.map(i=>TRIAL_SIGNS[i]).join(' → ')} 순서로 ${seconds}초 안에 직접 제단을 순회하세요. 틀리면 시간을 잃습니다.`;
 game.broadcast(w.id,'system',{message:`${ZONES[w.id].name} · ${t.hint}`});
}
export function trialView(w,now){
 const t=w.fieldTrial;if(!t)return null;
 const pads=trialPads(w);
 return {zone:w.id,wave:t.wave+1,total:3,ends:t.ends,
  alive:w.mobs.filter(m=>m.trialKey===t.id&&m.alive).length,nextAt:t.nextAt,
  remaining:Math.max(0,t.ends-now),phase:t.phase||'combat',hint:t.hint||'',
  ritual:t.ritual?{kind:t.ritual.kind,step:t.ritual.step,total:t.ritual.seq.length,
    expires:t.ritual.expires,order:t.ritual.seq.map(i=>TRIAL_SIGNS[i])}:null,
  bossGate:t.bossGate,markers:t.ritual?pads.map((point,i)=>({...point,id:`trial_glyph_${i}`,label:TRIAL_SIGNS[i],color:TRIAL_COLORS[i],
    kind:'trial_glyph',radius:44,active:t.ritual.seq[t.ritual.step]===i})):[]};
}
export function cancelFieldTrial(game,w,message='기억의 시련이 닫혔습니다. 제단에서 다시 도전할 수 있습니다.'){
 const t=w.fieldTrial;if(!t)return;
 w.mobs=w.mobs.filter(m=>m.trialKey!==t.id);w.casts=w.casts.filter(c=>!String(c.owner).startsWith(t.id));
 w.fieldTrial=null;w.trialCooldown=game.now+10000;game.broadcast(w.id,'system',{message});
}
function spawnWave(game,w){
 const t=w.fieldTrial,z=ZONES[w.id],types=z.mobTypes,point=w.map.trialArena;
 const count=t.wave===2?1:t.wave===1?8:6;
 const people=Math.min(3,[...game.players.values()].filter(p=>p.active&&p.hp>0&&p.zone===w.id&&dist(p,point)<650).length||1);
 for(let i=0;i<count;i++){
  const angle=i*Math.PI*2/count,r=t.wave===2?75:105+(i%2)*40;
  const type=t.wave===2?z.boss:types[i%types.length];
  const m=game.makeMob(`${t.id}_${t.wave}_${i}`,type,point.x+Math.cos(angle)*r,point.y+Math.sin(angle)*r);
  m.trialKey=t.id;m.hp=m.maxHp=Math.round(MONSTERS[type].hp*(t.wave===2?.70:.85)*(1+(people-1)*.45));
  m.attackScale=.85;
  if(t.wave===2){m.trialShield=true;t.bossId=m.id;t.bossGate=0;}
  w.mobs.push(m);
 }
 t.nextAt=0;t.phase='combat';t.hazardAt=game.now+5300;
 t.hint=t.wave===0?'첫 기억: 흩어진 적들을 막고, 봉인이 나타나면 두 등불을 작동하세요.':
  t.wave===1?'두 번째 기억: 적의 사격을 피해 처리한 뒤 삼중 문양의 방향을 맞추세요.':
  '마지막 기억: 파수꾼의 보호막을 3회 해제하세요. 체력 67%·33%에서 봉인이 재구성됩니다.';
 if(t.wave===2)startTrialRitual(game,w,'boss');
 game.broadcast(w.id,'system',{message:`지역 기억의 시련 ${t.wave+1}/3 · ${t.hint}`});
}
export function fieldTrialInteract(game,p,id){
 const w=game.worlds.get(p.zone),t=w.fieldTrial;
 if(!t?.ritual)return null;
 if(!p.active||p.hp<=0)return {ok:false,error:'생존한 상태로 봉인에 다가가세요.'};
 const point=w.map.trialArena;
 if(dist(p,point)>320)return {ok:false,error:'기억의 제단 인근에서만 봉인을 작동할 수 있습니다.'};
 const pads=trialPads(w),idx=pads.findIndex((pos,i)=>dist(p,pos)<75&&(!id||id===`trial_glyph_${i}`));
 if(idx<0)return {ok:false,error:'불이 켜진 문양 가까이서 상호작용하세요.'};
 if(game.now-(t.lastInteract||0)<450)return {ok:false,quiet:true};
 t.lastInteract=game.now;
 if(idx!==t.ritual.seq[t.ritual.step]){
  t.ritual.step=0;t.ritual.expires-=5000;t.ends-=2000;
  game.toast(p,'잘못된 문양입니다. 5초가 줄고 봉인이 초기화되었습니다.','warn');
  return {ok:true,message:'잘못된 문양입니다. 서두르지 말고 새로 표시된 순서를 읽어보세요.'};
 }
 t.ritual.step++;t.contributions.set(p.id,(t.contributions.get(p.id)||0)+25);
 game.fx(p.zone,{type:'buff',...pads[idx],color:TRIAL_COLORS[idx]});
 const won=t.ritual.step===t.ritual.seq.length;
 if(!won){t.hint=`문양 ${t.ritual.step}/${t.ritual.seq.length} · 다음은 ${TRIAL_SIGNS[t.ritual.seq[t.ritual.step]]}!`;return {ok:true,message:t.hint};}
 const wasBoss=t.ritual.kind==='boss';t.ritual=null;
 if(wasBoss){
  t.bossGate++;
  const boss=w.mobs.find(m=>m.id===t.bossId&&m.alive);
  if(boss){boss.trialShield=false;boss.stunUntil=game.now+1600;}
  t.phase='combat';t.hint=`봉인 해제 ${t.bossGate}/3! 파수꾼을 공격하세요. 다음 체력 경계에서 다시 잠깁니다.`;
 }else{
  t.ritualDone.add(t.wave);t.phase='rest';t.nextAt=game.now+2400;
  t.hint='봉인 해독 성공! 다음 기억이 곧 시작됩니다.';
 }
 game.broadcast(w.id,'system',{message:t.hint});
 return {ok:true,message:t.hint};
}
/** Cap trial-boss damage at mandatory re-shield thresholds, including DoT. */
export function fieldTrialDamageAmount(w,m,damage){
 const t=w.fieldTrial;
 if(!t||m.trialKey!==t.id||t.wave!==2)return damage;
 if(m.trialShield)return 0;
 const ratio=t.bossGate===1?.67:t.bossGate===2?.33:0;
 const floor=Math.ceil(m.maxHp*ratio);
 return Math.min(damage,Math.max(0,m.hp-floor));
}
export function fieldTrialKill(game,w,m){
 if(!w.fieldTrial||m.trialKey!==w.fieldTrial.id)return false;
 m.alive=false;m.hp=0;m.respawnAt=Infinity;
 for(const [id,damage]of m.damageLog)w.fieldTrial.contributions.set(id,(w.fieldTrial.contributions.get(id)||0)+damage);
 for(const [id,healing]of m.supportLog)w.fieldTrial.contributions.set(id,(w.fieldTrial.contributions.get(id)||0)+healing*.5);
 game.fx(w.id,{type:'death',id:m.id,monster:m.type,x:m.x,y:m.y,boss:!!MONSTERS[m.type].boss});
 return true;
}
function spawnTrialAttack(game,w,t){
 const live=w.mobs.filter(m=>m.trialKey===t.id&&m.alive);
 const source=live[0];if(!source)return;
 const point=w.map.trialArena,variant=(ZONES[w.id].sector+t.wave)%3;
 const angle=(game.now/4500%8)*Math.PI/4;
 const cast={id:++game.castSeq,owner:source.id,starts:game.now,ends:game.now+1650,damage:18+ZONES[w.id].minLevel*1.9,
  shape:variant===0?'beam':variant===1?'ring':'circle',boss:true,theme:ZONES[w.id].theme,
  x:variant===2?point.x+(Math.sin(game.now/2300)*160):point.x,
  y:variant===2?point.y+Math.cos(game.now/2300)*90:point.y,
  radius:variant===1?235:variant===2?83:350,inner:variant===1?95:0,
  angle,length:620,width:65,name:variant===0?'기억의 사선':variant===1?'갈라지는 순환 장막':'별빛 낙인'};
 w.casts.push(cast);t.hazardAt=game.now+7500;
}
export function tickFieldTrial(game,w){
 const t=w.fieldTrial;if(!t)return;
 if(game.now>=t.ends){cancelFieldTrial(game,w,'기억이 흐려졌습니다. 제한 시간 안에 세 봉인과 전투를 완수하지 못했습니다.');return;}
 const live=w.mobs.filter(m=>m.trialKey===t.id&&m.alive);
 if(t.ritual){
  if(game.now>=t.ritual.expires){cancelFieldTrial(game,w,'봉인 장치의 제한 시간이 끝났습니다. 같은 위치의 제단에서 다시 시도하세요.');return;}
  if(live.length&&game.now>=t.hazardAt)spawnTrialAttack(game,w,t);
  return;
 }
 if(t.wave===2&&live.length){
  const boss=live.find(m=>m.id===t.bossId);
  if(boss&&!boss.trialShield&&((t.bossGate===1&&boss.hp<=Math.ceil(boss.maxHp*.67))||(t.bossGate===2&&boss.hp<=Math.ceil(boss.maxHp*.33)))){
   boss.trialShield=true;startTrialRitual(game,w,'boss');return;
  }
 }
 if(live.length){if(game.now>=t.hazardAt&&t.wave>=1)spawnTrialAttack(game,w,t);return;}
 if(t.wave<2){
  if(!t.ritualDone.has(t.wave)){startTrialRitual(game,w,t.wave===0?'lantern':'alignment');return;}
  if(t.nextAt&&game.now>=t.nextAt){t.wave++;w.mobs=w.mobs.filter(m=>m.trialKey!==t.id);spawnWave(game,w);}
  return;
 }
 if(t.bossGate!==3){cancelFieldTrial(game,w,'파수꾼의 마지막 봉인을 제대로 해제하지 못했습니다.');return;}
 const day=atlasDay(game.now),z=ZONES[w.id],point=w.map.trialArena;
 for(const [id,contribution]of t.contributions){
  const p=game.players.get(id);
  if(!p?.active||p.hp<=0||p.zone!==w.id||dist(p,point)>750||contribution<20)continue;
  recordStory(game,p,{kind:'trial',target:w.id});
  if(p.atlas.trialClaims[w.id]!==day){
   p.atlas.trialClaims[w.id]=day;p.atlas.reputation[z.province]=(p.atlas.reputation[z.province]||0)+2;
   grantReward(game,p,z,'trial');game.toast(p,'3중 봉인과 파수꾼의 시험을 완료했습니다. 오늘의 보상과 길손의 증표를 받았습니다.','success');
  }else game.toast(p,'수련 기록을 남겼습니다. 오늘의 물품 보상은 이미 받았습니다.','success');
  game.mark(p);
 }
 cancelFieldTrial(game,w,'서로 다른 세 기억의 봉인이 풀렸습니다. 이 땅의 시련을 완료했습니다.');
}
export function atlasAction(game,p,a){
 if(!['waypoint','contractAccept','contractClaim','trialStart','trialInteract','surveyClaim'].includes(a.type))return null;
 const z=ZONES[p.zone],w=game.worlds.get(p.zone),camp=w.map.camp;
 const atCamp=camp&&dist(p,camp)<=130;
 if(a.type==='trialInteract')return fieldTrialInteract(game,p,a.id)||{ok:false,error:'진행 중인 봉인 장치가 없습니다.'};
 const sync=point=>game.send(p.id,'atlasScene',atlasScene(game,p,point));
 if(a.type==='waypoint'){
  const dest=ZONES[a.id];
  if(!dest||a.id!== 'town'&&!p.atlas.waypoints.includes(a.id))return {ok:false,error:'먼저 해당 야영지의 귀환석을 직접 깨워야 합니다.'};
  if(p.zone!=='town'&&!atCamp)return {ok:false,error:'마을 또는 야영지 귀환석 가까이에서 이동하세요.'};
  if(p.level<dest.minLevel||game.now-p.lastCombat<8000)return {ok:false,error:'지역의 필요 레벨과 전투 종료 8초를 확인하세요.'};
  if((p.cooldowns.waypoint||0)>game.now)return {ok:false,error:'귀환석은 20초에 한 번 사용할 수 있습니다.'};
  p.cooldowns.waypoint=game.now+20000;game.teleport(p,a.id,dest.spawn[0]*32+16,dest.spawn[1]*32+16);return {ok:true};
 }
 if(a.type==='surveyClaim'){
  const r=PROVINCES.find(r=>r.id===a.id);if(!r)return {ok:false};
  if(p.zone!=='town'&&!atCamp)return {ok:false,error:'야영지나 별여울 마을에서 탐사 기록을 제출하세요.'};
  const camps=p.atlas.waypoints.filter(id=>ZONES[id].province===r.id).length;
  const pages=p.atlas.pages.filter(id=>STORY_POINTS.get(id)?.zone?.startsWith(r.id+'_reach_')).length;
  if(camps<9||pages<18||p.atlas.surveyClaims.includes(r.id))return {ok:false,error:'야영지 9곳과 기록 18장을 모두 발견해야 합니다. 보상은 한 번만 받습니다.'};
  p.atlas.surveyClaims.push(r.id);grantReward(game,p,r,'survey');
  const title=r.name+'의 길잡이';if(!p.titles.includes(title))p.titles.push(title);
  game.mark(p);return {ok:true,message:r.name+'의 지도를 완성했습니다. 탐사 보상과 칭호를 받았습니다.'};
 }
 if(a.type==='contractAccept'||a.type==='contractClaim'){
  if(!z.expedition||!atCamp)return {ok:false,error:'해당 원정 지역의 야영지에서 대화하세요.'};
  const day=atlasDay(game.now),old=p.atlas.contracts[p.zone];
  if(a.type==='contractAccept'){
   if(old?.day===day)return {ok:false,error:'오늘 이 야영지 의뢰는 이미 받았습니다.'};
   if(Object.values(p.atlas.contracts).filter(c=>c.day===day&&!c.claimed).length>=5)return {ok:false,error:'야영지 의뢰는 동시에 5개까지 진행할 수 있습니다.'};
   p.atlas.contracts[p.zone]={day,monster:z.mobTypes[z.sector%z.mobTypes.length],resource:['herb','wood','ore'][z.sector%3],
    kills:0,killGoal:12,gathered:0,gatherGoal:5,claimed:false};
   game.mark(p);sync(camp);return {ok:true,message:'이 지역에서 사냥 12회와 지정 재료 채집 5회를 마치고 돌아오세요.'};
  }
  if(!old||old.day!==day||old.claimed||old.kills<old.killGoal||old.gathered<old.gatherGoal)return {ok:false,error:'현재 야영지 의뢰 목표와 수령 여부를 확인하세요.'};
  old.claimed=true;grantReward(game,p,z,'contract');
  p.atlas.reputation[z.province]=(p.atlas.reputation[z.province]||0)+1;game.mark(p);sync(camp);return {ok:true,message:'야영지 의뢰 완료 · 명성과 길손의 증표 2개 획득'};
 }
 if(a.type==='trialStart'){
  const point=w.map.trialArena;
  if(!point||dist(p,point)>130)return {ok:false,error:'기억의 제단 가까이에서 도전하세요.'};
  if(w.fieldTrial)return {ok:false,error:'이 제단에서는 이미 시련이 진행 중입니다. 함께 싸워 도울 수 있습니다.'};
  if((w.trialCooldown||0)>game.now)return {ok:false,error:'제단이 다시 깨어나는 중입니다.'};
  if(p.level<z.minLevel)return {ok:false,error:'지역의 필요 레벨을 확인하세요.'};
  w.fieldTrial={id:'trial_'+w.id+'_'+game.now,wave:0,phase:'combat',ends:game.now+6*60000,nextAt:0,ritual:null,
    ritualDone:new Set(),lastInteract:0,bossGate:0,bossId:null,hazardAt:game.now+5300,contributions:new Map()};
  spawnWave(game,w);sync(point);return {ok:true,message:'6분 내 전투와 시간제한 봉인 해독을 병행하세요. 파수꾼의 보호막은 세 번 해제해야 합니다.'};
 }
 return null;
}
