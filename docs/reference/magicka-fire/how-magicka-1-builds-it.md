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
