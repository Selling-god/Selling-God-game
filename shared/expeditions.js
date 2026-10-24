/**
 * The Unwritten Atlas: eight authored provinces, each with nine connected sectors.
 * Terrain is deterministic; names, chapter themes and landmarks are authored data.
 * No map is generated until entered. Seeds are stable across server/client.
 */
export const PROVINCES = [
 {id:'meadow',name:'바람목 대평원',motto:'길을 잃은 사람들의 깃발을 다시 세우다',
  keeper:'연락병 루아',level:2,seed:31001,theme:'meadow',weather:'leaves',
  names:['개척자의 쉼터','세 갈래 풀바다','쓰러진 깃발 언덕','사슴뿔 협곡','순례자의 긴 다리','별잎 목장','바람을 듣는 절벽','백 개의 풍차터','첫 서약의 고원'],
  fragments:['아무도 돌아오지 않는 길에 루아는 매일 새 깃발을 꽂았다.','전령들은 가장 빠른 길 대신 가장 안전한 길을 표시했다.','찢어진 깃발에는 돌아올 사람들의 이름이 남아 있다.','가시뿔은 길을 막는 괴물이 아니라 묘지를 지키는 파수꾼이었다.','다리의 돌마다 이름 없이 건너간 이들의 발자국이 새겨졌다.','목장은 버려졌지만 병든 여행자를 위한 약초밭은 살아 있다.','바람을 멈추게 할 수는 없다. 대신 누군가의 목소리를 실어 보낼 수 있다.','풍차가 모두 멈춘 날에도 마지막 가루로 빵을 구웠다.','처음의 서약은 이기는 것이 아니라 끝까지 돌아오는 것이었다.']},
 {id:'coast',name:'일곱 조수 군도',motto:'바다에 잠긴 편지를 육지로 돌려보내다',
  keeper:'등대지기 노엘',level:6,seed:42002,theme:'coast',weather:'stars',
  names:['유리항 정박지','조개종 갯벌','푸른 편지 해변','소금안개 선착장','부서진 등대섬','해류의 긴 회랑','산호묘지','잠긴 도서관','돌아오는 파도끝'],
  fragments:['등대지기는 돌아오지 않은 배의 방을 매일 비워 두었다.','조개종은 바람이 아니라 누군가의 이름을 들으면 울린다.','편지의 먹은 번졌지만 마지막 문장, 기다린다는 말은 남았다.','사람을 싣지 못한 배는 약과 식량이라도 실어 날랐다.','등대의 불이 꺼진 것은 불씨가 부족해서가 아니었다.','예언자는 바다를 명령하지 않는다. 물결이 말할 때 듣는다.','산호 아래에서는 적과 아군의 닻이 같은 방향을 향한다.','물에 젖은 책은 역사를 지우지 못했다. 다만 천천히 읽게 했다.','마지막 물결이 돌려준 것은 보물이 아닌 집으로 가는 길이었다.']},
 {id:'desert',name:'유실된 태양왕로',motto:'왕의 이름보다 먼저 지워진 백성의 이름을 찾다',
  keeper:'기록상 바실',level:9,seed:53003,theme:'desert',weather:'sand',
  names:['오아시스 교역소','유리모래 사구','맹세 없는 국경','붉은 수로','빈 왕좌 정원','꺼진 태양 신전','대장장이의 분지','재를 품은 골짜기','새 이름의 능묘'],
  fragments:['오아시스의 물은 왕에게도 여행자에게도 같은 값이었다.','모래는 성을 삼켰지만 길손들이 남긴 약속은 삼키지 못했다.','국경의 표지석에는 통행세보다 먼저 피난민의 이름이 적혔다.','불을 다루던 이는 마지막까지 물을 나르는 일을 그만두지 않았다.','왕좌가 비어 있던 날 백성들은 처음으로 서로의 얼굴을 보았다.','불씨를 지키는 일과 세상을 태우는 일은 같은 힘에서 시작된다.','대장장이는 칼을 녹여 문을 고칠 경첩을 만들었다.','재 속에 남은 깃털은 죽지 않았다는 증거가 아니라 다시 날겠다는 약속이다.','왕은 자신의 이름을 지우고 돌아오지 못한 사람들의 이름을 새겼다.']},
 {id:'swamp',name:'뿌리기억 대습원',motto:'살아 있는 뿌리와 죽은 별 사이에서 답을 듣다',
  keeper:'뿌리학자 미온',level:10,seed:64004,theme:'swamp',weather:'fog',
  names:['이끼 조사기지','등불 없는 진흙길','꿈포자 숲','잠긴 치유원','속삭이는 수목원','오래된 약탕골','영혼의 물길','일곱 뿌리 회랑','기억나무 심부'],
  fragments:['미온은 병든 나무를 베기 전에 살아 있는 뿌리를 찾았다.','길은 눈에 보이지 않아도 작은 등불들을 따라 이어진다.','꿈을 지키는 포자와 잠을 빼앗는 독은 같은 줄기에서 자랐다.','치유사는 약이 떨어진 뒤에도 환자의 이름을 불러 주었다.','나무는 질문에 답하지 않았다. 대신 계절을 한 번 더 견뎠다.','약탕에 마지막으로 넣는 것은 강한 약초가 아니라 적당한 물이었다.','죽은 자를 부른다는 것은 다시 붙잡는 것일까, 놓아주는 것일까.','일곱 뿌리는 서로 다른 곳에서 시작해 같은 물을 나눴다.','기억은 주인을 가두는 덩굴이 아니라 다음 계절을 위한 씨앗이었다.']},
 {id:'frost',name:'백야의 먼 변경',motto:'얼어붙은 시간 속에서 아직 살아 있는 약속을 구하다',
  keeper:'설원 전령 이오',level:13,seed:75005,theme:'frost',weather:'snow',
  names:['눈바람 대피소','부서진 초침 평원','유리늑대 능선','흰 장막 계곡','얼음우편 정류장','거꾸로 흐르는 빙하','불씨 피난굴','동면자의 성벽','영원한 정오의 탑'],
  fragments:['눈보라가 오면 이오는 가장 늦은 사람의 발걸음에 속도를 맞췄다.','시계는 멈췄지만 기다리는 사람에게는 하루가 계속 흘렀다.','늑대가 울지 않는 밤에는 오히려 발자국을 더 조심해야 한다.','서리술사는 추위를 이긴 것이 아니라 온기를 어디에 남길지 배웠다.','배달되지 못한 편지는 눈 속에서도 수신인을 잊지 않았다.','시간을 되돌릴 수 있다 해도 타인의 선택까지 지워서는 안 된다.','불씨는 가장 큰 불이 아니라 끝까지 꺼지지 않는 불을 골랐다.','성벽의 보초는 돌아올 동료를 위해 마지막 문을 잠그지 않았다.','시간의 주인은 과거를 바꾸는 자가 아니라 다음 순간을 책임지는 자다.']},
 {id:'sky',name:'천공 유랑환도',motto:'갈라진 하늘의 다리를 다시 연결하다',
  keeper:'항로기사 세온',level:16,seed:86006,theme:'sky',weather:'stars',
  names:['구름항 전망대','번개풀 들판','바람을 묶는 탑','공명석 부유지','천둥 가교','흩어진 시계섬','매의 귀환 절벽','종 없는 종탑','하늘이 열린 자리'],
  fragments:['세온은 떨어진 다리를 지도에서 지우지 않고 다시 그렸다.','번개는 가장 강한 것을 찾는 것이 아니라 갈 곳을 찾는다.','바람을 붙잡으려던 탑은 바람이 지나갈 문을 만들고서 살아남았다.','같은 음도 어느 돌을 거치느냐에 따라 다른 기억을 울린다.','가교를 건널 때 사람들은 앞사람의 등을 믿고 한 걸음씩 옮겼다.','떨어진 시곗바늘은 모두 다른 시간을 가리키지만 같은 하늘을 본다.','매를 부르는 손은 묶어 두는 손이 아니라 다시 돌아올 자리다.','종이 사라졌어도 누군가는 남은 줄을 잡고 새벽을 알렸다.','하늘이 열린 자리는 지름길이 아니라 돌아갈 길도 생각하라는 경고였다.']},
 {id:'abyss',name:'경계 너머 심연',motto:'사라진 이름을 따라 공허에 길을 남기다',
  keeper:'경계 기록자 아인',level:21,seed:97007,theme:'abyss',weather:'fog',
  names:['침묵의 피난처','그림자 여울','꺼진 성좌 벌판','망각의 복도','뒤집힌 성문','왕 없는 연병장','돌아오지 않는 다리','검은 조수 해구','이름의 마지막 끝'],
  fragments:['아인은 기억할 수 없는 사람을 위해서도 빈 의자를 놓았다.','그림자는 주인을 따라 걷지만 주인보다 먼저 위험에 닿기도 한다.','별이 꺼진 곳에는 어둠이 아니라 아직 이름 붙이지 못한 길이 있었다.','망각은 슬픔을 없애 주지 않았다. 다만 누구를 그리워하는지 잊게 했다.','성문의 안과 밖이 바뀐 날 사람들은 문 대신 서로를 지켰다.','왕이 사라진 뒤에도 명령 없이 부상자를 옮기는 병사들이 있었다.','공허를 건너는 자는 돌아올 자리에 먼저 표식을 남겼다.','바다의 마지막 문장은 깊이가 아니라 돌아오는 물결에 쓰여 있다.','이름을 버린 자가 마지막으로 기억한 것은 자신이 아닌 동료의 이름이었다.']},
 {id:'observatory',name:'별무리 외곽성역',motto:'흩어진 기록을 모아 다음 새벽의 지도를 만들다',
  keeper:'관측사서 유라',level:25,seed:108008,theme:'observatory',weather:'stars',
  names:['성좌 관측전초','빈 망원경 정원','별실 방직회랑','달 그림자 원형극장','멈춘 천구의','새벽 문서고','왕관 없는 의전실','마지막 관측선','이름 없는 새벽'],
  fragments:['유라는 잃어버린 별보다 아직 서로를 보는 사람들을 먼저 적었다.','망원경이 비추는 것은 언제나 조금 전의 별이다. 지금은 스스로 보아야 한다.','별을 잇는 실은 끊어지지 않는 실이 아니라 다시 매듭지을 수 있는 실이었다.','무희가 춤을 멈춘 곳에서 집행자는 검을 내려놓는 법을 배웠다.','멈춘 천구의 안에서도 작은 추가 스스로의 무게로 흔들렸다.','새벽의 기록에는 영웅의 이름보다 빵과 붕대의 수량이 많았다.','왕관의 무게는 금의 무게가 아니라 책임져야 할 이름의 무게였다.','관측선 너머에는 지도 대신 앞으로 써야 할 여백이 펼쳐진다.','새벽은 누군가 혼자 얻는 칭호가 아니다. 함께 돌아온 이들이 부르는 시간이다.']}
];
export const EXPEDITION_ZONES=PROVINCES.flatMap(p=>p.names.map((name,i)=>({
 id:`${p.id}_reach_${i}`,name,subtitle:`${p.name} · ${p.motto}`,province:p.id,sector:i,
 minLevel:Math.min(30,p.level+(i===8?3:i>=5?2:i>=2?1:0)),
 width:128+(i%3===2?32:0),height:96+(i%3===1?16:0),
 theme:p.theme,weather:p.weather,seed:p.seed+i*137,spawn:[18,(96+(i%3===1?16:0))-18],
 music:p.id==='meadow'?'forest':'ruins',expedition:true,mobCount:56,
 color:{meadow:'#b3cd7c',coast:'#7ed4dc',desert:'#e0bd78',swamp:'#adb37b',frost:'#b4dce8',sky:'#ada6eb',abyss:'#bc8ed5',observatory:'#ecd4a2'}[p.id]
})));
export const expeditionId=(province,index)=>`${province}_reach_${index}`;
export const pointId=(province,index,kind='tablet')=>`${expeditionId(province,index)}_${kind}`;
export const LANDMARKS=EXPEDITION_ZONES.flatMap(z=>{
 const p=PROVINCES.find(p=>p.id===z.province),i=z.sector;
 return [
  {id:z.id+'_camp',kind:'camp',zone:z.id,name:p.keeper+'의 야영지',x:18*32+16,y:(z.height-18)*32+16,
   text:`${p.keeper}: “${p.motto}. 우선 귀환석에 손을 얹어. 여기는 돌아올 수 있는 자리니까.”`,sprite:'campfire'},
  {id:z.id+'_tablet',kind:'tablet',zone:z.id,name:['개척자의 돌판','물결의 편지','태양왕의 명부','뿌리의 기록','얼어붙은 일지','바람의 악보','사라진 이름','성좌의 서문'][PROVINCES.indexOf(p)],
   x:Math.floor(z.width*.27)*32+16,y:Math.floor(z.height*.24)*32+16,text:p.fragments[i],sprite:'relic_stone'},
  {id:z.id+'_watch',kind:'watch',zone:z.id,name:z.name+' 관측 표식',x:Math.floor(z.width*.77)*32+16,y:Math.floor(z.height*.27)*32+16,
   text:`남겨진 순찰 기록: ${p.fragments[(i+3)%9]} 다음 순찰대에게 이 길의 상태를 전해 달라는 부탁이 적혀 있다.`,sprite:'rune'},
  {id:z.id+'_trial',kind:'trial',zone:z.id,name:z.name+' 기억의 제단',x:Math.floor(z.width*.76)*32+16,y:Math.floor(z.height*.74)*32+16,
   text:`세 번의 기억이 깨어나면 이 땅의 파수꾼이 응답한다. 동료와 함께 도전할 수 있으며, 실패해도 다시 시작할 수 있다.`,sprite:'altar'}
 ];
});
export function installExpeditions({ZONES,MONSTERS,ITEMS,RECIPES}){
 ITEMS.wayfarer_seal={name:'길손의 증표',type:'material',icon:'charm',rarity:'rare',sell:15,desc:'야영지 의뢰와 기억의 시련에서 얻습니다. 대륙 장비 제작에 사용합니다.'};
 for(const z of EXPEDITION_ZONES){
  const base=ZONES[z.province];
  ZONES[z.id]={...z,mobTypes:base.mobTypes,boss:base.boss};
 }
 // Three new regional utility recipes; use existing equipment art rather than claiming new artwork.
 ITEMS.atlas_coat={name:'아득한 길의 외투',type:'gear',slot:'armor',icon:'armor',rarity:'epic',def:24,hp:180,mp:40,level:18,sell:900};
 ITEMS.pilgrim_charm={name:'수천 걸음의 매듭',type:'gear',slot:'charm',icon:'charm',rarity:'epic',hp:110,atk:18,mp:40,level:18,sell:800};
 ITEMS.memory_crown={name:'돌아온 자의 성물',type:'gear',slot:'charm',icon:'charm',rarity:'legendary',hp:160,atk:24,mp:65,level:27,sell:1400};
 RECIPES.push(
  {id:'atlas_coat',name:'아득한 길의 외투',output:'atlas_coat',count:1,gold:1100,cost:{wayfarer_seal:12,pelt:20,ore:15},level:18},
  {id:'pilgrim_charm',name:'수천 걸음의 매듭',output:'pilgrim_charm',count:1,gold:1000,cost:{wayfarer_seal:15,relic_dust:10,wood:15},level:18},
  {id:'memory_crown',name:'돌아온 자의 성물',output:'memory_crown',count:1,gold:2200,cost:{wayfarer_seal:35,astral:15,world_token:5},level:27}
 );
}
export function atlasTotals(ZONES){
 const publicZones=Object.values(ZONES).filter(z=>!z.challenge);
 // Keep "old" anchored to the original twelve regions when later roads arrive.
 const old=publicZones.filter(z=>!z.expedition&&!z.endgame).reduce((n,z)=>n+z.width*z.height,0);
 const tiles=publicZones.reduce((n,z)=>n+z.width*z.height,0);
 return {regions:publicZones.length,expeditions:EXPEDITION_ZONES.length,landmarks:LANDMARKS.length,
   tiles,oldTiles:old,areaRatio:tiles/old};
}
