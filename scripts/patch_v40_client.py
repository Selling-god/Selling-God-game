from pathlib import Path
p=Path('/mnt/data/rift_v40_work/public/app.js')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
    global s
    if old not in s: raise SystemExit('MISSING '+label)
    s=s.replace(old,new,1)

# State additions
rep("""    collectionPage: 0,
    deckDraft: [],
    sound:""","""    collectionPage: 0,
    deckDraft: [],
    monsterDraft: [],
    prepMode: '',
    selectedMonster: null,
    sound:""",'state')
rep("""    state.deckDraft=[...(state.profile.deck||[])];
    updateTopbar();""","""    state.deckDraft=[...(state.profile.deck||[])];
    state.monsterDraft=[...(state.profile.monsterParty||[])];
    updateTopbar();""",'load profile')

# Card semantics
s=s.replace("const labels={damage:'DMG'","const labels={monsterBoost:'ATK+',monsterShield:'SHIELD',geneCharge:'GENE',resonanceCharge:'RES',riftCharge:'RIFT',damage:'DMG'",1)
rep("""  function cardRole(card){
    if(card?.type==='unit')return{key:'summon',icon:'♟',label:'소환'};
    const ops=new Set((card?.effects||[]).map(e=>e.op));
""","""  function cardRole(card){
    if(card?.cardClass==='gene')return{key:'growth',icon:'⌬',label:'강화'};
    const ops=new Set((card?.effects||[]).map(e=>e.op));
""",'cardRole')
# effect UI map additions
s=s.replace("const m={\n      damage:","const m={\n      monsterBoost:['▲','몬스터 공격','buff'],monsterShield:['⬢','몬스터 실드','guard'],monsterHeal:['✚','몬스터 회복','heal'],geneCharge:['⌬','GENE','buff'],resonanceCharge:['✦','RESONANCE','buff'],riftCharge:['◆','RIFT','buff'],\n      damage:",1)

# Helpers after enemyWeakBadge
needle="""  function enemyWeakBadge(element){const weak=elementWeakTo(element).slice(0,3);return `<span class="enemy-weak-v34" title="약점: ${esc(weak.join(', ')||'없음')}"><small>WEAK</small>${weak.map(x=>`<i class="element-${elementClass(x)}">${esc(elementGlyph(x))}</i>`).join('')}</span>`;}
"""
insert=needle+"""  function monsterById(id){return byId(state.meta?.monsters,id);}
  function monsterPointCost(id){return Number(monsterById(id)?.pointCost||1);}
  function monsterDraftCost(){return (state.monsterDraft||[]).reduce((a,id)=>a+monsterPointCost(id),0);}
  function monsterRarityKo(m){return rarityKo(m?.rarity||m?.tier||'common');}
  function monsterFormName(u){if(u?.fused)return'FUSION';if(u?.abyssBloom)return'RIFT BLOOM';if(Number(u?.resonanceTurns||0)>0)return'RESONANCE';if(u?.evolved)return'EVOLVED';return'BASE';}
  function monsterGauge(label,value,max,kind=''){return `<span class="monster-gauge-v40 ${kind}"><b>${label}</b><i><em style="width:${pct(value,max)}%"></em></i><small>${value}/${max}</small></span>`;}
  function monsterPortrait(m,opt={}){if(!m)return'';const selected=!!opt.selected;return `<button class="monster-card-v40 rarity-${esc(m.rarity||m.tier)} ${selected?'selected':''}" ${opt.action?`data-action="${opt.action}"`:''} ${opt.id?`data-monster-id="${esc(opt.id)}"`:''} title="${esc(m.passive?.name||'')} · ${esc(m.passive?.text||'')}"><span class="monster-cost-v40">${m.pointCost}P</span><img src="${esc(m.sprite)}" loading="lazy" alt=""><div><b>${esc(m.name)}</b><small>${esc(elementGlyph(m.element))} ${esc(m.element)} · ${esc(monsterRarityKo(m))}</small><em>${esc(m.passive?.name||m.skill||'')}</em></div></button>`;}
"""
if needle not in s: raise SystemExit('monster helpers anchor')
s=s.replace(needle,insert,1)

# Capture FX use monster target/art-or-sprite
s=s.replace("const target=$('.hunt-card-v32')","const target=$('.hunt-monster-v40')||$('.hunt-card-v32')",1)
start=s.index('  async function captureResultFx(')
end=s.index('\n\n  function cardHtml',start)
newcap="""  async function captureResultFx(entity,success,escaped,newDiscovery){
    if(!fxOn())return;const art=entity?.sprite||entity?.art||'',rar=entity?.rarity||entity?.tier||'common';const root=document.createElement('div');root.className=`capture-cinematic-v34 ${success?'success':'fail'} rarity-${rar}`;root.innerHTML=`<div class="capture-space-v34"><i></i><i></i><i></i><div class="capture-card-cinema-v34 monster"><img src="${esc(art)}" alt=""><span>${esc(elementGlyph(entity?.element||''))}</span></div><div class="capture-copy-v34"><small>${success?(newDiscovery?'NEW MONSTER LINK':'MONSTER LINKED'):(escaped?'TARGET LOST':'SEAL RESISTED')}</small><b>${esc(entity?.name||'MONSTER')}</b>${success?'<em>원정 파티 편성 가능</em>':'<em>다른 봉인구를 준비하세요</em>'}</div></div>`;document.body.appendChild(root);sound(success?'win':'error');if(success)screenShake('medium');else screenShake('soft');await wait(success?1100:720);root.remove();
  }
"""
s=s[:start]+newcap+s[end:]

# Relic rendering pixel art
start=s.index('  function relicHtml(')
end=s.index('  function showCardInspect',start)
relic="""  function relicHtml(relic,opt={}){
    if(!relic)return '';const art=relic.art?`<img src="${esc(relic.art)}" alt="">`:`<span>${esc(relic.icon||'✦')}</span>`;return `<button class="relic-choice rarity-${relic.rarity} ${opt.claimed?'claimed':''}" data-action="${opt.action||'relic-pick'}" data-relic-id="${esc(relic.id)}" ${opt.disabled?'disabled':''}><span class="relic-icon pixel-v40">${art}</span><div><small>${esc(rarityKo(relic.rarity))} · TREASURE</small><b>${esc(relic.name)}</b><p>${esc(relic.text)}</p></div></button>`;
  }
"""
s=s[:start]+relic+s[end:]

# Home rewrite
start=s.index('  function homeHtml(){')
end=s.index('  function renderHome()',start)
home="""  function homeHtml(){
    const featured=(state.meta.banner.featured||[]).map(id=>byId(state.meta.cards,id)).filter(Boolean),active=state.room&&!['ended','cleared'].includes(state.room.status),mons=state.profile.monsterOwnedCount||0;
    return `<section class="home home-v40"><div class="home-hero"><div class="world-panel"><div class="hero-content"><div class="eyebrow">HUNT → PARTY → SPELL → EVOLVE</div><h1>몬스터를 모으고,<em>카드로 진화시켜 싸운다.</em></h1><p>여행에서 몬스터 봉인 · 10P 안에서 파티 편성 · 전투 중 스펠로 강화/진화/융합.</p><div class="progress-loop-v32 v40"><span><b>1</b>MONSTER HUNT</span><i>›</i><span><b>2</b>10P PARTY</span><i>›</i><span><b>3</b>SPELL BUILD</span><i>›</i><span><b>4</b>EVOLUTION</span></div><div class="home-actions"><button class="mode-button primary hunt" data-action="journey-create"><span class="mode-kicker">SOLO · ${mons}/205 OWNED</span><b>몬스터 사냥 여행</b><small>쓰러뜨린 몬스터를 봉인해 영구 획득</small></button><button class="mode-button dungeon" data-action="dungeon-lobby"><span class="mode-kicker">1–4 PLAYER · 50 FLOORS</span><b>심연 던전</b><small>내 몬스터 파티 + 스펠 덱으로 공략</small></button></div><div class="home-sub-actions-v40"><button data-action="collection">스펠 보관함</button><button data-action="profile">탐험 기록</button></div>${active?`<button class="cta mint" style="margin-top:10px" data-action="resume-room">원정 이어하기 · ${esc(state.room.id)}</button>`:''}</div></div><aside class="banner-panel"><div class="section-label">RERUN SPELL ARCHIVE</div><h2>${esc(state.meta.banner.name)}</h2><p>한정 스펠/인자술 획득.</p><div class="featured-stack">${featured.map(c=>cardHtml(c,{compact:true})).join('')}</div><div class="banner-timer">종료 <b id="bannerClock">--:--:--</b></div><button class="cta gold" data-action="gacha">복각 아카이브</button></aside></div></section>`;
  }
"""
s=s[:start]+home+s[end:]

# Insert prep functions before renderDungeonLobby
anchor='  async function renderDungeonLobby(){'
idx=s.index(anchor)
prep="""  function renderExpeditionPrep(mode){
    state.prepMode=mode;state.monsterDraft=[...(state.profile.monsterParty||[])];state.deckDraft=[...(state.profile.deck||[])];state.current='prep';
    const rules=state.meta.monsterRules||{maxSlots:6,pointBudget:10},cost=monsterDraftCost();const owned=state.meta.monsters.filter(m=>Number(state.profile.monsters?.[m.id]||0)>0).sort((a,b)=>Number(a.pointCost)-Number(b.pointCost)||a.name.localeCompare(b.name,'ko')).slice(0,80);
    const slots=Array.from({length:rules.maxSlots},(_,i)=>{const id=state.monsterDraft[i],m=monsterById(id);return m?`<div class="party-slot-mon-v40 rarity-${m.rarity}"><img src="${esc(m.sprite)}" alt=""><div><b>${esc(shortLine(m.name,12))}</b><small>${m.pointCost}P · ${esc(m.element)}</small></div><button data-action="monster-remove" data-monster-id="${esc(id)}">×</button></div>`:`<div class="party-slot-mon-v40 empty"><span>+</span><small>SLOT ${i+1}</small></div>`;}).join('');
    const spells=state.deckDraft.map(id=>byId(state.meta.cards,id)).filter(Boolean);
    setScreen('prep',`<section class="prep-page-v40"><header class="prep-head-v40"><button data-action="home">←</button><div><small>${mode==='journey'?'MONSTER HUNT':'ABYSS DUNGEON'} // LOADOUT</small><h1>원정 파티</h1></div><div class="point-meter-v40 ${cost>rules.pointBudget?'over':''}"><span>PARTY COST</span><b>${cost}</b><em>/ ${rules.pointBudget}P</em></div></header><main class="prep-layout-v40"><section class="party-builder-v40"><div class="party-slots-mon-v40">${slots}</div><div class="prep-rule-v40"><b>강한 몬스터일수록 더 많은 포인트</b><span>최대 ${rules.maxSlots}마리 · 총 ${rules.pointBudget}P</span></div><div class="monster-library-v40">${owned.map(m=>monsterPortrait(m,{action:state.monsterDraft.includes(m.id)?'monster-remove':'monster-add',id:m.id,selected:state.monsterDraft.includes(m.id)})).join('')}</div></section><aside class="spell-loadout-v40"><header><div><small>SPELL DECK</small><b>${spells.length}/${state.meta.spellRules?.max||12}</b></div><button data-action="collection">편성</button></header><div class="spell-mini-list-v40">${spells.map(c=>`<div><img src="${esc(c.art)}" alt=""><span><b>${esc(shortLine(c.name,14))}</b><small>${c.cost}E · ${esc(cardRole(c).label)}</small></span></div>`).join('')}</div><div class="evolution-key-v40"><b>전투 진화 시스템</b><span>⌬ GENE → 일반 진화 / 융합</span><span>✦ RES → 공명진화</span><span>◆ RIFT → 균열개화</span></div><button class="prep-start-v40" data-action="prep-start" ${!state.monsterDraft.length||cost>rules.pointBudget||spells.length<(state.meta.spellRules?.min||8)?'disabled':''}>${mode==='journey'?'여행 시작':'던전 로비로'}</button></aside></main></section>`);
  }
  async function savePrepAndProceed(){
    const cost=monsterDraftCost(),budget=state.meta.monsterRules?.pointBudget||10;if(!state.monsterDraft.length)return toast('몬스터를 최소 1마리 선택하세요.','error');if(cost>budget)return toast(`파티 포인트는 ${budget}P 이하여야 합니다.`,'error');
    try{const d=await api('/api/loadout',{body:{profileId:state.profileId,nickname:state.profile.nickname,monsterParty:state.monsterDraft,deck:state.deckDraft}});state.profile=d.profile;state.monsterDraft=[...d.profile.monsterParty];state.deckDraft=[...d.profile.deck];updateTopbar();const mode=state.prepMode;if(mode==='journey')return createJourney();return renderDungeonLobby();}catch(e){toast(e.message,'error');}
  }
"""
s=s[:idx]+prep+s[idx:]

# Change collection to spell-only, simpler and prep-aware
start=s.index('  function renderCollection(){')
end=s.index('  function renderGacha(){',start)
collection="""  function renderCollection(){state.deckDraft=[...(state.profile.deck||[])];state.collectionPage=0;renderCollectionInner();}
  function renderCollectionInner(){
    const q=state.collectionSearch.trim().toLowerCase();let cards=state.meta.cards.filter(c=>c.type==='spell'&&(state.collectionFilter==='all'||state.collectionFilter===c.rarity||state.collectionFilter===c.cardClass)&&(!q||c.name.toLowerCase().includes(q)||c.element.toLowerCase().includes(q)||c.text.toLowerCase().includes(q)));const pageSize=36,pages=Math.max(1,Math.ceil(cards.length/pageSize));state.collectionPage=Math.max(0,Math.min(state.collectionPage,pages-1));const view=cards.slice(state.collectionPage*pageSize,(state.collectionPage+1)*pageSize),min=state.meta.spellRules?.min||8,max=state.meta.spellRules?.max||12;
    const grid=view.map(c=>{const count=state.profile.collection[c.id]||0,inDeck=state.deckDraft.includes(c.id);return `<article class="collection-card-v34 spell-v40 ${count?'owned':'unowned'} ${inDeck?'selected':''}"><div class="collection-art-v34"><img src="${esc(c.art)}" loading="lazy" alt=""><span>${esc(elementGlyph(c.element))}</span></div><div class="collection-copy-v34"><b class="rarity-${c.rarity}">${esc(c.name)}</b><small>${c.cost}E · ${esc(cardRole(c).label)} · ${esc(c.element)}</small><div>${cardEffectRows(c,3).map(x=>`<span><i>${esc(x.icon)}</i>${esc(x.value||x.label)}</span>`).join('')}</div></div>${count?`<button class="deck-add-v34" data-action="${inDeck?'deck-remove':'deck-add'}" data-card-id="${esc(c.id)}">${inDeck?'제외':'편성'}</button>`:'<em>미획득</em>'}</article>`;}).join('');
    setScreen('collection',`<section class="loadout-page-v34 spellbook-v40"><header class="loadout-head-v34"><button class="back-btn" data-action="${state.prepMode?'prep-return':'home'}">← ${state.prepMode?'파티':'홈'}</button><div><small>SPELL GRIMOIRE</small><h1>스펠 덱</h1><p>몬스터는 파티에서 직접 싸우고, 카드는 공격·방어·강화·진화를 만드는 전술입니다.</p></div><div class="loadout-total-v34"><b>${state.deckDraft.length}</b><span>/${max}</span></div></header><div class="spell-deck-strip-v40">${state.deckDraft.map(id=>{const c=byId(state.meta.cards,id);return c?`<button data-action="deck-remove" data-card-id="${esc(id)}"><img src="${esc(c.art)}"><span>${esc(shortLine(c.name,10))}</span></button>`:'';}).join('')}</div><div class="collection-toolbar-v34"><div class="filter-row">${[['all','전체'],['gene','인자술'],['attack','공격'],['support','지원'],['common','일반'],['rare','희귀'],['ultra','초희귀'],['legendary','전설'],['mythic','신화']].map(([k,n])=>`<button class="filter-btn ${state.collectionFilter===k?'active':''}" data-action="filter" data-filter="${k}">${n}</button>`).join('')}</div><input class="search-input" id="collectionSearch" value="${esc(state.collectionSearch)}" placeholder="스펠 검색"></div><div class="collection-grid-v34 spell-grid-v40">${grid}</div><div class="loadout-save-v34"><div><b>${min}~${max}종</b><small>현재 ${state.deckDraft.length}종</small></div><button class="primary" data-action="deck-save" ${state.deckDraft.length<min||state.deckDraft.length>max?'disabled':''}>스펠 덱 저장</button></div><div class="pagination"><button class="cta" data-action="page-prev" ${state.collectionPage===0?'disabled':''}>←</button><span>${state.collectionPage+1}/${pages}</span><button class="cta" data-action="page-next" ${state.collectionPage>=pages-1?'disabled':''}>→</button></div></section>`);
  }
  function addDeckCard(cardId){const c=byId(state.meta.cards,cardId);if(!c||c.type!=='spell'||!state.profile.collection?.[cardId])return;if(state.deckDraft.includes(cardId))return;const max=state.meta.spellRules?.max||12;if(state.deckDraft.length>=max)return toast(`스펠 덱은 최대 ${max}종입니다.`,'error');state.deckDraft.push(cardId);renderCollectionInner();sound('card');}
  function removeDeckCard(cardId){const i=state.deckDraft.indexOf(cardId);if(i<0)return;state.deckDraft.splice(i,1);renderCollectionInner();sound('click');}
  async function saveDeck(){const min=state.meta.spellRules?.min||8;if(state.deckDraft.length<min)return toast(`스펠 덱은 최소 ${min}종이 필요합니다.`,'error');try{const d=await api('/api/deck',{body:{profileId:state.profileId,nickname:state.profile.nickname,deck:state.deckDraft}});state.profile=d.profile;state.deckDraft=[...d.profile.deck];updateTopbar();toast('스펠 덱 저장 완료.','good');sound('win');if(state.prepMode)return renderExpeditionPrep(state.prepMode);renderCollectionInner();}catch(e){toast(e.message,'error');}}

"""
s=s[:start]+collection+s[end:]

# Replace capture chance/stage
start=s.index('  function captureChance(')
end=s.index('  function renderReward(',start)
capture_stage="""  function captureChance(monster,seal,run){const base=Number(monster?.captureBase||.25),mult={basic:1,silver:1.8,royal:3.5}[seal]||1,bonus=runMod(run,'captureBonus'),cap=monster?.tier==='boss'?.28:monster?.tier==='ultra'?.62:monster?.tier==='rare'?.88:.97;return Math.round(Math.min(cap,base*mult+bonus)*100);}
  function captureStageV32(capture,run){const m=capture.monster,owned=!!state.profile.monsters?.[m.id];return `<div class="hunt-stage-v32 monster-hunt-v40"><div class="hunt-monster-v40 rarity-${m.rarity}"><div class="hunt-tag-v32">${owned?'OWNED':'NEW'}</div><div class="wild-aura-v40"></div><img src="${esc(m.sprite)}" alt=""><div><small>${esc(monsterRarityKo(m))} · ${esc(m.element)} · ${m.pointCost}P</small><b>${esc(m.name)}</b><em>${esc(m.passive?.name||m.skill||'')}</em></div></div><div class="hunt-side-v32"><div class="hunt-radar-v32"><i></i><span>WILD MONSTER</span></div><b>${owned?'이미 보유 · 중복은 수집 기록 증가':'봉인 성공 시 원정 파티 영구 해금'}</b><div class="seal-orbs-v32">${[['basic','basic','◇'],['silver','silver','◈'],['royal','royal','◆']].map(([key,file,glyph])=>`<button data-action="capture" data-seal="${key}" ${Number(state.profile.seals?.[key]||0)<=0?'disabled':''}><img src="/assets/ui/seal_${file}.png" alt=""><strong>${captureChance(m,key,run)}%</strong><small>${glyph} ${state.profile.seals?.[key]||0}</small></button>`).join('')}</div><button class="hunt-pass-v32" data-action="capture-pass">지나가기</button></div></div>`;}
"""
s=s[:start]+capture_stage+s[end:]

# Relic reward pixel art
s=s.replace("<span>${esc(x.icon||'✦')}</span><b>${esc(x.name)}</b>","<span class=\"relic-pixel-v40\">${x.art?`<img src=\"${esc(x.art)}\" alt=\"\">`:esc(x.icon||'✦')}</span><b>${esc(x.name)}</b>",1)

# Rewrite battle function
start=s.index('  function renderBattle(r){')
end=s.index('  function runMod(',start)
battle="""  function renderBattle(r){
    const b=r.battle,me=b.party.find(p=>p.playerId===state.profileId);if(!me)return;const alive=b.enemies.filter(e=>e.hp>0);if(!state.selectedEnemy||!alive.some(e=>e.uid===state.selectedEnemy))state.selectedEnemy=alive[0]?.uid||null;if(!state.selectedMonster||!me.units.some(u=>u.instanceId===state.selectedMonster))state.selectedMonster=me.units[0]?.instanceId||null;
    const run=r.runState[state.profileId],chain=me.chain||{count:0},selectedEnemy=alive.find(e=>e.uid===state.selectedEnemy)||alive[0],intent=intentCompact(selectedEnemy?.intent),selectedMon=me.units.find(u=>u.instanceId===state.selectedMonster)||me.units[0];
    const enemies=alive.map(e=>{const it=intentCompact(e.intent);return `<button class="enemy-actor-v31 v40 ${state.selectedEnemy===e.uid?'selected':''} ${b.tier==='boss'?'boss':''}" data-action="select-enemy" data-enemy="${e.uid}"><div class="enemy-intent-v31"><span>${esc(it.icon)}</span>${it.value?`<b>${esc(it.value)}</b>`:''}</div><div class="enemy-sprite-stage-v31"><img class="enemy-sprite" src="${esc(e.sprite)}" alt=""><i class="enemy-shadow-v31"></i><i class="target-ring-v31"></i>${e.block?`<i class="shield-shell-v33 enemy-shield-v33"><b>⬢ ${e.block}</b></i>`:''}</div><div class="enemy-name-v31"><b>${esc(e.name)}</b>${matchupBadge(e.element)}</div><div class="enemy-hpbar-v31"><i style="width:${pct(e.hp,e.maxHp)}%"></i></div><div class="enemy-sub-v31"><span>${e.hp}/${e.maxHp}</span>${e.block?`<span class="enemy-block-number-v34">⬢ ${e.block}</span>`:''}${enemyWeakBadge(e.element)}<span class="break-dot-v31 ${e.broken?'broken':''}"><i style="width:${pct(e.stagger,e.staggerMax)}%"></i></span></div></button>`;}).join('');
    const monsters=me.units.map(u=>`<button class="monster-actor-v40 filled element-${elementClass(u.element)} form-${monsterFormName(u).toLowerCase().replace(/\\s+/g,'-')} ${state.selectedMonster===u.instanceId?'selected':''}" data-action="select-monster" data-monster="${esc(u.instanceId)}"><div class="monster-sprite-v40">${u.fusionSprite?`<img class="fusion-ghost-v40" src="${esc(u.fusionSprite)}" alt="">`:''}<img src="${esc(u.sprite)}" alt=""><i></i></div><div class="monster-head-v40"><b>${esc(shortLine(u.name,16))}</b><span>Lv.${u.level}</span></div><div class="monster-hp-v40"><i><em style="width:${pct(u.hp,u.maxHp)}%"></em></i><b>${u.hp}/${u.maxHp}</b>${u.block?`<strong>⬢ ${u.block}</strong>`:''}</div><div class="monster-gauges-v40">${monsterGauge('⌬',u.gene||0,8,'gene')}${monsterGauge('✦',u.resonance||0,6,'res')}${monsterGauge('◆',u.rift||0,5,'rift')}</div></button>`).join('');
    const bench=(me.bench||[]).map(u=>`<button data-action="select-bench" data-monster="${esc(u.instanceId)}" title="${esc(u.name)}"><img src="${esc(u.sprite)}"><span>${esc(shortLine(u.name,9))}</span></button>`).join('');
    const controls=selectedMon?`<div class="evolve-controls-v40"><button data-action="monster-evolve" data-mode="evolve" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.evolved||selectedMon.level<3||selectedMon.gene<3?'disabled':''} title="Lv.3 + GENE 3">▲<small>진화</small></button><button data-action="open-fusion" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.gene<2||!(me.units.length+me.bench.length>1)?'disabled':''} title="두 몬스터 GENE 2">∞<small>융합</small></button><button data-action="monster-evolve" data-mode="resonance" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.resonance<4?'disabled':''} title="RESONANCE 4">✦<small>공명</small></button><button data-action="monster-evolve" data-mode="rift" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.rift<3||selectedMon.hp/selectedMon.maxHp>.6?'disabled':''} title="HP 60%↓ + RIFT 3">◆<small>개화</small></button>${(me.bench||[]).length?`<button data-action="open-switch" data-monster="${esc(selectedMon.instanceId)}" ${me.switchesUsed>=1?'disabled':''}>↔<small>교대</small></button>`:''}</div>`:'';
    const hand=me.hand.map((cid,i)=>{const c=runCardView(byId(state.meta.cards,cid),run);const can=!me.ended&&!me.down&&b.phase==='players'&&me.energy>=Math.max(0,c.cost-(me.buffs.anyDiscount>0?1:(me.buffs.spellDiscount>0?1:0)));return cardHtml(c,{action:'play-card',index:i,disabled:!can,visual:true});}).join('');
    setScreen('battle',`<section class="battle-stage-v31 battle-v40"><div class="battle-bg-v31" style="background-image:url('${esc(sceneBg(r))}')"></div><div class="battle-parallax-v31 p1"></div><div class="battle-parallax-v31 p2"></div><header class="battle-hud-v31"><div class="team-core-v40"><span>CORE ${me.hp}/${me.maxHp}</span>${me.block?`<b>⬢ ${me.block}</b>`:''}</div><div class="battle-round-v31"><small>${b.tier==='boss'?'BOSS':b.tier==='elite'?'ELITE':esc(r.biome.short)}</small><b>${r.floor}F</b><span>T${b.turn}</span></div><div class="battle-tools-v31"><button data-action="run-info">◈</button><button data-action="toggle-combat-log">≡</button></div></header><main class="battle-field-v40"><section class="monster-side-v40"><div class="monster-party-v40">${monsters}</div><div class="bench-v40"><small>BENCH</small>${bench||'<span>—</span>'}</div>${controls}</section><section class="enemy-stage-v31 v40">${enemies}</section></main><footer class="battle-command-v31 v40"><div class="energy-panel-v31"><span>ENERGY</span>${energyOrbs(me)}<div class="combo-pips-v31">${[1,2,3,4,5].map(n=>`<i class="${n<=chain.count?'on':''}"></i>`).join('')}</div></div><div class="battle-hand-v31"><div class="hand">${hand}</div><small class="target-hint-v40">${selectedMon?`⌬ ${esc(shortLine(selectedMon.name,16))}`:'몬스터 선택'} · 공격 스펠은 적 / 인자술은 선택 몬스터</small></div><div class="command-side-v31"><div class="intent-preview-v31"><small>NEXT</small><span>${esc(intent.icon)}</span>${intent.value?`<b>${esc(intent.value)}</b>`:''}</div>${me.ended?'<div class="waiting-v31">WAIT</div>':`<button class="end-turn-v31" data-action="end-turn"><span>END</span><b>E</b></button>`}</div></footer><aside class="battle-log-drawer-v31 ${state.combatLogOpen?'open':''}"><div><b>LOG</b><button data-action="toggle-combat-log">×</button></div>${b.log.slice(-12).reverse().map(x=>`<p>${esc(x.text)}</p>`).join('')}</aside></section>`);
  }
  function showFusionMenu(primaryId){const me=state.room?.battle?.party?.find(p=>p.playerId===state.profileId),a=[...(me?.units||[]),...(me?.bench||[])].find(x=>x.instanceId===primaryId);if(!a)return;const others=[...(me.units||[]),...(me.bench||[])].filter(x=>x.instanceId!==primaryId&&x.gene>=2);modal(`<div class="fusion-modal-v40"><div class="section-label">FUSION</div><h2>${esc(a.name)} + ?</h2><p>두 몬스터의 GENE 2씩을 소비해 능력과 속성을 합칩니다.</p><div>${others.map(u=>`<button data-action="fusion-pick" data-primary="${esc(primaryId)}" data-secondary="${esc(u.instanceId)}"><img src="${esc(u.sprite)}"><span><b>${esc(u.name)}</b><small>⌬ ${u.gene} · ${esc(u.element)}</small></span></button>`).join('')||'<span>GENE 2 이상인 다른 몬스터가 없습니다.</span>'}</div><button class="cta" data-action="modal-close">취소</button></div>`);}
  function showSwitchMenu(activeId){const me=state.room?.battle?.party?.find(p=>p.playerId===state.profileId);modal(`<div class="fusion-modal-v40"><div class="section-label">SWITCH</div><h2>교대할 몬스터</h2><div>${(me?.bench||[]).map(u=>`<button data-action="switch-pick" data-active="${esc(activeId)}" data-bench="${esc(u.instanceId)}"><img src="${esc(u.sprite)}"><span><b>${esc(u.name)}</b><small>HP ${u.hp}/${u.maxHp}</small></span></button>`).join('')}</div><button class="cta" data-action="modal-close">취소</button></div>`);}

"""
s=s[:start]+battle+s[end:]

# Add attack/event visual helper before playRoomEvents
anchor='  function playRoomEvents(next,afterSeq){'
idx=s.index(anchor)
fx="""  function monsterAttackEventFx(payload){if(!fxOn()||!payload)return;const actor=$(`[data-monster="${CSS.escape(payload.instanceId||'')}"]`),target=$(`[data-enemy="${CSS.escape(payload.targetUid||'')}"]`);if(!actor||!target)return;const fake={element:payload.element||'강철',rarity:payload.form&&payload.form!=='BASE'?'legendary':'common',power:payload.damage||8,effects:[{op:'damage',value:payload.damage||8}]};const style=payload.archetype||'beast';try{actor.animate(style==='golem'||style==='tyrant'?[{transform:'translateY(0)'},{transform:'translate(34px,-18px) scale(1.14)',offset:.45},{transform:'translateY(0)'}]:style==='wing'||style==='spirit'?[{transform:'translateY(0)'},{transform:'translate(18px,-28px) rotate(-5deg)',offset:.45},{transform:'translateY(0)'}]:[{transform:'translateX(0)'},{transform:'translateX(54px) scale(1.08)',offset:.46},{transform:'translateX(0)'}],{duration:430,easing:'cubic-bezier(.18,.82,.18,1)'});}catch{}setTimeout(()=>signatureProjectileFx(actor,target,fake).then(()=>signatureImpactFx(target,fake,payload.form&&payload.form!=='BASE'?1.3:1)),120);}
  function enemyAttackEventFx(payload){if(!fxOn()||!payload)return;const actor=$(`[data-enemy="${CSS.escape(payload.enemyUid||'')}"]`),target=payload.targetMonsterId?$(`[data-monster="${CSS.escape(payload.targetMonsterId)}"]`):$('.team-core-v40');if(!actor||!target)return;const fake={element:'공허',rarity:payload.heavy?'legendary':'common',power:payload.damage||8,effects:[{op:'damage',value:payload.damage||8}]};try{actor.animate([{transform:'translateX(0)'},{transform:`translateX(-${payload.heavy?88:58}px) scale(${payload.heavy?1.16:1.08})`,offset:.45},{transform:'translateX(6px)',offset:.72},{transform:'translateX(0)'}],{duration:payload.heavy?520:390,easing:'cubic-bezier(.18,.82,.18,1)'});}catch{}setTimeout(()=>{signatureProjectileFx(actor,target,fake).then(()=>signatureImpactFx(target,fake,payload.heavy?1.35:1));screenShake(payload.heavy?'heavy':'soft');},130);}
  function monsterTransformFx(payload){const target=$(`[data-monster="${CSS.escape(payload?.instanceId||'')}"]`);if(target){target.classList.add('monster-transform-v40');setTimeout(()=>target.classList.remove('monster-transform-v40'),900);}screenFlash(payload?.mode==='rift'?'boss':'victory');screenShake('medium');showCenterBanner(payload?.mode==='resonance'?'RESONANCE':payload?.mode==='rift'?'RIFT BLOOM':'EVOLUTION','','victory');sound('overdrive');}

"""
s=s[:idx]+fx+s[idx:]
# insert event cases in playRoomEvents near card case
s=s.replace("""      else if(ev.type==='card'&&ev.payload?.playerId!==state.profileId){""","""      else if(ev.type==='monster-attack')monsterAttackEventFx(ev.payload);
      else if(ev.type==='enemy-attack')enemyAttackEventFx(ev.payload);
      else if(ev.type==='monster-evolve')monsterTransformFx(ev.payload);
      else if(ev.type==='monster-fuse'){monsterTransformFx({...ev.payload,mode:'fusion'});showCenterBanner('FUSION','','victory');}
      else if(ev.type==='monster-level'&&ev.payload?.playerId===state.profileId)showCenterBanner(`Lv.${ev.payload.level}`,'LEVEL UP','ally');
      else if(ev.type==='card'&&ev.payload?.playerId!==state.profileId){""",1)

# Update profile stat card
s=s.replace("<div class=\"stat-box\"><b>${s.cardsCaught||0}</b><small>여행 봉인 성공</small></div>","<div class=\"stat-box\"><b>${s.monstersCaught||0}</b><small>몬스터 봉인</small></div>",1)
s=s.replace("<div class=\"stat-box\"><b>${state.profile.ownedCount}</b><small>보유 카드 종류</small></div>","<div class=\"stat-box\"><b>${state.profile.monsterOwnedCount||0}</b><small>보유 몬스터</small></div><div class=\"stat-box\"><b>${s.evolutions||0}</b><small>진화</small></div><div class=\"stat-box\"><b>${s.fusions||0}</b><small>융합</small></div>",1)

# Click actions replacements/additions
s=s.replace("if(action==='journey-create')return createJourney();","if(action==='journey-create')return renderExpeditionPrep('journey');",1)
s=s.replace("if(action==='dungeon-lobby')return renderDungeonLobby();","if(action==='dungeon-lobby')return renderExpeditionPrep('dungeon');",1)
s=s.replace("if(action==='difficulty'){state.selectedDifficulty=el.dataset.diff;localStorage.setItem('riftdeck.difficulty',state.selectedDifficulty);return renderDungeonLobby();}","if(action==='difficulty'){state.selectedDifficulty=el.dataset.diff;localStorage.setItem('riftdeck.difficulty',state.selectedDifficulty);return renderDungeonLobby();}",1)
# insert prep/monster actions after collection line
needle="""      if(action==='collection')return renderCollection();
"""
insert=needle+"""      if(action==='prep-return')return renderExpeditionPrep(state.prepMode||'dungeon');
      if(action==='monster-add'){const id=el.dataset.monsterId;if(state.monsterDraft.includes(id))return;const rules=state.meta.monsterRules||{maxSlots:6,pointBudget:10};if(state.monsterDraft.length>=rules.maxSlots)return toast(`파티는 최대 ${rules.maxSlots}마리입니다.`,'error');if(monsterDraftCost()+monsterPointCost(id)>rules.pointBudget)return toast(`포인트가 부족합니다. 최대 ${rules.pointBudget}P`,'error');state.monsterDraft.push(id);return renderExpeditionPrep(state.prepMode);}
      if(action==='monster-remove'){const id=el.dataset.monsterId;state.monsterDraft=state.monsterDraft.filter(x=>x!==id);return renderExpeditionPrep(state.prepMode);}
      if(action==='prep-start')return savePrepAndProceed();
"""
if needle not in s: raise SystemExit('click collection anchor')
s=s.replace(needle,insert,1)
# battle selection/actions
s=s.replace("if(action==='select-enemy'){state.selectedEnemy=el.dataset.enemy;return renderBattle(state.room);}","if(action==='select-enemy'){state.selectedEnemy=el.dataset.enemy;return renderBattle(state.room);}\n      if(action==='select-monster'){state.selectedMonster=el.dataset.monster;return renderBattle(state.room);}\n      if(action==='monster-evolve'){const d=await roomPost('monster-evolve',{instanceId:el.dataset.monster,mode:el.dataset.mode});await loadProfile();return renderRoom();}\n      if(action==='open-fusion')return showFusionMenu(el.dataset.monster);\n      if(action==='fusion-pick'){closeModal();const d=await roomPost('monster-fuse',{primaryId:el.dataset.primary,secondaryId:el.dataset.secondary});await loadProfile();return renderRoom();}\n      if(action==='open-switch')return showSwitchMenu(el.dataset.monster);\n      if(action==='switch-pick'){closeModal();const d=await roomPost('switch-monster',{activeId:el.dataset.active,benchId:el.dataset.bench});state.selectedMonster=d.room?.battle?.party?.find(p=>p.playerId===state.profileId)?.units?.find(u=>u.name===d.result.name)?.instanceId||null;return renderRoom();}",1)
# play action target monster and target element for gene cards
old="""        await cardCastWindup(el,card,target);const d=await roomPost('play',{handIndex:index,targetUid:state.selectedEnemy});if(d.room?.status==='reward')sound('win');return;
"""
new="""        const allyTarget=card.cardClass==='gene'?$(`[data-monster="${CSS.escape(state.selectedMonster||'')}"]`):null;await cardCastWindup(el,card,allyTarget||target);const d=await roomPost('play',{handIndex:index,targetUid:state.selectedEnemy,targetMonsterId:state.selectedMonster});if(d.room?.status==='reward')sound('win');return;
"""
rep(old,new,'play target')
# capture action
old="""      if(action==='capture'){const cap=state.room?.capture,card=cap?.card,newDiscovery=!!cap?.newDiscovery;await captureThrowFx(el,card,el.dataset.seal);const d=await roomPost('capture',{sealType:el.dataset.seal});await captureResultFx(card,d.result.success,d.result.escaped,newDiscovery);await loadProfile();toast(d.result.success?'봉인 성공 · 던전 편성 가능!':d.result.escaped?'봉인 실패 · 흔적이 사라졌습니다.':'봉인 실패 · 다른 봉인구를 시도할 수 있습니다.',d.result.success?'good':'error');return renderRoom();}
"""
new="""      if(action==='capture'){const cap=state.room?.capture,monster=cap?.monster,newDiscovery=!!cap?.newDiscovery;await captureThrowFx(el,monster,el.dataset.seal);const d=await roomPost('capture',{sealType:el.dataset.seal});await captureResultFx(monster,d.result.success,d.result.escaped,newDiscovery);await loadProfile();toast(d.result.success?'봉인 성공 · 파티 편성 가능!':d.result.escaped?'봉인 실패 · 몬스터가 달아났습니다.':'봉인 실패 · 다른 봉인구를 시도할 수 있습니다.',d.result.success?'good':'error');return renderRoom();}
"""
rep(old,new,'capture click')

p.write_text(s,encoding='utf-8')
print('client v40 patched')
