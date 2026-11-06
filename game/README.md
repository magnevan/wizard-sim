# game/

The real game, after the design phase. The stack is in `docs/decisions/` (2026-11-04: Engine stack): **PixiJS v8 for drawing, our own deterministic TypeScript sim, Electron for Steam later.** Online play runs rollback netcode (`RollbackSession`, a 2-tick input delay) over WebRTC; the decision began as "lockstep first" and moved to rollback on 2026-11-04 (`docs/decisions/`: "Netcode is rollback"). The research behind the stack is in `docs/explorations/2026-11-04-engine-options.md`. The game is public at https://magnevan.github.io/wizard-sim/.

## Run

```sh
cd game
npm install
npm run dev            # http://localhost:5187: hold LMB to walk, QWER ASDFG elements, RMB to Force cast, Esc to clear (empty queue: the menu)
npm run dev:lan        # the same, reachable from other machines on the network (for a second player)
npm run check          # typecheck all packages + every test (sim determinism, rules sync, purity)
npm run check:browser  # build, then run the golden replay in headless Chrome; its hash must match node's
npm run check:net      # build, then two headless pages host, join and play a co-op match, then over a
                       # simulated slow link, then one reloads and rejoins (BroadcastChannel)
npm run check:menu     # build, then the Esc menu in headless Chrome: Esc opens / pauses / clears / closes, hosting and
                       # switching the scenario from the keyboard; screenshots in shots/ (--out dir)
npm run check:tutorial # build, then in headless Chrome: key 4 into the tutorial and key 1 back out, in place, and the
                       # end card's Survive arch lands you in Survive; no page errors
npm run check:webrtc   # the same as check:net over real WebRTC (needs internet: PeerJS's public signalling server)
npm run build && npm run shot -- --ms 4000 --out shots/run.png   # headless screenshot of the scripted run
                       # (also --size 1280x800, --query "room=arena&autoplay=1": any URL params below)
npm run shots:tutorial # build, then one screenshot per tutorial beat, a bot playing it (shots/tutorial; --beats 1,2 --ms 2500)
npm run preview        # serve the last build (vite preview)
npm run artifact       # build + package artifact/ for a claude.ai link
npm run sync-rules     # after a rules change in tools/spell-atlas/rules-c.js
npm run audit          # inert additions in play: every queue of up to 3 runes cast every way, an added element
                       # that changes nothing is listed -> tools/audit-report.json (the Atlas audits check the rules text)
npm run balance        # the balance harness: measures every common spell and bot wave runs -> tools/balance-report.json
npm run balance:weapons # every weapon's Strike, Heavy and Sweep spammed vs the same element's spell, 10 s and 30 s -> tools/weapon-dps-report.json
npm run perf           # build, then step() timed in node (Arena, Survive wave 12, the golden replay; prints the hashes) and four
                       # busy scenes in headless Chrome: ms per frame (sim / help / draw / render), draw calls, KB uploaded to
                       # the GPU and KB allocated per frame. -- --only survive-w12 --size 1920x1080 --profile dir --shots dir --out f.json
```

**Performance** (`docs/explorations/2026-11-06-performance.md`): in headless Chrome, compare the p50 frame time and the bytes uploaded and allocated per frame. The mean and p95 are mostly SwiftShader stalls. The usual costs: the two effect canvases are redrawn and re-uploaded every frame (they cover the view, not the whole field: `art/vfx.ts` `view()`), a new actor frame re-uploads its 256 px atlas page, and in the sim, enemy steering and wall collision. `?perf=1` records per-frame timings on `wizardSim.perf`.

URL params (`packages/client/src/main.ts` lists them too):
- **Rooms:** `?room=arena` (the waves; the default is the Sanctum with dummies), `?room=survive` (Survive: endless waves in a walled arena, a power-up pick between waves), `?room=tutorial` (the tutorial; `&beat=N` starts at beat N). Artifact links carry no query string, so the `#anchor` works as well: `#arena`, `#survive`, `#tutorial`, `#tutorial-7`, `#ally`, `#arena-ally`. In the game the 1 / 2 / 3 / 4 keys switch between the Sanctum, the Arena, Survive and the tutorial (in place, not online).
- **Players:** `?ally=1` (a bot wizard on seat 1), `?local=N` (the camera follows seat N only, as a networked player's screen would), `?net=bc` (online co-op between tabs on one machine, BroadcastChannel), `?timerloop=1` (timers instead of animation frames, so a background tab keeps running; the co-op e2e test).
- **Headless runs and screenshots:** `?autoplay=1` (bots fight the Arena, or play the tutorial through with `room=tutorial`), `?script=1` (the scripted two-wizard run), `?spell=arcane,fire/force` (both seats cast one spell at the dummies, `&spell2=` for seat 1; casts force, area, place, self, weapon, drag, hold, holddrag, guard, wait, and with nothing queued strike, heavy, special, retreat, block (`?spell=sigil+cold/weapon;/heavy`); `@x,y` sets the target and `;` chains spells one per cycle, see `demo.ts`), `?scene=rally` and `?scene=three` (Survive: a Rally in progress, or +1 to three half chosen), `?scene=enemyattacks` (every enemy frozen at one beat of its attack, `&phase=wind|strike|impact|recover|loop`, `&face=` turns; `art/enemy-attacks.ts`), `?selftest=1` (no rendering; runs the golden replay, `&ticks=N`, and writes its hash to `<html data-hash>`).
- **Panels:** `?tune=1` (the tuning panel at boot), `?help=1` (the help panel at boot; `?helpq=water,cold` or `?helpq=hands:water:tide` shows a queue or hands, `?helphint=1` the first-session hint), `?menu=scenarios` (the Esc menu at boot on a section; `&menuAt=N` at tick N).
- **Debugging and display:** `?perf=1` (record per-frame timings for `npm run perf`), `?pauseAt=N` (pause the sim at tick N; cosmetic animation keeps running on real time), `?structoff=walls,waves,devices,wizards,preview,fx` (hide parts of the structure view), `?scale=N`, `?lights=0`, `?debug=0`, `?renderer=webgpu`.

**The Esc menu** (`packages/client/src/menu.ts`; `docs/explorations/2026-11-06-esc-menu.md`): Esc with runes queued clears them; with an empty queue it opens the menu (Start / Options on a gamepad). Resume, Scenarios, Multiplayer (the same lobby as the Co-op panel), Controls, Settings. Offline it pauses the sim; online the match keeps running. The number keys work in it too (offline), and while it's open a gamepad's D-pad moves the menu rather than opening the help panel. The scenarios are one registry, `packages/client/src/scenarios.ts` (id, name, one line, room, key): a new room is one entry there, and it shows greyed until the sim has the room. Online, only the host switches the scenario and everyone follows (`NetPlay.switchRoom`). Gamepads join seats 1–3 with any button.

**Online co-op:** the Co-op panel (bottom left) hosts or joins a match. On the hosted page and the dev server it runs over WebRTC (Create room, share the four-letter code); `?net=bc` plays between tabs on one machine; on claude.ai it uses the artifact's room. The lobby checks the build and the tuning hash; the match runs `RollbackSession` (2-tick input delay, 1 s rollback window). Remote aim is guessed in world space: a cursor resting on the floor stays there while its wizard walks, and a steady sweep carries on. A remote spell that arrives late is drawn from its first frame and catches up over 0.15 s instead of popping in mid-flight. A player who goes quiet for 2.5 s, or closes the tab, is dropped: the others agree on the last tick anyone holds from them and carry on, their wizard standing still. Anyone can then take the empty seat with **Rejoin** (a reload, or re-entering the room code), starting from a gzipped snapshot. The tuning panel (F1) has a **Network test** section: added lag, jitter and loss on this page's traffic, the input delay, and switches that turn both guesses back off for comparing (rewinds per second and wrong guesses are shown live). Code: `packages/client/src/net/`, `packages/net/src/rollback.ts`.

**Tuning panel:** F1 (or the Tune button, or `?tune=1`) opens it. Every number in the sim is a slider; changes apply next tick and persist in the browser; Export / Import share a tuning as JSON. While it's open: N spawns the chosen enemy at the cursor, P pauses, `.` steps one tick. Tools: infinite runes, god mode, time scale, start wave N, skip the lull. Meters: DPS, damage per rune by spell, runes per minute, time-to-kill per enemy, wave clear times. The registry is `packages/sim/src/tuning.ts`; the panel is `packages/client/src/tune-panel.ts`.

**Help panel:** F2 (or the ? button, or D-pad up on a gamepad) slides out a panel on the right that says what your queued runes will do: one row per gesture, with its key, the spell's name and text from the rules, and a live preview (a tiny world of its own, drawn by the game's view). With nothing queued it shows your hands' moves. Shift+F2 shows the numbers. `?help=1` opens it at boot; `?helpq=water,cold` or `?helpq=hands:water:tide` shows a queue or hands for screenshots. Code: `packages/client/src/help-panel.ts`, `help-model.ts` (pure, tested) and `help-preview.ts`. The previews warm up slowly under headless Chrome's virtual time, so `npm run shot` with the panel open can take minutes; a real-time puppeteer screenshot is quicker.

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
    tutorial.ts, tutorial-data.ts, tutorial-bot.ts   the tutorial's beats (state in world.tut), their pools and places, a bot
    hands.ts, guards.ts   your hands' moves with nothing queued: the weapons, and the eight guards
  net/     @wizard-sim/net: LockstepSession and RollbackSession (what matches run) over a swappable unreliable Transport
           (loopback hub for tests; the client's WebRTC bus, BroadcastChannel and artifact room; Steam later)
  client/  @wizard-sim/client: Vite + PixiJS v8. The loop (main.ts), keyboard and gamepads -> PlayerInput (input.ts, gamepad.ts),
           the view (view.ts, reads the sim and never writes it), the HUD (hud.ts), structures and telegraphs
           (view-structures.ts), and the Battlefield / VFX gallery art ported into art/ (rigs, frame cache, floor, effects, lights).
           The Esc menu (menu.ts, menu-nav.ts) and the scenario registry (scenarios.ts); the help panel (help-panel.ts,
           help-model.ts, help-preview.ts); the tuning panel (tune-panel.ts); the tutorial's look and text (tutorial-view.ts, tutorial-text.ts).
scripts/   sync-rules, browser-check, screenshot, make-artifact (serve.mjs is shared: vite preview + headless Chrome)
```

## The rules that keep it deterministic

These matter from day one, because rollback (like lockstep) only works if every peer computes the same bits:

- **The sim sees only `PlayerInput` records and its own state.** No `Date.now`, `performance.now`, timers, promises, DOM or network. The client owns real time and decides how many steps to run.
- **Exact maths only:** `+ - * /`, `Math.sqrt`, `floor`, `round`, `abs`, `min`, `max`, `imul`. Use `trig.ts` instead of `Math.sin`, `cos`, `atan2`, `pow`, `exp` or `**`. Those may differ between V8, SpiderMonkey and JavaScriptCore.
- **Randomness comes from the world's RNG.** Cosmetic randomness (particles, shake) uses its own generator in the client.
- **State lives in typed arrays listed in `buffers()`.** That is what snapshot, restore and the hash walk. A new state array that isn't added there is a desync waiting to happen.
- **Iterate entity pools by slot index.** No `Map`, `Set` or `for…in` for gameplay state, and every `sort` gets a comparator.
- **Events are output, not state.** `world.events` is rebuilt every step for the view (VFX, sound). With rollback, the view keys them by (tick, entity, kind).

`test/purity.test.ts` enforces the source rules. The golden replay (`test/golden.json`) catches unintended behaviour changes. `check:browser` catches divergence between engines. **When a gameplay change moves the golden hash on purpose, re-record it and say so.**

## Status

Milestone 1 (deterministic core) is done, and the game has grown past it (online co-op, weapons and guards, Survive). Built in the sim, with tests for each:
- **Runes and the queue:** reserved on queue, spent on cast, refunded on clear or cancel; regen is one shared budget (R runes/s split among the pools that aren't full, by max, with a floor: `regenRate` in `world.ts`); Attune.
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
  - the sculpting wand, conjured weapons with reach
  - the Double (pure Sigil on yourself): a copy that follows you and repeats your spells at half power
  - auras: fire, frost, mist, regeneration, bulldoze, haste, glass cannon
- **Enemies:**
  - six archetypes with telegraphs: goblin, brute, shieldbearer, archer, grabber, fire imp
  - steering around rock on flow fields
  - the Arena's wave director with portals, lulls and breathers
  - downed wizards are out until the wave ends (in Survive, anyone can Rally them mid-wave)
  - every attack drawn in four beats: telegraph, strike, impact, recovery (client only, `art/enemy-attacks.ts`)
  - the tutorial's passive targets: the straw goblin and the bramble (rooted; only fire hurts it), flags in `archetypes.ts`
- **Joining:** a new player joins through the input record (`BTN.join`). Gamepads join seats 1–3 with any button (`packages/client/src/gamepad.ts`, polled in `main.ts`).

**Weapons and guards** (grammar v2; designed in `docs/explorations/2026-11-05-guards.md`, revised by the user's ratings through round 4 in `docs/explorations/2026-11-05-guards-round-2.md`). With nothing queued, your hands act:
- RMB tap = Strike, RMB hold = the weapon's Heavy, Shift+RMB = its Special (some are held), Space = your guard's Defend (hold to block, tap as a hit lands to parry), Shift+LMB = its Retreat.
- **Weapons** (`packages/sim/src/hands.ts`), Heavy / Special: bare staff (big shove / Sweep), Tide trident (wave slash / Sweep), Healing hands (Healing link / **Mend**, held), Frost spear (impaling dash / javelin), Lightning whip (chain lash / Sweep), **Arcane wand** (Strike a light bolt, Heavy a charged piercing bolt / **Siphon**, held: rooted, runes regenerate fast), Flame sword (fire wave / Sweep), Stone maul (fissure / Sweep).
- **Eight guards** (`packages/sim/src/guards.ts`), one per lead element: Mirror buckler, Bulwark, Ember targe, Rime kite, Spark ring, Tide shield, **Prism** (a Capacitor: it stores what its raised block takes, and lowering it fires the **Lance**), Leaf aegis. Each has its Defend, Retreat, passive and resistances while carried.
- **Mixing:** the strongest element leads (Life > Earth > Arcane > Lightning; else the most runes of Water, Fire or Cold). Every other element brings its passive and resistance row (half per rune, all at 2). The Leaf takes only the extras' strengths; the other guards' extras are a coat that bites whoever hits the block. Resistance is hyperbolic (damage taken 1 / (1 + r)). Each guard rune past the first adds 15 % guard HP and Retreat distance. Source: `docs/explorations/2026-11-05-guards-round-2.md` ("Merged" and after).
- Numbers: `ARMS` in `config.ts`.

Not yet: audio, campaign rooms.

`?room=arena` runs the waves. The default is the Sanctum, with three practice dummies.

**Survive** (`#survive`, `docs/explorations/2026-11-05-survive-mode.md`): a walled arena (gate funnels, cover, pillars: static rock that never breaks), endless waves (wave → 3 s breather → pick → 6 s lull), and between waves three altars with power-ups: each player stands on one for 0.75 s. When everyone is down, the run ends; Space starts a new one (an input, so it works online). Its state is `world.run`, which only a survive world has, so the other rooms' layout and the golden hash are untouched; `runeMax` / `regenOf` give per-seat rune max and regen (the config values outside Survive). Survive starts at 2 runes per element (Sigil 1) and refills every pool when a wave is cleared. Twelve power-ups are built: +1 to three (tap three element keys after stepping on it; `chooseElement`), Deep (element), Wellspring (+15 % R), +1 Shield and +1 Sigil, Bedrock, Pyre, Mirror charm, Clockwork (turrets bind no Sigil rune), Echo (until the next wave is cleared, every spell goes off again 0.4 s later, free), Glass heart, Lingering (what you place lasts 1.5× as long, 1.25× as wide) and Quickstep (a permanent +15 % Haste a stack); numbers in `PERKS`. Echo's pending repeats are state in `world.run` too (`echo*`). Any wizard can Rally a downed ally (stand by them for 3 s). `?room=survive&scene=rally` with a headless loop (the screenshot script) stages a rally; `scene=three` stages +1 to three half chosen. The tuning panel's Survive line restarts a run or gives P1 a power-up.

**The tutorial** (`#tutorial`, key 4; `docs/explorations/2026-11-06-tutorial.md`): the first prototype cut, eight beats in one chamber and an end card. Its state is `world.tut` (only a tutorial world has one, like `run`); the beats' setup and checks are `packages/sim/src/tutorial.ts`, their pools and places `tutorial-data.ts`, and the prompt text `packages/client/src/tutorial-text.ts`. `#tutorial-N` (or `&beat=N`) starts at beat N; `?room=tutorial&autoplay=1` has a bot play it (`tutorial-bot.ts`). `npm run shots:tutorial` screenshots every beat; `npm run check:tutorial` switches into and out of it in Chrome.

### Milestone 1: deterministic core (the user's pick)

Two wizards on one machine, the Atlas rules driving real casts, the Pixel Battlefield look, and a replay that hashes the same in node and in the browser.

1. ~~The cast pipeline~~, ~~spell shapes, statuses, surfaces~~, ~~structures~~, ~~enemies and waves~~ (steps A–C).
2. ~~**The look** (step D)~~: the Pixel Battlefield actors, floor, lights and HUD and the VFX gallery's effects and deaths are ported (`packages/client/src/art/`). New effects keep being added as features land.
3. ~~**Local co-op** (step E)~~: gamepads join seats 1–3 in the loop (`gamepad.ts`, `main.ts`), and the camera frames everyone (`camera.ts` follows the living wizards in an arena bigger than the view, such as Survive's). Online co-op came on top (above).
4. The rules stay as the generated copy of the Atlas's `rules-c.js` (Claude's call: the Atlas is where the user reviews rules, so one source is simpler than a TypeScript port; the typed wrapper covers what the game needs).

Open:
- **Rendering through a low-res target.** The scene draws straight to the stage at an integer scale, which is pixel-exact for unrotated sprites. Drawing into a low-res RenderTexture first would also snap rotated or scaled effects to the art grid. In headless Chrome (SwiftShader and D3D11), the target held the pixels but its sprite never reached the presented frame. Revisit with a real browser when the effects need rotation.
- **Balance** is placeholder everywhere (`packages/sim/src/config.ts`).
