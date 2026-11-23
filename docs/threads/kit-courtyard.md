# The courtyard on the kit (growing the kit by building a map)

Status: active, not started; next: trace plan D into a scene · Last touched: 2026-11-23
Record: [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid) · the kit: `tools/kit/` ([README](../../tools/kit/README.md)) · [court read](../campaign/01-opening/court-read.md) · plan D: `tools/place-plans/plans/court-d.py` · [the opening thread](opening.md) (the places it's for) · [the map-editor thread](map-editor.md) (editor changes go there, not here)

## Where it stands

The kit is small: 18 pieces in `kit.json`, 7 with fitted Meshy models. It grows by building a real map: the courtyard, the opening's hub. Its structure is already approved: court plan D, rev 17, passed flow and sense at 8/10, so we trace it rather than paint a new layout. Each gap the trace hits becomes a piece or a compiler rule, made once and reused by later places. Gaps in the editor itself (drawing tools, placement) are filed on the [map-editor thread](map-editor.md).

Curves today: a scene's `curve` is a terrace bulging past one straight grid edge along a circle (patch B's fountain bastion). The trace uses those where plan D's arcs fit them. Where they don't (a concave edge, an arc round a corner across several grid edges, a curved stair), it uses chamfers as stand-ins, each with a pin, until step 2.

## Next

The order follows how much of the courtyard each gap blocks.

- [ ] **1. Trace plan D into `court.scene.json`** with the kit as it is (real curves where they fit, chamfers where they don't). Each missing thing gets a placeholder terrace and a pin naming it. The pins become the gap list, ranked by how much floor each covers. The user walks it in the editor and pins more.
- [ ] **2. General curves** (compiler): concave curves, arcs spanning several edges and corners, any radius. The courtyard is mostly arcs: three curved terraces, a round sunk plaza and the balcony.
- [ ] **3. Curved flights and step rings** (compiler and a tread variant): the dais's two rings and the plaza's ring of steps.
- [ ] **4. Set pieces** (a new kit class: one unique Meshy model on a footprint the compiler keeps clear): the armillary, the great hall's front, the bell tower, the beacon and the pylons. Each one: Codex picture, then Meshy, then `fit.py`.
- [ ] **5. Water and the sea edge**: a water terrace, a quay edge and a cliff face (the inlet, the quay at -5 m, the falls).
- [ ] **6. Spans**: the bridge over the inlet as a deck piece between two terraces.
- [ ] **7. Dressing pass**: a loose Codex paint-over of the courtyard's greybox gives the dressing (niches, lamps, planters, floor channels to the exits). The pieces it asks for join the kit.
- [ ] Then the yard and the infirmary on the kit. They should need far fewer new pieces.

## Done

- 2026-11-23: the plan above.
