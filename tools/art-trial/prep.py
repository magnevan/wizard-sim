"""Builds the shared inputs of the art trial: the palette (the colours our art code uses most) and the
style reference (actors and floor cut from a 1x game screenshot).

  python tools/art-trial/prep.py <1x screenshot.png>
"""
import collections, glob, json, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', '..', 'game', 'packages', 'client', 'src', 'art', '*.ts')
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

count = collections.Counter()
for f in glob.glob(ART):
    for h in re.findall(r"#[0-9a-fA-F]{6}\b", open(f, encoding='utf8').read()):
        count[h.lower()] += 1
palette = [h for h, _ in count.most_common(48)]
json.dump(palette, open(os.path.join(OUT, 'palette.json'), 'w'))
print(len(count), 'colours in the art code; kept', len(palette))

shot = Image.open(sys.argv[1]).convert('RGB')
# wizard, goblins, brute, a strip of floor, on a 48x48 and a 192x192 (4x) reference
ref = shot.crop((326, 160, 374, 208))
ref.save(os.path.join(OUT, 'ref-48.png'))
big = shot.crop((320, 150, 560, 240))
big.resize((big.width * 4, big.height * 4), Image.NEAREST).save(os.path.join(OUT, 'ref-4x.png'))
sw = Image.new('RGB', (12 * 16, 4 * 16))
for i, h in enumerate(palette):
    sw.paste(tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)), ((i % 12) * 16, (i // 12) * 16, (i % 12) * 16 + 16, (i // 12) * 16 + 16))
sw.save(os.path.join(OUT, 'palette.png'))
