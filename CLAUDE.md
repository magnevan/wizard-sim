# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A design sandbox for a cooperative spellcasting game inspired by Magicka, plus the game itself (Wizard Sim). The design writing and review pages decide what the game should be; `game/` builds it. The game is public and playable at https://magnevan.github.io/wizard-sim/ (repo https://github.com/magnevan/wizard-sim), deployed on every push to main, so keep main working. It's still early: ideas matter more than polish.

Start at `docs/start-here.md`. For implemented controls, rules, rooms and netcode, read `docs/current-state.md`. For active reviews, read `docs/work-in-progress.md`.

The source of truth for what the game is trying to be is `docs/vision.md`. Read it before proposing or judging a mechanic. When an idea conflicts with a pillar, say so plainly; don't quietly bend the pillar.

## Layout

- `docs/vision.md`: design pillars and open questions. It changes slowly and only when the user agrees.
- `docs/tasks.md`: how work is tracked. Threads (ordered lines of work) live in `docs/threads/`, loose discoveries are GitHub issues on magnevan/wizard-sim, and memory holds working preferences only.
- `docs/current-state.md`: playable behavior. Update affected summaries when implementation changes and link to code and data for exact values.
- `docs/archive/`: old worklogs, kept as records.
- `docs/world/`: living pages about the setting, edited as it changes (unlike explorations). `elements.md` holds each element's essence, which informs both the world and the spells.
- `docs/campaign/`: how campaign segments get made (`README.md`, stage by stage), one folder per segment, and `canon.md`, the one page saying which story facts the user has approved. Read `canon.md` before writing story; everything not in its Approved section is an option.
- `tools/`: the review pages and scripts. Each review page keeps its feedback in its artifact db; what each tool is, and its collections and doc ids, are listed in `tools/CLAUDE.md`.
- `docs/reference/`: notes on Magicka and other reference games. Facts recalled from memory are marked *(unverified)*.
- `docs/explorations/`: dated brainstorms, playtests and review records (`YYYY-MM-DD-topic.md`). Link an explicit replacement when an exploration is superseded.
- `docs/ideas/`: one file per mechanic idea, written from `docs/ideas/_template.md`. Each has a status: `raw` → `developing` → `prototyping` → `adopted` / `parked` / `rejected`.
- `docs/decisions/`: an append-only log of design decisions and the reasons for them (`decisions/README.md` is the index).
- **Feedback lives in artifact dbs.** Read the relevant artifact for the review in progress when its feedback is available. The root `README.md` lists the published reviews. Keep individual ratings in the review record and promote accepted decisions and reusable guidance to the owning topic.
- `game/`: the real game (engine phase, from 2026-11-04). Rooms (keys 1 to 7): the Sanctum, the legacy Arena (`#arena`), Survive (`#survive`, with power-ups between waves), the tutorial prototype (`#tutorial`), the Academy art test (`#academy`), the battery (`#battery`, the opening's beats 4 to 7, with checkpoints: `?at=`) and the drill yard (`#yard`, beats 2 and 3, its gate leads on to the battery; the academy's buildings stand round it as grey boxes, `?massing=off` hides them); the Esc menu's scenario registry (`client/src/scenarios.ts`) switches between them in place. Its own `README.md` and `CLAUDE.md` cover the commands, the determinism rules and milestone 1.
- `prototypes/`: each prototype is self-contained in `prototypes/NN-short-name/` and has its own README covering the question it answers, how to run it, and what we learned. See `prototypes/README.md`.

## Workflows

Project skills live in `.claude/skills/`:
- `brainstorm`: a structured ideation session on a topic. It writes an exploration doc and/or idea files.
- `prototype`: turns an idea into a minimal playable test of one specific question.
- `file`: "file that" files a discovery as a GitHub issue in one call, then goes back to the work at hand.
- `triage`: Sonnet labels the issue inbox, links files, closes duplicates and flags possibly obsolete issues with `recheck`.

**Tasks (docs/tasks.md):** when resuming a line of work, read its `docs/threads/` file first and update its status line and Next list as you go. When you notice something outside the current task, file it with the `file` skill rather than fixing it or forgetting it. List issues by label or search, titles only (`--json number,title`), and never dump the whole backlog. Fixing commits say `Fixes #n`.

## Keeping the docs current

The user wants Claude to actively maintain the docs and keep the process on track:
- When a design decision is made, update its owning note and log the reason. Record substantial brainstorms, tests and feedback in dated explorations. Edit the pillars in `vision.md` when the user changes them. See `docs/maintaining-the-vault.md`.
- Keep rejected ideas and their rationale in the related exploration or decision log.
- Keep `docs/work-in-progress.md` focused on reviews the user is doing now. Remove each review from the list when it ends.
- Don't jump to prototyping before the design question is clear; the user prefers to explore first.

## Keeping it tidy (checkable rules)

These came out of the 2026-11-12 repo audit; each one is a mess that audit had to clean up.
- **Indexes in the same commit.** A new exploration gets its row in `docs/explorations/README.md` (one table, date order, no blank lines or bullets inside it). A new decision gets its link on the matching topic line at the top of `docs/decisions/README.md`.
- **One home per fact.** Update the owning source when rooms, keys, commands or rules change. Update any affected summary in the same change or link it to the owning source. Add a superseded pointer to related ideas when a decision changes their status.
- **Check before you write a key or number in a doc.** Panels: F1 help, F2 Tune, F3 Tools, F4 Stats. Numbers come from `game/packages/sim/src/config.ts`, not from memory or an older doc.
- **Links:** `node tools/docs-check/check-links.mjs` must report 0 broken links before a docs commit.
- **Snapshots:** after changing a source, re-sync its copies or record the drift in the copy's README: `tools/spell-vfx/rules-c.js` (from the Atlas), `tools/spell-vfx/vfx-attacks.js` (from `enemy-attacks.ts`), `tools/survive-review/copy.js` (Survive's numbers), `tools/sound-gallery/engine.js` and `bank.js` (`npm run sound-gallery`). The review pages also copy small helpers between them (`core.js`, `fx.js`, `pixel.js`, `stage.js`): before editing one, find its other copies and change them together.
- **Finished lists move out.** An overnight list whose items are all done is `git mv`ed to `docs/archive/`.

## Conventions

- Lead with the player experience: what does it feel like in the hands, and what does a co-op partner see or do? Engine or implementation detail comes later.
- Name the trade-off. Every added axis of spell input costs finger complexity and readability. Say what an idea costs, not only what it adds.
- Prototypes answer exactly one question and are allowed to be ugly. Don't build shared engine code across prototypes until at least two prototypes need it.
- For search sweeps, file hunts and mechanical checks, launch subagents with `model: "sonnet"`; keep the default model for design writing and reviews.
- Tech stack (decided 2026-11-04): PixiJS v8 for drawing, our own deterministic TypeScript sim, rollback netcode (2-tick input delay) over WebRTC, Electron for Steam later. Prototypes may still use plain Canvas2D.
