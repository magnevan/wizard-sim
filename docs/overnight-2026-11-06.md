# Overnight build list (2026-11-06)

The user's list for the night, in their words, with how Claude is running it. **If a new context window picks this up, read this file first:** the status column is the source of truth.

| # | Item | Status | Branch / commit | Notes |
|---|---|---|---|---|
| 0 | Pass over the other Survive power-ups (Echo, Long fuse, Quickstep, Clockwork; the user's ratings in the Survive Review db) | **done**, live | 10ae1b9 | Echo (free double-cast for a wave, ×3 before key waves), Lingering, Quickstep (permanent haste; Haste now shortens recovery), Clockwork (turrets bind no Sigil). Triage proposed in place of Bloom. Survive Review republished (v5) |
| 1 | In-game help panel: a hotkey slides out a side panel showing an animation and a description of the spell your current runes make, one per cast variant (like the Atlas, in game); maybe stats | running | | |
| 2 | Tutorial: design it (start with no runes, learn attacks, then runes one at a time; mostly practical, some text), then build a prototype you can go to | design done (f444095, `explorations/2026-11-06-tutorial.md`); prototype build running (8 beats at `#tutorial`) | | Claude adds the scenario-registry entry at merge |
| 3 | Esc menu: navigation, multiplayer connect, a scenario picker (tutorial, sandbox, survive, arena…) | running | | Esc today clears the queue: Esc clears the queue if it holds runes, otherwise opens the menu |
| 4 | Enemy attack animations: some enemies have none | running | | |
| 5 | Final pass: (a) anything left incomplete / worth another pass; (b) code review, bugs, docs; (c) code quality; (d) performance low-hanging fruit | after 0–4 | | |

## How it runs

- Each item runs as a background agent in its own git worktree. Claude merges it into main, runs `npm run check` and `npm run check:browser`, and pushes, so the live game updates.
- Merge conflicts in `docs/decisions/README.md` are both-sides appends: keep both.
- The standing rules hold: never push `private-history`, never open `docs/reference/magicka-numbers-extracted.md`, use the noreply email, `git add` explicit paths, and use Write/Edit rather than big heredocs.

## Log

- 2026-11-06: list received; items 0, 1, 3 and 4 and the tutorial design started.
- 2026-11-06: tutorial design landed (19 beats, about 10.7 min); prototype build started in parallel with the Esc menu.
- 2026-11-06: power-ups pass 2 merged and pushed (302 tests, golden d13d22ff). The decisions log had 3 cp1252-encoded lines; re-encoded as UTF-8.
