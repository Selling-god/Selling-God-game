import {pixelLayer,pixelPalette} from './pixel-effects.js';

const TAU=Math.PI*2;
const SAFE='#a4f3d0',DANGER='#f6a485',INK='#112332';
function circleEdge(p,x,y,r,color){p.arc(x,y,r,INK,p.cell*3);p.arc(x,y,r,color,p.cell);}
function quarter(m){
 const angle=[Math.PI,-Math.PI/2,0,Math.PI/2][m.quadrant.index],pts=[[m.x,m.y]];
 for(let i=0;i<=24;i++){const a=angle+i*Math.PI/48;pts.push([m.x+Math.cos(a)*210,m.y+Math.sin(a)*210]);}
 return pts;
}

/** Important counters remain visible with cosmetics disabled; outlines are drawn after all actors. */
export function drawBossMechanics(renderer,mechanics,t,layer='all'){
 const now=Date.now()+renderer.clock;
 for(const m of mechanics||[]){
  if(!m.active){
   if(layer!=='ground')renderer.label(m.result==='success'?'기믹 돌파 · 공격 기회!':'다음 패턴에 대비하세요',m.x,m.y-175,m.result==='success'?'#adf1d5':'#edc4a7',11);
   continue;
  }
  const charge=(m.charges||[]).find(q=>q.id===renderer.state.self.id),frame=Math.floor(t/120);
  pixelLayer(renderer,`mechanic:${m.bossId}:${m.phase}:${m.step}:${layer}:${frame}`,{x:m.x-252,y:m.y-252,width:504,height:504},p=>{
   if(layer!=='foreground'){
    if(m.kind==='tempest'){
     p.alpha(.08,()=>p.disk(m.x,m.y,205,'#c2a0ed'));
     for(const mark of m.markers||[]){p.alpha(.25,()=>p.disk(mark.x,mark.y,mark.radius,SAFE));p.diamond(mark.x,mark.y,16,'#398d8b',SAFE);}
    }else if(m.kind==='leviathan'){
     p.alpha(.22,()=>p.disk(m.x,m.y,240,DANGER));
     p.alpha(.4,()=>p.band(m.x,m.y,m.safe==='inner'?82:240,m.safe==='inner'?0:128,SAFE));
    }else if(m.kind==='glacier'){
     p.alpha(.22,()=>p.disk(m.x,m.y-25,65,'#a3e0f6'));p.diamond(m.x,m.y-25,32,'#5c91bb','#d9f7ff');
    }else if(m.quadrant){
     p.alpha(.18,()=>p.disk(m.x,m.y,210,DANGER));p.alpha(.38,()=>p.poly(quarter(m),SAFE));
     p.alpha(.45,()=>{p.rect(m.x-12,m.y-210,24,420,DANGER);p.rect(m.x-210,m.y-12,420,24,DANGER);});
    }
   }
   if(layer!=='ground'){
    if(m.kind==='tempest')for(const mark of m.markers||[]){
     circleEdge(p,mark.x,mark.y,mark.radius,SAFE);
     p.arc(mark.x,mark.y,mark.radius-8,'#72bcbb',p.cell,1,t/800,t/800+Math.PI*1.4);
     if(charge&&Math.hypot(renderer.state.self.x-mark.x,renderer.state.self.y-mark.y)<=mark.radius)p.arc(mark.x,mark.y,mark.radius+5,'#fff4bc',p.cell,1,-Math.PI/2,-Math.PI/2+TAU*charge.progress);
    }
    else if(m.kind==='leviathan'){
     circleEdge(p,m.x,m.y,m.safe==='inner'?82:128,SAFE);circleEdge(p,m.x,m.y,240,m.safe==='inner'?DANGER:SAFE);
     for(let i=0;i<8;i++){
      const a=i*Math.PI/4,r=m.safe==='inner'?55:165,x=m.x+Math.cos(a)*r,y=m.y+Math.sin(a)*r;
      p.diamond(x,y,5,SAFE,'#e6ffdc');
     }
    }else if(m.kind==='glacier'){
     circleEdge(p,m.x,m.y-25,65,'#bdeaff');
     for(let i=0;i<6;i++){const a=i*TAU/6+t/1800;p.diamond(m.x+Math.cos(a)*65,m.y-25+Math.sin(a)*65,6,'#8dcde6','#f3ffed');}
    }else if(m.quadrant){
     circleEdge(p,m.x,m.y,210,'#c1a5ec');p.outline(quarter(m),INK,p.cell*3);p.outline(quarter(m),SAFE,p.cell);
     p.line(m.x-12,m.y-205,m.x-12,m.y+205,DANGER,p.cell);p.line(m.x+12,m.y-205,m.x+12,m.y+205,DANGER,p.cell);
     p.line(m.x-205,m.y-12,m.x+205,m.y-12,DANGER,p.cell);p.line(m.x-205,m.y+12,m.x+205,m.y+12,DANGER,p.cell);
    }
   }
  });
  if(layer==='ground')continue;
  let caption=m.instruction;
  if(m.kind==='tempest'){
   for(const mark of m.markers||[])renderer.label('접지',mark.x,mark.y-6,'#dcffe8',10);
   caption=charge?`접지 충전 ${Math.round(charge.progress*100)}% · 룬 안에서 대기`:'접지 룬 안에서 1.2초 머무르세요';
  }else if(m.kind==='leviathan')caption=`${m.step+1}/${m.total}번째 파도 · ${m.safe==='inner'?'안쪽 초록 원으로':'바깥쪽 초록 고리로'} 이동`;
  else if(m.kind==='glacier')caption=`빙벽의 핵 ${(m.crystals||[]).length}개 남음 · 핵을 공격해 보호막을 해제하세요`;
  else if(m.quadrant){renderer.label('안전',m.x+m.quadrant.x*95,m.y+m.quadrant.y*95,'#d5ffe7',12);caption=`${m.step+1}/${m.total}번째 월식 · ${m.quadrant.name} 초록 구역으로 이동`;}
  renderer.label(`${m.title} · ${m.phase}단계 · ${Math.max(0,(m.ends-now)/1000).toFixed(1)}초`,m.x,m.y-215,'#f2d49f',12);
  renderer.label(caption,m.x,m.y-198,'#d6eee2',10);
 }
}

export function drawBossObjective(renderer,mob,position,t){
 if(!mob.mechanicObjective)return false;
 const {x,y}=position,hover=Math.round(Math.sin(t/400))*3,v=pixelPalette('ice'),targeted=renderer.state.self.target===mob.id;
 pixelLayer(renderer,`crystal:${mob.id}:${Math.floor(t/100)}:${targeted}`,{x:x-45,y:y-65,width:90,height:87},p=>{
  p.alpha(.4,()=>p.disk(x,y+2,23,INK,.4));
  if(targeted)circleEdge(p,x,y,27,'#f4dc9b');
  const pts=[[x,y-49+hover],[x+17,y-27+hover],[x+11,y-7+hover],[x,y+3+hover],[x-16,y-22+hover]];
  p.poly(pts,v.dark);p.outline(pts,v.ink,6);p.poly([[x,y-45+hover],[x+13,y-25+hover],[x,y-2+hover]],v.primary);
  p.line(x,y-46+hover,x,y-2+hover,v.light,3);p.line(x-13,y-23+hover,x+13,y-25+hover,v.light,3);p.dot(x-4,y-34+hover,4,v.core);
 });
 const c=renderer.ctx;c.fillStyle='#15212b';c.fillRect(x-25,y-62,50,6);c.fillStyle='#9fe5ee';c.fillRect(x-24,y-61,48*Math.max(0,mob.hp/mob.maxHp),4);
 renderer.label(`${mob.name||'빙벽의 핵'} · 공격해 파괴`,x,y-74,'#cef1ff',9);
 return true;
}
