# Dressing with variation from few meshes

2026-11-24. The user, before the courtyard's dressing: "before you go and make the meshes, please think of a good way to solve some of this more generically and have a lot of variation with less meshes." Thread: [the courtyard on the kit](../threads/kit-courtyard.md). Status: proposed; step 1 (no meshes) started.

## The problem

The paint-overs ([plaza](../reference/court-kit/court-plaza-paintover.png), [whole court](../reference/court-kit/court-whole-paintover.png)) dress the courtyard with urns and lanterns on posts, flower boxes, planters with small trees, banners, lamps along the roads, benches. Made one by one as Meshy models and placed by hand, that is dozens of meshes and hundreds of placements per place, and every new place repeats it.

## The approach: four ideas

1. **Sockets on the pieces we have.** Kit pieces declare attachment points: a pier's or newel's cap, a wall's bracket, a flight's head and foot flanks, a building's door flanks and sills. Small toppers fill sockets, so dressing lands on the architecture by rule. The courtyard already has about 300 piers and newels: a handful of toppers (urn, gold ball, lantern, small statue) dress all of them.
2. **Combine parts instead of whole objects.** A planter is a pot plus a plant (3 pots × 4 plants = 12), a flower box a box plus flowers (2 × 3), a lamp a post plus a lantern (2 × 2). Banners are one cloth mesh with an emblem texture, in the seven element colours of the plaza's channels: each banner can point toward its element's stop. One mesh and seven free Codex textures instead of seven models.
3. **Variation per instance, never new meshes.** Scatter and socket instances get a seeded scale (±15%), turn, and a hue/brightness shift from a small palette per piece (oak greens to autumn gold, blossom violet to pink, pots terracotta to sandstone). It tints the painted textures; nothing is drawn in code ([no code-drawn art](../decisions/README.md)).
4. **Dressing as rules, not placements.** A `dress` object (like `scatter`) applies a named style to a level or the scene. A style is data in `kit.json`, for example "courtyard formal": an urn on every third parapet pier, a lantern every 8 u along roads, a pair of planters at each flight's head, lamps and a banner at each building's door, benches along parapets that look over a drop. The yard and the infirmary reuse styles with another seed or a sparser variant; the editor shows the rule and a "new seed" button, as for scatters.

## Cost and trade-off

About ten small part meshes (toppers, pots, plants, flower boxes, a lamp post and lantern, a cloth) and seven free emblem textures: about 150 Meshy credits at smart topology, covering most dressing for the opening's places. Rule-placed dressing can look samey up close; the answer is per-instance overrides (pin a spot in the editor, drop a rule's instance or place a one-off) rather than more rules.

## Order

1. Compiler, no meshes: sockets in `kit.json`, the `dress` object with one style, seeded variation fields on instances; stand-ins first, so placement is judged before modelling.
2. The Map Editor session: per-instance tint and scale in the renderer, `dress` in ops and an inspector.
3. Meshes (Codex, then Meshy): toppers and planters first.
