# 01-skeleton

## Question

Does the core loop of element queue + cast modes feel right, and does **Proposal A ("Magicka plus two verbs")** from `docs/explorations/2026-11-03-spell-tree.md` work in your hands: Point cast, Seal / Release, ground fronts, ally-aware spells?

Arena question (`docs/explorations/2026-11-03-encounters.md`): **do players prepare during lulls (runes, orbitals, stored spells, walls) if the next wave is telegraphed?**

## Run

```sh
cd prototypes/01-skeleton
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: queue rules, statuses, Proposal A parity with tools/spell-tree/resolver.js, vessels, sim smoke,
                     # wave director, archetypes (shield, slam, grab, imp), death rule, gamepad mapping,
                     # rule set A.1 parity + enchants / Cage, enemy steering around walls
npm run typecheck
npm run build        # dist/ works from any path (vite base './')
npm run preview      # serve dist/ on http://localhost:4173
node scripts/make-artifact.mjs   # after build: packages dist/ into artifact/
```

URL params: `?demo=1` (scripted player, for screenshots), `?room=arena`, `?debug=1`, `?autoplay=1` (Arena played by a bot pilot plus the bot ally, for screenshots), `?wave=N` (start the Arena at wave N), `?ally=1` (start with the dev ally), `?rules=a1` (start with rule set A.1; F2 toggles at runtime).

Headless screenshot (demo and autoplay drive the loop with `setTimeout`, since `--virtual-time-budget` doesn't advance `requestAnimationFrame`; a plain `?room=arena` only renders its first frames headless):

```sh
chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 \
  --virtual-time-budget=6000 --screenshot=shot.png "http://localhost:4173/?demo=1"
```

`?autoplay=1` shows: wave 1 portals at t≈0–8 s (the bots seal runes on the portals and bank orbitals), wave 1 from 8 s, wave 2 (brute slam telegraphs) from ≈36 s. With `&wave=4` the grabber / imp wave starts at 8 s; `&wave=6` brutes + casters.

The demo (17 s loop) shows: Geyser (t≈1.6–2.2), Ward toss on the ally (2.4), rock wall (3.4), lightning strike plus Surface Surge on Dummy C's puddle (4.5), SEAL armed + rune (4.3–5), orbitals x4 (6–7.2), Release with rune burst, orbitals and wall shrapnel (8.0), Tidal wave (9.5), Lens + boosted arcane beam (11–13.6), Fault line with ridge (14.2), Lantern on the ally (15.3).

`?demo=1&rules=a1` (18 s loop) tours A.1 instead: Haste (t≈1.5), Stoneskin on the ally (2.5), Cage on Dummy B (3.5) and a fire spray stopped by the bubble (4.4–5.4), Glass cannon (6.1) then a +50% lightning strike on Dummy C (7.1), Haste on the ally (8.1), Ethereal (9.1) and a refused attack (10.2), Stoneskin x3 (12.6), Yank (13.6), Geyser *on* Dummy A's body (14.6), Tidal wave soaking the ally (15.6), Cleanse on the ally (16.9).

## Controls

| Input | Action |
|---|---|
| Hold LMB | Walk toward cursor |
| RMB | Force cast (hold to channel beams, sprays, arcs; hold to charge a rock) |
| Shift + RMB | Area cast (hold Life to sustain the circle) |
| Space / MMB | Self cast (hold Life for heal over time) |
| Shift + LMB | Weapon cast (swing + ground line; Shield = conjured weapon) |
| **Ctrl + RMB / mouse 4 / G** | **Point cast** at the cursor (max 9 units); on a body it targets that ally/enemy |
| **C** | **Arm / disarm Seal** (provisional): the next cast goes into a vessel. HUD shows "SEAL armed" |
| **V** | **Release** (provisional): set off every sealed spell, shatter your own rock/ice walls. Hold V to keep a released beam going |
| Q W E R | Water, Life, Shield, Cold |
| A S D F | Lightning, Arcane, Earth, Fire |
| Esc | Clear queue (casting also clears it) |
| 1 / 2 | Sanctum (dummies) / Arena (waves) |
| 0 | Reset dummies, surfaces and conjured structures |
| **K** | **Dev ally**: add / remove an AI wizard that follows P1, Mends / Yanks P1, casts Point spells at enemies, and seals runes on portals in lulls |
| **F2** | **Toggle rule set A / A.1** at runtime (default A; `?rules=a1` starts in A.1). The HUD's top-right panel and the help overlay show the active set |
| Wheel | Zoom |
| H / F1 | Help |
| ` | Debug overlay |

### Gamepad (local co-op)

Any button on a gamepad joins a new player (up to 4 seats; the HUD says "Press any button on a gamepad to join"). Standard mapping:

| Input | Action |
|---|---|
| Left stick | Move |
| Right stick | Aim: reticle in the stick direction, 2.5 u at a light tilt up to 9 u (Point range) at full tilt; the last aim is kept when centred |
| A / B / X / Y | Water / Life / Shield / Cold |
| LB held + A / B / X / Y | Lightning / Arcane / Earth / Fire |
| RT | Force cast (hold to channel) |
| LT | Area cast |
| RB | Self cast |
| LB + RT | Weapon cast |
| LB + LT | Point cast at the reticle |
| D-pad up / down | Seal toggle / Release (hold down to keep a released beam) |
| Back / View | Clear queue |

Each player gets a colour, a card (HP, statuses, vessels) and a queue panel with their own button labels; gamepad players get a reticle. The camera frames every living player and zooms out (down to 0.6x) when they spread apart. Friendly fire stays on.

Water + Fire = Steam, Water + Cold = Ice. Opposites cancel: Fire/Cold, Water/Lightning, Life/Arcane, Earth/Lightning, Shield/Shield. (The JS explorer cancels Steam/Cold and Ice/Fire; the skeleton keeps its tested "react again" rule that turns them back into Water.)

The HUD hint line under the queue shows what each of the five modes would cast right now (Point uses whatever is under the cursor). With Seal armed it shows `Seal+Mode: vessel`. The player card shows vessel state: staff slot, runes n/3, orbitals n/8, loaded blow, conjured weapon.

## Proposal A mapping

Forms come from `spells/tree.ts`, a line-for-line port of `tools/spell-tree/resolver.js` (a test checks parity for every queue of up to 3 elements in every mode, target and seal state, and every RECIPE). Numbers come from `spells/proposalA.ts`.

| Mode | Form → what you get |
|---|---|
| Force | Shield+Earth/Ice: **rock / ice wall** across the aim (blocks bodies, projectiles, beams; your projectiles bounce off it). Shield+other: elemental barrier (pulses its elements on contact). Shield: reflecting barrier. Earth: **rock**, hold to charge; full charge pierces and carries the first enemy (Pinning Javelin). Ice: shards that **bounce** off walls (Ricochet). Arcane: beam. Life only: healing beam. Lightning: **chain arc** (wet targets: cheaper, longer jumps). Else spray |
| Area | Shield+Earth: ring of stone. Shield: ward ring (wards allies in 3 u). Life only: **Sustained Circle** (zone follows you while held). Earth: earthquake (knockback + short stun). Else nova + lingering zone |
| Self | Life only: heal + heal over time while held. Else ward (resist) |
| Weapon | Empty: sword swing (or conjured-weapon swing). Shield: **Bulwark** (bash, then a held tower shield that blocks bodies and reflects projectiles), Ice blade / Lightning whip (conjured for 12 s; plain swings use it). Earth: **Fault line** (front throws enemies aside, leaves a 4 s rock ridge). Water: **Tidal wave** (wide front that pushes, carries and wets). Life only: healing line (allies only). Else elemental ground line |
| Point | Shield+Arcane: **Lens**. Shield+Life: **Lantern** (allies can't drop below 1 HP, 2.5 s). Shield: **Ward toss** on an ally / placed ward on the spot. Arcane on a body: **Yank** (0.4 s tether, allies and enemies). Life only: Mend (ally only) / healing bloom. Earth: **Geyser** (0.6 s rumble telegraph, then eruption; +Arcane bigger). Ice: spikes. Lightning: strike from above. Water only: Flood (puddle). Cold only: frost patch. Arcane: blast. Else elemental bloom |

Note: on a *body*, Arcane wins over Earth (Earth+Arcane on an enemy is a Yank, on the ground a Geyser). That's the resolver's rule order.

## Rule set A.1 (F2 / `?rules=a1`)

The tweaks from `docs/explorations/2026-11-03-spell-tree-audit.md`, ported from `resolveA1` / `selfEnchant` in `tools/spell-tree/resolver.js` into `tree.ts` (`variant: 'a1'`; the parity test runs every queue of up to 3 elements in both rule sets). Seal and the empty queue behave as in A; Force, Area and Weapon are unchanged.

| A.1 rule | Effect in the skeleton |
|---|---|
| Self + Shield + Arcane: **Ethereal** | 3 s: harmful hits, projectiles and beams pass through you (heals still land), you pass through bodies, grabbers let go ("Phased free!"), enemies stop chasing you. Offensive casts and Release fizzle ("Ethereal: can't attack"); Self, Point-on-ally, heals, walls and non-damaging seals still work. Drawn as a see-through ghost with a dashed cyan rim and wisps |
| Self + Lightning: **Haste** | Move x1.45, wind-up and recovery x1.6 faster (charge / channel timing unchanged). Lasts 2 + 2 s per Lightning. Purple speed streaks |
| Self + Arcane + Fire: **Glass cannon** | 6 s: +50% damage dealt and +50% damage taken. Cracked pink glow |
| Self + Earth: **Stoneskin** | Rock armor soaking 20 + 20 per Earth damage (shown as "(n)"), halves knockback, move x0.7; 12 s or until broken ("Stoneskin broke"). Rock plates, fewer as it wears |
| Self + Water only: **Cleanse** | Removes wet, burning, chilled, frozen, slowed, stunned; keeps enchantments |
| Self: Shield → Ward, Life only → Heal, else Elemental ward | As in A |
| Point on an ally = **your Self spell on them** | Mend, Ward toss, Haste / Stoneskin / Glass cannon / Ethereal / Cleanse / Elemental ward "(on ally)". Lantern on an ally is gone (it's still Point on the ground). Cleanse or Ethereal on a frozen or grabbed ally is the rescue |
| Point + Shield on an enemy (no Arcane / Life): **Cage** | A golden bubble (body radius + 0.75 u) for 3 s: the enemy can't leave, other bodies can't enter, projectiles pop on the bubble from either side, beams / sprays / arcs stop at it, and every hit across it is dropped ("Caged"). Status ticks inside keep going |
| **Yank** only with Arcane alone | Earth + Arcane on a body is now a Geyser under it |

Enchantments are buff statuses (`statuses/defs.ts`: `buff`, `speedMult`, `castSpeed`, `damageDealt`, `damageTakenAll`, `intangible`, `armor`), so they show as timed chips on the player card and are cleared on death. The Cage lives in `world/cage.ts`.

**Attuned (Life + a damaging element, not Self):** a payload flag. Allies hit by it get `4 x Life x scale` healing instead of the payload; Life adds nothing for enemies.

**Seal vessels** (`spells/vessels.ts`): the vessel stores the spec to fire, resolved at seal time.

| Seal + | Vessel | Trigger |
|---|---|---|
| Self | staff slot (1) | Release: fires as a Force cast at the aim, instantly. With Shield: **Contingency**, fires as an Area cast the moment you take damage |
| Point | rune at the cursor, arms in 0.8 s (arming ring + trigger radius drawn); max 3, oldest replaced | enemy steps on it (allies don't), or Release: Area cast at the rune. Life+Shield: **Effigy**, a 60 HP decoy enemies prefer; fires when destroyed |
| Force | line rune (tripwire) from you toward the aim, 6 u | enemy crosses it, or Release: bursts along the line |
| Area | orbitals: one charge per element (min 1), sealing again adds more (max 8) = Spell Quiver | Release flings them at the cursor (Life-only: heals to nearby allies; Shield: wards to nearby allies) |
| Weapon | loaded blow | next swing that connects bursts the Area cast at the hit |

Release also **shatters your own rock/ice walls** into shrapnel flying away from you (ice shrapnel bounces).

**Surfaces** (`world/surfaces.ts`, a few pre-placed in the Sanctum): puddle (wets whoever stands in it; lightning touching it surges through everyone inside), ice (frozen puddle, ~8x less friction so knockback slides), grass (fire sets it burning; burning grass damages and spreads). Cold/Ice on a puddle freezes it; fire on ice melts it; fire on water hisses into steam.

## Arena: waves and archetypes

The wave director (`rooms/waves.ts`, driven by `rooms/arena.ts`) loops:

1. **LULL** (8 s before wave 1, then 10 s): one portal per enemy group opens at the arena edge, as far from the players as possible, labelled with archetype, count and a countdown ring. The camera pulls back to show the portals; off-screen portals get edge arrows. The banner lists the coming mix and says "Prepare".
2. **WAVE**: portals spill one enemy every 0.45 s. Downed players are **out until the wave ends**. If everyone is down, the wave is wiped and retried after a lull.
3. **BREATHER** (3 s): downed players return. The banner then keeps the last wave's stat: **sealed spells released / triggered** (runes, tripwires, orbitals, staff, loaded blows, contingencies; counted from the lull through the wave) and **spells sealed in the lull**.

Six authored waves of 2–3 archetypes (wave 1 is swarmers only), then they loop with +35% counts, +30% HP, +6% speed and +20% damage per loop:
1 Swarmers x6 · 2 Brute + Swarmers · 3 Shieldbearers + Casters · 4 Grabber + Swarmers + Imps · 5 Brute + Shieldbearer + Casters · 6 Brutes x2 + Grabber + Casters.

Archetypes are a data table (`world/archetypes.ts`); behaviour in `world/ai.ts`, visuals in `render/drawEnemies.ts`.

**Steering** (`world/nav.ts`): enemies path around pillars and conjured walls. A 0.5 u grid marks blocked cells (level walls, rock / ice / shield / elemental walls and Fault-line ridges, Cage bubbles; inflated 0.45 u), and a Dijkstra flow field is built per chased target (players, effigies). Grid and fields are rebuilt every 0.3 s. An enemy with a clear grid line walks straight; otherwise it walks the field downhill up to 8 cells and heads for the farthest one in view. Detours are walked at 80% speed, and a fresh wall is only noticed at the next rebuild, so walls still buy time (the test checks a detour is both possible and slower). Casters use it to reach cover; held bodies, dashes and drags are unchanged. Speeds are ~70–80% of the player's 4.2 u/s. Every attack has a 0.6–1.2 s telegraph drawn on the floor; stuns and freezes interrupt it.

| Archetype | Question | Behaviour and telegraph | Answers |
|---|---|---|---|
| Swarmer (16 HP, fast, small) | Hit many at once? | Groups of 5–6; 0.6 s red bite wedge | Novas, sprays, Tidal wave, a rune on the portal |
| Brute (230 HP, slow, heavy) | Sustain damage, protect its target? | Locks a 2.1 u circle on a player: 1.1 s filling orange disc, then a 30 dmg slam with heavy knockback | Beams, Lens, Ward toss / Lantern / Yank the target out |
| Shieldbearer (90 HP) | Go around? | Gold frontal arc (±66°) **blocks projectiles, beams and sprays from the front** ("Blocked"); turns slowly (1.5 rad/s); 0.8 s bash. Frozen / stunned drops the guard | Flank it, Point casts and Geysers under it, ice shards that have bounced, novas, fronts, arcs |
| Caster (45 HP, back line) | Reach past the front? | Stands behind the nearest brute / shieldbearer (else keeps 8 u away); 1.0 s green dashed aim line (tracks, then locks), then a slow bolt (6 u/s) that passes through other enemies; your walls block it | Yank it, Point casts, arcs, dodge |
| Grabber (60 HP) | Rescue? | 0.8 s teal dash arrow, dashes 6.6 u; on contact holds the player (can't walk, can still cast), drags them toward the nearest edge for 3.5 s, then throws them | **Yank** the ally (releases), 25 damage to the grabber (releases), stun / freeze it |
| Fire imp (40 HP) | Read the battlefield? | Fast melee that sets you burning. Immune to fire and burning; x2.5 cold, x2 ice and steam; getting wet deals 14 ("Doused") | Water, cold, steam |

## Architecture

```
src/
  main.ts            boot + fixed-timestep loop (60 Hz sim, render every frame)
  config.ts          global knobs (camera view height/zoom, player stats)
  core/              vec2, seeded rng, input (ordered press buffer, ctrl flag), fixed-step timer
  world/             entity types, World (entities, walls, hit / touch / floater / fx queues, seal counters,
                     encounter), archetypes.ts (enemy table), shield.ts (frontal block rule),
                     geometry (AABB + capsule), physics, ai, damage, spawners, dummy stats,
                     structures.ts (conjured walls, lenses), surfaces.ts (floor world rules),
                     nav.ts (enemy steering: grid + flow fields), cage.ts (A.1 Cage)
  statuses/          data tables (defs.ts) + pure logic (statuses.ts) + tick system
  spells/            THE SPELL CONTRACT
    elements.ts        Element ids + ELEMENTS registry
    queue.ts           ElementQueue + QUEUE_RULES
    types.ts           CastMode (+point), ResolveContext, CastContext, SpellSpec, EffectSpec, Payload
    tree.ts            Proposal A forms (+ rule set A.1): port of tools/spell-tree/resolver.js (+ RECIPES)
    proposalA.ts       ProposalAResolver: tree leaf -> SpellSpec numbers (the game uses this)
    placeholderResolver.ts   the old Magicka-like stand-in, kept for comparison
    payload.ts         payloadFrom (attuned), scalePayload
    hit.ts             applyPayload: the ally-aware rules (attuned, allies-only, Lantern grant)
    targeting.ts       pointAim: clamp to range, body under cursor -> ground/ally/enemy
    fire.ts            fireSpell: instant effects (heal, ward, walls, surface, lens, seal, conjure) + spawning
    effects.ts         effect entities: projectile (bounce/pierce/carry), beam (lens), spray, burst
                       (telegraph delay), zone (follow/self), swing (loaded blow), front, arc, tether
    vessels.ts         Seal / Release: staff, runes, line runes, effigy, orbitals, loaded blow, shatter
    runner.ts          DefaultSpellRunner: windup -> (charge) -> (channel) -> recovery
    castSystem.ts      release, request -> resolve -> pending -> runner; updates effects
  game/              Game, sim step, controllers (bindings), gamepad.ts (pure padStep + controller),
                     bot.ts (dev ally / autoplay pilot), players, demo script
  rooms/             Room interface, Sanctum (dummies + surfaces), Arena, waves.ts (wave director rules)
  render/            camera, renderer, entities, effects, drawStructures (surfaces, runes, walls,
                     lens, effigy, orbitals), particles
  ui/                HUD (queue, 5-mode preview, SEAL banner, vessel line), help + debug overlays
```

### System order (`game/sim.ts`, one fixed step)

1. **input**: controllers -> intents; element presses queue in order; Seal toggles; a cast snapshots the queue, Seal state and the Point aim (clamped point + body under cursor) into `caster.request`.
2. **ai**: enemy archetypes (nearest player, prefer effigies; wind-up, then bite / slam / bolt / dash-grab), dummies.
3. **spells**: Release first, then resolve request -> pending -> runner; `updateEffects` (hits, and `world.touch` for elements reaching the ground).
4. **structures**: expire walls / lenses / runes, keep Bulwark guards in front, pulse elemental barriers.
5. **movement** (ice: low friction), 6. **collisions** (bodies, level walls, conjured capsule walls).
7. **surfaces**: wet / burning from standing in them; touches -> surge, freeze, melt, steam, ignite.
8. **statuses**, 9. **damage / death** (Lantern clamp at 1 HP; records who was damaged).
10. **vessels**: Contingency, rune / tripwire / effigy triggers, conjured weapon expiry.
11. **cleanup**, then the room director.

### Extending

- **Resolver**: `SpellResolver.resolve(elements, mode, ctx)` with `ctx = { seal, target, conjured }`. Forms live in `tree.ts` (keep it in sync with the JS explorer; the parity test will fail otherwise); numbers in `proposalA.ts`.
- **New shapes**: add a variant to `EffectSpec`, an updater in the `UPDATERS` table in `effects.ts` (or a case in `fire.ts` if it's instant), and visuals in `render/`.
- **New world rules**: react to `world.touches` in `surfaces.ts`.
- **Input reliability**: unchanged. Every press is buffered in order; casts pressed while busy wait `CAST_BUFFER_SECONDS`; no input cooldowns. Cast time, charge and channel are properties of the spec. Seal and Release are instant verbs.

### Co-op seam

`Game.addPlayer(controller)` adds a seat. `KeyboardMouseController` (bindings configurable, including point/seal/release), `GamepadController` (joins on any button; `padStep` is the pure mapping), `BotController` (K dev ally, `?autoplay=1` pilot), `DemoController`. A controller can expose `modeLabels`, `idleHint` and `reticle` for its HUD panel.

### Known gaps vs Proposal A

- Units: "260 range / 160 line" from the brief became 9 / 6 world units (a wizard is 0.9 u wide).
- Lens: +50% damage and width, first beam steers, a second beam entering makes the output 2.25x (its own payload isn't added). No split/focus by cursor distance; projectiles pass through lenses.
- Surge spreads through one puddle, not across touching puddles; grass is the only burnable; no oil.
- Placed ward wards allies in the spot instantly (no lingering bubble); shield plates don't block shots while orbiting.
- Staff release always fires as Force (the doc's "in whatever mode you release with" isn't implemented). One staff slot, no progression.
- Bulwark blocks while the weapon cast is held (Shift+LMB); there's no persistent conjured shield. Ice blade / whip are conjured for 12 s.
- Pinning Javelin carries the first enemy but doesn't pin it to walls. No Curve Bolt, no Magicks.
- Walls aren't damageable. Beams and sprays stop at walls; bursts and zones ignore line of sight.
- No audio; placeholder balance. Gamepad mapping is fixed (no rebinding, no rumble) and was verified with a simulated pad, not real hardware.
- Steering is a coarse grid with one inflation radius: brutes can still scrape corners, enemies don't avoid each other or hazards (fire, puddles), and a fully closed ring of walls makes them push straight at it. Grabbers only grab wizards; brute slams hit players, effigies and ally bodies only (no enemy friendly fire).
- Shield block is a facing test on the hit's travel direction; only projectiles, beams and sprays check it. A beam into a shield stops there and does nothing.
- The dev ally is deliberately simple: Point casts (lightning strike, Geyser beside the target), Mend / Yank on P1, self-heal, runes on portals and earth orbitals in lulls. It skips targets within 2.2 u of P1 but can still hit P1.
- The lull camera pull-back and portal arrows are the only "it's coming" cues (no horns / audio). Waves are authored, not drawn from a pool. `?wave=N` only applies to the first Arena load.
- The sealed-spell stat counts each orbital as one; a Release that only shatters walls doesn't count.

## Findings

_(fill in after playing)_
