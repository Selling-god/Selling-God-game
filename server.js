'use strict';

/**
 * RIFT DECK: ABYSS EXPEDITION v2.5
 * Dynamic, server-authoritative browser card roguelite.
 *
 * Design goals:
 * - 1-4 player synchronous co-op rooms
 * - 50-floor dungeon with three difficulty levels
 * - card/unit/spell combat inspired by deckbuilding roguelites
 * - after EVERY dungeon floor, each player drafts one free card OR run item
 * - journey encounters can permanently seal/capture cards
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
const VERSION = '2.6.0';
const DEPLOY_ID = 'RIFT-V2.6.0-COMBAT-POLISH-20260910';
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

function migrateProfile(p) {
  p.cloud = Boolean(p.cloud);
  p.accountId = p.accountId ? String(p.accountId) : '';
  p.gems = Number(p.gems ?? 2200);
  p.dust = Number(p.dust ?? 0);
  p.seals = p.seals || { basic: 15, silver: 6, royal: 1 };
  for (const k of ['basic', 'silver', 'royal']) p.seals[k] = Number(p.seals[k] || 0);
  p.pity = p.pity || { legendary: 0, mythic: 0 };
  p.collection = p.collection && typeof p.collection === 'object' ? p.collection : {};
  for (const id of Object.keys(p.collection)) if (!CARD_BY_ID[id]) delete p.collection[id];

  for (const cid of STARTER_POOL) {
    if (!p.collection[cid]) p.collection[cid] = 1;
  }
  p.deck = Array.isArray(p.deck) ? p.deck.filter(id => CARD_BY_ID[id] && p.collection[id] > 0) : [];
  if (p.deck.length < 8) p.deck = STARTER_POOL.slice(0, 10);
  p.deck = [...new Set(p.deck)].slice(0, 16);

  p.stats = p.stats || {};
  const defaults = {
    journeys: 0, dungeons: 0, dungeonClears: 0, bosses: 0, cardsCaught: 0,
    bestDungeonFloor: 0, bestJourneyFloor: 0, gachaPulls: 0,
    normalClears: 0, hardClears: 0, hellClears: 0,
    bestNormalFloor: 0, bestHardFloor: 0, bestHellFloor: 0,
    loginCount: 0, lastLoginAt: 0, perfectBattles: 0, bestChain: 0, overdrives: 0
  };
  for (const [k, v] of Object.entries(defaults)) if (p.stats[k] == null) p.stats[k] = v;
  p.history = Array.isArray(p.history) ? p.history.filter(x => x && typeof x === 'object').slice(0, 20) : [];
  return p;
}

function ensureProfile(profileId, nickname) {
  let p = profiles[profileId];
  if (!p) {
    p = profiles[profileId] = {
      id: profileId,
      nickname: sanitizeName(nickname),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      gems: 2200,
      dust: 0,
      seals: { basic: 15, silver: 6, royal: 1 },
      pity: { legendary: 0, mythic: 0 },
      collection: {},
      deck: STARTER_POOL.slice(0, 10),
      stats: {},
      history: [],
      cloud: false,
      accountId: ''
    };
  }
  migrateProfile(p);
  p.nickname = sanitizeName(nickname || p.nickname);
  p.lastSeenAt = Date.now();
  return p;
}

function addCardToProfile(p, cardId, count = 1, save = true) {
  const c = CARD_BY_ID[cardId];
  if (!c) return;
  const old = Number(p.collection[cardId] || 0);
  p.collection[cardId] = old + count;
  if (old > 0) p.dust += Number(RARITY[c.rarity]?.dust || 0) * count;
  if (save) saveProfiles();
}

function profileView(p) {
  return {
    id: p.id,
    nickname: p.nickname,
    gems: p.gems,
    dust: p.dust,
    seals: p.seals,
    pity: p.pity,
    collection: p.collection,
    deck: p.deck,
    stats: p.stats,
    history: p.history || [],
    ownedCount: Object.keys(p.collection).length,
    totalCards: CARDS.length,
    cloud: Boolean(p.cloud),
    accountId: p.accountId || ''
  };
}

function validDeck(deck) {
  const d = [...new Set((Array.isArray(deck) ? deck : []).filter(x => CARD_BY_ID[x]))];
  const base = d.length >= 8 ? d : STARTER_POOL.slice(0, 10);
  const out = [];
  while (out.length < 14) out.push(base[out.length % base.length]);
  return out.slice(0, 24);
}

function newRunPlayer(p) {
  return {
    playerId: p.id,
    nickname: p.nickname,
    maxHp: 92,
    hp: 92,
    runDeck: validDeck(p.deck),
    relics: [],
    items: {},
    upgrades: {},
    mods: {},
    fragments: 0,
    gold: 180,
    cardsAdded: 0,
    itemsAdded: 0,
    revivesUsed: 0,
    rewardRerolls: 0,
    removals: 0,
    contract: null
  };
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

function makeCombatant(run, index) {
  const relicEnergy = run.relics.includes('r004') ? 1 : 0;
  const relicHpPenalty = run.relics.includes('r004') ? 8 : 0;
  const maxEnergy = 3 + relicEnergy + Math.floor(modTotal(run, 'maxEnergy'));
  const maxHp = Math.max(45, run.maxHp - relicHpPenalty);
  const handLimit = 10 + Math.floor(modTotal(run, 'handLimit'));
  const pc = {
    playerId: run.playerId,
    nickname: run.nickname,
    index,
    maxHp,
    hp: Math.min(run.hp, maxHp),
    block: Math.floor(modTotal(run, 'startBlock')) + (run.relics.includes('r006') ? 10 : 0),
    energy: maxEnergy + Math.floor(modTotal(run, 'firstTurnEnergy')),
    maxEnergy,
    handLimit,
    drawPile: shuffle(run.runDeck),
    discard: [],
    exhaust: [],
    hand: [],
    units: [],
    ended: false,
    down: false,
    weak: 0,
    upgrades: { ...(run.upgrades || {}) },
    itemMods: {
      unitPower: modTotal(run, 'unitPower'),
      spellPower: modTotal(run, 'spellPower'),
      damagePct: modTotal(run, 'damagePct'),
      bossDamagePct: modTotal(run, 'bossDamagePct'),
      blockPct: modTotal(run, 'blockPct'),
      healPct: modTotal(run, 'healPct'),
      damageReduction: Math.min(0.55, modTotal(run, 'damageReduction')),
      retainBlock: Math.min(0.75, modTotal(run, 'retainBlock')),
      thorns: modTotal(run, 'thorns')
    },
    buffs: {
      nextAttack: run.relics.includes('r001') ? 4 : 0,
      spellDiscount: 0,
      anyDiscount: Math.floor(modTotal(run, 'startDiscount')),
      debuffImmune: false,
      thorns: modTotal(run, 'thorns'),
      nextUnitBlock: 0,
      teamSpellCount: 0,
      energyDebt: 0
    },
    relics: run.relics.slice(),
    chain: { count: 0, lastType: null, best: 0, overdrives: 0 },
    stats: { cardsPlayed: 0, damage: 0, healing: 0, hpDamageTaken: 0 }
  };
  drawCards(pc, 5 + Math.floor(modTotal(run, 'drawBonus')) + (run.relics.includes('r007') ? 1 : 0));
  return pc;
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
  pushRoomEvent(room, 'start', `${label}에 진입했습니다. 첫 경로를 고르기 전 원정 서약을 선택하세요.`);
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
    run.gold = Math.max(0, run.gold - 70); const pool=RELICS.filter(r=>['common','rare'].includes(r.rarity)); const relic=choose(pool); if(relic) addRelic(run,relic.id);
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
  const pool = ['combat', 'combat', 'combat', 'combat', 'event', 'rest', 'treasure', 'merchant'];
  const out = [];
  while (out.length < 3) {
    const k = choose(pool);
    if (out.filter(x => x === k).length < 2) out.push(k);
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
  const cards = rewardCardOptions(room, null, 4, 'merchant').map(c => ({
    id: uid('shop'), type: 'card', cardId: c.id, card: publicCard(c), price: cardPrice(c)
  }));
  const items = rewardItemOptions(room, null, 3, 'merchant').map(i => ({
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
    const pool = CARDS.filter(c => !c.limited && c.rarity !== 'common');
    const c = weighted(pool, c => Number(RARITY[c.rarity].travelWeight) * (room.floor >= 31 && ['ultra','legendary','mythic'].includes(c.rarity) ? 1.7 : 1));
    addCardToProfile(p, c.id, 1, false);
    if (run.runDeck.length < 40) run.runDeck.push(c.id);
    run.cardsAdded++;
    message = `체력 ${loss}를 대가로 「${c.name}」 획득.`;
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
  room.status = 'battle';
  room.route = null;
  room.event = null;
  const party = room.players.map((p, i) => makeCombatant(room.runState[p.id], i));
  const teamStartBlock = room.players.reduce((sum, p) => sum + modTotal(room.runState[p.id], 'teamStartBlock'), 0);
  if (teamStartBlock) party.forEach(pc => pc.block += teamStartBlock);

  const scale = Math.max(1, room.players.length);
  let enemyCount;
  if (tier === 'boss') enemyCount = 1;
  else if (tier === 'elite') enemyCount = Math.min(3, Math.max(1, Math.ceil(scale * 0.7)));
  else enemyCount = Math.min(4, Math.max(1, Math.ceil(scale * 0.75) + (room.floor >= 31 ? 1 : 0)));

  const diff = roomDifficulty(room);
  const biome = currentBiome(room);
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    let base;
    if (tier === 'boss') {
      base = clone(BOSSES[Math.min(BOSSES.length - 1, Math.floor((room.floor - 1) / 10))]);
    } else {
      let pool = ENEMIES.filter(e => e.biome === biome.id);
      if (tier === 'elite') pool = pool.filter(e => ['rare', 'ultra'].includes(e.tier));
      else if (room.floor < 8) pool = pool.filter(e => e.tier !== 'ultra');
      base = clone(choose(pool.length ? pool : ENEMIES));
    }
    const threat = threatMods(room);
    const floorHp = (1 + (room.floor - 1) * 0.022) * (1 + threat.hp);
    const floorAtk = (1 + (room.floor - 1) * 0.012) * (1 + threat.atk);
    const partyHp = (1 + (scale - 1) * 0.48) * diff.partyScale;
    const eliteScale = tier === 'elite' ? 1.24 : 1;
    base.uid = uid('enemy');
    base.maxHp = Math.round(base.hp * floorHp * partyHp * eliteScale * diff.enemyHp);
    base.hp = base.maxHp;
    base.atk = Math.round(base.atk * floorAtk * (1 + (scale - 1) * 0.11) * (tier === 'elite' ? 1.10 : 1) * diff.enemyAtk);
    base.block = 0;
    base.debuffs = { weak: 0, vulnerable: 0, burn: 0, shock: 0, intentSeal: 0 };
    base.nextDamageHalf = false;
    base.counter = 0;
    base.phase = tier === 'boss' ? 1 : 0;
    base.enraged = false;
    base.staggerMax = Math.max(18, Math.round(base.maxHp * (tier === 'boss' ? 0.22 : tier === 'elite' ? 0.25 : 0.28)));
    base.stagger = 0;
    base.broken = 0;
    base.justBroken = false;
    base.intent = rollIntent(base, tier, room.difficulty);
    enemies.push(base);
  }
  room.battle = { tier, turn: 1, phase: 'players', party, enemies, log: [], teamSpellCount: 0 };
  battleLog(room, `${tier === 'boss' ? '보스' : tier === 'elite' ? '정예' : '적'} 조우!`);
  pushRoomEvent(room, 'battle-start', '전투가 시작되었습니다.', { tier, floor: room.floor, enemyIds: enemies.map(e => e.uid) });
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

function playCard(room, playerId, handIndex, targetUid) {
  const b = room.battle;
  if (room.status !== 'battle' || !b || b.phase !== 'players') throw new Error('카드를 사용할 차례가 아닙니다.');
  const pc = getPc(room, playerId);
  if (!pc || pc.down || pc.ended) throw new Error('행동할 수 없습니다.');
  const index = Number(handIndex);
  const cid = pc.hand[index];
  const base = CARD_BY_ID[cid];
  const run = room.runState[playerId];
  const c = effectiveRunCard(run, base);
  if (!c) throw new Error('카드가 없습니다.');
  const previewCost = Math.max(0, c.cost - (pc.buffs.anyDiscount > 0 ? 1 : (c.type === 'spell' && pc.buffs.spellDiscount > 0 ? 1 : 0)));
  if (pc.energy < previewCost) throw new Error('에너지가 부족합니다.');
  if (c.type === 'unit' && pc.units.length >= 3) throw new Error('유닛 슬롯은 3칸입니다.');
  const cost = resolveCost(pc, c);
  pc.energy -= cost;
  pc.hand.splice(index, 1);
  pc.stats.cardsPlayed++;
  const target = aliveEnemies(room).find(e => e.uid === targetUid) || aliveEnemies(room)[0];
  if (c.type === 'unit') summonUnit(room, pc, c, target);
  else castSpell(room, pc, c, target);
  pc.discard.push(cid);
  const chainResult = updateTacticalChain(room, pc, c);
  const phaseShifts = updateBossPhase(room);
  const breakTargets = b.enemies.filter(e => e.justBroken && e.hp > 0);
  for (const e of b.enemies) e.justBroken = false;
  if (checkBattleEnd(room)) return;
  pushRoomEvent(room, 'card', `${pc.nickname}: ${c.name}`, { playerId: pc.playerId, cardId: c.id, cardName: c.name, cardType: c.type, element: c.element, targetUid: target?.uid || null, cost, chainCount: chainResult.displayCount, chainStage: chainResult.stage, upgradeLevel:c.upgradeLevel||0 });
  for (const e of breakTargets) pushRoomEvent(room, 'enemy-break', `${e.name}의 균열 자세가 붕괴했습니다!`, { enemyUid:e.uid, enemyName:e.name });
  if (chainResult.stage) pushRoomEvent(room, 'chain', `${pc.nickname} ${chainResult.stage === 'overdrive' ? '오버드라이브' : '전술 연쇄'} 발동!`, { playerId: pc.playerId, stage: chainResult.stage, count: chainResult.displayCount });
  for (const e of phaseShifts) pushRoomEvent(room, 'boss-phase', `${e.name}이(가) 2단계로 돌입했습니다!`, { enemyUid: e.uid, enemyName: e.name, phase: 2 });
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

function castSpell(room, pc, c, target) {
  room.battle.teamSpellCount++;
  applyEffects(room, pc, c.effects, target, c);
  for (const ally of room.battle.party.filter(x => !x.down)) {
    for (const u of ally.units) {
      const def = CARD_BY_ID[u.cardId];
      if (def?.unit?.onSpell === 'ping2') {
        const e = choose(aliveEnemies(room));
        if (e) applyDamage(e, 2);
      }
      if (def?.unit?.onSpell === 'echoThird' && room.battle.teamSpellCount % 3 === 0 && c.power > 0 && target) applyDamage(target, Math.max(1, Math.round(c.power * 0.55)));
      if (def?.unit?.aura === 'whiteNight' && room.battle.teamSpellCount % 3 === 0) aliveEnemies(room).forEach(e => applyDamage(e, 6));
    }
  }
  battleLog(room, `${pc.nickname}이(가) ${c.name} 사용.`);
}

function updateTacticalChain(room, pc, card) {
  pc.chain ||= { count: 0, lastType: null, best: 0, overdrives: 0 };
  const chain = pc.chain;
  if (chain.lastType && chain.lastType !== card.type) chain.count += 1;
  else chain.count = 1;
  chain.lastType = card.type;
  chain.best = Math.max(Number(chain.best || 0), chain.count);
  const p = profiles[pc.playerId];
  if (p) p.stats.bestChain = Math.max(Number(p.stats.bestChain || 0), chain.best);
  let stage = '';
  const displayCount = chain.count;
  if (chain.count === 3) {
    drawCards(pc, 1);
    pc.block += 4;
    stage = 'flow';
    battleLog(room, `${pc.nickname} 전술 연쇄 3! 드로우 +1 · 방어 +4.`);
  } else if (chain.count >= 5) {
    pc.energy += 1;
    pc.buffs.nextAttack += 6;
    chain.overdrives += 1;
    if (p) p.stats.overdrives = Number(p.stats.overdrives || 0) + 1;
    stage = 'overdrive';
    battleLog(room, `${pc.nickname} OVERDRIVE! 에너지 +1 · 다음 공격 +6.`);
    chain.count = 0;
    chain.lastType = null;
  }
  return { stage, displayCount };
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
  const taken = Number(pc?.stats?.hpDamageTaken || 0);
  const ratio = pc?.maxHp ? taken / pc.maxHp : 1;
  const turn = Number(battle?.turn || 99);
  if (taken === 0 && turn <= 5) return 'S';
  if (ratio <= 0.12 && turn <= 7) return 'A';
  if (ratio <= 0.35 && turn <= 10) return 'B';
  return 'C';
}

function modifiedDamage(room, pc, base, source) {
  let v = Number(base || 0);
  if (source?.type === 'spell') v += Number(pc.itemMods.spellPower || 0);
  v *= 1 + Number(pc.itemMods.damagePct || 0);
  if (room.battle?.tier === 'boss') v *= 1 + Number(pc.itemMods.bossDamagePct || 0);
  if (room.floor >= 41 && pc.relics.includes('r008')) v *= 1.08;
  return Math.max(0, Math.round(v));
}
function modifiedBlock(pc, base) { return Math.max(0, Math.round(Number(base || 0) * (1 + Number(pc.itemMods.blockPct || 0)))); }
function modifiedHeal(pc, base) { return Math.max(0, Math.round(Number(base || 0) * (1 + Number(pc.itemMods.healPct || 0)))); }

function applyEffects(room, pc, effects, target, source) {
  const b = room.battle;
  for (const fx of effects || []) {
    const v = Number(fx.value || 0);
    let bonus = 0;
    if (['damage', 'damageAll', 'damageOthers', 'bossDamage'].includes(fx.op) && pc.buffs.nextAttack > 0) {
      bonus = pc.buffs.nextAttack;
      pc.buffs.nextAttack = 0;
    }
    if (fx.op === 'damage' && target) pc.stats.damage += applyDamage(target, modifiedDamage(room, pc, v + bonus, source));
    else if (fx.op === 'damageAll') aliveEnemies(room).forEach(e => pc.stats.damage += applyDamage(e, modifiedDamage(room, pc, v + bonus, source)));
    else if (fx.op === 'damageOthers') aliveEnemies(room).filter(e => e !== target).forEach(e => pc.stats.damage += applyDamage(e, modifiedDamage(room, pc, v, source)));
    else if (fx.op === 'bossDamage' && target) pc.stats.damage += applyDamage(target, modifiedDamage(room, pc, v + bonus + (['elite', 'boss'].includes(b.tier) ? Number(fx.bossBonus || 0) : 0), source));
    else if (fx.op === 'block') pc.block += modifiedBlock(pc, v);
    else if (fx.op === 'blockAllies') b.party.filter(x => !x.down).forEach(x => x.block += modifiedBlock(x, v));
    else if (fx.op === 'heal') { const before = pc.hp; pc.hp = clamp(pc.hp + modifiedHeal(pc, v), 0, pc.maxHp); pc.stats.healing += pc.hp - before; }
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
    else if (fx.op === 'energyDebt') pc.buffs.energyDebt += v;
  }
}

function applyDamage(e, amount) {
  let d = Math.max(0, Math.round(amount));
  if (e.debuffs?.vulnerable > 0) d = Math.round(d * 1.5);
  if (e.debuffs?.shock > 0) d += Math.min(8, e.debuffs.shock);
  const blocked = Math.min(e.block || 0, d);
  e.block = (e.block || 0) - blocked;
  d -= blocked;
  e.hp = clamp(e.hp - d, 0, e.maxHp);
  if (d > 0 && e.staggerMax && !e.broken && e.hp > 0) {
    e.stagger = clamp(Number(e.stagger || 0) + Math.max(1, Math.round(d * 0.46)), 0, e.staggerMax);
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
  const b = room.battle;
  if (room.status !== 'battle' || !b || b.phase !== 'players') throw new Error('전투 중이 아닙니다.');
  const pc = getPc(room, playerId);
  if (!pc || pc.down) return;
  pc.ended = true;
  battleLog(room, `${pc.nickname} 준비 완료.`);
  const active = b.party.filter(x => !x.down);
  if (active.length && active.every(x => x.ended)) enemyTurn(room);
  else pushRoomEvent(room, 'end-turn', `${pc.nickname} 님이 턴을 종료했습니다.`);
}

function enemyTurn(room) {
  const b = room.battle;
  b.phase = 'enemies';
  for (const pc of b.party.filter(x => !x.down)) {
    for (const u of pc.units) {
      let target = aliveEnemies(room)[0];
      if (!target) break;
      let power = u.power;
      const def = CARD_BY_ID[u.cardId];
      const hook = def?.unit?.onAttack;
      u.counter++;
      if (hook === 'weakBonus5' && target.debuffs.weak > 0) power += 5;
      if (hook === 'fullBonus' && target.hp === target.maxHp) power += 3;
      if (hook === 'firstBonus4' && u.counter === 1) power += 4;
      if (hook === 'blockBonus6' && target.block > 0) power += 6;
      if (hook === 'summonDouble' && u.summonedTurn === b.turn) power *= 2;
      if (hook === 'bossBonus10' && b.tier === 'boss') power += 10;
      if (pc.relics.includes('r005') && b.tier === 'boss') power += 4;
      power = modifiedDamage(room, pc, power, def);
      const dealt = applyDamage(target, power);
      pc.stats.damage += dealt;
      battleLog(room, `${u.name} → ${target.name} ${dealt} 피해.`);
      if (hook === 'weak25' && Math.random() < 0.25) target.debuffs.weak++;
      if (hook === 'chainEvery2' && u.counter % 2 === 0) aliveEnemies(room).forEach(e => applyDamage(e, 3));
      if (hook === 'extraEvery2' && u.counter % 2 === 0 && target.hp > 0) pc.stats.damage += applyDamage(target, power);
      if (hook === 'extra20' && Math.random() < 0.20 && target.hp > 0) pc.stats.damage += applyDamage(target, power);
      if (hook === 'splash40') aliveEnemies(room).filter(e => e !== target).forEach(e => pc.stats.damage += applyDamage(e, power * 0.4));
      if (hook === 'teamBlockEvery3' && u.counter % 3 === 0) b.party.filter(x => !x.down).forEach(x => x.block += 8);
      if (hook === 'mythicPulse' && u.counter % 2 === 0) aliveEnemies(room).forEach(e => applyDamage(e, 12));
      if (hook === 'killEnergy' && target.hp <= 0 && !u.killPaid) { pc.energy++; u.killPaid = true; }
      const phaseShifts = updateBossPhase(room);
      for (const phaseEnemy of phaseShifts) pushRoomEvent(room, 'boss-phase', `${phaseEnemy.name}이(가) 2단계로 돌입했습니다!`, { enemyUid: phaseEnemy.uid, enemyName: phaseEnemy.name, phase: 2 });
      if (checkBattleEnd(room)) return;
    }
  }

  for (const e of aliveEnemies(room)) {
    e.counter++;
    if (e.debuffs.burn > 0) {
      const d = applyDamage(e, e.debuffs.burn);
      e.debuffs.burn = Math.max(0, e.debuffs.burn - 1);
      battleLog(room, `${e.name} 화상 ${d}.`);
      if (e.hp <= 0) { if (checkBattleEnd(room)) return; continue; }
    }
    if (e.broken > 0) {
      e.broken = 0;
      e.stagger = 0;
      e.debuffs.vulnerable = Math.max(Number(e.debuffs.vulnerable || 0), 1);
      battleLog(room, `${e.name} RIFT BREAK! 자세를 회복하느라 행동하지 못했습니다.`);
      e.intent = rollIntent(e, b.tier, room.difficulty);
      continue;
    }
    if (e.debuffs.intentSeal > 0) {
      e.debuffs.intentSeal--;
      battleLog(room, `${e.name}의 행동이 봉인됨.`);
      e.intent = rollIntent(e, b.tier, room.difficulty);
      continue;
    }
    const targets = b.party.filter(x => !x.down);
    if (!targets.length) break;
    const t = choose(targets);
    if (['attack', 'heavy'].includes(e.intent.type)) {
      let amount = e.intent.value;
      if (e.debuffs.weak > 0) amount = Math.round(amount * 0.75);
      if (e.nextDamageHalf) { amount = Math.round(amount * 0.5); e.nextDamageHalf = false; }
      const bossGuard = t.units.filter(u => CARD_BY_ID[u.cardId]?.unit?.aura === 'bossGuard1').length;
      if (b.tier === 'boss') amount = Math.max(0, amount - bossGuard);
      const d = damagePc(room, t, amount, e);
      battleLog(room, `${e.name} → ${t.nickname} ${d} 피해.`);
    } else if (e.intent.type === 'guard') {
      e.block += e.intent.value;
      battleLog(room, `${e.name} 방어 ${e.intent.value}.`);
    } else if (e.intent.type === 'debuff') {
      if (!t.buffs.debuffImmune) { t.weak++; battleLog(room, `${t.nickname} 약화 1.`); }
    }
    e.debuffs.vulnerable = Math.max(0, e.debuffs.vulnerable - 1);
    e.debuffs.weak = Math.max(0, e.debuffs.weak - 1);
    if (e.staggerMax && !e.broken) e.stagger = Math.max(0, Number(e.stagger || 0) - Math.ceil(e.staggerMax * 0.28));
    e.intent = rollIntent(e, b.tier, room.difficulty);
  }
  if (checkBattleEnd(room)) return;
  if (b.party.every(x => x.down)) return loseBattle(room);

  b.turn++;
  for (const pc of b.party) {
    if (pc.down) continue;
    pc.block = Math.round(pc.block * Number(pc.itemMods.retainBlock || 0));
    pc.energy = Math.max(1, pc.maxEnergy - (pc.buffs.energyDebt > 0 ? 1 : 0));
    pc.buffs.energyDebt = Math.max(0, pc.buffs.energyDebt - 1);
    pc.ended = false;
    pc.buffs.debuffImmune = false;
    pc.buffs.thorns = Math.max(pc.buffs.thorns, Number(pc.itemMods.thorns || 0));
    pc.chain ||= { count: 0, lastType: null, best: 0, overdrives: 0 };
    pc.chain.count = 0;
    pc.chain.lastType = null;
    pc.weak = Math.max(0, pc.weak - 1);
    pc.discard.push(...pc.hand);
    pc.hand = [];
    drawCards(pc, 5);
    for (const u of pc.units) {
      const h = CARD_BY_ID[u.cardId]?.unit?.onRound;
      if (h === 'healLowest2') { const x = b.party.filter(x => !x.down).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0]; if (x) x.hp = clamp(x.hp + 2, 0, x.maxHp); }
      if (h === 'healLowest4') { const x = b.party.filter(x => !x.down).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0]; if (x) x.hp = clamp(x.hp + 4, 0, x.maxHp); }
      if (h === 'healAll2') b.party.filter(x => !x.down).forEach(x => x.hp = clamp(x.hp + 2, 0, x.maxHp));
      if (h === 'oracle') { drawCards(pc, 1); const x = b.party.filter(x => !x.down).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0]; if (x) x.hp = clamp(x.hp + 6, 0, x.maxHp); }
    }
  }
  b.phase = 'players';
  pushRoomEvent(room, 'turn', `턴 ${b.turn} 시작.`);
}

function checkBattleEnd(room) {
  const b = room.battle;
  if (!b) return false;
  if (b.enemies.every(e => e.hp <= 0)) { winBattle(room); return true; }
  if (b.party.every(p => p.down)) { loseBattle(room); return true; }
  return false;
}
function syncRunHealth(room) {
  if (!room.battle) return;
  for (const pc of room.battle.party) {
    const run = room.runState[pc.playerId];
    if (run) run.hp = pc.hp <= 0 ? Math.max(1, Math.round(run.maxHp * 0.20)) : Math.min(run.maxHp, pc.hp);
  }
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
  if (room.mode === 'journey' && Math.random() < (boss ? 0.70 : b.tier === 'elite' ? 0.42 : 0.27)) room.capture = makeCaptureEncounter(room.floor, b.tier, room);
  battleLog(room, '승리!');
  pushRoomEvent(room, 'win', '전투에서 승리했습니다.', { tier: b.tier, floor: room.floor, final: room.finalClearPending, perfectPlayers: Object.keys(perfectBy).length });
}

function loseBattle(room) {
  syncRunHealth(room);
  room.status = 'ended';
  room.reward = {
    kind: 'defeat',
    title: '원정 실패',
    text: `${room.floor}층에서 탐험이 종료되었습니다. 영구 획득한 카드와 재화는 유지됩니다.`,
    playerOptions: {}, claims: {}, continueBy: []
  };
  recordRunHistory(room, 'defeat');
  saveProfiles();
  pushRoomEvent(room, 'defeat', '원정대가 쓰러졌습니다.', { floor: room.floor });
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
  const pool = CARDS.filter(c => !c.limited);
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
  const pool = ITEMS;
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
  const pool = RELICS.filter(r => !owned.has(r.id));
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
  const extra = clamp(Math.floor(modTotal(run, 'rewardChoices')), 0, 2);
  const count = 5 + extra;
  const cardCount = Math.max(3, Math.ceil(count * 0.58));
  const itemCount = count - cardCount;
  const cards = rewardCardOptions(room, playerId, cardCount, tier).map(c => ({
    id: uid('reward'), type: 'card', cardId: c.id, card: publicCard(c), rarity: c.rarity, label: c.name
  }));
  const items = rewardItemOptions(room, playerId, itemCount, tier).map(i => ({
    id: uid('reward'), type: 'item', itemId: i.id, item: publicItem(i), rarity: i.rarity, label: i.name
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

function makeCaptureEncounter(floor, tier, room) {
  const pool = CARDS.filter(c => !c.limited);
  const c = weighted(pool, c => {
    let w = Number(RARITY[c.rarity].travelWeight);
    if (floor < 10 && c.rarity === 'legendary') w *= 0.10;
    if (floor < 20 && c.rarity === 'mythic') w *= 0.02;
    if (tier === 'elite' && ['ultra', 'legendary'].includes(c.rarity)) w *= 2.0;
    if (tier === 'boss' && ['ultra', 'legendary', 'mythic'].includes(c.rarity)) w *= 3.2;
    if (room?.difficulty === 'hell' && ['ultra', 'legendary', 'mythic'].includes(c.rarity)) w *= 1.25;
    return w;
  });
  return { id: uid('echo'), cardId: c.id, card: publicCard(c), attemptedBy: [], escaped: false, caughtBy: null };
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
    const before=run.hp; run.hp=clamp(run.hp+heal,1,run.maxHp); label=`휴식 · HP +${run.hp-before}`;
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
    addCardToProfile(p, opt.cardId, 1, false);
    if (run && run.runDeck.length < 40) { run.runDeck.push(opt.cardId); run.cardsAdded++; }
    room.reward.claims[playerId] = { type: 'card', id: opt.cardId, label: CARD_BY_ID[opt.cardId].name };
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
    addCardToProfile(profiles[playerId], product.cardId, 1, false);
    if (run.runDeck.length < 40) run.runDeck.push(product.cardId);
  } else addItemToRun(run, product.itemId);
  room.reward.purchased[key] = true;
  saveProfiles();
  pushRoomEvent(room, 'buy', `${playerName(room, playerId)} 님이 상점 상품을 구매했습니다.`);
}

function continueAfterReward(room, playerId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('진행할 수 없습니다.');
  const options = room.reward.playerOptions?.[playerId] || [];
  if (options.length && !room.reward.claims[playerId]) throw new Error('보상을 선택하거나 분해해 주세요.');
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
    }
  }
  makeRoute(room);
  pushRoomEvent(room, 'floor', `${room.floor}층으로 이동합니다.`);
}

function attemptCapture(room, playerId, sealType) {
  if (room.mode !== 'journey' || room.status !== 'reward' || !room.capture || room.capture.escaped) throw new Error('봉인할 카드 흔적이 없습니다.');
  const cap = room.capture;
  if (cap.attemptedBy.includes(playerId)) throw new Error('이 흔적에는 이미 시도했습니다.');
  const p = profiles[playerId];
  const run = room.runState[playerId];
  const seal = String(sealType || 'basic');
  const mult = { basic: 1, silver: 1.75, royal: 3.35 }[seal];
  if (!mult) throw new Error('봉인구 종류 오류');
  if ((p.seals[seal] || 0) <= 0) throw new Error('봉인구가 없습니다.');
  p.seals[seal]--;
  cap.attemptedBy.push(playerId);
  const c = CARD_BY_ID[cap.cardId];
  let chance = Number(RARITY[c.rarity].sealBase) * mult;
  if (run?.relics.includes('r003')) chance += 0.08;
  chance += modTotal(run, 'captureBonus');
  chance = Math.min(c.rarity === 'mythic' ? 0.22 : c.rarity === 'legendary' ? 0.44 : 0.96, chance);
  const success = Math.random() < chance;
  if (success) {
    addCardToProfile(p, c.id, 1, false);
    if (run.runDeck.length < 40) run.runDeck.push(c.id);
    p.stats.cardsCaught++;
    cap.caughtBy = playerId;
    cap.escaped = true;
    saveProfiles();
    pushRoomEvent(room, 'capture', `${c.name} 봉인 성공!`);
  } else {
    const escapeReduction = modTotal(run, 'captureEscapeReduction');
    const escapeChance = Math.max(0.12, 0.42 - escapeReduction);
    if (Math.random() < escapeChance) cap.escaped = true;
    saveProfiles();
    pushRoomEvent(room, 'capture-fail', cap.escaped ? `${c.name}의 흔적이 사라졌습니다.` : `${c.name} 봉인 실패. 아직 흔적이 남았습니다.`);
  }
  return { success, chance, escaped: cap.escaped };
}

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
  for (let i = 0; i < n; i++) {
    const rarity = rarityRoll(profile);
    const pool = CARDS.filter(c => c.rarity === rarity);
    const featured = pool.filter(c => c.limited && BANNER.featured.includes(c.id));
    const regular = pool.filter(c => !c.limited);
    let c;
    if (featured.length && Math.random() < 0.55) c = choose(featured);
    else c = choose(regular.length ? regular : pool);
    addCardToProfile(profile, c.id, 1, false);
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
    if (p === '/healthz' || p === '/api/version') return ok(res, { service: 'RIFT_DECK_SERVER', version: VERSION, deployId: DEPLOY_ID, storage: SUPABASE_ACTIVE ? 'supabase+json-fallback' : 'json-local', auth: SUPABASE_AUTH_ACTIVE ? 'supabase' : 'guest-only', cards: CARDS.length, items: ITEMS.length, maxDungeonFloor: DUNGEON_MAX_FLOOR, rooms: rooms.size, uptime: Math.round(process.uptime()) });
    if (p === '/api/meta' && req.method === 'GET') return ok(res, {
      cards: CARDS.map(publicCard), items: ITEMS.map(publicItem), rarities: RARITY, elements: ELEMENTS, biomes: BIOMES,
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
    if (p === '/api/deck' && req.method === 'POST') {
      const b = await parseBody(req); const prof = await authProfile(req, res, b); const seen = new Set();
      const deck = (Array.isArray(b.deck) ? b.deck : []).filter(cid => CARD_BY_ID[cid] && prof.collection[cid] > 0 && !seen.has(cid) && seen.add(cid)).slice(0, 16);
      if (deck.length < 8) throw new Error('덱은 보유 카드 8~16종으로 구성해 주세요.');
      prof.deck = deck; saveProfiles(); return ok(res, { profile: profileView(prof) });
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
        if (action === 'play') { playCard(room, prof.id, b.handIndex, b.targetUid); return ok(res, { room: roomView(room) }); }
        if (action === 'end-turn') { endTurn(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'event') { chooseEvent(room, prof.id, b.choiceId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'reward') { claimReward(room, prof.id, b.rewardId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'salvage') { salvageReward(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'relic') { claimRelicReward(room, prof.id, b.relicId); return ok(res, { room: roomView(room) }); }
        if (action === 'camp') { const result=campRewardAction(room, prof.id, b.mode, b.cardId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'trim') { const result=trimRewardDeck(room, prof.id, b.cardId); return ok(res, { result, room: roomView(room) }); }
        if (action === 'reroll') { const result = rerollReward(room, prof.id, 'gold'); return ok(res, { result, room: roomView(room) }); }
        if (action === 'reroll-fragment') { const result = rerollReward(room, prof.id, 'fragment'); return ok(res, { result, room: roomView(room) }); }
        if (action === 'buy') { buyReward(room, prof.id, b.itemId, b.itemType); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'continue') { continueAfterReward(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'capture') { const result = attemptCapture(room, prof.id, b.sealType); return ok(res, { result, room: roomView(room), profile: profileView(profiles[prof.id]) }); }
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
