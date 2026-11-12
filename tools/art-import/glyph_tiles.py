"""The glyph path tileset: small runes for paths cut into the ground, drawn by hand here (no generation calls).

  python tools/art-import/glyph_tiles.py

Writes game/content/assets/tiles/glyph-path/tiles.png and tiles.json. Everything is white (strokes) and grey (the fainter
marks) on transparent, so the game tints it to any colour: a Fire path from the battery's well is orange, a path from an
Arcane well would be violet (art/glyph-path.ts). Each tile is 7 x 5 px, squat because the ground is seen at a slant, on
an 8 px pitch: GLYPHS first, then the pad that ends a path and the node that marks a bend.
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '../../game/content/assets/tiles/glyph-path')
W, H, PITCH = 7, 5, 8

GLYPHS = [
    ['...#...', '..#.#..', '.#.+.#.', '..#.#..', '...#...'],   # an eye
    ['.#...#.', '..#.#..', '...#...', '...#...', '...+...'],   # a fork
    ['.#...#.', '.#...#.', '.#####.', '.#...#.', '.#...#.'],   # a ladder rung
    ['..###..', '.#...#.', '.#.+.#.', '.#...#.', '..###..'],   # a ring and a dot
    ['.......', '#...#..', '.#.#.#.', '..#...#', '.......'],   # a zigzag
    ['...#...', '..#.#..', '.#...#.', '#######', '.......'],   # a peak
    ['.#...#.', '..#.#..', '...+...', '..#.#..', '.#...#.'],   # a cross
    ['.###...', '.#..#..', '.###...', '.#.#...', '.#..#..'],   # a hooked stave
    ['.####..', '.#..#..', '.#.##..', '.#.....', '.#####.'],   # a coil
    ['.#.+.#.', '.#...#.', '.#.+.#.', '.#...#.', '.#.+.#.'],   # twin staves, beaded
    ['+..#..+', '..###..', '.#####.', '..###..', '+..#..+'],   # a sun
    ['..#....', '.###...', '..#.#..', '....###', '.....#.'],   # two linked marks
]
PAD = ['...#...', '..#+#..', '.#+++#.', '..#+#..', '...#...']
NODE = ['.......', '...#...', '..#+#..', '...#...', '.......']

tiles = GLYPHS + [PAD, NODE]
im = Image.new('RGBA', (PITCH * len(tiles), H), (0, 0, 0, 0))
for k, rows in enumerate(tiles):
    assert len(rows) == H and all(len(r) == W for r in rows), k
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '#': im.putpixel((k * PITCH + x, y), (255, 255, 255, 255))
            elif ch == '+': im.putpixel((k * PITCH + x, y), (150, 150, 150, 255))
os.makedirs(OUT, exist_ok=True)
im.save(os.path.join(OUT, 'tiles.png'))
json.dump({'cell': [W, H], 'pitch': PITCH, 'glyphs': len(GLYPHS), 'pad': len(GLYPHS), 'node': len(GLYPHS) + 1,
           'source': 'tools/art-import/glyph_tiles.py, drawn by hand'}, open(os.path.join(OUT, 'tiles.json'), 'w'), indent=2)
print('glyph tiles:', len(tiles), im.size)
