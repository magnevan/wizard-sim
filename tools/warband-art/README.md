# Goblin Warband Art

The review page for the goblin warband bought from PixelLab ([exploration](../../docs/explorations/2026-11-16-warband-art.md)). Published at https://claude.ai/artifact/4WNayLNFUL2TNuffPfTMsJ.

- Raw sprites, prompts and ids: `game/content/generated/pixellab/warband/` (`briefs.json`). `_half/` holds the local half-size versions.
- Images (run from the repo root; they need Pillow):
  - `python tools/warband-art/sheet.py game/content/generated/pixellab/warband tools/warband-art/img/sheet.png`: all facings.
  - `python tools/warband-art/scene.py . tools/warband-art/img/scene.png`: the mock fight on the game's ground and props, as bought and halved (also writes `_half/`).
  - `python tools/warband-art/cmp.py . tools/warband-art/img/density.png`: halved vs generated at 40 px.
  - `python tools/warband-art/run.py`: `img/run.gif`, the bought run cycle.
- Round 2: `python tools/warband-art/pixelize.py <codex-sheet.png> <out-dir> <height> [--rows N] [--colors K]` converts a Codex sheet on magenta to pixel art; `python tools/warband-art/paths.py <b-dir> <c-dir> img/paths.png` draws the three-path comparison; `python tools/warband-art/sheet.py game/content/generated/pixellab/warband img/sheet-32.png raider-goggles-32,raider-hooded-32,archer-32,shieldbearer-32,hooker-32 5`.
- Publish `index.html` with `img/*` and `img/concept.jpg` from `docs/reference/element-order/creatures-goblins.jpg`, `img/codex-front.jpg` and `img/codex-turnaround.jpg` from `docs/reference/warband-sprites/`.
- Feedback: db collection `ratings` (`gob-raider-goggles`, `gob-raider-hooded`, `gob-archer`, `gob-shieldbearer`, `gob-hooker`, `gob-chieftain`, `gob-raider-40`, `anim-run`, round 2: `gob32-<goblin>`, `path-codex`: {mark: keep/redo/cut, note}); `answers` (`q-1-density`, `q-2-motion`, `q-3-wiring`, `q-4-look`, `general`: {note}).
