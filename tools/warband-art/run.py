"""The hooded raider's bought run cycle as a looping GIF, three directions side by side.
usage: python tools/warband-art/run.py  (from the repo root; writes tools/warband-art/img/run.gif)"""
import os
from PIL import Image
RUN = 'game/content/generated/pixellab/warband/raider-hooded/Idle/animations/run'
dirs = ['south-west', 'south', 'east', 'north']
S = 4
frames = []
n = len(os.listdir(os.path.join(RUN, dirs[0])))
for i in range(n):
    f = Image.new('RGBA', (64 * len(dirs) * S, 64 * S), (38, 50, 46, 255))
    for j, d in enumerate(dirs):
        im = Image.open(os.path.join(RUN, d, 'frame_%03d.png' % i)).convert('RGBA')
        f.alpha_composite(im.resize((64 * S, 64 * S), Image.NEAREST), (j * 64 * S, 0))
    frames.append(f.convert('P', palette=Image.ADAPTIVE, colors=255))
frames[0].save('tools/warband-art/img/run.gif', save_all=True, append_images=frames[1:], duration=100, loop=0, disposal=2)
print(n, 'frames')
