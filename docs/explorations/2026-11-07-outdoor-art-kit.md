# The outdoor art kit (2026-11-07)

The user wants more tilesets and assets ready for map generation, with an early sword lesson held outside: grass, paths, flowers and rocks, fences, training dummies, and plenty of other outdoor things so the world feels rich.

No generation calls were made. The purchase list is on [the Outdoor Art Kit page](https://claude.ai/artifact/QNKgjigTb14KmCe8mod1kT), waiting for sign-off; `tools/outdoor-kit/briefs.json` holds it word for word.

## What a player sees

You walk down a dirt path to a fenced yard. Dummies stand in rows on bare, trampled earth, a teacher waits in the middle, and the grass around the yard wears thin where people walk. Past the fence are trees, drifts of flowers and an old stump. A partner sees the same yard, and in co-op you'd each take a dummy.

## What the mock found

**Flat ground doesn't need isometric tiles.** `tools/outdoor-kit/yard.py` keeps one terrain map and paints each screen pixel by looking the map up through the camera. The same map came out clean under the true isometric camera and today's. Paths wander, and no grid shows. Only art with a grid in it, such as flagstones, would depend on the camera.

The trade-off: the game needs a new floor painter and a Ground layer in LDtk, and textures have to tile without visible repeats. In exchange, there's no tile for every bend, and a map generator only has to write a terrain value per cell. That's a simpler job than choosing autotiles.

**The trial plan rules out PixelLab's isometric tools.** Its help says `create_tiles_pro`, `create_path_tiles`, `create_building_kit` and pro tilesets need Tier 1. That's from the help agent, not from trying a call. The list uses standard tilesets, object sheets and map objects instead.

**We already own the lesson's main props.** The training dummy, target and weapon rack are in the registry. Local variants add worn, scorched and mossy dummies, a weathered target and a mossy rack. Scorched is the strongest. The mossy rack is the weakest, because the moss also covers the gems and blades.

**Scale shows more outdoors.** Dummies stand taller than the wizards, and the teacher taller still. In a sword lesson you stand beside them, so the open prop scale question matters more here.

## The purchase list

| Job | Tool | Generations | Yields |
|---|---|---|---|
| Ground textures | `create_topdown_tileset`, standard, 32 px | 3 | Grass with dirt, cobble and water |
| Small scatter sheet | `create_1_direction_object`, 32 px | 10 | 64 flowers, weeds, stones, fungi, marks, dropped things, small animals |
| Yard and countryside sheet | `create_1_direction_object`, 48 px | 10 | 16 fences, sword lesson props, larger countryside props |
| Two trees | `create_map_object` | 2 | An oak and a pine |

That's all 25 generations available today (20 plus the daily bonus of 5). Prices are from the tool descriptions and help, not yet checked against the balance. Mirroring gives the fence's other direction, and recolouring gives autumn and dead trees.

Risks to check as we go: 32 px sprites may be too small to show the style; a sheet may not hold a fence's diagonal; and a fence section may not join its neighbour. Buy one tileset first and look at it.

## The paid plan

The user offered to buy the plan. Per PixelLab's help: Apprentice is $12 a month for 2,000 generations, Artisan $24 for 5,000, Architect $50 for 10,000. Unused generations don't roll over, and cancelling leaves access until the period ends. Nothing on the list needs it, but it's 80 times what's available today. It would change how we work: several tries at a sheet, painted pro ground, and no rationing. Sign-off on descriptions still applies, and the "keep every result" rule stays.

## Open questions, each with a recommendation

On the page; an empty box means the pick stands. The purchases don't default: they wait for a mark.

1. **`q-1-ground`: paint the ground from a terrain map?** Yes.
2. **`q-2-camera`: buy before the isometric test?** Yes. The risk is one fence.
3. **`q-3-scale`: dummies against wizards.** Shrink props about a quarter in the isometric room, and judge it there.
4. **`q-4-missing`: anything missing?** The lists as they stand.
5. **`q-5-plan`: the paid plan?** Worth it in a month when we'll make a lot of art. The user's call.
