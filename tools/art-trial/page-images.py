"""Crops round 2's screenshots into the page's images. From game/, first:

  npm run build && node scripts/academy-shots.mjs && node scripts/wizard-sheet.mjs

then: python tools/art-trial/page-images.py && python tools/art-trial/iso-still.py game/shots/academy/wizard-sheet.png
"""
import os, shutil
from PIL import Image
from variants import HERE, wall_strip

S = os.path.join(HERE, '../../game/shots/academy/')
IMG = os.path.join(HERE, 'img/')
crop = lambda n, b: Image.open(S + n + '.png').convert('RGB').crop(b)

for n in ['room-lean', 'room-simple', 'room-code', 'room-lean-hd', 'room-code-hd']:
    crop(n, (210, 150, 1040, 560)).save(IMG + n + '.png', optimize=True)
b = (610, 175, 1130, 560)
for names, out in ((['close-today', 'close-hd'], 'wizard-in-room.png'), (['close-today-front', 'close-hd-front'], 'wizard-depth.png')):
    ims = [crop(n, b) for n in names]
    o = Image.new('RGB', (ims[0].width * 2 + 8, ims[0].height), (27, 36, 33))
    o.paste(ims[0], (0, 0)); o.paste(ims[1], (ims[0].width + 8, 0))
    o.save(IMG + out, optimize=True)
sh = Image.open(S + 'wizard-sheet.png').convert('RGB')
sh.resize((sh.width * 3 // 4, sh.height * 3 // 4), Image.NEAREST).save(IMG + 'wizard-sheet.png', optimize=True)
wall_strip(S + 'room-lean.png', IMG + 'wall-variants.png')
shutil.copy(os.path.join(HERE, 'out/variants.png'), IMG + 'variants.png')
print('page images written')
