// Challenge definitions contain no server state. Progress and rewards are checked
// by ChallengeManager; the client only uses this catalog to explain the rules.
export const CHALLENGE_ZONE = 'challenge_arena';
export const CHALLENGE_ZONES = {
  [CHALLENGE_ZONE]: {
    id: CHALLENGE_ZONE, name: '별의 회랑', subtitle: '다섯 가지 방식으로 남기는 나의 기록',
    minLevel: 15, width: 36, height: 28, theme: 'ruins', color: '#c4b5f3',
    spawn: [18, 21], weather: 'stars', music: 'ruins', challenge: true,
    mobTypes: [], mobCount: 0
  }
};

export const CHALLENGE_TIERS = [
  { id: 0, name: '도전', level: 0, scale: 1, color: '#92d4bb' },
  { id: 1, name: '숙련', level: 80, scale: 1.3, color: '#9dbcf6' },
  { id: 2, name: '초월', level: 160, scale: 1.65, color: '#d7b3f5' }
];

export const CHALLENGES = [
  {
    id: 'tower', name: '서른 밤의 탑', icon: '▲', level: 15, duration: '층당 90초 · 30층',
    summary: '매 층의 적을 쓰러뜨리고, 다섯 층마다 기다리는 파수꾼을 돌파하세요.',
    rules: [
      '층별 제한 시간 안에 모든 적을 처치하면 다음 층이 열립니다.',
      '5·10·15·20·25층을 완료하면 그 다음 층부터 다시 도전할 수 있습니다.',
      '높은 층일수록 적과 바닥 기믹이 강해집니다. 30층 파수꾼을 쓰러뜨리면 완주입니다.'
    ],
    title: '서른 밤을 밝힌 자'
  },
  {
    id: 'runes', name: '기억의 발자국', icon: '◆', level: 20, duration: '150초 · 기억 시험 3회',
    summary: '광선을 피하며 문양을 기억하고, 파수꾼을 뚫어 마지막에는 역순으로 봉인을 풉니다.',
    rules: [
      '1관문: 문양 순서를 기억하고 발판을 이동하며 광선을 피하세요.',
      '2관문: 봉인 파수꾼 2명을 먼저 잡고 4개 문양을 입력합니다. 3관문: 파수꾼 3명을 잡은 뒤 5개 문양을 역순으로 누릅니다.',
      '오답 3회·사망·시간 초과면 실패. 마지막 관문에서는 광선 주기가 더 짧고 오답 시 시간이 3초씩 추가 감소합니다.'
    ],
    title: '잊지 않는 발걸음'
  },
  {
    id: 'survival', name: '황혼의 생존전', icon: '◷', level: 30, duration: '3분 · 18마리 이상 처치',
    summary: '몰려오는 적과 좁아지는 안전지대 사이에서 살아남으세요.',
    rules: [
      '18초마다 새로운 적이 합류합니다. 3분 동안 생존하고 적 18마리 이상을 처치하세요.',
      '1분마다 안전지대가 좁아집니다. 바깥의 붉은 고리는 주기적으로 피해를 줍니다.',
      '적을 3마리 처치할 때마다 체력을 조금 회복합니다. 처치 수가 최고 기록으로 남습니다.'
    ],
    title: '황혼을 건넌 자'
  },
  {
    id: 'boss_rush', name: '세 수호자의 시험', icon: '♜', level: 45, duration: '8분 · 보스 3연전',
    summary: '봉인 해제, 보호진 이동, 소환수 차단을 읽어 세 보스를 연속으로 돌파하세요.',
    rules: [
      '첫 수호자는 두 봉인을 작동해야 피해를 받습니다. 체력이 줄면 한 번 더 봉인됩니다.',
      '두 번째 수호자의 광역 파동은 초록 보호진 안으로 들어가 피하세요.',
      '마지막 수호자가 힘을 모으면 소환된 방해꾼 둘을 먼저 쓰러뜨리세요. 8초 뒤 폭발합니다.'
    ],
    title: '세 맹세의 증인'
  },
  {
    id: 'defense', name: '새벽의 심장 수호전', icon: '❖', level: 60, duration: '8분 · 공세 5회',
    summary: '중앙 수정을 향해 오는 적을 저지하고, 처치로 얻은 빛으로 수정을 수리하세요.',
    rules: [
      '적은 중앙 수정을 공격합니다. 가까이에서 공격하면 잠시 적의 시선을 끌 수 있습니다.',
      '적을 처치하면 빛 1개를 얻습니다. 수정 근처에서 상호작용하면 빛 3개로 18%를 수리합니다.',
      '빛 5개로 6초 보호막을 펼칠 수 있습니다. 수정이 남은 채 5차 공세를 모두 막으면 승리합니다.'
    ],
    title: '새벽을 지킨 손'
  }
];
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));
export const RUNE_NAMES = ['해', '달', '잎', '별'];
export const RUNE_COLORS = ['#f1be77', '#b9a2f4', '#9dd2ac', '#8fcce7'];
export const CHALLENGE_SHOP = [
  { id: 'supplies', name: '모험 보급품', cost: 3, items: { potion: 5, mana: 5 }, desc: '체력 물약 5개 · 마나 물약 5개' },
  { id: 'forge', name: '대장간 꾸러미', cost: 5, items: { ore: 12, relic_dust: 5 }, desc: '달철 광석 12개 · 기억의 가루 5개' },
  { id: 'pilgrim', name: '길손의 약속', cost: 8, items: { wayfarer_seal: 8 }, desc: '길손의 증표 8개' },
  { id: 'giant', name: '거인의 잔향', cost: 12, items: { world_token: 2 }, desc: '거인의 인장 2개' }
];
export const challengeKey = (id, tier = 0) => `${id}:${tier}`;
export const challengeGate = (id, tier = 0) => Math.max(CHALLENGE_BY_ID[id]?.level || 999, CHALLENGE_TIERS[tier]?.level || 0);
export const challengeDay = now => new Date(now + 9 * 3600000).toISOString().slice(0, 10);

const bounded = (v, min = 0, max = 1000000000) => Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : min;
const recordKeys = new Set(CHALLENGES.flatMap(c => CHALLENGE_TIERS.map(t => challengeKey(c.id, t.id))));
const claimKeys = new Set([...recordKeys, ...CHALLENGE_TIERS.flatMap(t => [5, 10, 15, 20, 25].map(f => `tower:${t.id}:floor:${f}`))]);
const cleanReturn = r => r && typeof r.zone === 'string' && r.zone !== CHALLENGE_ZONE && Number.isFinite(r.x) && Number.isFinite(r.y)
  ? { zone: r.zone.slice(0, 100), x: bounded(r.x, 0, 100000), y: bounded(r.y, 0, 100000), hp: bounded(r.hp, 1), mp: bounded(r.mp) }
  : null;

/** Safe old-save migration. Active arenas never resume after a disconnect/restart. */
export function prepareChallenges(p, { recover = false } = {}) {
  const old = p.challenges && typeof p.challenges === 'object' ? p.challenges : {};
  const records = {};
  for (const [key, value] of Object.entries(old.records || {})) {
    if (!recordKeys.has(key) || !value || typeof value !== 'object') continue;
    records[key] = {
      clears: bounded(value.clears), bestMs: bounded(value.bestMs), bestScore: bounded(value.bestScore),
      bestFloor: bounded(value.bestFloor, 0, 30), checkpoint: Math.min(25, Math.floor(Math.min(bounded(value.checkpoint, 0, 30), bounded(value.bestFloor, 0, 30)) / 5) * 5),
      firstClearAt: bounded(value.firstClearAt, 0, 9000000000000)
    };
  }
  const daily = {};
  for (const [key, value] of Object.entries(old.daily || {})) if (recordKeys.has(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) daily[key] = value;
  const result = old.lastResult;
  p.challenges = {
    version: 1, tokens: bounded(old.tokens, 0, 1000000), records,
    claims: [...new Set(Array.isArray(old.claims) ? old.claims : [])].filter(k => claimKeys.has(k)), daily,
    returnPoint: cleanReturn(old.returnPoint),
    lastResult: result && CHALLENGE_BY_ID[result.mode] ? {
      mode: result.mode, tier: bounded(result.tier, 0, 2), won: result.won === true,
      reason: String(result.reason || '').slice(0, 180), elapsed: bounded(result.elapsed), score: bounded(result.score),
      tokens: bounded(result.tokens), gold: bounded(result.gold), xp: bounded(result.xp), at: bounded(result.at, 0, 9000000000000)
    } : null
  };
  if (recover) {
    p.challengeRun = null;
    if (p.zone === CHALLENGE_ZONE) {
      const back = p.challenges.returnPoint || { zone: 'town', x: 24 * 32 + 16, y: 21 * 32 + 16, hp: Math.max(1, p.hp || 1), mp: p.mp || 0 };
      p.zone = back.zone; p.x = back.x; p.y = back.y; p.hp = back.hp; p.mp = back.mp;
    }
    p.challenges.returnPoint = null;
  }
  return p.challenges;
}
