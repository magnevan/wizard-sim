# The campaign sketch, and how to make maps and art at campaign scale (2026-11-06)

The user's high-level sketch for a campaign mode, the spell counts it asked for, and research on managing maps and assets across a whole campaign, with Claude's recommendations. The story itself is the user's (see the tutorial review decision); nothing here proposes lore.

## The user's sketch

- **Two tutorials.** Keep a compressed tutorial as a quick start. The campaign gets a longer learning path, and that's the focus.
- **Early game is low-rune and weapon-based.** Low rune in count, and not every element unlocked at once. Shield and Sigil are the candidates to lock out first, being the most complicated, with the most unique interactions. But they're what you need to make weapons, so "maybe we need some alternative there. Maybe a nerfed version in the start that only lets you create the weapons?"
- **A wizard academy.** Magicka 1 starts in one and leaves it fast *(unverified detail)*. Here it's where you learn weapon skills and the first elements, wrapped in the lore of taking classes. It's the first place to make assets for.
- **Assets need a structure.** Areas so far were hand-crafted and limited in scope; the campaign needs a way to manage maps and asset creation.

## How many spells there are, by element set

From the Atlas rules (`tools/spell-atlas/rules-c.js`), counted with a scratch script modelled on `depth-c.js`. A **spell type** is a cell: the lead element × the cast (Force, Area, Place, Self, Conjure). A **combination** is a distinct spell, counting which elements ride along.

| Elements unlocked | Spell types | Combinations, 2 queued | 3 queued | 5 queued |
|---|---|---|---|---|
| All 9 | 39 | 200 | 458 | 678 |
| No Sigil | 34 | 160 | 333 | 453 |
| No Shield | 34 | 160 | 333 | 453 |
| No Shield, no Sigil | 29 | 120 | 208 | 228 |
| Water, Fire, Cold, Earth | 17 | 45 | 63 | 63 |

- Locking Shield and Sigil removes 10 of the 39 types, but two thirds of the combinations at full queue (678 → 228). They lead long queues and change what follows them.
- **Queue length is a lever as strong as locking elements:** all nine elements with a 2-rune queue (200) is near seven elements with a full queue (228).
- **Conjure doesn't vanish without them:** with no lead Sigil or Shield, Conjure is the elemental burst in a cone (Fire burst, Freezing burst...).

**The weapons tension, and a proposal:** weapons need Sigil (Sigil + element → a blade) and guards need Shield. Unlock them in two stages:
1. **Conjure-only Sigil and Shield first.** Sigil and Shield queue normally but work only with Conjure: weapons and guards, five of their ten types. Their Force, Area, Place and Self (turrets, glyphs, walls, wards, Blink...) stay closed.
2. **A later class opens the rest.**

That makes weapons-first literal, and fits an academy ("you learn to conjure a blade before you learn to raise walls"). **Costs:** one more rule to read ("this rune only does one thing for now"), so the locked casts need a clear look in the HUD and the help panel. It also needs a per-cast lock in the sim (a small change: an unlock mask per seat, checked where the cast resolves).

## How the art has been made so far

Every pixel is drawn by code. There are no image files, and Claude doesn't generate images.
- `art/px.ts` and `art/kit.ts` plot pixels, lines, ellipses and rings into canvases, with colour ramps and Bayer dithering. Shapes are functions of parameters (facing, pose, seed, element), and characters are rigs with poses (`art/rigs.ts`).
- The results are cached into texture pages and shown with PixiJS.
- Claude checks each change by screenshotting it in headless Chrome.

It's about 5,900 lines. It stays on-palette and lets a spell's look follow its elements. Its limit: every new thing is programming work, and organic or ornate detail is slow.

## Research: managing maps and assets for a campaign

A research agent surveyed the field (2024–26 sources). Findings:

- **Editors.**
  - Tiled is mature: object layers, typed custom properties, JS scripting, CLI export ([docs](https://docs.mapeditor.org/)).
  - LDtk has typed entities and auto-layer rules ([ldtk.io](https://ldtk.io/docs/general/auto-layers)). Its catch for agents: the editor bakes the auto-layer tiles at save time, so an agent editing the JSON gets stale tiles until a human re-saves it in the editor.
  - Both store tiles as flat number arrays, which make unreadable diffs.
  - `@pixi/tilemap` v5 supports Pixi v8.
- **Text grids suit agents best.**
  - Spelunky's rooms were 80-character strings ([tutorial](https://www.tinysubversions.com/2010/01/tutorial-modding-spelunkys-level-generator/index.html)).
  - The Word2World paper has an LLM write maps as character rows, checks them in code (row lengths, A* reachability) and repairs them in rounds ([arXiv 2405.06686](https://arxiv.org/pdf/2405.06686v1.pdf)). That's the loop this repo already runs with screenshots and audits.
- **Procedural.** Enter the Gungeon hand-crafts rooms and stitches them along pre-authored flows ([Boris the Brave](https://www.boristhebrave.com/2019/07/28/dungeon-generation-in-enter-the-gungeon)). Spelunky uses room templates on a 4×4 critical path. Wave Function Collapse suits filler texture, not designed encounters. Our seeded deterministic RNG gives every peer the same stitched level.
- **Pixel-art pipelines.** The Aseprite CLI exports sheets per tag ([CLI](https://www.aseprite.org/cli/)).
- **AI pixel-art tools, 2025–26.**
  - PixelLab: tilesets, rotations, animation, style references, an API and an MCP server ([pixellab.ai](https://www.pixellab.ai/)).
  - Retro Diffusion: an API with palette constraints and reference images, about $0.18 per image at the top tier ([api-examples](https://github.com/Retro-Diffusion/api-examples)).
  - Their licences, and their quality against our style, are **unverified**.
- **Legal.** The US Copyright Office (Jan 2025) says prompt-only output isn't copyrightable; human-modified work can be ([copyright.gov](https://copyright.gov/newsnet/2025/1060.html)). Steam asks for an AI-content disclosure *(per a law-firm source, not checked against Valve)*.
- **Does code-drawn art scale?** Dead Cells rendered 3D models to pixel sprites with an in-house tool ([80.lv](https://80.lv/articles/case-study-dead-cells-character-art-pipeline/)): generator pipelines work. Code-drawn art scales well for things driven by game state (VFX, rigs, statuses) and for families of props. It scales badly for many unique set pieces.
- **Campaign-scale management.** A registry of stable asset IDs referenced by maps, with validators for missing and unused references.
- **No Git LFS:** GitHub Pages serves LFS pointer files, not the binaries ([issue](https://github.com/github/git-lfs/issues/1342)). Pixel PNGs are small enough for plain git.
- **Agent tooling is immature.** Tiled-AI is an MCP server that drives Tiled 1.12, Linux only. The Aseprite MCPs are early-stage. No LDtk MCP was found.

## Recommendation

**1. Our own text-first map format is the source of truth, not Tiled or LDtk.**
- A `.map.json` holds:
  - the size and cell;
  - a `legend` mapping one character per terrain type (floor, wall, pit, water, bramble...);
  - `terrain` as an array of strings, one per row;
  - `entities`, each with an id, a kind, x/y and typed props (spawns, gates, doors to `map:door`, triggers, props by asset ID);
  - free wall segments where the grid doesn't fit.
- Agents write it and diffs read line by line. The build does the autotiling, so nothing waits on an editor. An LDtk importer can come later if the user wants a GUI editor (about a session).

**2. One file feeds both the sim and the client.**
- A build step compiles each map to a room definition: the grid, walls merged from grid edges, and the entities.
- The sim imports that and never the art. `ROOM_DIMS` and `tutorial-data.ts`'s layout become generated.
- The client autotiles the same terrain into atlas frames.
- The compiled room's hash goes into the netcode handshake and the replay header, so peers on different map versions refuse to start instead of desyncing.

**3. Layout:**
```
game/content/
  style/palette.hex, style.md, refs/        the locked palette, style rules, reference sheets
  campaign.json                             the map graph: hub -> levels, unlocks, doors
  maps/academy/*.map.json
  templates/<biome>/*.room.json             chunks for procedural side levels
  tilesets/<biome>.tiles.json               terrain char -> autotile rules -> frames
  assets/<kind>/<id>/                       meta.json + one of: gen.ts | .png/.aseprite | ai/ (prompt, raw, final)
game/packages/content/                      schema, loader, compile, autotile, validators, bake
tools/map-viewer/                           a published page: every room rendered, a contact sheet per asset kind, ratings in its db
```

**4. Three art sources, one output:** every asset ends up as frames in atlases, referenced by ID.
- **Code-drawn stays the default.** VFX and rigs stay live. Static props and tiles are *baked*: today's generators run headlessly at build time into PNG atlases, with seeded variants.
- **Aseprite** once a human artist joins.
- **AI-generated as drafts only:**
  - constrained to our palette and references;
  - quantised to `palette.hex` and cleaned up;
  - prompt, raw and final kept in `ai/`;
  - provenance recorded in `meta.json`, for the Steam disclosure and copyright.

**5. Build ourselves:**
- `npm run content:check`:
  - the schema;
  - references both ways (missing and unused);
  - reachability from the entry to every exit;
  - no spawns in walls;
  - every PNG on the palette;
  - the atlas budget.
- A headless renderer that writes one PNG per room and a contact sheet per asset kind.
- The map-viewer page for ratings.

**6. Staged plan:**
1. **The format, proven on what exists:** port the Sanctum and Survive to `.map.json` with no visible change, plus `content:check`. About 2–3 sessions.
2. **The academy hub:** three or four connected rooms with doors between maps, and an "academy stone" tileset baked from code. The map viewer ships with it.
3. **An AI-art trial:** one prop set made three ways (code, PixelLab, Retro Diffusion) on a contact sheet the user rates. The ratings decide each asset kind's source.
4. **The first campaign levels by hand,** then stitched templates for optional procedural levels.

**Trade-offs:**
- **No GUI editor at first:** the user reviews in the viewer and its comments.
- **Grid-aligned levels:** they suit autotiling and lose some of today's freeform layout; free segments are the escape hatch.
- **Baking adds a build step.**
- **AI art costs money,** needs licence checks and a cleanup pass, isn't copyrightable raw, and is untested against our style.

## Open questions for the user

Each has Claude's recommendation; unanswered means it stands.

1. **Early Sigil and Shield: conjure-only first?** Recommendation: yes, as above.
2. **"Low rune": lock elements, cap the queue, or shrink pools?** Recommendation: a mix. Start with a few elements and small pools (2 runes each), and grow pools and queue length as classes are passed. Queue length cuts complexity as much as locked elements do, and it's easier to grow gradually.
3. **Our own text map format,** with an LDtk importer only if you want to paint maps yourself? Recommendation: yes.
4. **Start with stage 1** (port the existing rooms) before any academy art? Recommendation: yes. It's invisible work, but it decides how every map after it is made.
5. **Try AI pixel-art tools** in stage 3? It needs an account and a small budget (tens of dollars), and the licences need reading first. Recommendation: yes, as a rated comparison, not a commitment.
6. **Generic academy pieces** (stone halls, a courtyard, a training yard, lecterns, shelves, targets, robed figures on the wizard rig) can be built before the story. Recommendation: build them in stage 2, kept free of lore.
