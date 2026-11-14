# The drill yard, built (2026-11-14)

The opening's beats 2 and 3 (the crash course in fighting, and the charged focus), built from the yard's settled notes on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page. The user asked to "go back to the start and build out the initial tutorial segment where you learn movement and basic fighting... and get assets". Midway they added: "Ideally the map should also let you explore a little bit of the academy. It's not meant to be a large map, but not so restrictive either, you should see the world around a bit." Decision: [The drill yard](../decisions/README.md#2026-11-14-the-drill-yard-built-in-a-corner-of-the-academy).

Play it: `#yard`, key 7, or the Esc menu's Campaign list. `npm run check:yard` drives it and takes shots in `game/shots/yard/`.

## What the player does

| Station | You do | Done when | Keys shown |
|---|---|---|---|
| The hall door | Walk out onto the path | Anyone walks 5 u from their start | Hold LMB |
| Strike lanes | Knock down the straw goblins at the four posts | All four down (they stand again 12 s later) | RMB |
| The pit | Shove the sack into the chalk ring | A Heavy near the sack, and the sack in the ring | Hold RMB |
| The slam ring | A soldier with a mallet slams; hop out | Two slams in a row hit nobody | Shift + LMB |
| The parry lane | A crossbowman shoots blunt bolts; send one back | One parry in the lane | Space |
| The hands test | Four straw goblins rush whoever steps in | All four down (again once nobody is near) | Shift + RMB |
| The rack | Take a charged focus: one Fire, one Sigil, no regen | A focus taken | X, then D F, Shift + LMB |
| The gate | Out to the battery | Anyone with a focus at the gate | |

- **No gates but the last.** A station wakes as you walk up (within 8 u) and shows its keys until it's done; you can walk on at any point. A returning player gets through by walking (pillar 1). The only lock is the north gate, which waits for the focus.
- **Co-op:** the stations count for the party, as the tutorial's do. The strike lanes have four posts, and the rings and lane fit four. The sparring soldiers take whoever is nearest at their station.
- **Nobody dies:** the yard runs no encounter, so a wizard at 0 hp gets up whole, after lying still 1.5 s.

## The place

90 x 68 (the battery is 84 x 72). The plan is on the page; the level is `tools/segments/01-opening/yard-level.py`.
- **South, where you start:** the academy hall (cream sandstone, blue slate), the cloister walk, a flagged apron with the notice board and lanterns, and a garden with a well, benches, flowers, beehives and a sleeping cat. Nothing stands south of the buildings: south is toward the camera, so anything there would hide them.
- **The yard:** trodden grass and worn dirt, the stations along the path, and a casting line where students practise at targets.
- **East:** the hired soldiers' barracks and their drill ground, the equipment shed, and the building stock left from putting the yard up in a hurry. The yard's east fence is unfinished.
- **West:** what's left of the farm the yard was put on: a ruined wall and arch, old orchard trees, a rusty plough, a wagon wheel, a broken barrel, old roof tiles.
- **North:** a low fieldstone wall with the gatehouse in it, banners, a signpost, and ploughed fields and a road running off past the wall.

## Assets

- **Bought, 14 generations** (balance 1,670 → 1,656; prompts word for word in `tools/segments/01-opening/yard-buy.json`):
  - 16 props in one `create_1_direction_object` job at 48 px: planks, logs, cut stone, sawhorse, ladder, fence posts, a tarp heap, a nail barrel, a gravel heap, an unfinished fence, a wagon wheel, a rusty plough, a broken barrel, roof tiles, a jerkin rack, practice shields. All 16 kept.
  - Four buildings from `create_map_object`, one generation each: the academy hall, the cloister walk, the barracks and the equipment shed.
  - Registered by `tools/art-import/yard.py`. The raw files are in `game/content/generated/pixellab/opening/yard/`.
- **Drawn in code, free:**
  - Students are the wizard rig in three academy robes (slate, umber, moss).
  - Soldiers are a new rig (`drawSoldier` in `art/rigs.ts`): boots, a quilted jerkin under a tabard, a kettle helmet, and one of a practice sword, a mallet (it slams like the brute), a crossbow or a spear.
  - The page had planned to buy a soldier as a character. A code rig matches the wizard beside him and can fight with the same poses.
- **Everything else was already owned:** dummies, the sack's gallows, pells, targets, racks, the focus rack, fences, hay, the gatehouse, trees and flowers.

## The buildings, rebuilt from kits (same day)

The user: "Be careful with building that are just a single sprite. I feel like they're going to look like they're the wrong scale for the world." A wizard against each bought building confirmed it: the barracks and shed came up to his head, the cloister's arches just cleared his hat, while the gatehouse's arch stood four wizards tall. A one-picture building gets its door and storey size from the generator.

- Two building kits bought, 20 generations (1,656 → 1,636), descriptions approved by the user: academy sandstone and slate (walls 3 tiles, two storeys), and timber over fieldstone with shingles (2 tiles, one storey).
- `tools/art-import/buildings.py` assembles a rectangle of whole kit tiles (floor, walls with doorways, hip roof) into one prop whose footprint is its tiles: `bldg-academy-hall` (6 x 3 tiles, 12.7 x 6.4 u), `bldg-academy-wing` (3 x 4), `bldg-barracks` (4 x 2), `bldg-shed` (2 x 2).
- In the game the hall's doors are a little taller than a wizard and its two storeys about 2.3 wizards, and the barracks' and shed's doors fit a person.
- Trade-offs: the kit facades are plain (window slits, no ornament), and the gatehouse now looks oversized. The old one-picture buildings stay registered as spares.

## How it's built

- `sim/src/yard.ts`: the stations as `w.yard` state. Markers in the level give the spots (`straw-0..3`, `heavy`, `heavy-ring`, `retreat`, `parry`, `parry-home`, `hands`, `hands-in-0..3`, `focus`, `gate`). Its two checkpoints are `?at=start` and `?at=focus`.
- New mode hooks:
  - `EnemyRules.restAt`: an enemy walks to a spot and stands, which is how the sparring soldiers wait.
  - `Mode.leaveTo`: the room the party is leaving for. `main.ts` switches to it, carrying the party.
- `client/src/art/extras.ts`: scenery people, from Markers whose id starts `x-`. They are drawn with the same rigs and frame cache and sorted with the bodies, so they cost the sim nothing.
- `client/src/yard-text.ts`: the stations' prompts. The words are placeholders for the user's script.
- The key caps gained the left mouse button and Sigil (D). The HUD's prompt box is now shared (`BannerKit.prompt`).
- Off-screen enemy markers ignore the yard's straw, sack and soldiers.

## Open, on the page

1. How much the stations say: the words and anything missing, such as a sign at the start.
2. The etched rule (Sigil only with Conjure) isn't built. With one Fire and one Sigil you could make a turret today.
3. Soldiers drawn in code rather than bought.

Also to judge in play: whether the walk between stations is the right length, whether the soldiers read as people at their size, and whether the garden and farm are worth the walk.
