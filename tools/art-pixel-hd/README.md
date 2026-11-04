# Pixel Battlefield

A full-viewport test of the Hi-Bit Lit pixel direction (the user's favourite from `tools/art-styles/`), rebuilt for a top-down camera and zoomed far out. It's one 12 s fight loop: four wizards hold a ruined plaza against goblins, archers and brutes. Everything is procedural, with no image assets or sprite sheets.

## Pass 2 (2026-11-03)
- **Camera:** steeper, about 67° from the horizon. Ground depth is `FY = 0.88`, and terrain height is drawn at 0.38 px per unit. Characters (`CU = 0.8`) and structures are drawn taller than a true projection would show them, so they still read.
- **Map:** neutral. The defenders hold a central plaza. Threats come from three lanes: a road from the west, a gully from the north, and a road from the east. The south is closed by low outcrops and trees.
- **Light:** the light is posterised into flat bands. Ordered dither appears only in a narrow seam where two bands meet (`DW` in `render.js`), so the ground has no screen-door grain. Glows use two steps, and decals and shadows are translucent fills.
- **Readiness swirl:** a chain of motes circles each wizard, one mote per rune they have ready, grouped by element.
  - Blue is a cold specialist with about 11 motes. Gold is nearly empty and has 2 to 4. Violet is in between.
  - P1's swirl is at a third of the density and dimmer, because the HUD already shows the detail.
  - While a wizard is casting, the swirl thins out.
- **Spell prep:** every cast has a 0.55 to 0.7 s prep.
  - The wizard raises the staff, and each queued element leaves the swirl and flies to the orb, one at a time.
  - Each arrival pulses, and the arrived elements orbit as a charge in their colours. On the cast, the charge releases in a burst.
  - P1's HUD shows a queue chip during prep.
- **Also changed:**
  - Wizards are redrawn for the steep view. The hat is a darker brim disc with a cone whose floppy tip falls back, away from the facing. The beard and face show from the front, and a cape shows from the back.
  - The rock wall is a diagonal row of earth spurs (cached sprites).
  - The shield is an arc of light: a translucent sheet with a crest and climbing scan bands.
  - Cliff tops get their own light map, so fires on the low ground don't light them.

## Pass 3 (2026-11-04)
- **Perspective:** everything is drawn from the same steep camera.
  - Plaza flagstones are ground squares (12 × 10.5 px, so FY as tall as wide), in mixed sizes instead of a running bond, with top-left bevels.
  - Trees are crowns seen from above: lumpy shaded domes (broadleaf) or stacked star tiers (conifers), a short trunk under them and a shadow to the lower right.
  - Boulders are faceted domes; column tops are near-round ellipses and the column foot follows the base arc; bushes are small domes. Grass tufts splay.
  - Frozen goblins' ice blocks have a top face. Cliff tops get a lit/shaded bevel on their edges.
- **Walls** (`walls.js`) are rows of thick slabs (16 px tall, 9–10 units thick), painted by a small raycaster into cached sprites, so tops, faces, the visible end face, notches and rubble all occlude correctly.
  - Violet's rock wall: raised earth with strata and turf torn up on top.
  - Blue's wall: a stone arc coated in frost (Shield + Earth + Cold). It rises as bare stone and the frost creeps over it.
  - Five damage states: whole, cracked, chipped (a chunk out of the top), broken (half height), rubble. Health comes from timed hits in `scene.js` (`WALLS[].events`): brute A punches the rock wall four times (2.4–4.45 s); the frost wall cracks in the steam blast (6.8 s), cracks badly on the brute's first blow (7.45 s) and breaks through on the second (8.2 s).
  - Re-raising: Blue raises a new arc at 10.3 s and Violet a new rock wall at 11.5 s. The old wall crumbles into the ground as the new one rises, and the runes fly from the staff to the wall.
  - All states the loop shows are painted at startup (about 0.5 s, about 200 sprites); `?bench=1` reports it.
- **Shield upkeep:** the arc's strength follows Gold's shield pool. The archers shoot nine arrows between 0.5 s and 7.3 s, then pause. Each arrow absorbed costs 0.25 of a rune, and regen pays it back over the loop, so the arc is weakest around 7.3 s. As it weakens, the sheet thins and dims, columns drop out, the crest stutters and whole stretches blink. A spark flies from Gold to each hit. At full strength the sheet is denser, with a thicker crest and lit ribs.
- **Rules:**
  - No Ice element: the puddle freezes into an ice sheet (clear ice over dark water, a frosted rim, cracks, glints).
  - The turret is a Sigil device (Sigil + Fire + Fire). A violet sigil on the plinth marks it, and fire pips on the ring around it are its ammo (eight shots, going dark as it fires). It runs dry after the 7.6 s shot, gutters out, and Red re-plants it at 10.25 s (prep at 9.6 s).
  - Gold's glyph is Sigil + Earth, so its outer ring is Sigil violet.
  - HUD order is Q W E R / A S D F G: water, life, shield, cold / lightning, arcane, sigil, fire, earth. A Sigil rune bound by a device is a hollow pip.
- **Weak spots from pass 2:**
  - The swirl is drawn fatter at 2×, and P1's swirl is a short ribbon.
  - Violet's conjure prep is bigger and sketches the hammer head.
  - From behind, the hat tip flops sideways instead of folding over the cone.

## Pass 4 (2026-11-04)
- **One camera.** Pass 3's ground (`FY = 0.88`) read as straight down while pillars stood side-on. Now every shape uses `FY = 0.6`, a steep 3/4 view. The map layout and walking times keep `LFY = 0.88`, so nothing moves on screen.
  - Floor slabs are 14 × 8 px, with a light top face, a 2 px dark front edge and a dark joint.
  - Columns are short and fat on square plinths, with caps 0.58 of their width. The fallen drum lies pointing at the camera, with a round near face.
  - Trees stand on visible trunks, with crowns squashed into the ground plane. Conifers are stacked cones with elliptical skirts.
  - Boulders and bushes are squashed domes. Walls are 14 px tall and 15–16 units thick, so they show deep tops. The turret plinth and the ice blocks have square top faces.
  - Every cast shadow uses `X.shadow`: the hull of the footprint and the footprint moved by `SHADOW_DIR × height`, so all shadows fall to the lower right, longer for taller things.
- **HUD:** two staggered rows like the keys. Q W E R is on top, and A S D F G sits below, shifted a third of a key to the right.
- **Turret rule:** the Sigil turret has no ammo. Every shot draws one Fire rune from Red, MOTE = 0.3 s before it fires, and a mote flies from Red to the turret along a faint thread.
  - Red's Fire regen (0.75/s) pays back exactly eight shots and the beam's payload, so the pool loops without clamping.
  - The schedule is simulated in `scene.js` (`WANT` → `TSHOTS`, `firePool`). When the east crowd (r3–r5) arrives, Red runs dry. The turret waits as a sputtering ember with a dashed ring, and Red's F key flashes. Then it fires as Red regenerates: r4 waits about 0.5 s and r5 about 1.4 s.
  - There is no recast any more. The turret binds one Sigil rune all loop.
- **Status on bodies, no symbols.**
  - Burning is emissive fire flecks climbing the body (`burning` in `actors.js`), plus short licks and embers.
  - Wet is a darker, bluer tint with highlights running down, and drips to the ground.
  - Frozen is rime pixels on the body inside the ice block, with glints on the ice. The smoke over burning heads and the motes floating over frozen ones were removed.
- **Payload look rule:** the strongest element sets the form, and the attached element sets the look.
  - Red's beam (arcane carrying fire) is a fire beam: a white-hot core, an orange body, a ragged red rim, flame licks and embers.
  - Violet's hammer (earth + arcane + earth) glows arcane pink, not lightning violet.
  - Gold's glyph (sigil + earth) glows in earth tones.
  - The turret's sigil mark glows like embers (fire).

## Pass 4.1 (2026-11-04): a new turret
- The user found the turret "a bit boring, looks like a torch on a cube". It is now a Sigil device that reads as magic: a carved round dais with a violet groove, a fire crystal hovering over it (violet outline and halo; Fire is the look), and three stone plates with violet runes orbiting the crystal (Sigil is the form). A ring of six violet runes turns on the ground under it, inside Red's owner ring.
- It animates with its rule: the plates pull in and the crystal swells and whitens as each rune from Red lands, it kicks up and the plates flare out on the shot, and it bobs while idle. While Red is dry the crystal sinks to a dull ember, the plates droop and dim, the ground runes blink and the owner ring is dashed.
- `sigilDevice` and `runeRing` in `render.js` are copies of `K.sigilDevice` / `K.runeRing` in `tools/spell-vfx/fx.js`; keep the two in step. `orbZ` (14) is the crystal's centre, where the bolts start.
- The feedback panel is "Pass 4.1: new turret" and adds one question, `p5-turret`.

## Files
- `scene.js`: the fight as a pure function of time, `PB.scene(t, chaos)`. It holds:
  - the map (cliff footprints, lanes, the plaza)
  - the actors' routes and events
  - the structures and the spells
  - P1's rune pools and the allies' pools, plus the prep queue for every cast (`casts: [prepStart, castStart, castEnd, kind, elements]`)
- `pixel.js`: crisp pixel primitives (rects, scanline ellipses and polygons, Bresenham lines, stepped glows), a 3×5 font, 7×7 element icons and the palettes.
- `world.js`: the ground, cliffs, props and an elevation mask of the cliff tops, all generated once. Cliffs are footprint polygons extruded to a height and cut into 4 px column strips, so actors depth-sort correctly against them. Prop sprites are painted once at build.
- `walls.js`: wall slabs. Geometry per wall, a raycast painter per (slab, damage state, rise, frost), the cache, and the startup warm-up.
- `actors.js`: procedural rigs for the wizard, goblin, archer and brute. Parts sit in a local (forward, right, up) frame, get rotated by the facing angle, then projected.
- `render.js`: composes a frame:
  1. ground and decals
  2. the depth-sorted pass (including the swirls)
  3. the banded light map (with a separate one for cliff tops), which emissive pixels skip
  4. unlit effects (including the prep charges)
  5. the HUD
- `app.js`: canvas sizing at an integer pixel scale, the loop, controls, and the feedback panel.

## URL parameters
- `?t=<seconds>` freezes a frame.
- `?chaos=0..1` overrides the chaos level (fixed at 0.8; the slider was removed).
- `?scale=2|3|4` sets the pixel scale (1–10 for close-ups).
- `?ui=0` hides the chrome.
- `?panel=1` opens the feedback panel.
- `?cam=x,y` pins the camera.

Debug only: `?bench=1` writes render timing to `body[data-bench]` (including the wall warm-up time and sprite count), and `?skip=actor,prop,struct,strip` skips one kind of drawable.

## Screenshots
Run headless Chrome with its own `--user-data-dir`, using `--window-size=1920,1080 --virtual-time-budget=4000 --screenshot=...` on `index.html?t=3.1&ui=0`.

## Reading feedback
Answers are stored in the artifact's db, in the collection `answers`, with one doc per question id. Each doc is `{ mark, note, updatedAt }`.
- **Pass 1 ids:** `overall`, `camera`, `zoom`, `structures`, `runes`, `procedural`. The `zoom` doc also records `scale`.
- **Pass 2 ids:** `p2-overall`, `p2-camera`, `p2-dither`, `p2-swirl`, `p2-prep`, `p2-other`. The `p2-camera` doc also records `scale`.
- **Pass 3 ids:** `p3-overall`, `p3-perspective`, `p3-walls`, `p3-damage`, `p3-shield-fade`, `p3-rules`, `p3-other`. The `p3-perspective` doc also records `scale`.
- **Pass 4 ids:** `p4-overall`, `p4-perspective`, `p4-hud`, `p4-turret`, `p4-status`, `p4-beam`, `p4-other`. The `p4-perspective` doc also records `scale`. Pass 4.1 adds `p5-turret` (the new turret design). Older docs are never written again.

To read them, run `ArtifactData` `list` on `answers`, then fold the results into `docs/ideas/art-direction.md`.
