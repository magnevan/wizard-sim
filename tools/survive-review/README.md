# Survive Review

Published: https://claude.ai/artifact/HMQPuLJQWvMsXezHSHJn1a (version 1, 2026-11-05).

A rateable page for the Survive mode (`#survive` in the game), from `docs/explorations/2026-11-05-survive-mode.md`. It shows what is built today: the numbers come from `game/packages/sim/src` (`survive.ts`, `config.ts` `PERKS`, `world.ts` `PU`, `PU_CAP`, `SURVIVE_ROCK`, `SURVIVE_GATES`, `ALTAR_SPOTS`, `regenOf`) and the glyphs from the client's `art/perks.ts`. When those change, update `copy.js` (and the rock list in `scenes.js`) and republish.

Everything is drawn in the Pixel Battlefield style (high-res pixel art, 3/4 camera). The page is self-contained, with no runtime imports from other tool directories. Every scene is a pure function of its local time, so loops are seamless and any frame can be reproduced.

## What is on the page
- **The mode:** the arena map (top down, 4 art px per unit, the real 40 rock segments and six gates) animated through one loop (wave, breather, pick, lull), the loop's four phases with their times (highlighted in step with the map), the facts, the pick vignette (altars rise, P1 and P2 each take one) and the eight authored waves.
- **Power-ups:** 12 built (Echo, Lingering, Quickstep and Clockwork redesigned on 2026-11-06, `docs/explorations/2026-11-06-survive-powerups-2.md`), 1 designed (Triage, the proposed Bloom replacement), 2 cut (Slipstream, Bloom) and Rally (everyone's by default since round 1), each a rateable card with its altar glyph, the rule, what it does with real numbers, what a partner sees, the cost, the pillar note, its stack cap and status (built / designed / cut / default). Rally and Echo are wide cards with their vignettes. The dropped ideas are listed, not rated.
- **Open questions** with answer boxes beside the text. Each option is tagged **Recommended** (Claude's pick) and/or **Built now** (what the game does). No answer means the user accepts the recommendation. Q5, Q7 and round 1's answers (Q8, the untimed pick, the power-up cuts) are shown as decided; Q4 and Q8 are off the page.
- **General notes.**

## Slugs (db doc ids)
- **Ratings** (`ratings/<slug>`): `pu-three` (was `pu-deep`, Deep pools, before 2026-11-05), `pu-deep-el`, `pu-wellspring`, `pu-shield-sigil` (was `pu-spare-sigil`), `pu-bedrock`, `pu-pyre`, `pu-charm`, `pu-clockwork-v2`, `pu-echo-v2`, `pu-glass-heart`, `pu-lingering`, `pu-quickstep-v2` (built); `pu-rally` (default); `pu-slipstream`, `pu-bloom` (cut); `pu-triage` (designed). 16 on the page. Retired with their ratings kept in the db (round 1, all rated Maybe): `pu-clockwork` (free shots), `pu-echo` (a free Double), `pu-long-fuse` (became `pu-lingering`), `pu-quickstep` (40% shorter recovery).
- **Answers** (`answers/<id>`), with choice ids:
  - `q-pillar1`: `run-only` (rec, built) | `never` | `case`
  - `q-1-pick`: `altars` (rec, built) | `shared` | `menu`
  - `q-2-timing`: `during` (rec, built) | `after`
  - `q-3-flat`: `both` (rec, built) | `wellspring` | `neither`
  - `q-4-bloom`: off the page since round 1 (Bloom is cut)
  - `q-6-curve`: `loop` (rec, built) | `pool` | `more`
  - `q-8-zoom`: answered in round 1 (separate screens, ally arrows), off the page
  - `q-9-keep`: `keep` (rec, built) | `open` | `remove`
  - `q-10-rally`: `hit-drains` (rec) | `empty` (built) | `drain-all`
  - `q-11-echo-free`: off the page since round 2 (Echo has no Double any more)
  - `q-12-echo-run`: `oneshot` (rec, built) | `run`
  - `q-13-echo-key`: `weighted` (rec, built) | `only` | `even`
  - `q-14-clockwork`: `nobind` (rec, built) | `minus-one` | `cheap-shots`
  - `q-15-linger`: `as-built` (rec, built) | `auras` | `bigger`
  - `general` (note only)

Never rename a slug that has ratings. A reworked card gets a new slug with `-v2`.

## Ratings and answers
- **Capabilities:** `db` only (the page calls `window.claude.use('db')`). If that returns null, the page renders read-only and disables the controls. It doesn't use localStorage.
- `ratings/<slug>`: `{ mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }`.
- `answers/<question id>`: `{ choice, note, updatedAt }`; `answers/general`: `{ choice: null, note, updatedAt }`.

To read them back, run `ArtifactData` `list` on `ratings` and `answers`. Fold them into the survive exploration (a new dated exploration or an addendum), the decisions log and `docs/current-state.md`. Where the recommendation differs from what's built (Q3, Q10), a blank answer means building the recommendation.

## Files
- `index.html`: the page (styles, header, sections).
- `app.js`: cards, glyph tiles, canvas sizing, the animation loop (only on-screen scenes render, at about 30 fps), the loop highlight, and the db wiring (same pattern as `tools/weapon-moves/app.js`).
- `copy.js`: the power-ups (text, numbers, glyphs, status), the loop, the waves, the questions (`[id, label, sub, flags]`, flags `rec` / `built`) and the decided ones.
- `scenes.js`: the vignettes `pick`, `rally`, `echo` (stage scenes) and `arena` (the top-down map).
- **Copied from `tools/weapon-moves/`:** `core.js`, `actors.js` and `stage.js` unchanged; `pixel.js` with `%` and `:` added to the 3x5 font.
- `filmstrip.html`: QA only, **don't publish it**. Frames side by side: `?ids=rally,echo&n=6&scale=2&times=0.5,1`.

To publish: `Artifact` publish `index.html` with `files` for the seven js files (not `filmstrip.html`), keeping the URL above.

## URL parameters (index.html)
- `?t=<sec>` freezes every scene.
- `?scale=<n>` forces the pixel scale.
- `?static=1` behaves like prefers-reduced-motion.

## QA
Headless Chrome with puppeteer-core from `game/node_modules` (`--use-angle=swiftshader --enable-unsafe-swiftshader --allow-file-access-from-files`): the filmstrip of all four scenes, and `index.html` at 1440 px and 390 px with a fake db injected. No script errors and no horizontal scroll at 390 px.

## Known weak spots
- The goblin rig has no attack swing, so hits are a white slash arc on the target.
- The map compresses the loop (wave 6 s, breather 1.5 s, pick 4 s, lull 3.5 s) and draws enemies as dots walking straight to the nearest keep door.
- Triage's glyph is a draft; the game has none yet. Every built power-up's glyph is the game's (`art/perks.ts`).
- The echo scene shows bolts only; a beam's echo (a second beam trailing your aim) is only in the game.
