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

## The user's marks (2026-11-21)

Most solid-motif concepts were marked no. The keeps: every plain weapon, the Ice bow with Cold and with Cold + Lightning, and the maul's Arcane rune ("I like just having a clear glowing rune"). The general note set the direction: "In general the leading element sets the shape, but the subsequent versions sets the element. Like with other spells." The per-version notes, turned into a list per weapon and element, are in the [thread](../threads/elemental-weapons.md#what-to-fix-per-weapon-and-element). In short: the maul's whole head becomes fiery, watery, snowy, icy or steam; the wand's orb becomes a fireball, a ball of water, a snowball; the whip's lash takes the element's colour; the sword with Water is a hilt and a burst of steam; the hands get no model, only a green core with shells of the other colours; the bow with Lightning goes lightning-coloured, and with Water only drips. On the trident with Fire: "Not sure this version should be possible."

## Round 2: in the game (2026-11-22)

Built in the game on the thread's spec, as the first real use of the [VFX workflow](../vfx-workflow.md):

- **The material.** `art/infuse.ts` picks it: the first extra in the order Ice, Steam (Fire + Water), Fire, Water, Cold, Lightning. There are two exceptions from the notes: the wand's Cold + Ice is a snowball, and the bow's Water only drips. `art/live3d.ts` gives the element-bearing parts of the 3D prop a shader per material. Fire is molten and flickers; Water is deep blue with bands flowing through it; Cold is packed snow; Ice is pale and faceted; Lightning is violet and flares; Steam is neutral white and dithered so you see through it in places. A cool grey stepped to blue in the pixel pass and read as water, so Steam uses a neutral grey.
- **What goes with it.** `A.infused` replaces the bands of `A.along`, which is gone. Each leftover extra gives one small effect at the head, Arcane gives a five-pixel rune, and Steam and Water add wisps and drips. A weapon carries at most about six particles, where each extra used to add about nine. Blows show the material's one colour.
- **The special cases.** The maul's crystals are hidden, and removed from `wizprops.py` for the next export. The sword with Water hides its flame blade and draws a jet of steam. The whip's 2D lash takes the material's ramp. The hands draw nested glows, a shell per extra round the green core.
- **The lab.** The VFX Lab gained `then=` (a strike after the conjure), `focus=` (a zoom on the wizard), `scene=weapon`, and sheets that keep every row. The big catch: `vfx-sheet` ran Chrome on SwiftShader, where live 3D declines, so every sheet showed the 2D fallback weapons and not the game's props. It now runs on the GPU by default (`--gl gpu`).

What the sheets show: every maul and wand version reads at a glance at game scale, as one colour change on the head or orb, with no specks. The steam blade reads as steam. The hands are clear with one or two extras; with three, the dithered shells begin to mix. Open questions are in the thread. The page's round-2 section has every version as the game draws it (`tools/weapon-variants/ingame.mjs`).
