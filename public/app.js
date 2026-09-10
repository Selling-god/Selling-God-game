'use strict';

(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const screen = $('#screen');
  const modalRoot = $('#modalRoot');
  const toastRoot = $('#toastRoot');
  const boot = $('#boot');
  const app = $('#app');

  const legacyGuestId = localStorage.getItem('riftdeck.guestProfileId') || localStorage.getItem('riftdeck.profileId') || makeId();
  const state = {
    meta: null,
    profile: null,
    guestProfileId: legacyGuestId,
    profileId: legacyGuestId,
    nickname: localStorage.getItem('riftdeck.nickname') || '',
    auth: { enabled:false, authenticated:false, user:null },
    guestMode: localStorage.getItem('riftdeck.guestMode') === '1',
    authMode: 'login',
    room: null,
    roomId: localStorage.getItem('riftdeck.roomId') || '',
    stream: null,
    current: 'home',
    selectedEnemy: null,
    selectedDifficulty: localStorage.getItem('riftdeck.difficulty') || 'normal',
    collectionFilter: 'all',
    collectionSearch: '',
    collectionPage: 0,
    deckDraft: [],
    sound: localStorage.getItem('riftdeck.sound') !== 'off',
    fx: localStorage.getItem('riftdeck.fx') !== 'off',
    audio: null,
    busy: false,
    bannerTimer: 0,
    roomsTimer: 0,
    lastFxSeq: 0,
    lastBattleKey: ''
  };
  localStorage.setItem('riftdeck.guestProfileId', state.guestProfileId);

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const pct = (a,b) => b ? Math.max(0,Math.min(100,a/b*100)) : 0;
  const rarityKo = k => state.meta?.rarities?.[k]?.ko || k;
  const difficultyKo = k => state.meta?.difficulties?.[k]?.ko || k;
  const byId = (arr,id) => arr?.find(x=>x.id===id);

  function makeId(){
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'rd_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  async function api(path, opts={}){
    const res=await fetch(path,{method:opts.method||(opts.body?'POST':'GET'),credentials:'same-origin',headers:opts.body?{'Content-Type':'application/json'}:{},body:opts.body?JSON.stringify(opts.body):undefined});
    let data;try{data=await res.json();}catch{data={ok:false,error:'서버 응답을 읽지 못했습니다.'};}
    if(!res.ok||!data.ok)throw new Error(data.error||`HTTP ${res.status}`);
    return data;
  }
  async function loadProfile(){
    const body=state.auth.authenticated?{profileId:state.profileId}:{profileId:state.profileId,nickname:state.nickname||'방랑자'};
    const d=await api('/api/profile',{body});
    state.profile=d.profile;
    state.profileId=d.profile.id;
    state.nickname=d.profile.nickname||state.nickname;
    if(!state.auth.authenticated)localStorage.setItem('riftdeck.nickname',state.nickname);
    state.deckDraft=[...(state.profile.deck||[])];
    updateTopbar();
    return d.profile;
  }
  async function loadAuth(){
    try{
      const d=await api('/api/auth/status',{method:'GET'});
      state.auth={enabled:!!d.enabled,authenticated:!!d.authenticated,user:d.user||null};
      if(state.auth.authenticated&&state.auth.user){
        state.profileId=state.auth.user.id;
        state.nickname=state.auth.user.nickname||state.nickname||state.auth.user.accountId;
        state.guestMode=false;localStorage.removeItem('riftdeck.guestMode');
      }else state.profileId=state.guestProfileId;
      return state.auth;
    }catch{state.auth={enabled:false,authenticated:false,user:null};return state.auth;}
  }
  function updateTopbar(){
    if(!state.profile)return;
    $('#gemCount').textContent=Number(state.profile.gems||0).toLocaleString('ko-KR');
    $('#dustCount').textContent=Number(state.profile.dust||0).toLocaleString('ko-KR');
    $('#nicknameMini').textContent=state.profile.nickname;
    $('#avatarMini').textContent=(state.profile.nickname||'R').slice(0,1).toUpperCase();
    $('#soundBtn').textContent=state.sound?'♪':'×';
    const fx=$('#fxBtn');if(fx){fx.textContent=state.fx?'✦':'·';fx.title=state.fx?'전투 이펙트 ON':'전투 이펙트 OFF';}
    const chip=$('.profile-chip');if(chip){chip.classList.toggle('cloud',!!state.profile.cloud);chip.title=state.profile.cloud?`클라우드 계정 · ${state.profile.accountId||''}`:'게스트 프로필';}
    $('#versionLabel').textContent=`RIFT DECK v${state.meta?.version||'2'}`;
  }
  function toast(message,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastRoot.appendChild(el);setTimeout(()=>el.remove(),3400);}
  function setBusy(v){state.busy=!!v;document.body.style.cursor=v?'progress':'';}
  function modal(html){modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal">${html}</div></div>`;}
  function closeModal(){modalRoot.innerHTML='';}
  function audioEngine(){
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;state.audio ||= new Ctx();if(state.audio.state==='suspended')state.audio.resume?.();return state.audio;
  }
  function tone(ctx,freq,dur=.08,gain=.04,type='triangle',when=0,endFreq=0){const now=ctx.currentTime+when,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(30,freq),now);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),now+dur);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+dur);o.connect(g).connect(ctx.destination);o.start(now);o.stop(now+dur+.02);}
  function noise(ctx,dur=.08,gain=.035,when=0,cutoff=900){const sr=ctx.sampleRate,b=ctx.createBuffer(1,Math.max(1,Math.floor(sr*dur)),sr),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length);const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),now=ctx.currentTime+when;src.buffer=b;f.type='lowpass';f.frequency.value=cutoff;g.gain.setValueAtTime(gain,now);g.gain.exponentialRampToValueAtTime(.0001,now+dur);src.connect(f).connect(g).connect(ctx.destination);src.start(now);src.stop(now+dur+.01);}
  function sound(kind='click'){
    if(!state.sound)return;try{const ctx=audioEngine();if(!ctx)return;
      if(kind==='click'){tone(ctx,520,.035,.022,'square',0,430);}
      else if(kind==='card'){noise(ctx,.11,.025,0,1800);tone(ctx,330,.12,.035,'triangle',0,720);tone(ctx,910,.06,.018,'sine',.045,1180);}
      else if(kind==='hit'){noise(ctx,.11,.075,0,640);tone(ctx,120,.13,.075,'sawtooth',0,48);tone(ctx,72,.11,.08,'sine',.01,42);}
      else if(kind==='block'){noise(ctx,.08,.04,0,2200);tone(ctx,820,.08,.035,'square',0,490);tone(ctx,1260,.05,.018,'sine',.025,800);}
      else if(kind==='heal'){tone(ctx,440,.12,.032,'sine');tone(ctx,660,.16,.028,'sine',.07);tone(ctx,880,.18,.024,'sine',.14);}
      else if(kind==='summon'){noise(ctx,.14,.022,0,2600);tone(ctx,180,.18,.045,'triangle',0,540);tone(ctx,720,.14,.025,'sine',.09,1040);}
      else if(kind==='enemy'){noise(ctx,.16,.055,0,850);tone(ctx,92,.18,.065,'sawtooth',0,48);}
      else if(kind==='boss'){tone(ctx,52,.42,.08,'sawtooth');tone(ctx,78,.36,.05,'triangle',.08,54);noise(ctx,.26,.045,.02,520);}
      else if(kind==='win'){[523,659,784,1047].forEach((f,i)=>tone(ctx,f,.22,.038,'triangle',i*.075,f*1.04));}
      else if(kind==='gacha'){[740,880,1110,1480].forEach((f,i)=>tone(ctx,f,.26,.03,'sine',i*.055,f*1.18));noise(ctx,.28,.014,0,3600);}
      else if(kind==='reward'){[440,660,990].forEach((f,i)=>tone(ctx,f,.18,.032,'triangle',i*.06));}
      else if(kind==='error'){tone(ctx,180,.16,.05,'square',0,105);tone(ctx,120,.14,.035,'square',.08,82);}
      else tone(ctx,440,.06,.025,'triangle');
    }catch{}
  }
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  function reducedMotion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
  function fxOn(){return state.fx&&!reducedMotion();}
  function rectCenter(el){if(!el)return{x:innerWidth*.5,y:innerHeight*.45};const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};}
  function fxRoot(){let root=$('#combatFxRoot');if(!root){root=document.createElement('div');root.id='combatFxRoot';root.className='combat-fx-root';document.body.appendChild(root);}return root;}
  function screenShake(level='hit'){
    if(!fxOn())return;const target=$('.battle-screen')||document.body;const cls=`shake-${level}`;target.classList.remove('shake-soft','shake-hit','shake-heavy');void target.offsetWidth;target.classList.add(cls);setTimeout(()=>target.classList.remove(cls),level==='heavy'?390:level==='soft'?180:270);
    if(navigator.vibrate&&level==='heavy')navigator.vibrate(22);
  }
  function screenFlash(kind='hit'){
    if(!fxOn())return;const el=document.createElement('div');el.className=`screen-flash ${kind}`;fxRoot().appendChild(el);setTimeout(()=>el.remove(),430);
  }
  function hitStop(level='hit'){
    if(!fxOn())return;document.documentElement.classList.add('rift-hitstop');setTimeout(()=>document.documentElement.classList.remove('rift-hitstop'),level==='heavy'?78:46);
  }
  function popNumber(target,text,kind='damage'){
    if(!state.fx||!target)return;const c=rectCenter(target),el=document.createElement('div');el.className=`combat-number ${kind}`;el.textContent=text;el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;fxRoot().appendChild(el);setTimeout(()=>el.remove(),980);
  }
  function impactBurst(target,element='공허',strength=1){
    if(!fxOn()||!target)return;const c=rectCenter(target),root=fxRoot();const burst=document.createElement('div');burst.className=`impact-burst element-${elementClass(element)}`;burst.style.left=`${c.x}px`;burst.style.top=`${c.y}px`;root.appendChild(burst);
    const count=Math.min(22,8+Math.round(strength*5));for(let i=0;i<count;i++){const p=document.createElement('i');const a=Math.PI*2*i/count+(Math.random()-.5)*.45;const d=34+Math.random()*58*strength;p.style.setProperty('--dx',`${Math.cos(a)*d}px`);p.style.setProperty('--dy',`${Math.sin(a)*d}px`);p.style.setProperty('--rot',`${Math.round(Math.random()*300)}deg`);p.style.animationDelay=`${Math.random()*35}ms`;burst.appendChild(p);}setTimeout(()=>burst.remove(),720);
  }
  function elementClass(element){return ({'화염':'fire','물':'water','자연':'nature','빛':'light','그림자':'shadow','강철':'steel','바람':'wind','번개':'lightning','별':'star','시간':'time','공허':'void','수정':'crystal'})[element]||'void';}
  function slashAt(target,element='강철',heavy=false){
    if(!fxOn()||!target)return;const c=rectCenter(target),el=document.createElement('div');el.className=`slash-fx ${heavy?'heavy':''} element-${elementClass(element)}`;el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;fxRoot().appendChild(el);setTimeout(()=>el.remove(),520);
  }
  function shieldCrack(target){if(!fxOn()||!target)return;const c=rectCenter(target),el=document.createElement('div');el.className='shield-crack';el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;el.innerHTML='<i></i><i></i><i></i><i></i><i></i>';fxRoot().appendChild(el);setTimeout(()=>el.remove(),620);sound('block');}
  function enemyLunge(target){if(!fxOn()||!target)return;target.classList.remove('enemy-lunge');void target.offsetWidth;target.classList.add('enemy-lunge');setTimeout(()=>target.classList.remove('enemy-lunge'),360);}
  function showCenterBanner(title,sub='',kind='turn'){
    if(!state.fx&&kind==='turn')return;const el=document.createElement('div');el.className=`combat-banner ${kind}`;el.innerHTML=`<b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:''}`;fxRoot().appendChild(el);setTimeout(()=>el.remove(),kind==='boss'?1750:kind==='victory'?1500:1050);
  }
  function cardCastWindup(cardEl,card,targetEl){
    if(!fxOn()||!cardEl)return Promise.resolve();const from=cardEl.getBoundingClientRect(),to=targetEl?.getBoundingClientRect();const clone=cardEl.cloneNode(true);clone.classList.add('cast-card-clone');clone.style.left=`${from.left}px`;clone.style.top=`${from.top}px`;clone.style.width=`${from.width}px`;clone.style.height=`${from.height}px`;document.body.appendChild(clone);cardEl.classList.add('card-committed');
    const tx=to?to.left+to.width/2-from.left-from.width/2:innerWidth/2-from.left-from.width/2;const ty=to?to.top+to.height/2-from.top-from.height/2:innerHeight*.38-from.top;
    requestAnimationFrame(()=>{clone.style.transform=`translate(${tx*.72}px,${ty*.72}px) scale(.84) rotate(${card.type==='spell'?'-5':'4'}deg)`;clone.style.filter='brightness(1.8) saturate(1.3)';clone.style.opacity='.9';});
    setTimeout(()=>{clone.style.transform=`translate(${tx}px,${ty}px) scale(.18) rotate(${card.type==='spell'?'-12':'8'}deg)`;clone.style.opacity='0';},110);setTimeout(()=>{clone.remove();cardEl.classList.remove('card-committed');},300);return wait(125);
  }
  function battleDelta(prev,next){
    if(!prev?.battle||!next?.battle)return null;const out={enemies:[],party:[],turnChanged:prev.battle.turn!==next.battle.turn,tier:next.battle.tier};
    const pe=Object.fromEntries(prev.battle.enemies.map(x=>[x.uid,x]));for(const e of next.battle.enemies){const b=pe[e.uid];if(!b)continue;const hp=e.hp-b.hp,block=(e.block||0)-(b.block||0);if(hp||block)out.enemies.push({uid:e.uid,hp,block,dead:b.hp>0&&e.hp<=0});}
    const pp=Object.fromEntries(prev.battle.party.map(x=>[x.playerId,x]));for(const pc of next.battle.party){const b=pp[pc.playerId];if(!b)continue;const hp=pc.hp-b.hp,block=(pc.block||0)-(b.block||0),units=pc.units.length-b.units.length;if(hp||block||units)out.party.push({playerId:pc.playerId,hp,block,units,down:!b.down&&pc.down});}
    return out;
  }
  function playCombatDelta(prev,next){
    if(!fxOn())return;const d=battleDelta(prev,next);if(!d)return;let peak=0;
    for(const x of d.enemies){const target=$(`[data-enemy="${CSS.escape(x.uid)}"]`);if(x.hp<0){const dmg=-x.hp;peak=Math.max(peak,dmg);target?.classList.add(x.dead?'enemy-death':'enemy-hurt');popNumber(target,`-${dmg}`,'damage');impactBurst(target,'공허',Math.min(1.8,.7+dmg/32));slashAt(target,'강철',dmg>=22);if(x.dead){screenFlash('kill');sound('hit');}}else if(x.hp>0){popNumber(target,`+${x.hp}`,'heal');sound('heal');}if(x.block>0){popNumber(target,`+${x.block} BLOCK`,'block');sound('block');}else if(x.block<0){popNumber(target,`${x.block} BLOCK`,'block-loss');shieldCrack(target);}}
    for(const x of d.party){if(x.playerId!==state.profileId)continue;const target=$('.player-panel')||$('.combatant-chip.me');if(x.hp<0){const dmg=-x.hp;peak=Math.max(peak,dmg);const attacker=$('.enemy-card:not(.enemy-death)');enemyLunge(attacker);slashAt(target,'그림자',dmg>=20);impactBurst(target,'그림자',Math.min(1.45,.65+dmg/38));popNumber(target,`-${dmg}`,'damage player');screenFlash('hurt');sound('enemy');}else if(x.hp>0){popNumber(target,`+${x.hp} HP`,'heal');screenFlash('heal');sound('heal');}if(x.block>0){popNumber(target,`+${x.block} BLOCK`,'block');sound('block');}else if(x.block<0){popNumber(target,`${x.block} BLOCK`,'block-loss');shieldCrack(target);}if(x.units>0){$$('.unit-slot.filled').slice(-x.units).forEach((u,i)=>setTimeout(()=>{u.classList.add('unit-summon');impactBurst(u,'빛',.65);sound('summon');},i*70));}}
    if(peak>=28){screenShake('heavy');hitStop('heavy');sound('hit');}else if(peak>0){screenShake('hit');hitStop('hit');}
    if(d.turnChanged&&next.battle?.phase==='players')setTimeout(()=>showCenterBanner(`TURN ${next.battle.turn}`,'YOUR TURN','turn'),110);
  }

  function playRoomEvents(next,afterSeq){
    if(!next?.feed)return;const events=next.feed.filter(ev=>Number(ev.seq)>Number(afterSeq||0));for(const ev of events){
      if(ev.type==='battle-start'){if(ev.payload?.tier==='boss'){screenShake('heavy');screenFlash('boss');showCenterBanner('BOSS ENCOUNTER',`${next.floor}F · ${next.biome?.name||''}`,'boss');sound('boss');}else showCenterBanner(ev.payload?.tier==='elite'?'ELITE ENCOUNTER':'BATTLE START',`${next.floor}F · ${next.biome?.name||''}`,'turn');}
      else if(ev.type==='turn')showCenterBanner(`TURN ${next.battle?.turn||''}`,'적의 의도를 읽고 카드를 선택하세요','turn');
      else if(ev.type==='card'&&ev.payload?.playerId!==state.profileId){const target=ev.payload?.targetUid?$(`[data-enemy="${CSS.escape(ev.payload.targetUid)}"]`):null;if(target)slashAt(target,ev.payload.element,ev.payload.cardType==='spell');showCenterBanner(ev.payload?.cardName||'CARD',playerNameFromRoom(next,ev.payload?.playerId),'ally');}
      else if(ev.type==='win'){screenFlash('victory');screenShake('soft');showCenterBanner(ev.payload?.final?'ABYSS CONQUERED':'VICTORY',ev.payload?.final?'50층 심연 정복':'전투 승리','victory');sound('win');}
      else if(ev.type==='defeat'){screenFlash('defeat');screenShake('heavy');showCenterBanner('EXPEDITION FAILED',`${ev.payload?.floor||next.floor}F`,'defeat');sound('error');}
    }
  }
  function playerNameFromRoom(r,id){return r?.players?.find(p=>p.id===id)?.nickname||'ALLY';}
  function acceptRoomUpdate(next,{initial=false}={}){
    const prev=state.room;const after=initial?Number(next?.seq||0):Number(state.lastFxSeq||prev?.seq||0);state.room=next;state.lastFxSeq=Math.max(Number(state.lastFxSeq||0),Number(next?.seq||0));
    if(state.current.startsWith('room')||['route','battle','reward','event','end'].includes(state.current)||initial)renderRoom();
    if(!initial)requestAnimationFrame(()=>{playCombatDelta(prev,next);playRoomEvents(next,after);});
  }
  function clearTimers(){clearInterval(state.bannerTimer);clearInterval(state.roomsTimer);state.bannerTimer=0;state.roomsTimer=0;}
  function setScreen(name,html){clearTimers();state.current=name;screen.innerHTML=html;window.scrollTo({top:0,behavior:'instant'});}

  function cardHtml(card,opt={}){
    if(!card)return '';
    const tag=opt.compact?'div':'button';
    const cls=`game-card${opt.compact?' mini-card':''}${opt.claimed?' claimed':''}`;
    const attrs=[`data-rarity="${esc(card.rarity)}"`];
    if(opt.action)attrs.push(`data-action="${esc(opt.action)}"`);if(opt.index!=null)attrs.push(`data-index="${opt.index}"`);if(opt.rewardId)attrs.push(`data-reward-id="${esc(opt.rewardId)}"`);if(opt.cardId)attrs.push(`data-card-id="${esc(opt.cardId)}"`);if(opt.disabled)attrs.push('disabled');
    const stats=card.type==='unit'?`<span>HP ${card.hp}</span><span>ATK ${card.power}</span>`:`${card.power?`<span>DMG ${card.power}</span>`:''}${card.block?`<span>DEF ${card.block}</span>`:''}`;
    return `<${tag} class="${cls}" ${attrs.join(' ')}><div class="rarity-ribbon rarity-${card.rarity}">${esc(rarityKo(card.rarity))}${card.limited?' · LIMITED':''}</div><div class="card-top"><span class="cost">${card.cost}</span><span class="card-name">${esc(card.name)}</span></div><div class="card-art"><img src="${esc(card.art)}" loading="lazy" alt=""></div><div class="card-type"><span>${card.type==='unit'?'UNIT':'SPELL'}</span><span>${esc(card.element)}</span></div><div class="card-text">${esc(card.text)}</div><div class="card-stats">${stats}</div></${tag}>`;
  }
  function itemHtml(item,opt={}){
    if(!item)return '';
    return `<button class="reward-item ${opt.claimed?'claimed':''}" data-rarity="${esc(item.rarity)}" ${opt.action?`data-action="${esc(opt.action)}"`:''} ${opt.rewardId?`data-reward-id="${esc(opt.rewardId)}"`:''} ${opt.disabled?'disabled':''}><div class="rarity-ribbon rarity-${item.rarity}">${esc(rarityKo(item.rarity))} · ITEM</div><div class="item-icon"><span>${esc(item.icon||'◆')}</span></div><b>${esc(item.name)}</b><p>${esc(item.text)}</p><div class="stack-limit">최대 중첩 ${item.maxStack||1}</div></button>`;
  }
  function featureChips(){return `<div class="feature-strip"><span class="feature-chip">315 CARDS</span><span class="feature-chip">50 FLOORS</span><span class="feature-chip">1–4 CO-OP</span><span class="feature-chip">3 DIFFICULTIES</span><span class="feature-chip">CLOUD ACCOUNT</span><span class="feature-chip">IMPACT VFX</span></div>`;}
  function renderAuth(){
    state.current='auth';clearTimers();
    const register=state.authMode==='register';
    screen.innerHTML=`<section class="auth-screen"><div class="auth-bg"><span></span><span></span><span></span></div><div class="auth-shell"><div class="auth-brand"><div class="auth-rift">◇</div><div><div class="section-label">RIFT NETWORK // CLOUD SAVE</div><h1>RIFT DECK</h1><p>한 번 로그인하면 카드 컬렉션, 재화, 덱, 소환 천장, 던전 최고 기록이 Supabase 계정에 연결되어 다른 기기에서도 이어집니다.</p></div></div><div class="auth-tabs"><button class="${register?'':'active'}" data-action="auth-tab" data-mode="login">로그인</button><button class="${register?'active':''}" data-action="auth-tab" data-mode="register">새 계정</button></div><div class="auth-form">${register?`<label>닉네임<input id="authNickname" maxlength="14" autocomplete="nickname" placeholder="게임에 표시될 이름"></label>`:''}<label>아이디<input id="authAccount" maxlength="20" autocomplete="username" placeholder="영문/숫자/_ 3~20자"></label><label>비밀번호<input id="authPassword" type="password" maxlength="72" autocomplete="${register?'new-password':'current-password'}" placeholder="6자 이상"></label><button class="auth-submit" data-action="${register?'auth-signup':'auth-login'}">${register?'탐험가 계정 생성':'RIFT 접속'}</button><div class="auth-security"><b>SERVER AUTH</b><span>비밀번호는 게임 서버에 저장하지 않고 Supabase Auth가 처리합니다.</span></div></div><div class="auth-guest"><button data-action="guest-enter">게스트로 먼저 체험</button><small>게스트 기록은 이 브라우저에만 의존할 수 있습니다. 로그인하면 현재 게스트 진행도 계정으로 옮겨집니다.</small></div></div></section>`;
    window.scrollTo({top:0,behavior:'instant'});
  }
  async function authSubmit(mode){
    if(state.busy)return;const account=$('#authAccount')?.value?.trim(),password=$('#authPassword')?.value||'',nickname=$('#authNickname')?.value?.trim();
    if(!account)return toast('아이디를 입력해 주세요.','error');if(password.length<6)return toast('비밀번호는 6자 이상 입력해 주세요.','error');if(mode==='signup'&&!nickname)return toast('닉네임을 입력해 주세요.','error');
    setBusy(true);try{
      const d=await api(`/api/auth/${mode}`,{body:{accountId:account,password,nickname,guestProfileId:state.guestProfileId}});
      state.auth={enabled:true,authenticated:true,user:d.user};state.profile=d.profile;state.profileId=d.profile.id;state.nickname=d.profile.nickname;state.guestMode=false;localStorage.removeItem('riftdeck.guestMode');localStorage.setItem('riftdeck.nickname',state.nickname);state.room=null;state.roomId='';localStorage.removeItem('riftdeck.roomId');updateTopbar();screenFlash('login');sound('reward');toast(mode==='signup'?'계정 생성 완료! 진행 기록이 클라우드에 연결되었습니다.':'로그인 완료. 클라우드 기록을 불러왔습니다.','good');renderHome();
    }catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}
  }
  async function logout(){
    try{await api('/api/auth/logout',{body:{}});}catch{}state.stream?.close();state.stream=null;state.auth={enabled:!!state.meta?.authEnabled,authenticated:false,user:null};state.profile=null;state.profileId=state.guestProfileId;state.room=null;state.roomId='';localStorage.removeItem('riftdeck.roomId');state.guestMode=false;localStorage.removeItem('riftdeck.guestMode');renderAuth();toast('로그아웃했습니다.','good');
  }
  function homeHtml(){
    const featured=(state.meta.banner.featured||[]).map(id=>byId(state.meta.cards,id)).filter(Boolean);const active=state.room&&!['ended','cleared'].includes(state.room.status);
    return `<section class="home"><div class="home-hero"><div class="world-panel"><div class="hero-content"><div class="eyebrow">ORIGINAL PIXEL CARD ROGUELITE · DYNAMIC SERVER</div><h1>50층 심연을 돌파하라.<em>카드가 곧 파티다.</em></h1><p>일반 여행에서 카드 흔적을 봉인해 컬렉션을 키우고, 준비가 끝나면 최대 4명이 함께 50층 협동 던전에 도전하세요. 전투마다 손패·에너지·적 의도를 읽고, 층을 넘을 때마다 카드 또는 런 아이템 1개를 선택해 빌드를 완성합니다.</p>${featureChips()}<div class="home-actions"><button class="mode-button primary" data-action="journey-create"><span class="mode-kicker">SOLO · COLLECTION</span><b>일반 여행</b><small>카드 흔적 발견 · 봉인 · 영구 컬렉션 획득</small></button><button class="mode-button" data-action="dungeon-lobby"><span class="mode-kicker">1–4 PLAYER · MAIN MODE</span><b>50층 협동 던전</b><small>보통 / 어려움 / 지옥 · 매 층 무료 보상 드래프트</small></button></div>${active?`<button class="cta mint" style="margin-top:10px" data-action="resume-room">진행 중인 원정 이어하기 · ${esc(state.room.id)}</button>`:''}</div></div><aside class="banner-panel"><div class="section-label">LIMITED RERUN ARCHIVE</div><h2>${esc(state.meta.banner.name)}</h2><p>${esc(state.meta.banner.subtitle)}</p><div class="featured-stack">${featured.map(c=>cardHtml(c,{compact:true})).join('')}</div><div class="banner-timer">종료까지 <b id="bannerClock">--:--:--</b></div><div class="banner-actions"><button class="cta" data-action="gacha-pull" data-count="1">1회 · ◆${state.meta.banner.singleCost}</button><button class="cta gold" data-action="gacha-pull" data-count="10">10회 · ◆${state.meta.banner.tenCost}</button></div></aside></div><div class="quick-grid"><button class="quick-card" data-action="collection"><span class="quick-icon">▤</span><b>카드 보관함</b><small>${state.profile.ownedCount}/${state.profile.totalCards}종 · 검색/필터/덱 편성</small></button><button class="quick-card" data-action="gacha"><span class="quick-icon">◇</span><b>복각 소환</b><small>기간 한정 카드 · 전설/신화 천장</small></button><button class="quick-card" data-action="dungeon-lobby"><span class="quick-icon">♜</span><b>원정대 찾기</b><small>공개 방 또는 6자리 코드 참가</small></button><button class="quick-card" data-action="profile"><span class="quick-icon">⌁</span><b>탐험 기록</b><small>난이도별 최고 층 · 클리어 · 봉인 기록</small></button></div></section>`;
  }
  function renderHome(){closeStreamIfInactive();setScreen('home',homeHtml());tickBanner();state.bannerTimer=setInterval(tickBanner,1000);}
  function tickBanner(){const el=$('#bannerClock');if(!el)return;const ms=Math.max(0,new Date(state.meta.banner.endsAt)-Date.now());const d=Math.floor(ms/86400000),h=Math.floor(ms/3600000)%24,m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;el.textContent=`${d}D ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

  async function renderDungeonLobby(){
    setScreen('dungeonLobby',`<section class="page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">CO-OP DUNGEON</div><h1>50층 협동 던전</h1><p>방을 만들 때 난이도를 선택합니다. 난이도가 높을수록 적이 강해지고, 대신 희귀 보상과 골드/프리즘 보정이 좋아집니다.</p></div></div><div class="lobby-grid"><div class="room-create"><h2>새 원정대 만들기</h2><p>최대 4명. 혼자서도 시작할 수 있으며, 모든 전투 판정은 동적 서버에서 처리됩니다.</p>${difficultySelector()}<div class="field"><input id="roomNameInput" maxlength="24" placeholder="원정대 이름 (선택)"><button class="cta mint" data-action="create-dungeon">방 만들기</button></div><div style="height:8px"></div><div class="field"><input id="roomCodeInput" maxlength="6" inputmode="numeric" placeholder="6자리 방 코드"><button class="cta" data-action="join-code">코드 참가</button></div></div><div class="public-rooms"><div class="section-label">OPEN ROOMS</div><h2 style="font-size:13px">공개 원정대</h2><div id="publicRooms"><p class="small-note">방 목록을 불러오는 중...</p></div></div></div></section>`);
    await refreshRooms();state.roomsTimer=setInterval(refreshRooms,5000);
  }
  function difficultySelector(){
    return `<div class="difficulty-grid">${Object.entries(state.meta.difficulties).map(([k,d])=>`<button class="difficulty-card ${state.selectedDifficulty===k?'selected':''}" data-action="difficulty" data-diff="${k}"><b>${esc(d.ko)}</b><strong>${esc(d.subtitle)}</strong><p>${esc(d.desc)}</p><div class="diff-stats"><span>HP ×${d.enemyHp}</span><span>ATK ×${d.enemyAtk}</span><span>보상 ×${d.rewardLuck}</span></div></button>`).join('')}</div>`;
  }
  async function refreshRooms(){
    const root=$('#publicRooms');if(!root)return;try{const d=await api('/api/rooms');root.innerHTML=d.rooms.length?d.rooms.map(r=>`<div class="room-row"><div><b>${esc(r.name)}</b><small><span class="diff-pill ${r.difficulty}">${esc(difficultyKo(r.difficulty))}</span>${esc(r.host)} · ${r.players}/${r.maxPlayers}명 · 코드 ${r.id}</small></div><button class="cta" data-action="join-public" data-room="${r.id}">참가</button></div>`).join(''):`<p class="small-note">현재 대기 중인 공개 방이 없습니다. 직접 만들어 시작해 보세요.</p>`;}catch(e){root.innerHTML=`<p class="small-note">${esc(e.message)}</p>`;}
  }
  async function createDungeon(){if(state.busy)return;setBusy(true);try{const d=await api('/api/rooms/create',{body:{profileId:state.profileId,nickname:state.profile.nickname,mode:'dungeon',name:$('#roomNameInput')?.value||'',difficulty:state.selectedDifficulty}});enterRoom(d.room);}catch(e){toast(e.message,'error');}finally{setBusy(false);}}
  async function createJourney(){if(state.busy)return;setBusy(true);try{const d=await api('/api/rooms/create',{body:{profileId:state.profileId,nickname:state.profile.nickname,mode:'journey',name:`${state.profile.nickname}의 여행`,difficulty:'normal'}});enterRoom(d.room);await roomPost('start',{});}catch(e){toast(e.message,'error');}finally{setBusy(false);}}
  async function joinRoom(roomId){roomId=String(roomId||'').replace(/\D/g,'').slice(0,6);if(roomId.length!==6)return toast('6자리 방 코드를 입력해 주세요.','error');if(state.busy)return;setBusy(true);try{const d=await api('/api/rooms/join',{body:{profileId:state.profileId,nickname:state.profile.nickname,roomId}});enterRoom(d.room);}catch(e){toast(e.message,'error');}finally{setBusy(false);}}
  function enterRoom(room){state.roomId=room.id;localStorage.setItem('riftdeck.roomId',room.id);state.lastFxSeq=Number(room.seq||0);acceptRoomUpdate(room,{initial:true});connectStream(room.id);}
  function connectStream(roomId){if(state.stream)state.stream.close();const es=new EventSource(`/api/room/${roomId}/stream?profileId=${encodeURIComponent(state.profileId)}`,{withCredentials:true});state.stream=es;es.addEventListener('room-update',ev=>{try{acceptRoomUpdate(JSON.parse(ev.data));}catch{}});es.onerror=()=>{$('#serverBadge')?.classList.add('warn');};es.onopen=()=>{$('#serverBadge')?.classList.remove('warn');};}
  function closeStreamIfInactive(){if(!state.room||['ended','cleared'].includes(state.room.status)){state.stream?.close();state.stream=null;}}
  async function roomPost(action,payload={}){if(!state.roomId)throw new Error('원정 방이 없습니다.');setBusy(true);try{const d=await api(`/api/room/${state.roomId}/${action}`,{body:{profileId:state.profileId,nickname:state.profile.nickname,...payload}});if(d.profile){state.profile=d.profile;state.profileId=d.profile.id;updateTopbar();}if(d.room)acceptRoomUpdate(d.room);return d;}catch(e){toast(e.message,'error');sound('error');throw e;}finally{setBusy(false);}}

  function renderRoom(){const r=state.room;if(!r)return renderHome();if(r.status==='lobby')return renderRoomLobby(r);if(r.status==='route')return renderRoute(r);if(r.status==='battle')return renderBattle(r);if(r.status==='event')return renderEvent(r);if(r.status==='reward')return renderReward(r);if(['ended','cleared'].includes(r.status))return renderEnd(r);}
  function renderRoomLobby(r){
    const slots=Array.from({length:r.maxPlayers},(_,i)=>r.players[i]);
    setScreen('roomLobby',`<section class="room-panel"><div class="room-shell"><div class="room-hero"><div class="section-label">EXPEDITION LOBBY · ${r.mode==='dungeon'?'50F CO-OP':'JOURNEY'}</div><h1>${esc(r.name)}</h1><div class="room-code">ROOM CODE <b>${r.id}</b><button class="cta" data-action="copy-room">복사</button></div><p class="small-note" style="margin-top:12px">난이도 <span class="diff-pill ${r.difficulty}">${esc(difficultyKo(r.difficulty))}</span> · ${r.mode==='dungeon'?'최대 4명 · 50층':'1인 카드 수집 여행'}</p></div><div class="party-slots">${slots.map((p,i)=>p?`<div class="party-slot"><div class="party-avatar">${esc(p.nickname.slice(0,1))}</div><b>${esc(p.nickname)}</b><small>${p.id===r.hostId?'원정대장':'원정대원'} · 준비 완료</small>${p.id===r.hostId?'<span class="host-tag">HOST</span>':''}</div>`:`<div class="party-slot empty"><div class="party-avatar">?</div><b>빈 자리</b><small>방 코드를 공유하세요</small></div>`).join('')}</div><div class="room-actions"><button class="cta" data-action="home">홈으로</button>${r.hostId===state.profileId?`<button class="cta mint" data-action="room-start">${r.players.length===1?'혼자 시작':'원정 시작'} · ${r.players.length}명</button>`:'<span class="small-note">방장이 시작하기를 기다리는 중...</span>'}</div></div></section>`);
  }
  function runItemRack(run){const entries=Object.entries(run?.items||{});return `<div class="run-rack"><strong>RUN ITEMS · G ${Number(run?.gold||0).toLocaleString()}</strong>${entries.length?entries.map(([id,n])=>{const it=byId(state.meta.items,id);return `<span class="run-item-chip" title="${esc(it?.text||'')}">${esc(it?.icon||'◆')} ${esc(it?.name||id)}<em>×${n}</em></span>`;}).join(''):'<span class="small-note">아직 획득한 런 아이템이 없습니다.</span>'}</div>`;}
  function expeditionHeader(r){const max=r.maxFloor||Math.max(50,r.floor+1),progress=r.maxFloor?pct(r.floor,max):Math.min(100,r.floor%50*2);return `<div class="expedition-head" style="background-image:url('${esc(r.biome.background)}')"><div class="expedition-copy"><div class="section-label">${r.mode==='dungeon'?`${difficultyKo(r.difficulty)} DUNGEON · ${r.biome.short}`:`JOURNEY · ${r.biome.short}`}</div><div class="floor-line"><div class="floor-num">${r.floor}<small>F${r.maxFloor?` / ${r.maxFloor}`:''}</small></div><div class="biome-name">${esc(r.biome.name)}<div class="small-note">${esc(r.biome.desc)}</div></div></div><div class="progress-track"><i style="width:${progress}%"></i></div><div class="milestones"><span>1F</span><span>10F</span><span>20F</span><span>30F</span><span>40F</span><span>${r.maxFloor||'∞'}F</span></div></div></div>`;}
  function partyStrip(r){return `<div class="party-strip">${r.players.map(p=>{const run=r.runState[p.id];return `<div class="party-chip"><b>${esc(p.nickname)}${p.id===state.profileId?' · YOU':''}</b><small>HP ${run?.hp||0}/${run?.maxHp||0} · G ${run?.gold||0} · 덱 ${run?.runDeck?.length||0} · 아이템 ${Object.keys(run?.items||{}).length}</small><div class="hpbar"><i style="width:${pct(run?.hp,run?.maxHp)}%"></i></div></div>`;}).join('')}</div>`;}
  function renderRoute(r){const mine=r.runState[state.profileId];const voted=r.route?.find(n=>n.votes.includes(state.profileId))?.id;setScreen('route',`${expeditionHeader(r)}<section class="route-page">${partyStrip(r)}${runItemRack(mine)}<div class="route-nodes">${r.route.map(n=>`<button class="route-node ${voted===n.id?'voted':''}" data-action="route-vote" data-node="${esc(n.id)}"><span class="vote-count">${n.votes.length}/${r.players.length}</span><div class="node-icon"><span>${esc(n.icon)}</span></div><b>${esc(n.label)}</b><p>${esc(n.desc)}</p></button>`).join('')}</div><p class="small-note" style="text-align:center">전원이 투표하면 가장 많은 표를 받은 경로로 이동합니다. 동률이면 서버가 후보 중 하나를 선택합니다.</p></section>`);}

  function renderBattle(r){
    const b=r.battle,me=b.party.find(p=>p.playerId===state.profileId);if(!me)return;
    const alive=b.enemies.filter(e=>e.hp>0);if(!state.selectedEnemy||!alive.some(e=>e.uid===state.selectedEnemy))state.selectedEnemy=alive[0]?.uid||null;
    const run=r.runState[state.profileId];
    setScreen('battle',`<section class="battle-screen"><div class="battle-backdrop" style="background-image:url('${esc(r.biome.background)}')"></div><div class="battle-vignette"></div><div class="battle-hud"><div class="battle-top">${b.party.map(pc=>`<div class="combatant-chip ${pc.playerId===state.profileId?'me':''}"><b>${esc(pc.nickname)}${pc.down?' · DOWN':''}</b><small>T${b.turn}${pc.ended?' · READY':''}</small><div class="hpbar"><i style="width:${pct(pc.hp,pc.maxHp)}%"></i></div><small>HP ${pc.hp}/${pc.maxHp} · <span class="energy-mini">⚡${pc.energy}/${pc.maxEnergy}</span> · 유닛 ${pc.units.length}/3</small></div>`).join('')}</div><div class="enemy-zone">${alive.map(e=>`<button class="enemy-card ${state.selectedEnemy===e.uid?'selected':''} ${b.tier==='boss'?'boss':''}" data-action="select-enemy" data-enemy="${e.uid}"><div class="enemy-intent"><span>${esc(e.intent.icon)}</span><b>${esc(e.intent.text)}</b></div><img class="enemy-sprite" src="${esc(e.sprite)}" alt=""><div class="enemy-name"><b>${esc(e.name)}</b><div class="enemy-hp"><i style="width:${pct(e.hp,e.maxHp)}%"></i></div><div class="enemy-stats">HP ${e.hp}/${e.maxHp}${e.block?` · BLOCK ${e.block}`:''}${e.debuffs?.vulnerable?` · 취약 ${e.debuffs.vulnerable}`:''}${e.debuffs?.weak?` · 약화 ${e.debuffs.weak}`:''}${e.debuffs?.burn?` · 화상 ${e.debuffs.burn}`:''}</div></div></button>`).join('')}<div class="unit-board">${[0,1,2].map(i=>{const u=me.units[i];return u?`<div class="unit-slot filled"><img src="${esc(byId(state.meta.cards,u.cardId)?.art||'')}" alt=""><b>${esc(u.name)} · ATK ${u.power}</b></div>`:'<div class="unit-slot"><span class="small-note">UNIT SLOT</span></div>';}).join('')}</div></div><div class="battle-bottom"><div class="player-panel"><h3>${esc(me.nickname)}</h3><div class="big-hp">HP <b>${me.hp}/${me.maxHp}</b> · BLOCK ${me.block}</div><div class="hpbar"><i style="width:${pct(me.hp,me.maxHp)}%"></i></div><div class="energy">⚡ ${me.energy} / ${me.maxEnergy}</div><div class="pile-stats"><span>DRAW<br>${me.drawPile.length}</span><span>HAND<br>${me.hand.length}</span><span>DISCARD<br>${me.discard.length}</span></div><div class="small-note" style="margin-top:7px">RUN GOLD ${run.gold}G · ITEMS ${Object.keys(run.items||{}).length}</div></div><div class="hand-wrap"><div class="hand">${me.hand.map((cid,i)=>{const c=byId(state.meta.cards,cid);const can=!me.ended&&!me.down&&b.phase==='players'&&me.energy>=Math.max(0,c.cost-(me.buffs.anyDiscount>0?1:(c.type==='spell'&&me.buffs.spellDiscount>0?1:0)))&&!(c.type==='unit'&&me.units.length>=3);return cardHtml(c,{action:'play-card',index:i,disabled:!can});}).join('')}</div></div><div class="battle-actions"><div class="section-label">ENEMY INTENT</div><div class="intent-help">적 머리 위 아이콘은 다음 행동입니다. 공격을 막을지, 취약을 걸고 빠르게 정리할지 판단하세요. 유닛은 원정대 전원이 턴을 종료한 뒤 함께 공격합니다.</div><div class="combat-log">${b.log.slice(-12).map(x=>`<p>${esc(x.text)}</p>`).join('')}</div>${me.ended?'<div class="waiting">다른 원정대원의 턴 종료를 기다리는 중...</div>':`<button class="cta end-turn" data-action="end-turn">턴 종료 · E</button>`}</div></div></div></section>`);
  }

  function runMod(run,key){let n=0;for(const [id,count] of Object.entries(run?.items||{})){const it=byId(state.meta.items,id);n+=Number(it?.mod?.[key]||0)*Number(count||0);}return n;}
  function nextRerollCost(r){const run=r.runState[state.profileId],count=Number(r.reward.rerolls?.[state.profileId]||0),discount=Math.min(.70,runMod(run,'rerollDiscount')),base=42+r.floor*3;return Math.max(20,Math.round(base*Math.pow(1.55,count)*(1-discount)));}
  function renderReward(r){
    const rw=r.reward,run=r.runState[state.profileId],options=rw.playerOptions?.[state.profileId]||[],claim=rw.claims?.[state.profileId],continued=rw.continueBy?.includes(state.profileId);const capture=r.mode==='journey'&&r.capture&&!r.capture.escaped?r.capture:null;
    const optionHtml=options.map(o=>o.type==='card'?cardHtml(o.card,{action:'reward-pick',rewardId:o.id,claimed:!!claim,disabled:!!claim}):itemHtml(o.item,{action:'reward-pick',rewardId:o.id,claimed:!!claim,disabled:!!claim})).join('');
    const captureHtml=capture?`<div class="capture-panel"><img src="${esc(capture.card.art)}" alt=""><div><div class="section-label">CARD ECHO DETECTED</div><h3 class="rarity-${capture.card.rarity}">${esc(capture.card.name)} · ${esc(rarityKo(capture.card.rarity))}</h3><p>일반 여행에서만 나타나는 카드 흔적입니다. 높은 등급일수록 등장도 드물고 봉인 성공률도 낮습니다.</p><div class="seal-row"><button class="seal-btn" data-action="capture" data-seal="basic">기본 봉인구 ×${state.profile.seals.basic||0}</button><button class="seal-btn" data-action="capture" data-seal="silver">은빛 봉인구 ×${state.profile.seals.silver||0}</button><button class="seal-btn royal" data-action="capture" data-seal="royal">왕가 봉인구 ×${state.profile.seals.royal||0}</button></div></div></div>`:'';
    const shopHtml=rw.kind==='merchant'?merchantHtml(r):'';
    setScreen('reward',`<section class="reward-page"><div class="reward-shell"><div class="reward-head"><div class="section-label">FLOOR ${r.floor} REWARD · CHOOSE ONE</div><h1>${esc(rw.title)}</h1><p>${esc(rw.text)}</p><div class="reward-meta"><span>${difficultyKo(r.difficulty)}</span><span>RUN GOLD ${run.gold}G</span><span>덱 ${run.runDeck.length}장</span><span>런 아이템 ${Object.keys(run.items||{}).length}종</span><span>재굴림 ${rw.rerolls?.[state.profileId]||0}/5</span></div></div><div class="reward-options">${optionHtml||'<p class="small-note">선택형 보상이 없습니다.</p>'}</div><div class="claim-note">${claim?`선택 완료 · ${esc(claim.label)}`:'카드 또는 아이템 중 정확히 1개를 무료로 선택합니다.'}</div><div class="reward-actions">${!claim&&options.length?`<button class="cta gold" data-action="reward-reroll">재굴림 · ${nextRerollCost(r)}G</button>`:''}<button class="cta mint" data-action="reward-continue" ${options.length&&!claim?'disabled':''}>${continued?'동료를 기다리는 중...':r.finalClearPending?'50층 클리어 확정':'다음 층으로'}</button></div>${captureHtml}${shopHtml}${runItemRack(run)}</div></section>`);
  }
  function merchantHtml(r){const rw=r.reward,run=r.runState[state.profileId];return `<div class="merchant-panel"><div class="section-label" style="text-align:center">WANDERING MERCHANT</div><h2>추가 구매 · 현재 ${run.gold}G</h2><div class="shop-grid">${(rw.shop||[]).map(x=>{const bought=rw.purchased?.[`${state.profileId}:${x.id}`];const obj=x.type==='card'?x.card:x.item;const name=obj.name,text=obj.text,rar=obj.rarity,icon=x.type==='card'?'▤':(obj.icon||'◆');return `<div class="shop-card"><div class="rarity-${rar}" style="font-size:6px">${rarityKo(rar)} · ${x.type==='card'?'CARD':'ITEM'}</div><b>${esc(icon)} ${esc(name)}</b><p>${esc(text)}</p><div class="price">${x.price}G</div><button class="cta" data-action="buy" data-item="${x.id}" data-type="${x.type}" ${bought?'disabled':''}>${bought?'구매 완료':'구매'}</button></div>`;}).join('')}</div></div>`;}

  function renderEvent(r){const ev=r.event,mine=ev.chosenBy?.[state.profileId];setScreen('event',`<section class="event-screen"><div class="event-card"><div class="event-sigil">◇</div><div class="section-label">MYSTERY ENCOUNTER · ${r.floor}F</div><h1>${esc(ev.title)}</h1><p>${esc(ev.text)}</p><div class="event-choices">${ev.choices.map(c=>`<button class="event-choice" data-action="event-choice" data-choice="${esc(c.id)}" ${mine?'disabled':''}><b>${esc(c.label)}</b><small>${esc(c.desc)}</small></button>`).join('')}</div>${mine?'<p class="small-note">선택 완료 · 다른 원정대원을 기다립니다.</p>':''}</div></section>`);}
  function renderEnd(r){const clear=r.status==='cleared';setScreen('end',`<section class="event-screen"><div class="event-card"><div class="event-sigil">${clear?'♛':'☒'}</div><div class="section-label">${clear?'50F DUNGEON CLEAR':'EXPEDITION ENDED'}</div><h1>${esc(r.reward?.title||'원정 종료')}</h1><p>${esc(r.reward?.text||'')}</p><div class="stat-grid">${r.players.map(p=>{const run=r.runState[p.id];return `<div class="stat-box"><b>${esc(p.nickname)}</b><small>도달 ${r.floor}F · 덱 ${run?.runDeck?.length||0} · 아이템 ${Object.keys(run?.items||{}).length}</small></div>`;}).join('')}</div><div class="modal-actions" style="justify-content:center"><button class="cta mint" data-action="finish-run">홈으로 돌아가기</button></div></div></section>`);}

  function renderCollection(){state.deckDraft=[...(state.profile.deck||[])];state.collectionPage=0;renderCollectionInner();}
  function renderCollectionInner(){
    const q=state.collectionSearch.trim().toLowerCase();let cards=state.meta.cards.filter(c=>(state.collectionFilter==='all'||state.collectionFilter===c.rarity||state.collectionFilter===c.type)&&(!q||c.name.toLowerCase().includes(q)||c.element.toLowerCase().includes(q)||c.text.toLowerCase().includes(q)));const pageSize=60,pages=Math.max(1,Math.ceil(cards.length/pageSize));state.collectionPage=Math.max(0,Math.min(state.collectionPage,pages-1));const view=cards.slice(state.collectionPage*pageSize,(state.collectionPage+1)*pageSize);
    setScreen('collection',`<section class="page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">ARCHIVE & DECK · 315 CARD CATALOG</div><h1>카드 보관함</h1><p>보유 카드 8~16종을 선택해 시작 덱을 구성합니다. 일반 여행의 봉인과 복각 소환으로 새로운 카드를 영구 해금할 수 있습니다.</p></div><div class="right"><b>${state.profile.ownedCount}/${state.profile.totalCards}</b></div></div><div class="collection-toolbar"><div class="filter-row">${[['all','전체'],['unit','유닛'],['spell','스펠'],['common','일반'],['rare','희귀'],['ultra','초희귀'],['legendary','전설'],['mythic','신화']].map(([k,n])=>`<button class="filter-btn ${state.collectionFilter===k?'active':''}" data-action="filter" data-filter="${k}">${n}</button>`).join('')}</div><input class="search-input" id="collectionSearch" value="${esc(state.collectionSearch)}" placeholder="카드 이름 / 속성 / 효과 검색"></div><div class="collection-layout"><div><div class="collection-grid">${view.map(c=>{const count=state.profile.collection[c.id]||0,inDeck=state.deckDraft.includes(c.id);return `<button class="collection-card ${count?'':'unowned'} ${inDeck?'selected':''}" ${count?'data-action="deck-toggle"':''} data-card-id="${c.id}"><div class="card-art"><img src="${esc(c.art)}" loading="lazy" alt=""></div><b class="rarity-${c.rarity}">${esc(c.name)}</b><p>${esc(c.text)}</p><span class="owned-count">${count?`×${count}`:'미획득'}</span></button>`;}).join('')}</div><div class="pagination"><button class="cta" data-action="page-prev" ${state.collectionPage===0?'disabled':''}>←</button><span>${state.collectionPage+1}/${pages} · 검색 결과 ${cards.length}종</span><button class="cta" data-action="page-next" ${state.collectionPage>=pages-1?'disabled':''}>→</button></div></div><aside class="deck-panel"><div class="section-label">STARTER DECK</div><h2>원정 시작 덱</h2><p>카드를 클릭해 추가/제거하세요. 같은 카드는 한 종류만 편성하지만 전투 시작 시 최소 14장이 되도록 서버가 순환 복제합니다.</p><div class="deck-count">${state.deckDraft.length}/16종</div><div class="deck-list">${state.deckDraft.map(id=>{const c=byId(state.meta.cards,id);return `<div class="deck-row"><b class="rarity-${c?.rarity||'common'}">${esc(c?.name||id)}</b><button data-action="deck-remove" data-card-id="${id}">×</button></div>`;}).join('')}</div><button class="cta mint" style="width:100%" data-action="deck-save" ${state.deckDraft.length<8?'disabled':''}>덱 저장</button><p class="small-note">최소 8종 · 최대 16종</p></aside></div></section>`);
  }
  function toggleDeck(cardId){const i=state.deckDraft.indexOf(cardId);if(i>=0){if(state.deckDraft.length<=8)return toast('덱은 최소 8종이 필요합니다.','error');state.deckDraft.splice(i,1);}else{if(state.deckDraft.length>=16)return toast('덱은 최대 16종까지 편성할 수 있습니다.','error');state.deckDraft.push(cardId);}renderCollectionInner();sound('click');}
  async function saveDeck(){if(state.deckDraft.length<8)return toast('덱에 최소 8종을 넣어 주세요.','error');try{const d=await api('/api/deck',{body:{profileId:state.profileId,nickname:state.profile.nickname,deck:state.deckDraft}});state.profile=d.profile;updateTopbar();toast('시작 덱을 저장했습니다.','good');sound('win');renderCollectionInner();}catch(e){toast(e.message,'error');}}

  function renderGacha(){const b=state.meta.banner,featured=b.featured.map(id=>byId(state.meta.cards,id)).filter(Boolean);setScreen('gacha',`<section class="gacha-page"><div class="gacha-hero"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">RERUN ARCHIVE</div><h1>복각 소환</h1><p>현재 기간에 열린 복각 카드를 노릴 수 있습니다. 일반 여행에서는 한정 카드가 등장하지 않습니다.</p></div></div><div class="gacha-banner"><div class="gacha-copy"><div class="section-label">LIMITED BANNER</div><h1>${esc(b.name)}</h1><p>${esc(b.subtitle)}. 높은 등급이 나왔을 때 픽업 카드가 등장할 확률이 상승합니다. 중복 카드는 잔광으로 환급됩니다.</p><div class="rate-table">${Object.entries(b.rates).reverse().map(([k,v])=>`<div class="rate-cell"><b class="rarity-${k}">${esc(rarityKo(k))}</b>${(v*100).toFixed(1)}%</div>`).join('')}</div><div class="pity">전설 천장 ${state.profile.pity.legendary}/${b.pity.legendary} · 신화 천장 ${state.profile.pity.mythic}/${b.pity.mythic}</div><div class="banner-actions"><button class="cta" data-action="gacha-pull" data-count="1">1회 · ◆${b.singleCost}</button><button class="cta gold" data-action="gacha-pull" data-count="10">10회 · ◆${b.tenCost}</button></div></div><div class="gacha-art">${featured.map(c=>cardHtml(c)).join('')}</div></div></div></section>`);}
  async function doGacha(count){if(state.busy)return;setBusy(true);try{const d=await api('/api/gacha/pull',{body:{profileId:state.profileId,nickname:state.profile.nickname,count:Number(count)}});state.profile=d.profile;updateTopbar();showPull(d.results);}catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}}
  function showPull(results){const sorted=[...results].sort((a,b)=>(state.meta.rarities[b.rarity]?.order||0)-(state.meta.rarities[a.rarity]?.order||0));const top=sorted[0];sound(top?.rarity==='mythic'||top?.rarity==='legendary'?'gacha':'card');modalRoot.innerHTML=`<div class="pull-result"><div class="pull-result-inner"><div class="summon-orb"></div><div class="section-label">ARCHIVE UNSEALED</div><div class="pull-cards">${results.map((c,i)=>cardHtml(c).replace('class="game-card',`style="animation-delay:${Math.min(i*.07,.7)}s" class="game-card`)).join('')}</div><button class="cta mint close-pull" data-action="close-pull">확인</button></div></div>`;}

  function renderProfile(){
    const s=state.profile.stats||{},cloud=!!state.profile.cloud,account=state.profile.accountId||state.auth.user?.accountId||'';
    setScreen('profile',`<section class="page profile-page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">EXPLORER RECORD · ${cloud?'CLOUD SYNC':'GUEST'}</div><h1>탐험 기록</h1></div></div><div class="profile-card"><div class="big-avatar">${esc(state.profile.nickname.slice(0,1))}</div><div><div class="account-line"><span class="cloud-state ${cloud?'on':'off'}">${cloud?'● CLOUD SAVE':'○ GUEST SAVE'}</span>${cloud?`<span>@${esc(account)}</span>`:''}</div><h1>${esc(state.profile.nickname)}</h1><p>${cloud?'이 기록은 Supabase 계정에 연결되어 있습니다. 카드·재화·덱·천장·던전 기록이 서버에 저장됩니다.':'현재 게스트 상태입니다. 로그인 계정을 만들면 현재 진행 기록을 클라우드 계정으로 옮길 수 있습니다.'}</p><div class="field"><input id="nicknameEdit" maxlength="14" value="${esc(state.profile.nickname)}"><button class="cta" data-action="rename">닉네임 변경</button></div><div class="profile-settings"><button class="setting-chip ${state.fx?'on':''}" data-action="fx">✦ 전투 이펙트 ${state.fx?'ON':'OFF'}</button><button class="setting-chip ${state.sound?'on':''}" data-action="sound">♪ 사운드 ${state.sound?'ON':'OFF'}</button>${cloud?'<button class="setting-chip danger" data-action="logout">로그아웃</button>':'<button class="setting-chip" data-action="open-auth">클라우드 로그인</button>'}</div><div class="stat-grid"><div class="stat-box"><b>${s.dungeonClears||0}</b><small>총 던전 클리어</small></div><div class="stat-box"><b>${s.bestDungeonFloor||0}F</b><small>던전 최고층</small></div><div class="stat-box"><b>${s.cardsCaught||0}</b><small>여행 봉인 성공</small></div><div class="stat-box"><b>${s.gachaPulls||0}</b><small>복각 소환</small></div><div class="stat-box"><b>${s.bosses||0}</b><small>보스 격파</small></div><div class="stat-box"><b>${s.journeys||0}</b><small>일반 여행</small></div><div class="stat-box"><b>${s.dungeons||0}</b><small>던전 원정</small></div><div class="stat-box"><b>${state.profile.ownedCount}</b><small>보유 카드 종류</small></div></div><div class="difficulty-records">${['normal','hard','hell'].map(k=>`<div class="record-card"><b class="diff-pill ${k}">${difficultyKo(k)}</b><span>${s[`${k}Clears`]||0} CLEAR</span><small>최고 ${s[`best${k[0].toUpperCase()+k.slice(1)}Floor`]||0}F</small></div>`).join('')}</div>${(state.profile.history||[]).length?`<div class="history-panel"><div class="section-label">RECENT EXPEDITIONS · CLOUD HISTORY</div>${(state.profile.history||[]).slice(0,8).map(h=>`<div class="history-row ${h.result==='clear'?'clear':'defeat'}"><b>${h.result==='clear'?'CLEAR':'ENDED'} · ${h.mode==='dungeon'?difficultyKo(h.difficulty):'일반 여행'}</b><span>${h.floor}F</span><small>${new Date(h.endedAt).toLocaleDateString('ko-KR')} · 카드 +${h.cardsAdded||0} · 아이템 +${h.itemsAdded||0}</small></div>`).join('')}</div>`:''}</div></div></section>`);
  }
  async function renameProfile(){const name=$('#nicknameEdit')?.value?.trim();if(!name)return toast('닉네임을 입력해 주세요.','error');state.nickname=name;localStorage.setItem('riftdeck.nickname',name);try{const d=await api('/api/profile',{body:{profileId:state.profileId,nickname:name,rename:true}});state.profile=d.profile;state.nickname=d.profile.nickname;updateTopbar();toast('닉네임을 변경했습니다.','good');renderProfile();}catch(e){toast(e.message,'error');}}
  function finishRun(){state.stream?.close();state.stream=null;state.room=null;state.roomId='';localStorage.removeItem('riftdeck.roomId');loadProfile().then(renderHome);}
  async function resumeRoom(){if(!state.roomId)return;try{const d=await api(`/api/room/${state.roomId}`);state.lastFxSeq=Number(d.room.seq||0);acceptRoomUpdate(d.room,{initial:true});connectStream(state.roomId);}catch(e){localStorage.removeItem('riftdeck.roomId');state.roomId='';state.room=null;toast('이전 원정 방이 만료되었습니다.','error');renderHome();}}

  document.addEventListener('input',e=>{if(e.target.id==='collectionSearch'){state.collectionSearch=e.target.value;state.collectionPage=0;const pos=e.target.selectionStart;renderCollectionInner();requestAnimationFrame(()=>{const n=$('#collectionSearch');if(n){n.focus();n.setSelectionRange(pos,pos);}});}});
  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;sound('click');
    try{
      if(action==='auth-tab'){state.authMode=el.dataset.mode==='register'?'register':'login';return renderAuth();}
      if(action==='auth-login')return authSubmit('login');
      if(action==='auth-signup')return authSubmit('signup');
      if(action==='guest-enter'){state.guestMode=true;localStorage.setItem('riftdeck.guestMode','1');state.profileId=state.guestProfileId;if(!state.nickname)state.nickname='방랑자';await loadProfile();toast('게스트로 시작합니다. 계정을 만들면 현재 기록을 이어받을 수 있습니다.','good');return renderHome();}
      if(action==='open-auth'){state.authMode='login';return renderAuth();}
      if(action==='logout')return logout();
      if(action==='fx'){state.fx=!state.fx;localStorage.setItem('riftdeck.fx',state.fx?'on':'off');updateTopbar();toast(`전투 이펙트 ${state.fx?'ON':'OFF'}`,'good');if(state.current==='profile')renderProfile();return;}
      if(action==='home')return renderHome();
      if(action==='profile')return renderProfile();
      if(action==='collection')return renderCollection();
      if(action==='gacha')return renderGacha();
      if(action==='journey-create')return createJourney();
      if(action==='dungeon-lobby')return renderDungeonLobby();
      if(action==='difficulty'){state.selectedDifficulty=el.dataset.diff;localStorage.setItem('riftdeck.difficulty',state.selectedDifficulty);return renderDungeonLobby();}
      if(action==='create-dungeon')return createDungeon();
      if(action==='join-code')return joinRoom($('#roomCodeInput')?.value);
      if(action==='join-public')return joinRoom(el.dataset.room);
      if(action==='copy-room'){await navigator.clipboard?.writeText(state.room.id);return toast(`방 코드 ${state.room.id} 복사 완료.`,'good');}
      if(action==='room-start')return roomPost('start',{});
      if(action==='route-vote')return roomPost('vote',{nodeId:el.dataset.node});
      if(action==='select-enemy'){state.selectedEnemy=el.dataset.enemy;return renderBattle(state.room);}
      if(action==='play-card'){
        if(state.busy)return;const me=state.room.battle.party.find(p=>p.playerId===state.profileId);if(me?.ended)return;const index=Number(el.dataset.index),card=byId(state.meta.cards,me.hand[index]),target=state.selectedEnemy?$(`[data-enemy="${CSS.escape(state.selectedEnemy)}"]`):null;if(!card)return;
        sound(card.type==='spell'?'gacha':'card');await cardCastWindup(el,card,target);if(card.type==='spell'&&target){slashAt(target,card.element,card.power>=16);impactBurst(target,card.element,.7);}const d=await roomPost('play',{handIndex:index,targetUid:state.selectedEnemy});if(d.room?.status==='reward')sound('win');return;
      }
      if(action==='end-turn'){const b=state.room?.battle,active=b?.party?.filter(p=>!p.down&&!p.ended)||[];if(active.length<=1)showCenterBanner('ENEMY PHASE','소환 유닛 행동 후 적이 움직입니다.','enemy');return roomPost('end-turn',{});}
      if(action==='reward-pick'){await roomPost('reward',{rewardId:el.dataset.rewardId});await loadProfile();sound('reward');return renderRoom();}
      if(action==='reward-reroll'){const d=await roomPost('reroll',{});toast(`보상 재굴림 · ${d.result.cost}G 사용`,'good');return;}
      if(action==='reward-continue')return roomPost('continue',{});
      if(action==='capture'){const d=await roomPost('capture',{sealType:el.dataset.seal});await loadProfile();toast(d.result.success?'봉인 성공! 카드가 컬렉션에 등록되었습니다.':d.result.escaped?'봉인 실패. 흔적이 사라졌습니다.':'봉인 실패. 아직 흔적이 남았습니다.',d.result.success?'good':'error');return renderRoom();}
      if(action==='event-choice')return roomPost('event',{choiceId:el.dataset.choice}).then(()=>loadProfile());
      if(action==='buy'){await roomPost('buy',{itemId:el.dataset.item,itemType:el.dataset.type});await loadProfile();return renderRoom();}
      if(action==='filter'){state.collectionFilter=el.dataset.filter;state.collectionPage=0;return renderCollectionInner();}
      if(action==='page-prev'){state.collectionPage--;return renderCollectionInner();}
      if(action==='page-next'){state.collectionPage++;return renderCollectionInner();}
      if(action==='deck-toggle'||action==='deck-remove')return toggleDeck(el.dataset.cardId);
      if(action==='deck-save')return saveDeck();
      if(action==='gacha-pull')return doGacha(el.dataset.count);
      if(action==='close-pull'){closeModal();return state.current==='gacha'?renderGacha():renderHome();}
      if(action==='rename')return renameProfile();
      if(action==='resume-room')return resumeRoom();
      if(action==='finish-run')return finishRun();
      if(action==='save-name'){const name=$('#firstNickname')?.value?.trim();if(!name)return toast('닉네임을 입력해 주세요.','error');state.nickname=name;localStorage.setItem('riftdeck.nickname',name);closeModal();await loadProfile();return renderHome();}
      if(action==='sound'){state.sound=!state.sound;localStorage.setItem('riftdeck.sound',state.sound?'on':'off');updateTopbar();if(state.current==='profile')renderProfile();return;}
    }catch(err){toast(err?.message||'요청 처리 중 오류가 발생했습니다.','error');sound('error');}
  });
  document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if(state.current==='battle'&&state.room?.battle){if(/^Digit[1-9]$/.test(e.code)){const i=Number(e.code.slice(-1))-1;$(`[data-action="play-card"][data-index="${i}"]`)?.click();}if(e.code==='KeyE')$('[data-action="end-turn"]')?.click();}if(e.code==='Escape'&&modalRoot.innerHTML)closeModal();});

  async function init(){
    try{
      const meta=await api('/api/meta');state.meta=meta;if(!state.meta.difficulties[state.selectedDifficulty])state.selectedDifficulty='normal';
      await loadAuth();
      boot.classList.add('hidden');app.classList.remove('hidden');
      if(state.auth.enabled&&!state.auth.authenticated&&!state.guestMode){renderAuth();return;}
      if(!state.auth.enabled&&!state.guestMode){state.guestMode=true;localStorage.setItem('riftdeck.guestMode','1');}
      await loadProfile();
      if(state.roomId){try{const d=await api(`/api/room/${state.roomId}`);state.room=d.room;state.lastFxSeq=Number(d.room.seq||0);}catch{localStorage.removeItem('riftdeck.roomId');state.roomId='';}}
      setTimeout(()=>{renderHome();if(state.auth.enabled&&!state.auth.authenticated)toast('게스트 모드입니다. 로그인하면 기록을 클라우드에 저장할 수 있습니다.');},180);
    }catch(e){boot.classList.remove('hidden');app.classList.add('hidden');boot.innerHTML=`<div class="boot-title" style="font-size:26px">SERVER OFFLINE</div><div class="boot-copy" style="margin-top:18px">${esc(e.message)}</div><div class="boot-copy">동적 서버를 실행한 뒤 새로고침해 주세요.</div>`;}
  }
  init();
})();
