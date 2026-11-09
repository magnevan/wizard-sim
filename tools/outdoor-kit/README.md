# Outdoor Art Kit

Art for the outdoor sword lesson and the countryside: a free mock training yard, the proposed PixelLab purchases, and local variants of props we own (`docs/explorations/2026-11-07-outdoor-art-kit.md`).

- `yard.py` paints the mock from one terrain map under both cameras and writes `img/`. All its grass, dirt, fence, trees and small scatter are developer art. It makes no generation calls.
- `variants.py` writes the dummy, target and rack variants into `game/content/assets/props/`, and `img/variants.png`.
- `briefs.json` is the purchase list, word for word, and the page's content. Change it here, and republish.
- `index.html` is the page. Publish it with `briefs.json` and `img/*`, with `capabilities: { db: {} }`.

Ratings are in the page's db collection `ratings`: `job-ground`, `job-small`, `job-large`, `job-trees`, `job-ground-pro`, `job-iso-ground`, `job-misc` (`mark` is `keep`, `redo` or `cut`; `note`) and `var-<variant>` (`keep`, `maybe`, `cut`; `note`). Answers are in `answers`: `q-1-ground`, `q-2-camera` (which ground set), `q-3-scale`, `q-4-missing` (`note`).

`concepts.py` lays out the three place concepts (`docs/explorations/2026-11-07-outdoor-place.md`); their ratings are `place-a`, `place-b`, `place-c` and the question `q-5-place`.

`props.py` writes the bought art into the registry (scatter halved, fences mirrored, autumn recolours). `yard-bought.py`, `ground-compare.py` and `sheets.py` make the page's images. All of them are free to rerun.

The purchases are done (`docs/explorations/2026-11-07-outdoor-art-kit-results.md`). Before any new one, the description needs the user's sign-off.
