from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
CAT_PATH = ROOT/'data/catalog.json'
cat = json.load(open(CAT_PATH, encoding='utf-8'))

names = [
'불꽃갈기 늑대','숲의 수호골렘','전류족제비','수정요정 셀리아','심연의 박쥐','달빛 사슴','용암거북','파도해파리','바위코뿔소','바람매',
'성기사 카루스','설원의 부엉이','독버섯 괴물','혜성도마뱀','꽃덩굴 나가','모래전갈','그림자 고양이','유령랜턴','홍염날개 매','폭풍뿔새',
'안개여우','갯바위 크랩','가시멧돼지','서리거인','황혼의 까마귀','시계골렘','별빛고래','가시덩굴 수령','화산도마뱀','뇌운의 기린',
'얼음꽃 사슴','모래폭풍 뱀','어둠의 기사','용의 새끼','고대의 나무령','붉은달 늑대','심해 앵무어','유리거미','폭설토끼','전광라쿤',
'달그림자 여우','잿불골렘','샘의 정령','해골갑옷 사자','별의 유니콘','심연문어','시간의 용','폭풍의 곰','강철매','종말의 그림자',
'화염늑대 아그니','용암거인 마그론','홍련조 페니아','불꽃요정 이그나','잿불황소 브라곤','파도거북 네리오','심해해파리 마레','물결여우 리플','산호정령 코랄','폭포룡 아쿠론',
'숲의수호자 베르','넝쿨사슴 비르디','꽃요정 로제','가시멧돼지 브램','고대나무령 오르트','번개족제비 볼트','천둥수리 라이트','전격골렘 테슬라','전기해파리 스파크','뇌광사슴 제노',
'빙결여우 글라시아','설원곰 프로스트','얼음부엉이 노아','서리정령 리메','빙하드래곤 크리셀','권왕원숭이 라곤','철권거북 타우르','무도가호랑이 켄라','격투도사 모우','파괴거인 브루트',
'독버섯괴물 머쉬','맹독전갈 베노스','독안개박쥐 미스트','보라슬라임 젤리온','침묵의뱀 사일라','암석골렘 록스','황야늑대 더스트','모래지렁이 샌더','대지거북 테라핀','지각거인 크래그',
'바람매 제피','구름고양이 클라우','태풍조 게일','하늘고래 스카이론','천공룡 에어리온','강철기사 페론','기계거미 메카릭','톱니골렘 코그','철갑코뿔소 아이론','합금드래곤 알로이',
'그림자박쥐 녹스','유령기사 팬텀','혼령여우 소울라','저주나무 헥스우드','망령왕 레버넌트','염동고양이 프시캣','꿈먹는자 소무니아','환상나비 미라벨','정신구체 오브라','예지룡 오라클론',
'청룡 세이란','흑룡 모르드','황금룡 아우룸','크리스탈룡 제미아','종말룡 엔드라','성스러운사슴 루멘','천사전사 세라','빛의정령 루미아','태양의새 솔버드','신성골렘 할로우',
'암흑늑대 움브라','어둠의마도사 베스퍼','심연괴수 아비스','그림자용 녹테르','무의왕 니힐','요정토끼 피오라','꽃나비 블룸','달빛요정 셀레나','요정사슴 파에나','생명의나무 비타',
'시간의수호자 크로노','차원문지기 포탈론','별조각 아스테르','기억의새 메모리아','균열체 리프트','세계수 엘드라','천공의주인 아엘','심연의눈 보이드아이','시간의용 템포라','무한의존재 인피니아',
'화염엄니 카인','잿불도마 루비크','용암등껍 케르톤','홍염나방 벨피아','적천조 라미엘','물방울요정 아쿠리','조개갑거북 루톤','해류뱀 세르마','심연해파리 네루','폭포룡 바르아',
'이끼거상 모루','꽃사슴 플로아','덩굴뱀 비네스','수피정령 드루니','고목수호수 엔트릭','전뢰족제비 지크','전류묘 네온','낙뢰매 토르비','스파크거미 젤렉스','뇌신룡 카라진',
'암갑거북 그라빅','굴착두더지 모른','중암골렘 바르크','사막전갈 샤르','대지수호자 테르곤','설빙부엉이 루미','서리여우 프리엘','빙하거인 볼가','눈꽃토끼 스노리','영도룡 크리오스',
'독포자균 머쉬라','맹독도롱 베노라','가시독멧 글로프','안개독박쥐 네블','심독사 우로크','흑염늑대 모르크','몽환까마귀 레븐','암흑기사 베일','혼불구체 스펙트','심연군주 녹티르',
'별결정요정 아스티','환영묘 미라쥬','염동해파리 프시온','시계안구 크로니','몽계지배자 드리마','백은기사 아르젠','태엽거상 코그론','톱날거미 스틸렉','합금비룡 페로스','무한병기 아르카논',
'바람방울 포포','질풍매 제피라','회오리수리 볼티아','구름사슴 네페라','폭풍정령 템페아','요정토끼 루루','달빛나비 셀렌','치유사슴 에이라','요술나무 미르브','천상수호자 세라핀'
]

# Elements follow the actual art concept instead of the old procedural ID pattern.
elements = [
'화염','자연','번개','수정','공허','별','화염','물','강철','바람',
'강철','수정','그림자','별','자연','자연','그림자','공허','화염','번개',
'바람','물','자연','수정','그림자','시간','별','자연','화염','번개',
'수정','자연','그림자','별','자연','화염','물','수정','수정','번개',
'그림자','화염','물','공허','별','공허','시간','번개','강철','공허',
# 51-60 fire/water
'화염','화염','화염','화염','화염','물','물','물','물','물',
# 61-70 nature/electric
'자연','자연','자연','자연','자연','번개','번개','번개','번개','번개',
# 71-80 ice/fighting
'수정','수정','수정','수정','수정','강철','강철','강철','강철','강철',
# 81-90 poison/ground
'그림자','그림자','그림자','그림자','그림자','강철','자연','자연','자연','강철',
# 91-100 flying/steel
'바람','바람','바람','바람','바람','강철','강철','강철','강철','강철',
# 101-110 ghost/psychic
'그림자','그림자','그림자','그림자','공허','시간','시간','시간','시간','시간',
# 111-120 dragon/light
'물','공허','빛','수정','공허','빛','빛','빛','빛','빛',
# 121-130 dark/fairy
'공허','그림자','공허','그림자','공허','빛','자연','별','빛','자연',
# 131-140 special/legendary
'시간','공허','별','시간','공허','자연','바람','공허','시간','공허',
# 141-150 fire/water
'화염','화염','화염','화염','화염','물','물','물','물','물',
# 151-160 nature/electric
'자연','자연','자연','자연','자연','번개','번개','번개','번개','번개',
# 161-170 ground/ice
'강철','자연','강철','자연','자연','수정','수정','수정','수정','수정',
# 171-180 poison/dark
'그림자','그림자','그림자','그림자','그림자','공허','그림자','그림자','공허','공허',
# 181-190 psychic/steel
'별','시간','시간','시간','시간','강철','강철','강철','강철','강철',
# 191-200 wind/fairy
'바람','바람','바람','바람','바람','빛','별','빛','자연','빛'
]

assert len(names)==200, len(names)
assert len(elements)==200, len(elements)
assert len(set(names))==200, 'monster names must be unique'

PASSIVES = {
 'slime': ('점액 재생','턴 종료 시 HP 3% 회복.'),
 'wing': ('비행 회피','첫 피격 피해 20% 감소.'),
 'beast': ('사냥 본능','HP 50% 이상일 때 공격이 강해집니다.'),
 'spirit': ('공명 체질','같은 속성 카드 사용 시 공명을 빠르게 모읍니다.'),
 'watcher': ('관측 코어','전투 흐름을 읽어 안정적인 원거리 압박을 가합니다.'),
 'insect': ('외골격','전투 시작 시 보호막 8을 얻습니다.'),
 'golem': ('암석 장갑','받는 피해가 10% 감소합니다.'),
 'mimic': ('기습 모방','상대의 빈틈을 노리는 변칙 행동을 사용합니다.'),
 'priest': ('축복','턴 종료 시 가장 약한 아군 몬스터를 회복합니다.'),
 'knight': ('수호 태세','안정적인 근접 공격과 방어에 특화됩니다.'),
 'assassin': ('급습','빠른 돌진 공격에 특화됩니다.'),
 'wraith': ('영혼 잠식','공허와 그림자 계열 기술에 강한 개성을 가집니다.'),
 'tyrant': ('폭군','전투가 길어질수록 위압적인 압박을 가합니다.'),
 'serpent': ('유연한 일격','긴 몸을 이용해 빠른 연속 공격을 펼칩니다.'),
 'crab': ('반격 갑각','보호막이 깨질 때 반격 기회를 만듭니다.'),
 'mushroom': ('포자 생명력','회복과 지속전에 강합니다.'),
 'drone': ('동조 포격','같은 속성 카드 사용 시 다음 공격이 강화됩니다.'),
 'leviathan': ('거대종','높은 체력과 묵직한 공격으로 전장을 압박합니다.'),
 'phoenix': ('재점화','전투 중 1회 HP 25%로 부활합니다.'),
 'puppet': ('모방','직전 아군의 흐름을 이어 연계 공격을 돕습니다.'),
}
ROLES = {
 'slime':'sustain','wing':'speed','beast':'striker','spirit':'support','watcher':'control','insect':'guard','golem':'tank','mimic':'trick','priest':'support','knight':'guardian','assassin':'speed','wraith':'drain','tyrant':'legend','serpent':'tempo','crab':'counter','mushroom':'sustain','drone':'combo','leviathan':'bruiser','phoenix':'revive','puppet':'combo'
}

def archetype_for(name:str)->str:
    # Specific silhouettes first.
    if re.search(r'슬라임', name): return 'slime'
    if re.search(r'불사조|봉황|홍련조|태양의새|적천조', name): return 'phoenix'
    if re.search(r'크랩|게', name): return 'crab'
    if re.search(r'버섯|포자균', name): return 'mushroom'
    if re.search(r'병기|기계|톱니|시계골렘|태엽', name): return 'drone'
    if re.search(r'기사|전사|도사', name): return 'knight'
    if re.search(r'왕|군주|주인|무한의존재|지배자', name): return 'tyrant'
    if re.search(r'유령|망령|혼령|그림자|심연의눈|혼불|랜턴', name): return 'wraith'
    if re.search(r'거미|전갈|갑각충', name): return 'insect'
    if re.search(r'골렘|거인|거상|수호골렘', name): return 'golem'
    if re.search(r'용|룡|드래곤|고래', name): return 'leviathan'
    if re.search(r'뱀|나가|도마|도롱|지렁이', name): return 'serpent'
    if re.search(r'박쥐|나방|매|수리|부엉이|까마귀|뿔새|앵무|날개|새$', name): return 'wing'
    if re.search(r'요정|정령|유니콘|구체|균열체|별조각|문어|해파리', name): return 'spirit'
    if re.search(r'눈|안구|감시|수호자|문지기', name): return 'watcher'
    if re.search(r'나무|수령|세계수|수호수', name): return 'golem'
    if re.search(r'늑대|여우|고양이|사슴|곰|호랑이|사자|토끼|멧돼지|족제비|라쿤|코뿔소|기린|두더지|황소|거북|갑거북|묘', name): return 'beast'
    return 'beast'

for i,m in enumerate(cat['enemies']):
    name=names[i]
    m['name']=name
    m['element']=elements[i]
    arch=archetype_for(name)
    m['archetype']=arch
    m['role']=ROLES[arch]
    pn,pt=PASSIVES[arch]
    m['passive']={'name':pn,'text':pt,'key':arch}
    m['sprite']=f"/assets/enemies/e{i+1:03d}.png"
    m['evolutionName']=f"진화 · {name}"
    m['resonanceName']=f"공명 · {name}"
    m['abyssName']=f"균열개화 · {name}"
    m['evolutionSprite']=f"/assets/monsters/forms/e{i+1:03d}_evolution.png"
    m['resonanceSprite']=f"/assets/monsters/forms/e{i+1:03d}_resonance.png"
    m['riftSprite']=f"/assets/monsters/forms/e{i+1:03d}_rift.png"

boss_specs = [
 ('세계수의 아이 유니드','자연','leviathan'),
 ('태양의 사자 솔레오','화염','tyrant'),
 ('눈꽃성수 스노엘','수정','spirit'),
 ('성운룡 하이온','별','leviathan'),
 ('어둠왕관 모르칸','공허','tyrant'),
]
for i,(m,(name,element,arch)) in enumerate(zip(cat['bosses'],boss_specs),1):
    m['name']=name;m['element']=element;m['archetype']=arch;m['role']='legend'
    pn,pt=PASSIVES[arch];m['passive']={'name':pn,'text':pt,'key':arch}
    m['sprite']=f'/assets/enemies/b{i:03d}.png'
    m['evolutionName']=f'초월 · {name}';m['resonanceName']=f'공명 · {name}';m['abyssName']=f'균열개화 · {name}'
    m['evolutionSprite']=f'/assets/monsters/forms/b{i:03d}_evolution.png';m['resonanceSprite']=f'/assets/monsters/forms/b{i:03d}_resonance.png';m['riftSprite']=f'/assets/monsters/forms/b{i:03d}_rift.png'

cat['version']='5.0.0'
json.dump(cat,open(CAT_PATH,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('updated',len(cat['enemies']),'monsters +',len(cat['bosses']),'bosses')
print('unique names',len(set(m['name'] for m in cat['enemies'])))
