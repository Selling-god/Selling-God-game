import { randomUUID } from 'node:crypto';
import { MONSTERS, ZONES, ITEMS, MAX_LEVEL, xpRequired } from '../shared/content.js';
import { createMap, findSafePosition, dist, moveEntity } from '../shared/world.js';
import { DUNGEONS, DUNGEON_BY_ID, DUNGEON_ZONE, DUNGEON_RULES, DUNGEON_SYMBOLS, DUNGEON_COLORS, DUNGEON_SHOP, dungeonDay, prepareDungeons } from '../shared/dungeons.js';

const C = { x: 704, y: 544 };
const FLOOR = [.7, .35, 0];
const PADS = [{ x: 704, y: 294 }, { x: 954, y: 544 }, { x: 704, y: 794 }, { x: 454, y: 544 }];
const failure = error => ({ ok: false, error });
const num = n => Number.isFinite(n) ? n : 0;
const sameList = (a, b) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);

export class DungeonManager {
  constructor(game) { this.game = game; this.runs = new Map(); this.lobbies = new Map(); this.byParty = new Map(); }
  world() { return this.game.worlds.get(DUNGEON_ZONE); }
  runFor(p) { const r = this.runs.get(p?.dungeonRun); return r && r.members.includes(p.id) && !r.exited.has(p.id) ? r : null; }
  partyRun(id) { return this.runs.get(this.byParty.get(id)); }
  allows(p, entity) {
    if (!entity) return false;
    if (entity.dungeonRun) { const r = this.runFor(p); return !!r && p.zone === DUNGEON_ZONE && r.id === entity.dungeonRun && r.partyId === entity.dungeonParty; }
    return p.zone !== DUNGEON_ZONE && !p.dungeonRun;
  }
  sameInstance(a, b) {
    if (!a || !b || a.zone !== b.zone) return false;
    if (a.dungeonRun || b.dungeonRun || a.zone === DUNGEON_ZONE) return !!this.runFor(a) && a.dungeonRun === b.dungeonRun && !!this.runFor(b);
    return true;
  }
  blocksInput(p) { const r = this.runFor(p); return !!r && ['grace', 'wipe', 'complete'].includes(r.state); }
  connected(r) { return r.members.every(id => { const p = this.game.players.get(id); return p?.active && p.zone === DUNGEON_ZONE && p.dungeonRun === r.id; }); }
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
    const actor = this.game.players.get(data.by || data.id), entity = actor || this.world().mobs.find(m => m.id === data.id || m.id === data.owner);
    const r = this.runs.get(data.dungeonRun || entity?.dungeonRun); if (r) this.send(r, 'fx', { ...data, dungeonRun: r.id, t: this.game.now });
  }
  players(r, living = false) { return r.members.map(id => this.game.players.get(id)).filter(p => p && !r.exited.has(p.id) && (!living || p.active && p.hp > 0 && p.zone === DUNGEON_ZONE && p.dungeonRun === r.id)); }
  mobs(r) { return this.world().mobs.filter(m => m.dungeonRun === r.id && m.alive); }
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
    if (['travel', 'waypoint', 'worldJoin', 'challengeStart'].includes(a.type) && (r || a.id === DUNGEON_ZONE))
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
      reviving: null, holdSince: 0, hint: '4초 뒤 시작합니다. 파티원의 역할과 안내를 확인하세요.', lastFailure: '',
      actors: [...r.members], credit: {}, support: {}, tether: null, retry: new Set(), rewarded: false });
    this.players(r).forEach((p, index) => {
      const stats = this.game.stats(p); p.hp = stats.maxHp; p.mp = stats.maxMp; p.respawnAt = 0; p.target = null; p.path = []; p.input = { x: 0, y: 0 };
      for (const key of ['basic', 'skill1', 'skill2', 'ultimate', 'dash']) p.cooldowns[key] = 0;
      this.record(p, r.dungeon).attempts++; p.dungeonRun = r.id;
      this.game.teleport(p, DUNGEON_ZONE, C.x + (index - (r.members.length - 1) / 2) * 54, 904);
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
  clearCasts(r) { const w = this.world(); w.casts = w.casts.filter(c => c.dungeonRun !== r.id); }
  clearEntities(r) { const w = this.world(); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id); this.clearCasts(r); }
  beforePartyLeave(p) {
    const r = this.runFor(p) || this.partyRun(p.partyId), lobby = this.lobbies.get(p.partyId);
    if (r) this.endRun(r, '파티 구성이 변경되어 던전에서 돌아왔습니다.');
    if (lobby) this.cancelLobby(lobby, '파티 구성이 변경되어 준비 확인을 취소했습니다.');
  }
  beforeTeleport(p, zone) {
    const r = this.runFor(p); if (!r || zone === DUNGEON_ZONE) return;
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
      if (!p.active || p.dungeonRun !== r.id || p.zone !== DUNGEON_ZONE) continue;
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
    r.bossId = m.id; r.nextAttack = this.game.now + 4000; r.attackCount = 0; this.world().mobs.push(m);
  }
  spawnAdds(r, count) {
    for (let i = 0; i < count; i++) {
      const angle = (i + .5) / count * Math.PI * 2, m = this.game.makeMob(`${r.id}_echo_${++r.mobSeq}`, 'dungeon_echo', C.x + Math.cos(angle) * 180, C.y + Math.sin(angle) * 170);
      m.hp = m.maxHp = Math.round(r.power * 3.8 * (.7 + r.members.length * .3));
      Object.assign(m, { dungeonRun: r.id, dungeonParty: r.partyId, dungeonRole: 'add', name: MONSTERS.dungeon_echo.name, respawnAt: Infinity, nextAttack: this.game.now + 2500 });
      m.dungeonStats = { level: r.level, def: Math.round(r.level * .35), atk: 10 + r.level, speed: 64, range: 110 };
      this.world().mobs.push(m);
    }
  }
  cast(r, spec, delay = 1800) {
    const c = { id: ++this.game.castSeq, owner: r.bossId, dungeonRun: r.id, dungeonParty: r.partyId,
      shape: 'circle', radius: 80, inner: 0, boss: true, theme: DUNGEON_BY_ID[r.dungeon].theme, monster: DUNGEON_BY_ID[r.dungeon].boss,
      starts: this.game.now, ends: this.game.now + delay, damageRate: .16, ...spec };
    this.world().casts.push(c); return c;
  }
  credit(r, ids) { for (const id of ids) r.credit[id] = (r.credit[id] || 0) + 1; }
  beginMechanic(r) {
    const boss = this.boss(r); if (!boss || r.state !== 'active') return;
    r.actors = this.players(r, true).map(p => p.id); if (r.actors.length < 2) return;
    this.clearCasts(r); const w = this.world(); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id || m.id === r.bossId);
    boss.dungeonShield = true; boss.x = C.x; boss.y = C.y - 100; boss.moving = false;
    r.holdSince = 0; r.tether = null; r.nextHazard = this.game.now + 6000; r.phaseStarted = this.game.now; r.assignments = {};
    if (r.dungeon === 'concord_forge') {
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
    for (const id of r.actors) r.assignments[id] = id === r.bait ? { role: 'bait', label: '광선 유도', color: '#edc47d' } : { role: 'anchor', label: '기록 고정', color: '#9ed8ba' };
    r.hint = `${this.game.players.get(r.bait)?.name || '유도자'} 님은 프리즘 뒤 노란 자리에, 나머지는 초록 고정진에 모여 1초 이상 유지하세요.`;
    this.tell(r, r.hint);
  }
  beginStar(r) {
    this.clearCasts(r); r.phase = 'star_mark'; r.phaseStarted = this.game.now; r.phaseEnds = this.game.now + 9000 - r.stage * 1000;
    r.lockAt = r.phaseEnds - 1800; r.bait = r.actors[r.stage % r.actors.length]; r.starGoal = { ...PADS[(r.stage + 1) % PADS.length] }; r.starLocked = false;
    const target = this.game.players.get(r.bait); r.starPoint = { x: target.x, y: target.y };
    r.mechanicCast = this.cast(r, { ...r.starPoint, radius: 95, effect: 'star_mark', name: '낙성 낙인 · 바깥 문양으로 유도 후 이탈' }, r.phaseEnds - this.game.now).id;
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
    this.clearCasts(r); const w = this.world(); w.mobs = w.mobs.filter(m => m.dungeonRun !== r.id || m.id === r.bossId);
    this.credit(r, r.actors); r.phase = 'vulnerable'; r.phaseStarted = this.game.now; r.phaseEnds = this.game.now + 24000;
    boss.dungeonShield = false; boss.stunUntil = 0; r.nextAttack = this.game.now + 2500;
    r.hint = '협동 기믹 성공! 24초 동안 보호막이 열립니다. 보스의 예고를 피하며 공격하세요.';
    if (r.dungeon === 'fallen_observatory' && r.stage > 0) {
      r.tether = { members: [r.actors[0], r.actors.at(-1)], ends: this.game.now + 6500, minimum: 180 };
      r.hint += ' 분리 사슬의 두 사람은 180 이상 떨어지세요.';
    }
    this.tell(r, r.hint, 'success'); this.fx({ dungeonRun: r.id, type: 'armorBreak', x: boss.x, y: boss.y, theme: DUNGEON_BY_ID[r.dungeon].theme, phase: r.stage + 1 });
  }
  damageFraction(p, fraction) { const s = this.game.stats(p); this.game.damagePlayer(p, Math.round(s.maxHp * fraction + s.def * .65)); }
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
    if (['recover', 'reform'].includes(r.phase)) { if (now >= r.phaseEnds) this.beginMechanic(r); return; }
    if (r.phase === 'rescue') { if (now >= r.phaseEnds) this.wipe(r, '20초 안에 동료를 구조하지 못했습니다.'); return; }
    if (r.phase === 'balance') {
      const matched = r.actors.every(id => { const p = this.game.players.get(id), pad = r.balancePads[r.assignments[id].pad]; return p?.active && p.hp > 0 && dist(p, pad) <= 74; });
      if (!matched) r.holdSince = 0; else { r.holdSince ||= now; if (now - r.holdSince >= 2000) { this.credit(r, r.actors); this.beginPillars(r); return; } }
    } else if (r.phase === 'memory_show') {
      if (now >= r.phaseEnds) { r.phase = 'memory_input'; r.phaseEnds = now + 35000; r.nextHazard = now + 6500; r.hint = `순서 입력 시작 · ${this.game.players.get(this.operator(r))?.name} 님부터 장치를 작동하세요.`; this.spawnAdds(r, 2); }
      return;
    } else if (r.phase === 'memory_laser') {
      const bait = this.game.players.get(r.bait), cast = this.world().casts.find(c => c.id === r.mechanicCast);
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
      const bait = this.game.players.get(r.bait), cast = this.world().casts.find(c => c.id === r.mechanicCast);
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
      if (r.stage < 2 && boss.hp <= Math.floor(boss.maxHp * FLOOR[r.stage])) { r.stage++; this.beginMechanic(r); return; }
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
      this.cast(r, { x: 120, y: C.y, shape: 'beam', angle: 0, length: 1168, width: 48 + r.stage * 9, radius: 1200, damageRate: .14, name: '회랑을 가르는 빛' }, 2100);
      if (r.dungeon === 'memory_archive' && r.stage === 2) this.cast(r, { x: C.x, y: 120, shape: 'beam', angle: Math.PI / 2, length: 848, width: 50, radius: 1000, damageRate: .14, name: '엇갈리는 기억' }, 2600);
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
    shift(r.tether, ['ends']); shift(r.reviving, ['started', 'ends']); for (const c of r.conduits || []) shift(c, ['at']);
    for (const c of this.world().casts.filter(c => c.dungeonRun === r.id)) shift(c, ['starts', 'ends']);
    for (const m of this.mobs(r)) { shift(m, ['nextAttack', 'castUntil', 'stunUntil', 'slowUntil']); for (const dot of m.dots) shift(dot, ['next']); }
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
      if (everyone.some(p => p.zone !== DUNGEON_ZONE || p.dungeonRun !== r.id)) { this.endRun(r, '던전을 이탈한 파티원이 있어 입구로 돌아갑니다.'); continue; }
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
    if (!people.length || ['rescue', 'recover', 'reform'].includes(r.phase)) return;
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
      if (m.id === r.bossId) {
        if (r.phase !== 'vulnerable' || now < r.nextAttack) continue;
        r.nextAttack = now + 4200 - r.stage * 350; r.attackCount++;
        if (r.attackCount % 3 === 0) this.cast(r, { x: m.x, y: m.y, shape: 'ring', radius: 330, inner: 105, damageRate: .18 + r.stage * .025, name: '계약의 파동' }, 1900 - r.stage * 150);
        else if (r.attackCount % 3 === 1) this.cast(r, { x: target.x, y: target.y, radius: 100 + r.stage * 12, damageRate: .17 + r.stage * .025, name: '수호자의 표적' }, 1750);
        else this.cast(r, { x: m.x, y: m.y, shape: 'beam', angle: Math.atan2(dy, dx), length: 850, width: 85 + r.stage * 10, radius: 850, damageRate: .2, name: '성역을 가르는 검광' }, 1850);
      } else {
        if (d < 150 && m.nextAttack <= now) {
          m.nextAttack = now + 2700; this.cast(r, { owner: m.id, x: target.x, y: target.y, radius: 40, boss: false, damageRate: .065, name: '기억 잔영의 파편' }, 950);
        } else if (d > 100 && d > 0) { const speed = 64 * (m.slowUntil > now ? .5 : 1), old = { x: m.x, y: m.y }; moveEntity(this.world().map, m, dx / d * speed * Math.min(.1, dt), dy / d * speed * Math.min(.1, dt), 12); m.moving = dist(m, old) > .05; }
      }
    }
  }
  resolveCasts(r) {
    const now = this.game.now, w = this.world(), due = w.casts.filter(c => c.dungeonRun === r.id && c.ends <= now);
    w.casts = w.casts.filter(c => c.dungeonRun !== r.id || c.ends > now);
    for (const cast of due) {
      if (r.state !== 'active') break;
      if (['memory_laser', 'star_mark'].includes(cast.effect)) continue;
      if (!w.mobs.some(m => m.id === cast.owner && m.alive && m.dungeonRun === r.id)) continue;
      for (const p of this.players(r, true)) {
        const dx = p.x - cast.x, dy = p.y - cast.y, d = Math.hypot(dx, dy);
        let hit = cast.shape === 'ring' ? d <= cast.radius + 8 && d >= cast.inner - 8 : d <= cast.radius + 8;
        if (cast.shape === 'beam') { const along = dx * Math.cos(cast.angle) + dy * Math.sin(cast.angle), across = -dx * Math.sin(cast.angle) + dy * Math.cos(cast.angle); hit = along >= -10 && along <= cast.length && Math.abs(across) < cast.width / 2 + 8; }
        if (hit) this.damageFraction(p, cast.damageRate || .15);
        if (r.state !== 'active') break;
      }
      if (r.state !== 'active' || ['rescue', 'reform'].includes(r.phase)) break;
      this.fx({ dungeonRun: r.id, type: 'impact', x: cast.x, y: cast.y, radius: cast.radius, shape: cast.shape, inner: cast.inner, angle: cast.angle, length: cast.length, width: cast.width, boss: cast.boss, theme: cast.theme });
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
