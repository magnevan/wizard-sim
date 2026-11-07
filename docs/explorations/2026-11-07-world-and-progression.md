# World, story spine and campaign progression (2026-11-07)

The user's brief, Claude's feedback as a design partner, the user's first round of answers (same day), and what's still open. The lore stays the user's: the story spines here are options to react to. The page for answering is the **World and Progression** artifact (`tools/world-progression/`, db `answers`). The element essences now live in `../world/elements.md`.

## The brief

- **Tone:** classic fantasy, not Magicka's goofy world.
- **Genre:** more RPG than arcade. Gradual character progression (runes and maybe more), and a longer game to carry it.
- **Characters:** not Mass Effect, Baldur's Gate 3 or Dragon Age depth. *Clarified:* "the world doesn't have to be barren. You can have lots of characters you interact with, but in more simple ways."
- **Power growth you can feel,** from mastery and from more runes, faster regen, unlocked runes.
- **The world:** magic as fields and veins that shaped civilization like rivers (smiths at fire, farms on water and life, mines on earth, lightning powering rudimentary electricity).
- **Gameplay from the world:** zones where elements run strong or weak (maybe through regen), native creatures, devices that tap fields.
- **Progression:** a small kit, grown through an intro; low regen early. Early combat is single-element spells and melee; late is turrets, persistent self-effects, five-element casts.
- **Structure:** Magicka's linear worlds work; maybe defence and puzzles too, without over-fitting to Magicka.
- **Single player and co-op:** "the game should ideally be possible to play both single player and with a group, so ideally the story works reasonable for both."

## Settled in round 1

- **Pillars 1, 5 and 6 reworded** (in `../vision.md`; decision "Pillars 1, 5 and 6 reworded; the world is fields"). Pillar 5 is classic fantasy told through places with an RPG-paced campaign; pillar 1 adds that growth widens what your hands can do (the user: "a veteran player has a much bigger advantage in this game than in most RPGs"); pillar 6 allows devices whose input is your spells and rules out minigames.
- **The world is fields;** Life a living field, Arcane the deep field; Shield and Sigil innate. The user on the innate pair: Sigil holds a rune because shaping takes attention, "and shield also has a similar thing where you need to concentrate to maintain, it's just more continuous and less discrete."
- **Zones bend regen.**
- **Native creatures have only a splash of resistance** to their region's element. The user: "It would be a little stupid from a gameplay perspective if we give you a bunch of extra fire power, but everyone is resistant. However it just feels... realistic". Instead, "everyone is attacking more with fire in that region".
- **The academy sits on an Arcane vein,** which "could utilize to help bring about and develop a wizard's natural abilities".
- **Co-op with mismatched progress gets some catch-up mechanic,** designed when we get there.
- **Progression's shape is broadly right** but needs play-testing.
- **Hubs are a reusable set piece; encounters are a library,** not a fixed per-region recipe ("a defence and a hunt sound more like prototypes for an encounter or a quest").

## Zones: how hard they push

The user wants zones to push you into other parts of your kit ("maybe you need to spend some new time experimenting") without making you reinvent yourself, and floated "a sliding scale as you go deeper into a region".

**Proposal: zones only redistribute regen, and deepen in bands.**
- **Total regen R stays the same.** A zone changes the *weights* in the shared budget's split: the local element gets a bigger share, its opposite a smaller one. You're never weaker in total, only steered. The α floor (a quarter of R always reaches every pool that isn't full) still holds, so nothing stops refilling.
- **Three bands per region,** felt as you travel in:

| Band | Local element's share | Its opposite | What it's for |
|---|---|---|---|
| The edge (first chapters) | ×1.5 | normal | A hint. You notice Fire pips filling fast. |
| The heartland | ×2 | ×0.6 | A push. Your usual style still works but costs more. |
| The well (set pieces, the boss) | ×3 | ×0.3 | The region's exam. Briefly, you play the region's way. |

- **The numbers are placeholders** for a play-test; the Rune Economy simulator can model them.
- **The loop that makes it feel fair:** the region's enemies attack mostly with its element, and every Shield or Weapon spell carrying an element lends resistance to it (guards, wards, heals). So the abundant local element is also your cheapest defence against the local threat. A fire region gives you fire to burn with and fire to ward against fire. The push is into *defending* with the local element as much as attacking with it.
- **Creatures:** a splash of resistance only (r ≈ 0.25 on some types, none on most). The region's character comes from what they *do* (fire attacks, burning ground, creatures that flee water), not from what they shrug off.
- **Readable without text:** the HUD's pips already glow by their share, so a zone shows itself in the rune bar. The ground and light can show the band too (embers in the air, frost on the edges).

## Unlock pacing: the "press anything" moment

The user's tension: a third of the game to unlock everything "feels a bit intense", and Magicka's "oh wow, you can just press anything" moment came early. But drip-feeding stretches the exploration phase. The user floated a core set unlocked fast and one or two held back for story beats, maybe a tenth element (the odd count is annoying), or holding back conjuring devices in the world, "although it feels awkward to have to change this around."

Three ways to pace it:

- **U1, everything after the intro.** The academy ends with all nine elements, and the rest of the game is depth (pools, queue length) and flow (regen, binds). Pro: Magicka's wow moment, intact. Con: the frontier is at its widest when the player knows least; the only new things after that are numbers and found workings.
- **U2, a core set fast, a few held for story beats** (Claude's pick). The academy gives the "press anything" moment with seven field elements and conjure-only Sigil and Shield (weapons and guards), but a 2-rune queue, so the space is wide but shallow (a little over 120 spells, the weapons and guards included, instead of 678). Later, two story beats each open something genuinely new:
  - **The innate arts open** (Sigil's and Shield's other casts: turrets, glyphs, walls, wards, Blink). This is the user's "conjure items in the world" idea. It isn't awkward if it's framed as what it is in the world: you were only able to shape something you hold; now you learn to shape the world around you. In the HUD, Sigil's and Shield's locked casts show as dim slots from the start, so the change reads as "this rune grew", not "this rune changed".
  - **Air, if it's added,** found mid-game at a high place as Earth's opposite: a tenth element, the second wow moment. It costs a key, about 81 % more spells and changes to Water and the Shield wave (`../ideas/air-element.md`), so it's optional. The pacing works with the innate arts alone.
- **U3, a drip over the first third.** Pro: the longest exploration phase. Con: the user finds it intense, and every new element arrives after the player has settled into habits.

**Why U2:** queue length cuts complexity about as much as locked elements do (200 spells with all nine at a 2-rune queue, against 228 with seven at a full queue), and it grows more gently. The wide-and-shallow start keeps the wow; each later unlock is a real verb, not a number.

**After unlocks: the capitalizing phase.** The user: "there's joy in really being able to capitalize on it with more runes and more regen." How far it scales into the late game, and whether it needs artifacts or more Magicks, is to be learned by playing. Candidates to keep in reserve: workings (named special spells), rule-bending gear, and co-op Magicks (`2026-11-03-coop-magicks.md`).

## Optional shrines, in detail

A shrine is a **small, optional, self-contained space**, found off the main path: one to three rooms, three to eight minutes, built around one idea. It's where practice happens without feeling like homework (an open question in `vision.md`), because it's a found place with a reward, not a lesson.

**Rules for every shrine:**
- **One idea,** stated by the room, not by text. The layout shows the problem.
- **Only the spell language.** No new controls, no minigame (pillar 6). Any device in it takes spells as input.
- **Solvable alone, richer together.** Every solution works solo; co-op can split it (one holds a ward while the other freezes the gate), and the shrine scales its fights to the party.
- **More than one answer where possible.** Steam or a freeze-and-shatter both open the frozen door.
- **Once solved, solved.** No replays required; a cleared shrine stays lit as a mark on the map.

**Kinds of shrine:**

- **The puzzle room.** A systemic problem with no enemies. *Example, the drowned bell:* a flooded hall with a bell on a far ledge. Freeze a path across the water, but the ice melts near the braziers; douse them first, or burn a different way across with Earth stepping stones. Ringing the bell (any hit) opens the reward.
- **The constraint trial.** A fight under one rule: only two pools, or a dampening field on everything but Cold, or no weapons. *Example, the cold hall:* waves of fast enemies, and only Cold and Water refill. It teaches wet → freeze → shatter by making it the only good answer.
- **The keeping trial,** a support skill test. Keep something fragile alive: a sapling, a lantern, a sleeping traveller. Enemies go for it, not you. It's where wards on others, heals that lend resistance and walls placed well become the whole game. It also answers the vision's question of what makes support *skillful*.
- **The echo,** discovery without text. A ghostly wizard casts a combination, once, and the room is built so that only that spell opens it. You read the ghost's runes (its rune pips show above it, like a partner's) and copy it. It's how the game can teach a spell nobody explains.
- **The proving ground.** One hard fight against a single strong enemy that examines one skill (parry timing, turret placement, reading a telegraph).

**Rewards:** a working (a named special spell), a pool deepening, a rule-bending trinket, or a piece of the world's history (an inscription, a mural). One reward per shrine, and the shrine shows what it is at the entrance, so a player can choose whether it's worth the detour.

## Encounters: a library, not a recipe

Regions draw freely from a growing set of encounter types. Each is a prototype to borrow from, not a slot to fill.

- **Set-piece battle:** a designed fight on one screen or a larger field.
- **Defence**, which takes many forms (the user: "City under attack, camp under attack, you're in a ruin and you triggered something to happen"): hold a gate, protect a caravan's wagons, survive until a ritual finishes, keep a well's machinery running. Pillar 7's home, since there's prep time before. Survive is its prototype.
- **Gauntlet:** move under pressure (a collapsing mine, a storm front).
- **Ambush:** no prep, the opposite of defence.
- **Escort:** someone slow and fragile, the keeping trial at scale.
- **Native boss:** a large creature of the land, fought in its own arena (what "hunt" meant). It examines the region's idea.
- **Rival casters:** enemies who use the same spell grammar, readable by their rune pips; they teach by example.
- **Puzzle room:** as in the shrines, on the main path where it helps the pacing.
- **Traversal:** paths opened by magic (freeze a river to cross, burn a bramble, Blink a gap). Coming back to an old region with new magic opens its side paths.

## Story, for one player or four

**Characters, revised.** Many characters met in simple ways, not a few deep companions:
- **Recurring faces:** a trader who turns up in every hub, a cartographer who buys your maps, a rival cohort you cross paths with. Each has one trait and one want.
- **Locals with a request,** a rumour or a reaction. A hub's people remember what you did there.
- **A mentor** who sends letters or meets you at wells, and **an antagonist seen from a distance** more than heard.
- **The world changes visibly:** a hub's well weaker on each visit (or restored), a town rebuilt, a road reopened. Change does the work that dialogue would.

**Working solo and in a group.** The story has to work whether one wizard or four are standing there.
- **The party is a cohort** (Claude's pick). The academy sends journeymen out together; solo, you're the one sent. The story never depends on how many you are.
- **Write every line to "you",** which in English doesn't say how many: "you came back" works for one or four. Avoid lines that name a protagonist or pick one player.
- **No beat needs a particular number,** and no puzzle *requires* two people.
- **Choices,** if there are any, are the host's in co-op, or shown as a quick vote.
- **The alternative,** one named protagonist with co-op partners as unnamed companions, makes partners second-class. It's simpler to write, but it costs co-op its feel.

**The spines, deeper.** The user liked the A and B hooks and wants to explore before committing. Each below has its question, how regions serve it, the antagonist's shape and how it fits a cohort.

- **A. The journeyman's circuit** (structure). After the academy, the cohort travels to each great well to attune, by tradition. *Question:* "can we finish the circuit?" *Regions:* one well each, with a city. *Antagonist:* none needed; the obstacles are the land. *Fit:* a cohort is natural. *Weakness:* on its own, no stakes. It's a frame for a cause.
- **B. The shifting fields** (cause). A field is moving, like a river changing course: the forge city's fire dying, the marsh spreading. *Question:* "why are the fields moving?" *Regions:* each shows a consequence. *Antagonist:* possibly nobody, a force of nature, or somebody behind it. *Hard part:* the answer to "why" has to be good.
- **C. The overtap** (a faction). The steam-and-spark side draws fields down faster than they renew. *Question:* "who pays for progress?" *Antagonist:* a guild or a city, with good reasons too (the machines feed people). *Gives:* enemies with field devices you can turn on them. *Risk:* a simple "industry bad" message.
- **D. The academy's vein** (a twist for B). The Arcane vein under the academy is part of why the fields are moving; the institution that trained you is implicated. *Question:* "what did our teachers know?" *Fit:* it ties the first place to the last, and the late game comes home. *Risk:* the "your mentor was the villain" twist is common; it works better if the academy is mistaken than evil.
- **E. The rekindling** (a hopeful variant). Long ago, the fields were broken and the world went quiet; the wells are waking again, and the cohort travels to rekindle them. *Question:* "what can we bring back?" *Regions:* each well relit makes its region and hub visibly recover. That matches power growth: you get stronger and the world gets better. *Antagonist:* whatever broke them, or whoever profits from them staying dark. *Risk:* softer stakes than a disaster.

**Ways to combine:** A + B, with D as the late turn, is Claude's pick for drama. **A + E** suits the visible-progress idea best and is gentler in tone. Either way, A is the frame. The world can hold C as one region's faction in any of them.

## What needs settling before the first campaign assets

1. ~~The tone.~~ Settled.
2. ~~Fields as the premise, Shield and Sigil innate.~~ Settled.
3. **The first hour's unlock path:** U2's academy (staff and hands; Fire and Water first; the rest of the core set; conjure-only Sigil for the first weapon; a 2-rune queue).
4. **The academy:** on an Arcane vein (settled). Still open: what's around it, and which field the first region beyond it has.

The main plot's cause, the ending and later regions can wait until the first region plays.

## Open questions (round 2)

On the page, with Claude's recommendation on each; unanswered means it stands.

1. **Zone strength:** the three bands (edge, heartland, well)? Recommended.
2. **Zones redistribute only,** total regen unchanged? Recommended.
3. **Unlock pacing:** U1, U2 (recommended) or U3?
4. **What's held back:** the innate arts' world casts (recommended), Air as well, or something else?
5. **The party as a cohort,** every line written to "you"? Recommended.
6. **Spines:** A + B + D, A + E, or another mix?
7. **Shrines:** which kinds appeal?
8. **The encounter library:** what's missing?
9. **Which pool deepens is the player's choice** at each attunement? Recommended (carried from round 1, unanswered).
10. **Gear as sidegrades that bend a rule,** no stat items? Recommended (carried from round 1, unanswered).
11. **The element essences** (`../world/elements.md`): what's off?

## Round-1 recommendations superseded

- *"All nine elements by about a third of the game"* became U2 above.
- *"Each region: a hub, three to five chapters, one defence, two or three shrines and a hunt"* became the encounter library.
- *"Per-character progress with a chapter floor"* is deferred: the user wants some catch-up mechanic, decided later.
