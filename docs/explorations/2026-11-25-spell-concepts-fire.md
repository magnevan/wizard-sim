# Fire spell concepts for 3D: seven directions (2026-11-25)

The user rejected both first 3D fires from the [effects kit spike](2026-11-25-fx3d-spike.md) (2026-11-25): "Neither of these look good. I recommend generating some art with codex, and drawing inspiration from that." This round is that art: Codex paintings of the Fire spray in the court, at the game camera, in seven styles, then the burning floor and the Fire ring for the strongest two, and layer sheets to build from. Concept art only; nothing here ships.

Images: [`docs/reference/spell-concepts/fire/`](../reference/spell-concepts/fire/), named `<direction>-<subject>-<n>.png`. Prompts and how they were written: `tools/concept-gen/prompts/2026-11-25-spell-fire/` (`make.py`). Every prompt repaints `tools/port-3d-review/img/plaza-26.jpg` (the court at the 26 u camera, two wizards, a row of goblins) and adds one effect, so the images differ only in how the fire is drawn.

## What the rejected looks got wrong

- **A (code-shaped soft particles):** read as orange smoke. No edge, no core, no shape; the fan dissolved into a cloud with grain in it.
- **B (painted flame sprites):** read as fire, but as a bonfire of separate flames rather than one jet, with a hollow in the middle of the fan, and it stood up off the floor like a hedge.
- Both share a third problem the concepts make obvious: **the court's floor is warm pale orange**, so an orange effect without a dark or white value in it sinks into the stone. Every strong image below gets its contrast from something that is not orange: a white-hot core, a dark red rim, dark smoke, or a charred floor.

## The directions

The rubric is the one in [vfx-workflow.md](../vfx-workflow.md). "Buildable" is judged against the kit in `game/packages/client/src/view3d/fx/`: stateless shader particles (camera-facing or upright quads, stretched along their motion), premultiplied blending, ground decals and a pool of eight spell lights. It has no ribbon (trail-mesh) primitive yet.

| Direction | Best image | Read |
|---|---|---|
| **Toon volume** | [toon-spray-2](../reference/spell-concepts/fire/toon-spray-2.jpg) | The best fire. One stream from one point: a white-hot core leaves the staff, swells into a thick rolling body with soft toon shading and a red rim, and curls into dark smoke at the far end. A warm pool of light on the floor. |
| **Hybrid** (toon body, jet core) | [hybrid-spray-1](../reference/spell-concepts/fire/hybrid-spray-1.jpg) | Round 2's mix of the two leaders. Straight white streaks at the staff fan out to the cone's exact edges, then flame, then smoke. The most readable hit shape of all. Take 2 buries the far end in smoke. |
| **Magicka jets** | [jets-spray-1](../reference/spell-concepts/fire/jets-spray-1.jpg) | A perfect fan: hundreds of straight streaks from one point, flames at the far edge. Reads as speed and pressure and matches the sim's cone exactly. Take 2 drifts into a sparkler. |
| **Painted ribbons** | [ribbons-spray-2](../reference/spell-concepts/fire/ribbons-spray-2.jpg) | Clean, graphic, one material: braided flame ribbons from the staff. But flat, like a decal painted on the stone, and it splits into two lobes (a heart) instead of filling the cone. |
| **Dragon breath** | [breath-spray-1](../reference/spell-concepts/fire/breath-spray-1.jpg) | A molten jet with globs splashing off it. Distinctive, but it reads as lava or molten metal, not fire. That look is better kept for the flame arc ("molten steel flying") or Earth + Fire. |
| **Cel, hard edges** | [cel-spray-2](../reference/spell-concepts/fire/cel-spray-2.jpg) | A flat comic sticker with diamond sparks. Very readable, but it doesn't belong in a lit 3D court: it looks pasted over the render. |
| **Embers and haze** | [embers-spray-1](../reference/spell-concepts/fire/embers-spray-1.jpg) | A sparkler: a spray of sparks and a dark scorch cone. Too little fire to say "fire", and the heat haze doesn't show at this scale. |

### Against the rubric

| Check | Toon | Hybrid | Jets | Ribbons | Breath | Cel | Embers |
|---|---|---|---|---|---|---|---|
| Readable | yes | yes, best | yes | yes | mostly | yes | weak |
| Silhouette (one shape) | yes; far end lumpy | crisp cone | crisp cone | two lobes | yes | yes | yes |
| A material, not objects | yes | yes | yes (streaks merge) | yes | yes | yes | no, sparks |
| Element (fire, not energy) | best | yes | yes, a bit "energy" | yes | lava | cartoon | sparks |
| Stands out on warm stone | white core, smoke | white core, smoke | white core | dark rim | white core | outline | dark char |
| Clarity (goblins still visible) | yes | take 1 yes, take 2 no | yes | yes | yes | yes | yes |
| Fits the 3D court | yes | yes | yes | flat | yes | no | yes |

Two things the paintings can't show: whether the middle moves (alive), and whether five runes give awe. Both depend on the build. Neither leader shows the far end as a wall of flame; the painted three-rune size is about right.

### What each would fix

- **Look A's smoke:** toon and hybrid fix it the same way: a hard white core at the staff, flame with a defined rim, and smoke only at the far end, darker than the floor, never mixed into the flame.
- **Look B's bonfire and hollow:** every leader is *one body that starts at one point*. In the jets and hybrid, the stream is visibly continuous from the staff to the far edge, because the fan is filled with stretched streaks rather than round flames. That's the missing piece in B: B had no layer travelling along the cone, only flames standing in it.

## Burning floor and Fire ring

- **Floor:** the first prompt gave a campfire ([toon-floor-1](../reference/spell-concepts/fire/toon-floor-1.jpg): one tall flame in the middle, the bonfire again). Rewritten as "a low, wide carpet of flame... like burning oil spilled on the stone", it gave [toon-floor-3](../reference/spell-concepts/fire/toon-floor-3.jpg): one patch of short, even flames on a charred bed with a dark ragged rim and a thin smoke column. That's the one to build. [jets-floor-2](../reference/spell-concepts/fire/jets-floor-2.jpg) is almost all decal (glowing cracks in char, hardly any flame): the right *bed* for the toon floor, the wrong floor on its own ("a picture laid over the floor").
- **Ring:** both are good and both read as one surface going outward, as the [novas are one surface](../decisions/README.md#2026-11-10-novas-are-one-surface-not-a-row-of-pieces) rule wants. [toon-ring-1](../reference/spell-concepts/fire/toon-ring-1.jpg) is a rolling wall of flame with smoke on its outer side and a charred disc inside. [jets-ring-1](../reference/spell-concepts/fire/jets-ring-1.jpg) adds radial streaks on its inner side that show the outward motion, which is the better read in a still and probably in motion too. Their mix is the target: toon's wall, jets' radial streaks behind it. [hybrid-ring-1](../reference/spell-concepts/fire/hybrid-ring-1.jpg) asked for that and is the best of the three: a starburst at the staff, fine streaks running out over a cracked, glowing disc, a wall of curling toon flame at the front with dark smoke rolling off its outer side. The smoke touches the goblins it is about to hit, which is right for a ring.

## The layer sheets

[toon-sheet-1](../reference/spell-concepts/fire/toon-sheet-1.jpg) and [hybrid-sheet-1](../reference/spell-concepts/fire/hybrid-sheet-1.jpg) break the leaders into core stream, flame body, edge licks, embers, smoke, ground scorch, light on the ground, one flame tongue's colour bands and the colour ramp, then reassemble them. Both came back exactly as laid out, with no labels.

- **The hybrid sheet is the one to build from.** Its core is a fan of fine straight white streaks; its flame body is a cone of flame that starts *on* those streaks; its scorch is a fan-shaped char with ember lines and its light a fan of warm glow (both kite-shaped, so a decal and a light, not particles). Assembled, the streaks run a third of the way out before the flame takes over, and smoke stays behind the far end.
- The toon sheet is the same layers with a single soft core and round scorch and light. Its assembled spray is lovelier but closer to a blowtorch: the cone edges are soft.
- Both ramps agree: cream white → pale yellow → amber → orange → deep red, five steps. The smoke is warm grey-brown, never neutral grey.
- The cells sit on dark grey, so they're references for painting our own flame sheet (as look B's were), not sprites to cut.

## How buildable each is

All seven come apart into the same few layers. What changes is which layer carries the look:

| Layer | Build with the kit | Notes |
|---|---|---|
| **Core stream** (white-hot, from the staff) | camera-facing quads stretched hard along their motion (the kit already stretches by evaluating the particle 0.03 s earlier); additive (alpha 0) | This is the layer B lacked. Long, thin, fast, many. Jets and hybrid are mostly this layer. |
| **Flame body** | soft camera-facing quads with a painted toon flame cell (Codex sheet as in look B), ramp-tinted by age, alpha-covering with a bright rim in the look function | Toon and hybrid. Big overlapping quads so it fills; born a third of the way out so the core shows first. |
| **Edge licks** | the same sheet, smaller, pushed out to the fan's edges and stretched | Gives the cone its straight sides. |
| **Smoke** | covering (alpha 1) dark grey-brown quads off the far end, rising and growing | The contrast layer on warm stone. Cap it: hybrid take 2 shows smoke hiding the goblins. |
| **Embers** | tiny stretched additive quads, as now | Restraint: a few. |
| **Scorch** | a ground decal (exists) with glowing cracks that fade to char | The jets-floor-2 painting is this layer. |
| **Light** | the spell-light pool (exists) plus a warm additive fan decal | Every good painting has this; it's what makes the fire feel hot in a lit 3D scene. |

- **Toon, hybrid, jets:** fully buildable with the kit as it is. The work is the art (a toon flame cell sheet from Codex) and the layering, not new code.
- **Ribbons, breath:** want a ribbon primitive (a strip mesh along the aim trail with a scrolling painted texture). The aim trail already holds the data. It's a new primitive, so it's a bigger step and harder to get to bend like a hose.
- **Cel:** wants a flat shape with a stepped ramp: buildable as a decal-like mesh plus a posterised look function, but it fights the lit scene.
- **Embers:** the cheapest to build and the weakest result.

## Recommendation

**Build the hybrid: toon's body with the jets' core.** Start from [hybrid-spray-1](../reference/spell-concepts/fire/hybrid-spray-1.jpg) and [toon-spray-2](../reference/spell-concepts/fire/toon-spray-2.jpg) together:

1. A white-hot core of stretched streaks from the staff, fanning to the sim's cone edges (fixes B's hollow and gives the shape).
2. A toon flame body from a third of the way out, painted cells with a red rim, overlapping heavily (fixes A's smoke: it reads as fire).
3. Dark smoke off the far end only, capped so the goblins stay visible.
4. A warm light fan and pool on the floor.

The floor follows [toon-floor-3](../reference/spell-concepts/fire/toon-floor-3.jpg) (short even flames over [jets-floor-2](../reference/spell-concepts/fire/jets-floor-2.jpg)'s cracked char), and the ring is [hybrid-ring-1](../reference/spell-concepts/fire/hybrid-ring-1.jpg): toon's wall with jets' radial streaks. Build from [hybrid-sheet-1](../reference/spell-concepts/fire/hybrid-sheet-1.jpg). Reasons: it scored best on the readability checks the user cares about most, it's the only direction that fixes both rejected looks at once, and it needs no new primitive, only a new painted flame sheet and re-layering in `fx/fire.ts`.

The cost: the core streaks push toward "orange energy" if they dominate. Keep them to the first third of the cone and let the flame body take over.

**For the user's review page:** toon-spray-2, hybrid-spray-1, jets-spray-1, ribbons-spray-2, breath-spray-1 and cel-spray-2 (one per direction, to pick a style), then toon-floor-3, hybrid-ring-1 and hybrid-sheet-1. The rest are kept as takes.

## The build: toon volume (2026-11-25)

The user picked **toon volume** ([toon-spray-2](../reference/spell-concepts/fire/toon-spray-2.jpg)), without the hybrid's streaks ("I don't think it's necessary to clarify the cone to this degree"), and [toon-floor-3](../reference/spell-concepts/fire/toon-floor-3.jpg) over [jets-floor-2](../reference/spell-concepts/fire/jets-floor-2.jpg)'s cracks for the floor. Built on branch `p3d-fire`: `view3d/fx/fire.ts` (the spray), `fire-floor.ts`, `fire-sheets.ts`. Shots: `npm run shot:fire3d` (`game/shots/port-3d/fire/`).

**Painted sheets** (Codex, `game/content/generated/fx/`, prompts in `prompts/`, originals in `raw/`, `prep.py` makes the game sheets): `fire-rolls` (16 rolling flame masses), `fire-smoke` (16 pale puffs, tinted dark in the shader), `fire-carpet` (16 low clusters of short flames, cut to 2:1 cells), `fire-cracks` (a tileable char bed with glowing cracks). The edge licks reused look B's `fire-wisps`. Since the mesh round below, only `fire-smoke` and `fire-cracks` are drawn; the flame sheets (and `fire-licks`, 16 long tongues from the sprite tuning pass) stay on disk. Each sheet came back usable on the first take.

### The spec

| Field | |
|---|---|
| **Job** | Who is burning what: one stream of flame from the staff, exactly the sim's cone, stopping where the sim stops it. The floor says "don't stand here" until it dies. |
| **Silhouette** | A narrow white-hot core from the staff that swells into one rolling body filling the fan, with a dark red outline and a lumpy, billowing far end (a "heart" at 3 runes); dark smoke rising off the far end only. Floor: a low ragged carpet on a charred disc. |
| **Movement** | Fast and stretched near the staff (masses trail 0.06 s of travel), slowing and turning (rolling) as they billow out. Each particle keeps its birth aim, so a sweep bends like a hose. Floor flames flicker in place and never travel. |
| **Colour** | Core cream-white; body cream-yellow near the staff, orange, deep orange-red at the far end; rim deep red; smoke warm near-black brown; floor char near black with orange cracks. Contrast on pale stone comes from the rim, the smoke and the char, not from more orange. |
| **Timing** | Full length in about 0.4 s; masses live 0.65 to 0.8 s, smoke 1.3 s. After the channel stops, what's in flight finishes. Floor: a lit cell flares up over 0.4 s, burns, sinks over its last second (the sim's `FLOOR_FADE`), and its char lingers 3 s. |
| **Layers** (back to front) | smoke; the outline (the body's tubes again, bigger, deep red); the body (five overlapping tubes, a mesh, since the mesh round below; before it, sprites); core; embers; the light: a warm pool and fan decal on the floor plus two spell lights. |
| **Runes** | The sim's wider, longer fan; more masses (290 a second at 1 rune, 530 at 5); a longer core (0.3 to 0.46 of the way); more smoke and embers. Five is a wall of fire with a smoke plume. No blue-white birth any more (the spike's pink smudges). |
| **Budget** | Since the mesh round: the body is 10 draw calls of a 56 × 40 tube (about 45k triangles, 5 tubes × 2 shells), plus core 72, smoke 40, embers 80 quads and the fan. Floor: one sheet at 0.1 u over the burning box, and 2 embers a burning cell. Cut first in a crowd: the side tubes' outlines, then the side tubes. |
| **Not** | Not orange smoke (A), not a bonfire of separate flames (B), not streaks. |

**A floor cell's age.** The sim keeps only a burning cell's life left, and its starting life depends on the caster's linger, so it can't be worked back. `FireFloor` notes the sim time it first saw each cell lit and the time it saw one go out. A cell new since the previous frame (under 0.25 s ago) is lit now and grows in; one the view finds after a gap (its first frame, a frozen shot, a jump) is treated as burning for a while and drawn grown. Notes later than the clock (a rewind) are dropped and noted again.

### What the rounds taught

1. **Cell size is the whole look.** At half the fan's width a mass reads as a cauliflower and hides the goblins (round 1); at about a fifth of the local width (0.16 to 0.28 × the fan's half-width, more of them) the masses merge into one body and the goblins show over it.
2. **Fill the fan's straight edges from the start.** Spreading masses across 70% of the half-angle right at the staff, not 25%, gives the cone its sides; narrowing them near the staff made a ball on a stick.
3. **Let the painting carry the saturation.** Colouring the body from a position ramp instead of the painted texture (to make masses blend) washed it to beige cloud after the tone map: the same failure as look A. Tinting the painted colour keeps it fire.
4. **A rim made from the body's own particles** is cheap and gives the concept's outline: same seed, 10% bigger, deep red, drawn first.
5. **Stretch along motion** turns round masses into tongues where they're fast (near the staff) and leaves them round where they've slowed: the toon concept's "jet into billow" in one rule.
6. **Floor carpet:** wide 2:1 clusters on a grid of cells read as rows of stripes; narrower clusters (aspect 1.1 to 1.6) scattered ±0.45 u, three a cell, read as a crowd of tongues.
7. **A bug both looks had:** on a channel's first tick the sim's channel end reads as the room's origin, so a few particles flew 15 u away in the court. The reach is now capped at the sim's range.

### Against the concept (court, 30 u, `court-n3-vs-concept.png`)

- Reads as fire, one mass, toon-shaded, with a red rim and smoke: yes.
- Shorter and wider than the painting: the sim's three-rune cone is 96° (the painting is about 65°), and in the shot the goblins have walked into it, so the channel stops at about 3 u. That's the sim's shape, drawn faithfully.
- The white core hides behind the caster from the game camera when he faces north; it shows facing any other way.
- The top edge is still a little lumpy (a row of puffs) where the painting has flame licks; the licks only show while the stream grows.
- The warm light on the floor is weaker than the painting's.

### The body as one volume: a mesh, not sprites (2026-11-25, branch `p3d-fire2`)

The user on the sprite build (`court-n3-vs-concept`): "It's a very obvious cluster of opaque sprites, not at all similar to the concept." That's the method, not the tuning: stacked sprites can't make the painting's one continuous volume however they're shaped. A first tuning pass on branch `p3d-fire2` (a new Codex sheet of long tongues, `fire-licks`, stretched along their flight and lifting at the tips) made the body read as flame tongues, but still as many of them (its shots are kept in `game/shots/port-3d/tone/fire/sprites/`). It was replaced the same day by the standard stylised-VFX build:

- **The body is a mesh** (`view3d/fx/fire-body.ts`): five overlapping closed tubes from the staff's tip to where the sim's channel stops, a broad middle one and narrower ones fanning out to the cone's sides (one wide tube read as a paper fan; the lobes give the painting's swelling "heart" with tongues at its sides). Each ring is placed in the vertex shader: it widens with the sim's cone, is flattened over the floor, narrow at the staff and swelling toward a rounded head, and follows the aim the flame at that distance left the staff with (`aimAt`), so a sweep bends it like a hose. Noise flowing outward pushes the surface in and out (billows), and a finer noise lifts the top toward the far end (tongues licking up; heat rises).
- **Its shader** scrolls two layers of value noise outward along the length, finer round the tube than along it, so the grain streaks outward. Toon bands with hard-ish steps (white-hot, yellow, orange, deep red) come from the distance out, the view angle (surfaces turning away are cooler) and the noise. Where the noise is low on grazing surfaces, at the head and at the tail, it erodes away, so tongues break the silhouette. Covering in the middle, translucent toward the edges.
- **The outline** is each tube again, 16% bigger, deep red and eroded a little less, drawn before all the flame shells, so a dark red edge shows round the whole mass.
- **Stateless:** a pure function of the channel's time and end, runes, the aim trail and a seed, so frozen frames and rollback draw it exactly. Its length runs out over 0.4 s; it swells over the first second; when the channel stops, its tail leaves the staff and follows the head out.
- **Particles only for the secondary layers:** the white-hot core of soft glows at the staff, embers, and the smoke off the far end (now softer and more translucent). The sprite rim, masses, tongues and edge licks are gone.
- **The floor** (`fire-floor.ts`, against [toon-floor-3](../reference/spell-concepts/fire/toon-floor-3.jpg)) had the same problem (a carpet of painted flame sprites). Its flames are now one sheet: a fine grid (0.1 u) draped over the burning cells whose points rise into tongues where a noise rising through it peaks, tallest in the patch's middle, cut into the same toon bands (hot at the base, deep red at the tips), shaded by its own slope, eroded at the tips, and thinned between tongues so the charred bed and its glowing cracks show through. `GroundDecal` takes an optional vertex shader for it (`decal.ts`, `vertex`).

The rest of the brief:

1. **The core behind a caster facing away** (the court shot faces north): the core is drawn 1.1 u nearer the camera along its own line of sight (it stays put on screen), so the staff's white-hot start shows over the caster's hat and back.
2. **Stronger floor light:** the fan decal is a glaze (it takes a little of the stone's colour away and adds saturated firelight), spills about a cell past the flames' outline and no further, and runs out with the flames over 0.45 s instead of lighting the whole cone at once. The two spell lights are brighter, the far one lower.
3. **The court shot** (`play3d.html?shot=fire`) holds the goblins where they stand (`hold`, sim `devStage`), so the spray shows at its full length. `?ticks=` sets how many ticks a shot's casts run, which makes a court clip out of shots.
4. **The sim's cone and reach are untouched.**

Clips: `npm run clip:fx` (`scripts/fx-clip.mjs`: a live lab page on a virtual clock, one frame at a time, so it plays at real speed; or `--ticks` for a clip made of shots), in `game/shots/port-3d/tone/fire/clips/`.

**What the rounds taught:**

- A mesh with eroded toon bands reads as one volume at once; the work moves from "how big is each piece" to "what's the silhouette", which the lobes and the erosion carry.
- One wide tube over a 96° cone reads as a paper fan or cloth: the outline needs lobes and tongues, not just a noisy edge.
- Noise stretched across the stream (fine along it) reads as marble; stretched along it (fine round it), as flame tongues streaming out.
- Pale yellow is the floor's own colour: the body has to sit mostly in yellow-orange and orange, with white only near the staff, or it sinks into the stone (as look A did).
- Height moves a volume up the screen at this camera: with the body's axis at the staff's height all the way out and a tall section, it drew about 2 u past the far edge of the sim's cone and left its near half empty (`fx3d.html?hit=1`). It now comes down to rest on the floor by mid-way, with a lower section, and covers the cone.
- When the channel stops, the tail running out after the head left a thin crescent at the far end for a second; the body now fades over 0.4 s as its tail goes.

**Still different from the painting:** the sim's three-rune cone is 96° (the painting's about 65°), so the spray is wider and shorter. The body is flatter and more even in value than the painting's deep rolling forms, with less fine detail inside; a stronger light-side band and a third, finer noise layer are the next knobs. Painted noise (a Codex flame texture scrolled through the mesh) is the step after that, if procedural bands stay too plain. The floor's flames read as a low burning mass, not yet as the painting's distinct short licks.

### For a spell-look guide

- **Layers:** a hot core, one body, a darker outline, a non-orange contrast layer (smoke, char), light on the ground. Every good concept had all five.
- **Palette:** fire on warm pale stone needs a dark value (rim, smoke, char) and a white value (core); orange alone sinks into the floor.
- **Scale:** a particle is a fraction of the shape it builds (here a fifth of the local width); bigger reads as objects, smaller as noise.
- **Contrast on pale stone:** covering alpha (0.95) for the body, not additive; additive only for the core.
- **Timing:** fast and stretched at the source, slow and round where it spreads; the floor flares in, holds, sinks, leaves char.
