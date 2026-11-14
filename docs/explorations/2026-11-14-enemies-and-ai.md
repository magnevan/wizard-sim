# 2026-11-14: More enemies, and AI for enemies and companions

The user asked for research on Magicka 1 and 2's enemies, proposals for enemies that make interesting play, and ways to make NPCs seem reasonably smart in combat, both enemies and friendly companions. They don't want deep strategic AI, only companions that look sensible in a fight and enemies that give a fair challenge. Rated on the [Enemy Roster](https://claude.ai/artifact/QSBW1MzxrF7P1cktdfnXtP) page (`tools/enemy-roster/`).

Builds on `2026-11-03-encounters.md` (each enemy asks the players one question), whose unbuilt archetypes (lane chargers, burrowers, totem, reflector, more elementals) are folded in below.

## What we have now

Six fighting archetypes (`game/packages/sim/src/archetypes.ts`): goblin (swarmer), brute (slam with a travelling shockwave), shieldbearer (slow-turning frontal guard), archer (keeps 8 u away or hides behind a brute or shieldbearer), grabber (dash, hold, drag, throw) and fire imp (fire-immune, cold and wetting hurt). Plus the tutorial's bramble and straw goblin.

Their AI (`enemies.ts`) is a small state machine per body: approach, wind-up (telegraphed, 0.6 to 1.2 s), strike, cooldown. Each chases the nearest wizard (a Double draws them), steers round rock, batters a wall when cut off, and the mode can override the target or the spot (the battery's lanes). Nothing coordinates them: every goblin in reach winds up at once, none of them flinches from fire on the floor, and none of them reacts to wet, burning or allies. The bot pilot (`bot.ts`) is an ordered rule list that produces a seat's input (heal when hurt, arc of stone when crowded, rocks at brutes, Place on shieldbearers, soak then shock). Its memory lives outside world state.

## What Magicka did

Sources: the Magickapedia enemy table and family pages (goblins, dwarves, trolls, beastmen, undead, necromancer; read in a browser, 2026-11-14), carlsguides chapters 6, 8 and 11, a Steam weakness thread, the PCGamesN and GamesBeat Magicka 2 reviews, and Wikipedia. Magicka 2 has almost no wiki coverage, so it's thin here.

**Magicka 1.** Roughly fifty enemy types in families: goblins, orcs, trolls, dwarves, beastmen, undead, demons, treants, spiders, plus bosses (Ygg, Jormungandr, Jotunn, Khan, Grimnir, Assatur, Fafnir, Death). The mechanics that stand out:
- **Goblin bomber:** throws bombs that lie on the ground then explode (knockdown, burning); any fire sets its own bombs off; it drops 4 to 5 bombs on death; Push sends bombs back into the goblins.
- **Goblin shaman:** water beam then lightning on the wet wizard; teleports at random; a fire ward that also covers nearby goblins (the counter is Nullify). Its casting is chaotic and mostly hits other goblins.
- **Goblin wizards (the Aristocrats):** robes in their element's colour, each casting a set repertoire; all self-heal, use fire to dry or thaw themselves and water when burning. Their weakness is the opposite of their colour.
- **Goblins panic when set on fire.** Rogues grab your head until you mash free or cast something big.
- **Goblin warrior and captain:** a shield that has its own HP and must be broken first (earthquake does it); they speed up once it's gone. The captain's freezing spin hits goblins as much as you.
- **Trolls:** 6,000+ HP, regenerate unless burning, one-shot attacks (a hammer, or picking you up and eating you slowly: mash to escape). Cannon trolls lob arcing shells at range and shoot straight up close. A troll's swing hurts other enemies, so you can bait it. The snow troll (yeti) is fast and won't grab a wizard who is on fire or wearing rock or ice armour.
- **Beastmen:** raiders leap across the map and sidestep attacks; brutes charge when you get close; Alpha variants carry an aura that makes nearby monsters resist one element.
- **Dwarves:** warriors teleport into melee and wear an arcane-weak shield; priests charge a one-shot 5× earth boulder (shield up or die), shield themselves, heal others and resist lightning; you push them into lava.
- **Undead:** hurt by Life, healed by Arcane. A wight is slow but lunges fast; when it dies it leaves a skeleton. Darksouls come in four elements, each weak to its opposite. Skeletons ignore sprays. The necromancer raises zombies and hides inside the crowd.
- **Demons** phase out (immune) and back in, and split into three demonlings when killed, unless you finish them with a big explosion.
- **Grimnir:** waves of wizards you push off a ledge, then a duel; he glows before a tornado or conflagration, a shield absorbs the conflagration, and wet + shock is how you hurt him.

**Magicka 2.** Families again (goblins, orcs, dwarves, elves, trolls, undead, crabs, Vanir), mostly told apart by elemental weakness (orcs to lightning, dwarves to ice, elves and trolls to fire, undead to Life, Vanir resist cold). Big crabs have a weak tail and lightning-weak armour; hazards include lightning pods that absorb lightning. Reviewers called the enemies "mechanically interesting" but bland to look at. The common complaint was clutter: swarms from every side, enemies hitting from off screen, little room for tactics, and solo play brutal (PCGamesN 6/10, GamesBeat 55/100).

**Lessons for us:**
1. Magicka's best enemies turn your own tools into the answer: Push sends the bombs back, fire stops the regeneration, a shield beats the priest's boulder, Life hurts the undead. That matches our "each enemy asks a question" rule.
2. The second-best trick is **enemies that hurt each other**: chaotic goblin casters, the captain's spin, trolls you bait into the crowd. It's cheap, it's funny, and it suits a game where friendly fire is part of the joke.
3. Magicka 2's resistances-per-family approach reads as homework when nothing *shows* it. Our ward outline (the imbue's skin) already shows resistance; enemies should use it.
4. Its clutter problem is what pillar 4 (room to think) warns against: few attackers at a time, everything telegraphed, nothing hits from off screen.

## Proposed enemies

Each asks one question, and each answer uses a verb we already have. Ordered by how cheap they are to build on today's sim.

| Enemy | From | The question | How it fights | The answers |
|---|---|---|---|---|
| **Sapper** (goblin) | Goblin bomber | Can you turn their weapon on them? | Lobs a fused bomb at a marked spot; it lies 1.5 s then bursts (knockback, burn). Carries more: fire on the sapper sets off its satchel. | Push or Area Force sends bombs back; fire it in its own crowd; a wall soaks the burst. |
| **Charger** (beast) | Beast brute | Can you use walls? | Slow walk; within ~6 u it paws (a long tell), then charges in a straight line. Hitting rock or a barrier stuns it 2 s. | Sidestep; drop a wall in its line and punish the stun. |
| **Troll** | Magicka trolls | Can you keep it burning? | Big, slow, heavy club with a ground tell; heals fast unless burning; grabs and chews a wizard slowly (an ally or a big hit frees them). Won't grab a wizard who's burning or wearing stone. | One player keeps it burning while the other deals damage; a rescue; a Fire or stone ward on the bait. |
| **Warding shaman** (goblin) | Shaman fire ward, Alpha auras | Can you prioritise, or switch element? | Stays back and raises a ward of one element over itself and allies within 4 u, shown as the ward outline. Recasts on a long timer. Flees when approached. | Kill it first (Point, Yank, flank), or switch element. |
| **Hedge wizard** (goblin) | Goblin shaman and wizards | Can you use their spells against them? | Casts real spells from our grammar from a short list (wet then shock; a fire spray), with clear wind-ups, and aims loosely. Its sprays and arcs hit goblins as readily as you. | Bait it into its own crowd; ward against its element; it's frail. |
| **Leaper** (beast) | Beast raider | Can you hit what won't stand still? | Leaps 6 to 8 u to a marked landing spot (shadow grows); sidesteps one missile now and then. | Area on the landing; glyphs; a stun mid-air. |
| **Mire slime** | Demon splitting, the 11-03 water slime | Do you finish with a big blow? | Slow, wet, soaks what it touches. Splits in two when killed by a small hit; a big hit (one spell of 3+ runes) kills it clean. Lightning hurts it double. | Charge a bigger spell; shock the puddle. |
| **Gravecaller** | Necromancer | Can you reach the source? | Raises shambling dead from fallen enemies' bodies (a 1 s tell on each corpse) and keeps to the middle of them. The dead are weak and Life hurts them. | Life sprays or rings; Point it; Yank it out. |
| **Stone-singer** (dwarf priest) | Dwarf priest | Do you raise a shield in time? | Charges a boulder for 2.5 s with a loud tell, then throws it hard enough to down a wizard. Wards itself against lightning. | A barrier or stone ward; interrupt with a stun; knock it into a hazard. |
| **Element-born** (family) | Darksouls, the fire imp | Do you read the battlefield? | Made of one element, immune to it, weak to its opposite, leaves its element on hit: frost wisp, storm wisp, mud-thing. Data on the imp's pattern. | Element choice. |
| **Mirror** | 11-03 reflector | Can you switch forms? | Reflects missiles and beams that hit its face. | Area, Place, Weapon. |
| **Burrower** | 11-03 | Did you prepare? | Surfaces from marked holes on a known beat. | Glyphs, turrets and walls placed in the lull. |
| **Rival wizard** (elite) | Grimnir, the Aristocrats | Can you out-cast a wizard? | A full wizard body run by the companion brain (below) on the enemy side: wards, blinks, dries itself when wet, heals. | Everything; a mini-boss. |

Recommended first batch: **Sapper, Charger, Troll, Warding shaman, Hedge wizard.** Each pays off a verb we already built (Force push, walls, Fire, element switching, the spell language itself), and between them they add a lobbed threat, a line threat, a sustain check, a priority target and enemy friendly fire. The hedge wizard is the most important: it makes the enemies speak the same spell language the players do (pillar 2), and it's the stepping stone to the rival wizard and to companions.

Also proposed, small: **goblins panic when burning** (they run, spreading fire; Magicka did this). Burn panic for *wizards* was rejected (`ideas/burn-by-damage.md`); this is for goblins only, and it's crowd control you earn with fire.

## AI for enemies: a fair fight

Keep the per-body state machine (it already draws the four-beat telegraph) and add four small layers on top. None of it is strategy.

1. **Attack tokens.** Before a wind-up, an enemy takes a token from the wizard it targets: 2 melee + 1 ranged + 1 heavy per wizard, scaled by difficulty. Without one, it waits on a ring about 3 u out, shuffles sideways and feints. Tokens release on strike, stun, freeze, death or a timeout. This is how Batman Arkham, Assassin's Creed and DOOM (2016) keep crowds readable; Aztez also never lets two enemies use the same attack type at once. Today every goblin in reach attacks together.
2. **Surround slots.** Waiting enemies take the nearest free slot on a ring round their target and swap slots now and then, so they spread out and flank instead of stacking. The shieldbearer takes the front slot and goblins the sides.
3. **Reacting to the floor, with a delay.** Enemies step out of danger they can see (a burning patch, a geyser mark, a brute's circle, a sapper's bomb) after a 0.3 to 0.5 s reaction delay, so it looks like they noticed rather than knew. Burning goblins panic. A shaman wets itself to put out a fire.
4. **Who to attack, sticky.** A score per wizard (distance, who hurt it recently, a Double's taunt) with a 2 s commitment, so targets don't flicker. It never picks a downed wizard.
5. **Pacing.** A per-wizard stress number rises with damage taken and nearby enemies and falls over time. While it's high, the encounter runner holds new spawns; that's Left 4 Dead's director in about 30 lines, and it protects the lulls pillar 7 needs.

Difficulty turns these knobs: token counts, reaction delay, telegraph length, re-attack delay. HP and damage stay as tuned.

## AI for companions: seems smart, isn't clever

There's no companion design yet. The canon says the cohort is "you" and the world carries the story more than deep companions do, so a companion is probably a classmate or a summoned helper, not a personality-driven partner. The proposal:

1. **A companion is a wizard body driven by an input bot.** Like `bot.ts`, it produces a seat's input each tick: it queues runes it can pay for, aims and casts. It obeys every rule a player does (runes, wind-up, friendly fire), it's deterministic, and nothing about it needs special-casing in the sim. Its memory has to move into world state so it runs on every peer under rollback.
2. **Utility scoring over a short list of plays.** About ten plays (heal an ally, ward an ally, soak then shock a group, arc of stone against a crowd, interrupt a brute's wind-up, free a grabbed ally, Rally a downed one, reposition, attack the player's target, step out of danger). Each is scored from a few considerations (ally HP, enemies near, what the target is weak to, runes in the pools) and the best one runs. A play is committed to for at least 0.5 s, and the current play needs a margin before another replaces it, so it doesn't twitch. The `question` each archetype asks gets a known-answer table, which `bot.ts` already half has.
3. **Five habits that make it look smart:**
   - Stay on a follow ring beside or behind the player, never in the cone where the player aims.
   - Before any cast, test its footprint with the sim's own hit shapes; if an ally is in it, don't cast.
   - Complement the player: read what the player just cast and score what's missing higher (the player soaks, the companion shocks).
   - Rescues first: a grabbed or downed ally outranks damage.
   - Show intent: a small glyph over the companion's head for a beat before it acts, so a co-op partner can read it.
4. **Profiles, not personalities.** Healer, warden and striker are weight sets over the same plays. That's cheap variety for "many characters met in simple ways".
5. **Fair limits.** A reaction delay (0.3 s) and a slower queue than a skilled player, so a companion never out-supports a person (pillar 3).

FFXII-style gambit lists were considered and are not proposed: an editor for rules is a minigame outside the spell language (pillar 6) and far more than "reasonably intelligent" needs. A single stance key (follow / hold here / focus my target) is the most control proposed.

The same brain on the enemy side, with a different weight set, is the rival wizard. That means one system serves both companions and the elite enemy.

## Determinism notes

All of it runs in the sim from world state: tokens, slots, commit timers, stress, reaction timers and companion memory live in the typed arrays and the hash. Ties break by body index; any randomness comes from the world's seeded RNG. Decisions can be staggered (body index mod 4 picks the tick) while steering runs every tick. A replay test per new enemy, as the battery has.

## Questions for the user

On the page, with recommendations:
1. The first batch (Sapper, Charger, Troll, Warding shaman, Hedge wizard).
2. Enemy casters use our spell grammar (yes, from short fixed lists).
3. Attack tokens per wizard (2 melee + 1 ranged + 1 heavy).
4. Goblins panic when burning (yes).
5. What a companion is (classmates who fight beside you in campaign segments first; summons later).
6. How much you control a companion (nothing at first, then one stance key).
7. Companions obey friendly fire and runes as players do (yes).

## Sources

- https://magicka.fandom.com/wiki/Enemies_(Magicka), and its Goblin, Dwarf, Troll, Beastman, Undead and Necromancer pages
- https://carlsguides.com/walkthroughs/magicka/chapter6.php, chapter8.php, chapter11.php
- https://steamcommunity.com/app/238370/discussions/0/615085406657014873
- https://en.wikipedia.org/wiki/Magicka and https://en.wikipedia.org/wiki/Magicka_2
- https://www.pcgamesn.com/magicka-2/magicka-2-pc-review, https://gamesbeat.com/magicka-2-review/
- https://gamedeveloper.com/design/enemy-design-and-enemy-ai-for-melee-combat-systems (attack categories, near and far groups, tells)
- https://www.strayspark.studio/blog/attack-token-system-ue5-group-combat-that-feels-fair (tokens; DOOM 2016)
- https://gameai.com/iaus.php (utility scoring)
- https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf (the Left 4 Dead director)
- https://gameinformer.com/b/news/archive/2014/03/18/by-your-side-irrational-discusses-how-it-kept-players-connected-with-elizabeth (Elizabeth)
- Ellie (The Last of Us, Game AI Pro 2) and FFXII gambits are from memory *(unverified)*.
