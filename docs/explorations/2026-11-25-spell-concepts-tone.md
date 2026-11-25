# Spell tone concepts: Arcane beam, Earth rock, Cold nova (2026-11-25)

The user picked **toon volume** for Fire from the [fire concept round](2026-11-25-spell-concepts-fire.md) (toon-spray-2, toon-floor-3, toon-ring-1, toon-sheet-1), and rejected streaks used only to clarify a shape ("I don't think its necessary to clarify the cone to this degree"). Before a dedicated session redraws every spell in 3D, this round sets the tone with three more pieces in the same family, one per kind of delivery: a **line** (the Arcane beam), a **solid object** (the Earth rock missile and its impact) and an **area wave** (the Cold nova). Then one picture with all four spells side by side, to check they read as one family. Concept art only; nothing here ships.

Images: [`docs/reference/spell-concepts/`](../reference/spell-concepts/) `arcane/`, `earth/`, `cold/` and `family/`, named `<style>-<subject>-<n>.jpg` (PNG originals in the gitignored `.reference/spell-concepts/`). Prompts: `tools/concept-gen/prompts/2026-11-25-spell-tone/` (`make.py`). Every scene prompt repaints `tools/port-3d-review/img/plaza-26.jpg` and attaches the chosen [toon-spray-2](../reference/spell-concepts/fire/toon-spray-2.jpg) as a second reference, "the style every spell in the game is drawn in". The rubric is [vfx-workflow.md](../vfx-workflow.md)'s.

## Arcane beam

| Take | Read |
|---|---|
| [toon-beam-1](../reference/spell-concepts/arcane/toon-beam-1.jpg) | A white core with bead-like surges, a magenta halo and a big starburst on the goblin. Reads at once. But it's a thin laser, not a body, and its light washes the whole left half of the court pink. Hit the wrong goblin. |
| [toon-beam-2](../reference/spell-concepts/arcane/toon-beam-2.jpg) | The same, shorter, on the right goblin; the wash is smaller but still a wide pink pool. |
| [crisp-beam-1](../reference/spell-concepts/arcane/crisp-beam-1.jpg) | The alternative: harder edges, a four-point star on the goblin. Cleaner, but even thinner: a laser pointer. |
| [**toon-beam-3**](../reference/spell-concepts/arcane/toon-beam-3.jpg) | Round 2, asked for "a thick, heavy rope of plasma... not a thin laser", a dark violet rim and light "in a narrow strip under the beam only". **The best beam:** a violet body with real width, white-hot beads running up its middle, a darker rim, a burst of violet sparks round the goblin, and the light kept to a strip. It sits with the fire: a bright core, a saturated body, a darker edge. |
| [toon-beam-4](../reference/spell-concepts/arcane/toon-beam-4.jpg) | Round 2's second take: the fattest, but the surges became round swellings as wide as the hat, so the beam reads as a string of magenta beads (a caterpillar), objects rather than one material. Shows the limit: surges should brighten the body, not bulge it much. |

**Against the rubric.** Readable and one silhouette in every take: a line is the easiest shape there is. *Element*: magenta-violet with a white core says "raw energy", which is right for Arcane and is exactly what Fire must not look like, so the two separate well. *Stands out on warm stone*: yes, by hue (violet against orange) and the white core; the risk is the opposite one, the pink light pool, which turns the floor the beam's colour and flattens the scene. Keep the light to a strip. *Runes*: the paintings show three runes. Today's ladder (thicker, surges, a halo from three, a white-hot core from four) maps directly onto toon-beam-3's layers: body width and surge count up to three, the halo added at three, the core going from violet-white to pure white and wider at four, and at five the sparks at the hit growing into a standing burst. *Alive*: the surges are what moves; without them a beam is a picture of a line.

**How to build it.** Round 1's thin lasers are what a beam drawn only with particles would look like; the body round 2 asked for wants a **strip**:
- The body and core: the kit has no ribbon primitive, but a beam is straight, so it doesn't need one. A camera-facing quad stretched from the staff to the hit (one billboarded box, or two crossed quads) with a look function across its width (white core, violet body, dark rim, soft halo past it) and a scrolling noise along it does the whole body. That's a few lines on top of `ParticleBatch` with a stream of one long particle, or a tiny `BeamStrip` mesh: still stateless, a function of (start, end, time).
- The surges: bright swellings as a function of `fract(distance / spacing - time * speed)` in the same look function. No particles.
- The hit: an additive burst of short stretched sparks (the kit's stretched quads), a flare quad at the staff and at the hit.
- Light: two or three pool lights along the beam, and an additive strip decal under it. Not one big light: that's the pink wash.

### The build: the crisp beam (2026-11-25)

The user picked **crisp** ([crisp-beam-1](../reference/spell-concepts/arcane/crisp-beam-1.jpg)) over toon-beam-3: "I think the thinner version looks a bit more elegant. I'm not quite sure about the impact effect, I'd have to see how it looks in motion." Built on branch `p3d-arcane`: `game/packages/client/src/view3d/fx/arcane.ts` (the beam), `fx/beam-strip.ts` (the straight strip and its floor twin, for the Life beam too). Shots and clips: `npm run shot:arcane3d` (`game/shots/port-3d/tone/arcane/`). No painted sheets: a beam is light and sparks, which the art rules leave to code.

| Field | |
|---|---|
| **Job** | Who is pouring raw energy into what: one line from the staff to exactly where the sim stops it, following the aim as the caster turns. |
| **Silhouette** | A thin straight line (the body about 0.12 u across at one rune, 0.22 at five; a wizard is 2.7 u), round-capped, ending in a four-point star where it's stopped. Nothing where it runs out in the air at 30 u. |
| **Movement** | The line itself is still; surges race along it from the staff (16 + 3n u/s, 6 to 18 a second), each a sharp head with a fading tail. A slow shimmer scrolls along the body. It grows to full length in 0.1 s and thins away in 0.14 s. Sparks fly from where the beam was when they were born, so a sweep leaves them behind. |
| **Colour** | Core violet-white (pure white from four runes); body saturated magenta-violet, paling toward the core only close to it; a dark violet rim at least a pixel wide at any distance; halo and floor strip magenta added light. |
| **Layers** (back to front) | floor strip (narrow, with the surges and a pool at the impact); halo; rim; body; core; surges in the core and body; a few shed sparks (from three runes); a few impact sparks; flares (a flash disc and small star at the staff, the impact's flash disc and star, rings). Two small spell lights, staff and impact. |
| **Runes** | Thicker body and core; more and faster surges; the halo from three; sparks shed off the sides from three; the core white and wider from four; rings pulsing off the staff at five; the impact star grows with n. |
| **Impact** | Two variants, `?impact=a` (default) and `b`, in the lab (`cast3d.html`) and on the 3D page (Tune › URL options › Arcane beam impact). **a, restrained:** a small star (0.8 u across at three runes) over a small flash disc, and 21 short sparks a second in a narrow splash back toward the caster. **b, fuller:** the concept's burst: a big star (1.8 u across at three runes) with a second one turning inside it, a bigger flash disc, two shockwave rings pulsing out, 44 sparks a second flung wide, a brighter pool and light. Every impact shape is one surface drawn by a shader, never a cluster of sprites (the rule after the user's verdict on the built fire): the flash disc is toon bands (white, pale pink, magenta, a thin dark violet rim) whose edge is eroded by moving noise, with a soft translucent fringe; the rings have a white leading edge and break up through the same noise as they thin; each star is one procedural shape. Particles are only the few sparks. |
| **Budget** | Per beam: 2 strips (one quad; the floor strip up to 160 triangles, heights read from the kit's cache), 8 flare quads, up to 26 impact sparks and 11 shed sparks; 5 draw calls. A pool of 8 slots (4 seats and their Doubles). |
| **Not** | Not a rope of plasma (toon-beam-3, passed over), not beads (toon-beam-4), not a pink wash on the floor. |

**Lab options** added for it (`cast3d.html`): `&impact=a|b`, `&sweep=1` (the aim swings either way after the cast), `&undying=1` (goblins never die, so a held beam stays on its target: a three-rune beam kills a swarmer in a fraction of a second), and `window.__seek(t)` for frame-by-frame clips. The court shot `play3d.html?shot=arcane` has its goblins held still (`hold`) along a file, and `window.__advance(n)` steps it on.

**What the rounds taught**
1. **Widths in pixels, not only in u.** At the game camera a u is about 36 px, so a 0.02 u rim vanishes. The rim's width is the larger of 0.018 u and 1.3 pixels (the shader's `fwidth`), so the line keeps its dark edge at any zoom.
2. **Surges brighten, they don't widen.** Widening the body by a fifth in a surge read as a stepped bulge in a still; widening only the core (the body by 8 %) keeps one line. Same lesson as toon-beam-4's beads.
3. **A glow with a sharp head reads as a box.** The halo swelled with the surge's sharp-headed profile and drew a rectangle; it now swells with a soft bump of its own.
4. **Saturation lives in the body's outer half.** Paling the body toward the core across its whole width turned it white-pink after the tone map; pale only right beside the core.
5. **The floor strip must be wider than what it draws.** The impact pool was cut by the strip's edges into a rectangle.
6. **Start the line at the hand.** The staff is held at the side, not 0.6 u forward; at 0.6 the staff star bridged a gap and read as a second, brighter segment. 0.4 u.

**Against the concept.** The line, the white core, the magenta and the four-point star read as crisp-beam-1. Differences: the concept's light floods the floor pink around the caster; this keeps it to a strip under the line, as the family rules ask (a wider wash is a one-number change). The beam runs level at hand height, as the sim is flat, so it meets a goblin at the chest, not the head. In the court a three-rune beam kills a swarmer in well under a second, so most of its life it's moving from one goblin to the next, and the impact is a short flash per goblin: the variant choice matters most on tougher enemies.

## Earth rock missile and impact

| Take | Read |
|---|---|
| [toon-rock-1](../reference/spell-concepts/earth/toon-rock-1.jpg) | A faceted brown boulder in flight with a faint tan dust wake back to the staff and a few pebbles. Reads as a thrown rock, but the wake is tan on tan and nearly vanishes. |
| [toon-rock-2](../reference/spell-concepts/earth/toon-rock-2.jpg) | Weaker: a tiny wake; just a rock in the air. |
| [chunky-rock-1](../reference/spell-concepts/earth/chunky-rock-1.jpg) | The alternative: a blockier rock, a wake that reaches the staff. Not different enough from the toon takes to count as a choice; at this size, "chunky" barely changes a rock. |
| [**toon-rock-3**](../reference/spell-concepts/earth/toon-rock-3.jpg) | Round 2, asked for "a thick wake of billowing dust... chunky toon-shaded puffs, darker ochre-brown than the floor". **The best flight:** the darker ochre puffs draw the arc from the staff, the rock has a dark underside and a sharp shadow. |
| [toon-impact-1](../reference/spell-concepts/earth/toon-impact-1.jpg) | Grey shards flying, a low dust ring, a cracked floor, the goblin thrown back. The boulder stays almost whole in the middle. |
| [**toon-impact-2**](../reference/spell-concepts/earth/toon-impact-2.jpg) | **The best impact:** more and smaller chunks in the air, a clear star of dark cracks, a rolling dust ring, the goblin flying. Reads as a boulder hitting something. |
| [chunky-impact-1](../reference/spell-concepts/earth/chunky-impact-1.jpg) | The alternative: big pale slabs bursting up, the biggest silhouette of the three. But the slabs are the floor's colour and stand up out of it, so it reads as the ground erupting (an Earthquake), not a rock breaking: it fails *follows the delivery*. Worth keeping for the quake. |

**Against the rubric.** *A material, not objects* is turned round for Earth: Earth *is* objects ("stuff, not energy"), so here the check is that the rock is one solid thing and the dust is one material. *Stands out on warm stone* is Earth's real problem. Its colours (tan, ochre, grey-brown) are the court's, so a tan dust wake disappears, and nothing glows to rescue it. What works is value, not hue: the dark underside and sharp shadow of the rock, the darker ochre puffs, the dark cracks. *Follows the delivery*: the toon impacts read as a missile hit, the chunky one as a quake. *Snappy*: the impact must be over fast; the dust ring can linger as the decay. *Runes*: n^1.3 in the rules; in the look, a bigger rock, a longer wake and, at five, a crater and a shock ring.

**How to build it.**
- The rock is a **mesh**, not particles: a few low-poly boulder models (Meshy, or the kit's own rock pieces) tumbling on the missile's path, lit by the scene so it shades like the court. The kit's particles can't be a solid; this is the one layer that needs a model.
- The dust wake: covering (alpha 1) toon puffs of a painted dust cell, born along the path and left in the world, ochre darker than the floor, growing and fading. The fire's smoke layer with another ramp.
- Pebbles: small stretched quads falling out of the wake (the ember layer, dark).
- The impact: shards as particles drawing cells of a painted shard sheet (grey stone, dark rims) with gravity; a dust ring as an expanding ring of covering puffs (the nova's ring motion); the cracks as a ground decal (exists) that stays a few seconds; a short flash light (pool). The goblin's knock-back is the sim's.

## Cold nova

| Take | Read |
|---|---|
| [**toon-nova-1**](../reference/spell-concepts/cold/toon-nova-1.jpg) | **The best:** one connected ring of tall, jagged pale-cyan crystals with a white leading edge, shards flying off it, white mist spilling out, and a disc of frosted stone with snowflake rime inside. Reads instantly; one surface going outward, as the [novas rule](../decisions/README.md#2026-11-10-novas-are-one-surface-not-a-row-of-pieces) wants. Its crystals are tall (waist-high, not knee-high). |
| [toon-nova-2](../reference/spell-concepts/cold/toon-nova-2.jpg) | The same ring, a little lower and more saw-toothed, the frost disc's snowflake pattern stronger, less mist. |
| [crisp-nova-1](../reference/spell-concepts/cold/crisp-nova-1.jpg) | The alternative: a thin, glassy serrated front shattering into fine shards, a pale grey-blue film of ice on the stone, mist to the outside. More restrained and more "shatters"; less of a wall. A real choice: the toon ring is a wall that hits, this one a frost front that sweeps. |

**Against the rubric.** Readable, one silhouette, one material in all three. *Stands out*: Cold has the easiest job of the four on this floor: cyan and white are the court's complement. The risk is clarity, not contrast: the toon ring is tall enough to hide the feet of the goblins it hits, and its frost disc is bright enough to compete with the next spell cast on it. *Grounded*: the frost stays where it formed (the decal), the ring follows the caster only briefly, as today. *Runes*: radius 3 u + 0.6 a rune; the crystals grow taller and the frost thicker with runes, and five might leave a ring of ice standing for a moment before it shatters.

**How to build it.**
- The front: upright quads (the kit's `upright` mode, as the fire floor's flames) drawing cells of a painted ice-crystal sheet, placed round the ring at its current radius, each rising fast and shattering as the ring passes. Or a ring mesh of crystal teeth scaled out by radius, which keeps one connected surface more easily; it's one draw call either way. Start with upright quads: no new primitive.
- The shatter: small stretched additive shards flung outward and up off the front.
- The mist: covering, pale, low puffs on the outside of the ring (the fire ring's smoke, white).
- The frost: a ground decal (exists) of rime with a white rim, spreading behind the front, melting over a few seconds.
- Light: a cold cyan pool light on the ring, kept dim: cyan light on the warm floor greys it.

## The family sheet

Four wizards (red, green, yellow, blue) across the court, each casting one spell, with the fire's chosen take and the best take of each other spell attached (toon-beam-3, toon-rock-3, toon-nova-1). Two takes: [toon-sheet-1](../reference/spell-concepts/family/toon-sheet-1.jpg) and [**toon-sheet-2**](../reference/spell-concepts/family/toon-sheet-2.jpg), the better one (a thicker beam, a bigger wake, a smaller nova).

**Do they read as one family? Yes in rendering, not yet in weight.**
- *The same hand:* the same soft toon shading, a bright core in each (fire's white-hot throat, the beam's white beads, the nova's white edge), saturated bodies, darker rims, residue (smoke, dust, mist and rime) and light on the floor. Nothing looks pasted on, and nothing looks like it came from another game. The four hues (orange-red, ochre, magenta-violet, cyan) are as far apart as they can be, so each spell is identified by colour alone.
- *The weights differ:* Fire and Cold are big and loud; together they take half the picture. The Arcane beam is thin beside them, and the Earth rock is quiet: a brown stone and a brown cloud, the only one with no light of its own. Some of that is right (Earth is stuff, not energy; a beam is a line), but in a four-player fight the rock would be the one you lose. Earth's weight has to come from its impact (shards, dust ring, cracks) and from dark values, and the fire and the nova should be the size the sim says, not the painting's (the nova here is about 2 wizard heights out, larger than 4 u).
- *Clarity:* the fire's smoke and the nova's mist both reach the goblins they hit, which is fine for one spell and a lot for four. Residue needs a cap in a crowd, as the fire round found for smoke.

## What the four share: draft spell-look rules

A draft for the dedicated session, from what worked in these images and the fire round:

1. **Layers, always in this order:** a bright core (white-hot, or the element's palest), a saturated body with soft toon shading, a thin darker rim, the element's residue (smoke, dust, mist, frost), and light on the floor. Every good image has all five; the rejected looks lacked a core or a rim.
2. **Contrast by value, not only hue.** The court is warm pale orange, so every effect needs one value the floor doesn't have: the white core (fire, arcane), a dark rim, dark smoke (fire), a dark underside and darker dust (earth), white frost (cold). Earth, the element closest to the floor's colour, leans entirely on dark values.
3. **Palette per element:** Fire cream white, pale yellow, amber, orange, deep red, warm grey-brown smoke. Arcane white, pale pink, magenta, violet, deep violet rim. Earth grey-brown stone with a dark underside, ochre dust darker than the floor, dark cracks. Cold white, pale cyan, cyan, a little steel blue, white mist and rime. Fire and Arcane are the two hot-bright ones and must not share a hue: orange-red against magenta-violet.
4. **Light on the floor follows the shape, small.** A narrow strip under a beam, a pool under a spray, a ring under a nova. A wide coloured wash (the first beams' pink) flattens the court.
5. **Scale against a 2.7 u wizard at the 30 u camera:** a spray about two wizards long, a beam body about a hat wide, a rock about a goblin's height, a nova front knee-high at three runes. Wider than that hides the goblins; thinner reads as a laser.
6. **Residue tells the element and stays put:** char and smoke, dust and cracks, frost and rime. It sits on the ground (decals, the court's height), fades in seconds and never follows the aim.
7. **Shape is the delivery's:** a line, a solid thing, a ring, a cone. No extra streaks or outlines to explain the shape (the user's note on the fire); the body's own edge is the shape.
8. **Runes add layers, not only size:** a halo, a hotter core, taller crystals, a crater; five should add something the others don't have.

## How buildable the family is

All four come apart into the kit's layers: stretched particles (cores, sparks, shards, embers), toon cells from painted sheets (flame, dust, mist, crystals), ground decals (char, cracks, frost) and pool lights. Two things the kit doesn't have yet:

- **A straight strip for the beam:** a camera-facing quad from the staff to the hit with a look function across it. Small; it's a beam, not a bending ribbon.
- **Meshes in the effects for the rock:** a boulder model that tumbles on the missile's path. The kit can draw it as an ordinary scene mesh; it just isn't part of the effect families yet.

The art to paint (Codex sheets, as the fire's): toon flame (exists in the fire round's sheets), dust puffs, shards, ice crystals, rime.

## For the review page

One per spell to pick the tone, then the alternatives:

- Arcane: **toon-beam-3** (and crisp-beam-1 as the alternative).
- Earth: **toon-rock-3** and **toon-impact-2** (chunky-impact-1 as the alternative, noted as better for the quake).
- Cold: **toon-nova-1** (crisp-nova-1 as the alternative).
- Family: **toon-sheet-2**.

The rest (toon-beam-1, -2, -4, toon-rock-1, -2, chunky-rock-1, toon-impact-1, toon-nova-2, toon-sheet-1) are kept as takes.

## The build: the Frost ring (2026-11-25)

The user picked the **crisp** take, [crisp-nova-1](../reference/spell-concepts/cold/crisp-nova-1.jpg), over toon-nova-1: "it feels a bit intense. Would have to see it in motion though. But the vibe is good." So: the crisp vibe (a thin, glassy, serrated front that *sweeps*, not a wall that hits), toned down (less glow, fewer sparkles, a smaller bright area, dimmer light, mist only at the edge). Built on branch `p3d-cold`: `game/packages/client/src/view3d/fx/cold.ts`, on a ring primitive the other rings can share, `fx/nova-ring.ts`. Films: `npm run clip:cold3d` (`scripts/cold3d-clips.mjs`, MP4s and stills in `game/shots/port-3d/tone/cold/`). No painted sheet: the front and the mist are meshes cut and shaded in their shaders. After the user's verdict on the built fire ("a very obvious cluster of opaque sprites"), nothing here is a cluster of sprites: the front is one mesh band, the mist a second, the rime a decal, and the only particles are a few glints.


### The spec

| Field | |
|---|---|
| **Job** | "I froze everything round me": the sim hits the whole disc at once (radius 3 u + 0.6 a rune, chill twice a hit's); the front shows where, travelling out to exactly that radius. The rime says where it happened for a few seconds after. |
| **Silhouette** | One connected ring of ice teeth, knee-high at most (0.66 u at one rune, +0.12 a rune), sharp crystals of mixed heights over a low connected band, leaning a little outward. A pale disc of rime inside it. |
| **Movement** | The front sweeps out fast and eases into the radius (the pixel game's timing: 0.38 s to a 3 u ring, a bigger ring slower in proportion, so the front always moves at one speed). Its teeth break one by one where it stops, each throwing a few slivers out and up that fall. It follows a walking caster most of the way (0.8, as the pixel game); the rime stays where it was cast and melts in patches. |
| **Colour** | Teeth: three stepped toon bands, deep cyan-blue at the foot, cyan, pale cyan at the top, stepped again by facet (the face left of each tip lit), a white band under a soft translucent outline, a dark steel line at the foot. Rime: a cool grey-blue film with a few fine white cracks. Light: a thin cool band on the floor under the front, one dim cyan spell light while it runs. |
| **Timing** | Front: full radius at 0.38 s × r / 3 u; teeth break from 0.86 of that, gone by 1.3. Glints: 0.45 to 0.8 s each. Mist: rises with the front, rolls on outside it, thins away within 0.9 s of the break. Rime: whole for 1.1 s, melted by 3 s (+0.25 s a rune). |
| **Layers** (floor up) | rime and the band of light (one ground decal); mist (a low translucent ring band just outside the front, eroded by rolling noise); the front (one ring mesh, nearly opaque); glints (a few glassy slivers off the breaking teeth); one spell light. |
| **Runes** | A bigger ring (the sim's), taller teeth, a taller mist, more glints (8 + 3 a rune), a thicker rime that lasts longer. Five: the ring stands a moment (half its sweep time) before it breaks. |
| **Budget** | Per ring: 4 draw calls (front, mist, glints, decal); 384 + 192 ring quads, 24 glint quads; a decal of about (2r + 8)² / 0.25 cells, built once. Eight rings at once at most. |
| **Not** | Not a wall that hits (toon-nova-1's tall crystals), no bloom or wash of cyan light, no sparkle field, no mist inside the ring. |

### What the rounds taught

1. **See-through ice over warm stone mixes to grey.** The first front, at 0.4 to 0.7 alpha, read as grey spikes: the court's orange showing through a cyan body averages to grey. Nearly opaque (0.85 to 0.95) with a brighter cyan makes it ice. "Glassy" comes from the facets, the streaks and the white edge, not from transparency.
2. **Teeth need a body under them.** Spikes on a line read as a fringe; a low connected band under the teeth (0.3 of the height) and fuller teeth (a softer profile) make it one surface going outward.
3. **Ridged noise makes a maze.** Rime veins from ridge noise at one frequency drew a labyrinth over the whole disc. Fewer, lower-frequency cracks, masked in patches, and a fine grain under them read as frost.
4. **Mist at the edge is easy to overdo.** As puffs at 0.26 alpha it made a milky halo round the ring that hid the front's foot. It's now a ring band of its own (no puffs to count), eroded by noise, at 0.22 alpha at most.
5. **Glints must be about 0.1 u to show at the game's 30 u**; at 0.05 they vanished.
6. **pow() of a negative base is NaN, and NaN draws black.** The mist band's top, a hair over its height, drew a dotted black circle until the height was clamped.

### Against the concept (`court-n3-t0.4.png`, `lab-n3-close-t0.3.png`)

- Reads as cold, as one ring going outward, and sweeps rather than hits: yes. The serrated teeth, white edge and frost film are the concept's.
- Much quieter, on purpose: no blue glow round the foot, little mist, a dim light. In the court at 30 u the front is a thin bright line; whether that's "toned down" or "too quiet" is the user's call in motion.
- The rime is faint on the court's own stone (it's warmer and more textured than the lab's paving), and gone from view by about 2 s there.
- Smaller than the painting: the painting's ring is about 2 wizard heights out at three runes; the sim's is 4.2 u, and that's what's drawn.
- The teeth are cut in the shader, so they are flat facets on one band; from the side they have no depth. At the game's camera that doesn't show.

### The ring primitive (for Fire, Water, Life and Arcane)

`fx/nova-ring.ts`: one upright band round a centre in one draw call, its base on the floor (64 height samples a frame), its top leaning out; the family writes one fragment function `vec4 look(vec2 p)` of the angle round and the height, and cuts its own top edge (teeth, flame tongues, a wave's crest). With a ground decal under it and particles off it, that's the whole nova form. The caster's path is kept per sim tick and cut back on a rewind (`ColdNovas` in cold.ts), so a ring that follows its caster stays stateless in the kit's sense; the next ring can lift that part out as it is.

### Reproduce it

- 1, 3 and 5 runes at the game camera: `cast3d.html?spell=cold&form=area&view=30` (and `spell=cold,cold,cold`, `spell=cold,cold,cold,cold,cold`), live (it loops every 4 s), or frozen with `&t=0.3`.
- Walking: `cast3d.html?spell=cold,cold,cold&form=area&view=30&scene=empty&move=1`.
- The stand-in instead: `&standins=all`.
- In the court: `play3d.html?runes=1`, press R three times and release Shift+LMB with the cursor on yourself (the ring), or `play3d.html?shot=cold&cam=30` for the still.

## The build: the Earth rock (2026-11-25)

The user picked [toon-rock-3](../reference/spell-concepts/earth/toon-rock-3.jpg) for the flight and [toon-impact-2](../reference/spell-concepts/earth/toon-impact-2.jpg) for the impact: "Toon looks ok, though this rock is very big, I'd expect this to be one with many rock elements. the impact looks a little weird". Read as: the painting shows a many-rune rock, and one rune should be small. Built on branch `p3d-earth`: `game/packages/client/src/view3d/fx/` `earth.ts` (tracking, the rock, the wake, grit), `earth-impact.ts`, `rock-mesh.ts`, `dust-mesh.ts`, `earth-sheets.ts`. Shots and clips: `npm run shot:earth3d` (add `--clips` for the clips), into `game/shots/port-3d/tone/earth/`.
### The spec

| Field | |
|---|---|
| **Job** | Who threw a heavy thing where, and what it broke. A missile, not a quake: the stone is the rock's colour and flies out of the rock, never up out of the floor. |
| **Silhouette** | A low-poly grey-brown boulder with hewn facets and a dark rim, tumbling forward, its shadow under it; a tube of ochre dust back to the staff. The impact: the rock breaking into a few big chunks and many chips, a low ring of dust rolling out, a star of dark cracks. |
| **Size** | From the sim. The sim's rock is a 0.3 u circle at any size; its damage is n^rockExp (`config.ts`, 1.3) times its charge (a tap is half). The drawing takes the damage as mass: radius 0.34 × cbrt(n^1.3 × charge), so one charged rune is 0.34 (about the hit circle) and five 0.68; a tapped rock is 0.8 of that. |
| **Movement** | Flies at the sim's speed (12 u/s tapped, 20 charged), tumbling about a turn per three widths. The wake hangs where the rock passed and thickens, sinks and erodes away over 0.7 to 1 s. Impact: chips fly 0.3 to 0.8 s and sink away; the ring rolls out fast and slows (1.5 s); the cracks run out in 0.12 s, hold 2.2 s and are gone by 3.2 s. A jolt of the view for 0.3 s. |
| **Colour** | Stone grey-brown with lighter and darker facets, three toon light steps and a dark rim. Dust ochre-brown, darker than the floor, a soft lit top and shaded folds. Cracks near-black brown. No light of its own. |
| **Runes** | A bigger rock, a thicker wake, more grit and chips, a wider ring, longer cracks; four adds a fast thin shock ring, five a dark crater in the cracks. |
| **Charged rock** | The sim's fully charged rock pierces (`effects.ts`): each body it goes through gets a small impact (chips and a burst of dust, no floor marks), and the full impact is where it finally ends (a wall, or the end of its 28 u flight, where it lands). |
| **Budget** | A rock: 1 mesh (80 faces); the wake 1 mesh (48 × 14 quads); grit up to 160 instances, shared. An impact: up to 37 shard instances, 3 dust meshes, 1 decal. |
| **Not** | Not the floor erupting (the chunky take, kept for the Earthquake); not a pile of dust sprites. |

### What the rounds taught

1. **Painted puff sprites read as a pile of bubbles.** The first wake used a Codex sheet of toon dust puffs (`raw/earth-dust-1.png`, kept): at every alpha and size they read as stacked, outlined blobs, the fire's "cluster of opaque sprites" failure. The dust is now **noise-eroded meshes** (a tube along the flight, a torus for the ring, a blob for the burst) with 3D noise fixed in the world: the outline is the noise's, so no shape repeats, and the erosion threshold climbing with age turns the body into wisps.
2. **Hard toon steps on dust read as mud.** From the game camera nearly every visible face looks at the sun, so lighting by the normal alone is flat; the noise's depth has to carry the light (lobes lit, folds shaded). Hard steps then gave a camouflage pattern; soft bands and a translucent edge read as dust.
3. **The rock is a real mesh in the world scene** (in the spell lights' group), so it shades like the court and casts a shadow: that shadow is half of what makes a small rock read as in the air.
4. **The cracks want a painted star.** A Codex sheet of four crack stars (`earth-cracks.png`), drawn dark on a floor decal, reads at once.

### Against the concept

- Flight: the rock, its dark underside and its shadow match. The wake is thinner and flatter than the painting's chunky billows, and paler where it thins: it reads as dust and not as sprites, but it lacks the painting's volume from this camera.
- Impact: shards, ring and cracks as asked, and no light. The ring reads as a soft dust ring rather than the painting's chunky rolling puffs; at five runes it is wide.
- Still open: the dust's volume (more height to the tube and the ring, or a lit version that casts shadows), and whether the view jolt is wanted (it moves the whole camera: 0.02 u at one rune, 0.18 u at five).
