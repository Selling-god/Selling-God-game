/**
 * Original, hand-designed per-frame PIXEL weapon & magic animations.
 * Each class has its own PNG strip: 4 actions x 12 frames, 128px cells.
 * No external CDN. Sheets load lazily and the decoded-image LRU caps memory.
 * Purely cosmetic: network events, hitboxes, damage, and saves are untouched.
 */
import {JOB_ART_PROFILES,jobArtProfile} from './job-signatures.js';

export const PIXEL_SKILL_FRAMES=12;
export const PIXEL_SKILL_CELL=128;
export const PIXEL_SKILL_NAMES=Object.freeze(['basic','skill1','skill2','ultimate']);
export const PIXEL_SKILL_JOBS=Object.freeze(Object.keys(JOB_ART_PROFILES));
export const PIXEL_SKILL_VERSION='v4-20261025-2';
export const PIXEL_SKILL_ATLAS_LIMIT=12;

const images=new Map();
const pending=new Map();
const bad=new Set();
const meleeMotifs=new Set([
 'trail','aegis','shadowsteps','spearline','lotusfist','mineshaft',
 'bloodaxe','holyblade','citadel','paw','runeblade','seal',
 'afterimage','wraith','dragonfang','standard','voidtear',
 'eclipse','feather','whirlpool','throne','shepherd'
]);
const rangedMotifs=new Set(['falcon','crosshair','turret']);
const clamp=(value,a,b)=>Math.max(a,Math.min(b,value));
const skillKey=skill=>PIXEL_SKILL_NAMES.includes(skill)?skill:'basic';

export function pixelSkillSheetURL(job){
 const id=JOB_ART_PROFILES[job]?job:'novice';
 return `/assets/skillfx_v4/${id}.png?v=${PIXEL_SKILL_VERSION}`;
}

function keepRecent(job,image){
 images.delete(job);
 images.set(job,image);
 while(images.size>PIXEL_SKILL_ATLAS_LIMIT){
  // Loading a new class cannot grow mobile image memory without limit.
  const oldest=images.keys().next().value;
  images.delete(oldest);
 }
}

export function loadPixelSkillJob(job){
 const id=JOB_ART_PROFILES[job]?job:'novice';
 if(images.has(id)){keepRecent(id,images.get(id));return Promise.resolve(true);}
 if(pending.has(id))return pending.get(id);
 if(bad.has(id)||typeof Image==='undefined')return Promise.resolve(false);
 const promise=new Promise(resolve=>{
  const sprite=new Image();sprite.decoding='async';
  sprite.onload=()=>{
   if(sprite.naturalWidth!==PIXEL_SKILL_CELL*PIXEL_SKILL_FRAMES||
      sprite.naturalHeight!==PIXEL_SKILL_CELL*PIXEL_SKILL_NAMES.length){
    bad.add(id);resolve(false);return;
   }
   keepRecent(id,sprite);resolve(true);
  };
  sprite.onerror=()=>{bad.add(id);resolve(false);};
  sprite.src=pixelSkillSheetURL(id);
 }).finally(()=>pending.delete(id));
 pending.set(id,promise);
 return promise;
}

export function preloadPixelSkillJobs(jobs){
 if(!jobs||typeof Image==='undefined')return;
 for(const id of new Set(jobs))if(typeof id==='string')void loadPixelSkillJob(id);
}

export function pixelSkillStats(){
 return {loaded:[...images.keys()],pending:[...pending.keys()],missing:[...bad],limit:PIXEL_SKILL_ATLAS_LIMIT};
}

/** Draw original sprite frames in world coordinates, at the caster's hand.
 * Returns false on missing atlas, so the old minimal-fallback is still safe.
 * f is phase 0..1 computed using the existing server event lifetime.
 */
export function drawPixelSkillSprite(renderer,event,f){
 const job=JOB_ART_PROFILES[event.job]?event.job:JOB_ART_PROFILES[event.classId]?event.classId:'novice';
 const sheet=images.get(job);
 if(!sheet){void loadPixelSkillJob(job);return false;}
 if(!renderer?.ctx||!renderer.showEffects||!Number.isFinite(event.x)||!Number.isFinite(event.y))return false;
 keepRecent(job,sheet);
 const skill=skillKey(event.skill),row=PIXEL_SKILL_NAMES.indexOf(skill);
 const frame=clamp(Math.floor(clamp(f,0,.9999)*PIXEL_SKILL_FRAMES),0,PIXEL_SKILL_FRAMES-1);
 const ctx=renderer.ctx,profile=jobArtProfile(job),motif=profile.motif;
 const radius=Math.hypot((event.tx??event.x)-event.x,(event.ty??event.y)-event.y);
 const direction=radius>8?Math.atan2((event.ty??event.y)-event.y,(event.tx??event.x)-event.x):0;
 const guard=skill==='skill2',ult=skill==='ultimate',basic=skill==='basic';
 const base=basic?122:guard?140:ult?184:150;
 const size=base*(renderer.lowPower?.9:1);
 // Sprite origin on caster is anchored at the actual attack hand. The live
 // actor remains readable because each PNG frame has a transparent centre.
 const x=event.x,y=event.y-27;
 const alpha=frame>=10?.55:frame===0?.80:1;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=alpha;
 ctx.translate(Math.round(x),Math.round(y));
 if(!guard){
  // Four exact cardinal rotations preserve crisp pixels; diagonal target
  // direction selects the closest one. Hidden scythes swing through that axis.
  const cardinal=Math.round(direction/(Math.PI/2));
  ctx.rotate(cardinal*Math.PI/2);
 }
 const rect={x:-68/128*size,y:-75/128*size,w:size,h:size};
 if(profile.tier==='hidden'&&ult&&frame>=3&&frame<=8){
  ctx.globalAlpha=.2;
  ctx.drawImage(sheet,frame*128,row*128,128,128,rect.x-6,rect.y+3,rect.w,rect.h);
  ctx.globalAlpha=alpha;
 }
 ctx.drawImage(sheet,frame*128,row*128,128,128,rect.x,rect.y,rect.w,rect.h);
 ctx.restore();

 // Ranged shots are emitted by the actual caster, but the impact must also
 // reach a faraway enemy instead of appearing as if the projectile missed.
 if(!guard&&radius>75&&(rangedMotifs.has(motif)||!meleeMotifs.has(motif))){
  const travel=clamp((f-.12)/.55,0,1),endX=event.tx??event.x,endY=(event.ty??event.y)-23;
  const tipX=x+(endX-x)*travel,tipY=y+(endY-y)*travel;
  const ux=(endX-x)/(radius||1),uy=(endY-y)/(radius||1);
  const half=basic?5:ult?11:8;
  if(travel>.025&&travel<.99){
   const n=renderer.lowPower?3:6;
   ctx.save();ctx.imageSmoothingEnabled=false;
   const primary=profile.tier==='hidden'?'#f7d4ff':rangedMotifs.has(motif)?'#dbf7c7':'#bbddff';
   for(let i=0;i<n;i++){
    const d=i*7+(basic?0:2),w=Math.max(2,4-Math.floor(i/2));
    ctx.globalAlpha=Math.max(.1,(1-i/n)*.9);
    ctx.fillStyle=i===0?'#fff9d8':primary;
    ctx.fillRect(Math.round(tipX-ux*d-half/2),Math.round(tipY-uy*d-half/2),w,w);
   }
   ctx.restore();
  }
  if(f>.55&&f<.93){
   const burst=clamp((f-.55)/.38,0,1);
   ctx.save();ctx.imageSmoothingEnabled=false;
   ctx.globalAlpha=(1-burst)*.94;
   ctx.fillStyle='#fff8ce';
   for(let i=0;i<6+(ult?4:0);i++){
    const a=i*Math.PI*2/(6+(ult?4:0));
    const r=8+burst*(ult?25:13);
    ctx.fillRect(Math.round(endX+Math.cos(a)*r),Math.round(endY+Math.sin(a)*r*.66),3+(i%2),3+(i%2));
   }
   ctx.restore();
  }
 }
 return true;
}
