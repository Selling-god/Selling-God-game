import {CLASSES,ITEMS,MONSTERS,ZONES} from '../shared/content.js';
import {RELICS} from '../shared/expansion.js';
import {LANDMARKS} from '../shared/expeditions.js';
import {ALL_VOCATION_SITES,HIDDEN_VOCATION_RELICS} from '../shared/vocation-sites.js';
import {STORIES,SECRET_PATHS} from './story-data.js';
import {dist} from '../shared/world.js';

const HIDDEN_RELIC_BY_JOB=Object.fromEntries(HIDDEN_VOCATION_RELICS.map(p=>[p.job,p]));
const firstHints={
 voidwalker:'바람목 대평원에서 쓰러진 깃발 곁의 돌판을 읽은 여행자가 경계를 이야기했습니다.',
 eclipse_reaper:'뿌리기억 대습원의 중간 순찰로에는 낮에도 달 그림자가 남는 관측 표식이 있습니다.',
 phoenix_heir:'유실된 태양왕로 깊은 곳, 해가 지지 않는 옛길의 명부에서 불씨의 첫 이름을 찾으세요.',
 tide_oracle:'일곱조수 군도에서 서쪽 끝 파도를 지켜보던 사람이 남긴 편지가 시작입니다.',
 starweaver:'천공 유랑환도의 부서진 시계섬에는 하늘을 잇는 실의 기록이 남아 있습니다.',
 nameless_king:'태양왕로의 가장 먼 관측 표식에서 왕이 명령하지 않은 마지막 일을 찾아보세요.',
 dawn_architect:'하늘섬의 종 없는 종탑에서 잘못된 시간이 무엇인지 확인하세요.',
 abyss_shepherd:'잊힌 거목의 마지막 감시 기록에서 아무도 불러주지 않는 이름을 찾으세요.'
};
function hiddenHint(p,id){
 const index=p.journey.signs[id]||0,next=STORY_POINTS.get(SECRET_PATHS[id]?.[index]);
 return index&&next?`이미 읽은 문장은 보관되어 있습니다. 다음 문장은 「${ZONES[next.zone].name}」의 기록에서 찾으세요.`:firstHints[id];
}
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
export const STORY_POINTS=new Map([...LANDMARKS,...ALL_VOCATION_SITES].map(p=>[p.id,p]));
export function prepareStories(p){
 const j=p.journey||{};
 p.journey={version:1,quests:structuredClone(j.quests||{}),completed:[...(j.completed||[])].filter(id=>own(STORIES,id)),
  inherited:[...new Set(j.inherited||p.discovery.jobs.filter(id=>id!=='novice'))].filter(id=>own(STORIES,id)),
  discovered:[...(j.discovered||[])].filter(id=>own(STORIES,id)),signs:{...(j.signs||{})},
  vows:{...(j.vows||{})},tracked:own(STORIES,j.tracked)?j.tracked:null};
 for(const [id,q]of Object.entries(p.journey.quests)){
  const s=STORIES[id];if(!s||!Number.isInteger(q.chapter)||q.chapter<0||q.chapter>=s.steps.length){delete p.journey.quests[id];continue;}
  q.active=!!q.active;q.progress=s.steps[q.chapter].objectives.map((o,i)=>Math.max(0,Math.min(o.count,Number(q.progress?.[i])||0)));
 }
}
export function storyKnown(p,id){
 const s=STORIES[id];if(!s)return false;
 return s.tier==='common'||p.discovery.jobs.includes(id)||p.journey.discovered.includes(id)||
  s.tier==='hidden'&&(p.journey.signs[id]||0)>=s.secret.length;
}
function prerequisites(p,s){
 const owned=p.discovery.jobs.includes(s.id);
 return [
  {label:'필요 레벨',value:p.level,goal:Math.max(s.minLevel,ZONES[s.zone].minLevel)},
  ...s.parents.map(id=>({label:CLASSES[id].name+'의 길',value:+(owned||p.discovery.jobs.includes(id)),goal:1})),
  ...(s.secret.length?[{label:'순서대로 읽은 숨은 기록',value:owned?s.secret.length:p.journey.signs[s.id]||0,goal:s.secret.length}]:[]),
  {label:'직업 전승 자료 수집 (야영지 기록)',value:(s.lore||[]).filter(k=>p.atlas?.pages?.includes(k)).length,goal:(s.lore||[]).length}
 ];
}
export function canBeginStory(p,id){
 const s=STORIES[id];return !!s&&prerequisites(p,s).every(r=>r.value>=r.goal);
}
export function describeGoal(o){
 let target='';
 if(o.kind==='kill')target=o.target==='any'?'몬스터':MONSTERS[o.target]?.name||o.target;
 if(o.kind==='deliver'||o.kind==='gather')target=ITEMS[o.target]?.name||o.target;
 if(o.kind==='read')target=STORY_POINTS.get(o.target)?.name||o.target;
 if(o.kind==='relic')target=RELICS.find(r=>r.id===o.target)?.name||o.target;
 if(o.kind==='visit'||o.kind==='trial')target=ZONES[o.target]?.name||o.target;
 if(o.kind==='world')target={tempest:'폭풍의 거신',leviathan:'해류의 지배자',glacier:'빙하의 심장',eclipse:'경계의 포식자'}[o.target];
 return target?target+' · '+o.label:o.label;
}
function goalValue(p,q,o,i){
 return o.kind==='deliver'?Math.min(o.count,p.inventory[o.target]||0):Math.min(o.count,q.progress[i]||0);
}
export function chapterReady(p,id){
 const s=STORIES[id],q=p.journey.quests[id];
 return !!s&&!!q&&s.steps[q.chapter].objectives.every((o,i)=>goalValue(p,q,o,i)>=o.count);
}
function destination(o){
 if(o.kind==='read')return STORY_POINTS.get(o.target)||null;
 if(o.kind==='relic')return RELICS.find(r=>r.id===o.target)||null;
 if(o.kind==='trial')return STORY_POINTS.get(o.target+'_trial')||null;
 if(o.kind==='visit'){const z=ZONES[o.target];return z?{id:o.target,zone:o.target,name:z.name,x:z.spawn[0]*32+16,y:z.spawn[1]*32+16}:null;}
 return null;
}
export function storyTracker(p){
 const id=p.journey.tracked,s=STORIES[id],q=p.journey.quests[id];
 if(!s||!q)return null;
 const chapter=s.steps[q.chapter],ready=chapterReady(p,id);
 const unmet=chapter.objectives.find((o,i)=>goalValue(p,q,o,i)<o.count);
 const to=ready?STORY_POINTS.get(s.site):unmet?destination(unmet):null;
 return {id,name:CLASSES[id].name,title:chapter.title,chapter:q.chapter+1,total:s.steps.length,active:q.active,ready,
  objectives:chapter.objectives.map((o,i)=>({label:describeGoal(o),value:Math.floor(goalValue(p,q,o,i)),goal:o.count})),
  destination:to?{id:to.id,zone:to.zone,name:to.name,x:to.x,y:to.y}:null};
}
export function storyBook(p){
 return Object.entries(STORIES).map(([id,s],i)=>{
  const known=storyKnown(p,id),owned=p.discovery.jobs.includes(id),q=p.journey.quests[id];
  const hidden=s.tier==='hidden'&&!known;
  return {id,owned,discovered:!hidden,name:hidden?'봉인된 전승 '+String(i-29).padStart(2,'0'):CLASSES[id].name,tier:s.tier,
   hint:hidden?`아직 이어지지 않은 문장 ${(p.journey.signs[id]||0)}/${s.secret.length}. ${hiddenHint(p,id)}`:
    known?`「${s.title}」 · ${s.mentor} · ${ZONES[s.zone].name}`:`${ZONES[s.zone].name} 부근에 이 길을 아는 사람이 있습니다.`,
   requirements:hidden?[]:prerequisites(p,s),mastery:p.discovery.mastery[id]||0,
   story:{known,title:known?s.title:'아직 만나지 않은 이야기',total:s.steps.length,chapter:q?q.chapter+1:0,active:!!q?.active,
    done:p.journey.completed.includes(id),inherited:p.journey.inherited.includes(id),ready:!!q&&chapterReady(p,id)},
  };
 });
}
export function storyDetail(p,id){
 if(!own(STORIES,id))return null;
 const s=STORIES[id],q=p.journey.quests[id],known=storyKnown(p,id),hidden=s.tier==='hidden'&&!known;
 if(hidden)return {id,sealed:true,name:'봉인된 전승',intro:'이 사람은 아직 당신에게 이름을 알려 주지 않습니다. 대륙에 남은 문장들을 순서대로 읽고 돌아와야 합니다.',
  signs:p.journey.signs[id]||0,totalSigns:s.secret.length,hint:hiddenHint(p,id)};
 const completed=p.journey.completed.includes(id),chapter=q?s.steps[q.chapter]:s.steps[0];
 return {id,name:CLASSES[id].name,tier:s.tier,title:s.title,mentor:s.mentor,zone:s.zone,site:STORY_POINTS.get(s.site),artifactSite:HIDDEN_RELIC_BY_JOB[id]||null,
  lorePages:(s.lore||[]).map(page=>({id:page,name:STORY_POINTS.get(page)?.name||page,zone:STORY_POINTS.get(page)?.zone,done:!!p.atlas?.pages?.includes(page)})),intro:s.intro,
  total:s.steps.length,owned:p.discovery.jobs.includes(id),inherited:p.journey.inherited.includes(id),completed,
  eligible:canBeginStory(p,id),requirements:prerequisites(p,s),active:!!q?.active,started:!!q,tracked:p.journey.tracked===id,
  history:s.steps.slice(0,completed?s.steps.length:q?.chapter||0).map((a,i)=>({number:i+1,title:a.title,text:a.text})),
  ending:completed?s.ending:null,vow:p.journey.vows[id]||null,
  current:completed?null:{number:(q?.chapter||0)+1,index:q?.chapter||0,title:chapter.title,text:chapter.text,final:chapter.final,
   gold:chapter.gold,xp:chapter.xp,ready:!!q&&chapterReady(p,id),report:s.mentor,
   objectives:chapter.objectives.map((o,i)=>({...o,label:describeGoal(o),value:q?Math.floor(goalValue(p,q,o,i)):0,destination:destination(o)}))}
 };
}
export function recordStory(game,p,event){
 if(!p.journey)return;
 let changed=false;
 for(const [id,q]of Object.entries(p.journey.quests)){
  if(!q.active||p.journey.completed.includes(id))continue;
  const s=STORIES[id],step=s.steps[q.chapter];
  for(let i=0;i<step.objectives.length;i++){
   const o=step.objectives[i];if(o.kind==='deliver'||event.kind!==o.kind)continue;
   const match=o.target==='any'||o.target===event.target;
   if(!match||o.basic&&event.skill!=='basic')continue;
   const add=o.kind==='walk'?Math.max(0,Math.min(1.5,event.count||0)):1;
   const before=q.progress[i]||0;q.progress[i]=Math.min(o.count,before+add);
   if(q.progress[i]!==before)changed=true;
  }
  if(chapterReady(p,id)&&!q.notified){
   q.notified=true;game.toast(p,`전직 이야기 · ${step.title} 완료! ${s.mentor}에게 보고하세요.`,'success');changed=true;
  }
 }
 if(changed){
  p.dirty=true;p.storySaveStamp=(p.storySaveStamp||0)+1;p.storyPendingSync=true;
  if(game.now-(p.lastStorySync||0)>=800){p.lastStorySync=game.now;p.storyPendingSync=false;game.mark(p);}
 }
}
export function readSecret(game,p,point){
 const signals=[];
 for(const [id,path]of Object.entries(SECRET_PATHS)){
  const index=p.journey.signs[id]||0;if(path[index]!==point.id)continue;
  p.journey.signs[id]=index+1;
  const next=STORY_POINTS.get(path[index+1]);
  if(!next&&!p.journey.discovered.includes(id))p.journey.discovered.push(id);
  signals.push({step:index+1,total:path.length,text:next?`문장이 이어졌습니다. 다음 흔적은 「${ZONES[next.zone].name}」에 남아 있습니다.`:
   `문장이 완성되었습니다. 「${ZONES[STORIES[id].zone].name}」의 이름 없는 존재가 기다립니다.`});
  game.mark(p);
 }
 return signals;
}
export function openHiddenArtifact(game,p,point){
 const s=STORIES[point.job];if(!s||s.tier!=='hidden')return {ok:false,error:'봉인되지 않은 유물입니다.'};
 game.send(p.id,'storyView',storyDetail(p,s.id));return {ok:true};
}
export function openMentor(game,p,point){
 const s=STORIES[point.job];if(!s)return {ok:false};
 recordStory(game,p,{kind:'read',target:point.id});
 if(s.tier!=='hidden'&&!p.journey.discovered.includes(s.id)){p.journey.discovered.push(s.id);game.mark(p);}
 game.send(p.id,'storyView',storyDetail(p,s.id));return {ok:true};
}
export function storyAction(game,p,a){
 if(!['storyView','storyAccept','storyClaim','storyPause','storyResume','storyTrack'].includes(a.type))return null;
 if(typeof a.id!=='string'||!own(STORIES,a.id))return {ok:false,error:'알 수 없는 전승입니다.'};
 const s=STORIES[a.id],site=STORY_POINTS.get(s.site),j=p.journey,q=j.quests[a.id];
 const sync=()=>{game.send(p.id,'storyView',storyDetail(p,a.id));game.send(p.id,'jobBook',storyBook(p));};
 if(a.type==='storyView'){sync();return {ok:true};}
 if(a.type==='storyTrack'){
  if(!q)return {ok:false,error:'먼저 이야기를 시작하세요.'};
  j.tracked=a.id;game.mark(p);sync();return {ok:true};
 }
 if(a.type==='storyPause'){
  if(q)q.active=false;game.mark(p);sync();return {ok:true,message:'기록을 보존하고 수련을 잠시 멈췄습니다.'};
 }
 if(a.type==='storyResume'){
  if(!q)return {ok:false,error:'시작하지 않은 이야기입니다.'};
  if(Object.values(j.quests).filter(x=>x.active).length>=3&&!q.active)return {ok:false,error:'수련은 세 이야기까지 동시에 진행할 수 있습니다. 다른 이야기를 잠시 멈추세요.'};
  q.active=true;j.tracked=a.id;game.mark(p);sync();return {ok:true};
 }
 const relic=s.tier==='hidden'?HIDDEN_RELIC_BY_JOB[a.id]:null;
 const nearMentor=p.zone===site.zone&&dist(p,site)<=185;
 const nearRelic=!!relic&&p.zone===relic.zone&&dist(p,relic)<=185;
 if(!nearMentor&&!nearRelic)return {ok:false,error:s.tier==='hidden'?'해당 직업의 전직 스승이나 봉인 유물 가까이에서 상호작용하세요.':`${ZONES[site.zone].name}의 전직 NPC ${site.name} 가까이에서 직접 퀘스트를 수락하고 보고하세요.`};
 if(a.type==='storyAccept'){
  if(q||j.completed.includes(a.id))return {ok:false,error:'이미 시작했거나 끝낸 이야기입니다.'};
  if(!canBeginStory(p,a.id))return {ok:false,error:'전직 스승의 퀘스트를 받으려면 먼저 필요한 전승 기록을 모두 수집하고 레벨·선행직업 조건을 충족해야 합니다.'};
  if(Object.values(j.quests).filter(x=>x.active).length>=3)return {ok:false,error:'동시에 세 이야기까지 수련할 수 있습니다. 다른 이야기를 잠시 멈추세요.'};
  j.quests[a.id]={chapter:0,progress:s.steps[0].objectives.map(()=>0),active:true,notified:false,startedAt:game.now};
  if(!j.discovered.includes(a.id))j.discovered.push(a.id);
  j.tracked=a.id;game.mark(p);sync();return {ok:true,message:'첫 장을 시작했습니다. 이번 장을 수락한 뒤의 실제 행동만 수련에 기록됩니다.'};
 }
 if(a.type==='storyClaim'){
  if(!q||!q.active||a.chapter!==q.chapter||!chapterReady(p,a.id))return {ok:false,error:'현재 장의 목표와 수련 상태를 확인하세요.'};
  const chapter=s.steps[q.chapter];
  if(chapter.final&&s.tier==='hidden'&&!['protect','remember'].includes(a.vow))return {ok:false,error:'마지막 서약을 직접 선택해 주세요.'};
  const costs={};for(const o of chapter.objectives)if(o.kind==='deliver')costs[o.target]=(costs[o.target]||0)+o.count;
  if(Object.entries(costs).some(([id,n])=>(p.inventory[id]||0)<n))return {ok:false,error:'전달할 재료가 부족합니다.'};
  for(const [id,n]of Object.entries(costs))p.inventory[id]-=n;
  p.gold+=chapter.gold;game.giveXP(p,chapter.xp);
  if(chapter.final){
   j.completed.push(a.id);delete j.quests[a.id];j.vows[a.id]=a.vow||'protect';
   if(!p.discovery.jobs.includes(a.id)){p.discovery.jobs.push(a.id);game.send(p.id,'jobUnlocked',{ids:[a.id]});}
   const title=CLASSES[a.id].name+'의 서약';if(!p.titles.includes(title))p.titles.push(title);
   game.addItem(p,'wayfarer_seal',s.tier==='hidden'?12:s.tier==='epic'?6:s.tier==='rare'?3:1);
   if(j.tracked===a.id)j.tracked=Object.keys(j.quests)[0]||null;
   game.toast(p,`「${s.title}」 완결 · ${CLASSES[a.id].name}의 길이 열렸습니다!`,'success');
  }else{
   q.chapter++;q.progress=s.steps[q.chapter].objectives.map(()=>0);q.notified=false;
  }
  game.mark(p);sync();return {ok:true,message:chapter.final?'전승을 완성했습니다. 마을에서 전직할 수 있습니다.':'이전 장의 보상을 받고 다음 이야기를 시작했습니다.'};
 }
 return null;
}
