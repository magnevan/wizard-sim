# How Magicka 1 builds its fire spray (read from the game's files, 2026-11-26)

At the user's suggestion ("maybe its time to look at the sprites in the magicka 2 source code to help understand it"), the installed games were opened for study. Magicka 2 packs its data into hashed engine bundles that weren't opened. Magicka 1 (XNA) keeps readable effect definitions (`Content/Effects/Spells/Spray/Spray_Fire1.xml`, plain XML) and particle atlases (`Content/EffectTextures/Particles{A,B,C,D}.xnb`, LZX-compressed), decoded with a small script in the job folder. **Nothing from the game is copied into this repo or the game**; these are notes, *(verified against the files)* unless marked.

## The effect: five emitters

| Layer | Rate | Life | Size (start → end) | Speed | Blend, other |
|---|---|---|---|---|---|
| Flame | 60/s | 0.8–1.0 s | 0.6–0.7 → 1.8–2.0 (×3) | 30–34, drag 0.05, rises (gravity −10) | additive, a 7° arc, alpha 0.5–1, random rotation |
| Hot bits at the nozzle | 60/s | 0.2–0.3 s | 0.5–0.8 → 0.5–0.6 | 18, drag 0.5, spinning 20–90°/s | additive |
| Smoke | 20/s | 0.8–1.2 s | 1–1.2 → 1.5–2 | 20–36 | alpha blend, born 2 units behind and 0.3 below |
| Embers | 30/s | 1.3–1.8 s | 0.3–0.4 → 0.1–0.2 | 0–24, falling (gravity 3) | additive, tinted red, spinning |
| A burst at the start | 5 at once | 0.4–0.8 s | 1 → 1.4–1.8 | 12–24 | additive, the flame's cell |

(Their units, not ours; the ratios are what carry over.)

## The sprites are flipbooks

The atlases are 3D textures: each slice is an 8 × 8 grid of 32 px cells, and the slices are **animation frames** of the same cell (A still; B and C 4 frames; D 8 frames). Cell indices run A 0–63, B 64–127, C 128–191, D 192–255.

- **The flame cell (D, 8 frames) plays its own burn-out** over the particle's life: a dense white-yellow fireball, breaking into orange crackle with dark gaps, darkening to red embers, a faint red haze. This is the piece our 3D fire lacked: our flame cells were still pictures tinted by age, so they never visibly burned.
- The nozzle cell (C, 4 frames) is a curled flame wisp breaking up.
- The smoke cell (B, 4 frames) is a soft dark puff thinning out.
- The ember cell (A) is a tiny white spark, tinted red.

## What we take

Few, big, fast, long-lived flame sprites that triple in size, each playing a burn-out flipbook; short hot wisps at the nozzle; dark smoke behind; many small embers. Our own flipbooks are painted by Codex in our toon style (`game/content/generated/fx/fire-burn-*`), and played on our particles with the same structure. Their additive blend suits their darker scenes; on our pale stone the flame covers, as earlier rounds found.

## The other Fire effects (read 2026-11-26, for Fire's element pass)

Sheets (one row per emitter, the cells' frames, each particle's life on our floor colour) made with `tools/magicka-study/` and shown on the [Spell Effects Review](https://claude.ai/artifact/Kwh9yrDCTVmnXQRcHQ6vxT), round "Magicka fire"; the pictures stay out of the repo. *(Verified against the files.)*

- **The fade is in the frames.** Every flame cell darkens to nothing over its flipbook while its alpha stays near 1, and the sprite grows 2 to 3 times over its life at the same time.
- **The area (our ring), `Area_fire1_b`**, one 1 s pulse: 6 big flame puffs and 6 smoke puffs flung out fast (speed 42–48), 10 short wisps, 3 slower puffs falling back, 12 sparks. No ring is drawn: a dozen puffs moving outward make it.
- **Fire on the ground (our patch), `Area_ground_fire`**: sparks, a soft glow that doubles and fades in under half a second, and a crackle cell (4 frames, 0.5–1 s) respawned 10 a second, each growing ×3.2. Burning ground is a trickle of short crackles; a lasting scorch would be a decal.
- **Fire on yourself, `Self_Fire`**: 0.4 s, a big glow shrinking to nothing, five flame puffs, curled wisps rising fast. What lasts is the burning status after it.
- **`Fire_Blast`**: 500 small spinning flames at once over a smoke haze: many small parts, not a few big ones (a reference for our burst).
- **Burning, three levels**: level 1 is curled wisps (15 a second), a little smoke and three puffs; level 3 adds leaning flames held within ±20° of upright, flame puffs, a pulse of big puffs and a shrinking glow, six layers. Burning grows by adding layers.
- **Variety comes from rotation**: one smoke cell, one spark, one wisp, each rotated at random (±180°, or ±20° where it must stay upright) and spun.
- **On our pale floor their additive flames wash out** to near white; on their dark ground they glow. Ours still need the dark rims and smoke (lessons, section 5).
