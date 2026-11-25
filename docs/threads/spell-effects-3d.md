# Spell effects in 3D

Status: active; handed off from the [port to 3D](port-3d.md) on 2026-11-25; four tone pieces built, every one judged "a bit wrong still"; next: study what made the pixel effects work, then fire · Last touched: 2026-11-25
Record: [fire concepts and builds](../explorations/2026-11-25-spell-concepts-fire.md) · [tone pieces: beam, rock, ring](../explorations/2026-11-25-spell-concepts-tone.md) · [the 3D effects core spike](../explorations/2026-11-25-fx3d-spike.md) · [VFX workflow](../vfx-workflow.md) (spec headings, rubric) · [The Court in 3D](https://claude.ai/artifact/3dWPYc5ZxZqgrYfpksnegu) (the review page, `tools/port-3d-review/`; its db holds every verdict below) · concept art in `docs/reference/spell-concepts/`

## Where it stands

The game is moving to a stylised 3D render ([the plan](../explorations/2026-11-25-port-3d-plan.md)), so every spell effect is redrawn. In the 3D game (`play3d.html`, `?runes=1` to cast in the court) every spell already draws, as a plain stand-in of its sim shape (`view3d/fx/standins.ts`), so the game is playable while this thread works.

To set the tone, four pieces were taken from Codex concept art the user picked to a build: Fire spray and floor, the Arcane beam, the Earth rock and impact, the Cold ring. The user's verdict on all four (2026-11-25): "everything looks a bit wrong still", so effects became their own thread. The builds are on `port-3d` and stay as a base to improve or replace.

**The code.** `game/packages/client/src/view3d/fx/` (hosted by `view3d/spells3d.ts`):
- the core: `particles.ts` (stateless shader particles: a pure function of time, seed and params, so rollback and frozen frames stay right), `decal.ts` (ground decals on the floor's height), `lights.ts` (a pool of 8 spell lights), `stage.ts` (an HDR multisampled target, effects depth-faded against the scene), `aim-trail.ts` (a sweep bends like a hose), `from-sim.ts` (reads the sim);
- primitives: `beam-strip.ts` (a camera-facing strip), `nova-ring.ts` (a ring wall on the floor), `rock-mesh.ts`, `dust-mesh.ts` (noise-eroded meshes);
- the four pieces: `fire-body.ts` / `fire.ts` / `fire-floor.ts`, `arcane.ts`, `earth.ts` / `earth-impact.ts`, `cold.ts`;
- a `draw<Element>` switch per piece in `standins.ts` puts the stand-in back.

**The tools.**
- `cast3d.html` is the 3D VFX Lab: the real sim at the game camera, with `spell=`, `form=`, `n=`, `t=`, `view=`, `hit=1`, `sweep=1`, `move=1`, `undying=1`, `impact=`, `clip=1` and `standins=all`. `fx3d.html` is the older fire lab.
- Clips and shots: `npm run clip:fx` (any lab URL to MP4 on a virtual clock), `shot:arcane3d`, `clip:cold3d`, `shot:earth3d`, `shot:cast3d`.
- The pixel game's own effects stay in `vfx-lab.html` and `art/`, for comparison.

## The user's verdicts (2026-11-25, verbatim)

- **Fire** (toon volume, built twice): first as sprites, "a very obvious cluster of opaque sprites, not at all similar to the concept"; then as a mesh, "it reads more like an orange cloth, too opaque, not enough effects that reads as rapid motion".
- **Arcane beam** (crisp): "size seems ok, but the impact reads too much like a stamp on top and not actually the effect of a beam hitting. The beam is a bit too static too, it needs some more effects around it."
- **Cold ring** (crisp, toned down): "Wrong in several different axies. There's too little effect happening, which makes it a lot worse than the pixelated effect we had. I also don't know if the 'wave' along the ground is the right shape here. I'm imagining something more like a blast wave eminating from the character, but the contents is in frost. Maybe like how you'd imagine a blast wave in a snowly landscape to look".
- **Earth rock** (toon, sized by runes): "dust cloud reads a bit like a textured tube. The impact makes sense if it just hits the ground, but doesn't look right if it impact a wall or an enemy".
- Concept art picks, for reference: fire `fire/toon-spray-2`, floor `fire/toon-floor-3`; beam `arcane/crisp-beam-1`; rock `earth/toon-rock-3` and `toon-impact-2`; ring `cold/crisp-nova-1` (the user: "the vibe is good", "a bit intense"). The four as a family (`family/toon-sheet-2`) and the draft rules in the tone doc were accepted.

## What they add up to (my read, for this thread to test)

1. **Not enough is happening.** Every build is too still and too sparse: one shape doing one thing. The pixel effects, which the user rated better, had many small moving parts. Effects need rapid secondary motion: sparks, licks, crackle, things flung off, flicker.
2. **No sprite clusters, and no opaque solids for mediums.** Main bodies were made meshes to fix the first fire, and became cloth and tubes: opaque, smooth, slow. Fire, frost and dust need translucency, layering and churn.
3. **Impacts must answer what was hit.** An impact drawn as a decal at the end point reads as a stamp. It should come from the hit: sparks spraying off the struck surface, a wall chipping, a body reacting. It should be oriented by the direction of travel and the surface, and different for ground, wall and body.
4. **Contrast on pale stone** (from the concept round): each effect brings a white or a dark the court's warm floor lacks.
5. **Sizes and shapes come from the sim**: hit shapes stay true. Painted concepts show the mood, not the dimensions.
6. **Judge in motion, at the game camera, in the court.** Stills and lab paving hid every one of these problems.

## How to work here

- **Machine budget:** the user's machine maxed out with four agents rendering clips at once (2026-11-25), and one agent's server was stopped for low memory. Run at most two heavy agents (dev servers, Chrome, clips) at a time.
- **Batches with clips:** one review page per batch, with looping clips (court at 30 u, lab at 1 and 5 runes) and a keep / redo box per effect, as on The Court in 3D. Read its db before each round.
- **Concept art is free** (Codex; see `tools/concept-gen/README.md`), and so are motion references: the pixel version in `vfx-lab.html`, and the reference games in `docs/reference/`.
- **Spell rules don't change here.** Shapes, sizes and timings are the sim's. A look that needs a different hit shape is a separate design question for the user.

## Next

- [ ] **Study first:** put each of the four next to its pixel version (`vfx-lab.html`) and its concept, at the same moment, and list what the pixel one does that the 3D one doesn't (counts of moving parts, speeds, layers, flicker). Look at how stylised 3D games build fire, frost blasts, beams and impacts (flipbooks on meshes, scrolling painted textures, distortion, many fast short-lived elements). Write it up as the method before building more.
- [ ] **Fire:** a painted flame texture (Codex) scrolling through the body mesh, translucency, fast licks and flicker, embers; must read as rapid motion.
- [ ] **Cold:** rethink as a frost blast wave from the caster ("a blast wave in a snowy landscape"): a burst of frost, snow and ice flung outward, much more happening than now.
- [ ] **Arcane beam:** more life around the beam (crackle, orbiting motes, flicker); an impact that comes from the hit, not a stamp.
- [ ] **Earth:** dust as billowing, translucent volume, not a tube; impacts that differ for the ground, a wall and a body.
- [ ] **The spell-look guide**, written from the four once they pass, and a critic calibrated on the user's verdicts.
- [ ] Then every other family in batches (sprays, beams, missiles, novas, lightning, ground effects, walls, Sigil devices, statuses, weapons and guards, enemy attacks, deaths, previews), one review page per batch.

## Done

- 2026-11-25 Effects core, stand-ins for every spell, the 3D VFX Lab, two concept rounds (fire; beam, rock, ring), four builds judged (in the [port to 3D](port-3d.md) thread).
