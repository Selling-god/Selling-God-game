import {moveEntity,dist,findPath,clamp} from '../shared/world.js';

/** Independent of DOM: tested with artificial network delay and snapshot jitter. */
export class SnapshotTrack {
 constructor(){this.samples=[];}
 push(t,entity){
  const last=this.samples.at(-1);
  if(last&&t<=last.t)return;
  if(last&&dist(last,entity)>260)this.samples=[];
  this.samples.push({t,x:entity.x,y:entity.y,vx:entity.vx||0,vy:entity.vy||0});
  if(this.samples.length>12)this.samples.shift();
 }
 sample(t){
  const s=this.samples;if(!s.length)return null;
  if(t<=s[0].t)return {...s[0]};
  for(let i=1;i<s.length;i++)if(t<=s[i].t){
   const a=s[i-1],b=s[i],f=clamp((t-a.t)/(b.t-a.t),0,1);
   return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
  }
  const last=s.at(-1),before=s.at(-2),dt=Math.min(60,Math.max(0,t-last.t))/1000;
  const vx=last.vx|| (before?(last.x-before.x)/Math.max(.001,(last.t-before.t)/1000):0);
  const vy=last.vy|| (before?(last.y-before.y)/Math.max(.001,(last.t-before.t)/1000):0);
  return {x:last.x+vx*dt,y:last.y+vy*dt};
 }
}
export class LocalMotion {
 constructor(){this.position=null;this.history=[];this.correction={x:0,y:0};this.path=[];this.dashEnd=0;this.dashVector={x:0,y:0};this.lastServerAt=0;this.rtt=100;this.motionId=null;this.zone=null;this.lastDelta={x:0,y:0};}
 reset(s,zone,now){
  this.position={x:s.x,y:s.y,zone};this.zone=zone;this.motionId=s.motionId||0;
  this.history=[{t:now,x:s.x,y:s.y}];this.correction={x:0,y:0};this.path=[];this.dashEnd=0;this.dashVector={x:0,y:0};this.lastDelta={x:0,y:0};this.lastServerAt=now;
 }
 accept(s,zone,now,map){
  this.lastServerAt=now;
  if(!this.position||zone!==this.zone||(s.motionId||0)!==this.motionId||dist(this.position,s)>260){this.reset(s,zone,now);return;}
  const targetTime=now-clamp(this.rtt/2,0,200),h=this.history;
  let past=h[0]||this.position;
  for(let i=1;i<h.length;i++){
   if(h[i].t>=targetTime){const a=h[i-1],b=h[i],f=clamp((targetTime-a.t)/Math.max(1,b.t-a.t),0,1);past={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};break;}
   past=h[i];
  }
  // Corrections are applied across render frames, never directly at packet arrival.
  const dx=s.x-past.x,dy=s.y-past.y,error=Math.hypot(dx,dy);
  // Small packet-level differences are visual noise. Do not twitch the camera at every snapshot.
  if(error<2.5){this.correction.x*=.65;this.correction.y*=.65;}
  else{
    const cap=Math.min(42,error),blend=error>25?1:.55;
    this.correction={x:dx/error*cap*blend,y:dy/error*cap*blend};
  }
  if(s.hp<=0){this.path=[];this.dashEnd=0;}
 }
 click(map,target){if(this.position)this.path=findPath(map,this.position,target);}
 stop(){this.path=[];this.dashEnd=0;}
 dash(v,now,dir='s'){
  if(Math.hypot(v.x,v.y)<.1)v=({s:{x:0,y:1},n:{x:0,y:-1},e:{x:1,y:0},w:{x:-1,y:0}})[dir]||{x:0,y:1};
  this.dashVector={...v};this.dashEnd=now+190;
 }
 step(map,v,s,dt,now,serverNow){
  if(!this.position)return;
  dt=clamp(dt,0,.09);
  if(s.hp<=0||now-this.lastServerAt>850){v={x:0,y:0};this.path=[];this.dashEnd=0;}
  let speed=s.speed||170,vector={...v};
  if(Math.hypot(v.x,v.y)>.05)this.path=[];
  else if(this.path.length){
   while(this.path.length&&dist(this.position,this.path[0])<7)this.path.shift();
   const next=this.path[0];
   if(next){const d=dist(this.position,next);vector={x:(next.x-this.position.x)/d,y:(next.y-this.position.y)/d};speed=Math.min(speed,d/Math.max(dt,.001));}
  }
  if(s.speedUntil>serverNow)speed*=1.25;
  if(this.dashEnd>now){vector=this.dashVector;speed*=3.6;}
  else if(s.dashUntil>serverNow){vector=s.dashVector||vector;speed*=3.6;}
  const before={...this.position};
  // Divide slower frames into stable steps so brief frame stalls do not shorten movement.
  const steps=Math.max(1,Math.ceil(dt/.025));
  for(let i=0;i<steps;i++)moveEntity(map,this.position,vector.x*speed*dt/steps,vector.y*speed*dt/steps,10);
  this.lastDelta={x:this.position.x-before.x,y:this.position.y-before.y};
  const f=1-Math.exp(-10*dt),dx=this.correction.x*f,dy=this.correction.y*f;
  const x=this.position.x,y=this.position.y;
  moveEntity(map,this.position,dx,dy,10);
  const appliedX=this.position.x-x,appliedY=this.position.y-y;
  this.correction.x-=appliedX;this.correction.y-=appliedY;
  // Keep the historical coordinate frame consistent, avoiding repeated overcorrection.
  for(const point of this.history){point.x+=appliedX;point.y+=appliedY;}
  this.history.push({t:now,x:this.position.x,y:this.position.y});
  while(this.history.length>2&&this.history[1].t<now-700)this.history.shift();
  return this.position;
 }
}
