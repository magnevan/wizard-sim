# Engine architecture audit (2026-11-13)

**Question:** is `game/` built so that the rest of the game can be added to it (a campaign of many rooms, scripted encounters, story beats, bosses, more enemies and spells, progression and saves) without ad-hoc code piling up?

**How:** five read-only auditors, one per area: the sim core, modes and rooms and content, client rendering, netcode and the app shell, and tests and tooling. Each cited files and lines; the claims below were checked against those citations where marked. `npm run check` passed during the audit (41 files, 601 tests, 65 s). Uncertain claims are marked *(unverified)*.

## Verdict

The foundation is good and worth keeping. The way content is added to it is not.

- **Keep:** the typed-array state behind `buffers()` (a new column is snapshotted and hashed with no extra code), the purity test and `types: []` tsconfigs, the rollback session with handover and rejoin, the audio director's rollback rules, the actor frame cache and pooling, the LDtk → `rooms.gen.ts` pipeline with content hashes, CI gating deploys on `npm run check`. Package dependencies point one way (rules ← sim ← net ← client), with 3 `any` and 0 `@ts-ignore` in all src.
- **The problem is dispatch, not data.** Modes, enemies, spell shapes and effects are each a hard-coded branch inside the core systems. Every new mode edits about 8 core files, every new enemy about 8–11 sim files plus about 8 client files, every new spell shape 7–9. That is fine at four rooms and five enemies. At twenty rooms and bosses it is exactly the pile-up the question is worried about.
- **Nothing carries between rooms.** A room switch is a new match with a new seed. There is no progression, unlock, checkpoint or save state anywhere in the sim, the net protocol or the client.

## Six cross-cutting problems

Several auditors found the same problem from different sides; each is listed once here.

### 1. There is no room or scenario module

Each mode (Arena, Survive, tutorial, battery) is a hand-written director, wired into the core by name.
- **Sim.** `step.ts:34-35, 52, 56, 83` picks directors per mode. `createWorld` branches on room names (`world.ts:617-643`, including the battery's gate at fixed coordinates). `runeMax` is a nested ternary over `tut`, `battery` and `run` (`world.ts:536-538`). The battery's `driving()` is checked inside effects, hit, cast and enemies. Tutorial hooks sit in `effects.ts:645, 840` and `enemies.ts:278`. Survive perks are queried in hit, effects, structures and enemies.
- **Shared buffer.** The `enc` buffer means different things per mode: a wave phase in Arena and Survive, a lesson step in the battery. The HUD reads it without checking the mode (`hud.ts:161-209`).
- **Client.** It has 21 mode branches in `hud.ts`, 11 in `vfx.ts` and 8 in `view-structures.ts`, plus battery stakes in `view.ts:301`.
- **App shell.** `main.ts` `boot()` is one closure with about 15 flags. Per-step subscribers are wired twice, once for offline and once for online.

### 2. Each kind of content is a set of switches across many files

- **Enemies.**
  - Attacks are a 4-way `if/else` (`enemies.ts:224-250`).
  - The brute and grabber keep their own columns on every body (`world.ts:91-93`).
  - Defensive quirks are spread over hit, guards and effects.
  - On the client an enemy is a rig kind plus magic `variant` numbers (imp=3, grabber=4, shieldbearer=5). `deaths.ts:56` decodes those numbers back into names.
  - Nothing type-checks that a new archetype is covered everywhere.
- **Spawning is copied five times** (`waves.ts`, `survive.ts`, `battery-waves.ts`, `tutorial.ts`, `dev.ts`). This already caused one bug: "a reused body slot has no battery lane".
- **Spell shapes.** `fireSpell` switches over 25+ shapes, `tickZones` over 9 zone kinds, and structures over 16 devices.
- **Effects.** On the client, two `drawFx` switches of about 300 lines each, with kinds as plain `string`, live in `vfx.ts` (1,694 lines) and `view-structures.ts` (2,118 lines, of which `draw()` alone is about 1,600 lines).
- **Gameplay anchors are art names.** The battery finds its defences by prop asset id (`'defence-tower'`, `'control-pedestal'`, `'stakes'`), so reskinning a prop can silently break the battery.

### 3. Sim events are untyped, so the view and audio guess

`SimEvent` (`world.ts:238`) is one bag of optional fields.
- **Kinds are encoded loosely.** A death is `fizzle` with `text === 'dies'`. Life and fire are `look === 2 / 8`.
- **Effects guess their cause.** They match a burst to its cause by distance (`vfx.ts:343-355`). Structure effects claim events by position with a `skip` set.
- **Sounds depend on display text.** Audio picks sounds by label text (`'Parry!'`, `'Doused'`, `'Grabbed!'`), so rewording a floating label silently breaks a sound.
- **Wrong spell on late events.** `onEvent` reads the caster's current spell rather than the one that caused the event, which is wrong for late or replayed events.

### 4. No room transitions and no state that carries over

- **A room switch is a new match** with a new `Date.now()` seed (`netplay.ts:279-293`). The sim sets an exit flag and the view fires the switch (`tutorial-view.ts:295`).
- **The snapshot can't follow a room change.** Its length depends on the room (`surf`, `nav` are sized per cell), and `restore` throws on a length mismatch, so a door can't change rooms within one session.
- **Seats are fixed when the match starts.** A rejoin can only take back a seat someone left; a new third player can't drop in.
- **No saves.** `localStorage` holds only audio, help and tune settings.

### 5. Two ways of stepping the game

- **Offline** steps `step()` directly and gets gamepads, local co-op, the replay recorder and pause.
- **Online** goes through `RollbackSession` with `keyboard.sample(world, net.seat)` only, so gamepads can't play online and couch players can't join an online match.
- **`NetPlay`** is a 740-line class doing six jobs: the lobby, match control, drop and rejoin, tuning, stats, and a DOM panel.
- **Bus listeners pile up.** `Bus` has no `off()`, so every match adds a permanent bus listener, one more per room switch.
- **No input binding layer.** Ten window `keydown` listeners decide priority by capture order.

### 6. The process gets in the way more as content grows

- **The golden hash** has been re-recorded 39 times in about 356 commits, roughly 1 in 9. It is one replay in one room, so Survive, the battery and the tutorial have no pinned hash. When it changes, nothing says what moved.
- **The spell rules' source of truth** is an untyped JS file in `tools/spell-atlas/`. It is cast to its type by hand and never purity-scanned, although it runs inside the sim (it uses `new Set`; deterministic by insertion order, but unchecked).
- **Client test coverage.** About 50 of 75 client modules have no test. `check:browser`, the cross-engine determinism check, isn't in CI.
- **No lint.** The CLAUDE.md code rules are enforced only by review.
- **Snapshot copies in `tools/` have drifted:** `pixel.js` in 3 versions across 4 pages, `stage.js` in 3 versions.

## Bugs found along the way

- **`replaceWorld` ignores the battery** (`sim/src/state.ts:37`, confirmed by reading). Its "same layout" test compares `run`, `tut` and grid size, but not `battery`. Switching between a battery world and another world of the same grid size would take the copy path with different buffer lists. It is hidden today only because the battery's 84×72 grid is unique; campaign rooms that share sizes will hit it. Fix: compare the `buffers()` layouts.
- **Deaths and bursts inside a rollback replay window get no effect.** `view.replayStep` doesn't route deaths, so the body just disappears *(unverified, moderate confidence)*.
- **Bus listeners accumulate** across room switches (above). The `NetPlay` debug panel starts a new `setInterval` on every `attachDebug`.
- **A help preview leaks its textures:** `destroy` frees display objects but not the textures it made (`help-preview.ts:129`).
- **Missed by the purity test:** its import check reads only lines starting with `import`, so a multi-line import is never checked.
- **The NaN fuzz test** takes 5.1 s under load, over the CLAUDE.md "under 5 s" rule.

## Recommended plan

Order matters more than size: phases 1 and 2 stop the growth; later phases pay down what's there. Each phase ships separately and keeps main working.

### Phase 0: small fixes (S, about a day)
- Fix `replaceWorld` to compare `buffers()` layouts.
- Add `Bus.off()` and dispose match listeners.
- Fix the help-preview texture leak and the multi-line import gap in the purity test.
- Scan `rules-c.gen.js` in the purity test.
- Add `check:browser` to CI.

### Phase 1: seams before content (M, the most important)
1. **A room module interface in the sim:** `{ createState, press, tick, late, runeMax?, onSpawn?, onEvent?, canHurt? }`, registered by room id. Arena, Survive, tutorial and the battery move behind it, and `step.ts`, `createWorld` and `runeMax` lose their per-mode branches. Survive perks become one `mods(w, seat)` query. A matching client `RoomView` holds the HUD and overlays. This should keep the golden hash; the bot hashes are the check.
2. **One `spawnEnemy(w, arch, x, y, opts)`** that owns all per-enemy setup (S).
3. **Typed sim events:** a discriminated union (`death`, `rally`, `burst{source, spellId}`, …) plus a semantic id for floating text. This removes the `near()` guessing on the client and the text matching in audio. The events aren't hashed, so the golden hash stays *(check)*.

### Phase 2: the campaign's backbone (M–L)
4. **Encounters as data.**
   - **LDtk entities:** `Region`, `Trigger`, `Door`, `Spawner(id)` and `Marker(id)`.
   - **A per-room script** of `{when, do}` rules:
     - *when:* enter region, all dead, timer, flag.
     - *do:* spawn, open door, set flag, say a line, set an objective, checkpoint, exit to a room.
   - **Runtime:** evaluated in `step`, with its cursor and flags in a fixed buffer.
   - **One director:** the three wave directors and the tutorial's arrivals merge into one data-driven runner.
   - **Code hooks stay** for truly unique beats.
   - **First test:** convert the battery. If its lesson steps become data plus a `driving` hook, the system is general enough.
5. **Carry state and transitions.** A deterministic "party state" (per-seat unlocks and pools, flags, segment position) lives outside the room world. `createWorld(opts.carry)` applies it. Online, the coordinator schedules `{at, room, carry}` and every peer swaps at that tick, with no new match. Checkpoints and saves are carry state plus room plus script cursor, not snapshots.
6. **An app state machine** (`Boot → Title → Lobby → Loading → InRoom → Transition → Paused`) owning one game session. Offline becomes a one-peer rollback session with zero delay. A local-players layer maps the keyboard and pads to seats, so gamepads and couch co-op work online too. Sessions are sized to all four seats, so new players can drop in.

### Phase 3: registries, done as content needs them (M each)
7. **Enemies:** a behaviour table (`{ready, windup, strike, tick}` per attack id), a resistance table on the archetype instead of scattered quirks, and per-enemy state in a small generic scratch pool. On the client, an `ENEMY_VISUALS[arch]` record with `satisfies Record<Arch, …>`, so a new enemy fails to compile until its look is complete. Bosses plug in here.
8. **Spell shapes:** `SHAPE_IMPL[shape] = {fire, tick?}` replaces the switches, and `compile` is cached by (queue, cast, drag). Today `rules.resolve` allocates strings and Sets every tick for every channelling seat, which also costs during rollback re-simulation.
9. **Effects:** split `view-structures.ts` along its own seams (walls, devices, waves, wizard gear, Survive, preview) and `vfx.ts` (intake and rollback, missiles, channels, surfaces). Effects get a `register(kind, {life, draw})` with typed kinds. Do this incrementally, the next time each part is touched.
10. **Data-driven room features:** prop lights, moods and gameplay roles go in `meta.json` and the room def, not in id tables or asset-name lookups.

### Phase 4: process (S–M)
- **Hash trails per room:** pin one each for the sanctum, arena, survive, battery and tutorial bot, and report the first diverging buffer on a mismatch, so a re-record is a readable diff.
- **Lint:** a minimal ESLint or Biome config, encoding the CLAUDE.md rules that can be checked.
- **Drift test:** a check for the `tools/` helper copies.
- **Slow tests:** split into a `test:slow` group.
- **Rules to TypeScript:** port the spell rules into `packages/rules` and generate the Atlas's JS from it, reversing the source of truth. Bigger, so do it when the rules next change a lot.

### Deferred until a room needs it
- **Spatial grid:** collisions are O(n²) over `MAX_BODIES = 96`, about 4.5k pairs, which is fine today.
- **Smaller snapshots:** `nav.field` dominates them on big maps. One estimate is about 88–104 KB per snapshot, taken every tick into a ring of 62 *(unverified; measure with `npm run perf` first)*.
- **Sprite-sheet asset kind:** for bought animated characters.
- **Input remapping and Steam Input:** with the app state machine.
- **Per-world tuning:** instead of mutable module globals.
- **Desync recovery:** through the existing handover.

## What this costs

- **Effort.** Phase 1 is about a week of focused work and changes no gameplay. Phase 2 is the real investment, but it is the campaign's engine: without it, every segment is a new hand-written director.
- **Hashes.** The golden hash should survive phases 1 and 3 if ported carefully. Splitting `Seats` into sub-pools would change it once, and is optional.
- **Players see nothing new.** The risk is spending a week or two not adding content, but the opening segment is about to need doors, triggers and carry-over state anyway.

## Open questions for the user

1. **Pause content for phases 0–1** (about a week), or interleave them with the opening segment's work? *Recommendation:* do phases 0–1 now. Phase 2's encounter system is then built by converting the battery, so the opening segment moves forward while it's built.
2. **Who scripts encounters?** Data in LDtk plus a per-room script file, or plain TypeScript per room behind the module interface? *Recommendation:* data for the common vocabulary, with TypeScript hooks allowed. That fits the LDtk pipeline you already use.
3. **Online room changes:** keep one session across doors (protocol work, phase 2 item 5), or accept a short reconnect per room for now? *Recommendation:* one session, because drop-in co-op and checkpoints need the same carry state.
