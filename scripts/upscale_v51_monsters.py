#!/usr/bin/env python3
"""RIFT DECK v5.1 high-DPI monster asset pass.

Upscales battle monster PNGs to 2x source resolution so 256 CSS-pixel
sprites remain sharp on 2x/3x phone and desktop displays. This does not
change species silhouettes or catalog paths, so saves remain compatible.
Idempotent: files already at target size are left untouched.
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DIRS = [ROOT / 'assets' / 'enemies', ROOT / 'assets' / 'monsters' / 'forms']

def target_size(path: Path, im: Image.Image):
    # v50 bases/forms are 256; bosses are 384. v51 targets are 512/768.
    w, h = im.size
    boss = path.name.startswith('b')
    target = 768 if boss else 512
    if max(w, h) >= target:
        return None
    # V50 sources are 384 for bosses and 256 for normal monsters/forms.
    return (target, target)

def upscale(path: Path):
    im = Image.open(path).convert('RGBA')
    size = target_size(path, im)
    if not size:
        return False
    alpha = im.getchannel('A').resize(size, Image.Resampling.LANCZOS)
    rgb = im.convert('RGB').resize(size, Image.Resampling.LANCZOS)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.75, percent=115, threshold=2))
    out = Image.merge('RGBA', (*rgb.split(), alpha))
    out.save(path, 'PNG', optimize=True, compress_level=9)
    return True

def main():
    changed = 0
    total = 0
    for folder in DIRS:
        for path in sorted(folder.glob('*.png')):
            total += 1
            if upscale(path):
                changed += 1
    print(f'V51_HIDPI_ASSETS total={total} upscaled={changed}')

if __name__ == '__main__':
    main()
