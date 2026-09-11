from PIL import Image, ImageDraw
from pathlib import Path
import json, math, random, hashlib

ROOT=Path(__file__).resolve().parents[1]
CAT=ROOT/'data/catalog.json'
with CAT.open(encoding='utf-8') as f: data=json.load(f)

biomes=[
 ('verdant',['이끼','덩굴','청록','꽃가루','수목','유리','고목','초록','균사','수호'],[(44,74,61),(87,145,108),(144,211,150),(204,236,186)]),
 ('ember',['잿불','용광','쇳물','탄화','붉은','고철','화염','용암','검댕','제련'],[(74,39,36),(143,65,50),(231,117,65),(255,195,96)]),
 ('frost',['서리','빙결','유리','백야','설원','수정','눈보라','한기','얼음','동결'],[(46,63,89),(83,115,151),(153,207,229),(225,247,255)]),
 ('astral',['성광','별빛','혜성','공허','성좌','관측','월광','천체','밤하늘','은하'],[(44,38,76),(91,72,143),(161,131,214),(239,209,255)]),
 ('origin',['기원','심연','봉인','금빛','원초','균열','검은','왕좌','종말','만상'],[(42,31,47),(89,68,88),(179,136,105),(255,222,139)])
]
arch=[
 ('slime','슬라임'),('wing','박쥐'),('beast','사냥개'),('spirit','요정'),('watcher','감시자'),
 ('insect','갑각충'),('golem','골렘'),('mimic','미믹'),('priest','사제'),('knight','기사'),
 ('assassin','암살자'),('wraith','악령'),('tyrant','폭군'),('serpent','독사'),('crab','게수호자'),
 ('mushroom','버섯령'),('drone','드론'),('leviathan','거수'),('phoenix','불사조'),('puppet','인형사')
]
elements=['화염','물','자연','빛','그림자','강철','바람','번개','별','시간','공허','수정']
skills=['강타','방벽','약화 파동','집중 사격','균열 베기','폭발탄','정신 압박','속박','돌진','재생','감전','화상','서리 파동','연쇄 공격','중갑 방벽','별빛 포격']

def clamp(v): return max(0,min(255,int(v)))
def shade(c,f): return tuple(clamp(x*f) for x in c)+(255,)

def pxdraw_enemy(kind,pal,seed,variant):
    random.seed(seed)
    S=64
    im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    dark,mid,bright,hi=[tuple(x)+(255,) for x in pal]
    outline=(10,16,22,255)
    # ground shadow
    d.ellipse((13,52,51,58),fill=(4,7,10,90))
    # helpers
    def eye(x,y,col=hi):
        d.rectangle((x,y,x+2,y+2),fill=outline); d.point((x+1,y+1),fill=col)
    def horn(x,y,flip=1):
        pts=[(x,y+7),(x+5*flip,y),(x+3*flip,y+9)]
        d.polygon(pts,fill=bright); d.line(pts+[pts[0]],fill=outline,width=1)
    if kind=='slime':
        d.ellipse((15,25,49,53),fill=outline); d.ellipse((17,23,47,51),fill=mid); d.rectangle((18,38,46,51),fill=mid)
        d.ellipse((22,28,29,35),fill=bright); d.ellipse((35,30,42,37),fill=bright); eye(24,30); eye(37,32)
        for i in range(3+variant): d.rectangle((20+i*7,48-random.randint(0,2),24+i*7,53),fill=dark)
    elif kind=='wing':
        d.polygon([(31,25),(9,18),(17,35),(7,42),(28,39)],fill=outline); d.polygon([(33,25),(55,18),(47,35),(57,42),(36,39)],fill=outline)
        d.polygon([(29,27),(12,21),(20,34),(11,39),(29,36)],fill=mid); d.polygon([(35,27),(52,21),(44,34),(53,39),(35,36)],fill=mid)
        d.ellipse((25,22,39,45),fill=dark); eye(29,29); eye(34,29); horn(27,19,-1); horn(37,19,1)
    elif kind=='beast':
        d.polygon([(14,39),(20,27),(33,25),(47,32),(53,43),(45,51),(23,50)],fill=outline); d.polygon([(16,39),(22,29),(33,28),(45,34),(49,42),(43,48),(24,47)],fill=mid)
        d.polygon([(37,27),(47,21),(49,33)],fill=dark); d.polygon([(24,28),(19,21),(29,27)],fill=dark); eye(38,33); d.rectangle((46,39,51,42),fill=bright)
        for x in (21,28,40,46): d.rectangle((x,46,x+3,54),fill=outline); d.rectangle((x+1,47,x+2,53),fill=dark)
    elif kind=='spirit':
        d.ellipse((20,14,44,39),fill=outline); d.ellipse((22,16,42,37),fill=bright); d.polygon([(21,31),(16,51),(27,44),(32,55),(38,44),(48,51),(42,31)],fill=outline); d.polygon([(23,32),(20,48),(28,42),(32,51),(37,42),(44,48),(40,32)],fill=mid); eye(27,25,dark); eye(35,25,dark)
    elif kind=='watcher':
        d.ellipse((13,18,51,48),fill=outline); d.ellipse((16,21,48,45),fill=dark); d.ellipse((21,25,43,42),fill=bright); d.ellipse((26,29,38,39),fill=outline); d.ellipse((29,31,35,37),fill=hi)
        for a in range(0,360,45):
            x=32+int(math.cos(math.radians(a))*22); y=32+int(math.sin(math.radians(a))*18); d.rectangle((x-2,y-2,x+2,y+2),fill=mid)
    elif kind=='insect':
        d.ellipse((22,19,42,45),fill=outline); d.ellipse((24,21,40,43),fill=dark); d.ellipse((16,27,28,43),fill=mid); d.ellipse((36,27,48,43),fill=mid); d.line((23,25,12,18),fill=bright,width=2); d.line((41,25,52,18),fill=bright,width=2); eye(27,25); eye(34,25)
        for y in (31,37,43): d.line((20,y,11,y+random.choice([-4,4])),fill=outline,width=2); d.line((44,y,53,y+random.choice([-4,4])),fill=outline,width=2)
    elif kind=='golem':
        d.rectangle((18,19,46,50),fill=outline); d.rectangle((21,22,43,47),fill=dark); d.rectangle((13,28,20,46),fill=outline); d.rectangle((44,28,51,46),fill=outline); d.rectangle((22,47,29,56),fill=outline); d.rectangle((35,47,42,56),fill=outline)
        d.rectangle((26,27,38,36),fill=mid); d.rectangle((29,29,35,34),fill=hi); d.line((23,40,40,24),fill=bright,width=2)
    elif kind=='mimic':
        d.rectangle((14,30,50,51),fill=outline); d.rectangle((16,33,48,49),fill=dark); d.polygon([(14,31),(20,20),(46,20),(50,31)],fill=outline); d.polygon([(17,30),(22,23),(44,23),(47,30)],fill=mid); d.rectangle((30,33,35,44),fill=bright); eye(22,28); eye(41,28); d.polygon([(20,46),(25,41),(29,46),(33,41),(37,46),(42,41),(46,46)],fill=hi)
    elif kind=='priest':
        d.ellipse((24,12,40,28),fill=outline); d.ellipse((26,14,38,26),fill=mid); d.polygon([(19,27),(45,27),(51,52),(13,52)],fill=outline); d.polygon([(22,29),(42,29),(46,49),(18,49)],fill=dark); eye(28,19); eye(34,19); d.line((32,30,32,45),fill=bright,width=2); d.line((27,36,37,36),fill=bright,width=2)
    elif kind=='knight':
        d.rectangle((20,17,42,49),fill=outline); d.rectangle((23,20,39,46),fill=dark); d.polygon([(20,18),(32,10),(43,18)],fill=outline); d.polygon([(23,18),(32,13),(40,18)],fill=mid); d.rectangle((26,24,36,27),fill=hi); d.rectangle((14,27,21,44),fill=outline); d.line((44,22,53,49),fill=bright,width=3); d.rectangle((50,47,55,52),fill=outline)
    elif kind=='assassin':
        d.polygon([(20,18),(32,11),(44,18),(48,45),(39,53),(25,53),(16,45)],fill=outline); d.polygon([(23,20),(32,14),(41,20),(44,43),(37,49),(27,49),(20,43)],fill=dark); d.rectangle((25,25,39,29),fill=mid); eye(27,26,hi); eye(35,26,hi); d.line((15,47,26,35),fill=bright,width=2); d.line((49,47,38,35),fill=bright,width=2)
    elif kind=='wraith':
        d.ellipse((21,13,43,32),fill=outline); d.ellipse((23,15,41,30),fill=dark); eye(27,21); eye(35,21); d.polygon([(21,28),(15,53),(25,45),(31,56),(36,44),(49,52),(43,28)],fill=outline); d.polygon([(23,29),(20,48),(27,42),(31,51),(36,41),(44,48),(41,29)],fill=mid)
    elif kind=='tyrant':
        d.ellipse((18,14,46,41),fill=outline); d.ellipse((21,17,43,38),fill=dark); horn(21,12,-1); horn(43,12,1); d.rectangle((15,34,49,52),fill=outline); d.rectangle((19,37,45,49),fill=mid); eye(25,25); eye(36,25); d.rectangle((26,33,38,36),fill=bright)
    elif kind=='serpent':
        pts=[(14,46),(20,35),(29,39),(34,28),(45,31),(50,20),(43,13),(34,17),(30,26),(20,23),(14,31)]
        d.line(pts,fill=outline,width=8); d.line(pts,fill=mid,width=5); d.ellipse((40,10,53,24),fill=outline); d.ellipse((42,12,51,22),fill=dark); eye(47,15)
    elif kind=='crab':
        d.ellipse((19,27,45,47),fill=outline); d.ellipse((22,29,42,44),fill=mid); d.ellipse((10,22,22,35),fill=outline); d.ellipse((42,22,54,35),fill=outline); d.rectangle((10,26,20,31),fill=bright); d.rectangle((44,26,54,31),fill=bright); eye(25,28); eye(36,28); 
        for x in (20,27,35,42): d.line((x,44,x-4 if x<32 else x+4,53),fill=outline,width=2)
    elif kind=='mushroom':
        d.ellipse((15,14,49,34),fill=outline); d.ellipse((18,17,46,31),fill=mid); d.rectangle((25,30,39,51),fill=outline); d.rectangle((28,32,36,49),fill=bright); eye(29,39,dark); eye(34,39,dark); 
        for _ in range(5):
            x=random.randint(22,42);y=random.randint(19,28);d.rectangle((x,y,x+2,y+2),fill=hi)
    elif kind=='drone':
        d.rectangle((20,22,44,43),fill=outline); d.rectangle((23,25,41,40),fill=dark); d.rectangle((28,29,36,36),fill=hi); d.line((20,28,10,20),fill=bright,width=2); d.line((44,28,54,20),fill=bright,width=2); d.ellipse((7,17,15,25),fill=outline); d.ellipse((49,17,57,25),fill=outline); d.line((32,43,32,53),fill=bright,width=2); d.rectangle((27,53,37,56),fill=outline)
    elif kind=='leviathan':
        d.ellipse((9,24,55,49),fill=outline); d.ellipse((12,27,52,46),fill=dark); d.polygon([(16,27),(24,14),(29,28)],fill=mid); d.polygon([(35,28),(42,13),(47,29)],fill=mid); d.polygon([(10,34),(3,26),(6,43)],fill=bright); d.polygon([(54,34),(61,27),(58,43)],fill=bright); eye(20,33); eye(41,33); d.rectangle((26,39,38,42),fill=bright)
    elif kind=='phoenix':
        d.polygon([(32,12),(37,24),(53,19),(45,32),(58,37),(42,40),(47,54),(32,44),(17,54),(22,40),(6,37),(19,32),(11,19),(27,24)],fill=outline); d.polygon([(32,16),(36,27),(48,23),(41,34),(52,37),(38,38),(43,48),(32,41),(21,48),(26,38),(12,37),(23,34),(16,23),(28,27)],fill=mid); d.ellipse((27,25,37,37),fill=bright); eye(31,28,dark)
    elif kind=='puppet':
        d.ellipse((25,14,39,28),fill=outline); d.ellipse((27,16,37,26),fill=mid); d.rectangle((23,28,41,46),fill=outline); d.rectangle((26,31,38,43),fill=dark); d.line((23,32,13,25),fill=bright,width=2); d.line((41,32,51,25),fill=bright,width=2); d.line((27,45,21,55),fill=outline,width=3); d.line((37,45,43,55),fill=outline,width=3); eye(29,20); eye(34,20); d.line((32,13,32,6),fill=hi,width=1)
    # variant accessories / signature
    if variant:
        for j in range(3):
            x=9+j*21+random.randint(-2,2); y=8+random.randint(0,10); d.polygon([(x,y+5),(x+3,y),(x+6,y+5),(x+3,y+9)],fill=bright)
    # rune pixels for uniqueness
    for _ in range(5):
        x=random.randint(8,55);y=random.randint(8,54)
        if im.getpixel((x,y))[3]>0: d.point((x,y),fill=hi)
    return im.resize((256,256),Image.Resampling.NEAREST)

# build 200 enemies: 40 per biome, 2 variants x 20 archetypes
out=[]; enemy_dir=ROOT/'assets/enemies'; enemy_dir.mkdir(parents=True,exist_ok=True)
idx=1
for bi,(bid,prefixes,pal) in enumerate(biomes):
    for a_i,(kind,noun) in enumerate(arch):
        for variant in range(2):
            prefix=prefixes[(a_i*2+variant)%len(prefixes)]
            name=f'{prefix} {noun}'
            tier='common' if a_i<9 and variant==0 else ('rare' if a_i<15 else 'ultra')
            # smooth base values; floor scaling still does most of progression
            hp=32+bi*10+a_i%7*3+variant*5+(8 if tier=='rare' else 16 if tier=='ultra' else 0)
            atk=7+bi*2+(a_i%5)+variant+(2 if tier=='rare' else 4 if tier=='ultra' else 0)
            eid=f'e{idx:03d}'
            element=elements[(a_i+bi*2+variant*5)%len(elements)]
            skill=skills[(a_i*3+bi+variant)%len(skills)]
            sprite=f'/assets/enemies/{eid}.png'
            out.append({'id':eid,'name':name,'tier':tier,'hp':hp,'atk':atk,'skill':skill,'element':element,'biome':bid,'archetype':kind,'variant':variant,'sprite':sprite})
            img=pxdraw_enemy(kind,pal,seed=1000+idx*13+bi*37,variant=variant)
            img.save(enemy_dir/f'{eid}.png',optimize=True)
            idx+=1

data['enemies']=out

# mark mode-specific existing capture-only items
capture_keys={'captureBonus','captureEscapeReduction'}
for it in data['items']:
    mods=it.get('mod',{})
    keys=set(mods)
    if keys and keys.issubset(capture_keys):
        it['modes']=['journey']
        it['modeNote']='여행 전용'
    else:
        it['modes']=['journey','dungeon']

# add 24 combat-meaningful items i097-i120
new_items=[
 ('전열 방진판','common','방어','전투 시작 방어 +7.',{'startBlock':7}),
 ('푸른 에너지 캡슐','common','에너지','첫 턴 에너지 +1.',{'firstTurnEnergy':1}),
 ('돌격용 숫돌','common','유닛','소환 유닛 공격력 +2.',{'unitPower':2}),
 ('마력 증폭 잉크','common','주문','스펠 피해 +3.',{'spellPower':3}),
 ('연금 회복병','common','생존','전투 종료 후 체력 3 회복.',{'healAfterBattle':3}),
 ('균열 나침반','common','경제','보상 희귀도 운 +5%.',{'rewardLuck':0.05}),
 ('강철 반사경','rare','방어','방어 효율 +10%.',{'blockPct':0.10}),
 ('붉은 심장석','rare','생존','회복 효율 +12%.',{'healPct':0.12}),
 ('별가루 탄창','rare','공격','전체 피해 +7%.',{'damagePct':0.07}),
 ('황금 회수망','rare','경제','전투 골드 +10%.',{'goldPct':0.10}),
 ('전술 리본','rare','에너지','시작 드로우 +1.',{'drawBonus':1}),
 ('불굴의 철심','rare','방어','받는 피해 -7%.',{'damageReduction':0.07}),
 ('심연 응축기','ultra','에너지','최대 에너지 +1.',{'maxEnergy':1}),
 ('지휘관의 문장','ultra','유닛','유닛 공격력 +4 · 전투 시작 방어 +4.',{'unitPower':4,'startBlock':4}),
 ('대마도사의 렌즈','ultra','주문','스펠 피해 +5 · 보상 운 +5%.',{'spellPower':5,'rewardLuck':0.05}),
 ('수호성의 파편','ultra','방어','방어 효율 +18% · 시작 방어 +5.',{'blockPct':0.18,'startBlock':5}),
 ('영원의 약병','ultra','생존','전투 종료 회복 +7 · 회복 효율 +15%.',{'healAfterBattle':7,'healPct':0.15}),
 ('행운의 성좌패','ultra','경제','보상 운 +14% · 골드 +8%.',{'rewardLuck':0.14,'goldPct':0.08}),
 ('왕의 전쟁북','legendary','공격','전체 피해 +15% · 보스 피해 +10%.',{'damagePct':0.15,'bossDamagePct':0.10}),
 ('성벽 핵심기','legendary','방어','전투 시작 방어 +14 · 방어 효율 +20%.',{'startBlock':14,'blockPct':0.20}),
 ('무한 마도서','legendary','에너지','시작 드로우 +2 · 첫 턴 에너지 +1.',{'drawBonus':2,'firstTurnEnergy':1}),
 ('불사조 심장','legendary','생존','전투 종료 회복 +12 · 회복 효율 +25%.',{'healAfterBattle':12,'healPct':0.25}),
 ('기원의 코어','mythic','전술','최대 에너지 +1 · 전체 피해 +12% · 방어 +12%.',{'maxEnergy':1,'damagePct':0.12,'blockPct':0.12}),
 ('만상 재보관함','mythic','경제','보상 선택지 +1 · 보상 운 +25% · 전투 골드 +12%.',{'rewardChoices':1,'rewardLuck':0.25,'goldPct':0.12}),
]
for n,(name,rarity,cat,text,mod) in enumerate(new_items,start=97):
    data['items'].append({'id':f'i{n:03d}','name':name,'rarity':rarity,'icon':'◆','maxStack':1 if rarity in ('legendary','mythic') else 3,'text':text,'mod':mod,'category':cat,'art':f'/assets/items/i{n:03d}.png','modes':['journey','dungeon']})

# item icon generator for ALL items, unique silhouette by category/id
item_dir=ROOT/'assets/items'; item_dir.mkdir(parents=True,exist_ok=True)
cat_colors={
 '생존':((34,78,62),(84,190,126),(190,255,215)), '방어':((35,56,86),(69,148,207),(202,237,255)),
 '에너지':((62,54,27),(203,170,55),(255,241,146)), '유닛':((61,43,75),(151,95,195),(231,193,255)),
 '주문':((38,45,82),(88,113,214),(188,205,255)), '경제':((78,60,23),(195,144,43),(255,224,127)),
 '공격':((78,34,37),(199,72,78),(255,171,161)), '탐사':((28,67,68),(62,176,166),(177,245,231)),
 '전술':((45,52,60),(118,151,168),(224,241,246))
}

def item_art(item,idx):
    random.seed(6000+idx*41)
    S=32; im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    c1,c2,c3=cat_colors.get(item.get('category'),cat_colors['전술']); o=(9,14,20,255); a=tuple(c1)+(255,);b=tuple(c2)+(255,);c=tuple(c3)+(255,)
    t=idx%12
    if t==0: # shield
        d.polygon([(16,3),(27,7),(25,20),(16,29),(7,20),(5,7)],fill=o);d.polygon([(16,6),(24,9),(22,19),(16,25),(10,19),(8,9)],fill=b);d.line((16,7,16,23),fill=c,width=2)
    elif t==1: # vial
        d.rectangle((12,4,20,8),fill=o);d.rectangle((14,6,18,10),fill=c);d.polygon([(11,9),(21,9),(25,25),(22,29),(10,29),(7,25)],fill=o);d.polygon([(12,11),(20,11),(22,24),(20,26),(12,26),(10,24)],fill=b);d.rectangle((11,18,21,24),fill=c)
    elif t==2: # gem
        d.polygon([(16,3),(27,11),(23,25),(16,30),(9,25),(5,11)],fill=o);d.polygon([(16,6),(24,12),(21,23),(16,27),(11,23),(8,12)],fill=b);d.polygon([(16,7),(20,13),(16,24),(12,13)],fill=c)
    elif t==3: # book
        d.rectangle((5,6,27,27),fill=o);d.rectangle((7,8,15,25),fill=b);d.rectangle((17,8,25,25),fill=b);d.line((16,8,16,26),fill=c,width=2);d.line((9,12,14,12),fill=c);d.line((19,12,24,12),fill=c)
    elif t==4: # coin/relic disc
        d.ellipse((4,4,28,28),fill=o);d.ellipse((7,7,25,25),fill=b);d.ellipse((11,11,21,21),fill=a);d.polygon([(16,9),(20,16),(16,23),(12,16)],fill=c)
    elif t==5: # sword
        d.polygon([(21,3),(26,6),(15,20),(12,17)],fill=o);d.polygon([(21,5),(24,7),(14,18),(13,17)],fill=c);d.rectangle((9,17,18,21),fill=o);d.rectangle((12,20,15,29),fill=o);d.rectangle((13,21,14,27),fill=b)
    elif t==6: # compass
        d.ellipse((4,4,28,28),fill=o);d.ellipse((7,7,25,25),fill=a);d.polygon([(16,8),(20,18),(16,24),(12,14)],fill=b);d.polygon([(16,10),(17,17),(15,20),(14,14)],fill=c)
    elif t==7: # ring
        d.ellipse((4,4,28,28),fill=o);d.ellipse((8,8,24,24),fill=(0,0,0,0));d.arc((7,7,25,25),20,200,fill=c,width=3);d.polygon([(16,2),(20,7),(16,11),(12,7)],fill=b)
    elif t==8: # crystal cluster
        d.polygon([(8,27),(10,10),(16,4),(19,13),(23,8),(26,27)],fill=o);d.polygon([(11,25),(12,12),(16,7),(17,21)],fill=b);d.polygon([(18,25),(20,15),(23,11),(24,25)],fill=c)
    elif t==9: # lantern
        d.rectangle((9,8,23,27),fill=o);d.rectangle((12,11,20,23),fill=b);d.rectangle((13,13,19,20),fill=c);d.arc((10,2,22,13),180,360,fill=o,width=2);d.rectangle((7,26,25,29),fill=o)
    elif t==10: # feather/wing
        d.polygon([(7,27),(10,12),(24,4),(21,18),(11,29)],fill=o);d.polygon([(10,25),(12,13),(21,7),(19,17)],fill=b);d.line((9,28,21,8),fill=c,width=2);d.line((13,18,20,16),fill=c);d.line((12,22,18,21),fill=c)
    else: # box/chest
        d.rectangle((5,12,27,27),fill=o);d.rectangle((8,15,24,24),fill=b);d.rectangle((14,15,18,23),fill=c);d.polygon([(5,12),(9,6),(23,6),(27,12)],fill=o);d.polygon([(8,11),(11,8),(21,8),(24,11)],fill=a)
    # unique rune bits
    for k in range(3):
        x=random.randint(5,26); y=random.randint(5,26)
        if im.getpixel((x,y))[3]>0: d.point((x,y),fill=c)
    return im.resize((64,64),Image.Resampling.NEAREST)

for idx,it in enumerate(data['items'],start=1):
    item_art(it,idx).save(item_dir/f"{it['id']}.png",optimize=True)

# catalog version marker
data['version']='3.4.0'
with CAT.open('w',encoding='utf-8') as f: json.dump(data,f,ensure_ascii=False,indent=2)
print(f"generated enemies={len(data['enemies'])} items={len(data['items'])}")
