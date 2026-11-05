# game/

The real game, after the design phase. The stack is in `docs/decisions/` (2026-11-04: Engine stack): **PixiJS v8 for drawing, our own deterministic TypeScript sim, lockstep netcode later, Electron for Steam later.** The research behind it is in `docs/explorations/2026-11-04-engine-options.md`.

## Run

```sh
cd game
npm install
npm run dev            # http://localhost:5187: hold LMB to walk, QWER ASDFG elements, RMB to Force cast, Esc to clear
npm run check          # typecheck all packages + every test (sim determinism, rules sync, purity)
npm run check:browser  # build, then run the golden replay in headless Chrome; its hash must match node's
npm run check:net      # build, then two headless pages host, join and play a co-op match, then over a
                       # simulated slow link, then one reloads and rejoins (BroadcastChannel)
npm run check:webrtc   # the same over real WebRTC (needs internet: PeerJS's public signalling server)
npm run build && npm run shot -- --ms 4000 --out shots/run.png   # headless screenshot of the scripted run
npm run artifact       # build + package artifact/ for a claude.ai link
npm run sync-rules     # after a rules change in tools/spell-atlas/rules-c.js
npm run balance        # the balance harness: measures every common spell and bot wave runs -> tools/balance-report.json
```

URL params: `?room=arena` (the waves; the default is the Sanctum with dummies), `?room=survive` (Survive: endless waves in a walled arena, a power-up pick between waves), `?ally=1` (a bot wizard on seat 1), `?autoplay=1` (bots fight the Arena, for screenshots), `?script=1` (the scripted two-wizard run), `?spell=arcane,fire/force` (both seats cast one spell at the dummies; casts force, area, place, self, weapon, drag, hold, holddrag, guard, wait, and with nothing queued strike, heavy, special, retreat, block (`?spell=sigil+cold/weapon;/heavy`); `@x,y` sets the target and `;` chains spells one per cycle, see `demo.ts`), `?pauseAt=N` (pause the sim at tick N; cosmetic animation keeps running on real time), `?structoff=walls,waves,devices,wizards,preview,fx` (hide parts of the structure view), `?selftest=1` (no rendering; runs the golden replay and writes its hash to `<html data-hash>`), `?scale=N`, `?lights=0`, `?debug=0`, `?renderer=webgpu`. Artifact links carry no query string, so `#arena`, `#survive`, `#ally` and `#arena-ally` work as well, and the 1 / 2 / 3 keys switch between the Sanctum, the Arena and Survive. Gamepads join seats 1–3 with any button.

**Online co-op:** the Co-op panel (bottom left) hosts or joins a match. On the hosted page and the dev server it runs over WebRTC (Create room, share the four-letter code); `?net=bc` plays between tabs on one machine; on claude.ai it uses the artifact's room. The lobby checks the build and the tuning hash; the match runs `RollbackSession` (2-tick input delay, 1 s rollback window). Remote aim is guessed in world space: a cursor resting on the floor stays there while its wizard walks, and a steady sweep carries on. A remote spell that arrives late is drawn from its first frame and catches up over 0.15 s instead of popping in mid-flight. A player who goes quiet for 2.5 s, or closes the tab, is dropped: the others agree on the last tick anyone holds from them and carry on, their wizard standing still. Anyone can then take the empty seat with **Rejoin** (a reload, or re-entering the room code), starting from a gzipped snapshot. The tuning panel (F1) has a **Network test** section: added lag, jitter and loss on this page's traffic, the input delay, and switches that turn both guesses back off for comparing (rewinds per second and wrong guesses are shown live). Code: `packages/client/src/net/`, `packages/net/src/rollback.ts`.

**Tuning panel:** F1 (or the Tune button, or `?tune=1`) opens it. Every number in the sim is a slider; changes apply next tick and persist in the browser; Export / Import share a tuning as JSON. While it's open: N spawns the chosen enemy at the cursor, P pauses, `.` steps one tick. Tools: infinite runes, god mode, time scale, start wave N, skip the lull. Meters: DPS, damage per rune by spell, runes per minute, time-to-kill per enemy, wave clear times. The registry is `packages/sim/src/tuning.ts`; the panel is `packages/client/src/tune-panel.ts`.

## Layout

```
packages/
  rules/   @wizard-sim/rules: spell grammar C. rules-c.gen.js is generated from the Atlas's rules-c.js (the source of truth
           while rules are reviewed there); index.ts types it. Pure data and string logic, so it is safe in the sim.
  sim/     @wizard-sim/sim: the game. No DOM, no clock, no async, no Math.sin. tsconfig has no DOM lib and a test bans the rest.
    world.ts   all state, in fixed-capacity typed arrays (struct of arrays); buffers() lists them
    step.ts    step(world, inputs): one 60 Hz tick
    input.ts   PlayerInput: the 9-byte per-player, per-tick record (all that netcode will ever send)
    state.ts   snapshot / restore / hashWorld (FNV-1a over every state byte)
    replay.ts  record and run replays; script.ts is the scripted two-player golden run
    rng.ts     sfc32, state in a Uint32Array; trig.ts  sin / cos / atan2 from exact ops only
    compile.ts rules descriptor -> a mechanical shape (beam, spray, wall, turret...); config.ts all the numbers
    cast.ts    runes, the queue and the cast state machine; effects.ts the shapes in the world, missiles, zones, surfaces
    hit.ts     what a hit does (damage, healing, statuses, wards, the wand, guards); walls.ts + structures.ts Shield and Sigil
    archetypes.ts, enemies.ts, nav.ts, waves.ts   enemies, their steering and the Arena's wave director
    survive.ts the Survive mode: its waves, the altar pick, the run's end; power-ups are per-seat stacks in world.run
  net/     @wizard-sim/net: lockstep over a swappable unreliable Transport (loopback hub for tests; WebRTC / Steam later)
  client/  @wizard-sim/client: Vite + PixiJS v8. The loop (main.ts), keyboard and gamepads -> PlayerInput (input.ts, gamepad.ts),
           the view (view.ts, reads the sim and never writes it), the HUD (hud.ts), structures and telegraphs
           (view-structures.ts), and the Battlefield / VFX gallery art ported into art/ (rigs, frame cache, floor, effects, lights).
scripts/   sync-rules, browser-check, screenshot, make-artifact (serve.mjs is shared: vite preview + headless Chrome)
```

## The rules that keep it deterministic

These matter from day one, because lockstep (and later rollback) only works if every peer computes the same bits:

- **The sim sees only `PlayerInput` records and its own state.** No `Date.now`, `performance.now`, timers, promises, DOM or network. The client owns real time and decides how many steps to run.
- **Exact maths only:** `+ - * /`, `Math.sqrt`, `floor`, `round`, `abs`, `min`, `max`, `imul`. Use `trig.ts` instead of `Math.sin`, `cos`, `atan2`, `pow`, `exp` or `**`. Those may differ between V8, SpiderMonkey and JavaScriptCore.
- **Randomness comes from the world's RNG.** Cosmetic randomness (particles, shake) uses its own generator in the client.
- **State lives in typed arrays listed in `buffers()`.** That is what snapshot, restore and the hash walk. A new state array that isn't added there is a desync waiting to happen.
- **Iterate entity pools by slot index.** No `Map`, `Set` or `for…in` for gameplay state, and every `sort` gets a comparator.
- **Events are output, not state.** `world.events` is rebuilt every step for the view (VFX, sound). With rollback, the view keys them by (tick, entity, kind).

`test/purity.test.ts` enforces the source rules. The golden replay (`test/golden.json`) catches unintended behaviour changes. `check:browser` catches divergence between engines. **When a gameplay change moves the golden hash on purpose, re-record it and say so.**

## Status

Milestone 1 (deterministic core) is under way. Done in the sim, with tests for each:
- **Runes and the queue:** reserved on queue, spent on cast, refunded on clear or cancel; slow regen; Attune.
- **Cast rhythm:**
  - wind-up grows with the spell's size
  - Earth Force charges
  - channels are free for 5 s, then cost upkeep
  - recovery, with a short buffer so no press is lost
  - Blink is instant
- **Every plain form × cast:**
  - beams, sprays, arcs, rocks (pierce at full charge), ice shards
  - novas, quakes, discharges
  - patches, delayed blasts, geysers, strikes, springs
  - swings, the healing palm, self casts
- **Payload statuses and interactions:**
  - wet, burning, chill → freeze, stun, expose, knockdown
  - scald and freeze mixes
  - S2 shape mods (push, shatter, chain, burst)
  - Life spells only heal
  - friendly fire is on
- **Surfaces:** water, ice and fire on a floor grid. Lightning surges through water.
- **Shield:**
  - waves, rings, quick arcs and drawn walls
  - rock (hit points), barriers (turn shots back) and curtains (pulse their elements; Life heals)
  - wards, the mirror ward, stone armour (its coat bites melee attackers), the Mending ward
  - Model A energy drain
- **Sigil** (each binds a Sigil rune):
  - turrets that pay each shot from your pool
  - glyphs and line glyphs, orbitals, rune motes
  - the lens
  - the sculpting wand, conjured weapons with reach (the hook yanks)
  - auras: fire, frost, mist, regeneration, bulldoze, haste, glass cannon
- **Enemies:**
  - six archetypes with telegraphs: goblin, brute, shieldbearer, archer, grabber, fire imp
  - steering around rock on flow fields
  - the Arena's wave director with portals, lulls and breathers
  - downed wizards are out until the wave ends
- **Joining:** a new player joins through the input record (`BTN.join`). Gamepad mapping in `packages/client/src/gamepad.ts`.

**Weapons and guards** (round 2, `docs/explorations/2026-11-05-guards.md`, built on its recommendations pending the user's ratings): with nothing queued, RMB tap = Strike, RMB hold = the weapon's Heavy (wave slash, fire wave, fissure, impaling dash, chain lash, Healing link, the Echo), Shift+RMB = Special (Sweep, the spear's javelin, the Echo focus's Copy); Space = your guard's Defend (hold to block, tap as a hit lands to parry), Shift+LMB = its Retreat. Eight guards, one per lead element (`packages/sim/src/guards.ts`), with passives and resistances while carried. Numbers: `ARMS` in `config.ts`.

Not yet: audio, campaign rooms.

`?room=arena` runs the waves. The default is the Sanctum, with three practice dummies.

**Survive** (`#survive`, `docs/explorations/2026-11-05-survive-mode.md`): a walled arena (gate funnels, cover, pillars: static rock that never breaks), endless waves (wave → 3 s breather → pick → 6 s lull), and between waves three altars with power-ups: each player stands on one for 0.75 s. When everyone is down, the run ends; Space starts a new one (an input, so it works online). Its state is `world.run`, which only a survive world has, so the other rooms' layout and the golden hash are untouched; `runeMax` / `regenOf` give per-seat rune max and regen (the config values outside Survive). Ten power-ups are built: Deep pools, Deep (element), Wellspring, Spare sigil, Bedrock, Pyre, Slipstream, Mirror charm, Bloom, Clockwork. The tuning panel's Survive line restarts a run or gives P1 a power-up.

### Milestone 1: deterministic core (the user's pick)

Two wizards on one machine, the Atlas rules driving real casts, the Pixel Battlefield look, and a replay that hashes the same in node and in the browser.

1. ~~The cast pipeline~~, ~~spell shapes, statuses, surfaces~~, ~~structures~~, ~~enemies and waves~~ (steps A–C).
2. **The look** (step D): port the Pixel Battlefield actors, floor and HUD and the VFX gallery's effects. In progress.
3. **Local co-op** (step E): gamepads join seats (done in the sim and in `gamepad.ts`); wire them into the loop, and a camera that frames everyone.
4. The rules stay as the generated copy of the Atlas's `rules-c.js` (Claude's call: the Atlas is where the user reviews rules, so one source is simpler than a TypeScript port; the typed wrapper covers what the game needs).

Open:
- **Rendering through a low-res target.** The scene draws straight to the stage at an integer scale, which is pixel-exact for unrotated sprites. Drawing into a low-res RenderTexture first would also snap rotated or scaled effects to the art grid. In headless Chrome (SwiftShader and D3D11), the target held the pixels but its sprite never reached the presented frame. Revisit with a real browser when the effects need rotation.
- **Balance** is placeholder everywhere (`packages/sim/src/config.ts`).
