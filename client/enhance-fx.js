/** Purely presentational forge sequence; authoritative success/failure comes from the server. */
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export class EnhancementCinema {
 constructor(){this.active=false;this.node=null;this.timer=null;this.reveal=null;}
 start(item,quote){
  if(this.active)return false;
  this.active=true;
  clearTimeout(this.timer);
  this.node?.remove();
  const root=document.createElement('div');root.className='forge-cinema';root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');root.setAttribute('aria-label','장비 강화 진행');
  root.innerHTML=`<div class="forge-scene" aria-live="polite">
    <p class="forge-eyebrow">STARFALL · ENHANCEMENT</p>
    <h2>별빛을 담금질하는 순간</h2>
    <p class="forge-item">${escapeHTML(item.name)}</p>
    <div class="forge-crystal" aria-hidden="true"><div class="forge-halo"></div><span>✦</span><i></i></div>
    <div class="forge-levels"><span>+${quote.level}</span><span class="forge-chevron">➜</span><strong>+${quote.next}</strong></div>
    <div class="forge-percentage"><span>성공 확률</span><b>${Math.round(quote.rate*100)}%</b></div>
    <p class="forge-message">운명의 별빛이 모이고 있습니다…</p>
    <div class="forge-meter"><span></span></div>
    <small class="forge-footnote">결과는 서버에서 판정됩니다 · 실패해도 단계는 유지됩니다</small>
  </div>`;
  document.body.append(root);this.node=root;
  this.previousFocus=document.activeElement;
  return true;
 }
 resolve(data,onReveal){
  if(!this.active||!this.node)return;
  this.reveal=data;this.node.classList.add('is-holding');
  const hold=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?200:1600;
  this.timer=setTimeout(()=>{
   if(!this.active||!this.node)return;
   this.node.classList.remove('is-holding');
   this.node.classList.add(data.success?'forge-success':'forge-failure');
   const message=this.node.querySelector('.forge-message');
   const title=this.node.querySelector('h2');
   if(title)title.textContent=data.success?'강화 성공!':'강화 실패';
   if(message)message.textContent=data.success?
     `${data.name} +${data.level} 달성! ${data.level>=10?'최고 강화의 별빛이 깨어났습니다.':data.level>=7?'희귀한 강력한 빛이 피어납니다.':'한 단계 더 강해졌습니다.'}`:
     `강화 단계 +${data.level} 유지 · 다음 확률 ${Math.round(data.nextRate*100)}%`;
   if(this.node.querySelector('.forge-levels strong'))
    this.node.querySelector('.forge-levels strong').textContent='+'+data.level;
   if(typeof onReveal==='function')onReveal();
   this.timer=setTimeout(()=>this.finish(),data.success?1850:1600);
  },hold);
 }
 abort(message){
  if(!this.active||!this.node)return;
  this.node.classList.add('forge-failure');
  this.node.querySelector('h2').textContent='강화를 진행할 수 없습니다';
  this.node.querySelector('.forge-message').textContent=message;
  this.timer=setTimeout(()=>this.finish(),1400);
 }
 finish(){
  clearTimeout(this.timer);this.node?.remove();this.node=null;this.active=false;this.reveal=null;
  if(this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});
 }
}
