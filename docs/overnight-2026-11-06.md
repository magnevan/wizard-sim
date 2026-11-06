# Overnight build list (2026-11-06)

The user's list for the night, in their words, with how Claude is running it. **If a new context window picks this up, read this file first:** the status column is the source of truth.

| # | Item | Status | Branch / commit | Notes |
|---|---|---|---|---|
| 0 | Pass over the other Survive power-ups (Echo, Long fuse, Quickstep, Clockwork; the user's ratings in the Survive Review db) | **done**, live | 10ae1b9 | Echo (free double-cast for a wave, ×3 before key waves), Lingering, Quickstep (permanent haste; Haste now shortens recovery), Clockwork (turrets bind no Sigil). Triage proposed in place of Bloom. Survive Review republished (v5) |
| 1 | In-game help panel: a hotkey slides out a side panel showing an animation and a description of the spell your current runes make, one per cast variant (like the Atlas, in game); maybe stats | **done**, live | 5a20c8d | F2 / "?" button / D-pad up. Five rows with live previews rendered by the game itself; hands moves when the queue is empty; numbers behind Shift+F2. Found a rules bug: the Ice sheet text is the Rain text |
| 2 | Tutorial: design it (start with no runes, learn attacks, then runes one at a time; mostly practical, some text), then build a prototype you can go to | design done (f444095, `explorations/2026-11-06-tutorial.md`); prototype **done**, live: 8 beats (Walk, Strike, Heavy, Retreat, Defend, Fire, Water, Steam) + end card | 13527c4 | `#tutorial`, key 4, Esc → Tutorial. Rough: the brambles read small and boxy |
| 3 | Esc menu: navigation, multiplayer connect, a scenario picker (tutorial, sandbox, survive, arena…) | **done**, live | a7725ff | Esc clears queued runes, otherwise opens the menu. Scenarios, Multiplayer (host/join, online room switch by the host), Controls, Settings. Registry in `client/src/scenarios.ts`: a sim `tutorial` room turns the Tutorial row on (key 4) |
| 4 | Enemy attack animations: some enemies have none | **done**, live | e92861a | All six have a telegraph, strike, impact and recovery (client only, `art/enemy-attacks.ts`). Worth showing in the VFX gallery: grabber hold ring, archer lock glint, brute crack, imp spit. Open question: should the brute's slam travel as a shockwave? |
| 5 | Final pass: (a) anything left incomplete / worth another pass; (b) code review, bugs, docs; (c) code quality; (d) performance low-hanging fruit | **done**, live | d7951a0, b8b06e0, 3b31737 | (b) rules text, room-switch fx, menu keys, docs. (d) Survive sim step 0.555 → 0.26 ms, Survive p50 frame 21.7 → 10.9 ms, bundle split, PeerJS lazy; `npm run perf`. (a)+(c) pad-join and seat bugs, tutorial resets, beat 6 hands test, bramble art, one pixel font, one blow table |

## How it runs

- Each item runs as a background agent in its own git worktree. Claude merges it into main, runs `npm run check` and `npm run check:browser`, and pushes, so the live game updates.
- Merge conflicts in `docs/decisions/README.md` are both-sides appends: keep both.
- The standing rules hold: never push `private-history`, never open `docs/reference/magicka-numbers-extracted.md`, use the noreply email, `git add` explicit paths, and use Write/Edit rather than big heredocs.

## Log

- 2026-11-06: list received; items 0, 1, 3 and 4 and the tutorial design started.
- 2026-11-06: tutorial design landed (19 beats, about 10.7 min); prototype build started in parallel with the Esc menu.
- 2026-11-06: power-ups pass 2 merged and pushed (302 tests, golden d13d22ff). The decisions log had 3 cp1252-encoded lines; re-encoded as UTF-8.
- 2026-11-06: Esc menu merged and pushed (316 tests; check:browser, check:menu and check:net pass). Decisions-log conflicts are now resolved with a script (scratchpad `resolve_decisions.py`: merge topic links, keep both entries).
- 2026-11-06: enemy attacks merged and pushed (316 tests, golden d13d22ff). The main.ts conflict with the Esc menu was resolved by hand.
- 2026-11-06: help panel merged and pushed (330 tests). check:net failed once under load and passed on rerun (a known flake: a page stalls for about 3.5 s).
- 2026-11-06: tutorial prototype merged and pushed (341 tests, golden d13d22ff, check:tutorial passes). Final pass started.
- 2026-11-06: VFX gallery v9 (enemy attack cards) published. 5(b) merged and pushed (349 tests). 5(a)+(c) started.
- 2026-11-06: all items done. 355 tests, golden d13d22ff; check:browser, check:menu, check:tutorial and check:net pass. Left for the user: the open questions in each exploration (tutorial 1–10, Esc menu, help panel, enemy attacks Q1, power-ups Q12–15, the vision's practice question), and ratings on the Survive Review and VFX gallery v9.
