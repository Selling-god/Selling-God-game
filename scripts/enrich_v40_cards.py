from pathlib import Path
import json, re
p=Path('/mnt/data/rift_v40_work/data/catalog.json')
d=json.load(open(p,encoding='utf-8'))
rar_order={'common':1,'rare':2,'ultra':3,'legendary':4,'mythic':5}
for idx,c in enumerate(d['cards']):
    if c.get('cardClass')!='gene':
        continue
    legacy=c.get('legacyUnit') or {}
    unit=legacy.get('unit') or {}
    name=legacy.get('name','')
    rarity=c.get('rarity','common'); ro=rar_order.get(rarity,1)
    hp=int(legacy.get('hp') or 20); power=int(legacy.get('power') or 5); block=int(legacy.get('block') or 0)
    gene=2 if rarity in ('legendary','mythic') and idx%4==0 else 1
    effects=[]; identity='강화'
    on_attack=str(unit.get('onAttack','')); on_round=str(unit.get('onRound','')); on_spell=str(unit.get('onSpell',''))
    # Preserve obvious identity cues, then distribute the rest across six command archetypes.
    healer=any(k in name for k in ['치유','사제','성녀','의무'])
    guardian=any(k in name for k in ['수호','방패','문지기','골렘'])
    style=(idx + ro*3) % 6
    if healer: style=4
    elif guardian: style=1
    if style==0:
        burst=max(38,min(82,40+ro*7+(idx%3)*4))
        effects += [{'op':'monsterBoost','value':max(2,round(power*.36))},{'op':'monsterBurst','value':burst},{'op':'geneCharge','value':gene}]
        identity='강습 인자'
    elif style==1:
        effects += [{'op':'monsterShield','value':max(7,round(hp*.22)+block)},{'op':'resonanceCharge','value':1},{'op':'geneCharge','value':gene}]
        identity='수호 인자'
    elif style==2:
        effects += [{'op':'resonanceCharge','value':1},{'op':'monsterBoost','value':max(2,round(power*.30))},{'op':'geneCharge','value':gene}]
        identity='공명 인자'
    elif style==3:
        effects += [{'op':'riftCharge','value':1},{'op':'monsterShield','value':max(5,round(hp*.17))},{'op':'geneCharge','value':gene}]
        identity='균열 인자'
    elif style==4:
        effects += [{'op':'monsterHeal','value':max(8,round(hp*.27))},{'op':'monsterBoost','value':max(1,round(power*.20))},{'op':'geneCharge','value':gene}]
        identity='생명 인자'
    else:
        effects += [{'op':'geneCharge','value':max(gene,2 if ro>=2 else 1)},{'op':'monsterBoost','value':max(2,round(power*.24))},{'op':'draw','value':1}]
        identity='촉매 인자'
    # Top rarities get one signature rider, increasing build identity instead of only bigger numbers.
    if ro>=3:
        if idx%4==0: effects.insert(-1,{'op':'resonanceCharge','value':1})
        elif idx%4==1: effects.insert(-1,{'op':'monsterHeal','value':5+ro*2})
        elif idx%4==2: effects.insert(-1,{'op':'riftCharge','value':1})
        else: effects.insert(-1,{'op':'energy','value':1})
    c['effects']=effects[:5]
    c['geneStyle']=identity
    c['text']=' · '.join({
        'monsterBoost':lambda v:f'ATK +{v}',
        'monsterShield':lambda v:f'실드 +{v}',
        'monsterHeal':lambda v:f'회복 {v}',
        'monsterBurst':lambda v:f'즉시공격 {v}%',
        'geneCharge':lambda v:f'GENE +{v}',
        'resonanceCharge':lambda v:f'RES +{v}',
        'riftCharge':lambda v:f'RIFT +{v}',
        'energy':lambda v:f'에너지 +{v}',
    }.get(e['op'],lambda v:e['op'])(e.get('value',0)) for e in c['effects'])+'.'
    # Keep cost bounded, but high rarity catalysts may justify 3 energy.
    c['cost']=max(0,min(3,int(c.get('cost',1))))
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
from collections import Counter
print('gene styles',Counter(c.get('geneStyle') for c in d['cards'] if c.get('cardClass')=='gene'))
