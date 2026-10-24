/**
 * Creature anatomy and encounter intentions. IDs, loot, levels and quest targets
 * remain stable: an identity is installed onto the existing regional species.
 * Client silhouettes and server behaviour consume this same authored catalogue.
 */
export const CREATURE_PALETTES={
 meadow:['#172b25','#435f35','#85ad52','#d3e896','#eff5b7'],
 coast:['#142d3a','#265b70','#4dafb8','#acf0e1','#ffd08d'],
 desert:['#35221d','#845538','#ca9250','#f3d190','#ef7953'],
 swamp:['#252637','#514a5e','#8b9360','#ccd790','#dca9ec'],
 frost:['#1b2b46','#38617d','#77a8c7','#d7f2ef','#91e8ff'],
 sky:['#26233f','#555689','#8d9cd5','#e4e5ff','#ffe28d'],
 abyss:['#211b38','#4b326a','#98659b','#d7b0df','#e77fae'],
 observatory:['#252538','#535870','#a99e7b','#f5e1af','#9eddef'],
 sunscar:['#382123','#8e3d31','#d27536','#f8c16a','#fff3a7'],
 deepsea:['#101f38','#1c4868','#357b9f','#87c9cf','#bceff0'],
 wildroot:['#202e24','#435b3e','#77944b','#b5ce70','#e4ab6f'],
 clockwork:['#262733','#4c5965','#90a3a8','#d8e3dc','#eac17d'],
 stormcrown:['#24233c','#51426f','#8c7fb8','#c9d3ef','#f7e18b'],
 voidfront:['#1d1830','#3f2b53','#76558d','#b28eb9','#ee94bd'],
 astralforge:['#302129','#754037','#bd7154','#f4b682','#fff0bf'],
 dawnend:['#332a39','#786773','#baa880','#f5e0a9','#fff9d6'],
 heaven:['#302b40','#7d819c','#babdd2','#f3eddb','#ffe3a5'],
 inferno:['#2c1721','#703037','#bf5143','#f2995b','#ffdb8d'],
 mirror:['#24233b','#55527d','#9293be','#d1d4eb','#91e5e5']
};

export const ORDINARY_BEHAVIORS={
 pursue:{name:'추격 · 앞발 연격',range:60,windup:620,recover:520,cooldown:1550,hint:'앞발을 들어 올리면 옆으로 피하세요.'},
 charge:{name:'몸을 낮춘 돌진',range:225,windup:950,recover:1000,cooldown:2800,hint:'돌진 방향이 고정된 뒤 옆으로 빠지세요. 벽에 부딪히면 빈틈이 생깁니다.'},
 ranged:{name:'거리 유지 · 조준 사격',range:265,windup:900,recover:650,cooldown:2450,hint:'날아오는 탄을 피하거나 기둥 뒤로 숨으세요.'},
 leap:{name:'웅크리기 · 도약 강타',range:210,windup:1050,recover:950,cooldown:2850,hint:'착지 그림자가 나타나면 그 자리에서 벗어나세요.'},
 burrow:{name:'잠복 · 지면 기습',range:230,windup:1250,recover:1150,cooldown:3400,hint:'흙먼지와 갈라진 지면이 솟아날 위치를 알려 줍니다.'},
 fan:{name:'날개 펼치기 · 부채 사격',range:255,windup:1150,recover:750,cooldown:2700,hint:'발사선 사이의 틈을 찾으세요. 가까울수록 위험합니다.'},
 poison:{name:'부풀기 · 독 웅덩이',range:215,windup:1100,recover:850,cooldown:3300,hint:'독은 남아 있습니다. 안전한 길을 남기며 이동하세요.'},
 summon:{name:'뿌리 내리기 · 동료 부르기',range:235,windup:1350,recover:1100,cooldown:5900,hint:'소환 중에는 움직이지 않습니다. 소환자는 먼저 처치하세요.'},
 guard:{name:'버티기 · 정면 후려치기',range:90,windup:1150,recover:1150,cooldown:2800,hint:'정면을 벗어난 뒤 긴 회복 동작 동안 공격하세요.'}
};

const species=(id,name,form,behavior,features=[],scale=1)=>({id,name,form,behavior,features,scale});
export const REGION_ECOLOGY={
 meadow:[species('hare','별꼬리 도약토끼','hare','leap',['longEars','starTail'],.9),species('sprout','휘파람 씨앗지기','sprout','summon',['leafCrown','rootFeet'],.9),species('wolf','갈기풀 늑대','wolf','pursue',['mane','longTail'])],
 coast:[species('crab','유리집게 옆걸음게','crab','charge',['claws','glassShell']),species('siren','물안개 가오리','manta','fan',['wideFins','ribbonTail']),species('shell_guard','산호뿔 장어','eel','ranged',['coralHorns','segmentedTail'])],
 desert:[species('scarab','태양꼬리 전갈','scorpion','poison',['stinger','claws']),species('sand_wraith','장막날개 독수리','vulture','leap',['bareNeck','raggedWings']),species('sand_guard','유리이빨 모래벌레','worm','burrow',['ringMouth','segments'],1.15)],
 swamp:[species('spore','꿈포자 갓버섯','mushroom','poison',['wideCap','sporeSacs']),species('bog_wisp','등불목 개구리','frog','leap',['throatLamp','longLegs']),species('mud_golem','뿌리등 두꺼비','toad','summon',['rootBack','warts'],1.15)],
 frost:[species('ice_wolf','서리꼬리 여우','fox','charge',['hugeTail','crystalEars']),species('frost_wisp','눈꽃 부엉이','owl','fan',['roundWings','earTufts']),species('ice_guard','빙판 주먹설인','yeti','guard',['heavyArms','iceSpikes'],1.2)],
 sky:[species('storm_wisp','바람깃 하피','harpy','ranged',['wingArms','talons']),species('sky_guard','구름갈기 그리핀','gryphon','leap',['lionBody','beak','wings'],1.1),species('thunder_beetle','천둥 우산해파리','jellyray','fan',['bell','tentacles'])],
 abyss:[species('void_wisp','잠들지 않는 외눈','eye','ranged',['eyelid','tentacles']),species('hollow_knight','비어 있는 방패갑주','knight','guard',['shield','emptyHelm']),species('abyss_wolf','경계 틈새사냥개','hound','burrow',['splitJaw','spineSpikes'])],
 observatory:[species('star_guard','천구 장창인형','automaton','charge',['lance','roundJoints']),species('astral_wisp','별실 관측드론','drone','fan',['lens','orbit']),species('clock_golem','초침 거미공작','spider','summon',['clockFace','eightLegs'],1.05)],
 sunscar:[species('sunscar_hunter','황동턱 도마뱀','lizard','charge',['frill','longTail']),species('sunscar_caster','잿불 깃봉황','phoenix','fan',['crest','flameTail']),species('sunscar_sentinel','해시계 거대전갈','scorpion','burrow',['sundialBack','stinger'],1.25)],
 deepsea:[species('deepsea_hunter','심해 유령해룡','serpent','ranged',['dorsalFins','barbels']),species('deepsea_caster','걸어 다니는 산호','coral','poison',['branchArms','polyps']),species('deepsea_sentinel','해구 요새거북','turtle','guard',['fortressShell','flippers'],1.2)],
 wildroot:[species('wildroot_hunter','가시낫 사마귀','mantis','leap',['scythes','foldedWings']),species('wildroot_caster','울음뿌리 맨드레이크','mandrake','summon',['leafHair','forkedRoot']),species('wildroot_sentinel','썩은 심장 나무거인','treant','poison',['hollowTrunk','branchArms'],1.2)],
 clockwork:[species('clockwork_hunter','태엽 절삭거미','spider','charge',['sawLegs','gearAbdomen']),species('clockwork_caster','역행 추적드론','drone','ranged',['rotors','pendulum']),species('clockwork_sentinel','정오 해머인형','automaton','guard',['hammer','clockFace'],1.15)],
 stormcrown:[species('stormcrown_hunter','뇌운 뿔산양','ram','charge',['spiralHorns','cloudWool']),species('stormcrown_caster','번개깃 거대매','roc','fan',['forkedWings','lightningTail'],1.15),species('stormcrown_sentinel','성벽 가고일','gargoyle','leap',['stoneWings','horns'],1.1)],
 voidfront:[species('voidfront_hunter','이름 없는 키메라','chimera','leap',['threeHeads','serpentTail']),species('voidfront_caster','귀환등 망령','wraith','summon',['hood','lantern']),species('voidfront_sentinel','균열마디 백족충','centipede','burrow',['manyLegs','pincerHead'],1.2)],
 astralforge:[species('astralforge_hunter','별불 도롱뇽','salamander','poison',['embers','flatTail']),species('astralforge_caster','떠도는 화로종','bell','fan',['clapper','vents']),species('astralforge_sentinel','걸어 다니는 모루','anvil','guard',['hammer','stubLegs'],1.1)],
 dawnend:[species('dawnend_hunter','여명 가지뿔 기린','kirin','charge',['branchHorns','ribbonMane']),species('dawnend_caster','새벽빛 연꽃정령','lotus','ranged',['petals','floatingCore']),species('dawnend_sentinel','여섯날개 성문지기','seraph','summon',['sixWings','halo'],1.1)]
};

const move=(kind,name,extra={})=>({kind,name,...extra});
const profile=(name,hint,sequences,extra={})=>({name,hint,sequences,...extra});
// The order of movement, commitment, lingering danger and recovery is authored
// per boss. Shapes only describe readable hit areas; they do not define the AI.
export const BOSS_BEHAVIORS={
 moss_guardian:profile('숲의 뿌리왕','묘목을 정리하고 뿌리 강타 뒤의 빈틈을 노리세요.',[
  [move('slam','뿌리 주먹',{radius:98}),move('summon','떨어진 씨앗',{adds:['slime','beetle']})],
  [move('poison','뿌리의 진액',{radius:75}),move('charge','쓰러지는 고목',{length:220})]]),
 moon_witch:profile('달잠의 기억','낙인이 기억한 자리를 떠나고 책장이나 기둥을 엄폐로 쓰세요.',[
  [move('echo','세 번의 달기억',{count:3,radius:65}),move('retreat','달그림자 뒷걸음')],
  [move('fan','부서진 달조각',{count:5}),move('summon','길 잃은 별의 부름',{adds:['wisp']})]]),
 eclipse_dragon:profile('검은 날개','날개를 접으면 돌진, 펼치면 도약합니다. 불길을 남길 공간을 확보하세요.',[
  [move('charge','별을 가르는 질주',{length:340,trail:true}),move('fan','탄화한 별숨',{count:5})],
  [move('leap','검은 날개의 착지',{radius:100}),move('poison','식지 않는 잿불',{radius:110,theme:'fire'})]]),
 thorn_stag:profile('가시뿔 추격자','뿔의 방향을 확인하고 옆으로 피하세요. 벽에 부딪힌 사슴은 오래 지칩니다.',[
  [move('charge','가시뿔 직진',{length:310}),move('slam','뒷발 털기',{radius:85})],
  [move('leap','울타리 넘기',{radius:85}),move('charge','두 번째 뿔',{length:240})]]),
 coral_queen:profile('조수의 정원사','흡입을 피하고 부채꼴 물살 사이의 틈으로 빠져나가세요.',[
  [move('pull','낮아지는 조수',{radius:190}),move('fan','산호 사이 물살',{count:5,projectileSpeed:160})],
  [move('poison','산호 독조',{radius:86}),move('summon','집게 호위대',{adds:['crab']})]]),
 sand_pharaoh:profile('모래 아래 왕','솟을 자리를 기억하고 모래벌레의 출구를 피해 이동하세요.',[
  [move('burrow','왕의 잠행',{radius:105}),move('fan','유리모래 세례',{count:5})],
  [move('summon','태양의 전갈',{adds:['scarab']}),move('charge','무너지는 왕좌',{length:245})]]),
 spore_matron:profile('포자 번식자','독 웅덩이를 한쪽에 모으고 소환하는 동안 여왕을 공격하세요.',[
  [move('poison','삼중 포자밭',{count:3,radius:68}),move('summon','갓버섯 무리',{adds:['spore']})],
  [move('leap','부풀어 오르는 갓',{radius:110}),move('poison','포자 숨결',{radius:110})]]),
 snow_sentinel:profile('백야의 방패','정면 내려찍기를 옆으로 유도하고 회복 중 등에 접근하세요.',[
  [move('guard','빙판 방패 내려찍기',{width:100,length:160}),move('charge','미끄러지는 거체',{length:300})],
  [move('wave','세 겹 서리파동',{count:3}),move('guard','굳어지는 얼음주먹')]]),
 sky_seraph:profile('풍향 사냥꾼','착지점과 날아오는 깃털을 번갈아 확인하세요. 지형 뒤로 탄을 유도할 수 있습니다.',[
  [move('leap','풍향을 가르는 급강하',{radius:90}),move('fan','흩어진 비행깃',{count:7,spread:1.8})],
  [move('retreat','상승 기류'),move('ranged','집중된 바람창',{count:3})]]),
 abyss_keeper:profile('경계 포식자','잡아당길 범위를 벗어나고, 잠복 흔적과 낙인을 동시에 확인하세요.',[
  [move('pull','경계의 허기',{radius:205}),move('burrow','틈새 포식',{radius:95})],
  [move('echo','잊힌 발자국',{count:3}),move('summon','문 너머 사냥개',{adds:['abyss_wolf']})]]),
 orion:profile('성좌 관측자','관측된 과거 위치를 떠나세요. 드론을 정리하면 사선이 줄어듭니다.',[
  [move('echo','세 좌표 관측',{count:3}),move('fan','성좌 연결선',{count:5})],
  [move('summon','관측 위성 배치',{adds:['astral_wisp']}),move('wave','천구 회전',{count:2})]]),
 sunscar_warden:profile('황혼의 거상','금빛 선이 확정되면 질주를 피하고 남은 열기 밖에서 반격하세요.',[
  [move('charge','태양핵 운반',{length:300,trail:true}),move('guard','황동 모루')],
  [move('poison','채석장의 잔열',{count:3,radius:75,theme:'fire'}),move('leap','붕괴하는 태양',{radius:110})]]),
 deepsea_warden:profile('해구의 압력','흡입을 뒤로 피하고 느린 압력탄을 엄폐물로 흘려보내세요.',[
  [move('pull','압력문 개방',{radius:220}),move('ranged','압축된 해류',{count:3,projectileSpeed:145})],
  [move('summon','진주껍질 호위',{adds:['deepsea_sentinel']}),move('wave','해구의 맥박',{count:3})]]),
 wildroot_warden:profile('일곱 심근','독과 소환을 관리한 뒤, 뿌리가 솟는 자리를 피해 심장에 접근하세요.',[
  [move('summon','갈라진 심근',{adds:['wildroot_caster','wildroot_hunter']}),move('poison','썩은 수액',{count:3,radius:68})],
  [move('burrow','움직이는 뿌리',{radius:115}),move('slam','심장의 맥박',{radius:140})]]),
 clockwork_warden:profile('정오 집행자','해머를 든 뒤 방향을 바꾸지 않습니다. 과거 위치를 따라오는 탄은 계속 움직여 피하세요.',[
  [move('guard','분침 내려찍기',{length:180,width:78}),move('echo','되감긴 발자국',{count:3})],
  [move('charge','초침 전진',{length:260}),move('retreat','태엽 되감기'),move('fan','톱니 배출',{count:5})]]),
 stormcrown_warden:profile('천둥왕의 기수','질주가 끝난 자리에 번개가 남습니다. 날개를 펼친 뒤에는 착지를 기다리세요.',[
  [move('charge','번개 기수',{length:340,trail:true,theme:'thunder'}),move('leap','왕관 낙하',{radius:105})],
  [move('fan','갈라지는 뇌우',{count:7,spread:2.1}),move('summon','폭풍의 독수리',{adds:['stormcrown_caster']})]]),
 voidfront_warden:profile('문을 삼킨 자','흡입과 잠복 뒤의 긴 회복에 공격하세요. 소환된 몸체는 보상을 주지 않습니다.',[
  [move('burrow','문 사이의 이빨',{radius:100}),move('pull','귀환 없는 문',{radius:215})],
  [move('summon','지워진 군단',{adds:['voidfront_hunter','voidfront_sentinel']}),move('echo','이름의 잔향',{count:3})]]),
 astralforge_warden:profile('별의 대장장이','모루 아래에서 벗어나세요. 뜨거운 파편은 기둥에 막히며 화로는 바닥에 남습니다.',[
  [move('guard','별을 벼리는 망치',{length:185,width:110}),move('fan','모루의 파편',{count:7})],
  [move('leap','용광로 문 닫기',{radius:115}),move('poison','쏟아진 별쇳물',{count:3,radius:82,theme:'fire'})]]),
 dawnend_warden:profile('마지막 성좌','여명의 날개가 지나간 길과 기억한 발자국을 따로 읽으세요.',[
  [move('leap','첫 날개의 강림',{radius:100}),move('echo','돌아온 별의 길',{count:3})],
  [move('summon','여섯 날개의 맹세',{adds:['dawnend_sentinel']}),move('fan','새벽의 성가',{count:7}),move('charge','마지막 관측선',{length:285})]]),
 world_tempest:profile('폭풍 거신','거신의 돌진을 엄폐물에 유도하고 늦게 떨어지는 번개를 피해 이동하세요.',[
  [move('charge','번개 발구르기',{length:340,trail:true,theme:'thunder'}),move('echo','늦게 울리는 천둥',{count:3})],
  [move('leap','폭풍핵 낙하',{radius:125}),move('fan','갈라진 폭풍',{count:7,spread:2.2})]]),
 world_leviathan:profile('해류 지배자','흡입 뒤 느린 물살 사이로 빠져나가세요. 벽은 투사체를 막습니다.',[
  [move('pull','썰물의 숨',{radius:235}),move('fan','해류의 갈래',{count:7,projectileSpeed:145})],
  [move('burrow','해저의 잠행',{radius:115}),move('wave','만조의 세 맥박',{count:3})]]),
 world_glacier:profile('빙하의 심장','방패 정면을 피하고 얼음 장판이 남지 않은 방향으로 도약을 유도하세요.',[
  [move('guard','빙하 압쇄',{length:200,width:115}),move('leap','빙벽의 붕괴',{radius:120})],
  [move('poison','남아 있는 결빙',{count:3,radius:80,theme:'ice'}),move('charge','얼어붙은 질주',{length:290})]]),
 world_eclipse:profile('경계의 포식자','포식자의 잠복과 과거 위치 낙인을 함께 피하세요. 부른 사냥개가 접근로를 막습니다.',[
  [move('burrow','지워지는 경계',{radius:120}),move('echo','사라진 별의 자리',{count:3})],
  [move('summon','식의 사냥개',{adds:['abyss_wolf']}),move('pull','검은 별의 허기',{radius:230}),move('fan','포식자의 별숨',{count:7})]]),
 realm_heaven_warden:profile('날개를 거둔 심판자','고정된 심판 위치를 떠나고 날개가 접히는 회복에 접근하세요.',[
  [move('echo','세 번의 서약',{count:3}),move('leap','거두어진 날개',{radius:115})],
  [move('fan','일곱 빛의 판결',{count:7,spread:2}),move('summon','서약의 증인',{adds:['realm_heaven_echo']})]]),
 realm_inferno_warden:profile('사슬의 주인','흡입 범위에서 이탈하고 돌진 뒤 남는 불길을 이용해 호위대와 거리를 벌리세요.',[
  [move('pull','욕망의 사슬',{radius:215}),move('charge','끊어진 사슬 질주',{length:300,trail:true,theme:'fire'})],
  [move('summon','불씨의 죄수',{adds:['realm_inferno_guard']}),move('poison','벗겨진 용광로',{count:3,radius:90,theme:'fire'})]]),
 realm_mirror_warden:profile('반전의 왕','거울은 지난 위치를 기억합니다. 좌우로 계속 움직여 복제된 사선을 피하세요.',[
  [move('echo','좌우가 뒤집힌 기억',{count:3,mirror:true}),move('retreat','거울 뒤 걸음')],
  [move('fan','반사된 성좌',{count:5}),move('leap','반대편 왕좌',{radius:105,mirror:true})]])
};

// Phase names describe what actually changes in each creature's silhouette and
// fighting style, and are shared with the transformation cutscene.
const BOSS_PHASE_NAMES={
 moss_guardian:['잠든 숲의 심장','갈라진 나무껍질','일곱 뿌리의 분노'],
 moon_witch:['달잠의 사서','찢어진 달의 장막','끝나지 않는 밤의 기억'],
 eclipse_dragon:['접힌 검은 날개','불붙은 성흔 비늘','별을 삼키는 마지막 숨'],
 thorn_stag:['고원의 파수뿔','돋아나는 가시 왕관','숲을 달리는 맹세'],
 coral_queen:['산호 정원의 여왕','피어나는 조수 왕관','심해로 열린 화원'],
 sand_pharaoh:['모래 아래의 왕','벗겨진 황금 가면','태양을 삼킨 왕묘'],
 spore_matron:['잠든 꿈포자','갈라진 여왕의 갓','깨어나는 천 겹 균사'],
 snow_sentinel:['백야의 보초','금이 간 빙판 갑주','눈보라를 품은 심장'],
 sky_seraph:['구름 문지기','펼쳐진 폭풍의 날개','하늘을 찢는 성가'],
 abyss_keeper:['닫힌 경계의 이빨','열리는 틈새의 눈','문 너머의 포식자'],
 orion:['침묵한 관측자','회전하는 성좌 갑주','마지막 별의 좌표'],
 sunscar_warden:['황혼의 운반자','벌어진 태양핵 화로','걷는 일몰의 거상'],
 deepsea_warden:['고요한 조수','벗겨지는 해구의 껍질','압력 너머의 진명'],
 wildroot_warden:['잠든 천년 거목','드러나는 일곱 심근','숲 전체의 마지막 맥박'],
 clockwork_warden:['멈춘 정오','역회전하는 시계갑주','두 번째 새벽의 집행'],
 stormcrown_warden:['잠든 천둥왕','깨지는 번개의 왕관','폭풍을 삼킨 기수'],
 voidfront_warden:['국경의 입','열리는 이름 없는 문','귀환을 삼킨 심연'],
 astralforge_warden:['식지 않는 모루','열리는 성좌의 화로','별을 다시 벼리는 손'],
 dawnend_warden:['마지막 관측자','다시 펼쳐진 여명','돌아온 모든 별의 맹세'],
 world_tempest:['폭풍의 거신','폭풍 갑옷 탈피','뇌정왕의 화신'],
 world_leviathan:['해류의 지배자','대양의 탈각','심연의 포식자'],
 world_glacier:['빙하의 심장','빙갑 붕괴','영구동토의 심장'],
 world_eclipse:['경계의 포식자','월식 개화','검은 별의 재림'],
 realm_heaven_warden:['날개를 거둔 심판자','여섯 서약의 날개 개방','백광의 최종 심판'],
 realm_inferno_warden:['사슬에 묶인 주인','끊어진 대죄의 사슬','이름을 되찾은 지옥'],
 realm_mirror_warden:['거울 안의 왕','거울 밖으로 나온 그림자','반전된 왕의 진명']
};
for(const [id,names]of Object.entries(BOSS_PHASE_NAMES))BOSS_BEHAVIORS[id].phaseNames=names;

const themeByRegion={meadow:'nature',coast:'water',desert:'fire',swamp:'nature',frost:'ice',sky:'thunder',abyss:'void',observatory:'star',sunscar:'fire',deepsea:'water',wildroot:'nature',clockwork:'time',stormcrown:'thunder',voidfront:'void',astralforge:'star',dawnend:'holy',heaven:'holy',inferno:'fire',mirror:'time'};
const hovering=new Set(['manta','vulture','owl','harpy','gryphon','jellyray','eye','drone','phoenix','roc','gargoyle','wraith','bell','lotus','seraph']);
export function creatureIdentity(form,region,features=[],scale=1){return {form,features:[...features],palette:[...(CREATURE_PALETTES[region]||CREATURE_PALETTES.meadow)],scale,hover:hovering.has(form),theme:themeByRegion[region]||'nature'};}

const BOSS_ANATOMY={
 moss_guardian:['treant','wildroot',['branchArms','mossCrown','hollowTrunk'],1.8],moon_witch:['wraith','observatory',['crescent','longSleeves'],1.6],eclipse_dragon:['dragon','abyss',['wings','horns','longTail'],1.8],
 thorn_stag:['kirin','meadow',['branchHorns','mane'],1.7],coral_queen:['coral','coast',['crown','branchArms','polyps'],1.7],sand_pharaoh:['worm','desert',['crown','ringMouth','segments'],1.9],spore_matron:['mushroom','swamp',['wideCap','sporeSacs','rootFeet'],1.9],
 snow_sentinel:['yeti','frost',['heavyArms','iceSpikes','crown'],1.8],sky_seraph:['seraph','sky',['sixWings','halo'],1.75],abyss_keeper:['chimera','abyss',['threeHeads','serpentTail'],1.8],orion:['automaton','observatory',['orbit','lance','crown'],1.8],
 sunscar_warden:['anvil','sunscar',['furnace','heavyArms','sundialBack'],1.9],deepsea_warden:['serpent','deepsea',['crown','dorsalFins','barbels'],1.9],wildroot_warden:['treant','wildroot',['hollowTrunk','branchArms','rootFeet'],2],clockwork_warden:['automaton','clockwork',['hammer','clockFace','pendulum'],1.9],
 stormcrown_warden:['gryphon','stormcrown',['crown','wings','lightningTail'],1.9],voidfront_warden:['centipede','voidfront',['ringMouth','manyLegs','spineSpikes'],2],astralforge_warden:['anvil','astralforge',['hammer','furnace','vents'],1.9],dawnend_warden:['seraph','dawnend',['sixWings','halo','crown'],1.9],
 world_tempest:['gargoyle','stormcrown',['stoneWings','spiralHorns','heavyArms'],2],world_leviathan:['serpent','deepsea',['dorsalFins','barbels','crown'],2.2],world_glacier:['turtle','frost',['fortressShell','iceSpikes','heavyArms'],2.1],world_eclipse:['dragon','abyss',['splitJaw','tentacles','wings'],2.1],
 realm_heaven_warden:['seraph','heaven',['sixWings','halo','longSleeves'],1.9],realm_inferno_warden:['gargoyle','inferno',['horns','heavyArms','chains'],1.9],realm_mirror_warden:['automaton','mirror',['crown','mirrorFace','orbit'],1.9],
 dungeon_arke:['automaton','inferno',['furnace','hammer','vents'],1.9],dungeon_neme:['wraith','clockwork',['book','clockwings','hood'],1.9],dungeon_astra:['eye','voidfront',['orbit','tentacles','crown'],2]
};

export function installEncounterIdentities({MONSTERS,ZONES,QUESTS=[]}){
 const renames=[];
 const install=(id,s,region,{prefix='',rename=true}={})=>{
  const m=MONSTERS[id];if(!m)return;
  if(rename&&s.name){renames.push([m.name,prefix+s.name]);m.name=prefix+s.name;}
  m.creature=creatureIdentity(s.form,region,s.features,s.scale);m.behavior=s.behavior;
  m.ecology={province:region,species:s.id,role:s.behavior,hint:ORDINARY_BEHAVIORS[s.behavior]?.hint||''};
  m.encounterInfo={name:ORDINARY_BEHAVIORS[s.behavior]?.name||'',hint:ORDINARY_BEHAVIORS[s.behavior]?.hint||''};
 };
 for(const [region,roster]of Object.entries(REGION_ECOLOGY))for(const s of roster)install(s.id,s,region);
 for(const [id,z]of Object.entries(ZONES))if(z.expedition&&REGION_ECOLOGY[z.province]){
  z.ecology=z.province;
  z.mobTypes?.forEach((type,i)=>{if(type.includes('_reach_'))install(type,REGION_ECOLOGY[z.province][i%3],z.province,{prefix:z.name+'의 '});});
 }
 const base={slime:['slime','leap',['droplets']],beetle:['scarab','charge',['shell','antennae']],skeleton:['knight','guard',['boneFace','spear']],wisp:['lotus','ranged',['flameCore','floatingCore']],golem:['anvil','guard',['stoneArms']],imp:['gargoyle','fan',['smallWings','horns']],ash_knight:['knight','charge',['shield','plume']]};
 for(const [id,[form,behavior,features]]of Object.entries(base))install(id,{id,form,behavior,features,scale:1},id==='imp'||id==='ash_knight'?'sunscar':id==='wisp'||id==='skeleton'?'observatory':'meadow',{rename:false});
 for(const realm of ['heaven','inferno','mirror']){
  install('realm_'+realm+'_echo',{id:'realm_'+realm+'_echo',form:realm==='heaven'?'lotus':realm==='inferno'?'salamander':'wraith',behavior:realm==='heaven'?'fan':realm==='inferno'?'poison':'ranged',features:realm==='heaven'?['petals','halo']:realm==='inferno'?['embers','flatTail']:['mirrorFace','ribbonTail'],scale:1},realm,{rename:false});
  install('realm_'+realm+'_guard',{id:'realm_'+realm+'_guard',form:realm==='heaven'?'seraph':realm==='inferno'?'gargoyle':'automaton',behavior:realm==='heaven'?'guard':realm==='inferno'?'charge':'leap',features:realm==='heaven'?['sixWings','spear']:realm==='inferno'?['chains','horns']:['mirrorFace','roundJoints'],scale:1.15},realm,{rename:false});
 }
 for(const [id,[form,region,features,scale]]of Object.entries(BOSS_ANATOMY))if(MONSTERS[id]){
  MONSTERS[id].creature=creatureIdentity(form,region,features,scale);
  if(BOSS_BEHAVIORS[id]){MONSTERS[id].encounter=id;MONSTERS[id].encounterInfo={name:BOSS_BEHAVIORS[id].name,hint:BOSS_BEHAVIORS[id].hint};}
 }
 for(const [id,z]of Object.entries(ZONES))if(z.expedition&&z.boss&&MONSTERS[z.boss]){
  const baseId=ZONES[z.province]?.boss;
  if(baseId&&BOSS_BEHAVIORS[baseId]){MONSTERS[z.boss].encounter=baseId;MONSTERS[z.boss].creature=structuredClone(MONSTERS[baseId].creature);MONSTERS[z.boss].encounterInfo={name:BOSS_BEHAVIORS[baseId].name,hint:BOSS_BEHAVIORS[baseId].hint};}
 }
 for(const [id,form,region,features]of [['dungeon_cinder','automaton','inferno',['furnace','spikes']],['dungeon_echo','wraith','clockwork',['book','hood']],['dungeon_satellite','eye','voidfront',['orbit','tentacles']],['dungeon_shade','wraith','abyss',['hood','afterimage']]])if(MONSTERS[id])MONSTERS[id].creature=creatureIdentity(form,region,features,.9);
 // Quest objective IDs remain untouched, and prose follows renamed local fauna.
 for(const q of QUESTS)if(typeof q.desc==='string')for(const [from,to]of renames)if(from&&from!==to)q.desc=q.desc.split(from).join(to);
}
