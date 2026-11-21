# Making particle VFX

How a spell effect gets designed, built and reviewed. Decided 2026-11-21 ([exploration](explorations/2026-11-21-vfx-workflow.md)); the line of work is the [VFX thread](threads/vfx.md).

The short version: **spec first, build with the game's code, check it yourself, one change per round.**

## 1. Write the spec

Before any code, write a short spec for the effect. For a new or reworked effect the user approves it first. For a tweak it is Claude's working note, kept with the effect's record.

| Field | What it answers |
|---|---|
| **Job** | What must a player understand from it, in one line? (Who cast it, where it hits, how dangerous it is.) |
| **Silhouette** | The one shape that identifies it at a glance, at game scale. |
| **Leading element** | In a mix, which element gives the shape and which adds character. The look rule: shape from the form, material from the look element (`art/vfx.ts`). Essences in [elements.md](world/elements.md). |
| **Movement** | Speed and character: snapping, flowing, rolling, settling. What stays put in the world and what follows the caster. |
| **Colour** | Core to edge, and how it cools or fades. Which palette ramps (`art/px.ts`). |
| **Timing** | Anticipation, impact and decay, in ms. For channels: start, sustain, stop. |
| **Layers** | What reads first, second and third (e.g. the arc, then embers, then light on the ground). |
| **Runes** | What changes from 1 to 5 runes: density, size, heat, speed, and the features only the top tiers add. Five should give some awe. |
| **Budget** | Rough particle count at five runes, and what gets cut first in a crowd. |
| **Not** | What it must not be confused with (e.g. a heal must not look like a fire spray). |

When working from a reference image or clip, take it apart into these fields first. What Claude guesses about how a reference was made is a hypothesis to test, not a recipe.

## 2. Build it in the VFX Lab

Build with the game's own code, not in a separate copy. The VFX Lab (`/vfx-lab.html` on the dev server, `npm run dev` in `game/`) casts any spell through the real sim and view; its URL options are listed at the top of `game/packages/client/src/lab/vfx-lab/main.ts`. For example:

- `vfx-lab.html?spell=fire,fire,fire&scene=crowd`: loops the cast live.
- `&t=0.5`: freezes 0.5 s after the cast (negative times show the wind-up).
- `&grid=runes&ns=1,3,5`: the same spell at one, three and five runes side by side.
- `scene=` `empty`, `crowd`, `dark`, `coop` (four wizards; `others=` sets their spells) or `ally`. Scenes are data in `src/lab/vfx-lab/scenes.ts`; add one when an effect needs another context.

Judge it in more than the empty scene: at least `crowd`, and `coop` for anything that fills the screen.

## 3. Check it before the user sees it

Render a contact sheet and difference frames across the effect's life at one, three and five runes, and read them:

    npm run vfx-sheet -- --page vfx-lab.html --query "spell=fire,fire,fire&scene=crowd&bar=0" --from 0 --to 1.2 --frames 12 --cols 4 --out shots/vfx/fire

It writes `sheet.png` (the frames), `diff.png` (new pixels in colour, vanished ones in magenta: what moved) and `metrics.json`. In the lab, trust the lab's own numbers (`particles`, `fxLive`, `vfxMs`) over the pixel count, which counts the floor too. Frames 0.03 to 0.06 s apart show particles travelling; wider gaps only show churn. Then go through the rubric below and write down the single biggest problem.

## 4. One change per round

Each round makes the one change with the biggest effect, then shows it. When a note comes back, it's clear which change it is about. Variants go side by side, about three at a time, same seed.

## The rubric

Run it at gameplay scale, never only zoomed in. Most checks come from the user's own notes on past effects (collected 2026-11-21 from the gallery's ratings, the explorations and the issues). They are the mistakes we have already made once.

| Check | The question | From the user's notes |
|---|---|---|
| **Readable** | Can a player tell what the spell does without a caption? | the gallery's question; "particles just read as noise" (#4) |
| **Silhouette** | Is there one clear shape, or a cloud of bits? | |
| **A material, not objects** | Does it read as one flame, sheet or spray, or as separate blobs? | "each flame particle looked too round and distinct"; "very clearly N fire patches"; the fireballs "looked like odd spheres bubbling up" |
| **Alive** | Does the middle move? Nothing should look like a picture laid over the floor. | "the middle of the spray looks static"; the rainbow "looked like a static sprite hanging in the air" |
| **Belongs to the body** | Does a status or death follow the body's own shape, or is it stamped on top? | the combustion flame "looks stamped on, it doesn't fit the body"; "I don't really like the square ice cube" |
| **Grounded** | Does what lands stay where it fell instead of swinging round with the aim? | the frost patch was "dragged around as you turn" |
| **True motion** | Does it move the way its material would? | the flame arc should be "sparks, molten steel flying, glowing… more of a plasma-ish thing than a rope burning"; the steam death "good, except the vibration" |
| **Element** | Does fire look like fire, not orange energy? In a mix, does the form give the shape and the carried element the look, with nothing stuck on? | the look rule replaced "a rock with flames stuck on"; "a better way to imagine lightning and fire than just orange lightning" |
| **Follows the delivery** | Does the shape fit how it arrived (boulder vs quake, shards vs beam), not only its element? | "very cool for a boulder, but I think it wouldn't work for earthquake" |
| **Runes** | Does each extra rune look like an upgrade? Does five give some awe? | "adding Water barely changes it"; "more runes don't look impressive" |
| **Snappy** | Is the timing as quick as the action feels? Is there an impact and a decay, without dragging? | Blink: "this should be super snappy"; arcane v2 "feels a bit too dramatic" |
| **No extra signals** | Is every warning, symbol and flourish needed? Prefer what the body or the projectile already shows. | "No warning needed. The travel time is your warning"; "skip the fire symbol"; "we don't need extra puddle effects" |
| **Pixel style** | Does it belong to the Pixel Battlefield look: one pixel size, crisp, the game's palettes? | (finer pixels held: #12) |
| **Clarity** | In `crowd` and `coop`, can you still see enemies, hazards and allies? | the open question "awe or clutter?" on five-rune fire |
| **Restraint** | Would removing particles make it better? | |

What has worked, to keep: the frost spray after its redesign ("perfect, no notes"), the 65° fan, the floor glyphs ("look great"), the jet falling from the raised barrel ("reads right"), and every enemy attack and bespoke death card (all rated keep).

## Where things live

- The effect code: `game/packages/client/src/art/` (`vfx.ts` and the files it imports).
- The emitter: `emit()` in `art/util.ts` (stateless: the same time and seed always give the same particles).
- The old gallery: `tools/spell-vfx/` (being replaced by the VFX Lab; its ratings stay in its artifact db).
