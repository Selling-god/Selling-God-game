import {ITEMS} from '../shared/content.js';
import {equipmentVisual} from '../shared/rpg.js';
import {THEMES,bossVisual} from '../shared/visuals.js';
/** Cache composited sprites so equipment does not add per-frame image processing. */
export class EquipmentRenderer{
 constructor(){this.cache=new Map();this.urls=new Map();}
 compose(atlas,meta,p,direction='s',frame=0){
  const gear=p.equipment||{weapon:p.weapon,armor:'tunic',charm:null};
  const key=[gear.weapon,gear.armor,gear.charm,direction,frame].join(':');
  if(this.cache.has(key))return this.cache.get(key);
  const cv=document.createElement('canvas');cv.width=48;cv.height=64;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
  const draw=name=>{const s=meta[name];if(s)c.drawImage(atlas,s.x,s.y,s.w,s.h,0,0,s.w,s.h);};
  draw(`body_${direction}_${frame}`);
  for(const slot of ['armor','charm','weapon'])if(gear[slot])draw(`gear_${ITEMS[gear[slot]]?.visualBase||({atlas_coat:'explorer_coat',pilgrim_charm:'relic_charm',memory_crown:'dawn_charm'})[gear[slot]]||gear[slot]}_${direction}_${frame}`);
  this.cache.set(key,cv);if(this.cache.size>700)this.cache.delete(this.cache.keys().next().value);
  return cv;
 }
 portrait(atlas,meta,p){
  if(!atlas||!meta)return '/assets/novice_s_0.png';
  const key=JSON.stringify(p.equipment||{weapon:p.weapon});
  if(!this.urls.has(key)){this.urls.set(key,this.compose(atlas,meta,p).toDataURL());if(this.urls.size>80)this.urls.delete(this.urls.keys().next().value);}
  return this.urls.get(key);
 }
 draw(renderer,p,x,y,direction,frame,alpha,t){
  const c=renderer.ctx,gear=p.equipment||{weapon:p.weapon};
  const weapon=ITEMS[gear.weapon],up=p.gearEnhance||p.enhancements||{},n=up[gear.weapon]||0;
  const theme=THEMES[weapon?.visualTheme],color=theme?.primary||equipmentVisual(gear.weapon)?.color||'#c6d0c9';
  c.save();
  if(n>=4&&renderer.showEffects){
   c.strokeStyle=color;c.globalAlpha=.35+Math.sin(t/400)*.1;c.lineWidth=1;
   c.beginPath();c.ellipse(x,y,17+(n>=7?3:0),6,0,0,Math.PI*2);c.stroke();
   const count=n>=10?8:n>=7?5:2;
   for(let i=0;i<count;i++){const a=t/850+i*Math.PI*2/count;c.fillStyle=color;c.fillRect(x+Math.cos(a)*20,y-15+Math.sin(a)*14,2,3);}
   if(n>=10){
    c.globalAlpha=.35;c.fillStyle=color;
    for(const side of [-1,1]){c.beginPath();c.moveTo(x+side*8,y-28);c.lineTo(x+side*34,y-44);c.lineTo(x+side*25,y-20);c.lineTo(x+side*13,y-12);c.fill();}
   }
  }
  c.globalAlpha=alpha;
  c.drawImage(this.compose(renderer.atlas,renderer.meta,p,direction,frame),x-24*.85,y-60*.85,48*.85,64*.85);
  if(p.weakened){c.globalAlpha=.65;c.fillStyle='#c19ddd';c.fillRect(x-4,y-57,8,2);c.fillRect(x-2,y-55,4,5);}
  c.restore();
 }
}
export function drawBossGear(renderer,mob,def,x,y,t){
 const c=renderer.ctx,v=bossVisual(mob.type),phase=mob.phase||0;
 const top=y-((def.skin||mob.type)==='eclipse_dragon'?99:def.sprite.includes('world')?86:78);
 c.save();c.strokeStyle=v.light;c.fillStyle=v.primary;c.lineWidth=2;
 // Boss equipment is visual identity. Armor visibly cracks below 70% HP and breaks at 45%.
 if(phase<2){
  for(const side of [-1,1]){
   c.beginPath();c.moveTo(x+side*17,top+30);c.lineTo(x+side*35,top+24);c.lineTo(x+side*32,top+40);c.lineTo(x+side*20,top+43);c.closePath();c.fill();c.stroke();
   if(phase===1){c.strokeStyle='#182731';c.beginPath();c.moveTo(x+side*28,top+28);c.lineTo(x+side*23,top+35);c.lineTo(x+side*29,top+40);c.stroke();c.strokeStyle=v.light;}
  }
 }
 if(v.gear==='halo'||v.gear==='moon'){c.beginPath();c.ellipse(x,top-4,25,8,0,0,Math.PI*2);c.stroke();}
 else if(v.gear==='wings'){
  for(const side of [-1,1]){c.beginPath();c.moveTo(x+side*12,top+15);c.lineTo(x+side*45,top-8);c.lineTo(x+side*35,top+23);c.stroke();}
 }else if(['horns','antlers','coral'].includes(v.gear)){
  for(const side of [-1,1]){
   c.beginPath();c.moveTo(x+side*12,top+8);c.lineTo(x+side*25,top-4);c.lineTo(x+side*22,top-21);c.stroke();
   c.beginPath();c.moveTo(x+side*24,top-6);c.lineTo(x+side*34,top-12);c.stroke();
  }
 }else{
  c.beginPath();c.moveTo(x-17,top+6);c.lineTo(x-20,top-9);c.lineTo(x-7,top-2);c.lineTo(x,top-19);c.lineTo(x+7,top-2);c.lineTo(x+20,top-9);c.lineTo(x+17,top+6);c.closePath();c.fill();c.stroke();
 }
 if(phase===2){
  c.globalAlpha=.6+.2*Math.sin(t/160);c.strokeStyle=v.primary;c.lineWidth=2;
  c.beginPath();c.ellipse(x,y+2,46,16,0,0,Math.PI*2);c.stroke();
  for(let i=0;i<6;i++){const a=i*Math.PI/3+t/1000;c.fillStyle=v.light;c.fillRect(x+Math.cos(a)*35,y-20+Math.sin(a)*20-(t/35+i*7)%30,3,4);}
 }
 c.restore();
}
