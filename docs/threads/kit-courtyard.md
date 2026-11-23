# The courtyard on the kit (growing the kit by building a map)

Status: active; the courtyard traced with true curves and steps, 0 errors; next: landmarks, piers and facades · Last touched: 2026-11-23
Record: [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid) · the kit: `tools/kit/` ([README](../../tools/kit/README.md)) · [court read](../campaign/01-opening/court-read.md) · plan D: `tools/place-plans/plans/court-d.py` · [the opening thread](opening.md) (the places it's for) · [the map-editor thread](map-editor.md) (editor changes go there, not here)

## Where it stands

The kit is small: 18 pieces in `kit.json`, 7 with fitted Meshy models. It grows by building a real map: the courtyard, the opening's hub. Its structure is already approved: court plan D, rev 17, passed flow and sense at 8/10, so we trace it rather than paint a new layout. Each gap the trace hits becomes a piece or a compiler rule, made once and reused by later places. Gaps in the editor itself (drawing tools, placement) are filed on the [map-editor thread](map-editor.md).

Curves today: a scene's `curve` is a terrace bulging past one straight grid edge along a circle (patch B's fountain bastion). The trace uses those where plan D's arcs fit them. Where they don't (a concave edge, an arc round a corner across several grid edges, a curved stair), it uses chamfers as stand-ins, each with a pin, until step 2.

## Next

The order follows how much of the courtyard each gap blocks.

- [x] **1. Trace plan D into `court.scene.json`** (2026-11-23). `tools/kit/trace_plan.py` re-runs `court-d.py` on the kit's corner lattice: 102 x 81 cells, 33 terraces, the five straight flights. What's left: 8 errors, all real gaps: the dais rings, the hall's stoops and the overlook's treads can't be reached (no step between a kerb and a flight), and the sea stair's -2 m landing is too short for the kit's longer flights. The gaps are 20 pins (`court_pins.py`): 4 set pieces, 3 facades, 6 pier pairs, a curved flight, 3 small-step places, the sea stair, the curves and the floors.
- [x] **2. General curves** (2026-11-23): a `round` object in `compile.py` snaps any edge along a circle onto the true arc, convex or concave. The trace emits one per circle plan D draws (25 kept), so every arc in the courtyard is a curve. Rounds that touch thousands of cells use a spatial index (the courtyard compiles in about 1 s in the editor). Asked of the Map Editor session: a tool to draw and edit rounds.
- [x] **3 (part). Small steps** (2026-11-23): a `steps` edge, a drop of 0.3 to 1 m you can step over anywhere (the dais rings, the sunk plaza, the stoops, the overlook's treads); over 1 m it is a parapet. Same-height levels meet in a seam with no edge piece. The courtyard has 0 errors. Asked of the Map Editor session: draw the step pieces (outlines now). A true curved flight is still open, if the rim's south opening needs one.
- [ ] **4. Set pieces** (a new kit class: one unique Meshy model on a footprint the compiler keeps clear): the armillary, the great hall's front, the bell tower, the beacon and the pylons. Each one: Codex picture, then Meshy, then `fit.py`.
- [ ] **5. Water and the sea edge**: a water terrace, a quay edge and a cliff face (the inlet, the quay at -5 m, the falls).
- [ ] **6. Spans**: the bridge over the inlet as a deck piece between two terraces.
- [ ] **7. Dressing pass**: a loose Codex paint-over of the courtyard's greybox gives the dressing (niches, lamps, planters, floor channels to the exits). The pieces it asks for join the kit.
- [ ] Then the yard and the infirmary on the kit. They should need far fewer new pieces.

## Done

- 2026-11-23: the plan above.
