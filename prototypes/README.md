# Prototypes

Each prototype lives in `NN-short-name/` (e.g. `01-element-queue/`) and is self-contained.

Every prototype README covers:
1. **Question:** the one thing this prototype tests ("Does queuing elements onto a teammate feel good?").
2. **Run:** the exact command(s) to start it.
3. **Findings:** filled in after playing. What was learned, and what changed in `docs/` as a result.

Prototypes are disposable. Once one has answered its question, it's done. Any shared code is extracted only after two prototypes need it.

## The prototypes

| Prototype | Question | Status |
|---|---|---|
| [01-skeleton](01-skeleton/) | A first playable of proposal A (TypeScript + Vite + Canvas2D): casting, waves, gamepads. Published at https://claude.ai/artifact/HmEKJfEUvzY7amrNTCXHSv. | **Superseded by `game/`** (2026-11-04). Its input buffer, gamepad mapping, flow fields and wave director were ported there. Kept as a record. |

New mechanics are now usually tried straight in `game/` (the user's "build optimistically"); a prototype here is still the right tool when a question needs a throwaway test outside the game.
