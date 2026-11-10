# Fire and Cold as statuses (2026-11-09)

A conversation with the user after a play-test of the Area casts. Nothing here is built yet. See `ideas/burn-by-damage.md` and `ideas/chill-meter.md`.

## The worry

The user, on Magicka: fire wasn't used much, partly because wet was so important. Wet + cold froze enemies, giving breathing room and a way to massive earth damage; wet + lightning had a huge bonus. Lightning could stagger and cold was very good crowd control, while fire had little besides raw damage. "I want to avoid that situation here."

## What our game does today (measured)

- **Fire undoes its partners' work.** A Fire hit on a wet body only dries it, and on a chilled or frozen body only thaws it. Neither hit ignites. Setups are wasted rather than spent.
- **Wet + any Cold is an instant freeze.** A one-rune Frost spray on a wet dummy froze it at the end of the wind-up (0.20 s), with chill at 0.03 of 3.
- **Chill alone also freezes, fast.** A held one-rune Frost spray froze a dry dummy in 2.1 s. The code has no term for the target's size, so a Brute goes as fast as a goblin.
- **Freezing can loop.** After a freeze that came from chill, chill was still 2.12 of 3, so about half a second more spray freezes it again.
- **The slow already slides.** Speed and attack pace fall 22 % per stack, continuously, and chill drains 0.25 a second. The scale is hidden because reaching the top ends in a freeze.

## Fire: the damage formula isn't enough

The burn pool (floor, all of Fire's own damage, a quarter of the rest) is still the recommendation for damage, and Fire's essence ("what consumes and transforms", `world/elements.md`) suits a pool. But by itself it only makes Fire better at raw damage, which is the Magicka trap.

| Verb | What it does | Pays for | Costs |
|---|---|---|---|
| **Consume** | Fire spends the target's Wet or Chill for a burst (flash-boiled steam; a thermal shock that scales with chill %) instead of wasting it | Partners' setups become Fire's payoff | Fire still leans partly on others' statuses; a Fire player can still spend a setup a partner wanted for Lightning |
| **Panic** | A body carrying a big enough burn pool breaks off its attack and runs for a second or two; the threshold rises with toughness | Fire gets control of its own: Cold holds, Lightning staggers, Fire scatters | Scattered enemies are harder to aim at and undo a clumped pack; a new AI state |
| **Denial** | Enemies path around burning floors | Fire walls shape the fight (pillar 7); `elements.md` already says fire patches deny ground, but enemies ignore them | Only helps Place; enemies stalling at the edge need a rule; flow fields must read floors |
| **Spread** | Burn leaks to bodies touching a burning one | Packs melt | Takes contagion, the verb that makes Blight worth having as a tenth element |

**Recommendation:** the pool, plus Consume and Panic. Consume fixes Fire fighting its partners; Panic gives it a control verb no setup is needed for. Denial is a good cheap follow-up. Spread only if Blight is dropped.

## Cold: the user's direction, with numbers

The user's points: chill builds more slowly on stronger enemies; chill is a sliding scale of slowness up to a cap; Water + Cold freezes but needs a minimum chill %, and freeze duration may depend on it; chill decays.

Proposed first numbers (today's 3 stacks read as 100 %):

- **Build:** 20 % per Cold rune, times toughness = min(1, sqrt(60 / max HP)): goblin and imp 1, archer 0.94, grabber 0.82, shieldbearer 0.67, Brute 0.42. A held spray builds about 25 % a second rather than today's 53 %, also times toughness.
- **Slow:** up to 60 % slower at 100 %, on walking and attack pace alike.
- **No freeze from chill alone.** Pure Cold tops out at the slow, so freezing needs Water.
- **Freeze:** a Cold hit on a wet body with chill at 30 % or more after the hit. It lasts 1.5 s at 30 %, rising to 4 s at 100 % (a flat 3.5 s today), and uses up both the Wet and the chill, so a refreeze is earned from zero.
- **Decay:** one second's grace after the last Cold hit, then 15 % a second, the same for everyone.

| Body | Cold runes to reach the freeze threshold (30 %) | To full slow (100 %) |
|---|---|---|
| Goblin, imp | 2 | 5 |
| Shieldbearer | 3 | 8 |
| Brute | 4 | 12 |

One status economy falls out of this: Cold builds chill; Water cashes it into a freeze; Fire cashes it into a burst; Earth cashes the freeze into a shatter.

**Costs.** Cold gets worse against the things it was winning against, on purpose. The tutorial's freeze beat and its bot assume one cast freezes, so they need retuning. Wet + Lightning is untouched and Wet still lasts 12 s, so it stays strong; watch it after these changes.

## Open questions

1. Consume and Panic together, or one of them first?
2. Should pure Cold really never freeze?
3. Does a freeze reset chill to zero, or leave some?
4. Does the toughness curve also apply to freeze duration?
5. Should Water's Wet be shortened once the rest is in?
