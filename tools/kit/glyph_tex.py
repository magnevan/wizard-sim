"""Makes the glyph paths' two masks (kit-glyph.ts) from their Codex pictures (prompts: tools/concept-gen/prompts/2026-11-27-glyphs/).

  python tools/kit/glyph_tex.py

  textures/src/tex-glyph-runes.png      sixteen Life runes in a 4 x 4 grid, white on black
    -> textures/glyph-runes.png         512 px: each rune found in its quarter-row cell, cropped to its strokes and
                                        centred in a 128 px cell at the same scale for all (the largest fills 80 %)
  textures/src/tex-glyph-medallion.png  the medallion, white on black
    -> textures/glyph-medallion.png     512 px, cropped to its outer ring
Both are greyscale masks (white = carved stroke); the shader tints them.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
TEX = os.path.join(ROOT, 'game', 'content', 'generated', 'textures')


def mask(path):
    a = np.asarray(Image.open(path).convert('L'), dtype=np.float32) / 255
    return np.clip((a - 0.12) / 0.76, 0, 1)


def bbox(m, t=0.3):
    ys, xs = np.nonzero(m > t)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def runes():
    m = mask(os.path.join(TEX, 'src', 'tex-glyph-runes.png'))
    h, w = m.shape; cw, ch = w / 4, h / 4
    cells = []
    for r in range(4):
        for c in range(4):
            sub = m[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]
            b = bbox(sub)
            cells.append(sub[b[1]:b[3], b[0]:b[2]] if b else np.zeros((1, 1)))
    big = max(max(s.shape) for s in cells)
    C = 128; k = C * 0.8 / big
    out = Image.new('L', (C * 4, C * 4), 0)
    for i, s in enumerate(cells):
        im = Image.fromarray((s * 255).astype(np.uint8)).resize((max(1, round(s.shape[1] * k)), max(1, round(s.shape[0] * k))), Image.LANCZOS)
        out.paste(im, ((i % 4) * C + (C - im.width) // 2, (i // 4) * C + (C - im.height) // 2))
    out.save(os.path.join(TEX, 'glyph-runes.png'))


def medallion():
    m = mask(os.path.join(TEX, 'src', 'tex-glyph-medallion.png'))
    x0, y0, x1, y1 = bbox(m)
    s = max(x1 - x0, y1 - y0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    im = Image.fromarray((m * 255).astype(np.uint8)).crop((round(cx - s / 2), round(cy - s / 2), round(cx + s / 2), round(cy + s / 2)))
    im.resize((512, 512), Image.LANCZOS).save(os.path.join(TEX, 'glyph-medallion.png'))


if __name__ == '__main__':
    runes(); medallion()
    print('glyph-runes.png, glyph-medallion.png ->', os.path.relpath(TEX))
