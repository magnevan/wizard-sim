# Overnight queue, 2026-11-05

The user logged off with three challenges:
1. Design an arena and a survive mode with waves, with power-ups between waves: more max runes, regen, and some experimental ones.
2. Finish death VFX for all the other enemies.
3. Anything else in the backlog.

Each item runs in its own agent and git worktree, and Claude merges into main, runs every check (`npm run check`, `check:browser`, `check:net`) and pushes.

| Item | Who | Status |
|---|---|---|
| Guards round (design doc and review page round 2) | agent (main tree, `tools/weapon-moves/` only) | running |
| Survive mode: arena, waves, power-ups | agent (worktree) | running |
| Deaths for brute, archer, imp, grabber and shieldbearer: gallery round and game port | agent (worktree) | running |
| Remote prediction: world-space aim, late remote spells shown from their first frame | agent (worktree) | running |
| After the guards round: weapon-specific Heavies (spear dash, earth wave, fire wave, Life link), guard Retreats | next | waiting |
| Inert audit, Life family | needs the user's call | proposal in `explorations/2026-11-05-inert-audit.md` |
| TURN relay | waits on the user | — |

When Claude resumes, it reads this file, checks what has landed, merges, and updates the table.
