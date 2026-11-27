# game/ (guidance for Claude)

Read `game/README.md` first: commands, layout and the determinism rules.

- Work from `game/`. Before calling a change done, run `npm run check`. If the change touches the client or the sim, also run `npm run check:browser`; if it touches netcode, the lobby or input, `npm run check:net` (and `check:webrtc` for the WebRTC bus), plus `check:net3d` for the 3D game. The pixel checks load `classic.html`; the deployed `index.html` is the 3D game. Take a screenshot with `npm run shot` after client changes, and look at it.
- The sim (`packages/sim`) must stay pure. If `purity.test.ts` fails, fix the code; don't loosen the test unless the user agrees. Everything gameplay-related goes in `buffers()`.
- The golden hash changes only on purpose. Re-record it in `packages/sim/test/golden.json` and say why in your reply and in the commit.
- The spell rules' source of truth is still `tools/spell-atlas/rules-c.js`. After changing it, run the Atlas audits and then `npm run sync-rules`.
- Headless Chrome: the scripts start their own `vite preview` on port 4187 and stop only that process. Never kill Chrome or other node processes broadly; other sessions' servers may be running (an old skeleton preview sits on 4173 and 4180).
- The rooms are LDtk maps in `content/maps` (`content/README.md`). Never edit `packages/sim/src/rooms.gen.ts` by hand: change the maps (the LDtk JSON, or `npm run content -- grid <room> --write`), then `npm run content:build` and `npm run content:check`. A ported or edited room that should play the same must keep the golden hash and its bot runs' hashes. Exception: the court comes from its kit scene: after editing `tools/kit/scenes/court.scene.json`, run `python tools/kit/room.py court`, then `npm run content:build` (see `docs/threads/port-3d.md`).
- After a sim or rules change, run `npm run audit`, `balance`, `balance:weapons` and `scaling` and commit their `tools/*-report.json` with the change, so the committed reports describe the committed game.
- **URL options:** a new `?key` goes in `packages/client/src/dev-options.ts` (label, help, kind, `live` if it applies without a reload) and is read with `opt()` / `optOn()` / `optNum()`, never `URLSearchParams`; the Tune panel's URL options section then shows it, and `test/dev-options.test.ts` checks both the code and the scripts' URLs. When you tell the user about one, name it both ways: Tune › URL options › its label, or `?key=`.
- New `scripts/*.mjs`: its first lines give a usage line naming the script itself, and it gets an npm script or a line in `README.md`.

**How to check an effect fast.** Start `npm run fx-serve` once in the background (the effects lab's dev server on 5199, HMR off, so nobody's edit reloads a page mid-shot), then `npm run fx-sheet -- "<recipe>" ["<recipe>;t=..;view=.."] --t 0.1,0.5,1.5,4`: one browser, the lab page frozen and seeked to each moment (no reload), one labelled sheet per job in `shots/fx/`; Read the PNG. One suspect at a time: `--off floor.gas,wave.sparks` (`?fxoff=`, `view3d/fx-off.ts`: name a mesh to make it switchable). Motion: `--clip 3` (an mp4 plus a sheet of its frames). `--tiles` adds the lab's own tiled sheet. Prefer this over `clip:fx` and one-off puppeteer scripts.

**Shell patterns that work here.** The worktree guard refuses compound or `cd`-ing commands: run plain, separate ones. For multi-spot edits use the Edit tool, or write a JSON list and run `npm run edit-replace -- file.json` (all or none, says which `old` is missing or not unique) instead of inline python/sed. For a quick sim question, write `shots/tmp/<name>.probe.ts` (wrap it in `it('probe', ...)`, see `tools/example.probe.ts`) and `npm run probe -- shots/tmp/<name>.probe.ts`: console.log prints. Ordinary tests must sit in a package's `test/` to be found.

Code rules from the 2026-11-12 audit (each one caught a real bug):
- **Rune pools:** loops over pools run `1..KEYED_EL` and cost through `poolCost`; Ice has no pool (max 0), so nothing may charge, grant or pick it directly.
- **Directions** passed to `addKnock` / `hitOpts` are unit vectors: normalise, or pick an explicit axis; no `dx || 1` fallbacks.
- **Credit:** every `ignite` / hit names its real source (the caster or attacker), never `b.burnSrc[target]`.
- **Removing or renaming a config field:** grep its dotted id in `tuning.ts` HELP and in the client (a test covers the tuning part).
- **Client async:** after every `await` in `net/` and in asset loads, re-check that the match, session or load ticket is still current before acting; every `bus.on` is unsubscribed or gated on "still current". Each reset path bumps the ticket.
- **Art helpers:** before adding a helper or palette to `art/*`, grep `art/kit.ts`, `art/px.ts` and `art/util.ts`; one definition each. Imports go at the top, one line per module.
- **Tests:** fuzz and property tests collect failures and assert once, and stay under 5 s alone, so full runs don't time out under load. When a timing-sensitive check fails (`check:net`), run it on the base commit before calling it a regression, and say so.
- **Docblocks** sit on the declaration they describe; never two `/** */` blocks in a row.
- Prefer porting from `prototypes/01-skeleton` (input buffer, gamepad, flow fields, wave director) over rewriting, but convert its object state to typed arrays as you port.
