---
status: developing
pillars: [1, 2, 4, 7]
related: [../world/elements.md, ../explorations/2026-11-28-element-identities.md, ../explorations/2026-11-27-spell-pass.md, element-economy.md, spell-preparation.md, world-spells.md]
---

# Casting styles: Shield and Sigil without runes

## One-liner
Shield and Sigil stop being elements with rune pools: they're two ways of casting, paid from your own Concentration (to hold things against pressure) and Bindings (to keep made things in the world).

## In the hands
Nothing changes under your fingers: E and D are still pressed into the queue, and the style still takes a queue slot. What changes is the HUD and the cost. The Shield and Sigil rune pips go; in their place a **Concentration** bar (a real number with its own regen) and a row of **Bindings** (a few discrete slots).

- A force field or a ward drains Concentration while it stands, harder as it's hit; at the floor, the oldest gives way (today's Model A, moved to its own pool).
- Blink spends a lump of Concentration at once.
- A weapon, a guard, a turret, a glyph, an aura, Haste, a rock wall or an ice wall each holds one Binding. When it ends (spent, broken, dismissed), its Binding comes back after a short cooldown.
- Element runes in the cast are still spent from their pools as now: a device costs a Binding **and** the runes cast into it.
- Preloading devices before a fight, then regenerating, is how a prepared wizard scales (pillar 7); the most you can bank is Bindings × 5 runes (the user, 2026-11-28: "maybe its just a way your character scales"). Proposed on [Spell Ramifications](../explorations/2026-11-28-spell-ramifications.md#round-2-on-the-page): a coated field's bite drains Concentration by its damage, and wards come general (Shield alone, full cost) or specific (with elements, cheaper).

A partner sees the same spells as today. With time to prepare, though, your Bindings are the visible limit on how much you set up, and a partner with free Bindings can carry the rest.

## The line: who is still paying for it?
| | Paid by | Examples | Ends |
|---|---|---|---|
| **Released** | Element runes, once | Fire patch, rain, burning, a wet body | By its own nature |
| **Concentration** | Holding against pressure | Force fields, wards, Blink (a lump) | When you run out or let go |
| **A Binding** | A slot, back after a cooldown | Weapons, guards, turrets, glyphs, orbitals, the Lens, auras, Haste, rock and ice walls | When it's spent, broken or dismissed |

**The resource follows what's made, not the key:** a Shield + Earth wall and a guard are Bindings.

This line is also what Arcane acts on: it disrupts what a caster is still paying for (drains Concentration, strips a Binding's charges or HP) and can't touch released effects. A Binding that holds matter (a rock wall) has no magic in it to strip. See [elements](../world/elements.md#arcane-the-deep-field).

## Why it's interesting
- **It says what was already true.** A cast already holds only one Sigil rune, so the Sigil count never mattered; Shield and Sigil already had their own cost models (drain, bind), led every mix and ignored zones. The [elements page](../world/elements.md) already called them the caster's attention, not a field.
- **It fixes the rock wall.** A rock wall took a Shield rune but cost nothing to hold, beside force fields that drained. Now the cost follows the material.
- **It fixes guards.** They're conjured objects like weapons, so they're Bindings (the user: "it was always kind of weird that they weren't").
- **It defines a magical effect** for Arcane's dispel.
- **Two clean progression dials** for pillar 1's wizard growth: how much you can hold (Concentration's size and regen) and how many things you can keep (Bindings). This is the "grows through training" already written for Shield and Sigil.
- **Preparation (pillar 7) gets a readable budget:** Bindings.

## Costs & risks
- **Regen retuning.** Two pools leave the shared rune budget, so the other elements' shares rise; Concentration has its own regen. The whole economy (`decisions/README.md`, the rune economy entries; `game/packages/sim/src/config.ts`) needs a pass.
- **Scope.** The sim's costs and casts, the HUD, the tutorial's Shield and Sigil beats, the Spell Atlas and its rules text, the help panel, Survive's starting pools (Sigil 1), world spells (which bind runes, [world-spells](world-spells.md)) and the glyph charges.
- **Power shifts:** guards and rock walls leave the Shield pool for Bindings, so Concentration only carries force fields, wards and Blink; Shield-heavy play gets cheaper or dearer depending on the numbers.
- **Readability:** two new meters to learn, though they replace two rune pools.

## Decided (the user, 2026-11-28)
- Still a key, and still takes a queue slot.
- Concentration is separate, with its own regen. Instant uses are fine: Blink spends a lump.
- Bindings come back when their effect ends, after a cooldown.
- The name is **Bindings**.
- Rock walls and guards are Bindings. Dismissing one frees its Binding only after the cooldown, and the Earth is spent anyway.

## Open questions
- Not taken for now: a caster power stat. Power is regen and slots (the user).
- How many Bindings, and how long the cooldown? Do more element runes in a made thing ever cost more than one Binding?
- Concentration's size and regen, and how hard a hit drains it.
- World spells bind runes today: do they bind Bindings instead, or both?
- What happens to Ice walls' and coated fields' costs in detail (an Ice wall is a Binding; a coated field Concentration plus its element runes).
- Every existing spell's cost under the new line (the next step, in the [element identities thread](../threads/element-identity.md)).

## Smallest test
Not yet: the user wants every spell's change worked out on paper first. When it's time, the Sanctum with the new HUD and the costs moved, no other changes.
