"""A GIF to judge the 3D rings by: the bought well (still), the 3D rings at steady speed, and the same frames fast.

  python tools/well-3d/preview_gif.py <rings_dir> <out.gif> [steady_fps] [fast_fps] [k]
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WELL = os.path.join(HERE, '../../game/content/assets/well')
src, out = sys.argv[1], sys.argv[2]
slow = float(sys.argv[3]) if len(sys.argv) > 3 else 8
fast = float(sys.argv[4]) if len(sys.argv) > 4 else 50
k = int(sys.argv[5]) if len(sys.argv) > 5 else 4
TICK = 25  # GIF frames a second
info = json.load(open(os.path.join(src, 'rings.json')))
n, (cw, ch) = info['frames'], info['cell']
lay = lambda name: Image.open(os.path.join(WELL, name)).convert('RGBA')
drum, crystal, rings = lay('drum.png'), lay('crystal.png'), lay('rings.png')
clear = lay('drum-clear.png')   # under the 3D rings: the drum without the bought rings' last rows (drum_fill.py)
back, front = Image.open(os.path.join(src, 'back.png')).convert('RGBA'), Image.open(os.path.join(src, 'front.png')).convert('RGBA')
W, H = drum.width, 96
BG = (40, 40, 48, 255)


def well3d(f):
    im = Image.new('RGBA', (W, H), BG)
    im.alpha_composite(clear.crop((0, 0, W, H)))
    im.alpha_composite(back.crop((f * cw, 0, (f + 1) * cw, ch)))
    im.alpha_composite(crystal.crop((0, 0, W, H)))
    im.alpha_composite(front.crop((f * cw, 0, (f + 1) * cw, ch)))
    return im


orig = Image.new('RGBA', (W, H), BG)
for im in (drum, rings, crystal):
    orig.alpha_composite(im.crop((0, 0, W, H)))
cache = [well3d(f) for f in range(n)]
total = int(round(n / slow * TICK))
frames = []
for t in range(total):
    sheet = Image.new('RGBA', (W * 3 + 12, H), (0, 0, 0, 255))
    sheet.paste(orig, (0, 0))
    sheet.paste(cache[int(t * slow / TICK) % n], (W + 6, 0))
    sheet.paste(cache[int(t * fast / TICK) % n], (2 * W + 12, 0))
    frames.append(sheet.convert('RGB').resize((sheet.width * k, sheet.height * k), Image.NEAREST))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=1000 // TICK, loop=0)
print('gif', len(frames), 'frames', out)
