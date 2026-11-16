# The morning's fights: encounters and creatures for the opening

Brainstorm, 2026-11-16, following [the element order](2026-11-16-element-order.md) (round 2: the out-and-back route through the courtyard). The user asked what the encounters at each stop could look like, and what new enemy types would fit. Everything here is a proposal. Images are Codex concept art, inspiration only, in `docs/reference/element-order/`.

Pillars touched: 7 (every spell needs a situation where it's clearly the best answer; downtime is for preparing), 4 (room to think), 3 (co-op roles in a fight) and 5 (told through places).

## What's already decided

- **Enemies ask questions.** Each archetype asks the players one readable question, and the spells should hold a clear best answer to it ([original encounter design](2026-11-03-encounters.md)). Every dangerous attack has a 0.6 to 1.2 s telegraph, and enemies move at about 70 to 80 % of a wizard's speed.
- **Fights come in waves with lulls,** with the next wave visible so players can prepare. Overlapping questions in one wave are what create co-op roles.
- **The built roster** (`game/packages/sim/src/archetypes.ts`): goblin (swarmer), brute (telegraphed slam), shieldbearer (frontal guard), archer (back-line bolt), grabber (drags a wizard away), fire imp (immune to Fire, hurt by Cold and by getting wet). The battery's lesson already sends goblins, archers and a brute (`battery-waves.ts`).
- **Creatures follow the element notes** ([Element essences](../world/elements.md)): Water's are amphibious and hard to burn, Fire's quick and aggressive, Cold's large and armoured, Lightning's fast and in swarms that chain, Earth's heavy and territorial, Life's many and regenerating, Arcane's few and strange.

## The idea for a learning segment

**Each stop's fight asks the question that its new element answers best.** You learn Water where fire imps only fear getting wet; you learn Earth where rams charge down a lane and a wall stops them. The element arrives as the answer to a problem you've just been struggling with, which is pillar 7 used as a teacher. The fight before the fix is the struggle, and the fight after it is the relief.

## Who's attacking

1. **The goblin warband only (conservative).** All built. Goblins from the wilds raid through the ward gap. Simple, but every fight has the same faces, and the machines' own trouble has no creatures of its own.
2. **Beasts only.** Nature gone strange: wildlife touched by the rifts, runaway growth, things driven out of the sea. No one to blame, which suits canon (why the veins shift stays open). But it wastes the built roster, and beasts don't use tactics like shields and hooks.
3. **Both, by place (Claude's pick).** The warband exploits the gap: it's at the battery (as built), the ward line and the finale. The beasts are the fallout around the machines: overgrowth at the infirmary and the ward, imps in the gorse fire, things from the surf at the harbor, rams and moles on the cliff. Two readable families: goblins bring tactics (shields, archers, hooks), and beasts bring nature (packs, charges, burrows, elements).
4. **Each broken machine spawns its own elementals (wild).** Magicka's elementals: frost things from the icehouse, sparks from the coil. Clear, but generic, and it makes the machines villains when they're the victims.
5. **The warband is behind it (wild).** The goblins broke the ward on purpose and the beasts follow them through. It gives the morning a face, but it answers "why", which canon leaves open, and turns a disaster into a plot.

**Why both:** reuse everything built, give each place creatures that belong there, and keep the morning a disaster rather than an attack. The goblins are opportunists, light in tone: they wear blue academy cloth as trophies and carry shields made from machine panels.

## The creatures

New looks on built archetypes where possible. Five new behaviours in all, marked **new**.

| Creature | Family | Built on | The question it asks | Best answer | Where |
|---|---|---|---|---|---|
| Rift wolf | Rift-touched | Goblin (swarmer), in packs | Can you hit many at once? | Fire spray or area; Cold slows the pack | Ward, harbor, cliff, finale |
| Crag ram | Rift-touched | **New: charger.** A lowered head and scraped hoof, then a straight charge that stuns it against anything solid | Can you block a line? | An Earth wall (it stuns against it), a barrier, or stepping aside | Cliff road |
| Rift mole | Rift-touched | **New: burrower.** The ground rumbles at a marked spot, then it surfaces | Did you prepare? | A Place cast or a rune on the rumble, a wall over the hole | Cliff road |
| Shard moth | Rift-touched | **New: reflector.** Its crystal wings bounce beams and projectiles | Can you switch forms? | Area, weapons, Place: anything that doesn't travel through it | Later in the campaign (see question 4) |
| Rift aurochs | Rift-touched, boss | Brute, scaled: a slam whose ring of crystal shards is telegraphed by glowing lines | Can you deal sustained damage, and protect the friend it targets? | The Arcane beam, wards on the target | Finale |
| Thornback | Overgrowth | **New: regrowth.** It regrows from cuts unless it's burning | Can you burn it? | Fire | Battery slope, ward line |
| Thornspitter | Overgrowth | Archer, rooted. Lobs volleys of thorns in an arc | Can you hold them off? | A Shield barrier stops a volley | Ward line |
| Vine lasher | Overgrowth | Grabber. Drags a wizard toward the forest | Can you rescue? | Damage it to break the hold; ward the one it targets | Ward line |
| Gorse imp | Overgrowth | Fire imp, as built (immune to Fire, hurt by soaking and Cold) | Do you read the battlefield? | Water | Waterworks, battery slope |
| Brine crab | Surf | Shieldbearer, with its claw as the guard | Can you go around? | Freeze it (it turns even slower), then flank | Harbor |
| Surf crawlers | Surf | Goblin (swarmer), **new: always wet**. They arrive in the waves | Can you chain? | Lightning | Harbor |
| Storm gulls | Surf | Swarmer that swoops; immune to Lightning, they dive at the wet | Can you stay dry? | Fire to dry off, Cold to clip them, wards | Harbor (optional) |
| Goblin raider, archer, shieldbearer, hooker, chieftain | Warband | Goblin, archer, shieldbearer, grabber, brute, as built | As built | As built | Battery, ward, finale |

The new behaviours, in the order Claude would build them: charger (also good anywhere with lanes), regrowth, always wet, burrower, reflector.

## The fights, stop by stop

### 0. The courtyard
No fight. The drill yard's hands lessons (beats 2 and 3) and their small hands test stay as built.

### 1. The infirmary: Life
**No enemies.** It's the low-pressure first cast (the user). The overgrowth is the obstacle: the vines you cut free from the well. The pressure is the patients: wounded on cots, each needing a heal, with the combinations shown on screen. Co-op: split the cots between you, and heal each other.

### 2. The battery: Fire (built)
The warband's first probe, as built: goblin raiders, archers, a brute. One possible addition: a couple of thornbacks on the gorse slope, which shrug off your blade and only stay down when burning. It's the first time Fire is plainly the answer. The dying turret sets the gorse alight, and that fire carries on to the waterworks.

### 3. The ward line: Shield
- **Before the fix:** rift wolves pour through the gap, and the guards hold a ragged line beside you. Thornspitters rooted just past the pylons lob volleys of thorns over the guards. Without Shield, you can only heal the guards, kill the wolves, and push toward the sockets.
- **The fix:** feed Life and Fire into the dark pylons' sockets. The first relights, and Shield arrives.
- **After:** the thorn volleys are the question Shield answers. Raise a barrier and the volley breaks on it; ward a guard and he holds. A vine lasher or a goblin hooker drags a guard or a friend toward the forest: rescue. The panels flicker, so lanes open and close. Each time a stretch of barrier comes back, it's a short lull.
- **Co-op:** one holds a barrier at the gap, one wards the guards, one feeds the last socket, one rescues.

### 4. The waterworks: Water
- **Before the fix:** gorse imps leap out of the burning sheds and run through the dry cistern. Fire does nothing to them, and your blade is slow work. Rift wolves come down the cistern's steps.
- **The fix:** relight the boiler with Fire. Water surges up the aqueduct and arrives.
- **After:** soak the imps and they fizzle. The cistern fills as the fight goes on, so in the last wave every imp that runs in is soaking up its own death. Steam where water hits burning gorse is cover from any goblin archers on the rim.
- **Co-op:** one douses the sheds while the others clear the basin. Nobody needs to be told that Fire is useless here.

### 5. The harbor: Cold, then Lightning
- **Arriving:** brine crabs hold the bottom of the stairs with their claws up, and rift wolves run the quay. The crabs ask you to go around, and the quay is cramped.
- **Cold:** fix the frost heart. Now freeze a crab and it's stuck facing one way while a friend flanks it. Freeze the wolves and they slow. Ice sheets form where the surf lands on frost.
- **The surf brings surf crawlers.** With each set of waves (the visible arrival, the lull and wave rhythm), a pack scuttles over the quay's edge, already soaked.
- **Lightning:** fix the coil. Now one arc chains through a whole wet pack. Storm gulls (optional) dive at anyone wet, so drying off with Fire matters. The friendly-fire lesson: a friend standing in the surf takes the chain too, unless warded.
- **Co-op:** one freezes the crabs, one flanks, one watches the waves; then one chains while the others keep their feet dry or their friends warded.

### 6. The cliff road: Earth
- **Before the fix:** crag rams charge down the switchback's straight stretches. Goblin archers shoot from the terrace above. The ground rumbles where rift moles will surface.
- **The fix:** wash the buried anchor clear with Water. Earth arrives.
- **After:** raise a wall across a lane and the ram stuns itself against it. Raise one between you and the terrace and the arrows stop. Drop rock on a rumble and the mole surfaces into it. Falling boulders (the place's own effect) are shown by shadows.
- **Co-op:** one walls the lanes, one handles the moles, the others push up the slope.

### 7. The courtyard finale: Arcane
- **Arriving:** the warband's main force and the beasts come in together through the back archway, and the masters, guards and healers fight alongside you.
- **Before Arcane:** defend the first ring-lock while one of you feeds it. Goblin shieldbearers and wolves press the plinth.
- **Arcane:** the first ring locks and the column steadies enough to step into.
- **The rift aurochs** comes through the archway: the opening's boss. Its slam is shown as glowing lines spreading in a ring, then a burst of crystal shards. It's a brute's question, sustained damage, and the beam you just got is the answer. Ward the friend it's charging.
- **The place's own effect:** the rift cracks flare along their length, so the floor pushes the fight around.
- **Co-op:** two feed the locks while two hold the aurochs, then everyone beams.

## The images

Prompts are in `tools/concept-gen/prompts/2026-11-16-encounters/`.

| Image | What it suggests |
|---|---|
| [Rift-touched beasts](../reference/element-order/creatures-rift.jpg) | Real animals first, crystals second: they read as wildlife gone wrong, not monsters. The ram's crystal-crusted horns and the aurochs' crystal mane are the strongest silhouettes. The wizard at the left gives the scale: the wolves are knee-high, the aurochs four times a wizard's height |
| [Overgrowth](../reference/element-order/creatures-overgrowth.jpg) | The thornback's cut stumps sprouting fresh shoots make regrowth readable at a glance. The thornspitter's open pod with thorns above it is a clear telegraph. The vine lasher's reach is as long as its height, a good grab range to show. The gorse imp is the built fire imp, restyled |
| [From the surf](../reference/element-order/creatures-harbor.jpg) | The brine crab's one huge claw held forward is the shieldbearer's guard in one shape. Surf crawlers spilling from a wave show the arrival. Storm gulls carry static between them, so their Lightning immunity can be read |
| [The goblin warband](../reference/element-order/creatures-goblins.jpg) | The light tone asked for: goggles, academy cloth as trophies, a shield that's a machine panel with a wheel on it, a chieftain's maul banded in brass. It reads as one band, distinct from the beasts |
| [The rift aurochs](../reference/element-order/boss-aurochs.jpg) | Three states: standing, rearing with a glowing ring as the slam's warning, and the crystal burst. The ring is the telegraph to build. The creature drifted toward a bear-bull here; the rift sheet's version is the better aurochs |
| [Academy buildings](../reference/element-order/academy-buildings.jpg) | Six buildings at real scale as map edges: lecture hall, dormitories, the library-observatory, workshops with brass pipes, the gatehouse, a cloister. A kit for the courtyard and the drill yard, and the workshops tie the academy to its machines |
| [Ground materials](../reference/element-order/ground-materials.jpg) | Twelve swatches, one for each place's ground: paving, road, rift meadow, the dry cistern, shallow water, frost, wet quay, ice sheet, burnt gorse, slide mud, the rift-cracked paving, the wilds' floor. Close to a brief for tiles |
| [Fight: battery](../reference/element-order/fight-battery.jpg) | Fire sprayed over a thornback while another regrows from its cuts, a fire blade on a raider, a heal behind a rock. The goblin party (archer behind a board, panel shield) climbs the gorse slope below the turrets |
| [Fight: ward line](../reference/element-order/fight-ward.jpg) | The clearest of the six: a thorn volley shattering on a curved barrier, each guard in its own ward bubble, fire freeing a guard from the vine lasher, a wizard feeding the last socket. Shield's lesson in one frame |
| [Fight: waterworks](../reference/element-order/fight-water.jpg) | The half-filled cistern is the idea working: dry floor on one side, water on the other, imps fizzling to smoke where they land in it, a jet putting out the sheds into a bank of steam, a heal on the steps |
| [Fight: harbor](../reference/element-order/fight-harbor.jpg) | A brine crab frozen in a block of ice with a wizard walking round it, lightning chaining through crawlers out of the surf, and the chain breaking on a warded friend standing in a puddle: the friendly-fire lesson with its answer |
| [Fight: cliff road](../reference/element-order/fight-cliff.jpg) | The charger's question answered: a ram stunned against a raised wall. A mole surfacing as rock is dropped on it, goblin arrows stopped by stone, shadows under falling rocks, the anchor relit at the bend |
| [Fight: finale](../reference/element-order/fight-boss.jpg) | The aurochs rearing inside its glowing warning ring, two beams on it, a ward dome over the friend it's charging, masters on the stairs. Readable with few figures, unlike the crowded round 2 finale |
| [Beyond the ward](../reference/element-order/wilds-edge.jpg) | Where the morning comes from: the goblin camp with a scavenged turret and academy banners, rift cracks pouring violet light like waterfalls, beasts on the paths to the gap. The dark pylons here are drawn as small armillaries, a nice tie to the ward drawing on the armillary |

## Questions for the user

1. **Who attacks?** Both by place: the warband through the gap, beasts around the machines (Claude's pick). Or the warband only, or beasts only.
2. **Which new behaviour first?** Charger (Claude's pick: the cliff road needs it and it's useful anywhere with lanes), regrowth, always wet, or burrower.
3. **The infirmary:** no enemies (Claude's pick: the low-pressure first cast), or a small stray fight at the end?
4. **The shard moth (a reflector):** later in the campaign (Claude's pick: it punishes the beam the opening has just given you), or in the finale as a twist?
5. **The goblins' tone:** opportunists with trophies and scavenged machine panels (Claude's pick), or something darker?
