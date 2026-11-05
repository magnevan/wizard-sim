---
status: adopted
pillars: [5]
related: [../../tools/art-styles/]
---

# Art direction

## One-liner
The visual style that keeps chaotic co-op spell fights readable while staying cartoony and arcadey.

## Explored (2026-11-03)
The Art Style Explorer (https://claude.ai/artifact/33DELSAis34SSDvLJ69rwG) draws the same fight in six directions, with a Chaos slider to stress-test readability:
1. **Bold Toon:** thick outlines, flat fills (Magicka, Castle Crashers, Overcooked). Strong readability, matches the tone, low-to-medium cost.
2. **Paper Diorama:** cut paper and felt, stop-motion feel (Paper Mario, Tearaway). Charming, medium readability.
3. **Storybook Ink & Watercolor:** washes on paper (Ori concept art, Gris). Whimsical, weak in chaos, high cost.
4. **Chunky Pixel:** low resolution with a limited palette (Wizard of Legend, Nuclear Throne). Weak at this scale; spell combinations multiply animation work.
5. **Dark Painterly Glow:** a dim world lit by spells (Hades, Diablo). Moody; spells pop.
6. **Clear Signal:** shape and colour codes, colour-blind safe (Into the Breach). Maximum clarity, less charm.

## Constraints known so far
- The camera is pseudo-2D top-down (lobbed arcs read poorly).
- Friendly-fire chaos must stay readable: who is who, and which element is which.

## Open questions
- Which direction? Round 2 tests hybrids directly (Toon Dusk, Glow Arcade, Pixel + Smooth VFX).

## Round 1 verdicts (2026-11-03)
Maybe: Bold Toon, Chunky Pixel, Dark Painterly Glow. Cut: Paper Diorama, Storybook Ink, Clear Signal. No notes. See `explorations/2026-11-03-feedback-round-3.md`.

## Round 2 (2026-11-03): three variants per survivor
Same explorer, shown above round 1. The scene now also tests proposal C's payload: P1's arcane beam carries Fire, so the brute catches fire. Each variant had to make that readable.

| Family | Variant | Question it answers | Builder's read |
|---|---|---|---|
| Toon | Toon Dusk | Toon characters in a dim world lit by spells | best looking; payload reads by colour and light |
| Toon | Toon Coded | fixed colour + shape per element, status pins, team rings | clearest payload ("arcane beam with fire" from one still); a bit clinical |
| Toon | Toon Vinyl | softer, friendlier designer-toy look | friendly; effects turn to mush at high chaos without outlines |
| Pixel | Hi-Bit Lit | 2× resolution pixel art with a coloured light map | moodiest; about 4× the sprite work |
| Pixel | Pixel + Smooth VFX | pixel bodies, smooth particle spells | best fix for "combinations multiply animation work": new combo = new parameters, not frames |
| Pixel | Bold Poster | 16 colours, 128×80, huge sprites | cheapest and loudest; beam reads like a diagram |
| Glow | Glow Arcade | dark world with bright outlined toon characters | strongest of its family: glow and cartoony coexist, and the payload reads at any chaos |
| Glow | Neon Dusk | three values, neon spells, silhouettes | maximum spell pop, but possibly too abstract for the tone |
| Glow | Firelit Tavern | richer painted environment | prettiest, but a fire-lit world fights fire spells |

**Cross-cutting findings:**
- **Payload readability is solvable in every family** with the same tricks:
  - a second-colour strand twisting around the beam
  - payload-coloured particles riding toward the target
  - the status spreading from the impact point
  - a status icon on the target
  - a "form + payload" chip in the HUD (Toon Coded: an outer ring for the form, an inner shape for each payload)
- **Toon Dusk and Glow Arcade converge** on the same hybrid: outlined cartoon characters with spells as the light sources. That's a candidate direction if the user likes it.
- **Known flaw in the scene:** the brute stands next to the burning grass, so its burn could be read as caused by the grass rather than the beam.

## Round 2 verdicts (2026-11-03)
- **Keep:** Hi-Bit Lit (`pixel-hibit`) and Firelit Tavern (`glow-warm`).
- **Maybe:** Pixel + Smooth VFX.
- **Cut:** Neon Dusk, Bold Poster ("too crude") and Vinyl.
- **Not rated:** Toon Dusk, Toon Coded and Glow Arcade.
- **Hi-Bit note:** pixel art, but more readable at the higher resolution. The pixel style may lend itself to *procedural animation and effects* more than the others do, which suits a game with this much variation. We should be **much more zoomed out**: the "DPI" looks right, but the scene takes up only a tiny fraction of the screen.
- **In chat:** explore high-res pixel art full screen. The camera-facing, side-on perspective used in every style so far is wrong. Use a Magicka-style 3/4 top-down camera instead.
- **Built:** `tools/art-pixel-hd/`, the Pixel Battlefield page (https://claude.ai/artifact/BwW5WDghxYLXBniwYYBuRi). Weaknesses noted at build time:
  - It renders at about 21 ms per frame, CPU only.
  - Wizards are simple bell shapes, and you can only tell which way they face from a few pixels.
  - Most wizards are seen from behind.
  - Light ignores height.
  - The shield reads more as a mesh than as energy.

## Pixel Battlefield verdicts (2026-11-03)
- **Overall: keep.** "I like it." The dithering or screen-door effect is a bit strong.
- **Camera: steeper.** The tilt gives a very strong forward bias. Make it more neutral, so threats can come from more directions; some bias against threats from the bottom of the screen is fine.
- **Zoom:** 2× to 3× feels about right. It's hard to judge until the angle changes.
- **Structures:** clear.
- **Procedural animation and effects:** promising.
- **Rune HUD:** fine as a first pass.
  - **Orbiting ally pixels are unclear.** Do they show what an ally is casting, or what they have ready?
  - **Idea:** float pixels for the runes an ally has *ready*. An ice mage has lots of blue swirling around them; a depleted mage has only a few. This risks visual noise.
  - **Also needed:** clearer animations for a caster who is preparing a spell.
- **Next pass:** a steeper camera, lighter dither, ally rune motes as a "readiness" swirl, and a visible animation while a spell is being prepared.

## Pixel Battlefield pass 2 (2026-11-03, published for review)
- **Camera:** about 67° (FY 0.88, terrain height 0.38 px per unit). Pass 1 was really about 32°. Characters are drawn at 0.8 of their height, the usual top-down cheat.
- **Map:** a central plaza with threats from the west road, the north gully and the east road. The south is closed.
- **Dither:** flat light bands, with dither only at band seams.
- **Readiness swirl:** one mote per ready rune, in element colours. Blue is a deep cold specialist, Gold is nearly depleted.
- **Prep:** 0.55–0.7 s before every cast. Queued motes fly to the raised staff and orbit as a charge, then burst on the cast. The HUD has a queue chip.
- **Also:**
  - Cliff tops ignore lights on low ground.
  - The shield is an arc of light.
  - The rock wall is a row of earth spurs.
  - About 14 ms per frame at 3×.
- **Known weak spots:**
  - The swirl is faint at 2× and P1's swirl is confetti-like.
  - Violet's prep charge is small.
  - Back-view hats look squat.
  - Rock spurs read as spikes more than a wall.
  - The shield sheet is faint.
  - The frozen puddle is a white blob.
- **Feedback:** db docs `p2-*` in `answers`. The pass-1 docs are kept.

### Pass 2 feedback (2026-11-03)

- Overall: better. Dither: better.
- Camera: about right at 2×, but some sprites still read as front-facing, which muddles the perspective: square ground bricks and trees drawn face-on. Next pass should foreshorten floor tiles (wider than tall) and draw trees from above (round crowns, short trunks).
- Zoom: somewhere in 2×–3× depending on what's happening; likely a player setting.
- Swirl: clear. Subtle, but an OK bit of flair.
- Prep: mixed. Subtle, probably fine for now; revisit once we have game experience.
- Other: silhouettes fine. Walls and shields need a visible damage state; walls should last a while in play (the ice wall falls too fast in the loop). A shield should start fading as its caster runs low on runes (fits the energy-upkeep rule). Walls look too small, the ice wall especially; it doesn't look like it would block anyone. Spell visuals get a deeper pass later.
- Chaos slider: removed. The user didn't notice it (effects sat at the edges and were spread across the loop). Background mayhem is now fixed at 0.8; `?chaos=` remains as a debug override.

### Spell VFX gallery (2026-11-04, built overnight)
`tools/spell-vfx/` has 53 looping vignettes of the current spells in the Pixel Battlefield style: forms, payloads and water mixes, Shield barriers (tall walls with crack damage, the arc fading as Shield runes drain), Sigil devices and auras. Each one is rated in its db. Known weak spots:
- wall cracks are faint on dark faces
- the lens and wand "spared" moments are quick and lean on text labels (RELEASE, HALF, X2, ?, !)
- the brute's hit flash is loud during beams
- the fire glyph's light is too wide
- the wand itself is barely visible
- orbitals and motes are small at 2×

### Pixel Battlefield pass 3 (2026-11-04, overnight)
Built from the pass 2 feedback and published as v4. Feedback ids are `p3-*`.
- **Perspective:** floor slabs are foreshortened ground squares (12 × 10.5 px) in mixed sizes. Trees are domes and conifer tiers seen from above. Boulders are faceted domes. Columns have round tops. Cliff tops have a bevel.
- **Walls:** new `walls.js` builds thick slab walls with correct occlusion via a cached raycaster. They have five damage states. The rock wall takes four punches. The frost wall cracks, then breaks through on the brute's second blow. Both are raised again later in the loop.
- **Current rules:**
  - Blue's wall is a stone arc coated in frost (Shield + Earth + Cold) instead of an ice wall.
  - The puddle freezes into a clear ice sheet.
  - The turret is a Sigil device whose eight fire pips are its ammo; it gutters out when they're spent and is re-planted.
  - The glyph is Sigil + Earth.
  - The HUD puts Sigil on D and Earth on G, with a hollow pip for a bound Sigil rune.
- **Shield fade:** the shield follows Gold's shield pool. Each arrow costs 0.25 of a rune. It is weakest around 7.3 s, when it is lower and dimmer, drops columns and stutters, and it never falls below 30%.
- **Smaller fixes:** fatter swirl motes at 2×, P1's swirl drawn as a ribbon, a bigger conjure charge, and hat tips that flop sideways from behind.
- **Weak spots:**
  - the frost wall's rime is busy and very bright at 4×
  - the 0.3 s wall swap looks messy up close
  - the rock wall is dark in dusk light
  - the rise animation steps through 7 heights
  - the glyph spikes and shield pylons are still drawn face-on
- **VFX gallery v2 (polish pass):**
  - Wall damage now reads on the dark faces: cracks with a pale lip, chips, a hole, and rubble at the foot. The ring of stone now gets clubbed.
  - All text labels are gone. The waypoint shows a tether and a streak, the Double shows red sight lines and a thin half-power thread, the glass cannon gets a big impact and shoves the brute, and the wand's nova bends round the ally.
  - The lens pass-through is slow and dramatic. The wand is clearly visible. Beam hit flashes are toned down, the fire glyph's light is tighter, and orbitals and motes are bigger.
  - Remaining weak spots: fine cracks at 2×, the Double's half-power repeat only reads next to the full chain, and the wand is drawn over the body when it's behind.

## 2026-11-04: Feedback on VFX gallery v2 and Pixel Battlefield pass 3
- **Battlefield pass 3:** better overall; walls solid, damage states and shield fade clear. Perspective "mostly": the floor tiles still read as top-down while the pillars read as side-on, so the two disagree. The rune HUD should be two rows like the keys. The turret must not run out unless its owner does.
- **VFX keepers:** most single-element Force/Area/Place, the shield structures (arc, curtain, drawn rock, fault, tidal), the glyphs, the wand, scald and steam.
- **VFX cuts:** fire patch (pulsing scale, flat patch with dancing lights), rock on fire and the arcane beam with frost (strong element dominated the look: see the look rule in decisions), the freezing spray (too strong, now ice shards), stone armour on fire.
- **VFX notes:** fire looks square-ish (finer pixels); frost spray should be organic, not cubes; flood should read as rain; fire aura continuous; frost aura ground uneven and its circle off-perspective; lens near-instant and cooler than a dithered cell; motes spiral in along the orbit; orbitals smaller; waypoint very fast, no vertical line; stone ring crumbles rather than sinks, larger radius; ward as a shimmering skin; Double not convincing yet; Life beam lighter; healing spring lasts longer; no status icons over enemies; lightning + fire wants something better than orange lightning.
- **Battlefield pass 4 (published):**
  - **Camera:** one camera for everything (ground FY 0.6). Floor slabs are wider than tall and have a front edge. Columns, the plinth, trees and rocks show big tops, and all shadows fall to the lower right.
  - **HUD:** two staggered rows like the keys.
  - **Turret:** it draws a fire rune from Red for each shot. When the east crowd arrives, Red runs dry and the turret waits as an ember.
  - **Status:** shown on the bodies, with no icons.
  - **Red's beam:** now a fire beam.
  - **Not asked for:** the look rule was also applied to Violet's hammer (pink), Gold's glyph (earth tones) and the turret's sigil (embers). Two crowd goblins were added and two pokes dropped so the dry moment shows.
  - **Weak spots:**
    - The dry state is subtle at 3×.
    - Wizards now look tall next to the stubbier props.
    - The steam burst is still a white blob.
  - **Questions:** `p4-*`.
- **VFX gallery v3 (published):** a "New and reworked" section at the top. New slugs: `fire-place-v2`, `pay-fireball`, `pay-frost-beam`, `pay-flame-arc` (a rope of flame jumping body to body, not orange lightning), `mix-ice-shards`, `sh-armour-fire-v2` (plates assemble onto the body), `sg-turret-fire-v2` (a mote from the owner's pool per shot; stalls when the owner is dry). Reworked on the same slug: fire-force, cold-force, life-force, life-place, water-place (rain), sh-ring-stone, sh-ward (a skin), sg-orbitals-stone, sg-lens, sg-motes, sg-waypoint, sg-double, au-fire, au-frost. Status icons are gone; status shows on bodies (rime and icy tint, flames, drips, a white outline when shocked). Known weak spots: once the armour ignites the fire hides the stone; the Double is still quite pink.
- **Open:** should orbitals also draw from the owner's pool like the turret? They still carry their own ammo.
- **Battlefield pass 4 feedback (2026-11-04):**
  - Better overall. The perspective now agrees ("I think it's fine", at 3×).
  - The two-row HUD is good. The turret rule reads. Status on bodies is clear. The fire beam reads right.
  - One note: "turret design is a bit boring, looks like a torch on a cube." A turret redesign for both the Battlefield and the VFX gallery is in progress.
- **VFX gallery v3 feedback (2026-11-04):**
  - **Keep:** au-frost, cold-force, fire-force, frost beam, the Double, lens, motes, stone orbitals, the turret v2, stone ring, the ward ("much better") and the rain flood.
  - **Ice shards:** keep, but the caster should hold the wand out in front, not up.
  - **Fireball:** good, but the trajectory should be straighter.
  - **Flame arc:** maybe. It should be plasma-like (sparks, molten steel flying, glowing), not a burning rope with flames only going up.
  - **Fire aura:** maybe. You should be exuding fire, not standing in a ring of it.
  - **Fire patch v2:** still muddy, and you can count the separate patches.
  - **Stone armour v2:** maybe; better, but it reads a little weird.
  - These are folded into the VFX v4 pass that is in progress.
- **VFX gallery v4 and Battlefield pass 4.1 (published 2026-11-04):**
  - **New turret** in both, replacing the "torch on a cube": a hovering fire crystal over a carved dais, three violet runic plates orbiting it, and a turning rune ring on the ground. It keeps the mote-per-shot and the dry state.
  - **New Life group** (support spells): chain heal, healing spray, heal-stone, healing shards, rescue spray, healing palm, healing hands, mending ward.
  - **Blink** replaces the waypoint, and the lens is now placed.
  - **Reworked:** fire-place-v3 (one sheet of fire), flame-arc-v2 (plasma and molten sparks), sh-armour-fire-v3 (four flush plates). The fireball flies straighter, the fire aura exudes from the body, and every Force cast now holds the staff forward.
  - **Weak spots:**
    - The turret is busy at 2–3× and could read as a crystal cluster.
    - The Life scenes are small at 2×.
    - Healing hands still shows the staff.
    - The armour's tint greys the hat.
  - **Questions:** Battlefield question `p5-turret`.
- **VFX gallery v4 feedback (2026-11-04):** "Looks really great."
  - **Keep:** the new turret ("much better"), every Life scene rated (chain heal, healing spray, heal-stone, healing shards), the fireball, ice shards, the fire aura and the placed lens.
  - **Blink:** the animation is too slow. It should be super snappy: near-instant out and in, no wind-up.
  - Not rated yet: fire-place-v3, flame-arc-v2, sh-armour-fire-v3, healing palm, healing hands, mending ward, `p5-turret`. Treated as accepted.
  - Earlier notes still open: the Life beam could use slightly lighter colours, and the Life circle's duration looks very short.
  - The visual exploration is now good enough to move on to the engine. Fix Blink's timing there, not in another gallery pass.
- **Goblin deaths trial, the user's notes (2026-11-04):**
  - **Keep:** base, cold, lightning.
  - **Fire:** maybe. Drop the big "combustion" flame; it looks stamped on and doesn't fit the body. The rest is liked.
  - **Frozen shatter:** maybe. The square ice cube doesn't work. This applies to the frozen status in the game too: ice should follow the body's shape.
  - **Arcane:** a cool idea, but not the upward spiral. The feel is D&D's disintegrate: "the magic that creates your body is torn apart". It should look different from fire's turning to dust.
  - **Earth:** right for a boulder, not for an earthquake. A death depends on the spell's shape as well as its element.
  - **Steam:** good, minus the vibration, especially of the remains.
  - **Water:** not needed; it's the base death (spells make their own puddles).
  - **Wet lightning:** not a unique effect; it's the lightning death plus what water already does with lightning. Drop it.
  - **Conclusion:** fewer, more distinct deaths. Base, fire, cold, frozen shatter, lightning, arcane, earth (missile), steam, and an earthquake variant.

## Where it stands (2026-11-05): adopted
The Pixel Battlefield look (high-res pixel art, the ~67° 3/4 camera, banded dusk light, outlined procedural wizards) is the game's look. Its actors, floor, lights, HUD and the Spell VFX gallery's effects and deaths are ported into `game/packages/client/src/art/` ([Engine stack](../decisions/README.md#2026-11-04-engine-stack-the-users-answers-on-the-engine-choice-page): milestone 1 uses "the Pixel Battlefield look"; [the look rule](../decisions/README.md#2026-11-04-the-look-rule-ice-shards-turret-draw-the-users-feedback-on-the-vfx-gallery-and-pixel-battlefield-pass-3)). New visuals are rated in the Spell VFX gallery (`tools/spell-vfx/`) and the Weapon Moveset Review.
- Open question "Which direction?" **Answered:** the Pixel Battlefield direction, rated over the Art Style Explorer rounds above.
