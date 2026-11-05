# Rune Economy

Published: https://claude.ai/artifact/HnMgNHWfFop3Xhy4eRcFAe (version 1, 2026-11-05).

A page for feeling the rune-economy options in `docs/explorations/2026-11-05-rune-economy.md` instead of only reading them. It's one self-contained `index.html` (styles and script inline, no runtime imports), in the Survive Review's look.

## What is on the page
- **The simulator.** Four scripted wizards fight the same encounter, each casting its play style's 3-rune spells the moment it can afford one (draining its fullest pools first, with a 0.8 s beat between spells). Pools start full.
  - Styles: **Fire specialist** (FFF), **Frost mage** (Cold, Water, Lightning), **4-element rotator** (Fire, Cold, Lightning, Earth), **Support** (Life, Shield, Arcane).
  - Controls: presets (Today as built, Claude's proposal), the model (Today: flat 0.22/s per element, or the shared budget), α (0 = one shared budget, 1 = regen ∝ max), R, the starting pool per element (Sigil one less), the glyphs taken (+1 all, +2 to one with an element picker, +R, Sigil) and the encounter length.
  - The rune HUD shows one style's nine pools as pips, animating through the encounter, with each pool's current regen rate (the shared rule's coupling made visible). The chart plots cumulative runes cast for all four styles at once, with today as built dashed behind them; hover for values. A table repeats the totals against today.
- **The rule** from the exploration, and what it costs.
- **The four glyphs**, each re-run with only that glyph under the current settings; "+2 to one" names each style's main element. The card text switches between the built four (Deep pools, Deep (element), Wellspring +30 %, Spare sigil +1) and the proposed set (+R at 15 %, Sigil +2) with the model.
- **Open questions** with answer boxes beside them, tagged **Recommended** and **Built now**, and "Try" buttons that set the simulator to an option. No answer means the user accepts the recommendation.
- **General notes.**

## The sim's numbers
- Today: every element that isn't full gains 0.22/s (×1.3 with Wellspring). As built, pools are 4 (Fire 5, Sigil 3); the dashed reference uses exactly that. The pool slider sets every element to the same value, Sigil one less.
- Shared budget: `regen_e = α·R·max_e/Σmax_all + (1−α)·R·max_e/Σmax_notfull` for pools that aren't full; +R multiplies R by 1.15.
- Not modelled: damage, enemies, Attune and Siphon, lulls between waves.

When the game's rune numbers change (`game/packages/sim/src/config.ts` `RUNES`, `world.ts` `regenOf`), update `TODAY_REGEN`, `AS_BUILT` and `maxes()` in `index.html` and republish.

## Answers (db doc ids)
- **Capabilities:** `db` only. If `window.claude.use('db')` returns null, the answer boxes are disabled; the simulator still works. No localStorage.
- `answers/<id>`: `{ choice, note, updatedAt }`; `answers/general`: `{ choice: null, note, updatedAt }`.
  - `q-1-alpha`: `floor` (rec) | `shared` | `per-max` | `today` (built)
  - `q-2-start`: `three` (rec) | `four` (built) | `two`
  - `q-3-lull`: `fast` (rec) | `full` | `same` (built)
  - `q-4-glyphs`: `set` (rec) | `keep` (built) | `other`
  - `general` (note only)

To read them back, run `ArtifactData` `list` on `answers`. Fold them into a new exploration or the decisions log and `docs/current-state.md`. Every recommendation here differs from what's built, so a blank answer means building the recommendation.

To publish: `Artifact` publish `index.html`, keeping the URL above.

## QA
Headless Chrome with puppeteer-core from `game/node_modules`: `index.html` at 1440 px (dark) and 390 px (light), with reduced motion so the frame shows the end of the encounter. No script errors and no horizontal scroll at 390 px.
