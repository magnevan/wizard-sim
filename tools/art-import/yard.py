"""The drill yard's bought art into the asset registry (tools/segments/01-opening/yard-buy.json has the prompts). No
generation calls.

  python tools/art-import/yard.py

Raw files in game/content/generated/pixellab/opening/yard/ stay untouched. The 16 props come from one
create_1_direction_object job at 48 px, in the order of the job's items; the four buildings are create_map_object, one
each. Footprints are first guesses, to judge in the room.
"""
import os
from props import RAWREL, ROOT, ground_foot, register, trim
from PIL import Image

RAW = f'{RAWREL}/yard'
LEFTOVERS = [
    ('planks-stacked', 'Stacked planks', [1.4, 0.7]), ('logs-pile', 'Pile of logs', [1.3, 0.8]), ('stone-blocks', 'Cut stone blocks', [1.2, 0.9]),
    ('sawhorse', 'Sawhorse', [1.2, 0.5]), ('ladder-lying', 'Ladder on the ground', [1.4, 0.5]), ('fence-posts-bundle', 'Bundle of fence posts', [1.0, 0.7]),
    ('tarp-heap', 'Tarp over material', [1.3, 1.0]), ('nail-barrel', 'Barrel of nails', [0.7, 0.7]), ('gravel-heap', 'Gravel heap with a shovel', [1.3, 1.0]),
    ('fence-frame', 'Unfinished fence', [1.3, 0.3]), ('wagon-wheel', 'Old wagon wheel', [0.9, 0.7]), ('plough-rusty', 'Rusty plough', [1.3, 0.6]),
    ('barrel-broken', 'Broken barrel', [0.8, 0.7]), ('roof-tiles-pile', 'Pile of roof tiles', [1.1, 0.8]), ('jerkin-rack', 'Rack of training jerkins', [1.2, 0.5]),
    ('practice-shields', 'Practice shields', [1.0, 0.8]),
]
FLAT = {'ladder-lying', 'wagon-wheel'}
BUILDINGS = [('academy-hall', 'Academy hall', [9.0, 5.0]), ('barracks', 'Barracks', [7.0, 3.5]), ('equipment-shed', 'Equipment shed', [5.5, 3.5]), ('cloister-walk', 'Cloister walk', [8.0, 3.5])]


def main():
    raw = os.path.join(ROOT, RAW)
    for i, (pid, name, fp) in enumerate(LEFTOVERS):
        im = trim(Image.open(os.path.join(raw, f'{i:02d}.png')).convert('RGBA'))
        register(pid, name, fp, im, f'{RAW}/{i:02d}.png', 'create_1_direction_object', flat=pid in FLAT, foot=ground_foot(pid, im))
    for pid, name, fp in BUILDINGS:
        im = trim(Image.open(os.path.join(raw, f'{pid}.png')).convert('RGBA'))
        register(pid, name, fp, im, f'{RAW}/{pid}.png', 'create_map_object', foot=ground_foot(pid, im))
        print(pid, im.size)
    print('registered', len(LEFTOVERS) + len(BUILDINGS))


if __name__ == '__main__':
    main()
