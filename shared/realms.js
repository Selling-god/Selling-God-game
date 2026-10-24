import {endgameCombatStats} from './expansion.js';

export const REALMS=[
 {id:'heaven',name:'백광의 천상',level:60,entryZone:'deepsea_reach_4',color:'#ecdca5',theme:'observatory',visualTheme:'holy',
  garden:'heaven_garden',sanctum:'heaven_sanctum',gardenName:'구름 위의 잃어버린 정원',sanctumName:'천상의 마지막 성소',
  clues:['sunscar_reach_8_tablet','deepsea_reach_4_watch'],clueNames:['첫 여명의 제단의 황혼 원정대 석판','난파 함대의 묘지 관측 표식'],
  entranceNames:['새벽의 종','정오의 종','황혼의 종'],entryOrder:[0,2,1],
  entryHint:'두 기록을 읽은 뒤, 새벽을 깨우고 황혼을 잠재우고 정오를 맞이하라. 종 가까이에서 직접 울려야 한다.',
  trialNames:['힘을 버리는 날개','이름을 기억하는 날개','돌아갈 길의 날개'],trialOrder:[2,1,0],
  trialHint:'천상의 날개는 거꾸로 펼친다. 돌아갈 길 → 기억할 이름 → 내려놓을 힘 순서로 각 날개에 서서 서약하라.',
  boss:'realm_heaven_warden',bossName:'날개를 거둔 심판자 · 세라온',skin:'moon_witch',pattern:'moon',material:'deepsea_crystal',
  jobs:['starweaver','tide_oracle'],title:'닫힌 하늘을 연 자',weaponName:'천상의 서약',stableName:'고요한 천상의 서약',
  weaponText:'공격력은 같은 레벨 원정 무기 수준. 최대 체력 +180, 최대 마나 -60. 성소에서 안정화하면 체력·마나 증감이 사라집니다.'},
 {id:'inferno',name:'재 아래의 지옥',level:110,entryZone:'clockwork_reach_8',color:'#e99771',theme:'citadel',visualTheme:'fire',
  garden:'inferno_garden',sanctum:'inferno_sanctum',gardenName:'끊어진 사슬의 낙원',sanctumName:'저주가 잠든 용광로',
  clues:['wildroot_reach_8_tablet','clockwork_reach_8_watch'],clueNames:['거목의 마지막 맥박 진료 기록','두 번째 새벽의 종루 관측 표식'],
  entranceNames:['탐욕의 봉인','분노의 봉인','슬픔의 봉인','두려움의 봉인'],entryOrder:[2,0,3],
  entryHint:'슬픔을 받아들이고 탐욕을 놓은 뒤 두려움을 풀어라. 분노의 봉인은 건드리지 마라. 틀리면 순서가 처음으로 돌아간다.',
  trialNames:['숨긴 이름의 사슬','남의 죄를 묶은 사슬','내가 맺은 사슬'],trialOrder:[2,0,1],
  trialHint:'저주는 남의 사슬부터 끊을 때 되살아난다. 내가 맺은 사슬 → 숨긴 이름 → 남에게 씌운 죄의 순서로 해방하라.',
  boss:'realm_inferno_warden',bossName:'사슬의 주인 · 바르칸',skin:'eclipse_dragon',pattern:'dragon',material:'stormcrown_crystal',
  jobs:['phoenix_heir','nameless_king'],title:'저주에 이름을 돌려준 자',weaponName:'지옥의 맹약',stableName:'정화된 지옥의 맹약',
  weaponText:'같은 레벨 원정 무기보다 공격력 약 10% 증가, 최대 체력 -360. 성소에서 정화하면 추가 공격력과 체력 감소가 함께 사라집니다.'},
 {id:'mirror',name:'뒤집힌 성좌',level:160,entryZone:'voidfront_reach_8',color:'#b7b2ed',theme:'abyss',visualTheme:'time',
  garden:'mirror_garden',sanctum:'mirror_sanctum',gardenName:'나를 먼저 기억한 거울길',sanctumName:'반전된 왕좌의 안쪽',
  clues:['stormcrown_reach_8_tablet','voidfront_reach_8_watch'],clueNames:['천둥왕의 외곽 옥좌 항로도','문을 삼킨 자의 앞뜰 관측 표식'],
  entranceNames:['(-3, -2)','(3, -2)','(-3, 2)','(3, 2)'],entryOrder:[1,2,3],
  entryHint:'거울이 보여 준 좌표는 (-3,-2) → (3,2) → (-3,2). 동서만 뒤집어 x의 부호를 바꾼 발판에 서라. 남북은 바꾸지 않는다.',
  trialNames:['왼편의 나 · (-6, 0)','가운데의 나 · (0, 0)','오른편의 나 · (6, 0)'],trialOrder:[2,0,1],
  trialHint:'보이는 나는 (-6,0) → (6,0) → (0,0)로 걷는다. 실제 몸은 좌우를 뒤집은 좌표의 거울에 닿아야 한다.',
  boss:'realm_mirror_warden',bossName:'이름을 비추지 않는 왕 · 에이돈',skin:'golem',pattern:'root',material:'astralforge_crystal',
  jobs:['voidwalker','eclipse_reaper'],title:'거울 밖으로 걸어 나온 자',weaponName:'반전 성좌',stableName:'제어된 반전 성좌',
  weaponText:'같은 레벨 원정 무기 공격력, 치명타 +14%, 방어력 -22. 성소에서 제어하면 치명타 +8%로 낮아지고 방어력 감소가 사라집니다.'}
];
export const REALM_BY_ID=Object.fromEntries(REALMS.map(r=>[r.id,r]));
export const REALM_ZONES=Object.fromEntries(REALMS.flatMap(r=>[
 [r.garden,{id:r.garden,name:r.gardenName,subtitle:r.name+' · 각자의 서약을 확인하는 공개 정원',realm:r.id,realmArea:'garden'}],
 [r.sanctum,{id:r.sanctum,name:r.sanctumName,subtitle:r.name+' · 서약을 마친 이들의 공동 성소',realm:r.id,realmArea:'sanctum'}]
].map(([id,z])=>[id,{...z,minLevel:r.level,width:56,height:42,spawn:[28,35],theme:r.theme,color:r.color,
 weather:r.id==='inferno'?'embers':'stars',music:r.id==='inferno'?'citadel':'ruins',secretRealm:true,
 mobTypes:[`realm_${r.id}_echo`,`realm_${r.id}_guard`],mobCount:z.realmArea==='garden'?12:8,seed:611001+REALMS.indexOf(r)*991+(z.realmArea==='sanctum'?71:0)}])));
export const realmWeapon=(id,part,stable=false)=>`realm_${id}_${stable?'stable_':''}${part}`;
export const realmPart=family=>family==='ranger'?'bow':family==='mage'?'staff':'sword';
export function installRealms({ZONES,MONSTERS,ITEMS}){
 Object.assign(ZONES,REALM_ZONES);
 for(const r of REALMS){
  for(const [suffix,skin,rank]of [['echo','wisp',1],['guard','ash_knight',2]]){
   MONSTERS[`realm_${r.id}_${suffix}`]={...MONSTERS[skin],...endgameCombatStats(r.level,rank),
    name:r.name+(suffix==='echo'?'의 잊힌 잔영':'의 봉인 파수병'),sprite:skin,skin,boss:false,worldBoss:false,
    material:r.material,gearTier:{heaven:'end_deepsea',inferno:'end_stormcrown',mirror:'end_astralforge'}[r.id]};
  }
  MONSTERS[r.boss]={...MONSTERS[r.skin],...endgameCombatStats(r.level,0,true),name:r.bossName,sprite:r.skin,skin:r.skin,
   boss:true,worldBoss:false,realmBoss:r.id,pattern:r.pattern,range:110,speed:60,aggro:260,radius:34,
   xp:0,gold:[0,0],material:r.material};
  ITEMS[`realm_${r.id}_core`]={name:r.name+'의 서약핵',type:'material',icon:'shard',rarity:'legendary',sell:0,
   desc:'이 세계를 처음 완주한 사람에게 주어집니다. 성소에서 현재 직업 계열의 무기 한 자루와 교환합니다.'};
  for(const [family,part,label]of [['guardian','sword','검'],['ranger','bow','활'],['mage','staff','지팡이']])for(const stable of [false,true]){
   const base=Math.round(20+r.level*3.2)+(family==='mage'?6:0);
   ITEMS[realmWeapon(r.id,part,stable)]={name:(stable?r.stableName:r.weaponName)+'의 '+label,type:'gear',slot:'weapon',
    class:family,icon:part,rarity:'legendary',level:r.level,atk:!stable&&r.id==='inferno'?Math.round(base*1.1):base,
    crit:!stable&&r.id==='mirror'?14:8,hp:!stable?(r.id==='heaven'?180:r.id==='inferno'?-360:0):0,
    mp:!stable&&r.id==='heaven'?-60:0,def:!stable&&r.id==='mirror'?-22:0,sell:0,
    visualTheme:r.visualTheme,visualSet:'realm_'+r.id,visualBase:'astral_'+part,realmWeapon:r.id,stable,
    desc:r.weaponText+' 정화·안정화·제어는 이 성소에서만 가능합니다. 반대 상태로도 되돌릴 수 있습니다.'};
  }
 }
}
const validList=(list,ids)=>[...new Set(Array.isArray(list)?list:[])].filter(id=>ids.includes(id));
export function prepareRealms(p,{recover=false}={}){
 const old=p.realms&&typeof p.realms==='object'?p.realms:{},ids=REALMS.map(r=>r.id),weapons={};
 for(const r of REALMS){const w=old.weapons?.[r.id];if(w&&['sword','bow','staff'].includes(w.part))weapons[r.id]={part:w.part,stable:w.stable===true};}
 const back=old.returnPoint;
 p.realms={version:1,known:validList(old.known,ids),unlocked:validList(old.unlocked,ids),trials:validList(old.trials,ids),
  cleared:validList(old.cleared,ids),traces:validList(old.traces,REALMS.flatMap(r=>r.jobs)),weapons,
  returnPoint:back&&typeof back.zone==='string'&&!Object.hasOwn(REALM_ZONES,back.zone)&&!['party_dungeon','party_archive','party_observatory','challenge_arena'].includes(back.zone)&&Number.isFinite(back.x)&&Number.isFinite(back.y)
   ?{zone:back.zone,x:back.x,y:back.y}:null};
 if(recover){
  p.realmEntry=null;p.realmTrial=null;p.realmNextAction=0;
  const z=REALM_ZONES[p.zone];
  if(z&&!p.realms.unlocked.includes(z.realm)){p.zone='town';p.x=784;p.y=688;}
  else if(z?.realmArea==='sanctum'&&!p.realms.trials.includes(z.realm)){
   const garden=REALM_ZONES[REALM_BY_ID[z.realm].garden];p.zone=garden.id;p.x=garden.spawn[0]*32+16;p.y=garden.spawn[1]*32+16;
  }
 }
 return p.realms;
}
