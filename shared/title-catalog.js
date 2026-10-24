/**
 * Starfall Online title collection.
 * Each of the 320 titles is individually authored (not a prefix + shared rank).
 * Stable IDs and achievement thresholds are retained across title-name updates.
 */
const oldRanks=['첫빛','작은씨앗','견습','새싹','초심','발견자','여행자','추적자','도전자','개척자',
  '숙련자','길잡이','별지기','수호자','선봉','영웅','대가','전설','초월자','영원의별'];

const series=[
  {
    theme:'성장의 궤적',oldTheme:'꿈꾸는 별',metric:'level',goal:i=>Math.min(200,2+i*10),description:'레벨',
    names:[
      '먼지 묻은 신발','첫 장의 잉크','조용한 출발선','은빛 새벽의 손님','길모퉁이의 약속',
      '불씨를 품은 여행자','낯선 지평선','운명을 고르는 발걸음','노을에 새긴 서명','서쪽 하늘의 심장',
      '시대의 방랑객','폭풍 앞에서 웃는 자','별자리의 빈칸','그날의 첫 번째 전설','밤보다 오래 빛나는 이름',
      '세상이 기억할 발자국','운명의 궤도를 바꾼 자','끝나지 않는 서사','시간의 왕관을 쓴 자','모든 새벽의 주인'
    ]
  },
  {
    theme:'전투의 흔적',oldTheme:'끝없는 승부',metric:'kills',goal:i=>5+i*50,description:'몬스터 처치',
    names:[
      '첫 검집의 흠집','흙먼지의 승부사','낡은 칼날','초원의 결투','침묵을 깨는 일격',
      '조용한 검무','핏빛 낙엽','한밤의 추격전','단 한 번의 빈틈','칼끝에 핀 불꽃',
      '전장의 맥박','백야의 투사','쓰러지지 않는 그림자','철혈의 무도','승전고를 울린 손',
      '적막을 베는 검','만군을 돌파한 그림자','검은 달의 집행인','전쟁의 끝을 쓰는 자','파멸을 거스른 칼날'
    ]
  },
  {
    theme:'강적과의 결투',oldTheme:'거인의 적수',metric:'bossKills',goal:i=>1+i*2,description:'보스 처치',
    names:[
      '거인의 발치에서','첫 번째 대적','왕의 뿔을 꺾다','포효가 멎은 밤','균열 앞의 방패',
      '투기장의 이변','폭군에게 던진 장갑','산맥을 울린 승전보','무너진 왕좌의 증인','사자의 입을 봉한 자',
      '용의 그림자를 밟다','잠든 군주의 심판','성채를 꿰뚫은 창','달을 물어뜯은 자','지배자의 마지막 악몽',
      '왕관을 부수는 손','고대 군세의 종언','황금 뿔의 파괴자','신화의 목을 겨눈 자','절대자의 패배 선언'
    ]
  },
  {
    theme:'숲과 채집',oldTheme:'숲의 손길',metric:'gathered',goal:i=>5+i*20,description:'채집',
    names:[
      '손끝의 이슬','산딸기 행상','풀잎 수집가','숲길의 찻잔','이끼 냄새가 나는 사람',
      '바람결의 약초꾼','민들레 우체부','달빛 버섯 감별사','꽃잠을 깨우는 손','비밀 온실의 손님',
      '숲의 심장박동','초록 안개를 마신 자','잠자는 뿌리의 친구','천년목의 목소리','땅속 별의 정원사',
      '겨울에 피는 장미','자연의 맹세를 받은 자','세계수의 마지막 가지','봄을 되찾은 마도사','대지와 이름을 나눈 자'
    ]
  },
  {
    theme:'장인의 작업장',oldTheme:'장인의 망치',metric:'crafted',goal:i=>1+i*4,description:'제작',
    names:[
      '망치와 첫 인사','못 하나의 철학','불 앞의 견습생','손바닥의 설계도','금속을 듣는 귀',
      '주석빛 작업복','톱밥 묻은 발명가','쇳가루의 밤','한 치의 오차도 없이','청동의 마술',
      '새벽을 두드리는 망치','사라진 기술의 복원가','백 번 접은 철','불꽃에 새긴 서약','구름 위의 공방장',
      '왕이 찾는 대장장이','용광로의 설계자','성운을 벼린 손','별의 심장을 단조한 자','창조의 모루를 깨운 자'
    ]
  },
  {
    theme:'끝없는 탐험',oldTheme:'세계의 발자국',metric:'visited',goal:i=>1+i*8,description:'지역 발견',
    names:[
      '길가의 표식','두 번째 지도','여관 없는 거리','산 너머의 날씨','구름을 쫓는 신발',
      '나침반 없이','해안선의 수집가','길 잃은 척하는 모험가','열두 갈래 바람','모래폭풍의 안내자',
      '지도에 없는 계단','잊힌 항로의 선장','수평선의 반대편','구름섬의 발자취','네 대륙의 이야기꾼',
      '세계의 모서리를 만진 자','낙원의 문턱에 선 자','일곱 바다의 지도 제작자','경계 너머를 본 눈','하늘의 끝에 깃발을 꽂다'
    ]
  },
  {
    theme:'잊힌 유물',oldTheme:'기억의 수호',metric:'relics',goal:i=>1+i,description:'유물 발견',
    names:[
      '낡은 동전의 비밀','먼지 속의 문장','유리병의 편지','열리지 않는 궤짝','금 간 석판',
      '사라진 왕국의 철자','고대어를 읽는 밤','지하 서고의 등불','무덤의 꽃 한 송이','금단의 목록',
      '천 년 묵은 초상화','봉인의 열쇠를 쥔 자','폐허가 속삭인 이름','망각을 수선하는 손','달잠 유적의 증언',
      '유실된 왕조의 상속인','시간에 묻히지 않는 진실','멸망을 기록한 서기관','태초의 문을 연 기억','역사의 마지막 빈 페이지'
    ]
  },
  {
    theme:'다양한 직업',oldTheme:'수많은 길',metric:'jobs',goal:i=>2+i,description:'전직 발견',
    names:[
      '두 얼굴의 수습생','검과 책 사이','낯선 길의 수련자','변장한 무도가','낯선 재능의 발견',
      '주문을 배운 검객','역할을 바꾸는 손','칠색의 재능','열쇠가 많은 가방','두 개의 길을 걷다',
      '경계에 선 재능','정해지지 않은 운명','모든 기술의 독자','열두 가면의 주인','검술과 주문의 이중주',
      '가능성을 수집하는 자','운명의 전직표를 찢다','재능의 경계가 없는 자','서른여섯 별의 계승자','직업의 이름을 초월한 자'
    ]
  },
  {
    theme:'월드 보스',oldTheme:'세계의 파수꾼',metric:'worldKills',goal:i=>1+i,description:'월드 보스 격파',
    names:[
      '재앙을 마주한 눈','종소리의 전조','붉은 경보의 참전병','종말 시계의 목격자','도시를 지킨 어깨',
      '검은 비의 생존자','난공불락의 균열','퇴각을 모르는 수비대','왕성의 마지막 횃불','서리거인의 적수',
      '심연을 밀어낸 자','하늘불꽃 격퇴자','멸망의 종을 멈춘 손','전설급 토벌대장','군림하는 폭풍의 천적',
      '세계가 부른 구조자','종언을 지연시킨 영웅','천재지변의 사냥꾼','일식의 왕을 쓰러뜨리다','세계를 멸망시키지 못한 이유'
    ]
  },
  {
    theme:'제련의 집념',oldTheme:'불굴의 연금',metric:'enhanceTotal',goal:i=>1+i*3,description:'누적 장비 강화 수치',
    names:[
      '첫 불꽃은 따뜻했다','망치질 한 번 더','불똥의 행운','떨리는 강화석','모루 앞의 도박사',
      '금속이 울던 순간','꺾이지 않는 불꽃','아슬아슬한 한 단계','붉은 망치의 기도','숨을 죽인 모루',
      '모루와의 백 번째 승부','행운보다 질긴 끈기','대장간의 불사조','절망을 제련하는 자','성공의 소리를 아는 귀',
      '부서진 기대를 다시 벼리다','확률을 향해 웃는 자','불가능을 달군 열기','운명을 두드린 대장인','실패마저 금으로 바꾸는 손'
    ]
  },
  {
    theme:'무구 수집',oldTheme:'별빛의 무구',metric:'enhancedGearCount',goal:i=>1+i,description:'강화한 장비 종류',
    names:[
      '두 자루의 선택','가죽끈의 매듭','헬멧의 스크래치','빈 무기걸이','잊지 못할 첫 장비',
      '무기고의 열쇠지기','방패와 반지의 대화','철과 비단의 조율사','걸어 다니는 무기고','은빛 장비관리관',
      '모든 무기의 친구','아홉 개의 맹세','장비에 이름을 주다','천벌을 막는 갑옷','열세 무구의 주인',
      '칼집 없는 전설','왕국의 이동식 무기고','별무리 전장을 입은 자','신들의 전리품 관리자','세상이 무기를 맡기는 자'
    ]
  },
  {
    theme:'황금과 재산',oldTheme:'황금의 별',metric:'gold',goal:i=>100+i*i*250,description:'보유 골드',
    names:[
      '동전 세는 소리','골목의 장사꾼','첫 번째 저금통','은화의 감별사','따뜻한 지갑',
      '소문난 절약가','시장통의 큰손','반짝이는 계산대','황금거위의 친구','금고에 숨은 달빛',
      '보석상의 단골손님','거래의 미소','금화가 비처럼 내리는 날','왕실 금고의 방문객','장부를 지배하는 자',
      '도시 하나의 부를 가진 자','황금을 비웃는 부자','대륙의 숨은 후원자','왕관보다 무거운 지갑','재물의 흐름을 지휘하는 자'
    ]
  },
  {
    theme:'보물과 발견',oldTheme:'숨겨진 보물',metric:'chests',goal:i=>1+i*2,description:'보물상자 발견',
    names:[
      '열쇠구멍의 호기심','나무상자의 비밀','먼지 쌓인 선물','수상한 경첩','반짝임을 쫓는 눈',
      '자물쇠와 친구가 되다','동굴 속의 손전등','잃어버린 유산','바닥 밑의 쪽지','기묘한 보물 감정사',
      '금빛 징조','고대 열쇠의 소유자','금빛 미궁의 안내인','봉인된 방의 손님','보물지도의 마지막 점',
      '왕의 비밀 창고를 열다','달빛 금고의 유령','세계의 숨은 금맥','전설의 마지막 보물상자','신들이 감춘 보물을 훔친 자'
    ]
  },
  {
    theme:'머문 시간',oldTheme:'오래된 인연',metric:'playSeconds',goal:i=>(i+1)*1800,description:'누적 접속(초)',
    names:[
      '잠깐 들른 손님','여관의 단골','달이 뜰 때까지','어느새 한밤중','불 꺼진 마을의 불빛',
      '여기서 조금 더','모닥불의 두 번째 이야기','오래된 의자의 주인','아침을 기다리는 사람','밤하늘과 함께',
      '계절 하나를 기다리다','머무는 계절','마지막까지 남은 친구','별자리가 바뀔 때까지','기억 속의 단골손님',
      '흔들리지 않는 등불','십 년 뒤에도 이 자리','세월을 건너온 동행','영원의 약속을 지킨 자','시간조차 집으로 부른 자'
    ]
  },
  {
    theme:'의뢰와 약속',oldTheme:'약속의 전달자',metric:'completed',goal:i=>1+i,description:'완료한 의뢰 종류',
    names:[
      '심부름 첫날','잃어버린 편지','약속 시간은 지킨다','마을의 믿음직한 손','작은 부탁의 전문가',
      '누군가의 우산','오래된 요청서','표창장 대신 미소','의뢰인의 신뢰','돌아올 거라는 약속',
      '수많은 사연의 청취자','위험한 계약의 증인','아무도 놓치지 않는 손','구원의 이름 없는 조력자','검은 봉투의 전달자',
      '마지막 의뢰를 마친 사람','세계의 빚을 갚는 자','망각된 서약의 이행자','신들의 불가능한 부탁','모든 이야기의 마침표'
    ]
  },
  {
    theme:'숙련과 수련',oldTheme:'숙련의 궤도',metric:'mastery',goal:i=>5+i*15,description:'직업 숙련도 합계',
    names:[
      '낮은 자세의 수련생','기본기부터','세 번 더 연습','손에 익은 동작','실수 없는 호흡',
      '마음속의 훈련장','새벽 수련의 습관','벽 너머의 호흡','몸이 먼저 기억한다','흔들림 없는 손목',
      '절제된 한 수','열 번의 실패와 한 번의 깨달음','기술을 해부하는 시선','동작 하나에 담긴 철학','소리 없는 완벽주의자',
      '경지를 넘어선 침묵','무형의 검을 다루는 자','신기술의 창시자','백 년의 수련을 넘어서','완성이라는 말을 버린 자'
    ]
  }
];

/** Names of the previous formula-generated titles. Keep the exact one-to-one mapping forever. */
export const TITLE_RENAMES=new Map(series.flatMap(({oldTheme,names})=>oldRanks.map((rank,i)=>[
  `${oldTheme} · ${rank}`,names[i]
])));

// Longer-term milestone curve. Existing awards remain owned, but new unlocks
// require more commitment, especially at rare, epic and legendary tiers.
export function titleGoal(metric,i,original){
 const n=i+1;
 switch(metric){
  case 'level':return Math.min(200,Math.round(7+i*10.2));
  case 'kills':return Math.round(40+25*n*n);
  case 'bossKills':return Math.round(3+1.65*Math.pow(n,1.55));
  case 'gathered':return Math.round(25+8*n*n);
  case 'crafted':return Math.round(4+2*Math.pow(n,1.7));
  case 'visited':return Math.round(7+7*n+1.8*n*n);
  case 'relics':return Math.round(5+2.3*n*n);
  case 'jobs':return Math.round(3+n);
  case 'worldKills':return Math.round(2+1.8*Math.pow(n,1.55));
  case 'enhanceTotal':return Math.round(3+1.4*n*n);
  case 'enhancedGearCount':return Math.round(2+2*n);
  case 'gold':return Math.round(400+140*Math.pow(n,2.45));
  case 'chests':return Math.round(4+3*n);
  case 'playSeconds':return Math.round(1200*Math.pow(n,1.65));
  case 'completed':return Math.round(2+n);
  case 'mastery':return Math.round(15+3.5*n*n);
  default:return original;
 }
}
// Title effects have one deterministic server-calculated value per title, and
// the active title alone supplies the bonus. Higher milestone tiers give more.
function milestoneBonus(seriesIndex,i){
 const tier=i<5?1:i<9?2:i<13?3:i<17?4:5;
 const power=tier+Math.floor(i/5);
 switch(seriesIndex%5){
  case 0:return Object.freeze({atk:power*2,hp:power*8});
  case 1:return Object.freeze({def:power,hp:power*15});
  case 2:return Object.freeze({atk:power,mp:power*10,crit:Math.round(power*.5*10)/10});
  case 3:return Object.freeze({atk:power,def:Math.ceil(power*.7),hp:power*8});
  default:return Object.freeze({atk:power,crit:Math.round(power*.6*10)/10,hp:power*9});
 }
}
export const TITLE_CATALOG=Object.freeze(series.flatMap(({theme,metric,goal,description,names},seriesIndex)=>
  names.map((name,i)=>Object.freeze({
    id:`chronicle_${String(seriesIndex+1).padStart(2,'0')}_${String(i+1).padStart(2,'0')}`,
    name,theme,metric,goal:titleGoal(metric,i,goal(i)),description:metric==='visited'?'탐험 점수':metric==='relics'?'유물 탐사 점수':description,bonus:milestoneBonus(seriesIndex,i),
    rarity:i>=17?'legendary':i>=13?'epic':i>=9?'rare':i>=5?'uncommon':'common'
  }))
));

// Public metadata only. Hidden unlock rules belong exclusively to the server;
// the browser bundle must not contain any of the secret achievement checks.
const hiddenNames=[
 '잠들지 않는 북극성','황혼의 악장','검 끝에 맺힌 새벽','모루가 기억하는 이름',
 '금빛 침묵의 계약자','한 장 남은 세계지도','검은 별의 그림자',
 '역행하는 시간의 증인','열 번째 불꽃의 주인','종말을 거절한 사람'
];
export const HIDDEN_TITLES=Object.freeze(hiddenNames.map((name,i)=>Object.freeze({
 id:`hidden_${String(i+1).padStart(2,'0')}`,name,theme:'히든 칭호',hidden:true,rarity:i>=6?'legendary':'epic',
 bonus:Object.freeze({atk:10+i*3,def:4+Math.floor(i/2),hp:100+i*30,crit:1+i*.2})
})));
export const TITLE_BY_NAME=new Map([...TITLE_CATALOG,...HIDDEN_TITLES].map(t=>[t.name,t]));
export function titleInfo(name){return TITLE_BY_NAME.get(TITLE_RENAMES.get(name)||name)||{name,rarity:name==='별빛을 따라온 자'?'common':'rare'};}
// Special story and quest titles still carry a small perk, even if they are not
// catalog milestones. Do not trust any stat value sent by the browser.
export function titleStatBonus(name){
 const t=titleInfo(name);
 return t.bonus||Object.freeze({atk:t.rarity==='common'?1:3,hp:t.rarity==='common'?8:18});
}
export function titleStatLabel(name){
 const b=titleStatBonus(name),parts=[];
 for(const [key,label]of [['atk','공격력'],['def','방어력'],['hp','최대 HP'],['mp','최대 MP'],['crit','치명타']])if(b[key])parts.push(`${label} +${b[key]}${key==='crit'?'%':''}`);
 return parts.join(' · ');
}

export function titleProgress(p,key){
 const d=p.discovery||{},enh=Object.values(p.enhancements||{});
 switch(key){
  case 'level':return p.level||1;
  case 'kills':return p.kills||0;
  case 'bossKills':return p.bossKills||0;
  case 'gathered':return p.gathered||0;
  case 'crafted':return d.crafted||0;
  case 'visited':return (d.visited?.length||0)*7+(p.opened?.length||0)*2+(d.relics?.length||0)*5;
  case 'relics':return (d.relics?.length||0)*9+(p.opened?.length||0)*2;
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

/**
 * Migrate ONLY the titles belonging to this catalog. Quest, job, challenge,
 * dungeon and other one-off titles are never renamed or deleted.
 * This also converts an equipped old name before the server verifies ownership.
 */
export function migrateTitleNames(p){
 if(!Array.isArray(p.titles))p.titles=['별빛을 따라온 자'];
 // Avoid rebuilding the owned-title array on routine achievements/combat updates.
 if(p.titles.some(name=>TITLE_RENAMES.has(name)))
  p.titles=[...new Set(p.titles.map(name=>TITLE_RENAMES.get(name)||name))];
 if(TITLE_RENAMES.has(p.title))p.title=TITLE_RENAMES.get(p.title);
 // A corrupt or very old equipped name must not grant a free title.
 if(!p.title||!p.titles.includes(p.title))p.title=p.titles[0]||'별빛을 따라온 자';
}

/** Award-only: already earned titles remain earned after renaming, even if a
 * temporary metric (like gold on hand) has decreased since the award. */
export function syncProgressTitles(p){
 migrateTitleNames(p);
 const have=new Set(p.titles),metrics=new Map(),newly=[];
 for(const t of TITLE_CATALOG){
  if(have.has(t.name))continue;
  if(!metrics.has(t.metric))metrics.set(t.metric,titleProgress(p,t.metric));
  if(metrics.get(t.metric)>=t.goal){p.titles.push(t.name);have.add(t.name);newly.push(t);}
 }
 return newly;
}
