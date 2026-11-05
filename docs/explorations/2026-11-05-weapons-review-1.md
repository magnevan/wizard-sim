# 2026-11-05: Weapons review, round 1

The user rated the Weapon Moveset Review (`tools/weapon-moves/`, https://claude.ai/artifact/F3FyhonePFv5JVeSLfk1U9) against the proposal in `2026-11-04-weapons-and-movesets.md`. Overall note: "Good first pass." The guards and both-hands cards weren't rated; the notes on them came as answers.

## What the ratings say

| Move | Verdict across weapons |
|---|---|
| Strike | **keep** on every weapon rated |
| Heavy | keep (water, lightning); **redesign** fire, earth, cold and life (below) |
| Sweep | **keep** (water, life, lightning, fire, earth); cut on the spear |
| Thrust | **cut** everywhere |
| Send | **cut**, except the spear's javelin (keep, "should maybe be the shift+rmb move") |
| Defend | **cut** everywhere: defending is the guard's job |

The user on the grammar, in the `q-grammar` answer: "the attack set might be a little too broad, there's a lot of really close gestures, and each one should have a unique reason to exist... lmb is how we move, so shift+lmb means we are stopping. I'm also thinking maybe a move should be for retreating... My instinct is to make rmb the default swing, shift+lmb can be a retreating move. We can remove shift+rmb probably. Maybe shields define the defend and retreat move (and some passive effect), while weapons do all the heavy moves."

## The revised grammar (v2)

With an empty queue:

| Gesture | Who defines it | Move |
|---|---|---|
| RMB tap | the weapon | **Strike**, the default swing. Three in rhythm make a combo. |
| RMB hold | the weapon | **Heavy**: charge, then release |
| Shift+RMB | the weapon | **Special**: the one move that sets this weapon apart (a Sweep for most, the javelin throw for the spear) |
| Shift+LMB | the guard | **Retreat**: a quick move backwards, away from where you face |
| Space | the guard | **Defend**: hold to block, tap to parry |

- *Why Shift+RMB stays, as one slot:* the user suggested removing it, but kept Sweep on five weapons and wanted the javelin on Shift+RMB. So it remains a single weapon-defined slot rather than a shared Sweep or Send. If play shows it's one gesture too many, the Special folds into Heavy.
- *Why Retreat sits on Shift+LMB:* you walk by holding LMB toward the cursor, so you always face the enemy and can't back off while fighting. Shift+LMB already stops you walking, so it reads as "step back". The guard flavours it: a shield shove back, a roll, a blink-step.
- *Pillar check:* one gesture per job, and the weapon and the guard each own their own gestures. This answers the "close gestures" worry and keeps the readability pillar.

## Decisions

- **No two-handed weapons** (the user: "Maybe we just don't do two handed for simplicity"). Every weapon pairs with every guard. Conjuring a weapon replaces only your weapon, and conjuring a guard replaces only your guard.
- **Weapons run on uses:** about 30, with no rune cost per move.
- **Eight guards, one per lead element, defined by more than a block** (the user: "we should find the set of things that guards do... some of the moves could be defined by the buckler, and they could have some passive effect as well, and various degrees/types of damage resistance"). A guard defines:
  - its Defend and its Retreat;
  - a passive effect;
  - its resistances.

## Weapon notes to act on

- **Water:** "Design looks weird, it reads like a pickaxe. Trident is the classic water weapon." Redraw it as a trident. Strike, Heavy and Sweep are liked.
- **Cold (spear):** Heavy "dash should be much further". The javelin moves to Shift+RMB.
- **Earth (maul):** Heavy "should be more of a directed earthquake/wave".
- **Fire (sword):** Heavy (overhead fire line) cut: "I'd prefer a wave of some sort."
- **Life (hands):** Heavy "maybe just a continuous channel, no 'release'. It can keep the link even if they move away."
- **Arcane (hook):** "might need a redesign. It's defined around some moves we're cutting. This one could potentially be more of something that enhances your spellcasting somehow."
- **Lightning (whip)** and **the staff:** keep as they are.

## Next

1. **Guards round:** design each guard's Defend, Retreat, passive and resistances, and the arcane redesign. Show them, with the weapon redesigns (trident, the new Heavies), as round 2 of the review page.
2. **In the game:** the v2 grammar on the conjured weapons:
   - RMB tap Strike, RMB hold Heavy, Shift+RMB Special;
   - Space Defend and Shift+LMB Retreat on the guard;
   - weapon and guard held together;
   - a uses bar on the HUD.

   This also fixes the bugs from the first exploration (a guard deleting your weapon, the swing looking like the staff's, guards ignoring their elements).
