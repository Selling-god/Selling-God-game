'use strict';

/**
 * RIFT DECK: ABYSS EXPEDITION v2
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
const VERSION = '2.0.0';

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
function saveProfiles() {
  const tmp = PROFILE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2));
  fs.renameSync(tmp, PROFILE_FILE);
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
    bestNormalFloor: 0, bestHardFloor: 0, bestHellFloor: 0
  };
  for (const [k, v] of Object.entries(defaults)) if (p.stats[k] == null) p.stats[k] = v;
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
      stats: {}
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
    ownedCount: Object.keys(p.collection).length,
    totalCards: CARDS.length
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
    gold: 180,
    cardsAdded: 0,
    itemsAdded: 0,
    revivesUsed: 0,
    rewardRerolls: 0
  };
}

function itemStacks(run, itemId) { return Number(run?.items?.[itemId] || 0); }
function modTotal(run, key) {
  if (!run?.items) return 0;
  let total = 0;
  for (const [id, count] of Object.entries(run.items)) {
    const item = ITEM_BY_ID[id];
    if (!item) continue;
    const v = Number(item.mod?.[key] || 0);
    total += v * Number(count || 0);
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
  if (!run || !RELIC_BY_ID[relicId] || run.relics.includes(relicId)) return;
  run.relics.push(relicId);
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
    stats: { cardsPlayed: 0, damage: 0, healing: 0 }
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
    feed: [],
    seq: 0,
    finalClearPending: false
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
    feed: room.feed.slice(-36),
    seq: room.seq,
    finalClearPending: room.finalClearPending
  });
}

function pushRoomEvent(room, type, message, payload = {}) {
  room.seq++;
  room.feed.push({ seq: room.seq, time: Date.now(), type, message, payload });
  if (room.feed.length > 100) room.feed.shift();
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
  for (const rp of room.players) {
    const p = ensureProfile(rp.id, rp.nickname);
    room.runState[rp.id] = newRunPlayer(p);
    if (room.mode === 'dungeon') p.stats.dungeons++;
    else p.stats.journeys++;
  }
  saveProfiles();
  room.floor = 1;
  room.biomeIndex = 0;
  room.status = 'route';
  makeRoute(room);
  const label = room.mode === 'journey' ? '일반 여행' : `${DIFFICULTIES[room.difficulty].ko} 난이도 50층 협동 던전`;
  pushRoomEvent(room, 'start', `${label}에 진입했습니다.`);
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
    combat: '카드와 골드를 얻는 일반 전투',
    elite: '강한 적. 초희귀 이상 보상 확률 상승',
    boss: '10층마다 등장하는 지역 수호자',
    event: '선택에 따라 보상 또는 위험 발생',
    rest: '원정대 체력 회복',
    treasure: '추가 골드와 고급 보상 운 상승',
    merchant: '런 골드로 카드·아이템 구매'
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

function resolveNode(room, node) {
  if (['combat', 'elite', 'boss'].includes(node.kind)) {
    startBattle(room, node.kind);
    return;
  }
  if (node.kind === 'rest') {
    for (const rp of room.players) {
      const run = room.runState[rp.id];
      if (!run) continue;
      const bonus = (run.relics.includes('r002') ? 8 : 0) + modTotal(run, 'restFlat');
      const pct = 0.27 + modTotal(run, 'restPct');
      run.hp = clamp(run.hp + Math.round(run.maxHp * pct) + bonus, 1, run.maxHp);
      if (room.mode === 'journey') {
        const p = profiles[rp.id];
        p.seals.basic = (p.seals.basic || 0) + 1;
      }
    }
    saveProfiles();
    createFloorReward(room, 'rest', '별빛 야영지', '체력을 회복했습니다. 이제 이번 층의 무료 보상을 하나 선택하세요.', 'rest');
    pushRoomEvent(room, 'rest', '원정대가 야영지에서 숨을 고릅니다.');
    return;
  }
  if (node.kind === 'treasure') {
    const bonusGold = 90 + room.floor * 4;
    for (const rp of room.players) room.runState[rp.id].gold += bonusGold;
    createFloorReward(room, 'treasure', '봉인된 금고', `각자 런 골드 ${bonusGold}G를 획득했습니다. 보물층은 보상 등급이 조금 더 높습니다.`, 'elite');
    pushRoomEvent(room, 'treasure', '오래된 금고가 열렸습니다.');
    return;
  }
  if (node.kind === 'merchant') {
    const shop = makeMerchantStock(room);
    createFloorReward(room, 'merchant', '유랑 상점', '무료 보상 1개를 고른 뒤, 런 골드가 남는다면 상점 상품도 구매할 수 있습니다.', 'merchant', { shop, purchased: {} });
    pushRoomEvent(room, 'merchant', '등불을 든 상인이 길을 막아섰습니다.');
    return;
  }
  if (node.kind === 'event') {
    room.event = {
      id: uid('event'),
      title: choose(['금이 간 거울문', '잠든 관측소', '뒤집힌 성소', '검은 우편함']),
      text: '심연이 세 가지 대가를 제시합니다. 선택은 각 원정대원에게 개별 적용됩니다.',
      choices: [
        { id: 'safe', label: '숨을 고른다', desc: '체력 10 회복' },
        { id: 'risk', label: '심연에 손을 넣는다', desc: '체력 12 소모 · 희귀 이상 카드 획득' },
        { id: 'seal', label: '봉인 의식을 시도한다', desc: '기본 봉인구 1개 · 랜덤 런 아이템 획득 시도' }
      ],
      chosenBy: {}
    };
    room.status = 'event';
    pushRoomEvent(room, 'event', '미지의 사건이 발생했습니다.');
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
    run.hp = clamp(run.hp + 10, 1, run.maxHp);
    message = '체력 10을 회복했습니다.';
  } else if (choiceId === 'risk') {
    run.hp = Math.max(1, run.hp - 12);
    const pool = CARDS.filter(c => !c.limited && c.rarity !== 'common');
    const c = weighted(pool, c => Number(RARITY[c.rarity].travelWeight));
    addCardToProfile(p, c.id, 1, false);
    if (run.runDeck.length < 36) run.runDeck.push(c.id);
    run.cardsAdded++;
    message = `체력 12를 대가로 「${c.name}」 획득.`;
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
    createFloorReward(room, 'event', '사건 통과', '모든 원정대원이 선택을 마쳤습니다. 이번 층의 무료 보상을 고르세요.', 'event');
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
    const floorHp = 1 + (room.floor - 1) * 0.022;
    const floorAtk = 1 + (room.floor - 1) * 0.012;
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
    base.intent = rollIntent(base, tier, room.difficulty);
    enemies.push(base);
  }
  room.battle = { tier, turn: 1, phase: 'players', party, enemies, log: [], teamSpellCount: 0 };
  battleLog(room, `${tier === 'boss' ? '보스' : tier === 'elite' ? '정예' : '적'} 조우!`);
  pushRoomEvent(room, 'battle-start', '전투가 시작되었습니다.');
}

function rollIntent(e, tier, difficulty = 'normal') {
  const r = Math.random();
  const hardShift = difficulty === 'hell' ? 0.10 : difficulty === 'hard' ? 0.05 : 0;
  const heavy = Math.round(e.atk * (tier === 'boss' ? 1.72 : 1.50));
  if (r < 0.54 + hardShift) return { type: 'attack', value: e.atk, icon: '⚔', text: `공격 ${e.atk}` };
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
  const c = CARD_BY_ID[cid];
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
  if (checkBattleEnd(room)) return;
  pushRoomEvent(room, 'card', `${pc.nickname}: ${c.name}`);
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
  return d;
}

function damagePc(room, pc, amount, enemy) {
  let d = Math.max(0, Math.round(amount));
  d = Math.round(d * (1 - Number(pc.itemMods?.damageReduction || 0)));
  const blocked = Math.min(pc.block, d);
  pc.block -= blocked;
  d -= blocked;
  pc.hp = clamp(pc.hp - d, 0, pc.maxHp);
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

function winBattle(room) {
  const b = room.battle;
  syncRunHealth(room);
  const boss = b.tier === 'boss';
  const diff = roomDifficulty(room);
  const baseGold = (boss ? 170 : b.tier === 'elite' ? 105 : 55) + room.floor * 3;
  const baseGems = (boss ? 55 : b.tier === 'elite' ? 24 : 8) + Math.floor(room.floor / 5);
  for (const rp of room.players) {
    const p = profiles[rp.id];
    const run = room.runState[rp.id];
    const goldPct = 1 + modTotal(run, 'goldPct');
    const gemPct = 1 + modTotal(run, 'gemPct');
    run.gold += Math.round(baseGold * diff.gold * goldPct);
    p.gems += Math.round(baseGems * diff.gems * gemPct);
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
  const text = `전투 골드와 프리즘을 획득했습니다. 카드 또는 런 아이템 중 하나를 선택하세요.`;
  createFloorReward(room, 'battle', title, text, b.tier);
  if (room.mode === 'journey' && Math.random() < (boss ? 0.70 : b.tier === 'elite' ? 0.42 : 0.27)) room.capture = makeCaptureEncounter(room.floor, b.tier, room);
  battleLog(room, '승리!');
  pushRoomEvent(room, 'win', '전투에서 승리했습니다.');
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
  pushRoomEvent(room, 'defeat', '원정대가 쓰러졌습니다.');
}

function rewardCardWeight(room, run, c, tier) {
  let w = Number(RARITY[c.rarity]?.rewardWeight || 0);
  const order = Number(RARITY[c.rarity]?.order || 1);
  const diffLuck = roomDifficulty(room).rewardLuck;
  const itemLuck = 1 + modTotal(run, 'rewardLuck');
  const floorLuck = 1 + Math.min(0.55, room.floor / 100);
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
  if (order >= 3) w *= diffLuck * itemLuck * (1 + Math.min(0.45, room.floor / 120));
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
  for (const rp of room.players) {
    playerOptions[rp.id] = createPersonalRewardOptions(room, rp.id, tier);
    rerolls[rp.id] = 0;
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

function rerollReward(room, playerId) {
  if (room.status !== 'reward' || !room.reward) throw new Error('보상 단계가 아닙니다.');
  if (room.reward.claims[playerId]) throw new Error('이미 보상을 선택했습니다.');
  const run = room.runState[playerId];
  const count = Number(room.reward.rerolls?.[playerId] || 0);
  if (count >= 5) throw new Error('이 층에서는 최대 5회까지 재굴림할 수 있습니다.');
  const discount = Math.min(0.70, modTotal(run, 'rerollDiscount'));
  const base = 42 + room.floor * 3;
  const cost = Math.max(20, Math.round(base * Math.pow(1.55, count) * (1 - discount)));
  if (run.gold < cost) throw new Error(`런 골드가 부족합니다. 재굴림 비용 ${cost}G`);
  run.gold -= cost;
  room.reward.rerolls[playerId] = count + 1;
  room.reward.playerOptions[playerId] = createPersonalRewardOptions(room, playerId, room.reward.tier || 'combat');
  run.rewardRerolls++;
  pushRoomEvent(room, 'reroll', `${playerName(room, playerId)} 님이 보상을 재굴림했습니다.`);
  return { cost, nextCost: Math.max(20, Math.round(base * Math.pow(1.55, count + 1) * (1 - discount))) };
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
  if (options.length && !room.reward.claims[playerId]) throw new Error('먼저 카드 또는 아이템 보상 1개를 선택해 주세요.');
  if (!room.reward.continueBy.includes(playerId)) room.reward.continueBy.push(playerId);
  if (room.reward.continueBy.length < room.players.length) {
    pushRoomEvent(room, 'continue', `${playerName(room, playerId)} 님이 다음 층 준비 완료.`);
    return;
  }
  if (room.finalClearPending) {
    room.status = 'cleared';
    room.finalClearPending = false;
    const diff = roomDifficulty(room);
    const clearBonus = room.difficulty === 'hell' ? 1800 : room.difficulty === 'hard' ? 1150 : 750;
    for (const rp of room.players) {
      const p = profiles[rp.id];
      p.stats.dungeonClears++;
      p.stats[`${room.difficulty}Clears`] = Number(p.stats[`${room.difficulty}Clears`] || 0) + 1;
      p.gems += clearBonus;
    }
    saveProfiles();
    room.reward = {
      kind: 'clear',
      title: `${DIFFICULTIES[room.difficulty].ko} 난이도 심연 원정 완료`,
      text: `50층을 돌파했습니다. 원정대 전원에게 클리어 보너스 프리즘 ${clearBonus}개 지급.`,
      playerOptions: {}, claims: {}, continueBy: []
    };
    pushRoomEvent(room, 'clear', `50층 ${DIFFICULTIES[room.difficulty].ko} 던전을 클리어했습니다!`);
    return;
  }

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
      'Cache-Control': ext === '.html' ? 'no-store' : longCache ? 'public, max-age=604800, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

function authProfile(body) {
  const pid = String(body.profileId || '').trim();
  if (!pid || pid.length > 96) throw new Error('프로필 ID가 필요합니다.');
  return ensureProfile(pid, body.nickname);
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
    if (p === '/healthz') return ok(res, { service: 'RIFT_DECK_SERVER', version: VERSION, rooms: rooms.size, uptime: Math.round(process.uptime()) });
    if (p === '/api/meta' && req.method === 'GET') return ok(res, {
      cards: CARDS.map(publicCard), items: ITEMS.map(publicItem), rarities: RARITY, elements: ELEMENTS, biomes: BIOMES,
      relics: RELICS, banner: BANNER, difficulties: DIFFICULTIES, version: VERSION, maxDungeonFloor: DUNGEON_MAX_FLOOR
    });
    if (p === '/api/profile' && req.method === 'POST') {
      const b = await parseBody(req); const prof = authProfile(b); saveProfiles(); return ok(res, { profile: profileView(prof) });
    }
    if (p === '/api/deck' && req.method === 'POST') {
      const b = await parseBody(req); const prof = authProfile(b); const seen = new Set();
      const deck = (Array.isArray(b.deck) ? b.deck : []).filter(cid => CARD_BY_ID[cid] && prof.collection[cid] > 0 && !seen.has(cid) && seen.add(cid)).slice(0, 16);
      if (deck.length < 8) throw new Error('덱은 보유 카드 8~16종으로 구성해 주세요.');
      prof.deck = deck; saveProfiles(); return ok(res, { profile: profileView(prof) });
    }
    if (p === '/api/gacha/pull' && req.method === 'POST') {
      const b = await parseBody(req); const prof = authProfile(b); return ok(res, pullGacha(prof, b.count));
    }
    if (p === '/api/rooms' && req.method === 'GET') {
      const list = [...rooms.values()].filter(r => r.mode === 'dungeon' && r.status === 'lobby' && r.players.length < r.maxPlayers).map(r => ({
        id: r.id, name: r.name, players: r.players.length, maxPlayers: r.maxPlayers, host: r.players[0]?.nickname,
        createdAt: r.createdAt, difficulty: r.difficulty, difficultyInfo: DIFFICULTIES[r.difficulty]
      }));
      return ok(res, { rooms: list });
    }
    if (p === '/api/rooms/create' && req.method === 'POST') {
      const b = await parseBody(req); const prof = authProfile(b);
      const mode = b.mode === 'journey' ? 'journey' : 'dungeon';
      const room = makeRoom(prof, mode, b.name, b.difficulty || 'normal');
      return ok(res, { room: roomView(room) });
    }
    if (p === '/api/rooms/join' && req.method === 'POST') {
      const b = await parseBody(req); const prof = authProfile(b); const room = rooms.get(String(b.roomId || ''));
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
        const pid = u.searchParams.get('profileId'); assertMember(room, pid);
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
        const b = await parseBody(req); const prof = authProfile(b); assertMember(room, prof.id);
        if (action === 'start') { if (room.hostId !== prof.id) throw new Error('방장만 시작할 수 있습니다.'); startRoom(room); return ok(res, { room: roomView(room) }); }
        if (action === 'vote') { voteRoute(room, prof.id, b.nodeId); return ok(res, { room: roomView(room) }); }
        if (action === 'play') { playCard(room, prof.id, b.handIndex, b.targetUid); return ok(res, { room: roomView(room) }); }
        if (action === 'end-turn') { endTurn(room, prof.id); return ok(res, { room: roomView(room) }); }
        if (action === 'event') { chooseEvent(room, prof.id, b.choiceId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'reward') { claimReward(room, prof.id, b.rewardId); return ok(res, { room: roomView(room), profile: profileView(profiles[prof.id]) }); }
        if (action === 'reroll') { const result = rerollReward(room, prof.id); return ok(res, { result, room: roomView(room) }); }
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
  for (const [id, r] of rooms) if (now - r.createdAt > ROOM_TTL) { rooms.delete(id); clientsByRoom.delete(id); }
}, 15000).unref();

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`[RIFT DECK v${VERSION}] dynamic server listening on http://${HOST}:${PORT}`));
}

module.exports = { server, CATALOG, DUNGEON_MAX_FLOOR, CARDS, ITEMS, DIFFICULTIES };
