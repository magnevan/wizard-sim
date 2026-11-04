# Weapons and move sets

2026-11-04. Prompted by the user's play-test notes:

> "Looking into weapons. I don't actually know how to hit with them. I see shift+rmb with no runes causes a sort of swing animation, though it doesn't use the equipped weapon. I wonder if we can use all the cast animations for some sort of in-world effect / fighting effect since they're not used. Can you think about some move sets? It also looks like all bucklers look the same, we should go deep into figuring out many types of weapons and their effects. Also, maybe we should allow both a sigil and a shield weapon? Makes sense to allow both, though we could have some exceptions too, depending on the effect."

Related: `ideas/conjured-weapons.md` (developing), `explorations/2026-11-04-sigil-identity-and-buffs.md`, and the WEAPON table and `shield.conjure` cell in `tools/spell-atlas/rules-c.js`.

## 1. Diagnosis: why you can't tell how to hit

The play-test confusion comes from the code. These are the causes, most important first.

1. **Only one empty-queue gesture does anything.** In `cast.ts` the idle phase drops any buffered cast when the queue is empty, unless it's the Weapon cast (`queueLen === 0 && c !== CAST_ID.conjure`). So with no runes queued, RMB, Shift+RMB and Space do nothing in the sim. The only thing that swings is **Shift+LMB**. Shift+LMB and Shift+RMB are both Shift chords on neighbouring buttons, so it's easy to think you pressed the other one. If Shift+RMB really did swing, we need a replay to see it, because the sim can't produce that.
2. **The weapon swing and the staff swing look the same.** `weaponSwing` (`structures.ts`) calls the same `'swing'` shape as the staff. You get the same crescent smear and the same wizard pose (the Force pose, staff held level). Only the reach and the smear's colour differ. The conjured weapon is drawn as a static prop in the hand and never moves, and the weapon swing sends no `cast` event, so no title appears. The Stone maul's reach (`STRUCT.reach.earth = 1.6`) equals the staff's (`swingRange 1.6`), so the maul doesn't even reach further.
3. **A guard deletes your weapon, and a weapon deletes your guard.** Conjuring a guard sets `weapon = 0`, and conjuring a weapon sets `guard = 0`. If you conjured a Buckler after your sword, Shift+LMB now blocks and the sword is gone. That's probably what "doesn't use the equipped weapon" was.
4. **The Bulwark can't bash.** Its text says "hold to block, swing to bash". But `guardT` starts counting on the first held tick and masks the press, so any Shift+LMB with a guard is a block. A swing never happens.
5. **Guards ignore their elements.** The `'guard'` case stores only bulwark-or-buckler and its HP, never the payload. Shield + Fire and Shield + Cold make the same Buckler, it is drawn as the same gold ellipse, and the rules text "whatever it blocks or bashes is burned" is never implemented. Guards also block only missiles (`effects.ts`), not melee and not beams.
6. **Nothing shows durability.** A weapon has 30 uses (`STRUCT.weaponUses`), and the HUD shows neither the count nor when it's about to break.

Fixes 3 to 6 are bugs whatever we decide below. Fixes 1 and 2 are the design question.

## 2. Move sets: an empty queue means "use your hands"

**The idea:** while you hold a conjured weapon and your queue is empty, every cast gesture becomes a weapon move instead of nothing. The rule to learn is one sentence: **runes queued = magic, no runes = your hands.** Every pose the wizard already has gets a fighting meaning.

### The grammar (same for every weapon)

| Gesture (empty queue) | Move | What it is in the hands | Uses |
|---|---|---|---|
| Shift+LMB tap | **Strike** | Your basic swing. Three in rhythm make a combo, and the third hit is the weapon's finisher. | 1 |
| RMB tap (Force) | **Thrust** | Aimed and narrow. You step about one unit forward. It's the move for reach and lining up. | 1 |
| RMB hold (Force charge) | **Heavy** | Charge it like a Force charge and let go for a big blow. A full charge triggers the weapon's signature. | 2 |
| Shift+RMB tap (Area) | **Sweep** | A full circle around you, for crowds. It's also the move most likely to hit your partner. | 2 |
| Shift+RMB hold (Place) | **Send** | The weapon goes to the cursor, thrown or planted, using the existing placement preview. Shift+LMB calls it back. | 2 |
| Space (Self) | **Defend** | With a guard: hold to block, and tap as a shot lands to parry. With a weapon only: a short parry with the blade. | 0 |

Why this mapping: it reuses what each gesture already means. Force is aimed and forward, Area is around you, Place is over there, Self is on you, and Weapon is the hand. A player who knows the spell grammar already knows the weapon grammar (pillar 2: a language, not a menu). Every move goes through the existing wind-up and recovery, so the rhythm stays explicit and there are no hidden cooldowns (pillar 4).

**The staff gets the grammar too, weakly.** Without a conjured weapon, the same gestures do staff moves with no element and almost no damage. They're all shoves: a jab, a spin that clears space, a brace. This teaches the grammar from minute one (pillar 1). Conjuring a weapon then makes moves you already know stronger, rather than adding new ones.

### Per weapon: how each move reads

The Sigil weapon is picked by the leading other element, as in the rules today.

| Weapon (lead) | Strike / combo finisher | Thrust | Heavy (full charge) | Sweep | Send | Defend (no guard) |
|---|---|---|---|---|---|---|
| **Flame sword** (Fire) | Fast slashes; the 3rd throws a short arc of flame | Burning lunge | Overhead that leaves a line of fire on the floor | A ring of flame | Thrown: it spins out and comes back like a boomerang, setting fire along the path | Riposte that ignites |
| **Frost spear** (Cold) | Pokes; the 3rd pierces two bodies | Longest thrust in the game (about 3.5) | Impaling dash through one enemy; a frozen target shatters | Butt-spin that chills, short reach | Javelin: the target is pinned (rooted) and the ground frosts | **Brace:** set the spear, and a charging enemy impales itself |
| **Lightning whip** (Lightning) | Cracks; only the tip hits hard (a sweet spot) | Tip crack that stuns a caster | Lash that chains to up to 3 bodies | Whirl, wide and weak | Tether: a crackling line from you to the cursor for 2 s (a short-lived line glyph) | Crackle: whoever touches you is shocked |
| **Arcane hook** (Arcane) | Chain swings | **Yank** (today's hook): pulls the body to you | Long cast (6 units): drags one body all the way, ally or enemy | Chain swung in a ring that knocks back | **Grapple:** hook the cursor point and pull yourself there | Spin the chain to bat away one shot |
| **Stone maul** (Earth) | Slow; every hit knocks down, and the 3rd breaks a shieldbearer's guard (exposed) | Shoulder bash | Ground slam: a small quake ring that knocks down | A slow, huge spin with big knockback | Dropped: thrown in an arc like a heavy missile, it stays as a small rock until recalled | **Rooted:** no knockback while you hold it |
| **Tide glaive** (Water) | Wide arcs that shove | Push poke | A wave slash that travels along the floor (a small Shield + Force wave) | The best sweep in the game: a wide wash that soaks everything | Planted: a spring puddle spreads around it | Douse parry (it also puts you out) |
| **Healing hands** (Life) | Touch heals an ally while in contact | Palm push: a pulse of healing to the ally ahead | Channelled laying on of hands (hold it for strong single-target healing) | Heals allies you're touching only, never a ring | A mote of healing tossed to the ally at the cursor | Slow self-heal |

The **sculpting wand** (Sigil alone) has no move set. Its job is to make your spells spare allies, and giving it combat moves would muddy that.

### What it costs

- **Misfires at the boundary.** Today, an empty RMB press fails safely and does nothing. With move sets, mashing RMB before you queue runes lunges you into the goblins. The reverse also happens: you meant to lunge but had a stray Fire queued, and you cast a spray instead. This is the main risk, and the in-game slice has to measure it.
- **Readability for the partner.** Six moves times seven weapons means 42 animations a co-op partner has to read. Mitigation: each move gets its own pre-pose that is the same across weapons, so the partner learns six tells, not 42. The weapon itself is only the colour. The Sweep tell (weapon drawn back low, with a ring flashing on the floor) matters most, because it's the one that hits friends.
- **Finger complexity:** none added. That's the point: no new buttons. The cost is what each button means, which now depends on whether the queue is empty. The HUD should show a weapon icon on the cast buttons whenever the queue is empty.
- **Pillar 4 conflict, said plainly:** weapon moves need no runes and are one button each. If they're strong, melee becomes the "easy keys" strategy that pillar 4 warns against. Durability (uses) is what keeps them honest. A weapon should feel strong for about 15 to 30 seconds of fighting, then break.
- **Art cost.** Each weapon needs a real swing animation, not a static prop plus a smear. That's 6 moves × 7 weapons, though the poses can be shared.

## 3. Weapon types in depth

### The rule (form × payload, for both conjures)

**Both conjures use the same rule.** The lead element picks the shape and move set (Sigil), or the block behaviour (Shield). Extra runes of the lead element are **power**. Every other element is **payload**: a status on whatever the weapon hits or blocks, plus at most one shape change from the leading shape element (Water pushes, Cold shatters, Lightning chains, Arcane bursts). This is S2 as it already works for spells.

- **Power:** each extra lead rune adds +50 % uses and makes the weapon visibly bigger. Shield + Fire + Fire is a bigger, tougher targe. Sigil + Earth + Earth is a great maul.
- **Payload:** each payload element shows on the silhouette as a colour coat on the edge or rim, so the weapon type stays readable. A Flame sword + Lightning has a violet-edged blade, and every hit sparks to a neighbour (Chain). Two payloads is the practical readability ceiling (as `2026-11-03-full-tree.md` suspected). A third rides along as damage but isn't drawn.
- **Mixes:** Water with Fire in the same weapon gives **Scald**: hits scald, and the weapon leaves mist. Water with Cold gives **Freeze**: hits build towards a freeze. They're names on the coat, not new silhouettes: the *Scalding glaive*, the *Ice-edged spear*, the *Steaming sword*.

### Sigil weapons: silhouette, feel, signature

| Weapon | Silhouette | Feel | Signature property | Hands |
|---|---|---|---|---|
| Flame sword | Short blade, tongues of flame up the edge | Fast and aggressive | **Combo:** the 3rd hit of a chain throws flame | One |
| Frost spear | Long, thin, an ice shard at the tip | Patient spacing | **Reach,** plus setting up shatters | One |
| Lightning whip | A swaying, crackling lash | Flicky and precise | **Sweet spot** at the tip, plus chain | One |
| Arcane hook | A chain with a barbed hook | Control | **Displacement:** yank others, grapple yourself | One |
| Stone maul | A huge stone block on a haft | Slow and committed | **Weight:** knockdown and guard-break, can't be knocked back | **Two** |
| Tide glaive | A polearm with a crescent of water | Crowd herding | **Sweep and soak** (sets up Lightning and Cold partners) | **Two** |
| Healing hands | Both hands glowing green | Close, brave support | **Contact healing** | **Two** |

The reach should spread from 1.4 (hands) to 3.6 (whip), and the maul needs more reach than the staff (2.0). Today two of them are the same.

### Shield guards: each one blocks differently

Today it's Bulwark (Earth) or Buckler (everything else). Instead, the lead element picks the guard. For a guard, the signature lives in **what happens when it blocks**.

| Queue | Guard | Silhouette | Block behaviour (signature) | Bash (Shift+LMB with no weapon) |
|---|---|---|---|---|
| Shield | **Mirror buckler** | Small polished disc with a bright glint | A parry sends the shot back. It's today's Buckler and the purest one, matching Shield alone as the mirror. | Shove |
| + Earth | **Bulwark** | Tall stone slab | Wide arc, high HP, blocks melee too. You walk slowly while blocking. **Send:** plant it as free-standing cover and pick it back up. | Knockdown bash |
| + Fire | **Ember targe** | Round, spiked, a burning rim | **Thorns:** melee attackers who hit it catch fire. Blocked fire shots don't damage it. | Ignites |
| + Cold | **Rime kite** | Angular faceted ice, frost trailing from it | Blocking frosts the floor in front of you, so chargers slip and slow. Melee attackers are chilled. | Chills |
| + Lightning | **Spark ring** | A hollow, crackling ring (light, fragile) | **Counter-discharge:** a parry doesn't reflect. It sends a chain arc to the nearest enemies and stuns casters. Lowest HP of all. | Shock |
| + Water | **Tide shield** | A standing disc of water that ripples on every hit | **Absorb and shove:** blocked hits push the attacker back, and the shield soaks them. It barely loses HP to fire. | Soak and push |
| + Arcane | **Prism pane** | A hexagonal pane floating in front of you, not strapped on | **Beam bender:** the only guard that blocks beams, and while you hold it a blocked beam bends off to the side. | Burst |
| + Life | **Leaf aegis** | A broad, leaf-shaped green shield with a glow behind it | **Cover healing:** allies directly behind you heal slowly while you block. It's a support guard. | Shove only (Life would heal enemies, so it never heals through a bash) |
| Water + Fire | **Steam vent** (coat on Tide shield) | The water disc, steaming | Each block puffs out a mist that blocks sight | Scald |
| Water + Cold | **Ice shield** (coat) | The water disc, frozen solid | A perfect parry freezes the attacker | Freeze |

Earth with other elements follows the ward stacking rule: **Earth is the material and the others coat it.** A Bulwark + Fire is a burning tower shield with the Ember targe's thorns. Guards stay "stuff": paid once, and they last until they break.

## 4. Holding a weapon and a guard

The cancel rule (Shield + Sigil) already makes them two separate casts. Recommendation: **two slots, a weapon hand and a guard hand.**

- Conjuring a weapon replaces your weapon. Conjuring a guard replaces your guard. Neither touches the other (this fixes bug 3).
- **Inputs when holding both:** every attack move uses the weapon, and Space (Defend) uses the guard. **The block moves from holding Shift+LMB to holding Space,** so Shift+LMB is always offence and Space is always defence. The thumb is free while the left fingers sit on the elements and the mouse aims. A tap on Space as a shot lands is still the Mirror buckler's parry.
- **Any attack drops the guard** for its wind-up and recovery. Block or swing, never both. That keeps the dual-wield choice a rhythm, not a passive stat.
- **Guard only:** Shift+LMB bashes (this fixes bug 4).
- **Exceptions (two-handed).** The Stone maul, Tide glaive and Healing hands are two-handed: conjuring one replaces your guard, and conjuring a guard while you hold one replaces it. The Bulwark pairs only with one-handers (spear + Bulwark is the tank build). Healing hands being two-handed is on purpose: the healer can't protect themselves, so protecting them is the partner's job (pillar 3).
- **The sculpting wand counts as one-handed:** a wand with a Leaf aegis is a clean support build.
- **Costs:** the weapon binds one Sigil rune (one fewer turret or glyph), and the guard spends its Shield runes once. There's no extra tax for holding both. The real price is about 0.6 s of conjuring before a fight and two element pools spent, which suits pillar 7 (preparing in the lull pays off). Uses tick on the weapon. The guard has HP.
- **Dismissal:** double-tap Sigil on yourself removes the weapon (as today). Proposed: double-tapping Shield on yourself drops the guard, the same gesture for its own element. Today, double-tap Sigil clears the guard too.

**Cost of the move:** Space is also where Self casts live. With runes queued, Space casts the Self spell. Reaching for a block while you have Fire queued sets you on fire. That's the same "empty queue = hands" boundary as in section 2, and it hurts more here because blocking is panicky. It's the strongest argument for keeping the block on Shift+LMB, so it's open question 2.

## 5. Open questions (with my recommendation)

1. **Do empty-queue gestures become weapon moves (the grammar in section 2)?** *Recommend: yes, including weak shove-only staff moves without a weapon,* so the grammar is learned from minute one. If misfires in the slice are frequent, fall back to weapon-only (no staff moves).
2. **Where does the guard block live: hold Space (with Shift+LMB always offence) or hold Shift+LMB (today, so blocking shares the attack button)?** *Recommend: Space.* It's the only way to hold both without a tap-versus-hold delay on the attack button that would ruin the parry timing. We accept the Self-spell collision and show it in the HUD.
3. **Should the guard be picked by its lead element (eight distinct guards, each with its own block behaviour), replacing Bulwark-or-Buckler?** *Recommend: yes.* It's the same rule as Sigil weapons, and it fixes "all bucklers look the same" at the rules level, not just in the art.
4. **Two-handed exceptions: maul, glaive and Healing hands exclude a guard, and the Bulwark allows only one-handers?** *Recommend: yes, and a conflicting conjure simply replaces the other* (no "slung on your back" state; simple beats clever here).
5. **What is a weapon's resource: uses only (Strike and Thrust 1, Heavy, Sweep and Send 2), with no rune cost per move?** *Recommend: yes, about 30 uses,* shown as a pip bar on the weapon in the world and in the HUD, so the break is never a surprise.

## 6. What to build to test it

**A. Weapon Moveset gallery** (a rateable visual page in the Spell VFX style, `tools/weapon-moves/`). It answers questions 1, 3 and 4.
- Rows: the 7 Sigil weapons. Columns: the 6 moves. Each cell is a looping pixel vignette against a goblin dummy, with like / meh / no and a note, stored in the db (`ratings`, one doc per `weapon/move`).
- A second grid: the 8 guards plus the two mixes, each with its block, parry and bash loop.
- A row "both hands": spear + Bulwark, sword + Ember targe, wand + Leaf aegis, and a maul conjured over a buckler (showing the replacement).
- Answer boxes for the five questions, next to the text (`answers`).
- Start with 3 weapons × 6 moves (sword, maul, whip: the most different feels) plus all the guards. Fill in the rest after the first ratings.

**B. In-game slice** (in `game/`). It answers questions 1, 2 and 5 in the hands.
- First fix bugs 3 to 6: two slots, the bash, guards storing their payload (Ember thorns and the Mirror parry at least), the uses bar, and a swing that animates the weapon itself and sends a titled event.
- Then the full move set for **one weapon, the Flame sword**, plus Space-to-block with a Mirror buckler, in a room of goblins and a brute.
- Measure misfires from replays: an empty-queue move within 0.3 s of an element press, or a Self spell within 0.3 s of an incoming shot while a guard is held. If either happens more than a couple of times a minute, the "empty queue = hands" boundary needs a rethink before we build more weapons.
