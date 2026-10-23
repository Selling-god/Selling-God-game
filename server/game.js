import { randomUUID } from 'node:crypto';
import { CLASSES, ITEMS, MONSTERS, QUESTS, ZONES, NPCS, RECIPES, SHOP, TILE, MAX_LEVEL, xpRequired, getStats, weaponFor } from '../shared/content.js';
import { createMap, seeded, spawnPoint, moveEntity, isBlocked, lineOfSight, findPath, clamp, dist, BOSS_SPAWNS } from '../shared/world.js';

export function newCharacter(id,name,classId){
  const c=CLASSES[classId];if(!c)throw new Error('직업을 선택해 주세요.');
  const p={
    id,name,classId,level:1,xp:0,gold:100,zone:'town',x:24*TILE+16,y:21*TILE+16,
    hp:0,mp:0,inventory:{[c.weapon]:1,tunic:1,potion:8,mana:5},
    equipment:{weapon:c.weapon,armor:'tunic',charm:null},enhancements:{},
    quests:{},completed:[],opened:[],kills:0,bossKills:0,gathered:0,playSeconds:0,
    title:'별빛을 따라온 자',titles:['별빛을 따라온 자'],revision:1,createdAt:Date.now()
  };
  const s=getStats(p);p.hp=s.maxHp;p.mp=s.maxMp;return p;
}
export function hydrate(state){
  const p={...state};
  p.inventory={...p.inventory};p.equipment={...p.equipment};p.enhancements={...p.enhancements};
  p.quests=structuredClone(p.quests||{});p.completed=[...(p.completed||[])];p.opened=[...(p.opened||[])];
  p.titles=[...(p.titles||['별빛을 따라온 자'])];p.level=clamp(p.level||1,1,MAX_LEVEL);
  if(!ZONES[p.zone])p.zone='town';
  if(!(p.hp>0)){p.zone='town';p.x=24*TILE+16;p.y=21*TILE+16;}
  const map=createMap(p.zone);
  if(isBlocked(map,p.x,p.y)){p.x=ZONES[p.zone].spawn[0]*TILE+16;p.y=ZONES[p.zone].spawn[1]*TILE+16;}
  const s=getStats(p);p.hp=clamp(p.hp||s.maxHp,1,s.maxHp);p.mp=clamp(p.mp??s.maxMp,0,s.maxMp);
  Object.assign(p,{active:true,input:{x:0,y:0},lastInput:0,dir:'s',moving:false,cooldowns:{},path:[],
    target:null,dirty:true,lastCombat:0,lastRegen:0,lastSecond:0,invulnerableUntil:0,shieldUntil:0,
    dashUntil:0,speedUntil:0,attackUntil:0,respawnAt:0,partyId:null,actions:new Map(),lastTalk:0,lastInteract:0});
  return p;
}
export function serialize(p){
  const keys=['id','name','classId','level','xp','gold','zone','x','y','hp','mp','inventory','equipment','enhancements','quests','completed','opened','kills','bossKills','gathered','playSeconds','title','titles','revision','createdAt'];
  return structuredClone(Object.fromEntries(keys.map(k=>[k,p[k]])));
}
export class Game {
  constructor({send=()=>{},broadcast=()=>{},save=()=>{},random=Math.random}={}){
    this.players=new Map();this.worlds=new Map();this.parties=new Map();this.invites=new Map();
    this.send=send;this.broadcast=broadcast;this.save=save;this.random=random;this.now=Date.now();this.castSeq=0;
    for(const id of Object.keys(ZONES)){
      const map=createMap(id),world={id,map,mobs:[],nodes:map.resources.map(x=>({...x,readyAt:0})),casts:[]};
      if(id!=='town'){
        const rand=seeded({forest:551,ruins:989,citadel:1411}[id]);
        const types=id==='forest'?['slime','slime','beetle','wolf']:id==='ruins'?['skeleton','skeleton','wisp','golem']:['imp','ash_knight','ash_knight'];
        const count=id==='forest'?34:id==='ruins'?28:24;
        for(let i=0;i<count;i++){
          const pt=spawnPoint(map,rand);
          const type=types[i%types.length];world.mobs.push(this.makeMob(`${id}_m${i}`,type,pt.x,pt.y));
        }
        // A handful of gentle first encounters beside the entrance path.
        if(id==='forest')for(let i=0;i<5;i++){
          const x=(i%2?27:33)*TILE+16,y=(37-Math.floor(i/2)*3)*TILE+16;
          if(!isBlocked(map,x,y,14))world.mobs.push(this.makeMob(`forest_intro${i}`,'slime',x,y));
        }
        const b=BOSS_SPAWNS[id];world.mobs.push(this.makeMob(`${id}_boss`,b.type,b.x,b.y));
      }
      this.worlds.set(id,world);
    }
  }
  makeMob(id,type,x,y){
    const m=MONSTERS[type];
    return {id,type,x,y,homeX:x,homeY:y,hp:m.hp,maxHp:m.hp,dir:'s',moving:false,
      alive:true,respawnAt:0,target:null,nextAttack:0,castUntil:0,slowUntil:0,
      contributors:new Map(),wanderAt:0,walkDir:{x:0,y:0},phase:0};
  }
  addPlayer(state){
    const p=hydrate(state);this.players.set(p.id,p);return p;
  }
  mark(p){p.revision=(p.revision||0)+1;p.dirty=true;}
  toast(p,message,tone='info'){this.send(p.id,'notice',{message,tone});}
  fx(zone,data){this.broadcast(zone,'fx',{...data,t:this.now});}
  stats(p){return getStats(p);}
  publicPlayer(p){
    const s=this.stats(p);
    return {id:p.id,name:p.name,classId:p.classId,level:p.level,x:Math.round(p.x),y:Math.round(p.y),dir:p.dir,
      moving:p.moving,hp:Math.round(p.hp),maxHp:s.maxHp,title:p.title,
      attacking:p.attackUntil>this.now,shield:p.shieldUntil>this.now,dashing:p.dashUntil>this.now,
      dead:p.hp<=0,weapon:p.equipment.weapon,partyId:p.partyId};
  }
  privatePlayer(p){
    return {...serialize(p),stats:this.stats(p),cooldowns:{...p.cooldowns},target:p.target,partyId:p.partyId,
      shieldUntil:p.shieldUntil,respawnAt:p.respawnAt,lastCombat:p.lastCombat};
  }
  snapshot(p,full=false){
    const w=this.worlds.get(p.zone),near=800;
    return {
      t:this.now,zone:p.zone,self:{...this.publicPlayer(p),mp:Math.round(p.mp),maxMp:this.stats(p).maxMp,
        cooldowns:p.cooldowns,target:p.target,revision:p.revision,respawnAt:p.respawnAt},
      players:[...this.players.values()].filter(x=>x.active&&x.id!==p.id&&x.zone===p.zone&&dist(x,p)<near+200).map(x=>this.publicPlayer(x)),
      mobs:w.mobs.filter(m=>m.alive&&dist(m,p)<near).map(m=>({id:m.id,type:m.type,x:Math.round(m.x),y:Math.round(m.y),hp:m.hp,maxHp:m.maxHp,dir:m.dir,moving:m.moving,casting:m.castUntil>this.now,slow:m.slowUntil>this.now})),
      nodes:w.nodes.filter(n=>dist(n,p)<near).map(n=>({...n,ready:n.readyAt<=this.now})),
      casts:w.casts.filter(c=>c.ends>this.now&&dist(c,p)<near+350).map(({damage,owner,...c})=>c),
      bosses:w.mobs.filter(m=>MONSTERS[m.type].boss).map(m=>({id:m.id,type:m.type,hp:m.hp,maxHp:m.maxHp,alive:m.alive,respawnAt:m.respawnAt})),
      online:[...this.players.values()].filter(x=>x.active).length,
      zoneOnline:[...this.players.values()].filter(x=>x.active&&x.zone===p.zone).length,
      party:this.partyView(p),profile:full?this.privatePlayer(p):undefined
    };
  }
  partyView(p){
    const party=this.parties.get(p.partyId);if(!party)return null;
    return {id:party.id,leader:party.leader,members:party.members.map(id=>this.players.get(id)).filter(Boolean).map(m=>({id:m.id,name:m.name,classId:m.classId,level:m.level,zone:m.zone,hp:Math.round(m.hp),maxHp:this.stats(m).maxHp,online:m.active}))};
  }
  setInput(p,v){
    if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return;
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
      this.toast(p,`레벨 ${p.level}! 체력과 마나가 회복되었습니다.`,'success');
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
    const chosen=w.mobs.find(m=>m.id===p.target&&m.alive&&dist(m,p)<=range+(MONSTERS[m.type].radius||14));
    if(chosen&&lineOfSight(w.map,p,chosen))return chosen;
    return w.mobs.filter(m=>m.alive&&dist(m,p)<=range+(MONSTERS[m.type].radius||14)&&lineOfSight(w.map,p,m)).sort((a,b)=>dist(a,p)-dist(b,p))[0];
  }
  attack(p,skillId){
    const c=CLASSES[p.classId],skill=c.skills.find(x=>x.id===skillId);
    if(!skill)return {ok:false,error:'없는 기술입니다.'};
    if(p.level<skill.unlock)return {ok:false,error:`레벨 ${skill.unlock}에 배울 수 있습니다.`};
    if((p.cooldowns[skillId]||0)>this.now)return {ok:false,quiet:true};
    if(p.mp<skill.mp)return {ok:false,error:'마나가 부족합니다. 2번 물약을 사용해 보세요.'};
    if(skill.power===0){
      p.mp-=skill.mp;p.cooldowns[skillId]=this.now+skill.cd;
      if(skill.shield)p.shieldUntil=this.now+5000;
      if(skill.heal)p.hp=Math.min(this.stats(p).maxHp,p.hp+this.stats(p).maxHp*skill.heal);
      if(p.classId==='ranger')p.speedUntil=this.now+4500;
      this.fx(p.zone,{type:'buff',id:p.id,x:p.x,y:p.y,color:c.color});this.mark(p);return {ok:true};
    }
    const target=this.getTarget(p,skill.range);
    if(!target)return {ok:false,quiet:skillId==='basic',error:'공격할 적에게 조금 더 가까이 다가가세요.'};
    const w=this.worlds.get(p.zone);
    p.target=target.id;p.mp-=skill.mp;p.cooldowns[skillId]=this.now+skill.cd;
    p.attackUntil=this.now+300;p.lastCombat=this.now;
    const dx=target.x-p.x,dy=target.y-p.y;
    p.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'e':'w'):(dy>0?'s':'n');
    const center=p.classId==='guardian'?p:target;
    const victims=skill.radius?w.mobs.filter(m=>m.alive&&dist(m,center)<=skill.radius&&lineOfSight(w.map,p,m)):[target];
    this.fx(p.zone,{type:'attack',id:p.id,classId:p.classId,skill:skillId,x:p.x,y:p.y,tx:target.x,ty:target.y,radius:skill.radius,color:c.color});
    for(const m of victims){
      const crit=this.random()*100<this.stats(p).crit;
      const damage=Math.max(1,Math.round((this.stats(p).atk*skill.power-MONSTERS[m.type].def*.65)*(0.92+this.random()*.16)*(crit?1.65:1)));
      m.hp=Math.max(0,m.hp-damage);m.contributors.set(p.id,this.now);m.target=p.id;
      if(skillId==='ultimate'||(p.classId==='mage'&&skillId==='skill1'))m.slowUntil=this.now+2500;
      this.fx(p.zone,{type:'hit',id:m.id,x:m.x,y:m.y-22,amount:damage,crit,kind:'monster',by:p.id});
      if(m.hp<=0)this.killMob(p.zone,m);
    }
    this.mark(p);return {ok:true};
  }
  killMob(zone,m){
    if(!m.alive)return;
    const spec=MONSTERS[m.type];m.alive=false;m.hp=0;m.respawnAt=this.now+(spec.boss?120000:18000+this.random()*10000);
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
      const p=this.players.get(id),gold=Math.floor(spec.gold[0]+this.random()*(spec.gold[1]-spec.gold[0]+1));
      p.gold+=gold;p.kills++;if(spec.boss)p.bossKills++;
      this.giveXP(p,spec.xp*(p.partyId?1.1:1));
      this.progress(p,'kill',m.type);this.addItem(p,spec.material,1);
      if(this.random()<.12)this.addItem(p,'potion',1);
      const drops=[{id:spec.material,count:1}];
      if(spec.boss){
        const reward=m.type==='moss_guardian'?'moss_charm':m.type==='moon_witch'?'moon_robe':'dawn_charm';
        this.addItem(p,reward);drops.push({id:reward,count:1});
        if(!p.titles.includes('수호자의 벗'))p.titles.push('수호자의 벗');
      }else if(this.random()<.065){
        const reward=spec.level>=9?weaponFor('star',p.classId):spec.level>=5?'leather':(this.random()>.5?'ore':'potion');
        this.addItem(p,reward);drops.push({id:reward,count:1});
      }
      this.send(p.id,'loot',{gold,xp:Math.round(spec.xp*(p.partyId?1.1:1)),items:drops,boss:!!spec.boss,name:spec.name});
      this.mark(p);
    }
    this.fx(zone,{type:'death',id:m.id,monster:m.type,x:m.x,y:m.y,boss:!!spec.boss});
    if(spec.boss)this.broadcast(null,'system',{message:`${spec.name}의 속박이 풀렸습니다. 참여한 모험가 모두에게 전리품이 지급되었습니다.`});
    m.contributors.clear();
  }
  damagePlayer(p,amount){
    if(p.hp<=0||p.invulnerableUntil>this.now)return;
    let damage=Math.max(1,Math.round(amount-this.stats(p).def*.65));
    if(p.shieldUntil>this.now)damage=Math.max(1,Math.round(damage*.45));
    p.hp=Math.max(0,p.hp-damage);p.lastCombat=this.now;
    this.fx(p.zone,{type:'hit',id:p.id,x:p.x,y:p.y-25,amount:damage,kind:'player'});
    if(p.hp<=0){
      p.path=[];p.input={x:0,y:0};p.respawnAt=this.now+3500;
      this.toast(p,'별빛이 당신을 마을로 데려갑니다. 아이템과 골드는 잃지 않습니다.','warn');
    }
    this.mark(p);
  }
  teleport(p,zone,x,y){
    p.zone=zone;p.x=x;p.y=y;p.path=[];p.input={x:0,y:0};p.target=null;
    p.invulnerableUntil=this.now+2200;this.mark(p);
    this.send(p.id,'zone',{zone,profile:this.privatePlayer(p)});
  }
  interact(p,id){
    if(this.now-p.lastInteract<450)return {ok:false,quiet:true};
    const w=this.worlds.get(p.zone);
    let options=[
      ...w.map.npcs.map(n=>({...n,entity:'npc'})),
      ...w.map.portals.map(n=>({...n,entity:'portal'})),
      ...w.nodes.filter(n=>n.readyAt<=this.now).map(n=>({...n,entity:'node'})),
      ...w.map.chests.filter(n=>!p.opened.includes(n.id)).map(n=>({...n,entity:'chest'}))
    ].filter(n=>dist(p,n)<95&&(!id||n.id===id)).sort((a,b)=>dist(p,a)-dist(p,b));
    const obj=options[0];if(!obj)return {ok:false,error:'가까이 다가가서 F를 눌러주세요.'};
    p.lastInteract=this.now;
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
      this.addItem(p,node.type,1);p.gathered++;this.progress(p,'gather',node.type);this.giveXP(p,8);
      this.mark(p);this.fx(p.zone,{type:'gather',id:p.id,x:node.x,y:node.y,color:'#9cdeaa'});
      this.send(p.id,'loot',{gold:0,xp:8,items:[{id:node.type,count:1}]});return {ok:true};
    }
    if(obj.entity==='chest'){
      p.opened.push(obj.id);const gold=40+ZONES[p.zone].minLevel*12;p.gold+=gold;
      this.addItem(p,'potion',2);this.addItem(p,'ore',2);this.giveXP(p,40);
      this.mark(p);this.send(p.id,'loot',{gold,xp:40,items:[{id:'potion',count:2},{id:'ore',count:2}],boss:true,name:'잊힌 여행자의 보물'});
      return {ok:true};
    }
  }
  action(p,a){
    if(!a||typeof a.type!=='string')return {ok:false,error:'잘못된 요청입니다.'};
    if(p.hp<=0&&a.type!=='respawn')return {ok:false,quiet:true};
    if(a.type==='attack')return this.attack(p,a.skill||'basic');
    if(a.type==='target'){
      if(typeof a.id!=='string')return {ok:false,quiet:true};
      const m=this.worlds.get(p.zone).mobs.find(m=>m.id===a.id&&m.alive&&dist(m,p)<750);
      if(m)p.target=m.id;return {ok:!!m};
    }
    if(a.type==='move'){
      if(!Number.isFinite(a.x)||!Number.isFinite(a.y))return {ok:false,quiet:true};
      if((p.nextPath||0)>this.now)return {ok:false,quiet:true};
      p.nextPath=this.now+160;
      p.path=findPath(this.worlds.get(p.zone).map,p,{x:a.x,y:a.y});p.input={x:0,y:0};return {ok:true};
    }
    if(a.type==='dash'){
      if((p.cooldowns.dash||0)>this.now)return {ok:false,quiet:true};
      p.cooldowns.dash=this.now+4000;p.dashUntil=this.now+190;p.invulnerableUntil=this.now+280;
      let v=p.input;
      if(Math.hypot(v.x,v.y)<.1)v={s:{x:0,y:1},n:{x:0,y:-1},e:{x:1,y:0},w:{x:-1,y:0}}[p.dir];
      p.dashVector={...v};this.fx(p.zone,{type:'dash',id:p.id,x:p.x,y:p.y,color:CLASSES[p.classId].color});return {ok:true};
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
      if(isHp)p.hp=Math.min(s.maxHp,p.hp+s.maxHp*.45);else p.mp=Math.min(s.maxMp,p.mp+s.maxMp*.5);
      this.mark(p);this.fx(p.zone,{type:'buff',id:p.id,x:p.x,y:p.y,color:isHp?'#dd998e':'#8fbcf0'});return {ok:true};
    }
    if(a.type==='equip'){
      const i=ITEMS[a.id];
      if(!i||i.type!=='gear'||!(p.inventory[a.id]>0))return {ok:false,error:'보유한 장비만 장착할 수 있습니다.'};
      if(i.class&&i.class!==p.classId)return {ok:false,error:'다른 직업의 무기입니다.'};
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
      this.mark(p);this.send(p.id,'loot',{gold:0,xp:0,items:[{id:out,count:r.count}],boss:true,name:'제작 완료'});
      return {ok:true};
    }
    if(a.type==='enhance'){
      if(!this.nearNpc(p,'craft'))return {ok:false,error:'대장장이 브란 가까이에서 강화해 주세요.'};
      const i=ITEMS[a.id],lv=p.enhancements[a.id]||0;
      if(!i||i.type!=='gear'||!(p.inventory[a.id]>0))return {ok:false,error:'보유한 장비를 선택해 주세요.'};
      if(lv>=3)return {ok:false,error:'이 장비는 최대 강화 상태입니다.'};
      const gold=60*(lv+1),ore=lv+2;
      if(p.gold<gold||(p.inventory.ore||0)<ore)return {ok:false,error:'강화 재료가 부족합니다.'};
      p.gold-=gold;p.inventory.ore-=ore;p.enhancements[a.id]=lv+1;this.mark(p);
      return {ok:true,message:`${i.name} +${lv+1} · 강화 성공`};
    }
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
  leaveParty(p){
    const party=this.parties.get(p.partyId);p.partyId=null;
    if(!party)return;
    party.members=party.members.filter(id=>id!==p.id);
    if(party.members.length<2){
      for(const id of party.members){const m=this.players.get(id);if(m)m.partyId=null;}
      this.parties.delete(party.id);
    }else if(party.leader===p.id)party.leader=party.members[0];
  }
  tick(dt,now=Date.now()){
    this.now=now;dt=Math.min(Math.max(0,dt),.1);
    for(const [id,invite] of this.invites)if(invite.expires<now)this.invites.delete(id);
    const active=[...this.players.values()].filter(p=>p.active);
    for(const p of active){
      if(p.hp<=0){
        if(p.respawnAt&&p.respawnAt<=now){
          const s=this.stats(p);p.hp=s.maxHp;p.mp=s.maxMp;p.respawnAt=0;this.teleport(p,'town',24*TILE+16,21*TILE+16);
        }
        continue;
      }
      let v=now-p.lastInput<320?p.input:{x:0,y:0};
      if(p.path.length&&Math.hypot(v.x,v.y)<.1){
        let next=p.path[0],d=dist(p,next);
        if(d<7){p.path.shift();next=p.path[0];d=next?dist(p,next):0;}
        v=next&&d>0?{x:(next.x-p.x)/d,y:(next.y-p.y)/d}:{x:0,y:0};
      }
      let speed=this.stats(p).speed*(p.speedUntil>now?1.25:1);
      if(p.dashUntil>now){v=p.dashVector;speed*=3.6;}
      const oldX=p.x,oldY=p.y;
      moveEntity(this.worlds.get(p.zone).map,p,v.x*speed*dt,v.y*speed*dt,10);
      p.moving=Math.abs(p.x-oldX)+Math.abs(p.y-oldY)>.1;
      if(p.moving){
        p.dir=Math.abs(v.x)>Math.abs(v.y)?(v.x>0?'e':'w'):(v.y>0?'s':'n');
        p.dirty=true;
      }
      if(now-p.lastRegen>=1000){
        p.lastRegen=now;const s=this.stats(p);
        const before=p.hp+p.mp;
        if(now-p.lastCombat>6000)p.hp=Math.min(s.maxHp,p.hp+(p.zone==='town'?s.maxHp*.08:2));
        p.mp=Math.min(s.maxMp,p.mp+3+(p.zone==='town'?4:0));
        p.playSeconds=(p.playSeconds||0)+1;
        if(before!==p.hp+p.mp)this.mark(p);
      }
    }
    for(const [zone,w]of this.worlds){
      const inZone=active.filter(p=>p.zone===zone&&p.hp>0);
      for(const m of w.mobs){
        const spec=MONSTERS[m.type];
        if(!m.alive){
          if(m.respawnAt<=now){Object.assign(m,this.makeMob(m.id,m.type,m.homeX,m.homeY));}
          continue;
        }
        m.moving=false;
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
              starts:now,ends:now+(ranged?700:430),damage:spec.atk,boss:false,name:spec.name});
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
        const owner=w.mobs.find(m=>m.id===cast.owner);
        if(!owner?.alive)continue;
        for(const p of inZone){
          const dx=p.x-cast.x,dy=p.y-cast.y,d=Math.hypot(dx,dy);
          let hit=cast.shape==='ring'?(d<=cast.radius+8&&d>=cast.inner-8):d<=cast.radius+8;
          if(cast.shape==='beam'){
            const along=dx*Math.cos(cast.angle)+dy*Math.sin(cast.angle),across=-dx*Math.sin(cast.angle)+dy*Math.cos(cast.angle);
            hit=along>=-10&&along<=cast.length&&Math.abs(across)<cast.width/2+8;
          }
          if(hit)this.damagePlayer(p,cast.damage);
        }
        this.fx(zone,{type:'impact',x:cast.x,y:cast.y,radius:cast.radius,shape:cast.shape,inner:cast.inner,angle:cast.angle,length:cast.length,width:cast.width,boss:cast.boss});
      }
      w.casts=w.casts.filter(c=>c.ends>now);
    }
  }
  bossCast(w,m,target){
    const spec=MONSTERS[m.type],phase=m.phase++%3;
    const enraged=m.hp<m.maxHp*.45;
    const duration=enraged?1000:1350;
    m.nextAttack=this.now+(enraged?2700:3400);m.castUntil=this.now+duration;
    const base={owner:m.id,starts:this.now,ends:this.now+duration,damage:spec.atk*(enraged?1.15:1),boss:true};
    if(m.type==='moss_guardian'){
      if(phase===1)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:210,inner:85,name:'뿌리의 파동'});
      else w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x,y:target.y,radius:105,inner:0,name:'대지 강타'});
    }else if(m.type==='moon_witch'){
      if(phase===2)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:260,inner:110,name:'월식'});
      else for(let i=0;i<3;i++)w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x+(i-1)*95,y:target.y+Math.sin(i*2)*75,radius:75,inner:0,name:'달빛의 낙인'});
    }else{
      if(phase===0)w.casts.push({...base,id:++this.castSeq,shape:'beam',x:m.x,y:m.y,radius:350,angle:Math.atan2(target.y-m.y,target.x-m.x),length:400,width:100,name:'별을 태우는 숨결'});
      else if(phase===1)w.casts.push({...base,id:++this.castSeq,shape:'ring',x:m.x,y:m.y,radius:290,inner:110,name:'검은 별의 고리'});
      else for(let i=0;i<4;i++){const a=i*Math.PI/2;w.casts.push({...base,id:++this.castSeq,shape:'circle',x:target.x+Math.cos(a)*70,y:target.y+Math.sin(a)*70,radius:70,inner:0,name:'떨어지는 별'});}
    }
  }
}
