import {ZONES,MONSTERS} from '../shared/content.js';
import {PROVINCES,LANDMARKS,expeditionRewards} from '../shared/expeditions.js';
import {dist} from '../shared/world.js';
import {hasVillage} from '../shared/village-layout.js';
import {STORY_POINTS,openMentor,readSecret,recordStory} from './stories.js';

export const atlasDay=now=>new Date(now+9*3600000).toISOString().slice(0,10);
const validZone=id=>Object.prototype.hasOwnProperty.call(ZONES,id)&&ZONES[id].expedition;
const villageZone=id=>Object.prototype.hasOwnProperty.call(ZONES,id)&&hasVillage({...ZONES[id],id});
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
 p.atlas={version:1,townStones:[...new Set(['town',...(a.townStones||[])])].filter(id=>Object.prototype.hasOwnProperty.call(ZONES,id)),waypoints:[...new Set(a.waypoints||[])].filter(validZone),
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
function unreachableFogChunks(map){
 if(map.unreachableFog)return map.unreachableFog;
 const W=map.w,H=map.h,seen=new Uint8Array(W*H),todo=[];
 const z=ZONES[map.id],sx=Math.floor(z.spawn[0]),sy=Math.floor(z.spawn[1]);
 const start=sy*W+sx;if(!map.blocked[start]){seen[start]=1;todo.push(start);}
 for(let n=0;n<todo.length;n++){const at=todo[n],x=at%W,y=Math.floor(at/W);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,i=yy*W+xx;
   if(xx<0||yy<0||xx>=W||yy>=H||seen[i]||map.blocked[i])continue;seen[i]=1;todo.push(i);
  }
 }
 const cols=Math.ceil(W/8),rows=Math.ceil(H/8),unreachable=[];
 for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
  let reachable=false;for(let y=cy*8;y<Math.min((cy+1)*8,H)&&!reachable;y++)
   for(let x=cx*8;x<Math.min((cx+1)*8,W);x++)if(seen[y*W+x]){reachable=true;break;}
  if(!reachable)unreachable.push(cy*cols+cx);
 }
 return map.unreachableFog=unreachable;
}
export function revealTerrain(game,p){
 const z=ZONES[p.zone];if(!z?.expedition||game.now<(p.nextSurveyAt||0))return;
 p.nextSurveyAt=game.now+650;
 const cols=Math.ceil(z.width/8),rows=Math.ceil(z.height/8),cx=Math.floor(p.x/256),cy=Math.floor(p.y/256);
 const list=p.atlas.fog[p.zone]||(p.atlas.fog[p.zone]=[]),seen=new Set(list);
 let changed=false;
 for(const i of unreachableFogChunks(game.worlds.get(p.zone).map)){if(!seen.has(i)){list.push(i);seen.add(i);changed=true;}}
 for(let y=Math.max(0,cy-2);y<=Math.min(rows-1,cy+2);y++)for(let x=Math.max(0,cx-2);x<=Math.min(cols-1,cx+2);x++){
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
 if(point.kind==='warpstone'){
  if(!p.atlas.townStones.includes(p.zone))p.atlas.townStones.push(p.zone);
  game.mark(p);
  game.send(p.id,'warpstoneView',{here:p.zone,
   destinations:p.atlas.townStones.filter(villageZone).map(id=>({id,name:ZONES[id].name,level:ZONES[id].minLevel}))});
  return {ok:true};
 }
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
export function trialView(w,now){
 const t=w.fieldTrial;return t?{zone:w.id,wave:t.wave+1,total:3,ends:t.ends,
  alive:w.mobs.filter(m=>m.trialKey===t.id&&m.alive).length,nextAt:t.nextAt,remaining:Math.max(0,t.ends-now)}:null;
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
  m.attackScale=.85;w.mobs.push(m);
 }
 t.nextAt=0;game.broadcast(w.id,'system',{message:`기억의 시련 ${t.wave+1}/3 · ${t.wave===2?'기억을 지키는 파수꾼':'흩어진 기억'}이 깨어났습니다.`});
}
export function fieldTrialKill(game,w,m){
 if(!w.fieldTrial||m.trialKey!==w.fieldTrial.id)return false;
 m.alive=false;m.hp=0;m.respawnAt=Infinity;
 for(const [id,damage]of m.damageLog){
  w.fieldTrial.contributions.set(id,(w.fieldTrial.contributions.get(id)||0)+damage);
 }
 for(const [id,healing]of m.supportLog)w.fieldTrial.contributions.set(id,(w.fieldTrial.contributions.get(id)||0)+healing*.5);
 game.fx(w.id,{type:'death',id:m.id,monster:m.type,x:m.x,y:m.y,boss:!!MONSTERS[m.type].boss});
 return true;
}
export function tickFieldTrial(game,w){
 const t=w.fieldTrial;if(!t)return;
 if(game.now>=t.ends){cancelFieldTrial(game,w,'기억이 흐려졌습니다. 제한 시간 안에 시련을 마치지 못했습니다.');return;}
 if(w.mobs.some(m=>m.trialKey===t.id&&m.alive))return;
 if(!t.nextAt){t.nextAt=game.now+2200;return;}
 if(t.nextAt>game.now)return;
 w.mobs=w.mobs.filter(m=>m.trialKey!==t.id);
 if(t.wave<2){t.wave++;spawnWave(game,w);return;}
 const day=atlasDay(game.now),z=ZONES[w.id],point=w.map.trialArena;
 for(const [id,contribution]of t.contributions){
  const p=game.players.get(id);
  if(!p?.active||p.hp<=0||p.zone!==w.id||dist(p,point)>750||contribution<20)continue;
  recordStory(game,p,{kind:'trial',target:w.id});
  if(p.atlas.trialClaims[w.id]!==day){
   p.atlas.trialClaims[w.id]=day;p.atlas.reputation[z.province]=(p.atlas.reputation[z.province]||0)+2;
   grantReward(game,p,z,'trial');
   game.toast(p,'세 번의 기억을 지켰습니다. 오늘의 시련 보상과 길손의 증표 3개를 받았습니다.','success');
  }else game.toast(p,'시련 수련을 기록했습니다. 오늘 이 제단의 물품 보상은 이미 받았습니다.','success');
  game.mark(p);
 }
 cancelFieldTrial(game,w,'세 번의 기억이 하나의 길로 이어졌습니다. 시련을 마쳤습니다.');
}
export function atlasAction(game,p,a){
 if(!['waypoint','contractAccept','contractClaim','trialStart','surveyClaim','villageWarp'].includes(a.type))return null;
 const z=ZONES[p.zone],w=game.worlds.get(p.zone),camp=w.map.camp;
 const atCamp=camp&&dist(p,camp)<=130;
 const sync=point=>game.send(p.id,'atlasScene',atlasScene(game,p,point));
 if(a.type==='villageWarp'){
  const stone=w.map.villageStone,dest=ZONES[a.id];
  if(!stone||dist(p,stone)>165)return {ok:false,error:'마을 중앙의 귀환석 가까이에서 이용하세요.'};
  if(typeof a.id!=='string'||!villageZone(a.id)||!p.atlas.townStones.includes(a.id)||!dest)return {ok:false,error:'먼저 해당 지역 마을의 귀환석을 발견해야 합니다.'};
  if(p.level<dest.minLevel)return {ok:false,error:`이 지역은 레벨 ${dest.minLevel} 이상부터 이동할 수 있습니다.`};
  if(game.now-p.lastCombat<8000)return {ok:false,error:'전투를 마친 후 8초 뒤에 이동하세요.'};
  if((p.cooldowns.villageWarp||0)>game.now)return {ok:false,error:'귀환석 재사용 대기 시간입니다.'};
  const target=game.worlds.get(a.id).map.villageStone;
  if(!target)return {ok:false,error:'지역의 귀환석을 찾지 못했습니다.'};
  if(!game.teleport(p,a.id,target.x,target.y+80))return {ok:false,error:'이동 가능한 안전한 장소가 없습니다.'};
  p.cooldowns.villageWarp=game.now+15000;game.mark(p);return {ok:true,message:`${dest.name} 마을로 이동했습니다.`};
 }
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
  w.fieldTrial={id:'trial_'+w.id+'_'+game.now,wave:0,ends:game.now+6*60000,nextAt:0,contributions:new Map()};
  spawnWave(game,w);sync(point);return {ok:true,message:'6분 안에 세 차례의 기억을 지키세요. 동료가 함께 싸울 수 있습니다.'};
 }
 return null;
}
