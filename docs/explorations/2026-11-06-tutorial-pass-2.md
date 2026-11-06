# The tutorial, pass 2 (2026-11-06)

The second pass on the tutorial prototype, after the user's review ("a good prototype"; decisions log, "Water on a fire leaves you dry; the tutorial prototype's review"). It builds the rest of the design (`2026-11-06-tutorial.md`, beats 10–19) and answers the review's four points. Built optimistically on Claude's calls; each is listed below and can be vetoed.

Play it at `#tutorial` (key 4); `#tutorial-N` starts at beat N.

## What the review asked for, and what changed

1. **A lore wrapper is the user's to write.** No story, characters or setting were added. Every word the player reads is in `game/packages/client/src/tutorial-text.ts`, one entry per beat: a **title** (the banner and the prompt box's head), one or two **prompt lines**, and an optional **done line** (the Shield beat uses it to say Shield + Weapon conjures a buckler). The shared lines (the calm, the stones, fainting, the HUD's "Step n of m", the arch's "Next", the end card) are under it. The view (`tutorial-view.ts`) draws only what that file gives it, so a wrapper replaces the strings and keeps the shape. The lines stay neutral placeholders: they name keys and say what to do. The wounded body in the Life beat is a training dummy, not a named apprentice, for the same reason.
2. **Lessons started too fast.** Every beat with enemies now has a **calm start**:
   - You arrive with nothing hostile in the chamber. Straw targets, brambles and the sleeping goblin stand ready, away from the entry.
   - The enemies' **gates** are visible from the start: dark stone rings at the chamber's walls, far from the entry (the nearest is 8.6 u away).
   - A gold **ready stone** sits two steps ahead of the entry. Stepping on it lets them in after a 1.5 s warning. If you don't, they come by themselves after 8 s.
   - In the last 3 s the gates warm up red and the prompt box counts down ("Coming in 3..."); as they arrive it says "Here they come."
   - They walk in from the gates. Nothing spawns round you or charges you on arrival. The hands test's goblins come from four gates and converge, so the Sweep lesson still ends with you surrounded, but only after you said you're ready.
   - Fainting everyone restarts the beat in its calm, so a retry also starts gently.
3. **An empty rune bar, not floating islands.** From the rune chapter (beat 7) the whole bar shows in its normal layout, all nine sockets. Locked elements are empty sockets sunk into the plate; a socket fills in, with a short flash in its colour, in the beat that gives it. Chapter 1 still has no bar (no runes yet). Outside the tutorial nothing is locked, so nothing changes there.
4. **The missing lessons.** The tutorial now has all nineteen beats: all nine elements, and every way to cast (Force, Area, Place, Self, Weapon), plus the hold variants (Heavy, charge, channels and beams, held Place) and drawing a wall by dragging.

Also: since water on a burning body now only puts it out (you come out dry), nothing in the Water beat assumes you end wet. Its check is "you were burning, then your own Water on yourself ended it".

## The beats now

Pools are max runes; each beat keeps the ones before it.

| # | Beat | Teaches | Pools | Done when |
|---|---|---|---|---|
| 1 | Walk | moving | none | three floor stones stepped on |
| 2 | Strike | RMB tap | none | three straw goblins down |
| 3 | Heavy | RMB hold | none | the sack in the ring, after a Heavy |
| 4 | Retreat | Shift+LMB | none | a soft brute walks in from a gate; two slams in a row miss |
| 5 | Defend | Space, block and parry | none (training buckler) | one parry of an archer's bolt; the archer walks in |
| 6 | Hands test | Shift+RMB Sweep | none | four soft goblins from four gates, down |
| 7 | Fire | Force | Fire 2 | the bramble hedge burned |
| 8 | Water | Self | + Water 1 | you caught fire crossing the floor and doused yourself |
| 9 | Steam | the first mix | Water 2 | three wet straw goblins in the rain, down |
| 10 | Cold | Area tap | + Cold 2 | each of five goblins (walking in) chilled once, or down |
| 11 | Opposites | cancelling | as 10 | one cancel |
| 12 | Lightning | Place (held Shift+RMB: Rain), wet + shock | + Lightning 2 | five straw goblins down |
| 13 | Freeze and shatter | Water + Cold freezes the wet; Earth shatters | + Earth 2 | two shatters (two straw goblins in a puddle) |
| 14 | The strongest leads | Earth + Fire is a fireball | as 13 | the bramble in the pit burned |
| 15 | Life | heals hit anyone | + Life 2 | the wounded dummy at full; healing the goblin asleep beside it wakes it |
| 16 | Shield | a wall (held Shift+RMB; drag to draw it) | + Shield 2 | three arrows stopped or turned by your walls; two archers walk in |
| 17 | Arcane | the long beam | + Arcane 2 | two soft archers down |
| 18 | Sigil | Weapon (Shift+LMB), devices | + Sigil 1 (all) | six goblins in two lanes, down, after conjuring something |
| 19 | The test | everything; preparing | all (Survive's start) | two announced waves cleared |
| 20 | End card | | all | walk into an arch: Sanctum, Survive or Arena |

Every beat keeps its "I know this" stone and the faint-not-die rule. A bot (`tutorial-bot.ts`) plays all of it through in the tests, alone and in co-op, in about six minutes of game time alone (366 s, a third of it the test); a first-timer will take longer, probably 10–12 minutes.

## What changed from the design, and why

- **Calm starts are new** (the review). The design had enemies placed at beat start: the brute 13 u away walking at you, the archer on a firing post, the hands test's goblins in a ring round you. Now they're arrivals in `tutorial-data.ts TUT_ARRIVALS` (archetype, gate, seconds after the release, softness).
- **The Defend beat lost its firing-post rock.** The archer walks in and shoots from its own range, as archers do.
- **The Retreat brute walks at 0.8x** (the design said 0.6x) because it now walks in from a gate. Its slam is the real one.
- **Cold (10) counts each goblin chilled once,** not "all five chilled at the same moment". They walk in from five gates at different distances, so they don't all reach you together, and a moment's simultaneity would be luck.
- **Freeze and shatter (13) uses straw goblins** (40 hp), not live goblins at half speed: live ones walk out of the puddle toward you, and then they're not wet. The puddle is laid again every half second, so freezing or burning it doesn't break the beat. Any Earth hit on a frozen body counts: a rock, or an Earthquake round you.
- **The Fireball beat (14) has a pit, not a rock line.** Rock in the game stops shots as well as bodies, so a rock line would stop the fireball too. The pit is a tutorial-only floor: wizards are held at its lip (5.5 u from the bramble on its pillar, past the flamethrower's 4.5 u), and shots fly over it. A Fire patch (Place) also reaches; see question 5.
- **The apprentice is a training dummy** on the players' side, wounded to 25%, which doesn't reset to full as dummies do (a `w.tut`-guarded skip in `effects.ts tickHealth`). The sleeper is a goblin at 1 hp held lying down with little z's over it until something heals it past half. The design's co-op version (every wizard hurt, heal each other) isn't built.
- **Shield (16) has no apprentice,** and counts arrows stopped or turned back by any wall a wizard made (a `w.tut`-guarded hook where a missile meets a wall). A pure Shield wall is a mirror barrier, so the arrows come back. The archers have 200 hp so the reflections don't end the beat before the lesson does.
- **The test (19) keeps the faint rule.** The design gave it the Arena's downed and wipe rules as a preview of real stakes. Here a faint is a faint, and if everyone faints, the current wave restarts with its countdown (not the whole test). See question 3.
- **The "I know this" stone closes once enemies are in.** It's for skipping a lesson, and it opens again in the next calm (a faint-out). Kiting round the chamber in the test, the bot stood on it by accident and skipped the beat mid-fight.
- **The end card** now says "That is the alphabet", as the design meant once the whole alphabet is taught.

## Costs

- The tutorial is now the biggest hard-coded lesson of the grammar in the game: 19 beats that name keys and casts. Every grammar change (a key, a cast, a mix) may need a line in `tutorial-text.ts` and maybe a beat in `tutorial.ts`. `npm test` plays it through, so a change that breaks a beat fails the tests.
- Two small hooks in shared code, both guarded by `w.tut`: the dummy reset skip and the arrow-on-wall count. The golden hash is unchanged (`afcc1d3f`).
- It's long. Nineteen beats is the design's ten minutes or more; the skip stones keep it to a minute for a veteran.

## Open questions

Unanswered means the recommendation stands.

1. **How the calm ends.** (a) the ready stone or 8 s, whichever is first (built); (b) only the stone; (c) only a timer. **Recommendation: (a).** The stone gives control to a player who's ready; the timer makes sure a player who never notices the stone isn't stuck.
2. **The skip stone during a fight.** Closed once enemies are in (built), or always open. **Recommendation: closed.** Skipping is for lessons you know; a fight you're losing restarts in its calm, where you can skip.
3. **The test's stakes.** (a) faint, and a full wipe restarts the wave (built); (b) the Arena's downed and wipe rules, as the design said. **Recommendation: (a) for now.** The review asked for a gentler tutorial; real stakes belong to Survive, one arch away. Revisit with the lore wrapper, if the test becomes a story moment.
4. **When the rune bar appears.** From the rune chapter (built), or empty from beat 1. **Recommendation: from beat 7.** Chapter 1 is about your hands; nine empty sockets there would be clutter and invite pressing keys that do nothing.
5. **The Fireball beat also accepts a Fire patch** (F, held Shift+RMB reaches the bramble from the lip). **Recommendation: accept it.** It's still the strongest element choosing a shape that isn't a spray, and the prompt names G + F. Making the pit wide enough to rule out Place would fill the chamber.
6. **The Life beat's stand-in.** A training dummy now; the design's apprentice is a character. **The user's call, with the lore.**
7. **Length.** Nineteen beats is long for a first visit. **Recommendation:** keep them, but let the lore decide the cut points. One option is to end the first visit after beat 9 (Steam) or 13 and offer the rest as Sanctum trials (design question 8).
8. **Still deferred from the design:** per-seat done bits for the personal beats (they count when anyone does them), the F2 panel's highlighted row, the "Tutorial: runes" and "the test" picker entries, landing first-time visitors in the tutorial, and the co-op version of the Life beat.
