# Map editor

The 3D map editor for the modular kit, shared by the user and Claude ([spec](../../docs/explorations/2026-11-23-map-editor.md), [thread](../../docs/threads/map-editor.md)). The user edits in the browser; Claude edits the same live scene through `cli.mjs`; both see each other's changes at once.

- **Start it:** `npm run dev` in `game/`, then open http://localhost:5187/editor.html (`?scene=patch-b`). The scene server is a dev-only Vite plugin (`game/packages/client/map-editor/`), so there is nothing else to start. It runs a long-lived Python compile worker (`tools/kit/worker.py`; needs Python with shapely). The page is `game/packages/client/src/lab/editor/main.ts`; it never reaches the build.
- **The scenes** are `tools/kit/scenes/<name>.scene.json` (format: [the kit's README](../kit/README.md)). Beside each: `<name>.pins.json` (the pins) and `<name>.history.jsonl` (the undo history; not in git). **New…** in the top bar (or `cli.mjs new`) makes a blank scene or a copy.
- **Claude's side:** `node tools/map-editor/cli.mjs help`. The `UserPromptSubmit` hook (`hook.mjs`, in `.claude/settings.json`) prints new pins into the session whenever the user sends a message. Claude's pictures (`cli.mjs view`) come from the open editor page; with none open, the server renders them in a hidden headless page (about 15 s the first time, 10 s after).
- **Checks:** `npm run editor:check` in `game/` (a smoke test of the page against the running dev server, on a throwaway scene) and `npm run editor:shot` (a screenshot); `packages/client/test/map-editor-ops.test.ts` tests the ops.

## Using the editor

Everything happens in the 3D view. In Select, **left-drag** orbits (in the other tools **right-drag** does), **middle-drag** or **Shift+drag** pans, the **wheel** zooms toward the cursor; **F** frames the selection, **T** looks straight down (the plan), **G** goes back to the game's camera, **C** shows every corner's level as a coloured square (the paint tools show where levels meet), **M** hides the markers, **W** shows the game's wizard (1.74 m) standing on the floor under the cursor, for scale, **?** lists every key.

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click a piece, floor, pin or marker. A wall section can be set to plain, window or door (a parapet to plain or niche), or get **Add a stair here** (2–4 cells wide); a floor opens its level (name, height with ±0.5, floor, edge, walkable); a stair can be widened or narrowed (or dragged by its handles: each end of its head slides along the edge, the middle slides the whole stair); a prop can be dragged, turned (Q/E) or deleted; arrows move the selection (relative to the camera). With nothing selected, the inspector shows the map: grow or shrink it at any side, and its notes |
| Brush | B | Drag to paint the chosen level, a whole cell at a time; **[ ]** change the size, **Alt** paints one corner, **I** picks up the level under the cursor, **1–9** choose from the palette. Cells a stroke would leave ambiguous are filled in |
| Rectangle | R | Drag over the cells to paint. **Ctrl+drag** selects the cells instead (outlined): **Ctrl+C** copies them and everything standing wholly on them (stairs, props, set pieces, curves, rounds, wall-section choices), **Ctrl+V** pastes them with their top-left corner at the cursor, as one undoable edit; Esc clears the selection |
| Stair | S | Drag along the edge between two levels: the flight starts there and runs down to the lower side (it finds the drop within a cell of the drag) |
| Curve | A | Bulge a level past a straight stretch of its edge along a circle (a bastion, a rounded terrace): drag along the edge for the ends, release, move out for the bulge (it snaps to a semicircle near half the width), click; **Esc** cancels. A selected curve (here or in Select) shows three handles: drag an end along the edge, or the middle for the bulge; the inspector has bulge ±½ and **semicircle** |
| Round | O | A true circle that every edge near it snaps onto, curving out or in, however it was painted (the compiler's `round`): **click three points** along an edge to fit a round through them (its arc runs from the first to the last), or **drag** from a centre for a whole circle. With the tool on, every round shows dashed. A selected round has handles (the big one moves it; the others set the radius and the arc's ends) and an inspector: radius, reach (how far an edge may lie from it and still snap), which level's edges, and the arc in degrees (0° east, 90° south). Paint near a round and the new edge snaps too |
| Prop | P | Click to place the prop or set piece chosen in the bar (set pieces are the kit's unique made pieces on a footprint: towers, the armillary, gate piers; the bar shows the size), facing the way chosen (Q/E). Selected, a set piece shows its footprint; both drag, turn and delete the same way |
| Pin | N | Click anything and write what should change. Claude sees new pins with your next message in the terminal, and its replies appear on the pin |

**Concept images:** drop an image file on the editor, paste one (Ctrl+V), or **+ image** in the Concepts panel (**K**, or **Concepts** in the top bar), and it is kept with the map (`tools/kit/scenes/refs/<scene>/`, listed in `<scene>.refs.json`). The panel shows one large beside the 3D view, with the others as a strip: the wheel zooms, a drag pans, and a **click pins a note on that spot of the image** for Claude, like a pin on the map. Its pins show as numbered dots on the image, and in the pins list as "on the concept …"; clicking one there opens the image at it.

**A new level:** **+ level** in the palette adds one a metre above the highest, opens it to be named, and switches to painting with it. **Ctrl+Z** and **Ctrl+Y** undo and redo anything, Claude's edits included. Problems show as red (error) and amber (warning) markers at their place and in the list on the right (a stray railing end beside an ambiguous cell folds under it); clicking one goes there. When Claude edits, a note says what it did and the changed corners glow for a moment.

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
| `GET /__map/kit` | `tools/kit/kit.json` (the pieces: the editor takes set pieces' sizes and the Prop tool's list from it) |
| `GET /__map/refs?name=N` | The concept images pinned to the map: `{refs: [{id, title, file, time, path}]}` (`path`: the file on disk, under `tools/kit/scenes/refs/<scene>/`) |
| `POST /__map/refs` | Body `{name, op, ...}`: `add {title, data}` (`data`: a `data:image/...;base64,` URL, or base64 with `filename`), `rename {id, title}`, `remove {id}` (the file goes; its pins stay) |
| `GET /__map/ref-image?name=N&id=r1` | The image's bytes |
| `GET /__map/view?name=N` | A PNG of the scene as the editor renders it (an open editor page showing that scene, or a hidden headless one): `&cam=top` (straight down), `game` (the game's camera) or `current`; `&x=&y=` (corners) to centre on, `&r=` (corners) half the width shown; `&pins=0&findings=0` hide the markers; `&figure=x,y` stands the wizard (1.74 m) there, for scale |

### Ops

Ops name things by id. Terraces may also be named by glyph.

| Op | Fields |
|---|---|
| `paint` | `terrace`, and `at: [[x, y], ...]` (corners) or `rect: [x0, y0, x1, y1]` (inclusive corners) |
| `add_terrace` | `name, h, mat, edge` (wall, parapet, retain, open), `walk?`, `glyph?`, `id?`: the reply's `minted` has the id |
| `set_terrace` | `id`, then any of `name, h, mat, edge, walk, glyph` |
| `remove_terrace` | `id` (refused while corners still use it) |
| `add` | `kind` and its fields, `id?`: `flight {name, head: [[x, y], [x, y]]}`, `curve {name, terrace, centre, r, ends, out}`, `round {name, centre, r, tol?, terrace?, from?, to?}` (from and to together, degrees), `setpiece {piece: "setpiece.<name>", at, front}`, `edge {at: [x, y] (an edge's midpoint), v: plain/window/door/niche}`, `vignette {piece, at, front: N/E/S/W}` |
| `set` | `id`, then any fields (`null` deletes one) |
| `move` | `id, by: [dx, dy]` (corners): moves `at`, `head`, `centre` and `ends` |
| `remove` | `id` |
| `insert_rows` / `insert_cols` | `at, n, fill?` (a terrace; default copies the neighbouring row or column); objects and pins past `at` move with them |
| `remove_rows` / `remove_cols` | `at, n` |
| `set_meta` | `name?, notes?` |

## Pins

A pin: `{id, note, author, anchor: {x, y, h?, obj?, inst?, cam?} or {ref: {id, u, v}}, rev, status: open/resolved, seen, outcome?, thread: [{author, text, time}]}`. `anchor.obj` is the id of the object or terrace it was dropped on; `anchor.inst` the piece under it (`p` and `e`). A pin on a concept image has `anchor.ref` instead: the image's id and where on it (`u`, `v` from its top left, 0 to 1); `cli.mjs ref <scene> show <id> --pin <pin>` writes the image with the pin drawn on it and a close-up around it, for Claude to look at. Each pin is resolved with an outcome: `scene` (fixed in this map), `rule` (the compiler's behaviour; file an issue) or `piece` (a kit piece missing or bad; file an issue).
