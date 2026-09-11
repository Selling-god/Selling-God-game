from PIL import Image, ImageDraw
from pathlib import Path
import json, math, random

ROOT=Path('/mnt/data/rift_v40_work')
CAT=ROOT/'data/catalog.json'
data=json.load(open(CAT,encoding='utf-8'))
out=ROOT/'assets/relics'
out.mkdir(parents=True,exist_ok=True)

# Pixel canvas then nearest-neighbor scale for crisp art.
S=32
PALETTES={
 'common':('#8ed9cf','#d7fff8','#315b62','#0a1720'),
 'rare':('#6cb9ff','#d3ecff','#264e78','#081525'),
 'ultra':('#c286ff','#edd8ff','#563277','#120b20'),
 'legendary':('#f2c660','#fff0a8','#855f21','#211405'),
 'mythic':('#ff78a8','#ffd0e0','#873258','#210813'),
}

def px(draw,xy,fill): draw.rectangle(xy,fill=fill)
def outline_rect(d,xy,fill,outline): d.rectangle(xy,fill=fill,outline=outline,width=1)
def diamond(d,cx,cy,r,fill,outline=None):
 pts=[(cx,cy-r),(cx+r,cy),(cx,cy+r),(cx-r,cy)]
 d.polygon(pts,fill=fill)
 if outline:d.line(pts+[pts[0]],fill=outline,width=1)
def star(d,cx,cy,r1,r2,fill):
 pts=[]
 for i in range(10):
  a=-math.pi/2+i*math.pi/5;r=r1 if i%2==0 else r2
  pts.append((round(cx+math.cos(a)*r),round(cy+math.sin(a)*r)))
 d.polygon(pts,fill=fill)
def sparkles(d,c1,c2,seed):
 rng=random.Random(seed)
 for _ in range(8):
  x=rng.randrange(3,29);y=rng.randrange(3,29);c=c1 if rng.random()<.6 else c2
  if rng.random()<.5: px(d,(x,y,x+1,y),c)
  else: px(d,(x,y,x,y+1),c)

def draw_icon(idx,name,rarity):
 p=PALETTES.get(rarity,PALETTES['common']); main,hi,dark,bg=p
 im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
 # shadow pedestal
 d.ellipse((7,26,25,29),fill=(0,0,0,90))
 if idx==1: # red compass
  d.ellipse((7,6,25,24),fill='#57232b',outline='#f07a7f',width=2);diamond(d,16,15,7,'#e9d09a','#582c22');d.polygon([(16,8),(19,16),(16,14),(13,16)],fill='#ff626c');px(d,(15,14,17,17),'#fff1bd')
 elif idx==2: # camping kit
  d.polygon([(6,23),(14,7),(16,23)],fill=main);d.polygon([(26,23),(18,7),(16,23)],fill=hi);px(d,(9,22,23,24),dark);px(d,(15,9,17,22),'#70482b');px(d,(11,20,13,22),'#ffb64d')
 elif idx==3: # silver seal needle
  d.line((7,24,24,7),fill=hi,width=3);d.line((8,24,25,7),fill=dark,width=1);diamond(d,23,8,4,main,hi);sparkles(d,hi,main,3)
 elif idx==4: # capacitor
  outline_rect(d,(8,7,24,23),dark,hi);px(d,(10,9,22,21),'#183c52');d.line((16,10,13,16,17,16,14,21),fill='#ffe074',width=2);px(d,(5,12,8,18),main);px(d,(24,12,27,18),main)
 elif idx==5: # star crown
  d.polygon([(6,20),(8,8),(13,14),(16,6),(20,14),(25,8),(26,20)],fill=main,outline=hi);px(d,(8,20,25,23),dark);star(d,16,12,3,1,hi)
 elif idx==6: # crystal mirror
  diamond(d,16,14,11,dark,hi);diamond(d,16,14,8,'#92dff0',main);d.line((11,18,20,9),fill='#eaffff',width=2);px(d,(14,24,18,27),dark)
 elif idx==7: # time pocket watch
  d.ellipse((8,8,24,24),fill=dark,outline=hi,width=2);px(d,(14,4,18,7),main);px(d,(12,5,20,6),hi);d.line((16,16,16,10),fill=hi,width=1);d.line((16,16,21,18),fill=main,width=2);px(d,(15,15,17,17),hi)
 elif idx==8: # origin emblem
  diamond(d,16,16,12,dark,hi);diamond(d,16,16,8,main,None);diamond(d,16,16,4,bg,hi);px(d,(15,3,17,6),hi);px(d,(15,26,17,29),hi)
 elif idx==9: # resonance gloves
  d.polygon([(6,11),(11,7),(14,10),(14,22),(9,25),(6,20)],fill=main,outline=hi);d.polygon([(18,10),(21,7),(26,11),(26,20),(21,25),(18,22)],fill=dark,outline=hi);d.arc((10,9,22,21),0,360,fill='#f3a8ff',width=1)
 elif idx==10: # ash grimoire
  outline_rect(d,(7,6,24,25),dark,hi);px(d,(9,8,21,23),'#3b3034');px(d,(21,8,23,23),main);d.line((11,13,19,13),fill=hi,width=1);d.line((11,17,18,17),fill=hi,width=1);px(d,(12,9,16,10),'#e28b61')
 elif idx==11: # fragment lens
  d.ellipse((7,7,22,22),fill='#152c4c',outline=hi,width=2);d.ellipse((10,10,19,19),fill='#88d5ff',outline=main);d.line((21,21,27,27),fill=dark,width=4);d.line((21,21,27,27),fill=hi,width=1);sparkles(d,hi,main,11)
 elif idx==12: # compressed dice
  d.polygon([(8,9),(18,5),(25,11),(24,22),(14,26),(7,20)],fill=main,outline=hi);d.line((18,5,17,16,7,20),fill=dark,width=1);d.line((17,16,24,22),fill=dark,width=1)
  for x,y in [(12,13),(20,11),(18,20),(12,21)]: px(d,(x,y,x+1,y+1),bg)
 elif idx==13: # echo shield
  d.polygon([(16,5),(25,9),(24,18),(16,27),(8,18),(7,9)],fill=dark,outline=hi);d.polygon([(16,8),(22,11),(21,17),(16,23),(11,17),(10,11)],fill=main);d.arc((12,11,20,19),40,320,fill=hi,width=1)
 elif idx==14: # hunter eye
  d.polygon([(4,16),(10,9),(16,7),(22,9),(28,16),(22,23),(16,25),(10,23)],fill=dark,outline=main);d.ellipse((10,10,22,22),fill='#ffe5a0',outline=hi);d.ellipse((14,12,18,22),fill='#3a1a22');px(d,(15,14,17,18),'#ff6d78')
 elif idx==15: # void needle
  d.line((5,25,25,5),fill=hi,width=2);d.line((6,26,26,6),fill=main,width=2);diamond(d,9,22,4,'#26133d',hi);d.ellipse((17,7,27,17),outline=main,width=1);sparkles(d,main,hi,15)
 elif idx==16: # shield generator
  outline_rect(d,(7,10,25,23),dark,main);diamond(d,16,16,6,'#2f8d86',hi);d.arc((4,5,28,29),190,350,fill=hi,width=2);px(d,(4,15,7,18),main);px(d,(25,15,28,18),main)
 elif idx==17: # exploration map
  d.polygon([(5,8),(12,6),(18,9),(26,6),(26,24),(18,26),(12,23),(5,25)],fill='#d8c58a',outline=hi);d.line((12,6,12,23),fill=dark);d.line((18,9,18,26),fill=dark);d.line((8,19,14,14,20,18,23,12),fill='#55a699',width=2);px(d,(21,10,22,11),'#e75755')
 elif idx==18: # calm candle
  px(d,(13,12,20,25),'#e8d8bd');px(d,(14,16,19,17),main);d.polygon([(16,3),(20,10),(16,13),(12,9)],fill='#ffb55e');d.polygon([(16,5),(18,9),(16,11),(14,9)],fill='#fff1a2');px(d,(10,25,23,27),dark)
 elif idx==19: # endless ink bottle
  d.polygon([(10,11),(22,11),(25,17),(22,26),(10,26),(7,17)],fill=dark,outline=hi);px(d,(12,6,20,11),main);px(d,(11,14,21,22),'#34254f');d.arc((12,14,21,23),40,310,fill='#e5a8ff',width=1);sparkles(d,hi,main,19)
 elif idx==20: # windblade shard
  d.polygon([(5,22),(27,6),(21,20),(13,26)],fill=main,outline=hi);d.polygon([(10,21),(23,10),(18,19)],fill='#eaffff');d.arc((3,7,24,29),210,320,fill=hi,width=1)
 elif idx==21: # iron mantle
  d.polygon([(8,7),(13,5),(16,9),(19,5),(24,7),(26,26),(18,23),(16,27),(14,23),(6,26)],fill='#405264',outline=hi);d.line((16,9,16,25),fill=main);px(d,(11,10,13,12),'#9fb6c3')
 elif idx==22: # golden compass
  d.ellipse((6,6,26,26),fill='#6f4b14',outline=hi,width=2);d.ellipse((9,9,23,23),fill='#d5a23e',outline='#fff0a8');d.polygon([(16,8),(19,16),(16,14),(13,16)],fill='#fff3a1');d.polygon([(16,24),(13,16),(16,18),(19,16)],fill='#845117');px(d,(15,15,17,17),'#fff4be')
 else:
  diamond(d,16,15,9,main,hi);star(d,16,15,5,2,bg)
 sparkles(d,main,hi,100+idx)
 return im.resize((96,96),Image.Resampling.NEAREST)

for r in data['relics']:
 idx=int(r['id'][1:])
 img=draw_icon(idx,r['name'],r['rarity'])
 fp=out/f"{r['id']}.png";img.save(fp)
 r['art']=f"/assets/relics/{r['id']}.png"
 # Capture-specific treasures never appear in the dungeon.
 if r['id'] in {'r003','r015'}: r['modes']=['journey']
 else: r['modes']=['journey','dungeon']

json.dump(data,open(CAT,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('relic art regenerated:',len(data['relics']))
