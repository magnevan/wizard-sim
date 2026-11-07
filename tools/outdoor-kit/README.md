# Outdoor Art Kit

Art for the outdoor sword lesson and the countryside: a free mock training yard, the proposed PixelLab purchases, and local variants of props we own (`docs/explorations/2026-11-07-outdoor-art-kit.md`).

- `yard.py` paints the mock from one terrain map under both cameras and writes `img/`. All its grass, dirt, fence, trees and small scatter are developer art. It makes no generation calls.
- `variants.py` writes the dummy, target and rack variants into `game/content/assets/props/`, and `img/variants.png`.
- `briefs.json` is the purchase list, word for word, and the page's content. Change it here, and republish.
- `index.html` is the page. Publish it with `briefs.json` and `img/*`, with `capabilities: { db: {} }`.

Ratings are in the page's db collection `ratings`: `job-ground`, `job-small`, `job-large`, `job-trees` (`mark` is `approve`, `change` or `skip`; `note`) and `var-<variant>` (`keep`, `maybe`, `cut`; `note`). Answers are in `answers`: `q-1-ground`, `q-2-camera`, `q-3-scale`, `q-4-missing` (`note`).

**Buy only what's marked `approve`.** Record the balance before and after, and save raw results and prompts in `game/content/generated/` (its README has the rules). A 32 px sheet takes its size from its style images, so shrink those to 32 px first: `size` can't be set alongside them.
