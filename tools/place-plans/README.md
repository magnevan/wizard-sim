# Place plans

Stage 1 of [making a place](../../docs/campaign/making-a-place.md): plans that really differ, drawn from data so they're cheap to change and later become the grey-box level.

```
python tools/place-plans/plans/court-a.py     # writes out/court-a-plan.png (from above) and out/court-a-game.png (game camera)
```

A plan spec is a short Python file that builds a `Plan` (in `plan.py`) and calls `render()`.

**Coordinates.** It's written in screen-aligned units: U runs right, V runs down the screen (towards the camera), and 1 unit is 1 game unit (about 0.6 m). Heights are in metres. The plan is rasterised onto the game's world grid (x = (U+V)/√2, y = (V−U)/√2, 1 u cells), so what you see is what the level gets.

| Call | Makes |
|---|---|
| `fill(shape, h, mat)` | Ground at height `h` of a material (`plaza`, `paving`, `grass`, `path`, `water`, `deep`, `wood`, `rock`, `trees`, …) |
| `raise_(shape, dh)` | Lifts or lowers what's there |
| `stairs(shape, h0, h1, axis)` | A flight from `h0` at the low-U or low-V end to `h1` |
| `building(shape, ground, height, name, doors)` | An extruded block with door markers |
| `route(points, 'main'/'side')`, `gate`, `landmark`, `note` | Overlays |

**Shapes** are `rect`, `circle`, `octagon`, `orect` (rotated rectangle), `arc_band` (a curved terrace) and `poly_n`. A boolean mask from `P.mask(...)` also works as a shape.

**The journey.** `journey(points, label, moment)` adds one pass through the place, in the order the player makes them and in walking direction. `render()` then also writes `out/<name>-journey.png`: the plan from above with each pass numbered and arrowed, and a legend of what each is for.

**Flow frames.** `python tools/place-plans/plans/court-d.py --frames` writes `out/<name>-flow-<n>.png`, one sheet per pass of the journey, or per route if there's no journey. Each sheet is a run of play-size screens along the route: 30 u wide, with the wizard where the camera puts it and no labels. The flow critic judges from these before the grey-box exists.

In the game view, cliff faces are drawn on the sides the camera sees (+x and +y). The plan view marks a drop over 1.6 m with a thick line and smaller steps with a thin one. The stats line gives the world box, the walkable area and the flat tiers.

**Plan to level** (phase 6 of the [engine plan](../../docs/explorations/2026-11-22-height-and-outlines.md)): `python tools/place-plans/to_ldtk.py court-d` writes the spec's cells into its LDtk level (Terrain, Height, Ground, the starts and the gate, door and landmark markers; which level and which marker ids are in `LEVELS` in `to_ldtk.py`), then build and check from `game/`. Every distinct height becomes a tier; cells more than 0.5 m apart are parted by a cliff.

`--report` only says how the plan walks: its walkable regions with what's in each, anything cut off from the start, every jump of more than 0.5 m inside a flight of stairs, ground within 2 u of a route standing over an unguarded drop of more than 1 m, and walkable regions no route (journey pass or drawn route) passes through. Run it before writing the level: the plan views can't show these (they draw no line between two stair cells). A flight walks if each 1 u world cell along it changes height by 0.5 m at most: give it about 2 u of run per metre of drop, and about 3 u per metre when it runs along a screen diagonal, since the world grid is turned 45° to the screen.

It also counts **walkable ground within sight of the world's edge**: within 12 u of the plan box's top and sides, or, at the bottom, 10 u plus 1.8 u for each metre of height. A tier's face at the box's edge hangs below it on screen by about that much. Only ground you can reach from the start without passing a gate counts, and nothing within 6 u of a gate. Keep it at 0: carry the land, the woods or the sea on past it.

**Finishing** (`finish.py`, called at a spec's end):
- `lips(P)`: walls along drops near routes, or `everywhere=True` along every public edge over a metre.
- `close_gates(P)`: closes each gate's line, so no one walks round a gate. The sim leaves within 3 u of a gate's marker, so on a road 8 u wide you could step past it. The line runs square to the journey's way in, out to the first wall, cliff or woods on each side.
- `woods_unreached(P)`: turns walkable ground no one can reach into woods.

**Dressing** (the beauty stage): a spec may list `PROPS = [(asset, (U, V), blocks), ...]` with assets from `game/content/assets/props/`. `to_ldtk.py` writes them as Props.

**One command** (step 3 of the [pipeline](../pipeline-3d/index.html)): `python tools/place-plans/build.py <plan>` runs the walk report (any problem stops it), writes the level, writes the resolved scene beside it (`game/content/maps/scenes/<room>.json`, stamped with the level file's hash), then `content:build` and `content:check`. The check fails if a scene was built for another version of its level, or if the scene and the sim disagree on more cells than `scenes/agreement-baseline.json` allows. `npm run content:scene-map -- <room> <out.ppm>` draws where they disagree. Every plan edit is a shape op (`fill`, `repaint`, `building`, `stairs`, `raise_mat`): a plan that edits cells directly fails the export.
