"""Modular paper-doll art, drawn from geometric pixel clusters.
No external images, fonts or assets. Runtime uses shipped PNGs, not Python.
Run AFTER expand_art.py. Re-running replaces existing named sprites.
"""
from pathlib import Path
from PIL import Image,ImageDraw
import json,subprocess,math
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets'
info=json.loads(subprocess.check_output(['node','--input-type=module','-e',
 "import {ITEMS,CLASSES} from './shared/content.js';import {equipmentVisual} from './shared/rpg.js';import {THEMES,skillVisual} from './shared/visuals.js';console.log(JSON.stringify({items:ITEMS,classes:CLASSES,themes:THEMES,looks:Object.fromEntries(Object.keys(ITEMS).map(k=>[k,equipmentVisual(k)])),skills:Object.fromEntries(Object.keys(CLASSES).map(k=>[k,Object.fromEntries(CLASSES[k].skills.map(s=>[s.id,skillVisual(k,s.id)]))]))}));"],cwd=ROOT))
atlas=Image.open(OUT/'atlas.png').convert('RGBA');meta=json.loads((OUT/'atlas.json').read_text())
sprites={k:(atlas.crop((v['x'],v['y'],v['x']+v['w'],v['y']+v['h'])),(v['ax'],v['ay'])) for k,v in meta.items()}
INK='#17222c'
def put(k,im):sprites[k]=(im,(24,60))
def base(direction,frame):
 im=Image.new('RGBA',(48,64));d=ImageDraw.Draw(im);bob=-1 if frame%2 else 0;step=[0,2,0,-2][frame]
 def box(x0,y0,x1,y1,col):d.rectangle((x0,y0+bob,x1,y1+bob),fill=col)
 d.polygon([(15,30+bob),(30,30+bob),(33,46+bob),(28,51+bob),(17,50+bob),(12,42+bob)],fill=INK)
 box(16,31,29,44,'#8b9392');box(20,32,23,41,'#bbc4b9');box(16,44,30,47,'#695748')
 # Hands, trousers and boots.
 for x in (12,32):box(x,33,x+4,41,'#bfc6b8');box(x,41,x+3,46,'#dcb28c')
 for x,dy in ((18,step),(27,-step)):
  d.rectangle((x-1,47,x+4,58+dy),fill=INK);d.rectangle((x,48,x+3,54+dy),fill='#657579')
  d.rectangle((x-2,55+dy,x+5,59+dy),fill='#786653');d.line((x-1,55+dy,x+3,55+dy),fill='#bea989')
 box(21,27,27,31,'#b88c6d');d.ellipse((15,11+bob,32,30+bob),fill=INK)
 box(17,15,30,25,'#d3a680');box(19,18,29,26,'#edc49a')
 d.polygon([(15,21+bob),(15,13+bob),(20,9+bob),(29,10+bob),(33,16+bob),(29,18+bob),(24,15+bob),(20,19+bob)],fill='#674c3e')
 d.line((18,13+bob,27,12+bob),fill='#ac8158',width=2)
 if direction!='n':
  for x in ((23,28) if direction in ('e','w') else (19,27)):box(x,21,x+2,22,INK)
  box(24,27,27,27,'#9b6e58')
 else:box(18,17,30,26,'#775642')
 if direction=='w':im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 return im
def gear(id,item,direction,frame):
 im=Image.new('RGBA',(48,64));d=ImageDraw.Draw(im);b=-1 if frame%2 else 0
 look=info['looks'][id];tier=look['tier'];theme=info['themes'].get(item.get('visualTheme',''),{})
 col=theme.get('primary',look['color']);light=theme.get('light','#eee7c9');dark=theme.get('dark','#425866')
 def box(x0,y0,x1,y1,c):d.rectangle((x0,y0+b,x1,y1+b),fill=c)
 if item['slot']=='armor':
  robe=id in ('moon_robe','astral_armor') or 'leviathan' in id
  if robe:
   d.polygon([(15,29+b),(31,29+b),(38,53),(29,57),(23,53),(16,57),(9,52)],fill=INK)
   d.polygon([(17,30+b),(29,30+b),(35,52),(27,53),(22,50),(16,54),(12,51)],fill=col)
   for x in (17,23,29):d.line((x,34+b,x-2,50),fill=dark,width=2)
  else:
   d.polygon([(13,31+b),(32,31+b),(35,49),(28,52),(24,48),(18,53),(11,49)],fill=INK)
   d.polygon([(15,32+b),(30,32+b),(32,48),(26,49),(22,46),(17,50),(13,48)],fill=dark)
  d.polygon([(16,30+b),(29,30+b),(32,41+b),(28,47+b),(17,46+b),(14,39+b)],fill=INK)
  d.polygon([(17,31+b),(28,31+b),(30,41+b),(26,45+b),(18,44+b),(16,39+b)],fill=col)
  box(20,32,23,40,light);box(16,43,30,45,dark);box(23,43,26,46,light)
  for x in (10,29):
   box(x,31,x+7,36,INK);box(x+1,31,x+6,34,col);box(x+1,31,x+5,31,light)
  if tier>=2:
   # Armor supplies the headpiece. Every character underneath uses the same base face.
   d.polygon([(14,18+b),(16,10+b),(23,6+b),(31,10+b),(34,18+b),(28,16+b),(23,17+b)],fill=INK)
   d.polygon([(17,15+b),(18,11+b),(24,8+b),(30,12+b),(31,15+b)],fill=col)
   box(23,8,25,15,light)
   if tier>=3:
    d.polygon([(16,14+b),(10,6+b),(12,18+b)],fill=col)
    d.polygon([(31,14+b),(37,6+b),(35,18+b)],fill=col)
   if tier>=5:
    for x in (18,24,30):d.polygon([(x-2,11+b),(x,2+b),(x+2,11+b)],fill=light)
  if id=='leather':box(16,16,31,18,col)
  if item.get('visualSet')=='tempest':
   d.line((12,30+b,8,24+b,16,27+b),fill=light,width=2);d.line((34,30+b,40,24+b,32,27+b),fill=light,width=2)
  if item.get('visualSet')=='glacier':
   for x in (12,32):d.polygon([(x-4,34+b),(x,22+b),(x+5,35+b)],fill=col)
  if item.get('visualSet')=='eclipse':
   for x in (10,30):d.line((x+4,15+b,x,4+b,x+6,8+b),fill=light,width=2)
 elif item['slot']=='weapon':
  kind=item.get('class');rise=1 if frame%2 else 0
  if kind=='guardian':
   d.line((37,50+b,37,12+b),fill=INK,width=6)
   d.polygon([(35,38+b),(35,14+b),(38,7+b),(40,14+b),(39,38+b)],fill=col)
   d.line((37,12+b,37,37+b),fill=light,width=1);box(32,39,43,41,light);box(36,42,38,48,'#906e51')
   if tier>=3:d.polygon([(35,21+b),(31,27+b),(35,34+b)],fill=col)
   if tier>=5:d.polygon([(40,18+b),(44,23+b),(40,31+b)],fill=light)
   d.polygon([(7,34+b),(16,31+b),(18,43+b),(12,49+b),(6,43+b)],fill=INK)
   d.polygon([(8,35+b),(14,34+b),(16,42+b),(12,46+b),(8,41+b)],fill=col)
   d.line((11,35+b,12,43+b),fill=light,width=2)
  elif kind=='ranger':
   pts=[(36,17+b),(42,23+b),(44,34+b),(41,46+b),(35,52+b)]
   d.line(pts,fill=INK,width=5);d.line(pts,fill=col,width=3);d.line((36,17+b,35,52+b),fill=light,width=1)
   d.line((24,35+b,46,35+b),fill='#e5d7a9',width=1);d.polygon([(44,32+b),(47,35+b),(43,38+b)],fill=col)
   if tier>=3:
    d.line((35,18+b,30,13+b,38,18+b),fill=light,width=2);d.line((35,51+b,30,57+b,38,50+b),fill=light,width=2)
  else:
   d.line((37,53+b,37,18+b),fill=INK,width=5);d.line((37,52+b,37,18+b),fill='#9c8466',width=3)
   d.ellipse((30,10+b,44,24+b),fill=INK);d.ellipse((32,12+b,42,22+b),fill=col)
   d.rectangle((35,14+b,38,17+b),fill=light)
   if tier>=2:d.line((30,18+b,29,7+b,33,11+b),fill=col,width=2);d.line((43,18+b,45,7+b,41,11+b),fill=col,width=2)
   if tier>=5:d.polygon([(37,2+b),(41,8+b),(37,12+b),(33,8+b)],fill=light)
 elif item['slot']=='charm':
  # A visible clasp and shoulder ornament rather than a color-only swap.
  d.line((18,30+b,24,38+b,30,30+b),fill=col,width=1);d.polygon([(24,35+b),(28,39+b),(24,43+b),(20,39+b)],fill=INK)
  d.polygon([(24,36+b),(26,39+b),(24,41+b),(22,39+b)],fill=col);box(24,37,24,38,light)
 if direction=='n':
  if item['slot']=='charm':im=Image.new('RGBA',(48,64));ImageDraw.Draw(im).polygon([(24,31+b),(28,36+b),(24,40+b),(20,36+b)],fill=col)
 if direction=='w':im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 return im
for direction in 'snew':
 for frame in range(4):
  put(f'body_{direction}_{frame}',base(direction,frame))
  for id,item in info['items'].items():
   if item['type']=='gear':put(f'gear_{id}_{direction}_{frame}',gear(id,item,direction,frame))
# Small tailored skill emblems: geometry and palette correspond to the actual skill effect.
for job,skills in info['skills'].items():
 for sid,v in skills.items():
  im=Image.new('RGBA',(40,40));d=ImageDraw.Draw(im)
  d.rounded_rectangle((1,1,38,38),radius=7,fill='#15272f',outline=v['dark'],width=2)
  col=v['primary'];light=v['light'];shape=v['shape']
  if sid=='skill2':
   d.polygon([(20,5),(32,11),(30,27),(20,35),(10,27),(8,11)],outline=col,fill=v['dark'])
   d.line((20,12,20,27),fill=light,width=3);d.line((14,19,26,19),fill=light,width=3)
  elif v['theme'] in ('fire','blood'):
   d.polygon([(11,31),(8,23),(17,13),(20,5),(25,17),(29,12),(33,27),(28,34),(18,36)],fill=col)
   d.polygon([(17,30),(20,19),(25,28),(22,33)],fill=light)
  elif v['theme'] in ('thunder','machine'):
   d.polygon([(24,5),(10,22),(20,22),(16,36),(31,17),(22,17)],fill=col)
   d.line((24,8,17,20,24,19,20,31),fill=light,width=1)
  elif v['theme'] in ('ice','water'):
   for a in range(0,360,60):
    x,y=20+int(math.cos(math.radians(a))*14),20+int(math.sin(math.radians(a))*14)
    d.line((20,20,x,y),fill=col,width=2)
   d.ellipse((16,16,24,24),fill=light)
  elif v['theme'] in ('nature','poison','earth'):
   d.ellipse((10,7,28,30),fill=col);d.line((14,33,25,12),fill=light,width=2)
  elif v['theme'] in ('shadow','void','time'):
   d.ellipse((7,6,32,33),outline=col,width=4);d.ellipse((15,5,35,25),fill='#15272f');d.rectangle((19,17,22,22),fill=light)
  else:
   d.polygon([(20,5),(24,15),(35,20),(24,24),(20,35),(16,24),(5,20),(16,16)],fill=col);d.rectangle((18,17,22,22),fill=light)
  if sid=='ultimate':
   for x,y in [(5,6),(33,6),(5,32),(33,32)]:d.rectangle((x,y,x+2,y+2),fill=light)
  im.save(OUT/f'skill_{job}_{sid}.png',optimize=True)
# Pack all original + modular sprites.
width=2048;items=sorted(sprites.items(),key=lambda kv:(-kv[1][0].height,kv[0]));x=y=row=0;places=[]
for name,(im,anchor) in items:
 if x+im.width+2>width:x=0;y+=row+2;row=0
 places.append((name,im,anchor,x,y));x+=im.width+2;row=max(row,im.height)
height=y+row+2;packed=Image.new('RGBA',(width,height));outmeta={}
for name,im,(ax,ay),x,y in places:
 packed.alpha_composite(im,(x,y));outmeta[name]={'x':x,'y':y,'w':im.width,'h':im.height,'ax':ax,'ay':ay}
packed.save(OUT/'atlas.png',optimize=True);(OUT/'atlas.json').write_text(json.dumps(outmeta,separators=(',',':')))
# Single shared base preview; rendered gameplay adds the player's real equipment.
preview=base('s',0)
preview.alpha_composite(gear('tunic',info['items']['tunic'],'s',0))
preview.alpha_composite(gear('iron_sword',info['items']['iron_sword'],'s',0))
preview.save(OUT/'novice_s_0.png',optimize=True)
print(f'Modular atlas: {len(outmeta)} sprites / {width}x{height}; skill icons: {sum(len(v) for v in info["skills"].values())}')
