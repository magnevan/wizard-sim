"""Scene files (tools/kit/scenes/<name>.scene.json): the map editor's source of truth.

  python tools/kit/scene.py convert patch-b     # an old layout (tools/kit/layouts/patch-b.py) -> scenes/patch-b.scene.json
  python tools/kit/scene.py check patch-b       # compile a scene and print its findings with their places

The format is described in tools/kit/README.md. dump() is the one layout of the file: one terrace, corner row or
object per line, so git diffs stay readable; the map editor's server writes the same layout (map-editor/scene-file.ts).
"""
import json, os, sys
import compile as C

SCENES = os.path.join(C.HERE, 'scenes')


def plain(v):
    """Whole floats as ints (2.0 -> 2), as JavaScript writes them, so both writers give the same file."""
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, list): return [plain(x) for x in v]
    if isinstance(v, dict): return {k: plain(x) for k, x in v.items()}
    return v


def dump(sc):
    sc = plain(sc)
    line = lambda v: json.dumps(v, ensure_ascii=False, separators=(', ', ': '))
    out = ['{']
    keys = [k for k in sc if k not in ('terraces', 'corners', 'objects')]
    for k in keys: out.append(f'  {json.dumps(k)}: {line(sc[k])},')
    for k in ('terraces', 'corners', 'objects'):
        items = sc.get(k, [])
        out.append(f'  {json.dumps(k)}: [')
        out += [f'    {line(v)}' + (',' if i < len(items) - 1 else '') for i, v in enumerate(items)]
        out.append('  ]' + (',' if k != 'objects' else ''))
    out.append('}')
    return '\n'.join(out) + '\n'


def main():
    cmd, name = sys.argv[1], sys.argv[2]
    if cmd == 'convert':
        sc = C.layout_to_scene(name)
        os.makedirs(SCENES, exist_ok=True)
        p = os.path.join(SCENES, name + '.scene.json')
        open(p, 'w', encoding='utf-8', newline='\n').write(dump(sc))
        print(f'wrote {os.path.relpath(p)}')
    elif cmd == 'check':
        r = C.compile_scene(C.load_scene(name))
        print(f"{name}: {len(r['instances'])} instances, {len(r['errors'])} error(s), {len(r['warnings'])} warning(s)")
        for f in r['findings']: print(f"  {'!' if f['severity'] == 'error' else '~'} [{f['code']}] at {f['at']} {f['refs']}: {f['msg']}")
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
