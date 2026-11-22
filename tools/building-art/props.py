"""Cuts a Codex prop sheet (props.txt: objects on magenta, a scale wizard leftmost) into the game's prop assets.
No generation calls.

  python tools/building-art/props.py <sheet.png> <id1> <id2> ... [--wizard 36 | --height px] [--prefix codex-] [--wizard-left] [--grow 6]

Objects are found as separate blobs on the magenta, ordered top row first and left to right within a row (rows are
blobs whose middles are close in height). The first blob (top row, leftmost) is the scale wizard: the sheet is scaled so it is --wizard art
px tall (the game's wizard with his hat), and every other blob is cut, keyed (magenta and its fringe made clear),
scaled by the same factor and written as game/content/assets/props/<prefix><id>/lean.png with a meta.json: its foot
at the middle of its bottom edge, its footprint from its width. Give one id per object after the wizard, in the
sheet's order; '-' skips an object.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

PROPS = os.path.join(os.path.dirname(__file__), '../../game/content/assets/props')

def key(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    magenta = (r > 180) & (b > 180) & (g < 110)
    fringe = (np.minimum(r, b) - g > 70) & (r > 120) & (b > 120)
    return ~(magenta | fringe)

def main():
    args = [a for a in sys.argv[1:]]
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    flags = {'--wizard', '--prefix', '--keep-raw', '--grow', '--height'}
    args = [a for a in args if a != '--wizard-left'] + (['--wizard-left'] if '--wizard-left' in args else [])
    pos, i = [], 0
    while i < len(args):
        if args[i] in flags: i += 2; continue
        if args[i] == '--wizard-left': i += 1; continue
        pos.append(args[i]); i += 1
    sheet_path, ids = pos[0], pos[1:]
    wiz_px, prefix = float(opt('--wizard', '36')), opt('--prefix', 'codex-')
    img = Image.open(sheet_path).convert('RGB'); a = np.asarray(img)
    solid = key(a)
    grown = ndimage.binary_dilation(solid, iterations=int(opt("--grow", "6")))
    labels, n = ndimage.label(grown)
    blobs = [s for s in ndimage.find_objects(labels) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 900]
    # rows: sort by middle height, group where the gap is big, then left to right
    blobs.sort(key=lambda s: (s[0].start + s[0].stop) / 2)
    rows, cur = [], [blobs[0]]
    for s in blobs[1:]:
        if (s[0].start + s[0].stop) / 2 - (cur[-1][0].start + cur[-1][0].stop) / 2 > 110: rows.append(cur); cur = [s]
        else: cur.append(s)
    rows.append(cur)
    order = [s for r in rows for s in sorted(r, key=lambda s: s[1].start)]
    if '--height' in args:
        # no scale figure: one object, scaled to this height in art px
        k = float(opt('--height', '0')) / max(s[0].stop - s[0].start for s in order)
        print(f'{len(order)} objects; scale {k:.3f} (--height)')
    else:
        # the scale wizard: the top row's first, or with --wizard-left the leftmost object (when it stands lower than its row)
        wizard = min(order, key=lambda s: s[1].start) if '--wizard-left' in args else order[0]
        order.remove(wizard)
        k = wiz_px / (wizard[0].stop - wizard[0].start)
        print(f'{len(order)} objects; scale {k:.3f} (wizard {wizard[0].stop - wizard[0].start} px)')
    if len(ids) != len(order):
        print('ids given:', len(ids), 'objects found:', len(order), '(give one id per object, - to skip)')
    for sl, pid in zip(order, ids):
        if pid == '-': continue
        crop = a[sl]
        alpha = (key(crop) * 255).astype(np.uint8)
        # keep only this object's own pixels (a neighbour's edge can fall inside the box)
        ls = labels[sl]
        own = ls == np.bincount(ls[ls > 0]).argmax()
        rgba = np.dstack([crop, alpha * own])
        im = Image.fromarray(rgba, 'RGBA')
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        im = im.resize((w, h), Image.LANCZOS)
        al = np.asarray(im)[..., 3]
        im.putalpha(Image.fromarray(np.where(al >= 140, 255, 0).astype(np.uint8)))
        bb = im.getbbox()
        if not bb: continue
        im = im.crop(bb)
        name = prefix + pid
        d = os.path.join(PROPS, name); os.makedirs(d, exist_ok=True)
        im.save(os.path.join(d, 'lean.png'), optimize=True)
        fw = round(max(0.3, im.width / 22), 2)
        meta = {'id': name, 'kind': 'prop', 'name': pid.replace('-', ' ').capitalize(), 'footprint': [fw, round(max(0.3, fw / 2), 2)],
                'sets': {'lean': {'file': 'lean.png', 'foot': [im.width // 2, im.height - 2], 'source': 'codex',
                                  'raw': os.path.relpath(sheet_path).replace('\\', '/'), 'tool': 'tools/building-art/props.py',
                                  'status': 'Rough-stage art from Codex (2026-11-22): replace with finished art later.'}}}
        json.dump(meta, open(os.path.join(d, 'meta.json'), 'w'), indent=2)
        print(name, im.size, 'footprint', meta['footprint'])

if __name__ == '__main__':
    main()
