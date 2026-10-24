/** Cosmetic and honor data. Server owns purchases, title grants and save validation. */
export const PIXEL_WIDTH=24;
export const PIXEL_HEIGHT=32;
export const PIXEL_PALETTE=[
  '#00000000','#223040','#425266','#6f7e91','#d9ded2','#f5e3bb','#e2b58d','#a97664',
  '#744d55','#8cabc8','#d3a6e9','#e5c77f','#8bad82','#4f877d','#d97b81','#f2b0c0'
];
export const PORTRAIT_PIXELS=PIXEL_WIDTH*PIXEL_HEIGHT;
export const COSMETIC_GROUPS={costume:'코스튬',aura:'아우라',wings:'날개',nametag:'이름표',entrance:'접속·등장 연출'};
const entries=[
 ['costume','숲의 연금술사','#91c69c',560],['costume','달빛 여행자','#bbafdf',900],['costume','불꽃 검사','#ec9c76',1300],['costume','바다의 무희','#78c9cf',1700],['costume','왕실 사절','#eac88d',2200],['costume','성좌 연구가','#9caddd',3000],['costume','그림자 귀족','#957fba',5000],['costume','천상의 사도','#e8dfb4',8000],
 ['aura','맑은 풀잎','#8ed6a5',400],['aura','푸른 물결','#8dcbdc',700],['aura','자줏빛 구름','#bd8fd8',950],['aura','황금 고리','#e4be74',1300],['aura','불씨 나선','#eb9977',2000],['aura','얼음 별빛','#a8e0ee',3000],['aura','심연 파문','#947dce',4800],['aura','창세의 광휘','#f4dfaa',8000],
 ['wings','새벽 깃털','#c4dec6',1000],['wings','월광 나비','#c7aaeb',1700],['wings','산호 바람','#8bd1cf',2300],['wings','화염 날개','#e99b79',3500],['wings','공허 날개','#9680c9',5500],['wings','천상의 별깃','#f3d9a0',9500],
 ['nametag','녹색 잎장식','#8fcea0',320],['nametag','달빛 테두리','#b6a5db',550],['nametag','황금 명패','#e2c080',820],['nametag','여명의 띠','#f1b9a2',1000],['nametag','수호 문장','#9ec8d9',1600],['nametag','왕관 명패','#eecf9b',2300],['nametag','밤하늘 성좌','#9f9cdb',3600],['nametag','초월자의 증명','#f1dcaf',6500],
 ['entrance','하늘에서 내린 잎','#9dce9f',450],['entrance','물방울 귀환','#92c8e9',800],['entrance','파편 소환','#b6a2e9',1300],['entrance','불꽃 문','#ecaa80',2000],['entrance','별의 사다리','#ebcb86',3800],['entrance','공허의 문턱','#9986cf',6000],['entrance','황금 왕관의 귀환','#f4d798',9500]
];
export const COSMETICS=Object.fromEntries(entries.map(([slot,name,color,price],i)=>{
  const id=`${slot}_${String(i).padStart(2,'0')}`;
  return [id,{id,slot,name,color,price,desc:`전투 능력치를 바꾸지 않는 ${COSMETIC_GROUPS[slot]} 꾸미기 아이템`}];
}));
export const COSMETIC_SLOTS=Object.keys(COSMETIC_GROUPS);
export const DEFAULT_VANITY={owned:[],slots:{costume:null,aura:null,wings:null,nametag:null,entrance:null},avatarPixels:null};
export function prepareVanity(p){
  const old=p.vanity||{};
  const owned=[...new Set(Array.isArray(old.owned)?old.owned:[])].filter(id=>Object.hasOwn(COSMETICS,id)).slice(0,80);
  const slots=Object.fromEntries(COSMETIC_SLOTS.map(slot=>{
    const id=old.slots?.[slot];return [slot,id&&COSMETICS[id]?.slot===slot&&owned.includes(id)?id:null];
  }));
  const pixels=old.avatarPixels;
  p.vanity={owned,slots,avatarPixels:validPortrait(pixels)?pixels:null};
}
export function validPortrait(pixels){
  return typeof pixels==='string'&&pixels.length===PORTRAIT_PIXELS&&/^[0-9a-f]+$/.test(pixels)&&
    (pixels.match(/[1-9a-f]/g)||[]).length>=42;
}
// Every entry is a real claimable milestone. Hard titles offer a small, capped bonus only while equipped.
const rankLabels=['새내기','숙련자','정예','대가'];
const levelGoals=[5,10,15,20,25,30,35,40,50,60,70,80,90,100,115,130,145,160,175,190,200];
export function makeHonorAchievements({CLASSES,MONSTERS,ZONES}){
  const out=[];
  function add(id,name,metric,goal,gold=60,stats=null,desc=''){
    out.push({id:`honor_${id}`,name,metric,goal,gold,stats,desc});
  }
  levelGoals.forEach((goal,i)=>add(`level_${goal}`,`성장의 성좌 ${String(i+1).padStart(2,'0')}`, 'level',goal,100+goal*9,goal>=100?{hp:Math.round(goal/4)}:null,`레벨 ${goal} 달성`));
  for(const [metric,label,goals] of [
    ['kills','사냥꾼의 발걸음',[10,30,70,150,300,500,800,1200,1800,2500,3500,4800,6000,8000,10000]],
    ['bosses','보스의 상흔',[1,3,5,8,12,20,30,45,60,85,110,150]],
    ['gathered','대지의 수집가',[5,15,30,60,100,160,250,400,650,1000]],
    ['crafted','용광로의 불씨',[2,5,10,20,35,55,85,120,180,250]],
    ['visited','세계의 순례자',[2,4,8,12,20,30,40,60,85,110,145]],
    ['relics','잊힌 고고학자',[2,4,6,8,10,12,15,18,20]],
    ['jobs','길 위의 전직자',[2,3,5,8,12,16,24,30,37]],
  ])goals.forEach((goal,i)=>add(`${metric}_${goal}`,`${label} ${String(i+1).padStart(2,'0')}`,metric,goal,80+goal*3,goal>=goals[Math.floor(goals.length*.8)]?{def:3}:null,`${label}: ${goal}회 또는 개 달성`));
  // Individually keyed to existing kill/mastery counters; not merely decorative labels.
  for(const [id,c] of Object.entries(CLASSES)){
    if(id==='novice')continue;
    [15,60,180,450].forEach((goal,i)=>add(`job_${id}_${goal}`,`${c.name}의 ${rankLabels[i]}`,`master:${id}`,goal,90+goal*3,i===3?{atk:4,def:2}:null,`${c.name} 숙련 ${goal}`));
  }
  for(const [id,m] of Object.entries(MONSTERS).filter(([,m])=>!m.boss&&!m.worldBoss).slice(0,100)){
    [12,80].forEach((goal,i)=>add(`monster_${id}_${goal}`,`${m.name} ${i===0?'관찰자':'정복자'}`,`kill:${id}`,goal,60+goal*4,i===1?{hp:14}:null,`${m.name} ${goal}회 처치`));
  }
  for(const [id,z]of Object.entries(ZONES)){
    if(z.dungeon||z.challenge||z.secretRealm||id==='town'||(z.expedition&&z.sector!==0))continue;
    add(`zone_${id}`,`${z.name}의 첫 방문자`,`visit:${id}`,1,120,null,`${z.name} 발견`);
  }
  return out;
}
const bonusCaches=new WeakMap();
export function honorBonus(title,catalogue){
  let cache=bonusCaches.get(catalogue);
  if(!cache||cache.size!==catalogue.length){cache={size:catalogue.length,map:new Map(catalogue.filter(a=>a.stats).map(a=>[a.name,a.stats]))};bonusCaches.set(catalogue,cache);}
  return cache.map.get(title)||null;
}
