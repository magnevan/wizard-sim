# Guards, round 3: from static props to living conjurations (2026-11-17)

The wizard's guards went into the game as Blender props (`tools/sprites-3d/wizprops.py`; they were built in Blender rather than by Meshy, see [warband-art](2026-11-16-warband-art.md#the-wizards-weapons-and-guards-pictures-for-meshy-2026-11-17)). The user, looking at them in play: they are a direct, static render of the concept art and miss what moves in it. Flames are rigid cones, the Prism is a flat purple, the Leaf doesn't read as a leaf, and Ice is a blue shield held upside down. Guards should also be bigger and louder. This page is the plan to fix that. It covers the guards first; the weapons follow the same system later. It also covers how a guard shows more than one element.

Review: [Goblin Warband Art](https://claude.ai/artifact/4WNayLNFUL2TNuffPfTMsJ), section "Next: guards, round 3", marks `g3-<guard>` and answers `g3-q-*`.

## What's wrong, in one line

Each guard is one rigid mesh, with every part of the picture modelled, including the parts that should move. In the concept art, only the guard's **core** is solid. The flames, arcs, water and light around it are effects.

## The fix: three layers per guard

| Layer | What it is | Where it lives | Examples |
|---|---|---|---|
| **Core** | The solid part, the only static mesh: small and bold, so it reads at game size | Blender, `wizprops.py` | the gold buckler, the molten Ember disc, the metal hoop, the rock slab |
| **Shell** | Animated surfaces on the live model: a translucent shimmer, colours sweeping across, water flowing, cracks pulsing | three.js materials in `art/live3d.ts`, picked by the mesh part's name (`ward*`, `hue*`, `flow*`, `pulse*`) | the Mirror's ward, the Prism's rainbow, the Tide's flowing disc |
| **Emitters** | Pixel particles anchored to points on the guard | 2D in `view-structures.ts` | flame tongues round the rim, lightning arcing across the hoop, fog falling, spray, drifting leaves |

The shell goes through the same pixel pass as the model, so it pixelates the same way. The emitters already exist for every guard, but today each one has only the guard's middle as an anchor. They need the guard's **frame**: its centre, its two in-plane axes on screen, and a few named sockets (empties in Blender: `sock_rim_*`, `sock_core`, `sock_drip`). With the frame, a ring of arcs, a radial spray or a falling curtain follows the guard's tilt as he turns and blocks.

**Bigger and louder.** Bucklers grow about 1.3×. The tower guards (Earth, Ice) stand about shoulder height. Every guard gets a constant idle effect, not only a glow while blocking. A raised-guard pose comes with this pass (the arm still hangs down while blocking today). The tower guards ride at his side and come across his front only when he blocks, so they don't hide the body and weapon all the time.

## Guard by guard

| Guard | The user's vibe | Core (mesh) | Shell and emitters | New art? |
|---|---|---|---|---|
| **Mirror** (Shield) | Only the buckler's core is solid; the rest is a translucent shimmer, like the other Shield spells | A small gold buckler | A gold ward shell (bright edge, slow ripple) at about twice the buckler's width. It flares and ripples where a shot glances off. This is the same shimmer as the Shield barriers, so it reads as "Shield". | No (sheet C) |
| **Bulwark** (Earth) | Massive, imposing: a tower shield, not a buckler. Drop the magma, it overlaps Fire. | A tall slab of carved stone, shoulder height, a few set stones, no glowing cracks | Grit and dust falling from its edges. When blocking it plants on the ground with a dust puff. | Yes: tower shield, plus the infusion sheet (below) |
| **Ember** (Fire) | A small buckler, a magma core, the outer part fire | The molten disc only: dark rock with a pulsing hot core. The flame cones go. | Flame tongues all round the rim that rise upward (not radially), embers, a heat flicker. They flare on block and parry. | No |
| **Ice** (new guard, Shield + Ice) | A large ice shield, imposing and spiky; strong like Earth but trades defence for spike damage, leaning into caltrops | A big ice kite bristling with spikes, held point down (today's is upside down) | Glints, falling ice chips, a crack of shards on block | Yes |
| **Rime** (Frost, Shield + Cold) | A rimed metal shield with frost fog falling off it | A round steel-blue shield crusted with white rime | Cold mist falling off its lower edge and pooling at his feet, a few snow glints | Yes |
| **Spark** (Lightning) | Almost all VFX: a metal ring like a buckler's rim floating round the hand, lightning arcing between points on it | A thin metal hoop that floats and turns slowly. The spikes and the web go. | 4 to 6 jagged arcs between points on the ring, re-rolled every few frames, now and then one to the hand. On block, the arcs fill the ring into a web. | Small sketch |
| **Tide** (Water) | New art: like a fireman's water curtain, a continuous flow shooting out radially | A small spinning water core at the hand | A flowing disc of water (shell) spraying out radially, spray and droplets at its edge, a splash at the ground. On block, the jets push harder. | Yes |
| **Prism** (Arcane) | The concept is good, but in the game it's just purple; colours need to dance across it | The hexagon, as now | A rainbow band sweeping across the facets (shell), spectral glints on the edges. Its charge makes the sweep faster and brighter. | No |
| **Leaf** (Life) | The concept is good, but the render doesn't read as a leaf | A fan of three big leaves with pointed tips splayed outward, each split light and dark by its midrib, with a bigger vine and bud | The leaves rustle (a slow sway), plus drifting pollen and petals when it heals | No |

## Splitting Ice from Frost (a rules change)

Cold and Ice both lead to the Rime kite today (`guards.ts` `GUARD_OF`), so the Ice guard plays like a Frost guard. Ice's identity in the rules is damage and spikes (Ice shards, Caltrops, Shield + Ice is a spike wall that stabs whoever presses on it), so the guard should share it:

- **Rime** (Cold) keeps today's rules: chills melee attackers, a parry freezes, Ice slide, Skater.
- **The Ice guard** (Ice), a new guard: its block stops melee like the Bulwark's, but it has less HP and weaker resistances. A melee attacker that hits it is stabbed (physical). A parry bursts spikes outward and leaves a small patch of caltrops in front (`ZONE.caltrops`). Retreat drops caltrops where you stood. Passive: none, or a small stab to whatever bumps you.
- **What it costs:** a new `GUARD` id, a row in the resistance table, Tune entries, a golden-hash update and a decision-log entry. It is close to the Ember's thorns, so the difference has to stay clear: Ember burns whoever hits the block; Ice wounds more and leaves the ground dangerous, at the cost of defence.

## More than one element: the lead builds the guard, extras infuse it

A guard holds up to five runes, so it can carry Shield, its lead and up to three more elements. Today each extra is shown as a coloured arc on the rim, plus that element's particles (`art/accent.ts`). That shows an element is mixed in, but it doesn't change the guard's look. The plan is to tie how an extra shows to what kind of guard it joins:

- **Solid guards** (Bulwark, Ice, Rime, Leaf, the Mirror's buckler) take an extra **into their matter**. Fire: glowing magma veins (so the magma the user liked comes back, as Earth + Fire). Cold: a rime crust on the top edge. Ice: spikes out of the edges. Lightning: arcs jumping between studs. Water: a wet sheen and drips. Arcane: carved runes glowing. Life: moss and vines. Shield: a gold rim. Each infusion is a few small mesh parts per guard, hidden until needed (as the props are today), plus an emissive tint and that element's emitter.
- **Energy guards** (Ember's flames, Spark's arcs, Tide's stream, Prism's light, the Mirror's ward) take an extra **into their energy**: part of the flames, arcs or water take its colour and behaviour. Spark + Fire: orange-tipped arcs that drop embers. Tide + Cold: a slushy stream that sheds flakes. Tide + Fire: the spray steams.
- **At most two infusions show**, the ones with the most runes first, then the element order. A third extra stays as a rim arc. One rune shows a hint; two show it in full (the same half and full steps as `ARMS.mixShare`).
- **Earth goes first**, because the user wants it to take on other forms well. All eight Bulwark infusions get drawn on one sheet before they're built, and they test the system.

Authoring all 8 × 9 pairs by hand is too much work. The solid guards share one recipe per extra, adapted to each guard's sockets, and only Earth gets bespoke parts at first.

**Weapons later, the same way.** The sockets there are the blade's edge, the tip and the grip. Solid weapons (maul, spear, bow, trident) take extras into their matter, and energy weapons (the flame blade, the whip's lash) into their energy.

## Order of work

1. **Groundwork (code, free):** the guard frame and sockets projected each frame; shell materials picked by part name in `live3d.ts`; infusion parts shown by the seat's extras; Stage panel buttons for a guard with extras mixed in; `arms-shots.mjs` writing short GIFs, because these guards have to be judged in motion.
2. **Concept art (Codex, free, approved before building):** one sheet of the new guards (Earth tower, Ice spikes, Rime metal, Tide curtain, Spark ring) and one sheet of the Bulwark with each of the other elements infused.
3. **Guards that need no new art:** Mirror ward, Ember flames, Prism colours, Leaf silhouette, Spark ring. Reviewed as GIFs at game size.
4. **New cores from the approved art:** Bulwark, Ice, Rime, Tide, in Blender. If a primitive build looks too crude, Meshy could build one (about 15 credits each, asked first).
5. **The Ice guard's rules:** the split above, its decision log and the docs.
6. **Infusions:** the shared recipe, then the Bulwark's own parts.
7. **The raised-guard pose and the size pass,** then weapons on the same system.

## The user's marks (read 2026-11-17)

Every guard plan and the infusion plan are marked yes. Notes:

- **Ice:** keep passive damage on both. "Both ember and ice can do passive damage, just differentiated between elements and the fire version should be much more damage heavy while ice is more defense heavy." So the Ice guard keeps a passive stab (whoever bumps or hits it), and it stays the sturdier of the two. Ember stays the damage guard.
- **Shimmer:** only the Mirror has the Shield shimmer, not the others, not even while blocking. "They can have other element appropriate effects. Like some colored particles that burst out for that element." The generic energy face drawn while blocking is replaced by each element's own burst.
- **Leaf:** it gets a new mesh. The plan meant no new concept art, not no new model.
- **Size:** "Maybe the first, but I really have to see it in game to judge this." Build it, then show it in the game.
- **Mix:** two infusions are fine; more would be rare. **Tide:** try the leaning disc.
- **Budget:** Codex concept art is basically free and the Meshy plan is liberal, so generate more variants and use Meshy for the cores where it beats a Blender build. That changes the plan in step 4: the cores come from Meshy, built from the approved art, and Blender is the fallback.

Round 3 art (prompts in `tools/concept-gen/prompts/2026-11-17-guards-r3/`): two "vibe" sheets of the five new guards with their effects drawn in, two clean core sheets for Meshy, and the Earth infusion sheet.

## Built, first pass (2026-11-17)

- **Concept art (Codex, free):** five sheets, kept in `docs/reference/wizard-arms/r3/`: two "vibe" sheets with the effects drawn in (A: the wizard holding each; B: each alone, the Earth tower as a castle rampart), two clean core sheets for Meshy, and the Earth infusion sheet (plain, magma veins, frost crust, ice crystals, studs with arcs, wet with drips, glowing runes, vines and flowers). On the review page as `g3-art-*`.
- **Cores from Meshy (60 credits; balance 2,855 before):** the Earth tower, the Spike kite, the Rime shield and the Leaf fan, each `meshy-t2` smart topology at 3,000 triangles, textured by `meshy-n1` from its three-quarter view (`tools/sprites-3d/input/guards-r3/`, outputs in `output/guards-r3/`). `wizprops.py` `meshy()` imports one as a guard prop: it turns the core thinnest front to back (Meshy turns a three-quarter view about its upright axis), its picture-up toward the elbow, scales it, and shrinks its texture to 256 px. The primitive builds stay as `*_r2`. The Ember's flame cones are gone (only the molten disc is solid); the Spark ring is a bare silver hoop with six studs.
- **Upright guards:** every guard is a soft prop now (`~0.15`, axis picture-up), as the staff is: kept upright whatever the forearm does. Built along the forearm, the tower lay on its side when the arm was held out, and the old Rime kite hung upside down.
- **Shells** (`art/live3d.ts` `FX_GLSL`, by Blender material name): the Prism's rainbow sweeping across, the Ember core's hot pulse, the Mirror's halo as a dithered see-through ward with rings rippling out, the Tide's water flowing.
- **Particles** (`art/guard-fx.ts`, in the guard's plane through its projected frame `Anchors.guardFrame`): flame tongues rising round the Ember's rim with embers; lightning arcs re-rolled between points on the Spark ring, filling it into a web while blocking; mist falling off the Rime and pooling at the feet; ice chips and glints off the Spike kite; spray off the Tide's rim; pollen and falling leaves off the Leaf; grit off the Bulwark; spectral glints round the Prism. Blocking, every guard but the Mirror bursts its own element's particles (the energy face stays the Mirror's only).
- **Rules:** the Spike kite and Searing (decision log). Golden hash unchanged.
- **Shots:** `npm run build`, then `node scripts/arms-shots.mjs --guards` (new: each guard alone, 12 frames idle and 12 blocking).

Next: the user's marks on the art and the in-game look; the Tide's core and leaning disc, the Mirror's buckler from the core sheet; the infusion parts on the Bulwark; the raised-guard pose and the size pass.

## Second look (the user, 2026-11-18)

Notes on the first pass, and what changed:

- **"Overall shields can be scaled up a bit more still"; Spike "way too small", Prism and Leaf "too small", Spark "a little small".** Every guard is scaled in `wizprops.py` (`GUARD_SCALE`: Spike 1.8, Prism 1.7, Leaf 1.6, Spark 1.45, Ember 1.4, Rime and Tide 1.35, Mirror 1.3, Bulwark 1.25).
- **"Earth shield is held incorrectly."** Two causes: every guard hung flat against the arm with its face turned out sideways, so the camera saw the tower edge-on; and the Meshy tower, built from the three-quarter view, came out a thick block (0.71 by 0.87 by 1.0). Now every guard turns its face 0.8 rad toward the front (`GUARD_YAW`), and the tower was rebuilt from the front view (0.69 by 0.97 by 0.30, a slab; 15 credits; the first build kept as `bulwark-34.glb`).
- **"The shield outline that is shown through the character ... should probably be removed."** Removed (`view-structures.ts`).
- **"We need to create some defend animation where the character uses the shield."** Meshy's library guards (Block1, Block10, Shield Push Left; 9 credits, kept in `output/wizard/blocks.glb`) raise the forearm to the face, where the hat's brim hides it from our camera. So two clips were made with Meshy's text-to-motion (20 credits) and put on the wizard's rig (6): a buckler held across the chest (`guard-block.glb`) and a crouch braced behind a tower (`guard-brace.glb`), the loops `block` and `brace` (`roles.py`). The client plays one while the guard is up (`art/sprites.ts`; the Bulwark and Spike kite brace), fast to its held pose. The clip only moves the arm: `art/live3d.ts` `squareGuard` turns the guard upright and square to the body's facing and carries it to the front of the chest, by the block's ease. The export marks each guard's face normal (`PROP_FACE`, a marker child as the soft axis is); found on the way: a marker's position comes through in Blender's axes, so the client converts it (x, z, -y) as the geometry was.
- **Mirror:** the ward ring is half again as wide (0.30 to 0.46), its ripple softer (the rings read as a target).
- **Fire:** "more of a shield made of flames": tongues across the whole face in three rings (yellow heart, orange, red rim), and the rock's shell flickers between deep red and yellow instead of a glowing red disc.
- **Rime:** "the stippled blue area doesn't look like frost, and ... what's already fallen off shouldn't track with the character". Falling particles (mist, grit, chips, leaves) now start from where the guard was when they fell (`guard-fx.ts` keeps each guard's last 2.5 s of positions), and the mist is solid pale wisps that thin by shrinking, never dithered.
- **Prism:** "the color being static if you stay still, but ... affected by the normal direction". The shell now takes its hue from each facet's angle to the camera (the view-space normal), mixed in at 45 %, and the glints are rare.
- **Caltrops:** left for its own thread, with the Ice Place spell.

Meshy this round: 50 credits.

## Third look (the user, 2026-11-18)

- **"When defending with earth you put the shield inside your body ... When walking it clips into your face"; "the default shield position a bit higher up, and angled out to the side".** The guard is no longer placed by the forearm's every swing. `art/live3d.ts` `placeGuard` sets it by the body each frame: carried at the left (from the left upper arm), at chest height, turned out to the side and its top leaning out (`CARRY_*`); raised, square in front of the chest and further out by its own size so a tower clears the body (`BLOCK_*`); blended by the block's ease. The clips still move the arm. Casting looked right and is unchanged.
- **Ember:** "particle effects look weird when facing to the side ... give the shield some translucency". The flames' frame keeps its narrow side at least 0.6 of its wide one (`guard-fx.ts` `widen`), so edge-on they still form a shield, and the solid core is smaller (0.30 to 0.20), so the flames carry it.
- **Prism:** "exactly how I'd imagined it" for the colour; "more faceted like a gem and less flat". Rebuilt as a cut gem: a hexagonal girdle, a crown of six bevels and six facets to a point, a shallow pavilion behind, flat-shaded, so each facet takes its own hue.
- **Translucency, why not yet:** the live models go through the pixel pass, which keeps each pixel's majority colour and drops pixels less than half covered, so a see-through surface can only come out as a stipple (the Rime's first mist, which the user disliked). Real translucency would mean drawing that part in the 2D layer instead (as the effects are), a separate step to decide.

## Open questions (on the review page)

- `g3-q-1-ice`: the Ice guard's rules as above, or another shape? *Pick: as above.*
- `g3-q-2-shimmer`: does every guard get a faint Shield shimmer all the time, or only the Mirror (and the others while blocking)? *Pick: only the Mirror; the others show it while blocking, so each element stays distinct.*
- `g3-q-3-size`: bucklers 1.3× and tower guards at shoulder height, carried at the side? *Pick: yes.*
- `g3-q-4-mix`: two infusions at most, the rest as rim arcs? *Pick: yes.*
- `g3-q-5-tide`: the water as a full radial disc, or a curtain fanned out in front? *Pick: a radial disc that leans forward, so it reads from every facing.*
