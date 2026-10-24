/** Visible region-altar device targets; the server alone accepts presses. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=n=>{const seconds=Math.max(0,Math.ceil(n/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
export function fieldTrialHUD(trial,now,interactKey='F'){
 if(!trial)return '';
 const ritual=trial.ritual;
 return `<header><span class="eyebrow">REGION ALTAR · CO-OP</span><h3>기억의 제단 ${trial.wave}/3</h3></header>
 <p>남은 시간 ${time(trial.ends-now)} · 적 ${trial.alive}마리${trial.bossGate?` · 파수꾼 봉인 ${trial.bossGate}/3`:''}</p>
 <p class="field-trial-hint">${esc(trial.hint)}</p>
 ${ritual?`<div class="field-trial-ritual"><b>${esc(ritual.order.join(' → '))}</b><small>진행 ${ritual.step}/${ritual.total} · ${time(ritual.expires-now)} 안에 해결</small></div><p class="small">발판 가까이에서 <kbd>${esc(interactKey)}</kbd>를 누르거나 아래 버튼으로 작동하세요.</p>
 <button class="btn small" data-act="trialInteract" type="button">가까운 봉인 작동</button>`:'<p class="small">전투가 끝나도 봉인 해독을 마쳐야 다음 관문이 열립니다.</p>'}`;
}
export function drawFieldTrialMarkers(renderer,trial,t){
 if(!trial?.markers?.length)return;
 const c=renderer.ctx;
 c.save();c.imageSmoothingEnabled=false;
 for(const m of trial.markers){
  const f=.65+Math.sin(t/280)*.17;
  c.save();c.translate(Math.round(m.x),Math.round(m.y));
  c.strokeStyle=m.color;c.fillStyle=m.color;c.lineWidth=3;
  c.globalAlpha=m.active?.18+f*.12:.12;
  c.fillRect(-34,-34,68,68);
  c.globalAlpha=m.active?1:.5;
  c.strokeRect(-34,-34,68,68);c.strokeRect(-24,-24,48,48);
  c.beginPath();c.moveTo(0,-25);c.lineTo(25,0);c.lineTo(0,25);c.lineTo(-25,0);c.closePath();c.stroke();
  c.fillRect(-5,-8,10,16);c.fillStyle='#243038';c.fillRect(-2,-5,4,10);
  c.restore();
  renderer.label(`${m.label}${m.active?' · 다음!':''}`,m.x,m.y-55,m.color,11);
  renderer.label('F 작동',m.x,m.y+50,'#e8e0bf',9);
 }
 c.restore();
}
