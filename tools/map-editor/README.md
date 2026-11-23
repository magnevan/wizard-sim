# Map editor

The 3D map editor for the modular kit, shared by the user and Claude ([spec](../../docs/explorations/2026-11-23-map-editor.md), [thread](../../docs/threads/map-editor.md)). The user edits in the browser; Claude edits the same live scene through `cli.mjs`; both see each other's changes at once.

- **Start it:** `npm run dev` in `game/`, then open http://localhost:5187/editor.html (`?scene=patch-b`). The scene server is a dev-only Vite plugin (`game/packages/client/map-editor/`), so there is nothing else to start. It runs a long-lived Python compile worker (`tools/kit/worker.py`; needs Python with shapely). The page is `game/packages/client/src/lab/editor/main.ts`; it never reaches the build.
- **The scenes** are `tools/kit/scenes/<name>.scene.json` (format: [the kit's README](../kit/README.md)). Beside each: `<name>.pins.json` (the pins) and `<name>.history.jsonl` (the undo history; not in git). **New…** in the top bar (or `cli.mjs new`) makes a blank scene or a copy.
- **Claude's side:** `node tools/map-editor/cli.mjs help`. The `UserPromptSubmit` hook (`hook.mjs`, in `.claude/settings.json`) prints new pins into the session whenever the user sends a message. Claude's pictures (`cli.mjs view`) come from the open editor page; with none open, the server renders them in a hidden headless page (about 15 s the first time, 10 s after).
- **Checks:** `npm run editor:check` in `game/` (a smoke test of the page against the running dev server, on a throwaway scene) and `npm run editor:shot` (a screenshot); `packages/client/test/map-editor-ops.test.ts` tests the ops.

## Using the editor

Everything happens in the 3D view. **Right-drag** orbits, **middle-drag** or **Shift+right-drag** pans, the **wheel** zooms; **T** looks straight down (the plan), **G** goes back to the game's camera, **C** shows each corner's terrace as a coloured square, **M** hides the markers.

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click a piece, floor, pin or marker. A wall section can be set to plain, window or door (a parapet to plain or niche) in the inspector; a floor opens its terrace (name, height, floor, edge, walkable); a stair or prop can be renamed, moved with the arrows, turned with Q/E and deleted |
| Brush | B | Drag to paint the chosen terrace, a whole cell at a time; **[ ]** change the size, **Alt** paints one corner, **I** picks up the terrace under the cursor, **1–9** choose from the palette |
| Rectangle | R | Drag a rectangle of corners |
| Stair | S | Drag along a terrace's edge: the flight starts there and runs down to the lower side |
| Prop | P | Click to place the prop chosen in the bar, facing the way chosen (Q/E) |
| Pin | N | Click anything and write what should change. Claude sees new pins with your next message in the terminal, and its replies appear on the pin |

**Ctrl+Z** and **Ctrl+Y** undo and redo anything, Claude's edits included. Problems show as red (error) and amber (warning) markers at their place and in the list on the right; clicking one goes there. When Claude edits, a note says what it did and the changed corners glow for a moment.

## Coordinates

Everything is in **corner coordinates**: `x` is the corner column, `y` the corner row (row 0 is the first string in `corners`), so corner `(x, y)` is `corners[y][x]`. A cell `(j, i)` lies between corners `(j, i)` and `(j+1, i+1)`. Edges sit on half-coordinates: a flight's head along a row runs at `y = r + 0.5` between corner rows `r` and `r+1`. The compiler's instances are in u (`x / G` gives corners); heights are in metres.

## HTTP API

The dev server (default `http://127.0.0.1:5187`, or `$MAP_EDITOR_URL`) serves these under `/__map/`. Every reply is JSON unless noted; errors are `{error}` with status 400, 404, 409 or 503.

| Call | What it does |
|---|---|
| `GET /__map/scenes` | `{scenes: [{name, rev, errors, warnings}]}` |
| `POST /__map/new` | Body `{name, w?, h?}` (a blank scene of w x h cells, default 24 x 16) or `{name, from}` (a copy) |
| `GET /__map/scene?name=N` | `{name, rev, scene, summary: {errors, warnings, pieces, ms}}`; add `&compiled=1` for the full compiled output as `compiled` |
| `GET /__map/findings?name=N` | `{rev, findings: [{code, severity, msg, at, refs}]}` |
| `GET /__map/query?name=N&x=X&y=Y&r=R` | Facts within `r` corners (default 1.5) of `(x, y)`, or in a rectangle with `x0,y0,x1,y1`: `{rev, corners: [{x, y, glyph, terrace}], objects: [...], instances: [{p, src, e, o, v, x, y, h}], findings: [...]}` (instance x, y in corners) |
| `POST /__map/apply` | Body `{name, ops: [...], author: "claude", label?, base?, dry?}`. Applies the ops as one undo group. `base`: the rev the ops were written against; if anything they touch changed since, `409 {error, conflicts}`. `dry`: compile without saving. Reply: `{rev, minted: [ids], changed: {corners, ids, resized}, diff: {added: [findings], resolved: [findings], pieces: {piece: delta}}, summary}` |
| `POST /__map/undo` | Body `{name, author?}`. Undoes the latest group (by `author` if given). Reply `{rev, undone: {label, author}}` |
| `POST /__map/redo` | Body `{name}` |
| `GET /__map/history?name=N&n=20` | `{groups: [{group, author, label, rev, time}]}`, newest first |
| `GET /__map/pins?name=N&status=open` | `{pins: [...]}`; `status` is `open`, `new` (open and not yet seen by Claude), `resolved` or `all` (default `open`) |
| `POST /__map/pins` | Body `{name, op, ...}`: `add {note, anchor}`, `reply {id, text, author}`, `resolve {id, outcome: scene/rule/piece, text?}`, `seen {ids}`, `delete {id}` |
| `GET /__map/view?name=N` | A PNG of the scene as the editor renders it (an open editor page showing that scene, or a hidden headless one): `&cam=top` (straight down), `game` (the game's camera) or `current`; `&x=&y=` (corners) to centre on, `&r=` (corners) half the width shown; `&pins=0&findings=0` hide the markers |

### Ops

Ops name things by id. Terraces may also be named by glyph.

| Op | Fields |
|---|---|
| `paint` | `terrace`, and `at: [[x, y], ...]` (corners) or `rect: [x0, y0, x1, y1]` (inclusive corners) |
| `add_terrace` | `name, h, mat, edge` (wall, parapet, retain, open), `walk?`, `glyph?`, `id?`: the reply's `minted` has the id |
| `set_terrace` | `id`, then any of `name, h, mat, edge, walk, glyph` |
| `remove_terrace` | `id` (refused while corners still use it) |
| `add` | `kind` and its fields, `id?`: `flight {name, head: [[x, y], [x, y]]}`, `curve {name, terrace, centre, r, ends, out}`, `edge {at: [x, y] (an edge's midpoint), v: plain/window/door/niche}`, `vignette {piece, at, front: N/E/S/W}` |
| `set` | `id`, then any fields (`null` deletes one) |
| `move` | `id, by: [dx, dy]` (corners): moves `at`, `head`, `centre` and `ends` |
| `remove` | `id` |
| `insert_rows` / `insert_cols` | `at, n, fill?` (a terrace; default copies the neighbouring row or column); objects and pins past `at` move with them |
| `remove_rows` / `remove_cols` | `at, n` |
| `set_meta` | `name?, notes?` |

## Pins

A pin: `{id, note, author, anchor: {x, y, h?, obj?, inst?, cam?}, rev, status: open/resolved, seen, outcome?, thread: [{author, text, time}]}`. `anchor.obj` is the id of the object or terrace it was dropped on; `anchor.inst` the piece under it (`p` and `e`). Each pin is resolved with an outcome: `scene` (fixed in this map), `rule` (the compiler's behaviour; file an issue) or `piece` (a kit piece missing or bad; file an issue).
