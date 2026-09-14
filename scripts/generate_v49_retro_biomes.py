from PIL import Image, ImageDraw
from pathlib import Path
import random, math, re

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'biomes'
W,H=320,180
SCALE=5

PALETTES={
 'verdant': {'sky':[(156,202,183),(133,184,171),(113,165,154)],'far':(72,118,102),'mid':(47,89,72),'ground':(37,72,54),'accent':(196,225,132),'light':(232,240,190)},
 'ember': {'sky':[(207,131,93),(178,91,72),(115,57,61)],'far':(92,45,50),'mid':(69,37,42),'ground':(45,29,34),'accent':(244,121,58),'light':(255,203,101)},
 'frost': {'sky':[(163,205,225),(126,178,208),(97,142,185)],'far':(96,132,168),'mid':(68,105,145),'ground':(51,79,117),'accent':(184,230,244),'light':(242,251,255)},
 'astral': {'sky':[(103,81,151),(72,61,124),(47,45,92)],'far':(57,47,91),'mid':(40,36,71),'ground':(29,28,56),'accent':(196,143,224),'light':(244,222,255)},
 'origin': {'sky':[(93,71,103),(66,52,78),(42,36,55)],'far':(55,43,61),'mid':(39,33,48),'ground':(26,24,34),'accent':(205,151,92),'light':(241,218,157)}
}

def lerp(a,b,t): return int(a*(1-t)+b*t)
def mix(a,b,t): return tuple(lerp(a[i],b[i],t) for i in range(3))

def band_gradient(img, colors):
    d=ImageDraw.Draw(img)
    bands=18
    for i in range(bands):
        t=i/(bands-1)
        if t<.5: c=mix(colors[0],colors[1],t*2)
        else: c=mix(colors[1],colors[2],(t-.5)*2)
        y0=int(i*H*.7/bands); y1=int((i+1)*H*.7/bands)+1
        d.rectangle((0,y0,W,y1),fill=c)

def jagged_layer(d,y,amp,step,color,rng,base=0):
    pts=[(0,H)]
    x=0
    while x<=W:
        yy=y+rng.randint(-amp,amp)+int(math.sin((x+base)/28)*amp*.45)
        pts.append((x,yy)); x+=step+rng.randint(-2,3)
    pts.extend([(W,H)])
    d.polygon(pts,fill=color)

def draw_verdant(d,p,rng,scene):
    jagged_layer(d,91,14,20,p['far'],rng,scene*9)
    # distant trees
    for x in range(-10,W+15,18):
        h=rng.randint(13,26); y=107+rng.randint(-5,5)
        d.rectangle((x+7,y-h+7,x+10,y),fill=p['mid'])
        d.polygon([(x,y-h+13),(x+9,y-h-2),(x+18,y-h+13)],fill=mix(p['mid'],p['accent'],.15))
        if scene%2==0: d.polygon([(x+2,y-h+6),(x+9,y-h-7),(x+16,y-h+6)],fill=mix(p['mid'],p['accent'],.24))
    jagged_layer(d,124,7,13,p['ground'],rng,scene*11)
    # flowers/grass
    for _ in range(44):
        x=rng.randrange(W); y=rng.randrange(126,156)
        if rng.random()<.25:
            d.point((x,y),fill=p['light']); d.point((x+1,y),fill=p['accent'])
        else:
            d.line((x,y,x+rng.choice([-1,0,1]),y-3),fill=mix(p['ground'],p['accent'],.35),width=1)

def draw_ember(d,p,rng,scene):
    # volcanic skyline
    d.polygon([(0,111),(52,82),(88,103),(135,70),(170,104),(224,78),(272,101),(320,74),(320,180),(0,180)],fill=p['far'])
    d.polygon([(109,92),(135,68),(160,94)],fill=p['mid'])
    if scene%2==0:
        d.polygon([(126,73),(135,60),(142,74)],fill=p['accent']); d.rectangle((133,70,137,95),fill=p['accent'])
    jagged_layer(d,128,8,16,p['ground'],rng,scene*13)
    # lava seams
    for _ in range(7):
        x=rng.randrange(0,W-35); y=rng.randrange(135,163); length=rng.randrange(12,38)
        d.line((x,y,x+length,y+rng.choice([-2,0,2])),fill=p['accent'],width=2)
        if rng.random()<.5: d.line((x+3,y-1,x+length-3,y-1),fill=p['light'],width=1)
    for _ in range(28):
        x=rng.randrange(W); y=rng.randrange(10,112)
        d.rectangle((x,y,x+rng.choice([0,1]),y+rng.choice([0,1])),fill=rng.choice([p['accent'],p['light']]))

def draw_frost(d,p,rng,scene):
    # aurora stripes
    if scene%3!=1:
        for k in range(3):
            pts=[]
            for x in range(0,W+1,12):
                y=28+k*8+int(math.sin((x+scene*13+k*21)/28)*5)
                pts.append((x,y))
            d.line(pts,fill=mix(p['accent'],p['light'],.25+k*.18),width=2)
    # mountains
    peaks=[(-15,112),(28,69),(63,105),(99,58),(140,104),(183,72),(226,108),(275,62),(335,111)]
    d.polygon(peaks+[(W,180),(0,180)],fill=p['far'])
    for x,y in peaks[1:-1:2]:
        d.polygon([(x-12,y+24),(x,y),(x+16,y+24),(x+4,y+18),(x,y+7),(x-5,y+18)],fill=p['light'])
    jagged_layer(d,128,5,17,p['ground'],rng,scene*7)
    # crystal spires
    for _ in range(11):
        x=rng.randrange(W); base=rng.randrange(131,158); h=rng.randrange(7,19)
        d.polygon([(x,base),(x+4,base-h),(x+8,base)],fill=rng.choice([p['accent'],p['light'],mix(p['mid'],p['accent'],.4)]))
    for _ in range(30):
        x=rng.randrange(W); y=rng.randrange(8,118); d.point((x,y),fill=p['light'])

def draw_astral(d,p,rng,scene):
    # star field
    for _ in range(80):
        x=rng.randrange(W); y=rng.randrange(5,118); c=p['light'] if rng.random()<.25 else p['accent']; d.point((x,y),fill=c)
        if rng.random()<.08:
            d.line((x-1,y,x+1,y),fill=c); d.line((x,y-1,x,y+1),fill=c)
    # nebula band
    for x in range(0,W,4):
        y=52+int(math.sin((x+scene*17)/32)*10)
        d.rectangle((x,y,x+3,y+3),fill=mix(p['far'],p['accent'],.33))
    # floating islands
    for cx,cy,ww in [(55,108,55),(150,91,72),(260,116,64)]:
        cy+=rng.randint(-5,5); top=p['mid']
        d.polygon([(cx-ww//2,cy),(cx+ww//2,cy),(cx+ww//3,cy+8),(cx+9,cy+20),(cx-8,cy+14),(cx-ww//3,cy+7)],fill=top)
        d.line((cx-ww//2,cy,cx+ww//2,cy),fill=p['accent'],width=2)
    d.rectangle((0,145,W,180),fill=p['ground'])
    for x in range(0,W,16): d.line((x,145,x-12,180),fill=mix(p['ground'],p['accent'],.18))

def draw_origin(d,p,rng,scene):
    # rift cracks in sky
    for _ in range(4):
        x=rng.randrange(30,W-30); y=rng.randrange(16,74)
        pts=[(x,y)]
        for i in range(5):
            x+=rng.randint(-7,7); y+=rng.randint(5,11); pts.append((x,y))
        d.line(pts,fill=p['accent'],width=2)
        d.line([(a+1,b) for a,b in pts],fill=mix(p['accent'],p['light'],.45),width=1)
    # ruined monoliths
    jagged_layer(d,119,8,20,p['ground'],rng,scene*5)
    for _ in range(10):
        x=rng.randrange(0,W-12); y=rng.randrange(91,137); h=rng.randrange(18,55); w=rng.randrange(5,11)
        c=rng.choice([p['far'],p['mid']]); d.rectangle((x,y-h,x+w,y),fill=c)
        if rng.random()<.6: d.rectangle((x+1,y-h+3,x+w-2,y-h+5),fill=p['accent'])
    # central seal circle
    if scene in (0,3,5):
        cx=220 if scene%2 else 98; cy=119
        d.ellipse((cx-20,cy-8,cx+20,cy+8),outline=p['accent'],width=2)
        d.ellipse((cx-12,cy-5,cx+12,cy+5),outline=p['light'],width=1)

DRAW={'verdant':draw_verdant,'ember':draw_ember,'frost':draw_frost,'astral':draw_astral,'origin':draw_origin}

def render(biome,scene):
    p=PALETTES[biome]; rng=random.Random(490000+scene*101+sum(map(ord,biome)))
    img=Image.new('RGB',(W,H),p['sky'][0]); band_gradient(img,p['sky']); d=ImageDraw.Draw(img)
    DRAW[biome](d,p,rng,scene)
    # pixel scan bands and a clean combat floor lip at the bottom
    if scene%2:
        for y in range(2,H,6):
            d.line((0,y,W,y),fill=mix(img.getpixel((W//2,y)),(255,255,255),.025))
    # upscale nearest-neighbor to stay razor-sharp
    return img.resize((W*SCALE,H*SCALE),Image.Resampling.NEAREST)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for biome in PALETTES:
        targets=[OUT/f'{biome}.png']+[OUT/f'{biome}_{i}.png' for i in range(1,6)]
        for idx,path in enumerate(targets):
            render(biome,idx).save(path,optimize=True)
    print('V49_RETRO_BIOMES_OK',30)

if __name__=='__main__': main()
