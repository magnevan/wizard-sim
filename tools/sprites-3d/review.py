"""Review images of the packed game sheets: every goblin standing in 8 directions, and each move as a GIF. No generation calls.

  python tools/sprites-3d/review.py <out-dir>

Reads game/content/assets/sprites/<slug>/sheet.png and sheet.json (pack.py) and writes <out-dir>/roster-still.png and
roster-walk.gif, roster-run.gif, roster-attack.gif (every attack variant, one row each), roster-death.gif, on dirt at 3x.
"""
import json, os, random, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, 'game', 'content', 'assets', 'sprites')
ORDER = ['raider-hooded', 'raider-goggles', 'archer', 'shieldbearer', 'hooker', 'chieftain']
SHOW4 = [2, 3, 0, 6]   # south, south-west, east, north (sheet rows are east, south-east, south, ... clockwise)
Z, CH = 3, 100         # zoom; row height in art px (the chieftain's frame is 96)


def load(slug):
    m = json.load(open(os.path.join(SPR, slug, 'sheet.json')))
    return m, Image.open(os.path.join(SPR, slug, 'sheet.png')).convert('RGBA')


def cell(m, sh, move, d, f):
    cw, ch = m['cell']; r = m['moves'][move]['row'] + d
    return sh.crop((f * cw, r * ch, (f + 1) * cw, (r + 1) * ch)), m['feet']


def dirt(w, h):
    g = Image.new('RGBA', (w, h), (112, 86, 60, 255)); r = random.Random(1); p = g.load()
    for _ in range(w * h // 14):
        x, y = r.randrange(w), r.randrange(h); p[x, y] = (96, 74, 52, 255) if r.random() < 0.6 else (134, 106, 76, 255)
    return g


def row(cells, label, colw=100):
    g = dirt(colw * len(cells), CH)
    for i, (im, feet) in enumerate(cells):
        g.alpha_composite(im, (i * colw + colw // 2 - feet[0], CH - 6 - feet[1]))
    big = g.resize((g.width * Z, g.height * Z), Image.NEAREST)
    out = Image.new('RGBA', (big.width, big.height + 20), (30, 24, 20, 255)); out.alpha_composite(big, (0, 20))
    ImageDraw.Draw(out).text((6, 4), label, fill=(240, 230, 210, 255))
    return out


def stack(rows):
    s = Image.new('RGBA', (max(r.width for r in rows), sum(r.height for r in rows)), (30, 24, 20, 255)); y = 0
    for r in rows: s.alpha_composite(r, (0, y)); y += r.height
    return s


def gif(path, lines, ms=83):
    """lines: (label, m, sheet, move); each row loops at its own length."""
    n = max(m['moves'][mv]['n'] for _, m, _, mv in lines)
    fr = []
    for i in range(n):
        rows = [row([cell(m, sh, mv, d, i % m['moves'][mv]['n']) for d in SHOW4], lab) for lab, m, sh, mv in lines]
        fr.append(stack(rows).convert('P', palette=Image.ADAPTIVE, colors=255))
    fr[0].save(path, save_all=True, append_images=fr[1:], duration=ms, loop=0, disposal=2)


if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    S = {s: load(s) for s in ORDER if os.path.exists(os.path.join(SPR, s, 'sheet.json'))}
    stack([row([cell(m, sh, 'idle', d, 0) for d in range(8)], s, colw=100) for s, (m, sh) in S.items()]).save(os.path.join(out, 'roster-still.png'))
    gif(os.path.join(out, 'roster-walk.gif'), [(s, m, sh, 'walk') for s, (m, sh) in S.items()])
    gif(os.path.join(out, 'roster-run.gif'), [(s, m, sh, 'run') for s, (m, sh) in S.items()])
    gif(os.path.join(out, 'roster-attack.gif'), [(f'{s} {k}', m, sh, k) for s, (m, sh) in S.items() for k in sorted(m['moves']) if k.startswith('attack')], ms=90)
    gif(os.path.join(out, 'roster-death.gif'), [(s, m, sh, 'death') for s, (m, sh) in S.items()])
    print('wrote', sorted(f for f in os.listdir(out) if f.startswith('roster-') and f[-4:] in ('.gif', '.png') and 'still' in f or f.endswith('.gif')))
