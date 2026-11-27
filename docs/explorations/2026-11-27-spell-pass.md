# Spell pass: the Shift casts, Haste, world spells and Sigil (2026-11-26 to 27)

A brainstorm in conversation between the user and Claude. The user brought two changes they felt sure of, a new family to explore (world spells, after Magicka's weather and time Magicks) and a pass over Sigil. The decisions are logged in [Spell pass](../decisions/README.md#2026-11-27-spell-pass-the-shift-casts-swap-haste-replaces-the-double-world-spells-on-shiftspace-glyphs-get-charges); world spells continue in [world-spells](../ideas/world-spells.md). None of it is built yet.

## The Shift casts swap

**Decided.** Shift+LMB becomes Place and Shift+RMB becomes the burst (and the conjured weapon or guard). Right click is the "fast", out-of-my-hands side (Force, burst, weapons); left click the deliberate "put this in the world" side. It also lets you burst while moving.

- **A Place drag stays a Place until the mouse button is released,** even if Shift is let go part-way (the user). Otherwise a wall drawn on the move button turns into a walk.
- **The ring exception mirrors, it doesn't vanish.** The elemental ring becomes Shift+RMB released on yourself; Shield and Sigil's ring, orbitals and motes become Shift+LMB on yourself. The rule to teach: *what stays around you is a Place on yourself.*
- **Cost:** muscle memory, the tutorial's beats, the help panel rows, the gamepad map and the comment in `game/packages/client/src/input.ts`.

## Haste replaces the Double; a Lightning aura

**Decided.** The Double is cut (it never fitted the other buffs; the user wasn't a fan since the 2026-11-11 audit, see [minions-and-clones](../ideas/minions-and-clones.md)). **Pure Sigil on yourself is Haste**, and it lands on the ally under the cursor like the other auras, a support verb for free. **Sigil + Lightning becomes a Lightning aura** like the others: Claude suggested an arc from you to the nearest enemy about every half second.

**Damaging auras hit friends** (the user), with a smaller radius than now so you can keep a partner clear. Claude adds that the sculpting wand should spare allies from auras too, so "friendly fire is on, the wand opts you out" stays true everywhere (to confirm).

## World spells

The user wants Magicka's world-wide effects (rain, blizzard, meteor shower, thunderstorm, time warp) without rebuilding Magicka's Magicks. In Magicka those served two jobs: a home for any effect outside the spell pattern, and a source of whacky misfires and odd key presses ("learn to spell"). Here the goal is RPG-paced rather than arcade, and the spell language itself should hold more spells. World spells contrast with most spells, which are local.

**Decided so far:**
- **Cast by holding Shift+Space.** Shift already means "the bigger version of this button", so this is "Self, but the whole world". A long hold on Space was rejected: every Self cast would have to wait for release to tell a heal from a ritual, slowing your most urgent cast. The held wind-up draws a big circle on the floor and leaves you open, so partners covering the ritual is the co-op moment and the main balance lever, beside the effect applying to everyone.
- **Paid by binding its runes** for as long as it lasts, the way Sigil devices bind a rune. The beam's upkeep drain doesn't suit it (world spells aren't channelled). Binding limits itself: a long storm means fighting with a smaller pool. More runes, a longer or stronger storm.
- **One weather at a time;** any new world spell replaces the old, whoever cast it, and the old caster's runes come back. Opposites cancelling was dropped: you don't need an opposite to end one, any cast does (the user).
- **Cancel** by double-tapping Shift+Space with nothing queued, as double-tapping Shield or Sigil dismisses a creation; the runes come back (Claude's proposal, the user asked how; to confirm).
- **Time warp is pure Sigil:** time slows for everything, casting included. It's the world's mirror of Haste (Sigil on yourself speeds you, Sigil on the world slows everything), and it suits pillar 4 almost literally. Sigil with elements is the slowing plus whatever the other runes add (the user).
- **Shield is Nullify** (the user's suggestion): pure Shield ends the weather, blocks new weather for a while and fades lingering fields. Claude's addition: Shield with elements makes everyone in the scene, enemies too, resist those elements: a world ward, matching Shield's meaning elsewhere.

**How the elements make weather.** Claude first proposed that each element adds one layer and mixes stack, so nobody has to write a table of named weathers. The user agreed for most elements but pointed out that combos matter: **Fire + Earth should be meteors**, not rock plus heat. So it isn't purely stacked. The layers, the fusions and the two uncertain elements (Fire and Arcane) are written out as options in [world-spells](../ideas/world-spells.md).

**Parked for later:** nullify as its own effect beyond Shield's world cast, summons, invisibility.

## The Sigil pass

The user finds Sigil rough: pure Sigil Force (the stored spell) and Sigil + elements Force (the turret) are unrelated, and the Lens sat oddly on Place.

**Decided:**
- **The Lens moves to pure Sigil Force.** Force with Sigil now always plants a device at the cursor that works with spells: with elements a turret, without them a lens.
- **The stored spell is cut** for now. It may come back later through another mechanism, maybe something found in the campaign (the user); [spell-preparation](../ideas/spell-preparation.md) first framed it as "a power gained during the game". Pillar 7 still names stored spells; the user isn't worried, since it can return.
- **Glyphs get charges,** scaling with their payload runes (a cast holds only one Sigil rune, so Sigil count was never an option), with a re-arm delay so one enemy standing on a glyph doesn't spend every charge in one step. Friendly fire makes a many-charge glyph a lasting hazard for your own side too.
- **Glyph and orbitals stay as a pair** on Place, away from you and on you: orbitals are a trap worn on yourself (the user).
- **The turret stays on Force,** since turrets cast a Force spell. The sculpting wand stays.

**Proposed, the user leaning yes:**
- **Pure Sigil placed away from you is a snare glyph:** it holds whoever steps on it for about 2 to 3 s and does nothing else. Sigil's theme is binding, so an element-free trap that catches fits. Friendly fire applies.
- **Every elemental glyph snares briefly** (about 0.5 s) before its payload goes off. The user worries glyphs are underpowered beside turrets and motes; Claude's guess is that the enemy walks off a glyph before it lands. A short hold makes a glyph the one device that's sure to hit, a job of its own rather than a raw boost.

The resulting Sigil map: Force turret / lens; Place orbitals or motes on you, glyph or snare away; Self aura / Haste; Weapon weapons / sculpting wand. Each gesture means one thing with or without elements.

## Rejected

- **An empty glyph that stores the next spell cast into it** (Claude's way to keep the stored spell): redundant, since you could cast the glyph with that element to begin with, and its extra flexibility is a problem of its own (the user).
- **Opposite weathers cancel:** see above.
- **Holding Space longer for a world spell:** delays every Self cast.
- **Paying world spells by drain:** they aren't channels.
- **Scaling glyph charges by Sigil runes:** a cast can't hold more than one.
