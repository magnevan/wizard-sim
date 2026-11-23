"""Test patch A (2026-11-23): a corner of a courtyard, to test building from a kit of made pieces on a corner grid.

A layout is data an LLM can write: one character per grid CORNER (not per cell), each naming a terrace; the
compiler draws every cell from the made piece for its four corners (tools/kit/compile.py). Flights, curved edges,
doors and vignettes are named, never drawn.
"""
G = 2.0   # u per cell (1 u = 0.6 m)

TERRACES = {
    'B': dict(h=10.0, mat='roof', edge='wall', name='the hall'),          # a building: its roof at 10 m, walls down to whatever is below
    'U': dict(h=3.0, mat='paving', edge='parapet', name='the terrace'),
    'L': dict(h=0.4, mat='lawn', edge='retain', walk=False, name='a lawn bed'),
    'P': dict(h=0.0, mat='plaza', edge='retain', name='the plaza'),
    'R': dict(h=-0.15, mat='road', edge='kerb', name='the road'),
}

CORNERS = """
BBBBBBBBBBBBBBBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBB
UUUUUUUUUUUUUUUUUUUUUUUUU
UUUUUUUUUUUUUUUUUUUUUUUUU
UUUUUUUUUUUUUUUUUUUUUUUUU
UUUUUUUUUUUUUUUUUUUUUUUUU
PUUUUUUUUUUUUUUUUUUUUUUUU
PPUUUUUUUUUUUUUUUUUUUUUUU
PPPPPPPPPPPPPPPPPPPPPPPPP
PPPPPPPPPPPPPPPPPPPPPPPPP
PPPPPPPPPPPPPPPPPPPPPPPPP
PPLLLPPPPPPPPPPPPPPPPPPPP
PLLLLLPPPPPPPPPPPPPPPPPPP
PLLLLLPPPPPPPPPPPPPPPPPPP
PPLLLPPPPPPPPPPPPPPPPPPPP
RPPPPPPPPPPPPPPPPPPPPPPPP
RRPPPPPPPPPPPPPPPPPPPPPPR
RRRRRRRRRRRRRRRRRRRRRRRRR
RRRRRRRRRRRRRRRRRRRRRRRRR
RRRRRRRRRRRRRRRRRRRRRRRRR
"""

# a flight: its head is a stretch of a terrace's edge (two vertices on it, in cells), and it runs out from there
FLIGHTS = [dict(name='the terrace stair', head=((7, 8.5), (11, 8.5)), out='S', top='U', bottom='P')]

# curved edges: a terrace bulging out past its grid edge along a circle; both ends must be vertices on that edge
CURVES = [dict(name='the bastion', terrace='U', centre=(18, 8.5), r=3, ends=((15, 8.5), (21, 8.5)), out='S')]

DOORS = [dict(name='the hall door', at=(12.5, 2.5))]

VIGNETTES = [
    dict(piece='vignette.bench-planter', at=(17, 6.5), front='S'),   # on the terrace, looking out over the parapet
    dict(piece='vignette.lamp', at=(12.5, 15.5), front='S'),
    dict(piece='vignette.lamp', at=(5.5, 15.5), front='S'),
]
