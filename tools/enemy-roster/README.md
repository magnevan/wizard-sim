# Enemy Roster

Published: https://claude.ai/artifact/QSBW1MzxrF7P1cktdfnXtP (version 1, 2026-11-14).

A rateable page for `docs/explorations/2026-11-14-enemies-and-ai.md`. It shows what Magicka 1 and 2 did with enemies, thirteen candidate enemies (each with a looping sketch of its tell, drawn on a 160 x 70 canvas), the enemy AI layers with an attack-token demo, the companion AI with a demo of a companion keeping out of the player's aim, and seven questions. It's one self-contained `index.html`. The demos are illustrations, not the sim.

## Slugs (db doc ids)
- **Ratings** (`ratings/<slug>`):
  - Enemies, {mark: build | maybe | cut, note}: `en-sapper`, `en-charger`, `en-troll`, `en-shaman`, `en-hedge`, `en-leaper`, `en-slime`, `en-gravecaller`, `en-singer`, `en-elemental`, `en-mirror`, `en-burrower`, `en-rival`.
  - AI layers, {mark: yes | maybe | no, note}: `ai-tokens`, `ai-slots`, `ai-react`, `ai-target`, `ai-pacing`, `ai-difficulty`, `ai-inputbot`, `ai-utility`, `ai-habits`, `ai-profiles`, `ai-limits`, `ai-gambits`.
- **Answers** (`answers/<id>`), {choice, note}:
  - `q-1-first`: `five` (rec) | `three` | `marks`
  - `q-2-casters`: `grammar` (rec) | `bespoke` | `elites`
  - `q-3-tokens`: `2-1-1` (rec) | `3-2-1` | `none`
  - `q-4-panic`: `yes` (rec) | `no`
  - `q-5-who`: `classmates` (rec) | `summons` | `fill` | `none`
  - `q-6-orders`: `later-key` (rec) | `key-now` | `none`
  - `q-7-rules`: `same` (rec) | `no-ff` | `cheat`
  - `general`: {note}

Read them with the ArtifactData tool (`list` on `ratings` and `answers`), then fold them into the docs: a follow-up exploration and entries in `docs/decisions/`.
