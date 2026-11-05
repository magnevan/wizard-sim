---
status: prototyping
pillars: [2, 6]
related: [spell-wishlist.md, enchantments.md, ../explorations/2026-11-04-weapons-and-movesets.md, ../explorations/2026-11-05-weapons-review-1.md, ../explorations/2026-11-05-guards.md, ../explorations/2026-11-05-guards-round-2.md]
---

# Conjured weapons

## One-liner
Conjure a magical weapon that lasts for a while, enabling a melee playstyle.

## In the hands
Conjure a weapon, protect yourself (ward, rock armor), and mix swings with close-range spells. Magicka only had a single weapon attack plus weapon-cast imbues.

## Why it's interesting
A distinct, reproducible playstyle (pillar 6), and a natural pairing with a support player who shields the melee partner.

## Open questions
- Does the weapon's element or shape come from the elements used to conjure it?
  **Answered:** yes. Sigil + Weapon conjures; the lead element picks the weapon, and every other element is a payload on its hits ([decisions: Seal becomes an element](../decisions/README.md#2026-11-03-seal-becomes-an-element-steam-and-ice-dropped-see-explorations2026-11-03-structures-review-and-elementsmd); the strongest element leads, as in spells: [How elements mix in guards](../decisions/README.md#2026-11-05-how-elements-mix-in-guards-merged-with-the-users-identities)).
- Duration vs resource vs until dismissed?
  **Answered:** weapons run on uses (about 30), and you can dismiss them by double-tapping Sigil on yourself ([Weapons review, round 1](../decisions/README.md#2026-11-05-weapons-review-round-1-explorations2026-11-05-weapons-review-1md); [Play-test notes, round 1](../decisions/README.md#2026-11-04-play-test-notes-round-1-the-users-first-session-with-the-build)).

## 2026-11-03 update
Proposal C (`explorations/2026-11-03-full-tree.md`) makes this "hold Weapon to conjure": the form element picks the weapon (Bulwark, maul, blade, hook, whip, rod, glaives), and every other element is a payload on its hits. The weapon stays until it breaks or you conjure another. Loaded Blow (one spell on the next swing) was cut by the user in favour of this.
*(Later: the hook was removed and the glaive became the Tide trident; the Bulwark became a guard. See "Where it stands" below.)*

## Where it stands (2026-11-05)
Built in the game and rated through round 4 on the Weapon Moveset Review.
- **Grammar v2:** with nothing queued, RMB tap is Strike, RMB hold is Heavy, Shift+RMB is the Special, Space is your guard's Defend, Shift+LMB its Retreat ([Grammar v2 in the game](../decisions/README.md#2026-11-05-grammar-v2-in-the-game-wards-for-support)).
- **Weapons:** Tide trident, Healing hands (Healing link; Special Mend), Frost spear (javelin), Lightning whip, Arcane wand (bolts; Special Siphon), Flame sword, Stone maul, and the bare staff. No two-handed weapons. Carrying one costs 5 % walking speed ([Round-2 ratings built](../decisions/README.md#2026-11-05-round-2-ratings-built-new-retreats-and-passives-the-arcane-wand-mend-carrying-slows-you)).
- **Guards:** eight, one per lead element, with the Prism as Capacitor + Lance ([Round 4 ratings](../decisions/README.md#2026-11-05-round-4-ratings-the-lance-prism-is-adopted)). Mixing: the strongest element leads, extras bring passives and resistance, coats bite back, every rune scales ([Mixing ratings](../decisions/README.md#2026-11-05-mixing-ratings-every-rune-scales-the-prism-mixes-its-return)).
- **Still open:** a balance pass (Siphon in particular), and how the remaining weapons use their extras beyond payload. See `../current-state.md`.
