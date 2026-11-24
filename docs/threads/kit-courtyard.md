# The courtyard on the kit (growing the kit by building a map)

Status: active; the courtyard traced with curves, lines, steps and all set pieces modelled, 0 errors; now: tiling textures and paint-overs of the grey-box (Codex), then facades · Last touched: 2026-11-24
Record: [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid) · the kit: `tools/kit/` ([README](../../tools/kit/README.md)) · [court read](../campaign/01-opening/court-read.md) · plan D: `tools/place-plans/plans/court-d.py` · [the opening thread](opening.md) (the places it's for) · [the map-editor thread](map-editor.md) (editor changes go there, not here)

## Where it stands

The kit grows by building a real map: the courtyard, the opening's hub, traced from court plan D (rev 17, passed flow and sense at 8/10) into `tools/kit/scenes/court.scene.json`. Since the trace the scene is the source: edits go through the editor (`cli.mjs`), not a re-run of `trace_plan.py`. The user reviews it in the editor and pins faults; each one becomes a scene fix, a compiler rule or a piece. Work on this branch (`court-kit`, its own worktree); the editor is built on `kit-clean` by a separate session and merged in freely.

How things are made: pictures in Codex (free), models through the Meshy API (standard 7.1 for anything seen all round: smart topology left holes; the website only for a piece that fails twice), fitted in Blender (`fit.py`, which welds, fills holes and keeps proportions), the armillary assembled by `armillary.py` (five rings on spin nodes the editor turns).

## Next

- [ ] **Textures** (the user, 2026-11-24): tiling textures from Codex for the floors (paving, plaza, road, lawn, rock, deck) and for plain-shape edges (ashlar for retaining walls, smooth stone for treads and kerbs), made seamless by `tools/kit/textures.py` into `game/content/generated/textures/`. Asked of the Map Editor session: floors and simple-shape walls, kerbs and treads drawn with them (fixes pins p27, p29, p32: seams and glitches of repeated Meshy modules).
- [ ] **Paint-overs of our own grey-box** (the user: concept art that matches our layout): three Codex repaints of editor screenshots (the whole court, the plaza, the sea stair), strict on layout (`tools/concept-gen/prompts/2026-11-24-court-paintover/`). They are the art target and the source for the facades and the dressing.
- [ ] **Facades** (pins p5 to p7): the great hall (a passage for the north road), the library and the workshops, from the paint-overs; try the Meshy 3D Agent's credits on this batch, with the user watching the first run.
- [ ] Renderer pins with the Map Editor session: p28 (squashed balustrades on chamfers), p31 (a flight's rail out of line with its balusters).
- [ ] **Water and the sea edge**: a quay edge and a cliff piece (the inlet, the falls). **Spans**: the bridge over the inlet.
- [ ] **Slim the models** before shipping: about 100 MB of 2K PBR textures.
- [ ] Then the yard and the infirmary on the kit. They should need far fewer new pieces.

## Done

- 2026-11-24: the user's pins, round 2: the armillary rebuilt with five closed band rings that turn (p22; a seam-split mesh decimated had torn holes, now welded first); the beacon remade watertight (p23); railings meet posts (p25: a corner's post is the higher run's, and the renderer starts curved sections at their pier's face); the overlook and the sunk plaza as single levels with one run of steps (p24, p26, p30), and `steps-runout` (an error when steps have no room for their treads); `line` objects snap edges to a straight line at any angle (p33: plan D's radial band ends).
- 2026-11-23: the set-piece class and all eight set pieces modelled (135 credits); the user's pins, round 1.
- 2026-11-23: plan D traced; general curves (`round`), small steps (`steps`), one sea level, same-height seams.
- 2026-11-23: the plan.
