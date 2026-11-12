# TODO: the battery's first playtest (2026-11-10)

**Status: open.** The user walked the battery and drove a defence, and listed 14 issues. They suggested splitting them: "A lot of these issues are related to the geometry of objects rather than the scene itself, so maybe we should just organize these issues into a task and work on it separately from the more specific scenario issues."

Issue numbers are the user's. Causes marked *confirmed* were read in the code. Causes marked *likely* come from reading it and haven't been tested. Nothing here has been fixed.

## Track A: objects and rendering (separate session and worktree)

These apply to every prop or effect, not only the battery. They touch the content compiler, prop drawing and the wall kit.

**Status: built, awaiting the user's playtest** (#13, #11, #12, #6, #14, #10). The Academy's deep props turned out not to have the hole: up to 1 unit deep the two walls touch, and none of its props is deeper.

The battery exists only on the branch `worktree-opening-segments`, so start this work from that branch, not from main.

### Collision

- **#13 You can clip through turrets, and #11 you can walk through the well.** *Confirmed cause:* `footprintWalls` (`game/packages/content/src/compile.mjs`) turns a footprint deeper than 0.6 into two parallel walls, one along each long side. That's solid for a shallow bench. A 5 x 5 tower or well gets two walls 4.5 apart with open ends, so you walk in from the side. Fix: a closed outline for deep footprints, and ideally round ones for round objects. Rooms with blocking props change hash, so re-check the golden and bot hashes. The Academy's deep props have the same hole.

### Where things stand, and what sorts in front

- **#6 The pedestal floats slightly.** *Likely cause:* a prop's `foot` should be the middle of its footprint on the ground (`game/content/README.md`), but `tools/art-import/props.py` defaults to two pixels above the image's bottom edge. The sprite therefore stands higher than its shadow and collision. The fix applies to every prop registered that way, so judge it across the Academy and the outdoor props too. The defence and well already use the base's middle.
- **#11 The well's steps hide almost your whole body from behind.** *Likely cause:* one sprite has one sort point, its centre. Everything south of that point draws in front and everything north draws behind, including when you're only on the low steps. Options: split the well into a low base and an upper part, or per-prop depth. This wants the same answer as #14.
- **#14 Walking along the wall, you clip behind segments and pop out.** *Likely cause:* each wall piece sorts by one y, but on screen a piece covers 12 px of y, so a wizard walking beside the wall crosses from one piece's order to the next. With no walls around the edge, the battery's wall is the first one you walk beside for a long way. Fix: decide the order by which side of the wall's line the body is on (`kitRun` and `Pieces.tex`, `game/packages/client/src/art/wall-kit.ts`, `view-structures.ts`). Earlier today, forcing a sort offset looked wrong on the towers, so avoid that route.

### Shadows

- **#12 Shadows from turrets and the chest have pixel-sized gaps.** *Confirmed cause:* `castMask` (`game/packages/client/src/art/cast-shadow.ts`) maps each source pixel to one destination pixel, and rounding leaves holes wherever the shadow stretches. Fix: fill it by mapping backwards, from each shadow pixel to its source, or by drawing spans.

### Fire as a surface

- **#10 Flame walls: (a) flat when scaled up, (b) movement too fast, (c) long walls repeat visibly.** The curtain drawing was tuned for a 15 px cast wall (`curtain` in `view-structures.ts`), and the gate multiplies its height by `GATE_FIRE`. Flame speed should stay roughly constant with size. It needs more layers for volume and a longer-period pattern.

### Research: smooth turret rotation (#5)

**Tried and working, 2026-11-10 (the user: "Yes try blender").** The head is now a low-poly Blender model, 25 facings, palette-locked, easing at 320 degrees a second (`tools/turret-3d/`). It took about four passes to sit with the tower. Whether the sweep feels smooth is the user's to judge; it's only been seen in stills.

The research behind it:

Recommendation: a low-poly 3D model of the head only, rendered to about 24 facings over the 160-degree swing and locked to our palette, keeping the tower as the existing sprite. If that can't be tuned to sit with the tower in about 2 hours, fall back to a rounder head with a nozzle drawn in code.

- **How many facings:** at 24 over 160 degrees the nozzle moves about 3 px a step, which reads as a fine ratchet. 16 is acceptable if the head eases toward the aim at a capped turn rate and the muzzle flame hides the tip. This is arithmetic, not tested. The swing is mirror-symmetric only if the head is, and ours isn't quite.
- **Evidence:** Factorio's rotating sprites use 64 directions (its prototype docs), and its community guide makes them in Blender. Classic RTS turrets at 16 to 32 facings is from memory, unverified.
- **More Rotate facings:** 16 to 24 generations, cheap, but each is a fresh inference, so expect hand clean-up on perhaps a third. It doesn't extend well to other elements.
- **Code-drawn nozzle on a round head:** cheap and perfectly consistent, but less hand-made.
- **3D head:** about a day to model and tune, then any facing is free, and a new element is a palette swap. The risk is matching the painted brass.
- **RotSprite from our 3 facings:** expected to mangle a head this detailed, as the affine rotation did.

Cheap first experiment, no paid calls: a rough head of about 100 faces in Blender, 9 facings at 10-degree steps at 64 px, orthographic at the game's angle, flat shading, no anti-aliasing, mapped to the palette with a script. Then sweep the mouse in the game next to the tower. It needs Blender on this machine.

## Track B: the battery itself (done 2026-11-10, first pass)

Merged main for the new nova (#8). The swing is 80 degrees each way, on the plan (#1), though the art still has only 3 facings, so past about 22 degrees the head holds its last one until #5 is decided. Flamethrower reach is 7.5 where the screen is widest and up to 12 where it squashes most (#2). The flame is three cones with more particles (#3). The view leans 4.5 units out over the field and eases there (#4). Place has its own 18 range, limited only to the enemy's side of the wall (#7). A dedicated bar, one config entry per future device (#9). All numbers are first guesses for the user to judge.

After these: waves and lanes, the failing pool, the infusion and the repair (`docs/decisions/README.md`, 2026-11-10; the Opening Segment page).

## Second look at the turret (2026-11-10, evening)

The user drove a defence again and listed four more. **Status: built, awaiting the user's playtest.**

- **The head didn't point at the cursor.** *Confirmed cause:* the aim is measured from your body, and while driving your body is at the muzzle, about 4 units out past the wall, so both the head and the sim's flame aimed from there. Second, smaller cause: the barrel stands about 60 art px over the tower's spot, so a barrel aimed along the ground looks aimed above the cursor. Now the head picks the facing whose drawn barrel lies on the line to the cursor, read off the sheet (`facingToward`, `art/props.ts`; the barrel's line was measured from the sheet's pixels, level and 9.6 px above the swivel). The sim aims from the tower the same way, with the barrel's height as `BATTERY.barrelLift` (`aimFromTower`, `sim/src/battery.ts`), which matches the head to within a few degrees. `check:battery` now writes `sweep-*-guide.png` with a line from the barrel's root to the cursor: the barrel lies on it at near, far and wide aims.
- **The pilot flame was a still.** It was the bought head's painted flame pasted onto every facing (`tools/turret-3d/pixelize.py`). It's gone from the sheet; the game draws a small flickering one at each working nozzle while it isn't firing (`pilotFlame`).
- **The flamethrower redesigned, not adapted** (the user's suggestion). `art/flame-jet.ts`: one particle stream where every particle has a spot on the ground and a height. It leaves the barrel level, arcs down to chest height, slows so it billows at the end, and cools from white through yellow, orange and red. Dithered smoke rises along the far two thirds, not only at the end. There's no core line and no separate impact sprite, which were what made the old one look like two things.
- **The spray drew over the gate's pillar.** *Confirmed cause:* the driven flame skipped occlusion on purpose. The new jet is drawn in seven bands of depth, each through `behind`, so the pillars and the wall hide what's behind them. Up to 1.5 units past the wall's line the jet is over the wall's top, so only props (the pillars) hide it there, not the wall's pieces.

**Third look (same evening).** The user: aim and pilot flame are right, and the jet is much better, but "when I aim more towards the left, they look like they're kind of curving towards the right", and aimed at the lower-right wall the flame showed in front of the wall, then behind, then in front again.

- *Confirmed cause of the curve:* the jet bent on the ground toward where the sim's spray landed, which was off the barrel's line by the muzzle's offset (up and right on the screen). Now the sim's spray aims at the barrel's line (`driveSpray`, `sim/src/battery.ts`): it lands where the barrel's line is at its reach, and the spray runs from the muzzle to there. The drawn jet is straight on the ground and keeps only its fall from the raised barrel, which the user said reads right.
- *Confirmed cause of the flicker:* the bent path crossed the wall's line and back, so its depth bands flipped between in front and behind. With the straight path, and wall pieces never hiding the jet before it's 1.5 units past the wall's line, it stays in front.
- Past about 70 degrees the barrel's line never leaves the inside of the wall. The sim's spray then runs from the muzzle into the wall and does nothing; the jet is drawn its full length along the inside, where the barrel points, and at the far left it reaches the neighbouring tower. The user suggested trimming the swing if needed; about 70 degrees (`BATTERY.swing` 0.194) would keep every aim useful.

**Last round (same evening), all built.** The user: "lets trim the swing a little bit", so it's 70 degrees. Place's reticle stopped short of where the spell landed: it used a wizard's Place reach, not the defence's 18 and its outside-the-wall limit, and now shares the sim's rule (`drivePlace`). The fire burst (the Weapon cast) did nothing while driving, because only Force and Area got through. The user: "allow both actions, but basically have the same spell effect", so from a defence the burst makes the same half-ring as Area. The user is done with bug reports for now.

## The well fails, beats 5 to 7 (2026-11-12)

Built, waiting on the user's playtest. All of it is in `sim/src/battery-waves.ts`, with the numbers in `config.ts` `WELL`.

- **Beat 5, the pool fails.** Once the lesson is over (the free fights), the well's flow (`battery.flow`) falls from full to nothing over 75 s, and a defence's pool refills at that share of R (`regenOf`). On the bar the flow line is measured against a full well, so it gets shorter; the part the well no longer gives is dark red with a flickering edge. The prompt reads "The well is failing".
- **Beat 6, it runs dry.** That happens once the flow is out and nobody at a defence has a whole rune, or 6 s later, so a rune held back can't stall it. Everyone is put back at their pedestal, the gate's fire goes out, the towers switch to their burnt-out art, and the pilot flames and the well's light go out. The pedestals can't be used again. 2.5 s later comes the infusion: a Fire pool of your own, 1 rune deep, lit at once, with its socket flashing and fire welling up round you (`kindle` in `art/vfx.ts`). The prompt uses the user's line, "You've learned to channel fire".
- **Beat 7, from your own hands.** The goblins still out there stop battering the walls and come through the open gate for you, and 3 s after the infusion two small groups follow, one per wizard (3 goblins, then 3 and an archer). There's no prompt about the blade: that's left to playtesting, as agreed. After the last of them the battery goes quiet (`BSTEP.after`); the repair comes next.
- **Added the same day, at the user's request:**
  - **The camera glides back.** For 3.5 s after the well runs dry, the view eases slowly from the battlefield back to your wizard (`DRY_GLIDE` in `view.ts`).
  - **The drained well.** A free local edit, `tools/art-import/well_drained.py`: black crystal with a pale crack, dead seams, dulled brass. It's swapped in with the burnt-out towers. The rings haven't dropped onto the plinth.
  - **Feed lines** (`art/feed-lines.ts`): glowing glyph paths in the ground from the well to each defence, by way of its pedestal, and up a trunk to the gate that splits to both pillars. Pulses run out from the well. Brightness and pulse speed follow the well's flow, and the line to a defence someone is driving burns brighter. As the well fails the runes start blinking out; when it runs dry the light drains back down every line into the well.
- **Second pass, the same day.** The user: make the well dynamic, don't make the power-down binary, and rebuild the paths as a tileset of small glowing glyphs between two thin lines, routed like circuit traces at 45 degrees.
  - **The well is alive** (`art/well-anim.ts`). Its drum and crystal are layers cut from the bought art (`tools/art-import/well_layers.py`). The three brass rings are drawn in code as real circles, so they can turn, each about its own tilted axis, with rivets showing their spin. The crystal pulses and bobs, the runes on the drum shimmer in a slow wave, and the drum's top breathes with the crystal. As the well fails it gets unsteady: the rings wobble, and the pulse and runes falter. All of it is painted into the well-top prop's own texture, so it still sorts among the actors.
  - **The power-down is a timeline** (`art/power-down.ts`). Over 0 to 0.8 s the towers sputter into their burnt-out art and the pilot flames choke. Over 0 to 1.4 s the gate's fire gutters down; the sim now keeps it until `WELL.gutter`. Over 0 to 1.1 s the light drains back down the paths. Over 0.9 to 3 s the well dies: the crystal stutters, darkens and sinks, and the rings slow, tip flat and drop onto the drum's rim with a small bounce. The infusion moved to 3.6 s (`WELL.surge`), after a quiet beat. Every light fades with its prop.
  - **Glyph paths** (`art/glyph-path.ts`). The tileset is `game/content/assets/tiles/glyph-path`, drawn by hand in `tools/art-import/glyph_tiles.py`: 12 runes, an end pad and a bend node, all white so they can be tinted any colour. A path is a set of waypoints in the sim's world with legs along an axis or at 45 degrees (`snap()` fixes the others). It's drawn as runes between two thin lines, with pads at its ends and nodes at its bends. The battery's routes (`art/feed-lines.ts`) leave the well's north side as a bus, one lane each; the outer lanes turn off first so none cross, each meets its pedestal on a diagonal, then turns into the tower. The middle lane runs to the gate and forks to its pillars. A slow swell of light runs out along them.
- **Not built yet:** the quiet beat's sound, and the well's column, which isn't drawn at all yet.
- **To tune in play:** how long the well takes to fail (75 s), the grace (6 s), how deep your own pool is (1 rune), and the beat 7 groups.

## Enemies at the wall's foot

Not on the user's list, but it comes from the same layout: a full-height wall hides about 4 units of ground behind it, and enemies reaching the wall will be out of sight. A one-storey kit would be about 10 generations, with sign-off first. Decide once waves exist.
