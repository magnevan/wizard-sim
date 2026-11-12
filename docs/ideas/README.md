# Ideas

There's one file per mechanic, copied from `_template.md`. The status lives in the frontmatter, and this table mirrors it: `raw` → `developing` → `prototyping` → `adopted` / `parked` / `rejected`. For what's built right now, see `../current-state.md`.

| Idea | Status | Pillars |
|---|---|---|
| [burn-by-damage](burn-by-damage.md) | adopted (burn is a pool that follows the damage dealt; Consume and Panic rejected) | 2, 4 |
| [chill-meter](chill-meter.md) | adopted (a frost pool filled by Cold runes since the spell audit; only Water freezes) | 2, 3, 4 |
| [spell-wishlist](spell-wishlist.md) | developing | 2, 3 |
| [art-direction](art-direction.md) | adopted (the Pixel Battlefield look drives the game) | 5 |
| [spell-preparation](spell-preparation.md) | prototyping (glyphs, turrets, orbitals built as Sigil devices; the stored spell built as Sigil alone on Force) | 4, 6 |
| [support-verbs](support-verbs.md) | developing (lens, wards on allies, auras, heals, Healing link, Mend, Rally built) | 3 |
| [enchantments](enchantments.md) | prototyping (Sigil + Self auras and wards on allies in the game) | 3, 6 |
| [conjured-weapons](conjured-weapons.md) | prototyping (seven conjured weapons, the staff and eight guards in the game, rated through round 4; Prism = Capacitor and Lance) | 2, 6 |
| [minions-and-clones](minions-and-clones.md) | prototyping (the Double in the game, and Survive's Echo; the played clone not built) | 2, 3 |
| [death-and-revival](death-and-revival.md) | prototyping (downed until the wave ends; Rally in Survive) | 3, 4 |
| [casting-rhythm](casting-rhythm.md) | prototyping (in the engine: wind-up by spell size, cast buffer, channels with upkeep) | 1, 4 |
| [progression](progression.md) | developing (unlock pacing U2, fixed queue, pools and regen grow, pool choice: `explorations/2026-11-07-world-and-progression.md`) | 1, 5 |
| [spell-grammar](spell-grammar.md) | prototyping (proposal C drives the engine; A and A.1 superseded) | 2, 6 |
| [slip](slip.md) | raw (bodies no longer slide on ice; a slip with its own animations, maybe later) | 2, 3 |
| [shield-force-alternatives](shield-force-alternatives.md) | parked (Bubble, Repulsor/Counterspell, Shield chain, Guardian link: not picked for Shield + elements on Force; Blink with a parting gift was) | 2, 3 |
| [sanctum](sanctum.md) | developing (the meditation sandbox, reachable from anywhere; the user, 2026-11-08) | 4, 5 |
| [element-economy](element-economy.md) (element runes) | prototyping (rune pools, reserve on queue, regen, Attune, Bind, Model A drain in the engine) | 1, 4, 6 |
| [battlefield-building](battlefield-building.md) | prototyping (walls, curtains, turrets, glyphs in the engine) | 6, 7, 3 |
| [survive-mode](survive-mode.md) | prototyping (`#survive` in the game, 12 power-ups: explorations/2026-11-05-survive-mode.md) | 1, 3, 7 |
| [tutorial](tutorial.md) | prototyping (19 beats designed in `explorations/2026-11-06-tutorial.md`; all 19 playable at `#tutorial` since pass 2, `explorations/2026-11-06-tutorial-pass-2.md`; lore to come from the user) | 2, 4, 1, 7 |
| [air-element](air-element.md) | parked (deferred; a full draft waits on the user's `air-*` answers) | 2, 3, 5 |

## Open design lists (not idea files)

| List | Status | Where |
|---|---|---|
| Inert additions in the game ("adding an element always changes the spell") | **Life family resolved** (the size rule, then every element in a heal lends resistance). The **Weapon, Self and Place families' status is untracked**: no re-run of `npm run audit` since the weapons and guards rounds is recorded. Next: re-run it, record the counts, and decide each remaining family. | `../explorations/2026-11-05-inert-audit.md`, `game/tools/audit-report.json` |
