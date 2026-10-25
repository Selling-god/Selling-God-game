#!/usr/bin/env python3
"""Starfall original frame-by-frame pixel-art combat FX. No external assets.
Run from project root: python3 tools/make_pixel_skill_sheets.py
The sprites are rendered from hand-authored weapon, magic and guard silhouettes.
Each frame is 128x128, transparent RGBA, 12 phases and one row per job.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import re, json, math, random, hashlib

ROOT=Path(__file__).resolve().parent.parent
ASSETS=ROOT/'public/assets'
ASSETS.mkdir(exist_ok=True)
JS=(ROOT/'client/job-signatures.js').read_text(encoding='utf-8')
JOBS=re.findall(r"\b([a-z][\w]+):\['([^']+)','([^']+)','([^']+)'\]", JS)
assert len(JOBS)==39, f'Unexpected jobs {len(JOBS)}'
W=H=128; N=12; TAU=math.tau
GOLD='#ffcc75'; INK='#171326'; IRON='#bbc6dd'
PALETTES={
 'trail':['#6388a2','#b7cbd9','#f5f9fb','#234258'],
 'aegis':['#547a94','#abd4e9','#ffebac','#24374d'],
 'falcon':['#448e77','#a3efbf','#f9efd7','#2a5145'],
 'aster':['#8a67c6','#cbb9ff','#fdf1b7','#302447'],
 'shadowsteps':['#8a4daa','#d58bff','#efc8f2','#262037'],
 'sanctuary':['#d7a35a','#fff0b3','#fbfdff','#554037'],
 'spearline':['#3c91a0','#b2e8ff','#f8edc1','#243b52'],
 'lotusfist':['#b55e7b','#ffb3c9','#ffffdf','#663847'],
 'seed':['#489a58','#a1e993','#fff2ba','#26462d'],
 'mineshaft':['#a58557','#f4d490','#f7f1d1','#4d453b'],
 'bloodaxe':['#ca435d','#ff95a0','#fff0bf','#521e34'],
 'holyblade':['#dda759','#ffe5aa','#fffefa','#554063'],
 'citadel':['#737d9b','#b0e0eb','#fff0cf','#313a50'],
 'crosshair':['#60a892','#c6f7ce','#fff5a9','#17453f'],
 'paw':['#a57848','#ffdf8d','#efffba','#5c4931'],
 'runeblade':['#8570d5','#bfc2ff','#fff3df','#313061'],
 'pyre':['#f05f39','#ffba65','#fff1b4','#6e2933'],
 'snowflake':['#509cc5','#a1ecff','#fbffff','#264c71'],
 'oak':['#54885a','#b8e297','#fffbd3','#2e4934'],
 'score':['#bb659c','#ffb2e3','#f8f3ce','#5a3763'],
 'flask':['#499ca3','#7fead3','#fff4a9','#285165'],
 'turret':['#8c93a7','#c6d9ee','#ffe4a0','#394a66'],
 'seal':['#a87ad3','#e3c8ff','#fff9d6','#48366c'],
 'afterimage':['#8e73ce','#d8a9ff','#fef0ff','#342457'],
 'stormfork':['#4379d0','#7fe8ff','#fbffff','#1a3e7f'],
 'wraith':['#7450a8','#b58ad9','#e7fff2','#2c214c'],
 'hourglass':['#b79b5d','#ffe2a0','#fff8d9','#48465c'],
 'spirit':['#6f9caa','#b3f7e5','#fffcdb','#3d506e'],
 'dragonfang':['#b65258','#ffb3a2','#fff4bd','#503044'],
 'orion':['#6379d0','#b1bcff','#fff5c0','#293c78'],
 'standard':['#ad704d','#e8c18b','#fff3c6','#5b3545'],
 'voidtear':['#6552af','#b788ff','#ece1ff','#231638'],
 'eclipse':['#9a4bb8','#ed9ef7','#ffe8fa','#301936'],
 'feather':['#e07e4d','#ffd78c','#fff9c4','#613748'],
 'whirlpool':['#3f98c9','#8febfa','#eefeff','#1e4973'],
 'spindle':['#9175c8','#deb4ff','#faf3ff','#3f306b'],
 'throne':['#c1a36a','#fff0c0','#fffefa','#50435b'],
 'architect':['#83aabc','#c8f8f6','#fcffde','#3f5377'],
 'shepherd':['#517ab3','#9ad8e7','#ffdeec','#213b61']
}

# Per profession, the equipment being used (not just a recoloured class sigil).
SWORDS={'trail','aegis','holyblade','runeblade','seal','standard','throne'}
SCYTHES={'wraith','eclipse','shepherd'}
SPEARS={'spearline','dragonfang','whirlpool','feather'}
AXES={'mineshaft','bloodaxe'}
DAGGERS={'shadowsteps','afterimage','voidtear'}
FISTS={'lotusfist','paw'}
BOWS={'falcon','crosshair'}
MACHINES={'turret','flask'}
GUARDS={'aegis','citadel','holyblade','sanctuary','seal'}
FIRE={'pyre','feather','dragonfang'}
ICE={'snowflake'}
WATER={'whirlpool'}
THUNDER={'stormfork','turret'}
NATURE={'seed','oak','paw'}
DARK={'wraith','eclipse','voidtear','shepherd','shadowsteps','afterimage'}
LIGHT={'holyblade','sanctuary','throne','seal'}
STAR={'aster','orion','spindle','architect'}
TECH={'turret','flask','mineshaft','architect'}
NOTES={'score'}
TIME={'hourglass'}

def c(hexcode,alpha=255):
 h=hexcode.removeprefix('#');return (int(h[:2],16),int(h[2:4],16),int(h[4:6],16),alpha)
def mix(a,b,f):
 return tuple(int(a[i]*(1-f)+b[i]*f) for i in range(3))+(255,)
def pt(x,y):return int(round(x)),int(round(y))
def ease(t):return 1-(1-max(0,min(1,t)))**3
def clamp(t):return max(0,min(1,t))

class Art:
 def __init__(self,job,motif,tier,skill,k):
  self.job,self.motif,self.tier,self.skill,self.k=job,motif,tier,skill,k
  self.img=Image.new('RGBA',(W,H),(0,0,0,0));self.d=ImageDraw.Draw(self.img,'RGBA')
  self.pa=[c(s) for s in PALETTES[motif]];self.core=self.pa[2];self.bright=self.pa[1];self.main=self.pa[0];self.shade=self.pa[3];self.out=c(INK)
  self.t=k/(N-1);self.impact=clamp((self.t-.15)/.32);self.fade=clamp((1-self.t)/.35)
  self.rng=random.Random(3001+JOBS.index((job,next(w for j,w,m,t in JOBS if j==job),motif,tier))*797+['basic','skill1','skill2','ultimate'].index(skill)*103)
  self.power={'novice':0,'common':1,'rare':2,'epic':3,'hidden':4}[tier]
  self.ult=skill=='ultimate';self.guard=skill=='skill2'
  self.ox=68;self.oy=75
 def line(self,pts,col,width=2):self.d.line([pt(*xy) for xy in pts],fill=col,width=max(1,int(width)),joint='curve')
 def polygon(self,pts,fill,outline=None,width=1):
  pts=[pt(*xy) for xy in pts];self.d.polygon(pts,fill=fill)
  if outline:self.line(pts+[pts[0]],outline,width)
 def ellipse(self,rect,fill=None,outline=None,width=1):self.d.ellipse(tuple(round(v) for v in rect),fill=fill,outline=outline,width=int(width))
 def box(self,rect,col):self.d.rectangle(tuple(round(v) for v in rect),fill=col)
 def glow(self,x,y,r=6,col=None):
  col=col or self.main
  self.ellipse((x-r-3,y-r-3,x+r+3,y+r+3),c('#ffffff',15))
  self.ellipse((x-r,y-r,x+r,y+r),col)
  self.ellipse((x-r*.48,y-r*.48,x+r*.48,y+r*.48),self.core)
 def star(self,x,y,r=8,col=None):
  col=col or self.bright
  self.line([(x-r,y),(x+r,y)],col,2);self.line([(x,y-r),(x,y+r)],col,2)
  if r>6:self.line([(x-r*.35,y-r*.35),(x+r*.35,y+r*.35)],self.core,1)
  self.box((x-1,y-1,x+1,y+1),self.core)
 def diamond(self,x,y,r=6,col=None):
  self.polygon([(x,y-r),(x+r*.58,y),(x,y+r),(x-r*.58,y)],col or self.main,self.shade,1)
  self.polygon([(x,y-r+2),(x+r*.36,y),(x,y)],self.core)
 def arc(self,cx,cy,rx,ry,start,end,color=None,width=2,steps=42):
  ps=[(cx+rx*math.cos(start+(end-start)*i/steps),cy+ry*math.sin(start+(end-start)*i/steps))for i in range(steps+1)]
  self.line(ps,color or self.main,width)
 def ribbon(self,cx,cy,r,start,end,thick=9,col=None):
  col=col or self.main;steps=39
  ps=[];outside=[];inside=[]
  for i in range(steps+1):
   q=i/steps;ang=start+(end-start)*q;rr=r*(.96+.055*math.sin(q*math.pi))
   w=thick*math.sin(q*math.pi)**.55+1
   outside.append((cx+(rr+w*.60)*math.cos(ang),cy+(rr+w*.60)*math.sin(ang)*.82))
   inside.append((cx+(rr-w*.6)*math.cos(ang),cy+(rr-w*.6)*math.sin(ang)*.82))
  ps=outside+list(reversed(inside))
  self.polygon(ps,self.shade)
  self.polygon([(cx+(r+thick*.12)*math.cos(start+(end-start)*i/steps),cy+(r+thick*.12)*math.sin(start+(end-start)*i/steps)*.82) for i in range(steps+1)]+[(cx+(r-thick*.58)*math.cos(start+(end-start)*i/steps),cy+(r-thick*.58)*math.sin(start+(end-start)*i/steps)*.82) for i in range(steps,-1,-1)],col)
  self.arc(cx,cy,r-thick*.24,r*.82,start+.14,end-.05,self.bright,2,steps)
  self.arc(cx,cy,r-thick*.48,r*.82,start+.37,end-.05,self.core,1,steps)
  a=end
  self.diamond(cx+r*math.cos(a),cy+r*math.sin(a)*.82,5,self.bright)
 def crack(self,x,y,w=1):
  ps=[(x,y-17),(x-4,y-4),(x+3,y-3),(x-6,y+18)]
  self.line(ps,self.shade,5*w);self.line(ps,self.bright,3*w);self.line(ps,self.core,max(1,round(w)))
 def particles(self,x,y,n=12,r=40,up=0):
  for j in range(n):
   a=self.rng.random()*TAU;rr=r*(.25+.72*self.rng.random())*max(.12,self.impact if self.skill!='skill2' else 1)
   px=x+math.cos(a)*rr;py=y+math.sin(a)*rr*.6-up*self.t
   width=self.rng.choice([1,2,2,3,4])
   color=[self.main,self.bright,self.core][j%3]
   if j%7==0:self.star(px,py,3+width,color)
   else:self.box((px,py,px+width,py+width),color)
 def weapon(self,kind,x=70,y=81,angle=-.7,scale=1,extra=False):
  # Weapon is physically attached to the attacking hand, not an abstract icon.
  def tr(u,v):return (x+(u*math.cos(angle)-v*math.sin(angle))*scale,y+(u*math.sin(angle)+v*math.cos(angle))*scale)
  def ln(points,col,w=2):self.line([tr(*p) for p in points],col,w*scale)
  def po(points,col,outline=None):self.polygon([tr(*p) for p in points],col,outline,1)
  grip=c('#6c443e');leather=c('#b58b64');metal=c('#d9e3e9')
  if kind=='fist':
   po([(-5,2),(8,-2),(15,-15),(3,-24),(-8,-16)],self.shade,self.out)
   for i in range(3):po([(3+i*4,-21),(7+i*4,-19),(9+i*4,-12),(5+i*4,-13)],self.bright)
   self.star(*tr(17,-12),5);return
  if kind=='bow':
   # bow limbs and bowstring, arrowhead on release
   self.line([tr(5,5),tr(19,-16),tr(7,-38)],self.shade,5*scale)
   self.line([tr(5,5),tr(19,-16),tr(7,-38)],self.bright,2*scale)
   ln([(5,5),(7,-38)],metal,1)
   ln([(-1,-17),(45,-17)],leather,2)
   po([(47,-17),(37,-22),(39,-17),(37,-12)],self.core)
   return
  # haft and grip
  len_={'scythe':47,'spear':61,'axe':39,'pick':39,'dual':30}.get(kind,44)
  ln([(0,12),(0,-len_)],self.out,6 if kind!='dual' else 4)
  ln([(-1,11),(-1,-len_+4)],grip,3)
  ln([(-1,5),(-1,-9)],leather,2)
  if kind=='sword':
   po([(-6,-len_+6),(-5,-len_-6),(0,-len_-30),(6,-len_-6),(6,-len_+6)],metal,self.out)
   po([(-3,-len_+2),(-2,-len_-7),(0,-len_-26),(1,-len_-8),(0,-len_+2)],self.core)
   ln([(-12,-len_+6),(12,-len_+6)],GOLD,4);self.diamond(*tr(0,-len_+6),3,self.main)
  elif kind=='axe' or kind=='pick':
   po([(-2,-len_),(-22,-len_-13),(-31,-len_-5),(-31,-len_+10),(-17,-len_+12),(-2,-len_+2)],self.shade,self.out)
   po([(-6,-len_-3),(-24,-len_-9),(-27,-len_-2),(-24,-len_+4),(-8,-len_+3)],self.bright)
   if kind=='pick':po([(1,-len_),(30,-len_-9),(20,-len_-4),(1,-len_+4)],self.core)
  elif kind=='spear':
   po([(-6,-len_),(-6,-len_-15),(0,-len_-33),(6,-len_-15),(6,-len_)],self.bright,self.out)
   po([(-2,-len_-4),(0,-len_-29),(2,-len_-4)],self.core)
   for side in [-1,1]: ln([(0,-len_+8),(side*7,-len_-4)],self.main,2)
  elif kind=='scythe':
   # True reaper blade: the pole is visible, the hooked metal has a distinct
   # cutting edge and pointed tip (not a floating full-circle glyph).
   blade=[(0,-len_-1),(16,-len_-15),(34,-len_-18),(47,-len_-10),
          (53,-len_+6),(42,-len_+2),(33,-len_-3),(23,-len_-1),
          (14,-len_+11),(7,-len_+10)]
   po(blade,self.shade,self.out)
   po([(9,-len_-5),(23,-len_-14),(38,-len_-12),(46,-len_-3),
       (37,-len_-6),(26,-len_-7),(15,-len_+5)],self.bright)
   ln([(11,-len_-2),(26,-len_-12),(38,-len_-10),(46,-len_-2)],self.core,2)
   po([(-3,-len_+3),(-8,-len_-8),(0,-len_-16),(7,-len_-3)],self.main)
  elif kind=='dual':
   for side in [-1,1]:
    po([(side*10,-10),(side*18,-28),(side*22,-42),(side*24,-23),(side*18,-4)],self.bright,self.out)
    ln([(side*20,-15),(side*22,-35)],self.core,2)
  elif kind=='staff':
   self.diamond(*tr(0,-len_-4),11,self.main)
   self.diamond(*tr(0,-len_-4),6,self.core)
   for side in [-1,1]:ln([(0,-len_),(side*7,-len_+7)],self.bright,2)
  if extra:self.star(*tr(0,-len_-13),7,self.core)
 def hero_streak(self,cx=76,cy=75):
  if self.k<2:return
  span={"basic":1.8,"skill1":2.25,"skill2":1.4,"ultimate":3.2}[self.skill]
  active=clamp((self.t-.13)/.53);length=span*clamp((self.t-.12)/.35)
  if self.guard:return
  if self.motif in SCYTHES:
   start=-1.85;end=start+length
   self.ribbon(cx+9,cy,37+(self.ult*9),start,end,8+self.ult*4)
   self.ribbon(cx+14,cy-3,30+(self.ult*7),start+.27,end+.20,4+self.ult*2,self.bright)
  elif self.motif in AXES:
   self.ribbon(cx+12,cy,33+self.ult*8,-1.48,-1.48+length,12+self.ult*3)
  elif self.motif in SWORDS or self.motif in DAGGERS:
   self.ribbon(cx+8,cy,31+self.ult*14,-1.46,-1.46+length,5+self.ult*5)
   if self.motif in DAGGERS and self.k>4:self.ribbon(cx+1,cy+4,26,1.25,1.25+length*.65,4,self.bright)
  elif self.motif in SPEARS:
   for side in [-1,0,1] if self.ult else [0]:
    self.line([(70,78+side*10),(74+length*17,72+side*11)],self.shade,5)
    self.line([(72,76+side*10),(74+length*17,72+side*11)],self.core,2)
    self.diamond(76+length*19,72+side*12,5,self.bright)
  elif self.motif in FISTS:
   for side in [-1,1] if self.ult else [1]:
    self.ribbon(cx+side*12,cy+side*6,23+10*active,-1.2+side*.4,1.35+side*.4,7)
 def spell(self,x=91,y=65,scale=1):
  t=self.t;m=self.motif
  rad=(11+27*clamp((t-.05)/.55))*scale
  if m in FIRE:
   if self.ult and m=='pyre':
    # Meteor is a falling rock with a molten core followed by a ground blast.
    cy=y-27+37*clamp((t-.08)/.58)
    self.polygon([(x-14,cy-14),(x+5,cy-18),(x+19,cy-4),
                  (x+14,cy+14),(x-7,cy+17),(x-19,cy+1)],self.shade,self.out,2)
    self.polygon([(x-11,cy-11),(x+6,cy-14),(x+15,cy-4),(x+9,cy+6),
                  (x-5,cy+13),(x-14,cy)],self.main)
    self.line([(x-8,cy-8),(x+6,cy-2),(x,cy+13)],self.core,4)
    for j in range(5):
     dx=(j-2)*7
     self.line([(x+dx-7,cy-18-j%2*7),(x+dx-17,cy-34-j%3*7)],self.bright,3)
    if self.k>=6:
     self.fire(x,y+29,.95)
     self.ribbon(x,y+23,25,-.25,.95,7,self.bright)
   elif self.skill=='skill1' and m=='pyre':
    # A travelling fireball has a leading incandescent orb and ember tail.
    xx=x+13*clamp(t/.72)
    self.ellipse((xx-13,y-12,xx+13,y+12),self.shade)
    self.ellipse((xx-9,y-9,xx+9,y+9),self.main)
    self.ellipse((xx-5,y-5,xx+4,y+4),self.core)
    for j in range(5):
     self.line([(xx-9-j*5,y+(j%3-1)*4),(xx-22-j*5,y-10+(j%3-1)*6)],self.main,3)
     self.box((xx-32-j*3,y+8-(j%3)*9,xx-29-j*3,y+11-(j%3)*9),self.bright)
   else:self.fire(x,y,scale)
  elif m in ICE:
   if self.ult and self.k>3:
    for j in range(6):
     xx=x+(j-2.5)*13
     zz=(j%3)*10
     self.polygon([(xx-6,y-24-zz),(xx,y-47-zz),(xx+6,y-22-zz),(xx+3,y+20)],self.shade,self.out)
     self.polygon([(xx-3,y-23-zz),(xx,y-43-zz),(xx+2,y+13)],self.bright)
     self.line([(xx,y-34-zz),(xx,y+8)],self.core,1)
    self.arc(x,y+19,41,12,.2,2.95,self.bright,4)
   for i in range(5 if self.ult else 3):
    a=i*TAU/(5 if self.ult else 3)+.25;off=(18+9*t) if self.ult else 14
    xx=x+math.cos(a)*off;yy=y+math.sin(a)*off*.7
    self.polygon([(xx,yy-20*scale),(xx+5*scale,yy-3*scale),(xx,yy+19*scale),(xx-6*scale,yy-4*scale)],self.bright,self.shade)
    self.line([(xx,yy-16*scale),(xx,yy+8*scale)],self.core,2)
   self.diamond(x,y,10,self.core)
  elif m in THUNDER:
   for j in range(2+(self.ult*3)):
    xx=x+(j-1-(self.ult))*12
    yy=y-43+4*(j%3)
    ps=[(xx,yy),(xx-7,yy+18),(xx+3,yy+23),(xx-10,y+20)]
    self.line(ps,self.shade,7);self.line(ps,self.main,4);self.line(ps,self.core,2)
  elif m in WATER:
   for j in range(3+self.ult*2):
    a=(j/(3+self.ult*2))*math.pi*1.25-.45+t*.4
    self.arc(x,y,20+j*5,12+j*3,a,a+2.4,self.bright,3)
    self.diamond(x+math.cos(a)*30,y+math.sin(a)*20,4,self.core)
  elif m in NATURE:
   for i in range(4+self.ult*2):
    xx=x+(i-2)*13
    self.line([(xx,y+19),(xx+4,y+5),(xx-5,y-12-t*9)],self.shade,5)
    self.line([(xx,y+19),(xx+4,y+5),(xx-5,y-12-t*9)],self.bright,3)
    self.leaf(xx,y-8-i%2*7,scale)
  elif m in DARK:
   self.arc(x,y,rad,rad*.72,1.45,5.7,self.main,7)
   self.arc(x,y,rad-4,rad*.72-4,1.45,5.6,self.core,2)
   for j in range(3+self.ult*3):
    a=j*TAU/(3+self.ult*3)+t
    xx=x+math.cos(a)*rad;yy=y+math.sin(a)*rad*.75
    self.diamond(xx,yy,3+(j%3)*2,self.bright)
  elif m in NOTES:
   for i in range(3+self.ult*4):
    xx=x-30+i*12;yy=y+math.sin(i*1.8+t*3)*15
    self.ellipse((xx-4,yy-3,xx+4,yy+3),self.main)
    self.line([(xx+3,yy),(xx+3,yy-19)],self.core,2)
  elif m in TIME:
   self.clock(x,y,30+self.ult*9)
  elif m in STAR:
   self.constellation(x,y,5+self.ult*3)
  elif m in TECH:
   self.machine(x,y)
  elif m in LIGHT:
   self.arc(x,y,rad,rad,0,math.pi*2,self.main,3)
   self.line([(x-22,y),(x+22,y)],self.core,5);self.line([(x,y-25),(x,y+25)],self.bright,5)
  else:
   self.constellation(x,y,5)
 def fire(self,x,y,scale=1):
  amount=(5 if self.ult else 3)
  for i in range(amount):
   dx=(i-(amount-1)/2)*12*scale;h=(19+(i%3)*9+11*self.impact)*scale
   outline=[(x+dx-7*scale,y+16*scale),(x+dx-3*scale,y-h*.3),(x+dx-5*scale,y-h*.7),(x+dx+3*scale,y-h),(x+dx+8*scale,y-h*.28),(x+dx+8*scale,y+13*scale)]
   self.polygon(outline,self.shade)
   self.polygon([(x+dx-5*scale,y+11*scale),(x+dx-1*scale,y-h*.45),(x+dx+3*scale,y-h*.7),(x+dx+5*scale,y+11*scale)],self.main)
   self.polygon([(x+dx-1*scale,y+6*scale),(x+dx,y-h*.29),(x+dx+2*scale,y+7*scale)],self.core)
 def leaf(self,x,y,s=1):
  self.polygon([(x-6*s,y+8*s),(x-7*s,y-5*s),(x+5*s,y-13*s),(x+9*s,y-3*s),(x+2*s,y+6*s)],self.main,self.shade)
  self.line([(x-4*s,y+5*s),(x+6*s,y-7*s)],self.core,1)
 def clock(self,x,y,r=27):
  self.ellipse((x-r,y-r,x+r,y+r),None,self.shade,5)
  self.ellipse((x-r+3,y-r+3,x+r-3,y+r-3),None,self.bright,2)
  for j in range(12):
   a=j*TAU/12;self.line([(x+math.cos(a)*(r-8),y+math.sin(a)*(r-8)),(x+math.cos(a)*(r-3),y+math.sin(a)*(r-3))],self.core,2)
  a=self.t*TAU*1.7;self.line([(x,y),(x+math.cos(a)*r*.65,y+math.sin(a)*r*.65)],self.core,3)
  self.line([(x,y),(x-math.sin(a)*r*.38,y+math.cos(a)*r*.38)],self.bright,2)
  self.glow(x,y,3,self.bright)
 def constellation(self,x,y,n=5):
  nodes=[]
  for i in range(n):
   a=TAU*i/n+math.pi/5+self.t*.3;rr=18+10*((i*3)%4)/3
   nodes.append((x+math.cos(a)*rr,y+math.sin(a)*rr*.8))
  for i in range(len(nodes)):
   self.line([nodes[i],nodes[(i*2+1)%n]],self.shade,3)
   self.line([nodes[i],nodes[(i*2+1)%n]],self.bright,1)
  for px,py in nodes:self.star(px,py,4,self.core)
  self.diamond(x,y,8,self.bright)
 def machine(self,x,y):
  # Hand-built mini turret/hexagonal alchemical capsule, not a generic sparkle.
  if self.motif=='turret':
   self.box((x-17,y-10,x+13,y+14),self.shade)
   self.box((x-13,y-8,x+11,y+6),self.main)
   self.box((x+8,y-6,x+37,y),self.bright)
   for xx in [x-11,x+9]:self.ellipse((xx-7,y+7,xx+7,y+21),self.out,self.core,2)
   self.star(x+36,y-3,9)
  elif self.motif=='flask':
   self.polygon([(x-5,y-26),(x+5,y-26),(x+5,y-13),(x+17,y+9),(x+12,y+19),(x-14,y+19),(x-19,y+9),(x-5,y-13)],self.shade,self.core)
   self.polygon([(x-13,y+9),(x-10,y+16),(x+10,y+16),(x+14,y+9)],self.bright)
   for i in range(6):self.diamond(x+self.rng.randint(-16,16),y+self.rng.randint(-31,-14),3,self.bright)
  elif self.motif=='mineshaft':
   for i in range(4):self.polygon([(x-23+i*13,y+14),(x-22+i*13,y-8),(x-16+i*13,y-19),(x-11+i*13,y+14)],self.main,self.out)
  elif self.motif=='architect':
   for i in range(3):
    x0=x+(i-1)*17
    self.box((x0-6,y-10-(i%2)*12,x0+7,y+15),self.shade)
    self.box((x0-3,y-7-(i%2)*12,x0+4,y+10),self.bright)
 def guard_wall(self,x=91,y=76):
  m=self.motif;grow=ease(clamp(self.t*2.9));r=12+22*grow
  if m in GUARDS or m in AXES or m=='standard':
   pts=[(x-r*.72,y-r),(x+r*.72,y-r),(x+r,y-r*.36),(x+r*.7,y+r*.55),(x,y+r),(x-r*.7,y+r*.55),(x-r,y-r*.36)]
   self.polygon(pts,c('#172d4c',125),self.shade,4)
   self.line([(x-r*.65,y-r*.72),(x+r*.64,y-r*.72)],self.bright,3)
   self.line([(x,y-r*.58),(x,y+r*.6)],self.core,4)
   if m in LIGHT:self.star(x,y,13,self.core)
   if m=='aegis':self.diamond(x,y,9,self.bright)
  elif m in SWORDS or m in SPEARS or m in DAGGERS or m in SCYTHES:
   # weapon parry; two crossed actual blades and the impact sparks
   self.weapon('sword' if m in SWORDS else 'scythe' if m in SCYTHES else 'spear' if m in SPEARS else 'dual',x-11,y+22,-.55,.7)
   self.weapon('sword',x+10,y+14,.65,.68)
   self.star(x+17,y-18,9)
  elif m in TECH:self.machine(x,y)
  elif m in BOWS:
   # Bow users evade behind a split afterimage rather than conjure a shield.
   for side in [-1,1]:
    ox=x+side*17
    self.line([(ox-5,y+14),(ox+side*2,y-22),(ox+side*9,y-4)],self.shade,5)
    self.line([(ox-3,y+11),(ox+side*2,y-17)],self.bright,2)
   self.star(x+28,y-19,10,self.core)
  elif m in FISTS:
   self.weapon('fist',x-12,y-1,-.4,1.2);self.weapon('fist',x+14,y+1,.6,1.2)
  else:
   # Job-specific elemental defensive technique, unmistakably spellcasting.
   if m in FIRE:
    for i in range(4):self.fire(x-30+i*20,y+18,.6)
   elif m in ICE:
    for i in range(5):self.diamond(x+(i-2)*12,y-9-(i%2)*12,11,self.bright)
   elif m in THUNDER:
    for i in [-1,1]:self.line([(x+i*32,y+21),(x+i*16,y-10),(x+i*27,y-24)],self.core,4)
   elif m in NATURE:
    for i in range(5):self.leaf(x+(i-2)*13,y-10-(i%2)*15,.8)
   elif m in TIME:self.clock(x,y,28)
   elif m in NOTES:
    for i in range(5):self.spell(x+(i-2)*11,y-4,.5) if False else self.star(x+(i-2)*10,y-8-7*(i%2),5)
   elif m in STAR:self.constellation(x,y,5)
   elif m in WATER:
    for i in range(3):self.arc(x,y,23+i*8,14+i*5,.3,math.pi*1.6,self.bright,3)
   elif m in DARK:
    self.arc(x,y,27,33,-.8,3.6,self.main,7)
    self.arc(x,y,24,30,-.8,3.6,self.core,2)
   else:self.constellation(x,y)
  if self.k>2 and self.k<9:
   for i in range(5+self.power):
    a=(i*TAU/(5+self.power))+.1*self.k
    if i%2:self.diamond(x+math.cos(a)*(r+12),y+math.sin(a)*(r+12)*.75,4,self.main)
 def signature(self,x=98,y=45):
  # 39 unique non-text ornament signatures; these stay small and off the actor.
  m=self.motif
  if m=='aegis':self.polygon([(x,y-9),(x+8,y-5),(x+7,y+5),(x,y+11),(x-7,y+5),(x-8,y-5)],self.bright,self.core)
  elif m=='falcon':
   for s in [-1,1]:self.line([(x,y+7),(x+s*11,y-2),(x+s*17,y-13)],self.bright,3)
  elif m in {'orion','aster','spindle'}:self.constellation(x,y,4 if m=='aster' else 6)
  elif m in {'wraith','shepherd'}:
   self.ellipse((x-9,y-11,x+9,y+9),self.main,self.bright,1)
   self.box((x-5,y-2,x-2,y+3),self.core);self.box((x+2,y-2,x+5,y+3),self.core)
   self.line([(x-9,y+8),(x-6,y+17)],self.bright,2)
  elif m=='eclipse':
   self.ellipse((x-11,y-11,x+11,y+11),self.main)
   self.ellipse((x-4,y-15,x+17,y+6),(0,0,0,0)) # clear not guaranteed; new details below
   self.arc(x,y,11,11,-1.8,1.8,self.core,3)
  elif m=='runeblade' or m=='seal':
   for j in range(4):
    a=j*TAU/4+.5;self.line([(x,y),(x+math.cos(a)*13,y+math.sin(a)*13)],self.core,2)
  elif m=='snowflake':
   for j in range(6):
    a=j*TAU/6;self.line([(x,y),(x+math.cos(a)*15,y+math.sin(a)*15)],self.core,2)
  elif m=='pyre' or m=='feather':self.fire(x,y,.52)
  elif m=='stormfork':self.crack(x,y,.7)
  elif m=='hourglass':self.polygon([(x-7,y-13),(x+7,y-13),(x,y),(x+7,y+13),(x-7,y+13),(x,y)],self.shade,self.core)
  elif m=='throne':self.polygon([(x-11,y+6),(x-12,y-8),(x-4,y-2),(x,y-14),(x+4,y-2),(x+12,y-8),(x+11,y+6)],self.main,self.core)
  elif m=='citadel':self.box((x-11,y-9,x+11,y+8),self.shade);self.box((x-7,y-14,x-2,y-8),self.bright);self.box((x+2,y-14,x+7,y-8),self.bright)
  elif m=='score':self.line([(x-7,y+8),(x-7,y-13),(x+12,y-10)],self.core,3);self.ellipse((x-13,y+4,x-5,y+11),self.bright)
  elif m=='flask':self.machine(x,y)
  elif m=='turret':self.machine(x,y)
  elif m in NATURE:self.leaf(x,y,.8)
  elif m in WATER:self.arc(x,y,13,8,0,math.pi*1.7,self.core,3)
  elif m=='dragonfang':self.polygon([(x-4,y-16),(x+8,y-13),(x,y+13)],self.core)
  elif m=='voidtear':self.line([(x-4,y-13),(x+3,y-2),(x-6,y+4),(x+4,y+14)],self.bright,4)
  elif m=='bloodaxe':self.weapon('axe',x,y+16,-.2,.36)
  elif m=='mineshaft':self.weapon('pick',x,y+16,-.2,.36)
  elif m in BOWS:self.weapon('bow',x,y+8,-.3,.36)
  elif m in SPEARS:self.weapon('spear',x,y+8,-.3,.40)
  elif m in SCYTHES:self.weapon('scythe',x,y+9,-.3,.37)
  elif m in FISTS:self.weapon('fist',x,y+5,-.3,.45)
  elif m in DAGGERS:self.weapon('dual',x,y+6,-.3,.45)
  else:self.diamond(x,y,10,self.bright)
 def compose(self):
  # Empty first frame intentionally establishes anticipation, not invisible attack.
  if self.k==0:
   self.star(88,70,5,self.main)
   return self.img
  t=self.t;m=self.motif;skill=self.skill;power=self.power
  scale=1 if skill=='basic' else 1.13 if skill=='skill1' else .94 if skill=='skill2' else 1.33
  if skill=='basic':
   if m in SWORDS|AXES|SCYTHES|SPEARS|DAGGERS|FISTS|BOWS:
    kinds='sword' if m in SWORDS else 'axe' if m in AXES else 'scythe' if m in SCYTHES else 'spear' if m in SPEARS else 'dual' if m in DAGGERS else 'fist' if m in FISTS else 'bow'
    ang=-1.62+ease(clamp(t/.61))*2.1
    self.weapon(kinds,73,83,ang,.84)
    self.hero_streak(72,77)
   else:
    self.weapon('staff',70,89,-.35,.63)
    if self.k>2:self.spell(94,72,.48+min(1,.65*t)*.36)
   if self.k>3:self.particles(103,72,5,23)
  elif skill=='skill1':
   if m in SWORDS|AXES|SCYTHES|SPEARS|DAGGERS|FISTS:
    kinds='sword' if m in SWORDS else 'axe' if m in AXES else 'scythe' if m in SCYTHES else 'spear' if m in SPEARS else 'dual' if m in DAGGERS else 'fist'
    if self.k>1:
     ang=-1.7+ease(clamp((t-.08)/.6))*2.65
     self.weapon(kinds,72,86,ang,.98,extra=self.k in [5,6] and power>=3)
     self.hero_streak(71,79)
     if m in {'runeblade','seal','throne','holyblade'} and self.k>=4:
      for i in [-1,0,1]:self.diamond(108,50+i*12,5,self.bright)
   elif m in BOWS:
    self.weapon('bow',69,82,-.15,1.0)
    if self.k>2:
     self.line([(70,69),(115,69)],self.out,6);self.line([(72,69),(113,69)],self.bright,3)
     self.star(114,69,7)
     if m=='falcon':self.signature(97,47)
   elif m in MACHINES:self.machine(90,70)
   else:
    self.weapon('staff',66,86,-.1,.83)
    if self.k>1:self.spell(93,69,.86)
   if self.k>=4:self.particles(95,69,11+2*power,41,4)
  elif skill=='skill2':
   if m in SCYTHES|DAGGERS|SWORDS|SPEARS|AXES|FISTS|BOWS|GUARDS|TECH|FIRE|ICE|WATER|THUNDER|NATURE|TIME|STAR|NOTES|LIGHT|DARK:
    self.guard_wall(91,72)
   else:self.guard_wall(91,72)
   if self.k>=2 and self.k<10:self.signature(97,40)
   if self.k in [5,6] and power>=3:
    for i in range(4):self.star(70+i*9,35+7*(i%2),3,self.core)
  else:
   # Ultimates are hand-authored combinations of big equipment, spell and class mythology.
   if m in SWORDS|AXES|SCYTHES|SPEARS|DAGGERS|FISTS|BOWS:
    if self.k>1:
     kinds='sword' if m in SWORDS else 'axe' if m in AXES else 'scythe' if m in SCYTHES else 'spear' if m in SPEARS else 'dual' if m in DAGGERS else 'fist' if m in FISTS else 'bow'
     ang=-1.82+ease(clamp((t-.08)/.58))*2.9
     self.weapon(kinds,67,88,ang,1.08)
     if m in BOWS:
      for i in [-1,0,1]:self.line([(74,66+i*13),(119,66+i*13)],self.bright,3)
     else:
      self.hero_streak(66,76)
      if self.k in (5,6,7) and m in {'bloodaxe','eclipse','throne','dragonfang'}:
       self.ribbon(80,71,43,-1.8,-1.8+2.6*clamp((t-.12)/.54),7,self.bright)
   else:
    if self.k>1:self.spell(92,70,1.15)
    self.weapon('staff',62,91,-.05,.67)
    if m in STAR|TIME and self.k>3:self.constellation(83,70,7)
    if m in DARK and self.k>3:
     self.arc(89,66,32,38,0.3,5.3,self.bright,4)
   if self.k in range(3,10):
    # Large effects are vivid but remain transparent and never span the full camera.
    if power>=3 or m in FIRE|ICE|THUNDER|WATER:
     for i in range(3+power):
      aa=(TAU*i/(3+power))+.2*t
      self.star(96+math.cos(aa)*27,64+math.sin(aa)*25,3+i%3,self.main)
    self.signature(94,37)
    self.particles(98,71,16+power*3,49,7)
  # Each profession has a silhouette signature, but it does NOT replace the weapon pose.
  if skill not in ('skill2','ultimate') and self.k>=4 and power>=2:
   self.signature(99,41)
  if self.k in (8,9,10):
   # last frames: transparent broken shards instead of an unmoving stamped logo
   decay=(self.k-7)/5
   for i in range(7+self.power):
    a=self.rng.random()*TAU;rr=18+self.rng.random()*29
    xx=93+math.cos(a)*rr;yy=72+math.sin(a)*rr*.65-15*decay
    self.box((xx,yy,xx+2+(i%2),yy+2),self.core if i%2 else self.main)
  if self.k>=10:
   # Rapid collapse leaves a few dying embers instead of a final full opaque frame.
   self.img.putalpha(self.img.getchannel('A').point(lambda a:int(a*(.55 if self.k==10 else .22))))
  return self.img

if __name__=='__main__':
 skills=['basic','skill1','skill2','ultimate']
 meta={'version':4,'frameWidth':W,'frameHeight':H,'frames':N,
       'jobs':[j for j,_,_,_ in JOBS],'skills':skills,'anchor':[.53,.59],
       'sheetFolder':'/assets/skillfx_v4/'}
 folder=ASSETS/'skillfx_v4';folder.mkdir(exist_ok=True)
 sizes=0
 for job,weapon,motif,tier in JOBS:
  # A job loads only its own 4x12 frames; bounded client memory even on mobile.
  sprite=Image.new('RGBA',(W*N,H*len(skills)),(0,0,0,0))
  for row,skill in enumerate(skills):
   for k in range(N):
    art=Art(job,motif,tier,skill,k)
    sprite.paste(art.compose(),(k*W,row*H))
  dest=folder/f'{job}.png';sprite.save(dest,optimize=True,compress_level=7)
  sizes+=dest.stat().st_size
 (ASSETS/'skillfx_v4.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
 print('generated',len(JOBS)*len(skills)*N,'original frames',len(JOBS),'strips',sizes,'bytes')
