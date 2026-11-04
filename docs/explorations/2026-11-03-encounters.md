# 2026-11-03: Enemies and encounters that ask spell questions

Written by Claude while the user was away. It follows from two pillars: **every shape needs a situation where it is the best answer** (pillar 7) and **room to think** (pillar 4). If spells are answers, enemies and encounters are the questions. This is a proposal for the user to react to.

## Principle
Each enemy archetype poses one readable question, and the spell tree (proposal A) should contain at least one clearly best answer to it. If a spell answers no enemy's question, it's a candidate to cut. If an enemy has no good answer, the tree has a gap.

## Enemy roster (archetypes)

| Archetype | The question it asks | Best answers in the tree |
|---|---|---|
| **Swarmers**: many small, fast, weak | "Can you hit many at once?" | Area nova, spray, **Tidal Wave**, **rune at a chokepoint**, Surface Surge on a flooded floor |
| **Brute**: big, slow, telegraphed slam (about 1 s wind-up) | "Can you deal sustained damage, and protect the friend it targets?" | Beam (through a **Lens** with an ally), full-charge rock (**Pinning Javelin**), **Ward Toss** or **Lantern** timed on the slam |
| **Shieldbearer**: blocks frontal projectiles and beams | "Can you go around?" | **Ice shards bouncing** off walls (Ricochet), **Geyser** under it (Point), a flanking ally |
| **Back-line caster**: hides behind brutes, shoots from range | "Can you reach past the front?" | **Yank** it out (Point + Arcane on an enemy), Point casts, a lightning arc chaining past |
| **Lane chargers**: a line rushing down a corridor | "Can you hit a line?" | **Fault Line**, **Tidal Wave**, **Tripwire** laid in the lull |
| **Grabber**: snatches a player and drags them away | "Can you rescue?" | **Yank** the ally back, damage the grabber (it lets go) |
| **Elementals**: resistant to one element, weak to another (fire imp, water slime) | "Do you read the battlefield?" | Element choice: steam vs. fire imps, lightning vs. wet slimes |
| **Burrowers**: arrive from visible holes on a known beat | "Did you prepare?" | **Runes** on the holes, **Orbitals** banked in advance, **Alpha Strike** |
| **Totem / healer**: a stationary support enemy that heals or shields others | "Can you prioritise?" | Point blast, Lens beam, Yank its protectors away |
| **Reflector**: a mirror enemy that bounces your beams and projectiles | "Can you switch forms?" | Area, Weapon lines and Point casts, which don't travel *through* the mirror |

Ten archetypes cover every keep and most maybes. **Gaps spotted:** none for the keeps. Sustained Circle and Healing Orbitals need *sustained pressure* (long fights) to shine, which argues for waves, not one-shot rooms.

## Encounter rhythm
Magicka was mostly continuous pressure. For pillars 4 and 7, encounters alternate:
1. **Lull (5–15 s):** the next wave is *visible*: horns, portals opening, burrow holes rumbling, all telegraphed. This is the window for runes, orbitals, stored spells, walls and lenses.
2. **Wave:** a mix of 2–3 archetypes so the questions overlap (a brute plus a back-line caster, swarmers plus a grabber). Overlap is what creates co-op roles: one player holds the front while the other handles the back line or rescues.
3. **Breather:** a short pause after the wave. Dead players come back here (the "out until the wave ends" death rule), and a **Resurrect ritual** Magick can bring someone back early at a cost.

Preparation is rewarded, never required: every wave can be won on the fly, but a prepared team wins it cleaner, which is pillar 7's "rewarded, not mandatory".

## Arena features (recurring, not gimmicks)
Pillar 6 wants a reproducible playstyle, so features should be a small, *recurring* vocabulary rather than per-level gimmicks:
- **Chokepoints** (rune and tripwire territory)
- **Water** (puddles and ponds: surge, freeze, bridge)
- **Grass** (burns)
- **Walls and pillars** (ricochet angles, cover from casters)
- **Holes and portals** (where waves come from, which lets players prepare)

## Pace knobs, to tune in the prototype
- Enemy move speed at roughly 70–80% of Magicka's, with a slightly zoomed-out camera (the user's note).
- Telegraph wind-ups of 0.6–1.2 s on everything dangerous, so support timing (ward, lantern, yank) is a skill and not a reflex.
- Fewer, tougher enemies per wave than Magicka. The challenge comes from overlapping questions, not volume.

## Prototype implications
The skeleton's Arena room has only chasers right now. The next useful step: add **Brute**, **Back-line caster** and **Swarmers**, plus a lull/wave rhythm, and see whether Point and Seal/Release get used naturally. That would answer a sharp prototype question: *"Do players prepare during lulls if the next wave is telegraphed?"*

## Questions for the user
1. Does the "enemies ask questions" framing match how you want to design fights?
2. Lull length: is 5–15 s enough to prepare without getting bored?
3. Should waves be authored (fixed per level) or drawn from a pool (roguelite-ish)?
