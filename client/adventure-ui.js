import {CLASSES,ZONES,ITEMS,MONSTERS} from '../shared/content.js';
import {PROVINCES,EXPEDITION_ZONES,atlasTotals,expeditionRewards} from '../shared/expeditions.js';
import {timeLeft} from './expansion-ui.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tiers={common:'일반',rare:'희귀',epic:'영웅',hidden:'히든'};
const btn=(label,act,id='',extra='')=>`<button class="btn small" data-act="${act}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const progress=(value,goal)=>`<div class="story-meter"><i style="width:${Math.min(100,value/Math.max(1,goal)*100)}%"></i></div>`;
const rewardText=r=>[r.gold&&`${r.gold.toLocaleString('ko-KR')} G`,r.xp&&`${r.xp.toLocaleString('ko-KR')} EXP`,
 r.seals&&`길손의 증표 ${r.seals}개`,r.material&&`${esc(ITEMS[r.material]?.name)} ${r.materials}개`].filter(Boolean).join(' · ');
const provinceRange=r=>`Lv.${r.level}~${r.maxLevel??Math.min(30,r.level+3)}`;
export function storyTrackHTML(p){
 const s=p.storyTracker;if(!s)return '';
 return `<div class="quest-track story-track"><h4>◆ ${esc(s.name)} · ${s.chapter}/${s.total}장 ${s.active?'':'[잠시 멈춤]'}</h4><div class="small">${esc(s.title)}</div>
 ${s.objectives.map(o=>`<div class="objective ${o.value>=o.goal?'done':''}"><span>${esc(o.label)}</span><b>${o.value}/${o.goal}</b></div>`).join('')}
 ${s.destination?`<div class="small muted">→ ${esc(ZONES[s.destination.zone]?.name)} · ${esc(s.destination.name)}</div>`:''}
 ${s.ready?'<div class="quest-ready">스승에게 돌아가 이번 장을 보고하세요.</div>':''}
 ${btn('이야기 펼치기','storyView',s.id)}</div>`;
}
export function adventurePanel(name,{profile:p,tab,data,state,now=Date.now(),keyLabel=(_id,fallback='미지정')=>fallback}){
 if(name==='story'&&data){
  const d=data;
  if(d.sealed)return {title:'이름 없는 전승',eyebrow:'SIX PATHS BEYOND THE MAP',html:`
   <div class="story-sealed"><span>?</span><h3>아직 완성되지 않은 문장</h3><p>${esc(d.intro)}</p>${progress(d.signs,d.totalSigns)}<p>${d.signs}/${d.totalSigns}개의 문장</p><p>${esc(d.hint)}</p></div>
   <div class="settings-actions">${btn('직업 도감','openJobs')}${btn('대륙 지도','openAtlas')}</div>`};
  const q=p.journey?.quests[d.id],current=d.current;
  const live=current&&q?.chapter===current.index;
  const values=current?.objectives.map((o,i)=>live?(o.kind==='deliver'?Math.min(o.count,p.inventory[o.target]||0):Math.floor(q.progress[i]||0)):o.value)||[];
  const ready=current&&values.every((v,i)=>v>=current.objectives[i].count);
  const near=p.zone===d.zone&&Math.hypot(p.x-d.site.x,p.y-d.site.y)<=125;
  let html=`<div class="story-layout"><aside class="story-aside"><img src="/assets/${d.id}_s_0.png" alt="">
   <span class="badge">${tiers[d.tier]} · ${d.total}장</span><h3>${esc(d.name)}</h3><p>${esc(d.mentor)}</p><p class="small muted">${esc(ZONES[d.zone].name)}</p>
   ${d.owned?'<span class="badge good">직업 보유</span>':''}
   ${d.inherited?'<p class="small">기존에 얻은 직업은 유지됩니다. 이야기는 별도로 체험할 수 있습니다.</p>':''}
   <div class="story-steps">${Array.from({length:d.total},(_,i)=>`<i class="${d.completed||i<(current?.index||0)?'done':i===current?.index?'current':''}">${i+1}</i>`).join('')}</div>
   ${btn('진행 중인 전승','openStories')}${btn('대륙 지도','openAtlas')}
   </aside><div class="story-paper"><span class="eyebrow">A PATH EARNED, NOT CHOSEN</span><h2>${esc(d.title)}</h2><p class="story-prose">${esc(d.intro)}</p>`;
  if(d.completed){
   html+=`<section class="story-chapter"><span class="badge good">서약을 마쳤습니다</span><p class="story-prose">${esc(d.ending)}</p><p class="small">남긴 서약: ${d.vow==='remember'?'이름과 기억을 이어 간다':'누군가의 돌아올 길을 지킨다'}</p>${btn('직업 도감에서 전직','openJobs')}</section>`;
  }else if(current){
   html+=`<section class="story-chapter"><span class="chapter-number">CHAPTER ${String(current.number).padStart(2,'0')} / ${d.total}</span><h3>${esc(current.title)}</h3><p class="story-prose">${esc(current.text)}</p>
    <div class="story-objectives">${current.objectives.map((o,i)=>`<div><div class="objective ${values[i]>=o.count?'done':''}"><span>${esc(o.label)}</span><b>${values[i]}/${o.count}</b></div>${progress(values[i],o.count)}
     ${o.destination?`<p class="small muted">장소: ${esc(ZONES[o.destination.zone]?.name)} · ${esc(o.destination.name)}</p>`:''}
     ${o.kind==='deliver'?'<p class="small muted">보고할 때 표시된 재료를 전달합니다.</p>':''}</div>`).join('')}</div>
    <div class="reward-line">${current.gold} G · ${current.xp} EXP${current.final?' · 직업의 서약과 길손의 증표':''}</div>`;
   if(!d.started){
    html+=`<div class="story-requirements">${d.requirements.map(r=>`<div class="objective ${r.value>=r.goal?'done':''}"><span>${esc(r.label)}</span><b>${r.value}/${r.goal}</b></div>`).join('')}</div>
     <button class="btn primary" data-act="storyAccept" data-id="${d.id}" ${!near||!d.eligible?'disabled':''}>${!near?'스승 가까이에서 시작':'첫 장을 시작한다'}</button>`;
   }else{
    html+=`<div class="story-actions">${btn('이 이야기를 추적','storyTrack',d.id)}${btn(d.active?'잠시 멈추기':'수련 이어가기',d.active?'storyPause':'storyResume',d.id)}</div>`;
    if(current.final&&d.tier==='hidden'){
     html+=`<p class="small">끝까지 걸어온 당신에게 묻습니다. 어떤 약속을 남기겠습니까? 어느 선택이든 같은 직업이 열리며 기록이 달라집니다.</p>
      <div class="story-actions">${['protect','remember'].map(v=>`<button class="btn primary" data-act="storyClaim" data-id="${d.id}" data-chapter="${current.index}" data-vow="${v}" ${!near||!ready||!d.active?'disabled':''}>${v==='protect'?'돌아올 길을 지킨다':'이름과 기억을 이어 간다'}</button>`).join('')}</div>`;
    }else html+=`<button class="btn primary" data-act="storyClaim" data-id="${d.id}" data-chapter="${current.index}" ${!near||!ready||!d.active?'disabled':''}>${!near?'스승에게 돌아가 보고':ready?current.final?'마지막 서약을 맺는다':'이번 장을 마친다':'수련 진행 중'}</button>`;
   }
   html+=`<p class="small muted">동시 수련은 3개까지 · 각 장을 수락한 이후의 실제 행동만 기록됩니다. 창을 열어도 전투는 멈추지 않습니다.</p></section>`;
  }
  if(d.history?.length)html+=`<details class="story-history"><summary>지나온 이야기 ${d.history.length}장 다시 읽기</summary>${d.history.map(h=>`<section><h4>${h.number}. ${esc(h.title)}</h4><p>${esc(h.text)}</p></section>`).join('')}</details>`;
  return {title:d.name+'의 전승',eyebrow:'THE UNWRITTEN ATLAS · VOCATION STORIES',html:html+'</div></div>'};
 }
 if(name==='stories'){
  const qs=Object.entries(p.journey?.quests||{}),done=p.journey?.completed||[];
  return {title:'내가 걸어온 직업 이야기',eyebrow:'THREE ACTIVE JOURNEYS · YOUR PROGRESS IS SAVED',html:`
   <div class="info-box">스승을 찾아 이야기를 시작하세요. 일반 4장 · 희귀 6장 · 영웅 8장 · 히든 10장. 동시에 세 이야기를 수련할 수 있고, 잠시 멈춰도 기록은 사라지지 않습니다. 이미 얻은 직업은 계속 사용할 수 있습니다.</div>
   <div class="settings-actions">${btn('36개 직업 살펴보기','openJobs')}${btn('스승을 찾을 대륙 지도','openAtlas')}</div>
   ${!qs.length?`<div class="story-empty"><h3>첫 스승을 만나 보세요</h3><p>별여울 마을 남쪽의 수련길에 9명의 스승이 있습니다. ${esc(keyLabel('interact','F'))}로 대화하면 첫 이야기를 시작할 수 있습니다.</p></div>`:''}
   <div class="story-journal-grid">${qs.map(([id,q])=>`<article class="card"><span class="badge ${q.active?'good':''}">${q.active?'수련 중':'기록 보관'} · ${q.chapter+1}장</span><h3>${esc(CLASSES[id].name)}</h3><p>${p.journey.tracked===id?'현재 추적 중인 이야기입니다.':'각 장의 목표는 이야기를 펼치면 확인할 수 있습니다.'}</p>${btn('이야기 펼치기','storyView',id)}</article>`).join('')}</div>
   ${done.length?`<h3>맺은 서약 ${done.length}/36</h3><div class="story-journal-grid">${done.map(id=>`<article class="card"><span class="badge good">완료</span><h3>${esc(CLASSES[id].name)}</h3>${btn('서약 다시 읽기','storyView',id)}</article>`).join('')}</div>`:''}`};
 }
 if(name==='map'){
  const totals=atlasTotals(ZONES),current=ZONES[p.zone],chosen=PROVINCES.find(r=>r.id===tab)||null,showCore=!chosen;
  const list=showCore?Object.values(ZONES).filter(z=>!z.expedition&&!z.challenge&&!z.dungeon&&!z.secretRealm)
   .sort((a,b)=>a.minLevel-b.minLevel||Number(b.id==='town')-Number(a.id==='town')||a.name.localeCompare(b.name,'ko')):
   EXPEDITION_ZONES.filter(z=>z.province===chosen.id);
  const region=p.atlas?.provinces?.[chosen?.id]||{camps:0,pages:0,rep:0};
  return {title:'아득한 길의 대륙 지도',eyebrow:`${totals.regions} REGIONS · ${p.discovery.visited.filter(id=>ZONES[id]&&!ZONES[id].challenge&&!ZONES[id].dungeon&&!ZONES[id].secretRealm).length} DISCOVERED`,html:`
   <div class="atlas-overview"><div><span class="eyebrow">THE UNWRITTEN ATLAS</span><h3>${showCore?'별여울에서 새벽의 끝까지':esc(chosen.name)+' · '+provinceRange(chosen)}</h3><p>${showCore?'모든 거점을 필요 레벨 순서로 모았습니다. 이름 있는 권역을 고르면 그 땅의 아홉 원정 지역과 연결된 길을 볼 수 있습니다.':esc(chosen.motto)}</p><p class="small">${totals.regions}지역 · ${totals.provinces}개 권역 · 원정 ${totals.expeditions}구역 · 야영지 ${p.atlas.waypoints.length}/${totals.expeditions} · 기록 ${p.atlas.totalPages||0}/${totals.pages}</p></div><div class="atlas-stat"><strong>${p.atlas.waypoints.length}</strong><span>깨어난 귀환석</span></div></div>
   <div class="tabs atlas-tabs atlas-province-tabs"><button class="tab ${showCore?'active':''}" data-act="tab" data-id="core"><span>전체 거점</span><small>레벨 순서</small></button>${[...PROVINCES].sort((a,b)=>a.level-b.level).map(r=>`<button class="tab ${chosen?.id===r.id?'active':''}" data-act="tab" data-id="${r.id}"><span>${esc(r.name)}</span><small>${provinceRange(r)}</small></button>`).join('')}</div>
   <div class="atlas-layout"><section><h3>${esc(current.name)} · 현재 지역</h3><canvas id="large-map" width="650" height="430"></canvas><p class="small muted">밝은 곳은 탐사한 땅 · 초록: 야영지 · 분홍: 시련 · 금빛: 기록/스승<br>지도는 이동 경로를 보여 주며 클릭으로 순간이동하지 않습니다. 직접 깨운 귀환석만 사용할 수 있습니다.</p>
    <div class="settings-actions">${btn('별여울 마을로 귀환','return')} ${btn('도전의 전당','openChallenges')} ${btn('파티 던전','openDungeons')}</div>
    ${state?.fieldTrial?`<div class="info-box">기억의 시련 ${state.fieldTrial.wave}/3 · 남은 적 ${state.fieldTrial.alive} · ${timeLeft(state.fieldTrial.ends-now)}</div>`:''}
   </section><section>
   ${!showCore?`<div class="info-box">야영지 ${region.camps}/9 · 기록 ${region.pages}/18 · 이 권역의 명성 ${region.rep}<br>구역은 가로·세로 이웃과 연결됩니다. 중심 지역 「${esc(ZONES[chosen.id].name)}」 남동쪽 관문에서 첫 구역으로 갑니다.</div>`:''}
   <div class="${showCore?'atlas-core-grid':'atlas-sector-grid'}">${list.map(z=>{
    const seen=p.discovery.visited.includes(z.id),attuned=p.atlas.waypoints.includes(z.id),here=p.zone===z.id;
    const province=showCore&&PROVINCES.find(r=>r.id===z.id);
    return `<article class="atlas-sector ${here?'here':''} ${seen?'seen':''}" data-zone="${z.id}"><span class="badge">${here?'현재 위치':attuned?'귀환석 활성':seen?'탐사 중':'미답지'}</span><small>${showCore?'':String(z.sector+1).padStart(2,'0')+' · '}Lv.${z.minLevel}+</small><h4>${esc(z.name)}</h4><p>${z.width} × ${z.height}칸${z.expedition&&z.endgame?` · 적 Lv.${z.minLevel}~${z.maxLevel}`:''}</p>${province?btn('권역 9곳 보기','tab',province.id):''}${!here&&(showCore&&seen||attuned)?btn('귀환석 이동',z.expedition?'waypoint':'travel',z.id):'<span class="small muted">'+(here?'이곳의 이야기를 찾아보세요':'직접 방문해서 길을 여세요')+'</span>'}</article>`;
   }).join('')}</div>
   ${!showCore?`<div class="atlas-completion"><h4>${esc(chosen.name)} 완주 기록</h4><p>야영지 9곳 + 기록 18장 · ${rewardText(expeditionRewards(chosen,'survey'))} · 칭호</p>${btn(region.claimed?'보상 수령 완료':'탐사 기록 제출','surveyClaim',chosen.id,region.claimed||region.camps<9||region.pages<18?'disabled':'')}</div>`:''}
   </section></div>`};
 }
 if(name==='atlasScene'&&data){
  const d=data,z=ZONES[d.zone],a=p.atlas,day=new Date(now+9*3600000).toISOString().slice(0,10);
  const contract=a.contracts[d.zone]?.day===day?a.contracts[d.zone]:null;
  let html=`<div class="field-dialog"><span class="eyebrow">${esc(PROVINCES.find(r=>r.id===z.province)?.name||'원정 기록')}</span><h3>${esc(d.name)}</h3><p class="story-prose">${esc(d.text)}</p></div>`;
  for(const signal of d.signals||[])html+=`<div class="secret-signal"><b>✦ 숨겨진 문장 ${signal.step}/${signal.total}</b><p>${esc(signal.text)}</p></div>`;
  if(d.kind==='camp'){
   html+=`<div class="info-box">귀환석이 활성화되었습니다. ${esc(keyLabel('map','M'))} 지도에서 이미 깨운 다른 야영지로 이동할 수 있습니다. 야영지 의뢰는 한국 시간 자정에 초기화되며, 수락 이후 이 지역에서 한 행동만 셉니다.</div>`;
   if(!contract)html+=`<article class="card"><h3>길을 지키는 순찰</h3><p>이 구역의 몬스터 12마리를 처치하고 지정된 재료를 5번 채집해 주세요.</p><div class="reward-line">${rewardText(expeditionRewards(z,'contract'))} · 명성 +1</div>${btn('오늘의 야영지 의뢰 받기','contractAccept')}</article>`;
   else html+=`<article class="card"><h3>길을 지키는 순찰</h3><div class="objective"><span>${esc(MONSTERS[contract.monster].name)} 처치</span><b>${contract.kills}/${contract.killGoal}</b></div><div class="objective"><span>${esc(ITEMS[contract.resource].name)} 채집</span><b>${contract.gathered}/${contract.gatherGoal}</b></div><div class="reward-line">${rewardText(expeditionRewards(z,'contract'))} · 명성 +1</div>${btn(contract.claimed?'오늘의 보고 완료':'야영지에 보고','contractClaim','',contract.claimed||contract.kills<contract.killGoal||contract.gathered<contract.gatherGoal?'disabled':'')}</article>`;
   html+=`<div class="settings-actions">${btn('귀환석 지도 열기','openAtlas')}${btn('별여울로 이동','waypoint','town')}</div>`;
  }else if(d.kind==='trial'){
   const trial=state?.zone===d.zone?state.fieldTrial:d.trial;
   html+=`<div class="trial-rules"><h3>세 번의 기억</h3><p>첫 기억 6마리 → 두 번째 기억 8마리 → 마지막 파수꾼<br>제한 시간 6분 · 동료와 함께 도전 · 죽거나 지역을 떠나지 않고 직접 전투에 기여해야 완료됩니다.</p><p>${rewardText(expeditionRewards(z,'trial'))} · 명성 +2</p><p>이 제단의 물품 보상은 하루 한 번입니다. 재도전으로 직업 수련은 계속할 수 있습니다.</p></div>`;
   html+=trial?`<div class="info-box">진행 ${trial.wave}/3 · 남은 적 ${trial.alive} · 남은 시간 ${timeLeft(trial.ends-now)}</div>`:`${btn(a.trialClaims[d.zone]===day?'수련을 위해 다시 도전':'기억의 시련 시작','trialStart')}`;
  }else html+=`<p class="small muted">처음 읽은 기록은 탐험 수첩에 남고 경험치와 길손의 증표를 줍니다. 이미 읽은 기록도 현재 이야기의 목표라면 다시 읽을 수 있습니다.</p>`;
  return {title:d.name,eyebrow:'A STORY WAITING AT THE EDGE',html:html+`<div class="settings-actions">${btn('계속 탐험','close')}${btn('내 전직 이야기','openStories')}</div>`};
 }
 return null;
}
