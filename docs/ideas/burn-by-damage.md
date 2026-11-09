---
status: raw            # raw | developing | prototyping | adopted | parked | rejected
pillars: [2, 4]
related: [../explorations/2026-11-07-rune-scaling.md, ../explorations/2026-11-05-weapon-dps.md]
---

# Burn that follows the damage

The user's idea (2026-11-09): burning shouldn't be one fixed status. Some share of the damage a fire hit inflicts could burn on over the next few seconds.

## One-liner
The harder fire hits you, the longer and hotter you burn.

## In the hands
Nothing new to press. A big Fire ring leaves enemies blazing; a flick of a flame sword leaves them smouldering. Holding the flamethrower on one target visibly builds the flames on it. A partner reads how much burn someone is carrying from the size of the fire on their body, and knows when a Water douse is worth it.

## Why it's interesting
Today every igniting touch sets the same 30 damage (6 a second for 5 s) and refreshes rather than stacks. So:
- A second or third Fire rune adds almost nothing, because the burn is most of the spell (Fire ring totals were 36, 38, 40 for 1, 2, 3 runes).
- A tiny hit is worth as much burn as a huge one, which is why the flame sword out-damages the Fire spray (`explorations/2026-11-05-weapon-dps.md`).
- A ring on something already burning adds only its direct hit.

## Three designs, worked through
Burn damage added by one hit on a target that isn't burning. "Spray, 3 s" is 18 direct damage in total; the rock is an illustrative 60-damage Earth + Fire shot.

| Case | Direct | A: today (flat) | B: 100 % of damage | C: 12 + 50 % of damage |
|---|---|---|---|---|
| Fire ring, 1 rune | 12 | 30 | 12 | 18 |
| Fire ring, 3 runes | 29 | 30 | 29 | 26 |
| Spray held 3 s | 18 | about 21 (measured) | 18 | 21 |
| A 10-damage weapon hit | 10 | 30 | 10 | 17 |
| A 60-damage rock with Fire | 60 | 30 | 60 | 42 |

- **B, the pure share,** is the simplest to explain, but a light touch of Fire barely burns, and Fire stops being worth mixing into weak spells.
- **C, a floor plus a share,** is the recommendation: touching someone with fire still lights them, and big hits burn more. The burn is a pool on the body that each hit adds to, up to a cap (about 60), and drains over about 4 s.

## Costs & risks
- **Fire on everything.** A share of the whole spell's damage makes Fire a multiplier on any big hit, so Earth + Fire could become the default rock. The cap and a share below 100 % are the guards; counting only Fire's own damage would avoid it but would gut the mixes.
- **Friendly fire gets harsher,** though a Water douse on a burning ally becomes a stronger support move.
- **New state:** a burn pool per body, replacing the burn timer's meaning (sim buffers, replay hash, the view's flames, the Ember targe's thorns and burning floors, which would add a flat amount).
- **A balance pass:** `shapes.fireBlast` was set against the flat burn and would need retuning.

## Open questions
1. Share of the whole spell's damage, or Fire's part only?
2. Does a burning floor add to the pool, or just keep a small burn going?
3. Should Fire's existing mixes (a Fire + Lightning arc) count all their damage?

## Smallest test
Swap the burn timer for a pool behind F1 sliders (floor, share, cap, drain) and play the Sanctum with the ring, the spray and the flame sword.
