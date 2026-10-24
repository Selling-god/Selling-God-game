import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, newCharacter, hydrate, serialize } from '../server/game.js';
import { getStats, xpRequired } from '../shared/content.js';
import { createMap, isBlocked, findPath } from '../shared/world.js';
import { CHALLENGES, CHALLENGE_ZONE, challengeKey, prepareChallenges } from '../shared/challenges.js';
import { challengesPanel, challengeHUD, drawChallengeOverlay } from '../client/challenges-ui.js';

function setup(level = 80) {
  const messages = [], g = new Game({ random: () => .5, send: (id, event, data) => messages.push({ id, event, data }) });
  g.now = Date.parse('2026-10-23T03:11:00Z');
  const p = addPlayer(g, 'hero', level);
  return { g, p, messages };
}
function addPlayer(g, id, level = 80) {
  const p = g.addPlayer(newCharacter(id, id, 'mage')); p.level = level;
  const stats = getStats(p); p.hp = stats.maxHp; p.mp = stats.maxMp; return p;
}
function advance(g, milliseconds) { g.tick(.05, g.now + milliseconds); }
function start(g, p, id, tier = 0, checkpoint = false) {
  assert.equal(g.action(p, { type: 'challengeStart', id, tier, checkpoint }).ok, true);
  advance(g, 3001); return g.challenges.runFor(p);
}
function owned(g, p) { return g.worlds.get(CHALLENGE_ZONE).mobs.filter(m => m.challengeOwner === p.id && m.alive); }
// A server-authoritative kill callback, used to drive long encounters without
// making correctness tests depend on balance constants or animation timing.
function defeat(g, p, mob) {
  mob.contributors.set(p.id, g.now); mob.damageLog.set(p.id, mob.maxHp); mob.hp = 0;
  g.killMob(CHALLENGE_ZONE, mob);
}
function clearWave(g, p) { for (const mob of [...owned(g, p)]) defeat(g, p, mob); }
function solveTowerGate(g,p){
  const r=g.challenges.runFor(p);if(r?.phase!=='gate')return;
  for(const index of [...r.towerGate.order]){
    const pad=g.snapshot(p).challenge.markers.find(m=>m.id===`tower_${index}`);
    p.x=pad.x;p.y=pad.y;g.now+=600;
    assert.equal(g.action(p,{type:'challengeInteract',id:pad.id}).ok,true);
  }
}
function survivalBeacon(g,p,r,timeSinceStart){
  advance(g,Math.max(1,r.started+3000+timeSinceStart-g.now));
  assert.ok(r.beaconOpen,'beacon must be pending');
  const marker=g.snapshot(p).challenge.markers.find(m=>m.id===`beacon_${r.beaconOpen.idx}`);
  p.x=marker.x;p.y=marker.y;g.now+=600;
  assert.equal(g.action(p,{type:'challengeInteract',id:marker.id}).ok,true);
  clearWave(g,p);
}

function completeRunes(g, p) {
  while (g.challenges.runFor(p)) {
    const r = g.challenges.runFor(p);
    if (r.phase === 'rest') advance(g, Math.max(1, r.nextAt - g.now + 1));
    if (r.phase === 'memorize') advance(g, Math.max(1, r.peekUntil - g.now + 1));
    // Later chambers seal the glyphs behind combat, and the last reverses the order.
    for(const guardian of [...owned(g,p)].filter(m=>m.challengeRole==='rune_guard'))defeat(g,p,guardian);
    if(r.stage===3&&r.anchorStep<2){
      for(let index=0;index<2;index++){
        const pad=g.snapshot(p).challenge.markers.find(m=>m.id===`anchor_${index}`);
        p.x=pad.x;p.y=pad.y;g.now+=600;
        assert.equal(g.action(p,{type:'challengeInteract',id:pad.id}).ok,true);
      }
    }
    const sequence = [...r.runeOrder];
    for (const index of sequence) {
      const pad = g.snapshot(p).challenge.markers.find(m => m.id === `rune_${index}`);
      p.x = pad.x; p.y = pad.y; g.now += 600;
      assert.equal(g.action(p, { type: 'challengeInteract', id: pad.id }).ok, true);
    }
  }
}

test('five different challenge modes have reachable arena geometry, staggered gates and safe old-save defaults', () => {
  assert.deepEqual(new Set(CHALLENGES.map(c => c.id)), new Set(['tower', 'runes', 'survival', 'boss_rush', 'defense']));
  const map = createMap(CHALLENGE_ZONE);
  for (const point of [{ x: 576, y: 688 }, { x: 384, y: 288 }, { x: 768, y: 608 }, { x: 352, y: 448 }, { x: 800, y: 448 }]) {
    assert.equal(isBlocked(map, point.x, point.y, 12), false);
    assert.ok(findPath(map, { x: 576, y: 688 }, point).length || (point.x === 576 && point.y === 688));
  }
  const old = newCharacter('legacy', 'legacy'); delete old.challenges;
  const recovered = hydrate(old);
  assert.equal(recovered.challenges.tokens, 0); assert.deepEqual(recovered.challenges.records, {});
  assert.equal(recovered.challengeRun, null);
});

test('mode/tier gates, duplicate entry and spoofed checkpoint inputs are checked on the server', () => {
  const { g, p } = setup(14);
  assert.equal(g.action(p, { type: 'challengeStart', id: 'tower' }).ok, false);
  p.level = 60;
  assert.equal(g.action(p, { type: 'challengeStart', id: 'tower', tier: 1 }).ok, false);
  assert.equal(g.action(p, { type: 'challengeStart', id: 'tower', tier: '0' }).ok, false);
  assert.equal(g.action(p, { type: 'challengeStart', id: 'not_real' }).ok, false);
  const r = start(g, p, 'tower', 0, true); assert.equal(r.stage, 1);
  assert.equal(g.action(p, { type: 'challengeStart', id: 'runes' }).ok, false);
  assert.equal(g.action(p, { type: 'challengeComplete', id: r.id, score: 99999 }).ok, false);
  assert.equal(p.challenges.tokens, 0);
});

test('private snapshots, target selection, area attacks, damage-over-time and effects cannot cross owner runs', () => {
  const { g, p, messages } = setup(); const q = addPlayer(g, 'other');
  start(g, p, 'tower'); start(g, q, 'tower');
  p.x = q.x = 576; p.y = q.y = 448;
  for (const mob of [...owned(g, p), ...owned(g, q)]) { mob.x = 596; mob.y = 448; }
  const mine = owned(g, p), theirs = owned(g, q), hp = theirs.map(m => m.hp);
  const s = g.snapshot(p, true);
  assert.equal(s.players.length, 0); assert.equal(s.zoneOnline, 1);
  assert.ok(s.mobs.every(m => mine.some(own => own.id === m.id)));
  assert.equal(g.action(p, { type: 'target', id: theirs[0].id }).ok, false);
  p.target = mine[0].id;
  assert.equal(g.action(p, { type: 'attack', skill: 'skill1' }).ok, true);
  assert.deepEqual(theirs.map(m => m.hp), hp); assert.ok(mine.some(m => m.hp < m.maxHp));
  const ownHp = mine[0].hp;
  mine[0].dots = [{ by: q.id, left: 1, next: g.now, damage: 999999 }];
  g.challenges.tick(.01); assert.equal(mine[0].hp, ownHp);
  const r = g.challenges.runFor(p), otherRun = g.challenges.runFor(q);
  g.challenges.cast(r, { x: p.x, y: p.y, name: 'private cast' });
  assert.ok(g.snapshot(p).casts.some(c => c.name === 'private cast'));
  assert.ok(!g.snapshot(q).casts.some(c => c.name === 'private cast'));
  assert.equal(g.challenges.sameInstance(p, q), false);
  messages.length = 0; g.fx(CHALLENGE_ZONE, { type: 'buff', id: p.id, x: p.x, y: p.y });
  assert.deepEqual(messages.filter(m => m.event === 'fx').map(m => m.id), [p.id]);
  assert.notEqual(r.id, otherRun.id);
});

test('normal combat damage and owner damage-over-time kill arena enemies without generic XP, loot or boss credit', () => {
  const { g, p } = setup(); start(g, p, 'tower');
  const [mob] = owned(g, p); p.x = mob.x - 20; p.y = mob.y; p.target = mob.id;
  const xp = p.xp, kills = p.kills, gold = p.gold, inventory = structuredClone(p.inventory);
  assert.equal(g.action(p, { type: 'attack', skill: 'basic' }).ok, true);
  assert.ok(mob.hp < mob.maxHp);
  mob.dots = [{ by: p.id, left: 1, next: g.now, damage: mob.maxHp }];
  g.challenges.tick(.01);
  assert.equal(mob.alive, false); assert.equal(mob.respawnAt, Infinity);
  assert.equal(g.challenges.runFor(p).kills, 1);
  assert.equal(p.xp, xp); assert.equal(p.kills, kills); assert.equal(p.gold, gold); assert.deepEqual(p.inventory, inventory);
});

test('tower checkpoints save only completed fifth floors and cannot be farmed by resuming', () => {
  const { g, p } = setup(); start(g, p, 'tower');
  for (let floor = 1; floor <= 5; floor++) {
    assert.equal(g.challenges.runFor(p).stage, floor); clearWave(g, p);solveTowerGate(g,p);
    if (floor < 5) advance(g, 2401);
  }
  const key = challengeKey('tower', 0), record = p.challenges.records[key];
  assert.equal(record.bestFloor, 5); assert.equal(record.checkpoint, 5); assert.equal(p.challenges.tokens, 2);
  assert.equal(g.action(p, { type: 'challengeExit' }).ok, true); advance(g, 6000);
  const r = start(g, p, 'tower', 0, true); assert.equal(r.stage, 6);
  assert.equal(p.challenges.tokens, 2);
  g.action(p, { type: 'challengeExit' }); advance(g, 6000);
  start(g, p, 'tower', 0, false);
  for (let floor = 1; floor <= 5; floor++) { clearWave(g, p);solveTowerGate(g,p); if (floor < 5) advance(g, 2401); }
  assert.equal(p.challenges.tokens, 2);
});

test('all 30 tower floors really advance and the final boss grants one clear record and reward', () => {
  const { g, p } = setup(); start(g, p, 'tower');
  for (let floor = 1; floor <= 30; floor++) {
    assert.equal(g.challenges.runFor(p)?.stage, floor);
    assert.ok(owned(g, p).length > 0); clearWave(g, p);solveTowerGate(g,p);
    if (floor < 30) advance(g, 2401);
  }
  assert.equal(p.zone, 'town'); assert.equal(g.challenges.runFor(p), null);
  assert.equal(p.challenges.records['tower:0'].bestFloor, 30); assert.equal(p.challenges.records['tower:0'].clears, 1);
  assert.equal(p.challenges.tokens, 18); // Five first checkpoints + one first full clear.
  assert.equal(p.challenges.lastResult.won, true); assert.equal(p.challenges.lastResult.xp, Math.round(xpRequired(80) * .18));
  assert.equal(g.worlds.get(CHALLENGE_ZONE).mobs.length, 0);
});

test('tower floor timeout fails safely without a checkpoint or clear reward', () => {
  const { g, p } = setup(); const hp = p.hp - 100; p.hp = hp;
  const r = start(g, p, 'tower'); advance(g, r.stageEnds - g.now + 1);
  assert.equal(p.zone, 'town'); assert.equal(p.challenges.lastResult.won, false);
  assert.equal(p.challenges.tokens, 0); assert.equal(p.hp, hp);
});

test('boss rush shields enforce nearby seal interaction and do not consume attacks on immune targets', () => {
  const { g, p } = setup(); start(g, p, 'boss_rush'); const [boss] = owned(g, p);
  p.x = boss.x + 30; p.y = boss.y; p.target = boss.id;
  const mp = p.mp, hp = boss.hp;
  assert.equal(g.action(p, { type: 'attack', skill: 'skill1' }).ok, false);
  assert.equal(boss.hp, hp); assert.equal(p.mp, mp); assert.equal(p.cooldowns.skill1, undefined);
  assert.equal(g.action(p, { type: 'challengeInteract', id: 'seal_0' }).ok, false);
  for (const marker of g.snapshot(p).challenge.markers) { p.x = marker.x; p.y = marker.y; g.now += 600; assert.equal(g.action(p, { type: 'interact', id: marker.id }).ok, true); }
  assert.equal(boss.challengeShield, false);
  p.x = boss.x + 30; p.y = boss.y;
  assert.equal(g.action(p, { type: 'attack', skill: 'basic' }).ok, true); assert.ok(boss.hp < hp);
  boss.hp = boss.maxHp * .49; g.challenges.tick(.01);
  assert.equal(boss.challengeShield, true); assert.deepEqual(g.challenges.runFor(p).seals, [false, false]);
});

test('boss rush refuge prevents a real pulse and killing channel adds interrupts the final explosion', () => {
  const { g, p } = setup(); start(g, p, 'boss_rush');
  defeat(g, p, owned(g, p)[0]); advance(g, 2401);
  const r = g.challenges.runFor(p); assert.equal(r.stage, 2);
  advance(g, r.nextMechanic - g.now + 1);
  const safe = g.snapshot(p).challenge.markers.find(m => m.kind === 'safe'); assert.ok(safe);
  p.x = safe.x; p.y = safe.y; p.invulnerableUntil = 0;
  const hp = p.hp; g.now = r.refuge.until + 1; g.challenges.resolveCasts(p, r); assert.equal(p.hp, hp);
  r.nextMechanic = g.now; g.challenges.tick(.01);
  p.x = 150; p.y = 150; const outsideHp = p.hp;
  g.now = r.refuge.until + 1; g.challenges.resolveCasts(p, r); assert.ok(p.hp < outsideHp);
  defeat(g, p, owned(g, p)[0]); advance(g, 2401); assert.equal(r.stage, 3);
  advance(g, r.nextMechanic - g.now + 1);
  const boss = owned(g, p).find(m => m.id === r.bossId), adds = owned(g, p).filter(m => m.challengeRole === 'interrupt');
  assert.equal(adds.length, 2); assert.equal(boss.challengeShield, true); assert.ok(r.channelUntil > g.now);
  for (const add of adds) defeat(g, p, add);
  assert.equal(boss.challengeShield, false); assert.equal(r.channelUntil, 0); assert.ok(boss.stunUntil > g.now);
  assert.equal(g.worlds.get(CHALLENGE_ZONE).casts.some(c => c.effect === 'interrupt'), false);
  defeat(g, p, boss); assert.equal(p.challenges.lastResult.won, true); assert.equal(p.challenges.records['boss_rush:0'].clears, 1);
});

test('survival requires 18 kills, three timed altar lights, and living to the deadline', () => {
  const {g,p}=setup();let r=start(g,p,'survival');
  advance(g,r.ends-g.now+1);
  assert.equal(p.challenges.lastResult.won,false);
  advance(g,6000);r=start(g,p,'survival');
  // Moving across the arena under pressure is now mandatory, not just idling.
  clearWave(g,p);
  survivalBeacon(g,p,r,46000);
  survivalBeacon(g,p,r,102000);
  survivalBeacon(g,p,r,148000);
  while(r.kills<18){
    advance(g,r.nextWave-g.now+1);
    clearWave(g,p);
  }
  assert.equal(r.beaconsLit,3);
  advance(g,r.ends-g.now+1);
  assert.equal(p.challenges.lastResult.won,true);
  assert.ok(p.challenges.records['survival:0'].bestScore>=18);
});

test('moving survival safe zone shrinks and missed beacon fails immediately',()=>{
  const {g,p}=setup();const r=start(g,p,'survival');
  survivalBeacon(g,p,r,46000);
  advance(g,15000);assert.equal(g.snapshot(p).challenge.markers[0].radius,325);
  const first={...r.safeCenter};
  advance(g,42000);assert.ok(r.beaconOpen);
  survivalBeacon(g,p,r,102000);advance(g,19000);assert.notDeepEqual(r.safeCenter,first);
  advance(g,27000);assert.ok(r.beaconOpen);advance(g,21000);assert.equal(p.challenges.lastResult.won,false);
  assert.match(p.challenges.lastResult.reason,/불씨/);
});

test('defense turret builds require earned energy and proximity and actually destroy hostiles',()=>{
  const {g,p}=setup();const r=start(g,p,'defense');
  r.charge=4;assert.equal(g.action(p,{type:'challengeBuild',id:'0'}).ok,false);
  p.x=422;p.y=554;
  assert.equal(g.action(p,{type:'challengeBuild',id:'0'}).ok,true);
  assert.equal(r.charge,0);assert.equal(r.turrets[0],1);
  const target=owned(g,p)[0];target.x=455;target.y=554;
  const hp=target.hp;r.turretNext=g.now-1;g.challenges.tick(.01);
  assert.ok(target.hp<hp);
  assert.equal(g.action(p,{type:'challengeBuild',id:'0'}).ok,false);
});

test('defense enemies damage the crystal, repairs spend earned energy, wards prevent damage, and five waves win', () => {
  const { g, p } = setup(); const r = start(g, p, 'defense');
  p.x = 200; p.y = 700;
  const siege = owned(g, p)[0]; siege.x = 586; siege.y = 448; siege.nextAttack = 0;
  g.challenges.tick(.01); assert.ok(r.crystalHp < 1000);
  clearWave(g, p); assert.equal(r.charge, 4);
  const energy = r.charge;
  assert.equal(g.action(p, { type: 'challengeInteract', id: 'crystal' }).ok, false); assert.equal(r.charge, energy);
  p.x = 576; p.y = 448; g.now += 600;
  assert.equal(g.action(p, { type: 'challengeInteract', id: 'crystal' }).ok, true);
  assert.equal(r.charge, 1); assert.equal(r.crystalHp, 1000);
  advance(g, 2401); clearWave(g, p); advance(g, 2401); assert.equal(r.stage, 3); assert.equal(r.charge, 6);
  assert.equal(g.action(p, { type: 'challengeWard' }).ok, true); assert.equal(r.charge, 1);
  const attacker = owned(g, p)[0]; attacker.x = 586; attacker.y = 448; attacker.nextAttack = 0;
  g.challenges.tick(.01); assert.equal(r.crystalHp, 1000);
  for (let wave = 3; wave <= 5; wave++) { clearWave(g, p); if (wave < 5) advance(g, 2401); }
  assert.equal(p.challenges.lastResult.won, true); assert.equal(p.challenges.records['defense:0'].clears, 1);
});

test('a destroyed defense crystal fails even when the player is alive', () => {
  const { g, p } = setup(); const r = start(g, p, 'defense'); r.crystalHp = 1;
  const mob = owned(g, p)[0]; mob.x = 576; mob.y = 448; mob.nextAttack = 0;
  g.challenges.tick(.01);
  assert.equal(p.challenges.lastResult.won, false); assert.equal(p.challenges.tokens, 0); assert.ok(p.hp > 0); assert.equal(p.zone, 'town');
});

test('rune preview is concealed; later rooms require combat, reversed order and proximity', () => {
  const { g, p } = setup(); const r = start(g, p, 'runes');
  assert.equal(g.snapshot(p).challenge.sequence.length, 3);
  advance(g, r.peekUntil - g.now + 1); assert.equal(g.snapshot(p).challenge.sequence, null);
  const before = r.runeStep;
  assert.equal(g.action(p, { type: 'challengeInteract', id: `rune_${r.sequence[0]}` }).ok, false); assert.equal(r.runeStep, before);
  completeRunes(g, p);
  assert.equal(p.challenges.lastResult.won, true); assert.equal(p.challenges.records['runes:0'].clears, 1); assert.ok(p.challenges.records['runes:0'].bestScore > 0);
});

test('three wrong rune inputs fail, and a trap hit really shortens the authoritative deadline', () => {
  const { g, p } = setup(); const r = start(g, p, 'runes'); advance(g, r.peekUntil - g.now + 1);
  const ends = r.ends; p.x = 576; p.y = 448; p.invulnerableUntil = 0;
  g.challenges.cast(r, { x: p.x, y: p.y, radius: 45, effect: 'runeTrap', damage: 20, name: 'test trap' }, 1);
  g.now += 2; g.challenges.resolveCasts(p, r); assert.equal(r.ends, ends - 4000);
  const wrong = (r.sequence[0] + 1) % 4, marker = g.snapshot(p).challenge.markers.find(m => m.id === `rune_${wrong}`);
  p.x = marker.x; p.y = marker.y;
  for (let i = 0; i < 3; i++) { g.now += 600; assert.equal(g.action(p, { type: 'challengeInteract', id: marker.id }).ok, true); }
  assert.equal(p.challenges.lastResult.won, false); assert.equal(p.challenges.tokens, 0); assert.equal(p.zone, 'town');
});

test('first clear pays once, same-day repeats pay nothing, next-day repeat pays tokens but no XP', () => {
  const { g, p } = setup(); start(g, p, 'runes'); completeRunes(g, p);
  const xp = p.xp, gold = p.gold; assert.equal(p.challenges.tokens, 8);
  advance(g, 6000); start(g, p, 'runes'); completeRunes(g, p);
  assert.equal(p.challenges.tokens, 8); assert.equal(p.gold, gold); assert.equal(p.xp, xp);
  assert.equal(p.challenges.records['runes:0'].clears, 2);
  advance(g, 24 * 3600000); start(g, p, 'runes'); completeRunes(g, p);
  assert.equal(p.challenges.tokens, 10); assert.equal(p.xp, xp); assert.equal(p.challenges.lastResult.xp, 0);
  const saved = serialize(p), loaded = hydrate(saved);
  assert.deepEqual(loaded.challenges.records, p.challenges.records); assert.deepEqual(loaded.challenges.claims, p.challenges.claims);
  assert.equal(loaded.challenges.tokens, 10);
});

test('leaving, dying, disconnecting and loading an orphan arena save return safely without restoring consumed inventory', () => {
  for (const exit of ['exit', 'death', 'disconnect', 'teleport', 'load']) {
    const { g, p } = setup(); p.hp = 220; p.mp = 45;
    start(g, p, 'tower'); p.inventory.potion--;
    const deaths = p.deaths, gold = p.gold;
    if (exit === 'load') {
      const loaded = hydrate(serialize(p));
      assert.equal(loaded.zone, 'town'); assert.equal(loaded.hp, 220); assert.equal(loaded.mp, 45);
      assert.equal(loaded.challengeRun, null); assert.equal(loaded.challenges.returnPoint, null); continue;
    }
    if (exit === 'exit') g.action(p, { type: 'challengeExit' });
    if (exit === 'death') { p.invulnerableUntil = 0; g.damagePlayer(p, 99999999); }
    if (exit === 'disconnect') { p.active = false; g.challenges.tick(.01); }
    if (exit === 'teleport') g.teleport(p, 'forest', 976, 1296);
    assert.equal(g.challenges.runFor(p), null); assert.equal(p.challengeRun, null); assert.notEqual(p.zone, CHALLENGE_ZONE);
    assert.equal(p.hp, 220); assert.equal(p.mp, 45); assert.equal(p.inventory.potion, 7);
    assert.equal(p.deaths, deaths); assert.equal(p.gold, gold); assert.equal(p.respawnAt, 0);
    assert.equal(g.worlds.get(CHALLENGE_ZONE).mobs.length, 0); assert.equal(g.worlds.get(CHALLENGE_ZONE).casts.length, 0);
  }
});

test('challenge token exchange validates currency and inventory and cannot be replayed with insufficient balance', () => {
  const { g, p } = setup(); p.challenges.tokens = 3;
  assert.equal(g.action(p, { type: 'challengeShop', id: 'supplies' }).ok, true);
  assert.equal(p.challenges.tokens, 0); assert.equal(p.inventory.potion, 13); assert.equal(p.inventory.mana, 10);
  assert.equal(g.action(p, { type: 'challengeShop', id: 'supplies' }).ok, false);
  assert.equal(g.action(p, { type: 'challengeShop', id: '__proto__' }).ok, false);
  p.challenges.tokens = 3; p.inventory.potion = 9999;
  assert.equal(g.action(p, { type: 'challengeShop', id: 'supplies' }).ok, false); assert.equal(p.challenges.tokens, 3);
});

test('challenge UI explains five real rule sets, preserves changed interaction keys and escapes stored text', () => {
  const { g, p } = setup(); start(g, p, 'runes');
  const state = g.snapshot(p, true), keyLabel = id => id === 'interact' ? 'Enter' : '?';
  state.challenge.hint = '<img src=x onerror=alert(1)>';
  const hud = challengeHUD(state.challenge, g.now, { keyLabel });
  assert.ok(hud.includes('Enter')); assert.ok(hud.includes('&lt;img')); assert.ok(!hud.includes('<img'));
  const panel = challengesPanel({ profile: p, state, now: g.now, keyLabel });
  assert.equal(panel.title, '별의 회랑 · 도전 기록');
  for (const mode of CHALLENGES) assert.ok(panel.html.includes(mode.name));
  assert.ok(panel.html.includes('Lv.160')); assert.ok(panel.html.includes('data-act="challengeStart"'));
  assert.doesNotThrow(() => drawChallengeOverlay({}, null, 0));
  const malformed = { challenges: { tokens: -5, records: { 'tower:0': { checkpoint: 999, bestFloor: 90 } }, claims: ['tower:0', 'not_real'], daily: { 'tower:0': 'bad' } } };
  prepareChallenges(malformed);
  assert.equal(malformed.challenges.tokens, 0); assert.equal(malformed.challenges.records['tower:0'].checkpoint, 25);
  assert.deepEqual(malformed.challenges.claims, ['tower:0']); assert.deepEqual(malformed.challenges.daily, {});
});
