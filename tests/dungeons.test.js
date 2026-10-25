import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, newCharacter, hydrate, serialize } from '../server/game.js';
import { ZONES, MONSTERS, ITEMS, getStats, xpRequired } from '../shared/content.js';
import { createMap, isBlocked, findPath } from '../shared/world.js';
import { DUNGEONS, DUNGEON_BY_ID, DUNGEON_ZONE, prepareDungeons } from '../shared/dungeons.js';
import { dungeonsPanel, dungeonHUD, drawDungeonOverlay } from '../client/dungeons-ui.js';

function setup(id = 'concord_forge', count = 2, prefix = 'p', game = null) {
  const messages = [], g = game || new Game({ random: () => .5, send: (id, event, data) => messages.push({ id, event, data }) });
  if (!game) g.now = Date.parse('2026-10-24T03:11:00Z');
  const def = DUNGEON_BY_ID[id], gate = createMap(def.entryZone).dungeonEntrance;
  g.worlds.get(def.entryZone).mobs = [];
  const people = Array.from({ length: count }, (_, i) => {
    const p = g.addPlayer(newCharacter(prefix + i, prefix + i, i === 1 ? 'priest' : 'mage')); p.level = def.level;
    const stats = getStats(p); p.hp = stats.maxHp; p.mp = stats.maxMp;
    g.teleport(p, def.entryZone, gate.x + i * 20, gate.y); return p;
  });
  for (const p of people.slice(1)) {
    assert.equal(g.action(people[0], { type: 'partyInvite', id: p.id }).ok, true);
    assert.equal(g.action(p, { type: 'partyAccept' }).ok, true);
  }
  return { g, people, p: people[0], q: people[1], messages, def, gate };
}
function advance(g, ms) { g.tick(.05, g.now + ms); }
function enter(ctx) {
  const { g, p, people, def } = ctx;
  assert.equal(g.action(p, { type: 'dungeonLobby', id: def.id }).ok, true);
  const lobby = g.snapshot(p).dungeon;
  for (const member of people) assert.equal(g.action(member, { type: 'dungeonReady', lobbyId: lobby.lobbyId, ready: true }).ok, true);
  assert.equal(g.action(p, { type: 'dungeonStart', lobbyId: lobby.lobbyId }).ok, true);
  advance(g, 4001); return g.dungeons.runFor(p);
}
function at(p, point) { p.x = point.x; p.y = point.y; p.path = []; p.input = { x: 0, y: 0 }; }
function interact(g, p, marker) { at(p, marker); g.now += 450; return g.action(p, { type: 'dungeonInteract', id: marker.id }); }
function exposeForge(ctx, r) {
  const { g, people } = ctx;
  assert.equal(r.phase, 'balance');
  for (const p of people.filter(p => p.hp > 0)) at(p, r.balancePads[r.assignments[p.id].pad]);
  advance(g, 50); advance(g, 2001); assert.equal(r.phase, 'pillars');
  for (let i = 0; i < 2; i++) {
    const actor = people.find(p => p.hp > 0 && r.assignments[p.id].pad === i);
    const marker = g.snapshot(actor).dungeon.markers.find(m => m.id === `pillar_${i}`);
    while (r.phase === 'pillars' && r.pillars[i] !== r.pillarGoals[i]) assert.equal(interact(g, actor, marker).ok, true);
  }
  assert.equal(r.phase, 'vulnerable');
}
function exposeMemory(ctx, r) {
  const { g } = ctx;
  assert.equal(r.phase, 'memory_show'); const sequence = [...r.sequence];
  advance(g, r.phaseEnds - g.now + 1); assert.equal(r.phase, 'memory_input');
  for (const index of sequence) {
    const actor = g.players.get(g.dungeons.operator(r)), marker = g.snapshot(actor).dungeon.markers.find(m => m.id === `memory_${index}`);
    assert.equal(interact(g, actor, marker).ok, true);
  }
  assert.equal(r.phase, 'memory_laser');
  for (const id of r.actors) at(g.players.get(id), id === r.bait ? r.baitGoal : r.anchor);
  advance(g, 50); advance(g, r.lockAt - g.now - 1); advance(g, r.phaseEnds - g.now + 1);
  assert.equal(r.phase, 'vulnerable');
}
function exposeStars(ctx, r) {
  const { g } = ctx; assert.equal(r.phase, 'star_mark');
  for (const id of r.actors) at(g.players.get(id), id === r.bait ? r.starGoal : { x: 704, y: 544 });
  advance(g, 50); advance(g, r.lockAt - g.now - 1); advance(g, r.phaseEnds - g.now + 1);
  assert.equal(r.phase, 'conduits');
  for (const [i, conduit] of r.conduits.entries()) assert.equal(interact(g, g.players.get(conduit.owner), { ...conduit, id: `conduit_${i}` }).ok, true);
  advance(g, 1201); assert.equal(r.phase, 'vulnerable');
}
function expose(ctx, r) { ({ moon_quarry: exposeForge, concord_forge: exposeForge, memory_archive: exposeMemory, fallen_observatory: exposeStars })[r.dungeon](ctx, r); }
// Drive an authoritative damage result, keeping all mandatory HP gates intact.
// Other tests below exercise the actual Game.attack and DoT damage paths.
function hitGate(ctx, r) {
  const { g, p } = ctx, boss = g.dungeons.boss(r), amount = g.dungeons.damageAmount(boss, boss.maxHp * 2);
  assert.ok(amount > 0); boss.hp -= amount; boss.contributors.set(p.id, g.now); boss.damageLog.set(p.id, (boss.damageLog.get(p.id) || 0) + amount);
  if (boss.hp <= 0) g.killMob(ctx.def.zone, boss); else { advance(g, 50); if (r.phase === 'transformation') advance(g, r.phaseEnds - g.now + 1); }
}
function complete(ctx) { const r = ctx.g.dungeons.runFor(ctx.p); for (let i = 0; i < 3; i++) { assert.equal(r.stage, i); expose(ctx, r); hitGate(ctx, r); } assert.equal(r.state, 'complete'); return r; }
function leaveComplete(ctx) { for (const p of ctx.people) assert.equal(ctx.g.action(p, { type: 'dungeonExit' }).ok, true); }

test('three distinct dungeons register actual field entrances, private geometry, boss names and first-clear equipment', () => {
  assert.equal(DUNGEONS.length, 4); assert.deepEqual(DUNGEONS.map(d => d.level), [25, 35, 80, 140]);
  assert.ok(ZONES[DUNGEON_ZONE].dungeon);
  const map = createMap(DUNGEON_ZONE);
  for (const point of [{ x: 704, y: 904 }, { x: 474, y: 604 }, { x: 934, y: 604 }, { x: 704, y: 294 }, { x: 904, y: 544 }]) {
    assert.equal(isBlocked(map, point.x, point.y, 12), false); assert.ok(findPath(map, { x: 704, y: 904 }, point).length || point.y === 904);
  }
  for (const d of DUNGEONS) {
    const field = createMap(d.entryZone), gate = field.dungeonEntrance;
    assert.equal(gate.dungeon, d.id); assert.equal(isBlocked(field, gate.x, gate.y, 12), false);
    assert.equal(field.storyPoints.filter(p => p.id === gate.id).length, 1);
    assert.equal(MONSTERS[d.boss].name, d.bossName); assert.equal(MONSTERS[d.boss].sprite, d.skin); assert.ok(ITEMS[d.reward]);
  }
});

test('a real 2–4 player party needs leader request, each member consent and revalidated entry proximity', () => {
  const ctx = setup(), { g, p, q, def, gate } = ctx;
  assert.equal(g.action(q, { type: 'dungeonLobby', id: def.id }).ok, false);
  assert.equal(g.action(p, { type: 'dungeonLobby', id: def.id }).ok, true);
  const lobby = g.snapshot(q).dungeon; assert.equal(lobby.state, 'lobby'); assert.equal(lobby.selfId, q.id);
  assert.equal(g.action(p, { type: 'dungeonReady', lobbyId: 'stale', ready: true }).ok, false);
  assert.equal(g.action(p, { type: 'dungeonReady', lobbyId: lobby.lobbyId, ready: true }).ok, true);
  assert.equal(g.action(p, { type: 'dungeonStart', lobbyId: lobby.lobbyId }).ok, false); assert.equal(p.zone, def.entryZone);
  at(q, { x: 300, y: 300 }); assert.equal(g.action(q, { type: 'dungeonReady', lobbyId: lobby.lobbyId, ready: true }).ok, false);
  at(q, gate); assert.equal(g.action(q, { type: 'dungeonReady', lobbyId: lobby.lobbyId, ready: true }).ok, true);
  assert.equal(g.action(q, { type: 'dungeonStart', lobbyId: lobby.lobbyId }).ok, false);
  at(q, { x: 300, y: 300 }); assert.equal(g.action(p, { type: 'dungeonStart', lobbyId: lobby.lobbyId }).ok, false);
  at(q, gate); assert.equal(g.action(p, { type: 'dungeonStart', lobbyId: lobby.lobbyId }).ok, true);
  assert.equal(p.zone, DUNGEON_ZONE); assert.equal(q.zone, DUNGEON_ZONE); assert.equal(p.dungeonRun, q.dungeonRun);
});

test('ordinary interaction without an object id opens a nearby dungeon gate, including the touch/default-key path', () => {
  const { g, p, messages, gate, def } = setup(); at(p, gate);
  assert.equal(g.action(p, { type: 'interact' }).ok, true);
  assert.ok(messages.some(m => m.id === p.id && m.event === 'dungeonInfo' && m.data.id === def.id));
  messages.length = 0; assert.equal(g.interact(p).ok, true); assert.ok(messages.some(m => m.event === 'dungeonInfo'));
});

test('level, solo, stale readiness and changed party membership cannot bypass entry rules', () => {
  const ctx = setup(), { g, p, q, def } = ctx; q.level = 34;
  assert.equal(g.action(p, { type: 'dungeonLobby', id: def.id }).ok, false); q.level = 35;
  assert.equal(g.action(p, { type: 'dungeonLobby', id: def.id }).ok, true);
  const old = g.snapshot(p).dungeon.lobbyId; advance(g, 90001); assert.equal(g.snapshot(p).dungeon, null);
  assert.equal(g.action(q, { type: 'dungeonReady', lobbyId: old, ready: true }).ok, false);
  assert.equal(g.action(p, { type: 'dungeonLobby', id: def.id }).ok, true);
  g.action(q, { type: 'partyLeave' }); assert.equal(g.snapshot(p).dungeon, null);
  assert.equal(g.action(p, { type: 'dungeonLobby', id: def.id }).ok, false);
});

test('two parties in identical coordinates cannot see, target, damage, heal or receive effects from one another', () => {
  const first = setup(), { g, p, q, messages } = first; const a = enter(first);
  const second = setup('concord_forge', 2, 'other', g), b = enter(second);
  expose(first, a); expose(second, b);
  const own = g.dungeons.boss(a), foreign = g.dungeons.boss(b);
  for (const member of [...first.people, ...second.people]) at(member, { x: own.x + 30, y: own.y });
  const snap = g.snapshot(p);
  assert.deepEqual(snap.players.map(m => m.id), [q.id]); assert.equal(snap.zoneOnline, 2);
  assert.ok(snap.mobs.every(m => m.id === own.id)); assert.equal(g.sameInstance(p, second.p), false);
  assert.equal(g.action(p, { type: 'target', id: foreign.id }).ok, false);
  const hp = foreign.hp; p.target = own.id; assert.equal(g.action(p, { type: 'attack', skill: 'skill1' }).ok, true);
  assert.equal(foreign.hp, hp); assert.ok(own.hp < own.maxHp);
  p.hp -= 200; second.p.hp -= 200; const outsideHP = second.p.hp;
  q.cooldowns.skill2 = 0; assert.equal(g.action(q, { type: 'attack', skill: 'skill2' }).ok, true);
  assert.ok(p.hp > getStats(p).maxHp - 200); assert.equal(second.p.hp, outsideHP);
  messages.length = 0; g.fx(DUNGEON_ZONE, { type: 'buff', id: p.id, x: p.x, y: p.y });
  assert.deepEqual(new Set(messages.filter(m => m.event === 'fx').map(m => m.id)), new Set(first.people.map(p => p.id)));
  g.dungeons.cast(a, { x: p.x, y: p.y, name: 'party-private' });
  assert.ok(g.snapshot(q).casts.some(c => c.name === 'party-private')); assert.ok(!g.snapshot(second.p).casts.some(c => c.name === 'party-private'));
});

test('forge requires both role groups simultaneously and different authorized players for the pillars', () => {
  const ctx = setup(), { g, p, q } = ctx, r = enter(ctx), boss = g.dungeons.boss(r);
  at(p, r.balancePads[r.assignments[p.id].pad]); advance(g, 2200); assert.equal(r.phase, 'balance');
  at(q, r.balancePads[r.assignments[q.id].pad]); advance(g, 50); advance(g, 2001); assert.equal(r.phase, 'pillars');
  const wrong = g.snapshot(p).dungeon.markers.find(m => m.id === `pillar_${1 - r.assignments[p.id].pad}`);
  assert.equal(interact(g, p, wrong).ok, false); assert.equal(boss.dungeonShield, true);
  for (const member of [p, q]) {
    const index = r.assignments[member.id].pad, marker = g.snapshot(member).dungeon.markers.find(m => m.id === `pillar_${index}`);
    while (r.phase === 'pillars' && r.pillars[index] !== r.pillarGoals[index]) assert.equal(interact(g, member, marker).ok, true);
  }
  assert.equal(r.phase, 'vulnerable'); assert.equal(boss.dungeonShield, false);
});

test('direct attacks and damage-over-time stop exactly at required 70%/35% mechanics', () => {
  const ctx = setup(), { g, p } = ctx, r = enter(ctx), boss = g.dungeons.boss(r);
  at(p, { x: boss.x + 30, y: boss.y }); p.target = boss.id; const mp = p.mp;
  assert.equal(g.action(p, { type: 'attack', skill: 'skill1' }).ok, false); assert.equal(p.mp, mp);
  expose(ctx, r); at(p, { x: boss.x + 30, y: boss.y }); boss.hp = Math.floor(boss.maxHp * .7) + 3;
  assert.equal(g.action(p, { type: 'attack', skill: 'basic' }).ok, true); assert.equal(boss.hp, Math.floor(boss.maxHp * .7)); assert.equal(boss.alive, true);
  advance(g, 50); assert.equal(r.stage, 1); assert.equal(r.phase, 'transformation'); assert.equal(boss.dungeonShield, true);
  advance(g, 2201); assert.equal(r.phase, 'balance');
  expose(ctx, r); boss.hp = Math.floor(boss.maxHp * .35) + 4; boss.dots = [{ by: p.id, damage: boss.maxHp * 4, next: g.now, left: 1 }];
  advance(g, 50); assert.equal(boss.hp, Math.floor(boss.maxHp * .35)); advance(g, 50); assert.equal(r.stage, 2); assert.equal(r.phase, 'transformation');
  advance(g, 2201); assert.equal(r.phase, 'balance');
  assert.equal(p.challenges.tokens, 0); assert.equal(p.dungeons.tokens, 0);
});

test('memory preview hides its sequence, alternates operators, and only aligned prism plus anchored allies opens the boss', () => {
  const ctx = setup('memory_archive'), { g, p, q } = ctx, r = enter(ctx);
  assert.equal(g.snapshot(p).dungeon.sequence.length, 3); const sequence = [...r.sequence];
  advance(g, r.phaseEnds - g.now + 1); assert.equal(g.snapshot(p).dungeon.sequence, null);
  const firstOperator = g.dungeons.operator(r), wrong = firstOperator === p.id ? q : p;
  const pad = g.snapshot(wrong).dungeon.markers.find(m => m.id === `memory_${sequence[0]}`);
  assert.equal(interact(g, wrong, pad).ok, false); assert.equal(r.step, 0);
  for (const index of sequence) { const actor = g.players.get(g.dungeons.operator(r)); assert.equal(interact(g, actor, g.snapshot(actor).dungeon.markers.find(m => m.id === `memory_${index}`)).ok, true); }
  assert.equal(r.phase, 'memory_laser');
  at(g.players.get(r.bait), r.baitGoal);
  advance(g, 50); advance(g, r.lockAt - g.now - 1); advance(g, r.phaseEnds - g.now + 1);
  assert.equal(r.strikes, 1); assert.match(r.lastFailure, /고정진/); assert.equal(g.dungeons.boss(r).dungeonShield, true);
});

test('three wrong memory sequences cause an explained wipe instead of client-awarded completion', () => {
  const ctx = setup('memory_archive'), { g, p } = ctx, r = enter(ctx);
  for (let fail = 0; fail < 3; fail++) {
    if (r.phase === 'recover') advance(g, r.phaseEnds - g.now + 1);
    advance(g, r.phaseEnds - g.now + 1);
    const actor = g.players.get(g.dungeons.operator(r)), index = (r.sequence[r.step] + 1) % 4;
    assert.equal(interact(g, actor, g.snapshot(actor).dungeon.markers.find(m => m.id === `memory_${index}`)).ok, true);
  }
  assert.equal(r.state, 'wipe'); assert.match(r.lastFailure, /3회/); assert.equal(p.dungeons.tokens, 0);
  assert.equal(g.action(p, { type: 'dungeonComplete', runId: r.id, won: true }).ok, false);
});

test('meteor requires marked player separation, and conduits reject one player controlling both roles', () => {
  const ctx = setup('fallen_observatory'), { g, p, q } = ctx, r = enter(ctx);
  for (const member of [p, q]) at(member, { x: 704, y: 544 });
  advance(g, 50); advance(g, r.lockAt - g.now - 1); advance(g, r.phaseEnds - g.now + 1);
  assert.equal(r.strikes, 1); assert.match(r.lastFailure, /봉인 문양/);
  advance(g, r.phaseEnds - g.now + 1);
  for (const id of r.actors) at(g.players.get(id), id === r.bait ? r.starGoal : { x: 704, y: 544 });
  advance(g, 50); advance(g, r.lockAt - g.now - 1); advance(g, r.phaseEnds - g.now + 1); assert.equal(r.phase, 'conduits');
  const a = r.conduits[0], b = r.conduits[1], actor = g.players.get(a.owner);
  assert.equal(interact(g, actor, { ...b, id: 'conduit_1' }).ok, false);
  assert.equal(interact(g, actor, { ...a, id: 'conduit_0' }).ok, true);
  assert.equal(interact(g, g.players.get(b.owner), { ...b, id: 'conduit_1' }).ok, true);
  advance(g, 1201); assert.equal(r.phase, 'vulnerable');
});

for (const def of DUNGEONS) test(`${def.id}: a two-player party can solve all three mandatory stages and receive one per-player clear`, () => {
  const ctx = setup(def.id), { g, p, q } = ctx; enter(ctx); const r = complete(ctx);
  assert.equal(p.dungeons.records[def.id].clears, 1); assert.equal(q.dungeons.records[def.id].clears, 1);
  for (const member of [p, q]) { assert.equal(member.dungeons.tokens, 8); assert.equal(member.inventory[def.reward], 1); assert.equal(member.dungeons.lastResult.xp, Math.round(xpRequired(def.level) * .2)); }
  assert.equal(g.worlds.get(DUNGEON_ZONE).mobs.filter(m => m.dungeonRun === r.id).length, 0);
  g.dungeons.reward(r); assert.equal(p.dungeons.tokens, 8);
  leaveComplete(ctx); assert.equal(p.zone, def.entryZone); assert.equal(q.zone, def.entryZone); assert.equal(g.dungeons.runs.size, 0);
});

test('a four-player party scales boss health and requires all assigned players in its shared plate phase', () => {
  const duo = setup(), duoRun = enter(duo), duoHP = duo.g.dungeons.boss(duoRun).maxHp;
  const ctx = setup('concord_forge', 4), { g, people } = ctx, r = enter(ctx);
  assert.ok(g.dungeons.boss(r).maxHp > duoHP);
  for (const p of people.slice(0, 3)) at(p, r.balancePads[r.assignments[p.id].pad]);
  advance(g, 2100); assert.equal(r.phase, 'balance');
  at(people[3], r.balancePads[r.assignments[people[3].id].pad]); advance(g, 50); advance(g, 2001); assert.equal(r.phase, 'pillars');
});

test('downed players have no automatic town respawn or death penalty and can be rescued through a real timed interaction', () => {
  const ctx = setup(), { g, p, q } = ctx, r = enter(ctx), gold = p.gold, xp = p.xp, deaths = p.deaths;
  p.invulnerableUntil = 0; g.damagePlayer(p, 9999999);
  assert.equal(p.hp, 0); assert.equal(p.respawnAt, 0); assert.equal(p.zone, DUNGEON_ZONE); assert.equal(r.phase, 'rescue');
  assert.equal(p.gold, gold); assert.equal(p.xp, xp); assert.equal(p.deaths, deaths);
  assert.equal(g.action(p, { type: 'respawn' }).ok, false);
  assert.equal(interact(g, q, { x: p.x, y: p.y, id: `revive_${p.id}` }).ok, true);
  advance(g, 3001); assert.ok(p.hp > 0); assert.equal(r.revives, 1); assert.equal(r.phase, 'balance');
});

test('full wipe waits in the instance, needs every retry vote, preserves consumed supplies and blocks stale retry packets', () => {
  const ctx = setup(), { g, p, q } = ctx, r = enter(ctx); p.inventory.potion--;
  for (const member of [p, q]) { member.invulnerableUntil = 0; g.damagePlayer(member, 9999999); }
  assert.equal(r.state, 'wipe'); advance(g, 5000); assert.equal(p.zone, DUNGEON_ZONE); assert.equal(p.hp, 0);
  assert.equal(g.snapshot(p).dungeon.inputBlocked, true);
  assert.equal(g.action(p, { type: 'dungeonRetry', runId: 'old_run', ready: true }).ok, false);
  assert.equal(g.action(p, { type: 'dungeonRetry', runId: r.id, ready: true }).ok, true); assert.equal(r.state, 'wipe');
  assert.equal(g.action(q, { type: 'dungeonRetry', runId: r.id, ready: true }).ok, true);
  assert.equal(r.state, 'active'); assert.equal(r.attempt, 2); assert.ok(p.hp > 0 && q.hp > 0); assert.equal(p.inventory.potion, 7);
  assert.equal(p.dungeons.records[r.dungeon].attempts, 2); assert.equal(p.dungeons.records[r.dungeon].wipes, 1);
});

test('a reconnect freezes boss/mechanic clocks for 30 seconds and resumes the exact party run', () => {
  const ctx = setup(), { g, p, q } = ctx, r = enter(ctx), deadline = r.phaseEnds, end = r.ends;
  q.active = false; advance(g, 50); assert.equal(r.state, 'grace'); const pause = g.now;
  const oldX = p.x; g.setInput(p, { x: 1, y: 0, seq: 99 }); advance(g, 15000); assert.equal(p.x, oldX); assert.equal(r.phaseEnds, deadline);
  assert.equal(g.action(p, { type: 'attack', skill: 'skill1' }).ok, false);
  q.active = true; advance(g, 50);
  assert.equal(r.state, 'active'); assert.equal(p.dungeonRun, q.dungeonRun); assert.equal(r.phaseEnds, deadline + g.now - pause); assert.equal(r.ends, end + g.now - pause);
});

test('a disconnect immediately blocks combat before the next tick, and reconnect after the deadline cannot revive an expired run', () => {
  const ctx = setup(), { g, p, q } = ctx, r = enter(ctx); expose(ctx, r);
  const boss = g.dungeons.boss(r); at(p, { x: boss.x + 30, y: boss.y }); p.target = boss.id;
  q.active = false; const hp = boss.hp;
  assert.equal(g.action(p, { type: 'attack', skill: 'basic' }).ok, false); assert.equal(boss.hp, hp);
  advance(g, 50); assert.equal(r.state, 'grace');
  q.active = true; advance(g, 30001);
  assert.equal(g.dungeons.runFor(p), null); assert.equal(p.dungeons.tokens, 0); assert.notEqual(p.zone, DUNGEON_ZONE);
});

test('expired reconnect grace, party departure and outside teleport safely end the whole locked roster without reward', () => {
  for (const reason of ['disconnect', 'leave', 'teleport']) {
    const ctx = setup(), { g, p, q, def } = ctx; p.hp = 140; p.mp = 55; q.hp = 180; q.mp = 65; const r = enter(ctx);
    if (reason === 'disconnect') { q.active = false; advance(g, 50); advance(g, 30001); }
    if (reason === 'leave') g.action(q, { type: 'partyLeave' });
    if (reason === 'teleport') g.teleport(q, 'town', 784, 688);
    assert.equal(g.dungeons.runFor(p), null); assert.equal(p.zone, def.entryZone); assert.notEqual(q.zone, DUNGEON_ZONE);
    assert.equal(p.hp, 140); assert.equal(p.mp, 55); assert.equal(q.hp, 180); assert.equal(q.mp, 65); assert.equal(p.dungeons.tokens, 0);
    assert.equal(g.worlds.get(DUNGEON_ZONE).mobs.some(m => m.dungeonRun === r.id), false);
  }
});

test('late invitations cannot join a running party and foreign players cannot manipulate mechanisms', () => {
  const ctx = setup(), { g, p, q } = ctx;
  const outsider = g.addPlayer(newCharacter('outsider', 'outsider', 'mage')); outsider.level = 200;
  assert.equal(g.action(p, { type: 'partyInvite', id: outsider.id }).ok, true); const r = enter(ctx);
  assert.equal(g.action(outsider, { type: 'partyAccept' }).ok, false);
  assert.equal(g.action(p, { type: 'partyInvite', id: outsider.id }).ok, false);
  assert.equal(g.action(outsider, { type: 'dungeonInteract', id: 'pillar_0', runId: r.id }).ok, false);
  assert.equal(g.action(p, { type: 'challengeStart', id: 'tower' }).ok, false);
  assert.equal(g.action(q, { type: 'travel', id: 'town' }).ok, false);
});

test('first/day reward records survive saves, same-day repeats give no economy, and exchange cannot overdraw or overflow inventory', () => {
  const ctx = setup(), { g, p, q, def } = ctx; enter(ctx); complete(ctx); leaveComplete(ctx);
  const xp = p.xp, gold = p.gold; advance(g, 6000); enter(ctx); complete(ctx); leaveComplete(ctx);
  assert.equal(p.dungeons.tokens, 8); assert.equal(p.xp, xp); assert.equal(p.gold, gold); assert.equal(p.dungeons.records[def.id].clears, 2);
  advance(g, 24 * 3600000); enter(ctx); complete(ctx); leaveComplete(ctx);
  assert.equal(p.dungeons.tokens, 11); assert.equal(p.xp, xp); assert.equal(p.dungeons.lastResult.xp, 0);
  const loaded = hydrate(serialize(p)); assert.deepEqual(loaded.dungeons.records, p.dungeons.records); assert.deepEqual(loaded.dungeons.claims, [def.id]);
  assert.equal(g.action(p, { type: 'dungeonExchange', id: 'supplies' }).ok, true); assert.equal(p.dungeons.tokens, 8);
  p.inventory.potion = 9999; assert.equal(g.action(p, { type: 'dungeonExchange', id: 'supplies' }).ok, false); assert.equal(p.dungeons.tokens, 8);
  q.dungeons.tokens = 0; assert.equal(g.action(q, { type: 'dungeonExchange', id: 'supplies' }).ok, false);
});

test('server restart hydration restores entry location and pre-dungeon HP/MP; old saves have clean defaults', () => {
  const ctx = setup(), { p, q, def } = ctx; p.hp = 131; p.mp = 43; enter(ctx);
  const loaded = hydrate(serialize(p)); assert.equal(loaded.zone, def.entryZone); assert.equal(loaded.hp, 131); assert.equal(loaded.mp, 43); assert.equal(loaded.dungeonRun, null); assert.equal(loaded.dungeons.returnPoint, null);
  const old = serialize(q); delete old.dungeons; old.zone = 'town'; const migrated = hydrate(old); assert.equal(migrated.dungeons.tokens, 0); assert.deepEqual(migrated.dungeons.records, {});
  const corrupt = { dungeons: { tokens: -1, claims: ['fake', 'concord_forge'], daily: { concord_forge: 'not a date' } } }; prepareDungeons(corrupt); assert.equal(corrupt.dungeons.tokens, 0); assert.deepEqual(corrupt.dungeons.claims, ['concord_forge']);
});

test('UI contains consent/retry controls, current key bindings and escaped party-provided text', () => {
  const ctx = setup(), { g, p, q, def } = ctx; q.name = '<img src=x onerror=alert(1)>';
  g.action(p, { type: 'dungeonLobby', id: def.id });
  const lobby = dungeonHUD(g.snapshot(p).dungeon, g.now);
  assert.ok(lobby.includes('data-act="dungeonReady"')); assert.ok(lobby.includes('data-lobby-id=')); assert.ok(lobby.includes('&lt;img')); assert.ok(!lobby.includes('<img'));
  g.action(p, { type: 'dungeonCancel' }); const r = enter(ctx);
  const hud = dungeonHUD(g.snapshot(p).dungeon, g.now, { keyLabel: () => 'Enter' }); assert.ok(hud.includes('Enter'));
  const panel = dungeonsPanel({ profile: p, state: g.snapshot(p), now: g.now }); for (const d of DUNGEONS) assert.ok(panel.html.includes(d.name));
  g.dungeons.wipe(r, '역할을 확인하고 다시 시도하세요.'); const wiped = dungeonHUD(g.snapshot(p).dungeon, g.now);
  assert.ok(wiped.includes('data-act="dungeonRetry"')); assert.ok(wiped.includes('data-run-id='));
  assert.doesNotThrow(() => drawDungeonOverlay({}, null, 0));
});
