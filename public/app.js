'use strict';

(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const screen = $('#screen');
  const modalRoot = $('#modalRoot');
  const toastRoot = $('#toastRoot');
  const boot = $('#boot');
  const app = $('#app');

  const state = {
    meta: null,
    profile: null,
    profileId: localStorage.getItem('riftdeck.profileId') || makeId(),
    nickname: localStorage.getItem('riftdeck.nickname') || '',
    room: null,
    roomId: localStorage.getItem('riftdeck.roomId') || '',
    stream: null,
    current: 'home',
    selectedEnemy: null,
    collectionFilter: 'all',
    deckDraft: [],
    sound: localStorage.getItem('riftdeck.sound') !== 'off',
    audio: null,
    battleRaf: 0,
    lobbyTimer: 0,
    busy: false
  };
  localStorage.setItem('riftdeck.profileId', state.profileId);

  const rarityKo = k => state.meta?.rarities?.[k]?.ko || k;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const pct = (a, b) => b ? Math.max(0, Math.min(100, a / b * 100)) : 0;

  function makeId(){
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'rd_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? {'Content-Type':'application/json'} : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data;
    try { data = await res.json(); } catch { data = {ok:false,error:'서버 응답을 읽지 못했습니다.'}; }
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadProfile() {
    const data = await api('/api/profile', {body:{profileId:state.profileId,nickname:state.nickname || '방랑자'}});
    state.profile = data.profile;
    if (!state.nickname) state.nickname = data.profile.nickname;
    state.deckDraft = [...(state.profile.deck || [])];
    updateTopbar();
  }

  function updateTopbar(){
    if (!state.profile) return;
    $('#gemCount').textContent = Number(state.profile.gems || 0).toLocaleString('ko-KR');
    $('#dustCount').textContent = Number(state.profile.dust || 0).toLocaleString('ko-KR');
    $('#nicknameMini').textContent = state.profile.nickname;
    $('#avatarMini').textContent = (state.profile.nickname || 'R').slice(0,1).toUpperCase();
    $('#soundBtn').textContent = state.sound ? '♪' : '×';
  }

  function toast(message, type=''){
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  function setBusy(v){ state.busy = !!v; document.body.style.cursor = v ? 'progress' : ''; }

  function modal(html){
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  }
  function closeModal(){ modalRoot.innerHTML = ''; }

  function sound(kind='click'){
    if (!state.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      state.audio ||= new Ctx();
      const ctx = state.audio;
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const config = {
        click:[380,.035,.04,'square'], card:[520,.06,.055,'triangle'], hit:[115,.08,.075,'sawtooth'],
        win:[740,.20,.08,'triangle'], gacha:[880,.30,.09,'sine'], error:[160,.12,.07,'square']
      }[kind] || [400,.05,.04,'square'];
      o.type=config[3]; o.frequency.setValueAtTime(config[0],now);
      if(kind==='win'||kind==='gacha')o.frequency.exponentialRampToValueAtTime(config[0]*1.7,now+config[1]);
      else if(kind==='hit')o.frequency.exponentialRampToValueAtTime(65,now+config[1]);
      g.gain.setValueAtTime(config[2],now);g.gain.exponentialRampToValueAtTime(.0001,now+config[1]);
      o.connect(g).connect(ctx.destination);o.start(now);o.stop(now+config[1]+.01);
    } catch {}
  }

  function setScreen(name, html){
    cancelAnimationFrame(state.battleRaf); state.battleRaf = 0;
    clearInterval(state.lobbyTimer); state.lobbyTimer = 0;
    state.current = name; screen.innerHTML = html; window.scrollTo({top:0,behavior:'instant'});
    paintAllCardArt();
  }

  function cardArtCanvas(card, cls=''){
    return `<canvas class="pixel-sprite ${cls}" data-card-art="${esc(card.id)}" width="160" height="100" aria-hidden="true"></canvas>`;
  }

  function cardHtml(card, options = {}){
    if (!card) return '';
    const compact = options.compact ? ' mini-card' : '';
    const action = options.action ? ` data-action="${esc(options.action)}"` : '';
    const index = options.index != null ? ` data-index="${options.index}"` : '';
    const reward = options.rewardId ? ` data-reward-id="${esc(options.rewardId)}"` : '';
    const idattr = options.cardId ? ` data-card-id="${esc(options.cardId)}"` : '';
    const disabled = options.disabled ? ' claimed' : '';
    const tag = options.compact ? 'div' : 'button';
    const stats = card.type === 'unit' ? `<span>HP ${card.hp}</span><span>ATK ${card.power}</span>` : `${card.power?`<span>DMG ${card.power}</span>`:''}${card.block?`<span>DEF ${card.block}</span>`:''}`;
    return `<${tag} class="game-card${compact}${disabled}" data-rarity="${esc(card.rarity)}"${action}${index}${reward}${idattr}>
      <div class="rarity-ribbon">${esc(rarityKo(card.rarity))}</div>
      <div class="card-top"><span class="cost">${card.cost}</span><span class="card-name">${esc(card.name)}</span></div>
      <div class="card-art">${cardArtCanvas(card)}</div>
      <div class="card-type"><span>${card.type==='unit'?'UNIT':'SPELL'}</span><span>${esc(card.element)}</span></div>
      <div class="card-text">${esc(card.text)}</div>
      <div class="card-stats">${stats}</div>
    </${tag}>`;
  }

  function homeHtml(){
    const featured = (state.meta.banner.featured || []).map(id => state.meta.cards.find(c=>c.id===id)).filter(Boolean);
    const activeRoom = state.room && !['ended','cleared'].includes(state.room.status);
    return `<section class="home">
      <div class="home-hero">
        <div class="world-panel">
          <div class="hero-content">
            <div class="eyebrow">ORIGINAL PIXEL CARD ROGUELITE · SERVER AUTHORITATIVE</div>
            <h1>심연으로 내려가라.<em>카드로 살아남아라.</em></h1>
            <p>일반 여행에서 새로운 카드의 흔적을 발견하고 봉인해 컬렉션을 넓히세요. 준비가 끝나면 최대 4명의 원정대와 30층 협동 던전에 진입해, 각자 덱과 유닛을 운용하며 최종 수호자를 쓰러뜨리세요.</p>
            <div class="home-actions">
              <button class="mode-button primary" data-action="journey-create"><span class="mode-kicker">SOLO · COLLECTION</span><b>일반 여행</b><small>카드 흔적 발견 · 봉인 · 영구 컬렉션 획득</small></button>
              <button class="mode-button" data-action="dungeon-lobby"><span class="mode-kicker">1–4 PLAYER · MAIN MODE</span><b>협동 던전</b><small>경로 투표 · 역할 분담 · 30층 최종 보스 클리어</small></button>
            </div>
            ${activeRoom?`<button class="cta mint" style="margin-top:10px" data-action="resume-room">진행 중인 원정 이어하기 · ${esc(state.room.id)}</button>`:''}
          </div>
        </div>
        <aside class="banner-panel">
          <div class="section-label">LIMITED RERUN ARCHIVE</div>
          <h2>${esc(state.meta.banner.name)}</h2>
          <p>${esc(state.meta.banner.subtitle)}</p>
          <div class="featured-stack">${featured.map(c=>cardHtml(c,{compact:true})).join('')}</div>
          <div class="banner-timer">종료까지 <b id="bannerClock">--:--:--</b></div>
          <div class="banner-actions"><button class="cta" data-action="gacha-pull" data-count="1">1회 · ◆100</button><button class="cta gold" data-action="gacha-pull" data-count="10">10회 · ◆900</button></div>
        </aside>
      </div>
      <div class="quick-grid">
        <button class="quick-card" data-action="collection"><span class="quick-icon">▤</span><b>카드 보관함</b><small>${state.profile.ownedCount}/${state.profile.totalCards}종 · 덱 편성</small></button>
        <button class="quick-card" data-action="gacha"><span class="quick-icon">◇</span><b>복각 소환</b><small>기간 한정 카드 · 전설/신화 천장</small></button>
        <button class="quick-card" data-action="dungeon-lobby"><span class="quick-icon">♜</span><b>원정대 찾기</b><small>공개 방 또는 6자리 방 코드 참가</small></button>
        <button class="quick-card" data-action="profile"><span class="quick-icon">⌁</span><b>탐험 기록</b><small>최고 층 · 포획 · 던전 클리어 통계</small></button>
      </div>
    </section>`;
  }

  function renderHome(){
    closeStreamIfInactive();
    setScreen('home', homeHtml());
    tickBanner();
    state.lobbyTimer = setInterval(tickBanner,1000);
  }

  function tickBanner(){
    const el=$('#bannerClock');if(!el)return;const end=new Date(state.meta.banner.endsAt).getTime();let sec=Math.max(0,Math.floor((end-Date.now())/1000));const d=Math.floor(sec/86400);sec%=86400;const h=Math.floor(sec/3600);sec%=3600;const m=Math.floor(sec/60);const s=sec%60;el.textContent=`${d}일 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  async function renderDungeonLobby(){
    setScreen('lobby', `<section class="page">
      <div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">CO-OP EXPEDITION</div><h1>협동 던전 로비</h1><p>1~4명 · 30층 클리어 · 실시간 서버 동기화</p></div></div>
      <div class="lobby-grid">
        <div class="lobby-card"><h2>새 원정대 만들기</h2><p>방을 만든 뒤 친구에게 6자리 코드를 알려주세요. 혼자 시작해도 됩니다.</p><div class="field"><input id="roomName" maxlength="24" placeholder="원정대 이름" value="${esc(state.profile.nickname)}의 원정대"><button class="cta mint" data-action="create-dungeon">방 만들기</button></div></div>
        <div class="lobby-card"><h2>방 코드로 참가</h2><p>친구가 알려준 6자리 코드를 입력하면 같은 서버 방으로 들어갑니다.</p><div class="field"><input id="roomCodeInput" inputmode="numeric" maxlength="6" placeholder="000000"><button class="cta" data-action="join-code">참가</button></div></div>
      </div>
      <div class="lobby-card" style="margin-top:16px"><div class="section-label">PUBLIC ROOMS</div><h2>입장 가능한 원정대</h2><div id="publicRooms" class="room-list"><div class="empty">서버에서 방 목록을 불러오는 중...</div></div></div>
    </section>`);
    await refreshRooms();
    state.lobbyTimer=setInterval(refreshRooms,3500);
  }

  async function refreshRooms(){
    if(state.current!=='lobby')return;
    try{
      const data=await api('/api/rooms');const root=$('#publicRooms');if(!root)return;
      root.innerHTML=data.rooms.length?data.rooms.map(r=>`<div class="room-row"><div><b>${esc(r.name)}</b><small>${esc(r.host)} · ROOM ${esc(r.id)}</small></div><small>${r.players}/${r.maxPlayers}</small><button class="cta" data-action="join-public" data-room="${r.id}">참가</button></div>`).join(''):`<div class="empty">현재 입장 가능한 공개 방이 없습니다.</div>`;
    }catch(e){const root=$('#publicRooms');if(root)root.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }

  async function createJourney(){
    if(state.busy)return;setBusy(true);sound('click');
    try{const d=await api('/api/rooms/create',{body:{profileId:state.profileId,nickname:state.profile.nickname,mode:'journey',name:'개인 일반 여행'}});enterRoom(d.room);await roomPost('start',{});}catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}
  }
  async function createDungeon(){
    if(state.busy)return;setBusy(true);try{const name=$('#roomName')?.value||'';const d=await api('/api/rooms/create',{body:{profileId:state.profileId,nickname:state.profile.nickname,mode:'dungeon',name}});enterRoom(d.room);}catch(e){toast(e.message,'error');}finally{setBusy(false);}
  }
  async function joinRoom(code){
    code=String(code||'').replace(/\D/g,'').slice(0,6);if(code.length!==6)return toast('6자리 방 코드를 입력해 주세요.','error');if(state.busy)return;setBusy(true);
    try{const d=await api('/api/rooms/join',{body:{profileId:state.profileId,nickname:state.profile.nickname,roomId:code}});enterRoom(d.room);}catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}
  }
  function enterRoom(room){
    state.room=room;state.roomId=room.id;localStorage.setItem('riftdeck.roomId',room.id);connectStream(room.id);renderRoom();
  }
  function connectStream(roomId){
    if(state.stream)state.stream.close();
    state.stream=new EventSource(`/api/room/${encodeURIComponent(roomId)}/stream?profileId=${encodeURIComponent(state.profileId)}`);
    state.stream.addEventListener('room-update',ev=>{try{const next=JSON.parse(ev.data);const oldStatus=state.room?.status;state.room=next;if(next.status==='battle'&&oldStatus!=='battle')sound('card');if(next.status==='reward'&&oldStatus==='battle')sound('win');if(next.status==='ended'&&oldStatus!=='ended')sound('error');if(['room','route','battle','reward','event','ended','cleared'].includes(state.current)||state.current.startsWith('room'))renderRoom();}catch{}});
    state.stream.onerror=()=>{const b=$('#serverBadge');if(b)b.style.opacity='.55';};
    state.stream.onopen=()=>{const b=$('#serverBadge');if(b)b.style.opacity='1';};
  }
  function closeStreamIfInactive(){
    if(state.room && !['ended','cleared'].includes(state.room.status))return;
    if(state.stream){state.stream.close();state.stream=null;}
  }

  function renderRoom(){
    const r=state.room;if(!r)return renderHome();
    if(r.status==='lobby')return renderRoomLobby(r);
    if(r.status==='route')return renderRoute(r);
    if(r.status==='battle')return renderBattle(r);
    if(r.status==='reward')return renderReward(r);
    if(r.status==='event')return renderEvent(r);
    if(r.status==='ended'||r.status==='cleared')return renderEnd(r);
  }

  function renderRoomLobby(r){
    const slots=Array.from({length:r.maxPlayers},(_,i)=>r.players[i]);
    setScreen('room-lobby',`<section class="room-shell">
      <div class="room-world"><canvas id="roomCanvas"></canvas></div>
      <div class="room-ui"><div class="room-titlebar"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">WAITING ROOM</div><div class="room-code">${esc(r.id)}</div><div class="room-name">${esc(r.name)}</div></div></div>
      <div class="room-panel"><h2 style="margin:0;font-size:17px">심연 원정대 편성</h2><p class="small-note">각자 자신의 저장 덱으로 출발합니다. 전투 중 손패와 에너지는 플레이어별로 독립이며, 경로는 전원이 투표합니다.</p>
      <div class="party-slots">${slots.map((p,i)=>p?`<div class="party-slot"><div class="portrait">${esc(p.nickname.slice(0,1))}</div><div><b>${esc(p.nickname)}</b><small>${p.id===r.hostId?'원정대장':'원정대원'}</small>${p.id===r.hostId?'<span class="host-badge">HOST</span>':''}</div></div>`:`<div class="party-slot empty-slot">+ 빈 자리</div>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center"><div class="small-note">친구 초대 코드: <b style="color:var(--gold);font-size:13px">${r.id}</b></div><div style="display:flex;gap:7px"><button class="cta" data-action="copy-room">코드 복사</button>${r.hostId===state.profileId?'<button class="cta mint" data-action="room-start">원정 시작</button>':'<button class="cta" disabled>방장 시작 대기</button>'}</div></div>
      </div></div></section>`);
    drawAmbient($('#roomCanvas'),r.biome||state.meta.biomes[0],true);
  }

  function renderRoute(r){
    const meVote=r.route?.find(n=>n.votes.includes(state.profileId))?.id;
    setScreen('route',`<section class="route-shell"><canvas id="routeCanvas" class="scene-bg"></canvas><div class="route-ui">
      <div class="run-hud"><button class="back-btn" data-action="home">☰</button><div class="floor-badge"><small>${r.mode==='dungeon'?'DUNGEON FLOOR':'JOURNEY WAVE'}</small><b>${r.floor}${r.mode==='dungeon'?'/30':''}</b></div><div class="biome-badge"><b>${esc(r.biome.name)}</b><small>${esc(r.biome.desc)}</small></div></div>
      <div class="route-title"><div class="section-label">CHOOSE THE NEXT PATH</div><h2>${r.mode==='dungeon'?'원정대가 향할 길을 투표하세요':'다음 여행 경로를 선택하세요'}</h2><p>${r.mode==='dungeon'?'모든 원정대원이 투표하면 최다 득표 경로로 이동합니다. 동률은 서버가 결정합니다.':'경로마다 전투, 사건, 휴식, 보상이 달라집니다.'}</p></div>
      <div class="route-nodes">${(r.route||[]).map(n=>`<button class="route-node ${meVote===n.id?'voted':''}" data-action="route-vote" data-node="${esc(n.id)}"><span class="node-icon">${esc(n.icon)}</span><b>${esc(n.label)}</b><p>${esc(n.desc)}</p><span class="votes">VOTE ${n.votes.length}/${r.players.length}</span></button>`).join('')}</div>
      ${partyStrip(r)}
    </div></section>`);
    drawAmbient($('#routeCanvas'),r.biome,false);
  }

  function partyStrip(r){
    return `<div class="party-strip">${r.players.map(p=>{const run=r.runState[p.id];const hp=run?.hp??0,max=run?.maxHp??1;return `<div class="run-player"><b>${esc(p.nickname)}</b><div class="hp-track"><i style="width:${pct(hp,max)}%"></i></div><small><span>HP ${hp}/${max}</span><span>덱 ${run?.runDeck?.length||0} · 유물 ${run?.relics?.length||0}</span></small></div>`;}).join('')}</div>`;
  }

  function renderBattle(r){
    const b=r.battle;const me=b.party.find(p=>p.playerId===state.profileId);if(!me)return;
    const alive=b.enemies.filter(e=>e.hp>0);if(!alive.some(e=>e.uid===state.selectedEnemy))state.selectedEnemy=alive[0]?.uid||null;
    const allies=b.party.map(p=>`<div class="combatant-chip ${p.playerId===state.profileId?'me':''} ${p.down?'down':''}"><b>${esc(p.nickname)} ${p.ended?'✓':''}</b><div class="hp-track"><i style="width:${pct(p.hp,p.maxHp)}%"></i></div><div class="chip-row"><span>HP ${p.hp}/${p.maxHp}</span><span>DEF ${p.block}</span><span>EN ${p.energy}/${p.maxEnergy}</span></div></div>`).join('');
    const enemyUi=alive.map((e,i)=>`<button class="enemy-ui e${i} ${state.selectedEnemy===e.uid?'selected':''}" data-action="select-enemy" data-enemy="${esc(e.uid)}"><div class="enemy-intent"><strong>${esc(e.intent.icon)}</strong>${esc(e.intent.text)}</div><div class="enemy-hud"><b>${esc(e.name)}</b><div class="enemy-hp"><i style="width:${pct(e.hp,e.maxHp)}%"></i><span>${e.hp}/${e.maxHp}${e.block?` +${e.block}`:''}</span></div><div class="enemy-status">${enemyStatus(e)}</div></div></button>`).join('');
    const hand=me.hand.map((cid,i)=>cardHtml(state.meta.cards.find(c=>c.id===cid),{action:'play-card',index:i})).join('');
    const units=Array.from({length:3},(_,i)=>me.units[i]).map(u=>u?`<div class="unit-slot filled"><div class="unit-sprite"><canvas data-unit-art="${esc(u.cardId)}" width="96" height="70"></canvas></div><b>${esc(u.name)}</b><small>HP ${u.hp}/${u.maxHp} · ATK ${u.power}</small></div>`:`<div class="unit-slot"></div>`).join('');
    setScreen('battle',`<section class="battle-screen"><canvas id="battleCanvas" class="battle-canvas"></canvas><div class="battle-ui">
      <div class="battle-top">${allies}<div class="battle-turn"><b>TURN ${b.turn}</b><small>${b.tier.toUpperCase()} · ${esc(r.biome.name)} · ${r.floor}F</small></div></div>
      <div class="enemy-layer">${enemyUi}<div class="unit-board">${units}</div></div>
      <div class="battle-bottom"><div class="player-panel"><div class="player-main"><div class="player-orb"></div><div><h3>${esc(me.nickname)}</h3><div class="energy">◆ ${me.energy}/${me.maxEnergy}</div></div></div><div class="hp-track"><i style="width:${pct(me.hp,me.maxHp)}%"></i></div><div class="stats">HP ${me.hp}/${me.maxHp}<br>방어 ${me.block} · 약화 ${me.weak||0}<br>드로우 ${me.drawPile.length} · 버림 ${me.discard.length}</div></div>
      <div class="hand-wrap"><div class="hand">${hand||'<div class="empty">손패가 없습니다.</div>'}</div></div>
      <div class="battle-actions"><div class="intent-help"><b>적 의도</b><br>공격 수치와 방어/디버프가 다음 행동 전에 표시됩니다.<br><br>대상: <b>${esc(alive.find(e=>e.uid===state.selectedEnemy)?.name||'-')}</b></div><button class="end-turn ${me.ended?'ended':''}" data-action="end-turn" ${me.ended||me.down?'disabled':''}>${me.ended?'동료 대기 중':'턴 종료 [E]'}</button><div class="log-toggle">서버 판정 · 실시간 동기화</div></div></div>
    </div><div class="combat-log">${b.log.slice(-12).reverse().map(x=>`<div>${esc(x.text)}</div>`).join('')}</div></section>`);
    paintUnitArt();startBattleCanvas(r);
  }

  function enemyStatus(e){
    const arr=[];if(e.debuffs?.vulnerable)arr.push(`취약 ${e.debuffs.vulnerable}`);if(e.debuffs?.weak)arr.push(`약화 ${e.debuffs.weak}`);if(e.debuffs?.burn)arr.push(`화상 ${e.debuffs.burn}`);if(e.debuffs?.shock)arr.push(`감전 ${e.debuffs.shock}`);if(e.debuffs?.intentSeal)arr.push(`봉인 ${e.debuffs.intentSeal}`);return arr.join(' · ')||'상태 이상 없음';
  }

  function renderReward(r){
    const rw=r.reward||{};const claimed=rw.claims?.[state.profileId];const continued=rw.continueBy?.includes(state.profileId);let center='';
    if(rw.kind==='battle'){
      center=`<div class="reward-cards">${rw.options.map(o=>cardHtml(o.card,{action:'reward-card',rewardId:o.id,disabled:!!claimed})).join('')}</div>`;
    } else if(rw.kind==='merchant'){
      center=`<div class="merchant-list">${rw.options.map(o=>{const bought=rw.purchased?.[`${state.profileId}:card:${o.cardId}`];return `<div class="shop-item"><b>${esc(o.card.name)}</b><small>${esc(o.card.text)}</small><div class="price">◆ ${o.price}</div><button class="cta" data-action="buy" data-item="${o.cardId}" data-type="card" ${bought?'disabled':''}>${bought?'구매 완료':'구매'}</button></div>`;}).join('')}${rw.relic?`<div class="shop-item"><b>${esc(rw.relic.icon)} ${esc(rw.relic.name)}</b><small>${esc(rw.relic.text)}</small><div class="price">◆ ${rw.relic.price}</div><button class="cta gold" data-action="buy" data-item="${rw.relic.id}" data-type="relic" ${rw.purchased?.[`${state.profileId}:relic:${rw.relic.id}`]?'disabled':''}>유물 구매</button></div>`:''}</div>`;
    }
    const cap=r.capture;
    const capHtml=cap?`<div class="capture-panel"><div class="capture-echo"><canvas id="captureArt" width="150" height="150"></canvas></div><div class="capture-info"><div class="section-label">WILD CARD ECHO</div><h2 class="rarity-${cap.card.rarity}">${esc(cap.card.name)}</h2><p>전투가 남긴 카드의 잔향입니다. 봉인구를 사용하면 이 카드를 영구 컬렉션과 현재 여행 덱에 추가할 수 있습니다. 전설·신화 흔적은 일반 여행에서 극히 드물며 봉인도 어렵습니다.</p>${cap.escaped?`<div class="small-note">${cap.caughtBy?'봉인 완료.':'카드 흔적이 사라졌습니다.'}</div>`:`<div class="seals"><button class="seal-btn" data-action="capture" data-seal="basic"><b>기본 봉인구</b><small>보유 ${state.profile.seals.basic}</small></button><button class="seal-btn" data-action="capture" data-seal="silver"><b>은빛 봉인구</b><small>보유 ${state.profile.seals.silver}</small></button><button class="seal-btn royal" data-action="capture" data-seal="royal"><b>왕가 봉인구</b><small>보유 ${state.profile.seals.royal}</small></button></div>`}</div></div>`:'';
    setScreen('reward',`<section class="reward-screen"><div class="reward-inner"><div class="reward-head"><div class="win-rune">◇</div><div class="section-label">EXPEDITION RESULT</div><h1>${esc(rw.title||'보상')}</h1><p>${esc(rw.text||'')}</p>${claimed?`<p class="rarity-${state.meta.cards.find(c=>c.id===claimed)?.rarity||'common'}">선택 완료: ${esc(state.meta.cards.find(c=>c.id===claimed)?.name||claimed)}</p>`:''}</div>${center}${capHtml}<div class="continue-wrap"><button class="cta mint" data-action="reward-continue" ${continued?'disabled':''}>${continued?'동료를 기다리는 중...':r.finalClearPending?'최종 클리어 확정':'다음 층으로'}</button></div></div></section>`);
    if(cap)drawCaptureArt($('#captureArt'),cap.card);
  }

  function renderEvent(r){
    const ev=r.event;const mine=ev.chosenBy?.[state.profileId];
    setScreen('event',`<section class="event-screen"><div class="event-card"><div class="event-sigil">◇</div><div class="section-label">MYSTERY ENCOUNTER</div><h1>${esc(ev.title)}</h1><p>${esc(ev.text)}</p><div class="event-choices">${ev.choices.map(c=>`<button class="event-choice" data-action="event-choice" data-choice="${esc(c.id)}" ${mine?'disabled':''}><b>${esc(c.label)}</b><small>${esc(c.desc)}</small></button>`).join('')}</div>${mine?'<p class="small-note">선택 완료 · 다른 원정대원의 선택을 기다립니다.</p>':''}</div></section>`);
  }

  function renderEnd(r){
    const clear=r.status==='cleared';
    setScreen('end',`<section class="event-screen"><div class="event-card"><div class="event-sigil">${clear?'♛':'☒'}</div><div class="section-label">${clear?'DUNGEON CLEAR':'EXPEDITION ENDED'}</div><h1>${esc(r.reward?.title||'원정 종료')}</h1><p>${esc(r.reward?.text||'')}</p><div class="stat-grid">${r.players.map(p=>{const run=r.runState[p.id];return `<div class="stat-box"><b>${esc(p.nickname)}</b><small>도달 ${r.floor}F · 덱 ${run?.runDeck?.length||0} · 유물 ${run?.relics?.length||0}</small></div>`;}).join('')}</div><div class="modal-actions" style="justify-content:center"><button class="cta mint" data-action="finish-run">홈으로 돌아가기</button></div></div></section>`);
  }

  async function roomPost(action,payload={}){
    if(!state.roomId)throw new Error('방이 없습니다.');if(state.busy)return;setBusy(true);
    try{const d=await api(`/api/room/${state.roomId}/${action}`,{body:{profileId:state.profileId,nickname:state.profile.nickname,...payload}});if(d.profile){state.profile=d.profile;updateTopbar();}if(d.room){state.room=d.room;renderRoom();}return d;}catch(e){toast(e.message,'error');sound('error');throw e;}finally{setBusy(false);}
  }

  function renderCollection(){
    state.deckDraft=[...(state.profile.deck||[])];renderCollectionInner();
  }
  function renderCollectionInner(){
    const filter=state.collectionFilter;const cards=state.meta.cards.filter(c=>filter==='all'||filter===c.rarity||filter===c.type);
    setScreen('collection',`<section class="page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">ARCHIVE & DECK</div><h1>카드 보관함</h1><p>보유 카드 8~16종을 선택하면 전투용 시작 덱이 됩니다. 전투 시작 시 12장 이상으로 자동 확장됩니다.</p></div><div class="right"><b>${state.profile.ownedCount}/${state.profile.totalCards}</b></div></div>
      <div class="collection-toolbar">${[['all','전체'],['unit','유닛'],['spell','스펠'],['common','일반'],['rare','희귀'],['ultra','초희귀'],['legendary','전설'],['mythic','신화']].map(([k,n])=>`<button class="filter-btn ${filter===k?'active':''}" data-action="filter" data-filter="${k}">${n}</button>`).join('')}</div>
      <div class="collection-layout"><div class="collection-grid">${cards.map(c=>{const count=state.profile.collection[c.id]||0;const inDeck=state.deckDraft.includes(c.id);return `<button class="collection-card ${count?'':'unowned'} ${inDeck?'selected':''}" ${count?'data-action="deck-toggle"':''} data-card-id="${c.id}"><div class="card-art">${cardArtCanvas(c)}</div><b class="rarity-${c.rarity}">${esc(c.name)}</b><p>${esc(c.text)}</p><span class="owned-count">${count?`×${count}`:'미획득'}</span></button>`;}).join('')}</div>
      <aside class="deck-panel"><div class="section-label">STARTER DECK</div><h2>원정 시작 덱</h2><p>카드를 클릭해 추가/제거하세요. 같은 카드의 중복 편성은 없지만 전투 덱에서는 12장 이상이 되도록 순환 복제됩니다.</p><div class="deck-count">${state.deckDraft.length}/16종</div><div class="deck-list">${state.deckDraft.map(id=>{const c=state.meta.cards.find(x=>x.id===id);return `<div class="deck-row"><b class="rarity-${c?.rarity||'common'}">${esc(c?.name||id)}</b><button data-action="deck-remove" data-card-id="${id}">×</button></div>`;}).join('')}</div><button class="cta mint" style="width:100%" data-action="deck-save" ${state.deckDraft.length<8?'disabled':''}>덱 저장</button><p class="small-note">최소 8종 필요 · 현재 ${state.deckDraft.length}종</p></aside></div>
    </section>`);
  }

  function renderGacha(){
    const b=state.meta.banner;const featured=b.featured.map(id=>state.meta.cards.find(c=>c.id===id)).filter(Boolean);
    setScreen('gacha',`<section class="gacha-page"><div class="gacha-hero"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">RERUN ARCHIVE</div><h1>복각 소환</h1><p>현재 기간에 열린 복각 카드만 픽업됩니다.</p></div></div><div class="gacha-banner"><div class="gacha-copy"><div class="section-label">LIMITED BANNER</div><h1>${esc(b.name)}</h1><p>${esc(b.subtitle)}. 높은 등급이 나왔을 때 픽업 카드가 등장할 확률이 상승합니다. 중복 카드는 잔광으로 자동 환급됩니다.</p><div class="rate-table">${Object.entries(b.rates).reverse().map(([k,v])=>`<div class="rate-cell"><b class="rarity-${k}">${esc(rarityKo(k))}</b>${(v*100).toFixed(1)}%</div>`).join('')}</div><div class="pity">전설 천장 ${state.profile.pity.legendary}/${b.pity.legendary} · 신화 천장 ${state.profile.pity.mythic}/${b.pity.mythic}</div><div class="banner-actions"><button class="cta" data-action="gacha-pull" data-count="1">1회 · ◆${b.singleCost}</button><button class="cta gold" data-action="gacha-pull" data-count="10">10회 · ◆${b.tenCost}</button></div></div><div class="gacha-art">${featured.map(c=>cardHtml(c)).join('')}</div></div></div></section>`);
  }

  function showPull(results){
    const sorted=[...results].sort((a,b)=>(state.meta.rarities[b.rarity]?.order||0)-(state.meta.rarities[a.rarity]?.order||0));
    const top=sorted[0];if(top?.rarity==='mythic'||top?.rarity==='legendary')sound('gacha');else sound('card');
    modalRoot.innerHTML=`<div class="pull-result"><div class="pull-result-inner"><div class="summon-orb"></div><div class="section-label">ARCHIVE UNSEALED</div><div class="pull-cards">${results.map((c,i)=>cardHtml(c).replace('class="game-card','style="animation-delay:'+Math.min(i*.07,.7)+'s" class="game-card')).join('')}</div><button class="cta mint close-pull" data-action="close-pull">확인</button></div></div>`;paintAllCardArt();
  }

  function renderProfile(){
    const s=state.profile.stats||{};
    setScreen('profile',`<section class="page profile-page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">EXPLORER RECORD</div><h1>탐험 기록</h1></div></div><div class="profile-card"><div class="big-avatar">${esc(state.profile.nickname.slice(0,1))}</div><div><h1>${esc(state.profile.nickname)}</h1><p>이 프로필은 현재 브라우저의 장치 ID에 연결되어 있습니다. 서버가 전투와 보상을 판정합니다.</p><div class="field"><input id="nicknameEdit" maxlength="14" value="${esc(state.profile.nickname)}"><button class="cta" data-action="rename">닉네임 변경</button></div><div class="stat-grid"><div class="stat-box"><b>${s.dungeonClears||0}</b><small>던전 클리어</small></div><div class="stat-box"><b>${s.bestDungeonFloor||0}F</b><small>던전 최고층</small></div><div class="stat-box"><b>${s.cardsCaught||0}</b><small>여행 봉인 성공</small></div><div class="stat-box"><b>${s.gachaPulls||0}</b><small>복각 소환</small></div><div class="stat-box"><b>${s.bosses||0}</b><small>보스 격파</small></div><div class="stat-box"><b>${s.journeys||0}</b><small>일반 여행</small></div><div class="stat-box"><b>${s.dungeons||0}</b><small>던전 원정</small></div><div class="stat-box"><b>${state.profile.ownedCount}</b><small>보유 카드 종류</small></div></div></div></div></section>`);
  }

  function toggleDeck(cardId){
    const i=state.deckDraft.indexOf(cardId);if(i>=0){if(state.deckDraft.length<=8)return toast('덱은 최소 8종이 필요합니다.','error');state.deckDraft.splice(i,1);}else{if(state.deckDraft.length>=16)return toast('덱은 최대 16종까지 편성할 수 있습니다.','error');state.deckDraft.push(cardId);}renderCollectionInner();sound('click');
  }

  async function saveDeck(){
    if(state.deckDraft.length<8)return toast('덱에 최소 8종을 넣어 주세요.','error');try{const d=await api('/api/deck',{body:{profileId:state.profileId,nickname:state.profile.nickname,deck:state.deckDraft}});state.profile=d.profile;updateTopbar();toast('시작 덱을 저장했습니다.','good');sound('win');renderCollectionInner();}catch(e){toast(e.message,'error');}
  }

  async function doGacha(count){
    if(state.busy)return;setBusy(true);try{const d=await api('/api/gacha/pull',{body:{profileId:state.profileId,nickname:state.profile.nickname,count:Number(count)}});state.profile=d.profile;updateTopbar();showPull(d.results);}catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}
  }

  async function renameProfile(){
    const name=$('#nicknameEdit')?.value?.trim();if(!name)return toast('닉네임을 입력해 주세요.','error');state.nickname=name;localStorage.setItem('riftdeck.nickname',name);try{await loadProfile();toast('닉네임을 변경했습니다.','good');renderProfile();}catch(e){toast(e.message,'error');}
  }

  function finishRun(){
    if(state.stream){state.stream.close();state.stream=null;}state.room=null;state.roomId='';localStorage.removeItem('riftdeck.roomId');loadProfile().then(renderHome);
  }

  async function resumeRoom(){
    if(!state.roomId)return;try{const d=await api(`/api/room/${state.roomId}`);state.room=d.room;connectStream(state.roomId);renderRoom();}catch(e){localStorage.removeItem('riftdeck.roomId');state.roomId='';state.room=null;toast('이전 원정 방이 만료되었습니다.','error');renderHome();}
  }

  // -----------------------------------------------------------------------
  // Original procedural pixel graphics. No external copyrighted sprites.
  // -----------------------------------------------------------------------
  const palettes={
    '화염':['#331f25','#773a38','#e26d4f','#ffc36f','#fff0c2'],
    '물':['#152841','#285b7a','#4f9fbc','#93d8df','#e2fbff'],
    '자연':['#172d28','#35634c','#6fac64','#b8db78','#f0f4b4'],
    '빛':['#342f28','#8b7450','#e6bd66','#ffe4a3','#fff9d5'],
    '그림자':['#171626','#332d52','#6d5189','#a47db6','#d7b4dd'],
    '강철':['#222a34','#435463','#7d93a0','#bed0d4','#eef4ef'],
    '바람':['#17323a','#366872','#77abb0','#bce1d9','#effbf4'],
    '번개':['#242741','#4c5685','#8e94d1','#e5d76a','#fff5ab'],
    '별':['#1a1935','#443c73','#7f6eb5','#c6a8f0','#f4dcff'],
    '시간':['#29233b','#5d4f72','#a4839d','#d2b777','#f7e8ac'],
    '공허':['#111322','#292145','#513a73','#9b60aa','#e293d8'],
    '수정':['#1c2b3c','#315e77','#64a4b4','#a8d9d5','#e9ffff'],
    '무':['#222938','#455568','#81909b','#c2ccd0','#f2f5f4']
  };
  function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){let x=seed||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)%100000)/100000;};}
  function resizeCanvas(canvas){if(!canvas)return null;const dpr=Math.min(2,window.devicePixelRatio||1);const rect=canvas.getBoundingClientRect();const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;return {ctx,w:rect.width,h:rect.height,dpr};}
  function drawPixelCreature(ctx,cx,cy,scale,key,element,phase=0,enemy=false){
    const pal=palettes[element]||palettes['무'];const R=rng(hash(key));const W=10,H=11;const cells=[];
    for(let y=0;y<H;y++)for(let x=0;x<Math.ceil(W/2);x++){const dx=Math.abs(x-(W-1)/2)/(W/2);const dy=Math.abs(y-(H-1)/2)/(H/2);const body=dx*dx*.78+dy*dy<.82+(R()-.5)*.18;cells.push([x,y,body?1+(R()*3|0):0]);}
    const bob=Math.sin(phase*2+hash(key)%7)*scale*.12;ctx.save();ctx.translate(Math.round(cx-W*scale/2),Math.round(cy-H*scale/2+bob));
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(scale*1,H*scale+scale*.6,scale*8,scale*.7);
    for(const [x,y,v] of cells){if(!v)continue;for(const xx of [x,W-1-x]){ctx.fillStyle=pal[v];ctx.fillRect(Math.floor(xx*scale),Math.floor(y*scale),Math.ceil(scale),Math.ceil(scale));}}
    // silhouette accents/horns/ears
    ctx.fillStyle=pal[2];if(enemy){ctx.fillRect(scale,scale*2,scale*2,scale);ctx.fillRect(scale*7,scale*2,scale*2,scale);}else{ctx.fillRect(scale*2,scale,scale,scale*2);ctx.fillRect(scale*7,scale,scale,scale*2);}
    ctx.fillStyle='#0b1019';ctx.fillRect(scale*3,scale*4,scale,scale);ctx.fillRect(scale*6,scale*4,scale,scale);
    ctx.fillStyle=pal[4];ctx.fillRect(scale*3,scale*4,Math.max(1,scale*.5),Math.max(1,scale*.5));ctx.fillRect(scale*6,scale*4,Math.max(1,scale*.5),Math.max(1,scale*.5));
    if(enemy&&R()>.35){ctx.fillStyle=pal[3];ctx.fillRect(scale*4,scale*8,scale*2,scale);}
    ctx.restore();
  }
  function drawCardSigil(canvas,card){
    if(!canvas||!card)return;const data=resizeCanvas(canvas);if(!data)return;const {ctx,w,h}=data;ctx.clearRect(0,0,w,h);const pal=palettes[card.element]||palettes['무'];const R=rng(hash(card.art||card.id));
    const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,pal[0]);grad.addColorStop(1,pal[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    for(let i=0;i<18;i++){const x=Math.floor(R()*w/4)*4,y=Math.floor(R()*h/4)*4,s=R()>.75?4:2;ctx.fillStyle=pal[2+(R()*3|0)];ctx.globalAlpha=.18+R()*.35;ctx.fillRect(x,y,s,s);}ctx.globalAlpha=1;
    if(card.type==='unit')drawPixelCreature(ctx,w*.5,h*.53,Math.max(3,Math.floor(Math.min(w/18,h/14))),card.art,card.element,0,false);
    else {ctx.save();ctx.translate(w/2,h/2);ctx.rotate(Math.PI/4);ctx.strokeStyle=pal[4];ctx.lineWidth=3;for(let i=0;i<3;i++)ctx.strokeRect(-12-i*7,-12-i*7,24+i*14,24+i*14);ctx.restore();ctx.fillStyle=pal[3];ctx.fillRect(w/2-3,h/2-3,6,6);}
    ctx.fillStyle='rgba(255,255,255,.07)';for(let y=0;y<h;y+=4)ctx.fillRect(0,y,w,1);
  }
  function paintAllCardArt(){
    requestAnimationFrame(()=>$$('[data-card-art]').forEach(cv=>drawCardSigil(cv,state.meta?.cards.find(c=>c.id===cv.dataset.cardArt))));
  }
  function paintUnitArt(){requestAnimationFrame(()=>$$('[data-unit-art]').forEach(cv=>drawCardSigil(cv,state.meta?.cards.find(c=>c.id===cv.dataset.unitArt))));}
  function drawLandscape(ctx,w,h,biome,t=0){
    const sky=biome?.sky||'#6a7d8d',ground=biome?.ground||'#243a3e',accent=biome?.accent||'#9fe4cf';const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,sky);g.addColorStop(.58,shade(sky,-35));g.addColorStop(.59,ground);g.addColorStop(1,shade(ground,-35));ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(255,255,255,.12)';for(let i=0;i<18;i++){const x=(hash((biome?.id||'x')+i)%1000)/1000*w;const y=(hash('y'+i)%380)/1000*h;ctx.fillRect(Math.round(x/3)*3,Math.round(y/3)*3,2,2);}
    ctx.fillStyle=shade(ground,-10);for(let x=-40;x<w+60;x+=70){const hh=30+((hash('hill'+x+biome?.id)%50));ctx.beginPath();ctx.moveTo(x,h*.60);ctx.lineTo(x+38,h*.60-hh);ctx.lineTo(x+82,h*.60);ctx.fill();}
    ctx.fillStyle=shade(ground,12);for(let x=-20;x<w+40;x+=44){const yy=h*.72+(hash('rock'+x)%28);ctx.fillRect(x,yy,22,8);ctx.fillRect(x+5,yy-7,12,7);}
    ctx.fillStyle=accent;ctx.globalAlpha=.45;for(let i=0;i<10;i++){const x=(hash('cr'+i+biome?.id)%1000)/1000*w;const y=h*.66+(hash('cry'+i)%180)/1000*h;ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillRect(-3,-3,6,6);ctx.restore();}ctx.globalAlpha=1;
    ctx.fillStyle='rgba(0,0,0,.1)';for(let y=0;y<h;y+=4)ctx.fillRect(0,y,w,1);
  }
  function shade(hex,amt){
    let c=String(hex||'#444').replace('#','');if(c.length===3)c=c.split('').map(x=>x+x).join('');let n=parseInt(c,16);let r=clampColor((n>>16)+amt),g=clampColor(((n>>8)&255)+amt),b=clampColor((n&255)+amt);return `rgb(${r},${g},${b})`;
  }
  const clampColor=n=>Math.max(0,Math.min(255,n|0));
  function drawAmbient(canvas,biome,roomLobby=false){
    if(!canvas)return;let raf=0;const started=performance.now();const loop=()=>{if(!canvas.isConnected)return;const d=resizeCanvas(canvas);if(!d)return;drawLandscape(d.ctx,d.w,d.h,biome,(performance.now()-started)/1000);if(roomLobby){drawPixelCreature(d.ctx,d.w*.72,d.h*.58,5.2,'lobby-scout','자연',(performance.now()-started)/1000,false);drawPixelCreature(d.ctx,d.w*.81,d.h*.64,4.2,'lobby-guard','강철',(performance.now()-started)/1000,false);}raf=requestAnimationFrame(loop);};cancelAnimationFrame(state.battleRaf);state.battleRaf=requestAnimationFrame(loop);
  }
  function startBattleCanvas(r){
    const canvas=$('#battleCanvas');if(!canvas)return;const start=performance.now();
    const loop=()=>{if(!canvas.isConnected)return;const d=resizeCanvas(canvas);if(!d)return;const t=(performance.now()-start)/1000;drawLandscape(d.ctx,d.w,d.h,r.biome,t);const positions=[[.61,.35],[.78,.48],[.49,.55]];r.battle.enemies.filter(e=>e.hp>0).slice(0,3).forEach((e,i)=>{const p=positions[i];drawPixelCreature(d.ctx,d.w*p[0],d.h*p[1],Math.max(3.8,Math.min(7,d.w/180)),e.art,e.element,t,true);});drawPixelCreature(d.ctx,d.w*.14,d.h*.57,Math.max(4.4,Math.min(7.5,d.w/155)),'explorer-'+state.profileId,'강철',t,false);state.battleRaf=requestAnimationFrame(loop);};state.battleRaf=requestAnimationFrame(loop);
  }
  function drawCaptureArt(canvas,card){if(!canvas)return;const d=resizeCanvas(canvas);if(!d)return;d.ctx.clearRect(0,0,d.w,d.h);const pal=palettes[card.element]||palettes['별'];const g=d.ctx.createRadialGradient(d.w/2,d.h/2,2,d.w/2,d.h/2,d.w*.48);g.addColorStop(0,pal[4]);g.addColorStop(.15,pal[3]);g.addColorStop(.48,pal[1]);g.addColorStop(1,'transparent');d.ctx.fillStyle=g;d.ctx.fillRect(0,0,d.w,d.h);drawPixelCreature(d.ctx,d.w/2,d.h/2,5,card.art,card.element,0,false);}

  // -----------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------
  document.addEventListener('click', async e => {
    const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;sound('click');
    try{
      if(action==='home')return renderHome();
      if(action==='profile')return renderProfile();
      if(action==='collection')return renderCollection();
      if(action==='gacha')return renderGacha();
      if(action==='journey-create')return createJourney();
      if(action==='dungeon-lobby')return renderDungeonLobby();
      if(action==='create-dungeon')return createDungeon();
      if(action==='join-code')return joinRoom($('#roomCodeInput')?.value);
      if(action==='join-public')return joinRoom(el.dataset.room);
      if(action==='copy-room'){await navigator.clipboard?.writeText(state.room.id);return toast(`방 코드 ${state.room.id} 복사 완료.`,'good');}
      if(action==='room-start')return roomPost('start',{});
      if(action==='route-vote')return roomPost('vote',{nodeId:el.dataset.node});
      if(action==='select-enemy'){state.selectedEnemy=el.dataset.enemy;return renderBattle(state.room);}
      if(action==='play-card'){if(state.busy)return;const me=state.room.battle.party.find(p=>p.playerId===state.profileId);if(me?.ended)return;return roomPost('play',{handIndex:Number(el.dataset.index),targetUid:state.selectedEnemy}).then(()=>sound('card'));}
      if(action==='end-turn')return roomPost('end-turn',{});
      if(action==='reward-card')return roomPost('reward',{rewardId:el.dataset.rewardId}).then(()=>loadProfile());
      if(action==='reward-continue')return roomPost('continue',{});
      if(action==='capture'){const d=await roomPost('capture',{sealType:el.dataset.seal});await loadProfile();toast(d.result.success?'봉인 성공! 카드가 컬렉션에 등록되었습니다.':d.result.escaped?'봉인 실패. 흔적이 사라졌습니다.':'봉인 실패. 한 번 더 노릴 수 있습니다.',d.result.success?'good':'error');return;}
      if(action==='event-choice')return roomPost('event',{choiceId:el.dataset.choice}).then(()=>loadProfile());
      if(action==='buy')return roomPost('buy',{itemId:el.dataset.item,itemType:el.dataset.type}).then(()=>loadProfile());
      if(action==='filter'){state.collectionFilter=el.dataset.filter;return renderCollectionInner();}
      if(action==='deck-toggle')return toggleDeck(el.dataset.cardId);
      if(action==='deck-remove')return toggleDeck(el.dataset.cardId);
      if(action==='deck-save')return saveDeck();
      if(action==='gacha-pull')return doGacha(el.dataset.count);
      if(action==='close-pull'){closeModal();return state.current==='gacha'?renderGacha():renderHome();}
      if(action==='rename')return renameProfile();
      if(action==='resume-room')return resumeRoom();
      if(action==='finish-run')return finishRun();
      if(action==='save-name'){
        const name=$('#firstNickname')?.value?.trim();if(!name)return toast('닉네임을 입력해 주세요.','error');state.nickname=name;localStorage.setItem('riftdeck.nickname',name);closeModal();await loadProfile();return renderHome();
      }
      if(action==='sound'){state.sound=!state.sound;localStorage.setItem('riftdeck.sound',state.sound?'on':'off');updateTopbar();return;}
    }catch{}
  });

  $('#soundBtn').dataset.action='sound';
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea'))return;
    if(state.current==='battle'&&state.room?.battle){
      if(/^Digit[1-9]$/.test(e.code)){const i=Number(e.code.slice(-1))-1;const card=$(`[data-action="play-card"][data-index="${i}"]`);if(card)card.click();}
      if(e.code==='KeyE')$('[data-action="end-turn"]')?.click();
    }
    if(e.code==='Escape'&&modalRoot.innerHTML)closeModal();
  });
  window.addEventListener('resize',()=>{paintAllCardArt();paintUnitArt();});

  async function init(){
    try{
      const meta=await api('/api/meta');state.meta=meta;
      if(!state.nickname){
        modal(`<div class="section-label">NEW EXPLORER</div><h2>탐험가 이름을 정하세요</h2><p>이 이름은 협동 던전 로비와 전투 파티에 표시됩니다.</p><div class="field"><input id="firstNickname" maxlength="14" placeholder="닉네임" autofocus></div><div class="modal-actions"><button class="cta mint" data-action="save-name">시작하기</button></div>`);
      }
      await loadProfile();
      if(state.roomId){try{const d=await api(`/api/room/${state.roomId}`);state.room=d.room;}catch{localStorage.removeItem('riftdeck.roomId');state.roomId='';}}
      setTimeout(()=>{boot.classList.add('hidden');app.classList.remove('hidden');renderHome();},520);
    }catch(e){
      boot.innerHTML=`<div class="boot-title" style="font-size:26px">SERVER OFFLINE</div><div class="boot-copy" style="margin-top:18px">${esc(e.message)}</div><div class="boot-copy">동적 서버를 실행한 뒤 새로고침해 주세요.</div>`;
    }
  }
  init();
})();
