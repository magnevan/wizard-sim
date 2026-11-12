# A map with a fantasy feel (2026-11-08)

The user wanted to pull on the overnight map generator: "I was hoping to have maps that are a bit more of a fantasy feel", with a reference image of a hand-inked fantasy map (kept locally as `docs/reference/fantasy_map.webp`, deliberately not committed: it's someone else's art and this repo is public). They had just answered the Field Atlas's scale question with **one continent, several regions**. This is round 2 of the Field Atlas (`../../tools/world-map/`); round 1 is in `../archive/overnight-2026-11-08.md`.

## What makes a map read as fantasy

Looking at the reference, the feel comes from composition and drawing conventions more than from any one technique:

- **Land with a shape:** big masses around an inner sea, bays and island chains, not one noise blob.
- **Ranges and forest masses:** mountains in long chains, forests in named clumps. Scattered single trees or noise-placed peaks read as a heightmap.
- **Soft washes:** snow, dark conifer green, olive, sand, blended through each other on textured paper, with dusty teal water.
- **Everything inked:** glyphs with outlines and a lit side, y-sorted so nearer things overlap farther ones.
- **Dressing:** dotted roads and sea routes, curved lettering, banners on the important places, compass rose, rhumb lines, a frame, a map key, ships and sea monsters.

## What round 2 built

A new generator (`gen.js`) and a painted renderer (`chart.js`), all procedural and deterministic per seed. No generated art and no credits spent.

- **Land:** four or five lobes on a ring around an inner sea, with a gap so the sea opens, then island chains. Land is held to 43% by taking a quantile as sea level, so no seed comes out empty or all land.
- **Mountains:** 3-4 chains walked as curved lines along the ring, with height stamped along them.
- **Water:** rain carried on a prevailing wind, so a dry shadow forms behind each range; pits filled by priority-flood; rivers from flow accumulation, so they merge; the larger pits become lakes.
- **Fields:** same rules as round 1, rescaled. Volcanoes stay out of the cold. Lightning now also gathers over volcanoes (the user: "a fire/lightning overlap could be cool"), and fire is kept away from frost.
- **Places:** the academy beside a rift, a city at each field's well, then towns where fields meet, with no town name used more than three times. Roads run by A* around mountains; sea routes link the ports. Shrines are scattered off the road.
- **Chart look:** peaks, pines, broadleaf trees, hills, dunes, cacti, marsh tufts, ice shards, volcanoes, rifts with crystals and storm clouds, all drawn by code; each town's roof takes the colour of its strongest field, which is how the fields read on the plain map. Chart + fields lays them over the top; Fields is the old diagram.

## The trade-offs

- **It costs nothing per world and any kept seed can be redrawn at any size,** and the fields stay true to the data, which a painted map wouldn't. But it has one artist's hand, and a seed's composition is what it is: an AI or human painter would give more variety and charm per landmark.
- **Town names are still functional** ("Farm town", "Storm port") because naming belongs to the user. The wells, ranges and regions carry plain descriptive placeholders ("Well of Embers", "The High Range"), and those are the least fantasy-feeling part of the map right now. It's Q6 on the page.
- **Azgaar is still untried** (it needs one real export from the user), and so is painting over a seed (it needs an approved description before any paid generation).

## Open on the page

Q5 is this the feel; Q6 what labels should say; Q7 how much the map shows the fields. Q1 (approach), Q2 (looks) and Q4 (field rules) are still open from round 1.
