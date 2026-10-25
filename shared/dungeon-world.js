import { DUNGEONS, DUNGEON_ZONE } from './dungeons.js';

// The same surface ids are used by the shared terrain renderer. Keeping this
// builder content-independent avoids the content -> map -> content cycle.
const S = { GROUND: 0, PATH: 1, WATER: 2, WALL: 3, BRIDGE: 4, STAIRS: 5, LAVA: 6, VOID: 7, ICE: 8 };

/** Three separate, authoritative collision maps; decorations never substitute for terrain. */
export function buildDungeonMap(id = DUNGEON_ZONE, zone = { width: 44, height: 34 }) {
  const w = zone.width, h = zone.height, tiles = new Uint8Array(w * h), blocked = new Uint8Array(w * h).fill(1);
  const surface = new Uint8Array(w * h), elevation = new Uint8Array(w * h), features = [];
  const def = DUNGEONS.find(d => d.zone === id) || DUNGEONS[0];
  const forge = def.id === 'concord_forge' || def.id === 'moon_quarry', archive = def.id === 'memory_archive', quarry = def.id === 'moon_quarry';
  surface.fill(quarry ? S.WATER : forge ? S.LAVA : archive ? S.WALL : S.VOID); tiles.fill(2);
  const paint = (x, y, width, height, kind = S.GROUND, level = 2, name = '', feature = 'room') => {
    for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) {
      if (xx < 3 || yy < 3 || xx >= w - 3 || yy >= h - 3) continue;
      const at = yy * w + xx, wall = [S.WALL, S.WATER, S.LAVA, S.VOID].includes(kind);
      surface[at] = kind; elevation[at] = wall ? 0 : level; blocked[at] = +wall;
      tiles[at] = wall ? 2 : [S.PATH, S.BRIDGE, S.STAIRS].includes(kind) ? 1 : 0;
    }
    if (name) features.push({ kind: feature, name, x, y, w: width, h: height });
  };
  if (forge) {
    paint(7, 9, 10, 14, S.GROUND, 3, '해의 제련대', 'terrace');
    paint(19, 5, 6, 25, S.GROUND, 2, '중앙 주조대', 'terrace');
    paint(27, 9, 11, 14, S.GROUND, 3, '달의 제련대', 'terrace');
    paint(16, 16, 13, 4, S.BRIDGE, 2, '용암 수로의 주 다리', 'bridge');
    paint(16, 11, 13, 3, S.BRIDGE, 2, '상단 냉각 다리', 'bridge');
    paint(16, 21, 13, 3, S.BRIDGE, 2, '하단 우회 다리', 'bridge');
    paint(16, 16, 2, 4, S.STAIRS, 2, '해의 계단', 'stairs');
    paint(26, 16, 2, 4, S.STAIRS, 2, '달의 계단', 'stairs');
    paint(10, 10, 3, 3, S.WALL, 0, '좌측 제련기', 'furnace');
    paint(32, 19, 3, 3, S.WALL, 0, '우측 제련기', 'furnace');
    paint(9, 20, 3, 2, S.WALL, 0, '광석 압축기', 'furnace');
    paint(33, 10, 3, 2, S.WALL, 0, '식은 주형', 'furnace');
    if(quarry){
      // Echo mine has tangible crystal columns and a second route, not a lava
      // arena with a different color. Keep the cooperative plates reachable.
      paint(7, 9, 3, 4, S.WALL, 0, '서쪽 수정 기둥', 'crystal');
      paint(34, 20, 3, 3, S.WALL, 0, '동쪽 수정 기둥', 'crystal');
      paint(17, 24, 11, 3, S.BRIDGE, 2, '숨겨진 광산 우회로', 'bridge');
    }
  } else if (archive) {
    paint(16, 11, 13, 10, S.GROUND, 2, '중앙 광선실', 'room');
    paint(18, 6, 8, 5, S.GROUND, 3, '해의 기록실', 'room');
    paint(28, 14, 7, 10, S.GROUND, 2, '달의 기록실', 'room');
    paint(18, 25, 8, 5, S.GROUND, 1, '잎의 기록실', 'room');
    paint(10, 14, 7, 10, S.GROUND, 2, '별의 기록실', 'room');
    paint(20, 10, 5, 3, S.STAIRS, 2, '북쪽 문턱', 'stairs');
    paint(14, 18, 7, 3, S.PATH, 2, '서쪽 꺾인 회랑', 'corridor');
    paint(26, 17, 5, 4, S.PATH, 2, '동쪽 광선 회랑', 'corridor');
    paint(23, 20, 6, 4, S.PATH, 2, '남동쪽 우회 회랑', 'corridor');
    paint(20, 23, 6, 4, S.STAIRS, 1, '아래 기록실 계단', 'stairs');
    paint(14, 21, 7, 3, S.PATH, 2, '서쪽 기록 고정진 통로', 'corridor');
    paint(10, 14, 2, 3, S.WALL, 0, '상단 봉인 서가', 'bookshelf');
    paint(19, 18, 2, 3, S.WALL, 0, '왼쪽 엄폐 서가', 'bookshelf');
    paint(24, 18, 2, 3, S.WALL, 0, '오른쪽 엄폐 서가', 'bookshelf');
    paint(11, 20, 2, 3, S.WALL, 0, '별의 고서 더미', 'bookshelf');
    paint(32, 15, 2, 3, S.WALL, 0, '달의 금서 서가', 'bookshelf');
    // A low optical channel carries the scripted prism ray through the north
    // of the room; the waist-high shelves below remain real combat cover.
    paint(26, 11, 3, 4, S.PATH, 2);
  } else {
    for (let y = 10; y <= 23; y++) for (let x = 15; x <= 28; x++)
      if (((x + .5 - 22) / 6.6) ** 2 + ((y + .5 - 17) / 6.6) ** 2 <= 1) paint(x, y, 1, 1, S.GROUND, 3);
    features.push({ kind: 'island', name: '중앙 중력핵', x: 16, y: 11, w: 12, h: 12 });
    paint(19, 5, 6, 6, S.GROUND, 2, '북쪽 관측섬', 'island');
    paint(29, 14, 8, 7, S.GROUND, 1, '동쪽 유성섬', 'island');
    paint(19, 24, 7, 7, S.GROUND, 1, '남쪽 귀환섬', 'island');
    paint(8, 14, 8, 7, S.GROUND, 2, '서쪽 봉인섬', 'island');
    paint(21, 10, 2, 4, S.BRIDGE, 2, '북쪽 가교', 'bridge');
    paint(27, 16, 4, 3, S.BRIDGE, 2, '동쪽 가교', 'bridge');
    paint(21, 21, 3, 5, S.STAIRS, 2, '남쪽 하강교', 'stairs');
    paint(14, 16, 4, 3, S.BRIDGE, 2, '서쪽 가교', 'bridge');
    paint(24, 8, 10, 2, S.BRIDGE, 1, '북동쪽 외곽교', 'bridge');
    paint(32, 8, 2, 8, S.BRIDGE, 1);
    paint(11, 20, 2, 6, S.BRIDGE, 1, '남서쪽 외곽교', 'bridge');
    paint(11, 24, 11, 2, S.BRIDGE, 1);
    // The assigned conduits stand on widened bridgeheads, not in the void.
    paint(15, 14, 3, 3, S.STAIRS, 2, '서쪽 차단 교두보', 'stairs');
    paint(26, 14, 3, 3, S.STAIRS, 2, '동쪽 차단 교두보', 'stairs');
  }
  // Every entry configuration has room for four characters and an exit step.
  paint(20, 27, 5, 3, forge ? S.PATH : S.GROUND, forge ? 2 : 1);
  const map = { id, w, h, width: w * 32, height: h * 32, tiles, blocked, props: [], resources: [], chests: [], portals: [], npcs: [], relics: [], storyPoints: [],
    terrain: { id: def.id, name: def.name, style: quarry ? 'quarry' : forge ? 'forge' : archive ? 'archive' : 'observatory', surface, elevation, features },
    dungeonArena: { x: 704, y: 544 }, dungeonId: def.id };
  return map;
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
