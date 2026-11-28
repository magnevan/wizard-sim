# Element identities, and Shield and Sigil as casting styles (2026-11-28)

A conversation between the user and Claude, started because the spell effects are being redrawn for 3D: a good moment to define what each element *is* in play, since that will decide what rune combinations do, and to change spells that don't fit. The result is written into [the elements page](../world/elements.md) (each element's "In play" answers the same five questions) and [casting-styles](../ideas/casting-styles.md). Decision: [Element identities](../decisions/README.md#2026-11-28-element-identities-shield-and-sigil-become-casting-styles-paid-in-concentration-and-bindings). Builds on the [spell pass](2026-11-27-spell-pass.md) of the day before.

## The user's starting points

How the game differs from Magicka, and why that changes the elements:
1. **No Magicks.** Expressiveness comes through the core casting: more gestures (and where you aim matters), more elements (Sigil, maybe more later), and combinations that count (Life + Fire is mostly nonsense in Magicka; here it should work).
2. **Power is capped by the wizard,** who grows through the game, among casters and creatures of other power levels. Repeated presses cost resources here, so scaling differs, and **binary effects are discouraged**: Magicka's shields reflect absolutely, wards give immunity, dispel is absolute, Wet to Frozen is instant.
3. **Longer and more complex:** a slower learning curve, a higher top-level complexity.

The user's sketch of each element, with what was new:
- **The baseline family** (Fire, Cold, Water) mostly doesn't define a spell's shape; it enhances another element's.
- **Fire:** high damage spread over time; burns and destroys.
- **Frost:** slows and controls.
- **Water:** low damage; mass and physicality, it pushes; the most interactions (douses fire, steam, freezes, amplifies Lightning).
- **Lightning:** quick, unpredictable, shocks and disrupts.
- **Arcane:** raw magic, the first element not rooted in a physical effect; it concentrates and shapes magical effects: the beam on Force, *(new)* a charge and release on Area, a delayed explosion on Place. *(New)* it disrupts magic, by amounts: more damage to a magical shield than to flesh or stone, and timed effects lose strength or duration; on yourself it could remove magical afflictions and buffs. The current glass-cannon self cast fits loosely.
- **Life:** healing, with the other elements lending resistance; not well defined.
- **Earth:** resists physical damage, the unique rock, the long shockwave, walls that feel ill defined next to shields. The user's idea: **Earth binds magic to the physical world**, which might be how to avoid disruption; some interplay of Arcane, Earth and Shield, not clear yet.
- **Shield and Sigil:** the caster's skill rather than elements of the world; Shield defensive, Sigil offensive; both make lasting effects (Sigil in discrete bound charges, Shield draining like a battery).

## Claude's response, and the user's reactions

**A framing:** each element answers five questions: on a body, shape, with other magic, what more runes buy, weakness. The baseline family is the set that doesn't answer "shape"; Lightning is halfway (its arc).

| Element | Claude | The user |
|---|---|---|
| Fire | Its job is "undoes" (Wet, Chill, ice, growth); stone doesn't burn | "Undoes" is imprecise, it doesn't undo everything: we use the world page's **consumes**. Fire vs stone: reasonable, see the practical effects |
| Frost | A second verb, **preserve**: Frost pauses a magical effect's decay | Maybe, but it wouldn't make a lightning storm last longer. **Parked**, matter only if ever |
| Water | Sustained shove vs Earth's heavy impact; Water is the medium | Agreed as a direction; either can push either way depending on the spell |
| Lightning | "Unpredictable" breaks pillar 3: say **a path by rules you can learn**. Lightning disrupts **actions**, Arcane **magic** | Agreed |
| Arcane | Arcane is **intensity** (Sigil persistence, Earth physicality, Shield refusal); disruption as **overvoltage**; non-binary through Concentration and Bindings; Attune becomes **opening yourself** | The Sigil overlap is wording: Arcane doesn't make permanent things. Overvoltage is what they imagined. Likes opening yourself |
| Life | Grows over time (Fire's mirror); living structures; a physical-status cleanse; a third kind of wall | Skeptical, worth pulling on. Living structures maybe as **Earth + Life**, not a new wall. **Cleanse rejected:** it takes over Arcane's job and clashes with drying off with Fire |

**Shield, Earth and Arcane** (Claude): every effect has a magic part and a matter part. Shield defends by quality (resistance to a defined change), is strong against elemental magic and weak against Arcane, since raw magic has no element to refuse; mass gets partly through. Earth defends by quantity (mass and HP, no resistance), is immune to disruption since matter isn't magic, and its weakness is its nature (it takes full damage, it's clumsy and blocks allies). Timing beats the beam: an active parry wins, a standing barrier erodes. Power against power decides how much Arcane disrupts.

The user: the system could work. Shield weak against Arcane flips Magicka, and that's fine. **An Arcane-coated shield could hold off the disruption** (Claude: the existing coated-field rule already does it, at a coat's slot).

## The user's proposal: Shield and Sigil as casting styles

The user never liked how Earth walls sat next to Shield (a rock wall took a Shield rune and cost nothing to hold). Their proposal:
- Shield and Sigil stay keys you press, so the spell list doesn't change.
- They lose their runes. Two resources instead: **Concentration** (a real number) and a discrete one (named **Bindings**).
- That frees where each is used: Bindings for made things (a sword, a turret), Concentration for things maintained continuously that resist something. Not everything is one of them: a fire patch isn't Concentration.

Claude's case for it: the code already treats them as styles (a cast holds only one Sigil rune, their own cost models, no zones). It draws the line as **"who is still paying for it?"**: released (runes once, the world's now), Concentration, or a Binding. That line also defines what Arcane dispels, which nothing else had: Earth's immunity falls out (matter isn't magic), Arcane on yourself means stripping held magic and not drying you (Fire's job). Two dials for progression. Costs: retuning regen, the scope (sim, HUD, tutorial, Atlas, help), and edge cases (Blink, the parry, the queue slot).

**The user's answers:**
- Instant use is fine: **Blink** spends a lump of Concentration. The parry doesn't take Shield (it's the guard's Defend).
- The style **keeps its queue slot**.
- **Concentration has its own regen;** a Binding comes back when its effect ends, **after a cooldown**.
- The name **Bindings** is fine.
- **A rock wall is a Binding:** you can dismiss it, but you wait for the Binding to come back and the Earth is spent. With time to prepare, your Bindings set the limit of what you can do.
- **Guards are Bindings too**: "it was always kind of weird that they weren't".

## Next

Written up first as the essence of each element (this page's targets). Then: work out how this changes every existing spell, and then build those changes with their VFX. Tracked in the [element identities thread](../threads/element-identity.md).
