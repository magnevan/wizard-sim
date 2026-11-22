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

**Later** (the [engine plan](../../docs/explorations/2026-11-22-height-and-outlines.md), phase 6): the same cells are written to the LDtk level's Terrain, Height and Ground layers.
