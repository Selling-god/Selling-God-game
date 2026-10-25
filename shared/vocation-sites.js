import {CLASSES,ZONES} from './content.js';
import {expeditionId} from './expeditions.js';

// Coordinates are shared for collision and rendering; story scripts live server-side.
export const VOCATION_LOCATIONS={
 guardian:['카엘','town'],ranger:['헤른','town'],mage:['세아','town'],rogue:['레비','town'],
 priest:['엘린','town'],lancer:['로웬','town'],monk:['담','town'],herbalist:['마리','town'],miner:['두린','town'],
 berserker:['붉은 맹세의 라크',expeditionId('meadow',1)],paladin:['광휘의 테온',expeditionId('coast',0)],
 sentinel:['성벽지기 바론',expeditionId('meadow',2)],sniper:['먼눈의 헤르츠',expeditionId('coast',1)],
 beastwarden:['늑대의 벗 나루',expeditionId('meadow',3)],spellblade:['룬독자 아르',expeditionId('desert',0)],
 pyromancer:['불씨지기 하린',expeditionId('desert',1)],cryomancer:['서리의 미르',expeditionId('frost',0)],
 druid:['뿌리의 여인 이나',expeditionId('swamp',0)],bard:['길 위의 로제',expeditionId('coast',2)],
 alchemist:['달솥의 메르',expeditionId('swamp',1)],engineer:['태엽공 윈',expeditionId('desert',2)],
 rune_knight:['봉인검의 아델',expeditionId('desert',4)],shadowdancer:['밤의 무희 세린',expeditionId('swamp',4)],
 stormcaller:['천둥의 노인 토르',expeditionId('sky',4)],necromancer:['장례지기 베일',expeditionId('abyss',4)],
 chronomancer:['시계지기 오르',expeditionId('frost',4)],spiritwalker:['사계의 사란',expeditionId('sky',3)],
 dragonknight:['재의 기사 드란',expeditionId('desert',6)],stargazer:['별의 사서 유라',expeditionId('observatory',4)],
 warlord:['깃발 없는 렌',expeditionId('sky',5)],
 voidwalker:['경계 밖의 목소리',expeditionId('abyss',8)],eclipse_reaper:['잠든 달의 집행자',expeditionId('observatory',3)],
 phoenix_heir:['꺼지지 않은 깃털',expeditionId('desert',8)],tide_oracle:['마지막 물결의 아이',expeditionId('coast',8)],
 starweaver:['새벽의 직조자',expeditionId('observatory',8)],nameless_king:['왕좌를 비운 자',expeditionId('abyss',7)],
 dawn_architect:['새벽의 톱니지기',expeditionId('observatory',7)],
 abyss_shepherd:['먼 어둠의 목자',expeditionId('abyss',6)]
};
export const VOCATION_SITES=Object.entries(VOCATION_LOCATIONS).map(([job,[name,zone]],i)=>{
 const z=ZONES[zone],common=CLASSES[job].tier==='common';
 return {id:'mentor_'+job,job,kind:'mentor',zone,name,hidden:CLASSES[job].tier==='hidden',
  x:(common?13+(i%5)*7:20+(i%3)*4)*32+16,y:(common?33+Math.floor(i/5)*7:z.height-21-(i%2)*3)*32+16,
  sprite:(CLASSES[job].family==='mage'?'healer':CLASSES[job].family==='ranger'?'merchant':'smith')+'_s_0'};
});

/** Alternate interaction objects for hidden-class stories; authoritative story prerequisites still apply. */
const HIDDEN_RELIC_NAMES={voidwalker:'공허의 파편',eclipse_reaper:'검은 달의 낫',phoenix_heir:'불멸의 불씨',tide_oracle:'밀물의 조개',starweaver:'운명의 베틀',nameless_king:'비어 있는 왕관',dawn_architect:'새벽의 태엽',abyss_shepherd:'심연의 양치기 종'};
export const HIDDEN_VOCATION_RELICS=VOCATION_SITES.filter(s=>s.hidden).map((s,i)=>({
  id:`hidden_relic_${s.job}`,kind:'hiddenArtifact',job:s.job,zone:s.zone,hidden:true,
  name:HIDDEN_RELIC_NAMES[s.job]||'봉인된 유물',
  x:s.x+((i%2===0)?96:-96),y:s.y+((i%3)-1)*64,
  sprite:'relic_stone',text:'숨겨진 전직의 유물입니다. 필요한 기록을 모은 뒤 직접 조사해 전직 이야기를 시작하세요.'
}));
export const ALL_VOCATION_SITES=[...VOCATION_SITES,...HIDDEN_VOCATION_RELICS];
