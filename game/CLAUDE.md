# game/ (guidance for Claude)

Read `game/README.md` first: commands, layout and the determinism rules.

- Work from `game/`. Before calling a change done, run `npm run check`. If the change touches the client or the sim, also run `npm run check:browser`; if it touches netcode, the lobby or input, `npm run check:net` (and `check:webrtc` for the WebRTC bus). Take a screenshot with `npm run shot` after client changes, and look at it.
- The sim (`packages/sim`) must stay pure. If `purity.test.ts` fails, fix the code; don't loosen the test unless the user agrees. Everything gameplay-related goes in `buffers()`.
- The golden hash changes only on purpose. Re-record it in `packages/sim/test/golden.json` and say why in your reply and in the commit.
- The spell rules' source of truth is still `tools/spell-atlas/rules-c.js`. After changing it, run the Atlas audits and then `npm run sync-rules`.
- Headless Chrome: the scripts start their own `vite preview` on port 4187 and stop only that process. Never kill Chrome or other node processes broadly; other sessions' servers may be running (an old skeleton preview sits on 4173 and 4180).
- The rooms are LDtk maps in `content/maps` (`content/README.md`). Never edit `packages/sim/src/rooms.gen.ts` by hand: change the maps (the LDtk JSON, or `npm run content -- grid <room> --write`), then `npm run content:build` and `npm run content:check`. A ported or edited room that should play the same must keep the golden hash and its bot runs' hashes.
- Prefer porting from `prototypes/01-skeleton` (input buffer, gamepad, flow fields, wave director) over rewriting, but convert its object state to typed arrays as you port.
