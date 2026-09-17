#!/usr/bin/env python3
"""FUSEWILD v7.2 sprite alpha repair + deterministic 2x master export.
Fills only tiny fully-enclosed transparent holes (likely bad cutout artifacts), then
exports 2x nearest-neighbour PNGs so browser scaling does not magnify broken edges.
Intentional large holes/open silhouettes are preserved.
"""
from pathlib import Path
from PIL import Image
import numpy as np
try:
    from scipy.ndimage import label
except Exception:
    label = None

ROOT=Path(__file__).resolve().parents[1]
FOLDERS=[ROOT/'assets'/'enemies',ROOT/'assets'/'items',ROOT/'assets'/'relics']
MAX_HOLE=28
SCALE=2

def repair(path:Path):
    im=Image.open(path).convert('RGBA')
    arr=np.array(im)
    alpha=arr[:,:,3]
    repaired=0
    if label is not None:
        transparent=alpha < 20
        labs,n=label(transparent)
        h,w=alpha.shape
        for i in range(1,n+1):
            ys,xs=np.where(labs==i)
            if not len(xs) or len(xs)>MAX_HOLE: continue
            if xs.min()==0 or ys.min()==0 or xs.max()==w-1 or ys.max()==h-1: continue
            # Only fill holes surrounded by mostly opaque pixels.
            x0=max(0,xs.min()-1); x1=min(w,xs.max()+2); y0=max(0,ys.min()-1); y1=min(h,ys.max()+2)
            ring=alpha[y0:y1,x0:x1]
            if (ring>120).mean()<0.55: continue
            for y,x in zip(ys,xs):
                neigh=arr[max(0,y-2):min(h,y+3),max(0,x-2):min(w,x+3)]
                opaque=neigh[neigh[:,:,3]>120]
                if len(opaque):
                    arr[y,x,:3]=np.median(opaque[:,:3],axis=0).astype(np.uint8)
                    arr[y,x,3]=int(np.median(opaque[:,3]))
                    repaired+=1
    out=Image.fromarray(arr,'RGBA')
    if max(out.size)<768:
        out=out.resize((out.width*SCALE,out.height*SCALE),Image.Resampling.NEAREST)
    out.save(path,optimize=True)
    return repaired,im.size,out.size

def main():
    total=holes=0
    for folder in FOLDERS:
        if not folder.exists(): continue
        for p in sorted(folder.glob('*.png')):
            fixed,old,new=repair(p);total+=1;holes+=fixed
    print(f'V72_ASSET_REPAIR_OK files={total} repairedPixels={holes} scale={SCALE}x')
if __name__=='__main__': main()
