---
status: raw
pillars: [1, 5]
related: [../explorations/2026-11-02-what-i-like.md, ../explorations/2026-11-02-feedback-round-1.md]
---

# Character progression

## One-liner
Progression that deepens a playstyle rather than inflating numbers, while allowing some real power unlocks (like Magicks).

## Directions the user likes
- Gradual trade-offs that lean into a preferred playstyle (e.g. stronger beams but slower movement).
- Growth that lets you *do more at once* (more spells sustained, a longer queue, more concurrent wards).
- *Warm-up* growth within a session or fight: you get faster or stronger as you play well.
- Unlockable special spells (Magicka's Magicks).

## Sketch tied to the spell tree (Claude, 2026-11-03, unreviewed)
Proposal A creates natural progression knobs that widen options without inflating damage:
- **Vessel capacity:** more staff slots, more simultaneous glyphs, a larger orbital cap. This means "doing more at once" literally.
- **New vessels and triggers:** loaded blow, line glyphs, or auto-triggers unlocked over the campaign instead of all at once. This teaches the tree gradually, like discovering Magicka's spell shapes.
- **Magick tomes:** as in Magicka. Named special spells (Resurrect ritual, Clone, co-op Magicks), which give real power and fit softened pillar 1.
- **Warm-up within a fight:** an *attunement* meter that fills while you land combos (wet → freeze, surge, alpha strike) and decays slowly, slightly speeding up seal/release and casting. It rewards playing well right now, not grinding.
- **Leaning into a style:** staffs or robes as sidegrades that bend one rule. "Your glyphs arm instantly but you hold only 2", "beams are wider but you move slower while channelling".

*(Since then: proposal C replaced A, so vessels and staff slots don't exist; the Loaded Blow was rejected ([Round 3](../decisions/README.md#2026-11-03-round-3-see-explorations2026-11-03-feedback-round-3md)); and depth-gated pools are deferred ([Resources and battlefield](../decisions/README.md#2026-11-03-resources-and-battlefield-see-explorations2026-11-03-resources-and-battlefieldmd)). The Sigil pool's depth already works as "do more at once": each device binds a Sigil rune.)*

## Rejected
Flat +X% damage as the main axis.

## Open questions
- Is warm-up per fight, per level, or per session?
- How do trade-offs avoid making co-op partners incompatible?

## Where it stands (2026-11-05)
No campaign progression is built. Survive's power-ups are the only growth in the game, and they're run-scoped, not kept: see `survive-mode.md`. Its "Where the pillars push back" notes (`../explorations/2026-11-05-survive-mode.md`) are the current thinking on flat numbers versus pillar 1.
