# Field Atlas

A seeded world-map generator, the first of the map approaches (`docs/explorations/2026-11-07-world-and-progression.md`, R3.8). Land, mountains, rivers and climate come first; the seven fields are derived from them; towns are placed where two fields are strong and named by the pair (`PAIRS`), never with proper names (naming is the user's). Round 2 (`docs/explorations/2026-11-08-fantasy-map.md`) split it into `gen.js` (the world) and `chart.js` (the drawing), with three looks: Chart (the painted fantasy map), Chart + fields, and Fields (the diagram). QA hash: `#seed=42&look=chart&plate=1` shows just the map at full size, for a headless-Chrome screenshot at 2000x1600.

- Published: https://claude.ai/artifact/GcPxANHrBCEXTC3ioembus (publish `index.html` with `gen.js` and `chart.js`, capability `db`).
- Kept worlds: db collection `seeds`, one doc per seed (`seed-<n>`): {seed, mark: keep/no, note}.
- Answers: db collection `answers` (`q-1-approach`, `q-2-look`, `q-3-scale`, `q-4-rules`, `q-5-feel`, `q-6-names`, `q-7-fields`, `general`): {choice, note}.
- The generator is deterministic per seed, so a kept seed can be re-rendered at any size or in a new style later.
