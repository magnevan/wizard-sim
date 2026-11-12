"""The battery well's bought states and animations into the game. No generation calls (they were bought once).

  python tools/art-import/well_frames.py

Sources (game/content/generated/pixellab/opening/well/, PixelLab, the user's approval 2026-11-12):
  state-overloaded.png, state-failed.png   create_object_state on the well (object 482ff0eb), 10 generations each
  anim-steady/      animate_image, 16 frames, base to base: the rings turning about their own axes, the crystal pulsing
  anim-fail/        animate_image, 12 frames, overloaded to failed: the light dying, the rings dropping onto the drum
  anim-repair/      animate_image, 12 frames, failed to base: light returning, the rings rising back into place
  (frame-00 of each is the input frame, as animate_image returns it)
  candidate-1.png   the well as bought: the steady state in the game (the loop's rings morph into a hoop rather than turn)

The animations reach up to 7 px higher than the bought well, so every cell has `rise` rows on top (frames.json).

Every picture is cut as the bought well is (tools/art-import/defence.py): the same crop as candidate-1, and only the part
standing on the steps (split_well's top), since the steps are their own prop and don't move. Writes
game/content/assets/well/frames/<name>.png, one strip per animation (states are strips of one), and frames.json.
"""
import glob, json, os
from PIL import Image
from defence import split_well

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '../../game/content/generated/pixellab/opening/well')
OUT = os.path.join(HERE, '../../game/content/assets/well/frames')

base = Image.open(os.path.join(RAW, 'candidate-1.png')).convert('RGBA')
box = base.getchannel('A').getbbox()


SETS = {
    'still': [os.path.join(RAW, 'candidate-1.png')],   # the well as bought: steady, in the game (the loop's rings morph rather than turn)
    'overloaded': [os.path.join(RAW, 'state-overloaded.png')],
    'failed': [os.path.join(RAW, 'state-failed.png')],
    'steady': sorted(glob.glob(os.path.join(RAW, 'anim-steady', 'frame-*.png')))[:-1],   # its last frame is its first again: a loop
    'fail': sorted(glob.glob(os.path.join(RAW, 'anim-fail', 'frame-*.png'))),
    'repair': sorted(glob.glob(os.path.join(RAW, 'anim-repair', 'frame-*.png'))),
}
# The animations reach higher than the bought well (the flare, the rings lifting): the cell gets `rise` rows on top, which
# all belong to the top; the rest is split as the well is.
RISE = max(0, max(box[1] - Image.open(p).getchannel('A').getbbox()[1] for ps in SETS.values() for p in ps))


def top_of(path):
    im = Image.open(path).convert('RGBA').crop((box[0], box[1] - RISE, box[2], box[3]))
    W, H = im.size
    out = Image.new('RGBA', (W, H))
    out.paste(im.crop((0, 0, W, RISE)), (0, 0))
    out.paste(split_well(im.crop((0, RISE, W, H)))[1], (0, RISE))
    return out


os.makedirs(OUT, exist_ok=True)
meta = {'cell': [box[2] - box[0], box[3] - box[1] + RISE], 'rise': RISE, 'sets': {}}
for name, paths in SETS.items():
    tops = [top_of(p) for p in paths]
    W, H = tops[0].size
    strip = Image.new('RGBA', (W * len(tops), H))
    for k, t in enumerate(tops):
        strip.paste(t, (k * W, 0))
    strip.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    meta['sets'][name] = len(tops)
    print(name, len(tops), 'frames')
json.dump(meta, open(os.path.join(OUT, 'frames.json'), 'w'), indent=2)
