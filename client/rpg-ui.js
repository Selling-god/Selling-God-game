import {getStats,ITEMS,RARITIES,ZONES} from '../shared/content.js';
import {ATTRIBUTES,ATTRIBUTE_KEYS,freePoints,statBudget,spentPoints,resetPrice,enhancementSpec,enhancementBonus} from '../shared/rpg.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n||0).toLocaleString('ko-KR');
export function rpgPanel(name,{profile:p,draft={},data,now=Date.now()}){
 if(name==='stats'){
  const remaining=freePoints(p)-Object.values(draft).reduce((a,b)=>a+b,0);
  const preview=getStats({...p,attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,(p.attributes[k]||0)+(draft[k]||0)]))},now);
  const current=getStats(p,now),price=resetPrice(p);
  return {title:'나만의 성장',eyebrow:`ATTRIBUTES · LV.${p.level} · REMAINING ${remaining}`,html:`
   <div class="attribute-intro"><div><span class="eyebrow">CHOOSE YOUR STRENGTH</span><h3>남은 포인트 <strong>${remaining}</strong></h3><p>레벨이 오를 때마다 4포인트. 전직해도 배분은 유지됩니다.<br>직업마다 힘·민첩·지능의 공격력 반영 비율이 다릅니다.</p></div><button class="btn small" data-act="resetStats">초기화 · ${price===0?'첫 회 무료':fmt(price)+' G'}</button></div>
   <div class="attribute-layout"><div class="attribute-list">${ATTRIBUTE_KEYS.map(k=>{
    const a=ATTRIBUTES[k],value=p.attributes[k]||0,add=draft[k]||0;
    return `<div class="attribute-row"><div><h3>${a.name} <small>${a.short}</small></h3><p>${a.desc}</p></div><div class="stat-stepper"><button class="btn small" data-act="statMinus" data-id="${k}" ${add?'':'disabled'} aria-label="${a.name} 미확정 포인트 빼기">−</button><strong>${value}${add?`<em> +${add}</em>`:''}</strong><button class="btn small" data-act="statPlus" data-id="${k}" ${remaining>0&&value+add<100?'':'disabled'} aria-label="${a.name} 포인트 더하기">+</button></div></div>`;
   }).join('')}</div><aside class="stat-preview"><span class="eyebrow">BEFORE → AFTER</span>${[['atk','공격력'],['def','방어력'],['maxHp','최대 체력'],['maxMp','최대 마나'],['speed','이동 속도'],['crit','치명타 %'],['manaRegen','마나 회복/초']].map(([key,label])=>`<div><span>${label}</span><b>${Number(current[key].toFixed(2))} <i>→</i> <em>${Number(preview[key].toFixed(2))}</em></b></div>`).join('')}<small>치명타 상한 45% · 이동속도 상한 225<br>쇠약 효과가 남았다면 미리보기에도 반영됩니다.</small></aside></div>
   <div class="settings-actions"><button class="btn primary" data-act="applyStats" ${Object.values(draft).some(n=>n>0)?'':'disabled'}>배분 확정</button><button class="btn" data-act="cancelStats">다시 배분</button></div>
   <div class="info-box">확정 전에는 실제 능력치가 바뀌지 않습니다. 초기화는 마을에서만 가능하며 첫 회 무료, 이후 500 G입니다. 배분·초기화로 체력과 마나가 공짜로 회복되지는 않습니다.</div>
   <div class="death-rules"><h3>사망과 회수</h3><p>Lv.1~4는 손실이 없습니다. Lv.5부터 보유 골드 3%(최대 500 G)와 현재 레벨 필요 경험치의 3%를 잃습니다. 경험치는 현재 보유량까지만 잃으며 레벨과 장비는 유지됩니다.</p><p>사망 지점의 영혼을 10분 안에 회수하면 잃은 골드 80%와 잃은 경험치 전부를 돌려받습니다. 한 번 더 죽으면 이전 흔적은 사라집니다. 사망 후 60초간 공격력 −10%, 이동 −8%이며 회수하면 즉시 해제됩니다.</p></div>`};
 }
 if(name==='deathSummary'&&data){
  return {title:data.protected?'별빛의 보호':'다시 돌아올 길',eyebrow:'DEFEAT IS NOT THE END',html:`<div class="death-summary"><div class="soul-sign">✦</div><h3>${data.protected?'초보자 보호 적용':'잠시 뒤 마을에서 부활합니다.'}</h3><p>${data.protected?'Lv.4까지는 사망해도 아무것도 잃지 않습니다.':`${fmt(data.gold)} G · ${fmt(data.xp)} EXP를 잃었습니다.`}</p>${!data.protected?`<p>${esc(ZONES[data.zone]?.name)}의 영혼 흔적을 10분 안에 찾으세요.<br>회수 시 ${fmt(data.recoverGold)} G와 ${fmt(data.recoverXP)} EXP 복원.<br>장비·레벨은 잃지 않습니다. 60초간 일시적 쇠약.</p>`:''}<button class="btn primary" data-act="close">확인</button></div>`};
 }
 return null;
}
export function enhancementRows(p,icon){
 return `<div class="info-box"><b>최대 +10 · 장비 파괴/단계 하락 없음</b><br>+1~+3은 100%, +4부터 확률 강화입니다. 실패하면 같은 장비의 다음 성공률이 10%p씩 올라가며 최대 100%입니다. 성공 시 누적 보정은 초기화됩니다. 시도할 때마다 재료를 소비합니다. 같은 이름의 장비는 강화와 실패 보정을 공유합니다.<br>+4 잔광 · +7 궤도 · +10 별빛 날개. 서버가 결과를 결정합니다.</div>`+
 Object.entries(p.inventory).filter(([id,n])=>n>0&&ITEMS[id]?.type==='gear').map(([id])=>{
  const item=ITEMS[id],lv=p.enhancements[id]||0,q=enhancementSpec(lv,p.enhancePity[id]||0),bonus=enhancementBonus(item.slot,lv);
  const affordable=!q.max&&p.gold>=q.gold&&Object.entries(q.cost).every(([k,n])=>(p.inventory[k]||0)>=n);
  return `<div class="recipe enhance-row">${icon(item.icon)}<div class="recipe-body"><h3 style="color:${RARITIES[item.rarity].color}">${esc(item.name)} <span class="enhance-level">+${lv}</span></h3><p>${Object.entries(bonus).map(([k,v])=>`${{atk:'공격력',def:'방어력',hp:'체력',mp:'마나'}[k]} +${v}`).join(' · ')}</p>
   ${q.max?'<span class="badge good">최대 강화</span>':`<div class="enhance-chance"><b>성공률 ${Math.round(q.rate*100)}%</b><small>${q.pity?'실패 보정 '+q.pity+'회':'기본 확률'}</small></div><p>${fmt(q.gold)} G · ${Object.entries(q.cost).map(([k,n])=>`${esc(ITEMS[k].name)} ${p.inventory[k]||0}/${n}`).join(' · ')}</p>`}</div><button class="btn small primary" data-act="enhance" data-id="${id}" ${affordable?'':'disabled'}>${q.max?'완성':`+${q.next} 시도`}</button></div>`;
 }).join('');
}
