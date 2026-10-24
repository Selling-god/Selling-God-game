/** Additional forge collections. Deterministic IDs and recipes: save-compatible, server authoritative. */
const collections = [
 ['이끼꽃',2,'nature'],['햇살',4,'holy'],['은여울',7,'water'],['황혼숲',10,'nature'],
 ['비취달',13,'moon'],['서리꽃',16,'frost'],['푸른바람',19,'wind'],['유성',22,'star'],
 ['검은모래',26,'earth'],['호박별',30,'holy'],['흰번개',35,'thunder'],['붉은바다',42,'water'],
 ['수정거울',50,'frost'],['하늘노래',60,'wind'],['잊힌왕관',70,'star'],['심연등불',80,'void'],
 ['시간조각',90,'time'],['폭풍장막',100,'thunder'],['영원의숲',110,'nature'],['파멸의달',125,'moon'],
 ['공허의빛',140,'void'],['태고의별',155,'star'],['창세의파도',170,'water'],['여명의서약',185,'holy']
];
const rarityAt=(level)=>level<12?'uncommon':level<35?'rare':level<90?'epic':'legendary';
export const EXTRA_FORGE_SETS=collections.map(([name,level,theme],index)=>({
  index, name, level, theme, tier:`forge_${String(index+1).padStart(2,'0')}`
}));

/** 24 materials and 120 equippable items, all craftable and some droppable. */
export function installExtraItems({ITEMS,RECIPES}){
 for(const set of EXTRA_FORGE_SETS){
  const {name,level,theme,tier,index}=set,rarity=rarityAt(level),material=`${tier}_essence`;
  ITEMS[material]={name:`${name} 정수`,type:'material',icon:'shard',rarity,level,
    sell:Math.round(7+level*.9),desc:`Lv.${level} 이상 ${name} 계열 장비 제작 재료. 적정 레벨 몬스터에게서 획득합니다.`};
  for(const [part,family,label,base,icon] of [
    ['sword','guardian','검','iron_sword','sword'],['bow','ranger','활','oak_bow','bow'],['staff','mage','지팡이','ash_staff','staff']]){
   const id=`${tier}_${part}`;
   ITEMS[id]={name:`${name}의 ${label}`,type:'gear',slot:'weapon',class:family,icon,
     rarity,level,atk:Math.round(3+level*2.15+(part==='staff'?3:0)),crit:level>=35?Math.min(11,2+Math.floor(level/25)):0,
     sell:Math.round(25+level*11),visualBase:base,visualTheme:theme,
     desc:`Lv.${level} ${name} 대장장이 제작 무기. 강화 가능합니다.`};
   RECIPES.push({id,output:id,count:1,name:ITEMS[id].name,level,gold:Math.round(35+level*22),
     cost:{[material]:5+(index%4),ore:Math.min(18,2+Math.floor(level/15))}});
  }
  const armor=`${tier}_armor`,charm=`${tier}_charm`;
  ITEMS[armor]={name:`${name} 수호복`,type:'gear',slot:'armor',icon:'armor',rarity,level,
    def:Math.round(2+level*.79),hp:Math.round(15+level*7),mp:Math.round(level*.9),
    sell:Math.round(18+level*8),visualBase:'tunic',visualTheme:theme,desc:`Lv.${level} ${name} 제작 방어구.`};
  ITEMS[charm]={name:`${name} 성물`,type:'gear',slot:'charm',icon:'charm',rarity,level,
    atk:Math.round(1+level*.29),hp:Math.round(8+level*3),mp:Math.round(8+level*2),
    crit:Math.min(9,Math.floor(level/23)),sell:Math.round(20+level*7),visualBase:'charm',visualTheme:theme,
    desc:`Lv.${level} ${name} 제작 장신구.`};
  for(const [id,amount]of [[armor,4],[charm,3]])RECIPES.push({
    id,output:id,count:1,name:ITEMS[id].name,level,gold:Math.round(30+level*19),
    cost:{[material]:amount+(index%3),ore:Math.min(16,2+Math.floor(level/18))}
  });
 }
}

export function extraDropsForLevel(level,random=Math.random,{boss=false,classId='novice'}={}){
 if(!Number.isFinite(level)||level<1)return [];
 const sets=EXTRA_FORGE_SETS.filter(s=>s.level<=level);
 const set=sets.at(-1);
 if(!set)return [];
 const drops=[];
 if(random()<(boss?.92:.24))drops.push({id:`${set.tier}_essence`,count:boss?3:1});
 if(random()<(boss?.20:.018)){
  const family=['guardian','ranger','mage'].includes(classId)?classId:classId==='novice'?'guardian':classId;
  // Class families are handled by the caller for advanced professions.
  const part=family==='ranger'?'bow':family==='mage'?'staff':'sword';
  const piece=random();
  const item=piece<.52?`${set.tier}_${part}`:piece<.79?`${set.tier}_armor`:`${set.tier}_charm`;
  drops.push({id:item,count:1});
 }
 return drops;
}
