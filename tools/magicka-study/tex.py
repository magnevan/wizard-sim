"""Decode an XNA Texture2D .xnb to PNG (study only): python -I tex.py <in.xnb> <out.png>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lzx import xnb_payload
from PIL import Image


def r7(b, p):
    v = 0; s = 0
    while True:
        x = b[p]; p += 1; v |= (x & 0x7F) << s; s += 7
        if not x & 0x80:
            return v, p


def rstr(b, p):
    n, p = r7(b, p); return b[p:p + n].decode('utf-8', 'replace'), p + n


def u32(b, p): return int.from_bytes(b[p:p + 4], 'little'), p + 4


def c565(c):
    r = (c >> 11) & 31; g = (c >> 5) & 63; bl = c & 31
    return (r * 255 // 31, g * 255 // 63, bl * 255 // 31)


def dxt(data, w, h, kind):
    img = Image.new('RGBA', (w, h)); px = img.load()
    bs = 8 if kind == 1 else 16; p = 0
    for by in range(0, h, 4):
        for bx in range(0, w, 4):
            blk = data[p:p + bs]; p += bs
            alpha = [255] * 16
            cb = blk
            if kind == 3:
                bits = int.from_bytes(blk[:8], 'little')
                alpha = [((bits >> (4 * i)) & 15) * 17 for i in range(16)]; cb = blk[8:]
            elif kind == 5:
                a0, a1 = blk[0], blk[1]; bits = int.from_bytes(blk[2:8], 'little')
                if a0 > a1:
                    pal = [a0, a1] + [((7 - i) * a0 + i * a1) // 7 for i in range(1, 7)]
                else:
                    pal = [a0, a1] + [((5 - i) * a0 + i * a1) // 5 for i in range(1, 5)] + [0, 255]
                alpha = [pal[(bits >> (3 * i)) & 7] for i in range(16)]; cb = blk[8:]
            c0 = int.from_bytes(cb[0:2], 'little'); c1 = int.from_bytes(cb[2:4], 'little')
            r0, r1 = c565(c0), c565(c1)
            if c0 > c1 or kind != 1:
                cols = [r0, r1, tuple((2 * a + b) // 3 for a, b in zip(r0, r1)), tuple((a + 2 * b) // 3 for a, b in zip(r0, r1))]
                trans = False
            else:
                cols = [r0, r1, tuple((a + b) // 2 for a, b in zip(r0, r1)), (0, 0, 0)]; trans = True
            idx = int.from_bytes(cb[4:8], 'little')
            for i in range(16):
                k = (idx >> (2 * i)) & 3; x = bx + (i & 3); y = by + (i >> 2)
                if x < w and y < h:
                    a = 0 if (trans and k == 3) else alpha[i]
                    px[x, y] = (*cols[k], a)
    return img


def main(src, dst):
    raw = open(src, 'rb').read()
    b = xnb_payload(raw)
    p = 0
    nreaders, p = r7(b, p)
    for _ in range(nreaders):
        name, p = rstr(b, p); _, p = u32(b, p)
        print('reader', name)
    _, p = r7(b, p)   # shared resources
    _, p = r7(b, p)   # type id
    is3d = 'Texture3D' in name
    fmt, p = u32(b, p); w, p = u32(b, p); h, p = u32(b, p)
    depth = 1
    if is3d:
        depth, p = u32(b, p)
    mips, p = u32(b, p)
    size, p = u32(b, p)
    data = b[p:p + size]
    print('format', fmt, w, h, 'depth', depth, 'mips', mips, 'bytes', size)
    if depth > 1:
        per = size // depth
        kind = {28: 1, 30: 3, 32: 5, 4: 1, 5: 3, 6: 5}.get(fmt)
        cols = 8; rows = (depth + cols - 1) // cols
        sheet = Image.new('RGBA', (w * cols, h * rows))
        import numpy as np
        vol = np.frombuffer(data[:w * h * depth * 4], dtype=np.uint8)
        order = sys.argv[3] if len(sys.argv) > 3 else 'zfast'
        vol = vol.reshape((h, w, depth, 4)).transpose(2, 0, 1, 3) if order == 'zfast' else vol.reshape((depth, h, w, 4))
        for z in range(depth):
            im = Image.fromarray(np.ascontiguousarray(vol[z]), 'RGBA')
            if not kind and fmt == 1:
                r_, g_, b_, a_ = im.split(); im = Image.merge('RGBA', (b_, g_, r_, a_))
            sheet.paste(im, ((z % cols) * w, (z // cols) * h))
        sheet.save(dst); print('wrote', dst, depth, 'slices'); return
    # XNA 3.1 SurfaceFormat: Color=1, Dxt1=28, Dxt3=30, Dxt5=32; XNA 4: Color=0, Dxt1=4, Dxt3=5, Dxt5=6
    kind = {28: 1, 30: 3, 32: 5, 4: 1, 5: 3, 6: 5}.get(fmt)
    if kind:
        img = dxt(data, w, h, kind)
    else:
        img = Image.frombytes('RGBA', (w, h), data[:w * h * 4])
        if fmt == 1:  # XNA 3.1 Color is BGRA
            r_, g_, b_, a_ = img.split(); img = Image.merge('RGBA', (b_, g_, r_, a_))
    img.save(dst)
    print('wrote', dst)


main(sys.argv[1], sys.argv[2])
