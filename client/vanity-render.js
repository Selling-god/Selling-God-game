import {COSMETICS,PIXEL_WIDTH,PIXEL_HEIGHT,PIXEL_PALETTE,validPortrait} from '../shared/personalization.js';
// Player-visible cosmetics are data-only sprites. No arbitrary uploaded SVG or code is executed.
const cache=new Map();
function avatarCanvas(pixels){
 if(!validPortrait(pixels))return null;
 let cv=cache.get(pixels);if(cv)return cv;
 cv=document.createElement('canvas');cv.width=PIXEL_WIDTH;cv.height=PIXEL_HEIGHT;
 const ctx=cv.getContext('2d'),img=ctx.createImageData(PIXEL_WIDTH,PIXEL_HEIGHT);
 for(let i=0;i<pixels.length;i++){
  const n=parseInt(pixels[i],16),h=PIXEL_PALETTE[n];if(!n)continue;
  img.data[4*i]=parseInt(h.slice(1,3),16);img.data[4*i+1]=parseInt(h.slice(3,5),16);img.data[4*i+2]=parseInt(h.slice(5,7),16);img.data[4*i+3]=255;
 }
 ctx.putImageData(img,0,0);cache.set(pixels,cv);
 if(cache.size>45)cache.delete(cache.keys().next().value);
 return cv;
}
export function customPortraitURL(pixels){const cv=avatarCanvas(pixels);return cv?cv.toDataURL('image/png'):null;}
const item=(p,slot)=>COSMETICS[p.vanity?.slots?.[slot]];
export function drawVanityBack(renderer,p,x,y,t){
 const c=renderer.ctx,aura=item(p,'aura'),wings=item(p,'wings');
 c.save();
 if(aura){
  const time=t/700;
  c.strokeStyle=aura.color;c.lineWidth=2;c.globalAlpha=.5;
  for(let i=0;i<12;i++){
   const rad=i*Math.PI/6+time*.12,r=23+2*Math.sin(time+i);
   c.fillStyle=aura.color;c.fillRect(Math.round(x+Math.cos(rad)*r),Math.round(y-13+Math.sin(rad)*r*.7),3,3);
  }
  c.beginPath();c.ellipse(x,y,22+2*Math.sin(time),8,0,0,Math.PI*2);c.stroke();
 }
 if(wings){
  c.globalAlpha=.85;c.fillStyle=wings.color;
  const flap=1+Math.sin(t/300)*.1;
  for(const side of [-1,1])for(let row=0;row<4;row++){
   const sx=x+side*(11+row*5)*flap,sy=y-37+row*7;
   c.fillRect(Math.round(sx-3),Math.round(sy),side<0?8:8,5);
   c.fillRect(Math.round(sx+side*4),Math.round(sy+5),5,4);
  }
 }
 c.restore();
}
export function drawVanityBody(renderer,p,x,y,t){
 const c=renderer.ctx, costume=item(p,'costume'),pixels=p.vanity?.avatarPixels;
 if(pixels){const cv=avatarCanvas(pixels);if(cv){c.imageSmoothingEnabled=false;c.drawImage(cv,Math.round(x-20),Math.round(y-53),40,54);}}
 if(costume){
  c.save();c.fillStyle=costume.color;c.globalAlpha=.85;
  for(const side of [-1,1]){
   c.fillRect(Math.round(x+side*9-4),Math.round(y-28),7,15);
   c.fillRect(Math.round(x+side*13-3),Math.round(y-13),6,5);
  }
  c.fillRect(Math.round(x-12),Math.round(y-37),24,5);
  c.fillStyle='#24343e';c.fillRect(Math.round(x-5),Math.round(y-34),10,3);
  c.restore();
 }
}
export function drawVanityName(renderer,p,x,y,self,party){
 const c=renderer.ctx,tag=item(p,'nametag');
 if(tag){
  const width=Math.min(160,Math.max(62,renderer.ctx.measureText(p.name).width+32));
  c.save();c.globalAlpha=.95;c.fillStyle='#13232ce6';c.fillRect(x-width/2,y-70,width,19);
  c.strokeStyle=tag.color;c.lineWidth=1.5;c.strokeRect(x-width/2,y-70,width,19);
  c.fillStyle=tag.color;c.fillRect(x-width/2-4,y-66,4,10);c.fillRect(x+width/2,y-66,4,10);c.restore();
 }
 renderer.label(p.name,x,y-62,tag?.color|| (self?'#f2dbab':party?'#b2dfba':'#c2d6da'),10);
}
export function drawVanityEntrance(renderer,p,x,y,now){
 const entry=item(p,'entrance');if(!entry||!(p.arrivedAt>0))return;
 const progress=(now-p.arrivedAt)/1800;if(progress<0||progress>1)return;
 const c=renderer.ctx;c.save();c.globalAlpha=1-progress;c.fillStyle=entry.color;c.strokeStyle=entry.color;c.lineWidth=3;
 const radius=(1-progress)*38+17;
 c.strokeRect(Math.round(x-radius),Math.round(y-60-(1-progress)*15),Math.round(radius*2),Math.round(radius*1.9));
 for(let i=0;i<12;i++){
  const angle=(i*7.4+tweak(progress))*Math.PI/6;
  const px=x+Math.cos(angle)*radius*1.35,py=y-25+Math.sin(angle)*radius*.9;
  c.fillRect(Math.round(px),Math.round(py),i%3===0?5:3,i%3===0?5:3);
 }
 c.restore();
}
const tweak=n=>n*2;
