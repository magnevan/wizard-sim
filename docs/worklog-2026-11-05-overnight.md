# Overnight queue, 2026-11-05

The user logged off with three challenges:
1. Design an arena and a survive mode with waves, with power-ups between waves: more max runes, regen, and some experimental ones.
2. Finish death VFX for all the other enemies.
3. Anything else in the backlog.

Each item runs in its own agent and git worktree, and Claude merges into main, runs every check (`npm run check`, `check:browser`, `check:net`) and pushes.

| Item | Who | Status |
|---|---|---|
| Guards round (design doc and review page round 2) | agent | done: published round 2 to the same link (`explorations/2026-11-05-guards.md`) |
| Survive mode: arena, waves, power-ups | agent (worktree) | running |
| Deaths for brute, archer, imp, grabber and shieldbearer: gallery round and game port | agent (worktree) | running |
| Remote prediction: world-space aim, late remote spells shown from their first frame | agent (worktree) | running |
| Weapon-specific Heavies and guard Retreats in the game | next | wait for the user's round-2 ratings before building |
| Inert audit, Life family | partly decided | sprays sized by the lending element (built); earth, cold and lightning proposed in the decisions log |
| 4. Host tuning online without desync | Claude | done |
| TURN relay | waits on the user | — |

When Claude resumes, it reads this file, checks what has landed, merges, and updates the table.
