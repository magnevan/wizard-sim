# The modular kit

Places are built from made pieces on a square grid ([flexible building](../../docs/explorations/2026-11-23-flexible-building.md)). A **scene** says, per grid corner, which terrace it belongs to, and names the flights, curves, edge overrides and props. The **compiler** turns it into placed pieces and checks it. The [map editor](../map-editor/README.md) edits scenes live, in 3D, with Claude.

| File | What it is |
|---|---|
| `kit.json` | The asset contract: each piece's class, size, pivot and front |
| `scenes/<name>.scene.json` | The scenes: the source of truth (beside each, the editor's `.pins.json`, and its undo history `.history.jsonl`, not in git) |
| `compile.py` | Scene → pieces and findings. `python tools/kit/compile.py patch-b` writes `game/packages/client/src/lab/kit-patch-b.json` for the greybox page (`kit3d.html`) |
| `scene.py` | `convert <layout>` turns an old Python layout into a scene; `check <scene>` prints its findings with their places |
| `worker.py` | The map editor's long-lived compiler (JSON lines in and out) |
| `fit.py` | Blender: fits a generated model to its piece's box |
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
- **Terraces:** `h` in metres; `mat` is the floor (paving, plaza, road, lawn, roof, rock); `edge` is how the terrace meets lower ground: `wall` (a building), `parapet` (a balustrade on a retaining wall), `retain` (a retaining wall), `open` (a drop left open, as for a cliff). A drop of 0.3 m or less is a kerb whatever the edge. `walk: false` for ground nobody walks on (beds, roofs, cliffs). Each corner character is a terrace's `glyph`; its `id` is what everything else refers to.
- **Flights:** `head` is the line the flight starts from, along a terrace's edge (a half-coordinate). Its top, bottom and direction come from the corners either side, and its length from the drop (0.15 m per step).
- **Curves:** a terrace bulging past its grid edge along a circle from `ends[0]` to `ends[1]` round `centre`, bulging toward `out`.
- **Edge overrides:** `at` is the midpoint of one straight edge section; `v` is `plain`, `window` or `door` on a wall, `plain` or `niche` on a parapet or retaining wall. Without one, the compiler chooses (windows every other bay, by position; niches on tall walls seen from walkable ground).
- **Vignettes:** a prop from `kit.json` (`vignette.lamp`, `vignette.bench-planter`) at `at`, facing `front` (N, E, S or W).
- The file is written one terrace, corner row or object per line (`scene.py` and the editor's server write the same layout), so git diffs stay readable.

## Findings

Every check reports `{code, severity, msg, at, refs}`: `at` is where (in corners), `refs` the ids involved. Errors: `saddle` (two opposite corners of a cell on a terrace and two not), `flight-head`, `flight-landing`, `flight-overlap`, `curve-ends`, `unguarded` (a drop over 1 m without a parapet), `run-end` (a railing or wall run stopping in the air), `vignette-ground`, `vignette-flight`, `unreachable`, `piece`, `piece-fit`. Warnings: `flight-runout` (no clear ground in front of a flight's foot), `edge-variant`, `edge-missing`. A scene with errors still compiles as far as it can.
