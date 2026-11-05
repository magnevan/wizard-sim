# Weapon Moveset Review

**Round 3** (2026-11-05): `round3.js` adds the redesigns built in the game from the round-2 ratings. Cards with a round-3 slug are built in the Round 3 section at the top; the rest stay below. New slugs: `w-arcane-v3` (+ `-strike`, `-heavy`, `-special`: the Arcane wand, Siphon), `w-life-mend`, `w-cold-send-v3`, `g-mirror-v3`, `g-mirror-retreat-v2`, `g-bulwark-retreat-v2`, `g-rime-defend-v2`, `g-tide-v3`, `g-prism-v3`, `g-prism-defend-v2`, `g-leaf-defend-v2`, `g-leaf-retreat-v2`. `weapons.js` `CUR`, `GSLUG` and `PREV3` map each slot to its current slug and each new slug to the round-2 slug whose rating shows beside it. New questions: `q-carry`, and in the "How elements mix" section `q-mix-all`, `q-mix-coat`, `q-mix-scale`, `q-mix-weapons` (`copy.js` `mixQuestions`).

A rateable page for the weapons and guards. **Round 2** (2026-11-05) follows the round-1 verdicts in `docs/explorations/2026-11-05-weapons-review-1.md` and the guard design in `docs/explorations/2026-11-05-guards.md`.

Grammar v2 with an empty queue:
- **The weapon:** RMB tap Strike, RMB hold Heavy, Shift+RMB Special.
- **The guard:** Shift+LMB Retreat, Space Defend (hold to block, tap to parry).

There are no two-handed weapons, and a weapon has about 30 uses. Everything is drawn in the Pixel Battlefield style (high-res pixel art, 3/4 camera), with the rigs and kit copied from `tools/spell-vfx/`. The page is self-contained, with no runtime imports from other tool directories.

Every vignette is a pure function of its local time, so loops are seamless and any frame can be reproduced.

## What is on the page
- **Header:** the v2 grammar table (gesture → move → defined by → uses).
- **8 weapon cards** (staff, water, life, cold, lightning, arcane, fire, earth). Each card has:
  - the held vignette and the facts;
  - exactly three move vignettes: Strike, Heavy and Special.

  Kept moves keep their round-1 slug, so the old rating shows on them. Changed moves have a `-v2` slug, and the round-1 rating and note of the old slug sit beside them, read-only.
- **8 guard cards** (mirror, bulwark, ember, rime, spark, tide, prism, leaf). Each card has:
  - the passive, the trade-off and a resistance table;
  - a Defend vignette (block and parry) and a Retreat vignette.
- **Open questions** from the guards doc, with answer boxes beside the text, plus `answers/general`.

Round 1 had these, and round 2 dropped them: Thrust, Send, the weapon Defend, the arcane hook, the both-hands scenes and the two-handed table. Their ratings stay in the db.

## Slugs (db doc ids)
- **Weapon cards:** `w-staff`, `w-water-v2` (the trident), `w-life`, `w-cold`, `w-lightning`, `w-arcane-v2` (the Echo focus), `w-fire`, `w-earth`.
- **Weapon moves (Strike / Heavy / Special),** also listed in `weapons.js` `R2`:
  - staff: `w-staff-strike`, `w-staff-heavy`, `w-staff-sweep`
  - water: `w-water-strike`, `w-water-heavy`, `w-water-sweep`
  - life: `w-life-strike`, `w-life-heavy-v2` (healing link), `w-life-sweep`
  - cold: `w-cold-strike`, `w-cold-heavy-v2` (long dash), `w-cold-send-v2` (javelin on Shift+RMB, no recall)
  - lightning: `w-lightning-strike`, `w-lightning-heavy`, `w-lightning-sweep`
  - arcane: `w-arcane-v2-strike`, `w-arcane-v2-heavy` (Echo), `w-arcane-v2-special` (Copy)
  - fire: `w-fire-strike`, `w-fire-heavy-v2` (fire wave), `w-fire-sweep`
  - earth: `w-earth-strike`, `w-earth-heavy-v2` (directed quake), `w-earth-sweep`
- **Guards:** `g-<id>-v2` (the card: passive and resistances), `g-<id>-defend` and `g-<id>-retreat`. `<id>` is one of `mirror | bulwark | ember | rime | spark | tide | prism | leaf`.
- **Questions:** `q-res-when`, `q-retreat-cost`, `q-guard-mix`, `q-brace`, plus `general`. Round-1 answers (`q-grammar`, `q-guards`, `q-hands`, `q-uses`) stay in the db but aren't shown.

That's 56 rated items on the page. Never rename a slug that has ratings. A reworked visual gets a new slug with `-v2`, and a `-v2` slug's round-1 doc is the same id without `-v2` (`WM.prevSlug`).

## Ratings and answers
- **Capabilities:** `db` (the page calls `window.claude.use('db')`). If that returns null, the page renders read-only and disables the rating controls. It doesn't use localStorage.
- `ratings/<slug>`: `{ mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }`.
- `answers/<question id>`: `{ choice, note, updatedAt }`. The choice ids are in `copy.js` (`questions[].choices`). Each question's first option is the recommended one and is labelled so. No answer means the user accepts the recommendation.
- `answers/general`: `{ choice: null, note, updatedAt }`.

To read them back, run `ArtifactData` `list` on `ratings` and `answers`. Then fold them into `docs/ideas/conjured-weapons.md` and a new exploration.

## Files
- `index.html`: the page (styles, header, sections).
- `app.js`: cards, canvas sizing, the animation loop (only on-screen cards render, at about 30 fps), the read-only round-1 notes, and the db wiring (same pattern as `tools/spell-vfx/app.js`).
- `copy.js`: the grammar table, the captions per slug, the guard captions and the open questions.
- `weapons.js`:
  - the weapon and guard data (guards: block, parry, retreat, passive, trade-off, resistances) and the `R2` slug map;
  - `prop()` (draws a held weapon, including the trident and the Echo orb with its remembered runes), `track()` (keyframed poses), `MOVES`, `rig()` and `guard()` (the eight guard sprites).
- `moves.js`: every vignette (`PB.WMV`). It holds the default Strike / Heavy / Sweep scenes plus the weapon-specific ones, the round-2 redesigns (`cold-heavy2`, `cold-javelin`, `fire-heavy2`, `earth-heavy2`, `life-heavy2`, `arcane2-*`), the weapon cards, the guard Defends and the guard Retreats.
- **Copied from `tools/spell-vfx/`:**
  - `core.js`, `pixel.js` and `fx.js`, unchanged;
  - `kit.js` (the shared helpers);
  - `stage.js` (per-vignette size);
  - `actors.js` (`s.rig` for posing both hands and drawing a held weapon or guard).
- `filmstrip.html`: QA only, **don't publish it**. It shows frames side by side. Parameters: `?ids=a,b`, `?kind=move|weapon|guard`, `?weapon=fire`, `&n=7&scale=2`, `&times=0.5,1`.

## URL parameters (index.html)
- `?t=<sec>` freezes every vignette.
- `?only=<slug>,<slug>` shows only those.
- `?scale=<n>` forces the pixel scale.
- `?static=1` behaves like prefers-reduced-motion.

## QA
Screenshots were taken headless with puppeteer-core from `game/node_modules`. Chrome ran with `--use-angle=swiftshader --enable-unsafe-swiftshader` and `--allow-file-access-from-files`.
- The filmstrip for every new vignette.
- `index.html` at 1440 px and 390 px, with a fake db injected so the round-1 notes show.

There were no script errors, and there's no horizontal scroll at 390 px.

## Known weak spots
- **The Echo orb:** the arcane palette is magenta, so the orb sits close to the red robe. The remembered-rune pips are small at 2× and read better at the page's usual 3× to 4×.
- **The javelin:** the in-flight ice javelin is only on screen for about 0.3 s. The pinned shard and the frost carry the read.
- **The quake:** the rocks read mostly as a dusty line at 2×.
- **The Phase retreat** tints the wizard magenta and dithers it. It reads as "half there" but is close to the Prism's colour.
- **The Defend vignettes** are the round-1 guard scenes. Only the Bulwark gained a parry (a bash). The Ember, Rime, Tide and Leaf parries are described but not animated.
- **The trident** is drawn with both hands on the shaft in its kept moves, though it's one-handed now. The maul is the same.
- Knocked-down goblins use the base topple, which reads as a green lump.
