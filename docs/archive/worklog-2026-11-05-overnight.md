# Overnight queue, 2026-11-05

The user logged off with three challenges:
1. Design an arena and a survive mode with waves, with power-ups between waves: more max runes, regen, and some experimental ones.
2. Finish death VFX for all the other enemies.
3. Anything else in the backlog.

Each item runs in its own agent and git worktree, and Claude merges into main, runs every check (`npm run check`, `check:browser`, `check:net`) and pushes.

| Item | Who | Status |
|---|---|---|
| Guards round (design doc and review page round 2) | agent | done: published round 2 to the same link (`explorations/2026-11-05-guards.md`) |
| Survive mode: arena, waves, power-ups | agent | merged: `#survive`; 10 power-ups built; 6 questions in `explorations/2026-11-05-survive-mode.md` |
| Deaths for brute, archer, imp, grabber and shieldbearer: gallery round and game port | agent | merged; gallery republished (17 new slugs, group `deaths2`) |
| Remote prediction: world-space aim, late remote spells shown from their first frame | agent | merged: wrong guesses 86 % → 4 % with a walking partner at 150 ms |
| Weapon-specific Heavies and guard Retreats in the game | Claude | done; round-2 ratings built, round 3 on the review page (`explorations/2026-11-05-guards-round-2.md`) |
| Inert audit, Life family | partly decided | sprays sized by the lending element (built); earth, cold and lightning proposed in the decisions log |
| 4. Host tuning online without desync | Claude | done |
| TURN relay | waits on the user | — |

*(Archived 2026-11-05. The one live item, the TURN relay, moved to the open list in `../current-state.md`.)*

When Claude resumes, it reads this file, checks what has landed, merges, and updates the table.

## Summary for the user

Everything in the queue landed on main and is live on the Pages site. All checks pass: 213 tests, Chrome and node agree on `485c0373`, and the co-op e2e passes.

- **Survive mode** (`#survive`): an arena with gates and cover, waves, altar picks between them, and 10 power-ups. Six questions are in `explorations/2026-11-05-survive-mode.md`.
- **Deaths for every enemy:** 17 bespoke deaths for the brute, archer, imp, grabber and shieldbearer, in the game and in the Spell VFX gallery, ready to rate.
- **Remote players:**
  - Aim is guessed in world space, so rewinds with a walking partner drop from 166 to 11 ticks a second at 150 ms.
  - Late remote spells start at the caster instead of popping in mid-air.
  - Both have A/B switches in the F1 Network test.
  - A latent desync with negative zero in inputs was fixed along the way.
- **Host tuning online:** done earlier tonight.
- **Weapons round 2:** published, waiting for ratings before the Heavies and guard Retreats go into the game.
