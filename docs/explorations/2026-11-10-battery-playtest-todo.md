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

## The user's notes, 2026-11-12 (commit 7454e7e)

1. **The rings** looked bland, and should stay as the bought art had them, only spinning. Now two rings are tilted into an X and one is nearly level, as in the art. Each is a flat brass band spinning about its own axis, with engraved notches and studs carried round (`art/well-anim.ts`).
2. **The floor glyphs:** the user said they look great.
3. **The pedestals** read as knobs and levers; the user wants magic. They're replaced by possession circles: a glyph circle touching each tower's foot, where the feed line ends. While free it pulses, with someone in it it brightens, and while possessed it burns and turns. The X key cap floats over your head while you stand in one. The prop is `possession-circle` (flat, drawn in code), and the sim's reach is 2.0.
4. **Archers' arrows** drew over the wall. In the battery they now go through `behind()`, so the wall hides them. A check frame with an arrow in flight showed none over the wall.
5. **The lesson's text** didn't work mid-fight. There are no sentences now: each step's keys are pictures that press themselves in order (`key-caps.ts`). They are the Fire key with a big F, Shift, a mouse with its right button lit, and bars for keys you hold. The only text left is the user's own line at the infusion.
6. **The battlefield.** Smashed field works are scattered over the killing ground, clear of the goblins' lanes: palisades, sandbags and crates (`tools/art-import/broken_props.py`), plus stakes, shields, a cold campfire and burnt banners. There are also burn craters and churned mud. Each line of stakes has a palisade either side that gives way with it.
7. **Three states for the well.** Overloaded/failing is built: the crystal overcharges, flaring and shaking, arcs jump to the rings, the rings are knocked askew, the runes stutter, and the column of light whips and breaks up. Failed is the power-down. Repaired comes with the repair beat. The column of light is now drawn (`vfx.ts column`): steady while the well holds, drawing down into the crystal as it dies.

**Sound: its own session, at the user's choice.** The notes: no music for tension on arrival, no sound of the battle going on, and the archer and goblin fighting sounds are bad. My proposal is CC0 libraries first, then ElevenLabs for the rest (up to about 620 credits), each with its prompt for sign-off before any paid call:
- **Tension music** on arrival, calmer once the well is dry: free CC0 library. PixelLab music needs a higher plan tier.
- **Battle bed**, looped, 2 takes of 20 s: "Distant battle outside a fortress wall: a crowd of small creatures shrieking and jeering, wood being hacked, scattered clangs of metal on stone, a war horn far off."
- **Archer's shot**: "A short wooden bow loosing an arrow: a quick creak of the drawn string, a sharp twang on release, and the arrow's brief hiss as it flies away."
- **Arrow on the wall**: "An arrow striking a sandstone wall and snapping: a hard wooden clack and a small splintering crack."
- **Goblin hacking stakes**: "A small goblin hacking at wooden stakes with a crude iron blade: a dull chop into wood with a short splintering crunch."
- **Goblin battering the wall**: "A crude iron cleaver clanging against a stone wall: a hard metallic clank with grit scraping off the stone."
- **Goblin effort grunts**: "A small, wiry goblin grunting with effort as it swings: a short raspy snarl."
- **Barricades giving way**: "A wooden palisade and stakes giving way: timber splintering and cracking, posts falling and thudding into the dirt."

## The well rebuilt from layers and 3D rings (2026-11-12 to 13)

The bought well animations (commit a9a2228) morphed the rings into a hoop rather than turning them, sank them top-first, invented ring pieces, and ran at a low frame rate. The user liked their crystal and rune flare-out. Lesson kept in memory: generated animation is for light, fire and sparks; anything solid that moves goes to Blender or code; check frame by frame before buying or wiring in.

- **The rings** are now 3D (`tools/well-3d/`, its README has the pipeline): two solid bands with sharp corners, fitted to the bought silhouette, with ring A a band's thickness bigger so they never meet. They're snapped to the bought palette in the bought rings' own shade proportions. The band's face went through about twenty rounds with the user: engraved runes and braids carved in 3D read as noise below a pixel; per-pixel drawings, streaks and shapes never matched the bought art. The user settled on a dark band with raised borders and raised strips across it that stop short of the borders.
- **The drum** kept the bought rings' last rows under them, which doubled the 3D rings. Its back rim is rebuilt from the front, mirrored (`drum_fill.py`), lit and drained.
- **The states** (`art/well-anim.ts`; clicking the well steps through them, `?well=n`):
  - Steady: the spin at 8 frames a second, a light pulse on the runes and the crystal, a 1 px bob.
  - Overloaded: the spin up to about four times faster, runes and crystal blazing and flickering, lightning from the crystal ending on the rings' own pixels, molten sparks spitting from the runes under gravity.
  - Overloaded to failed: a white flare and a burst of sparks, then a rigid-body fall rendered in Blender. The rings tip, drop round the drum and settle leaning against it on the steps, as the light goes out of the rings, the crystal and the drum.
  - Failed: the fall's last frame, dark.
  - Failed to repaired: the fall played back, the rings lifting as the light returns, then the spin. Not used in the game until the repair beat.
- **Not yet judged by the user:** the spin GIF, the fall, the overloaded effects. `scripts/well-frames.mjs` paints each state directly for a look.
- **Still to do:** the repair beat itself ("press X to stabilize"). The bought frames (`content/assets/well/frames`, `tools/art-import/well_frames.py`) are no longer used and are kept as a record.

### The user's verdict and the second pass (2026-11-13)

The user approved the fall ("rings falling look good"). What they changed, and what was done:

| Note | Done |
|---|---|
| Steady: the turning reads as text scrolling on a display; marks on the metal would show it moving | Wear fixed to the band: missing and snapped ribs, slanting scratches, chips out of the borders, a few patina spots, dents inside (`pixelize.py WEAR`). The loop is now a whole turn, 240 frames, since the wear doesn't repeat. |
| A very slight wobble, to feel real | Each ring's axis leans 1.6° (`rings.py WOBBLE`), swinging round 5 or 7 times a turn; overloaded, the faster spin makes it faster, and the rings shake a pixel now and then. |
| Lightning from all over the crystal, some out of its back; white at the root, orange at the tips | Bolts leave from random crystal pixels; some are drawn behind the crystal to the back rings; colour runs white to orange along each bolt, with an occasional fork. |
| The crystal's bounce faster and erratic when overloaded | A fast jitter replaces the slow bob as `unstable` rises. |
| Sparks from all eight legs; the runes glow very strongly and flare out | Sparks from all eight legs, outward and up; the three behind are drawn behind the drum and appear over its rim. The runes blaze with a glow on each rune and each leg. |
| The rings' outline showed through the crystal in the fall | Blender's line pass ignored the holdout; `unhide` clears those lines. |
| Failing should end in one large flare of lightning and runes | The flare is longer (a fifth of the power-down), throws many white-hot bolts at once, and every leg erupts. Then the rings fall. |

Third round, same day:

| Note | Done |
|---|---|
| The overloaded lightning is too fast, like a sped-up video | Each bolt is shaped once and held for 0.2 to 0.45 s, then fades (it was re-rolled 16 times a second); the flicker of the glow slowed to 9 a second. |
| Single lines from core to rings; the original's lightning branches | Bolts are jagged by midpoint displacement, with forks and forks off forks, thinner and redder outward, plus short crackles off the crystal. |
| Lightning drawn over the front of a ring that is in front of it | All lightning is drawn between the layers, so the front rings cover it; only the flash where a bolt strikes sits on top. |
| Still no flaring from the runes, as in the bought picture | The rune glyphs on the three visible legs burn: their strokes blaze and flame licks off them, up and to the sides (`runeFire`). A first try filled the whole rune column and made a bar of fire (the user: the rune shapes should burn, not the column). |

## Enemies at the wall's foot

Not on the user's list, but it comes from the same layout: a full-height wall hides about 4 units of ground behind it, and enemies reaching the wall will be out of sight. A one-storey kit would be about 10 generations, with sign-off first. Decide once waves exist.
