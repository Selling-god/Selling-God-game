from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance
import json, random, math, numpy as np, cv2

ROOT=Path(__file__).resolve().parents[1]
CAT=json.load(open(ROOT/'data/catalog.json',encoding='utf-8'))
OUT=ROOT/'assets/monsters/forms'; OUT.mkdir(parents=True,exist_ok=True)

ELEMENT_COLORS={
 '화염':(245,92,53,255),'물':(65,158,230,255),'자연':(91,181,91,255),'빛':(250,216,93,255),
 '그림자':(142,82,181,255),'강철':(154,176,191,255),'바람':(92,207,180,255),'번개':(248,209,65,255),
 '별':(185,122,231,255),'시간':(104,148,224,255),'공허':(123,67,149,255),'수정':(104,212,230,255)
}
INK=(28,24,39,255)

def alpha_bbox(im):
    a=np.array(im.getchannel('A'));ys,xs=np.where(a>12)
    if len(xs)==0:return (32,32,224,224)
    return (xs.min(),ys.min(),xs.max()+1,ys.max()+1)

def pixel_overlay(seed,accent,arch,mode):
    rng=random.Random(seed)
    ov=Image.new('RGBA',(128,128),(0,0,0,0));d=ImageDraw.Draw(ov)
    ac=accent; hi=tuple(min(255,int(c*1.25)) for c in ac[:3])+(255,)
    if mode=='evolution':
        # Structural crest / armor pieces: deliberately different from a palette swap.
        centers=[(64,18),(25,56),(103,56)]
        if arch in ('wing','phoenix','leviathan'):
            d.polygon([(20,68),(5,43),(26,51),(38,76)],fill=ac,outline=INK)
            d.polygon([(108,68),(123,43),(102,51),(90,76)],fill=ac,outline=INK)
        elif arch in ('golem','tyrant','knight','drone'):
            for x,y in [(24,60),(104,60),(64,22)]:
                d.polygon([(x,y-12),(x-9,y+7),(x+9,y+7)],fill=ac,outline=INK)
                d.rectangle((x-7,y+6,x+7,y+12),fill=hi,outline=INK)
        elif arch in ('serpent','beast','insect','crab'):
            for x in (42,86): d.polygon([(x,27),(x-8,42),(x+4,39)],fill=ac,outline=INK)
            for x in (18,110): d.polygon([(x,72),(x-7,87),(x+7,82)],fill=hi,outline=INK)
        else:
            for x,y in centers:
                d.polygon([(x,y-10),(x-8,y+5),(x,y+10),(x+8,y+5)],fill=ac,outline=INK)
        # little rune plates
        for _ in range(4):
            x=rng.randint(18,110);y=rng.randint(30,102)
            d.rectangle((x-2,y-2,x+2,y+2),fill=hi)
    elif mode=='resonance':
        # orbiting shards + broken halo
        d.arc((18,20,110,112),195,335,fill=ac,width=3); d.arc((20,18,108,110),15,150,fill=hi,width=2)
        for ang in (35,120,205,300):
            rad=math.radians(ang);x=64+int(math.cos(rad)*48);y=66+int(math.sin(rad)*42)
            d.polygon([(x,y-6),(x-4,y),(x,y+7),(x+4,y)],fill=hi,outline=INK)
        for _ in range(8):
            x=rng.randint(12,116);y=rng.randint(16,112)
            d.point((x,y),fill=hi); d.point((x+1,y),fill=hi)
    else:
        # rift bloom: shadow tendrils and fractured shards behind the base body.
        dark=(63,30,78,235); violet=(204,83,230,255)
        for side in (-1,1):
            pts=[]
            x=64+side*30
            for k in range(5):
                pts.append((x+side*rng.randint(4,13)*k,102-k*18+rng.randint(-4,4)))
            d.line(pts,fill=dark,width=8)
            d.line(pts,fill=violet,width=2)
        for _ in range(6):
            x=rng.randint(18,110);y=rng.randint(22,105)
            d.polygon([(x,y-8),(x-4,y),(x+1,y+9),(x+5,y+1)],fill=violet,outline=INK)
        d.arc((25,26,103,111),200,340,fill=violet,width=3)
    return ov.resize((256,256),Image.Resampling.NEAREST)

def outline_from_alpha(base,color,px=3):
    a=np.array(base.getchannel('A'))
    k=np.ones((px*2+1,px*2+1),np.uint8)
    dil=cv2.dilate((a>8).astype(np.uint8),k,iterations=1)
    edge=((dil>0)&(a<=8)).astype(np.uint8)*255
    out=Image.new('RGBA',base.size,(0,0,0,0)); layer=Image.new('RGBA',base.size,color); layer.putalpha(Image.fromarray(edge))
    out.alpha_composite(layer); return out

def transform_base(base,scale=1.0,dy=0):
    if abs(scale-1)<1e-3 and dy==0:return base.copy()
    w=max(1,int(256*scale));h=max(1,int(256*scale))
    im=base.resize((w,h),Image.Resampling.NEAREST)
    out=Image.new('RGBA',(256,256),(0,0,0,0));out.alpha_composite(im,((256-w)//2,(256-h)//2+dy));return out

def make_form(mon,mode):
    base=Image.open(ROOT/mon['sprite'].lstrip('/')).convert('RGBA')
    if base.size != (256,256): base=base.resize((256,256),Image.Resampling.NEAREST)
    accent=ELEMENT_COLORS.get(mon.get('element'),(170,170,210,255))
    seed=sum(ord(c) for c in mon['id']+mode)
    out=Image.new('RGBA',(256,256),(0,0,0,0))
    if mode=='evolution':
        out.alpha_composite(pixel_overlay(seed,accent,mon.get('archetype','beast'),mode))
        evo=transform_base(base,1.06,-3)
        out.alpha_composite(outline_from_alpha(evo,tuple(max(20,c//3) for c in accent[:3])+(220,),2))
        out.alpha_composite(evo)
    elif mode=='resonance':
        out.alpha_composite(pixel_overlay(seed,accent,mon.get('archetype','beast'),mode))
        bright=ImageEnhance.Brightness(base).enhance(1.08)
        out.alpha_composite(outline_from_alpha(bright,accent[:3]+(180,),2))
        out.alpha_composite(bright)
    else:
        out.alpha_composite(pixel_overlay(seed,accent,mon.get('archetype','beast'),mode))
        # deep rift outline + base kept recognizable
        out.alpha_composite(outline_from_alpha(base,(61,25,78,235),4))
        out.alpha_composite(base)
        # a few pixel cracks on top
        d=ImageDraw.Draw(out);rng=random.Random(seed+77)
        for _ in range(3):
            x=rng.randint(70,185);y=rng.randint(65,170)
            d.line([(x,y),(x+rng.choice([-7,7]),y+8),(x+rng.choice([-12,12]),y+16)],fill=(232,105,248,230),width=2)
    return out

mons=CAT['enemies']+CAT['bosses']
for m in mons:
    for mode,key in [('evolution','evolutionSprite'),('resonance','resonanceSprite'),('rift','riftSprite')]:
        img=make_form(m,mode)
        if m['id'].startswith('b'): img=img.resize((384,384),Image.Resampling.NEAREST)
        img.save(ROOT/m[key].lstrip('/'),optimize=True)
print('generated',len(mons)*3,'V50 form sprites')
