import {GroundChunks} from './ground-chunks.js';
import {followCamera} from '../shared/camera.js';
import {drawChallengeOverlay} from './challenges-ui.js';
import {drawBossMechanics,drawBossObjective} from './boss-mechanics-ui.js';
import {drawDungeonOverlay} from './dungeons-ui.js';
import {drawRealmOverlay} from './realms-ui.js';
import {drawTerrainAmbient} from './terrain-render.js';
import {drawCreature,creatureMetrics} from './creatures.js';
import {drawEncounterOverlay,drawPhaseTransition} from './encounters-ui.js';
import {nearbyScenery} from '../shared/spatial.js';
import {EquipmentRenderer,drawBossGear} from './equipment.js';
import {drawSkillEffect,effectLifetime} from './effects.js';
import {attackMotionPose} from './skill-formations.js';
import {drawPixelTelegraph,clearPixelFX} from './pixel-effects.js';
import { LocalMotion, SnapshotTrack } from './motion.js';
import { createMap, moveEntity, clamp, dist, seeded } from '../shared/world.js';
import { TILE, ZONES, MONSTERS, CLASSES, NPCS } from '../shared/content.js';
import {titleInfo} from '../shared/title-catalog.js';

const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
export class Renderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.w=0;this.h=0;
    this.atlas=null;this.meta=null;this.gear=new EquipmentRenderer();this.map=null;this.backgrounds=new Map();this.ground=new GroundChunks();this.state=null;this.profile=null;
    this.local=null;this.positions=new Map();this.strikePoses=new Map();this.effects=[];this.criticalEffects=[];this.damage=[];this.flash=new Map();this.fxSequence=0;this.seenImpacts=new Map();
    this.camera={x:0,y:0};this.zoom=1.65;this.zoomSetting=1;this.shake=0;this.showEffects=true;
    this.last=performance.now();this.clock=0;this.motion=new LocalMotion();this.snapshotPeriod=100;this.lastSnapshotTime=0;this.lowPower=false;this.shakeEnabled=false;this.lastInput={x:0,y:0};
    this.skyParticles=Array.from({length:55},(_,i)=>({x:(i*137.19)%1,y:(i*73.31)%1,s:.4+(i%7)*.13}));
    this.rng=seeded(41);this.onFrame=()=>{};this.running=false;this.mapCache=null;this.pointerMark=null;
    window.addEventListener('resize',()=>this.resize());this.resize();
  }
  async load(){
    [this.atlas,this.meta]=await Promise.all([loadImage('/assets/atlas.png?v=3.0.0'),fetch('/assets/atlas.json?v=3.0.0').then(r=>r.json())]);
  }
  resize(){
    this.w=window.innerWidth;this.h=window.innerHeight;
    this.dpr=Math.min(window.devicePixelRatio||1,this.lowPower?1:1.5);
    this.canvas.width=Math.floor(this.w*this.dpr);this.canvas.height=Math.floor(this.h*this.dpr);
    this.canvas.style.width=this.w+'px';this.canvas.style.height=this.h+'px';
    this.zoom=(this.w<700?1.28:this.w<1100?1.4:1.6)*this.zoomSetting;
    if(this.map&&this.state?.self)this.resetCamera();
  }
  resetCamera(){
    const target=this.motion.position?.zone===this.map.id?this.motion.position:this.state.self;
    this.camera=followCamera(this.camera,this.map,target,{width:this.w,height:this.h,zoom:this.zoom},0,{snap:true});
  }
  setZone(id){
    this.map=createMap(id);this.positions.clear();this.strikePoses?.clear();this.effects=[];this.criticalEffects=[];this.damage=[];this.seenImpacts.clear();clearPixelFX(this);this.mapCache=null;
    if(this.state?.self)this.resetCamera();
    this.ground.clear();this.flash.clear();
  }
  setState(s){
    const now=performance.now(),estimate=s.t-Date.now()+this.motion.rtt/2;
    this.clock=this.lastSnapshotTime?this.clock*.9+estimate*.1:estimate;
    if(this.lastSnapshotTime){const interval=s.t-this.lastSnapshotTime;if(interval>0&&interval<600)this.snapshotPeriod=this.snapshotPeriod*.8+interval*.2;}
    this.lastSnapshotTime=s.t;this.state=s;if(s.profile)this.profile=s.profile;
    if(this.map?.id!==s.zone)this.setZone(s.zone);
    const reset=!this.motion.position||this.motion.zone!==s.zone||this.motion.motionId!==(s.self.motionId||0)||dist(this.motion.position,s.self)>260;
    this.motion.accept(s.self,s.zone,now,this.map);this.local=this.motion.position;
    if(reset){this.resetCamera();this.pointerMark=null;}
    for(const entity of [...s.players,...s.mobs]){
      const key=(s.players.includes(entity)?'p':'m')+entity.id;
      if(!this.positions.has(key))this.positions.set(key,new SnapshotTrack());
      this.positions.get(key).push(s.t,entity);
    }
    const visible=new Set([...s.players.map(p=>'p'+p.id),...s.mobs.map(m=>'m'+m.id)]);
    for(const key of this.positions.keys())if(!visible.has(key))this.positions.delete(key);
  }
  avatarURL(p){return this.gear.portrait(this.atlas,this.meta,p);}
  stopMotion(){this.motion.stop();}
  clickMove(point){this.motion.click(this.map,point);}
  predictDash(){if(this.state)this.motion.dash(this.lastInput,performance.now(),this.state.self.dir);}
  start(){if(this.running)return;this.running=true;this.last=performance.now();requestAnimationFrame(t=>this.frame(t));}
  makeGround(){this.ground.clear();}
  sprite(name,x,y,scale=1,alpha=1){
    const s=this.meta[name];if(!s)return;
    const c=this.ctx;c.globalAlpha=alpha;
    c.drawImage(this.atlas,s.x,s.y,s.w,s.h,x-s.ax*scale,y-s.ay*scale,Math.round(s.w*scale),Math.round(s.h*scale));
    c.globalAlpha=1;
  }
  label(text,x,y,color='#e9e5d4',size=10,align='center'){
    const c=this.ctx;c.save();c.textAlign=align;c.textBaseline='middle';
    c.font=`${size<11?'500':'600'} ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    c.lineWidth=3;c.strokeStyle='#14232acc';c.strokeText(text,x,y);c.fillStyle=color;c.fillText(text,x,y);c.restore();
  }
  shadow(x,y,r=15){const c=this.ctx;c.fillStyle='#08161b55';c.beginPath();c.ellipse(x,y+2,r,r*.36,0,0,Math.PI*2);c.fill();}
  // Tiny carved crystal pillar: never reuse the enormous world-boss portal art.
  villageStone(x,y,t){
    const c=this.ctx,hover=Math.sin(t/420)*3;
    this.shadow(x,y,19);
    c.save();c.translate(x,y);
    c.fillStyle='#243c47';c.beginPath();c.ellipse(0,4,23,10,0,0,Math.PI*2);c.fill();
    c.strokeStyle='#b4c9ba';c.lineWidth=3;c.beginPath();c.ellipse(0,4,20,8,0,0,Math.PI*2);c.stroke();
    c.fillStyle='#506b76';c.fillRect(-10,-35,20,37);
    c.fillStyle='#bfd0c1';c.fillRect(-10,-35,4,35);c.fillStyle='#1b3847';c.fillRect(5,-35,5,36);
    c.fillStyle='#294957';c.beginPath();c.moveTo(-10,-35);c.lineTo(0,-49);c.lineTo(10,-35);c.closePath();c.fill();
    const y0=-59+hover;
    c.fillStyle='#173d59';c.beginPath();c.moveTo(0,y0-13);c.lineTo(10,y0);c.lineTo(0,y0+13);c.lineTo(-10,y0);c.closePath();c.fill();
    c.strokeStyle='#b9e9ed';c.lineWidth=2;c.stroke();
    c.fillStyle='#c9faff';c.beginPath();c.moveTo(0,y0-7);c.lineTo(5,y0);c.lineTo(0,y0+7);c.lineTo(-5,y0);c.closePath();c.fill();
    // Four separated rune sockets, not a broad boss-summoning ring.
    for(const a of [-1,1])for(const b of [-1,1]){
      c.fillStyle=(Math.sin(t/550+a+b)>0?'#c2eefa':'#729da9');
      c.fillRect(a*15-2,b*3-17,4,5);
    }
    c.restore();
  }
  queueWorldLabel(text,x,y,distance,hint='',priority=0){
    if(distance>165)return;
    this.worldLabels.push({text,x,y,distance,hint:distance<112?hint:'',priority});
  }
  flushWorldLabels(actors=[]){
    const c=this.ctx,occupied=[];
    for(const a of actors){
      if(!a)continue;
      occupied.push({x1:a.x-67,x2:a.x+67,y1:a.y-(a.title?103:78),y2:a.y-52});
    }
    const collides=r=>occupied.some(b=>r.x1<b.x2&&r.x2>b.x1&&r.y1<b.y2&&r.y2>b.y1);
    const labels=this.worldLabels.sort((a,b)=>a.distance-b.distance||b.priority-a.priority);
    let rendered=0;
    for(const a of labels){
      if(rendered>=11)break;
      const height=a.hint?32:20,baseY=a.y-9;
      c.save();c.font='600 10px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      const labelWidth=(str,size)=>{const measure=c.measureText(str);return Number.isFinite(measure?.width)?measure.width:str.length*size*.64;};
      const w=Math.max(labelWidth(a.text,10),a.hint?labelWidth(a.hint,8):0)+20;
      c.restore();
      const bounds={x1:a.x-w/2,x2:a.x+w/2,y1:baseY-13,y2:baseY-13+height};
      if(collides(bounds))continue;
      occupied.push(bounds);rendered++;
      c.save();c.fillStyle='#152a31d9';c.strokeStyle='#90b6bd77';c.lineWidth=1;
      c.beginPath();c.roundRect(bounds.x1,bounds.y1,w,height,6);c.fill();c.stroke();c.restore();
      this.label(a.text,a.x,baseY-(a.hint?3:0),'#f0e8cb',10);
      if(a.hint)this.label(a.hint,a.x,baseY+12,'#bde9ea',8);
    }
  }
  interp(entity,key,dt){
    const track=this.positions.get(key);
    return track?.sample(Date.now()+this.clock-clamp(this.snapshotPeriod*1.35,100,290))||entity;
  }
  addEffect(e){
    if(!e||!Number.isFinite(e.x)||!Number.isFinite(e.y))return;
    const now=performance.now();
    // Hit numbers have their own queue: a party's burst must never evict a boss impact.
    if(e.type==='hit'){
      this.damage.push({...e,born:now,offset:(Math.random()-.5)*24});
      const limit=this.lowPower?60:100;if(this.damage.length>limit)this.damage.splice(0,this.damage.length-limit);
      this.flash.set(e.id,now+110);
      if(e.kind==='player'&&e.id===this.state?.self.id&&this.showEffects&&this.shakeEnabled)this.shake=4;
      return;
    }
    if(e.type==='impact'&&e.castId!==undefined){
      for(const [id,at]of this.seenImpacts)if(now-at>3000)this.seenImpacts.delete(id);
      if(this.seenImpacts.has(e.castId))return;
      this.seenImpacts.set(e.castId,now);
      while(this.seenImpacts.size>160)this.seenImpacts.delete(this.seenImpacts.keys().next().value);
    }
    // Every profession has a short weapon-specific avatar motion on attack.
    // Keep it out of snapshots, character saves, hitboxes and world movement.
    if((e.type==='attack'||e.type==='skill')&&e.id&&e.job){
      if(!this.strikePoses)this.strikePoses=new Map();
      this.strikePoses.set(e.id,{born:now,job:e.job,skill:e.skill,x:e.x,y:e.y,tx:e.tx,ty:e.ty});
      if(this.strikePoses.size>60)this.strikePoses.delete(this.strikePoses.keys().next().value);
    }
    const effect={...e,born:now,_pixelId:++this.fxSequence};
    const important=(e.type==='impact'&&e.boss)||e.essential;
    const queue=important?this.criticalEffects:this.effects,limit=important?80:this.lowPower?40:96;
    queue.push(effect);if(queue.length>limit)queue.splice(0,queue.length-limit);
    if(e.type==='impact'&&e.boss&&this.showEffects&&this.shakeEnabled)this.shake=5;
    if(e.type==='level'&&this.shakeEnabled)this.shake=2;
  }
  screenToWorld(x,y){return {x:(x-this.w/2)/this.zoom+this.camera.x,y:(y-this.h/2)/this.zoom+this.camera.y};}
  worldToScreen(x,y){return {x:(x-this.camera.x)*this.zoom+this.w/2,y:(y-this.camera.y)*this.zoom+this.h/2};}
  drawMapBackdrop(halfX,halfY){
    const c=this.ctx,m=this.map,left=this.camera.x-halfX,top=this.camera.y-halfY,right=this.camera.x+halfX,bottom=this.camera.y+halfY;
    if(left>=0&&top>=0&&right<=m.width&&bottom<=m.height)return;
    const theme=ZONES[m.id].theme;
    let pattern=this.backgrounds.get(theme);
    if(!pattern){
      // A small repeating texture avoids allocating or repainting a map-sized backdrop.
      const tileCanvas=document.createElement('canvas');tileCanvas.width=tileCanvas.height=TILE*4;
      const tiles=tileCanvas.getContext('2d');tiles.imageSmoothingEnabled=false;
      tiles.fillStyle='#263b39';tiles.fillRect(0,0,tileCanvas.width,tileCanvas.height);
      for(let y=0;y<4;y++)for(let x=0;x<4;x++){
        const variant=(x*17+y*31+x*y)%8;
        const tile=this.meta[`tile_${theme}_0_${variant}`]||this.meta[`tile_forest_0_${variant}`];
        if(tile)tiles.drawImage(this.atlas,tile.x,tile.y,TILE,TILE,x*TILE,y*TILE,TILE,TILE);
      }
      pattern=c.createPattern(tileCanvas,'repeat');
      if(pattern){this.backgrounds.set(theme,pattern);if(this.backgrounds.size>6)this.backgrounds.delete(this.backgrounds.keys().next().value);}
    }
    c.save();c.fillStyle=pattern||'#263b39';c.fillRect(left,top,halfX*2,halfY*2);
    const tint=ZONES[m.id].color||'#9bb8ad';
    const fog=(x,y,w,h,x1,y1,x2,y2)=>{
      if(w<=0||h<=0)return;
      const g=c.createLinearGradient(x1,y1,x2,y2);
      g.addColorStop(0,tint+'44');g.addColorStop(.3,'#13293477');g.addColorStop(1,'#101c2ac9');
      c.fillStyle=g;c.fillRect(x,y,w,h);
    };
    const fade=160;
    fog(left,top,Math.max(0,-left),halfY*2,0,0,-fade,0);
    fog(m.width,top,Math.max(0,right-m.width),halfY*2,m.width,0,m.width+fade,0);
    fog(Math.max(0,left),top,Math.max(0,Math.min(m.width,right)-Math.max(0,left)),Math.max(0,-top),0,0,0,-fade);
    fog(Math.max(0,left),m.height,Math.max(0,Math.min(m.width,right)-Math.max(0,left)),Math.max(0,bottom-m.height),0,m.height,0,m.height+fade);
    c.restore();
  }
  frame(t){
    if(!this.running)return;
    const dt=Math.min(.09,Math.max(0,(t-this.last)/1000));this.last=t;
    this.onFrame(dt,t);
    if(this.state&&this.map&&this.atlas){
      this.draw(dt,t);
    }
    requestAnimationFrame(tt=>this.frame(tt));
  }
  draw(dt,t){
    const c=this.ctx,s=this.state,m=this.map,p=s.self;
    this.motion.step(m,this.lastInput,p,dt,t,Date.now()+this.clock);
    this.local=this.motion.position;
    const target=this.local||p;
    this.camera=followCamera(this.camera,m,target,{width:this.w,height:this.h,zoom:this.zoom},dt);
    const halfX=this.w/this.zoom/2,halfY=this.h/this.zoom/2;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.imageSmoothingEnabled=false;
    c.fillStyle='#14242c';c.fillRect(0,0,this.w,this.h);
    c.save();
    const shakeX=this.showEffects?(Math.random()-.5)*this.shake:0,shakeY=this.showEffects?(Math.random()-.5)*this.shake:0;
    this.shake*=.85;
    c.translate(this.w/2+shakeX,this.h/2+shakeY);c.scale(this.zoom,this.zoom);
    // Snap world translation to physical pixels to avoid pixel-art shimmer while panning.
    const granularity=this.zoom*this.dpr;
    c.translate(-Math.round(this.camera.x*granularity)/granularity,-Math.round(this.camera.y*granularity)/granularity);
    this.drawMapBackdrop(halfX,halfY);
    this.ground.draw(c,m,this.camera,halfX,halfY,this.atlas,this.meta,this.lowPower);
    if(this.showEffects)drawTerrainAmbient(this,m,t);
    const visibleProps=nearbyScenery(m,this.camera.x-halfX-180,this.camera.y-halfY-180,this.camera.x+halfX+180,this.camera.y+halfY+180);
    for(const [id,expiry]of this.flash)if(expiry<t)this.flash.delete(id);
    const inView=(x,y,r=160)=>Math.abs(x-this.camera.x)<halfX+r&&Math.abs(y-this.camera.y)<halfY+r;
    // Water glints animate without repainting the tile map.
    c.fillStyle=m.id==='citadel'?'#d8956540':'#8ab7aa25';
    for(let j=0;j<(m.terrain?0:30);j++){
      const x=(j*173+Math.floor(t/1300)*7)%m.width,y=(j*117)%m.height;
      const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);
      if(m.tiles[ty*m.w+tx]===2&&inView(x,y))c.fillRect(x+Math.sin(t/1500+j)*5,y,6+j%5,1);
    }
    this.worldLabels=[];
    for(const portal of m.portals)if(inView(portal.x,portal.y)){
      const color=ZONES[portal.to].color;
      this.glow(portal.x,portal.y-15,60,color,.16);
      c.save();c.translate(portal.x,portal.y);c.strokeStyle=color;c.lineWidth=2;
      c.beginPath();c.ellipse(0,1,32,13,0,0,Math.PI*2);c.stroke();
      c.setLineDash([4,5]);c.lineDashOffset=t/180;c.beginPath();c.ellipse(0,1,24,9,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
      c.globalAlpha=.65;c.beginPath();c.ellipse(0,-27,18,31,0,0,Math.PI*2);c.stroke();
      c.fillStyle=color+'25';c.fill();c.globalAlpha=1;c.restore();
      this.queueWorldLabel(portal.name,portal.x,portal.y-74,dist(target,portal),portal.level>1?`Lv.${portal.level}+ · F 이동`:'F 이동',1);
    }
    drawChallengeOverlay(this,s.challenge,t);
    drawDungeonOverlay(this,s,t,'ground');
    drawRealmOverlay(this,s.realm,t,'ground');
    drawBossMechanics(this,s.bossMechanics,t,'ground');
    drawEncounterOverlay(this,s.encounter,t,'ground');
    for(const cast of s.casts)this.drawCast(cast,t,'ground');
    if(s.soul&&inView(s.soul.x,s.soul.y)){
      const soul=s.soul;
      this.glow(soul.x,soul.y-20,48,'#a2dfec',.16);
      c.strokeStyle='#a4d6eb';c.lineWidth=2;c.beginPath();c.ellipse(soul.x,soul.y-23,11,18,Math.sin(t/500)*.15,0,Math.PI*2);c.stroke();
      c.fillStyle='#d0edec';c.fillRect(soul.x-2,soul.y-28+Math.sin(t/300)*4,4,7);
      this.label('내 영혼 흔적 · F 회수',soul.x,soul.y-60,'#b9dfea',10);
    }
    if(this.pointerMark&&t-this.pointerMark.at<1700){
      c.strokeStyle='#e9d5a2';c.lineWidth=1;c.beginPath();c.ellipse(this.pointerMark.x,this.pointerMark.y,9,4,0,0,Math.PI*2);c.stroke();
    }
    const drawables=[];
    for(const obj of visibleProps)if(inView(obj.x,obj.y))drawables.push({y:obj.y,draw:()=>{
      const behind=(obj.sprite==='tree'||obj.sprite==='pine'||obj.sprite.startsWith('house'))&&target.y<obj.y&&target.y>obj.y-100&&Math.abs(target.x-obj.x)<55;
      this.sprite(obj.sprite,obj.x,obj.y,obj.scale||1,behind?.42:1);
    }});
    for(const node of s.nodes)if(node.ready&&inView(node.x,node.y))drawables.push({y:node.y,draw:()=>{
      this.sprite('node_'+node.type,node.x,node.y,.65);
      if(dist(target,node)<100)this.label(node.type==='herb'?'별잎 약초':node.type==='wood'?'은가지 목재':'달철 광석',node.x,node.y-40,'#c0d7b4',9);
    }});
    for(const chest of m.chests)if(inView(chest.x,chest.y)){
      const opened=this.profile?.opened.includes(chest.id);
      drawables.push({y:chest.y,draw:()=>{this.sprite('chest',chest.x,chest.y,.7,opened?.38:1);if(!opened&&Math.sin(t/500)>0)this.label('✦',chest.x,chest.y-40,'#e3c482',11);}});
    }
    for(const relic of m.relics||[])if(inView(relic.x,relic.y)){
      const known=this.profile?.discovery?.relics?.includes(relic.id);
      drawables.push({y:relic.y,draw:()=>{
        this.sprite('relic_stone',relic.x,relic.y,.75,known?.7:1);
        if(!known)this.glow(relic.x,relic.y-25,38,'#d5b4f2',.12);
        this.queueWorldLabel(relic.name,relic.x,relic.y-55,dist(target,relic),known?'F 문장 읽기':'F 기억 찾기',1);
      }});
    }
    for(const point of m.storyPoints||[])if(inView(point.x,point.y)){
      const known=!point.hidden||this.profile?.journey?.discovered?.includes(point.job)||this.profile?.discovery?.jobs?.includes(point.job);
      drawables.push({y:point.y,draw:()=>{
        if(point.kind==='warpstone')this.villageStone(point.x,point.y,t);
        else{
          this.shadow(point.x,point.y,point.kind==='camp'?25:16);
          this.sprite(known?point.sprite:'relic_stone',point.x,point.y,point.kind==='mentor'?.8:.75);
        }
        const range=dist(target,point);
        const prompt=point.kind==='mentor'?'F 전직 스승과 대화':point.kind==='warpstone'?'F 마을 간 이동':point.kind==='camp'?'F 야영지 이동':point.kind==='trial'?'F 기억의 시련':'F 기록 읽기';
        const caption=point.kind==='warpstone'?'✧ 귀환의 별기둥':known?point.name:'이름 없는 흔적';
        this.queueWorldLabel(caption,point.x,point.y-(point.kind==='warpstone'?85:75),range,prompt,point.kind==='warpstone'?3:2);
        if(point.kind==='mentor'&&range>=165&&known&&range<240)this.label('◇',point.x,point.y-63,'#e4c697',12);
      }});
    }
    for(const npc of m.npcs)if(inView(npc.x,npc.y))drawables.push({y:npc.y,draw:()=>{
      this.shadow(npc.x,npc.y);this.sprite(npc.sprite+'_s_'+Math.floor(t/500)%4,npc.x,npc.y,.8);
      const name=npc.name.includes(' · ')?npc.name.split(' · ').at(-1):npc.name;
      this.queueWorldLabel(name,npc.x,npc.y-63,dist(target,npc),'F 대화 · '+npc.role,2);
      if(npc.kind==='quest'&&dist(target,npc)<175)this.label('!',npc.x,npc.y-82+Math.sin(t/450)*2,'#f2d399',15);
    }});
    for(const mob of s.mobs)if(inView(mob.x,mob.y)){
      const q=this.interp(mob,'m'+mob.id,dt),def=MONSTERS[mob.type];
      drawables.push({y:q.y,draw:()=>{
        if(drawBossObjective(this,mob,q,t))return;
        this.shadow(q.x,q.y,def.creature?creatureMetrics(def).shadow:def.boss?38:15);
        if(p.target===mob.id){c.strokeStyle='#e7c786';c.lineWidth=1.5;c.beginPath();c.ellipse(q.x,q.y+2,def.boss?43:22,def.boss?17:9,0,0,Math.PI*2);c.stroke();}
        let humanoid=['skeleton','ash_knight'].includes(def.skin||mob.type);
        let key=humanoid?`${def.sprite}_s_${Math.floor(t/(mob.moving?160:450))%4}`:`${def.sprite}_${Math.floor(t/(mob.moving?150:350))%4}`;
        const articulated=drawCreature(this,mob,def,q.x,q.y,t,this.flash.get(mob.id)>t?.55:1);
        if(!articulated)this.sprite(key,q.x,q.y,def.boss?1:.8,this.flash.get(mob.id)>t?.55:1);
        if(def.boss&&!articulated)drawBossGear(this,mob,def,q.x,q.y,t);
        if(mob.dot&&this.showEffects){c.fillStyle=mob.dot==='burn'?'#ffae65':'#b6d480';c.fillRect(q.x-3,q.y-38+Math.sin(t/120)*4,5,7);}
        const hh=def.creature?creatureMetrics(def).height:def.boss?((def.skin||mob.type)==='eclipse_dragon'?129:110):58;
        if(def.boss||mob.hp<mob.maxHp||p.target===mob.id){
          const width=def.boss?76:32;
          c.fillStyle='#15212be6';c.fillRect(q.x-width/2-1,q.y-hh,width+2,5);
          c.fillStyle=def.boss?'#bc899d':'#ae7d79';c.fillRect(q.x-width/2,q.y-hh+1,width*mob.hp/mob.maxHp,3);
          this.label(`${mob.name||def.name}`,q.x,q.y-hh-9,def.boss?'#e4c399':'#d7d2bf',def.boss?10:8);
          const pose=mob.encounterPose,now=Date.now()+this.clock;
          if(pose&&pose.ends>now&&['windup','recover'].includes(pose.stage))this.label(pose.stage==='windup'?'◆ 공격 준비':'◇ 반격 기회',q.x,q.y-hh+15,pose.stage==='windup'?'#f6bf84':'#a6e3cd',8);
        }
      }});
    }
    for(const other of [...s.players,p]){
      const self=other.id===p.id,q=self?this.local:this.interp(other,'p'+other.id,dt);
      if(!q||!inView(q.x,q.y))continue;
      drawables.push({y:q.y,draw:()=>{
        this.shadow(q.x,q.y,15);
        if(self){c.strokeStyle='#d2c39375';c.lineWidth=1;c.beginPath();c.ellipse(q.x,q.y+2,16,6,0,0,Math.PI*2);c.stroke();}
        const moving=self?(Math.hypot(this.motion.lastDelta.x,this.motion.lastDelta.y)>.05):other.moving;
        let direction=other.dir||'s';
        if(self&&Math.hypot(this.lastInput.x,this.lastInput.y)>.1){const v=this.lastInput;direction=Math.abs(v.x)>Math.abs(v.y)?(v.x>0?'e':'w'):(v.y>0?'s':'n');}
        const strike=this.strikePoses?.get(other.id);
        const pose=strike?attackMotionPose(strike.job,strike.skill,t-strike.born,(strike.tx??strike.x)-strike.x,(strike.ty??strike.y)-strike.y):{active:false};
        const frame=pose.active?pose.frame:other.attacking?Math.floor(t/80)%4:moving?Math.floor(t/130)%4:Math.floor(t/800)%2*2;
        if(other.dead){c.save();c.translate(q.x,q.y);c.rotate(-Math.PI/2);this.gear.draw(this,other,0,0,'s',0,.6,t);c.restore();}
        else this.gear.draw(this,other,q.x+(pose.dx||0),q.y+(pose.dy||0),direction,frame,this.flash.get(other.id)>t?.55:1,t);
        if(other.shield){c.strokeStyle='#b8d8df99';c.lineWidth=1.5;c.beginPath();c.ellipse(q.x,q.y-25,23,35,0,0,Math.PI*2);c.stroke();}
        this.label(other.name,q.x,q.y-62,self?'#f2dbab':other.partyId&&other.partyId===p.partyId?'#b2dfba':'#c2d6da',10);
        if(other.title){
          const info=titleInfo(other.title),color={common:'#c0cfcc',uncommon:'#9bd4af',rare:'#83cbfa',epic:'#d3b2ff',legendary:'#ffe3a4'}[info.rarity]||'#bfcbd1';
          const glow=info.rarity==='legendary'?11:info.rarity==='epic'?6:info.rarity==='rare'?3:0;
          if(glow&&this.showEffects){c.save();c.shadowColor=color;c.shadowBlur=glow*(.84+.16*Math.sin(t/380));}
          this.label('✦ '+other.title+' ✦',q.x,q.y-79,color,8);
          if(glow&&this.showEffects)c.restore();
        }
        if(!self)this.label(`Lv.${other.level}`,q.x,q.y-(other.title?92:77),'#b6c8c2',8);
        if(!self&&other.hp<other.maxHp){
          c.fillStyle='#16282c';c.fillRect(q.x-18,q.y-53,36,3);c.fillStyle='#91bd97';c.fillRect(q.x-18,q.y-53,36*other.hp/other.maxHp,3);
        }
      }});
    }
    drawables.sort((a,b)=>a.y-b.y);
    for(const o of drawables)o.draw();
    // Soft additive lights are intentionally limited to a few scene objects.
    if(this.showEffects){
      for(const o of visibleProps)if(inView(o.x,o.y,0)&&['campfire','lantern','forge'].includes(o.sprite)){
        this.glow(o.x,o.y-(o.sprite==='lantern'?52:22),o.sprite==='campfire'?105:65,'#e7b56d',.12+.02*Math.sin(t/370));
      }
      if(m.id!=='town')this.glow(target.x,target.y-20,130,CLASSES[p.classId].color,.035);
    }
    const guide=this.profile?.storyTracker?.destination;
    if(guide?.zone===m.id&&this.profile.storyTracker.active){
      const gx=guide.x,gy=guide.y;
      if(inView(gx,gy,0)){
        c.strokeStyle='#ecd59f';c.setLineDash([5,7]);c.beginPath();c.ellipse(gx,gy,28,12,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
        this.label('◆ 추적 중',gx,gy-90,'#f1d8a6',10);
      }else{
        const angle=Math.atan2(gy-target.y,gx-target.x),distance=Math.floor(Math.hypot(gx-target.x,gy-target.y)/TILE);
        const px=target.x+Math.cos(angle)*95,py=target.y+Math.sin(angle)*95;
        c.save();c.translate(px,py);c.rotate(angle);c.fillStyle='#ecd59f';c.beginPath();c.moveTo(10,0);c.lineTo(-5,-5);c.lineTo(-5,5);c.closePath();c.fill();c.restore();
        this.label(distance+'칸',px,py-16,'#ecd59f',8);
      }
    }
    for(const [id,pose] of this.strikePoses||[])if(t-pose.born>1100)this.strikePoses.delete(id);
    this.drawEffects(t);
    this.flushWorldLabels([...s.players,p].map(a=>{
      if(!a)return null;
      const q=a.id===p.id?this.local:this.interp(a,'p'+a.id,dt);
      return q?{...q,title:a.title}:null;
    }));
    // Gameplay boundaries stay above foliage, actors and cosmetic skill bursts.
    for(const cast of s.casts)this.drawCast(cast,t,'foreground');
    drawBossMechanics(this,s.bossMechanics,t,'foreground');
    drawDungeonOverlay(this,s,t,'foreground');
    drawRealmOverlay(this,s.realm,t,'foreground');
    drawEncounterOverlay(this,s.encounter,t,'foreground');
    c.restore();
    this.drawAtmosphere(t);
    drawPhaseTransition(this,s,t);
    c.setTransform(1,0,0,1,0,0);
  }
  glow(x,y,r,color,alpha){
    const c=this.ctx;c.save();c.globalCompositeOperation='screen';c.globalAlpha=alpha;
    const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
  }
  drawCast(cast,t,layer='all'){
    drawPixelTelegraph(this,cast,t,layer);
  }
  drawEffects(t){
    this.effects=this.effects.filter(e=>t-e.born<=effectLifetime(e));
    this.criticalEffects=this.criticalEffects.filter(e=>t-e.born<=effectLifetime(e));
    const budget=this.lowPower?10:20,self=this.state?.self.id;
    const own=this.effects.filter(e=>e.id===self).slice(-budget);
    const others=this.effects.filter(e=>e.id!==self);
    const available=Math.max(0,budget-own.length),visible=available?others.slice(-available):[];
    for(const e of [...visible,...own])drawSkillEffect(this,e,t);
    for(const e of this.criticalEffects)drawSkillEffect(this,e,t);
    this.effectDrawStats={cosmetic:visible.length+own.length,critical:this.criticalEffects.length};
    this.damage=this.damage.filter(e=>t-e.born<1000);
    const c=this.ctx;
    for(const e of this.damage){
      const a=(t-e.born)/1000;c.globalAlpha=Math.min(1,(1-a)*2);
      this.label((e.crit?'✦ ':'')+e.amount,e.x+e.offset,e.y-a*38,e.kind==='player'?'#f0aba3':e.kind==='evade'?'#a7e5ee':e.crit?'#f4d38e':'#f5f0dd',e.crit?16:12);
      c.globalAlpha=1;
    }
  }
  drawAtmosphere(t){
    const c=this.ctx;
    if(this.showEffects){
      const weather=ZONES[this.map.id].weather;
      c.fillStyle=ZONES[this.map.id].color;
      const count=this.lowPower?18:this.skyParticles.length;
      for(let i=0;i<count;i++){
        const p=this.skyParticles[i],snow=weather==='snow',sand=weather==='sand';
        const x=(p.x*this.w+t*(sand?.035:.008)*p.s)%this.w;
        const y=(p.y*this.h+t*(snow?.018:-.004)*p.s+this.h*20)%this.h;
        c.globalAlpha=weather==='fog'?.06:.12+.25*(.5+.5*Math.sin(t/800+i));
        c.fillRect(x,y,snow?3:sand?5:2,snow?3:2);
      }c.globalAlpha=1;
    }
    const g=c.createRadialGradient(this.w/2,this.h/2,this.h*.3,this.w/2,this.h/2,Math.max(this.w,this.h)*.7);
    g.addColorStop(0,'transparent');g.addColorStop(1,'#08121d88');c.fillStyle=g;c.fillRect(0,0,this.w,this.h);
  }
  minimap(canvas,big=false){
    if(!this.map||!this.state)return;
    const m=this.map,c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,scale=Math.min(w/m.width,h/m.height),ox=(w-m.width*scale)/2,oy=(h-m.height*scale)/2;
    c.fillStyle='#101f28';c.fillRect(0,0,w,h);
    if(!this.mapCache){
      const cv=document.createElement('canvas');cv.width=m.w;cv.height=m.h;const cc=cv.getContext('2d');
      for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
        cc.fillStyle=m.terrain?['#566b58','#a9a583','#29566b','#232735','#c6ac7d','#e2cba0','#b35b3d','#10182b','#a6c6d0'][m.terrain.surface[y*m.w+x]]:m.tiles[y*m.w+x]===2?'#294950':m.blocked[y*m.w+x]?'#253a37':m.tiles[y*m.w+x]===1?'#7e8062':'#3d5a47';cc.fillRect(x,y,1,1);
      }
      this.mapCache=cv;
    }
    c.imageSmoothingEnabled=false;c.drawImage(this.mapCache,ox,oy,m.width*scale,m.height*scale);
    const fog=new Set(this.profile?.atlas?.fog?.[m.id]||[]);
    if(ZONES[m.id].expedition){
      const cols=Math.ceil(m.w/8),rows=Math.ceil(m.h/8);c.fillStyle='#08131bed';
      for(let yy=0;yy<rows;yy++)for(let xx=0;xx<cols;xx++)if(!fog.has(yy*cols+xx))c.fillRect(ox+xx*256*scale,oy+yy*256*scale,256*scale+1,256*scale+1);
    }
    const dot=(x,y,col,r=2)=>{c.fillStyle=col;c.beginPath();c.arc(ox+x*scale,oy+y*scale,r,0,Math.PI*2);c.fill();};
    for(const r of m.relics||[])dot(r.x,r.y,this.profile?.discovery?.relics?.includes(r.id)?'#887d98':'#dab9f4',big?4:2);
    if(this.state.soul)dot(this.state.soul.x,this.state.soul.y,'#b2eef4',big?6:3);
    for(const point of m.storyPoints||[]){
      const seen=!ZONES[m.id].expedition||fog.has(Math.floor(point.y/256)*Math.ceil(m.w/8)+Math.floor(point.x/256));
      if(!seen||point.hidden&&!this.profile?.journey?.discovered?.includes(point.job)&&!this.profile?.discovery?.jobs?.includes(point.job))continue;
      dot(point.x,point.y,point.kind==='camp'?'#a7dab6':point.kind==='trial'?'#db9ea9':'#e4cea6',big?4:2);
    }
    for(const n of m.npcs)dot(n.x,n.y,'#ecd3a0',big?4:2);
    for(const p of m.portals){dot(p.x,p.y,'#b7a5ee',big?5:3);if(big){c.fillStyle='#e6d9bd';c.font='12px sans-serif';c.textAlign='center';c.fillText(p.name,ox+p.x*scale,oy+p.y*scale-10);}}
    for(const mob of this.state.mobs)if(MONSTERS[mob.type].boss)dot(mob.x,mob.y,'#e39791',big?6:3);
    for(const other of this.state.players)dot(other.x,other.y,'#a0d0c6',big?3:1.5);
    dot(this.state.self.x,this.state.self.y,'#fff0bc',big?5:3);
  }
}
