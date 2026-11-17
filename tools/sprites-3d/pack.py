"""Pack rendered roster frames into game sprite sheets. No generation calls.

  python tools/sprites-3d/pack.py <work-dir> [slug ...]

Reads <work-dir>/<slug>-px/<clip>/<direction>/fNN.png (pixelize.py) and <work-dir>/<slug>/<clip>/track.json (render.py),
writes game/content/assets/sprites/<slug>/sheet.png and sheet.json, which the client's art/sprites.ts plays.

Rows are (move, direction), directions in the game's angle order (east, south-east, south, ... clockwise on screen),
so a facing of `face` radians is row `round(face / (TAU / 8)) % 8` of a move. Columns are frames.
Moves: idle (1 frame), walk and run (a cycle each; the game's stride phase picks the frame), attack (one entry per
variant, ATK frames each, warped so the clip's wind-up, strike and recovery land on the game's attack beats:
atk 0..0.5 wind-up, 0.5..0.6 the blow, 0.6..1 recovery), and death (the knock-down, at most DEATH frames).
"""
import glob, json, math, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'game', 'content', 'assets', 'sprites')
DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']
ATK, DEATH = 16, 18

# per character: which rendered clips play which move (substring of the clip's folder name)
ROLES = {
    'raider-hooded': {'walk': 'walking', 'run': 'sprint', 'attack': ['left_slash', 'thrust_slash', 'right_hand_sword_slash'], 'death': 'knock_down'},
    'raider-goggles': {'walk': 'walking', 'run': 'sprint', 'attack': ['left_slash', 'thrust_slash', 'right_hand_sword_slash'], 'death': 'knock_down'},
    'archer': {'walk': 'walking', 'run': 'running', 'attack': ['archery_shot'], 'death': 'knock_down'},
    'shieldbearer': {'walk': 'walking', 'run': 'running', 'attack': ['thrust_slash', 'shield_push'], 'death': 'knock_down'},
    'hooker': {'walk': 'walking', 'run': 'running', 'attack': ['crouch_pull_and_throw'], 'death': 'knock_down'},
    'chieftain': {'walk': 'walking', 'run': 'running', 'attack': ['heavy_hammer_swing'], 'death': 'knock_down'},
}


def clip_dir(px, key):
    hits = sorted(d for d in os.listdir(px) if key in d and os.path.isdir(os.path.join(px, d)))
    if not hits: raise SystemExit(f'no clip matching {key!r} in {px}: {sorted(os.listdir(px))}')
    return hits[0]


def frames(px, clip, d):
    return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(os.path.join(px, clip, d, 'f*.png')))]


def beats(track):
    """(start, strike, end) frame positions of an attack clip from the weapon hand's path: the strike is its fastest step."""
    pts = [p for p in track['hand']]
    n = len(pts)
    if n < 4 or any(p is None for p in pts): return 0, n * 0.5, n - 1
    sp = [math.dist(pts[k], pts[k + 1]) for k in range(n - 1)]
    lo, hi = int(n * 0.1), max(int(n * 0.1) + 1, int(n * 0.9))
    s = max(range(lo, hi), key=lambda k: sp[k])
    peak = sp[s] or 1
    start = 0
    for k in range(s, -1, -1):   # back to where the wind-up begins: the hand first moves with intent
        if sp[k] < 0.08 * peak: start = k; break
    end = n - 1
    for k in range(s + 1, n - 1):   # forward to where the recovery has settled
        if sp[k] < 0.05 * peak and k > s + 2: end = k; break
    end = min(n - 1, max(end, s + 4) + 3)
    return start, s + 0.5, end


def warp(a, start, strike, end):
    """Game attack progress 0..1 -> clip frame position."""
    if a < 0.5: return start + (strike - 1.5 - start) * (a / 0.5)
    if a < 0.6: return strike - 1.5 + 3 * ((a - 0.5) / 0.1)
    return strike + 1.5 + (end - strike - 1.5) * ((a - 0.6) / 0.4)


def pack(work, slug):
    px, raw = os.path.join(work, slug + '-px'), os.path.join(work, slug)
    R = ROLES[slug]
    rows = []   # (move key, list of 8 lists of frames)
    walk = clip_dir(px, R['walk'])
    rows.append(('idle', [frames(px, walk, d)[:1] for d in DIRS]))
    rows.append(('walk', [frames(px, walk, d) for d in DIRS]))
    rows.append(('run', [frames(px, clip_dir(px, R['run']), d) for d in DIRS]))
    atk_meta = []
    for k, key in enumerate(R['attack']):
        c = clip_dir(px, key)
        tr = json.load(open(os.path.join(raw, c, 'track.json')))
        b = beats(tr)
        pick = [min(tr['frames'] - 1, max(0, round(warp((i + 0.5) / ATK, *b)))) for i in range(ATK)]
        rows.append((f'attack{k}', [[fr[i] for i in pick] for fr in (frames(px, c, d) for d in DIRS)]))
        atk_meta.append({'clip': c, 'beats': [round(v, 1) for v in b], 'frames': pick})
    c = clip_dir(px, R['death'])
    dead = [frames(px, c, d) for d in DIRS]
    n = len(dead[0]); keep = [round(i * (n - 1) / (DEATH - 1)) for i in range(DEATH)] if n > DEATH else list(range(n))
    rows.append(('death', [[fr[i] for i in keep] for fr in dead]))

    cw, ch = rows[0][1][0][0].size
    cols = max(len(f) for _, per in rows for f in per)
    sheet = Image.new('RGBA', (cols * cw, len(rows) * 8 * ch), (0, 0, 0, 0))
    meta = {'cell': [cw, ch], 'dirs': DIRS, 'moves': {}}
    r = 0
    for key, per in rows:
        meta['moves'][key] = {'row': r, 'n': len(per[0])}
        for fr in per:
            for i, im in enumerate(fr): sheet.alpha_composite(im, (i * cw, r * ch))
            r += 1
    # the feet: the standing frames' lowest opaque row, centred (render.py stands the model's feet on the frame's centre line)
    bottom = max(im.getbbox()[3] for per in rows[0][1] for im in per if im.getbbox())
    meta['feet'] = [cw // 2, bottom - 1]
    meta['height'] = bottom - min(im.getbbox()[1] for per in rows[0][1] for im in per if im.getbbox())
    meta['attacks'] = atk_meta
    meta['fps'] = 12
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    sheet.save(os.path.join(OUT, slug, 'sheet.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, slug, 'sheet.json'), 'w'), indent=1)
    print(slug, sheet.size, {k: v['n'] for k, v in meta['moves'].items()}, 'feet', meta['feet'], [a['beats'] for a in atk_meta])


if __name__ == '__main__':
    work = sys.argv[1]
    for slug in sys.argv[2:] or [s for s in ROLES if os.path.isdir(os.path.join(work, s + '-px'))]:
        pack(work, slug)
