# The courtyard on the kit (growing the kit by building a map)

Status: active; textured, with its buildings, radial plaza floor and paint-overs, 0 errors; now: dressing from the paint-overs, then the sea edge · Last touched: 2026-11-24
Record: [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid) · the kit: `tools/kit/` ([README](../../tools/kit/README.md)) · [court read](../campaign/01-opening/court-read.md) · plan D: `tools/place-plans/plans/court-d.py` · [the opening thread](opening.md) (the places it's for) · [the map-editor thread](map-editor.md) (editor changes go there, not here)

## Where it stands

The kit grows by building a real map: the courtyard, the opening's hub, traced from court plan D (rev 17, passed flow and sense at 8/10) into `tools/kit/scenes/court.scene.json`. Since the trace the scene is the source: edits go through the editor (`cli.mjs`), not a re-run of `trace_plan.py`. The user reviews it in the editor and pins faults; each one becomes a scene fix, a compiler rule or a piece. Work on this branch (`court-kit`, its own worktree); the editor is built on `kit-clean` by a separate session and merged in freely.

How things are made: pictures in Codex (free), models through the Meshy API (standard 7.1 for anything seen all round: smart topology left holes; the website only for a piece that fails twice), fitted in Blender (`fit.py`, which welds, fills holes and keeps proportions), the armillary assembled by `armillary.py` (five rings on spin nodes the editor turns).

## Next

- [ ] **Dressing from the paint-overs**: flower boxes, banners, small trees in planters, lamps along the balcony road, violet cracks; these are vignettes or set pieces.
- [ ] **Water and the sea edge**: a quay edge and a cliff piece (the inlet, the falls). **Spans**: the bridge over the inlet.
- [ ] **Slim the models** before shipping: about 100 MB of 2K PBR textures.
- [ ] Then the yard and the infirmary on the kit. They should need far fewer new pieces.

## Done

- 2026-11-24: the great hall as one set piece, its open archway carrying the north road (p5; 30 credits). All building pins closed.
- 2026-11-24: round 3 and the user's ideas: tiling textures from Codex for every floor, wall, kerb and step (`textures.py`; the renderer draws them in world space, so no seams: p27, p29, p32); paint-overs of our own grey-box as the art target (`docs/reference/court-kit/`, on the map's Concepts); the plaza's radial floor as a `decal` laid over the floor and the ring of steps (channels to medallions, clipped to the steps' height); the niche remade with a solid recess (`fit.py` got `flip`); the library, workshops and two hall halves as set pieces from the paint-overs (`turn` lets a set piece face any way; 90 credits); `line` objects, the sunk plaza's south edge, the overlook's prow (p26, p28, p30, p31, p33). The trade-off taken: unique building set pieces for the hub's three landmark buildings, not modular facades, which the yard and infirmary may still need.
- 2026-11-24: the user's pins, round 2: the armillary rebuilt with five closed band rings that turn (p22; a seam-split mesh decimated had torn holes, now welded first); the beacon remade watertight (p23); railings meet posts (p25: a corner's post is the higher run's, and the renderer starts curved sections at their pier's face); the overlook and the sunk plaza as single levels with one run of steps (p24, p26, p30), and `steps-runout` (an error when steps have no room for their treads); `line` objects snap edges to a straight line at any angle (p33: plan D's radial band ends).
- 2026-11-23: the set-piece class and all eight set pieces modelled (135 credits); the user's pins, round 1.
- 2026-11-23: plan D traced; general curves (`round`), small steps (`steps`), one sea level, same-height seams.
- 2026-11-23: the plan.
