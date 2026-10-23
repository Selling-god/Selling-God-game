import {skillVisual,THEMES} from '../shared/visuals.js';
const TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>1-Math.pow(1-t,3);
function ring(c,x,y,r,color,width=2,ratio=.65){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.ellipse(x,y,Math.max(.1,r),Math.max(.1,r*ratio),0,0,TAU);c.stroke();
}
function star(c,x,y,r,color,rot=0){
 c.fillStyle=color;c.beginPath();for(let i=0;i<8;i++){const a=rot+i*Math.PI/4,rad=i%2?r*.28:r;
  const xx=x+Math.cos(a)*rad,yy=y+Math.sin(a)*rad;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}
 c.closePath();c.fill();
}
function bolt(c,x,y,tx,ty,color,seed=0,width=2){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);
 for(let i=1;i<=7;i++){const f=i/7,noise=i===7?0:Math.sin(i*17.3+seed)*13;
  c.lineTo(lerp(x,tx,f)+noise,lerp(y,ty,f)-noise*.6);}
 c.stroke();
}
function fragments(c,x,y,r,f,v,count=12,up=false){
 for(let i=0;i<count;i++){
  const a=i*2.3999632297,rr=r*(.3+(i%5)*.15)*ease(f),sz=i%3+2;
  c.fillStyle=i%3?v.primary:v.light;c.fillRect(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.6-(up?f*50:0),sz,sz);
 }
}
function slash(c,x,y,angle,r,v,f,n=1){
 for(let i=0;i<n;i++){
  c.save();c.translate(x,y-10);c.rotate(angle+(i-n/2)*.4);c.scale(1,.68);
  c.strokeStyle=i%2?v.light:v.primary;c.lineWidth=(n>1?3:6)*(1-f)+1;
  c.beginPath();c.arc(0,0,r+i*8,-1.5+f*.7,1.2+f*.7);c.stroke();
  c.strokeStyle=v.light;c.lineWidth=1;c.beginPath();c.arc(0,0,r+4+i*8,-1.3+f*.7,.7+f*.7);c.stroke();c.restore();
 }
}
function shard(c,x,y,size,v,angle=0){
 c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=v.primary;c.beginPath();c.moveTo(0,-size);c.lineTo(size*.3,0);c.lineTo(0,size*.45);c.lineTo(-size*.3,0);c.closePath();c.fill();c.strokeStyle=v.light;c.lineWidth=1;c.beginPath();c.moveTo(0,-size);c.lineTo(0,size*.3);c.stroke();c.restore();
}
function cross(c,x,y,size,v){
 c.fillStyle=v.primary;c.fillRect(x-size*.17,y-size,size*.34,size*2);c.fillRect(x-size*.7,y-size*.35,size*1.4,size*.3);
 c.fillStyle=v.light;c.fillRect(x-1,y-size,2,size*1.8);
}
function sigil(c,x,y,r,v,f,kind='runes'){
 ring(c,x,y,r,v.primary,2);ring(c,x,y,r*.72,v.light,1);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4+f*.6,xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.65;
  if(kind==='clock'){c.fillStyle=v.light;c.fillRect(xx-2,yy-2,4,4);}
  else shard(c,xx,yy,5,v,a);
 }
 if(kind==='clock'){
  c.strokeStyle=v.light;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(f*8)*r*.65,y+Math.sin(f*8)*r*.4);c.moveTo(x,y);c.lineTo(x-r*.3,y-r*.25);c.stroke();
 }
}
function wings(c,x,y,r,v,f){
 for(const side of [-1,1]){
  c.fillStyle=v.primary;c.beginPath();c.moveTo(x,y);c.lineTo(x+side*r*.35,y-r*.5);c.lineTo(x+side*r,y-r*(.5+.3*Math.sin(f*Math.PI)));
  c.lineTo(x+side*r*.8,y-r*.1);c.lineTo(x+side*r*.55,y+r*.05);c.lineTo(x+side*r*.3,y+r*.15);c.closePath();c.fill();
  c.strokeStyle=v.light;c.lineWidth=2;for(let i=0;i<4;i++){c.beginPath();c.moveTo(x+side*10,y-5);c.lineTo(x+side*r*(.4+i*.17),y-r*(.12+i*.11));c.stroke();}
 }
}
const DEFENSIVE=new Set(['bandage','shield','leaves','barrier','smoke','cross','lotus','roar','fortress','scope','paw','snow','notes','bubbles','gear','wind','soul','clock','dragon','stars','banner','rift','eclipse','wings','crown']);
export function drawSkillEffect(renderer,e,t){
 if(!['attack','skill','armorBreak','forge','soulRecover'].includes(e.type))return false;
 const a=(t-e.born)/1000,c=renderer.ctx;
 if(['armorBreak','forge','soulRecover'].includes(e.type)){
  if(a>1.25)return true;
  const theme=THEMES[e.theme|| (e.type==='soulRecover'?'water':e.success===false?'earth':'holy')];
  c.save();c.globalAlpha=Math.max(0,1-a/1.25);
  fragments(c,e.x,e.y-25,70,a/1.25,theme,renderer.lowPower?8:18,e.type!=='armorBreak');
  ring(c,e.x,e.y,18+a*48,theme.primary,2);
  if(e.type==='forge')star(c,e.x,e.y-40,25*(1-a/1.25),theme.light,t/300);
  c.restore();return true;
 }
 const v=skillVisual(e.job||e.classId||'novice',e.skill),ultimate=e.skill==='ultimate',defensive=e.skill==='skill2';
 const duration=ultimate?1.25:defensive?1.15:e.skill==='basic'?.42:.82;
 if(a<0||a>duration)return true;
 const f=a/duration,fade=Math.min(1,(1-f)*2.8);
 const cx=(e.center==='self'?e.x:(e.tx??e.x)),cy=e.center==='self'?e.y:(e.ty??e.y);
 const angle=Math.atan2((e.ty??e.y)-e.y,(e.tx??e.x)-e.x);
 const radius=Math.min(200,Math.max(42,e.radius|| (ultimate?150:70)));
 c.save();c.globalAlpha=fade;c.lineCap='round';c.lineJoin='round';
 const count=renderer.lowPower?7:ultimate?22:12;
 if(!renderer.showEffects){
  // Reducing cosmetic effects does not hide enemy warnings or the player's cast feedback.
  ring(c,cx,cy,15+ease(f)*Math.min(50,radius),v.primary,1);c.restore();return true;
 }
 if(e.skill==='basic'){
  if(e.classId==='guardian')slash(c,e.x,e.y,angle,42,v,f);
  else{
   const travel=Math.min(1,f*2.2),xx=lerp(e.x,e.tx,travel),yy=lerp(e.y-26,e.ty-16,travel);
   if(e.classId==='ranger'){
    c.strokeStyle=v.light;c.lineWidth=2;c.beginPath();c.moveTo(xx-Math.cos(angle)*19,yy-Math.sin(angle)*19);c.lineTo(xx,yy);c.stroke();
    shard(c,xx,yy,6,v,angle+Math.PI/2);
   }else{star(c,xx,yy,6,v.light,f*5);ring(c,xx,yy,6,v.primary,2,1);}
  }
  c.restore();return true;
 }
 if(defensive){
  const x=e.x,y=e.y-23,r=25+Math.sin(f*Math.PI)*12,shape=v.shape;
  ring(c,x,y+23,r+10,v.primary,2);
  if(['shield','barrier','fortress'].includes(shape)){
   c.fillStyle=v.dark;c.globalAlpha=fade*.18;c.beginPath();c.ellipse(x,y,r,r*1.3,0,0,TAU);c.fill();c.globalAlpha=fade;
   c.strokeStyle=v.light;c.lineWidth=2;c.beginPath();
   for(let i=0;i<7;i++){const an=i*TAU/6-Math.PI/2,xx=x+Math.cos(an)*r,yy=y+Math.sin(an)*r*1.3;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();
  }else if(['cross','bandage','lotus','leaves','bubbles'].includes(shape)){
   for(let i=0;i<5;i++){const xx=x+Math.sin(i*4.2+f)*28,yy=y+20-f*65+i*5;
    if(shape==='cross'||shape==='bandage')cross(c,xx,yy,7,v);
    else if(shape==='bubbles')ring(c,xx,yy,5+i,v.light,1,1);
    else shard(c,xx,yy,9,v,i+f*3);}
  }else if(['clock','runes','gear','scope','stars'].includes(shape)){
   sigil(c,x,y+15,44,v,f,shape==='clock'?'clock':'runes');
   if(shape==='scope'){c.strokeStyle=v.light;c.beginPath();c.moveTo(x-30,y);c.lineTo(x+30,y);c.moveTo(x,y-30);c.lineTo(x,y+30);c.stroke();}
  }else if(['wings','dragon','wind'].includes(shape)){c.globalAlpha=fade*.65;wings(c,x,y+6,58,v,f);}
  else if(['rift','eclipse','smoke','soul'].includes(shape)){
   for(let i=0;i<4;i++)ring(c,x,y,22+i*6-f*10,i%2?v.dark:v.primary,3,.85);
   fragments(c,x,y,40,f,v,count,true);
  }else if(shape==='notes'){
   for(let i=0;i<5;i++){const xx=x+Math.sin(i*2.4)*30,yy=y+20-f*60+i*4;c.fillStyle=v.primary;c.fillRect(xx,yy,3,13);c.fillRect(xx,yy,9,2);c.beginPath();c.ellipse(xx-3,yy+12,5,3,-.4,0,TAU);c.fill();}
  }else if(shape==='crown'){
   c.strokeStyle=v.light;c.lineWidth=2;c.beginPath();c.moveTo(x-20,y-20);c.lineTo(x-24,y-40);c.lineTo(x-8,y-31);c.lineTo(x,y-49);c.lineTo(x+8,y-31);c.lineTo(x+24,y-40);c.lineTo(x+20,y-20);c.closePath();c.stroke();
  }else if(shape==='banner'){
   c.fillStyle=v.light;c.fillRect(x+23,y-30,2,52);c.fillStyle=v.primary;c.beginPath();c.moveTo(x+25,y-30);c.lineTo(x+50,y-23);c.lineTo(x+25,y-10);c.fill();
  }else fragments(c,x,y,42,f,v,count,true);
  c.restore();return true;
 }
 const shape=v.shape;
 if(['sweep','crossSlash','runeSlash','blades','dance','daggers','scythe','eclipse'].includes(shape)){
  const multi=['blades','dance','daggers'].includes(shape)?3:shape==='crossSlash'?2:1;
  for(let i=0;i<multi;i++)slash(c,e.x+(i-multi/2)*7,e.y,angle+(i%2?1.5:0),ultimate?95:65,v,f,multi===1?1:2);
  if(['runeSlash','eclipse'].includes(shape))sigil(c,cx,cy,radius*.75,v,f);
  if(shape==='scythe'||shape==='eclipse')ring(c,e.x,e.y-18,60+f*40,v.light,5,.7);
 }else if(['arrow','beam','lance','lances','cannon'].includes(shape)){
  const travel=ease(Math.min(1,f*2.2)),xx=lerp(e.x,cx,travel),yy=lerp(e.y-24,cy-16,travel);
  if(['beam','cannon'].includes(shape)){
   c.strokeStyle=v.dark;c.lineWidth=ultimate?22:10;c.beginPath();c.moveTo(e.x,e.y-23);c.lineTo(cx,cy-18);c.stroke();
   c.strokeStyle=v.light;c.lineWidth=ultimate?5:2;c.stroke();ring(c,cx,cy,18+f*40,v.primary,3,1);
  }else{
   const n=shape==='lances'?5:1;
   for(let i=0;i<n;i++)shard(c,xx+(i-(n-1)/2)*12,yy,ultimate?35:23,v,angle+Math.PI/2);
  }
 }else if(['lightning','storm'].includes(shape)){
  for(let i=0;i<(ultimate?5:3);i++){
   const off=(i-(ultimate?2:1))*30,xx=cx+off,yy=cy+Math.sin(i)*30;
   bolt(c,xx-12,yy-(ultimate?230:130),xx,yy,v.primary,Math.floor(f*8)+i,ultimate?5:3);
   bolt(c,xx-12,yy-(ultimate?230:130),xx,yy,v.light,Math.floor(f*8)+i,1);
   ring(c,xx,yy,15+f*30,v.primary,1);
  }
 }else if(['icicles','blizzard'].includes(shape)){
  for(let i=0;i<count;i++){const an=i*2.4,rr=radius*.8*((i%5+1)/5);
   shard(c,cx+Math.cos(an)*rr,cy+Math.sin(an)*rr*.6-90*(1-f),14+(i%4)*3,v,-.25);}
  ring(c,cx,cy,radius*ease(f),v.light,2);
 }else if(['flame','inferno','bomb','spores','alchemy'].includes(shape)){
  const fiery=['flame','inferno'].includes(shape);
  for(let i=0;i<count;i++){
   const an=i*2.4,rr=(20+radius*.65*f)*((i%5+1)/5),xx=cx+Math.cos(an)*rr,yy=cy+Math.sin(an)*rr*.5;
   if(fiery){
    c.fillStyle=i%3?v.primary:v.light;c.beginPath();c.moveTo(xx-7,yy+5);c.lineTo(xx-5,yy-18);
    c.lineTo(xx+Math.sin(f*15+i)*5,yy-35-(ultimate?25:0)*Math.sin(f*Math.PI));c.lineTo(xx+8,yy-9);c.closePath();c.fill();
   }else{ring(c,xx,yy-f*25,5+i%5,v.primary,2,1);star(c,xx,yy-5,3,v.light);}
  }
  ring(c,cx,cy,radius*ease(f),v.primary,3);
  if(shape==='alchemy')sigil(c,cx,cy,radius*.7,v,f);
 }else if(['vines','garden','tree','seasons'].includes(shape)){
  for(let i=0;i<(ultimate?8:5);i++){
   const an=i*TAU/(ultimate?8:5),xx=cx+Math.cos(an)*radius*.7,yy=cy+Math.sin(an)*radius*.45;
   c.strokeStyle=v.primary;c.lineWidth=3;c.beginPath();c.moveTo(xx,yy);c.bezierCurveTo(xx-20,yy-20*f,xx+20,yy-60*f,xx,yy-90*f);c.stroke();
   shard(c,xx-10,yy-45*f,12,v,-.6);shard(c,xx+10,yy-70*f,12,v,.8);
  }
  ring(c,cx,cy,radius*ease(f),v.light,1);
 }else if(['rocks','quake','shieldBash','fortress'].includes(shape)){
  ring(c,cx,cy,radius*ease(f),v.primary,5);
  for(let i=0;i<(ultimate?9:5);i++){
   const an=i*2.4,rr=radius*ease(f)*.7,xx=cx+Math.cos(an)*rr,yy=cy+Math.sin(an)*rr*.5;
   c.fillStyle=v.dark;c.strokeStyle=v.light;c.lineWidth=1;c.beginPath();c.moveTo(xx-11,yy);c.lineTo(xx-8,yy-20*Math.sin(f*Math.PI));c.lineTo(xx+4,yy-30*Math.sin(f*Math.PI));c.lineTo(xx+13,yy-3);c.closePath();c.fill();c.stroke();
  }
 }else if(['fists','claws','wolves'].includes(shape)){
  for(let i=0;i<(ultimate?8:3);i++){
   const xx=cx+Math.sin(i*2.4)*radius*.65,yy=cy+Math.cos(i*2.4)*radius*.4;
   if(shape==='fists'){ring(c,xx,yy,10+f*8,v.primary,4,1);star(c,xx,yy,7,v.light);}
   else for(let j=0;j<3;j++){c.strokeStyle=j%2?v.light:v.primary;c.lineWidth=2;c.beginPath();c.moveTo(xx-12+j*7,yy-20);c.lineTo(xx+j*7,yy+10);c.stroke();}
  }
 }else if(['notes','symphony'].includes(shape)){
  for(let i=0;i<count;i++){
   const an=i*2.4+f,xx=cx+Math.cos(an)*radius*f,yy=cy+Math.sin(an)*radius*f*.55-f*25;
   c.fillStyle=i%2?v.primary:v.light;c.fillRect(xx,yy-14,2,17);c.fillRect(xx,yy-14,8,2);c.beginPath();c.ellipse(xx-3,yy+2,5,3,-.3,0,TAU);c.fill();
  }ring(c,cx,cy,radius*ease(f),v.primary,2);
 }else if(['clock','timewarp','runes','gear'].includes(shape)){
  sigil(c,cx,cy,radius*(.65+.2*Math.sin(f*Math.PI)),v,shape==='timewarp'?1-f:f,shape==='clock'||shape==='timewarp'?'clock':'runes');
  if(ultimate)sigil(c,cx,cy,radius*.35,v,-f);
 }else if(['soul','spirits','rift','blackhole'].includes(shape)){
  c.fillStyle=v.dark;c.globalAlpha=fade*.55;c.beginPath();c.ellipse(cx,cy-10,20+radius*.5*Math.sin(f*Math.PI),14+radius*.3*Math.sin(f*Math.PI),0,0,TAU);c.fill();c.globalAlpha=fade;
  for(let i=0;i<6;i++){
   const an=i*TAU/6+f*3,rr=radius*(1-f*.75);star(c,cx+Math.cos(an)*rr,cy-10+Math.sin(an)*rr*.6,5,v.light);
  }ring(c,cx,cy-10,radius*(1-f*.5),v.primary,2);
 }else if(['wings','phoenix','dragon'].includes(shape)){
  const xx=lerp(e.x,cx,ease(f)),yy=lerp(e.y-15,cy-35,ease(f));
  wings(c,xx,yy,ultimate?110:65,v,f);
  c.fillStyle=v.light;c.beginPath();c.moveTo(xx-6,yy+12);c.lineTo(xx,yy-30);c.lineTo(xx+9,yy+8);c.fill();
  fragments(c,cx,cy,radius*.8,f,v,count,true);
 }else if(['wave','tide'].includes(shape)){
  for(let i=0;i<(ultimate?5:3);i++){
   c.strokeStyle=i%2?v.light:v.primary;c.lineWidth=ultimate?5:3;c.beginPath();
   const spread=radius*ease(f);
   for(let j=0;j<21;j++){const xx=cx-spread+j*spread/10,yy=cy+(i-2)*15+Math.sin(j*.6-f*8+i)*12-f*30;
    j?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();
  }
 }else if(['swords','lances','pillars','rain','meteor'].includes(shape)){
  for(let i=0;i<(ultimate?9:4);i++){
   const xx=cx+Math.sin(i*2.4)*radius*.7,yy=cy+Math.cos(i*2.4)*radius*.45;
   const fall=Math.min(1,f*2+i*.03),endY=yy-150*(1-fall);
   if(shape==='pillars'){c.fillStyle=v.primary;c.globalAlpha=fade*.4;c.fillRect(xx-5,yy-160*ease(f),10,160*ease(f));c.globalAlpha=fade;}
   else{shard(c,xx,endY,shape==='meteor'?25:18,v,-.2);c.strokeStyle=v.light;c.lineWidth=1;c.beginPath();c.moveTo(xx+20,endY-70);c.lineTo(xx,endY);c.stroke();}
   if(f>.45)ring(c,xx,yy,20+(f-.45)*25,v.primary,1);
  }
 }else if(['constellation','threads','weave','supernova','orb','burst','banner','crown'].includes(shape)){
  const points=Array.from({length:ultimate?8:5},(_,i)=>{
   const an=i*TAU/(ultimate?8:5)+f*.6;return [cx+Math.cos(an)*radius*.8*ease(f),cy+Math.sin(an)*radius*.5*ease(f)];
  });
  c.strokeStyle=v.primary;c.lineWidth=ultimate?2:1;c.beginPath();
  for(let i=0;i<points.length;i++){const p=points[(i*3)%points.length];i?c.lineTo(...p):c.moveTo(...p);}c.closePath();c.stroke();
  for(const [x,y]of points)star(c,x,y,ultimate?9:5,v.light,f);
  if(['supernova','orb','burst'].includes(shape))star(c,cx,cy-15,(ultimate?65:25)*Math.sin(f*Math.PI),v.primary,f*2);
  if(shape==='crown'){
   c.strokeStyle=v.light;c.lineWidth=4;c.beginPath();c.moveTo(cx-40,cy-45);c.lineTo(cx-45,cy-90);c.lineTo(cx-15,cy-70);c.lineTo(cx,cy-110);c.lineTo(cx+15,cy-70);c.lineTo(cx+45,cy-90);c.lineTo(cx+40,cy-45);c.closePath();c.stroke();
  }
 }else{ring(c,cx,cy,radius*ease(f),v.primary,3);fragments(c,cx,cy,radius,f,v,count);}
 c.restore();return true;
}
