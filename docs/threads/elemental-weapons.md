# Elemental weapons: infusions you can read

Status: active · Last touched: 2026-11-22 (round 2 waiting for the user's marks)
Record: [elemental weapons](../explorations/2026-11-21-elemental-weapons.md) (the 57 variants, the concepts, the user's marks) · Issue [#4](https://github.com/magnevan/wizard-sim/issues/4) · Review page: Elemental Arms (`tools/weapon-variants/`, marks in its db) · First real use of the [VFX workflow](../vfx-workflow.md)

## Where it stands

The user marked the Elemental Arms page (2026-11-21). The rule they gave: **the leading element sets the shape, the extras set the element**, as in spells. Most solid-motif concepts were marked no; what they asked for instead is a change of material on the part that carries the element (the maul's head, the wand's orb), plus at most one small effect. **Round 2 (2026-11-22) builds that in the game** ([decision](../decisions/README.md#2026-11-22-a-weapons-extras-change-its-material-explorations2026-11-21-elemental-weaponsmd)) and is on the Elemental Arms page for the user's marks (`v-r2-<weapon>`).

## The spec (round 1)

| Field | |
|---|---|
| **Job** | At a glance, which weapon you hold (the lead) and what it's infused with (the extras). |
| **Silhouette** | The lead's prop, unchanged. Extras never add shapes beside it. |
| **Leading element** | The lead gives the shape. The first extra in the material order turns the element-bearing part into that material. Each other extra adds one small effect. |
| **Material order** | Ice > steam (Fire + Water together) > Fire > Water > Cold > Lightning. Arcane is never a material: it's a glowing rune. |
| **Effects** (the extras that don't set the material) | Lightning: a short crackle now and then. Water: a drip. Cold: a snow puff falling. Fire: a few embers rising. Arcane: the rune. Ice: a glint. One colour each, a few a second, never a band of particles along the blade. |
| **Movement** | Effects fall or rise in the world and don't swing round with the weapon. The material pattern sticks to the prop. |
| **Colour** | The element's own ramp (`art/px.ts`). Nothing else changes colour. |
| **Runes** | More of an extra makes its material or effect stronger, not busier. |
| **Budget** | At most about 6 live particles per weapon, against about 9 per extra before. |
| **Not** | A cloud of mixed specks round the hand (the issue). Solid motifs bolted on (the concepts the user marked no). |

## What to fix, per weapon and element

The user's marks, turned into one list. "Material" is the element-bearing part's new look; "effect" is the one small extra.

- **Stone maul (Earth), 14 versions.** The element-bearing part is the head (boulder and lump).
  - Pure: drop the violet crystals, so the shaft and head read apart. (A maybe.)
  - Arcane: one clear glowing rune on the stone. (A keep.)
  - Fire: the whole head fiery. Water: a head of flowing water. Cold: a snowy head. Ice: an ice crystal head.
  - Pairs: Fire + Water is a head of flowing steam. Cold + Ice is an ice head, with snow puffs falling off it. Ice + Water is an ice head that drips.
  - Arcane + any of these: that version, with the rune.
- **Arcane wand (Arcane), 12 versions.** The element-bearing part is the orb.
  - Pure: keep.
  - The orb becomes the element: Fire is a fireball, Water a ball of water, Cold all blue, Ice icy, Lightning a ball of lightning.
  - Pairs: Cold + Ice is a snowball (an exception to the order, from the user's note). Fire + Lightning is a fireball with crackle. Fire + Water is a ball of sizzling steam. Ice + Lightning is a white-blue orb with crackle. Ice + Water is the icy orb, dripping. Cold + Lightning is a snowball with crackle.
- **Lightning whip (Lightning), 3 versions.** The lash is drawn by code, not a fixed blade. Fire makes the lash flame-coloured, with a few embers. Cold makes it icy, with frost puffs falling off.
- **Flame sword (Fire), 2 versions.** Pure: keep. Water: only the hilt stays; the blade is a burst of steam escaping (2D).
- **Ice bow (Ice), 5 versions.** Pure, Cold, and Cold + Lightning: keep. Lightning: lightning is the dominant colour of the limbs. Water: just some dripping.
- **Healing hands (Life), 18 versions.** No model. Glowing hands with a core in the heal colour and a shell for each other element.
- **Tide trident (Water), 2 versions.** Pure: keep. Fire: it stays (the user, 2026-11-22: "I like having more spell options possible. So maybe they can both exist"). So Water + Fire is the trident with steam prongs and Fire, Fire + Water the steam sword.
- **Frost spear (Cold), 1 version.** Pure: keep. It can't be infused. The user calls that "a small problem", with no clear solution yet (parked below).

## Next

- [ ] The user marks round 2 on Elemental Arms (one mark per weapon, all its versions in one sheet).
- [ ] Effects that fall or rise (drips, snow, embers) move with the weapon over their short life. Pin them to the world where they spawned if it shows in play.
- [ ] Knobs for the infusion looks (the shader modes' colours, effect rates), per the VFX workflow, once the user's notes say which ones need tuning.
- [ ] Remove the 2D fallback weapons ([#18](https://github.com/magnevan/wizard-sim/issues/18)); the user doesn't want the old drawing kept as bloat.

Parked: the Frost spear can never be infused. The user: "a small problem, but I don't have a clear solution."

Settled 2026-11-22: the trident with Fire stays, next to the steam sword. The hands blurring a little with three extras is fine (the user: "probably fine that it blurs a bit in this case").
- [ ] Rebuild the maul without crystals in `tools/sprites-3d/wizprops.py` on the next export. Until then the game hides them.

## How to work here

- Follow [vfx-workflow.md](../vfx-workflow.md). Use the lab on weapons: `vfx-lab.html?spells=sigil,earth,fire/weapon;sigil,arcane,fire/weapon&scene=weapon&focus=1&then=strike`.
- Judge every variant at game scale as well as zoomed in. The user's worry: "unsure if it will show up on the pixelated model".

## Done

- 2026-11-21 The 57 variants and Codex concepts, the Elemental Arms page
- 2026-11-22 The user's marks read into the fix list and the spec above
- 2026-11-22 Round 2 in the game: `art/infuse.ts`, the infusion shaders in `art/live3d.ts`, `A.infused` and `A.shells` in `art/accent.ts` (`A.along` removed), the steam blade, the recoloured lash, blows in one colour, no maul crystals. In the lab: `then=`, `focus=`, `scene=weapon`, sheets that keep every row, and `vfx-sheet --gl gpu` (the sheets had been showing the 2D fallback). `tools/weapon-variants/ingame.mjs` renders the page's sheets.
