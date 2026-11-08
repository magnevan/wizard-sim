# Field Atlas

A seeded world-map generator, the first of the map approaches (`docs/explorations/2026-11-07-world-and-progression.md`, R3.8). Land, mountains, rivers and climate come first; the seven fields are derived from them; towns are placed where two fields are strong and named by the pair (`PAIRS`), never with proper names (naming is the user's). Two looks: Atlas (inked paper) and Fields (the diagram); `#fields` opens the second.

- Published: https://claude.ai/artifact/GcPxANHrBCEXTC3ioembus (single `index.html`, capability `db`).
- Kept worlds: db collection `seeds`, one doc per seed (`seed-<n>`): {seed, mark: keep/no, note}.
- Answers: db collection `answers` (`q-1-approach`, `q-2-look`, `q-3-scale`, `q-4-rules`, `general`): {choice, note}.
- The generator is deterministic per seed, so a kept seed can be re-rendered at any size or in a new style later.
