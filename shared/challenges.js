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
    summary: '30층마다 달라지는 적·파수꾼·회전 관문을 통과하며, 급박한 제어 장치를 해결하세요.',
    rules: [
      '층별 90초 안에 적을 처치하세요. 4·8·12·16·24·28층은 몬스터를 처치해도 끝나지 않으며 3개 관문을 순서대로 열어야 합니다.',
      '5·10·15·20·25층을 완료하면 그 다음 층부터 다시 도전할 수 있습니다.',
      '관문에 실수하면 전격 함정이 터지며 순서가 초기화됩니다. 제시간에 해결하지 못하면 실패합니다. 보스층에는 광역 패턴이 있습니다.'
    ],
    title: '서른 밤을 밝힌 자'
  },
  {
    id: 'runes', name: '기억의 발자국', icon: '◆', level: 20, duration: '150초 · 3방 · 회전·시간 닻·반전',
    summary: '암기를 넘어 문양 회전, 시간 닻 릴레이, 좌우 반전 추리와 전투를 섞은 세 방의 시험.',
    rules: [
      '1관문: 문양 순서를 기억하고 발판을 이동하며 광선을 피하세요.',
      '2관문: 두 파수꾼을 쓰러뜨린 뒤 숫자를 +1 회전해 입력합니다. 3관문: 세 파수꾼 처치 → 9초 동안 왼쪽·오른쪽 시간 닻 연속 작동 → 순서를 뒤집고 좌우 반전해 입력합니다.',
      '오답 3회·사망·시간 초과면 실패. 마지막 관문에서는 광선 주기가 더 짧고 오답 시 시간이 3초씩 추가 감소합니다.'
    ],
    title: '잊지 않는 발걸음'
  },
  {
    id: 'survival', name: '황혼의 생존전', icon: '◷', level: 30, duration: '3분 · 18마리 이상 처치',
    summary: '지대가 이동하는 전장에서 3개의 불씨를 정해진 시간에 점화하며 18마리를 처치하고 생존하세요.',
    rules: [
      '18초마다 새로운 적이 합류합니다. 3분 동안 생존하고 적 18마리 이상을 처치하세요.',
      '안전지대는 1분마다 크기가 줄며 다른 위치로 이동합니다. 불씨는 45·101·147초에 등장하며 20초 안에 직접 이동해 작동해야 합니다.',
      '18마리 이상 처치·3개 불씨 점화·3분 생존의 세 조건을 모두 채워야 승리합니다. 불씨 점화에 실패하면 즉시 종료됩니다.'
    ],
    title: '황혼을 건넌 자'
  },
  {
    id: 'boss_rush', name: '세 수호자의 시험', icon: '♜', level: 45, duration: '8분 · 보스 3연전',
    summary: '봉인 해제, 보호진 이동, 소환수 차단을 읽어 세 보스를 연속으로 돌파하세요.',
    rules: [
      '첫 수호자는 두 봉인을 작동해야 피해를 받습니다. 체력이 줄면 한 번 더 봉인됩니다.',
      '두 번째 수호자는 달빛 갑옷에 보호됩니다. 초록 보호진에서 파동을 반사해야 갑옷이 깨지며, 체력 50% 때 한 번 더 반복합니다.',
      '마지막 수호자가 힘을 모으면 소환된 방해꾼 둘을 먼저 쓰러뜨리세요. 8초 뒤 폭발합니다.'
    ],
    title: '세 맹세의 증인'
  },
  {
    id: 'defense', name: '새벽의 심장 수호전', icon: '❖', level: 60, duration: '8분 · 공세 5회',
    summary: '적을 막으면서 보급의 빛으로 수리·보호막·좌우 자동 포탑을 선택해 요새를 운영하세요.',
    rules: [
      '적은 중앙 수정을 공격합니다. 가까이에서 공격하면 잠시 적의 시선을 끌 수 있습니다.',
      '적을 처치하면 빛 1개를 얻습니다. 수정 근처에서 상호작용하면 빛 3개로 18%를 수리합니다.',
      '빛 4·6·9개로 각 포탑을 설치·강화할 수 있습니다. 포탑은 근처 적을 자동 공격합니다. 5차 공세까지 지켜내세요.'
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
