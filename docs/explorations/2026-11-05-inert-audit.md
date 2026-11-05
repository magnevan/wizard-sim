# 2026-11-05: The game's inert additions

The user's rule (decided 2026-11-04): **adding an element must always change the spell.** The rules text already promised it (the Atlas audits keep inert additions at 0), but the game didn't always keep the promise. `npm run audit` (`game/tools/audit.balance.ts`) now checks the game itself:
- It casts every queue of up to three runes every way: Force held, Area, Place, Self, Weapon.
- It does this in one standard scene: hurt dummies near and far, a hurt ally, and the caster hurt and wet.
- It fingerprints what happened (health, positions, statuses, floor, walls, devices, wards, auras, weapons).
- It reports every element that could be added without a cancel and changed nothing.

**First run: 210 of 1,610 additions are inert in play.** Full list: `game/tools/audit-report.json`. They fall into a few families, and each family is a design question, not a bug to patch case by case.

| Family | Examples | The question |
|---|---|---|
| **Extra elements on a Life spell** (~60) | Life + Lightning + Cold (a healing arc); Life + Cold on Force, Place or Area | Life "heals and never harms", so payload elements on a heal do nothing. What should Cold, Fire or Earth add to a heal? Options: a status on the healed (Cold cleanses burning, Fire dries), a rider on enemies it passes, or more reach and size. |
| **Weapon casts** (~85) | Water, Fire, Cold, Lightning, Arcane added to a staff swing or a conjured weapon | Mostly covered by the weapons review (`2026-11-04-weapons-and-movesets.md`): payload as a coat, and at most one shape change. The audit will check that review's result. |
| **Self casts** (~30) | Water on Water self; Arcane, Earth or Lightning on a Sigil aura that already has two elements | Self hits are status-driven (Water douses, Fire dries). An aura reads only some of its elements. Should every aura element add its trait? |
| **Place on Life and Arcane** (~25) | Life + X Place (the spring); Arcane + Sigil Place | The Life spring ignores its payload, like the other heals. |
| **Small cases** | Arcane on Arcane Area; Sigil on Water Place | Look at each one. |

Some may be scene blind spots, not true gaps. Fire on a self-cast only shows on someone burning or wet, and the scene's caster is only wet. When a family turns out to be a blind spot, the scene gets richer, not the rules looser.

*(Since: the Life family is resolved, by the size rule ("Life spells, the size rule") and then "Every element in a heal lends its resistance" in the decisions log. The Weapon, Self and Place families' status is untracked: no re-run of the audit after the weapons and guards rounds is recorded. They're listed as an open item in `../ideas/README.md` and `../current-state.md`.)*

**Next:** decide the Life family first, since it's the biggest and touches pillar 3 (support verbs). Let the weapons review settle the Weapon family, then make the audit fail at any count above 0.
