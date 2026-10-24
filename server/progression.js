import {storyBook,recordStory} from './stories.js';
import {recordAtlas} from './atlas.js';
import {CLASSES,ITEMS,ZONES,getStats} from '../shared/content.js';
import {JOB_HINTS,JOB_TIERS,RELICS,DAILY_TASKS,ACHIEVEMENTS} from '../shared/expansion.js';

export const dayKey=(now)=>new Date(now+9*3600000).toISOString().slice(0,10);
const req=(metric,goal,label)=>({metric,goal,label});
const level=n=>req('level',n,'레벨'),kills=n=>req('kills',n,'몬스터 처치'),job=id=>req('job:'+id,1,CLASSES[id].name+' 해금'),master=(id,n)=>req('master:'+id,n,CLASSES[id].name+' 숙련'),
 relic=id=>req('relic:'+id,1,RELICS.find(r=>r.id===id).name+' 발견'),visit=id=>req('visit:'+id,1,ZONES[id].name+' 방문'),boss=n=>req('bosses',n,'보스 처치 참여');
export const JOB_REQUIREMENTS={
 guardian:[level(2),kills(5)],ranger:[level(2),kills(8)],mage:[level(2),visit('forest'),kills(3)],
 rogue:[level(2),req('chests',1,'보물 상자 발견')],priest:[level(2),req('gather:herb',3,'약초 채집')],lancer:[level(2),visit('meadow'),kills(6)],
 monk:[level(3),req('visited',3,'지역 발견')],herbalist:[level(2),req('gather:herb',5,'약초 채집')],miner:[level(2),req('gather:ore',3,'광석 채집')],
 berserker:[level(7),job('guardian'),master('guardian',25),kills(60)],
 paladin:[level(8),job('guardian'),job('priest'),boss(1)],
 sentinel:[level(8),job('guardian'),req('kill:moss_guardian',1,'이끼왕 처치'),req('crafted',2,'제작 횟수')],
 sniper:[level(8),job('ranger'),master('ranger',25),visit('coast')],
 beastwarden:[level(7),job('ranger'),req('kill:wolf',15,'어스름 늑대 처치')],
 spellblade:[level(8),job('guardian'),job('mage'),relic('ruins_rune')],
 pyromancer:[level(10),job('mage'),master('mage',25),visit('desert')],
 cryomancer:[level(13),job('mage'),relic('frost_clock')],
 druid:[level(10),job('herbalist'),relic('swamp_root'),req('gathered',25,'채집 횟수')],
 bard:[level(8),req('visited',5,'지역 발견'),relic('meadow_song')],
 alchemist:[level(8),job('herbalist'),req('crafted',5,'제작 횟수'),req('gathered',30,'채집 횟수')],
 engineer:[level(8),job('miner'),req('crafted',4,'제작 횟수'),relic('ruins_rune')],
 rune_knight:[level(16),job('spellblade'),master('spellblade',60),req('kill:moon_witch',2,'달잠의 마녀 처치')],
 shadowdancer:[level(15),job('rogue'),master('rogue',80),req('relics',8,'유물 발견')],
 stormcaller:[level(18),job('mage'),visit('sky'),req('world:tempest',1,'폭풍의 거신 처치'),relic('sky_bell')],
 necromancer:[level(22),job('druid'),visit('abyss'),req('kill:void_wisp',10,'침묵의 별불 처치')],
 chronomancer:[level(25),job('cryomancer'),relic('frost_clock'),relic('sky_clock'),visit('observatory')],
 spiritwalker:[level(17),job('priest'),job('druid'),req('visited',9,'지역 발견')],
 dragonknight:[level(17),job('berserker'),req('kill:eclipse_dragon',2,'별을 삼킨 용 처치')],
 stargazer:[level(25),job('mage'),master('mage',80),relic('observatory_star')],
 warlord:[level(18),job('sentinel'),kills(250),req('completed',8,'의뢰 완료 종류')],
 voidwalker:[level(24),req('sequence:voidwalker',4,'경계의 문장'),job('shadowdancer'),req('kill:void_wisp',15,'침묵의 별불 처치')],
 eclipse_reaper:[level(26),req('sequence:eclipse_reaper',4,'월식의 문장'),job('shadowdancer'),req('world:eclipse',1,'경계의 포식자 처치')],
 phoenix_heir:[level(26),req('sequence:phoenix_heir',4,'불사조의 문장'),job('pyromancer'),req('kill:eclipse_dragon',3,'별을 삼킨 용 처치')],
 tide_oracle:[level(23),req('sequence:tide_oracle',4,'바다의 문장'),job('priest'),req('world:leviathan',2,'해류의 지배자 처치')],
 starweaver:[level(28),job('stargazer'),req('relics',20,'모든 유물 발견'),req('quest:last_star',1,'마지막 별의 약속 완료')],
 nameless_king:[level(30),req('visited',12,'모든 지역 발견'),req('worldKinds',4,'서로 다른 월드 보스 처치'),relic('observatory_crown'),boss(20)]
};
export const SEQUENCES={
 voidwalker:['meadow_song','ruins_rune','frost_clock','abyss_gate'],
 eclipse_reaper:['forest_leaf','ruins_rune','citadel_ash','observatory_star'],
 phoenix_heir:['citadel_ash','desert_sun','frost_flame','observatory_dawn'],
 tide_oracle:['coast_shell','coast_memory','desert_sun','abyss_tide']
};
const sequenceNames={voidwalker:'경계의 발자국',eclipse_reaper:'검은 달의 서약',phoenix_heir:'꺼지지 않는 불',tide_oracle:'바다가 숨긴 문장'};
export function prepareProgression(p,now=Date.now()){
 const d=p.discovery||{};
 p.discovery={visited:[...new Set(['town',p.zone,...(d.visited||[])])].filter(x=>ZONES[x]&&!ZONES[x].challenge),relics:[...(d.relics||[])],
  jobs:[...new Set(['novice',p.classId,...(d.jobs||[])])].filter(x=>CLASSES[x]),
  mastery:{...(d.mastery||{})},killTypes:{...(d.killTypes||{})},gatherTypes:{...(d.gatherTypes||{})},
  crafted:d.crafted||0,healed:d.healed||0,worldKills:{...(d.worldKills||{})},sequences:{...(d.sequences||{})},claims:[...(d.claims||[])],
  rewardedWindows:[...(d.rewardedWindows||[])].slice(-100),issuedWeapons:[...new Set([p.equipment?.weapon,...(d.issuedWeapons||[])])].filter(Boolean)};
 // Existing accounts keep their chosen profession, equipment and progress.
 p.schemaVersion=3;
 ensureDaily(p,now);
}
export function ensureDaily(p,now){
 const key=dayKey(now);
 if(p.daily?.key===key)return false;
 p.daily={key,kills:0,gather:0,bosses:0,claims:[]};return true;
}
export function metric(p,key){
 const d=p.discovery;
 if(key.includes(':')){
  const [kind,id]=key.split(':');
  if(kind==='job')return +d.jobs.includes(id);
  if(kind==='master')return d.mastery[id]||0;
  if(kind==='relic')return +d.relics.includes(id);
  if(kind==='visit')return +d.visited.includes(id);
  if(kind==='kill')return d.killTypes[id]||0;
  if(kind==='gather')return d.gatherTypes[id]||0;
  if(kind==='world')return d.worldKills[id]||0;
  if(kind==='sequence')return d.sequences[id]||0;
  if(kind==='quest')return +p.completed.includes(id);
 }
 return ({level:p.level,kills:p.kills,gathered:p.gathered,chests:p.opened.length,bosses:p.bossKills,completed:p.completed.length,
  jobs:d.jobs.length,visited:d.visited.length,relics:d.relics.length,crafted:d.crafted,worldKinds:Object.keys(d.worldKills).filter(id=>d.worldKills[id]>0).length,
  hidden:d.jobs.filter(id=>CLASSES[id]?.tier==='hidden').length})[key]||0;
}
export function evaluateJobs(game,p,notify=true){
 // Professions are granted only by completing a server-validated story.
 // Previously owned professions remain in discovery.jobs when loading a save.
 return [];
}
export function recordProgress(game,p,kind,id,count=1){
 // Private training rooms do not complete exploration or profession journeys.
 if(kind==='visit'&&ZONES[id]?.challenge)return;
 const d=p.discovery;ensureDaily(p,game.now);
 if(kind==='kill'){d.killTypes[id]=(d.killTypes[id]||0)+count;d.mastery[p.classId]=(d.mastery[p.classId]||0)+count;p.daily.kills+=count;}
 if(kind==='boss'){d.mastery[p.classId]=(d.mastery[p.classId]||0)+10;p.daily.bosses+=count;}
 if(kind==='gather'){d.gatherTypes[id]=(d.gatherTypes[id]||0)+count;p.daily.gather+=count;d.mastery[p.classId]=(d.mastery[p.classId]||0)+1;}
 if(kind==='craft')d.crafted+=count;
 if(kind==='heal')d.healed+=count;
 if(kind==='quest')d.mastery[p.classId]=(d.mastery[p.classId]||0)+5;
 if(kind==='visit'&&!d.visited.includes(id))d.visited.push(id);
 if(kind==='world')d.worldKills[id]=(d.worldKills[id]||0)+count;
 if(p.journey)recordStory(game,p,{kind,target:id,count});
 if(p.atlas)recordAtlas(game,p,kind,id);
 evaluateJobs(game,p);
}
export function jobBook(p){return storyBook(p);}
export function readRelic(game,p,relic){
 const d=p.discovery,first=!d.relics.includes(relic.id),steps=[];
 if(first){
  d.relics.push(relic.id);game.addItem(p,'relic_dust');game.giveXP(p,80+ZONES[p.zone].minLevel*12);
  game.send(p.id,'loot',{gold:0,xp:80+ZONES[p.zone].minLevel*12,items:[{id:'relic_dust',count:1}],name:'잊힌 기억 발견'});
 }
 for(const [id,list]of Object.entries(SEQUENCES)){
  const n=d.sequences[id]||0;
  if(list[n]===relic.id){
   d.sequences[id]=n+1;
   const next=RELICS.find(r=>r.id===list[n+1]);
   steps.push({title:sequenceNames[id],step:n+1,total:list.length,message:next?`${ZONES[next.zone].name}의 「${next.name}」에서 다음 문장을 읽어 보세요.`:'오래된 문장이 이어졌습니다. 이제 새 원정 지역의 기록을 찾아 전직 이야기를 시작해 보세요.'});
  }else if(list.includes(relic.id)&&n<list.length){
   const next=RELICS.find(r=>r.id===list[n]);
   steps.push({title:sequenceNames[id],step:n,total:list.length,message:`문장의 앞부분이 비어 있습니다. ${ZONES[next.zone].name}의 「${next.name}」부터 읽어 보세요.`});
  }
 }
 recordStory(game,p,{kind:'relic',target:relic.id});
 game.mark(p);evaluateJobs(game,p);
 game.send(p.id,'relicRead',{id:relic.id,name:relic.name,text:relic.text,first,steps});
 return {ok:true};
}
export function changeJob(game,p,id){
 const c=CLASSES[id];
 if(!c||!p.discovery.jobs.includes(id))return {ok:false,error:'먼저 탐험을 통해 이 직업을 해금해야 합니다.'};
 if(p.zone!=='town')return {ok:false,error:'전직은 안전한 별여울 마을에서만 가능합니다.'};
 if(game.now-p.lastCombat<8000)return {ok:false,error:'전투 종료 8초 후 전직할 수 있습니다.'};
 if((p.cooldowns.job||0)>game.now)return {ok:false,error:'전직 후 15초 동안은 다른 직업으로 바꿀 수 없습니다.'};
 if(p.classId===id)return {ok:false,error:'이미 사용 중인 직업입니다.'};
 const before=getStats(p),hpRatio=p.hp/before.maxHp,mpRatio=p.mp/before.maxMp;
 p.classId=id;
 const family=c.family||id;
 if(!p.discovery.issuedWeapons.includes(c.weapon)){
  if(!(p.inventory[c.weapon]>0))game.addItem(p,c.weapon);
  p.discovery.issuedWeapons.push(c.weapon);
 }
 const weapons=Object.keys(p.inventory).filter(k=>p.inventory[k]>0&&ITEMS[k]?.slot==='weapon'&&ITEMS[k].class===family&&ITEMS[k].level<=p.level)
  .sort((a,b)=>(ITEMS[b].atk+(p.enhancements[b]||0)*3)-(ITEMS[a].atk+(p.enhancements[a]||0)*3));
 p.equipment.weapon=weapons[0]||null;
 const after=getStats(p);p.hp=Math.max(1,Math.min(after.maxHp,Math.floor(after.maxHp*hpRatio)));p.mp=Math.max(0,Math.min(after.maxMp,Math.floor(after.maxMp*mpRatio)));
 p.cooldowns.job=game.now+15000;p.shieldUntil=0;p.speedUntil=0;
 game.mark(p);game.send(p.id,'jobChanged',{classId:id});game.fx(p.zone,{type:'level',id:p.id,x:p.x,y:p.y,level:p.level});
 return {ok:true,message:`${c.name}(으)로 전직했습니다. 직업 숙련은 각각 따로 보존됩니다.`};
}
export function progressionAction(game,p,a){
 if(a.type==='jobs'){evaluateJobs(game,p);game.send(p.id,'jobBook',jobBook(p));return {ok:true};}
 if(a.type==='changeJob')return changeJob(game,p,a.id);
 if(a.type==='dailyClaim'){
  if(p.zone!=='town')return {ok:false,error:'일일 의뢰 보상은 마을에서 수령하세요.'};
  ensureDaily(p,game.now);const t=DAILY_TASKS.find(t=>t.id===a.id);
  if(!t||p.daily.claims.includes(a.id)||p.daily[t.metric]<t.goal)return {ok:false,error:'이미 받았거나 아직 완료하지 못한 일일 의뢰입니다.'};
  p.daily.claims.push(a.id);p.gold+=t.gold;game.giveXP(p,t.xp);for(const [id,n]of Object.entries(t.items))game.addItem(p,id,n);
  game.mark(p);evaluateJobs(game,p);return {ok:true,message:`${t.name} 보상을 받았습니다. 다음 초기화는 한국 시간 자정입니다.`};
 }
 if(a.type==='achievement'){
  const t=ACHIEVEMENTS.find(t=>t.id===a.id);
  if(!t||p.discovery.claims.includes(a.id)||metric(p,t.metric)<t.goal)return {ok:false,error:'달성 여부와 수령 기록을 확인해 주세요.'};
  p.discovery.claims.push(a.id);p.gold+=t.gold;if(!p.titles.includes(t.name))p.titles.push(t.name);
  game.mark(p);return {ok:true,message:`업적 「${t.name}」 · ${t.gold} G와 칭호 획득`};
 }
 if(a.type==='travel'){
  const z=ZONES[a.id];
  if(p.zone!=='town'||!z||z.expedition||!p.discovery.visited.includes(a.id)||p.level<z.minLevel)return {ok:false,error:'마을에서는 이미 방문한 지역으로만 이동할 수 있습니다.'};
  if(game.now-p.lastCombat<8000)return {ok:false,error:'전투가 끝난 뒤 이동하세요.'};
  game.teleport(p,a.id,z.spawn[0]*32+16,z.spawn[1]*32+16);return {ok:true};
 }
 return null;
}
