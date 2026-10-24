export const DUNGEON_ZONE = 'party_dungeon';
export const DUNGEON_RULES = { minMembers: 2, maxMembers: 4, readyMs: 90000, reconnectMs: 30000, reviveMs: 3000, revives: 2 };
export const DUNGEONS = [
  {
    id: 'concord_forge', name: '쌍월의 용광로', level: 35, entryZone: 'sunscar', minutes: 12,
    boss: 'dungeon_arke', bossName: '쌍극의 감시자 · 아르케', skin: 'moss_guardian', color: '#e6b976', theme: 'fire',
    subtitle: '서로 다른 빛이 동시에 도착해야 문이 열린다.', reward: 'concord_pendant',
    mechanics: [
      '머리 위 해·달 표식에 맞는 발판으로 모두 이동해 2초 동안 함께 유지합니다.',
      '해 표식은 해 기둥, 달 표식은 달 기둥을 돌려 표시된 방향과 맞춥니다.',
      '보스 체력 70%·35%에서 표식과 배치가 바뀝니다. 파동을 피하며 다시 공명을 만드세요.'
    ],
    title: '두 빛을 잇는 자'
  },
  {
    id: 'memory_archive', name: '뒤집힌 기억의 서고', level: 80, entryZone: 'wildroot', minutes: 14,
    boss: 'dungeon_neme', bossName: '기록을 삼킨 사서 · 네메', skin: 'moon_witch', color: '#b5a9ed', theme: 'time',
    subtitle: '기억하는 사람과 행동하는 사람이 서로를 믿는 곳.', reward: 'archive_pendant',
    mechanics: [
      '잠깐 공개되는 3·4·5개 문양 순서를 기억합니다. 지정된 파티원이 순서대로 장치를 작동해야 합니다.',
      '유도자는 빛의 프리즘 뒤로 이동하고 나머지는 기록 고정진을 지켜 광선을 차단합니다.',
      '체력이 줄수록 순서가 길어지고 유도 시간이 짧아집니다. 교차 광선의 예고를 확인하세요.'
    ],
    title: '서로의 기억을 지킨 자'
  },
  {
    id: 'fallen_observatory', name: '낙성의 심연', level: 140, entryZone: 'voidfront', minutes: 15,
    boss: 'dungeon_astra', bossName: '별을 끌어내리는 자 · 아스트라', skin: 'eclipse_dragon', color: '#e09db8', theme: 'void',
    subtitle: '혼자 별을 유도하고, 함께 붕괴를 멈춘다.', reward: 'starbound_pendant',
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
  ZONES[DUNGEON_ZONE] = { id: DUNGEON_ZONE, name: '별의 계약 · 파티 던전', subtitle: '함께 돌아올 길을 남기다', minLevel: 35,
    width: 44, height: 34, theme: 'ruins', color: '#bbaddd', spawn: [22, 28], weather: 'stars', music: 'ruins', dungeon: true, mobTypes: [], mobCount: 0 };
  for (const d of DUNGEONS) MONSTERS[d.boss] = { ...MONSTERS[d.skin], name: d.bossName, sprite: d.skin, skin: d.skin,
    level: d.level, hp: 1, atk: 1, def: 1, xp: 0, gold: [0, 0], material: 'ore', boss: true, dungeonBoss: true, worldBoss: false, pattern: 'dungeon' };
  MONSTERS.dungeon_echo = { ...MONSTERS.wisp, name: '흩어진 기억의 잔영', sprite: 'wisp', skin: 'wisp', xp: 0, gold: [0, 0], material: 'ore', boss: false };
  for (const [index, d] of DUNGEONS.entries()) ITEMS[d.reward] = { name: ['쌍월의 공명 목걸이', '잊지 않는 서고의 약속', '낙성을 묶는 서약'][index],
    type: 'gear', slot: 'charm', icon: 'charm', rarity: 'legendary', level: d.level, hp: 130 + d.level * 6,
    atk: Math.round(12 + d.level * 1.05), mp: 45 + d.level * 2, crit: 6 + index * 2,
    sell: 0, visualTheme: d.theme, visualSet: d.id, visualBase: 'relic_charm', desc: `${d.name} 첫 완주 보상. 파티의 협력을 기억하는 성물입니다.` };
}

const bounded = (n, max = 1000000000) => Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
const cleanReturn = p => p && typeof p.zone === 'string' && ![DUNGEON_ZONE, 'challenge_arena'].includes(p.zone) && Number.isFinite(p.x) && Number.isFinite(p.y)
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
    if (p.zone === DUNGEON_ZONE) {
      const back = p.dungeons.returnPoint || { zone: 'town', x: 784, y: 688, hp: Math.max(1, p.hp || 1), mp: p.mp || 0 };
      p.zone = back.zone; p.x = back.x; p.y = back.y; p.hp = back.hp; p.mp = back.mp;
    }
    p.dungeons.returnPoint = null;
  }
  return p.dungeons;
}
