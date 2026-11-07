# Wizard Sim

A co-op, top-down spellcasting game inspired by Magicka: a design sandbox plus the game itself. Start with `docs/vision.md` for the pillars, and `docs/current-state.md` for what's true right now.

**Play:** https://magnevan.github.io/wizard-sim/ (two to four players; open **Co-op online**, create a room and share the four-letter code).

This is a fan project with no connection to Magicka's makers, and it uses none of their code or assets.

## Published pages

The live game is public. The rest are private claude.ai pages where the design was rated: links to claude.ai won't open for anyone else.

| Page | Source | What it's for |
|---|---|---|
| [Wizard Sim (the game)](https://magnevan.github.io/wizard-sim/) | `game/` | The game, deployed on every push to main. |
| [Spell Atlas](https://claude.ai/artifact/GiZ7G7eQ4pMqXLaPEZK6Cw) | `tools/spell-atlas/` | The whole spell tree under proposal C, as a form × cast grid, plus Structures. Rate cells and answer the questions. |
| [Weapon Moveset Review](https://claude.ai/artifact/F3FyhonePFv5JVeSLfk1U9) | `tools/weapon-moves/` | Conjured weapons and guards, move by move (rounds 1–4 rated). |
| [Survive Review](https://claude.ai/artifact/HMQPuLJQWvMsXezHSHJn1a) | `tools/survive-review/` | The Survive mode: the arena and wave loop, every power-up as a rateable card, Rally and Echo in motion, and the open questions. |
| [Rune Economy](https://claude.ai/artifact/HnMgNHWfFop3Xhy4eRcFAe) | `tools/rune-economy/` | A rune-flow simulator: four play styles under the old flat regen or the shared budget (α, R, pool size, glyphs), runes cast over time, and its questions (answered; the shared budget is built). |
| [Sound Gallery](https://claude.ai/artifact/1q44UnJP32BfR4wFVfkvVi) | `tools/sound-gallery/` | The game's sounds to rate: every element and cast shape, a spell mixer, and the rune, room and wall variations side by side. |
| [Training Grounds Blueprint](https://claude.ai/artifact/KKuX6w48CM9KCwZtHB7rzf) | `tools/training-grounds/` | The academy's outdoor training ground as a concept: what it's for, seven shapes, a terraced plan to refine before any art. |
| [Outdoor Art Kit](https://claude.ai/artifact/QNKgjigTb14KmCe8mod1kT) | `tools/outdoor-kit/` | A mock training yard for the outdoor sword lesson, under both cameras, with the proposed PixelLab purchases to approve. |
| [Academy Art Trial](https://claude.ai/artifact/S2wttPmXSg7YXZhJQbL4gN) | `tools/art-trial/` | Five art sources (code-drawn, PixelLab, Gemini) drawing the same academy props on the game's real floor, with ratings and questions. |
| [Spell VFX gallery](https://claude.ai/artifact/F2LeDE6z1FWx3HuAPsP9Vz) | `tools/spell-vfx/` | Looping pixel-art vignettes of the current spells and the enemy deaths, in the game's look. |
| [Balance Notes](https://claude.ai/artifact/5cTMLv4PTnGvGS3QCBdDHg) | `tools/balance-notes/` | The balance harness's measurements, with questions. |
| [Engine Choice](https://claude.ai/artifact/LyrRxR1uZjwDFibLNL4Y4c) | `tools/engine-choice/` | The stack comparison behind PixiJS v8 + our own sim (decided). |
| [Pixel Battlefield](https://claude.ai/artifact/BwW5WDghxYLXBniwYYBuRi) | `tools/art-pixel-hd/` | The chosen art direction, full screen, with structures and the rune HUD. |
| [Art Style Explorer](https://claude.ai/artifact/33DELSAis34SSDvLJ69rwG) | `tools/art-styles/` | The same fight in six art directions (rated; the Pixel Battlefield look won). |
| [Spell Wishlist Gallery](https://claude.ai/artifact/5GLNfuBM3npBdMBLefATSQ) | `tools/spell-gallery/` | The early animated wishlist scenes (rounds 1–3 rated). Superseded by the Spell VFX gallery for current visuals. |
| [Spell Tree Explorer](https://claude.ai/artifact/88XcXP6YU3iL35bTYuNL3X) | `tools/spell-tree/` | The older proposals A and A.1 (superseded by the Atlas). |
| [Skeleton prototype](https://claude.ai/artifact/HmEKJfEUvzY7amrNTCXHSv) | `prototypes/01-skeleton/` | The first playable (Proposal A). Superseded by `game/`. |

## Docs
- `docs/vision.md`: pillars and the big open questions
- `docs/current-state.md`: what's true now, each line linked to its decision, and the live open questions
- `docs/decisions/README.md`: what was decided and why (append-only, with a topic index at the top)
- `docs/ideas/`: one file per mechanic (index and statuses in `docs/ideas/README.md`)
- `docs/explorations/`: dated thinking sessions (index in `docs/explorations/README.md`)
- `docs/reference/`: Magicka notes and research on other games
- `docs/archive/`: old worklogs

## Code
- `game/`: the game (TypeScript, PixiJS v8, a deterministic sim, rollback netcode over WebRTC). See `game/README.md`.
- `tools/`: the review pages above (plain HTML/JS, published as artifacts)
- `prototypes/01-skeleton/`: the first TypeScript + Vite + Canvas2D skeleton, superseded by `game/` (`npm install && npm run dev`)
