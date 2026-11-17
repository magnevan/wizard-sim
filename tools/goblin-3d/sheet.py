"""Comparison images on dirt, 4x, feet aligned. No generation calls.

  python tools/goblin-3d/sheet.py still <out.png> <label>=<dir> ...        one row per source: 8 directions standing
  python tools/goblin-3d/sheet.py gif <out.gif> <move> <label>=<dir> ...   one row per source: the move in 4 directions

A source dir is pixelize.py output (<move>/<direction>/fNN.png) or a PixelLab character dir (rotations/, animations/).
"""
import glob, os, random, sys
from PIL import Image, ImageDraw

DIRS8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
DIRS4 = ['south', 'south-west', 'east', 'north']
PL_MOVE = {'walk': 'walk', 'attack': 'attack'}
Z = 4


def frames(src, move, d):
    if os.path.isdir(os.path.join(src, 'Idle', 'rotations')):   # a PixelLab character
        if move == 'idle':
            return [Image.open(os.path.join(src, 'Idle', 'rotations', d + '.png')).convert('RGBA')]
        p = os.path.join(src, 'Idle', 'animations', PL_MOVE.get(move, move), d)
        if not os.path.isdir(p): return []
        return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(p + '/*.png'))]
    return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(os.path.join(src, move, d, 'f*.png')))]


def dirt(w, h, seed=1):
    g = Image.new('RGBA', (w, h), (112, 86, 60, 255)); r = random.Random(seed); gp = g.load()
    for _ in range(w * h // 14):
        x, y = r.randrange(w), r.randrange(h); gp[x, y] = (96, 74, 52, 255) if r.random() < 0.6 else (134, 106, 76, 255)
    return g


def feet(im):
    b = im.getbbox()
    return b[3] if b else im.height


CW, CH, LAB = 48, 50, 0


def row_img(cells):
    """cells: list of images; each is placed with its sprite bottom on the baseline, centred by its canvas."""
    g = dirt(CW * len(cells), CH)
    for i, im in enumerate(cells):
        if im is None: continue
        g.alpha_composite(im, (i * CW + (CW - im.width) // 2, CH - 3 - feet(im)))
    return g


def label(img, text):
    big = img.resize((img.width * Z, img.height * Z), Image.NEAREST)
    out = Image.new('RGBA', (big.width, big.height + 22), (30, 24, 20, 255))
    out.alpha_composite(big, (0, 22))
    ImageDraw.Draw(out).text((6, 5), text, fill=(240, 230, 210, 255))
    return out


def stack(imgs):
    w = max(i.width for i in imgs)
    s = Image.new('RGBA', (w, sum(i.height for i in imgs)), (30, 24, 20, 255))
    y = 0
    for i in imgs: s.alpha_composite(i, (0, y)); y += i.height
    return s


mode, out = sys.argv[1], sys.argv[2]
if mode == 'still':
    rows = []
    for a in sys.argv[3:]:
        lab, src = a.split('=', 1)
        cells = []
        for d in DIRS8:
            f = frames(src, 'idle', d)
            cells.append(f[0] if f else None)
        rows.append(label(row_img(cells), lab + '   (' + ', '.join(DIRS8) + ')'))
    stack(rows).save(out)
else:
    # a source may name its own move and frame time, <label>=<dir>@<move>#<ms> (Meshy's 12 fps clips beside our code
    # moves); rows with different frame times are put on a common 28 ms tick, each looping at its own speed
    move = sys.argv[3]
    base = 110 if move != 'run' else 80
    srcs = []
    for a in sys.argv[4:]:
        lab, src = a.split('=', 1)
        src, _, ms = src.partition('#')
        src, _, mv = src.partition('@')
        srcs.append((lab, src, mv or move, int(ms) if ms else base))
    seqs = [[frames(s, mv, d) for d in DIRS4] for _, s, mv, _ in srcs]
    lens = [max(len(f) for f in sq) * ms for sq, (*_, ms) in zip(seqs, srcs)]
    same = len({ms for *_, ms in srcs}) == 1
    tick = srcs[0][3] if same else 28
    out_frames = []
    for t in range(0, max(lens), tick):
        rows = [label(row_img([f[(t // ms) % len(f)] if f else None for f in sq]), lab + '   ' + mv)
                for (lab, _, mv, ms), sq in zip(srcs, seqs)]
        out_frames.append(stack(rows).convert('P', palette=Image.ADAPTIVE, colors=255))
    out_frames[0].save(out, save_all=True, append_images=out_frames[1:], duration=tick, loop=0, disposal=2)
print('wrote', out)
