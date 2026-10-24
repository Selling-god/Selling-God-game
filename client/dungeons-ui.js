import { DUNGEONS, DUNGEON_BY_ID, DUNGEON_SHOP } from '../shared/dungeons.js';
import { ZONES, ITEMS } from '../shared/content.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = n => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('ko-KR');
const time = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const keyFallback = (_id, fallback = '미지정') => fallback;
const btn = (label, act, id = '', extra = '') => `<button type="button" class="btn small" data-act="${act}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const phases = { preparing: '전투 준비', balance: '문양 공명', pillars: '기둥 정렬', memory_show: '순서 기억', memory_input: '교대 입력', memory_laser: '광선 차단', star_mark: '낙성 유도', conduits: '동시 차단', vulnerable: '공격 기회', recover: '기믹 재정비', reform: '역할 재배정', rescue: '동료 구조' };
const arrows = ['↑', '→', '↓', '←'];

export function dungeonsPanel({ profile: p, state, now = Date.now(), keyLabel = keyFallback }) {
  const save = p?.dungeons || {}, active = state?.dungeon, party = state?.party;
  let html = `<section class="info-box dungeon-entry"><span class="eyebrow">TWO TO FOUR ADVENTURERS · ONE SHARED PROMISE</span><h3>함께 풀어야 열리는 세 개의 던전</h3>
    <p>파티장이 필드의 던전 입구에서 준비 확인을 요청합니다. 2~4명 전원이 입구에 모여 각자 준비 완료를 누르면 파티장이 입장할 수 있습니다.</p>
    <p class="small">직업 조합은 자유롭습니다. 두 명으로 모든 기믹을 해결할 수 있고 인원에 맞춰 보스 체력이 조정됩니다. 전원 동의한 파티만 같은 던전에 들어갑니다.</p>
    <div class="dungeon-wallet"><span>계약의 증표</span><strong>✦ ${number(save.tokens)}</strong></div>
    ${!party ? `<p>먼저 같은 서버의 동료를 파티에 초대해 주세요.</p>${btn('파티 관리', 'openParty')}` : `<p class="small">현재 파티 ${party.members.length}/4명 · ${party.leader === p.id ? '내가 파티장입니다.' : '파티장이 준비 확인을 요청할 수 있습니다.'}</p>`}</section>`;
  if (active) html += `<section class="card dungeon-current">${dungeonHUD(active, now, { keyLabel })}</section>`;
  const last = save.lastResult, lastDef = DUNGEON_BY_ID[last?.dungeon];
  if (lastDef) html += `<section class="card dungeon-result"><span class="badge ${last.won ? 'good' : ''}">${last.won ? '계약 완수' : '도전 기록'}</span><h3>${esc(lastDef.name)}</h3><p>${esc(last.reason)}</p>
    <p class="small">${last.attempt}번째 시도 · ${time(last.elapsed)}${last.won ? ` · 증표 +${number(last.tokens)} · ${number(last.gold)} G${last.xp ? ` · ${number(last.xp)} EXP` : ''}` : ''}</p>
    ${last.item ? `<p class="reward-line">첫 완주 성물 · ${esc(ITEMS[last.item]?.name)}</p>` : ''}</section>`;
  html += `<div class="dungeon-grid">${DUNGEONS.map((d, index) => {
    const record = save.records?.[d.id], isLeader = party?.leader === p?.id, inRegion = p?.zone === d.entryZone, locked = (p?.level || 1) < d.level;
    return `<article class="card dungeon-card"><span class="eyebrow">DUNGEON 0${index + 1} · 2–4인 · Lv.${d.level}</span><h3>${esc(d.name)}</h3><p>${esc(d.subtitle)}</p>
      <div class="dungeon-boss-title"><strong>${esc(d.bossName)}</strong><span class="small">제한 ${d.minutes}분 · 체력 70% / 35%에서 다음 기믹 단계</span></div>
      <ol class="dungeon-rules">${d.mechanics.map(rule => `<li>${esc(rule)}</li>`).join('')}</ol>
      <p class="small">입구: <strong>${esc(ZONES[d.entryZone]?.name)}</strong>의 출발 지점 근처<br>첫 완주 성물: ${esc(ITEMS[d.reward]?.name)}</p>
      <p class="small muted">${record?.clears ? `${number(record.clears)}회 완주 · 최단 ${time(record.bestMs)} · 총 ${number(record.attempts)}회 시도` : `완주 기록 없음${record?.attempts ? ` · ${record.attempts}회 시도` : ''}`}</p>
      <div class="settings-actions">${btn(locked ? `Lv.${d.level} 필요` : !isLeader ? '파티장에게 준비 요청을 부탁하세요' : !inRegion ? '입구 지역에서 준비 요청' : '파티 준비 확인 요청', 'dungeonLobby', d.id, locked || !isLeader || !inRegion || active ? 'disabled' : '')}
        ${!inRegion && !locked && p?.discovery?.visited?.includes(d.entryZone) ? btn('입구 지역으로 이동', 'travel', d.entryZone, active ? 'disabled' : '') : btn('대륙 지도', 'openAtlas')}
      </div></article>`;
  }).join('')}</div>`;
  html += `<section class="info-box dungeon-rules-summary"><h3>다시 도전할 수 있도록 남기는 기록</h3>
    <p>각 체력 단계에서는 협동 기믹을 풀어야 보스 보호막이 열립니다. 기믹 실패 3회 또는 전원 사망은 전멸입니다. 실패 이유가 HUD에 남고, 전원 재도전 준비를 누르면 던전 안에서 새 시도를 시작합니다.</p>
    <p>한 시도에 동료 구조 2회: 쓰러진 동료 가까이에서 ${esc(keyLabel('interact', 'F'))}를 누르고 3초 동안 머무르세요. 두 명 미만으로 남으면 20초의 구조 시간이 주어집니다. 구조 기회가 없으면 전멸합니다.</p>
    <p>첫 완주는 던전별 성물·증표 8개·골드·입장 레벨 필요 경험치의 20%를 줍니다(만렙 제외). 첫 완주한 날의 보상은 여기까지이며, 한국 시간 자정이 지난 뒤 하루 첫 재완주는 증표 3개와 골드를 줍니다. 같은 날 추가 완주는 기록만 갱신합니다.</p>
    <p class="small">입장과 재도전 때 HP/MP가 회복됩니다. 최종 퇴장 시 입장 전 HP/MP로 돌아가며, 사용한 물약은 소비됩니다. 일반 사망 손실은 없습니다. 접속이 끊긴 동료를 30초 동안 기다리며 전투 시간을 정지합니다. 돌아오지 않거나 파티를 이탈하면 전원이 무보상 복귀합니다. 서버 재시작 후에는 저장된 입장 위치로 돌아갑니다.</p></section>
    <h3>계약의 증표 교환</h3><div class="dungeon-shop">${DUNGEON_SHOP.map(item => `<article class="card"><h4>${esc(item.name)}</h4><p class="small">${Object.entries(item.items).map(([id, n]) => `${esc(ITEMS[id]?.name || id)} ${n}개`).join(' · ')}</p>
      ${btn(`✦ ${item.cost}개로 교환`, 'dungeonExchange', item.id, active && active.state !== 'lobby' || (save.tokens || 0) < item.cost ? 'disabled' : '')}</article>`).join('')}</div>`;
  return { title: '별의 계약 · 파티 던전', eyebrow: 'LEARN TOGETHER · RETURN TOGETHER', html };
}

export function dungeonHUD(c, now = Date.now(), { keyLabel = keyFallback } = {}) {
  if (!c) return '';
  const roster = `<div class="dungeon-roster">${c.members.map(m => `<span class="dungeon-member ${m.ready ? 'ready' : ''} ${m.dead ? 'fallen' : ''}"><b>${esc(m.name)}</b><small>${!m.online ? '접속 끊김' : c.state === 'lobby' || c.state === 'wipe' ? m.ready ? '준비 완료' : '준비 대기' : m.dead ? '구조 필요' : `${Math.ceil(m.hp / m.maxHp * 100)}%`}</small></span>`).join('')}</div>`;
  if (c.state === 'lobby') {
    const self = c.members.find(m => m.id === c.selfId), allReady = c.members.every(m => m.ready && m.online && !m.entryError);
    return `<div class="dungeon-hud-heading"><div><span class="eyebrow">파티 준비 확인</span><h3>${esc(c.name)}</h3></div><strong>${time(c.ends - now)}</strong></div>
      <p class="small">${esc(ZONES[c.entryZone]?.name)}의 던전 입구로 모여 주세요. 전원 준비 후 파티장이 입장합니다.</p>${roster}
      ${self?.entryError ? `<p class="dungeon-hint">${esc(self.entryError)}</p>` : ''}
      <div class="settings-actions dungeon-controls">${btn(self?.ready ? '준비 취소' : '준비 완료', 'dungeonReady', '', `data-lobby-id="${esc(c.lobbyId)}" data-ready="${!self?.ready}" ${!self?.ready && self?.entryError ? 'disabled' : ''}`)}
      ${c.isLeader ? btn('전원 입장', 'dungeonStart', '', `data-lobby-id="${esc(c.lobbyId)}" ${allReady ? '' : 'disabled'}`) + btn('준비 확인 취소', 'dungeonCancel') : ''}</div>`;
  }
  let html = `<div class="dungeon-hud-heading"><div><span class="eyebrow">${c.attempt}번째 시도 · 보스 ${c.stage}/3단계</span><h3>${esc(c.name)}</h3></div><strong>${c.state === 'complete' ? time(c.returnAt - now) : c.state === 'grace' ? time(c.graceEnds - now) : c.state === 'wipe' ? '전멸' : time(c.ends - now)}</strong></div>`;
  if (c.state === 'grace') return html + `<p class="dungeon-urgent">접속이 끊긴 동료를 기다리고 있습니다. 전투와 기믹 시간이 정지되었습니다.</p>${roster}<div class="settings-actions">${btn('파티 전원 입구로', 'dungeonExit')}</div>`;
  if (c.state === 'wipe') return html + `<p class="dungeon-urgent">${esc(c.failure || c.hint)}</p><p class="small">장비·경험치 사망 손실은 없습니다. 전원이 준비하면 같은 파티로 다시 시작합니다.</p>${roster}
    <div class="settings-actions dungeon-controls">${btn(c.members.find(m => m.id === c.selfId)?.ready ? '동료의 준비를 기다리는 중' : '재도전 준비', 'dungeonRetry', '', `data-run-id="${esc(c.runId)}" data-ready="true" ${c.members.find(m => m.id === c.selfId)?.ready ? 'disabled' : ''}`)}${btn('파티 전원 입구로', 'dungeonExit')}</div>`;
  if (c.state === 'complete') return html + `<p class="dungeon-success">계약을 완수했습니다. 각자의 보상과 기록이 저장되었습니다.</p><p class="small">잠시 뒤 입구로 돌아갑니다. 도전 메뉴에서 보상을 확인할 수 있습니다.</p>${btn('입구로 돌아가기', 'dungeonExit')}`;
  html += `<div class="dungeon-phase"><strong>${esc(phases[c.phase] || c.phase)}</strong><span>${time(c.phaseEnds - now)}</span></div><p class="dungeon-hint">${esc(c.hint)}</p>`;
  if (c.myRole) html += `<p class="dungeon-my-role"><span>내 역할</span><strong style="color:${esc(c.myRole.color)}">${esc(c.myRole.label)}</strong></p>`;
  if (c.sequence) html += `<div class="dungeon-sequence" aria-label="기억할 문양 순서">${c.sequence.map((symbol, i) => `<span><small>${i + 1}</small>${esc(symbol)}</span>`).join('<i aria-hidden="true">→</i>')}</div>`;
  if (c.operator) html += `<p class="dungeon-my-role">지금은 <strong>${esc(c.operator.name)}</strong> 님 차례 · ${c.step}/${c.totalSteps}</p>`;
  if (c.phase === 'balance' || c.phase === 'memory_laser') html += `<div class="story-meter" role="progressbar" aria-label="동시 위치 유지" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(c.holdProgress * 100)}"><i style="width:${c.holdProgress * 100}%"></i></div>`;
  if (c.phase === 'star_mark') html += `<p class="dungeon-urgent">${c.starLocked ? '낙인 고정! 유도자는 붉은 원 밖으로 피하세요.' : `낙인 위치 고정까지 ${time(c.lockAt - now)}`}</p>`;
  if (c.tether) html += `<p class="dungeon-urgent">분리 사슬 · ${c.tether.points.map(p => esc(p.name)).join(' ↔ ')} · ${time(c.tether.ends - now)} 안에 180 이상 떨어지기</p>`;
  if (c.reviving) html += `<p class="dungeon-success">${esc(c.reviving.helper)} → ${esc(c.reviving.target)} 구조 중 · ${time(c.reviving.ends - now)}</p>`;
  html += `<div class="dungeon-small-stats"><span>기믹 실패 ${c.strikes}/3</span><span>구조 기회 ${c.revives}/2</span></div>${roster}<div class="settings-actions dungeon-controls">${btn(`가까운 장치·동료 · ${esc(keyLabel('interact', 'F'))}`, 'dungeonInteract')}${btn('파티 전원 나가기', 'dungeonExit')}</div>`;
  return html;
}

/** World-space overlay. Foreground keeps role labels and safe boundaries readable over combat effects. */
export function drawDungeonOverlay(renderer, snapshot, t, layer = 'all') {
  const d = snapshot?.dungeon, c = renderer.ctx;
  if (!d || d.state === 'lobby' || !c) return;
  const ground = layer === 'all' || layer === 'ground', front = layer === 'all' || layer === 'foreground';
  c.save();
  for (const m of d.markers || []) {
    c.save(); c.translate(m.x, m.y); const radius = m.radius || 46;
    if (ground) {
      c.globalAlpha = m.kind === 'safe' || m.active ? .24 : .13; c.fillStyle = m.color;
      c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      if (m.kind === 'pillar' || m.kind === 'conduit' || m.kind === 'prism') {
        c.fillStyle = '#263846'; c.fillRect(-18, -35, 36, 46); c.fillStyle = m.color;
        c.beginPath(); c.moveTo(0, -51); c.lineTo(16, -31); c.lineTo(0, -10); c.lineTo(-16, -31); c.closePath(); c.fill();
      } else {
        c.strokeStyle = m.color; c.lineWidth = 1.5; c.globalAlpha = .5;
        c.beginPath(); c.moveTo(0, -radius * .65); c.lineTo(radius * .65, 0); c.lineTo(0, radius * .65); c.lineTo(-radius * .65, 0); c.closePath(); c.stroke(); c.globalAlpha = 1;
      }
    }
    if (front) {
      c.strokeStyle = '#14232bea'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = m.color; c.lineWidth = m.kind === 'safe' ? 3 : 2; c.stroke();
      if (m.active && m.progress != null) { c.strokeStyle = '#f4f4db'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.progress); c.stroke(); }
    }
    c.restore();
    if (front) {
      renderer.label?.(m.label, m.x, m.y - radius - 21, m.color, 11);
      if (m.kind === 'pillar') { renderer.label?.(`현재 ${arrows[m.angle]}  목표 ${arrows[m.goal]}`, m.x, m.y + radius + 12, '#f4e3b5', 12); }
      else if (m.symbol) renderer.label?.(m.symbol, m.x, m.y - 5, '#f4f1db', 15);
      else if (m.kind === 'revive') renderer.label?.('+', m.x, m.y - 8, m.color, 20);
    }
  }
  if (front) {
    for (const role of d.assignments || []) {
      const self = role.id === snapshot.self?.id, pos = self && renderer.local ? renderer.local : role;
      renderer.label?.(`◆ ${role.label}`, pos.x, pos.y - 96, role.color, 11);
    }
    if (d.tether?.points?.length === 2) {
      const [a, b] = d.tether.points, distance = Math.hypot(a.x - b.x, a.y - b.y), color = distance < d.tether.minimum ? '#f3a092' : '#9be4b9';
      c.strokeStyle = '#17242a'; c.lineWidth = 7; c.beginPath(); c.moveTo(a.x, a.y - 25); c.lineTo(b.x, b.y - 25); c.stroke();
      c.strokeStyle = color; c.lineWidth = 3; c.stroke(); renderer.label?.(`분리 ${Math.round(distance)} / ${d.tether.minimum}`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 41, color, 11);
    }
  }
  c.restore();
}
