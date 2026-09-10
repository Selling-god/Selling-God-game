'use strict';

/**
 * RIFT DECK: ABYSS EXPEDITION
 * ------------------------------------------------------------
 * A dependency-free, server-authoritative Node.js game server.
 * - Dynamic rooms for 1-4 player co-op
 * - SSE realtime synchronization
 * - Slay-the-Spire-like hand/energy/block/intent combat
 * - Persistent local profile fallback (JSON)
 * - Journey capture system + limited rerun gacha
 *
 * The game deliberately uses original names, cards, creatures and graphics.
 * It borrows roguelite UX ideas, not copyrighted Pokemon/PokeRogue assets.
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
const DATA_DIR = path.join(ROOT, 'data');
const PROFILE_FILE = process.env.PROFILE_FILE ? path.resolve(process.env.PROFILE_FILE) : path.join(DATA_DIR, 'profiles.json');
const ROOM_TTL = 1000 * 60 * 60 * 12;

fs.mkdirSync(path.dirname(PROFILE_FILE), { recursive: true });
if (!fs.existsSync(PROFILE_FILE)) fs.writeFileSync(PROFILE_FILE, '{}');

const rooms = new Map();
const clientsByRoom = new Map();
let profiles = readJson(PROFILE_FILE, {});

const RARITY = {
  common:    { ko: '일반',   order: 1, travelWeight: 7200, sealBase: 0.86, dust: 2 },
  rare:      { ko: '희귀',   order: 2, travelWeight: 2100, sealBase: 0.60, dust: 5 },
  ultra:     { ko: '초희귀', order: 3, travelWeight: 360,  sealBase: 0.31, dust: 14 },
  legendary: { ko: '전설',   order: 4, travelWeight: 12,   sealBase: 0.105, dust: 45 },
  mythic:    { ko: '신화',   order: 5, travelWeight: 1,    sealBase: 0.035, dust: 120 }
};

const ELEMENTS = ['화염','물','자연','빛','그림자','강철','바람','번개','별','시간','공허','수정'];

function card(id, name, type, rarity, cost, element, art, stats, text, effects = [], unit = {}) {
  return {
    id, name, type, rarity, cost, element, art,
    hp: Number(stats.hp || 0), power: Number(stats.power || 0), block: Number(stats.block || 0),
    text, effects, unit, limited: false
  };
}
function limited(c) { c.limited = true; return c; }

const CARDS = [
  // ---- Common units -------------------------------------------------------
  card('u001','불씨 기사','unit','common',1,'화염','ember-knight',{hp:27,power:6,block:0},'소환: 적 하나에게 3 피해.',[{op:'damage',value:3,target:'enemy'}]),
  card('u002','숲길 정찰자','unit','common',1,'자연','moss-scout',{hp:22,power:5},'소환: 카드 1장을 뽑는다.',[{op:'draw',value:1}]),
  card('u003','청동 방패병','unit','common',1,'강철','bronze-guard',{hp:34,power:4,block:4},'소환: 방어 5. 자신은 튼튼한 전열을 형성한다.',[{op:'block',value:5}]),
  card('u004','잔물결 마도사','unit','common',2,'물','ripple-mage',{hp:25,power:8},'공격할 때 25% 확률로 약화 1.',[],{onAttack:'weak25'}),
  card('u005','황혼 궁수','unit','common',1,'그림자','dusk-archer',{hp:20,power:8},'체력이 가득한 적을 공격할 때 +3 피해.',[],{onAttack:'fullBonus'}),
  card('u006','기어 정비사','unit','common',2,'강철','gear-smith',{hp:30,power:6,block:3},'소환: 모든 내 유닛에게 방어막 2.',[],{onSummon:'unitGuard'}),
  card('u007','들꽃 치유사','unit','common',2,'자연','wild-healer',{hp:24,power:5},'턴 종료: 가장 체력이 낮은 아군을 2 회복.',[],{onRound:'healLowest2'}),
  card('u008','구름 창병','unit','common',2,'바람','cloud-lancer',{hp:28,power:9},'첫 공격은 +4 피해.',[],{onAttack:'firstBonus4'}),
  card('u009','석영 사냥꾼','unit','common',2,'수정','quartz-hunter',{hp:31,power:7,block:3},'소환: 적 하나에게 취약 1.',[{op:'vulnerable',value:1,target:'enemy'}]),
  card('u010','초승달 도둑','unit','common',1,'그림자','crescent-thief',{hp:19,power:7},'적 처치 관여 시 프리즘 조각을 얻는 탐험형 유닛.',[]),

  // ---- Common spells ------------------------------------------------------
  card('s001','직선 베기','spell','common',1,'강철','steel-slash',{power:8},'적 하나에게 8 피해.',[{op:'damage',value:8,target:'enemy'}]),
  card('s002','응급 장막','spell','common',1,'빛','quick-veil',{block:9},'방어 9.',[{op:'block',value:9}]),
  card('s003','탐험가의 숨','spell','common',0,'바람','wanderer-breath',{},'카드 1장을 뽑는다.',[{op:'draw',value:1}]),
  card('s004','작은 회복','spell','common',1,'빛','small-heal',{},'체력 6 회복.',[{op:'heal',value:6,target:'self'}]),
  card('s005','점화','spell','common',1,'화염','ignite',{power:5},'5 피해. 화상 2.',[{op:'damage',value:5,target:'enemy'},{op:'burn',value:2,target:'enemy'}]),
  card('s006','냉기 파편','spell','common',1,'물','frost-chip',{power:4,block:4},'4 피해. 방어 4.',[{op:'damage',value:4,target:'enemy'},{op:'block',value:4}]),
  card('s007','흙먼지 걷어내기','spell','common',1,'자연','dust-clear',{block:6},'방어 6. 약화 1 제거.',[{op:'block',value:6},{op:'cleanseWeak',value:1}]),
  card('s008','날쌘 찌르기','spell','common',0,'바람','quick-stab',{power:4},'4 피해.',[{op:'damage',value:4,target:'enemy'}]),
  card('s009','수정 부스러기','spell','common',1,'수정','crystal-chip',{block:7},'방어 7. 다음 유닛에게 방어막 2.',[{op:'block',value:7},{op:'nextUnitBlock',value:2}]),
  card('s010','별빛 표식','spell','common',1,'별','star-mark',{},'적 하나에게 취약 1.',[{op:'vulnerable',value:1,target:'enemy'}]),

  // ---- Rare units ---------------------------------------------------------
  card('u101','월광 사냥꾼','unit','rare',2,'별','moon-hunter',{hp:31,power:11},'약화된 적에게 +5 피해.',[],{onAttack:'weakBonus5'}),
  card('u102','진홍 연금술사','unit','rare',2,'화염','crimson-alchemist',{hp:28,power:8},'내가 스펠을 사용할 때 무작위 적에게 2 피해.',[],{onSpell:'ping2'}),
  card('u103','수정 골렘','unit','rare',3,'수정','crystal-golem',{hp:49,power:8,block:8},'소환: 모든 아군 플레이어 방어 4.',[{op:'blockAllies',value:4}]),
  card('u104','폭풍 매사냥꾼','unit','rare',2,'바람','storm-falconer',{hp:26,power:11},'소환: 다음 스펠 비용 -1.',[{op:'spellDiscount',value:1}]),
  card('u105','심층 잠수부','unit','rare',2,'물','deep-diver',{hp:37,power:8,block:5},'보스전에서 받는 플레이어 피해를 1 줄인다.',[],{aura:'bossGuard1'}),
  card('u106','번개 악사','unit','rare',2,'번개','thunder-bard',{hp:25,power:9},'2번째 공격마다 모든 적에게 3 피해.',[],{onAttack:'chainEvery2'}),
  card('u107','새벽 성직자','unit','rare',3,'빛','dawn-priest',{hp:36,power:7},'턴 종료: 아군 전체 체력 2 회복.',[],{onRound:'healAll2'}),
  card('u108','톱니 검객','unit','rare',2,'강철','gear-duelist',{hp:29,power:12},'적의 방어가 있으면 +6 피해.',[],{onAttack:'blockBonus6'}),
  card('u109','심야 추적자','unit','rare',2,'그림자','night-stalker',{hp:24,power:13},'첫 소환 턴에는 공격력이 2배.',[],{onAttack:'summonDouble'}),
  card('u110','백색 연금조','unit','rare',2,'바람','white-bird',{hp:27,power:9},'소환: 카드 1장, 에너지 1. 다음 턴 최대 에너지 -1.',[{op:'draw',value:1},{op:'energy',value:1},{op:'energyDebt',value:1}]),

  // ---- Rare spells --------------------------------------------------------
  card('s101','연쇄 번개','spell','rare',2,'번개','chain-lightning',{power:7},'모든 적에게 7 피해.',[{op:'damageAll',value:7}]),
  card('s102','전술 재정비','spell','rare',1,'강철','tactical-reset',{block:7},'2장 드로우. 방어 7.',[{op:'draw',value:2},{op:'block',value:7}]),
  card('s103','약점 노출','spell','rare',1,'그림자','expose-weakness',{},'적 하나에게 취약 2.',[{op:'vulnerable',value:2,target:'enemy'}]),
  card('s104','공명 회복','spell','rare',2,'빛','resonant-heal',{},'내 체력 12, 가장 체력이 낮은 동료 4 회복.',[{op:'heal',value:12,target:'self'},{op:'healLowestAlly',value:4}]),
  card('s105','마력 증폭','spell','rare',1,'별','arcane-amp',{},'이번 턴 다음 피해 카드 +8.',[{op:'nextAttack',value:8}]),
  card('s106','살얼음','spell','rare',1,'물','thin-ice',{power:6,block:6},'6 피해, 방어 6, 적 약화 1.',[{op:'damage',value:6,target:'enemy'},{op:'block',value:6},{op:'weak',value:1,target:'enemy'}]),
  card('s107','점멸','spell','rare',0,'시간','blink',{},'1장 드로우. 이번 턴 다음 카드 비용 -1.',[{op:'draw',value:1},{op:'anyDiscount',value:1}]),
  card('s108','가시 지대','spell','rare',2,'자연','thorn-field',{block:10},'방어 10. 이번 턴 피격 시 공격자에게 3 피해.',[{op:'block',value:10},{op:'thorns',value:3}]),

  // ---- Ultra rare ---------------------------------------------------------
  card('u201','천둥 왕실근위','unit','ultra',3,'번개','thunder-royal',{hp:43,power:15,block:6},'소환: 모든 적에게 감전 2.',[{op:'shockAll',value:2}]),
  card('u202','빙하의 성녀','unit','ultra',3,'물','glacier-saint',{hp:39,power:10,block:11},'턴 종료: 가장 체력이 낮은 아군 4 회복.',[],{onRound:'healLowest4'}),
  card('u203','시계탑 사수','unit','ultra',3,'시간','clock-sniper',{hp:32,power:16},'2번째 공격마다 추가 공격.',[],{onAttack:'extraEvery2'}),
  card('u204','공허 유랑자','unit','ultra',2,'공허','void-wanderer',{hp:29,power:13},'첫 적 처치 때 에너지 1.',[],{onAttack:'killEnergy'}),
  card('u205','성운 기수','unit','ultra',3,'별','nebula-rider',{hp:41,power:14,block:5},'소환: 아군 전체 다음 공격 +3.',[{op:'teamNextAttack',value:3}]),
  card('u206','거울 마녀','unit','ultra',3,'그림자','mirror-witch',{hp:34,power:12},'세 번째 스펠마다 그 스펠의 기본 피해를 한 번 더 준다.',[],{onSpell:'echoThird'}),
  card('s201','유성 낙하','spell','ultra',3,'별','meteor',{power:24},'적 하나 24, 나머지 적 6 피해.',[{op:'damage',value:24,target:'enemy'},{op:'damageOthers',value:6,target:'enemy'}]),
  card('s202','시간 절약','spell','ultra',1,'시간','time-save',{},'3장 드로우. 다음 스펠 비용 -1.',[{op:'draw',value:3},{op:'spellDiscount',value:1}]),
  card('s203','완전 방벽','spell','ultra',2,'수정','perfect-wall',{block:24},'방어 24. 이번 턴 디버프 면역.',[{op:'block',value:24},{op:'debuffImmune',value:1}]),
  card('s204','영혼 교환','spell','ultra',1,'공허','soul-exchange',{},'체력 5를 잃고 에너지 2.',[{op:'loseHp',value:5},{op:'energy',value:2}]),
  card('s205','폭풍의 눈','spell','ultra',2,'바람','storm-eye',{},'모든 적 약화 2. 2장 드로우.',[{op:'weakAll',value:2},{op:'draw',value:2}]),
  card('s206','태양의 서약','spell','ultra',2,'빛','sun-oath',{block:12},'방어 12. 아군 전체 체력 5 회복.',[{op:'block',value:12},{op:'healAllies',value:5}]),

  // ---- Legendary ----------------------------------------------------------
  card('u301','태양왕 아우렐','unit','legendary',4,'빛','sun-king',{hp:59,power:22,block:8},'소환: 내 모든 유닛 공격력 +3. 다음 스펠 비용 -1.',[{op:'buffUnits',value:3},{op:'spellDiscount',value:1}]),
  card('u302','검은 성운의 용','unit','legendary',5,'공허','black-nebula-dragon',{hp:72,power:26},'공격 시 다른 적들에게 40% 연쇄 피해.',[],{onAttack:'splash40'}),
  card('u303','영원의 설계자','unit','legendary',4,'시간','eternal-architect',{hp:53,power:18,block:12},'3번째 공격마다 모든 아군에게 방어 8.',[],{onAttack:'teamBlockEvery3'}),
  card('u304','천공의 무녀 레하','unit','legendary',4,'별','sky-oracle',{hp:50,power:19,block:8},'턴 종료: 카드 1장 드로우, 가장 약한 아군 6 회복.',[],{onRound:'oracle'}),
  card('s301','별을 가르는 칼날','spell','legendary',3,'별','star-cleaver',{power:38},'38 피해. 정예/보스에게 +12.',[{op:'bossDamage',value:38,bossBonus:12,target:'enemy'}]),
  card('s302','운명 재작성','spell','legendary',2,'시간','rewrite-fate',{},'손패를 전부 버리고 5장 드로우. 에너지 2.',[{op:'redraw',value:5},{op:'energy',value:2}]),
  card('s303','성역 개방','spell','legendary',3,'빛','open-sanctuary',{block:18},'아군 전체 방어 18, 체력 6 회복.',[{op:'blockAllies',value:18},{op:'healAllies',value:6}]),

  // ---- Mythic -------------------------------------------------------------
  card('u401','신화·창세의 관측자','unit','mythic',6,'별','genesis-observer',{hp:89,power:34,block:15},'소환: 적의 다음 행동 봉인, 아군 전체 방어 15. 2번째 공격마다 별의 파동.',[{op:'intentSealAll',value:1},{op:'blockAllies',value:15}],{onAttack:'mythicPulse'}),
  card('s401','신화·세계선 붕괴','spell','mythic',5,'시간','worldline-collapse',{power:64},'모든 적 64 피해. 적의 다음 공격 피해 50% 감소.',[{op:'damageAll',value:64},{op:'halveEnemyNext',value:1}]),
  card('u402','신화·심연의 첫 왕','unit','mythic',6,'공허','first-abyss-king',{hp:96,power:31,block:18},'소환: 취약 2를 모든 적에게. 보스 공격 시 +10.',[{op:'vulnerableAll',value:2}],{onAttack:'bossBonus10'}),

  // ---- Current rerun banner ----------------------------------------------
  limited(card('u501','복각·벚꽃 검성 세이라','unit','legendary',4,'자연','sakura-swordsaint',{hp:55,power:23,block:6},'소환: 2장 드로우. 공격할 때 20% 확률로 추가 공격.',[{op:'draw',value:2}],{onAttack:'extra20'})),
  limited(card('s501','복각·천화만개','spell','ultra',2,'자연','thousand-bloom',{power:18,block:10},'18 피해, 방어 10, 1장 드로우.',[{op:'damage',value:18,target:'enemy'},{op:'block',value:10},{op:'draw',value:1}])),
  limited(card('u502','복각·백야의 여왕','unit','mythic',6,'빛','white-night-queen',{hp:84,power:31,block:18},'소환: 아군 전체 체력 12 회복. 3번째 아군 스펠마다 적 전체 6 피해.',[{op:'healAllies',value:12}],{aura:'whiteNight'}))
];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const STARTER_POOL = ['u001','u002','u003','u004','s001','s002','s003','s004','s005','s006','s007','s008'];

function enemy(id,name,tier,hp,atk,skill,art,element='무'){
  return {id,name,tier,hp,atk,skill,art,element};
}
const ENEMIES = [
  enemy('m001','철이끼 슬라임','common',36,7,'철갑 점액','iron-moss','자연'),
  enemy('m002','균열 박쥐','common',29,9,'음파 찌르기','rift-bat','바람'),
  enemy('m003','고철 사냥개','common',42,8,'톱니 물기','scrap-hound','강철'),
  enemy('m004','서리 버섯','rare',49,10,'냉기 포자','frost-shroom','물'),
  enemy('m005','유적 감시자','rare',61,11,'감시 광선','ruin-watcher','별'),
  enemy('m006','잿빛 기사','rare',66,13,'재의 검','ash-knight','화염'),
  enemy('m007','별먹는 미믹','ultra',82,15,'탐욕의 이빨','star-mimic','공허'),
  enemy('m008','시간 포식자','ultra',90,17,'초침 절단','time-eater','시간'),
  enemy('m009','뇌광 사마귀','rare',55,14,'전광 절단','thunder-mantis','번개'),
  enemy('m010','유리날개 요정','rare',47,12,'결정 분진','glass-fae','수정'),
  enemy('m011','공허 벌레','common',38,10,'허기','void-grub','공허'),
  enemy('m012','해뜰 녘 사제','rare',58,9,'빛의 메아리','sun-priest','빛')
];
const BOSSES = [
  enemy('b001','심층의 문지기 아르고스','boss',285,20,'지각 붕괴','argus','수정'),
  enemy('b002','왕관 없는 용 세르카','boss',365,24,'종말의 숨결','serka','화염'),
  enemy('b003','공허 항해자 네메시스','boss',485,29,'무중력 파열','nemesis','공허')
];

const BIOMES = [
  {id:'verdant',name:'청록 초원',short:'VERDANT',sky:'#78a8ad',ground:'#395f57',accent:'#9ce2b1',desc:'낮은 유적과 초록 수정이 이어지는 입구 지대'},
  {id:'ember',name:'잿불 협곡',short:'EMBER',sky:'#8a5361',ground:'#442d36',accent:'#f1a164',desc:'화산재와 오래된 제련소가 남은 고열 지대'},
  {id:'frost',name:'유리 설원',short:'FROST',sky:'#7086a8',ground:'#35465f',accent:'#b8e5ff',desc:'얼음 장막이 시야와 전장을 바꾸는 설원'},
  {id:'astral',name:'별의 회랑',short:'ASTRAL',sky:'#554d86',ground:'#29294b',accent:'#cab8ff',desc:'고등급 카드의 흔적이 극히 드물게 출현하는 심층'},
  {id:'void',name:'검은 천구',short:'VOID',sky:'#342d4f',ground:'#171625',accent:'#cf76ff',desc:'공간 균열이 길을 뒤섞는 심연의 경계'},
  {id:'origin',name:'기원의 문',short:'ORIGIN',sky:'#8a7d6b',ground:'#3c352e',accent:'#ffdf9d',desc:'30층 최종 수호자가 기다리는 던전의 끝'}
];

const RELICS = [
  {id:'r001',name:'붉은 나침반',icon:'✦',text:'각 전투 첫 피해 카드 +4.',rarity:'common'},
  {id:'r002',name:'접이식 야영구',icon:'⌂',text:'휴식 회복량 +8.',rarity:'common'},
  {id:'r003',name:'은빛 봉인침',icon:'◇',text:'일반 여행 봉인 확률 +8%p.',rarity:'rare'},
  {id:'r004',name:'마력 축전기',icon:'⚡',text:'최대 에너지 +1, 최대 체력 -8.',rarity:'ultra'},
  {id:'r005',name:'별바다 왕관',icon:'♛',text:'보스전에서 유닛 공격력 +4.',rarity:'legendary'}
];
const RELIC_BY_ID = Object.fromEntries(RELICS.map(r=>[r.id,r]));

const BANNER = {
  id:'rerun-blooming-night-2026-09',
  name:'복각 · 천화와 백야',
  subtitle:'세이라 · 천화만개 · 백야의 여왕 확률 상승',
  endsAt:'2026-09-30T23:59:59+09:00',
  featured:['u501','s501','u502'],
  singleCost:100, tenCost:900,
  rates:{mythic:0.008,legendary:0.032,ultra:0.09,rare:0.26,common:0.61},
  pity:{legendary:60,mythic:120}
};

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function uid(prefix='x'){ return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function choose(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function weighted(items,weightFn){
  let sum=0; const rows=items.map(item=>{const w=Math.max(0,Number(weightFn(item)||0));sum+=w;return [item,w];});
  if(!sum) return rows[0]?.[0]; let r=Math.random()*sum;
  for(const [item,w] of rows){r-=w;if(r<=0)return item;} return rows.at(-1)?.[0];
}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function saveProfiles(){ const tmp=PROFILE_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(profiles,null,2)); fs.renameSync(tmp,PROFILE_FILE); }
function sanitizeName(s){return String(s||'방랑자').replace(/[<>]/g,'').replace(/\s+/g,' ').trim().slice(0,14)||'방랑자';}
function sanitizeText(s,n=80){return String(s||'').replace(/[<>]/g,'').trim().slice(0,n);}

function ensureProfile(profileId,nickname){
  let p=profiles[profileId];
  if(!p){
    p=profiles[profileId]={
      id:profileId,nickname:sanitizeName(nickname),createdAt:Date.now(),lastSeenAt:Date.now(),
      gems:1800,dust:0,seals:{basic:12,silver:5,royal:1},pity:{legendary:0,mythic:0},
      collection:{},deck:STARTER_POOL.slice(0,10),
      stats:{journeys:0,dungeons:0,dungeonClears:0,bosses:0,cardsCaught:0,bestDungeonFloor:0,bestJourneyFloor:0,gachaPulls:0}
    };
    for(const cid of STARTER_POOL) addCardToProfile(p,cid,1,false);
    saveProfiles();
  } else {
    p.nickname=sanitizeName(nickname||p.nickname); p.lastSeenAt=Date.now();
    p.gems=Number(p.gems||0);p.dust=Number(p.dust||0);p.seals=p.seals||{basic:0,silver:0,royal:0};p.pity=p.pity||{legendary:0,mythic:0};p.collection=p.collection||{};p.deck=Array.isArray(p.deck)?p.deck:STARTER_POOL.slice(0,10);p.stats=p.stats||{};
    const statDefaults={journeys:0,dungeons:0,dungeonClears:0,bosses:0,cardsCaught:0,bestDungeonFloor:0,bestJourneyFloor:0,gachaPulls:0};
    for(const [k,v] of Object.entries(statDefaults)) if(p.stats[k]==null)p.stats[k]=v;
  }
  return p;
}
function addCardToProfile(p,cardId,count=1,save=true){
  const c=CARD_BY_ID[cardId];if(!c)return;
  const old=Number(p.collection[cardId]||0);p.collection[cardId]=old+count;
  if(old>0)p.dust+=RARITY[c.rarity].dust*count;
  if(save)saveProfiles();
}
function profileView(p){
  return {id:p.id,nickname:p.nickname,gems:p.gems,dust:p.dust,seals:p.seals,pity:p.pity,collection:p.collection,deck:p.deck,stats:p.stats,ownedCount:Object.keys(p.collection).length,totalCards:CARDS.length};
}
function publicCard(c){return clone(c);}
function validDeck(deck){
  const d=(Array.isArray(deck)?deck:[]).filter(x=>CARD_BY_ID[x]);
  const base=d.length>=8?d:STARTER_POOL.slice(0,10);
  const out=[]; while(out.length<12)out.push(base[out.length%base.length]);
  return out.slice(0,20);
}

function newRunPlayer(p){
  let maxHp=84;const relics=[];
  return {playerId:p.id,nickname:p.nickname,maxHp,hp:maxHp,runDeck:validDeck(p.deck),relics,gold:0,cardsAdded:0};
}
function makeCombatant(run,index){
  const maxEnergy=3+(run.relics.includes('r004')?1:0);const maxHp=run.relics.includes('r004')?Math.max(50,run.maxHp-8):run.maxHp;
  const hp=Math.min(run.hp,maxHp); const pc={
    playerId:run.playerId,nickname:run.nickname,index,maxHp,hp,block:0,energy:maxEnergy,maxEnergy,
    drawPile:shuffle(run.runDeck),discard:[],exhaust:[],hand:[],units:[],ended:false,down:false,weak:0,
    buffs:{nextAttack:run.relics.includes('r001')?4:0,spellDiscount:0,anyDiscount:0,debuffImmune:false,thorns:0,nextUnitBlock:0,teamSpellCount:0,energyDebt:0},
    relics:run.relics.slice(),stats:{cardsPlayed:0,damage:0,healing:0}
  }; drawCards(pc,5); return pc;
}
function drawCards(pc,n){
  for(let i=0;i<n;i++){
    if(pc.hand.length>=10)return;
    if(!pc.drawPile.length){pc.drawPile=shuffle(pc.discard);pc.discard=[];}
    if(!pc.drawPile.length)return;pc.hand.push(pc.drawPile.shift());
  }
}

function makeRoom(hostProfile,mode='dungeon',name=''){
  let code;do code=String(Math.floor(100000+Math.random()*900000));while(rooms.has(code));
  const room={
    id:code,name:sanitizeText(name||`${hostProfile.nickname}의 원정대`,24),mode,hostId:hostProfile.id,createdAt:Date.now(),status:'lobby',
    maxPlayers:mode==='dungeon'?4:1,players:[{id:hostProfile.id,nickname:hostProfile.nickname,ready:true,joinedAt:Date.now()}],
    floor:0,biomeIndex:0,route:null,battle:null,reward:null,capture:null,event:null,runState:{},feed:[],seq:0,finalClearPending:false
  };
  rooms.set(code,room);pushRoomEvent(room,'room','방이 생성되었습니다.');return room;
}
function roomView(room){
  return clone({
    id:room.id,name:room.name,mode:room.mode,hostId:room.hostId,status:room.status,maxPlayers:room.maxPlayers,
    players:room.players,floor:room.floor,maxFloor:room.mode==='dungeon'?30:null,biomeIndex:room.biomeIndex,biome:BIOMES[room.biomeIndex%BIOMES.length],
    route:room.route,battle:room.battle,reward:room.reward,capture:room.capture,event:room.event,runState:room.runState,feed:room.feed.slice(-28),seq:room.seq,finalClearPending:room.finalClearPending
  });
}
function pushRoomEvent(room,type,message,payload={}){
  room.seq++;const ev={seq:room.seq,time:Date.now(),type,message,payload};room.feed.push(ev);if(room.feed.length>80)room.feed.shift();broadcast(room.id,'room-update',roomView(room));
}
function broadcast(roomId,event,data){const set=clientsByRoom.get(roomId);if(!set)return;const wire=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of set){try{res.write(wire);}catch{}}}
function playerName(room,id){return room.players.find(p=>p.id===id)?.nickname||'플레이어';}

function startRoom(room){
  if(room.status!=='lobby')throw new Error('이미 시작된 방입니다.');
  if(!room.players.length)throw new Error('플레이어가 없습니다.');
  room.runState={};
  for(const rp of room.players){const p=ensureProfile(rp.id,rp.nickname);room.runState[rp.id]=newRunPlayer(p);if(room.mode==='dungeon')p.stats.dungeons++;else p.stats.journeys++;}
  saveProfiles();room.floor=1;room.biomeIndex=0;room.status='route';makeRoute(room);pushRoomEvent(room,'start',room.mode==='journey'?'일반 여행을 시작했습니다. 카드 흔적을 찾아보세요.':'30층 협동 던전에 진입했습니다.');
}
function makeRoute(room){
  room.battle=null;room.reward=null;room.capture=null;room.event=null;
  const boss=room.floor%10===0;const elite=!boss&&room.floor%5===0;
  const kinds=boss?['boss']:elite?shuffle(['elite','rest','merchant']).slice(0,3):sampleKinds();
  room.route=kinds.map((kind,i)=>({id:`${room.floor}-${i}-${kind}`,kind,label:kindLabel(kind),icon:kindIcon(kind),desc:kindDesc(kind),votes:[]}));room.status='route';
}
function sampleKinds(){
  const pool=['combat','combat','combat','event','rest','treasure','merchant'];const out=[];
  while(out.length<3){const k=choose(pool);if(out.filter(x=>x===k).length<2)out.push(k);}return out;
}
function kindLabel(k){return ({combat:'전투',elite:'정예',boss:'보스',event:'미지의 사건',rest:'야영지',treasure:'보물',merchant:'유랑 상점'})[k]||k;}
function kindIcon(k){return ({combat:'⚔',elite:'☠',boss:'♛',event:'?',rest:'⌂',treasure:'◆',merchant:'₡'})[k]||'◆';}
function kindDesc(k){return ({combat:'카드와 프리즘을 얻는 일반 전투',elite:'강한 적. 초희귀 이상 보상 확률 상승',boss:'10층마다 등장하는 지역 수호자',event:'선택에 따라 보상 또는 위험 발생',rest:'체력 회복과 봉인구 보급',treasure:'전투 없이 재화·유물 획득 가능',merchant:'프리즘으로 이번 런에 쓸 카드·유물 구매'})[k]||'';}
function voteRoute(room,playerId,nodeId){
  if(room.status!=='route')throw new Error('현재 경로를 고를 수 없습니다.');const node=room.route.find(n=>n.id===nodeId);if(!node)throw new Error('경로가 없습니다.');
  room.route.forEach(n=>n.votes=n.votes.filter(x=>x!==playerId));node.votes.push(playerId);
  const votes=room.route.reduce((s,n)=>s+n.votes.length,0);
  if(votes>=room.players.length){const max=Math.max(...room.route.map(n=>n.votes.length));resolveNode(room,choose(room.route.filter(n=>n.votes.length===max)));}
  else pushRoomEvent(room,'vote',`${playerName(room,playerId)} 님이 경로에 투표했습니다.`);
}
function resolveNode(room,node){
  if(['combat','elite','boss'].includes(node.kind)){startBattle(room,node.kind);return;}
  if(node.kind==='rest'){
    for(const rp of room.players){const run=room.runState[rp.id];if(!run)continue;const bonus=run.relics.includes('r002')?8:0;run.hp=clamp(run.hp+Math.round(run.maxHp*0.28)+bonus,1,run.maxHp);const p=profiles[rp.id];p.seals.basic=(p.seals.basic||0)+1;}
    saveProfiles();room.reward={kind:'rest',title:'별빛 야영지',text:'체력을 회복하고 기본 봉인구 1개를 보급받았습니다.',options:[],claims:{},continueBy:[]};room.status='reward';pushRoomEvent(room,'rest','원정대가 야영지에서 숨을 고릅니다.');return;
  }
  if(node.kind==='treasure'){
    const gems=80+Math.floor(Math.random()*91);for(const rp of room.players)profiles[rp.id].gems+=gems;
    let relic=null;if(Math.random()<0.38){relic=choose(RELICS.filter(r=>r.rarity!=='legendary'));for(const rp of room.players)addRelic(room.runState[rp.id],relic.id);}
    saveProfiles();room.reward={kind:'treasure',title:'봉인된 금고',text:`각자 프리즘 ${gems}개${relic?`와 유물 「${relic.name}」`:''}를 발견했습니다.`,options:[],claims:{},continueBy:[]};room.status='reward';pushRoomEvent(room,'treasure','오래된 금고가 열렸습니다.');return;
  }
  if(node.kind==='merchant'){
    const shopCards=rewardCardOptions(5,'merchant').map(x=>({...x,price:cardPrice(CARD_BY_ID[x.cardId])}));
    const relic=choose(RELICS.slice(0,4));room.reward={kind:'merchant',title:'유랑 상점',text:'구매한 카드는 이번 런 덱과 컬렉션에 들어갑니다.',options:shopCards,relic:{...relic,price:240+RARITY[relic.rarity].order*90},claims:{},continueBy:[],purchased:{}};room.status='reward';pushRoomEvent(room,'merchant','등불을 든 상인이 길을 막아섰습니다.');return;
  }
  if(node.kind==='event'){
    room.event={id:uid('event'),title:'금이 간 거울문',text:'거울 너머에서 자신의 덱과 닮은 목소리가 들립니다. 위험을 감수하면 더 희귀한 카드를 얻을 수 있습니다.',choices:[
      {id:'safe',label:'조용히 지나간다',desc:'체력 8 회복'},
      {id:'risk',label:'거울 속으로 손을 넣는다',desc:'체력 12를 잃고 희귀 이상 카드 1장'},
      {id:'seal',label:'봉인구를 걸어 본다',desc:'기본 봉인구 1개를 소모해 유물 획득 시도'}
    ],chosenBy:{}};room.status='event';pushRoomEvent(room,'event','미지의 사건이 발생했습니다.');return;
  }
}
function cardPrice(c){return ({common:70,rare:120,ultra:230,legendary:520,mythic:980})[c.rarity]||100;}
function addRelic(run,relicId){if(!run||!RELIC_BY_ID[relicId]||run.relics.includes(relicId))return;run.relics.push(relicId);}
function chooseEvent(room,playerId,choiceId){
  if(room.status!=='event'||!room.event)throw new Error('사건 선택 단계가 아닙니다.');if(room.event.chosenBy[playerId])throw new Error('이미 선택했습니다.');const run=room.runState[playerId];const p=profiles[playerId];
  let message='';
  if(choiceId==='safe'){run.hp=clamp(run.hp+8,1,run.maxHp);message='거울문을 지나 체력 8을 회복했습니다.';}
  else if(choiceId==='risk'){run.hp=Math.max(1,run.hp-12);const c=weighted(CARDS.filter(c=>!c.limited&&c.rarity!=='common'),c=>RARITY[c.rarity].travelWeight);addCardToProfile(p,c.id,1,false);run.runDeck.push(c.id);run.cardsAdded++;message=`체력 12를 대가로 「${c.name}」 획득.`;}
  else if(choiceId==='seal'){if((p.seals.basic||0)<1)throw new Error('기본 봉인구가 없습니다.');p.seals.basic--;if(Math.random()<0.60){const r=choose(RELICS.slice(0,4));addRelic(run,r.id);message=`봉인 성공. 유물 「${r.name}」 획득.`;}else message='봉인이 튕겨 나갔습니다.';}
  else throw new Error('선택지가 없습니다.');
  room.event.chosenBy[playerId]=choiceId;saveProfiles();
  if(Object.keys(room.event.chosenBy).length>=room.players.length){room.reward={kind:'eventDone',title:'거울문을 통과했다',text:'모든 원정대원이 선택을 마쳤습니다.',options:[],claims:{},continueBy:[]};room.status='reward';}
  pushRoomEvent(room,'event-choice',`${playerName(room,playerId)}: ${message}`);
}

function startBattle(room,tier){
  room.status='battle';room.route=null;room.event=null;
  const party=room.players.map((p,i)=>makeCombatant(room.runState[p.id],i));const scale=Math.max(1,room.players.length);
  const enemyCount=tier==='boss'?1:tier==='elite'?Math.min(2,Math.max(1,scale-1)):Math.min(3,Math.max(1,Math.ceil(scale*0.78)));
  const enemies=[];
  for(let i=0;i<enemyCount;i++){
    let base;if(tier==='boss')base=clone(BOSSES[Math.min(BOSSES.length-1,Math.floor((room.floor-1)/10))]);
    else {let pool=ENEMIES.filter(e=>tier==='elite'?['rare','ultra'].includes(e.tier):(e.tier!=='ultra'||room.floor>=8));base=clone(choose(pool));}
    const floorScale=1+(room.floor-1)*0.047;const partyScale=1+(scale-1)*0.60;const eliteScale=tier==='elite'?1.20:1;
    base.uid=uid('enemy');base.maxHp=Math.round(base.hp*floorScale*partyScale*eliteScale);base.hp=base.maxHp;base.atk=Math.round(base.atk*(1+(room.floor-1)*0.021)*(1+(scale-1)*0.18)*(tier==='elite'?1.08:1));base.block=0;base.debuffs={weak:0,vulnerable:0,burn:0,shock:0,intentSeal:0};base.nextDamageHalf=false;base.intent=rollIntent(base,tier);base.counter=0;enemies.push(base);
  }
  room.battle={tier,turn:1,phase:'players',party,enemies,log:[],teamSpellCount:0};battleLog(room,`${tier==='boss'?'보스':tier==='elite'?'정예':'적'} 조우!`);pushRoomEvent(room,'battle-start','전투가 시작되었습니다.');
}
function rollIntent(e,tier){
  const r=Math.random();const heavy=Math.round(e.atk*(tier==='boss'?1.72:1.5));
  if(r<0.55)return {type:'attack',value:e.atk,icon:'⚔',text:`공격 ${e.atk}`};
  if(r<0.73){const v=Math.max(5,Math.round(e.atk*0.78));return {type:'guard',value:v,icon:'▣',text:`방어 ${v}`};}
  if(r<0.88)return {type:'debuff',value:1,icon:'☣',text:'약화 1'};
  return {type:'heavy',value:heavy,icon:'✹',text:`강공 ${heavy}`};
}
function battleLog(room,text){if(!room.battle)return;room.battle.log.push({time:Date.now(),text});if(room.battle.log.length>70)room.battle.log.shift();}
function getPc(room,playerId){return room.battle?.party.find(x=>x.playerId===playerId);}
function aliveEnemies(room){return room.battle?.enemies.filter(x=>x.hp>0)||[];}
function resolveCost(pc,c){let cost=c.cost;if(pc.buffs.anyDiscount>0){cost=Math.max(0,cost-1);pc.buffs.anyDiscount--;}else if(c.type==='spell'&&pc.buffs.spellDiscount>0){cost=Math.max(0,cost-1);pc.buffs.spellDiscount--;}return cost;}
function playCard(room,playerId,handIndex,targetUid){
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('카드를 사용할 차례가 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');
  const index=Number(handIndex);const cid=pc.hand[index];const c=CARD_BY_ID[cid];if(!c)throw new Error('카드가 없습니다.');const previewCost=Math.max(0,c.cost-(pc.buffs.anyDiscount>0?1:(c.type==='spell'&&pc.buffs.spellDiscount>0?1:0)));if(pc.energy<previewCost)throw new Error('에너지가 부족합니다.');if(c.type==='unit'&&pc.units.length>=3)throw new Error('유닛 슬롯은 3칸입니다.');
  const cost=resolveCost(pc,c);pc.energy-=cost;pc.hand.splice(index,1);pc.stats.cardsPlayed++;const target=aliveEnemies(room).find(e=>e.uid===targetUid)||aliveEnemies(room)[0];
  if(c.type==='unit')summonUnit(room,pc,c,target);else castSpell(room,pc,c,target);pc.discard.push(cid);
  if(checkBattleEnd(room))return;pushRoomEvent(room,'card',`${pc.nickname}: ${c.name}`);
}
function summonUnit(room,pc,c,target){
  const u={instanceId:uid('unit'),cardId:c.id,name:c.name,art:c.art,element:c.element,hp:c.hp,maxHp:c.hp,power:c.power,block:c.block||0,counter:0,summonedTurn:room.battle.turn};if(pc.buffs.nextUnitBlock){u.block+=pc.buffs.nextUnitBlock;pc.buffs.nextUnitBlock=0;}pc.units.push(u);
  applyEffects(room,pc,c.effects,target,c);
  if(c.unit.onSummon==='unitGuard')pc.units.forEach(x=>x.block+=2);
  battleLog(room,`${pc.nickname}이(가) ${c.name}을 소환.`);
}
function castSpell(room,pc,c,target){
  room.battle.teamSpellCount++;applyEffects(room,pc,c.effects,target,c);
  for(const ally of room.battle.party.filter(x=>!x.down))for(const u of ally.units){const def=CARD_BY_ID[u.cardId];if(def?.unit?.onSpell==='ping2'){const e=choose(aliveEnemies(room));if(e)applyDamage(e,2);}if(def?.unit?.onSpell==='echoThird'&&room.battle.teamSpellCount%3===0&&c.power>0&&target)applyDamage(target,Math.max(1,Math.round(c.power*0.55)));if(def?.unit?.aura==='whiteNight'&&room.battle.teamSpellCount%3===0)aliveEnemies(room).forEach(e=>applyDamage(e,6));}
  battleLog(room,`${pc.nickname}이(가) ${c.name} 사용.`);
}
function applyEffects(room,pc,effects,target,source){
  const b=room.battle;
  for(const fx of effects||[]){
    const v=Number(fx.value||0);let bonus=0;
    if(['damage','damageAll','damageOthers','bossDamage'].includes(fx.op)&&pc.buffs.nextAttack>0){bonus=pc.buffs.nextAttack;pc.buffs.nextAttack=0;}
    if(fx.op==='damage'&&target)pc.stats.damage+=applyDamage(target,v+bonus);
    else if(fx.op==='damageAll')aliveEnemies(room).forEach(e=>pc.stats.damage+=applyDamage(e,v+bonus));
    else if(fx.op==='damageOthers')aliveEnemies(room).filter(e=>e!==target).forEach(e=>pc.stats.damage+=applyDamage(e,v));
    else if(fx.op==='bossDamage'&&target)pc.stats.damage+=applyDamage(target,v+bonus+(['elite','boss'].includes(b.tier)?Number(fx.bossBonus||0):0));
    else if(fx.op==='block')pc.block+=v;
    else if(fx.op==='blockAllies')b.party.filter(x=>!x.down).forEach(x=>x.block+=v);
    else if(fx.op==='heal'){const before=pc.hp;pc.hp=clamp(pc.hp+v,0,pc.maxHp);pc.stats.healing+=pc.hp-before;}
    else if(fx.op==='healLowestAlly'){const x=b.party.filter(x=>!x.down&&x.playerId!==pc.playerId).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp)[0];if(x)x.hp=clamp(x.hp+v,0,x.maxHp);}
    else if(fx.op==='healAllies')b.party.filter(x=>!x.down).forEach(x=>x.hp=clamp(x.hp+v,0,x.maxHp));
    else if(fx.op==='draw')drawCards(pc,v);
    else if(fx.op==='energy')pc.energy+=v;
    else if(fx.op==='loseHp')pc.hp=Math.max(1,pc.hp-v);
    else if(fx.op==='vulnerable'&&target)target.debuffs.vulnerable+=v;
    else if(fx.op==='vulnerableAll')aliveEnemies(room).forEach(e=>e.debuffs.vulnerable+=v);
    else if(fx.op==='weak'&&target)target.debuffs.weak+=v;
    else if(fx.op==='weakAll')aliveEnemies(room).forEach(e=>e.debuffs.weak+=v);
    else if(fx.op==='burn'&&target)target.debuffs.burn+=v;
    else if(fx.op==='shockAll')aliveEnemies(room).forEach(e=>e.debuffs.shock+=v);
    else if(fx.op==='intentSealAll')aliveEnemies(room).forEach(e=>e.debuffs.intentSeal+=v);
    else if(fx.op==='spellDiscount')pc.buffs.spellDiscount+=v;
    else if(fx.op==='anyDiscount')pc.buffs.anyDiscount+=v;
    else if(fx.op==='nextAttack')pc.buffs.nextAttack+=v;
    else if(fx.op==='teamNextAttack')b.party.filter(x=>!x.down).forEach(x=>x.buffs.nextAttack+=v);
    else if(fx.op==='buffUnits')pc.units.forEach(u=>u.power+=v);
    else if(fx.op==='debuffImmune')pc.buffs.debuffImmune=true;
    else if(fx.op==='cleanseWeak')pc.weak=Math.max(0,pc.weak-v);
    else if(fx.op==='nextUnitBlock')pc.buffs.nextUnitBlock+=v;
    else if(fx.op==='thorns')pc.buffs.thorns=Math.max(pc.buffs.thorns,v);
    else if(fx.op==='redraw'){pc.discard.push(...pc.hand);pc.hand=[];drawCards(pc,v);}
    else if(fx.op==='halveEnemyNext')aliveEnemies(room).forEach(e=>e.nextDamageHalf=true);
    else if(fx.op==='energyDebt')pc.buffs.energyDebt+=v;
  }
}
function applyDamage(e,amount){
  let d=Math.max(0,Math.round(amount));if(e.debuffs?.vulnerable>0)d=Math.round(d*1.5);if(e.debuffs?.shock>0)d+=Math.min(6,e.debuffs.shock);const blocked=Math.min(e.block||0,d);e.block=(e.block||0)-blocked;d-=blocked;e.hp=clamp(e.hp-d,0,e.maxHp);return d;
}
function damagePc(room,pc,amount,enemy){
  let d=Math.max(0,Math.round(amount));if(pc.weak>0)d=Math.round(d*1.05);const blocked=Math.min(pc.block,d);pc.block-=blocked;d-=blocked;pc.hp=clamp(pc.hp-d,0,pc.maxHp);if(d>0&&pc.buffs.thorns>0&&enemy)applyDamage(enemy,pc.buffs.thorns);if(pc.hp<=0){pc.down=true;pc.ended=true;}return d;
}
function endTurn(room,playerId){
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('전투 중이 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down)return;pc.ended=true;battleLog(room,`${pc.nickname} 준비 완료.`);const active=b.party.filter(x=>!x.down);if(active.length&&active.every(x=>x.ended))enemyTurn(room);else pushRoomEvent(room,'end-turn',`${pc.nickname} 님이 턴을 종료했습니다.`);
}
function enemyTurn(room){
  const b=room.battle;b.phase='enemies';
  // Summoned units attack together after all players finish planning.
  for(const pc of b.party.filter(x=>!x.down)){
    for(const u of pc.units){
      let target=aliveEnemies(room)[0];if(!target)break;let power=u.power;const def=CARD_BY_ID[u.cardId];const hook=def?.unit?.onAttack;u.counter++;
      if(hook==='weakBonus5'&&target.debuffs.weak>0)power+=5;if(hook==='fullBonus'&&target.hp===target.maxHp)power+=3;if(hook==='firstBonus4'&&u.counter===1)power+=4;if(hook==='blockBonus6'&&target.block>0)power+=6;if(hook==='summonDouble'&&u.summonedTurn===b.turn)power*=2;if(hook==='bossBonus10'&&b.tier==='boss')power+=10;if(pc.relics.includes('r005')&&b.tier==='boss')power+=4;
      if(target.debuffs.weak>0)power=Math.round(power*0.92);const dealt=applyDamage(target,power);pc.stats.damage+=dealt;battleLog(room,`${u.name} → ${target.name} ${dealt} 피해.`);
      if(hook==='weak25'&&Math.random()<0.25)target.debuffs.weak++;
      if(hook==='chainEvery2'&&u.counter%2===0)aliveEnemies(room).forEach(e=>applyDamage(e,3));
      if(hook==='extraEvery2'&&u.counter%2===0&&target.hp>0)pc.stats.damage+=applyDamage(target,power);
      if(hook==='extra20'&&Math.random()<0.20&&target.hp>0)pc.stats.damage+=applyDamage(target,power);
      if(hook==='splash40')aliveEnemies(room).filter(e=>e!==target).forEach(e=>pc.stats.damage+=applyDamage(e,power*0.4));
      if(hook==='teamBlockEvery3'&&u.counter%3===0)b.party.filter(x=>!x.down).forEach(x=>x.block+=8);
      if(hook==='mythicPulse'&&u.counter%2===0)aliveEnemies(room).forEach(e=>applyDamage(e,12));
      if(hook==='killEnergy'&&target.hp<=0&&!u.killPaid){pc.energy++;u.killPaid=true;}
      if(checkBattleEnd(room))return;
    }
  }
  for(const e of aliveEnemies(room)){
    e.counter++;
    if(e.debuffs.burn>0){const d=applyDamage(e,e.debuffs.burn);e.debuffs.burn=Math.max(0,e.debuffs.burn-1);battleLog(room,`${e.name} 화상 ${d}.`);if(e.hp<=0){if(checkBattleEnd(room))return;continue;}}
    if(e.debuffs.intentSeal>0){e.debuffs.intentSeal--;battleLog(room,`${e.name}의 행동이 봉인됨.`);e.intent=rollIntent(e,b.tier);continue;}
    const targets=b.party.filter(x=>!x.down);if(!targets.length)break;const t=choose(targets);
    if(['attack','heavy'].includes(e.intent.type)){
      let amount=e.intent.value;if(e.debuffs.weak>0)amount=Math.round(amount*0.75);if(e.nextDamageHalf){amount=Math.round(amount*0.5);e.nextDamageHalf=false;}
      const bossGuard=t.units.filter(u=>CARD_BY_ID[u.cardId]?.unit?.aura==='bossGuard1').length;if(b.tier==='boss')amount=Math.max(0,amount-bossGuard);const d=damagePc(room,t,amount,e);battleLog(room,`${e.name} → ${t.nickname} ${d} 피해.`);
    } else if(e.intent.type==='guard'){e.block+=e.intent.value;battleLog(room,`${e.name} 방어 ${e.intent.value}.`);} else if(e.intent.type==='debuff'){if(!t.buffs.debuffImmune){t.weak++;battleLog(room,`${t.nickname} 약화 1.`);}}
    e.debuffs.vulnerable=Math.max(0,e.debuffs.vulnerable-1);e.debuffs.weak=Math.max(0,e.debuffs.weak-1);e.intent=rollIntent(e,b.tier);
  }
  if(checkBattleEnd(room))return;if(b.party.every(x=>x.down))return loseBattle(room);
  b.turn++;
  for(const pc of b.party){
    if(pc.down)continue;pc.block=0;pc.energy=Math.max(1,pc.maxEnergy-(pc.buffs.energyDebt>0?1:0));pc.buffs.energyDebt=Math.max(0,pc.buffs.energyDebt-1);pc.ended=false;pc.buffs.debuffImmune=false;pc.buffs.thorns=0;pc.weak=Math.max(0,pc.weak-1);pc.discard.push(...pc.hand);pc.hand=[];drawCards(pc,5);
    for(const u of pc.units){const h=CARD_BY_ID[u.cardId]?.unit?.onRound;if(h==='healLowest2'){const x=b.party.filter(x=>!x.down).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp)[0];if(x)x.hp=clamp(x.hp+2,0,x.maxHp);}if(h==='healLowest4'){const x=b.party.filter(x=>!x.down).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp)[0];if(x)x.hp=clamp(x.hp+4,0,x.maxHp);}if(h==='healAll2')b.party.filter(x=>!x.down).forEach(x=>x.hp=clamp(x.hp+2,0,x.maxHp));if(h==='oracle'){drawCards(pc,1);const x=b.party.filter(x=>!x.down).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp)[0];if(x)x.hp=clamp(x.hp+6,0,x.maxHp);}}
  }
  b.phase='players';pushRoomEvent(room,'turn',`턴 ${b.turn} 시작.`);
}
function checkBattleEnd(room){const b=room.battle;if(!b)return false;if(b.enemies.every(e=>e.hp<=0)){winBattle(room);return true;}if(b.party.every(p=>p.down)){loseBattle(room);return true;}return false;}
function syncRunHealth(room){if(!room.battle)return;for(const pc of room.battle.party){const run=room.runState[pc.playerId];if(run)run.hp=pc.hp<=0?Math.max(1,Math.round(run.maxHp*0.25)):Math.min(run.maxHp,pc.hp);}}
function winBattle(room){
  const b=room.battle;syncRunHealth(room);const boss=b.tier==='boss';const gems=(boss?260:b.tier==='elite'?125:50)+room.floor*4;
  for(const rp of room.players){const p=profiles[rp.id];p.gems+=gems;if(boss)p.stats.bosses++;const key=room.mode==='dungeon'?'bestDungeonFloor':'bestJourneyFloor';p.stats[key]=Math.max(p.stats[key]||0,room.floor);}saveProfiles();
  const options=rewardCardOptions(boss?4:3,b.tier);room.finalClearPending=room.mode==='dungeon'&&room.floor===30;
  room.reward={kind:'battle',title:room.finalClearPending?'최종 수호자 격파!':boss?'보스 격파!':'전투 승리',text:`프리즘 ${gems}개 획득. 각자 카드 1장을 선택할 수 있습니다.`,options,claims:{},continueBy:[]};
  if(room.mode==='journey'&&Math.random()<(boss?0.62:b.tier==='elite'?0.37:0.25))room.capture=makeCaptureEncounter(room.floor,b.tier);room.status='reward';battleLog(room,'승리!');pushRoomEvent(room,'win','전투에서 승리했습니다.');
}
function loseBattle(room){syncRunHealth(room);room.status='ended';room.reward={kind:'defeat',title:'원정 실패',text:`${room.floor}층에서 탐험이 종료되었습니다. 영구 획득한 카드와 재화는 유지됩니다.`,options:[],claims:{},continueBy:[]};pushRoomEvent(room,'defeat','원정대가 쓰러졌습니다.');}
function rewardCardOptions(n,tier='combat'){
  const pool=CARDS.filter(c=>!c.limited);const out=[];let guard=0;
  while(out.length<n&&guard++<200){const c=weighted(pool,c=>{let w=RARITY[c.rarity].travelWeight;if(tier==='elite'&&c.rarity==='ultra')w*=3.4;if(tier==='boss'&&c.rarity==='ultra')w*=5;if(tier==='boss'&&c.rarity==='legendary')w*=12;if(tier==='merchant'&&['rare','ultra'].includes(c.rarity))w*=2;if(c.rarity==='mythic')w*=tier==='boss'?0.9:0.25;return w;});if(c&&!out.some(x=>x.cardId===c.id))out.push({id:uid('reward'),cardId:c.id,label:c.name,card:publicCard(c)});}return out;
}
function makeCaptureEncounter(floor,tier){
  const pool=CARDS.filter(c=>!c.limited);const c=weighted(pool,c=>{let w=RARITY[c.rarity].travelWeight;if(floor<10&&c.rarity==='legendary')w*=0.12;if(floor<20&&c.rarity==='mythic')w*=0.03;if(tier==='elite'&&['ultra','legendary'].includes(c.rarity))w*=2;if(tier==='boss'&&['ultra','legendary','mythic'].includes(c.rarity))w*=3.2;return w;});return {id:uid('echo'),cardId:c.id,card:publicCard(c),attemptedBy:[],escaped:false,caughtBy:null};
}
function claimReward(room,playerId,rewardId){
  if(room.status!=='reward'||!room.reward)throw new Error('보상 단계가 아닙니다.');if(!room.reward.options?.length)throw new Error('선택형 카드 보상이 없습니다.');if(room.reward.claims[playerId])throw new Error('이미 보상을 선택했습니다.');const opt=room.reward.options.find(x=>x.id===rewardId);if(!opt)throw new Error('보상이 없습니다.');const p=profiles[playerId];const run=room.runState[playerId];addCardToProfile(p,opt.cardId,1,false);if(run&&run.runDeck.length<30){run.runDeck.push(opt.cardId);run.cardsAdded++;}room.reward.claims[playerId]=opt.cardId;saveProfiles();pushRoomEvent(room,'reward',`${p.nickname} 님이 ${CARD_BY_ID[opt.cardId].name} 획득.`);
}
function buyReward(room,playerId,itemId,itemType='card'){
  if(room.status!=='reward'||room.reward?.kind!=='merchant')throw new Error('상점이 아닙니다.');const p=profiles[playerId];const run=room.runState[playerId];const key=`${playerId}:${itemType}:${itemId}`;if(room.reward.purchased[key])throw new Error('이미 구매했습니다.');
  if(itemType==='relic'){const r=room.reward.relic;if(!r||r.id!==itemId)throw new Error('유물이 없습니다.');if(p.gems<r.price)throw new Error('프리즘이 부족합니다.');p.gems-=r.price;addRelic(run,r.id);room.reward.purchased[key]=true;saveProfiles();pushRoomEvent(room,'buy',`${p.nickname}: 유물 ${r.name} 구매.`);return;}
  const opt=room.reward.options.find(x=>x.cardId===itemId);if(!opt)throw new Error('상품이 없습니다.');if(p.gems<opt.price)throw new Error('프리즘이 부족합니다.');p.gems-=opt.price;addCardToProfile(p,opt.cardId,1,false);if(run.runDeck.length<30)run.runDeck.push(opt.cardId);room.reward.purchased[key]=true;saveProfiles();pushRoomEvent(room,'buy',`${p.nickname}: ${CARD_BY_ID[opt.cardId].name} 구매.`);
}
function continueAfterReward(room,playerId){
  if(room.status!=='reward')throw new Error('진행할 수 없습니다.');if(room.reward.kind==='battle'&&room.reward.options?.length&&!room.reward.claims?.[playerId])throw new Error('먼저 카드 보상 1장을 선택해 주세요.');room.reward.continueBy=room.reward.continueBy||[];if(!room.reward.continueBy.includes(playerId))room.reward.continueBy.push(playerId);if(room.reward.continueBy.length>=room.players.length)advanceFloor(room);else pushRoomEvent(room,'continue',`${playerName(room,playerId)} 님이 다음 층 준비 완료.`);
}
function advanceFloor(room){
  if(room.finalClearPending){room.status='cleared';room.finalClearPending=false;for(const rp of room.players){const p=profiles[rp.id];p.stats.dungeonClears++;p.gems+=600;}saveProfiles();room.reward={kind:'clear',title:'심연 원정 완료',text:'30층을 돌파했습니다. 원정대 전원에게 클리어 보너스 프리즘 600개 지급.',options:[],claims:{},continueBy:[]};pushRoomEvent(room,'clear','30층 협동 던전을 클리어했습니다!');return;}
  room.floor++;room.biomeIndex=room.mode==='dungeon'?Math.min(BIOMES.length-1,Math.floor((room.floor-1)/5)):Math.floor((room.floor-1)/10)%BIOMES.length;makeRoute(room);pushRoomEvent(room,'floor',`${room.floor}층으로 이동합니다.`);
}
function attemptCapture(room,playerId,sealType){
  if(room.mode!=='journey'||room.status!=='reward'||!room.capture||room.capture.escaped)throw new Error('봉인할 카드 흔적이 없습니다.');const cap=room.capture;if(cap.attemptedBy.includes(playerId))throw new Error('이 흔적에는 이미 시도했습니다.');const p=profiles[playerId];const run=room.runState[playerId];const seal=String(sealType||'basic');const mult={basic:1,silver:1.7,royal:3.25}[seal];if(!mult)throw new Error('봉인구 종류 오류');if((p.seals[seal]||0)<=0)throw new Error('봉인구가 없습니다.');p.seals[seal]--;cap.attemptedBy.push(playerId);
  const c=CARD_BY_ID[cap.cardId];let chance=RARITY[c.rarity].sealBase*mult;if(run?.relics.includes('r003'))chance+=0.08;chance=Math.min(c.rarity==='mythic'?0.24:c.rarity==='legendary'?0.48:0.95,chance);const success=Math.random()<chance;
  if(success){addCardToProfile(p,c.id,1,false);if(run.runDeck.length<30)run.runDeck.push(c.id);p.stats.cardsCaught++;cap.caughtBy=playerId;cap.escaped=true;saveProfiles();pushRoomEvent(room,'capture',`${c.name} 봉인 성공!`);}else{if(Math.random()<0.40)cap.escaped=true;saveProfiles();pushRoomEvent(room,'capture-fail',cap.escaped?`${c.name}의 흔적이 사라졌습니다.`:`${c.name} 봉인 실패. 아직 흔적이 남았습니다.`);}return {success,chance,escaped:cap.escaped};
}

function rarityRoll(profile){
  profile.pity.legendary++;profile.pity.mythic++;let rarity;const r=Math.random();
  if(profile.pity.mythic>=BANNER.pity.mythic){rarity='mythic';profile.pity.mythic=0;profile.pity.legendary=0;}
  else if(profile.pity.legendary>=BANNER.pity.legendary){rarity='legendary';profile.pity.legendary=0;}
  else if(r<BANNER.rates.mythic)rarity='mythic';
  else if(r<BANNER.rates.mythic+BANNER.rates.legendary)rarity='legendary';
  else if(r<BANNER.rates.mythic+BANNER.rates.legendary+BANNER.rates.ultra)rarity='ultra';
  else if(r<BANNER.rates.mythic+BANNER.rates.legendary+BANNER.rates.ultra+BANNER.rates.rare)rarity='rare';
  else rarity='common';return rarity;
}
function pullGacha(profile,count){
  const n=Number(count)===10?10:1;const cost=n===10?BANNER.tenCost:BANNER.singleCost;if(profile.gems<cost)throw new Error('프리즘이 부족합니다.');profile.gems-=cost;const results=[];
  for(let i=0;i<n;i++){const rarity=rarityRoll(profile);const pool=CARDS.filter(c=>c.rarity===rarity);const featured=pool.filter(c=>c.limited&&BANNER.featured.includes(c.id));const regular=pool.filter(c=>!c.limited);let c;if(featured.length&&Math.random()<0.55)c=choose(featured);else c=choose(regular.length?regular:pool);addCardToProfile(profile,c.id,1,false);results.push(publicCard(c));profile.stats.gachaPulls++;}saveProfiles();return {results,cost,profile:profileView(profile)};
}

function parseBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>1024*1024){reject(new Error('payload too large'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('잘못된 JSON'));}});});}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function ok(res,data={}){json(res,200,{ok:true,...data});}
function fail(res,status,message){json(res,status,{ok:false,error:message});}
function serveStatic(res,pathname){
  const target=pathname==='/'?'/index.html':pathname;const full=path.normalize(path.join(PUBLIC,target));if(!full.startsWith(PUBLIC))return fail(res,403,'forbidden');
  fs.readFile(full,(err,data)=>{if(err){if(!path.extname(target))return serveStatic(res,'/index.html');res.writeHead(404);return res.end('Not found');}const ext=path.extname(full).toLowerCase();const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':ext==='.html'?'no-store':'public, max-age=3600','X-Content-Type-Options':'nosniff'});res.end(data);});
}
function authProfile(body){const pid=String(body.profileId||'').trim();if(!pid||pid.length>96)throw new Error('프로필 ID가 필요합니다.');return ensureProfile(pid,body.nickname);}
function assertMember(room,pid){if(!room.players.some(x=>x.id===pid))throw new Error('방 참가자가 아닙니다.');}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);const p=u.pathname;
    if(p==='/healthz')return ok(res,{service:'RIFT_DECK_SERVER',rooms:rooms.size,uptime:Math.round(process.uptime())});
    if(p==='/api/meta'&&req.method==='GET')return ok(res,{cards:CARDS.map(publicCard),rarities:RARITY,elements:ELEMENTS,biomes:BIOMES,relics:RELICS,banner:BANNER,version:'1.0.0'});
    if(p==='/api/profile'&&req.method==='POST'){const b=await parseBody(req);const prof=authProfile(b);saveProfiles();return ok(res,{profile:profileView(prof)});}
    if(p==='/api/deck'&&req.method==='POST'){const b=await parseBody(req);const prof=authProfile(b);const seen=new Set();const deck=(Array.isArray(b.deck)?b.deck:[]).filter(cid=>CARD_BY_ID[cid]&&prof.collection[cid]>0&&!seen.has(cid)&&seen.add(cid)).slice(0,16);if(deck.length<8)throw new Error('덱은 보유 카드 8~16종으로 구성해 주세요.');prof.deck=deck;saveProfiles();return ok(res,{profile:profileView(prof)});}
    if(p==='/api/gacha/pull'&&req.method==='POST'){const b=await parseBody(req);const prof=authProfile(b);return ok(res,pullGacha(prof,b.count));}
    if(p==='/api/rooms'&&req.method==='GET'){const list=[...rooms.values()].filter(r=>r.mode==='dungeon'&&r.status==='lobby'&&r.players.length<r.maxPlayers).map(r=>({id:r.id,name:r.name,players:r.players.length,maxPlayers:r.maxPlayers,host:r.players[0]?.nickname,createdAt:r.createdAt}));return ok(res,{rooms:list});}
    if(p==='/api/rooms/create'&&req.method==='POST'){const b=await parseBody(req);const prof=authProfile(b);const room=makeRoom(prof,b.mode==='journey'?'journey':'dungeon',b.name);return ok(res,{room:roomView(room)});}
    if(p==='/api/rooms/join'&&req.method==='POST'){const b=await parseBody(req);const prof=authProfile(b);const room=rooms.get(String(b.roomId||''));if(!room)throw new Error('방을 찾을 수 없습니다.');if(room.status!=='lobby')throw new Error('이미 시작된 방입니다.');if(room.players.length>=room.maxPlayers&&!room.players.some(x=>x.id===prof.id))throw new Error('방이 가득 찼습니다.');if(!room.players.some(x=>x.id===prof.id))room.players.push({id:prof.id,nickname:prof.nickname,ready:true,joinedAt:Date.now()});pushRoomEvent(room,'join',`${prof.nickname} 님이 참가했습니다.`);return ok(res,{room:roomView(room)});}
    const m=p.match(/^\/api\/room\/(\d{6})(?:\/(.*))?$/);
    if(m){
      const room=rooms.get(m[1]);if(!room)return fail(res,404,'방을 찾을 수 없습니다.');const action=m[2]||'';
      if(!action&&req.method==='GET')return ok(res,{room:roomView(room)});
      if(action==='stream'&&req.method==='GET'){
        const pid=u.searchParams.get('profileId');assertMember(room,pid);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write(`event: room-update\ndata: ${JSON.stringify(roomView(room))}\n\n`);if(!clientsByRoom.has(room.id))clientsByRoom.set(room.id,new Set());clientsByRoom.get(room.id).add(res);req.on('close',()=>clientsByRoom.get(room.id)?.delete(res));return;
      }
      if(req.method==='POST'){
        const b=await parseBody(req);const prof=authProfile(b);assertMember(room,prof.id);
        if(action==='start'){if(room.hostId!==prof.id)throw new Error('방장만 시작할 수 있습니다.');startRoom(room);return ok(res,{room:roomView(room)});}
        if(action==='vote'){voteRoute(room,prof.id,b.nodeId);return ok(res,{room:roomView(room)});}
        if(action==='play'){playCard(room,prof.id,b.handIndex,b.targetUid);return ok(res,{room:roomView(room)});}
        if(action==='end-turn'){endTurn(room,prof.id);return ok(res,{room:roomView(room)});}
        if(action==='event'){chooseEvent(room,prof.id,b.choiceId);return ok(res,{room:roomView(room),profile:profileView(profiles[prof.id])});}
        if(action==='reward'){claimReward(room,prof.id,b.rewardId);return ok(res,{room:roomView(room),profile:profileView(profiles[prof.id])});}
        if(action==='buy'){buyReward(room,prof.id,b.itemId,b.itemType);return ok(res,{room:roomView(room),profile:profileView(profiles[prof.id])});}
        if(action==='continue'){continueAfterReward(room,prof.id);return ok(res,{room:roomView(room)});}
        if(action==='capture'){const result=attemptCapture(room,prof.id,b.sealType);return ok(res,{result,room:roomView(room),profile:profileView(profiles[prof.id])});}
      }
    }
    if(p.startsWith('/api/'))return fail(res,404,'API route not found');return serveStatic(res,p);
  }catch(err){return fail(res,400,err.message||'request failed');}
});

setInterval(()=>{
  for(const set of clientsByRoom.values())for(const res of set){try{res.write(': ping\n\n');}catch{}}
  const now=Date.now();for(const [id,r] of rooms)if(now-r.createdAt>ROOM_TTL){rooms.delete(id);clientsByRoom.delete(id);}
},15000).unref();

server.listen(PORT,HOST,()=>console.log(`[RIFT DECK] dynamic server listening on http://${HOST}:${PORT}`));
