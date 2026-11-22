# Merging the ring into the burst (2026-11-21)

From [issue #10](https://github.com/magnevan/wizard-sim/issues/10) and the user's note: "fire ring and fire burst are really similar but on different keys. But fire ring and fire patch is quite different, but on the same key." The idea is to make the ring a variant of the burst, picked by how far away you aim and shown while you hold the button. Shift+RMB would then be Place only. Decided 2026-11-22: see the answers near the end. This page maps which spells the change breaks and recommends a direction.

Pillars touched: 2 (a language, not a menu), 3 (the dance: a ring hits the partner behind you, a cone doesn't), 4 (explicit rhythm).

## Today's gestures (with runes queued)

From `game/packages/client/src/input.ts`, `sim/src/cast.ts` and the Atlas (`tools/spell-atlas/rules-c.js`):

| Gesture | Input | Pad |
|---|---|---|
| Force | RMB (hold to channel or charge) | RT |
| Area | Shift+RMB **tap** | LT tap |
| Place | Shift+RMB **hold** past `RHYTHM.placeHold` (0.18 s), drag to draw | LT hold |
| Self | Space | RB |
| Weapon | Shift+LMB | LB + RT |

So today Shift+RMB holds two gestures that are told apart by time, while Shift+LMB holds the burst, whose shape is the ring's cut to a cone. The user's point stands: Shift+RMB groups by button instead of by meaning.

## Why the merge is cheap where it fits

The ring and the burst already have the same power. The burst went to 1.5× the ring and came back to 1× because, the user said, its benefit is friendly-fire control rather than damage ([2026-11-09](../decisions/README.md#2026-11-09-the-burst-keeps-the-rings-power-colds-first-pass)). Both also grow 0.6 u a rune ([2026-11-11](../decisions/README.md#2026-11-11-the-burst-grows-like-the-nova-earths-is-a-line-lightnings-forks)). The only difference is the shape, which is exactly what aim distance would set.

## The collision map, form by form

The form is the lead element (Shield / Sigil > Life > Earth > Arcane > Ice > Lightning > sprays).

| Form | Area today | Weapon today | Fits near-ring to far-narrow? |
|---|---|---|---|
| Fire, Water, Cold, Ice, Steam | Fire / Splash / Frost / Ice ring, Steam burst | the same element as a cone (2.5 u + 0.6 a rune) | **Yes.** The shape is the only difference. |
| Arcane | Arcane nova | Arcane burst (ripples) | **Yes.** |
| Life | Healing ring | Healing palm; Healing tremor with Earth | **Yes.** |
| Earth | Earthquake (knock-down ring) | Stone burst, a line (4.5 u + 0.9 a rune) | **Yes, and it reads well:** a quake round you that narrows into a crack running out. |
| Lightning | Discharge (everything near) | Fork to the 3 nearest in front | **Yes.** The arc's width decides who the bolts can pick. |
| **Shield** | Ring of barriers / stone / ice / coated fields | **a guard** (conjured) | **No.** A guard isn't a shape. |
| **Sigil** | Rune motes / orbitals | **a weapon**, or the sculpting wand alone | **No.** Neither is a shape. |

Seven of the nine forms merge cleanly. Shield and Sigil collide, as the issue predicted. Nothing queued is unaffected: Shift+LMB stays Retreat and Shift+RMB stays the Special.

## Directions

1. **Conservative: keep both gestures, fix the grouping only.** Swap the keys so the ring sits beside the burst, for example Shift+LMB tap for the burst and Shift+LMB hold for the ring. This keeps two separate choices but adds a timed hold to the burst. It's the smallest change, and it spends the time axis that a preview hold would want.
2. **The user's idea: one "from me" gesture, aim distance picks the shape, hold to preview.** Shift+LMB, cursor close: a full ring. Further out, the arc narrows and the reach grows, down to a long narrow cone or, for Earth, the line. Holding the button draws the shape on the floor, and releasing casts it. A tap casts at once with the shape under the cursor. **Recommended**, with the two refinements below.
3. **Discrete bands instead of a continuum:** ring / fan / line, each with a fixed shape, snapping as the cursor crosses a radius. It reads better for a partner and is easier to balance, but you have less to master.
4. **Borrowed from Dota 2's vector targeting:** press where the cone starts, drag its direction, release. It's very expressive, but it's a two-point gesture for a spell that today is one press. The cost in fingers is too high for a quick defensive ring.
5. **Wild: hold time sets the shape.** A tap is a ring and a longer hold narrows it into a line, like charging. It's free of aim, but it puts a wind-up on the panic ring and reuses the charge feel that belongs to Force. Rejected against pillar 4: the ring would be slow when you need it most.

## Refinement 1: the ring is "aim at yourself"

The trap in direction 2 is melee. With goblins at 1 to 2 u, the cursor sits on them, close to you. A plain distance rule makes that a ring, which hits the partner behind you exactly when the cone's whole reason to exist (sparing allies, per the user) matters most.

So **the ring band should be tiny: the cursor on your own wizard, about 1 u.** Anywhere else is a cone pointing at the cursor, never shorter than today's 2.5 u, however close the cursor is. Further out narrows and lengthens it. Then "on me = all around me" is a deliberate gesture, not a side effect of an enemy standing close. It also gives the grammar a rule that refinement 2 reuses.

## Refinement 2: Shield and Sigil keep their hand slot; their rings move to Place-on-yourself

Shift+LMB keeps its current meaning: **"from my hand".** The elements burst out, while Shield or Sigil stay there as a guard or weapon (the Atlas already says "add Sigil for a conjured weapon, or Shield for a defensive one"). The two non-shapes then move:

- **Shield ring → Shield Place with the cursor on yourself.** Shield Place without a drag already raises an arc round you facing the cursor, so this is the same spectrum on the other key: cursor on you is the closed ring, away from you is the arc, and a drag draws the wall.
- **Orbitals and rune motes → Sigil Place on yourself.** They circle you, so "placed on me" fits them. Glyphs and the Lens still go at the cursor.
- An elemental Place on yourself simply lands under your feet (a Fire patch burns you). That's consistent and fits the friendly-fire pillar.

Rejected alternatives for the collision: conjuring on a long Shift+LMB hold (it fights the preview hold); moving guards and weapons to Self (Space already carries wards, auras and the Double); and "cursor exactly on your body conjures, slightly off rings" (the two zones would be millimetres apart).

## What it gains, besides the grouping

- **Place gets faster.** Shift+RMB no longer has to wait 0.18 s to rule out Area, so a tap places at once. The Healing spring's "hold longer to make it last" and drawn walls keep the hold and the drag.
- **The preview is a co-op read** if partners see it too: a ring forming under your feet tells them to step out (pillar 3).
- **The grammar gets shorter:** four gestures instead of five, and "where you aim" means the same thing on both Shift keys.

## What it costs

- **A new continuous axis** (aim distance sets the arc's width) on a spell that was one press. The preview is what pays for it, so the preview is part of the idea, not polish.
- **The ring is no longer instant** if you were aiming elsewhere: you flick the cursor onto yourself first. On a mouse that's small. On a pad it needs its own rule (below).
- **Gamepad:** the reticle never comes closer than 2.5 u (`gamepad.ts`), and the last aim is kept when the stick is centred. Suggested pad rule: casting the burst with the right stick centred is the ring. That only needs the burst to see a centred stick, instead of the kept aim.
- **Balance:** with power fixed (`imbuePower` 1), a narrow cone and a full ring deal the same per target, which keeps today's trade (coverage against reach and ally safety). Whether a long narrow cone should hit harder than a ring is a later tuning question for `npm run balance`.

## Knock-on work if adopted (*unverified until checked*)

The Atlas's `CASTS` row and help-panel rows (cell count 43 drops); the tutorial beats that teach Area and the Fire ring; the battery's prompts ("a half-ring from Area or the Weapon's burst"); Shield blink, which leaves "their Area spell" (it would leave the ring); the golden hash (the scripted run taps a Fire ring) and the bots; pad bindings (LT becomes Place only); the "rings are each element's strongest instant hit" rule (the Frost ring chills ×2, the Splash ring pushes ×2), which would apply to the ring end of the spectrum or to all of it.

## The user's answers (2026-11-22)

Every recommendation was accepted ([decision](../decisions/README.md#2026-11-22-the-ring-merges-into-the-burst-aim-at-yourself-for-the-ring-explorations2026-11-21-ring-burst-mergemd)); the work is tracked in [the thread](../threads/ring-burst-merge.md).
1. "Yes smoothly."
2. "On yourself, I'll give feedback if I feel the radius is too strict."
3. "Sounds good."
4. "I think only while you hold? If its with shift, we don't know if its going to be a left or right click."
- Gamepad: "we're not immediately building for a gamepad, but it's good to make a note of this." No interactive review page: "it's easy to playtest in any of the existing scenes."

## Questions for the user (as asked)

1. **Continuum or bands?** Claude recommends a continuum with the ring as a snap (direction 2). Bands (direction 3) are easier to read.
2. **Ring band: cursor on yourself (about 1 u), or a wider "near" radius?** Claude recommends on yourself, for the melee reason above.
3. **Shield's ring and Sigil's orbitals move to Place-on-yourself?** Claude recommends it. It also gives Place the same aim rule.
4. **Hold = preview, release = cast, tap = cast at once?** Or should the preview show whenever Shift is held, so a tap is already informed?
