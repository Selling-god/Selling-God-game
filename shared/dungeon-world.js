import { DUNGEONS, DUNGEON_ZONE } from './dungeons.js';

export function buildDungeonMap(id = DUNGEON_ZONE, zone = { width: 44, height: 34 }) {
  const w = zone.width, h = zone.height, tiles = new Uint8Array(w * h), blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x < 3 || y < 3 || x >= w - 3 || y >= h - 3;
    tiles[y * w + x] = edge ? 2 : Math.abs(x - w / 2) < 2 || Math.abs(y - h / 2) < 2 ? 1 : 0;
    blocked[y * w + x] = edge ? 1 : 0;
  }
  return { id, w, h, width: w * 32, height: h * 32, tiles, blocked, props: [], resources: [], chests: [], portals: [], npcs: [], relics: [], storyPoints: [],
    dungeonArena: { x: w * 16, y: h * 16 } };
}

/** Place an actual entrance beside the existing region spawn, without blocking it. */
export function decorateDungeonEntrance(map, zone) {
  const dungeon = DUNGEONS.find(d => d.entryZone === map.id); if (!dungeon || map.dungeonEntrance) return map;
  const sx = zone?.spawn?.[0] ?? Math.floor(map.w / 2), sy = zone?.spawn?.[1] ?? map.h - 7;
  let point = null;
  for (let radius = 0; radius < 8 && !point; radius++) for (let dy = -radius; dy <= radius && !point; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const x = sx + 3 + dx, y = sy - 1 + dy;
    if (x < 2 || y < 2 || x >= map.w - 2 || y >= map.h - 2) continue;
    if ([[-1, 0], [0, 0], [1, 0], [0, -1], [0, 1]].every(([ox, oy]) => !map.blocked[(y + oy) * map.w + x + ox])) {
      point = { x: x * 32 + 16, y: y * 32 + 16 }; break;
    }
  }
  if (!point) return map;
  const gate = { id: `dungeon_gate_${dungeon.id}`, kind: 'dungeonGate', dungeon: dungeon.id, zone: map.id, name: dungeon.name + ' · 파티 입구',
    level: dungeon.level, sprite: 'altar', text: '2~4명의 파티가 함께 준비한 뒤 들어가는 던전입니다.', ...point };
  map.dungeonEntrance = gate; map.storyPoints ||= []; map.storyPoints.push(gate);
  return map;
}
