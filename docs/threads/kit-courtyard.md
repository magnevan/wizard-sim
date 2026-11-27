# The courtyard on the kit (growing the kit by building a map)

Status: parked for a polish pass (the user, 2026-11-26: "it's smaller so we can skip past it"); saved and merged to main; map work moves to [the infirmary](infirmary-kit.md); laid paving now runs along buildings' walls (main, 336afd8) · Last touched: 2026-11-26
Record: [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid) · the kit: `tools/kit/` ([README](../../tools/kit/README.md)) · [court read](../campaign/01-opening/court-read.md) · plan D: `tools/place-plans/plans/court-d.py` · [the opening thread](opening.md) (the places it's for) · [the map-editor thread](map-editor.md) (editor changes go there, not here)

## Where it stands

The kit grows by building a real map: the courtyard, the opening's hub, traced from court plan D (rev 17, passed flow and sense at 8/10) into `tools/kit/scenes/court.scene.json`. Since the trace the scene is the source: edits go through the editor (`cli.mjs`), not a re-run of `trace_plan.py`. The user reviews it in the editor and pins faults; each one becomes a scene fix, a compiler rule or a piece. Work on this branch (`court-kit`, its own worktree); the editor is built on `kit-clean` by a separate session and merged in freely.

How things are made: pictures in Codex (free), models through the Meshy API (standard 7.1 for anything seen all round: smart topology left holes; the website only for a piece that fails twice), fitted in Blender (`fit.py`, which welds, fills holes and keeps proportions), the armillary assembled by `armillary.py` (five rings on spin nodes the editor turns).

## Next

**For the polish pass** (listed 2026-11-26; the old pixel version's removal and the game's wiring are not this thread's):
- [ ] The map's outer boundary shows flat rock walls where a level meets the map's edge (the south-west wood).
- [ ] The arch's keystone and trim (below).
- [ ] The rowing boat from the quay sheet was modelled at an angle and is unused.
- [ ] The 3D court plays only on the 3D page (`index.html`); the old `#court` level is still the pixel one.

- [ ] **Foliage** (plants, flowers, vines, paving): moved to its own thread, [foliage](foliage.md), handed to a fresh session (2026-11-24).
- [ ] **Later: the arch's keystone and trim** (the user, 2026-11-24). Either painted into the voussoir ring's texture (free; a keystone is a few pixels at the game camera), or as one of several small ornaments bundled into a single Meshy call: one Codex sheet (keystone, urn, finial, lantern, ball topper) → one model → split into loose parts in Blender → `fit.py` each. Bundling suits small ornaments, not buildings.
- [x] Save the draft (the user, 0b43ef6) and merge court-kit into main (2026-11-25).
- [ ] Then the yard and the infirmary on the kit: the infirmary started 2026-11-26 ([its thread](infirmary-kit.md)); the yard after it.

## Done

- 2026-11-26: buildings are edges for the laid stones (the user chose B of three): the paving is laid up to each building's model base and its rows turn along the walls; [road stones](../explorations/2026-11-24-road-stones.md#buildings-are-edges-2026-11-26).
- 2026-11-25: the user approved p34 (plaza inlay, "ok for now") and p37 (stone road, "much better"); violet cracks dropped (the user doesn't like them in the concept art); the animated-water note was stale (water moves since `636f446`). Dressing: benches behind the sea parapets by rule (`along: view`), the seven element banners from one Codex sheet (`banners.py`) at the hall, library and workshops doors. Sea edge: the landing a timber quay (fascia, piles, mooring posts, drawn to size) dressed with bollards, hook lamps, crates, a barrel and rope (one bundled Meshy call); cliffs found by the compiler (`cliff.face`) and laid from one Meshy cliff run along every open edge over the sea (60 credits in all, the user's choice of two calls over one).
- 2026-11-25: road and paving laid stone by stone (from the road-flow worktree via `kit-clean`): `tess_layout.py` bakes each scene's stones (the court: 11,709) to `game/content/generated/layouts/<scene>-stones.json` after each compile, the floor shader paints them live (`kit-stones.ts`), and the editor lays touched pieces again in the background; kerbs are rounded blocks with a mortar bed. Answers p37 (left open for the user).
- 2026-11-24: the plaza's radial floor as an inlaid slab with seven recessed channels of tinted, flowing magic (p34, the new `inlay` class, `setpiece.plaza-inlay`); dressing from two bundled Meshy calls (60 credits): urn, lanterns, pots, keystone, lamp posts, bench.
- 2026-11-24: the stream's falls, from their own thread ([waterfall](waterfall.md), branch `waterfall`, merged): the compiler finds water over lower water and the renderer pours it as a ribbon drawn to size. The bundled dressing call: eight small parts from one Meshy model (30 credits, `split_sheet.py`).
- 2026-11-24: arches as a kit feature, not models (the user: a bridge model "bakes in the exact width, length, railing"): the compiler places `arch.through` where a level crosses water (the stream bridge, its deck paved as road) and blind arches over three-section bays on the tall sea walls; the Map Editor session draws them to size in the painted stone. No credits. The full-size fitted models are kept in `meshy/kit-full/` (for LoD later); `slim.py` writes the game's copies.
- 2026-11-24: foliage merged in from its thread; the terraces and the 3 m plaza ring paved in `cobble` (the paint-over's warm flags; roads and the sunk plaza unchanged); the models slimmed, 198 to 53 MB (`slim.py`: textures re-encoded, no visible change at the game camera; run it after every `fit.py`); the sea walls' foot (the rock band at -5.5 m) is now `plinth`, dark weathered blocks with moss (Codex, free), and `ashlar` tiles at 5 u so its courses read at the game camera.
- 2026-11-24: the great hall as one set piece, its open archway carrying the north road (p5; 30 credits). All building pins closed.
- 2026-11-24: round 3 and the user's ideas: tiling textures from Codex for every floor, wall, kerb and step (`textures.py`; the renderer draws them in world space, so no seams: p27, p29, p32); paint-overs of our own grey-box as the art target (`docs/reference/court-kit/`, on the map's Concepts); the plaza's radial floor as a `decal` laid over the floor and the ring of steps (channels to medallions, clipped to the steps' height); the niche remade with a solid recess (`fit.py` got `flip`); the library, workshops and two hall halves as set pieces from the paint-overs (`turn` lets a set piece face any way; 90 credits); `line` objects, the sunk plaza's south edge, the overlook's prow (p26, p28, p30, p31, p33). The trade-off taken: unique building set pieces for the hub's three landmark buildings, not modular facades, which the yard and infirmary may still need.
- 2026-11-24: the user's pins, round 2: the armillary rebuilt with five closed band rings that turn (p22; a seam-split mesh decimated had torn holes, now welded first); the beacon remade watertight (p23); railings meet posts (p25: a corner's post is the higher run's, and the renderer starts curved sections at their pier's face); the overlook and the sunk plaza as single levels with one run of steps (p24, p26, p30), and `steps-runout` (an error when steps have no room for their treads); `line` objects snap edges to a straight line at any angle (p33: plan D's radial band ends).
- 2026-11-23: the set-piece class and all eight set pieces modelled (135 credits); the user's pins, round 1.
- 2026-11-23: plan D traced; general curves (`round`), small steps (`steps`), one sea level, same-height seams.
- 2026-11-23: the plan.
