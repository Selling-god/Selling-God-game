import {randomUUID} from 'node:crypto';
import {ITEMS,ZONES,xpRequired,getStats} from '../shared/content.js';
import {ATTRIBUTE_KEYS,MAX_ATTRIBUTE,cleanAttributes,statBudget,spentPoints,resetPrice,enhancementSpec,deathLoss,DEATH_RULES} from '../shared/rpg.js';
export function prepareRPG(p){
 p.attributes=cleanAttributes(p.attributes,p.level);
 p.statResets=Math.max(0,Math.floor(p.statResets||0));
 p.enhancePity={...(p.enhancePity||{})};
 p.deaths=Math.max(0,Math.floor(p.deaths||0));
 p.deathWeakUntil=Number.isFinite(p.deathWeakUntil)?p.deathWeakUntil:0;
 p.soul=p.soul&&typeof p.soul.id==='string'&&ZONES[p.soul.zone]?{...p.soul}:null;
 p.lastDeath=p.lastDeath?{...p.lastDeath}:null;
}
function preserveVitals(game,p,mutate){
 const before=game.stats(p),hp=p.hp/before.maxHp,mp=p.mp/before.maxMp;
 mutate();const after=game.stats(p);
 p.hp=Math.min(after.maxHp,Math.max(1,Math.floor(after.maxHp*hp)));
 p.mp=Math.min(after.maxMp,Math.max(0,Math.floor(after.maxMp*mp)));
}
export function onDeath(game,p){
 const loss=deathLoss(p,xpRequired(p.level)),protectedLevel=p.level<=DEATH_RULES.safeLevel;
 p.gold-=loss.gold;p.xp-=loss.xp;p.deaths++;
 if(!protectedLevel){
  p.deathWeakUntil=game.now+DEATH_RULES.weakMs;
  p.soul={id:'soul_'+randomUUID(),zone:p.zone,x:p.x,y:p.y,expires:game.now+DEATH_RULES.graveMs,
   gold:Math.floor(loss.gold*DEATH_RULES.goldRecovery),xp:loss.xp};
 }
 p.lastDeath={at:game.now,zone:p.zone,protected:protectedLevel,gold:loss.gold,xp:loss.xp,recoverGold:p.soul?.gold||0,recoverXP:p.soul?.xp||0};
 const message=protectedLevel?'초보자 보호가 적용되었습니다. Lv.4까지 사망 손실이 없습니다.':
  `사망 · ${loss.gold} G / ${loss.xp} EXP 손실. 10분 안에 흔적을 찾아 골드 80%와 잃은 경험치를 회수하세요.`;
 game.toast(p,message,'warn');game.send(p.id,'deathSummary',{...p.lastDeath,respawnAt:p.respawnAt});
}
export function recoverSoul(game,p,id){
 const g=p.soul;
 if(!g||g.id!==id||g.zone!==p.zone||g.expires<=game.now)return {ok:false,error:'회수할 수 있는 흔적이 없습니다.'};
 if(Math.hypot(p.x-g.x,p.y-g.y)>95)return {ok:false,error:'자신의 영혼 흔적 가까이 다가가세요.'};
 // Clear before granting: a duplicate request cannot restore the same loss twice.
 p.soul=null;p.gold+=g.gold;
 game.giveXP(p,g.xp);
 p.deathWeakUntil=0;game.mark(p);
 game.fx(p.zone,{type:'soulRecover',id:p.id,x:p.x,y:p.y});
 return {ok:true,message:`영혼 회수 · ${g.gold} G / ${g.xp} EXP 복원. 쇠약이 사라졌습니다.`};
}
export function rpgAction(game,p,a){
 if(a.type==='allocateStats'){
  if(game.now-p.lastCombat<5000)return {ok:false,error:'전투 종료 5초 후 능력치를 배분하세요.'};
  if(!a.points||typeof a.points!=='object'||Array.isArray(a.points))return {ok:false,error:'능력치 입력을 확인하세요.'};
  if(Object.keys(a.points).some(k=>!ATTRIBUTE_KEYS.includes(k)))return {ok:false,error:'알 수 없는 능력치입니다.'};
  const added=Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,a.points[k]??0]));
  if(Object.values(added).some(v=>!Number.isSafeInteger(v)||v<0||v>MAX_ATTRIBUTE))return {ok:false,error:'배분할 포인트가 올바르지 않습니다.'};
  const n=Object.values(added).reduce((a,b)=>a+b,0);
  if(!n||spentPoints(p)+n>statBudget(p.level))return {ok:false,error:'남은 능력치 포인트가 부족합니다.'};
  if(ATTRIBUTE_KEYS.some(k=>p.attributes[k]+added[k]>MAX_ATTRIBUTE))return {ok:false,error:`능력치 한 종류에는 최대 ${MAX_ATTRIBUTE}포인트를 투자할 수 있습니다.`};
  preserveVitals(game,p,()=>{for(const k of ATTRIBUTE_KEYS)p.attributes[k]+=added[k];});
  game.mark(p);return {ok:true,message:`능력치 ${n}포인트를 배분했습니다.`};
 }
 if(a.type==='resetStats'){
  if(p.zone!=='town'||game.now-p.lastCombat<5000)return {ok:false,error:'전투를 마치고 마을에서 초기화하세요.'};
  if(!spentPoints(p))return {ok:false,error:'배분한 능력치가 없습니다.'};
  const price=resetPrice(p);
  if(p.gold<price)return {ok:false,error:`초기화에 ${price} G가 필요합니다.`};
  preserveVitals(game,p,()=>{p.gold-=price;p.attributes=cleanAttributes({},p.level);p.statResets++;});
  game.mark(p);return {ok:true,message:`능력치 초기화 · ${statBudget(p.level)}포인트를 다시 배분할 수 있습니다.`};
 }
 if(a.type==='enhance'){
  if(!game.nearNpc(p,'craft'))return {ok:false,error:'대장장이 브란 가까이에서 강화하세요.'};
  const item=ITEMS[a.id];
  if(!item||item.type!=='gear'||!(p.inventory[a.id]>0))return {ok:false,error:'보유한 장비를 선택하세요.'};
  const lv=p.enhancements[a.id]||0,quote=enhancementSpec(lv,p.enhancePity[a.id]||0,item.level);
  if(quote.max)return {ok:false,error:'최대 강화 +10에 도달한 장비입니다.'};
  if(p.gold<quote.gold||Object.entries(quote.cost).some(([id,n])=>(p.inventory[id]||0)<n))
   return {ok:false,error:'강화에 필요한 골드나 재료가 부족합니다.'};
  p.gold-=quote.gold;for(const [id,n]of Object.entries(quote.cost))p.inventory[id]-=n;
  const success=game.random()<quote.rate;
  if(success){p.enhancements[a.id]=lv+1;p.enhancePity[a.id]=0;}
  else p.enhancePity[a.id]=(p.enhancePity[a.id]||0)+1;
  const result={id:a.id,name:item.name,success,level:success?lv+1:lv,previousLevel:lv,rate:quote.rate,
    nextRate:enhancementSpec(success?lv+1:lv,p.enhancePity[a.id]).rate};
  game.mark(p);game.send(p.id,'enhanceResult',result);
  game.fx(p.zone,{type:'forge',id:p.id,x:p.x,y:p.y,success,level:result.level});
  return {ok:true,...result,tone:success?'success':'warn',
   message:success?`${item.name} +${lv+1} · 강화 성공!`:`강화 실패 · 장비와 강화 단계는 유지됩니다. 다음 성공률 ${Math.round(result.nextRate*100)}%`};
 }
 if(a.type==='recoverSoul')return recoverSoul(game,p,a.id);
 return null;
}
