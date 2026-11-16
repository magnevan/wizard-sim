# Campaign map generation pipeline

Proposed 2026-11-16. Use this alongside the brief, space diagram and blockout stages of the [campaign workflow](../campaign/README.md).

## From world map to playable map

1. **Write a short regional brief.** Pull the relevant biome, terrain, landmarks and established relationships from the world map and [canon](../campaign/canon.md). Record what each area needs to do for the player. Mark uncertain details as playtest assumptions.
2. **Draw the connections first.** Use the segment's space diagram to show routes, gates, branches and where players enter and leave each area. Then rough in footprints, terrain and distances in plan view. Give each area its gameplay brief, the relevant regional constraints and its connections to neighbours. Revisit the regional plan when a local idea changes a shared route.
3. **Build and play a blockout.** Author playable geometry in LDtk, using a small script where repeatable generation helps. Preserve hand-placed encounter markers and regions on regeneration. Run `npm run content:build` and `npm run content:check` from `game/`, then walk the route with the actual isometric camera. Revise distances, sightlines and encounter space from the playtest. See the [LDtk content guide](../../game/content/README.md).
4. **Use concept art to explore the look.** A loose brief can guide early images of terrain, architecture and landmarks while the layout develops. Bring promising ideas back to the space diagram if they affect routes or geography. When a scene needs a reference that matches the playable space, start with a screenshot from the blockout to guide local art and dressing.

## First prototype

- **Academy to Battery.** The Academy sits on an Arcane vein, and visible rifts are a regional landmark. Sketch how the campus and paths sit in the broken terrain and what visually ties the Academy to the field infrastructure at the Battery. See the [world map notes](2026-11-08-fantasy-map-round-3.md).
- **First sketch.** Place the Academy grounds, an outdoor stretch and the existing Battery footprint. Mark two possible branches to future teaching sites with open destinations. The Battery footprint felt about right in review, and the drill yard felt too small. See the [opening's scale notes](../campaign/01-opening/space.md).
- **First playable pass.** Try the route as one walkable LDtk level while continuous-world support is deferred. Use the existing fire-turret encounter as the destination. Time the walk, check when the wall comes into view, and try the approach and arrival solo and with four players. Revisit the routes when the remaining element lessons are defined. See the [continuous-world notes](2026-11-09-continuous-world-todo.md) and [Battery encounter notes](2026-11-13-encounters-as-data.md).
