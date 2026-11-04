# Wizard Sim

A co-op, top-down spellcasting game inspired by Magicka: a design sandbox plus the game itself. Start with `docs/vision.md`.

**Play:** https://magnevan.github.io/wizard-sim/ (two to four players; open **Co-op online**, create a room and share the four-letter code).

This is a fan project with no connection to Magicka's makers, and it uses none of their code or assets.

## Feedback pages

These are private claude.ai pages where the design was rated. Links to claude.ai in the docs won't open for anyone else.
| Page | What it's for |
|---|---|
| [Spell Atlas](https://claude.ai/artifact/GiZ7G7eQ4pMqXLaPEZK6Cw) | **Start here.** The whole tree under proposal C, as a form × cast grid. Rate cells and answer the questions. |
| [Spell Wishlist Gallery](https://claude.ai/artifact/5GLNfuBM3npBdMBLefATSQ) | Animated spell scenes to rate (rounds 1–3 rated). |
| [Spell Tree Explorer](https://claude.ai/artifact/88XcXP6YU3iL35bTYuNL3X) | The older proposals A and A.1 (superseded by the Atlas). |
| [Art Style Explorer](https://claude.ai/artifact/33DELSAis34SSDvLJ69rwG) | The same fight in six art directions, with a chaos slider. Rate them. |
| [Skeleton prototype](https://claude.ai/artifact/HmEKJfEUvzY7amrNTCXHSv) | Playable (mouse and keyboard). See `prototypes/01-skeleton/PLAYTEST.md`. |

## Docs
- `docs/vision.md`: pillars
- `docs/explorations/`: dated thinking sessions, including the spell tree, its audit, encounters, and co-op Magicks
- `docs/ideas/`: one file per mechanic (index in `docs/ideas/README.md`)
- `docs/decisions/README.md`: what was decided and why
- `docs/reference/`: Magicka notes and research on other games

## Code
- `game/`: the game (TypeScript, PixiJS v8, a deterministic sim, rollback netcode over WebRTC). See `game/README.md`.
- `prototypes/01-skeleton/`: TypeScript + Vite + Canvas2D game skeleton (`npm install && npm run dev`)
- `tools/`: the gallery, explorer and art pages (plain HTML/JS, published as artifacts)
