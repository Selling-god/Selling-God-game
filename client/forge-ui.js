import {ITEMS,RARITIES} from '../shared/content.js';
import {forgeQuote,FORGE_STYLES} from '../shared/forge.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString('ko-KR');
export function forgePanel(p,session){
 const item=ITEMS[session?.id];if(!item||item.type!=='gear')return {title:'제련대',eyebrow:'FORGE',html:'<p>강화할 장비를 다시 선택하세요.</p>'};
 const lv=p.enhancements[session.id]||0,mode=session.mode||'steady',quote=forgeQuote(lv,p.enhancePity[session.id]||0,item.level,mode);
 const enough=!quote.max&&p.gold>=quote.gold&&Object.entries(quote.cost).every(([k,n])=>(p.inventory[k]||0)>=n);
 const steps=['불꽃 준비','풀무질','망치 담금질'];
 const result=session.result;
 return {title:'별빛 대장간 · 별의 제련',eyebrow:`ENHANCEMENT RITUAL · +${lv} → +${Math.min(10,lv+1)}`,html:`
 <div class="forge-hero ${result?'forged':''}"><div class="forge-sparks">✦　✦　✧</div><div class="forge-weapon">⚒</div><h3>${esc(item.name)}</h3><span class="enhance-level">현재 +${lv}</span><div class="forge-meter"><i style="width:${session.strikes/3*100}%"></i></div><small>${result?(result.success?'✦ 제련 성공! 별빛이 무기에 깃들었습니다.':'제련 실패. 장비와 단계는 그대로, 다음 확률에 보정됩니다.'):`${steps[Math.min(session.strikes,2)]} · ${session.strikes}/3`}</small></div>
 <div class="forge-modes">${Object.entries(FORGE_STYLES).map(([key,opt])=>{
  const q=forgeQuote(lv,p.enhancePity[session.id]||0,item.level,key);
  return `<button class="forge-mode ${mode===key?'selected':''}" data-act="forgeMode" data-id="${key}" ${session.strikes||result||lv<3&&key!=='steady'?'disabled':''}><span style="color:${opt.color}">✦ ${opt.name}</span><small>${esc(opt.desc)}</small><b>${Math.round(q.rate*100)}%</b></button>`;
 }).join('')}</div>
 <div class="forge-cost"><div><b>이번 성공률</b><strong>${Math.round(quote.rate*100)}%</strong></div><div><b>비용</b><strong>${fmt(quote.gold)} G</strong></div><p>${Object.entries(quote.cost).map(([id,count])=>`${esc(ITEMS[id]?.name||id)} ${p.inventory[id]||0}/${count}`).join(' · ')||'재료 없음'}</p></div>
 ${result?`<div class="info-box ${result.success?'good':''}"><b>${result.success?'강화 성공':'실패 보정 +1'}</b> · ${esc(result.name)} +${result.level}<br>현재 성공률 ${Math.round(result.rate*100)}% · 다음 기본 성공률 ${Math.round(result.nextRate*100)}%</div><div class="settings-actions"><button class="btn primary" data-act="forgeAgain" ${quote.max?'disabled':''}>다시 제련하기</button><button class="btn" data-act="forgeBack">장비 목록</button></div>`:
 `<p class="small muted">준비·풀무질·망치질 순서로 3번 조작합니다. 성공 여부는 타이밍 조작과 무관하게 <b>선택한 제련 방식과 실패 보정</b>으로 서버에서 결정됩니다. 장비 파괴·단계 하락은 없습니다.</p><div class="settings-actions"><button class="btn primary forge-strike" data-act="forgeStrike" ${!enough||quote.max?'disabled':''}>${quote.max?'최대 강화':steps[Math.min(session.strikes,2)]+' · '+(session.strikes+1)+' / 3'}</button><button class="btn" data-act="forgeBack">취소</button></div>`}`};
}
