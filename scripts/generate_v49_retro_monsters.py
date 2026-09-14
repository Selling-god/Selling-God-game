from PIL import Image, ImageDraw
from pathlib import Path
import json, math, random, hashlib

ROOT = Path(__file__).resolve().parents[1]
CAT = json.load(open(ROOT/'data/catalog.json', encoding='utf-8'))
MONS = CAT['enemies'] + CAT['bosses']
W, H = 128, 112
OUT_NATIVE = 128
INK = (13, 18, 25, 255)
DEEP = (25, 28, 35, 255)
WHITE = (246, 249, 246, 255)

ELEMENT = {
    '화염': (225, 78, 48), '물': (58, 138, 205), '자연': (75, 158, 84),
    '빛': (236, 206, 87), '그림자': (105, 72, 142), '강철': (115, 139, 151),
    '바람': (82, 178, 155), '번개': (238, 194, 52), '별': (157, 103, 205),
    '시간': (89, 126, 193), '공허': (91, 55, 113), '수정': (78, 176, 191),
}
BIOME = {
    'verdant': ((48, 105, 70), (87, 157, 103), (169, 219, 142)),
    'ember': ((111, 48, 37), (198, 77, 47), (246, 157, 70)),
    'frost': ((57, 86, 124), (91, 157, 194), (191, 231, 245)),
    'astral': ((64, 48, 103), (115, 78, 166), (210, 165, 236)),
    'origin': ((57, 43, 64), (119, 83, 105), (218, 170, 107)),
}
BIOME_INDEX = {'verdant':0, 'ember':1, 'frost':2, 'astral':3, 'origin':4}

PREFIXES = [
    '이끼','덩굴','청록','꽃가루','수목','유리','고목','초록','균사','수호',
    '잿불','용광','쇳물','탄화','붉은','고철','화염','용암','검댕','제련',
    '서리','빙결','백야','설원','수정','눈보라','한기','얼음','동결',
    '성광','별빛','혜성','공허','성좌','관측','월광','천체','밤하늘','은하',
    '기원','심연','봉인','금빛','원초','균열','검은','왕좌','종말','만상'
]


def clamp(v): return max(0, min(255, int(v)))
def rgba(c, a=255): return (c[0], c[1], c[2], a)
def shade(c, f=.72): return tuple(clamp(x*f) for x in c[:3]) + (c[3] if len(c)>3 else 255,)
def light(c, f=1.18): return tuple(clamp(x*f) for x in c[:3]) + (c[3] if len(c)>3 else 255,)
def mix(a,b,t=.5): return tuple(clamp(a[i]*(1-t)+b[i]*t) for i in range(3))
def rr(d, box, fill, outline=INK, w=2, r=5): d.rounded_rectangle(box, r, fill=fill, outline=outline, width=w)
def ell(d, box, fill, outline=INK, w=2): d.ellipse(box, fill=fill, outline=outline, width=w)
def poly(d, pts, fill, outline=INK, w=2):
    d.polygon(pts, fill=fill)
    if outline: d.line(pts+[pts[0]], fill=outline, width=w, joint='curve')
def line(d, pts, fill=INK, w=2): d.line(pts, fill=fill, width=w, joint='curve')

def eye(d, x, y, accent, kind='round', scale=1):
    if kind == 'slit':
        ell(d, (x-4*scale,y-3*scale,x+4*scale,y+3*scale), WHITE, INK, 2)
        line(d, [(x+1,y-2*scale),(x+1,y+2*scale)], accent, max(1,scale))
    elif kind == 'glow':
        ell(d, (x-3*scale,y-3*scale,x+3*scale,y+3*scale), light(accent,1.2), INK, 1)
        ell(d, (x-1*scale,y-1*scale,x+1*scale,y+1*scale), WHITE, None, 0)
    else:
        ell(d, (x-4*scale,y-4*scale,x+4*scale,y+4*scale), WHITE, INK, 2)
        ell(d, (x,y-1*scale,x+3*scale,y+2*scale), accent, None, 0)
        d.point((x+1,y-1*scale), fill=WHITE)

def face_side(d, x, y, base, accent, mood='cute'):
    if mood=='predator':
        eye(d,x,y,accent,'slit'); line(d,[(x+7,y+7),(x+13,y+8),(x+8,y+11)],shade(base,.5),2)
        poly(d,[(x+8,y+8),(x+11,y+13),(x+13,y+8)],WHITE,INK,1)
    elif mood=='mystic':
        eye(d,x,y,accent,'glow'); line(d,[(x+6,y+8),(x+10,y+7)],shade(base,.5),2)
    else:
        eye(d,x,y,accent,'round'); line(d,[(x+6,y+7),(x+11,y+8),(x+7,y+10)],shade(base,.5),2)

def palette(mon, mode='base'):
    b0,b1,b2 = BIOME.get(mon.get('biome'), BIOME['verdant'])
    e = ELEMENT.get(mon.get('element'), (130,180,155))
    base = mix(b1, e, .25)
    dark = rgba(mix(b0, e, .12))
    mid = rgba(base)
    bright = rgba(mix(b2, e, .32))
    accent = rgba(mix(e, b2, .10))
    hi = rgba(light(accent,1.22)[:3])
    if mode=='resonance': accent,hi = rgba(mix(e,(243,224,157),.38)), rgba((250,240,192))
    elif mode=='rift': dark,accent,hi = rgba(mix(b0,(34,18,46),.55)), rgba(mix(e,(182,70,203),.38)), rgba((239,149,249))
    return {'dark':dark,'mid':mid,'bright':bright,'accent':accent,'hi':hi}

def prefix_of(name):
    for p in sorted(PREFIXES, key=len, reverse=True):
        if name.startswith(p+' ') or name.startswith(p): return p
    return name.split()[0] if name else ''

def variant(mon):
    if mon['id'].startswith('b'): return 0
    local = int(mon.get('variant',0))
    return (BIOME_INDEX.get(mon.get('biome'),0)*2 + local) % 10

def body_slime(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        pts=[(23,82),(20,67),(25,49),(38,38),(60,34),(78,40),(91,53),(96,71),(91,84),(77,91),(42,91)]
        poly(d,pts,m); ell(d,(28,77,44,96),m); ell(d,(51,82,66,98),m); ell(d,(75,78,90,95),m)
        ell(d,(39,48,65,62),p['bright'],None,0); face_side(d,72,61,m,a,'cute')
    elif k==1:
        pts=[(35,91),(29,70),(32,47),(44,27),(62,18),(80,29),(91,50),(88,76),(77,93)]
        poly(d,pts,m); poly(d,[(47,27),(58,10),(66,28)],p['bright']); ell(d,(43,36,64,53),p['bright'],None,0); face_side(d,72,52,m,a)
        for x in (38,53,70,83): ell(d,(x,83,x+9,98),dark)
    elif k==2:
        ell(d,(24,49,68,90),m); ell(d,(58,36,103,88),p['bright']); poly(d,[(54,53),(67,42),(70,67)],m,None,0)
        face_side(d,79,57,p['bright'],a,'mystic'); ell(d,(31,72,44,95),m); ell(d,(74,77,87,96),p['bright'])
    elif k==3:
        rr(d,(29,38,93,91),dark,INK,3,16); rr(d,(34,43,88,87),m,INK,2,13); poly(d,[(35,43),(58,29),(87,44),(72,50),(53,43)],p['bright'])
        face_side(d,70,61,m,a,'predator'); poly(d,[(31,79),(20,92),(40,89)],a); poly(d,[(86,77),(103,89),(82,90)],a)
    else:
        ell(d,(36,27,91,72),m); face_side(d,73,48,m,a,'mystic')
        for x,y in [(41,64),(52,69),(65,66),(78,68),(87,62)]:
            line(d,[(x,y),(x-4,y+20),(x+2,y+29)],dark,4)
        poly(d,[(48,32),(58,17),(65,34)],h); poly(d,[(79,32),(88,19),(86,39)],a)

def body_wing(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: # bat
        ell(d,(49,36,77,76),dark); poly(d,[(52,49),(19,27),(27,55),(12,71),(50,65)],m); poly(d,[(74,48),(105,26),(98,55),(116,68),(76,66)],p['bright']); poly(d,[(53,40),(46,24),(61,35)],dark); face_side(d,68,48,dark,a,'predator')
    elif k==1: # moth
        ell(d,(54,31,72,82),dark); poly(d,[(54,43),(27,21),(19,58),(45,76),(57,61)],m); poly(d,[(71,43),(99,21),(108,57),(82,76),(70,61)],p['bright']); ell(d,(31,36,46,51),a,None,0); ell(d,(86,35,101,50),a,None,0); line(d,[(60,33),(54,18)],h,2); line(d,[(67,33),(74,17)],h,2); face_side(d,66,40,dark,a)
    elif k==2: # raven
        poly(d,[(34,70),(46,35),(64,24),(82,38),(103,52),(82,54),(97,83),(68,69),(53,89)],dark); poly(d,[(61,31),(74,17),(80,38)],m); poly(d,[(83,42),(111,38),(96,55)],a); face_side(d,75,40,dark,h,'predator')
    elif k==3: # manta
        poly(d,[(12,59),(42,36),(67,39),(91,27),(115,53),(96,69),(74,66),(66,88),(55,68),(30,74)],m); poly(d,[(23,58),(48,45),(68,48),(95,39),(106,52),(89,57),(72,57),(66,68),(54,57),(34,63)],p['bright'],None,0); face_side(d,75,51,m,a,'mystic')
    else: # drake wing
        ell(d,(50,39,79,75),m); poly(d,[(52,45),(30,22),(18,27),(27,47),(14,63),(49,67)],dark); poly(d,[(76,44),(96,20),(109,28),(100,48),(115,62),(79,65)],p['bright']); poly(d,[(57,39),(52,18),(66,35)],a); poly(d,[(72,39),(80,17),(78,43)],h); face_side(d,69,48,m,a,'predator'); poly(d,[(72,72),(89,92),(78,77)],dark)

def body_beast(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: # wolf
        poly(d,[(24,74),(28,54),(43,42),(69,42),(84,52),(101,55),(96,72),(75,77),(47,77)],m); poly(d,[(70,45),(80,28),(89,48)],dark); poly(d,[(83,49),(98,43),(104,55),(96,62)],p['bright']); face_side(d,88,55,m,a,'predator');
        for x in (33,51,72,88): rr(d,(x,71,x+8,94),dark,INK,2,2)
        poly(d,[(29,57),(13,48),(25,70)],a)
    elif k==1: # fox/cat
        ell(d,(35,42,78,77),m); ell(d,(67,34,101,67),p['bright']); poly(d,[(72,37),(73,19),(84,35)],p['bright']); poly(d,[(93,39),(103,22),(99,47)],p['bright']); face_side(d,88,48,p['bright'],a); poly(d,[(38,57),(17,38),(12,56),(29,70)],dark); rr(d,(44,70,53,94),dark); rr(d,(76,66,85,92),dark)
    elif k==2: # boar
        ell(d,(28,42,84,78),dark); ell(d,(67,45,104,70),m); face_side(d,89,54,m,a,'predator'); poly(d,[(94,62),(108,69),(99,72)],WHITE); poly(d,[(76,45),(83,29),(89,47)],a); forx=[36,52,69,83]
        for x in forx: rr(d,(x,70,x+10,94),dark,INK,2,2)
    elif k==3: # stag
        ell(d,(33,43,77,75),m); ell(d,(68,34,98,62),p['bright']); face_side(d,84,44,p['bright'],a,'mystic'); rr(d,(42,68,50,96),dark); rr(d,(68,65,76,94),dark); line(d,[(77,34),(71,16),(64,10)],a,3); line(d,[(79,31),(86,14),(94,10)],a,3); line(d,[(72,20),(62,17)],a,2); line(d,[(86,20),(97,17)],a,2); poly(d,[(35,51),(19,39),(27,62)],m)
    else: # lion
        ell(d,(30,42,79,78),m); ell(d,(63,27,103,68),dark); ell(d,(70,34,101,63),p['bright']); face_side(d,87,46,p['bright'],a,'predator'); poly(d,[(76,32),(72,19),(85,31)],a); rr(d,(40,70,50,95),dark); rr(d,(72,69,82,95),dark); line(d,[(32,58),(17,72),(12,61)],dark,4); ell(d,(8,55,17,65),a)

def body_spirit(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        ell(d,(46,26,80,58),m); poly(d,[(45,52),(34,88),(49,76),(59,96),(70,76),(86,89),(81,53)],m); face_side(d,67,39,m,a,'mystic')
    elif k==1:
        poly(d,[(46,33),(64,18),(82,34),(84,68),(72,91),(62,76),(51,92),(42,67)],dark); ell(d,(51,31,78,55),m); face_side(d,67,40,m,a); poly(d,[(51,28),(42,18),(55,21)],a); poly(d,[(76,28),(87,18),(80,34)],a)
    elif k==2:
        ell(d,(52,31,77,56),p['bright']); face_side(d,67,41,p['bright'],a); poly(d,[(51,44),(31,32),(39,56),(50,62)],m); poly(d,[(77,44),(98,31),(90,56),(78,62)],m); line(d,[(62,55),(58,86)],dark,4); line(d,[(72,55),(78,86)],dark,4); ell(d,(54,83,62,93),a); ell(d,(76,83,84,93),a)
    elif k==3:
        rr(d,(48,24,83,75),dark,INK,2,14); ell(d,(54,30,77,53),m); face_side(d,67,39,m,a,'mystic'); rr(d,(54,65,77,89),p['bright'],INK,2,5); ell(d,(59,70,72,84),a,None,0); line(d,[(65,24),(65,13)],h,2); ell(d,(61,9,69,16),h)
    else:
        ell(d,(45,28,84,66),dark); ell(d,(51,34,78,60),m); face_side(d,68,44,m,a,'mystic');
        for ang in (-65,-25,20,60,100):
            r=35; x=65+int(math.cos(math.radians(ang))*r); y=48+int(math.sin(math.radians(ang))*r); ell(d,(x-6,y-6,x+6,y+6),a,None,0)
        poly(d,[(50,61),(42,91),(58,78),(66,96),(75,78),(88,89),(79,61)],m)

def body_watcher(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        ell(d,(30,25,98,89),dark); ell(d,(40,34,90,79),m); ell(d,(52,45,82,70),WHITE); ell(d,(61,51,76,65),a); ell(d,(66,54,72,61),WHITE,None,0)
        for ang in range(0,360,60):
            x=64+int(math.cos(math.radians(ang))*42); y=56+int(math.sin(math.radians(ang))*34); rr(d,(x-5,y-5,x+5,y+5),p['bright'],INK,1,2)
    elif k==1:
        poly(d,[(31,58),(43,31),(71,22),(98,39),(105,66),(88,89),(55,92),(32,78)],m); ell(d,(56,38,89,69),WHITE); ell(d,(67,45,83,62),a); poly(d,[(44,34),(36,17),(52,31)],dark); poly(d,[(96,43),(112,35),(103,56)],dark)
    elif k==2:
        rr(d,(36,31,94,84),dark,INK,3,8); rr(d,(45,40,86,74),m,INK,2,6); ell(d,(55,47,80,68),WHITE); ell(d,(65,52,76,63),a); rr(d,(24,49,39,69),p['bright']); rr(d,(92,49,107,69),p['bright']); line(d,[(65,31),(65,15)],h,3); ell(d,(60,9,70,18),a)
    elif k==3:
        ell(d,(47,27,83,61),m); ell(d,(55,35,78,56),WHITE); ell(d,(64,41,75,52),a); forx=[34,47,61,75,88]
        for i,x in enumerate(forx): ell(d,(x,61+i%2*4,x+13,79+i%2*4),dark); eye(d, x+7, 68+i%2*4, a,'glow',1)
    else:
        ell(d,(34,29,96,84),dark); ell(d,(45,38,88,75),m); ell(d,(57,46,83,69),WHITE); ell(d,(66,52,78,64),a); d.arc((22,15,108,96),195,345,fill=h,width=3); d.arc((28,21,102,90),200,340,fill=a,width=2); poly(d,[(37,40),(25,30),(36,57)],p['bright']); poly(d,[(94,40),(107,30),(96,57)],p['bright'])

def body_insect(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: # beetle
        ell(d,(44,34,79,83),dark); ell(d,(48,38,75,78),m); ell(d,(50,24,74,49),p['bright']); face_side(d,65,33,p['bright'],a); poly(d,[(46,45),(24,35),(31,67),(47,65)],a); poly(d,[(77,45),(98,35),(91,67),(76,65)],a); line(d,[(54,26),(45,13)],h,2); line(d,[(69,26),(80,13)],h,2)
        for y in (51,64,76): line(d,[(45,y),(28,y+(-10 if y%2 else 10))],dark,3); line(d,[(78,y),(96,y+(-10 if y%2 else 10))],dark,3)
    elif k==1: # mantis
        ell(d,(53,35,73,79),m); ell(d,(51,24,77,46),p['bright']); face_side(d,67,32,p['bright'],a,'predator'); poly(d,[(52,48),(28,38),(40,62)],a); poly(d,[(74,48),(98,38),(86,62)],a); line(d,[(55,54),(30,76),(23,68)],dark,4); line(d,[(73,54),(99,76),(106,68)],dark,4); line(d,[(58,27),(48,12)],h,2); line(d,[(70,27),(82,12)],h,2)
    elif k==2: # scorpion
        ell(d,(35,48,74,76),m); ell(d,(64,42,90,68),p['bright']); face_side(d,78,50,p['bright'],a,'predator'); line(d,[(40,67),(23,82)],dark,4); line(d,[(52,72),(42,93)],dark,4); line(d,[(68,70),(77,92)],dark,4); line(d,[(89,58),(104,64),(111,51),(105,37)],a,5); poly(d,[(102,38),(110,27),(113,42)],h); poly(d,[(35,53),(18,44),(20,61)],a)
    elif k==3: # moth insect
        ell(d,(55,33,72,80),dark); ell(d,(53,24,75,44),m); face_side(d,66,31,m,a); poly(d,[(56,42),(25,27),(17,59),(49,72)],p['bright']); poly(d,[(71,42),(100,27),(109,59),(78,72)],p['bright']); ell(d,(29,39,42,52),a,None,0); ell(d,(85,39,98,52),a,None,0); line(d,[(59,26),(49,13)],h,2); line(d,[(70,26),(81,13)],h,2)
    else: # armored crawler
        ell(d,(26,48,87,78),dark)
        for i,x in enumerate((30,43,56,69)):
            ell(d,(x,43-i%2*2,x+23,75), m if i%2==0 else p['bright'])
        ell(d,(77,39,101,66),p['bright']); face_side(d,90,48,p['bright'],a,'predator')
        for x in (34,49,65,81): line(d,[(x,72),(x-8,91)],dark,4)

def body_golem(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        poly(d,[(38,29),(52,18),(78,23),(91,39),(87,75),(74,92),(45,88),(29,69),(30,45)],m); poly(d,[(35,43),(16,55),(25,76),(40,67)],dark); poly(d,[(88,43),(108,55),(98,77),(83,67)],p['bright']); face_side(d,72,43,m,a,'mystic'); line(d,[(48,69),(76,33)],h,3)
    elif k==1:
        rr(d,(38,29,84,77),m,INK,3,7); rr(d,(46,20,76,43),p['bright'],INK,2,5); face_side(d,66,31,p['bright'],a,'mystic'); rr(d,(15,38,38,78),dark,INK,3,6); rr(d,(84,42,109,73),dark,INK,3,6); rr(d,(44,74,58,98),dark); rr(d,(67,74,81,98),dark)
    elif k==2:
        rr(d,(48,38,82,72),m,INK,3,5); face_side(d,69,49,m,a,'mystic')
        for box in [(21,31,42,52),(88,26,108,47),(28,74,49,94),(87,71,107,91)]:
            rr(d,box,p['bright'],INK,2,4)
        line(d,[(42,46),(48,52)],a,2); line(d,[(82,48),(88,40)],a,2); line(d,[(48,69),(42,78)],a,2); line(d,[(82,67),(91,76)],a,2)
    elif k==3:
        poly(d,[(23,64),(34,43),(63,35),(89,44),(104,66),(91,83),(62,86),(35,82)],m); poly(d,[(35,45),(28,28),(48,42)],p['bright']); poly(d,[(83,46),(95,27),(95,55)],p['bright']); face_side(d,82,52,m,a,'mystic')
        for x in (34,52,74,90): rr(d,(x,77,x+10,98),dark)
    else:
        rr(d,(37,30,90,84),dark,INK,3,10); poly(d,[(42,35),(64,20),(86,35),(78,78),(49,78)],m); face_side(d,72,43,m,a,'predator'); poly(d,[(40,44),(16,35),(22,69),(39,72)],p['bright']); poly(d,[(88,43),(111,34),(105,69),(88,72)],p['bright']); poly(d,[(54,30),(65,11),(76,31)],a)

def body_mimic(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        rr(d,(24,45,99,87),dark,INK,3,5); poly(d,[(24,47),(35,28),(88,28),(99,47)],m); rr(d,(56,45,68,61),a); eye(d,43,44,a,'glow'); eye(d,82,44,a,'glow'); poly(d,[(31,66),(40,58),(49,66),(59,58),(69,66),(79,58),(91,66),(91,79),(31,79)],WHITE,INK,1)
    elif k==1: # jar mimic
        rr(d,(39,25,89,87),m,INK,3,12); rr(d,(45,18,83,32),dark,INK,2,4); ell(d,(48,41,80,70),p['bright']); eye(d,60,50,a,'slit'); poly(d,[(43,75),(26,84),(39,93)],a); poly(d,[(85,75),(103,84),(89,94)],a)
    elif k==2: # book mimic
        poly(d,[(22,39),(55,29),(106,39),(92,82),(55,89),(23,76)],dark); poly(d,[(27,42),(57,34),(99,42),(88,76),(56,82),(28,72)],m); line(d,[(57,35),(56,81)],a,3); eye(d,74,51,a,'glow'); poly(d,[(31,69),(40,61),(49,69)],WHITE); poly(d,[(76,72),(85,63),(92,72)],WHITE)
    elif k==3: # door mimic
        rr(d,(37,23,92,92),dark,INK,3,3); rr(d,(44,30,85,87),m,INK,2,2); eye(d,72,52,a,'slit'); ell(d,(77,66,84,73),h); poly(d,[(44,84),(27,98),(53,91)],a); poly(d,[(85,83),(107,96),(80,91)],a)
    else: # flower trap
        ell(d,(41,43,90,82),dark)
        for ang in range(0,360,60):
            x=65+int(math.cos(math.radians(ang))*27); y=52+int(math.sin(math.radians(ang))*22); ell(d,(x-12,y-8,x+12,y+8),m)
        ell(d,(50,42,82,70),p['bright']); eye(d,68,50,a,'glow'); poly(d,[(54,65),(62,58),(68,65),(74,58),(80,65)],WHITE,INK,1); line(d,[(65,77),(65,98)],dark,5)

def body_priest(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        poly(d,[(45,42),(63,24),(80,42),(91,94),(32,94)],dark); ell(d,(49,33,77,60),m); face_side(d,67,43,m,a,'mystic'); rr(d,(57,66,71,89),a); line(d,[(85,47),(101,94)],INK,4); ell(d,(91,24,108,41),h)
    elif k==1:
        ell(d,(49,28,79,57),m); face_side(d,68,40,m,a,'mystic'); poly(d,[(45,52),(30,80),(43,94),(62,75),(79,94),(97,79),(84,51)],dark); d.arc((38,11,94,69),198,340,fill=h,width=3); line(d,[(39,58),(20,82)],a,4)
    elif k==2:
        rr(d,(43,30,84,75),dark,INK,3,10); poly(d,[(49,36),(63,23),(78,36),(76,66),(51,66)],m); eye(d,70,44,a,'glow'); poly(d,[(42,65),(25,93),(53,84)],p['bright']); poly(d,[(84,65),(102,93),(74,84)],p['bright']); poly(d,[(55,29),(63,13),(72,29)],h)
    elif k==3:
        ell(d,(52,28,78,53),m); face_side(d,67,38,m,a,'mystic'); poly(d,[(48,48),(30,36),(37,62),(50,69)],p['bright']); poly(d,[(80,48),(99,36),(91,62),(78,69)],p['bright']); poly(d,[(49,55),(39,93),(63,79),(83,93),(78,55)],dark); ell(d,(58,64,72,78),a,None,0)
    else:
        poly(d,[(42,39),(63,22),(86,39),(89,82),(76,96),(54,91),(35,78)],dark); ell(d,(50,31,78,56),m); face_side(d,67,41,m,a,'mystic'); line(d,[(41,52),(20,43)],a,3); line(d,[(88,52),(108,44)],a,3); d.arc((36,10,91,61),200,340,fill=h,width=3)

def body_knight(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    rr(d,(47,33,82,70),m,INK,3,6); rr(d,(49,24,79,44),dark,INK,3,5); line(d,[(55,35),(74,35)],h,2); eye(d,70,34,a,'glow')
    if k==0: rr(d,(42,67,73,92),dark); poly(d,[(47,48),(26,50),(25,79),(44,72)],a); line(d,[(83,45),(103,91)],h,5)
    elif k==1: rr(d,(42,67,75,92),dark); poly(d,[(45,46),(22,37),(25,77),(46,70)],p['bright']); line(d,[(81,44),(110,66)],h,4); poly(d,[(107,61),(116,67),(106,72)],h)
    elif k==2: poly(d,[(40,66),(76,66),(83,90),(32,90)],dark); line(d,[(84,46),(108,28)],h,4); line(d,[(91,39),(110,55)],h,2); poly(d,[(50,25),(62,11),(76,25)],a)
    elif k==3: rr(d,(42,65,76,93),dark); line(d,[(42,55),(20,37)],h,4); line(d,[(82,54),(107,37)],h,4); poly(d,[(51,24),(47,9),(62,22)],a)
    else: poly(d,[(38,66),(78,66),(92,92),(28,92)],dark); poly(d,[(45,49),(22,45),(18,72),(41,74)],a); line(d,[(84,45),(103,23)],h,5); poly(d,[(49,26),(62,12),(76,26)],p['bright'])

def body_assassin(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        poly(d,[(43,31),(64,19),(84,31),(91,55),(80,92),(45,92),(34,55)],dark); rr(d,(47,39,79,55),m,INK,2,4); eye(d,68,46,a,'slit'); line(d,[(37,68),(15,87)],h,4); line(d,[(88,65),(111,82)],h,4)
    elif k==1:
        ell(d,(48,31,80,61),m); face_side(d,69,42,m,a,'predator'); poly(d,[(48,52),(30,43),(39,67)],dark); poly(d,[(80,52),(100,42),(90,68)],dark); line(d,[(51,62),(27,88)],h,4); line(d,[(76,62),(101,87)],h,4); poly(d,[(50,31),(42,18),(59,27)],a)
    elif k==2:
        ell(d,(42,39,78,72),dark); ell(d,(67,34,96,61),m); face_side(d,83,44,m,a,'predator'); rr(d,(46,67,55,94),dark); rr(d,(72,62,81,92),dark); poly(d,[(42,48),(23,35),(29,61)],a); line(d,[(94,55),(111,42)],h,3)
    elif k==3:
        poly(d,[(45,34),(63,20),(81,34),(87,77),(73,94),(50,87),(36,69)],dark); rr(d,(49,40,77,55),m); eye(d,68,47,a,'slit'); line(d,[(37,50),(19,34)],h,3); line(d,[(84,52),(108,38)],h,3); line(d,[(50,76),(29,88)],a,2); line(d,[(76,75),(98,88)],a,2)
    else:
        poly(d,[(39,35),(62,17),(88,36),(90,78),(76,95),(45,89),(29,65)],dark); rr(d,(46,41,80,56),m); eye(d,69,48,a,'slit'); poly(d,[(31,55),(15,61),(31,70)],a); poly(d,[(88,54),(112,61),(90,70)],a); d.arc((29,18,96,91),210,320,fill=h,width=2)

def body_wraith(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: poly(d,[(43,38),(56,23),(76,25),(88,43),(94,72),(80,93),(68,80),(58,98),(48,82),(29,91),(33,59)],dark); ell(d,(49,33,80,59),m); face_side(d,68,43,m,a,'mystic')
    elif k==1: ell(d,(47,26,83,60),dark); ell(d,(54,34,77,54),m); eye(d,69,43,a,'glow'); poly(d,[(43,53),(24,78),(46,73),(54,94),(66,77),(79,96),(96,72),(82,53)],dark); line(d,[(39,52),(19,42)],a,3)
    elif k==2: ell(d,(48,24,82,55),m); poly(d,[(53,33),(59,29),(62,36)],INK,None,0); poly(d,[(70,32),(77,29),(75,37)],INK,None,0); poly(d,[(47,51),(34,86),(52,78),(61,98),(72,77),(92,88),(83,51)],dark); poly(d,[(47,29),(55,14),(60,28)],a); poly(d,[(78,29),(87,15),(83,35)],a)
    elif k==3: rr(d,(48,29,81,58),dark,INK,2,13); eye(d,69,42,a,'glow'); line(d,[(47,49),(24,72),(17,61)],dark,5); line(d,[(82,49),(105,73),(112,60)],dark,5); poly(d,[(48,53),(34,89),(54,79),(66,98),(80,78),(94,90),(81,53)],m)
    else: ell(d,(46,28,84,63),dark); ell(d,(54,36,78,58),m); eye(d,69,46,a,'glow'); d.arc((29,18,100,91),195,345,fill=a,width=3); poly(d,[(43,57),(28,86),(50,76),(60,98),(72,76),(94,89),(85,57)],dark)

def body_tyrant(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        ell(d,(39,31,83,70),m); poly(d,[(43,38),(31,17),(55,31)],dark); poly(d,[(80,38),(93,17),(69,31)],dark); face_side(d,70,45,m,a,'predator'); rr(d,(39,66,52,97),dark); rr(d,(72,66,85,97),dark); poly(d,[(39,59),(17,50),(24,77),(43,76)],a); poly(d,[(83,58),(108,48),(100,78),(81,76)],a)
    elif k==1:
        ell(d,(34,38,82,75),dark); ell(d,(69,33,101,66),m); face_side(d,87,43,m,a,'predator'); poly(d,[(74,36),(75,17),(86,33)],a); rr(d,(42,70,53,97),dark); rr(d,(72,66,83,95),dark); poly(d,[(35,49),(20,28),(31,60)],p['bright']); line(d,[(35,60),(15,79)],dark,4)
    elif k==2:
        rr(d,(39,29,87,77),dark,INK,3,14); ell(d,(49,35,82,62),m); face_side(d,70,45,m,a,'predator'); poly(d,[(44,31),(29,12),(55,28)],a); poly(d,[(82,32),(98,13),(75,30)],a); rr(d,(40,73,54,98),dark); rr(d,(72,73,86,98),dark); poly(d,[(38,49),(13,40),(17,72),(38,73)],p['bright'])
    elif k==3:
        ell(d,(41,34,86,72),m); poly(d,[(47,38),(34,15),(58,31)],dark); poly(d,[(82,37),(94,14),(72,31)],dark); face_side(d,72,45,m,a,'predator'); poly(d,[(42,60),(23,82),(42,82)],a); poly(d,[(86,59),(108,80),(87,82)],a); rr(d,(50,69,61,97),dark); rr(d,(75,68,86,97),dark)
    else:
        ell(d,(36,30,88,74),dark); ell(d,(46,36,82,66),m); face_side(d,72,45,m,a,'predator'); poly(d,[(40,37),(22,14),(51,30)],a); poly(d,[(84,37),(104,14),(75,30)],a); rr(d,(41,69,55,98),dark); rr(d,(73,69,87,98),dark); d.arc((29,19,98,88),200,340,fill=h,width=3)

def body_serpent(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        d.arc((20,44,98,104),10,320,fill=INK,width=18); d.arc((20,44,98,104),10,320,fill=m,width=12); ell(d,(66,27,101,58),m); face_side(d,86,39,m,a,'predator'); poly(d,[(74,31),(62,16),(80,26)],a); poly(d,[(95,31),(108,17),(100,41)],a)
    elif k==1:
        d.arc((25,38,96,105),10,315,fill=INK,width=20); d.arc((25,38,96,105),10,315,fill=dark,width=14); ell(d,(61,24,101,59),m); poly(d,[(61,36),(47,22),(67,25)],a); poly(d,[(100,34),(112,22),(105,46)],a); face_side(d,87,37,m,h,'predator'); line(d,[(95,48),(112,51)],h,2)
    elif k==2:
        d.arc((19,47,95,105),5,315,fill=INK,width=17); d.arc((19,47,95,105),5,315,fill=m,width=11); ell(d,(62,28,100,57),p['bright']); face_side(d,87,39,p['bright'],a,'mystic')
        for x,y in [(32,76),(45,61),(58,52),(72,47)]: poly(d,[(x,y),(x+4,y-13),(x+9,y)],a)
    elif k==3:
        d.arc((15,45,91,103),5,310,fill=INK,width=16); d.arc((15,45,91,103),5,310,fill=dark,width=10); ell(d,(58,24,102,58),m); face_side(d,88,38,m,a,'predator'); poly(d,[(61,34),(45,20),(65,25)],h); poly(d,[(87,27),(91,10),(98,29)],a); poly(d,[(71,29),(74,13),(81,31)],a)
    else:
        d.arc((22,46,102,107),0,318,fill=INK,width=21); d.arc((22,46,102,107),0,318,fill=m,width=14); ell(d,(64,27,103,61),dark); ell(d,(70,33,98,56),p['bright']); face_side(d,88,42,p['bright'],a,'mystic'); d.arc((56,13,111,67),190,330,fill=h,width=3)

def body_crab(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0:
        ell(d,(39,47,86,78),m); ell(d,(46,34,57,49),m); ell(d,(68,34,79,49),m); eye(d,51,38,a); eye(d,73,38,a); poly(d,[(40,54),(18,40),(11,57),(27,72)],a); poly(d,[(85,54),(108,40),(115,57),(98,72)],a)
    elif k==1:
        ell(d,(36,45,88,78),dark); ell(d,(45,38,79,68),m); face_side(d,72,49,m,a,'predator'); poly(d,[(37,52),(15,48),(21,72),(39,67)],p['bright']); poly(d,[(87,52),(111,48),(104,74),(85,67)],p['bright']); line(d,[(41,72),(28,94)],dark,4); line(d,[(80,72),(94,94)],dark,4)
    elif k==2:
        ell(d,(42,48,88,79),m); poly(d,[(41,50),(31,29),(51,42)],dark); poly(d,[(85,50),(99,28),(77,42)],dark); eye(d,57,51,a); eye(d,74,51,a); poly(d,[(42,57),(17,39),(11,57),(30,74)],a); poly(d,[(88,57),(112,40),(117,58),(99,75)],a); ell(d,(50,28,79,51),p['bright'])
    elif k==3:
        ell(d,(34,49,91,77),m); eye(d,59,52,a); eye(d,75,52,a); poly(d,[(37,55),(14,48),(19,70),(39,68)],dark); poly(d,[(89,55),(114,48),(108,70),(88,68)],dark)
        for x in (40,53,70,84): line(d,[(x,72),(x-11 if x<64 else x+11,94)],dark,3)
    else:
        rr(d,(35,44,94,78),dark,INK,3,14); rr(d,(46,49,84,72),m,INK,2,10); eye(d,62,54,a,'glow'); eye(d,75,54,a,'glow'); poly(d,[(36,52),(12,43),(16,72),(38,68)],a); poly(d,[(93,52),(116,43),(111,73),(90,69)],a); line(d,[(47,77),(35,96)],dark,4); line(d,[(83,77),(96,96)],dark,4)

def body_mushroom(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: ell(d,(25,23,96,58),a); rr(d,(48,54,75,94),m,INK,2,8); face_side(d,67,68,m,a); ell(d,(38,34,49,44),h,None,0); ell(d,(70,31,82,42),h,None,0)
    elif k==1: poly(d,[(28,56),(39,20),(84,19),(99,56)],a); rr(d,(49,52,77,95),m,INK,2,6); face_side(d,68,67,m,a,'mystic'); ell(d,(48,31,59,41),h,None,0); ell(d,(73,28,84,39),h,None,0)
    elif k==2:
        rr(d,(53,58,75,94),m,INK,2,6); face_side(d,67,70,m,a)
        for x,y,s in [(34,40,22),(61,26,28),(86,43,20)]:
            ell(d,(x-s//2,y-s//3,x+s//2,y+s//3),a); line(d,[(x,y+s//4),(64,62)],dark,3)
    elif k==3:
        ell(d,(35,35,93,77),m); face_side(d,70,54,m,a,'mystic')
        for ang in range(0,360,60):
            x=64+int(math.cos(math.radians(ang))*34); y=56+int(math.sin(math.radians(ang))*25); ell(d,(x-7,y-5,x+7,y+5),a,None,0)
    else: poly(d,[(31,57),(43,25),(82,24),(99,56),(88,72),(75,65),(69,94),(51,92),(47,65)],a); ell(d,(50,49,80,76),m); face_side(d,68,58,m,h,'predator'); poly(d,[(45,54),(32,68),(50,69)],dark); poly(d,[(84,54),(97,68),(79,69)],dark)

def body_drone(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: rr(d,(46,42,83,72),dark,INK,3,8); rr(d,(52,47,77,66),m); ell(d,(59,50,72,62),a); line(d,[(47,50),(27,35)],INK,4); line(d,[(82,50),(102,35)],INK,4); ell(d,(16,23,38,44),h); ell(d,(92,23,113,44),h); rr(d,(57,75,72,82),a)
    elif k==1:
        ell(d,(43,33,87,77),dark); ell(d,(51,41,79,69),m); ell(d,(60,49,72,61),a)
        for ang in (45,135,225,315):
            x=65+int(math.cos(math.radians(ang))*39); y=55+int(math.sin(math.radians(ang))*30); line(d,[(65,55),(x,y)],INK,3); ell(d,(x-7,y-7,x+7,y+7),h)
    elif k==2: poly(d,[(65,24),(105,73),(65,83),(24,73)],dark); poly(d,[(65,31),(95,68),(65,76),(35,68)],m); ell(d,(59,49,73,63),a); line(d,[(65,24),(65,11)],h,2); ell(d,(60,7,70,15),h)
    elif k==3: ell(d,(42,39,86,75),m); poly(d,[(47,45),(29,27),(35,55)],dark); poly(d,[(82,45),(101,27),(94,56)],dark); ell(d,(55,46,78,65),p['bright']); eye(d,69,53,a,'glow'); line(d,[(51,71),(38,91)],INK,3); line(d,[(77,71),(91,91)],INK,3)
    else:
        ell(d,(51,40,78,69),m); ell(d,(58,47,72,62),a); d.arc((20,16,108,94),195,345,fill=h,width=4)
        for ang in (205,245,285,325):
            x=64+int(math.cos(math.radians(ang))*44); y=55+int(math.sin(math.radians(ang))*35); ell(d,(x-4,y-4,x+4,y+4),p['bright'],None,0)

def body_leviathan(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: ell(d,(25,42,93,76),m); ell(d,(73,34,105,63),p['bright']); face_side(d,91,45,p['bright'],a,'mystic'); poly(d,[(31,47),(10,31),(20,66),(35,71)],a); poly(d,[(83,47),(107,30),(114,58),(94,67)],a); poly(d,[(49,45),(61,20),(69,46)],h)
    elif k==1: poly(d,[(17,63),(39,39),(68,36),(100,49),(114,69),(88,70),(70,84),(45,78)],m); poly(d,[(37,43),(23,22),(47,37)],dark); poly(d,[(74,41),(89,19),(91,50)],dark); face_side(d,91,52,m,a,'predator')
    elif k==2: ell(d,(22,39,96,78),dark); ell(d,(35,46,87,71),m); face_side(d,80,52,m,a,'mystic'); poly(d,[(27,53),(8,47),(14,74),(35,68)],p['bright']); poly(d,[(92,51),(116,47),(111,73),(91,67)],p['bright']); d.arc((35,21,92,65),200,340,fill=h,width=3)
    elif k==3: poly(d,[(28,44),(50,28),(78,31),(101,48),(105,76),(84,89),(55,84),(34,76)],dark); poly(d,[(38,49),(56,38),(75,40),(91,51),(91,71),(76,78),(54,74),(40,68)],m); face_side(d,82,50,m,a,'predator'); poly(d,[(38,47),(25,25),(51,41)],a); poly(d,[(90,48),(104,26),(98,59)],a)
    else: poly(d,[(13,58),(39,36),(66,39),(91,30),(115,55),(96,69),(75,67),(66,88),(54,68),(29,74)],m); poly(d,[(26,56),(49,45),(68,48),(96,40),(104,52),(87,58),(70,57),(65,70),(54,58),(36,64)],p['bright'],None,0); face_side(d,80,51,m,a,'mystic')

def body_phoenix(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: ell(d,(53,36,77,69),m); poly(d,[(55,45),(21,37),(34,70),(58,66)],a); poly(d,[(75,45),(107,36),(94,70),(72,66)],p['bright']); poly(d,[(60,37),(66,17),(73,39)],h); face_side(d,68,47,m,a); poly(d,[(58,65),(45,96),(66,82),(83,98),(78,65)],a)
    elif k==1:
        ell(d,(54,34,76,67),dark); face_side(d,68,44,dark,h,'predator')
        for yy,off in [(42,0),(52,5)]:
            poly(d,[(56,yy),(21-off,26+off),(31,61+off),(58,63)],m); poly(d,[(74,yy),(108+off,25+off),(99,61+off),(72,63)],p['bright'])
        poly(d,[(59,35),(66,14),(72,37)],h); poly(d,[(59,64),(45,98),(66,82),(84,97),(76,64)],a)
    elif k==2: poly(d,[(65,18),(75,39),(105,31),(88,54),(114,63),(80,66),(88,96),(65,78),(43,96),(51,66),(17,63),(43,54),(25,31),(56,39)],dark); ell(d,(54,41,76,65),m); face_side(d,68,48,m,a,'predator'); poly(d,[(61,38),(66,17),(72,40)],h)
    elif k==3:
        ell(d,(54,34,77,66),m); face_side(d,69,44,m,a); poly(d,[(55,45),(25,27),(35,67),(59,63)],p['bright']); poly(d,[(75,45),(105,27),(95,67),(72,63)],p['bright'])
        for x in (43,54,65,76,87): poly(d,[(x,66),(x-8,96),(x+3,83),(x+9,98)],a,None,0)
        poly(d,[(60,35),(66,15),(72,37)],h)
    else: ell(d,(51,35,79,69),dark); face_side(d,69,45,dark,a,'predator'); poly(d,[(55,45),(16,37),(31,73),(59,66)],m); poly(d,[(76,45),(115,37),(99,74),(72,66)],m); d.arc((31,16,101,77),200,340,fill=h,width=3); poly(d,[(61,36),(66,13),(73,38)],a); poly(d,[(57,65),(42,98),(65,82),(87,98),(78,65)],p['bright'])

def body_puppet(d,p,v):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; k=v%5
    if k==0: ell(d,(50,27,79,55),m); rr(d,(49,53,80,82),dark); face_side(d,68,39,m,a); line(d,[(49,60),(29,76)],INK,4); line(d,[(80,60),(99,76)],INK,4); line(d,[(57,82),(49,99)],INK,4); line(d,[(73,82),(80,99)],INK,4); line(d,[(33,20),(98,20)],a,2); line(d,[(58,28),(58,20)],a,2); line(d,[(72,28),(72,20)],a,2)
    elif k==1: rr(d,(48,28,81,55),m,INK,2,6); rr(d,(47,54,82,84),dark,INK,2,5); face_side(d,69,39,m,a,'mystic'); poly(d,[(49,31),(39,16),(58,25)],a); poly(d,[(78,31),(90,16),(73,26)],a); line(d,[(48,62),(24,68)],INK,4); line(d,[(82,62),(106,68)],INK,4); rr(d,(54,82,61,100),dark); rr(d,(71,82,78,100),dark)
    elif k==2: ell(d,(48,27,81,57),p['bright']); rr(d,(45,55,84,83),m); face_side(d,68,40,p['bright'],a); ell(d,(34,60,50,76),dark); ell(d,(80,60,96,76),dark); line(d,[(55,83),(47,99)],INK,4); line(d,[(75,83),(84,99)],INK,4); poly(d,[(49,34),(41,18),(58,29)],a)
    elif k==3: ell(d,(50,27,80,56),m); rr(d,(49,53,82,83),dark); face_side(d,68,40,m,a,'mystic'); line(d,[(48,61),(26,50)],INK,3); line(d,[(82,61),(105,50)],INK,3); line(d,[(57,82),(48,99)],INK,3); line(d,[(75,82),(83,99)],INK,3); d.arc((40,12,91,62),200,340,fill=h,width=2); ell(d,(30,44,43,57),a); ell(d,(88,44,101,57),a)
    else: poly(d,[(48,31),(64,18),(82,31),(83,55),(77,60),(83,82),(72,95),(58,91),(45,80),(51,59),(44,53)],dark); ell(d,(52,29,78,53),m); face_side(d,68,39,m,a,'mystic'); line(d,[(46,61),(24,72)],h,4); line(d,[(83,61),(106,72)],h,4); poly(d,[(54,29),(64,12),(74,29)],a)

DRAW = {
    'slime':body_slime, 'wing':body_wing, 'beast':body_beast, 'spirit':body_spirit,
    'watcher':body_watcher, 'insect':body_insect, 'golem':body_golem, 'mimic':body_mimic,
    'priest':body_priest, 'knight':body_knight, 'assassin':body_assassin, 'wraith':body_wraith,
    'tyrant':body_tyrant, 'serpent':body_serpent, 'crab':body_crab, 'mushroom':body_mushroom,
    'drone':body_drone, 'leviathan':body_leviathan, 'phoenix':body_phoenix, 'puppet':body_puppet,
}

def motif(d, mon, p, v):
    name = mon['name']; pref = prefix_of(name); m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']
    # Verdant motifs
    if pref=='이끼':
        for x,y in [(35,37),(52,27),(82,41)]: ell(d,(x,y,x+8,y+5),rgba((91,174,91)),None,0)
        poly(d,[(50,27),(46,17),(55,25)],rgba((152,221,119)),None,0)
    elif pref=='덩굴':
        d.arc((15,30,69,96),100,285,fill=rgba((84,170,88)),width=3); d.arc((62,20,115,88),255,85,fill=rgba((104,190,91)),width=3)
        poly(d,[(24,50),(18,44),(27,45)],rgba((159,222,120)),None,0); poly(d,[(99,51),(108,45),(104,55)],rgba((159,222,120)),None,0)
    elif pref=='청록':
        poly(d,[(24,55),(13,43),(18,64)],rgba((70,190,177)),None,0); poly(d,[(103,49),(116,38),(111,62)],rgba((96,213,196)),None,0)
    elif pref=='꽃가루':
        for ang in range(0,360,72):
            x=64+int(math.cos(math.radians(ang))*49); y=55+int(math.sin(math.radians(ang))*35); ell(d,(x-4,y-4,x+4,y+4),rgba((244,173,202)),None,0)
        ell(d,(60,7,68,15),rgba((250,220,111)),None,0)
    elif pref=='수목':
        line(d,[(43,37),(31,19),(24,15)],rgba((103,74,48)),4); line(d,[(81,35),(94,18),(101,16)],rgba((103,74,48)),4)
        poly(d,[(26,21),(19,14),(29,16)],rgba((90,163,81)),None,0); poly(d,[(96,21),(105,13),(101,24)],rgba((90,163,81)),None,0)
    elif pref=='유리':
        for pts in [[(30,45),(22,28),(40,39)],[(88,40),(101,23),(101,48)],[(65,24),(72,8),(77,28)]]: poly(d,pts,rgba((171,235,237)),rgba((65,139,158)),1)
    elif pref=='고목':
        line(d,[(45,35),(35,16),(27,11)],rgba((87,61,43)),5); line(d,[(36,19),(30,28)],rgba((87,61,43)),3); line(d,[(81,34),(91,14),(100,9)],rgba((87,61,43)),5); line(d,[(91,17),(102,25)],rgba((87,61,43)),3)
    elif pref=='초록':
        poly(d,[(56,27),(64,10),(72,28)],rgba((72,176,88)),None,0); poly(d,[(38,42),(25,30),(32,49)],rgba((97,197,92)),None,0); poly(d,[(88,43),(102,30),(96,50)],rgba((97,197,92)),None,0)
    elif pref=='균사':
        for x,y in [(28,27),(92,33),(21,72),(101,75)]:
            rr(d,(x,y+5,x+3,y+13),rgba((224,214,182)),None,0,1); ell(d,(x-3,y,x+6,y+7),rgba((180,104,163)),None,0)
    elif pref=='수호':
        d.arc((27,12,101,91),195,345,fill=rgba((216,223,172)),width=3); rr(d,(16,47,28,67),rgba((88,132,112)),INK,1,3); rr(d,(100,47,112,67),rgba((88,132,112)),INK,1,3)
    # Ember motifs
    elif pref=='잿불':
        for x,y in [(33,28),(92,37),(23,74)]: poly(d,[(x,y+8),(x+5,y-3),(x+9,y+8),(x+5,y+4)],rgba((241,110,56)),None,0)
    elif pref=='용광':
        rr(d,(52,11,61,28),rgba((81,65,60)),INK,1,2); rr(d,(72,14,80,31),rgba((81,65,60)),INK,1,2); line(d,[(56,11),(53,4)],rgba((83,83,83)),2); line(d,[(76,14),(80,6)],rgba((83,83,83)),2)
    elif pref=='쇳물':
        for x,y in [(35,71),(65,84),(93,65)]: ell(d,(x,y,x+5,y+10),rgba((255,148,54)),None,0)
        line(d,[(31,47),(43,54),(52,47)],rgba((255,184,65)),2)
    elif pref=='탄화':
        poly(d,[(28,45),(17,27),(37,39)],rgba((49,48,51)),None,0); poly(d,[(93,42),(108,29),(102,51)],rgba((49,48,51)),None,0); d.arc((50,3,82,31),205,335,fill=rgba((89,88,93)),width=3)
    elif pref=='붉은':
        poly(d,[(48,31),(53,13),(62,32)],rgba((188,49,45)),None,0); line(d,[(76,36),(86,48)],rgba((238,91,62)),2)
    elif pref=='고철':
        for x,y in [(25,44),(55,20),(91,59)]: rr(d,(x,y,x+9,y+7),rgba((111,119,119)),INK,1,1)
        for x,y in [(30,48),(62,24),(96,63)]: ell(d,(x,y,x+3,y+3),rgba((213,192,122)),None,0)
    elif pref=='화염':
        poly(d,[(46,31),(54,7),(62,25),(70,5),(80,35)],rgba((242,95,43)),None,0); poly(d,[(54,27),(62,13),(69,30)],rgba((255,190,55)),None,0)
    elif pref=='용암':
        for pts in [[(36,40),(43,50),(39,63),(50,72)],[(78,31),(73,45),(86,56)],[(67,75),(61,86),(71,92)]]: line(d,pts,rgba((255,146,44)),3)
    elif pref=='검댕':
        d.arc((48,0,83,29),200,340,fill=rgba((69,65,70)),width=5); ell(d,(34,35,45,45),rgba((50,50,53)),None,0); ell(d,(93,50,105,60),rgba((50,50,53)),None,0)
    elif pref=='제련':
        poly(d,[(47,25),(64,12),(81,26),(75,34),(53,34)],rgba((161,126,71)),INK,1); line(d,[(40,49),(91,49)],rgba((230,176,76)),2)
    # Frost motifs
    elif pref=='서리':
        for x in (27,47,68,91): poly(d,[(x,38),(x+4,22),(x+8,39)],rgba((202,241,248)),None,0)
    elif pref=='빙결':
        rr(d,(24,36,37,63),rgba((135,205,227,180)),rgba((75,140,170)),1,2); rr(d,(91,38,104,67),rgba((135,205,227,180)),rgba((75,140,170)),1,2)
    elif pref=='백야':
        d.arc((34,8,96,64),200,345,fill=rgba((229,238,255)),width=4); line(d,[(47,15),(81,15)],rgba((131,171,226)),2)
    elif pref=='설원':
        for x,y in [(25,31),(37,21),(94,31),(103,44)]: ell(d,(x,y,x+8,y+6),rgba((237,247,248)),None,0)
        line(d,[(33,34),(25,54)],rgba((226,241,244)),5)
    elif pref=='수정':
        for pts in [[(35,39),(42,16),(49,41)],[(81,36),(91,11),(98,42)],[(58,28),(64,6),(70,30)]]: poly(d,pts,rgba((154,224,239)),rgba((67,130,158)),1)
    elif pref=='눈보라':
        d.arc((13,12,115,99),185,355,fill=rgba((201,237,250)),width=3); d.arc((20,21,108,91),205,335,fill=rgba((126,195,225)),width=2)
    elif pref=='한기':
        for x,y in [(24,45),(96,38),(101,76)]: line(d,[(x,y),(x-6,y+14)],rgba((187,232,245)),3)
        d.arc((78,42,119,70),200,330,fill=rgba((205,243,250)),width=2)
    elif pref=='얼음':
        rr(d,(17,47,29,67),rgba((135,204,225)),rgba((58,122,154)),1,2); rr(d,(98,44,111,65),rgba((135,204,225)),rgba((58,122,154)),1,2)
    elif pref=='동결':
        line(d,[(25,29),(34,39),(26,50),(35,62)],rgba((201,230,239)),3); line(d,[(101,27),(92,40),(101,52),(92,65)],rgba((201,230,239)),3)
    # Astral motifs
    elif pref=='성광':
        d.arc((37,5,94,48),190,350,fill=rgba((255,234,140)),width=4)
        for x,y in [(27,31),(103,42)]:
            line(d,[(x-5,y),(x+5,y)],rgba((255,239,165)),2); line(d,[(x,y-5),(x,y+5)],rgba((255,239,165)),2)
    elif pref=='별빛':
        for x,y in [(23,27),(52,16),(102,31),(106,73),(31,81)]: line(d,[(x-3,y),(x+3,y)],rgba((244,220,255)),1); line(d,[(x,y-3),(x,y+3)],rgba((244,220,255)),1)
    elif pref=='혜성':
        poly(d,[(92,30),(111,19),(101,38)],rgba((227,192,255)),None,0); line(d,[(105,21),(119,11)],rgba((182,135,232)),3); line(d,[(108,27),(122,21)],rgba((182,135,232)),2)
    elif pref=='공허':
        ell(d,(17,39,32,55),rgba((36,22,52)),rgba((121,72,154)),2); ell(d,(95,30,112,48),rgba((36,22,52)),rgba((121,72,154)),2); line(d,[(27,75),(17,91),(23,98)],rgba((84,50,111)),4)
    elif pref=='성좌':
        pts=[(22,28),(46,18),(65,29),(91,18),(108,39)]; line(d,pts,rgba((214,188,249)),1); [ell(d,(x-2,y-2,x+2,y+2),rgba((243,228,255)),None,0) for x,y in pts]
    elif pref=='관측':
        rr(d,(88,24,111,33),rgba((87,103,129)),INK,1,3); line(d,[(91,33),(81,47)],rgba((116,145,177)),3); ell(d,(104,25,114,34),rgba((176,227,244)),INK,1)
    elif pref=='월광':
        d.arc((34,6,91,58),105,275,fill=rgba((229,231,255)),width=5); ell(d,(84,21,91,28),rgba((204,186,245)),None,0)
    elif pref=='천체':
        d.ellipse((23,16,108,90),outline=rgba((193,160,237)),width=2); d.arc((33,9,100,98),205,335,fill=rgba((231,198,250)),width=2); ell(d,(103,47,111,55),rgba((255,229,151)),None,0)
    elif pref=='밤하늘':
        for x,y,s in [(23,21,2),(40,12,1),(97,24,2),(107,61,1),(30,80,1)]: ell(d,(x-s,y-s,x+s,y+s),rgba((236,219,255)),None,0)
        d.arc((44,4,88,39),200,340,fill=rgba((132,102,188)),width=2)
    elif pref=='은하':
        d.arc((17,11,111,101),25,210,fill=rgba((197,151,236)),width=3); d.arc((31,24,98,89),210,25,fill=rgba((110,166,229)),width=2); ell(d,(106,58,114,66),rgba((245,212,137)),None,0)
    # Origin motifs
    elif pref=='기원':
        poly(d,[(64,8),(70,19),(64,27),(58,19)],rgba((214,174,101)),None,0); line(d,[(26,79),(34,69),(42,79)],rgba((164,127,83)),2)
    elif pref=='심연':
        line(d,[(28,65),(13,84),(20,99)],rgba((69,45,91)),5); line(d,[(98,64),(115,82),(108,98)],rgba((69,45,91)),5); ell(d,(18,78,26,88),rgba((137,87,169)),None,0)
    elif pref=='봉인':
        rr(d,(20,30,32,52),rgba((223,202,143)),rgba((115,87,58)),1,1); rr(d,(98,35,110,57),rgba((223,202,143)),rgba((115,87,58)),1,1); line(d,[(26,52),(40,70),(28,86)],rgba((176,149,93)),2)
    elif pref=='금빛':
        poly(d,[(48,29),(54,13),(64,27),(74,11),(83,31)],rgba((239,190,71)),INK,1); line(d,[(35,44),(93,44)],rgba((245,204,81)),2)
    elif pref=='원초':
        poly(d,[(37,38),(24,12),(49,31)],rgba((212,205,177)),INK,1); poly(d,[(87,38),(104,12),(77,31)],rgba((212,205,177)),INK,1); line(d,[(57,20),(64,6),(72,21)],rgba((167,151,116)),3)
    elif pref=='균열':
        line(d,[(62,14),(55,33),(67,46),(58,61),(69,78),(63,96)],rgba((220,117,233)),3); poly(d,[(96,36),(112,20),(105,45)],rgba((126,72,164)),None,0)
    elif pref=='검은':
        poly(d,[(31,40),(18,22),(40,33)],rgba((29,31,38)),None,0); poly(d,[(94,39),(111,23),(102,48)],rgba((29,31,38)),None,0); d.arc((42,8,89,47),200,340,fill=rgba((74,68,90)),width=3)
    elif pref=='왕좌':
        poly(d,[(46,29),(51,9),(62,25),(72,8),(84,31)],rgba((216,168,70)),INK,1); poly(d,[(26,55),(18,40),(30,43)],rgba((100,57,93)),None,0); poly(d,[(99,53),(112,39),(105,61)],rgba((100,57,93)),None,0)
    elif pref=='종말':
        for x,y in [(27,35),(98,31),(24,77),(104,76)]: poly(d,[(x,y),(x+7,y-8),(x+11,y+2)],rgba((173,66,55)),None,0)
        line(d,[(44,25),(37,13)],rgba((73,60,61)),3)
    elif pref=='만상':
        cols=[ELEMENT['화염'],ELEMENT['물'],ELEMENT['자연'],ELEMENT['빛'],ELEMENT['별']]
        for i,c in enumerate(cols):
            ang=i*72-80; x=64+int(math.cos(math.radians(ang))*48); y=55+int(math.sin(math.radians(ang))*35); ell(d,(x-5,y-5,x+5,y+5),rgba(c),INK,1)

    # stable species mark - tiny and semantic-neutral, never the main distinction
    seed=int(hashlib.sha1(mon['id'].encode()).hexdigest()[:6],16); rng=random.Random(seed)
    for _ in range(2):
        x=rng.randint(42,84); y=rng.randint(48,78); d.rectangle((x,y,x+2,y+2),fill=h)

def form_mutation(d, mon, p, mode):
    if mode=='base': return
    a,h,dark=p['accent'],p['hi'],p['dark']; arch=mon.get('archetype','beast')
    if mode=='evolution':
        # anatomy upgrades by family, not just an aura
        if arch in ('wing','phoenix'): poly(d,[(25,48),(5,27),(16,64)],a); poly(d,[(103,48),(123,27),(113,64)],a)
        elif arch in ('beast','tyrant'): poly(d,[(47,33),(40,9),(58,29)],a); poly(d,[(82,33),(91,9),(73,29)],a)
        elif arch in ('golem','knight'): rr(d,(14,45,29,70),dark,INK,2,3); rr(d,(100,43,114,69),dark,INK,2,3)
        elif arch in ('serpent','leviathan'):
            for_pts=[[(34,57),(38,37),(45,59)],[(56,45),(62,24),(69,48)],[(77,45),(86,26),(89,51)]]
            [poly(d,x,a) for x in for_pts]
        elif arch in ('priest','spirit','wraith'): d.arc((32,3,98,59),195,345,fill=h,width=3)
        elif arch in ('slime','mushroom'): poly(d,[(51,31),(60,10),(68,31)],h); poly(d,[(75,32),(85,14),(84,38)],a)
        else: poly(d,[(31,47),(17,31),(25,58)],a); poly(d,[(98,45),(113,30),(105,59)],a)
    elif mode=='resonance':
        d.ellipse((18,8,112,101),outline=h,width=2); d.arc((29,1,101,72),200,340,fill=a,width=3)
        for x,y in [(20,29),(108,31),(26,84),(103,82)]: line(d,[(x-4,y),(x+4,y)],h,1); line(d,[(x,y-4),(x,y+4)],h,1)
        if arch in ('watcher','drone','spirit'): ell(d,(9,48,22,61),a,None,0); ell(d,(106,45,119,58),a,None,0)
    elif mode=='rift':
        poly(d,[(35,40),(21,9),(48,34)],dark); poly(d,[(92,38),(108,8),(82,35)],dark)
        line(d,[(58,20),(53,38),(64,50),(56,66),(67,83)],h,3)
        for x,y in [(18,62),(111,57),(27,87),(104,86)]: ell(d,(x-4,y-6,x+4,y+6),rgba((75,36,93,210)),None,0)

def draw_boss(d, mon, p, mode):
    m,dark,a,h=p['mid'],p['dark'],p['accent'],p['hi']; bid=mon['id']
    if bid=='b001': # 녹음왕 베르단 - ancient forest stag-lion king
        ell(d,(27,42,85,83),dark); ell(d,(67,32,104,69),m); face_side(d,90,46,m,a,'predator'); rr(d,(39,75,51,104),dark); rr(d,(72,70,84,101),dark)
        line(d,[(76,34),(66,11),(55,5)],rgba((93,70,43)),5); line(d,[(82,33),(96,10),(108,6)],rgba((93,70,43)),5); line(d,[(69,17),(57,23)],rgba((93,70,43)),3); line(d,[(94,17),(108,23)],rgba((93,70,43)),3)
        poly(d,[(27,52),(10,37),(16,70),(34,73)],rgba((70,139,74)))
        for x,y in [(53,14),(105,17),(17,45),(31,28)]: poly(d,[(x,y+8),(x+6,y),(x+11,y+8)],rgba((130,205,103)),None,0)
        poly(d,[(75,34),(81,17),(87,31),(95,16),(101,37)],rgba((221,191,86)),INK,1)
    elif bid=='b002': # furnace lord
        rr(d,(35,27,92,85),dark,INK,4,10); rr(d,(47,38,81,70),m,INK,2,6); poly(d,[(54,43),(66,31),(76,44),(73,64),(56,64)],rgba((239,102,44)),INK,1); face_side(d,75,44,m,h,'predator')
        rr(d,(12,43,36,82),rgba((86,69,63)),INK,3,5); rr(d,(91,40,116,82),rgba((86,69,63)),INK,3,5); rr(d,(43,81,58,105),dark); rr(d,(72,81,87,105),dark)
        rr(d,(47,10,58,31),rgba((76,69,66)),INK,2,2); rr(d,(73,8,84,30),rgba((76,69,66)),INK,2,2); line(d,[(52,10),(48,1)],rgba((101,94,96)),3); line(d,[(78,8),(83,0)],rgba((101,94,96)),3); line(d,[(44,72),(82,34)],rgba((255,167,62)),3)
    elif bid=='b003': # crystal saint
        ell(d,(49,25,81,56),m); face_side(d,70,39,m,a,'mystic'); poly(d,[(45,50),(32,94),(55,82),(65,103),(76,82),(98,94),(85,50)],dark)
        for pts in [[(42,45),(29,20),(52,39)],[(87,44),(102,17),(96,53)],[(64,29),(68,5),(75,31)]]: poly(d,pts,rgba((169,229,244)),rgba((67,126,164)),2)
        d.arc((27,0,105,65),190,350,fill=rgba((225,242,255)),width=4)
        for x,y in [(20,38),(108,38),(27,79),(102,82)]:
            line(d,[(x-4,y),(x+4,y)],rgba((220,241,255)),2); line(d,[(x,y-4),(x,y+4)],rgba((220,241,255)),2)
    elif bid=='b004': # star sea navigator
        poly(d,[(8,59),(34,35),(66,38),(89,26),(121,54),(102,72),(77,68),(66,96),(53,70),(28,77)],m); poly(d,[(27,56),(49,45),(68,48),(95,37),(111,52),(92,60),(73,58),(66,75),(52,59),(35,66)],p['bright'],None,0); face_side(d,84,51,m,a,'mystic')
        poly(d,[(57,38),(64,9),(75,39)],rgba((216,187,245)),INK,1); d.arc((18,7,115,99),205,340,fill=rgba((192,151,232)),width=3)
        for x,y in [(21,27),(104,26),(112,70),(31,84)]: ell(d,(x-3,y-3,x+3,y+3),rgba((247,224,255)),None,0)
    else: # b005 origin destroyer
        poly(d,[(43,32),(58,13),(76,14),(92,35),(100,69),(83,98),(68,81),(56,102),(43,84),(23,96),(29,57)],dark); ell(d,(48,30,86,63),m); ell(d,(57,39,78,58),rgba((40,25,52)),rgba((190,106,217)),2); eye(d,70,48,h,'glow')
        line(d,[(25,59),(7,47),(16,77)],dark,7); line(d,[(96,58),(120,46),(111,78)],dark,7); poly(d,[(43,34),(25,5),(52,29)],rgba((57,38,70))); poly(d,[(89,34),(108,5),(81,29)],rgba((57,38,70))); line(d,[(61,14),(55,39),(69,51),(59,69),(70,86)],rgba((226,115,239)),3)
    form_mutation(d,mon,p,mode)

def _pixel_polish(img, seed):
    # Keep a true low-resolution sprite canvas first, then enlarge with nearest-neighbor.
    # This adds a one-pixel ink contour plus restrained highlight/shadow dithering so the
    # sprites read like authored handheld-era pixel art rather than smooth vector shapes.
    rng=random.Random(seed ^ 0x49C0DE)
    px=img.load(); w,h=img.size
    opaque=[]
    for y in range(h):
        for x in range(w):
            if px[x,y][3] > 10:
                opaque.append((x,y))
    if not opaque: return img
    minx=min(x for x,y in opaque); maxx=max(x for x,y in opaque)
    miny=min(y for x,y in opaque); maxy=max(y for x,y in opaque)
    # outer contour, without touching the sprite's internal facial details
    outline=[]
    for y in range(1,h-1):
        for x in range(1,w-1):
            if px[x,y][3] > 10: continue
            if any(px[nx,ny][3] > 80 for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1))):
                outline.append((x,y))
    for x,y in outline: px[x,y]=(12,16,24,255)
    # subtle stepped shading and sparkle pixels; protects near-white pixels and very dark ink
    height=max(1,maxy-miny)
    for y in range(miny,maxy+1):
        rel=(y-miny)/height
        for x in range(minx,maxx+1):
            r,g,b,a=px[x,y]
            if a < 200: continue
            lum=(r*3+g*5+b*2)//10
            if lum < 45 or lum > 235: continue
            if rel > .68 and ((x+y)&3)==0:
                px[x,y]=(max(0,r-18),max(0,g-18),max(0,b-20),a)
            elif rel < .34 and ((x*3+y*5)&7)==0:
                px[x,y]=(min(255,r+16),min(255,g+16),min(255,b+16),a)
    # tiny deterministic glints around bright motifs; sparse enough to stay readable
    for _ in range(5):
        x=rng.randint(max(2,minx),min(w-3,maxx)); y=rng.randint(max(2,miny),min(h-3,maxy))
        r,g,b,a=px[x,y]
        if a>220 and (r+g+b)>420 and px[x-1,y][3]>100:
            px[x,y]=(min(255,r+24),min(255,g+24),min(255,b+24),a)
    return img

def render(mon, mode='base'):
    seed=int(hashlib.sha1((mon['id']+mon['name']+mode).encode('utf-8')).hexdigest()[:10],16)
    random.seed(seed)
    p=palette(mon,mode)
    art=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(art)
    v=variant(mon)
    if mon['id'].startswith('b'):
        draw_boss(d,mon,p,mode)
    else:
        fn=DRAW.get(mon.get('archetype'),body_beast)
        fn(d,p,v)
        motif(d,mon,p,v)
        form_mutation(d,mon,p,mode)
    # Preserve the original 128x112 proportions inside a square sprite instead of stretching it.
    img=Image.new('RGBA',(OUT_NATIVE,OUT_NATIVE),(0,0,0,0))
    img.alpha_composite(art,(0,(OUT_NATIVE-H)//2))
    img=_pixel_polish(img,seed)
    size=448 if mon['id'].startswith('b') else 384
    return img.resize((size,size),Image.Resampling.NEAREST)

def main():
    for mon in MONS:
        base=ROOT/mon['sprite'].lstrip('/'); base.parent.mkdir(parents=True,exist_ok=True); render(mon,'base').save(base,optimize=True)
        for key,mode in [('evolutionSprite','evolution'),('resonanceSprite','resonance'),('riftSprite','rift')]:
            if mon.get(key):
                out=ROOT/mon[key].lstrip('/'); out.parent.mkdir(parents=True,exist_ok=True); render(mon,mode).save(out,optimize=True)
    print('V49_RETRO_MONSTERS_OK',len(MONS))

if __name__=='__main__': main()
