import { CHALLENGE_ZONES, CHALLENGE_ZONE } from './challenges.js';

// An unobstructed practice arena, shared as geometry only. All encounter entities
// and interactions are private to their owner on the authoritative server.
export function buildChallengeMap(id = CHALLENGE_ZONE, zone = CHALLENGE_ZONES[CHALLENGE_ZONE]) {
  const w = zone.width, h = zone.height, tiles = new Uint8Array(w * h), blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wall = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
    tiles[y * w + x] = wall ? 2 : 1; blocked[y * w + x] = wall ? 1 : 0;
  }
  return {
    id, w, h, width: w * 32, height: h * 32, tiles, blocked,
    props: [], resources: [], chests: [], portals: [], npcs: [], relics: [], storyPoints: [],
    challengeArena: { x: w * 16, y: h * 16 }
  };
}
