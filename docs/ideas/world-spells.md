---
status: developing
pillars: [2, 3, 4, 7]
related: [../explorations/2026-11-27-spell-pass.md, spell-grammar.md, element-economy.md, enchantments.md]
---

# World spells

## One-liner
Hold Shift+Space to turn the whole scene's weather: rain, a storm, falling stars, slowed time. It's made from the same runes as every other spell, and it hits everyone, you included.

## In the hands
You queue runes and hold Shift+Space. A big circle spreads on the floor while you stand exposed; when it closes, the sky changes for everyone. The runes in it stay bound until the weather ends, so you fight on with a smaller pool. Double-tap Shift+Space with nothing queued to call it off and get the runes back (proposed). Your partners see the circle and cover you, then play inside the weather: rain makes every Lightning bolt deadly, including theirs.

Decided so far (2026-11-27, [the spell pass](../explorations/2026-11-27-spell-pass.md)): Shift+Space held; paid by binding its runes, more runes for a longer or stronger weather; one weather at a time, and any new one replaces it (the old caster's runes come back); pure Sigil is time warp; pure Shield is Nullify.

*(2026-11-28: with Shield and Sigil becoming casting styles, the user moves Nullify to pure Arcane and feels time warp belongs to Cold; proposed on [Spell Ramifications](../explorations/2026-11-28-spell-ramifications.md#round-2-on-the-page) as `r2-world`.)*

## How the runes make weather

**Each element has one world layer, and a mix lays its layers together, except where two elements fuse.** The fusions follow the ones the game already makes, so the weather reads like the rest of the spell language. Opposites already cancel in the queue, so a contradictory mix can't be cast.

| Rune | Its layer | Confidence |
|---|---|---|
| Water | Rain: everyone slowly gets wet, puddles form | settled |
| Cold | Chill that builds slowly on everyone | settled |
| Lightning | Strikes, marked a moment before they land, drawn to the wet and the tall | settled |
| Earth | Falling rocks, marked where they'll land; it carries the others (below) | settled |
| Life | Everyone regenerates, enemies too | settled |
| Ice (Water + Cold) | Hail: small fast hits everywhere, chill on the wet | settled |
| Fire | see the options below | **open** |
| Arcane | see the options below | **open** |
| Sigil | Time slows for everything, casting included (the mirror of Haste) | decided |
| Shield | Alone, Nullify: the weather ends, no new one for a while, lingering fields fade. With elements: everyone in the scene resists those elements | Nullify decided; the ward proposed |

### Fusions (the combos that aren't stacked)

The user, 2026-11-27: "fire rock should be meteors, so it's not a purely stacked effect." Proposed rule: **a world mix fuses where the game's other spells already fuse; everything else stacks.**

- **Earth carries.** Earth on Force carries the rest (Earth + Fire is a fireball), so in the sky the falling rocks carry the other runes instead of adding a separate layer: Earth + Fire is a **meteor shower** (burning impacts that leave fire on the ground), Earth + Ice ice boulders, Earth + Lightning charged stones that arc on landing, Earth + Life seed stones that sprout a heal where they fall, Earth + Water mud bombs that soak.
- **Steam (Water + Fire) is fog.** Steam is cover, not a setup, and never soaks; as weather it's a fog bank that hides bodies and shots at range. Nobody gets wet.
- **Ice (Water + Cold) is hail** (in the table), with a blizzard when more Cold is added.
- **Stacked, not fused:** Water + Lightning is rain plus strikes, which already is a thunderstorm; Cold + Lightning is chill plus strikes; Life with anything is regeneration under the rest.

Open: does a fused layer replace both parents (meteors without plain rocks) or only the carrier? Proposed: it replaces both, as a fireball replaces a rock.

### Fire: options

Fire's essence is "consumes and transforms", and its fields are **unstable: they flare and fade**. Its job in play is damage, and it undoes Wet and Chill on purpose.

- **F1. Flare-ups (recommended).** Patches of ground glow, then burst into fire for a few seconds and die down, all over the scene, marked a moment before. Wetness dries off a little everywhere. Lore and play match (fire fields flare and fade), it's damage plus ground denial, and the warning makes it a dodge pattern rather than random harm. Against rain it fizzles (Water + Fire fuses to fog).
- **F2. Heat wave.** No damage of its own: Fire hits harder, burning lasts longer, wet and chill dry off. Clean as a modifier, but alone it's a buff for whoever casts Fire, and it's hard to see.
- **F3. Wildfire.** Burning spreads from body to body on contact. A sharp co-op hazard that fits Fire's "you risk setting yourself alight", but it's a new spreading rule, and enemies clumped round you become your problem.
- **F4. Ember fall.** Embers drift down and light what they touch. Close to the meteor shower, and less readable.

### Arcane: options

Arcane is the deep field under all the others, close to the surface only where the crust is torn (rifts). It draws out a caster's power: Attune (Arcane on yourself) floods every pool's regen and leaves you taking more damage. Its opposite is Life.

- **A1. The deep field rises (recommended).** World Attune: everyone's rune regen is raised and everyone takes more damage. Fights get short and sharp. It's the self cast on everyone, as rain is Water on yourself and the Life layer is a heal for all; and it's Life's mirror (Life: everyone heals; Arcane: everyone hurts more but casts more). Mostly helps the side that casts, so enemy casters would gain too.
- **A2. Rifts.** Tears open at marked spots and fire short piercing lances across the field, the world version of the Arcane beam. Clear and dangerous, but close to Lightning's strikes in feel.
- **A3. Wild magic** (spells drift or misfire): rejected up front. It's Magicka's misfire comedy, against pillar 1 (power comes from your hands).

A1 and A2 could combine: the rifts are where the deep field rises, and standing near one floods your regen.

## Why it's interesting

- Players get to make the level twists pillar 6 welcomes ("a place where fire runs hot") for themselves.
- It plugs into the statuses that already exist (wet, chill, burn), so a world spell changes what every other spell does instead of being a big bang on its own.
- The ritual gives co-op a moment: one casts, the others hold the line.
- Binding runes makes it a real choice: a big fight is worth playing with a smaller pool; a skirmish isn't.

## Costs & risks

- **Readability.** The whole screen must say what the weather is (sky, particles, sound, a quiet HUD line), or its effects feel random.
- **Performance.** Full-screen particles on the user's basic machine need a cheap version.
- **Determinism.** Strikes, rocks and flare-ups come from the sim's seeded random numbers.
- **Scope.** Eight layers and a handful of fusions, each with a look and a sound; plus the Shield ward in every element.
- **Balance.** Applying to everyone keeps it fair, but Life (heals enemies) and A1 (enemy casters gain) depend on who's in the fight.

## Open questions

- Fire: F1, F2, F3 or F4? Arcane: A1, A2 or both?
- Does a fusion replace both parents?
- What do rune counts scale: length, strength, or one each (the lead element's count for strength, the total for length)?
- How long a wind-up, and how far does weather reach (the whole scene, or a large radius round the circle)?
- Can enemies cast weather (a goblin shaman's rain)?
- Shield's world ward: does it bind like the rest, or drain the Shield pool like other wards?

## Smallest test
In `#survive`, rain (Water) and the thunderstorm (Water + Lightning) only: Shift+Space held, runes bound, the cancel double-tap. Does one player casting rain while the others fight change how the whole team plays, and does the screen read clearly?
