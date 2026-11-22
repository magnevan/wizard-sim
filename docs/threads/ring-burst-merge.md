# The ring merges into the burst

Status: planned, not started · Last touched: 2026-11-22
Record: [exploration](../explorations/2026-11-21-ring-burst-merge.md) · [decision](../decisions/README.md#2026-11-22-the-ring-merges-into-the-burst-aim-at-yourself-for-the-ring-explorations2026-11-21-ring-burst-mergemd) · [issue #10](https://github.com/magnevan/wizard-sim/issues/10)

## Where it stands

Decided, not built. The Area cast goes:
- **Shift+LMB with runes** is the burst. With the cursor on yourself (about 1 u) it's a full ring. Elsewhere it's a cone toward the cursor that narrows smoothly and lengthens with distance, never shorter than today's reach.
- **Holding the button** previews the shape; release casts.
- **Shield and Sigil** keep the hand slot (guards, weapons, the wand). Their ring, orbitals and rune motes move to **Place with the cursor on yourself**.
- **Shift+RMB** is Place only, with no `placeHold` wait.

The checklist below comes from a full code sweep (2026-11-22). Paths are relative to `game/packages/`. Tick items as they land, so the end of the work can be checked against it.

## Calls to make while building (Claude's picks; the user can veto)

- **Keep `CAST_ID.area` (2) as a retired slot** rather than renumbering `CAST_ID`. Its numbers index `CASTS[]` (`sim/cast.ts:33`), `help-panel.ts:196`, `view.ts:164` and the u8 arrays `castId`, `storeCast`, `echoCast` and `bufCast` (`sim/world.ts:115,131-137,158-161,460,570-572`).
- **"On yourself" is decided in `release()`** (`sim/cast.ts:215`) from `s.aimX/aimY` (relative to the wizard): the threshold is a new config field (`SHAPES.selfAimRadius`, about 1 u), a Tune slider. It's used by both the burst (ring) and Place (Shield ring, orbitals, motes, or an elemental patch under you).
- **Cone narrowing curve:** the half-angle eases from today's `imbueHalf` at the minimum reach down to a narrow lance at max distance. The reach grows from `imbueRange` (+ per rune) to a new max. Power stays per target (`imbuePower` 1). Earth's line lengthens. Lightning's fork picks targets inside the current arc.
- **Battery defences** (possessed fixtures) keep their 7 u half-ring on the burst whatever the aim distance; the fixture rule decides, not the cursor.

## Next (the checklist)

### Sim: casting
- [ ] `sim/cast.ts:294-304`: Shift+RMB release is always Place. Drop the `placeHold` tap/hold split, and the `placeHold` bump at :301. Keep `dragged` / `dragMin`, and keep `areaHeld` for the held Specials (:337, :345, :351).
- [ ] `sim/cast.ts:337`: the empty-queue hands path checks place only (Sweep, Siphon, Mend unchanged).
- [ ] `sim/cast.ts:14` header comment.
- [ ] Burst hold: hold Shift+LMB to preview, release to cast. Check the press buffer and the cancel window (:315, :346, :356) with a held Weapon.
- [ ] Stored spell (`sim/cast.ts:171,244`) and Echo (`sim/survive.ts:195-211`): an old stored Area becomes the self-aimed burst.
- [ ] `sim/config.ts:71-72`: delete `RHYTHM.placeHold` (client uses: `view-structures.ts:1789-1790`). Grep `tuning.ts` HELP.

### Sim: compile and effects
- [ ] `sim/compile.ts:110-135`: drop the `cast === 'area'` branches (nova, quake, discharge, push mod). The burst carries the shape, ring or cone, from the aim.
- [ ] `sim/compile.ts:25,29` shape union comments; remove `nova`, `quake` and `discharge` if nothing else produces them.
- [ ] `sim/compile.ts:139,145-147`: Sigil orbitals and motes, and the Shield ring, move to the Place branch on yourself.
- [ ] `sim/compile.ts:14-21` `imbueLine` and `imbueReach`: reach and width from the aim distance.
- [ ] `sim/effects.ts:174-194` `imbue()`: the ring case (full circle) must keep what the Area casts did:
  - `disc()` with `healRingPower` (`config.ts:169`);
  - the Earth quake's knockdown and +1 radius;
  - Lightning's Discharge (everything near) at the ring end, the fork beyond;
  - the Cold `ringChill` ×2 and Water `ringPush` ×2 axis (`effects.ts:257-260`), applied at the ring end or across the spectrum (decide; today the burst already has `ringPush`).
- [ ] `sim/effects.ts:251-265`: retire the `nova` / `quake` / `discharge` cases, or route them through the ring burst.
- [ ] `sim/effects.ts:317-340`: Shield blink's parting gift compiles `'area'` (:337). Make it the ring burst. Comment at :330.
- [ ] `sim/config.ts`: `novaRadius` / `novaPerRune` (:203) become the ring's radius. Review the `imbue*` (:212-225), `fork*` (:223) and `*Blast` comments "ring and burst" (:227-236). Add the max reach, the narrowest half-angle and `selfAimRadius`. `partingPower` comment (:327-328).
- [ ] `sim/tuning.ts:72-76` HELP strings naming the ring and Area. Check `tuning.test.ts`.

### Sim: structures, battery, bots
- [ ] `sim/structures.ts:5-15` header comments; the `ring` (:179), `orbitals` (:189-202) and `motes` (:203) are now created from Place-on-yourself. Elsewhere, a Shield Place without a drag keeps the arc (`arcwall` :180).
- [ ] `sim/battery.ts:33,138-142`: `driveButtons` and its comment ("the same half-ring as Area"). `sim/modes.ts:63-71` possession `ring`. `sim/battery-waves.ts:12,42,256`: the `ring` step teaches the burst key.
- [ ] `sim/bot.ts:38-42,95`: the bots' `BTN.area` holds are Place (fine); check intent. Any bot ring becomes a self-aimed burst.
- [ ] `sim/script.ts:28-32`: the scripted run's `k === 2` Area tap becomes a self-aimed `BTN.weapon` ring. **Re-record the golden hash** (`sim/test/golden.json`) and `sim/test/mode-hashes.json`, saying why.
- [ ] `sim/tutorial-bot.ts:142,171-172,199`: the frost ring and the Area taps.
- [ ] `sim/tutorial.ts:6,12,16` comments. The Cold beat (:305-309) checks chill only, so it still passes; its lines change (client).

### Rules (the Atlas is the source)
- [ ] `tools/spell-atlas/rules-c.js`:
  - the header (:10);
  - the `CASTS` table (:349-355): drop Area, Place becomes "Shift+RMB", and conjure says ring or cone;
  - the Area cells per form (:286, 292, 309, 317, 323, 329, 335, 342), folded into the `swing()` text (:220-228) with the aim-distance wording; Earthquake, Discharge and the Healing ring become the ring end;
  - Shield's `area` cell (:232-241) and Sigil's `area` (:256-269) move into `place` "on yourself";
  - Blink's `plainTitle(o.lead, 'area')` (:237);
  - Steam's `MIX` titles and texts (:94-96); `LOOK_NOUN` (:142); the energy/stuff split (:430); the Sigil payload text (:455); LEAVES (:531-545); STRUCTURES (:560-563).
- [ ] Atlas audits: `audit-a1.js:27`, `audit-c.js`, `depth-c.js`. Then `npm run sync-rules` (`rules/src/rules-c.gen.js`).
- [ ] `rules/src/index.ts:15-16`: remove `'area'` from `Cast`.
- [ ] Atlas page: `app.js:60,282,456-467,567-569,580`, `draw.js:60,170-215`, `index.html:233-234` (the cell count).
- [ ] `tools/spell-vfx/rules-c.js` is a stale snapshot (no Ice). Re-sync it or record the drift in its README.

### Client
- [ ] **Burst preview:** a new branch in `view-structures.ts` `preview()` (:1776), gated on `BTN.weapon` held with runes queued. It draws the ring or cone from `burstDepth()` (:1420). It shows to partners too. Only while held.
- [ ] Place preview (`view-structures.ts:1784-1825`): show at once (no `placeHold` fade), and add a self-target ghost (ring, orbitals, motes). Header at :14.
- [ ] Burst art: the ring end uses the novas (`art/novas.ts`, `drawNova`). The cone uses `drawBurst` (:548-560). The width in between morphs. `art/vfx.ts:30,352-366,526-536` the `'burst'` path.
- [ ] `view.ts:19,164-165,336-342`, `art/rigs.ts:35,75`, `art/sprites.ts:371-375`: the staff pose and the `area` one-shot clip (shot 2) play for a ring burst.
- [ ] `input.ts:6`, `menu.ts:62,75` controls text.
- [ ] `help-model.ts:63-72` (drop the Area row; Place without TAP/HOLD), `:89`, `:135-140,228-244,273` stat tables (nova, quake, discharge, orbitals, ring). Pre-existing mismatch: the spring radius here is 1.4 + 0.4n, the sim's 1.8 + 0.4n. `help-panel.ts:3,196`, `help-preview.ts` (`demo: 'area'`), `demo.ts:8-9,141`.
- [ ] `dev-options.ts:95` help text lists `area`.
- [ ] `tutorial-text.ts:37` Cold beat ("tap Shift+RMB: a frost ring") becomes Shift+LMB aimed at yourself. `:39,44` "hold Shift+RMB" becomes Shift+RMB. Life beat's healing ring.
- [ ] `battery-text.ts:21,23`: the ring prompt goes to Shift+LMB; the Place prompt drops "hold".
- [ ] Audio: `audio/recipes.ts:79-84` (shape to sound), `audio/gallery.ts:75,102,113`, `audio/lab.ts:79`. Check `scripts/sound-check.mjs` and `scripts/perf.mjs`.
- [ ] `lab/nova-lab.ts` keeps working off `drawNova`.
- [ ] Gamepad (noted, not built now): the reticle's 2.5 u minimum and kept aim (`gamepad.ts:25-26,61,99`). Later, the ring is the burst with the right stick centred. Header :9; `test/gamepad.test.ts:21,25` names "LT as Area".

### Tests
- [ ] `sim/test/casting.test.ts`: the ring taps (:182-195, 205, 215, 238, 250, 272-283, 303, 327-343, 416-419, 446, 609), the Area and Place block (:509-532, including the `imbuePower` comparison) and the cast loop (:616).
- [ ] `enemies.test.ts:54,106-108` (Arcane nova, Shield ring), `scaling.test.ts:26-37`, `structures.test.ts:99,273-305,391-432,660`, `tutorial.test.ts:253`, `battery.test.ts:111-125`, `battery-waves.test.ts:47-51`.
- [ ] Client: `help-model.test.ts:13,141-148,172`, `help-preview-isolation.test.ts:15`, `view.test.ts:35-36`.
- [ ] New tests: the self-aim threshold (ring versus cone), the narrowing with distance, Place-on-yourself for Shield, Sigil and elements, and Place firing on a tap.
- [ ] Balance tools: `tools/audit.balance.ts:23-48`, `balance.balance.ts:26-67`, `probe.balance.ts`, `weapon-dps.ts`. Then `npm run audit`, `balance`, `balance:weapons` and `scaling`, and commit the reports.

### Docs and review pages
- [ ] `docs/current-state.md:22-24,42-43,47,57,90` and `game/README.md:85,169,180-187,203`.
- [ ] `docs/ideas/spell-grammar.md` (the five casts become four) and `docs/ideas/conjured-weapons.md`.
- [ ] Generated: `npm run sound-gallery` (`tools/sound-gallery/engine.js` and `bank.js`); `tools/sound-gallery/index.html:220` hard-codes `CASTS`.
- [ ] Snapshots that only describe the old grammar get a drift note, not a rewrite: `tools/spell-vfx/` (`app.js:30` and the gallery's `cast: 'area'` entries), `tools/balance-notes/index.html:114,264-266`, `tools/sprites-3d/roles.py:27`. Older explorations stay as records.
- [ ] `npm run check`, `check:browser`, a screenshot; `check-links` 0.
- [ ] Close issue #10 (`Fixes #10`).

## How to work here

- The user playtests in the existing scenes (no review page). The radius of "on yourself" is a slider; the user will say if it's too strict.
- Gamepad is noted only. Don't build the pad rule until pads are in scope.

## Done

- 2026-11-22 Exploration and decision (all of Claude's recommendations accepted).
