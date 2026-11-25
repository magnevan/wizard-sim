The game-camera comparison is the deciding view. At that scale this reads as a white nozzle feeding a broad, red-edged burning membrane. The pixel version reads as a directional jet breaking against bodies. These are frame sequences, so I can assess the changing silhouette and aftermath, but cannot verify flicker or the exact release cadence.

1. **What hurts most, in order**

**Body and outline shells: too much continuous coverage.** From 0.73–1.17s, flame draws a connected surface around the front rank. Targets become holes in a fiery sheet. Fine painted detail collapses into bright scribble at the game camera; it does not provide readable transparency. `FireBody` draws five lobes twice. In `FRAG`, the rim has alpha up to 0.92 beneath body coverage up to 0.95. Even three overlapping 0.55-alpha surfaces cover 91% of the background. The outline actively fills the transparency you want.

**Body silhouette: a swollen fan with a heavy outer lip.** The lower and upper edges curl around a broad terminal mass. It suggests a mushroom cap or shield more than pressurised flame. This is geometry, not just the texture: `VERT()` explicitly swells the profile, amplifies distal billowing, lifts the head, and rounds its cap. Outer lobes add their own radii beyond their displaced axes. Sharing `uHalf` does not constrain their surfaces to the hit cone.

**Body termination: an enclosed object ending, rather than fuel dispersing.** The distal edge remains conspicuously connected. At release, the residual sheet is recognisable at 1.57s before disappearing. A uniform dissolve preserves that sheet through its fade.

**Core and floor illumination: excessive separation from the stream.** The white core looks like a short laser attached to an orange curtain. The broad floor wash further enlarges the apparent affected area and weakens orange-on-sand contrast.

2. **Fixes for the designer’s notes**

All paths below are relative to `game/packages/client/src/view3d/fx/`. Numbers are starting settings to judge through the existing ACES output, not final calibrated values.

**“Too opaque.”** Change `fire-body.ts` → `FRAG` and `FireBody.constructor()`. Disable the five rim shells initially. Give the body genuine, correlated openings: use one shared aim-space erosion field across lobes so another lobe cannot fill every gap. Start with 30–40% open area in the distal half; make gaps broad enough to survive the game camera. Set surviving body coverage around 0.30–0.45 centrally, 0.08–0.18 at grazing edges, multiplying both RGB and alpha. Keep sparse hot tongues stronger. If an outline is still needed, restore only discontinuous grazing fragments at alpha 0.12–0.20. In `fire.ts` → `LOOK_TONGUE()`, reduce alpha from 0.9 to about 0.55; otherwise these refill the openings. Avoid making the whole effect additive: HDR accumulation on pale stone will wash it out.

**“Much wider than the actual cone.”** Change `fire-body.ts` → `VERT()` and `FRAG`: pass each ring’s sampled aim and evaluate its displaced ground position against that aim’s angular/radial footprint. Keep strong coverage inside the sim boundary; feather over the outer 10% of its half-angle. This catches lobe offset, radius, noise and shell expansion together. In `fire.ts` → `FAN.decal()`, change the angular fade from `0.9–1.6 * uHalf` to approximately `0.85–1.10 * uHalf`, and halve the fan RGB contribution initially. Judge with the sim cone overlay; projected flame height also adds apparent width.

**“Too much mushroom shape.”** In `fire-body.ts` → `LOBES` and `VERT()`, remove the `1 + 0.32 * … * uGrow` swell. Reduce distal billow amplitude from 2.3 to 0.8 and halve `lift`. Replace the common rounded cap beginning at 0.78 with staggered, eroded finger ends. Use three slimmer lobes initially; let their tip lengths differ rather than wrapping five near-equal heads into one lip.

**“Ends too abruptly”; “fine if it fades beyond its cone.”** Address space and time separately. In `VERT()`/`FRAG`, extend sparse tip geometry 0.4–0.7 units beyond unobstructed range, fading coverage below 0.1 there; preserve wall clipping. Erode fingers independently, without a shared terminal rim. In `FireSpray.update()`, replace the global 0.4s `uOn` fade with a travelling release mask in `FRAG`: emission time is approximately `uTime - vS * BODY_TRAVEL`; stop fresh fuel over 0.06s, then erode residual tongues over 0.20–0.30s. Let particles finish via `streamMotion()`. Keep the startup head calculation time-based after release too; it currently jumps to full length when `uEnd` becomes finite.

3. **Two additional changes**

In `fire.ts` → `CORE`/`LOOK_CORE()`, shorten the white section to roughly 15–20% of reach and break its brightness with seeded 18Hz modulation. White should identify the nozzle, not become a separate beam.

Simplify `fire-body.ts` → `FRAG`: lower painted colour mixing from 0.7 toward 0.35, retaining the painting for erosion. Fewer broad yellow/orange masses will communicate flow better than miniature luminous veins.

4. **If only one change ships**

Rework body coverage, including its rim. Real openings that remain open through overlapping lobes will restore target readability and break the solid membrane. A longer fade alone just leaves that membrane on screen longer.
