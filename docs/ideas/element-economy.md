---
status: prototyping
pillars: [1, 4, 6]
related: [casting-rhythm.md, battlefield-building.md, progression.md, support-verbs.md, ../explorations/2026-11-03-resources-and-battlefield.md]
---

# Element runes

## One-liner
Each element is a pool of **runes** (charges up to a maximum) that regenerate over time. A spell costs the elements you queue, so you can't spam, and big plays need you to save up.

## In the hands
- Your own rune pools are clearly visible on your HUD. Allies' pools are shown subtly or not at all (a coloured pixel orbiting them).
- **A cast costs its queue.** Each form has a natural duration: a beam channels for about 5 s, and a conjured weapon has durability.
- **Sustain as regen debt.** You can hold a form past its natural duration. Its upkeep is subtracted from the element's regen. Example: regen is 0.3/s and the beam costs 0.2/s, so the net is +0.1/s. If the net goes negative, the fractional value runs down, and a whole rune disappears when it reaches 0. Runes are floats underneath and discrete in the UI.
- **Refill** is mostly passive. Some levels twist it: a place where an element is boosted (more power than normal), or suppressed.
- **Playstyle follows state.** When you're low, you use cheap casts and weapons. When you're full, you use beams and area spells.

## Why it's interesting
- **It slows the pace.** Free elements make optimal Magicka play a frantic spam, and runes reward choosing.
- **Balancing elements** is a skill the player learns.
- **Specialization.** A frost mage gets faster frost regen and a deeper frost pool, and maybe "intense frost" built in so there's less clicking. They can still cast everything. An end-game lock-out is possible.
- **Progression through pool depth.** Max runes gate how many of one element fit in a spell, so the reachable spell tree grows as you progress. This is an accepted trade against pillar 1: a smaller frontier at first, and fun to push.
- **Structures have a natural cap** (see battlefield-building).

## Costs & risks
- Depth gating moves some power out of the hands (accepted).
- If regen is too slow, it becomes waiting, not thinking.
- **External drains** (turrets, shields) can't take you below a reserve floor.
- **Naming:** "rune" means one unit of an element. Seal traps are now **glyphs** (Trap Glyph, Puddle Glyph, Line glyph), as of 2026-11-03.

## Open questions
- *(Deferred 2026-11-03: pools stay unlocked for now.)* What does depth unlock? Under proposal C, depth 1 already reaches all 52 cells and 606 of 976 spells, and depth 2 reaches 966 (`tools/spell-atlas/depth-c.js`). Repeats are power, not new spells, so depth-gated content (Magicks, intensity tiers) has to be added on purpose.
- Are partial runes ever shown (e.g. a half-spent rune regenerating faster)?
- A wildcard rune: kept in reserve if needed later.
- Is support's refill skill just timing, or is there more to it?

## Smallest test
A one-player arena with visible rune pools, a beam with natural duration and regen debt, and weapons. Does the pace slow down, and do players switch between cheap and big casts without being told?
