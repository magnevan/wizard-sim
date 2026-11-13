"""The 3D rings into the game: pixelizes the spin and the fall renders and writes game/content/assets/well/rings3d/.

  blender --background --python tools/well-3d/rings.py -- <spin_dir> spin A
  blender --background --python tools/well-3d/rings.py -- <fall_dir> fall A
  python tools/well-3d/drum_fill.py
  python tools/well-3d/export.py <spin_dir> <fall_dir>

Writes spin-back.png and spin-front.png (the steady loop, split at the crystal: back rings, the crystal, front rings),
fall.png and fall-dark.png (the power-down, the stand-ins having cut the rings where the well covers them; lit and with
the light gone), and rings3d.json. All on the well-top's own canvas (its crop of the bought well, art/well-anim.ts).
"""
import json, os, sys
import pixelize as P

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '../../game/content/assets/well/rings3d')
spin_src, fall_src = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
tmp = os.path.join(HERE, 'build', 'spin-px')
P.run(spin_src, tmp)
for part in ('back', 'front'):
    os.replace(os.path.join(tmp, f'{part}.png'), os.path.join(OUT, f'spin-{part}.png'))
spin = json.load(open(os.path.join(tmp, 'rings.json')))
fall = P.run_whole(fall_src, OUT, 'fall')
fall['release'] = json.load(open(os.path.join(fall_src, 'info.json'))).get('release', 0)
json.dump({'spin': {'frames': spin['frames'], 'cell': spin['cell'], 'columnsPerFrame': 1, 'columnsPerTurn': P.COLS},
           'fall': fall, 'crystal': list(P.CRYSTAL)}, open(os.path.join(OUT, 'rings3d.json'), 'w'), indent=1)
print('exported to', OUT)
