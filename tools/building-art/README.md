# Building art from Codex

Rough-stage art for places, made with the Codex image model (free on the user's subscription), so a blockout looks like the concept art instead of grey boxes. Started 2026-11-22 for the drill yard, after the user found the blockout far below the concepts. PixelLab stays for finished art. A painted whole-floor backdrop was considered and rejected (Codex's image size can't cover a level).

## Buildings

A building is painted from its own grey box, so it lands exactly where the box stood:

1. `python tools/building-art/silhouette.py <building> --out <dir>` draws the block as the game's camera sees it (the same projection as `game/packages/client/src/art/massing.ts`) on magenta, at 1774 × 887 (Codex's native size; a building too big is drawn smaller and its json says by how much), plus its mask and anchor. Keep `BUILDINGS` in step with the blocks in `massing.ts`.
2. Codex paints it: `tools/concept-gen/gen.sh <prompt> <out-dir> <shape.png> <style reference>` with `paint.txt` (fill in `OUTNAME` and `BUILDINGNOTE`; `prompts/` holds each building's as sent). Pass a painted neighbour as the first style reference so the set stays consistent.
3. `python tools/building-art/cut.py <paint.png> <dir> <building>` cuts the paint to the mask (removing magenta and its fringe), scales it back up, and writes `game/content/assets/buildings/<building>.png` and `.json` (the anchor: where the block's plan point (x1, y1, 0) falls).
4. In `massing.ts`, give the block `art: '<building>'`; a block painted into a neighbour's picture gets `paintedIn: '<that block id>'`.

The raw paints, shapes and ground sheet are kept in `game/content/generated/codex/`.

What worked (2026-11-22): the paint followed the grey box's outline closely (98 to 99.8 % of the mask filled) with no extra steps. Naming the dark shapes as windows and the brown one as a door put them where the box had them. An object that isn't a building (the armillary) is painted at its true size and leaves gaps, which is fine.

Known limit: the grey boxes and their art are drawn under everything (`zIndex -1e9`), so a prop or body north or west of one shows on top of it. Fine for buildings on a map's far edges; an object you can walk behind (the armillary) needs sorting with the bodies.

## Ground

`ground.txt` asks for a sheet of six swatches (grass, dirt, sand, flagstone, cobble, forest leaves); `python tools/building-art/ground-tiles.py <sheet.png>` cuts them, scales them to the game's pixel size (`--scale`, 0.25: Codex draws about four times larger) and makes each tile by blending it with a half-shifted copy. It replaces those materials for every room.

## 3D kit pieces (the stylised-3D spike, 2026-11-23)

The spike's own files are archived on tag `archive/kit-test-2026-11-23`, not on this branch: the `prompts/iso-*.txt` and `tex-*.txt` prompts, `tile3d.py` (seamless 3D textures), the court-kit models and `spike3d_place.py`. Read one with `git show archive/kit-test-2026-11-23:<path>`. Kit pieces are now made for the modular kit: `tools/kit/` ([flexible building](../../docs/explorations/2026-11-23-flexible-building.md)).

The pipeline the Meshy agent uses, with the image step done free in Codex:

1. **Isolate.** Codex draws each piece on its own from a concept picture. The prompts are `prompts/iso-*.txt`, in the agent's pattern: "Isolate and generate a single modular … game asset module featuring: … Standalone straight front-on orthographic view on a plain solid light grey background, perfectly centered, no ground plane, flowers, or characters." Attach the concept scene. The agent itself uses GPT Image 2.5 Sunburst for this step, and Codex is the same family.
2. **Model.** Meshy image to 3D: `ai_model` meshy-7.1, `enable_pbr` true, `texture_model` meshy-7 at 2k, `should_remesh` true with `target_polycount` about 30,000 (12,000 for a small piece). About 30 credits a piece.
3. **Place.** Now: keep the downloads in `game/content/generated/meshy/kit-src/`; `tools/kit/fit.py` (Blender) fits each to its piece in `tools/kit/kit.json` (the fitted models are in `game/content/generated/meshy/kit/`), and `tools/kit/compile.py` places them from a layout for the greybox page (`game/packages/client/kit3d.html`). The kit's pieces used Meshy smart topology (meshy-t2.5, about 4–6k triangles, 15 credits each) rather than step 2's settings. In the spike (archived on the tag), the downloads were in `game/content/generated/meshy/court-kit/`, placed by `tools/place-plans/spike3d_place.py` and drawn by `game/packages/client/world3d.html`.

What made round 1 splotchy: soft crops from a painted sheet as the input, and smart topology (meshy-t2) at 8,000 triangles with one colour texture and no normal map.
