# Opening Blueprint

The space-diagram stage of the opening (`docs/campaign/01-opening/space.md`): five maps at true scale, a camera preview, and the asset list for sign-off. One `index.html`; publish with `capabilities: { db: {} }`.

The plans, purchase list and questions are data at the top of the page's script (`MAPS`, `OWNED`, `JOBS`, `QS`).

Ratings are in db collection `ratings`: `map-hall`, `map-yard`, `map-battery`, `map-trail`, `map-way` (`mark`: small, right or big; `note`) and `job-defence`, `job-academy`, `job-works`, `job-buildings`, `job-kit-academy`, `job-kit-wall` (`mark`: approve, change or cut; `note`). Answers are in `answers`: `q-1-camera`, `q-2-reach`, `q-3-order` (`choice`, `note`) and `general` (`note`).

A job is bought only when its mark is `approve`.
