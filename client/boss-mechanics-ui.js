const circle=(ctx,x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);};

/** All shapes are world-space telegraphs; their safe regions match server predicates. */
export function drawBossMechanics(renderer,mechanics,t){
 const c=renderer.ctx,now=Date.now()+renderer.clock;
 for(const m of mechanics||[]){
  if(!m.active){
   renderer.label(m.result==='success'?'기믹 돌파 · 공격 기회!':'다음 패턴에 대비하세요',m.x,m.y-175,m.result==='success'?'#adf1d5':'#edc4a7',11);
   continue;
  }
  c.save();c.lineWidth=2;
  let caption=m.instruction;
  if(m.kind==='tempest'){
   circle(c,m.x,m.y,205);c.fillStyle='#b18fd012';c.fill();
   for(const mark of m.markers){
    circle(c,mark.x,mark.y,mark.radius);c.fillStyle='#86e4ca38';c.fill();c.strokeStyle='#a1f1d6';c.stroke();
    c.setLineDash([4,5]);c.lineDashOffset=-t/160;circle(c,mark.x,mark.y,mark.radius-8);c.stroke();c.setLineDash([]);
    renderer.label('접지',mark.x,mark.y-6,'#ccffe9',10);
   }
   const charge=m.charges.find(q=>q.id===renderer.state.self.id);
   caption=charge?`접지 충전 ${Math.round(charge.progress*100)}% · 룬 안에서 대기`:'접지 룬 안에서 1.2초 머무르세요';
  }else if(m.kind==='leviathan'){
   circle(c,m.x,m.y,240);c.fillStyle='#f0a1a621';c.fill();
   c.beginPath();c.arc(m.x,m.y,m.safe==='inner'?82:240,0,Math.PI*2);
   if(m.safe==='outer')c.arc(m.x,m.y,128,0,Math.PI*2,true);
   c.fillStyle='#91efca38';c.fill('evenodd');c.strokeStyle='#acffe1';c.stroke();
   caption=`${m.step+1}/${m.total}번째 파도 · ${m.safe==='inner'?'안쪽 초록 원으로':'바깥쪽 초록 고리로'} 이동`;
  }else if(m.kind==='glacier'){
   circle(c,m.x,m.y-25,65);c.fillStyle='#b9eaff28';c.fill();c.strokeStyle='#b9eaffaa';c.setLineDash([7,4]);c.lineDashOffset=t/100;c.stroke();c.setLineDash([]);
   caption=`빙벽의 핵 ${m.crystals.length}개 남음 · 핵을 공격해 보호막을 해제하세요`;
  }else if(m.quadrant){
   circle(c,m.x,m.y,210);c.fillStyle='#d395ca23';c.fill();
   const starts=[Math.PI,-Math.PI/2,0,Math.PI/2],angle=starts[m.quadrant.index];
   c.beginPath();c.moveTo(m.x,m.y);c.arc(m.x,m.y,210,angle,angle+Math.PI/2);c.closePath();
   c.fillStyle='#91efca38';c.fill();c.strokeStyle='#acffe1';c.stroke();
   // These strips make the unsafe central cross visible instead of implying the exact center is safe.
   c.fillStyle='#d395ca70';c.fillRect(m.x-12,m.y-210,24,420);c.fillRect(m.x-210,m.y-12,420,24);
   renderer.label('안전',m.x+m.quadrant.x*95,m.y+m.quadrant.y*95,'#d5ffe7',12);
   caption=`${m.step+1}/${m.total}번째 월식 · ${m.quadrant.name} 초록 구역으로 이동`;
  }
  c.restore();
  renderer.label(`${m.title} · ${m.phase}단계 · ${Math.max(0,(m.ends-now)/1000).toFixed(1)}초`,m.x,m.y-215,'#f2d49f',12);
  renderer.label(caption,m.x,m.y-198,'#d6eee2',10);
 }
}

export function drawBossObjective(renderer,mob,position,t){
 if(!mob.mechanicObjective)return false;
 const c=renderer.ctx,{x,y}=position,hover=Math.sin(t/400)*3;
 renderer.shadow(x,y,23);
 if(renderer.state.self.target===mob.id){c.strokeStyle='#f4dc9b';c.lineWidth=2;c.beginPath();c.ellipse(x,y+2,28,11,0,0,Math.PI*2);c.stroke();}
 c.save();c.translate(x,y-20+hover);c.fillStyle='#9cd8efcc';c.strokeStyle='#e1faff';c.lineWidth=2;
 c.beginPath();c.moveTo(0,-25);c.lineTo(16,-4);c.lineTo(0,22);c.lineTo(-16,-4);c.closePath();c.fill();c.stroke();
 c.beginPath();c.moveTo(0,-25);c.lineTo(0,22);c.moveTo(-16,-4);c.lineTo(16,-4);c.stroke();c.restore();
 c.fillStyle='#15212b';c.fillRect(x-25,y-62,50,6);c.fillStyle='#9fe5ee';c.fillRect(x-24,y-61,48*Math.max(0,mob.hp/mob.maxHp),4);
 renderer.label('빙벽의 핵 · 공격해 파괴',x,y-74,'#cef1ff',9);
 return true;
}
