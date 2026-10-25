/** Premium forged weapons. Materials require region raids, elite bosses and exploration.
 * No direct loot source supplies them, so rarity is not diluted by early drops. */
const PATTERNS=[
 ['starlit','성운의 성배',20, 'mythic','forge_08',3,3],
 ['deepforge','해저의 성창',35,'mythic','forge_11',4,4],
 ['rootcrown','세계수의 맹세',50,'mythic','forge_13',5,5],
 ['timelock','정지한 세계의 칼날',75,'ancient','forge_15',8,6],
 ['thunderking','폭풍왕의 유언',100,'ancient','forge_18',10,8],
 ['voidheart','공허 너머의 새벽',135,'ancient','forge_21',14,12],
 ['genesis','창세 성좌의 근원',165,'ancient','forge_23',18,16],
 ['eternity','영원의 마지막 약속',190,'ancient','forge_24',24,20]
];
export const MASTERWORK_TIERS=PATTERNS;
export function installMasterworks({ITEMS,RECIPES}){
 for(const [tier,name,level,rarity,material,token,seals]of PATTERNS){
  const parts=[['sword','guardian','검', 'iron_sword'],['bow','ranger','장궁','oak_bow'],['staff','mage','법전','ash_staff']];
  for(const [part,family,label,visualBase]of parts){
   const id=`master_${tier}_${part}`,atk=Math.round(level*2.72+21+(part==='staff'?10:0));
   ITEMS[id]={name:`${name} · ${label}`,type:'gear',slot:'weapon',class:family,icon:part,rarity,level,atk,
    hp:Math.round(level*4),mp:Math.round(level*2),crit:Math.min(26,8+Math.round(level*.07)),
    sell:Math.round(level*85),visualBase,visualTheme:rarity==='ancient'?'star':'holy',
    desc:`태고 대장간의 명품 무기. Lv.${level} 이상. 대륙의 정수와 월드 보스 전리품을 모아야 제작할 수 있습니다.`};
   RECIPES.push({id,output:id,name:ITEMS[id].name,count:1,level,gold:Math.round(1200+level*210),
    cost:{[material+'_essence']:Math.round(6+level*.12),world_token:token,wayfarer_seal:seals,ore:Math.min(90,14+Math.round(level*.18))}});
  }
 }
}
