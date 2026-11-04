---
status: prototyping
pillars: [6, 7, 3]
related: [element-economy.md, spell-preparation.md, ../explorations/2026-11-03-encounters.md, ../explorations/2026-11-03-resources-and-battlefield.md]
---

# Battlefield building

## One-liner
Walls, turrets, fields and mines that last, placed freely (draw a wall as a line), and powered by the caster's own element pools.

## In the hands
You drag from one point to another to raise a wall along that line. A fire turret you place shoots on its own and draws fire from you. Your teammate sees your structures tinted in your colour, so they know whose they are and who is paying for them. Some encounters ask you to hold a choke point or high ground against waves, not to push forward.

## Why it's interesting
- Encounters can be about holding and retreating, not only advancing.
- Preparation during lulls pays off (pillar 7).
- Upkeep from the caster's pools caps building without arbitrary limits: the more you build, the less you can cast.
- A builder role emerges in co-op: someone who has invested in structures and casts little.

## Costs & risks
- Upkeep that drains you on use can empty you at the worst moment.
- Turtling can become dominant, so enemies must answer structures.
- It's a big system: placement rules, pathing around walls, and AI that reacts to structures.
- Drawing a line with the mouse brushes against the platform rule "no drawing shapes".
- A grid is clearer but less playful.

## Open questions
- Upkeep model: reserve part of the pool while the structure lives, drain on use, or both?
- Line drawing: two-point drag or freeform, and grid or snapping?
- What share of encounters are holds versus pushes?
- What counts as "permanent" (and so has upkeep), as opposed to timed?
- Can allies feed or use your structures?

## Smallest test
One choke point, waves coming down one lane, two-point drag walls and one turret type, and a single pool that turrets drain. Does holding feel tense and tactical, or does it collapse into "build, then watch"?

## Update 2026-11-03 (user's answers)
- This is a separate idea from element runes. They're compatible, but not one system.
- **Upkeep:** probably a mix:
  - a turret fires using the caster's runes
  - a rock wall *reserves* runes and returns them as it's destroyed
  - a shield *consumes* runes as it absorbs damage
  One modality would be simpler; undecided.
- **Reserve floor:** no structure can drain its caster below a reserve.
- **Input:** freeform, or a hidden internal grid; undecided.
- **Encounters:** a mix of pushing and defending, to be tested. "Retreat" means falling back to prepared lines.
- The game must be built to fit: enemies that answer structures, and spaces that hold.
- **Decided 2026-11-03: stuff costs once, energy costs upkeep.**
  - Earth and Ice structures are paid from the queue and last until broken.
  - Shields, turrets, fields and sustained beams are paid as regen debt that scales with the work they do.
  - "Stuff" needs a cap on how much you can prepare; balancing comes later.

**Update 2026-11-03 (from Pixel Battlefield pass 2 feedback):** structures need readable health. Walls show damage states and should last a while in normal play. An energy shield fades as its caster's runes run low, so upkeep is visible to allies. Walls must look tall and solid enough to block (the ice wall currently looks too small).
