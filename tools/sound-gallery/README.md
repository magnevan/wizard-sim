# Sound Gallery

The game's sounds for the user to rate (`docs/explorations/2026-11-06-sound.md`): every element layer and cast shape, a spell mixer, and the rune, room and wall variations side by side.

The page plays the game's own engine and recipes, so a recipe sounds the same here and in the game. Don't edit `engine.js` or `bank.js`: they are generated from `game/packages/client/src/audio/` and the sample bank.

```
cd game
npm run audio:bank      # after changing content/audio/bank.json or its sources
npm run sound-gallery   # rebuilds engine.js and bank.js here
npm run check:sound     # renders every sound offline in headless Chrome and checks levels; screenshots in shots/
```

To publish: `index.html` with `engine.js` and `bank.js` as its files, and `capabilities: { db: {} }`. The sample bank is base64 inside `bank.js`, so the page fetches nothing.

## Feedback

- `ratings`: one doc per sound, by its id (`el-fire`, `shape-nova`, `var-env-cave`, `mixer`...): `{ mark: keep | maybe | cut, note }`.
- `answers`: `q-1-feel`, `q-2-source`, `q-3-element-identity`, `q-4-variations`, `q-5-ai-sfx`: `{ note }`.
