/** Hidden achievement checks are intentionally server-only. The web client
 * receives a title name and rarity, but not the private unlock conditions. */
import {HIDDEN_TITLES} from '../shared/title-catalog.js';

const achievementChecks=[
 p=>(p.level||1)>=35&&(p.kills||0)>=1200,
 p=>(p.bossKills||0)>=28&&(p.deaths||0)>=3,
 p=>(p.bossKills||0)>=45&&(p.level||1)>=65,
 p=>(p.discovery?.crafted||0)>=70&&Object.values(p.enhancements||{}).reduce((a,b)=>a+b,0)>=70,
 p=>(p.gold||0)>=175000&&(p.opened?.length||0)>=20,
 p=>(p.discovery?.visited?.length||0)>=10&&(p.discovery?.relics?.length||0)>=5,
 p=>Object.values(p.discovery?.worldKills||{}).reduce((a,b)=>a+b,0)>=22&&(p.bossKills||0)>=70,
 p=>(p.playSeconds||0)>=40*3600&&(p.level||1)>=110,
 p=>Object.values(p.enhancements||{}).some(n=>n>=10)&&(p.discovery?.crafted||0)>=95,
 p=>(p.level||1)>=180&&(p.bossKills||0)>=120&&Object.values(p.discovery?.worldKills||{}).reduce((a,b)=>a+b,0)>=35
];

export function syncHiddenTitles(player){
 const have=new Set(player.titles||[]),newly=[];
 for(let i=0;i<HIDDEN_TITLES.length;i++){
  const title=HIDDEN_TITLES[i];
  if(have.has(title.name)||!achievementChecks[i](player))continue;
  player.titles.push(title.name);have.add(title.name);newly.push(title);
 }
 return newly;
}
