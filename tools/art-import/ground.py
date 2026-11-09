"""Cuts the full tiles out of the ground tilesets we own and writes them as the painter's materials. Free to rerun.

  python tools/art-import/ground.py

A two-terrain set holds one full tile of each terrain (all four corners the same). Those are the textures
game/packages/client/src/art/ground.ts paints from: game/content/assets/ground/<name>.png.
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '../../game/content/generated/pixellab')
OUT = os.path.join(HERE, '../../game/content/assets/ground')

# set folder -> (name for its lower terrain, name for its upper terrain); None skips one
SETS = {
    'outdoor/ground-pro': ('dirt', 'grass'),
    'outdoor/ground-cobble': ('cobble', None),
    'outdoor/ground-water': ('water', None),
    'opening/ground-sand-flagstone': ('sand', 'flagstone'),
    'opening/ground-mud-leaves': ('mud', 'leaves'),
    'opening/ground-gravel-ash': ('gravel', 'ash'),
    'opening/ground-planks-slabs': ('planks', 'slabs'),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for folder, names in SETS.items():
        d = os.path.join(RAW, folder)
        if not os.path.exists(os.path.join(d, 'metadata.json')):
            print('not bought yet:', folder)
            continue
        meta = json.load(open(os.path.join(d, 'metadata.json'), encoding='utf8'))
        sheet = Image.open(os.path.join(d, 'sheet.png')).convert('RGBA')
        for t in meta.get('tileset_data', meta).get('tiles', []):
            corners = set(t['corners'][k] for k in ('NW', 'NE', 'SW', 'SE'))
            if len(corners) != 1: continue
            which = corners.pop()
            name = names[0] if which == 'lower' else names[1] if which == 'upper' else None
            if not name: continue
            b = t['bounding_box']
            sheet.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height'])).save(os.path.join(OUT, name + '.png'), optimize=True)
            print(name, b['width'], 'px')


if __name__ == '__main__':
    main()
