from PIL import Image, ImageDraw
from pathlib import Path
import json, random, math

ROOT=Path(__file__).resolve().parents[1]
CAT=json.load(open(ROOT/'data/catalog.json',encoding='utf-8'))
MONS=CAT['enemies']+CAT['bosses']
S=96
INK=(24,28,34)
WHITE=(248,250,248)
PAL={
'화염':((211,80,55),(246,137,72),(255,205,116)),
'물':((55,119,181),(82,176,222),(177,230,250)),
'자연':((66,137,80),(105,187,97),(189,232,139)),
'빛':((189,163,72),(237,211,109),(255,244,189)),
'그림자':((75,58,105),(127,88,157),(203,150,221)),
'강철':((72,94,108),(127,153,164),(209,224,226)),
'바람':((62,137,132),(107,193,178),(196,239,221)),
'번개':((182,144,38),(235,194,55),(255,233,126)),
'별':((92,67,137),(156,104,192),(221,172,247)),
'시간':((66,88,143),(108,137,193),(188,208,246)),
'공허':((58,40,75),(102,63,122),(177,124,201)),
'수정':((59,131,143),(102,193,202),(188,240,241)),
}
BIOME_ACC={
'verdant':((74,154,92),(165,223,128)),
'ember':((224,85,52),(255,190,84)),
'frost':((86,161,204),(211,244,255)),
'astral':((132,92,190),(235,193,255)),
'origin':((92,58,120),(196,134,224)),
}

def cl(v): return max(0,min(255,int(v)))
def shade(c,f=.78): return tuple(cl(x*f) for x in c)
def light(c,f=1.18): return tuple(cl(x*f) for x in c)
def mix(a,b,t=.5): return tuple(cl(a[i]*(1-t)+b[i]*t) for i in range(3))

def ell(d,box,fill,outline=INK,w=2): d.ellipse(box,fill=fill,outline=outline,width=w)
def rr(d,box,fill,outline=INK,w=2,r=6): d.rounded_rectangle(box,r,fill=fill,outline=outline,width=w)
def poly(d,pts,fill,outline=INK,w=2):
    d.polygon(pts,fill=fill)
    if outline: d.line(pts+[pts[0]],fill=outline,width=w,joint='curve')
def line(d,pts,fill=INK,w=2): d.line(pts,fill=fill,width=w,joint='curve')

def eye(d,x,y,kind='round',accent=(80,80,80),scale=1):
    if kind=='slit':
        ell(d,(x-4*scale,y-3*scale,x+4*scale,y+3*scale),WHITE,INK,2)
        d.line((x,y-2*scale,x,y+2*scale),fill=accent,width=max(1,scale))
    elif kind=='sleepy':
        d.arc((x-5*scale,y-2*scale,x+5*scale,y+4*scale),190,350,fill=INK,width=2)
    else:
        ell(d,(x-4*scale,y-4*scale,x+4*scale,y+4*scale),WHITE,INK,2)
        ell(d,(x-1*scale,y-1*scale,x+2*scale,y+2*scale),accent,None,0)
        d.point((x,y-1*scale),fill=WHITE)

def face(d,cx,cy,b,a,variant=0,kind='cute'):
    ek='slit' if kind=='predator' else ('sleepy' if kind=='mystic' and variant%2 else 'round')
    eye(d,cx-7,cy,ek,shade(a,.7)); eye(d,cx+7,cy,ek,shade(a,.7))
    if kind=='predator':
        line(d,[(cx-4,cy+8),(cx,cy+10),(cx+4,cy+8)],shade(b,.55),2)
        d.polygon([(cx-4,cy+9),(cx-1,cy+13),(cx,cy+9)],fill=WHITE); d.polygon([(cx+4,cy+9),(cx+1,cy+13),(cx,cy+9)],fill=WHITE)
    else:
        line(d,[(cx-5,cy+8),(cx,cy+10),(cx+5,cy+8)],shade(b,.55),2)
        d.ellipse((cx-13,cy+5,cx-9,cy+8),fill=light(a,1.05)); d.ellipse((cx+9,cy+5,cx+13,cy+8),fill=light(a,1.05))

def aura_marks(d,biome,a2,h2,variant=0,boss=False):
    if biome=='verdant':
        poly(d,[(12,48),(3,40),(7,55)],a2,None,0); poly(d,[(84,47),(93,39),(89,55)],a2,None,0)
        if variant%2: line(d,[(47,79),(47,91)],shade(a2,.75),2)
    elif biome=='ember':
        poly(d,[(38,20),(46,4),(53,20),(49,12),(58,23)],h2,None,0)
        if variant%2: poly(d,[(13,65),(5,73),(14,76)],a2,None,0); poly(d,[(82,65),(91,73),(82,76)],a2,None,0)
    elif biome=='frost':
        for x in (25,47,69): poly(d,[(x,20),(x+5,5),(x+10,20)],h2,None,0)
        poly(d,[(8,65),(15,51),(20,68)],a2,None,0); poly(d,[(88,65),(81,51),(76,68)],a2,None,0)
    elif biome=='astral':
        d.arc((14,9,82,75),205,335,fill=h2,width=2); d.arc((19,13,77,69),210,330,fill=a2,width=1)
        for x,y in [(12,28),(84,31),(19,71),(77,75)]:
            line(d,[(x-3,y),(x+3,y)],h2,1); line(d,[(x,y-3),(x,y+3)],h2,1)
    elif biome=='origin':
        d.arc((10,11,86,81),5,175,fill=a2,width=2); d.arc((16,17,80,75),190,350,fill=h2,width=1)
        d.rectangle((8,65,14,71),fill=shade(a2,.62)); d.rectangle((82,30,88,36),fill=shade(a2,.62))
        if variant%2: line(d,[(18,23),(24,32),(19,40)],h2,2)
    if boss:
        poly(d,[(35,18),(41,7),(47,16),(53,6),(62,18)],h2,INK,2)
        d.arc((6,6,90,91),205,335,fill=shade(a2,.78),width=2)

def body_slime(d,b,a,h,v,biome):
    if v%2==0:
        pts=[(22,75),(20,54),(25,38),(36,29),(55,28),(69,39),(75,55),(73,75),(62,82),(34,82)]
    else:
        pts=[(25,78),(18,61),(23,43),(33,33),(47,27),(62,32),(73,45),(76,63),(70,79),(52,83),(35,82)]
    poly(d,pts,b); ell(d,(26,69,36,84),b);ell(d,(43,71,53,86),b);ell(d,(59,69,69,84),b)
    d.polygon([(28,45),(49,34),(69,44),(67,49),(49,42),(30,51)],fill=light(b,1.07))
    face(d,48,54,b,a,v,'cute')

def body_wing(d,b,a,h,v,biome):
    ell(d,(34,32,62,67),b)
    if v%2==0:
        poly(d,[(35,43),(14,28),(18,58),(35,69)],a); poly(d,[(61,43),(82,28),(78,58),(61,69)],a)
    else:
        poly(d,[(35,45),(10,39),(20,55),(15,70),(36,65)],a); poly(d,[(61,45),(86,39),(76,55),(81,70),(60,65)],a)
    poly(d,[(38,36),(30,22),(44,31)],b); poly(d,[(58,36),(66,22),(52,31)],b)
    face(d,48,47,b,a,v,'cute'); poly(d,[(45,66),(49,78),(53,66)],h)

def body_beast(d,b,a,h,v,biome):
    if v%2==0:
        ell(d,(29,29,67,67),b); poly(d,[(32,35),(22,17),(42,29)],b); poly(d,[(64,35),(74,17),(54,29)],b)
    else:
        ell(d,(26,32,70,67),b); poly(d,[(29,37),(17,25),(36,31)],a); poly(d,[(67,37),(79,25),(60,31)],a)
    ell(d,(38,48,58,66),light(b,1.1));face(d,48,47,b,a,v,'predator' if v%2 else 'cute')
    poly(d,[(64,61),(86,53),(78,72),(66,72)],a); rr(d,(31,65,40,82),b); rr(d,(56,65,65,82),b)

def body_spirit(d,b,a,h,v,biome):
    ell(d,(34,25,62,54),b)
    if v%2==0: poly(d,[(34,48),(28,79),(40,67),(48,84),(56,67),(68,79),(62,48)],b)
    else: poly(d,[(34,48),(20,73),(38,65),(42,84),(51,67),(63,82),(72,57),(62,48)],b)
    face(d,48,40,b,a,v,'mystic')

def body_watcher(d,b,a,h,v,biome):
    ell(d,(20,21,76,77),shade(b,.72)); ell(d,(29,30,67,68),b); ell(d,(37,38,59,60),WHITE); ell(d,(43,44,53,54),a,None,0); ell(d,(46,46,50,50),WHITE,None,0)
    n=8 if v%2==0 else 6
    for i in range(n):
        ang=i*2*math.pi/n; x=48+int(math.cos(ang)*34); y=49+int(math.sin(ang)*34); rr(d,(x-5,y-5,x+5,y+5),a,None,0,2)

def body_insect(d,b,a,h,v,biome):
    ell(d,(36,34,60,76),b); ell(d,(38,24,58,45),light(b,1.08))
    if v%2==0:
        poly(d,[(37,46),(15,35),(22,64),(39,62)],a); poly(d,[(59,46),(81,35),(74,64),(57,62)],a)
    else:
        poly(d,[(37,47),(19,22),(25,62)],a); poly(d,[(59,47),(77,22),(71,62)],a)
    line(d,[(42,27),(34,14)],INK,2);line(d,[(54,27),(62,14)],INK,2);face(d,48,36,b,a,v,'cute')

def body_golem(d,b,a,h,v,biome):
    if v%2==0:
        poly(d,[(28,29),(39,18),(60,22),(73,36),(69,69),(56,82),(32,77),(20,56)],b)
        poly(d,[(26,40),(9,50),(18,67),(30,62)],a); poly(d,[(70,40),(87,50),(78,67),(66,62)],a)
    else:
        rr(d,(26,27,70,72),b); rr(d,(34,17,62,38),light(b,1.04)); poly(d,[(24,42),(8,56),(25,65)],a);poly(d,[(72,42),(88,56),(71,65)],a)
    face(d,48,45,b,a,v,'mystic');line(d,[(39,66),(57,66)],shade(b,.55),2)

def body_mimic(d,b,a,h,v,biome):
    if v%2==0:
        rr(d,(20,34,76,76),shade(b,.78));line(d,[(20,45),(76,45)],INK,3);rr(d,(43,39,53,51),a);poly(d,[(25,50),(33,59),(41,50),(49,59),(57,50),(65,59),(72,50),(72,69),(25,69)],WHITE)
        eye(d,34,43,'round',a);eye(d,62,43,'round',a)
    else:
        rr(d,(28,25,68,74),shade(b,.82));ell(d,(35,35,61,60),light(b,1.1));face(d,48,46,b,a,v,'cute');poly(d,[(28,68),(10,76),(24,82)],a);poly(d,[(68,68),(86,76),(72,82)],a)

def body_priest(d,b,a,h,v,biome):
    poly(d,[(33,35),(48,19),(63,35),(72,82),(24,82)],shade(b,.7));ell(d,(35,32,61,59),b);face(d,48,44,b,a,v,'mystic');rr(d,(42,60,54,80),a)
    if v%2==0: line(d,[(67,38),(79,80)],INK,3);ell(d,(72,25,84,38),h)
    else: line(d,[(29,38),(17,80)],INK,3);poly(d,[(10,24),(18,15),(26,24),(18,33)],h)

def body_knight(d,b,a,h,v,biome):
    rr(d,(30,27,66,62),b);d.rectangle((30,37,66,45),fill=shade(b,.52));rr(d,(33,59,63,80),shade(b,.76));eye(d,41,40,'round',a);eye(d,55,40,'round',a)
    poly(d,[(30,44),(17,48),(18,73),(31,67)],a)
    if v%2==0: line(d,[(70,43),(82,81)],h,4)
    else: line(d,[(48,26),(48,8)],h,3); line(d,[(39,15),(57,15)],h,3)

def body_assassin(d,b,a,h,v,biome):
    poly(d,[(34,25),(62,25),(70,42),(64,79),(32,79),(26,42)],shade(b,.62));d.rectangle((34,38,62,50),fill=b);eye(d,41,44,'slit',a);eye(d,55,44,'slit',a)
    if v%2==0:
        poly(d,[(30,32),(10,22),(24,48)],a);line(d,[(67,59),(87,42)],h,4);line(d,[(68,66),(88,51)],h,2)
    else:
        poly(d,[(66,32),(86,22),(72,48)],a);line(d,[(29,59),(9,42)],h,4);line(d,[(28,66),(8,51)],h,2)

def body_wraith(d,b,a,h,v,biome):
    poly(d,[(35,33),(43,23),(56,24),(64,35),(70,65),(59,80),(51,69),(44,84),(36,70),(24,79),(26,54)],shade(b,.65));ell(d,(35,33,61,60),b);face(d,48,45,b,a,v,'mystic')

def body_tyrant(d,b,a,h,v,biome):
    ell(d,(27,28,69,68),b);poly(d,[(31,35),(20,16),(42,29)],b);poly(d,[(65,35),(76,16),(54,29)],b);face(d,48,46,b,a,v,'predator');rr(d,(30,65,40,84),b);rr(d,(56,65,66,84),b)
    if v%2==0: poly(d,[(65,58),(88,48),(79,70),(67,72)],a)
    else: poly(d,[(28,58),(8,47),(17,70),(30,72)],a)

def body_serpent(d,b,a,h,v,biome):
    # thick curved body
    d.arc((17,44,79,91),5,305,fill=INK,width=14);d.arc((17,44,79,91),5,305,fill=b,width=9);ell(d,(48,22,75,49),b)
    if v%2==0: poly(d,[(53,28),(44,18),(58,23)],a);poly(d,[(69,28),(79,18),(66,23)],a)
    else: poly(d,[(58,22),(64,9),(69,24)],h)
    eye(d,57,34,'slit',a);eye(d,68,34,'slit',a);line(d,[(72,41),(84,43)],h,2)

def body_crab(d,b,a,h,v,biome):
    ell(d,(29,43,67,74),b);ell(d,(34,31,45,46),b);ell(d,(51,31,62,46),b);eye(d,39,35,'round',a);eye(d,57,35,'round',a)
    if v%2==0: poly(d,[(28,51),(10,38),(6,54),(20,66)],a);poly(d,[(68,51),(86,38),(90,54),(76,66)],a)
    else: poly(d,[(26,52),(7,56),(18,73),(30,66)],a);poly(d,[(70,52),(89,56),(78,73),(66,66)],a)
    line(d,[(34,71),(20,84)],INK,3);line(d,[(62,71),(76,84)],INK,3)

def body_mushroom(d,b,a,h,v,biome):
    if v%2==0: ell(d,(20,21,76,52),a)
    else: poly(d,[(22,52),(29,20),(67,20),(74,52)],a)
    rr(d,(36,47,60,83),b);face(d,48,63,b,a,v,'cute');ell(d,(28,31,37,40),h,None,0);ell(d,(58,27,67,36),h,None,0)

def body_drone(d,b,a,h,v,biome):
    ell(d,(30,36,66,70),shade(b,.72));rr(d,(34,41,62,62),b);ell(d,(42,44,54,56),a);ell(d,(46,47,50,51),WHITE,None,0)
    line(d,[(31,47),(14,33)],INK,3);line(d,[(65,47),(82,33)],INK,3);ell(d,(6,24,21,39),h);ell(d,(75,24,90,39),h);rr(d,(40,72,56,79),a)
    if v%2: line(d,[(48,36),(48,18)],INK,2);ell(d,(44,12,52,20),h)

def body_phoenix(d,b,a,h,v,biome):
    ell(d,(36,30,60,65),b)
    if v%2==0: poly(d,[(37,40),(12,35),(26,66),(41,61)],a);poly(d,[(59,40),(84,35),(70,66),(55,61)],a)
    else: poly(d,[(38,42),(8,50),(29,70),(42,60)],a);poly(d,[(58,42),(88,50),(67,70),(54,60)],a)
    poly(d,[(44,30),(50,14),(57,33)],h);face(d,48,44,b,a,v,'cute');poly(d,[(43,64),(32,89),(48,78),(60,90),(57,65)],a)

def body_puppet(d,b,a,h,v,biome):
    ell(d,(34,25,62,55),b);rr(d,(34,54,62,82),shade(b,.78));face(d,48,40,b,a,v,'cute');line(d,[(34,60),(18,72)],INK,3);line(d,[(62,60),(78,72)],INK,3);line(d,[(40,81),(34,93)],INK,3);line(d,[(56,81),(62,93)],INK,3)
    if v%2==0: line(d,[(25,19),(71,19)],a,2);line(d,[(40,26),(40,19)],a,2);line(d,[(56,26),(56,19)],a,2)
    else: poly(d,[(36,30),(25,14),(42,21)],a);poly(d,[(60,30),(71,14),(54,21)],a)

def body_leviathan(d,b,a,h,v,biome):
    ell(d,(28,31,66,67),b)
    if v%2==0: poly(d,[(31,42),(7,28),(19,59),(34,63)],a);poly(d,[(63,42),(89,28),(77,59),(62,63)],a)
    else: poly(d,[(29,47),(4,52),(20,70),(36,63)],a);poly(d,[(67,47),(92,52),(76,70),(60,63)],a)
    poly(d,[(43,32),(50,13),(58,34)],h);face(d,48,46,b,a,v,'cute');poly(d,[(39,66),(28,88),(46,80),(59,91),(60,66)],b)

DRAW={'slime':body_slime,'wing':body_wing,'beast':body_beast,'spirit':body_spirit,'watcher':body_watcher,'insect':body_insect,'golem':body_golem,'mimic':body_mimic,'priest':body_priest,'knight':body_knight,'assassin':body_assassin,'wraith':body_wraith,'tyrant':body_tyrant,'serpent':body_serpent,'crab':body_crab,'mushroom':body_mushroom,'drone':body_drone,'phoenix':body_phoenix,'puppet':body_puppet,'leviathan':body_leviathan}

def add_form(d,mode,a,h):
    if mode=='evolution':
        poly(d,[(30,25),(37,7),(45,23)],h);poly(d,[(66,24),(59,7),(51,23)],h);line(d,[(14,72),(6,80)],a,3);line(d,[(82,72),(90,80)],a,3)
    elif mode=='resonance':
        d.arc((10,8,86,58),180,360,fill=h,width=3);d.arc((17,13,79,53),180,360,fill=a,width=2)
        for x,y in [(12,25),(84,25),(17,78),(79,78)]: line(d,[(x-3,y),(x+3,y)],h,1);line(d,[(x,y-3),(x,y+3)],h,1)
    elif mode=='rift':
        poly(d,[(30,28),(20,5),(39,22)],shade(a,.62));poly(d,[(66,28),(76,5),(57,22)],shade(a,.62));line(d,[(18,41),(27,50),(20,60)],h,3);line(d,[(78,42),(69,51),(77,61)],h,3)

def render(mon,mode='base'):
    seed=sum(ord(c) for c in mon['id']+mon['name']+mode);r=random.Random(seed)
    b,a,h=PAL.get(mon.get('element'),((90,140,120),(130,190,160),(210,245,220)))
    acc1,acc2=BIOME_ACC.get(mon.get('biome'),((100,160,150),(200,230,220)))
    b=mix(b,acc1,.10);a=mix(a,acc1,.22);h=mix(h,acc2,.32)
    img=Image.new('RGBA',(S,S),(0,0,0,0));d=ImageDraw.Draw(img)
    num=int(''.join(x for x in mon['id'] if x.isdigit()) or 0);v=(num+(['verdant','ember','frost','astral','origin'].index(mon.get('biome','verdant'))))%2
    DRAW.get(mon.get('archetype'),body_beast)(d,b,a,h,v,mon.get('biome'))
    aura_marks(d,mon.get('biome'),acc1,acc2,v,mon['id'].startswith('b'))
    if mode!='base': add_form(d,mode,a,h)
    # one stable species mark so neighboring IDs do not feel cloned
    if num%3==0: d.rectangle((12,17,18,23),fill=h)
    if num%5==0: poly(d,[(80,20),(86,13),(90,22)],a,None,0)
    if num%7==0: d.arc((25,8,71,34),190,350,fill=h,width=2)
    # scale with nearest-neighbor to keep pixel aesthetics
    size=448 if mon['id'].startswith('b') and mode=='base' else 384
    return img.resize((size,size),Image.Resampling.NEAREST)

for mon in MONS:
    base=ROOT/mon['sprite'].lstrip('/');base.parent.mkdir(parents=True,exist_ok=True);render(mon,'base').save(base)
    for key,mode in [('evolutionSprite','evolution'),('resonanceSprite','resonance'),('riftSprite','rift')]:
        if mon.get(key):
            out=ROOT/mon[key].lstrip('/');out.parent.mkdir(parents=True,exist_ok=True);render(mon,mode).save(out)
print('V47_MONSTERS_OK',len(MONS))
