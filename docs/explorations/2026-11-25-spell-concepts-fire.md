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
