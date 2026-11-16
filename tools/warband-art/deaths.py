"""Code-driven deaths on a bought sprite: the game's death styles (game/packages/client/src/art/deaths.ts)
applied to the sprite's own pixels, as a looping GIF and a frame strip, to judge before porting.
usage: python tools/warband-art/deaths.py <sprite.png> <out.gif> [<strip.png>]

  topple   knocked back along the blow, tips over stiffly about its feet, lies a beat, a cartoon poof
  fire     stays on its feet, flames lick up off its top edges, chars, crumbles to an ash heap
  shatter  frozen blue, tips over like a plank, breaks into shards on landing, a puff of snow
  arcane   seams of violet light split it into small pieces that drift apart and unravel
"""
import sys, math, random
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
STRIP = sys.argv[3] if len(sys.argv) > 3 else None
spr = Image.open(SRC).convert('RGBA')
bb = spr.getbbox()
spr = spr.crop(bb)
SW, SH = spr.size
P = spr.load()
PX = [(x, y, P[x, y][:3]) for y in range(SH) for x in range(SW) if P[x, y][3] > 127]
FPS, DUR = 20, 1.8
CW, CH = 96, 64          # one cell per death
FEET = (CW // 2 + 6, 50)  # where the feet stand; the blow comes from the right, so it falls left
GROUND = (112, 86, 60)

def clamp(v, a, b): return max(a, min(b, v))
def seg(t, a, b): return clamp((t - a) / (b - a), 0, 1)
def ease_out(k): return 1 - (1 - k) * (1 - k)
def smooth(k): return k * k * (3 - 2 * k)
def hop(t, t0, h, d): k = seg(t, t0, t0 + d); return h * 4 * k * (1 - k) if 0 < k < 1 else 0
def mix(a, b, k): return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))

def put(img, x, y, col, a=255):
    x, y = math.floor(x + 0.5), math.floor(y + 0.5)
    if 0 <= x < img.width and 0 <= y < img.height and a > 0:
        if a >= 255: img.putpixel((x, y), col + (255,))
        else:
            o = img.getpixel((x, y)); k = a / 255
            img.putpixel((x, y), mix(o[:3], col, k) + (255,))

def body(img, ox, oy, ang=0.0, tint=None, tk=0.0, flash=False, skip=None):
    """Draw the sprite with its feet at (ox, oy), turned by ang about the feet (sampling back, no holes)."""
    pv = (SW // 2, SH - 1)
    if ang == 0:
        for (x, y, c) in PX:
            if skip and skip(x, y): continue
            col = (255, 255, 255) if flash else (mix(c, tint, tk) if tint else c)
            put(img, ox + x - pv[0], oy + y - pv[1], col)
        return
    M = {(x, y): c for (x, y, c) in PX}
    cs, sn = math.cos(ang), math.sin(ang); R = int(math.hypot(SW, SH)) + 1
    for dy in range(-R, 2):
        for dx in range(-R, R + 1):
            sx = round(dx * cs + dy * sn + pv[0]); sy = round(-dx * sn + dy * cs + pv[1])
            c = M.get((sx, sy))
            if c is None: continue
            col = (255, 255, 255) if flash else (mix(c, tint, tk) if tint else c)
            put(img, ox + dx, oy + dy, col)

POOF = [(250, 248, 240), (220, 216, 210), (170, 166, 166), (120, 116, 120)]
def poof(img, cx, cy, e, R=10, seed=0, cols=POOF):
    rnd = random.Random(seed)
    for k in range(9):
        a = k / 9 * math.tau + rnd.random() * 0.5; r = R * (0.35 + 0.65 * ease_out(e)) * (0.6 + 0.4 * rnd.random())
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.6 - e * 4
        rad = (3.4 - 2.4 * e) * (0.7 + 0.5 * rnd.random())
        col = cols[min(len(cols) - 1, int(e * len(cols)))]
        for j in range(-4, 5):
            for i in range(-4, 5):
                if i * i + j * j <= rad * rad and (e < 0.55 or (i + j + k) % 2 == 0): put(img, x + i, y + j, col)

# ---------------------------------------------------------------------------- the four deaths
def topple(img, t):
    side = -1
    kb = 6 * ease_out(seg(t, 0, 0.3)); z = hop(t, 0, 4, 0.3) + hop(t, 0.62, 1.5, 0.14)
    k = seg(t, 0.12, 0.58); ang = 0.12 * math.sin(t * 45) * (1 - t / 0.12) if t < 0.12 else side * (math.pi / 2) * k * k * k
    ox, oy = FEET[0] + side * kb, FEET[1] - z
    if t < 1.15: body(img, ox, oy, ang, flash=t < 0.06)
    if t > 1.1: poof(img, ox + side * 10, FEET[1] - 4, seg(t, 1.1, 1.55), 11, 3)

FLAME = [(255, 246, 200), (255, 214, 96), (255, 150, 48), (226, 82, 32), (120, 30, 20)]
def fire(img, t):
    ox, oy = FEET
    char = smooth(seg(t, 0.2, 0.85)); crumble = seg(t, 0.9, 1.5)
    tops = {}
    for (x, y, c) in PX:
        if (x, y - 1) not in tops and y == min(yy for (xx, yy, _) in PX if xx == x): tops[(x, y)] = 1
    rnd = random.Random(7)
    order = sorted(PX, key=lambda p: (rnd.random() * 0.5 + (SH - p[1]) / SH * 0.5))
    for i, (x, y, c) in enumerate(order):
        fall_at = i / len(order)
        sx, sy = ox + x - SW // 2, oy + y - SH + 1
        col = mix(c, (40, 26, 22), char * 0.85)
        if crumble > 0 and fall_at < crumble:
            k = seg(crumble, fall_at, min(1, fall_at + 0.35))
            col = mix(col, (130, 124, 120), k)
            dy = (oy - sy) * smooth(k); dx = (rnd.random() - 0.5) * 6 * k
            if k >= 1: continue
            put(img, sx + dx, sy + dy, col)
        else:
            put(img, sx, sy, (255, 255, 255) if t < 0.06 else col)
    # ash heap growing at the feet
    heap = crumble
    for i in range(-9, 10):
        h = heap * 4 * (1 - (i / 10) ** 2)
        for j in range(int(h)): put(img, ox + i, oy - j, (96, 90, 88) if (i + j) % 3 else (140, 134, 128))
    # flames off the top edges, flickering, fading as the body crumbles
    if 0.05 < t < 1.25:
        fk = seg(t, 0.05, 0.25) * (1 - seg(t, 0.95, 1.25))
        f = int(t * FPS)
        for (x, y) in list(tops)[::2]:
            hgt = (2 + ((x * 7 + f * 3) % 5)) * fk * (1 + char)
            for j in range(int(hgt)):
                put(img, ox + x - SW // 2 + ((j + f + x) % 3 - 1) * (j > 1), oy + y - SH - j, FLAME[min(4, int(j / max(1, hgt) * 5))])

ICE = (168, 226, 255)
def shatter(img, t):
    side = -1
    ox, oy = FEET
    frz = seg(t, 0, 0.2); k = seg(t, 0.25, 0.62); ang = side * (math.pi / 2) * k * k * k
    if t < 0.64:
        body(img, ox, oy, ang, tint=ICE, tk=0.55 * frz, flash=t < 0.05)
        return
    # break the lying body into 3x3 shards that fly out and fall
    tb = t - 0.64
    rnd = random.Random(11)
    M = {}
    cs, sn = math.cos(ang), math.sin(ang)
    for (x, y, c) in PX:
        dx, dy = x - SW / 2, y - (SH - 1)
        rx, ry = dx * cs - dy * sn, dx * sn + dy * cs
        M.setdefault((x // 3, y // 3), []).append((rx, ry, mix(c, ICE, 0.55)))
    for key, pts in M.items():
        r = random.Random(hash(key) & 0xffff)
        mx = sum(p[0] for p in pts) / len(pts); vx = mx * 0.18 + (r.random() - 0.5) * 5
        vy = -(2 + r.random() * 5)
        x0, y0 = vx * tb * 6, vy * tb * 6 + 30 * tb * tb
        y0 = min(y0, 2)
        a = 255 - int(255 * seg(tb, 0.45, 0.9))
        for (rx, ry, c) in pts: put(img, ox + rx + x0, oy + ry + y0, mix(c, (255, 255, 255), 0.2 if (rx + ry) % 4 < 1 else 0), a)
    if tb < 0.5: poof(img, ox - 8, oy - 3, seg(tb, 0, 0.5), 9, 5, [(255, 255, 255), (220, 240, 255), (180, 220, 250), (150, 200, 240)])

VIOLET = [(255, 240, 255), (230, 170, 255), (180, 110, 240), (120, 70, 190)]
def arcane(img, t):
    ox, oy = FEET
    rnd = random.Random(5)
    seeds = [(rnd.uniform(0, SW), rnd.uniform(0, SH)) for _ in range(22)]
    own = {}
    for (x, y, c) in PX:
        own[(x, y)] = min(range(len(seeds)), key=lambda i: (x - seeds[i][0]) ** 2 + (y - seeds[i][1]) ** 2)
    seam = seg(t, 0.08, 0.45); drift = smooth(seg(t, 0.5, 1.5)); fade = seg(t, 0.8, 1.55)
    for (x, y, c) in PX:
        i = own[(x, y)]; sx, sy = seeds[i]
        r = random.Random(i)
        on_seam = any(own.get((x + a, y + b), i) != i for a, b in ((1, 0), (0, 1)))
        d = drift * (3 + r.random() * 5)
        ang = math.atan2(sy - SH * 0.6, sx - SW / 2) + (r.random() - 0.5)
        px_, py_ = ox + x - SW // 2 + math.cos(ang) * d, oy + y - SH + 1 + math.sin(ang) * d - drift * 4
        if r.random() < fade * 1.2 + (y % 2) * fade * 0.3: continue
        col = c
        if on_seam and seam > 0: col = mix(c, VIOLET[1], seam)
        if drift > 0: col = mix(col, VIOLET[2], drift * 0.5)
        put(img, px_, py_, (255, 255, 255) if t < 0.05 else col)
    if t > 0.5:
        f = int(t * FPS)
        for k in range(10):
            r = random.Random(k * 31 + f)
            put(img, ox + r.uniform(-14, 14), oy - r.uniform(0, 34) - (t - 0.5) * 10, VIOLET[r.randrange(3)])

DEATHS = [('topple', topple), ('fire', fire), ('shatter', shatter), ('arcane', arcane)]

def ground():
    g = Image.new('RGBA', (CW * len(DEATHS), CH), GROUND + (255,))
    gp = g.load(); r = random.Random(1)
    for _ in range(g.width * g.height // 14):
        x, y = r.randrange(g.width), r.randrange(g.height); gp[x, y] = (96, 74, 52, 255) if r.random() < 0.6 else (134, 106, 76, 255)
    return g

base = ground()
frames = []
n = int(DUR * FPS) + 8
for f in range(n):
    t = min(f / FPS, DUR)
    img = base.copy()
    for i, (_, fn) in enumerate(DEATHS):
        cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0)); cell.paste(img.crop((i * CW, 0, (i + 1) * CW, CH)))
        fn(cell, t if f < DUR * FPS else DUR)
        img.paste(cell, (i * CW, 0))
    frames.append(img)
S = 4
big = [fr.resize((fr.width * S, fr.height * S), Image.NEAREST).convert('P', palette=Image.ADAPTIVE, colors=255) for fr in frames]
big[0].save(OUT, save_all=True, append_images=big[1:], duration=1000 // FPS, loop=0, disposal=2)
if STRIP:
    picks = [0, 3, 6, 9, 12, 16, 20, 25, 30, 35]
    st = Image.new('RGBA', (CW * len(DEATHS) * 3, CH * len(picks) * 3 // 2))
    rows = [frames[min(p, n - 1)] for p in picks]
    st = Image.new('RGBA', (base.width, CH * len(rows)))
    for j, fr in enumerate(rows): st.paste(fr, (0, j * CH))
    st.resize((st.width * 3, st.height * 3), Image.NEAREST).save(STRIP)
print(len(frames), 'frames')
