import {
  CHALLENGES, CHALLENGE_BY_ID, CHALLENGE_TIERS, CHALLENGE_SHOP, challengeKey, challengeGate
} from '../shared/challenges.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ko-KR');
const time = ms => { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const fallbackKey = (_id, value = '미지정') => value;
const button = (label, act, id = '', attributes = '') => `<button type="button" class="btn small" data-act="${act}" data-id="${esc(id)}" ${attributes}>${label}</button>`;
const meter = (value, max, label) => `<div class="story-meter" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.max(0, Math.round(value))}"><i style="width:${Math.max(0, Math.min(100, value / max * 100))}%"></i></div>`;

function recordText(mode, r) {
  if (!r) return '아직 남긴 기록이 없습니다.';
  const bits = [];
  if (mode === 'tower') bits.push(`최고 ${r.bestFloor || 0}층`);
  if (r.clears) bits.push(`${number(r.clears)}회 완주`);
  if (r.bestMs) bits.push(`최단 ${time(r.bestMs)}`);
  if (mode === 'survival' && r.bestScore) bits.push(`최고 ${number(r.bestScore)}마리`);
  if (mode === 'defense' && r.bestScore) bits.push(`수정 최대 ${Math.round(r.bestScore / 10)}% 보존`);
  if (mode === 'runes' && r.bestScore) bits.push(`최고 ${number(r.bestScore)}점`);
  return bits.length ? bits.join(' · ') : '완주 기록에 도전해 보세요.';
}

export function challengesPanel({ profile: p, state, now = Date.now(), keyLabel = fallbackKey }) {
  const progress = p?.challenges || {}, current = state?.challenge;
  let html = `<section class="challenge-intro info-box"><h3>나만의 기록, 다섯 가지 도전</h3>
    <p>탑을 오르고, 문양을 기억하고, 적의 공세를 버텨 보세요. 도전은 혼자만의 공간에서 진행되며 입장한 레벨에 맞춰 적이 강해집니다. 장비와 숙련으로 더 좋은 기록을 노릴 수 있습니다.</p>
    <p class="small">숙련 난이도 Lv.80 · 초월 난이도 Lv.160<br>도전 중에는 체력과 마나를 채워 드립니다. 종료하면 입장 전 수치로 돌아오며, 사용한 물약은 소비됩니다. 쓰러져도 경험치·골드 사망 손실은 없습니다.</p>
    <div class="challenge-wallet"><span>보유한 도전의 빛</span><strong>✦ ${number(progress.tokens)}</strong></div></section>`;
  if (current) html += `<section class="card challenge-current"><h3>진행 중인 도전</h3>${challengeHUD(current, now, { keyLabel })}<p class="small muted">메뉴를 열어도 도전 시간과 전투는 계속됩니다.</p></section>`;
  const result = progress.lastResult;
  if (result && CHALLENGE_BY_ID[result.mode]) html += `<section class="card challenge-result ${result.won ? 'cleared' : ''}">
    <span class="badge ${result.won ? 'good' : ''}">${result.won ? '완주' : '도전 종료'} · ${esc(CHALLENGE_TIERS[result.tier]?.name)}</span>
    <h3>${esc(CHALLENGE_BY_ID[result.mode].name)}</h3><p>${esc(result.reason)}</p>
    <p class="small">진행 시간 ${time(result.elapsed)}${result.won ? ` · 도전의 빛 +${number(result.tokens)} · ${number(result.gold)} G${result.xp ? ` · ${number(result.xp)} EXP` : ''}` : ''}</p></section>`;
  html += `<div class="challenge-grid">${CHALLENGES.map(mode => `<article class="card challenge-card">
    <div class="challenge-card-head"><span class="challenge-symbol" aria-hidden="true">${mode.icon}</span><div><span class="badge">Lv.${mode.level}부터</span><h3>${esc(mode.name)}</h3></div></div>
    <p>${esc(mode.summary)}</p><p class="small muted">${esc(mode.duration)}</p>
    <details class="challenge-rules"><summary>승리 조건과 공략</summary><ol>${mode.rules.map(rule => `<li>${esc(rule)}</li>`).join('')}</ol></details>
    <div class="challenge-tiers">${CHALLENGE_TIERS.map(tier => {
      const key = challengeKey(mode.id, tier.id), record = progress.records?.[key], gate = challengeGate(mode.id, tier.id);
      const locked = (p?.level || 1) < gate, disabled = locked || !!current;
      return `<div class="challenge-tier"><div><strong>${esc(tier.name)}</strong><span class="small muted"> · Lv.${gate}+</span>
        <p class="small">${esc(recordText(mode.id, record))}</p></div><div class="settings-actions">
        ${button(locked ? `Lv.${gate} 필요` : mode.id === 'tower' ? '1층부터 도전' : '도전 시작', 'challengeStart', mode.id, `data-tier="${tier.id}" ${disabled ? 'disabled' : ''}`)}
        ${mode.id === 'tower' && record?.checkpoint ? button(`${record.checkpoint + 1}층부터 이어가기`, 'challengeStart', mode.id, `data-tier="${tier.id}" data-checkpoint="true" ${disabled ? 'disabled' : ''}`) : ''}
        </div></div>`;
    }).join('')}</div></article>`).join('')}</div>`;
  html += `<section class="info-box challenge-rewards"><h3>기록은 계속, 보상은 차근차근</h3>
    <p>각 종목·난이도의 첫 완주에는 도전의 빛 8 / 16 / 24개와 골드, 입장 레벨 필요 경험치의 18%를 받습니다. 그 뒤 하루 첫 재완주에는 빛 2 / 4 / 6개와 골드를 받습니다. 하루 기준은 한국 시간 자정이며, 같은 날 추가 재도전은 기록만 갱신합니다.</p>
    <p class="small">탑의 5·10·15·20·25층 저장 지점을 처음 열면 추가 빛 2 / 4 / 6개를 받습니다. 저장 지점은 난이도마다 따로 기록됩니다. 탑의 최단 시간은 1층부터 완주한 기록만 비교합니다. 도전 몬스터는 일반 사냥 전리품과 경험치를 주지 않습니다.</p></section>
    <h3>도전의 빛 교환</h3><div class="challenge-shop">${CHALLENGE_SHOP.map(item => `<article class="card"><h4>${esc(item.name)}</h4><p class="small">${esc(item.desc)}</p>${button(`✦ ${item.cost}개로 교환`, 'challengeShop', item.id, current || (progress.tokens || 0) < item.cost ? 'disabled' : '')}</article>`).join('')}</div>`;
  return { title: '별의 회랑 · 도전 기록', eyebrow: 'FIVE TRIALS · YOUR OWN PACE', html };
}

/** Compact live HUD. Buttons use the same delegated handler as the modal. */
export function challengeHUD(challenge, now = Date.now(), { keyLabel = fallbackKey } = {}) {
  const c = challenge; if (!c) return '';
  const phase = c.phase === 'preparing' ? `시작까지 ${time(c.nextAt - now)}` : c.phase === 'rest' ? `다음 관문까지 ${time(c.nextAt - now)}` : `남은 시간 ${time(c.ends - now)}`;
  const stage = c.mode === 'tower' ? `${c.stage}/30층` : c.mode === 'defense' ? `${c.stage}/5차 공세` : c.mode === 'survival' ? `공세 ${c.stage} · 처치 ${c.kills}/18` : `${c.stage}/3 관문`;
  let html = `<div class="challenge-hud-heading"><div><span class="small muted">${esc(c.tierName)} 난이도</span><h3>${esc(c.name)}</h3></div><strong class="challenge-timer">${phase}</strong></div>
    <div class="challenge-hud-summary"><b>${stage}</b>${c.mode !== 'runes' ? `<span>남은 적 ${number(c.alive)}</span>` : `<span>실수 ${c.mistakes}/3</span>`}</div>
    <p class="challenge-hint">${esc(c.hint)}</p>`;
  if (c.mode === 'runes') {
    if (c.sequence) html += `<div class="challenge-sequence" aria-label="기억할 문양 순서">${c.sequence.map((rune, index) => `<span><small>${index + 1}</small>${esc(rune)}</span>`).join('<i aria-hidden="true">→</i>')}</div><p class="small">${time(c.peekUntil - now)} 뒤 순서가 사라집니다.</p>`;
    else if (c.runeGoal) html += `<p class="small">현재 순서 ${c.runeStep}/${c.runeGoal} · 함정에 맞으면 시간 −4초</p>`;
  }
  if (c.mode === 'defense') html += `<div class="challenge-crystal-status"><div class="objective"><span>수정 내구도</span><b>${Math.ceil(c.crystalHp / 10)}% · 빛 ${c.charge}</b></div>${meter(c.crystalHp, 1000, '수정 내구도')}
    ${c.wardUntil > now ? `<p class="small">수정 보호막 ${time(c.wardUntil - now)}</p>` : ''}</div>`;
  if (c.channelUntil > now) html += `<p class="challenge-urgent">붕괴까지 ${time(c.channelUntil - now)} · 방해꾼 둘을 처치하세요!</p>`;
  html += `<div class="settings-actions challenge-controls">`;
  if (c.mode === 'runes' || (c.mode === 'boss_rush' && c.stage === 1)) html += button(`장치 작동 · ${esc(keyLabel('interact', 'F'))}`, 'challengeInteract');
  if (c.mode === 'defense') {
    html += button(`수정 수리 · ${esc(keyLabel('interact', 'F'))} · 빛 3`, 'challengeInteract', 'crystal', c.charge < 3 || c.crystalHp >= 1000 ? 'disabled' : '');
    html += button(`6초 보호막 · 빛 5${c.wardReady > now ? ` · ${time(c.wardReady - now)}` : ''}`, 'challengeWard', '', c.charge < 5 || c.wardReady > now ? 'disabled' : '');
  }
  html += button('도전 나가기', 'challengeExit') + '</div>';
  return html;
}

/** Called with the renderer's world transform active, before casts and actors. */
export function drawChallengeOverlay(renderer, challenge, t) {
  if (!challenge?.markers?.length) return;
  const c = renderer.ctx; if (!c) return;
  c.save();
  for (const m of challenge.markers) {
    c.save(); c.translate(m.x, m.y);
    const pulse = .5 + Math.sin(t / 250) * .15;
    c.lineWidth = 2; c.strokeStyle = m.color; c.fillStyle = m.color;
    if (m.kind === 'boundary') {
      c.globalAlpha = .07; c.beginPath(); c.arc(0, 0, m.radius, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .7; c.setLineDash([12, 8]); c.beginPath(); c.arc(0, 0, m.radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    } else if (m.kind === 'crystal') {
      c.globalAlpha = .15; c.beginPath(); c.ellipse(0, 12, 52, 24, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(0, -42); c.lineTo(20, -13); c.lineTo(0, 14); c.lineTo(-20, -13); c.closePath(); c.fill();
      c.strokeStyle = '#e1fafb'; c.beginPath(); c.moveTo(0, -42); c.lineTo(0, 14); c.moveTo(-20, -13); c.lineTo(20, -13); c.stroke();
      if (m.shield) { c.strokeStyle = '#b7f5d9'; c.lineWidth = 4; c.beginPath(); c.arc(0, -8, 61 + pulse * 3, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = '#142831'; c.fillRect(-45, 27, 90, 8); c.fillStyle = m.hp < 300 ? '#ed9c8b' : '#a6e5ed'; c.fillRect(-44, 28, 88 * Math.max(0, m.hp / m.maxHp), 6);
    } else {
      const radius = m.radius || 42;
      c.globalAlpha = m.kind === 'safe' ? .2 : m.active ? .25 + pulse * .12 : .1;
      c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill();
      c.globalAlpha = m.active || m.kind === 'safe' ? 1 : .6; c.lineWidth = m.kind === 'safe' ? 4 : 2;
      c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, -radius * .66); c.lineTo(radius * .66, 0); c.lineTo(0, radius * .66); c.lineTo(-radius * .66, 0); c.closePath(); c.stroke();
    }
    c.restore();
    const y = m.kind === 'boundary' ? m.y - m.radius + 22 : m.kind === 'crystal' ? m.y - 59 : m.y - (m.radius || 42) - 13;
    renderer.label?.(m.label, m.x, y, m.color, m.kind === 'boundary' ? 10 : 12);
    if (m.kind === 'rune') renderer.label?.(m.label, m.x, m.y - 5, '#f3f1e2', 16);
  }
  c.restore();
}
