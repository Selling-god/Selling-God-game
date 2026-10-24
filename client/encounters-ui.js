import {MONSTERS} from '../shared/content.js';
import {BOSS_BEHAVIORS,ORDINARY_BEHAVIORS} from '../shared/encounters.js';
import {pixelLayer,pixelPalette} from './pixel-effects.js';
import {drawCreature} from './creatures.js';

export function encounterDescription(spec){
 return BOSS_BEHAVIORS[spec?.encounter]||spec?.encounterInfo||ORDINARY_BEHAVIORS[spec?.behavior]||null;
}
export function drawEncounterOverlay(renderer,view,t,layer='foreground'){
 if(!view)return;
 const now=Date.now()+(renderer.clock||0),r=renderer,c=r.ctx;
 for(const h of view.hazards||[]){
  if(h.ends<=now)continue;
  const active=now>=h.activeAt,pal=pixelPalette(h.theme),radius=h.radius;
  if(layer==='ground'){
   pixelLayer(r,`hazard:${h.id}:${active}:${Math.floor(t/180)%4}`,{x:h.x-radius-5,y:h.y-radius-5,width:radius*2+10,height:radius*2+10},p=>{
    p.alpha(active?.30:.12,()=>p.disk(h.x,h.y,radius,pal.dark||pal.primary));
    if(active)for(let i=0;i<10;i++){const a=i*Math.PI*2/10+(Math.floor(t/180)%4)*.1,rr=radius*(.25+(i%3)*.23);p.dot(h.x+Math.cos(a)*rr,h.y+Math.sin(a)*rr,4,pal.primary);}
   });
  }else{
   c.save();c.strokeStyle=active?'#ffd5a2':'#f3d9a5';c.lineWidth=active?2.5:1.5;c.setLineDash(active?[]:[6,6]);c.beginPath();c.arc(h.x,h.y,radius,0,Math.PI*2);c.stroke();c.setLineDash([]);c.restore();
   if(!active||Math.hypot(h.x-r.state.self.x,h.y-r.state.self.y)<radius+85)r.label(active?'잔류 위험 · 밖으로 이동':`${h.name||'위험 지대'} · ${Math.max(0,(h.activeAt-now)/1000).toFixed(1)}초`,h.x,h.y-radius-10,'#ffe3b4',9);
  }
 }
 if(layer==='foreground')for(const b of view.projectiles||[]){
  if(b.ends<=now)continue;const pal=pixelPalette(b.theme),rr=Math.max(6,b.radius);
  pixelLayer(r,`projectile:${b.id}:${Math.floor(t/85)%4}`,{x:b.x-rr-20,y:b.y-rr-20,width:rr*2+40,height:rr*2+40},p=>{
   const dx=Math.cos(b.angle),dy=Math.sin(b.angle);
   p.line(b.x-dx*18,b.y-dy*18,b.x,b.y,pal.dark,rr*1.3);p.disk(b.x,b.y,rr+2,pal.ink);p.disk(b.x,b.y,rr,pal.primary);p.diamond(b.x,b.y,rr*.8,pal.light);p.dot(b.x,b.y,3,pal.core);
  },{cell:2});
 }
}

function textLines(c,text,maxWidth){
 const chars=[...String(text||'')],lines=[];let row='';
 for(const char of chars){if(row&&c.measureText(row+char).width>maxWidth){lines.push(row);row=char;}else row+=char;}
 if(row)lines.push(row);return lines;
}

// The server makes this interval safe. It is a brief, non-interactive cut, not a
// modal, so movement keys cannot get stuck when a phase changes or it reconnects.
export function drawPhaseTransition(renderer,state,t){
 const cut=state.dungeon?.phaseTransition||state.encounter?.phaseTransition;
 const now=Date.now()+(renderer.clock||0);
 if(!cut||cut.starts>now||cut.ends<=now)return false;
 const c=renderer.ctx,w=renderer.w,h=renderer.h,progress=Math.min(1,(now-cut.starts)/Math.max(1,cut.ends-cut.starts)),fade=Math.min(1,progress*9,(1-progress)*9),small=w<680;
 const boss=state.mobs.find(m=>m.id===cut.bossId),type=boss?.type||cut.type||cut.monster,def=MONSTERS[type];
 const pal=pixelPalette(cut.theme),top=Math.max(82,h*.22),height=Math.min(290,h*.56),bottom=top+height;
 c.save();c.setTransform(renderer.dpr||1,0,0,renderer.dpr||1,0,0);c.globalAlpha=fade;
 c.fillStyle='#0a1021ef';c.fillRect(0,top,w,height);c.fillStyle=pal.primary;c.fillRect(0,top,w,2);c.fillRect(0,bottom-2,w,2);
 c.fillStyle=pal.dark;for(let i=0;i<12;i++){const x=(i*83+(renderer.showEffects?progress*180:0))%(w+60)-30;c.fillRect(x,top+height*.7,24,2);}
 const spriteX=small?w*.19:w*.24,spriteY=top+height*.75,scale=small?.93:1.35;
 if(def?.creature){
  c.save();c.translate(spriteX,spriteY);c.scale(scale,scale);
  if(renderer.showEffects&&progress<.5)drawCreature(renderer,{...boss,phase:Math.max(0,cut.phase-2),encounterPose:null},def,-18*(1-progress*2),2,t,.28);
  drawCreature(renderer,{...boss,dir:'e',phase:Math.max(0,cut.phase-1),encounterForm:cut.form,encounterPose:{kind:'summon',stage:'windup',starts:cut.starts,ends:cut.ends}},def,0,0,t,1);
  c.restore();
 }
 const x=small?w*.39:w*.43,maxWidth=w-x-20;
 c.textAlign='left';c.textBaseline='top';c.fillStyle=pal.light;c.font=`600 ${small?10:12}px sans-serif`;c.fillText(`PHASE ${cut.phase} / 3  ·  각성`,x,top+25);
 c.fillStyle='#f5eedb';c.font=`700 ${small?18:27}px sans-serif`;
 const names=textLines(c,cut.title||cut.name,maxWidth).slice(0,2);names.forEach((line,i)=>c.fillText(line,x,top+49+i*(small?24:33)));
 let yy=top+54+names.length*(small?24:33);c.fillStyle='#c1c9d7';c.font=`${small?10:12}px sans-serif`;
 const lines=textLines(c,cut.description||'외형이 변하고 새로운 공격이 시작됩니다.',maxWidth).slice(0,3);lines.forEach((line,i)=>c.fillText(line,x,yy+i*18));
 yy=Math.min(bottom-48,yy+lines.length*18+18);
 for(let i=1;i<=3;i++){c.fillStyle=i===cut.phase?pal.primary:i<cut.phase?pal.dark:'#263044';c.fillRect(x+(i-1)*38,yy,28,4);}
 c.fillStyle='#b5dccc';c.font=`${small?9:11}px sans-serif`;c.fillText('전환 중 보호 · 다음 공격의 예고를 확인하세요',x,bottom-27);
 c.restore();return true;
}
