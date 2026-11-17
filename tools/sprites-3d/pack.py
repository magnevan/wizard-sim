"""Pack rendered roster frames into game sprite sheets. No generation calls.

  python tools/sprites-3d/pack.py <work-dir> [slug ...]

Reads <work-dir>/<slug>-px/<clip>/<direction>/fNN.png (pixelize.py) and <work-dir>/<slug>/<clip>/track.json (render.py),
writes game/content/assets/sprites/<slug>/sheet.png and sheet.json, which the client's art/sprites.ts plays. The game
now draws these characters live from export.sh's models (art/live3d.ts); the sheets are the fallback (?live3d=0, or a
software renderer). Clips and timing come from roles.py, shared with the export.

Rows are (move, direction), directions in the game's angle order (east, south-east, south, ... clockwise on screen),
so a facing of `face` radians is row `round(face / (TAU / 8)) % 8` of a move. Columns are frames; a move longer than the
sheet's `cols` wraps into further bands of 8 rows (frame f at column f % cols, row row + dir + 8 * (f // cols)).
Moves: idle (1 frame), walk and run (a cycle each; the game's stride phase picks the frame), attack (one entry per
variant: the clip's own frames at its own speed, never retimed, from where the wind-up starts to where the recovery
settles; sheet.json's `attacks[k].hit` is the contact frame, which the client plays on the game's hit tick), and
death (the knock-down, at most DEATH frames). Smoothness comes before telegraphing: players aren't expected to dodge a
goblin by reading its swing, so the swing is never stretched or squeezed (the user, 2026-11-17).
"""
import glob, json, math, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'game', 'content', 'assets', 'sprites')
DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']
DEATH = 18   # frames of the knock-down at 12 fps (scaled with the render's rate)
MAX_W = 4096

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roles import ROLES, beats, window   # shared with render.py --export

def clip_dir(px, key):
    hits = sorted(d for d in os.listdir(px) if key in d and os.path.isdir(os.path.join(px, d)))
    if not hits: raise SystemExit(f'no clip matching {key!r} in {px}: {sorted(os.listdir(px))}')
    return hits[0]


GRADE = (1, 1, 1)


def frames(px, clip, d):
    fs = sorted(glob.glob(os.path.join(px, clip, d, 'f*.png')), key=lambda f: int(os.path.basename(f)[1:-4]))   # f99 before f100
    return [graded(Image.open(f).convert('RGBA')) for f in fs]


def graded(im):
    """A per-character colour grade (ROLES grade: r, g, b multipliers), for a Meshy texture off the band's palette."""
    if GRADE == (1, 1, 1): return im
    r, g, b, a = im.split()
    r, g, b = (ch.point(lambda v, k=k: min(255, round(v * k))) for ch, k in zip((r, g, b), GRADE))
    return Image.merge('RGBA', (r, g, b, a))


def pack(work, slug):
    px, raw = os.path.join(work, slug + '-px'), os.path.join(work, slug)
    R = ROLES[slug]
    global GRADE
    GRADE = tuple(R.get('grade', (1, 1, 1)))
    rows = []   # (move key, list of 8 lists of frames)
    walk = clip_dir(px, R['walk'])
    wt = os.path.join(raw, walk, 'track.json')
    fps = json.load(open(wt)).get('fps', 12) if os.path.exists(wt) else 12
    rows.append(('idle', [frames(px, walk, d)[:1] for d in DIRS]))
    rows.append(('walk', [frames(px, walk, d) for d in DIRS]))
    rows.append(('run', [frames(px, clip_dir(px, R['run']), d) for d in DIRS]))
    atk_meta = []
    for k, key in enumerate(R['attack']):
        c = clip_dir(px, key)
        tr = json.load(open(os.path.join(raw, c, 'track.json')))
        # the clip at its own speed (roles.window: trimmed, the contact frame `hit`, a still hold `cut` out, never retimed)
        fps = tr.get('fps', 12)
        first, hit, last, cut, b = window(tr['hand'], fps, R.get('tune', {}).get(key, {}))
        keep = [f for f in range(first, last + 1) if f == hit or not (cut[0] <= f <= cut[1])]
        rows.append((f'attack{k}', [[fr[f] for f in keep] for fr in (frames(px, c, d) for d in DIRS)]))
        atk_meta.append({'clip': c, 'beats': [round(v, 1) for v in b], 'frames': keep, 'hit': keep.index(hit)})
    cast_meta = {}
    for name, key in R.get('casts', {}).items():
        c = clip_dir(px, key)   # clip_dir takes the first sorted match: give a key no other clip's name starts with
        b = beats(json.load(open(os.path.join(raw, c, 'track.json')))['hand'])
        first, last = int(b[0]), int(b[2])
        rows.append((name, [fr[first:last + 1] for fr in (frames(px, c, d) for d in DIRS)]))
        cast_meta[name] = {'clip': c, 'beats': [round(v, 1) for v in b], 'first': first, 'hit': min(last, round(b[1] + 0.5)) - first}
    for name, key in R.get('loops', {}).items():
        rows.append((name, [frames(px, clip_dir(px, key), d) for d in DIRS]))
    c = clip_dir(px, R['death'])
    dead = [frames(px, c, d) for d in DIRS]
    cap = round(DEATH * fps / 12)   # the knock-down, thinned to DEATH frames a 12 fps second's worth
    n = len(dead[0]); keep = [round(i * (n - 1) / (cap - 1)) for i in range(cap)] if n > cap else list(range(n))
    rows.append(('death', [[fr[i] for i in keep] for fr in dead]))

    # A move longer than `cols` frames wraps into further bands of 8 direction rows: frame f of direction d sits at
    # column f % cols, row `row + d + 8 * (f // cols)`. cols keeps the sheet within 4096 px, which every GPU takes.
    cw, ch = rows[0][1][0][0].size
    cols = min(max(len(f) for _, per in rows for f in per), MAX_W // cw)
    bands = [(len(per[0]) + cols - 1) // cols for _, per in rows]
    sheet = Image.new('RGBA', (cols * cw, sum(bands) * 8 * ch), (0, 0, 0, 0))
    meta = {'cell': [cw, ch], 'cols': cols, 'dirs': DIRS, 'moves': {}}
    r = 0
    for (key, per), nb in zip(rows, bands):
        meta['moves'][key] = {'row': r, 'n': len(per[0])}
        for d, fr in enumerate(per):
            for i, im in enumerate(fr): sheet.alpha_composite(im, ((i % cols) * cw, (r + d + 8 * (i // cols)) * ch))
        r += 8 * nb
    # the feet: the standing frames' lowest opaque row, centred (render.py stands the model's feet on the frame's centre line)
    bottom = max(im.getbbox()[3] for per in rows[0][1] for im in per if im.getbbox())
    meta['feet'] = [cw // 2, bottom - 1]
    meta['height'] = bottom - min(im.getbbox()[1] for per in rows[0][1] for im in per if im.getbbox())
    meta['attacks'] = atk_meta
    if cast_meta: meta['casts'] = cast_meta
    meta['fps'] = fps
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    sheet.save(os.path.join(OUT, slug, 'sheet.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, slug, 'sheet.json'), 'w'), indent=1)
    print(slug, sheet.size, {k: v['n'] for k, v in meta['moves'].items()}, 'feet', meta['feet'], [a['beats'] for a in atk_meta])


if __name__ == '__main__':
    work = sys.argv[1]
    for slug in sys.argv[2:] or [s for s in ROLES if os.path.isdir(os.path.join(work, s + '-px'))]:
        pack(work, slug)
