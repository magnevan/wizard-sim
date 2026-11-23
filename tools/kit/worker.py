"""The map editor's compile worker: a long-lived process, so each edit compiles without Python's start-up.

  python -u tools/kit/worker.py

One JSON request per line on stdin, {"id": n, "scene": {...}}; one reply per line on stdout,
{"id": n, "result": {...}, "ms": compile time} or {"id": n, "error": traceback}. Started by the map editor's server
(game/packages/client/map-editor/compile-worker.ts).
"""
import json, os, sys, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compile as C

for line in sys.stdin:
    if not line.strip(): continue
    req = {}
    try:
        req = json.loads(line)
        t = time.perf_counter()
        res = C.compile_scene(req['scene'])
        msg = dict(id=req.get('id'), result=res, ms=round((time.perf_counter() - t) * 1000))
    except Exception:
        msg = dict(id=req.get('id'), error=traceback.format_exc())
    sys.stdout.write(json.dumps(msg, separators=(',', ':')) + '\n'); sys.stdout.flush()
