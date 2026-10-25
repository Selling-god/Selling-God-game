import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, newCharacter, hydrate, serialize } from '../server/game.js';
import { ZONES, getStats } from '../shared/content.js';
import { createMap, findPath, moveEntity, isBlocked, dist, lineOfSight } from '../shared/world.js';
import { DUNGEONS, DUNGEON_ZONE, DUNGEON_ZONE_IDS } from '../shared/dungeons.js';
import { dungeonHUD } from '../client/dungeons-ui.js';

const C = { x: 704, y: 544 }, ENTRY = { x: 704, y: 904 };
const cardinal = [{ x: 704, y: 294 }, { x: 954, y: 544 }, { x: 704, y: 794 }, { x: 454, y: 544 }];
function setup(index = 1, game = null, prefix = `d${index}_`) {
  const g = game || new Game({ random: () => .5 }); if (!game) g.now = Date.parse('2026-10-24T03:11:00Z');
  const def = DUNGEONS[index], gate = createMap(def.entryZone).dungeonEntrance; g.worlds.get(def.entryZone).mobs = [];
  const people = [0, 1].map(i => { const p = g.addPlayer(newCharacter(`${prefix}${i}`, `Pilot${i}`, i ? 'mage' : 'guardian')); p.level = def.level; const s = getStats(p); p.hp = s.maxHp; p.mp = s.maxMp; g.teleport(p, def.entryZone, gate.x + i * 20, gate.y); return p; });
  g.action(people[0], { type: 'partyInvite', id: people[1].id }); g.action(people[1], { type: 'partyAccept' });
  const lobby = g.action(people[0], { type: 'dungeonLobby', id: def.id }); assert.equal(lobby.ok, true);
  for (const p of people) assert.equal(g.action(p, { type: 'dungeonReady', lobbyId: lobby.lobbyId, ready: true }).ok, true);
  assert.equal(g.action(people[0], { type: 'dungeonStart', lobbyId: lobby.lobbyId }).ok, true);
  g.tick(.05, g.now + 4001); const r = g.dungeons.runFor(people[0]);
  return { g, r, def, people, p: people[0], q: people[1], boss: g.dungeons.boss(r) };
}
function advance(g, ms) { g.tick(.05, g.now + ms); }

// Walk every waypoint with the same swept-collision primitive the server uses.
// A path existing on a point grid is insufficient: the entire character fits.
function walkRoute(map, from, goal) {
  const path = findPath(map, from, goal), p = { ...from }; assert.ok(path.length, `${map.id}: no route to ${JSON.stringify(goal)}`);
  for (const point of [...path, goal]) {
    let steps = 0;
    while (dist(p, point) > .1 && steps++ < 100) {
      const d = dist(p, point), amount = Math.min(6, d), old = { ...p };
      moveEntity(map, p, (point.x - p.x) / d * amount, (point.y - p.y) / d * amount, 12);
      assert.equal(isBlocked(map, p.x, p.y, 12), false);
      assert.ok(dist(p, old) > .01, `${map.id}: route stuck near ${JSON.stringify(p)}`);
    }
    assert.ok(dist(p, point) <= .1);
  }
  return p;
}

test('dungeons have separate authoritative maps, raised terrain and all mechanism routes fit a real character', () => {
  assert.equal(DUNGEONS.find(d=>d.id==='concord_forge').zone, DUNGEON_ZONE); assert.equal(new Set(DUNGEONS.map(d => d.zone)).size, 4);
  const signatures = new Set();
  for (const [i, d] of DUNGEONS.entries()) {
    const map = createMap(d.zone); assert.equal(ZONES[d.zone].dungeonId, d.id); assert.equal(map.dungeonId, d.id);
    assert.ok(map.terrain.surface instanceof Uint8Array); assert.ok(map.terrain.elevation instanceof Uint8Array);
    signatures.add(Buffer.from(map.blocked).toString('base64'));
    const floorCount = map.blocked.reduce((n, blocked) => n + !blocked, 0); assert.ok(floorCount > 300 && floorCount < 600);
    assert.ok(new Set(map.terrain.elevation).size >= 3); assert.ok(map.terrain.features.length >= 9);
    for (let n = 0; n < map.blocked.length; n++) assert.equal(!!map.blocked[n], [2, 3, 6, 7].includes(map.terrain.surface[n]));
    let goals = [C, { x: 704, y: 444 }, ...cardinal];
    if (d.id === 'concord_forge') goals.push({ x: 474, y: 604 }, { x: 934, y: 604 }, { x: 504, y: 404 }, { x: 904, y: 404 }, { x: 704, y: 324 }, { x: 704, y: 764 });
    if (d.id === 'memory_archive') for (const side of [-1, 1]) {
      const prism = { x: C.x + side * 200, y: C.y }, angle = Math.atan2(280, side * 200), goal = { x: prism.x + Math.cos(angle) * 125, y: prism.y + Math.sin(angle) * 125 };
      goals.push(prism, goal, { x: C.x - side * 200, y: C.y + 160 }); assert.equal(lineOfSight(map, { x: 704, y: 264 }, goal), true, 'prism light channel remains unobstructed');
    }
    if (d.id === 'fallen_observatory') goals.push({ x: 514, y: 484 }, { x: 894, y: 484 }, { x: 1089, y: 544 }, { x: 704, y: 929 }, { x: 319, y: 544 });
    for (const goal of goals) { assert.equal(isBlocked(map, goal.x, goal.y, 12), false); walkRoute(map, ENTRY, goal); }
  }
  assert.equal(signatures.size, 4);
});

test('archive bookshelves and observatory void force useful detours instead of a reskinned open rectangle', () => {
  const archive = createMap('party_archive'), from = { x: 704, y: 624 }, to = { x: 544, y: 624 };
  assert.equal(lineOfSight(archive, from, to), false); const route = findPath(archive, from, to);
  assert.ok(route.some(p => Math.abs(p.y - from.y) > 60)); walkRoute(archive, from, to);
  const space = createMap('party_observatory'); assert.equal(isBlocked(space, 1008, 816, 10), true);
  assert.equal(space.terrain.surface[25 * space.w + 31], 7);
  assert.ok(findPath(space, { x: 400, y: 624 }, { x: 688, y: 816 }).some(p => p.y >= 768));
});

test('all private zone ids isolate parties, reject public travel and recover saved positions after restart', () => {
  const first = setup(1), second = setup(2, first.g), third = setup(3, first.g);
  for (const ctx of [first, second, third]) {
    assert.equal(ctx.p.zone, ctx.def.zone); assert.equal(ctx.g.dungeons.world(ctx.r).id, ctx.def.zone);
    assert.deepEqual(ctx.g.snapshot(ctx.p).mobs.map(m => m.id), [ctx.boss.id]);
    const saved = hydrate(serialize(ctx.p)); assert.equal(saved.zone, ctx.def.entryZone); assert.equal(saved.dungeonRun, null);
    for (const zone of DUNGEON_ZONE_IDS) assert.equal(ctx.g.action(ctx.p, { type: 'travel', id: zone }).ok, false);
  }
  const stranger = first.g.addPlayer(newCharacter('stranger', 'Stranger', 'mage'));
  for (const zone of DUNGEON_ZONE_IDS) assert.equal(first.g.action(stranger, { type: 'travel', id: zone }).ok, false);
  assert.equal(first.g.dungeons.sameInstance(first.p, second.p), false);
});

test('each boss opens normal combat with a distinct motion, attack name and actionable HUD hint', () => {
  const keys = [], poses = [];
  for (const i of [1, 2, 3]) {
    const { g, r, p, boss } = setup(i); g.dungeons.expose(r); p.x = 784; p.y = 544;
    const origin = { x: boss.x, y: boss.y }; g.dungeons.beginBossAction(r, boss, p);
    const a = r.bossAction; keys.push(a.key); poses.push(boss.encounterPose.kind);
    const hud = dungeonHUD(g.dungeons.view(p), g.now); assert.ok(hud.includes(a.name)); assert.ok(hud.includes(a.hint));
    if (i === 1) { g.now = a.windupEnd + 400; g.dungeons.tickBoss(r, boss, p, g.dungeons.players(r, true), .1); assert.ok(dist(origin, boss) > 30); assert.ok(boss.encounterPose.height > 60); }
    if (i === 2) { assert.ok(dist(origin, boss) > 50); const cast = g.dungeons.world(r).casts.find(c => c.name.includes('금서의 광선')); const angle = cast.angle; p.x -= 100; g.now += 500; g.dungeons.tickBoss(r, boss, p, g.dungeons.players(r, true), .1); assert.equal(cast.angle, angle); assert.ok(cast.cover); }
    if (i === 3) { const before = dist(p, a.point); g.now = a.windupEnd + 50; g.dungeons.tickBoss(r, boss, p, g.dungeons.players(r, true), .1); assert.ok(dist(p, a.point) < before - 4); }
  }
  assert.deepEqual(keys, ['forge_leap', 'archive_ray', 'observatory_pull']); assert.equal(new Set(poses).size, 3);
});

test('normal combat in every phase contains more than one signature and a readable recovery opening', () => {
  for (const index of [1, 2, 3]) {
    const { g, r, p, boss } = setup(index); g.dungeons.expose(r);
    for (let stage = 0; stage < 3; stage++) {
      r.stage = stage; r.attackCount = 0; const seen = new Set();
      for (let turn = 0; turn < 4; turn++) {
        g.dungeons.clearCasts(r); g.dungeons.beginBossAction(r, boss, p); const a = r.bossAction; seen.add(a.key);
        assert.ok(a.windupEnd - a.starts >= 700); assert.ok(a.ends - a.strikeEnd >= 1600);
        g.now = a.strikeEnd + 20; g.dungeons.tickBoss(r, boss, p, g.dungeons.players(r, true), .1); assert.equal(boss.encounterPose.stage, 'recover');
        assert.ok(g.dungeons.view(p).action.hint.length > 20);
        g.now = a.ends + 1;
      }
      assert.ok(seen.size >= 3);
    }
  }
});

test('shelves clip a beam telegraph and shield the player behind it while its exposed segment still damages', () => {
  const { g, r, p, q } = setup(2); g.dungeons.expose(r);
  p.x = 576; p.y = 624; q.x = 688; q.y = 624; p.invulnerableUntil = q.invulnerableUntil = 0;
  const protectedHp = p.hp, exposedHp = q.hp;
  const cast = g.dungeons.cast(r, { x: 704, y: 624, shape: 'beam', angle: Math.PI, length: 700, width: 60, radius: 700, cover: true, damageRate: .2 }, 100);
  assert.ok(cast.length > 16 && cast.length < 50); g.now += 101; g.dungeons.resolveCasts(r);
  assert.equal(p.hp, protectedHp); assert.ok(q.hp < exposedHp);
});

test('heat stays dangerous for its advertised pulses and is removed before any cooperative mechanic', () => {
  const { g, r } = setup(); g.dungeons.expose(r);
  const cast = g.dungeons.cast(r, { x: 474, y: 604, radius: 50, pulses: 3, terrainHazard: true, name: 'persistent test' }, 100);
  g.now += 101; g.dungeons.resolveCasts(r); const active = g.dungeons.world(r).casts.find(c => c.name === cast.name);
  assert.equal(active.active, true); assert.equal(active.pulses, 2);
  g.dungeons.beginMechanic(r); assert.equal(g.dungeons.world(r).casts.some(c => c.name === cast.name), false); assert.equal(r.bossAction, null);
});

test('phase 2 and 3 transformations clear attacks, protect the party, expose unique forms, then resume mechanics', () => {
  for (const index of [1, 2, 3]) {
    const { g, r, p, boss, def } = setup(index);
    for (const stage of [1, 2]) {
      g.dungeons.expose(r); boss.hp = Math.floor(boss.maxHp * (stage === 1 ? .7 : .35));
      g.dungeons.cast(r, { x: p.x, y: p.y, radius: 250, damageRate: 1 }, 1);
      g.dungeons.tickMechanic(r); assert.equal(r.stage, stage); assert.equal(r.phase, 'transformation');
      assert.equal(g.dungeons.world(r).casts.length, 0); assert.equal(g.dungeons.blocksInput(p), true); assert.equal(boss.dungeonShield, true);
      const view = g.dungeons.view(p), hp = p.hp; assert.equal(view.phaseTransition.form, def.phases[stage].form); assert.equal(view.phaseTransition.phase, stage + 1);
      assert.equal(view.phaseTransition.ends - view.phaseTransition.starts, 2200); assert.ok(p.invulnerableUntil >= view.phaseTransition.ends);
      g.dungeons.damageFraction(p, .9); assert.equal(p.hp, hp); assert.equal(g.action(p, { type: 'attack', skill: 'basic' }).ok, false);
      advance(g, 2201); assert.notEqual(r.phase, 'transformation'); assert.equal(g.dungeons.view(p).phaseTransition, null); assert.equal(boss.encounterPhase, stage + 1);
    }
  }
});

test('disconnect grace shifts a boss action, pose and persistent warning without advancing the sequence', () => {
  const { g, r, p, q, boss } = setup(); g.dungeons.expose(r); r.attackCount = 1; g.dungeons.beginBossAction(r, boss, p);
  const before = { action: r.bossAction.ends, pose: boss.encounterPose.ends, key: r.bossAction.key, phase: r.phaseEnds };
  q.active = false; advance(g, 50); assert.equal(r.state, 'grace'); const paused = g.now;
  advance(g, 12000); q.active = true; advance(g, 50); assert.equal(r.state, 'active');
  const shift = g.now - paused; assert.equal(r.bossAction.ends, before.action + shift); assert.equal(boss.encounterPose.ends, before.pose + shift); assert.equal(r.phaseEnds, before.phase + shift); assert.equal(r.bossAction.key, before.key);
});

test('dungeon reinforcements have different combat geometry and bodies, and stay in their own run', () => {
  const types = [], signatures = [];
  for (const index of [1, 2, 3]) {
    const { g, r, p } = setup(index); g.dungeons.spawnAdds(r, 1); const add = g.dungeons.mobs(r).find(m => m.dungeonRole === 'add');
    assert.ok(add); types.push(add.type); p.x = C.x + 60; p.y = C.y + 120; add.x = C.x; add.y = C.y + 80; add.nextAttack = 0;
    g.dungeons.clearCasts(r); g.dungeons.tickAdd(r, add, p, .1);
    const casts = g.dungeons.world(r).casts.filter(c => c.owner === add.id); assert.ok(casts.length > 0); assert.ok(casts.every(c => c.dungeonRun === r.id));
    signatures.push(`${add.encounterPose.kind}:${casts.length}:${casts[0].shape}:${casts[0].radius}`);
  }
  assert.deepEqual(types, ['dungeon_cinder', 'dungeon_echo', 'dungeon_satellite']); assert.equal(new Set(signatures).size, 3);
});
