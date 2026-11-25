# game/

The real game, after the design phase. The stack is in `docs/decisions/` (2026-11-04: Engine stack): **PixiJS v8 for drawing, our own deterministic TypeScript sim, Electron for Steam later.** Online play runs rollback netcode (`RollbackSession`, a 2-tick input delay) over WebRTC; the decision began as "lockstep first" and moved to rollback on 2026-11-04 (`docs/decisions/`: "Netcode is rollback"). The research behind the stack is in `docs/explorations/2026-11-04-engine-options.md`. The game is public at https://magnevan.github.io/wizard-sim/.

## Run

```sh
cd game
npm install
npm run dev            # http://localhost:5187: the game in 3D (index.html); the pixel game is /classic.html. Hold LMB to walk, QWER ASDFG elements, RMB to Force cast, Esc to clear (empty queue: the menu); ?runes=1 gives runes in the court
npm run dev:lan        # the same, reachable from other machines on the network (for a second player)
npm run check          # typecheck all packages + every test (sim determinism, rules sync, purity)
npm run check:browser  # build, then run the golden replay in headless Chrome; its hash must match node's
npm run check:net      # build, then two headless pages host, join and play a co-op match, then over a
                       # simulated slow link, then one reloads and rejoins (BroadcastChannel)
npm run check:menu     # build, then the Esc menu in headless Chrome: Esc opens / pauses / clears / closes, hosting and
                       # switching the scenario from the keyboard; screenshots in shots/ (--out dir)
npm run check:tutorial # build, then in headless Chrome: key 4 into the tutorial and key 1 back out, in place, and the
                       # end card's Survive arch lands you in Survive; every beat loads with the bot playing; the
                       # bot plays the hands test through to the next beat; no page errors
npm run check:academy  # build, then the Academy in headless Chrome: every prop set's images load, O / I and the URL options
                       # switch the art, a wizard can't enter a prop; screenshots in shots/academy (--out dir)
npm run check:iso      # build, then the isometric camera in headless Chrome: each room loads, its painted ground arrives, a
                       # wizard stands where the camera says, nothing errors; a screenshot of each (--out dir)
npm run check:battery  # build, then the battery: it loads from #battery, every prop arrives, the wall stops a wizard and the
                       # gate doesn't, nothing errors; screenshots from around the area (--out dir)
npm run massing        # after a build: shots of the drill yard with the academy concept's grey boxes (?massing=academy) in shots/massing-academy/
npm run check:yard     # build, then the drill yard: it loads from #yard, its stations and soldiers are there, X at the rack
                       # gives a charged focus, the gate goes on to the battery; screenshots of every station (--out dir)
npm run servers        # the local game servers across all worktrees: port, worktree, clients; kill and start (tools/servers/)
npm run check:sound    # build, then in headless Chrome: every sound of the Sound Gallery rendered offline through the game's audio graph (none
                       # silent or clipping, the variations really differ), then the game: sound starts on input, clips load, voices play,
                       # volumes persist, it runs with ?sound=0 and with no Web Audio; levels and screenshots in shots/
npm run audio:bank     # after changing content/audio: cuts and tunes the sample bank with local ffmpeg
npm run sound-gallery  # after changing the audio code or the bank: rebuilds tools/sound-gallery/engine.js and bank.js
npm run check:webrtc   # the same as check:net over real WebRTC (needs internet: PeerJS's public signalling server)
npm run check:net3d    # the same as check:net on the 3D game (index.html), on the real GPU; check:net and the other pixel checks load classic.html (scripts/serve.mjs BASE)
npm run build && npm run shot -- --ms 4000 --out shots/run.png   # headless screenshot of the scripted run
                       # (also --size 1280x800, --query "room=arena&autoplay=1": any URL option, see below)
npm run shots:tutorial # build, then one screenshot per tutorial beat, a bot playing it (shots/tutorial; --beats 1,2 --ms 2500)
node scripts/foliage-shot.mjs out.png --q "floor=cobble"   # (--frames 60 --dt 0.1 films the wind) the foliage lab (foliage.html: plants grown in code, lab/foliage.ts) from a dev server on port 5197
npm run shot:lab -- out 32,26 --query "layout=patch-b"   # a lab page (--page kit3d, the default) from the dev server, one shot per x,y (shots/lab)
npm run fps:lab -- 10  # a lab page's frame rate on the real GPU, headed Chrome (--page, --query); the page must animate and walk on WASD
npm run preview        # serve the last build (vite preview)
npm run artifact       # build + package artifact/ for a claude.ai link
npm run sync-rules     # after a rules change in tools/spell-atlas/rules-c.js
npm run content:build  # after editing the maps (content/maps, LDtk): compile them into packages/sim/src/rooms.gen.ts
npm run content:check  # the maps: LDtk schema, references, spawns clear of rock and reachable, rooms.gen.ts up to date
                       # (npm run check runs it too, as a test)
npm run content -- list                        # each room: size, hash, rock walls, entities
npm run content -- grid survive [--entities]   # a room's Terrain layer as text rows ('.' floor, '#' rock)
npm run content -- grid survive --write f.txt  # write edited rows back into the level file ('-' for stdin)
npm run audit          # inert additions in play: every queue of up to 3 runes cast every way, an added element
                       # that changes nothing is listed -> tools/audit-report.json (the Atlas audits check the rules text)
npm run scaling        # rune scaling: every form x cast at 1-5 runes, and every second rune -> tools/scaling-report.json
npm run balance        # the balance harness: measures every common spell and bot wave runs -> tools/balance-report.json
npm run balance:weapons # every weapon's Strike, Heavy and Sweep spammed vs the same element's spell, 10 s and 30 s -> tools/weapon-dps-report.json
npm run perf:3d        # build, then the 3D page's weight (scripts/perf3d.mjs; --gpu for the real GPU): draw calls, triangles,
                       # frame ms, first-load MB, time to the built scene, dist/ MB, and a shot -> shots/port-3d/weight/
npm run perf           # build, then step() timed in node (Arena, Survive wave 12, the golden replay; prints the hashes) and busy
                       # scenes in headless Chrome: waves, the help panel, the Academy, a stress case, and spells cast for real
                       # over and over (battery-idle/-patch/-spray/-ring in the battery, spell-<name> in the Sanctum): ms per
                       # frame (sim / help / draw / render), draw calls, KB uploaded to the GPU and KB allocated per frame.
                       # -- --only battery-patch,spell-frost-fog --size 1920x1080 --profile dir --shots dir --out f.json
```

One-off scripts with no npm entry (run after `npm run build`; each prints its usage in its first lines):
- **Shots for judging one effect:** `burst-shot` (the imbued bursts, a contact sheet), `caltrops-shot` (Ice Place), `coat-shot` (coated force fields, the imbue's skin, the stored spell), `fog-shot` (Cold Place), `ghost-shot` (a ghost rune and a pool in debt in the HUD), `light-shot` (spell light against a wall), `store-shot` (the stored spell's sigil), `arms-shots` (the wizard's conjured weapons and guards drawn live in 3D, five facings each; `--motion` adds a Strike and a block; needs a real GPU), `viewer-shots` (the dev Model Viewer at given hash states, for checking a model, clip, weapon or guard; needs a real GPU). `node scripts/blow-film.mjs --weapon trident --move strike|heavy|sweep` films a weapon move in the game itself (cast pose, 2D effects and all, after a Water Force as in real play; needs a real GPU), for what the Model Viewer leaves out. `node scripts/clip-paths.mjs <file.glb> [clip]` prints where a clip moves the hands, chest and hips in the body's own frame (forward, up, side; the chest's turn; which way the right hand travels), to check that a bought clip does what its prompt said before it goes in.
- **The VFX Lab** (`/vfx-lab.html` on the dev server, never built; `packages/client/src/lab/vfx-lab/`): any spell cast by a real wizard in a real world and drawn by the game's own view, in a scene (`empty`, `crowd`, `dark`, `coop`, `ally`: `scenes.ts`), e.g. `?spell=fire,fire,fire&form=force&scene=crowd&t=0.5`. `&t=` steps to that many seconds after the cast and sets `data-ready`, the same pixels every time; `&grid=runes` shows 1 to 5 runes side by side, `&spells=water;fire` a row per spell, `&times=0.1,0.3,0.6` a film strip, `&hit=1` the sim's hit shapes dotted over it, `&sweep=1` and `&move=1` a swinging aim and a walking caster; its side panel queues runes like the game (their keys work too), picks the cast, the scene, the mood and the seed, aims by dragging on the stage, plays, pauses, steps and scrubs, and holds the fx knobs, keeping the address bar in step. `window.vfxLab` (`ready`, `setTime`, `metrics`, `info`) is for capture tools. Every option is listed at the top of its `main.ts`.
- **Audits:** `occlusion-audit` (casts around walls and furniture, a cropped shot each, to check draw order by eye), `dither-check` (`art/px.ts`'s pattern-filled dithering gives exactly the per-pixel loops' pixels).
- **Performance:** `perf-sim` (sim timing in node; `perf.mjs` imports it), `gpu-info` (which GPU a `--gpu` perf run used).

**Performance** (`docs/explorations/2026-11-06-performance.md`): in headless Chrome, compare the p50 frame time and the bytes uploaded and allocated per frame. The mean and p95 are mostly SwiftShader stalls. The usual costs: the two effect canvases are redrawn and re-uploaded every frame (they cover the view, not the whole field: `art/vfx.ts` `view()`), a new actor frame re-uploads its 256 px atlas page, and in the sim, enemy steering and wall collision. `?perf=1` records per-frame timings on `wizardSim.perf`.

Chrome records 2D canvas calls and rasterizes them later, so in a profile the cost of many small fills shows up in `drawImage` or `texSubImage2D`, not `fillRect`: count the calls. Three traps the spell-effects pass found (`docs/explorations/2026-11-14-performance-spell-effects.md`): a canvas that has been drawn from is copied whole by the next write that leaves any of it standing, so a reused scratch canvas is cleared whole (`clearRect` over all of it), not just the part used; a pattern or image drawn into these CPU canvases must itself be a CPU canvas (`X.canvas`), or each use reads it back from the GPU; a pattern fill pays off only on long spans, so small shapes keep 1x1 fills; and a field-sized canvas must not be its own texture that changes often (the scorch marks were, re-uploading megabytes a frame in the battery): lay the part in view into a view-sized canvas instead.

**URL options** (`?room=arena&autoplay=1`, ...): every one is declared, with its help, in `packages/client/src/dev-options.ts`, and the Tune panel (F2) shows them all under **URL options** as controls that rewrite the address, so the panel and the URL set the same thing. A new option goes in that list (a test fails on code that reads the URL any other way, and on a script that loads the game with a key the list doesn't have). Artifact links carry no query string, so the `#anchor` picks the room as well: `#arena`, `#survive`, `#tutorial`, `#tutorial-7`, `#ally`, `#arena-ally`, `#yard`, `#battery`, `#terraces`. In the game the 1 to 8 keys switch rooms in place (`packages/client/src/scenarios.ts`). `node scripts/academy-shots.mjs` and `scripts/wizard-sheet.mjs` make the art trial page's shots. `node scripts/rig-lineup.mjs` writes the wizard, goblin, archer, brute and dummy rigs at 1x as PNGs (`shots/rigs/`), for sizing bought sprites against them (`--query "wizscale=1.4"` for the bigger wizard). `node scripts/wizscale-shots.mjs` shoots the battery at two wizard scales. Characters are drawn live from their 3D models by default (`art/live3d.ts`; models: `tools/sprites-3d/export.sh`); the View group's `live3d`, `sprites`, `wizsprite` and `wizscale` options switch that off or resize the wizard.

**Sound** (`packages/client/src/audio/`; `docs/explorations/2026-11-06-sound.md`): built the way spells are, each element a layer and each cast shape a structure (`recipes.ts`), with the variations in `variation.ts`. It's prepared in idle time after boot and starts on your first input, as browsers ask (making an AudioContext blocks the page for hundreds of ms, so it must not happen on that input); headless runs stay silent. `director.ts` turns sim events and state into sounds and holds the rollback rules: one-shots from shown steps only, late remote events after the replay, sustained sounds following the state. To add a sound, add a recipe, and a clip in `content/audio/bank.json` if it needs a recording; `content/audio/README.md` lists every source and licence. Rate them on the Sound Gallery (`tools/sound-gallery/`). A new room gets the hall reverb until it's listed in `ROOM_ENV`.

**The Esc menu** (`packages/client/src/menu.ts`; `docs/explorations/2026-11-06-esc-menu.md`): Esc with runes queued clears them; with an empty queue it opens the menu (Start / Options on a gamepad). Resume, Scenarios, Multiplayer (the same lobby as the Co-op panel), Controls, Settings. Offline it pauses the sim; online the match keeps running. The number keys work in it too (offline), and while it's open a gamepad's D-pad moves the menu rather than opening the help panel. The scenarios are one registry, `packages/client/src/scenarios.ts` (id, name, one line, room, key): a new room is one entry there, and it shows greyed until the sim has the room. Online, only the host switches the scenario and everyone follows (`NetPlay.switchRoom`). Gamepads join seats 1–3 with any button.

**Online co-op:** the Co-op panel (bottom left) hosts or joins a match. On the hosted page and the dev server it runs over WebRTC (Create room, share the four-letter code); `?net=bc` plays between tabs on one machine; on claude.ai it uses the artifact's room. The lobby checks the build and the tuning hash; the match runs `RollbackSession` (2-tick input delay, 1 s rollback window). Remote aim is guessed in world space: a cursor resting on the floor stays there while its wizard walks, and a steady sweep carries on. A remote spell that arrives late is drawn from its first frame and catches up over 0.15 s instead of popping in mid-flight. A player who goes quiet for 2.5 s, or closes the tab, is dropped: the others agree on the last tick anyone holds from them and carry on, their wizard standing still. Anyone can then take the empty seat with **Rejoin** (a reload, or re-entering the room code), starting from a gzipped snapshot. The tools panel (F3) has a **Network test** section: added lag, jitter and loss on this page's traffic, the input delay, and switches that turn both guesses back off for comparing (rewinds per second and wrong guesses are shown live). Code: `packages/client/src/net/`, `packages/net/src/rollback.ts`.

**Debug panels:** three DOM panels, each with a button in the top-right row and a key (their shared shell is `packages/client/src/debug-panel.ts`). Tune and Tools share the right edge (opening one closes the other); Stats opens on the left, so its numbers stay in view while you tune.
- **Tune** (F2, `?tune=1`): every number in the sim is a slider; changes apply next tick and persist in the browser; Export / Import share a tuning as JSON. The registry is `packages/sim/src/tuning.ts`; the panel is `tune-panel.ts`. Its **URL options** section lists every URL option (`dev-options.ts`): live ones apply at once, the rest (marked ↻) on a reload, and Copy link copies the address with them.
- **Tools** (F3, `?tools=1`): infinite runes, god mode, clear / refill / heal, time scale, pause and step, spawn an enemy, start wave N, skip the lull, Survive's new run and power-ups, and the Network test. While it's open: N spawns the chosen enemy at the cursor, P pauses, `.` steps one tick. `tools-panel.ts`; scripts reach it as `wizardSim.tools`.
- **Stats** (F4, `?stats=1`): fps, tick, state hash, scale, renderer, room, the view's counters, the network line and the tuned / dev-edited / paused flags; then the meters (DPS, damage per rune by spell, runes per minute, time-to-kill per enemy, wave clear times). `stats-panel.ts`. It replaces the old debug line in the top-left corner.

**Report box:** F8 (or Esc › Resume › Report an issue) opens `report.ts`: one line, Enter, and a pre-filled GitHub issue opens with where you are and the build's commit (`__BUILD_COMMIT__`, from `gitCommit()` in `vite.config.ts`); the frame goes to the clipboard. See `docs/tasks.md`.

**Help panel:** F1 (or the ? button, or D-pad up on a gamepad) slides out a panel on the right that says what your queued runes will do: one row per gesture, with its key, the spell's name and text from the rules, and a live preview (a tiny world of its own, drawn by the game's view). With nothing queued it shows your hands' moves. Shift+F1 shows the numbers. `?help=1` opens it at boot; `?helpq=water,cold` or `?helpq=hands:water:tide` shows a queue or hands for screenshots. Code: `packages/client/src/help-panel.ts`, `help-model.ts` (pure, tested) and `help-preview.ts`. The previews warm up slowly under headless Chrome's virtual time, so `npm run shot` with the panel open can take minutes; a real-time puppeteer screenshot is quicker.

## Layout

```
content/   the maps: maps/world.ldtk (LDtk 1.5.3) and one .ldtkl per room. README.md says how to open and edit them in LDtk.
           assets/props/<id>/: the asset registry (meta.json and images; client art/assets.ts, art/props.ts). generated/: raw AI images, never edited
           and what each Terrain value and entity means. audio/: sound sources, their licences, and the bank's recipe.
packages/
  content/ @wizard-sim/content (node only): the map build (LDtk -> sim/src/rooms.gen.ts), content:check (with LDtk's pinned
           JSON schema in schema/) and the grid CLI.
  rules/   @wizard-sim/rules: spell grammar C. rules-c.gen.js is generated from the Atlas's rules-c.js (the source of truth
           while rules are reviewed there); index.ts types it. Pure data and string logic, so it is safe in the sim.
  sim/     @wizard-sim/sim: the game. No DOM, no clock, no async, no Math.sin. tsconfig has no DOM lib and a test bans the rest.
    world.ts   all state, in fixed-capacity typed arrays (struct of arrays); buffers() lists them
    terrain.ts a room's static rock and blocking props, with a uniform grid for nearby queries: read-only, derived from the room, not in buffers()
    room.ts    RoomDef, a room's layout (size, terrain rows, rock, starts, dummies, portals, altars) and roomHash;
               rooms.gen.ts holds every room, generated from content/maps (npm run content:build; never edit it by hand)
    step.ts    step(world, inputs): one 60 Hz tick
    mode.ts    a mode's hooks (state, setup, press, director, late, runeMax, regen, pools, onSpawn); modes.ts the six modes
               (sandbox, arena, survive, battery, tutorial, yard) and which room runs which; create.ts createWorld. step.ts and
               world.ts call the hooks and never ask which mode they're in: a new mode is a new Mode, not a branch
    spawn.ts   spawnEnemy, the one way every director puts an enemy in the world
    possess.ts possession, a core mechanic: a wizard inside a fixture can't walk or be hurt and casts the way the
               fixture aims (mode.ts Possession: buttons, face, target, spray, splash, ring). The battery's defences are
               the first fixtures (modes.ts); a mode's EnemyRules (holdAt, restAt, target, standoff, shotRange) shape its enemies;
               Mode.leaveTo names the area the party walks on to (the yard's gate: the battery)
    yard.ts    the drill yard: stations along a path, sparring soldiers that wait at their spots, the charged focus
    encounter.ts  encounters as data: a Script of steps (groups once / in a list / in a loop, hold, until, wait, tick,
               after, enter, next, end) that runScript walks, with the room's own hooks; partyIn (a Region) and
               openAtMarkers (Markers by tag). Scripts: the battery's lesson (battery-waves.ts LESSON) and Survive's run
               (survive.ts SURVIVE_RUN: lull, wave, breather, pick, round again). The Arena's waves.ts is legacy and stays as it is
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
           Characters with a 3D model (the goblin warband, the wizard) are drawn live by art/live3d.ts (three.js, beside
           Pixi, through a shader port of the sprite pixel pass) from content/assets/models/<slug>.glb + .json, made by
           tools/sprites-3d/export.sh; art/sprites.ts falls back to the baked sheets in content/assets/sprites/<slug>/.
           A mode's own drawing is its RoomView (room-views.ts: the HUD banner, its things in the world, ground marks,
           prompts over the wizards), so those files don't ask which mode they're in.
           The Esc menu (menu.ts, menu-nav.ts) and the scenario registry (scenarios.ts); the help panel (help-panel.ts,
           help-model.ts, help-preview.ts); the tuning panel (tune-panel.ts); the tutorial's look and text (tutorial-view.ts, tutorial-text.ts).
scripts/   sync-rules, make-artifact, and the headless checks and shots behind the npm scripts above, plus one-off *-shot.mjs
           scripts for single effects (serve.mjs is shared: vite preview + headless Chrome)
```

## The rules that keep it deterministic

These matter from day one, because rollback (like lockstep) only works if every peer computes the same bits:

- **The sim sees only `PlayerInput` records and its own state.** No `Date.now`, `performance.now`, timers, promises, DOM or network. The client owns real time and decides how many steps to run.
- **Exact maths only:** `+ - * /`, `Math.sqrt`, `floor`, `round`, `abs`, `min`, `max`, `imul`. Use `trig.ts` instead of `Math.sin`, `cos`, `atan2`, `pow`, `exp` or `**`. Those may differ between V8, SpiderMonkey and JavaScriptCore.
- **Randomness comes from the world's RNG.** Cosmetic randomness (particles, shake) uses its own generator in the client.
- **State lives in typed arrays listed in `buffers()`.** That is what snapshot, restore and the hash walk. A new state array that isn't added there is a desync waiting to happen.
- **Iterate entity pools by slot index.** No `Map`, `Set` or `for…in` for gameplay state, and every `sort` gets a comparator.
- **Events are output, not state.** `world.events` is rebuilt every step for the view (VFX, sound) and the modes' late checks. With rollback, the view keys them by (tick, entity, kind). What an event means is its `kind` plus, where that isn't enough, an `ev` id (`EV` in `world.ts`: a death, a banner, a parry, a rally...); `text` is only a label for the screen, so the view, the sound and the modes never compare it. `note` events (EV.shotWalled, EV.slamDone) are facts for the modes, never drawn.

`test/purity.test.ts` enforces the source rules (the generated spell rules included). The golden replay (`test/golden.json`) catches unintended behaviour changes in the Sanctum; `test/mode-hashes.json` pins a hash every 300 ticks of one scripted run in the Arena, Survive, the battery, the yard and the tutorial, and a mismatch names the mode and the tick. `check:browser` catches divergence between engines (it also runs in CI, `.github/workflows/browser-check.yml`, not yet gating the deploy). **When a gameplay change moves the golden hash or a mode's trail on purpose, re-record it (`UPDATE_MODE_HASHES=1 npx vitest run packages/sim/test/mode-hashes.test.ts`) and say so.**

## Status

Milestone 1 (deterministic core) is done, and the game has grown past it (online co-op, weapons and guards, Survive). Built in the sim, with tests for each:
- **Runes and the queue:** reserved on queue, spent on cast, refunded on clear or cancel; a queued rune doesn't regenerate, and an element you lack queues as a ghost that regen pays first; regen is one shared budget (R runes/s shared equally among the pools that aren't full, two shares for an empty one: `regenRate` and `runeRate` in `world.ts`); Attune.
- **Cast rhythm:**
  - wind-up grows with the spell's size
  - Earth Force charges
  - channels are free for 2.5 s, then every rune in them costs upkeep
  - recovery, with a short buffer so no press is lost
  - Blink (Shield on Force) is instant
- **Every plain form × cast:**
  - beams, sprays, arcs, rocks (pierce at full charge), ice shards
  - novas, quakes, discharges (the rings: Shift+LMB released on yourself)
  - the imbued burst, a cone toward the cursor that stretches longer and narrower the further out you aim (held, it shows its shape)
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
  - rock and spike ice (hit points), barriers (force fields: they stop the other side and let your team through) and coated force fields (Shield + elements: each rune resists its element and bites whoever presses on it; Life heals)
  - Blink, and with elements a parting gift: their ring where you stood
  - the closed ring is Shift+RMB released on yourself, as are Sigil's orbitals and rune motes
  - wards, the mirror ward, stone armour (its coat bites melee attackers), the Mending ward
  - Model A energy drain
- **Sigil** (each binds a Sigil rune):
  - turrets that pay each shot from your pool
  - glyphs and line glyphs, orbitals, rune motes
  - the lens
  - the stored spell (pure Sigil on Force: the next spell is held, then released with no wind-up)
  - the sculpting wand, conjured weapons with reach
  - the Double (pure Sigil on yourself): a copy that follows you and repeats your spells at half power
  - auras: fire, frost, mist, regeneration, bulldoze, haste, glass cannon, spikes (Ice)
- **Enemies:**
  - six archetypes with telegraphs: goblin, brute, shieldbearer, archer, grabber, fire imp
  - steering around rock on flow fields
  - the Arena's wave director with portals, lulls and breathers
  - downed wizards are out until the wave ends (in Survive, anyone can Rally them mid-wave)
  - every attack drawn in four beats: telegraph, strike, impact, recovery (client only, `art/enemy-attacks.ts`)
  - the tutorial's passive targets: the straw goblin and the bramble (rooted; only fire hurts it), flags in `archetypes.ts`
- **Joining:** a new player joins through the input record (`BTN.join`). Gamepads join seats 1–3 with a fresh press of any button but Start, which opens the menu (`packages/client/src/gamepad.ts`, polled in `main.ts`).

**Weapons and guards** (grammar v2; designed in `docs/explorations/2026-11-05-guards.md`, revised by the user's ratings through round 4 in `docs/explorations/2026-11-05-guards-round-2.md`). With nothing queued, your hands act:
- RMB tap = Strike, RMB hold = the weapon's Heavy, Shift+RMB = its Special (some are held), Space = your guard's Defend (hold to block, tap as a hit lands to parry), Shift+LMB = its Retreat.
- **Weapons** (`packages/sim/src/hands.ts`), Heavy / Special: bare staff (big shove / Sweep), Tide trident (wave slash / Sweep), Healing hands (Healing link / **Mend**, held), Frost spear (impaling dash / javelin), Lightning whip (chain lash / Sweep), **Arcane wand** (Strike a light bolt, Heavy a charged piercing bolt / **Siphon**, held: rooted, runes regenerate fast), Flame sword (fire wave / Sweep), Stone maul (fissure / Sweep), **Ice bow** (quick icicles; a drawn fan of three that pierces at full draw / **Splinter shot**).
- **Eight guards** (`packages/sim/src/guards.ts`), one per lead element: Mirror buckler, Bulwark, Ember targe, Rime kite, Spark ring, Tide shield, **Prism** (a Capacitor: it stores what its raised block takes, and lowering it fires the **Lance**), Leaf aegis. Each has its Defend, Retreat, passive and resistances while carried.
- **Mixing:** the strongest element leads (Life > Earth > Arcane > Lightning; else the most runes of Water, Fire or Cold). Every other element brings its passive and resistance row (half per rune, all at 2). The Leaf takes only the extras' strengths; the other guards' extras are a coat that bites whoever hits the block. Resistance is hyperbolic (damage taken 1 / (1 + r)). Each guard rune past the first adds 15 % guard HP and Retreat distance. Source: `docs/explorations/2026-11-05-guards-round-2.md` ("Merged" and after).
- Numbers: `ARMS` in `config.ts`.

Campaign rooms so far: the drill yard (`#yard`) and the battery (`#battery`), the opening's beats 2 to 7, as blockouts. Sound is built (above). The rooms themselves are LDtk maps since 2026-11-06 (`content/README.md`; stage 1 of the map pipeline, `docs/explorations/2026-11-06-map-pipeline-stage-1.md`).

`?room=arena` runs the waves. The default is the Sanctum, with three practice dummies.

**Survive** (`#survive`, `docs/explorations/2026-11-05-survive-mode.md`): a walled arena (gate funnels, cover, pillars: static rock that never breaks), endless waves (wave → 3 s breather → pick → 6 s lull), and between waves three altars with power-ups: each player stands on one for 0.75 s. When everyone is down, the run ends; Space starts a new one (an input, so it works online). Its state is `world.run`, which only a survive world has, so the other rooms' layout and the golden hash are untouched; `runeMax` / `regenOf` give per-seat rune max and regen (the config values outside Survive). Survive starts at 2 runes per element (Sigil 1) and refills every pool when a wave is cleared. Twelve power-ups are built: +1 to three (tap three element keys after stepping on it; `chooseElement`), Deep (element), Wellspring (+15 % R), +1 Shield and +1 Sigil, Bedrock, Pyre, Mirror charm, Clockwork (turrets bind no Sigil rune), Echo (until the next wave is cleared, every spell goes off again 0.4 s later, free), Glass heart, Lingering (what you place lasts 1.5× as long, 1.25× as wide) and Quickstep (a permanent +15 % Haste a stack); numbers in `PERKS`. Echo's pending repeats are state in `world.run` too (`echo*`). Any wizard can Rally a downed ally (stand by them for 3 s). `?room=survive&scene=rally` with a headless loop (the screenshot script) stages a rally; `scene=three` stages +1 to three half chosen. The tuning panel's Survive line restarts a run or gives P1 a power-up.

**The tutorial** (`#tutorial`, key 4; `docs/explorations/2026-11-06-tutorial.md`): nineteen beats in one chamber (hands, then one rune at a time through all nine elements and every cast, then a two-wave test; pass 2 in `docs/explorations/2026-11-06-tutorial-pass-2.md`) and an end card. Its state is `world.tut` (only a tutorial world has one, like `run`); the beats' setup, checks and calm starts are `packages/sim/src/tutorial.ts`, their pools, places and arrivals (who walks in through which gate, and when) `tutorial-data.ts`, and every word the player reads `packages/client/src/tutorial-text.ts` (placeholders, structured so a story wrapper can replace them). `#tutorial-N` (or `&beat=N`) starts at beat N; `?room=tutorial&autoplay=1` has a bot play it (`tutorial-bot.ts`). `npm run shots:tutorial` screenshots every beat; `npm run check:tutorial` switches into and out of it in Chrome.

### Milestone 1: deterministic core (the user's pick)

Two wizards on one machine, the Atlas rules driving real casts, the Pixel Battlefield look, and a replay that hashes the same in node and in the browser.

1. ~~The cast pipeline~~, ~~spell shapes, statuses, surfaces~~, ~~structures~~, ~~enemies and waves~~ (steps A–C).
2. ~~**The look** (step D)~~: the Pixel Battlefield actors, floor, lights and HUD and the VFX gallery's effects and deaths are ported (`packages/client/src/art/`). New effects keep being added as features land.
3. ~~**Local co-op** (step E)~~: gamepads join seats 1–3 in the loop (`gamepad.ts`, `main.ts`), and the camera frames everyone (`camera.ts` follows the living wizards in an arena bigger than the view, such as Survive's). Online co-op came on top (above).
4. The rules stay as the generated copy of the Atlas's `rules-c.js` (Claude's call: the Atlas is where the user reviews rules, so one source is simpler than a TypeScript port; the typed wrapper covers what the game needs).

Open:
- **Rendering through a low-res target.** The scene draws straight to the stage at an integer scale, which is pixel-exact for unrotated sprites. Drawing into a low-res RenderTexture first would also snap rotated or scaled effects to the art grid. In headless Chrome (SwiftShader and D3D11), the target held the pixels but its sprite never reached the presented frame. Revisit with a real browser when the effects need rotation.
- **Balance** is placeholder everywhere (`packages/sim/src/config.ts`).
- **Checkpoints:** `?at=<checkpoint>` starts a chapter part-way, the same on every peer (a mode's `checkpoints`, mode.ts; the Esc menu lists them under each chapter, and an online host's pick moves everyone there). The battery's: `?at=well-failing#battery` skips the lesson to the free fights with the well nearly out, so it runs dry in about 11 s (the power-down, the infusion and beat 7 without the 75 s wait); `?at=repair#battery` starts with the well just run dry and the fight over: walk to the well and press X for the repair. The yard's: `?at=focus#yard` starts at the rack with the lessons done. `?fail=1` and `?fail=2` still work as the old names.
- **The party** (`sim/src/world.ts` Party, PartyState): what a campaign area's world carries from the last one and hands to the next: each element's rune pool, 0 locked, shared by the party. A host's move, the lobby start and the save carry it; `partyOf(world)` reads it out; a campaign area with no pools of its own gives you exactly those. Only campaign modes (`Mode.campaign`: the yard and the battery) have one. The yard's gate hands its party on to the battery (`Mode.leaveTo`). The battery's infusion unlocks Fire at 1 rune.
- **The campaign save** (`client/src/saves.ts`): the furthest checkpoint passed in a campaign chapter, and the party then, in this browser's storage, as you pass it; the Esc menu's Continue goes back there. A save names a checkpoint, never a snapshot, so it survives new builds. The menu groups scenarios as Campaign (the yard, the battery), Arcade (Survive) and Sandbox and tests (the tutorial prototype, the Sanctum, the Academy, the legacy Arena).
- `node scripts/well-frames.mjs` (after a build): the well painter driven frame by frame through steady, overloaded, the power-down and the repair, its own canvas saved at chosen moments, in shots/well-frames. Exact where screenshots are too slow to catch the flare.
- `node scripts/path-styles.mjs` (after a build): the battery's glyph paths in each style of `PATH_STYLES` (art/glyph-path.ts), from one spot, in shots/path-styles.
