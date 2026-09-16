'use strict';

/**
 * FUSEWILD v6.1 · COMPACT WAVE FLOW / SYNCED BATTLE UI
 * Dynamic, server-authoritative original monster roguelite.
 *
 * Design goals:
 * - 1-4 player synchronous co-op rooms
 * - 50-floor dungeon with three difficulty levels
 * - persistent monster HP / PP / major status across encounters
 * - battle-turn fusion: spend one action to combine two owned monsters
 * - after EVERY dungeon floor, each player drafts one run item
 * - journey encounters can permanently seal/capture monsters
 * - limited rerun gacha and persistent collection/profile
 * - no copyrighted game assets; all shipped art is original procedural pixel art
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const ASSETS = path.join(ROOT, 'assets');
const DATA_DIR = path.join(ROOT, 'data');
const PROFILE_FILE = process.env.PROFILE_FILE ? path.resolve(process.env.PROFILE_FILE) : path.join(DATA_DIR, 'profiles.json');
const ROOM_TTL = 1000 * 60 * 60 * 12;
const DUNGEON_MAX_FLOOR = 50;
const VERSION = '6.1.0';
const DEPLOY_ID = 'FUSEWILD-V610-COMPACT-POKEROGUE-FLOW-20260916';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ADMIN_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const SUPABASE_PUBLIC_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '');
const SUPABASE_ACTIVE = Boolean(SUPABASE_URL && SUPABASE_ADMIN_KEY);
const SUPABASE_AUTH_ACTIVE = SUPABASE_ACTIVE;
const AUTH_COOKIE_ACCESS = 'rift_access';
const AUTH_COOKIE_REFRESH = 'rift_refresh';
const AUTH_CACHE = new Map();

const CATALOG = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'catalog.json'), 'utf8'));
const MOVE_SYSTEM = require('./data/move-library');
const { MOVE_LIBRARY, speciesSignatureMove, speciesLearnset, initialMoves, levelMovesBetween, discChoices, evolutionLevel, xpNeededForLevel, battleXpForFloor, movePoolCountFor } = MOVE_SYSTEM;
const CARDS = CATALOG.cards;
const ITEMS = CATALOG.items;
const BIOMES = CATALOG.biomes;
const ENEMIES = CATALOG.enemies;
const BOSSES = CATALOG.bosses;
const RELICS = CATALOG.relics;
const BANNER = CATALOG.banner;
const RARITY = CATALOG.rarities;
const ELEMENTS = CATALOG.elements;
const DIFFICULTIES = CATALOG.difficulties;
const STARTER_POOL = CATALOG.starterPool;
const DECK_MIN = Number(CATALOG.spellDeck?.min || 8);
const DECK_MAX = Number(CATALOG.spellDeck?.max || 12);
const SPELL_DECK_MAX = DECK_MAX;
const MONSTER_PARTY_MAX = Number(CATALOG.monsterParty?.maxSlots || 6);
const MONSTER_POINT_BUDGET = Number(CATALOG.monsterParty?.pointBudget || 10);
const MONSTERS = [...ENEMIES, ...BOSSES];
const MONSTER_BY_ID = Object.fromEntries(MONSTERS.map(m => [m.id, m]));
const STARTER_MONSTERS = (CATALOG.monsterParty?.starterIds || ENEMIES.filter(e => e.tier === 'common').slice(0, 3).map(e => e.id)).slice(0,3).filter(id => MONSTER_BY_ID[id]);
const ELEMENT_ADVANTAGE = {
  '화염':['자연','강철'], '물':['화염','수정'], '자연':['물','바람'], '빛':['그림자','공허'],
  '그림자':['빛','시간'], '강철':['수정','별'], '바람':['화염','번개'], '번개':['물','강철'],
  '별':['그림자','시간'], '시간':['자연','공허'], '공허':['별','수정'], '수정':['빛','바람']
};

const BATTLE_RULES = Object.assign({
  singleActive:1,doubleActive:2,tacticCardsPerTurn:0,moveSlots:4,doubleBattleEvery:8,
  moveUnlockLevels:[1,1,1,1],startMonsterLevel:5,maxMonsterLevel:100,
  progression:'battle-exp',levelMoveMode:'milestone-learnset'
}, CATALOG.battleRules || {});

const FUSION_ELEMENT_ROOTS = {
  '화염':'홍련','물':'창해','자연':'수림','빛':'성광','그림자':'흑영','강철':'철성',
  '바람':'창풍','번개':'뇌전','별':'성운','시간':'시공','공허':'심연','수정':'수정'
};
const FUSION_ELEMENT_COLORS = {
  '화염':['#ffb26d','#ff553d'],'물':['#8be7ff','#2f81ff'],'자연':['#9ef58c','#2cc86a'],'빛':['#fff0a6','#ffd54a'],
  '그림자':['#9484ff','#4b2d8f'],'강철':['#d7dde8','#8f99ad'],'바람':['#d5fff6','#66d4b7'],'번개':['#ffe685','#ffbc1f'],
  '별':['#b6ccff','#6f7bff'],'시간':['#9cf3ff','#39b1c7'],'공허':['#9a8cff','#16182b'],'수정':['#ffd0ff','#8e5cff']
};
const FUSION_ARCHETYPE_ROOTS = {
  beast:'라이칸', crab:'크랩', drone:'기어', golem:'거신', insect:'인섹트', knight:'팔라딘', leviathan:'리바이어선',
  mushroom:'포자', phoenix:'피닉스', serpent:'나가', slime:'슬라임', spirit:'정령', tyrant:'군주', watcher:'감시자', wing:'익조', wraith:'망령'
};
const FUSION_ARCHETYPE_ASCENDED = {
  beast:'라이칸로드', crab:'갑각군주', drone:'오버기어', golem:'거신왕', insect:'곤충제왕', knight:'성검군주', leviathan:'심해황',
  mushroom:'포자군체', phoenix:'불사황', serpent:'나가로드', slime:'점성군체', spirit:'정령왕', tyrant:'폭군제왕', watcher:'천안감시자', wing:'천익황', wraith:'망령군주'
};
const FUSION_EPITHETS = ['프라임','제로스','노바','오리진','엑셀','네뷸라','시그마','아크','루나','오메가','베스퍼','크로노','아스트라','레퀴엠','오블리비언','세라프'];
function hashString(value=''){let h=2166136261>>>0;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function svgEscape(v=''){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fusionPairKey(a,b){return [String(a||''),String(b||'')].sort().join('::');}
function fusionElementTheme(a,b){
  const ra=FUSION_ELEMENT_ROOTS[a]||'혼돈', rb=FUSION_ELEMENT_ROOTS[b]||ra;
  if(String(a||'')===String(b||'')) return `${ra}극성`;
  return `${ra}${rb}`;
}
function fusionArchetypeTitle(a,b){
  const aa=String(a||'beast'), bb=String(b||aa);
  if(aa===bb) return FUSION_ARCHETYPE_ASCENDED[aa] || `${FUSION_ARCHETYPE_ROOTS[aa]||'리프트'}로드`;
  return `${FUSION_ARCHETYPE_ROOTS[aa]||'리프트'}${FUSION_ARCHETYPE_ROOTS[bb]||'코어'}`;
}
function fusionDisplayNameFor(a,b){
  const aId=a?.speciesId||a?.id||a?.instanceId||a?.name||'A', bId=b?.speciesId||b?.id||b?.instanceId||b?.name||'B';
  const sig=fusionPairKey(aId,bId);
  const theme=fusionElementTheme(a?.element,a?.secondaryElement||b?.element||a?.element);
  const body=fusionArchetypeTitle(a?.archetype,a?.secondaryArchetype||b?.archetype||a?.archetype);
  const ep=FUSION_EPITHETS[hashString(sig)%FUSION_EPITHETS.length];
  return `${theme} ${body} ${ep}`.replace(/\s+/g,' ').trim();
}
function fusionDisplayNameRaw(primaryId,secondaryId,primaryElement,secondaryElement,primaryArchetype,secondaryArchetype){
  const sig=fusionPairKey(primaryId,secondaryId);
  const theme=fusionElementTheme(primaryElement,secondaryElement||primaryElement);
  const body=fusionArchetypeTitle(primaryArchetype,secondaryArchetype||primaryArchetype);
  const ep=FUSION_EPITHETS[hashString(sig)%FUSION_EPITHETS.length];
  return `${theme} ${body} ${ep}`.replace(/\s+/g,' ').trim();
}
function fusionArtDataUri({primarySprite='',secondarySprite='',primaryElement='공허',secondaryElement='공허',fusionName='',signature=''}){
  const paletteA=FUSION_ELEMENT_COLORS[primaryElement]||['#d3d7ff','#6f7bff'];
  const paletteB=FUSION_ELEMENT_COLORS[secondaryElement]||paletteA;
  const sigHash=hashString(`${signature}|${primarySprite}|${secondarySprite}|${primaryElement}|${secondaryElement}`);
  const sig=sigHash%4;
  const icon=[
    '<path d="M96 26l14 22 25 5-17 18 3 25-25-10-25 10 3-25-17-18 25-5z" fill="#ffffff" opacity=".22"/>',
    '<path d="M96 28l28 28-28 28-28-28z" fill="#ffffff" opacity=".22"/><circle cx="96" cy="56" r="11" fill="#fff" opacity=".22"/>',
    '<circle cx="96" cy="56" r="16" fill="none" stroke="#fff" stroke-width="6" opacity=".22"/><path d="M96 30v52M70 56h52" stroke="#fff" stroke-width="5" opacity=".22"/>',
    '<path d="M96 24l16 16-16 16-16-16zM96 56l20 20-20 20-20-20z" fill="#fff" opacity=".22"/>'
  ][sig];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">  <defs>    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${paletteA[0]}"/><stop offset="100%" stop-color="${paletteB[1]}"/></linearGradient>    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".92"/><stop offset="100%" stop-color="#ffffff" stop-opacity=".18"/></linearGradient>    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#08101f" flood-opacity=".45"/></filter>    <pattern id="grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="1"/></pattern>  </defs>  <rect x="6" y="6" width="180" height="180" rx="28" fill="url(#bg)"/>  <rect x="14" y="14" width="164" height="164" rx="22" fill="url(#grid)" opacity=".65"/>  <circle cx="64" cy="64" r="48" fill="#fff" opacity=".10"/>  <circle cx="134" cy="128" r="40" fill="#000" opacity=".12"/>  <path d="M18 126c28-30 58-46 91-49 29-3 46-17 65-40v72c-21 31-46 48-76 53-34 7-59 0-80-36z" fill="#fff" opacity=".08"/>  ${icon}  <g filter="url(#shadow)">    ${secondarySprite?`<image href="${svgEscape(secondarySprite)}" x="80" y="58" width="84" height="84" preserveAspectRatio="xMidYMid meet" opacity=".84"/>`:''}    ${primarySprite?`<image href="${svgEscape(primarySprite)}" x="24" y="26" width="108" height="108" preserveAspectRatio="xMidYMid meet"/>`:''}  </g>  <circle cx="96" cy="96" r="70" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="4"/>  <rect x="12" y="12" width="168" height="168" rx="24" fill="none" stroke="url(#rim)" stroke-width="4"/>  <text x="18" y="162" fill="#fff" fill-opacity=".95" font-size="14" font-weight="700" font-family="Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif">FUSION</text>  <text x="18" y="178" fill="#fff" fill-opacity=".84" font-size="10" font-family="Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif">${svgEscape(String(fusionName||'RIFT FUSION').slice(0,34))}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// V4.2: a PokéRogue-like run cadence is recreated with original FUSEWILD rules.
// No external game source, names, move data, or assets are copied here.
const MOVE_REWRITES = [
  { id:'echo', name:'잔향 복제', icon:'≋', kinds:['attack','burst'], desc:'명중 시 원래 위력의 35%로 추가타가 한 번 발생합니다.' },
  { id:'overclock', name:'과전류 코어', icon:'⚡', kinds:['attack','burst'], desc:'위력 +18% · 명중 -6% · 사용 PP는 그대로 유지됩니다.' },
  { id:'breaker', name:'균열 관통', icon:'◇', kinds:['attack','burst'], desc:'BREAK +16. 이 기술로 자세를 붕괴시키면 RES +1.' },
  { id:'blood', name:'역류 증폭', icon:'◆', kinds:['attack','burst'], desc:'위력 +35%. 사용할 때 최대 HP의 5%를 소모합니다.' },
  { id:'zero', name:'제로 루프', icon:'0', kinds:['attack','burst'], desc:'빗나가면 사용한 PP를 1 돌려받고 RIFT +1.' },
  { id:'aegis', name:'반전 방벽', icon:'⬢', kinds:['guard','heal','status'], desc:'사용 후 보호막 +6 · 다음 공격 보너스 +4.' },
  { id:'feedback', name:'피드백 증폭', icon:'↟', kinds:['guard','heal','status'], desc:'방어·회복·강화 수치 +35%, 대신 최대 PP -1.' },
  { id:'resonator', name:'공명 증폭기', icon:'✦', kinds:['guard','heal','status'], desc:'사용 후 GENE +1 · RES +1.' },
  { id:'orbit', name:'궤도 링크', icon:'◎', kinds:['attack','burst','guard','heal','status'], desc:'사용 후 자신의 PP가 가장 적은 다른 기술 PP +1.' }
];
const MOVE_REWRITE_BY_ID = Object.fromEntries(MOVE_REWRITES.map(x => [x.id, x]));

const MOVE_MASTERY_THRESHOLDS = [0, 5, 13];
function moveMasteryStage(uses=0){const n=Math.max(0,Number(uses||0));return n>=MOVE_MASTERY_THRESHOLDS[2]?2:n>=MOVE_MASTERY_THRESHOLDS[1]?1:0;}
function moveMasteryLabel(stage=0){return Number(stage)>=2?'++':Number(stage)>=1?'+':'';}
function applyMoveMastery(move,stage=0){
  const out={...move};const s=Math.max(0,Math.min(2,Number(stage||0)));if(!s)return out;
  const scale=s===1?1.10:1.22;
  for(const key of ['power','shield','heal','boost','stagger'])if(Number(out[key]||0)>0)out[key]=Math.max(1,Math.round(Number(out[key])*scale));
  if(Number(out.ratio||0)>0)out.ratio=Number((Number(out.ratio)*scale).toFixed(3));
  if(Number(out.lifesteal||0)>0)out.lifesteal=Math.min(.75,Number((Number(out.lifesteal)+(s===1?.03:.07)).toFixed(3)));
  if(Number(out.splash||0)>0)out.splash=Math.min(.9,Number((Number(out.splash)+(s===1?.04:.09)).toFixed(3)));
  out.accuracy=Math.min(100,Number(out.accuracy||100)+(s===1?1:3));
  if(s>=2&&Number(out.cooldown||0)>0)out.cooldown=Math.max(0,Number(out.cooldown)-1);
  out.masteryStage=s;out.masteryLabel=moveMasteryLabel(s);return out;
}

function levelCapForFloor(floor) {
  const caps = [10, 16, 24, 32, 38];
  const set = Math.floor((Math.max(1, Number(floor || 1)) - 1) / 10);
  return Math.min(Number(BATTLE_RULES.maxMonsterLevel || 100), caps[Math.min(caps.length - 1, set)]);
}
function compatibleRewrites(move) {
  const kind = move?.kind || 'attack';
  return MOVE_REWRITES.filter(x => x.kinds.includes(kind));
}
function biomeForkCandidates(room) {
  const n = BIOMES.length;
  if (n <= 1) return [0];
  const cur = Math.max(0, Math.min(n - 1, Number(room.biomeIndex || 0)));
  const chapter = Math.floor(Math.max(1, Number(room.floor || 1)) / 10);
  const first = (cur + 1) % n;
  let second = (cur + 2 + chapter) % n;
  if (second === cur || second === first) second = (first + 1) % n;
  if (second === cur) second = (second + 1) % n;
  return [...new Set([first, second])].slice(0, 2);
}

// V5.6: persistent PP / status / fusion battle core.  The mechanics are implemented
// independently for FUSEWILD; existing original monster art/data stay untouched.
function defaultMovePp(move){
  if(!move)return 10;
  if(move.signature)return 5;
  if(move.kind==='burst')return 6;
  if(move.kind==='heal')return 8;
  if(move.kind==='guard'||move.kind==='status')return 10;
  const p=Number(move.power||0)+Number(move.ratio||0)*10;
  return p>=28?8:p>=20?10:14;
}
function normalizeMovePp(move){
  const max=Math.max(1,Number(move?.maxPp||move?.ppMax||defaultMovePp(move)));
  const cur=Number.isFinite(Number(move?.pp))?Number(move.pp):max;
  return {maxPp:max,pp:clamp(cur,0,max)};
}
function resetMonsterBattleResources(u,{fullHeal=false}={}){
  if(!u)return;
  normalizeMonsterMoves(u);
  if(fullHeal)u.hp=u.maxHp;
  u.block=0;u.revived=false;u.heldItemUsed=false;u.majorStatus=null;u.statusTurns=0;
  u.statStages={atk:0,def:0,speed:0,accuracy:0,evasion:0};
  for(const mv of u.moves||[]){const pp=normalizeMovePp(mv);mv.maxPp=pp.maxPp;mv.pp=pp.maxPp;mv.cooldownRemaining=0;}
}
function normalizeMajorStatus(u){
  if(!u)return;
  if(!['burn','poison','paralysis','sleep','freeze'].includes(String(u.majorStatus||'')))u.majorStatus=null;
  u.statusTurns=Math.max(0,Number(u.statusTurns||0));
  u.statStages=u.statStages&&typeof u.statStages==='object'?u.statStages:{atk:0,def:0,speed:0,accuracy:0,evasion:0};
  for(const k of ['atk','def','speed','accuracy','evasion'])u.statStages[k]=clamp(Number(u.statStages[k]||0),-6,6);
}
function stageMultiplier(stage){const s=clamp(Number(stage||0),-6,6);return s>=0?(2+s)/2:2/(2-s);}
function monsterSpeedValue(u){
  normalizeMajorStatus(u);const fast=new Set(['assassin','wing','drone','serpent']),slow=new Set(['golem','crab','leviathan']);
  let base=10+Number(u?.level||1)*.25+(fast.has(u?.archetype)?4:slow.has(u?.archetype)?-2:0);
  base*=stageMultiplier(u?.statStages?.speed||0);if(u?.majorStatus==='paralysis')base*=.55;return base;
}
function monsterStatusLabel(status){return({burn:'화상',poison:'중독',paralysis:'마비',sleep:'수면',freeze:'빙결'})[status]||status||'';}
function tryMajorStatus(room,pc,u,status,turns=0,source=null,emit=true){
  if(!u||u.hp<=0||u.majorStatus)return false;
  u.majorStatus=status;u.statusTurns=turns||((status==='sleep')?2:(status==='freeze'?2:0));
  if(emit)pushRoomEvent(room,'monster-status',`${u.name} ${monsterStatusLabel(status)}!`,{playerId:pc?.playerId||null,instanceId:u.instanceId,monsterName:u.name,status,label:monsterStatusLabel(status),turns:u.statusTurns,source:source?.name||null});return true;
}
function preActionStatus(room,pc,u){
  normalizeMajorStatus(u);const st=u.majorStatus;if(!st)return false;
  if(st==='sleep'){u.statusTurns=Math.max(0,u.statusTurns-1);pushRoomEvent(room,'monster-status-turn',`${u.name}은(는) 잠들어 있다.`,{playerId:pc.playerId,instanceId:u.instanceId,status:st,label:'수면',blocked:true});if(u.statusTurns<=0){u.majorStatus=null;pushRoomEvent(room,'monster-status-cure',`${u.name}이(가) 깨어났다.`,{playerId:pc.playerId,instanceId:u.instanceId,status:st,label:'수면'});}return true;}
  if(st==='freeze'){if((process.env.TEST_MODE!=='1'&&Math.random()<.22)){u.majorStatus=null;u.statusTurns=0;pushRoomEvent(room,'monster-status-cure',`${u.name}의 얼음이 녹았다.`,{playerId:pc.playerId,instanceId:u.instanceId,status:st,label:'빙결'});return false;}pushRoomEvent(room,'monster-status-turn',`${u.name}은(는) 얼어 움직일 수 없다.`,{playerId:pc.playerId,instanceId:u.instanceId,status:st,label:'빙결',blocked:true});return true;}
  if(st==='paralysis'&&process.env.TEST_MODE!=='1'&&Math.random()<.25){pushRoomEvent(room,'monster-status-turn',`${u.name}은(는) 마비되어 움직이지 못했다.`,{playerId:pc.playerId,instanceId:u.instanceId,status:st,label:'마비',blocked:true});return true;}
  return false;
}
function endTurnMonsterStatus(room,pc,u){
  if(!u||u.hp<=0)return;
  normalizeMajorStatus(u);let damage=0;
  if(u.majorStatus==='burn')damage=Math.max(1,Math.floor(u.maxHp/16));
  if(u.majorStatus==='poison')damage=Math.max(1,Math.floor(u.maxHp/8));
  if(damage>0){monsterDamage(room,pc,u,damage,null);pushRoomEvent(room,'monster-status-tick',`${u.name} ${monsterStatusLabel(u.majorStatus)} 피해 ${damage}`,{playerId:pc.playerId,instanceId:u.instanceId,status:u.majorStatus,label:monsterStatusLabel(u.majorStatus),damage});}
}
function fusionMovePool(a,b){
  const map=new Map();for(const mv of [...(a?.moves||[]),...(b?.moves||[])])if(mv?.id&&!map.has(mv.id))map.set(mv.id,clone(mv));return [...map.values()];
}
function selectedFusionMoves(a,b,moveIds=[]){
  const pool=fusionMovePool(a,b),want=new Set((Array.isArray(moveIds)?moveIds:[]).map(String));let picked=pool.filter(m=>want.has(String(m.id))).slice(0,4);
  for(const mv of pool)if(picked.length<4&&!picked.some(x=>x.id===mv.id))picked.push(mv);
  return picked.slice(0,4).map(mv=>{const p=normalizeMovePp(mv);return {...mv,maxPp:p.maxPp,pp:Math.min(p.pp,p.maxPp),cooldownRemaining:0};});
}
function prepareMove(move, monster){
  if(!move)return null;
  const pp=normalizeMovePp(move);
  return {...clone(move),element:move.element||monster?.element||'공허',cooldownRemaining:0,maxPp:pp.maxPp,pp:pp.pp,unlockLevel:Number(move.unlockLevel||1),masteryUses:Number(move.masteryUses||0),masteryStage:Number(move.masteryStage||moveMasteryStage(move.masteryUses||0))};
}
function buildMonsterMoves(monster){
  const m=typeof monster==='string'?MONSTER_BY_ID[monster]:monster;if(!m)return[];
  return initialMoves(m).slice(0,Number(BATTLE_RULES.moveSlots||4)).map(x=>prepareMove(x,m));
}
function buildSkillDiscMoves(monster,level=1,nonce=0){
  const m=typeof monster==='string'?MONSTER_BY_ID[monster]:monster;if(!m)return[];
  return discChoices(m,level,3,nonce).map(x=>prepareMove(x,m));
}
function monsterLearnset(monster){
  const m=typeof monster==='string'?MONSTER_BY_ID[monster]:monster;if(!m)return[];
  return speciesLearnset(m).map(x=>prepareMove(x,m));
}
function normalizeMonsterMoves(u){
  const species=MONSTER_BY_ID[u.speciesId];if(!species)return[];
  const base=buildMonsterMoves(species);
  const raw=Array.isArray(u.moves)?u.moves.filter(Boolean):[];
  // Fusion has a player-selected four-move set. Do not remigrate it back to the primary species learnset mid-battle.
  if(u.fused&&raw.length){u.moves=raw.slice(0,Number(BATTLE_RULES.moveSlots||4)).map(x=>prepareMove(x,species));u.evolutionLevel=Number(u.evolutionLevel||evolutionLevel(species));u.pendingLearnMoves=Array.isArray(u.pendingLearnMoves)?u.pendingLearnMoves:[];return u.moves;}
  // v4.1 used four hard-coded :m1~:m4 / :disc:* moves. Existing saves are
  // migrated into the expanded learnset the first time they enter a battle.
  const legacy=raw.length>0&&raw.every(x=>String(x.id||'').startsWith(`${u.speciesId}:m`)||String(x.id||'').startsWith(`${u.speciesId}:disc:`));
  u.moves=(raw.length&&!legacy?raw:base).map(x=>prepareMove(x,species));
  // v5.4 migration: every existing save receives its species signature move without
  // requiring a fresh run. The signature occupies slot 1; the other learned moves stay.
  const signature=base.find(x=>x.signature)||prepareMove(speciesSignatureMove(species),species);
  if(signature&&!u.moves.some(x=>x.id===signature.id))u.moves=[{...signature},...u.moves].slice(0,Number(BATTLE_RULES.moveSlots||4));
  const known=new Set(u.moves.map(x=>x.id));
  for(const mv of base){if(!known.has(mv.id)&&u.moves.length<Number(BATTLE_RULES.moveSlots||4)){u.moves.push({...mv});known.add(mv.id);}}
  u.moves=u.moves.slice(0,Number(BATTLE_RULES.moveSlots||4));
  while(u.moves.length<Number(BATTLE_RULES.moveSlots||4))u.moves.push({...base[u.moves.length%base.length]});
  u.evolutionLevel=Number(u.evolutionLevel||evolutionLevel(species));
  u.pendingLearnMoves=Array.isArray(u.pendingLearnMoves)?u.pendingLearnMoves:[];
  return u.moves;
}

const RUN_CONTRACTS = [
  { id: 'vanguard', name: '선봉자의 서약', icon: '⚔', desc: '초반 화력을 얻는 대신 생존력을 일부 포기합니다.', detail: '최대 HP -8 · 피해 +6% · 시작 골드 +120' },
  { id: 'warden', name: '수호자의 서약', icon: '▣', desc: '느리지만 안정적인 생존 빌드를 시작합니다.', detail: '최대 HP +12 · 전투 시작 방어 +6 · 시작 골드 -40' },
  { id: 'curator', name: '수집가의 서약', icon: '◇', desc: '보상 선택지를 넓혀 원하는 빌드를 찾기 쉬워집니다.', detail: '보상 선택지 +1 · 고등급 보상 확률 +10% · 최대 HP -6' },
  { id: 'minimalist', name: '기술가의 서약', icon: '◎', desc: '기술 PP를 늘려 장기전에 강한 파티를 만듭니다.', detail: '모든 기술 최대 PP +1 · 시작 골드 +40' },
  { id: 'echo', name: '유물 사냥꾼의 서약', icon: '✦', desc: '초기 유물 하나로 런의 방향을 빠르게 정합니다.', detail: '일반/희귀 유물 1개 획득 · 시작 골드 -70' },
  { id: 'gambler', name: '균열 도박사의 서약', icon: '⬡', desc: '체력을 희생해 보상 재굴림과 선택 폭을 확보합니다.', detail: '최대 HP -10 · 균열 파편 +3 · 재굴림 비용 -30%' }
];
const CONTRACT_BY_ID = Object.fromEntries(RUN_CONTRACTS.map(x => [x.id, x]));
const THREAT_TOKENS = [
  { id:'ferocity', name:'광폭 파동', icon:'▲', desc:'적 공격력 +4% · 고등급 보상 +5%', atk:0.04, hp:0.00, reward:0.05 },
  { id:'bulwark', name:'중갑 파동', icon:'■', desc:'적 체력 +6% · 고등급 보상 +5%', atk:0.00, hp:0.06, reward:0.05 },
  { id:'hunger', name:'심연 포식', icon:'◆', desc:'적 공격력 +2% / 체력 +3% · 고등급 보상 +7%', atk:0.02, hp:0.03, reward:0.07 },
  { id:'distortion', name:'왜곡 증폭', icon:'✦', desc:'적 공격력 +3% / 체력 +2% · 고등급 보상 +8%', atk:0.03, hp:0.02, reward:0.08 }
];

const BATTLE_MODIFIERS = [
  { id:'overcharge', name:'과충전 지대', icon:'⚡', desc:'아군 속도 +10% · 적 HP +12%', allySpeed:0.10, enemyHp:0.12 },
  { id:'fracture', name:'균열 노출', icon:'◇', desc:'BREAK 축적 +35% · 적 공격 +8%', breakGain:0.35, enemyAtk:0.08 },
  { id:'focus', name:'정밀 전장', icon:'◎', desc:'아군 명중 +8% · 적 HP +8%', allyAccuracy:8, enemyHp:0.08 },
  { id:'hunt', name:'집중 사냥', icon:'◉', desc:'BREAK 상태의 적이 받는 피해 +18% · 적 공격 +6%', markDamage:0.18, enemyAtk:0.06 }
];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]));

fs.mkdirSync(path.dirname(PROFILE_FILE), { recursive: true });
if (!fs.existsSync(PROFILE_FILE)) fs.writeFileSync(PROFILE_FILE, '{}');

const rooms = new Map();
const clientsByRoom = new Map();
let profiles = readJson(PROFILE_FILE, {});

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function uid(prefix = 'x') { return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weighted(items, weightFn) {
  let sum = 0;
  const rows = items.map(item => {
    const w = Math.max(0, Number(weightFn(item) || 0));
    sum += w;
    return [item, w];
  });
  if (!rows.length) return null;
  if (!sum) return rows[0][0];
  let r = Math.random() * sum;
  for (const [item, w] of rows) {
    r -= w;
    if (r <= 0) return item;
  }
  return rows.at(-1)[0];
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
let supabaseSyncTimer = null;
let supabaseSyncBusy = false;
let supabaseSyncAgain = false;
const roomSyncTimers = new Map();

async function supabaseRequest(pathname, options = {}) {
  if (!SUPABASE_ACTIVE) return null;
  const headers = {
    apikey: SUPABASE_ADMIN_KEY,
    Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL}${pathname}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
function cookieBase(req) {
  const secure = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' || Boolean(process.env.RENDER);
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
function setAuthCookies(req, res, session) {
  if (!session?.access_token || !session?.refresh_token) return;
  const base = cookieBase(req);
  const accessAge = Math.max(300, Number(session.expires_in || 3600));
  const refreshAge = 60 * 60 * 24 * 30;
  res.setHeader('Set-Cookie', [
    `${AUTH_COOKIE_ACCESS}=${encodeURIComponent(session.access_token)}; ${base}; Max-Age=${accessAge}`,
    `${AUTH_COOKIE_REFRESH}=${encodeURIComponent(session.refresh_token)}; ${base}; Max-Age=${refreshAge}`
  ]);
}
function clearAuthCookies(req, res) {
  const base = cookieBase(req);
  res.setHeader('Set-Cookie', [
    `${AUTH_COOKIE_ACCESS}=; ${base}; Max-Age=0`,
    `${AUTH_COOKIE_REFRESH}=; ${base}; Max-Age=0`
  ]);
}
function normalizeAccountId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(id)) throw new Error('아이디는 영문 소문자, 숫자, _ 조합 3~20자로 입력해 주세요.');
  return id;
}
function validatePassword(raw) {
  const password = String(raw || '');
  if (password.length < 6 || password.length > 72) throw new Error('비밀번호는 6~72자로 입력해 주세요.');
  return password;
}
function accountEmail(accountId) { return `${accountId}@players.riftdeck.local`; }
async function supabaseAuthRequest(pathname, options = {}, admin = false, bearer = '') {
  if (!SUPABASE_AUTH_ACTIVE) throw new Error('Supabase 로그인이 아직 연결되지 않았습니다.');
  const key = admin ? SUPABASE_ADMIN_KEY : (SUPABASE_PUBLIC_KEY || SUPABASE_ADMIN_KEY);
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : admin ? { Authorization: `Bearer ${SUPABASE_ADMIN_KEY}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL}${pathname}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!response.ok) {
    const msg = data?.msg || data?.message || data?.error_description || data?.error || `Supabase Auth ${response.status}`;
    const err = new Error(String(msg).slice(0, 300));
    err.status = response.status;
    throw err;
  }
  return data;
}
async function passwordSession(accountId, password) {
  return supabaseAuthRequest('/auth/v1/token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email: accountEmail(accountId), password })
  });
}
async function refreshSession(refreshToken) {
  return supabaseAuthRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', body: JSON.stringify({ refresh_token: refreshToken })
  });
}
async function getAuthUserByToken(token) {
  if (!token) return null;
  const cached = AUTH_CACHE.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  try {
    const user = await supabaseAuthRequest('/auth/v1/user', { method: 'GET' }, false, token);
    AUTH_CACHE.set(token, { user, expiresAt: Date.now() + 5 * 60 * 1000 });
    return user;
  } catch { return null; }
}
async function authUserFromRequest(req, res, tryRefresh = true) {
  if (!SUPABASE_AUTH_ACTIVE) return null;
  const cookies = parseCookies(req);
  const access = cookies[AUTH_COOKIE_ACCESS] || '';
  let user = await getAuthUserByToken(access);
  if (user) return user;
  if (!tryRefresh || !cookies[AUTH_COOKIE_REFRESH]) return null;
  try {
    const session = await refreshSession(cookies[AUTH_COOKIE_REFRESH]);
    setAuthCookies(req, res, session);
    user = session.user || await getAuthUserByToken(session.access_token);
    return user || null;
  } catch {
    clearAuthCookies(req, res);
    return null;
  }
}
function accountIdFromUser(user) {
  const meta = user?.user_metadata || {};
  if (meta.account_id) return String(meta.account_id);
  const email = String(user?.email || '');
  return email.endsWith('@players.riftdeck.local') ? email.slice(0, -'@players.riftdeck.local'.length) : email;
}
function mergeGuestProfileInto(targetId, guestProfileId, nickname, accountId, force = false) {
  const source = profiles[String(guestProfileId || '')];
  if (!source || source.id === targetId) return ensureProfile(targetId, nickname);
  if (profiles[targetId] && !force) return ensureProfile(targetId, nickname);
  const merged = migrateProfile(clone(source));
  merged.id = targetId;
  merged.nickname = sanitizeName(nickname || merged.nickname);
  merged.createdAt = profiles[targetId]?.createdAt || Date.now();
  merged.lastSeenAt = Date.now();
  merged.cloud = true;
  merged.accountId = accountId;
  profiles[targetId] = merged;
  return merged;
}

async function hydrateProfilesFromSupabase() {
  if (!SUPABASE_ACTIVE) return;
  try {
    const rows = await supabaseRequest('/rest/v1/rift_profiles?select=profile_id,data&limit=10000');
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row || !row.profile_id || !row.data || typeof row.data !== 'object') continue;
        profiles[row.profile_id] = migrateProfile(row.data);
      }
      const tmp = PROFILE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2));
      fs.renameSync(tmp, PROFILE_FILE);
      console.log(`[FUSEWILD] loaded ${rows.length} Supabase profile rows`);
    }
  } catch (err) {
    console.warn('[FUSEWILD] Supabase profile hydrate skipped:', err.message);
  }
}

async function flushProfilesToSupabase() {
  if (!SUPABASE_ACTIVE) return;
  if (supabaseSyncBusy) { supabaseSyncAgain = true; return; }
  supabaseSyncBusy = true;
  try {
    const rows = Object.values(profiles).filter(profile => profile.cloud).map(profile => ({
      profile_id: profile.id,
      data: profile,
      updated_at: new Date().toISOString()
    }));
    if (rows.length) {
      await supabaseRequest('/rest/v1/rift_profiles?on_conflict=profile_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
      });
    }
  } catch (err) {
    console.warn('[FUSEWILD] Supabase profile sync failed:', err.message);
  } finally {
    supabaseSyncBusy = false;
    if (supabaseSyncAgain) { supabaseSyncAgain = false; setTimeout(() => flushProfilesToSupabase(), 250).unref?.(); }
  }
}

function queueSupabaseSync() {
  if (!SUPABASE_ACTIVE) return;
  if (supabaseSyncTimer) clearTimeout(supabaseSyncTimer);
  supabaseSyncTimer = setTimeout(() => { supabaseSyncTimer = null; flushProfilesToSupabase(); }, 250);
  supabaseSyncTimer.unref?.();
}

function saveProfiles() {
  const tmp = PROFILE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2));
  fs.renameSync(tmp, PROFILE_FILE);
  queueSupabaseSync();
}

async function persistRoomToSupabase(room) {
  if (!SUPABASE_ACTIVE || !room?.id) return;
  try {
    await supabaseRequest('/rest/v1/rift_rooms?on_conflict=room_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ room_id: room.id, data: room, updated_at: new Date().toISOString() }])
    });
  } catch (err) {
    console.warn(`[FUSEWILD] room ${room.id} snapshot failed:`, err.message);
  }
}
function persistRoomFallbackToProfiles(room) {
  if (!room?.id || !Array.isArray(room.players)) return;
  let changed=false;
  const finished=['ended','cleared'].includes(room.status),snapshot=finished?null:clone(room);
  for (const rp of room.players) {
    const prof=profiles[String(rp.id||'')]; if(!prof) continue;
    if(finished){if(String(prof.activeRoomId||'')===String(room.id)){prof.activeRoomId='';prof.activeRoomSnapshot=null;changed=true;}}
    else{prof.activeRoomId=room.id;prof.activeRoomSnapshot=snapshot;changed=true;}
  }
  if(changed) saveProfiles();
}
function queueRoomSync(room) {
  if (!room?.id) return;
  const old = roomSyncTimers.get(room.id);
  if (old) clearTimeout(old);
  const timer = setTimeout(() => {
    roomSyncTimers.delete(room.id);
    // V55: keep a profile-level fallback snapshot as well as the room table. This makes
    // Continue survive deployments even when the optional rift_rooms table is unavailable.
    persistRoomFallbackToProfiles(room);
    if (SUPABASE_ACTIVE) persistRoomToSupabase(room);
  }, 260);
  timer.unref?.();
  roomSyncTimers.set(room.id, timer);
}
async function deleteRoomSnapshot(roomId) {
  if (!SUPABASE_ACTIVE || !roomId) return;
  try { await supabaseRequest(`/rest/v1/rift_rooms?room_id=eq.${encodeURIComponent(roomId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
  catch (err) { console.warn(`[FUSEWILD] room ${roomId} snapshot cleanup skipped:`, err.message); }
}
async function hydrateRoomsFromSupabase() {
  if (!SUPABASE_ACTIVE) return;
  try {
    const since = new Date(Date.now() - ROOM_TTL).toISOString();
    const rows = await supabaseRequest(`/rest/v1/rift_rooms?select=room_id,data,updated_at&updated_at=gte.${encodeURIComponent(since)}&limit=500`);
    let loaded = 0;
    if (Array.isArray(rows)) for (const row of rows) {
      const room = row?.data;
      if (!room || !/^\d{6}$/.test(String(room.id || row.room_id || ''))) continue;
      room.id = String(room.id || row.room_id);
      room.feed = Array.isArray(room.feed) ? room.feed.slice(-100) : [];
      room.seq = Number(room.seq || room.feed.at(-1)?.seq || 0);
      room.createdAt = Number(room.createdAt || Date.now());
      room.updatedAt = Number(room.updatedAt || new Date(row.updated_at || Date.now()).getTime());
      room.startedAt = Number(room.startedAt || 0);
      rooms.set(room.id, room);
      loaded++;
    }
    if (loaded) console.log(`[FUSEWILD] restored ${loaded} active room snapshots from Supabase`);
    try {
      await supabaseRequest(`/rest/v1/rift_rooms?updated_at=lt.${encodeURIComponent(since)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch {}
  } catch (err) {
    console.warn('[FUSEWILD] Supabase room restore skipped:', err.message);
  }
}
function sanitizeName(s) {
  return String(s || '방랑자').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || '방랑자';
}
function sanitizeText(s, n = 80) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
}
function publicCard(c) { return clone(c); }
function publicItem(i) { return clone(i); }
function normalizePersistentDeck(deck, collection = {}) {
  const seen = new Set(), out = [];
  const take = id => {
    const c = CARD_BY_ID[id];
    if (!c || c.type !== 'spell' || seen.has(id) || !collection[id]) return;
    seen.add(id); out.push(id);
  };
  for (const id of Array.isArray(deck) ? deck : []) take(id);
  for (const id of STARTER_POOL) if (out.length < DECK_MIN) take(id);
  for (const c of CARDS) if (out.length < DECK_MIN && c.type === 'spell' && collection[c.id]) take(c.id);
  return out.slice(0, DECK_MAX);
}
function monsterPointCost(idOrMonster) {
  const m = typeof idOrMonster === 'string' ? MONSTER_BY_ID[idOrMonster] : idOrMonster;
  return Math.max(1, Number(m?.pointCost || 1));
}
function monsterPartyCost(ids) { return (ids || []).reduce((sum, id) => sum + monsterPointCost(id), 0); }
function normalizeMonsterParty(party, owned = {}) {
  const out = [], seen = new Set(); let points = 0;
  const take = id => {
    const m = MONSTER_BY_ID[id]; if (!m || !owned[id] || seen.has(id) || out.length >= MONSTER_PARTY_MAX) return;
    const cost = monsterPointCost(m); if (points + cost > MONSTER_POINT_BUDGET) return;
    seen.add(id); out.push(id); points += cost;
  };
  for (const id of Array.isArray(party) ? party : []) take(id);
  for (const id of STARTER_MONSTERS) if (!out.length || out.length < 3) take(id);
  return out;
}
function publicMonster(m) {
  if (!m) return null;
  return {
    id:m.id,name:m.name,tier:m.tier,rarity:m.monsterRarity||m.tier,element:m.element,biome:m.biome,
    archetype:m.archetype||'beast',role:m.role||'striker',sprite:m.sprite,skill:m.skill,
    pointCost:monsterPointCost(m),captureBase:Number(m.captureBase||0.25),playerHp:Number(m.playerHp||m.hp||50),
    playerAtk:Number(m.playerAtk||m.atk||8),passive:clone(m.passive||{}),evolutionName:m.evolutionName||`${m.name} · 진화형`,
    resonanceName:m.resonanceName||`공명 ${m.name}`,abyssName:m.abyssName||`균열개화 ${m.name}`,
    evolutionSprite:m.evolutionSprite||m.sprite,resonanceSprite:m.resonanceSprite||m.sprite,riftSprite:m.riftSprite||m.sprite,
    evolutionLevel:evolutionLevel(m),movePoolCount:movePoolCountFor(m),learnsetCount:speciesLearnset(m).length,moves:buildMonsterMoves(m)
  };
}
function createRunMonster(speciesId, index = 0) {
  const m = MONSTER_BY_ID[speciesId] || MONSTER_BY_ID[STARTER_MONSTERS[0]];
  const maxHp = Math.max(28, Number(m.playerHp || m.hp || 44));
  const power = Math.max(4, Number(m.playerAtk || m.atk || 7));
  const startBlock = m.archetype === 'insect' ? 8 : 0;
  return {
    instanceId: uid('mon'), speciesId:m.id, name:m.name, baseName:m.name, sprite:m.sprite, baseSprite:m.sprite,
    evolutionSprite:m.evolutionSprite||m.sprite,resonanceSprite:m.resonanceSprite||m.sprite,riftSprite:m.riftSprite||m.sprite,fusionSprite:null,fusionArt:null,fusionPrimarySprite:null,fusionSecondarySprite:null,
    element:m.element, secondaryElement:null, archetype:m.archetype||'beast', role:m.role||'striker', passive:clone(m.passive||{}),
    pointCost:monsterPointCost(m), level:Number(BATTLE_RULES.startMonsterLevel||5), xp:0, hp:maxHp, maxHp, power, block:startBlock, counter:0,
    evolutionLevel:evolutionLevel(m), pendingLearnMoves:[], gene:0, resonance:0, rift:0, evolved:false, fused:false, fusionWith:null, resonanceTurns:0, abyssBloom:false,
    secondaryArchetype:null, secondaryPassive:null, fusionLineage:[m.id], fusionDepth:0, nextAttackBonus:0, kills:0,
    revived:false, firstHitTaken:false, summonedTurn:0, slotOrder:index, acted:false, levelUpsThisBattle:0, heldItemId:null, heldItemUsed:false, majorStatus:null, statusTurns:0, statStages:{atk:0,def:0,speed:0,accuracy:0,evasion:0},
    moves:buildMonsterMoves(m).map(x=>{const p=normalizeMovePp(x);return {...x,cooldownRemaining:0,maxPp:p.maxPp,pp:p.maxPp};})
  };
}
function allCombatMonsters(pc) { return [...(pc?.units||[]), ...(pc?.bench||[]), ...(pc?.ko||[])]; }
function findCombatMonster(pc, instanceId) { return allCombatMonsters(pc).find(m => m.instanceId === instanceId) || pc?.units?.[0] || null; }
function monsterFormLabel(u) {
  if (u?.fused) return 'FUSION';
  if (u?.abyssBloom) return 'RIFT BLOOM';
  if (Number(u?.resonanceTurns||0)>0) return 'RESONANCE';
  if (u?.evolved) return 'EVOLVED';
  return 'BASE';
}
function monsterDisplaySpriteServer(u){if(!u)return'';if(u.fused&&u.fusionArt)return u.fusionArt;if(u.fused&&u.fusionPrimarySprite&&u.fusionSecondarySprite)return fusionArtDataUri({primarySprite:u.fusionPrimarySprite,secondarySprite:u.fusionSecondarySprite,primaryElement:u.element,secondaryElement:u.secondaryElement||u.element,fusionName:u.name||'',signature:fusionPairKey(u.speciesId||u.instanceId,u.fusionWith||u.secondarySpeciesId||'')});if(u.abyssBloom)return u.riftSprite||u.sprite;if(Number(u.resonanceTurns||0)>0)return u.resonanceSprite||u.sprite;if(u.evolved)return u.evolutionSprite||u.sprite;return u.sprite||u.baseSprite||'';}

function combatMonsterLocation(pc,instanceId){
  for(const key of ['units','bench','ko']){const arr=pc?.[key]||[],index=arr.findIndex(x=>x.instanceId===instanceId);if(index>=0)return{key,index};}
  return null;
}
function persistFusionMoveState(snapshot,fusedMoves){
  if(!snapshot||!Array.isArray(snapshot.moves))return;
  const map=new Map((fusedMoves||[]).map(m=>[String(m.id),m]));
  for(const mv of snapshot.moves){const live=map.get(String(mv.id));if(!live)continue;const max=Math.max(1,Number(mv.maxPp||mv.ppMax||defaultMovePp(mv)));mv.maxPp=max;mv.pp=clamp(Number(live.pp??mv.pp??max),0,max);mv.masteryUses=Math.max(Number(mv.masteryUses||0),Number(live.masteryUses||0));mv.masteryStage=Math.max(Number(mv.masteryStage||0),Number(live.masteryStage||0));}
}
function clearFusionOnlyFields(u){
  if(!u)return u;u.fused=false;u.fusionWith=null;u.fusionSprite=null;u.fusionArt=null;u.fusionPrimarySprite=null;u.fusionSecondarySprite=null;u.fusionTurnsLeft=0;u.fusionStartTurn=null;u.fusionState=null;u.secondaryElement=null;u.secondaryArchetype=null;u.secondaryPassive=null;u.fusionDepth=0;u.fusionLineage=[u.speciesId];return u;
}
function insertMonsterAt(pc,key,index,u){
  const target=['units','bench','ko'].includes(key)?key:'bench';pc[target] ||= [];const at=Math.max(0,Math.min(Number(index||0),pc[target].length));pc[target].splice(at,0,u);
}
function releaseFusion(room,pc,u,{reason='duration',emit=true}={}){
  if(!u?.fused||!u.fusionState)return null;
  const state=clone(u.fusionState),fusedName=u.name,fusedMoves=clone(u.moves||[]),ratio=u.maxHp?clamp(Number(u.hp||0)/Math.max(1,Number(u.maxHp||1)),0,1):0,alive=Number(u.hp||0)>0;
  const primary=clearFusionOnlyFields(clone(state.primary)),partner=clearFusionOnlyFields(clone(state.partner));
  persistFusionMoveState(primary,fusedMoves);persistFusionMoveState(partner,fusedMoves);
  const applySplitState=(m)=>{m.hp=alive?Math.max(1,Math.round(Number(m.maxHp||1)*ratio)):0;m.block=0;m.majorStatus=u.majorStatus||null;m.statusTurns=Number(u.statusTurns||0);m.rift=Math.max(Number(m.rift||0),Math.min(5,Number(u.rift||0)));m.resonance=Math.max(Number(m.resonance||0),Math.min(6,Number(u.resonance||0)));m.acted=!!u.acted;normalizeMajorStatus(m);normalizeMonsterMoves(m);};
  applySplitState(primary);applySplitState(partner);
  for(const key of ['units','bench','ko'])pc[key]=(pc[key]||[]).filter(x=>![u.instanceId,primary.instanceId,partner.instanceId].includes(x.instanceId));
  if(alive){
    insertMonsterAt(pc,state.primaryLocation?.key||'units',state.primaryLocation?.index||0,primary);
    insertMonsterAt(pc,state.partnerLocation?.key||'bench',state.partnerLocation?.index||0,partner);
  }else{
    primary.acted=true;partner.acted=true;pc.ko.push(primary,partner);
  }
  pc.down=!pc.units.some(x=>x.hp>0)&&!pc.bench.some(x=>x.hp>0);if(!pc.down&&pc.units.length===0&&pc.bench.length){const next=pc.bench.shift();pc.units.push(next);}
  const result={playerId:pc.playerId,instanceId:primary.instanceId,partnerInstanceId:partner.instanceId,fusedName,primaryName:primary.name,partnerName:partner.name,reason,primarySprite:monsterDisplaySpriteServer(primary),partnerSprite:monsterDisplaySpriteServer(partner)};
  if(emit)pushRoomEvent(room,'monster-unfuse',reason==='battle-end'?`${fusedName}의 융합이 전투 종료와 함께 해제되었다.`:`${fusedName}의 5턴 융합이 종료되었다.`,result);
  return result;
}
function releaseAllFusions(room,{reason='battle-end',emit=false}={}){
  const released=[];for(const pc of room?.battle?.party||[]){for(const u of [...allCombatMonsters(pc)]){if(!u?.fused)continue;const row=releaseFusion(room,pc,u,{reason,emit});if(row)released.push(row);}}return released;
}
function tickFusionDurations(room){
  const turn=Number(room?.battle?.turn||0);for(const pc of room?.battle?.party||[]){if(pc.down)continue;for(const u of [...allCombatMonsters(pc)]){if(!u?.fused||!u.fusionState)continue;const started=Number(u.fusionStartTurn??turn);if(turn<=started)continue;u.fusionTurnsLeft=Math.max(0,Number(u.fusionTurnsLeft||5)-1);if(u.fusionTurnsLeft<=0)releaseFusion(room,pc,u,{reason:'duration',emit:true});else pushRoomEvent(room,'fusion-turn',`${u.name} 융합 지속 · ${u.fusionTurnsLeft}턴 남음`,{playerId:pc.playerId,instanceId:u.instanceId,turnsLeft:u.fusionTurnsLeft,maxTurns:5});}}
}

function elementalMultiplier(attacker, defender) {
  if (!attacker || !defender || attacker === defender) return 1;
  if ((ELEMENT_ADVANTAGE[attacker] || []).includes(defender)) return 1.35;
  if ((ELEMENT_ADVANTAGE[defender] || []).includes(attacker)) return 0.75;
  return 1;
}
function applyElementDamage(target, amount, attackerElement) {
  return applyDamage(target, Math.round(Number(amount || 0) * elementalMultiplier(attackerElement, target?.element)));
}

function migrateProfile(p) {
  p.cloud = Boolean(p.cloud);
  p.accountId = p.accountId ? String(p.accountId) : '';
  p.activeRoomId = /^\d{6}$/.test(String(p.activeRoomId||'')) ? String(p.activeRoomId) : '';
  p.activeRoomSnapshot = p.activeRoomSnapshot && typeof p.activeRoomSnapshot==='object' ? p.activeRoomSnapshot : null;
  p.gems = Number(p.gems ?? 2200);
  p.dust = Number(p.dust ?? 0);
  p.seals = p.seals || { basic: 15, silver: 6, royal: 1 };
  for (const k of ['basic', 'silver', 'royal']) p.seals[k] = Number(p.seals[k] || 0);
  p.pity = p.pity || { legendary: 0, mythic: 0 };
  p.collection = p.collection && typeof p.collection === 'object' ? p.collection : {};
  p.cardOrigins = p.cardOrigins && typeof p.cardOrigins === 'object' ? p.cardOrigins : {};
  for (const id of Object.keys(p.collection)) if (!CARD_BY_ID[id]) { delete p.collection[id]; delete p.cardOrigins[id]; }
  for (const cid of STARTER_POOL) {
    if (!p.collection[cid]) p.collection[cid] = 1;
    if (!p.cardOrigins[cid]) p.cardOrigins[cid] = 'starter';
  }
  for (const cid of Object.keys(p.collection)) if (!p.cardOrigins[cid]) p.cardOrigins[cid] = STARTER_POOL.includes(cid) ? 'starter' : 'legacy';

  p.monsters = p.monsters && typeof p.monsters === 'object' ? p.monsters : {};
  for (const id of Object.keys(p.monsters)) if (!MONSTER_BY_ID[id]) delete p.monsters[id];
  for (const mid of STARTER_MONSTERS) if (!p.monsters[mid]) p.monsters[mid] = 1;
  // One-time v3 -> v4 migration: veteran unit-card ownership becomes monster ownership.
  // Fresh v4 profiles skip this so their starter roster stays intentionally small.
  const migratingLegacyProfile = Number(p.schemaVersion || 0) < 4;
  if (migratingLegacyProfile) for (const [cid, count] of Object.entries(p.collection)) {
    const legacy = CARD_BY_ID[cid]?.legacyUnit;
    if (!legacy || !count) continue;
    const n = Math.max(0, Number(String(cid).replace(/\D/g,'')) - 1);
    const m = ENEMIES[n % ENEMIES.length];
    if (m && !p.monsters[m.id]) p.monsters[m.id] = 1;
  }
  p.schemaVersion = 5;
  p.monsterParty = normalizeMonsterParty(p.monsterParty, p.monsters);
  p.deck = normalizePersistentDeck(p.deck, p.collection);

  p.stats = p.stats || {};
  const defaults = {
    journeys:0,dungeons:0,dungeonClears:0,bosses:0,cardsCaught:0,monstersCaught:0,bestDungeonFloor:0,bestJourneyFloor:0,gachaPulls:0,
    journeyUnlocks:0,dungeonCardsPlayed:0,normalClears:0,hardClears:0,hellClears:0,bestNormalFloor:0,bestHardFloor:0,bestHellFloor:0,
    loginCount:0,lastLoginAt:0,perfectBattles:0,bestChain:0,overdrives:0,evolutions:0,fusions:0,resonanceEvolutions:0,riftBlooms:0
  };
  for (const [k,v] of Object.entries(defaults)) if (p.stats[k] == null) p.stats[k]=v;
  p.history = Array.isArray(p.history) ? p.history.filter(x => x && typeof x === 'object').slice(0,20) : [];
  return p;
}

function ensureProfile(profileId, nickname) {
  let p = profiles[profileId];
  if (!p) {
    p = profiles[profileId] = {
      id:profileId,nickname:sanitizeName(nickname),createdAt:Date.now(),lastSeenAt:Date.now(),gems:2200,dust:0,
      seals:{basic:15,silver:6,royal:1},pity:{legendary:0,mythic:0},collection:{},cardOrigins:{},deck:STARTER_POOL.slice(0,DECK_MIN),
      monsters:{},monsterParty:STARTER_MONSTERS.slice(0,3),stats:{},history:[],cloud:false,accountId:'',activeRoomId:'',activeRoomSnapshot:null,schemaVersion:5
    };
  }
  migrateProfile(p); p.nickname=sanitizeName(nickname||p.nickname); p.lastSeenAt=Date.now(); return p;
}

function addCardToProfile(p, cardId, count = 1, save = true, origin = 'legacy') {
  const c = CARD_BY_ID[cardId]; if (!c) return;
  p.cardOrigins ||= {}; const old=Number(p.collection[cardId]||0); p.collection[cardId]=old+count;
  if(old===0)p.cardOrigins[cardId]=origin||'legacy'; if(old>0)p.dust+=Number(RARITY[c.rarity]?.dust||0)*count; if(save)saveProfiles();
}
function addMonsterToProfile(p, monsterId, count = 1, save = true) {
  const m=MONSTER_BY_ID[monsterId]; if(!m)return false; p.monsters ||= {}; const wasNew=!p.monsters[monsterId]; p.monsters[monsterId]=Number(p.monsters[monsterId]||0)+count;
  if(wasNew && p.monsterParty.length<3 && monsterPartyCost([...p.monsterParty,monsterId])<=MONSTER_POINT_BUDGET)p.monsterParty.push(monsterId);
  if(save)saveProfiles(); return wasNew;
}
function profileView(p) {
  return { id:p.id,nickname:p.nickname,gems:p.gems,dust:p.dust,seals:p.seals,pity:p.pity,collection:p.collection,cardOrigins:p.cardOrigins||{},deck:p.deck,
    monsters:p.monsters||{},monsterParty:p.monsterParty||[],monsterPartyCost:monsterPartyCost(p.monsterParty||[]),monsterPointBudget:MONSTER_POINT_BUDGET,
    stats:p.stats,history:p.history||[],ownedCount:Object.keys(p.collection).length,totalCards:CARDS.length,monsterOwnedCount:Object.keys(p.monsters||{}).length,
    totalMonsters:MONSTERS.length,cloud:Boolean(p.cloud),accountId:p.accountId||'',activeRoomId:p.activeRoomId||'' };
}


function resumableRoomForProfile(profileId) {
  const pid=String(profileId||'');
  const profile=profiles[pid];
  const direct=profile?.activeRoomId ? rooms.get(String(profile.activeRoomId)) : null;
  if(direct && !['ended','cleared'].includes(direct.status) && direct.players?.some(x=>x.id===pid)) return direct;
  const found=[...rooms.values()]
    .filter(r=>!['ended','cleared'].includes(r.status)&&r.players?.some(x=>x.id===pid))
    .sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))[0]||null;
  if(found)return found;
  const snap=profile?.activeRoomSnapshot;
  if(snap && /^\d{6}$/.test(String(snap.id||'')) && !['ended','cleared'].includes(snap.status) && snap.players?.some(x=>x.id===pid)){
    const restored=clone(snap);restored.updatedAt=Date.now();restored.feed=Array.isArray(restored.feed)?restored.feed.slice(-100):[];restored.seq=Number(restored.seq||restored.feed.at(-1)?.seq||0);
    rooms.set(restored.id,restored);return restored;
  }
  return null;
}
function setProfileActiveRoom(profileId, roomId) {
  const p=profiles[String(profileId||'')]; if(!p)return;
  p.activeRoomId=/^\d{6}$/.test(String(roomId||''))?String(roomId):'';
}
function clearProfileActiveRoom(profileId, roomId='') {
  const p=profiles[String(profileId||'')]; if(!p)return;
  if(!roomId||String(p.activeRoomId||'')===String(roomId)){p.activeRoomId='';p.activeRoomSnapshot=null;}
}

function validDeck(deck) {
  const d=[...new Set((Array.isArray(deck)?deck:[]).filter(x=>CARD_BY_ID[x]?.type==='spell'))];
  const base=d.length>=DECK_MIN?d:STARTER_POOL.filter(id=>CARD_BY_ID[id]?.type==='spell').slice(0,DECK_MIN);
  const out=[]; while(out.length<12&&base.length)out.push(base[out.length%base.length]); return out.slice(0,24);
}
function newRunPlayer(p) {
  const party=normalizeMonsterParty(p.monsterParty,p.monsters);
  return { playerId:p.id,nickname:p.nickname,maxHp:100,hp:100,runDeck:validDeck(p.deck),monsterParty:party,
    monsters:party.map((id,i)=>createRunMonster(id,i)),relics:[],items:{i121:1},upgrades:{},mastery:{},mods:{},fragments:0,gold:180,cardsAdded:0,itemsAdded:0,
    revivesUsed:0,rewardRerolls:0,removals:0,contract:null,spellCharge:0,wavesCleared:0,moveUseCounts:{},rewriteHistory:[] };
}

function itemStacks(run, itemId) { return Number(run?.items?.[itemId] || 0); }
function heldItemDef(monster) { return monster?.heldItemId ? ITEM_BY_ID[monster.heldItemId] || null : null; }
function equippedHeldCount(run, itemId, exceptInstanceId = '') {
  return (run?.monsters || []).filter(m => m.instanceId !== exceptInstanceId && m.heldItemId === itemId).length;
}
function equipHeldItem(room, playerId, instanceId, itemId) {
  if (!['route','reward','event'].includes(room.status)) throw new Error('장착 아이템은 전투 밖에서 변경할 수 있습니다.');
  const run = room.runState?.[playerId]; if (!run) throw new Error('원정 데이터를 찾을 수 없습니다.');
  const monster = (run.monsters || []).find(m => m.instanceId === instanceId); if (!monster) throw new Error('몬스터를 찾을 수 없습니다.');
  if (!itemId) {
    const old = heldItemDef(monster); monster.heldItemId = null; monster.heldItemUsed = false;
    pushRoomEvent(room,'held-item',`${monster.name}의 장착 아이템을 해제했습니다.`,{playerId,instanceId,itemId:null});
    return { instanceId, itemId:null, item:old?publicItem(old):null };
  }
  const item = ITEM_BY_ID[itemId]; if (!item?.held) throw new Error('이 아이템은 몬스터에게 장착할 수 없습니다.');
  const owned = itemStacks(run,itemId), used = equippedHeldCount(run,itemId,monster.instanceId);
  if (owned <= used) throw new Error('장착 가능한 보유 수량이 부족합니다.');
  monster.heldItemId = itemId; monster.heldItemUsed = false;
  pushRoomEvent(room,'held-item',`${monster.name}에게 ${item.name} 장착.`,{playerId,instanceId,itemId,itemName:item.name});
  return { instanceId, itemId, item:publicItem(item) };
}
function modTotal(run, key) {
  if (!run) return 0;
  let total = Number(run.mods?.[key] || 0);
  for (const [id, count] of Object.entries(run.items || {})) {
    const item = ITEM_BY_ID[id];
    if (!item) continue;
    total += Number(item.mod?.[key] || 0) * Number(count || 0);
  }
  for (const id of run.relics || []) {
    const relic = RELIC_BY_ID[id];
    if (!relic) continue;
    total += Number(relic.mod?.[key] || 0);
  }
  return total;
}

function addItemToRun(run, itemId) {
  const item = ITEM_BY_ID[itemId];
  if (!item || !run) throw new Error('아이템을 찾을 수 없습니다.');
  const current = itemStacks(run, itemId);
  if (current >= Number(item.maxStack || 1)) throw new Error('이 아이템은 최대 중첩입니다.');
  run.items[itemId] = current + 1;
  run.itemsAdded++;
  const hpUp = Number(item.mod?.maxHpOnPickup || 0);
  if (hpUp > 0) {
    run.maxHp += hpUp;
    run.hp = clamp(run.hp + hpUp, 1, run.maxHp);
  }
  const heal = Number(item.mod?.healOnPickup || 0);
  if (heal > 0) {
    run.hp = clamp(run.hp + heal, 1, run.maxHp);
    const target=(run.monsters||[]).filter(m=>m.hp>0&&m.hp<m.maxHp).sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
    if(target) target.hp=clamp(target.hp+heal,1,target.maxHp);
  }
  return item;
}
function addRelic(run, relicId) {
  if (!run || !RELIC_BY_ID[relicId] || run.relics.includes(relicId)) return false;
  run.relics.push(relicId);
  return true;
}

function effectiveRunCard(run, base) {
  if (!base) return base;
  const level = clamp(Number(run?.upgrades?.[base.id] || 0), 0, 2);
  if (!level) return base;
  const scale = 1 + level * 0.18;
  const boostedOps = new Set(['damage','damageAll','damageOthers','block','blockAllies','heal','healAllies','burn','buffUnits','nextAttack']);
  const c = clone(base);
  c.upgradeLevel = level;
  c.name = `${base.name}${level === 1 ? ' +' : ' ++'}`;
  c.power = Math.round(Number(base.power || 0) * scale);
  c.block = Math.round(Number(base.block || 0) * scale);
  c.hp = Math.round(Number(base.hp || 0) * (1 + level * 0.14));
  if (level >= 2 && Number(base.cost || 0) >= 2) c.cost = Math.max(0, Number(base.cost) - 1);
  c.effects = (base.effects || []).map(fx => boostedOps.has(fx.op) && Number.isFinite(Number(fx.value)) ? { ...fx, value: Math.max(1, Math.round(Number(fx.value) * scale)) } : { ...fx });
  return c;
}

function drawCards(pc, n) {
  const limit = pc.handLimit || 10;
  for (let i = 0; i < n; i++) {
    if (pc.hand.length >= limit) return;
    if (!pc.drawPile.length) {
      pc.drawPile = shuffle(pc.discard);
      pc.discard = [];
    }
    if (!pc.drawPile.length) return;
    pc.hand.push(pc.drawPile.shift());
  }
}

function makeCombatant(run, index, activeSlots = 1) {
  const relicEnergy=run.relics.includes('r004')?1:0, relicHpPenalty=run.relics.includes('r004')?8:0;
  const fieldCharge=clamp(Number(run.spellCharge||0),0,2);
  const maxEnergy=3+relicEnergy+Math.floor(modTotal(run,'maxEnergy')), maxHp=Math.max(55,run.maxHp-relicHpPenalty), handLimit=10+Math.floor(modTotal(run,'handLimit'));
  const roster=(run.monsters?.length?run.monsters:(run.monsterParty||[]).map((id,i)=>createRunMonster(id,i))).map(x=>{const c=clone(x);normalizeMonsterMoves(c);normalizeMajorStatus(c);const ppBonus=Math.max(0,Math.floor(modTotal(run,'ppBonus')));for(const mv of c.moves||[]){const prev=Math.max(0,Number(mv.runPpBonus||0)),delta=Math.max(0,ppBonus-prev);if(delta){mv.maxPp=Number(mv.maxPp||defaultMovePp(mv))+delta;mv.pp=Math.min(mv.maxPp,Number(mv.pp||0)+delta);mv.runPpBonus=ppBonus;}}c.statStages={atk:0,def:0,speed:0,accuracy:0,evasion:0};c.block=0;c.acted=false;c.levelUpsThisBattle=0;c.heldItemUsed=false;return c;});
  const alive=roster.filter(m=>m.hp>0), active=alive.slice(0,activeSlots), bench=alive.slice(activeSlots), ko=roster.filter(m=>m.hp<=0);
  const pc={ playerId:run.playerId,nickname:run.nickname,index,maxHp,hp:Math.min(run.hp,maxHp),block:Math.floor(modTotal(run,'startBlock'))+(run.relics.includes('r006')?10:0),
    energy:maxEnergy+Math.floor(modTotal(run,'firstTurnEnergy'))+fieldCharge,maxEnergy,handLimit,drawPile:shuffle(run.runDeck),discard:[],exhaust:[],hand:[],units:active,bench,ko,
    ended:false,down:false,weak:0,upgrades:{...(run.upgrades||{})},itemMods:{unitPower:modTotal(run,'unitPower'),spellPower:modTotal(run,'spellPower'),damagePct:modTotal(run,'damagePct'),bossDamagePct:modTotal(run,'bossDamagePct'),blockPct:modTotal(run,'blockPct'),healPct:modTotal(run,'healPct'),damageReduction:Math.min(.55,modTotal(run,'damageReduction')),retainBlock:Math.min(.75,modTotal(run,'retainBlock')),thorns:modTotal(run,'thorns')},
    buffs:{nextAttack:run.relics.includes('r001')?4:0,spellDiscount:0,anyDiscount:Math.floor(modTotal(run,'startDiscount')),debuffImmune:false,thorns:modTotal(run,'thorns'),nextUnitBlock:0,teamSpellCount:0,energyDebt:0},
    relics:run.relics.slice(),chain:{count:0,lastType:null,best:0,overdrives:0},recallsUsed:0,switchesUsed:0,tacticsUsed:0,tacticLimit:0,stats:{cardsPlayed:0,movesUsed:0,damage:0,healing:0,hpDamageTaken:0,monsterDamageTaken:0} };
  drawCards(pc,5+Math.floor(modTotal(run,'drawBonus'))+(run.relics.includes('r007')?1:0)+fieldCharge); run.spellCharge=0; return pc;
}

function makeRoom(hostProfile, mode = 'dungeon', name = '', difficulty = 'normal') {
  let code;
  do code = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(code));
  const diff = mode === 'dungeon' && DIFFICULTIES[difficulty] ? difficulty : 'normal';
  const room = {
    id: code,
    name: sanitizeText(name || `${hostProfile.nickname}의 원정대`, 24),
    mode,
    difficulty: diff,
    hostId: hostProfile.id,
    createdAt: Date.now(),
    status: 'lobby',
    maxPlayers: mode === 'dungeon' ? 4 : 1,
    players: [{ id: hostProfile.id, nickname: hostProfile.nickname, ready: true, joinedAt: Date.now() }],
    floor: 0,
    biomeIndex: 0,
    biomeForkPending: false,
    biomeForkOptions: [],
    biomeTrail: [0],
    route: null,
    battle: null,
    reward: null,
    capture: null,
    event: null,
    runState: {},
    contractOffers: {},
    contractClaims: {},
    threatTokens: [],
    feed: [],
    seq: 0,
    finalClearPending: false,
    startedAt: 0
  };
  rooms.set(code, room);
  hostProfile.activeRoomId=code;
  saveProfiles();
  pushRoomEvent(room, 'room', '방이 생성되었습니다.');
  return room;
}

function currentBiome(room) {
  const fallback = room.mode === 'dungeon'
    ? Math.min(BIOMES.length - 1, Math.floor(Math.max(0, room.floor - 1) / 10))
    : Math.floor(Math.max(0, room.floor - 1) / 10) % BIOMES.length;
  const idx = Number.isInteger(Number(room.biomeIndex)) ? Number(room.biomeIndex) : fallback;
  return BIOMES[Math.max(0, Math.min(BIOMES.length - 1, idx))] || BIOMES[0];
}

function roomView(room) {
  return clone({
    id: room.id,
    name: room.name,
    mode: room.mode,
    difficulty: room.difficulty,
    difficultyInfo: DIFFICULTIES[room.difficulty],
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    players: room.players,
    floor: room.floor,
    maxFloor: room.mode === 'dungeon' ? DUNGEON_MAX_FLOOR : null,
    biomeIndex: room.biomeIndex,
    biomeForkPending: Boolean(room.biomeForkPending),
    biomeForkOptions: room.biomeForkOptions || [],
    biomeTrail: room.biomeTrail || [room.biomeIndex || 0],
    biome: currentBiome(room),
    levelCap: levelCapForFloor(room.floor),
    route: room.route,
    battle: room.battle,
    reward: room.reward,
    capture: room.capture,
    event: room.event,
    runState: room.runState,
    contractOffers: room.contractOffers || {},
    contractClaims: room.contractClaims || {},
    threatTokens: room.threatTokens || [],
    feed: room.feed.slice(-36),
    seq: room.seq,
    finalClearPending: room.finalClearPending
  });
}

function pushRoomEvent(room, type, message, payload = {}) {
  room.seq++;
  room.updatedAt = Date.now();
  room.feed.push({ seq: room.seq, time: room.updatedAt, type, message, payload });
  if (room.feed.length > 100) room.feed.shift();
  queueRoomSync(room);
  broadcast(room.id, 'room-update', roomView(room));
}
function broadcast(roomId, event, data) {
  const set = clientsByRoom.get(roomId);
  if (!set) return;
  const wire = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(wire); } catch {} }
}
function playerName(room, id) { return room.players.find(p => p.id === id)?.nickname || '플레이어'; }

function startRoom(room) {
  if (room.status !== 'lobby') throw new Error('이미 시작된 방입니다.');
  if (!room.players.length) throw new Error('플레이어가 없습니다.');
  room.runState = {};
  room.contractOffers = {};
  room.contractClaims = {};
  room.threatTokens = room.threatTokens || [];
  room.startedAt = Date.now();
  for (const rp of room.players) {
    const p = ensureProfile(rp.id, rp.nickname);
    p.activeRoomId=room.id;
    room.runState[rp.id] = newRunPlayer(p);
    room.contractOffers[rp.id] = shuffle(RUN_CONTRACTS).slice(0, 3);
    if (room.mode === 'dungeon') p.stats.dungeons++;
    else p.stats.journeys++;
  }
  saveProfiles();
  room.floor = 1;
  room.biomeIndex = 0;
  room.biomeForkPending = false;
  room.biomeForkOptions = [];
  room.biomeTrail = [0];
  room.status = 'route';
  makeRoute(room);
  const label = room.mode === 'journey' ? '일반 여행' : `${DIFFICULTIES[room.difficulty].ko} 난이도 50층 협동 던전`;
  pushRoomEvent(room, 'start', `${label}에 진입했습니다. 10웨이브 단위의 연속 조우를 시작합니다.`);
}

function chooseRunContract(room, playerId, contractId) {
  if (room.status !== 'route') throw new Error('원정 서약은 경로 선택 단계에서 정할 수 있습니다.');
  if (room.contractClaims?.[playerId]) throw new Error('이미 원정 서약을 선택했습니다.');
  const offer = (room.contractOffers?.[playerId] || []).find(x => x.id === contractId);
  if (!offer) throw new Error('제시된 서약이 아닙니다.');
  const run = room.runState[playerId];
  run.mods ||= {};
  run.upgrades ||= {};
  if (contractId === 'vanguard') {
    run.maxHp = Math.max(50, run.maxHp - 8); run.hp = Math.min(run.hp, run.maxHp); run.gold += 120; run.mods.damagePct = Number(run.mods.damagePct || 0) + 0.06;
  } else if (contractId === 'warden') {
    run.maxHp += 12; run.hp += 12; run.gold = Math.max(0, run.gold - 40); run.mods.startBlock = Number(run.mods.startBlock || 0) + 6;
  } else if (contractId === 'curator') {
    run.maxHp = Math.max(50, run.maxHp - 6); run.hp = Math.min(run.hp, run.maxHp); run.mods.rewardChoices = Number(run.mods.rewardChoices || 0) + 1; run.mods.rewardLuck = Number(run.mods.rewardLuck || 0) + 0.10;
  } else if (contractId === 'minimalist') {
    run.mods.ppBonus = Number(run.mods.ppBonus || 0) + 1; run.gold += 40;
  } else if (contractId === 'echo') {
    run.gold = Math.max(0, run.gold - 70); const pool=RELICS.filter(r=>['common','rare'].includes(r.rarity)&&(!Array.isArray(r.modes)||r.modes.includes(room.mode))); const relic=choose(pool); if(relic) addRelic(run,relic.id);
  } else if (contractId === 'gambler') {
    run.maxHp = Math.max(50, run.maxHp - 10); run.hp = Math.min(run.hp, run.maxHp); run.fragments += 3; run.mods.rerollDiscount = Number(run.mods.rerollDiscount || 0) + 0.30;
  }
  run.contract = contractId;
  room.contractClaims ||= {};
  room.contractClaims[playerId] = contractId;
  pushRoomEvent(room, 'contract', `${playerName(room, playerId)} 님이 「${offer.name}」을 선택했습니다.`);
}

function addThreatToken(room) {
  if (room.mode !== 'dungeon') return;
  const token = clone(choose(THREAT_TOKENS));
  room.threatTokens ||= [];
  room.threatTokens.push(token);
  pushRoomEvent(room, 'threat', `심연 압력 상승: ${token.name} — ${token.desc}`);
}

function threatMods(room) {
  return (room.threatTokens || []).reduce((a,t)=>({ hp:a.hp+Number(t.hp||0), atk:a.atk+Number(t.atk||0), reward:a.reward+Number(t.reward||0) }), {hp:0,atk:0,reward:0});
}

function sampleKinds() {
  // Kept for legacy event tooling. wave-spell patch progression itself is battle-first.
  const pool = ['combat', 'combat', 'combat', 'event', 'rest', 'treasure', 'merchant'];
  const out = [];
  while (out.length < 2) {
    const k = choose(pool);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}
function kindLabel(k) {
  return ({ combat: '야생 조우', rival: '균열 추적자', elite: '균열 워든', boss: '바이옴 수호자', event: '미지의 사건', rest: '야영지', treasure: '보물', merchant: '유랑 상점' })[k] || k;
}
function kindIcon(k) {
  return ({ combat: '⚔', rival: '♞', elite: '☠', boss: '♛', event: '?', rest: '⌂', treasure: '◆', merchant: '₡' })[k] || '◆';
}
function kindDesc(k) {
  return ({
    combat: '연속 웨이브의 기본 조우 · 승리 후 아이템 3택과 PP/HP 정비',
    rival: '7웨이브에 출현하는 균열 추적자 · 교대와 상태이상을 적극적으로 사용',
    elite: '5웨이브 체크포인트 · 2체 워든 전투 + 야영 + 유물 선택',
    boss: '10웨이브 바이옴 수호자 · 격파 후 다음 바이옴으로 이동하며 HP/PP/상태 완전 회복',
    event: '선택에 따라 회복·아이템·골드·파편이 달라지는 사건',
    rest: 'HP 회복 / PP·상태 정비 / 명상 중 하나를 선택하는 야영지',
    treasure: '추가 골드 + 별도 유물 선택권',
    merchant: '런 골드로 회복·PP·장착·전투 아이템 구매'
  })[k] || '';
}
function encounterProfile(floor) {
  const wave = ((Math.max(1, Number(floor || 1)) - 1) % 10) + 1;
  if (wave === 10) return { tier:'boss', encounterType:'boss', wave, label:'바이옴 수호자', kicker:'BIOME BOSS', desc:'10웨이브 수호자. 격파하면 파티가 완전 회복되고 다음 바이옴을 직접 고릅니다.' };
  if (wave === 7) return { tier:'rival', encounterType:'rival', wave, label:'균열 추적자', kicker:'RIFT HUNTER', desc:'플레이어 빌드를 노리고 들어오는 2체 전술 편성. 야생 봉인은 없지만 보상이 더 큽니다.' };
  if (wave === 5) return { tier:'elite', encounterType:'warden', wave, label:'균열 워든', kicker:'WARDEN BATTLE', desc:'강화된 2체 편성. 승리하면 야영 행동과 유물 선택권을 얻습니다.' };
  return { tier:'combat', encounterType:'wild', wave, label:'야생 조우', kicker:'WILD ENCOUNTER', desc:'몬스터 전투를 이어가며 공명 지령과 아이템으로 런 빌드를 성장시킵니다.' };
}

function makeRoute(room) {
  room.battle = null;
  room.reward = null;
  room.capture = null;
  room.event = null;
  const encounter = encounterProfile(room.floor);
  if (room.biomeForkPending && encounter.wave === 1) {
    const candidates = (room.biomeForkOptions?.length ? room.biomeForkOptions : biomeForkCandidates(room)).filter(i => BIOMES[i]);
    room.biomeForkOptions = candidates;
    room.route = candidates.map((biomeIndex, i) => {
      const biome = BIOMES[biomeIndex];
      return {
        id:`${room.floor}-biome-${biome.id}`,
        kind:'combat', encounterType:'wild', waveInBiome:1, biomeChoice:true, biomeIndex, biomeName:biome.name,
        kicker:i===0?'BIOME FORK A':'BIOME FORK B', label:`${biome.name} 진입`, icon:'⌁',
        desc:`다음 10웨이브를 ${biome.name}에서 진행합니다. 등장 몬스터와 수호자가 달라집니다.`, votes:[]
      };
    });
  } else {
    room.route = [{
      id: `${room.floor}-0-${encounter.tier}`,
      kind: encounter.tier,
      encounterType: encounter.encounterType,
      waveInBiome: encounter.wave,
      kicker: encounter.kicker,
      label: encounter.label,
      icon: kindIcon(encounter.tier),
      desc: encounter.desc,
      votes: []
    }];
  }
  room.status = 'route';
}

function voteRoute(room, playerId, nodeId) {
  // v5.2 race guard: an old tab/timer may submit a route vote after the server
  // already advanced into battle. Treat it as an idempotent no-op, not HTTP 400.
  if (room.status !== 'route') return { ignored:true, status:room.status };
  if (!room.contractClaims?.[playerId]) {
    room.contractClaims ||= {}; room.contractClaims[playerId] = 'unbound';
    if (room.runState[playerId]) room.runState[playerId].contract = 'unbound';
    pushRoomEvent(room, 'contract', `${playerName(room, playerId)} 님이 무서약 상태로 경로를 선택했습니다.`);
  }
  const node = room.route.find(n => n.id === nodeId) || (room.route.length === 1 ? room.route[0] : null);
  if (!node) throw new Error('경로가 없습니다.');
  if (node.votes?.includes(playerId)) return { ignored:true, status:room.status };
  room.route.forEach(n => n.votes = n.votes.filter(x => x !== playerId));
  node.votes.push(playerId);
  const votes = room.route.reduce((s, n) => s + n.votes.length, 0);
  if (votes >= room.players.length) {
    const max = Math.max(...room.route.map(n => n.votes.length));
    resolveNode(room, choose(room.route.filter(n => n.votes.length === max)));
  } else pushRoomEvent(room, 'vote', `${playerName(room, playerId)} 님이 경로에 투표했습니다.`);
}

function roomDifficulty(room) { return DIFFICULTIES[room.difficulty] || DIFFICULTIES.normal; }

function makeEventEncounter(room) {
  const biome = currentBiome(room);
  const scenes = {
    verdant: [
      {title:'이끼 낀 신호탑',text:'녹슨 송신기 사이에서 아직 살아 있는 잔광 신호가 잡힙니다. 안전하게 철수할지, 더 깊이 손을 뻗을지 결정해야 합니다.'},
      {title:'유리등 회랑',text:'빛이 늦게 따라오는 회랑입니다. 밝은 길은 안전하지만, 어두운 쪽에는 강한 카드 잔향이 남아 있습니다.'}
    ],
    ember: [
      {title:'꺼지지 않는 제련로',text:'제련로 안쪽에 카드 코어가 박혀 있습니다. 냉각을 기다리면 안전하지만, 지금 꺼내면 더 좋은 전리품을 얻을 수 있습니다.'},
      {title:'고철 운송선',text:'멈춘 운송선에 보급품이 쌓여 있습니다. 무게 센서가 살아 있어 욕심을 부리면 경보가 울릴 수 있습니다.'}
    ],
    frost: [
      {title:'빙벽 야영 흔적',text:'얼어붙은 화롯가와 부서진 천막이 보입니다. 오래된 원정대가 남긴 자원을 회수할 수 있습니다.'},
      {title:'균열 아래의 상자',text:'얼음 아래에 봉인된 상자가 보입니다. 안전하게 주변을 녹일지, 체력을 써서 바로 꺼낼지 선택해야 합니다.'}
    ],
    astral: [
      {title:'뒤집힌 성소',text:'중력이 뒤틀린 성소에서 카드들이 허공에 떠다닙니다. 어떤 힘을 붙잡느냐에 따라 원정의 속도가 크게 바뀝니다.'},
      {title:'잠든 관측소',text:'별의 궤도를 기록한 장치가 아직 작동합니다. 데이터를 해독하면 보상 흐름을 유리하게 만들 수 있습니다.'}
    ],
    origin: [
      {title:'기원의 제단',text:'심연의 중심부에서 금빛 균열이 열립니다. 얻는 힘은 크지만, 다음 수호자를 앞둔 지금의 체력과 덱 밀도를 함께 계산해야 합니다.'},
      {title:'검은 우편함',text:'이전 원정대가 남긴 마지막 기록이 도착해 있습니다. 봉인을 풀면 강한 보상을 얻을 수 있지만 대가도 큽니다.'}
    ]
  };
  const scene = choose(scenes[biome.id] || scenes.verdant);
  const late = room.floor >= 31;
  return {
    id: uid('event'),
    title: scene.title,
    text: scene.text,
    choices: [
      { id:'safe', label:'안전하게 정비한다', desc:`체력 ${late?12:10} 회복 · 확실한 생존 선택` },
      { id:'risk', label:'위험을 감수하고 핵심을 회수한다', desc:`체력 ${late?15:12} 소모 · 희귀 이상 카드 1장 즉시 획득` },
      { id:'scout', label:'주변을 정찰해 자원을 모은다', desc:`런 골드와 균열 파편 획득 · 이후 재굴림에 활용` },
      { id:'seal', label:'봉인 의식을 시도한다', desc:'기본 봉인구 1개 사용 · 성공 시 랜덤 런 아이템 획득' }
    ],
    chosenBy: {}
  };
}

function resolveNode(room, node) {
  if (node?.biomeChoice && Number.isInteger(Number(node.biomeIndex))) {
    room.biomeIndex = Math.max(0, Math.min(BIOMES.length - 1, Number(node.biomeIndex)));
    room.biomeForkPending = false;
    room.biomeForkOptions = [];
    room.biomeTrail ||= [];
    room.biomeTrail.push(room.biomeIndex);
    pushRoomEvent(room, 'biome-choice', `${currentBiome(room).name}(으)로 진입합니다.`, { biomeIndex:room.biomeIndex, biomeId:currentBiome(room).id });
  }
  if (['combat', 'rival', 'elite', 'boss'].includes(node.kind)) {
    startBattle(room, node.kind);
    return;
  }
  if (node.kind === 'rest') {
    createFloorReward(room, 'rest', '별빛 야영지', '이번 야영에서는 회복, 카드 강화, 명상 중 하나를 먼저 선택합니다. 이후 보상은 필요하면 건너뛰어 덱을 얇게 유지할 수 있습니다.', 'rest', { camp: true, campBy: {} });
    pushRoomEvent(room, 'rest', '원정대가 별빛 야영지에 도착했습니다.');
    return;
  }
  if (node.kind === 'treasure') {
    const bonusGold = 90 + room.floor * 4;
    for (const rp of room.players) {
      const run=room.runState[rp.id];
      run.gold += Math.round(bonusGold * (1 + modTotal(run,'goldPct')));
    }
    createFloorReward(room, 'treasure', '봉인된 금고', `각자 런 골드 ${bonusGold}G 이상을 획득했습니다. 금고에서는 별도의 유물 선택권도 제공됩니다.`, 'elite');
    pushRoomEvent(room, 'treasure', '오래된 금고가 열렸습니다.');
    return;
  }
  if (node.kind === 'merchant') {
    const shop = makeMerchantStock(room);
    createFloorReward(room, 'merchant', '유랑 상점', '무료 보상을 선택한 뒤 상점에서 회복·PP·장착·전투 아이템을 구매할 수 있습니다.', 'merchant', { shop, purchased: {} });
    pushRoomEvent(room, 'merchant', '등불을 든 상인이 길을 막아섰습니다.');
    return;
  }
  if (node.kind === 'event') {
    room.event = makeEventEncounter(room);
    room.status = 'event';
    pushRoomEvent(room, 'event', `${room.event.title} 사건이 발생했습니다.`);
  }
}

function cardPrice(c) {
  return ({ common: 60, rare: 105, ultra: 190, legendary: 390, mythic: 760 })[c.rarity] || 100;
}
function itemPrice(i) {
  return ({ common: 70, rare: 120, ultra: 220, legendary: 430, mythic: 820 })[i.rarity] || 100;
}

function makeMerchantStock(room) {
  return rewardItemOptions(room, null, 6, 'merchant').map(i => ({
    id: uid('shop'), type: 'item', itemId: i.id, item: publicItem(i), price: itemPrice(i)
  }));
}

function chooseEvent(room, playerId, choiceId) {
  if (room.status !== 'event' || !room.event) throw new Error('사건 선택 단계가 아닙니다.');
  if (room.event.chosenBy[playerId]) throw new Error('이미 선택했습니다.');
  const run = room.runState[playerId];
  const p = profiles[playerId];
  let message = '';
  if (choiceId === 'safe') {
    const heal = room.floor >= 31 ? 12 : 10;
    run.hp = clamp(run.hp + heal, 1, run.maxHp);
    message = `체력 ${heal}을 회복했습니다.`;
  } else if (choiceId === 'risk') {
    const loss = room.floor >= 31 ? 15 : 12;
    run.hp = Math.max(1, run.hp - loss);
    const item = rewardItemOptions(room, playerId, 1, 'elite')[0];
    if (item) addItemToRun(run,item.id);
    message = `CORE HP ${loss}를 대가로 ${item?`「${item.name}」`:'희귀 보급품'}을 획득했습니다.`;
  } else if (choiceId === 'scout') {
    const gold = 34 + room.floor * 3;
    run.gold += Math.round(gold * (1 + modTotal(run,'goldPct')));
    run.fragments = Number(run.fragments || 0) + 1 + (room.floor >= 25 ? 1 : 0);
    message = `런 골드 ${gold}G 이상과 균열 파편을 획득했습니다.`;
  } else if (choiceId === 'seal') {
    if ((p.seals.basic || 0) < 1) throw new Error('기본 봉인구가 없습니다.');
    p.seals.basic--;
    if (Math.random() < 0.68) {
      const item = rewardItemOptions(room, playerId, 1, 'event')[0];
      addItemToRun(run, item.id);
      message = `봉인 성공. 런 아이템 「${item.name}」 획득.`;
    } else message = '봉인이 튕겨 나갔습니다.';
  } else throw new Error('선택지가 없습니다.');
  room.event.chosenBy[playerId] = choiceId;
  saveProfiles();
  if (Object.keys(room.event.chosenBy).length >= room.players.length) {
    room.event = null;
    createFloorReward(room, 'event', '사건 통과', '사건을 통과했습니다. 보상을 하나 선택하거나 분해해 덱 밀도를 유지하세요.', 'event');
  }
  pushRoomEvent(room, 'event-choice', `${playerName(room, playerId)}: ${message}`);
}

function startBattle(room, tier) {
  room.status = 'battle'; room.route = null; room.event = null;
  const encounter = encounterProfile(room.floor);
  tier = tier || encounter.tier;
  const encounterType = tier === 'boss' ? 'boss' : tier === 'elite' ? 'warden' : tier === 'rival' ? 'rival' : 'wild';
  const modifier = tier === 'boss' ? null : clone(choose(BATTLE_MODIFIERS));
  const doubleBattle = ['elite','rival'].includes(tier) || (tier !== 'boss' && room.floor >= 4 && room.floor % Number(BATTLE_RULES.doubleBattleEvery||8) === 0);
  const activeSlots = doubleBattle ? Number(BATTLE_RULES.doubleActive||2) : Number(BATTLE_RULES.singleActive||1);
  const party = room.players.map((p, i) => makeCombatant(room.runState[p.id], i, activeSlots));
  const teamStartBlock = room.players.reduce((sum, p) => sum + modTotal(room.runState[p.id], 'teamStartBlock'), 0);
  if (teamStartBlock) party.forEach(pc => pc.block += teamStartBlock);
  if (modifier?.allySpeed) party.forEach(pc => pc.units.forEach(u => { u.statStages.speed = Math.max(u.statStages.speed, 1); }));
  if (modifier?.allyAccuracy) party.forEach(pc => pc.units.forEach(u => { u.statStages.accuracy = Math.max(u.statStages.accuracy, 1); }));
  if (modifier?.startBlock) party.forEach(pc => pc.block += modifier.startBlock);
  const scale = Math.max(1, room.players.length), enemyCount = doubleBattle ? 2 : 1, diff = roomDifficulty(room), biome = currentBiome(room), enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    let base;
    if (tier === 'boss') base = clone(BOSSES.find(x => x.biome === biome.id) || BOSSES[Math.min(BOSSES.length - 1, Math.floor((room.floor - 1) / 10))]);
    else {
      let pool = ENEMIES.filter(e => e.biome === biome.id);
      if (tier === 'elite') pool = pool.filter(e => ['rare','ultra'].includes(e.tier));
      else if (tier === 'rival') pool = pool.filter(e => ['common','rare','ultra'].includes(e.tier));
      else if (room.floor < 8) pool = pool.filter(e => e.tier !== 'ultra');
      base = clone(choose(pool.length ? pool : ENEMIES));
    }
    const threat = threatMods(room), floorHp=(1+(room.floor-1)*.022)*(1+threat.hp), floorAtk=(1+(room.floor-1)*.012)*(1+threat.atk), partyHp=(1+(scale-1)*.62)*diff.partyScale, eliteScale=tier==='elite'?1.24:tier==='rival'?1.12:1;
    base.uid=uid('enemy');base.maxHp=Math.round(base.hp*floorHp*partyHp*eliteScale*diff.enemyHp*(1+Number(modifier?.enemyHp||0))*(doubleBattle?.72:1));base.hp=base.maxHp;base.atk=Math.round(base.atk*floorAtk*(1+(scale-1)*.10)*(tier==='elite'?1.10:tier==='rival'?1.07:1)*diff.enemyAtk*(1+Number(modifier?.enemyAtk||0))*(doubleBattle?.88:1));
    base.block=Number(modifier?.enemyStartBlock||0);base.level=Math.min(100,Math.max(1,levelCapForFloor(room.floor)));base.moves=buildMonsterMoves(MONSTER_BY_ID[base.id]||base).map(m=>{const p=normalizeMovePp(m);return {...m,maxPp:p.maxPp,pp:p.maxPp,cooldownRemaining:0};});base.majorStatus=null;base.statusTurns=0;base.statStages={atk:0,def:0,speed:0,accuracy:0,evasion:0};base.debuffs={weak:0,vulnerable:0,burn:0,poison:0,shock:0,intentSeal:0};base.nextDamageHalf=false;base.counter=0;base.phase=tier==='boss'?1:0;base.enraged=false;base.hpSegmentsMax=tier==='boss'?(room.floor>=40?4:room.floor>=20?3:2):1;base.hpSegments=base.hpSegmentsMax;base.justBossBarBroken=false;base.staggerMax=Math.max(18,Math.round(base.maxHp*(tier==='boss'?.22:tier==='elite'?.25:.28)));base.stagger=0;base.staggerGainMult=1+Number(modifier?.breakGain||0);base.broken=0;base.justBroken=false;base.intent=rollIntent(base,tier,room.difficulty);enemies.push(base);
  }
  if (modifier?.markDamage && enemies[0]) enemies[0].marked = true;
  room.battle = { tier, encounterType, encounterLabel:encounter.label, waveInBiome:encounter.wave, battleMode:doubleBattle?'double':'single', activeSlots, turn:1, phase:'players', party, enemies, log:[], teamSpellCount:0, modifier };
  battleLog(room, `${encounter.kicker} · ${doubleBattle?'더블 배틀':'싱글 배틀'}${modifier?` · ${modifier.name}`:''}`);
  pushRoomEvent(room,'battle-start',`${encounter.label} 시작!`,{tier,encounterType,waveInBiome:encounter.wave,floor:room.floor,enemyIds:enemies.map(e=>e.uid),enemyNames:enemies.map(e=>e.name),enemySprites:enemies.map(e=>e.sprite),encounterLabel:encounter.label,modifier,battleMode:room.battle.battleMode});
}

function rollIntent(e, tier, difficulty = 'normal') {
  const r = Math.random();
  const hardShift = difficulty === 'hell' ? 0.10 : difficulty === 'hard' ? 0.05 : 0;
  const phaseShift = e.enraged ? 0.11 : 0;
  const heavy = Math.round(e.atk * (tier === 'boss' ? (e.enraged ? 1.92 : 1.72) : 1.50));
  if (r < 0.54 + hardShift + phaseShift) return { type: 'attack', value: e.atk, icon: '⚔', text: `공격 ${e.atk}` };
  if (r < 0.73) {
    const v = Math.max(5, Math.round(e.atk * 0.78));
    return { type: 'guard', value: v, icon: '▣', text: `방어 ${v}` };
  }
  if (r < 0.87) return { type: 'debuff', value: 1, icon: '☣', text: '약화 1' };
  return { type: 'heavy', value: heavy, icon: '✹', text: `강공 ${heavy}` };
}

function battleLog(room, text) {
  if (!room.battle) return;
  room.battle.log.push({ time: Date.now(), text });
  if (room.battle.log.length > 90) room.battle.log.shift();
}
function getPc(room, playerId) { return room.battle?.party.find(x => x.playerId === playerId); }
function aliveEnemies(room) { return room.battle?.enemies.filter(x => x.hp > 0) || []; }
function resolveCost(pc, c) {
  let cost = c.cost;
  if (pc.buffs.anyDiscount > 0) {
    cost = Math.max(0, cost - 1);
    pc.buffs.anyDiscount--;
  } else if (c.type === 'spell' && pc.buffs.spellDiscount > 0) {
    cost = Math.max(0, cost - 1);
    pc.buffs.spellDiscount--;
  }
  return cost;
}

function gainCardMastery(room, run, cardId) {
  if (!run || !CARD_BY_ID[cardId]) return null;
  run.mastery ||= {};
  run.upgrades ||= {};
  const xp = Number(run.mastery[cardId] || 0) + 1;
  run.mastery[cardId] = xp;
  const before = Number(run.upgrades[cardId] || 0);
  let after = before;
  if (before < 1 && xp >= 3) after = 1;
  if (after < 2 && xp >= 8) after = 2;
  if (after > before) {
    run.upgrades[cardId] = after;
    const name = CARD_BY_ID[cardId].name;
    battleLog(room, `${name} 숙련 상승! ${after === 1 ? '+' : '++'} 단계로 성장했습니다.`);
    return { cardId, name, level: after, xp };
  }
  return { cardId, name: CARD_BY_ID[cardId].name, level: before, xp };
}

function applyStandardEvolution(room,playerId,u,{natural=false,emit=true,eventQueue=null}={}){
  if(!u||u.evolved)return null;
  const species=MONSTER_BY_ID[u.speciesId];if(!species)return null;
  const fromName=u.name,fromSprite=u.evolved?(u.evolutionSprite||u.sprite):(u.sprite||u.baseSprite);
  u.evolved=true;
  u.maxHp=Math.round(u.maxHp*1.24);u.hp=Math.min(u.maxHp,Math.round(u.hp*1.24+8));u.power=Math.round(u.power*1.22+2);
  u.name=species.evolutionName||`${u.baseName} · 진화형`;
  const prof=profiles[playerId];if(prof?.stats)prof.stats.evolutions=Number(prof.stats.evolutions||0)+1;
  const payload={playerId,instanceId:u.instanceId,mode:'evolve',natural,level:u.level,fromName,toName:u.name,fromSprite,toSprite:u.evolutionSprite||species.evolutionSprite||u.sprite,element:u.element};
  const ev={type:'monster-evolve',message:`${fromName}이(가) ${u.name}(으)로 진화했다!`,payload};
  if(eventQueue)eventQueue.push(ev);else if(emit)pushRoomEvent(room,ev.type,ev.message,ev.payload);
  return ev;
}

function monsterLevelGain(room,pc,u,amount=0,eventQueue=[]){
  if(!u)return null;
  const species=MONSTER_BY_ID[u.speciesId];if(!species)return null;
  normalizeMonsterMoves(u);
  const fromLevel=Number(u.level||1),fromXp=Number(u.xp||0),fromMaxHp=Number(u.maxHp||0),fromPower=Number(u.power||0),levelCap=levelCapForFloor(room.floor);
  u.xp=fromXp+Math.max(0,Math.round(amount));
  const learned=[];let levels=0;
  while(u.level<Number(BATTLE_RULES.maxMonsterLevel||100) && u.level<levelCap){
    const need=xpNeededForLevel(u.level);if(u.xp<need)break;
    u.xp-=need;const previous=u.level;u.level++;levels++;u.levelUpsThisBattle=Number(u.levelUpsThisBattle||0)+1;
    const oldMax=u.maxHp,oldPower=u.power;u.maxHp=Math.round(u.maxHp*1.035+1);u.power=Math.max(u.power+1,Math.round(u.power*1.025+0.5));u.hp=Math.min(u.maxHp,u.hp+(u.maxHp-oldMax)+3);
    const newMoves=levelMovesBetween(species,previous,u.level);
    for(const mv of newMoves){if(!(u.pendingLearnMoves||[]).some(x=>x.id===mv.id)&&!(u.moves||[]).some(x=>x.id===mv.id)){const ready=prepareMove(mv,species);u.pendingLearnMoves.push(ready);learned.push(ready);}}
    eventQueue.push({type:'monster-level',message:`${u.name} Lv.${u.level}!`,payload:{playerId:pc.playerId,instanceId:u.instanceId,monsterName:u.name,sprite:u.evolved?(u.evolutionSprite||u.sprite):u.sprite,element:u.element,level:u.level,fromLevel:previous,levelCap,unlocked:newMoves.map(x=>x.name),statGain:{hp:u.maxHp-oldMax,power:u.power-oldPower},stats:{hp:u.maxHp,power:u.power}}});
    if(!u.evolved&&u.level>=Number(u.evolutionLevel||evolutionLevel(species)))applyStandardEvolution(room,pc.playerId,u,{natural:true,emit:false,eventQueue});
  }
  const capped=u.level>=levelCap&&u.level<Number(BATTLE_RULES.maxMonsterLevel||100);
  if(capped)u.xp=Math.min(u.xp,Math.max(0,xpNeededForLevel(u.level)-1));
  battleLog(room,`${u.name} EXP +${Math.round(amount)}${levels?` · Lv.${fromLevel} → Lv.${u.level}`:''}${capped?` · CAP ${levelCap}`:''}`);
  return{instanceId:u.instanceId,speciesId:u.speciesId,name:u.name,sprite:u.evolved?(u.evolutionSprite||u.sprite):u.sprite,fromLevel,toLevel:u.level,fromXp,xp:u.xp,xpNeed:xpNeededForLevel(u.level),xpGained:Math.max(0,Math.round(amount)),leveled:levels>0,levelsGained:levels,newMoves:learned.map(x=>({id:x.id,name:x.name,learnLevel:x.learnLevel})),levelCap,capped,fromStats:{hp:fromMaxHp,power:fromPower},toStats:{hp:u.maxHp,power:u.power},statGain:{hp:u.maxHp-fromMaxHp,power:u.power-fromPower}};
}

function awardBattleMonsterXp(room,pc,tier,eventQueue=[]){
  const base=battleXpForFloor(room.floor,tier,room.difficulty);const rows=[];const seen=new Set();
  const grant=(u,mult,role)=>{if(!u||seen.has(u.instanceId))return;seen.add(u.instanceId);const amount=Math.max(1,Math.round(base*mult));const row=monsterLevelGain(room,pc,u,amount,eventQueue);if(row){row.partyRole=role;rows.push(row);}};
  for(const u of pc.units||[])grant(u,1,'active');
  for(const u of pc.bench||[])grant(u,.58,'bench');
  for(const u of pc.ko||[])grant(u,.30,'ko');
  return rows;
}

function monsterDamage(room, pc, u, amount, source=null){
  let d=Math.max(0,Math.round(amount)); if(!u)return 0;
  // Monster-specific mitigation happens before shields so the shield value is easy to understand.
  if(u.archetype==='golem'||u.secondaryArchetype==='golem')d=Math.round(d*.90);
  if((u.archetype==='wing'||u.secondaryArchetype==='wing')&&!u.firstHitTaken){d=Math.round(d*.80);u.firstHitTaken=true;}
  const beforeMonsterBlock=Number(u.block||0);
  if(u.block>0){const x=Math.min(u.block,d);u.block-=x;d-=x;}
  if(beforeMonsterBlock>0&&u.block<=0&&(u.archetype==='crab'||u.secondaryArchetype==='crab')){
    u.nextAttackBonus=Number(u.nextAttackBonus||0)+4;
    pushRoomEvent(room,'monster-passive',`${u.name} 갑각 반격 준비!`,{playerId:pc.playerId,instanceId:u.instanceId,passive:'갑각 반격'});
  }
  // Team CORE shield is the second protection layer after the active monster's own shield.
  if(pc.block>0){const x=Math.min(pc.block,d);pc.block-=x;d-=x;}
  const before=u.hp;u.hp=clamp(u.hp-d,0,u.maxHp);const dealt=before-u.hp;pc.stats.monsterDamageTaken+=dealt;
  if(dealt>0)u.rift=clamp(Number(u.rift||0)+Math.max(1,Math.ceil(dealt/18)),0,5);
  const heldItem=heldItemDef(u), held=heldItem?.held;
  if(u.hp>0&&!u.heldItemUsed&&held?.kind==='lowHpHeal'&&u.hp/u.maxHp<=Number(held.threshold||.4)){
    const heal=Math.max(1,Math.round(u.maxHp*Number(held.healPct||.2)));u.hp=clamp(u.hp+heal,0,u.maxHp);u.heldItemUsed=true;
    pushRoomEvent(room,'held-item',`${u.name}의 ${heldItem.name} 발동 · HP +${heal}`,{playerId:pc.playerId,instanceId:u.instanceId,itemId:heldItem.id,heal});
  }else if(u.hp>0&&!u.heldItemUsed&&held?.kind==='lowHpGuard'&&u.hp/u.maxHp<=Number(held.threshold||.5)){
    const guard=Math.max(1,Number(held.block||12));u.block=Number(u.block||0)+guard;u.heldItemUsed=true;
    pushRoomEvent(room,'held-item',`${u.name}의 ${heldItem.name} 발동 · 방어 +${guard}`,{playerId:pc.playerId,instanceId:u.instanceId,itemId:heldItem.id,block:guard});
  }
  if(dealt>0&&source&&held?.kind==='thorns'&&Number(source.hp||0)>0){const reflect=applyDamage(source,Math.max(1,Number(held.damage||4)));if(reflect>0)pushRoomEvent(room,'held-item',`${u.name}의 ${heldItem.name} · 반사 ${reflect}`,{playerId:pc.playerId,instanceId:u.instanceId,itemId:heldItem.id,damage:reflect,enemyUid:source.uid||null});}
  let revived=false;
  if(u.hp<=0&&(u.archetype==='phoenix'||u.secondaryArchetype==='phoenix')&&!u.revived){u.revived=true;u.hp=Math.max(1,Math.round(u.maxHp*.25));revived=true;pushRoomEvent(room,'monster-passive',`${u.name} 재점화!`,{playerId:pc.playerId,instanceId:u.instanceId,passive:'재점화'});}
  if(!revived&&u.hp<=0){
    const pos=pc.units.findIndex(x=>x.instanceId===u.instanceId); if(pos>=0)pc.units.splice(pos,1); pc.ko.push(u); pc.hp=Math.max(1,pc.hp-Math.max(4,Math.round(pc.maxHp*.06)));
    if(pc.bench.length){const next=pc.bench.shift();next.block=Math.max(next.block||0,4);pc.units.splice(Math.min(pos<0?pc.units.length:pos,pc.units.length),0,next);pushRoomEvent(room,'monster-switch',`${next.name} 자동 출전!`,{playerId:pc.playerId,instanceId:next.instanceId,auto:true});}
    if(!pc.units.length&&!pc.bench.length){pc.down=true;pc.ended=true;}
  }
  pushRoomEvent(room,'monster-hit',`${u.name} ${dealt} 피해`,{playerId:pc.playerId,instanceId:u.instanceId,damage:dealt,ko:u.hp<=0&&!revived,revived,shieldBroken:beforeMonsterBlock>0&&u.block<=0});
  return dealt;
}

function evolveMonster(room, playerId, instanceId, mode='evolve'){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 진화할 수 없습니다.');const u=findCombatMonster(pc,instanceId);if(!u)throw new Error('몬스터를 찾을 수 없습니다.');
  const prof=profiles[playerId];const species=MONSTER_BY_ID[u.speciesId];normalizeMonsterMoves(u);
  if(mode==='evolve'){
    if(u.evolved)throw new Error('이미 진화했습니다.');const natural=Number(u.level||1)>=Number(u.evolutionLevel||evolutionLevel(species));const accelerated=Number(u.level||1)>=3&&Number(u.gene||0)>=3;if(!natural&&!accelerated)throw new Error(`자연 진화는 Lv.${u.evolutionLevel}, 조기 진화에는 Lv.3 + GENE 3이 필요합니다.`);if(!natural)u.gene-=3;applyStandardEvolution(room,playerId,u,{natural,emit:true});
  }else if(mode==='resonance'){
    if(u.resonanceTurns>0)throw new Error('이미 공명진화 상태입니다.');if(u.resonance<4)throw new Error('공명진화에는 RES 4가 필요합니다.');const fromSprite=u.evolved?(u.evolutionSprite||u.sprite):u.sprite;u.resonance-=4;u.resonanceTurns=3;u.block=Number(u.block||0)+6;prof.stats.resonanceEvolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 공명진화!`,{playerId,instanceId:u.instanceId,mode:'resonance',fromName:u.name,toName:u.resonanceName||u.name,fromSprite,toSprite:u.resonanceSprite||fromSprite,element:u.element});
  }else if(mode==='rift'){
    if(u.abyssBloom)throw new Error('이미 균열개화 상태입니다.');if(u.rift<3||u.hp/u.maxHp>.60)throw new Error('균열개화에는 HP 60% 이하 + RIFT 3이 필요합니다.');const fromSprite=u.evolved?(u.evolutionSprite||u.sprite):u.sprite;u.rift-=3;u.abyssBloom=true;u.nextAttackBonus=Number(u.nextAttackBonus||0)+5;prof.stats.riftBlooms++;pushRoomEvent(room,'monster-evolve',`${u.name} 균열개화!`,{playerId,instanceId:u.instanceId,mode:'rift',fromName:u.name,toName:u.abyssName||u.name,fromSprite,toSprite:u.riftSprite||fromSprite,element:u.element});
  }else throw new Error('알 수 없는 진화 방식입니다.');
  saveProfiles();return u;
}
function fuseMonsters(room,playerId,primaryId,secondaryId,moveIds=[]){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 융합할 수 없습니다.');
  const a=findCombatMonster(pc,primaryId),b=findCombatMonster(pc,secondaryId);if(!a||!b||a.instanceId===b.instanceId)throw new Error('서로 다른 몬스터 2마리를 선택하세요.');
  if(a.fused||b.fused)throw new Error('융합 상태의 몬스터는 해제되기 전 다시 융합할 수 없습니다.');
  if(!pc.units.some(x=>x.instanceId===a.instanceId))throw new Error('현재 출전 중인 몬스터를 융합의 주체로 선택하세요.');if(a.acted)throw new Error('이미 행동한 몬스터는 융합할 수 없습니다.');if(b.hp<=0)throw new Error('쓰러진 몬스터와는 융합할 수 없습니다.');
  const primaryLocation=combatMonsterLocation(pc,a.instanceId),partnerLocation=combatMonsterLocation(pc,b.instanceId);if(!primaryLocation||!partnerLocation)throw new Error('융합 위치를 확인할 수 없습니다.');
  normalizeMonsterMoves(a);normalizeMonsterMoves(b);normalizeMajorStatus(a);normalizeMajorStatus(b);
  const primarySnapshot=clone(a),partnerSnapshot=clone(b);
  const ratioA=a.maxHp?Math.max(.01,a.hp/a.maxHp):1,ratioB=b.maxHp?Math.max(.01,b.hp/b.maxHp):1;
  const before={aName:a.name,bName:b.name,aSprite:monsterDisplaySpriteServer(a),bSprite:monsterDisplaySpriteServer(b),aElement:a.element,bElement:b.element};
  const lineage=[...new Set([...(a.fusionLineage||[a.speciesId]),...(b.fusionLineage||[b.speciesId])])];
  const elements=[a.element,a.secondaryElement,b.element,b.secondaryElement].filter(Boolean);const uniqueElements=[...new Set(elements)];
  const chosen=selectedFusionMoves(a,b,moveIds);if(!chosen.length)throw new Error('융합 후 사용할 기술을 선택할 수 없습니다.');
  a.fusionState={primary:primarySnapshot,partner:partnerSnapshot,primaryLocation,partnerLocation};a.fusionTurnsLeft=5;a.fusionStartTurn=Number(room.battle.turn||1);
  a.fused=true;a.fusionWith=b.speciesId;a.fusionSprite=b.sprite;a.fusionPrimarySprite=before.aSprite;a.fusionSecondarySprite=before.bSprite;a.fusionLineage=lineage;a.fusionDepth=1;
  a.secondaryElement=uniqueElements.find(x=>x!==a.element)||null;a.secondaryArchetype=b.archetype;a.secondaryPassive=clone(b.passive||{});a.name=fusionDisplayNameFor(a,b);a.fusionArt=fusionArtDataUri({primarySprite:before.aSprite,secondarySprite:before.bSprite,primaryElement:a.element,secondaryElement:a.secondaryElement||b.element||a.element,fusionName:a.name,signature:fusionPairKey(a.speciesId||a.instanceId,b.speciesId||b.instanceId)});
  const newMax=Math.max(20,Math.round((Number(a.maxHp||1)+Number(b.maxHp||1))/2*1.08));a.maxHp=newMax;a.hp=clamp(Math.round(newMax*((ratioA+ratioB)/2)),1,newMax);
  a.power=Math.max(3,Math.round((Number(a.power||1)+Number(b.power||1))/2*1.06));a.pointCost=Math.min(14,Number(a.pointCost||1)+Number(b.pointCost||1));a.resonance=Math.max(a.resonance,b.resonance);a.rift=Math.max(a.rift,b.rift);a.moves=chosen;
  a.statStages={atk:0,def:0,speed:0,accuracy:0,evasion:0};if(!a.majorStatus&&b.majorStatus){a.majorStatus=b.majorStatus;a.statusTurns=b.statusTurns||0;}
  for(const arr of [pc.units,pc.bench,pc.ko]){const i=arr.findIndex(x=>x.instanceId===b.instanceId);if(i>=0)arr.splice(i,1);}a.acted=true;pc.stats.fusions=Number(pc.stats.fusions||0)+1;
  profiles[playerId].stats.fusions++;saveProfiles();pushRoomEvent(room,'monster-fuse',`${a.name} 융합 완성!`,{playerId,instanceId:a.instanceId,secondaryId:b.instanceId,fromA:before.aName,fromB:before.bName,fromSpriteA:before.aSprite,fromSpriteB:before.bSprite,toName:a.name,toSprite:monsterDisplaySpriteServer(a),elements:uniqueElements.slice(0,2),lineage:lineage.slice(),moves:a.moves.map(m=>({id:m.id,name:m.name,element:m.element,pp:m.pp,maxPp:m.maxPp})),consumesAction:true,turnsLeft:5,maxTurns:5});
  if(pc.units.filter(u=>u.hp>0).every(u=>u.acted)){pc.ended=true;if(room.battle.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}return a;
}
function switchMonster(room,playerId,activeId,benchId){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 교대할 수 없습니다.');if(pc.switchesUsed>=1)throw new Error('몬스터 교대는 턴당 1회입니다.');
  const ai=pc.units.findIndex(x=>x.instanceId===activeId),bi=pc.bench.findIndex(x=>x.instanceId===benchId);if(ai<0||bi<0)throw new Error('교대 대상을 찾을 수 없습니다.');const a=pc.units[ai],b=pc.bench[bi];if(a.acted)throw new Error('이미 행동한 몬스터는 교대할 수 없습니다.');pc.units[ai]=b;pc.bench[bi]=a;b.acted=true;pc.switchesUsed++;pushRoomEvent(room,'monster-switch',`${a.name} ↔ ${b.name}`,{playerId,activeId,benchId,consumesAction:true});
  if(pc.units.filter(u=>u.hp>0).every(u=>u.acted)){pc.ended=true;if(room.battle.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}return b;
}

function playCard(room, playerId, handIndex, targetUid, targetMonsterId) {
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('카드를 사용할 차례가 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');if(Number(pc.tacticsUsed||0)>=Number(pc.tacticLimit||BATTLE_RULES.tacticCardsPerTurn))throw new Error(`전술 카드는 턴당 ${pc.tacticLimit||BATTLE_RULES.tacticCardsPerTurn}장까지만 사용할 수 있습니다.`);
  const index=Number(handIndex),cid=pc.hand[index],base=CARD_BY_ID[cid],run=room.runState[playerId],c=effectiveRunCard(run,base);if(!c||c.type!=='spell')throw new Error('사용할 공명 지령이 없습니다.');
  const previewCost=Math.max(0,c.cost-(pc.buffs.anyDiscount>0?1:(pc.buffs.spellDiscount>0?1:0)));if(pc.energy<previewCost)throw new Error('에너지가 부족합니다.');const cost=resolveCost(pc,c);pc.energy-=cost;pc.hand.splice(index,1);pc.stats.cardsPlayed++;pc.tacticsUsed=Number(pc.tacticsUsed||0)+1;
  const target=aliveEnemies(room).find(e=>e.uid===targetUid)||aliveEnemies(room)[0];const monster=findCombatMonster(pc,targetMonsterId)||pc.units[0];castSpell(room,pc,c,target,monster);pc.discard.push(cid);const masteryResult=gainCardMastery(room,run,cid);
  // Monster EXP is awarded only after a battle. Spell use builds resonance/gene, not levels.
  if(monster){
    const affinity=c.element===monster.element,amp=affinity?.20:.10;monster.tacticAmp=Math.max(Number(monster.tacticAmp||0),amp);monster.tacticElement=c.element;monster.tacticCardName=c.name;monster.tacticStagger=Math.max(Number(monster.tacticStagger||0),affinity?6:3);
    if(affinity){const extra=monster.archetype==='spirit'&&Math.random()<.35?2:1;monster.resonance=clamp(Number(monster.resonance||0)+extra,0,6);}if(c.cardClass==='gene')monster.gene=clamp(Number(monster.gene||0),0,8);
    pushRoomEvent(room,'tactic-link',`${monster.name} 공명 지령 준비!`,{playerId:pc.playerId,instanceId:monster.instanceId,monsterName:monster.name,monsterElement:monster.element,cardId:c.id,cardName:c.name,cardText:c.text||'',element:c.element,effects:clone(c.effects||[]),targetUid:target?.uid||null,affinity,amp,stagger:monster.tacticStagger});
  }
  if(b.modifier?.everyThirdDraw&&pc.stats.cardsPlayed%3===0){drawCards(pc,b.modifier.everyThirdDraw);battleLog(room,`${b.modifier.name}: 카드 1장을 추가로 드로우했습니다.`);}
  const chainResult=updateTacticalChain(room,pc,c,monster,target),phaseShifts=updateBossPhase(room),breakTargets=b.enemies.filter(e=>e.justBroken&&e.hp>0);for(const e of b.enemies)e.justBroken=false;if(checkBattleEnd(room))return;
  pushRoomEvent(room,'card',`${pc.nickname}: ${c.name}`,{playerId:pc.playerId,cardId:c.id,cardName:c.name,cardText:c.text||'',effects:clone(c.effects||[]),cardType:c.type,cardClass:c.cardClass,element:c.element,targetUid:target?.uid||null,targetMonsterId:monster?.instanceId||null,cost,chainCount:chainResult.displayCount,chainStage:chainResult.stage,upgradeLevel:Number(run.upgrades?.[c.id]||0),masteryXp:masteryResult?.xp||0});
  if(masteryResult&&masteryResult.level>Number(c.upgradeLevel||0))pushRoomEvent(room,'mastery',`${masteryResult.name} 성장!`,{playerId:pc.playerId,cardId:c.id,level:masteryResult.level,xp:masteryResult.xp});for(const e of breakTargets)pushRoomEvent(room,'enemy-break',`${e.name}의 균열 자세 붕괴!`,{enemyUid:e.uid,enemyName:e.name});if(chainResult.stage)pushRoomEvent(room,'chain',`${pc.nickname} ${chainResult.stage==='overdrive'?'오버드라이브':'전술 연쇄'} 발동!`,{playerId:pc.playerId,stage:chainResult.stage,count:chainResult.displayCount});for(const e of phaseShifts)pushRoomEvent(room,'boss-phase',`${e.name} 2단계!`,{enemyUid:e.uid,enemyName:e.name,phase:2});
}

function enemyMajorStatusLabel(status){return({paralysis:'마비',sleep:'수면',freeze:'빙결'})[status]||status||'';}
function tryEnemyMajorStatus(target,status,turns=0){
  if(!target||target.hp<=0||target.majorStatus)return false;target.majorStatus=status;target.statusTurns=turns||((status==='sleep'||status==='freeze')?2:0);return true;
}
function preEnemyActionStatus(room,e){
  const st=e?.majorStatus;if(!st)return false;
  if(st==='sleep'){e.statusTurns=Math.max(0,Number(e.statusTurns||2)-1);pushRoomEvent(room,'enemy-status-turn',`${e.name}은(는) 잠들어 있다.`,{enemyUid:e.uid,enemyName:e.name,status:st,label:'수면',blocked:true});if(e.statusTurns<=0){e.majorStatus=null;pushRoomEvent(room,'enemy-status-cure',`${e.name}이(가) 깨어났다.`,{enemyUid:e.uid,enemyName:e.name,status:st,label:'수면'});}return true;}
  if(st==='freeze'){if(process.env.TEST_MODE!=='1'&&Math.random()<.22){e.majorStatus=null;e.statusTurns=0;pushRoomEvent(room,'enemy-status-cure',`${e.name}의 얼음이 녹았다.`,{enemyUid:e.uid,enemyName:e.name,status:st,label:'빙결'});return false;}pushRoomEvent(room,'enemy-status-turn',`${e.name}은(는) 얼어붙어 움직이지 못한다.`,{enemyUid:e.uid,enemyName:e.name,status:st,label:'빙결',blocked:true});return true;}
  if(st==='paralysis'&&process.env.TEST_MODE!=='1'&&Math.random()<.25){pushRoomEvent(room,'enemy-status-turn',`${e.name}은(는) 마비되어 움직이지 못했다.`,{enemyUid:e.uid,enemyName:e.name,status:st,label:'마비',blocked:true});return true;}
  return false;
}
function maybeApplyEnemyMajorStatus(target,move){
  if(!target||!move||target.majorStatus)return null;const test=process.env.TEST_MODE==='1',seed=String(move.id||'');
  if(Number(move.sleep||0)>0&&(test||Math.random()<.55)&&tryEnemyMajorStatus(target,'sleep',Number(move.sleep||2)))return{key:'sleep',label:'수면',value:Number(move.sleep||2)};
  if(Number(move.freeze||0)>0&&(test||Math.random()<.38)&&tryEnemyMajorStatus(target,'freeze',Number(move.freeze||2)))return{key:'freeze',label:'빙결',value:Number(move.freeze||2)};
  if(Number(move.shock||0)>0&&(!test?Math.random()<.32:(seed.length%2===0))&&tryEnemyMajorStatus(target,'paralysis',0))return{key:'paralysis',label:'마비',value:1};
  return null;
}

function moveDamage(room,pc,u,target,move){
  let amount=Math.max(1,Math.round(Number(u.power||1)*Number(move.ratio||0)+Number(move.power||0)+Number(u.nextAttackBonus||0)));u.nextAttackBonus=0;
  normalizeMajorStatus(u);const held=heldItemDef(u)?.held,moveElement=move.element||u.element;
  if(held?.kind==='movePower')amount=Math.max(1,Math.round(amount*(1+Number(held.powerPct||0))));
  if(held?.kind==='sameElementPower'&&(moveElement===u.element||moveElement===u.secondaryElement))amount=Math.max(1,Math.round(amount*(1+Number(held.powerPct||0))));
  // Familiar monster-RPG damage grammar: same-type bonus, crits, small random roll, then RIFT's own element chart.
  const stab=(moveElement===u.element||moveElement===u.secondaryElement)?1.20:1;
  const crit=(process.env.TEST_MODE==='1')?false:Math.random()<1/16;const random=(process.env.TEST_MODE==='1')?.95:(.90+Math.random()*.10);
  const burnPenalty=(u.majorStatus==='burn'&&['attack','burst'].includes(move.kind))?.75:1;
  const atkStage=stageMultiplier(u.statStages?.atk||0);amount=Math.max(1,Math.round(amount*stab*(crit?1.5:1)*random*burnPenalty*atkStage));
  amount=modifiedDamage(room,pc,amount,{type:'monster',element:moveElement});const effectiveness=elementalMultiplier(moveElement,target?.element);
  let dealt=applyElementDamage(target,amount,moveElement);pc.stats.damage+=dealt;pc.lastMonsterDamage=dealt;
  if(move.rewrite?.id==='echo'&&target.hp>0){const echo=applyElementDamage(target,Math.max(1,Math.round(amount*.35)),moveElement);dealt+=echo;pc.stats.damage+=echo;battleLog(room,`${u.name}의 잔향 복제가 ${echo} 추가 피해.`);}
  if(move.lifesteal)u.hp=clamp(u.hp+Math.max(1,Math.round(dealt*Number(move.lifesteal))),0,u.maxHp);
  if(move.weak)target.debuffs.weak=Math.max(Number(target.debuffs.weak||0),Number(move.weak));if(move.vulnerable)target.debuffs.vulnerable=Math.max(Number(target.debuffs.vulnerable||0),Number(move.vulnerable));
  if(move.burn)target.debuffs.burn=Number(target.debuffs.burn||0)+Number(move.burn);if(move.poison)target.debuffs.poison=Number(target.debuffs.poison||0)+Number(move.poison);if(move.shock)target.debuffs.shock=Number(target.debuffs.shock||0)+Number(move.shock);if(move.intentSeal)target.debuffs.intentSeal=Math.max(Number(target.debuffs.intentSeal||0),Number(move.intentSeal));
  maybeApplyEnemyMajorStatus(target,move);
  if(move.stagger&&target.hp>0&&!target.broken){target.stagger=clamp(Number(target.stagger||0)+Number(move.stagger),0,target.staggerMax||999);if(target.stagger>=target.staggerMax){target.broken=1;target.justBroken=true;target.debuffs.vulnerable=Math.max(Number(target.debuffs.vulnerable||0),1);}}
  if(move.rewrite?.id==='breaker'&&target.justBroken)u.resonance=clamp(Number(u.resonance||0)+1,0,6);
  if(move.splash){for(const e of aliveEnemies(room)){if(e===target)continue;const splash=applyElementDamage(e,Math.max(1,Math.round(dealt*Number(move.splash))),moveElement);pc.stats.damage+=splash;}}
  return {dealt,crit,effectiveness};
}
function enemyStatusSnapshot(e){return{weak:Number(e?.debuffs?.weak||0),vulnerable:Number(e?.debuffs?.vulnerable||0),burn:Number(e?.debuffs?.burn||0),poison:Number(e?.debuffs?.poison||0),shock:Number(e?.debuffs?.shock||0),intentSeal:Number(e?.debuffs?.intentSeal||0),majorStatus:e?.majorStatus||null,statusTurns:Number(e?.statusTurns||0),broken:Number(e?.broken||0),stagger:Number(e?.stagger||0)};}
function enemyStatusDelta(before,after){
  const labels={burn:'화상',poison:'독',shock:'감전',weak:'공격↓',vulnerable:'방어↓',intentSeal:'행동 봉쇄'};const out=[];
  for(const k of ['burn','poison','shock','weak','vulnerable','intentSeal']){const d=Number(after[k]||0)-Number(before[k]||0);if(d>0)out.push({key:k,label:labels[k],value:d,total:Number(after[k]||0)});}
  if(before.majorStatus!==after.majorStatus&&after.majorStatus)out.push({key:after.majorStatus,label:enemyMajorStatusLabel(after.majorStatus),value:Math.max(1,Number(after.statusTurns||1)),total:Number(after.statusTurns||0)});
  if(!before.broken&&after.broken)out.push({key:'broken',label:'BREAK',value:1,total:1});
  else if(Number(after.stagger||0)>Number(before.stagger||0))out.push({key:'stagger',label:'BREAK 게이지',value:Number(after.stagger)-Number(before.stagger),total:Number(after.stagger||0)});
  return out;
}
function moveEffectSummary(move){const out=[];if(move?.signature)out.push('전용기');if(move?.burn)out.push(`화상 ${move.burn}`);if(move?.poison)out.push(`독 ${move.poison}`);if(move?.shock)out.push('마비 가능');if(move?.sleep)out.push('수면');if(move?.freeze)out.push('빙결');if(move?.weak)out.push(`공격↓ ${move.weak}`);if(move?.vulnerable)out.push(`방어↓ ${move.vulnerable}`);if(move?.intentSeal)out.push(`행동봉쇄 ${move.intentSeal}`);if(move?.stagger)out.push(`BREAK +${move.stagger}`);if(move?.lifesteal)out.push('흡혈');if(move?.splash)out.push('범위');if(move?.shield)out.push(`방어 +${move.shield}`);if(move?.heal)out.push(`회복 +${move.heal}`);return out;}

function useMonsterMove(room,playerId,instanceId,moveId,targetUid){
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('기술을 사용할 차례가 아닙니다.');
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');
  const u=pc.units.find(x=>x.instanceId===instanceId)||pc.units[0];if(!u)throw new Error('출전 몬스터가 없습니다.');normalizeMonsterMoves(u);if(u.acted)throw new Error('이 몬스터는 이미 행동했습니다.');
  const move=u.moves.find(x=>x.id===moveId);if(!move)throw new Error('기술을 찾을 수 없습니다.');if(u.level<Number(move.unlockLevel||1))throw new Error(`Lv.${move.unlockLevel}에서 해금되는 기술입니다.`);const pp=normalizeMovePp(move);move.maxPp=pp.maxPp;move.pp=pp.pp;if(move.pp<=0)throw new Error('이 기술의 PP가 없습니다.');if(preActionStatus(room,pc,u)){u.acted=true;if(pc.units.filter(x=>x.hp>0).every(x=>x.acted)){pc.ended=true;if(b.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}return {skipped:true,status:u.majorStatus};}move.pp-=1;
  move.masteryUses=Number(move.masteryUses||0);move.masteryStage=Math.max(Number(move.masteryStage||0),moveMasteryStage(move.masteryUses));
  const rewrite=move.rewrite?(MOVE_REWRITE_BY_ID[move.rewrite.id]||move.rewrite):null;
  const effective=applyMoveMastery({...move,rewrite:rewrite?clone(rewrite):null},move.masteryStage);
  if(rewrite?.id==='overclock'){effective.power=Math.round(Number(effective.power||0)*1.18);effective.ratio=Number(effective.ratio||0)*1.18;effective.accuracy=Math.max(50,Number(effective.accuracy||100)-6);effective.cooldown=Math.max(0,Number(effective.cooldown||0)-1);}
  if(rewrite?.id==='breaker')effective.stagger=Number(effective.stagger||0)+16;
  if(rewrite?.id==='feedback'){effective.shield=Math.round(Number(effective.shield||0)*1.35);effective.heal=Math.round(Number(effective.heal||0)*1.35);effective.boost=Math.round(Number(effective.boost||0)*1.35);effective.cooldown=Number(effective.cooldown||0)+1;}
  if(rewrite?.id==='blood'){effective.power=Math.round(Number(effective.power||0)*1.35);effective.ratio=Number(effective.ratio||0)*1.35;}
  if(rewrite?.id==='orbit')effective.cooldown=Number(effective.cooldown||0)+1;
  const heldItem=heldItemDef(u),held=heldItem?.held;
  if(!u.heldItemUsed&&held?.kind==='firstMoveResonance'){const gain=Math.max(1,Number(held.resonance||1));u.resonance=clamp(Number(u.resonance||0)+gain,0,6);u.heldItemUsed=true;pushRoomEvent(room,'held-item',`${u.name}의 ${heldItem.name} · 공명 +${gain}`,{playerId,instanceId:u.instanceId,itemId:heldItem.id,resonance:gain});}
  const target=aliveEnemies(room).find(e=>e.uid===targetUid)||aliveEnemies(room)[0];const targetHpBefore=Number(target?.hp||0),targetMaxHp=Number(target?.maxHp||1),statusBefore=enemyStatusSnapshot(target);let dealt=0,hit=true,critical=false,effectiveness=1;
  const tacticLink=Number(u.tacticAmp||0)>0?{amp:Number(u.tacticAmp||0),element:u.tacticElement||null,cardName:u.tacticCardName||'공명 지령',stagger:Number(u.tacticStagger||0)}:null;
  if(tacticLink){effective.power=Math.round(Number(effective.power||0)*(1+tacticLink.amp));effective.ratio=Number(effective.ratio||0)*(1+tacticLink.amp);effective.stagger=Number(effective.stagger||0)+tacticLink.stagger;}
  if(effective.kind!=='guard'&&effective.kind!=='heal'&&effective.kind!=='status'){hit=process.env.TEST_MODE==='1'||Math.random()<Number(effective.accuracy||100)/100;}
  if(hit&&['attack','burst'].includes(effective.kind)&&target){const dmg=moveDamage(room,pc,u,target,effective);dealt=dmg.dealt;critical=dmg.crit;effectiveness=dmg.effectiveness;battleLog(room,`${u.name}의 ${move.name}! ${target.name}에게 ${dealt} 피해${critical?' · 급소':''}${effectiveness>1?' · 효과 굉장':effectiveness<1?' · 효과 약함':''}${rewrite?` · ${rewrite.name}`:''}.`);}else if(!hit){battleLog(room,`${u.name}의 ${move.name} — 빗나갔다!`);}
  if(effective.shield){u.block=Number(u.block||0)+Number(effective.shield);battleLog(room,`${u.name} 방어막 +${effective.shield}.`);}
  if(effective.heal){const before=u.hp;u.hp=clamp(u.hp+Number(effective.heal),0,u.maxHp);pc.stats.healing+=u.hp-before;}
  if(effective.boost)u.power+=Number(effective.boost);
  if(effective.resonance)u.resonance=clamp(Number(u.resonance||0)+Number(effective.resonance),0,6);
  if(effective.draw)drawCards(pc,Number(effective.draw));
  if(rewrite?.id==='blood')u.hp=Math.max(1,u.hp-Math.max(1,Math.round(u.maxHp*.05)));
  if(rewrite?.id==='aegis'){u.block=Number(u.block||0)+6;u.nextAttackBonus=Number(u.nextAttackBonus||0)+4;}
  if(rewrite?.id==='resonator'){u.gene=clamp(Number(u.gene||0)+1,0,8);u.resonance=clamp(Number(u.resonance||0)+1,0,6);}
  if(rewrite?.id==='orbit')drawCards(pc,1);
  move.cooldownRemaining=0;
  if(!hit&&rewrite?.id==='zero'){move.pp=Math.min(move.maxPp,Number(move.pp||0)+1);u.rift=clamp(Number(u.rift||0)+1,0,5);battleLog(room,`${u.name}의 제로 루프 — PP 1 회수 · RIFT +1.`);}
  if(rewrite?.id==='orbit'){const other=(u.moves||[]).filter(x=>x.id!==move.id&&Number(x.pp||0)<Number(x.maxPp||defaultMovePp(x))).sort((x,y)=>(x.pp/x.maxPp)-(y.pp/y.maxPp))[0];if(other)other.pp=Math.min(other.maxPp,Number(other.pp||0)+1);}
  if(tacticLink){battleLog(room,`${u.name} 공명 지령 · ${Math.round(tacticLink.amp*100)}% 증폭.`);u.tacticAmp=0;u.tacticElement=null;u.tacticCardName=null;u.tacticStagger=0;}
  u.acted=true;pc.stats.movesUsed=Number(pc.stats.movesUsed||0)+1;
  const run=room.runState[playerId];if(run){run.moveUseCounts ||= {};const key=`${u.instanceId}:${move.id}`;run.moveUseCounts[key]=Number(run.moveUseCounts[key]||0)+1;}
  move.masteryUses=Number(move.masteryUses||0)+1;const priorMastery=Number(move.masteryStage||0),nextMastery=moveMasteryStage(move.masteryUses);
  if(nextMastery>priorMastery){move.masteryStage=nextMastery;battleLog(room,`${u.name}의 ${move.name} 숙련 진화 ${moveMasteryLabel(nextMastery)}!`);}
  const appliedDebuffs=enemyStatusDelta(statusBefore,enemyStatusSnapshot(target));
  pushRoomEvent(room,'monster-move',`${u.name} · ${move.name}`,{playerId,instanceId:u.instanceId,speciesId:u.speciesId,monsterName:u.name,targetUid:target?.uid||null,targetName:target?.name||null,targetHpBefore,targetHpAfter:Number(target?.hp||0),targetMaxHp,move:clone({...move,rewrite,masteryStage:move.masteryStage,masteryUses:move.masteryUses}),skill:move.name,damage:dealt,hit,element:effective.element||u.element,style:u.archetype,archetype:u.archetype,form:monsterFormLabel(u),rewrite:rewrite?clone(rewrite):null,signature:!!move.signature,fxFamily:move.fxFamily||effective.fxFamily||null,fxVariant:Number(move.fxVariant||0),fxTempo:move.fxTempo||'snap',appliedDebuffs,effectSummary:moveEffectSummary(effective),tacticLink,pp:Number(move.pp||0),maxPp:Number(move.maxPp||0),critical,effectiveness,fxSeed:`${u.speciesId}:${move.id}`});
  if(nextMastery>priorMastery)pushRoomEvent(room,'move-evolve',`${u.name}의 ${move.name} 숙련 진화!`,{playerId,instanceId:u.instanceId,monsterName:u.name,monsterSprite:monsterDisplaySpriteServer(u),moveId:move.id,moveName:move.name,stage:nextMastery,label:moveMasteryLabel(nextMastery),uses:move.masteryUses,element:move.element||u.element,kind:move.kind,before:priorMastery,after:nextMastery});
  if(target?.justBossBarBroken){pushRoomEvent(room,'boss-shield-break',`${target.name}의 HP 보호막이 깨졌다!`,{enemyUid:target.uid,enemyName:target.name,remaining:Number(target.hpSegments||1),total:Number(target.hpSegmentsMax||1)});target.justBossBarBroken=false;}
  const phases=updateBossPhase(room);for(const e of phases)pushRoomEvent(room,'boss-phase',`${e.name} 2단계!`,{enemyUid:e.uid,enemyName:e.name,phase:2});
  const breaks=b.enemies.filter(e=>e.justBroken&&e.hp>0);for(const e of b.enemies)e.justBroken=false;for(const e of breaks)pushRoomEvent(room,'enemy-break',`${e.name}의 자세 붕괴!`,{enemyUid:e.uid,enemyName:e.name});
  if(checkBattleEnd(room))return{move,dealt,ended:true,rewrite};
  if(pc.units.filter(x=>x.hp>0).every(x=>x.acted)){pc.ended=true;battleLog(room,`${pc.nickname} 행동 완료.`);if(b.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}
  return{move,dealt,ended:pc.ended,rewrite};
}

function makeMoveOffer(u,move,reason='LEVEL MOVE'){
  return{instanceId:u.instanceId,monsterName:u.name,monsterSprite:u.evolved?(u.evolutionSprite||u.sprite):u.sprite,reason,moves:[clone(move)],currentMoves:clone(u.moves||[]),learnLevel:Number(move.learnLevel||u.level||1),source:'level'};
}
function buildSkillQueueForPc(room,pc){
  const queue=[];const run=room.runState[pc.playerId];const mons=[...(pc.units||[]),...(pc.bench||[]),...(pc.ko||[])];
  for(const u of mons){normalizeMonsterMoves(u);for(const mv of (u.pendingLearnMoves||[]))queue.push(makeMoveOffer(u,mv,`LEVEL MOVE · Lv.${mv.learnLevel||u.level}`));u.pendingLearnMoves=[];const ru=(run?.monsters||[]).find(x=>x.instanceId===u.instanceId);if(ru)ru.pendingLearnMoves=[];}
  if(['elite','boss'].includes(room.battle?.tier)){
    const living=mons.filter(u=>u.hp>0);const u=living[room.floor%Math.max(1,living.length)]||living[0];if(u){const species=MONSTER_BY_ID[u.speciesId];const offers=buildSkillDiscMoves(species,u.level,room.floor+Number(pc.stats?.movesUsed||0));if(offers.length)queue.push({instanceId:u.instanceId,monsterName:u.name,monsterSprite:u.evolved?(u.evolutionSprite||u.sprite):u.sprite,reason:room.battle.tier==='boss'?'BOSS TECH DISC':'WARDEN TECH DISC',moves:offers,currentMoves:clone(u.moves||[]),source:'disc'});}
  }
  return queue;
}
function refreshSkillOffer(room,playerId){
  room.reward.skillOffers ||= {};room.reward.skillQueueBy ||= {};room.reward.skillIndexBy ||= {};const queue=room.reward.skillQueueBy[playerId]||[];const idx=Number(room.reward.skillIndexBy[playerId]||0);const offer=queue[idx];
  if(!offer){delete room.reward.skillOffers[playerId];room.reward.skillClaims ||= {};room.reward.skillClaims[playerId]={completed:true,history:room.reward.skillHistoryBy?.[playerId]||[]};return null;}
  const run=room.runState[playerId],u=(run?.monsters||[]).find(x=>x.instanceId===offer.instanceId);if(u){normalizeMonsterMoves(u);offer.currentMoves=clone(u.moves);offer.monsterName=u.name;offer.monsterSprite=u.evolved?(u.evolutionSprite||u.sprite):u.sprite;}
  room.reward.skillOffers[playerId]=offer;return offer;
}
function advanceSkillOffer(room,playerId,record){
  room.reward.skillHistoryBy ||= {};room.reward.skillHistoryBy[playerId] ||= [];room.reward.skillHistoryBy[playerId].push(record);room.reward.skillIndexBy[playerId]=Number(room.reward.skillIndexBy[playerId]||0)+1;return refreshSkillOffer(room,playerId);
}
function skillOfferForPc(room,pc){return buildSkillQueueForPc(room,pc)[0]||null;}
function teachMonsterMove(room,playerId,moveId,replaceIndex){
  if(room.status!=='reward'||!room.reward)throw new Error('기술을 배울 수 있는 단계가 아닙니다.');const offer=room.reward.skillOffers?.[playerId];if(!offer)throw new Error('배울 기술이 없습니다.');const move=(offer.moves||[]).find(x=>x.id===moveId);if(!move)throw new Error('해당 기술을 찾을 수 없습니다.');const run=room.runState[playerId],u=(run.monsters||[]).find(x=>x.instanceId===offer.instanceId);if(!u)throw new Error('몬스터를 찾을 수 없습니다.');normalizeMonsterMoves(u);let idx=Number(replaceIndex);if(!Number.isInteger(idx)||idx<0||idx>=BATTLE_RULES.moveSlots)idx=BATTLE_RULES.moveSlots-1;const old=u.moves[idx];const npp=normalizeMovePp(move);u.moves[idx]={...clone(move),element:move.element||u.element,cooldownRemaining:0,maxPp:npp.maxPp,pp:npp.maxPp,unlockLevel:1,masteryUses:0,masteryStage:0};const record={moveId:move.id,moveName:move.name,replaceIndex:idx,replacedMoveName:old?.name||null,monsterName:u.name,source:offer.source};pushRoomEvent(room,'move-learn',`${u.name}이(가) ${move.name}을 익혔다!`,{playerId,instanceId:u.instanceId,move:clone(move),replaceIndex:idx});advanceSkillOffer(room,playerId,record);return record;
}
function skipMonsterMoveOffer(room,playerId){
  if(room.status!=='reward'||!room.reward)throw new Error('기술 선택 단계가 아닙니다.');const offer=room.reward.skillOffers?.[playerId];if(!offer){room.reward.skillClaims ||= {};room.reward.skillClaims[playerId]={completed:true};return room.reward.skillClaims[playerId];}const record={skipped:true,moveName:offer.moves?.[0]?.name||null,monsterName:offer.monsterName,source:offer.source};advanceSkillOffer(room,playerId,record);return record;
}

function moveRewriteOfferForPc(room,pc){
  if(room.battle?.tier!=='boss')return null;
  const run=room.runState[pc.playerId];if(!run)return null;run.moveUseCounts ||= {};run.rewriteHistory ||= [];
  const rows=[];
  for(const u of run.monsters||[]){
    normalizeMonsterMoves(u);
    for(const mv of u.moves||[]){
      const compatible=compatibleRewrites(mv);if(!compatible.length)continue;
      const key=`${u.instanceId}:${mv.id}`;
      rows.push({u,mv,key,count:Number(run.moveUseCounts[key]||0),rewritten:!!mv.rewrite});
    }
  }
  rows.sort((a,b)=>Number(a.rewritten)-Number(b.rewritten)||b.count-a.count||Number(b.u.level||1)-Number(a.u.level||1));
  const row=rows[0];if(!row)return null;
  const options=shuffle(compatibleRewrites(row.mv)).slice(0,3).map(clone);
  return {instanceId:row.u.instanceId,monsterName:row.u.name,monsterSprite:row.u.evolved?(row.u.evolutionSprite||row.u.sprite):row.u.sprite,moveId:row.mv.id,moveName:row.mv.name,moveKind:row.mv.kind,uses:row.count,currentRewrite:clone(row.mv.rewrite||null),options};
}
function claimMoveRewrite(room,playerId,rewriteId){
  if(room.status!=='reward'||!room.reward)throw new Error('기술 개조 단계가 아닙니다.');
  const offer=room.reward.rewriteOffers?.[playerId];if(!offer)throw new Error('개조할 기술이 없습니다.');
  if(room.reward.rewriteClaims?.[playerId])throw new Error('이미 기술 개조를 선택했습니다.');
  const chosen=(offer.options||[]).find(x=>x.id===rewriteId);if(!chosen)throw new Error('선택 가능한 개조가 아닙니다.');
  const run=room.runState[playerId],u=(run?.monsters||[]).find(x=>x.instanceId===offer.instanceId);if(!u)throw new Error('몬스터를 찾을 수 없습니다.');
  normalizeMonsterMoves(u);const mv=(u.moves||[]).find(x=>x.id===offer.moveId);if(!mv)throw new Error('개조할 기술을 찾을 수 없습니다.');
  mv.rewrite=clone(chosen);run.rewriteHistory ||= [];run.rewriteHistory.push({floor:room.floor,instanceId:u.instanceId,monsterName:u.name,moveId:mv.id,moveName:mv.name,rewriteId:chosen.id,rewriteName:chosen.name});
  run.moveUseCounts ||= {};run.moveUseCounts[`${u.instanceId}:${mv.id}`]=0;
  room.reward.rewriteClaims ||= {};room.reward.rewriteClaims[playerId]={rewriteId:chosen.id,rewriteName:chosen.name,monsterName:u.name,moveName:mv.name};
  pushRoomEvent(room,'move-rewrite',`${u.name}의 ${mv.name} — ${chosen.name} 각인!`,{playerId,instanceId:u.instanceId,moveId:mv.id,moveName:mv.name,rewrite:clone(chosen)});
  return room.reward.rewriteClaims[playerId];
}
function skipMoveRewrite(room,playerId){
  if(room.status!=='reward'||!room.reward)throw new Error('기술 개조 단계가 아닙니다.');
  room.reward.rewriteClaims ||= {};room.reward.rewriteClaims[playerId]={skipped:true};
  return room.reward.rewriteClaims[playerId];
}

function summonUnit(room, pc, c, target) {
  const extraPower = Math.round(pc.itemMods.unitPower || 0);
  const u = {
    instanceId: uid('unit'), cardId: c.id, name: c.name, art: c.art, element: c.element,
    hp: c.hp, maxHp: c.hp, power: c.power + extraPower, block: c.block || 0, counter: 0,
    summonedTurn: room.battle.turn
  };
  if (pc.buffs.nextUnitBlock) { u.block += pc.buffs.nextUnitBlock; pc.buffs.nextUnitBlock = 0; }
  pc.units.push(u);
  applyEffects(room, pc, c.effects, target, c);
  if (c.unit?.onSummon === 'unitGuard') pc.units.forEach(x => x.block += 2);
  battleLog(room, `${pc.nickname}이(가) ${c.name}을 소환.`);
}

function recallUnit(room, playerId, instanceId) {
  const b = room.battle;
  if (room.status !== 'battle' || !b || b.phase !== 'players') throw new Error('전투 중에만 전열을 교대할 수 있습니다.');
  const pc = getPc(room, playerId);
  if (!pc || pc.down || pc.ended) throw new Error('지금은 유닛을 회수할 수 없습니다.');
  if (Number(pc.recallsUsed || 0) >= 1) throw new Error('전열 회수는 턴당 1회 가능합니다.');
  const idx = pc.units.findIndex(u => u.instanceId === instanceId);
  if (idx < 0) throw new Error('회수할 유닛을 찾을 수 없습니다.');
  const [u] = pc.units.splice(idx, 1);
  pc.discard.push(u.cardId);
  pc.recallsUsed = Number(pc.recallsUsed || 0) + 1;
  battleLog(room, `${pc.nickname}이(가) ${u.name}을 전열에서 회수했습니다.`);
  pushRoomEvent(room, 'unit-recall', `${u.name} 전열 회수`, { playerId, instanceId, cardId:u.cardId });
  return u;
}

function castSpell(room, pc, c, target, targetMonster=null) {
  room.battle.teamSpellCount++; applyEffects(room,pc,c.effects,target,c,targetMonster);
  for(const ally of room.battle.party.filter(x=>!x.down))for(const u of ally.units){
    const drone=(u.archetype==='drone'||u.secondaryArchetype==='drone');
    const spirit=(u.archetype==='spirit'||u.secondaryArchetype==='spirit');
    if(drone&&c.element===u.element)u.nextAttackBonus=Number(u.nextAttackBonus||0)+4;
    if(spirit&&c.element===u.element)u.resonance=clamp(Number(u.resonance||0)+1,0,6);
  }
  battleLog(room,`${pc.nickname}이(가) ${c.name} 사용${targetMonster?` → ${targetMonster.name}`:''}.`);
}

function updateTacticalChain(room, pc, card, targetMonster=null, targetEnemy=null) {
  pc.chain ||= { count:0,lastType:null,lastClass:null,lastMonsterId:null,best:0,overdrives:0 };
  const chain=pc.chain, cls=card.cardClass||'support', sameMonster=targetMonster && chain.lastMonsterId===targetMonster.instanceId;
  const classChanged=!!chain.lastClass && chain.lastClass!==cls;
  const affinity=!!targetMonster && card.element===targetMonster.element;
  // Link grows when commands vary or when a spell resonates with the selected monster.
  if (!chain.count) chain.count=1;
  else if (sameMonster && (classChanged || affinity)) chain.count+=1;
  else chain.count=Math.max(1, affinity?2:1);
  chain.lastClass=cls; chain.lastType=card.type; chain.lastMonsterId=targetMonster?.instanceId||null;
  chain.best=Math.max(Number(chain.best||0),chain.count);
  const p=profiles[pc.playerId]; if(p)p.stats.bestChain=Math.max(Number(p.stats.bestChain||0),chain.best);
  let stage=''; const displayCount=chain.count;
  if(chain.count===3 && targetMonster){
    targetMonster.block+=5; targetMonster.resonance=clamp(Number(targetMonster.resonance||0)+1,0,6); drawCards(pc,1); stage='flow';
    battleLog(room,`${targetMonster.name} COMMAND LINK ×3 — 실드 +5 · RES +1 · 드로우 +1.`);
  } else if(chain.count>=5 && targetMonster){
    pc.energy+=1; targetMonster.gene=clamp(Number(targetMonster.gene||0)+1,0,8); targetMonster.rift=clamp(Number(targetMonster.rift||0)+1,0,5);
    chain.overdrives+=1; if(p)p.stats.overdrives=Number(p.stats.overdrives||0)+1; stage='overdrive';
    if(targetEnemy && targetEnemy.hp>0){
      const burst=modifiedDamage(room,pc,Math.round(targetMonster.power*1.15),{type:'monster',element:targetMonster.element});
      const dealt=applyElementDamage(targetEnemy,burst,targetMonster.element);pc.stats.damage+=dealt;
      pushRoomEvent(room,'monster-burst',`${targetMonster.name} RIFT DRIVE!`,{playerId:pc.playerId,instanceId:targetMonster.instanceId,targetUid:targetEnemy.uid,element:targetMonster.element,archetype:targetMonster.archetype,damage:dealt,skill:'RIFT DRIVE'});
    }
    battleLog(room,`${targetMonster.name} RIFT DRIVE — 에너지 +1 · GENE +1 · RIFT +1.`);
    chain.count=0;chain.lastClass=null;chain.lastType=null;chain.lastMonsterId=null;
  }
  return {stage,displayCount};
}

function updateBossPhase(room) {
  const b = room.battle;
  if (!b || b.tier !== 'boss') return [];
  const shifted = [];
  for (const e of b.enemies) {
    if (e.hp <= 0 || e.enraged || e.hp > e.maxHp * 0.5) continue;
    e.enraged = true;
    e.phase = 2;
    e.atk = Math.max(e.atk + 1, Math.round(e.atk * 1.18));
    e.block = Number(e.block || 0) + Math.max(12, Math.round(e.maxHp * 0.08));
    e.debuffs.weak = Math.max(0, Number(e.debuffs.weak || 0) - 1);
    e.debuffs.intentSeal = 0;
    e.intent = rollIntent(e, 'boss', room.difficulty);
    shifted.push(e);
    battleLog(room, `${e.name} PHASE II — 공격력이 상승하고 보호막을 전개했습니다.`);
  }
  return shifted;
}

function combatGrade(pc, battle) {
  const taken = Number(pc?.stats?.hpDamageTaken || 0) + Number(pc?.stats?.monsterDamageTaken || 0);
  const teamMonsterMax = [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])].reduce((n,u)=>n+Number(u.maxHp||0),0);
  const ratio = (Number(pc?.maxHp||0)+teamMonsterMax) ? taken / (Number(pc.maxHp||0)+teamMonsterMax) : 1;
  const turn = Number(battle?.turn || 99);
  if (taken === 0 && turn <= 5) return 'S';
  if (ratio <= 0.12 && turn <= 7) return 'A';
  if (ratio <= 0.35 && turn <= 10) return 'B';
  return 'C';
}

function modifiedDamage(room, pc, base, source) {
  let v = Number(base || 0);
  if (source?.type === 'spell') v += Number(pc.itemMods.spellPower || 0);
  if (source?.type === 'monster') v += Number(pc.itemMods.unitPower || 0);
  v *= 1 + Number(pc.itemMods.damagePct || 0);
  if (room.battle?.tier === 'boss') v *= 1 + Number(pc.itemMods.bossDamagePct || 0);
  if (room.floor >= 41 && pc.relics.includes('r008')) v *= 1.08;
  return Math.max(0, Math.round(v));
}
function modifiedBlock(pc, base) { return Math.max(0, Math.round(Number(base || 0) * (1 + Number(pc.itemMods.blockPct || 0)))); }
function modifiedHeal(pc, base) { return Math.max(0, Math.round(Number(base || 0) * (1 + Number(pc.itemMods.healPct || 0)))); }

function applyEffects(room, pc, effects, target, source, targetMonster=null) {
  const b = room.battle;
  for (const fx of effects || []) {
    const v = Number(fx.value || 0);
    let bonus = 0;
    if (['damage', 'damageAll', 'damageOthers', 'bossDamage'].includes(fx.op) && pc.buffs.nextAttack > 0) {
      bonus = pc.buffs.nextAttack;
      pc.buffs.nextAttack = 0;
    }
    if (fx.op === 'damage' && target) pc.stats.damage += applyElementDamage(target, modifiedDamage(room, pc, v + bonus, source), source?.element);
    else if (fx.op === 'damageAll') aliveEnemies(room).forEach(e => pc.stats.damage += applyElementDamage(e, modifiedDamage(room, pc, v + bonus, source), source?.element));
    else if (fx.op === 'damageOthers') aliveEnemies(room).filter(e => e !== target).forEach(e => pc.stats.damage += applyElementDamage(e, modifiedDamage(room, pc, v, source), source?.element));
    else if (fx.op === 'bossDamage' && target) pc.stats.damage += applyElementDamage(target, modifiedDamage(room, pc, v + bonus + (['elite', 'boss'].includes(b.tier) ? Number(fx.bossBonus || 0) : 0), source), source?.element);
    else if (fx.op === 'block') { const val=modifiedBlock(pc,v); if(targetMonster) targetMonster.block+=val; else pc.block+=val; }
    else if (fx.op === 'blockAllies') b.party.filter(x => !x.down).forEach(x => x.block += modifiedBlock(x, v));
    else if (fx.op === 'heal') { const val=modifiedHeal(pc,v); if(targetMonster){const before=targetMonster.hp;targetMonster.hp=clamp(targetMonster.hp+val,0,targetMonster.maxHp);pc.stats.healing+=targetMonster.hp-before;}else{const before=pc.hp;pc.hp=clamp(pc.hp+val,0,pc.maxHp);pc.stats.healing+=pc.hp-before;} }
    else if (fx.op === 'healLowestAlly') { const x = b.party.filter(x => !x.down && x.playerId !== pc.playerId).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0]; if (x) x.hp = clamp(x.hp + modifiedHeal(pc, v), 0, x.maxHp); }
    else if (fx.op === 'healAllies') b.party.filter(x => !x.down).forEach(x => x.hp = clamp(x.hp + modifiedHeal(pc, v), 0, x.maxHp));
    else if (fx.op === 'draw') drawCards(pc, v);
    else if (fx.op === 'energy') pc.energy += v;
    else if (fx.op === 'loseHp') pc.hp = Math.max(1, pc.hp - v);
    else if (fx.op === 'vulnerable' && target) target.debuffs.vulnerable += v;
    else if (fx.op === 'vulnerableAll') aliveEnemies(room).forEach(e => e.debuffs.vulnerable += v);
    else if (fx.op === 'weak' && target) target.debuffs.weak += v;
    else if (fx.op === 'weakAll') aliveEnemies(room).forEach(e => e.debuffs.weak += v);
    else if (fx.op === 'burn' && target) target.debuffs.burn += v;
    else if (fx.op === 'poison' && target) target.debuffs.poison = Number(target.debuffs.poison||0)+v;
    else if (fx.op === 'poisonAll') aliveEnemies(room).forEach(e => e.debuffs.poison = Number(e.debuffs.poison||0)+v);
    else if (fx.op === 'shockAll') aliveEnemies(room).forEach(e => e.debuffs.shock += v);
    else if (fx.op === 'intentSealAll') aliveEnemies(room).forEach(e => e.debuffs.intentSeal += v);
    else if (fx.op === 'spellDiscount') pc.buffs.spellDiscount += v;
    else if (fx.op === 'anyDiscount') pc.buffs.anyDiscount += v;
    else if (fx.op === 'nextAttack') pc.buffs.nextAttack += v;
    else if (fx.op === 'teamNextAttack') b.party.filter(x => !x.down).forEach(x => x.buffs.nextAttack += v);
    else if (fx.op === 'buffUnits') pc.units.forEach(u => u.power += v);
    else if (fx.op === 'debuffImmune') pc.buffs.debuffImmune = true;
    else if (fx.op === 'cleanseWeak') pc.weak = Math.max(0, pc.weak - v);
    else if (fx.op === 'nextUnitBlock') pc.buffs.nextUnitBlock += v;
    else if (fx.op === 'thorns') pc.buffs.thorns = Math.max(pc.buffs.thorns, v);
    else if (fx.op === 'redraw') { pc.discard.push(...pc.hand); pc.hand = []; drawCards(pc, v); }
    else if (fx.op === 'halveEnemyNext') aliveEnemies(room).forEach(e => e.nextDamageHalf = true);
    else if (fx.op === 'monsterBoost' && targetMonster) targetMonster.power += Math.max(1,Math.round(v*(1+Number(pc.itemMods.unitPower||0)*.02)));
    else if (fx.op === 'monsterShield' && targetMonster) targetMonster.block += modifiedBlock(pc,v);
    else if (fx.op === 'monsterHeal' && targetMonster) targetMonster.hp = clamp(targetMonster.hp + modifiedHeal(pc,v), 0, targetMonster.maxHp);
    else if (fx.op === 'geneCharge' && targetMonster) targetMonster.gene = clamp(Number(targetMonster.gene||0)+v,0,8);
    else if (fx.op === 'resonanceCharge' && targetMonster) targetMonster.resonance = clamp(Number(targetMonster.resonance||0)+v,0,6);
    else if (fx.op === 'riftCharge' && targetMonster) targetMonster.rift = clamp(Number(targetMonster.rift||0)+v,0,5);
    else if (fx.op === 'monsterBurst' && targetMonster && target) {
      const burstBase=Math.max(1,Math.round(Number(targetMonster.power||1)*Math.max(.15,v/100)));
      const burst=modifiedDamage(room,pc,burstBase,{type:'monster',element:targetMonster.element});
      const dealt=applyElementDamage(target,burst,targetMonster.element); pc.stats.damage+=dealt;
      battleLog(room,`${targetMonster.name} 연계 공격 → ${target.name} ${dealt} 피해.`);
      pushRoomEvent(room,'monster-burst',`${targetMonster.name} 연계 공격!`,{playerId:pc.playerId,instanceId:targetMonster.instanceId,targetUid:target.uid,element:targetMonster.element,archetype:targetMonster.archetype,damage:dealt,skill:source?.geneStyle||'연계 공격'});
    }
    else if (fx.op === 'energyDebt') pc.buffs.energyDebt += v;
  }
}

function applyDamage(e, amount) {
  let d = Math.max(0, Math.round(amount));
  if (e.marked) d = Math.round(d * 1.18);
  if (e.debuffs?.vulnerable > 0) d = Math.round(d * 1.5);
  if (e.debuffs?.shock > 0) d += Math.min(8, e.debuffs.shock);
  const blocked = Math.min(e.block || 0, d);
  e.block = (e.block || 0) - blocked;
  d -= blocked;
  // Boss HP is split into visible shield segments. A single hit cannot skip an unopened segment;
  // multi-hit/echo effects can still break multiple segments hit-by-hit.
  if (d > 0 && Number(e.hpSegmentsMax || 1) > 1 && Number(e.hpSegments || 1) > 1) {
    const segSize = Number(e.maxHp || 1) / Number(e.hpSegmentsMax || 1);
    const boundary = Math.ceil((Number(e.hpSegments || 1) - 1) * segSize);
    const toBoundary = Math.max(1, Number(e.hp || 0) - boundary);
    if (d >= toBoundary) {
      d = toBoundary;
      e.hpSegments = Math.max(1, Number(e.hpSegments || 1) - 1);
      e.justBossBarBroken = true;
      e.stagger = 0;
    }
  }
  e.hp = clamp(e.hp - d, 0, e.maxHp);
  if (d > 0 && e.staggerMax && !e.broken && e.hp > 0) {
    e.stagger = clamp(Number(e.stagger || 0) + Math.max(1, Math.round(d * 0.46 * Number(e.staggerGainMult || 1))), 0, e.staggerMax);
    if (e.stagger >= e.staggerMax) {
      e.broken = 1;
      e.justBroken = true;
      e.debuffs ||= {};
      e.debuffs.vulnerable = Math.max(Number(e.debuffs.vulnerable || 0), 1);
    }
  }
  return d;
}

function damagePc(room, pc, amount, enemy) {
  let d = Math.max(0, Math.round(amount));
  d = Math.round(d * (1 - Number(pc.itemMods?.damageReduction || 0)));
  const blocked = Math.min(pc.block, d);
  pc.block -= blocked;
  d -= blocked;
  pc.hp = clamp(pc.hp - d, 0, pc.maxHp);
  if (d > 0) pc.stats.hpDamageTaken = Number(pc.stats.hpDamageTaken || 0) + d;
  if (d > 0 && pc.buffs.thorns > 0 && enemy) applyDamage(enemy, pc.buffs.thorns);
  if (pc.hp <= 0) {
    const run = room.runState[pc.playerId];
    const revives = Math.floor(modTotal(run, 'revive'));
    if (run && run.revivesUsed < revives) {
      run.revivesUsed++;
      const revivePct = Math.max(0.35, modTotal(run, 'revivePct'));
      pc.hp = Math.max(1, Math.round(pc.maxHp * revivePct));
      pc.down = false;
      pc.ended = false;
      battleLog(room, `${pc.nickname}이(가) 부활 아이템으로 돌아왔습니다!`);
    } else {
      pc.down = true;
      pc.ended = true;
    }
  }
  return d;
}

function endTurn(room, playerId) {
  const b=room.battle;
  if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('전투 중이 아닙니다.');
  const pc=getPc(room,playerId);if(!pc||pc.down)return;
  // v5.1: in single/double battles every living active monster gets its action.
  // The player can no longer accidentally skip monster #2 with the old E/end-turn shortcut.
  const waiting=(pc.units||[]).filter(u=>u.hp>0&&!u.acted);
  const actionable=waiting.filter(u=>{normalizeMonsterMoves(u);return (u.moves||[]).some(m=>u.level>=Number(m.unlockLevel||1)&&Number(m.cooldownRemaining||0)<=0);});
  if(actionable.length)throw new Error(actionable.length>1?'출전 몬스터들의 기술을 먼저 사용해 주세요.':'출전 몬스터의 기술을 먼저 사용해 주세요.');
  for(const u of waiting)u.acted=true;
  pc.ended=true;
  battleLog(room,`${pc.nickname}이(가) 행동을 마쳤습니다.`);
  const active=b.party.filter(x=>!x.down);
  if(active.length&&active.every(x=>x.ended))enemyTurn(room);else pushRoomEvent(room,'end-turn',`${pc.nickname} 님이 턴을 종료했습니다.`);
}

function enemyMoveChoice(e){
  const moves=(e.moves||[]).filter(Boolean);let usable=moves.filter(m=>Number(m.pp||0)>0);
  if(!usable.length&&moves.length){for(const m of moves){const p=normalizeMovePp(m);m.maxPp=p.maxPp;m.pp=Math.max(1,Math.ceil(p.maxPp*.25));}usable=moves.filter(m=>m.pp>0);}
  if(!usable.length)return null;
  const damaging=usable.filter(m=>['attack','burst'].includes(m.kind));if(damaging.length&&Math.random()<.72)return choose(damaging);return choose(usable);
}
function enemyMoveDamage(e,move,target){
  const element=move?.element||e.element||'공허',stab=(element===e.element?1.18:1),crit=process.env.TEST_MODE==='1'?false:Math.random()<1/16,random=process.env.TEST_MODE==='1'?.95:(.90+Math.random()*.10),def=stageMultiplier(target?.statStages?.def||0);
  const raw=Math.max(1,Math.round((Number(e.atk||1)*(.72+Number(move?.ratio||0)*.55)+Number(move?.power||0)*.62)*stab*(crit?1.5:1)*random/Math.max(.35,def)));
  const effectiveness=elementalMultiplier(element,target?.element);return{amount:Math.max(1,Math.round(raw*effectiveness)),crit,effectiveness};
}
function enemyApplyMoveStatus(room,pc,u,move){
  if(!u||u.hp<=0||!move)return[];const out=[];const chance=process.env.TEST_MODE==='1'?1:.42;
  if(move.sleep&&Math.random()<chance&&tryMajorStatus(room,pc,u,'sleep',Number(move.sleep||2),{name:move.name},false))out.push({key:'sleep',label:'수면',value:Number(move.sleep||2)});
  else if(move.freeze&&Math.random()<chance&&tryMajorStatus(room,pc,u,'freeze',Number(move.freeze||2),{name:move.name},false))out.push({key:'freeze',label:'빙결',value:Number(move.freeze||2)});
  else if(move.burn&&Math.random()<chance&&tryMajorStatus(room,pc,u,'burn',0,{name:move.name},false))out.push({key:'burn',label:'화상'});
  else if(move.poison&&Math.random()<chance&&tryMajorStatus(room,pc,u,'poison',0,{name:move.name},false))out.push({key:'poison',label:'중독'});
  else if(move.shock&&Math.random()<chance&&tryMajorStatus(room,pc,u,'paralysis',0,{name:move.name},false))out.push({key:'paralysis',label:'마비'});
  else if((move.element==='수정'||move.fxFamily==='ice')&&Math.random()<(process.env.TEST_MODE==='1'?0:.12)&&tryMajorStatus(room,pc,u,'freeze',2,{name:move.name},false))out.push({key:'freeze',label:'빙결'});
  if(move.weak){u.statStages.atk=clamp(Number(u.statStages.atk||0)-1,-6,6);out.push({key:'atkDown',label:'공격↓',value:1});}
  if(move.vulnerable){u.statStages.def=clamp(Number(u.statStages.def||0)-1,-6,6);out.push({key:'defDown',label:'방어↓',value:1});}
  return out;
}
function enemyTurn(room) {
  const b=room.battle;b.phase='enemies';
  for(const e of aliveEnemies(room)){
    e.counter++;
    if(Number(e.debuffs.poison||0)>0){const d=applyDamage(e,Math.max(1,Math.ceil(Number(e.debuffs.poison||0)*1.5)));e.debuffs.poison=Math.max(0,Number(e.debuffs.poison||0)-1);pushRoomEvent(room,'status-tick',`${e.name} 독 피해 ${d}`,{enemyUid:e.uid,status:'poison',label:'독',damage:d,remaining:e.debuffs.poison});if(e.hp<=0){if(checkBattleEnd(room))return;continue;}}
    if(e.debuffs.burn>0){const d=applyDamage(e,e.debuffs.burn);e.debuffs.burn=Math.max(0,e.debuffs.burn-1);pushRoomEvent(room,'status-tick',`${e.name} 화상 피해 ${d}`,{enemyUid:e.uid,status:'burn',label:'화상',damage:d,remaining:e.debuffs.burn});if(e.hp<=0){if(checkBattleEnd(room))return;continue;}}
    if(preEnemyActionStatus(room,e))continue;
    if(e.broken>0){e.broken=0;e.stagger=0;e.debuffs.vulnerable=Math.max(Number(e.debuffs.vulnerable||0),1);battleLog(room,`${e.name} BREAK — 행동 불가.`);pushRoomEvent(room,'enemy-status-turn',`${e.name}의 자세가 무너져 움직일 수 없다.`,{enemyUid:e.uid,enemyName:e.name,status:'broken',label:'BREAK',blocked:true});continue;}
    if(e.debuffs.intentSeal>0){e.debuffs.intentSeal--;battleLog(room,`${e.name} 행동 봉인.`);pushRoomEvent(room,'enemy-status-turn',`${e.name}은(는) 행동이 봉쇄되어 움직일 수 없다.`,{enemyUid:e.uid,enemyName:e.name,status:'intentSeal',label:'행동 봉쇄',blocked:true});continue;}
    const targets=b.party.filter(x=>!x.down&&x.units.some(u=>u.hp>0));if(!targets.length)break;const t=choose(targets),mon=t.units.filter(u=>u.hp>0).sort((a,z)=>monsterSpeedValue(z)-monsterSpeedValue(a))[0]||t.units[0],mv=enemyMoveChoice(e);
    if(!mon)continue;
    if(!mv){const targetHpBefore=Number(mon.hp||0),targetMaxHp=Number(mon.maxHp||1),d=monsterDamage(room,t,mon,Math.max(1,Number(e.atk||1)),e);pushRoomEvent(room,'enemy-attack',`${e.name} 몸통박치기`,{enemyUid:e.uid,speciesId:e.id,monsterName:e.name,playerId:t.playerId,targetMonsterId:mon.instanceId,targetMonsterName:mon.name,targetHpBefore,targetHpAfter:Number(mon.hp||0),targetMaxHp,damage:d,element:e.element||'공허',skill:'몸통박치기',move:null,signature:false,fxFamily:'rush',fxVariant:0,heavy:false,critical:false,effectiveness:1});continue;}
    const p=normalizeMovePp(mv);mv.maxPp=p.maxPp;mv.pp=p.pp;mv.pp=Math.max(0,mv.pp-1);
    const hit=['guard','heal','status'].includes(mv.kind)||process.env.TEST_MODE==='1'||Math.random()<Number(mv.accuracy||100)/100;
    const targetHpBefore=Number(mon?.hp||0),targetMaxHp=Number(mon?.maxHp||1);let d=0,critical=false,effectiveness=1,appliedStatuses=[];
    if(hit&&['attack','burst'].includes(mv.kind)){const calc=enemyMoveDamage(e,mv,mon);critical=calc.crit;effectiveness=calc.effectiveness;d=monsterDamage(room,t,mon,calc.amount,e);appliedStatuses=enemyApplyMoveStatus(room,t,mon,mv);}
    else if(hit&&mv.kind==='guard'){e.block=Number(e.block||0)+Math.max(4,Number(mv.shield||6));}
    else if(hit&&mv.kind==='heal'){e.hp=clamp(e.hp+Math.max(4,Number(mv.heal||8)),0,e.maxHp);}
    else if(hit&&mv.kind==='status'){appliedStatuses=enemyApplyMoveStatus(room,t,mon,mv);}
    battleLog(room,`${e.name}의 ${mv.name}${hit?'':' — 빗나감'}${d?` · ${d} 피해`:''}.`);
    pushRoomEvent(room,'enemy-attack',`${e.name} · ${mv.name}`,{enemyUid:e.uid,speciesId:e.id,monsterName:e.name,playerId:t.playerId,targetMonsterId:mon?.instanceId||null,targetMonsterName:mon?.name||null,targetHpBefore,targetHpAfter:Number(mon?.hp||0),targetMaxHp,damage:d,hit,style:e.archetype||'beast',archetype:e.archetype||'beast',element:mv.element||e.element||'공허',skill:mv.name,move:clone(mv),signature:!!mv.signature,fxFamily:mv.fxFamily||null,fxVariant:Number(mv.fxVariant||0),fxTempo:mv.fxTempo||'snap',heavy:mv.kind==='burst'||!!mv.signature,critical,effectiveness,appliedStatuses,fxSeed:`${e.id}:${mv.id}`});
    e.debuffs.vulnerable=Math.max(0,e.debuffs.vulnerable-1);e.debuffs.weak=Math.max(0,e.debuffs.weak-1);if(e.staggerMax&&!e.broken)e.stagger=Math.max(0,Number(e.stagger||0)-Math.ceil(e.staggerMax*.28));
  }
  if(checkBattleEnd(room))return;if(b.party.every(x=>x.down))return loseBattle(room);
  // Persistent major status damage resolves after enemy actions, before the next command phase.
  for(const pc of b.party){if(pc.down)continue;for(const u of [...pc.units])endTurnMonsterStatus(room,pc,u);if(pc.down)continue;}
  if(checkBattleEnd(room))return;tickFusionDurations(room);b.turn++;
  for(const pc of b.party){if(pc.down)continue;pc.block=Math.round(pc.block*Number(pc.itemMods.retainBlock||0));pc.ended=false;pc.recallsUsed=0;pc.switchesUsed=0;pc.tacticsUsed=0;pc.weak=Math.max(0,pc.weak-1);
    for(const u of [...pc.units,...pc.bench]){normalizeMonsterMoves(u);normalizeMajorStatus(u);u.acted=false;if(u.resonanceTurns>0)u.resonanceTurns--;if(u.abyssBloom)u.hp=Math.max(1,u.hp-Math.max(1,Math.round(u.maxHp*.05)));if(u.archetype==='slime')u.hp=clamp(u.hp+Math.max(1,Math.round(u.maxHp*.03)),0,u.maxHp);}
    const priests=pc.units.filter(u=>u.archetype==='priest').length;if(priests){const all=[...pc.units,...pc.bench].filter(u=>u.hp>0).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp);if(all[0])all[0].hp=clamp(all[0].hp+3*priests,0,all[0].maxHp);}
  }
  b.phase='players';pushRoomEvent(room,'turn',`턴 ${b.turn} 시작.`);
}

function checkBattleEnd(room) {
  const b = room.battle;
  if (!b) return false;
  if (b.enemies.every(e => e.hp <= 0)) { winBattle(room); return true; }
  if (b.party.every(p => p.down)) { loseBattle(room); return true; }
  return false;
}
function syncRunHealth(room) {
  if(!room.battle)return;
  for(const pc of room.battle.party){const run=room.runState[pc.playerId];if(!run)continue;run.hp=pc.hp<=0?Math.max(1,Math.round(run.maxHp*.20)):Math.min(run.maxHp,pc.hp);const merged=allCombatMonsters(pc);run.monsters=merged.map(clone);}
}

function recordRunHistory(room, result) {
  const endedAt = Date.now();
  for (const rp of room.players) {
    const p = profiles[rp.id];
    const run = room.runState[rp.id];
    if (!p || !run) continue;
    p.history ||= [];
    const entry = {
      id: uid('history'),
      mode: room.mode,
      difficulty: room.mode === 'dungeon' ? room.difficulty : 'journey',
      result,
      floor: room.floor,
      startedAt: Number(room.startedAt || room.createdAt || endedAt),
      endedAt,
      cardsAdded: Number(run.cardsAdded || 0),
      itemsAdded: Number(run.itemsAdded || 0),
      gold: Number(run.gold || 0)
    };
    p.history.unshift(entry);
    p.history = p.history.slice(0, 20);
  }
}

function winBattle(room) {
  const b = room.battle;
  releaseAllFusions(room,{reason:'battle-end',emit:false});
  const progressionEvents = [];
  const expBy = {};
  for (const pc of b.party || []) expBy[pc.playerId] = awardBattleMonsterXp(room, pc, b.tier, progressionEvents);
  syncRunHealth(room);
  const boss = b.tier === 'boss';
  const diff = roomDifficulty(room);
  const baseGold = (boss ? 170 : b.tier === 'elite' ? 105 : b.tier === 'rival' ? 88 : 55) + room.floor * 3;
  const baseGems = (boss ? 55 : b.tier === 'elite' ? 24 : b.tier === 'rival' ? 16 : 8) + Math.floor(room.floor / 5);
  const perfectBy = {};
  const gradeBy = {};
  for (const rp of room.players) {
    const p = profiles[rp.id];
    const run = room.runState[rp.id];
    for(const mon of run.monsters||[]){const heldItem=heldItemDef(mon),held=heldItem?.held;if(mon.hp>0&&held?.kind==='afterBattleHeal'){const heal=Math.max(1,Math.round(mon.maxHp*Number(held.healPct||.1)));const before=mon.hp;mon.hp=clamp(mon.hp+heal,0,mon.maxHp);if(mon.hp>before)pushRoomEvent(room,'held-item',`${mon.name}의 ${heldItem.name} · 전투 후 HP +${mon.hp-before}`,{playerId:rp.id,instanceId:mon.instanceId,itemId:heldItem.id,heal:mon.hp-before});}}
    const goldPct = 1 + modTotal(run, 'goldPct');
    const gemPct = 1 + modTotal(run, 'gemPct');
    run.gold += Math.round(baseGold * diff.gold * goldPct);
    if (b.tier === 'elite') run.fragments = Number(run.fragments||0) + 1;
    if (boss) run.fragments = Number(run.fragments||0) + 2;
    p.gems += Math.round(baseGems * diff.gems * gemPct);
    const pc = b.party.find(x => x.playerId === rp.id);
    gradeBy[rp.id] = combatGrade(pc, b);
    if (Number(pc?.stats?.hpDamageTaken || 0) === 0) {
      const bonusGold = 24 + room.floor * 2;
      const bonusGems = 4 + Math.floor(room.floor / 10);
      run.gold += bonusGold;
      p.gems += bonusGems;
      p.stats.perfectBattles = Number(p.stats.perfectBattles || 0) + 1;
      perfectBy[rp.id] = { gold: bonusGold, gems: bonusGems };
    }
    const afterHeal = modTotal(run, 'healAfterBattle');
    if (afterHeal > 0) run.hp = clamp(run.hp + Math.round(afterHeal), 1, run.maxHp);
    if (boss) p.stats.bosses++;
    const key = room.mode === 'dungeon' ? 'bestDungeonFloor' : 'bestJourneyFloor';
    p.stats[key] = Math.max(p.stats[key] || 0, room.floor);
    if (room.mode === 'dungeon') {
      const dkey = `best${room.difficulty[0].toUpperCase() + room.difficulty.slice(1)}Floor`;
      p.stats[dkey] = Math.max(p.stats[dkey] || 0, room.floor);
    }
  }
  saveProfiles();
  room.finalClearPending = room.mode === 'dungeon' && room.floor === DUNGEON_MAX_FLOOR;
  const title = room.finalClearPending ? '50층 최종 수호자 격파!' : boss ? '바이옴 수호자 격파!' : b.tier === 'elite' ? '균열 워든 격파!' : b.tier === 'rival' ? '균열 추적자 격파!' : '야생 조우 승리';
  const text = `전투 보상 아이템을 하나 선택하세요. HP·PP·상태는 다음 웨이브에 유지되며, 회복 아이템/야영/10웨이브 이동으로 정비합니다.${b.tier==='elite'||boss?' 추가 유물 선택권도 열렸습니다.':''}`;
  const waveInBiome=((room.floor-1)%10)+1;
  const shopWave=[4,9].includes(waveInBiome);
  createFloorReward(room, 'battle', title, text, b.tier, { camp:b.tier==='elite', campBy:{}, shop:shopWave?makeMerchantStock(room):null, purchased:{} });
  room.reward.perfectBy = perfectBy;
  room.reward.gradeBy = gradeBy;
  room.reward.expBy = expBy;
  room.reward.skillOffers = {}; room.reward.skillClaims = {}; room.reward.skillQueueBy = {}; room.reward.skillIndexBy = {}; room.reward.skillHistoryBy = {};
  room.reward.rewriteOffers = {}; room.reward.rewriteClaims = {};
  for(const rp of room.players){
    const pc=b.party.find(x=>x.playerId===rp.id);const queue=pc?buildSkillQueueForPc(room,pc):[];room.reward.skillQueueBy[rp.id]=queue;room.reward.skillIndexBy[rp.id]=0;if(queue.length)refreshSkillOffer(room,rp.id);else room.reward.skillClaims[rp.id]={completed:true,history:[]};
    if(pc&&boss){const offer=moveRewriteOfferForPc(room,pc);if(offer)room.reward.rewriteOffers[rp.id]=offer;else room.reward.rewriteClaims[rp.id]={completed:true};}
    else room.reward.rewriteClaims[rp.id]={completed:true};
  }
  // v5.1: wild monsters are captured during battle. Do not create a blocking post-battle capture gate.
  room.capture = null;
  battleLog(room, '승리!');
  for(const rp of room.players) room.runState[rp.id].wavesCleared=Number(room.runState[rp.id].wavesCleared||0)+1;
  pushRoomEvent(room, 'win', `${b.encounterLabel||'전투'} 승리!`, { tier: b.tier, encounterType:b.encounterType, waveInBiome:b.waveInBiome, floor: room.floor, final: room.finalClearPending, perfectPlayers: Object.keys(perfectBy).length });
  for(const ev of progressionEvents)pushRoomEvent(room,ev.type,ev.message,ev.payload);
}

function loseBattle(room) {
  releaseAllFusions(room,{reason:'battle-end',emit:false});
  syncRunHealth(room);
  room.status = 'ended';
  room.reward = {
    kind: 'defeat',
    title: '원정 실패',
    text: `${room.floor}층에서 탐험이 종료되었습니다. 영구 봉인한 몬스터와 보유 공명 지령·재화는 유지됩니다.`,
    playerOptions: {}, claims: {}, continueBy: []
  };
  recordRunHistory(room, 'defeat');
  for(const rp of room.players)clearProfileActiveRoom(rp.id,room.id);
  saveProfiles();
  pushRoomEvent(room, 'defeat', '원정대가 쓰러졌습니다.', { floor: room.floor });
}

function runAffinity(run) {
  const counts = {};
  for (const id of run?.runDeck || []) {
    const c = CARD_BY_ID[id];
    if (!c) continue;
    counts[c.element] = Number(counts[c.element] || 0) + 1;
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([element,count])=>({element,count}));
}
function cardSynergy(run, card) {
  if (!run || !card) return 0;
  const top = runAffinity(run).slice(0,2).map(x=>x.element);
  const monsterElements=(run.monsters||[]).filter(m=>m.hp>0).map(m=>m.element);
  let score=0;
  if(monsterElements.includes(card.element))score+=2;
  else if(top[0]===card.element)score+=1;
  if(card.cardClass==='gene'&&monsterElements.includes(card.element))score+=1;
  if(card.cardClass==='support'&&top.length&&monsterElements.some(e=>top.includes(e)))score+=1;
  return clamp(score,0,3);
}

function rewardCardWeight(room, run, c, tier) {
  let w = Number(RARITY[c.rarity]?.rewardWeight || 0);
  const order = Number(RARITY[c.rarity]?.order || 1);
  const diffLuck = roomDifficulty(room).rewardLuck;
  const itemLuck = 1 + modTotal(run, 'rewardLuck');
  const floorLuck = 1 + Math.min(0.55, room.floor / 100) + threatMods(room).reward;
  if (order >= 3) w *= diffLuck * itemLuck * floorLuck;
  if (tier === 'elite' && order >= 3) w *= 2.4;
  if (tier === 'rival' && order >= 2) w *= 1.55;
  if (tier === 'boss' && order >= 3) w *= 4.8;
  if (tier === 'boss' && c.rarity === 'legendary') w *= 4.2;
  if (tier === 'treasure' && order >= 2) w *= 1.8;
  if (tier === 'merchant' && ['rare', 'ultra'].includes(c.rarity)) w *= 2.0;
  if (room.floor < 10 && c.rarity === 'legendary') w *= 0.25;
  if (room.floor < 20 && c.rarity === 'mythic') w *= 0.05;
  const synergy = cardSynergy(run, c);
  if (synergy === 3) w *= 2.4;
  else if (synergy === 2) w *= 1.85;
  else if (synergy === 1) w *= 1.35;
  return w;
}
function rewardItemWeight(room, run, item, tier) {
  let w = Number(RARITY[item.rarity]?.rewardWeight || 0);
  const order = Number(RARITY[item.rarity]?.order || 1);
  const diffLuck = roomDifficulty(room).rewardLuck;
  const itemLuck = 1 + modTotal(run, 'rewardLuck');
  if (order >= 3) w *= diffLuck * itemLuck * (1 + Math.min(0.45, room.floor / 120) + threatMods(room).reward);
  if (tier === 'elite' && order >= 3) w *= 2.2;
  if (tier === 'rival' && order >= 2) w *= 1.45;
  if (tier === 'boss' && order >= 3) w *= 4.0;
  if (tier === 'merchant' && ['rare', 'ultra'].includes(item.rarity)) w *= 2.1;
  if (itemStacks(run, item.id) >= Number(item.maxStack || 1)) return 0;
  return w;
}
function rewardCardOptions(room, playerId, n, tier = 'combat') {
  const run = playerId ? room.runState[playerId] : null;
  const profile = playerId ? profiles[playerId] : null;
  let pool = CARDS.filter(c => !c.limited && !c.archiveOnly);
  if (room.mode === 'dungeon' && profile) {
    const owned = new Set(Object.keys(profile.collection || {}));
    pool = pool.filter(c => owned.has(c.id));
  }
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 800) {
    const c = weighted(pool, c => rewardCardWeight(room, run, c, tier));
    if (c && !out.some(x => x.id === c.id)) out.push(c);
  }
  return out;
}
function rewardItemOptions(room, playerId, n, tier = 'combat') {
  const run = playerId ? room.runState[playerId] : null;
  const legacy = /\uCE74\uB4DC|\uC2A4\uD3A0|\uC5D0\uB108\uC9C0|\uB4DC\uB85C\uC6B0|\uC190\uD328|spell|card|energy|draw|hand/i;
  const pool = ITEMS.filter(i => (!Array.isArray(i.modes) || i.modes.includes(room.mode)) && (i.held || !legacy.test(JSON.stringify(i))));
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const i = weighted(pool, i => rewardItemWeight(room, run, i, tier));
    if (i && !out.some(x => x.id === i.id)) out.push(i);
  }
  return out;
}

function rewardRelicOptions(room, playerId, n = 2) {
  const run = room.runState[playerId];
  const owned = new Set(run.relics || []);
  const pool = RELICS.filter(r => !owned.has(r.id) && (!Array.isArray(r.modes) || r.modes.includes(room.mode)));
  const out = [];
  while (out.length < n && pool.length) {
    const r = weighted(pool.filter(x => !out.some(y => y.id === x.id)), x => Number(RARITY[x.rarity]?.rewardWeight || 1) * (['legendary','mythic'].includes(x.rarity) ? (1 + room.floor/80) : 1));
    if (!r) break;
    out.push(clone(r));
  }
  return out;
}

function createPersonalRewardOptions(room, playerId, tier) {
  const run = room.runState[playerId];const extra=clamp(Math.floor(modTotal(run,'rewardChoices')),0,1),count=3+extra;
  // V5.6 run combat is monster-first. Cards remain in legacy collection data but are not drafted during expeditions.
  return rewardItemOptions(room,playerId,count,tier).map(i=>({id:uid('reward'),type:'item',itemId:i.id,item:publicItem(i),rarity:i.rarity,label:i.name,synergy:0}));
}

function createFloorReward(room, sourceKind, title, text, tier = 'combat', extras = {}) {
  const playerOptions = {};
  const rerolls = {};
  const relicOptions = {};
  for (const rp of room.players) {
    playerOptions[rp.id] = createPersonalRewardOptions(room, rp.id, tier);
    rerolls[rp.id] = 0;
    const relicCount = tier === 'boss' ? 3 : (tier === 'elite' || sourceKind === 'treasure' ? 2 : 0);
    relicOptions[rp.id] = relicCount ? rewardRelicOptions(room, rp.id, relicCount) : [];
  }
  const serviceCosts = sourceKind === 'battle' ? {
    mend: 35 + room.floor * 3,
    revive: 95 + room.floor * 5,
    charge: 48 + room.floor * 3
  } : null;
  room.reward = {
    kind: sourceKind,
    title,
    text,
    tier,
    playerOptions,
    claims: {},
    continueBy: [],
    rerolls,
    relicOptions,
    relicClaims: {},
    campBy: extras.campBy || {},
    camp: Boolean(extras.camp),
    serviceCosts,
    servicesBy: {},
    ...extras
  };
  room.status = 'reward';
}

function makeCaptureEncounter(floor,tier,room){
  const profile=profiles[room.players?.[0]?.id], defeated=(room.battle?.enemies||[]).map(e=>MONSTER_BY_ID[e.id]).filter(Boolean);let pool=defeated.length?defeated:ENEMIES.filter(e=>e.biome===currentBiome(room).id);
  if(process.env.TEST_MODE==='1'&&profile){const unseen=pool.find(m=>!profile.monsters?.[m.id])||ENEMIES.find(m=>m.biome===currentBiome(room).id&&!profile.monsters?.[m.id])||ENEMIES.find(m=>!profile.monsters?.[m.id]);pool=[unseen||pool[0]];}
  const m=weighted(pool,x=>{let w=x.tier==='ultra'?0.45:x.tier==='rare'?1.3:2.4;if(profile&&!profile.monsters?.[x.id])w*=2.8;if(tier==='elite'&&x.tier==='ultra')w*=2.4;if(tier==='boss'&&x.tier==='boss')w*=4;return w;})||pool[0];
  return {id:uid('wild'),monsterId:m.id,monster:publicMonster(m),attemptedBy:[],escaped:false,caughtBy:null,newDiscovery:profile?!profile.monsters?.[m.id]:true,source:'journey'};
}

function salvageReward(room, playerId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('보상 단계가 아닙니다.');
  if (room.reward.claims[playerId]) throw new Error('이미 보상을 선택했습니다.');
  const run = room.runState[playerId];
  const gold = 24 + room.floor * 3;
  run.gold += Math.round(gold * (1 + modTotal(run,'goldPct')));
  run.fragments = Number(run.fragments || 0) + 1;
  room.reward.claims[playerId] = { type:'salvage', id:'salvage', label:`보상 분해 · +${gold}G · 균열 파편 +1` };
  pushRoomEvent(room, 'salvage', `${playerName(room, playerId)} 님이 보상을 분해해 덱을 얇게 유지했습니다.`);
}

function claimRelicReward(room, playerId, relicId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('보상 단계가 아닙니다.');
  if (room.reward.relicClaims?.[playerId]) throw new Error('이미 유물을 선택했습니다.');
  const options = room.reward.relicOptions?.[playerId] || [];
  const relic = options.find(x => x.id === relicId);
  if (!relic) throw new Error('선택 가능한 유물이 아닙니다.');
  const run = room.runState[playerId];
  addRelic(run, relicId);
  room.reward.relicClaims ||= {};
  room.reward.relicClaims[playerId] = relicId;
  pushRoomEvent(room, 'relic', `${playerName(room, playerId)} 님이 유물 「${relic.name}」을 획득했습니다.`);
}

function trimRewardDeck(room, playerId, cardId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('보상 단계가 아닙니다.');
  if (!['merchant','rest'].includes(room.reward.kind)) throw new Error('덱 정제는 상점 또는 야영지에서만 할 수 있습니다.');
  const run = room.runState[playerId];
  room.reward.trimBy ||= {};
  if (room.reward.trimBy[playerId]) throw new Error('이 장소에서는 이미 덱을 정제했습니다.');
  const idx = run.runDeck.indexOf(cardId);
  if (idx < 0) throw new Error('현재 런 덱에 없는 카드입니다.');
  if (run.runDeck.length <= 10) throw new Error('덱이 너무 얇아 더 이상 제거할 수 없습니다.');
  const cost = 70 + Number(run.removals || 0) * 25;
  if (run.gold < cost) throw new Error(`런 골드가 부족합니다. 정제 비용 ${cost}G`);
  run.gold -= cost;
  run.runDeck.splice(idx,1);
  run.removals = Number(run.removals || 0) + 1;
  room.reward.trimBy[playerId] = cardId;
  pushRoomEvent(room,'deck-trim',`${playerName(room,playerId)} 님이 덱에서 「${CARD_BY_ID[cardId]?.name||cardId}」을 제거했습니다.`);
  return { cost, cardName:CARD_BY_ID[cardId]?.name||cardId };
}

function campRewardAction(room, playerId, mode, cardId) {
  if (room.status !== 'reward' || !room.reward?.camp) throw new Error('야영지 행동 단계가 아닙니다.');
  room.reward.campBy ||= {};
  if (room.reward.campBy[playerId]) throw new Error('이번 야영지 행동은 이미 완료했습니다.');
  const run = room.runState[playerId];
  let label='';
  if (mode === 'rest') {
    const heal = Math.max(12, Math.round(run.maxHp * (0.30 + modTotal(run,'restPct'))) + Math.round(modTotal(run,'restFlat')));
    const before=run.hp; run.hp=clamp(run.hp+heal,1,run.maxHp);
    for(const m of run.monsters||[]){const mh=Math.max(8,Math.round(m.maxHp*.30));m.hp=clamp(m.hp+mh,1,m.maxHp);m.block=0;}
    label=`휴식 · 코어 HP +${run.hp-before} · 몬스터 HP 30% 회복`;
  } else if (mode === 'pp') {
    let restored=0,cured=0;
    for(const m of run.monsters||[]){normalizeMonsterMoves(m);for(const mv of m.moves||[]){const before=Number(mv.pp||0),max=Number(mv.maxPp||defaultMovePp(mv));mv.pp=Math.min(max,before+Math.max(2,Math.ceil(max*.50)));restored+=mv.pp-before;}if(m.majorStatus){m.majorStatus=null;m.statusTurns=0;cured++;}}
    label=`PP 정비 · 총 PP +${restored}${cured?` · 상태이상 ${cured}마리 회복`:''}`;
  } else if (mode === 'meditate') {
    run.fragments = Number(run.fragments||0)+2; run.gold += 40; label='명상 · 균열 파편 +2 · 40G';
  } else throw new Error('지원하지 않는 야영 행동입니다.');
  room.reward.campBy[playerId]={mode,cardId:cardId||null,label};
  pushRoomEvent(room,'camp',`${playerName(room,playerId)}: ${label}`);
  return { label };
}

function claimReward(room, playerId, rewardId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('보상 단계가 아닙니다.');
  if (room.reward.claims[playerId]) throw new Error('이미 보상을 선택했습니다.');
  const options = room.reward.playerOptions?.[playerId] || [];
  if (!options.length) throw new Error('선택형 보상이 없습니다.');
  const opt = options.find(x => x.id === rewardId);
  if (!opt) throw new Error('보상이 없습니다.');
  const p = profiles[playerId];
  const run = room.runState[playerId];
  if (opt.type === 'card') {
    if (run && run.runDeck.length < 40) { run.runDeck.push(opt.cardId); run.cardsAdded++; }
    room.reward.claims[playerId] = { type: 'card', id: opt.cardId, label: `${CARD_BY_ID[opt.cardId].name} · RUN` };
  } else if (opt.type === 'item') {
    const item = addItemToRun(run, opt.itemId);
    room.reward.claims[playerId] = { type: 'item', id: opt.itemId, label: item.name };
  } else throw new Error('지원하지 않는 보상입니다.');
  saveProfiles();
  pushRoomEvent(room, 'reward', `${p.nickname} 님이 「${room.reward.claims[playerId].label}」 선택.`);
}

function rerollReward(room, playerId, currency = 'gold') {
  if (room.status !== 'reward' || !room.reward) throw new Error('보상 단계가 아닙니다.');
  if (room.reward.claims[playerId]) throw new Error('이미 보상을 선택했습니다.');
  const run = room.runState[playerId];
  const count = Number(room.reward.rerolls?.[playerId] || 0);
  if (count >= 5) throw new Error('이 층에서는 최대 5회까지 재굴림할 수 있습니다.');
  let cost=0;
  if (currency === 'fragment') {
    if (Number(run.fragments||0)<1) throw new Error('균열 파편이 부족합니다.');
    run.fragments -= 1; cost=1;
  } else {
    const discount = Math.min(0.70, modTotal(run, 'rerollDiscount'));
    const base = 42 + room.floor * 3;
    cost = Math.max(20, Math.round(base * Math.pow(1.55, count) * (1 - discount)));
    if (run.gold < cost) throw new Error(`런 골드가 부족합니다. 재굴림 비용 ${cost}G`);
    run.gold -= cost;
  }
  room.reward.rerolls[playerId] = count + 1;
  room.reward.playerOptions[playerId] = createPersonalRewardOptions(room, playerId, room.reward.tier || 'combat');
  run.rewardRerolls++;
  pushRoomEvent(room, 'reroll', `${playerName(room, playerId)} 님이 보상을 재굴림했습니다.`);
  return { cost, currency };
}

function fieldServiceAction(room, playerId, serviceId) {
  if (room.status !== 'reward' || !room.reward?.serviceCosts) throw new Error('현장 정비를 이용할 수 있는 단계가 아닙니다.');
  const run = room.runState[playerId];
  room.reward.servicesBy ||= {};
  room.reward.servicesBy[playerId] ||= {};
  if (room.reward.servicesBy[playerId][serviceId]) throw new Error('이번 웨이브에서 이미 이용한 정비입니다.');
  const cost = Number(room.reward.serviceCosts[serviceId] || 0);
  if (!cost) throw new Error('정비 항목을 찾을 수 없습니다.');
  if (run.gold < cost) throw new Error(`런 골드가 부족합니다. 정비 비용 ${cost}G`);
  let label='';
  if (serviceId === 'mend') {
    const damaged=(run.monsters||[]).some(m=>m.hp>0&&m.hp<m.maxHp)||run.hp<run.maxHp;
    if(!damaged) throw new Error('회복이 필요한 몬스터가 없습니다.');
    run.hp=clamp(run.hp+Math.max(8,Math.round(run.maxHp*.15)),1,run.maxHp);
    for(const m of run.monsters||[]) if(m.hp>0)m.hp=clamp(m.hp+Math.max(6,Math.round(m.maxHp*.22)),1,m.maxHp);
    label='응급 회복 · CORE 15% / 생존 몬스터 22%';
  } else if (serviceId === 'revive') {
    const ko=(run.monsters||[]).filter(m=>m.hp<=0).sort((a,b)=>Number(b.maxHp||0)-Number(a.maxHp||0));
    if(!ko.length) throw new Error('쓰러진 몬스터가 없습니다.');
    const m=ko[0];m.hp=Math.max(1,Math.round(m.maxHp*.40));m.block=0;m.revived=false;
    run.revivesUsed=Number(run.revivesUsed||0)+1;
    label=`부활 캡슐 · ${m.name} HP 40% 복귀`;
  } else if (serviceId === 'charge') {
    let restored=0,cured=0;for(const m of run.monsters||[]){normalizeMonsterMoves(m);for(const mv of m.moves||[]){const before=Number(mv.pp||0);mv.pp=Math.min(Number(mv.maxPp||defaultMovePp(mv)),before+Math.max(2,Math.ceil(Number(mv.maxPp||defaultMovePp(mv))*.35)));restored+=mv.pp-before;}if(m.majorStatus){m.majorStatus=null;m.statusTurns=0;cured++;}}
    label=`PP 정비 · 총 PP +${restored}${cured?` · 상태이상 ${cured}마리 회복`:''}`;
  } else throw new Error('정비 항목을 찾을 수 없습니다.');
  run.gold -= cost;
  room.reward.servicesBy[playerId][serviceId]={cost,label};
  pushRoomEvent(room,'field-service',`${playerName(room,playerId)}: ${label}`,{playerId,serviceId,cost});
  return { cost, label, spellCharge:0 };
}

function buyReward(room, playerId, itemId, itemType = 'card') {
  if (room.status !== 'reward' || !room.reward?.shop) throw new Error('상점이 아닙니다.');
  const run = room.runState[playerId];
  const stock = room.reward.shop || [];
  const product = stock.find(x => x.id === itemId && x.type === itemType);
  if (!product) throw new Error('상품을 찾을 수 없습니다.');
  const key = `${playerId}:${product.id}`;
  room.reward.purchased ||= {};
  if (room.reward.purchased[key]) throw new Error('이미 구매했습니다.');
  if (run.gold < product.price) throw new Error('런 골드가 부족합니다.');
  run.gold -= product.price;
  if (product.type === 'card') {
    if (run.runDeck.length < 40) run.runDeck.push(product.cardId);
  } else addItemToRun(run, product.itemId);
  room.reward.purchased[key] = true;
  saveProfiles();
  pushRoomEvent(room, 'buy', `${playerName(room, playerId)} 님이 상점 상품을 구매했습니다.`);
}

function continueAfterReward(room, playerId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('진행할 수 없습니다.');
  // v5.1 migration: old saves may still carry the removed post-battle capture gate.
  if (room.capture) room.capture = null;
  const options = room.reward.playerOptions?.[playerId] || [];
  if (options.length && !room.reward.claims[playerId]) throw new Error('보상을 선택하거나 분해해 주세요.');
  const skillOffer=room.reward.skillOffers?.[playerId];if(skillOffer&&!room.reward.skillClaims?.[playerId]){room.reward.skillHistoryBy ||= {};room.reward.skillHistoryBy[playerId] ||= [];room.reward.skillHistoryBy[playerId].push({skippedAll:true});delete room.reward.skillOffers[playerId];room.reward.skillClaims[playerId]={completed:true,skippedAll:true,history:room.reward.skillHistoryBy[playerId]};}
  const rewriteOffer=room.reward.rewriteOffers?.[playerId];if(rewriteOffer&&!room.reward.rewriteClaims?.[playerId])skipMoveRewrite(room,playerId);
  const relicOptions = room.reward.relicOptions?.[playerId] || [];
  if (relicOptions.length && !room.reward.relicClaims?.[playerId]) claimRelicReward(room, playerId, relicOptions[0].id);
  if (room.reward.camp && !room.reward.campBy?.[playerId]) campRewardAction(room, playerId, 'rest');
  if (!room.reward.continueBy.includes(playerId)) room.reward.continueBy.push(playerId);
  if (room.reward.continueBy.length < room.players.length) {
    pushRoomEvent(room, 'continue', `${playerName(room, playerId)} 님이 다음 층 준비 완료.`);
    return;
  }
  if (room.finalClearPending) {
    room.status = 'cleared';
    room.finalClearPending = false;
    const clearBonus = room.difficulty === 'hell' ? 1800 : room.difficulty === 'hard' ? 1150 : 750;
    for (const rp of room.players) {
      const p = profiles[rp.id];
      p.stats.dungeonClears++;
      p.stats[`${room.difficulty}Clears`] = Number(p.stats[`${room.difficulty}Clears`] || 0) + 1;
      p.gems += clearBonus;
    }
    recordRunHistory(room, 'clear');
    for(const rp of room.players)clearProfileActiveRoom(rp.id,room.id);
    saveProfiles();
    room.reward = { kind:'clear', title:`${DIFFICULTIES[room.difficulty].ko} 난이도 심연 원정 완료`, text:`50층을 돌파했습니다. 원정대 전원에게 클리어 보너스 프리즘 ${clearBonus}개 지급.`, playerOptions:{}, claims:{}, continueBy:[] };
    pushRoomEvent(room, 'clear', `50층 ${DIFFICULTIES[room.difficulty].ko} 던전을 클리어했습니다!`);
    return;
  }
  const crossingBiome = room.floor % 10 === 0;
  if (room.mode === 'dungeon' && crossingBiome) addThreatToken(room);
  if (crossingBiome) {
    for (const rp of room.players) {
      const run = room.runState[rp.id];
      run.hp = run.maxHp;
      for(const m of run.monsters||[])resetMonsterBattleResources(m,{fullHeal:true});
    }
    pushRoomEvent(room,'biome-heal','10웨이브 돌파 · HP / PP / 상태이상이 모두 회복되었습니다.');
  }
  room.floor++;
  if (crossingBiome) {
    room.biomeForkPending = true;
    room.biomeForkOptions = biomeForkCandidates(room);
  } else {
    room.biomeForkPending = false;
    room.biomeForkOptions = [];
  }
  makeRoute(room);
  pushRoomEvent(room, 'floor', crossingBiome ? `${room.floor}층 · 다음 바이옴을 선택합니다.` : `${room.floor}층으로 이동합니다.`);
}

function attemptBattleCapture(room,playerId,sealType,enemyUid,instanceId){
  const b=room.battle;
  if(room.mode!=='journey'||room.status!=='battle'||!b||b.phase!=='players'||!['wild','boss'].includes(b.encounterType))throw new Error('지금은 몬스터를 봉인할 수 없습니다.');
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');
  const u=(pc.units||[]).find(x=>x.instanceId===instanceId)||(pc.units||[]).find(x=>x.hp>0&&!x.acted)||(pc.units||[])[0];
  if(!u||u.hp<=0)throw new Error('봉인을 시도할 출전 몬스터가 없습니다.');if(u.acted)throw new Error('이 몬스터는 이미 행동했습니다.');
  const target=aliveEnemies(room).find(e=>e.uid===enemyUid)||aliveEnemies(room)[0];if(!target)throw new Error('봉인할 몬스터가 없습니다.');
  const m=MONSTER_BY_ID[target.id];if(!m)throw new Error('몬스터 데이터를 찾을 수 없습니다.');
  if(b.encounterType==='boss'&&Number(target.hpSegments||1)>1)throw new Error('보스의 HP 보호막을 마지막 1칸까지 깨야 봉인할 수 있습니다.');
  const p=profiles[playerId],run=room.runState[playerId],seal=String(sealType||'basic'),mult={basic:1,silver:1.8,royal:3.5}[seal];
  if(!mult)throw new Error('봉인구 종류 오류');if((p.seals?.[seal]||0)<=0)throw new Error('봉인구가 없습니다.');
  const hpRatio=clamp(Number(target.hp||0)/Math.max(1,Number(target.maxHp||1)),0,1),lowHpBonus=(1-hpRatio)*.45;
  // Boss capture rules are identical in the client and server: Royal seal + <= 25% HP.
  if(m.tier==='boss'&&seal!=='royal')throw new Error('보스는 로열 봉인구가 필요합니다.');
  if(m.tier==='boss'&&hpRatio>.25)throw new Error('보스는 HP 25% 이하에서 봉인할 수 있습니다.');
  p.seals[seal]--;
  let chance=(Number(m.captureBase||.25)+lowHpBonus)*mult;if(run?.relics?.includes('r003'))chance+=.08;chance+=modTotal(run,'captureBonus');
  const heldCapture=heldItemDef(u)?.held;if(heldCapture?.kind==='captureBonus')chance+=Number(heldCapture.bonus||0);
  if(target.broken)chance+=.07;if(Number(target.debuffs?.burn||0)>0)chance+=.025;if(Number(target.debuffs?.weak||0)>0)chance+=.025;
  const hardCap=m.tier==='boss'?.32:m.tier==='ultra'?.76:m.tier==='rare'?.92:.98;chance=clamp(chance,.03,hardCap);
  const newDiscovery=!p.monsters?.[m.id],success=process.env.TEST_MODE==='1'?true:Math.random()<chance;
  u.acted=true;pc.stats.movesUsed=Number(pc.stats.movesUsed||0);
  if(success){
    const wasNew=addMonsterToProfile(p,m.id,1,false);p.stats.monstersCaught=Number(p.stats.monstersCaught||0)+1;p.stats.cardsCaught=Number(p.stats.cardsCaught||0)+1;if(wasNew)p.stats.journeyUnlocks=Number(p.stats.journeyUnlocks||0)+1;
    target.hp=0;saveProfiles();battleLog(room,`${u.name}의 봉인 성공 — ${m.name}을(를) 동료로 만들었다!`);pushRoomEvent(room,'capture',`${m.name} 봉인 성공!`,{monsterId:m.id,enemyUid:target.uid,playerId,instanceId:u.instanceId,success:true});
  }else{
    saveProfiles();battleLog(room,`${u.name}의 봉인 실패 — ${m.name}은(는) 아직 전장에 남아 있다.`);pushRoomEvent(room,'capture-fail',`${m.name} 봉인 실패.`,{monsterId:m.id,enemyUid:target.uid,playerId,instanceId:u.instanceId,success:false});
  }
  if(checkBattleEnd(room))return{success,chance,escaped:success,monster:publicMonster(m),newDiscovery};
  if((pc.units||[]).filter(x=>x.hp>0).every(x=>x.acted)){pc.ended=true;battleLog(room,`${pc.nickname} 행동 완료.`);if(b.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}
  return{success,chance,escaped:false,monster:publicMonster(m),newDiscovery};
}

function attemptCapture(room,playerId,sealType){
  if(room.mode!=='journey'||room.status!=='reward'||!room.capture||room.capture.escaped)throw new Error('봉인할 야생 몬스터가 없습니다.');const cap=room.capture;if(cap.attemptedBy.includes(playerId))throw new Error('이미 봉인을 시도했습니다.');const p=profiles[playerId],run=room.runState[playerId],seal=String(sealType||'basic'),mult={basic:1,silver:1.8,royal:3.5}[seal];if(!mult)throw new Error('봉인구 종류 오류');if((p.seals[seal]||0)<=0)throw new Error('봉인구가 없습니다.');p.seals[seal]--;cap.attemptedBy.push(playerId);const m=MONSTER_BY_ID[cap.monsterId];let chance=Number(m.captureBase||.25)*mult;if(run?.relics.includes('r003'))chance+=.08;chance+=modTotal(run,'captureBonus');const hardCap=m.tier==='boss'?.28:m.tier==='ultra'?.62:m.tier==='rare'?.88:.97;chance=Math.min(hardCap,chance);const success=process.env.TEST_MODE==='1'?true:Math.random()<chance;
  if(success){const wasNew=addMonsterToProfile(p,m.id,1,false);p.stats.monstersCaught=Number(p.stats.monstersCaught||0)+1;p.stats.cardsCaught=Number(p.stats.cardsCaught||0)+1;if(wasNew)p.stats.journeyUnlocks=Number(p.stats.journeyUnlocks||0)+1;cap.caughtBy=playerId;cap.escaped=true;saveProfiles();pushRoomEvent(room,'capture',`${m.name} 봉인 성공!`,{monsterId:m.id});}
  else{const escapeReduction=modTotal(run,'captureEscapeReduction'),escapeChance=Math.max(.10,.38-escapeReduction);if(Math.random()<escapeChance)cap.escaped=true;saveProfiles();pushRoomEvent(room,'capture-fail',cap.escaped?`${m.name}이(가) 달아났습니다.`:`${m.name} 봉인 실패. 아직 전장에 남아 있습니다.`,{monsterId:m.id});}
  return {success,chance,escaped:cap.escaped,monster:publicMonster(m),newDiscovery:!p.monsters?.[m.id]?true:cap.newDiscovery};
}
function passCapture(room,playerId){if(room.mode!=='journey'||room.status!=='reward'||!room.capture||room.capture.escaped)throw new Error('지나갈 야생 몬스터가 없습니다.');if(!room.capture.attemptedBy.includes(playerId))room.capture.attemptedBy.push(playerId);room.capture.escaped=true;pushRoomEvent(room,'capture-pass',`${playerName(room,playerId)} 님이 야생 몬스터를 지나쳤습니다.`);return{passed:true};}

function rarityRoll(profile) {
  profile.pity.legendary++;
  profile.pity.mythic++;
  let rarity;
  const r = Math.random();
  if (profile.pity.mythic >= BANNER.pity.mythic) {
    rarity = 'mythic'; profile.pity.mythic = 0; profile.pity.legendary = 0;
  } else if (profile.pity.legendary >= BANNER.pity.legendary) {
    rarity = 'legendary'; profile.pity.legendary = 0;
  } else if (r < BANNER.rates.mythic) rarity = 'mythic';
  else if (r < BANNER.rates.mythic + BANNER.rates.legendary) rarity = 'legendary';
  else if (r < BANNER.rates.mythic + BANNER.rates.legendary + BANNER.rates.ultra) rarity = 'ultra';
  else if (r < BANNER.rates.mythic + BANNER.rates.legendary + BANNER.rates.ultra + BANNER.rates.rare) rarity = 'rare';
  else rarity = 'common';
  return rarity;
}
function pullGacha(profile, count) {
  const n = Number(count) === 10 ? 10 : 1;
  const cost = n === 10 ? BANNER.tenCost : BANNER.singleCost;
  if (profile.gems < cost) throw new Error('프리즘이 부족합니다.');
  profile.gems -= cost;
  const results = [];
  const archivePool = CARDS.filter(c => c.archiveOnly || c.limited);
  for (let i = 0; i < n; i++) {
    const rarity = rarityRoll(profile);
    let pool = archivePool.filter(c => c.rarity === rarity);
    if (!pool.length) {
      const targetOrder = Number(RARITY[rarity]?.order || 1);
      pool = archivePool.slice().sort((a,b)=>Math.abs(Number(RARITY[a.rarity]?.order||1)-targetOrder)-Math.abs(Number(RARITY[b.rarity]?.order||1)-targetOrder)).slice(0,12);
    }
    const featured = pool.filter(c => c.limited && BANNER.featured.includes(c.id));
    let c;
    if (featured.length && Math.random() < 0.55) c = choose(featured);
    else c = choose(pool);
    addCardToProfile(profile, c.id, 1, false, 'gacha');
    results.push(publicCard(c));
    profile.stats.gachaPulls++;
  }
  saveProfiles();
  return { results, cost, profile: profileView(profile) };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1024 * 1024) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('잘못된 JSON')); }
    });
  });
}
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}
function ok(res, data = {}) { json(res, 200, { ok: true, ...data }); }
function fail(res, status, message) { json(res, status, { ok: false, error: message }); }

function serveStatic(res, pathname) {
  let base = PUBLIC;
  let rel = pathname;
  if (pathname.startsWith('/assets/')) { base = ASSETS; rel = pathname.slice('/assets'.length); }
  const target = rel === '/' ? '/index.html' : rel;
  const full = path.normalize(path.join(base, target));
  if (!full.startsWith(base)) return fail(res, 403, 'forbidden');
  fs.readFile(full, (err, data) => {
    if (err) {
      if (base === PUBLIC && !path.extname(target)) return serveStatic(res, '/index.html');
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(full).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
    }[ext] || 'application/octet-stream';
    const longCache = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': longCache ? 'public, max-age=86400' : 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

async function authProfile(req, res, body) {
  const user = await authUserFromRequest(req, res);
  if (user?.id) {
    const accountId = accountIdFromUser(user);
    const existing = profiles[user.id];
    const fallbackNickname = existing?.nickname || user.user_metadata?.nickname || accountId || '방랑자';
    const prof = ensureProfile(user.id, fallbackNickname);
    if (body.rename && body.nickname) prof.nickname = sanitizeName(body.nickname);
    prof.cloud = true;
    prof.accountId = accountId;
    return prof;
  }
  const pid = String(body.profileId || '').trim();
  if (!pid || pid.length > 96) throw new Error('프로필 ID가 필요합니다.');
  const prof = ensureProfile(pid, body.nickname);
  prof.cloud = false;
  return prof;
}
function assertMember(room, pid) {
  if (!room.players.some(x => x.id === pid)) throw new Error('방 참가자가 아닙니다.');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      });
      return res.end();
    }
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;
    if (p === '/healthz' || p === '/api/version') return ok(res, { service: 'RIFT_DECK_SERVER', version: VERSION, deployId: DEPLOY_ID, storage: SUPABASE_ACTIVE ? 'supabase+json-fallback' : 'json-local', auth: SUPABASE_AUTH_ACTIVE ? 'supabase' : 'guest-only', cards: CARDS.length, items: ITEMS.length, monsters: ENEMIES.length + BOSSES.length, monsterMoves: MOVE_LIBRARY.length, maxDungeonFloor: DUNGEON_MAX_FLOOR, rooms: rooms.size, uptime: Math.round(process.uptime()) });
    if (p === '/api/meta' && req.method === 'GET') return ok(res, {
      cards: CARDS.map(publicCard), items: ITEMS.map(publicItem), monsters: MONSTERS.map(publicMonster), rarities: RARITY, elements: ELEMENTS, elementMatchups: ELEMENT_ADVANTAGE, monsterRules:{maxSlots:MONSTER_PARTY_MAX,pointBudget:MONSTER_POINT_BUDGET,moveLibraryCount:MOVE_LIBRARY.length}, spellRules:{min:DECK_MIN,max:DECK_MAX}, battleRules:{...BATTLE_RULES,xpModel:'battle-end',moveLibraryCount:MOVE_LIBRARY.length,moveMasteryThresholds:MOVE_MASTERY_THRESHOLDS}, biomes: BIOMES,
      relics: RELICS, banner: BANNER, difficulties: DIFFICULTIES, version: VERSION, maxDungeonFloor: DUNGEON_MAX_FLOOR, authEnabled: SUPABASE_AUTH_ACTIVE
    });
    if (p === '/api/auth/status' && req.method === 'GET') {
      const user = await authUserFromRequest(req, res);
      return ok(res, { enabled: SUPABASE_AUTH_ACTIVE, authenticated: Boolean(user), user: user ? { id: user.id, accountId: accountIdFromUser(user), nickname: user.user_metadata?.nickname || accountIdFromUser(user) } : null });
    }
    if (p === '/api/auth/signup' && req.method === 'POST') {
      if (!SUPABASE_AUTH_ACTIVE) throw new Error('Render에 SUPABASE_URL과 Supabase Secret/Service Role 키를 먼저 설정해 주세요.');
      const b = await parseBody(req);
      const accountId = normalizeAccountId(b.accountId);
      const password = validatePassword(b.password);
      const nickname = sanitizeName(b.nickname || accountId);
      try {
        await supabaseAuthRequest('/auth/v1/admin/users', {
          method: 'POST',
          body: JSON.stringify({ email: accountEmail(accountId), password, email_confirm: true, user_metadata: { account_id: accountId, nickname } })
        }, true);
      } catch (err) {
        const m = String(err.message || '').toLowerCase();
        if (m.includes('already') || m.includes('registered') || m.includes('duplicate')) throw new Error('이미 사용 중인 아이디입니다.');
        throw err;
      }
      const session = await passwordSession(accountId, password);
      setAuthCookies(req, res, session);
      const user = session.user;
      let prof = mergeGuestProfileInto(user.id, b.guestProfileId, nickname, accountId);
      prof.cloud = true; prof.accountId = accountId; prof.nickname = nickname;
      prof.stats.loginCount = Number(prof.stats.loginCount || 0) + 1; prof.stats.lastLoginAt = Date.now();
      saveProfiles();
      return ok(res, { user: { id: user.id, accountId, nickname }, profile: profileView(prof) });
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      if (!SUPABASE_AUTH_ACTIVE) throw new Error('Render에 Supabase 환경변수를 먼저 설정해 주세요.');
      const b = await parseBody(req);
      const accountId = normalizeAccountId(b.accountId);
      const password = validatePassword(b.password);
      let session;
      try { session = await passwordSession(accountId, password); }
      catch { throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.'); }
      setAuthCookies(req, res, session);
      const nickname = sanitizeName(session.user?.user_metadata?.nickname || accountId);
      const profileMode = b.profileMode === 'guest' ? 'guest' : 'cloud';
      let prof = profileMode === 'guest'
        ? mergeGuestProfileInto(session.user.id, b.guestProfileId, nickname, accountId, true)
        : ensureProfile(session.user.id, nickname);
      prof.cloud = true; prof.accountId = accountId;
      prof.stats.loginCount = Number(prof.stats.loginCount || 0) + 1; prof.stats.lastLoginAt = Date.now();
      saveProfiles();
      return ok(res, { user: { id: session.user.id, accountId, nickname: prof.nickname }, profileMode, profile: profileView(prof) });
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      clearAuthCookies(req, res);
      return ok(res, { authenticated: false });
    }
    if (p === '/api/profile' && req.method === 'POST') {
      const b = await parseBody(req); const prof = await authProfile(req, res, b); saveProfiles(); return ok(res, { profile: profileView(prof) });
    }
    if (p === '/api/loadout' && req.method === 'POST') {
      const b=await parseBody(req),prof=await authProfile(req,res,b);const party=normalizeMonsterParty(b.monsterParty,prof.monsters||{});if(!party.length)throw new Error('몬스터를 최소 1마리 선택하세요.');if(party.length>MONSTER_PARTY_MAX||monsterPartyCost(party)>MONSTER_POINT_BUDGET)throw new Error(`몬스터 포인트는 ${MONSTER_POINT_BUDGET} 이하여야 합니다.`);
      prof.monsterParty=party;/* v5.6 expedition combat is monster-only; keep any legacy archive deck untouched. */saveProfiles();return ok(res,{profile:profileView(prof)});
    }
    if (p === '/api/deck' && req.method === 'POST') {
      const b=await parseBody(req),prof=await authProfile(req,res,b),seen=new Set();const raw=(Array.isArray(b.deck)?b.deck:[]).filter(cid=>CARD_BY_ID[cid]?.type==='spell'&&prof.collection[cid]>0&&!seen.has(cid)&&seen.add(cid)).slice(0,DECK_MAX);if(raw.length<DECK_MIN)throw new Error(`공명 지령 덱은 최소 ${DECK_MIN}종이 필요합니다.`);prof.deck=raw;saveProfiles();return ok(res,{profile:profileView(prof)});
    }
    if (p === '/api/gacha/pull' && req.method === 'POST') {
      const b = await parseBody(req); const prof = await authProfile(req, res, b); return ok(res, pullGacha(prof, b.count));
    }
    if (p === '/api/rooms/resume' && req.method === 'POST') {
      const b=await parseBody(req); const prof=await authProfile(req,res,b);
      const room=resumableRoomForProfile(prof.id);
      if(!room){ if(prof.activeRoomId||prof.activeRoomSnapshot){prof.activeRoomId='';prof.activeRoomSnapshot=null;saveProfiles();} return ok(res,{room:null,profile:profileView(prof)}); }
      prof.activeRoomId=room.id; saveProfiles();
      return ok(res,{room:roomView(room),profile:profileView(prof)});
    }
    if (p === '/api/rooms' && req.method === 'GET') {
      const list = [...rooms.values()].filter(r => r.mode === 'dungeon' && r.status === 'lobby' && r.players.length < r.maxPlayers).map(r => ({
        id: r.id, name: r.name, players: r.players.length, maxPlayers: r.maxPlayers, host: r.players[0]?.nickname,
        createdAt: r.createdAt, difficulty: r.difficulty, difficultyInfo: DIFFICULTIES[r.difficulty]
      }));
      return ok(res, { rooms: list });
    }
    if (p === '/api/rooms/create' && req.method === 'POST') {
      const b = await parseBody(req); const prof = await authProfile(req, res, b);
      const mode = b.mode === 'journey' ? 'journey' : 'dungeon';
      const room = makeRoom(prof, mode, b.name, b.difficulty || 'normal');
      return ok(res, { room: roomView(room) });
    }
    if (p === '/api/rooms/join' && req.method === 'POST') {
      const b = await parseBody(req); const prof = await authProfile(req, res, b); const room = rooms.get(String(b.roomId || ''));
      if (!room) throw new Error('방을 찾을 수 없습니다.');
      if (room.status !== 'lobby') throw new Error('이미 시작된 방입니다.');
      if (room.players.length >= room.maxPlayers && !room.players.some(x => x.id === prof.id)) throw new Error('방이 가득 찼습니다.');
      if (!room.players.some(x => x.id === prof.id)) room.players.push({ id: prof.id, nickname: prof.nickname, ready: true, joinedAt: Date.now() });
      prof.activeRoomId=room.id; saveProfiles();
      pushRoomEvent(room, 'join', `${prof.nickname} 님이 참가했습니다.`);
      return ok(res, { room: roomView(room) });
    }

    const m = p.match(/^\/api\/room\/(\d{6})(?:\/(.*))?$/);
    if (m) {
      const room = rooms.get(m[1]);
      if (!room) return fail(res, 404, '방을 찾을 수 없습니다.');
      const action = m[2] || '';
      if (!action && req.method === 'GET') return ok(res, { room: roomView(room) });
      if (action === 'stream' && req.method === 'GET') {
        const authUser = await authUserFromRequest(req, res); const pid = authUser?.id || u.searchParams.get('profileId'); assertMember(room, pid);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*'
        });
        res.write(`event: room-update\ndata: ${JSON.stringify(roomView(room))}\n\n`);
        if (!clientsByRoom.has(room.id)) clientsByRoom.set(room.id, new Set());
        clientsByRoom.get(room.id).add(res);
        req.on('close', () => clientsByRoom.get(room.id)?.delete(res));
        return;
      }
      if (req.method === 'POST') {
        const b = await parseBody(req); const prof = await authProfile(req, res, b); assertMember(room, prof.id);
        if (action === 'start') { if (room.hostId !== prof.id) throw new Error('방장만 시작할 수 있습니다.'); startRoom(room); return ok(res, { room: roomView(room) }); }
        if (action === 'vote') { const voteResult=voteRoute(room, prof.id, b.nodeId); return ok(res, { room: roomView(room), voteResult }); }
        if (action === 'contract') { chooseRunContract(room, prof.id, b.contractId); return ok(res, { room: roomView(room) }); }
        if (action === 'equip-held') { const result=equipHeldItem(room,prof.id,b.instanceId,b.itemId||null); return ok(res,{result,room:roomView(room)}); }
        if (action === 'play') { throw new Error('V5.6 원정 전투에서는 카드를 사용하지 않습니다. 기술·융합·교대·봉인을 사용하세요.'); }
        if (action === 'move') { const result=useMonsterMove(room,prof.id,b.instanceId,b.moveId,b.targetUid); return ok(res,{result,room:roomView(room)}); }
        if (action === 'recall-unit') { const unit = recallUnit(room, prof.id, b.instanceId); return ok(res, { result:{ name:unit.name, cardId:unit.cardId }, room: roomView(room) }); }
        if (action === 'monster-evolve') { const unit=evolveMonster(room,prof.id,b.instanceId,b.mode); return ok(res,{result:{name:unit.name,mode:b.mode},room:roomView(room),profile:profileView(profiles[prof.id])}); }
        if (action === 'monster-fuse') { const unit=fuseMonsters(room,prof.id,b.primaryId,b.secondaryId,b.moveIds||[]); return ok(res,{result:{name:unit.name},room:roomView(room),profile:profileView(profiles[prof.id])}); }
        if (action === 'switch-monster') { const unit=switchMonster(room,prof.id,b.activeId,b.benchId); return ok(res,{result:{name:unit.name},room:roomView(room)}); }
        if (action === 'end-turn') { endTurn(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'event') { chooseEvent(room, prof.id, b.choiceId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'reward') { claimReward(room, prof.id, b.rewardId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'learn-move') { const result=teachMonsterMove(room,prof.id,b.moveId,b.replaceIndex); return ok(res,{result,room:roomView(room)}); }
        if (action === 'skip-move') { const result=skipMonsterMoveOffer(room,prof.id); return ok(res,{result,room:roomView(room)}); }
        if (action === 'rewrite-move') { const result=claimMoveRewrite(room,prof.id,b.rewriteId); return ok(res,{result,room:roomView(room)}); }
        if (action === 'skip-rewrite') { const result=skipMoveRewrite(room,prof.id); return ok(res,{result,room:roomView(room)}); }
        if (action === 'salvage') { salvageReward(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'relic') { claimRelicReward(room, prof.id, b.relicId); return ok(res, { room: roomView(room) }); }
        if (action === 'camp') { const result=campRewardAction(room, prof.id, b.mode, b.cardId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'trim') { const result=trimRewardDeck(room, prof.id, b.cardId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'reroll') { const result = rerollReward(room, prof.id, 'gold'); return ok(res, { result, room: roomView(room) }); }
        if (action === 'reroll-fragment') { const result = rerollReward(room, prof.id, 'fragment'); return ok(res, { result, room: roomView(room) }); }
        if (action === 'buy') { buyReward(room, prof.id, b.itemId, b.itemType); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'service') { const result=fieldServiceAction(room, prof.id, b.serviceId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'continue') { continueAfterReward(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'capture') { const result = room.status==='battle' ? attemptBattleCapture(room, prof.id, b.sealType, b.enemyUid, b.instanceId) : attemptCapture(room, prof.id, b.sealType); return ok(res, { result, room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'capture-pass') { const result = passCapture(room, prof.id); return ok(res, { result, room: roomView(room) }); }
        if (action === 'debug-monster' && process.env.TEST_MODE === '1') {
          const pc=getPc(room,prof.id),unit=findCombatMonster(pc,b.instanceId);if(!pc||!unit)throw new Error('테스트 몬스터를 찾을 수 없습니다.');
          if(b.level!=null)unit.level=Number(b.level);if(b.xp!=null)unit.xp=Number(b.xp);if(b.gene!=null)unit.gene=Number(b.gene);if(b.resonance!=null)unit.resonance=Number(b.resonance);if(b.rift!=null)unit.rift=Number(b.rift);if(b.hpRatio!=null)unit.hp=Math.max(1,Math.round(unit.maxHp*Number(b.hpRatio)));if(b.majorStatus!==undefined){unit.majorStatus=b.majorStatus||null;unit.statusTurns=Number(b.statusTurns||0);}if(b.movePp!=null&&unit.moves?.[0]){normalizeMonsterMoves(unit);unit.moves[0].pp=Math.max(0,Math.min(Number(unit.moves[0].maxPp||defaultMovePp(unit.moves[0])),Number(b.movePp)));}
          return ok(res,{room:roomView(room)});
        }
        if (action === 'debug-win' && process.env.TEST_MODE === '1') {
          if (room.status === 'battle' && room.battle) room.battle.enemies.forEach(e => e.hp = 0);
          if (room.status === 'battle') winBattle(room);
          else if (room.status === 'route') { room.finalClearPending = room.mode === 'dungeon' && room.floor === DUNGEON_MAX_FLOOR; createFloorReward(room, 'debug', '테스트 층 완료', '테스트용 보상', 'combat'); }
          return ok(res, { room: roomView(room) });
        }
      }
    }
    if (p.startsWith('/api/')) return fail(res, 404, 'API route not found');
    return serveStatic(res, p);
  } catch (err) {
    return fail(res, 400, err.message || 'request failed');
  }
});

setInterval(() => {
  for (const set of clientsByRoom.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch {} }
  const now = Date.now();
  for (const [id, r] of rooms) if (now - Number(r.updatedAt || r.createdAt || now) > ROOM_TTL) {
    rooms.delete(id); clientsByRoom.delete(id);
    const timer = roomSyncTimers.get(id); if (timer) clearTimeout(timer); roomSyncTimers.delete(id);
    deleteRoomSnapshot(id);
  }
}, 15000).unref();

if (require.main === module) {
  (async () => {
    await hydrateProfilesFromSupabase();
    await hydrateRoomsFromSupabase();
    server.listen(PORT, HOST, () => {
      console.log(`[FUSEWILD v${VERSION}] ${DEPLOY_ID} dynamic server listening on http://${HOST}:${PORT}`);
      console.log(`[FUSEWILD] persistence=${SUPABASE_ACTIVE ? 'Supabase + JSON fallback' : 'JSON local (Supabase env not configured)'} auth=${SUPABASE_AUTH_ACTIVE ? 'Supabase Auth' : 'guest-only'}`);
    });
  })().catch(err => { console.error('[FUSEWILD] boot failed', err); process.exit(1); });
}

module.exports = { server, CATALOG, DUNGEON_MAX_FLOOR, CARDS, ITEMS, DIFFICULTIES };
