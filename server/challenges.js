import { randomUUID } from 'node:crypto';
import { MONSTERS, ITEMS, ZONES, MAX_LEVEL, xpRequired } from '../shared/content.js';
import { createMap, dist, isBlocked, moveEntity } from '../shared/world.js';
import {
  CHALLENGE_ZONE, CHALLENGE_BY_ID, CHALLENGE_TIERS, CHALLENGE_SHOP,
  RUNE_NAMES, RUNE_COLORS, challengeKey, challengeGate, challengeDay, prepareChallenges
} from '../shared/challenges.js';

const CENTER = { x: 576, y: 448 };
const ENTRY = { x: 576, y: 688 };
const RUNE_PADS = [
  { x: 384, y: 288 }, { x: 768, y: 288 }, { x: 384, y: 608 }, { x: 768, y: 608 }
];
const SEALS = [{ x: 352, y: 448 }, { x: 800, y: 448 }];
const REFUGES = [{ x: 384, y: 448 }, { x: 768, y: 448 }, { x: 576, y: 272 }];
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const failure = error => ({ ok: false, error });

function castHits(c, p) {
  if (c.safe?.some(s => dist(s, p) <= s.radius - 8)) return false;
  const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
  if (c.shape === 'beam') {
    const along = dx * Math.cos(c.angle) + dy * Math.sin(c.angle);
    const across = -dx * Math.sin(c.angle) + dy * Math.cos(c.angle);
    return along >= -10 && along <= c.length && Math.abs(across) <= c.width / 2 + 8;
  }
  return c.shape === 'ring' ? d <= c.radius + 8 && d >= c.inner - 8 : d <= c.radius + 8;
}

/**
 * One player's run owns every enemy, cast, interaction and reward. The geometry
 * is shared, but Game filters combat and snapshots with allows/sameInstance.
 * No client packet carries progress, completion, damage or a reward amount.
 */
export class ChallengeManager {
  constructor(game) { this.game = game; this.runs = new Map(); }
  world() { return this.game.worlds.get(CHALLENGE_ZONE); }
  runFor(p) {
    const run = this.runs.get(p.id);
    return run && p.challengeRun === run.id && !run.finished ? run : null;
  }
  allows(p, entity) {
    if (!entity) return false;
    if (entity.challengeOwner || entity.challengeRun) {
      const r = this.runFor(p);
      return !!r && p.zone === CHALLENGE_ZONE && entity.challengeOwner === p.id && entity.challengeRun === r.id;
    }
    return p.zone !== CHALLENGE_ZONE && !p.challengeRun;
  }
  canDamage(p, m) { return this.allows(p, m) && !m.challengeShield; }
  sameInstance(a, b) {
    if (!a || !b || a.zone !== b.zone) return false;
    if (a.zone === CHALLENGE_ZONE || a.challengeRun || b.challengeRun) return a.id === b.id && a.challengeRun === b.challengeRun;
    return true;
  }
  mobSpec(m) { return { ...MONSTERS[m.type], ...(m.challengeStats || {}) }; }
  fx(r, data) { this.game.send(r.owner, 'fx', { ...data, challengeOwner: r.owner, t: this.game.now }); }
  tell(r, text, tone = 'info') {
    const p = this.game.players.get(r.owner); if (p) this.game.toast(p, text, tone);
  }
  mobs(r) { return this.world().mobs.filter(m => m.challengeRun === r.id && m.alive); }
  record(p, r) {
    const key = challengeKey(r.mode, r.tier);
    return p.challenges.records[key] ||= { clears: 0, bestMs: 0, bestScore: 0, bestFloor: 0, checkpoint: 0, firstClearAt: 0 };
  }
  action(p, a) {
    if (!a || typeof a.type !== 'string') return null;
    if (a.type === 'challengeStart') return this.start(p, a);
    if (a.type === 'challengeShop') return this.exchange(p, a.id);
    const r = this.runFor(p);
    if (['travel', 'waypoint', 'worldJoin'].includes(a.type) && (r || a.id === CHALLENGE_ZONE))
      return failure(r ? '도전을 마치거나 나가기 버튼으로 돌아간 뒤 이동하세요.' : '별의 회랑은 도전 메뉴에서 입장할 수 있습니다.');
    if (a.type === 'changeJob' && r) return failure('도전 중에는 직업을 바꿀 수 없습니다.');
    if (a.type === 'challengeExit' || (r && a.type === 'return')) {
      if (!r) return failure('진행 중인 도전이 없습니다.');
      this.finish(p, r, false, '도전을 마치고 돌아왔습니다.'); return { ok: true };
    }
    if (a.type === 'challengeInteract' || (r && a.type === 'interact')) {
      if (!r) return failure('진행 중인 도전이 없습니다.');
      return this.interact(p, r, a.id);
    }
    if (a.type === 'challengeWard') {
      if (!r || r.mode !== 'defense') return failure('수정 수호전에서만 사용할 수 있습니다.');
      if (r.phase !== 'fight' || dist(p, CENTER) > 105) return failure('중앙 수정 가까이에서 보호막을 펼치세요.');
      if (r.charge < 5) return failure('빛 5개가 필요합니다.');
      if (r.wardReady > this.game.now) return failure('수정 보호막이 아직 충전 중입니다.');
      r.charge -= 5; r.wardUntil = this.game.now + 6000; r.wardReady = this.game.now + 15000;
      this.fx(r, { type: 'buff', x: CENTER.x, y: CENTER.y, color: '#a4e3d2' });
      return { ok: true, message: '6초 동안 수정을 보호합니다.' };
    }
    return null;
  }
  start(p, a) {
    if (!Object.hasOwn(CHALLENGE_BY_ID, a.id)) return failure('알 수 없는 도전입니다.');
    if (this.runFor(p) || p.challengeRun || p.zone === CHALLENGE_ZONE) return failure('진행 중인 도전을 먼저 마쳐주세요.');
    if (!p.active || p.hp <= 0) return failure('생존한 상태에서 도전을 시작할 수 있습니다.');
    const tier = a.tier === undefined ? 0 : a.tier;
    if (!Number.isInteger(tier) || !CHALLENGE_TIERS[tier]) return failure('올바른 도전 난이도를 선택하세요.');
    if (p.level < challengeGate(a.id, tier)) return failure(`레벨 ${challengeGate(a.id, tier)}부터 도전할 수 있습니다.`);
    if (this.game.now - (p.lastCombat || 0) < 5000) return failure('전투가 끝나고 5초 뒤 도전할 수 있습니다.');
    if ((p.challengeReadyAt || 0) > this.game.now) return failure('잠시 후 다시 도전해 주세요.');
    prepareChallenges(p);
    const now = this.game.now, mode = a.id;
    const checkpoint = mode === 'tower' && a.checkpoint === true ? p.challenges.records[challengeKey(mode, tier)]?.checkpoint || 0 : 0;
    const r = {
      id: `challenge_${randomUUID()}`, owner: p.id, mode, tier, level: p.level, scale: CHALLENGE_TIERS[tier].scale,
      started: now, ends: now + (mode === 'survival' ? 183000 : mode === 'runes' ? 153000 : mode === 'tower' ? 3000000 : 483000),
      phase: 'preparing', nextAt: now + 3000, stage: mode === 'tower' ? checkpoint + 1 : 1, startFloor: checkpoint + 1,
      kills: 0, stageKills: 0, mobSeq: 0, pulse: 0, nextHazard: now + 7000, lastInteract: 0,
      baseline: Math.max(24, 22 + p.level * 3.4), baseHp: 120 + p.level * 18,
      crystalHp: 1000, charge: 0, wardUntil: 0, wardReady: 0, mistakes: 0, runeStep: 0,
      hint: '잠시 뒤 시작합니다. 붉은 예고를 피하고 목표를 확인하세요.'
    };
    p.challenges.returnPoint = { zone: p.zone, x: p.x, y: p.y, hp: p.hp, mp: p.mp };
    this.runs.set(p.id, r); p.challengeRun = r.id;
    this.game.teleport(p, CHALLENGE_ZONE, ENTRY.x, ENTRY.y);
    const stats = this.game.stats(p); p.hp = stats.maxHp; p.mp = stats.maxMp; p.respawnAt = 0;
    p.invulnerableUntil = now + 3000;
    this.game.mark(p); this.tell(r, `${CHALLENGE_BY_ID[mode].name} · ${CHALLENGE_TIERS[tier].name} 도전을 시작합니다.`);
    return { ok: true };
  }
  exchange(p, id) {
    const item = CHALLENGE_SHOP.find(x => x.id === id);
    if (!item) return failure('없는 교환 품목입니다.');
    if (this.runFor(p)) return failure('도전을 마친 뒤 보상을 교환하세요.');
    prepareChallenges(p);
    if (p.challenges.tokens < item.cost) return failure(`도전의 빛 ${item.cost}개가 필요합니다.`);
    if (Object.entries(item.items).some(([key, count]) => !ITEMS[key] || (p.inventory[key] || 0) + count > 9999))
      return failure('가방에 재료를 받을 공간을 확보해 주세요.');
    p.challenges.tokens -= item.cost;
    for (const [key, count] of Object.entries(item.items)) this.game.addItem(p, key, count);
    this.game.mark(p); return { ok: true, message: `${item.name}을 받았습니다.` };
  }
  beforeTeleport(p, zone) {
    const r = this.runFor(p);
    if (r && zone !== CHALLENGE_ZONE) this.finish(p, r, false, '회랑을 떠나 도전이 종료되었습니다.', { teleport: false });
  }
  onDeath(p) {
    const r = this.runFor(p); if (!r) return false;
    this.finish(p, r, false, '쓰러져 도전이 종료되었습니다. 장비와 경험치는 잃지 않습니다.'); return true;
  }
  cleanup(r, p) {
    r.finished = true;
    const w = this.world(); w.mobs = w.mobs.filter(m => m.challengeRun !== r.id); w.casts = w.casts.filter(c => c.challengeRun !== r.id);
    this.runs.delete(r.owner);
    if (p?.challengeRun === r.id) p.challengeRun = null;
  }
  finish(p, r, won, reason, { teleport = true } = {}) {
    if (r.finished || this.runs.get(p.id) !== r) return;
    const now = this.game.now, elapsed = Math.max(0, now - r.started - 3000), record = this.record(p, r), key = challengeKey(r.mode, r.tier);
    let tokens = 0, gold = 0, xp = 0;
    const score = r.mode === 'tower' ? Math.max(0, r.stage - (won ? 0 : 1))
      : r.mode === 'defense' ? Math.round(r.crystalHp)
        : r.mode === 'survival' ? r.kills : r.mode === 'runes' ? Math.max(0, 1000 - r.mistakes * 150 - Math.floor(elapsed / 1000)) : r.kills;
    if (won) {
      record.clears++; record.bestScore = Math.max(record.bestScore, score);
      if (r.mode !== 'tower' || r.startFloor === 1) record.bestMs = record.bestMs ? Math.min(record.bestMs, elapsed) : elapsed;
      record.firstClearAt ||= now;
      if (!p.challenges.claims.includes(key)) {
        p.challenges.claims.push(key); tokens = 8 * (r.tier + 1); gold = (250 + r.level * 8) * (r.tier + 1);
        xp = p.level >= MAX_LEVEL ? 0 : Math.round(xpRequired(r.level) * .18);
      } else if (p.challenges.daily[key] !== challengeDay(now)) {
        tokens = 2 * (r.tier + 1); gold = (60 + r.level * 2) * (r.tier + 1);
      }
      p.challenges.daily[key] = challengeDay(now);
      p.challenges.tokens = Math.min(1000000, p.challenges.tokens + tokens); p.gold += gold;
      if (xp) this.game.giveXP(p, xp);
      const title = CHALLENGE_BY_ID[r.mode].title;
      p.titles ||= []; if (!p.titles.includes(title)) p.titles.push(title);
    }
    p.challenges.lastResult = { mode: r.mode, tier: r.tier, won, reason, elapsed, score, tokens, gold, xp, at: now };
    const back = p.challenges.returnPoint || { zone: 'town', x: 784, y: 688, hp: 1, mp: 0 };
    this.cleanup(r, p); p.challenges.returnPoint = null; p.challengeReadyAt = now + 1500;
    p.respawnAt = 0; p.target = null; p.path = []; p.input = { x: 0, y: 0 }; p.dashUntil = 0; p.dashVector = null;
    const stats = this.game.stats(p); p.hp = Math.min(stats.maxHp, Math.max(1, finite(back.hp, 1))); p.mp = Math.min(stats.maxMp, Math.max(0, finite(back.mp)));
    if (teleport) {
      const zone = ZONES[back.zone] && back.zone !== CHALLENGE_ZONE ? back.zone : 'town', map = createMap(zone);
      let x = back.x, y = back.y;
      if (!Number.isFinite(x) || !Number.isFinite(y) || isBlocked(map, x, y, 10)) {
        x = ZONES[zone].spawn[0] * 32 + 16; y = ZONES[zone].spawn[1] * 32 + 16;
      }
      this.game.teleport(p, zone, x, y);
    }
    this.game.mark(p);
    this.game.toast(p, won ? `${CHALLENGE_BY_ID[r.mode].name} 완료! 도전의 빛 +${tokens} · ${gold} G${xp ? ` · ${xp} EXP` : ''}` : reason, won ? 'success' : 'info');
    this.game.send(p.id, 'challengeResult', p.challenges.lastResult);
  }
  spawn(r, type, x, y, { boss = false, role = 'hunter', factor = 1 } = {}) {
    const m = this.game.makeMob(`${r.id}_${++r.mobSeq}`, type, x, y);
    const hp = Math.round(r.baseline * (boss ? 22 + r.stage * .6 : 2.8 + r.stage * .07) * r.scale * factor);
    m.hp = m.maxHp = hp; m.challengeOwner = r.owner; m.challengeRun = r.id; m.challengeRole = role;
    m.challengeStats = { level: r.level, def: Math.round(r.level * .45), atk: Math.round((10 + r.level * 2.1) * r.scale), speed: boss ? 66 : type === 'wolf' ? 105 : 78,
      range: boss ? 92 : type === 'wisp' || type === 'imp' ? 140 : 44, aggro: 1800, boss };
    m.nextAttack = this.game.now + 1400; m.respawnAt = Infinity; m.challengeShield = false;
    this.world().mobs.push(m); return m;
  }
  spawnRing(r, count, { defense = false, factor = 1 } = {}) {
    const types = defense ? ['wolf', 'skeleton', 'golem', 'imp'] : ['slime', 'wolf', 'skeleton', 'wisp'];
    for (let i = 0; i < count; i++) {
      const angle = (i / count + (r.stage % 3) * .11) * Math.PI * 2, radius = defense ? 340 : 200 + (i % 2) * 50;
      this.spawn(r, types[(r.stage + i) % types.length], CENTER.x + Math.cos(angle) * radius, CENTER.y + Math.sin(angle) * (defense ? 300 : radius), { role: defense ? 'siege' : 'hunter', factor });
    }
  }
  cast(r, spec, delay = 1400) {
    const g = this.game;
    const cast = { id: ++g.castSeq, owner: spec.owner || r.id, challengeOwner: r.owner, challengeRun: r.id,
      starts: g.now, ends: g.now + delay, boss: true, shape: 'circle', radius: 80, inner: 0,
      damage: (14 + r.level * 2.3) * r.scale, theme: 'astral', ...spec };
    this.world().casts.push(cast); return cast;
  }
  beginStage(p, r) {
    r.phase = 'fight'; r.stageKills = 0; r.stageStarted = this.game.now; r.nextHazard = this.game.now + 6000;
    if (r.mode === 'tower') {
      r.stageEnds = this.game.now + 90000;
      if (r.stage % 5 === 0) {
        const type = ['moss_guardian', 'moon_witch', 'eclipse_dragon'][(Math.floor(r.stage / 5) - 1) % 3];
        const boss = this.spawn(r, type, CENTER.x, CENTER.y - 80, { boss: true, factor: .75 + r.stage * .025 }); r.bossId = boss.id;
        r.hint = `${r.stage}층 파수꾼 · 붉은 예고를 피해 제한 시간 안에 처치하세요.`;
      } else {
        this.spawnRing(r, 3 + Math.floor(r.stage / 6), { factor: .8 + r.stage * .027 });
        r.hint = `${r.stage}층 · 모든 적을 처치하세요.${r.stage >= 3 ? ' 바닥의 파동도 주의하세요.' : ''}`;
      }
    } else if (r.mode === 'boss_rush') {
      const types = ['moss_guardian', 'moon_witch', 'eclipse_dragon'];
      const boss = this.spawn(r, types[r.stage - 1], CENTER.x, CENTER.y - 90, { boss: true, factor: 1.5 + r.stage * .3 });
      r.bossId = boss.id; r.secondSeal = false; r.channelUntil = 0; r.refuge = null;
      // A prepared character should still see each encounter's defining rule
      // before a normal opening rotation can defeat the boss.
      r.nextMechanic = this.game.now + (r.stage >= 2 ? 2500 : 7000);
      if (r.stage === 1) this.sealBoss(r, boss);
      else r.hint = r.stage === 2 ? '달의 시험 · 보호진이 나타나면 초록 원 안으로 들어가세요.' : '별의 시험 · 보스가 힘을 모으면 방해꾼 둘을 먼저 처치하세요.';
    } else if (r.mode === 'survival') {
      r.nextWave = this.game.now + 18000; r.safeRadius = 420; this.spawnRing(r, 3, { factor: .72 });
      r.hint = '3분 생존 + 적 18마리 처치 · 초록 경계 안에서 싸우세요.';
    } else if (r.mode === 'defense') {
      this.spawnRing(r, 3 + r.stage, { defense: true, factor: 2 + r.stage * .15 });
      r.hint = `${r.stage}차 공세 · 수정을 지키세요. 처치한 적의 빛으로 수리할 수 있습니다.`;
    } else this.beginRuneRound(r);
  }
  sealBoss(r, boss) {
    boss.challengeShield = true; r.seals = [false, false];
    r.hint = '수호자가 봉인에 보호받고 있습니다. 좌우 봉인 가까이에서 상호작용하세요.';
    this.tell(r, '좌우의 두 봉인을 해제해야 수호자에게 피해를 줄 수 있습니다.');
  }
  beginRuneRound(r) {
    r.phase = 'memorize'; r.runeStep = 0; r.sequence = [];r.runeOrder=[];r.runeGuards=[];r.runeGuardsReady=false;
    for (let i = 0; i < r.stage + 2; i++) {
      let value = Math.min(3, Math.max(0, Math.floor(this.game.random() * 4)));
      if (value === r.sequence.at(-1)) value = (value + 1) % 4;
      r.sequence.push(value);
    }
    r.runeOrder=r.stage===3?[...r.sequence].reverse():[...r.sequence];
    r.peekUntil = this.game.now + 4200 + r.sequence.length * 500;
    r.nextHazard = r.peekUntil + 2500;
    r.hint = r.stage===1?'1관문 · 기억한 순서를 되짚으며 광선을 피하세요.':r.stage===2?'2관문 · 기억이 사라진 뒤 방해꾼을 처치해야 발판을 사용할 수 있습니다.':'3관문 · 문양을 역순으로 해독하세요. 세 파수꾼이 길을 막습니다.';
    this.tell(r, `기억할 순서: ${r.sequence.map(n => RUNE_NAMES[n]).join(' → ')}`);
  }
  interact(p, r, id) {
    const now = this.game.now;
    if (now - r.lastInteract < 550) return { ok: false, quiet: true };
    if (r.mode === 'boss_rush' && r.stage === 1 && r.phase === 'fight') {
      const boss = this.mobs(r).find(m => m.id === r.bossId);
      if (!boss?.challengeShield) return failure('봉인이 이미 풀렸습니다. 수호자를 공격하세요.');
      const i = SEALS.findIndex((s, index) => dist(p, s) <= 74 && !r.seals[index] && (!id || id === `seal_${index}`));
      if (i < 0) return failure('빛나는 봉인 가까이에서 작동하세요.');
      r.lastInteract = now; r.seals[i] = true; this.fx(r, { type: 'buff', ...SEALS[i], color: '#9be2b4' });
      if (r.seals.every(Boolean)) { boss.challengeShield = false; r.hint = '두 봉인이 풀렸습니다. 수호자를 공격하세요.'; this.tell(r, '봉인 해제! 수호자를 공격할 수 있습니다.', 'success'); }
      return { ok: true };
    }
    if (r.mode === 'defense') {
      if (r.phase !== 'fight' && r.phase !== 'rest') return failure('수호전이 곧 시작합니다.');
      if (dist(p, CENTER) > 105 || (id && id !== 'crystal')) return failure('중앙 수정 가까이에서 수리하세요.');
      if (r.crystalHp >= 1000) return failure('수정이 온전합니다.');
      if (r.charge < 3) return failure('수리에 필요한 빛 3개를 모아주세요.');
      r.lastInteract = now; r.charge -= 3; r.crystalHp = Math.min(1000, r.crystalHp + 180);
      this.fx(r, { type: 'buff', ...CENTER, color: '#a4e3d2' }); return { ok: true, message: '수정 내구도 18%를 회복했습니다.' };
    }
    if (r.mode === 'runes') {
      if (r.phase !== 'input') return failure(r.phase === 'memorize' ? '먼저 순서를 기억하세요. 문양이 사라지면 입력을 시작합니다.' : '다음 기억 시험을 준비하고 있습니다.');
      const index = RUNE_PADS.findIndex((pad, i) => dist(p, pad) <= 70 && (!id || id === `rune_${i}`));
      if (index < 0) return failure('문양 발판 가까이에서 상호작용하세요.');
      r.lastInteract = now;
      if (this.mobs(r).some(m=>m.challengeRole==='rune_guard'))return failure('기억의 파수꾼을 모두 쓰러뜨려야 발판 봉인이 풀립니다.');
      if (r.runeOrder[r.runeStep] !== index) {
        r.mistakes++; r.runeStep = 0;r.ends-=r.stage===3?3000:1200;
        if (r.mistakes >= 3) this.finish(p, r, false, '문양 순서를 세 번 틀려 기억의 시험이 종료되었습니다.');
        else { r.hint = `오답! 다시 처음부터 · 실수 ${r.mistakes}/3 · 남은 시간 감소`; this.tell(r, r.hint); } 
        return { ok: true };
      }
      r.runeStep++; this.fx(r, { type: 'buff', ...RUNE_PADS[index], color: RUNE_COLORS[index] });
      r.hint = `올바른 문양 ${r.runeStep}/${r.sequence.length} · 다음 발판으로 이동하세요.`;
      if (r.runeStep === r.runeOrder.length) {
        if (r.stage === 3) this.finish(p, r, true, '파수꾼을 뚫고 반전 문양을 해독했습니다.');
        else { r.stage++; r.phase = 'rest'; r.nextAt = now + 1800; this.clearCasts(r); r.hint = '기억을 되찾았습니다. 다음 시험을 준비하세요.'; }
      }
      return { ok: true };
    }
    return failure('지금은 작동할 장치가 없습니다. 목표와 바닥 예고를 확인하세요.');
  }
  clearCasts(r) { const w = this.world(); w.casts = w.casts.filter(c => c.challengeRun !== r.id); }
  mobKilled(m) {
    if (!m.challengeRun) return false;
    if (!m.alive) return true;
    m.alive = false; m.hp = 0; m.respawnAt = Infinity; m.dots = [];
    const p = this.game.players.get(m.challengeOwner), r = p && this.runFor(p);
    if (!r || r.id !== m.challengeRun || p.zone !== CHALLENGE_ZONE || !m.contributors.has(p.id)) return true;
    r.kills++; r.stageKills++;
    this.fx(r, { type: 'death', id: m.id, monster: m.type, x: m.x, y: m.y, boss: this.mobSpec(m).boss });
    if (r.mode === 'survival' && r.kills % 3 === 0) {
      const s = this.game.stats(p); p.hp = Math.min(s.maxHp, p.hp + Math.round(s.maxHp * .06)); this.game.mark(p);
    }
    if (r.mode === 'defense') r.charge++;
    if (r.mode === 'boss_rush' && m.challengeRole === 'interrupt' && !this.mobs(r).some(x => x.challengeRole === 'interrupt')) this.interruptBoss(r);
    const remaining = this.mobs(r);
    if ((r.mode === 'tower' || r.mode === 'defense') && !remaining.length) this.stageCleared(p, r);
    else if (r.mode === 'boss_rush' && m.id === r.bossId) this.stageCleared(p, r);
    return true;
  }
  stageCleared(p, r) {
    if (r.finished || r.phase !== 'fight') return;
    this.clearCasts(r);
    const w = this.world(); w.mobs = w.mobs.filter(m => m.challengeRun !== r.id);
    if (r.mode === 'tower') {
      const record = this.record(p, r); record.bestFloor = Math.max(record.bestFloor, r.stage);
      if (r.stage < 30 && r.stage % 5 === 0) {
        record.checkpoint = Math.max(record.checkpoint, r.stage);
        const key = `tower:${r.tier}:floor:${r.stage}`;
        if (!p.challenges.claims.includes(key)) {
          p.challenges.claims.push(key); p.challenges.tokens = Math.min(1000000, p.challenges.tokens + 2 * (r.tier + 1));
          this.tell(r, `${r.stage}층 저장 지점 개방 · 도전의 빛 +${2 * (r.tier + 1)}`, 'success');
        }
        const s = this.game.stats(p); p.hp = Math.min(s.maxHp, p.hp + s.maxHp * .25); p.mp = Math.min(s.maxMp, p.mp + s.maxMp * .3);
      }
      this.game.mark(p);
    }
    const last = r.mode === 'tower' ? 30 : r.mode === 'defense' ? 5 : 3;
    if (r.stage >= last) { this.finish(p, r, true, `${CHALLENGE_BY_ID[r.mode].name}의 모든 관문을 통과했습니다.`); return; }
    r.stage++; r.phase = 'rest'; r.nextAt = this.game.now + 2400;
    r.hint = '관문을 통과했습니다. 잠시 뒤 다음 공세가 시작합니다.';
  }
  interruptBoss(r) {
    if (!r.channelUntil) return;
    const boss = this.mobs(r).find(m => m.id === r.bossId); if (boss) { boss.challengeShield = false; boss.stunUntil = this.game.now + 3500; }
    r.channelUntil = 0; r.hint = '집중을 끊었습니다! 수호자가 3.5초 동안 빈틈을 보입니다.';
    this.tell(r, r.hint, 'success');
    const w = this.world(); w.casts = w.casts.filter(c => c.challengeRun !== r.id || c.effect !== 'interrupt');
  }
  tick(dt = .05) {
    const g = this.game, now = g.now;
    for (const r of [...this.runs.values()]) {
      const p = g.players.get(r.owner);
      if (!p) { this.cleanup(r); continue; }
      if (!p.active) { this.finish(p, r, false, '접속이 끊어져 도전이 종료되었습니다.'); continue; }
      if (p.zone !== CHALLENGE_ZONE || p.challengeRun !== r.id) { this.finish(p, r, false, '회랑을 떠나 도전이 종료되었습니다.', { teleport: false }); continue; }
      if (p.hp <= 0) { this.onDeath(p); continue; }
      if (now >= r.ends) {
        const won = r.mode === 'survival' && r.kills >= 18;
        this.finish(p, r, won, won ? '황혼을 버텨내고 적 18마리 이상을 처치했습니다.' : r.mode === 'survival' ? '살아남았지만 필요한 적 18마리를 처치하지 못했습니다.' : '제한 시간이 끝났습니다.'); continue;
      }
      if ((r.phase === 'preparing' || r.phase === 'rest') && now >= r.nextAt) this.beginStage(p, r);
      if (r.phase === 'preparing' || r.phase === 'rest') continue;
      if (r.mode === 'tower' && now >= r.stageEnds) { this.finish(p, r, false, `${r.stage}층의 제한 시간 90초가 끝났습니다.`); continue; }
      if (r.mode === 'runes') this.tickRunes(r);
      else if (r.mode === 'survival') this.tickSurvival(r);
      else if (r.mode === 'boss_rush') this.tickBossRush(p, r);
      else if (r.mode === 'tower' && r.stage >= 3 && now >= r.nextHazard) {
        r.nextHazard = now + Math.max(4400, 10500 - r.stage * 170); r.pulse++;
        if (r.pulse % 2) this.cast(r, { x: p.x, y: p.y, radius: 88 + r.stage, name: '탑의 낙인' }, 1600);
        else this.cast(r, { x: CENTER.x, y: CENTER.y, radius: 440, inner: 115, shape: 'ring', name: '탑의 파동' }, 2100);
      }
      if (r.finished) continue;
      for (const m of this.mobs(r)) {
        this.tickMob(p, r, m, dt);
        if (r.finished) break;
      }
      if (!r.finished) this.resolveCasts(p, r);
    }
  }
  tickRunes(r) {
    const now = this.game.now;
    if (r.phase === 'memorize' && now >= r.peekUntil) {
      r.phase = 'input';
      const count=r.stage===2?2:r.stage===3?3:0;
      r.runeGuards=[];
      for(let i=0;i<count;i++){
        const pos=RUNE_PADS[(i+r.stage)%RUNE_PADS.length];
        const guard=this.spawn(r,i%2?'skeleton':'wisp',pos.x+25,pos.y+30,{role:'rune_guard',factor:r.stage===3?1.8:1.15});
        r.runeGuards.push(guard.id);
      }
      r.hint=count?`봉인된 문양 · 기억의 파수꾼 ${count}명을 먼저 쓰러뜨리세요.${r.stage===3?' 이후 역순 입력!':''}`:'기억한 순서대로 발판을 찾아가 상호작용하세요.';
      if(count)this.tell(r,r.hint);
    }
    if (r.phase !== 'input' || now < r.nextHazard) return;
    r.nextHazard = now + (r.stage===3?2700:r.stage===2?3500:4200); r.pulse++;
    const horizontal = r.pulse % 2 === 1;
    this.cast(r, { x: horizontal ? 80 : CENTER.x, y: horizontal ? CENTER.y : 80,
      shape: 'beam', angle: horizontal ? 0 : Math.PI / 2, length: horizontal ? 992 : 736, width: 70, radius: 1000,
      damage: r.baseHp * .22 + r.level * .7, effect: 'runeTrap', name: '기억을 가르는 빛 · 피격 시 시간 −4초' }, 1550);
  }
  tickSurvival(r) {
    const now = this.game.now, elapsed = now - r.started - 3000;
    r.safeRadius = elapsed >= 120000 ? 235 : elapsed >= 60000 ? 325 : 420;
    if (now >= r.nextWave) {
      r.nextWave = now + 18000; r.stage++;
      const count = Math.min(3 + Math.floor(r.stage / 2), Math.max(0, 18 - this.mobs(r).length));
      this.spawnRing(r, count, { factor: .72 + r.stage * .035 });
      r.hint = `생존 공세 ${r.stage} · 처치 ${r.kills}/18 · 안전지대 반경 ${r.safeRadius}`;
    }
    if (now >= r.nextHazard) {
      r.nextHazard = now + 5000;
      this.cast(r, { ...CENTER, shape: 'ring', radius: 1500, inner: r.safeRadius, name: '밀려드는 황혼' }, 1900);
    }
  }
  tickBossRush(p, r) {
    const now = this.game.now, boss = this.mobs(r).find(m => m.id === r.bossId); if (!boss) return;
    if (r.stage === 1 && !r.secondSeal && boss.hp <= boss.maxHp * .5) { r.secondSeal = true; this.sealBoss(r, boss); }
    if (r.stage === 2 && now >= r.nextMechanic) {
      r.nextMechanic = now + 14000; r.pulse++;
      const safe = { ...REFUGES[r.pulse % REFUGES.length], radius: 83 };
      r.refuge = { ...safe, until: now + 4200 };
      r.hint = '달의 대파동! 초록 보호진 안으로 들어가세요.';
      this.cast(r, { ...CENTER, radius: 1500, safe: [safe], damage: r.baseHp * .48 + r.level * .8, name: '달의 대파동 · 보호진으로' }, 4200);
      this.tell(r, r.hint);
    }
    if (r.stage === 2 && r.refuge?.until < now) r.refuge = null;
    if (r.stage !== 3) return;
    if (r.channelUntil && now >= r.channelUntil) {
      boss.challengeShield = false; r.channelUntil = 0;
      for (const add of this.mobs(r).filter(m => m.challengeRole === 'interrupt')) { add.alive = false; add.respawnAt = Infinity; }
      r.hint = '차단에 실패했습니다. 다음 소환수를 먼저 쓰러뜨리세요.';
    }
    if (now >= r.nextMechanic && !r.channelUntil) {
      r.nextMechanic = now + 22000; r.channelUntil = now + 8000; boss.challengeShield = true;
      this.spawn(r, 'imp', CENTER.x - 155, CENTER.y + 70, { role: 'interrupt', factor: .7 });
      this.spawn(r, 'imp', CENTER.x + 155, CENTER.y + 70, { role: 'interrupt', factor: .7 });
      this.cast(r, { ...CENTER, radius: 1500, damage: r.baseHp * .65 + r.level, effect: 'interrupt', name: '별의 붕괴 · 방해꾼 둘을 처치해 차단' }, 8000);
      r.hint = '8초 안에 방해꾼 둘을 처치해 별의 붕괴를 차단하세요!'; this.tell(r, r.hint);
    }
  }
  tickMob(p, r, m, dt) {
    const g = this.game, now = g.now, spec = this.mobSpec(m); m.moving = false;
    for (const effect of m.dots || []) {
      if (effect.left <= 0 || effect.next > now) continue;
      effect.left--; effect.next = now + 1000;
      if (effect.by !== p.id || !this.canDamage(p, m)) continue;
      const damage = Math.min(m.hp, Math.max(0, finite(effect.damage)));
      m.hp -= damage; m.contributors.set(p.id, now); m.damageLog.set(p.id, (m.damageLog.get(p.id) || 0) + damage);
      this.fx(r, { type: 'hit', id: m.id, by: p.id, x: m.x, y: m.y - 22, amount: damage, kind: 'monster' });
      if (m.hp <= 0) { this.mobKilled(m); break; }
    }
    m.dots = (m.dots || []).filter(e => e.left > 0);
    if (!m.alive || r.finished || r.phase !== 'fight' || m.stunUntil > now || m.castUntil > now) return;
    const recentlyHit = now - (m.contributors.get(p.id) || 0) < 3000;
    const siege = r.mode === 'defense' && m.challengeRole === 'siege' && !(recentlyHit && dist(m, p) < 220);
    const target = siege ? CENTER : p, d = dist(m, target), dx = target.x - m.x, dy = target.y - m.y;
    m.target = siege ? null : p.id; m.dir = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'e' : 'w' : dy > 0 ? 's' : 'n';
    const range = siege ? 48 : spec.range;
    if (d <= range + 10 && now >= m.nextAttack) {
      if (siege) {
        m.nextAttack = now + 1300; m.castUntil = now + 450;
        if (r.wardUntil <= now) r.crystalHp = Math.max(0, r.crystalHp - Math.round((29 + r.stage * 5) * r.scale));
        this.fx(r, { type: 'hit', ...CENTER, amount: r.wardUntil > now ? 0 : Math.round((29 + r.stage * 5) * r.scale), kind: 'player' });
        if (r.crystalHp <= 0) this.finish(p, r, false, '새벽의 수정이 파괴되었습니다. 적을 끌어내고 수리의 빛을 사용해 보세요.');
      } else if (spec.boss) {
        m.nextAttack = now + 3400; m.castUntil = now + 1450; m.phase++;
        if (m.phase % 3 === 0) this.cast(r, { owner: m.id, x: m.x, y: m.y, shape: 'ring', radius: 270, inner: 94, damage: spec.atk * 1.1, name: '수호자의 파동' }, 1650);
        else if (m.phase % 3 === 1) this.cast(r, { owner: m.id, x: p.x, y: p.y, radius: 105, damage: spec.atk, name: '수호자의 낙인' }, 1450);
        else this.cast(r, { owner: m.id, x: m.x, y: m.y, shape: 'beam', angle: Math.atan2(dy, dx), length: 480, width: 82, radius: 480, damage: spec.atk * 1.05, name: '수호자의 검광' }, 1500);
      } else {
        m.nextAttack = now + 2000; m.castUntil = now + 600;
        this.cast(r, { owner: m.id, x: p.x, y: p.y, radius: spec.range > 90 ? 46 : 38, damage: spec.atk * .62, boss: false, name: MONSTERS[m.type].name }, 750);
      }
    } else if (d > range * .78 && d > 0) {
      const speed = spec.speed * (m.slowUntil > now ? .5 : 1), old = { x: m.x, y: m.y };
      moveEntity(this.world().map, m, dx / d * speed * Math.max(0, Math.min(.1, dt)), dy / d * speed * Math.max(0, Math.min(.1, dt)), 12);
      m.moving = dist(m, old) > .05;
    }
  }
  resolveCasts(p, r) {
    const g = this.game, now = g.now, w = this.world();
    const due = w.casts.filter(c => c.challengeRun === r.id && c.ends <= now);
    // Remove first: a lethal hit may finish the run and clean every cast.
    w.casts = w.casts.filter(c => c.challengeRun !== r.id || c.ends > now);
    for (const cast of due) {
      if (r.finished) break;
      if (cast.owner !== r.id && !w.mobs.some(m => m.id === cast.owner && m.alive)) continue;
      if (castHits(cast, p) && p.hp > 0 && p.invulnerableUntil <= now) {
        if (cast.effect === 'runeTrap') { r.ends -= 4000; r.hint = '함정에 맞아 남은 시간이 4초 줄었습니다. 다음 빛을 피하세요.'; }
        g.damagePlayer(p, cast.damage);
      }
      if (r.finished) break;
      this.fx(r, { type: 'impact', x: cast.x, y: cast.y, radius: cast.radius, shape: cast.shape, inner: cast.inner,
        angle: cast.angle, length: cast.length, width: cast.width, boss: cast.boss, theme: cast.theme });
    }
  }
  view(p) {
    const r = this.runFor(p); if (!r || p.zone !== CHALLENGE_ZONE) return null;
    const now = this.game.now, markers = [];
    if (r.mode === 'runes') RUNE_PADS.forEach((pad, index) => markers.push({ ...pad, id: `rune_${index}`, kind: 'rune', label: RUNE_NAMES[index], color: RUNE_COLORS[index], radius: 42,
      active: r.phase === 'memorize' && r.sequence?.[Math.floor((now - r.stageStarted) / 900) % r.sequence.length] === index }));
    if (r.mode === 'boss_rush' && r.stage === 1 && r.seals) SEALS.forEach((pad, index) => markers.push({ ...pad, id: `seal_${index}`, kind: 'seal', label: r.seals[index] ? '해제 완료' : `봉인 ${index + 1}`, color: r.seals[index] ? '#8ca5a2' : '#edc982', radius: 42, active: !r.seals[index] }));
    if (r.refuge && r.refuge.until >= now) markers.push({ ...r.refuge, id: 'refuge', kind: 'safe', label: '보호진', color: '#89e2b3' });
    if (r.mode === 'survival') markers.push({ ...CENTER, id: 'survival_safe', kind: 'boundary', label: '안전지대', color: '#8bdfbc', radius: r.safeRadius || 420 });
    if (r.mode === 'defense') markers.push({ ...CENTER, id: 'crystal', kind: 'crystal', label: '새벽의 수정', color: '#a6e5ed', radius: 45, hp: r.crystalHp, maxHp: 1000, shield: r.wardUntil > now });
    return {
      id: r.id, mode: r.mode, name: CHALLENGE_BY_ID[r.mode].name, tier: r.tier, tierName: CHALLENGE_TIERS[r.tier].name,
      phase: r.phase, stage: r.stage, total: r.mode === 'tower' ? 30 : r.mode === 'defense' ? 5 : r.mode === 'survival' ? 10 : 3,
      ends: r.mode === 'tower' && r.phase === 'fight' ? r.stageEnds : r.ends, runEnds: r.ends,
      nextAt: r.nextAt, remaining: Math.max(0, (r.mode === 'tower' && r.phase === 'fight' ? r.stageEnds : r.ends) - now),
      kills: r.kills, alive: this.mobs(r).length, hint: r.hint, markers,
      crystalHp: r.mode === 'defense' ? r.crystalHp : null, charge: r.charge, wardUntil: r.wardUntil, wardReady: r.wardReady,
      mistakes: r.mistakes, runeStep: r.runeStep, runeGoal: r.sequence?.length || 0, runeReverse:r.mode==='runes'&&r.stage===3, runeGuards:this.mobs(r).filter(m=>m.challengeRole==='rune_guard').length,
      sequence: r.mode === 'runes' && r.phase === 'memorize' ? r.sequence.map(n => RUNE_NAMES[n]) : null,
      peekUntil: r.peekUntil || 0, channelUntil: r.channelUntil || 0
    };
  }
}
