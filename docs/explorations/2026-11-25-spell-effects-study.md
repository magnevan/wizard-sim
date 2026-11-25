# What made the pixel effects work: a study for the 3D effects (2026-11-25)

The first step of the [spell effects in 3D](../threads/spell-effects-3d.md) thread. The user judged all four 3D tone pieces "a bit wrong still" and said of the Frost ring that "there's too little effect happening, which makes it a lot worse than the pixelated effect we had". Before building more, this puts each 3D piece next to its pixel version at the same moments, counts what each draws, and looks at how stylised 3D games build the same things. It ends with the method the next builds follow.

**How it was done.**
- `npm run compare:fx` (`game/scripts/fx-compare.mjs`) casts each spell at three runes in both labs: the pixel `vfx-lab.html` and the 3D `cast3d.html` at the game's 30 u. It takes the same five moments after the cast in a crowd, and measures motion in the empty scene. Shots go to `game/shots/port-3d/study/`; the pair sheets (pixel above, 3D below) are in `tools/port-3d-review/img/study-<spell>.jpg`.
- A code count of every layer in `art/` (pixel) and `view3d/fx/` (3D): rates, lifetimes, speeds, flicker. In the pixel game 1 u is 16 px.

## The pairs

| Spell | Pixel (rated better) | 3D (judged wrong) |
|---|---|---|
| [Fire spray](../../tools/port-3d-review/img/study-fire.jpg) | A grainy, mottled mass that fills the cone and runs *into* the goblins: they flash white, then burn. A wide warm glow on the floor round the caster. About 685 moving elements at three runes (a dense core stream, 364 flames, 106 smoke puffs, embers flickering at 18 Hz). | One smooth fan with a painted-looking edge and no grain inside it; the goblins beside it show nothing. Smoke only appears at the end. About 120 particles plus the body mesh. |
| [Arcane beam](../../tools/port-3d-review/img/study-arcane.jpg) | A thick (0.5 u), fully saturated pink beam with a sparkling dithered texture. Every fifth point flashes white at 30 Hz, and surges run at 34 u/s. A wide pink glow on the floor. The goblin hit flashes white, and sparks splash back toward the caster. About 55 moving elements. | A pale lilac line a third as thick (0.17 u). Surges are smooth, and the impact is a small star and a few sparks. Barely any floor light. 8 moving elements (impact a), 18 (impact b). |
| [Cold nova](../../tools/port-3d-review/img/study-cold.jpg) | A white flash round the caster at the cast. A saturated cyan ring with a white jagged crest, near opaque, filling a disc of mottled frost that stays. 40 shards and glints flickering at 7 Hz. The goblins it reaches turn frozen. | A pale grey, almost transparent disc with a thin blue edge: the "too little" the user saw. 17 shards, no flash, no flicker. It doesn't reach the lab's goblins. |
| [Earth rock](../../tools/port-3d-review/img/study-earth.jpg) | A small rock with white speed lines that flicker at 30 Hz, a short dithered wake and grit. At impact a white burst shape, debris, and the goblins it hits flash white and are thrown and fall. About 41 moving elements in flight. | A long, opaque brown tube from the staff (the "textured tube"). The rock is small and the impact is debris on the floor. The goblins barely react. 14 moving elements in flight. |

**The motion measure didn't separate them.** The share of an effect's pixels that change from one 1/30 s frame to the next is about the same in both (fire 23 % pixel against 14 to 18 % 3D; cold 21 to 30 % against 16 to 55 %; earth higher in 3D). So "not enough is happening" isn't the amount of change on screen. It's *what kind* of change, below.

## What the pixel effects do that the 3D ones don't

In order of how much each seems to matter:

1. **Half the effect is on the bodies.** In every pixel pair the goblins the spell reaches react: a white flash on the hit, then the element's status drawn on the body (flames on a burning goblin, frost on a chilled one), a held beam flickering its target white, and a body thrown by the rock tumbles. That's what makes a spray *burn things* and an impact *land*. In 3D the models get only a status tint; the white flash is drawn on the grey stand-in bodies but not on the models, and no status draws anything on a body. This is the user's "the impact reads like a stamp, not the effect of a beam hitting" and "doesn't look right if it impacts a wall or an enemy". An impact drawn only at a point can't show it; the body has to.
2. **Grain: high-frequency detail inside the body.** The pixel bodies are made of hundreds of small elements and dithered texture. The eye reads that fine, changing grain as fast motion even where the shape stays put. The 3D bodies are smooth gradients and low-frequency noise: the "orange cloth" and the "textured tube". The pixel fire has about six times the elements of the 3D one, and all of them small.
3. **Stepped flicker.** The pixel effects re-roll things on whole frames at 7 to 30 Hz: the beam's white glints (30 Hz), the rock's speed lines (30 Hz), wall crackle (20 Hz), embers (18 Hz), frost glints (7 Hz). The 3D versions use smooth sines and scrolling noise, which read as slow and calm. Energy reads as discontinuity.
4. **Saturation and opacity.** The pixel colours are full-strength and opaque: magenta, cyan, orange. The 3D ones are pale and translucent after the tone map: a lilac beam, a grey ring. The 3D court's floor is also much paler and brighter than the pixel paving, so a translucent effect has nothing to sit on. "Toned down" went too far on every piece.
5. **Size.** The pixel beam is three times as thick, the pixel fire reaches into the crowd, and the pixel ring's frost fills its disc. The 3D pieces kept to the "hat-wide beam" and "knee-high front" of the draft rules and came out thin at the game camera.
6. **Light on the floor, big.** Every pixel spell throws a wide coloured glow round the caster and along its path. The draft rule ("light follows the shape, small") came from the concept round's pink wash. In motion, the big glow is a large part of why the pixel spells feel powerful.
7. **Impacts know the surface, a little.** The pixel wall splashes (fire, beam) are laid along the wall's face (`wallAt` in `art/vfx.ts`), and a beam hitting a body splashes back along the beam. The 3D impacts have no wall direction. The pixel rock's impact isn't oriented either; it gets away with it because the bodies react (1).

And one thing about how we judge: **the 3D lab's crowd stands out of reach.** Its goblins are about 5.5 u from the caster, past the three-rune ring (4.2 u) and at the end of the spray, so the 3D pieces were tuned without seeing what they do to bodies. The pixel lab's crowd is in the spell's path.

## How stylised 3D games build these

From breakdowns by practitioners and Riot's published guide (sources at the end):

- **Shape from a mesh, life from textures on it.** Simon Trümpler's stylised fire for RiME is a simple mesh with a painted texture that pans across it. UV distortion (a second noise texture bending the first) and **alpha erosion** (a threshold climbing with age, so the shape breaks up into wisps) give "somewhat complex motion" from a simple shader. A smaller duplicate mesh inside, slightly rotated, adds inner volume. Our meshes used only procedural noise with no painted texture and no distortion: smooth, hence cloth.
- **Many fast, short-lived elements on top.** The mesh carries the shape; dozens to hundreds of small stretched sparks, licks and chips (0.1 to 0.4 s) carry the speed. Breakdowns treat these as essential, not garnish.
- **A shockwave is a radial disc plus ground marks plus particles.** A disc mesh with radial UVs (0 at the centre, 1 at the rim) and a panning texture masked radially gives the expanding front. Ground cracks or frost are separate decals, and the burst (snow powder, shards) is particles. That matches the user's "a blast wave in a snowy landscape" better than our upright ring wall.
- **Loudness tracks gameplay weight.** Riot's VFX style guide sets an effect's importance through size, shape, timing, value, saturation and opacity, and puts readability above theme. Our pieces turned all six down at once.
- **Impact frames.** A one-to-three-frame white flash on the hit, on the thing hit, sells contact more than any decal does.

## The method

How the next builds are made and checked. These replace the draft spell-look rules in the [tone round](2026-11-25-spell-concepts-tone.md) where they disagree (rules 4 and 5).

1. **Start from the pixel version's inventory.** List every layer the pixel effect has (from `art/`), and give each a 3D counterpart, or drop it on purpose and say why. Match or beat its element counts and its flicker rates. The pixel version is the floor, not the ceiling.
2. **Body reactions are part of every effect.** The white hit flash on the models (one to three frames), and each element's status drawn on the body, following its mesh: flames on the burning, frost on the chilled, the thrown body tumbling. (An Arcane hit leaves no status in the sim; its body reaction is the flash, flickering under a held beam.) These are built with each element, not saved for a statuses batch at the end.
3. **Mediums are a mesh shape carrying painted textures**: a Codex-painted texture panned along the motion, bent by a distortion noise and eroded by age, with an inner duplicate for volume. On top, a dense layer of small, fast, short-lived particles. No smooth procedural-only bodies; no sprite cluster as the main body.
4. **Grain and stepped flicker.** Every body has fine detail inside it, from the texture. Energy layers (glints, crackle, speed lines) re-roll on whole frames at 12 to 30 Hz, as the pixel ones do, rather than sliding smoothly.
5. **Full strength.** Colours as saturated and bodies as opaque as the pixel version's at the game camera after the tone map, checked by sampling the frame. Sizes at least the pixel version's (the beam at least 0.4 u). Light on the floor as wide as the pixel glow.
6. **Impacts by what was hit.** Ground, wall and body each get their own impact: on a wall, laid along its face (the pixel game's `wallAt`); on a body, the body's flash and status plus a splash back along the delivery; on the ground, what's there now.
7. **Judge beside the pixel version.** `npm run compare:fx` for the pair sheets at matching moments. The 3D lab's crowd is moved into reach first, so hits are seen. Then clips in the court at 30 u, as before.

## What it changes in the plan

- **First, before any element:** move the 3D lab's crowd into reach, and build the body reactions every spell shares: the white hit flash on the models and a status layer on a body that each element fills in. That fixes part of all four complaints at once (the stamp-like beam impact, the rock's wall and enemy hits, and much of "too little happening").
- **Fire:** a Codex flame texture panned and distorted through the existing mesh, eroded at the edges. A dense layer of fast short tongues on top, the burning status on bodies, a wider floor glow, and a wall splash along the wall.
- **Cold:** a blast wave, rebuilt on the radial-disc pattern: a white flash at the caster, a saturated disc of panned snow and frost racing out with a bright crest, a thick burst of snow powder and flung ice, a frost crust on the bodies it reaches, and a saturated frost patch left behind.
- **Arcane:** thicker and fully saturated. A 30 Hz white glint, crackle re-rolled on frames, side sparks and a wide pink floor glow. A body hit is the body's flash, char and a splash back; a wall hit is laid on the face.
- **Earth:** the wake becomes speed lines and grit with a short dust trail, not a tube. A white flash at impact, the struck goblins thrown and tumbling, and chips off a wall's face.

One question this raises for the user rather than for the effects: **the 3D court's floor is much paler and brighter than the pixel paving.** Part of why the 3D effects look washed out is that there's no mid or dark value under them. Effects can carry their own dark values (rims, smoke), but the scene's exposure is worth a look in the port thread too.

## The user's answers, and the shared step built (2026-11-25)

On The Court in 3D: **the method, yes** ("Sounds fine. In just need to see it visually"); **shared body reactions first, then fire**; **try the court darker** (filed as #24 for the port thread).

The shared step, on branch `p3d-react`:
- `cast3d.html`'s `crowd` is now the pixel VFX Lab's crowd (a brute and ten goblins round the target, in the spells' reach), moved so the casters line up; the old four goblins are `scene=sparse`.
- **The hit flash on every hit** (`view3d/bodies.ts` `flashLevel`): the models' flash follows the hit's level (a fresh hit full white, a repeat hit within 0.35 s half for 0.08 s), where before only a first hit flashed. A beam held on a goblin flickers it, as in the pixel game.
- **Statuses on the body** (`view3d/fx/statuses.ts`, hosted by `spells3d.ts`), ported from the pixel pass (`art/vfx.ts` `statuses`, `art/kit.ts`): flame licks on the shoulders, re-rolled 14 times a second, embers and an orange light on the burning; glints (stepped: a star, then a dot) and cold breath on the chilled, bigger glints and a pale light on the frozen; sparks re-rolled at 20 Hz on the stunned; drips on the wet. One batch per layer, each quad reading its body from uniform arrays, so it stays a pure function of the clock.
- `npm run compare:fx -- <out> --view 12` draws the 3D strips closer, to see what's on the bodies.

What the rounds taught: licks placed on the body's own outline are hidden by it from a camera that looks down; out past the silhouette and up on the shoulders they show. A three-rune ring leaves a light chill, and glints in proportion to it almost never showed: any chill now shows, by its square root, at least 0.45. The frost glints are still small at the game camera; they can grow with the frost blast.

## Sources

- [Stylized VFX in RiME](https://www.unrealengine.com/events/unreal-fest-europe-2018/stylized-vfx-in-rime) (Simon Trümpler, Unreal Fest Europe 2018), and his [VFX Sketchbook](https://realtimevfx.com/t/simon-trumpler-vfx-sketchbook/4177?page=11) on realtimevfx.com (UV distortion plus alpha erosion; the inner duplicate mesh; faster scrolling while fading).
- [League of Legends VFX style guide](https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/) (Riot, 2017) and [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/).
- A [radial-UV shockwave disc](https://realtimevfx.com/t/brais-sketchbook/31406) (realtimevfx.com), a [shockwave with separate ground-crack and particle materials](https://80.lv/articles/how-to-create-a-semi-realistic-shockwave-attack-effect-in-unreal-engine) (80.lv) and a [snow impact](https://80.lv/articles/how-to-create-a-snow-based-impact-vfx-in-ue5) (80.lv).
