import { COSMETICS, COSMETIC_GROUPS, COSMETIC_COUNT, validPortrait } from '../shared/personalization.js';
import { ITEMS } from '../shared/content.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Math.round(v||0).toLocaleString('ko-KR');
export const VANITY_PAGE_SIZE = 18;

export function vanityPanel(p,tab='costume',{page=0,search='',ownedOnly=false}={}){
  const category=COSMETIC_GROUPS[tab]?tab:'costume',slots=p.vanity?.slots||{},owned=new Set(p.vanity?.owned||[]);
  const query=String(search).trim().slice(0,40).toLocaleLowerCase('ko');
  const list=Object.values(COSMETICS).filter(item=>item.slot===category&&(!ownedOnly||owned.has(item.id))&&(!query||item.name.toLocaleLowerCase('ko').includes(query)||item.desc.toLocaleLowerCase('ko').includes(query))).sort((a,b)=>a.price-b.price||a.name.localeCompare(b.name,'ko')); // Free starter styles appear before premium items.
  const lastPage=Math.max(0,Math.ceil(list.length/VANITY_PAGE_SIZE)-1),currentPage=Math.min(lastPage,Math.max(0,Number.isFinite(page)?Math.floor(page):0));
  const shown=list.slice(currentPage*VANITY_PAGE_SIZE,(currentPage+1)*VANITY_PAGE_SIZE);
  const equipped=slots[category];
  const html=`<div class="vanity-hero"><div><span class="eyebrow">PIXEL ART COLLECTION · 5 SLOTS</span><h3>모험가 외형 공방</h3>
    <p>부위마다 120개 이상의 실루엣·장식 조합이 준비돼 있습니다. 각 부위의 첫 번째 <b>무료 선물</b>부터 이용하세요! 구매하면 바로 장착되며 전투 능력치는 변하지 않습니다. 마을에서는 루미에게 대화하거나 하단 공방 버튼을 누르세요.</p></div><span>✧</span></div>
  <div class="tabs vanity-tabs">${Object.entries(COSMETIC_GROUPS).map(([key,label])=>`<button class="tab ${category===key?'active':''}" data-act="tab" data-id="${key}">${label}<small> ${COSMETIC_COUNT[key]}종</small></button>`).join('')}</div>
  <div class="vanity-catalogue-toolbar">
    <label>외형 이름 찾기<input type="search" id="vanity-search-input" maxlength="40" placeholder="예: 용익, 수정, 성운" value="${esc(search)}" autocomplete="off"></label>
    <button class="btn small" data-act="vanitySearch">검색</button>
    <label class="vanity-owned-toggle"><input id="vanity-owned-only" type="checkbox" ${ownedOnly?'checked':''}> 보유한 외형만</label>
  </div>
  <p class="small muted">${esc(COSMETIC_GROUPS[category])} ${n(COSMETIC_COUNT[category])}종 · 보유 ${n([...owned].filter(id=>COSMETICS[id]?.slot===category).length)}종 · 검색 결과 ${n(list.length)}종${equipped?` · 착용 중: ${esc(COSMETICS[equipped]?.name||'')}`:''}</p>
  <div class="vanity-items">${shown.map(item=>{
    const have=owned.has(item.id),isEquipped=equipped===item.id;
    return `<article class="vanity-item" style="--vanity:${item.color}">
      <canvas class="vanity-item-preview" width="108" height="98" data-vanity-preview="${item.id}" role="img" aria-label="${esc(item.name)} 도트 외형 미리보기"></canvas>
      <div class="grow"><b>${esc(item.name)}</b><small>${esc(item.desc)}</small>
      <small>실루엣 ${item.design.form+1}/12 · 장식 ${item.design.motif+1}/10</small></div>
      <button class="btn small ${have?'':item.price>p.gold?'short-on-gold':'primary'}" data-act="${have?'cosmeticEquip':'cosmeticBuy'}" data-id="${item.id}" data-slot="${category}" ${isEquipped?'disabled':''}>${have?(isEquipped?'장착 중':'장착') : item.price===0?'무료 받기' : item.price>p.gold?`부족 ${n(item.price-p.gold)} G`:`구매 ${n(item.price)} G`}</button></article>`;
  }).join('')||'<div class="info-box">조건에 맞는 외형이 없습니다. 검색어를 지우거나 보유 필터를 해제해 보세요.</div>'}</div>
  <nav class="vanity-pages" aria-label="꾸미기 상점 페이지"><button class="btn small" data-act="vanityPage" data-id="${currentPage-1}" ${currentPage<=0?'disabled':''}>← 이전</button>
   <span>${currentPage+1} / ${lastPage+1} 페이지</span><button class="btn small" data-act="vanityPage" data-id="${currentPage+1}" ${currentPage>=lastPage?'disabled':''}>다음 →</button></nav>
  <button class="btn small" data-act="cosmeticEquip" data-id="" data-slot="${category}" ${!slots[category]?'disabled':''}>이 부위 장식 해제</button>
  <section class="vanity-ticket-shop"><h3>공방 이용권 · 바로 구매</h3><p class="small muted">모라에게 가지 않아도 이용권을 살 수 있습니다. 서버가 골드 차감과 아이템 지급을 직접 확인합니다.</p><div class="vanity-tickets">${[['portrait_ticket','초상화 변환권'],['rename_ticket','닉네임 변경권']].map(([id,label])=>`<div><b>${label}</b><small>보유 ${n(p.inventory[id]||0)}장</small><button class="btn small" data-act="studioTicketBuy" data-id="${id}">${n(ITEMS[id].buy)} G · 1장 구매</button></div>`).join('')}</div></section>
  <section class="vanity-personal"><h3>내 그림을 도트 캐릭터로 변환</h3><p>PNG·JPG·WebP 이미지를 <b>24×32 도트</b>로 변환합니다. 사진 원본은 업로드하지 않으며 작은 도트 색상 데이터만 서버에 저장합니다. 변환권 1개가 필요합니다.</p>
    <div class="vanity-portrait"><div id="pixel-preview" class="pixel-preview">${validPortrait(p.vanity?.avatarPixels)?'적용한 캐릭터 이미지가 있습니다.':'파일을 선택해 미리보기를 만드세요.'}</div>
    <div><label class="btn small" for="portrait-file">그림 선택하기</label><input id="portrait-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    <p class="small muted">파일 2MB 이하 / 변환권 ${n(p.inventory.portrait_ticket||0)}개</p>
    <button class="btn primary" data-act="avatarApply" id="avatar-apply" disabled>변환권 사용 · 적용</button><button class="btn small" data-act="avatarClear" ${p.vanity?.avatarPixels?'':'disabled'}>기본 직업 외형</button></div></div>
    <p class="small muted">다른 플레이어에게도 보이는 이미지이므로 직접 제작했거나 이용할 권리가 있는 그림만 적용하세요.</p></section>
  <section class="vanity-personal"><h3>닉네임 변경</h3><p>마을 모라의 상점에서 닉네임 변경권을 구입합니다. 이름 중복은 서버에서 확인합니다.</p>
    <div class="vanity-rename"><input id="rename-input" maxlength="14" placeholder="새 이름 2~14글자"><button class="btn primary" data-act="rename" ${(p.inventory.rename_ticket||0)<1?'disabled':''}>변경권 사용 · ${n(p.inventory.rename_ticket||0)}개 보유</button></div></section>
  <div class="settings-actions"><button class="btn small" data-act="openShop">모라 일반 상점</button><button class="btn small" data-act="close">모험으로 돌아가기</button></div>`;
  return {title:'모험가 외형 공방',eyebrow:`COSMETIC · ${n(p.gold)} G · ${n(list.length)} STYLES`,html,page:currentPage,pages:lastPage+1};
}
