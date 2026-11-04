# Resources and the battlefield: two ways past Magicka

2026-11-03. The user's own thinking about ways to set the game apart from Magicka *other than* adding more cast options. Claude's first analysis follows, and open questions are waiting on the user.

## The user's two angles (as given)

**Resource oriented**
- Your playstyle changes with how much resource you have: conjured weapons when low, massive beams and AoE when high.
- Tap into natural resources. Some elements replenish faster in some areas.
- Balancing element use is a skill the *player* learns, to get the most power out.
- Replenishing an ally's resource becomes a way for support to help.
- Leaning into a resource is a specialization: a frost mage regenerates frost faster at the expense of other elements.
- Your understanding of the spell system stays with you, but you progress through deeper pools and faster regeneration. Deeper pools could unlock different magic (two Fire opens Magicks you never see with one). Con: breaks "ability stays with the player". Pro: a growing set of options is less overwhelming, and exploring the frontier is fun.

**Heavier emphasis on altering the battlefield**
- Magicka's constructs were short-lived, most encounters push forward, and you could only place things in a circle, an arc or a line in front of you.
- Hold a position or retreat instead of always advancing.
- More structured environments: choke points, high ground.
- More flexible building: draw it with a line. Maybe a grid?
- More structures: walls, turrets, mines.
- Balance (you can't just build 500 turrets):
  - Upkeep comes from the caster. A fire turret uses your limited fire each time it fires; shields lose power when you run dry; a frost field uses frost while someone stands in it.
  - Maybe some can be powered by natural sources.
  - Runes and traps have a maximum count.
  - Only permanent things work this way, not everything with a duration.

Related feedback from the Spell Atlas db the same morning: Shield/Area "should be continuous"; Shield/Place "should be either a line you draw, or a line tangent to you".

## Claude's read

### The two angles are one idea
Each angle has a gap that the other one fills:
- A resource needs something to be spent on besides casting. Structures give it that.
- Structures need a cap. A shared resource is that cap.
- Natural sources tie both to the map.

Put together: **elements are matter, not mana.** They flow from the world into you, from you into spells and structures, and back into the world. In Magicka elements are free and endless, so the skill is reflex and recall. Here, part of the skill becomes *economy*: what to spend, what to tie up in structures, and where to stand to refill. That is a real difference in what the game is about, not just more of the same.

The strongest version closes the loop. **Your own spells create sources:**
- a puddle you sprayed is a water source
- burning grass is a fire source
- a frozen pool is a cold source

The battlefield you shape then becomes the battlefield that feeds you. This needs a guard against infinite loops: sources you create should decay, and give back less than they cost.

### How it fits the pillars
| Pillar | Fit |
|---|---|
| 1 Mastery in the hands | Good: balancing elements is player skill, and so is specialization (lean into a playstyle). **Conflict:** pool depth unlocking spells moves power from the hands to the save file. See Q6. |
| 2 Spells are a language | Neutral to good. Cost gives the cheap single-element spells (the thin "spray" rows of proposal C) a reason to exist: they are your low-resource vocabulary. |
| 3 Co-op dance, support | Good if refilling is *skilled* (aimed, timed, positioned), bad if it is a passive "mana battery" role. |
| 4 Room to think | Strong fit. The vision already says "a resource may encourage mindful casting", and cost replaces hidden cooldowns as the honest limit. |
| 6 Reproducible playstyle | **Watch:** natural sources must be systemic (fire wherever things burn), not a per-level gimmick. |
| 7 Preparing pays off | Strong fit. Hold phases with visible approaches are exactly where preparation matters. Structures are the payoff. |
| Platform: no drawing shapes | **Soft conflict:** "draw a wall with a line" is mouse drawing. A two-point drag (start, end) is not gesture recognition, so it's probably fine, but the pillar wording should be clarified. See Q5. |

### What it costs
- **HUD and readability:** up to eight element pools per player, times four players, plus which structures are draining whom. It has to read on the character (orbs, a ring), not in a corner bar.
- **Drain at the wrong moment:** on-use upkeep (the turret fires and you lose fire) can empty you exactly when the fight peaks. That's interesting once and frustrating every time after.
- **Turtling:** if holding ground is strong, it becomes dominant. Enemies need answers: sappers, fliers, artillery, enemies that eat sources.
- **Scope:** a building layer (placement rules, pathing around walls, enemy AI that reacts to structures) is a large system, not a spell.
- **Specialization in co-op:** a frost mage is weaker alone and stronger in a team. That's good for co-op, but a solo or mismatched party gets worse.

## Open questions for the user
See the chat of 2026-11-03. Answers will be recorded here as an addendum.

## Ideas filed
- `ideas/element-economy.md` (raw)
- `ideas/battlefield-building.md` (raw)
- `ideas/casting-rhythm.md` now points to element-economy as the leading resource candidate.

## Addendum: the user's answers (same day)

**Corrections to Claude's read**
- **Not one idea.** Mana as pacing is fully separable from holding ground. They are two angles that can coexist, not one system.
- **Pace is the main point of the resource.** Free elements make optimal Magicka play spam very fast. Runes slow it down, and that lowers the economy-skill burden too.
- **Pool depth gating magic is an accepted trade-off** against pillar 1. It gives a friendlier progression: a smaller frontier to explore at first.
- **"Close the loop" rejected.** Setting the ground on fire and standing in it isn't interesting. Natural sources are meant as **per-level twists**: a level where you tap more power than normal, or play a suppressed version. The earlier objection was to *novel* level mechanics ("knock over pillars", "use this laser contraption"), not to tweaks of your existing playstyle.
- **HUD:** we don't share a screen, so only your own pools need a good UI. Others' pools are shown subtly, if at all (a pixel of that colour orbiting them).
- **Drain:** something else draining your pool can't be fully avoided, but cap how deep it can drain you, so you always keep a reserve.
- **Turtling and building scope:** the game has to be built to fit the mechanics.

**Answers**
1. **Runes** (the user's word for one unit of an element) work as charges and max charges. They're mostly discrete, with occasional exceptions (a half-spent rune regenerates faster). A wildcard rune is an option for later.
2. **Cost = the elements you queue.** Each form then has a natural duration: a beam channels for ~5 s, and a weapon has durability. Past that it can continue with a **recast as regen debt**. Example: rune regen is 0.3/s; after the free 5 s the beam costs −0.2/s (one rune per 5 s). If net regen is negative, the fractional value runs down and a whole rune disappears at 0. It's a float underneath and discrete in the UI.
3. **Refill:** mostly passive.
4. **Upkeep:** probably a mix. A turret fires using your runes. A rock wall could *reserve* runes and release them as it's destroyed. A shield could *consume* as it absorbs. One modality would be simpler; undecided.
5. **Building input:** undecided. Freeform, or a hidden internal grid.
6. **Encounters:** a mix of pushing and defending, to be tested. Retreat means falling back to prepared lines.
7. **Support refill skill:** maybe just knowing when to use it.
8. **Specialization:** you can generally still cast everything. A frost mage regenerates frost faster and has a deeper frost pool, plus maybe ways to do frost more intensely automatically, so there's less spam clicking. An end-game lock-out is possible.

## Finding: pool depth barely gates proposal C
`tools/spell-atlas/depth-c.js` counts which spells are reachable if every element's pool holds at most *d* runes (steam spends a water and a fire rune, ice a water and a cold):

| Depth | Cells | Distinct spells (cell + payload set) |
|---|---|---|
| 1 | 52 of 52 | 606 of 976 |
| 2 | 52 | 966 |
| 3+ | 52 | 976 |

Under C, repeating an element adds *power*, not a new spell. A depth-1 player can already reach every form and cast, and depth 2 reaches 99% of spells. Depth 2 mostly unlocks steam and ice paired with another water spell.
So "two fire opens magic you didn't have with one" needs content that C doesn't have yet: Magicks keyed to depth, or intensity tiers where 3+ of an element changes the form. Raised with the user.

## Addendum 2: structures in the Atlas, and the Weapon column (same day)
**Structures** (the user said "put it into the Atlas"), now in `rules-c.js`:
- **Shield + Force** is a *quick wall*: short, tangent to you, across your aim.
- **Shield + Area** is a *continuous* closed ring.
- **Shield + Place** is a **drawn wall**: hold at A, drag, let go at B. Letting go without dragging gives the dome or cage.
- **Seal + Force** is a **turret**: the Force spell planted at the cursor, casting itself at the nearest enemy, paid as upkeep. On Release it fires one last big shot. A sealed Shield Force is a **sentinel** pylon that throws the wall up in front of the first enemy that comes close.
- **Seal + Place** is a glyph. Dragging it makes a **line glyph**, the same drag as walls; this replaces the old Seal + Force line glyph.
- **Every spell now has a cost kind:**
  - *stuff*: Earth/Ice structures, conjured weapons and sealed vessels other than turrets. Paid once and capped.
  - *energy*: pure or elemental Shield structures, and turrets. Upkeep, with a reserve floor.
  - *sustain*: beams. Free for about 5 s, then regen debt.
  - *one-off*: everything else.
- The Atlas has a new "Structures: what builds what" section and a question, `c-structures`.

**The user's mid-turn note:**
- Drop the tap-Weapon column. It was really a "line" style, and the real weapon is the conjured one.
- Lines could come from the *elements*, the way Arcane or Life makes a beam in Magicka.

**Done:**
- The tap cast is removed. "Conjure" is renamed **Weapon** (Shift+LMB). Its id stays `conjure`, so ratings keep their doc ids.
- The grid is now 42 cells and 813 distinct spells, with **0 of 7,425 inert additions**.
- Tidal Wave and Fault Line wait for a home and are listed with the dropped spells. They are not cut.
- New open question `c-lines`.

**The removed line cells, kept for when lines get a home:**
- Shield bash: A shove that pushes everything in front of you back.
- Fault line: A crack races forward, throws enemies aside and leaves a low ridge.
- Spike line: A row of spikes runs along the ground ahead.
- Arcane line: Explosions pop one after another along the ground ahead.
- Healing line: A line of light runs ahead and heals all it passes.
- Ground chain: Lightning skips along the ground ahead.
- Tidal wave: A wide wave rolls forward, shoving and soaking everything.
- Fire line: A line of flame runs ahead and keeps burning.
- Frost line: A line of frost runs ahead and leaves a slippery track.
- Scald wave: A rolling front of steam.
