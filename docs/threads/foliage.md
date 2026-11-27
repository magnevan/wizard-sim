# Outdoor foliage (plants, flowers, vines, ground cover)

Status: paused 2026-11-24 with the user's approval ("it looks pretty good to me now"); branch `foliage` is ready to merge into `court-kit`; next when resumed: the open items below · Last touched: 2026-11-24
Record: [procedural foliage](../explorations/2026-11-24-procedural-foliage.md) (what was built) · [dressing with variation](../explorations/2026-11-24-dressing-variation.md) (incl. the Vines sections) · [the courtyard on the kit](kit-courtyard.md) (where it started) · the comparison that started this: [ours vs the paint-over](../reference/court-kit/court-vines-vs-paintover.png) · concept: [`area-courtyard-start.jpg`](../reference/element-order/area-courtyard-start.jpg), paint-overs of our grey-box: [plaza](../reference/court-kit/court-plaza-paintover.png), [whole court](../reference/court-kit/court-whole-paintover.png), [sea stair](../reference/court-kit/court-sea-paintover.png)

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

## Where it stands (2026-11-24)

The user asked the fresh session for a procedural system and allowed it to bend "no code-drawn art" for this work. Built: `game/packages/client/src/lab/foliage.ts` (shrubs, beds, cones, hanging vines, a tree, grown from seeded recipes), a lab page (`foliage.html`, pictures with `node scripts/foliage-shot.mjs` in `game/`), set pieces with a `grow` recipe in `kit.json`, grown vines in place of the painted strips, and a `cobble` floor texture. Details and pictures: [procedural foliage](../explorations/2026-11-24-procedural-foliage.md).

## Next

- [ ] The user's first look: "significantly better", flowers "a bit flat" (answered in round 2). Still a trial, not a decision; the "no code-drawn art" rule stands everywhere else.
- [x] Study the concept: the kinds of greenery, where they grow, their size (in the exploration).
- [x] Placeable flower beds and planting as editor objects (set pieces with `grow`).
- [x] The vine system: the dressing rules stay, each vine is now a grown cascade; the painted strips remain as the fallback.
- [ ] Paving: `cobble` exists; choose where the courtyard uses it (with the courtyard thread), and a way to vary it over large areas.
- [ ] Window boxes, plants between stones, climbers from a wall's foot; vines that follow a curved wall.
- [x] Flat flowers (the user, 2026-11-24): Codex-painted grey sheets for blossoms and leaves, blossoms tilted and shaded, a shadow under each. Waiting for the user's second look.
- [x] Round 3 (the user, 2026-11-24: "much better again"; lavender unseen, green shadows under flowers, popping, wind): painted spikes, shadow cards removed, steadier light, one wind in gusts. The user: "it looks pretty good to me now"; work wrapped up for now ([decision](../decisions/README.md#2026-11-24-plants-are-grown-in-code-explorations2026-11-24-procedural-foliagemd)).
- [ ] The infirmary's greenery (2026-11-27, the user: "agreed lawn is very rough. we should add way more foliage, and tune the grass look"): a softer painted lawn, `meadow` (Codex, prompts in `tools/concept-gen/prompts/2026-11-27-greenery/`), drifting in colour over the ground; woods of grown birches, cherries and wisteria with the made oaks and blossom trees; drifts of lavender and flowers in clusters; fields to the west; vines over the cove's walls (style `infirmary-garden`). Before and after: `tools/infirmary-review/img/green-before-*.png`, `green-after-*.png`. Waiting for the user's look. Tried and dropped: long-grass tufts scattered over the open lawn (they read as spots).
- [ ] **Grass fields** (2026-11-27, the user: "a deep dive on how we can make grassy fields look beautiful and natural ... I expect a lot of the game to have this type of background"): round 1 (research, nine Codex concepts; the user picked p9, the combined look) and round 2 (built in the infirmary: `kit-ground.ts`, with hex-tiled lawn, ground map, painted tufts, sweeps, worn paths as `wear` objects, margin grass and cloud shadows; five Codex critic rounds and one advisor round, last score 6.5/10, presentable) in [grass fields](../explorations/2026-11-27-grass-fields.md), on the review page [Grass Fields](https://claude.ai/artifact/929TTjs5Xjoo86f1qaHDiE). Waiting for the user's round 2 marks (`r2-*`, `r2-verdict`). Next: the critic's last notes, then ground types. Branch `worktree-grass-look` (off `worktree-infirmary-kit`; merged back there when done).
- [ ] Merge branch `foliage` into `court-kit` (it adds to `kit-render.ts`, `kit.json` and the court scene).
