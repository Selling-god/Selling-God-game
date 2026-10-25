/**
 * Starfall Online 2.0: data-driven professions and frontier.
 * Gameplay uses server-authoritative unlock conditions in server/progression.js.
 */
import {xpRequired,MAX_LEVEL} from './rpg.js';
import {SPECIALTIES} from './class-specialties.js';
export const JOB_TIERS = {
  common: {name:'일반',color:'#9ecbb2'}, rare:{name:'희귀',color:'#83b9e8'},
  epic:{name:'영웅',color:'#c4a3ea'}, hidden:{name:'히든',color:'#efc481'}
};
// id, name, family, tier, unlock hint, signature, defensive technique, ultimate, combat identity
// Profession-bound starter attacks: the first skill is no longer the same
// generic sword slash / arrow / orb under 38 different class portraits.
const JOB_BASIC_NAMES=Object.freeze({
 guardian:'서약검의 일격',ranger:'바람깃 사격',mage:'성흔 탄환',
 rogue:'어둠의 쌍단검',priest:'성서의 광휘',lancer:'전장의 창끝',
 monk:'철권 연타',herbalist:'가시씨앗',miner:'달철 곡괭이',
 berserker:'광전사의 양손도끼',paladin:'축복의 성검',sentinel:'철벽 방패격',
 sniper:'매의 눈 저격',beastwarden:'야수 송곳니',spellblade:'각인된 마검',
 pyromancer:'응축 불씨',cryomancer:'서리창 투척',druid:'나무뿌리 찌르기',
 bard:'현의 울림',alchemist:'비약 유리탄',engineer:'압축 톱니탄',
 rune_knight:'고대 룬 대검',shadowdancer:'잔영 쌍검',stormcaller:'뇌광 찌르기',
 necromancer:'망령 수확',chronomancer:'시곗바늘 파동',spiritwalker:'정령 인도 화살',
 dragonknight:'용아 창격',stargazer:'성좌의 궤적',warlord:'지휘검의 일격',
 voidwalker:'공허 발톱',eclipse_reaper:'월식 낫 베기',phoenix_heir:'불사조의 깃불',
 tide_oracle:'심해 삼지창',starweaver:'별실 투사',nameless_king:'무명의 왕검',
 dawn_architect:'새벽 설계탄',abyss_shepherd:'심연 목자 지팡이'
});
const JOB_ROWS = [
 ['guardian','서약기사','guardian','common','작은 생명을 위협하는 것들을 물리쳐 보세요.','반월 베기','별빛 수호','서약의 심판','shield'],
 ['ranger','바람추적자','ranger','common','숲에서 사냥의 발자국을 남겨 보세요.','바람 화살','숲의 숨결','유성우','haste'],
 ['mage','성흔술사','mage','common','숲의 별불을 찾아 첫 탐험을 마치세요.','성운 폭발','시간의 틈','낙성','mana'],
 ['rogue','그림자 도적','guardian','common','누군가 숨겨 둔 보물을 찾아 보세요.','기습 찌르기','연막 걸음','그림자 난무','crit'],
 ['priest','새벽 사제','mage','common','상처를 돌보고 약초를 모아 보세요.','빛의 세례','회복의 기도','새벽 찬가','healer'],
 ['lancer','들판의 창병','guardian','common','새로운 초원에서 전투 경험을 쌓아 보세요.','관통 돌진','굳건한 자세','철벽 돌파','pierce'],
 ['monk','순례 수도사','guardian','common','한 곳에 머무르지 말고 여러 길을 걸어 보세요.','연환권','명상','백보신권','drain'],
 ['herbalist','숲의 약초사','mage','common','별잎 약초를 손수 채집해 보세요.','가시 덩굴','약초 처방','생명의 정원','healer'],
 ['miner','달철 광부','guardian','common','단단한 광석 속에 답이 있습니다.','곡괭이 강타','돌의 피부','지층 붕괴','stun'],
 ['berserker','붉은 광전사','guardian','rare','서약을 익힌 뒤 사냥에 몰두하세요.','핏빛 회전','전장의 포효','폭주 난격','drain'],
 ['paladin','광휘의 성기사','guardian','rare','서약과 치유, 두 길을 이해하세요.','광휘 참격','수호의 기도','성역의 검','healer'],
 ['sentinel','철벽 수호자','guardian','rare','수호자의 심장과 대장장이의 손길이 필요합니다.','방패 밀치기','강철 요새','거인의 방벽','shield'],
 ['sniper','황야 저격수','ranger','rare','바람의 길을 익히고 바닷가를 탐험하세요.','심호흡 조준','매의 눈','일점관통','crit'],
 ['beastwarden','야수 감시자','ranger','rare','어스름 늑대의 습성을 관찰하세요.','늑대의 송곳니','야생의 숨','맹수의 울음','slow'],
 ['spellblade','룬 마검사','guardian','rare','검과 별의 언어를 함께 배워야 합니다.','마력 검풍','룬 결계','삼중 마검','mana'],
 ['pyromancer','불꽃 마도사','mage','rare','성흔을 익힌 뒤 사막의 열기를 만나세요.','불꽃 파동','불씨 장막','홍염 폭풍','burn'],
 ['cryomancer','서리 마도사','mage','rare','차가운 설원에 봉인된 흔적을 찾으세요.','서리 화살','빙결 장막','백야의 눈보라','slow'],
 ['druid','늪의 드루이드','mage','rare','약초의 길을 익히고 습지의 기억을 찾아보세요.','포자 폭발','숲의 재생','거목의 심판','poison'],
 ['bard','여행 음유시인','ranger','rare','많은 길과 이름 없는 비석이 노래를 가르칩니다.','불협화음','여행자의 합창','별의 교향곡','healer'],
 ['alchemist','달빛 연금술사','mage','rare','직접 만든 물약과 채집의 기록이 필요합니다.','연성 폭탄','회복 증류','현자의 섬광','poison'],
 ['engineer','유적 기공사','ranger','rare','광석과 제작, 유적의 장치가 만나는 곳을 찾으세요.','톱니탄','보호 장치','집속 포격','stun'],
 ['rune_knight','고대 룬기사','guardian','epic','마검의 숙련과 유적의 수호자를 넘어야 합니다.','룬 폭쇄','시간의 갑옷','고대의 판결','stun'],
 ['shadowdancer','밤의 무희','guardian','epic','그림자의 길 끝에서 여러 봉인을 찾아보세요.','잔영 칼날','달그림자','밤의 무도','crit'],
 ['stormcaller','폭풍 소환사','mage','epic','하늘섬의 번개와 폭풍의 지배자를 마주하세요.','연쇄 낙뢰','바람의 장막','천둥 심판','stun'],
 ['necromancer','망령술사','mage','epic','늪의 기억과 심연의 망령을 이해하세요.','영혼 수확','생명 흡수','망자의 밤','drain'],
 ['chronomancer','시간술사','mage','epic','서리의 시간과 천문대의 시계를 함께 읽으세요.','시간 파열','정지의 결계','되감는 별','slow'],
 ['spiritwalker','정령 순례자','ranger','epic','초원부터 하늘까지 세계를 걸으며 생명을 돌보세요.','정령 화살','생명의 합창','사계의 축복','healer'],
 ['dragonknight','용혈기사','guardian','epic','광전사의 길에서 용의 비늘을 손에 넣으세요.','용아 참격','용혈 각성','화룡의 진격','burn'],
 ['stargazer','별의 관측자','mage','epic','성흔을 익히고 천문대에서 별들의 기록을 읽으세요.','성좌 연결','별의 회복','초신성','mana'],
 ['warlord','황혼 지휘관','guardian','epic','다양한 전투와 의뢰를 이끈 자의 길입니다.','진군의 검','전장의 합창','승리의 깃발','healer'],
 ['voidwalker','공허를 걷는 자','ranger','hidden','세상 바깥의 빈 자리를 읽은 자에게만 길이 열린다.','공허 균열','공간 접기','경계 소거','crit'],
 ['eclipse_reaper','월식의 집행자','guardian','hidden','달의 눈물과 밤의 춤, 검은 별의 서약.','월식 낫','어둠의 포옹','마지막 초승달','drain'],
 ['phoenix_heir','불사조의 계승자','mage','hidden','재와 불과 잊힌 이름을 잇는 여정.','불사조 날개','재생의 불씨','다시 뜨는 태양','burn'],
 ['tide_oracle','심해의 예언자','mage','hidden','바다가 숨긴 문장들은 순서대로 읽어야 한다.','심해의 파동','해류의 치유','만조의 예언','healer'],
 ['starweaver','별을 엮는 자','mage','hidden','흩어진 별의 기록이 하나가 될 때.','성운 직조','별실의 결계','새벽의 직물','mana'],
 ['nameless_king','이름 없는 왕','guardian','hidden','모든 땅과 네 거인을 기억하는 자에게 왕관은 이름을 묻는다.','이름 없는 검','왕의 맹세','만왕의 새벽','shield'],
 ['dawn_architect','여명의 설계자','mage','hidden','흩어진 여덟 세계의 기록을 모아 빛의 기계를 완성한다.','태양 기어','광휘 장벽','창세 재설계','mana'],
 ['abyss_shepherd','심연의 목동','ranger','hidden','경계의 이름을 모두 외우고도 빈 곳을 지키는 자.','혼령의 고리','그림자 인도','침묵의 무리','drain']
];
export const JOB_HINTS=Object.fromEntries(JOB_ROWS.map(r=>[r[0],r[4]]));
// The original routes and every profession story retain their existing gates.
// These roads extend beyond the observatory with real enemy/gear level bands.
export const ENDGAME_REGIONS=[
 {id:'sunscar',name:'태양흔 고원',subtitle:'꺼진 태양을 깨우는 첫 원정',level:35,maxLevel:49,parent:'observatory',theme:'desert',visualTheme:'fire',color:'#e9bd79',weather:'sand',
  gearName:'태양흔',materialName:'태양흔 결정',mobNames:['불볕 풍뎅이','금빛 잔영','황혼 선봉기사'],skins:['beetle','wisp','ash_knight'],bossName:'황혼의 거상 · 솔라크',bossSkin:'golem',pattern:'root'},
 {id:'deepsea',name:'심해의 회랑',subtitle:'부서진 조수문 너머의 왕국',level:50,maxLevel:69,parent:'sunscar',theme:'coast',visualTheme:'water',color:'#80cdd9',weather:'stars',
  gearName:'심해',materialName:'심해 진주',mobNames:['심해 껍질사냥꾼','해구의 등불','침몰한 파수병'],skins:['beetle','wisp','skeleton'],bossName:'조수의 수호자 · 네리스',bossSkin:'moon_witch',pattern:'moon'},
 {id:'wildroot',name:'잊힌 거목의 심장',subtitle:'세계의 뿌리를 잠식한 오래된 독',level:70,maxLevel:89,parent:'deepsea',theme:'swamp',visualTheme:'nature',color:'#98c290',weather:'fog',
  gearName:'거목',materialName:'거목의 수액 결정',mobNames:['독안개 새싹','뿌리의 망령','잠식된 거목병'],skins:['slime','wisp','golem'],bossName:'천년 뿌리왕 · 베르단',bossSkin:'moss_guardian',pattern:'root'},
 {id:'clockwork',name:'멈춘 시계의 성채',subtitle:'흘러가지 못한 시간이 쌓이는 곳',level:90,maxLevel:109,parent:'wildroot',theme:'frost',visualTheme:'time',color:'#a9d6e4',weather:'snow',
  gearName:'시계',materialName:'시간의 톱니',mobNames:['초침 사냥개','빙결된 시간불','역행하는 갑주'],skins:['wolf','wisp','ash_knight'],bossName:'정오의 집행자 · 크로넬',bossSkin:'golem',pattern:'dragon'},
 {id:'stormcrown',name:'폭풍왕의 옥좌',subtitle:'부서진 하늘 위로 이어지는 전선',level:110,maxLevel:134,parent:'clockwork',theme:'sky',visualTheme:'thunder',color:'#b4b5ed',weather:'stars',
  gearName:'폭풍왕',materialName:'왕관의 번개',mobNames:['뇌운 풍뎅이','옥좌의 번개','폭풍 근위기사'],skins:['beetle','wisp','ash_knight'],bossName:'천둥왕 · 라그니스',bossSkin:'moon_witch',pattern:'moon'},
 {id:'voidfront',name:'공허의 국경',subtitle:'이름을 잃은 자들이 지키는 마지막 문',level:135,maxLevel:159,parent:'stormcrown',theme:'abyss',visualTheme:'void',color:'#bd91df',weather:'fog',
  gearName:'경계',materialName:'공허의 심장편',mobNames:['경계의 추적자','빈 별의 망령','이름 없는 군단병'],skins:['wolf','wisp','skeleton'],bossName:'문을 삼킨 자 · 아크론',bossSkin:'eclipse_dragon',pattern:'dragon'},
 {id:'astralforge',name:'별을 벼리는 용광로',subtitle:'무너진 성좌를 다시 잇는 불꽃',level:160,maxLevel:179,parent:'voidfront',theme:'observatory',visualTheme:'star',color:'#e8c6a0',weather:'embers',
  gearName:'별벼림',materialName:'별벼림 주괴',mobNames:['별불 파수병','용광로 성운','무너진 성좌기사'],skins:['skeleton','wisp','ash_knight'],bossName:'별의 대장장이 · 아스테르',bossSkin:'golem',pattern:'root'},
 {id:'dawnend',name:'새벽의 끝',subtitle:'모든 별이 돌아오는 마지막 관측선',level:180,maxLevel:200,parent:'astralforge',theme:'observatory',visualTheme:'holy',color:'#f1d99f',weather:'stars',
  gearName:'영원의 새벽',materialName:'영원의 별핵',mobNames:['여명의 추적자','태초의 별불','영원의 수호기사'],skins:['wolf','wisp','ash_knight'],bossName:'마지막 성좌 · 아우렐',bossSkin:'eclipse_dragon',pattern:'dragon'}
].map((z,i)=>({...z,endgame:true,seed:12001+i*1103,gearTier:'end_'+z.id,material:z.id+'_crystal',
 mobs:[z.id+'_hunter',z.id+'_caster',z.id+'_sentinel'],boss:z.id+'_warden'}));
export const FRONTIER = [
 {id:'meadow',name:'별바람 초원',subtitle:'첫 직업이 잠에서 깨어나는 들판',level:2,theme:'meadow',color:'#b3cd7c',weather:'leaves',seed:1901,mobs:['hare','sprout','wolf'],boss:'thorn_stag'},
 {id:'coast',name:'유리빛 해안',subtitle:'파도가 삼킨 문장을 찾아서',level:6,theme:'coast',color:'#7ed4dc',weather:'stars',seed:2202,mobs:['crab','siren','shell_guard'],boss:'coral_queen'},
 {id:'desert',name:'잊힌 모래 왕국',subtitle:'지워진 이름을 품은 모래',level:9,theme:'desert',color:'#e0bd78',weather:'sand',seed:3303,mobs:['scarab','sand_wraith','sand_guard'],boss:'sand_pharaoh'},
 {id:'swamp',name:'안개버섯 습지',subtitle:'뿌리 아래 잠든 오래된 기억',level:10,theme:'swamp',color:'#adb37b',weather:'fog',seed:4404,mobs:['spore','bog_wisp','mud_golem'],boss:'spore_matron'},
 {id:'frost',name:'백야 설원',subtitle:'시간마저 얼어붙은 밤',level:13,theme:'frost',color:'#b4dce8',weather:'snow',seed:5505,mobs:['ice_wolf','frost_wisp','ice_guard'],boss:'snow_sentinel'},
 {id:'sky',name:'천둥의 하늘섬',subtitle:'구름 위에서 이어지는 발자국',level:16,theme:'sky',color:'#ada6eb',weather:'stars',seed:6606,mobs:['storm_wisp','sky_guard','thunder_beetle'],boss:'sky_seraph'},
 {id:'abyss',name:'침묵의 심연',subtitle:'누군가 남겨 둔 마지막 경계',level:21,theme:'abyss',color:'#bc8ed5',weather:'fog',seed:7707,mobs:['void_wisp','hollow_knight','abyss_wolf'],boss:'abyss_keeper'},
 {id:'observatory',name:'무너진 천문대',subtitle:'별의 끝에서 다시 시작되는 이야기',level:25,theme:'observatory',color:'#ecd4a2',weather:'stars',seed:8808,mobs:['star_guard','astral_wisp','clock_golem'],boss:'orion'},
 ...ENDGAME_REGIONS
];
export const WORLD_BOSSES=[
 {id:'tempest',minute:0,type:'world_tempest',zone:'meadow',name:'폭풍의 거신 · 아스트론',level:5,color:'#c4d9a0',desc:'번개 원과 넓은 충격파를 번갈아 피하세요.'},
 {id:'leviathan',minute:15,type:'world_leviathan',zone:'coast',name:'해류의 지배자 · 네레이드',level:10,color:'#8edee5',desc:'교차하는 해류와 밀려오는 고리를 살펴보세요.'},
 {id:'glacier',minute:30,type:'world_glacier',zone:'frost',name:'빙하의 심장 · 이스카',level:15,color:'#c2e5f0',desc:'차례로 얼어붙는 바닥과 직선 빙창을 피하세요.'},
 {id:'eclipse',minute:45,type:'world_eclipse',zone:'abyss',name:'경계의 포식자 · 에레보스',level:22,color:'#d19aeb',desc:'생명력이 낮아지면 더 빠른 고리와 낙성이 펼쳐집니다.'}
];
export const EVENT_DURATION_MS=10*60*1000;
export const RELICS=[
 ['forest_leaf','forest','낡은 숲의 비석','바람은 초원으로, 뿌리는 늪으로 이어진다.'],
 ['ruins_rune','ruins','부서진 룬석','검과 별이 만날 때 돌의 기억이 깨어난다.'],
 ['citadel_ash','citadel','재 속의 문장','불꽃의 이름은 모래 아래에서도 사라지지 않는다.'],
 ['meadow_song','meadow','바람의 노래돌','여행자의 노래는 낯선 길을 지날 때마다 길어진다.'],
 ['meadow_seed','meadow','잠든 씨앗','작은 생명도 기억하는 사람을 알아본다.'],
 ['coast_shell','coast','첫 번째 조개문','먼저 파도의 입을 열어라. 그다음 물 아래의 기억을 찾아라.'],
 ['coast_memory','coast','물 아래의 기억','첫 문장의 다음 장. 세 번째 문장은 모래가 기억한다.'],
 ['desert_name','desert','지워진 이름','왕은 자신의 이름을 버리고 세상의 이름을 기억했다.'],
 ['desert_sun','desert','태양의 잔','바다의 두 문장을 읽었다면 심연에서 마지막 물결을 찾아라.'],
 ['swamp_root','swamp','뿌리의 기억','여기엔 죽은 별과 아직 숨 쉬는 땅의 이야기가 함께 잠들어 있다.'],
 ['swamp_spore','swamp','꿈꾸는 포자','회복도 공격도 모두 땅이 빌려준 힘이다.'],
 ['frost_clock','frost','얼어붙은 시계','멈춘 시간을 읽은 뒤 하늘 위 시곗바늘을 찾아라.'],
 ['frost_flame','frost','꺼지지 않는 불씨','모래와 재와 얼음 속의 불. 세 조각은 같은 날개였다.'],
 ['sky_bell','sky','폭풍의 종','천둥의 이름을 듣고 거인의 발걸음을 멈추게 하라.'],
 ['sky_clock','sky','구름 시곗바늘','눈밭의 시계가 천문대의 별을 향해 돌기 시작한다.'],
 ['abyss_gate','abyss','경계의 문','문은 바람의 노래, 달의 룬, 멈춘 시계의 순서로 기억한다.'],
 ['abyss_tide','abyss','마지막 물결','조개, 물의 기억, 태양의 잔. 이제 바다의 문장이 완성된다.'],
 ['observatory_star','observatory','흩어진 성좌','여러 땅의 별을 모아 마지막 별의 약속을 지켜라.'],
 ['observatory_crown','observatory','이름 없는 왕관','모든 길과 네 거인을 기억하는 자에게 질문을 건넨다.'],
 ['observatory_dawn','observatory','새벽의 기록','불씨가 날개가 되고 별의 실이 새벽을 엮는다.']
].map(([id,zone,name,text],i)=>({id,zone,name,text,x:(i%2?39:13)*32+16,y:(i%2?28:18)*32+16}));
export const DAILY_TASKS=[
 {id:'hunt',name:'오늘의 토벌',desc:'아무 몬스터나 25마리 처치',metric:'kills',goal:25,gold:260,xp:300,items:{potion:5}},
 {id:'gather',name:'보급대 지원',desc:'자원 12회 채집',metric:'gather',goal:12,gold:220,xp:160,items:{mana:5}},
 {id:'boss',name:'위험한 발자국',desc:'지역 보스 또는 월드 보스 1회 처치 참여',metric:'bosses',goal:1,gold:450,xp:400,items:{world_token:1}}
];
export const ACHIEVEMENTS=[
 {id:'first_job',name:'나만의 첫 길',metric:'jobs',goal:2,gold:100},
 {id:'jobs10',name:'열 갈래 가능성',metric:'jobs',goal:11,gold:800},
 {id:'hunt100',name:'길을 여는 검',metric:'kills',goal:100,gold:400},
 {id:'hunt500',name:'숲의 전설',metric:'kills',goal:500,gold:1600},
 {id:'explorer',name:'여섯 땅의 여행자',metric:'visited',goal:6,gold:500},
 {id:'atlas',name:'세상의 끝을 본 자',metric:'visited',goal:12,gold:1400},
 {id:'relics5',name:'잊힌 문장 수집가',metric:'relics',goal:5,gold:350},
 {id:'relics20',name:'기억의 도서관',metric:'relics',goal:20,gold:2000},
 {id:'craft10',name:'손끝의 기적',metric:'crafted',goal:10,gold:600},
 {id:'boss10',name:'거인의 벗',metric:'bosses',goal:10,gold:1000},
 {id:'world4',name:'네 하늘의 증인',metric:'worldKinds',goal:4,gold:2000},
 {id:'hidden',name:'이름 없는 길',metric:'hidden',goal:1,gold:1200},
 {id:'level50',name:'심해로 향하는 원정대',metric:'level',goal:50,gold:3000},
 {id:'level100',name:'백 번의 새벽',metric:'level',goal:100,gold:6000},
 {id:'level200',name:'마지막 성좌의 여행자',metric:'level',goal:200,gold:12000}
];

export function installExpansion({CLASSES,ITEMS,MONSTERS,ZONES,NPCS,QUESTS,RECIPES,SHOP}){
 const base=structuredClone(CLASSES);
 CLASSES.novice={...structuredClone(base.guardian),name:'길 잃은 모험가',short:'무직',sprite:'novice',family:'guardian',tier:'novice',color:'#c5cbb9',
  motto:'아직 정해지지 않았기에, 모든 길이 열려 있습니다.',
  desc:'모두 같은 모험가로 시작합니다. 사냥·채집·탐험에서 길을 찾고 마을에서 전직하세요.',hp:125,mp:85,atk:14,def:3,speed:170,
  passive:{},passiveText:'직업을 자유롭게 발견할 수 있습니다.',
  skills:[
   {...base.guardian.skills[0],name:'서툰 검격'},
   {...base.guardian.skills[1],name:'힘껏 휘두르기',power:1.6,cd:4200},
   {...base.guardian.skills[2],name:'응급 붕대',shield:0,heal:.22,cd:13000},
   {...base.guardian.skills[3],name:'모험가의 용기',power:2.8,cd:23000}
 ]};
 const colors=['#e7bd82','#8fceab','#b7a0ee','#b49bc8','#f3dda6','#bfc69c','#d3a17a','#afdca3','#a7b8c6',
 '#e48d8d','#efcf8b','#92b4c8','#acccaa','#b3c49e','#bf9fdd','#efaa79','#a9dcec','#abc69b','#e3b7cf','#b5d18d','#b5c1c8',
 '#cea9ef','#ba91d3','#adb9ec','#9dbb9e','#b3cbef','#bce4ba','#e6a28a','#c4c0ed','#e0c89c',
 '#cba3ef','#d5a6df','#f3c17f','#a8e0dd','#eee0b7','#ebcb93'];
 JOB_ROWS.forEach((r,index)=>{
  const [id,name,family,tier,hint,q,e,ult,identity]=r,b=structuredClone(base[family]);
  const grade={common:0,rare:1,epic:2,hidden:2}[tier],melee=family==='guardian';
  const passive=identity==='crit'?{crit:7+grade*2}:identity==='drain'?{lifesteal:.045+grade*.012}:identity==='healer'?{healBonus:.14+grade*.04}:
    identity==='mana'?{manaRegen:2+grade}:identity==='shield'?{reduction:.06+grade*.025}:identity==='haste'?{speed:8+grade*2}:identity==='pierce'?{armorPierce:.45}:identity==='stun'?{def:2+grade}:identity==='burn'?{atk:2+grade}:{hp:14+grade*6};
  const passiveText=identity==='crit'?`치명타 확률 +${passive.crit}%`:identity==='drain'?`준 피해의 ${Math.round(passive.lifesteal*100)}% 회복`:identity==='healer'?`회복 기술 강화 · 주변 파티원도 회복`:identity==='mana'?`초당 마나 회복 +${passive.manaRegen}`:identity==='shield'?`받는 피해 ${Math.round(passive.reduction*100)}% 감소`:identity==='haste'?`이동 속도 +${passive.speed}`:identity==='pierce'?'적 방어력의 45% 무시':identity==='stun'?`방어력 +${passive.def} · 기술에 짧은 기절`:identity==='burn'?`공격력 +${passive.atk} · 화상 기술`:`최대 체력 +${passive.hp} · 독 기술`;
  let skills=[
   {...b.skills[0],name:JOB_BASIC_NAMES[id],cd:family==='guardian'?560:family==='ranger'?620:700},
   {...b.skills[1],name:q,cd:4400+(index%3)*300,power:1.8+grade*.12,mp:12+grade*2,range:melee?140:310,radius:identity==='crit'?0:melee?125:105,center:melee?'self':'target'},
   {...b.skills[2],name:e,cd:12500,mp:18+grade*2,heal:identity==='healer'?.32:.14,shield:['shield','stun','mana'].includes(identity)?.3:0,haste:['haste','crit','slow'].includes(identity)?1.28:0,partyHeal:identity==='healer',desc:''},
   {...b.skills[3],name:ult,cd:24000+(index%3)*900,power:3.2+grade*.23,mp:30+grade*3,range:melee?210:350,radius:identity==='crit'?55:185,center:melee?'self':'target'}
  ];
  if(identity==='burn'||identity==='poison'){skills[1].dot={ticks:4,power:.18,kind:identity};skills[3].dot={ticks:5,power:.22,kind:identity};}
  if(identity==='slow'){skills[1].slow=3500;skills[3].slow=5000;}
  if(identity==='stun'){skills[1].stun=650;skills[3].stun=1100;}
  if(identity==='crit'){skills[1].power=2.75+grade*.1;skills[3].power=5.0+grade*.2;}
  if(identity==='drain'){skills[1].lifesteal=.14;skills[3].lifesteal=.22;}
  if(identity==='pierce'){skills[1].range=190;skills[3].range=240;}
  for(const s of skills){
   s.desc=s.power===0?`자신의 체력을 ${Math.round(s.heal*100)}% 회복${s.partyHeal?'하고 가까운 파티원도 치유합니다.':'.'}${s.shield?' 5초간 피해 감소.':''}${s.haste?' 4.5초간 이동 가속.':''}`:
    `${s.radius?'범위':'단일'} 공격 · 공격력 ${Math.round(s.power*100)}%${s.dot?' · '+(identity==='burn'?'화상':'독')+' 지속 피해':''}${s.slow?' · 둔화':''}${s.stun?' · 짧은 기절(보스 제외)':''}${s.lifesteal?' · 흡혈':''}`;
  }
  if(SPECIALTIES[id]){skills[1].desc+=' · '+SPECIALTIES[id][1];skills[2].desc+=' · '+SPECIALTIES[id][0]+' 연계';skills[3].desc+=' · '+SPECIALTIES[id][0]+' 강화';}
  CLASSES[id]={...b,name,short:name,sprite:id,family,tier,color:colors[index],motto:hint,mechanic: SPECIALTIES[id]?.[0],mechanicDesc:SPECIALTIES[id]?.[1],
    desc:passiveText+' · '+(melee?'근접 전투':family==='ranger'?'원거리 사격':'원거리 마법'),
    hp:b.hp+grade*8,mp:b.mp+grade*5,atk:b.atk+grade,def:b.def,speed:b.speed,identity,passive,passiveText,skills};
 });
 // Discovery is a side-grade system: a hidden class is unusual, not an automatic win.
 ITEMS.world_token={name:'거인의 인장',type:'material',icon:'moon',rarity:'epic',sell:60,desc:'정시 월드 보스와 일일 의뢰에서 얻는 제작 재료.'};
 ITEMS.relic_dust={name:'기억의 가루',type:'material',icon:'shard',rarity:'rare',sell:12,desc:'고대 유물을 읽으면 얻는 제작 재료.'};
 const mats=[['salt','파도의 결정','shard'],['sand','황금 모래','ore'],['spore_dust','안개 포자','herb'],['ice','얼음 심장 조각','shard'],['thunder','번개 결정','orb'],['void','공허의 파편','moon'],['astral','별의 핵','nova']];
 for(const [id,name,icon]of mats)ITEMS[id]={name,type:'material',icon,rarity:'rare',sell:22,desc:'새로운 지역의 제작과 탐험에 사용됩니다.'};
 for(const [tier,level,atk,rarity]of [['horizon',16,52,'epic'],['astral',24,74,'legendary']]){
  for(const [family,part,label]of [['guardian','sword','검'],['ranger','bow','활'],['mage','staff','지팡이']]){
   const id=`${tier}_${part}`;
   ITEMS[id]={name:(tier==='horizon'?'지평선의 ':'성좌의 ')+label,type:'gear',slot:'weapon',class:family,icon:part,rarity,atk:atk+(family==='mage'?4:0),crit:8,level,sell:900};
  }
  RECIPES.push({id:tier+'_weapon',name:tier==='horizon'?'지평선 무기':'성좌 무기',weaponTier:tier,count:1,gold:tier==='horizon'?900:1800,cost:tier==='horizon'?{ice:8,thunder:6,world_token:2}:{void:10,astral:8,world_token:4},level});
 }
 ITEMS.explorer_coat={name:'지평선 탐험복',type:'gear',slot:'armor',icon:'armor',rarity:'epic',def:22,hp:150,mp:25,level:16,sell:800};
 ITEMS.astral_armor={name:'성좌 수호의',type:'gear',slot:'armor',icon:'armor',rarity:'legendary',def:30,hp:220,level:24,sell:1400};
 ITEMS.relic_charm={name:'여행자의 기억',type:'gear',slot:'charm',icon:'charm',rarity:'epic',hp:90,atk:15,mp:30,level:16,sell:700};
 RECIPES.push(
  {id:'explorer_coat',name:'지평선 탐험복',output:'explorer_coat',count:1,gold:800,cost:{pelt:12,ice:8,salt:8},level:16},
  {id:'astral_armor',name:'성좌 수호의',output:'astral_armor',count:1,gold:1600,cost:{astral:12,void:8,world_token:3},level:24},
  {id:'relic_charm',name:'여행자의 기억',output:'relic_charm',count:1,gold:750,cost:{relic_dust:8,spore_dust:8,sand:8},level:16}
 );
 const mobRows=[
  ['hare','별꼬리 토끼','wolf',2,'pelt'],['sprout','바람 새싹','slime',3,'herb'],
  ['crab','유리껍질 게','beetle',6,'salt'],['siren','물안개 정령','wisp',7,'salt'],['shell_guard','조개 파수꾼','golem',8,'ore'],
  ['scarab','태양 풍뎅이','beetle',9,'sand'],['sand_wraith','모래 망령','wisp',10,'sand'],['sand_guard','유리모래 기사','skeleton',11,'ore'],
  ['spore','꿈포자','slime',10,'spore_dust'],['bog_wisp','늪의 등불','wisp',11,'spore_dust'],['mud_golem','뿌리 골렘','golem',12,'wood'],
  ['ice_wolf','서릿발 늑대','wolf',13,'ice'],['frost_wisp','눈꽃 정령','wisp',14,'ice'],['ice_guard','백야의 파수병','skeleton',15,'ore'],
  ['storm_wisp','번개 정령','wisp',16,'thunder'],['sky_guard','구름 기사','ash_knight',17,'thunder'],['thunder_beetle','천둥 풍뎅이','beetle',18,'thunder'],
  ['void_wisp','침묵의 별불','wisp',21,'void'],['hollow_knight','텅 빈 갑주','ash_knight',22,'void'],['abyss_wolf','경계 사냥개','wolf',23,'pelt'],
  ['star_guard','성좌 파수병','skeleton',25,'astral'],['astral_wisp','흩어진 성운','wisp',26,'astral'],['clock_golem','시계 석상','golem',27,'ore']
 ];
 for(const [id,name,skin,level,material]of mobRows){
  const b=MONSTERS[skin];
  MONSTERS[id]={...b,name,sprite:id,skin,level,hp:Math.round(44+level*19+level*level*.8),atk:7+level*3,def:Math.floor(level*.8),xp:18+level*17,gold:[8+level*3,14+level*4],material};
 }
 const bossNames=['가시뿔 · 에녹','산호 여왕 · 멜리','모래 왕 · 아문','포자 여왕 · 미레','백야 감시자 · 폴라','하늘의 수호자 · 세라','심연 문지기 · 오블','성좌의 끝 · 오리온'];
 FRONTIER.filter(z=>!z.endgame).forEach((z,i)=>{
  ZONES[z.id]={name:z.name,subtitle:z.subtitle,minLevel:z.level,width:56,height:44,theme:z.theme,color:z.color,spawn:[28,37],weather:z.weather,music:i%2?'ruins':'forest',seed:z.seed,mobTypes:z.mobs,mobCount:22,boss:z.boss};
  const level=z.level+3,skin=['moss_guardian','moon_witch','golem','moss_guardian','golem','moon_witch','eclipse_dragon','moon_witch'][i];
  MONSTERS[z.boss]={...MONSTERS[skin],name:bossNames[i],sprite:z.boss,skin,level,hp:1100+level*230,atk:20+level*3,def:Math.floor(level*.7),xp:300+level*85,gold:[100+level*15,180+level*18],speed:65,range:110,aggro:270,material:z.mobs.map(t=>MONSTERS[t].material)[0],boss:true,radius:30,pattern:i%3===0?'root':i%3===1?'moon':'dragon'};
  QUESTS.push({id:'frontier_'+z.id,name:z.name+'의 부탁',chapter:'탐험',npc:'lia',level:z.level,desc:`${z.name}에서 ${MONSTERS[z.mobs[0]].name} 8마리와 ${MONSTERS[z.mobs[1]].name} 5마리를 처치해 주세요. 마을의 세계지도에서 이동 경로를 확인할 수 있어요.`,
   objectives:[{kind:'kill',target:z.mobs[0],count:8},{kind:'kill',target:z.mobs[1],count:5}],xp:350+z.level*85,gold:160+z.level*35,items:{potion:6,world_token:1},end:'또 하나의 길이 열렸어요. 그 땅의 유물도 읽어 보셨나요? 잊힌 직업의 흔적이 남아 있을 거예요.'});
 });
 installEndgame({ITEMS,MONSTERS,ZONES,QUESTS,RECIPES});
 for(const [i,b]of WORLD_BOSSES.entries()){
  const skin=['golem','moon_witch','moss_guardian','eclipse_dragon'][i];
  MONSTERS[b.type]={...MONSTERS[skin],name:b.name,sprite:b.type,skin,level:b.level,hp:[8500,14000,22000,33000][i],atk:[26,40,58,78][i],def:b.level,speed:65,range:120,aggro:310,xp:1000+b.level*150,gold:[450+b.level*20,700+b.level*25],material:'world_token',boss:true,worldBoss:true,radius:40,pattern:b.id};
 }
 NPCS.push({id:'sorin',name:'소린',role:'길잡이 · 전직',kind:'jobs',sprite:'lia',zone:'town',x:27*32+16,y:23*32+16,dialog:'길은 태어날 때 정해지지 않아. 네가 걸어온 흔적이 새로운 이름이 되어 줄 거야.'});
}

// Hubs and their surrounding expedition sectors use one combat/reward curve.
export function endgameCombatStats(level,rank=0,boss=false){
 const n=Math.min(MAX_LEVEL,Math.max(1,Math.floor(level)));
 return {level:n,hp:Math.round((80+n*26+n*n*.38)*(boss?7:rank===1?.92:rank===2?1.12:1)),
  atk:Math.round((boss?22:12)+n*(boss?6.2:4.6)),def:Math.round(n*(boss?.85:.7)),
  xp:Math.round(boss?xpRequired(n)*.18:xpRequired(n)/36),
  gold:boss?[n*35,n*45]:[20+n*5,35+n*6]};
}
function installEndgame({ITEMS,MONSTERS,ZONES,QUESTS,RECIPES}){
 ENDGAME_REGIONS.forEach((z,index)=>{
  const tier=z.gearTier,level=z.level;
  ITEMS[z.material]={name:z.materialName,type:'material',icon:'shard',rarity:'epic',sell:25+index*5,
   desc:`${z.name}의 몬스터에게서 얻습니다. 이 지역의 장비를 제작할 수 있습니다.`};
  for(const [family,part,label]of [['guardian','sword','검'],['ranger','bow','활'],['mage','staff','지팡이']]){
   ITEMS[`${tier}_${part}`]={name:`${z.gearName}의 ${label}`,type:'gear',slot:'weapon',class:family,icon:part,
    rarity:'legendary',level,atk:Math.round(20+level*3.2)+(family==='mage'?6:0),crit:8,
    sell:level*20,visualTheme:z.visualTheme,visualSet:tier,visualBase:'astral_'+part,desc:`Lv.${level} 원정 무기. 해당 지역의 재료로 제작할 수 있습니다.`};
  }
  ITEMS[tier+'_armor']={name:z.gearName+' 수호의',type:'gear',slot:'armor',icon:'armor',rarity:'legendary',level,
   hp:180+level*9,mp:40+level*2,def:Math.round(12+level*1.05),sell:level*16,visualTheme:z.visualTheme,visualSet:tier,visualBase:'astral_armor'};
  ITEMS[tier+'_charm']={name:z.gearName+'의 약속',type:'gear',slot:'charm',icon:'charm',rarity:'legendary',level,
   hp:80+level*4,mp:30+level,atk:12+Math.round(level*.42),def:Math.round(level*.08),crit:4,sell:level*14,visualTheme:z.visualTheme,visualBase:'dawn_charm'};
  // Materials come from ordinary monsters and the ore nodes in the same map.
  // No world boss, profession or later region is needed to craft the entry set.
  RECIPES.push(
   {id:tier+'_weapon',name:z.gearName+' 무기',weaponTier:tier,count:1,gold:level*45,cost:{[z.material]:8+index*2,ore:6+index},level},
   {id:tier+'_armor',name:ITEMS[tier+'_armor'].name,output:tier+'_armor',count:1,gold:level*35,cost:{[z.material]:7+index,ore:5+index},level},
   {id:tier+'_charm',name:ITEMS[tier+'_charm'].name,output:tier+'_charm',count:1,gold:level*30,cost:{[z.material]:6+index,ore:4+index},level}
  );
  const levels=[level,Math.floor((level+z.maxLevel)/2),z.maxLevel];
  z.mobs.forEach((id,i)=>{
   const n=levels[i],skin=z.skins[i];
   MONSTERS[id]={...MONSTERS[skin],...endgameCombatStats(n,i),name:z.mobNames[i],sprite:skin,skin,
    material:z.material,gearTier:tier,
    boss:false,worldBoss:false};
  });
  const n=Math.min(MAX_LEVEL,z.maxLevel+1),skin=z.bossSkin;
  MONSTERS[z.boss]={...MONSTERS[skin],...endgameCombatStats(n,0,true),name:z.bossName,sprite:skin,skin,
   speed:65,range:110,aggro:280,
   material:z.material,boss:true,worldBoss:false,radius:34,pattern:z.pattern,gearTier:tier,gearCharm:tier+'_charm'};
  ZONES[z.id]={name:z.name,subtitle:`Lv.${level}–${z.maxLevel} · ${z.subtitle}`,minLevel:level,maxLevel:z.maxLevel,
   width:56,height:44,theme:z.theme,color:z.color,spawn:[28,37],weather:z.weather,music:'citadel',seed:z.seed,
   mobTypes:[...z.mobs],mobCount:24,boss:z.boss,endgame:true,gearTier:tier,parent:z.parent};
  QUESTS.push(
   {id:'frontier_'+z.id,name:z.name+'의 첫 발자국',chapter:'후반 원정',npc:'lia',level,
    desc:`${z.name}에서 ${z.mobNames[0]} 8마리와 ${z.mobNames[1]} 5마리를 처치해 주세요. ${ZONES[z.parent]?.name||'이전 원정지'}의 길을 따라 진입할 수 있습니다.`,
    objectives:[{kind:'kill',target:z.mobs[0],count:8},{kind:'kill',target:z.mobs[1],count:5}],
    xp:Math.round(xpRequired(level)*.22),gold:level*45,weaponTier:tier,items:{potion:6,mana:4},
    end:'새 원정 무기를 준비했어요. 현지 결정과 광석으로 방어구도 마련하고 다음 수호자에게 도전해 보세요.'},
   {id:'frontier_'+z.id+'_warden',name:z.bossName+'의 봉인',chapter:'원정 수호자',npc:'lia',level:level+5,requires:'frontier_'+z.id,
    desc:`${z.name} 북동쪽의 ${z.bossName}에게 도전하세요. 경고된 바닥을 피하고 공격이 끝난 틈을 노리세요.`,
    objectives:[{kind:'kill',target:z.boss,count:1}],xp:Math.round(xpRequired(level+5)*.3),gold:level*60,
    items:{[tier+'_armor']:1,[z.material]:4},end:'봉인된 길의 기억을 되찾았어요. 이 수호의와 함께 다음 원정에 나서 주세요.'}
  );
 });
}
