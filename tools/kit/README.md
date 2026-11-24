# The modular kit

Places are built from made pieces on a square grid ([flexible building](../../docs/explorations/2026-11-23-flexible-building.md)). A **scene** says, per grid corner, which terrace it belongs to, and names the flights, curves, edge overrides and props. The **compiler** turns it into placed pieces and checks it. The [map editor](../map-editor/README.md) edits scenes live, in 3D, with Claude.

| File | What it is |
|---|---|
| `kit.json` | The asset contract: each piece's class, size, pivot and front |
| `scenes/<name>.scene.json` | The scenes: the source of truth (beside each, the editor's `.pins.json`, and its undo history `.history.jsonl`, not in git) |
| `compile.py` | Scene → pieces and findings. `python tools/kit/compile.py patch-b` writes `game/packages/client/src/lab/kit-patch-b.json` for the greybox page (`kit3d.html`) |
| `scene.py` | `convert <layout>` turns an old Python layout into a scene; `check <scene>` prints its findings with their places |
| `worker.py` | The map editor's long-lived compiler (JSON lines in and out) |
| `fit.py` | Blender: fits a generated model to its piece's box; write the result to `game/content/generated/meshy/kit-full/` (full size, kept for later uses such as LoD) |
| `split_sheet.py` | Blender: a bundled Meshy model (several objects drawn apart on one Codex sheet, one call) split into one model per object, by grid position; then `fit.py` each (`dress.<name>` takes its box from kit.json, `part:<w u>,<d u>,<h m>` an explicit one). The small dressing sheet (8 parts, 30 credits) came back as 8 clean parts of 64k to 190k faces each, so a sheet of small objects can hold more. Split into a scratch folder, not the repo: the parts are rebuilt from the committed sheet (`*-parts/` folders are gitignored) |
| `slim.py` | After `fit.py`: copies each model from `meshy/kit-full/` to `meshy/kit/` (what the game loads) with smaller textures (JPEG; base colour 2048 px for landmark buildings, 1024 px otherwise; normal and metal-roughness half) |
| `trace_plan.py` | `python tools/kit/trace_plan.py court-d court` re-runs a place plan (`tools/place-plans/plans/`) on the kit's corner lattice and writes a first-draft scene, plus `<scene>.gaps.json`: what the kit can't say yet (set pieces, facades, curved flights). A one-off draft: after it, the scene is the source |
| `court_pins.py` | The courtyard's gaps as map-editor pins (`scenes/court.pins.json`), named by hand |
| `layouts/*.py` | The first two test patches as written by hand, kept as history; their scenes are the live copies |

## The scene format

```json
{
  "schema": 1, "name": "patch-b", "G": 2, "notes": "free text",
  "terraces": [
    {"id": "t-plaza", "glyph": "P", "name": "the plaza", "h": 0, "mat": "plaza", "edge": "parapet"},
    {"id": "t-cliff-below", "glyph": "C", "name": "the cliff below", "h": -4, "mat": "rock", "edge": "open", "walk": false}
  ],
  "corners": ["CPPP", "CPPP", "CCCC"],
  "objects": [
    {"id": "f1", "kind": "flight", "name": "the grand stair", "head": [[13, 8.5], [16, 8.5]]},
    {"id": "c1", "kind": "curve", "name": "the fountain bastion", "terrace": "t-fountain-landing", "centre": [24, 13.5], "r": 2, "ends": [[22, 13.5], [26, 13.5]], "out": "S"},
    {"id": "e1", "kind": "edge", "name": "the hall door", "at": [15.5, 2.5], "v": "door"},
    {"id": "v1", "kind": "vignette", "piece": "vignette.lamp", "at": [10, 13.5], "front": "S"}
  ]
}
```

- **Coordinates** are corners: corner `(x, y)` is `corners[y][x]`. Cells lie between corners; edges sit on half-coordinates.
- **Terraces:** `h` in metres; `mat` is the floor (paving, plaza, road, lawn, roof, rock, water, deck, woods, dirt, sand); a floor wears the tiling texture named after its mat (`game/content/generated/textures/`, tile sizes in `tiles.json`, made by `textures.py`); `edge` is how the terrace meets lower ground: `wall` (a building), `parapet` (a balustrade on a retaining wall), `retain` (a retaining wall), `open` (a drop left open, as for a cliff), `steps` (a drop of 0.3 to 1 m you can step over anywhere along it, as round a dais; over 1 m it is a parapet). A drop of 0.3 m or less is a kerb whatever the edge, and two levels at the same height meet in a seam with no edge piece. Steps also go wherever a lower `steps` level meets a walkable level at most 1 m above it. `walk: false` for ground nobody walks on (beds, roofs, cliffs). Each corner character is a terrace's `glyph`; its `id` is what everything else refers to.
- **Flights:** `head` is the line the flight starts from, along a terrace's edge (a half-coordinate). Its top, bottom and direction come from the corners either side, and its length from the drop (0.15 m per step).
- **Curves:** a terrace bulging past its grid edge along a circle from `ends[0]` to `ends[1]` round `centre`, bulging toward `out`.
- **Rounds:** `{"kind": "round", "centre": [x, y], "r": cells, "tol"?: 0.75, "terrace"?: id, "from"?: deg, "to"?: deg}` says a circle is a true curve. Every terrace edge lying within `tol` of it (runs of three or more segments; `terrace` limits it to one level's edges, `from`/`to` to an arc, 0 = east, 90 = south) is snapped onto the arc, convex or concave, and the floors either side are re-cut. Paint the grid roughly round; the round makes it true. A curve, by contrast, bulges one straight run.
- **Set pieces:** `{"kind": "setpiece", "piece": "setpiece.bell-tower", "at": [x, y], "front": "S"}`: one unique model on a footprint (a landmark, a tower, a gate pier), from `kit.json`'s `setpiece` class (`shape` round or box, `footprint` in u, `height` in m). Like a vignette, but it may stand on ground within 0.35 m (its plinth takes up a kerb) and may flank a flight, never stand in its path.
- **Edge overrides:** `at` is the midpoint of one straight edge section; `v` is `plain`, `window` or `door` on a wall, `plain` or `niche` on a parapet or retaining wall. Without one, the compiler chooses (windows every other bay, by position; niches on tall walls seen from walkable ground). **Arches** are built to size by the renderer, never modelled: blind arches on tall walls rising from ground no one walks (the sea), each over a bay of three sections (the middle `v: 'blind'` with `bay: 3`, its neighbours `v: 'blind-side'`), a plain section between bays; and `arch.through`, wherever a walkable level's two parallel faces stand over the same water that the level divides in two (a bridge: one arch per 6 m of span; the faces' sections there draw only coping and railing, `v: 'bridge'`). Banks facing across water and piers are not crossings. A crossing less than 1.2 m above its water is a warning (`arch-low`).
- **Grown plants:** a set piece whose `kit.json` entry has `"grow": {"kind": "bush" / "bed" / "cone" / "tree", ...}` is grown in code (`game/packages/client/src/lab/foliage.ts`, sizes in metres; `box: [w, d, h]` adds a stone trough under it) instead of loaded as a model: `setpiece.bush-gold`, `setpiece.flowerbed`, `setpiece.topiary`, `setpiece.tree-bloom` and their kin. Each differs by where it stands. A `vine.*` piece with `"grow": {"kind": "cascade"}` is a grown vine as wide as its wall section.
- **Vignettes:** a prop from `kit.json` (`vignette.lamp`, `vignette.bench-planter`) at `at`, facing `front` (N, E, S or W).
- The file is written one terrace, corner row or object per line (`scene.py` and the editor's server write the same layout), so git diffs stay readable.

## Findings

Every check reports `{code, severity, msg, at, refs}`: `at` is where (in corners), `refs` the ids involved. Errors: `saddle` (two opposite corners of a cell on a terrace and two not), `flight-head`, `flight-landing`, `flight-overlap`, `curve-ends`, `unguarded` (a drop over 1 m without a parapet), `run-end` (a railing or wall run stopping in the air), `vignette-ground`, `vignette-flight`, `unreachable`, `piece`, `piece-fit`. Warnings: `flight-runout` (no clear ground in front of a flight's foot), `round` (a round no edge lies along), `edge-variant`, `edge-missing`. A scene with errors still compiles as far as it can.
