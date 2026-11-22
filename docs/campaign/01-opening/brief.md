# Segment 1, the opening: brief and route

**Stages 1 and 2, third pass (2026-11-21).** The 2026-11-09 brief (in git history) planned one element, then a surge of the rest. On 2026-11-16 the user chose a different shape: a chain of stops, each with a machine you fix, whose element spills into you as it comes back. Life comes first. The route, the fixes and the fights come from [the element order](../../explorations/2026-11-16-element-order.md) (round 2) and [the opening's encounters](../../explorations/2026-11-16-opening-encounters.md), shown on [The Morning Everything Breaks](https://claude.ai/artifact/9DwUCZHa8ibckf2vWiFews). Beats 1 to 7 (the briefing, the yard, the battery) are kept on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page. Anything not marked as the user's is a proposal. Minutes are guesses until a blockout is played.

## The brief

1. **In and out.** You arrive with nothing. You leave with your hands, an etched focus, and the base set of runes (Life, Fire, Shield, Water, Cold, Lightning, Earth, Arcane) at pool 1 with low regen.
2. **The one new thing.** You fix a machine that draws on a field, and its field spills into you. Then you do it again, each time with a different element (the user).
3. **The story's one job.** The academy's Arcane well is stuttering, so every machine that draws on the fields above it is breaking, and the same shift is why you can now cast. Why it's stuttering stays open (canon).
4. **Length.** About 65 minutes with the walking, against the first brief's 30. The tutorial segment lasts until the base set is unlocked (canon). Cut first: the cliff road folds into the harbor's climb, or the infirmary and the battery share a fight.
5. **One or four.** Everyone gets an element at the same moment. Each stop's fight splits into co-op roles (in the encounters exploration).
6. **Returning players.** A skip at the start gives the base set. The compact tutorial stays as the quick start.
7. **Pillars.** Leans on 2 (nobody can tell you what a mix does), 3 (support from your first cast), 5 (told through places) and 7 (each fight is the new element's question). Pillar 6 allows the defence, because its input is your spells.
8. **Smallest test.** The infirmary alone: cut the vines, the well relights faintly, Life arrives, heal the cots. Does "fix it and it spills into you" land?

## The route

| # | Stop | Element | The fix | The fight | Min | State |
|---|---|---|---|---|---|---|
| 0 | The courtyard and the drill yard (beats 1 to 3) | none; the focus gives Sigil with Conjure | | none, the hands test | 10 | yard built (`#yard`); briefing not built |
| 1 | The infirmary, outside the main gate | **Life, your first cast** (the user) | cut the vines off the conduits with your hands and blade; the thorns cut you, so you heal yourself (the user) | none: heal the wounded on cots at your own pace, combinations shown on screen | 5 | designed |
| 2 | The battery (beats 4 to 7) | Fire | drive the defence until its well runs dry | goblin raiders, archers, a brute | 8 | built (`#battery`), still written as your *first* cast |
| 3 | The ward line, behind the academy | Shield (third: the user) | burn something off the pylons (the user; what it is, open) | rift wolves, goblin archers' volleys, guards beside you | 8 | designed |
| 4 | The waterworks | Water | relight the boiler with Fire | gorse imps (the built fire imp), wolves; the cistern fills | 7 | designed |
| 5 | The harbor | Cold, then Lightning | the frost heart, then the coil | brine crabs, surf-soaked wolves; the friendly-fire lesson | 10 | designed |
| 6 | The cliff road | Earth | wash the buried anchor clear with Water | crag rams, archers | 5 | designed |
| 7 | The courtyard finale | Arcane | lock the armillary's rings | the warband and beasts, the rift aurochs | 10 | designed |

You pass back through the courtyard after the battery (the ward bell) and after the ward line (out to the gorge).

**Each fight is a question and its ingredients, not a script** (the user, 2026-11-21). It works for one player, co-op roles come on their own, and only playtesting settles it. **At most one new creature per stop**: four in all (wolf, crab, ram, aurochs), a playtest assumption from [the encounters, round 2](../../explorations/2026-11-16-opening-encounters.md#round-2-the-users-notes-2026-11-21).

**What changes at the battery.** With Life first, Fire is your second element and your first that hurts. You can heal in its fight. The infusion's text and the lesson's prompts (`client/src/battery-text.ts`) assume it's your first cast, so they need a second look.

**Settled since the first brief.** The first innate cast is Life at the infirmary, not Fire at the battery (`q-1-first`). The elements arrive one stop at a time, never as a surge (`q-2-structure`). The blade is taught in the drill yard (beat 3), so "blade first or spell first" no longer applies. The battery's well "got destabilized and just needed repairs" (`map-battery`); the vein doesn't move.

## Open

- **The encounter questions** on The Morning Everything Breaks (`r3-q-1-foes` to `r3-q-5-tone`): who attacks, which new behaviour comes first, whether the infirmary has a fight, the shard moth, the goblins' tone. Claude's picks stand until answered.
- **Stops the user wanted more on:** Earth ("I need more details"), and whether players can choose their own order at the Arcane map (`img-area-arcane`).
- **The water stop's logic:** the concept image had a natural waterfall, so the machine's job wasn't clear (`img-area-water`). Round 2 moved it to a dry cistern and a boiler.
- **The walks between stops** aren't designed. The user wants walks long enough that the world feels real (`general`, 2026-11-09), not tiny gaps between fights.
- **The weapons section at the start** (the drill yard, beats 2 and 3) needs mapping again. It teaches only the flame sword today, and the wizard now has seven weapons and guards.
- **The ward's fix:** what gets burned off the pylons.
- **The meditation dream** has no stop yet.

## Needs from the game, for the next blockouts

Exists: the hands beats, unlocking elements one at a time (`runeMax`), controlling a defence, a draining well, infusion, LDtk rooms, the goblin warband drawn live from 3D.

New:
- A **field machine** family, one per element, each with working, overflowing, starving and dead states. The battery's defence is the first of them.
- **Patients** for the infirmary: allies on cots who need healing.
- **The etched rule:** Sigil only with Conjure, the other gestures locked (`r4-1-sigil`). Designed, not built.
- **Early regen and pools.** The regen budget is shared among unlocked pools. Shared regen with Life first is fine (the user). The numbers need tuning per stop.
- Four new creatures: the rift wolf (a new look on the swarmer), the brine crab (on the shieldbearer), the crag ram (a new charger behaviour) and the rift aurochs (a scaled brute).
