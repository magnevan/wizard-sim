"""The map editor's stone layer: a long-lived process that lays a scene's road and paving stone by stone after an edit
(tess_layout.lay_scene), apart from the compile worker so an edit never waits for it.

  python -u tools/kit/stones_worker.py

One JSON request per line on stdin, {"id": n, "name": scene, "compiled": compile.py's result}; one reply per line on
stdout, {"id": n, "path": file or null, "laid": pieces laid, "kept": pieces kept, "ms": time} or {"id": n, "error":
traceback}. Started by the map editor's server (game/packages/client/map-editor/stones.ts).
"""
import json, os, sys, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tess_layout as L

for line in sys.stdin:
    if not line.strip(): continue
    req = {}
    try:
        req = json.loads(line)
        t = time.perf_counter()
        r = L.lay_scene(req['name'], req['compiled'], log=lambda s: sys.stderr.write(s + '\n'))
        msg = dict(id=req.get('id'), **r, ms=round((time.perf_counter() - t) * 1000))
    except Exception:
        msg = dict(id=req.get('id'), error=traceback.format_exc())
    sys.stdout.write(json.dumps(msg, separators=(',', ':')) + '\n'); sys.stdout.flush()
