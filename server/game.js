import {prepareStories,storyAction,recordStory,storyTracker} from './stories.js';
import {prepareAtlas,privateAtlas,revealTerrain,interactPoint,atlasAction,trialView,tickFieldTrial,cancelFieldTrial,fieldTrialKill,fieldTrialInteract,fieldTrialDamageAmount} from './atlas.js';
import {LazyWorldMap} from './lazy-worlds.js';
import {prepareRPG,rpgAction,onDeath,recoverSoul} from './rpg.js';
import {bossVisual} from '../shared/visuals.js';
import {prepareProgression,recordProgress,evaluateJobs,readRelic,progressionAction,ensureDaily,metric} from './progression.js';
import {WorldEvents} from './world-events.js';
import {ChallengeManager} from './challenges.js';
import {DungeonManager} from './dungeons.js';
import {RealmManager} from './realms.js';
import {EncounterManager} from './encounters.js';
import {tickBossMechanics,bossDamageMultiplier,bossMechanicKilled,bossMechanicView} from './boss-mechanics.js';
import {prepareChallenges} from '../shared/challenges.js';
import {prepareDungeons} from '../shared/dungeons.js';
import {prepareRealms} from '../shared/realms.js';
import {combatExperience} from '../shared/rpg.js';
import {prepareVanity, COSMETICS, COSMETIC_SLOTS, validPortrait} from '../shared/personalization.js';
import {ACHIEVEMENTS} from '../shared/expansion.js';
import { randomUUID } from 'node:crypto';
import { CLASSES, ITEMS, MONSTERS, QUESTS, ZONES, NPCS, RECIPES, SHOP, TILE, MAX_LEVEL, xpRequired, getStats, weaponFor } from '../shared/content.js';
import { createMap, seeded, spawnPoint, findSafePosition, moveEntity, isBlocked, lineOfSight, findPath, clamp, dist, BOSS_SPAWNS } from '../shared/world.js';

export function newCharacter(id,name,classId='novice'){
  const c=CLASSES[classId];if(!c)throw new Error('직업을 선택해 주세요.');
  const p={
    id,name,classId,level:1,xp:0,gold:100,zone:'town',x:24*TILE+16,y:21*TILE+16,
    hp:0,mp:0,inventory:{[c.weapon]:1,tunic:1,potion:8,mana:5},
    equipment:{weapon:c.weapon,armor:'tunic',charm:null},enhancements:{},
    quests:{},completed:[],opened:[],kills:0,bossKills:0,gathered:0,playSeconds:0,
    title:'별빛을 따라온 자',titles:['별빛을 따라온 자'],vanity:null,revision:1,createdAt:Date.now()
  };
  prepareProgression(p);prepareStories(p);prepareAtlas(p);prepareChallenges(p);prepareDungeons(p);prepareRealms(p);prepareRPG(p);prepareVanity(p);const s=getStats(p);p.hp=s.maxHp;p.mp=s.maxMp;return p;
}
export function hydrate(state){
  const p={...state};
  p.inventory={...p.inventory};p.equipment={...p.equipment};p.enhancements={...p.enhancements};
  p.quests=structuredClone(p.quests||{});p.completed=[...(p.completed||[])];p.opened=[...(p.opened||[])];
  if(!CLASSES[p.classId])p.classId='novice';
  prepareProgression(p);prepareStories(p);prepareAtlas(p);prepareChallenges(p,{recover:true});prepareDungeons(p,{recover:true});prepareRealms(p,{recover:true});
  p.titles=[...(p.titles||['별빛을 따라온 자'])];p.level=clamp(p.level||1,1,MAX_LEVEL);
  prepareRPG(p);prepareVanity(p);
  if(!ZONES[p.zone])p.zone='town';
  if(!(p.hp>0)){p.zone='town';p.x=24*TILE+16;p.y=21*TILE+16;}
  const map=createMap(p.zone);
  let arrival=findSafePosition(map,{x:p.x,y:p.y},10);
  if(!arrival){p.zone='town';arrival=findSafePosition(createMap('town'),{x:24*TILE+16,y:21*TILE+16},10);}
  p.x=arrival.x;p.y=arrival.y;
  const s=getStats(p);p.hp=clamp(p.hp||s.maxHp,1,s.maxHp);p.mp=clamp(p.mp??s.maxMp,0,s.maxMp);
  Object.assign(p,{active:true,input:{x:0,y:0},lastInput:0,dir:'s',moving:false,cooldowns:{},path:[],
    target:null,dirty:true,inputSeq:0,motionId:0,vx:0,vy:0,lastCombat:0,lastRegen:0,lastSecond:0,invulnerableUntil:0,shieldUntil:0,
    dashUntil:0,speedUntil:0,attackUntil:0,respawnAt:0,partyId:null,actions:new Map(),lastTalk:0,lastInteract:0});
  return p;
}
export function serialize(p){
  const keys=['id','name','classId','level','xp','gold','zone','x','y','hp','mp','inventory','equipment','enhancements','quests','completed','opened','kills','bossKills','gathered','playSeconds','title','titles','revision','createdAt','schemaVersion','discovery','journey','atlas','daily','attributes','statResets','enhancePity','deaths','deathWeakUntil','soul','lastDeath','challenges','dungeons','realms','vanity'];
  return structuredClone(Object.fromEntries(keys.map(k=>[k,p[k]])));
}
export class Game {
  constructor({send=()=>{},broadcast=()=>{},save=()=>{},random=Math.random,eventStore=null}={}){
    this.players=new Map();this.worlds=new Map();this.parties=new Map();this.invites=new Map();
    this.send=send;this.broadcast=broadcast;this.save=save;this.random=random;this.now=Date.now();this.castSeq=0;
    this.worlds=new LazyWorldMap(this,id=>this.createWorld(id));
    this.worlds.get('town');
    this.events=new WorldEvents(this,eventStore);
    this.challenges=new ChallengeManager(this);
    this.dungeons=new DungeonManager(this);
    this.realms=new RealmManager(this);
    this.encounters=new EncounterManager(this);
  }
  createWorld(id){
    const z=ZONES[id];if(!z)throw new Error('Unknown region');
    const map=createMap(id),world={id,map,mobs:[],nodes:map.resources.map(x=>({...x,readyAt:0})),casts:[],lastAccess:this.now,fieldTrial:null};
    if(id!=='town'&&!z.challenge&&!z.dungeon){
      const rand=seeded(z.seed||{forest:551,ruins:989,citadel:1411}[id]);
      const types=z.mobTypes||(id==='forest'?['slime','slime','beetle','wolf']:id==='ruins'?['skeleton','skeleton','wisp','golem']:['imp','ash_knight','ash_knight']);
      const count=z.mobCount||(id==='forest'?34:id==='ruins'?28:24);
      for(let i=0;i<count;i++){
        let pt;
        if(map.encounters?.length){
          const anchor=map.encounters[i%map.encounters.length];
          for(let tries=0;tries<25;tries++){
            const angle=rand()*Math.PI*2,r=25+rand()*80;
            pt={x:anchor.x+Math.cos(angle)*r,y:anchor.y+Math.sin(angle)*r};
            if(!isBlocked(map,pt.x,pt.y,16))break;
          }
          if(!pt||isBlocked(map,pt.x,pt.y,16))pt=anchor;
        }else pt=spawnPoint(map,rand);
        world.mobs.push(this.makeMob(`${id}_m${i}`,types[i%types.length],pt.x,pt.y));
      }
      if(id==='forest')for(let i=0;i<5;i++){
        const x=(i%2?27:33)*TILE+16,y=(37-Math.floor(i/2)*3)*TILE+16;
        if(!isBlocked(map,x,y,14))world.mobs.push(this.makeMob(`forest_intro${i}`,'slime',x,y));
      }
      const b=BOSS_SPAWNS[id];
      if(b?.type)world.mobs.push(this.makeMob(`${id}_boss`,b.type,b.x,b.y));
    }
    return world;
  }
  makeMob(id,type,x,y){
    const m=MONSTERS[type];
    return {id,type,x,y,homeX:x,homeY:y,hp:m.hp,maxHp:m.hp,dir:'s',moving:false,
      alive:true,respawnAt:0,target:null,nextAttack:0,castUntil:0,slowUntil:0,
      contributors:new Map(),damageLog:new Map(),supportLog:new Map(),dots:[],stunUntil:0,wanderAt:0,walkDir:{x:0,y:0},phase:0,
      encounterState:null,encounterPhase:1,encounterTransition:null,encounterPose:null,encounterSummon:null};
  }
  addPlayer(state){
    const p=hydrate(state);p.arrivedAt=this.now;this.players.set(p.id,p);evaluateJobs(this,p,false);return p;
  }
  mark(p){p.revision=(p.revision||0)+1;p.dirty=true;}
  toast(p,message,tone='info'){this.send(p.id,'notice',{message,tone});}
  fx(zone,data){
    if(ZONES[zone]?.dungeon){this.dungeons.fx({...data,t:this.now});return;}
    if(ZONES[zone]?.challenge){
      const actor=this.players.get(data.by||data.id);
      const entity=actor||this.worlds.get(zone).mobs.find(m=>m.id===data.id||m.id===data.owner);
      const owner=data.challengeOwner||entity?.challengeOwner||(actor?.zone===zone?actor.id:null);
      if(owner)this.send(owner,'fx',{...data,t:this.now});
      return;
    }
    this.broadcast(zone,'fx',{...data,t:this.now});
  }
  stats(p){return getStats(p,this.now);}
  canSeeEntity(p,entity){return this.challenges.allows(p,entity)&&this.dungeons.allows(p,entity);}
  canDamage(p,m){return this.encounters.canDamage(m)&&this.challenges.canDamage(p,m)&&this.dungeons.canDamage(p,m)&&this.realms.canDamage(p,m)&&!m.trialShield;}
  sameInstance(a,b){return this.challenges.sameInstance(a,b)&&this.dungeons.sameInstance(a,b);}
  mobSpec(m){return m.dungeonRun?this.dungeons.mobSpec(m):this.challenges.mobSpec(m);}
  publicPlayer(p){
    const s=this.stats(p);
    return {id:p.id,name:p.name,classId:p.classId,level:p.level,x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,dir:p.dir,vx:Math.round(p.vx||0),vy:Math.round(p.vy||0),
      moving:p.moving,hp:Math.round(p.hp),maxHp:s.maxHp,title:p.title,vanity:{slots:{...p.vanity.slots},avatarPixels:p.vanity.avatarPixels},arrivedAt:p.arrivedAt||0,
      attacking:p.attackUntil>this.now,shield:p.shieldUntil>this.now,dashing:p.dashUntil>this.now,
      dead:p.hp<=0,weapon:p.equipment.weapon,equipment:{...p.equipment},gearEnhance:Object.fromEntries(Object.values(p.equipment).filter(Boolean).map(id=>[id,p.enhancements[id]||0])),weakened:s.weakened,partyId:p.partyId};
  }
  privatePlayer(p){
    return {...serialize(p),atlas:privateAtlas(p),realms:this.realms.profile(p),storyTracker:storyTracker(p),stats:this.stats(p),cooldowns:{...p.cooldowns},target:p.target,partyId:p.partyId,
      shieldUntil:p.shieldUntil,respawnAt:p.respawnAt,lastCombat:p.lastCombat,
      soul:p.soul&&p.soul.expires>this.now?p.soul:null,achievementProgress:Object.fromEntries(ACHIEVEMENTS.map(a=>[a.id,metric(p,a.metric)]))};
  }
  snapshot(p,full=false){
    const w=this.worlds.get(p.zone),near=800;
    const withEvents=full||!p.lastEventsAt||this.now-p.lastEventsAt>=1000;
    if(withEvents)p.lastEventsAt=this.now;
    return {
      t:this.now,zone:p.zone,self:{...this.publicPlayer(p),mp:Math.round(p.mp),maxMp:this.stats(p).maxMp,
        cooldowns:p.cooldowns,target:p.target,revision:p.revision,respawnAt:p.respawnAt,
        inputSeq:p.inputSeq||0,motionId:p.motionId||0,speed:this.stats(p).speed,
        speedUntil:p.speedUntil,dashUntil:p.dashUntil,dashVector:p.dashVector||{x:0,y:0},pathing:p.path.length>0},
      players:[...this.players.values()].filter(x=>x.active&&x.id!==p.id&&x.zone===p.zone&&this.sameInstance(p,x)&&dist(x,p)<near+200).map(x=>this.publicPlayer(x)),
      mobs:w.mobs.filter(m=>m.alive&&this.canSeeEntity(p,m)&&dist(m,p)<near).map(m=>({id:m.id,type:m.type,name:m.name||MONSTERS[m.type].name,dungeonObjective:m.dungeonObjective,level:this.mobSpec(m).level,x:Math.round(m.x*10)/10,y:Math.round(m.y*10)/10,hp:m.hp,maxHp:m.maxHp,dir:m.dir,moving:m.moving,casting:m.castUntil>this.now,slow:m.slowUntil>this.now,phase:Math.max(0,(m.encounterPhase||1)-1),encounterPose:this.encounters.viewMob(m),encounterForm:m.encounterForm,dot:m.dots?.[0]?.kind,challengeShield:!!(m.challengeShield||m.dungeonShield||m.trialShield||m.encounterTransition?.ends>this.now),mechanicObjective:m.mechanicObjective})),
      nodes:w.nodes.filter(n=>dist(n,p)<near).map(n=>({...n,ready:n.readyAt<=this.now})),
      casts:w.casts.filter(c=>this.canSeeEntity(p,c)&&c.ends>this.now&&dist(c,p)<near+350).map(({damage,owner,challengeOwner,challengeRun,...c})=>c),
      bosses:w.mobs.filter(m=>this.canSeeEntity(p,m)&&MONSTERS[m.type].boss).map(m=>({id:m.id,type:m.type,hp:m.hp,maxHp:m.maxHp,alive:m.alive,respawnAt:m.respawnAt})),
      soul:p.soul?.expires>this.now&&p.soul.zone===p.zone?p.soul:null,
      online:[...this.players.values()].filter(x=>x.active).length,
      zoneOnline:[...this.players.values()].filter(x=>x.active&&x.zone===p.zone&&this.sameInstance(p,x)).length,
      challenge:this.challenges.view(p),
      dungeon:this.dungeons.view(p),
      realm:this.realms.view(p),
      encounter:this.encounters.view(p),
      bossMechanics:bossMechanicView(this,w),
      fieldTrial:trialView(w,this.now),events:withEvents?this.events.view(this.now):undefined,eventError:withEvents?this.events.error:undefined,
      party:this.partyView(p),profile:full?this.privatePlayer(p):undefined
    };
  }
  partyView(p){
    const party=this.parties.get(p.partyId);if(!party)return null;
    return {id:party.id,leader:party.leader,members:party.members.map(id=>this.players.get(id)).filter(Boolean).map(m=>({id:m.id,name:m.name,classId:m.classId,level:m.level,zone:m.zone,hp:Math.round(m.hp),maxHp:this.stats(m).maxHp,online:m.active}))};
  }
  setInput(p,v){
    if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return;
    if(v.seq!==undefined){
      if(!Number.isSafeInteger(v.seq)||v.seq<0||v.seq<=(p.inputSeq||0))return;
      p.inputSeq=v.seq;
    }
    if(this.dungeons.blocksInput(p)){p.input={x:0,y:0};p.path=[];p.dashUntil=0;return;}
    if(v.stop){p.path=[];p.dashUntil=0;}
    const mag=Math.hypot(v.x,v.y);p.input={x:mag>1?v.x/mag:v.x,y:mag>1?v.y/mag:v.y};
    p.lastInput=this.now;
    if(mag>.05)p.path=[];
  }
  addItem(p,id,n=1){
    if(!ITEMS[id]||!Number.isInteger(n)||n<1)return;
    p.inventory[id]=Math.min(9999,(p.inventory[id]||0)+n);
  }
  giveXP(p,n){
    p.xp+=Math.round(n);
    let levelled=false;
    while(p.level<MAX_LEVEL&&p.xp>=xpRequired(p.level)){
      p.xp-=xpRequired(p.level);p.level++;levelled=true;
    }
    if(p.level===MAX_LEVEL)p.xp=Math.min(p.xp,xpRequired(p.level));
    if(levelled){
      const s=this.stats(p);p.hp=s.maxHp;p.mp=s.maxMp;
      this.fx(p.zone,{type:'level',id:p.id,x:p.x,y:p.y,level:p.level});
      this.toast(p,`레벨 ${p.level}! 능력치 포인트가 추가되었습니다. 능력치 메뉴에서 배분하세요.`,'success');
      if(p.level>=5&&!p.titles.includes('별의 길잡이'))p.titles.push('별의 길잡이');
    }
  }
  progress(p,kind,target,n=1){
    for(const [id,state]of Object.entries(p.quests)){
      const q=QUESTS.find(q=>q.id===id);if(!q)continue;
      const before=this.questReady(p,id);
      q.objectives.forEach((o,i)=>{if(o.kind===kind&&(o.target===target||o.target==='any'))state.progress[i]=Math.min(o.count,(state.progress[i]||0)+n);});
      if(!before&&this.questReady(p,id))this.toast(p,`의뢰 완료 가능 · ${q.name}`,'success');
    }
  }
  questReady(p,id){
    const q=QUESTS.find(q=>q.id===id),s=p.quests[id];
    return Boolean(q&&s&&q.objectives.every((o,i)=>(s.progress[i]||0)>=o.count));
  }
  nearNpc(p,kind){
    return NPCS.some(n=>n.zone===p.zone&&n.kind===kind&&dist(p,n)<130);
  }
  getTarget(p,range){
    const w=this.worlds.get(p.zone);
    const chosen=w.mobs.find(m=>m.id===p.target&&m.alive&&this.canSeeEntity(p,m)&&dist(m,p)<=range+(MONSTERS[m.type].radius||14));
    if(chosen&&lineOfSight(w.map,p,chosen))return chosen;
    return w.mobs.filter(m=>m.alive&&this.canSeeEntity(p,m)&&dist(m,p)<=range+(MONSTERS[m.type].radius||14)&&lineOfSight(w.map,p,m)).sort((a,b)=>dist(a,p)-dist(b,p))[0];
  }
  attack(p,skillId){
    const c=CLASSES[p.classId],skill=c.skills.find(x=>x.id===skillId);
    if(!skill)return {ok:false,error:'없는 기술입니다.'};
    if(p.level<skill.unlock)return {ok:false,error:`레벨 ${skill.unlock}에 배울 수 있습니다.`};
    if((p.cooldowns[skillId]||0)>this.now)return {ok:false,quiet:true};
    if(p.mp<skill.mp)return {ok:false,error:'마나가 부족합니다. 마나 물약을 사용해 보세요.'};
    if(skill.power===0){
      let restored=0;const beforeHeal=p.hp;
      p.mp-=skill.mp;p.cooldowns[skillId]=this.now+skill.cd;
      if(skill.shield)p.shieldUntil=this.now+5000;
      if(skill.heal)p.hp=Math.min(this.stats(p).maxHp,p.hp+this.stats(p).maxHp*skill.heal*(1+(c.passive?.healBonus||0)));
      restored+=Math.max(0,p.hp-beforeHeal);
      if(skill.haste||c.identity==='haste')p.speedUntil=this.now+4500;
      if(skill.partyHeal){
        const party=this.parties.get(p.partyId);
        for(const id of party?.members||[]){
          const ally=this.players.get(id);if(!ally?.active||ally.id===p.id||ally.zone!==p.zone||!this.sameInstance(p,ally)||ally.hp<=0||dist(ally,p)>260)continue;
          const amount=Math.min(this.stats(ally).maxHp-ally.hp,this.stats(ally).maxHp*skill.heal*(1+(c.passive?.healBonus||0)));
          ally.hp+=amount;restored+=Math.max(0,amount);this.mark(ally);
          for(const mob of this.worlds.get(p.zone).mobs)if(mob.alive&&(mob.worldKey||mob.trialKey)&&mob.contributors.has(ally.id)&&amount>0){
            mob.contributors.set(p.id,this.now);mob.supportLog.set(p.id,(mob.supportLog.get(p.id)||0)+amount);
          }
        }
      }
      if(restored>0){recordProgress(this,p,'heal','any',1);recordStory(this,p,{kind:'restore',target:'any'});}
      // Buffs without an actual combat target do not satisfy offensive practice.

      this.fx(p.zone,{type:'skill',id:p.id,job:p.classId,skill:skillId,x:p.x,y:p.y,tx:p.x,ty:p.y,color:c.color});this.mark(p);return {ok:true};
    }
    const target=this.getTarget(p,skill.range);
    if(!target)return {ok:false,quiet:skillId==='basic',error:'공격할 적에게 조금 더 가까이 다가가세요.'};
    if(!this.canDamage(p,target))return {ok:false,error:target.dungeonRun?'던전의 협동 기믹을 해결해 보스의 보호막을 해제하세요.':'봉인을 해제하거나 소환수를 처치해야 수호자를 공격할 수 있습니다.'};
    const w=this.worlds.get(p.zone);
    p.target=target.id;p.mp-=skill.mp;p.cooldowns[skillId]=this.now+skill.cd;
    p.attackUntil=this.now+300;p.lastCombat=this.now;
    const dx=target.x-p.x,dy=target.y-p.y;
    p.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'e':'w'):(dy>0?'s':'n');
    const center=skill.center==='self'||!skill.center&&(c.family||p.classId)==='guardian'?p:target;
    const victims=skill.radius?w.mobs.filter(m=>m.alive&&this.canDamage(p,m)&&dist(m,center)<=skill.radius&&lineOfSight(w.map,p,m)):[target];
    this.fx(p.zone,{type:'attack',id:p.id,classId:c.family||p.classId,job:p.classId,center:skill.center||((c.family||p.classId)==='guardian'?'self':'target'),skill:skillId,x:p.x,y:p.y,tx:target.x,ty:target.y,radius:skill.radius,color:c.color});
    if(victims.length)recordStory(this,p,{kind:skillId==='basic'?'hit':'skill',target:c.family||p.classId,skill:skillId});
    for(const m of victims){
      const crit=this.random()*100<this.stats(p).crit;
      const rawDamage=Math.max(1,Math.round((this.stats(p).atk*skill.power-this.mobSpec(m).def*.65*(1-(c.passive?.armorPierce||0)))*(0.92+this.random()*.16)*(crit?1.65:1)*bossDamageMultiplier(m)));
      const baseDamage=m.dungeonRun?this.dungeons.damageAmount(m,rawDamage):this.encounters.damageAmount(m,rawDamage);
      const damage=fieldTrialDamageAmount(w,m,baseDamage);
      const actual=Math.min(m.hp,damage);
      m.hp=Math.max(0,m.hp-damage);m.contributors.set(p.id,this.now);m.damageLog.set(p.id,(m.damageLog.get(p.id)||0)+actual);m.target=p.id;
      const drain=(c.passive?.lifesteal||0)+(skill.lifesteal||0);
      if(drain)p.hp=Math.min(this.stats(p).maxHp,p.hp+actual*drain);
      if(skill.slow)m.slowUntil=this.now+skill.slow;
      if(skill.stun&&!MONSTERS[m.type].boss)m.stunUntil=this.now+skill.stun;
      if(skill.dot){
        m.dots=m.dots.filter(d=>d.by!==p.id||d.kind!==skill.dot.kind);
        m.dots.push({by:p.id,kind:skill.dot.kind,left:skill.dot.ticks,next:this.now+1000,damage:Math.max(1,Math.round(this.stats(p).atk*skill.dot.power))});
      }
      if(skillId==='ultimate'||((c.family||p.classId)==='mage'&&skillId==='skill1'))m.slowUntil=this.now+2500;
      this.fx(p.zone,{type:'hit',id:m.id,x:m.x,y:m.y-22,amount:damage,crit,kind:'monster',by:p.id});
      if(m.hp<=0)this.killMob(p.zone,m);
    }
    this.mark(p);return {ok:true};
  }
  killMob(zone,m){
    if(!m.alive)return;
    if(this.encounters.mobKilled(this.worlds.get(zone),m))return;
    if(this.realms.mobKilled(m))return;
    if(this.dungeons.mobKilled(m))return;
    if(this.challenges.mobKilled(m))return;
    if(bossMechanicKilled(this,this.worlds.get(zone),m))return;
    if(m.trialKey&&fieldTrialKill(this,this.worlds.get(zone),m))return;
    const spec=MONSTERS[m.type];m.alive=false;m.hp=0;m.respawnAt=m.worldKey?Infinity:this.now+(spec.boss?120000:18000+this.random()*10000);
    if(m.worldKey)this.events.defeated(m);
    const eligible=new Set();
    for(const [id,at]of m.contributors){
      const p=this.players.get(id);if(p?.active&&p.hp>0&&p.zone===zone&&dist(p,m)<850&&this.now-at<90000){
        eligible.add(id);
        const party=this.parties.get(p.partyId);
        for(const mid of party?.members||[]){
          const friend=this.players.get(mid);
          if(friend?.active&&friend.hp>0&&friend.zone===zone&&dist(friend,m)<550)eligible.add(mid);
        }
      }
    }
    for(const id of eligible){
      const p=this.players.get(id);
      if(m.worldKey){
        const contribution=(m.damageLog.get(id)||0)+(m.supportLog.get(id)||0)*.5;
        if(contribution<Math.max(20,m.maxHp*.002)||p.discovery.rewardedWindows.includes(m.worldKey))continue;
        p.discovery.rewardedWindows.push(m.worldKey);p.discovery.rewardedWindows=p.discovery.rewardedWindows.slice(-100);
        recordProgress(this,p,'world',m.worldEventId);
      }
      const gold=Math.floor(spec.gold[0]+this.random()*(spec.gold[1]-spec.gold[0]+1));
      p.gold+=gold;p.kills++;if(spec.boss)p.bossKills++;
      recordProgress(this,p,'kill',m.type);if(spec.boss)recordProgress(this,p,'boss',m.type);
      const earnedXP=combatExperience(spec.xp,p.level,spec.level,{boss:!!spec.boss,party:!!p.partyId});
      this.giveXP(p,earnedXP);
      this.progress(p,'kill',m.type);this.addItem(p,spec.material,1);
      if(this.random()<.12)this.addItem(p,'potion',1);
      const drops=[{id:spec.material,count:1}];
      if(m.worldKey){this.addItem(p,'world_token',2);drops.push({id:'world_token',count:2});
        if(spec.signatureCore){this.addItem(p,spec.signatureCore);drops.push({id:spec.signatureCore,count:1});}
      }
      if(spec.boss){
        const reward=spec.gearCharm||(m.type==='moss_guardian'?'moss_charm':m.type==='moon_witch'?'moon_robe':spec.level>=16?'relic_charm':spec.level>=9?'dawn_charm':'moss_charm');
        this.addItem(p,reward);drops.push({id:reward,count:1});
        if(!p.titles.includes('수호자의 벗'))p.titles.push('수호자의 벗');
      }else if(this.random()<.065){
        const reward=spec.gearTier?weaponFor(spec.gearTier,p.classId):spec.level>=9?weaponFor('star',p.classId):spec.level>=5?'leather':(this.random()>.5?'ore':'potion');
        this.addItem(p,reward);drops.push({id:reward,count:1});
      }
      this.send(p.id,'loot',{gold,xp:earnedXP,items:drops,boss:!!spec.boss,name:spec.name});
      this.mark(p);
    }
    this.fx(zone,{type:'death',id:m.id,monster:m.type,x:m.x,y:m.y,boss:!!spec.boss});
    if(spec.worldBoss)this.broadcast(null,'worldNotice',{kind:'worldBoss',event:'defeated',id:m.worldEventId||m.type,message:`월드 보스 격파! ${spec.name}이(가) 쓰러졌습니다. 기여한 모험가에게 전리품이 지급되었습니다.`});
    m.contributors.clear();
  }
  damagePlayer(p,amount){
    if(p.hp<=0||p.invulnerableUntil>this.now||this.encounters.protects(p))return;
    let damage=Math.max(1,Math.round(amount-this.stats(p).def*.65));
    damage=Math.max(1,Math.round(damage*(1-(CLASSES[p.classId].passive?.reduction||0))));
    if(p.shieldUntil>this.now){const before=damage;damage=Math.max(1,Math.round(damage*.45));if(before>damage)recordStory(this,p,{kind:'guard',target:'any'});}
    p.hp=Math.max(0,p.hp-damage);p.lastCombat=this.now;
    this.fx(p.zone,{type:'hit',id:p.id,x:p.x,y:p.y-25,amount:damage,kind:'player'});
    if(p.hp<=0){
      if(!this.dungeons.onDeath(p)&&!this.challenges.onDeath(p)){
        p.path=[];p.input={x:0,y:0};p.respawnAt=this.now+3500;
        onDeath(this,p);
      }
    }
    this.mark(p);
  }
  teleport(p,zone,x,y){
    if(!ZONES[zone]||!this.realms.canEnter(p,zone))return false;
    const arrival=findSafePosition(this.worlds.get(zone).map,{x,y},10);
    if(!arrival)return false;
    this.dungeons.beforeTeleport(p,zone);
    this.realms.beforeTeleport(p,zone);
    this.challenges.beforeTeleport(p,zone);
    p.zone=zone;p.x=arrival.x;p.y=arrival.y;p.arrivedAt=this.now;p.path=[];p.input={x:0,y:0};p.target=null;p.vx=0;p.vy=0;p.moving=false;
    p.dashUntil=0;p.dashVector={x:0,y:0};p.lastInput=0;p.motionId=(p.motionId||0)+1;
    recordProgress(this,p,'visit',zone);p.nextSurveyAt=0;revealTerrain(this,p);
    p.invulnerableUntil=this.now+2200;this.mark(p);
    this.send(p.id,'zone',{zone,profile:this.privatePlayer(p)});
    return true;
  }
  interact(p,id){
    const realm=this.realms.action(p,{type:'interact',id});if(realm)return realm;
    const dungeon=this.dungeons.action(p,{type:'interact',id});if(dungeon)return dungeon;
    const challenge=this.challenges.action(p,{type:'interact',id});if(challenge)return challenge;
    const trial=fieldTrialInteract(this,p,id);if(trial)return trial;
    if(this.now-p.lastInteract<450)return {ok:false,quiet:true};
    const w=this.worlds.get(p.zone);
    let options=[
      ...(p.soul&&p.soul.zone===p.zone&&p.soul.expires>this.now?[{...p.soul,entity:'soul'}]:[]),
      ...w.map.npcs.map(n=>({...n,entity:'npc'})),
      ...w.map.portals.map(n=>({...n,entity:'portal'})),
      ...w.nodes.filter(n=>n.readyAt<=this.now).map(n=>({...n,entity:'node'})),
      ...w.map.chests.filter(n=>!p.opened.includes(n.id)).map(n=>({...n,entity:'chest'})),
      ...(w.map.relics||[]).map(n=>({...n,entity:'relic'})),
      ...(w.map.storyPoints||[]).map(n=>({...n,entity:'storyPoint'}))
    ].filter(n=>dist(p,n)<95&&(!id||n.id===id)).sort((a,b)=>dist(p,a)-dist(p,b));
    const obj=options[0];if(!obj)return {ok:false,error:'가까이 다가가서 상호작용해 주세요.'};
    p.lastInteract=this.now;
    if(obj.entity==='soul')return recoverSoul(this,p,obj.id);
    if(obj.entity==='storyPoint')return interactPoint(this,p,obj);
    if(obj.entity==='relic')return readRelic(this,p,obj);
    if(obj.entity==='npc'){
      if(obj.kind==='heal'){
        const s=this.stats(p);p.hp=s.maxHp;p.mp=s.maxMp;this.mark(p);this.fx(p.zone,{type:'buff',id:p.id,x:p.x,y:p.y,color:'#9bdfb6'});
      }
      this.send(p.id,'dialog',{npc:obj.id});return {ok:true};
    }
    if(obj.entity==='portal'){
      if(p.level<obj.level)return {ok:false,error:`레벨 ${obj.level}부터 들어갈 수 있습니다.`};
      this.teleport(p,obj.to,obj.tx,obj.ty);return {ok:true};
    }
    if(obj.entity==='node'){
      if((p.cooldowns.gather||0)>this.now)return {ok:false,quiet:true};
      const node=w.nodes.find(n=>n.id===obj.id);if(node.readyAt>this.now)return {ok:false,quiet:true};
      node.readyAt=this.now+45000;p.cooldowns.gather=this.now+1200;
      this.addItem(p,node.type,1);p.gathered++;recordProgress(this,p,'gather',node.type);this.progress(p,'gather',node.type);this.giveXP(p,8);
      this.mark(p);this.fx(p.zone,{type:'gather',id:p.id,x:node.x,y:node.y,color:'#9cdeaa'});
      this.send(p.id,'loot',{gold:0,xp:8,items:[{id:node.type,count:1}]});return {ok:true};
    }
    if(obj.entity==='chest'){
      p.opened.push(obj.id);recordStory(this,p,{kind:'chest',target:'any'});evaluateJobs(this,p);const gold=40+ZONES[p.zone].minLevel*12;p.gold+=gold;
      this.addItem(p,'potion',2);this.addItem(p,'ore',2);this.giveXP(p,40);
      this.mark(p);this.send(p.id,'loot',{gold,xp:40,items:[{id:'potion',count:2},{id:'ore',count:2}],boss:true,name:'잊힌 여행자의 보물'});
      return {ok:true};
    }
  }
  action(p,a){
    if(!a||typeof a.type!=='string')return {ok:false,error:'잘못된 요청입니다.'};
    const dungeonResult=this.dungeons.action(p,a);if(dungeonResult)return dungeonResult;
    if(p.hp<=0&&a.type!=='respawn')return {ok:false,quiet:true};
    const realmResult=this.realms.action(p,a);if(realmResult)return realmResult;
    const challengeResult=this.challenges.action(p,a);if(challengeResult)return challengeResult;
    const storyResult=storyAction(this,p,a);if(storyResult)return storyResult;
    const atlasResult=atlasAction(this,p,a);if(atlasResult)return atlasResult;
    const rpgResult=rpgAction(this,p,a);if(rpgResult)return rpgResult;
    const expansionResult=progressionAction(this,p,a);if(expansionResult)return expansionResult;
    if(a.type==='worldJoin')return this.events.join(p,a.id);
    if(a.type==='attack')return this.attack(p,a.skill||'basic');
    if(a.type==='target'){
      if(typeof a.id!=='string')return {ok:false,quiet:true};
      const m=this.worlds.get(p.zone).mobs.find(m=>m.id===a.id&&m.alive&&this.canSeeEntity(p,m)&&dist(m,p)<750);
      if(m)p.target=m.id;return {ok:!!m};
    }
    if(a.type==='move'){
      if(!Number.isFinite(a.x)||!Number.isFinite(a.y))return {ok:false,quiet:true};
      if((p.nextPath||0)>this.now)return {ok:false,quiet:true};
      p.nextPath=this.now+160;
      p.path=findPath(this.worlds.get(p.zone).map,p,{x:a.x,y:a.y});p.input={x:0,y:0};return {ok:true,path:p.path};
    }
    if(a.type==='dash'){
      if((p.cooldowns.dash||0)>this.now)return {ok:false,quiet:true};
      p.cooldowns.dash=this.now+4000;p.dashUntil=this.now+190;p.invulnerableUntil=this.now+280;
      let v=p.input;
      if(Math.hypot(v.x,v.y)<.1)v={s:{x:0,y:1},n:{x:0,y:-1},e:{x:1,y:0},w:{x:-1,y:0}}[p.dir];
      p.dashVector={...v};this.fx(p.zone,{type:'dash',id:p.id,x:p.x,y:p.y,dx:v.x,dy:v.y,direction:p.dir,job:p.classId,color:CLASSES[p.classId].color});return {ok:true};
    }
    if(a.type==='interact')return this.interact(p,a.id);
    if(a.type==='return'){
      if(p.zone==='town')return {ok:false,error:'이미 마을에 있습니다.'};
      if(this.now-p.lastCombat<5000)return {ok:false,error:'전투가 끝나고 5초 뒤 귀환할 수 있습니다.'};
      if((p.cooldowns.return||0)>this.now)return {ok:false,error:'귀환석이 아직 충전 중입니다.'};
      p.cooldowns.return=this.now+30000;this.teleport(p,'town',24*TILE+16,21*TILE+16);
      return {ok:true};
    }
    if(a.type==='use'){
      if(!['potion','mana'].includes(a.id))return {ok:false,error:'사용할 수 없는 아이템입니다.'};
      if((p.inventory[a.id]||0)<=0)return {ok:false,error:'물약이 없습니다. 상인이나 제작 메뉴를 찾아보세요.'};
      if((p.cooldowns[a.id]||0)>this.now)return {ok:false,quiet:true};
      const s=this.stats(p),isHp=a.id==='potion';
      if((isHp?p.hp>=s.maxHp:p.mp>=s.maxMp))return {ok:false,error:isHp?'체력이 가득합니다.':'마나가 가득합니다.'};
      p.inventory[a.id]--;p.cooldowns[a.id]=this.now+5000;
      if(isHp){p.hp=Math.min(s.maxHp,p.hp+s.maxHp*.45);recordStory(this,p,{kind:'restore',target:'any'});}else p.mp=Math.min(s.maxMp,p.mp+s.maxMp*.5);
      this.mark(p);this.fx(p.zone,{type:'buff',id:p.id,x:p.x,y:p.y,color:isHp?'#dd998e':'#8fbcf0'});return {ok:true};
    }
    if(a.type==='equip'){
      const i=ITEMS[a.id];
      if(!i||i.type!=='gear'||!(p.inventory[a.id]>0))return {ok:false,error:'보유한 장비만 장착할 수 있습니다.'};
      if(i.class&&i.class!==(CLASSES[p.classId].family||p.classId))return {ok:false,error:'다른 직업의 무기입니다.'};
      if(p.level<i.level)return {ok:false,error:`레벨 ${i.level} 이상이 필요합니다.`};
      p.equipment[i.slot]=a.id;
      const s=this.stats(p);p.hp=Math.min(p.hp,s.maxHp);p.mp=Math.min(p.mp,s.maxMp);
      this.mark(p);return {ok:true,message:`${i.name} 장착`};
    }
    if(a.type==='quest'){
      if(!this.nearNpc(p,'quest'))return {ok:false,error:'마을의 리아 가까이에서 대화해 주세요.'};
      const q=QUESTS.find(q=>q.id===a.id);if(!q)return {ok:false,error:'없는 의뢰입니다.'};
      if(a.mode==='accept'){
        if(p.quests[q.id]||(!q.repeatable&&p.completed.includes(q.id)))return {ok:false,error:'이미 진행했거나 완료한 의뢰입니다.'};
        if(p.level<q.level||(q.requires&&!p.completed.includes(q.requires)))return {ok:false,error:'앞선 의뢰와 요구 레벨을 확인해 주세요.'};
        if(Object.keys(p.quests).length>=3)return {ok:false,error:'동시에 3개까지 진행할 수 있습니다.'};
        p.quests[q.id]={progress:q.objectives.map(()=>0)};this.mark(p);return {ok:true,message:'의뢰를 수락했습니다.'};
      }
      if(a.mode==='claim'){
        if(!this.questReady(p,q.id))return {ok:false,error:'아직 의뢰 목표를 달성하지 못했습니다.'};
        delete p.quests[q.id];if(!p.completed.includes(q.id))p.completed.push(q.id);
        p.gold+=q.gold;this.giveXP(p,q.xp);
        for(const [id,n]of Object.entries(q.items||{}))this.addItem(p,id,n);
        if(q.weaponTier)this.addItem(p,weaponFor(q.weaponTier,p.classId));
        if(q.title&&!p.titles.includes(q.title)){p.titles.push(q.title);p.title=q.title;}
        recordProgress(this,p,'quest',q.id);evaluateJobs(this,p);
        this.mark(p);this.send(p.id,'questComplete',{name:q.name,message:q.end,xp:q.xp,gold:q.gold,final:q.id==='last_star'});
        return {ok:true};
      }
    }
    if(a.type==='buy'||a.type==='sell'){
      if(!this.nearNpc(p,'shop'))return {ok:false,error:'여행 상인 모라 가까이에서 거래해 주세요.'};
      const n=Number(a.count??1),i=ITEMS[a.id];
      if(!i||!Number.isInteger(n)||n<1||n>99)return {ok:false,error:'수량을 확인해 주세요.'};
      if(a.type==='buy'){
        if(!SHOP.includes(a.id)||!i.buy)return {ok:false,error:'판매하지 않는 아이템입니다.'};
        const cost=i.buy*n;if(p.gold<cost)return {ok:false,error:'골드가 부족합니다.'};
        if((p.inventory[a.id]||0)+n>9999)return {ok:false,error:'최대 보유 수량을 초과합니다.'};
        p.gold-=cost;this.addItem(p,a.id,n);
      }else{
        if((p.inventory[a.id]||0)<n)return {ok:false,error:'보유 수량이 부족합니다.'};
        if(Object.values(p.equipment).includes(a.id))return {ok:false,error:'장착 중인 장비는 판매할 수 없습니다.'};
        if(p.enhancements[a.id])return {ok:false,error:'강화한 장비는 보호를 위해 판매가 제한됩니다.'};
        p.inventory[a.id]-=n;p.gold+=(i.sell||1)*n;
      }
      this.mark(p);return {ok:true,message:a.type==='buy'?'구매했습니다.':'판매했습니다.'};
    }
    if(a.type==='craft'){
      if(!this.nearNpc(p,'craft'))return {ok:false,error:'대장장이 브란 가까이에서 제작해 주세요.'};
      const r=RECIPES.find(r=>r.id===a.id);if(!r)return {ok:false,error:'없는 제작법입니다.'};
      if(p.level<r.level)return {ok:false,error:`레벨 ${r.level} 이상이 필요합니다.`};
      if(p.gold<r.gold||Object.entries(r.cost).some(([id,n])=>(p.inventory[id]||0)<n))return {ok:false,error:'재료 또는 골드가 부족합니다.'};
      p.gold-=r.gold;for(const [id,n]of Object.entries(r.cost))p.inventory[id]-=n;
      const out=r.output||weaponFor(r.weaponTier,p.classId);this.addItem(p,out,r.count);
      recordProgress(this,p,'craft',r.id);
      this.mark(p);this.send(p.id,'loot',{gold:0,xp:0,items:[{id:out,count:r.count}],boss:true,name:'제작 완료'});
      return {ok:true};
    }
    const vanityResult=this.vanityAction(p,a);if(vanityResult)return vanityResult;
    if(a.type==='title'){
      if(!p.titles.includes(a.title))return {ok:false,error:'아직 얻지 못한 칭호입니다.'};
      p.title=a.title;this.mark(p);return {ok:true};
    }
    if(a.type==='partyInvite'){
      const target=this.players.get(a.id);
      if(!target?.active||target.id===p.id||target.partyId)return {ok:false,error:'초대할 수 없는 모험가입니다.'};
      let party=this.parties.get(p.partyId);
      if(party&&party.leader!==p.id)return {ok:false,error:'파티장만 초대할 수 있습니다.'};
      if(party?.members.length>=4)return {ok:false,error:'파티는 최대 4명입니다.'};
      this.invites.set(target.id,{from:p.id,expires:this.now+30000});
      this.send(target.id,'partyInvite',{id:p.id,name:p.name,expires:this.now+30000});
      return {ok:true,message:`${target.name} 님에게 초대했습니다.`};
    }
    if(a.type==='partyAccept'){
      const inv=this.invites.get(p.id),leader=inv&&this.players.get(inv.from);
      if(!inv||inv.expires<this.now||!leader?.active||p.partyId)return {ok:false,error:'만료된 초대입니다.'};
      let party=this.parties.get(leader.partyId);
      if(!party){party={id:randomUUID(),leader:leader.id,members:[leader.id]};this.parties.set(party.id,party);leader.partyId=party.id;}
      if(party.leader!==leader.id)return {ok:false,error:'초대한 모험가가 더 이상 파티장이 아닙니다.'};
      if(party.members.length>=4)return {ok:false,error:'파티가 가득 찼습니다.'};
      party.members.push(p.id);p.partyId=party.id;this.invites.delete(p.id);
      for(const id of party.members)this.toast(this.players.get(id),`${p.name} 님이 파티에 합류했습니다.`,'success');
      return {ok:true};
    }
    if(a.type==='partyLeave'){
      this.leaveParty(p);return {ok:true};
    }
    return {ok:false,error:'처리할 수 없는 요청입니다.'};
  }
  vanityAction(p,a){
    const types=['cosmeticBuy','cosmeticEquip','studioTicketBuy','avatarApply','avatarClear','renameConfirmed'];
    if(!types.includes(a.type))return null;
    const inTown=p.zone==='town'&&this.now-p.lastCombat>=8000;
    // Cosmetic-only transactions do not affect combat stats. The workshop shortcut
    // works anywhere, unlike the physical NPC's normal item trade.
    if(a.type==='studioTicketBuy'){
      if(!['portrait_ticket','rename_ticket'].includes(a.id))return {ok:false,error:'공방 이용권만 구매할 수 있습니다.'};
      const ticket=ITEMS[a.id],amount=p.inventory[a.id]||0;
      if(amount>=99)return {ok:false,error:'이용권은 최대 99장까지 보관할 수 있습니다.'};
      if(p.gold<ticket.buy)return {ok:false,error:`골드가 부족합니다. ${ticket.buy-p.gold} G를 더 모아주세요.`};
      p.gold-=ticket.buy;this.addItem(p,a.id,1);this.mark(p);
      return {ok:true,message:`${ticket.name}을 구매했습니다.`,gold:p.gold,inventory:{[a.id]:p.inventory[a.id]}};
    }
    if(a.type==='cosmeticBuy'){
      if(typeof a.id!=='string'||!Object.hasOwn(COSMETICS,a.id))return {ok:false,error:'존재하지 않는 꾸미기 상품입니다.'};
      const item=COSMETICS[a.id];
      if(p.vanity.owned.includes(a.id))return {ok:false,error:'이미 보유한 아이템입니다.'};
      if(p.gold<item.price)return {ok:false,error:`골드가 부족합니다. ${item.price-p.gold} G를 더 모아주세요.`};
      p.gold-=item.price;p.vanity.owned.push(a.id);
      // Successful purchases immediately show up on the player and in remote snapshots.
      p.vanity.slots[item.slot]=a.id;this.mark(p);
      return {ok:true,message:`${item.name} ${item.price?'구매':'무료 수령'} · 즉시 장착 완료!`,gold:p.gold,owned:item.id,slot:item.slot};
    }
    if(a.type==='cosmeticEquip'){
      if(!COSMETIC_SLOTS.includes(a.slot))return {ok:false,error:'잘못된 장착 부위입니다.'};
      if(a.id!==null&&a.id!==''&&(!Object.hasOwn(COSMETICS,a.id)||COSMETICS[a.id].slot!==a.slot||!p.vanity.owned.includes(a.id)))
        return {ok:false,error:'해당 부위에 소유한 꾸미기 아이템만 장착할 수 있습니다.'};
      p.vanity.slots[a.slot]=a.id||null;this.mark(p);return {ok:true,message:'외형을 변경했습니다.',slot:a.slot,equipped:a.id||null};
    }
    if(a.type==='avatarApply'){
      if(!inTown)return {ok:false,error:'마을에서 전투를 마친 뒤 이미지 외형을 변경하세요.'};
      if(!validPortrait(a.pixels))return {ok:false,error:'24×32 도트 이미지 데이터가 올바르지 않습니다.'};
      if(!(p.inventory.portrait_ticket>0))return {ok:false,error:'초상화 변환권이 필요합니다. 모라의 상점에서 구매할 수 있습니다.'};
      p.inventory.portrait_ticket--;p.vanity.avatarPixels=a.pixels;this.mark(p);
      this.fx(p.zone,{type:'level',id:p.id,x:p.x,y:p.y});
      return {ok:true,message:'도트 캐릭터 외형을 적용했습니다. 다른 플레이어에게도 보입니다.'};
    }
    if(a.type==='avatarClear'){
      p.vanity.avatarPixels=null;this.mark(p);return {ok:true,message:'기본 직업 외형으로 되돌렸습니다. 사용한 변환권은 환급되지 않습니다.'};
    }
    if(a.type==='renameConfirmed'){
      // Only the authenticated websocket handler may supply this authorization.
      if(a.serverAuthorized!==true)return {ok:false,error:'서버 인증이 필요합니다.'};
      const name=String(a.name||'').trim().normalize('NFC');
      if(!/^[\p{L}\p{N} _-]{2,14}$/u.test(name))return {ok:false,error:'2~14글자의 닉네임을 사용하세요.'};
      if(!inTown)return {ok:false,error:'마을에서 전투 종료 8초 후 변경하세요.'};
      if(!(p.inventory.rename_ticket>0))return {ok:false,error:'닉네임 변경권이 없습니다.'};
      if(name.toLocaleLowerCase('ko')===p.name.toLocaleLowerCase('ko'))return {ok:false,error:'현재와 같은 이름입니다.'};
      p.inventory.rename_ticket--;p.name=name;this.mark(p);return {ok:true,message:`닉네임이 ${name}(으)로 변경되었습니다.`};
    }
    return null;
  }
  leaveParty(p){
    this.dungeons.beforePartyLeave(p);
    const party=this.parties.get(p.partyId);p.partyId=null;
    if(!party)return;
    party.members=party.members.filter(id=>id!==p.id);
    if(party.members.length<2){
      for(const id of party.members){const m=this.players.get(id);if(m)m.partyId=null;}
      this.parties.delete(party.id);
    }else if(party.leader===p.id)party.leader=party.members[0];
  }
  tick(dt,now=Date.now()){
    this.now=now;this.events.tick(now);dt=Math.min(Math.max(0,dt),.1);
    for(const [id,invite] of this.invites)if(invite.expires<now)this.invites.delete(id);
    const active=[...this.players.values()].filter(p=>p.active);
    for(const p of active){
      if(p.storyPendingSync&&now-(p.lastStorySync||0)>=800){p.storyPendingSync=false;p.lastStorySync=now;this.mark(p);}
      if(ensureDaily(p,now))this.mark(p);
      if(p.soul&&p.soul.expires<=now){p.soul=null;this.mark(p);}
      if(p.deathWeakUntil&&p.deathWeakUntil<=now){p.deathWeakUntil=0;this.mark(p);}
      if(p.hp<=0){
        if(p.respawnAt&&p.respawnAt<=now){
          const s=this.stats(p);p.hp=s.maxHp;p.mp=s.maxMp;p.respawnAt=0;this.teleport(p,'town',24*TILE+16,21*TILE+16);
        }
        continue;
      }
      if(this.dungeons.blocksInput(p)){p.input={x:0,y:0};p.path=[];p.vx=0;p.vy=0;p.moving=false;p.dashUntil=0;continue;}
      let v=now-p.lastInput<450?p.input:{x:0,y:0};
      if(p.path.length&&Math.hypot(v.x,v.y)<.1){
        let next=p.path[0],d=dist(p,next);
        if(d<7){p.path.shift();next=p.path[0];d=next?dist(p,next):0;}
        v=next&&d>0?{x:(next.x-p.x)/d,y:(next.y-p.y)/d}:{x:0,y:0};
      }
      let speed=this.stats(p).speed*(p.speedUntil>now?1.25:1);
      if(p.dashUntil>now){v=p.dashVector;speed*=3.6;}
      if(p.path.length&&Math.hypot(p.input.x,p.input.y)<.05&&p.dashUntil<=now)speed=Math.min(speed,dist(p,p.path[0])/Math.max(dt,.001));
      const oldX=p.x,oldY=p.y;
      moveEntity(this.worlds.get(p.zone).map,p,v.x*speed*dt,v.y*speed*dt,10);
      p.moving=Math.abs(p.x-oldX)+Math.abs(p.y-oldY)>.1;p.vx=dt>0?(p.x-oldX)/dt:0;p.vy=dt>0?(p.y-oldY)/dt:0;
      if(p.moving){
        p.dir=Math.abs(v.x)>Math.abs(v.y)?(v.x>0?'e':'w'):(v.y>0?'s':'n');
        p.dirty=true;recordStory(this,p,{kind:'walk',target:'any',count:Math.hypot(p.x-oldX,p.y-oldY)/TILE});
      }
      revealTerrain(this,p);
      if(now-p.lastRegen>=1000){
        p.lastRegen=now;const s=this.stats(p);
        const before=p.hp+p.mp;
        if(now-p.lastCombat>6000)p.hp=Math.min(s.maxHp,p.hp+(p.zone==='town'?s.maxHp*.08:2));
        p.mp=Math.min(s.maxMp,p.mp+s.manaRegen+(p.zone==='town'?4:0));
        p.playSeconds=(p.playSeconds||0)+1;
        if(before!==p.hp+p.mp)this.mark(p);
      }
    }
    this.challenges.tick(dt);
    this.dungeons.tick(dt);
    const zonePlayers=new Map();
    for(const p of active){if(!zonePlayers.has(p.zone))zonePlayers.set(p.zone,[]);if(p.hp>0)zonePlayers.get(p.zone).push(p);}
    this.perf={loadedRegions:this.worlds.size,occupiedRegions:zonePlayers.size,awakeMobs:0,sleepingMobs:0};
    for(const [zone,w]of this.worlds){
      const inZone=(zonePlayers.get(zone)||[]).filter(p=>p.hp>0&&p.zone===zone);
      this.encounters.tickWorld(w,inZone,dt);
      tickBossMechanics(this,w,now);
      if(!inZone.length){
        w.casts=[];
        this.encounters.resetWorld(w);
        if(w.fieldTrial)this.cancelFieldTrial(w);
        continue;
      }
      for(const m of w.mobs){
        if(m.challengeRun||m.dungeonRun)continue;
        const spec=MONSTERS[m.type];
        if(!m.alive){
          if(!m.worldKey&&m.respawnAt<=now){Object.assign(m,this.makeMob(m.id,m.type,m.homeX,m.homeY));}
          continue;
        }
        m.moving=false;
        // Server-authoritative interest management: keep nearby encounters alive,
        // but do not run distant wandering, LOS, targeting and spell calculations.
        if(!m.target&&!m.dots?.length&&!m.trialKey&&!inZone.some(p=>dist(p,m)<1120)){
          this.perf.sleepingMobs++;continue;
        }
        this.perf.awakeMobs++;
        if(spec.boss){
          const phase=Math.max(0,(m.encounterPhase||1)-1);
          if(phase>(m.visualPhase||0))this.fx(zone,{type:'armorBreak',x:m.x,y:m.y,theme:bossVisual(m.type).theme,phase});
          m.visualPhase=phase;
        }
        for(const effect of m.dots||[]){
          if(effect.left<=0||effect.next>now)continue;
          const owner=this.players.get(effect.by);effect.left--;effect.next=now+1000;
          if(!owner?.active||owner.zone!==zone||owner.hp<=0||!this.canSeeEntity(owner,m)||!this.canDamage(owner,m))continue;
          const dealt=Math.min(m.hp,fieldTrialDamageAmount(w,m,this.encounters.damageAmount(m,Math.max(1,Math.round(effect.damage*bossDamageMultiplier(m))))));m.hp-=dealt;m.contributors.set(owner.id,now);m.damageLog.set(owner.id,(m.damageLog.get(owner.id)||0)+dealt);
          this.fx(zone,{type:'hit',id:m.id,x:m.x,y:m.y-22,amount:dealt,kind:'monster',by:owner.id});
          if(m.hp<=0){this.killMob(zone,m);break;}
        }
        m.dots=(m.dots||[]).filter(e=>e.left>0);
        if(!m.alive||m.stunUntil>now)continue;
        if(m.mechanicObjective||m.bossMechanic?.active)continue;
        if(this.encounters.tickMob(w,m,inZone,dt))continue;
        if(!inZone.length){m.target=null;continue;}
        let target=inZone.find(p=>p.id===m.target&&dist(p,m)<440);
        if(target&&Math.hypot(m.x-m.homeX,m.y-m.homeY)>440)target=null;
        if(!target)target=inZone.filter(p=>dist(p,m)<spec.aggro&&lineOfSight(w.map,m,p)).sort((a,b)=>dist(a,m)-dist(b,m))[0];
        if(target&&Math.hypot(m.x-m.homeX,m.y-m.homeY)>480)target=null;
        m.target=target?.id||null;
        if(target){
          const d=dist(m,target),dx=target.x-m.x,dy=target.y-m.y;
          m.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'e':'w'):(dy>0?'s':'n');
          if(m.castUntil>now)continue;
          if(spec.boss&&m.nextAttack<=now&&d<300){
            this.bossCast(w,m,target);continue;
          }
          if(!spec.boss&&d<spec.range+10&&m.nextAttack<=now&&lineOfSight(w.map,m,target)){
            m.nextAttack=now+1700;m.castUntil=now+430;
            const ranged=spec.range>80;
            w.casts.push({id:++this.castSeq,owner:m.id,shape:'circle',x:target.x,y:target.y,radius:ranged?45:39,inner:0,
              starts:now,ends:now+(ranged?700:430),damage:spec.atk*(m.attackScale||1),boss:false,name:spec.name});
          }else if(d>spec.range*.8&&m.castUntil<=now){
            const speed=spec.speed*(m.slowUntil>now? .5:1),ox=m.x,oy=m.y;
            if(d>0)moveEntity(w.map,m,dx/d*speed*dt,dy/d*speed*dt,12);
            m.moving=dist(m,{x:ox,y:oy})>.05;
          }
        }else{
          if(dist(m,{x:m.homeX,y:m.homeY})>75){
            const d=Math.hypot(m.homeX-m.x,m.homeY-m.y);moveEntity(w.map,m,(m.homeX-m.x)/d*spec.speed*dt,(m.homeY-m.y)/d*spec.speed*dt,12);m.moving=true;
            m.hp=Math.min(m.maxHp,m.hp+dt*m.maxHp*.05);
          }else if(!spec.boss){
            if(m.wanderAt<now){const a=this.random()*Math.PI*2;m.walkDir=this.random()>.45?{x:Math.cos(a),y:Math.sin(a)}:{x:0,y:0};m.wanderAt=now+2200+this.random()*2000;}
            moveEntity(w.map,m,m.walkDir.x*spec.speed*.22*dt,m.walkDir.y*spec.speed*.22*dt,12);m.moving=Math.hypot(m.walkDir.x,m.walkDir.y)>.1;
          }
        }
      }
      const done=w.casts.filter(c=>c.ends<=now);
      for(const cast of done){
        if(cast.challengeRun||cast.dungeonRun)continue;
        const owner=w.mobs.find(m=>m.id===cast.owner);
        if(!owner?.alive)continue;
        if(this.encounters.resolveCast(w,cast,inZone))continue;
        for(const p of inZone){
          const dx=p.x-cast.x,dy=p.y-cast.y,d=Math.hypot(dx,dy);
          let hit=cast.shape==='ring'?(d<=cast.radius+8&&d>=cast.inner-8):d<=cast.radius+8;
          if(cast.shape==='beam'){
            const along=dx*Math.cos(cast.angle)+dy*Math.sin(cast.angle),across=-dx*Math.sin(cast.angle)+dy*Math.cos(cast.angle);
            hit=along>=-10&&along<=cast.length&&Math.abs(across)<cast.width/2+8;
          }
          if(hit)this.damagePlayer(p,cast.damage);
        }
        this.fx(zone,{type:'impact',castId:cast.id,owner:cast.owner,x:cast.x,y:cast.y,radius:cast.radius,shape:cast.shape,inner:cast.inner,angle:cast.angle,length:cast.length,width:cast.width,boss:cast.boss,theme:cast.theme,monster:cast.monster});
      }
      w.casts=w.casts.filter(c=>c.ends>now);
      this.tickFieldTrial(w);
    }
    this.worlds.sweep(now,new Set(active.map(p=>p.zone)));
  }
  tickFieldTrial(w){tickFieldTrial(this,w);}
  cancelFieldTrial(w){cancelFieldTrial(this,w);}
  bossCast(w,m,target){
    if(this.encounters.startBoss(w,m,target))return;
    const spec=MONSTERS[m.type],phase=m.phase++%3;
    const enraged=m.hp<m.maxHp*.45;
    const duration=enraged?1000:1350;
    m.nextAttack=this.now+(enraged?2700:3400);m.castUntil=this.now+duration;
    const base={owner:m.id,starts:this.now,ends:this.now+duration,damage:spec.atk*(m.attackScale||1)*(enraged?1.15:1),boss:true,theme:bossVisual(m.type).theme,monster:m.type};
    if(spec.worldBoss){
      const pattern=spec.pattern,angle=Math.atan2(target.y-m.y,target.x-m.x);
      if(pattern==='tempest'){
        if(phase===1)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:280,inner:110,name:'폭풍의 눈'});
        else for(let i=0;i<3;i++)w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x+(i-1)*100,y:target.y+(i%2)*65,radius:75,inner:0,name:'연쇄 낙뢰'});
      }else if(pattern==='leviathan'){
        if(phase===2)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:300,inner:145,name:'밀려오는 만조'});
        else for(let i=0;i<2;i++)w.casts.push({...base,id:++this.castSeq,shape:'beam',x:m.x-200*Math.cos(angle+i*Math.PI/2),y:m.y-200*Math.sin(angle+i*Math.PI/2),angle:angle+i*Math.PI/2,length:420,width:75,radius:300,name:'교차 해류'});
      }else if(pattern==='glacier'){
        if(phase===0)w.casts.push({...base,id:++this.castSeq,shape:'beam',x:m.x,y:m.y,angle,length:440,width:95,radius:440,name:'빙하의 창'});
        else for(let i=0;i<4;i++)w.casts.push({...base,id:++this.castSeq,ends:base.ends+i*220,shape:'circle',x:target.x+Math.cos(i*Math.PI/2)*95,y:target.y+Math.sin(i*Math.PI/2)*95,radius:78,inner:0,name:'순차 빙결'});
      }else{
        if(phase===1)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:300,inner:120,name:'공허의 경계'});
        else for(let i=0;i<(enraged?6:4);i++)w.casts.push({...base,id:++this.castSeq,ends:base.ends+i*140,shape:'circle',x:target.x+Math.cos(i*Math.PI/3)*110,y:target.y+Math.sin(i*Math.PI/3)*110,radius:72,inner:0,name:'잠식하는 별'});
      }
    }else if(m.type==='moss_guardian'||spec.pattern==='root'){
      if(phase===1)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:210,inner:85,name:'뿌리의 파동'});
      else w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x,y:target.y,radius:105,inner:0,name:'대지 강타'});
    }else if(m.type==='moon_witch'||spec.pattern==='moon'){
      if(phase===2)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:260,inner:110,name:'월식'});
      else for(let i=0;i<3;i++)w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x+(i-1)*95,y:target.y+Math.sin(i*2)*75,radius:75,inner:0,name:'달빛의 낙인'});
    }else{
      if(phase===0)w.casts.push({...base,id:++this.castSeq,shape:'beam',x:m.x,y:m.y,radius:350,angle:Math.atan2(target.y-m.y,target.x-m.x),length:400,width:100,name:'별을 태우는 숨결'});
      else if(phase===1)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:290,inner:110,name:'검은 별의 고리'});
      else for(let i=0;i<4;i++){const a=i*Math.PI/2;w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x+Math.cos(a)*70,y:target.y+Math.sin(a)*70,radius:70,inner:0,name:'떨어지는 별'});}
    }
  }
}
