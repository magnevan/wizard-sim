# Outdoor foliage (plants, flowers, vines, ground cover)

Status: active, handed off 2026-11-24 to a fresh session; next: study the concept art and propose · Last touched: 2026-11-24
Record: [dressing with variation](../explorations/2026-11-24-dressing-variation.md) (incl. the Vines sections) · [the courtyard on the kit](kit-courtyard.md) (where it started) · the comparison that started this: [ours vs the paint-over](../reference/court-kit/court-vines-vs-paintover.png) · concept: [`area-courtyard-start.jpg`](../reference/element-order/area-courtyard-start.jpg), paint-overs of our grey-box: [plaza](../reference/court-kit/court-plaza-paintover.png), [whole court](../reference/court-kit/court-whole-paintover.png), [sea stair](../reference/court-kit/court-sea-paintover.png)

## Why this thread

The courtyard's foliage looks much worse than the concept and the paint-overs, and the game will have many outdoor scenes, so the user wants it done properly with real effort, by a session starting fresh (2026-11-24): "we ought to get this right and spend significant effort on it."

## What the user has said (read these as the brief)

- The current vines (strips hung from copings, grown paths of stamped clusters) look "significantly worse than the concept image". Compare the image above.
- Flower beds should be **optional objects you place** in the editor, not a rule that runs along every wall.
- In the concept, greenery is not mostly climbers: it is **sprouting from different areas**: bushes and flowers bursting out of beds, planters, wall feet, corners, between stones, spilling over parapets.
- **Scale** must be fixed: at the game camera, real-size clusters (0.3 m) vanish; the paint-overs draw flowers and leaves about twice life size. Decide a style scale.
- **Paving** must be fixed: the paint-over's warm, varied cobble-flags against our pale flat slabs is a large part of the gap.
- Variation from few assets: the user asked for lots of variation with fewer meshes; see the dressing exploration. Procedural generation was considered; Codex paintings (free) are fine, but the user worried they won't keep the right scale over large areas.

## Constraints

- **No code-drawn art** (decisions log, 2026-11-22: procedural facades/textures rated 1–2/10). Procedural *placement and structure* are fine; what you see must be painted (Codex) or modelled (Meshy). Exception the user approved: the water shader is code-only, cartoony.
- **Codex pictures are free**; generate freely (`tools/concept-gen/gen.sh`, two runs at a time: more get killed for low memory). Retry killed free jobs at once; never auto-retry paid ones.
- **Meshy costs credits**; the API by default (standard meshy-7.1 for anything seen all round: smart topology leaves holes), the website only for a piece that failed twice. Ask before batches; report spend. About 1,550 credits left, monthly, renewing 2026-12-16.
- Judge art in the whole scene, at the game camera, never isolated objects. Send pictures to the user (SendUserFile): they are often away from the computer.
- The user wants to see where things land (stand-ins) before meshes are made.

## What exists (built in the courtyard session; reuse, change or replace)

- **Scenes and compiler**: `tools/kit/` (README has the scene format). `compile.py` turns `scenes/court.scene.json` into instances. Objects: `scatter` (fills a level with pieces at a spacing, seeded: the woods' trees), `dress` (runs a style's rules from `kit.json` `styles`: toppers on pier caps, planters at flights, lamps along roads, vine `drape` and `grow`), set pieces, decals (the plaza's radial floor).
- **Per-instance variation**: `vary` in `kit.json` gives a seeded `scale`, `tint` and `parts` (pieces combined from part models: pot × plant, post × lantern). The renderer applies all of them.
- **Vines**: kit class `vine`, `drape` strips (`textures/vine-strip-*.png`, 1 × 3 m, never stretched, soft faded ends) and `grow` paths stamped with clusters from 4 × 3 sheets (`textures/vine-clusters-*.png`). Pictures from `tools/concept-gen/prompts/2026-11-24-vines/` (painted on #00ff00, keyed by `tools/kit/vines.py`).
- **Trees**: `setpiece.tree-oak/-pine/-blossom` (Meshy smart topology), scattered on the woods.
- **Ground textures**: `game/content/generated/textures/` (Codex, tiled by `tools/kit/textures.py`, sizes in `tiles.json`).
- **The editor** (`game/packages/client/editor.html`, `tools/map-editor/README.md`) is built by a separate Claude session, "Map Editor", on branch `kit-clean`. Ask it for renderer and editor features by SendMessage (it reports back when done, on local commits you merge). Claude drives scenes through `tools/map-editor/cli.mjs` (apply ops, view pictures, pins).

## How to work

- Branch from `court-kit` into your own worktree (e.g. `foliage`); merge `kit-clean` freely for editor features; merge `court-kit` in when the courtyard session pushes. Don't commit to `court-kit` or `kit-clean`.
- The dev server for a worktree: `npm run dev -w @wizard-sim/client -- --port <free port> --strictPort` in `game/`, then `MAP_EDITOR_URL=http://localhost:<port>`. Low-memory kills happen often: restart it when needed, stop it when idle.
- Record decisions and comparisons in a dated exploration; keep this thread's Next list current.

## Next

- [ ] Study the concept and the three paint-overs closely: list every kind of greenery, where it grows, at what scale relative to a wizard and a doorway, and how it meets stone. Propose an approach to the user with pictures before building.
- [ ] Paving: a warmer, varied cobble-flag set for the courtyard floors (and a way to vary it over large areas).
- [ ] Placeable flower beds and planting as editor objects.
- [ ] Decide what to keep, change or drop of the vine system above.
