"""Generate 2.0 sprite variants and biome tiles from the project's own original art.
Python/Pillow are needed only by maintainers; the ZIP includes the finished PNGs.
Runs the base generator first to keep repeated builds deterministic.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import subprocess,json,colorsys,random,math
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['python',str(ROOT/'tools/generate_art.py')],check=True)
OUT=ROOT/'public/assets'
data=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {CLASSES,MONSTERS,ZONES} from './shared/content.js'; console.log(JSON.stringify({classes:CLASSES,mobs:MONSTERS,zones:ZONES}));"],cwd=ROOT))
atlas=Image.open(OUT/'atlas.png').convert('RGBA')
meta=json.loads((OUT/'atlas.json').read_text())
sprites={k:(atlas.crop((v['x'],v['y'],v['x']+v['w'],v['y']+v['h'])),(v['ax'],v['ay'])) for k,v in meta.items()}
original=dict(sprites)
def put(name,im,anchor=None):sprites[name]=(im,anchor or (im.width//2,im.height-4))
def rgb(h):return tuple(int(h[i:i+2],16) for i in (1,3,5))
def tint(im,color,mix=.65,clothing=False):
    im=im.copy();pixels=im.load();target=rgb(color)
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=pixels[x,y]
            if not a or max(r,g,b)<45:continue
            if clothing and (y<im.height*.32 or (r>g*1.16 and g>b*1.2 and r>130)):continue
            value=(.26*r+.49*g+.25*b)/160
            tr,tg,tb=[min(255,int(c*value)) for c in target]
            pixels[x,y]=(int(r*(1-mix)+tr*mix),int(g*(1-mix)+tg*mix),int(b*(1-mix)+tb*mix),a)
    return im
for n,(id,c) in enumerate(data['classes'].items()):
    family=c.get('family',id)
    for direction in 'snew':
        for frame in range(4):
            key=f'{family}_{direction}_{frame}'
            if key not in original:continue
            base,anchor=original[key];im=tint(base,c['color'],.72,True);d=ImageDraw.Draw(im)
            cx=im.width//2;yy=int(im.height*.39)+(1 if frame in (1,3) else 0)
            if c.get('tier') in ('epic','hidden'):
                d.polygon([(cx-9,yy-3),(cx-14,yy-11),(cx-6,yy-7)],fill=rgb(c['color'])+(255,))
                d.polygon([(cx+8,yy-3),(cx+13,yy-11),(cx+5,yy-7)],fill=rgb(c['color'])+(255,))
            if id in ('priest','herbalist','paladin','tide_oracle','spiritwalker'):
                d.line((cx,yy+14,cx,yy+22),fill='#e6dcad',width=2);d.line((cx-3,yy+17,cx+3,yy+17),fill='#e6dcad',width=2)
            elif n%3==0:d.rectangle((cx-2,yy+15,cx+2,yy+18),fill='#d1c59d')
            put(f'{id}_{direction}_{frame}',im,anchor)
            if direction=='s' and frame==0:im.save(OUT/f'{id}_s_0.png',optimize=True)
mob_colors={}
for zone in data['zones'].values():
    for m in zone.get('mobTypes',[]):mob_colors[m]=zone['color']
    if zone.get('boss'):mob_colors[zone['boss']]=zone['color']
mob_colors.update(world_tempest='#c1df91',world_leviathan='#7cd0db',world_glacier='#c1e6ee',world_eclipse='#be8dd6')
for n,(id,m) in enumerate(data['mobs'].items()):
    if 'skin' not in m:continue
    base=m['skin'];color=mob_colors.get(id,'#b4bad5')
    keys=[k for k in original if k.startswith(base+'_')]
    for key in keys:
        im,anchor=original[key];out=tint(im,color,.77);d=ImageDraw.Draw(out)
        if m.get('worldBoss'):
            cx=out.width//2;cy=int(out.height*.25)
            d.polygon([(cx-11,cy+8),(cx-17,cy-9),(cx-5,cy),(cx,cy-13),(cx+5,cy),(cx+17,cy-9),(cx+11,cy+8)],fill='#e7d6a0',outline='#312d49')
            d.rectangle((cx-2,cy-2,cx+2,cy+3),fill=rgb(color)+(255,))
        elif m.get('boss'):
            cx=out.width//2
            d.line((cx-8,12,cx+8,12),fill=rgb(color)+(255,),width=2)
        name=id+key[len(base):];put(name,out,anchor)
# Clustered pixel tiles rather than flat single-color fill.
palettes={
 'meadow':(['#3f6241','#4c7147','#587c4e'],['#777355','#8e8464','#9e9271'],['#20484b','#2c5e61','#4b7c78']),
 'coast':(['#8d9c7b','#a6af87','#b8b994'],['#bcb28a','#cfc29a','#ded0a7'],['#245c68','#2e7a88','#4e98a2']),
 'desert':(['#a98a5e','#bc9b69','#cfac77'],['#947352','#a27e58','#b69162'],['#3c5963','#4b7380','#66949e']),
 'swamp':(['#35483c','#435544','#52624a'],['#595944','#67674c','#777553'],['#263e3f','#314b48','#456057']),
 'frost':(['#a0bcc8','#b4cbd2','#c8d8da'],['#718d9e','#87a0ad','#9eb2bc'],['#426d85','#5b8ca4','#85b3c3']),
 'sky':(['#787b91','#9292a4','#adabb6'],['#9e99b1','#b1a9be','#c5b9ca'],['#415270','#586b8d','#6e83a5']),
 'abyss':(['#302e49','#3c3756','#4b4268'],['#4b415c','#61506c','#76617f'],['#1b293e','#2e3952','#494264']),
 'observatory':(['#49475c','#5d586c','#6b6477'],['#777184','#918a9d','#a79eb1'],['#28354d','#3a4b65','#566584'])
}
for theme,palette in palettes.items():
    for kind in range(4):
        for v in range(8):
            rr=random.Random(theme+str(kind)+str(v));cols=palette[min(kind,2)] if kind!=3 else palette[1]
            im=Image.new('RGBA',(32,32),cols[0]);d=ImageDraw.Draw(im)
            for _ in range(16):
                x,y=rr.randrange(32),rr.randrange(32);d.rectangle((x,y,x+rr.randrange(2,9),y+rr.randrange(1,4)),fill=rr.choice(cols))
            if kind==0:
                for _ in range(3):
                    x,y=rr.randrange(4,27),rr.randrange(6,28);d.line((x-1,y+2,x,y-2,x+1,y),fill=cols[-1])
            if kind==2:
                for _ in range(2):
                    x,y=rr.randrange(4,24),rr.randrange(3,29);d.line((x,y,x+7,y),fill=cols[-1])
            if theme=='frost' and kind==0 and v%2==0:d.rectangle((5,6,11,7),fill='#dce7e7')
            if theme=='observatory' and kind==1 and v==0:d.line((5,15,15,5,25,15,15,25,5,15),fill='#b7a88c')
            put(f'tile_{theme}_{kind}_{v}',im,(0,0))
# Local landmark props.
for new,base,color in [('frost_pine','pine','#d6e4e0'),('ice_rock','rock','#adcfdc'),('ice_altar','altar','#b5d5e3'),('void_altar','altar','#9577ba'),
                        ('sky_crystal','crystal','#bfafec'),('void_crystal','crystal','#9e78d0'),('star_pillar','pillar','#c7b9d8'),
                        ('desert_ruin','pillar','#d3b58a'),('giant_mushroom','mushroom','#b2a77f'),('snow_grass','bush','#c5dcd9'),('desert_grass','bush','#bfa171')]:
    im,anchor=original[base];im=tint(im,color,.8);put(new,im,anchor)
# Palm with layered fronds.
im=Image.new('RGBA',(100,112));d=ImageDraw.Draw(im)
d.polygon([(45,105),(51,46),(57,45),(54,108)],fill='#796646',outline='#26373a')
for y in range(58,104,7):d.line((49,y,56,y-2),fill='#a18b5b',width=2)
for dx,dy in [(-42,3),(-35,-19),(-16,-32),(24,-26),(42,-9),(38,16)]:
    d.polygon([(52,43),(52+dx,43+dy),(52+dx//2,49+dy//2),(55,49)],fill='#3b765e',outline='#284c44')
put('palm',im,(50,108))
im=Image.new('RGBA',(44,58));d=ImageDraw.Draw(im)
d.rounded_rectangle((18,8,28,55),radius=4,fill='#648a64',outline='#2c493e',width=2)
d.line((20,38,9,38,9,23),fill='#648a64',width=7);d.line((25,29,35,29,35,15),fill='#648a64',width=7)
put('cactus',im,(22,54))
im=Image.new('RGBA',(60,76));d=ImageDraw.Draw(im)
d.ellipse((9,61,54,72),fill='#11232a')
d.polygon([(12,65),(15,19),(24,7),(44,11),(48,64)],fill='#525c6e',outline='#1a2935')
d.polygon([(20,59),(22,22),(28,15),(39,19),(40,58)],fill='#72798a')
for y in [28,36,44]:d.line((25,y,35,y+3,28,y+6),fill='#d6bce9',width=2)
d.rectangle((21,60,42,64),fill='#9c91b7')
put('relic_stone',im,(30,70));im.save(OUT/'relic_stone.png')
im=Image.new('RGBA',(150,112));d=ImageDraw.Draw(im)
d.ellipse((4,45,145,108),fill='#1e303b',outline='#cbb78c',width=3)
for n in range(8):
    a=n*math.pi/4;x=75+math.cos(a)*62;y=77+math.sin(a)*25
    d.polygon([(x-4,y),(x,y-7),(x+4,y),(x,y+7)],fill='#b5a3d2')
d.ellipse((25,57,125,98),outline='#7eaeb9',width=2);d.line((75,12,75,83),fill='#d6c59e',width=2)
put('world_gate',im,(75,105))
# Pack the expanded atlas.
W=1024;x=y=row=0;entries={};out=Image.new('RGBA',(W,8192))
for name,(im,(ax,ay)) in sprites.items():
    if x+im.width+4>W:x=0;y+=row+4;row=0
    if y+im.height+4>out.height:
        larger=Image.new('RGBA',(W,out.height+4096));larger.paste(out,(0,0));out=larger
    out.paste(im,(x+2,y+2));entries[name]={'x':x+2,'y':y+2,'w':im.width,'h':im.height,'ax':ax,'ay':ay}
    x+=im.width+4;row=max(row,im.height)
out=out.crop((0,0,W,y+row+4));out.save(OUT/'atlas.png',optimize=True)
(OUT/'atlas.json').write_text(json.dumps(entries,separators=(',',':')),encoding='utf-8')
print('Expanded atlas:',len(entries),'sprites;',out.size)
