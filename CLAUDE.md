# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A design sandbox for a cooperative spellcasting game inspired by Magicka, plus the game itself (Wizard Sim). The design writing and review pages decide what the game should be; `game/` builds it. The game is public and playable at https://magnevan.github.io/wizard-sim/ (repo https://github.com/magnevan/wizard-sim), deployed on every push to main, so keep main working. It's still early: ideas matter more than polish.

For what's true right now (controls, rules, rooms, netcode, open questions), read `docs/current-state.md`.

The source of truth for what the game is trying to be is `docs/vision.md`. Read it before proposing or judging a mechanic. When an idea conflicts with a pillar, say so plainly; don't quietly bend the pillar.

## Layout

- `docs/vision.md`: design pillars and open questions. It changes slowly and only when the user agrees.
- `docs/current-state.md`: one page of what's true now, each line linked to its decision, plus the live open questions. Update it when a decision changes what's built.
- `docs/archive/`: old worklogs, kept as records.
- `docs/world/`: living pages about the setting, edited as it changes (unlike explorations). `elements.md` holds each element's essence, which informs both the world and the spells.
- `docs/campaign/`: how campaign segments get made (`README.md`, stage by stage), one folder per segment, and `canon.md`, the one page saying which story facts the user has approved. Read `canon.md` before writing story; everything not in its Approved section is an option.
- `tools/segments/`: one working document per campaign segment, as an artifact. Each folder has a shared-layout `index.html` and its content in `segment.js`; see `tools/segments/README.md`. `01-opening/` is the opening, beats 1 to 7, and is where those beats are kept. Marks are in its db collection `ratings` (`map-*`, `job-*`; a job is bought only when marked `approve`). Notes are per round (the round is `round:` in `segment.js`, currently 5, so `r5-*`) in `answers` and `ratings`.
- `tools/art-import/`: free scripts that turn bought art into game assets: `ground.py` cuts the painter's textures, `props.py` registers the opening's props, `kits.py` prepares the wall kits, `defence.py` and `stakes_broken.py` the battery's defences and broken stakes.
- `tools/turret-3d/`: the turret head as a Blender model rendered to palette-locked pixel-art facings; see its README.
- `docs/reference/`: notes on Magicka and other reference games. Facts recalled from memory are marked *(unverified)*.
- `docs/explorations/`: dated, long-form thinking sessions (`YYYY-MM-DD-topic.md`). Once written, they're a record and aren't rewritten. Newer explorations supersede older ones.
- `docs/ideas/`: one file per mechanic idea, written from `docs/ideas/_template.md`. Each has a status: `raw` → `developing` → `prototyping` → `adopted` / `parked` / `rejected`.
- `docs/decisions/`: an append-only log of design decisions and the reasons for them (`decisions/README.md` is the index).
- `tools/spell-gallery/`: a published page of animated spell vignettes the user rates. Ratings are stored in the artifact's db, and Claude reads them back into the docs. See its README for adding spells, the headless-Chrome filmstrip check, and how to read ratings.
- `tools/spell-tree/`: the Spell Tree Explorer, an interactive page for proposal A. `resolver.js` holds the rules. The user's answers to the open questions are in its db collection `answers`.
- `tools/spell-atlas/`: the Spell Atlas, the whole tree under proposal C as one form × cast grid, plus a Structures section. `depth-c.js` counts what each rune-pool depth can reach. `rules-c.js` holds the rules (runs in node too). `audit-c.js` and `audit-a1.js` count element additions that change nothing; run them after any rule change, and keep inert additions at 0. Its db holds `answers` (questions) and `cells` (per-cell ratings).
- **Feedback lives in artifact dbs.** At the start of every session, read all of them (the root `README.md` lists every published page's URL, as does the memory file of artifact URLs) and fold any new ratings or notes into the docs before doing anything else.
- `tools/art-styles/`: the Art Style Explorer, the same fight in six art directions. Ratings are in its db collection `ratings`.
- `tools/art-pixel-hd/`: Pixel Battlefield, the leading art direction (high-res pixel art, 3/4 camera) shown full screen with structures and the rune HUD. Answers are in its db collection `answers`.
- `tools/spell-vfx/`: the Spell VFX gallery, looping pixel-art vignettes of the current spells in the Pixel Battlefield style. Its `rules-c.js` is a snapshot of the Atlas rules: re-copy it after rule changes. Ratings are in its db collection `ratings`, one doc per vignette slug; card questions (`q-*`) and `general` are in `answers`. It also shows the enemies' attacks (`vfx-attacks.js`, a port of `game/.../art/enemy-attacks.ts`): re-port it when those change. `filmstrip.html` is QA only, so don't publish it.
- `tools/weapon-moves/`: the Weapon Moveset Review, the conjured weapons and guards drawn move by move, in rounds (round 4 is the Prism's Capacitor and Lance). Ratings are in its db collection `ratings`, question answers in `answers`. Its README lists each round's slugs.
- `tools/survive-review/`: the Survive Review, the Survive mode's arena, wave loop and power-ups (Rally and Echo animated) with its open questions. Ratings are in its db collection `ratings` (one doc per power-up, `pu-<name>`), answers in `answers` (`q-<n>-<short>`, `q-pillar1`, `general`). Its `copy.js` holds the game's numbers: update it when Survive changes.
- `tools/rune-economy/`: the Rune Economy page, a rune-flow simulator for the regen options (the shared budget it chose is built). One `index.html`. Answers are in its db collection `answers` (`q-1-alpha`, `q-2-start`, `q-3-lull`, `q-4-glyphs`, `general`).
- `tools/enemy-roster/`: the Enemy Roster, candidate enemies from Magicka 1 and 2 and the enemy and companion AI plan (`explorations/2026-11-14-enemies-and-ai.md`). One `index.html`. Marks are in its db collection `ratings` (`en-<id>`: {mark: build/maybe/cut, note}; `ai-<id>`: {mark: yes/maybe/no, note}), answers in `answers` (`q-1-first`, `q-2-casters`, `q-3-tokens`, `q-4-panic`, `q-5-who`, `q-6-orders`, `q-7-rules`, `general`: {choice, note}).
- `tools/training-grounds/`: the Training Grounds Blueprint, an art-free concept of the academy's outdoor training ground: seven shapes, a terraced plan and section as inline SVG, zones with sizes (`explorations/2026-11-07-training-grounds.md`). One `index.html`. Marks on shapes are in its db collection `ratings` (`dir-1` … `dir-7`: {mark, note}); notes in `answers` (`q-1-role`, `q-2-shape`, `q-3-magic`, `q-4-academy`, `general`, `zone-1` … `zone-7`: {note}).
- `tools/outdoor-kit/`: the Outdoor Art Kit page, the bought art for the outdoor sword lesson: a mock yard (`yard-bought.py`), the registry writer (`props.py`) and the prompts as sent (`briefs.json`). See `explorations/2026-11-07-outdoor-art-kit-results.md`. Ratings are in its db collection `ratings` (`job-*`: {mark: keep/redo/cut, note}; `var-*`: {mark, note}), answers in `answers` (`q-1-ground`, `q-2-camera`, `q-3-scale`, `q-4-missing`, `q-5-place`). The place concepts (`concepts.py`) are rated as `place-a/b/c`.
- `tools/art-trial/`: the Academy Art Trial page, comparing art sources on the same props (`explorations/2026-11-06-art-trial.md`) and, in round 2, the mock room's art (`explorations/2026-11-06-art-trial-round-2.md`). It also holds the local prop and variant tools (`props.py`, `variants.py`, `imgops.py`). Ratings are in its db collection `ratings` (`src-code`, `src-pixellab`, `src-pixflux`, `src-gemini-pro`, `src-gemini-flash`: {mark, note}), answers in `answers` (`q-1-role`, `q-2-detail`, `q-3-plan`, `q-4-next`: {note}). Its `gemini.mjs` calls a paid key from the gitignored `.secrets/gemini.key` (capped at 20 calls a day; use it sparingly).
- `tools/sound-gallery/`: the Sound Gallery, the game's sounds to rate: every element layer and cast shape, a spell mixer, and the rune, room and wall variations side by side (`explorations/2026-11-06-sound.md`). `engine.js` and `bank.js` are generated (`npm run sound-gallery` in `game/`). Ratings are in its db collection `ratings` (one doc per sound id, `el-fire`, `shape-nova`, `var-env-cave`, `mixer`...: {mark, note}), answers in `answers` (`q-1-feel`, `q-2-source`, `q-3-element-identity`, `q-4-variations`, `q-5-ai-sfx`).
- `tools/world-progression/`: the World and Progression page (`explorations/2026-11-07-world-and-progression.md`): fields map, element essences, zone bands, unlock pacing, shrines, encounters, story spines. One `index.html`. Answers are in its db collection `answers` (`q-1-bands`, `q-2-total`, `q-3-pacing`, `q-4-held`, `q-5-cohort`, `q-6-spine`, `q-7-shrines`, `q-8-encounters`, `q-9-pool`, `q-10-gear`, `q-11-essences`, `general`; round 3: `r3-1-swords`, `r3-2-tenth`, `r3-3-dream-when`, `r3-4-dream-holds`, `r3-5-pools`, `r3-6-veins`, `r3-7-hush`, `r3-8-map`, `r3-general`; round 4: `r4-1-sigil`, `r4-2-mixes`, `r4-general`: {choice, note}).
- `tools/tenth-element/`: the Tenth Element page (`explorations/2026-11-08-tenth-element.md`): nine candidates with vignettes. Ratings in db `ratings` (`el-<id>`: {mark, note}), answers in `answers` (`q-1-verb`, `q-2-enemy-first`, `q-3-cure`, `q-4-air-cost`, `general`).
- `tools/world-map/`: the Field Atlas, a seeded world generator (fields from the land, towns where fields meet), painted as a fantasy map (`explorations/2026-11-08-fantasy-map.md`). `gen.js` is the world, `chart.js` the drawing, `landmarks.js` the landmark catalogue. Kept worlds in db `seeds` (`seed-<n>`: {seed, mark, note}), landmark ratings in `ratings` (`lm-<id>`: {mark, note}), answers in `answers` (`q-1-approach`, `q-2-look`, `q-3-scale`, `q-4-rules`, `q-5-feel`, `q-6-names`, `q-7-fields`, `q-8-scale`, `q-9-veins`, `general`).
- `tools/map-labels/`: Atlas Lettering, the labelling step for the painted map. Names are in its db collection `labels`, one doc per name (`text`, `kind`, `field`, `x`, `y`, `scale`, `angle`, `arc`, `ink`). Its `map.jpg` is generated art, gitignored and published alongside the page.
- `tools/story-review/`: the Story Review, four candidate stories for the journeyman's circuit (`explorations/2026-11-09-story/`), none canon. Answers are in its db collection `answers` (`q-1-pick`, `q-2-wells`, `q-3-graft`, `q-4-tone`, `general`: {choice, note}). `build.py` writes `index.html` from the candidates; `map.jpg` is gitignored and published alongside.
- `tools/balance-notes/`: the Balance Notes page, the balance harness's findings (`npm run balance` in `game/`) with questions for the user. Answers are in its db collection `answers`.
- `tools/engine-choice/`: the Engine Choice page, comparing stacks for the real game (see `explorations/2026-11-04-engine-options.md`). Option verdicts are in db `ratings`; question answers (`q-*`, `general`) are in `answers`.
- `tools/servers/`: a terminal manager for local game servers across all worktrees (`npm run servers` in `game/`): port, worktree, clients, owner, kill and start. `--json` prints the list for scripts.
- `tools/sfx/`: sound effects from ElevenLabs. `elevenlabs.mjs` calls its signed-in CLI, spends credits (capped at 60 calls a day) and writes clips to the gitignored `.reference` folder; the JSON files hold each batch's prompts. Paid calls wait for a description the user has approved.
- `game/`: the real game (engine phase, from 2026-11-04). Rooms (keys 1 to 6): the Sanctum, the legacy Arena (`#arena`), Survive (`#survive`, with power-ups between waves), the tutorial prototype (`#tutorial`), the Academy art test (`#academy`) and the battery (`#battery`, the opening's beats 4 to 7, with checkpoints: `?at=`); the Esc menu's scenario registry (`client/src/scenarios.ts`) switches between them in place. An npm workspace: `rules` (spell grammar C, generated from the Atlas's `rules-c.js`), `sim` (the deterministic game: typed-array state, `step(world, inputs)`, replays, state hashes), `net` (lockstep and rollback sessions over a swappable transport), `content` (the LDtk map build and checks, node only) and `client` (Vite + PixiJS v8). Its own `README.md` and `CLAUDE.md` cover the commands, the determinism rules and milestone 1.
- `prototypes/`: each prototype is self-contained in `prototypes/NN-short-name/` and has its own README covering the question it answers, how to run it, and what we learned. See `prototypes/README.md`.

## Workflows

Project skills live in `.claude/skills/`:
- `brainstorm`: a structured ideation session on a topic. It writes an exploration doc and/or idea files.
- `prototype`: turns an idea into a minimal playable test of one specific question.

## Keeping the docs current

The user wants Claude to actively maintain the docs and keep the process on track:
- After any design discussion, update the affected files without being asked: summarize it in a new exploration, update idea statuses and the `ideas/README.md` table, log decisions, and edit pillars in `vision.md` when the user changes them.
- Rejected ideas stay in the docs, marked rejected and with the reason, so they aren't proposed again.
- When the conversation drifts, point back to the current open questions in `vision.md` and the active `developing` ideas. Suggest the next step.
- Don't jump to prototyping before the design question is clear; the user prefers to explore first.

## Keeping it tidy (checkable rules)

These came out of the 2026-11-12 repo audit; each one is a mess that audit had to clean up.
- **Indexes in the same commit.** A new exploration gets its row in `docs/explorations/README.md` (one table, date order, no blank lines or bullets inside it). A new decision gets its link on the matching topic line at the top of `docs/decisions/README.md`.
- **One fact, every page that states it.** Changing rooms, scenario keys, npm scripts or URL params updates, in the same commit: `game/README.md`, the `game/` line above, `game/content/README.md` (rooms and keys) and `docs/current-state.md`. A decision that reverses a claim also fixes `current-state.md` (the golden hash line included) and adds a superseded pointer in the idea file it changes.
- **Check before you write a key or number in a doc.** Panels: F1 help, F2 Tune, F3 Tools, F4 Stats. Numbers come from `game/packages/sim/src/config.ts`, not from memory or an older doc.
- **Links:** `node tools/docs-check/check-links.mjs` must report 0 broken links before a docs commit.
- **Snapshots:** after changing a source, re-sync its copies or record the drift in the copy's README: `tools/spell-vfx/rules-c.js` (from the Atlas), `tools/spell-vfx/vfx-attacks.js` (from `enemy-attacks.ts`), `tools/survive-review/copy.js` (Survive's numbers), `tools/sound-gallery/engine.js` and `bank.js` (`npm run sound-gallery`). The review pages also copy small helpers between them (`core.js`, `fx.js`, `pixel.js`, `stage.js`): before editing one, find its other copies and change them together.
- **Finished lists move out.** An overnight list whose items are all done is `git mv`ed to `docs/archive/`.

## Conventions

- Lead with the player experience: what does it feel like in the hands, and what does a co-op partner see or do? Engine or implementation detail comes later.
- Name the trade-off. Every added axis of spell input costs finger complexity and readability. Say what an idea costs, not only what it adds.
- Prototypes answer exactly one question and are allowed to be ugly. Don't build shared engine code across prototypes until at least two prototypes need it.
- Tech stack (decided 2026-11-04): PixiJS v8 for drawing, our own deterministic TypeScript sim, rollback netcode (2-tick input delay) over WebRTC, Electron for Steam later. Prototypes may still use plain Canvas2D.
