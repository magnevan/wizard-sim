"""mark.py - draw pins on a concept image for Claude to look at (cli.mjs ref show).

usage: python tools/map-editor/mark.py <image> <out.png> '<json: [[u, v, label, focus], ...]>'
u, v are 0..1 from the image's top left. A pin with focus true is drawn orange, and a close-up around it is written
beside out.png as <out>-crop.png (a third of the image's size, at full resolution).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

src, out, pins = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
im = Image.open(src).convert('RGB')
W, H = im.size
r = max(12, round(min(W, H) / 55))
try: font = ImageFont.truetype('arialbd.ttf', round(r * 1.1))
except OSError: font = ImageFont.load_default()

def mark(img, x, y, label, focus, rr):
    d = ImageDraw.Draw(img)
    fill = (255, 138, 61) if focus else (74, 90, 122)
    d.ellipse((x - rr - 3, y - rr - 3, x + rr + 3, y + rr + 3), fill=(255, 255, 255))
    d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=fill)
    d.text((x, y), label, font=font, fill=(255, 255, 255), anchor='mm')

marked = im.copy()
for u, v, label, focus in pins: mark(marked, u * W, v * H, label, focus, r)
marked.save(out)
for u, v, label, focus in pins:
    if not focus: continue
    cw, ch = W // 3, H // 3
    x0 = min(max(0, round(u * W - cw / 2)), W - cw); y0 = min(max(0, round(v * H - ch / 2)), H - ch)
    crop = im.crop((x0, y0, x0 + cw, y0 + ch))
    # a ring, not a disc, so the detail under the pin stays visible
    d = ImageDraw.Draw(crop); x, y = u * W - x0, v * H - y0; rr = r * 1.6
    d.ellipse((x - rr, y - rr, x + rr, y + rr), outline=(255, 255, 255), width=6)
    d.ellipse((x - rr, y - rr, x + rr, y + rr), outline=(255, 138, 61), width=3)
    d.text((x + rr + 6, y - rr), label, font=font, fill=(255, 138, 61), stroke_width=3, stroke_fill=(255, 255, 255))
    crop.save(os.path.splitext(out)[0] + '-crop.png')
