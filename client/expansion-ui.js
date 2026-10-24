import {CLASSES,ZONES,MONSTERS} from '../shared/content.js';
import {JOB_TIERS,DAILY_TASKS,ACHIEVEMENTS,RELICS} from '../shared/expansion.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));
export function timeLeft(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(sec/60)}분 ${String(sec%60).padStart(2,'0')}초`;}
export function expansionPanel(name,{profile:p,tab,book,events=[],now=Date.now(),data,keyLabel=(_id,fallback='미지정')=>fallback}){
 if(name==='jobs'){
  const selected=['all','common','rare','epic','hidden','owned'].includes(tab)?tab:'common';
  const list=(book||[]).filter(j=>selected==='all'||selected==='owned'&&j.owned||selected===j.tier);
  const html=`<div class="exp-intro"><img src="/assets/${esc(p.classId)}_s_0.png" alt=""><div><span class="eyebrow">YOUR PATH IS YOURS</span><h3>${esc(CLASSES[p.classId].name)}</h3><p>36개의 길 · 발견 ${p.discovery.jobs.filter(id=>id!=='novice').length}/36 · 전직은 마을에서 무료<br>현재 직업 숙련 ${p.discovery.mastery[p.classId]||0} · 사냥·채집·의뢰로 축적</p></div></div>
   <div class="info-box">모든 직업에는 스승과 전직 이야기가 있습니다. 일반 4장·희귀 6장·영웅 8장·히든 10장을 마치면 열립니다. 히든 직업은 새 원정 지역의 문장을 순서대로 읽어야 이름이 드러납니다. 전직해도 레벨과 장비, 각 직업 숙련은 유지됩니다. <button class="btn small" data-act="changeJob" data-id="novice" ${p.classId==='novice'?'disabled':''}>무직으로 돌아가기</button></div>
   <div class="tabs exp-tabs">${[['common','일반 9'],['rare','희귀 12'],['epic','영웅 9'],['hidden','히든 6'],['owned','해금한 직업'],['all','전체']].map(([id,label])=>`<button class="tab ${selected===id?'active':''}" data-act="tab" data-id="${id}">${label}</button>`).join('')}</div>
   ${!book?'<p>길의 기록을 읽는 중…</p>':!list.length?'<div class="info-box">아직 이 분류의 직업을 얻지 못했습니다. 일반 직업부터 확인해 보세요.</div>':''}
   <div class="job-grid">${list.map(j=>{
    const c=CLASSES[j.id],tier=JOB_TIERS[j.tier],current=p.classId===j.id;
    return `<article class="job-card ${j.owned?'owned':''} ${current?'current':''}" style="--job-color:${tier.color}"><header><img src="/assets/${j.discovered?j.id:'novice'}_s_0.png" class="${j.discovered?'':'mystery'}" alt=""><div><span class="badge">${tier.name}${current?' · 현재':j.owned?' · 해금':''}</span><h3>${esc(j.name)}</h3></div></header>
      <p class="job-hint">${esc(j.hint)}</p>
      ${j.discovered?`<p class="job-passive">${esc(c.passiveText)}</p><div class="job-skills">${c.skills.filter(s=>s.id!=='basic').map(s=>`<span title="${esc(s.desc)}"><b>${esc(keyLabel(s.id,s.key))}</b> ${esc(s.name)}</span>`).join('')}</div>
      <div class="job-requirements">${j.requirements.map(r=>`<div class="requirement ${r.value>=r.goal?'met':''}"><span>${r.value>=r.goal?'✓':'·'} ${esc(r.label)}</span><b>${Math.min(r.value,r.goal)}/${r.goal}</b></div>`).join('')}</div>`:'<div class="sealed-sign">?</div><p class="small muted">유물의 문장을 읽고 탐험 기록을 이어 가세요.</p>'}
      <p class="small">${j.story?.done?'서약 완료':j.story?.chapter?`${j.story.chapter}/${j.story.total}장 · ${j.story.active?'수련 중':'기록 보관'}`:`전직 이야기 ${j.story?.total||4}장`}</p>
      <div class="story-actions"><button class="btn small primary" data-act="storyView" data-id="${j.id}">${j.story?.done?'이야기 다시 읽기':j.discovered?'전직 이야기':'숨겨진 문장'}</button>
      <button class="btn small ${j.owned?'primary':''}" data-act="changeJob" data-id="${j.id}" ${!j.owned||current?'disabled':''}>${current?'선택 중':j.owned?'이 직업으로 전직':'서약을 마쳐야 전직'}</button></div></article>`;
   }).join('')}</div>`;
  return {title:'발견하는 직업 도감',eyebrow:'36 PATHS · COMMON / RARE / EPIC / HIDDEN',html};
 }
 if(name==='events'){
  return {title:'정시 월드 보스',eyebrow:'WORLD BOSSES · KOREA STANDARD TIME',html:`
   <div class="challenge-entry"><div><b>출현을 기다리는 동안, 나만의 기록에 도전하세요</b><p>30층 탑 · 룬 퍼즐 · 생존전 · 보스 연전 · 수정 수호전</p></div><button class="btn small primary" data-act="openChallenges">도전의 전당</button></div>
   <div class="info-box">한국 시간 매시 <b>00 · 15 · 30 · 45분</b>에 서로 다른 보스가 나타나며, 최대 10분 동안 머뭅니다. 참여 후 직접 공격하거나 전투 중인 파티원을 치유하세요. 같은 회차 보상은 계정당 한 번입니다. 서버가 잠들었다가 출현 시간 안에 깨어나면 남은 시간만 열립니다.</div>
   <div class="event-grid">${events.map(e=>{
    const active=e.status==='active',status={active:'전투 진행 중',defeated:'처치 완료',expired:'종료',preparing:'소환 준비 중',unavailable:'저장소 설정 필요',upcoming:'다음 출현'}[e.status]||'대기';
    return `<article class="event-card ${active?'active':''}" style="--job-color:${e.color}"><div class="event-art"><span class="world-emblem">${active?'✦':'◇'}</span><div><small>매시 ${String(e.minute).padStart(2,'0')}분 · Lv.${e.level}+</small><h3>${esc(e.name)}</h3><span>${esc(ZONES[e.zone].name)}</span></div></div><p>${esc(e.desc)}</p>
     <div class="event-status"><b>${status}</b><span data-countdown="${active?e.end:e.status==='defeated'?e.next:e.start}" data-countdown-mode="${active?'남은 시간':'다음 출현'}">${active?'남은 시간 ':e.status==='defeated'?'다음 출현 ':'출현까지 '}${timeLeft((active?e.end:e.status==='defeated'?e.next:e.start)-now)}</span></div>
     ${active?`<div class="event-hp"><i style="width:${Math.max(0,Math.min(100,e.hp/Math.max(1,e.maxHp)*100))}%"></i></div>`:''}
     <small>예정 ${stamp(e.start)}~${stamp(e.end)} · 거인의 인장 / 경험치 / 골드</small><button class="btn small ${active?'primary':''}" data-act="worldJoin" data-id="${e.id}" ${!active||p.level<e.level?'disabled':''}>${p.level<e.level?`Lv.${e.level} 필요`:active?'전투 지역으로 이동':'출현 대기'}</button></article>`;
   }).join('')}</div>`};
 }
 if(name==='chronicle'){
  let html=`<div class="challenge-entry"><div><span class="eyebrow">FIVE NEW CHALLENGES</span><h3>도전의 전당</h3><p>탑을 오르고, 기억을 시험하고, 밀려오는 적을 막으세요.<br>다섯 가지 도전 · 최고 기록 · 첫 클리어 보상 · 증표 교환</p></div><button class="btn primary" data-act="openChallenges">도전 선택하기</button></div><div class="tabs exp-tabs">${[['all','일일 의뢰'],['exploration','유물과 단서'],['bestiary','몬스터 도감'],['achievements','업적']].map(([id,label])=>`<button class="tab ${tab===id?'active':''}" data-act="tab" data-id="${id}">${label}</button>`).join('')}</div>`;
  if(tab==='exploration'){
   html+=`<div class="info-box">지역 ${p.discovery.visited.filter(id=>ZONES[id]&&!ZONES[id].challenge).length}/${Object.values(ZONES).filter(z=>!z.challenge).length} · 유물 ${p.discovery.relics.length}/20 · 일부 문장은 순서대로 읽어야 이어집니다. 이미 읽은 유물에도 ${esc(keyLabel('interact','F'))}로 다시 말을 걸 수 있습니다.</div>`;
   html+=`<div class="card-list">${RELICS.map(r=>{
    const known=p.discovery.relics.includes(r.id),visited=p.discovery.visited.includes(r.zone);
    return `<article class="card relic-card"><div class="card-head"><h3>${known?esc(r.name):visited?'해독하지 않은 유물':'알 수 없는 기록'}</h3><span class="badge ${known?'good':''}">${known?'발견':'미발견'}</span></div><p>${visited?esc(ZONES[r.zone].name):'아직 방문하지 않은 땅'}${known?' · '+esc(r.text):''}</p></article>`;
   }).join('')}</div>`;
  }else if(tab==='bestiary'){
   html+=`<div class="info-box">직접 또는 파티와 처치한 몬스터의 기록이 쌓입니다. 지역 보스와 정시 월드 보스는 서로 다른 기록입니다.</div><div class="bestiary-grid">`;
   html+=Object.entries(MONSTERS).map(([id,m])=>{
    const n=p.discovery.killTypes[id]||0;
    return `<article class="card"><span class="badge">${m.worldBoss?'월드 보스':m.boss?'지역 보스':'몬스터'} · Lv.${m.level}</span><h3>${n?esc(m.name):'미발견'}</h3><p>${n?`${n}회 처치 · 체력 ${m.hp}`:'탐험과 전투를 통해 이름을 기록하세요.'}</p></article>`;
   }).join('')+'</div>';
  }else if(tab==='achievements'){
   html+=`<div class="card-list">${ACHIEVEMENTS.map(a=>{
    const value=p.achievementProgress?.[a.id]||0,claimed=p.discovery.claims.includes(a.id),done=value>=a.goal;
    return `<article class="card"><div class="card-head"><h3>${esc(a.name)}</h3><span class="badge ${done?'good':''}">${Math.min(value,a.goal)}/${a.goal}</span></div><p>${a.gold} G · 같은 이름의 칭호</p><button class="btn small ${done?'primary':''}" data-act="achievement" data-id="${a.id}" ${!done||claimed?'disabled':''}>${claimed?'수령 완료':'보상 받기'}</button></article>`;
   }).join('')}</div>`;
  }else{
   html+=`<div class="info-box">${esc(p.daily.key)} 의뢰 · 한국 시간 자정 초기화 · 보상은 마을에서 수령합니다.</div><div class="card-list">${DAILY_TASKS.map(t=>{
    const value=p.daily[t.metric]||0,done=value>=t.goal,claimed=p.daily.claims.includes(t.id);
    return `<article class="card"><div class="card-head"><h3>${esc(t.name)}</h3><span class="badge ${done?'good':''}">${Math.min(value,t.goal)}/${t.goal}</span></div><p>${t.desc}</p><div class="reward-line">${t.gold} G · ${t.xp} EXP</div><button class="btn small ${done?'primary':''}" data-act="dailyClaim" data-id="${t.id}" ${!done||claimed?'disabled':''}>${claimed?'오늘 수령 완료':'보상 받기'}</button></article>`;
   }).join('')}</div>`;
  }
  return {title:'여행자의 탐험 수첩',eyebrow:'DAILY / RELICS / BESTIARY / ACHIEVEMENTS',html};
 }
 if(name==='relic'&&data){
  return {title:data.name,eyebrow:data.first?'A NEW MEMORY FOUND':'READ THE HIDDEN SENTENCE',html:`
   <div class="relic-story"><img src="/assets/relic_stone.png" alt=""><p>“${esc(data.text)}”</p></div>
   ${data.steps.map(s=>`<article class="card"><div class="card-head"><h3>${esc(s.title)}</h3><span class="badge">${s.step}/${s.total}</span></div><p>${esc(s.message)}</p></article>`).join('')}
   <div class="settings-actions"><button class="btn primary" data-act="openJobs">전직 도감</button><button class="btn" data-act="close">계속 탐험하기</button></div>`};
 }
 return null;
}
