import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {CLASSES,MONSTERS} from '../shared/content.js';
import {Game,newCharacter} from '../server/game.js';
import {WORLD_BOSSES} from '../shared/expansion.js';
import {bossWindow} from '../server/world-events.js';
import {Renderer} from '../client/render.js';
import {LocalMotion} from '../client/motion.js';
import {drawSkillEffect,effectLifetime} from '../client/effects.js';
import {PixelPainter,pixelLayer,pixelFXStats,PIXEL_FX_LIMITS,beamCorners,drawPixelTelegraph,drawPixelImpact} from '../client/pixel-effects.js';

function recordingContext(){
 const result={fills:0,images:[],colors:new Set(),depth:0,globalAlpha:1,imageSmoothingEnabled:true,fillStyle:'#000',
  fillRect(x,y,w,h){assert.ok([x,y,w,h].every(Number.isInteger),'raster operations must use integer cells');assert.ok(w>0&&h>0);this.fills++;this.colors.add(this.fillStyle);},
  clearRect(){},save(){this.depth++;},restore(){assert.ok(this.depth>0);this.depth--;},
  drawImage(...args){assert.ok(args.slice(1).every(Number.isFinite));this.images.push({bitmap:args[0],smooth:this.imageSmoothingEnabled});}
 };
 return result;
}
function mockRenderer(options={}){
 const surfaces=[];
 const r=Object.assign(Object.create(Renderer.prototype),{ctx:recordingContext(),showEffects:true,lowPower:false,clock:0,
  effects:[],criticalEffects:[],damage:[],flash:new Map(),seenImpacts:new Map(),fxSequence:0,
  state:{self:{id:'self',x:200,y:200}},label(){},
  createPixelCanvas(w,h){const c=recordingContext(),canvas={width:w,height:h,getContext:()=>c};surfaces.push(c);return canvas;}
 },options);
 return {r,surfaces};
}
function skillEvent(job,skill,extra={}){return {type:skill==='skill2'?'skill':'attack',job,skill,classId:CLASSES[job].family||job,x:150,y:240,tx:230,ty:225,radius:105,center:'target',born:0,...extra};}

test('all professions use actual integer raster cells in normal, low-power and reduced-effects modes',()=>{
 for(const options of [{showEffects:true,lowPower:false},{showEffects:true,lowPower:true},{showEffects:false,lowPower:true}]){
  const {r,surfaces}=mockRenderer(options);
  for(const [job,spec]of Object.entries(CLASSES))for(const skill of spec.skills){
   const e=skillEvent(job,skill.id);assert.equal(drawSkillEffect(r,e,effectLifetime(e)*.38),true,`${job}:${skill.id}`);
   assert.ok(surfaces.at(-1)?.fills>0,`${job}:${skill.id} must render visible cells`);
  }
  assert.ok(r.ctx.images.length>=Object.keys(CLASSES).length*4);
  assert.ok(r.ctx.images.every(image=>image.smooth===false),'bitmap upscaling must use nearest-neighbor');
  assert.equal(r.ctx.depth,0);
 }
});

test('diagonal shots and slashes rasterize before rotation instead of rotating a smooth canvas path',()=>{
 const {r,surfaces}=mockRenderer();
 for(const angle of [0,.31,Math.PI/4,Math.PI*.73,Math.PI])for(const [job,family]of [['guardian','guardian'],['ranger','ranger'],['mage','mage']]){
  const e=skillEvent(job,'basic',{classId:family,tx:150+Math.cos(angle)*180,ty:240+Math.sin(angle)*180});
  drawSkillEffect(r,e,170);
  assert.ok(surfaces.at(-1).fills>0);
 }
 // The recording context intentionally has no arc/path/rotate APIs; using them would throw.
 assert.equal(r.ctx.images.length,15);
});

test('warning boundary and detonation are visible with effects disabled, including rotated beams and rings',()=>{
 for(const lowPower of [false,true]){
  const {r,surfaces}=mockRenderer({showEffects:false,lowPower});
  for(const shape of ['circle','ring','beam','quadrant']){
   const cast={id:shape,x:200,y:200,radius:100,inner:48,length:240,width:65,angle:.71,shape,quadrant:0,boss:true,theme:'unknown-theme',starts:Date.now()-500,ends:Date.now()+900};
   drawPixelTelegraph(r,cast,100,'ground');drawPixelTelegraph(r,cast,100,'foreground');
   drawPixelImpact(r,{...cast,type:'impact',born:0},100);
   assert.ok(surfaces.at(-1).fills>0);
  }
  assert.equal(r.ctx.images.length,12);assert.ok(surfaces.some(c=>c.colors.has('#ff895d')));
 }
});

test('pixel animation frames are reused and cache memory stays bounded after long combat',()=>{
 const {r}=mockRenderer();
 const e=skillEvent('pyromancer','ultimate',{_pixelId:0});drawSkillEffect(r,e,310);const initial=pixelFXStats(r);
 drawSkillEffect(r,e,320);assert.equal(pixelFXStats(r).created,initial.created);
 for(let i=0;i<160;i++)drawSkillEffect(r,skillEvent('mage','ultimate',{x:100+i}),300);
 let stats=pixelFXStats(r);assert.ok(stats.frames<=PIXEL_FX_LIMITS.normalFrames);assert.ok(stats.pixels<=PIXEL_FX_LIMITS.normalPixels);
 r.lowPower=true;for(let i=0;i<50;i++)drawSkillEffect(r,skillEvent('mage','ultimate',{x:200+i}),300);
 stats=pixelFXStats(r);assert.ok(stats.frames<=PIXEL_FX_LIMITS.lowFrames);assert.ok(stats.pixels<=PIXEL_FX_LIMITS.lowPixels);
});

test('hit-number storms cannot evict boss impacts; duplicate cast IDs render only once',()=>{
 const {r}=mockRenderer();
 const impact={type:'impact',shape:'circle',castId:'boss-1',x:200,y:200,radius:100,boss:true};r.addEffect(impact);
 for(let i=0;i<400;i++)r.addEffect({type:'hit',id:'enemy',x:200,y:200,amount:10,kind:'monster'});
 assert.equal(r.criticalEffects.length,1);assert.equal(r.effects.length,0);assert.equal(r.damage.length,100);
 for(let i=0;i<150;i++)r.addEffect(skillEvent('guardian','basic'));
 assert.equal(r.criticalEffects[0].castId,'boss-1');assert.equal(r.effects.length,96);
 r.addEffect(impact);assert.equal(r.criticalEffects.length,1);
 r.drawEffects(performance.now()+80);assert.ok(r.ctx.images.length>0);
 r.drawEffects(performance.now()+2000);assert.equal(r.criticalEffects.length,0);assert.equal(r.effects.length,0);
});

test('party cosmetic budget retains local attacks and never suppresses essential boss impacts',()=>{
 for(const lowPower of [false,true]){
  const {r}=mockRenderer({lowPower});
  for(let i=0;i<45;i++)r.addEffect(skillEvent('mage','ultimate',{id:'remote'}));
  r.addEffect(skillEvent('guardian','basic',{id:'self'}));
  r.addEffect({type:'impact',shape:'ring',castId:'essential',x:200,y:200,radius:100,inner:45,boss:true});
  r.drawEffects(performance.now()+80);
  assert.equal(r.effectDrawStats.cosmetic,lowPower?10:20);
  assert.equal(r.effectDrawStats.critical,1);
  assert.equal(r.ctx.images.length,r.effectDrawStats.cosmetic+1);
  assert.ok(r.effects.some(e=>e.id==='self'),'local feedback survives render budgeting');
 }
});

test('server boss casts survive snapshots and resolve to visible impacts for all four world bosses',()=>{
 for(const def of WORLD_BOSSES){
  const fx=[];const g=new Game({random:()=>.5,broadcast:(zone,event,data)=>{if(event==='fx')fx.push(data);}});
  g.now=3600000*500+def.minute*60000+1000;
  const p=g.addPlayer(newCharacter(`fx-${def.id}`,'FX','guardian'));p.level=def.level;
  g.events.spawn(def,bossWindow(def,g.now),{status:'active'});g.events.join(p,def.id);
  const world=g.worlds.get(def.zone),boss=world.mobs.find(m=>m.worldEventId===def.id);
  g.bossCast(world,boss,p);
  const pending=g.snapshot(p).casts;assert.ok(pending.length>0);
  const {r}=mockRenderer({clock:g.now-Date.now(),showEffects:false,lowPower:true});
  for(const cast of pending){assert.equal(cast.damage,undefined);r.drawCast(cast,100,'foreground');}
  assert.equal(r.ctx.images.length,pending.length);
  g.tick(.05,Math.max(...pending.map(c=>c.ends))+1);
  const impacts=fx.filter(e=>e.type==='impact'&&e.boss);assert.ok(impacts.length>0,def.id);
  for(const impact of impacts){assert.notEqual(impact.castId,undefined);r.addEffect(impact);}
  const before=r.ctx.images.length;r.drawEffects(performance.now()+80);
  assert.ok(r.ctx.images.length>before,`${def.id} impact reaches pixel rendering`);
 }
});

test('essential warning outlines are drawn after scenery, actors and cosmetic effects',()=>{
 const g=new Game({random:()=>.5}),p=g.addPlayer(newCharacter('layer-test','Layer','guardian'));
 const s=g.snapshot(p,true);s.casts=[{id:'warning',x:p.x,y:p.y,radius:80,shape:'circle',starts:g.now,ends:g.now+2000,boss:true}];
 const order=[],noop=()=>{},gradient={addColorStop:noop};
 const c=new Proxy({save:noop,restore:noop,createRadialGradient:()=>gradient,createLinearGradient:()=>gradient},{get:(obj,key)=>key in obj?obj[key]:noop,set:(obj,key,value)=>(obj[key]=value,true)});
 const motion=new LocalMotion();motion.accept(s.self,s.zone,performance.now(),g.worlds.get(p.zone).map);
 const r=Object.assign(Object.create(Renderer.prototype),{ctx:c,state:s,profile:s.profile,map:g.worlds.get(p.zone).map,motion,local:motion.position,
  camera:{x:p.x,y:p.y},w:900,h:600,zoom:1.6,dpr:1,clock:g.now-Date.now(),lastInput:{x:0,y:0},positions:new Map(),flash:new Map(),
  ground:{draw:()=>order.push('ground')},gear:{draw:()=>order.push('actor')},showEffects:false,shake:0,snapshotPeriod:100,
  sprite:()=>order.push('scenery'),label:noop,shadow:noop,glow:noop,drawMapBackdrop:noop,drawAtmosphere:noop,
  drawCast:(cast,t,layer)=>order.push(`warning:${layer}`),drawEffects:()=>order.push('cosmetic')});
 r.draw(.016,performance.now());
 assert.ok(order.indexOf('warning:ground')<order.indexOf('actor'));
 assert.ok(order.indexOf('warning:foreground')>order.indexOf('actor'));
 assert.ok(order.indexOf('warning:foreground')>order.indexOf('cosmetic'));
});

test('beam geometry matches server start/end and width at arbitrary angles',()=>{
 for(const angle of [0,.2,Math.PI/4,Math.PI/2,Math.PI]){
  const cast={x:100,y:200,angle,width:90,length:350},corners=beamCorners(cast);
  for(const [x,y]of corners){
   const along=(x-cast.x)*Math.cos(angle)+(y-cast.y)*Math.sin(angle),across=-(x-cast.x)*Math.sin(angle)+(y-cast.y)*Math.cos(angle);
   assert.ok(Math.abs(along)<1e-7||Math.abs(along-cast.length)<1e-7);assert.ok(Math.abs(Math.abs(across)-45)<1e-7);
  }
 }
});

const require=createRequire(import.meta.url);
let nativeCanvas=null;
try{nativeCanvas=require('@napi-rs/canvas');}catch{
 if(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)try{nativeCanvas=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');}catch{}
}
test('native Canvas renders every skill and keeps ring / safe-quarter interiors clear',{skip:!nativeCanvas},()=>{
 const {createCanvas}=nativeCanvas,canvas=createCanvas(420,360),c=canvas.getContext('2d');
 const r={ctx:c,showEffects:true,lowPower:false,clock:0,createPixelCanvas:createCanvas,label(){}};
 for(const options of [{showEffects:true,lowPower:false},{showEffects:true,lowPower:true},{showEffects:false,lowPower:true}]){
  Object.assign(r,options);
  for(const [job,spec]of Object.entries(CLASSES))for(const skill of spec.skills){
   c.clearRect(0,0,420,360);const event=skillEvent(job,skill.id);drawSkillEffect(r,event,effectLifetime(event)*.4);
   const pixels=c.getImageData(0,0,420,360).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++;
   assert.ok(visible>10,`${job}:${skill.id} has visible native Canvas pixels`);
  }
  for(const type of ['dash','forge','level','gather','soulRecover','armorBreak','buff','death']){
   c.clearRect(0,0,420,360);
   const event={type,job:'guardian',x:210,y:240,dx:1,dy:-.4,born:0,theme:'unknown-theme'};
   assert.equal(drawSkillEffect(r,event,effectLifetime(event)*.4),true);
   const pixels=c.getImageData(0,0,420,360).data;
   assert.ok(pixels.some((value,index)=>index%4===3&&value>0),`${type} has visible native Canvas pixels`);
  }
 }
 c.clearRect(0,0,420,360);
 drawPixelImpact(r,{type:'impact',shape:'ring',x:210,y:180,radius:115,inner:65,boss:true,theme:'water',born:0},100);
 assert.equal(c.getImageData(210,180,1,1).data[3],0,'ring center must remain visibly safe');
 c.clearRect(0,0,420,360);
 drawPixelImpact(r,{type:'impact',shape:'quadrant',quadrant:0,x:210,y:180,radius:120,boss:true,theme:'void',born:0},100);
 assert.equal(c.getImageData(155,125,1,1).data[3],0,'safe northwest quarter must not receive a hit flash');
 assert.ok(c.getImageData(265,235,1,1).data[3]>0,'unsafe southeast quarter shows the detonation');
 c.clearRect(0,0,420,360);
 drawPixelTelegraph(r,{shape:'quadrant',quadrant:0,x:210,y:180,radius:120,boss:true,starts:Date.now()-500,ends:Date.now()+900},100);
 const safePixels=c.getImageData(135,105,40,40).data;
 assert.ok(safePixels.every((value,index)=>index%4!==3||value===0),'safe quarter warning must have neither danger hatches nor warning icons');
});
