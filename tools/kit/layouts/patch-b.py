"""Test patch B (2026-11-23): traced by hand from a free Codex painting (paint first, then trace), to test whether
the corner grid can follow a creative layout. The painting: tools/concept-gen/prompts/2026-11-23-kit-flow/paint-first.txt.

What the painting has that the kit can't say yet (so the trace approximates it):
- its sweeping curved ramp down the right side -> two straight flights via a round landing;
- its road sloping down past the plaza -> a flat road a step below the plaza;
- its plaza's free rounded outline over the cliff -> 45-degree chamfers;
- the round tower, the fountain, the crates -> left out (pieces and vignettes the kit doesn't have).
"""
G = 2.0

TERRACES = {
    'B': dict(h=11.0, mat='roof', edge='wall', name='the hall'),
    'U': dict(h=2.1, mat='paving', edge='parapet', name='the hall terrace'),
    'F': dict(h=1.05, mat='paving', edge='parapet', name='the fountain landing'),
    'L': dict(h=0.4, mat='lawn', edge='retain', walk=False, name='a planted bed'),
    'P': dict(h=0.0, mat='plaza', edge='parapet', name='the plaza'),
    'R': dict(h=-0.6, mat='road', edge='parapet', name='the road'),
    'C': dict(h=-4.0, mat='rock', edge='open', walk=False, name='the cliff below'),
}

CORNERS = """
BBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRRRR
BBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRRRR
BBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRRRR
UUUUUUUUUUUUUUUUUUUUUUUUUUUURRRRRRR
UUUUUUUUUUUUUUUUUUUUUUUUUUUURRRRRRR
UUUUUUUUUUUUUUUUUUUUUUUUUUUURRRRRRR
UUUUUUUUUUUUUUUUUUUUUUUUUUUURRRRRRR
UUUUUUUUUUUUUUUUUUUUUUUUUUUURRRRRRR
UUUUUUUUUUUUUUUUUUUUUUUUUUUURRRRRRR
CPPPPPPPPPPPPPPPPPPPPFFFFFFFRRRRRRR
CCPPPPPPPPPPPPPPPPPPPFFFFFFFRRRRRRR
CCCPPPPPPPPPPPPPPPPPPFFFFFFFRRRRRRR
CCCCPPPPPPPPPPPPPPPPPFFFFFFFRRRRRRR
CCCCPPPPPPPPPPPPPPPPPFFFFFFFRRRRRRR
CCCCPPPPPPPPPPPPPPPPPPPPPPPPRRRRRRR
CCCCPPPPPPPLLLPPPPPPPPPPPPPPRRRRRRR
CCCCPPPPPPLLLLLPPPPPPPPPPPPPRRRRRRR
CCCCPPPPPPPLLLPPPPPPPPPPPPPPRRRRRRR
CCCCPPPPPPPPPPPPPPPPPPPPPPPPRRRRRRR
CCCCPPPPPPPPLLLLPPPPPPPPPPPPRRRRRRR
CCCCCPPPPPPPLLLLPPPPPPPPPPPPRRRRRRR
CCCCCCPPPPPPPPPPPPPPPPPPPPPCRRRRRRR
CCCCCCCCCCCCCCCCCCCCCCCCCCCCRRRRRRR
CCCCCCCCCCCCCCCCCCCCCCCCCCCCRRRRRRR
CCCCCCCCCCCCCCCCCCCCCCCCCCCCRRRRRRR
"""

FLIGHTS = [
    dict(name='the grand stair', head=((13, 8.5), (17, 8.5)), out='S', top='U', bottom='P'),
    dict(name='the fountain stair', head=((22, 8.5), (25, 8.5)), out='S', top='U', bottom='F'),
    dict(name='the fountain steps', head=((20.5, 10), (20.5, 12)), out='W', top='F', bottom='P'),
    dict(name='the road gate', head=((27.5, 16), (27.5, 18)), out='E', top='P', bottom='R'),
]

CURVES = [dict(name='the fountain bastion', terrace='F', centre=(24, 13.5), r=2, ends=((22, 13.5), (26, 13.5)), out='S')]

DOORS = [dict(name='the hall door', at=(15.5, 2.5))]

VIGNETTES = [
    dict(piece='vignette.bench-planter', at=(11, 5.5), front='S'),
    dict(piece='vignette.bench-planter', at=(23, 5.5), front='S'),
    dict(piece='vignette.lamp', at=(10, 13.5), front='S'),
    dict(piece='vignette.lamp', at=(21, 14.5), front='S'),
    dict(piece='vignette.lamp', at=(24, 13.5), front='S'),
]
