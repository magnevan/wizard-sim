# Orbitals, then Fire the Sigil way

Picks up from `2026-11-06-sigil-sound.md`. The user chose to fill Sigil's orbitals and then redo Fire with what Sigil taught: a sound per spell, three takes, an intro plus a quiet loop for anything that lasts. They approved every description below before any credits were spent.

On publishing, the user said not to worry: the game is "still not commercial use". The generated clips are still local for now, as nothing has been chosen yet.

## Orbitals (`tools/sfx/sigil-12.json`, nine clips)

Three parts, three takes each: the **raise** on the cast, a **hum** while the orbs circle, and a **strike** as one flies in (the element's own hit plays after it).

- **What came back:** the raises are almost pure shimmer, 99 % above 3 kHz, with none of the asked-for low hum. They go to the Lab as they are, for the user to judge. The strikes sit in the mids, like the turret's summon. The hums swung about 20 dB within 4 s, which is the pulsing the user disliked in Haste. They're evened out with Haste's stronger filter (now under 2 dB) and set as quiet as Regeneration's loop.
- **In the game:** an orb's strike was a Lightning zap. The sim now tags it (`text: 'orbital'` on the zap event; events aren't in the state hash, and the golden hash is unchanged). The director plays Sigil's `strike:orbitals` for it, and `hold:orbitals` once per caster while any orbs circle.
- **A sim quirk found on the way:** when one orb strikes, the ring re-spaces the rest, and the next orb jumps into the spent one's slot. If that slot is in reach, it strikes a tick or two later. So a lap's orbs land almost together, and the view's easing hides the jump. Strikes got a sound group with a short gap, so the second one isn't swallowed. Whether orbs should keep their spacing until the next lap is a gameplay question for the user (test: `structures.test.ts`, "marked as one").
- **The Lab row** casts one Fire orb with your wizard 3.2 u south of a dummy. The ring starts due east, so the orb circles for 0.6 or 1.6 s before it can reach, and the hum can be heard on its own.

## Fire, round 1 (`tools/sfx/fire-1.json`, 24 clips)

**Measure first.** The reference's flamethrower loop is low: 65 % under 150 Hz, centred near 400 Hz, with a second layer that's almost all sub-bass, and no crackle. Every prompt asked for a deep roar or whoomp, and said what's on screen.

- **What came back:** the flamethrower loops are 37–54 % under 150 Hz and 45–63 % in the low mids, with no hiss. That's close to the reference, and nothing like the "crowd noises" from the recordings. Beam takes 1 and 2 are brighter (17–26 % above 3 kHz). The fireball's landings are almost all thud (97 % under 150 Hz), so the burst of flame may be missing. The ring is close to the reference's bloom.
- **Parts:** the flamethrower's catch, loop and cut-off; the ring's burst; the fireball's throw and landing; the beam's loop; the burning body's loop. A fireball's landing borrowed the ring's burst before. Now a thrown missile has its own (`land:missile`).
- **Takes beside the reference:** each kit layer is marked as ours (`set: 'takes'`) or the reference's (`set: 'ref'`). The Lab's Takes 1–3 play ours and its Reference button the reference's own layers. The dev game keeps playing the reference's until a take is chosen. Ours are matched in loudness to the reference layer they replace, so a take doesn't win by being louder.
- **What every take shares:** the dummy's hit and the fireball's flight are still the reference's. The On fire row's take also plays on burning dummies in the other rows.

## Up for review

- `?lab=sigil`: **Haste** (the evened-out thrum, from last night) and **Orbitals** (three takes).
- `?lab=fire`: **Flamethrower, Fire ring, Fireball, Fire beam, On fire**, three takes each plus the Reference.

Credits: about 3,460 of 10,000 used.

## The user's review, 2026-11-11

- **Orbitals: all three takes wrong** ("too tinny", "like screaming", "nails on a chalkboard"). And circling should be silent, or near it: orbs can sit on you for a long time. The kit entries came out (clips kept); circling orbs are silent, and a strike plays only its element's hit, no longer a Lightning zap. Orbitals now have no sound of their own; their cast plays the generic area-cast sound.
- **Haste: close**, "slightly too loud, and the loop is too obvious". The 1.5 s loop is now 5 s (the thrum forwards, backwards and a touch lower), about 5 dB quieter. Up again as `haste-loop-r9`.
- **The Lab:** too many sounds at once to hear what changed between takes. Each row now opens with only its part on (`focus`), and a single-sound row says its note is the same for every take.
- The user asked whether a model could listen instead: see the next session's notes.

### The user's call on models, and a Lab that's easier to judge (2026-11-11)

The user prefers to stay the ear for now ("I have some doubts that the models will be able to do this specific task very well"), and asked for the Lab to be easier to judge instead:

- **Takes belong to a part of a spell, not the round.** A moment is now cut into the parts being judged (the flamethrower's catch, roar and cut-off; the fireball's throw and landing), each with its own take buttons and its own count. A part with one take shows none. Each take's note shows only while that take is picked, so a note is plainly about what's playing.
- **Play the whole spell, or just one part.** "Just the roar" plays only the sounds made from that part's kit entry; everything else is silent (the director's `hearPlan`, matched on the clips).
- **Rune sounds are off in the Lab** by default ("Also hear: Rune sounds"), as they blended into the spell.
- **Rune blops:** the user wants them "much more subtle, like a little blop". Three made here, no credits (`.reference/tools/rune-blops.py`): a rising bubble, a soft falling pop, and a short wooden knock. Each is set about 6 dB under today's tick, and each element plays it at its own pitch. Up in `?lab=sigil` as "Rune blops", with Today (the tick) to compare.
- **Rune blops, round 1: all three "close".** The "3 beats" the user heard were the row's three runes (Earth, Fire, Fire), one blop each. Round 2 queues one rune per play and cycles six elements, so each blop is heard alone at its element's pitch. The user wants "slightly different tones for different elements", and the pitches already do that; the question is whether pitch alone is enough.
- **Haste, r9: close**, "a little inconsistent, sound changes so much during the loop... Maybe just a vibrating kind of sound". Round 10 is three steady hums made here (`.reference/tools/haste-hums.py`), each built to repeat with no seam: an electric 120 Hz buzz, a deeper 75 Hz flutter, and the reference thrum's own colour frozen in place under a 24 Hz vibration. Last time (r9) stays beside them to compare.
- **Flamethrower, round 1:** catch 2, roar 2 and 3, and cut-off 3 marked right (catch 3 and cut-offs 1 and 2 wrong, roar 1 close). Overall close: "the individual parts sound pretty good, but when played all together it's very noticeable that it's 3 sounds". Measured: the catch played on top of a roar already at full and then stopped dead, and the cut-off came in at full, 1–3 dB over the roar and brighter (around 2.1 kHz against 1.3–1.5 kHz). Round 2 joins them: the catch fades over its last 0.3 s while the roar swells in under it (0.1 s late, 0.3 s attack), and the cut-off fades in over 0.1 s as the roar fades out over 0.3 s. Both are toned down 4 dB above 2 kHz, and the cut-off is set 1–2 dB under the roar. The two roars are levelled with each other.
- **Settled, 2026-11-11:** the rune blop is take 1, "the cute blop feels like it hits the spirit of the game"; blop 2 is kept in case the user changes their mind. Haste's hum is hum 3, the reference thrum's colour held steady, "the one that fits with the initial spell cast"; hum 1 was close but didn't fit the cast, and hum 2 was wrong. Both are in the dev game's kit and out of the Lab.
- **Flamethrower, settled (round 2):** the catch and roar 1 were right (roar 2 close). The cut-off "plays for too long. I'm not sure we even need a cut-off sound. Maybe just turning down the roar over like .5 seconds". So there's no cut-off, and the roar dies away over 0.5 s. That needed an engine fix: a stopped loop always faded in 0.09 s, whatever its layers' release said. It now fades over its longest looping layer's release, capped at 1 s, so the auras' 0.8 s releases now apply too. The beam's start uses the same catch, since beams borrow the flamethrower's start.
- **In the public game (the user, 2026-11-11):** the rune blop and Haste's hum are in the bank (`content/audio/sources/made/`) with a public Sigil kit (`SIGIL_KIT` in `kits.ts`). The hum is derived from a reference recording. The user chose to ship it as is ("it's barely public") and plans to replace the whole Haste sound later; the bank README marks it temporary.
- **The rest of Fire, round 1 (2026-11-12):**
  - **Beam: take 3, settled.** "beautiful. I can feel the intense beam of fire." Take 1 was too high-pitched, take 2 close.
  - **Landing: take 3, settled.**
  - **Throw:** take 3 was the favourite, but "the audio sounds a little cut off, like it ends abruptly". The clip is 0.6 s and stops at -21 dB. Round 2 gives it a tail, two ways: an echoing trail, or the flame trailing off into a fading slice of the roar. Take 2 was close but too short; take 1 wrong ("sound feels a little off").
  - **Charge-up:** the reference's "feels a little off", and it wasn't in the Lab. Round 2 adds three of ours, made from loops already generated, each rising in pitch as it charges: the flamethrower's roar, the beam's, and a jet loop muffled as if building inside the hand.
  - **On fire: the reference was right.** Ours were too intense; take 2 had "an odd effect right at the start", and take 3 sounded like a glitching microphone. The dev game keeps the reference. Round 2 tries take 2 again from 1 s in, evened out, darker and 3 dB down. The public game needs one of ours eventually.
  - **Fire ring:** not reviewed yet.
- **Fireball, settled (round 2):** charge-up 1, the flamethrower's roar rising ("very good"), with a quicker attack (0.03 s) and a higher start, as "it takes a little bit of time to start playing". Throw: take 3 with the echoing trail ("just a nice smooth sound"). The user also asked: "on fast clicks, can we still play a fraction of the charge up?" Now a charge let go within 0.3 s still sounds for 0.3 s (`CHARGE_MIN_S` in `director.ts`, played as the loop's tail).
- **On fire, round 2:** close, but "I still hear the start segment". The loop rose from -17 to -11 dB over its 2.5 s, so its seam faded the loud end into the quiet start: a swell dying away each time it began. Round 3 uses the steadiest 2.5 s of the clip, evened out hard before folding (within 2 dB now).
- **Fire ring: take 3, settled** ("it just sounds like a fire wave. feels right"), marked on 2026-11-11 and missed until the 12th.
- **On fire, round 3:** "I still hear this distinct sound twice every time I press once". There was no stand-out moment in the loop. But the loop was 2 s long, and one play is about 2.8 s, so it came round again and anything recognisable near its start was heard twice. Round 4 uses nearly the whole clip (3 s after folding, evened), and starts at a random point each time (`KitLayer.scatter`, a new engine option). The whole spell also has the burn's damage ticking every half second, which may be the sound heard.
- **Fire ring and the hunt for On fire's "distinct sound" (2026-11-12):**
  - The sound came "around 3 seconds" in, not at the same time each play, and sometimes only once. A probe showed two Lab problems. A play left your wizard burning or wet for the next one, so a Fire self cast sometimes only dried you, or carried on a fire already going. And the Lab restarted every loop on each play, even when nothing had changed, which is heard as a new start.
  - Now each play starts and ends with your wizard put out, and loops restart only when a take or the solo part changes.
  - The browser measurements were misleading: the driven tab ran the game at about a tenth of real speed.
  - Measuring the clip found no clear culprit. Bright crackles were 0.1 % of its energy. There was a mid-band burst (1–2.5 kHz, +7 dB) on the loop's seam, but versions without it count about as many stand-out moments.
  - Round 6 offers a calmer stretch of the recording (take 1) and the same with its pops flattened (take 2). The random start is off, so the sound lands at the same moment each play and the user can say when.
  - If neither works, a new batch of burning loops is the next step. That needs credits and the user's approval of a description.
- **On fire, round 7:** the user looked at the loop in a spectrogram and saw "a spike maybe 0.5-1s in". Measured 10 ms at a time, there were bright snaps 12–16 dB over the rest in 1–8 kHz, at 0.29, 0.35, 1.40 and 2.19 s. Flattening (round 6, take 2) had made them stand out more. `.reference/tools/desnap.py` turns down only what's above 1 kHz, wherever a 10 ms window is over 3 dB above that band's usual level. It's run on the source and again on the finished loop, since evening and folding bring some back. The biggest is now +8 dB, from +18. Take 1 is that; take 2 is round 6's take 1 untouched, to compare.
  The user then placed it "probably at like 0.3s ish", where the two strongest snaps were (0.29 and 0.35 s). Take 1's high band is cut a further 10 dB over 0.24–0.40 s, which is now +5 dB at most there. The brightest moment left is +7 dB at 1.85 s.
- **On fire, round 8: new clips.** Round 7 was "more muted, but you know what, lets just generate some new fire sounds, because its getting ridiculous". Three prompts were offered. The user approved A and B and dropped C ("will give weird results"):
  - A: "A torch burning in still air close by: a low, soft, continuous whoosh of fire with a gentle, even flutter."
  - B: "A steady gas flame burning low: a deep, smooth, breathy roar at a quiet level, even from start to end."

  Three of each, 4 s loops (`tools/sfx/fire-2.json`, about 240 credits). Measured against the reference (80 % under 150 Hz, its loudest 10 ms 6 dB over its usual level):
  - B1: the steadiest (1.9 dB swing in 250 ms, bright snaps at most +4.5 dB).
  - B2: the closest to the reference (62 % under 150 Hz, snaps +3.4 dB).
  - A3: the best of A.
  - A2: swung 17 dB, so it's left out.

  The three go to the Lab whole and unedited, as loud as the reference.
- **On fire, settled:** round 8's take 2 (B2), "much better. take 2 is good just a bit louder than it needs to be". It's set 4 dB under the reference's level, and starts at a random point again.
- **Fire, where it stands:** settled are the flamethrower (catch and roar, no cut-off), the beam, the ring, the fireball (charge-up, throw, landing) and On fire. Still the reference's in the dev game: a Fire hit on a body (`land`), Fire cast on yourself (`self`), the fire wall (`wall`), placed fire (`place`), the burning floor (`ground`) and Fire's force cast (`force`). A missile's flight is silent. The public game still has none of Fire's new sounds; they go in once the user says Fire is ready.
- **Fire, round 9 (the last parts, approved 2026-11-12, `tools/sfx/fire-3.json`, 12 clips, about 160 credits):**
  - Prompts:
    - Hit: "A small fireball bursting against a body: a short, soft whump of flame with a quick low puff."
    - Burst from the hand: "A short cone of flame thrust from an open hand: a quick, deep whoosh of fire that bursts forward and fades."
    - Placed fire: "Fire erupting from the ground a few steps away: a deep thump, then a rolling surge of flame that settles."
    - Wall: "A wall of fire rising from the ground in a line: a low rushing sweep of flame building up, then fading."
  - The burning floor reuses round 8's unpicked loops (free).
  - The user, mid-round: "if we don't like the fireball on a body sound, or the fire on floor sound we can just use the existing fireball splash and fire sounds". So take 4 of the hit is the fireball's landing, and take 4 of the floor is On fire's loop.
  - What came back:
    - The hits are soft whumps, half low and half low-mid.
    - The eruptions are almost all sub-bass (a thump, no surge), as the fireball landings were.
    - Burst 1 peaks half a second in.
    - Walls 2 and 3 stopped at -16 and -20 dB, so they got a 0.25 s fade.
  - In the Lab: Fire hit, Fire burst, Fire patch (eruption and floor) and Fire wall. Fire cast on yourself will play whichever hit is chosen, as the reference does.
  - A Fire hit's sound also plays on every burn tick (every half second on a burning body, quieter). That was the repeating "hit" in the On fire row's whole spell.
- **Lab:** "the repeated blasts when the dummy is burning makes it a bit hard to isolate the fire hit". The Fire hit row now puts the dummies out as soon as they catch (`Moment.douse`), so only the hit plays.
- **Open question:** in the game, each burn tick plays the element's hit, at 0.42 of its level, every half second on every burning body, over the burning loop. Should a burn tick be quieter, a small crackle, or silent?
- **Round 9 settled (2026-11-12):**
  - Picks:
    - Hit: take 3, "sounds like fire hitting something soft". Fire cast on yourself plays it too.
    - Burst: take 1.
    - Burning floor: On fire's loop, "seems reasonable, just a regular fire sound". The others were "gas burning", "gas torch" and "thunderstorm", and the reference was "rain, bubbling?".
    - Eruption: take 1 for now, "sounds like a small fire starting, closest of the 3". Take 2 was "a very tiny soft thud", take 3 a "rattlesnake?", the reference a "shotgun".
  - **Fire's wall was never heard.** A fire-coated wall is a Shield spell, its look is Shield, so it plays Shield's kit. The wall takes were wasted (12 calls, about 48 credits). Fire's wall entry is gone, and the coated wall's sound goes with Shield's. Lesson: check which kit a spell plays before generating for it.
  - **Burn ticks are silent** (the user, choosing silence: "itll be too many pops, not needed"). The sim marks them `dot: 1` on the hit event (events aren't in the state hash; the golden hash is unchanged), and the director skips them. The burning loop says it's burning.
  - **Fire is complete in the dev game:** every part is ours, none the reference's. A missile's flight stays silent. Next: put Fire into the public game, all at once, after checking with the user.
