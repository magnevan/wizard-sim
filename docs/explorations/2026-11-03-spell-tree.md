# 2026-11-03: Building the spell tree

Steps 2 and 3 of the bottom-up method: take the leaves the user liked, find the tree that generates them, then explore the leaves that tree implies. Written by Claude while the user was away. **Everything here is a proposal for the user to react to.**

## 1. Magicka's tree, as a baseline

Magicka's input has two axes: **elements** (up to 5, queued from 8 keys) and **cast mode** (force, area, self, weapon). The **form** is derived from the elements through a priority rule, roughly:

| If the queue contains… | Force cast gives | *(unverified details)* |
|---|---|---|
| Shield | a wall or barrier form (rock walls, mines, elemental barriers) | |
| Earth / Ice | a projectile (charged rock, ice shards) | |
| Arcane / Life | a beam | |
| Lightning | a chain arc | |
| Only Water / Fire / Cold / Steam | a spray | |

Area is a ring around you, self applies to you (heal, resistance wards), and weapon imbues your swing in a line in front of you. Magicks sit outside the tree: named spells unlocked by tomes and cast through specific element sequences. More elements means more power.

**Why it works:** one small alphabet, and knowledge (which elements make which shape) becomes skill. **Why it runs out:** every spell is one of about 6 forms × 4 modes, cast *now*, *from you*.

## 2. What the round 2 favorites ask of the tree

Sorting the keeps and maybes by what they *add* to Magicka gives four missing capabilities, plus the user's two meta-rules ("a spell does one readable thing"; "variants, not new spells").

| Missing capability | Leaves that need it |
|---|---|
| **Cast somewhere else than from yourself** (at the cursor, or on an ally) | Geyser ★, Ward Toss ★, Yank ★, Prism ?, Stay of Death ?, Conduit-as-structure ? |
| **Cast now, take effect later** (a latent spell plus a trigger) | Stored Spell ★, Trap Rune ★, Primed Orbitals ★, Shatter Bulwark ★, Contingency ?, Spell Quiver ?, Tripwire ?, Payload Effigy ?, Detonation Lattice ? |
| **Ground-travelling fronts** (lines and waves) | Tidal Wave ★, Fault Line ? |
| **Ally-aware effects** (spare or help friends on purpose) | Attuned Blast ★, Sustained Circle ★, Ward Toss ★ |

Ricochet ★, Surface Surge ★ and Curve Bolt ? need *rules about the world and aiming*, not new inputs. Bulwark ★ and Clothesline ? point at the weapon slot and at Magicks.

The second row is the striking one: **nine** of the liked spells are the same idea, a spell put *somewhere* that goes off *later*. That's the user's "it's basically just rune" and "prepared spell plus auto-trigger" notes, made general.

## 3. Proposal A: "Magicka plus two verbs" (recommended)

Keep Magicka's input exactly, including the implicit element → form rule. Add:

1. **Point cast:** a fifth cast mode, **at the cursor** (within a range). If the cursor is on an ally, the spell targets *that ally*. This covers placed areas, placed shields, single-target heals and pulls.
2. **Seal / Release:** two keys. **Seal** stores the composed spell in a *vessel* instead of firing it, and the cast mode picks the vessel. **Release** sets off all your latent spells at once.

That's three new bindings in total (Point, Seal, Release). Nothing else changes.

### 3a. Cast modes

| Mode | Origin | Notes |
|---|---|---|
| Force | from you toward the aim | as in Magicka |
| Area | ring around you | as in Magicka; *held* = sustained (Sustained Circle) |
| Self | on you | as in Magicka; *held* = sustained enchant |
| Weapon | your swing, and a **ground line forward** | lines and waves live here (Tidal Wave, Fault Line); conjured weapons too |
| **Point** | at the cursor; **on an ally** if hovering one | new |

### 3b. Seal vessels and triggers

| Seal + mode | Vessel | Default trigger | Leaves it generates |
|---|---|---|---|
| Seal + Self | your staff (1 slot, more through progression) | Release | **Stored Spell** |
| Seal + Point | a rune on the ground at the cursor | enemy steps on it, or Release | **Trap Rune**, **Detonation Lattice** (seal several, release all) |
| Seal + Force | a rune drawn as a line from you toward the aim | enemy crosses it, or Release | **Tripwire** ("a variation of how you write it in the world") |
| Seal + Area | the spell's projectiles orbit you | Release flings them at the cursor | **Primed Orbitals**; seal the same spell again and again = **Spell Quiver** |
| Seal + Weapon | your next swing | the hit | a loaded blow (new leaf) |

**Release also bursts your own structures** (walls, wards): a rock wall becomes shrapnel. That gives **Shatter Bulwark** for free.

**Elegant auto-triggers** (the user asked for this on Contingency): let the *elements* imply the trigger, so there's no extra input:
- A stored spell containing **Shield** fires itself the moment you're hit → **Contingency**.
- A rune containing **Life + Shield** stands up as a little guardian that enemies want to attack and fires when broken → **Payload Effigy**.

Both are options; each costs one rule to learn.

### 3c. Implicit forms per mode (Force stays as in Magicka)

| Elements (dominant) | Point | Area | Weapon (ground line) |
|---|---|---|---|
| Earth | **Geyser**: eruption under the cursor | earthquake ring | **Fault Line**: crack forward, leaves a ridge |
| Water | flood a patch (makes a surface) | wet ring, push | **Tidal Wave**: a wide moving wave |
| Fire | fire bloom | fire ring | fire line |
| Cold | frost patch (freezes surfaces) | frost ring | frost line |
| Lightning | strike from above | discharge ring | chain along the ground |
| Arcane | **Yank** on a body (ally *or* enemy), blast on the ground | arcane nova | arcane line |
| Life | heal **one** ally (no splash) | heal ring; *held* = **Sustained Circle** | healing line (heal allies ahead, not everyone) |
| Shield | **Ward Toss**: a bubble on the ally or spot | ward ring | **Bulwark**: conjure a tower shield (weapon variant) |
| Shield + Arcane | **Prism / Lens**: a structure that amplifies beams through it | | |
| Shield + Life | **Stay of Death** lantern | | |

### 3d. Ally-aware rule
**Life in an offensive spell makes it spare allies** (it heals them slightly instead) at the cost of a slot of power → **Attuned Blast**. It's implicit, costs one gem, and doesn't work with Arcane because Life and Arcane cancel. That's a nice trade-off: Arcane is the one element you can't make safe.

### 3e. World and aim rules (no new inputs)
- **Ricochet:** ice shards bounce off walls, and any projectile bounces off **your own shield walls**. That's the user's "construct some sort of curve or wall yourself".
- **Surface Surge:** elements spread through connected surfaces: lightning through water, fire through grass and oil, cold freezes the whole puddle. This is a world rule, as it was in Magicka.
- **Aiming variations** (the user wants more of these): hold to charge (Magicka rock); a fully charged rock *pierces and carries* (Pinning Javelin); dragging the cursor while a projectile flies curves it (Curve Bolt). Through a Lens, cursor distance picks split or focus (the user's Prism idea).

### 3f. Magicks
A separate tier: named, unlocked, sequence-cast. That's the home for spells too big or too special for the tree:
- **Resurrect ritual**: a *small* Grand Ritual. You channel while allies protect you, which matches the user's "maybe a one-off for a resurrect spell" and the harsher death rules.
- **Co-op Magicks**: need two casters at once. Clothesline (each player anchors one end).
- **Clone, Ethereal Shift, Haste, Time Warp, Teleport**.

### 3g. How every liked leaf is generated under A

| Leaf | How |
|---|---|
| Ricochet ★ | world rule (ice shards bounce; shield walls reflect) |
| Geyser ★ | Point + Earth (+Arcane) |
| Tidal Wave ★ | Weapon + Water |
| Trap Rune ★ | Seal + Point |
| Primed Orbitals ★ | Seal + Area (Earth), then Release |
| Attuned Blast ★ | any burst + Life |
| Stored Spell ★ | Seal + Self, then Release |
| Ward Toss ★ | Point + Shield (+ element for an elemental ward) |
| Yank ★ | Point + Arcane on a body |
| Sustained Circle ★ | Area + Life, held |
| Surface Surge ★ | world rule |
| Shatter Bulwark ★ | Shield + Earth wall, then Release |
| Bulwark ★ | Weapon + Shield |
| Prism ? | Point + Shield + Arcane |
| Stay of Death ? | Point + Shield + Life |
| Fault Line ? | Weapon + Earth |
| Contingency ? | Seal + Self with Shield (auto-trigger option) |
| Spell Quiver ? | repeated Seal + Area |
| Tripwire ? | Seal + Force |
| Detonation Lattice ? | several Seal + Point, one Release |
| Payload Effigy ? | rune with Life + Shield (option) |
| Pinning Javelin ? | aim rule: a full-charge rock |
| Curve Bolt ? | aim rule: drag while in flight |
| Grand Ritual ? | Magick: Resurrect ritual |
| Clothesline ? | co-op Magick |
| Clone ?, Ethereal ? | Magicks |
| Bellows Gust ? | needs Wind (see open questions) |
| Conduit ? | as a structure, it *is* the Lens |

**28 of 29 liked leaves come out of three new bindings plus a few rules.** Only Bellows Gust needs something new.

## 4. Leaves the tree implies that nobody proposed yet (step 3)

These fall out of proposal A for free, and they're worth rating next:
- **Puddle rune** (Seal + Point + Water): floods the area when triggered. Set up a surface, then surge it with lightning. A two-step combo you prepare in the calm.
- **Healing orbitals** (Seal + Area + Life): Release flings heals to the nearest allies. A support version of the quiver.
- **Shield plates** (Seal + Area + Shield): wards circle you and block shots; Release throws a ward to each nearby ally.
- **Frost patch bridge** (Point + Cold on water): freeze a pond into walkable ice. Traversal and puzzles.
- **Healing line** (Weapon + Life): heal the allies in front of you without healing the enemies around them, which addresses a Magicka complaint.
- **Loaded blow** (Seal + Weapon): your next swing carries a sealed spell (melee builds).
- **Ice shrapnel** (ice wall, then Release): shatter into shards that bounce around.
- **Lens + spray** = a focused lance; **Lens + projectile** = a split shot.
- **Alpha strike**: Release with an orbital ring, two runes and a stored spell all at once. The big payoff for preparing (pillar 7).
- **Yank an enemy** (Point + Arcane on an enemy): pull a caster out from behind its brutes.

## 5. Proposal B: "form-first" (for comparison)

Make queue **order** matter: the *first* gem picks the form and the rest are the payload (e.g. Shield first = wall; Earth first = rock; Arcane first = beam). The tree becomes explicit and teachable ("first is shape"), and a second-position gem could act as a modifier (Shield second = bounce, Life second = attuned).

- **For:** very learnable, with a large and regular space.
- **Against:** typing order now matters under pressure, it breaks Magicka habits, and the "knowledge as skill" layer turns into a rule you read rather than lore you discover.
- **Verdict:** keep it in mind if A's implicit rules get too arbitrary. A can adopt B's "Life = attuned" idea without order rules, as above.

## 6. Open questions for the user
1. **Point cast binding:** mouse button 4, Ctrl+Right, or a key? On gamepad it could be a trigger with a reticle.
2. **Seal / Release:** two keys, or one key (tap = seal, hold = release)?
3. **Auto-triggers through elements** (Shield → "when hit", Life+Shield → effigy): elegant, or too hidden?
4. **Wind as a ninth element** (for Bellows Gust and pushing clouds and surfaces)? It would need an opposite.
5. **"Life makes it ally-safe":** good rule, or should ally safety be a separate verb?
6. How many vessel slots to start with: 1 staff slot, 3 runes, 5 orbitals?

## 7. Next step
The skeleton prototype (`prototypes/01-skeleton/`) gets a first resolver implementing a subset of proposal A: the four Magicka modes, Point cast, and Seal/Release with staff and rune vessels. That way the user can *feel* it rather than read about it.
