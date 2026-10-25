export const DUNGEON_ZONE = 'party_dungeon';
export const DUNGEON_ZONE_IDS = [DUNGEON_ZONE, 'party_archive', 'party_observatory', 'party_quarry'];
export const DUNGEON_RULES = { minMembers: 2, maxMembers: 4, readyMs: 90000, reconnectMs: 30000, reviveMs: 3000, revives: 2 };
export const DUNGEONS = [
  {
    id: 'moon_quarry', zone: 'party_quarry', name: '공명의 수정광산', level: 25, entryZone: 'ruins', minutes: 10,
    boss: 'dungeon_geode', bossName: '수정핵 수호자 · 제오', skin: 'golem', color: '#9ac7d8', theme: 'frost',
    subtitle: '갈라진 수정벽 사이에서 두 공명석이 같은 음으로 울린다.', reward: 'quarry_pendant',
    layout: '수정 수로로 나뉜 광산의 양쪽 채굴장과 세 개의 연결 다리. 떨어지지 않도록 우회로를 찾습니다.',
    combat: '제오는 공명 파동으로 위치를 고정한 뒤 낙하하는 수정 주먹으로 공격합니다. 채굴 기계 뒤에 숨으세요.',
    phases: [
      {title:'잠든 수정핵',form:'sealed_geode',description:'바닥에 번지는 공명 파동을 읽으세요.'},
      {title:'균열의 채굴자',form:'shattered_geode',description:'수정 외피가 깨지며 연속 주먹과 두 갈래 파동이 나옵니다.'},
      {title:'청백색 공명의 심장',form:'resonant_core',description:'수정핵이 노출됩니다. 연속 파동을 피한 뒤 과열된 핵을 노리세요.'}
    ],
    mechanics: [
      '서로 다른 두 파티원이 해·달 공명 발판에 올라 2초 동안 함께 버텨야 합니다.',
      '수정 기둥을 돌려 공명 방향을 맞추고, 거대한 주먹이 내려오는 자리에서 벗어나세요.',
      '보스 체력 70%·35%에서 수정이 깨지며 공격 패턴이 바뀝니다.'
    ],
    title:'첫 공명을 울린 자'
  },
  {
    id: 'concord_forge', zone: DUNGEON_ZONE, name: '쌍월의 용광로', level: 35, entryZone: 'sunscar', minutes: 12,
    boss: 'dungeon_arke', bossName: '쌍극의 감시자 · 아르케', skin: 'moss_guardian', color: '#e6b976', theme: 'fire',
    subtitle: '서로 다른 빛이 동시에 도착해야 문이 열린다.', reward: 'concord_pendant',
    layout: '용암 수로로 갈라진 세 제련대. 다리와 계단으로 건너가고 제련기 뒤에서 열풍을 피합니다.',
    combat: '아르케는 목표를 찍고 도약해 망치를 내리칩니다. 추격하는 화염 자국을 바깥으로 유도하고 식는 동안 공격하세요.',
    phases: [
      { title: '잠든 제련의 심장', form: 'sealed_furnace', description: '용광로의 망치와 목표를 고정하는 도약을 읽으세요.' },
      { title: '개방된 태양로', form: 'open_furnace', description: '가슴의 화로가 열립니다. 추격 화염이 더 길게 남고 두 번의 망치가 이어집니다.' },
      { title: '백열의 쌍극', form: 'white_hot', description: '두 팔이 백열합니다. 교차 열풍 뒤의 긴 냉각 시간이 마지막 빈틈입니다.' }
    ],
    mechanics: [
      '머리 위 해·달 표식에 맞는 발판으로 모두 이동해 2초 동안 함께 유지합니다.',
      '해 표식은 해 기둥, 달 표식은 달 기둥을 돌려 표시된 방향과 맞춥니다.',
      '보스 체력 70%·35%에서 표식과 배치가 바뀝니다. 파동을 피하며 다시 공명을 만드세요.'
    ],
    title: '두 빛을 잇는 자'
  },
  {
    id: 'memory_archive', zone: 'party_archive', name: '뒤집힌 기억의 서고', level: 80, entryZone: 'wildroot', minutes: 14,
    boss: 'dungeon_neme', bossName: '기록을 삼킨 사서 · 네메', skin: 'moon_witch', color: '#b5a9ed', theme: 'time',
    subtitle: '기억하는 사람과 행동하는 사람이 서로를 믿는 곳.', reward: 'archive_pendant',
    layout: '네 기록실과 꺾인 회랑이 중앙 광선실을 감쌉니다. 통로를 돌아 문양을 찾고 실제 서가 뒤로 몸을 숨깁니다.',
    combat: '네메는 다른 독서대로 순간 이동해 광선을 고정합니다. 서가로 광선을 가리고 시간차로 폭발하는 기록의 잔상을 순서대로 피하세요.',
    phases: [
      { title: '기록의 수호자', form: 'closed_book', description: '고정 광선은 서가로 막고 잔상이 남은 자리에서 이탈하세요.' },
      { title: '찢어진 시간의 서', form: 'torn_pages', description: '시간의 책이 펼쳐집니다. 두 독서대의 광선과 더 빠른 기록 잔상이 이어집니다.' },
      { title: '기억을 삼키는 왕관', form: 'clock_crown', description: '시곗바늘 왕관이 드러납니다. 세 겹의 기록 폭발 뒤 본체가 나타나는 순간을 노리세요.' }
    ],
    mechanics: [
      '잠깐 공개되는 3·4·5개 문양 순서를 기억합니다. 지정된 파티원이 순서대로 장치를 작동해야 합니다.',
      '유도자는 빛의 프리즘 뒤로 이동하고 나머지는 기록 고정진을 지켜 광선을 차단합니다.',
      '체력이 줄수록 순서가 길어지고 유도 시간이 짧아집니다. 교차 광선의 예고를 확인하세요.'
    ],
    title: '서로의 기억을 지킨 자'
  },
  {
    id: 'fallen_observatory', zone: 'party_observatory', name: '낙성의 심연', level: 140, entryZone: 'voidfront', minutes: 15,
    boss: 'dungeon_astra', bossName: '별을 끌어내리는 자 · 아스트라', skin: 'eclipse_dragon', color: '#e09db8', theme: 'void',
    subtitle: '혼자 별을 유도하고, 함께 붕괴를 멈춘다.', reward: 'starbound_pendant',
    layout: '공허 위 중앙 섬과 네 외곽 섬, 폭이 좁은 연결 다리. 북동·남서의 우회 다리를 골라 유성을 분산합니다.',
    combat: '아스트라는 중력으로 끌어당긴 뒤 중심을 붕괴시키고 외곽 섬으로 옮겨갑니다. 당김을 거슬러 다리를 건너고 낙성 자리를 서로 나누세요.',
    phases: [
      { title: '떠도는 관측의 눈', form: 'single_orbit', description: '중력의 중심과 연결 다리를 확인하고 당김을 거슬러 이동하세요.' },
      { title: '균열의 이중 궤도', form: 'double_orbit', description: '두 번째 궤도가 펼쳐집니다. 중력 붕괴와 두 무리의 외곽 유성이 이어집니다.' },
      { title: '별을 삼킨 심연', form: 'eclipse_core', description: '검은 태양의 핵이 열립니다. 바깥 길의 유성을 피하고 붕괴 뒤 약해진 핵을 공격하세요.' }
    ],
    mechanics: [
      '낙인 대상은 바깥 봉인 문양으로 유성을 유도합니다. 나머지 파티원은 중앙 보호진에 모입니다.',
      '지정된 서로 다른 두 파티원이 양쪽 차단기를 2초 이내에 작동하고 자리를 유지해야 합니다.',
      '70%·35% 이후 분리 사슬이 연결된 두 사람은 폭발 전에 180 이상 떨어져야 합니다.'
    ],
    title: '떨어지는 별을 멈춘 자'
  }
];
export const DUNGEON_BY_ID = Object.fromEntries(DUNGEONS.map(d => [d.id, d]));
export const DUNGEON_SYMBOLS = ['해', '달', '잎', '별'];
export const DUNGEON_COLORS = ['#edbd76', '#ada7ef', '#9ed2ab', '#8fcfdf'];
export const DUNGEON_SHOP = [
  { id: 'supplies', name: '공격대 보급 상자', cost: 3, items: { potion: 8, mana: 8 } },
  { id: 'forge', name: '태양흔 재료 상자', cost: 4, items: { sunscar_crystal: 8, ore: 8 } },
  { id: 'grove', name: '거목 재료 상자', cost: 6, items: { wildroot_crystal: 8, relic_dust: 8 } },
  { id: 'void', name: '경계 재료 상자', cost: 8, items: { voidfront_crystal: 8, world_token: 2 } }
];
export const dungeonDay = now => new Date(now + 9 * 3600000).toISOString().slice(0, 10);

export function installDungeons({ ZONES, MONSTERS, ITEMS }) {
  for (const d of DUNGEONS) ZONES[d.zone] = { id: d.zone, name: d.name, subtitle: d.subtitle, minLevel: d.level,
    width: 44, height: 34, theme: d.id === 'concord_forge' ? 'volcano' : d.id === 'moon_quarry' ? 'frost' : d.id === 'memory_archive' ? 'ruins' : 'abyss', color: d.color,
    spawn: [22, 28], weather: d.id === 'concord_forge' ? 'embers' : 'stars', music: 'ruins', dungeon: true, dungeonId: d.id, mobTypes: [], mobCount: 0 };
  for (const d of DUNGEONS) MONSTERS[d.boss] = { ...MONSTERS[d.skin], name: d.bossName, sprite: d.skin, skin: d.skin,
    level: d.level, hp: 1, atk: 1, def: 1, xp: 0, gold: [0, 0], material: 'ore', boss: true, dungeonBoss: true, worldBoss: false, pattern: 'dungeon' };
  MONSTERS.dungeon_echo = { ...MONSTERS.wisp, name: '흩어진 기억의 잔영', sprite: 'wisp', skin: 'wisp', xp: 0, gold: [0, 0], material: 'ore', boss: false };
  MONSTERS.dungeon_cinder = { ...MONSTERS.golem, name: '굴러가는 화로 파편', sprite: 'golem', skin: 'golem', xp: 0, gold: [0, 0], material: 'ore', boss: false };
  MONSTERS.dungeon_satellite = { ...MONSTERS.wisp, name: '궤도를 잃은 관측 위성', sprite: 'wisp', skin: 'wisp', xp: 0, gold: [0, 0], material: 'ore', boss: false };
  for (const [index, d] of DUNGEONS.entries()) ITEMS[d.reward] = { name: ['광산의 첫 공명석', '쌍월의 공명 목걸이', '잊지 않는 서고의 약속', '낙성을 묶는 서약'][index],
    type: 'gear', slot: 'charm', icon: 'charm', rarity: d.level <= 25 ? 'epic' : 'legendary', level: d.level, hp: 130 + d.level * 6,
    atk: Math.round(12 + d.level * 1.05), mp: 45 + d.level * 2, crit: d.id === 'moon_quarry' ? 4 : 6 + (index - 1) * 2,
    sell: 0, visualTheme: d.theme, visualSet: d.id, visualBase: 'relic_charm', desc: `${d.name} 첫 완주 보상. 파티의 협력을 기억하는 성물입니다.` };
}

const bounded = (n, max = 1000000000) => Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
const cleanReturn = p => p && typeof p.zone === 'string' && ![...DUNGEON_ZONE_IDS, 'challenge_arena'].includes(p.zone) && Number.isFinite(p.x) && Number.isFinite(p.y)
  ? { zone: p.zone.slice(0, 100), x: bounded(p.x, 100000), y: bounded(p.y, 100000), hp: Math.max(1, bounded(p.hp)), mp: bounded(p.mp) } : null;
export function prepareDungeons(p, { recover = false } = {}) {
  const old = p.dungeons && typeof p.dungeons === 'object' ? p.dungeons : {}, records = {}, daily = {};
  for (const d of DUNGEONS) {
    const r = old.records?.[d.id];
    if (r && typeof r === 'object') records[d.id] = { clears: bounded(r.clears), attempts: bounded(r.attempts), wipes: bounded(r.wipes), bestMs: bounded(r.bestMs), firstAt: bounded(r.firstAt, 9000000000000) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(old.daily?.[d.id])) daily[d.id] = old.daily[d.id];
  }
  const result = old.lastResult;
  p.dungeons = { version: 1, tokens: bounded(old.tokens, 1000000), records, daily,
    claims: [...new Set(Array.isArray(old.claims) ? old.claims : [])].filter(id => Object.hasOwn(DUNGEON_BY_ID, id)), returnPoint: cleanReturn(old.returnPoint),
    lastResult: result && Object.hasOwn(DUNGEON_BY_ID, result.dungeon) ? { dungeon: result.dungeon, won: result.won === true,
      reason: String(result.reason || '').slice(0, 240), elapsed: bounded(result.elapsed), attempt: bounded(result.attempt), tokens: bounded(result.tokens),
      gold: bounded(result.gold), xp: bounded(result.xp), at: bounded(result.at, 9000000000000), item: result.item === DUNGEON_BY_ID[result.dungeon].reward ? result.item : null } : null };
  if (recover) {
    p.dungeonRun = null;
    if (DUNGEON_ZONE_IDS.includes(p.zone)) {
      const back = p.dungeons.returnPoint || { zone: 'town', x: 784, y: 688, hp: Math.max(1, p.hp || 1), mp: p.mp || 0 };
      p.zone = back.zone; p.x = back.x; p.y = back.y; p.hp = back.hp; p.mp = back.mp;
    }
    p.dungeons.returnPoint = null;
  }
  return p.dungeons;
}
