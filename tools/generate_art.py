"""Original pixel art for Starfall Online. Requires Pillow only to regenerate.
The game ships with PNGs and does not need Python or Pillow at runtime.
No third-party artwork, character likenesses or fonts are used.
"""
from PIL import Image, ImageDraw
from pathlib import Path
import math, random, json
OUT=Path(__file__).resolve().parents[1]/'public'/'assets'
OUT.mkdir(parents=True,exist_ok=True)
sprites={}
def add(name,img,anchor=None):
    sprites[name]=(img,anchor or (img.width//2,img.height-4))
def canvas(w,h):
    im=Image.new('RGBA',(w,h));return im,ImageDraw.Draw(im)
def poly(d,pts,c,outline=None):
    d.polygon(pts,fill=c)
    if outline:d.line(pts+[pts[0]],fill=outline,width=2)
def rect(d,box,c):d.rectangle(tuple(map(round,box)),fill=c)
def ellipse(d,box,c):d.ellipse(tuple(map(round,box)),fill=c)
O='#132126';INK='#141c29'
# Ground tiles: broad color clusters rather than noisy single-pixel dithering.
palettes={
'town':['#344a40','#3d5547','#45604d','#496750'],
'forest':['#243e37','#2a493c','#315343','#375d47'],
'ruins':['#323444','#3b3e50','#45495a','#4c5260'],
'citadel':['#383239','#42373c','#4a3d42','#514248']}
for theme,pal in palettes.items():
    for kind in range(4):
        for v in range(8):
            rng=random.Random(f'{theme}{kind}{v}');im,d=canvas(32,32)
            colors=pal
            if kind==1:colors={'town':['#7b7059','#887a60','#95866a'],'forest':['#565744','#60614a','#6c6b50'],'ruins':['#525469','#5c5c70','#66667b'],'citadel':['#5a4b49','#65544d','#725f53']}[theme]
            if kind==2:colors=['#18373b','#20444a','#285158'] if theme!='citadel' else ['#532c32','#793b35','#a85038']
            if kind==3:colors=['#686859','#777464','#817b6b']
            rect(d,(0,0,31,31),colors[0])
            for n in range(18):
                x=rng.randrange(32);y=rng.randrange(32)
                rect(d,(x,y,x+rng.randrange(2,9),y+rng.randrange(1,4)),rng.choice(colors))
            if kind==0:
                for n in range(4):
                    x=rng.randrange(3,29);y=rng.randrange(4,29)
                    d.line([(x-2,y+2),(x,y),(x,y-3)],fill=pal[-1],width=1)
            if kind==2:
                for n in range(3):
                    x=rng.randrange(28);y=rng.randrange(31)
                    rect(d,(x,y,x+4,y),colors[-1])
            if kind==3 or (kind==1 and theme in ('ruins','citadel')):
                d.line([(0,16),(32,16)],fill=pal[0],width=1)
                d.line([(v%2*14,0),(v%2*14,16)],fill=pal[0])
                d.line([(16,16),(16,32)],fill=pal[0])
            add(f'tile_{theme}_{kind}_{v}',im,(0,0))
# Characters, four directions and four frames.
def hero(kind,direction,frame):
    im,d=canvas(48,64)
    schemes={
     'guardian':('#46687a','#91b5bf','#d5b585','#6a3943','#785348'),
     'ranger':('#376656','#83af81','#bcd393','#314b46','#815539'),
     'mage':('#645487','#ab96cb','#dbbd88','#343550','#c3aa8b'),
     'lia':('#536d6a','#acd3b2','#e6c985','#3a4b50','#e7d2a1'),
     'merchant':('#7d4c41','#bc8b66','#dfc795','#493f39','#4b302f'),
     'smith':('#4e5962','#a9a7a1','#bb9564','#3b302b','#795642'),
     'healer':('#6c7c85','#b8ccd0','#ddbd84','#485d65','#9d5f4c'),
     'skeleton':('#697b80','#bdc8bd','#e4dbc1','#3b414c','#d0d3b7'),
     'ash_knight':('#514966','#928398','#c18a68','#302d40','#898098')}
    main,light,trim,dark,hair=schemes[kind]
    bob=0 if frame%2==0 else -1
    foot=58;step=[0,2,0,-2][frame]
    back=direction=='n';side=direction in ('e','w')
    # cloak silhouette and lower edge
    poly(d,[(13,31+bob),(32,31+bob),(37,52),(29,55),(25,52),(20,57),(10,53)],INK)
    poly(d,[(15,32+bob),(31,32+bob),(34,51),(27,53),(22,51),(17,54),(13,51)],dark)
    for x in [16,22,29]:d.line([(x,36),(x-2,50)],fill=main,width=2)
    # boots
    rect(d,(17,46+bob,22,foot+step),INK);rect(d,(26,46+bob,31,foot-step),INK)
    rect(d,(18,48+bob,21,55+step),'#544335');rect(d,(27,48+bob,30,55-step),'#544335')
    rect(d,(16,56+step,23,59+step),'#b39b72');rect(d,(25,56-step,33,59-step),'#8f7654')
    # torso
    poly(d,[(16,29+bob),(30,29+bob),(33,43+bob),(28,49+bob),(18,48+bob),(13,41+bob)],INK)
    poly(d,[(17,30+bob),(29,30+bob),(31,43+bob),(27,47+bob),(18,46+bob),(15,40+bob)],main)
    rect(d,(20,32+bob,23,42+bob),light);rect(d,(16,43+bob,30,45+bob),dark)
    rect(d,(23,43+bob,26,46+bob),trim)
    # shoulder pads, hands
    ellipse(d,(10,30+bob,19,38+bob),INK);ellipse(d,(11,30+bob,18,35+bob),main)
    rect(d,(12,31+bob,17,32+bob),light)
    ellipse(d,(28,30+bob,37,38+bob),INK);ellipse(d,(29,30+bob,36,35+bob),main)
    rect(d,(30,31+bob,35,32+bob),light)
    rect(d,(11,37+bob,15,44+bob),'#b78568');rect(d,(32,37+bob,36,44+bob),'#ca9876')
    # head / neck
    rect(d,(20,25+bob,27,30+bob),'#bd8764')
    poly(d,[(17,12+bob),(28,12+bob),(33,18+bob),(31,27+bob),(26,31+bob),(19,28+bob),(15,22+bob)],INK)
    rect(d,(18,16+bob,29,26+bob),'#c99978')
    rect(d,(19,18+bob,28,24+bob),'#e3b58b')
    if not back:
        rect(d,(21 if side else 19,21+bob,23 if side else 21,22+bob),INK)
        rect(d,(27,21+bob,29,22+bob),INK)
        rect(d,(24,26+bob,27,26+bob),'#986c58')
    if kind in ('guardian','ash_knight'):
        poly(d,[(15,19+bob),(16,12+bob),(23,9+bob),(31,12+bob),(33,19+bob),(28,17+bob),(23,18+bob)],INK)
        poly(d,[(17,17+bob),(18,13+bob),(24,11+bob),(30,14+bob),(31,17+bob)],main)
        rect(d,(23,11+bob,25,17+bob),light)
        rect(d,(16,19+bob,18,25+bob),light);rect(d,(30,19+bob,32,25+bob),main)
        poly(d,[(24,11+bob),(23,5+bob),(27,2+bob),(29,9+bob)],'#a35953')
    elif kind=='mage':
        poly(d,[(10,19+bob),(17,14+bob),(22,0),(27,8+bob),(31,15+bob),(38,20+bob),(26,23+bob)],INK)
        poly(d,[(13,18+bob),(19,14+bob),(22,4),(26,10+bob),(29,16+bob),(33,18+bob),(25,20+bob)],main)
        d.line([(18,16+bob),(28,17+bob)],fill=trim,width=2)
    elif kind=='ranger':
        poly(d,[(15,20+bob),(16,13+bob),(24,8+bob),(31,13+bob),(33,21+bob),(28,17+bob),(20,16+bob)],dark)
        d.line([(18,14+bob),(24,10+bob),(29,14+bob)],fill=light,width=2)
        d.line([(27,11+bob),(32,3+bob)],fill=trim,width=2)
    elif kind=='skeleton':
        ellipse(d,(16,11+bob,32,27+bob),light)
        if not back:
            rect(d,(19,17+bob,22,20+bob),INK);rect(d,(27,17+bob,30,20+bob),INK)
            for x in range(20,29,3):rect(d,(x,24+bob,x,27+bob),INK)
        for y in [34,38,41]:d.line([(18,y+bob),(28,y+bob)],fill=trim,width=2)
    else:
        poly(d,[(15,22+bob),(15,15+bob),(21,10+bob),(29,12+bob),(33,18+bob),(30,19+bob),(24,15+bob),(20,21+bob)],hair)
        if kind=='lia':
            d.line([(16,18+bob),(17,29+bob),(13,37+bob)],fill=hair,width=3)
            d.line([(31,19+bob),(32,32+bob)],fill=hair,width=3)
            rect(d,(23,12+bob,25,14+bob),trim)
        if kind=='healer':
            poly(d,[(15,18+bob),(18,10+bob),(28,9+bob),(32,17+bob)],'#ced6c8')
            rect(d,(22,11+bob,26,12+bob),trim)
        if kind=='merchant':
            poly(d,[(12,16+bob),(18,12+bob),(30,12+bob),(35,18+bob),(22,20+bob)],trim)
    if back:
        rect(d,(19,17+bob,29,26+bob),hair if kind not in ('mage','ranger') else dark)
        d.line([(21,19+bob),(21,25+bob)],fill=main,width=2)
    # weapon silhouettes
    if kind in ('guardian','ash_knight','skeleton'):
        yy=frame%2*3
        poly(d,[(36,45-yy),(39,22-yy),(42,18-yy),(43,27-yy),(39,46-yy)],INK)
        poly(d,[(38,42-yy),(40,25-yy),(42,22-yy),(41,29-yy)],light)
        rect(d,(34,43-yy,43,45-yy),trim)
        rect(d,(37,46-yy,39,51-yy),dark)
        poly(d,[(8,35),(17,36),(17,47),(12,52),(7,46)],INK)
        poly(d,[(9,37),(15,38),(15,46),(12,49),(9,45)],main)
        d.line([(12,38),(12,47)],fill=trim,width=2)
    elif kind=='ranger':
        d.arc((31,24,44,52),260,100,fill=INK,width=4)
        d.arc((32,25,43,51),260,100,fill=trim,width=2)
        d.line([(36,25),(37,51)],fill='#d7cfac')
        d.line([(32,38),(46,36)],fill='#e1c99b')
    elif kind in ('mage','healer','lia'):
        d.line([(38,51),(36,21)],fill=INK,width=5)
        d.line([(38,51),(36,21)],fill=trim,width=2)
        ellipse(d,(32,13,41,24),dark)
        poly(d,[(36,12),(40,17),(37,23),(33,18)],'#93d8da' if kind!='mage' else '#bdadf7')
        rect(d,(35,15,36,18),'#edf5da')
    elif kind=='smith':
        rect(d,(35,35,37,51),trim);rect(d,(31,32,42,37),INK);rect(d,(32,32,41,35),light)
    else:
        ellipse(d,(32,38,44,51),dark);ellipse(d,(33,38,43,48),trim)
    if direction=='w':im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return im
for kind in ['guardian','ranger','mage','lia','merchant','smith','healer','skeleton','ash_knight']:
    dirs=['s','n','e','w'] if kind in ['guardian','ranger','mage'] else ['s']
    for direction in dirs:
        for f in range(4):add(f'{kind}_{direction}_{f}',hero(kind,direction,f),(24,59))
# Monsters and boss sprites.
for kind in ['slime','beetle','wolf','wisp','golem','imp','moss_guardian','moon_witch','eclipse_dragon']:
    for f in range(4):
        boss=kind in ['moss_guardian','moon_witch','eclipse_dragon']
        w,h=(144,128) if kind=='eclipse_dragon' else (104,120) if boss else (64,64)
        im,d=canvas(w,h);b=[0,-1,0,1][f]
        if kind=='slime':
            ellipse(d,(12,29+b,53,57),INK);ellipse(d,(14,29+b,51,54),'#37776d')
            ellipse(d,(17,29+b,48,48+b),'#5fa58b')
            ellipse(d,(20,29+b,43,40+b),'#91cbaa')
            rect(d,(23,42+b,26,46+b),'#162c31');rect(d,(38,42+b,41,46+b),'#162c31')
            rect(d,(25,42+b,26,43+b),'#f0ebc4');rect(d,(40,42+b,41,43+b),'#f0ebc4')
            rect(d,(29,48+b,35,49+b),'#34594e')
            rect(d,(19,35+b,23,37+b),'#c2e0b5')
        elif kind=='beetle':
            for side in [-1,1]:
                for y in [34,42,49]:d.line([(32+side*15,y),(32+side*24,y+5)],fill=INK,width=4)
            ellipse(d,(14,25+b,51,55),INK);ellipse(d,(17,27+b,49,52),'#796944')
            ellipse(d,(22,29+b,45,50),'#9b9755');d.line([(33,29),(32,50)],fill='#4c5142',width=2)
            for x in [24,40]:ellipse(d,(x-3,34,x+3,40),'#c9b96d')
            ellipse(d,(25,18+b,42,32+b),INK);rect(d,(28,23+b,31,25+b),'#d4e7b0');rect(d,(37,23+b,40,25+b),'#d4e7b0')
            d.line([(26,20),(20,13)],fill='#afad75',width=2);d.line([(39,20),(46,13)],fill='#afad75',width=2)
        elif kind=='wolf':
            poly(d,[(9,38),(3,27),(9,30),(16,36),(45,30),(55,35),(58,46),(48,51),(17,50)],INK)
            poly(d,[(13,37),(25,29),(43,31),(49,41),(42,49),(17,47)],'#536777')
            poly(d,[(19,35),(31,28),(43,33),(39,38),(25,39)],'#82959b')
            for x,s in [(19,1),(38,-1)]:
                rect(d,(x,46,x+6,57+f%2*s),'#344653');rect(d,(x-1,56+f%2*s,x+7,59+f%2*s),'#93a29e')
            poly(d,[(40,34),(40,21),(45,14),(49,23),(55,18),(58,31),(62,36),(57,43),(47,42)],INK)
            poly(d,[(42,32),(44,23),(47,19),(49,27),(54,23),(56,33),(60,36),(54,39),(47,37)],'#788e98')
            rect(d,(49,29,52,31),'#dfbf79');rect(d,(58,35,61,37),INK)
        elif kind=='wisp':
            for rr,c in [(24,'#283a55'),(17,'#426276'),(11,'#77b9ba')]:ellipse(d,(32-rr,33+b-rr,32+rr,33+b+rr),c)
            poly(d,[(22,44+b),(21,59),(31,52+b),(40,57),(42,43+b)],'#426276')
            poly(d,[(26,23+b),(32,14+b),(39,26+b),(42,39+b),(33,48+b),(23,37+b)],'#a1d9ce')
            rect(d,(26,30+b,29,33+b),INK);rect(d,(36,30+b,39,33+b),INK)
            rect(d,(30,42+b,36,43+b),'#567d87')
        elif kind=='golem':
            for x in [18,39]:poly(d,[(x,44),(x+10,44),(x+10,58),(x-3,58)],INK);rect(d,(x,47,x+7,56),'#68757a')
            poly(d,[(16,23),(45,20),(53,34),(46,50),(21,50),(12,39)],INK)
            poly(d,[(18,25),(43,23),(49,34),(43,47),(22,47),(16,38)],'#687d7b')
            poly(d,[(20,25),(34,23),(32,38),(19,36)],'#8a9990')
            for x in [7,48]:ellipse(d,(x,28+b,x+12,47+b),INK);rect(d,(x+2,31+b,x+10,43+b),'#73827b')
            rect(d,(23,10+b,42,27+b),INK);rect(d,(25,12+b,40,25+b),'#889790')
            rect(d,(27,19+b,31,21+b),'#b7e4c1');rect(d,(35,19+b,39,21+b),'#b7e4c1')
            d.line([(33,27),(34,37),(28,41)],fill='#b5cdad',width=2)
            rect(d,(23,8+b,35,12+b),'#506a49')
        elif kind=='imp':
            poly(d,[(17,28),(4,18),(6,40),(20,46),(26,51),(41,47),(58,34),(59,18),(44,27)],INK)
            poly(d,[(17,31),(7,23),(9,35),(19,39)],'#7d4550');poly(d,[(45,31),(55,23),(54,35),(44,39)],'#7d4550')
            ellipse(d,(19,27,46,53),'#9e5850')
            ellipse(d,(20,13+b,47,37+b),INK);ellipse(d,(23,15+b,44,34+b),'#b57a58')
            poly(d,[(23,19),(19,5),(29,15)],'#d6b87b');poly(d,[(38,15),(47,5),(44,22)],'#d6b87b')
            rect(d,(26,24+b,30,26+b),'#f0d08b');rect(d,(37,24+b,41,26+b),'#f0d08b')
            for x in [23,38]:rect(d,(x,50,x+5,58),'#533b46')
        elif kind=='moss_guardian':
            # Ancient forest king, root legs and broad bark armor.
            for x in [27,62]:
                poly(d,[(x,78),(x+17,76),(x+22,109),(x+11,114),(x-7,110)],INK)
                poly(d,[(x+3,81),(x+14,80),(x+17,106),(x+8,110),(x-3,106)],'#6c6851')
                d.line([(x+9,83),(x+7,108)],fill='#ad9b6b',width=3)
            poly(d,[(22,39+b),(48,29+b),(78,39+b),(84,69+b),(72,91),(39,95),(22,75)],INK)
            poly(d,[(27,43+b),(48,34+b),(73,43+b),(78,68+b),(68,85),(40,89),(28,73)],'#6e7056')
            for x in [31,43,56,69]:d.line([(x,45+b),(x-3,73),(x+2,87)],fill='#a39468',width=3)
            for x,y in [(10,48),(76,48)]:
                poly(d,[(x,y),(x+17,y-8),(x+23,y+12),(x+19,y+39),(x+6,y+43),(x-3,y+22)],INK)
                poly(d,[(x+3,y+2),(x+15,y-4),(x+18,y+13),(x+14,y+35),(x+6,y+37),(x+1,y+21)],'#73765b')
                rect(d,(x+4,y+4,x+17,y+10),'#8a9b60')
            poly(d,[(34,39+b),(29,22+b),(38,10+b),(60,9+b),(73,24+b),(65,44+b)],INK)
            poly(d,[(38,37+b),(34,23+b),(41,15+b),(58,14+b),(67,25+b),(61,39+b)],'#7b805b')
            for x in [39,56]:
                rect(d,(x,28+b,x+8,32+b),'#1e3738');rect(d,(x+1,29+b,x+7,30+b),'#b3efd2')
            d.line([(47,39+b),(57,39+b)],fill='#333c36',width=3)
            for pts in [[(38,19),(22,15),(16,4)],[(60,17),(77,12),(84,1)],[(44,14),(42,1)]]:
                d.line(pts,fill=INK,width=7);d.line(pts,fill='#a69b70',width=3)
            for x,y in [(23,40),(59,37),(32,14),(68,47),(15,57)]:
                poly(d,[(x-6,y+7),(x-4,y),(x+3,y-3),(x+10,y+4),(x+6,y+10)],'#49644e')
                rect(d,(x,y,x+5,y+2),'#a0b876')
            poly(d,[(50,53),(59,63),(51,73),(42,63)],'#2b5a55')
            poly(d,[(50,57),(55,63),(50,68),(46,63)],'#adddc0')
        elif kind=='moon_witch':
            cy=50+b*2
            poly(d,[(48,32+b),(69,43+b),(82,78+b),(94,105+b),(77,101+b),(65,114+b),(51,104+b),(34,115+b),(14,106+b),(24,89+b),(32,54+b)],INK)
            poly(d,[(49,37+b),(65,46+b),(75,78+b),(86,101+b),(68,98+b),(60,106+b),(49,98+b),(35,107+b),(23,102+b),(31,79+b),(36,56+b)],'#514b76')
            poly(d,[(46,47+b),(55,44+b),(58,95+b),(50,101+b),(41,95+b)],'#8a81a5')
            d.line([(33,59+b),(28,85+b),(22,100+b)],fill='#b0a2c1',width=2)
            d.line([(66,56+b),(71,82+b),(82,99+b)],fill='#b0a2c1',width=2)
            ellipse(d,(39,24+b,64,47+b),'#d3b6ad')
            rect(d,(44,35+b,49,37+b),'#36354b');rect(d,(56,35+b,60,37+b),'#36354b')
            poly(d,[(19,29+b),(36,22+b),(51,1),(59,12),(64,23+b),(83,31+b),(62,38+b),(40,35+b)],INK)
            poly(d,[(27,28+b),(41,22+b),(51,6),(57,17),(62,26+b),(74,30+b),(55,32+b)],'#716387')
            d.line([(37,25+b),(62,29+b)],fill='#d1b57c',width=3)
            poly(d,[(49,19),(53,22),(50,26),(47,22)],'#e9d6a3')
            d.line([(83,91),(79,42)],fill=INK,width=5);d.line([(83,91),(79,42)],fill='#a2a6bc',width=2)
            d.arc((67,19,92,49),35,300,fill='#d9c89a',width=4)
            for x,y in [(20,57),(83,60),(12,83),(91,86)]:rect(d,(x,y+b,x+2,y+2+b),'#d4c4ec')
        elif kind=='eclipse_dragon':
            # Large original winged boss silhouette.
            poly(d,[(53,56),(28,22),(9,8),(3,47),(13,39),(22,56),(35,62),(50,79)],INK)
            poly(d,[(51,58),(28,28),(12,16),(9,39),(15,34),(24,50),(37,57)],'#554666')
            d.line([(11,15),(29,43),(49,65)],fill='#a77b86',width=2)
            poly(d,[(88,55),(114,20),(135,6),(141,48),(129,38),(120,54),(106,65),(92,81)],INK)
            poly(d,[(92,58),(114,27),(132,14),(136,39),(129,32),(117,49),(103,59)],'#675173')
            d.line([(133,14),(115,43),(93,65)],fill='#bb8790',width=2)
            poly(d,[(46,72),(57,39),(83,36),(100,65),(98,95),(81,111),(61,108),(44,91)],INK)
            poly(d,[(51,73),(61,44),(80,42),(93,68),(91,92),(79,104),(64,101),(50,89)],'#584c68')
            poly(d,[(66,52),(79,52),(83,94),(74,106),(64,94)],'#ab8d88')
            for y in range(60,99,8):d.line([(65,y),(83,y+2)],fill='#766478',width=2)
            for x in [48,86]:
                poly(d,[(x,84),(x+11,86),(x+16,108),(x+12,117),(x-8,116),(x-6,109)],INK)
                poly(d,[(x+2,88),(x+8,89),(x+11,108),(x+8,113),(x-3,112)],'#70617b')
                for k in range(3):poly(d,[(x-4+k*6,111),(x-7+k*6,119),(x-1+k*6,116)],'#cfbd99')
            poly(d,[(92,93),(112,94),(123,84),(129,72),(135,78),(130,96),(116,108),(96,110)],INK)
            poly(d,[(96,96),(113,99),(127,86),(126,94),(114,104),(98,105)],'#796177')
            poly(d,[(56,42),(52,21+b),(65,12+b),(84,16+b),(93,33+b),(85,50+b),(69,56+b)],INK)
            poly(d,[(60,41),(57,23+b),(67,17+b),(81,20+b),(87,34+b),(80,46+b),(69,50+b)],'#817082')
            poly(d,[(59,24),(48,13),(47,1),(57,12),(66,18)],'#bcab90')
            poly(d,[(80,19),(93,10),(99,1),(98,17),(88,28)],'#d6bfa0')
            rect(d,(61,31+b,69,35+b),'#292638');rect(d,(77,31+b,85,35+b),'#292638')
            rect(d,(63,32+b,69,33+b),'#f3c08a');rect(d,(77,32+b,83,33+b),'#f3c08a')
            poly(d,[(68,40+b),(81,40+b),(78,47+b),(70,46+b)],'#342939')
            for x in [70,76]:poly(d,[(x,41+b),(x+2,45+b),(x+3,41+b)],'#e4ceb1')
            for x,y in [(61,58),(54,71),(90,65)]:poly(d,[(x,y),(x-4,y-10),(x+5,y-3)],'#b69c90')
        add(f'{kind}_{f}',im,(w//2,h-7))
# Environmental props.
for typ in ['tree','pine','dead_tree']:
    im,d=canvas(96,128);rng=random.Random(typ)
    if typ=='dead_tree':
        d.line([(47,122),(49,77),(43,38),(49,10)],fill=INK,width=13)
        d.line([(48,117),(50,76),(46,39),(49,12)],fill='#625e62',width=7)
        for pts in [[(48,73),(23,54),(18,28)],[(47,52),(66,37),(72,12)],[(51,88),(73,64),(83,57)]]:
            d.line(pts,fill=INK,width=7);d.line(pts,fill='#7d7471',width=3)
    else:
        poly(d,[(40,125),(44,78),(52,77),(58,125),(48,121)],INK)
        rect(d,(46,78,52,119),'#766b4e');rect(d,(47,80,49,117),'#a29162')
        if typ=='pine':
            for cy,ww in [(77,42),(55,35),(35,27),(17,18)]:
                poly(d,[(48,cy-24),(48-ww,cy+14),(48-ww+14,cy+10),(48-ww+10,cy+21),(48+ww-8,cy+21),(48+ww-13,cy+11),(48+ww,cy+13)],INK)
                poly(d,[(48,cy-21),(48-ww+5,cy+12),(48-ww+17,cy+8),(48-ww+15,cy+17),(48+ww-13,cy+17),(48+ww-16,cy+8),(48+ww-5,cy+10)],'#315749')
                d.line([(48,cy-17),(48-ww+18,cy+6)],fill='#6f9470',width=2)
        else:
            blobs=[(18,52,35),(47,36,40),(72,49,32),(39,69,35),(66,73,29)]
            for x,y,r in blobs:ellipse(d,(x-r//2,y-r//2,x+r//2+10,y+r//2+10),INK)
            for x,y,r in blobs:
                ellipse(d,(x-r//2+3,y-r//2+2,x+r//2+7,y+r//2+6),'#294d3e')
                ellipse(d,(x-r//2+5,y-r//2+3,x+r//2+2,y+r//2),'#3d6a4e')
            for n in range(52):
                x=rng.randint(9,85);y=rng.randint(20,88)
                if im.getpixel((x,y))[3] and im.getpixel((x,y))[:3] not in [(19,33,38)]:
                    rect(d,(x,y,x+rng.randint(2,5),y+1),rng.choice(['#567c53','#668a59','#345c45']))
    add(typ,im,(48,123))
for typ in ['rock','basalt','bush','flowers','mushroom','crystal','rune','pillar','campfire','lantern','well','bench','stall','forge','altar','chest','node_herb','node_wood','node_ore']:
    size=(96,80) if typ in ['stall','forge','altar'] else (48,80) if typ in ['pillar','lantern'] else (64,64)
    im,d=canvas(*size);w,h=size;cx=w//2;by=h-5;rng=random.Random(typ)
    if typ in ['rock','basalt','node_ore']:
        poly(d,[(8,by-4),(12,by-23),(29,by-34),(47,by-29),(56,by-9),(45,by),(21,by)],INK)
        poly(d,[(12,by-6),(16,by-22),(29,by-30),(44,by-26),(51,by-10),(43,by-4)],'#6d7a79' if typ!='basalt' else '#69545c')
        poly(d,[(17,by-23),(29,by-30),(42,by-25),(29,by-17)],'#9aa59a' if typ!='basalt' else '#9c7570')
        if typ=='node_ore':
            for x,y in [(22,40),(37,31),(44,46)]:poly(d,[(x,y),(x+4,y-9),(x+8,y-2),(x+3,y+4)],'#9db9d0')
    elif typ in ['bush','flowers','node_herb']:
        for n in range(10):
            x=rng.randint(15,47);y=rng.randint(32,52)
            d.line([(x,by),(x-3,y)],fill='#416c4b',width=2)
            ellipse(d,(x-8,y-3,x+5,y+4),rng.choice(['#4b7955','#6d925d','#315c44']))
            if typ!='bush':
                c=rng.choice(['#d4c389','#d9b5b7','#a6b6dd'])
                rect(d,(x-4,y-5,x,y-2),c);rect(d,(x-3,y-4,x-2,y-3),'#eee2a8')
    elif typ=='mushroom':
        for x,y,s in [(20,50,10),(37,45,13),(44,56,7)]:
            rect(d,(x-2,y,x+2,by),'#b9aca5')
            ellipse(d,(x-s,y-s//2,x+s,y+3),'#4e4b79')
            ellipse(d,(x-s+2,y-s//2,x+s-2,y),'#9c91b3')
            rect(d,(x-3,y-s//2,x,y-s//2+2),'#d3c3cf')
    elif typ=='crystal':
        for x,y in [(22,52),(37,55),(47,54)]:
            poly(d,[(x-7,y),(x-3,y-28),(x+4,y-35),(x+9,y-10),(x+3,y+4)],INK)
            poly(d,[(x-4,y-1),(x-1,y-26),(x+3,y-30),(x+5,y-9),(x+1,y+1)],'#ba766a')
            d.line([(x+2,y-27),(x+1,y-4)],fill='#edb68e',width=2)
    elif typ in ['pillar','rune']:
        top=17 if typ=='pillar' else 22
        poly(d,[(cx-14,by),(cx-12,top),(cx+6,top-9),(cx+16,top),(cx+13,by)],INK)
        rect(d,(cx-9,top,cx+10,by-3),'#75817e')
        rect(d,(cx-7,top+2,cx-4,by-4),'#a0aba0')
        if typ=='pillar':
            rect(d,(cx-17,top-6,cx+17,top+1),'#8c9692');rect(d,(cx-17,by-7,cx+17,by),'#556362')
        else:
            d.line([(cx+3,30),(cx-4,36),(cx+4,41),(cx-3,46)],fill='#b3dbbd',width=2)
    elif typ=='campfire':
        for pts in [[(17,56),(45,43)],[(17,43),(46,56)]]:
            d.line(pts,fill=INK,width=7);d.line(pts,fill='#9b7852',width=4)
        poly(d,[(19,47),(23,31),(30,36),(33,18),(43,35),(45,46),(33,52)],'#ab5f49')
        poly(d,[(24,46),(27,34),(33,39),(34,26),(40,39),(37,48)],'#e6a968')
        poly(d,[(29,45),(33,34),(36,44),(32,49)],'#f7dda0')
    elif typ=='lantern':
        rect(d,(cx-3,22,cx+2,by),'#665f57');rect(d,(cx-2,24,cx-1,by),'#ab9370')
        rect(d,(cx-11,14,cx+10,34),INK);rect(d,(cx-8,17,cx+7,30),'#b88450')
        rect(d,(cx-5,18,cx+4,28),'#edc88b');rect(d,(cx-1,17,cx+1,31),'#635244')
        poly(d,[(cx-13,15),(cx,6),(cx+12,15)],'#6b645f')
    elif typ=='well':
        ellipse(d,(10,30,55,59),INK);ellipse(d,(12,29,53,52),'#889080')
        ellipse(d,(18,32,48,44),'#293b3d')
        for y in [44,51]:d.line([(14,y),(51,y)],fill='#566568',width=2)
        rect(d,(12,17,16,40),'#806d50');rect(d,(49,17,53,40),'#806d50')
        poly(d,[(7,19),(31,3),(59,19),(53,24),(31,14),(12,24)],INK)
        poly(d,[(11,18),(31,7),(55,18),(51,20),(31,11),(14,21)],'#788478')
    elif typ=='bench':
        rect(d,(12,44,16,59),'#393d34');rect(d,(46,44,50,59),'#393d34')
        rect(d,(8,34,55,45),INK);rect(d,(10,35,53,42),'#a28d63')
        d.line([(12,39),(51,39)],fill='#6b654c')
    elif typ=='node_wood':
        for y in [42,50]:
            d.line([(12,y),(48,y-8)],fill=INK,width=11);d.line([(13,y),(47,y-8)],fill='#8d7858',width=7)
            ellipse(d,(7,y-5,17,y+5),'#c7a775');ellipse(d,(10,y-2,14,y+2),'#8e7758')
    elif typ=='chest':
        rect(d,(12,30,52,57),INK);rect(d,(15,33,49,54),'#8d704a')
        poly(d,[(12,31),(16,22),(47,22),(53,31)],INK);poly(d,[(16,29),(19,24),(45,24),(49,29)],'#b69b65')
        rect(d,(15,36,49,39),'#cbb57e');rect(d,(19,26,22,53),'#c6ae74');rect(d,(43,26,46,53),'#c6ae74')
        rect(d,(29,36,36,44),INK);rect(d,(31,37,34,42),'#dec894')
    elif typ=='altar':
        ellipse(d,(10,25,86,74),'#252f38');ellipse(d,(14,28,82,68),'#637574')
        ellipse(d,(24,31,72,61),'#3f5956');d.ellipse((28,34,68,58),outline='#97bdac',width=2)
        for a in range(0,360,60):
            x=cx+math.cos(math.radians(a))*23;y=47+math.sin(math.radians(a))*12
            rect(d,(x-2,y-2,x+2,y+2),'#c4d1b6')
    elif typ in ['stall','forge']:
        rect(d,(17,48,79,71),INK);rect(d,(20,50,76,68),'#806949')
        rect(d,(12,28,16,74),'#665642');rect(d,(80,28,84,74),'#665642')
        if typ=='stall':
            poly(d,[(8,34),(20,12),(77,12),(89,34),(86,42),(10,42)],INK)
            for i in range(6):
                x=12+i*12
                poly(d,[(x,32),(max(20,x+5),15),(min(77,x+15),15),(x+11,33),(x+11,39),(x,39)],'#9c6758' if i%2 else '#d4bd88')
            for x in [28,43,58]:ellipse(d,(x,43,x+10,50),'#a1b46a')
        else:
            rect(d,(17,22,43,58),'#69777b');rect(d,(22,29,38,52),INK)
            ellipse(d,(23,37,38,55),'#c77d4b');ellipse(d,(27,42,35,53),'#f0c88b')
            poly(d,[(49,46),(72,43),(82,49),(67,56),(56,55),(58,64),(47,64)],'#a1aba6')
            rect(d,(20,8,39,24),'#7d8680')
    add(typ,im,(cx,by))
# Cottages: original wooden facades, luminous windows, individual roof tiles.
for color in ['blue','red']:
    im,d=canvas(156,142)
    roof='#527578' if color=='blue' else '#926359'
    hi='#77928d' if color=='blue' else '#b6876f'
    rect(d,(20,61,135,130),INK);rect(d,(24,62,131,126),'#b3ad8d')
    rect(d,(25,94,131,125),'#897b60')
    for x in [24,56,98,129]:rect(d,(x,60,x+4,126),'#544e42')
    rect(d,(24,90,131,94),'#544e42')
    poly(d,[(7,70),(30,20),(124,20),(148,71),(135,79),(20,79)],INK)
    poly(d,[(12,69),(34,24),(120,24),(142,69),(132,74),(24,74)],roof)
    for y in range(30,73,9):
        inset=int((73-y)*.44)
        d.line([(14+inset,y),(142-inset,y)],fill=hi,width=2)
        for x in range(20+inset+(y%2)*6,140-inset,12):d.line([(x,y),(x-2,y+7)],fill='#384b4b' if color=='blue' else '#664b48',width=1)
    rect(d,(108,9,122,32),INK);rect(d,(110,10,120,29),'#84877c');rect(d,(107,7,123,12),'#b3ac94')
    rect(d,(69,95,91,127),INK);rect(d,(72,98,88,126),'#555044');rect(d,(84,111,86,113),'#e1c18a')
    for x in [34,105]:
        rect(d,(x-2,81,x+19,108),INK);rect(d,(x,83,x+17,105),'#c2935b');rect(d,(x+2,85,x+15,103),'#ead6a0')
        rect(d,(x+7,83,x+9,105),'#71654c');rect(d,(x,94,x+17,96),'#71654c')
    rect(d,(63,127,97,133),'#7f8273');rect(d,(60,133,100,138),'#666f65')
    for x in [32,109]:
        rect(d,(x-3,108,x+21,114),'#776a50')
        for xx in range(x,x+20,5):ellipse(d,(xx,106,xx+4,110),'#739069')
    add('house_'+color,im,(78,134))
# 24x24 interface/item symbols.
icons=['sword','bow','staff','armor','charm','potion','mana','herb','wood','ore','gel','pelt','shard','ember','heart','moon','dragon','slash','shield','leaf','orb','arrow','nova','bag','quest','map','party','settings','coin','boot']
for typ in icons:
    im,d=canvas(24,24);gold='#d2b57a';silver='#b3c9ca';green='#83b18a';violet='#b4a1df'
    if typ in ['sword','slash']:
        poly(d,[(7,17),(17,3),(21,2),(20,7),(10,19)],INK)
        d.line([(9,16),(19,4)],fill=silver,width=3);d.line([(5,14),(12,20)],fill=gold,width=3)
        d.line([(7,18),(3,22)],fill='#876453',width=3)
    elif typ in ['bow','arrow']:
        d.arc((3,2,20,22),260,100,fill=gold,width=3);d.line([(13,3),(14,21)],fill=silver)
        d.line([(3,12),(22,10)],fill=silver,width=2)
        poly(d,[(21,7),(23,10),(20,13)],silver)
    elif typ in ['staff','orb']:
        d.line([(6,22),(15,6)],fill=gold,width=3)
        poly(d,[(15,1),(21,6),(16,12),(11,7)],INK);poly(d,[(15,3),(19,6),(16,10),(13,7)],violet)
        rect(d,(15,4,16,6),'#edf2d9')
    elif typ=='armor':
        poly(d,[(7,3),(11,5),(15,3),(22,8),(18,14),(16,12),(17,22),(6,22),(7,12),(4,14),(1,9)],INK)
        poly(d,[(7,5),(11,7),(15,5),(19,9),(17,11),(15,9),(15,20),(8,20),(9,9),(6,11),(3,9)],'#7798a4')
        rect(d,(10,8,12,18),silver);rect(d,(7,17,16,19),gold)
    elif typ in ['potion','mana']:
        rect(d,(9,2,15,6),gold);rect(d,(9,6,15,10),silver)
        ellipse(d,(4,8,20,23),INK);ellipse(d,(6,10,18,21),'#ae5b64' if typ=='potion' else '#5789ae')
        rect(d,(8,12,10,16),'#e3b7b0' if typ=='potion' else '#b4d9e6')
    elif typ in ['herb','leaf']:
        d.line([(5,23),(16,3)],fill=gold,width=2)
        for x,y in [(8,13),(13,6),(13,17)]:ellipse(d,(x-5,y-2,x+5,y+3),green)
        d.line([(6,17),(17,6)],fill='#c2d4a2')
    elif typ=='wood':
        for y in [10,18]:
            d.line([(4,y),(20,y-4)],fill='#9f8157',width=6);ellipse(d,(1,y-3,7,y+3),gold)
    elif typ in ['ore','shard','ember','heart','moon','dragon','charm','gel']:
        col={'ore':silver,'shard':'#99c9da','ember':'#df9b73','heart':'#96c99e','moon':violet,'dragon':gold,'charm':gold,'gel':'#80b9a8'}[typ]
        poly(d,[(5,16),(7,6),(13,2),(20,9),(18,18),(10,22)],INK)
        poly(d,[(7,15),(9,7),(13,5),(18,10),(16,17),(11,19)],col)
        d.line([(13,5),(12,17)],fill='#e2dfc3',width=2)
        if typ=='charm':d.arc((4,0,20,17),0,180,fill=gold,width=2)
    elif typ=='pelt':
        poly(d,[(6,2),(12,5),(18,2),(21,8),(17,12),(20,20),(12,23),(4,20),(7,12),(2,8)],'#927b66')
        d.line([(12,7),(12,19)],fill=gold,width=2)
    elif typ=='shield':
        poly(d,[(3,4),(12,1),(22,4),(21,14),(12,23),(4,15)],INK)
        poly(d,[(5,6),(12,3),(20,6),(18,14),(12,20),(6,14)],'#7598a4')
        d.line([(12,5),(12,17)],fill=gold,width=2);d.line([(7,10),(17,10)],fill=gold,width=2)
    elif typ=='nova':
        poly(d,[(12,0),(15,8),(23,5),(18,12),(24,17),(15,16),(12,24),(9,16),(0,19),(6,12),(1,5),(9,8)],violet)
        ellipse(d,(8,8,16,16),'#f0d5a0')
    elif typ=='coin':
        ellipse(d,(2,2,22,22),INK);ellipse(d,(4,3,20,21),gold);d.ellipse((7,6,17,18),outline='#f0dba1',width=2)
    elif typ=='boot':
        poly(d,[(7,2),(17,2),(16,14),(23,17),(22,22),(3,22),(4,16)],'#aaa58d')
    else:
        rect(d,(4,5,20,21),INK);rect(d,(6,7,18,19),gold)
        if typ=='bag':d.arc((8,1,16,11),180,360,fill=gold,width=2)
        elif typ=='quest':
            for y in [10,13,16]:rect(d,(9,y,16,y),'#6c644e')
        elif typ=='map':
            d.line([(9,7),(9,19),(14,7),(14,19)],fill='#8d8060')
        elif typ=='party':
            ellipse(d,(9,2,15,8),silver)
        else:ellipse(d,(9,10,15,16),'#4c655e')
    add('icon_'+typ,im,(12,12))
# Pack into one atlas; 2px gutter prevents texture bleeding.
x=y=rowH=0;W=1024;entries={}
atlas=Image.new('RGBA',(W,2048))
for name,(im,anchor) in sprites.items():
    if x+im.width+4>W:x=0;y+=rowH+4;rowH=0
    if y+im.height+4>atlas.height:
        larger=Image.new('RGBA',(W,atlas.height+1024));larger.paste(atlas,(0,0));atlas=larger
    atlas.paste(im,(x+2,y+2));entries[name]={'x':x+2,'y':y+2,'w':im.width,'h':im.height,'ax':anchor[0],'ay':anchor[1]}
    x+=im.width+4;rowH=max(rowH,im.height)
atlas=atlas.crop((0,0,W,y+rowH+4))
atlas.save(OUT/'atlas.png',optimize=True)
(OUT/'atlas.json').write_text(json.dumps(entries,separators=(',',':')))
# Separate hero portraits and icons for DOM/CSS UI.
for name,(im,_) in sprites.items():
    if name.startswith('icon_') or name in ['guardian_s_0','ranger_s_0','mage_s_0','lia_s_0','merchant_s_0','smith_s_0','healer_s_0']:
        im.save(OUT/(name+'.png'),optimize=True)
# Original title landscape, rendered on a small pixel grid.
W,H=640,360;im=Image.new('RGB',(W,H));d=ImageDraw.Draw(im)
for y in range(H):
    t=y/H;d.line([(0,y),(W,y)],fill=(int(13+13*t),int(24+25*t),int(39+15*t)))
rng=random.Random(77)
for _ in range(120):
    x=rng.randrange(W);y=rng.randrange(230);col=rng.choice(['#607f83','#91a9a1','#b7bd9c'])
    d.rectangle((x,y,x+1,y+1),fill=col)
# Moon and layered mountains.
ellipse(d,(430,34,507,111),'#a5b3a4');ellipse(d,(442,31,511,98),'#263f4a')
for pts,col in [
([(0,226),(92,119),(167,193),(268,89),(368,180),(470,112),(640,208),(640,360),(0,360)],'#273e49'),
([(0,244),(71,177),(145,222),(229,156),(326,221),(416,168),(509,221),(598,173),(640,225),(640,360),(0,360)],'#2b4c50'),
([(0,274),(121,229),(223,268),(336,220),(453,271),(570,233),(640,274),(640,360),(0,360)],'#223f43')]:
    poly(d,pts,col)
# Distant ruined tower.
rect(d,(362,157,381,232),'#243b45');poly(d,[(359,159),(366,142),(379,143),(384,160)],'#243b45')
rect(d,(368,168,372,176),'#baaa78')
for x in range(0,640,14):
    yy=250+int(math.sin(x*.07)*12);ht=rng.randrange(25,60)
    poly(d,[(x,yy-ht),(x-15,yy),(x+16,yy)],'#1b383c')
# Foreground cliff and glowing arch.
poly(d,[(370,291),(403,267),(463,256),(515,265),(558,282),(640,289),(640,360),(352,360)],'#172b30')
poly(d,[(399,283),(437,268),(492,271),(527,284),(515,292),(414,297)],'#445d57')
for y in range(294,350,11):d.line([(400,y),(483,y+3)],fill='#344b49',width=3)
for x in [425,478]:
    rect(d,(x,197,x+13,282),'#283f43');rect(d,(x+3,199,x+10,277),'#6b8175')
    for yy in range(210,278,14):d.line([(x,yy),(x+13,yy)],fill='#304c4b',width=2)
poly(d,[(424,200),(428,181),(444,169),(470,171),(490,188),(491,202),(478,202),(477,192),(465,182),(447,181),(438,192),(438,201)],'#7d9180')
ellipse(d,(441,194,478,277),'#24494c');ellipse(d,(447,201,474,272),'#477575');ellipse(d,(453,209,469,266),'#77a9a0')
for _ in range(35):
    x=rng.randrange(413,505);y=rng.randrange(178,287)
    rect(d,(x,y,x+1,y+1),'#b6c7a0')
# Near trees frame the shot.
for x,hh in [(5,186),(34,146),(586,176),(626,218)]:
    rect(d,(x-4,H-hh,x+4,H),'#10262b')
    for j in range(4):
        yy=H-hh+j*hh//5;ww=17+j*9
        poly(d,[(x,yy-23),(x-ww,yy+48),(x+ww,yy+48)],'#112b2e')
# Campfire on the left foreground.
ellipse(d,(102,323,170,341),'#223739')
poly(d,[(122,331),(128,312),(133,318),(137,298),(145,317),(150,329),(139,335)],'#c99059')
poly(d,[(130,330),(137,311),(143,326),(138,333)],'#f1d59a')
for _ in range(20):
    x=rng.randrange(109,164);y=rng.randrange(270,327);rect(d,(x,y,x,y),'#bd9765')
im.resize((1280,720),Image.Resampling.NEAREST).save(OUT/'title.png',optimize=True)
# Favicon without fonts.
im,d=canvas(32,32);ellipse(d,(1,1,30,30),'#203a40')
poly(d,[(16,3),(20,12),(29,16),(20,20),(16,29),(12,20),(3,16),(12,12)],'#c9b580')
poly(d,[(16,9),(19,16),(16,23),(13,16)],'#edf0cb')
im.save(OUT/'favicon.png')
print(f'Generated {len(sprites)} original sprites, atlas {atlas.width}x{atlas.height}.')
