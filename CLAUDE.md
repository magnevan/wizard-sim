# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A design sandbox for a cooperative spellcasting game inspired by Magicka. It's mostly design writing, with small throwaway prototypes added over time. There's no shipped product, so ideas matter more than polish.

The source of truth for what the game is trying to be is `docs/vision.md`. Read it before proposing or judging a mechanic. When an idea conflicts with a pillar, say so plainly; don't quietly bend the pillar.

## Layout

- `docs/vision.md`: design pillars and open questions. It changes slowly and only when the user agrees.
- `docs/reference/`: notes on Magicka and other reference games. Facts recalled from memory are marked *(unverified)*.
- `docs/explorations/`: dated, long-form thinking sessions (`YYYY-MM-DD-topic.md`). Once written, they're a record and aren't rewritten. Newer explorations supersede older ones.
- `docs/ideas/`: one file per mechanic idea, written from `docs/ideas/_template.md`. Each has a status: `raw` → `developing` → `prototyping` → `adopted` / `parked` / `rejected`.
- `docs/decisions/`: an append-only log of design decisions and the reasons for them (`decisions/README.md` is the index).
- `tools/spell-gallery/`: a published page of animated spell vignettes the user rates. Ratings are stored in the artifact's db, and Claude reads them back into the docs. See its README for adding spells, the headless-Chrome filmstrip check, and how to read ratings.
- `tools/spell-tree/`: the Spell Tree Explorer, an interactive page for proposal A. `resolver.js` holds the rules. The user's answers to the open questions are in its db collection `answers`.
- `tools/spell-atlas/`: the Spell Atlas, the whole tree under proposal C as one form × cast grid, plus a Structures section. `depth-c.js` counts what each rune-pool depth can reach. `rules-c.js` holds the rules (runs in node too). `audit-c.js` and `audit-a1.js` count element additions that change nothing; run them after any rule change, and keep inert additions at 0. Its db holds `answers` (questions) and `cells` (per-cell ratings).
- **Feedback lives in artifact dbs.** At the start of every session, read all of them (see the memory file of artifact URLs) and fold any new ratings or notes into the docs before doing anything else.
- `tools/art-styles/`: the Art Style Explorer, the same fight in six art directions. Ratings are in its db collection `ratings`.
- `tools/art-pixel-hd/`: Pixel Battlefield, the leading art direction (high-res pixel art, 3/4 camera) shown full screen with structures and the rune HUD. Answers are in its db collection `answers`.
- `tools/spell-vfx/`: the Spell VFX gallery, looping pixel-art vignettes of the current spells in the Pixel Battlefield style. Its `rules-c.js` is a snapshot of the Atlas rules: re-copy it after rule changes. Ratings are in its db collection `ratings`, one doc per vignette slug. `filmstrip.html` is QA only, so don't publish it.
- `tools/engine-choice/`: the Engine Choice page, comparing stacks for the real game (see `explorations/2026-11-04-engine-options.md`). Option verdicts are in db `ratings`; question answers (`q-*`, `general`) are in `answers`.
- `game/`: the real game (engine phase, from 2026-11-04). An npm workspace: `rules` (spell grammar C, generated from the Atlas's `rules-c.js`), `sim` (the deterministic game: typed-array state, `step(world, inputs)`, replays, state hashes) and `client` (Vite + PixiJS v8). Its own `README.md` and `CLAUDE.md` cover the commands, the determinism rules and milestone 1.
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

## Conventions

- Lead with the player experience: what does it feel like in the hands, and what does a co-op partner see or do? Engine or implementation detail comes later.
- Name the trade-off. Every added axis of spell input costs finger complexity and readability. Say what an idea costs, not only what it adds.
- Prototypes answer exactly one question and are allowed to be ugly. Don't build shared engine code across prototypes until at least two prototypes need it.
- Tech stack (decided 2026-11-04): PixiJS v8 for drawing, our own deterministic TypeScript sim, lockstep netcode later, Electron for Steam later. Prototypes may still use plain Canvas2D.
