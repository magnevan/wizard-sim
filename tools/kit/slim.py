"""Slims the fitted kit models: re-encodes their textures smaller, in place. Run after fit.py.

  python tools/kit/slim.py [model.glb ...]      (default: every game/content/generated/meshy/kit/*.glb)

Meshy gives 2K PBR maps, mostly PNG: about 8 to 18 MB a model, nearly all texture. At the game camera that detail
is never seen. Base colour becomes JPEG at 2048 px for the landmark buildings (BIG) and 1024 px for the rest; the
normal and metal-roughness maps half that. A base colour whose material uses alpha (MASK/BLEND) stays PNG.
Meshes are untouched. Already-slim images are left as they are, so running it twice changes nothing.
"""
import glob, io, json, os, struct, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
KIT = os.path.join(ROOT, 'game', 'content', 'generated', 'meshy', 'kit')
BIG = {'great-hall', 'library', 'workshops', 'hall-half', 'battery-tower', 'bell-tower', 'armillary', 'gate-tower'}


def roles(j):
    """image index -> (role, uses alpha)"""
    out = {}
    def img(t): return j['textures'][t['index']]['source']
    for m in j.get('materials', []):
        a = m.get('alphaMode', 'OPAQUE') != 'OPAQUE'
        pbr = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pbr: out[img(pbr['baseColorTexture'])] = ('base', a)
        if 'metallicRoughnessTexture' in pbr: out.setdefault(img(pbr['metallicRoughnessTexture']), ('mr', False))
        if 'normalTexture' in m: out.setdefault(img(m['normalTexture']), ('normal', False))
        if 'emissiveTexture' in m: out.setdefault(img(m['emissiveTexture']), ('base', False))
        if 'occlusionTexture' in m: out.setdefault(img(m['occlusionTexture']), ('mr', False))
    return out


def encode(data, mime, role, alpha, size):
    im = Image.open(io.BytesIO(data))
    side = size if role == 'base' else size // 2
    want_png = role == 'base' and alpha
    if max(im.size) <= side and (mime == 'image/jpeg') != want_png:
        return data, mime
    if max(im.size) > side:
        im = im.resize((side, side * im.size[1] // im.size[0]), Image.LANCZOS)
    buf = io.BytesIO()
    if want_png:
        im.save(buf, 'PNG', optimize=True); return buf.getvalue(), 'image/png'
    im.convert('RGB').save(buf, 'JPEG', quality=90 if role == 'normal' else 85, optimize=True)
    return buf.getvalue(), 'image/jpeg'


def slim(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
    bin_ = b[20 + n + 8:]
    views = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    size = 2048 if os.path.splitext(os.path.basename(path))[0] in BIG else 1024
    for i, (role, alpha) in roles(j).items():
        im = j['images'][i]
        if 'bufferView' not in im: continue
        views[im['bufferView']], im['mimeType'] = encode(views[im['bufferView']], im.get('mimeType'), role, alpha, size)
    out = bytearray()
    for v, data in zip(j['bufferViews'], views):
        out += b'\0' * (-len(out) % 4)
        v['byteOffset'] = len(out); v['byteLength'] = len(data); out += data
    out += b'\0' * (-len(out) % 4)
    j['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    open(path, 'wb').write(glb)
    return len(b), len(glb)


if __name__ == '__main__':
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(KIT, '*.glb')))
    tot = [0, 0]
    for f in files:
        a, z = slim(f); tot[0] += a; tot[1] += z
        print(f'{os.path.basename(f):24} {a / 1e6:5.1f} -> {z / 1e6:5.1f} MB')
    print(f'{"total":24} {tot[0] / 1e6:5.1f} -> {tot[1] / 1e6:5.1f} MB')
