# Weapon Moveset Review

A rateable page for the full weapon set and move sets proposed in `docs/explorations/2026-11-04-weapons-and-movesets.md`: empty queue = weapon moves on every cast gesture, the lead element picks the weapon (Sigil) or the guard (Shield), and a weapon hand plus a guard hand with two-handed exceptions. Everything is drawn in the Pixel Battlefield style (high-res pixel art, 3/4 camera) with the rigs and kit copied from `tools/spell-vfx/`. The page is self-contained, with no runtime imports from other tool directories.

Every vignette is a pure function of its local time, so loops are seamless and any frame can be reproduced. The six moves share one pose track each (`weapons.js` `MOVES`), so the tells are the same across weapons; only a few weapon × move pairs override the pose where the doc gives them a different shape (spear pokes, spear dash, spear brace, whip cracks, hook throws, maul shoulder bash and rooted plant, staff brace, boomerang sword).

## What is on the page
- Header: the grammar (gesture → move → uses) as a table.
- **8 weapon cards** (staff, water, life, cold, lightning, arcane, fire, earth). Each card has a held vignette (conjure, hold, one swing), the facts (signature, silhouette, feel, hands, reach) and six move vignettes. The key in each screen's corner shows which gesture is pressed.
- **8 guards**, each showing its block behaviour (Mirror reflects a parried arrow, Bulwark takes melee and an arrow while you walk slowly, Ember thorns ignite a clubber, Rime frosts the floor so a charger slips, Spark ring discharges a chain arc on a parry, Tide shoves and soaks, Prism bends a beam, Leaf heals the ally behind you).
- **Both hands**: spear + Bulwark, sword + Ember targe, a maul conjured over a Mirror buckler, and the two-handed table.
- **Open questions** 1, 3, 4 and 5 from the doc, with answer boxes beside the text. Question 2 (block on Space) is shown as decided.

## Slugs (db doc ids)
- Weapon cards: `w-staff`, `w-water`, `w-life`, `w-cold`, `w-lightning`, `w-arcane`, `w-fire`, `w-earth`.
- Moves: `w-<weapon>-<move>`, with move in `strike | thrust | heavy | sweep | send | defend` (48 slugs, for example `w-fire-thrust`).
- Guards: `g-mirror`, `g-bulwark`, `g-ember`, `g-rime`, `g-spark`, `g-tide`, `g-prism`, `g-leaf`.
- Both hands: `d-spear-bulwark`, `d-sword-ember`, `d-maul-over-buckler`, `d-hands-table`.
- Questions: `q-grammar` (Q1), `q-guards` (Q3), `q-hands` (Q4), `q-uses` (Q5), plus `general`.

That makes 68 rated items. Never rename a slug that has ratings; give a reworked visual a new slug (`-v2`).

## Ratings and answers
- Capabilities: `db` (the page calls `window.claude.use('db')`). If that returns null, the page renders read-only and disables the rating controls. It doesn't use localStorage.
- `ratings/<slug>`: `{ mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }`.
- `answers/<question id>`: `{ choice, note, updatedAt }`. The choice ids are in `copy.js` (`questions[].choices`); the recommended option of each is the first one and is labelled "(recommended)". No answer means the user accepts the recommendation.
- `answers/general`: `{ choice: null, note, updatedAt }`.

To read them back: `ArtifactData` `list` on `ratings` and `answers`. Then fold them into `docs/ideas/conjured-weapons.md` and a new exploration.

## Files
- `index.html`: the page (styles, header, sections).
- `app.js`: cards, canvas sizing, the animation loop (only on-screen cards render, at about 30 fps), and the db wiring (same pattern as `tools/spell-vfx/app.js` and `tools/engine-choice`).
- `copy.js`: captions for all 48 moves, the two-handed table, and the open questions.
- `weapons.js`: the weapon and guard data, `prop()` (draws a held weapon between a grip and a tip point), `track()` (keyframed poses), the six `MOVES`, per-weapon pose overrides, `rig()` (turns a track into an actor rig with a motion smear), and `guard()` (the eight guard sprites).
- `moves.js`: every vignette (`PB.WMV`): the default scene per move plus the weapon-specific effects, the weapon cards, the guards, and the both-hands scenes.
- Copied from `tools/spell-vfx/`: `core.js`, `pixel.js`, `fx.js` unchanged; `kit.js` (the shared helpers from `vfx-forms.js`); `stage.js` (the stage size is now per vignette, `w`/`h`); `actors.js` (adds `s.rig` for posing both hands and drawing a held weapon or guard inside the rig, and widens the actor box to 80 × 76 for long weapons).
- `filmstrip.html`: QA only, **don't publish it**. It shows frames side by side: `?weapon=fire`, `?kind=move|weapon|guard|dual`, `?move=sweep`, `?ids=a,b`, `&n=7&scale=2`, `&times=0.5,1`.

## URL parameters (index.html)
`?t=<sec>` freezes every vignette, `?only=<slug>,<slug>` shows only those, `?scale=<n>` forces the pixel scale, and `?static=1` behaves like prefers-reduced-motion.

## QA
Screenshots were taken headless with puppeteer-core from `game/node_modules` (Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader`, `--allow-file-access-from-files`): `filmstrip.html?weapon=<id>&n=7&scale=2` for each weapon, `?kind=guard` and `?kind=dual`, then `index.html` at 1440 px and 390 px. No script errors, and there's no horizontal scroll at 390 px.

## Known weak spots
- The vignettes are small (128 × 80 for moves). At 2× the weapons read mostly by colour and motion; at the page's usual 3× they read better.
- Hit flashes turn a struck body fully white for a few frames, the same as the Spell VFX rigs.
- The Healing hands have no weapon silhouette, so their moves read through the allies' health bars and the green motes.
- The maul head picks up the lilac light around the wizard and can look pinkish.
- The staff's Send (a ping for your partner) is a proposal; the doc gives the staff no Send.
- Knocked-down goblins use the base topple, which reads as a green lump.
