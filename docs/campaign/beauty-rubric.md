# The beauty rubric

How the beauty critic judges a place's art. It's used in stage 4 of [making a place](making-a-place.md). Written 2026-11-22 and tried the same day on the courtyard's grey-box (1/10) and two Codex repaints (2 and 3/10; the whole-screen repaint's craft score was 7, capped by mixed pixel scales and light direction), after an uncalibrated critic scored code-drawn art 6/10 while the user rated it 1–2. The criteria come from what pixel artists and environment artists have written; the sources are listed at the end. Nothing here was invented for the rubric except the scoring procedure, which is our own synthesis. No published artist-written rubric for game scenes was found.

## The procedure

1. **Look at full size.** Use single frames at 1920 × 1080, never contact sheets: thumbnails hide seams, noise and repetition. Look at three frames at least, including one with a building and one with a change of material.
2. **Calibrate first.** The concept art is 9–10. A bare grey-box is 1. [The anchors](anchors/) are frames the user has rated, each named with its rating. No frame scores above an anchor it doesn't clearly beat in craft.
3. **Hard caps.** For each one, answer pass or fail and point to where it fails. **Any failure caps the score at 3.**
4. **The greyscale test.** Desaturate the frame in your head or with a tool. The walkable floor and the characters (and anything dangerous, when there is any) must separate by value. A failure caps the score at 4.
5. **Refinements.** Note each defect found, with where it is. Several defects in one frame cap the score at 6.
6. **Then two scores**, against the anchors. The **score** has the caps applied. The **craft score** has none, so frames that fail the same cap can still be told apart. Add one sentence on what keeps the frame from the next band.
7. **The one change.** Name the defect that costs the most. Name the art source or pipeline that would fix it, not a tweak. Never suggest drawing art in code (the user, 2026-11-22).

Don't tell the critic what changed since the last round, or what earlier rounds scored. It judges the frame, not the progress.

## Hard caps (rule-level: the sources say "never" or "always")

| # | Defect | What it looks like |
|---|---|---|
| H1 | **Mixed pixel scales** | Sprites or tiles at different pixel densities, or scaled or rotated by non-integer amounts. The game's own sprites count: a backdrop painted finer than the wizard fails |
| H2 | **Mixed viewpoints** | Something drawn at a different angle from the game's 3/4 view: an isometric prop on a 3/4 floor, or a building seen from the front beside one seen from above |
| H3 | **Inconsistent scale** | Doors, steps or props that don't match the characters' size. Monumental doors and gates may be several times a character's height; ordinary doors and steps may not |
| H4 | **Inconsistent light** | Highlights and cast shadows pointing different ways |
| H5 | **Code-drawn art** | Procedural facades, stone, kerbs or patterns standing in for painted art (our rule, from the user) |

## Refinements (the sources say "avoid excess")

| # | Defect | What it looks like |
|---|---|---|
| R1 | **Noise and orphan pixels** | Stray single pixels, too much small detail crammed in |
| R2 | **Pillow shading or banding** | Shading that follows the outline in rings instead of the light; same-length pixel runs stacked |
| R3 | **Jaggies or blur** | Uneven line steps, broken lines, or anti-aliasing so heavy the edge goes soft |
| R4 | **Muddy or over-saturated colour** | Too many colours in a texture, or ramps of fully saturated colours |
| R5 | **Visible tile repetition** | The same patch recurring in a grid, or one cluster dominating a tile |
| R6 | **Hard or unnatural seams** | A straight tile edge, or a blotchy blend, where two materials meet, with no designed transition |
| R7 | **Busy against busy** | Two noisy textures side by side, nowhere for the eye to rest |
| R8 | **Props out of palette** | A rock, crate or plant that doesn't share the ground's hues |
| R9 | **Floating objects** | No contact or cast shadow, so things don't sit on the ground |
| R10 | **No colour scheme** | Every hue at full strength, "template" local colours (green grass, grey stone) with no unifying light |
| R11 | **No rest areas, no focal point** | Detail spread evenly everywhere |
| R12 | **Gameplay hidden** | Scenery covering the players or blurring what's walkable |
| R13 | **Doesn't serve its intent** | Pretty, but not the place the story beat and the journey need. Give the critic the place's read (`NN-name/<place>-read.md`) |
| R14 | **No wear or history** | Clean, untouched surfaces: no dirt at wall bases, no moss in joints, no worn steps *(unverified as a beauty criterion; common practice)* |

## Sources

- Raymond Schlitter (Slynyrd), Pixelblogs. [3 on projection](https://www.slynyrd.com/blog/2018/3/14/pixelblog-3-graphical-projections-1) ("don't mix viewpoints"), [4 on projection](https://www.slynyrd.com/blog/2018/4/12/pixelblog-4-graphical-projection-part-2) (palette, light, scale and proportions "should always be consistent"), [20 on top-down tiles](https://www.slynyrd.com/blog/2019/8/27/pixelblog-20-top-down-tiles) (dominant clusters show the pattern; busy against busy; negative space; too many colours blur), [21 on top-down objects](https://www.slynyrd.com/blog/2019/9/18/pixelblog-21-top-down-objects) (projection rules, props in the ground's hues, cast shadows connect objects).
- Arne Jansson, [pixel art tutorial](https://www.androidarts.com/pixtut/pixelart.htm): noise and orphan pixels, pillow shading, excessive anti-aliasing, saturated ramps, "template" colours.
- [Yari-pixels on mixels](https://yari-pixels.github.io/Articles/mixels.html); Michael Azzi, *Pixel Logic* ("never mix resolutions", quoted second-hand).
- Pixel Parmesan, [anti-aliasing fundamentals](https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists).
- Boris the Brave, [beyond basic autotiling](https://www.boristhebrave.com/2021/09/12/beyond-basic-autotiling/): transitions between terrains.
- Peter Angstadt, [reducing visual confusion](https://icewyrmgames.github.io/research/reducing-visual-confusion-in-your-game): "if everything is drawing attention, nothing will".
- James Gurney, *Color and Light*; [gamut mapping](https://gurneyjourney.blogspot.com/2013/02/digital-gamut-mapping-tool-for-windows.html).
- Shedworks on Sable's readability ([Game Developer](https://www.gamedeveloper.com/marketing/how-shedworks-refined-the-art-of-sable-in-pursuit-of-readability)); Pixpil on Eastward ([Game Developer](https://www.gamedeveloper.com/art/eastward-s-creators-share-insights-on-making-pixel-art-adventures)); Jason Hickey, [environment art isn't about making pretty things](https://gamedeveloper.com/production/environment-art-isn-t-about-making-pretty-things-so-what-s-it-about-).
- On critique order: ArtKrit ([Ma et al., 2025](https://arxiv.org/abs/2509.17268)) stages feedback as composition, then value, then colour.
