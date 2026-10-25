import {skillButtonPalette} from './combat-vfx-v6.js';
import {adventurePanel,storyTrackHTML} from './adventure-ui.js';
import {rpgPanel,enhancementRows} from './rpg-ui.js';
import {freePoints,ATTRIBUTE_KEYS,MAX_ATTRIBUTE,resetPrice,spentPoints,enhancementBonus} from '../shared/rpg.js';
import { expansionPanel, timeLeft } from './expansion-ui.js';
import { Auth, Network } from './net.js';
import { Renderer } from './render.js?v=combat-kits-v6-art';
import { Sound } from './audio.js';
import { CLASSES, ITEMS, RARITIES, MONSTERS, QUESTS, ZONES, NPCS, RECIPES, SHOP, xpRequired, objectiveLabel, weaponFor, MAX_LEVEL } from '../shared/content.js';
import { dist, clamp } from '../shared/world.js';
import { KEY_ACTIONS, createKeybindings, formatKey } from './keybindings.js';
import { challengesPanel, challengeHUD } from './challenges-ui.js';
import { dungeonsPanel, dungeonHUD } from './dungeons-ui.js';
import { realmsPanel, realmHUD } from './realms-ui.js';
import {encounterDescription} from './encounters-ui.js';
import {creatureHitTest} from './creatures.js';
import {TITLE_CATALOG,HIDDEN_TITLES,titleInfo,titleProgress,titleStatLabel} from '../shared/title-catalog.js';
import {enhancementSpec} from '../shared/rpg.js';
import {EnhancementCinema} from './enhance-fx.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name,cls='')=>`<img class="${cls}" src="/assets/icon_${esc(name)}.png" alt="">`;
const imgHero=cls=>`/assets/${cls}_s_0.png`;
const show=(id,on=true)=>$(id).classList.toggle('hidden',!on);
const setText=(id,s)=>{if($(id)?.textContent!==String(s))$(id).textContent=s;};
const money=n=>Math.round(n||0).toLocaleString('ko-KR');
const renderer=new Renderer($('world')),sound=new Sound();
const forgeCinema=new EnhancementCinema();
let config,auth,net,profile=null,state=null,selectedClass='novice',inGame=false,modal=null,modalTab='all',selectedItem=null;
let keys=new Set(),joystick={x:0,y:0},attackHeld=false,autoAttack=false,lastInputAt=0,lastAttackAt=0,lastHUD=0,lastMini=0;
let pendingInteract=null,lastInteractAt=0,lastErrorAt=0,wasOnline=false,lastProfileSignature='',lastModalSignature='';
let busy=new Set(),settings={sfx:true,music:false,effects:true,fxStyle:'v6',zoom:1,lowPower:false,shake:false},mutedPlayers=new Set();
let statDraft={},lastPortraitKey='',previousTitleNames=null,showAllForgeRecipes=false,titleSearch='';
let jobBookData=null,eventList=[],lastSentInput={x:0,y:0},inputSeq=0;
let accountMode='login',lastFocused=null,firstConnection=true,uiRefreshNeeded=false,lastStateAt=0;
const keybindings=createKeybindings(),capturedKeyUps=new Set();
let keyCapture=null,keyStatus='',keyStatusTone='';
try{settings={...settings,...JSON.parse(localStorage.getItem('starfall.settings')||'{}')};}catch{}
try{mutedPlayers=new Set(JSON.parse(localStorage.getItem('starfall.muted')||'[]'));}catch{}
function applySettings(){
  sound.sfx=settings.sfx? .28:0;sound.music=settings.music? .6:0;
  renderer.showEffects=settings.effects;renderer.fxStyle=settings.fxStyle==='classic'?'classic':'v6';renderer.setManualLowPower(!!settings.lowPower);renderer.shakeEnabled=!!settings.shake;renderer.zoomSetting=Number(settings.zoom)||1;renderer.resize();
  try{localStorage.setItem('starfall.settings',JSON.stringify(settings));}catch{}
}
applySettings();
function notice(message,tone='info',duration=4200){
  if(!message)return;
  const div=document.createElement('div');div.className='notice '+tone;div.textContent=message;
  $('notices').append(div);while($('notices').children.length>4)$('notices').firstChild.remove();
  setTimeout(()=>div.remove(),duration);
  if(!inGame){$('start-note').textContent=message;if(modal&&$('auth-status'))$('auth-status').textContent=message;}
}
function renderKeybindingsSettings(){
  const groups=[...new Set(KEY_ACTIONS.map(a=>a.group))];
  const message=keyStatus||(keyCapture
    ? `${KEY_ACTIONS.find(a=>a.id===keyCapture.id).label} · ${keyCapture.slot===0?'주 키':'보조 키'}: 원하는 키를 누르세요. ${keyCapture.id==='settings'?'Esc도 등록할 수 있습니다. 취소하려면 아래 취소 버튼을 누르세요.':'Esc로 취소합니다.'}`
    : '바꿀 키를 선택한 뒤 원하는 키를 한 번 누르세요.');
  return `<div class="keybind-intro"><p>주 키와 보조 키 중 어느 쪽으로도 같은 동작을 할 수 있습니다. 변경 즉시 적용되며 이 브라우저에 자동으로 저장됩니다.</p><p class="small muted">한글·영문 입력 상태와 관계없이 키보드 위치를 사용합니다. Esc는 창 닫기·입력 취소에 사용하며 설정 열기에도 지정할 수 있습니다. 채팅 중 Enter는 전송에 사용합니다. Ctrl·Alt·Meta 조합과 기능키는 지정할 수 없습니다.</p></div>
    <div class="keybind-status ${keyStatusTone||(keyCapture?'listening':'')}" role="status" aria-live="polite">${esc(message)}</div>
    ${keyCapture?'<button class="btn small" data-act="cancelKey">키 입력 취소</button>':''}
    ${groups.map(group=>`<section class="keybind-group"><h3>${esc(group)}</h3><div class="keybind-head"><span>동작</span><span>주 키</span><span>보조 키</span></div>${KEY_ACTIONS.filter(a=>a.group===group).map(a=>`<div class="keybind-row"><span class="keybind-name">${esc(a.label)}</span>${keybindings.get(a.id).map((code,slot)=>{
      const active=keyCapture?.id===a.id&&keyCapture.slot===slot;
      return `<div class="keybind-slot"><button type="button" class="keybind-key ${active?'listening':''}" data-act="bindKey" data-id="${a.id}" data-slot="${slot}" aria-pressed="${active}" aria-label="${esc(a.label)} ${slot===0?'주 키':'보조 키'}: ${esc(formatKey(code))}">${active?'키 입력…':esc(formatKey(code))}</button><button type="button" class="keybind-clear" data-act="clearKey" data-id="${a.id}" data-slot="${slot}" aria-label="${esc(a.label)} ${slot===0?'주 키':'보조 키'} 해제" title="이 키 해제" ${code?'':'disabled'}>×</button></div>`;
    }).join('')}</div>`).join('')}</section>`).join('')}
    <div class="keybind-footer"><button class="btn small danger" data-act="resetKeys">전체 기본값 복원</button><button class="btn small" data-act="openSettings">설정으로 돌아가기</button></div>`;
}
function redrawKeybindings(focusId,slot=0){
  if(modal!=='keybindings')return;
  const scroll=$('modal-content').scrollTop;
  renderPanel();
  $('modal-content').scrollTop=scroll;
  if(focusId)$('modal-content').querySelector(`[data-act="bindKey"][data-id="${focusId}"][data-slot="${slot}"]`)?.focus({preventScroll:true});
}
function cancelKeyCapture(redraw=true){
  if(!keyCapture)return;
  const previous=keyCapture;keyCapture=null;keyStatus='키 변경을 취소했습니다.';keyStatusTone='';
  if(redraw)redrawKeybindings(previous.id,previous.slot);
}
function syncKeyHints(){
  for(const b of document.querySelectorAll('.hud-dock [data-panel]')){
    const id=b.dataset.panel,a=KEY_ACTIONS.find(a=>a.id===id);
    if(!a)continue;
    b.title=`${a.label} (${keybindings.label(id)})`;
    const kbd=b.querySelector('kbd');if(kbd)kbd.textContent=keybindings.primaryLabel(id);
  }
  const interact=$('interact-hint')?.querySelector('kbd');if(interact)interact.textContent=keybindings.primaryLabel('interact');
  const journal=$('journal-open')?.querySelector('span');if(journal)journal.textContent=keybindings.primaryLabel('journal');
  $('chat-input').placeholder=keybindings.get('chat').some(Boolean)?`${keybindings.label('chat')}로 이야기하기`:'눌러서 이야기하기';
  renderAbilities();if(profile)renderTracker();if(state&&profile)updateHUD();
}
function finishKeyEdit(result,message,focusId,slot=0){
  keyCapture=null;resetControls();
  keyStatus=result.saved?message+' 이 브라우저에 저장했습니다.':message+' 브라우저 저장을 사용할 수 없어 이번 접속 동안만 유지됩니다.';
  keyStatusTone=result.saved?'success':'warn';
  syncKeyHints();redrawKeybindings(focusId,slot);
}
async function action(data,{silent=false,suppressMessage=false}={}){
  if(!net?.connected)return {ok:false};
  const key=data.type+':'+(data.id||data.skill||'');
  if(busy.has(key))return {ok:false,quiet:true};
  busy.add(key);
  const result=await net.action(data);busy.delete(key);
  if(result?.error&&!result.quiet&&!silent&&performance.now()-lastErrorAt>900){notice(result.error,'warn');lastErrorAt=performance.now();}
  if(result?.message&&!suppressMessage)notice(result.message,result.tone||'success');
  if(result?.ok)uiRefreshNeeded=true;
  return result||{ok:false};
}
function resetControls(){
  keys.clear();joystick={x:0,y:0};attackHeld=false;pendingInteract=null;
  renderer.lastInput={x:0,y:0};renderer.stopMotion();resetKnob();
  sendInput({x:0,y:0,stop:true});
}
function profileChanged(p){
  const previousClass=profile?.classId;
  profile=p;renderer.profile=p;
  // Compare actual server-issued title collections; never trust browser awards.
  const newNames=previousTitleNames?p.titles.filter(t=>!previousTitleNames.has(t)):[];
  previousTitleNames=new Set(p.titles);
  if(newNames.length&&inGame)queueTitleUnlocks(newNames);
  const sig=JSON.stringify([p.inventory,p.equipment,p.enhancements,p.quests,p.completed,p.level,p.gold,p.titles,p.title,p.classId,p.discovery,p.journey,p.atlas,p.storyTracker,p.daily,p.challenges,p.dungeons,p.realms,p.attributes,p.enhancePity,p.deathWeakUntil,p.soul]);
  if(previousClass&&previousClass!==p.classId)renderAbilities();
  const portraitKey=JSON.stringify([p.equipment,p.enhancements]);
  if(portraitKey!==lastPortraitKey){lastPortraitKey=portraitKey;$('portrait').src=renderer.avatarURL(p);}
  if(sig!==lastProfileSignature){lastProfileSignature=sig;uiRefreshNeeded=true;renderTracker();}
}
const titleAwardQueue=[];
let titleAwardTimer=null;
function queueTitleUnlocks(names){
  // Bursty awards (e.g. crossing several milestones) are grouped for readability.
  const entries=names.length>3?[...names.slice(0,2),`외 ${names.length-2}개 칭호 추가 획득`]:names;
  titleAwardQueue.push(...entries);
  if(!titleAwardTimer)showNextTitleAward();
}
function showNextTitleAward(){
 const name=titleAwardQueue.shift();
 if(!name){titleAwardTimer=null;return;}
 const data=titleInfo(name),root=document.getElementById('title-award')||document.createElement('div');
 root.id='title-award';root.className=`title-award rarity-${data.rarity}`;
 root.setAttribute('role','status');root.setAttribute('aria-live','polite');
 root.innerHTML=`<span aria-hidden="true">✦</span><div><small>새로운 칭호 획득</small><b>${esc(name)}</b></div>`;
 if(!root.isConnected)document.body.appendChild(root);
 // Remove the node explicitly. A legendary neon keyframe can otherwise override
 // the CSS opacity of the previous dismiss class and leave the popup on screen.
 titleAwardTimer=setTimeout(()=>{
  root.remove();titleAwardTimer=setTimeout(showNextTitleAward,150);
 },3000);
}

function beginGame(p,local){
  const first=!inGame;
  profileChanged(p);inGame=true;show('landing',false);show('creator',false);show('game-ui');
  show('dev-ribbon',local);show('connection-overlay',false);renderAbilities();
  $('portrait').src=renderer.avatarURL(p);
  sound.zone=p.zone;renderer.start();
  if(first){
    zoneToast(p.zone);
    // Tutorial and account hints already appear in the HUD/toasts, not chat.
    if(matchMedia('(pointer:coarse)').matches||innerWidth<700)$('chat').classList.add('collapsed');
  }
}
function zoneToast(zone){
  sound.zone=zone;$('zone-toast').innerHTML=`<h2>${esc(ZONES[zone].name)}</h2><p>${esc(ZONES[zone].subtitle)}</p>`;
  show('zone-toast');$('zone-toast').style.animation='none';void $('zone-toast').offsetHeight;$('zone-toast').style.animation='';
  setTimeout(()=>show('zone-toast',false),3700);
}
async function connectGame(){
  if(net?.connected)return;
  sound.start();$('start').disabled=true;$('start').textContent='모험의 길을 여는 중…';
  try{
    let provider;
    if(config.devGuest){
      let id=localStorage.getItem('starfall.dev-id');
      if(!id){id=crypto.randomUUID();localStorage.setItem('starfall.dev-id',id);}
      provider=async()=>({devId:id});
    }else{
      let session=await auth.getSession();
      if(!session)session=await auth.anonymous();
      provider=async()=>{const s=await auth.getSession();if(!s)throw new Error('다시 로그인해 주세요.');return {token:s.access_token};};
    }
    net?.disconnect();net=new Network(provider);
    net.on('connect',()=>{
      inputSeq=0;renderer.motion.history=[];wasOnline=true;show('connection-overlay',false);
      if(inGame){notice('서버 연결이 복구되었습니다.','success');resetControls();}
    });
    net.on('connect_error',e=>{
      $('start').disabled=false;$('start').innerHTML='다시 접속 <span>↗</span>';
      notice(e.message,'warn',7000);
      if(inGame){show('connection-overlay');$('connection-overlay').innerHTML=`<h3>연결을 확인해 주세요</h3><p>${esc(e.message)}</p><button class="btn primary" data-act="reload">다시 접속</button>`;}
    });
    net.on('welcome',e=>{
      $('start').disabled=false;
      if(e.existing){beginGame(e.profile,e.local);closeModal();}
      else{show('landing',false);show('creator');renderClasses();}
    });
    net.on('state',s=>{
      lastStateAt=performance.now();
      if(!inGame)return;
      const changed=state?.zone&&state.zone!==s.zone;
      if(s.events)eventList=s.events;
      state=s;if(s.profile)profileChanged(s.profile);
      if(modal==='dungeons'||modal==='realms')uiRefreshNeeded=true;
      renderer.setState(s);if(changed)zoneToast(s.zone);
      if(changed){pendingInteract=null;closeModal();resetControls();}
    });
    net.on('zone',e=>{if(profile)profileChanged(e.profile);});
    net.on('notice',e=>notice(e.message,e.tone));
    net.on('fx',e=>{
      renderer.addEffect(e);
      if(e.type==='hit'&&e.by===profile?.id)sound.play('hit');
      if(e.type==='hit'&&e.kind==='player'&&e.id===profile?.id)sound.play('hurt');
      if(e.type==='attack'&&e.id===profile?.id&&e.skill!=='basic')sound.play('cast');
      if(e.type==='level'&&e.id===profile?.id)sound.play('level');
      if(e.type==='impact'&&e.boss)sound.play('boss');
    });
    net.on('loot',loot);
    net.on('deathSummary',e=>{statDraft={};openPanel('deathSummary',e);});
    net.on('enhanceResult',()=>{ /* Presentation waits for the authoritative action acknowledgement. */ });
    net.on('jobBook',book=>{jobBookData=book;if(modal==='jobs')refreshPanel();});
    net.on('jobUnlocked',()=>{if(modal==='jobs')action({type:'jobs'});sound.play('level');});
    net.on('jobChanged',()=>{action({type:'jobs'});sound.play('level');});
    net.on('relicRead',data=>openPanel('relic',data));
    net.on('storyView',data=>{
      if(modal==='story'&&window._modalData?.id===data.id){window._modalData=data;refreshPanel();}
      else openPanel('story',data);
    });
    net.on('atlasScene',data=>openPanel('atlasScene',data));
    net.on('warpstoneView',data=>openPanel('warpstone',data));
    net.on('dungeonInfo',data=>openPanel('dungeons',data));
    net.on('dungeonResult',()=>{uiRefreshNeeded=true;sound.play('level');});
    net.on('realmScene',data=>{
      if(data.refreshOnly){if(modal==='realms'){window._modalData=data;uiRefreshNeeded=true;}return;}
      openPanel('realms',data);
    });
    net.on('worldNotice',data=>{addChat({channel:'system',text:data.message,important:true});notice(data.message,'info',8500);});
    net.on('dialog',e=>{const npc=NPCS.find(n=>n.id===e.npc);if(npc)openPanel(npc.kind==='quest'?'npcQuest':npc.kind==='shop'?'shop':npc.kind==='craft'?'craft':npc.kind==='jobs'?'jobs':'healer');});
    net.on('chat',msg=>{if(!mutedPlayers.has(msg.playerId))addChat(msg);});
    net.on('system',e=>{if(e.category==='worldBoss')addChat({channel:'system',text:e.message,important:true});});
    net.on('saved',e=>{setText('save-state',e.local?'개발 저장 완료':'서버 저장 완료');$('save-state').style.color='#a6c49a';});
    net.on('saveError',e=>{setText('save-state','저장 재시도 중');$('save-state').style.color='#e3b58f';notice(e.message,'warn',8000);});
    net.on('questComplete',e=>{
      sound.play('level');openPanel(e.final?'ending':'questReward',e);
    });
    net.on('partyInvite',e=>{
      const n=document.createElement('div');n.className='notice';
      n.innerHTML=`${esc(e.name)} 님의 파티 초대 <button class="btn small primary" data-act="partyAccept">수락</button>`;
      $('notices').append(n);setTimeout(()=>n.remove(),30000);
    });
    net.on('disconnect',()=>{
      cancelKeyCapture();resetControls();if(inGame)show('connection-overlay');
    });
    net.on('replaced',e=>{
      net.stopped=true;resetControls();show('connection-overlay');
      $('connection-overlay').innerHTML=`<h3>다른 창에서 접속했습니다</h3><p>${esc(e.message)}</p><button class="btn" data-act="reload">이 창에서 다시 접속</button>`;
    });
    net.on('authExpired',()=>{net.stopped=true;notice('인증이 만료되었습니다. 새로고침 후 다시 로그인해 주세요.','warn');});
    net.on('fatal',e=>{
      notice(e.message,'warn',10000);net.stopped=true;net.disconnect();
      $('start').disabled=false;
      if(!inGame){show('landing');show('creator',false);$('start-note').textContent=e.message;}
    });
    await net.connect();
  }catch(e){
    $('start').disabled=false;$('start').innerHTML='모험 시작 <span>↗</span>';notice(e.message,'warn',8000);
  }
}
function renderClasses(){
  selectedClass='novice';
  $('class-list').innerHTML=`<div class="novice-intro"><img src="${imgHero('novice')}" alt="무직 모험가"><div><span class="badge">아직 정해지지 않은 38개의 가능성</span><h3>길 잃은 모험가</h3><p>처음에는 직업을 고르지 않습니다.<br>직접 싸우고, 채집하고, 유물을 발견하며 나만의 길을 찾으세요.</p><small>일반 9 · 희귀 12 · 영웅 9 · 히든 8<br>마을 남쪽의 스승을 찾아 첫 전직 이야기를 시작하세요.</small></div></div>`;
}
$('class-list').addEventListener('click',e=>{const b=e.target.closest('[data-class]');if(b){selectedClass=b.dataset.class;renderClasses();sound.play('click');}});
$('create-character').addEventListener('click',async()=>{
  const b=$('create-character');if(b.disabled)return;b.disabled=true;
  const result=await net.emit('join',{name:$('character-name').value.trim(),classId:selectedClass});
  b.disabled=false;if(!result?.ok)$('create-error').textContent=result?.error||'캐릭터 생성에 실패했습니다.';
});
$('character-name').addEventListener('keydown',e=>{if(e.key==='Enter')$('create-character').click();});
$('start').addEventListener('click',()=>connectGame());
$('login-open').addEventListener('click',()=>{accountMode='login';openPanel('auth');});
$('modal-close').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
$('minimap-wrap').addEventListener('click',()=>openPanel('map'));
$('journal-open').addEventListener('click',()=>openPanel('journal'));
$('tracker-toggle').addEventListener('click',()=>{
  const b=$('quest-tracker');b.classList.toggle('collapsed');
  $('tracker-toggle').lastElementChild.textContent=b.classList.contains('collapsed')?'+':'−';
});
$('chat-toggle').addEventListener('click',()=>{
  $('chat').classList.toggle('collapsed');
  $('chat-toggle').textContent=$('chat').classList.contains('collapsed')?'+':'−';
});
$('interact-hint').addEventListener('click',()=>action({type:'interact'}));
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
syncKeyHints();

const ROLE_LABELS={cone:'부채꼴',mark:'표식',blast:'폭파',dash:'돌진',combo:'연타',field:'장판',sunder:'방깎',spin:'회전',life:'흡혈',stagger:'경직',pierce:'관통',ignite:'점화',freeze:'빙결',resonance:'음률',chain:'연쇄',pull:'끌기',slow:'둔화',drain:'흡혈',push:'넉백',command:'지휘',delayed:'낙하',healing:'치유',execute:'처형',summon:'소환',counter:'반격',parry:'받기',bastion:'방벽',leap_trap:'덫',smoke:'연막',blink:'순간',aim:'조준',fury:'격노',meditate:'명상',stance:'전환',brew:'조합',rewind:'역행',rebirth:'부활',song:'노래',trap:'지뢰',pet:'소환',turret:'포탑',healing_field:'성역',frost_field:'빙벽',star_field:'별실',lightning_rod:'피뢰',charge:'돌파'};
function renderAbilities(){
  if(!profile)return;
  const c=CLASSES[profile.classId],all=[...c.skills,{id:'dash',name:'별걸음',key:'SHIFT',icon:'boot',unlock:1},{id:'potion',name:'체력',key:'1',icon:'potion',unlock:1},{id:'mana',name:'마나',key:'2',icon:'mana',unlock:1}];
  $('abilities').innerHTML=all.map(s=>{const v=skillButtonPalette(profile.classId,s.id);return `<button class="ability ${s.id==='basic'?'basic':''}" style="--skill-fx:${v.primary};--skill-light:${v.light};--skill-deep:${v.dark}" data-skill="${s.id}" title="${esc(s.desc||s.name)} (${esc(keybindings.label(s.id))})">
    <span class="key">${esc(keybindings.primaryLabel(s.id))}</span>${c.skills.some(v=>v.id===s.id)?`<img src="/assets/skill_${profile.classId}_${s.id}.png?v=v6-art" alt="">`:icon(s.icon)}<span class="skill-name">${esc(s.name)}</span>${s.role&&s.id!=='basic'?`<span class="role-tag">${esc(ROLE_LABELS[s.role]||s.role)}</span>`:''}<span class="count"></span><span class="cd-shade"></span><span class="cd-number"></span></button>`;}).join('');
}
$('abilities').addEventListener('click',e=>{const b=e.target.closest('[data-skill]');if(b)cast(b.dataset.skill);});
function cast(id){
  if(modal||!profile||!net?.connected||state?.dungeon?.inputBlocked)return;
  if(id==='dash'){if((state?.self.cooldowns.dash||0)<=Date.now()+renderer.clock)renderer.predictDash();action({type:'dash'}).then(r=>{if(!r.ok)renderer.motion.dashEnd=0;});}
  else if(['potion','mana'].includes(id))action({type:'use',id});
  else action({type:'attack',skill:id});
}
function renderTracker(){
  if(!profile)return;
  const active=Object.entries(profile.quests||{}),story=storyTrackHTML(profile);
  if(!active.length){
    const complete=profile.completed?.includes('last_star');
    $('tracked-quests').innerHTML=story+`<div class="quest-track"><h4>${complete?'새로운 모험을 기다리며':'리아를 찾아가세요'}</h4><div class="objective">${complete?'장비를 완성하고 다른 모험가를 도와주세요.':`마을 중앙의 별지기에게 ${esc(keybindings.label('interact'))}로 대화하세요.`}</div></div>`;
    return;
  }
  $('tracked-quests').innerHTML=story+active.map(([id,s])=>{
    const q=QUESTS.find(x=>x.id===id);if(!q)return '';
    const ready=q.objectives.every((o,i)=>(s.progress[i]||0)>=o.count);
    return `<div class="quest-track"><h4>${esc(q.name)}</h4>${q.objectives.map((o,i)=>`<div class="objective ${(s.progress[i]||0)>=o.count?'done':''}"><span>${esc(objectiveLabel(o))}</span><span>${s.progress[i]||0}/${o.count}</span></div>`).join('')}${ready?'<div class="quest-ready">✦ 마을의 리아에게 보상을 받으세요</div>':''}</div>`;
  }).join('');
}
function loot(e){
  sound.play('loot');
  const feed=$('loot-feed'),parts=[];
  if(e.gold||e.xp)parts.push(`<span>+${money(e.gold)} G</span><span>+${money(e.xp)} EXP</span>`);
  for(const item of e.items||[]){
    const def=ITEMS[item.id];if(!def)continue;
    const row=document.createElement('div');row.className='loot-line '+(['rare','epic','legendary'].includes(def.rarity)?'rare':'');
    row.innerHTML=`${icon(def.icon)}<span>${esc(def.name)} × ${item.count}</span>`;
    feed.append(row);setTimeout(()=>row.remove(),e.boss?7000:3700);
  }
  if(parts.length){const row=document.createElement('div');row.className='loot-line';row.innerHTML=parts.join('');feed.append(row);setTimeout(()=>row.remove(),3000);}
  while(feed.children.length>5)feed.firstChild.remove();
  if(e.boss)notice(e.name||'특별한 전리품을 얻었습니다.','success',5500);
}
function addChat(msg){
  if(msg.channel==='system'&&!msg.important)return;
  const row=document.createElement('div');row.className='chat-msg '+(msg.channel||'system');
  if(msg.name){const name=document.createElement('span');name.className='who';name.textContent=`[${msg.channel==='world'?'전체':msg.channel==='party'?'파티':'지역'}] ${msg.name}`;row.append(name);}
  const text=document.createElement('span');text.textContent=msg.text;row.append(text);
  const box=$('chat-messages'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<30;
  box.append(row);while(box.children.length>80)box.firstChild.remove();
  if(bottom)box.scrollTop=box.scrollHeight;
}
$('chat-form').addEventListener('submit',async e=>{
  e.preventDefault();const input=$('chat-input'),text=input.value.trim();if(!text||!net?.connected)return;
  const result=await net.emit('chat',{text,channel:$('chat-channel').value});
  if(result.ok){input.value='';input.blur();}else if(result.error)notice(result.error,'warn');
});
$('chat-input').addEventListener('focus',resetControls);
function openPanel(name,data){
  if(name!=='auth'&&!profile&&name!=='setup'&&name!=='password')return;
  cancelKeyCapture(false);
  if(name==='keybindings'){keyStatus='';keyStatusTone='';}
  resetControls();sound.play('click');lastFocused=document.activeElement;
  modal=name;modalTab=name==='craft'?'recipes':name==='jobs'?'common':name==='titles'?'owned':name==='inventory'?'gear':'all';selectedItem=null;
  if(name==='titles')titleSearch='';
  if(name==='craft')showAllForgeRecipes=false;
  if(name==='stats')statDraft={};
  window._modalData=data;show('modal');renderPanel();if(name==='jobs')action({type:'jobs'});
  $('modal-close').focus();
}
function closeModal(){
  cancelKeyCapture(false);
  show('modal',false);modal=null;lastModalSignature='';resetControls();
  if(lastFocused?.isConnected&&lastFocused?.tagName!=='INPUT')lastFocused.focus();
}
function refreshPanel(){
  if(!modal||['auth','settings','keybindings','account','password','questReward','ending','guide'].includes(modal))return;
  const scroll=$('modal-content').scrollTop;
  renderPanel();$('modal-content').scrollTop=scroll;
}
const gearStats=i=>[['atk','공격력'],['def','방어력'],['hp','체력'],['mp','마나'],['crit','치명타']]
  .filter(([key])=>i[key]).map(([key,label])=>`${label} ${i[key]>0?'+':''}${i[key]}${key==='crit'?'%':''}`).join(' · ');
const npcIntro=id=>{const n=NPCS.find(x=>x.id===id);return `<div class="npc-intro"><img src="/assets/${n.sprite}_s_0.png" alt="${esc(n.name)}"><p>“${esc(n.dialog)}”</p></div>`;};
function recipeRows(){
  // The old recipes remain available; show new sets near the player's level to avoid a huge DOM list.
  const visible=RECIPES.filter(r=>showAllForgeRecipes||!r.id.startsWith('forge_')||
    (r.level<=profile.level+12&&r.level>=Math.max(1,profile.level-30)));
  return `<div class="settings-actions"><span class="small muted">추가 제작 장비 120종 · 현재 레벨의 장비를 우선 표시합니다.</span><button type="button" class="btn small" data-act="forgeCatalogToggle">${showAllForgeRecipes?'레벨별 추천만 보기':'전체 제작법 보기'}</button></div>`+visible.map(r=>{
    const id=r.output||weaponFor(r.weaponTier,profile.classId),i=ITEMS[id];
    const enough=profile.level>=r.level&&profile.gold>=r.gold&&Object.entries(r.cost).every(([id,n])=>(profile.inventory[id]||0)>=n);
    return `<div class="recipe">${icon(i.icon)}<div class="recipe-body"><h3 style="color:${RARITIES[i.rarity].color}">${esc(r.name)}</h3><p>${Object.entries(r.cost).map(([id,n])=>`<span class="${(profile.inventory[id]||0)<n?'insufficient':''}">${esc(ITEMS[id].name)} ${profile.inventory[id]||0}/${n}</span>`).join(' · ')}<br>${r.gold} G · 필요 레벨 ${r.level}</p></div><button class="btn small ${enough?'primary':''}" data-act="craft" data-id="${r.id}" ${enough?'':'disabled'}>제작</button></div>`;
  }).join('');
}
function questCards(forNpc=false){
  const list=QUESTS.filter(q=>{
    if(forNpc)return profile.quests[q.id]||(!profile.completed.includes(q.id)||q.repeatable)&&(!q.requires||profile.completed.includes(q.requires));
    return modalTab==='completed'?profile.completed.includes(q.id):modalTab==='story'?!q.repeatable:profile.quests[q.id];
  });
  if(!list.length)return `<div class="info-box">아직 ${modalTab==='completed'?'완료한':'진행 중인'} 의뢰가 없습니다. 마을의 리아와 대화해 보세요.</div>`;
  return list.map(q=>{
    const qs=profile.quests[q.id],ready=qs&&q.objectives.every((o,i)=>(qs.progress[i]||0)>=o.count);
    const done=profile.completed.includes(q.id)&&!q.repeatable;
    const locked=profile.level<q.level||q.requires&&!profile.completed.includes(q.requires);
    const rewardItems={...(q.items||{})};if(q.weaponTier)rewardItems[weaponFor(q.weaponTier,profile.classId)]=1;
    return `<article class="card"><div class="card-head"><h3>${esc(q.name)}</h3><span class="badge ${ready?'good':''}">${done?'완료':ready?'보고 가능':qs?'진행 중':`Lv.${q.level}`}</span></div><p>${esc(q.desc)}</p>
      ${q.objectives.map((o,i)=>`<div class="objective ${qs&&(qs.progress[i]||0)>=o.count?'done':''}"><span>${esc(objectiveLabel(o))}</span><span>${qs?`${qs.progress[i]||0}/`:''}${o.count}</span></div>`).join('')}
      <div class="reward-line">${q.xp} EXP · ${q.gold} G ${Object.entries(rewardItems).map(([id,n])=>`· ${esc(ITEMS[id].name)}${n>1?' × '+n:''}`).join(' ')}</div>
      <footer><span class="small muted">${q.repeatable?'반복 의뢰':'CHAPTER '+q.chapter}</span>
      ${forNpc&&!done?`<button class="btn small ${ready||!qs&&!locked?'primary':''}" data-act="${qs?'claimQuest':'acceptQuest'}" data-id="${q.id}" ${qs&&!ready||locked?'disabled':''}>${ready?'보상 받기':qs?'진행 중':locked?'조건 미충족':'의뢰 수락'}</button>`:!done?'<span class="small muted">리아에게 대화</span>':''}</footer></article>`;
  }).join('');
}
const TITLE_RARITY_LABEL={common:'일반',uncommon:'고급',rare:'희귀',epic:'영웅',legendary:'전설'};
function renderTitleGallery(p){
  const earned=new Set(p.titles);
  const current=titleInfo(p.title);
  const owned=[p.title,...p.titles.slice().reverse()].filter((name,i,arr)=>name&&arr.indexOf(name)===i);
  const names=modalTab==='owned'?owned:[...owned,...[...TITLE_CATALOG,...HIDDEN_TITLES].filter(t=>!earned.has(t.name)).map(t=>t.name)];
  const cards=names.map(name=>{
    const data=titleInfo(name),has=earned.has(name),equipped=name===p.title;
    const rarity=TITLE_RARITY_LABEL[data.rarity]||'일반';
    const progress=data.metric!==undefined?Math.min(titleProgress(p,data.metric),data.goal):0;
    const progressLabel=data.metric==='playSeconds'
      ? `${Math.floor(progress/60)} / ${Math.ceil(data.goal/60)}분`
      : `${money(progress)} / ${money(data.goal)}`;
    const condition=data.hidden?'해금 방법 비공개 · 스스로 발견하세요'
      : data.metric!==undefined?`${esc(data.description)} ${progressLabel}`
      : (has?'특별 활동을 통해 획득한 칭호':'특별 활동 보상');
    const effect=data.hidden&&!has?'':titleStatLabel(name);
    const searchable=esc(`${name} ${data.theme||'특별 칭호'} ${rarity}`.toLocaleLowerCase());
    return `<article class="title-card rarity-${data.rarity} ${has?'':'locked'} ${equipped?'equipped':''}" data-search="${searchable}">
      <div class="title-card-top"><span class="title-rarity">${data.hidden&&!has?'히든':rarity}</span><span class="title-theme">${data.hidden&&!has?'미확인 칭호':esc(data.theme||'특별 획득')}</span></div>
      <strong class="title-card-name">✦ ${esc(name)}</strong>
      <p>${has?(equipped?'현재 장착한 칭호 · ': '획득 완료 · '):'달성 조건 · '}${condition}</p>
      ${effect?`<p class="title-bonus">⚔ ${esc(effect)}</p>`:''}
      ${has?`<button type="button" class="btn small ${equipped?'':'primary'}" data-act="equipTitle" data-title="${esc(name)}" ${equipped?'disabled':''}>${equipped?'장착 중':'이 칭호 장착'}</button>`:
      '<span class="title-locked" aria-label="미획득">🔒 미획득</span>'}
    </article>`;
  }).join('');
  return `<section class="title-vault">
    <div class="title-feature rarity-${current.rarity}">
      <div><span class="title-feature-label">현재 장착한 칭호</span><h3>✦ ${esc(p.title)}</h3><p>장착 효과 · ${esc(titleStatLabel(p.title))}<br>캐릭터 이름 위에 표시되며, 한 번에 하나의 칭호 효과만 적용됩니다.</p></div>
      <div class="title-feature-total"><strong>${p.titles.length}</strong><span>획득 / ${TITLE_CATALOG.length+HIDDEN_TITLES.length}종+특별 칭호</span></div>
    </div>
    <div class="title-vault-tools">
      <div class="tabs title-vault-tabs"><button type="button" class="tab ${modalTab==='owned'?'active':''}" data-act="tab" data-id="owned" aria-pressed="${modalTab==='owned'}">보유한 칭호 (${p.titles.length})</button><button type="button" class="tab ${modalTab==='all'?'active':''}" data-act="tab" data-id="all" aria-pressed="${modalTab==='all'}">전체 칭호 도감 (${TITLE_CATALOG.length+HIDDEN_TITLES.length})</button></div>
      <label class="title-vault-search">칭호 검색<input id="title-search" type="search" autocomplete="off" placeholder="이름 · 주제 · 희귀도 검색" value="${esc(titleSearch)}"></label>
    </div>
    <div class="title-vault-summary"><span>히든 ${HIDDEN_TITLES.length}종: 획득 전에는 이름만 공개하며 해금 조건과 효과는 비밀입니다.</span><span id="title-count">${names.length}개 표시</span></div>
    <div id="title-grid" class="title-grid">${cards}</div>
    <p id="title-empty" class="info-box hidden">검색 결과가 없습니다. 다른 이름이나 주제로 찾아보세요.</p>
  </section>`;
}
function filterTitleGallery(){
  const input=$('title-search');if(!input)return;
  titleSearch=input.value;
  const query=titleSearch.trim().toLocaleLowerCase();
  let shown=0;
  for(const el of document.querySelectorAll('#title-grid .title-card')){
    const match=el.dataset.search.includes(query);
    el.classList.toggle('hidden',!match);
    if(match)shown++;
  }
  setText('title-count',`${shown}개 표시`);
  show('title-empty',shown===0);
}
function renderPanel(){
  const p=profile,c=p&&CLASSES[p.classId],data=window._modalData;
  let title='',eyebrow='STARFALL ONLINE',html='';
  const rpg=profile&&rpgPanel(modal,{profile,draft:statDraft,data,now:Date.now()+renderer.clock});
  const keyLabel=id=>keybindings.label(id);
  const adventure=profile&&adventurePanel(modal,{profile,tab:modalTab,data,state,now:Date.now()+renderer.clock,keyLabel});
  const extra=(profile&&modal==='dungeons'&&dungeonsPanel({profile,state,now:Date.now()+renderer.clock,keyLabel}))
    ||(profile&&modal==='realms'&&realmsPanel({profile,state,now:Date.now()+renderer.clock,keyLabel,tab:modalTab,data}))
    ||(profile&&modal==='challenges'&&challengesPanel({profile,state,now:Date.now()+renderer.clock,keyLabel}))||adventure||rpg||(profile&&expansionPanel(modal,{profile,tab:modalTab,book:jobBookData,events:eventList,now:Date.now()+renderer.clock,data,keyLabel}));
  if(extra){({title,eyebrow,html}=extra);}
  else if(modal==='warpstone'){
    title='마을 귀환석';eyebrow='WAYSTONE NETWORK · 발견한 마을끼리 이동';
    html=`<div class="info-box">여러 지역을 건너야 만나는 거점 마을의 귀환석을 먼저 활성화하세요. 전투 종료 8초 후 이동할 수 있습니다.</div><div class="card-list">${(data?.destinations||[]).map(z=>`<article class="card"><h3>${esc(z.name)}</h3><p>필요 레벨 ${z.level}${z.id===data.here?' · 현재 마을':''}</p><button class="btn primary" data-act="villageWarp" data-id="${esc(z.id)}" ${z.id===data.here||p.level<z.level?'disabled':''}>이 마을로 이동</button></article>`).join('')}</div>`;
  }else if(modal==='inventory'){
    title='가방과 장비';eyebrow=`EQUIPMENT & INVENTORY · ${money(p.gold)} G`;
    const entries=Object.entries(p.inventory).filter(([id,n])=>n>0&&ITEMS[id]&&(modalTab==='all'||ITEMS[id].type===modalTab));
    entries.sort(([a],[b])=>(Object.values(p.equipment).includes(b)?1:0)-(Object.values(p.equipment).includes(a)?1:0)||({'ancient':8,'mythic':7,'legendary':6,'epic':5,'rare':4,'uncommon':3,'common':2}[ITEMS[b].rarity]||0)-({'ancient':8,'mythic':7,'legendary':6,'epic':5,'rare':4,'uncommon':3,'common':2}[ITEMS[a].rarity]||0));
    if(!selectedItem||!entries.some(([id])=>id===selectedItem))selectedItem=entries[0]?.[0];
    const selected=ITEMS[selectedItem],s=p.stats;
    html=`<div class="inventory-layout"><aside class="equip-column"><div class="equip-portrait"><img src="${renderer.avatarURL(p)}" alt="현재 장비 외형"></div>
      ${[['weapon','무기'],['armor','방어구'],['charm','장신구']].map(([slot,name])=>{const id=p.equipment[slot],i=ITEMS[id];return `<button class="equip-slot" data-act="selectItem" data-id="${id||''}">${icon(i?.icon||'charm')}<span><small>${name}</small>${esc(i?.name||'미장착')}${p.enhancements[id]?' +'+p.enhancements[id]:''}</span></button>`;}).join('')}
      <div class="stat-grid"><span>직업</span><b>${c.name}</b><span>공격력</span><b>${s.atk}</b><span>방어력</span><b>${s.def}</b><span>치명타</span><b>${s.crit}%</b><span>최대 체력</span><b>${s.maxHp}</b><span>최대 마나</span><b>${s.maxMp}</b></div><button class="btn small primary" data-act="openStats">능력치 배분 · ${freePoints(p)} P</button></aside>
      <div><div class="tabs">${[['all','전체'],['gear','장비'],['consumable','소모품'],['material','재료']].map(([id,name])=>`<button class="tab ${modalTab===id?'active':''}" data-act="tab" data-id="${id}">${name}</button>`).join('')}</div>
      <div class="item-details">${selected?`<h3 style="color:${RARITIES[selected.rarity].color}">${esc(selected.name)}${p.enhancements[selectedItem]?' +'+p.enhancements[selectedItem]:''}</h3>
      <p>${RARITIES[selected.rarity].name} ${selected.class?' · '+({guardian:'검 계열',ranger:'활 계열',mage:'마법 계열'})[selected.class]:''}${selected.level?' · 필요 레벨 '+selected.level:''}</p>
      <div class="item-stats">${gearStats(selected)}${selected.type==='gear'&&p.equipment[selected.slot]&&p.equipment[selected.slot]!==selectedItem?`<span class="small muted"> · 현재 ${esc(ITEMS[p.equipment[selected.slot]]?.name||'미장착')} (${gearStats(ITEMS[p.equipment[selected.slot]])})</span>`:''}</div>
      ${selected.type==='gear'?`<button class="btn primary" data-act="equip" data-id="${selectedItem}">${Object.values(p.equipment).includes(selectedItem)?'장착 중':'바로 장착'}</button>`:selected.type==='consumable'?`<button class="btn primary" data-act="use" data-id="${selectedItem}">바로 사용</button>`:''}`:'<p class="muted">소지한 물품이 없습니다.</p>'}</div>
      <div class="bag-grid">${entries.map(([id,n])=>{const i=ITEMS[id];return `<button class="item-cell ${selectedItem===id?'selected':''}" style="border-color:${RARITIES[i.rarity].color}66" data-act="selectItem" data-id="${id}" title="${esc(i.name)}">${icon(i.icon)}<span class="count">${n}</span>${Object.values(p.equipment).includes(id)?'<span class="equipped">장착</span>':''}</button>`;}).join('')}</div>
      </div></div>`;
  }else if(modal==='npcQuest'){
    title='별지기 리아';eyebrow='THE KEEPER OF LITTLE LIGHTS';
    html=npcIntro('lia')+`<div class="card-list">${questCards(true)}</div>`;
  }else if(modal==='journal'){
    title='모험의 기록';eyebrow='THE LAST STAR · QUEST JOURNAL';
    html=`<div class="tabs">${[['all','진행 중'],['completed','완료한 의뢰'],['story','전체 이야기']].map(([id,name])=>`<button class="tab ${modalTab===id?'active':''}" data-act="tab" data-id="${id}">${name}</button>`).join('')}</div><div class="card-list">${questCards()}</div>`;
  }else if(modal==='shop'){
    title='모라의 여행 상점';eyebrow=`SUPPLIES FOR THE ROAD · ${money(p.gold)} G`;
    html=npcIntro('mora')+`<div class="tabs"><button class="tab ${modalTab!=='sell'?'active':''}" data-act="tab" data-id="buy">구매</button><button class="tab ${modalTab==='sell'?'active':''}" data-act="tab" data-id="sell">판매</button></div>`;
    if(modalTab==='sell'){
      html+=`<p class="small muted">장착 중이거나 강화한 장비는 보호됩니다. 수량 버튼 또는 직접 입력으로 한 번에 판매할 수 있습니다.</p>`;
      html+=Object.entries(p.inventory).filter(([id,n])=>n>0&&ITEMS[id]).map(([id,n])=>{
        const i=ITEMS[id],locked=Object.values(p.equipment).includes(id)||p.enhancements[id],unit=i.sell||1;
        return `<div class="recipe sell-recipe">${icon(i.icon)}<div class="recipe-body"><h3 style="color:${RARITIES[i.rarity].color}">${esc(i.name)}</h3><p>보유 ${money(n)}개 · 개당 ${money(unit)} G</p>
          <div class="sell-actions">
            <button type="button" class="btn small" data-act="sellCount" data-id="${id}" data-count="1" ${locked?'disabled':''}>1개</button>
            <button type="button" class="btn small" data-act="sellCount" data-id="${id}" data-count="10" ${locked||n<10?'disabled':''}>10개</button>
            <button type="button" class="btn small" data-act="sellCount" data-id="${id}" data-count="${Math.min(n,9999)}" ${locked?'disabled':''}>전량</button>
            <label class="sell-input-label" for="sell-count-${id}">직접 입력<input id="sell-count-${id}" type="number" inputmode="numeric" min="1" max="${Math.min(n,9999)}" value="1" ${locked?'disabled':''}></label>
            <button type="button" class="btn small primary" data-act="sellCustom" data-id="${id}" ${locked?'disabled':''}>입력 수량 판매</button>
          </div>
        </div></div>`;
      }).join('');
    }else html+=SHOP.map(id=>{const i=ITEMS[id];return `<div class="recipe">${icon(i.icon)}<div class="recipe-body"><h3 style="color:${RARITIES[i.rarity].color}">${esc(i.name)}</h3><p>${esc(i.desc||gearStats(i))}<br>${i.buy} G · 보유 ${p.inventory[id]||0}개</p></div><button class="btn small primary" data-act="buy" data-id="${id}" ${p.gold<i.buy?'disabled':''}>1개 구매</button>${i.type==='consumable'?`<button class="btn small" data-act="buy5" data-id="${id}" ${p.gold<i.buy*5?'disabled':''}>5개</button>`:''}</div>`;}).join('');
  }else if(modal==='craft'){
    title='브란의 별빛 공방';eyebrow=`CRAFT & REFINE · ${money(p.gold)} G`;
    html=npcIntro('bran')+`<div class="tabs"><button class="tab ${modalTab!=='enhance'?'active':''}" data-act="tab" data-id="recipes">장비 · 물약 제작</button><button class="tab ${modalTab==='enhance'?'active':''}" data-act="tab" data-id="enhance">장비 강화</button></div>`;
    if(modalTab==='enhance'){
      html+=enhancementRows(p,icon);
    }else html+=recipeRows();
  }else if(modal==='healer'){
    title='에린의 쉼터';eyebrow='A LIGHT TO COME HOME TO';
    html=npcIntro('erin')+`<div class="story-complete"><div class="star">✦</div><h3>다시, 길을 떠날 준비가 됐어요.</h3><p>체력과 마나가 모두 회복되었습니다.<br>마을에서도 천천히 회복할 수 있어요.</p><button class="btn primary" data-act="close">모험 계속하기</button></div>`;
  }else if(modal==='map'){
    title='별이 떨어진 세계';eyebrow='THE WORLD OF STARFALL';
    html=`<div class="map-frame"><canvas id="large-map" width="650" height="360"></canvas><div class="map-legend"><span>● 나</span><span style="color:#cfb9ee">● 지역의 문</span><span style="color:#e9c99f">● NPC</span><span style="color:#dd9c98">● 보스</span></div></div><div class="region-cards">${Object.entries(ZONES).map(([id,z])=>`<div class="region-card ${p.zone===id?'active':''}"><h4>${esc(z.name)}</h4><small>${id==='town'?'안전 지대':`Lv.${z.minLevel}+`}${p.zone===id?' · 현재 위치':p.discovery.visited.includes(id)?' · 발견':' · 미탐험'}</small>${p.zone==='town'&&id!=='town'&&p.discovery.visited.includes(id)?`<button class="btn small" data-act="travel" data-id="${id}">이동</button>`:''}</div>`).join('')}</div>
      <div class="info-box" style="margin-top:17px">12개 지역이 갈림길로 이어집니다. 마을 ↔ 초원 ↔ 해안 ↔ 사막 ↔ 하늘섬 ↔ 천문대 / 숲 ↔ 습지 ↔ 유적 ↔ 성채 ↔ 설원 ↔ 심연 ↔ 천문대. 지역의 문 근처에서 ${esc(keybindings.label('interact'))}를 눌러 이동하세요. 보스의 보상은 전투에 기여한 각 플레이어에게 지급됩니다.</div><button class="btn" data-act="return">마을로 귀환 <kbd>${esc(keybindings.label('return'))}</kbd></button>`;
  }else if(modal==='party'){
    title='함께 걷는 모험가';eyebrow='PARTY & COMMUNITY';
    const party=state?.party;
    html=`<div class="tabs"><button class="tab ${modalTab!=='ranks'?'active':''}" data-act="tab" data-id="all">파티 · 주변 모험가</button><button class="tab ${modalTab==='ranks'?'active':''}" data-act="tab" data-id="ranks">모험가 순위</button></div>`;
    if(modalTab==='ranks'){
      html+='<div id="rank-results" class="muted small">저장된 모험 기록을 불러오는 중…</div>';
      queueMicrotask(loadRanks);
    }else{
      html+=`<div class="info-box">최대 4명이 파티를 맺을 수 있습니다. 같은 지역에서 가까이 있는 파티원은 처치 기록과 보상을 공유합니다. 보스는 파티가 아니어도 직접 전투에 기여하면 보상을 받습니다. 파티는 서버 재시작 시 해제됩니다.</div>`;
      html+='<div class="dungeon-entry"><div><b>함께 풀어야 열리는 세 개의 던전</b><p>2~4인 협동 · 역할 배정 · 실패 후 재도전 · 고유 보상</p></div><button class="btn small primary" data-act="openDungeons">파티 던전</button></div>';
      if(party){
        html+=`<h3>우리 파티 · ${party.members.length}/4</h3>`+party.members.map(m=>`<div class="member-row"><img src="${imgHero(m.classId)}" alt=""><div class="grow"><b>${esc(m.name)} ${party.leader===m.id?'♔':''}</b><small>Lv.${m.level} ${CLASSES[m.classId].name} · ${ZONES[m.zone].name} ${m.online?'':'· 접속 종료'}</small></div><span class="badge">${m.hp}/${m.maxHp}</span></div>`).join('')+`<button class="btn small" data-act="partyLeave">파티 나가기</button><h3 style="margin-top:24px">주변 모험가</h3>`;
      }else html+='<h3>주변 모험가</h3>';
      const others=state?.players||[];
      html+=others.length?others.map(m=>`<div class="member-row"><img src="${imgHero(m.classId)}" alt=""><div class="grow"><b>${esc(m.name)}</b><small>Lv.${m.level} ${CLASSES[m.classId].name}${m.partyId?' · 파티 참여 중':''}</small></div><button class="btn small" data-act="mute" data-id="${m.id}">${mutedPlayers.has(m.id)?'차단 해제':'채팅 차단'}</button><button class="btn small primary" data-act="partyInvite" data-id="${m.id}" ${m.partyId||party&&party.leader!==p.id?'disabled':''}>초대</button></div>`).join(''):'<p class="muted small">아직 가까이에 다른 모험가가 없습니다. 같은 서버 주소를 친구에게 공유해 보세요.</p>';
      html+='<button class="btn small" style="margin-top:15px" data-act="copyLink">게임 주소 복사</button>';
    }
  }else if(modal==='titles'){
    title='칭호 보관함';eyebrow='YOUR NAME · YOUR LEGEND';html=renderTitleGallery(p);
  }else if(modal==='keybindings'){
    title='키 설정';eyebrow='KEY BINDINGS · YOUR CONTROLS';html=renderKeybindingsSettings();
  }else if(modal==='settings'){
    title='잠깐의 쉼';eyebrow='SETTINGS · THE WORLD KEEPS MOVING';
    html=`<div class="info-box">설정과 가방을 열어도 온라인 세계의 시간은 멈추지 않습니다. 안전하게 정비하려면 마을에서 이용하세요.</div>
      <div class="settings-row"><label for="setting-sfx">효과음<small>공격·획득·레벨 상승</small></label><input id="setting-sfx" type="checkbox" ${settings.sfx?'checked':''}></div>
      <div class="settings-row"><label for="setting-music">배경 음악<small>게임 내에서 합성하는 잔잔한 멜로디</small></label><input id="setting-music" type="checkbox" ${settings.music?'checked':''}></div>
      <div class="settings-row"><label for="setting-effects">화면 효과<small>주변 입자·조명·타격 연출</small></label><input id="setting-effects" type="checkbox" ${settings.effects?'checked':''}></div>
      <div class="settings-row"><label for="setting-fxStyle">스킬 연출 방식<small>전투 밸런스는 동일합니다. 원하는 버전으로 즉시 전환할 수 있습니다.</small></label><select id="setting-fxStyle"><option value="v6" ${settings.fxStyle!=='classic'?'selected':''}>새 도트 전투 연출 · V6</option><option value="classic" ${settings.fxStyle==='classic'?'selected':''}>이전 도트 연출 · 클래식</option></select></div>
      <div class="settings-row"><label for="setting-lowPower">가벼운 화면 모드<small>고해상도 렌더링과 주변 입자를 줄입니다.</small></label><input id="setting-lowPower" type="checkbox" ${settings.lowPower?'checked':''}></div>
      <div class="settings-row"><label for="setting-shake">타격 시 화면 흔들림<small>부드러운 이동을 위해 기본값은 꺼짐입니다.</small></label><input id="setting-shake" type="checkbox" ${settings.shake?'checked':''}></div>
      <div class="settings-row"><label for="setting-zoom">화면 배율<small>모바일에서는 작은 배율을 권장합니다.</small></label><input id="setting-zoom" type="range" min=".75" max="1.3" step=".05" value="${settings.zoom}"></div>
      <div class="settings-row"><label>자동 기본 공격<small>가까운 적에게 기본 공격을 반복합니다. 이동은 직접 조작합니다.</small></label><button class="btn small" data-act="auto">${autoAttack?'끄기':'켜기'}</button></div>
      <div class="settings-row"><label>키 설정<small>이동·공격·기술·메뉴의 주 키와 보조 키를 변경합니다.</small></label><button class="btn small primary" data-act="keybindings">키 설정 열기</button></div>
      <div class="settings-row"><label>칭호<small>게임 화면의 '칭호' 전용 버튼에서 장착할 수 있습니다.</small></label><button class="btn small" data-act="openTitles">칭호 보관함</button></div>
      <div class="settings-actions"><button class="btn small primary" data-act="save">지금 저장</button><button class="btn small" data-act="guide">조작 도움말</button><button class="btn small" data-act="account">계정 연결</button><button class="btn small" data-act="copyLink">주소 복사</button><button class="btn small danger" data-act="logout">나가기</button></div>
      <p class="small muted" style="margin:20px 0 0">v2.0.0 · ${config.devGuest?'로컬 개발 저장소':'Supabase 영구 저장'} · ${money(p.kills)}마리 처치 · 보스 ${p.bossKills}회<br>저장은 30초마다, 주요 거래 후와 접속 종료 시 시도합니다.</p>`;
  }else if(modal==='guide'){
    title='첫 모험을 위한 작은 안내';eyebrow='HOW TO FIND YOUR WAY';
    html=`<div class="info-box">마을 중앙의 <b>리아</b>에게 다가가 <b>${esc(keybindings.label('interact'))}</b>로 첫 의뢰를 받으세요. 마을의 북쪽 문에서 같은 키를 누르면 숲으로 이동합니다. 적을 클릭해 선택하고 공격할 수 있으며, 선택하지 않으면 사거리 안의 가까운 적을 노립니다.</div>
      <div class="controls-grid">${[...KEY_ACTIONS.map(a=>[a.label,keybindings.label(a.id)]),['클릭 이동','빈 바닥 클릭'],['창 닫기 / 입력 취소','Esc']].map(([n,k])=>`<div class="control"><span>${esc(n)}</span><kbd>${esc(k)}</kbd></div>`).join('')}</div>
      <div class="info-box">휴대폰·태블릿에서는 왼쪽 조이스틱과 오른쪽 공격·회피·F 버튼을 사용하세요. 공격 버튼을 길게 누르면 기본 공격을 반복합니다. 붉은 원·고리·직선은 보스의 공격 예고입니다. 회피의 짧은 무적 시간을 활용해 보세요.<br><br>레벨 5부터 사망 시 골드·경험치 일부를 잃습니다. 10분 안에 영혼을 회수하면 손실 대부분을 되찾습니다. 장비와 레벨은 잃지 않습니다. 회복 물약은 상인에게 구매하거나 약초로 제작할 수 있습니다.</div><button class="btn primary" data-act="close">모험 계속하기</button>`;
  }else if(modal==='questReward'||modal==='ending'){
    title=modal==='ending'?'새벽이 돌아왔습니다':'의뢰를 마쳤습니다';eyebrow=modal==='ending'?'CHAPTER I · THE LAST STAR':'QUEST COMPLETE';
    html=`<div class="story-complete"><div class="star">✦</div><h3>${esc(data?.name)}</h3><p>${esc(data?.message)}</p><div class="reward-line">${data?.xp||0} EXP · ${data?.gold||0} G · 보상이 가방에 지급되었습니다.</div><p style="margin-top:15px">${modal==='ending'?'이야기를 마쳐도 모험은 계속됩니다. 다른 모험가를 돕고, 새벽 장비를 완성해 보세요.':'리아에게 다시 말을 걸면 다음 의뢰를 확인할 수 있습니다.'}</p><button class="btn primary" data-act="close">모험 계속하기</button></div>`;
  }else if(modal==='auth'){
    title=accountMode==='signup'?'새로운 모험가 등록':accountMode==='recover'?'비밀번호 다시 설정':'모험가 계정 로그인';eyebrow='YOUR JOURNEY, SAVED';
    html=`<form id="auth-form" class="auth-form"><p>이메일 계정은 다른 기기에서도 같은 캐릭터로 이어서 플레이할 수 있습니다.</p><label>이메일<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>${accountMode!=='recover'?`<label>비밀번호<input id="auth-password" type="password" autocomplete="${accountMode==='signup'?'new-password':'current-password'}" minlength="8" required placeholder="8자 이상"></label>`:''}<button class="btn primary" id="auth-submit">${accountMode==='signup'?'회원가입':accountMode==='recover'?'비밀번호 재설정 이메일 받기':'로그인'}</button><p id="auth-status" class="error-text"></p></form><div class="auth-switch">${accountMode!=='login'?'<button class="text-button" data-act="authMode" data-id="login">로그인으로</button>':''}${accountMode!=='signup'?'<button class="text-button" data-act="authMode" data-id="signup">새 계정 만들기</button>':''}${accountMode!=='recover'?'<button class="text-button" data-act="authMode" data-id="recover">비밀번호 찾기</button>':''}</div>`;
    if(config?.devGuest)html='<div class="info-box">현재는 로컬 개발 서버입니다. 이메일 인증은 공개 배포 시 Supabase를 연결한 뒤 사용할 수 있습니다. 메인 화면의 모험 시작으로 개발 계정을 만들 수 있습니다.</div>';
    else if(!config?.configured)html='<div class="info-box">관리자가 Supabase 환경변수와 setup.sql을 먼저 설정해야 합니다. ZIP의 배포 안내를 확인해 주세요.</div>';
  }else if(modal==='account'){
    title='모험 기록을 지키는 방법';eyebrow='ACCOUNT & PROGRESS';
    if(config.devGuest)html='<div class="info-box">현재는 로컬 개발 계정입니다. .local-data 폴더에 저장합니다. Render 공개 배포에서는 개발 계정이 차단되고 Supabase 계정만 허용됩니다.</div>';
    else{
      const user=auth.session?.user,verified=Boolean(user?.email_confirmed_at);
      html=`<div class="info-box">${user?.is_anonymous?'현재 빠른 시작 계정입니다. 로그아웃하거나 브라우저 데이터를 지우면 이 계정에 다시 접근할 수 없습니다. 먼저 이메일을 연결하고 인증을 마친 뒤 비밀번호를 설정하세요.':'이메일 계정으로 기록이 보관됩니다. 다른 기기에서도 같은 이메일과 비밀번호로 로그인하세요.'}</div>
      ${user?.email?`<p class="small muted">연결 이메일: ${esc(user.email)} · ${verified?'인증됨':'인증 대기 중'}</p>`:''}
      <form id="link-form" class="auth-form">${!verified?'<label>연결할 이메일<input type="email" id="link-email" required placeholder="you@example.com"></label><button class="btn primary">인증 이메일 보내기</button>':'<label>새 비밀번호<input type="password" id="new-password" minlength="8" required placeholder="8자 이상"></label><button class="btn primary">비밀번호 저장</button>'}<p id="auth-status" class="error-text"></p></form>`;
    }
  }else if(modal==='password'){
    title='계정 비밀번호 설정';eyebrow='KEEP YOUR JOURNEY SAFE';
    html='<form id="password-form" class="auth-form"><p>인증이 완료되었습니다. 로그인에 사용할 비밀번호를 설정하세요.</p><label>새 비밀번호<input id="new-password" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn primary">비밀번호 저장</button><p id="auth-status" class="error-text"></p></form>';
  }else if(modal==='setup'){
    title='게임 서버 연결이 필요합니다';eyebrow='DEPLOYMENT CHECK';
    html='<div class="info-box">이 페이지는 열렸지만 온라인 계정 저장소가 연결되지 않았습니다. Render 환경변수에 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY를 설정하고 Supabase SQL Editor에서 supabase/setup.sql을 실행해 주세요.<br><br>서비스는 Static Site가 아닌 <b>Node Web Service</b>로 배포해야 합니다. 자세한 안내는 ZIP의 README_KO.md에 있습니다.</div>';
  }
  $('modal-title').textContent=title;$('modal-eyebrow').textContent=eyebrow;
  if(modal==='dungeons'||modal==='realms'){
    const signature=modal+':'+html;
    if(lastModalSignature===signature)return;
    const focused=$('modal-content').contains(document.activeElement)?{...document.activeElement.dataset}:null;
    const expanded=[...$('modal-content').querySelectorAll('details')].map(d=>d.open);
    $('modal-content').innerHTML=html;lastModalSignature=signature;
    $('modal-content').querySelectorAll('details').forEach((d,i)=>{if(expanded[i]!==undefined)d.open=expanded[i];});
    if(focused?.act)[...$('modal-content').querySelectorAll('[data-act]')].find(b=>b.dataset.act===focused.act&&b.dataset.id===focused.id)?.focus({preventScroll:true});
  }else{
    const titleFocused=modal==='titles'&&document.activeElement?.id==='title-search';
    const caret=titleFocused?document.activeElement.selectionStart:null;
    const galleryScroll=modal==='titles'?$('modal-content').scrollTop:0;
    $('modal-content').innerHTML=html;lastModalSignature='';
    if(modal==='titles'){
      filterTitleGallery();$('modal-content').scrollTop=galleryScroll;
      if(titleFocused){const input=$('title-search');input?.focus({preventScroll:true});
        if(caret!==null)input?.setSelectionRange(caret,caret);}
    }
  }
  if(modal==='map')requestAnimationFrame(()=>{$('large-map')&&renderer.minimap($('large-map'),true);});
  attachForms();
}
async function loadRanks(){
  if(!$('rank-results'))return;
  try{
    const res=await fetch('/api/leaderboard');if(!res.ok)throw new Error('순위표를 불러오지 못했습니다.');
    const ranks=await res.json();
    if(!$('rank-results'))return;
    $('rank-results').innerHTML=`<p class="small muted">마지막 서버 저장 기준 · 레벨순 상위 30명</p><table class="leaderboard"><thead><tr><th>순위</th><th>모험가</th><th>직업</th><th>레벨</th><th>보스 처치</th></tr></thead><tbody>${ranks.map((r,i)=>`<tr class="${r.name===profile.name?'me':''}"><td>${i+1}</td><td>${esc(r.name)}</td><td>${CLASSES[r.classId]?.short||''}</td><td>${r.level}</td><td>${r.bossKills}</td></tr>`).join('')}</tbody></table>`;
  }catch(e){if($('rank-results'))$('rank-results').textContent=e.message;}
}
function attachForms(){
  $('auth-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const b=$('auth-submit');b.disabled=true;$('auth-status').textContent='';
    try{
      const email=$('auth-email').value.trim(),pw=$('auth-password')?.value;
      if(accountMode==='recover'){
        await auth.recover(email);$('auth-status').textContent='재설정 이메일을 보냈습니다. 이메일의 링크를 눌러 주세요.';
      }else if(accountMode==='signup'){
        const data=await auth.signup(email,pw);
        if(data.access_token){closeModal();await connectGame();}
        else $('auth-status').textContent='가입 신청이 완료되었습니다. 인증 이메일을 확인한 뒤 로그인해 주세요.';
      }else{await auth.login(email,pw);closeModal();await connectGame();}
    }catch(e){if($('auth-status'))$('auth-status').textContent=e.message;}finally{if(b.isConnected)b.disabled=false;}
  });
  $('link-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
    try{
      if($('link-email')){await auth.linkEmail($('link-email').value.trim());$('auth-status').textContent='인증 이메일을 보냈습니다. 링크로 돌아온 뒤 비밀번호를 설정하세요. 현재 계정에서 로그아웃하지 마세요.';}
      else{await auth.setPassword($('new-password').value);$('auth-status').textContent='비밀번호를 저장했습니다. 이제 같은 이메일로 다른 기기에서 로그인할 수 있습니다.';}
    }catch(e){$('auth-status').textContent=e.message;}finally{b.disabled=false;}
  });
  $('password-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
    try{await auth.setPassword($('new-password').value);closeModal();notice('비밀번호를 저장했습니다.','success');await connectGame();}
    catch(e){if($('auth-status'))$('auth-status').textContent=e.message;}finally{b.disabled=false;}
  });
  for(const key of ['sfx','music','effects','lowPower','shake'])$('setting-'+key)?.addEventListener('change',e=>{settings[key]=e.target.checked;sound.start();applySettings();});
  $('setting-fxStyle')?.addEventListener('change',e=>{settings.fxStyle=e.target.value;applySettings();});
  $('setting-zoom')?.addEventListener('input',e=>{settings.zoom=Number(e.target.value);applySettings();});
  $('title-search')?.addEventListener('input',filterTitleGallery);
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
  const type=b.dataset.act,id=b.dataset.id;
  if(type==='keybindings'){openPanel('keybindings');return;}
  if(type==='openSettings'){openPanel('settings');return;}
  if(type==='openTitles'){openPanel('titles');return;}
  if(type==='sellCount'||type==='sellCustom'){
    if(modal!=='shop'||modalTab!=='sell'||!profile)return;
    const owned=profile.inventory?.[id]||0;
    const selected=type==='sellCount'?Number(b.dataset.count):Number(document.getElementById('sell-count-'+id)?.value);
    if(!Number.isSafeInteger(selected)||selected<1||selected>Math.min(9999,owned)){
      notice('판매 수량은 1개부터 현재 보유 수량까지 입력해 주세요.','warn');return;
    }
    b.disabled=true;
    const result=await action({type:'sell',id,count:selected});
    if(b.isConnected)b.disabled=false;
    if(result.ok)uiRefreshNeeded=true;
    return;
  }
  if(type==='equipTitle'){
    const wanted=b.dataset.title;
    if(modal!=='titles'||!wanted||!profile?.titles.includes(wanted)||profile.title===wanted)return;
    b.disabled=true;
    const result=await action({type:'title',title:wanted});
    if(result.ok){profile.title=wanted;notice(`칭호 「${wanted}」 장착 완료`,'success');renderPanel();}
    else if(b.isConnected)b.disabled=false;
    return;
  }
  if(type==='bindKey'){
    const slot=Number(b.dataset.slot);
    if(modal!=='keybindings'||!KEY_ACTIONS.some(a=>a.id===id)||(slot!==0&&slot!==1))return;
    resetControls();keyCapture={id,slot};keyStatus='';keyStatusTone='';redrawKeybindings(id,slot);return;
  }
  if(type==='cancelKey'){cancelKeyCapture();return;}
  if(type==='clearKey'){
    if(modal!=='keybindings')return;
    const slot=Number(b.dataset.slot),result=keybindings.clear(id,slot);
    if(result.ok)finishKeyEdit(result,'선택한 키를 해제했습니다.',id,slot);
    return;
  }
  if(type==='resetKeys'){
    if(modal!=='keybindings')return;
    cancelKeyCapture(false);redrawKeybindings();
    if(await confirmDialog('키 설정을 초기화할까요?','지정한 주 키와 보조 키를 모두 기본값으로 되돌립니다.')){
      finishKeyEdit(keybindings.reset(),'기본 키 설정으로 복원했습니다.');
    }return;
  }
  if(type==='tab'){modalTab=id;renderPanel();return;}
  if(type==='forgeCatalogToggle'){showAllForgeRecipes=!showAllForgeRecipes;renderPanel();return;}
  if(type==='enhance'){
    if(forgeCinema.active)return;
    const item=ITEMS[id],level=profile?.enhancements?.[id]||0;
    if(!item||item.type!=='gear')return;
    const quote=enhancementSpec(level,profile?.enhancePity?.[id]||0,item.level);
    if(quote.max)return;
    forgeCinema.start(item,quote);
    b.disabled=true;
    const result=await action({type:'enhance',id},{silent:true,suppressMessage:true});
    if(b.isConnected)b.disabled=false;
    if(result.ok){forgeCinema.resolve(result,()=>sound.play(result.success?'level':'hurt'));uiRefreshNeeded=true;}
    else forgeCinema.abort(result.error||'강화 요청을 처리하지 못했습니다.');
    return;
  }
  if(type==='selectItem'){if(id&&ITEMS[id]){selectedItem=id;if(modalTab!=='all'&&modalTab!==ITEMS[id].type)modalTab=ITEMS[id].type;const pos=$('modal-content').scrollTop;renderPanel();$('modal-content').scrollTop=pos;}return;}
  if(type==='close'){closeModal();return;}
  if(type==='reload'){location.reload();return;}
  if(type==='authMode'){accountMode=id;renderPanel();return;}
  if(type==='openJobs'){openPanel('jobs');return;}
  if(type==='openStories'){openPanel('stories');return;}
  if(type==='openAtlas'){openPanel('map');return;}
  if(type==='openParty'){openPanel('party');return;}
  if(type==='openChallenges'){openPanel('challenges');return;}
  if(type==='openDungeons'){openPanel('dungeons');return;}
  if(type==='openRealms'){openPanel('realms',{id});return;}
  if(['dungeonLobby','dungeonReady','dungeonStart','dungeonRetry','dungeonExit','dungeonInteract','dungeonCancel','dungeonExchange'].includes(type)){
    b.disabled=true;
    const payload={type,id};
    if(b.dataset.lobbyId)payload.lobbyId=b.dataset.lobbyId;
    if(b.dataset.runId)payload.runId=b.dataset.runId;
    if(type==='dungeonReady'||type==='dungeonRetry')payload.ready=b.dataset.ready!=='false';
    const result=await action(payload);
    if(b.isConnected)b.disabled=false;
    if(result.ok&&['dungeonStart','dungeonExit','dungeonRetry'].includes(type))closeModal();
    uiRefreshNeeded=true;return;
  }
  if(['realmBook','realmEnter','realmDevice','realmClaim','realmTune','realmExit'].includes(type)){
    b.disabled=true;const result=await action({type,id,...(type==='realmTune'?{stable:b.dataset.stable==='true'}:{})});
    if(b.isConnected)b.disabled=false;
    if(result.ok&&['realmEnter','realmExit'].includes(type))closeModal();
    uiRefreshNeeded=true;return;
  }
  if(type==='challengeStart'){
    b.disabled=true;
    const result=await action({type,id,tier:Number(b.dataset.tier||0),checkpoint:['true','1'].includes(b.dataset.checkpoint)});
    if(b.isConnected)b.disabled=false;if(result.ok)closeModal();return;
  }
  if(['challengeExit','challengeInteract','challengeShop','challengeWard'].includes(type)){
    b.disabled=true;const result=await action({type,id});
    if(b.isConnected)b.disabled=false;
    if(result.ok&&type==='challengeExit')closeModal();uiRefreshNeeded=true;return;
  }
  if(['storyView','storyAccept','storyPause','storyResume','storyTrack'].includes(type)){
    await action({type,id});return;
  }
  if(type==='storyClaim'){
    await action({type,id,chapter:Number(b.dataset.chapter),vow:b.dataset.vow||undefined});return;
  }
  if(type==='openStats'){openPanel('stats');return;}
  if(type==='statPlus'||type==='statMinus'){
    if(!ATTRIBUTE_KEYS.includes(id))return;
    const used=Object.values(statDraft).reduce((a,b)=>a+b,0),n=statDraft[id]||0;
    if(type==='statPlus'&&used<freePoints(profile)&&(profile.attributes[id]||0)+n<MAX_ATTRIBUTE)statDraft[id]=n+1;
    if(type==='statMinus'&&n>0)statDraft[id]=n-1;
    renderPanel();return;
  }
  if(type==='cancelStats'){statDraft={};renderPanel();return;}
  if(type==='applyStats'){
    b.disabled=true;const r=await action({type:'allocateStats',points:{...statDraft}});
    if(r.ok)statDraft={};renderPanel();return;
  }
  if(type==='resetStats'){
    const price=resetPrice(profile);
    if(!spentPoints(profile)){notice('배분한 능력치가 없습니다.');return;}
    if(await confirmDialog('능력치를 초기화할까요?',price===0?'첫 초기화는 무료입니다. 배분한 포인트가 모두 반환됩니다.':`500 G를 소비하고 배분한 포인트를 모두 돌려받습니다.`)){
      const r=await action({type:'resetStats'});if(r.ok)statDraft={};renderPanel();
    }return;
  }
  if(type==='guide'||type==='account'){openPanel(type);return;}
  if(type==='copyLink'){
    try{await navigator.clipboard.writeText(location.origin);notice('게임 주소를 복사했습니다.','success');}catch{notice(location.origin,'info',8000);}return;
  }
  if(type==='auto'){autoAttack=!autoAttack;renderPanel();notice(autoAttack?`자동 기본 공격 켜짐 · ${keybindings.label('autoAttack')}로 끌 수 있습니다.`:'자동 기본 공격 꺼짐');return;}
  if(type==='save'){
    b.disabled=true;const r=await net.emit('save',{});b.disabled=false;if(r?.ok)notice('기록을 서버에 저장했습니다.','success');return;
  }
  if(type==='mute'){
    if(mutedPlayers.has(id))mutedPlayers.delete(id);else mutedPlayers.add(id);
    localStorage.setItem('starfall.muted',JSON.stringify([...mutedPlayers]));renderPanel();return;
  }
  if(type==='logout'){
    const anonymous=!config.devGuest&&auth.session?.user?.is_anonymous;
    const ok=await confirmDialog('모험을 잠시 멈출까요?',anonymous?'빠른 시작 계정은 로그아웃 후 다시 접근하지 못할 수 있습니다. 먼저 계정 연결을 권장합니다. 그래도 로그아웃할까요?':'기록 저장을 시도한 뒤 시작 화면으로 돌아갑니다.');
    if(!ok)return;
    const result=await net.emit('save',{});
    if(!result?.ok){notice('저장 완료를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.','warn');return;}
    net.disconnect();if(!config.devGuest)await auth.logout();location.reload();return;
  }
  let request;
  if(type==='acceptQuest')request={type:'quest',mode:'accept',id};
  else if(type==='claimQuest')request={type:'quest',mode:'claim',id};
  else if(type==='buy5')request={type:'buy',id,count:5};
  else if(['equip','use','buy','sell','craft','enhance','partyInvite','changeJob','dailyClaim','achievement','worldJoin','travel','waypoint','villageWarp','contractAccept','contractClaim','trialStart','surveyClaim'].includes(type))request={type,id};
  else if(['partyAccept','partyLeave','return'].includes(type))request={type};
  if(request){
    b.disabled=true;const result=await action(request);if(b.isConnected)b.disabled=false;
    if(result.ok){
      if(type==='partyAccept'){b.closest('.notice')?.remove();notice('파티에 합류했습니다.','success');}
      if(['return','travel','worldJoin','waypoint','villageWarp','trialStart'].includes(type))closeModal();
      uiRefreshNeeded=true;
    }
  }
});
async function confirmDialog(title,text){
  const previousFocus=document.activeElement;
  resetControls();show('confirm');
  $('confirm').innerHTML=`<div class="creation-window" style="max-width:430px"><h3>${esc(title)}</h3><p class="muted small">${esc(text)}</p><div class="settings-actions"><button id="confirm-yes" class="btn primary">계속</button><button id="confirm-no" class="btn">취소</button></div></div>`;
  return new Promise(resolve=>{
    const finish=v=>{show('confirm',false);$('confirm').innerHTML='';if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});resolve(v);};
    $('confirm-yes').onclick=()=>finish(true);$('confirm-no').onclick=()=>finish(false);
    $('confirm-yes').focus();
  });
}
function inputDirection(){
  if(modal||editable()||document.hidden||!net?.connected||!inGame||state?.dungeon?.inputBlocked)return {x:0,y:0};
  if(Math.hypot(joystick.x,joystick.y)>.05)return joystick;
  const x=(keybindings.isHeld('moveRight',keys)?1:0)-(keybindings.isHeld('moveLeft',keys)?1:0);
  const y=(keybindings.isHeld('moveDown',keys)?1:0)-(keybindings.isHeld('moveUp',keys)?1:0);
  const n=Math.hypot(x,y);return n?{x:x/n,y:y/n}:{x:0,y:0};
}
const interactRange=entity=>['mentor','warpstone','quest','shop','craft','heal','jobs'].includes(entity?.kind)?165:95;
const editable=()=>{const el=document.activeElement;return !!el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable);};
function trapDialogTab(e,root){
  const f=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.offsetParent);
  if(!f.length)return;
  if(!root.contains(document.activeElement)){e.preventDefault();f[0].focus();}
  else if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}
  else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}
}
document.addEventListener('keydown',e=>{
  if(capturedKeyUps.has(e.code)){e.preventDefault();return;}
  if(keyCapture){
    e.preventDefault();e.stopPropagation();
    capturedKeyUps.add(e.code);
    if(e.repeat)return;
    if(e.code==='Escape'&&keyCapture.id!=='settings'){cancelKeyCapture();return;}
    if(e.ctrlKey||e.altKey||e.metaKey){keyStatus='Ctrl·Alt·Meta 조합은 사용할 수 없습니다. 단일 키를 눌러 주세요.';keyStatusTone='warn';redrawKeybindings(keyCapture.id,keyCapture.slot);return;}
    const {id,slot}=keyCapture,result=keybindings.assign(id,slot,e.code);
    if(!result.ok){keyStatus=result.error;keyStatusTone='warn';redrawKeybindings(id,slot);return;}
    finishKeyEdit(result,`${KEY_ACTIONS.find(a=>a.id===id).label}: ${formatKey(e.code)}로 변경했습니다.`,id,slot);return;
  }
  if(!$('confirm').classList.contains('hidden')){
    if(e.code==='Escape'){e.preventDefault();$('confirm-no')?.click();}
    else if(e.code==='Tab')trapDialogTab(e,$('confirm'));
    return;
  }
  if(e.code==='Escape'&&(editable()||modal)){
    e.preventDefault();if(editable())document.activeElement.blur();else closeModal();return;
  }
  if(e.code==='Tab'&&modal){trapDialogTab(e,$('modal'));return;}
  if(editable()||modal||!inGame||!net?.connected)return;
  if(e.ctrlKey||e.altKey||e.metaKey){resetControls();return;}
  const id=keybindings.actionFor(e.code);
  if(!id)return;
  e.preventDefault();keys.add(e.code);
  if(e.repeat)return;
  if(['skill1','skill2','ultimate','dash','potion','mana'].includes(id)){cast(id);return;}
  if(id==='interact'){action({type:'interact'});return;}
  if(id==='return'){action({type:'return'});return;}
  if(id==='autoAttack'){autoAttack=!autoAttack;notice(autoAttack?'자동 기본 공격 켜짐':'자동 기본 공격 꺼짐');return;}
  if(['inventory','journal','map','party','jobs','events','stories','chronicle','stats','settings'].includes(id)){openPanel(id);return;}
  if(id==='chat'){$('chat').classList.remove('collapsed');$('chat-input').focus();return;}
  if(id==='target'){
    const mobs=(state?.mobs||[]).filter(m=>dist(m,state.self)<650).sort((a,b)=>dist(a,state.self)-dist(b,state.self));
    if(mobs.length){const current=mobs.findIndex(m=>m.id===state.self.target);action({type:'target',id:mobs[(current+1)%mobs.length].id});}
  }
});
document.addEventListener('keyup',e=>{
  keys.delete(e.code);
  if(capturedKeyUps.delete(e.code)){e.preventDefault();e.stopPropagation();}
},true);
document.addEventListener('focusin',()=>{if(editable())resetControls();});
window.addEventListener('blur',()=>{capturedKeyUps.clear();cancelKeyCapture();resetControls();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){capturedKeyUps.clear();cancelKeyCapture();resetControls();}else sound.start();});
function resetKnob(){
  const stick=$('joystick'),knob=$('joystick-knob');if(!stick||!knob)return;
  knob.style.transform='translate(0px,0px)';
}
let joyPointer=null;
$('joystick').addEventListener('pointerdown',e=>{
  e.preventDefault();joyPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveJoystick(e);
});
function moveJoystick(e){
  if(joyPointer!==e.pointerId)return;
  const r=$('joystick').getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),length=Math.hypot(dx,dy),max=r.width*.33;
  const mag=Math.min(1,length/max);
  joystick=length>3?{x:dx/length*mag,y:dy/length*mag}:{x:0,y:0};
  $('joystick-knob').style.transform=`translate(${joystick.x*max}px,${joystick.y*max}px)`;
  pendingInteract=null;
}
$('joystick').addEventListener('pointermove',moveJoystick);
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(event,e=>{
  if(joyPointer===e.pointerId){joyPointer=null;joystick={x:0,y:0};resetKnob();sendInput({x:0,y:0});}
});
$('touch-attack').addEventListener('pointerdown',e=>{e.preventDefault();attackHeld=true;$('touch-attack').setPointerCapture(e.pointerId);cast('basic');});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('touch-attack').addEventListener(event,()=>attackHeld=false);
$('touch-dash').addEventListener('click',()=>cast('dash'));
$('touch-interact').addEventListener('click',()=>action({type:'interact'}));
$('touch-potion').addEventListener('click',()=>cast('potion'));
$('touch-mana').addEventListener('click',()=>cast('mana'));
$('world').addEventListener('contextmenu',e=>e.preventDefault());
$('world').addEventListener('pointerdown',e=>{
  if(!inGame||modal||!state||!net?.connected||state.dungeon?.inputBlocked)return;
  if(e.button===2){cast('skill1');return;}
  const point=renderer.screenToWorld(e.clientX,e.clientY);
  const mobs=state.mobs.filter(m=>creatureHitTest(MONSTERS[m.type],m,point)).sort((a,b)=>dist(a,point)-dist(b,point));
  if(mobs.length){action({type:'target',id:mobs[0].id});cast('basic');return;}
  const interactables=[...(state.challenge?.markers||[]).filter(m=>['rune','seal','crystal'].includes(m.kind)),...(state.dungeon?.markers||[]).filter(m=>['pillar','rune','conduit','revive'].includes(m.kind)),...(state.soul?[state.soul]:[]),...renderer.map.npcs,...renderer.map.portals,...(renderer.map.relics||[]),...(renderer.map.storyPoints||[]),...state.nodes.filter(x=>x.ready),...renderer.map.chests.filter(x=>!profile.opened.includes(x.id))];
  const target=interactables.filter(x=>dist(point,x)<40).sort((a,b)=>dist(a,point)-dist(b,point))[0];
  if(target&&dist(state.self,target)<interactRange(target)){action({type:'interact',id:target.id});return;}
  if(target)pendingInteract={...target};
  else pendingInteract=null;
  renderer.pointerMark={...point,at:performance.now()};
  renderer.clickMove(point);action({type:'move',x:point.x,y:point.y}).then(r=>{if(!r.ok)renderer.stopMotion();});
});
function sendInput(v){
  lastSentInput={x:v.x,y:v.y};net?.emit('input',{...v,seq:++inputSeq},false);
}
renderer.onFrame=(dt,t)=>{
  if(!state||!profile)return;
  const v=inputDirection();renderer.lastInput=v;
  if(t-lastInputAt>50||Math.abs(v.x-lastSentInput.x)+Math.abs(v.y-lastSentInput.y)>.01){
    lastInputAt=t;sendInput(v);
  }
  const attacking=(keybindings.isHeld('basic',keys)||attackHeld||autoAttack)&&!modal&&!editable()&&!document.hidden&&net?.connected&&state.self.hp>0&&!state.dungeon?.inputBlocked;
  if(attacking&&t-lastAttackAt>180&&(state.self.cooldowns.basic||0)<Date.now()+renderer.clock+20){lastAttackAt=t;action({type:'attack',skill:'basic'},{silent:true});}
  if(pendingInteract&&dist(state.self,pendingInteract)<interactRange(pendingInteract)-7&&t-lastInteractAt>900){
    lastInteractAt=t;const target=pendingInteract;pendingInteract=null;action({type:'interact',id:target.id});
  }
  if(t-lastHUD>100){lastHUD=t;updateHUD();}
  if(t-lastMini>(renderer.lowPower?650:380)){
    lastMini=t;renderer.minimap($('minimap'));
    if($('large-map'))renderer.minimap($('large-map'),true);
    if(uiRefreshNeeded){uiRefreshNeeded=false;refreshPanel();}
  }
};
function updateHUD(){
  if(!profile||!state)return;
  const p=profile,s=state.self,z=ZONES[state.zone],c=CLASSES[p.classId],now=Date.now()+renderer.clock;
  const phaseCut=state.dungeon?.phaseTransition||state.encounter?.phaseTransition;
  $('game-ui').classList.toggle('phase-transition-active',!!phaseCut&&phaseCut.starts<=now&&phaseCut.ends>now);
  $('game-ui').classList.toggle('challenge-active',!!state.challenge);
  if($('challenge-hud')){
    show('challenge-hud',!!state.challenge);
    const html=state.challenge?challengeHUD(state.challenge,now,{keyLabel:id=>keybindings.label(id)}):'';
    if($('challenge-hud').innerHTML!==html){
      const focused=$('challenge-hud').contains(document.activeElement)?document.activeElement.dataset.act:null;
      $('challenge-hud').innerHTML=html;
      if(focused)$('challenge-hud').querySelector(`[data-act="${focused}"]`)?.focus({preventScroll:true});
    }
  }
  $('game-ui').classList.toggle('dungeon-active',!!state.dungeon);
  $('game-ui').classList.toggle('realm-active',!!state.realm);
  for(const [id,view,render] of [['dungeon-hud',state.dungeon,dungeonHUD],['realm-hud',state.realm,realmHUD]]){
    const element=$(id);if(!element)continue;
    show(id,!!view);const html=view?render(view,now,{keyLabel:id=>keybindings.label(id)}):'';
    if(element.innerHTML!==html){
      const focused=element.contains(document.activeElement)?{...document.activeElement.dataset}:null;
      element.innerHTML=html;
      if(focused?.act)[...element.querySelectorAll('[data-act]')].find(b=>b.dataset.act===focused.act&&b.dataset.id===focused.id)?.focus({preventScroll:true});
    }
  }
  setText('player-name',p.name);setText('player-class',c.short);setText('player-level',p.level);
  $('hp-fill').style.width=clamp(s.hp/s.maxHp*100,0,100)+'%';$('mp-fill').style.width=clamp(s.mp/s.maxMp*100,0,100)+'%';
  setText('hp-text',`${Math.max(0,s.hp)} / ${s.maxHp}`);setText('mp-text',`${Math.max(0,s.mp)} / ${s.maxMp}`);
  $('xp-fill').style.width=clamp(p.xp/xpRequired(p.level)*100,0,100)+'%';
  $('gold').lastChild?.nodeType===3?$('gold').lastChild.textContent=' '+money(p.gold):$('gold').innerHTML=icon('coin')+' '+money(p.gold);
  setText('zone-name',z.name);setText('zone-subtitle',renderer.map?.terrain?.name||z.subtitle);
  $('zone-subtitle').title=renderer.map?.terrain?.instruction||z.subtitle;
  setText('zone-hint',z.dungeon?'PARTY DUNGEON · 함께 풀어내는 계약':z.secretRealm?'HIDDEN REALM · 경계 너머의 흔적':state.challenge?'PERSONAL CHALLENGE · 나의 기록에 도전':state.zone==='town'?'SAFE HAVEN · 안전 지대':`SHARED WORLD · 권장 레벨 ${z.minLevel}+`);
  setText('stat-points',freePoints(p)>0?`능력치 +${freePoints(p)}`:'능력치');
  if($('stat-alert'))$('stat-alert').classList.toggle('has-points',freePoints(p)>0);
  if($('soul-status')){
    const remain=(p.deathWeakUntil||0)-now;
    $('soul-status').textContent=remain>0?`쇠약 ${Math.ceil(remain/1000)}초 · 공격 −10% / 이동 −8%`:p.soul&&p.soul.expires>now?`영혼 회수 · ${ZONES[p.soul.zone].name} · ${timeLeft(p.soul.expires-now)}`:'';
  }
  setText('online-count',`${config.devGuest?'개발':'온라인'} ${state.online} · 지역 ${state.zoneOnline}`);
  for(const b of $('abilities').children){
    const id=b.dataset.skill,skill=c.skills.find(k=>k.id===id),remaining=Math.max(0,(s.cooldowns[id]||0)-now),cooldown=skill?.cd||(['potion','mana'].includes(id)?5000:4000),locked=skill&&p.level<skill.unlock;
    b.disabled=locked||!!state.dungeon?.inputBlocked;
    b.querySelector('.cd-shade').style.height=locked?'100%':clamp(remaining/cooldown*100,0,100)+'%';
    b.querySelector('.cd-number').textContent=locked?'Lv.'+skill.unlock:remaining>0?(remaining/1000).toFixed(remaining<1000?1:0):'';
    b.querySelector('.count').textContent=['potion','mana'].includes(id)?p.inventory[id]||0:'';
    b.classList.toggle('auto-on',id==='basic'&&autoAttack);
  }
  let boss=state.mobs.find(m=>m.id===s.target&&MONSTERS[m.type].boss);
  if(!boss)boss=state.mobs.find(m=>MONSTERS[m.type].boss&&dist(m,s)<460);
  show('boss-hud',!!boss);
  if(boss){
    setText('boss-name',`${boss.name||MONSTERS[boss.type].name} · ${Math.min(3,(boss.phase||0)+1)}페이즈`);setText('boss-hp',`${Math.round(boss.hp)} / ${Math.round(boss.maxHp)}`);$('boss-fill').style.width=boss.hp/boss.maxHp*100+'%';
    const mechanic=state.bossMechanics?.find(m=>m.bossId===boss.id&&m.active);
    const attack=state.dungeon?.action,info=encounterDescription(MONSTERS[boss.type]);
    setText('boss-tactic',attack?`${attack.name} · ${attack.hint}`:state.dungeon?.hint|| (mechanic?`${mechanic.title} · ${mechanic.instruction}`:boss.challengeShield?'보호막 · 목표를 해결해 봉인을 해제하세요':info?.hint||'바닥의 경고를 피하고, 틈을 노리세요'));
  }
  const target=state.mobs.find(m=>m.id===s.target);
  show('target-info',!!target&&!MONSTERS[target.type].boss);
  if(target){
    const info=encounterDescription(MONSTERS[target.type]);
    setText('target-info',`${target.mechanicObjective?'빙결 핵':target.name||MONSTERS[target.type].name} · Lv.${target.level||MONSTERS[target.type].level} · ${Math.round(target.hp)} HP${info?' · '+info.name:''}`);
    $('target-info').title=info?.hint||'';
  }
  const interactables=[
    ...(state.challenge?.markers||[]).filter(m=>['rune','seal','crystal'].includes(m.kind)).map(m=>({...m,label:m.label+' · '+keybindings.primaryLabel('interact')+' 작동'})),
    ...(state.dungeon?.markers||[]).filter(m=>['pillar','rune','conduit','revive'].includes(m.kind)).map(m=>({...m,label:m.label+' · '+keybindings.primaryLabel('interact')+' 작동'})),
    ...(state.soul?[{...state.soul,label:'내 영혼 흔적 · 손실 회수'}]:[]),
    ...renderer.map.npcs.map(x=>({...x,label:x.name+' · '+x.role})),
    ...renderer.map.portals.map(x=>({...x,label:x.name+' 이동'})),
    ...(renderer.map.relics||[]).map(x=>({...x,label:x.name+' · 문장 읽기'})),
    ...(renderer.map.storyPoints||[]).map(x=>({...x,label:(x.hidden&&!profile.journey?.discovered?.includes(x.job)?'이름 없는 흔적':x.name)+' · '+keybindings.primaryLabel('interact')+' 대화'})),
    ...state.nodes.filter(x=>x.ready).map(x=>({...x,label:ITEMS[x.type].name+' 채집'})),
    ...renderer.map.chests.filter(x=>!p.opened.includes(x.id)).map(x=>({...x,label:'보물 상자 열기'}))
  ].filter(x=>dist(s,x)<interactRange(x)).sort((a,b)=>dist(s,a)-dist(s,b));
  show('interact-hint',!!interactables.length&&!modal&&s.hp>0);
  if(interactables.length)$('interact-hint').querySelector('span').textContent=interactables[0].label;
  for(const element of document.querySelectorAll('[data-countdown]'))element.textContent=element.dataset.countdownMode+' '+timeLeft(Number(element.dataset.countdown)-now);
  const activeEvent=eventList.find(e=>e.status==='active'),nextEvent=eventList.filter(e=>e.start>now).sort((a,b)=>a.start-b.start)[0];
  const event=activeEvent||nextEvent;
  if($('world-status')){$('world-status').textContent=state.fieldTrial?`기억의 시련 ${state.fieldTrial.wave}/3 · 남은 적 ${state.fieldTrial.alive} · ${timeLeft(state.fieldTrial.ends-now)}`:event?`${activeEvent?'출현 중':'다음 월드 보스'} · ${event.name.split(' · ')[0]} · ${timeLeft((activeEvent?event.end:event.start)-now)}  [${keybindings.primaryLabel('events')}]`:`월드 보스 시간표 [${keybindings.primaryLabel('events')}]`;}
  const party=state.party;
  const partySig=party?JSON.stringify(party.members.map(m=>[m.name,m.hp,m.maxHp,m.online])):'';
  if($('party-mini').dataset.sig!==partySig){
    $('party-mini').dataset.sig=partySig;
    $('party-mini').innerHTML=party?party.members.filter(m=>m.id!==p.id).map(m=>`<div class="party-row"><div><span>${esc(m.name)}</span><span>${m.online?'Lv.'+m.level:'접속 종료'}</span></div><div class="mini-hp"><div style="width:${clamp(m.hp/m.maxHp*100,0,100)}%"></div></div></div>`).join(''):'';
  }
}
setInterval(async()=>{
  if(net?.connected){
    const t=performance.now();const response=await net.emit('pingCheck',{});
    if(response?.t){
      const rtt=performance.now()-t;renderer.motion.rtt=Math.min(1000,rtt);
      renderer.clock=response.t-Date.now()+rtt/2;setText('latency',Math.round(rtt)+' ms');
    }
  }
},5000);
setInterval(async()=>{
  if(!config?.configured||!auth?.session)return;
  try{
    const session=await auth.getSession();
    if(net?.connected)await net.emit('refreshAuth',session.access_token);
  }catch(e){notice(e.message,'warn');}
},60000);
window.addEventListener('beforeunload',()=>{sendInput({x:0,y:0});});
async function bootstrap(){
  try{
    const [cfg]=await Promise.all([fetch('/api/config').then(r=>{if(!r.ok)throw new Error('서버에 연결하지 못했습니다.');return r.json();}),renderer.load()]);
    config=cfg;auth=new Auth(config);
    if(config.configured){
      $('landing-status').innerHTML='<i></i> 온라인 서버';
      $('start-note').textContent=auth.session?'저장된 계정으로 모험을 이어갑니다.':'빠른 시작으로 입장할 수 있습니다. 계정 연결은 게임 내 설정에서 가능합니다.';
      const redirectType=await auth.captureRedirect();
      if(redirectType==='recovery'||redirectType==='email_change')openPanel('password');
      else if(redirectType)notice('이메일 인증이 완료되었습니다.','success');
      $('start').disabled=false;
    }else if(config.devGuest){
      $('landing-status').innerHTML='<i></i> 로컬 개발 서버';
      $('start-note').textContent='개발 테스트 모드입니다. 실제 공개 배포에서는 Supabase 계정과 서버 저장을 사용합니다.';
      $('start').disabled=false;
    }else{
      $('landing-status').innerHTML='서버 설정 필요';
      $('start-note').textContent='관리자가 Supabase 환경변수와 데이터베이스를 연결해야 합니다.';
      $('start').disabled=false;$('start').innerHTML='배포 설정 안내 <span>↗</span>';
      $('start').replaceWith($('start').cloneNode(true));
      $('start').addEventListener('click',()=>openPanel('setup'));
    }
    renderer.start();
    if(config.configured&&auth.session)$('start').innerHTML='모험 이어가기 <span>↗</span>';
  }catch(e){
    $('landing-status').textContent='연결 확인 필요';$('start-note').textContent=e.message||'게임 리소스를 불러오지 못했습니다. 새로고침해 주세요.';
  }
}
bootstrap();

// Stop prediction if the transport stays open but authoritative updates stop arriving.
setInterval(()=>{
  if(inGame&&net?.connected&&lastStateAt&&performance.now()-lastStateAt>6500){
    resetControls();show('connection-overlay');
    net.ws?.close(4002,'State stream stalled');
  }
},1000);
