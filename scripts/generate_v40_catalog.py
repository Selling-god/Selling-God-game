from pathlib import Path
from PIL import Image, ImageDraw
import json, random, math
ROOT=Path(__file__).resolve().parents[1]
CAT=ROOT/'data/catalog.json'
with CAT.open(encoding='utf-8') as f: data=json.load(f)
rarity_order={'common':1,'rare':2,'ultra':3,'legendary':4,'mythic':5}
# Convert former unit cards into monster enhancement sigils. Keep original payload for legacy display/debug.
for c in data['cards']:
    if c.get('type')=='unit':
        orig={k:c.get(k) for k in ('name','hp','power','block','unit','effects')}
        c['legacyUnit']=orig
        base_name=c.get('name','유닛')
        rarity=c.get('rarity','common')
        rank=rarity_order.get(rarity,1)
        atk=max(2, round((c.get('power') or 4)*0.32)+rank)
        shield=max(3, round((c.get('hp') or 20)*0.16)+rank)
        c['name']=f'인자술 · {base_name}'
        c['type']='spell'
        c['cardClass']='gene'
        c['target']='ally'
        c['cost']=max(0,min(3,int(c.get('cost',1))))
        c['power']=0
        c['block']=0
        c['hp']=0
        c['effects']=[
            {'op':'monsterBoost','value':atk},
            {'op':'monsterShield','value':shield},
            {'op':'geneCharge','value':1}
        ]
        c['text']=f'선택 몬스터 공격 +{atk} · 실드 +{shield} · GENE +1.'
        c['shortText']=f'ATK +{atk}  SHIELD +{shield}  GENE +1'
    else:
        ops={x.get('op') for x in c.get('effects',[]) if isinstance(x,dict)}
        if ops & {'block','blockAllies','heal','healAllies','healLowestAlly','draw','energy','spellDiscount','anyDiscount','nextAttack','teamNextAttack'}:
            c['cardClass']='support'
        else:
            c['cardClass']='attack'
        c.setdefault('target','enemy' if ops & {'damage','damageAll','damageOthers','bossDamage','vulnerable','weak','burn'} else 'self')
        c.setdefault('shortText',c.get('text',''))

# Monster metadata for all 200 normal + 5 bosses.
passive_by_arch={
 'slime':('점액 재생','턴 종료 시 HP 3% 회복.'),
 'wing':('비행 회피','첫 피격 피해 20% 감소.'),
 'beast':('사냥 본능','HP 50% 이상일 때 공격 +15%.'),
 'spirit':('마력 공명','같은 속성 스펠 사용 시 RESONANCE +1 추가 확률.'),
 'watcher':('약점 관측','상성 우위 공격 피해 +12%.'),
 'insect':('외골격','전투 시작 실드 +8.'),
 'golem':('암석 장갑','받는 피해 -10%.'),
 'mimic':('탐욕','처치 참여 시 런 골드 +3.'),
 'priest':('축복','턴 종료 시 가장 약한 아군 몬스터 HP +3.'),
 'knight':('수호 자세','실드가 있을 때 공격 +10%.'),
 'assassin':('선제','전투 첫 공격 +45%.'),
 'wraith':('흡혼','가한 피해의 8% 회복.'),
 'tyrant':('폭군','매 공격마다 공격 +1.'),
 'serpent':('독니','공격 시 25% 확률로 적 약화 1.'),
 'crab':('갑각 반격','실드 파괴 시 다음 공격 +4.'),
 'mushroom':('포자','3번째 공격마다 적 전체에 2 피해.'),
 'drone':('연쇄 회로','같은 속성 스펠 사용 후 다음 공격 +4.'),
 'leviathan':('파도 압박','공격 피해 25%를 다른 적에게 확산.'),
 'phoenix':('재점화','전투당 1회 HP 25%로 부활.'),
 'puppet':('모방','직전 아군 몬스터 공격력의 15%를 추가 피해로 복제.')
}
role_by_arch={
 'slime':'sustain','wing':'speed','beast':'striker','spirit':'caster','watcher':'breaker','insect':'guard','golem':'tank','mimic':'utility','priest':'support','knight':'guard','assassin':'burst','wraith':'drain','tyrant':'ramp','serpent':'debuff','crab':'guard','mushroom':'aoe','drone':'combo','leviathan':'aoe','phoenix':'revive','puppet':'combo'
}
for idx,m in enumerate(data['enemies']):
    tier=m.get('tier','common')
    base={'common':1,'rare':2,'ultra':4}.get(tier,2)
    stat=(m.get('hp',0)/55)+(m.get('atk',0)/15)
    extra=1 if tier=='ultra' and stat>3.1 else 0
    m['pointCost']=min(5,base+extra)
    m['monsterRarity']={'common':'common','rare':'rare','ultra':'ultra'}.get(tier,'rare')
    m['captureBase']={'common':0.72,'rare':0.43,'ultra':0.20}.get(tier,0.35)
    arch=m.get('archetype','beast')
    pname,ptext=passive_by_arch.get(arch,('야생 본능','전투 중 기본 능력이 강화됩니다.'))
    m['passive']={'name':pname,'text':ptext,'key':arch}
    m['role']=role_by_arch.get(arch,'striker')
    m['playerHp']=max(38,round(m.get('hp',40)*1.45))
    m['playerAtk']=max(6,round(m.get('atk',8)*1.18))
    m['evolutionName']=f"{m['name']} · 진화형"
    m['resonanceName']=f"공명 {m['name']}"
    m['abyssName']=f"균열개화 {m['name']}"
for idx,m in enumerate(data.get('bosses',[])):
    m['pointCost']=7 if idx<3 else 8
    m['monsterRarity']='legendary' if idx<3 else 'mythic'
    m['captureBase']=0.06 if idx<3 else 0.025
    m['archetype']=m.get('archetype') or ['tyrant','golem','priest','leviathan','wraith'][idx%5]
    pname,ptext=passive_by_arch.get(m['archetype'],('군주의 위압','보스급 전투 능력.'))
    m['passive']={'name':pname,'text':ptext,'key':m['archetype']}
    m['role']='legend'
    m['playerHp']=max(120,round(m.get('hp',300)*0.42))
    m['playerAtk']=max(20,round(m.get('atk',18)*1.25))
    m['evolutionName']=f"초월 {m['name']}"
    m['resonanceName']=f"공명 {m['name']}"
    m['abyssName']=f"균열개화 {m['name']}"

# Relics/treasures: real pixel assets instead of symbol-only cards.
rel_dir=ROOT/'assets/relics'; rel_dir.mkdir(parents=True,exist_ok=True)
palettes=[((22,42,58),(71,163,167),(173,255,223)),((61,37,66),(149,76,166),(247,172,255)),((76,52,24),(201,144,47),(255,227,136)),((36,49,84),(80,128,214),(193,224,255))]
def relic_art(i,rar):
    S=32; im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    p=palettes[i%len(palettes)]; a,b,c=[x+(255,) for x in p]; o=(7,12,18,255)
    t=i%8
    if t==0:
        d.polygon([(16,2),(28,10),(24,25),(16,30),(8,25),(4,10)],fill=o); d.polygon([(16,5),(24,11),(21,23),(16,27),(11,23),(8,11)],fill=b); d.polygon([(16,8),(19,15),(16,23),(13,15)],fill=c)
    elif t==1:
        d.ellipse((4,4,28,28),fill=o); d.ellipse((8,8,24,24),fill=b); d.arc((10,10,22,22),30,290,fill=c,width=2); d.line((16,6,16,13),fill=c,width=2)
    elif t==2:
        d.rectangle((7,8,25,27),fill=o); d.rectangle((10,11,22,24),fill=b); d.polygon([(7,9),(12,3),(20,3),(25,9)],fill=o); d.rectangle((14,14,18,23),fill=c)
    elif t==3:
        d.polygon([(6,26),(10,8),(15,4),(17,15),(22,7),(27,26)],fill=o); d.polygon([(9,24),(11,10),(14,7),(15,22)],fill=b); d.polygon([(18,24),(20,11),(23,9),(25,24)],fill=c)
    elif t==4:
        d.rectangle((5,7,27,26),fill=o); d.rectangle((8,10,15,23),fill=b); d.rectangle((17,10,24,23),fill=b); d.line((16,9,16,24),fill=c,width=2); d.line((9,14,14,14),fill=c); d.line((18,14,23,14),fill=c)
    elif t==5:
        d.ellipse((5,5,27,27),fill=o); d.polygon([(16,7),(23,16),(16,25),(9,16)],fill=b); d.polygon([(16,10),(19,16),(16,22),(13,16)],fill=c)
    elif t==6:
        d.polygon([(5,24),(8,10),(16,4),(24,10),(27,24),(22,29),(10,29)],fill=o); d.polygon([(9,23),(11,12),(16,8),(21,12),(23,23),(20,26),(12,26)],fill=b); d.ellipse((13,13,19,19),fill=c)
    else:
        d.line((6,25,25,6),fill=o,width=6); d.line((8,24,24,8),fill=b,width=3); d.rectangle((4,23,12,28),fill=o); d.rectangle((20,4,27,10),fill=c)
    if rar in ('legendary','mythic'):
        for ang in range(0,360,45):
            x=16+round(math.cos(math.radians(ang))*14); y=16+round(math.sin(math.radians(ang))*14); d.point((x,y),fill=c)
    return im.resize((96,96),Image.Resampling.NEAREST)
for i,r in enumerate(data.get('relics',[])):
    r['art']=f"/assets/relics/{r['id']}.png"
    r.setdefault('category','TREASURE')
    relic_art(i,r.get('rarity','common')).save(rel_dir/f"{r['id']}.png",optimize=True)

# Global v4 meta
data['version']='4.0.0'
data['monsterParty']={'maxSlots':6,'pointBudget':10,'starterIds':[e['id'] for e in data['enemies'] if e.get('tier')=='common'][:4]}
data['spellDeck']={'min':8,'max':12}
with CAT.open('w',encoding='utf-8') as f: json.dump(data,f,ensure_ascii=False,indent=2)
print('v4 catalog ready',len(data['cards']),len(data['enemies']),len(data.get('bosses',[])),len(data.get('relics',[])))
