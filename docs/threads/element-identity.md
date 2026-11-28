# Element identities and the casting styles

Status: active · Last touched: 2026-11-28
Record: [element identities](../explorations/2026-11-28-element-identities.md) · the targets: [elements](../world/elements.md), [casting-styles](../ideas/casting-styles.md) · builds on the [spell pass](../explorations/2026-11-27-spell-pass.md) (on `worktree-spell-pass`, not built)

## Where it stands

Each element's identity in play is written down (five questions each), and Shield and Sigil are agreed as casting styles paid in Concentration and Bindings. Nothing is built. The 3D spell effects ([spell-effects-3d](spell-effects-3d.md)) are being redrawn at the same time, so changed spells should get their new look once, not twice.

## Next

- [ ] Round 2 on [Spell Ramifications](https://claude.ai/artifact/FMhzY77FbQuJJtgPxdkb9n): the follow-ups (charge model, wards, barriers, coated bite, preloading, the Arcane aura and dispel, pure weapon casts, world spells) and a mark on every shape that carries Arcane.
- [x] The user answers [Spell Ramifications](https://claude.ai/artifact/FMhzY77FbQuJJtgPxdkb9n) (record: [spell-ramifications](../explorations/2026-11-28-spell-ramifications.md)); fold the answers into the elements page, the idea and a decision.
- [x] Go through every existing spell (the Spell Atlas's cells, `tools/spell-atlas/`) and say how it changes under the identities and the casting styles: its cost (released, Concentration or a Binding), and any change of effect. The new ones first: Arcane's charge and release on Area, Arcane on yourself as opening yourself, Arcane's disruption by amounts, Shield weak against Arcane, Earth + Life structures.
- [ ] Open from the identities: the charged wall's numbers (cap, burst) and how its glow reads; the Prism reworked as the anti-magic guard (`game/packages/sim/src/guards.ts`).
- [ ] Numbers: how many Bindings, the cooldown, Concentration's size, regen and drain; the shared rune budget without Shield and Sigil.
- [ ] Settle with the spell pass: world spells bind runes today; glyph charges; Haste as a Binding.
- [ ] Build the changes, each with its 3D effect.
- [ ] Life's identity beyond healing (an open thread, no rush).

## How to work here

- Read [vision](../vision.md) and the [elements page](../world/elements.md) before proposing a change; flag a pillar conflict plainly.
- Effects are amounts, never switches (the user's point 2).
- Paper first: the user wants each spell's change worked out before anything is built.

## Done

- 2026-11-28 Every spell mapped: a cost table and sixteen changes to judge.
- 2026-11-28 The identities and the casting styles written up.
