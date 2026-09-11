from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from pathlib import Path
import json, hashlib, math, random
ROOT=Path('/mnt/data/rift_v40_work')
CAT=ROOT/'data/catalog.json'
data=json.load(open(CAT,encoding='utf-8'))
out=ROOT/'assets/monsters/forms'; out.mkdir(parents=True,exist_ok=True)
colors={
 '화염':('#ff784e','#ffd06a'), '물':('#55b9ff','#b7ecff'), '자연':('#6ed77b','#d5ff8b'), '빛':('#ffe27a','#ffffff'),
 '그림자':('#9b72e5','#e0b5ff'), '강철':('#91a9bb','#edf5ff'), '바람':('#77e1d4','#e5fff8'), '번개':('#d5ef59','#ffffff'),
 '별':('#e78bdc','#fff0a5'), '시간':('#8ea8ff','#e5eaff'), '공허':('#8d54d6','#ff83d9'), '수정':('#67e1ef','#d7ffff')
}

def outline_layer(im,color,width=5):
    alpha=im.getchannel('A')
    # Pixel-y dilation, not blurred.
    dil=alpha.filter(ImageFilter.MaxFilter(width*2+1))
    edge=Image.new('RGBA',im.size,color if isinstance(color,tuple) and len(color)==4 else color)
    edge.putalpha(dil)
    # Punch inner alpha so mostly outline, but drawing base above hides inside anyway.
    return edge

def hexrgba(h,a=255):
    h=h.lstrip('#');return tuple(int(h[i:i+2],16) for i in (0,2,4))+(a,)

def bbox_alpha(im):
    b=im.getchannel('A').getbbox(); return b or (64,64,192,192)

def place_scaled(base,scale=1.0,yshift=0):
    w,h=base.size;nw=int(w*scale);nh=int(h*scale);res=base.resize((nw,nh),Image.Resampling.NEAREST)
    canvas=Image.new('RGBA',base.size,(0,0,0,0)); canvas.alpha_composite(res,((w-nw)//2,(h-nh)//2+yshift)); return canvas

def add_pixel_line(d,pts,fill,width=5):
    # draw lines aligned to rough pixel blocks
    d.line(pts,fill=fill,width=width,joint='curve')

def standard_form(base,element,seed):
    rng=random.Random(seed); main,hi=colors.get(element,('#77e1d4','#e8ffff'))
    core=place_scaled(base,1.08,-5); b=bbox_alpha(core); x0,y0,x1,y1=b; cx=(x0+x1)//2
    can=Image.new('RGBA',base.size,(0,0,0,0));
    can.alpha_composite(outline_layer(core,hexrgba(main,180),4));can.alpha_composite(core)
    d=ImageDraw.Draw(can)
    # crown/horns and shoulder crystals – materially changes silhouette.
    top=max(12,y0+6); horn=hexrgba(main,255); hihi=hexrgba(hi,255)
    d.polygon([(cx-30,top+22),(cx-22,top-12),(cx-10,top+14)],fill=horn)
    d.polygon([(cx+30,top+22),(cx+22,top-12),(cx+10,top+14)],fill=horn)
    d.polygon([(x0+8,(y0+y1)//2),(x0-13,(y0+y1)//2-10),(x0+6,(y0+y1)//2+15)],fill=horn)
    d.polygon([(x1-8,(y0+y1)//2),(x1+13,(y0+y1)//2-10),(x1-6,(y0+y1)//2+15)],fill=horn)
    # chest crest
    cy=int(y0+(y1-y0)*.58); d.polygon([(cx,cy-13),(cx+12,cy),(cx,cy+13),(cx-12,cy)],fill=hexrgba(main,210),outline=hihi)
    for _ in range(6):
        x=rng.randrange(max(6,x0-10),min(250,x1+10));y=rng.randrange(max(6,y0),min(250,y1));
        d.rectangle((x,y,x+4,y+4),fill=hexrgba(hi,210))
    return can

def resonance_form(base,element,seed):
    rng=random.Random(seed+2000); main,hi=colors.get(element,('#77e1d4','#ffffff'))
    core=place_scaled(base,1.02,-2); can=Image.new('RGBA',base.size,(0,0,0,0));d=ImageDraw.Draw(can)
    # orbit rings behind
    ring=hexrgba(main,180); ring2=hexrgba(hi,150)
    d.ellipse((35,58,221,214),outline=ring,width=5);d.arc((55,38,201,232),200,520,fill=ring2,width=4)
    for a in (20,105,190,280):
        x=int(128+94*math.cos(math.radians(a)));y=int(137+76*math.sin(math.radians(a)))
        d.rectangle((x-5,y-5,x+5,y+5),fill=hexrgba(hi,235))
        d.rectangle((x-2,y-9,x+2,y+9),fill=hexrgba(main,150))
    can.alpha_composite(outline_layer(core,hexrgba(main,170),3));can.alpha_composite(core)
    # luminous tint edges
    mask=core.getchannel('A');tint=Image.new('RGBA',base.size,hexrgba(hi,45));tint.putalpha(mask.point(lambda a:int(a*.20)));can.alpha_composite(tint)
    d=ImageDraw.Draw(can); b=bbox_alpha(core);x0,y0,x1,y1=b
    # energy wings/fins
    d.polygon([(x0+20,130),(x0-28,105),(x0+4,148)],fill=hexrgba(main,115),outline=hexrgba(hi,200))
    d.polygon([(x1-20,130),(x1+28,105),(x1-4,148)],fill=hexrgba(main,115),outline=hexrgba(hi,200))
    for _ in range(8):
        x=rng.randrange(28,228);y=rng.randrange(40,220);d.rectangle((x,y,x+3,y+3),fill=hexrgba(hi,180))
    return can

def rift_form(base,element,seed):
    rng=random.Random(seed+4000); main,hi=colors.get(element,('#a65cf2','#ff77d5'))
    core=place_scaled(base,1.10,-3); can=Image.new('RGBA',base.size,(0,0,0,0));d=ImageDraw.Draw(can)
    # jagged rift aura behind
    aura='#a943c9'; hot='#ff66b2'; dark='#32123d'
    b=bbox_alpha(core);x0,y0,x1,y1=b;cx=(x0+x1)//2;cy=(y0+y1)//2
    pts=[]
    for i in range(24):
        a=i*math.pi*2/24;rad=95+(18 if i%2 else 5)+rng.randrange(-5,6)
        pts.append((int(cx+math.cos(a)*rad),int(cy+math.sin(a)*rad*.72)))
    d.polygon(pts,fill=hexrgba(dark,110),outline=hexrgba(aura,210))
    can.alpha_composite(outline_layer(core,hexrgba(hot,200),5));can.alpha_composite(core)
    # darken body slightly then add cracks
    mask=core.getchannel('A');veil=Image.new('RGBA',base.size,(34,7,46,80));veil.putalpha(mask.point(lambda a:int(a*.35)));can.alpha_composite(veil)
    d=ImageDraw.Draw(can)
    for _ in range(7):
        x=rng.randrange(max(25,x0+8),min(231,x1-8));y=rng.randrange(max(30,y0+12),min(224,y1-10));
        pts=[(x,y),(x+rng.randrange(-12,13),y+rng.randrange(10,23)),(x+rng.randrange(-8,9),y+rng.randrange(25,40))]
        d.line(pts,fill=hexrgba(hot,235),width=4)
        d.line([(p[0]+2,p[1]) for p in pts],fill=hexrgba(hi,180),width=1)
    # horns/spikes
    for side in (-1,1):
        bx=cx+side*38;d.polygon([(bx, y0+20),(bx+side*32,y0-20),(bx+side*18,y0+28)],fill=hexrgba(aura,230),outline=hexrgba(hot,255))
    return can

allm=data['enemies']+data['bosses']
for idx,m in enumerate(allm):
    src=ROOT/m['sprite'].lstrip('/')
    base=Image.open(src).convert('RGBA')
    seed=int(hashlib.sha1(m['id'].encode()).hexdigest()[:8],16)
    forms={
      'evolution':standard_form(base,m.get('element'),seed),
      'resonance':resonance_form(base,m.get('element'),seed),
      'rift':rift_form(base,m.get('element'),seed)
    }
    for kind,im in forms.items():
        fp=out/f"{m['id']}_{kind}.png"; im.save(fp,optimize=True)
        m[kind+'Sprite']=f"/assets/monsters/forms/{fp.name}"
json.dump(data,open(CAT,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('generated form images',len(allm)*3)
