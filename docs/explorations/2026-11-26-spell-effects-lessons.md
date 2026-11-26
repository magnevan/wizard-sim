# Spell effects: lessons from the first four (2026-11-26)

Fifteen review rounds took the 3D Fire spray, Arcane beam, Cold ring and Earth rock from "a bit wrong still" to "about to close" ([the record, round by round](2026-11-25-spell-effects-study.md); [the thread](../threads/spell-effects-3d.md)). This page pulls out what should carry over to every other effect, as a first draft of the thread's spell-look guide. The user's prompt for it: lingering after-effects look good; concept art that looked cool didn't work in motion; impacts need oomph without loud flashing.

## 1. Every effect has a life: start, run, end, aftermath

The effects that work have four phases, and the last one is where much of the beauty is:

| Phase | What it is | In the four |
|---|---|---|
| **Start** | where the effect is born: a source the eye can find | the fire's white weld at the hand, the beam's swelling start (Diablo 3's Disintegrate) |
| **Run** | the medium doing its job: travelling, burning, spreading | the flipbook flames, the beam's pulses, the frost wave |
| **End** | the gameplay part stops: quick and clear, so nobody mistakes what's left for something live | the beam's core and pulses go out in 0.14 s |
| **Aftermath** | what it leaves behind, outliving the gameplay by 1 to 6 s, slowly cooling, drifting, thinning | the beam's core turning to smoke; the fire's ash flakes and soot; frozen ground; dust settling after the rock |

The pattern in code (from `arcane.ts` round 15): each effect's shader gets two levels, the live part `on` (1 while it runs, falling to 0 fast) and `after` (0 while it runs, rising 0 to 1 over the aftermath). The live layers scale by `on`; the residue layers fade by `after`. Particles with lives past the end, and decals fading over seconds, do the rest. Suggested next step: make that pair a shared helper (start, end and clock in, `on` / `after` / `grow` out), so every new effect has an aftermath from the start.

**The trade-off.** A residue must never read as a live hazard. Smoke after the fire must not look like it still burns; frost on the ground must look harmless unless it is a hazard. So the residue goes **duller, cooler and slower** than the live effect: less saturated, darker or paler, no flicker, drifting rather than moving with intent. Where a residue is a hazard (a burning floor, an ice patch), it keeps the live look, so the two stay distinct.

## 2. The medium is a flipbook of its own life, not a still sprite

The biggest jump in the fire (Codex's score 6 to 7, the user's "Looks much better") came from swapping still puff sprites for 8-frame burn-out flipbooks, after how Magicka 1 builds its fire ([notes](../reference/magicka-fire/how-magicka-1-builds-it.md)). A still sprite, scaled and faded, reads as a sprite; a flipbook that changes shape as it lives reads as the medium. Frost, dust, smoke and the beam's plasma probably need the same (already on the thread's Next list).

## 3. Narrow and strong beats wide and soft

The user corrected the glows outward twice and inward once; the one that held was **narrow, strong pulses** with the wisps visible round them. A wide glow washes everything under it into one haze and hides the detail that makes it read. Brightness belongs in small, hot places (a core, a pulse, a weld); the width is detail (wisps, strands, flames), not glow.

## 4. No hard edges in space or time

Any travelling feature fades in and out at both ends; any change of state ramps. The beam's pulses drew "a very sharp starting line in the whisps" from a fade over under half a unit, and the fire's char "really reveals the spells shape" by stenciling the hit area. The sim's shapes are exact; the drawing of them shouldn't be.

## 5. Contrast on pale stone needs something dark

Additive light alone washes out on the court's pale floor. Every effect that reads well brings a dark: the fire's smoke and soot, the ash. The floating embers first added only light and vanished. Each effect should carry a covering, darker layer as well as a bright one (and the darker-court test, #24, still stands).

## 6. Judge in motion, and show the end

Every problem worth fixing showed only in motion: the fire's three streams, the pulses' hard line, the embers appearing in thin air. Review clips should run past the end, so the aftermath is judged too; show sprays at 2 to 3 runes; show beams into open distance as well as on a target. When a note could mean a sub-part or the whole (the "glows" were the pulses, not the beam), confirm which before building.

## 7. Concept art: draw breakdowns, not splash paintings

The flamethrower concept looked cool and didn't work as a moving image. A painted hero frame shows a sustained, solid shape: one big sculpted volume of fire. But an effect in motion is many short-lived parts, each born, changing and dying in under a second, and the solid volume it implies is what we built first ("an orange cloth"). The concept should show what the effect is made of and how it changes, not how one frozen moment looks. A new way to ask Codex, to try on the next family:

- **A storyboard strip**: four to six moments of one cast (start, run, end, aftermath), at the game camera and the game's scale, on the court's floor.
- **A parts sheet**, like a VFX artist's breakdown: each building block alone on black (one flame's life as eight frames, an ember, a smoke puff, a wisp), with a note on its life, speed and direction.
- **Restraint in the painting**: flat, readable shapes and few of them, since anything painted in fine detail is what we can't keep in motion.
- **Real footage first**: the user's Magicka recordings told us more than any concept (the burn-out flipbook, the hollow, bright-edged flames, the raindrop shape). For each family, a reference clip from a game or the real world comes before concept art.

## 8. Impacts: oomph is motion and timing, not brightness

The hit flash was too loud: a white body over the effect read as a cloud, and repeat hits strobed. The rim flash, soft repeat hits and soft flashes on burning bodies fixed the noise but leave little oomph. What gives a hit weight without light:

- **Motion away from the contact**: chips, sparks or splashes flung along the surface's reflection, fast out, slow to settle (the rock's chips and directional cracks worked).
- **The body reacting**: a recoil or stagger pose, a knockdown for the big goblin (#25). The pixel study found half the old effect was on the bodies hit.
- **Timing**: a very fast attack (one or two frames) and a slower settle; a small shake of the view for heavy hits only (the rock has one; nothing else does yet).
- **One flash, then a status**: the first hit may flash (the rim), but sustained contact (a beam on a body, standing in fire) shows as a steady status glow, not repeated flashes. No hit is brighter than its effect's own core.
- **By surface**: wall, body and ground told apart (on the Next list; it needs the contact kind and normal from the sim).

## What it costs

A shared phase helper is a small refactor of the four pieces. Flipbooks for each medium are Codex art plus local prep (free). Recoil poses and a knockdown touch the bodies' animation, a bigger job. None of it changes the rules.
