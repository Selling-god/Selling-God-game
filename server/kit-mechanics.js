/** Server-authoritative active combat verbs. No persistent state schema changes.
 * Works with existing MP, cooldown, combat log, party/instance and boss damage gates.
 */
import {MONSTERS,CLASSES} from '../shared/content.js';
import {dist,moveEntity,isBlocked,lineOfSight} from '../shared/world.js';
import {insideVillage} from '../shared/village-layout.js';
import {bossDamageMultiplier} from './boss-mechanics.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const FIELDS={trap:8000,pet:12000,turret:13000,healing_field:10000,frost_field:9000,star_field:9000,lightning_rod:9000,song:9500,charge:4200};
const pulses={trap:1200,pet:1450,turret:1250,healing_field:1250,frost_field:1200,star_field:1200,lightning_rod:1300,song:1700,charge:1100};
const applicable=(g,p,m)=>m.alive&&g.canSeeEntity(p,m)&&g.canDamage(p,m)&&(!m.worldKey||g.events?.canAttack?.(m)!==false);
const heal=(g,p,ratio)=>{const max=g.stats(p).maxHp,before=p.hp;p.hp=clamp(p.hp+Math.round(max*ratio),1,max);if(p.hp!==before)g.mark(p);};
function teammates(g,p,r=245){const ids=g.parties.get(p.partyId)?.members||[];return [p,...ids.filter(id=>id!==p.id).map(id=>g.players.get(id)).filter(a=>a&&a.active&&a.hp>0&&a.zone===p.zone&&g.sameInstance(p,a)&&dist(p,a)<r)];}
function effect(g,p,skill,role,x=p.x,y=p.y,extra={}){
 g.fx(p.zone,{type:'skill',id:p.id,job:p.classId,skill:skill.id,role,x,y,tx:x,ty:y,color:CLASSES[p.classId].color,...extra});
}
function field(g,p,skill,type,x,y,extra={}){
 g.combatFields ||= [];
 g.combatFields=g.combatFields.filter(f=>f.expires>g.now&&g.players.get(f.owner)?.active);
 // One live copy of each named deployable per caster, no unbounded spam.
 g.combatFields=g.combatFields.filter(f=>!(f.owner===p.id&&f.type===type));
 const entry={owner:p.id,zone:p.zone,type,skill:skill.id,job:p.classId,x,y,radius:extra.radius||140,
   damageRatio:extra.damageRatio??.36,healingRatio:extra.healingRatio??.045,
   expires:g.now+(extra.duration||FIELDS[type]||7000),next:g.now+(extra.firstTick||pulses[type]||1200),
   interval:pulses[type]||1200,slow:extra.slow||false};
 g.combatFields.push(entry);
 if(g.combatFields.length>150)g.combatFields.splice(0,g.combatFields.length-150);
 effect(g,p,skill,type,x,y,{radius:entry.radius});
 return entry;
}
function approach(g,p,dx,dy,distance){
 const map=g.worlds.get(p.zone).map;
 const length=Math.hypot(dx,dy);if(length<.01)return false;
 const old={x:p.x,y:p.y};
 for(let i=0;i<6;i++){
  moveEntity(map,p,dx/length*distance/6,dy/length*distance/6,10);
  if(insideVillage(map,p.x,p.y,9)&&!insideVillage(map,old.x,old.y,9)){p.x=old.x;p.y=old.y;break;}
 }
 if(dist(old,p)>4){p.motionId=(p.motionId||0)+1;p.path=[];p.input={x:0,y:0};g.mark(p);return true;}
 return false;
}
function facing(p){const d={n:[0,-1],s:[0,1],w:[-1,0],e:[1,0]};return d[p.dir]||[0,1];}
/** Called by Game.attack only after skill preconditions; all effects are authoritative. */
export function useKitUtility(g,p,skill){
 const role=skill.role||'counter',target=g.getTarget(p,290),dir=facing(p);
 const s=g.stats(p);
 p.signature||={stacks:0};
 switch(role){
  case 'counter':case 'parry':case 'bastion':{
   p.shieldUntil=Math.max(p.shieldUntil||0,g.now+(role==='bastion'?6400:4200));
   p.signature.counterUntil=g.now+4500;
   if(role==='bastion')field(g,p,skill,'frost_field',p.x,p.y,{radius:145,damageRatio:.12,slow:true,duration:5500});
   for(const m of g.worlds.get(p.zone).mobs)if(applicable(g,p,m)&&dist(m,p)<150)m.target=p.id;
   break;
  }
  case 'leap_trap':case 'smoke':{
   const away=target?[p.x-target.x,p.y-target.y]:[-dir[0],-dir[1]];
   approach(g,p,away[0],away[1],role==='smoke'?110:145);
   if(role==='smoke'){p.invulnerableUntil=g.now+550;p.signature.ambushUntil=g.now+4800;}
   else{p.speedUntil=g.now+4500;field(g,p,skill,'trap',p.x+dir[0]*55,p.y+dir[1]*55,{radius:95,damageRatio:.35,slow:true});}
   break;
  }
  case 'blink':{
   const forward=target?[target.x-p.x,target.y-p.y]:dir;
   approach(g,p,forward[0],forward[1],115);
   p.invulnerableUntil=g.now+350;p.signature.blinkUntil=g.now+5000;
   p.mp=Math.min(s.maxMp,p.mp+(p.classId==='mage'?19:0));break;
  }
  case 'charge':{
   const forward=target?[target.x-p.x,target.y-p.y]:dir;
   const before={x:p.x,y:p.y};approach(g,p,forward[0],forward[1],105);
   field(g,p,skill,'charge',p.x,p.y,{radius:102,damageRatio:.64,duration:2700,firstTick:150});
   p.signature.executeUntil=g.now+7000;
   effect(g,p,skill,'charge',before.x,before.y,{tx:p.x,ty:p.y});break;
  }
  case 'aim':p.signature.aimUntil=g.now+8500;p.signature.stacks=clamp((p.signature.stacks||0)+2,0,8);break;
  case 'fury':{p.signature.rageUntil=g.now+14000;p.signature.stacks=clamp((p.signature.stacks||0)+3,0,8);break;}
  case 'meditate':heal(g,p,.08);p.signature.stacks=clamp((p.signature.stacks||0)+3,0,8);p.signature.focusUntil=g.now+6000;break;
  case 'stance':{
   p.signature.stance=(p.signature.stance==='healing'?'striking':'healing');
   if(p.classId==='spellblade')p.signature.rune=(p.signature.rune==='fire'?'ice':'fire');
   if(p.signature.stance==='healing')for(const a of teammates(g,p))heal(g,a,.07);
   break;
  }
  case 'brew':heal(g,p,.105);p.mp=Math.min(s.maxMp,p.mp+16);p.signature.catalystUntil=g.now+9000;break;
  case 'rewind':{
   const history=[...(p.combatHistory||[])].reverse().find(h=>h.at<=g.now-2700&&h.zone===p.zone)||p.combatHistory?.[0];
   if(history&&g.now-history.at<8000&&history.zone===p.zone){
    const map=g.worlds.get(p.zone).map;
    if(!isBlocked(map,history.x,history.y,12)&&!insideVillage(map,history.x,history.y,10)){p.x=history.x;p.y=history.y;p.motionId=(p.motionId||0)+1;}
    p.hp=clamp(Math.max(p.hp,history.hp),1,s.maxHp);
    p.mp=clamp(Math.max(p.mp,history.mp),0,s.maxMp);
   }else{heal(g,p,.10);}
   for(const id of ['basic','skill1'])p.cooldowns[id]=Math.min(p.cooldowns[id]||g.now,g.now);
   break;
  }
  case 'rebirth':p.signature.rebirthUntil=g.now+15000;heal(g,p,.15);break;
  case 'song':{
   for(const a of teammates(g,p)){a.speedUntil=Math.max(a.speedUntil||0,g.now+8000);a.signature||={stacks:0};a.signature.moraleUntil=g.now+8500;g.mark(a);}
   field(g,p,skill,'song',p.x,p.y,{radius:210,healingRatio:.025,damageRatio:.06});break;
  }
  default:{
   const center=target&&['trap','star_field','lightning_rod','frost_field'].includes(role)?target:p;
   const args={radius:role==='turret'?220:role==='pet'?185:role==='healing_field'?180:140};
   if(role==='healing_field'){for(const a of teammates(g,p,250))heal(g,a,.17);args.healingRatio=p.classId==='priest'?.07:p.classId==='druid'?.062:.052;args.damageRatio=p.classId==='tide_oracle'?.08:0;}
   if(role==='frost_field'){args.slow=true;args.damageRatio=.18;}
   if(role==='trap')args.slow=true;
   field(g,p,skill,role,center.x,center.y,args);
  }
 }
 // Every E leaves a readable, role-specific network event (no generic E shield flash).
 effect(g,p,skill,role,p.x,p.y,{tx:target?.x??p.x+dir[0]*70,ty:target?.y??p.y+dir[1]*70});
 return {ok:true};
}
export function beforeKitAttack(g,p,skill,target){
 const role=skill.role;if(!role||skill.id==='basic')return;
 if(role==='dash'){
  approach(g,p,target.x-p.x,target.y-p.y,Math.min(90,dist(p,target)*.7));
  p.invulnerableUntil=Math.max(p.invulnerableUntil||0,g.now+180);
 }
 if(role==='combo'){p.signature||={stacks:0};p.signature.stacks=clamp((p.signature.stacks||0)+1,0,8);}
 if(role==='slow'&&skill.id==='skill1'){p.cooldowns.skill1=Math.min(p.cooldowns.skill1,g.now+2200);}
}
export function kitVictims(g,p,skill,target,standard){
 const w=g.worlds.get(p.zone),role=skill.role;
 if(role==='pierce'){
  const dx=target.x-p.x,dy=target.y-p.y,d=Math.max(1,Math.hypot(dx,dy)),ux=dx/d,uy=dy/d;
  return w.mobs.filter(m=>applicable(g,p,m)&&dist(p,m)<=skill.range+15&&
    (m.x-p.x)*ux+(m.y-p.y)*uy>=0&&Math.abs((m.x-p.x)*uy-(m.y-p.y)*ux)<=39&&lineOfSight(w.map,p,m));
 }
 if(role==='cone'){
  const dx=target.x-p.x,dy=target.y-p.y,d=Math.max(1,Math.hypot(dx,dy));
  return w.mobs.filter(m=>applicable(g,p,m)&&dist(p,m)<155&&lineOfSight(w.map,p,m)&&((m.x-p.x)*dx+(m.y-p.y)*dy)/Math.max(1,dist(p,m)*d)>.52);
 }
 return standard;
}
export function kitDamage(g,p,skill,m,damage){
 const role=skill.role;
 m.kitMarks||={};
 const mark=m.kitMarks[p.id],hasMark=mark?.expires>g.now?mark.count:0;
 let n=damage;
 // Berserker damage scales with missing HP ONLY while their blood oath is active.
 if(p.classId==='berserker'&&p.signature?.rageUntil>g.now){
   const ratio=clamp(p.hp/Math.max(1,g.stats(p).maxHp),0,1);
   n*=1+(1-ratio)*1.45;
 }
 if(role==='execute'&&m.hp/m.maxHp<.42)n*=1.55;
 if(role==='combo'&&skill.id==='ultimate')n*=1.3;
 if(role==='drain')n*=1.18;
 if(role==='sunder')n*=1.11;
 if(role==='pierce')n*=1.15;
 if(role==='mark'&&skill.id==='ultimate')n*=1+hasMark*.23;
 if(skill.id==='ultimate'&&hasMark)n*=1+hasMark*.08;
 if(role==='chain')n*=1.06;
 if(p.signature?.catalystUntil>g.now&&skill.id!=='basic')n*=1.2;
 if(p.signature?.counterUntil>g.now&&skill.id==='skill1')n*=1.28;
 return Math.max(1,Math.round(n));
}
export function onKitHit(g,p,skill,m,dealt){
 const role=skill.role;
 m.kitMarks||={};
 if(['mark','ignite','freeze','sunder','resonance','fate_thread'].includes(role)){
  const state=m.kitMarks[p.id],count=(state?.expires>g.now?state.count:0)+1;
  m.kitMarks[p.id]={count:Math.min(4,count),expires:g.now+12000};
 }
 // Character-specific status effects that persist in server tick calculations.
 const status=skill.actionId||'';
 if(['poison_vines','acid_flask','thorn_bloom','abyss_bind'].includes(status)){
   m.dots=m.dots.filter(d=>d.by!==p.id||d.kind!=='poison');
   m.dots.push({by:p.id,kind:'poison',left:5,next:g.now+1000,damage:Math.max(1,Math.round(g.stats(p).atk*.15))});
 }
 if(['ignite','firestorm','dragon_breath','flaming_wings','flame_mine'].includes(status)){
   m.dots=m.dots.filter(d=>d.by!==p.id||d.kind!=='burn');
   m.dots.push({by:p.id,kind:'burn',left:4,next:g.now+1000,damage:Math.max(1,Math.round(g.stats(p).atk*.18))});
 }
 if(['chain_lightning','thunder_domain','storm_rod'].includes(status)&&!MONSTERS[m.type].boss)
   m.paralyzedUntil=Math.max(m.paralyzedUntil||0,g.now+900);
 if(['shield_bash','rune_break','earthquake','royal_command'].includes(status)&&!MONSTERS[m.type].boss)
   m.stunUntil=Math.max(m.stunUntil||0,g.now+800);
 if(role==='pull'||role==='push'){
  if(!MONSTERS[m.type].boss){const x=m.x-p.x,y=m.y-p.y,d=Math.max(1,Math.hypot(x,y));
   const sign=role==='pull'?-1:1;moveEntity(g.worlds.get(p.zone).map,m,sign*x/d*34,sign*y/d*34,10);}
 }
 if(role==='stagger'&&!MONSTERS[m.type].boss)m.stunUntil=Math.max(m.stunUntil||0,g.now+600);
 if(role==='freeze'||role==='slow'||role==='field')m.slowUntil=Math.max(m.slowUntil||0,g.now+2300);
 if(role==='drain'||role==='life')heal(g,p,Math.min(.07,dealt/Math.max(1,g.stats(p).maxHp)*.21));
 if(role==='combo'&&skill.id==='ultimate'&&!MONSTERS[m.type].boss)m.stunUntil=Math.max(m.stunUntil||0,g.now+500);
 if(role==='ignite'&&m.kitMarks[p.id]?.count>=3){
  m.hp=Math.max(0,m.hp-Math.round(g.stats(p).atk*.55));m.kitMarks[p.id].count=0;
 }
}
export function afterKitAttack(g,p,skill,target){
 const role=skill.role;
 const x=target.x,y=target.y;
 if(role==='field')field(g,p,skill,'frost_field',x,y,{radius:155,damageRatio:skill.id==='ultimate'?.24:.13,slow:p.classId==='cryomancer',duration:skill.id==='ultimate'?9000:5100});
 if(role==='summon')field(g,p,skill,'pet',x,y,{radius:220,damageRatio:.44,duration:skill.id==='ultimate'?14000:8500});
 if(role==='healing'){field(g,p,skill,'healing_field',p.x,p.y,{radius:230,healingRatio:.055,damageRatio:.12});}
 if(role==='command'){for(const a of teammates(g,p,260)){a.signature||={stacks:0};a.signature.moraleUntil=g.now+8500;g.mark(a);}field(g,p,skill,'song',p.x,p.y,{radius:215,damageRatio:.12,healingRatio:.025});}
 if(role==='delayed'){field(g,p,skill,'trap',x,y,{radius:170,damageRatio:1.30,firstTick:650,duration:2700});}
 if(role==='chain'){field(g,p,skill,'lightning_rod',x,y,{radius:140,damageRatio:.20,duration:3700});}
 if(role==='mark'&&skill.id==='ultimate'&&target.kitMarks?.[p.id])target.kitMarks[p.id].count=0;
}
export function tickCombatFields(g,now){
 if(!g.combatFields?.length)return;
 for(const f of g.combatFields){
  if(f.expires<=now)continue;
  const p=g.players.get(f.owner);
  if(!p?.active||p.hp<=0||p.zone!==f.zone)continue;
  if(now<f.next)continue;
  f.next=now+f.interval;
  const w=g.worlds.get(f.zone);
  const skills=CLASSES[p.classId]?.skills||[];
  const sk=skills.find(s=>s.id===f.skill)||skills[1];
  if(!sk)continue;
  if(f.healingRatio>0){for(const a of teammates(g,p,f.radius+15))if(dist(a,f)<f.radius)heal(g,a,f.healingRatio);}
  if(f.damageRatio>0&&(!insideVillage(w.map,f.x,f.y)||w.mobs.some(m=>m.trainingDummy&&dist(m,f)<f.radius))){
   let count=0;
   for(const m of w.mobs){
    if(count>=((f.type==='turret'||f.type==='pet')?2:5))break;
    if(!applicable(g,p,m)||dist(m,f)>f.radius||!lineOfSight(w.map,f,m))continue;
    const base=Math.max(1,Math.round(g.stats(p).atk*f.damageRatio*bossDamageMultiplier(m)));
    const damage=m.dungeonRun?g.dungeons.damageAmount(m,base):g.encounters.damageAmount(m,base);
    const actual=Math.min(m.hp,damage);
    m.hp=Math.max(0,m.hp-damage);m.target=p.id;m.contributors.set(p.id,now);
    m.damageLog.set(p.id,(m.damageLog.get(p.id)||0)+actual);
    if(f.slow)m.slowUntil=now+2200;
    g.fx(p.zone,{type:'hit',id:m.id,x:m.x,y:m.y-22,amount:damage,kind:'monster',by:p.id});
    if(m.hp<=0)g.killMob(p.zone,m);
    count++;
   }
  }
  // Passive deployables pulse many times. Broadcasting every visual pulse to
  // everyone in a region creates network and Canvas bursts. Damage/heal is
  // still evaluated on EVERY pulse; only redundant ambient FX is throttled.
  f.visualPulses=(f.visualPulses||0)+1;
  if(f.visualPulses===1||(f.visualPulses%2)===0)
   effect(g,p,sk,f.type,f.x,f.y,{radius:f.radius,essential:false});
 }
 g.combatFields=g.combatFields.filter(f=>f.expires>now&&g.players.get(f.owner)?.active);
}

/** Spend 4% maximum HP on a real attack. Self-payment cannot kill or go below 30%. */
export function spendBerserkerRageHp(g,p,skill){
 if(p.classId!=='berserker'||skill.id==='skill2'||p.signature?.rageUntil<=g.now)return 0;
 const max=g.stats(p).maxHp,floor=Math.ceil(max*.30),before=p.hp;
 p.hp=Math.max(floor,p.hp-Math.max(1,Math.ceil(max*.04)));
 p.hp=Math.min(before,p.hp); // if monster attacks already put HP below 30%, never heal it.
 return Math.max(0,before-p.hp);
}
