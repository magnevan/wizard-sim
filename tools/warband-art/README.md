# Goblin Warband Art

The review page for the goblin warband bought from PixelLab ([exploration](../../docs/explorations/2026-11-16-warband-art.md)). Published at https://claude.ai/artifact/4WNayLNFUL2TNuffPfTMsJ.

- Raw sprites, prompts and ids: `game/content/generated/pixellab/warband/` (`briefs.json`). `_half/` holds the local half-size versions.
- Images (run from the repo root; they need Pillow):
  - `python tools/warband-art/sheet.py game/content/generated/pixellab/warband tools/warband-art/img/sheet.png`: all facings.
  - `python tools/warband-art/scene.py . tools/warband-art/img/scene.png`: the mock fight on the game's ground and props, as bought and halved (also writes `_half/`).
  - `python tools/warband-art/cmp.py . tools/warband-art/img/density.png`: halved vs generated at 40 px.
  - `python tools/warband-art/run.py`: `img/run.gif`, the bought run cycle.
- Round 2: `python tools/warband-art/pixelize.py <codex-sheet.png> <out-dir> <height> [--rows N] [--colors K]` converts a Codex sheet on magenta to pixel art; `python tools/warband-art/paths.py <b-dir> <c-dir> img/paths.png` draws the three-path comparison; `python tools/warband-art/sheet.py game/content/generated/pixellab/warband img/sheet-32.png raider-goggles-32,raider-hooded-32,archer-32,shieldbearer-32,hooker-32 5`.
- Scale: `node scripts/rig-lineup.mjs --out <dir>` (from `game/`, after `npm run build`) paints the game's rigs at 1x (copies in `img/rigs/`); `python tools/warband-art/lineup.py <b-dir> <c-dir> tools/warband-art/img/rigs img/lineup.png` puts every source beside the in-game wizard; `python tools/warband-art/scene2.py img/scene-doubled.png` is the fight at doubled density.
- The bigger wizard: `node scripts/wizscale-shots.mjs --out <dir>` (from `game/`) shoots the battery at scales 1 and 1.7; `img/wiz-*.png` are crops of it. `img/rigs/` and `img/rigs-1.7/` are `rig-lineup.mjs` at each scale.
- Motion: `python tools/warband-art/anim.py <character-dir> walk|attack img/raider-walk.gif [ms] [dirs]` loops a bought animation; `python tools/warband-art/deaths.py <sprite.png> img/deaths-code.gif img/deaths-code-strip.png` runs the game's death styles on a sprite; `python tools/warband-art/codex-death.py <codex.png> <sprite.png> img/death-codex-strip.png img/death-codex.gif` converts the Codex death strip.
- 3D models: made by `tools/goblin-3d/run.sh` (see its README); copy its `still.png`, the three GIFs and the model previews to `img/3d-*`.
- Publish `index.html` with `img/*` and `img/concept.jpg` from `docs/reference/element-order/creatures-goblins.jpg`, `img/codex-front.jpg` and `img/codex-turnaround.jpg` from `docs/reference/warband-sprites/`.
- Feedback: db collection `ratings` (`gob-raider-goggles`, `gob-raider-hooded`, `gob-archer`, `gob-shieldbearer`, `gob-hooker`, `gob-chieftain`, `gob-raider-40`, `anim-run`, round 2: `gob32-<goblin>`, `path-codex`, `wizard-pl`, `gob96-chieftain`, `anim32-walk`, `anim32-attack`, `death-code`, `death-codex`, 3D models round 1 `m3d-claude`, `m3d-codex`, `m3d-motion`, round 2 `m3d-meshy`, `m3d-motion2`, camera height `m3d-elev` {mark: 30/20/10}: {mark: keep/redo/cut, note}); `answers` (`q-1-density`, `q-2-motion`, `q-3-wiring`, `q-4-look`, `q-5-scale`, `q-6-wizard`, `q-7-chieftain`, `q-8-death`, `q-9-pipeline`, `general`: {note}).
