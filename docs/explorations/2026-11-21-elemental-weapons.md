# Elemental weapons: every base and infusion (2026-11-21)

The user, on [issue #4](https://github.com/magnevan/wizard-sim/issues/4) ("Weapons with additional elements don't look great, the particles just read as noise"): list every elemental weapon that can be made, each core shape with its versions (a repeated element counts once), then use Codex to draw concept art for what the versions could look like, on one page.

Review page: Elemental Arms (`tools/weapon-variants/`). Marks are kept in its db.

## The list

`tools/weapon-variants/enumerate.mjs` presses every key sequence (Sigil plus up to four of the seven field keys) through the game's own rules (`game/packages/rules/src/rules-c.gen.js`: cancels, Water + Cold into Ice, the lead order) and keeps each weapon with each distinct set of extras. It writes `variants.json`, which also records the shortest key presses and what each extra adds, using the rules' own text. **57 in all:**

| Weapon (lead) | Versions | Extras that can join |
|---|---|---|
| Flame sword (Fire) | 2 | Water (steam) |
| Tide trident (Water) | 2 | Fire |
| Frost spear (Cold) | 1 | none: Water turns it to Ice, Fire cancels it, everything else outranks Cold |
| Ice bow (Ice) | 5 | Cold, Water, Lightning, Cold + Lightning |
| Lightning whip (Lightning) | 3 | Cold, Fire |
| Arcane wand (Arcane) | 12 | Water, Fire, Cold, Ice, Lightning, in pairs |
| Stone maul (Earth) | 14 | Arcane, Water, Fire, Cold, Ice, up to three |
| Healing hands (Life) | 18 | everything but Arcane, up to three |

Why it is so lopsided: the lead order (Life > Earth > Arcane > Lightning > Ice > the most of Water, Fire, Cold) means a weapon can only carry elements that rank below it and don't cancel it. The low-ranked weapons (sword, trident, spear) are nearly always taken over, and the Frost spear can never be infused. That may be worth a design look of its own: a player who wants a Frost spear with a bite of Lightning gets a Lightning whip instead.

## The concept art

Nine Codex sheets (`tools/concept-gen/prompts/2026-11-21-elemental-weapons/`, written by `tools/weapon-variants/prompts.mjs`), each a grid of up to six variants, with the approved weapon sheet A (`docs/reference/wizard-arms/weapons-a.jpg`) as the reference so each weapon keeps its design, plus the wizard's model sheet for the Healing hands. `slice.py` cuts the sheets into the page's cards; the seven plain weapons are cropped from sheet A itself.

The brief for each extra element is one motif, the same on every weapon, sculpted into the weapon as a solid shape in the element's colour, with no loose particles. Two or three extras each take their own part of the weapon (head, shaft, grip):

- Fire: a molten core, glowing cracks and an ember edge.
- Water: a deep-blue water ribbon spiralling round it, with droplet beads.
- Cold: white-cyan frost rime and snow caps.
- Ice: clear white-blue crystal spikes growing out.
- Lightning: lavender-white zig-zag inlays and a copper coil.
- Arcane: magenta-pink rune inlays and one floating shard.
- Earth: rough brown stone plates bolted on.

This is the direction offered for issue #4: an extra reads as a change in the weapon's form and colour first, and any particles it keeps are few and in one colour. The game would need these as prop variants or shader zones (`tools/sprites-3d/wizprops.py`), not only as effects in `view-structures.ts`. Nothing is decided until the user marks the page.
