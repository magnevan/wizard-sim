# Segment 1, the opening: brief and beat list

**Stages 1 and 2, second pass (2026-11-09).** Built on the user's own outline of three parts (the briefing, the fighting tutorial, the first job). The user's outline is marked below; everything else is Claude's proposal. The user wants to try a few versions, so nothing here is settled. Minutes are guesses until a blockout is played. Background: `../../explorations/2026-11-09-opening-and-innate-casting.md`.

## The brief

1. **In and out.** You arrive with nothing. You leave with your hands, an etched focus, the core elements at pool 1 and low regen, and the meditation dream.
2. **The one new thing.** The pool you've been drawing on goes dark, and one rune lights up that's yours.
3. **The story's one job.** The infrastructure is failing, and the same shift is why you can now cast.
4. **Length.** About 30 minutes, your own first cast at about 10. Melee isn't fun enough alone to stay in it long, so the no-magic stretch is short, and the tutorial segment lasts until the base set of runes is unlocked (the user). Cut first: beat 3.
5. **One or four.** One defence per seat, close enough to share a screen. The infusion hits everyone at the same moment.
6. **Returning players.** A skip at the start goes straight to beat 10 with the same unlocks. The compact tutorial stays as the quick start.
7. **Pillars.** Leans on 2 (nobody can tell you what a mix does) and 5. Pillar 6 allows the defence, because its input is your spells.
8. **Smallest test.** Beats 4 to 7 alone: drive a defence, it runs dry, the same keys work from your hands. Does the moment land?

## Beats 8 to 12, on hold

**Beats 1 to 7 are kept in the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page (`tools/segments/01-opening/segment.js`).** The rows below wait until that part works (the user, 2026-11-10: "There's a lot to build and refine up to the battery"). Written while the vein was thought to have moved; the user's note since is that the battery's well "got destabilized and just needed repairs".

| # | Where | What you do | Teaches | Magic | Pressure | Min | Source |
|---|---|---|---|---|---|---|---|
| 8 | Nearby | A shorter second element, with a problem Fire makes worse, then the two together | Elements meet | Fire, Water | Medium | 2 | Proposal |
| 9 | Same job | The surge: the other core elements arrive at once. The "you can just press anything" moment | Width | Core set at pool 1 | Peak | 1 | Proposal |
| 10 | Aftermath | Quiet. Try things. Meditate for the first time | Your practice space | Core set | Rest | 3 | Proposal |
| 11 | The way through | Small practical problems, from the existing rune beats | The spell language | Core set | Medium | 8 | Proposal |
| 12 | Holding the site | A proper fight, then the report and the next posting | Consolidation | Core set | High, then rest | 5 | Proposal |

## Try more than one

- **First act of your own magic.** *Spell first (Claude's pick):* the keys you just practised come from your hands, you're empty at once, and the blade is the answer to being empty. *Blade first (the user's sketch):* a familiar weapon bridges melee to magic. Only playing it will tell.
- **How the other elements arrive.** *One, two, then the rest (Claude's pick):* the full ritual once, a short second, then a surge. *Repeat the breakdown:* the user's worry is that it gets repetitive. *Leaks:* each remaining element is a one- or two-minute problem at something leaking, which is gentler but slower to the full set.

## Needs from the game, for a blockout

Exists: the hands beats, the rune beats, unlocking elements beat by beat (`tutorial.ts`, through `runeMax`), turrets that cast real spells, LDtk rooms.

New:
- **Controlling a defence:** the seat's casts come from the device, the camera follows it, the rune bar shows the device's pool, and a key steps away. Your body stands where you left it.
- **The etched rule:** Sigil only with Conjure, the other gestures locked (`r4-1-sigil`). Designed, not built.
- A **draining pool** on the defence.
- **Early regen and pools.** The regen budget is shared among unlocked pools, so with only Fire unlocked the whole budget goes to Fire. The early numbers need tuning per step.
- The meditation dream. Beat 10 can start as a plain room.
