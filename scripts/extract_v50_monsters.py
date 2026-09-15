from __future__ import annotations
from PIL import Image, ImageDraw
from pathlib import Path
import numpy as np, cv2, json, math, shutil

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets' / 'source_sheets_v50'
OUT = ROOT / 'assets' / 'enemies'
SRC.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

SHEETS = {
    'sheet1': SRC / 'v50_sheet_001_050.png',
    'sheet2': SRC / 'v50_sheet_051_140.png',
    'sheet3': SRC / 'v50_sheet_141_200.png',
    'bosses': SRC / 'v50_boss_source.png',
}

def _bg_remove(crop: Image.Image) -> Image.Image:
    arr = np.array(crop.convert('RGB')).astype(np.int16)
    h, w, _ = arr.shape
    # robust background reference from border pixels that are bright and not saturated
    border = np.concatenate([arr[0:4].reshape(-1,3), arr[-4:].reshape(-1,3), arr[:,0:4].reshape(-1,3), arr[:,-4:].reshape(-1,3)], axis=0)
    hsvb = cv2.cvtColor(border.reshape(-1,1,3).astype(np.uint8), cv2.COLOR_RGB2HSV).reshape(-1,3)
    good = (hsvb[:,1] < 70) & (hsvb[:,2] > 150)
    ref = np.median(border[good], axis=0) if np.any(good) else np.median(border, axis=0)

    diff = np.linalg.norm(arr - ref[None,None,:], axis=2)
    hsv = cv2.cvtColor(arr.astype(np.uint8), cv2.COLOR_RGB2HSV)
    # Background-like can include faint horizontal scanlines / tinted panel fill.
    bg_like = ((diff < 62) & (hsv[:,:,2] > 150) & (hsv[:,:,1] < 95)) | ((hsv[:,:,2] > 235) & (hsv[:,:,1] < 28))

    # Flood only from the border, so white parts enclosed by outlines survive.
    ff = np.zeros((h+2,w+2), np.uint8)
    passable = (bg_like.astype(np.uint8) * 255)
    # seed every passable edge region
    work = passable.copy()
    outside = np.zeros((h,w), np.uint8)
    for x in range(w):
        for y in (0,h-1):
            if work[y,x] and not outside[y,x]:
                mask=np.zeros((h+2,w+2),np.uint8); tmp=work.copy(); cv2.floodFill(tmp,mask,(x,y),128,loDiff=0,upDiff=0,flags=4)
                outside[tmp==128]=1
    for y in range(h):
        for x in (0,w-1):
            if work[y,x] and not outside[y,x]:
                mask=np.zeros((h+2,w+2),np.uint8); tmp=work.copy(); cv2.floodFill(tmp,mask,(x,y),128,loDiff=0,upDiff=0,flags=4)
                outside[tmp==128]=1
    fg = (1-outside).astype(np.uint8)

    # Remove card/grid artifacts first, then retain the creature and nearby effect particles.
    n, lab, stats, cents = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        viable=[]
        ui=set()
        for i in range(1,n):
            x,y,ww,hh,a = stats[i]
            cx,cy = cents[i]
            touches_edge = x <= 1 or y <= 1 or x+ww >= w-1 or y+hh >= h-1
            horizontal_bar = ww > .48*w and hh < .22*h
            vertical_rule = hh > .42*h and ww < .10*w
            lower_label = y > .68*h and ww > .30*w and hh < .30*h
            upper_rule = y < .10*h and ww > .12*w and hh < .18*h
            edge_fragment = touches_edge and ((ww > .20*w and hh < .34*h) or (hh > .30*h and ww < .22*w))
            if horizontal_bar or vertical_rule or lower_label or upper_rule or edge_fragment:
                ui.add(i); continue
            if a >= 18 and .12*w <= cx <= .88*w and .04*h <= cy <= .94*h:
                # Target sprite is centered in its slot. Neighbor bleed sits near the edges.
                dx=abs(cx-w*.5)/(w*.5)
                dy=abs(cy-h*.52)/(h*.52)
                compact=1.0/(1.0+3.8*dx*dx+0.6*dy*dy)
                score=a*compact
                viable.append((score,i))
        if viable:
            main=max(viable)[1]
        else:
            cand=[i for i in range(1,n) if i not in ui]
            main=max(cand,key=lambda i:stats[i,cv2.CC_STAT_AREA]) if cand else 1
        mx,my,mw,mh,ma = stats[main]
        keep = np.zeros_like(fg)
        for i in range(1,n):
            if i in ui: continue
            x,y,ww,hh,a = stats[i]
            cx,cy = cents[i]
            touches_edge = x <= 1 or y <= 1 or x+ww >= w-1 or y+hh >= h-1
            dx = max(mx-(x+ww), x-(mx+mw), 0)
            dy = max(my-(y+hh), y-(my+mh), 0)
            near_main = math.hypot(dx,dy) <= 24
            central = .08*w <= cx <= .92*w and .02*h <= cy <= .95*h
            edge_ok = (not touches_edge) or (a >= 260 and .20*w <= cx <= .80*w)
            if i == main or (a >= 7 and near_main and central and edge_ok):
                keep[lab==i]=1
        fg = keep

    # Slightly restore antialiased outline pixels adjacent to kept foreground.
    dil = cv2.dilate(fg, np.ones((3,3),np.uint8), iterations=1)
    edge_restore = (dil==1) & (fg==0) & (diff>40)
    fg[edge_restore]=1

    alpha = (fg*255).astype(np.uint8)
    rgba = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(rgba, 'RGBA')



def _erase_card_id(crop: Image.Image) -> Image.Image:
    arr=np.array(crop.convert('RGB'))
    h,w,_=arr.shape
    # Card number lives in the upper-left margin and never overlaps the generated creature body.
    sample=arr[min(h-1,18):min(h,36), max(0,w-24):w]
    fill=np.median(sample.reshape(-1,3),axis=0).astype(np.uint8) if sample.size else np.array([235,240,220],dtype=np.uint8)
    arr[0:min(24,h), 0:min(42,w)] = fill
    return Image.fromarray(arr,'RGB')

def _strip_top_band(crop: Image.Image) -> Image.Image:
    """Remove a generated category-header band connected to the top edge without erasing a sprite overlapping it."""
    arr=np.array(crop.convert('RGB')).astype(np.int16)
    h,w,_=arr.shape
    top=arr[:3].reshape(-1,3)
    ref=np.median(top,axis=0)
    diff=np.linalg.norm(arr-ref[None,None,:],axis=2)
    candidate=(diff<48).astype(np.uint8)*255
    # flood from top edge only
    keep_bg=np.zeros((h,w),np.uint8)
    for x in range(w):
        if candidate[0,x] and not keep_bg[0,x]:
            mask=np.zeros((h+2,w+2),np.uint8); tmp=candidate.copy()
            cv2.floodFill(tmp,mask,(x,0),128,loDiff=0,upDiff=0,flags=4)
            keep_bg[tmp==128]=1
    # replace band with pale local art background sampled near lower corners
    samples=np.concatenate([arr[max(0,h-8):h,0:min(12,w)].reshape(-1,3),arr[max(0,h-8):h,max(0,w-12):w].reshape(-1,3)],axis=0)
    hsvs=cv2.cvtColor(samples.reshape(-1,1,3).astype(np.uint8),cv2.COLOR_RGB2HSV).reshape(-1,3)
    good=(hsvs[:,1]<80)&(hsvs[:,2]>150)
    fill=np.median(samples[good],axis=0) if np.any(good) else np.array([235,240,220])
    arr[keep_bg==1]=fill.astype(np.int16)
    return Image.fromarray(arr.astype(np.uint8),'RGB')

def _normalize(crop: Image.Image, boss=False) -> Image.Image:
    img = _bg_remove(crop)
    a = np.array(img.getchannel('A'))
    ys,xs = np.where(a>0)
    if len(xs)==0:
        return Image.new('RGBA',(256,256),(0,0,0,0))
    l,r,t,b = xs.min(), xs.max()+1, ys.min(), ys.max()+1
    pad=3
    l=max(0,l-pad);r=min(img.width,r+pad);t=max(0,t-pad);b=min(img.height,b+pad)
    img=img.crop((l,t,r,b))
    maxw,maxh=(232,220) if boss else (218,206)
    scale=min(maxw/img.width,maxh/img.height)
    nw=max(1,int(round(img.width*scale)));nh=max(1,int(round(img.height*scale)))
    img=img.resize((nw,nh),Image.Resampling.NEAREST)
    canvas=Image.new('RGBA',(256,256),(0,0,0,0))
    x=(256-nw)//2
    y=(242-nh)  # consistent feet baseline with a little room beneath
    y=max(4,min(y,256-nh-4))
    canvas.alpha_composite(img,(x,y))
    return canvas

def extract_sheet1(path: Path, start_id=1):
    im=Image.open(path).convert('RGB')
    x0,x1=7,1529; cw=(x1-x0)/10
    # Hand-measured art bands. They deliberately stop above the generated name/type badges.
    row_art=[(63,196),(264,401),(472,600),(666,781),(841,933)]
    out=[]
    for r,(T0,B0) in enumerate(row_art):
        for c in range(10):
            idx=start_id+r*10+c
            L=int(x0+c*cw)+4; R=int(x0+(c+1)*cw)-4; T=T0+2; B=B0+1
            sprite=_normalize(_erase_card_id(im.crop((L,T,R,B))))
            dest=OUT/f'e{idx:03d}.png'; sprite.save(dest,optimize=True);out.append(dest)
    return out

def extract_sheet2(path: Path, start_id=51):
    # 3 columns x 6 category rows; each category has five monsters.
    im=Image.open(path).convert('RGB')
    x_edges=[4,435,868,1308]; y_edges=[94,274,456,638,820,1002,1198]
    idx=start_id; out=[]
    for pr in range(6):
        for pc in range(3):
            x0,x1=x_edges[pc],x_edges[pc+1]; y0,y1=y_edges[pr],y_edges[pr+1]; pw=(x1-x0)/5
            for j in range(5):
                L=max(x0,int(x0+j*pw)-9);R=min(x1,int(x0+(j+1)*pw)+9);T=y0+43;B=min(y0+154,y1-20)
                sprite=_normalize(im.crop((L,T,R,B)))
                dest=OUT/f'e{idx:03d}.png';sprite.save(dest,optimize=True);out.append(dest);idx+=1
    return out

def extract_sheet3(path: Path, start_id=141):
    # 2 columns x 6 category rows; each category has five monsters.
    im=Image.open(path).convert('RGB')
    x_edges=[5,654,1308]; y_edges=[93,278,468,658,847,1027,1197]
    idx=start_id;out=[]
    for pr in range(6):
        for pc in range(2):
            x0,x1=x_edges[pc],x_edges[pc+1]; y0,y1=y_edges[pr],y_edges[pr+1]; pw=(x1-x0)/5
            for j in range(5):
                L=max(x0,int(x0+j*pw)-6);R=min(x1,int(x0+(j+1)*pw)+6);T=y0+50;B=min(y0+156,y1-18)
                sprite=_normalize(im.crop((L,T,R,B)))
                dest=OUT/f'e{idx:03d}.png';sprite.save(dest,optimize=True);out.append(dest);idx+=1
    # Two tall designs deliberately overlap the source category header; recover their full silhouettes.
    for eid,pr,pc,j in [(175,3,0,4),(185,4,0,4)]:
        x0,x1=x_edges[pc],x_edges[pc+1]; y0,y1=y_edges[pr],y_edges[pr+1]; pw=(x1-x0)/5
        L=max(x0,int(x0+j*pw)-6);R=min(x1,int(x0+(j+1)*pw)+6);T=y0+30;B=min(y0+156,y1-18)
        raw=_strip_top_band(im.crop((L,T,R,B)))
        sprite=_normalize(raw)
        sprite.save(OUT/f'e{eid:03d}.png',optimize=True)
    return out

def extract_bosses(path: Path):
    # Reserve the last five cells (46-50) from a 10x5 sheet as unique bosses.
    im=Image.open(path).convert('RGB'); x0,x1=3,1533; y0,y1=73,997; cw=(x1-x0)/10; ch=(y1-y0)/5
    cells=[50,49,47,46,48]; out=[]
    for bi,cell in enumerate(cells,1):
        i=cell-1;r=i//10;c=i%10
        L=int(x0+c*cw)+3;R=int(x0+(c+1)*cw)-3
        # Final source row: artwork itself sits at y≈898..970, below the generated name label.
        T,B=898,970
        sprite=_normalize(im.crop((L,T,R,B)),boss=True).resize((384,384),Image.Resampling.NEAREST)
        dest=OUT/f'b{bi:03d}.png';sprite.save(dest,optimize=True);out.append(dest)
    return out

def montage(paths, outpath, cols=10, title=''):
    tiles=[]
    for p in paths:
        im=Image.open(p).convert('RGBA')
        tile=Image.new('RGBA',(270,300),(231,239,206,255)); tile.alpha_composite(im,(7,7))
        d=ImageDraw.Draw(tile); d.text((8,270),p.stem,fill=(22,28,37,255))
        tiles.append(tile)
    rows=math.ceil(len(tiles)/cols)
    m=Image.new('RGBA',(270*cols,300*rows),(32,38,53,255))
    for i,t in enumerate(tiles):m.alpha_composite(t,((i%cols)*270,(i//cols)*300))
    m.save(outpath,optimize=True)

if __name__=='__main__':
    missing=[str(p) for p in SHEETS.values() if not p.exists()]
    if missing: raise SystemExit('Missing source sheets: '+', '.join(missing))
    paths=[]
    paths += extract_sheet1(SHEETS['sheet1'])
    paths += extract_sheet2(SHEETS['sheet2'])
    paths += extract_sheet3(SHEETS['sheet3'])
    bosses=extract_bosses(SHEETS['bosses'])
    montage(paths[:50],ROOT/'V50_MONSTER_PREVIEW_001_050.png',10)
    montage(paths[50:100],ROOT/'V50_MONSTER_PREVIEW_051_100.png',10)
    montage(paths[100:150],ROOT/'V50_MONSTER_PREVIEW_101_150.png',10)
    montage(paths[150:200],ROOT/'V50_MONSTER_PREVIEW_151_200.png',10)
    montage(bosses,ROOT/'V50_BOSS_PREVIEW.png',5)
    print(f'extracted {len(paths)} regular monsters and {len(bosses)} bosses')
