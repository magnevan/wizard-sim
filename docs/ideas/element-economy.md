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
- *(Deferred 2026-11-03: pools stay unlocked for now.)* What does depth unlock? Under proposal C (Atlas v4 onward), depth 1 already reaches all 39 cells and 670 of 678 spells, and depth 2 reaches all 678 (`tools/spell-atlas/depth-c.js`, 2026-11-05). Repeats are power, not new spells, so depth-gated content (Magicks, intensity tiers) has to be added on purpose.
- Are partial runes ever shown (e.g. a half-spent rune regenerating faster)?
  *Partly answered:* the HUD shows up to 5 runes as pips, 6–10 as two rows, and more as a bar with the count ([Play-test round 2, answers](../decisions/README.md#2026-11-05-play-test-round-2-answers-and-notes-811)). Partial runes aren't shown.
- A wildcard rune: kept in reserve if needed later.
- Is support's refill skill just timing, or is there more to it?
  *So far:* refills are your own (Attune, the Arcane wand's Siphon, Survive's Wellspring). No spell refills an ally's runes.

## Smallest test
A one-player arena with visible rune pools, a beam with natural duration and regen debt, and weapons. Does the pace slow down, and do players switch between cheap and big casts without being told?

## Where it stands (2026-11-05)
Built in the game: pools of about 4 runes per element (Fire 5, Sigil 3), slow regen, runes reserved on queue and spent on cast, Attune, Sigil Bind and Shield Model A drain ([Calls Claude made while building milestone 1](../decisions/README.md#2026-11-04-calls-claude-made-while-building-milestone-1-the-user-can-veto-any)). Channels are free for 5 s, then cost upkeep. Depth-gated progression stays deferred; Survive's Deep pools power-ups are the only place pool depth grows.
