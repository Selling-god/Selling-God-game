/** Ordinary-field monster cooldowns. Slower return window, 80-120 seconds instead of the former 45-70s.
 * Boss scripts, dungeon summons and hourly world events intentionally use their
 * own lifecycle; only normal field deaths call this helper.
 */
export const MOB_RESPAWN_MIN_MS = 80_000;
export const MOB_RESPAWN_VARIATION_MS = 40_000;
export const FIELD_BOSS_RESPAWN_MS = 300_000;
export const REALM_BOSS_RESPAWN_MS = 225_000;

export function fieldRespawnDelay(spec, random = Math.random) {
  if (spec?.boss) return FIELD_BOSS_RESPAWN_MS;
  const value = Number(random());
  return MOB_RESPAWN_MIN_MS + Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5)) * MOB_RESPAWN_VARIATION_MS;
}
