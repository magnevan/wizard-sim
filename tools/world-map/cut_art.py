"""Cut a generated image out of its plain white background and save it to art/ for the map.

  python tools/world-map/cut_art.py <source.png> <name> [--grey-bg]

--grey-bg also removes pale grey connected to the background (a halo); don't use it on anything
with pale smoke or steam at its edge, which it would eat.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

MAX_SIDE = 512


def cut(path, floor):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    lab, _ = ndi.label(a.min(axis=2) > floor)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    mask = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out.crop(mask.point(lambda v: 255 if v > 12 else 0).getbbox())


def main():
    src, name = sys.argv[1], sys.argv[2]
    c = cut(src, 165 if '--grey-bg' in sys.argv else 225)
    c.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    dest = Path(__file__).parent / 'art' / f'{name}.png'
    dest.parent.mkdir(exist_ok=True)
    c.save(dest, optimize=True)
    print(dest.name, c.size, dest.stat().st_size // 1024, 'KB')


main()
