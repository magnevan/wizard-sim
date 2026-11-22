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
