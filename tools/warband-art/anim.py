"""A bought animation as a looping GIF on dirt, several directions side by side, feet aligned.
usage: python tools/warband-art/anim.py <character-dir> <animation> <out.gif> [ms-per-frame] [dir,dir,...]
  character-dir: e.g. game/content/generated/pixellab/warband/raider-hooded-32"""
import sys, os, random
from PIL import Image
root, anim, out = sys.argv[1:4]
ms = int(sys.argv[4]) if len(sys.argv) > 4 else 110
dirs = sys.argv[5].split(',') if len(sys.argv) > 5 else ['south', 'south-west', 'east', 'north']
A = os.path.join(root, 'Idle', 'animations', anim)
seqs = []
for d in dirs:
    fs = sorted(os.listdir(os.path.join(A, d)))
    seqs.append([Image.open(os.path.join(A, d, f)).convert('RGBA') for f in fs])
n = max(len(s) for s in seqs)
cw = max(s[0].width for s in seqs) + 8; ch = max(s[0].height for s in seqs) + 4
g = Image.new('RGBA', (cw * len(dirs), ch), (112, 86, 60, 255)); r = random.Random(1); gp = g.load()
for _ in range(g.width * ch // 14):
    x, y = r.randrange(g.width), r.randrange(ch); gp[x, y] = (96, 74, 52, 255) if r.random() < 0.6 else (134, 106, 76, 255)
frames = []
for i in range(n):
    f = g.copy()
    for j, s in enumerate(seqs):
        im = s[i % len(s)]
        f.alpha_composite(im, (j * cw + (cw - im.width) // 2, ch - im.height - 2))
    frames.append(f.resize((f.width * 4, f.height * 4), Image.NEAREST).convert('P', palette=Image.ADAPTIVE, colors=255))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=ms, loop=0, disposal=2)
print(anim, n, 'frames x', len(dirs), 'directions')
