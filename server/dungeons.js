import { randomUUID } from 'node:crypto';
import { MONSTERS, ZONES, ITEMS, MAX_LEVEL, xpRequired } from '../shared/content.js';
import { createMap, findSafePosition, dist, moveEntity, findPath, lineOfSight, isBlocked } from '../shared/world.js';
import { DUNGEONS, DUNGEON_BY_ID, DUNGEON_ZONE, DUNGEON_ZONE_IDS, DUNGEON_RULES, DUNGEON_SYMBOLS, DUNGEON_COLORS, DUNGEON_SHOP, dungeonDay, prepareDungeons } from '../shared/dungeons.js';

const C = { x: 704, y: 544 };
const FLOOR = [.7, .35, 0];
const PADS = [{ x: 704, y: 294 }, { x: 954, y: 544 }, { x: 704, y: 794 }, { x: 454, y: 544 }];
const failure = error => ({ ok: false, error });
const num = n => Number.isFinite(n) ? n : 0;
const sameList = (a, b) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);

export class DungeonManager {
  constructor(game) { this.game = game; this.runs = new Map(); this.lobbies = new Map(); this.byParty = new Map(); }
  zone(r) { return DUNGEON_BY_ID[r?.dungeon]?.zone || DUNGEON_ZONE; }
  world(r) { return this.game.worlds.get(this.zone(r)); }
  runFor(p) { const r = this.runs.get(p?.dungeonRun); return r && r.members.includes(p.id) && !r.exited.has(p.id) ? r : null; }
  partyRun(id) { return this.runs.get(this.byParty.get(id)); }
  allows(p, entity) {
    if (!entity) return false;
    if (entity.dungeonRun) { const r = this.runFor(p); return !!r && p.zone === this.zone(r) && r.id === entity.dungeonRun && r.partyId === entity.dungeonParty; }
    return !ZONES[p.zone]?.dungeon && !p.dungeonRun;
  }
  sameInstance(a, b) {
    if (!a || !b || a.zone !== b.zone) return false;
    if (a.dungeonRun || b.dungeonRun || ZONES[a.zone]?.dungeon) return !!this.runFor(a) && a.dungeonRun === b.dungeonRun && !!this.runFor(b);
    return true;
  }
  blocksInput(p) { const r = this.runFor(p); return !!r && (['grace', 'wipe', 'complete'].includes(r.state) || r.phase === 'transformation'); }
  connected(r) { return r.members.every(id => { const p = this.game.players.get(id); return p?.active && p.zone === this.zone(r) && p.dungeonRun === r.id; }); }
  canDamage(p, m) { const r = this.runFor(p); return this.allows(p, m) && (!m.dungeonRun || r?.state === 'active' && this.connected(r) && !m.dungeonShield && (m.id !== r.bossId || m.hp > Math.floor(m.maxHp * FLOOR[r.stage]))); }
  mobSpec(m) { return { ...MONSTERS[m.type], ...(m.dungeonStats || {}) }; }
  damageAmount(m, damage) {
    if (!m.dungeonRun) return damage;
    const r = this.runs.get(m.dungeonRun); if (!r || r.state !== 'active' || !this.connected(r) || m.dungeonShield) return 0;
    return m.id === r.bossId ? Math.max(0, Math.min(damage, m.hp - Math.floor(m.maxHp * FLOOR[r.stage]))) : damage;
  }
  send(r, event, data) {
    for (const id of r.members) { const p = this.game.players.get(id); if (p?.active && !r.exited?.has(id)) this.game.send(id, event, data); }
  }
  tell(r, message, tone = 'info') { this.send(r, 'notice', { message, tone }); }
  fx(data) {
    const actor = this.game.players.get(data.by || data.id);
    const explicit = this.runs.get(data.dungeonRun || actor?.dungeonRun);
    const entity = explicit ? null : [...this.game.worlds.values()].flatMap(w => w.mobs).find(m => m.id === data.id || m.id === data.owner);
    const r = explicit || this.runs.get(entity?.dungeonRun); if (r) this.send(r, 'fx', { ...data, dungeonRun: r.id, t: this.game.now });
  }
  players(r, living = false) { return r.members.map(id => this.game.players.get(id)).filter(p => p && !r.exited.has(p.id) && (!living || p.active && p.hp > 0 && p.zone === this.zone(r) && p.dungeonRun === r.id)); }
  mobs(r) { return this.world(r).mobs.filter(m => m.dungeonRun === r.id && m.alive); }
  boss(r) { return this.mobs(r).find(m => m.id === r.bossId); }
  record(p, id) { return p.dungeons.records[id] ||= { clears: 0, attempts: 0, wipes: 0, bestMs: 0, firstAt: 0 }; }
  action(p, a) {
    if (!a || typeof a.type !== 'string') return null;
    if (a.type === 'dungeonLobby') return this.openLobby(p, a.id);
    if (a.type === 'dungeonReady') return this.ready(p, a);
    if (a.type === 'dungeonStart') return this.start(p, a);
    if (a.type === 'dungeonCancel') {
      const lobby = this.lobbies.get(p.partyId);
      if (!lobby || lobby.leader !== p.id) return failure('파티장만 준비 확인을 취소할 수 있습니다.');
      this.cancelLobby(lobby, '파티장이 준비 확인을 취소했습니다.'); return { ok: true };
    }
    if (a.type === 'dungeonExchange') return this.exchange(p, a.id);
    const r = this.runFor(p), partyRun = this.partyRun(p.partyId), lobby = this.lobbies.get(p.partyId);
    if (a.type === 'dungeonRetry') return this.retry(p, a);
    if (a.type === 'dungeonExit' || (r && a.type === 'return')) {
      if (!r) return failure('참여 중인 던전이 없습니다.');
      if (r.state === 'complete') this.returnPlayer(r, p);
      else this.endRun(r, `${p.name} 님이 퇴장해 파티가 입구로 돌아갑니다.`);
      return { ok: true };
    }
    if (['travel', 'waypoint', 'worldJoin', 'challengeStart'].includes(a.type) && (r || DUNGEON_ZONE_IDS.includes(a.id)))
      return failure('던전 나가기 버튼으로 돌아간 뒤 다른 모험을 시작하세요.');
    if (r && ['changeJob', 'respawn'].includes(a.type)) return failure('던전에서는 전직하거나 일반 부활할 수 없습니다. 동료의 구조 또는 파티 재도전을 기다려 주세요.');
    if (a.type === 'partyInvite' && (partyRun || lobby)) return failure('준비 확인 또는 던전 진행 중에는 파티 구성을 바꿀 수 없습니다.');
    if (a.type === 'partyAccept') {
      const inv = this.game.invites.get(p.id), leader = inv && this.game.players.get(inv.from);
      if (leader && (this.partyRun(leader.partyId) || this.lobbies.has(leader.partyId))) return failure('초대한 파티가 이미 던전을 준비하거나 진행 중입니다.');
    }
    if (a.type === 'dungeonInteract' || a.type === 'interact') {
      if (r) {
        if (p.hp <= 0) return failure('동료의 구조를 기다려 주세요.');
        if (r.state !== 'active') return failure('지금은 장치를 작동할 수 없습니다.');
        return this.interact(p, r, a.id);
      }
      const gate = createMap(p.zone).dungeonEntrance;
      if ((!a.id && gate && dist(p, gate) <= 110) || typeof a.id === 'string' && a.id.startsWith('dungeon_gate_')) {
        if (!gate || a.id && gate.id !== a.id || dist(p, gate) > 110) return failure('던전 입구 가까이에서 확인하세요.');
        this.game.send(p.id, 'dungeonInfo', { id: gate.dungeon }); return { ok: true };
      }
      if (a.type === 'dungeonInteract') return failure('참여 중인 던전이 없습니다.');
    }
    if (r && (p.hp <= 0 || this.blocksInput(p)) && ['attack', 'dash', 'move', 'use'].includes(a.type)) return { ok: false, quiet: true };
    return null;
  }
  entryCheck(p, def, radius = 240) {
    if (!p?.active || p.hp <= 0) return '모든 파티원이 접속하고 생존해 있어야 합니다.';
    if (p.level < def.level) return `${p.name} 님은 레벨 ${def.level} 이상이 필요합니다.`;
    if (p.challengeRun || p.dungeonRun) return `${p.name} 님이 다른 도전을 진행 중입니다.`;
    if (this.game.now - (p.lastCombat || 0) < 5000) return `${p.name} 님의 전투가 끝난 뒤 5초가 필요합니다.`;
    if (p.zone !== def.entryZone) return `${p.name} 님이 ${ZONES[def.entryZone].name}의 던전 입구에 도착해야 합니다.`;
    const gate = createMap(def.entryZone).dungeonEntrance;
    if (!gate || dist(p, gate) > radius) return `${p.name} 님이 던전 입구 가까이 모여야 합니다.`;
    return null;
  }
  openLobby(p, id) {
    const def = DUNGEON_BY_ID[id], party = this.game.parties.get(p.partyId);
    if (!def || !Object.hasOwn(DUNGEON_BY_ID, id)) return failure('없는 던전입니다.');
    if (!party || party.members.length < 2 || party.members.length > 4) return failure('먼저 2~4명의 파티를 만들어 주세요.');
    if (party.leader !== p.id) return failure('파티장이 던전 준비 확인을 요청할 수 있습니다.');
    if (this.partyRun(p.partyId) || this.lobbies.has(p.partyId)) return failure('이미 진행 중인 던전 또는 준비 확인이 있습니다.');
    const error = this.entryCheck(p, def, 180); if (error) return failure(error);
    if (party.members.some(id => !this.game.players.get(id)?.active)) return failure('모든 파티원이 접속한 뒤 준비 확인을 요청하세요.');
    if (party.members.some(id => (this.game.players.get(id)?.level || 0) < def.level)) return failure(`모든 파티원이 레벨 ${def.level} 이상이어야 합니다.`);
    const lobby = { id: `dungeon_lobby_${randomUUID()}`, partyId: party.id, leader: p.id, dungeon: id,
      members: [...party.members], ready: new Set(), created: this.game.now, ends: this.game.now + DUNGEON_RULES.readyMs };
    this.lobbies.set(party.id, lobby);
    this.send(lobby, 'dungeonLobby', { id: lobby.id, dungeon: id, leader: p.name });
    this.tell(lobby, `${def.name} 준비 확인 · 입구에 모여 각자 준비 완료를 눌러 주세요.`);
    return { ok: true, lobbyId: lobby.id };
  }
  validLobby(p, id) {
    const lobby = this.lobbies.get(p.partyId), party = this.game.parties.get(p.partyId);
    return lobby && lobby.id === id && lobby.members.includes(p.id) && party?.leader === lobby.leader && sameList(party.members, lobby.members) && this.game.now < lobby.ends ? lobby : null;
  }
  ready(p, a) {
    const lobby = this.validLobby(p, a.lobbyId); if (!lobby) return failure('준비 확인이 만료되었거나 파티 구성이 달라졌습니다.');
    if (a.ready !== true && a.ready !== false) return failure('준비 상태를 확인해 주세요.');
    if (a.ready) { const error = this.entryCheck(p, DUNGEON_BY_ID[lobby.dungeon]); if (error) return failure(error); lobby.ready.add(p.id); }
    else lobby.ready.delete(p.id);
    return { ok: true };
  }
  cancelLobby(lobby, reason) { this.lobbies.delete(lobby.partyId); this.tell(lobby, reason); }
  start(p, a) {
    const lobby = this.validLobby(p, a.lobbyId); if (!lobby || lobby.leader !== p.id) return failure('유효한 준비 확인에서 파티장만 입장할 수 있습니다.');
    if (!lobby.members.every(id => lobby.ready.has(id))) return failure('모든 파티원이 준비 완료를 눌러야 합니다.');
    const def = DUNGEON_BY_ID[lobby.dungeon], members = lobby.members.map(id => this.game.players.get(id));
    for (const member of members) { const error = this.entryCheck(member, def); if (error) return failure(error); }
    const r = { id: `dungeon_${randomUUID()}`, partyId: lobby.partyId, leader: lobby.leader, dungeon: def.id, members: [...lobby.members],
      exited: new Set(), retry: new Set(), attempt: 0, entered: this.game.now, stage: 0, state: 'preparing', mobSeq: 0,
      level: Math.round(members.reduce((sum, m) => sum + m.level, 0) / members.length), firstLevels: Object.fromEntries(members.map(m => [m.id, m.level])),
      returnPoints: {}, credit: {}, support: {}, entryBuffs: {}, entryCooldowns: {}, finished: false, rewarded: false };
    for (const member of members) {
      prepareDungeons(member); const back = { zone: member.zone, x: member.x, y: member.y, hp: member.hp, mp: member.mp };
      r.returnPoints[member.id] = back; member.dungeons.returnPoint = back; member.dungeonRun = r.id;
      r.entryBuffs[member.id] = { shieldUntil: member.shieldUntil || 0, speedUntil: member.speedUntil || 0 };
      r.entryCooldowns[member.id] = { ...member.cooldowns };
    }
    this.lobbies.delete(lobby.partyId); this.runs.set(r.id, r); this.byParty.set(r.partyId, r.id);
    this.startAttempt(r); return { ok: true, runId: r.id };
  }
  startAttempt(r) {
    this.clearEntities(r); const now = this.game.now, def = DUNGEON_BY_ID[r.dungeon];
    Object.assign(r, { state: 'active', phase: 'preparing', stage: 0, attempt: r.attempt + 1, attemptStarted: now + 4000,
      ends: now + 4000 + def.minutes * 60000, phaseEnds: now + 4000, strikes: 0, revives: DUNGEON_RULES.revives,
      reviving: null, bossAction: null, phaseTransition: null, holdSince: 0, hint: '4초 뒤 시작합니다. 파티원의 역할과 안내를 확인하세요.', lastFailure: '',
      actors: [...r.members], credit: {}, support: {}, tether: null, retry: new Set(), rewarded: false });
    this.players(r).forEach((p, index) => {
      const stats = this.game.stats(p); p.hp = stats.maxHp; p.mp = stats.maxMp; p.respawnAt = 0; p.target = null; p.path = []; p.input = { x: 0, y: 0 };
      for (const key of ['basic', 'skill1', 'skill2', 'ultimate', 'dash']) p.cooldowns[key] = 0;
      this.record(p, r.dungeon).attempts++; p.dungeonRun = r.id;
      this.game.teleport(p, def.zone, C.x + (index - (r.members.length - 1) / 2) * 54, 904);
      p.invulnerableUntil = now + 4000; this.game.mark(p);
    });
    this.tell(r, `${def.name} · ${r.attempt}번째 도전. 함께 기믹을 해결하면 보호막이 열립니다.`);
  }
  retry(p, a) {
    const r = this.runFor(p);
    if (!r || r.id !== a.runId || r.state !== 'wipe' || a.ready !== true) return failure('전멸한 던전에서 재도전 준비를 확인해 주세요.');
    const party = this.game.parties.get(r.partyId);
    if (!party || !sameList(party.members, r.members)) return failure('파티 구성이 달라졌습니다. 입구로 돌아가 다시 준비하세요.');
    r.retry.add(p.id);
    if (r.members.every(id => r.retry.has(id) && this.game.players.get(id)?.active)) this.startAttempt(r);
    return { ok: true };
  }
  clearCasts(r) {
    const w = this.world(r); w.casts = w.casts.filter(c => c.dungeonRun !== r.id); r.bossAction = null;
    for (const m of w.mobs.filter(m => m.dungeonRun === r.id)) { m.encounterPose = null; m.castUntil = 0; m.raidPath = null; }
  }
  clearEntities(r) { const w = this.world(r); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id); this.clearCasts(r); }
  beforePartyLeave(p) {
    const r = this.runFor(p) || this.partyRun(p.partyId), lobby = this.lobbies.get(p.partyId);
    if (r) this.endRun(r, '파티 구성이 변경되어 던전에서 돌아왔습니다.');
    if (lobby) this.cancelLobby(lobby, '파티 구성이 변경되어 준비 확인을 취소했습니다.');
  }
  beforeTeleport(p, zone) {
    const r = this.runFor(p); if (!r || zone === this.zone(r)) return;
    // External teleports already have a destination; restore everyone, then let
    // the caller finish moving this player without nested teleport recursion.
    this.endRun(r, '파티원이 던전 밖으로 이동해 입구로 돌아갑니다.', p.id);
  }
  returnPlayer(r, p, { teleport = true } = {}) {
    if (r.exited.has(p.id)) return;
    const back = r.returnPoints[p.id] || p.dungeons.returnPoint || { zone: 'town', x: 784, y: 688, hp: 1, mp: 0 };
    r.exited.add(p.id); p.dungeonRun = null; p.dungeons.returnPoint = null; p.respawnAt = 0; p.path = []; p.input = { x: 0, y: 0 }; p.target = null;
    p.dashUntil = 0; p.dashVector = { x: 0, y: 0 }; p.shieldUntil = r.entryBuffs[p.id]?.shieldUntil || 0; p.speedUntil = r.entryBuffs[p.id]?.speedUntil || 0;
    for (const [key, at] of Object.entries(r.entryCooldowns[p.id] || {})) p.cooldowns[key] = Math.max(p.cooldowns[key] || 0, at);
    const stats = this.game.stats(p); p.hp = Math.min(stats.maxHp, Math.max(1, back.hp)); p.mp = Math.min(stats.maxMp, Math.max(0, back.mp));
    if (teleport) {
      const zone = ZONES[back.zone] && !ZONES[back.zone].dungeon && !ZONES[back.zone].challenge ? back.zone : 'town';
      const pos = findSafePosition(createMap(zone), { x: back.x, y: back.y }, 10) || { x: ZONES[zone].spawn[0] * 32 + 16, y: ZONES[zone].spawn[1] * 32 + 16 };
      this.game.teleport(p, zone, pos.x, pos.y);
    }
    this.game.mark(p);
    if (r.exited.size === r.members.length) this.dispose(r);
  }
  dispose(r) { this.clearEntities(r); this.runs.delete(r.id); if (this.byParty.get(r.partyId) === r.id) this.byParty.delete(r.partyId); r.finished = true; }
  endRun(r, reason, skipTeleportId = null) {
    if (r.finished) return;
    this.tell(r, reason);
    for (const p of this.players(r)) {
      if (!r.rewarded) p.dungeons.lastResult = { dungeon: r.dungeon, won: false, reason, elapsed: Math.max(0, this.game.now - r.attemptStarted), attempt: r.attempt, tokens: 0, gold: 0, xp: 0, item: null, at: this.game.now };
      this.returnPlayer(r, p, { teleport: p.id !== skipTeleportId });
    }
    this.dispose(r);
  }
  wipe(r, reason) {
    if (r.state === 'wipe' || r.state === 'complete' || r.finished) return;
    r.state = 'wipe'; r.phase = 'wipe'; r.lastFailure = reason; r.hint = reason; r.retry = new Set(); r.reviving = null; r.tether = null; r.assignments = {};
    this.clearEntities(r);
    for (const p of this.players(r)) {
      p.hp = 0; p.respawnAt = 0; p.input = { x: 0, y: 0 }; p.path = []; p.moving = false; p.vx = p.vy = 0;
      this.record(p, r.dungeon).wipes++;
      p.dungeons.lastResult = { dungeon: r.dungeon, won: false, reason, elapsed: Math.max(0, this.game.now - r.attemptStarted), attempt: r.attempt, tokens: 0, gold: 0, xp: 0, item: null, at: this.game.now };
      this.game.mark(p);
    }
    this.tell(r, `${reason} · 전원 재도전 준비를 누르면 이 자리에서 다시 시작합니다.`, 'warning');
  }
  onDeath(p) {
    const r = this.runFor(p); if (!r) return false;
    p.hp = 0; p.respawnAt = 0; p.input = { x: 0, y: 0 }; p.path = []; p.dashUntil = 0; p.moving = false; p.vx = p.vy = 0;
    if (r.state !== 'active') return true;
    const alive = this.players(r, true);
    if (!alive.length) this.wipe(r, '모든 파티원이 쓰러졌습니다.');
    else if (alive.length < 2) {
      if (r.revives <= 0) this.wipe(r, '함께 기믹을 풀 두 명이 남지 않았고 구조 기회도 소진했습니다.');
      else { r.phase = 'rescue'; r.phaseEnds = this.game.now + 20000; r.hint = '동료 가까이에서 상호작용해 3초간 구조하세요. 구조하지 못하면 20초 뒤 전멸합니다.'; this.clearCasts(r); const boss = this.boss(r); if (boss) boss.dungeonShield = true; }
    } else { r.phase = 'reform'; r.phaseEnds = this.game.now + 2000; r.hint = '쓰러진 동료가 있습니다. 생존자에게 역할을 다시 배정합니다.'; this.clearCasts(r); const boss = this.boss(r); if (boss) boss.dungeonShield = true; }
    this.game.mark(p); return true;
  }
  exchange(p, id) {
    const offer = DUNGEON_SHOP.find(x => x.id === id); if (!offer) return failure('없는 교환 품목입니다.');
    if (this.runFor(p)) return failure('입구로 돌아온 뒤 증표를 교환해 주세요.');
    prepareDungeons(p);
    if (p.dungeons.tokens < offer.cost) return failure(`계약의 증표 ${offer.cost}개가 필요합니다.`);
    if (Object.entries(offer.items).some(([key, n]) => !ITEMS[key] || (p.inventory[key] || 0) + n > 9999)) return failure('교환 재료를 받을 가방 공간이 필요합니다.');
    p.dungeons.tokens -= offer.cost; for (const [key, n] of Object.entries(offer.items)) this.game.addItem(p, key, n);
    this.game.mark(p); return { ok: true, message: `${offer.name}를 받았습니다.` };
  }
  reward(r) {
    if (r.rewarded) return; r.rewarded = true; r.state = 'complete'; r.phase = 'complete'; r.returnAt = this.game.now + 20000;
    r.hint = '파티의 계약을 완수했습니다. 보상은 각자의 기록에 지급되었습니다.'; r.assignments = {}; this.clearEntities(r);
    const def = DUNGEON_BY_ID[r.dungeon], elapsed = Math.max(0, this.game.now - r.attemptStarted), day = dungeonDay(this.game.now);
    for (const p of this.players(r)) {
      // The roster was locked before entry; outsiders and late party joins never
      // appear in this list. Disconnected parties pause before any clear.
      if (!p.active || p.dungeonRun !== r.id || p.zone !== this.zone(r)) continue;
      const record = this.record(p, r.dungeon); record.clears++; record.bestMs = record.bestMs ? Math.min(record.bestMs, elapsed) : elapsed; record.firstAt ||= this.game.now;
      let tokens = 0, gold = 0, xp = 0, item = null;
      if (!p.dungeons.claims.includes(def.id)) {
        p.dungeons.claims.push(def.id); tokens = 8; gold = def.level * 24; xp = p.level >= MAX_LEVEL ? 0 : Math.round(xpRequired(r.firstLevels[p.id]) * .2);
        item = def.reward; this.game.addItem(p, item, 1);
      } else if (p.dungeons.daily[def.id] !== day) { tokens = 3; gold = def.level * 7; }
      p.dungeons.daily[def.id] = day; p.dungeons.tokens = Math.min(1000000, p.dungeons.tokens + tokens); p.gold += gold;
      if (xp) this.game.giveXP(p, xp); if (!p.titles.includes(def.title)) p.titles.push(def.title);
      p.dungeons.lastResult = { dungeon: def.id, won: true, reason: '세 번의 협동 관문을 통과해 수호자의 계약을 완수했습니다.', elapsed, attempt: r.attempt, tokens, gold, xp, item, at: this.game.now };
      this.game.mark(p); this.game.send(p.id, 'dungeonResult', p.dungeons.lastResult);
    }
    this.tell(r, `${def.name} 완주! 20초 뒤 입구로 돌아갑니다.`, 'success');
  }
  spawnBoss(r) {
    const def = DUNGEON_BY_ID[r.dungeon], m = this.game.makeMob(`${r.id}_boss_${r.attempt}`, def.boss, C.x, C.y - 100);
    r.power = 28 + r.level * 4.5;
    m.hp = m.maxHp = Math.round(r.power * 160 * (.7 + r.members.length * .3));
    Object.assign(m, { dungeonRun: r.id, dungeonParty: r.partyId, dungeonShield: true, dungeonRole: 'boss', name: def.bossName, respawnAt: Infinity });
    m.dungeonStats = { level: r.level, def: Math.round(r.level * .6), atk: 20 + r.level * 3, speed: 65, aggro: 1400 };
    r.bossId = m.id; r.nextAttack = this.game.now + 4000; r.attackCount = 0; this.world(r).mobs.push(m);
  }
  spawnAdds(r, count) {
    const type = ['concord_forge', 'moon_quarry'].includes(r.dungeon) ? 'dungeon_cinder' : r.dungeon === 'memory_archive' ? 'dungeon_echo' : 'dungeon_satellite';
    for (let i = 0; i < count; i++) {
      const angle = (i + .5) / count * Math.PI * 2, point = findSafePosition(this.world(r).map, { x: C.x + Math.cos(angle) * 180, y: C.y + Math.sin(angle) * 170 }, 12);
      if (!point) continue;
      const m = this.game.makeMob(`${r.id}_add_${++r.mobSeq}`, type, point.x, point.y);
      m.hp = m.maxHp = Math.round(r.power * 3.8 * (.7 + r.members.length * .3));
      Object.assign(m, { dungeonRun: r.id, dungeonParty: r.partyId, dungeonRole: 'add', name: MONSTERS[type].name, respawnAt: Infinity, nextAttack: this.game.now + 2500 + i * 400 });
      m.dungeonStats = { level: r.level, def: Math.round(r.level * .35), atk: 10 + r.level, speed: 64, range: 110 };
      this.world(r).mobs.push(m);
    }
  }
  cast(r, spec, delay = 1800) {
    const c = { id: ++this.game.castSeq, owner: r.bossId, dungeonRun: r.id, dungeonParty: r.partyId,
      shape: 'circle', radius: 80, inner: 0, boss: true, theme: DUNGEON_BY_ID[r.dungeon].theme, monster: DUNGEON_BY_ID[r.dungeon].boss,
      starts: this.game.now, ends: this.game.now + delay, damageRate: .16, ...spec };
    // A bookshelf / smelter clips both the drawn ray and its authoritative hit
    // volume. Players can read the actual cover boundary before it fires.
    if (c.shape === 'beam' && c.cover) {
      for (let along = 12; along <= c.length; along += 12) {
        if (isBlocked(this.world(r).map, c.x + Math.cos(c.angle) * along, c.y + Math.sin(c.angle) * along, 2)) { c.length = Math.max(0, along - 8); break; }
      }
    }
    this.world(r).casts.push(c); return c;
  }
  credit(r, ids) { for (const id of ids) r.credit[id] = (r.credit[id] || 0) + 1; }
  beginTransformation(r) {
    const boss = this.boss(r); if (!boss) return;
    this.clearCasts(r);
    const w = this.world(r); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id || m.id === r.bossId);
    const def = DUNGEON_BY_ID[r.dungeon], form = def.phases[r.stage], now = this.game.now;
    r.phase = 'transformation'; r.phaseStarted = now; r.phaseEnds = now + 2200; r.tether = null; r.reviving = null; r.assignments = {}; r.attackCount = 0;
    r.phaseTransition = { id: `${r.id}_phase_${r.stage + 1}`, bossId: boss.id, name: def.bossName, title: form.title,
      phase: r.stage + 1, starts: now, ends: r.phaseEnds, theme: def.theme, form: form.form, description: form.description };
    r.hint = `${r.stage + 1}페이즈 · ${form.title}. ${form.description}`;
    boss.dungeonShield = true; boss.moving = false; boss.dots = []; boss.encounterPhase = r.stage + 1; boss.encounterForm = form.form;
    boss.encounterPose = { kind: 'transform', stage: 'windup', starts: now, ends: r.phaseEnds, angle: Math.PI / 2 };
    for (const p of this.players(r, true)) { p.invulnerableUntil = Math.max(p.invulnerableUntil || 0, r.phaseEnds + 500); p.path = []; p.input = { x: 0, y: 0 }; p.dashUntil = 0; }
    this.tell(r, r.hint); this.fx({ dungeonRun: r.id, type: 'bossPhase', x: boss.x, y: boss.y, phase: r.stage + 1, theme: def.theme });
  }
  beginMechanic(r) {
    const boss = this.boss(r); if (!boss || r.state !== 'active') return;
    r.actors = this.players(r, true).map(p => p.id); if (r.actors.length < 2) return;
    this.clearCasts(r); const w = this.world(r); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id || m.id === r.bossId);
    boss.dungeonShield = true; boss.x = C.x; boss.y = C.y - 100; boss.moving = false;
    boss.encounterPhase = r.stage + 1; boss.encounterForm = DUNGEON_BY_ID[r.dungeon].phases[r.stage].form; r.phaseTransition = null;
    r.holdSince = 0; r.tether = null; r.nextHazard = this.game.now + 6000; r.phaseStarted = this.game.now; r.assignments = {};
    if (['concord_forge', 'moon_quarry'].includes(r.dungeon)) {
      r.phase = 'balance'; r.phaseEnds = this.game.now + 30000 - r.stage * 3000;
      r.balancePads = r.stage === 2 ? [{ x: C.x, y: C.y - 220 }, { x: C.x, y: C.y + 220 }]
        : [{ x: C.x + (r.stage ? 230 : -230), y: C.y + 60 }, { x: C.x + (r.stage ? -230 : 230), y: C.y + 60 }];
      r.actors.forEach((id, i) => { const role = (i + r.stage) % 2; r.assignments[id] = { role: role ? 'moon' : 'sun', label: role ? '달' : '해', color: DUNGEON_COLORS[role], pad: role }; });
      r.hint = '머리 위 해·달 문양과 같은 발판에 전원 올라가 2초 동안 함께 유지하세요.';
    } else if (r.dungeon === 'memory_archive') {
      r.phase = 'memory_show'; r.sequence = []; r.step = 0;
      for (let i = 0; i < 3 + r.stage; i++) { let n = Math.min(3, Math.max(0, Math.floor(this.game.random() * 4))); if (n === r.sequence.at(-1)) n = (n + 1) % 4; r.sequence.push(n); }
      r.phaseEnds = this.game.now + 6000 + r.sequence.length * 500;
      r.hint = '문양 순서를 함께 기억하세요. 표시가 사라지면 지정된 파티원이 차례로 장치를 작동합니다.';
      r.actors.forEach(id => { r.assignments[id] = { role: 'remember', label: '순서 기억', color: DUNGEON_COLORS[1] }; });
    } else this.beginStar(r);
    this.tell(r, `보스 ${r.stage + 1}단계 · ${r.hint}`);
  }
  beginPillars(r) {
    r.phase = 'pillars'; r.phaseEnds = this.game.now + 24000 - r.stage * 2000; r.pillars = [0, 2];
    r.pillarGoals = [[1, 3], [2, 0], [3, 1]][r.stage]; r.pillarBy = [null, null]; r.holdSince = 0;
    r.hint = '해는 왼쪽 해 기둥, 달은 오른쪽 달 기둥을 돌리세요. 두 기둥의 화살표를 목표 방향과 맞추면 보호막이 열립니다.';
    this.tell(r, '공명 유지 성공! 문양에 맞는 기둥으로 이동해 목표 화살표를 맞추세요.', 'success');
  }
  operator(r) { return r.actors[(r.step + r.stage) % r.actors.length]; }
  beginLaser(r) {
    this.clearCasts(r); r.phase = 'memory_laser'; r.phaseStarted = this.game.now; r.phaseEnds = this.game.now + 10500 - r.stage * 1000;
    r.lockAt = r.phaseEnds - 1400; r.bait = r.actors[r.stage % r.actors.length]; r.holdSince = 0;
    const side = r.stage % 2 ? -1 : 1; r.prism = { x: C.x + side * 200, y: C.y };
    r.emitter = { x: C.x, y: C.y - 280 }; const angle = Math.atan2(280, side * 200);
    r.baitGoal = { x: r.prism.x + Math.cos(angle) * 125, y: r.prism.y + Math.sin(angle) * 125 };
    r.anchor = { x: C.x - side * 200, y: C.y + 160 }; r.laserAngle = angle;
    const cast = this.cast(r, { ...r.emitter, shape: 'beam', angle, length: 1050, width: 55, radius: 1100, effect: 'memory_laser', name: '기록의 광선 · 프리즘 뒤로 유도' }, r.phaseEnds - this.game.now);
    r.mechanicCast = cast.id;
    const boss = this.boss(r); if (boss) this.pose(boss, 'shoot', 'windup', this.game.now, r.phaseEnds, angle);
    for (const id of r.actors) r.assignments[id] = id === r.bait ? { role: 'bait', label: '광선 유도', color: '#edc47d' } : { role: 'anchor', label: '기록 고정', color: '#9ed8ba' };
    r.hint = `${this.game.players.get(r.bait)?.name || '유도자'} 님은 프리즘 뒤 노란 자리에, 나머지는 초록 고정진에 모여 1초 이상 유지하세요.`;
    this.tell(r, r.hint);
  }
  beginStar(r) {
    this.clearCasts(r); r.phase = 'star_mark'; r.phaseStarted = this.game.now; r.phaseEnds = this.game.now + 9000 - r.stage * 1000;
    r.lockAt = r.phaseEnds - 1800; r.bait = r.actors[r.stage % r.actors.length]; r.starGoal = { ...PADS[(r.stage + 1) % PADS.length] }; r.starLocked = false;
    const target = this.game.players.get(r.bait); r.starPoint = { x: target.x, y: target.y };
    r.mechanicCast = this.cast(r, { ...r.starPoint, radius: 95, effect: 'star_mark', name: '낙성 낙인 · 바깥 문양으로 유도 후 이탈' }, r.phaseEnds - this.game.now).id;
    const boss = this.boss(r); if (boss) this.pose(boss, 'pull', 'windup', this.game.now, r.phaseEnds, Math.PI / 2);
    for (const id of r.actors) r.assignments[id] = id === r.bait ? { role: 'bait', label: '낙성 유도', color: '#efa57f' } : { role: 'shelter', label: '중앙 보호진', color: '#a3d9b8' };
    r.hint = `${target.name} 님은 낙인을 바깥 봉인 문양으로 유도하세요. 나머지는 중앙 초록 보호진에 모이세요. 붉은 원이 고정되면 유도자는 원 밖으로 피할 수 있습니다.`;
  }
  beginConduits(r) {
    this.clearCasts(r); r.phase = 'conduits'; r.phaseStarted = this.game.now; r.phaseEnds = this.game.now + 14000 - r.stage * 2000;
    r.conduits = [0, 1].map((_, i) => ({ x: C.x + (i ? 190 : -190), y: C.y - 60, owner: r.actors[(r.stage + i) % r.actors.length], at: 0 }));
    for (const id of r.actors) r.assignments[id] = { role: 'defend', label: '잔영 저지', color: '#c1b1e8' };
    r.conduits.forEach((s, i) => { r.assignments[s.owner] = { role: 'conduit', label: `${i + 1}번 차단기`, color: i ? '#a7b2eb' : '#edbf7c' }; });
    this.spawnAdds(r, 2);
    r.hint = '지정된 두 사람이 각 차단기를 2초 이내에 작동한 뒤 1.2초 동안 자리를 유지하세요. 남은 동료는 잔영을 저지하세요.';
    this.tell(r, r.hint);
  }
  expose(r) {
    const boss = this.boss(r); if (!boss || r.state !== 'active') return;
    this.clearCasts(r); const w = this.world(r); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id || m.id === r.bossId);
    this.credit(r, r.actors); r.phase = 'vulnerable'; r.phaseStarted = this.game.now; r.phaseEnds = this.game.now + 24000;
    boss.dungeonShield = false; boss.stunUntil = 0; r.nextAttack = this.game.now + 1800;
    r.hint = `협동 기믹 성공! 24초 동안 보호막이 열립니다. ${DUNGEON_BY_ID[r.dungeon].combat}`;
    if (r.dungeon === 'fallen_observatory' && r.stage > 0) {
      r.tether = { members: [r.actors[0], r.actors.at(-1)], ends: this.game.now + 6500, minimum: 180 };
      r.hint += ' 분리 사슬의 두 사람은 180 이상 떨어지세요.';
    }
    this.tell(r, r.hint, 'success'); this.fx({ dungeonRun: r.id, type: 'armorBreak', x: boss.x, y: boss.y, theme: DUNGEON_BY_ID[r.dungeon].theme, phase: r.stage + 1 });
  }
  damageFraction(p, fraction) { if (this.runFor(p)?.phase === 'transformation') return; const s = this.game.stats(p); this.game.damagePlayer(p, Math.round(s.maxHp * fraction + s.def * .65)); }
  mechanicFail(r, reason, restart = true) {
    r.strikes++; r.lastFailure = reason;
    if (r.strikes >= 3) { this.wipe(r, `${reason} 기믹 실패가 3회 쌓여 계약이 무너졌습니다.`); return; }
    this.tell(r, `${reason} · 기믹 실패 ${r.strikes}/3`, 'warning');
    if (restart) { this.clearCasts(r); r.phase = 'recover'; r.phaseEnds = this.game.now + 3500; r.hint = `${reason} 잠시 뒤 같은 체력 단계에서 다시 시도합니다.`; const boss = this.boss(r); if (boss) boss.dungeonShield = true; }
    for (const p of this.players(r, true)) { if (r.state !== 'active') break; this.damageFraction(p, .28); }
  }
  interact(p, r, id) {
    const now = this.game.now;
    if (now - (p.lastDungeonInteract || 0) < 400) return { ok: false, quiet: true };
    const fallen = this.players(r).filter(other => other.hp <= 0 && other.active && other.id !== p.id && dist(p, other) <= 78 && (!id || id === `revive_${other.id}`))[0];
    if (fallen) {
      if (r.revives <= 0) return failure('이번 시도의 구조 기회를 모두 사용했습니다.');
      if (r.reviving && r.reviving.helper !== p.id) return failure('다른 동료가 이미 구조 중입니다.');
      if (!r.reviving) r.reviving = { helper: p.id, target: fallen.id, started: now, ends: now + DUNGEON_RULES.reviveMs, x: p.x, y: p.y };
      p.lastDungeonInteract = now; return { ok: true, message: '3초 동안 가까이 머물면 동료를 구조합니다.' };
    }
    if (r.phase === 'pillars') {
      const index = [0, 1].find(i => dist(p, { x: C.x + (i ? 200 : -200), y: C.y - 140 }) <= 80 && (!id || id === `pillar_${i}`));
      if (index === undefined) return failure('기둥 가까이에서 작동하세요.');
      if (r.assignments[p.id]?.pad !== index) return failure(index ? '달 표식을 받은 동료가 이 기둥을 작동해야 합니다.' : '해 표식을 받은 동료가 이 기둥을 작동해야 합니다.');
      p.lastDungeonInteract = now; r.pillars[index] = (r.pillars[index] + 1) % 4; r.pillarBy[index] = p.id;
      if (r.pillars.every((angle, i) => angle === r.pillarGoals[i]) && r.pillarBy[0] && r.pillarBy[1] && r.pillarBy[0] !== r.pillarBy[1]) this.expose(r);
      return { ok: true };
    }
    if (r.phase === 'memory_input') {
      if (p.id !== this.operator(r)) return failure(`${this.game.players.get(this.operator(r))?.name || '지정된 동료'} 님의 차례입니다.`);
      const index = PADS.findIndex((pad, i) => dist(p, pad) <= 78 && (!id || id === `memory_${i}`));
      if (index < 0) return failure('기억한 문양 장치 가까이에서 작동하세요.');
      p.lastDungeonInteract = now;
      if (index !== r.sequence[r.step]) { this.mechanicFail(r, `${p.name} 님이 ${r.step + 1}번째 문양 순서를 틀렸습니다.`); return { ok: true }; }
      r.step++; this.credit(r, [p.id]); this.fx({ dungeonRun: r.id, type: 'buff', ...PADS[index], color: DUNGEON_COLORS[index] });
      if (r.step >= r.sequence.length) this.beginLaser(r);
      else r.hint = `${r.step}/${r.sequence.length} 문양 복원 · 다음은 ${this.game.players.get(this.operator(r))?.name || '동료'} 님의 차례입니다.`;
      return { ok: true };
    }
    if (r.phase === 'conduits') {
      const index = r.conduits.findIndex((s, i) => dist(p, s) <= 78 && (!id || id === `conduit_${i}`));
      if (index < 0) return failure('차단기 가까이에서 작동하세요.');
      const conduit = r.conduits[index];
      if (conduit.owner !== p.id) return failure(`${this.game.players.get(conduit.owner)?.name || '지정된 동료'} 님이 맡은 차단기입니다.`);
      p.lastDungeonInteract = now;
      if (!conduit.at || now - conduit.at > 4000) conduit.at = now;
      return { ok: true, message: '다른 차단기와 2초 안에 맞춘 뒤 1.2초간 머무르세요.' };
    }
    return failure(r.phase === 'memory_show' ? '먼저 문양 순서를 기억하세요.' : '현재 목표는 이동과 위치 유지로 해결합니다. 머리 위 역할과 바닥 표시를 확인하세요.');
  }
  tickRevive(r) {
    const v = r.reviving; if (!v) return;
    const helper = this.game.players.get(v.helper), target = this.game.players.get(v.target);
    if (!helper?.active || helper.hp <= 0 || !target?.active || target.hp > 0 || dist(helper, target) > 80 || dist(helper, v) > 32) { r.reviving = null; this.tell(r, '구조가 중단되었습니다. 동료 가까이에서 다시 시작하세요.'); return; }
    if (this.game.now < v.ends) return;
    const stats = this.game.stats(target); target.hp = Math.round(stats.maxHp * .4); target.mp = Math.max(target.mp, Math.round(stats.maxMp * .3)); target.invulnerableUntil = this.game.now + 2500; target.respawnAt = 0;
    r.revives--; r.reviving = null; this.credit(r, [helper.id]); this.game.mark(target); this.tell(r, `${target.name} 님을 구조했습니다. 남은 구조 기회 ${r.revives}회.`, 'success');
    if (r.phase === 'rescue') this.beginMechanic(r);
  }
  tickMechanic(r) {
    const now = this.game.now, boss = this.boss(r); if (!boss) return;
    if (r.phase === 'transformation') { if (now >= r.phaseEnds) this.beginMechanic(r); return; }
    if (['recover', 'reform'].includes(r.phase)) { if (now >= r.phaseEnds) this.beginMechanic(r); return; }
    if (r.phase === 'rescue') { if (now >= r.phaseEnds) this.wipe(r, '20초 안에 동료를 구조하지 못했습니다.'); return; }
    if (r.phase === 'balance') {
      const matched = r.actors.every(id => { const p = this.game.players.get(id), pad = r.balancePads[r.assignments[id].pad]; return p?.active && p.hp > 0 && dist(p, pad) <= 74; });
      if (!matched) r.holdSince = 0; else { r.holdSince ||= now; if (now - r.holdSince >= 2000) { this.credit(r, r.actors); this.beginPillars(r); return; } }
    } else if (r.phase === 'memory_show') {
      if (now >= r.phaseEnds) { r.phase = 'memory_input'; r.phaseEnds = now + 35000; r.nextHazard = now + 6500; r.hint = `순서 입력 시작 · ${this.game.players.get(this.operator(r))?.name} 님부터 장치를 작동하세요.`; this.spawnAdds(r, 2); }
      return;
    } else if (r.phase === 'memory_laser') {
      const bait = this.game.players.get(r.bait), cast = this.world(r).casts.find(c => c.id === r.mechanicCast);
      if (now < r.lockAt && bait) r.laserAngle = Math.atan2(bait.y - r.emitter.y, bait.x - r.emitter.x);
      if (cast) cast.angle = r.laserAngle;
      const anchored = r.actors.filter(id => id !== r.bait).every(id => { const p = this.game.players.get(id); return p?.hp > 0 && p.active && dist(p, r.anchor) <= 82; });
      if (!anchored) r.holdSince = 0; else r.holdSince ||= now;
      if (now >= r.phaseEnds) {
        const dx = r.prism.x - r.emitter.x, dy = r.prism.y - r.emitter.y;
        const across = Math.abs(-dx * Math.sin(r.laserAngle) + dy * Math.cos(r.laserAngle));
        const along = dx * Math.cos(r.laserAngle) + dy * Math.sin(r.laserAngle);
        const aligned = bait?.hp > 0 && across <= 43 && along > 0 && dist(bait, r.emitter) >= dist(r.prism, r.emitter) + 60;
        if (aligned && anchored && r.holdSince && now - r.holdSince >= 1000) this.expose(r);
        else this.mechanicFail(r, !aligned ? '유도 광선이 프리즘을 통과하지 못했습니다. 유도자는 노란 자리에서 빛이 고정될 때까지 기다려 주세요.' : '기록 고정진에 나머지 동료가 모두 1초 이상 모이지 못했습니다.');
      }
      return;
    } else if (r.phase === 'star_mark') {
      const bait = this.game.players.get(r.bait), cast = this.world(r).casts.find(c => c.id === r.mechanicCast);
      if (now < r.lockAt && bait) r.starPoint = { x: bait.x, y: bait.y }; else r.starLocked = true;
      if (cast) { cast.x = r.starPoint.x; cast.y = r.starPoint.y; }
      if (now >= r.phaseEnds) {
        const others = r.actors.filter(id => id !== r.bait).map(id => this.game.players.get(id));
        const sheltered = others.every(p => p?.active && p.hp > 0 && dist(p, C) <= 106);
        const separated = bait?.hp > 0 && others.every(p => dist(p, bait) >= 160);
        if (dist(r.starPoint, r.starGoal) <= 65 && sheltered && separated) {
          this.credit(r, r.actors); this.clearCasts(r);
          if (dist(bait, r.starPoint) <= 103) this.damageFraction(bait, .18);
          if (r.state === 'active' && this.players(r, true).length >= 2) this.beginConduits(r);
        } else this.mechanicFail(r, dist(r.starPoint, r.starGoal) > 65 ? '낙성이 바깥 봉인 문양에 떨어지지 않았습니다. 낙인 고정 전에 지정된 자리로 이동하세요.' : !sheltered ? '낙인 대상 이외의 동료가 중앙 보호진에 모두 모이지 못했습니다.' : '낙인 대상이 동료와 충분히 떨어지지 않았습니다.');
      }
      return;
    } else if (r.phase === 'conduits') {
      for (const conduit of r.conduits) if (conduit.at && (now - conduit.at > 4000 || dist(this.game.players.get(conduit.owner), conduit) > 82)) conduit.at = 0;
      const [a, b] = r.conduits;
      if (a.at && b.at && Math.abs(a.at - b.at) <= 2000 && now - Math.max(a.at, b.at) >= 1200) { this.expose(r); return; }
    } else if (r.phase === 'vulnerable') {
      if (r.stage < 2 && boss.hp <= Math.floor(boss.maxHp * FLOOR[r.stage])) { r.stage++; this.beginTransformation(r); return; }
      if (r.tether && now >= r.tether.ends) {
        const pair = r.tether.members.map(id => this.game.players.get(id)); r.tether = null;
        if (pair.every(p => p?.hp > 0) && dist(pair[0], pair[1]) < 180) this.mechanicFail(r, '분리 사슬에 연결된 두 사람이 180 이상 떨어지지 못했습니다.', false);
      }
      if (r.state === 'active' && now >= r.phaseEnds) { this.tell(r, '공격 시간이 끝나 보호막이 닫혔습니다. 기믹을 다시 해결하면 남은 체력부터 이어집니다.'); this.beginMechanic(r); }
      return;
    }
    if (now >= r.phaseEnds) { this.mechanicFail(r, r.phase === 'balance' ? '서로 다른 문양 발판을 전원이 함께 2초 유지하지 못했습니다.' : r.phase === 'pillars' ? '제한 시간 안에 두 기둥을 목표 방향으로 맞추지 못했습니다.' : r.phase === 'memory_input' ? '문양 순서를 제한 시간 안에 완성하지 못했습니다.' : '두 차단기를 2초 안에 맞추고 유지하지 못했습니다.'); return; }
    if (now >= r.nextHazard && ['balance', 'pillars', 'memory_input'].includes(r.phase)) {
      r.nextHazard = now + 8500 - r.stage * 700;
      if (['concord_forge', 'moon_quarry'].includes(r.dungeon)) {
        const target = this.players(r, true)[r.stage % r.actors.length];
        if (target) this.cast(r, { x: target.x, y: target.y, radius: 61, damageRate: .11, name: '발판 아래 용광로 분출' }, 2100);
      } else {
        this.cast(r, { x: C.x, y: 368, shape: 'beam', angle: Math.PI / 2, length: 620, width: 46 + r.stage * 6, radius: 620, damageRate: .12, cover: true, name: '중앙 기록 회랑의 탐색광' }, 2200);
        if (r.stage === 2) this.cast(r, { x: 976, y: 624, shape: 'beam', angle: Math.PI, length: 550, width: 45, radius: 550, damageRate: .12, cover: true, name: '금서 회랑의 교차 탐색광' }, 2750);
      }
    }
  }
  pause(r) {
    r.resumeState = r.state; r.state = 'grace'; r.pauseAt = this.game.now; r.graceEnds = this.game.now + DUNGEON_RULES.reconnectMs;
    r.pauseVitals = Object.fromEntries(this.players(r).map(p => [p.id, { hp: p.hp, mp: p.mp }]));
    this.tell(r, '접속이 끊긴 동료를 30초 동안 기다립니다. 전투와 기믹 시간이 일시 정지됩니다.');
  }
  resume(r) {
    const dt = this.game.now - r.pauseAt, shift = (obj, keys) => { for (const key of keys) if (Number.isFinite(obj?.[key]) && obj[key] > 0) obj[key] += dt; };
    shift(r, ['attemptStarted', 'ends', 'phaseStarted', 'phaseEnds', 'lockAt', 'holdSince', 'nextHazard', 'nextAttack']);
    shift(r.phaseTransition, ['starts', 'ends']); shift(r.bossAction, ['starts', 'windupEnd', 'strikeEnd', 'ends', 'nextPulse']);
    shift(r.tether, ['ends']); shift(r.reviving, ['started', 'ends']); for (const c of r.conduits || []) shift(c, ['at']);
    for (const c of this.world(r).casts.filter(c => c.dungeonRun === r.id)) shift(c, ['starts', 'ends']);
    for (const m of this.mobs(r)) { shift(m, ['nextAttack', 'castUntil', 'stunUntil', 'slowUntil']); shift(m.encounterPose, ['starts', 'ends']); shift(m.addAction, ['starts', 'strikeAt', 'ends']); for (const dot of m.dots) shift(dot, ['next']); }
    for (const p of this.players(r)) {
      const saved = r.pauseVitals[p.id]; if (saved) { p.hp = saved.hp; p.mp = saved.mp; }
      for (const key of Object.keys(p.cooldowns)) if (p.cooldowns[key] > r.pauseAt) p.cooldowns[key] += dt;
      for (const key of ['shieldUntil', 'speedUntil', 'invulnerableUntil']) if (p[key] > r.pauseAt) p[key] += dt;
      p.input = { x: 0, y: 0 }; p.path = []; p.motionId++; this.game.mark(p);
    }
    r.state = r.resumeState; r.pauseVitals = null; this.tell(r, '동료가 돌아왔습니다. 남은 시간부터 던전을 이어갑니다.', 'success');
  }
  tick(dt = .05) {
    const g = this.game, now = g.now;
    for (const lobby of [...this.lobbies.values()]) {
      const party = g.parties.get(lobby.partyId);
      if (!party || party.leader !== lobby.leader || !sameList(party.members, lobby.members)) this.cancelLobby(lobby, '파티 구성이 변경되어 준비 확인을 취소했습니다.');
      else if (now >= lobby.ends) this.cancelLobby(lobby, '준비 확인 시간이 끝났습니다. 파티장이 다시 요청할 수 있습니다.');
    }
    for (const r of [...this.runs.values()]) {
      if (r.finished) continue;
      if (r.state === 'complete') {
        if (now >= r.returnAt) this.endRun(r, '던전을 마치고 입구로 돌아왔습니다.');
        continue;
      }
      const party = g.parties.get(r.partyId);
      if (!party || !sameList(party.members, r.members)) { this.endRun(r, '파티 구성이 변경되어 입구로 돌아갑니다.'); continue; }
      if (r.members.some(id => !g.players.has(id))) { this.endRun(r, '파티원의 연결 정보를 찾을 수 없어 입구로 돌아갑니다.'); continue; }
      const everyone = this.players(r), disconnected = everyone.some(p => !p.active);
      if (disconnected && r.state !== 'grace') this.pause(r);
      if (r.state === 'grace') {
        for (const p of everyone) { const saved = r.pauseVitals[p.id]; if (saved) { p.hp = saved.hp; p.mp = saved.mp; } p.input = { x: 0, y: 0 }; p.path = []; }
        if (now >= r.graceEnds) this.endRun(r, '동료가 30초 안에 돌아오지 않아 보상 없이 입구로 복귀합니다.');
        else if (!disconnected) this.resume(r);
        continue;
      }
      if (everyone.some(p => p.zone !== this.zone(r) || p.dungeonRun !== r.id)) { this.endRun(r, '던전을 이탈한 파티원이 있어 입구로 돌아갑니다.'); continue; }
      if (r.state === 'wipe') continue;
      if (now >= r.ends) { this.wipe(r, '던전의 제한 시간이 끝났습니다.'); continue; }
      if (r.phase === 'preparing') { if (now >= r.phaseEnds) { this.spawnBoss(r); this.beginMechanic(r); } continue; }
      this.tickRevive(r); if (r.state !== 'active') continue;
      this.tickMechanic(r); if (r.state !== 'active') continue;
      this.tickCombat(r, dt); if (r.state === 'active') this.resolveCasts(r);
    }
  }
  tickCombat(r, dt) {
    const g = this.game, now = g.now, people = this.players(r, true);
    if (!people.length || ['rescue', 'recover', 'reform', 'transformation'].includes(r.phase)) return;
    for (const m of this.mobs(r)) {
      for (const effect of m.dots || []) {
        if (effect.left <= 0 || effect.next > now) continue;
        effect.left--; effect.next = now + 1000; const owner = g.players.get(effect.by);
        if (!owner?.active || owner.hp <= 0 || !this.canDamage(owner, m)) continue;
        const dealt = Math.min(m.hp, this.damageAmount(m, Math.max(0, num(effect.damage))));
        m.hp -= dealt; m.contributors.set(owner.id, now); m.damageLog.set(owner.id, (m.damageLog.get(owner.id) || 0) + dealt);
        this.fx({ dungeonRun: r.id, type: 'hit', id: m.id, by: owner.id, x: m.x, y: m.y - 22, amount: dealt, kind: 'monster' });
        if (m.hp <= 0) { this.mobKilled(m); break; }
      }
      m.dots = (m.dots || []).filter(e => e.left > 0);
      if (r.state !== 'active' || !m.alive) break;
      m.moving = false; if (m.stunUntil > now) continue;
      const target = [...people].sort((a, b) => dist(m, a) - dist(m, b))[0], dx = target.x - m.x, dy = target.y - m.y, d = Math.hypot(dx, dy);
      m.target = target.id; m.dir = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'e' : 'w' : dy > 0 ? 's' : 'n';
      if (m.id === r.bossId) this.tickBoss(r, m, target, people, dt);
      else this.tickAdd(r, m, target, dt);
    }
  }
  pose(m, kind, stage, starts, ends, angle, extra = {}) {
    m.encounterPose = { kind, stage, starts, ends, angle, ...extra };
    m.castUntil = stage === 'windup' ? ends : 0;
  }
  walk(r, m, goal, speed, dt) {
    const map = this.world(r).map, now = this.game.now;
    if (!goal || dist(m, goal) < 8) return;
    if (!m.raidPath || now >= (m.raidPathAt || 0) || dist(m.raidGoal || goal, goal) > 55) {
      m.raidPath = findPath(map, m, goal); m.raidGoal = { x: goal.x, y: goal.y }; m.raidPathAt = now + 650;
    }
    while (m.raidPath?.length && dist(m, m.raidPath[0]) < 12) m.raidPath.shift();
    const point = m.raidPath?.[0]; if (!point) return;
    const d = dist(m, point), step = Math.min(d, speed * Math.min(.1, dt)), old = { x: m.x, y: m.y };
    if (d > 0) moveEntity(map, m, (point.x - m.x) / d * step, (point.y - m.y) / d * step, 12);
    m.moving = dist(old, m) > .05;
  }
  teleportBoss(r, m, point) {
    const safe = findSafePosition(this.world(r).map, point, 16); if (!safe) return;
    this.fx({ dungeonRun: r.id, type: 'blink', x: m.x, y: m.y, toX: safe.x, toY: safe.y, theme: 'time', id: m.id });
    m.x = safe.x; m.y = safe.y; m.raidPath = null;
  }
  beginBossAction(r, m, target) {
    const now = this.game.now, phase = r.stage;
    const order = r.dungeon === 'moon_quarry'
      ? phase === 0 ? ['quarry_shards','quarry_pulse'] : phase === 1 ? ['quarry_pulse','forge_leap','quarry_shards'] : ['quarry_shards','quarry_pulse','forge_slam','quarry_pulse']
      : r.dungeon === 'concord_forge'
      ? phase === 0 ? ['forge_leap', 'forge_heat', 'forge_slam'] : phase === 1 ? ['forge_slam', 'forge_leap', 'forge_heat', 'forge_vent'] : ['forge_vent', 'forge_leap', 'forge_heat', 'forge_slam']
      : r.dungeon === 'memory_archive'
        ? phase === 0 ? ['archive_ray', 'archive_pages', 'archive_rewrite'] : phase === 1 ? ['archive_pages', 'archive_ray', 'archive_rewrite'] : ['archive_rewrite', 'archive_ray', 'archive_pages']
        : phase === 0 ? ['observatory_pull', 'observatory_meteors', 'observatory_comet'] : phase === 1 ? ['observatory_meteors', 'observatory_pull', 'observatory_comet'] : ['observatory_comet', 'observatory_pull', 'observatory_meteors'];
    const key = order[r.attackCount++ % order.length], angle = Math.atan2(target.y - m.y, target.x - m.x);
    const a = { key, starts: now, from: { x: m.x, y: m.y }, target: target.id, angle, nextPulse: now, pulses: 0 };
    const setup = (name, hint, kind, windup, strike, recovery) => Object.assign(a, { name, hint, kind, windupEnd: now + windup, strikeEnd: now + windup + strike, ends: now + windup + strike + recovery });
    const point = p => findSafePosition(this.world(r).map, p, 16) || { ...C };
    if (key === 'quarry_shards') {
      setup('공명 결정 낙하', '플레이어를 따라 찍힌 수정 표식이 순서대로 폭발합니다. 다음 표식이 생기기 전에 옆으로 이동하세요.', 'cast', 1300, 1800, 1900);
      const all = this.players(r, true);
      const targets = all.length ? all : [target];
      for (let i = 0; i < 3 + phase; i++) {
        const victim = targets[i % targets.length];
        this.cast(r, { x: victim.x + Math.sin(i * 1.9) * 38, y: victim.y + Math.cos(i * 2.1) * 34, radius: 60 + phase * 4, damageRate: .10 + phase * .012, name: `공명 결정 낙하 ${i + 1}` }, 1300 + i * 320);
      }
      if (phase === 2) this.spawnAdds(r, 1);
    } else if (key === 'quarry_pulse') {
      setup('수정핵 동심파', '바깥과 안쪽의 고리 사이에는 안전한 틈이 있습니다. 순서대로 퍼지는 푸른 파동을 넘어서세요.', 'cast', 1300, 1200, 1800);
      this.cast(r, { x: m.x, y: m.y, shape: 'ring', radius: 165, inner: 108, damageRate: .14, name: '공명 제1파' }, 1300);
      this.cast(r, { x: m.x, y: m.y, shape: 'ring', radius: 250, inner: 195, damageRate: .15, name: '공명 제2파' }, 2100);
      if (phase >= 1) this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle: a.angle + Math.PI / 2, length: 340, width: 65, radius: 350, damageRate: .13, name: '균열의 일직선' }, 2200);
    } else if (key === 'forge_leap') {
      setup(r.dungeon === 'moon_quarry' ? '결정의 추락' : '낙하 제련', '붉게 고정된 착지 원을 벗어나세요. 착지 뒤 식어 버린 망치가 긴 공격 기회입니다.', 'leap', 1100, 800, 2100);
      a.point = point(target);
      this.cast(r, { ...a.point, radius: 124 + phase * 10, damageRate: .2, name: '낙하 제련 · 착지' }, 1900);
      if (phase > 0) this.cast(r, { ...a.point, shape: 'ring', radius: 225, inner: 155, damageRate: .13, name: '착지 후 바깥 충격파' }, 2550);
    } else if (key === 'forge_heat') {
      setup('추격하는 용광로', '추격 대상은 불길을 바깥쪽에 남기세요. 이미 달아오른 자리는 세 번 타오릅니다.', 'charge', 800, 3200, 1800);
      a.nextPulse = a.windupEnd;
    } else if (key === 'forge_slam') {
      setup(r.dungeon === 'moon_quarry' ? '결정 골렘의 연속 주먹' : phase > 0 ? '쌍극의 연속 망치' : '주조 망치', '들어 올린 망치의 정면을 벗어나 옆구리로 이동하세요. 이후에는 보스가 잠시 멈춥니다.', 'slam', 1450, 500 + phase * 300, 2100);
      this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle, length: 250, width: 170, radius: 280, damageRate: .2, cover: true, name: '주조 망치 · 정면' }, 1450);
      if (phase > 0) this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle: angle + Math.PI / 2, length: 250, width: 145, radius: 280, damageRate: .15, cover: true, name: '두 번째 망치 · 옆면' }, 2050);
    } else if (key === 'forge_vent') {
      setup('백열 배출', '십자형 열풍은 제련기 뒤에서 막을 수 있습니다. 붉은 직선 사이의 빈 공간도 안전합니다.', 'cast', 1700, 900, 2500);
      for (let i = 0; i < 4; i++) this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle: i * Math.PI / 2, length: 850, width: 70, radius: 850, damageRate: .17, cover: true, name: '용광로 배출구 · 엄폐 가능' }, 1700 + (i % 2) * 300);
      this.spawnAdds(r, 2);
    } else if (key === 'archive_ray') {
      const stations = [{ x: 704, y: 368 }, { x: 976, y: 640 }, { x: 448, y: 640 }, { x: 704, y: 880 }];
      this.teleportBoss(r, m, stations[(r.attackCount - 1 + phase) % stations.length]);
      a.angle = Math.atan2(target.y - m.y, target.x - m.x);
      setup('금서의 고정 광선', '광선은 처음 겨눈 방향으로 고정됩니다. 서가 뒤로 숨거나 직선에서 옆으로 빠지세요.', 'shoot', 1800, 650, 1800);
      this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle: a.angle, length: 1050, width: 72 + phase * 8, radius: 1050, damageRate: .18, cover: true, name: '금서의 광선 · 서가로 차단' }, 1800);
      if (phase === 2) this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle: a.angle + .55, length: 900, width: 62, radius: 900, damageRate: .12, cover: true, name: '찢어진 두 번째 페이지' }, 2400);
    } else if (key === 'archive_pages') {
      setup('시간차 기록', '발밑에 차례대로 남는 책장 표식을 옆으로 옮겨 피하세요. 앞선 자리는 폭발 후 다시 지나갈 수 있습니다.', 'summon', 800, 3000, 1900);
      a.nextPulse = a.windupEnd; a.records = [];
    } else if (key === 'archive_rewrite') {
      setup('기억 되감기', '이전에 남겼던 잔상이 순서대로 폭발합니다. 바닥 번호를 읽고 마지막 폭발 뒤 나타난 본체를 공격하세요.', 'cast', 1400, 1900, 2300);
      const records = r.recordedPositions?.length ? r.recordedPositions.slice(-(3 + phase)) : this.players(r, true).map(p => ({ x: p.x, y: p.y }));
      records.forEach((p, i) => this.cast(r, { ...p, radius: 78 + phase * 7, damageRate: .13, name: `되감긴 기록 ${i + 1}`, order: i + 1 }, 1400 + i * 480));
      this.teleportBoss(r, m, phase === 2 ? { x: 704, y: 880 } : { x: 704, y: 368 });
      this.spawnAdds(r, phase === 2 ? 2 : 1);
    } else if (key === 'observatory_pull') {
      setup('중력핵 붕괴', '검은 핵에서 멀어지도록 계속 이동하세요. 다리를 따라 당김을 거슬러 빠져나오면 중심 폭발을 피할 수 있습니다.', 'pull', 1200, 2600, 2300);
      a.point = { x: m.x, y: m.y };
      this.cast(r, { ...a.point, radius: 155 + phase * 10, damageRate: .23, name: '중력핵 붕괴 · 중심에서 이탈' }, 3800);
    } else if (key === 'observatory_meteors') {
      setup('외곽 유성우', '낙성 원을 서로 겹치지 않게 유도하세요. 외곽 섬에도 예고가 있으므로 빈 다리와 중앙을 번갈아 사용하세요.', 'shoot', 800, 3100, 2000);
      a.nextPulse = a.windupEnd;
      a.point = { x: C.x + (r.attackCount % 2 ? -95 : 95), y: C.y + 65 };
    } else {
      setup('궤도를 긋는 혜성', '보스가 바깥 섬으로 이동하며 붕괴 흔적을 남깁니다. 바로 뒤따르지 말고 다른 다리를 골라 접근하세요.', 'charge', 1200, 2600, 2400);
      a.point = point(PADS[(r.attackCount + phase) % PADS.length]); a.nextPulse = a.windupEnd;
      this.cast(r, { ...a.point, shape: 'ring', radius: 240, inner: 160, damageRate: .16, name: '궤도 도착 · 안쪽 또는 원 밖으로' }, 3800);
    }
    r.bossAction = a; r.nextAttack = a.ends + 700;
    this.pose(m, a.kind, 'windup', a.starts, a.windupEnd, a.angle);
  }
  tickBoss(r, m, target, people, dt) {
    if (r.phase !== 'vulnerable') return;
    const now = this.game.now;
    if (!r.bossAction) { if (now >= r.nextAttack) this.beginBossAction(r, m, target); return; }
    const a = r.bossAction;
    if (now >= a.ends) { r.bossAction = null; m.encounterPose = null; return; }
    const stage = now < a.windupEnd ? 'windup' : now < a.strikeEnd ? 'strike' : 'recover';
    this.pose(m, a.kind, stage, stage === 'windup' ? a.starts : stage === 'strike' ? a.windupEnd : a.strikeEnd, stage === 'windup' ? a.windupEnd : stage === 'strike' ? a.strikeEnd : a.ends, a.angle);
    if (a.key === 'forge_leap' && now >= a.windupEnd) {
      const t = Math.min(1, (now - a.windupEnd) / (a.strikeEnd - a.windupEnd));
      m.x = a.from.x + (a.point.x - a.from.x) * t; m.y = a.from.y + (a.point.y - a.from.y) * t;
      m.encounterPose.height = Math.sin(t * Math.PI) * 72; m.moving = t < 1;
    }
    if (stage !== 'strike') return;
    if (a.key === 'forge_heat') {
      const chased = people.find(p => p.id === a.target) || target;
      this.walk(r, m, chased, 108 + r.stage * 12, dt);
      if (now >= a.nextPulse) {
        this.cast(r, { x: chased.x, y: chased.y, radius: 67 + r.stage * 5, damageRate: .095, pulses: 3, pulseMs: 850, name: '남겨진 용암 · 지속 열기', terrainHazard: true }, 1350);
        a.nextPulse = now + 950; a.pulses++;
      }
    } else if (a.key === 'archive_pages' && now >= a.nextPulse) {
      const remembered = people[a.pulses % people.length], pt = { x: remembered.x, y: remembered.y };
      a.records.push(pt); r.recordedPositions = a.records.slice(-5);
      this.cast(r, { ...pt, radius: 76, damageRate: .13, name: `새겨지는 기록 ${a.pulses + 1}`, order: a.pulses + 1 }, 1500 - r.stage * 100);
      a.nextPulse = now + 850 - r.stage * 90; a.pulses++;
    } else if (a.key === 'observatory_pull') {
      for (const p of people) {
        const d = dist(p, a.point); if (d < 24 || d > 560) continue;
        const amount = Math.min(d - 24, (65 + r.stage * 10) * Math.min(.1, dt));
        moveEntity(this.world(r).map, p, (a.point.x - p.x) / d * amount, (a.point.y - p.y) / d * amount, 10);
      }
    } else if (a.key === 'observatory_meteors') {
      this.walk(r, m, a.point, 85, dt);
      if (now >= a.nextPulse) {
        const marked = people[a.pulses % people.length];
        this.cast(r, { x: marked.x, y: marked.y, radius: 82, damageRate: .14, name: '관측 유성 · 위치 고정' }, 1550);
        const outer = PADS[(a.pulses + r.stage) % PADS.length];
        this.cast(r, { ...outer, radius: 108, damageRate: .15, name: '외곽 섬의 유성' }, 1800);
        a.nextPulse = now + 1250 - r.stage * 150; a.pulses++;
      }
    } else if (a.key === 'observatory_comet') {
      this.walk(r, m, a.point, 185, dt);
      if (now >= a.nextPulse) {
        this.cast(r, { x: m.x, y: m.y, radius: 72, damageRate: .12, name: '혜성의 궤적 · 뒤따르지 않기' }, 1400);
        a.nextPulse = now + 750; a.pulses++;
      }
    }
  }
  tickAdd(r, m, target, dt) {
    const now = this.game.now, d = dist(m, target), angle = Math.atan2(target.y - m.y, target.x - m.x);
    if (m.addAction && now >= m.addAction.ends) { m.addAction = null; m.encounterPose = null; }
    if (m.addAction && m.type !== 'dungeon_cinder') {
      const fireAt = m.addAction.starts + (m.type === 'dungeon_echo' ? 1100 : 1250);
      this.pose(m, 'shoot', now < fireAt ? 'windup' : now < m.addAction.ends - 200 ? 'strike' : 'recover', m.addAction.starts, m.addAction.ends, angle);
    }
    if (m.type === 'dungeon_cinder') {
      if (m.addAction && now >= m.addAction.strikeAt) { this.walk(r, m, m.addAction.point, 170, dt); this.pose(m, 'charge', 'strike', m.addAction.strikeAt, m.addAction.ends, m.addAction.angle); }
      else if (!m.addAction && d < 380 && now >= m.nextAttack) {
        m.addAction = { starts: now, strikeAt: now + 1000, ends: now + 2300, point: { x: target.x, y: target.y }, angle }; m.nextAttack = now + 4200;
        this.pose(m, 'charge', 'windup', now, now + 1000, angle);
        this.cast(r, { owner: m.id, x: target.x, y: target.y, radius: 64, boss: false, damageRate: .075, name: '화로 파편의 돌진 폭발' }, 2200);
      } else if (!m.addAction) this.walk(r, m, target, 72, dt);
    } else if (m.type === 'dungeon_satellite') {
      if (!m.addAction) this.walk(r, m, { x: C.x + Math.cos(now / 3500 + m.homeX) * 165, y: C.y + Math.sin(now / 3500 + m.homeX) * 165 }, 92, dt);
      if (now >= m.nextAttack) {
        m.nextAttack = now + 3400; m.addAction = { starts: now, ends: now + 1500 };
        this.pose(m, 'shoot', 'windup', now, now + 1250, angle);
        this.cast(r, { owner: m.id, x: target.x, y: target.y, radius: 51, boss: false, damageRate: .065, name: '관측 위성의 작은 유성' }, 1250);
      }
    } else {
      if (!m.addAction && d > 230) this.walk(r, m, target, 68, dt);
      if (d < 500 && now >= m.nextAttack) {
        m.nextAttack = now + 3500; m.addAction = { starts: now, ends: now + 2100 };
        this.pose(m, 'shoot', 'windup', now, now + 1100, angle);
        for (let i = 0; i < 3; i++) this.cast(r, { owner: m.id, x: m.x, y: m.y, shape: 'beam', angle: angle + (i - 1) * .22, length: 390, width: 25, radius: 390, boss: false, cover: true, damageRate: .045, name: `잔영의 책장 ${i + 1}` }, 1100 + i * 300);
      }
    }
  }
  resolveCasts(r) {
    const now = this.game.now, w = this.world(r), due = w.casts.filter(c => c.dungeonRun === r.id && c.ends <= now);
    w.casts = w.casts.filter(c => c.dungeonRun !== r.id || c.ends > now);
    for (const cast of due) {
      if (r.state !== 'active') break;
      if (['memory_laser', 'star_mark'].includes(cast.effect)) continue;
      if (!w.mobs.some(m => m.id === cast.owner && m.alive && m.dungeonRun === r.id)) continue;
      for (const p of this.players(r, true)) {
        const dx = p.x - cast.x, dy = p.y - cast.y, d = Math.hypot(dx, dy);
        let hit = cast.shape === 'ring' ? d <= cast.radius + 8 && d >= cast.inner - 8 : d <= cast.radius + 8;
        if (cast.shape === 'beam') { const along = dx * Math.cos(cast.angle) + dy * Math.sin(cast.angle), across = -dx * Math.sin(cast.angle) + dy * Math.cos(cast.angle); hit = along >= -10 && along <= cast.length && Math.abs(across) < cast.width / 2 + 8; }
        if (hit && cast.cover && !lineOfSight(w.map, cast, p)) hit = false;
        if (hit) this.damageFraction(p, cast.damageRate || .15);
        if (r.state !== 'active') break;
      }
      if (r.state !== 'active' || ['rescue', 'reform'].includes(r.phase)) break;
      this.fx({ dungeonRun: r.id, type: 'impact', x: cast.x, y: cast.y, radius: cast.radius, shape: cast.shape, inner: cast.inner, angle: cast.angle, length: cast.length, width: cast.width, boss: cast.boss, theme: cast.theme });
      if (cast.pulses > 1) w.casts.push({ ...cast, id: ++this.game.castSeq, starts: now, ends: now + (cast.pulseMs || 850), pulses: cast.pulses - 1, active: true });
    }
  }
  mobKilled(m) {
    if (!m.dungeonRun) return false;
    const r = this.runs.get(m.dungeonRun); if (!r || !m.alive) return true;
    if (m.id === r.bossId && !this.connected(r)) { m.hp = Math.max(1, m.hp); if (r.state === 'active') this.pause(r); return true; }
    if (m.id === r.bossId && (r.stage !== 2 || r.phase !== 'vulnerable' || r.state !== 'active')) { m.hp = Math.max(1, Math.floor(m.maxHp * FLOOR[r.stage])); return true; }
    m.alive = false; m.hp = 0; m.respawnAt = Infinity; m.dots = [];
    this.fx({ dungeonRun: r.id, type: 'death', id: m.id, monster: m.type, x: m.x, y: m.y, boss: m.id === r.bossId });
    this.credit(r, r.members.filter(id => m.contributors.has(id)));
    if (m.id === r.bossId) this.reward(r);
    return true;
  }
  view(p) {
    const r = this.runFor(p), now = this.game.now;
    if (!r) {
      const lobby = this.lobbies.get(p.partyId); if (!lobby || !lobby.members.includes(p.id)) return null;
      const def = DUNGEON_BY_ID[lobby.dungeon];
      return { state: 'lobby', selfId: p.id, lobbyId: lobby.id, dungeon: def.id, name: def.name, leader: lobby.leader, isLeader: p.id === lobby.leader,
        ends: lobby.ends, inputBlocked: false, entryZone: def.entryZone, members: lobby.members.map(id => { const m = this.game.players.get(id); return { id, name: m?.name || '접속 종료', ready: lobby.ready.has(id), online: !!m?.active, level: m?.level || 0, entryError: this.entryCheck(m, def) }; }) };
    }
    const def = DUNGEON_BY_ID[r.dungeon], boss = this.boss(r), markers = [], member = id => this.game.players.get(id);
    if (r.phase === 'balance') r.balancePads.forEach((pad, i) => markers.push({ ...pad, id: `balance_${i}`, kind: 'pad', label: `${i ? '달' : '해'} 문양 · 전원 유지`, color: DUNGEON_COLORS[i], radius: 74, symbol: i ? '달' : '해' }));
    if (r.phase === 'pillars') [0, 1].forEach(i => markers.push({ x: C.x + (i ? 200 : -200), y: C.y - 140, id: `pillar_${i}`, kind: 'pillar', label: `${i ? '달' : '해'} 기둥`, color: DUNGEON_COLORS[i], radius: 45, angle: r.pillars[i], goal: r.pillarGoals[i], symbol: i ? '달' : '해' }));
    if (['memory_show', 'memory_input'].includes(r.phase)) PADS.forEach((pad, i) => markers.push({ ...pad, id: `memory_${i}`, kind: 'rune', label: DUNGEON_SYMBOLS[i], color: DUNGEON_COLORS[i], radius: 48, symbol: DUNGEON_SYMBOLS[i] }));
    if (r.phase === 'memory_laser') {
      markers.push({ ...r.prism, id: 'prism', kind: 'prism', label: '빛의 프리즘', color: '#a3dfeb', radius: 40 });
      markers.push({ ...r.baitGoal, id: 'laser_bait', kind: 'target', label: `${member(r.bait)?.name} · 유도 자리`, color: '#e8bf77', radius: 58 });
      markers.push({ ...r.anchor, id: 'laser_anchor', kind: 'safe', label: '나머지 동료 · 기록 고정', color: '#9ed8ba', radius: 82 });
    }
    if (r.phase === 'star_mark') {
      markers.push({ ...r.starGoal, id: 'star_target', kind: 'target', label: `${member(r.bait)?.name} · 낙성 유도`, color: '#edac7f', radius: 65 });
      markers.push({ ...C, id: 'star_shelter', kind: 'safe', label: '나머지 동료 · 중앙 보호진', color: '#a3d9b8', radius: 106 });
    }
    if (r.phase === 'conduits') r.conduits.forEach((s, i) => markers.push({ x: s.x, y: s.y, id: `conduit_${i}`, kind: 'conduit', label: `${member(s.owner)?.name} · ${i + 1}번 차단`, color: i ? '#a7b2eb' : '#edbf7c', radius: 50, active: s.at > 0, owner: s.owner, progress: s.at ? Math.min(1, (now - s.at) / 1200) : 0 }));
    if (r.state === 'active' && r.revives > 0) for (const other of this.players(r).filter(m => m.hp <= 0)) markers.push({ x: other.x, y: other.y, id: `revive_${other.id}`, kind: 'revive', label: `${other.name} · 3초 구조`, color: '#9ce4bf', radius: 42 });
    return { id: r.id, runId: r.id, selfId: p.id, state: r.state, phase: r.phase, dungeon: def.id, name: def.name, bossName: def.bossName, theme: def.theme, color: def.color,
      inputBlocked: this.blocksInput(p), leader: r.leader, isLeader: p.id === r.leader, stage: r.stage + 1, attempt: r.attempt, ends: r.ends, phaseEnds: r.phaseEnds,
      graceEnds: r.graceEnds || 0, returnAt: r.returnAt || 0, hint: r.hint, failure: r.lastFailure, strikes: r.strikes, revives: r.revives,
      boss: boss ? { id: boss.id, hp: boss.hp, maxHp: boss.maxHp, shield: boss.dungeonShield } : null, markers,
      phaseTransition: r.phaseTransition && now < r.phaseTransition.ends ? { ...r.phaseTransition } : null,
      action: r.bossAction ? { name: r.bossAction.name, hint: r.bossAction.hint, stage: boss?.encounterPose?.stage || 'windup', ends: r.bossAction.ends } : null,
      myRole: r.assignments?.[p.id] || null,
      assignments: Object.entries(r.assignments || {}).map(([id, role]) => ({ id, name: member(id)?.name || id, x: member(id)?.x || 0, y: member(id)?.y || 0, ...role })),
      members: this.players(r).map(m => ({ id: m.id, name: m.name, hp: m.hp, maxHp: this.game.stats(m).maxHp, online: m.active, ready: r.retry.has(m.id), dead: m.hp <= 0 })),
      holdProgress: r.holdSince ? Math.min(1, (now - r.holdSince) / (r.phase === 'balance' ? 2000 : 1000)) : 0,
      sequence: r.phase === 'memory_show' ? r.sequence.map(n => DUNGEON_SYMBOLS[n]) : null, step: r.step || 0, totalSteps: r.sequence?.length || 0,
      operator: r.phase === 'memory_input' ? { id: this.operator(r), name: member(this.operator(r))?.name } : null,
      starLocked: !!r.starLocked, lockAt: r.lockAt || 0,
      reviving: r.reviving ? { helper: member(r.reviving.helper)?.name, target: member(r.reviving.target)?.name, ends: r.reviving.ends } : null,
      tether: r.tether ? { ...r.tether, points: r.tether.members.map(id => ({ id, name: member(id)?.name, x: member(id)?.x || 0, y: member(id)?.y || 0 })) } : null
    };
  }
}
