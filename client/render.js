import { createMap, moveEntity, clamp, dist, seeded } from '../shared/world.js';
import { TILE, ZONES, MONSTERS, CLASSES, NPCS } from '../shared/content.js';

const loadImage=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
export class Renderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.w=0;this.h=0;
    this.atlas=null;this.meta=null;this.map=null;this.backgrounds=new Map();this.state=null;this.profile=null;
    this.local=null;this.positions=new Map();this.effects=[];this.damage=[];this.flash=new Map();
    this.camera={x:0,y:0};this.zoom=1.65;this.zoomSetting=1;this.shake=0;this.showEffects=true;
    this.last=performance.now();this.clock=0;this.lastInput={x:0,y:0};
    this.skyParticles=Array.from({length:55},(_,i)=>({x:(i*137.19)%1,y:(i*73.31)%1,s:.4+(i%7)*.13}));
    this.rng=seeded(41);this.onFrame=()=>{};this.running=false;this.mapCache=null;this.pointerMark=null;
    window.addEventListener('resize',()=>this.resize());this.resize();
  }
  async load(){
    [this.atlas,this.meta]=await Promise.all([loadImage('/assets/atlas.png'),fetch('/assets/atlas.json').then(r=>r.json())]);
  }
  resize(){
    this.w=window.innerWidth;this.h=window.innerHeight;
    this.dpr=Math.min(window.devicePixelRatio||1,1.5);
    this.canvas.width=Math.floor(this.w*this.dpr);this.canvas.height=Math.floor(this.h*this.dpr);
    this.canvas.style.width=this.w+'px';this.canvas.style.height=this.h+'px';
    this.zoom=(this.w<700?1.28:this.w<1100?1.4:1.6)*this.zoomSetting;
  }
  setZone(id){
    this.map=createMap(id);this.positions.clear();this.effects=[];this.damage=[];this.mapCache=null;
    if(this.state?.self)this.camera={x:this.state.self.x,y:this.state.self.y};
    if(!this.backgrounds.has(id))this.makeGround();
  }
  setState(s){
    this.clock=s.t-Date.now();this.state=s;if(s.profile)this.profile=s.profile;
    if(this.map?.id!==s.zone)this.setZone(s.zone);
    if(!this.local||dist(this.local,s.self)>150||this.local.zone!==s.zone){
      this.local={x:s.self.x,y:s.self.y,zone:s.zone};
      this.camera={x:s.self.x,y:s.self.y};
    }else{
      const moving=Math.hypot(this.lastInput.x,this.lastInput.y)>.05;
      const prediction=moving?this.profile?.stats?.speed*.065:0;
      this.local.x+=(s.self.x+this.lastInput.x*prediction-this.local.x)*.42;
      this.local.y+=(s.self.y+this.lastInput.y*prediction-this.local.y)*.42;
    }
  }
  start(){if(this.running)return;this.running=true;this.last=performance.now();requestAnimationFrame(t=>this.frame(t));}
  makeGround(){
    const m=this.map,cv=document.createElement('canvas');cv.width=m.width;cv.height=m.height;
    const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
    for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){
      const v=((x*17+y*31+x*y)%8),sprite=this.meta[`tile_${m.id==='citadel'?'citadel':m.id}_${m.tiles[y*m.w+x]}_${v}`];
      c.drawImage(this.atlas,sprite.x,sprite.y,32,32,x*TILE,y*TILE,32,32);
    }
    // Shore stones, occasional pavers and delicate meadow flecks.
    for(let y=2;y<m.h-2;y++)for(let x=2;x<m.w-2;x++){
      const kind=m.tiles[y*m.w+x],left=m.tiles[y*m.w+x-1];
      if(kind!==2&&left===2){c.fillStyle=m.id==='citadel'?'#a06850':'#7b8b72';c.fillRect(x*TILE,y*TILE+3,3,22);}
      if(kind===1&&x%4===1&&y%3===1){c.fillStyle=m.id==='ruins'?'#858495':'#989277';c.fillRect(x*TILE+7,y*TILE+14,9,2);}
    }
    this.backgrounds.set(m.id,cv);
  }
  sprite(name,x,y,scale=1,alpha=1){
    const s=this.meta[name];if(!s)return;
    const c=this.ctx;c.globalAlpha=alpha;
    c.drawImage(this.atlas,s.x,s.y,s.w,s.h,Math.round(x-s.ax*scale),Math.round(y-s.ay*scale),Math.round(s.w*scale),Math.round(s.h*scale));
    c.globalAlpha=1;
  }
  label(text,x,y,color='#e9e5d4',size=10,align='center'){
    const c=this.ctx;c.save();c.textAlign=align;c.textBaseline='middle';
    c.font=`${size<11?'500':'600'} ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
    c.lineWidth=3;c.strokeStyle='#14232acc';c.strokeText(text,x,y);c.fillStyle=color;c.fillText(text,x,y);c.restore();
  }
  shadow(x,y,r=15){const c=this.ctx;c.fillStyle='#08161b55';c.beginPath();c.ellipse(x,y+2,r,r*.36,0,0,Math.PI*2);c.fill();}
  interp(entity,key,dt){
    let q=this.positions.get(key);if(!q||dist(q,entity)>200)q={x:entity.x,y:entity.y};
    const f=1-Math.exp(-14*dt);q.x+=(entity.x-q.x)*f;q.y+=(entity.y-q.y)*f;this.positions.set(key,q);return q;
  }
  addEffect(e){
    const now=performance.now();this.effects.push({...e,born:now});
    if(e.type==='hit'){
      this.damage.push({...e,born:now,offset:(Math.random()-.5)*24});this.flash.set(e.id,now+110);
      if(e.kind==='player'&&e.id===this.state?.self.id&&this.showEffects)this.shake=4;
    }
    if(e.type==='impact'&&e.boss&&this.showEffects)this.shake=5;
    if(e.type==='level')this.shake=2;
  }
  screenToWorld(x,y){return {x:(x-this.w/2)/this.zoom+this.camera.x,y:(y-this.h/2)/this.zoom+this.camera.y};}
  worldToScreen(x,y){return {x:(x-this.camera.x)*this.zoom+this.w/2,y:(y-this.camera.y)*this.zoom+this.h/2};}
  frame(t){
    if(!this.running)return;
    const dt=Math.min(.05,(t-this.last)/1000);this.last=t;
    this.onFrame(dt,t);
    if(this.state&&this.map&&this.atlas){
      this.draw(dt,t);
    }
    requestAnimationFrame(tt=>this.frame(tt));
  }
  draw(dt,t){
    const c=this.ctx,s=this.state,m=this.map,p=s.self;
    if(this.local&&p.hp>0){
      const v=this.lastInput,sp=this.profile?.stats?.speed||155;
      if(Math.hypot(v.x,v.y)>.05)moveEntity(m,this.local,v.x*sp*dt,v.y*sp*dt,10);
      else if(p.moving){this.local.x+=(p.x-this.local.x)*(1-Math.exp(-12*dt));this.local.y+=(p.y-this.local.y)*(1-Math.exp(-12*dt));}
    }
    const target=this.local||p;
    const camEase=1-Math.exp(-10*dt);
    this.camera.x+=(target.x-this.camera.x)*camEase;
    this.camera.y+=(target.y-this.camera.y)*camEase;
    const halfX=this.w/this.zoom/2,halfY=this.h/this.zoom/2;
    this.camera.x=clamp(this.camera.x,Math.min(halfX,m.width/2),Math.max(m.width-halfX,m.width/2));
    this.camera.y=clamp(this.camera.y,Math.min(halfY,m.height/2),Math.max(m.height-halfY,m.height/2));
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.imageSmoothingEnabled=false;
    c.fillStyle='#14242c';c.fillRect(0,0,this.w,this.h);
    c.save();
    const shakeX=this.showEffects?(Math.random()-.5)*this.shake:0,shakeY=this.showEffects?(Math.random()-.5)*this.shake:0;
    this.shake*=.85;
    c.translate(this.w/2+shakeX,this.h/2+shakeY);c.scale(this.zoom,this.zoom);c.translate(-Math.round(this.camera.x),-Math.round(this.camera.y));
    c.drawImage(this.backgrounds.get(m.id),0,0);
    const inView=(x,y,r=160)=>Math.abs(x-this.camera.x)<halfX+r&&Math.abs(y-this.camera.y)<halfY+r;
    // Water glints animate without repainting the tile map.
    c.fillStyle=m.id==='citadel'?'#d8956540':'#8ab7aa25';
    for(let j=0;j<30;j++){
      const x=(j*173+Math.floor(t/1300)*7)%m.width,y=(j*117)%m.height;
      const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);
      if(m.tiles[ty*m.w+tx]===2&&inView(x,y))c.fillRect(x+Math.sin(t/1500+j)*5,y,6+j%5,1);
    }
    for(const portal of m.portals)if(inView(portal.x,portal.y)){
      const color=ZONES[portal.to].color;
      this.glow(portal.x,portal.y-15,60,color,.16);
      c.save();c.translate(portal.x,portal.y);c.strokeStyle=color;c.lineWidth=2;
      c.beginPath();c.ellipse(0,1,32,13,0,0,Math.PI*2);c.stroke();
      c.setLineDash([4,5]);c.lineDashOffset=t/180;c.beginPath();c.ellipse(0,1,24,9,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
      c.globalAlpha=.65;c.beginPath();c.ellipse(0,-27,18,31,0,0,Math.PI*2);c.stroke();
      c.fillStyle=color+'25';c.fill();c.globalAlpha=1;c.restore();
      this.label(portal.name,portal.x,portal.y-68,color,11);
      this.label(portal.level>1?`Lv.${portal.level}+ · F 이동`:'F 이동',portal.x,portal.y-54,'#bbc5b8',8);
    }
    for(const cast of s.casts)this.drawCast(cast,t);
    if(this.pointerMark&&t-this.pointerMark.at<1700){
      c.strokeStyle='#e9d5a2';c.lineWidth=1;c.beginPath();c.ellipse(this.pointerMark.x,this.pointerMark.y,9,4,0,0,Math.PI*2);c.stroke();
    }
    const drawables=[];
    for(const obj of m.props)if(inView(obj.x,obj.y))drawables.push({y:obj.y,draw:()=>{
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
    for(const npc of m.npcs)if(inView(npc.x,npc.y))drawables.push({y:npc.y,draw:()=>{
      this.shadow(npc.x,npc.y);this.sprite(npc.sprite+'_s_'+Math.floor(t/500)%4,npc.x,npc.y,.8);
      this.label(npc.name,npc.x,npc.y-60,'#ead2a1',11);this.label(npc.role,npc.x,npc.y-48,'#bbcbbe',8);
      if(npc.kind==='quest')this.label('!',npc.x,npc.y-77+Math.sin(t/450)*2,'#f2d399',17);
    }});
    for(const mob of s.mobs)if(inView(mob.x,mob.y)){
      const q=this.interp(mob,'m'+mob.id,dt),def=MONSTERS[mob.type];
      drawables.push({y:q.y,draw:()=>{
        this.shadow(q.x,q.y,def.boss?38:15);
        if(p.target===mob.id){c.strokeStyle='#e7c786';c.lineWidth=1.5;c.beginPath();c.ellipse(q.x,q.y+2,def.boss?43:22,def.boss?17:9,0,0,Math.PI*2);c.stroke();}
        let key=mob.type==='skeleton'||mob.type==='ash_knight'?`${mob.type}_s_${Math.floor(t/(mob.moving?160:450))%4}`:`${mob.type}_${Math.floor(t/(mob.moving?150:350))%4}`;
        this.sprite(key,q.x,q.y,def.boss?1:.8,this.flash.get(mob.id)>t?.55:1);
        const hh=def.boss?(mob.type==='eclipse_dragon'?129:123):58;
        if(def.boss||mob.hp<mob.maxHp||p.target===mob.id){
          const width=def.boss?76:32;
          c.fillStyle='#15212be6';c.fillRect(q.x-width/2-1,q.y-hh,width+2,5);
          c.fillStyle=def.boss?'#bc899d':'#ae7d79';c.fillRect(q.x-width/2,q.y-hh+1,width*mob.hp/mob.maxHp,3);
          this.label(`${def.name}`,q.x,q.y-hh-9,def.boss?'#e4c399':'#d7d2bf',def.boss?10:8);
        }
      }});
    }
    for(const other of [...s.players,p]){
      const self=other.id===p.id,q=self?this.local:this.interp(other,'p'+other.id,dt);
      if(!q||!inView(q.x,q.y))continue;
      drawables.push({y:q.y,draw:()=>{
        this.shadow(q.x,q.y,15);
        if(self){c.strokeStyle='#d2c39375';c.lineWidth=1;c.beginPath();c.ellipse(q.x,q.y+2,16,6,0,0,Math.PI*2);c.stroke();}
        const moving=self?(Math.hypot(this.lastInput.x,this.lastInput.y)>.05||other.moving):other.moving;
        let direction=other.dir||'s';
        if(self&&Math.hypot(this.lastInput.x,this.lastInput.y)>.1){const v=this.lastInput;direction=Math.abs(v.x)>Math.abs(v.y)?(v.x>0?'e':'w'):(v.y>0?'s':'n');}
        const frame=other.attacking?Math.floor(t/80)%4:moving?Math.floor(t/130)%4:Math.floor(t/800)%2*2;
        if(other.dead){c.save();c.translate(q.x,q.y);c.rotate(-Math.PI/2);this.sprite(`${other.classId}_s_0`,0,0,.85,.6);c.restore();}
        else this.sprite(`${other.classId}_${direction}_${frame}`,q.x,q.y,.85,this.flash.get(other.id)>t?.55:1);
        if(other.shield){c.strokeStyle='#b8d8df99';c.lineWidth=1.5;c.beginPath();c.ellipse(q.x,q.y-25,23,35,0,0,Math.PI*2);c.stroke();}
        this.label(other.name,q.x,q.y-62,self?'#f2dbab':other.partyId&&other.partyId===p.partyId?'#b2dfba':'#c2d6da',10);
        if(!self)this.label(`Lv.${other.level}`,q.x,q.y-75,'#b6c8c2',8);
        if(!self&&other.hp<other.maxHp){
          c.fillStyle='#16282c';c.fillRect(q.x-18,q.y-53,36,3);c.fillStyle='#91bd97';c.fillRect(q.x-18,q.y-53,36*other.hp/other.maxHp,3);
        }
      }});
    }
    drawables.sort((a,b)=>a.y-b.y);
    for(const o of drawables)o.draw();
    // Soft additive lights are intentionally limited to a few scene objects.
    if(this.showEffects){
      for(const o of m.props)if(inView(o.x,o.y,0)&&['campfire','lantern','forge'].includes(o.sprite)){
        this.glow(o.x,o.y-(o.sprite==='lantern'?52:22),o.sprite==='campfire'?105:65,'#e7b56d',.12+.02*Math.sin(t/370));
      }
      if(m.id!=='town')this.glow(target.x,target.y-20,130,CLASSES[p.classId].color,.035);
    }
    this.drawEffects(t);
    c.restore();
    this.drawAtmosphere(t);
    c.setTransform(1,0,0,1,0,0);
  }
  glow(x,y,r,color,alpha){
    const c=this.ctx;c.save();c.globalCompositeOperation='screen';c.globalAlpha=alpha;
    const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
  }
  drawCast(cast,t){
    const c=this.ctx,now=Date.now()+this.clock,progress=clamp((now-cast.starts)/(cast.ends-cast.starts),0,1);
    const color=cast.boss?'#dc927b':'#d1ac7a';
    c.save();c.fillStyle=cast.boss?'#b2565b30':'#aa754e23';c.strokeStyle=color;c.lineWidth=cast.boss?2:1;
    if(cast.shape==='beam'){
      c.translate(cast.x,cast.y);c.rotate(cast.angle);c.fillRect(0,-cast.width/2,cast.length,cast.width);c.strokeRect(0,-cast.width/2,cast.length,cast.width);
      c.fillStyle='#e0a07a40';c.fillRect(0,-cast.width/2,cast.length*progress,cast.width);
    }else{
      c.beginPath();c.arc(cast.x,cast.y,cast.radius,0,Math.PI*2);
      if(cast.shape==='ring')c.arc(cast.x,cast.y,cast.inner,0,Math.PI*2,true);
      c.fill('evenodd');c.stroke();
      c.setLineDash([4,6]);c.beginPath();c.arc(cast.x,cast.y,Math.max(cast.inner||4,cast.radius*progress),0,Math.PI*2);c.stroke();c.setLineDash([]);
    }
    c.restore();
    if(cast.boss)this.label(cast.name,cast.x,cast.y-12,'#f5d2b1',9);
  }
  drawEffects(t){
    const c=this.ctx;
    this.effects=this.effects.filter(e=>t-e.born<1300);
    for(const e of this.effects){
      const a=(t-e.born)/1000;
      if(e.type==='attack'){
        const alpha=Math.max(0,1-a/.42);if(alpha<=0)continue;
        c.save();c.globalAlpha=alpha;c.strokeStyle=e.color;c.lineWidth=e.skill==='basic'?2:4;
        if(e.classId==='guardian'){
          const ang=Math.atan2(e.ty-e.y,e.tx-e.x);c.beginPath();c.arc(e.x,e.y-15,e.skill==='basic'?48:80,ang-1.1+a*3,ang+.9+a*3);c.stroke();
          c.strokeStyle='#f1e5b9';c.lineWidth=1;c.beginPath();c.arc(e.x,e.y-15,53,ang-.6+a*3,ang+.5+a*3);c.stroke();
        }else{
          const f=Math.min(1,a/.2),xx=e.x+(e.tx-e.x)*f,yy=e.y-22+(e.ty-e.y)*f;
          c.beginPath();c.moveTo(xx-(e.tx-e.x)*.08,yy-(e.ty-e.y)*.08);c.lineTo(xx,yy);c.stroke();
          if(e.classId==='mage'){c.fillStyle='#e2d7f2';c.beginPath();c.arc(xx,yy,e.skill==='basic'?3:6,0,Math.PI*2);c.fill();}
        }
        if(e.radius&&a>.08){c.globalAlpha=alpha*.55;c.beginPath();c.ellipse(e.classId==='guardian'?e.x:e.tx,e.classId==='guardian'?e.y:e.ty,e.radius*a*2.2,e.radius*a*1.5,0,0,Math.PI*2);c.stroke();}
        c.restore();
      }else if(e.type==='buff'||e.type==='level'||e.type==='gather'){
        const alpha=Math.max(0,1-a/1);if(!alpha)continue;c.save();c.globalAlpha=alpha;c.strokeStyle=e.color||'#e6c78e';c.lineWidth=2;
        c.beginPath();c.ellipse(e.x,e.y,20+a*45,7+a*18,0,0,Math.PI*2);c.stroke();
        for(let i=0;i<8;i++){const ang=i*Math.PI/4,xx=e.x+Math.cos(ang)*25,yy=e.y-10-Math.sin(ang)*10-a*50;c.fillStyle=e.color||'#e6c78e';c.fillRect(xx,yy,2,4);}
        c.restore();
      }else if(e.type==='impact'&&a<.5){
        c.save();c.globalAlpha=(1-a/.5)*.35;c.fillStyle=e.boss?'#ce907e':'#d1b185';
        if(e.shape==='beam'){
          c.translate(e.x,e.y);c.rotate(e.angle);c.fillRect(0,-e.width/2,e.length,e.width);
        }else{c.beginPath();c.arc(e.x,e.y,e.radius,0,Math.PI*2);if(e.shape==='ring')c.arc(e.x,e.y,e.inner,0,Math.PI*2,true);c.fill('evenodd');}
        c.restore();
      }else if(e.type==='death'&&a<.65){
        for(let i=0;i<6;i++){const ang=i*Math.PI/3;c.fillStyle=e.boss?'#c9b6e099':'#d5c7a377';c.fillRect(e.x+Math.cos(ang)*a*55,e.y-15+Math.sin(ang)*a*30-a*25,3,3);}
      }else if(e.type==='dash'&&a<.25){
        c.strokeStyle='#cce1d16b';c.beginPath();c.ellipse(e.x,e.y,22+a*50,8+a*15,0,0,Math.PI*2);c.stroke();
      }
    }
    this.damage=this.damage.filter(e=>t-e.born<1000);
    for(const e of this.damage){
      const a=(t-e.born)/1000;c.globalAlpha=Math.min(1,(1-a)*2);
      this.label((e.crit?'✦ ':'')+e.amount,e.x+e.offset,e.y-a*38,e.kind==='player'?'#f0aba3':e.crit?'#f4d38e':'#f5f0dd',e.crit?16:12);
      c.globalAlpha=1;
    }
  }
  drawAtmosphere(t){
    const c=this.ctx;
    if(this.showEffects){
      const color={town:'#d7bc7c',forest:'#a9c190',ruins:'#c4b5e5',citadel:'#db9d7c'}[this.map.id];
      c.fillStyle=color;
      for(let i=0;i<this.skyParticles.length;i++){
        const p=this.skyParticles[i],x=(p.x*this.w+t*.008*p.s)%this.w,y=(p.y*this.h-t*.004*p.s+this.h*20)%this.h;
        c.globalAlpha=.12+.25*(.5+.5*Math.sin(t/800+i));c.fillRect(x,y,2,2);
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
        cc.fillStyle=m.tiles[y*m.w+x]===2?'#294950':m.blocked[y*m.w+x]?'#253a37':m.tiles[y*m.w+x]===1?'#7e8062':'#3d5a47';cc.fillRect(x,y,1,1);
      }
      this.mapCache=cv;
    }
    c.imageSmoothingEnabled=false;c.drawImage(this.mapCache,ox,oy,m.width*scale,m.height*scale);
    const dot=(x,y,col,r=2)=>{c.fillStyle=col;c.beginPath();c.arc(ox+x*scale,oy+y*scale,r,0,Math.PI*2);c.fill();};
    for(const n of m.npcs)dot(n.x,n.y,'#ecd3a0',big?4:2);
    for(const p of m.portals){dot(p.x,p.y,'#b7a5ee',big?5:3);if(big){c.fillStyle='#e6d9bd';c.font='12px sans-serif';c.textAlign='center';c.fillText(p.name,ox+p.x*scale,oy+p.y*scale-10);}}
    for(const mob of this.state.mobs)if(MONSTERS[mob.type].boss)dot(mob.x,mob.y,'#e39791',big?6:3);
    for(const other of this.state.players)dot(other.x,other.y,'#a0d0c6',big?3:1.5);
    dot(this.state.self.x,this.state.self.y,'#fff0bc',big?5:3);
  }
}
