/* FUSEWILD: Element Relay. Shared by browser and server; no third-party game code. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FusewildRelay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const POWER_BONUS = 0.20;
  const BREAK_BONUS = 8;
  function normalize(value) {
    const raw = Array.isArray(value?.elements) ? value.elements : [];
    const elements = [...new Set(raw.filter(e => typeof e === 'string' && e.length > 0 && e.length <= 24))].slice(-2);
    const n = Number(value?.activations);
    return { elements, activations: Number.isFinite(n) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(n))) : 0 };
  }
  function preview(value, element, kind = 'attack') {
    const state = normalize(value);
    const eligible = ['attack', 'burst'].includes(kind) && typeof element === 'string' && element.length > 0 && element.length <= 24;
    const repeats = eligible && state.elements.includes(element);
    const burst = eligible && !repeats && state.elements.length === 2;
    return { eligible, repeats, burst, count: state.elements.length,
      powerBonus: burst ? POWER_BONUS : 0, breakBonus: burst ? BREAK_BONUS : 0 };
  }
  function advance(value, element, { hit = true, kind = 'attack' } = {}) {
    const before = normalize(value);
    const next = preview(before, element, kind);
    if (!hit || !next.eligible) return { state: before, burst: false, powerBonus: 0, breakBonus: 0, sequence: before.elements };
    const sequence = next.repeats ? [element] : [...before.elements, element];
    return {
      state: { elements: next.burst ? [] : sequence, activations: before.activations + (next.burst ? 1 : 0) },
      burst: next.burst, powerBonus: next.powerBonus, breakBonus: next.breakBonus, sequence
    };
  }
  return Object.freeze({ POWER_BONUS, BREAK_BONUS, normalize, preview, advance });
});
