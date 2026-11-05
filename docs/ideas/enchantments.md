---
status: prototyping
pillars: [3, 6]
related: [spell-wishlist.md, support-verbs.md, conjured-weapons.md]
---

# Self & ally enchantments

## One-liner
A wider family of buffs cast on yourself or an ally. Magicka mostly had shield variants plus Haste.

## Candidates
Heal over time, run speed, glass cannon (more damage, more fragile), ethereal / plane shift, and the targeted ward from `support-verbs`.

## Why it's interesting
It gives support a large verb set that acts on allies directly, and lets players build a style around self-enchants.

## Open questions
- Is there one targeting rule for "self vs ally"?
- How do enchant states stay readable on a busy screen?

## Where it stands (2026-11-05)
Much of this is built in the game, as Sigil and Shield casts rather than a separate system:
- **Auras (Sigil + Self):** fire, frost and mist auras, Regeneration, Bulldoze, Haste and Glass cannon. They act on those around you, not on your spells ([Sigil's identity](../decisions/README.md#2026-11-04-sigils-identity-see-explorations2026-11-04-sigil-identity-and-buffsmd)).
- **Wards (Shield + Self):** element wards, the mirror ward, stone armour and the Mending ward; a caster may keep up any number of wards on allies, each draining their Shield pool ([Grammar v2; wards for support](../decisions/README.md#2026-11-05-grammar-v2-in-the-game-wards-for-support)).
- **Heals lend resistance:** every element in a Life spell lends the healed its guard strengths for 4 s ([Every element in a heal lends its resistance](../decisions/README.md#2026-11-05-every-element-in-a-heal-lends-its-resistance-guard-ties-settled)).
- Open question "one targeting rule for self vs ally?" **Answered:** Self lands on the ally under the cursor only for a ward (Shield) or an aura (Sigil + elements); plain elements on Self always hit you. A ring and chevron mark the ally ([Rings, wall lifetime, Self on allies](../decisions/README.md#2026-11-05-rings-wall-lifetime-self-on-allies)).
- Open question "readable on a busy screen?" **Partly answered:** status shows on the body, never as icons ([the look rule](../decisions/README.md#2026-11-04-the-look-rule-ice-shards-turret-draw-the-users-feedback-on-the-vfx-gallery-and-pixel-battlefield-pass-3)). Whether many stacked enchantments stay readable in a four-player fight is untested.
- Not built: ethereal / plane shift.
