"""The courtyard trace's gap list as map-editor pins (tools/kit/scenes/court.pins.json), one per missing thing.

  python tools/kit/court_pins.py        # only right after a fresh trace (trace_plan.py court-d court); later, pins live in the editor

Each pin says what plan D has there and what the kit lacks (a piece, a rule or a scene fix). Positions are corners.
Kept by hand: the trace can't name piers from their sizes, so this file does (from court-d.py's comments).
"""
import json, os
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PINS = [
    # set pieces (a new kit class: one unique model on a footprint)
    ((47.5, 40.0), 'SET PIECE: the armillary, about 10 m, the landmark. Needs the set-piece class (a unique Meshy model on a footprint the compiler keeps clear).'),
    ((39.0, 15.0), 'SET PIECE: the bell tower (15 m), the marker at the balcony road\'s west turn. A plain wall box for now.'),
    ((56.0, 15.0), 'SET PIECE: the beacon (13 m), the marker at the east turn. Missing: too small to trace as a box.'),
    ((80.5, 10.0), 'SET PIECE: the battery tower (14 m), beside the battery road. A plain wall box for now.'),
    # facades
    ((47.5, 17.0), 'FACADE: the great hall (16 m), with the north road passing through it and a stoop at each door. Now a plain wall box with no passage; it needs a gateway piece (an arch through a wall) and its facade.'),
    ((28.5, 33.0), 'FACADE: the library (9 m), door mid-face toward the plaza. A plain wall box for now.'),
    ((66.5, 33.0), 'FACADE: the workshops (9 m), door mid-face toward the plaza. A plain wall box for now.'),
    # piers and pylons
    ((47.5, 9.0), 'PIERS: the north gate\'s towers (8 m), a pair either side of the north road. Missing: a tall pier or gate-tower piece.'),
    ((47.5, 49.0), 'PIERS: the rim\'s gateway, a matched round pair (5 m) framing the sea stair. Missing: a free-standing round pier piece.'),
    ((66.0, 16.0), 'PIERS: the battery road\'s gate, a matched round pair (5 m) square across the road. Missing: the same round pier.'),
    ((24.5, 16.0), 'PIERS: the drill yard\'s gate piers (4 m). Missing: a square gate pier.'),
    ((33.0, 16.0), 'PIERS: threshold pillars (5 m) where the balcony road meets each seam (here and at the east end). Missing: the round pier.'),
    ((51.0, 33.0), 'PIERS: the overlook\'s low prow posts (2.5 m). Missing: a short post; could be joint.pier, taller.'),
]

now = datetime.now(timezone.utc).isoformat()
path = os.path.join(HERE, 'scenes', 'court.pins.json')
old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'next': 1, 'pins': []}
keep = [p for p in old['pins'] if not (p['author'] == 'claude' and p['status'] == 'open' and p.get('trace'))]
n = old['next']
for (x, y), note in PINS:
    keep.append(dict(id=f'p{n}', note=note, author='claude', rev=0, status='open', seen=True, time=now, anchor=dict(x=x, y=y), thread=[], trace=True))
    n += 1
json.dump({'next': n, 'pins': keep}, open(path, 'w', encoding='utf-8', newline='\n'), indent=1)
open(path, 'a', encoding='utf-8', newline='\n').write('\n')
print(f'{path}: {len(PINS)} trace pins')
