/** Visual descriptors do not decide damage, drops, or unlocks. */
export const THEMES={
 steel:{primary:'#b6d2db',light:'#f3f3d7',dark:'#507d9b'},wind:{primary:'#98e0b8',light:'#f0ffd9',dark:'#467e76'},
 star:{primary:'#c3afff',light:'#fff0c7',dark:'#6760ac'},shadow:{primary:'#b192d9',light:'#e5c9ff',dark:'#4c315d'},
 holy:{primary:'#f3d78e',light:'#fffde2',dark:'#b69a50'},earth:{primary:'#b9c5a2',light:'#ede2ad',dark:'#687c60'},
 blood:{primary:'#ed8e99',light:'#ffdaaf',dark:'#8e4259'},nature:{primary:'#99d999',light:'#e7ffa7',dark:'#417d69'},
 fire:{primary:'#ffab64',light:'#fff1a8',dark:'#d65c4b'},ice:{primary:'#9bddf5',light:'#ecffff',dark:'#608bb7'},
 water:{primary:'#7dd7e1',light:'#d3fff8',dark:'#3679a0'},thunder:{primary:'#bbbeff',light:'#ffffd4',dark:'#6a73c9'},
 poison:{primary:'#bbda7f',light:'#eeffb2',dark:'#677b3e'},arcane:{primary:'#e2a4eb',light:'#fff0fb',dark:'#8b5b9e'},
 time:{primary:'#b3dbe2',light:'#f6dfaa',dark:'#657fa3'},void:{primary:'#c391ec',light:'#f4ddff',dark:'#563777'},
 music:{primary:'#efaed2',light:'#fff2bd',dark:'#91598e'},machine:{primary:'#bdd2db',light:'#ffda88',dark:'#65798d'}
};
// Theme / first offensive effect / defensive effect / ultimate silhouette.
const ROWS={
 novice:['steel','sweep','bandage','burst'],guardian:['steel','sweep','shield','swords'],
 ranger:['wind','arrow','leaves','rain'],mage:['star','orb','barrier','meteor'],
 rogue:['shadow','daggers','smoke','blades'],priest:['holy','cross','cross','pillars'],
 lancer:['steel','lance','shield','lances'],monk:['holy','fists','lotus','fists'],
 herbalist:['nature','vines','leaves','garden'],miner:['earth','rocks','shield','quake'],
 berserker:['blood','sweep','roar','blades'],paladin:['holy','crossSlash','cross','swords'],
 sentinel:['steel','shieldBash','fortress','fortress'],sniper:['wind','beam','scope','beam'],
 beastwarden:['earth','claws','paw','wolves'],spellblade:['arcane','runeSlash','barrier','runes'],
 pyromancer:['fire','flame','flame','inferno'],cryomancer:['ice','icicles','snow','blizzard'],
 druid:['poison','spores','leaves','tree'],bard:['music','notes','notes','symphony'],
 alchemist:['poison','bomb','bubbles','alchemy'],engineer:['machine','gear','gear','cannon'],
 rune_knight:['arcane','runeSlash','runes','runes'],shadowdancer:['shadow','daggers','smoke','dance'],
 stormcaller:['thunder','lightning','wind','storm'],necromancer:['void','soul','soul','spirits'],
 chronomancer:['time','clock','clock','timewarp'],spiritwalker:['nature','arrow','lotus','seasons'],
 dragonknight:['fire','claws','dragon','dragon'],stargazer:['star','constellation','stars','supernova'],
 warlord:['holy','sweep','banner','banner'],voidwalker:['void','rift','rift','blackhole'],
 eclipse_reaper:['shadow','scythe','eclipse','eclipse'],phoenix_heir:['fire','wings','wings','phoenix'],
 tide_oracle:['water','wave','bubbles','tide'],starweaver:['star','threads','stars','weave'],
 nameless_king:['holy','crossSlash','crown','crown']
};
export function skillVisual(job,skill='basic'){
 const [theme,q,e,r]=ROWS[job]||ROWS.novice;
 return {theme,shape:skill==='skill1'?q:skill==='skill2'?e:skill==='ultimate'?r:'basic',
  powerful:skill==='ultimate',...THEMES[theme]};
}
const bossRows={
 moss_guardian:['nature','antlers'],moon_witch:['arcane','moon'],eclipse_dragon:['fire','horns'],
 thorn_stag:['nature','antlers'],coral_queen:['water','coral'],sand_pharaoh:['holy','crown'],
 spore_matron:['poison','mushroom'],snow_sentinel:['ice','ice'],sky_seraph:['thunder','wings'],
 abyss_keeper:['void','horns'],orion:['star','halo'],
 world_tempest:['thunder','crown'],world_leviathan:['water','coral'],
 world_glacier:['ice','ice'],world_eclipse:['void','horns']
};
export function bossVisual(type){
 const [theme,gear]=bossRows[type]||['steel','crown'];
 return {theme,gear,...THEMES[theme]};
}
export const JOB_VISUALS=ROWS;
export function installBossGear({ITEMS,RECIPES,MONSTERS}){
 const sets=[
  ['tempest','폭풍','world_tempest','thunder',12],
  ['leviathan','해류','world_leviathan','water',16],
  ['glacier','빙하','world_glacier','ice',20],
  ['eclipse','월식','world_eclipse','void',26]
 ];
 for(const [set,name,boss,theme,level] of sets){
  const core=set+'_core';
  ITEMS[core]={name:name+'의 핵',type:'material',icon:'heart',rarity:'epic',sell:100,desc:MONSTERS[boss].name+' 처치 보상. 보스 장비 제작 재료.'};
  MONSTERS[boss].signatureCore=core;
  for(const [part,family,label]of [['sword','guardian','검'],['bow','ranger','활'],['staff','mage','지팡이']]){
   const id=`boss_${set}_${part}`;
   ITEMS[id]={name:name+'의 '+label,type:'gear',slot:'weapon',class:family,icon:part,rarity:'legendary',
    atk:34+Math.round(level*1.6)+(part==='staff'?4:0),crit:7,level,sell:1300,visualTheme:theme,visualSet:set,
    desc:'보스의 흔적이 남은 무기. 장착 시 외형과 잔광이 달라집니다.'};
   RECIPES.push({id,output:id,name:ITEMS[id].name,count:1,gold:700+level*30,cost:{[core]:2,world_token:3,ore:12},level});
  }
  const armor=`boss_${set}_armor`;
  ITEMS[armor]={name:name+'의 갑주',type:'gear',slot:'armor',icon:'armor',rarity:'legendary',
   hp:60+level*6,def:8+level,mp:25,level,sell:1000,visualTheme:theme,visualSet:set,desc:'해당 보스의 장식과 색을 이어받은 갑주. 캐릭터의 갑옷·머리 장식이 바뀝니다.'};
  RECIPES.push({id:armor,output:armor,name:ITEMS[armor].name,count:1,gold:650+level*25,cost:{[core]:2,pelt:10,world_token:2},level});
 }
}
