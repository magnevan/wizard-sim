---
status: adopted        # raw | developing | prototyping | adopted | parked | rejected
pillars: [2, 3, 4]
related: [../explorations/2026-11-09-fire-and-cold-status.md, burn-by-damage.md]
---

# Chill as a frost pool

## One-liner
Cold fills a hidden frost pool; the fuller it is the slower you move, and Water turns enough of it into a freeze.

## In the hands
Frost on a goblin fills its pool quickly; frost on a Brute takes commitment or a second caster. Under the health bar, a thin strip shows how cold something is and brightens once a Water hit would freeze it. Freezing is a two-step, usually two-player, move.

## How it works (built 2026-11-10; every number is an F1 slider)
- **Pool size** is 2.5 × √max HP: not linear with health, so a large creature is hard to freeze, not impossible. Goblin 14, Shieldbearer 29, Brute 46.
- **Filling:** a hit's Cold damage goes in. A mixed spell only adds its Cold share, so Arcane + 2 Cold is twice as good at chilling as 2 Arcane + Cold.
- **Decay** is 10 % of the whole pool a second, even under fire. A weak source stalls on a tough enemy, because decay outruns it; a tough enemy needs a rapid source or a second caster.
- **Slow** rises with the pool, to 60 % at full.
- **Freezing** needs Water and Cold, in either order: a Cold hit on a wet body, or a Water hit on a chilled one, with at least 30 % chill. A Water spray leaves a body wet for 6 s. It lasts 1.5 s at 30 % up to 4 s when full, and uses up the chill and the wet.

## A design rule to keep
If Arcane + 2 Cold is better at freezing than 2 Arcane + Cold, then 2 Arcane + Cold must be better at something else. Today it is: it deals more Arcane damage. Every mix change should keep this true: moving a rune should trade one thing for another, not simply lose.

## Damage or runes
The user weighed scaling chill by runes against scaling by damage. Damage won because it prorates mixes without a special rule. The cost: the Cold damage sliders also change how fast things freeze, and rings (full damage to everyone inside) stay strong but low-damage casts freeze less than a rune-based rule would allow. Revisit after play.

## Open questions
Does a thaw leave any chill? Should toughness shorten freezes? Is a huge boss (4,000 HP) right to be out of reach of one spray?
