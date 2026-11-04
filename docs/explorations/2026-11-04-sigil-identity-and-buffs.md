# Sigil's identity, self buffs, and stacking (2026-11-04)

The user's notes come from reading Spell Atlas v5. They are summarized closely below, with the key phrasing quoted, followed by Claude's proposals. Nothing here is decided yet.

## The user's notes

- **Colour:** Sigil's lime was too close to Life. It has been changed to violet `#d400ff`; its nearest colours are Arcane and Lightning, both at ΔE ≈ 73.
- **Sigil alone:** the first-pass versions (spark turret, spell blade) are "very barebones versions of what the spells do once infused, which feels like a reasonable default".
- **Sigil + Force is odd as a resource.** "I hadn't intended that sigil+fire would consume any sigil while it operated, so what does this turret do?" One answer: all turrets consume some Sigil too, which adds a bottleneck on top of the elements they use.
- **Thought 1: intensity.** Runes limit both how *often* you can cast and how *intensely*. You stack fire for a stronger fire spell, but you can't stack Shield ("we probably should not stack sigil either"). Shield still has intensity of a kind, because a placed shield consumes Shield over time, and a defensive mage could specialize in it. "What does it mean to be more intensely sigil? I feel like this needs an answer."
- **Thought 2: the null case.** Shield alone differs from Shield with elements: alone it is a mirror wall or reflect ward; with elements it is an elemental arc or a magic or physical ward. "It's like shield says 'here is a thing that will persist in either an arc, line, circle or skin'. And with null elements attached it has this mirror quality." Sigil has shapes (turret, orbitals, glyph, buff, weapon) "but we don't have a good 'null' answer. I think it should be more unique than what we currently have, since shield is more unique." "Maybe there's a good answer that solves both things."
- **Sections to explore next:**
  - **A per-element, per-cast reference table.** Below.
  - **What each element adds.** Stream of consciousness: water wets (a combo piece; wet targets can't use lightning), life heals, cold slows (and freezes with water), lightning stuns (a damage bonus, and more range with water), arcane amplifies (makes things explode or hit an area; in a beam it extended duration), fire burns (damage over time) and removes water, earth knocks down and makes solid barriers. Arcane's explosion is "kind of unique". Are there other effects like it? "Useful to have a structure to think about this."
- **Self buffs, one by one:**
  - **Empower:** "I don't hate it, but it feels a little weird."
  - **Riptide:** "can you add soak to fire spells? Lightning spells? Not a big fan."
  - **Vigor:** "Maybe this should be the heal over time effect?"
  - **Frostbite:** it has the same problem as Riptide, and it does nothing to frost spells. "Not a definite no."
  - **Haste:** "feels pretty good, haste was a key effect in the old game." There is a slight worry it's too easy. Where it appears isn't settled.
  - **Glass cannon:** good, but "my brain is itching a little bit about this one having a downside while haste doesn't".
  - **Fire aura:** "the more natural version of riptide and frostbite. Shield is about protecting you, aura is about affecting those around you. It doesn't have to empower your spells otherwise."
  - **Heavy hand:** "enhancing your spells is better done via adding runes to them. Maybe this can push back enemies as you walk into them? Even occasionally knock them over if they're small."
- **Stacking:** "what happens when you stack elements?" Stacking effects (Shield + fire + lightning) works, "but there should probably be some hierarchy based on strength". For example, Shield + rock in the world makes boulders carrying elements, because rock takes precedence. In Magicka, Shield + rock gives physical armour, Shield + fire gives fire immunity, and Shield + rock + fire just does both. That's "slightly boring".
- **Life spells:** "we should go over these more and see if they make sense, they were a little weird in the original game too."

## Claude's proposals

### One answer for both thoughts: Sigil is a vessel for your magic, and Shield is a mirror for theirs

- **Null Shield** turns *enemy* magic around: it reflects.
- **Null Sigil** catches *your and your allies'* magic and casts it again: it echoes. An empty Sigil device is a vessel you fill by casting into it.
  - **Null Force: a relay.** A post that catches any spell cast into it and fires it again at the nearest enemy. Beam into it and it re-aims your beam; an ally's spray through it fires again.
  - **Null Area: a halo.** Orbs around you that each catch a spell passing through them and repeat it as a smaller copy.
  - **Null Place: an empty glyph.** Cast any spell onto it and the glyph holds that spell until an enemy steps on it. This brings back the Stored Spell without the ambiguity: the glyph stores whatever hits it, not its own queue.
  - **Null Self: Echo.** Your next spell casts twice (replaces Empower).
  - **Null Weapon: a spellblade.** Cast a spell into it and every swing carries that spell.
  - It's co-op: one player places a relay or empty glyph, another fills it.
- **Sigil's intensity is activations.** Shield and Sigil spend their runes differently:
  - **Shield** costs upkeep over time while the thing persists (endurance). A Shield specialist holds more walls for longer.
  - **Sigil** spends a Sigil rune each time a device acts: a turret shot, an orbital strike, a glyph going off, an echo. The elements are paid once, at cast. A Sigil specialist runs more devices, and each one fires more times.

  This answers "what does a Sigil+Fire turret do": it fires until your Sigil runes run out, then stops.
- **No stacking of Sigil**, the same as Shield: Sigil + Sigil cancel. Intensity comes from the pool, not the queue.

### Self buffs: Sigil + Self is an aura (it affects those around you); Shield + Self is a ward (it protects you)

Spells are boosted by adding runes, so an aura doesn't touch your spells.

| Element | Sigil + Self | Notes |
|---|---|---|
| (none) | **Echo**: your next spell casts twice | the null answer above |
| Fire | **Fire aura**: burns enemies near you | kept |
| Cold | **Frost aura**: slows enemies near you | replaces Frostbite |
| Water | **Mist aura**: wets enemies near you and douses burning allies | replaces Riptide; a set-up for lightning |
| Lightning | **Haste** | kept; it's the one exception that buffs you |
| Arcane | **Glass cannon** | to fix the downside asymmetry, every aura costs Sigil upkeep, so none is free; Glass cannon just adds a risk on top |
| Life | **Regeneration**: you heal over time (an aura version would heal allies near you) | replaces Vigor |
| Earth | **Bulldoze**: you push enemies back as you walk into them, and knock small ones over | replaces Heavy hand |

### Stacking: the same material + coating rule as in the world

Earth is the *material*, and every other element is a *coating*. This is the same rule as Shield + rock + fire making a burning boulder.
- **Wards:** Shield + earth is stone armour (physical). Shield + earth + fire is stone armour coated in fire: it resists physical and fire damage, and anything that hits you in melee catches fire. Without earth, each element is a resistance, as in Magicka.
- **Auras:** they stack as several auras, each weaker (the current split rule). Earth makes the aura physical (Bulldoze), and the other elements ride on it, so a bulldoze with fire burns whoever you shove.

This keeps "it just does both" but gives earth combinations a shape, which makes it less boring.

### Structure for "what each element adds"

There are three kinds of effect:
1. **Status.** Wet, burning, chilled or frozen, stunned, knocked down, healed.
2. **Shape changes.** These change the spell's geometry, not the target. So far: arcane adds a burst (an explosion on hit), and earth adds weight (slower, sturdier, it pierces). Candidates to check:
   - lightning *chains* (a shape change, not just a stun)
   - water *pushes* (a shape change through knockback)
   - cold *lingers* (it leaves a slow patch)
3. **Interactions.** These depend on another status: wet + lightning, wet + cold freezes, fire removes wet, frozen + a heavy hit shatters.

Each element should own one status and at most one shape change. A table in that form shows the gaps quickly.

## Reference: the strongest element and the form it takes (from rules-c.js, Atlas v6)

| Form (strongest element) | Force | Area | Place | Weapon |
|---|---|---|---|---|
| Shield (Barrier) | Shove wave | Ring of barriers | Barrier arc / Drawn barrier (drag) | Buckler |
| Sigil (Device) | Spark turret | Spark orbitals | Glyph / Line glyph (drag) | Spell blade |
| Earth (Heavy missile) | Rock | Earthquake | Geyser | Heavy swing |
| Arcane (Beam) | Arcane beam | Arcane nova | Arcane blast | Arcane swing |
| Life (Beam) | Life beam | Healing ring | Healing spring | Healing swing |
| Lightning (Arc) | Lightning arc | Discharge | Lightning strike | Shock swing |
| Water (Spray) | Water spray | Splash ring | Flood | Soaking swing |
| Fire (Spray) | Flamethrower | Fire ring | Fire patch | Flaming swing |
| Cold (Spray) | Frost spray | Frost ring | Frost patch | Frost swing |

Shield and Sigil with one other element:

| Queue | Force | Area | Place | Weapon |
|---|---|---|---|---|
| Shield + Earth | Fault line | Ring of stone | Stone arc | Bulwark |
| Shield + Water | Tidal wave | Ring of curtains | Curtain arc | Buckler |
| Shield + any other | Elemental wave | Ring of curtains | Curtain arc | Buckler |
| Sigil + Water | Water spray turret | Water orbitals | Water glyph | Tide glaive |
| Sigil + Life | Life beam turret | Healing orbitals | Life glyph | Mending rod |
| Sigil + Cold | Frost spray turret | Cold orbitals | Cold glyph | Frost spear |
| Sigil + Lightning | Lightning arc turret | Lightning orbitals | Lightning glyph | Lightning whip |
| Sigil + Arcane | Arcane beam turret | Arcane orbitals | Arcane glyph | Arcane hook |
| Sigil + Earth | Rock turret | Stone orbitals | Earth glyph | Stone maul |
| Sigil + Fire | Flamethrower turret | Fire orbitals | Fire glyph | Flame sword |

Self: Shield → Ward, Sigil → Empower. Alone, Water → Douse, Life → Heal, Cold → Chill, Lightning → Shock, Arcane → Hurt, Earth → Bruise, Fire → Burn.

The table already shows weak spots:
- Shield's Weapon column barely changes (Buckler for everything except earth).
- The plain Weapon column is seven near-identical swings.
- Life's row (beam, ring, spring, swing) is the one the user wants to revisit.

## Addendum 1: the user's reaction, and a second round

**The user isn't sold on the vessel idea.**
- **Force relay:** what's the point? Maybe a defensive way to stay out of line of sight.
- **Area halo:** "echo spells passing through them" is unclear.
- **Place empty glyph:** a glyph with elements already does this.
- **Self Echo:** the effect is fine, but a free double cast is overpowered.
- **Weapon spellblade:** a weird effect, and overpowered if it ignores cost.

**Sigil's identity (the user):** it's about manifesting things in the world. A heavy Sigil caster is better at that, the same way a heavy Shield caster is better at barriers. Two cost directions:
1. **Bind.** A device binds one Sigil rune until it goes off. With 3 Sigil runes you can keep 3 glyphs or 3 turrets.
2. **Consume over time**, like Shield. The worry is that a Sigil caster could swap elements fluently in a way a specialist can't. A hybrid is possible, where Sigil replaces some rune: for example, Sigil + rock + 3 fire would cost Sigil + rock + 2 fire. The exact rule is open.

**The user's brainstorm for Sigil alone:**
- **Force:** cast one spell and it recasts on a natural trigger. The worry is that this is hard to understand while experimenting. The alternative is a **lens or focus** that amplifies spells cast through it: a power-up that costs you mobility.
- **Area:** amplify your next few spells, charge-based. Or orbitals that help regenerate runes, at most 1 per spell and not a full refund. It's fine for this to be rune-positive, since it takes time to cast and probably can't be mixed with other orbitals.
- **Place:** teleport?
- **Self:** Echo, but it only doubles the spell if you can pay the double cost. Sigil runes could act as wildcards.
- **Weapon:** "spell sculpting" as in D&D, a special wand that turns off friendly fire.
- **Auras:** the list looks good now. Glass cannon could instead make you easier to knock down, as Shield did in Magicka.

**Claude's read:**
- **Pick Bind.**
  - It is exactly "a Sigil caster maintains more things": the depth of your Sigil pool is your device count.
  - It also answers the cap on stuff that was left for later in the upkeep rule.
  - The elements stay the ammo, paid once at cast, so an element specialist still builds the stronger devices. No hybrid rule is needed.
  - Shield keeps upkeep over time (endurance). Sigil binds (count). That asymmetry is good.
- **Sigil alone, in one frame:** null Shield turns *their* magic around (a mirror); null Sigil shapes *your own* magic.
  - **Force: a lens.** It amplifies anything cast through it, from you or an ally. It pairs with the mirror, is readable, and fits the existing rule that beams through a structure pick up its elements. The trigger-recast is harder to read, so drop it.
  - **Area: focus charges.** Orbs around you, each spent to amplify one of your next spells.
    - Regenerating orbitals risk becoming a chore before every fight ("always keep them up").
    - They are also near the self-made sources the user rejected earlier.
  - **Place: a waypoint glyph.** Release teleports you to it. It's a thing in the world, it binds a rune, and it gives Sigil mobility (Magicka had teleport as a magick). A co-op variant is open.
  - **Self: Echo,** only if you can pay the second cast. Sigil runes as wildcards need care, because they would make Sigil the best pool to deepen. With Bind, every Sigil rune used as a wildcard is a device you can't keep, which limits it.
    - Overlap: Echo and focus charges are both "boost my next spells". If both stay, Echo repeats a spell and focus strengthens one, so they need to look clearly different.
  - **Weapon: the sculpting wand.** While you hold it, your spells spare allies. It also answers the open ally-safe question (`c-ally-safe`, where Attuned Blast used to be). The cost is that it occupies the weapon and binds a Sigil rune.
  - **Glass cannon:** easier to knock down instead of taking more damage. Agreed.
