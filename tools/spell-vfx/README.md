# Spell VFX Gallery

A page of looping pixel-art vignettes, one per spell of the current spell grammar (proposal C), drawn in the chosen art direction: the Pixel Battlefield look (high-res pixel art, the ~67° camera, banded dusk light, outlined procedural wizards). The user rates each vignette ★ Keep / ? Maybe / ✗ Cut, with an optional note. The question each one answers: can you tell what the spell does without reading the caption?

Everything is procedural (no image assets), and every vignette is a pure function of its local time, so loops are seamless and any frame can be reproduced.

Published at https://claude.ai/artifact/F2LeDE6z1FWx3HuAPsP9Vz (private to the user), with `capabilities: { db: {} }`. Republish to the same URL.

## What is on the page (94 vignettes)
- **Enemy attacks (6, `vfx-attacks.js`, group `attacks`, pass 8)** come first, in their own section (`keepGroup: true` keeps them out of "New and reworked"; they still carry the New badge and count under the "Changed" chip). A port of the game's `game/packages/client/src/art/enemy-attacks.ts` (`attackK`, `drawAttackFx`, `BEATS`, line for line), the attack poses of `art/rigs.ts` and the ground telegraphs of `view-structures.ts`, against the red wizard. Each card fakes the sim's per-body `{ ai, aiT }` with the real timings from `archetypes.ts`, so the quantized poses match the game. The game's g (ground) and o (over) canvases are two offscreen layers built in `frame()` (so the lights are known in time), drawn in `under2` and `fx`. 16 px per sim unit; the gallery's steeper camera (FY 0.88) makes ground offsets taller than in the game.
  - `atk-goblin` (club, dagger, spear in turn), `atk-brute` (fists, the slam, the crack, the 2.5 px shake; carries the card question `q-brute-shockwave`), `atk-shieldbearer` (the bash), `atk-archer` (draw, lock glint, release and string snap; the wizard sidesteps after the lock), `atk-imp` (the spit; the wizard burns), `atk-grabber` (coil, dash, catch, the hold ring teal → gold → red blink, the throw).
  - Not the game's: the grabber's drag is scaled to 2.2 u over the hold (the game drags at 2.3 u/s) so it fits the card; the brute and archer face toward the camera, the others away (so the target stands behind them and doesn't hide the blow).
  - Cards may now carry `enemy: true` (no spell recipe: `tags` are shown instead), `calls` (a bullet list of the judgment calls to rate) and `question: { id, text, pick }` (an answer box under the caption, saved to collection `answers`, doc `id`; blank = Claude's pick stands).
  - `actors.js` gained the game's attack poses: `s.atk` (-1 / unset none; 0..0.5 wind-up; 0.55 mid-swing; 0.6 strike held; 0.6..1 recovery) and `s.hold` on goblin-sized rigs (per-variant wind-up and strike hands, lean, lunge, stance, the club / dagger / spear / shield / claw poses, the imp's glowing mouth, claws and crown, the archer's lock glint, string snap and recoil), and the brute's slam lean from `s.smash`. With `s.atk` unset every rig draws exactly as before (the club keeps its old rest pose).
- **New and reworked (18)** come first, in their own section with a badge (`fresh: 'new' | 'reworked'` on the vignette; `?fresh=0` puts them back in their groups, the "Changed" chip filters to them). Only this pass's changes are marked: the pass 6 marks were cleared once the user had rated the goblin set. New slugs are new visuals, so old ratings stay on the old slugs; reworked ones kept their slug.
  - Pass 7 new: the 17 deaths of the other enemies (see Deaths: the other enemies below), and `death-goblin-arcane-v3` (the game's calm v3 on the goblin, same scene as v2).
- **Forms (21):** the seven plain elements × Force / Area / Place. The fire patch is `fire-place-v3`: one continuous sheet of merged flame over glowing ground, with char only at the rim and once it dies down.
- **Payloads and mixes (8):** fireball (fast and nearly flat), frost beam, lightning arc through soaked enemies, flame arc v2 (a white-hot plasma arc spraying molten sparks that fall and cool; no upward tongues), scalding spray, steam cloud, ice shards, ice sheet.
- **Shield barriers (8):** drawn rock wall, ring of stone, barrier arc, tidal wave, fault line, fire curtain arc, ward, and stone armour coated in fire v3 (four big plates flush on the body, the robe greys to stone under them, thin glowing seams and small licks off the shoulders).
- **Life: support spells (8, `vfx-life.js`, group `life`):** Life leads, and the other elements lend it their shape, never their harm. Heals read as help: green and gold light, rising sparkles and pluses, health bars ticking up.
  - `life-chain-heal` (Life + Lightning): a green arc leaps from ally to ally.
  - `life-healing-spray` (Life + Fire): a flamethrower-shaped cone of warm gold-green light that heals and thaws.
  - `life-heal-stone` (Life + Earth): a stone lobbed over a rock wall that bursts into a healing wave.
  - `life-healing-shards` (Life + Cold): shards that curve onto hurt allies.
  - `life-rescue-spray` (Life + Water): douses a burning ally, heals them and nudges them out of the fire.
  - `life-palm` (Life, Weapon: Healing palm): an open-hand pulse reaches the ally ahead, one-off.
  - `sg-healing-hands` (Sigil + Life, Weapon): glowing hands with violet cuffs heal while touching.
  - `sh-mending-ward` (Shield + Life on yourself): the ward skin in green, health mending slowly through arrow hits.
- **Sigil devices (9):** flamethrower turret, stone orbitals, fire glyph, lightning line glyph, lens (Sigil alone, Place: a mote hops to the cursor and the lens opens there), rune motes, blink (Sigil alone, Force: the caster dissolves into pixels and reassembles a short way along the aim, out from under a brute's smash; the bound rune circles the head for a moment, so blinks can't be chained), double, sculpting wand.
- **Sigil auras (7):** fire (you exude fire: a glowing outline, flames peeling off the silhouette and leaning out, embers streaming outward, warm light on the ground; no ring of flame), frost, mist, haste, regeneration, bulldoze, glass cannon.
- **Deaths: goblin (10, `vfx-deaths.js`, group `deaths`):** a trial of "one base death per enemy plus an element overlay". Each card tags its approach (`approach`: base (no overlay) / base + overlay / bespoke) and the death event that drives it (`event`).
  - The event: `{ archetype, element, delivery, dir, statuses: { frozen, wet, burning, stunned, chilled }, overkill, mix? }`. `delivery` is how the killing hit arrived: `missile | burst` (nova, quake, geyser) `| channel | arc | melee | wave`. `mix: 'scald'` marks water + fire.
  - **The dispatch rule** (`pick()`, first match wins): frozen → shatter; mix scald → steam; earth + burst → quake; earth + missile → boulder (`death-goblin-earth`); fire → fire; cold → cold; lightning → lightning; arcane → arcane; otherwise → base. So water, shield, life, sigil, and earth by any other delivery all use the base death. Wet doesn't change the lightning death: a soaked target gets it plus the world's own wet-lightning surge.
  - `baseDeath(g, t, dir, motion)`: impact flash and recoil, a fall profile (`topple`, `plank` (rigid rotation of the captured pixels), `none`, `fling`, `slide`, `bounce` (straight up, a rigid tumble about the middle, a crumpled landing in place), `slump` (sinks in one smooth movement)), a beat lying there, a cartoon poof, the dropped club (`clubStill`: it's just there when the cloud clears).
  - `overlay[kind](ctx, g, t, dir, statuses, A, m)` draws on top. Hooks on the function: `.motion` / `.motionFor(statuses)` (base parameters, exit kind and colours), `.body` (rig state patch), `.ground` (the lingering mark), `.lights`.
  - `bespoke.shatter` (frozen at death, any blow) and `bespoke.arcane` replace the body with its own pixels (`sprite()` draws the rig once offscreen and keeps the pixel list).
  - The cards: base, fire-v2 (flames run along the body's own outline via `edgesOf()` / `silFlames()`, then char, ember outline, ash crumble; no combustion burst), frozen-shatter-v2 (body-shaped ice, see `frozenBody()` below; the shards are that ice), cold, lightning, arcane-v2 (the nudge burst, pink seams crack across the body, the pieces strain apart on threads that snap, then unravel from their edges and pop into nothing; `piecesOf()`; all in the camera plane), arcane-v3 (the game's calm tear: a 2 px nudge, fine seams, a dozen small pieces creeping about 6 px apart on one short thread per seam that lets go quietly, unravelling edges inward; `BESPOKE.arcane3` from `vfx-deaths-2.js`, picked by `ev.v: 3`; `piecesOf(..., v3 = true)` matches the game's `piecesOf`), earth = the boulder death (missile only), quake (bounced up, tumbles, lands crumpled in cracked ground, debris and dust; not flung), steam-v2 (a steady flush, ear steam, a smooth slump, a steam puff, a soot cloud; no shaking anywhere).
  - Retired (off the page, slugs reserved, never reuse): `death-goblin-fire`, `-frozen-shatter`, `-arcane`, `-steam` (replaced by `-v2`), `-water` (water uses the base), `-wet-lightning`.
- **Deaths: the other enemies (17, `vfx-deaths-2.js`, group `deaths2`, pass 7):** every archetype plays the goblin set on its own rig unless its body changes how a death reads. Those overrides register on `PB.deaths.arch[archetype] = { S, pick(ev, kind), overlay: { kind }, bespoke: { kind }, drop }` and the runner in `vfx-deaths.js` looks there first. Overlays may add `.stand(stand, g, td, dir, st, m)` (props: a thrown bow, a dropped shield) and `.shake(td, m)`. A new fall profile `heavy` (rocks, kneels, tips like a felled tree about `m.pivot`, slams) serves the brute. The game port is `game/packages/client/src/art/deaths.ts` (`ARCH`).
  - Brute: `death-brute-base`, `-boulder`, `-quake`, `-cold` (all the heavy fall, with a ground shake).
  - Archer: `death-archer-base` (bow flies, arrows spill), `-fire` (string snaps, bow burns on the ground, arrows flare), `-boulder` (bow and arrows thrown along).
  - Fire imp: `death-imp-base` (crown flame left flickering), `-cold` (cools to stone, lava cracks, cinders), `-water` (doused: steam, a smoking lump; also scald), `-frozen-shatter` (glowing shards that steam).
  - Grabber: `death-grabber-base` (skids, claw furrows), `-lightning` (claw-to-claw arc), `-arcane` (the calm v3 tear, arms first; `PB.deaths.bespoke.arcane3` is the game's v3, now in the gallery too).
  - Shieldbearer: `death-shieldbearer-base` (shield drops flat with a clang), `-boulder` (shield splintered), `-fire` (shield burns on the ground, iron rim and boss left).
  - `actors.js` gained the game's imp / grabber / shieldbearer variants (`pal: 3|4|5`, `variant: 3|4|5`), `s.bare` (the weapon has left its hands), `s.crown` (the imp's crown flame), `claws` / `shield` anchors, and eye colour / shut eyes on the brute.
- **Frozen look (pass 6):** frozen bodies no longer sit in a cube. `PB.actors.frozenBody(solid, col, w, h, grow, seed)` in `actors.js` takes any silhouette mask and returns the pixels to paint: the body tinted pale blue with rime on its sky-facing pixels, a shell of clear ice hugging the silhouette (1 px, 2 px at the foot, lit pale on the left, deep blue at the base, a white lip and a glint), and up to four jagged crystal spikes leaning up and outward. `grow` (0..1) fills it from the feet up. The rig uses it for `s.frozen` (`s.iceShape: 'block'` brings back the old cube).

The Sigil device (pass 4, `K.sigilDevice` in `fx.js`, also copied into `tools/art-pixel-hd/render.js`): a carved dais with a violet groove, a hovering crystal in the payload's colours with a violet outline and halo, and three runic stone plates orbiting it with violet runes. `K.runeRing` turns under it on the ground. Charge: the plates pull in and the crystal whitens as the owner's mote lands. Recoil: the crystal kicks up and the plates flare out. Dry: the crystal sinks to a dull ember, the plates droop and dim, and the ground runes blink.

The shared cast pose (`actors.js`) now holds the staff out in front, nearly level, for every Force cast (the user's note on `mix-ice-shards`).

Visual conventions:
- Red is the caster, blue the ally, green goblins and the purple brute are enemies.
- Before every cast, the queued runes fly to the staff in their element colours (the prep charge from art-pixel-hd).
- Place casts show a cursor reticle. Drag casts show the dotted drag path.
- No status icons over heads. Status is on the body: burning = flames and embers on the sprite; chilled = an icy tint plus rime on the top edges (crystal spikes when heavy, which is also how "frozen" reads now); wet = darker sprite with drips; shocked = the x-ray flicker plus a white outline on alternate frames; scalded = a red flush plus steam.
- Devices sit on a violet seal ring. Rune costs show as motes flowing from the caster.

## Files
- `index.html`: the page (intro, filters, cards, general notes).
- `app.js`: cards, captions from the rules, the animation loop, IntersectionObserver pausing, ratings.
- `rules-c.js`: **a snapshot** of `tools/spell-atlas/rules-c.js` (re-copied 2026-11-04 by the main session: Life leads, Lens is Place, Blink is Force). It's the source of titles, descriptions, recipes, payload traits and cost tags. If the rules change, copy the file again and check that the captions still fit.
  - **Behind the Atlas (found 2026-11-12):** the Atlas has since gained Ice as a combined rune (Water + Cold, `COMBINE`, `kind` from `addElement`), Shield Force became Blink and Sigil Force the stored spell. A plain re-copy would retitle 8 of the 59 recipes the cards use: `shield` force (Shove wave → Blink), `life+cold` force (Healing shards → Cooling spray), `water+cold` force / place (Ice shards / Ice sheet → Water spray / Rain: the cards would need the combined `ice` rune in `q`), `shield+water+water` force (Tidal wave → Water blink), `shield+earth` force (Fault line → Earth blink), `shield+fire` place (Curtain arc → Coated arc), `sigil` force (Blink → Stored spell). The legend would also list Ice. Re-copy together with a pass over those cards.
- `core.js`: camera constants (FY 0.88, CU 0.8, matching art-pixel-hd), easing, the seeded `rand`, and the deterministic particle emitter `emit`.
- `pixel.js`: copied from `tools/art-pixel-hd/pixel.js`, plus a Sigil ramp, a Sigil icon and a `?` glyph.
- `actors.js`: copied from `tools/art-pixel-hd/actors.js` (the wizard, goblin, archer and brute rigs). Changes: `s.fallSide` (topple along the blow), `s.eyeCol` / `s.eyesShut` on goblins (pass 5, for deaths); a hit flash below 0.15 is a faint 2/16 flicker tinted by `s.flashCol`; `s.chill` (icy tint + rime), `s.tint`/`s.tintK`, `s.outline` (glowing outline colour), `s.skin` (`{ k, col, col2, hi, hit }`, a shimmering energy skin), and a white outline while shocked.
- `stage.js`: renders one 200×124 art-pixel scene. In order: cached ground, decals, shadows, the depth-sorted stand pass, the banded light map (emissive pixels skip it), then unlit effects. It also holds the actor builders (`K.wiz`, `K.gob`, `K.archer`, `K.brute`, `K.pose`).
- `fx.js`: the effects kit `K` (pass 3 added `shard`, `fireball`, `flameLink`, `mote`):
  - prep charge, beams with a payload strand and riders, spray cones, area rings, lightning
  - status effects (burning, dripping, frosty, chilled, pip, heal pluses)
  - dust, debris, cracks, rocks
  - walls extruded from a line, with damage (`dmg: [{ f, k }]`): a jagged bite out of the top, dark cracks with a lit lip, pale spalls, a hole at heavy damage and rubble at the foot. Each segment draws its own share of the pattern, so depth order holds. Energy sheets that fade; fire curtains
  - glyphs, line glyphs, the Sigil device (`sigilDevice`, wrapped by `device`), rune rings, seal rings, ammo and rune-pool pips, auras
- `vfx-forms.js`, `vfx-payload.js`, `vfx-shield.js`, `vfx-sigil.js`, `vfx-life.js`, `vfx-deaths.js`, `vfx-deaths-2.js`, `vfx-attacks.js`: the vignettes. `vfx-forms.js` also adds the shared helpers (`K.life`, `K.kb`, `K.down`, `K.hop`, `K.flash`, `K.walk`, `K.hp`, `K.puddle`, `K.caster`).
- `filmstrip.html`: QA only, not for publishing. It shows frames side by side: `?ids=a,b&n=4&scale=2`, `?group=shield`, `?times=0.5,1,1.5`, and `?crop=x,y,w,h` (stage pixels, zoomed by `scale`) for a close look.

## URL parameters (index.html)
- `?t=<sec>` freezes every vignette at that time (taken modulo each loop). Use it for screenshots.
- `?only=<slug>,<slug>` shows only those vignettes. `?group=attacks|forms|payload|shield|life|sigil|aura|deaths|deaths2` shows one group.
- `?scale=<n>` forces the pixel scale. By default it is the largest integer that fits the card. Below 2× the canvas fills the card width instead (phones).
- `?static=1` behaves like prefers-reduced-motion: still frames, and a click plays that card.
- `?bench=1` writes timings to `body[data-bench]`: the first pass, and the steady-state mean per frame.

Animation: only cards on screen render (IntersectionObserver), at about 30 fps. Every card draws one still frame at load (`still`, default 42% of the loop), so the page is complete at rest. Clicking a screen pauses it. Steady state measured headless: a mean of 1.77 ms per vignette frame, worst 5.2 ms (`sh-ring-stone`); `life-heal-stone` and `fire-place-v3` take about 3.2 to 3.7 ms.

## Ratings
- Ratings live in the artifact's db, collection `ratings`, one doc per vignette slug: `{ mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }`.
- General notes are in collection `answers`, doc `general`: `{ mark: null, note, updatedAt }`. Card questions are in `answers` too, one doc per question id (`q-brute-shockwave`: should the brute's slam travel out from its fists as a shockwave?).
- Without the db, ratings are kept in this browser only (localStorage `spell-vfx-v1`).

Read them with `ArtifactData` `list` on `ratings` and `answers`, then fold them into `docs/ideas/art-direction.md`.

## Adding a vignette
1. Pick the file for its group and `add({ ... })` (in `vfx-sigil.js`, auras use `auraVignette(...)`):
   - `id`: a stable slug, which is also the db doc id. Never rename one that has ratings.
   - `group`, `q` (the queue, e.g. `['sigil', 'fire', 'fire']`), `cast` (`force|area|place|self|conjure`), and `opts` (`{ drag: true }`).
   - `dur`, the loop in seconds (about 3–4.6), plus `ground` (`grass|path|plaza`) and `seed`.
   - Optional: `title` and `line` override the caption from the rules; `still` sets the time of the resting frame.
   - `frame(t, K)` returns `{ actors, under(c, E), under2, stand: [[y, fn(c, E)]], lights: [[x, y, r, colour, a]], fx(c, A, E), shake }`. `A[id]` holds each actor's anchors (`tip`, `chest`, `head`, `charge`, `hands`, `bowTip`). Inside `under` or `stand`, `E.em(fn)` draws emissive pixels and `E.op(fn)` draws opaque ones over the mask.
2. Use the standard rhythm: `K.caster(t, el, c0, c1)` preps from 0.05 to c0 and casts from c0 to c1. Call `K.prep(...)` in `fx` for the rune charge, and use `K.life(t, D)` so hit bodies fade out at the loop's end and back in at its start.
3. Check it: open `filmstrip.html?ids=<slug>&n=6` (or screenshot it headless), then `index.html?only=<slug>`, and look for errors in `#errs`.

Headless screenshots (use your own profile directory each time):
`chrome --headless=new --user-data-dir=<fresh dir> --window-size=1760,1100 --virtual-time-budget=5000 --screenshot=<png> "file:///.../tools/spell-vfx/filmstrip.html?group=shield&n=4"`. Headless Chrome won't lay out narrower than about 500 px, so test phone width in a 390 px iframe.

## Known weak spots
- The Life vignettes are small at 2×: the sparkles and pluses carry the "help" read, and the health bars do the rest. `life-palm`'s hand-print pulse is tiny. In `sg-healing-hands` the staff still shows, because the rig has no empty-hands pose.
- `sh-armour-fire-v3`: the stone tint also greys the hat a little, and the pauldrons sit close to the beard.
- `au-fire`: the ground glow is light only, so on grass it reads warm green rather than orange.
- The staff-forward cast pose applies to every vignette. Most use the live tip anchor; a few hard-coded launch points were checked (ice shards), not all.
- Stone orbitals still show ammo pips; the turret rule (pay from the owner's pool) was not applied to them.
- The sculpting wand is drawn in the unlit pass, so it always sits over the caster's body, even when the hand is behind it.
- The double's half-power repeat reads by thickness alone.
- Deaths: goblins face slightly toward the camera (`Math.PI - 0.65`); facing due west hides the ears, and the charred silhouette turned into a blob. The steam death's ear jets and the lightning sparks are a few pixels and want 3× to read well. Arcane v2's threads are 1 px lines and read best at 3×; under the pink light the goblin reads tan-pink rather than green while it cracks. The quake's launch dust is a flat tan blob for a few frames.
