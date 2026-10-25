import {REALM_BOSS_RESPAWN_MS} from '../shared/respawn.js';
import {CLASSES,ITEMS,MONSTERS,ZONES,xpRequired} from '../shared/content.js';
import {REALMS,REALM_BY_ID,REALM_ZONES,prepareRealms,realmPart,realmWeapon} from '../shared/realms.js';
import {dist} from '../shared/world.js';
import {SECRET_PATHS} from './story-data.js';
import {readSecret,STORY_POINTS} from './stories.js';

const failure=error=>({ok:false,error});
const own=(value,key)=>typeof key==='string'&&Object.hasOwn(value,key);
export class RealmManager{
 constructor(game){this.game=game;}
 state(p){return p.realms||prepareRealms(p);}
 known(p,r){return this.state(p).known.includes(r.id)||r.clues.some(id=>p.atlas?.pages?.includes(id));}
 profile(p){return {...this.state(p),known:REALMS.filter(r=>this.known(p,r)).map(r=>r.id),
  requirements:Object.fromEntries(REALMS.map(r=>[r.id,Object.fromEntries(r.clues.map(id=>[id,!!p.atlas?.pages?.includes(id)]))]))};}
 canEnter(p,zone){
  const z=REALM_ZONES[zone];if(!z)return true;
  const a=this.state(p);return p.level>=z.minLevel&&a.unlocked.includes(z.realm)&&(z.realmArea==='garden'||a.trials.includes(z.realm));
 }
 canDamage(p,m){
  const id=MONSTERS[m.type]?.realmBoss;if(!id)return true;
  return p.zone===REALM_BY_ID[id].sanctum&&this.canEnter(p,p.zone)&&p.hp>0;
 }
 beforeTeleport(p,zone){
  if(p.realmEntry&&REALM_BY_ID[p.realmEntry.realm]?.entryZone!==zone)p.realmEntry=null;
  if(p.realmTrial&&REALM_BY_ID[p.realmTrial.realm]?.garden!==zone)p.realmTrial=null;
 }
 points(p){return this.game.worlds.get(p.zone).map.realmMarkers||[];}
 near(p,point,radius=76){return point&&dist(p,point)<=radius;}
 scene(p,r,mode,refreshOnly=false){this.game.send(p.id,'realmScene',{id:r.id,mode,...(refreshOnly?{refreshOnly:true}:{})});}
 mark(p){this.game.mark(p);}
 enter(p,r){
  const g=this.game,a=this.state(p);
  if(!a.unlocked.includes(r.id))return failure('먼저 두 기록과 경계 장치의 순서를 완성해야 합니다.');
  const gate=this.points(p).find(x=>x.realm===r.id&&x.realmArea==='entry'&&x.realmKind==='gate');
  if(p.zone!=='town'&&(p.zone!==r.entryZone||!this.near(p,gate)))return failure('별여울 마을 또는 이 세계의 경계문 가까이에서 재입장하세요.');
  if(p.level<r.level)return failure(`이 세계는 레벨 ${r.level} 이상이 필요합니다.`);
  if(g.now-p.lastCombat<8000)return failure('전투가 끝나고 8초 뒤에 경계를 건널 수 있습니다.');
  if((p.cooldowns.realm||0)>g.now)return failure('경계 이동은 20초에 한 번 사용할 수 있습니다.');
  const old=a.returnPoint;a.returnPoint={zone:p.zone,x:p.x,y:p.y};
  const z=REALM_ZONES[r.garden];
  if(!g.teleport(p,z.id,z.spawn[0]*32+16,z.spawn[1]*32+16)){a.returnPoint=old;return failure('안전한 도착 지점을 찾지 못했습니다.');}
  p.cooldowns.realm=g.now+20000;this.mark(p);return {ok:true,message:r.name+'의 정원에 도착했습니다.'};
 }
 exit(p){
  const g=this.game,a=this.state(p);if(!REALM_ZONES[p.zone])return failure('지금은 숨겨진 세계 안이 아닙니다.');
  if(g.now-p.lastCombat<5000)return failure('전투가 끝나고 5초 뒤 돌아갈 수 있습니다.');
  const back=a.returnPoint,valid=back&&ZONES[back.zone]&&!ZONES[back.zone].secretRealm&&!ZONES[back.zone].challenge&&!ZONES[back.zone].dungeon;
  const destination=valid?back:{zone:'town',x:784,y:688};
  if(!g.teleport(p,destination.zone,destination.x,destination.y))return failure('돌아갈 위치를 찾지 못했습니다.');
  a.returnPoint=null;this.mark(p);return {ok:true};
 }
 puzzle(p,r,point,trial){
  const g=this.game,a=this.state(p),key=trial?'realmTrial':'realmEntry',done=trial?a.trials:a.unlocked;
  if(done.includes(r.id))return {ok:true,message:trial?'이미 이 정원의 개인 서약을 마쳤습니다.':'이미 깨어난 경계입니다. 문을 이용하세요.'};
  if(p.level<r.level)return failure(`레벨 ${r.level}부터 이 장치에 응답할 수 있습니다.`);
  if(trial&&!a.unlocked.includes(r.id))return failure('먼저 바깥 경계를 열어야 합니다.');
  if(!trial&&!r.clues.every(id=>p.atlas?.pages?.includes(id)))return failure('두 지역의 기록을 먼저 직접 읽어야 장치가 응답합니다.');
  if((p.realmNextAction||0)>g.now)return {ok:false,quiet:true};
  p.realmNextAction=g.now+400;
  const order=trial?r.trialOrder:r.entryOrder;
  if(!p[key]||p[key].realm!==r.id||g.now-p[key].at>90000)p[key]={realm:r.id,step:0,at:g.now};
  const q=p[key];
  if(point.index!==order[q.step]){p[key]=null;this.mark(p);this.scene(p,r,trial?'garden':'entry');return failure('순서가 어긋나 문양이 잠들었습니다. 단서를 읽고 처음부터 다시 시도하세요.');}
  q.step++;q.at=g.now;
  if(!a.known.includes(r.id))a.known.push(r.id);
  if(q.step===order.length){done.push(r.id);p[key]=null;g.toast(p,trial?'개인 서약을 마쳤습니다. 북쪽 성소에서 파수꾼에게 도전하세요.':r.name+'의 경계를 열었습니다. 이제 마을에서도 다시 들어갈 수 있습니다.','success');}
  this.mark(p);this.scene(p,r,trial?'garden':'entry',true);return {ok:true};
 }
 device(p,point){
  const g=this.game,r=REALM_BY_ID[point.realm],a=this.state(p);
  if(!r||!this.near(p,point))return failure('해당 장치의 발판 가까이에서 직접 상호작용하세요.');
  if(point.realmArea!=='entry'&&!this.canEnter(p,p.zone))return failure('이 세계의 경계를 먼저 열어야 합니다.');
  if(point.realmKind==='trace'){
   if(!a.known.includes(r.id)){a.known.push(r.id);this.mark(p);}
   this.scene(p,r,point.realmArea);return {ok:true};
  }
  if(point.realmKind==='puzzle')return this.puzzle(p,r,point,false);
  if(point.realmKind==='trial')return this.puzzle(p,r,point,true);
  if(point.realmKind==='exit')return this.exit(p);
  if(point.realmKind==='back'){
   const z=REALM_ZONES[r.garden];return {ok:g.teleport(p,z.id,z.spawn[0]*32+16,z.spawn[1]*32+16)};
  }
  if(point.realmKind==='gate'){
   if(point.realmArea==='entry')return this.enter(p,r);
   if(!a.trials.includes(r.id))return failure('정원의 세 장치를 올바른 순서로 다루어 개인 서약을 먼저 마치세요.');
   const z=REALM_ZONES[r.sanctum];return {ok:g.teleport(p,z.id,z.spawn[0]*32+16,z.spawn[1]*32+16)};
  }
  if(point.realmKind==='altar'){this.scene(p,r,'sanctum');return {ok:true};}
  return failure('응답하지 않는 장치입니다.');
 }
 atAltar(p,r){return p.zone===r.sanctum&&this.near(p,this.points(p).find(m=>m.realmKind==='altar'));}
 claim(p,r){
  const a=this.state(p),g=this.game,core=`realm_${r.id}_core`;
  if(!this.atAltar(p,r))return failure('안쪽 성소의 무기 제단 가까이에서 받으세요.');
  if(!a.cleared.includes(r.id)||a.weapons[r.id]||!(p.inventory[core]>0))return failure('파수꾼을 처음 쓰러뜨려 얻은 서약핵으로 무기를 한 번만 받을 수 있습니다.');
  const part=realmPart(CLASSES[p.classId]?.family||p.classId),id=realmWeapon(r.id,part);
  p.inventory[core]--;g.addItem(p,id);a.weapons[r.id]={part,stable:false};this.mark(p);this.scene(p,r,'sanctum');
  return {ok:true,message:ITEMS[id].name+'을 받았습니다. 장착하면 설명된 이점과 대가가 함께 적용됩니다.'};
 }
 tune(p,r,stable){
  const a=this.state(p),g=this.game,w=a.weapons[r.id];
  if(typeof stable!=='boolean'||!this.atAltar(p,r)||!w||!a.cleared.includes(r.id))return failure('본인이 받은 무기를 들고 이 성소의 제단에서 조정하세요.');
  if(w.stable===stable)return failure('이미 선택한 상태의 무기입니다.');
  const old=realmWeapon(r.id,w.part,w.stable),next=realmWeapon(r.id,w.part,stable),gold=r.level*5;
  if(!(p.inventory[old]>0)||p.inventory[next]>0)return failure('변환할 무기 한 자루의 소유 상태를 확인하세요.');
  if(p.gold<gold||(p.inventory[r.material]||0)<3)return failure(`${ITEMS[r.material].name} 3개와 ${gold} G가 필요합니다.`);
  p.gold-=gold;p.inventory[r.material]-=3;p.inventory[old]--;g.addItem(p,next);w.stable=stable;
  if(p.equipment.weapon===old)p.equipment.weapon=next;
  if(p.enhancements?.[old]!==undefined){p.enhancements[next]=p.enhancements[old];delete p.enhancements[old];}
  if(p.enhancePity?.[old]!==undefined){p.enhancePity[next]=p.enhancePity[old];delete p.enhancePity[old];}
  const s=g.stats(p);p.hp=Math.min(p.hp,s.maxHp);p.mp=Math.min(p.mp,s.maxMp);
  this.mark(p);this.scene(p,r,'sanctum');return {ok:true,message:ITEMS[next].name+'으로 바뀌었습니다. 강화 단계는 유지됩니다.'};
 }
 action(p,a){
  if(a.type==='interact'){
   const point=this.points(p).filter(x=>(!a.id||x.id===a.id)&&this.near(p,x)).sort((a,b)=>dist(p,a)-dist(p,b))[0];
   if(!point)return null;return p.hp>0?this.device(p,point):failure('쓰러진 상태에서는 장치를 조작할 수 없습니다.');
  }
  if(!['realmBook','realmEnter','realmDevice','realmClaim','realmTune','realmExit'].includes(a.type))return null;
  if(!(p.hp>0))return failure('쓰러진 상태에서는 숨은 세계의 장치를 사용할 수 없습니다.');
  if(a.type==='realmExit')return this.exit(p);
  if(a.type==='realmDevice'){
   const point=this.points(p).find(x=>x.id===a.id);return point?this.device(p,point):failure('이 지역에 없는 장치입니다.');
  }
  const r=own(REALM_BY_ID,a.id)?REALM_BY_ID[a.id]:null;
  if(a.type==='realmBook'){
   if(r&&!this.known(p,r))return failure('아직 이 세계의 흔적을 발견하지 못했습니다.');
   this.game.send(p.id,'realmScene',{id:r?.id||null,mode:'journal'});return {ok:true};
  }
  if(!r)return failure('알 수 없는 숨은 세계입니다.');
  if(a.type==='realmEnter')return this.enter(p,r);
  if(a.type==='realmClaim')return this.claim(p,r);
  return this.tune(p,r,a.stable);
 }
 mobKilled(m){
  const id=MONSTERS[m.type]?.realmBoss;if(!id)return false;
  const g=this.game,r=REALM_BY_ID[id];
  if(!m.alive)return true;
  m.alive=false;m.hp=0;m.respawnAt=g.now+REALM_BOSS_RESPAWN_MS;
  for(const [pid,damage]of m.damageLog){
   const p=g.players.get(pid),recent=m.contributors.get(pid);
   if(!p?.active||p.hp<=0||p.zone!==r.sanctum||dist(p,m)>850||!this.canEnter(p,p.zone)||
      !Number.isFinite(recent)||g.now-recent>90000||damage<Math.max(20,m.maxHp*.005))continue;
   const a=this.state(p);if(a.cleared.includes(id))continue;
   a.cleared.push(id);p.gold+=r.level*40;g.giveXP(p,Math.round(xpRequired(r.level)*.2));
   g.addItem(p,`realm_${id}_core`);g.addItem(p,r.material,6);
   for(const job of r.jobs){
    const path=SECRET_PATHS[job],index=p.journey.signs[job]||0,point=STORY_POINTS.get(path?.[index]);
    if(point)readSecret(g,p,point);
    if(!a.traces.includes(job))a.traces.push(job);
   }
   if(!p.titles.includes(r.title))p.titles.push(r.title);
   this.mark(p);g.toast(p,`${r.name} 첫 완주 · 서약핵과 전직의 다음 비밀 단서를 얻었습니다. 북쪽 제단에서 무기를 받으세요.`,'success');
  }
  g.fx(r.sanctum,{type:'death',id:m.id,monster:m.type,x:m.x,y:m.y,boss:true});
  m.contributors.clear();m.damageLog.clear();m.supportLog.clear();return true;
 }
 view(p){
  const z=REALM_ZONES[p.zone],entry=REALMS.find(r=>r.entryZone===p.zone),r=z?REALM_BY_ID[z.realm]:entry;
  if(!r)return null;
  const a=this.state(p),known=this.known(p,r),area=z?.realmArea||'entry';
  const step=area==='entry'?(p.realmEntry?.realm===r.id?p.realmEntry.step:0):(p.realmTrial?.realm===r.id?p.realmTrial.step:0);
  const order=area==='entry'?r.entryOrder:r.trialOrder,done=area==='entry'?a.unlocked.includes(r.id):a.trials.includes(r.id);
  return {id:r.id,name:known?r.name:'이름 없는 세계의 흔적',area,color:r.color,known,unlocked:a.unlocked.includes(r.id),
   attuned:a.trials.includes(r.id),cleared:a.cleared.includes(r.id),entryStep:p.realmEntry?.realm===r.id?p.realmEntry.step:0,
   trialStep:p.realmTrial?.realm===r.id?p.realmTrial.step:0,
   hint:!known?'가까운 흔적을 읽으면 경계문과 순서의 단서가 기록됩니다.':area==='entry'?r.entryHint:area==='garden'?r.trialHint:'서약을 마친 사람만 파수꾼에게 피해를 줄 수 있습니다. 첫 완주 후 북쪽 제단에서 무기를 받으세요.',
   markers:this.points(p).map(m=>({...m,done:['puzzle','trial'].includes(m.realmKind)?done||order.slice(0,step).includes(m.index):
    m.realmKind==='gate'?done:m.realmKind==='altar'?a.cleared.includes(r.id):m.realmKind==='trace'?known:true,active:this.near(p,m)}))};
 }
}
