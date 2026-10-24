import {THEMES} from '../shared/visuals.js';

const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const banks=new WeakMap(),eventIds=new WeakMap();
let sequence=0;

export const PIXEL_FX_LIMITS=Object.freeze({normalFrames:72,lowFrames:28,normalPixels:1250000,lowPixels:420000,maxSide:384});
export const pixelPalette=(theme='star')=>({ink:'#111b30',core:'#fffbea',...(THEMES[theme]||THEMES.star)});
export const pixelEventKey=e=>e.castId??e._pixelId??(eventIds.has(e)?eventIds.get(e):(eventIds.set(e,++sequence),sequence));

/** Raster primitives use only whole low-resolution cells. No rotated/scaled vector paths. */
export class PixelPainter {
 constructor(context,box,cell){this.c=context;this.box=box;this.cell=cell;this.color='';this.ops=0;}
 point(x,y){return [Math.round((finite(x)-this.box.x)/this.cell),Math.round((finite(y)-this.box.y)/this.cell)];}
 ink(color){if(color!==this.color){this.c.fillStyle=color;this.color=color;}}
 block(x,y,w,h,color){if(w<=0||h<=0)return;this.ink(color);this.c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));this.ops++;}
 rect(x,y,w,h,color){const [px,py]=this.point(x,y);this.block(px,py,w/this.cell,h/this.cell,color);}
 dot(x,y,size,color){const [px,py]=this.point(x,y),s=Math.max(1,Math.round(size/this.cell));this.block(px-Math.floor(s/2),py-Math.floor(s/2),s,s,color);}
 alpha(value,draw){const previous=this.c.globalAlpha;this.c.globalAlpha=Math.round(clamp(value,0,1)*16)/16;draw();this.c.globalAlpha=previous;}
 line(x,y,tx,ty,color,width=this.cell){
  let [x0,y0]=this.point(x,y);const [x1,y1]=this.point(tx,ty),dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;
  const size=Math.max(1,Math.round(width/this.cell)),offset=Math.floor(size/2);let error=dx+dy;
  for(let limit=0;limit<2048;limit++){
   this.block(x0-offset,y0-offset,size,size,color);if(x0===x1&&y0===y1)break;
   const twice=2*error;if(twice>=dy){error+=dy;x0+=sx;}if(twice<=dx){error+=dx;y0+=sy;}
  }
 }
 poly(points,color){
  const pts=points.map(([x,y])=>this.point(x,y));if(pts.length<3)return;
  const low=Math.max(0,Math.min(...pts.map(p=>p[1]))),high=Math.min(Math.ceil(this.box.height/this.cell),Math.max(...pts.map(p=>p[1])));
  for(let y=low;y<=high;y++){
   const crosses=[];
   for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i],b=pts[j];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))crosses.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
   }
   crosses.sort((a,b)=>a-b);
   for(let i=0;i+1<crosses.length;i+=2){const x=Math.ceil(crosses[i]),end=Math.floor(crosses[i+1]);if(end>=x)this.block(x,y,end-x+1,1,color);}
  }
 }
 outline(points,color,width=this.cell,closed=true){for(let i=1;i<points.length;i++)this.line(...points[i-1],...points[i],color,width);if(closed&&points.length>2)this.line(...points.at(-1),...points[0],color,width);}
 band(x,y,outer,inner,color,ratio=1){
  outer=Math.max(0,finite(outer));inner=clamp(finite(inner),0,outer);if(!outer)return;
  const [cx,cy]=this.point(x,y),rx=outer/this.cell,ry=Math.max(.1,rx*ratio),ix=inner/this.cell,iy=ix*ratio;
  for(let row=Math.ceil(-ry);row<=Math.floor(ry);row++){
   const edge=Math.floor(rx*Math.sqrt(Math.max(0,1-row*row/(ry*ry))));
   if(inner>0&&Math.abs(row)<iy){
    const hole=Math.ceil(ix*Math.sqrt(Math.max(0,1-row*row/(iy*iy))));
    this.block(cx-edge,cy+row,edge-hole+1,1,color);this.block(cx+hole,cy+row,edge-hole+1,1,color);
   }else this.block(cx-edge,cy+row,edge*2+1,1,color);
  }
 }
 disk(x,y,r,color,ratio=1){this.band(x,y,r,0,color,ratio);}
 arc(x,y,r,color,width=this.cell,ratio=1,start=0,end=TAU){
  if(!(r>0))return;
  const n=Math.min(900,Math.max(8,Math.ceil(Math.abs(end-start)*r/this.cell)));
  for(let i=0;i<=n;i++){const a=start+(end-start)*i/n;this.dot(x+Math.cos(a)*r,y+Math.sin(a)*r*ratio,width,color);}
 }
 diamond(x,y,r,color,outline){const pts=[[x,y-r],[x+r*.6,y],[x,y+r],[x-r*.6,y]];this.poly(pts,color);if(outline)this.outline(pts,outline,this.cell);}
 spark(x,y,r,color,core){
  this.line(x-r,y,x+r,y,color,this.cell);this.line(x,y-r,x,y+r,color,this.cell);
  if(r>9){this.line(x-r*.45,y-r*.45,x+r*.45,y+r*.45,color,this.cell);this.line(x-r*.45,y+r*.45,x+r*.45,y-r*.45,color,this.cell);}
  this.dot(x,y,Math.max(this.cell,r*.25),core||color);
 }
}

function canvasFor(renderer,w,h){
 const canvas=renderer.createPixelCanvas?renderer.createPixelCanvas(w,h):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):typeof document!=='undefined'?document.createElement('canvas'):null;
 if(!canvas)return null;canvas.width=w;canvas.height=h;return canvas;
}

/** Bounded LRU of animation frames. Repeated render frames reuse the same pixel bitmap. */
export function pixelLayer(renderer,key,bounds,draw,{cell=renderer.lowPower?4:3,alpha=1}={}){
 if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)return false;
 const max=PIXEL_FX_LIMITS.maxSide;
 cell=Math.max(cell,Math.ceil(Math.max(bounds.width,bounds.height)/max));
 const box={x:Math.floor(bounds.x/cell)*cell,y:Math.floor(bounds.y/cell)*cell};
 const width=Math.min(max,Math.ceil((bounds.x+bounds.width-box.x)/cell)+1),height=Math.min(max,Math.ceil((bounds.y+bounds.height-box.y)/cell)+1);
 box.width=width*cell;box.height=height*cell;
 if(renderer.camera&&renderer.w&&renderer.h&&renderer.zoom){
  const hx=renderer.w/renderer.zoom/2+60,hy=renderer.h/renderer.zoom/2+60;
  if(box.x>renderer.camera.x+hx||box.x+box.width<renderer.camera.x-hx||box.y>renderer.camera.y+hy||box.y+box.height<renderer.camera.y-hy)return false;
 }
 let bank=banks.get(renderer);if(!bank){bank={frames:new Map(),pixels:0,created:0};banks.set(renderer,bank);}
 const limit=renderer.lowPower?PIXEL_FX_LIMITS.lowFrames:PIXEL_FX_LIMITS.normalFrames,pixels=renderer.lowPower?PIXEL_FX_LIMITS.lowPixels:PIXEL_FX_LIMITS.normalPixels;
 const id=`${key}:${renderer.lowPower?1:0}:${renderer.showEffects?1:0}:${cell}:${box.x}:${box.y}:${width}:${height}`;let frame=bank.frames.get(id);
 if(frame){bank.frames.delete(id);bank.frames.set(id,frame);}
 else{
  const bitmap=canvasFor(renderer,width,height);if(!bitmap)return false;
  const context=bitmap.getContext('2d');context.imageSmoothingEnabled=false;context.clearRect(0,0,width,height);
  draw(new PixelPainter(context,box,cell));
  frame={bitmap,area:width*height};bank.frames.set(id,frame);bank.pixels+=frame.area;bank.created++;
 }
 while(bank.frames.size>limit||bank.pixels>pixels){const oldest=bank.frames.keys().next().value;if(oldest===undefined)break;bank.pixels-=bank.frames.get(oldest).area;bank.frames.delete(oldest);}
 const c=renderer.ctx;c.save();c.imageSmoothingEnabled=false;c.globalAlpha=clamp(alpha,0,1);c.drawImage(frame.bitmap,box.x,box.y,box.width,box.height);c.restore();
 return true;
}
export function pixelFXStats(renderer){const b=banks.get(renderer);return {frames:b?.frames.size||0,pixels:b?.pixels||0,created:b?.created||0};}
export function clearPixelFX(renderer){banks.delete(renderer);}

export function beamCorners(cast,padding=0){
 const angle=finite(cast.angle),dx=Math.cos(angle),dy=Math.sin(angle),half=Math.max(1,finite(cast.width,70))/2+padding,length=Math.max(1,finite(cast.length,200));
 const x=finite(cast.x),y=finite(cast.y);
 return [[x-dy*half,y+dx*half],[x+dx*length-dy*half,y+dy*length+dx*half],[x+dx*length+dy*half,y+dy*length-dx*half],[x+dy*half,y-dx*half]];
}
export function castBounds(cast,pad=12){
 if(cast.shape==='beam'){
  const pts=beamCorners(cast,pad),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,width:Math.max(...xs)-Math.min(...xs)+pad*2,height:Math.max(...ys)-Math.min(...ys)+pad*2};
 }
 const radius=Math.max(8,finite(cast.radius,70));return {x:finite(cast.x)-radius-pad,y:finite(cast.y)-radius-pad,width:(radius+pad)*2,height:(radius+pad)*2};
}

function hazardFill(p,cast,color,alpha){
 p.alpha(alpha,()=>{
  if(cast.shape==='beam')p.poly(beamCorners(cast),color);
  else if(cast.shape==='quadrant'){
   const r=finite(cast.radius,210),safe=cast.safeQuadrant??cast.quadrant;
   for(let q=0;q<4;q++)if(q!==safe){const start=[Math.PI,-Math.PI/2,0,Math.PI/2][q],points=[[cast.x,cast.y]];for(let i=0;i<=18;i++){const a=start+i*Math.PI/36;points.push([cast.x+Math.cos(a)*r,cast.y+Math.sin(a)*r]);}p.poly(points,color);}
   p.rect(cast.x-12,cast.y-r,24,r*2,color);p.rect(cast.x-r,cast.y-12,r*2,24,color);
  }else p.band(cast.x,cast.y,finite(cast.radius,70),cast.shape==='ring'?finite(cast.inner):0,color);
 });
}
function hazardOutline(p,cast,color,width){
 if(cast.shape==='beam')p.outline(beamCorners(cast),color,width);
 else{p.arc(cast.x,cast.y,finite(cast.radius,70),color,width);if(cast.shape==='ring')p.arc(cast.x,cast.y,finite(cast.inner),color,width);}
}
function safeQuarter(cast,dx,dy){
 if(cast.shape!=='quadrant'||Math.abs(dx)<12||Math.abs(dy)<12)return false;
 const quadrant=dx<0?(dy<0?0:3):(dy<0?1:2);
 return quadrant===(cast.safeQuadrant??cast.quadrant);
}

/** Damage footprint is persistent; the animated progress accents never replace its boundary. */
export function drawPixelTelegraph(renderer,cast,t,layer='all'){
 if(!Number.isFinite(cast?.x)||!Number.isFinite(cast?.y))return;
 const now=Date.now()+finite(renderer.clock),duration=Math.max(1,finite(cast.ends,now+1)-finite(cast.starts,now));
 const progress=clamp((now-finite(cast.starts,now))/duration,0,1),frame=Math.floor(progress*20),urgent=progress>=.75;
 const danger=cast.boss?'#ff895d':'#efb65d',core=urgent?'#fff3be':'#ffd39a';
 const box=castBounds(cast,10),key=`warn:${cast.id??pixelEventKey(cast)}:${cast.starts}:${layer}:${frame}`;
 pixelLayer(renderer,key,box,p=>{
  if(layer!=='foreground'){
   hazardFill(p,cast,'#1c0c25',.55);hazardFill(p,cast,danger,urgent?.28:.19);
   if(cast.shape==='beam'){
    const a=finite(cast.angle),nx=-Math.sin(a),ny=Math.cos(a),length=finite(cast.length,200),width=finite(cast.width,70);
    for(let d=12;d<length;d+=30){const x=cast.x+Math.cos(a)*d,y=cast.y+Math.sin(a)*d;p.alpha(.38,()=>p.line(x-nx*width*.35,y-ny*width*.35,x+nx*width*.35+Math.cos(a)*15,y+ny*width*.35+Math.sin(a)*15,danger,p.cell));}
   }else{
    const r=finite(cast.radius,70),inner=cast.shape==='ring'?finite(cast.inner):0,spacing=renderer.lowPower?30:24;
    for(let y=-r;y<=r;y+=spacing)for(let x=-r;x<=r;x+=spacing){const d=Math.hypot(x,y);if(d>inner+7&&d<r-7&&!safeQuarter(cast,x,y)&&(Math.round(x/spacing)+Math.round(y/spacing))%2===0)p.alpha(.45,()=>p.dot(cast.x+x,cast.y+y,p.cell,danger));}
   }
  }
  if(layer!=='ground'){
   hazardOutline(p,cast,'#111329',p.cell*3);hazardOutline(p,cast,danger,p.cell*2);hazardOutline(p,cast,core,p.cell);
   if(cast.shape==='beam'){
    const a=finite(cast.angle),d=finite(cast.length,200)*progress,nx=-Math.sin(a),ny=Math.cos(a),w=finite(cast.width,70)*.42;
    p.line(cast.x+Math.cos(a)*d-nx*w,cast.y+Math.sin(a)*d-ny*w,cast.x+Math.cos(a)*d+nx*w,cast.y+Math.sin(a)*d+ny*w,core,p.cell*2);
   }else{
    const r=finite(cast.radius,70);p.arc(cast.x,cast.y,r+5,core,p.cell,1,-Math.PI/2,-Math.PI/2+TAU*progress);
    const inner=cast.shape==='ring'?finite(cast.inner):0,at=inner+(r-inner)*.55;
    for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,dx=Math.cos(a)*at,dy=Math.sin(a)*at,x=cast.x+dx,y=cast.y+dy;if(!safeQuarter(cast,dx,dy)){p.line(x,y-5,x,y+2,danger,p.cell);p.dot(x,y+8,p.cell,core);}}
    if(cast.shape==='quadrant'){
     const start=[Math.PI,-Math.PI/2,0,Math.PI/2][cast.safeQuadrant??cast.quadrant];
     if(Number.isFinite(start))p.arc(cast.x,cast.y,r,'#a4f3d0',p.cell,1,start,start+Math.PI/2);
     p.line(cast.x-12,cast.y-r,cast.x-12,cast.y+r,danger,p.cell);p.line(cast.x+12,cast.y-r,cast.x+12,cast.y+r,danger,p.cell);
     p.line(cast.x-r,cast.y-12,cast.x+r,cast.y-12,danger,p.cell);p.line(cast.x-r,cast.y+12,cast.x+r,cast.y+12,danger,p.cell);
    }
   }
  }
 },{cell:renderer.lowPower?4:3});
 if(layer!=='ground'&&cast.boss){
  const x=cast.shape==='beam'?cast.x+Math.cos(finite(cast.angle))*finite(cast.length,200)*.5:cast.x;
  const y=cast.shape==='beam'?cast.y+Math.sin(finite(cast.angle))*finite(cast.length,200)*.5:cast.y;
  renderer.label?.(`${cast.order?cast.order+' · ':''}${cast.active?'잔류 위험 · ':''}${cast.name||'위험 공격'} · ${Math.max(0,(cast.ends-now)/1000).toFixed(1)}초`,x,y-12,'#ffe8b7',10);
 }
}

export function drawPixelImpact(renderer,e,t){
 const duration=e.boss?850:500,age=t-e.born;if(age<0||age>duration)return true;
 const f=Math.floor(age/(renderer.lowPower?80:50))*(renderer.lowPower?80:50)/duration;
 const v=pixelPalette(e.theme||'fire'),box=castBounds(e,80),radius=finite(e.radius,70),inner=e.shape==='ring'?finite(e.inner):0;
 pixelLayer(renderer,`impact:${pixelEventKey(e)}:${Math.floor(f*30)}`,box,p=>{
  hazardFill(p,e,v.dark,.48*(1-f));hazardFill(p,e,v.light,(f<.2?.65:.24)*(1-f));
  if(e.shape==='quadrant'){
   hazardFill(p,e,v.primary,.38*(1-f));
   const safe=e.safeQuadrant??e.quadrant;
   for(let q=0;q<4;q++)if(q!==safe){const a=[Math.PI*1.25,-Math.PI/4,Math.PI/4,Math.PI*.75][q];p.spark(e.x+Math.cos(a)*radius*.58,e.y+Math.sin(a)*radius*.58,30*(1-f),v.light,v.core);}
  }else if(e.shape==='beam'){
   const angle=finite(e.angle),length=finite(e.length,200),x2=e.x+Math.cos(angle)*length,y2=e.y+Math.sin(angle)*length;
   p.line(e.x,e.y,x2,y2,v.primary,Math.max(6,finite(e.width,70)*(1-f)*.44));p.line(e.x,e.y,x2,y2,v.light,Math.max(3,12*(1-f)));
   for(let d=0;d<=length;d+=48){const x=e.x+Math.cos(angle)*d,y=e.y+Math.sin(angle)*d;p.spark(x,y,12*(1-f),v.core,v.light);}
  }else{
   const wave=inner+(radius-inner)*(.4+f*.6);
   p.arc(e.x,e.y,wave,v.ink,p.cell*4);p.arc(e.x,e.y,wave,v.primary,p.cell*3);p.arc(e.x,e.y,wave,v.light,p.cell);
   p.arc(e.x,e.y,radius,v.light,p.cell);if(inner)p.arc(e.x,e.y,inner,v.core,p.cell);
  }
  const count=renderer.showEffects?(renderer.lowPower?7:16):4;
  for(let i=0;i<count;i++){
   const angle=i*2.39996,rr=inner+(radius-inner)*(.3+(i%5)*.15),x=e.x+Math.cos(angle)*rr,y=e.y+Math.sin(angle)*rr;
   if(e.shape==='beam')continue;
   if(e.shape==='quadrant'){const q=x<e.x?(y<e.y?0:3):(y<e.y?1:2);if(q===(e.safeQuadrant??e.quadrant))continue;}
   if(e.theme==='thunder'&&i%3===0&&f<.7){
    const pts=[[x-12,y-75*(1-f)],[x+6,y-48*(1-f)],[x-9,y-30*(1-f)],[x,y]];
    p.outline(pts,v.dark,9,false);p.outline(pts,v.light,3,false);
   }else if(e.theme==='ice')p.diamond(x,y-f*34,11*(1-f)+3,v.primary,v.light);
   else p.dot(x+Math.cos(angle)*f*28,y-Math.sin(f*Math.PI)*30,3+(i%3)*3,i%2?v.primary:v.light);
  }
 },{alpha:Math.min(1,(1-f)*2)});
 return true;
}
