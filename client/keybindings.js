/* Physical keyboard bindings: independent of the current Korean/English input mode. */
const definition = (id, label, group, first, second = null) => Object.freeze({
  id, label, group, defaults: Object.freeze([first, second])
});

export const KEY_ACTIONS = Object.freeze([
  definition('moveUp', '위로 이동', '이동', 'KeyW', 'ArrowUp'),
  definition('moveDown', '아래로 이동', '이동', 'KeyS', 'ArrowDown'),
  definition('moveLeft', '왼쪽으로 이동', '이동', 'KeyA', 'ArrowLeft'),
  definition('moveRight', '오른쪽으로 이동', '이동', 'KeyD', 'ArrowRight'),
  definition('basic', '기본 공격', '전투 · 행동', 'Space', 'KeyZ'),
  definition('skill1', '첫 번째 기술', '전투 · 행동', 'KeyQ'),
  definition('skill2', '두 번째 기술', '전투 · 행동', 'KeyE'),
  definition('ultimate', '궁극기', '전투 · 행동', 'KeyR'),
  definition('dash', '회피 · 별걸음', '전투 · 행동', 'ShiftLeft'),
  definition('interact', '대화 · 채집 · 이동', '전투 · 행동', 'KeyF'),
  definition('potion', '체력 물약', '전투 · 행동', 'Digit1'),
  definition('mana', '마나 물약', '전투 · 행동', 'Digit2'),
  definition('autoAttack', '자동 기본 공격 켜기 / 끄기', '전투 · 행동', 'KeyT'),
  definition('target', '가까운 적 선택', '전투 · 행동', 'Tab'),
  definition('return', '마을로 귀환', '전투 · 행동', 'KeyH'),
  definition('jobs', '직업 도감', '메뉴 · 채팅', 'KeyC'),
  definition('events', '월드 보스', '메뉴 · 채팅', 'KeyB'),
  definition('stories', '전직 이야기', '메뉴 · 채팅', 'KeyV'),
  definition('chronicle', '탐험 수첩', '메뉴 · 채팅', 'KeyN'),
  definition('stats', '능력치', '메뉴 · 채팅', 'KeyU'),
  definition('inventory', '가방', '메뉴 · 채팅', 'KeyI'),
  definition('journal', '의뢰', '메뉴 · 채팅', 'KeyJ'),
  definition('map', '지도', '메뉴 · 채팅', 'KeyM'),
  definition('party', '파티', '메뉴 · 채팅', 'KeyP'),
  definition('settings', '설정 열기', '메뉴 · 채팅', 'Escape'),
  definition('chat', '채팅 입력', '메뉴 · 채팅', 'Enter')
]);

export const KEY_STORAGE_KEY = 'starfall.keybindings.v1';
const byId = new Map(KEY_ACTIONS.map(action => [action.id, action]));
const namedKeys = Object.freeze({
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', ShiftLeft: 'Shift',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', IntlBackslash: 'Intl \\', IntlRo: 'Intl Ro', IntlYen: '¥',
  Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter'
});

export function normalizeKeyCode(code) {
  return code === 'ShiftRight' ? 'ShiftLeft' : typeof code === 'string' ? code : '';
}

export function formatKey(code) {
  code = normalizeKeyCode(code);
  if (!code) return '미지정';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'Num ' + code.slice(6);
  return Object.hasOwn(namedKeys, code) ? namedKeys[code] : code;
}

function allowedCode(code, actionId) {
  return (code !== 'Escape' || actionId === 'settings') && (
    /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) ||
    /^Numpad[0-9]$/.test(code) || Object.hasOwn(namedKeys, code)
  );
}

const defaults = () => Object.fromEntries(KEY_ACTIONS.map(action => [action.id, [...action.defaults]]));
const copyBindings = bindings => Object.fromEntries(KEY_ACTIONS.map(({id}) => [id, [...bindings[id]]]));

function validatedBindings(value) {
  if (!value || value.version !== 1 || !value.bindings ||
      typeof value.bindings !== 'object' || Array.isArray(value.bindings)) return null;
  const candidate = defaults();
  const used = new Set();
  for (const {id} of KEY_ACTIONS) {
    if (Object.hasOwn(value.bindings, id)) {
      const slots = value.bindings[id];
      if (!Array.isArray(slots) || slots.length !== 2) return null;
      candidate[id] = slots.map(code => code === null ? null : normalizeKeyCode(code));
    }
    for (const code of candidate[id]) {
      if (code === null) continue;
      if (!allowedCode(code, id) || used.has(code)) return null;
      used.add(code);
    }
  }
  return candidate;
}

/**
 * Storage is optional so the same model can run in Node and in restricted browsers.
 * Failed persistence never prevents using the edited bindings in the current session.
 */
export function createKeybindings(storage) {
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  let bindings = defaults();
  let owners = new Map();
  const slotsFor = id => byId.has(id) ? bindings[id] : [null, null];

  function rebuildOwners() {
    owners = new Map();
    for (const {id, label} of KEY_ACTIONS) bindings[id].forEach((code, slot) => {
      if (code) owners.set(code, {id, label, slot});
    });
  }

  function load() {
    let loaded;
    try { loaded = validatedBindings(JSON.parse(storage?.getItem(KEY_STORAGE_KEY) || 'null')); } catch {}
    bindings = loaded || defaults();
    rebuildOwners();
    return copyBindings(bindings);
  }

  function persist() {
    try {
      if (!storage || typeof storage.setItem !== 'function') return false;
      storage.setItem(KEY_STORAGE_KEY, JSON.stringify({version: 1, bindings}));
      return true;
    } catch { return false; }
  }

  function assign(id, slot, rawCode) {
    if (!byId.has(id) || (slot !== 0 && slot !== 1)) return {ok: false, error: '변경할 키 항목을 다시 선택해 주세요.'};
    const code = rawCode === null ? null : normalizeKeyCode(rawCode);
    if (code !== null && !allowedCode(code, id)) {
      return {ok: false, error: code === 'Escape'
        ? 'Esc는 창 닫기와 입력 취소에 사용합니다. 다른 키를 선택해 주세요.'
        : '문자, 숫자, 방향키, Space, Shift 등의 단일 키를 사용해 주세요. Ctrl·Alt·Meta 조합과 기능키는 지원하지 않습니다.'};
    }
    const conflict = code && owners.get(code);
    if (conflict && (conflict.id !== id || conflict.slot !== slot)) {
      return {ok: false, error: `${formatKey(code)} 키는 '${conflict.label}'에서 사용 중입니다. 해당 키를 먼저 해제해 주세요.`, conflict: {...conflict}};
    }
    bindings[id][slot] = code;
    rebuildOwners();
    return {ok: true, saved: persist()};
  }

  load();
  return {
    get(id) { return [...slotsFor(id)]; },
    get state() { return copyBindings(bindings); },
    label(id) { return slotsFor(id).filter(Boolean).map(formatKey).join(' / ') || '미지정'; },
    primaryLabel(id) { const code = slotsFor(id).find(Boolean); return code ? formatKey(code) : '—'; },
    actionFor(code) { return owners.get(normalizeKeyCode(code))?.id || null; },
    isHeld(id, held) {
      if (!held || typeof held.has !== 'function') return false;
      return slotsFor(id).some(code => code && (held.has(code) || code === 'ShiftLeft' && held.has('ShiftRight')));
    },
    assign,
    clear(id, slot) { return assign(id, slot, null); },
    reset() { bindings = defaults(); rebuildOwners(); return {ok: true, saved: persist()}; },
    load
  };
}
