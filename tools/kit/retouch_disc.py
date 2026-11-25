"""
The plaza disc's picture without its painted channels (pin p34, 2026-11-24): the seven coloured stripes became real
recessed channels (kit.json `setpiece.plaza-inlay`, drawn by kit-render.ts), so the decal keeps only the stone.

    python tools/kit/retouch_disc.py            # src/tex-plaza-disc-striped.png -> plaza-disc.png

Each stripe (and its medallion) is filled from the same picture turned 25 degrees about its centre, where there is plain
stone: the flagstone rings are concentric, so the rings run on across the patch. The medallions are moved in, shrunk,
to the end of each channel on the inlaid slab (MED_R u from the centre), so the channels run out into them. No pixel is
drawn in code: every one comes from the painting. Prints each stripe's colour, the channels' tints in kit.json.
"""
import math
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game', 'content', 'generated', 'textures') + '/'
SRC, OUT = ROOT + 'src/tex-plaza-disc-striped.png', ROOT + 'plaza-disc.png'
DISC_U = 21.0          # the decal's radius, u (kit.json setpiece.plaza-disc footprint / 2)
STRIPES = (11.8, 63.3, 119.6, 169.6, -139.5, -89.6, -40.4)   # degrees (x east, y south), measured from the picture
MED_PX = 876           # about where the medallions sit on the stripes now (px from the centre); each is found by its look
MED_R = 13.3           # where they go: u from the centre, at each channel's outer end
MED_SCALE = 0.75
TURN = 25.0            # degrees the filling picture is turned
MED_RIM = 63           # a medallion's radius in the picture, px


def find_medallion(gray, gx, gy, half=56, reach=70):
    """The medallion nearest (gx, gy): the best match, by normalised correlation, for the north one (on the centre line)."""
    c = gray.shape[0] // 2
    T = gray[148 - half:148 + half, c - half:c + half]; T = (T - T.mean()) / T.std()
    best = None
    for dy in range(-reach, reach + 1, 2):
        for dx in range(-reach, reach + 1, 2):
            x, y = int(gx + dx), int(gy + dy); W = gray[y - half:y + half, x - half:x + half]
            if W.shape != T.shape: continue
            s = ((W - W.mean()) / (W.std() + 1e-6) * T).mean()
            if best is None or s > best[0]: best = (s, x, y)
    return best[1], best[2]


def main():
    src = Image.open(SRC).convert('RGB')
    im = np.asarray(src).astype(float); N = im.shape[0]; c = N / 2
    yy, xx = np.mgrid[0:N, 0:N].astype(float); r = np.hypot(xx - c, yy - c)
    stone = np.array([236., 153., 108.])
    diff = np.abs(im - stone).sum(-1)
    mask = np.zeros((N, N), bool)
    gray = np.asarray(src.convert('L')).astype(float)
    meds = []
    for a in STRIPES:
        t = math.radians(a); dx, dy = math.cos(t), math.sin(t)
        # the stripe's own line (a few are a little off the centre): its centre across, at several radii
        offs = []
        for rad in range(420, 820, 20):
            o = np.arange(-60, 61)
            px, py = c + rad * dx - o * dy, c + rad * dy + o * dx
            v = np.clip(diff[py.astype(int), px.astype(int)] - 60, 0, None)
            if v.sum() > 0: offs.append((v * o).sum() / v.sum())
        off = float(np.median(offs))
        along = (xx - c) * dx + (yy - c) * dy; across = -(xx - c) * dy + (yy - c) * dx - off
        mask |= (np.abs(across) < 46) & (along > 300)
        mc = find_medallion(gray, c + MED_PX * dx - off * dy, c + MED_PX * dy + off * dx)
        mask |= np.hypot(xx - mc[0], yy - mc[1]) < 74
        meds.append((a, mc))
        cs = [im[int(c + rr * dy + oo * dx), int(c + rr * dx - oo * dy)] for rr in range(400, 700, 4) for oo in range(-15, 16, 5)]
        print('stripe %6.1f  off %5.1f px  colour #%02x%02x%02x' % ((a, off) + tuple(int(v) for v in np.median(np.array(cs), 0))))
    mask &= r < c - 2                      # (outside the disc the decal is clipped anyway)
    turned = np.asarray(src.rotate(TURN, resample=Image.BICUBIC, center=(c, c))).astype(float)
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(float)[..., None] / 255
    out = im * (1 - soft) + turned * soft
    out = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    # the medallions, cut out round with a soft edge, shrunk, set at each channel's end
    R = 70; R2 = int(R * MED_SCALE)
    yy2, xx2 = np.mgrid[0:2 * R, 0:2 * R]; d = np.hypot(xx2 - R + 0.5, yy2 - R + 0.5)
    alpha = Image.fromarray((np.clip((MED_RIM - d) / 2, 0, 1) * 255).astype(np.uint8))
    for a, (mx, my) in meds:
        crop = src.crop((int(mx) - R, int(my) - R, int(mx) + R, int(my) + R))
        crop = crop.resize((2 * R2, 2 * R2), Image.LANCZOS); al = alpha.resize((2 * R2, 2 * R2), Image.LANCZOS)
        t = math.radians(a); rp = MED_R / DISC_U * c
        nx, ny = c + rp * math.cos(t), c + rp * math.sin(t)
        out.paste(crop, (int(round(nx - R2)), int(round(ny - R2))), al)
    out.save(OUT)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
