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
