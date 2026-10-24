import {COSMETICS,COSMETIC_GROUPS,validPortrait} from '../shared/personalization.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Math.round(v||0).toLocaleString('ko-KR');
export function vanityPanel(p,tab='costume'){
 const category=COSMETIC_GROUPS[tab]?tab:'costume';const slots=p.vanity?.slots||{};
 const list=Object.values(COSMETICS).filter(x=>x.slot===category);
 return {title:'모험가 외형 공방',eyebrow:`COSMETIC · ${n(p.gold)} G`,html:`
 <div class="vanity-hero"><div><span class="eyebrow">LOOKS DON'T CHANGE YOUR GEAR</span><h3>내 모습, 나만의 흔적</h3><p>외형 장식은 장비·강화·능력치와 완전히 별개로 보관됩니다. 다른 사람도 내 아우라와 이미지 캐릭터를 볼 수 있습니다.</p></div><span>✧</span></div>
 <div class="tabs vanity-tabs">${Object.entries(COSMETIC_GROUPS).map(([key,label])=>`<button class="tab ${category===key?'active':''}" data-act="tab" data-id="${key}">${label}</button>`).join('')}</div>
 <div class="vanity-items">${list.map(item=>{
  const owned=p.vanity?.owned?.includes(item.id),equipped=slots[category]===item.id;
  return `<article class="vanity-item" style="--vanity:${item.color}"><span class="vanity-swatch">${category==='wings'?'✦':category==='aura'?'◉':category==='nametag'?'▣':category==='entrance'?'✧':'▰'}</span><div class="grow"><b>${esc(item.name)}</b><small>${esc(item.desc)}</small></div><button class="btn small ${owned?'':'primary'}" data-act="${owned?'cosmeticEquip':'cosmeticBuy'}" data-id="${item.id}" data-slot="${category}" ${!owned&&p.gold<item.price?'disabled':''}>${owned?(equipped?'장착 중':'장착'):`${n(item.price)} G`}</button></article>`;
 }).join('')}</div><button class="btn small" data-act="cosmeticEquip" data-id="" data-slot="${category}" ${!slots[category]?'disabled':''}>이 부위 장식 해제</button>
 <section class="vanity-personal"><h3>내가 고른 그림을 도트 캐릭터로</h3><p>이미지 파일을 <b>24 × 32 도트</b>로 변환합니다. 사진 자체는 서버로 올리지 않으며 작은 도트 색상 데이터만 저장합니다. <b>초상화 변환권 1개</b>가 필요합니다.</p>
  <div class="vanity-portrait"><div id="pixel-preview" class="pixel-preview">${validPortrait(p.vanity?.avatarPixels)?'현재 이미지 적용 중':'파일을 선택하면 미리보기가 표시됩니다.'}</div><div><label class="btn small" for="portrait-file">그림 선택하기</label><input id="portrait-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p class="small muted">PNG · JPG · WebP / 2MB 이하<br>변환권 ${n(p.inventory.portrait_ticket||0)}개</p><button class="btn primary" data-act="avatarApply" id="avatar-apply" disabled>변환권 사용 · 적용</button><button class="btn small" data-act="avatarClear" ${p.vanity?.avatarPixels?'':'disabled'}>기본 직업 외형</button></div></div>
  <p class="small muted">캐릭터의 원본 파일을 저장하지 않습니다. 초상화가 다른 플레이어에게도 보이는 만큼 본인이 사용할 권리가 있는 이미지만 선택해 주세요.</p>
 </section><section class="vanity-personal"><h3>닉네임 변경</h3><p>모라 상점에서 <b>닉네임 변경권</b>을 구매할 수 있습니다. 이름은 서버에서 중복 검사합니다.</p><div class="vanity-rename"><input id="rename-input" maxlength="14" placeholder="새 이름 2~14글자" value=""><button class="btn primary" data-act="rename" ${(p.inventory.rename_ticket||0)<1?'disabled':''}>변경권 사용 · ${n(p.inventory.rename_ticket||0)}개 보유</button></div></section>
 <div class="settings-actions"><button class="btn small" data-act="openShop">모라 상점 안내</button><button class="btn small" data-act="openSettings">설정으로 돌아가기</button></div>`};
}
