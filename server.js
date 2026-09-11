'use strict';

/**
 * RIFT DECK: ABYSS EXPEDITION v4.1
 * Dynamic, server-authoritative browser card roguelite.
 *
 * Design goals:
 * - 1-4 player synchronous co-op rooms
 * - 50-floor dungeon with three difficulty levels
 * - captured-monster party combat commanded and evolved through spell cards
 * - after EVERY dungeon floor, each player drafts one free card OR run item
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
const VERSION = '4.1.0';
const DEPLOY_ID = 'RIFT-V4.1.0-ACTIVE-MONSTER-BATTLE-20260911';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ADMIN_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const SUPABASE_PUBLIC_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '');
const SUPABASE_ACTIVE = Boolean(SUPABASE_URL && SUPABASE_ADMIN_KEY);
const SUPABASE_AUTH_ACTIVE = SUPABASE_ACTIVE;
const AUTH_COOKIE_ACCESS = 'rift_access';
const AUTH_COOKIE_REFRESH = 'rift_refresh';
const AUTH_CACHE = new Map();

const CATALOG = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'catalog.json'), 'utf8'));
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

const BATTLE_RULES = Object.assign({ singleActive:1, doubleActive:2, tacticCardsPerTurn:2, moveSlots:4, doubleBattleEvery:8, moveUnlockLevels:[1,1,3,6] }, CATALOG.battleRules || {});
const ELEMENT_MOVE_NAMES = {
  '화염':['불씨 베기','화염구','홍련 장막','태양 폭발'],
  '물':['물결 치기','압축 수탄','해류 장막','해일 분쇄'],
  '자연':['덩굴 채찍','씨앗 포격','생명의 막','거목 분쇄'],
  '빛':['광휘 일격','프리즘 광선','성광 수호','천광 낙하'],
  '그림자':['그림자 할퀴기','암영 탄환','흑막 은신','심연 절단'],
  '강철':['철편 베기','자력 포탄','합금 장벽','궤도 강타'],
  '바람':['돌풍 치기','진공 칼날','회오리 장막','폭풍 난무'],
  '번개':['전격 찌르기','연쇄 번개','전하 보호막','낙뢰 폭주'],
  '별':['성편 타격','혜성 투사','별무리 장막','초신성 낙하'],
  '시간':['시차 타격','시간 파동','역행 방벽','크로노 붕괴'],
  '공허':['공허 물기','중력탄','무공 장막','붕괴점'],
  '수정':['수정 찌르기','결정 포화','결정 갑주','빙정 폭쇄']
};
const ARCHETYPE_SKILLS = {
  slime:{name:'점액 증식',kind:'guard',shield:9,heal:4,cooldown:1},
  wing:{name:'급강하',kind:'attack',ratio:1.18,cooldown:1},
  beast:{name:'야성 돌진',kind:'attack',ratio:1.25,cooldown:1},
  spirit:{name:'정령 공명',kind:'status',resonance:2,shield:5,cooldown:2},
  watcher:{name:'관측 광선',kind:'attack',ratio:1.15,stagger:8,cooldown:1},
  insect:{name:'키틴 수호',kind:'guard',shield:13,cooldown:1},
  golem:{name:'지각 분쇄',kind:'attack',ratio:1.34,cooldown:2},
  mimic:{name:'탐욕 복제',kind:'status',draw:1,boost:2,cooldown:2},
  priest:{name:'성역 기도',kind:'heal',heal:14,shield:5,cooldown:2},
  knight:{name:'방패 돌진',kind:'attack',ratio:1.15,shield:7,cooldown:1},
  assassin:{name:'그림자 연참',kind:'attack',ratio:1.42,cooldown:2},
  wraith:{name:'흡혼',kind:'attack',ratio:1.10,lifesteal:.35,cooldown:1},
  tyrant:{name:'왕의 압박',kind:'attack',ratio:1.30,vulnerable:1,cooldown:2},
  serpent:{name:'맹독 송곳니',kind:'attack',ratio:1.05,weak:1,cooldown:1},
  crab:{name:'갑각 반격',kind:'guard',shield:12,boost:3,cooldown:2},
  mushroom:{name:'포자 폭발',kind:'attack',ratio:.92,splash:.45,cooldown:1},
  drone:{name:'정밀 포격',kind:'attack',ratio:1.20,accuracy:100,cooldown:1},
  leviathan:{name:'파도 압박',kind:'attack',ratio:1.15,splash:.35,cooldown:2},
  phoenix:{name:'재점화 날개',kind:'heal',heal:10,boost:4,cooldown:2},
  puppet:{name:'모방 연계',kind:'status',boost:5,draw:1,cooldown:2}
};
function buildMonsterMoves(monster){
  const m=typeof monster==='string'?MONSTER_BY_ID[monster]:monster;if(!m)return[];const names=ELEMENT_MOVE_NAMES[m.element]||['기본 타격','속성 탄환','보호막','결전기'];const pc=monsterPointCost(m);const arch=ARCHETYPE_SKILLS[m.archetype]||{name:'전술 충격',kind:'attack',ratio:1.15,cooldown:1};
  return [
    {id:`${m.id}:m1`,name:names[0],kind:'attack',element:m.element,power:Math.round(4+pc*1.8),ratio:.72,accuracy:100,cooldown:0,unlockLevel:1,icon:'⚔',summary:'안정적인 기본 공격'},
    {id:`${m.id}:m2`,name:names[1],kind:'attack',element:m.element,power:Math.round(7+pc*2.2),ratio:.94,accuracy:95,cooldown:1,unlockLevel:1,icon:'✦',summary:'속성 피해 · 약점 공략'},
    {id:`${m.id}:m3`,name:arch.name,kind:arch.kind||'attack',element:m.element,power:Math.round(5+pc*1.6),ratio:Number(arch.ratio||0),accuracy:Number(arch.accuracy||96),cooldown:Number(arch.cooldown||1),unlockLevel:3,icon:arch.kind==='guard'?'⬢':arch.kind==='heal'?'✚':arch.kind==='status'?'◇':'➤',summary:'종족 고유 기술',...arch},
    {id:`${m.id}:m4`,name:names[3],kind:'burst',element:m.element,power:Math.round(10+pc*3),ratio:1.38,accuracy:90,cooldown:2,unlockLevel:6,icon:'★',summary:'고위력 결정기 · BREAK 강함',stagger:12}
  ];
}
function buildSkillDiscMoves(monster,level=1){
  const m=typeof monster==='string'?MONSTER_BY_ID[monster]:monster;if(!m)return[];const pc=monsterPointCost(m);const names=ELEMENT_MOVE_NAMES[m.element]||[];
  return [
    {id:`${m.id}:disc:a`,name:`${names[2]||'수호'} 개조`,kind:'guard',element:m.element,shield:10+pc*2,heal:pc>=4?4:0,power:0,ratio:0,accuracy:100,cooldown:1,unlockLevel:1,icon:'⬢',summary:'실드 중심 기술'},
    {id:`${m.id}:disc:b`,name:`${names[1]||'속성탄'} 연쇄`,kind:'attack',element:m.element,power:7+pc*2,ratio:1.02,accuracy:98,cooldown:1,unlockLevel:1,icon:'✧',summary:'안정적인 속성 연속기',resonance:1},
    {id:`${m.id}:disc:c`,name:`${names[3]||'결전기'} EX`,kind:'burst',element:m.element,power:12+pc*3,ratio:1.52,accuracy:88,cooldown:3,unlockLevel:Math.max(3,level),icon:'✹',summary:'강력하지만 긴 재사용 대기',stagger:18}
  ];
}
function normalizeMonsterMoves(u){
  const base=buildMonsterMoves(u.speciesId);u.moves=Array.isArray(u.moves)&&u.moves.length?u.moves.map(x=>({...x})):base.map(x=>({...x}));
  const known=new Set(u.moves.map(x=>x.id));for(const mv of base)if(!known.has(mv.id)&&u.moves.length<BATTLE_RULES.moveSlots)u.moves.push({...mv});u.moves=u.moves.slice(0,BATTLE_RULES.moveSlots);
  for(const mv of u.moves){mv.cooldownRemaining=Math.max(0,Number(mv.cooldownRemaining||0));mv.unlockLevel=Number(mv.unlockLevel||1);}
  return u.moves;
}

const RUN_CONTRACTS = [
  { id: 'vanguard', name: '선봉자의 서약', icon: '⚔', desc: '초반 화력을 얻는 대신 체력을 일부 포기합니다.', detail: '최대 HP -8 · 피해 +6% · 시작 골드 +120' },
  { id: 'warden', name: '수호자의 서약', icon: '▣', desc: '느리지만 안정적인 생존 빌드를 시작합니다.', detail: '최대 HP +12 · 전투 시작 방어 +6 · 시작 골드 -40' },
  { id: 'curator', name: '수집가의 서약', icon: '◇', desc: '선택지를 넓혀 원하는 빌드를 찾기 쉬워집니다.', detail: '보상 선택지 +1 · 고등급 보상 확률 +10% · 최대 HP -6' },
  { id: 'minimalist', name: '정제자의 서약', icon: '✂', desc: '시작 덱을 얇게 만들어 핵심 카드를 더 자주 뽑습니다.', detail: '시작 덱에서 낮은 등급 카드 2장 제거 · 시작 골드 +40' },
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
  { id:'overcharge', name:'과충전 지대', icon:'⚡', desc:'첫 턴 에너지 +1 · 적 HP +12%', firstEnergy:1, enemyHp:0.12 },
  { id:'fracture', name:'균열 노출', icon:'◇', desc:'BREAK 축적 +35% · 적 공격 +8%', breakGain:0.35, enemyAtk:0.08 },
  { id:'echo', name:'잔향 회로', icon:'✦', desc:'세 번째 카드마다 1장 드로우 · 적 HP +8%', everyThirdDraw:1, enemyHp:0.08 },
  { id:'hunt', name:'집중 사냥', icon:'◎', desc:'표식 적이 받는 피해 +18% · 적 공격 +6%', markDamage:0.18, enemyAtk:0.06 },
  { id:'fortify', name:'중갑 교전', icon:'▣', desc:'전투 시작 방어 +6 · 적도 보호막을 두릅니다.', startBlock:6, enemyStartBlock:6 }
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
      console.log(`[RIFT DECK] loaded ${rows.length} Supabase profile rows`);
    }
  } catch (err) {
    console.warn('[RIFT DECK] Supabase profile hydrate skipped:', err.message);
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
    console.warn('[RIFT DECK] Supabase profile sync failed:', err.message);
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
    console.warn(`[RIFT DECK] room ${room.id} snapshot failed:`, err.message);
  }
}
function queueRoomSync(room) {
  if (!SUPABASE_ACTIVE || !room?.id) return;
  const old = roomSyncTimers.get(room.id);
  if (old) clearTimeout(old);
  const timer = setTimeout(() => { roomSyncTimers.delete(room.id); persistRoomToSupabase(room); }, 180);
  timer.unref?.();
  roomSyncTimers.set(room.id, timer);
}
async function deleteRoomSnapshot(roomId) {
  if (!SUPABASE_ACTIVE || !roomId) return;
  try { await supabaseRequest(`/rest/v1/rift_rooms?room_id=eq.${encodeURIComponent(roomId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
  catch (err) { console.warn(`[RIFT DECK] room ${roomId} snapshot cleanup skipped:`, err.message); }
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
    if (loaded) console.log(`[RIFT DECK] restored ${loaded} active room snapshots from Supabase`);
    try {
      await supabaseRequest(`/rest/v1/rift_rooms?updated_at=lt.${encodeURIComponent(since)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch {}
  } catch (err) {
    console.warn('[RIFT DECK] Supabase room restore skipped:', err.message);
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
    moves:buildMonsterMoves(m)
  };
}
function createRunMonster(speciesId, index = 0) {
  const m = MONSTER_BY_ID[speciesId] || MONSTER_BY_ID[STARTER_MONSTERS[0]];
  const maxHp = Math.max(28, Number(m.playerHp || m.hp || 44));
  const power = Math.max(4, Number(m.playerAtk || m.atk || 7));
  const startBlock = m.archetype === 'insect' ? 8 : 0;
  return {
    instanceId: uid('mon'), speciesId:m.id, name:m.name, baseName:m.name, sprite:m.sprite, baseSprite:m.sprite,
    evolutionSprite:m.evolutionSprite||m.sprite,resonanceSprite:m.resonanceSprite||m.sprite,riftSprite:m.riftSprite||m.sprite,fusionSprite:null,
    element:m.element, secondaryElement:null, archetype:m.archetype||'beast', role:m.role||'striker', passive:clone(m.passive||{}),
    pointCost:monsterPointCost(m), level:1, xp:0, hp:maxHp, maxHp, power, block:startBlock, counter:0,
    gene:0, resonance:0, rift:0, evolved:false, fused:false, fusionWith:null, resonanceTurns:0, abyssBloom:false,
    secondaryArchetype:null, secondaryPassive:null, nextAttackBonus:0, kills:0,
    revived:false, firstHitTaken:false, summonedTurn:0, slotOrder:index, acted:false, levelUpsThisBattle:0,
    moves:buildMonsterMoves(m).map(x=>({...x,cooldownRemaining:0}))
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
      monsters:{},monsterParty:STARTER_MONSTERS.slice(0,3),stats:{},history:[],cloud:false,accountId:'',schemaVersion:5
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
    totalMonsters:MONSTERS.length,cloud:Boolean(p.cloud),accountId:p.accountId||'' };
}

function validDeck(deck) {
  const d=[...new Set((Array.isArray(deck)?deck:[]).filter(x=>CARD_BY_ID[x]?.type==='spell'))];
  const base=d.length>=DECK_MIN?d:STARTER_POOL.filter(id=>CARD_BY_ID[id]?.type==='spell').slice(0,DECK_MIN);
  const out=[]; while(out.length<12&&base.length)out.push(base[out.length%base.length]); return out.slice(0,24);
}
function newRunPlayer(p) {
  const party=normalizeMonsterParty(p.monsterParty,p.monsters);
  return { playerId:p.id,nickname:p.nickname,maxHp:100,hp:100,runDeck:validDeck(p.deck),monsterParty:party,
    monsters:party.map((id,i)=>createRunMonster(id,i)),relics:[],items:{},upgrades:{},mastery:{},mods:{},fragments:0,gold:180,cardsAdded:0,itemsAdded:0,
    revivesUsed:0,rewardRerolls:0,removals:0,contract:null };
}

function itemStacks(run, itemId) { return Number(run?.items?.[itemId] || 0); }
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
  if (heal > 0) run.hp = clamp(run.hp + heal, 1, run.maxHp);
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
  const maxEnergy=3+relicEnergy+Math.floor(modTotal(run,'maxEnergy')), maxHp=Math.max(55,run.maxHp-relicHpPenalty), handLimit=10+Math.floor(modTotal(run,'handLimit'));
  const roster=(run.monsters?.length?run.monsters:(run.monsterParty||[]).map((id,i)=>createRunMonster(id,i))).map(x=>{const c=clone(x);normalizeMonsterMoves(c);c.acted=false;c.levelUpsThisBattle=0;return c;});
  const alive=roster.filter(m=>m.hp>0), active=alive.slice(0,activeSlots), bench=alive.slice(activeSlots), ko=roster.filter(m=>m.hp<=0);
  const pc={ playerId:run.playerId,nickname:run.nickname,index,maxHp,hp:Math.min(run.hp,maxHp),block:Math.floor(modTotal(run,'startBlock'))+(run.relics.includes('r006')?10:0),
    energy:maxEnergy+Math.floor(modTotal(run,'firstTurnEnergy')),maxEnergy,handLimit,drawPile:shuffle(run.runDeck),discard:[],exhaust:[],hand:[],units:active,bench,ko,
    ended:false,down:false,weak:0,upgrades:{...(run.upgrades||{})},itemMods:{unitPower:modTotal(run,'unitPower'),spellPower:modTotal(run,'spellPower'),damagePct:modTotal(run,'damagePct'),bossDamagePct:modTotal(run,'bossDamagePct'),blockPct:modTotal(run,'blockPct'),healPct:modTotal(run,'healPct'),damageReduction:Math.min(.55,modTotal(run,'damageReduction')),retainBlock:Math.min(.75,modTotal(run,'retainBlock')),thorns:modTotal(run,'thorns')},
    buffs:{nextAttack:run.relics.includes('r001')?4:0,spellDiscount:0,anyDiscount:Math.floor(modTotal(run,'startDiscount')),debuffImmune:false,thorns:modTotal(run,'thorns'),nextUnitBlock:0,teamSpellCount:0,energyDebt:0},
    relics:run.relics.slice(),chain:{count:0,lastType:null,best:0,overdrives:0},recallsUsed:0,switchesUsed:0,tacticsUsed:0,tacticLimit:Number(BATTLE_RULES.tacticCardsPerTurn||2),stats:{cardsPlayed:0,movesUsed:0,damage:0,healing:0,hpDamageTaken:0,monsterDamageTaken:0} };
  drawCards(pc,5+Math.floor(modTotal(run,'drawBonus'))+(run.relics.includes('r007')?1:0)); return pc;
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
  pushRoomEvent(room, 'room', '방이 생성되었습니다.');
  return room;
}

function currentBiome(room) {
  if (room.mode === 'dungeon') return BIOMES[Math.min(BIOMES.length - 1, Math.floor(Math.max(0, room.floor - 1) / 10))];
  return BIOMES[Math.floor(Math.max(0, room.floor - 1) / 10) % BIOMES.length];
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
    biome: currentBiome(room),
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
    room.runState[rp.id] = newRunPlayer(p);
    room.contractOffers[rp.id] = shuffle(RUN_CONTRACTS).slice(0, 3);
    if (room.mode === 'dungeon') p.stats.dungeons++;
    else p.stats.journeys++;
  }
  saveProfiles();
  room.floor = 1;
  room.biomeIndex = 0;
  room.status = 'route';
  makeRoute(room);
  const label = room.mode === 'journey' ? '일반 여행' : `${DIFFICULTIES[room.difficulty].ko} 난이도 50층 협동 던전`;
  pushRoomEvent(room, 'start', `${label}에 진입했습니다. 다음 장소를 선택하세요.`);
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
    const removable = run.runDeck.map((id,idx)=>({id,idx,c:CARD_BY_ID[id]})).filter(x=>x.c).sort((a,b)=>(RARITY[a.c.rarity]?.order||0)-(RARITY[b.c.rarity]?.order||0) || Number(b.c.cost||0)-Number(a.c.cost||0));
    const ids = removable.slice(0,2).map(x=>x.id); for (const cid of ids) { const i=run.runDeck.indexOf(cid); if(i>=0 && run.runDeck.length>10) run.runDeck.splice(i,1); } run.gold += 40;
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
  const pool = ['combat', 'combat', 'combat', 'event', 'rest', 'treasure', 'merchant'];
  const out = [];
  while (out.length < 2) {
    const k = choose(pool);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}
function kindLabel(k) {
  return ({ combat: '전투', elite: '정예', boss: '보스', event: '미지의 사건', rest: '야영지', treasure: '보물', merchant: '유랑 상점' })[k] || k;
}
function kindIcon(k) {
  return ({ combat: '⚔', elite: '☠', boss: '♛', event: '?', rest: '⌂', treasure: '◆', merchant: '₡' })[k] || '◆';
}
function kindDesc(k) {
  return ({
    combat: '안정적인 전투 보상 · 카드/아이템/골드의 기본 루트',
    elite: '강한 적과 정면 승부 · 승리하면 별도 유물 선택권 획득',
    boss: '10층마다 등장하는 지역 수호자 · 승리 후 심연 압력 상승',
    event: '선택에 따라 자원·카드·아이템이 달라지는 사건',
    rest: '회복 / 카드 강화 / 명상 중 하나를 선택하는 야영지',
    treasure: '추가 골드 + 별도 유물 선택권',
    merchant: '런 골드로 카드·아이템 구매 · 덱 정제 가능'
  })[k] || '';
}

function makeRoute(room) {
  room.battle = null;
  room.reward = null;
  room.capture = null;
  room.event = null;
  const boss = room.mode === 'dungeon' && room.floor % 10 === 0;
  const elite = room.floor % 5 === 0 && !boss;
  const kinds = boss ? ['boss'] : elite ? ['elite'] : sampleKinds();
  room.route = kinds.map((kind, i) => ({
    id: `${room.floor}-${i}-${kind}`,
    kind,
    label: kindLabel(kind),
    icon: kindIcon(kind),
    desc: kindDesc(kind),
    votes: []
  }));
  room.status = 'route';
}

function voteRoute(room, playerId, nodeId) {
  if (room.status !== 'route') throw new Error('현재 경로를 고를 수 없습니다.');
  if (!room.contractClaims?.[playerId]) {
    room.contractClaims ||= {}; room.contractClaims[playerId] = 'unbound';
    if (room.runState[playerId]) room.runState[playerId].contract = 'unbound';
    pushRoomEvent(room, 'contract', `${playerName(room, playerId)} 님이 무서약 상태로 경로를 선택했습니다.`);
  }
  const node = room.route.find(n => n.id === nodeId);
  if (!node) throw new Error('경로가 없습니다.');
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
  if (['combat', 'elite', 'boss'].includes(node.kind)) {
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
    createFloorReward(room, 'merchant', '유랑 상점', '무료 보상은 선택하거나 분해할 수 있습니다. 상점에서는 카드·아이템 구매와 덱 정제도 가능합니다.', 'merchant', { shop, purchased: {} });
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
  const cards = rewardCardOptions(room, null, 1, 'merchant').map(c => ({
    id: uid('shop'), type: 'card', cardId: c.id, card: publicCard(c), price: cardPrice(c)
  }));
  const items = rewardItemOptions(room, null, 5, 'merchant').map(i => ({
    id: uid('shop'), type: 'item', itemId: i.id, item: publicItem(i), price: itemPrice(i)
  }));
  return shuffle([...cards, ...items]);
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
    const pool = CARDS.filter(c => !c.limited && !c.archiveOnly && c.rarity !== 'common');
    const c = weighted(pool, c => Number(RARITY[c.rarity].travelWeight) * (room.floor >= 31 && ['ultra','legendary','mythic'].includes(c.rarity) ? 1.7 : 1));
    if (run.runDeck.length < 40) run.runDeck.push(c.id);
    run.cardsAdded++;
    message = `체력 ${loss}를 대가로 「${c.name}」을 이번 원정 덱에 추가했습니다.`;
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
  const modifier = tier === 'boss' ? null : clone(choose(BATTLE_MODIFIERS));
  const doubleBattle = tier !== 'boss' && room.floor >= 4 && (room.floor % Number(BATTLE_RULES.doubleBattleEvery||8) === 0 || (tier === 'elite' && room.floor % 2 === 0));
  const activeSlots = doubleBattle ? Number(BATTLE_RULES.doubleActive||2) : Number(BATTLE_RULES.singleActive||1);
  const party = room.players.map((p, i) => makeCombatant(room.runState[p.id], i, activeSlots));
  const teamStartBlock = room.players.reduce((sum, p) => sum + modTotal(room.runState[p.id], 'teamStartBlock'), 0);
  if (teamStartBlock) party.forEach(pc => pc.block += teamStartBlock);
  if (modifier?.firstEnergy) party.forEach(pc => pc.energy += modifier.firstEnergy);
  if (modifier?.startBlock) party.forEach(pc => pc.block += modifier.startBlock);
  const scale = Math.max(1, room.players.length), enemyCount = doubleBattle ? 2 : 1, diff = roomDifficulty(room), biome = currentBiome(room), enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    let base;
    if (tier === 'boss') base = clone(BOSSES[Math.min(BOSSES.length - 1, Math.floor((room.floor - 1) / 10))]);
    else { let pool = ENEMIES.filter(e => e.biome === biome.id); if (tier === 'elite') pool = pool.filter(e => ['rare','ultra'].includes(e.tier)); else if (room.floor < 8) pool = pool.filter(e => e.tier !== 'ultra'); base = clone(choose(pool.length ? pool : ENEMIES)); }
    const threat = threatMods(room), floorHp=(1+(room.floor-1)*.022)*(1+threat.hp), floorAtk=(1+(room.floor-1)*.012)*(1+threat.atk), partyHp=(1+(scale-1)*.62)*diff.partyScale, eliteScale=tier==='elite'?1.24:1;
    base.uid=uid('enemy');base.maxHp=Math.round(base.hp*floorHp*partyHp*eliteScale*diff.enemyHp*(1+Number(modifier?.enemyHp||0))*(doubleBattle?.72:1));base.hp=base.maxHp;base.atk=Math.round(base.atk*floorAtk*(1+(scale-1)*.10)*(tier==='elite'?1.10:1)*diff.enemyAtk*(1+Number(modifier?.enemyAtk||0))*(doubleBattle?.88:1));
    base.block=Number(modifier?.enemyStartBlock||0);base.debuffs={weak:0,vulnerable:0,burn:0,shock:0,intentSeal:0};base.nextDamageHalf=false;base.counter=0;base.phase=tier==='boss'?1:0;base.enraged=false;base.staggerMax=Math.max(18,Math.round(base.maxHp*(tier==='boss'?.22:tier==='elite'?.25:.28)));base.stagger=0;base.staggerGainMult=1+Number(modifier?.breakGain||0);base.broken=0;base.justBroken=false;base.intent=rollIntent(base,tier,room.difficulty);enemies.push(base);
  }
  if (modifier?.markDamage && enemies[0]) enemies[0].marked = true;
  room.battle = { tier, battleMode:doubleBattle?'double':'single', activeSlots, turn:1, phase:'players', party, enemies, log:[], teamSpellCount:0, modifier };
  battleLog(room, `${doubleBattle?'더블 배틀':'싱글 배틀'} · ${tier==='boss'?'보스':tier==='elite'?'정예':'야생'} 조우!${modifier?` ${modifier.name}`:''}`);
  pushRoomEvent(room,'battle-start',doubleBattle?'더블 배틀!':'배틀 시작!',{tier,floor:room.floor,enemyIds:enemies.map(e=>e.uid),modifier,battleMode:room.battle.battleMode});
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

function monsterLevelGain(room, pc, u, amount = 1) {
  if(!u)return;u.xp=Number(u.xp||0)+amount;const need=2+Number(u.level||1)*2;
  if(u.xp>=need&&u.level<12){u.xp-=need;const before=u.level;u.level++;u.levelUpsThisBattle=Number(u.levelUpsThisBattle||0)+1;const oldMax=u.maxHp;u.maxHp=Math.round(u.maxHp*1.08+2);u.power=Math.round(u.power*1.08+1);u.hp=Math.min(u.maxHp,u.hp+(u.maxHp-oldMax)+4);normalizeMonsterMoves(u);const unlocked=u.moves.filter(mv=>mv.unlockLevel===u.level).map(mv=>mv.name);battleLog(room,`${u.name} Lv.${u.level}!${unlocked.length?` ${unlocked.join(', ')} 해금!`:''}`);pushRoomEvent(room,'monster-level',`${u.name} 레벨 업!`,{playerId:pc.playerId,instanceId:u.instanceId,level:u.level,unlocked});}
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
  const prof=profiles[playerId];
  if(mode==='evolve'){
    if(u.evolved)throw new Error('이미 진화했습니다.');if(u.level<3||u.gene<3)throw new Error('진화에는 Lv.3 + GENE 3이 필요합니다.');u.gene-=3;u.evolved=true;u.maxHp=Math.round(u.maxHp*1.28);u.hp=Math.min(u.maxHp,Math.round(u.hp*1.28+8));u.power=Math.round(u.power*1.25+2);u.name=MONSTER_BY_ID[u.speciesId]?.evolutionName||`${u.baseName} · 진화형`;prof.stats.evolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 진화!`,{playerId,instanceId:u.instanceId,mode:'evolve'});
  }else if(mode==='resonance'){
    if(u.resonanceTurns>0)throw new Error('이미 공명진화 상태입니다.');if(u.resonance<4)throw new Error('공명진화에는 RES 4가 필요합니다.');u.resonance-=4;u.resonanceTurns=3;u.block=Number(u.block||0)+6;prof.stats.resonanceEvolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 공명진화!`,{playerId,instanceId:u.instanceId,mode:'resonance'});
  }else if(mode==='rift'){
    if(u.abyssBloom)throw new Error('이미 균열개화 상태입니다.');if(u.rift<3||u.hp/u.maxHp>.60)throw new Error('균열개화에는 HP 60% 이하 + RIFT 3이 필요합니다.');u.rift-=3;u.abyssBloom=true;u.nextAttackBonus=Number(u.nextAttackBonus||0)+5;prof.stats.riftBlooms++;pushRoomEvent(room,'monster-evolve',`${u.name} 균열개화!`,{playerId,instanceId:u.instanceId,mode:'rift'});
  }else throw new Error('알 수 없는 진화 방식입니다.');
  saveProfiles();return u;
}
function fuseMonsters(room,playerId,primaryId,secondaryId){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 융합할 수 없습니다.');
  const a=findCombatMonster(pc,primaryId),b=findCombatMonster(pc,secondaryId);if(!a||!b||a.instanceId===b.instanceId)throw new Error('서로 다른 몬스터 2마리를 선택하세요.');if(a.gene<2||b.gene<2)throw new Error('융합하려면 두 몬스터 모두 GENE 2가 필요합니다.');
  const ratioA=a.maxHp?Math.max(.05,a.hp/a.maxHp):1,ratioB=b.maxHp?Math.max(.05,b.hp/b.maxHp):1;a.gene=Math.max(0,a.gene-2);b.gene=Math.max(0,b.gene-2);
  a.fused=true;a.fusionWith=b.speciesId;a.fusionSprite=b.sprite;a.secondaryElement=b.element;a.secondaryArchetype=b.archetype;a.secondaryPassive=clone(b.passive||{});a.name=`${a.baseName} × ${b.baseName}`;a.maxHp=Math.round((a.maxHp+b.maxHp)*.76);a.hp=Math.round(a.maxHp*((ratioA+ratioB)/2));a.power=Math.round((a.power+b.power)*.72+3);a.pointCost=Math.min(10,Number(a.pointCost||1)+Number(b.pointCost||1));a.resonance=Math.max(a.resonance,b.resonance);a.rift=Math.max(a.rift,b.rift);
  for(const arr of [pc.units,pc.bench,pc.ko]){const i=arr.findIndex(x=>x.instanceId===b.instanceId);if(i>=0)arr.splice(i,1);} profiles[playerId].stats.fusions++;saveProfiles();pushRoomEvent(room,'monster-fuse',`${a.name} 융합 완성!`,{playerId,instanceId:a.instanceId,secondaryId:b.instanceId});return a;
}
function switchMonster(room,playerId,activeId,benchId){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 교대할 수 없습니다.');if(pc.switchesUsed>=1)throw new Error('몬스터 교대는 턴당 1회입니다.');
  const ai=pc.units.findIndex(x=>x.instanceId===activeId),bi=pc.bench.findIndex(x=>x.instanceId===benchId);if(ai<0||bi<0)throw new Error('교대 대상을 찾을 수 없습니다.');const a=pc.units[ai],b=pc.bench[bi];if(a.acted)throw new Error('이미 행동한 몬스터는 교대할 수 없습니다.');pc.units[ai]=b;pc.bench[bi]=a;b.acted=true;pc.switchesUsed++;pushRoomEvent(room,'monster-switch',`${a.name} ↔ ${b.name}`,{playerId,activeId,benchId,consumesAction:true});
  if(pc.units.filter(u=>u.hp>0).every(u=>u.acted)){pc.ended=true;if(room.battle.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}return b;
}

function playCard(room, playerId, handIndex, targetUid, targetMonsterId) {
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('카드를 사용할 차례가 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');if(Number(pc.tacticsUsed||0)>=Number(pc.tacticLimit||BATTLE_RULES.tacticCardsPerTurn))throw new Error(`전술 카드는 턴당 ${pc.tacticLimit||BATTLE_RULES.tacticCardsPerTurn}장까지만 사용할 수 있습니다.`);
  const index=Number(handIndex),cid=pc.hand[index],base=CARD_BY_ID[cid],run=room.runState[playerId],c=effectiveRunCard(run,base);if(!c||c.type!=='spell')throw new Error('스펠 카드가 없습니다.');
  const previewCost=Math.max(0,c.cost-(pc.buffs.anyDiscount>0?1:(pc.buffs.spellDiscount>0?1:0)));if(pc.energy<previewCost)throw new Error('에너지가 부족합니다.');const cost=resolveCost(pc,c);pc.energy-=cost;pc.hand.splice(index,1);pc.stats.cardsPlayed++;pc.tacticsUsed=Number(pc.tacticsUsed||0)+1;
  const target=aliveEnemies(room).find(e=>e.uid===targetUid)||aliveEnemies(room)[0];const monster=findCombatMonster(pc,targetMonsterId)||pc.units[0];castSpell(room,pc,c,target,monster);pc.discard.push(cid);const masteryResult=gainCardMastery(room,run,cid);
  if(monster){monsterLevelGain(room,pc,monster,1);if(c.element===monster.element){const extra=monster.archetype==='spirit'&&Math.random()<.35?2:1;monster.resonance=clamp(Number(monster.resonance||0)+extra,0,6);}if(c.cardClass==='gene')monster.gene=clamp(Number(monster.gene||0),0,8);}
  if(b.modifier?.everyThirdDraw&&pc.stats.cardsPlayed%3===0){drawCards(pc,b.modifier.everyThirdDraw);battleLog(room,`${b.modifier.name}: 카드 1장을 추가로 드로우했습니다.`);}
  const chainResult=updateTacticalChain(room,pc,c,monster,target),phaseShifts=updateBossPhase(room),breakTargets=b.enemies.filter(e=>e.justBroken&&e.hp>0);for(const e of b.enemies)e.justBroken=false;if(checkBattleEnd(room))return;
  pushRoomEvent(room,'card',`${pc.nickname}: ${c.name}`,{playerId:pc.playerId,cardId:c.id,cardName:c.name,cardType:c.type,cardClass:c.cardClass,element:c.element,targetUid:target?.uid||null,targetMonsterId:monster?.instanceId||null,cost,chainCount:chainResult.displayCount,chainStage:chainResult.stage,upgradeLevel:Number(run.upgrades?.[c.id]||0),masteryXp:masteryResult?.xp||0});
  if(masteryResult&&masteryResult.level>Number(c.upgradeLevel||0))pushRoomEvent(room,'mastery',`${masteryResult.name} 성장!`,{playerId:pc.playerId,cardId:c.id,level:masteryResult.level,xp:masteryResult.xp});for(const e of breakTargets)pushRoomEvent(room,'enemy-break',`${e.name}의 균열 자세 붕괴!`,{enemyUid:e.uid,enemyName:e.name});if(chainResult.stage)pushRoomEvent(room,'chain',`${pc.nickname} ${chainResult.stage==='overdrive'?'오버드라이브':'전술 연쇄'} 발동!`,{playerId:pc.playerId,stage:chainResult.stage,count:chainResult.displayCount});for(const e of phaseShifts)pushRoomEvent(room,'boss-phase',`${e.name} 2단계!`,{enemyUid:e.uid,enemyName:e.name,phase:2});
}

function moveDamage(room,pc,u,target,move){
  let amount=Math.max(1,Math.round(Number(u.power||1)*Number(move.ratio||0)+Number(move.power||0)+Number(u.nextAttackBonus||0)));u.nextAttackBonus=0;amount=modifiedDamage(room,pc,amount,{type:'monster',element:move.element||u.element});const dealt=applyElementDamage(target,amount,move.element||u.element);pc.stats.damage+=dealt;pc.lastMonsterDamage=dealt;
  if(move.lifesteal)u.hp=clamp(u.hp+Math.max(1,Math.round(dealt*Number(move.lifesteal))),0,u.maxHp);if(move.weak)target.debuffs.weak=Math.max(Number(target.debuffs.weak||0),Number(move.weak));if(move.vulnerable)target.debuffs.vulnerable=Math.max(Number(target.debuffs.vulnerable||0),Number(move.vulnerable));if(move.stagger&&target.hp>0&&!target.broken){target.stagger=clamp(Number(target.stagger||0)+Number(move.stagger),0,target.staggerMax||999);if(target.stagger>=target.staggerMax){target.broken=1;target.justBroken=true;target.debuffs.vulnerable=Math.max(Number(target.debuffs.vulnerable||0),1);}}
  if(move.splash){for(const e of aliveEnemies(room)){if(e===target)continue;applyElementDamage(e,Math.max(1,Math.round(dealt*Number(move.splash))),move.element||u.element);}}
  return dealt;
}
function useMonsterMove(room,playerId,instanceId,moveId,targetUid){
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('기술을 사용할 차례가 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');const u=pc.units.find(x=>x.instanceId===instanceId)||pc.units[0];if(!u)throw new Error('출전 몬스터가 없습니다.');normalizeMonsterMoves(u);if(u.acted)throw new Error('이 몬스터는 이미 행동했습니다.');const move=u.moves.find(x=>x.id===moveId);if(!move)throw new Error('기술을 찾을 수 없습니다.');if(u.level<Number(move.unlockLevel||1))throw new Error(`Lv.${move.unlockLevel}에서 해금되는 기술입니다.`);if(Number(move.cooldownRemaining||0)>0)throw new Error(`재사용까지 ${move.cooldownRemaining}턴 남았습니다.`);
  const target=aliveEnemies(room).find(e=>e.uid===targetUid)||aliveEnemies(room)[0];let dealt=0,hit=true;if(move.kind!=='guard'&&move.kind!=='heal'&&move.kind!=='status'){hit=process.env.TEST_MODE==='1'||Math.random()<Number(move.accuracy||100)/100;}
  if(hit&&['attack','burst'].includes(move.kind)&&target){dealt=moveDamage(room,pc,u,target,move);battleLog(room,`${u.name}의 ${move.name}! ${target.name}에게 ${dealt} 피해.`);}else if(!hit){battleLog(room,`${u.name}의 ${move.name} — 빗나갔다!`);}
  if(move.shield){u.block=Number(u.block||0)+Number(move.shield);battleLog(room,`${u.name} 방어막 +${move.shield}.`);}if(move.heal){const before=u.hp;u.hp=clamp(u.hp+Number(move.heal),0,u.maxHp);pc.stats.healing+=u.hp-before;}if(move.boost)u.power+=Number(move.boost);if(move.resonance)u.resonance=clamp(Number(u.resonance||0)+Number(move.resonance),0,6);if(move.draw)drawCards(pc,Number(move.draw));
  move.cooldownRemaining=Math.max(0,Number(move.cooldown||0));u.acted=true;pc.stats.movesUsed=Number(pc.stats.movesUsed||0)+1;monsterLevelGain(room,pc,u,1);
  pushRoomEvent(room,'monster-move',`${u.name} · ${move.name}`,{playerId,instanceId:u.instanceId,targetUid:target?.uid||null,move:clone(move),damage:dealt,hit,element:move.element||u.element,style:u.archetype,form:monsterFormLabel(u)});
  const phases=updateBossPhase(room);for(const e of phases)pushRoomEvent(room,'boss-phase',`${e.name} 2단계!`,{enemyUid:e.uid,enemyName:e.name,phase:2});const breaks=b.enemies.filter(e=>e.justBroken&&e.hp>0);for(const e of b.enemies)e.justBroken=false;for(const e of breaks)pushRoomEvent(room,'enemy-break',`${e.name}의 자세 붕괴!`,{enemyUid:e.uid,enemyName:e.name});if(checkBattleEnd(room))return{move,dealt,ended:true};
  if(pc.units.filter(x=>x.hp>0).every(x=>x.acted)){pc.ended=true;battleLog(room,`${pc.nickname} 행동 완료.`);if(b.party.filter(x=>!x.down).every(x=>x.ended))enemyTurn(room);}return{move,dealt,ended:pc.ended};
}
function skillOfferForPc(room,pc){
  const mons=[...pc.units,...pc.bench].filter(u=>u.hp>0);if(!mons.length)return null;const leveled=mons.filter(u=>Number(u.levelUpsThisBattle||0)>0);const should=leveled.length||room.battle?.tier==='boss'||room.battle?.tier==='elite'||room.floor%4===0;if(!should)return null;const u=leveled[0]||mons[0],species=MONSTER_BY_ID[u.speciesId];if(!species)return null;const offers=buildSkillDiscMoves(species,u.level).map(x=>({...x,cooldownRemaining:0}));return{instanceId:u.instanceId,monsterName:u.name,monsterSprite:u.sprite,reason:leveled.length?'LEVEL UP':'SKILL DISC',moves:offers,currentMoves:clone(u.moves||[])};
}
function teachMonsterMove(room,playerId,moveId,replaceIndex){
  if(room.status!=='reward'||!room.reward)throw new Error('기술을 배울 수 있는 단계가 아닙니다.');room.reward.skillClaims ||= {};if(room.reward.skillClaims[playerId])throw new Error('이번 기술 선택은 이미 완료했습니다.');const offer=room.reward.skillOffers?.[playerId];if(!offer)throw new Error('배울 기술이 없습니다.');const move=(offer.moves||[]).find(x=>x.id===moveId);if(!move)throw new Error('해당 기술을 찾을 수 없습니다.');const run=room.runState[playerId],u=(run.monsters||[]).find(x=>x.instanceId===offer.instanceId);if(!u)throw new Error('몬스터를 찾을 수 없습니다.');normalizeMonsterMoves(u);let idx=Number(replaceIndex);if(!Number.isInteger(idx)||idx<0||idx>=BATTLE_RULES.moveSlots){idx=u.moves.findIndex(x=>u.level<Number(x.unlockLevel||1));if(idx<0)idx=u.moves.length<BATTLE_RULES.moveSlots?u.moves.length:BATTLE_RULES.moveSlots-1;}u.moves[idx]={...clone(move),cooldownRemaining:0};room.reward.skillClaims[playerId]={moveId:move.id,moveName:move.name,replaceIndex:idx,monsterName:u.name};pushRoomEvent(room,'move-learn',`${u.name}이(가) ${move.name}을 익혔다!`,{playerId,instanceId:u.instanceId,move:clone(move),replaceIndex:idx});return room.reward.skillClaims[playerId];
}
function skipMonsterMoveOffer(room,playerId){if(room.status!=='reward'||!room.reward)throw new Error('기술 선택 단계가 아닙니다.');room.reward.skillClaims ||= {};room.reward.skillClaims[playerId]={skipped:true};return room.reward.skillClaims[playerId];}


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
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('전투 중이 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down)return;for(const u of pc.units)u.acted=true;pc.ended=true;battleLog(room,`${pc.nickname}이(가) 행동을 마쳤습니다.`);const active=b.party.filter(x=>!x.down);if(active.length&&active.every(x=>x.ended))enemyTurn(room);else pushRoomEvent(room,'end-turn',`${pc.nickname} 님이 턴을 종료했습니다.`);
}

function enemyTurn(room) {
  const b=room.battle;b.phase='enemies';
  for(const e of aliveEnemies(room)){
    e.counter++;if(e.debuffs.burn>0){const d=applyDamage(e,e.debuffs.burn);e.debuffs.burn=Math.max(0,e.debuffs.burn-1);battleLog(room,`${e.name} 화상 ${d}.`);if(e.hp<=0){if(checkBattleEnd(room))return;continue;}}
    if(e.broken>0){e.broken=0;e.stagger=0;e.debuffs.vulnerable=Math.max(Number(e.debuffs.vulnerable||0),1);battleLog(room,`${e.name} BREAK — 행동 불가.`);e.intent=rollIntent(e,b.tier,room.difficulty);continue;}
    if(e.debuffs.intentSeal>0){e.debuffs.intentSeal--;battleLog(room,`${e.name} 행동 봉인.`);e.intent=rollIntent(e,b.tier,room.difficulty);continue;}
    const targets=b.party.filter(x=>!x.down);if(!targets.length)break;const t=choose(targets);
    if(['attack','heavy'].includes(e.intent.type)){
      let amount=e.intent.value;if(e.debuffs.weak>0)amount=Math.round(amount*.75);if(e.nextDamageHalf){amount=Math.round(amount*.5);e.nextDamageHalf=false;}const mon=t.units.length?choose(t.units):null;let d=0;if(mon)d=monsterDamage(room,t,mon,amount,e);else d=damagePc(room,t,amount,e);battleLog(room,`${e.name} → ${mon?mon.name:t.nickname} ${d} 피해.`);pushRoomEvent(room,'enemy-attack',`${e.name} 공격`,{enemyUid:e.uid,playerId:t.playerId,targetMonsterId:mon?.instanceId||null,damage:d,style:e.archetype||'beast',element:e.element||'공허',skill:e.skill||e.name,heavy:e.intent.type==='heavy'});
    }else if(e.intent.type==='guard'){e.block+=e.intent.value;battleLog(room,`${e.name} 방어 ${e.intent.value}.`);}else if(e.intent.type==='debuff'){if(!t.buffs.debuffImmune){t.weak++;battleLog(room,`${t.nickname} 약화 1.`);}}
    e.debuffs.vulnerable=Math.max(0,e.debuffs.vulnerable-1);e.debuffs.weak=Math.max(0,e.debuffs.weak-1);if(e.staggerMax&&!e.broken)e.stagger=Math.max(0,Number(e.stagger||0)-Math.ceil(e.staggerMax*.28));e.intent=rollIntent(e,b.tier,room.difficulty);
  }
  if(checkBattleEnd(room))return;if(b.party.every(x=>x.down))return loseBattle(room);b.turn++;
  for(const pc of b.party){if(pc.down)continue;pc.block=Math.round(pc.block*Number(pc.itemMods.retainBlock||0));pc.energy=Math.max(1,pc.maxEnergy-(pc.buffs.energyDebt>0?1:0));pc.buffs.energyDebt=Math.max(0,pc.buffs.energyDebt-1);pc.ended=false;pc.recallsUsed=0;pc.switchesUsed=0;pc.tacticsUsed=0;pc.buffs.debuffImmune=false;pc.buffs.thorns=Math.max(pc.buffs.thorns,Number(pc.itemMods.thorns||0));pc.chain||={count:0,lastType:null,best:0,overdrives:0};pc.chain.count=0;pc.chain.lastType=null;pc.weak=Math.max(0,pc.weak-1);pc.discard.push(...pc.hand);pc.hand=[];drawCards(pc,5);
    for(const u of [...pc.units,...pc.bench]){normalizeMonsterMoves(u);u.acted=false;for(const mv of u.moves)mv.cooldownRemaining=Math.max(0,Number(mv.cooldownRemaining||0)-1);if(u.resonanceTurns>0)u.resonanceTurns--;if(u.abyssBloom)u.hp=Math.max(1,u.hp-Math.max(1,Math.round(u.maxHp*.05)));if(u.archetype==='slime')u.hp=clamp(u.hp+Math.max(1,Math.round(u.maxHp*.03)),0,u.maxHp);}
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
  syncRunHealth(room);
  const boss = b.tier === 'boss';
  const diff = roomDifficulty(room);
  const baseGold = (boss ? 170 : b.tier === 'elite' ? 105 : 55) + room.floor * 3;
  const baseGems = (boss ? 55 : b.tier === 'elite' ? 24 : 8) + Math.floor(room.floor / 5);
  const perfectBy = {};
  const gradeBy = {};
  for (const rp of room.players) {
    const p = profiles[rp.id];
    const run = room.runState[rp.id];
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
  const title = room.finalClearPending ? '50층 최종 수호자 격파!' : boss ? '지역 보스 격파!' : b.tier === 'elite' ? '정예 격파!' : '전투 승리';
  const text = `전투 보상을 선택하세요. 필요 없는 보상은 분해해 덱을 얇게 유지할 수 있습니다.${b.tier==='elite'||boss?' 추가 유물 선택권도 열렸습니다.':''}`;
  createFloorReward(room, 'battle', title, text, b.tier);
  room.reward.perfectBy = perfectBy;
  room.reward.gradeBy = gradeBy;
  room.reward.skillOffers = {}; room.reward.skillClaims = {};
  for(const rp of room.players){const pc=b.party.find(x=>x.playerId===rp.id),offer=pc?skillOfferForPc(room,pc):null;if(offer)room.reward.skillOffers[rp.id]=offer;}
  if (room.mode === 'journey') room.capture = makeCaptureEncounter(room.floor, b.tier, room);
  battleLog(room, '승리!');
  pushRoomEvent(room, 'win', '전투에서 승리했습니다.', { tier: b.tier, floor: room.floor, final: room.finalClearPending, perfectPlayers: Object.keys(perfectBy).length });
}

function loseBattle(room) {
  syncRunHealth(room);
  room.status = 'ended';
  room.reward = {
    kind: 'defeat',
    title: '원정 실패',
    text: `${room.floor}층에서 탐험이 종료되었습니다. 영구 봉인한 몬스터와 보유 스펠·재화는 유지됩니다.`,
    playerOptions: {}, claims: {}, continueBy: []
  };
  recordRunHistory(room, 'defeat');
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
  const pool = ITEMS.filter(i => !Array.isArray(i.modes) || i.modes.includes(room.mode));
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
  const run = room.runState[playerId];
  const extra = clamp(Math.floor(modTotal(run, 'rewardChoices')), 0, 1);
  const count = 3 + extra;
  const cardCount = Math.max(2, count - 1);
  const itemCount = count - cardCount;
  const cards = rewardCardOptions(room, playerId, cardCount, tier).map(c => ({
    id: uid('reward'), type: 'card', cardId: c.id, card: publicCard(c), rarity: c.rarity, label: c.name, synergy: cardSynergy(run,c)
  }));
  const items = rewardItemOptions(room, playerId, itemCount, tier).map(i => ({
    id: uid('reward'), type: 'item', itemId: i.id, item: publicItem(i), rarity: i.rarity, label: i.name, synergy: 0
  }));
  return shuffle([...cards, ...items]);
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
  } else if (mode === 'upgrade') {
    if (!CARD_BY_ID[cardId] || !run.runDeck.includes(cardId)) throw new Error('강화할 카드를 찾을 수 없습니다.');
    run.upgrades ||= {};
    const level=Number(run.upgrades[cardId]||0);
    if (level>=2) throw new Error('이 카드는 이미 최대 강화입니다.');
    run.upgrades[cardId]=level+1; label=`제련 · ${CARD_BY_ID[cardId].name} ${level+1===1?'+':'++'}`;
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

function buyReward(room, playerId, itemId, itemType = 'card') {
  if (room.status !== 'reward' || room.reward?.kind !== 'merchant') throw new Error('상점이 아닙니다.');
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
  if (room.mode === 'journey' && room.capture && !room.capture.escaped && !room.capture.attemptedBy?.includes(playerId)) throw new Error('먼저 야생 몬스터를 봉인하거나 지나가 주세요.');
  const options = room.reward.playerOptions?.[playerId] || [];
  if (options.length && !room.reward.claims[playerId]) throw new Error('보상을 선택하거나 분해해 주세요.');
  const skillOffer=room.reward.skillOffers?.[playerId];if(skillOffer&&!room.reward.skillClaims?.[playerId])room.reward.skillClaims[playerId]={skipped:true};
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
    saveProfiles();
    room.reward = { kind:'clear', title:`${DIFFICULTIES[room.difficulty].ko} 난이도 심연 원정 완료`, text:`50층을 돌파했습니다. 원정대 전원에게 클리어 보너스 프리즘 ${clearBonus}개 지급.`, playerOptions:{}, claims:{}, continueBy:[] };
    pushRoomEvent(room, 'clear', `50층 ${DIFFICULTIES[room.difficulty].ko} 던전을 클리어했습니다!`);
    return;
  }
  if (room.mode === 'dungeon' && room.floor % 10 === 0) addThreatToken(room);
  const oldBiomeIndex = room.biomeIndex;
  room.floor++;
  room.biomeIndex = room.mode === 'dungeon' ? Math.min(BIOMES.length - 1, Math.floor((room.floor - 1) / 10)) : Math.floor((room.floor - 1) / 10) % BIOMES.length;
  if (room.biomeIndex !== oldBiomeIndex) {
    const healPct = roomDifficulty(room).healBetweenBiomes;
    for (const rp of room.players) {
      const run = room.runState[rp.id];
      run.hp = clamp(run.hp + Math.round(run.maxHp * healPct), 1, run.maxHp);
      for(const m of run.monsters||[])m.hp=clamp(m.hp+Math.round(m.maxHp*healPct),1,m.maxHp);
    }
  }
  makeRoute(room);
  pushRoomEvent(room, 'floor', `${room.floor}층으로 이동합니다.`);
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
    if (p === '/healthz' || p === '/api/version') return ok(res, { service: 'RIFT_DECK_SERVER', version: VERSION, deployId: DEPLOY_ID, storage: SUPABASE_ACTIVE ? 'supabase+json-fallback' : 'json-local', auth: SUPABASE_AUTH_ACTIVE ? 'supabase' : 'guest-only', cards: CARDS.length, items: ITEMS.length, monsters: ENEMIES.length + BOSSES.length, maxDungeonFloor: DUNGEON_MAX_FLOOR, rooms: rooms.size, uptime: Math.round(process.uptime()) });
    if (p === '/api/meta' && req.method === 'GET') return ok(res, {
      cards: CARDS.map(publicCard), items: ITEMS.map(publicItem), monsters: MONSTERS.map(publicMonster), rarities: RARITY, elements: ELEMENTS, elementMatchups: ELEMENT_ADVANTAGE, monsterRules:{maxSlots:MONSTER_PARTY_MAX,pointBudget:MONSTER_POINT_BUDGET}, spellRules:{min:DECK_MIN,max:DECK_MAX}, battleRules:BATTLE_RULES, biomes: BIOMES,
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
      const seen=new Set(),deck=(Array.isArray(b.deck)?b.deck:[]).filter(cid=>CARD_BY_ID[cid]?.type==='spell'&&prof.collection[cid]>0&&!seen.has(cid)&&seen.add(cid)).slice(0,DECK_MAX);if(deck.length<DECK_MIN)throw new Error(`스펠 덱은 최소 ${DECK_MIN}종이 필요합니다.`);prof.monsterParty=party;prof.deck=deck;saveProfiles();return ok(res,{profile:profileView(prof)});
    }
    if (p === '/api/deck' && req.method === 'POST') {
      const b=await parseBody(req),prof=await authProfile(req,res,b),seen=new Set();const raw=(Array.isArray(b.deck)?b.deck:[]).filter(cid=>CARD_BY_ID[cid]?.type==='spell'&&prof.collection[cid]>0&&!seen.has(cid)&&seen.add(cid)).slice(0,DECK_MAX);if(raw.length<DECK_MIN)throw new Error(`스펠 덱은 최소 ${DECK_MIN}종이 필요합니다.`);prof.deck=raw;saveProfiles();return ok(res,{profile:profileView(prof)});
    }
    if (p === '/api/gacha/pull' && req.method === 'POST') {
      const b = await parseBody(req); const prof = await authProfile(req, res, b); return ok(res, pullGacha(prof, b.count));
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
        if (action === 'vote') { voteRoute(room, prof.id, b.nodeId); return ok(res, { room: roomView(room) }); }
        if (action === 'contract') { chooseRunContract(room, prof.id, b.contractId); return ok(res, { room: roomView(room) }); }
        if (action === 'play') { playCard(room, prof.id, b.handIndex, b.targetUid, b.targetMonsterId); return ok(res, { room: roomView(room) }); }
        if (action === 'move') { const result=useMonsterMove(room,prof.id,b.instanceId,b.moveId,b.targetUid); return ok(res,{result,room:roomView(room)}); }
        if (action === 'recall-unit') { const unit = recallUnit(room, prof.id, b.instanceId); return ok(res, { result:{ name:unit.name, cardId:unit.cardId }, room: roomView(room) }); }
        if (action === 'monster-evolve') { const unit=evolveMonster(room,prof.id,b.instanceId,b.mode); return ok(res,{result:{name:unit.name,mode:b.mode},room:roomView(room),profile:profileView(profiles[prof.id])}); }
        if (action === 'monster-fuse') { const unit=fuseMonsters(room,prof.id,b.primaryId,b.secondaryId); return ok(res,{result:{name:unit.name},room:roomView(room),profile:profileView(profiles[prof.id])}); }
        if (action === 'switch-monster') { const unit=switchMonster(room,prof.id,b.activeId,b.benchId); return ok(res,{result:{name:unit.name},room:roomView(room)}); }
        if (action === 'end-turn') { endTurn(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'event') { chooseEvent(room, prof.id, b.choiceId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'reward') { claimReward(room, prof.id, b.rewardId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'learn-move') { const result=teachMonsterMove(room,prof.id,b.moveId,b.replaceIndex); return ok(res,{result,room:roomView(room)}); }
        if (action === 'skip-move') { const result=skipMonsterMoveOffer(room,prof.id); return ok(res,{result,room:roomView(room)}); }
        if (action === 'salvage') { salvageReward(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'relic') { claimRelicReward(room, prof.id, b.relicId); return ok(res, { room: roomView(room) }); }
        if (action === 'camp') { const result=campRewardAction(room, prof.id, b.mode, b.cardId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'trim') { const result=trimRewardDeck(room, prof.id, b.cardId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'reroll') { const result = rerollReward(room, prof.id, 'gold'); return ok(res, { result, room: roomView(room) }); }
        if (action === 'reroll-fragment') { const result = rerollReward(room, prof.id, 'fragment'); return ok(res, { result, room: roomView(room) }); }
        if (action === 'buy') { buyReward(room, prof.id, b.itemId, b.itemType); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'continue') { continueAfterReward(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'capture') { const result = attemptCapture(room, prof.id, b.sealType); return ok(res, { result, room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'capture-pass') { const result = passCapture(room, prof.id); return ok(res, { result, room: roomView(room) }); }
        if (action === 'debug-monster' && process.env.TEST_MODE === '1') {
          const pc=getPc(room,prof.id),unit=findCombatMonster(pc,b.instanceId);if(!pc||!unit)throw new Error('테스트 몬스터를 찾을 수 없습니다.');
          if(b.level!=null)unit.level=Number(b.level);if(b.gene!=null)unit.gene=Number(b.gene);if(b.resonance!=null)unit.resonance=Number(b.resonance);if(b.rift!=null)unit.rift=Number(b.rift);if(b.hpRatio!=null)unit.hp=Math.max(1,Math.round(unit.maxHp*Number(b.hpRatio)));
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
      console.log(`[RIFT DECK v${VERSION}] ${DEPLOY_ID} dynamic server listening on http://${HOST}:${PORT}`);
      console.log(`[RIFT DECK] persistence=${SUPABASE_ACTIVE ? 'Supabase + JSON fallback' : 'JSON local (Supabase env not configured)'} auth=${SUPABASE_AUTH_ACTIVE ? 'Supabase Auth' : 'guest-only'}`);
    });
  })().catch(err => { console.error('[RIFT DECK] boot failed', err); process.exit(1); });
}

module.exports = { server, CATALOG, DUNGEON_MAX_FLOOR, CARDS, ITEMS, DIFFICULTIES };
