"""Pack rendered roster frames into game sprite sheets. No generation calls.

  python tools/sprites-3d/pack.py <work-dir> [slug ...]

Reads <work-dir>/<slug>-px/<clip>/<direction>/fNN.png (pixelize.py) and <work-dir>/<slug>/<clip>/track.json (render.py),
writes game/content/assets/sprites/<slug>/sheet.png and sheet.json, which the client's art/sprites.ts plays.

Rows are (move, direction), directions in the game's angle order (east, south-east, south, ... clockwise on screen),
so a facing of `face` radians is row `round(face / (TAU / 8)) % 8` of a move. Columns are frames.
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
DEATH = 18

# per character: which rendered clips play which move (substring of the clip's folder name)
ROLES = {
    'raider-hooded': {'walk': 'walking', 'run': 'sprint', 'attack': ['left_slash', 'thrust_slash', 'right_hand_sword_slash'], 'death': 'knock_down'},
    'raider-goggles': {'walk': 'walking', 'run': 'sprint', 'attack': ['left_slash', 'thrust_slash', 'right_hand_sword_slash'], 'death': 'knock_down'},
    # the archer's shot: the arrow leaves at clip frame 39 (render.py --release); the full draw held before it (34..38)
    # is left out, so the game's 1 s wind-up shows the draw rising into the shot
    'archer': {'walk': 'walking', 'run': 'running', 'attack': ['archery_shot'], 'death': 'knock_down',
               'tune': {'archery_shot': {'hit': 39, 'cut': (34, 38)}}},
    'shieldbearer': {'walk': 'walking', 'run': 'running', 'attack': ['thrust_slash', 'shield_push'], 'death': 'knock_down'},
    'hooker': {'walk': 'walking', 'run': 'running', 'attack': ['crouch_pull_and_throw'], 'death': 'knock_down', 'grade': (0.84, 0.93, 0.9)},
    'chieftain': {'walk': 'walking', 'run': 'running', 'attack': ['heavy_hammer_swing'], 'death': 'knock_down'},
    # the wizard: the staff's shove and weapon Strike as its attack; spell moves as one-shots with a release frame
    # (`casts`, found like an attack's hit), gathering as a loop (`loops`, the whole clip)
    'wizard': {'walk': 'walking_man', 'run': 'running', 'attack': ['right_hand_sword_slash'], 'death': 'knock_down',
               'casts': {'cast': 'mage_soell_cast_3', 'area': 'charged_ground_slam', 'self': 'mage_soell_cast'},
               'loops': {'gather': 'mage_soell_cast_8'}},
}


def clip_dir(px, key):
    hits = sorted(d for d in os.listdir(px) if key in d and os.path.isdir(os.path.join(px, d)))
    if not hits: raise SystemExit(f'no clip matching {key!r} in {px}: {sorted(os.listdir(px))}')
    return hits[0]


GRADE = (1, 1, 1)


def frames(px, clip, d):
    return [graded(Image.open(f).convert('RGBA')) for f in sorted(glob.glob(os.path.join(px, clip, d, 'f*.png')))]


def graded(im):
    """A per-character colour grade (ROLES grade: r, g, b multipliers), for a Meshy texture off the band's palette."""
    if GRADE == (1, 1, 1): return im
    r, g, b, a = im.split()
    r, g, b = (ch.point(lambda v, k=k: min(255, round(v * k))) for ch, k in zip((r, g, b), GRADE))
    return Image.merge('RGBA', (r, g, b, a))


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
    # back from the clip's end to the last step that still moves: the recovery is over there. (Searching forward for the
    # first still step stopped at holds, like an archer's pause after the shot, and cut the return to rest; the sprite
    # then snapped back.)
    end = n - 1
    for k in range(n - 2, s, -1):
        if sp[k] >= 0.05 * peak: end = k + 1; break
    end = min(n - 1, max(end, s + 4) + 1)
    return start, s + 0.5, end


def pack(work, slug):
    px, raw = os.path.join(work, slug + '-px'), os.path.join(work, slug)
    R = ROLES[slug]
    global GRADE
    GRADE = tuple(R.get('grade', (1, 1, 1)))
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
        # the clip at its own speed, trimmed to the wind-up's start and the settled recovery; `hit` is the contact
        # frame (just after the hand's fastest step), which the client lines up with the game's hit. ROLES `tune`
        # overrides per clip, in clip frames: `hit` where the fastest step isn't the hit (a bow's is the reach for the
        # arrow), `cut` a still hold to drop (frames left out, never retimed), `first` / `end`.
        o = R.get('tune', {}).get(key, {})
        first, last = o.get('first', int(b[0])), o.get('end', int(b[2]))
        hit = min(last, o.get('hit', round(b[1] + 0.5)))
        cut = o.get('cut', (1, 0))
        keep = [f for f in range(first, last + 1) if f == hit or not (cut[0] <= f <= cut[1])]
        rows.append((f'attack{k}', [[fr[f] for f in keep] for fr in (frames(px, c, d) for d in DIRS)]))
        atk_meta.append({'clip': c, 'beats': [round(v, 1) for v in b], 'frames': keep, 'hit': keep.index(hit)})
    cast_meta = {}
    for name, key in R.get('casts', {}).items():
        c = clip_dir(px, key)   # clip_dir takes the first sorted match: give a key no other clip's name starts with
        b = beats(json.load(open(os.path.join(raw, c, 'track.json'))))
        first, last = int(b[0]), int(b[2])
        rows.append((name, [fr[first:last + 1] for fr in (frames(px, c, d) for d in DIRS)]))
        cast_meta[name] = {'clip': c, 'beats': [round(v, 1) for v in b], 'first': first, 'hit': min(last, round(b[1] + 0.5)) - first}
    for name, key in R.get('loops', {}).items():
        rows.append((name, [frames(px, clip_dir(px, key), d) for d in DIRS]))
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
    if cast_meta: meta['casts'] = cast_meta
    meta['fps'] = 12
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    sheet.save(os.path.join(OUT, slug, 'sheet.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, slug, 'sheet.json'), 'w'), indent=1)
    print(slug, sheet.size, {k: v['n'] for k, v in meta['moves'].items()}, 'feet', meta['feet'], [a['beats'] for a in atk_meta])


if __name__ == '__main__':
    work = sys.argv[1]
    for slug in sys.argv[2:] or [s for s in ROLES if os.path.isdir(os.path.join(work, s + '-px'))]:
        pack(work, slug)
