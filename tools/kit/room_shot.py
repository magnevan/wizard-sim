"""A top-down picture of a scene's derived walk grid over the scene's plan, to see that the room fits the real map.

  python tools/kit/room_shot.py court [out.png] [--scale 6] [--crop x0,y0,x1,y1]

Reads game/content/generated/rooms/<scene>.room.json (run tools/kit/room.py first) and compiles the scene for its
floors. Under: each floor in its material's colour, darker the lower it lies. Over: walkable cells clear, blocked cells
hatched dark, stair cells yellow, rock walls black, cliffs red, footprints blue, starts and markers labelled.
Default out: game/shots/port-3d/map/<scene>-walk.png. --crop is in sim units.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import compile as kit  # noqa: E402
import room as rm  # noqa: E402

MAT = {'water': (60, 96, 140), 'plinth': (110, 100, 90), 'cobble': (176, 160, 136), 'deck': (150, 112, 72), 'woods': (64, 96, 60),
       'plaza': (200, 184, 150), 'rock': (120, 112, 104), 'road': (168, 140, 120), 'lawn': (110, 150, 84), 'dirt': (150, 120, 90)}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opt = lambda k, d: sys.argv[sys.argv.index('--' + k) + 1] if '--' + k in sys.argv else d
    name = args[0]
    scale = float(opt('scale', 6))
    out = args[1] if len(args) > 1 and not args[1].replace('.', '').replace(',', '').lstrip('-').isdigit() else \
        os.path.join(rm.ROOT, 'game', 'shots', 'port-3d', 'map', f'{name}-walk.png')
    doc = json.load(open(rm.out_path(name), encoding='utf-8'))
    room = doc['room']; ox, oy = doc['toScene']
    W, H = room['w'], room['h']
    crop = [float(v) for v in opt('crop', f'{-W / 2},{-H / 2},{W / 2},{H / 2}').split(',')]
    x0, y0, x1, y1 = crop
    S = lambda x, y: ((x - x0) * scale, (y - y0) * scale)       # sim units -> pixels
    img = Image.new('RGB', (int((x1 - x0) * scale), int((y1 - y0) * scale)), (20, 20, 24))
    d = ImageDraw.Draw(img, 'RGBA')

    # the plan: floors in their material's colour, shaded by height
    r = kit.compile_scene(kit.load_scene(name))
    for f in sorted(r['floors'], key=lambda f: f['h']):
        c = MAT.get(f['mat'], (150, 150, 150)); k = max(0.45, min(1.15, 0.8 + f['h'] * 0.05))
        col = tuple(int(min(255, v * k)) for v in c)
        for poly in f['polys']:
            d.polygon([S(x - ox, y - oy) for x, y in poly[0]], fill=col)
            for hole in poly[1:]: d.polygon([S(x - ox, y - oy) for x, y in hole], fill=(20, 20, 24))
    # the grid: blocked cells hatched, stair cells yellow
    rows, hrows = room['terrain'], room['height']['rows']
    cs = rm.CELL * scale
    for cy, row in enumerate(rows):
        for cx, ch in enumerate(row):
            x, y = cx * rm.CELL - W / 2, cy * rm.CELL - H / 2
            if x + rm.CELL < x0 or x > x1 or y + rm.CELL < y0 or y > y1: continue
            px, py = S(x, y)
            if ch == '#': d.rectangle([px, py, px + cs, py + cs], fill=(0, 0, 0, 110))
            elif hrows[cy][cx] == '/': d.rectangle([px, py, px + cs, py + cs], fill=(255, 220, 40, 120))
    first_cliff = len(room['rock']) - len(room['height']['cliffs'])
    lw = max(1, int(scale / 4))
    for k, s in enumerate(room['rock']):
        d.line([S(s[0], s[1]), S(s[2], s[3])], fill=(230, 40, 40) if k >= first_cliff else (0, 0, 0), width=lw + (1 if k >= first_cliff else 0))
    for s in room['propRock']: d.line([S(s[0], s[1]), S(s[2], s[3])], fill=(40, 110, 255), width=lw + 1)
    try: font = ImageFont.truetype('arial.ttf', max(10, int(scale * 2)))
    except OSError: font = ImageFont.load_default()
    pts = [(f'start {i}', p) for i, p in enumerate(room['starts'])] + [(m['id'], (m['x'], m['y'])) for m in room['markers']]
    for label, (x, y) in pts:
        px, py = S(x, y); rr = max(3, scale * 0.6)
        d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=(255, 255, 255), outline=(0, 0, 0))
        if not label.startswith('start') or label == 'start 0':
            d.text((px + rr + 2, py - rr), label if not label.startswith('start') else 'starts', fill=(255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print(f'{name}: {out} ({img.size[0]} x {img.size[1]})')


if __name__ == '__main__':
    main()
