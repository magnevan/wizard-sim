# Enemy Wizards

Published: https://claude.ai/artifact/CssUe9PniLQRJ4LkKRZo9J (version 1, 2026-11-14).

The spec for enemy casters from `docs/explorations/2026-11-14-enemy-wizards.md`, as a page to mark. Its centrepiece is the duel timeline. Pick a tier (apprentice, adept, master) and a play, and it schedules one play with the spec's numbers and the game's own wind-up and recovery (`config.ts`: 0.12 s + 0.04 s a rune, 0.18 s). It then draws the enemy gathering runes at its staff, the focus glow, the cast and the breath, with your dodge window and opening marked. When those game numbers or the tier table change, update `GAME` and `TIERS` in the script and the tables in the exploration together.

One self-contained `index.html`. The stage is an illustration, not the sim.

## Slugs (db doc ids)
- **Ratings** (`ratings/<slug>`), {mark: yes | maybe | no, note}:
  - Plays: `play-poke`, `play-soak`, `play-freeze`, `play-rain`, `play-flamewall`, `play-ward`, `play-barrier`, `play-blink`, `play-selfcare`, `play-mend`, `play-turret`, `play-signature`.
  - Honesty rules: `rule-noinput`, `rule-economy`, `rule-tellscale`, `rule-opening`, `rule-human`, `rule-habits`, `rule-nochain`, `rule-phase`.
- **Answers** (`answers/<id>`), {choice, note}:
  - `q-1-tell`: `staff` (rec) | `bigger` | `hidden`
  - `q-2-reads`: `casts` (rec) | `master-queue` | `all-queue`
  - `q-3-selfharm`: `yes` (rec) | `apprentice` | `no`
  - `q-4-engine`: `ai-seats` (rec) | `component`
  - `q-5-first`: `hedge` (rec) | `duel` | `coven`
  - `q-6-difficulty`: `tier-step` (rec) | `slider`
  - `q-7-named`: `yes` (rec) | `generic`
  - `general`: {note}
