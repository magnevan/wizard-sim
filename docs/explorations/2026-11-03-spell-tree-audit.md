# 2026-11-03: Spell tree audit (proposal A, by the numbers)

Claude ran the proposal A resolver (`tools/spell-tree/resolver.js`) over every distinct queue of up to 3 elements: 90 queues × 5 modes × seal on/off × 3 point targets. The aim was to find where the tree is deep and where it's shallow.

## Distinct results per mode (out of 90 queues)
| Mode | Distinct forms | Dominant result |
|---|---|---|
| Force | 10 | spray 19, rock 18, barrier 15, beam 13 |
| Point (ground) | 11 | geyser 18, bloom 16, ward 14, strike 12 |
| Weapon | 7 | **ground line 40** |
| Area | 5 | **elemental nova 51** |
| Self | 3 | **elemental ward 69** |
| Seal + any | 1–3 | the vessel, carrying the elements |

## Findings
1. **Self and Area are shallow.** They're the same as in Magicka: 69 of 90 self casts are "elemental ward", and 51 of 90 area casts are "nova". These are the natural homes for the **enchantments** the user asked for in round 1 (haste, glass cannon, heal over time, ethereal). Suggestion: Self + Lightning = haste, Self + Arcane + Fire = glass cannon, Self + Shield + Arcane = ethereal, and so on. Area versions apply the same enchant to allies around you, so Sustained Circle becomes the general rule.
2. **Weapon's ground line is a catch-all** (40 of 90). That's fine if lines feel distinct per element (fire line = burning trail, cold line = icy slide lane). Otherwise it's the next place to add forms.
3. **Point casts on an enemy have odd cases:**
   - **Shield on an enemy** gives a "placed ward", which would *protect* the enemy. Better: **Cage**, a bubble that traps the enemy (it can't move out, and its shots are blocked). That's a new control leaf.
   - **Earth+Arcane on an enemy** resolves as Yank because the Yank rule comes first, so you can't Geyser *under* a targeted enemy. Options: Yank only when Arcane is the *only* element, or Point targets the body only when the cursor is held on it briefly.
   - **Life on an enemy** heals it. That's consistent with Magicka's friendly fire, but worth confirming.
4. **The seal vessels ignore the elements** (by design), so Seal adds *timing and placement*, not new forms. Effigy and Contingency are the only element-driven exceptions. That keeps Seal easy to learn.
5. **Force is the richest mode**, as in Magicka, so the tree's "knowledge as skill" layer stays where Magicka players expect it.

## Suggested next tweaks (not applied)
- Add enchantments to Self and Area (finding 1).
- Add Cage for Shield on an enemy (finding 3).
- Narrow Yank to "Arcane alone on a body" (finding 3).
These are small resolver changes. Claude kept the default rules as they were and added them as an **opt-in rule set "A.1"** in the Spell Tree Explorer (toggle at the top), with one more rule: **Point on an ally casts your Self spell on them**. Mend, Ward toss and Haste-on-ally all fall out of that one rule. The skeleton still uses A.
