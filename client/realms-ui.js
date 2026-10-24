import {CLASSES,ITEMS,ZONES} from '../shared/content.js';
import {REALMS,REALM_BY_ID,realmPart,realmWeapon} from '../shared/realms.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(name,act,id='',extra='')=>`<button class="btn small" data-act="${act}" data-id="${esc(id)}" ${extra}>${name}</button>`;
const signed=n=>(n>=0?'+':'')+n;
const stats=i=>[['atk','공격력'],['hp','최대 체력'],['mp','최대 마나'],['def','방어력'],['crit','치명타']]
 .filter(([key])=>i[key]).map(([key,label])=>`${label} ${signed(i[key])}${key==='crit'?'%':''}`).join(' · ');
export function realmsPanel({profile:p,state,tab,data,keyLabel=(_id,fallback='미지정')=>fallback}){
 const a=p.realms||{known:[],unlocked:[],trials:[],cleared:[],weapons:{},requirements:{}},known=REALMS.filter(r=>a.known.includes(r.id));
 const chosen=known.find(r=>r.id===tab)||known.find(r=>r.id===data?.id)||known[0];
 let html=`<div class="info-box">세계의 가장자리에는 두 기록과 직접 실행한 의식이 만나야 열리는 길이 있습니다. 바깥 경계와 정원의 서약은 각자 풀고, 안쪽 성소에서는 다른 탐험가와 함께 싸울 수 있습니다.</div>`;
 if(!chosen)return {title:'지도에 없는 세계',eyebrow:'TRACES BEYOND THE ATLAS',html:html+`<section class="realm-card"><h3>아직 이름이 없는 흔적</h3><p>태양흔 고원의 「첫 여명의 제단」 석판, 심해의 회랑의 「난파 함대의 묘지」 관측 표식을 읽어 보세요. 두 번째 지역의 야영지 동북쪽에는 이름 없는 장치가 남아 있습니다.</p>${button('대륙 지도 열기','openAtlas')}</section>`};
 const r=chosen,unlocked=a.unlocked.includes(r.id),attuned=a.trials.includes(r.id),cleared=a.cleared.includes(r.id),live=state?.realm?.id===r.id?state.realm:null;
 const part=a.weapons[r.id]?.part||realmPart(CLASSES[p.classId]?.family||p.classId),weapon=ITEMS[realmWeapon(r.id,part)],stable=ITEMS[realmWeapon(r.id,part,true)];
 const atAltar=live?.area==='sanctum'&&live.markers.some(m=>m.realmKind==='altar'&&m.active);
 html+=`<div class="tabs">${known.map(x=>button(`${esc(x.name)} · Lv.${x.level}`,'tab',x.id)).join('')}</div>
  <div class="realm-entry"><span class="eyebrow">${unlocked?'OPENED BOUNDARY':'A NAME IN THE MARGIN'}</span><h3>${esc(r.name)} · Lv.${r.level}</h3>
  <p>${unlocked?'경계는 열려 있습니다. 별여울 마을 또는 이 경계문에서 정원으로 다시 들어갈 수 있습니다.':'먼저 두 기록을 읽고 경계문 주변 장치의 순서를 직접 완성하세요.'}</p>
  <p class="small">입구: ${esc(ZONES[r.entryZone].name)}의 야영지 동북쪽 · 상호작용 ${esc(keyLabel('interact','F'))}</p>
  ${button(unlocked?'정원으로 들어가기':'경계 의식 미완료','realmEnter',r.id,unlocked?'':'disabled')}
  ${ZONES[p.zone]?.secretRealm?button('바깥 세계로 귀환','realmExit'):''}</div>
  <div class="realm-grid"><section class="realm-card"><h3>1. 바깥의 두 기록과 경계</h3>
  ${r.clues.map((id,i)=>`<p class="${a.requirements?.[r.id]?.[id]?'good':'muted'}">${a.requirements?.[r.id]?.[id]?'✓':'◇'} ${esc(r.clueNames[i])}</p>`).join('')}
  <p>${esc(r.entryHint)}</p><p class="small">진행 ${unlocked?3:live?.entryStep||0}/3 · 잘못 누르거나 90초 넘게 멈추면 순서가 초기화됩니다.</p></section>
  <section class="realm-card"><h3>2. ${esc(r.gardenName)}</h3><p>${esc(r.trialHint)}</p><p>${attuned?'✓ 개인 서약 완료':`개인 서약 ${live?.trialStep||0}/3`}</p>
  <p class="small">서약이 끝나야 북쪽 문을 통과하고 파수꾼에게 피해를 줄 수 있습니다. 다른 사람이 장치를 눌러도 본인의 순서는 진행되지 않습니다.</p></section>
  <section class="realm-card"><h3>3. ${esc(r.sanctumName)}</h3><p>${esc(r.bossName)}</p><p>서약을 마친 상태로 직접 전투에 기여하고 살아남아야 첫 완주가 기록됩니다. 이미 받은 완주 EXP·서약핵·전직 단서는 다시 지급하지 않습니다.</p>
  <p>${cleared?'✓ 첫 완주 기록':'아직 쓰러뜨리지 못한 파수꾼'}</p><p>전직의 전설적 흔적: ${r.jobs.map(id=>esc(CLASSES[id].name)).join(' · ')}</p>
  <p class="small">각 전직의 다음 비밀 단서 1개가 실제로 진행됩니다. 직업 자체는 기존 스승의 전직 이야기를 완수해 얻습니다.</p>${button('전직 이야기 확인','openStories')}</section>
  <section class="realm-card"><h3>서약핵의 무기 · 현재 선택 계열</h3><h4>${esc(weapon.name)}</h4><p>${stats(weapon)}</p><p>${esc(r.weaponText)}</p>
  <p class="small">안정화 상태: ${stats(stable)}<br>변환 비용: ${esc(ITEMS[r.material].name)} 3개 + ${r.level*5} G. 강화 단계와 장착 상태를 유지하며 역변환도 가능합니다.</p>
  ${!a.weapons[r.id]?button('현재 직업 계열 무기 한 자루 받기','realmClaim',r.id,atAltar&&cleared?'':'disabled'):
   button(a.weapons[r.id].stable?'힘과 대가를 다시 받아들이기':'정화·안정화·제어하기','realmTune',r.id,`data-stable="${!a.weapons[r.id].stable}" ${atAltar?'':'disabled'}`)}
  ${!atAltar?'<p class="small muted">무기 수령과 변환은 안쪽 성소 북쪽 제단에서만 가능합니다.</p>':''}</section></div>`;
 if(live){
  const nearby=live.markers.filter(m=>m.active);
  html+=`<section class="realm-card"><h3>지금 닿아 있는 장치</h3><p>${esc(live.hint)}</p>${nearby.length?nearby.map(m=>button(esc(m.name),'realmDevice',m.id)).join(' '):'<p class="small muted">지도의 문양 가까이 걸어가세요. 멀리 있는 장치는 창에서 누를 수 없습니다.</p>'}</section>`;
 }
 return {title:r.name+'의 비밀 기록',eyebrow:'THREE HIDDEN WORLDS · YOUR OWN VOW',html};
}

export function realmHUD(realm,now,{keyLabel=(_id,fallback='미지정')=>fallback}={}){
 if(!realm)return '';
 const stage=realm.area==='entry'?(realm.unlocked?'경계 개방':`경계 의식 ${realm.entryStep}/3`):
  realm.area==='garden'?(realm.attuned?'개인 서약 완료':`개인 서약 ${realm.trialStep}/3`):(realm.cleared?'첫 완주 기록':'성소의 파수꾼');
 const nearby=realm.markers.filter(m=>m.active);
 return `<div class="realm-card"><span class="eyebrow">${esc(stage)}</span><h4>${esc(realm.name)}</h4><p>${esc(realm.hint)}</p>
  <div class="settings-actions">${button('비밀 기록','openRealms',realm.known?realm.id:'')}${nearby.slice(0,2).map(m=>button(`${esc(m.name)} · ${esc(keyLabel('interact','F'))}`,'realmDevice',m.id)).join('')}</div></div>`;
}

/** World-space pixel markers remain legible when optional combat effects are off. */
export function drawRealmOverlay(renderer,realm,t,layer='all'){
 if(!realm)return;const c=renderer.ctx;
 c.save();c.imageSmoothingEnabled=false;
 for(const m of realm.markers){
  const x=Math.round(m.x/4)*4,y=Math.round(m.y/4)*4,color=m.done?'#9dd4a5':realm.color;
  if(layer==='all'||layer==='ground'){
   c.fillStyle='#101d2b';c.globalAlpha=.78;c.fillRect(x-28,y-20,56,40);c.globalAlpha=1;
   c.fillStyle=color;
   for(let offset=-24;offset<=24;offset+=8){c.fillRect(x+offset,y-24,6,4);c.fillRect(x+offset,y+20,6,4);}
   c.fillRect(x-28,y-20,4,40);c.fillRect(x+24,y-20,4,40);
   if(m.realmKind==='puzzle'||m.realmKind==='trial'){
    for(let n=0;n<=m.index;n++)c.fillRect(x-4*m.index+n*8,y-4,4,8);
   }
  }
  if(layer==='all'||layer==='foreground'){
   c.globalAlpha=1;c.fillStyle=m.active?'#fff1ca':color;
   c.fillRect(x-4,y-52,8,8);c.fillRect(x-8,y-48,16,4);
   if(m.active||m.realmKind==='puzzle'||m.realmKind==='trial')renderer.label(m.name,x,y-64,m.active?'#fff2cf':color,10);
  }
 }
 c.restore();
}
