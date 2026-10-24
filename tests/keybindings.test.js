import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY_ACTIONS, KEY_STORAGE_KEY, createKeybindings, formatKey, normalizeKeyCode} from '../client/keybindings.js';

function memoryStorage(initial) {
  const values = new Map(initial ? [[KEY_STORAGE_KEY, initial]] : []);
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

test('defaults retain both existing movement and attack key alternatives', () => {
  const keys = createKeybindings(null);
  assert.deepEqual(keys.get('moveUp'), ['KeyW', 'ArrowUp']);
  assert.deepEqual(keys.get('basic'), ['Space', 'KeyZ']);
  assert.equal(keys.actionFor('ArrowRight'), 'moveRight');
  assert.equal(keys.actionFor('Enter'), 'chat');
  assert.equal(keys.actionFor('Escape'), 'settings');
  const assigned = KEY_ACTIONS.flatMap(({id}) => keys.get(id)).filter(Boolean);
  assert.equal(assigned.length, new Set(assigned).size);
});

test('remapping changes dispatch and held input, then survives a reload', () => {
  const storage = memoryStorage();
  const keys = createKeybindings(storage);
  assert.deepEqual(keys.assign('skill1', 0, 'KeyK'), {ok: true, saved: true});
  assert.equal(keys.actionFor('KeyK'), 'skill1');
  assert.equal(keys.actionFor('KeyQ'), null);
  assert.equal(keys.isHeld('skill1', new Set(['KeyK'])), true);
  assert.equal(keys.isHeld('skill1', new Set(['KeyQ'])), false);
  const reloaded = createKeybindings(storage);
  assert.deepEqual(reloaded.get('skill1'), ['KeyK', null]);
  assert.equal(reloaded.primaryLabel('skill1'), 'K');
});

test('both primary and secondary slots participate in duplicate checks without changing existing bindings', () => {
  const keys = createKeybindings(memoryStorage());
  const before = keys.state;
  const conflict = keys.assign('skill1', 0, 'KeyZ');
  assert.equal(conflict.ok, false);
  assert.deepEqual(conflict.conflict, {id: 'basic', label: '기본 공격', slot: 1});
  assert.deepEqual(keys.state, before);
  assert.equal(keys.assign('basic', 1, 'Space').ok, false);
  assert.equal(keys.assign('basic', 0, 'Space').ok, true);
  keys.clear('basic', 1);
  assert.equal(keys.assign('skill1', 0, 'KeyZ').ok, true);
});

test('cleared bindings stay clear after reload and reset restores all defaults', () => {
  const storage = memoryStorage();
  const keys = createKeybindings(storage);
  keys.clear('basic', 0);
  keys.clear('basic', 1);
  assert.equal(keys.label('basic'), '미지정');
  assert.equal(keys.primaryLabel('basic'), '—');
  assert.equal(keys.isHeld('basic', new Set(['Space', 'KeyZ'])), false);
  assert.deepEqual(createKeybindings(storage).get('basic'), [null, null]);
  assert.equal(keys.reset().saved, true);
  assert.equal(createKeybindings(storage).label('basic'), 'Space / Z');
});

test('physical codes work independently of typed letters and normalize both Shift keys', () => {
  const keys = createKeybindings(memoryStorage());
  assert.equal(keys.actionFor('KeyW'), 'moveUp');
  assert.equal(keys.actionFor('ㅈ'), null);
  assert.equal(keys.actionFor('ShiftRight'), 'dash');
  assert.equal(keys.isHeld('dash', new Set(['ShiftRight'])), true);
  assert.equal(keys.assign('skill1', 0, 'ShiftRight').conflict.id, 'dash');
  keys.clear('dash', 0);
  assert.equal(keys.assign('skill1', 0, 'ShiftRight').ok, true);
  assert.deepEqual(keys.get('skill1'), ['ShiftLeft', null]);
  assert.equal(keys.actionFor('ShiftLeft'), 'skill1');
  assert.equal(normalizeKeyCode('ShiftRight'), 'ShiftLeft');
  assert.equal(formatKey('Numpad2'), 'Num 2');
  assert.equal(formatKey('NumpadEnter'), 'Num Enter');
});

test('invalid codes, modifier combinations, function keys and reserved Escape are rejected', () => {
  const keys = createKeybindings(memoryStorage());
  for (const code of ['ControlLeft', 'AltRight', 'MetaLeft', 'Ctrl+KeyK', 'F5', 'F12', '', undefined, 42]) {
    assert.equal(keys.assign('skill1', 0, code).ok, false, String(code));
  }
  assert.equal(keys.assign('skill1', 0, 'Escape').ok, false);
  assert.equal(keys.assign('settings', 0, 'KeyO').ok, true);
  assert.equal(keys.assign('settings', 1, 'Escape').ok, true);
  assert.equal(keys.assign('unknown', 0, 'KeyL').ok, false);
  assert.equal(keys.assign('skill1', 2, 'KeyL').ok, false);
  assert.deepEqual(keys.get('constructor'), [null, null]);
  assert.equal(keys.label('__proto__'), '미지정');
  assert.equal(keys.isHeld('toString', new Set(['KeyQ'])), false);
});

test('malformed storage falls back to usable collision-free defaults', () => {
  const defaults = createKeybindings(null).state;
  const badMappings = [
    '{broken', 'null', '[]', '{}',
    JSON.stringify({version: 2, bindings: defaults}),
    JSON.stringify({version: 1, bindings: []}),
    JSON.stringify({version: 1, bindings: {...defaults, basic: ['Space']}}),
    JSON.stringify({version: 1, bindings: {...defaults, basic: [false, null]}}),
    JSON.stringify({version: 1, bindings: {...defaults, skill1: ['ArrowUp', null]}}),
    JSON.stringify({version: 1, bindings: {...defaults, skill1: ['Escape', null]}})
  ];
  for (const text of badMappings) assert.deepEqual(createKeybindings(memoryStorage(text)).state, defaults);
});

test('storage errors never prevent current-session changes', () => {
  const storage = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }};
  const keys = createKeybindings(storage);
  assert.equal(keys.actionFor('KeyQ'), 'skill1');
  assert.deepEqual(keys.assign('skill1', 0, 'KeyK'), {ok: true, saved: false});
  assert.equal(keys.actionFor('KeyK'), 'skill1');
  assert.equal(keys.clear('skill1', 0).saved, false);
  assert.equal(keys.actionFor('KeyK'), null);
  assert.equal(keys.reset().saved, false);
  assert.equal(keys.actionFor('KeyQ'), 'skill1');
});

test('returned state and slot arrays cannot mutate bindings behind the model', () => {
  const keys = createKeybindings(null);
  keys.get('skill1')[0] = 'KeyL';
  keys.state.skill1[0] = 'KeyL';
  keys.load().skill1[0] = 'KeyL';
  assert.equal(keys.actionFor('KeyQ'), 'skill1');
  assert.equal(keys.actionFor('KeyL'), null);
});
