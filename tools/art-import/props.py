"""The opening's bought props into the asset registry, placeable in LDtk by id. No generation calls.

  python tools/art-import/props.py

Raw files in game/content/generated/pixellab/opening/ stay untouched. Each prop gets a `lean` image and a meta.json
naming its raw file. The clutter sheet fills its 32 px canvases, so a book would stand as tall as a wizard: it's halved,
as the outdoor scatter was. Footprints are first guesses, and only matter for props a room marks as blocking.
"""
import json, os, re
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '../..')
ASSETS = os.path.join(ROOT, 'game/content/assets/props')
RAWREL = 'game/content/generated/pixellab/opening'
STATUS = 'PixelLab output. Re-check its terms and the Steam AI disclosure before release.'

ACADEMY = [
    ('presentation-board', 'Presentation board', [2.2, 0.5]), ('wall-map', 'Framed map', [2.0, 0.3]), ('lecture-bench', 'Tiered lecture bench', [2.4, 0.9]), ('notice-board', 'Notice board', [2.0, 0.4]),
    ('drafting-table', 'Drafting table', [1.6, 1.0]), ('trunk-open', 'Half-packed trunk', [1.2, 0.8]), ('chart-rack', 'Chart rack', [1.2, 0.5]), ('surveying-instrument', 'Surveying instrument', [0.8, 0.8]),
    ('workbench-brass', 'Workbench', [1.8, 0.9]), ('test-rig', 'Test rig', [0.9, 0.9]), ('cloister-arch', 'Cloister arch', [2.2, 0.4]), ('ledgers-stool', 'Ledgers on a stool', [0.6, 0.6]),
    ('chalkboard', 'Chalkboard', [1.8, 0.4]), ('instrument-panel', 'Instrument panel', [0.6, 0.4]), ('crate-fittings', 'Crate of fittings', [1.0, 0.8]), ('lantern-post', 'Lantern post', [0.4, 0.3]),
]
WORKS = [
    ('focus-rack', 'Focus rack', [1.4, 0.4]), ('archer-platform', 'Archer platform', [1.4, 1.2]), ('training-sack', 'Training sack', [1.2, 0.5]), ('control-pedestal', 'Control pedestal', [0.8, 0.7]),
    ('brass-pipe', 'Brass pipe', [1.8, 0.4]), ('pipe-junction', 'Pipe junction', [0.8, 0.8]), ('stakes', 'Sharpened stakes', [1.8, 0.4]), ('palisade', 'Timber palisade', [1.8, 0.3]),
    ('sandbags', 'Sandbags', [1.6, 0.6]), ('ward-lamp', 'Ward lamp', [0.4, 0.3]), ('crates-canvas', 'Crates under canvas', [1.4, 0.9]), ('supply-cart', 'Supply cart', [1.7, 1.0]),
    ('hand-pump', 'Pump and cistern', [1.3, 1.0]), ('survey-stakes', 'Surveyor stakes', [0.8, 0.4]), ('well-cap-dry', 'Dry well cap', [1.2, 1.0]), ('signal-mast', 'Signal mast', [0.5, 0.4]),
]
BUILDINGS = [('storehouse', 'Storehouse', [5.0, 3.5]), ('gatehouse', 'Gatehouse', [7.0, 1.0]), ('guard-tower', 'Guard tower', [4.0, 3.0])]
CLUTTER = ['single closed leather book', 'stack of three books', 'open book lying flat', 'rolled parchment scroll', 'loose sheet of parchment', 'crumpled paper ball', 'ink bottle with a quill', 'wax candle on a brass holder', 'melted candle stub', 'small brass key', 'brass compass', 'folding wooden ruler', 'brass plumb bob on a string', 'pair of brass dividers', 'wooden set square', 'small hammer', 'chisel', 'coil of copper wire', 'small brass gear', 'handful of brass rivets', 'glass lens in a brass ring', 'small glowing blue crystal', 'cracked dull crystal', 'glass flask of orange liquid', 'round glass bottle of green liquid', 'small corked vial', 'wooden mug', 'pewter plate with bread crust', 'apple core', 'small wooden stool', 'round wooden stool knocked over', 'small woven basket', 'folded grey cloth', 'leather satchel', 'pair of worn boots', 'wool cloak on the floor', 'small potted herb', 'dead potted plant', 'small wooden box', 'small iron lockbox', 'pile of sawdust', 'small puddle of spilled ink', 'scorch mark on the floor', 'chalk dust smudge', 'stick of white chalk', 'small rug fragment', 'round woven floor mat', 'wooden bucket', 'mop lying flat', 'broom lying flat', 'stack of slates', 'single writing slate', 'abacus', 'small hourglass', 'brass hand bell', 'pair of spectacles', 'wax seal stamp', 'red wax seal on a letter', 'envelope', 'small wooden crate lid', 'loose floorboard', 'mouse', 'sleeping grey cat', 'spider in a small web']
FLAT = {'loose-sheet-of-parchment', 'small-puddle-of-spilled-ink', 'scorch-mark-on-the-floor', 'chalk-dust-smudge', 'small-rug-fragment', 'round-woven-floor-mat', 'loose-floorboard', 'envelope', 'pile-of-sawdust', 'open-book-lying-flat', 'mop-lying-flat', 'broom-lying-flat', 'spider-in-a-small-web'}


def trim(im):
    box = im.getchannel('A').getbbox()
    return im.crop(box) if box else im


# Where the picture's width misreads the ground: a post's lamp overhangs one side, and a cart's handle reaches past its wheels.
FEET = {'lantern-post': [21, 42], 'supply-cart': [22, 30]}


def ground_foot(pid, im):
    """The pixel standing on the prop's spot: the middle of its base. These props are drawn from the corner, so the base is a 2:1
    diamond or ellipse as wide as the widest row of the lower half, and its middle is a quarter of that width above the bottom edge."""
    if pid in FEET:
        return FEET[pid]
    a = np.array(im)[:, :, 3] > 0
    rows = np.where(a.any(axis=1))[0]
    bottom = int(rows[-1])
    def span(y):
        xs = np.where(a[y])[0]
        return int(xs[-1] - xs[0] + 1)
    return [im.width // 2, bottom + 1 - max(span(int(y)) for y in rows[rows >= (rows[0] + bottom) / 2]) // 4]


def register(pid, name, footprint, im, raw, tool, edits='trimmed only', flat=False, foot=None, round_=False, sort=None):
    d = os.path.join(ASSETS, pid)
    os.makedirs(d, exist_ok=True)
    im.save(os.path.join(d, 'lean.png'), optimize=True)
    meta = {'id': pid, 'kind': 'prop', 'name': name, 'footprint': footprint}
    if round_: meta['round'] = True
    if sort is not None: meta['sort'] = sort
    if flat: meta['flat'] = True
    meta['sets'] = {'lean': {'file': 'lean.png', 'foot': foot or [im.width // 2, im.height - 2], 'source': 'pixellab', 'raw': raw, 'tool': tool, 'edits': edits, 'status': STATUS}}
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w'), indent=2)


def main():
    raw = os.path.join(ROOT, RAWREL)
    open_png = lambda rel: Image.open(os.path.join(raw, rel)).convert('RGBA')
    n = 0
    for folder, items in (('academy', ACADEMY), ('works', WORKS)):
        for i, (pid, name, fp) in enumerate(items):
            im = trim(open_png(f'{folder}/{i:02d}.png'))
            register(pid, name, fp, im, f'{RAWREL}/{folder}/{i:02d}.png', 'create_1_direction_object', foot=ground_foot(pid, im)); n += 1
    for pid, name, fp in BUILDINGS:
        im = trim(open_png(f'buildings/{pid}.png'))
        register(pid, name, fp, im, f'{RAWREL}/buildings/{pid}.png', 'create_map_object', foot=ground_foot(pid, im)); n += 1
    for i, text in enumerate(CLUTTER):
        pid = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
        im = trim(open_png(f'clutter/{i:02d}.png'))
        if np.count_nonzero(np.array(im)[:, :, 3]) < 12:  # a slot that came back all but empty (the chalk dust)
            print('skipped, empty:', pid); continue
        im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.NEAREST)
        register(pid, text.capitalize(), [0.4, 0.3], im, f'{RAWREL}/clutter/{i:02d}.png', 'create_1_direction_object', 'trimmed, halved', pid in FLAT); n += 1
    print('registered', n)


if __name__ == '__main__':
    main()
