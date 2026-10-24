/** 320 new earnable titles. Each family has twenty real, server-checked milestones. */
const ranks=['첫빛','작은씨앗','견습','새싹','초심','발견자','여행자','추적자','도전자','개척자',
 '숙련자','길잡이','별지기','수호자','선봉','영웅','대가','전설','초월자','영원의별'];
const series=[
 ['꿈꾸는 별','level',i=>Math.min(200,2+i*10),'레벨'],
 ['끝없는 승부','kills',i=>5+i*50,'몬스터 처치'],
 ['거인의 적수','bossKills',i=>1+i*2,'보스 처치'],
 ['숲의 손길','gathered',i=>5+i*20,'채집'],
 ['장인의 망치','crafted',i=>1+i*4,'제작'],
 ['세계의 발자국','visited',i=>1+i*8,'지역 발견'],
 ['기억의 수호','relics',i=>1+i,'유물 발견'],
 ['수많은 길','jobs',i=>2+i,'전직 발견'],
 ['세계의 파수꾼','worldKills',i=>1+i,'월드 보스 격파'],
 ['불굴의 연금','enhanceTotal',i=>1+i*3,'누적 장비 강화 수치'],
 ['별빛의 무구','enhancedGearCount',i=>1+i,'강화한 장비 종류'],
 ['황금의 별','gold',i=>100+i*i*250,'보유 골드'],
 ['숨겨진 보물','chests',i=>1+i*2,'보물상자 발견'],
 ['오래된 인연','playSeconds',i=>(i+1)*1800,'누적 접속(초)'],
 ['약속의 전달자','completed',i=>1+i,'완료한 의뢰 종류'],
 ['숙련의 궤도','mastery',i=>5+(i*15),'직업 숙련도 합계']
];
export const TITLE_CATALOG=Object.freeze(series.flatMap(([theme,metric,threshold,description],seriesIndex)=>
 ranks.map((rank,i)=>Object.freeze({
  id:`chronicle_${String(seriesIndex+1).padStart(2,'0')}_${String(i+1).padStart(2,'0')}`,
  name:`${theme} · ${rank}`,
  metric,goal:threshold(i),description,
  rarity:i>=17?'legendary':i>=13?'epic':i>=9?'rare':i>=5?'uncommon':'common'
 }))
));
export const TITLE_BY_NAME=new Map(TITLE_CATALOG.map(t=>[t.name,t]));
export function titleInfo(name){return TITLE_BY_NAME.get(name)||{name,rarity:name==='별빛을 따라온 자'?'common':'rare'};}
export function titleProgress(p,key){
 const d=p.discovery||{},enh=Object.values(p.enhancements||{});
 switch(key){
  case 'level':return p.level||1;
  case 'kills':return p.kills||0;
  case 'bossKills':return p.bossKills||0;
  case 'gathered':return p.gathered||0;
  case 'crafted':return d.crafted||0;
  case 'visited':return d.visited?.length||0;
  case 'relics':return d.relics?.length||0;
  case 'jobs':return d.jobs?.length||0;
  case 'worldKills':return Object.values(d.worldKills||{}).reduce((a,b)=>a+b,0);
  case 'enhanceTotal':return enh.reduce((a,b)=>a+b,0);
  case 'enhancedGearCount':return enh.filter(v=>v>0).length;
  case 'gold':return p.gold||0;
  case 'chests':return p.opened?.length||0;
  case 'playSeconds':return p.playSeconds||0;
  case 'completed':return p.completed?.length||0;
  case 'mastery':return Object.values(d.mastery||{}).reduce((a,b)=>a+b,0);
  default:return 0;
 }
}
/** Award-only: existing selected title, old titles and progress are never removed. */
export function syncProgressTitles(p){
 if(!Array.isArray(p.titles))p.titles=['별빛을 따라온 자'];
 const have=new Set(p.titles),metrics=new Map(),newly=[];
 for(const t of TITLE_CATALOG){
  if(have.has(t.name))continue;
  if(!metrics.has(t.metric))metrics.set(t.metric,titleProgress(p,t.metric));
  if(metrics.get(t.metric)>=t.goal){p.titles.push(t.name);have.add(t.name);newly.push(t);}
 }
 return newly;
}
