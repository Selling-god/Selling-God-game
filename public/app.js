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
    authProfileMode: 'cloud',
    authFromGuest: false,
    combatLogOpen: false,
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
    lastBattleKey: '',
    lastCastFx: null,
    battleEntranceKey: ''
  };
  localStorage.setItem('riftdeck.guestProfileId', state.guestProfileId);

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const pct = (a,b) => b ? Math.max(0,Math.min(100,a/b*100)) : 0;
  const rarityKo = k => state.meta?.rarities?.[k]?.ko || k;
  const difficultyKo = k => state.meta?.difficulties?.[k]?.ko || k;
  const byId = (arr,id) => arr?.find(x=>x.id===id);
  function sceneForRoom(r){const scenes=r?.biome?.scenes||[];if(!scenes.length)return {name:r?.biome?.name||'',background:r?.biome?.background||''};const idx=Math.abs((Number(r?.floor||1)-1)%scenes.length);return scenes[idx]||scenes[0];}
  function sceneBg(r){return sceneForRoom(r).background||r?.biome?.background||'';}
  function sceneName(r){return sceneForRoom(r).name||r?.biome?.name||'';}
  function originLabel(origin){return ({journey:'TRAVEL',gacha:'ARCHIVE',starter:'STARTER',legacy:'LEGACY'})[origin]||'FOUND';}

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
      else if(kind==='chain'){tone(ctx,620,.11,.035,'triangle');tone(ctx,830,.12,.03,'triangle',.05);tone(ctx,1040,.14,.028,'sine',.1);}
      else if(kind==='overdrive'){noise(ctx,.24,.055,0,1800);[220,440,880,1320].forEach((f,i)=>tone(ctx,f,.22,.05,'sawtooth',i*.045,f*1.35));}
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
    const lowPower=(Number(navigator.deviceMemory||8)<=4)||(Number(navigator.hardwareConcurrency||8)<=4);const cap=lowPower?12:18;const count=Math.min(cap,7+Math.round(strength*4));for(let i=0;i<count;i++){const p=document.createElement('i');const a=Math.PI*2*i/count+(Math.random()-.5)*.45;const d=30+Math.random()*52*strength;p.style.setProperty('--dx',`${Math.cos(a)*d}px`);p.style.setProperty('--dy',`${Math.sin(a)*d}px`);p.style.setProperty('--rot',`${Math.round(Math.random()*300)}deg`);p.style.animationDelay=`${Math.random()*28}ms`;burst.appendChild(p);}setTimeout(()=>burst.remove(),650);
  }
  function elementClass(element){return ({'화염':'fire','물':'water','자연':'nature','빛':'light','그림자':'shadow','강철':'steel','바람':'wind','번개':'lightning','별':'star','시간':'time','공허':'void','수정':'crystal'})[element]||'void';}
  function slashAt(target,element='강철',heavy=false){
    if(!fxOn()||!target)return;const c=rectCenter(target),el=document.createElement('div');el.className=`slash-fx ${heavy?'heavy':''} element-${elementClass(element)}`;el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;fxRoot().appendChild(el);setTimeout(()=>el.remove(),520);
  }
  function shieldCrack(target){if(!fxOn()||!target)return;const c=rectCenter(target),el=document.createElement('div');el.className='shield-crack';el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;el.innerHTML='<i></i><i></i><i></i><i></i><i></i>';fxRoot().appendChild(el);setTimeout(()=>el.remove(),620);sound('block');}
  function enemyLunge(target){
    if(!fxOn()||!target)return;
    try{target.animate([
      {transform:'translate3d(0,0,0) scale(1)'},
      {transform:'translate3d(-34px,7px,0) scale(1.04)',offset:.42},
      {transform:'translate3d(8px,-2px,0) scale(.99)',offset:.72},
      {transform:'translate3d(0,0,0) scale(1)'}
    ],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});}catch{target.classList.add('enemy-lunge');setTimeout(()=>target.classList.remove('enemy-lunge'),360);}
  }
  function showCenterBanner(title,sub='',kind='turn'){
    if(!state.fx&&kind==='turn')return;const el=document.createElement('div');el.className=`combat-banner ${kind}`;el.innerHTML=`<b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:''}`;fxRoot().appendChild(el);setTimeout(()=>el.remove(),kind==='boss'?1750:kind==='victory'?1500:1050);
  }
  function projectileFx(fromEl,targetEl,element='공허',heavy=false){
    if(!fxOn()||!fromEl||!targetEl)return Promise.resolve();
    const a=rectCenter(fromEl),b=rectCenter(targetEl),root=fxRoot(),el=document.createElement('div');
    el.className=`rift-projectile element-${elementClass(element)} ${heavy?'heavy':''}`;el.style.left=`${a.x}px`;el.style.top=`${a.y}px`;root.appendChild(el);
    const dx=b.x-a.x,dy=b.y-a.y;
    try{el.animate([{transform:'translate3d(0,0,0) scale(.55)',opacity:.2},{transform:`translate3d(${dx*.15}px,${dy*.15}px,0) scale(1.15)`,opacity:1,offset:.18},{transform:`translate3d(${dx}px,${dy}px,0) scale(${heavy?1.45:1})`,opacity:.92}],{duration:heavy?250:210,easing:'cubic-bezier(.2,.75,.15,1)'}).onfinish=()=>el.remove();}
    catch{setTimeout(()=>el.remove(),260);}
    return wait(heavy?190:160);
  }
  function unitStrikeFx(targetEl){
    if(!fxOn()||!targetEl)return;
    const units=$$('.unit-slot.filled,.unit-actor.filled');
    units.slice(0,3).forEach((u,i)=>setTimeout(()=>{try{u.animate([{transform:'translate3d(0,0,0)'},{transform:'translate3d(26px,-8px,0) scale(1.06)',offset:.5},{transform:'translate3d(0,0,0)'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});}catch{}},i*55));
  }
  function cardFxMode(card){
    if(card?.type==='unit')return 'summon';
    const ops=new Set((card?.effects||[]).map(e=>e.op));
    if([...ops].some(x=>['damage','damageAll','damageOthers','burn','vulnerable','vulnerableAll','weak','shockAll','intentSealAll'].includes(x))||Number(card?.power||0)>0)return 'attack';
    if([...ops].some(x=>['heal','healAllies'].includes(x)))return 'heal';
    if([...ops].some(x=>['block','blockAllies','debuffImmune'].includes(x)))return 'guard';
    return 'utility';
  }
  function cardFxHeavy(card){return ['legendary','mythic'].includes(card?.rarity)||Number(card?.power||0)>=18||(card?.effects||[]).some(e=>['damageAll','shockAll'].includes(e.op));}
  function cardFxTrait(card){const ops=new Set((card?.effects||[]).map(e=>e.op));if([...ops].some(x=>['damageAll','damageOthers','shockAll','vulnerableAll','intentSealAll'].includes(x)))return 'aoe';if(ops.has('burn'))return 'burn';if([...ops].some(x=>['vulnerable','weak'].includes(x)))return 'debuff';if([...ops].some(x=>['heal','healAllies'].includes(x)))return 'heal';if([...ops].some(x=>['block','blockAllies','debuffImmune'].includes(x)))return 'guard';return 'direct';}
  function cardFxVariant(card){const id=String(card?.id||card?.name||'rift');let n=0;for(let i=0;i<id.length;i++)n+=id.charCodeAt(i);return n%3;}
  function soundElement(element,heavy=false){
    if(!state.sound)return;try{const ctx=audioEngine();if(!ctx)return;const g=heavy?.05:.028;
      if(element==='화염'){noise(ctx,.12,g,0,900);tone(ctx,240,.14,g,'sawtooth',0,90);}
      else if(element==='물'){tone(ctx,320,.16,g,'sine',0,680);tone(ctx,760,.08,g*.55,'sine',.05,520);}
      else if(element==='자연'){noise(ctx,.10,g*.7,0,1500);tone(ctx,190,.14,g,'triangle',0,310);}
      else if(element==='빛'){tone(ctx,960,.11,g,'sine');tone(ctx,1420,.14,g*.75,'sine',.035,1760);}
      else if(element==='그림자'){tone(ctx,150,.17,g,'sawtooth',0,58);noise(ctx,.10,g*.8,.02,620);}
      else if(element==='강철'){noise(ctx,.07,g*1.2,0,2600);tone(ctx,680,.09,g,'square',0,390);}
      else if(element==='바람'){noise(ctx,.18,g*.75,0,3000);tone(ctx,420,.13,g*.6,'sine',0,980);}
      else if(element==='번개'){[1480,1040,1760].forEach((f,i)=>tone(ctx,f,.05,g,'square',i*.026,f*.62));noise(ctx,.08,g,.02,3500);}
      else if(element==='별'){[620,930,1390].forEach((f,i)=>tone(ctx,f,.13,g*.8,'sine',i*.035,f*1.08));}
      else if(element==='시간'){[520,520,780].forEach((f,i)=>tone(ctx,f,.045,g*.72,'square',i*.055));}
      else if(element==='수정'){[860,1180,1520].forEach((f,i)=>tone(ctx,f,.09,g*.8,'triangle',i*.025));}
      else{tone(ctx,130,.18,g,'sawtooth',0,48);tone(ctx,70,.16,g*.8,'sine',.04,42);}
    }catch{}
  }
  function signatureImpactFx(target,card,strength=1){
    if(!fxOn()||!target)return;const c=rectCenter(target),root=fxRoot(),ec=elementClass(card?.element),mode=cardFxMode(card),heavy=cardFxHeavy(card);const el=document.createElement('div');
    el.className=`signature-impact-v31 sig-${ec}-v31 mode-${mode}-v31 trait-${cardFxTrait(card)}-v31 variant-${cardFxVariant(card)}-v31 ${heavy?'heavy':''}`;el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;el.style.setProperty('--fx-scale',String(Math.max(.75,Math.min(1.7,strength))));
    el.innerHTML='<i class="fx-core-v31"></i><i class="fx-ring-v31 r1"></i><i class="fx-ring-v31 r2"></i><b class="fx-bit-v31 b1"></b><b class="fx-bit-v31 b2"></b><b class="fx-bit-v31 b3"></b><b class="fx-bit-v31 b4"></b><b class="fx-bit-v31 b5"></b><b class="fx-bit-v31 b6"></b>';
    root.appendChild(el);soundElement(card?.element,heavy);setTimeout(()=>el.remove(),heavy?760:620);
  }
  function signatureProjectileFx(fromEl,targetEl,card){
    if(!fxOn()||!fromEl||!targetEl)return Promise.resolve();const a=rectCenter(fromEl),b=rectCenter(targetEl),dx=b.x-a.x,dy=b.y-a.y,root=fxRoot(),heavy=cardFxHeavy(card),ec=elementClass(card?.element),el=document.createElement('div');
    el.className=`signature-projectile-v31 sig-${ec}-v31 trait-${cardFxTrait(card)}-v31 variant-${cardFxVariant(card)}-v31 ${heavy?'heavy':''}`;el.style.left=`${a.x}px`;el.style.top=`${a.y}px`;el.style.setProperty('--ang',`${Math.atan2(dy,dx)}rad`);el.innerHTML='<i></i><b></b><em></em>';root.appendChild(el);
    const dur=heavy?300:235;try{const anim=el.animate([{transform:'translate3d(0,0,0) scale(.65)',opacity:0},{transform:`translate3d(${dx*.12}px,${dy*.12}px,0) scale(1)`,opacity:1,offset:.16},{transform:`translate3d(${dx}px,${dy}px,0) scale(${heavy?1.25:1})`,opacity:1}],{duration:dur,easing:'cubic-bezier(.16,.78,.18,1)',fill:'forwards'});anim.onfinish=()=>el.remove();}catch{setTimeout(()=>el.remove(),dur+20);}
    return wait(Math.max(150,dur-50));
  }
  function signatureSummonFx(target,card){
    if(!fxOn()||!target)return;const c=rectCenter(target),root=fxRoot(),el=document.createElement('div');el.className=`summon-gate-v31 sig-${elementClass(card?.element)}-v31`;el.style.left=`${c.x}px`;el.style.top=`${c.y}px`;el.innerHTML='<i></i><i></i><i></i><b></b>';root.appendChild(el);soundElement(card?.element,false);setTimeout(()=>el.remove(),760);
  }
  function enemyFxElement(enemy){const b=String(enemy?.biome||'');if(/glacier|ice|frost/i.test(b))return '물';if(/verdant|forest|green|nature/i.test(b))return '자연';if(/eclipse|moon/i.test(b))return '공허';if(/abyss|shadow/i.test(b))return '그림자';return '번개';}
  async function cardCastWindup(cardEl,card,targetEl){
    if(!cardEl)return;const mode=cardFxMode(card),heavy=cardFxHeavy(card);state.lastCastFx={cardId:card.id,targetUid:state.selectedEnemy,mode,at:Date.now()};if(!fxOn())return;
    const from=cardEl.getBoundingClientRect(),root=fxRoot(),clone=cardEl.cloneNode(true);clone.classList.add('cast-card-clone','visual-cast-v31');clone.style.left=`${from.left}px`;clone.style.top=`${from.top}px`;clone.style.width=`${from.width}px`;clone.style.height=`${from.height}px`;root.appendChild(clone);cardEl.classList.add('card-committed');
    const cx=innerWidth*.5-(from.left+from.width/2),cy=innerHeight*.52-(from.top+from.height/2);try{await clone.animate([{transform:'translate3d(0,0,0) scale(1)',opacity:1},{transform:`translate3d(${cx}px,${cy}px,0) scale(1.18) rotate(${mode==='attack'?-2:2}deg)`,opacity:1}],{duration:155,easing:'cubic-bezier(.18,.8,.2,1)',fill:'forwards'}).finished;}catch{await wait(120);}
    let target=targetEl;
    if(mode==='summon')target=$('.unit-actor-v31:not(.filled)')||$('.ally-units-v31')||$('.unit-board');
    if(['guard','heal','utility'].includes(mode))target=$('.player-nameplate-v31')||$('.ally-stage-v31')||$('.battle-field-v31');
    if(mode==='summon'){signatureSummonFx(target,card);if(target)await signatureProjectileFx(clone,target,card);}
    else if(target){await signatureProjectileFx(clone,target,card);signatureImpactFx(target,card,heavy?1.35:1);}
    if(heavy&&mode==='attack'){screenShake('hit');hitStop('hit');}
    try{clone.animate([{opacity:1,filter:'brightness(1)'},{opacity:0,filter:'brightness(2.4)',transform:`translate3d(${cx}px,${cy-12}px,0) scale(.65)`}],{duration:100,fill:'forwards'});}catch{}
    setTimeout(()=>clone.remove(),120);cardEl.classList.remove('card-committed');
  }
  function unitVolleyFx(next,targetEl){
    if(!fxOn()||!next?.battle||!targetEl)return;const me=next.battle.party.find(p=>p.playerId===state.profileId);if(!me)return;const els=$$('.unit-actor-v31.filled');me.units.slice(0,els.length).forEach((u,i)=>setTimeout(()=>{const el=els[i],card=byId(state.meta.cards,u.cardId)||{element:u.element||'강철',rarity:'common',power:u.power,effects:[{op:'damage',value:u.power}]};try{el.animate([{transform:'translate3d(0,0,0)'},{transform:'translate3d(34px,-8px,0) scale(1.08)',offset:.45},{transform:'translate3d(0,0,0)'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});}catch{}signatureProjectileFx(el,targetEl,card).then(()=>signatureImpactFx(targetEl,card,.82));},i*95));
  }
  function enemyAssaultFx(prev,targetEl){
    if(!fxOn()||!prev?.battle||!targetEl)return;const attackers=prev.battle.enemies.filter(e=>e.hp>0&&['attack','heavy'].includes(e.intent?.type)).slice(0,3);attackers.forEach((e,i)=>setTimeout(()=>{const actor=$(`[data-enemy="${CSS.escape(e.uid)}"]`),heavy=e.intent.type==='heavy',fake={element:enemyFxElement(e),rarity:heavy?'legendary':'common',power:e.intent.value||e.atk,effects:[{op:'damage',value:e.intent.value||e.atk}]};if(actor){try{actor.animate([{transform:'translate3d(0,0,0)'},{transform:`translate3d(${-38-(heavy?18:0)}px,${heavy?10:4}px,0) scale(${heavy?1.13:1.06})`,offset:.46},{transform:'translate3d(8px,-2px,0) scale(.99)',offset:.72},{transform:'translate3d(0,0,0)'}],{duration:heavy?420:330,easing:'cubic-bezier(.18,.8,.2,1)'});}catch{}}
      signatureImpactFx(targetEl,fake,heavy?1.45:1);if(heavy){screenShake('heavy');screenFlash('hurt');}},i*125));
  }

  function battleDelta(prev,next){
    if(!prev?.battle||!next?.battle)return null;const out={enemies:[],party:[],turnChanged:prev.battle.turn!==next.battle.turn,tier:next.battle.tier};
    const pe=Object.fromEntries(prev.battle.enemies.map(x=>[x.uid,x]));for(const e of next.battle.enemies){const b=pe[e.uid];if(!b)continue;const hp=e.hp-b.hp,block=(e.block||0)-(b.block||0);if(hp||block)out.enemies.push({uid:e.uid,hp,block,dead:b.hp>0&&e.hp<=0});}
    const pp=Object.fromEntries(prev.battle.party.map(x=>[x.playerId,x]));for(const pc of next.battle.party){const b=pp[pc.playerId];if(!b)continue;const hp=pc.hp-b.hp,block=(pc.block||0)-(b.block||0),units=pc.units.length-b.units.length;if(hp||block||units)out.party.push({playerId:pc.playerId,hp,block,units,down:!b.down&&pc.down});}
    return out;
  }
  function playCombatDelta(prev,next){
    if(!fxOn())return;const d=battleDelta(prev,next);if(!d)return;let peak=0;const pending=state.lastCastFx&&Date.now()-state.lastCastFx.at<1400?state.lastCastFx:null;
    for(const x of d.enemies){const target=$(`[data-enemy="${CSS.escape(x.uid)}"]`);if(x.hp<0){const dmg=-x.hp;peak=Math.max(peak,dmg);if(d.turnChanged)unitVolleyFx(next,target);else if(!pending||pending.targetUid!==x.uid){const fake={element:'강철',rarity:dmg>=24?'legendary':'common',power:dmg,effects:[{op:'damage',value:dmg}]};signatureImpactFx(target,fake,dmg>=24?1.25:.86);}if(target){if(x.dead)target.classList.add('enemy-death-v31');else{target.classList.remove('enemy-hurt-v31');void target.offsetWidth;target.classList.add('enemy-hurt-v31');setTimeout(()=>target.classList.remove('enemy-hurt-v31'),310);}}popNumber(target,`-${dmg}`,'damage');if(x.dead){screenFlash('kill');sound('hit');}}
      else if(x.hp>0){popNumber(target,`+${x.hp}`,'heal');signatureImpactFx(target,{element:'빛',rarity:'rare',effects:[{op:'heal',value:x.hp}]},.8);}
      if(x.block>0){popNumber(target,`+${x.block}`,'block');signatureImpactFx(target,{element:'강철',rarity:'common',effects:[{op:'block',value:x.block}]},.75);}else if(x.block<0)shieldCrack(target);
    }
    for(const x of d.party){if(x.playerId!==state.profileId)continue;const target=$('.player-nameplate-v31')||$('.ally-stage-v31');if(x.hp<0){const dmg=-x.hp;peak=Math.max(peak,dmg);enemyAssaultFx(prev,target);popNumber(target,`-${dmg}`,'damage player');screenFlash('hurt');sound('enemy');}
      else if(x.hp>0){popNumber(target,`+${x.hp}`,'heal');signatureImpactFx(target,{element:'빛',rarity:'rare',effects:[{op:'heal',value:x.hp}]},.9);}
      if(x.block>0){popNumber(target,`+${x.block}`,'block');signatureImpactFx(target,{element:'수정',rarity:'rare',effects:[{op:'block',value:x.block}]},.88);}else if(x.block<0)shieldCrack(target);
      if(x.units>0){const me=next.battle?.party?.find(p=>p.playerId===state.profileId),newUnits=me?.units?.slice(-x.units)||[],$slots=$$('.unit-actor-v31.filled').slice(-x.units);$slots.forEach((u,i)=>{const c=byId(state.meta.cards,newUnits[i]?.cardId)||{element:newUnits[i]?.element||'빛',type:'unit',rarity:'common'};setTimeout(()=>{u.classList.add('unit-summon-v31');signatureSummonFx(u,c);setTimeout(()=>u.classList.remove('unit-summon-v31'),650);},i*80);});}
    }
    if(peak>=30){screenShake('heavy');hitStop('heavy');}else if(peak>0){screenShake('soft');}
    if(d.turnChanged&&next.battle?.phase==='players')setTimeout(()=>showCenterBanner(`TURN ${next.battle.turn}`,'','turn'),120);
    if(pending)state.lastCastFx=null;
  }

  function playRoomEvents(next,afterSeq){
    if(!next?.feed)return;const events=next.feed.filter(ev=>Number(ev.seq)>Number(afterSeq||0));for(const ev of events){
      if(ev.type==='battle-start'){if(ev.payload?.tier==='boss'){screenShake('heavy');screenFlash('boss');showCenterBanner('BOSS','','boss');sound('boss');}else if(ev.payload?.tier==='elite'){showCenterBanner('ELITE','','turn');}}
      else if(ev.type==='turn')showCenterBanner(`TURN ${next.battle?.turn||''}`,'','turn');
      else if(ev.type==='card'&&ev.payload?.playerId!==state.profileId){const card=byId(state.meta.cards,ev.payload?.cardId)||{element:ev.payload?.element||'공허',type:ev.payload?.cardType||'spell',rarity:'common',effects:[{op:'damage',value:1}]};const target=ev.payload?.targetUid?$(`[data-enemy="${CSS.escape(ev.payload.targetUid)}"]`):$('.ally-stage-v31');if(target)signatureImpactFx(target,card,.85);}
      else if(ev.type==='mastery'&&ev.payload?.playerId===state.profileId){showCenterBanner(ev.payload?.level===2?'++':'+','CARD GROWTH','ally');sound('reward');}
      else if(ev.type==='chain'){if(ev.payload?.playerId===state.profileId){if(ev.payload?.stage==='overdrive'){screenFlash('victory');screenShake('hit');showCenterBanner('OVERDRIVE','','victory');sound('overdrive');}else{showCenterBanner('COMBO ×3','','ally');sound('chain');}}}
      else if(ev.type==='enemy-break'){const target=ev.payload?.enemyUid?$(`[data-enemy="${CSS.escape(ev.payload.enemyUid)}"]`):null;target?.classList.add('rift-broken-v26');screenFlash('break');screenShake('hit');if(target)signatureImpactFx(target,{element:'수정',rarity:'legendary',power:20,effects:[{op:'damage',value:20}]},1.4);showCenterBanner('BREAK','','victory');sound('overdrive');}
      else if(ev.type==='boss-phase'){screenFlash('boss');screenShake('heavy');showCenterBanner('PHASE II','','boss');sound('boss');}
      else if(ev.type==='win'){screenFlash('victory');screenShake('soft');showCenterBanner(ev.payload?.final?'ABYSS CLEAR':'VICTORY','','victory');sound('win');}
      else if(ev.type==='defeat'){screenFlash('defeat');screenShake('heavy');showCenterBanner('DEFEAT','','defeat');sound('error');}
    }
  }
  function playerNameFromRoom(r,id){return r?.players?.find(p=>p.id===id)?.nickname||'ALLY';}
  function sceneTransitionLabel(next){
    const map={route:'PATH SELECT',battle:next?.battle?.tier==='boss'?'BOSS ENCOUNTER':next?.battle?.tier==='elite'?'ELITE ENCOUNTER':'ENCOUNTER',reward:'CLEAR',event:'UNKNOWN SIGNAL',cleared:'ABYSS CLEAR',ended:'EXPEDITION END'};
    return map[next?.status]||'EXPEDITION';
  }
  function playSceneCurtain(next){
    if(!fxOn())return;const el=document.createElement('div');el.className='scene-wipe-v31';const title=sceneTransitionLabel(next),glyph=next?.status==='battle'?'⚔':next?.status==='reward'?'◆':next?.status==='event'?'◇':next?.status==='route'?'⌁':'✦';el.innerHTML=`<i></i><b>${glyph}</b><span>${esc(title)}</span>`;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('go'));setTimeout(()=>el.remove(),380);
  }
  function acceptRoomUpdate(next,{initial=false}={}){
    const prev=state.room;
    if(!initial&&prev&&Number(next?.seq||0)===Number(prev?.seq||0)&&next?.status===prev?.status)return;
    const after=initial?Number(next?.seq||0):Number(state.lastFxSeq||prev?.seq||0);const changed=!!prev&&prev.status!==next?.status;
    state.room=next;state.lastFxSeq=Math.max(Number(state.lastFxSeq||0),Number(next?.seq||0));
    if(state.current.startsWith('room')||['route','battle','reward','event','end'].includes(state.current)||initial)renderRoom();
    if(changed&&!initial)playSceneCurtain(next);
    if(!initial)setTimeout(()=>{playCombatDelta(prev,next);playRoomEvents(next,after);},changed?260:0);
  }
  function clearTimers(){clearInterval(state.bannerTimer);clearInterval(state.roomsTimer);state.bannerTimer=0;state.roomsTimer=0;}
  function animateBattleEntrance(){
    const r=state.room,key=r?.battle?`${r.id}:${r.floor}:${r.battle.tier}`:'';if(!key||state.battleEntranceKey===key)return;state.battleEntranceKey=key;const enemies=$$('.enemy-actor-v31'),units=$$('.unit-actor-v31.filled'),cards=$$('.battle-hand-v31 .visual-card-v31');enemies.forEach((el,i)=>{try{el.animate([{transform:'translate3d(70px,10px,0) scale(.72)',opacity:0,filter:'brightness(2)'},{transform:'translate3d(0,0,0) scale(1.04)',opacity:1,filter:'brightness(1)',offset:.72},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],{duration:480+i*70,delay:i*70,easing:'cubic-bezier(.16,.82,.18,1)'});}catch{}});units.forEach((el,i)=>{try{el.animate([{transform:'translate3d(-45px,12px,0) scale(.75)',opacity:0},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],{duration:380,delay:130+i*65,easing:'cubic-bezier(.2,.8,.2,1)'});}catch{}});cards.forEach((el,i)=>{try{el.animate([{transform:'translate3d(0,70px,0) rotate(0deg)',opacity:0},{transform:'translate3d(0,0,0)',opacity:1}],{duration:300,delay:180+i*45,easing:'cubic-bezier(.2,.8,.2,1)'});}catch{}});
  }
  function setScreen(name,html){clearTimers();state.current=name;const runScreens=['route','battle','reward','event','end','roomLobby'];const inRun=runScreens.includes(name);document.body.classList.toggle('in-run-v27',inRun);document.body.classList.toggle('visual-run-v31',inRun);document.body.classList.toggle('battle-focus-v31',name==='battle');screen.innerHTML=html;screen.classList.remove('screen-enter-v26');void screen.offsetWidth;screen.classList.add('screen-enter-v26');setTimeout(()=>screen.classList.remove('screen-enter-v26'),220);window.scrollTo({top:0,behavior:'instant'});if(name==='battle')requestAnimationFrame(()=>requestAnimationFrame(animateBattleEntrance));}

  function shortLine(value,max=42){const s=String(value||'').replace(/\s+/g,' ').trim();return s.length>max?`${s.slice(0,max-1)}…`:s;}
  function elementGlyph(element){return ({'화염':'◆','물':'≈','자연':'✦','빛':'✧','그림자':'◒','강철':'✕','바람':'〰','번개':'ϟ','별':'★','시간':'◷','공허':'●','수정':'◇'})[element]||'◇';}
  function cardKeywords(card,limit=3){
    const labels={damage:'DMG',damageAll:'ALL',damageOthers:'SPLASH',block:'BLOCK',draw:'DRAW',vulnerable:'VULN',vulnerableAll:'VULN ALL',weak:'WEAK',burn:'BURN',energy:'ENERGY',heal:'HEAL',healAllies:'HEAL ALL',blockAllies:'GUARD ALL',anyDiscount:'COST -1',intentSealAll:'SEAL',buffUnits:'UNIT +',shockAll:'SHOCK',redraw:'REDRAW',nextAttack:'ATK +',debuffImmune:'IMMUNE'};
    const out=[];for(const e of (card?.effects||[])){if(!labels[e.op])continue;let v=labels[e.op];if(Number(e.value)>0&&!['vulnerable','vulnerableAll','weak','debuffImmune','redraw'].includes(e.op))v+=` ${e.value}`;if(!out.includes(v))out.push(v);if(out.length>=limit)break;}
    if(!out.length&&card?.type==='spell'){if(card.power)out.push(`DMG ${card.power}`);if(card.block)out.push(`BLOCK ${card.block}`);}
    if(!out.length&&card?.type==='unit')out.push(`ATK ${card.power||0}`);
    return out.slice(0,limit);
  }
  function routeGraphic(kind){return `<span class="route-glyph-v31 kind-${esc(kind)}"><i></i><i></i><i></i><i></i><i></i></span>`;}
  function choiceGlyph(id){return ({safe:'♥',risk:'◆',scout:'⌖',seal:'◇'})[id]||'✦';}
  function intentCompact(intent){if(!intent)return{icon:'·',value:''};return{icon:intent.icon||'·',value:Number(intent.value)>0?String(intent.value):''};}
  function energyOrbs(me){return `<div class="energy-orbs-v31" title="에너지 ${me.energy}/${me.maxEnergy}">${Array.from({length:Math.max(1,me.maxEnergy)},(_,i)=>`<i class="${i<me.energy?'on':''}"></i>`).join('')}</div>`;}

  function cardHtml(card,opt={}){
    if(!card)return '';
    const tag=opt.compact?'div':'button';
    const visual=!!opt.visual;
    const cls=`game-card${opt.compact?' mini-card':''}${opt.claimed?' claimed':''}${card.upgradeLevel?' upgraded':''}${visual?' visual-card-v31':''}`;
    const attrs=[`data-rarity="${esc(card.rarity)}"`,`data-card-id="${esc(card.id)}"`,`title="우클릭/길게 누르기: 상세 보기"`];
    if(opt.action)attrs.push(`data-action="${esc(opt.action)}"`);if(opt.index!=null)attrs.push(`data-index="${opt.index}"`);if(opt.rewardId)attrs.push(`data-reward-id="${esc(opt.rewardId)}"`);if(opt.disabled)attrs.push('disabled');
    const stats=card.type==='unit'?`<span>HP ${card.hp}</span><span>ATK ${card.power}</span>`:`${card.power?`<span>DMG ${card.power}</span>`:''}${card.block?`<span>DEF ${card.block}</span>`:''}`;
    const upgrade=card.upgradeLevel?`<span class="upgrade-badge">${card.upgradeLevel===1?'+':'++'}</span>`:'';
    const mastery=card.masteryNeed?`<span class="mastery-badge">${card.masteryXp}/${card.masteryNeed}</span>`:'';
    const synergy=Number(card.synergy||0)>0?`<span class="synergy-badge">${card.synergy>=3?'CORE':card.synergy===2?'SYNC+':'SYNC'}</span>`:'';
    const body=visual?`<div class="card-keywords-v31">${cardKeywords(card,2).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:`<div class="card-text">${esc(card.text)}</div>`;
    return `<${tag} class="${cls}" ${attrs.join(' ')}>${upgrade}${mastery}${synergy}<div class="rarity-ribbon rarity-${card.rarity}">${esc(rarityKo(card.rarity))}${card.limited?' · LIMITED':''}</div><div class="card-top"><span class="cost">${card.cost}</span><span class="card-name">${esc(card.name)}</span></div><div class="card-art"><img src="${esc(card.art)}" loading="lazy" alt=""><span class="element-mark-v31 element-${elementClass(card.element)}">${esc(elementGlyph(card.element))}</span></div><div class="card-type"><span>${card.type==='unit'?'UNIT':'SPELL'}</span><span>${esc(card.element)}</span></div>${body}<div class="card-stats">${stats}</div></${tag}>`;
  }

  function runCardView(card,run){
    if(!card)return card;const level=Math.max(0,Math.min(2,Number(run?.upgrades?.[card.id]||0))),xp=Number(run?.mastery?.[card.id]||0);const c={...card};c.upgradeLevel=level;c.masteryXp=xp;c.masteryNeed=level>=2?0:(level===1?8:3);if(!level)return c;
    const scale=1+level*.18;c.name=`${card.name}${level===1?' +':' ++'}`;c.power=Math.round(Number(card.power||0)*scale);c.block=Math.round(Number(card.block||0)*scale);c.hp=Math.round(Number(card.hp||0)*(1+level*.14));if(level>=2&&Number(card.cost||0)>=2)c.cost=Math.max(0,Number(card.cost)-1);return c;
  }

  function relicHtml(relic,opt={}){
    if(!relic)return '';return `<button class="relic-choice rarity-${relic.rarity} ${opt.claimed?'claimed':''}" data-action="${opt.action||'relic-pick'}" data-relic-id="${esc(relic.id)}" ${opt.disabled?'disabled':''}><span class="relic-icon">${esc(relic.icon||'✦')}</span><div><small>${esc(rarityKo(relic.rarity))} · RIFT RELIC</small><b>${esc(relic.name)}</b><p>${esc(relic.text)}</p></div></button>`;
  }
  function showCardInspect(cardId){
    const base=byId(state.meta?.cards,cardId);if(!base)return;const run=state.room?.runState?.[state.profileId];const card=runCardView(base,run);
    const stats=card.type==='unit'?`HP ${card.hp} · ATK ${card.power}`:[card.power?`DMG ${card.power}`:'',card.block?`DEF ${card.block}`:''].filter(Boolean).join(' · ');
    modal(`<div class="card-inspect"><div class="section-label">CARD ANALYSIS</div><div class="card-inspect-grid"><div class="inspect-card-shell">${cardHtml(card)}</div><div class="inspect-copy"><h2 class="rarity-${card.rarity}">${esc(card.name)}</h2><div class="inspect-tags"><span>${esc(rarityKo(card.rarity))}</span><span>${card.type==='unit'?'UNIT':'SPELL'}</span><span>${esc(card.element)}</span><span>ENERGY ${card.cost}</span>${card.upgradeLevel?`<span>강화 ${card.upgradeLevel}/2</span>`:''}</div><p>${esc(card.text)}</p>${stats?`<strong>${esc(stats)}</strong>`:''}<small>카드는 이번 런에서 사용할수록 숙련도가 올라갑니다. 3회 사용 시 +, 8회 사용 시 ++로 자동 성장하며 야영지 제련으로도 성장시킬 수 있습니다.</small></div></div><div class="modal-actions"><button class="cta mint" data-action="modal-close">닫기 · ESC</button></div></div>`);
  }
  function itemHtml(item,opt={}){
    if(!item)return '';
    const art=item.art?`<img src="${esc(item.art)}" alt="">`:`<span>${esc(item.icon||'◆')}</span>`;
    return `<button class="reward-item ${opt.claimed?'claimed':''}" data-rarity="${esc(item.rarity)}" ${opt.action?`data-action="${esc(opt.action)}"`:''} ${opt.rewardId?`data-reward-id="${esc(opt.rewardId)}"`:''} ${opt.disabled?'disabled':''}><div class="rarity-ribbon rarity-${item.rarity}">${esc(rarityKo(item.rarity))} · ${esc(item.category||'ITEM')}</div><div class="item-icon item-art-v32">${art}</div><b>${esc(item.name)}</b><p>${esc(item.text)}</p><div class="stack-limit">최대 ${item.maxStack||1}</div></button>`;
  }

  function featureChips(){return `<div class="feature-strip"><span class="feature-chip">CARD HUNT</span><span class="feature-chip">315 CARDS</span><span class="feature-chip">96 ITEMS</span><span class="feature-chip">25 SCENES</span><span class="feature-chip">50 FLOORS</span><span class="feature-chip">1–4 CO-OP</span></div>`;}

  function renderAuth(){
    state.current='auth';clearTimers();
    const register=state.authMode==='register',hasGuest=!!state.profile&&!state.profile.cloud&&state.guestMode;
    const saveChoice=(!register&&hasGuest)?`<div class="auth-save-choice"><div class="section-label">SAVE DATA CHOICE</div><h3>로그인 후 어떤 기록을 사용할까요?</h3><p>기존 클라우드 기록을 지키는 것이 기본값입니다. 현재 게스트 기록으로 교체하려면 두 번째 항목을 직접 선택하세요.</p><div class="auth-save-grid"><button class="${state.authProfileMode==='cloud'?'active':''}" data-action="auth-profile-mode" data-mode="cloud"><b>☁ 클라우드 기록 사용</b><small>기존 계정의 카드·재화·덱·기록을 불러옵니다. 가장 안전한 선택입니다.</small></button><button class="danger ${state.authProfileMode==='guest'?'active':''}" data-action="auth-profile-mode" data-mode="guest"><b>⇧ 현재 게스트 기록으로 교체</b><small>지금 브라우저의 게스트 진행도를 로그인 계정의 저장 데이터로 교체합니다.</small></button></div></div>`:'';
    screen.innerHTML=`<section class="auth-screen"><div class="auth-bg"><span></span><span></span><span></span></div><div class="auth-shell v26"><div class="auth-brand"><div class="auth-rift">◇</div><div><div class="section-label">RIFT NETWORK // CLOUD SAVE</div><h1>RIFT DECK</h1><p>기록은 계정에 연결되어 다른 기기에서도 이어집니다. 게스트 상태에서 로그인하는 경우 기존 클라우드 기록과 현재 게스트 기록 중 무엇을 사용할지 직접 선택할 수 있습니다.</p></div></div><div class="auth-tabs"><button class="${register?'':'active'}" data-action="auth-tab" data-mode="login">기존 계정 로그인</button><button class="${register?'active':''}" data-action="auth-tab" data-mode="register">새 계정 만들기</button></div>${saveChoice}<div class="auth-form">${register?`<label>닉네임<input id="authNickname" maxlength="14" autocomplete="nickname" placeholder="게임에 표시될 이름"></label>`:''}<label>아이디<input id="authAccount" maxlength="20" autocomplete="username" placeholder="영문/숫자/_ 3~20자"></label><label>비밀번호<input id="authPassword" type="password" maxlength="72" autocomplete="${register?'new-password':'current-password'}" placeholder="6자 이상"></label><button class="auth-submit" data-action="${register?'auth-signup':'auth-login'}">${register?'탐험가 계정 생성':'클라우드 계정으로 접속'}</button><div class="auth-security"><b>SERVER AUTH</b><span>비밀번호는 게임 DB에 저장하지 않고 Supabase Auth가 처리합니다.</span></div></div><div class="auth-guest">${state.authFromGuest?'<button data-action="auth-cancel">← 게스트 화면으로 돌아가기</button>':'<button data-action="guest-enter">게스트로 먼저 체험</button>'}<small>${state.authFromGuest?'로그인하지 않아도 현재 게스트 기록은 유지됩니다.':'나중에 탐험 기록 화면에서 언제든 클라우드 계정으로 전환할 수 있습니다.'}</small></div></div></section>`;
    window.scrollTo({top:0,behavior:'instant'});
  }
  async function authSubmit(mode){
    if(state.busy)return;const account=$('#authAccount')?.value?.trim(),password=$('#authPassword')?.value||'',nickname=$('#authNickname')?.value?.trim();
    if(!account)return toast('아이디를 입력해 주세요.','error');if(password.length<6)return toast('비밀번호는 6자 이상 입력해 주세요.','error');if(mode==='signup'&&!nickname)return toast('닉네임을 입력해 주세요.','error');
    setBusy(true);try{
      const profileMode=mode==='login'?state.authProfileMode:'guest';
      const d=await api(`/api/auth/${mode}`,{body:{accountId:account,password,nickname,guestProfileId:state.guestProfileId,profileMode}});
      state.auth={enabled:true,authenticated:true,user:d.user};state.profile=d.profile;state.profileId=d.profile.id;state.nickname=d.profile.nickname;state.guestMode=false;state.authFromGuest=false;localStorage.removeItem('riftdeck.guestMode');localStorage.setItem('riftdeck.nickname',state.nickname);state.room=null;state.roomId='';localStorage.removeItem('riftdeck.roomId');updateTopbar();screenFlash('login');sound('reward');
      const msg=mode==='signup'?'계정 생성 완료! 게스트 진행 기록을 클라우드 계정에 연결했습니다.':profileMode==='guest'?'로그인 완료. 현재 게스트 기록으로 클라우드 저장 데이터를 교체했습니다.':'로그인 완료. 기존 클라우드 기록을 불러왔습니다.';
      toast(msg,'good');renderHome();
    }catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}
  }
  async function logout(){
    try{await api('/api/auth/logout',{body:{}});}catch{}state.stream?.close();state.stream=null;state.auth={enabled:!!state.meta?.authEnabled,authenticated:false,user:null};state.profile=null;state.profileId=state.guestProfileId;state.room=null;state.roomId='';localStorage.removeItem('riftdeck.roomId');state.guestMode=false;localStorage.removeItem('riftdeck.guestMode');renderAuth();toast('로그아웃했습니다.','good');
  }
  function homeHtml(){
    const featured=(state.meta.banner.featured||[]).map(id=>byId(state.meta.cards,id)).filter(Boolean),active=state.room&&!['ended','cleared'].includes(state.room.status),owned=state.profile.ownedCount||0;
    return `<section class="home home-v32"><div class="home-hero"><div class="world-panel"><div class="hero-content"><div class="eyebrow">EXPLORE → CAPTURE → BUILD → DUNGEON</div><h1>여행에서 카드를 찾고,<em>그 카드로 50층을 돌파하라.</em></h1><p>카드 사냥에서 영구 해금 → 보관함에서 덱 편성 → 던전에서 사용.</p>${featureChips()}<div class="progress-loop-v32"><span><b>1</b>카드 사냥</span><i>›</i><span><b>2</b>영구 해금</span><i>›</i><span><b>3</b>던전 덱</span></div><div class="home-actions"><button class="mode-button primary hunt" data-action="journey-create"><span class="mode-kicker">SOLO · PERMANENT UNLOCK</span><b>카드 사냥 여행</b><small>전투마다 카드 흔적 출현 · 봉인하면 영구 획득</small></button><button class="mode-button dungeon" data-action="dungeon-lobby"><span class="mode-kicker">1–4 PLAYER · ${owned} OWNED</span><b>50층 협동 던전</b><small>내가 획득한 카드로 시작 덱 구성</small></button></div>${active?`<button class="cta mint" style="margin-top:10px" data-action="resume-room">원정 이어하기 · ${esc(state.room.id)}</button>`:''}</div></div><aside class="banner-panel"><div class="section-label">RERUN ARCHIVE</div><h2>${esc(state.meta.banner.name)}</h2><p>복각 전용 카드 풀.</p><div class="featured-stack">${featured.map(c=>cardHtml(c,{compact:true})).join('')}</div><div class="banner-timer">종료 <b id="bannerClock">--:--:--</b></div><div class="banner-actions"><button class="cta" data-action="gacha-pull" data-count="1">1회 · ◆${state.meta.banner.singleCost}</button><button class="cta gold" data-action="gacha-pull" data-count="10">10회 · ◆${state.meta.banner.tenCost}</button></div></aside></div><div class="quick-grid"><button class="quick-card" data-action="collection"><span class="quick-icon">▤</span><b>던전 덱</b><small>${owned}/${state.profile.totalCards}종 영구 보유</small></button><button class="quick-card" data-action="journey-create"><span class="quick-icon">⌁</span><b>카드 사냥</b><small>일반 카드의 주 획득처</small></button><button class="quick-card" data-action="gacha"><span class="quick-icon">◇</span><b>복각 소환</b><small>아카이브 전용 카드</small></button><button class="quick-card" data-action="profile"><span class="quick-icon">✦</span><b>탐험 기록</b><small>봉인·클리어 기록</small></button></div></section>`;
  }

  function renderHome(){closeStreamIfInactive();setScreen('home',homeHtml());tickBanner();state.bannerTimer=setInterval(tickBanner,1000);}
  function tickBanner(){const el=$('#bannerClock');if(!el)return;const ms=Math.max(0,new Date(state.meta.banner.endsAt)-Date.now());const d=Math.floor(ms/86400000),h=Math.floor(ms/3600000)%24,m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;el.textContent=`${d}D ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

  async function renderDungeonLobby(){
    setScreen('dungeonLobby',`<section class="page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">CO-OP DUNGEON</div><h1>50층 협동 던전</h1><p>처음에는 3개의 원정 서약 중 하나를 골라 런의 방향을 정합니다. 이후 전투/정예/사건/야영지/상점 중 경로를 선택하며, 10층마다 보스를 쓰러뜨릴 때마다 심연 압력이 상승해 적도 강해지고 고급 보상 확률도 함께 올라갑니다.</p></div></div><div class="lobby-grid"><div class="room-create"><h2>새 원정대 만들기</h2><p>최대 4명. 혼자서도 시작할 수 있으며, 모든 전투 판정과 유물/강화/분해는 서버에서 처리됩니다.</p>${difficultySelector()}<div class="field"><input id="roomNameInput" maxlength="24" placeholder="원정대 이름 (선택)"><button class="cta mint" data-action="create-dungeon">방 만들기</button></div><div style="height:8px"></div><div class="field"><input id="roomCodeInput" maxlength="6" inputmode="numeric" placeholder="6자리 방 코드"><button class="cta" data-action="join-code">코드 참가</button></div></div><div class="public-rooms"><div class="section-label">OPEN ROOMS</div><h2 style="font-size:13px">공개 원정대</h2><div id="publicRooms"><p class="small-note">방 목록을 불러오는 중...</p></div></div></div></section>`);
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
  function runItemRack(run){
    const entries=Object.entries(run?.items||{}),relics=(run?.relics||[]).map(id=>byId(state.meta.relics,id)).filter(Boolean);return `<div class="run-rack upgraded-rack"><div class="run-economy"><strong>RUN GOLD ${Number(run?.gold||0).toLocaleString()}G</strong><span>균열 파편 ◇${Number(run?.fragments||0)}</span><span>덱 ${run?.runDeck?.length||0}장</span></div><div class="run-rack-row">${relics.length?relics.map(r=>`<span class="run-relic" title="${esc(r.text)}">${esc(r.icon||'✦')} ${esc(r.name)}</span>`).join(''):'<span class="small-note">유물 없음</span>'}${entries.length?entries.map(([id,n])=>{const it=byId(state.meta.items,id);return `<span class="run-item-chip" title="${esc(it?.text||'')}">${esc(it?.icon||'◆')} ${esc(it?.name||id)}<em>×${n}</em></span>`;}).join(''):''}</div></div>`;
  }

  function threatHtml(r){const tokens=r.threatTokens||[];return `<div class="threat-strip"><b>ABYSS PRESSURE ×${tokens.length}</b>${tokens.length?tokens.map(t=>`<span title="${esc(t.desc)}">${esc(t.icon||'▲')} ${esc(t.name)}</span>`).join(''):'<span>아직 압력 없음 · 10층 보스 격파 후 상승</span>'}</div>`;}

  function feedPanel(r,count=6,title='EXPEDITION LOG'){const feed=(r.feed||[]).slice(-count).reverse();return `<div class="feed-panel"><div class="section-label">${title}</div>${feed.length?feed.map(x=>`<div class="feed-row"><b>${esc(String(x.type||'LOG').toUpperCase())}</b><p>${esc(x.message)}</p></div>`).join(''):'<p class="small-note">아직 기록이 없습니다.</p>'}</div>`;}

  function contractPanel(r){const claim=r.contractClaims?.[state.profileId],offers=r.contractOffers?.[state.profileId]||[];if(claim){const c=offers.find(x=>x.id===claim);return `<div class="contract-panel selected"><div class="section-label">STARTER CORE</div><b>${esc(c?.icon||'◇')} ${esc(c?.name||claim)}</b><p>${esc(c?.detail||'선택한 서약이 이번 원정 전체에 적용됩니다.')}</p></div>`;}return `<div class="contract-panel"><div><div class="section-label">CHOOSE YOUR STARTER CORE</div><h3>첫 경로를 고르기 전에 원정 서약을 선택하세요.</h3><p>서약은 이번 원정의 시작 덱·체력·골드·보상 흐름을 바꿉니다. 매 런마다 다른 빌드를 만들기 위한 핵심 선택입니다.</p></div><div class="contract-grid">${offers.map(c=>`<button data-action="contract-pick" data-contract-id="${esc(c.id)}"><span>${esc(c.icon||'◇')}</span><b>${esc(c.name)}</b><p>${esc(c.desc)}</p><small>${esc(c.detail)}</small></button>`).join('')}</div></div>`;}

  function briefingHtml(r){const nextBoss=r.mode==='dungeon'?Math.min(r.maxFloor||50,Math.ceil(r.floor/10)*10):null;return `<div class="briefing-panel"><div><div class="section-label">EXPEDITION BRIEFING</div><h3>${esc(r.biome.name)} · ${r.floor}F</h3><p>${esc(r.biome.desc)} 경로 선택은 단순한 이동이 아니라 덱의 방향을 정하는 선택입니다. 정예는 유물을, 야영지는 강화 기회를, 상점은 덱 정제를 제공합니다.</p></div><div class="briefing-meta"><span>${r.mode==='dungeon'?`다음 지역 보스 ${nextBoss}F`:'끝없는 여행 모드'}</span><span>전투 보상은 필요 없으면 분해 가능</span><span>정예/보물/보스 → 추가 유물 선택권</span></div></div>`;}
  function expeditionHeader(r){const max=r.maxFloor||Math.max(50,r.floor+1),progress=r.maxFloor?pct(r.floor,max):Math.min(100,r.floor%50*2);return `<div class="expedition-head" style="background-image:url('${esc(sceneBg(r))}')"><div class="expedition-copy"><div class="section-label">${r.mode==='dungeon'?`${difficultyKo(r.difficulty)} DUNGEON · ${r.biome.short}`:`JOURNEY · ${r.biome.short}`}</div><div class="floor-line"><div class="floor-num">${r.floor}<small>F${r.maxFloor?` / ${r.maxFloor}`:''}</small></div><div class="biome-name">${esc(r.biome.name)}<div class="small-note">${esc(r.biome.desc)}</div></div></div><div class="progress-track"><i style="width:${progress}%"></i></div><div class="milestones"><span>1F</span><span>10F</span><span>20F</span><span>30F</span><span>40F</span><span>${r.maxFloor||'∞'}F</span></div></div></div>`;}
  function partyStrip(r){return `<div class="party-strip">${r.players.map(p=>{const run=r.runState[p.id];return `<div class="party-chip"><b>${esc(p.nickname)}${p.id===state.profileId?' · YOU':''}</b><small>HP ${run?.hp||0}/${run?.maxHp||0} · G ${run?.gold||0} · 덱 ${run?.runDeck?.length||0} · 아이템 ${Object.keys(run?.items||{}).length}</small><div class="hpbar"><i style="width:${pct(run?.hp,run?.maxHp)}%"></i></div></div>`;}).join('')}</div>`;}
  function compactRunHud(r,run){
    const hp=Math.max(0,Number(run?.hp||0)),max=Math.max(1,Number(run?.maxHp||1)),scene=sceneName(r);
    return `<div class="run-hud-v27"><div class="run-floor-v27"><strong>${r.floor}</strong><span>F</span><div><b>${esc(scene)}</b><small>${r.mode==='dungeon'?difficultyKo(r.difficulty):`CARD HUNT · ${state.profile.ownedCount}/${state.profile.totalCards}`}</small></div></div><div class="run-hp-v27"><span>HP ${hp}/${max}</span><i><em style="width:${pct(hp,max)}%"></em></i></div><div class="run-pills-v27"><span>G ${run.gold||0}</span><span>◇ ${run.fragments||0}</span><span>✦ ${(run.relics||[]).length}</span><button data-action="run-info">RUN</button></div></div>`;
  }

  function showRunInfo(){
    const r=state.room,run=r?.runState?.[state.profileId];if(!r||!run)return;
    const relics=(run.relics||[]).map(id=>byId(state.meta.relics,id)).filter(Boolean);
    const items=Object.entries(run.items||{}).map(([id,n])=>({item:byId(state.meta.items,id),n})).filter(x=>x.item);
    modal(`<div class="run-info-modal-v27"><div class="section-label">RUN STATUS</div><h2>${r.floor}F · ${esc(r.biome.name)}</h2><div class="run-info-grid-v27"><div><small>HP</small><b>${run.hp}/${run.maxHp}</b></div><div><small>GOLD</small><b>${run.gold}G</b></div><div><small>DECK</small><b>${run.runDeck?.length||0}</b></div><div><small>PRESSURE</small><b>×${(r.threatTokens||[]).length}</b></div></div><h3>유물</h3><div class="simple-chip-list-v27">${relics.length?relics.map(x=>`<span title="${esc(x.text)}">${esc(x.icon||'✦')} ${esc(x.name)}</span>`).join(''):'<span>아직 없음</span>'}</div><h3>런 아이템</h3><div class="simple-chip-list-v27">${items.length?items.map(x=>`<span title="${esc(x.item.text)}">${esc(x.item.icon||'◆')} ${esc(x.item.name)} ×${x.n}</span>`).join(''):'<span>아직 없음</span>'}</div><div class="modal-actions"><button class="cta mint" data-action="modal-close">닫기</button></div></div>`);
  }
  function showForgeMenu(){
    const r=state.room,rw=r?.reward,run=r?.runState?.[state.profileId];if(!r||!rw||!run)return;
    const done=rw.campBy?.[state.profileId];const uniq=[...new Set(run.runDeck||[])].map(id=>({c:byId(state.meta.cards,id),lv:Number(run.upgrades?.[id]||0)})).filter(x=>x.c&&x.lv<2).slice(0,12);
    modal(`<div class="forge-modal-v27"><div class="section-label">CARD FORGE</div><h2>강화할 카드 1장을 선택하세요.</h2><p>카드 수치가 강화되고, ++ 단계에서는 비용 2 이상 카드의 에너지가 1 감소합니다.</p><div class="forge-grid-v27">${uniq.map(x=>`<button data-action="camp-upgrade" data-card-id="${esc(x.c.id)}" ${done?'disabled':''}><img src="${esc(x.c.art)}" alt=""><b>${esc(x.c.name)}</b><small>${x.lv===0?'→ +':'+ → ++'}</small></button>`).join('')}</div><div class="modal-actions"><button class="cta" data-action="modal-close">취소</button></div></div>`);
  }
  function showPurgeMenu(){
    const r=state.room,rw=r?.reward,run=r?.runState?.[state.profileId];if(!r||!rw||!run)return;
    const used=rw.trimBy?.[state.profileId],cost=70+Number(run.removals||0)*25,counts={};for(const id of run.runDeck||[])counts[id]=(counts[id]||0)+1;
    const cards=Object.entries(counts).map(([id,n])=>({c:byId(state.meta.cards,id),n})).filter(x=>x.c).sort((a,b)=>(state.meta.rarities[a.c.rarity]?.order||0)-(state.meta.rarities[b.c.rarity]?.order||0)||b.n-a.n).slice(0,12);
    modal(`<div class="purge-modal-v27"><div class="section-label">DECK PURGE</div><h2>카드 1장 제거 · ${cost}G</h2><p>덱이 얇을수록 핵심 카드를 더 자주 뽑습니다.</p><div class="purge-grid-v27">${cards.map(x=>`<button data-action="trim-deck" data-card-id="${esc(x.c.id)}" ${used||run.gold<cost||run.runDeck.length<=10?'disabled':''}><b>${esc(x.c.name)}</b><small>${esc(rarityKo(x.c.rarity))} · ${x.n}장</small></button>`).join('')}</div><div class="modal-actions"><button class="cta" data-action="modal-close">닫기</button></div></div>`);
  }
  function rewardStageHeader(r,run,step){return `<header class="reward-hud-v27"><div><small>${esc(step)}</small><b>${r.floor}F · ${esc(r.biome.name)}</b></div><div><span>HP ${run.hp}/${run.maxHp}</span><span>G ${run.gold}</span><span>◇ ${run.fragments||0}</span><button data-action="run-info">RUN</button></div></header>`;}
  function renderRoute(r){
    const run=r.runState[state.profileId],voted=r.route?.find(n=>n.votes.includes(state.profileId))?.id,contractReady=!!r.contractClaims?.[state.profileId],pressure=(r.threatTokens||[]).length,offers=r.contractOffers?.[state.profileId]||[];
    const tag=k=>({combat:'BATTLE',elite:'RELIC+',boss:'BOSS',event:'?',rest:'HEAL',treasure:'GOLD',merchant:'SHOP'})[k]||'PATH';
    const content=!contractReady?`<div class="core-select-v31"><div class="visual-kicker-v31"><span>START</span><b>스타팅 코어</b></div><div class="core-grid-v31">${offers.map(c=>`<button data-action="contract-pick" data-contract-id="${esc(c.id)}" title="${esc(c.detail||c.desc||'')}"><span class="core-icon-v31">${esc(c.icon||'◇')}</span><b>${esc(c.name)}</b><small>${esc(shortLine(c.desc,28))}</small></button>`).join('')}</div><em class="tap-hint-v31">하나를 고르면 바로 출발</em></div>`:`<div class="path-select-v31"><div class="visual-kicker-v31"><span>${r.floor}F</span><b>${esc(r.biome.name)}</b><em>PRESSURE ×${pressure}</em></div><div class="path-grid-v31 visual-path-grid-v31">${r.route.map((n,i)=>`<button class="path-choice-v31 kind-${esc(n.kind)} ${voted===n.id?'selected':''}" data-action="route-vote" data-node="${esc(n.id)}" title="${esc(n.desc)}">${routeGraphic(n.kind)}<span class="path-index-v31">0${i+1}</span><b>${esc(n.label)}</b><small>${tag(n.kind)}</small><em>${n.votes.length}/${r.players.length}</em></button>`).join('')}</div><div class="tap-hint-v31">${voted?'선택 완료 · 대기 중':'길 하나만 선택'}</div></div>`;
    setScreen('route',`<section class="run-stage-v31 route-stage-v31"><div class="run-bg-v31" style="background-image:url('${esc(sceneBg(r))}')"></div><div class="ambient-grid-v31"></div><div class="run-shade-v31"></div>${compactRunHud(r,run)}<main class="decision-center-v31">${content}</main><div class="floor-track-v31"><i style="width:${r.maxFloor?pct(r.floor,r.maxFloor):Math.min(100,(r.floor%50)*2)}%"></i><span>${r.floor}/${r.maxFloor||'∞'}</span></div></section>`);
  }
  function renderBattle(r){
    const b=r.battle,me=b.party.find(p=>p.playerId===state.profileId);if(!me)return;
    const alive=b.enemies.filter(e=>e.hp>0);if(!state.selectedEnemy||!alive.some(e=>e.uid===state.selectedEnemy))state.selectedEnemy=alive[0]?.uid||null;
    const run=r.runState[state.profileId],chain=me.chain||{count:0,lastType:null,best:0,overdrives:0},selected=alive.find(e=>e.uid===state.selectedEnemy)||alive[0],intent=intentCompact(selected?.intent);
    const party=b.party.map(pc=>`<span class="party-orb-v31 ${pc.playerId===state.profileId?'me':''} ${pc.down?'down':''}" title="${esc(pc.nickname)} · HP ${pc.hp}/${pc.maxHp}"><i style="--hp:${pct(pc.hp,pc.maxHp)}%"></i><b>${esc(pc.nickname.slice(0,1))}</b></span>`).join('');
    const enemies=alive.map((e,i)=>{const it=intentCompact(e.intent);return `<button class="enemy-actor-v31 ${state.selectedEnemy===e.uid?'selected':''} ${b.tier==='boss'?'boss':''} ${e.enraged?'phase2':''} intent-${esc(e.intent?.type||'attack')}" data-action="select-enemy" data-enemy="${e.uid}" title="${esc(e.intent?.text||'')}"><div class="enemy-intent-v31"><span>${esc(it.icon)}</span>${it.value?`<b>${esc(it.value)}</b>`:''}</div><div class="enemy-sprite-stage-v31"><img class="enemy-sprite" src="${esc(e.sprite)}" alt=""><i class="enemy-shadow-v31"></i><i class="target-ring-v31"></i></div><div class="enemy-name-v31"><b>${esc(e.name)}</b>${e.enraged?'<em>II</em>':''}</div><div class="enemy-hpbar-v31"><i style="width:${pct(e.hp,e.maxHp)}%"></i></div><div class="enemy-sub-v31"><span>${e.hp}/${e.maxHp}</span>${e.block?`<span>▣ ${e.block}</span>`:''}<span class="break-dot-v31 ${e.broken?'broken':''}"><i style="width:${pct(e.stagger,e.staggerMax)}%"></i></span></div></button>`;}).join('');
    const units=[0,1,2].map(i=>{const u=me.units[i];return u?`<div class="unit-actor-v31 filled element-${elementClass(u.element||byId(state.meta.cards,u.cardId)?.element)}" data-card-id="${esc(u.cardId)}"><div class="unit-sprite-v31"><img src="${esc(byId(state.meta.cards,u.cardId)?.art||'')}" alt=""></div><b>${esc(shortLine(u.name,12))}</b><span>ATK ${u.power}</span></div>`:`<div class="unit-actor-v31 empty"><i>+</i></div>`;}).join('');
    const hand=me.hand.map((cid,i)=>{const c=runCardView(byId(state.meta.cards,cid),run);const can=!me.ended&&!me.down&&b.phase==='players'&&me.energy>=Math.max(0,c.cost-(me.buffs.anyDiscount>0?1:(c.type==='spell'&&me.buffs.spellDiscount>0?1:0)))&&!(c.type==='unit'&&me.units.length>=3);return cardHtml(c,{action:'play-card',index:i,disabled:!can,visual:true});}).join('');
    const modifier=b.modifier?`<button class="modifier-chip-v31" data-action="run-info" title="${esc(b.modifier.desc)}"><span>${esc(b.modifier.icon)}</span><b>${esc(b.modifier.name)}</b></button>`:'';
    setScreen('battle',`<section class="battle-stage-v31"><div class="battle-bg-v31" style="background-image:url('${esc(sceneBg(r))}')"></div><div class="battle-parallax-v31 p1"></div><div class="battle-parallax-v31 p2"></div><div class="battle-grade-v31"></div><header class="battle-hud-v31"><div class="battle-party-v31">${party}</div><div class="battle-round-v31"><small>${b.tier==='boss'?'BOSS':b.tier==='elite'?'ELITE':esc(r.biome.short)}</small><b>${r.floor}F</b><span>T${b.turn}</span>${modifier}</div><div class="battle-tools-v31"><button data-action="run-info">◈</button><button data-action="toggle-combat-log">≡</button></div></header><main class="battle-field-v31"><section class="ally-stage-v31"><div class="player-nameplate-v31"><div><b>${esc(me.nickname)}</b><span>${me.hp}/${me.maxHp}</span></div><i><em style="width:${pct(me.hp,me.maxHp)}%"></em></i>${me.block?`<small>▣ ${me.block}</small>`:''}</div><div class="ally-units-v31">${units}</div></section><section class="enemy-stage-v31">${enemies}</section></main><footer class="battle-command-v31"><div class="energy-panel-v31"><span>ENERGY</span>${energyOrbs(me)}<div class="combo-pips-v31" title="COMBO ×${chain.count||0}">${[1,2,3,4,5].map(n=>`<i class="${n<=chain.count?'on':''}"></i>`).join('')}</div></div><div class="battle-hand-v31"><div class="hand">${hand}</div></div><div class="command-side-v31"><div class="intent-preview-v31" title="${esc(selected?.intent?.text||'')}"><small>NEXT</small><span>${esc(intent.icon)}</span>${intent.value?`<b>${esc(intent.value)}</b>`:''}</div>${me.ended?'<div class="waiting-v31">WAIT</div>':`<button class="end-turn-v31" data-action="end-turn"><span>END</span><b>E</b></button>`}</div></footer><aside class="battle-log-drawer-v31 ${state.combatLogOpen?'open':''}"><div><b>LOG</b><button data-action="toggle-combat-log">×</button></div>${b.log.slice(-14).reverse().map(x=>`<p>${esc(x.text)}</p>`).join('')}</aside></section>`);
  }
  function runMod(run,key){let n=Number(run?.mods?.[key]||0);for(const [id,count] of Object.entries(run?.items||{})){const it=byId(state.meta.items,id);n+=Number(it?.mod?.[key]||0)*Number(count||0);}for(const id of (run?.relics||[])){const r=byId(state.meta.relics,id);n+=Number(r?.mod?.[key]||0);}return n;}
  function relicDraftHtml(r,rw){const opts=rw.relicOptions?.[state.profileId]||[],claim=rw.relicClaims?.[state.profileId];if(!opts.length)return '';return `<div class="relic-draft"><div class="section-label">BONUS RIFT RELIC</div><h3>${rw.tier==='boss'?'보스 유물 선택':'유물 선택'}</h3><p>유물은 이번 원정 전체에 적용되는 강력한 패시브입니다. 카드보다 빌드 방향을 크게 바꿉니다.</p><div class="relic-grid">${opts.map(x=>relicHtml(x,{claimed:!!claim,disabled:!!claim})).join('')}</div>${claim?`<div class="claim-note">유물 선택 완료 · ${esc(byId(state.meta.relics,claim)?.name||claim)}</div>`:''}</div>`;}
  function campHtml(r,rw,run){if(!rw.camp)return '';const done=rw.campBy?.[state.profileId];const uniq=[...new Set(run.runDeck||[])].map(id=>({c:byId(state.meta.cards,id),lv:Number(run.upgrades?.[id]||0)})).filter(x=>x.c&&x.lv<2).slice(0,10);return `<div class="camp-panel"><div class="section-label">STARLIGHT CAMP</div><h3>야영 행동 · 하나만 선택</h3><div class="camp-actions"><button data-action="camp-rest" ${done?'disabled':''}><b>♨ 휴식</b><small>최대 HP의 약 30% 회복</small></button><button data-action="camp-meditate" ${done?'disabled':''}><b>◇ 명상</b><small>균열 파편 +2 · 40G</small></button></div><div class="camp-upgrades"><b>⚒ 카드 제련</b><small>카드 수치 +18%/단계 · ++에서는 비용 2 이상 카드 에너지 -1</small><div>${uniq.map(x=>`<button data-action="camp-upgrade" data-card-id="${esc(x.c.id)}" ${done?'disabled':''}><span>${esc(x.c.name)}</span><em>${x.lv===0?'→ +':'+ → ++'}</em></button>`).join('')}</div></div>${done?`<div class="claim-note">야영 행동 완료 · ${esc(done.label||done.mode)}</div>`:''}</div>`;}
  function trimHtml(r,rw,run){if(!['merchant','rest'].includes(rw.kind))return '';const used=rw.trimBy?.[state.profileId],cost=70+Number(run.removals||0)*25,counts={};for(const id of run.runDeck||[])counts[id]=(counts[id]||0)+1;const cards=Object.entries(counts).map(([id,n])=>({c:byId(state.meta.cards,id),n})).filter(x=>x.c).sort((a,b)=>(state.meta.rarities[a.c.rarity]?.order||0)-(state.meta.rarities[b.c.rarity]?.order||0)||b.n-a.n).slice(0,8);return `<div class="trim-panel"><div class="section-label">DECK PURGE</div><h3>덱 정제 · ${cost}G</h3><p>좋은 카드를 추가하는 것만큼 필요 없는 카드를 빼는 것도 중요합니다. 정제 비용은 사용할수록 올라갑니다.</p><div class="trim-grid">${cards.map(x=>`<button data-action="trim-deck" data-card-id="${esc(x.c.id)}" ${used||run.gold<cost||run.runDeck.length<=10?'disabled':''}><b>${esc(x.c.name)}</b><small>${esc(rarityKo(x.c.rarity))} · ${x.n}장</small></button>`).join('')}</div>${used?`<div class="claim-note">정제 완료 · ${esc(byId(state.meta.cards,used)?.name||used)}</div>`:''}</div>`;}
  function nextRerollCost(r){const run=r.runState[state.profileId],count=Number(r.reward.rerolls?.[state.profileId]||0),discount=Math.min(.70,runMod(run,'rerollDiscount')),base=42+r.floor*3;return Math.max(20,Math.round(base*Math.pow(1.55,count)*(1-discount)));}
  function captureChance(card,seal,run){const base=Number(state.meta.rarities?.[card?.rarity]?.sealBase||0),mult={basic:1,silver:1.75,royal:3.35}[seal]||1,bonus=runMod(run,'captureBonus'),cap=card?.rarity==='mythic'?.22:card?.rarity==='legendary'?.44:.96;return Math.round(Math.min(cap,base*mult+bonus)*100);}
  function captureStageV32(capture,run){const owned=!!state.profile.collection?.[capture.card.id];return `<div class="hunt-stage-v32"><div class="hunt-card-v32 rarity-${capture.card.rarity}"><div class="hunt-tag-v32">${owned?'DUPLICATE':'NEW'}</div><img src="${esc(capture.card.art)}" alt=""><div><small>${esc(rarityKo(capture.card.rarity))} · ${esc(capture.card.element)}</small><b>${esc(capture.card.name)}</b></div></div><div class="hunt-side-v32"><div class="hunt-radar-v32"><i></i><span>WILD CARD ECHO</span></div><b>${owned?'이미 보유 · 중복은 잔광으로 변환':'봉인 성공 시 영구 컬렉션 등록'}</b><div class="seal-orbs-v32">${[['basic','basic','◇'],['silver','silver','◈'],['royal','royal','◆']].map(([key,file,glyph])=>`<button data-action="capture" data-seal="${key}" ${Number(state.profile.seals?.[key]||0)<=0?'disabled':''}><img src="/assets/ui/seal_${file}.png" alt=""><strong>${captureChance(capture.card,key,run)}%</strong><small>${glyph} ${state.profile.seals?.[key]||0}</small></button>`).join('')}</div><button class="hunt-pass-v32" data-action="capture-pass">지나가기</button></div></div>`;}
  function renderReward(r){
    const rw=r.reward,run=r.runState[state.profileId],pid=state.profileId,options=rw.playerOptions?.[pid]||[],claim=rw.claims?.[pid],continued=rw.continueBy?.includes(pid),relicOpts=rw.relicOptions?.[pid]||[],relicClaim=rw.relicClaims?.[pid],campDone=!rw.camp||!!rw.campBy?.[pid],rewardDone=!options.length||!!claim;
    const capture=r.mode==='journey'&&r.capture&&!r.capture.escaped?r.capture:null,capturePending=!!capture&&!capture.attemptedBy?.includes(pid);const afterCore=campDone&&(!relicOpts.length||!!relicClaim)&&rewardDone;let step='REWARD',body='',actions='';
    if(capturePending){step='CARD HUNT';body=captureStageV32(capture,run);}
    else if(rw.camp&&!campDone){const uniq=[...new Set(run.runDeck||[])].map(id=>({c:byId(state.meta.cards,id),lv:Number(run.upgrades?.[id]||0)})).filter(x=>x.c&&x.lv<2);step='CAMP';body=`<div class="reward-visual-title-v31"><span>✦</span><b>야영지</b></div><div class="reward-choice-grid-v31 camp"><button data-action="camp-rest"><span>♥</span><b>휴식</b><small>HP +30%</small></button><button data-action="camp-meditate"><span>◇</span><b>명상</b><small>파편 +2</small></button><button data-action="open-forge" ${uniq.length?'':'disabled'}><span>⚒</span><b>제련</b><small>카드 강화</small></button></div>`;}
    else if(relicOpts.length&&!relicClaim){step='RELIC';body=`<div class="reward-visual-title-v31"><span>✦</span><b>유물</b></div><div class="relic-grid-v31 visual-relic-grid-v31">${relicOpts.map(x=>`<button class="relic-visual-v31 rarity-${x.rarity}" data-action="relic-pick" data-relic-id="${esc(x.id)}" title="${esc(x.text)}"><span>${esc(x.icon||'✦')}</span><b>${esc(x.name)}</b><small>${esc(shortLine(x.text,30))}</small></button>`).join('')}</div>`;}
    else if(!rewardDone){step=r.mode==='journey'?'FIELD SUPPLY':'PICK ONE';body=`<div class="reward-visual-title-v31"><span>${r.mode==='journey'?'✚':'◆'}</span><b>${r.mode==='journey'?'여행 보급':'런 보상'}</b></div><div class="reward-options-v31">${options.map(o=>o.type==='card'?cardHtml({...o.card,synergy:o.synergy||0},{action:'reward-pick',rewardId:o.id,visual:true}):`<button class="reward-item-visual-v31 rarity-${o.item.rarity}" data-action="reward-pick" data-reward-id="${esc(o.id)}" title="${esc(o.item.text)}"><img src="${esc(o.item.art||'')}" alt=""><b>${esc(o.item.name)}</b><small>${esc(o.item.category||rarityKo(o.item.rarity))}</small></button>`).join('')}</div><div class="run-only-note-v32">${r.mode==='dungeon'?'카드는 이번 던전용. 영구 카드는 카드 사냥 여행에서 봉인.':'카드는 이번 여행용. 영구 해금은 CARD HUNT에서.'}</div>`;actions=`<div class="reward-actions-v31"><button data-action="reward-salvage">분해</button><button data-action="reward-reroll">↻ ${nextRerollCost(r)}G</button>${run.fragments>0?'<button data-action="reward-reroll-fragment">◇1</button>':''}</div>`;}
    else if(rw.kind==='merchant'&&afterCore){step='SHOP';body=merchantHtmlCompact(r);actions=`<div class="reward-actions-v31"><button data-action="open-purge">덱 정제</button><button class="next-button-v31" data-action="reward-continue">NEXT</button></div>`;}
    else{step='READY';const grade=rw.gradeBy?.[pid];body=`<div class="reward-ready-v31"><span>✓</span><b>${claim?esc(claim.label):'완료'}</b>${grade?`<em>${grade}</em>`:''}</div>`;actions=`<div class="reward-actions-v31">${['rest','merchant'].includes(rw.kind)?'<button data-action="open-purge">덱 정제</button>':''}<button class="next-button-v31" data-action="reward-continue">${continued?'WAIT':r.finalClearPending?'CLEAR':'NEXT'}</button></div>`;}
    setScreen('reward',`<section class="run-stage-v31 reward-stage-v31"><div class="run-bg-v31" style="background-image:url('${esc(sceneBg(r))}')"></div><div class="ambient-grid-v31"></div><div class="run-shade-v31"></div>${compactRunHud(r,run)}<main class="reward-center-v31"><div class="reward-focus-v31"><div class="reward-step-v31">${esc(step)}</div>${body}${actions}</div></main></section>`);
  }

  function merchantHtmlCompact(r){const rw=r.reward,run=r.runState[state.profileId];return `<div class="shop-scene-v32"><div class="merchant-v32"><div class="merchant-glow-v32"></div><img src="/assets/ui/merchant.png" alt=""><small>WANDERING ARCHIVIST</small><b>${run.gold}G</b></div><div class="shop-shelf-v32">${(rw.shop||[]).map(x=>{const bought=rw.purchased?.[`${state.profileId}:${x.id}`],obj=x.type==='card'?x.card:x.item,art=obj.art||'';return `<button class="shop-pedestal-v32 rarity-${obj.rarity}" data-action="buy" data-item="${x.id}" data-type="${x.type}" ${bought||run.gold<x.price?'disabled':''} title="${esc(obj.text||'')}"><div class="shop-art-v32"><img src="${esc(art)}" alt=""></div><b>${esc(obj.name)}</b><small>${x.type==='card'?'RUN CARD':esc(obj.category||'ITEM')}</small><strong>${x.price}G</strong>${bought?'<em>SOLD</em>':''}</button>`;}).join('')}</div></div>`;}

  function merchantHtml(r){const rw=r.reward,run=r.runState[state.profileId];return `<div class="merchant-panel"><div class="section-label" style="text-align:center">WANDERING MERCHANT</div><h2>추가 구매 · 현재 ${run.gold}G</h2><div class="shop-grid">${(rw.shop||[]).map(x=>{const bought=rw.purchased?.[`${state.profileId}:${x.id}`];const obj=x.type==='card'?x.card:x.item;const name=obj.name,text=obj.text,rar=obj.rarity,icon=x.type==='card'?'▤':(obj.icon||'◆');return `<div class="shop-card"><div class="rarity-${rar}" style="font-size:6px">${rarityKo(rar)} · ${x.type==='card'?'CARD':'ITEM'}</div><b>${esc(icon)} ${esc(name)}</b><p>${esc(text)}</p><div class="price">${x.price}G</div><button class="cta" data-action="buy" data-item="${x.id}" data-type="${x.type}" ${bought?'disabled':''}>${bought?'구매 완료':'구매'}</button></div>`;}).join('')}</div></div>`;}

  function renderEvent(r){const ev=r.event,mine=ev.chosenBy?.[state.profileId],run=r.runState[state.profileId];setScreen('event',`<section class="run-stage-v31 event-stage-v31"><div class="run-bg-v31" style="background-image:url('${esc(sceneBg(r))}')"></div><div class="ambient-grid-v31"></div><div class="run-shade-v31"></div>${compactRunHud(r,run)}<main class="event-center-v31"><div class="event-visual-card-v31"><div class="event-orb-v31"><i></i><b>◇</b></div><small>UNKNOWN SIGNAL</small><h1>${esc(ev.title)}</h1><p>${esc(shortLine(ev.text,58))}</p><div class="event-grid-v31 visual-event-grid-v31">${ev.choices.map(c=>`<button data-action="event-choice" data-choice="${esc(c.id)}" ${mine?'disabled':''} title="${esc(c.desc)}"><span>${choiceGlyph(c.id)}</span><b>${esc(c.label)}</b><small>${esc(shortLine(c.desc,26))}</small></button>`).join('')}</div>${mine?'<div class="tap-hint-v31">WAITING…</div>':''}</div></main></section>`);}
  function renderEnd(r){const clear=r.status==='cleared';setScreen('end',`<section class="event-screen"><div class="event-card"><div class="event-sigil">${clear?'♛':'☒'}</div><div class="section-label">${clear?'50F DUNGEON CLEAR':'EXPEDITION ENDED'}</div><h1>${esc(r.reward?.title||'원정 종료')}</h1><p>${esc(r.reward?.text||'')}</p><div class="stat-grid">${r.players.map(p=>{const run=r.runState[p.id];return `<div class="stat-box"><b>${esc(p.nickname)}</b><small>도달 ${r.floor}F · 덱 ${run?.runDeck?.length||0} · 아이템 ${Object.keys(run?.items||{}).length}</small></div>`;}).join('')}</div><div class="modal-actions" style="justify-content:center"><button class="cta mint" data-action="finish-run">홈으로 돌아가기</button></div></div></section>`);}

  function renderCollection(){state.deckDraft=[...(state.profile.deck||[])];state.collectionPage=0;renderCollectionInner();}
  function renderCollectionInner(){
    const q=state.collectionSearch.trim().toLowerCase();let cards=state.meta.cards.filter(c=>(state.collectionFilter==='all'||state.collectionFilter===c.rarity||state.collectionFilter===c.type)&&(!q||c.name.toLowerCase().includes(q)||c.element.toLowerCase().includes(q)||c.text.toLowerCase().includes(q)));const pageSize=60,pages=Math.max(1,Math.ceil(cards.length/pageSize));state.collectionPage=Math.max(0,Math.min(state.collectionPage,pages-1));const view=cards.slice(state.collectionPage*pageSize,(state.collectionPage+1)*pageSize);
    setScreen('collection',`<section class="page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">ARCHIVE & DECK · 315 CARD CATALOG</div><h1>카드 보관함</h1><p>여행에서 봉인하거나 복각 소환으로 영구 획득한 카드만 던전 시작 덱에 편성할 수 있습니다.</p></div><div class="right"><b>${state.profile.ownedCount}/${state.profile.totalCards}</b></div></div><div class="collection-toolbar"><div class="filter-row">${[['all','전체'],['unit','유닛'],['spell','스펠'],['common','일반'],['rare','희귀'],['ultra','초희귀'],['legendary','전설'],['mythic','신화']].map(([k,n])=>`<button class="filter-btn ${state.collectionFilter===k?'active':''}" data-action="filter" data-filter="${k}">${n}</button>`).join('')}</div><input class="search-input" id="collectionSearch" value="${esc(state.collectionSearch)}" placeholder="카드 이름 / 속성 / 효과 검색"></div><div class="collection-layout"><div><div class="collection-grid">${view.map(c=>{const count=state.profile.collection[c.id]||0,inDeck=state.deckDraft.includes(c.id);return `<button class="collection-card ${count?'':'unowned'} ${inDeck?'selected':''}" ${count?'data-action="deck-toggle"':''} data-card-id="${c.id}"><div class="card-art"><img src="${esc(c.art)}" loading="lazy" alt=""></div>${count?`<span class="origin-badge-v32 origin-${esc(state.profile.cardOrigins?.[c.id]||'legacy')}">${originLabel(state.profile.cardOrigins?.[c.id])}</span>`:''}<b class="rarity-${c.rarity}">${esc(c.name)}</b><p>${esc(c.text)}</p><span class="owned-count">${count?`×${count}`:'미획득'}</span></button>`;}).join('')}</div><div class="pagination"><button class="cta" data-action="page-prev" ${state.collectionPage===0?'disabled':''}>←</button><span>${state.collectionPage+1}/${pages} · 검색 결과 ${cards.length}종</span><button class="cta" data-action="page-next" ${state.collectionPage>=pages-1?'disabled':''}>→</button></div></div><aside class="deck-panel"><div class="section-label">STARTER DECK</div><h2>원정 시작 덱</h2><p>여행/복각으로 영구 획득한 카드만 편성됩니다. 선택한 카드로 던전 시작 덱을 만듭니다.</p><div class="deck-count">${state.deckDraft.length}/16종</div><div class="deck-list">${state.deckDraft.map(id=>{const c=byId(state.meta.cards,id);return `<div class="deck-row"><b class="rarity-${c?.rarity||'common'}">${esc(c?.name||id)}</b><button data-action="deck-remove" data-card-id="${id}">×</button></div>`;}).join('')}</div><button class="cta mint" style="width:100%" data-action="deck-save" ${state.deckDraft.length<8?'disabled':''}>덱 저장</button><p class="small-note">최소 8종 · 최대 16종</p></aside></div></section>`);
  }
  function toggleDeck(cardId){const i=state.deckDraft.indexOf(cardId);if(i>=0){if(state.deckDraft.length<=8)return toast('덱은 최소 8종이 필요합니다.','error');state.deckDraft.splice(i,1);}else{if(state.deckDraft.length>=16)return toast('덱은 최대 16종까지 편성할 수 있습니다.','error');state.deckDraft.push(cardId);}renderCollectionInner();sound('click');}
  async function saveDeck(){if(state.deckDraft.length<8)return toast('덱에 최소 8종을 넣어 주세요.','error');try{const d=await api('/api/deck',{body:{profileId:state.profileId,nickname:state.profile.nickname,deck:state.deckDraft}});state.profile=d.profile;updateTopbar();toast('시작 덱을 저장했습니다.','good');sound('win');renderCollectionInner();}catch(e){toast(e.message,'error');}}

  function renderGacha(){const b=state.meta.banner,featured=b.featured.map(id=>byId(state.meta.cards,id)).filter(Boolean);setScreen('gacha',`<section class="gacha-page"><div class="gacha-hero"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">RERUN ARCHIVE</div><h1>복각 소환</h1><p>현재 기간에 열린 복각 카드를 노릴 수 있습니다. 일반 여행에서는 한정 카드가 등장하지 않습니다.</p></div></div><div class="gacha-banner"><div class="gacha-copy"><div class="section-label">LIMITED BANNER</div><h1>${esc(b.name)}</h1><p>${esc(b.subtitle)}. 높은 등급이 나왔을 때 픽업 카드가 등장할 확률이 상승합니다. 중복 카드는 잔광으로 환급됩니다.</p><div class="rate-table">${Object.entries(b.rates).reverse().map(([k,v])=>`<div class="rate-cell"><b class="rarity-${k}">${esc(rarityKo(k))}</b>${(v*100).toFixed(1)}%</div>`).join('')}</div><div class="pity">전설 천장 ${state.profile.pity.legendary}/${b.pity.legendary} · 신화 천장 ${state.profile.pity.mythic}/${b.pity.mythic}</div><div class="banner-actions"><button class="cta" data-action="gacha-pull" data-count="1">1회 · ◆${b.singleCost}</button><button class="cta gold" data-action="gacha-pull" data-count="10">10회 · ◆${b.tenCost}</button></div></div><div class="gacha-art">${featured.map(c=>cardHtml(c)).join('')}</div></div></div></section>`);}
  async function doGacha(count){if(state.busy)return;setBusy(true);try{const d=await api('/api/gacha/pull',{body:{profileId:state.profileId,nickname:state.profile.nickname,count:Number(count)}});state.profile=d.profile;updateTopbar();showPull(d.results);}catch(e){toast(e.message,'error');sound('error');}finally{setBusy(false);}}
  function showPull(results){const sorted=[...results].sort((a,b)=>(state.meta.rarities[b.rarity]?.order||0)-(state.meta.rarities[a.rarity]?.order||0));const top=sorted[0];sound(top?.rarity==='mythic'||top?.rarity==='legendary'?'gacha':'card');modalRoot.innerHTML=`<div class="pull-result"><div class="pull-result-inner"><div class="summon-orb"></div><div class="section-label">ARCHIVE UNSEALED</div><div class="pull-cards">${results.map((c,i)=>cardHtml(c).replace('class="game-card',`style="animation-delay:${Math.min(i*.07,.7)}s" class="game-card`)).join('')}</div><button class="cta mint close-pull" data-action="close-pull">확인</button></div></div>`;}

  function renderProfile(){
    const s=state.profile.stats||{},cloud=!!state.profile.cloud,account=state.profile.accountId||state.auth.user?.accountId||'';
    setScreen('profile',`<section class="page profile-page"><div class="page-head"><button class="back-btn" data-action="home">← 홈</button><div><div class="section-label">EXPLORER RECORD · ${cloud?'CLOUD SYNC':'GUEST'}</div><h1>탐험 기록</h1></div></div><div class="profile-card"><div class="big-avatar">${esc(state.profile.nickname.slice(0,1))}</div><div><div class="account-line"><span class="cloud-state ${cloud?'on':'off'}">${cloud?'● CLOUD SAVE':'○ GUEST SAVE'}</span>${cloud?`<span>@${esc(account)}</span>`:''}</div><h1>${esc(state.profile.nickname)}</h1><p>${cloud?'이 기록은 Supabase 계정에 연결되어 있습니다. 카드·재화·덱·천장·던전 기록이 서버에 저장됩니다.':'현재 게스트 상태입니다. 로그인 계정을 만들면 현재 진행 기록을 클라우드 계정으로 옮길 수 있습니다.'}</p><div class="field"><input id="nicknameEdit" maxlength="14" value="${esc(state.profile.nickname)}"><button class="cta" data-action="rename">닉네임 변경</button></div><div class="profile-settings"><button class="setting-chip ${state.fx?'on':''}" data-action="fx">✦ 전투 이펙트 ${state.fx?'ON':'OFF'}</button><button class="setting-chip ${state.sound?'on':''}" data-action="sound">♪ 사운드 ${state.sound?'ON':'OFF'}</button>${cloud?'<button class="setting-chip danger" data-action="logout">로그아웃</button>':'<button class="setting-chip" data-action="open-auth">클라우드 로그인</button>'}</div><div class="stat-grid"><div class="stat-box"><b>${s.dungeonClears||0}</b><small>총 던전 클리어</small></div><div class="stat-box"><b>${s.bestDungeonFloor||0}F</b><small>던전 최고층</small></div><div class="stat-box"><b>${s.cardsCaught||0}</b><small>여행 봉인 성공</small></div><div class="stat-box"><b>${s.gachaPulls||0}</b><small>복각 소환</small></div><div class="stat-box"><b>${s.bosses||0}</b><small>보스 격파</small></div><div class="stat-box"><b>${s.perfectBattles||0}</b><small>노데미지 전투</small></div><div class="stat-box"><b>${s.bestChain||0}</b><small>최고 전술 연쇄</small></div><div class="stat-box"><b>${s.overdrives||0}</b><small>오버드라이브</small></div><div class="stat-box"><b>${s.journeys||0}</b><small>일반 여행</small></div><div class="stat-box"><b>${s.dungeons||0}</b><small>던전 원정</small></div><div class="stat-box"><b>${state.profile.ownedCount}</b><small>보유 카드 종류</small></div></div><div class="difficulty-records">${['normal','hard','hell'].map(k=>`<div class="record-card"><b class="diff-pill ${k}">${difficultyKo(k)}</b><span>${s[`${k}Clears`]||0} CLEAR</span><small>최고 ${s[`best${k[0].toUpperCase()+k.slice(1)}Floor`]||0}F</small></div>`).join('')}</div>${(state.profile.history||[]).length?`<div class="history-panel"><div class="section-label">RECENT EXPEDITIONS · CLOUD HISTORY</div>${(state.profile.history||[]).slice(0,8).map(h=>`<div class="history-row ${h.result==='clear'?'clear':'defeat'}"><b>${h.result==='clear'?'CLEAR':'ENDED'} · ${h.mode==='dungeon'?difficultyKo(h.difficulty):'일반 여행'}</b><span>${h.floor}F</span><small>${new Date(h.endedAt).toLocaleDateString('ko-KR')} · 카드 +${h.cardsAdded||0} · 아이템 +${h.itemsAdded||0}</small></div>`).join('')}</div>`:''}</div></div></section>`);
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
      if(action==='auth-profile-mode'){state.authProfileMode=el.dataset.mode==='guest'?'guest':'cloud';return renderAuth();}
      if(action==='auth-cancel'){state.authFromGuest=false;return renderProfile();}
      if(action==='guest-enter'){state.guestMode=true;localStorage.setItem('riftdeck.guestMode','1');state.profileId=state.guestProfileId;if(!state.nickname)state.nickname='방랑자';await loadProfile();toast('게스트로 시작합니다. 계정을 만들면 현재 기록을 이어받을 수 있습니다.','good');return renderHome();}
      if(action==='open-auth'){state.authMode='login';state.authFromGuest=!!state.profile&&!state.profile.cloud;state.authProfileMode='cloud';return renderAuth();}
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
      if(action==='contract-pick'){el.classList.add('v26-committed');await wait(120);return roomPost('contract',{contractId:el.dataset.contractId});}
      if(action==='route-vote'){el.classList.add('v26-committed');await wait(100);return roomPost('vote',{nodeId:el.dataset.node});}
      if(action==='select-enemy'){state.selectedEnemy=el.dataset.enemy;return renderBattle(state.room);}
      if(action==='toggle-combat-log'){state.combatLogOpen=!state.combatLogOpen;return renderBattle(state.room);}
      if(action==='run-info')return showRunInfo();
      if(action==='open-forge')return showForgeMenu();
      if(action==='open-purge')return showPurgeMenu();
      if(action==='play-card'){
        if(state.busy)return;const me=state.room.battle.party.find(p=>p.playerId===state.profileId);if(me?.ended)return;const index=Number(el.dataset.index),base=byId(state.meta.cards,me.hand[index]),run=state.room.runState[state.profileId],card=runCardView(base,run),target=state.selectedEnemy?$(`[data-enemy="${CSS.escape(state.selectedEnemy)}"]`):null;if(!card)return;
        await cardCastWindup(el,card,target);const d=await roomPost('play',{handIndex:index,targetUid:state.selectedEnemy});if(d.room?.status==='reward')sound('win');return;
      }
      if(action==='end-turn'){const b=state.room?.battle,active=b?.party?.filter(p=>!p.down&&!p.ended)||[];if(active.length<=1)showCenterBanner('ENEMY','','enemy');return roomPost('end-turn',{});}
      if(action==='reward-pick'){await roomPost('reward',{rewardId:el.dataset.rewardId});await loadProfile();sound('reward');return renderRoom();}
      if(action==='reward-salvage'){await roomPost('salvage',{});sound('reward');return renderRoom();}
      if(action==='relic-pick'){await roomPost('relic',{relicId:el.dataset.relicId});sound('reward');return renderRoom();}
      if(action==='camp-rest'){const d=await roomPost('camp',{mode:'rest'});toast(d.result.label,'good');return renderRoom();}
      if(action==='camp-meditate'){const d=await roomPost('camp',{mode:'meditate'});toast(d.result.label,'good');return renderRoom();}
      if(action==='camp-upgrade'){closeModal();const d=await roomPost('camp',{mode:'upgrade',cardId:el.dataset.cardId});toast(d.result.label,'good');sound('reward');return renderRoom();}
      if(action==='trim-deck'){closeModal();const d=await roomPost('trim',{cardId:el.dataset.cardId});toast(`덱 정제 · ${d.result.cardName} 제거 · ${d.result.cost}G`,'good');return renderRoom();}
      if(action==='reward-reroll'){const d=await roomPost('reroll',{});toast(`보상 재굴림 · ${d.result.cost}G 사용`,'good');return;}
      if(action==='reward-reroll-fragment'){await roomPost('reroll-fragment',{});toast('균열 파편 1개로 보상을 재굴림했습니다.','good');return;}
      if(action==='reward-continue')return roomPost('continue',{});
      if(action==='capture'){const d=await roomPost('capture',{sealType:el.dataset.seal});await loadProfile();toast(d.result.success?'봉인 성공! 카드가 컬렉션에 등록되었습니다.':d.result.escaped?'봉인 실패. 흔적이 사라졌습니다.':'봉인 실패. 아직 흔적이 남았습니다.',d.result.success?'good':'error');return renderRoom();}
      if(action==='capture-pass'){await roomPost('capture-pass',{});return renderRoom();}
      if(action==='event-choice')return roomPost('event',{choiceId:el.dataset.choice}).then(()=>loadProfile());
      if(action==='buy'){await roomPost('buy',{itemId:el.dataset.item,itemType:el.dataset.type});await loadProfile();return renderRoom();}
      if(action==='filter'){state.collectionFilter=el.dataset.filter;state.collectionPage=0;return renderCollectionInner();}
      if(action==='page-prev'){state.collectionPage--;return renderCollectionInner();}
      if(action==='page-next'){state.collectionPage++;return renderCollectionInner();}
      if(action==='deck-toggle'||action==='deck-remove')return toggleDeck(el.dataset.cardId);
      if(action==='deck-save')return saveDeck();
      if(action==='gacha-pull')return doGacha(el.dataset.count);
      if(action==='close-pull'){closeModal();return state.current==='gacha'?renderGacha():renderHome();}
      if(action==='modal-close'){closeModal();return;}
      if(action==='rename')return renameProfile();
      if(action==='resume-room')return resumeRoom();
      if(action==='finish-run')return finishRun();
      if(action==='save-name'){const name=$('#firstNickname')?.value?.trim();if(!name)return toast('닉네임을 입력해 주세요.','error');state.nickname=name;localStorage.setItem('riftdeck.nickname',name);closeModal();await loadProfile();return renderHome();}
      if(action==='sound'){state.sound=!state.sound;localStorage.setItem('riftdeck.sound',state.sound?'on':'off');updateTopbar();if(state.current==='profile')renderProfile();return;}
    }catch(err){toast(err?.message||'요청 처리 중 오류가 발생했습니다.','error');sound('error');}
  });
  document.addEventListener('contextmenu',e=>{const card=e.target.closest('.game-card');if(!card)return;e.preventDefault();showCardInspect(card.dataset.cardId);});
  let inspectHoldTimer=0;
  document.addEventListener('pointerdown',e=>{const card=e.target.closest('.game-card');if(!card||e.pointerType==='mouse')return;clearTimeout(inspectHoldTimer);inspectHoldTimer=setTimeout(()=>showCardInspect(card.dataset.cardId),520);},{passive:true});
  document.addEventListener('pointerup',()=>clearTimeout(inspectHoldTimer),{passive:true});
  document.addEventListener('pointercancel',()=>clearTimeout(inspectHoldTimer),{passive:true});

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
