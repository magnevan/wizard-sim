# Weapon motion flow: jabs, chaining and intent (2026-11-20)

The user's review of the spear and trident thrust (branch `worktree-weapon-fixes`, commit `3556166`): the jab is still far too long. In the Model Viewer the game starts the clip at about 0.5 s, the thrust is out at 0.7 s, it is **held to about 2.1 s**, and it is back at about 2.4 s. The user wants a jab, under a second, with no hold; transitions that don't return to a base pose between actions (jab → jab stays low and forward, jab → cast lifts the spear); and the game to catch the player's intent (clicks during recovery; RMB then W+Space for a heal).

Status: plan, waiting on the user's answers. Nothing here is built yet.

## What the code does today

- **The clip:** `thrust` (Meshy text-to-motion) has first 0.46, release 0.71 and last 2.54 s (`content/assets/models/wizard.json`). `shotClipTime` (`client/src/art/sprites.ts`) squeezes 0.46 to 0.71 into the 0.2 s after the game's release, then plays 0.71 to 2.54 at 3×, then blends to the standing pose over 0.3 s. That's about 1.1 s on screen, most of it the hold. Speeding up the hold can't turn it into a jab. The hold has to be cut out.
- **The viewer doesn't show the game's version.** "Play as the game" loops the clip between its marks on the clip's own clock. It skips the squeeze, the 3× tail, the ease-in and the blend out.
- **The sim's rhythm:** a Strike's recovery is `ARMS.strikeRecovery` (`sim/src/config.ts`): spear (cold) 0.9 s, trident (water) 0.65 s, staff 0.6 s, bow 0.45 s. The animation has to fit inside that.
- **Why Space is lost:** a cast press is buffered for `RHYTHM.castBuffer` = 0.3 s (`sim/src/cast.ts`, "A cast pressed while busy is buffered briefly"). A press early in a 0.9 s spear recovery expires before the recovery ends. The buffer also stores a raw button, and its meaning is decided when it fires. RMB pressed during recovery and then W pressed before it ends turns the buffered jab into a Water Force spell.
- **The snap after a jab:** the staff's grip and the thrust's `aim` ease out over `GRIP_OUT` = 0.35 s of *clip* time. That clip time now runs at 3×, so the settle lasts about 0.12 s, which reads as a snap. It's most visible on the staff, which is held highest.

## Research

- **Inertialization / dead blending:** blend *from whatever pose the body is in now* to the new action, instead of crossfading two running clips or going through a base pose. Gears of War 4 did transitions this way as a post-process (Bollo, GDC 2018). Holden's "dead blending" is a simpler form: extrapolate the old pose and fade it into the new one. Unreal 5.3 ships it as a node. This is the tool for jab → cast and cast → jab without a return to rest.
- **Buffers and cancel windows:** action games split recovery into frames you can't leave and a window that later actions may cancel. A press during recovery is held until the window opens (the God of War "buffered cancel"). Smash keeps only the last buffered input, about 9 to 10 frames. Fighting games mark these windows per move in frame data. A buffer that is too long feels mushy, and cancels are where balance breaks.
- **Combat stance:** many games keep a "ready" pose for a while after an attack (weapon forward, knees bent) and drop to the relaxed carry only after a pause. Repeated attacks start from ready, so they're short and look connected.
- **Bow and shield:** games mostly avoid the clash. The shield goes on the back while a two-hander is out (shown only when blocking), or two-handers can't use a shield. Skyrim lets two-handers block weaker than a shield.

## The plan

### 1. Animation: an upper-body action layer with stances (client only)

- **Re-cut every weapon clip into short segments:** `ready` (a held combat pose per weapon: spear low and forward, bow half-raised), `jab` (ready → out → ready, about 0.35 to 0.5 s, contact at about 0.12 s), and `settle` (ready → relaxed carry, about 0.3 s). The thrust's hold is dropped. I can re-cut the current Meshy clip by sampling frames: wind-up from 0.46, contact at 0.71, then jump straight to its return at about 2.1. That avoids buying a new clip, and only if the cut looks wrong would I buy a short "spear jab" motion.
- **Stance memory:** after a blow the body stays in `ready` for a linger window (about 0.8 s). Another blow plays `jab` from `ready`, with no recovery pose. Nothing else for the linger: `settle` plays.
- **Blend from the current pose:** each instance keeps its last bone pose. Any new action fades from that snapshot over about 0.1 to 0.15 s (dead blending). Jab → cast lifts straight from the forward spear into the cast's wind-up, and the snap disappears with the same change.
- **Intent from sim state, not local keys:** a co-op partner must see the same thing, so poses read only synced state. Runes queued: the casting hand comes up and the weapon drops a little. Recent shot, or the aim over an enemy in range: the bow stays raised. This needs no sim change.
- **Fit to the sim's rhythm:** the whole jab plus settle ends inside `strikeRecovery`, and the clip is retimed per weapon from that number, not from fixed factors.

### 2. Model Viewer: show what the game plays

- A "Game" mode that drives the real `livePose` with a synthetic `RigState` on real time, so the timeline is game seconds, with the release, recovery end and linger marked.
- A **sequence player**: scripted inputs (jab, jab, jab; jab → cast; jab → heal; bow tap ×3) so chains can be judged, not single clips.

### 3. Gameplay: catch intent (sim; changes the golden hash)

- **The buffer lasts until the recovery ends:** a press during recovery waits for the recovery, plus the 0.3 s grace after. Only the last press is kept. This fixes RMB → W+Space.
- **The buffer stores the meaning at press time:** RMB with nothing queued is a jab, even if a rune is queued afterwards.
- **Optional cancel window:** after a Strike's contact plus a short commit (about 40% of the recovery), a *spell* or a Retreat may cancel the rest. A second Strike may not. Strike DPS doesn't change (the balance reason for `strikeRecovery`), and spells keep their own wind-up. The cost is pillar 4's "explicit and consistent rhythm": the recovery stops being one flat number. It could be shown by the stance animation (out of `ready` = free). This needs the user's call.

### 4. The bow and the shield

The shield arm holds the bow in the archery clip, so they fight for the same hand. Options:
- **(a) A one-handed bow:** a hand crossbow, trigger hand only. The shield keeps blocking. That's a new prop and clip, and it's less "bow".
- **(b) Two-handed weapons as a class:** while a two-hander (bow, maybe the maul and the spear) is out, the guard rides on the back. It stays a passive bonus and keeps the Retreat, and Defend drops the weapon arm to block (slower raise).
- **(c) Bow plus guard but no Defend while drawn:** the guard slings back on each shot (as now), and holding Space switches to blocking. That's the closest to now and the weirdest to read.

Recommendation: **(b)**, with the guard on the back keeping its passive effect and the Retreat. It reads cleanly and gives two-handers a real cost. A crossbow (a) could be a later weapon of its own.

### 5. The other issues the user raised

- **Trident clipped on the far side while extending:** probably the live model's render cell (`CELL_W` × `CELL_H` in `art/live3d.ts`) is too small for the extended reach. Check, then enlarge or offset the cell for long weapons.
- **Particles through the body** (water drips, the fire sword's flame): the 2D VFX layer draws over the flat sprite. Use the 3D tip's view depth to put each particle in front of the body or behind it.
- **Snap after a jab:** see above. It's fixed by the grip and aim easing on real time, and by the pose-snapshot blend.
- **Arrow not from the bow:** the arrow's drawn origin should come from the bow prop's position in the live model, not the body or 2D rig anchor.
- **Arrow fires before the bow is up:** keep the instant shot (responsive) and hide the gap with the stance: the bow stays half-raised when aiming at a nearby enemy or after a recent shot, so a shot only finishes a short draw.

## Order of work

1. Viewer game mode and sequence player (so every later step can be judged).
2. Re-cut the thrust into ready / jab / settle, plus the stance memory, snapshot blending and the grip fix.
3. Apply it to the other weapons (lash, bow, sword swing) and the intent poses.
4. Sim buffer fixes (golden hash re-recorded on purpose).
5. The cancel window, if the user wants it.
6. The bow and shield direction, plus the trident, particle and arrow fixes.

Sources: [Bollo, Inertialization (GDC 2018)](https://gdcvault.com/play/1025165/Inertialization-High-Performance-Animation-Transitions); [Holden, Dead Blending](https://theorangeduck.com/page/dead-blending); [Combat Canceled: God of War & action game design](https://www.gamedeveloper.com/game-platforms/combat-canceled-i-god-of-war-i-action-game-design); [Smash buffering](https://www.ssbwiki.com/Buffering); [Skyrim: building better combat](https://www.gameinformer.com/b/features/archive/2011/01/24/skyrim-building-better-combat.aspx).
